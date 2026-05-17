# Bulk-Pay Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir marcar múltiplas bills como pagas via seleção + popup-na-base, com escolha entre "já lançado no extrato" (só flipa is_paid) vs "lançar agora" (cria N txs via Promise.all).

**Architecture:** State local de seleção em `BudgetPage` (Set de bill_ids); novo `SelectionContext` global pra coordenar com `Layout` (esconde bottom nav mobile durante seleção); 2 componentes novos (popup + dialog); reaproveita `payBill` RPC existente — sem migration nova.

**Tech Stack:** React 18 + Vite + Supabase JS client + Tailwind + lucide-react + date-fns.

**Branch base:** `auditoria-features` (continuação direta da Onda 8).

**Convenções do codebase:**
- Erros: state inline `setError(msg)` em modais; sem toast library
- Sem testes automatizados pra UI — só smoke manual após implementação
- Tailwind classes utilizadas: `card`, `input`, `label`, `btn-primary`, `btn-ghost`, `btn-secondary`

---

## Onda A — SelectionContext + Layout

### Task A.1: Criar `SelectionContext`

**Files:**
- Create: `src/contexts/SelectionContext.jsx`

- [ ] **Step 1: Criar o context**

```jsx
import { createContext, useContext, useState } from 'react'

const SelectionCtx = createContext({ active: false, setActive: () => {} })

export function SelectionProvider({ children }) {
  const [active, setActive] = useState(false)
  return <SelectionCtx.Provider value={{ active, setActive }}>{children}</SelectionCtx.Provider>
}

export const useSelection = () => useContext(SelectionCtx)
```

- [ ] **Step 2: Build check**

Run: `npx vite build`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add src/contexts/SelectionContext.jsx
git commit -m "feat(ctx): SelectionContext pra coordenar UI de selecao bulk"
```

---

### Task A.2: Plugar `SelectionProvider` em `App.jsx`

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Localizar onde provider deve entrar**

Run:
```bash
grep -n "Provider\|<BrowserRouter\|<Routes" src/App.jsx
```

- [ ] **Step 2: Adicionar import e envolver árvore**

No topo: `import { SelectionProvider } from './contexts/SelectionContext'`

Envolver a parte interna (logo dentro do `BrowserRouter`/`AuthProvider`/`DateRangeProvider`, antes de `<Routes>`):
```jsx
<SelectionProvider>
  <Routes>
    ...
  </Routes>
</SelectionProvider>
```

A posição exata depende da estrutura atual — coloca por DENTRO dos outros providers (AuthProvider, DateRangeProvider) e POR FORA do `<Routes>`.

- [ ] **Step 3: Build**

Run: `npx vite build`
Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat(app): plug SelectionProvider acima de Routes"
```

---

### Task A.3: Adaptar `Layout.jsx` (esconde bottom nav)

**Files:**
- Modify: `src/components/layout/Layout.jsx`

- [ ] **Step 1: Localizar bottom nav mobile**

Run:
```bash
grep -n "BOTTOM_TABS\|bottom-0\|md:hidden\|fixed bottom" src/components/layout/Layout.jsx
```

- [ ] **Step 2: Importar e usar `useSelection`**

No topo do arquivo: `import { useSelection } from '../../contexts/SelectionContext'`

Dentro do componente principal de `Layout`, antes do return:
```jsx
const { active: selectionActive } = useSelection()
```

- [ ] **Step 3: Esconder bottom nav quando ativo**

Localiza o elemento do bottom nav mobile (provavelmente um `<nav>` ou `<div>` com classe começando em `fixed bottom-0` + `md:hidden`). Adiciona condicional pra esconder quando `selectionActive`:

Exemplo de transformação:
```jsx
// Antes:
<nav className="fixed bottom-0 left-0 right-0 md:hidden ...">

// Depois:
<nav className={`fixed bottom-0 left-0 right-0 md:hidden ... ${selectionActive ? 'hidden' : ''}`}>
```

Adapta ao nome de classe exato encontrado no Step 1.

- [ ] **Step 4: Build**

Run: `npx vite build`
Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Layout.jsx
git commit -m "feat(layout): esconde bottom nav mobile quando selecao ativa"
```

---

## Onda B — Componentes novos (popup + dialog)

### Task B.1: Criar `SelectionPopup.jsx`

**Files:**
- Create: `src/components/planning/SelectionPopup.jsx`

- [ ] **Step 1: Criar o componente**

```jsx
import { X, Check } from 'lucide-react'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Popup fixo no rodapé com count, total e CTAs Limpar/Confirmar.
// Desktop: centralizado, margem do rodapé. Mobile: full-width, encostado (substitui nav, ver SelectionContext).
export default function SelectionPopup({ count, total, onClear, onConfirm, disabled = false }) {
  if (count === 0) return null
  return (
    <div className="fixed z-40 left-0 right-0 bottom-0 px-4 pb-[env(safe-area-inset-bottom)]
                    md:left-1/2 md:right-auto md:bottom-4 md:-translate-x-1/2 md:pb-0">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 shadow-lg
                      flex items-center justify-between gap-3 md:max-w-md md:mx-auto">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{count} selecionado{count > 1 ? 's' : ''}</p>
          <p className="text-xs text-gray-400">{fmt(total)}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={onClear} disabled={disabled}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white flex items-center gap-1">
            <X size={14}/> Limpar
          </button>
          <button onClick={onConfirm} disabled={disabled}
            className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50">
            <Check size={14}/> Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run: `npx vite build`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add src/components/planning/SelectionPopup.jsx
git commit -m "feat(component): SelectionPopup com count, total e CTAs Limpar/Confirmar"
```

---

### Task B.2: Criar `ConfirmPayDialog.jsx`

**Files:**
- Create: `src/components/planning/ConfirmPayDialog.jsx`

- [ ] **Step 1: Criar o componente**

```jsx
import { AlertCircle } from 'lucide-react'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Dialog que aparece após "Confirmar" do SelectionPopup.
// Pergunta se os items já estão lançados no extrato. 3 CTAs.
export default function ConfirmPayDialog({ items, onAlreadyImported, onPayNow, onCancel, submitting, error }) {
  const total = items.reduce((a, i) => a + Number(i.bill?.amount || 0), 0)
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-lg text-white">Confirmar {items.length} pagamento{items.length > 1 ? 's' : ''}</h2>
        <p className="text-sm text-gray-300">
          Total: <span className="font-bold text-white">{fmt(total)}</span>
        </p>
        <p className="text-sm text-gray-400">
          Esses lançamentos já estão no extrato do banco (importados via CSV)?
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex gap-2">
            <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5"/>
            <p className="text-xs text-red-300 whitespace-pre-line">{error}</p>
          </div>
        )}

        <div className="space-y-2 pt-1">
          <button onClick={onAlreadyImported} disabled={submitting}
            className="w-full btn-primary text-sm disabled:opacity-50">
            ✓ Sim — só marcar como pago
          </button>
          <button onClick={onPayNow} disabled={submitting}
            className="w-full btn-secondary text-sm disabled:opacity-50">
            ✗ Não — lançar despesa agora
          </button>
          <button onClick={onCancel} disabled={submitting}
            className="w-full btn-ghost text-sm disabled:opacity-50">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Build**

Run: `npx vite build`
Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add src/components/planning/ConfirmPayDialog.jsx
git commit -m "feat(component): ConfirmPayDialog com 2 caminhos pay-paths"
```

---

## Onda C — Adaptar `PlanItemRow`

### Task C.1: `PlanItemRow` ganha visual `☑` + split de handler

**Files:**
- Modify: `src/components/planning/PlanItemRow.jsx`

- [ ] **Step 1: Substituir o componente inteiro**

Conteúdo novo (substitui o existente):

```jsx
import { differenceInDays, parseISO, format } from 'date-fns'
import { CheckCircle2, Circle, CheckSquare, Edit2, Lock } from 'lucide-react'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function statusLabel(bill) {
  if (!bill) return { label: '— ainda sem lembrete neste ciclo', color: 'text-gray-600' }
  if (bill.is_paid) return { label: bill.paid_at ? `Pago em ${format(parseISO(bill.paid_at), 'dd/MM')}` : 'Pago', color: 'text-emerald-400' }
  const d = differenceInDays(parseISO(bill.due_date), new Date())
  if (d < 0)  return { label: `Atrasado há ${Math.abs(d)}d`, color: 'text-red-400' }
  if (d === 0) return { label: 'Vence hoje!',                color: 'text-red-400' }
  if (d <= 3) return { label: `Vence em ${d}d`,             color: 'text-amber-400' }
  return       { label: `Vence em ${d}d`,                    color: 'text-gray-400' }
}

// PlanItemRow agora distingue 3 caminhos:
//   - bill paga (is_paid=true): click confirma e chama onUnpay (mantém flow single)
//   - bill não paga + selected: click chama onToggleSelect (remove da selecao)
//   - bill não paga + não selected: click chama onToggleSelect (adiciona à selecao)
export default function PlanItemRow({ item, selected, onToggleSelect, onUnpay, onEdit }) {
  const bill = item.bill
  const st = statusLabel(bill)
  const isPaid = bill?.is_paid

  function handleClick() {
    if (!bill) return
    if (isPaid) onUnpay(item)
    else onToggleSelect(item)
  }

  const icon = isPaid
    ? <CheckCircle2 size={22}/>
    : selected
      ? <CheckSquare size={22}/>
      : <Circle size={22}/>

  const iconColor = isPaid
    ? 'text-emerald-400'
    : selected
      ? 'text-emerald-400'
      : bill ? 'text-gray-600 hover:text-emerald-400' : 'text-gray-800'

  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${isPaid ? 'bg-gray-900 border-gray-800 opacity-70' : selected ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-gray-900 border-gray-800'}`}>
      <button
        onClick={handleClick}
        disabled={!bill}
        className={`flex-shrink-0 transition-colors ${iconColor}`}
        title={bill ? '' : 'Sem bill materializada ainda'}
      >
        {icon}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className={`text-sm font-medium truncate ${isPaid ? 'text-gray-500 line-through' : 'text-white'}`}>{item.name}</p>
          {item.is_fixed && <Lock size={10} className="text-amber-400" title="Fixo"/>}
        </div>
        <p className={`text-xs ${st.color}`}>{st.label}</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <p className="text-sm font-bold text-white mr-1">{fmt(bill?.amount ?? item.planned_amount)}</p>
        <button onClick={() => onEdit(item)} className="text-gray-600 hover:text-gray-400 p-1"><Edit2 size={14}/></button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Atualizar `BucketSection` pra passar as novas props**

**Files:**
- Modify: `src/components/planning/BucketSection.jsx`

Mudar a assinatura e a passagem:

```jsx
export default function BucketSection({ label, items, selected, onToggleSelect, onUnpay, onEdit, defaultOpen = true }) {
  // ...
  {items.map(i => (
    <PlanItemRow key={i.id} item={i}
      selected={selected.has(i.bill?.id)}
      onToggleSelect={onToggleSelect}
      onUnpay={onUnpay}
      onEdit={onEdit}/>
  ))}
}
```

`selected` é o Set vindo de `BudgetPage`. `selected.has(undefined)` retorna false — safe pra items sem bill.

- [ ] **Step 3: Build**

Run: `npx vite build`
Expected: build OK (vai falhar nos callers — corrigido em D.1; ignora por enquanto se erro for em BudgetPage).

Se build falhar **apenas** com erros em `BudgetPage.jsx` referenciando `onTogglePaid`, ok — vamos corrigir lá em D.1.

- [ ] **Step 4: Commit**

```bash
git add src/components/planning/PlanItemRow.jsx src/components/planning/BucketSection.jsx
git commit -m "feat(planning): PlanItemRow+BucketSection com selecao bulk e unpay split"
```

---

## Onda D — `BudgetPage` wiring + remove `PayBillModal`

### Task D.1: `BudgetPage` ganha state, handlers, popup/dialog

**Files:**
- Modify: `src/pages/BudgetPage.jsx`

- [ ] **Step 1: Imports — adicionar/remover**

REMOVER do topo:
```jsx
import PayBillModal from '../components/PayBillModal'
```

ADICIONAR:
```jsx
import { useEffect } from 'react'  // se não existir
import SelectionPopup from '../components/planning/SelectionPopup'
import ConfirmPayDialog from '../components/planning/ConfirmPayDialog'
import { useSelection } from '../contexts/SelectionContext'
import { supabase } from '../lib/supabase'
import { format as dfFormat } from 'date-fns'
```

Confirma que `payBill` continua importado de `../lib/db` (já estava).

- [ ] **Step 2: Substituir state e handlers no `BudgetPage`**

Localiza no `BudgetPage` o bloco que tinha `payingItem`/`setPayingItem`. SUBSTITUI por:

```jsx
const { setActive } = useSelection()
const [selected, setSelected] = useState(new Set())     // Set<bill.id>
const [confirming, setConfirming] = useState(false)
const [submitting, setSubmitting] = useState(false)
const [dialogError, setDialogError] = useState('')

// Sincroniza com SelectionContext (esconde bottom nav mobile)
useEffect(() => {
  setActive(selected.size > 0)
  return () => setActive(false)
}, [selected.size, setActive])

const selectedItems = items.filter(i => i.bill?.id && selected.has(i.bill.id))
const selectedTotal = selectedItems.reduce((a, i) => a + Number(i.bill?.amount || 0), 0)

function toggleSelect(item) {
  if (!item.bill) return
  setSelected(prev => {
    const next = new Set(prev)
    if (next.has(item.bill.id)) next.delete(item.bill.id)
    else next.add(item.bill.id)
    return next
  })
}

async function handleUnpay(item) {
  if (!item.bill) return
  if (!confirm(`Desmarcar "${item.name}" como pago? A transação vinculada será removida.`)) return
  await unpayBill(item.bill.id); refetch()
}

async function confirmAlreadyImported() {
  setSubmitting(true); setDialogError('')
  const ids = [...selected]
  const { error } = await supabase.from('bills')
    .update({ is_paid: true, paid_at: new Date().toISOString() })
    .in('id', ids)
  setSubmitting(false)
  if (error) { setDialogError(error.message || 'Falha ao atualizar bills.'); return }
  setSelected(new Set()); setConfirming(false); refetch()
}

async function confirmPayNow() {
  setSubmitting(true); setDialogError('')
  const missing = selectedItems.filter(i => !i.default_account_id).map(i => i.name)
  if (missing.length > 0) {
    setDialogError('Estes items precisam de conta default antes:\n  • ' + missing.join('\n  • ') + '\nEdite cada um (lápis) e tente de novo.')
    setSubmitting(false); return
  }
  const today = dfFormat(new Date(), 'yyyy-MM-dd')
  const results = await Promise.all(selectedItems.map(i => payBill({
    billId: i.bill.id, accountId: i.default_account_id, amount: i.bill.amount,
    date: today, paymentSource: i.payment_source, categoryId: i.category_id, budgetItemId: i.id,
  })))
  setSubmitting(false)
  const failed = results.filter(r => r.error)
  if (failed.length > 0) {
    setDialogError(`${failed.length} de ${results.length} falharam. Mantive selecionados pra retry.`)
    return
  }
  setSelected(new Set()); setConfirming(false); refetch()
}
```

Adiciona `import { unpayBill } from '../lib/db'` se ainda não tiver. Confirma que `payBill` está importado.

- [ ] **Step 3: Atualizar `BucketSection` calls e remover `PayBillModal`**

Localiza onde `<BucketSection ... onTogglePaid={handleTogglePaid} ...>` é renderizado. Atualiza pra:

```jsx
<BucketSection label="Renda" items={byBucket.income}
  selected={selected} onToggleSelect={toggleSelect} onUnpay={handleUnpay} onEdit={setEditing}/>
<BucketSection label="Crédito" items={byBucket.credit}
  selected={selected} onToggleSelect={toggleSelect} onUnpay={handleUnpay} onEdit={setEditing}/>
<BucketSection label="Únicos" items={byBucket.once}
  selected={selected} onToggleSelect={toggleSelect} onUnpay={handleUnpay} onEdit={setEditing} defaultOpen={false}/>
```

Remove o handler antigo `handleTogglePaid` (não é mais usado). Remove o bloco que renderizava `<PayBillModal ...>`.

ADICIONA no fim do JSX (antes do fecha `</div>` final):

```jsx
<SelectionPopup
  count={selected.size}
  total={selectedTotal}
  onClear={() => setSelected(new Set())}
  onConfirm={() => setConfirming(true)}
  disabled={submitting}
/>
{confirming && (
  <ConfirmPayDialog
    items={selectedItems}
    onAlreadyImported={confirmAlreadyImported}
    onPayNow={confirmPayNow}
    onCancel={() => { setConfirming(false); setDialogError('') }}
    submitting={submitting}
    error={dialogError}
  />
)}
```

- [ ] **Step 4: Build**

Run: `npx vite build`
Expected: build OK.

- [ ] **Step 5: Run vitest pra garantir que nada quebrou**

Run: `npx vitest run`
Expected: 23/23 pass.

- [ ] **Step 6: Commit**

```bash
git add src/pages/BudgetPage.jsx
git commit -m "feat(budget): BudgetPage wire bulk-pay flow (popup + dialog + handlers)"
```

---

### Task D.2: Deletar `PayBillModal.jsx`

**Files:**
- Delete: `src/components/PayBillModal.jsx`

- [ ] **Step 1: Confirmar zero referências**

Run:
```bash
grep -rn "PayBillModal" src/
```

Expected: ZERO matches. Se aparecer alguma, STOP e investiga.

- [ ] **Step 2: Deletar**

```bash
rm src/components/PayBillModal.jsx
```

- [ ] **Step 3: Build + tests**

Run: `npx vitest run && npx vite build`
Expected: tudo OK.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete PayBillModal (substituido pelo bulk flow)"
```

---

## Onda E — Smoke test manual (USER)

### Task E.1: Validar fluxo completo no browser

**Files:** apenas execução manual.

- [ ] **Step 1: Garantir dev server rodando**

URL: http://localhost:5173/budget — hard refresh (Ctrl+Shift+R).

- [ ] **Step 2: Caso "já lançado"**

Marca 3 bills pendentes (click no `○` → vira `☑` verde).
Espera popup-na-base com "3 selecionados · R$ X".
Click **Confirmar** → dialog abre.
Click **Sim — só marcar como pago** → dialog fecha, bills viram `✓` Pago.
Vai pra `/transactions` → confirma que **NÃO** apareceu tx nova.

- [ ] **Step 3: Caso "lançar agora" (todos com default_account)**

Configure `default_account_id` em 2 items pelo lápis antes.
Marca esses 2 + popup → Confirmar → **Não — lançar despesa agora**.
Bills viram pagas, `/transactions` ganha 2 txs novas (com account, amount, date corretos).

- [ ] **Step 4: Caso "lançar agora" com item faltando default_account**

Marca 2 items (1 sem default_account). Confirmar → Não.
Espera erro vermelho dentro do dialog: "Estes items precisam de conta default antes: • X".
Click Cancelar. Configura no item faltante. Re-tenta. Passa.

- [ ] **Step 5: Mobile (DevTools mobile mode)**

Ativa device toolbar (Ctrl+Shift+M). Marca 1 item → popup encosta no rodapé, bottom nav some.
Limpa seleção → bottom nav volta.

- [ ] **Step 6: Unpay continua funcionando**

Click num `✓` (item já pago) → confirm dialog do browser → confirma → bill volta a pendente.
Se a bill foi paga via "lançar agora", a tx vinculada some de `/transactions`.
Se foi via "já lançado", a tx do extrato permanece intacta (sem vínculo).

- [ ] **Step 7: Reporta resultados**

Marca este checkpoint como done quando todos os 6 cenários passarem.

---

## Self-Review

**Spec coverage:**
- ✅ Seleção múltipla via checkbox → C.1 (visual `☑` + handler split)
- ✅ Popup-na-base → B.1 (SelectionPopup)
- ✅ Dialog "já lançado?" → B.2 (ConfirmPayDialog)
- ✅ Validação default_account_id → D.1 Step 2 (`confirmPayNow` missing[])
- ✅ Mobile esconde bottom nav → A.1 + A.2 + A.3 (SelectionContext + Layout)
- ✅ Deleta PayBillModal → D.2
- ✅ Unpay single mantido → D.1 Step 2 (`handleUnpay`)
- ✅ Smoke test → E.1

**Placeholder scan:** sem TBDs ou "implement later". Cada step tem código completo ou comando exato.

**Type consistency:** `selected` é `Set<bill.id>` em todo lugar; `payBill` payload mapping consistente com a impl da Onda 8; `toggleSelect`/`handleUnpay`/`onToggleSelect`/`onUnpay` nomes batem entre `PlanItemRow`, `BucketSection`, e `BudgetPage`.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-17-bulk-pay-flow.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, controller revisa entre tasks

**2. Inline Execution** — executa tasks neste chat com checkpoints

Qual prefere?
