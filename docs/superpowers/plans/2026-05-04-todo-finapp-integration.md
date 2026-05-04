# Integração Lista ToDo ↔ FinAPP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar uma página "Lista" no FinAPP que espelha `todo.items` e permite importar itens pagos como lançamentos (`transactions`), com validação de período e undo via deleção normal.

**Architecture:** Nova página `ListaPage` lê o schema `todo` do mesmo projeto Supabase. Um modal de 3 passos (datas → categorias → confirmar) orquestra a criação de `transactions` em lote e atualiza `todo.items` com `imported_at` + `finapp_transaction_id`. Ao deletar uma transação originada da lista, `deleteTransaction` em `db.js` zera `imported_at` para reverter o estado.

**Tech Stack:** React 18, Vite, Supabase JS v2, Tailwind CSS, Lucide React, date-fns

---

## File Map

| Ação | Arquivo |
|---|---|
| Criar | `migration_todo_integration.sql` |
| Criar | `src/lib/todo.js` |
| Modificar | `src/lib/db.js` (linha 53–54) |
| Criar | `src/pages/ListaPage.jsx` |
| Modificar | `src/App.jsx` (linhas 8–33) |
| Modificar | `src/components/layout/Layout.jsx` (linhas 1–21) |

---

## Task 1: Migration SQL

**Files:**
- Create: `migration_todo_integration.sql`

- [ ] **Step 1: Criar o arquivo de migration**

Crie `migration_todo_integration.sql` na raiz do projeto com o conteúdo abaixo:

```sql
-- migration_todo_integration.sql
-- Adiciona rastreamento de importação em todo.items

ALTER TABLE todo.items
  ADD COLUMN IF NOT EXISTS done_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finapp_transaction_id  UUID REFERENCES public.transactions(id) ON DELETE SET NULL;

-- Trigger: preenche done_at ao marcar done=true, zera ao desmarcar
CREATE OR REPLACE FUNCTION todo.set_done_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.done = true AND (OLD IS NULL OR OLD.done = false OR OLD.done IS NULL) THEN
    NEW.done_at := now();
  ELSIF NEW.done = false THEN
    NEW.done_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_todo_done_at ON todo.items;
CREATE TRIGGER trg_todo_done_at
  BEFORE INSERT OR UPDATE ON todo.items
  FOR EACH ROW EXECUTE FUNCTION todo.set_done_at();

-- Backfill: itens já marcados como done recebem done_at = created_at
UPDATE todo.items SET done_at = created_at WHERE done = true AND done_at IS NULL;
```

- [ ] **Step 2: Aplicar a migration no Supabase**

Abra o **SQL Editor** no dashboard Supabase do projeto "controle de contas" e execute o conteúdo do arquivo acima.

Verifique o resultado com:
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'todo' AND table_name = 'items'
ORDER BY ordinal_position;
```
Esperado: colunas `done_at`, `imported_at`, `finapp_transaction_id` presentes.

Verifique o trigger:
```sql
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_schema = 'todo' AND event_object_table = 'items';
```
Esperado: `trg_todo_done_at` listado.

- [ ] **Step 3: Commit**

```bash
git add migration_todo_integration.sql
git commit -m "chore: migration todo.items done_at + imported_at + finapp_transaction_id"
```

---

## Task 2: Camada de dados `src/lib/todo.js`

**Files:**
- Create: `src/lib/todo.js`

- [ ] **Step 1: Criar o arquivo**

Crie `src/lib/todo.js` com:

```js
import { supabase } from './supabase'

export const getTodoItems = () =>
  supabase.schema('todo').from('items').select('*').order('category').order('order_index')

export const markTodoImported = (id, transactionId) =>
  supabase.schema('todo').from('items')
    .update({ imported_at: new Date().toISOString(), finapp_transaction_id: transactionId })
    .eq('id', id)
```

- [ ] **Step 2: Verificar no browser**

Abra o console do navegador no FinAPP e execute:

```js
import('/src/lib/todo.js').then(m => m.getTodoItems().then(r => console.log(r.data)))
```

Esperado: array com os itens de `todo.items` (sem erro de CORS ou schema).

- [ ] **Step 3: Commit**

```bash
git add src/lib/todo.js
git commit -m "feat: src/lib/todo.js — acesso ao schema todo"
```

---

## Task 3: Atualizar `deleteTransaction` para undo

**Files:**
- Modify: `src/lib/db.js:53-54`

- [ ] **Step 1: Substituir `deleteTransaction`**

Em `src/lib/db.js`, localize:

```js
export const deleteTransaction = (id) =>
  supabase.from('transactions').delete().eq('id', id)
```

Substitua por:

```js
export const deleteTransaction = async (id) => {
  await supabase.schema('todo').from('items')
    .update({ imported_at: null })
    .eq('finapp_transaction_id', id)
  return supabase.from('transactions').delete().eq('id', id)
}
```

- [ ] **Step 2: Verificar no browser**

1. Importe um item da lista (será feito na Task 5, mas se já houver algum com `finapp_transaction_id` manualmente populado no banco, use-o).
2. Delete a transação correspondente na tela de Lançamentos.
3. Verifique no Supabase Table Editor que `imported_at` voltou para `null` no `todo.items`.

*Se ainda não há item importado, marque este step para verificar após a Task 5.*

- [ ] **Step 3: Commit**

```bash
git add src/lib/db.js
git commit -m "feat: deleteTransaction zera imported_at no todo.items (undo)"
```

---

## Task 4: Navegação — rota e menu

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/layout/Layout.jsx`

- [ ] **Step 1: Adicionar rota em `src/App.jsx`**

Adicione o import de `ListaPage` (arquivo que será criado na Task 5):

```js
import ListaPage from './pages/ListaPage'
```

Adicione a rota dentro do `<Route path="/" ...>`:

```jsx
<Route path="lista" element={<ListaPage />} />
```

O bloco de rotas completo fica assim:

```jsx
<Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
  <Route index element={<DashboardPage />} />
  <Route path="transactions" element={<TransactionsPage />} />
  <Route path="bills" element={<BillsPage />} />
  <Route path="goals" element={<GoalsPage />} />
  <Route path="budget" element={<BudgetPage />} />
  <Route path="chat" element={<ChatPage />} />
  <Route path="settings" element={<SettingsPage />} />
  <Route path="lista" element={<ListaPage />} />
</Route>
```

- [ ] **Step 2: Adicionar entrada no menu em `src/components/layout/Layout.jsx`**

Adicione `ShoppingCart` ao import do Lucide:

```js
import { LayoutDashboard, Receipt, Bell, Target, PieChart, MessageCircle, Settings, LogOut, DollarSign, ShoppingCart } from 'lucide-react'
```

Adicione o item ao `SIDEBAR_NAV` (após Lançamentos):

```js
const SIDEBAR_NAV = [
  { to: '/',             icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/transactions', icon: Receipt,         label: 'Lançamentos' },
  { to: '/lista',        icon: ShoppingCart,    label: 'Lista' },
  { to: '/budget',       icon: PieChart,        label: 'Planejamento' },
  { to: '/bills',        icon: Bell,            label: 'Agenda de pagamentos' },
  { to: '/goals',        icon: Target,          label: 'Metas' },
  { to: '/chat',         icon: MessageCircle,   label: 'Assistente IA' },
  { to: '/settings',     icon: Settings,        label: 'Configurações' },
]
```

Adicione ao `BOTTOM_TABS` (mobile — substitua um item menos usado ou adicione após Lançamentos):

```js
const BOTTOM_TABS = [
  { to: '/',             icon: LayoutDashboard, label: 'Início' },
  { to: '/transactions', icon: Receipt,         label: 'Lançamentos' },
  { to: '/lista',        icon: ShoppingCart,    label: 'Lista' },
  { to: '/bills',        icon: Bell,            label: 'Agenda' },
  { to: '/budget',       icon: PieChart,        label: 'Planejamento' },
]
```

- [ ] **Step 3: Verificar no browser**

Navegue pelo app. O item "Lista" deve aparecer no menu lateral (desktop) e na barra inferior (mobile). Clicar nele não deve lançar erro de rota — a página estará vazia até a Task 5.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx src/components/layout/Layout.jsx
git commit -m "feat: rota /lista e item Lista no menu"
```

---

## Task 5: `src/pages/ListaPage.jsx`

**Files:**
- Create: `src/pages/ListaPage.jsx`

- [ ] **Step 1: Criar o componente `ImportModal`**

Crie `src/pages/ListaPage.jsx` com o conteúdo completo abaixo (inclui a página e o modal):

```jsx
import { useState, useEffect, useCallback, useMemo } from 'react'
import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  ShoppingCart, CheckSquare, Square, ChevronDown, ChevronRight,
  UploadCloud, AlertCircle, Check,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getTodoItems, markTodoImported } from '../lib/todo'
import { addTransaction } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function itemStatus(item) {
  if (item.imported_at) return 'imported'
  if (item.done) return 'ready'
  return 'pending'
}

function ImportModal({ items, cycle, categories, userId, onClose, onDone }) {
  const defaultCategoryId = categories.find(c => c.type === 'variable')?.id
  const cycleEndDate = cycle?.end_date ?? null

  const [step, setStep] = useState(1)
  const [drafts, setDrafts] = useState(() =>
    items.map(item => ({
      item,
      date: item.done_at ? item.done_at.slice(0, 10) : format(new Date(), 'yyyy-MM-dd'),
      categoryId: defaultCategoryId,
      outOfPeriod: false,
    }))
  )
  const [customCats, setCustomCats] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const setDate = (idx, date) => {
    setDrafts(prev => prev.map((d, i) => {
      if (i !== idx) return d
      const outOfPeriod = cycleEndDate ? date > cycleEndDate : false
      return { ...d, date, outOfPeriod }
    }))
  }

  const setCategoryId = (idx, catId) => {
    setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, categoryId: catId } : d))
  }

  const validDrafts = drafts.filter(d => !d.outOfPeriod)
  const invalidCount = drafts.filter(d => d.outOfPeriod).length
  const total = validDrafts.reduce((acc, d) => acc + Number(d.item.value ?? 0), 0)

  async function doImport() {
    setSaving(true)
    setError('')
    try {
      for (const draft of validDrafts) {
        const { data: tx, error: txErr } = await addTransaction({
          user_id: userId,
          description: draft.item.name,
          amount: draft.item.value ?? 0,
          type: 'expense',
          payment_source: 'fixed_income',
          date: draft.date,
          category_id: draft.categoryId,
          is_paid: true,
          notes: draft.item.notes ?? '',
        })
        if (txErr) throw new Error(txErr.message)
        await markTodoImported(draft.item.id, tx.id)
      }
      onDone()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Importar para Lançamentos</h2>
          <span className="text-xs text-gray-500">Passo {step}/3</span>
        </div>

        {/* Passo 1 — Datas */}
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">Confirme ou ajuste a data de pagamento de cada item. Itens fora do período atual ficam desabilitados.</p>
            {drafts.map((draft, i) => (
              <div key={draft.item.id} className={`rounded-xl p-3 space-y-2 ${draft.outOfPeriod ? 'bg-red-500/10 border border-red-500/30' : 'bg-gray-800'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-white truncate">{draft.item.name}</span>
                  <span className="text-sm text-gray-300 ml-2 shrink-0">{fmt(draft.item.value)}</span>
                </div>
                <input
                  type="date"
                  value={draft.date}
                  onChange={e => setDate(i, e.target.value)}
                  className="w-full bg-gray-700 text-white text-sm rounded-lg px-3 py-1.5 border border-gray-600 focus:outline-none focus:border-emerald-500"
                />
                {draft.outOfPeriod && (
                  <p className="text-xs text-red-400 flex items-center gap-1">
                    <AlertCircle size={12} />
                    Item do período {draft.date.slice(0, 7)} — ajuste a data ou importe no período correto
                  </p>
                )}
              </div>
            ))}
            {invalidCount > 0 && (
              <p className="text-xs text-amber-400">{invalidCount} item(s) fora do período serão ignorados nesta importação.</p>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-gray-700 text-sm text-gray-400 hover:text-white transition-colors">Cancelar</button>
              <button
                onClick={() => setStep(2)}
                disabled={validDrafts.length === 0}
                className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-40 transition-colors"
              >
                Próximo
              </button>
            </div>
          </div>
        )}

        {/* Passo 2 — Categorias */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-400">Deseja definir categoria específica para algum item? O padrão é "Variável".</p>
            <div className="flex gap-2">
              <button
                onClick={() => setCustomCats(false)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${!customCats ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-700 text-gray-400 hover:text-white'}`}
              >
                Usar padrão
              </button>
              <button
                onClick={() => setCustomCats(true)}
                className={`flex-1 py-2 rounded-xl text-sm font-medium border transition-colors ${customCats ? 'bg-emerald-600 text-white border-emerald-600' : 'border-gray-700 text-gray-400 hover:text-white'}`}
              >
                Definir por item
              </button>
            </div>
            {customCats && validDrafts.map((draft, i) => {
              const globalIdx = drafts.indexOf(draft)
              return (
                <div key={draft.item.id} className="flex items-center gap-2 bg-gray-800 rounded-xl p-3">
                  <span className="flex-1 text-sm text-white truncate">{draft.item.name}</span>
                  <select
                    value={draft.categoryId || ''}
                    onChange={e => setCategoryId(globalIdx, e.target.value)}
                    className="bg-gray-700 text-white text-xs rounded-lg px-2 py-1.5 border border-gray-600 focus:outline-none focus:border-emerald-500"
                  >
                    {categories.filter(c => c.type !== 'income').map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                </div>
              )
            })}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setStep(1)} className="flex-1 py-2 rounded-xl border border-gray-700 text-sm text-gray-400 hover:text-white transition-colors">Voltar</button>
              <button onClick={() => setStep(3)} className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors">Próximo</button>
            </div>
          </div>
        )}

        {/* Passo 3 — Confirmar */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="bg-gray-800 rounded-xl p-3 space-y-1">
              <p className="text-xs text-gray-400">Resumo da importação</p>
              <p className="text-sm text-white font-semibold">{validDrafts.length} item(s) · Total {fmt(total)}</p>
            </div>
            <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
              {validDrafts.map(draft => (
                <div key={draft.item.id} className="flex items-center justify-between text-xs text-gray-300 px-1 py-0.5">
                  <span className="truncate">{draft.item.name}</span>
                  <span className="ml-2 shrink-0 text-gray-400">{draft.date}</span>
                </div>
              ))}
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setStep(2)} className="flex-1 py-2 rounded-xl border border-gray-700 text-sm text-gray-400 hover:text-white transition-colors">Voltar</button>
              <button
                onClick={doImport}
                disabled={saving}
                className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-40 transition-colors"
              >
                {saving ? 'Importando...' : 'Confirmar importação'}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default function ListaPage() {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [cycle, setCycle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [showModal, setShowModal] = useState(false)
  const [expandedNotes, setExpandedNotes] = useState(new Set())

  const monthRef = format(new Date(), 'yyyy-MM')

  const load = useCallback(async () => {
    setLoading(true)
    const [todoRes, catsRes, cycleRes] = await Promise.all([
      getTodoItems(),
      supabase.from('categories').select('*').order('sort_order'),
      supabase.from('budget_cycles').select('*').eq('month_ref', monthRef).maybeSingle(),
    ])
    setItems(todoRes.data || [])
    setCategories(catsRes.data || [])
    setCycle(cycleRes.data || null)
    setLoading(false)
  }, [monthRef])

  useEffect(() => { load() }, [load])

  const grouped = useMemo(() => {
    const groups = {}
    for (const item of items) {
      const cat = item.category || 'Sem categoria'
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(item)
    }
    return groups
  }, [items])

  const readyItems = items.filter(i => i.done && !i.imported_at)
  const selectedItems = readyItems.filter(i => selected.has(i.id))

  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const selectAll = () => setSelected(new Set(readyItems.map(i => i.id)))
  const clearSelect = () => setSelected(new Set())

  const toggleNotes = (id) => setExpandedNotes(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShoppingCart size={20} className="text-emerald-400" />
            Lista de Compras
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {readyItems.length > 0
              ? `${readyItems.length} item(s) aguardando importação`
              : 'Todos os itens estão em dia'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 ? (
            <>
              <button onClick={clearSelect} className="text-xs text-gray-400 hover:text-white transition-colors">
                Limpar
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors"
              >
                <UploadCloud size={15} /> Importar ({selected.size})
              </button>
            </>
          ) : readyItems.length > 0 ? (
            <button onClick={selectAll} className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
              Selecionar todos prontos
            </button>
          ) : null}
        </div>
      </div>

      {/* Groups */}
      {Object.entries(grouped).map(([cat, catItems]) => {
        const readyCount = catItems.filter(i => i.done && !i.imported_at).length
        return (
          <div key={cat} className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{cat}</h2>
              {readyCount > 0 && (
                <span className="text-[10px] text-amber-400">{readyCount} pronto(s)</span>
              )}
            </div>
            {catItems.map(item => {
              const status = itemStatus(item)
              const isReady = status === 'ready'
              const isImported = status === 'imported'
              const isExpanded = expandedNotes.has(item.id)
              return (
                <div
                  key={item.id}
                  className={`rounded-xl p-3 border transition-all ${
                    isImported
                      ? 'bg-gray-800/40 border-gray-800 opacity-60'
                      : isReady && selected.has(item.id)
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-gray-800/80 border-gray-800'
                  }`}
                >
                  <div className="flex items-start gap-3">

                    {/* Checkbox / status icon */}
                    <div className="mt-0.5 shrink-0">
                      {isReady && (
                        <button onClick={() => toggleSelect(item.id)} className="text-emerald-400">
                          {selected.has(item.id)
                            ? <CheckSquare size={18} />
                            : <Square size={18} className="text-gray-600" />}
                        </button>
                      )}
                      {isImported && <Check size={18} className="text-emerald-500" />}
                      {status === 'pending' && <Square size={18} className="text-gray-700" />}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-sm font-medium ${isImported ? 'line-through text-gray-500' : 'text-white'}`}>
                          {item.name}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {item.value != null && (
                            <span className="text-sm text-emerald-400 font-semibold">{fmt(item.value)}</span>
                          )}
                          {isReady && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-medium">
                              Aguardando
                            </span>
                          )}
                          {isImported && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-medium">
                              Importado
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Notes expandíveis */}
                      {item.notes && (
                        <div className="mt-1">
                          <button
                            onClick={() => toggleNotes(item.id)}
                            className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 transition-colors"
                          >
                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            Notas
                          </button>
                          {isExpanded && (
                            <p className="text-xs text-gray-400 mt-1 whitespace-pre-wrap break-words leading-relaxed">
                              {item.notes}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Data de importação */}
                      {isImported && item.imported_at && (
                        <p className="text-[10px] text-gray-600 mt-0.5">
                          Importado em {format(parseISO(item.imported_at), "dd/MM/yyyy", { locale: ptBR })}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })}

      {items.length === 0 && (
        <div className="text-center py-20 text-gray-600">
          <ShoppingCart size={36} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">Nenhum item na lista ainda</p>
        </div>
      )}

      {/* Import Modal */}
      {showModal && (
        <ImportModal
          items={selectedItems}
          cycle={cycle}
          categories={categories}
          userId={user?.id}
          onClose={() => setShowModal(false)}
          onDone={() => {
            setShowModal(false)
            setSelected(new Set())
            load()
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verificar no browser — carregamento**

Navegue para `/lista`. Esperado:
- Itens da lista aparecem agrupados por categoria
- Itens com `done = false`: checkbox cinza, sem badge
- Itens com `done = true` e `imported_at = null`: checkbox verde, badge "Aguardando"
- Itens com `done = true` e `imported_at` preenchido: ícone check, badge "Importado", opacidade reduzida
- Notes expandem/fecham ao clicar

- [ ] **Step 3: Verificar no browser — seleção e modal**

1. Clique no checkbox de 1 ou mais itens "Aguardando" → botão "Importar (N)" aparece no header
2. Clique "Selecionar todos prontos" → todos os itens prontos ficam marcados
3. Clique "Importar (N)" → modal abre no Passo 1 (datas)
4. Ajuste uma data para um mês futuro → item fica vermelho com aviso, contagem de inválidos aparece
5. Avance para Passo 2 → botões "Usar padrão" / "Definir por item" funcionam
6. Com "Definir por item" ativo, dropdowns de categoria aparecem por item
7. Avance para Passo 3 → resumo mostra N itens e total correto
8. Clique "Confirmar importação" → loading, depois modal fecha e lista recarrega

- [ ] **Step 4: Verificar no Supabase — dados gravados**

No Table Editor, verifique `todo.items`: os itens importados devem ter `imported_at` e `finapp_transaction_id` preenchidos.

No Table Editor, verifique `public.transactions`: uma transação nova por item, com `description`, `amount`, `date`, `type = expense`, `payment_source = fixed_income`, `is_paid = true`.

- [ ] **Step 5: Verificar undo**

Em Lançamentos, delete uma transação que veio da lista. Volte para `/lista` — o item deve estar novamente com badge "Aguardando importação" (sem `imported_at`).

- [ ] **Step 6: Commit**

```bash
git add src/pages/ListaPage.jsx
git commit -m "feat: ListaPage com listagem por categoria, seleção e modal de importação em 3 passos"
```

---

## Task 6: Commit final e verificação geral

- [ ] **Step 1: Smoke test completo**

Percorra o fluxo ponta-a-ponta:
1. Abra `/lista` — lista carrega
2. Selecione itens prontos — botão de importação aparece
3. Importe — transações criadas, itens marcados como importados
4. Abra `/transactions` — lançamentos aparecem com descrição e valor corretos
5. Delete um lançamento importado — volte para `/lista`, item está "Aguardando" novamente
6. Navegue para todas as outras páginas — nenhuma quebra de regressão

- [ ] **Step 2: Verificar mobile**

Abra o DevTools em modo mobile. A barra inferior deve ter o ícone "Lista". A página `/lista` deve ser usável em tela pequena (itens, modal bottom-sheet, botões).

- [ ] **Step 3: Commit final**

```bash
git add -A
git commit -m "feat: integracao lista ToDo com FinAPP — fase 1 completa"
```
