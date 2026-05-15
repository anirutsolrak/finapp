# Onda 3 — Multi-conta

**Data:** 2026-05-14
**Branch:** `auditoria-features`
**Status:** Spec aprovado, aguarda implementação

## 1. Contexto e problema

Hoje o app usa `payment_source` (fixed_income / variable_income / credit / reserve) pra classificar tx, mas isso **não distingue qual conta concreta** está envolvida. Problemas reais do usuário:

- Tem 3 fontes de crédito distintas (NuBank cartão, PicPay cartão, Biplay empréstimo) — todas viram `payment_source='credit'` sem separação
- PicPay tem 3 plásticos compartilhando a mesma fatura
- Esposa recebe aluguel esporádico (variável) e quer rastrear gastos separadamente (envelope virtual)
- Biplay tem semântica de empréstimo: puxa valor pra conta, devolve com juros mês seguinte
- Transferência entre contas próprias (pagar fatura, pegar Biplay) hoje vira tx tipo `transfer` sem indicar de onde pra onde

User + esposa **vão configurar tudo de novo amanhã (15/05)**: novo ciclo começando, lançar gastos fixos do zero. Reset clean.

## 2. Decisões tomadas no brainstorming

| Decisão | Escolha |
|---|---|
| Contas no escopo | 5 contas: NuBank Conta Corrente, NuBank Crédito, PicPay Crédito, Biplay, Aluguel (envelope da esposa) |
| `payment_source` | **Continua existindo** — representa bucket conceitual (fixed_income/variable_income/credit/reserve). `account_id` representa conta concreta |
| Transferência entre contas | 1 tx única `type=transfer` com `from_account_id` + `to_account_id` |
| Juros Biplay | 1 tx única (transfer total com juros embutidos, sem separar) |
| Gerenciamento de contas (UI) | Nova seção em `/settings` |
| Migração de dados antigos | **Wipe total** após backup em schema separado |
| Bills (tabela) | Sem mudança nesta onda — fica pra futuro |
| Dashboard | Sem mudança nesta onda — fica pra futuro |
| PicPay multi-plástico | Não modelado — 1 só account `PicPay Crédito` |

## 3. Escopo

### 3.1 Migrations SQL (3 novas, na ordem)

**`migration_backup_pre_onda3.sql`** — preserva dados antes do wipe:

```sql
-- Backup das tabelas antes do wipe da Onda 3 (multi-conta).
-- Schema separado pra preservar histórico sem poluir public.
CREATE SCHEMA IF NOT EXISTS backup_2026_05_14;

CREATE TABLE backup_2026_05_14.transactions  AS SELECT * FROM public.transactions;
CREATE TABLE backup_2026_05_14.bills         AS SELECT * FROM public.bills;
CREATE TABLE backup_2026_05_14.budget_items  AS SELECT * FROM public.budget_items;
CREATE TABLE backup_2026_05_14.budget_cycles AS SELECT * FROM public.budget_cycles;
CREATE TABLE backup_2026_05_14.goals         AS SELECT * FROM public.goals;
```

**`migration_wipe_pre_onda3.sql`** — limpa dados (rodar SÓ depois do backup confirmar sucesso):

```sql
-- Wipe das tabelas do usuário Carlos (id 49d01efc-e309-49be-98f2-684d0d4548e2).
-- Pré-condição: migration_backup_pre_onda3.sql aplicada com sucesso.
DELETE FROM transactions  WHERE user_id = '49d01efc-e309-49be-98f2-684d0d4548e2';
DELETE FROM bills         WHERE user_id = '49d01efc-e309-49be-98f2-684d0d4548e2';
DELETE FROM budget_items  WHERE user_id = '49d01efc-e309-49be-98f2-684d0d4548e2';
DELETE FROM budget_cycles WHERE user_id = '49d01efc-e309-49be-98f2-684d0d4548e2';
DELETE FROM goals         WHERE user_id = '49d01efc-e309-49be-98f2-684d0d4548e2';
```

**`migration_accounts.sql`** — cria estrutura nova:

```sql
-- Tabela de contas (multi-conta da Onda 3).
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('bank', 'credit', 'envelope')),
  subtype text,
  default_payment_source text CHECK (default_payment_source IN ('fixed_income','variable_income','credit','reserve')),
  is_active boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Adiciona FKs em transactions: account_id (income/expense/investment),
-- from_account_id + to_account_id (transfer entre contas próprias).
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS account_id      uuid REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS from_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS to_account_id   uuid REFERENCES accounts(id) ON DELETE SET NULL;

-- RLS
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user owns accounts" ON accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_from_account ON transactions(from_account_id) WHERE from_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_to_account ON transactions(to_account_id) WHERE to_account_id IS NOT NULL;
```

### 3.2 Backend (lib + hooks)

**`src/lib/db.js`** — adicionar helpers de account no fim do arquivo:

```js
// ─── ACCOUNTS ───────────────────────────────────────────────────────────────
export const getAccounts = () =>
  supabase.from('accounts').select('*').eq('is_active', true).order('display_order').order('name')

export const getAllAccounts = () =>
  supabase.from('accounts').select('*').order('display_order').order('name')

export const upsertAccount = (account) => {
  if (account.id) {
    return supabase.from('accounts').update({ ...account, updated_at: new Date().toISOString() }).eq('id', account.id).select().single()
  }
  return supabase.from('accounts').insert(account).select().single()
}

export const deactivateAccount = (id) =>
  supabase.from('accounts').update({ is_active: false }).eq('id', id)
```

**`src/hooks/useData.js`** — adicionar hook `useAccounts`:

```js
export function useAccounts() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await db.getAccounts()
    setAccounts(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('accounts').on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, load).subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { accounts, loading, refetch: load }
}
```

### 3.3 Frontend (UI)

**`src/pages/SettingsPage.jsx`** — nova seção "Contas":
- Lista accounts ativas (nome, tipo, subtype, badge)
- Botão "+ Nova conta" abre modal
- Edit em cada row abre modal
- Botão "Desativar" (não deleta — preserva FK das tx)

**Modal `AccountModal`:**
- Campos: `name` (text), `type` (select bank/credit/envelope), `subtype` (text livre), `default_payment_source` (select), `notes` (textarea), `is_active` (checkbox)
- Pré-fills úteis: ao escolher type=bank, default_payment_source='fixed_income'; type=credit, 'credit'; type=envelope, 'variable_income'

**`src/pages/TransactionsPage.jsx` (TxModal):**

| Tipo tx | Campo conta |
|---|---|
| `income`, `expense`, `investment` | 1 select **"Conta"** (obrigatório, usa accounts ativas) |
| `transfer` | 2 selects **"De"** + **"Para"** (ambos obrigatórios, distintos) |

Quando user escolhe conta com `default_payment_source` preenchido, **auto-preenche** o `payment_source` (mas user pode mudar).

Validação:
- Tipos `income`/`expense`/`investment`: `account_id` obrigatório
- Tipo `transfer`: `from_account_id` ≠ `to_account_id`, ambos obrigatórios
- Em erro: mostra mensagem no modal antes de salvar

**TransactionsPage (lista):**
- Cada tx mostra badge da conta:
  - Tipos normais: badge `[Conta]`
  - Tipo transfer: badge `From → To`
- Filtro novo: select de account no header (além do filtro de tipo)

### 3.4 Defaults pra cadastrar (informativo pra user — não automatizado)

As 5 contas que o user vai cadastrar manualmente após migrations:

| Nome | type | subtype | default_payment_source |
|---|---|---|---|
| NuBank Conta Corrente | bank | checking | fixed_income |
| NuBank Crédito | credit | credit_card | credit |
| PicPay Crédito | credit | credit_card | credit |
| Biplay | credit | loan | credit |
| Aluguel (esposa) | envelope | shared | variable_income |

## 4. Critérios de done

- ✅ 3 migrations escritas e commitadas (não aplicadas — user aplica manual)
- ✅ Tabela `accounts` no schema com RLS funcionando
- ✅ `transactions` com `account_id` / `from_account_id` / `to_account_id`
- ✅ Helpers em `db.js` + hook `useAccounts`
- ✅ SettingsPage com seção Contas + modal CRUD
- ✅ TxModal estendido com Conta(s) + validação
- ✅ TransactionsPage lista mostra badge de conta + filtro
- ✅ `npm run build` limpo
- ✅ `INVENTARIO.md` atualizado
- ✅ Smoke test manual (user):
  - Aplicar migrations 1→2→3 no Dashboard
  - Cadastrar 5 contas em /settings
  - Configurar ciclo novo no Planejamento
  - Cadastrar items/bills do mês
  - Lançar tx de cada tipo (income, expense, transfer entre contas, etc.)

## 5. Estrutura de commits sugerida

1. `feat(migration): backup_pre_onda3 — schema backup_2026_05_14 com cópia das tabelas`
2. `feat(migration): wipe_pre_onda3 — DELETE dos dados do user`
3. `feat(migration): accounts — tabela accounts + account_id/from/to em transactions`
4. `feat(accounts): db helpers + useAccounts hook`
5. `feat(settings): seção Contas com modal CRUD`
6. `feat(tx): TxModal com campo Conta (e De/Para pra transfer)`
7. `feat(tx): TransactionsPage badge de conta + filtro por conta`
8. `docs: atualiza INVENTARIO.md pos-Onda3`

## 6. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Wipe rodado sem backup | Spec explicita ordem (backup → wipe). User aplica manualmente — controle direto. Plan reforça "rodar 1 só depois de 2 confirmar Success" |
| FK quebrada se tx orfã ficar com account_id apontando pra account deletada | `ON DELETE SET NULL` em todas as FKs — tx ficam órfãs mas não quebram. Account em si usa `is_active=false` em vez de DELETE (helper `deactivateAccount`) |
| User esquece de cadastrar conta antes de criar tx | TxModal tem empty state com link pra `/settings → Contas` |
| Migration de wipe aplicada em produção compartilhada | user_id hardcoded no SQL — não pega outros users. Só o Carlos é afetado |
| Cycle e bills antigos somem mas user esperava manter algum | Spec confirmado: wipe total. Backup permite restore via SQL `INSERT INTO public... SELECT * FROM backup_2026_05_14...` se mudar de ideia |
| Transferência entre contas duplica saldo | `type='transfer'` com from/to NÃO conta em `getMonthSummary`/`computeBucketSnapshot` — código de cálculo precisa ignorar transfer internos. (Já era o caso; precisa garantir que segue) |

## 7. Próximos passos

1. Invocar **writing-plans skill** pra criar o implementation plan
2. Executar via subagent-driven-development
3. User aplica as 3 migrations no Supabase Dashboard
4. User cadastra contas e novos dados (ciclo 15/05 → 15/06)
5. Avançar pra Onda 4 (revisar Dashboard cards pra refletir multi-conta) — novo spec
