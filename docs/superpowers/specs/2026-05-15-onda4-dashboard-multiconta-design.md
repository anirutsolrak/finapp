# Onda 4 — Dashboard multi-conta (Design Spec)

**Data:** 2026-05-15
**Branch:** `auditoria-features`
**Pré-requisito:** Onda 3 (Multi-conta) aplicada — tabela `accounts` + colunas `account_id`/`from_account_id`/`to_account_id` em `transactions`, RLS familiar compartilhada, seed das 5 contas.

---

## Goal

Refatorar o Dashboard pra refletir o modelo multi-conta da Onda 3. Saldos passam a ser derivados de `transactions` (modelo "espelho honesto", igual Metas). Card único de "Renda / Crédito" agregado vira **4 cards por tipo de conta** com drill-down on-demand.

Elimina manutenção manual de `cycle.saldo_origem_income` / `cycle.saldo_origem_credit`.

---

## Architecture

### Modelo de dados

**Migration `migration_account_balances.sql`:**

```sql
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_limit    numeric NOT NULL DEFAULT 0;
```

Semântica:
- `bank` e `envelope`: usam `opening_balance` (saldo inicial quando a conta foi adicionada ao app). `credit_limit` ignorado.
- `credit`: usam `credit_limit` (limite do cartão/empréstimo). `opening_balance` ignorado (é sempre 0 na entrada do ciclo).

**Deprecated (não removidos):**
- `cycle.saldo_origem_income` — Dashboard passa a ignorar. Mantido no schema pra não quebrar inserts antigos.
- `cycle.saldo_origem_credit` — idem.

`cycle.reserva_pct` e `cycle.reserva_acumulada` continuam ativos.

### Cálculo de saldo por conta

Para uma conta `account` e o conjunto `transactions` retornado por `useDashboard(monthRef)`:

> **Nota — limitação herdada:** `useDashboard` filtra transactions por `month_ref` (string `'YYYY-MM'`). Ciclos cross-month (ex.: 15/05→15/06) hoje mostram só as transactions do `month_ref` atual. Bug pré-existente, **fora do escopo da Onda 4**. Onda 5 (Fatura) pode revisitar pra usar `cycle.start_date/end_date`.

Saldo de uma conta:

| Tipo da conta | Fórmula de saldo |
|---|---|
| `bank` | `opening_balance + Σ entradas − Σ saídas` (income/expense vinculados via `account_id` + transfers via `to_account_id`/`from_account_id`) |
| `credit` (credit_card) | `Σ saídas no ciclo` (dívida acumulada — não soma opening_balance) |
| `credit` (loan = Biplay) | `Σ saídas no ciclo` (dívida) |
| `envelope` | `opening_balance + Σ entradas − Σ saídas` (mesma fórmula do bank) |

Transferências `transfer` contam **uma vez de cada lado** (sai do `from_account_id`, entra no `to_account_id`).

### Agregação por grupo (cards do topo)

4 grupos exibidos como cards no Dashboard:

| Card | Conjunto | Métrica principal | Métrica secundária |
|---|---|---|---|
| 🏦 Bancos | `type=bank` | Σ saldoAtual | Σ entradas − Σ saídas no ciclo |
| 💳 Cartões | `type=credit AND subtype=credit_card` | Σ usado_ciclo | `usado / Σ credit_limit (X%)` |
| 🔁 Empréstimos | `type=credit AND subtype=loan` | Σ dívida_ciclo | (nenhuma — empréstimos não têm limite no Biplay) |
| ✉️ Envelope | `type=envelope` | Σ saldoAtual | Σ entradas − Σ saídas |

Cards só aparecem se houver pelo menos 1 conta ativa no grupo. (Hoje todos os 4 aparecem; ficar resiliente é defensivo barato.)

### Drill-down (drawer lateral)

Clique em qualquer card abre **drawer lateral direita** seguindo o padrão visual do drawer Ritmo/Reserva/Metas que já existe em `DashboardPage`. Conteúdo: lista de contas do grupo com saldo individual + breakdown entradas/saídas.

Exemplo Cartões:
```
💳 Cartões                             [×]
─────────────────────────────────────
NuBank Crédito       R$ 1.234,56
  Limite:     R$ 3.000,00 (41%)
  Usado:      R$ 1.234,56
─────────────────────────────────────
PicPay Crédito       R$    567,89
  Limite:     R$ 2.000,00 (28%)
  Usado:      R$    567,89
```

Estado do drawer (qual grupo aberto) fica em `useState` local no `DashboardPage`. Drawer reusa o mesmo componente visual do existente.

### Métricas derivadas (que continuam vivas)

| Métrica | Mudança |
|---|---|
| **Saldo atual (renda)** | Era `cycle.saldo_origem_income` (manual). Agora: `Σ bank.opening_balance + Σ entradas bank − Σ saídas bank` (derivado). |
| **Disponível pra gastar** | Fórmula igual; muda só a fonte do `saldoOrigem`. |
| **Reserva** (Disponível/Usado/Acumulada) | Inalterado. Continua usando `cycle.reserva_pct` * saldo agregado. |
| **Ritmo da semana** (meta semanal, média diária) | Inalterado. Usa `saldoDisponivel` que agora é derivado. |
| **% comprometido crédito** | Era `cycle.saldo_origem_credit`. Agora: `Σ usado_cartoes / Σ credit_limit`. |
| **Bills pagas no mês** | Inalterado. |

### Refactor `budgetEngine.js`

**Novas funções:**

```js
// Snapshot de UMA conta — saldo atual + breakdown de entradas/saídas no ciclo.
computeAccountSnapshot({ account, transactions }) → {
  saldoAtual,
  entradas,        // soma de income + transfer_to direcionadas pra esta conta
  saidas,          // soma de expense + transfer_from saindo desta conta
  dividaCiclo,     // só faz sentido pra credit: Σ saídas (sem opening_balance)
  usado,           // alias de dividaCiclo pra credit; 0 pra bank/envelope
  limite,          // credit_limit (só pra credit)
  pctComprometido, // só pra credit_card: usado/limite
}

// Agregado por grupo (bank / credit_card / loan / envelope)
computeAccountsGroupSnapshot({ accounts, transactions, filter }) → {
  contas: AccountSnapshot[],
  saldoTotal,
  entradasTotal,
  saidasTotal,
  usadoTotal,
  limiteTotal,
  pctComprometidoTotal,
}
```

**Refactor de `computeBucketSnapshot`:**

`computeBucketSnapshot({ bucket: 'income' })` passa a derivar `saldoOrigem` de `computeAccountsGroupSnapshot({ filter: type==='bank' })` ao invés de ler `cycle.saldo_origem_income`. Mesma coisa pra `bucket: 'credit'` → soma de `credit_limit` das `credit_card` (sem loan, porque loan não tem limite).

Loan não entra no bucket `credit` do `computeBucketSnapshot` — fica só no card Empréstimos do Dashboard. Métricas "% comprometido crédito" no Dashboard ignoram loan.

### Hook novo: `useAccountSnapshots`

Em `src/hooks/useData.js`:

```js
export function useAccountSnapshots(transactions) {
  const { accounts } = useAccounts()
  const snapshots = useMemo(() => ({
    banks:   computeAccountsGroupSnapshot({ accounts, transactions, filter: a => a.type === 'bank' }),
    cards:   computeAccountsGroupSnapshot({ accounts, transactions, filter: a => a.type === 'credit' && a.subtype === 'credit_card' }),
    loans:   computeAccountsGroupSnapshot({ accounts, transactions, filter: a => a.type === 'credit' && a.subtype === 'loan' }),
    envelope:computeAccountsGroupSnapshot({ accounts, transactions, filter: a => a.type === 'envelope' }),
  }), [accounts, transactions])
  return snapshots
}
```

Derivação pura, sem fetch novo. Realtime já está coberto pelo `useAccounts` (canal `accounts`) e `useDashboard` (canal `transactions`).

### UI Settings — modal CRUD de conta

`AccountModal.jsx` (criado na Onda 3) ganha 2 campos condicionais:
- `opening_balance` (number input, R$) — visível se `type === 'bank' || type === 'envelope'`
- `credit_limit` (number input, R$) — visível se `type === 'credit'`

Label dinâmico:
- `bank` / `envelope`: "Saldo inicial"
- `credit_card`: "Limite do cartão"
- `loan` (Biplay): "Limite teórico (use 0 se ilimitado)"

---

## Components affected

| Arquivo | Mudança |
|---|---|
| `migration_account_balances.sql` | **Novo** — ADD COLUMN opening_balance + credit_limit |
| `src/lib/budgetEngine.js` | Adiciona `computeAccountSnapshot` + `computeAccountsGroupSnapshot`. Refactor `computeBucketSnapshot` pra derivar saldo de accounts. |
| `src/hooks/useData.js` | Adiciona hook `useAccountSnapshots`. |
| `src/pages/DashboardPage.jsx` | Substitui cards "Renda" + "Crédito" por 4 cards agregados (Bancos/Cartões/Empréstimos/Envelope). Adiciona estado `accountDrawerGroup` (string ou null). |
| `src/components/Dashboard/AccountGroupDrawer.jsx` | **Novo** — drawer lateral com lista de contas do grupo + breakdown. Reaproveita classes do drawer Ritmo/Reserva/Metas. |
| `src/components/Settings/AccountModal.jsx` | Adiciona campos `opening_balance` e `credit_limit` (condicionais por tipo). |
| `docs/INVENTARIO.md` | Atualiza status pós-Onda 4. |

---

## Data flow

```
DashboardPage
  └─ useDashboard(monthRef) → { transactions, bills, goals, ... }
  └─ useAccountSnapshots(transactions) → { banks, cards, loans, envelope }
       └─ useAccounts() → accounts[] (realtime)
       └─ computeAccountsGroupSnapshot(accounts, transactions, filter)

  Renderiza 4 cards. Clique → setAccountDrawerGroup('banks' | 'cards' | 'loans' | 'envelope')

  AccountGroupDrawer
    └─ recebe snapshots[group] como prop
    └─ lista contas com breakdown
```

---

## Error handling

- **Conta sem `opening_balance` preenchido** (situação atual pós-seed): trata como 0. UI mostra saldo derivado só de transactions. Sem warning — não é estado inválido, só significa "comecei do zero".
- **Conta sem `credit_limit`**: % comprometido aparece como `—` (não renderiza). Loan com limite 0 = comportamento esperado.
- **Conta com `type` desconhecido** (defensivo): cai num quarto grupo "Outras" — mas como o CHECK no schema só permite 3 valores, isso na prática nunca acontece. Não vale criar UI extra; só não crashar.
- **Transação sem `account_id`** (legado antes da Onda 3, ou esquecida): não conta em nenhum grupo. Aparece no Histórico normalmente. Sem alerta no Dashboard — invisibilidade é o sinal.

---

## Testing strategy

Manual (single-user app, sem suite de testes automatizada):

1. **Smoke vazio:** Após migration, abrir Dashboard com contas zeradas (sem transactions). Cada card deve mostrar R$ 0,00. Drill-down lista as contas com saldo zero.
2. **Bank com opening_balance:** Preencher `opening_balance = 1000` em NuBank CC via SettingsPage. Card Bancos deve mostrar R$ 1.000,00. Drill-down idem.
3. **Lançar income:** Add transaction tipo `income` valor 500 vinculada à NuBank CC. Saldo Bancos vira R$ 1.500,00.
4. **Lançar expense bank:** Add expense 200 na NuBank CC. Saldo Bancos vira R$ 1.300,00.
5. **Lançar expense credit:** Add expense 300 no NuBank Crédito (com `credit_limit = 3000`). Card Cartões mostra R$ 300,00 / R$ 3.000,00 (10%).
6. **Transferência:** Add transfer 100 de NuBank CC → PicPay. Bank cai pra R$ 1.200,00. PicPay como `credit_card` não vê saldo crescer (transfers TO credit_card só fazem sentido pra "pagar fatura" — fica de fora deste teste; cenário coberto na Onda 5 Fatura).
7. **% comprometido agregado:** Lançar mais cartões. Card Cartões deve mostrar % agregado corretamente.
8. **Disponível pra gastar:** Validar que a métrica continua coerente após desabilitar `cycle.saldo_origem_income` (deve usar saldo derivado).
9. **Realtime:** Editar `opening_balance` no SettingsPage → Dashboard atualiza sozinho via canal `accounts`.

---

## Out of scope (Ondas seguintes)

| Item | Onda |
|---|---|
| Fatura de crédito (fechamento mensal, pagamento de fatura via transfer bank → credit) | Onda 5 |
| CSV importer NuBank (extrato) | Onda 6 |
| Histórico de saldo por conta (gráfico time-series) | Futuro |
| Reconciliação bancária | Futuro |
| Investigação bug bills antigas (FK NULL no Planejamento↔Agenda) | Descartado pelo user — wipe resolveu |
| Remoção de `cycle.saldo_origem_income/credit` do schema | Cleanup futuro — fica deprecated por ora |

---

## Open questions / decisões tomadas durante o brainstorming

1. **Modelo de saldo**: derivado de transactions (espelho honesto) ✅
2. **Layout cards**: híbrido agregado + drill-down ✅
3. **Biplay**: card separado "Empréstimos" ✅
4. **Saldo origem do cycle**: deprecated (não removido) ✅
5. **Opening balance pra credit**: não usado (saldo de credit é só dívida do ciclo) ✅
