import { useState, useEffect } from 'react'
import { Plus } from 'lucide-react'
import { useBudget } from '../hooks/useData'
import { upsertBudgetItem, unpayBill, payBill } from '../lib/db'
import {
  PAYMENT_SOURCE_LABELS,
  BUDGET_ITEM_PAYMENT_SOURCES,
  bucketOf,
} from '../lib/budgetEngine'
import SelectionPopup from '../components/planning/SelectionPopup'
import ConfirmPayDialog from '../components/planning/ConfirmPayDialog'
import BucketSection from '../components/planning/BucketSection'
import PlanningHeader from '../components/planning/PlanningHeader'
import { useSelection } from '../contexts/SelectionContext'
import { supabase } from '../lib/supabase'
import { format as dfFormat } from 'date-fns'

const TYPE_LABELS = { income: 'Receita', investment: 'Investimento', essential: 'Essencial', variable: 'Variável', installment: 'Parcela/Empréstimo', reserve: 'Reserva' }
const EMPTY = { name: '', planned_amount: '', is_fixed: false, due_day: '', recurrence: 'monthly', notes: '', category_id: '', active: true, payment_source: 'fixed_income', default_account_id: null }

function ItemModal({ initial, categories, accounts = [], defaultBucket, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    if (initial?.id) return { ...EMPTY, ...initial, planned_amount: initial.planned_amount ?? '' }
    return { ...EMPTY, payment_source: defaultBucket === 'credit' ? 'credit' : 'fixed_income' }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const selectedCat = categories.find(c => c.id === form.category_id)
  const isIncome = selectedCat?.type === 'income'

  async function save() {
    if (!form.name.trim()) return setError('Informe um nome.')
    if (!form.planned_amount) return setError('Informe o valor.')
    if (!form.category_id) return setError('Selecione uma categoria.')
    if (!form.payment_source) return setError('Selecione a fonte de pagamento.')
    setSaving(true)
    const { categories: _c, ...cleanForm } = form
    const { error: err } = await upsertBudgetItem({
      ...cleanForm,
      planned_amount: parseFloat(cleanForm.planned_amount),
      due_day: cleanForm.due_day ? parseInt(cleanForm.due_day) : null,
    })
    if (err) setError(err.message)
    else { onSaved(); onClose() }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-lg text-white">{form.id ? 'Editar' : 'Novo'} item</h2>

        <div>
          <label className="label">Categoria</label>
          <select className="input" value={form.category_id} onChange={e => set('category_id', e.target.value)}>
            <option value="">Selecionar...</option>
            {categories.map(c => (
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
              <strong className="text-amber-400">Item fixo</strong> — protegido no replanejamento da IA.
            </label>
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

export default function BudgetPage() {
  const { items, categories, accounts, loading, refetch } = useBudget()
  const { setActive } = useSelection()
  const [editing, setEditing] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [dialogError, setDialogError] = useState('')
  const [filter, setFilter] = useState('all')

  const filtered = items.filter(i => {
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Planejamento</h1>
        <button onClick={() => setEditing({})} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={16}/> Novo item
        </button>
      </div>

      <PlanningHeader items={items}/>

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
        </div>
      )}

      {editing !== null && (
        <ItemModal initial={editing} categories={categories} accounts={accounts}
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
