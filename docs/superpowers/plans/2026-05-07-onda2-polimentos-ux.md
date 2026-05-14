# Onda 2 — Polimentos UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polir 3 áreas do app: filtro por ciclo dinâmico em Lançamentos, chip de type nas categorias (TxModal + ItemModal), e reformulação de Metas com modelo "espelho honesto" (saldo derivado de tx vinculadas, sem agressividade).

**Architecture:** Mudanças contidas em pages existentes + 1 migration nova (`transactions.goal_id`) + 1 deleção de `goalPlanner.js`. Novos hooks em `useData.js`. Sem testes unitários novos (lógica simples; smoke test manual no fim). Cada commit é um passo lógico independente.

**Tech Stack:** React 19, Vite 8, Supabase, date-fns, lucide-react.

**Spec:** [docs/superpowers/specs/2026-05-07-onda2-polimentos-ux-design.md](docs/superpowers/specs/2026-05-07-onda2-polimentos-ux-design.md)

**Branch:** `auditoria-features` (já checada)

---

## File Structure

| Arquivo | Ação | Responsabilidade após mudança |
|---|---|---|
| `migration_goal_link.sql` | CRIAR | Adicionar `transactions.goal_id` (FK pra `goals.id`) + index parcial |
| `src/pages/TransactionsPage.jsx` | MODIFICAR | Filtro por ciclo dinâmico, chip type em categorias, TxModal com campo Vincular meta |
| `src/pages/BudgetPage.jsx` | MODIFICAR | ItemModal com chip type em categorias |
| `src/pages/GoalsPage.jsx` | MODIFICAR | Sem GoalDots/agressividade; saldo derivado; Moon icon |
| `src/pages/ChatPage.jsx` | MODIFICAR | `toGoal` simplificado (sem aggressiveness) |
| `src/lib/db.js` | MODIFICAR | Novo helper `getTransactionsByRange` + cleanup do `computeFreeBalance` import |
| `src/lib/claude.js` | MODIFICAR | Prompt sem agressividade |
| `src/lib/goalPlanner.js` | DELETAR | Sai inteiro |
| `src/hooks/useData.js` | MODIFICAR | Novos hooks `useTransactionsByCycle`, `useAllGoalLinkedTransactions`, `useCycles` |
| `INVENTARIO.md` | MODIFICAR | Atualizar Metas + histórico de execução |

Tabela `goals` no DB **mantém colunas órfãs** (`aggressiveness`, `monthly_contribution`, etc.) — drop futuro.

---

## Validation Strategy

Cada task termina com `npm run build` limpo + commit. Smoke test manual no fim do plano (ver "Smoke test final").

---

### Task 1: Migration `migration_goal_link.sql`

Adiciona `transactions.goal_id` referenciando `goals.id`. User aplica manualmente no Supabase Dashboard.

**Files:**
- Create: `migration_goal_link.sql` (raiz do projeto)

- [ ] **Step 1: Criar arquivo SQL**

Cria `migration_goal_link.sql` na raiz:

```sql
-- migration_goal_link.sql
-- Vincula transações a metas (modelo "espelho honesto" da Onda 2).
-- Saldo da meta = current_amount inicial + SUM(transfer.amount) - SUM(expense.amount) onde goal_id = X.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS goal_id uuid REFERENCES goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_goal
  ON transactions(goal_id) WHERE goal_id IS NOT NULL;
```

- [ ] **Step 2: Commit**

```bash
git add migration_goal_link.sql
git commit -m "feat(migration): adiciona transactions.goal_id pra vincular tx a meta"
```

- [ ] **Step 3: Lembrar o user de aplicar no Supabase Dashboard**

Não rodar a migration agora — fica como ação manual do user após o plan completar (vai no smoke test). Adicionar à lista de USER ACTIONS.

---

### Task 2: TxModal categoria com chip de type

**Files:**
- Modify: `src/pages/TransactionsPage.jsx`

- [ ] **Step 1: Adicionar mapa `CATEGORY_TYPE_LABELS`**

No topo de `TransactionsPage.jsx`, antes do componente, adicionar (junto com outros const):

```jsx
const CATEGORY_TYPE_LABELS = {
  income: 'Receita',
  essential: 'Essencial',
  variable: 'Variável',
  installment: 'Parcela',
  investment: 'Investimento',
  reserve: 'Reserva',
}
```

- [ ] **Step 2: Mudar renderização do `<option>` no select de categoria**

Localizar dentro do TxModal:
```jsx
<select className="input" value={form.category_id} onChange={e => set('category_id', e.target.value)}>
  <option value="">Selecionar...</option>
  {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
</select>
```

Substituir o map por:
```jsx
{categories.map(c => (
  <option key={c.id} value={c.id}>
    [{CATEGORY_TYPE_LABELS[c.type] || '—'}] {c.icon} {c.name}
  </option>
))}
```

- [ ] **Step 3: Build pra validar**

Run: `npm run build`
Expected: build limpo (sem warnings).

- [ ] **Step 4: Commit**

```bash
git add src/pages/TransactionsPage.jsx
git commit -m "feat(tx): TxModal categoria mostra chip de type"
```

---

### Task 3: ItemModal categoria com chip de type

**Files:**
- Modify: `src/pages/BudgetPage.jsx`

- [ ] **Step 1: Localizar `TYPE_LABELS` existente em BudgetPage**

Linha 15 atual:
```jsx
const TYPE_LABELS = { income: 'Receita', investment: 'Investimento', essential: 'Essencial', variable: 'Variável', installment: 'Parcela/Empréstimo', reserve: 'Reserva' }
```

Esse mapa já cobre os 6 types. Reutilizar — sem mudança no mapa.

- [ ] **Step 2: Mudar renderização do `<option>` no ItemModal**

Localizar dentro de `ItemModal` (linha ~55):
```jsx
<select className="input" value={form.category_id} onChange={e => set('category_id', e.target.value)}>
  <option value="">Selecionar...</option>
  {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name} — {TYPE_LABELS[c.type]}</option>)}
</select>
```

Substituir o map por:
```jsx
{categories.map(c => (
  <option key={c.id} value={c.id}>
    [{TYPE_LABELS[c.type] || '—'}] {c.icon} {c.name}
  </option>
))}
```

(Troca o em-dash `—` por prefixo `[type]` no início.)

- [ ] **Step 3: Build pra validar**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 4: Commit**

```bash
git add src/pages/BudgetPage.jsx
git commit -m "feat(budget): ItemModal categoria mostra chip de type"
```

---

### Task 4: Lançamentos navega por ciclo dinâmico

Maior task. Substitui `monthRef` por range de datas, adiciona hooks novos, refatora navegação por setas.

**Files:**
- Modify: `src/hooks/useData.js`
- Modify: `src/lib/db.js`
- Modify: `src/pages/TransactionsPage.jsx`

- [ ] **Step 1: Adicionar helper `getTransactionsByRange` em `db.js`**

Em `src/lib/db.js`, após o `getTransactions` existente (linha ~36), adicionar:

```jsx
export const getTransactionsByRange = (startDate, endDate) =>
  supabase
    .from('transactions')
    .select('*, categories(*), budget_items(name)')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })
```

NÃO remover o `getTransactions(monthRef)` antigo — BudgetPage ainda usa.

- [ ] **Step 2: Adicionar hooks novos em `useData.js`**

Em `src/hooks/useData.js`, depois do `useTransactions` existente (linha ~46), adicionar:

```jsx
export function useTransactionsByCycle(startDate, endDate) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!startDate || !endDate) {
      setTransactions([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await db.getTransactionsByRange(startDate, endDate)
    setTransactions(data || [])
    setLoading(false)
  }, [startDate, endDate])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('tx-cycle').on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, load).subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { transactions, loading, refetch: load }
}

export function useCycles() {
  const [cycles, setCycles] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('budget_cycles').select('*').order('start_date', { ascending: false })
    setCycles(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('cycles-list').on('postgres_changes', { event: '*', schema: 'public', table: 'budget_cycles' }, load).subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { cycles, loading, refetch: load }
}
```

- [ ] **Step 3: Refatorar `TransactionsPage.jsx` — imports + state**

Substituir os imports do topo (manter os existentes, adicionar/trocar):

```jsx
import { useState, useEffect, useMemo } from 'react'
import { format, parseISO, startOfWeek, isSameDay, isAfter, isBefore } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, Trash2, ChevronLeft, ChevronRight, Filter, Edit2, TrendingUp, TrendingDown, ArrowRightLeft, Sparkles, Activity } from 'lucide-react'
import { useBudgetItems, useTransactionsByCycle, useCycles, useBills } from '../hooks/useData'
import { addTransaction, deleteTransaction, updateTransaction } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import { PAYMENT_SOURCE_LABELS, PAYMENT_SOURCE_ORDER, computeBucketSnapshot, computeReservaSnapshot, bucketOf } from '../lib/budgetEngine'
```

(Removeu `useTransactions`, `useMonthRef`, `useBudgetCycle`, `subMonths`, `addMonths`. Adicionou `useTransactionsByCycle`, `useCycles`, `useEffect`.)

- [ ] **Step 4: Refatorar state de navegação no `TransactionsPage`**

Substituir as primeiras linhas da função `TransactionsPage` (linhas ~168-183):

```jsx
export default function TransactionsPage() {
  const { cycles, loading: cyclesLoading } = useCycles()
  const [currentCycleId, setCurrentCycleId] = useState(null)

  // Setar ciclo inicial = o que contém today, ou o mais recente
  useEffect(() => {
    if (cyclesLoading || cycles.length === 0 || currentCycleId) return
    const today = format(new Date(), 'yyyy-MM-dd')
    const containing = cycles.find(c => c.start_date <= today && today <= c.end_date)
    setCurrentCycleId((containing || cycles[0]).id)
  }, [cycles, cyclesLoading, currentCycleId])

  const currentCycle = useMemo(() => cycles.find(c => c.id === currentCycleId), [cycles, currentCycleId])
  const cycleIndex = useMemo(() => cycles.findIndex(c => c.id === currentCycleId), [cycles, currentCycleId])

  const { transactions, loading: txLoading, refetch } = useTransactionsByCycle(
    currentCycle?.start_date,
    currentCycle?.end_date,
  )
  const { items: budgetItems, categories } = useBudgetItems()
  const { bills } = useBills(currentCycle?.month_ref)  // bills ainda filtra por month_ref
  const { user } = useAuth()
  const [modal, setModal] = useState(null)
  const [filterType, setFilterType] = useState('all')

  // Navegação de ciclo (cycles está ordenado start_date DESC, então cycles[0] é o mais recente)
  const prevCycle = () => {
    if (cycleIndex < cycles.length - 1) setCurrentCycleId(cycles[cycleIndex + 1].id)
  }
  const nextCycle = () => {
    if (cycleIndex > 0) setCurrentCycleId(cycles[cycleIndex - 1].id)
  }

  const cycleLabel = currentCycle
    ? `${format(parseISO(currentCycle.start_date), 'dd/MM/yyyy')} → ${format(parseISO(currentCycle.end_date), 'dd/MM/yyyy')}`
    : 'Sem ciclo'
  const isCurrentCycle = (() => {
    if (!currentCycle) return false
    const today = format(new Date(), 'yyyy-MM-dd')
    return currentCycle.start_date <= today && today <= currentCycle.end_date
  })()

  const filtered = filterType === 'all' ? transactions : transactions.filter(t => t.type === filterType)
  const loading = cyclesLoading || txLoading
```

- [ ] **Step 5: Refatorar bloco `incomeSnap` e `reservaSnap`**

Mudar o useMemo do snapshot:

```jsx
const incomeSnap = useMemo(
  () => computeBucketSnapshot({ bucket: 'income', cycle: currentCycle, items: budgetItems, transactions, bills }),
  [currentCycle, budgetItems, transactions, bills]
)
const reservaSnap = useMemo(
  () => computeReservaSnapshot({ cycle: currentCycle, transactions }),
  [currentCycle, transactions]
)
```

- [ ] **Step 6: Refatorar header + Empty state**

Trocar header do JSX. Localizar o bloco da navegação mensal (linhas ~253-258):

```jsx
{/* Month nav */}
<div className="card flex items-center justify-between">
  <button onClick={prevMonth} className="p-2 hover:text-emerald-400 text-gray-400 transition-colors"><ChevronLeft size={18}/></button>
  <p className="font-semibold text-white capitalize">{monthLabel}</p>
  <button onClick={nextMonth} className="p-2 hover:text-emerald-400 text-gray-400 transition-colors"><ChevronRight size={18}/></button>
</div>
```

Substituir por:

```jsx
{/* Cycle nav */}
<div className="card flex items-center justify-between">
  <button
    onClick={prevCycle}
    disabled={cycleIndex >= cycles.length - 1}
    className="p-2 hover:text-emerald-400 text-gray-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
  >
    <ChevronLeft size={18}/>
  </button>
  <p className="font-semibold text-white">{cycleLabel}</p>
  <button
    onClick={nextCycle}
    disabled={cycleIndex <= 0}
    className="p-2 hover:text-emerald-400 text-gray-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
  >
    <ChevronRight size={18}/>
  </button>
</div>
```

- [ ] **Step 7: Adicionar empty state quando não há ciclo**

Logo após o header da página (depois do `<h1>` + botão Novo), antes do bloco Cycle nav, adicionar:

```jsx
{!cyclesLoading && cycles.length === 0 && (
  <div className="card text-center py-8">
    <p className="text-sm text-gray-400">Nenhum ciclo configurado.</p>
    <p className="text-xs text-gray-500 mt-1">
      Vá em <span className="text-emerald-400">Planejamento → Configurar ciclo</span> pra começar.
    </p>
  </div>
)}
```

E envolver o resto do conteúdo (Cycle nav, cards, lista de tx) em `{currentCycle && (...)}`.

- [ ] **Step 8: Substituir `isCurrentMonth` por `isCurrentCycle` no bloco Ritmo**

Linha que abre o card "Ritmo de gasto" (procurar `isCurrentMonth && cycle`):
```jsx
{isCurrentMonth && cycle && (
```

Substituir por:
```jsx
{isCurrentCycle && currentCycle && (
```

- [ ] **Step 9: Substituir `cycle` por `currentCycle` em outros usos**

Outros lugares que usam `cycle` no JSX/cálculos:
- Em `useMemo(metrics)`: usa `incomeSnap` que já foi atualizado. OK
- Card "Ritmo de gasto": usa `metrics.orcamentoDia`/`Semana` — OK, vem do `incomeSnap` atualizado

Nenhuma outra mudança necessária. Confirma com `grep "\bcycle\b" src/pages/TransactionsPage.jsx` — deve ser só `currentCycle` agora (exceto em comentários).

- [ ] **Step 10: Build pra validar**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(tx): Lancamentos navega por ciclo dinamico (start_date -> end_date)"
```

---

### Task 5: GoalsPage com saldo derivado de tx (sem GoalDots)

**Files:**
- Modify: `src/hooks/useData.js`
- Modify: `src/pages/GoalsPage.jsx`

- [ ] **Step 1: Adicionar hook `useGoalLinkedTransactions` em `useData.js`**

Em `src/hooks/useData.js`, no fim do arquivo (antes do `}` final ou depois do último export), adicionar:

```jsx
export function useGoalLinkedTransactions() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('transactions')
      .select('id, amount, type, date, goal_id')
      .not('goal_id', 'is', null)
    setTransactions(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('tx-goals').on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, load).subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { transactions, loading, refetch: load }
}
```

- [ ] **Step 2: Refatorar `GoalsPage.jsx` — imports**

Substituir os imports do topo:

```jsx
import { useState, useMemo } from 'react'
import { Plus, Trash2, Edit2, Target, Lock, CheckCircle2, Moon } from 'lucide-react'
import { useGoals, useGoalLinkedTransactions, useCycles, useTransactionsByCycle } from '../hooks/useData'
import { upsertGoal, deleteGoal } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
```

(Removeu: `Sparkles`, `useBudgetItems`, `AGGRESSIVENESS_*`, `computeFreeBalance`, `computeGoalPlan`. Adicionou: `Moon`, `useGoalLinkedTransactions`, `useCycles`, `useTransactionsByCycle`.)

- [ ] **Step 3: Substituir EMPTY const**

Linha atual (~14-23):
```jsx
const EMPTY = {
  name: '',
  description: '',
  target_amount: '',
  current_amount: '0',
  aggressiveness: 'medium',
  is_fixed: false,
  priority: 1,
  category: '',
}
```

Substituir por:
```jsx
const EMPTY = {
  name: '',
  description: '',
  target_amount: '',
  current_amount: '0',
  is_fixed: false,
  priority: 1,
  category: '',
}
```

(Removeu `aggressiveness`.)

- [ ] **Step 4: Substituir `GoalModal` inteiro**

Substituir a função `GoalModal` (linhas ~27-147) por:

```jsx
function GoalModal({ initial, onClose, onSaved, userId }) {
  const [form, setForm] = useState(() => {
    if (initial?.id) return { ...EMPTY, ...initial }
    return EMPTY
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!form.name || !form.target_amount) return
    setSaving(true)
    const payload = {
      ...(form.id ? { id: form.id } : {}),
      name: form.name,
      description: form.description,
      target_amount: parseFloat(form.target_amount),
      current_amount: parseFloat(form.current_amount) || 0,
      is_fixed: form.is_fixed,
      priority: form.priority,
      category: form.category,
      user_id: userId,
    }
    await upsertGoal(payload)
    onSaved()
    onClose()
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-lg text-white">{form.id ? 'Editar' : 'Nova'} Meta</h2>

        <div>
          <label className="label">Nome da meta</label>
          <input className="input" placeholder="Ex: Placa de vídeo, Viagem..." value={form.name} onChange={e => set('name', e.target.value)} />
        </div>

        <div>
          <label className="label">Descrição</label>
          <textarea className="input resize-none" rows={2} placeholder="Detalhes..." value={form.description} onChange={e => set('description', e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Valor alvo (R$)</label>
            <input className="input" type="number" step="0.01" placeholder="0,00" value={form.target_amount} onChange={e => set('target_amount', e.target.value)} />
          </div>
          <div>
            <label className="label" title="Quanto você já tinha guardado pra essa meta antes de começar a vincular tx no app. Depois de criada, o saldo é atualizado automaticamente pelas tx vinculadas.">
              Valor inicial já guardado (R$)
            </label>
            <input className="input" type="number" step="0.01" placeholder="0,00" value={form.current_amount} onChange={e => set('current_amount', e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Prioridade (1 = alta)</label>
          <input className="input" type="number" min={1} max={10} value={form.priority} onChange={e => set('priority', parseInt(e.target.value) || 1)} />
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="gfixed" checked={form.is_fixed} onChange={e => set('is_fixed', e.target.checked)} className="accent-amber-500 w-4 h-4"/>
          <label htmlFor="gfixed" className="text-sm text-gray-300">Meta fixa (protegida no replanejamento)</label>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={saving || !form.name || !form.target_amount} className="btn-primary flex-1">{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Remover componente `GoalDots`**

Localizar `function GoalDots(...)` (linhas ~149-178) e remover **a função inteira**.

- [ ] **Step 6: Substituir `GoalsPage` (default export) inteiro**

Substituir a função `GoalsPage` (linhas ~180-330) por:

```jsx
export default function GoalsPage() {
  const { goals, loading, refetch } = useGoals()
  const { transactions: linkedTxs } = useGoalLinkedTransactions()
  const { cycles } = useCycles()
  const { user } = useAuth()
  const [modal, setModal] = useState(null)

  const currentCycle = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return cycles.find(c => c.start_date <= today && today <= c.end_date) || null
  }, [cycles])

  const { transactions: cycleTxs } = useTransactionsByCycle(
    currentCycle?.start_date,
    currentCycle?.end_date,
  )

  function computeGoalAmount(goal) {
    const initial = Number(goal.current_amount) || 0
    let fromTx = 0
    for (const t of linkedTxs) {
      if (t.goal_id !== goal.id) continue
      if (t.type === 'transfer') fromTx += Number(t.amount)
      else if (t.type === 'expense') fromTx -= Number(t.amount)
    }
    return Math.max(initial + fromTx, 0)
  }

  function hasMovementInCycle(goalId) {
    return cycleTxs.some(t => t.goal_id === goalId)
  }

  async function handleDelete(goal) {
    if (goal.is_fixed && !confirm(`"${goal.name}" é uma meta fixa. Confirma exclusão?`)) return
    if (!goal.is_fixed && !confirm(`Excluir meta "${goal.name}"?`)) return
    await deleteGoal(goal.id)
    refetch()
  }

  async function toggleComplete(goal) {
    await upsertGoal({ ...goal, is_completed: !goal.is_completed })
    refetch()
  }

  const active = goals.filter(g => !g.is_completed)
  const completed = goals.filter(g => g.is_completed)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Metas Financeiras</h1>
        <button onClick={() => setModal({})} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={16}/> Nova meta
        </button>
      </div>

      {loading ? <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="card h-28 animate-pulse bg-gray-800"/>)}</div> : (
        <div className="space-y-3">
          {active.length === 0 && (
            <div className="card text-center py-10">
              <Target size={32} className="text-gray-700 mx-auto mb-2"/>
              <p className="text-gray-500 text-sm">Nenhuma meta ativa.</p>
              <button onClick={() => setModal({})} className="text-emerald-400 text-sm hover:text-emerald-300 mt-2">+ Criar primeira meta</button>
            </div>
          )}
          {active.map(g => {
            const currentAmount = computeGoalAmount(g)
            const targetAmount = Number(g.target_amount) || 0
            const pct = targetAmount > 0 ? Math.min((currentAmount / targetAmount) * 100, 100) : 0
            const moved = hasMovementInCycle(g.id)
            return (
              <div key={g.id} className="card animate-in">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-white">{g.name}</p>
                      {g.is_fixed && <Lock size={12} className="text-amber-400"/>}
                      <span className="badge bg-gray-700 text-gray-400 text-xs">P{g.priority}</span>
                      {!moved && <Moon size={12} className="text-gray-500" title="Sem aporte neste ciclo"/>}
                    </div>
                    {g.description && <p className="text-xs text-gray-500 mt-0.5">{g.description}</p>}
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => toggleComplete(g)} title="Marcar concluída" className="text-gray-600 hover:text-emerald-400 p-1"><CheckCircle2 size={16}/></button>
                    <button onClick={() => setModal(g)} className="text-gray-600 hover:text-gray-400 p-1"><Edit2 size={14}/></button>
                    <button onClick={() => handleDelete(g)} className="text-gray-600 hover:text-red-400 p-1"><Trash2 size={14}/></button>
                  </div>
                </div>

                <div className="w-full bg-gray-800 rounded-full h-2 mb-2">
                  <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }}/>
                </div>

                <div className="flex justify-between text-xs text-gray-400">
                  <span>R$ {currentAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  <span className="font-medium text-white">{pct.toFixed(0)}%</span>
                  <span>R$ {targetAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              </div>
            )
          })}

          {completed.length > 0 && (
            <div>
              <p className="section-title mt-4">Concluídas 🎉</p>
              {completed.map(g => (
                <div key={g.id} className="card opacity-60 flex items-center justify-between">
                  <p className="text-sm text-gray-400 line-through">{g.name}</p>
                  <div className="flex gap-1">
                    <button onClick={() => toggleComplete(g)} className="text-gray-600 hover:text-gray-400 p-1 text-xs">Reabrir</button>
                    <button onClick={() => handleDelete(g)} className="text-gray-600 hover:text-red-400 p-1"><Trash2 size={14}/></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modal !== null && (
        <GoalModal
          initial={modal}
          userId={user?.id}
          onClose={() => setModal(null)}
          onSaved={refetch}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 7: Build pra validar**

Run: `npm run build`
Expected: build limpo (warnings de hooks futuros podem aparecer se algo der ruim).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(goals): GoalsPage com saldo derivado de tx (sem GoalDots/agressividade)"
```

---

### Task 6: TxModal ganha campo "Vincular à meta"

**Files:**
- Modify: `src/pages/TransactionsPage.jsx`

- [ ] **Step 1: Adicionar import de `useGoals`**

No topo do `TransactionsPage.jsx`, adicionar ao import existente:

```jsx
import { useBudgetItems, useTransactionsByCycle, useCycles, useBills, useGoals } from '../hooks/useData'
```

- [ ] **Step 2: Carregar goals no componente**

Dentro de `TransactionsPage`, adicionar (junto com outros hooks no topo):

```jsx
const { goals } = useGoals()
```

- [ ] **Step 3: Passar `goals` como prop pro TxModal**

Localizar o JSX onde `<TxModal ...>` é renderizado (final do componente):

```jsx
<TxModal
  initial={modal}
  categories={categories}
  userId={user?.id}
  reservaSnapshot={reservaSnap}
  onClose={() => setModal(null)}
  onSaved={refetch}
/>
```

Adicionar prop `goals={goals}`:

```jsx
<TxModal
  initial={modal}
  categories={categories}
  userId={user?.id}
  reservaSnapshot={reservaSnap}
  goals={goals}
  onClose={() => setModal(null)}
  onSaved={refetch}
/>
```

- [ ] **Step 4: Receber `goals` na assinatura do TxModal**

Localizar a assinatura (linha ~57):

```jsx
function TxModal({ onClose, onSaved, initial, categories, userId, reservaSnapshot }) {
```

Substituir por:

```jsx
function TxModal({ onClose, onSaved, initial, categories, userId, reservaSnapshot, goals = [] }) {
```

- [ ] **Step 5: Adicionar `goal_id` no EMPTY const**

Linha ~55 atual:
```jsx
const EMPTY = { description: '', amount: '', type: 'expense', date: format(new Date(), 'yyyy-MM-dd'), category_id: '', notes: '', is_paid: true, payment_source: 'fixed_income' }
```

Substituir por:
```jsx
const EMPTY = { description: '', amount: '', type: 'expense', date: format(new Date(), 'yyyy-MM-dd'), category_id: '', notes: '', is_paid: true, payment_source: 'fixed_income', goal_id: '' }
```

- [ ] **Step 6: Adicionar campo "Vincular à meta" no JSX do TxModal**

Localizar a seção de fonte de pagamento dentro do TxModal (linhas ~131-143). Logo APÓS o bloco `Fonte de pagamento`, ANTES do `Notas (opcional)`, adicionar:

```jsx
<div>
  <label className="label">Vincular à meta (opcional)</label>
  <select className="input" value={form.goal_id || ''} onChange={e => set('goal_id', e.target.value)}>
    <option value="">— Nenhuma —</option>
    {goals.filter(g => !g.is_completed).map(g => (
      <option key={g.id} value={g.id}>{g.name}</option>
    ))}
  </select>
  {form.goal_id && form.type !== 'transfer' && form.type !== 'expense' && (
    <p className="text-xs text-amber-400 mt-1">
      Só transferências (somam) e despesas (subtraem) afetam o saldo da meta.
    </p>
  )}
</div>
```

- [ ] **Step 7: Garantir que `goal_id` vai no payload do save**

Localizar a função `save()` (linhas ~67-88) dentro do TxModal. O payload atual:

```jsx
const payload = {
  ...form,
  amount: parseFloat(form.amount),
  user_id: userId,
  category_id: form.category_id || null,
  budget_item_id: null,
}
```

Substituir por:

```jsx
const payload = {
  ...form,
  amount: parseFloat(form.amount),
  user_id: userId,
  category_id: form.category_id || null,
  budget_item_id: null,
  goal_id: form.goal_id || null,
}
```

- [ ] **Step 8: Build pra validar**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(tx): TxModal ganha campo Vincular meta"
```

---

### Task 7: Deletar `goalPlanner.js` e limpar imports

**Files:**
- Delete: `src/lib/goalPlanner.js`
- Modify: `src/lib/db.js`
- Modify: `src/pages/ChatPage.jsx`
- Modify: `src/lib/claude.js`

- [ ] **Step 1: Verificar todos os imports de goalPlanner antes de deletar**

Run: `grep -rn "goalPlanner" src/`
Expected: 3 ocorrências:
- `src/lib/db.js` (linha 3): `import { computeFreeBalance } from './goalPlanner'`
- `src/pages/ChatPage.jsx` (linha 9): `import { computeGoalPlan, AGGRESSIVENESS_PCT } from '../lib/goalPlanner'`
- (talvez mais — confirmar)

- [ ] **Step 2: Remover import e uso de `computeFreeBalance` em `db.js`**

Em `src/lib/db.js`, linha 3 — remover:
```jsx
import { computeFreeBalance } from './goalPlanner'
```

Localizar a função `getAIContext` e dentro dela, remover a linha:
```jsx
const freeBalance = computeFreeBalance(items || [])
```

E remover `freeBalance,` do return object.

- [ ] **Step 3: Remover usos em `ChatPage.jsx`**

Em `src/pages/ChatPage.jsx`, linha ~9 — remover:
```jsx
import { computeGoalPlan, AGGRESSIVENESS_PCT } from '../lib/goalPlanner'
```

Localizar a função `toGoal` (linhas ~274-307). Substituir a função INTEIRA por:

```jsx
function toGoal(item) {
  return {
    user_id: user.id,
    name: item.name || item.description || item.title || 'Sem nome',
    description: item.description || null,
    target_amount: parseFloat(item.target_amount || item.amount || 0),
    current_amount: parseFloat(item.current_amount || 0),
    is_fixed: item.is_fixed ?? false,
    priority: item.priority || 1,
  }
}
```

(Removeu lógica de aggressiveness/computeGoalPlan.)

Localizar também a linha onde `freeBalance` é puxado pro toGoal (linhas ~225-229):
```jsx
let freeBalance = 0
if (type === 'add_goal') {
  const ctx = await getAIContext()
  freeBalance = ctx?.freeBalance || 0
}
```

Remover esse bloco inteiro (não é mais usado).

- [ ] **Step 4: Atualizar prompt em `claude.js` — remover regra de agressividade**

Em `src/lib/claude.js`, localizar o bloco que menciona aggressiveness no prompt. Remover:

```
Para criar uma meta, escolha UMA tag de agressividade (consome % do saldo livre por mês):
- very_high (15%), high (10%), medium (7%), low (4%), very_low (2%)
O app calcula automaticamente monthly_contribution, total_months e target_date a partir da tag — NUNCA sugira esses campos manualmente.
```

E o bloco do exemplo:
```
Exemplo de meta (use aggressiveness, não monthly_contribution):
{
  "type": "add_goal",
  "data": { "name": "Placa de vídeo", "target_amount": 3500, "current_amount": 0, "aggressiveness": "high", "priority": 2 },
  "description": "Meta: Placa de vídeo em ritmo agressivo (10% do saldo livre)"
}
```

Substituir o exemplo por:
```
Exemplo de meta:
{
  "type": "add_goal",
  "data": { "name": "Placa de vídeo", "target_amount": 3500, "current_amount": 0, "priority": 2 },
  "description": "Meta: Placa de vídeo (R$ 3500 alvo)"
}
```

Adicionar nota nova em "REGRAS DE OURO":

Localizar a regra 4 atual (sobre metas/aggressiveness) e substituir por:

```
4. Metas funcionam por **vínculo com transações**: o usuário lança uma `transfer` ou `expense` com `goal_id=X` pra somar/subtrair do saldo da meta. O app NÃO calcula automaticamente quanto guardar por mês. Sugira o valor-alvo da meta; o usuário decide quando e quanto guardar.
```

- [ ] **Step 5: Deletar `goalPlanner.js`**

```bash
rm src/lib/goalPlanner.js
```

- [ ] **Step 6: Verificar zero refs**

Run: `grep -rn "goalPlanner\|computeFreeBalance\|computeGoalPlan\|AGGRESSIVENESS" src/`
Expected: zero ocorrências em arquivos `.js`/`.jsx`.

- [ ] **Step 7: Build pra validar**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore(cleanup): deleta goalPlanner.js + remove aggressiveness da IA"
```

---

### Task 8: Atualizar INVENTARIO.md pós-Onda 2

**Files:**
- Modify: `INVENTARIO.md`

- [ ] **Step 1: Atualizar seção 2 (Lançamentos)**

Localizar linha sobre "Navegação por mês" e "Card Consolidado (Entrou/Saiu/Líquido)". Trocar referência a mês calendário por ciclo dinâmico. Trocar status ⚠️ por ✅ na linha do Consolidado.

Adicionar linha nova no TxModal:
```
| Campo "Vincular à meta" no TxModal | TransactionsPage TxModal | Select opcional pra vincular tx a uma meta (goal_id) | Modal Novo/Edit → select | ✅ | Onda 2 |
```

Mudar status da linha "Categorias no modal" pra ✅ e atualizar Obs: "Mostra chip `[Tipo]` antes do nome. Onda 2."

- [ ] **Step 2: Atualizar seção 3 (Planejamento)**

Linha sobre "ItemModal (criar/editar item)" — atualizar Obs mencionando chip de type. Sem mudança de status.

- [ ] **Step 3: Reescrever seção 5 (Metas) inteira**

Substituir a tabela atual da seção 5 por:

```markdown
| Feature | Onde | O que faz | Como usar | Status | Obs |
|---|---|---|---|---|---|
| Header + botão Nova meta | GoalsPage:~206-211 | Mostra título + botão | Click | ✅ | Onda 2: removido "Saldo livre" do header |
| GoalModal (criar/editar) | GoalsPage:~27-100 | Form com nome, descrição, target, valor inicial, prioridade, fixa | Click + Nova | ✅ | Onda 2: removido aggressiveness, plano IA, freeBalance |
| Lista de metas ativas | GoalsPage:~230-280 | Card por meta com saldo derivado, barra, ícone silencioso | Auto | ✅ | Saldo = current_amount + SUM(tx vinculadas). Onda 2 |
| Ícone "Sem aporte neste ciclo" | GoalsPage | Moon icon ao lado da meta se não houve tx vinculada no ciclo atual | Auto | ✅ | Onda 2 |
| Toggle concluída + Reabrir | GoalsPage | Marca/desmarca is_completed | Click | ✅ | - |
| Vínculo via goal_id em tx | TxModal | Tx do tipo `transfer` ou `expense` com goal_id alimenta saldo da meta | Lançar tx + selecionar meta | ✅ | Onda 2 |
```

- [ ] **Step 4: Atualizar resumo executivo**

Localizar "Pontos críticos identificados" e marcar como resolvidos:

- "Receita no TxModal" → manter como confuso (decidimos não atacar)
- "categoria type no TxModal" → ✅ **Resolvido na Onda 2 (chip de type)**
- "Filtros por mês calendário em TransactionsPage" → ✅ **Resolvido na Onda 2 (navega por ciclo)**
- "freeBalance ignora saldo real" → ✅ **Resolvido na Onda 2 (modelo de Metas reformulado)**
- "Meta vs transação" → ✅ **Resolvido na Onda 2 (saldo derivado de tx vinculadas)**

- [ ] **Step 5: Adicionar entrada de Onda 2 no Histórico de execução**

No final do arquivo, na tabela de "Histórico de execução", adicionar linha:

```
| 2026-05-07 | 2 — Polimentos UX | Filtro por ciclo dinâmico em Lançamentos. Chip `[Tipo]` em categorias (TxModal+ItemModal). Metas reformuladas pra modelo "espelho honesto": saldo derivado de tx vinculadas via `goal_id`, sem agressividade/dots. `goalPlanner.js` deletado. Migration `migration_goal_link.sql` aplicada. Colunas órfãs em `goals` (aggressiveness etc.) preservadas pra rollback. |
```

- [ ] **Step 6: Atualizar seção 12 (Lib)**

Localizar a linha do `goalPlanner.js` na tabela de Lib/Engine. Remover essa linha (arquivo foi deletado).

- [ ] **Step 7: Commit**

```bash
git add INVENTARIO.md
git commit -m "docs: atualiza INVENTARIO.md pos-Onda2 (polimentos UX)"
```

---

## Smoke test final

Após todos os 8 commits, executar:

- [ ] **Step 1: Build final**

Run: `npm run build`
Expected: ✓ built sem warnings.

- [ ] **Step 2: Aplicar migration no Supabase Dashboard (USER ACTION)**

Vai em https://supabase.com/dashboard/project/vzbswcoogdarlzqstumy/sql/new
Cola o conteúdo de `migration_goal_link.sql`:
```sql
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS goal_id uuid REFERENCES goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_goal
  ON transactions(goal_id) WHERE goal_id IS NOT NULL;
```
Click "Run". Confirma "Success".

Verifica:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'transactions' AND column_name = 'goal_id';
```
Expected: 1 linha.

- [ ] **Step 3: Smoke test no browser**

Run: `npm run dev`

Validações manuais:

**3a. Lançamentos navega por ciclo:**
- Acessar `/transactions`
- Header mostra `15/04/2026 → 15/05/2026` (ou o ciclo atual configurado)
- Setas navegam ciclo anterior/próximo
- Se há só 1 ciclo, seta de "anterior" fica desabilitada

**3b. Chip de type nas categorias:**
- Click `+ Novo` em Lançamentos
- Select de categoria mostra `[Essencial] 🏠 Aluguel`, `[Receita] 💰 Salário`, etc.
- Acessar `/budget`, click `+ Novo`
- Select de categoria do ItemModal mostra mesmo formato

**3c. Vincular tx à meta:**
- Em Lançamentos, click `+ Novo`
- Tipo = Transferência, valor 100, fonte = Renda Fixa, select "Vincular à meta" → escolher "Cadeira"
- Salvar
- Acessar `/goals`
- Card da meta Cadeira: saldo aumentou em R$ 100, ícone Moon **não** aparece (pq há movimento no ciclo)

**3d. Indicador silencioso:**
- Editar a meta Cadeira (ou criar uma nova)
- Voltar pra `/goals`
- Meta sem aporte no ciclo atual deve mostrar Moon icon

**3e. Subtrair da meta:**
- Em Lançamentos, click `+ Novo`
- Tipo = Despesa, valor 30, fonte = Renda Fixa, select Vincular à meta = "Cadeira"
- Salvar
- `/goals` → saldo da Cadeira cai R$ 30

**3f. Chat IA sem aggressiveness:**
- `/chat`
- Pedir "crie meta pra viagem R$ 5000"
- IA deve sugerir `add_goal` sem campo `aggressiveness`

- [ ] **Step 4: Verificar git log**

Run: `git log --oneline auditoria-features ^main | head -20`
Expected: ~8 commits da Onda 2 + commits da Onda 1 + spec/plan/INVENTARIO commits.

- [ ] **Step 5: Tag opcional**

```bash
git tag -a onda2-completa -m "Onda 2: Polimentos UX — filtro ciclo + chip type + metas espelho honesto"
```

---

## USER ACTIONS necessárias

1. **Aplicar `migration_goal_link.sql`** no Supabase Dashboard (Step 2 do Smoke test)
2. **Smoke test no browser** (Step 3)
3. **Decidir** sobre dropar colunas órfãs de `goals` (aggressiveness, monthly_contribution, target_date, total_months, months_completed, ai_computed_at) — pode ficar pra commit futuro

---

## Critérios de Done (spec mapping)

- [ ] 2.A Filtro por ciclo → Task 4
- [ ] 2.B Chip de type → Tasks 2 + 3
- [ ] 2.C Metas reformuladas → Tasks 5 + 6 + 7
- [ ] Migration `migration_goal_link.sql` → Task 1
- [ ] `goalPlanner.js` deletado → Task 7
- [ ] `claude.js` sem agressividade → Task 7
- [ ] `INVENTARIO.md` atualizado → Task 8
- [ ] Build limpo após cada commit → step "Build pra validar" em cada Task
- [ ] Smoke test → seção final
