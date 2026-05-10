# Onda 1 — Limpeza zero-risco Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover o fluxo WeeklyCheckpoint completo do FinAPP (0 registros em produção), incluindo modal, chart Previsto×Real, tab Histórico do Planejamento, action `record_checkpoint` da IA, e funções utilitárias órfãs (`healthStatus`, `isoWeekBounds`). Tabela `weekly_checkpoints` preservada no banco.

**Architecture:** Remoção por área (1 commit por arquivo lógico), sem TDD (não há lógica nova). Validação via `npm run build` após cada commit + smoke test manual no fim. Branch já existente: `auditoria-features`.

**Tech Stack:** React 19, Vite 8, Supabase. Sem testes unitários nesta branch.

**Spec:** [docs/superpowers/specs/2026-05-07-onda1-limpeza-design.md](docs/superpowers/specs/2026-05-07-onda1-limpeza-design.md)

**Branch:** `auditoria-features` (já checada)

---

## File Structure

Arquivos tocados (apenas remoção; nenhum criado):

| Arquivo | Ação |
|---|---|
| `src/components/WeeklyCheckpointModal.jsx` | DELETAR |
| `src/pages/DashboardPage.jsx` | MODIFICAR — remove import, state, botão, chart, modal render, imports recharts |
| `src/pages/BudgetPage.jsx` | MODIFICAR — remove tab Histórico + useCheckpoints + StatusBadge |
| `src/pages/ChatPage.jsx` | MODIFICAR — remove branch record_checkpoint + imports relacionados |
| `src/lib/db.js` | MODIFICAR — remove getCheckpoints/addCheckpoint/deleteCheckpoint + lastCheckpoints de getAIContext |
| `src/lib/budgetEngine.js` | MODIFICAR — remove healthStatus + isoWeekBounds |
| `src/lib/claude.js` | MODIFICAR — remove lastCheckpoints destructure, seção checkpoints do prompt, exemplo record_checkpoint |
| `src/hooks/useData.js` | MODIFICAR — remove checkpoints de useDashboard + useCheckpoints inteiro |
| `INVENTARIO.md` | MODIFICAR — atualizar nota pós-Onda1 |

Tabela `weekly_checkpoints` no banco fica intacta (sem DROP).

---

## Validation Strategy

Sem testes unitários novos. Validação por:
1. `npm run build` após cada commit — pega imports órfãos imediatamente
2. Smoke test manual no fim do plano:
   - `/budget` mostra só 2 tabs (Renda, Crédito)
   - Dashboard sem botão "Fechar semana" e sem chart Previsto×Real
   - Chat carrega normal

---

### Task 1: Remover WeeklyCheckpointModal component

**Files:**
- Delete: `src/components/WeeklyCheckpointModal.jsx`

- [ ] **Step 1: Verificar zero referências antes de deletar**

Run: `grep -r "WeeklyCheckpointModal" src/`
Expected: 1 ocorrência só — o import em `src/pages/DashboardPage.jsx`. (Esse import será removido na Task 2.)

- [ ] **Step 2: Deletar o arquivo**

```bash
rm src/components/WeeklyCheckpointModal.jsx
```

- [ ] **Step 3: Confirmar deleção**

Run: `ls src/components/`
Expected: arquivo não aparece. Outros components (`InstallPrompt.jsx`, `UpdatePrompt.jsx`, `layout/`) seguem.

- [ ] **Step 4: NÃO rodar build ainda** — DashboardPage ainda importa esse arquivo. Build vai quebrar até a Task 2.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(cleanup): remove WeeklyCheckpointModal component"
```

Build estará quebrado aqui — será corrigido na Task 2.

---

### Task 2: Remover Fechar semana + chart Previsto×Real do Dashboard

**Files:**
- Modify: `src/pages/DashboardPage.jsx`

Várias remoções no mesmo arquivo. Faça-as em ordem.

- [ ] **Step 1: Remover import do modal deletado**

Linha 10 — remover:
```jsx
import WeeklyCheckpointModal from '../components/WeeklyCheckpointModal'
```

- [ ] **Step 2: Remover imports recharts (linha 8 inteira)**

Linha 8 atual:
```jsx
import { Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
```

Remover a linha inteira (recharts não é usado em mais nenhum lugar do app — verificamos via grep).

- [ ] **Step 3: Remover state checkpointOpen**

Linha 61 — remover:
```jsx
const [checkpointOpen, setCheckpointOpen] = useState(false)
```

- [ ] **Step 4: Remover `checkpoints` da destructure de `data`**

Linha 65 atual:
```jsx
const { bills = [], goals = [], budgetItems = [], cycle = null, transactions = [], checkpoints = [] } = data || {}
```

Trocar por:
```jsx
const { bills = [], goals = [], budgetItems = [], cycle = null, transactions = [] } = data || {}
```

- [ ] **Step 5: Remover `checkpointChart` useMemo**

Linhas 95-103 atuais — remover bloco inteiro:
```jsx
const checkpointChart = useMemo(() => {
  const last = [...(checkpoints || [])].reverse().slice(-8)
  return last.map(cp => ({
    label: `${cp.week_start.slice(5)}`,
    Previsto: Number(cp.saldo_previsto),
    Real: Number(cp.saldo_real),
    status: cp.status,
  }))
}, [checkpoints])
```

- [ ] **Step 6: Remover botão "Fechar semana"**

Bloco do header da seção Renda (procurar por `setCheckpointOpen(true)`). Remover o botão inteiro:
```jsx
<button onClick={() => setCheckpointOpen(true)} className="text-xs text-emerald-400 flex items-center gap-1 hover:text-emerald-300">
  <CalendarCheck size={12}/> Fechar semana
</button>
```

A `<div>` que envolve o botão (`<div className="flex items-center justify-between mb-2">`) provavelmente também envolve o título da seção — manter o título, remover só o botão.

- [ ] **Step 7: Remover bloco do BarChart (chart Previsto×Real)**

Procurar `{checkpointChart.length > 0 && (`. Remover o bloco JSX inteiro até o `)}` correspondente. Ele contém `<ResponsiveContainer>`, `<BarChart>`, `<CartesianGrid>`, `<XAxis>`, `<YAxis>`, `<Tooltip>`, `<Legend>`, `<Bar>`, `<Cell>`.

Aproximadamente linhas 220-237.

- [ ] **Step 8: Remover render do WeeklyCheckpointModal**

Bloco final do componente:
```jsx
{checkpointOpen && (
  <WeeklyCheckpointModal
    cycle={cycle}
    items={budgetItems}
    transactions={transactions}
    bills={bills}
    userId={user?.id}
    onClose={() => setCheckpointOpen(false)}
    onSaved={refetch}
  />
)}
```

Remover inteiro. Aproximadamente linhas 240-249.

- [ ] **Step 9: Limpar imports lucide órfãos**

Verificar se `CalendarCheck` (era usado só no botão Fechar semana) ainda é usado:

Run: `grep -n "CalendarCheck" src/pages/DashboardPage.jsx`
Expected: zero ocorrências fora do import.

Se confirmado, remover `CalendarCheck` do import lucide-react no topo do arquivo.

- [ ] **Step 10: Build pra validar**

Run: `npm run build`
Expected: build limpo, sem warnings de import órfão. Tempo ~3-5s.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore(cleanup): remove botao Fechar Semana e chart Previsto x Real do Dashboard"
```

---

### Task 3: Remover tab Histórico e useCheckpoints do Planejamento

**Files:**
- Modify: `src/pages/BudgetPage.jsx`

- [ ] **Step 1: Remover useCheckpoints do import**

Linha 4 atual:
```jsx
import { useBudgetItems, useBudgetCycle, useTransactions, useCheckpoints, useMonthRef, useBills } from '../hooks/useData'
```

Trocar por:
```jsx
import { useBudgetItems, useBudgetCycle, useTransactions, useMonthRef, useBills } from '../hooks/useData'
```

- [ ] **Step 2: Remover call do hook**

Linha 259 — remover:
```jsx
const { checkpoints } = useCheckpoints(40)
```

- [ ] **Step 3: Remover entry "history" do tabs array**

Procurar o array de tabs (perto da linha 322). Atual:
```jsx
{[
  { k: 'income',  label: 'Renda',    icon: Wallet },
  { k: 'credit',  label: 'Crédito',  icon: CreditCard },
  { k: 'history', label: 'Histórico', icon: History },
].map(...)
```

Trocar por:
```jsx
{[
  { k: 'income',  label: 'Renda',    icon: Wallet },
  { k: 'credit',  label: 'Crédito',  icon: CreditCard },
].map(...)
```

- [ ] **Step 4: Trocar `grid-cols-3` por `grid-cols-2` no container das tabs**

Linha do container (perto da linha 321):
```jsx
<div className="grid grid-cols-3 gap-2">
```

Trocar por:
```jsx
<div className="grid grid-cols-2 gap-2">
```

- [ ] **Step 5: Remover bloco JSX da tab Histórico**

Procurar `{tab === 'history' && (`. Remover o bloco inteiro (aproximadamente linhas 339-359):
```jsx
{tab === 'history' && (
  <div className="space-y-2">
    <p className="section-title flex items-center gap-2"><History size={12}/> Fechamentos semanais</p>
    {checkpoints.length === 0 && (
      <div className="card text-center py-8">
        <p className="text-gray-500 text-sm">Nenhum checkpoint registrado ainda.</p>
        <p className="text-xs text-gray-600 mt-1">Use "Fechar semana" no Dashboard toda segunda-feira.</p>
      </div>
    )}
    {checkpoints.map(cp => (
      <div key={cp.id} className="card flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white">{cp.week_start} → {cp.week_end}</p>
          <p className="text-xs text-gray-500">{cp.bucket === 'credit' ? '💳 Crédito' : '💰 Renda'} · previsto {fmt(cp.saldo_previsto)} · real {fmt(cp.saldo_real)}</p>
          {cp.note && <p className="text-xs text-gray-600 mt-1 italic">"{cp.note}"</p>}
        </div>
        <StatusBadge status={cp.status}/>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 6: Remover componente StatusBadge**

Localizar `function StatusBadge` (linhas 239-251). Remover a função inteira:
```jsx
function StatusBadge({ status }) {
  const cfg = {
    green: { bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icon: CheckCircle2, label: 'Economia' },
    yellow: { bg: 'bg-amber-500/15 text-amber-300 border-amber-500/30', icon: AlertTriangle, label: 'Na meta' },
    red: { bg: 'bg-red-500/15 text-red-300 border-red-500/30', icon: AlertTriangle, label: 'Estouro' },
  }[status] || { bg: 'bg-gray-700 text-gray-400', icon: AlertTriangle, label: status }
  const Icon = cfg.icon
  return (
    <span className={`badge border ${cfg.bg} flex items-center gap-1 text-xs`}>
      <Icon size={11}/> {cfg.label}
    </span>
  )
}
```

- [ ] **Step 7: Remover imports lucide órfãos**

Verificar quais ícones só eram usados por checkpoints/StatusBadge:

Run: `grep -nE "History|CheckCircle2|AlertTriangle" src/pages/BudgetPage.jsx`
Expected: só nos imports. Se confirmado, remover `History`, `CheckCircle2`, `AlertTriangle` do import lucide-react.

Import atual (linha 3):
```jsx
import { Plus, Edit2, Trash2, Lock, TrendingUp, TrendingDown, Settings, RefreshCw, Wallet, CreditCard, History, CheckCircle2, AlertTriangle } from 'lucide-react'
```

Resultado esperado:
```jsx
import { Plus, Edit2, Trash2, Lock, TrendingUp, TrendingDown, Settings, RefreshCw, Wallet, CreditCard } from 'lucide-react'
```

- [ ] **Step 8: Build pra validar**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore(cleanup): remove tab Historico e useCheckpoints do Planejamento"
```

---

### Task 4: Remover record_checkpoint da IA (ChatPage)

**Files:**
- Modify: `src/pages/ChatPage.jsx`

- [ ] **Step 1: Remover imports relacionados a checkpoint**

Linha 7 atual:
```jsx
import { healthStatus, isoWeekBounds, computeBucketSnapshot } from '../lib/budgetEngine'
```

Verificar se `computeBucketSnapshot` ainda é usado fora do branch record_checkpoint:

Run: `grep -n "computeBucketSnapshot" src/pages/ChatPage.jsx`
Expected: 2 ocorrências — o import e dentro do `else if (type === 'record_checkpoint')`. Se confirmado, podemos remover toda a linha 7.

Remover linha 7 inteira.

- [ ] **Step 2: Remover import subDays**

Linha 8 atual:
```jsx
import { subDays } from 'date-fns'
```

Verificar se `subDays` ainda é usado:

Run: `grep -n "subDays" src/pages/ChatPage.jsx`
Expected: 2 ocorrências (import + uso dentro do branch record_checkpoint).

Se confirmado, remover linha 8.

- [ ] **Step 3: Remover addCheckpoint e getBudgetCycle do import db.js**

Linha 6 atual:
```jsx
import { getAIContext, saveChatMessage, getChatMessages, clearChat, addTransaction, upsertBill, upsertGoal, upsertBudgetItem, addCheckpoint, getBudgetCycle } from '../lib/db'
```

Verificar uso fora do record_checkpoint:

Run: `grep -nE "addCheckpoint|getBudgetCycle" src/pages/ChatPage.jsx`
Expected: 1 ocorrência cada (no import) + usos dentro do branch que vamos remover.

Trocar por:
```jsx
import { getAIContext, saveChatMessage, getChatMessages, clearChat, addTransaction, upsertBill, upsertGoal, upsertBudgetItem } from '../lib/db'
```

- [ ] **Step 4: Remover record_checkpoint do typeLabels**

Linha 48 atual:
```jsx
const typeLabels = { add_transaction: 'Lançamento', add_goal: 'Meta', add_bill: 'Conta', update_budget: 'Orçamento', add_budget_items: 'Itens de Orçamento', record_checkpoint: 'Fechar Semana' }
```

Trocar por:
```jsx
const typeLabels = { add_transaction: 'Lançamento', add_goal: 'Meta', add_bill: 'Conta', update_budget: 'Orçamento', add_budget_items: 'Itens de Orçamento' }
```

- [ ] **Step 5: Remover branch record_checkpoint em approveAction**

Procurar `} else if (type === 'record_checkpoint') {`. Remover o bloco inteiro (linhas 317-340 aproximadamente):
```jsx
} else if (type === 'record_checkpoint') {
  const ctx = await getAIContext()
  const monthRef = format(new Date(), 'yyyy-MM')
  const cycle = await getBudgetCycle(monthRef)
  if (!cycle) throw new Error('Nenhum ciclo configurado. Configure o ciclo em /budget antes de fechar a semana.')
  for (const item of items) {
    const bucket = item.bucket === 'credit' ? 'credit' : 'income'
    const bounds = item.week_start && item.week_end
      ? { week_start: item.week_start, week_end: item.week_end }
      : isoWeekBounds(subDays(new Date(), 7))
    const snap = computeBucketSnapshot({ bucket, cycle, items: ctx.budgetItems || [], transactions: ctx.transactions || [], bills: ctx.bills || [] })
    const saldoReal = parseFloat(item.saldo_real || item.amount || 0)
    check(await addCheckpoint({
      user_id: user.id,
      cycle_id: cycle.id,
      week_start: bounds.week_start,
      week_end: bounds.week_end,
      bucket,
      saldo_previsto: snap.saldoDisponivel,
      saldo_real: saldoReal,
      status: healthStatus(saldoReal, snap.saldoDisponivel),
      note: item.note || null,
    }))
  }
}
```

O `else` final (catch-all que trata como transação desconhecida) permanece.

- [ ] **Step 6: Build pra validar**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore(cleanup): remove record_checkpoint da IA (ChatPage + imports relacionados)"
```

---

### Task 5: Remover getCheckpoints/addCheckpoint/deleteCheckpoint de db.js

**Files:**
- Modify: `src/lib/db.js`

- [ ] **Step 1: Remover bloco WEEKLY CHECKPOINTS**

Localizar o bloco `// ─── WEEKLY CHECKPOINTS ───...` (próximo da linha 142). Remover o bloco inteiro:

```jsx
// ─── WEEKLY CHECKPOINTS ──────────────────────────────────────────────────────
export const getCheckpoints = (userId, limit = 20) =>
  supabase.from('weekly_checkpoints').select('*').order('week_start', { ascending: false }).limit(limit)

export const addCheckpoint = (cp) =>
  supabase.from('weekly_checkpoints').insert(cp).select().single()

export const deleteCheckpoint = (id) =>
  supabase.from('weekly_checkpoints').delete().eq('id', id)
```

- [ ] **Step 2: Remover getCheckpoints de getAIContext**

Localizar a função `getAIContext` (próximo da linha 153). Atual:
```jsx
export const getAIContext = async () => {
  const monthRef = format(new Date(), 'yyyy-MM')
  const [{ data: items }, { data: txs }, { data: goals }, { data: upcoming }, { data: monthBills }, cycle, { data: checkpoints }] = await Promise.all([
    getBudgetItems(),
    getTransactions(monthRef),
    getGoals(),
    getUpcomingBills(10),
    getBills(monthRef),
    getBudgetCycle(monthRef),
    getCheckpoints(null, 4),
  ])
  const freeBalance = computeFreeBalance(items || [])
  const incomeSnapshot = computeBucketSnapshot({ bucket: 'income', cycle, items: items || [], transactions: txs || [], bills: monthBills || [] })
  const creditSnapshot = computeBucketSnapshot({ bucket: 'credit', cycle, items: items || [], transactions: txs || [], bills: monthBills || [] })
  const reservaSnapshot = computeReservaSnapshot({ cycle, transactions: txs || [] })
  return {
    monthRef,
    budgetItems: items,
    transactions: txs,
    goals,
    upcomingBills: upcoming,
    bills: monthBills,
    freeBalance,
    cycle,
    incomeSnapshot,
    creditSnapshot,
    reservaSnapshot,
    lastCheckpoints: checkpoints || [],
  }
}
```

Trocar por:
```jsx
export const getAIContext = async () => {
  const monthRef = format(new Date(), 'yyyy-MM')
  const [{ data: items }, { data: txs }, { data: goals }, { data: upcoming }, { data: monthBills }, cycle] = await Promise.all([
    getBudgetItems(),
    getTransactions(monthRef),
    getGoals(),
    getUpcomingBills(10),
    getBills(monthRef),
    getBudgetCycle(monthRef),
  ])
  const freeBalance = computeFreeBalance(items || [])
  const incomeSnapshot = computeBucketSnapshot({ bucket: 'income', cycle, items: items || [], transactions: txs || [], bills: monthBills || [] })
  const creditSnapshot = computeBucketSnapshot({ bucket: 'credit', cycle, items: items || [], transactions: txs || [], bills: monthBills || [] })
  const reservaSnapshot = computeReservaSnapshot({ cycle, transactions: txs || [] })
  return {
    monthRef,
    budgetItems: items,
    transactions: txs,
    goals,
    upcomingBills: upcoming,
    bills: monthBills,
    freeBalance,
    cycle,
    incomeSnapshot,
    creditSnapshot,
    reservaSnapshot,
  }
}
```

- [ ] **Step 3: Build pra validar**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(cleanup): remove getCheckpoints/addCheckpoint/deleteCheckpoint de db.js"
```

---

### Task 6: Remover healthStatus e isoWeekBounds de budgetEngine

**Files:**
- Modify: `src/lib/budgetEngine.js`

- [ ] **Step 1: Remover função healthStatus**

Localizar (próximo da linha 90):
```jsx
export function healthStatus(real, previsto) {
  const p = Number(previsto) || 0
  const r = Number(real) || 0
  if (p <= 0) return 'yellow'
  const diff = (r - p) / p
  if (diff >= 0.05) return 'green'
  if (diff <= -0.05) return 'red'
  return 'yellow'
}
```

Remover a função inteira.

- [ ] **Step 2: Remover função isoWeekBounds**

Localizar (próximo da linha 115):
```jsx
export function isoWeekBounds(date = new Date()) {
  return {
    week_start: format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    week_end: format(endOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  }
}
```

Remover a função inteira.

- [ ] **Step 3: Limpar imports date-fns órfãos**

Verificar quais date-fns funcs ficaram órfãs:

Run: `grep -nE "startOfWeek|endOfWeek" src/lib/budgetEngine.js`
Expected: pode ainda usar em `computeBucketSnapshot` (anchor de domingo). Se `endOfWeek` não tiver mais usos, remover do import.

Import atual da linha 1:
```jsx
import { differenceInCalendarDays, format, startOfWeek, endOfWeek, parseISO, isBefore } from 'date-fns'
```

Se grep confirmar que `endOfWeek` não é mais usado, trocar por:
```jsx
import { differenceInCalendarDays, format, startOfWeek, parseISO, isBefore } from 'date-fns'
```

Se `format` ainda for usado em outras funções (provavelmente sim, em `computeReservaSnapshot` ou similar), mantém.

- [ ] **Step 4: Build pra validar**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(cleanup): remove healthStatus e isoWeekBounds de budgetEngine"
```

---

### Task 7: Remover lastCheckpoints e exemplo record_checkpoint do prompt da IA

**Files:**
- Modify: `src/lib/claude.js`

- [ ] **Step 1: Remover lastCheckpoints da destructure**

Linha 9 atual:
```jsx
const { monthRef, budgetItems, transactions, goals, upcomingBills, freeBalance = 0, cycle, incomeSnapshot, creditSnapshot, reservaSnapshot, lastCheckpoints = [] } = context
```

Trocar por:
```jsx
const { monthRef, budgetItems, transactions, goals, upcomingBills, freeBalance = 0, cycle, incomeSnapshot, creditSnapshot, reservaSnapshot } = context
```

- [ ] **Step 2: Remover seção "ÚLTIMOS CHECKPOINTS SEMANAIS" do prompt**

Localizar no template (perto da linha 40):
```
## ÚLTIMOS CHECKPOINTS SEMANAIS
${lastCheckpoints.slice(0, 4).map(c => `- ${c.week_start}→${c.week_end} [${c.bucket}] previsto R$${Number(c.saldo_previsto).toFixed(2)} · real R$${Number(c.saldo_real).toFixed(2)} · ${c.status}${c.note ? ` · "${c.note}"` : ''}`).join('\n') || '- Nenhum registrado ainda.'}
```

Remover essas 2 linhas (título + template expr).

- [ ] **Step 3: Remover record_checkpoint da lista de action types**

Procurar no prompt:
```
"type": "add_transaction" | "add_goal" | "add_bill" | "update_budget" | "record_checkpoint",
```

Trocar por:
```
"type": "add_transaction" | "add_goal" | "add_bill" | "update_budget",
```

- [ ] **Step 4: Remover bloco de exemplo "Para fechar a semana (checkpoint)"**

Localizar no prompt:
```
Para fechar a semana (checkpoint):
{
  "type": "record_checkpoint",
  "data": { "bucket": "income" | "credit" | "reserve", "saldo_real": 3200, "week_start": "2026-04-06", "note": "opcional" },
  "description": "Fecha a semana com saldo real informado"
}
```

Remover o bloco inteiro (5-8 linhas incluindo título e quebras em volta).

- [ ] **Step 5: Build pra validar**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(cleanup): remove lastCheckpoints e exemplo record_checkpoint do prompt da IA"
```

---

### Task 8: Remover useCheckpoints e checkpoints de useDashboard

**Files:**
- Modify: `src/hooks/useData.js`

- [ ] **Step 1: Remover getCheckpoints da Promise.all em useDashboard**

Localizar a função `useDashboard` (próximo da linha 11). Atual:
```jsx
export function useDashboard(monthRef) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: bills }, { data: goals }, { data: items }, cycle, { data: txs }, { data: checkpoints }] = await Promise.all([
      db.getBills(monthRef),
      db.getGoals(),
      db.getBudgetItems(),
      db.getBudgetCycle(monthRef),
      db.getTransactions(monthRef),
      db.getCheckpoints(null, 8),
    ])
    setData({ bills, goals, budgetItems: items, cycle, transactions: txs, checkpoints: checkpoints || [] })
    setLoading(false)
  }, [monthRef])
```

Trocar por:
```jsx
export function useDashboard(monthRef) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: bills }, { data: goals }, { data: items }, cycle, { data: txs }] = await Promise.all([
      db.getBills(monthRef),
      db.getGoals(),
      db.getBudgetItems(),
      db.getBudgetCycle(monthRef),
      db.getTransactions(monthRef),
    ])
    setData({ bills, goals, budgetItems: items, cycle, transactions: txs })
    setLoading(false)
  }, [monthRef])
```

- [ ] **Step 2: Remover canal realtime weekly_checkpoints**

No useEffect de realtime de `useDashboard` (próximo das linhas seguintes ao `load`):
```jsx
useEffect(() => {
  const channel = supabase
    .channel('dashboard')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, load)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, load)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_items' }, load)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'goals' }, load)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_cycles' }, load)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_checkpoints' }, load)
    .subscribe()
  return () => supabase.removeChannel(channel)
}, [load])
```

Remover a linha `.on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_checkpoints' }, load)`.

- [ ] **Step 3: Remover função useCheckpoints inteira**

Localizar (próximo da linha 152). Remover a função completa:
```jsx
export function useCheckpoints(limit = 20) {
  const [checkpoints, setCheckpoints] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await db.getCheckpoints(null, limit)
    setCheckpoints(data || [])
    setLoading(false)
  }, [limit])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const channel = supabase
      .channel('checkpoints')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'weekly_checkpoints' }, load)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [load])

  return { checkpoints, loading, refetch: load }
}
```

- [ ] **Step 4: Build pra validar**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(cleanup): remove useCheckpoints e checkpoints de useDashboard"
```

---

### Task 9: Atualizar INVENTARIO.md pós-Onda 1

**Files:**
- Modify: `INVENTARIO.md`

- [ ] **Step 1: Remover linhas que viraram dead-code-resolvido**

Editar `INVENTARIO.md` removendo as linhas das tabelas que referenciam features removidas. Alvos:

**Em "1. Início (Dashboard)":**
- Linha `| Botão "Fechar semana" | DashboardPage:152 ... 💤`
- Linha `| `checkpointChart` useMemo | ... 💤`
- Linha `| Imports `BarChart, Bar, ...` | ... 💤`

**Em "3. Planejamento":**
- Linha `| Tab Histórico (fechamentos semanais) | ... 💤`
- Linha `| `useCheckpoints(40)` | ... 💤`

**Em "7. Assistente IA":**
- Atualizar linha `record_checkpoint depende de cycle + cria checkpoints` removendo a menção (ou marcar como removido)

**Em "10. Layout / PWA / Auth":**
- Linha `| WeeklyCheckpointModal | ... 💤`

**Em "11. Hooks / Estado":**
- Linha `| useCheckpoints(limit) | ... 💤`

**Em "12. Lib / Engine":**
- Atualizar nota do `budgetEngine.js` removendo menção a `healthStatus` e `isoWeekBounds`

- [ ] **Step 2: Adicionar nota no rodapé**

Adicionar uma nova seção ao final do arquivo:

```markdown
---

# Histórico de execução

| Data | Onda | Mudança |
|---|---|---|
| 2026-05-07 | 1 — Limpeza | Removido fluxo WeeklyCheckpoint completo (modal, chart Previsto×Real, tab Histórico, record_checkpoint da IA, healthStatus, isoWeekBounds, useCheckpoints). Tabela `weekly_checkpoints` preservada no DB. ~300 linhas removidas. |
```

- [ ] **Step 3: Atualizar resumo executivo se necessário**

Na seção "Pontos críticos identificados (resumo executivo)" da INVENTARIO.md, item **"5. Dead code (candidato a remover) — WeeklyCheckpointModal..."** — marcar como ✅ resolvido OU remover o item inteiro (já foi feito).

Item **"6. `checkpointChart` useMemo + imports recharts"** — idem.

- [ ] **Step 4: Commit**

```bash
git add INVENTARIO.md
git commit -m "docs: atualiza INVENTARIO.md pos-Onda1 (limpeza)"
```

---

## Smoke test final (manual)

Após todos os 9 commits, executar smoke test:

- [ ] **Step 1: Build limpo**

Run: `npm run build`
Expected: ✓ built sem warnings.

- [ ] **Step 2: Verificar git log**

Run: `git log --oneline auditoria-features ^main`
Expected: 9 commits da Onda 1 + 1 commit do cherry-pick inicial + 1 do INVENTARIO + 1 do spec + 1 do plan. Total ~13 commits ahead da main.

- [ ] **Step 3: Smoke visual**

Run: `npm run dev`

Verificar no browser:
- `/budget` — header tem só "Renda" e "Crédito" como tabs (sem "Histórico")
- `/` (Dashboard) — sem botão "Fechar semana" na seção Renda
- `/` (Dashboard) — não tem mais o gráfico "Previsto × Real" no fim
- `/chat` — abre normal, mensagem de boas-vindas aparece
- Tentar pedir pra IA "fechar a semana com R$ 1000" — IA pode propor `record_checkpoint`, mas ao aprovar deve cair no catch-all (criar como transação genérica). Aceitável.

- [ ] **Step 4: Verificar tabela weekly_checkpoints no Supabase**

Dashboard Supabase → SQL Editor:
```sql
SELECT COUNT(*) FROM weekly_checkpoints;
```

Expected: tabela existe (não foi dropada), retorna 0 (vazia). Confirma que rollback é possível.

- [ ] **Step 5: Commit final de marco (opcional)**

Se quiser marcar o fim da Onda 1:
```bash
git tag -a onda1-completa -m "Onda 1: Limpeza zero-risco — fluxo WeeklyCheckpoint removido"
```

(Tag local, não precisa push pro remote agora.)

---

## Critérios de Done (spec mapping)

Cada critério do spec mapeado pra task:

- [ ] Remoções da seção 3.1 (WeeklyCheckpointModal) → Task 1
- [ ] Remoções da seção 3.2 (DashboardPage) → Task 2
- [ ] Remoções da seção 3.3 (BudgetPage) → Task 3
- [ ] Remoções da seção 3.4 (ChatPage) → Task 4
- [ ] Remoções da seção 3.5 (db.js) → Task 5
- [ ] Remoções da seção 3.6 (budgetEngine.js) → Task 6
- [ ] Remoções da seção 3.7 (claude.js) → Task 7
- [ ] Remoções da seção 3.8 (useData.js) → Task 8
- [ ] Atualização do INVENTARIO.md (seção 4) → Task 9
- [ ] Build limpo após cada commit (seção 5) → step "Build pra validar" em cada Task
- [ ] Smoke test manual (seção 5) → Smoke test final
- [ ] Tabela preservada no DB (seção 5) → Smoke test final Step 4
