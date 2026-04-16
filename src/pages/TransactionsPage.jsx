import { useState } from 'react'
import { format, subMonths, addMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, Trash2, ChevronLeft, ChevronRight, Filter, Edit2 } from 'lucide-react'
import { useTransactions, useMonthRef, useBudgetItems } from '../hooks/useData'
import { addTransaction, deleteTransaction, updateTransaction } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import { PAYMENT_SOURCE_LABELS, PAYMENT_SOURCE_ORDER } from '../lib/budgetEngine'

const TYPE_LABELS = { income: 'Receita', expense: 'Despesa', investment: 'Investimento', transfer: 'Transferência' }
const TYPE_COLORS = { income: 'chip-income', expense: 'chip-expense', investment: 'chip-investment', transfer: 'badge bg-blue-500/20 text-blue-400' }

const EMPTY = { description: '', amount: '', type: 'expense', date: format(new Date(), 'yyyy-MM-dd'), category_id: '', budget_item_id: '', notes: '', is_paid: true, payment_source: 'fixed_income' }

function TxModal({ onClose, onSaved, initial, categories, budgetItems, userId }) {
  const [form, setForm] = useState(initial || EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!form.description || !form.amount) return setError('Preencha descrição e valor.')
    if (!form.payment_source) return setError('Selecione a fonte de pagamento.')
    setSaving(true)
    const payload = {
      ...form,
      amount: parseFloat(form.amount),
      user_id: userId,
      category_id: form.category_id || null,
      budget_item_id: form.budget_item_id || null,
    }
    const { error: err } = form.id ? await updateTransaction(form.id, payload) : await addTransaction(payload)
    if (err) setError(err.message)
    else { onSaved(); onClose() }
    setSaving(false)
  }

  const filteredItems = form.category_id ? budgetItems.filter(i => i.category_id === form.category_id) : budgetItems

  // Herda payment_source do budget_item ao selecionar
  function pickBudgetItem(id) {
    const item = budgetItems.find(i => i.id === id)
    setForm(f => ({ ...f, budget_item_id: id, payment_source: item?.payment_source || f.payment_source }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-lg text-white">{form.id ? 'Editar' : 'Novo'} Lançamento</h2>

        <div>
          <label className="label">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <button key={k} onClick={() => set('type', k)}
                className={`py-2 rounded-xl text-sm font-medium border transition-all ${form.type === k ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-gray-700 text-gray-400 hover:border-gray-600'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Descrição</label>
          <input className="input" placeholder="Ex: Mercado, Conta de luz..." value={form.description} onChange={e => set('description', e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Valor (R$)</label>
            <input className="input" type="number" step="0.01" min="0" placeholder="0,00" value={form.amount} onChange={e => set('amount', e.target.value)} />
          </div>
          <div>
            <label className="label">Data</label>
            <input className="input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Categoria</label>
          <select className="input" value={form.category_id} onChange={e => { set('category_id', e.target.value); set('budget_item_id', '') }}>
            <option value="">Selecionar...</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
        </div>

        {filteredItems.length > 0 && (
          <div>
            <label className="label">Item do orçamento</label>
            <select className="input" value={form.budget_item_id} onChange={e => pickBudgetItem(e.target.value)}>
              <option value="">Nenhum</option>
              {filteredItems.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="label">Fonte de pagamento *</label>
          <select className="input" value={form.payment_source} onChange={e => set('payment_source', e.target.value)}>
            {PAYMENT_SOURCE_ORDER.map(s => (
              <option key={s} value={s}>{PAYMENT_SOURCE_LABELS[s]}</option>
            ))}
          </select>
          {form.budget_item_id && <p className="text-xs text-gray-600 mt-1">Herdado do item do orçamento — pode sobrescrever.</p>}
        </div>

        <div>
          <label className="label">Notas (opcional)</label>
          <textarea className="input resize-none" rows={2} placeholder="Observações..." value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="paid" checked={form.is_paid} onChange={e => set('is_paid', e.target.checked)} className="accent-emerald-500 w-4 h-4"/>
          <label htmlFor="paid" className="text-sm text-gray-300">Já pago/recebido</label>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TransactionsPage() {
  const [monthRef, setMonthRef] = useState(format(new Date(), 'yyyy-MM'))
  const { transactions, loading, refetch } = useTransactions(monthRef)
  const { items: budgetItems, categories } = useBudgetItems()
  const { user } = useAuth()
  const [modal, setModal] = useState(null)
  const [filterType, setFilterType] = useState('all')

  const prevMonth = () => setMonthRef(format(subMonths(new Date(monthRef + '-01'), 1), 'yyyy-MM'))
  const nextMonth = () => setMonthRef(format(addMonths(new Date(monthRef + '-01'), 1), 'yyyy-MM'))

  const monthLabel = format(new Date(monthRef + '-02'), "MMMM 'de' yyyy", { locale: ptBR })

  const filtered = filterType === 'all' ? transactions : transactions.filter(t => t.type === filterType)

  const totals = {
    income: transactions.filter(t => t.type === 'income').reduce((a, t) => a + Number(t.amount), 0),
    expense: transactions.filter(t => t.type === 'expense').reduce((a, t) => a + Number(t.amount), 0),
  }

  async function handleDelete(id) {
    if (!confirm('Excluir este lançamento?')) return
    await deleteTransaction(id)
    refetch()
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Lançamentos</h1>
        <button onClick={() => setModal({})} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={16}/> Novo
        </button>
      </div>

      {/* Month nav */}
      <div className="card flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 hover:text-emerald-400 text-gray-400 transition-colors"><ChevronLeft size={18}/></button>
        <p className="font-semibold text-white capitalize">{monthLabel}</p>
        <button onClick={nextMonth} className="p-2 hover:text-emerald-400 text-gray-400 transition-colors"><ChevronRight size={18}/></button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card">
          <p className="text-xs text-gray-500 mb-1">Receitas</p>
          <p className="text-lg font-bold text-emerald-400">R$ {totals.income.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 mb-1">Despesas</p>
          <p className="text-lg font-bold text-red-400">R$ {totals.expense.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'income', 'expense', 'investment'].map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${filterType === t ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-gray-700 text-gray-400'}`}>
            {t === 'all' ? 'Todos' : TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="card h-16 animate-pulse bg-gray-800"/>)}</div> : (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="card text-center py-10">
              <p className="text-gray-500 text-sm">Nenhum lançamento neste mês.</p>
              <button onClick={() => setModal({})} className="text-emerald-400 text-sm hover:text-emerald-300 mt-2">+ Adicionar primeiro</button>
            </div>
          )}
          {filtered.map(tx => (
            <div key={tx.id} className="card flex items-center gap-3 animate-in">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{tx.description}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-gray-500">{tx.date}</span>
                  <span className={TYPE_COLORS[tx.type] || 'badge bg-gray-700 text-gray-400'}>{TYPE_LABELS[tx.type]}</span>
                  {tx.categories && <span className="text-xs text-gray-500">{tx.categories.icon} {tx.categories.name}</span>}
                  {!tx.is_paid && <span className="badge bg-amber-500/20 text-amber-400">Pendente</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <p className={`text-sm font-bold ${tx.type === 'income' ? 'text-emerald-400' : tx.type === 'expense' ? 'text-red-400' : 'text-purple-400'}`}>
                  {tx.type === 'income' ? '+' : '-'}R$ {Number(tx.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </p>
                <button onClick={() => setModal(tx)} className="text-gray-600 hover:text-gray-400 p-1"><Edit2 size={14}/></button>
                <button onClick={() => handleDelete(tx.id)} className="text-gray-600 hover:text-red-400 p-1"><Trash2 size={14}/></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal !== null && (
        <TxModal
          initial={modal}
          categories={categories}
          budgetItems={budgetItems}
          userId={user?.id}
          onClose={() => setModal(null)}
          onSaved={refetch}
        />
      )}
    </div>
  )
}
