# Onda 4 — Dashboard multi-conta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refatorar o Dashboard pra refletir o modelo multi-conta da Onda 3 — saldo derivado de transactions, 4 cards agregados (Bancos / Cartões / Empréstimos / Envelope) com drill-down em drawer lateral.

**Architecture:** Adiciona 2 colunas em `accounts` (`opening_balance`, `credit_limit`). Cria funções de agregação em `budgetEngine.js`. Refatora `DashboardPage.jsx` pra usar 4 cards por tipo + drawer drill-down. Substitui leitura de `cycle.saldo_origem_*` por agregação derivada de transactions. Atualiza `AccountModal` em `SettingsPage` pra editar saldos.

**Tech Stack:** React 19, Vite, Supabase (Postgres + RLS familiar permissiva), date-fns, Tailwind, lucide-react.

**Testing:** Manual (smoke test) — projeto não tem suite automatizada. Cada task termina com passos de verificação no browser.

**Pré-requisito (USER):** já aplicou no Supabase Dashboard:
1. `DELETE FROM bills;`
2. `migration_family_share.sql`
3. `seed_accounts_and_cycle.sql` (5 contas + 1 ciclo zerado)

Verificar antes de começar: rodar `npm run dev` e abrir a app — Dashboard, SettingsPage e TxModal devem carregar sem erro com a tabela `accounts` populada.

---

## File Structure

| Arquivo | Responsabilidade | Status |
|---|---|---|
| `migration_account_balances.sql` | ADD COLUMN opening_balance + credit_limit em accounts | **NOVO** |
| `src/lib/budgetEngine.js` | + `computeAccountSnapshot` + `computeAccountsGroupSnapshot`; refatora `computeBucketSnapshot` pra derivar saldo de accounts | Modificado |
| `src/hooks/useData.js` | + `useAccountSnapshots(transactions)` hook | Modificado |
| `src/components/AccountGroupDrawer.jsx` | Drawer lateral com breakdown por conta de um grupo | **NOVO** |
| `src/pages/DashboardPage.jsx` | 4 cards agregados + estado do drawer | Modificado |
| `src/pages/SettingsPage.jsx` | AccountModal ganha campos `opening_balance` / `credit_limit` | Modificado |
| `INVENTARIO.md` | Atualizar status pós-Onda 4 | Modificado |

---

## Task 1: Migration — adicionar opening_balance e credit_limit

**Files:**
- Create: `migration_account_balances.sql`

- [ ] **Step 1: Criar o arquivo de migration**

Conteúdo de `migration_account_balances.sql`:
```sql
-- migration_account_balances.sql
-- Onda 4: adiciona saldo inicial (bank/envelope) e limite de crédito (credit) nas contas.
-- Saldo atual passa a ser derivado: opening_balance + Σ(entradas − saídas) vinculadas via account_id.
-- cycle.saldo_origem_income e cycle.saldo_origem_credit ficam deprecated (não removidos).

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_limit    numeric NOT NULL DEFAULT 0;
```

- [ ] **Step 2: USER aplica a migration manualmente**

A CLI Supabase está instável (regra do user). Pede pro user copiar/colar no SQL Editor do Dashboard.

Verificação esperada após aplicar:
```sql
SELECT name, type, opening_balance, credit_limit
FROM accounts
ORDER BY display_order;
```
Resultado: 5 contas, todas com `opening_balance = 0` e `credit_limit = 0`.

- [ ] **Step 3: Commit**

```bash
git add migration_account_balances.sql
git commit -m "feat(db): adiciona opening_balance e credit_limit em accounts (Onda 4)"
```

---

## Task 2: budgetEngine — funções de snapshot por conta e por grupo

**Files:**
- Modify: `src/lib/budgetEngine.js`

- [ ] **Step 1: Adicionar `computeAccountSnapshot` no final do arquivo**

Adicionar após `computeReservaSnapshot`:

```js
// ─── ACCOUNT SNAPSHOTS (Onda 4 — multi-conta) ────────────────────────────────

// Tipos de entrada que aumentam o saldo de uma conta.
const INFLOW_TYPES = new Set(['income'])
// Tipos de saída que reduzem o saldo de uma conta (não inclui 'transfer' — transfers são
// tratadas separadamente via from_account_id/to_account_id).
const EXPENSE_OUTFLOW_TYPES = new Set(['expense', 'investment'])

/**
 * Snapshot de UMA conta: saldo atual + entradas/saídas do conjunto de transactions passado.
 *
 * - bank / envelope: saldo = opening_balance + entradas − saídas
 * - credit (credit_card / loan): saldo NÃO usa opening_balance. saldoAtual = dívida do ciclo
 *   (Σ saídas) e usado/limite são derivados.
 */
export function computeAccountSnapshot({ account, transactions = [] }) {
  if (!account) return null

  const openingBalance = Number(account.opening_balance) || 0
  const creditLimit = Number(account.credit_limit) || 0
  const isCredit = account.type === 'credit'

  // Entradas: income com account_id == conta + transfers chegando (to_account_id == conta).
  const entradas = transactions
    .filter(t => {
      if (INFLOW_TYPES.has(t.type) && t.account_id === account.id) return true
      if (t.type === 'transfer' && t.to_account_id === account.id) return true
      return false
    })
    .reduce((a, t) => a + Number(t.amount || 0), 0)

  // Saídas: expense/investment com account_id == conta + transfers saindo (from_account_id == conta).
  const saidas = transactions
    .filter(t => {
      if (EXPENSE_OUTFLOW_TYPES.has(t.type) && t.account_id === account.id) return true
      if (t.type === 'transfer' && t.from_account_id === account.id) return true
      return false
    })
    .reduce((a, t) => a + Number(t.amount || 0), 0)

  const saldoAtual = isCredit
    ? saidas - entradas  // credit: dívida líquida (saídas − pagamentos via transfer entrando)
    : openingBalance + entradas - saidas

  const usado = isCredit ? Math.max(saldoAtual, 0) : 0
  const pctComprometido = (isCredit && creditLimit > 0) ? (usado / creditLimit) * 100 : null

  return {
    account,
    saldoAtual,
    entradas,
    saidas,
    usado,
    limite: creditLimit,
    pctComprometido,
  }
}

/**
 * Agregado por grupo de contas (bank / credit_card / loan / envelope).
 * `filter` é uma função (account) => boolean.
 */
export function computeAccountsGroupSnapshot({ accounts = [], transactions = [], filter }) {
  const contasFiltradas = accounts.filter(a => a.is_active !== false).filter(filter)
  const snapshots = contasFiltradas.map(account => computeAccountSnapshot({ account, transactions }))

  const saldoTotal = snapshots.reduce((a, s) => a + s.saldoAtual, 0)
  const entradasTotal = snapshots.reduce((a, s) => a + s.entradas, 0)
  const saidasTotal = snapshots.reduce((a, s) => a + s.saidas, 0)
  const usadoTotal = snapshots.reduce((a, s) => a + s.usado, 0)
  const limiteTotal = snapshots.reduce((a, s) => a + s.limite, 0)
  const pctComprometidoTotal = limiteTotal > 0 ? (usadoTotal / limiteTotal) * 100 : null

  return {
    contas: snapshots,
    saldoTotal,
    entradasTotal,
    saidasTotal,
    usadoTotal,
    limiteTotal,
    pctComprometidoTotal,
  }
}
```

- [ ] **Step 2: Refatorar `computeBucketSnapshot` pra derivar saldo de accounts**

`computeBucketSnapshot` é usado em DashboardPage, ChatPage (via getAIContext), etc. Ele lê `cycle.saldo_origem_income/credit` direto. Vamos torná-lo capaz de receber accounts opcionalmente — se vier, deriva; se não, cai no comportamento antigo (compat com chamadas legadas).

Substituir a função `computeBucketSnapshot` inteira pelo bloco abaixo. Linhas 30–88 do arquivo original (cabeçalho assinatura → return).

```js
export function computeBucketSnapshot({ bucket, cycle, items = [], transactions = [], bills = [], accounts = null, today = new Date() }) {
  if (!cycle) {
    return { saldoOrigem: 0, reserva: 0, planejado: 0, gastoReal: 0, committed: 0, saldoDisponivel: 0, diasRestantes: 0, mediaDiaria: 0, metaSemanal: 0, pct: 0 }
  }
  // Onda 4: se accounts foi passado, deriva saldoOrigem da soma dos saldos das contas.
  // Senão, cai no comportamento antigo (lê cycle.saldo_origem_*).
  let saldoOrigem
  if (accounts && accounts.length > 0) {
    if (bucket === 'credit') {
      // Bucket credit = soma dos credit_limit das contas credit_card (loan fica fora).
      saldoOrigem = accounts
        .filter(a => a.is_active !== false && a.type === 'credit' && a.subtype === 'credit_card')
        .reduce((a, ac) => a + (Number(ac.credit_limit) || 0), 0)
    } else {
      // Bucket income = soma do saldo derivado das contas bank.
      const banks = accounts.filter(a => a.is_active !== false && a.type === 'bank')
      saldoOrigem = banks.reduce((sum, account) => {
        const snap = computeAccountSnapshot({ account, transactions })
        return sum + snap.saldoAtual
      }, 0)
    }
  } else {
    saldoOrigem = Number(bucket === 'credit' ? cycle.saldo_origem_credit : cycle.saldo_origem_income) || 0
  }

  const reservaPct = Number(cycle.reserva_pct) || 0
  const reserva = bucket === 'credit' ? 0 : saldoOrigem * reservaPct / 100
  const itemsIn = items.filter(i => bucketOf(i.payment_source) === bucket && i.categories?.type !== 'income')
  const planejado = itemsIn.reduce((a, i) => a + Number(i.planned_amount || 0), 0)
  const gastoReal = transactions
    .filter(t => t.type === 'expense' && bucketOf(t.payment_source) === bucket)
    .reduce((a, t) => a + Number(t.amount || 0), 0)

  let committed = 0
  for (const item of itemsIn) {
    const billSum = bills
      .filter(b => b.budget_item_id === item.id)
      .reduce((a, b) => a + Number(b.amount || 0), 0)
    const txSum = transactions
      .filter(t => t.budget_item_id === item.id && OUTFLOW_TYPES.has(t.type))
      .reduce((a, t) => a + Number(t.amount || 0), 0)
    const planned = Number(item.planned_amount || 0)
    committed += Math.max(billSum, txSum, planned)
  }
  const adhocTx = transactions
    .filter(t => OUTFLOW_TYPES.has(t.type) && !t.budget_item_id && bucketOf(t.payment_source) === bucket)
    .reduce((a, t) => a + Number(t.amount || 0), 0)
  committed += adhocTx

  // Onda 4: quando accounts deriva saldoOrigem, saidaSinceCutoff já está embutida (saldoAtual = opening + entradas − saídas).
  // Pra não duplicar, modo derivado pula a subtração de saidaSinceCutoff.
  const cutoff = cycle.updated_at ? new Date(cycle.updated_at) : null
  const saidaSinceCutoff = (accounts && accounts.length > 0)
    ? 0
    : transactions
        .filter(t => OUTFLOW_TYPES.has(t.type) && bucketOf(t.payment_source) === bucket)
        .filter(t => !cutoff || (t.created_at && new Date(t.created_at) >= cutoff))
        .reduce((a, t) => a + Number(t.amount || 0), 0)
  const saldoReal = saldoOrigem - saidaSinceCutoff
  const saldoDisponivel = bucket === 'credit'
    ? Math.max(saldoReal, 0)
    : Math.max(saldoReal * (1 - reservaPct / 100), 0)
  const endDate = toDate(cycle.end_date)
  const startDate = toDate(cycle.start_date)
  const sundayAnchor = startOfWeek(today, { weekStartsOn: 0 })
  const anchor = startDate && isBefore(sundayAnchor, startDate) ? startDate : sundayAnchor
  const diasRestantes = endDate ? Math.max(differenceInCalendarDays(endDate, anchor) + 1, 1) : 1
  const mediaDiaria = bucket === 'credit' ? 0 : saldoDisponivel / diasRestantes
  const metaSemanal = bucket === 'credit' ? 0 : mediaDiaria * 7
  const pct = saldoOrigem > 0 ? (committed / saldoOrigem) * 100 : 0
  return { saldoOrigem, reserva, planejado, gastoReal, committed, saidaSinceCutoff, saldoReal, saldoDisponivel, diasRestantes, mediaDiaria, metaSemanal, pct }
}
```

- [ ] **Step 3: Atualizar `computeReservaSnapshot` pra aceitar accounts opcionalmente**

Mesma lógica: se accounts veio, deriva o `saldoOrigemIncome` ao invés de ler do cycle.

Substituir `computeReservaSnapshot` inteira:

```js
export function computeReservaSnapshot({ cycle, transactions = [], accounts = null }) {
  if (!cycle) return { acumulada: 0, aporte: 0, usado: 0, disponivel: 0, total: 0 }
  const acumulada = Number(cycle.reserva_acumulada) || 0
  let saldoOrigemIncome
  if (accounts && accounts.length > 0) {
    const banks = accounts.filter(a => a.is_active !== false && a.type === 'bank')
    saldoOrigemIncome = banks.reduce((sum, account) => {
      const snap = computeAccountSnapshot({ account, transactions })
      return sum + snap.saldoAtual
    }, 0)
  } else {
    saldoOrigemIncome = Number(cycle.saldo_origem_income) || 0
  }
  const aporte = saldoOrigemIncome * (Number(cycle.reserva_pct) || 0) / 100
  const usado = transactions
    .filter(t => t.type === 'expense' && t.payment_source === 'reserve')
    .reduce((a, t) => a + Number(t.amount || 0), 0)
  const total = acumulada + aporte
  const disponivel = Math.max(total - usado, 0)
  return { acumulada, aporte, usado, disponivel, total }
}
```

- [ ] **Step 4: Smoke check do parser**

```bash
node -e "require('./src/lib/budgetEngine.js'); console.log('ok')" 2>&1 | head -1
```

Esperado: parse sem erro. (Como é ESM via Vite, talvez precise rodar via `npm run dev` direto — se falhar, prosseguir e confirmar no dev server na Task 6.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/budgetEngine.js
git commit -m "feat(engine): adiciona computeAccountSnapshot + agregado por grupo (Onda 4)"
```

---

## Task 3: Hook useAccountSnapshots

**Files:**
- Modify: `src/hooks/useData.js`

- [ ] **Step 1: Adicionar import do `useMemo` e das funções do engine**

Substituir a primeira linha do arquivo:
```js
import { useState, useEffect, useCallback } from 'react'
```

por:
```js
import { useState, useEffect, useCallback, useMemo } from 'react'
import { computeAccountsGroupSnapshot } from '../lib/budgetEngine'
```

(O import existente do `format` em date-fns e do supabase e do db ficam.)

- [ ] **Step 2: Adicionar `useAccountSnapshots` no final do arquivo**

Inserir após `useAccounts`:

```js
/**
 * Agrega snapshots por grupo (banks / cards / loans / envelope) a partir de transactions.
 * Não faz fetch novo — depende de `useAccounts` (com realtime) e do `transactions` passado.
 */
export function useAccountSnapshots(transactions = []) {
  const { accounts } = useAccounts()
  return useMemo(() => ({
    banks: computeAccountsGroupSnapshot({
      accounts,
      transactions,
      filter: a => a.type === 'bank',
    }),
    cards: computeAccountsGroupSnapshot({
      accounts,
      transactions,
      filter: a => a.type === 'credit' && a.subtype === 'credit_card',
    }),
    loans: computeAccountsGroupSnapshot({
      accounts,
      transactions,
      filter: a => a.type === 'credit' && a.subtype === 'loan',
    }),
    envelope: computeAccountsGroupSnapshot({
      accounts,
      transactions,
      filter: a => a.type === 'envelope',
    }),
  }), [accounts, transactions])
}
```

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useData.js
git commit -m "feat(hooks): useAccountSnapshots para agregar contas por grupo (Onda 4)"
```

---

## Task 4: AccountModal — campos opening_balance e credit_limit

**Files:**
- Modify: `src/pages/SettingsPage.jsx`

- [ ] **Step 1: Atualizar `EMPTY_ACCOUNT` pra incluir os 2 novos campos**

Substituir o objeto `EMPTY_ACCOUNT` (linhas 21–29 originais) por:

```js
const EMPTY_ACCOUNT = {
  name: '',
  type: 'bank',
  subtype: '',
  default_payment_source: 'fixed_income',
  is_active: true,
  display_order: 0,
  notes: '',
  opening_balance: 0,
  credit_limit: 0,
}
```

- [ ] **Step 2: Adicionar campos condicionais no AccountModal**

Localizar o `<div>` do campo "Notas (opcional)" (próximo à linha 103–106 do arquivo modificado). **Antes** desse bloco, inserir:

```jsx
        {(form.type === 'bank' || form.type === 'envelope') && (
          <div>
            <label className="label">Saldo inicial</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.opening_balance}
              onChange={e => set('opening_balance', e.target.value)}
              placeholder="0,00"
            />
            <p className="text-xs text-gray-600 mt-1">Saldo da conta no momento em que você começou a usar o app. Saldo atual = inicial + entradas − saídas.</p>
          </div>
        )}

        {form.type === 'credit' && (
          <div>
            <label className="label">Limite</label>
            <input
              type="number"
              step="0.01"
              className="input"
              value={form.credit_limit}
              onChange={e => set('credit_limit', e.target.value)}
              placeholder="0,00"
            />
            <p className="text-xs text-gray-600 mt-1">Limite total. Use 0 se for empréstimo sem limite tradicional (ex: Biplay).</p>
          </div>
        )}
```

- [ ] **Step 3: Garantir conversão pra number no `save()`**

Substituir a montagem do `payload` na função `save()` (próximo à linha 61 original). Substituir:

```js
const payload = { ...clean, user_id: userId, display_order: Number(form.display_order) || 0 }
```

por:

```js
const payload = {
  ...clean,
  user_id: userId,
  display_order: Number(form.display_order) || 0,
  opening_balance: Number(form.opening_balance) || 0,
  credit_limit: Number(form.credit_limit) || 0,
}
```

- [ ] **Step 4: Verificação manual**

Rodar `npm run dev`. Abrir /settings:
1. Clicar "Nova conta" → tipo Bank → campo "Saldo inicial" aparece. Trocar pra Crédito → campo some, "Limite" aparece.
2. Editar uma conta existente (ex: NuBank CC) → preencher `opening_balance = 1500.50` → Salvar.
3. Confirmar no SQL Editor:
   ```sql
   SELECT name, opening_balance, credit_limit FROM accounts WHERE name = 'NuBank Conta Corrente';
   ```
   Esperado: `opening_balance = 1500.50`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/SettingsPage.jsx
git commit -m "feat(settings): AccountModal ganha opening_balance e credit_limit (Onda 4)"
```

---

## Task 5: Componente AccountGroupDrawer

**Files:**
- Create: `src/components/AccountGroupDrawer.jsx`

- [ ] **Step 1: Criar o componente**

Conteúdo de `src/components/AccountGroupDrawer.jsx`:

```jsx
import { X, Wallet, CreditCard, Repeat, Mail } from 'lucide-react'

const fmt = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return 'R$ 0,00'
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const GROUP_META = {
  banks:    { label: 'Bancos',           Icon: Wallet,     color: '#10b981' },
  cards:    { label: 'Cartões',          Icon: CreditCard, color: '#a855f7' },
  loans:    { label: 'Empréstimos',      Icon: Repeat,     color: '#ef4444' },
  envelope: { label: 'Envelope',         Icon: Mail,       color: '#f97316' },
}

/**
 * Drawer lateral direita listando as contas de um grupo (banks/cards/loans/envelope).
 * Mostra saldo individual + breakdown de entradas/saídas (bank/envelope) OU usado/limite (credit).
 *
 * Props:
 *   group: 'banks' | 'cards' | 'loans' | 'envelope' | null
 *   snapshot: AccountsGroupSnapshot retornado por computeAccountsGroupSnapshot
 *   onClose: () => void
 */
export default function AccountGroupDrawer({ group, snapshot, onClose }) {
  if (!group) return null
  const meta = GROUP_META[group]
  const Icon = meta.Icon

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex animate-in md:items-center md:justify-center md:p-4"
      onClick={onClose}
    >
      <div
        className="ml-auto h-full w-[88%] max-w-sm bg-gray-900 border-l border-gray-800 rounded-l-2xl p-4 overflow-y-auto animate-slide-right
                   md:ml-0 md:mr-0 md:h-auto md:max-h-[85vh] md:w-full md:max-w-md md:rounded-2xl md:border md:animate-in"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold text-white flex items-center gap-2">
            <Icon size={14} style={{ color: meta.color }} />
            {meta.label}
          </p>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800"
            aria-label="Fechar"
          >
            <X size={18}/>
          </button>
        </div>

        {snapshot.contas.length === 0 && (
          <p className="text-sm text-gray-500 py-4 text-center">Nenhuma conta neste grupo.</p>
        )}

        <div className="space-y-3">
          {snapshot.contas.map(s => (
            <AccountRow key={s.account.id} snapshot={s} group={group} />
          ))}
        </div>

        {snapshot.contas.length > 1 && (
          <div className="border-t border-gray-800 mt-4 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-300">
              <span>Total</span>
              <span className="font-bold text-white">{fmt(snapshot.saldoTotal)}</span>
            </div>
            {group === 'cards' && snapshot.limiteTotal > 0 && (
              <div className="flex justify-between text-xs text-gray-500">
                <span>Limite agregado</span>
                <span>{fmt(snapshot.limiteTotal)} ({snapshot.pctComprometidoTotal?.toFixed(0) ?? 0}%)</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function AccountRow({ snapshot, group }) {
  const { account, saldoAtual, entradas, saidas, usado, limite, pctComprometido } = snapshot
  const isCredit = group === 'cards' || group === 'loans'

  return (
    <div className="rounded-xl bg-gray-800/60 p-3">
      <div className="flex justify-between items-start mb-2">
        <p className="text-sm font-medium text-white truncate pr-2">{account.name}</p>
        <p className="text-sm font-bold text-white flex-shrink-0">{fmt(saldoAtual)}</p>
      </div>

      {!isCredit && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-gray-500">Entradas</p>
            <p className="text-emerald-400 font-semibold">{fmt(entradas)}</p>
          </div>
          <div>
            <p className="text-gray-500">Saídas</p>
            <p className="text-red-400 font-semibold">{fmt(saidas)}</p>
          </div>
        </div>
      )}

      {isCredit && (
        <div className="space-y-1.5">
          {limite > 0 ? (
            <>
              <div className="w-full bg-gray-900 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-1.5 transition-all"
                  style={{
                    width: `${Math.min(pctComprometido || 0, 100)}%`,
                    background: (pctComprometido || 0) > 90 ? '#ef4444' : (pctComprometido || 0) > 70 ? '#f59e0b' : '#10b981',
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Usado: {fmt(usado)}</span>
                <span>Limite: {fmt(limite)} ({pctComprometido?.toFixed(0) ?? 0}%)</span>
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-500">Sem limite definido — dívida do ciclo: {fmt(usado)}</p>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/AccountGroupDrawer.jsx
git commit -m "feat(dashboard): componente AccountGroupDrawer para drill-down (Onda 4)"
```

---

## Task 6: DashboardPage — 4 cards agregados + drawer drill-down

**Files:**
- Modify: `src/pages/DashboardPage.jsx`

- [ ] **Step 1: Atualizar imports**

Substituir o bloco de imports (linhas 1–8 originais) por:

```jsx
import { useState, useMemo } from 'react'
import { format, differenceInDays, parseISO, startOfWeek, isBefore, isAfter } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { TrendingUp, AlertCircle, Target, ArrowRight, Sparkles, Settings, Clock, Wallet, CreditCard, Activity, PiggyBank, Lock, Receipt, X, Repeat, Mail } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDashboard, useMonthRef, useAccountSnapshots, useAccounts } from '../hooks/useData'
import { useAuth } from '../contexts/AuthContext'
import { computeBucketSnapshot, computeReservaSnapshot, bucketOf } from '../lib/budgetEngine'
import AccountGroupDrawer from '../components/AccountGroupDrawer'
```

- [ ] **Step 2: Adicionar estado do drawer de contas no início do componente**

Logo após `const [drawerOpen, setDrawerOpen] = useState(false)` (linha 57 original), inserir:

```jsx
  const [accountDrawerGroup, setAccountDrawerGroup] = useState(null)
  const { accounts } = useAccounts()
```

- [ ] **Step 3: Adicionar uso do hook useAccountSnapshots e passar accounts pros snapshots**

Localizar o bloco de `useMemo` em torno das linhas 64–67 originais (com `incomeSnap`, `creditSnap`, `reservaSnap`, `creditUsedPct`). Substituir esse bloco inteiro por:

```jsx
  const accountSnapshots = useAccountSnapshots(transactions)
  const incomeSnap = useMemo(() => computeBucketSnapshot({ bucket: 'income', cycle, items: budgetItems, transactions, bills, accounts }), [cycle, budgetItems, transactions, bills, accounts])
  const reservaSnap = useMemo(() => computeReservaSnapshot({ cycle, transactions, accounts }), [cycle, transactions, accounts])
```

(`creditSnap` e `creditUsedPct` são removidos — cards de crédito agora vêm de `accountSnapshots.cards`.)

- [ ] **Step 4: Substituir cards "Renda" e "Crédito" pelos 4 cards agregados**

Localizar o bloco `{/* Stats Renda */}` até o fim do bloco `{/* Stats Crédito */}` (linhas 135–183 originais). Substituir TODO esse trecho por:

```jsx
      {/* Cards multi-conta (Onda 4) */}
      <div>
        <p className="section-title flex items-center gap-2 mb-2"><Wallet size={12}/> Suas contas</p>
        <div className="grid grid-cols-2 gap-3">
          {accountSnapshots.banks.contas.length > 0 && (
            <button onClick={() => setAccountDrawerGroup('banks')} className="card flex flex-col gap-1 text-left hover:bg-gray-800/50 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500 font-medium">🏦 Bancos</span>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: COLORS.income + '20' }}>
                  <Wallet size={14} style={{ color: COLORS.income }} />
                </div>
              </div>
              <p className="text-xl font-bold text-white">{fmt(accountSnapshots.banks.saldoTotal)}</p>
              <p className="text-xs text-gray-500">{accountSnapshots.banks.contas.length} {accountSnapshots.banks.contas.length === 1 ? 'conta' : 'contas'} · toque pra detalhar</p>
            </button>
          )}

          {accountSnapshots.cards.contas.length > 0 && (
            <button onClick={() => setAccountDrawerGroup('cards')} className="card flex flex-col gap-1 text-left hover:bg-gray-800/50 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500 font-medium">💳 Cartões</span>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: COLORS.credit + '20' }}>
                  <CreditCard size={14} style={{ color: COLORS.credit }} />
                </div>
              </div>
              <p className="text-xl font-bold text-white">{fmt(accountSnapshots.cards.usadoTotal)}</p>
              <p className="text-xs text-gray-500">
                {accountSnapshots.cards.limiteTotal > 0
                  ? `de ${fmt(accountSnapshots.cards.limiteTotal)} (${accountSnapshots.cards.pctComprometidoTotal?.toFixed(0) ?? 0}%)`
                  : 'sem limite configurado'}
              </p>
            </button>
          )}

          {accountSnapshots.loans.contas.length > 0 && (
            <button onClick={() => setAccountDrawerGroup('loans')} className="card flex flex-col gap-1 text-left hover:bg-gray-800/50 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500 font-medium">🔁 Empréstimos</span>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: COLORS.installment + '20' }}>
                  <Repeat size={14} style={{ color: COLORS.installment }} />
                </div>
              </div>
              <p className="text-xl font-bold text-white">{fmt(accountSnapshots.loans.usadoTotal)}</p>
              <p className="text-xs text-gray-500">dívida do ciclo · toque pra detalhar</p>
            </button>
          )}

          {accountSnapshots.envelope.contas.length > 0 && (
            <button onClick={() => setAccountDrawerGroup('envelope')} className="card flex flex-col gap-1 text-left hover:bg-gray-800/50 transition-colors">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500 font-medium">✉️ Envelope</span>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: COLORS.variable + '20' }}>
                  <Mail size={14} style={{ color: COLORS.variable }} />
                </div>
              </div>
              <p className="text-xl font-bold text-white">{fmt(accountSnapshots.envelope.saldoTotal)}</p>
              <p className="text-xs text-gray-500">{accountSnapshots.envelope.contas[0]?.account.name || 'envelope'}</p>
            </button>
          )}
        </div>
      </div>

      {/* Disponível pra gastar — métrica derivada agregada */}
      {cycle && incomeSnap.saldoOrigem > 0 && (
        <div>
          <p className="section-title flex items-center gap-2 mb-2"><TrendingUp size={12}/> Disponível pra gastar</p>
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Disponível"
              value={incomeSnap.saldoDisponivel}
              color={incomeSnap.saldoDisponivel >= 0 ? COLORS.income : COLORS.installment}
              icon={TrendingUp}
              sub={`${incomeSnap.diasRestantes}d até virar o ciclo`}
            />
            <StatCard
              label="Reservado"
              value={incomeSnap.reserva}
              color={COLORS.reserve}
              icon={Lock}
              sub={`${cycle?.reserva_pct || 0}% do saldo`}
            />
            <StatCard
              label="Bills pagas no mês"
              value={paidBillsRendaMes}
              color={COLORS.income}
              icon={Receipt}
              sub="Sai diretamente da conta"
            />
            <StatCard
              label="% comprometido cartões"
              value={`${accountSnapshots.cards.pctComprometidoTotal?.toFixed(0) ?? 0}%`}
              color={(accountSnapshots.cards.pctComprometidoTotal ?? 0) > 90 ? COLORS.installment : (accountSnapshots.cards.pctComprometidoTotal ?? 0) > 70 ? COLORS.essential : COLORS.income}
              icon={Activity}
              sub="dos limites configurados"
            />
          </div>
        </div>
      )}
```

- [ ] **Step 5: Renderizar o AccountGroupDrawer no fim**

Localizar o fim do componente (próximo ao último `</div>` de `space-y-6`, antes do fechamento do return). Imediatamente **antes** desse último `</div>`, inserir:

```jsx
      <AccountGroupDrawer
        group={accountDrawerGroup}
        snapshot={accountDrawerGroup ? accountSnapshots[accountDrawerGroup] : null}
        onClose={() => setAccountDrawerGroup(null)}
      />
```

- [ ] **Step 6: Verificação manual (smoke test)**

Rodar `npm run dev`. Abrir Dashboard:

1. **Empty state:** Sem nenhuma transaction, os 4 cards devem aparecer (5 contas no seed cobrem todos os grupos) com R$ 0,00. Empréstimos e Envelope: 0. Cartões: "sem limite configurado".
2. **Preencher saldos:** Ir em /settings → editar NuBank CC → opening_balance 1500 → Salvar. Card Bancos vira R$ 1.500,00.
3. **Editar limite de cartão:** /settings → NuBank Crédito → Limite 3000 → Salvar. Card Cartões vira R$ 0,00 de R$ 3.000,00 (0%).
4. **Lançar expense bank:** /transactions → Add expense 200 vinculado à NuBank CC. Card Bancos vira R$ 1.300,00.
5. **Lançar expense credit:** Add expense 500 vinculado a NuBank Crédito. Card Cartões: R$ 500,00 de R$ 3.000,00 (17%).
6. **Drill-down:** Tocar nos 4 cards → drawer abre, mostra contas com saldos individuais.
7. **"Disponível pra gastar":** Aparece se ciclo + saldoOrigem > 0. Validar que muda quando saldo das contas muda.
8. **Drawer Ritmo/Reserva/Metas (legado):** Continua funcionando — botão flutuante no rodapé.

- [ ] **Step 7: Commit**

```bash
git add src/pages/DashboardPage.jsx
git commit -m "feat(dashboard): 4 cards agregados por tipo de conta + drill-down (Onda 4)"
```

---

## Task 7: Atualizar INVENTARIO.md

**Files:**
- Modify: `INVENTARIO.md`

- [ ] **Step 1: Ler o INVENTARIO atual**

```bash
head -200 INVENTARIO.md
```

- [ ] **Step 2: Adicionar seção "Onda 4 — Dashboard multi-conta" no INVENTARIO**

Localizar onde termina a seção da Onda 3 (procurar por "Onda 3" no arquivo). Adicionar logo abaixo:

```markdown
### Onda 4 — Dashboard multi-conta (2026-05-15)
- ✅ Migration `migration_account_balances.sql` aplicada (opening_balance + credit_limit)
- ✅ `budgetEngine.computeAccountSnapshot` + `computeAccountsGroupSnapshot`
- ✅ Hook `useAccountSnapshots` em `useData.js`
- ✅ Componente `AccountGroupDrawer.jsx` (drill-down por grupo)
- ✅ DashboardPage com 4 cards agregados (Bancos / Cartões / Empréstimos / Envelope)
- ✅ AccountModal ganha `opening_balance` e `credit_limit`
- ⚠️ `cycle.saldo_origem_income/credit` deprecated mas não removidos (compat)
- ⚠️ Ciclos cross-month (15/05→15/06) ainda filtram tx por `month_ref` — herdado, fora de escopo
```

- [ ] **Step 3: Commit**

```bash
git add INVENTARIO.md
git commit -m "docs: atualiza INVENTARIO.md pos-Onda4"
```

---

## Final Sanity Check

- [ ] **Step 1: Smoke test end-to-end**

Rodar `npm run dev`. Validar fluxo completo:

1. Dashboard carrega sem erro de console
2. 4 cards multi-conta aparecem
3. Drill-down funciona em cada card
4. Editar saldo em SettingsPage → Dashboard atualiza (realtime via canal `accounts`)
5. Add transaction com `account_id` → Dashboard atualiza (realtime via canal `transactions`)
6. Drawer Ritmo/Reserva/Metas (legado) continua funcionando
7. Métricas de Reserva e Ritmo da semana batem com saldo derivado

- [ ] **Step 2: Verificar git log**

```bash
git log --oneline auditoria-features ^main | head -10
```

Esperado: ~7 commits da Onda 4 (migration, engine, hook, settings, drawer, dashboard, inventário).

---

## Notas de migração de dados

- Após aplicar a migration `migration_account_balances.sql`, todas as contas do seed ficam com `opening_balance = 0` e `credit_limit = 0`. USER precisa preencher via SettingsPage:
  - **NuBank Conta Corrente** → `opening_balance` = saldo real atual do banco
  - **NuBank Crédito** → `credit_limit` = limite real do cartão
  - **PicPay Crédito** → `credit_limit` = limite real
  - **Biplay** → deixar zero (sem limite tradicional)
  - **Aluguel (esposa)** → `opening_balance` = 0 (vai construindo via transactions)

- Lançamentos antigos (pré-Onda 3) sem `account_id` ficam invisíveis no Dashboard novo mas continuam aparecendo no Histórico. Como o user fez wipe, isso é não-issue.

---

## Out of scope (registrado)

- ❌ Fatura crédito → Onda 5
- ❌ CSV importer NuBank → Onda 6
- ❌ Cross-month cycle filtering → futuro
- ❌ Remoção de `cycle.saldo_origem_*` do schema → cleanup futuro
- ❌ Bug bills antigas FK NULL → descartado (wipe resolveu)
