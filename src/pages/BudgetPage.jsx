// ═══════════════════════════════════════════════════════════════════════════
// BudgetPage — Planejamento per-período. Itens de orçamento de um month_ref,
// materialização/edição de bills no escopo do período, ciclo e reserva.
// Estrutura: helpers → ItemModal → página principal (no fim).
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import { Plus, ChevronUp, ChevronDown, Edit2 } from 'lucide-react'
import { useBudget } from '../hooks/useData'
import { upsertBudgetItem, unpayBill, payBill, updateBillPlanned, createBillForPeriod, deleteBill, deleteBudgetItem } from '../lib/db'
import {
  PAYMENT_SOURCE_LABELS,
  BUDGET_ITEM_PAYMENT_SOURCES,
  BUDGET_ITEM_CATEGORY_TYPES,
  bucketOf,
} from '../lib/budgetEngine'
import SelectionPopup from '../components/planning/SelectionPopup'
import ConfirmPayDialog from '../components/planning/ConfirmPayDialog'
import BucketSection from '../components/planning/BucketSection'
import PlanningHeader from '../components/planning/PlanningHeader'
import { useSelection } from '../contexts/SelectionContext'
import { supabase } from '../lib/supabase'
import { format as dfFormat, addMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'

// Opções do seletor de mês do Planejamento: de 1 mês atrás até 4 à frente.
function monthOptions(base = new Date()) {
  const opts = []
  for (let i = -1; i <= 4; i++) {
    const d = addMonths(base, i)
    opts.push({ value: dfFormat(d, 'yyyy-MM'), label: dfFormat(d, 'MMM/yyyy', { locale: ptBR }) })
  }
  return opts
}

const TEMPLATE_FIELDS = ['category_id', 'payment_source', 'is_fixed', 'default_account_id', 'recurrence', 'notes']

const TYPE_LABELS = { income: 'Receita', investment: 'Investimento', essential: 'Essencial', variable: 'Variável', installment: 'Parcela/Empréstimo', reserve: 'Reserva' }
const EMPTY = { name: '', planned_amount: '', is_fixed: false, due_day: '', recurrence: 'monthly', notes: '', category_id: '', active: true, payment_source: 'fixed_income', default_account_id: null }

function ItemModal({ initial, categories, accounts = [], defaultBucket, monthRef, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    if (initial?.id) {
      // Per-período: o valor exibido é o da bill do mês em foco (se existir), não o do template.
      const amount = initial.bill ? initial.bill.amount : initial.planned_amount
      return { ...EMPTY, ...initial, planned_amount: amount ?? '' }
    }
    return { ...EMPTY, payment_source: defaultBucket === 'credit' ? 'credit' : 'fixed_income' }
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const selectedCat = categories.find(c => c.id === form.category_id)
  const isIncome = selectedCat?.type === 'income'

  async function save() {
    if (!form.name.trim()) return setError('Informe um nome.')
    if (!form.planned_amount) return setError('Informe o valor.')
    if (!form.category_id) return setError('Selecione uma categoria.')
    if (!form.payment_source) return setError('Selecione a fonte de pagamento.')
    if (initial?.bill?.is_paid && parseFloat(form.planned_amount) !== Number(initial.bill.amount)) {
      return setError('Conta já paga neste mês — desmarque o pagamento antes de mudar o valor.')
    }
    setSaving(true)
    const amount = parseFloat(form.planned_amount)
    const dueDay = form.due_day ? parseInt(form.due_day) : null
    const due_date = `${monthRef}-${String(Math.min(dueDay || 15, 28)).padStart(2, '0')}`

    try {
      if (!initial?.id) {
        // NOVO: cria o template + a bill do mês em foco.
        const { categories: _c, bill: _b, ...clean } = form
        const { data: item, error: e1 } = await upsertBudgetItem({ ...clean, planned_amount: amount, due_day: dueDay })
        if (e1) throw e1
        const { error: e2 } = await createBillForPeriod({ item, monthRef, amount, name: form.name, dueDay })
        if (e2) throw e2
      } else {
        // EDIÇÃO per-período: valor/nome/vencimento vão pra bill do mês (não cascateia).
        if (initial.bill) {
          const { error } = await updateBillPlanned(initial.bill.id, { amount, name: form.name, due_date })
          if (error) throw error
        } else {
          const { error } = await createBillForPeriod({ item: initial, monthRef, amount, name: form.name, dueDay })
          if (error) throw error
        }
        // Template só é tocado se mudou campo estrutural (evita a trigger resetar o ciclo vigente).
        const changed = TEMPLATE_FIELDS.some(k => (form[k] ?? null) !== (initial[k] ?? null))
        if (changed) {
          const { categories: _c, bill: _b, planned_amount: _p, ...clean } = form
          const { error } = await upsertBudgetItem({ ...clean, id: initial.id, due_day: dueDay })
          if (error) throw error
        }
      }
      onSaved(); onClose()
    } catch (err) {
      setError(err.message || 'Falha ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  async function removeFromPeriod() {
    if (!initial?.bill) return
    if (initial.bill.is_paid) return setError('Bill paga — desmarque o pagamento antes de excluir.')
    if (!confirm(`Excluir "${initial.name}" só do mês em foco? O template e os outros meses ficam intactos.`)) return
    setDeleting(true)
    const { error } = await deleteBill(initial.bill.id)
    if (error) { setError(error.message); setDeleting(false); return }
    onSaved(); onClose()
  }

  async function removeTemplate() {
    if (!initial?.id) return
    if (!confirm(`Excluir "${initial.name}" de TODOS os meses (desativa o template)? Bills pagas viram histórico.`)) return
    setDeleting(true)
    const { error } = await deleteBudgetItem(initial.id)
    if (error) { setError(error.message); setDeleting(false); return }
    onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div>
          <h2 className="font-bold text-lg text-white">{form.id ? 'Editar' : 'Novo'} item</h2>
          <p className="text-xs text-gray-500">Mês em foco: <strong className="text-gray-300">{monthRef}</strong> — valor/vencimento valem só pra este mês.</p>
        </div>

        <div>
          <label className="label">Categoria</label>
          <select className="input" value={form.category_id} onChange={e => set('category_id', e.target.value)}>
            <option value="">Selecionar...</option>
            {categories.filter(c => BUDGET_ITEM_CATEGORY_TYPES.includes(c.type)).map(c => (
              <option key={c.id} value={c.id}>
                [{TYPE_LABELS[c.type] || '—'}] {c.icon} {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Fonte de pagamento *</label>
          <select className="input" value={form.payment_source} onChange={e => set('payment_source', e.target.value)}>
            {BUDGET_ITEM_PAYMENT_SOURCES.map(s => (
              <option key={s} value={s}>{PAYMENT_SOURCE_LABELS[s]}</option>
            ))}
          </select>
          <p className="text-xs text-gray-600 mt-1">Define se este item entra no bucket Renda ou Crédito. Reserva é só para imprevistos (lançamentos avulsos).</p>
        </div>

        <div>
          <label className="label">Conta default (opcional)</label>
          <select className="input" value={form.default_account_id || ''} onChange={e => set('default_account_id', e.target.value || null)}>
            <option value="">— Perguntar ao marcar pago —</option>
            {accounts
              .filter(a => a.is_active !== false && (
                form.payment_source === 'credit' ? a.type === 'credit' : a.default_payment_source === form.payment_source
              ))
              .map(a => <option key={a.id} value={a.id}>{a.name}</option>)
            }
          </select>
        </div>

        <div>
          <label className="label">Nome</label>
          <input className="input" placeholder={isIncome ? 'Ex: Salário, Freelance...' : 'Ex: Aluguel, Mercado...'} value={form.name} onChange={e => set('name', e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{isIncome ? 'Valor esperado (R$)' : 'Valor planejado (R$)'}</label>
            <input className="input" type="number" step="0.01" min="0" placeholder="0,00" value={form.planned_amount} onChange={e => set('planned_amount', e.target.value)} />
          </div>
          {!isIncome && (
            <div>
              <label className="label">Dia de vencimento</label>
              <input className="input" type="number" min={1} max={31} placeholder="Ex: 10" value={form.due_day || ''} onChange={e => set('due_day', e.target.value)} />
            </div>
          )}
        </div>

        <div>
          <label className="label">Recorrência</label>
          <select className="input" value={form.recurrence} onChange={e => set('recurrence', e.target.value)}>
            <option value="monthly">Mensal</option>
            <option value="yearly">Anual</option>
            <option value="once">Única vez</option>
          </select>
        </div>

        <div>
          <label className="label">Observações</label>
          <input className="input" placeholder="Opcional..." value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
        </div>

        {!isIncome && (
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
            <input type="checkbox" id="bfixed" checked={form.is_fixed} onChange={e => set('is_fixed', e.target.checked)} className="accent-amber-500 w-4 h-4 mt-0.5 flex-shrink-0"/>
            <label htmlFor="bfixed" className="text-sm text-amber-200 cursor-pointer">
              <strong className="text-amber-400">Item fixo</strong> — valor que se repete igual todo mês.
            </label>
          </div>
        )}

        {initial?.bill?.is_paid && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <p className="text-xs text-amber-300">
              ⚠ A bill deste mês já está paga. Desmarque o pagamento antes de mexer no valor.
            </p>
          </div>
        )}

        {initial?.id && TEMPLATE_FIELDS.some(k => (form[k] ?? null) !== (initial[k] ?? null)) && (
          <div className="bg-sky-500/10 border border-sky-500/30 rounded-lg p-3">
            <p className="text-xs text-sky-300">
              ℹ Você mudou categoria/fonte/recorrência — isso altera o <strong>template</strong> (todos os meses).
            </p>
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={saving || deleting} className="btn-primary flex-1">{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>

        {initial?.id && (
          <div className="flex flex-col gap-1 pt-2 border-t border-gray-800">
            {initial.bill && (
              <button onClick={removeFromPeriod} disabled={deleting || saving}
                className="text-xs text-gray-400 hover:text-red-400 py-1.5 text-left">
                Excluir só do mês {monthRef}
              </button>
            )}
            <button onClick={removeTemplate} disabled={deleting || saving}
              className="text-xs text-gray-500 hover:text-red-400 py-1.5 text-left">
              Excluir item de todos os meses (desativa template)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const fmtBRL = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Itens ativos do template que ainda não têm conta no mês em foco.
// Permite "puxar" um item pro mês (cria a bill) — completa o fluxo per-período.
function TemplatesSection({ items, monthRef, onAdd, onEdit }) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(null)
  if (items.length === 0) return null

  async function add(item) {
    setAdding(item.id)
    await onAdd(item)
    setAdding(null)
  }

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          {open ? <ChevronUp size={16} className="text-gray-500"/> : <ChevronDown size={16} className="text-gray-500"/>}
          <p className="font-semibold text-gray-400">Itens do template <span className="text-gray-600 font-normal">(sem conta em {monthRef})</span></p>
          <span className="badge bg-gray-800 text-gray-400">{items.length}</span>
        </div>
      </button>
      {open && (
        <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
          {items.map(i => (
            <div key={i.id} className="flex items-center gap-3 p-3 rounded-xl border bg-gray-900 border-gray-800">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-300 truncate">{i.name}</p>
                <p className="text-xs text-gray-600">{fmtBRL(i.planned_amount)} no template</p>
              </div>
              <button onClick={() => onEdit(i)} className="text-gray-600 hover:text-gray-400 p-1"><Edit2 size={14}/></button>
              <button onClick={() => add(i)} disabled={adding === i.id}
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50">
                {adding === i.id ? '...' : '+ Adicionar a este mês'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────────
export default function BudgetPage() {
  const months = monthOptions()
  const [monthRef, setMonthRef] = useState(() => dfFormat(new Date(), 'yyyy-MM'))
  const { items, categories, accounts, loading, refetch } = useBudget(monthRef)
  const { setActive } = useSelection()
  const [editing, setEditing] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [dialogError, setDialogError] = useState('')
  const [filter, setFilter] = useState('all')

  // Per-período: o plano do mês = itens COM bill no mês em foco.
  const inMonth = items.filter(i => i.bill)
  // Templates ativos que ainda não têm conta neste mês (podem ser puxados).
  const templates = items.filter(i => !i.bill)

  const filtered = inMonth.filter(i => {
    if (filter === 'pending') return !i.bill?.is_paid
    if (filter === 'paid') return i.bill?.is_paid
    return true
  })
  const byBucket = {
    income: filtered.filter(i => bucketOf(i.payment_source) === 'income' && i.recurrence !== 'once'),
    credit: filtered.filter(i => bucketOf(i.payment_source) === 'credit' && i.recurrence !== 'once'),
    once:   filtered.filter(i => i.recurrence === 'once'),
  }

  // Sincroniza com SelectionContext (esconde bottom nav mobile)
  useEffect(() => { setActive(selected.size > 0) }, [selected.size, setActive])
  useEffect(() => () => setActive(false), [setActive])

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
    const { error } = await unpayBill(item.bill.id)
    if (error) alert('Falha ao desmarcar: ' + error.message)
    refetch()
  }

  async function addToMonth(item) {
    const { error } = await createBillForPeriod({ item, monthRef })
    if (error) { alert('Falha ao adicionar: ' + error.message); return }
    refetch()
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
    const toPay = selectedItems.filter(i => i.bill && !i.bill.is_paid)
    if (toPay.length === 0) {
      setSelected(new Set()); setConfirming(false); setSubmitting(false); refetch()
      return
    }
    const missing = toPay.filter(i => {
      if (!i.default_account_id) return true
      const acct = accounts.find(a => a.id === i.default_account_id)
      return !acct || acct.is_active === false
    }).map(i => i.name)
    if (missing.length > 0) {
      setDialogError('Estes items precisam de conta default antes:\n  • ' + missing.join('\n  • ') + '\nEdite cada um (lápis) e tente de novo.')
      setSubmitting(false); return
    }
    const today = dfFormat(new Date(), 'yyyy-MM-dd')
    const results = await Promise.all(toPay.map(i => payBill({
      billId: i.bill.id, accountId: i.default_account_id, amount: i.bill.amount,
      date: today, paymentSource: i.payment_source, categoryId: i.category_id, budgetItemId: i.id,
    })))
    setSubmitting(false)
    const failed = results.filter(r => r.error)
    if (failed.length > 0) {
      setDialogError(`${failed.length} de ${toPay.length} falharam. Mantive selecionados pra retry.`)
      return
    }
    setSelected(new Set()); setConfirming(false); refetch()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Planejamento</h1>
        <button onClick={() => setEditing({})} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={16}/> Novo item
        </button>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-500">Mês:</label>
        <select className="input w-auto py-1.5 text-sm" value={monthRef} onChange={e => { setMonthRef(e.target.value); setSelected(new Set()) }}>
          {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      <PlanningHeader items={inMonth}/>

      <div className="flex gap-2">
        {[['all','Todos'],['pending','Pendentes'],['paid','Pagos']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border ${filter === v ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-gray-700 text-gray-400'}`}>
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="card h-20 animate-pulse bg-gray-800"/>)}</div>
      ) : (
        <div className="space-y-3">
          <BucketSection label="Renda" items={byBucket.income}
            selected={selected} onToggleSelect={toggleSelect} onUnpay={handleUnpay} onEdit={setEditing}/>
          <BucketSection label="Crédito" items={byBucket.credit}
            selected={selected} onToggleSelect={toggleSelect} onUnpay={handleUnpay} onEdit={setEditing}/>
          <BucketSection label="Únicos" items={byBucket.once}
            selected={selected} onToggleSelect={toggleSelect} onUnpay={handleUnpay} onEdit={setEditing} defaultOpen={false}/>

          {templates.length > 0 && (
            <TemplatesSection items={templates} monthRef={monthRef} onAdd={addToMonth} onEdit={setEditing}/>
          )}
        </div>
      )}

      {editing !== null && (
        <ItemModal initial={editing} categories={categories} accounts={accounts} monthRef={monthRef}
                   onClose={() => setEditing(null)} onSaved={refetch}/>
      )}
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
    </div>
  )
}
