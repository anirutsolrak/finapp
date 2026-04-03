import { useState } from 'react'
import { Plus, Edit2, Trash2, Lock, ToggleLeft, ToggleRight } from 'lucide-react'
import { useBudgetItems } from '../hooks/useData'
import { upsertBudgetItem, deleteBudgetItem } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'

const TYPE_MAP = { income: 'Receita', investment: 'Investimento', essential: 'Essencial', variable: 'Variável', installment: 'Parcela/Empréstimo', reserve: 'Reserva' }

const EMPTY = { name: '', planned_amount: '', is_fixed: false, due_day: '', recurrence: 'monthly', notes: '', category_id: '', active: true }

function ItemModal({ initial, categories, onClose, onSaved }) {
  const [form, setForm] = useState(initial?.id ? initial : EMPTY)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!form.name || !form.planned_amount) return
    setSaving(true)
    await upsertBudgetItem({ ...form, planned_amount: parseFloat(form.planned_amount) })
    onSaved(); onClose()
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-lg text-white">{form.id ? 'Editar' : 'Novo'} item</h2>

        <div>
          <label className="label">Nome</label>
          <input className="input" placeholder="Ex: Aluguel, Netflix..." value={form.name} onChange={e => set('name', e.target.value)} />
        </div>

        <div>
          <label className="label">Categoria</label>
          <select className="input" value={form.category_id} onChange={e => set('category_id', e.target.value)}>
            <option value="">Selecionar...</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Valor planejado (R$)</label>
            <input className="input" type="number" step="0.01" placeholder="0,00" value={form.planned_amount} onChange={e => set('planned_amount', e.target.value)} />
          </div>
          <div>
            <label className="label">Dia de vencimento</label>
            <input className="input" type="number" min={1} max={31} placeholder="Ex: 5" value={form.due_day} onChange={e => set('due_day', e.target.value)} />
          </div>
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
          <label className="label">Notas</label>
          <input className="input" placeholder="Observações..." value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="bfixed" checked={form.is_fixed} onChange={e => set('is_fixed', e.target.checked)} className="accent-amber-500 w-4 h-4"/>
          <label htmlFor="bfixed" className="text-sm text-gray-300">Item fixo (protegido pela IA no replanejamento)</label>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

export default function BudgetPage() {
  const { items, categories, loading, refetch } = useBudgetItems()
  const [modal, setModal] = useState(null)

  const grouped = categories.reduce((acc, cat) => {
    const catItems = items.filter(i => i.category_id === cat.id)
    if (catItems.length > 0) acc[cat.id] = { cat, items: catItems }
    return acc
  }, {})

  const totalPlanned = items.reduce((a, i) => a + Number(i.planned_amount), 0)
  const incomeTotal = items.filter(i => i.categories?.type === 'income').reduce((a, i) => a + Number(i.planned_amount), 0)
  const expenseTotal = items.filter(i => i.categories?.type !== 'income').reduce((a, i) => a + Number(i.planned_amount), 0)

  async function handleDelete(item) {
    if (item.is_fixed && !confirm(`"${item.name}" é fixo. Confirma exclusão?`)) return
    if (!item.is_fixed && !confirm(`Excluir "${item.name}"?`)) return
    await deleteBudgetItem(item.id)
    refetch()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Orçamento</h1>
        <button onClick={() => setModal({})} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={16}/> Novo item
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Receita</p>
          <p className="text-sm font-bold text-emerald-400">R$ {incomeTotal.toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Despesas</p>
          <p className="text-sm font-bold text-red-400">R$ {expenseTotal.toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-gray-500 mb-1">Saldo</p>
          <p className={`text-sm font-bold ${incomeTotal - expenseTotal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            R$ {(incomeTotal - expenseTotal).toLocaleString('pt-BR', {minimumFractionDigits:2})}
          </p>
        </div>
      </div>

      {/* Grouped items */}
      {loading ? (
        <div className="space-y-4">{[...Array(4)].map((_, i) => <div key={i} className="card h-32 animate-pulse bg-gray-800"/>)}</div>
      ) : (
        <div className="space-y-4">
          {Object.values(grouped).map(({ cat, items: catItems }) => {
            const catTotal = catItems.reduce((a, i) => a + Number(i.planned_amount), 0)
            return (
              <div key={cat.id} className="card">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{cat.icon}</span>
                    <p className="font-semibold text-white text-sm">{cat.name}</p>
                    <span className="badge bg-gray-700 text-gray-400">{TYPE_MAP[cat.type]}</span>
                  </div>
                  <p className="text-sm font-bold text-white">R$ {catTotal.toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
                </div>
                <div className="space-y-2">
                  {catItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between py-2 border-t border-gray-800">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {item.is_fixed && <Lock size={11} className="text-amber-400 flex-shrink-0"/>}
                        <p className="text-sm text-gray-300 truncate">{item.name}</p>
                        {item.due_day && <span className="text-xs text-gray-600">dia {item.due_day}</span>}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <p className="text-sm font-medium text-white">R$ {Number(item.planned_amount).toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
                        <button onClick={() => setModal(item)} className="text-gray-600 hover:text-gray-400 p-1"><Edit2 size={13}/></button>
                        <button onClick={() => handleDelete(item)} className="text-gray-600 hover:text-red-400 p-1"><Trash2 size={13}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal !== null && <ItemModal initial={modal} categories={categories} onClose={() => setModal(null)} onSaved={refetch}/>}
    </div>
  )
}
