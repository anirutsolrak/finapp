# Planejamento Unificado — Design Spec

**Data:** 2026-05-17
**Autor:** Carlos + Claude
**Status:** Aprovado para implementação

## Contexto e motivação

Hoje o FinAPP tem duas páginas com função essencialmente sobreposta:

- **Planejamento** (`/budget`, `BudgetPage.jsx`) — cadastra `budget_items` (gastos planejados recorrentes/únicos por mês).
- **Agenda de pagamentos** (`/bills`, `BillsPage.jsx`) — lista `bills` (lembretes datados, marcar pago/pendente).

O modelo de dados já reflete a relação real: `bills.budget_item_id` aponta pra `budget_items.id` com unique constraint `(budget_item_id, month_ref)`. Uma bill é uma instância datada de um item planejado. A divisão em duas páginas é legado de UI, não arquitetura.

**Problema operacional:** marcar uma bill como paga hoje só flipa `is_paid`. Nenhuma `transaction` é criada automaticamente. O usuário precisa lançar manualmente a despesa em outra tela — fluxo quebrado.

**Objetivo:** unificar as duas páginas em `/budget` (mantendo nome "Planejamento"), e fazer "marcar pago" criar a `transaction` correspondente atomicamente.

## Escopo

**Inclui:**
- Migration de schema (2 colunas novas, nenhuma removida; possível ajuste de FK existente)
- Triggers Postgres pra materializar bills automaticamente
- 2 RPCs (`pay_bill`, `unpay_bill`) com atomicidade
- Refatoração da UI de `BudgetPage` pra incluir status do ciclo + ações de pagamento
- Remoção de `BillsPage`, rota `/bills`, item de sidebar
- Recovery de dados recorrentes do backup `backup_2026_05_14.bills` (sub-projeto B, independente)

**Fora de escopo:**
- Alterações em Dashboard, Lançamentos, Lista, Metas, Assistente IA, Configurações
- Mudanças no `budgetEngine.js` (computeBucketSnapshot/computeReservaSnapshot ficam idênticos)
- Lembretes/notificações push (`alert_days_before` continua só como dado)
- Recovery de bills esporádicas do backup (user cria à mão se precisar)

## Decisões de design

Vide brainstorming (2026-05-17, conversa Claude):

1. **Marcar pago abre modal mínimo** (conta + valor real + data pré-preenchidos) → confirma → cria tx. Lápis inline depois reabre esse modal pra editar.
2. **Conta da tx vem do modal** (sempre confirmar) — `budget_items` ganha `default_account_id` opcional que pré-seleciona o dropdown.
3. **Lembretes avulsos** = `budget_items` com `recurrence='once'`. Sem conceito separado.
4. **Bills materializadas via trigger Postgres** ao tocar item ou criar ciclo.
5. **Desmarcar pago deleta tx vinculada** via `transactions.bill_id` FK.
6. **Item editado com bill paga: trigger pula UPDATE** (preserva histórico). User edita tx direto se quiser ajustar.

## Arquitetura

### Schema (migration_unified_planning.sql)

```sql
-- Vincula tx criada pelo "marcar pago" à bill de origem (pra undo limpo).
ALTER TABLE transactions
  ADD COLUMN bill_id uuid REFERENCES bills(id) ON DELETE SET NULL;
CREATE INDEX idx_tx_bill_id ON transactions(bill_id);

-- Conta default opcional do item planejado (resolve ambiguidade NuBank vs PicPay).
ALTER TABLE budget_items
  ADD COLUMN default_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
```

**Pré-condição a verificar antes de aplicar:** FKs `transactions.account_id`, `bills.account_id` (se existir) devem ser `ON DELETE SET NULL` (não `CASCADE`). Se estiverem como CASCADE ou sem regra, a migration precisa incluir `DROP CONSTRAINT ... ADD CONSTRAINT ... ON DELETE SET NULL` antes de prosseguir. Plan de implementação confirma isso na Onda A.

### Triggers (mesma migration)

#### 2.1 `materialize_bills_for_item(item_id)`
Função que insere/atualiza bill do ciclo atual a partir de um `budget_item`:
- Busca item ativo (early return se não ativo ou não existe)
- Busca ciclo cuja janela `[start_date, end_date]` contém `CURRENT_DATE`
- Calcula `due_date` = `make_date(ano_ciclo, mes_ciclo, LEAST(due_day, 28))` — evita 31/fev
- INSERT ... ON CONFLICT (budget_item_id, month_ref) DO UPDATE — **mas só quando `is_paid=false`** (preserva histórico)
- `recurrence='once'` materializa só no ciclo atual e nunca renova

```sql
CREATE OR REPLACE FUNCTION materialize_bills_for_item(p_item_id uuid)
RETURNS void AS $$
DECLARE
  v_item RECORD;
  v_cycle RECORD;
  v_due_date date;
BEGIN
  SELECT * INTO v_item FROM budget_items WHERE id = p_item_id AND active = true;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_cycle FROM budget_cycles
    WHERE CURRENT_DATE BETWEEN start_date AND end_date LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  v_due_date := make_date(
    EXTRACT(year FROM v_cycle.start_date)::int,
    EXTRACT(month FROM v_cycle.start_date)::int,
    LEAST(COALESCE(v_item.due_day, 15), 28)
  );

  INSERT INTO bills (user_id, budget_item_id, name, amount, due_date, is_fixed, recurrence, alert_days_before)
  VALUES (v_item.user_id, v_item.id, v_item.name, v_item.planned_amount, v_due_date,
          v_item.is_fixed,
          CASE WHEN v_item.recurrence = 'once' THEN 'none' ELSE v_item.recurrence END,
          3)
  ON CONFLICT (budget_item_id, month_ref) DO UPDATE
    SET amount = EXCLUDED.amount, name = EXCLUDED.name, due_date = EXCLUDED.due_date
    WHERE bills.is_paid = false;
END;
$$ LANGUAGE plpgsql;
```

#### 2.2 Trigger no `budget_items`
```sql
CREATE OR REPLACE FUNCTION trg_item_materialize() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.active = true THEN PERFORM materialize_bills_for_item(NEW.id); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER materialize_on_item_change
  AFTER INSERT OR UPDATE ON budget_items
  FOR EACH ROW EXECUTE FUNCTION trg_item_materialize();
```

#### 2.3 Trigger no `budget_cycles`
Ao criar ciclo novo, materializa bills pra todos os items ativos não-once:
```sql
CREATE OR REPLACE FUNCTION trg_cycle_materialize() RETURNS TRIGGER AS $$
DECLARE v_item RECORD;
BEGIN
  FOR v_item IN SELECT id FROM budget_items WHERE active = true AND recurrence != 'once' LOOP
    PERFORM materialize_bills_for_item(v_item.id);
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER materialize_on_cycle_change
  AFTER INSERT ON budget_cycles
  FOR EACH ROW EXECUTE FUNCTION trg_cycle_materialize();
```

### RPCs (atomicidade pay/unpay)

```sql
CREATE OR REPLACE FUNCTION pay_bill(
  p_bill_id uuid, p_account_id uuid, p_amount numeric, p_date date,
  p_payment_source text, p_category_id uuid, p_budget_item_id uuid
) RETURNS uuid AS $$
DECLARE v_tx_id uuid; v_user_id uuid; v_name text;
BEGIN
  SELECT user_id, name INTO v_user_id, v_name FROM bills WHERE id = p_bill_id;
  INSERT INTO transactions
    (user_id, type, amount, date, account_id, payment_source, category_id,
     budget_item_id, bill_id, description)
  VALUES
    (v_user_id, 'expense', p_amount, p_date, p_account_id, p_payment_source,
     p_category_id, p_budget_item_id, p_bill_id, v_name)
  RETURNING id INTO v_tx_id;
  UPDATE bills SET is_paid = true, paid_at = now() WHERE id = p_bill_id;
  RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION unpay_bill(p_bill_id uuid) RETURNS void AS $$
BEGIN
  DELETE FROM transactions WHERE bill_id = p_bill_id;
  UPDATE bills SET is_paid = false, paid_at = NULL WHERE id = p_bill_id;
END;
$$ LANGUAGE plpgsql;
```

### API surface (`src/lib/db.js`)

```js
// NOVA
export const payBill = ({ billId, accountId, amount, date, paymentSource, categoryId, budgetItemId }) =>
  supabase.rpc('pay_bill', {
    p_bill_id: billId, p_account_id: accountId, p_amount: amount, p_date: date,
    p_payment_source: paymentSource, p_category_id: categoryId, p_budget_item_id: budgetItemId,
  })

// NOVA
export const unpayBill = (billId) =>
  supabase.rpc('unpay_bill', { p_bill_id: billId })

// ATUALIZADA: upsertBudgetItem ganha campo default_account_id (sem mudança de assinatura — só passa pelo `...data`)
// REMOVIDA: markBillPaid — todos os callers passam pra payBill/unpayBill
// AJUSTADA: deleteBudgetItem — DELETE bills WHERE budget_item_id=id AND is_paid=false;
//                              UPDATE bills SET budget_item_id=NULL WHERE budget_item_id=id AND is_paid=true
```

### UI — `BudgetPage` unificada

**Estrutura:**

```
┌─ Planejamento ──────────────────────── [+ Novo item] ─┐
│  ┌─ Resumo do ciclo ─────────────────────────────┐    │
│  │ Total planejado   Pago         Pendente       │    │
│  │ R$ 2.450,00       R$ 850,00    R$ 1.600,00    │    │
│  └───────────────────────────────────────────────┘    │
│  [Todos] [Pendentes] [Pagos]                          │
│                                                       │
│  ▸ Renda (bucket) ────────────── R$ 1.200 planejado  │
│    ○ Aluguel              R$ 700  vence em 3d  [✓][✎]│
│    ✓ Internet             R$ 130  pago em 12/05 [✎] │
│  ▸ Crédito (bucket) ──────────── R$ 1.250 planejado  │
│    ○ Fatura NuBank        R$ 800  vence em 5d  [✓][✎]│
│  ▸ Únicos (recurrence=once) ──── R$ 0 (vazio)        │
└───────────────────────────────────────────────────────┘
```

**Componentes novos / atualizados:**
- `PlanningHeader` — total planejado + pago + pendente do ciclo (calculado a partir das bills materializadas)
- `StatusFilter` — chips Todos / Pendentes / Pagos (state local)
- `BucketSection` — agrupa por `payment_source` bucket (renda / crédito / únicos), colapsável, mostra subtotal
- `PlanItemRow` — linha unificada: checkbox (toggle pago) + nome + tags + status + valor + lápis
- `PayBillModal` — modal mínimo: conta (select, default = `item.default_account_id` ou primeira matching `payment_source`), valor (default = `bill.amount`), data (default = hoje), botões Cancelar/Confirmar
- `ItemEditModal` — refator do existente: ganha select `default_account_id` filtrado por compatibilidade com `payment_source` do item

**Rotas:**
- `/budget` mantida
- `/bills` removida de `App.jsx` (router) e `Layout.jsx` (sidebar)
- `BillsPage.jsx` deletada

**Hook novo (`useBudget` em `useData.js`):**
- Carrega `budget_items` + `bills` do ciclo atual numa query só (ou em paralelo)
- Junta no client: cada item tem `item.bill` (a bill do ciclo, se existe)
- Realtime subscription em `budget_items`, `bills`, `transactions`

`useBudgetItems` e `useBills` continuam exportados (usados em Dashboard e outros lugares).

## Error handling e edge cases

1. **Item editado com bill paga** — trigger pula UPDATE (`WHERE bills.is_paid = false`). User edita tx direto via lápis.

2. **Item deletado** — `deleteBudgetItem` agora distingue bills pagas (preserva, `budget_item_id=NULL`) vs não-pagas (deleta).

3. **Conta deletada com bills/tx** — FKs `ON DELETE SET NULL`. Confirmar no review de migrations.

4. **`payBill` falha no meio** — atomicidade pela função plpgsql (BEGIN/COMMIT implícito). Erro → UI mostra toast, estado consistente.

5. **Múltiplas contas com mesmo `payment_source` e sem `default_account_id`** — modal abre com select vazio, botão "Confirmar" disabled enquanto não escolher.

6. **Ciclo muda enquanto user tem página aberta** — realtime no canal `budget_cycles` invalida `useBudget`.

7. **Item `recurrence='once'` em ciclos seguintes** — trigger não materializa de novo (filtro `recurrence != 'once'` no `trg_cycle_materialize`). Esperado.

8. **`due_day = 31`** — `LEAST(due_day, 28)` em `materialize_bills_for_item`. Para casos especiais (cartão dia 30), aceita-se o desvio — não vale complexidade.

## Testes

- **`budgetEngine.test.js`** — sem mudanças (engine intacto)
- **`db.test.js` (novo)** — mock supabase client; valida `payBill`/`unpayBill` chamam RPC com payload correto; `deleteBudgetItem` segrega bills pagas vs não-pagas
- **`BudgetPage.test.jsx` (opcional)** — RTL: render lista, click checkbox abre modal, confirma chama `payBill`
- **SQL não tem unit test** — validação manual no fluxo dev:
  1. Criar item → bill aparece na lista
  2. Marcar pago → tx aparece em Lançamentos, bill mostra "pago em DD/MM"
  3. Desmarcar pago → tx some, bill volta a pendente
  4. Editar valor planejado do item → bill (não-paga) atualiza
  5. Criar ciclo novo → bills aparecem automaticamente pros items monthly/yearly

## Sub-projeto B — Recovery do backup

**Independente do principal**, pode rodar antes ou depois.

```sql
-- Recovery dos recorrentes (nome repetido em ≥2 meses no backup)
INSERT INTO budget_items (user_id, name, planned_amount, payment_source, recurrence, due_day, is_fixed, active, category_id)
SELECT
  '49d01efc-e309-49be-98f2-684d0d4548e2'::uuid,
  initcap(lower(min(b.name))),
  avg(b.amount)::numeric(10,2),
  CASE WHEN min(b.name) ILIKE '%fatura%' THEN 'credit' ELSE 'fixed_income' END,
  'monthly',
  max(EXTRACT(day FROM b.due_date))::int,
  true,
  true,
  NULL
FROM backup_2026_05_14.bills b
GROUP BY lower(b.name)
HAVING count(*) >= 2;
```

User confere a lista resultante na UI e ajusta `category_id` + `default_account_id` (ambos NULL na importação). Esporádicos do backup: ignorados (user cria à mão).

**Estimativa:** ~12 items importados.

## Rollout

**Ordem das ondas** (cada uma compila/deploya independente):

1. **Onda A — Migration + RPCs** (`migration_unified_planning.sql`)
2. **Onda B — `db.js`** (payBill, unpayBill, ajuste deleteBudgetItem)
3. **Onda C — Hook + Componentes** (useBudget, PlanItemRow, PayBillModal, BucketSection)
4. **Onda D — Refator BudgetPage + remoção BillsPage** (rota, sidebar, deleta arquivo)
5. **Onda E — Recovery do backup** (script SQL, isolado)

**Risco:** baixo. Mudanças aditivas no schema. UI removida (BillsPage) já tinha mensagem indicando que Planejamento é o entry point.

**Reversão:** drop dos 2 triggers + drop das 2 RPCs + ALTER TABLE drop column (`bill_id`, `default_account_id`). Bills/items inalterados.

