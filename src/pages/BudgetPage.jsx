import { useState } from 'react'
import { Plus, Edit2, Trash2, Lock, TrendingUp, TrendingDown } from 'lucide-react'
import { useBudgetItems } from '../hooks/useData'
import { upsertBudgetItem, deleteBudgetItem } from '../lib/db'

const TYPE_LABELS = { income: 'Receita', investment: 'Investimento', essential: 'Essencial', variable: 'Variável', installment: 'Parcela/Empréstimo', reserve: 'Reserva' }
const EMPTY = { name: '', planned_amount: '', is_fixed: false, due_day: '', recurrence: 'monthly', notes: '', category_id: '', active: true }

function ItemModal({ initial, categories, onClose, onSaved }) {
  const [form, setForm] = useState(initial?.id ? { ...initial, planned_amount: initial.planned_amount ?? '' } : EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const selectedCat = categories.find(c => c.id === form.category_id)
  const isIncome = selectedCat?.type === 'income'

  async function save() {
    if (!form.name.trim()) return setError('Informe um nome.')
    if (!form.planned_amount) return setError('Informe o valor.')
    if (!form.category_id) return setError('Selecione uma categoria.')
    setSaving(true)
    const { error: err } = await upsertBudgetItem({ ...form, planned_amount: parseFloat(form.planned_amount), due_day: form.due_day ? parseInt(form.due_day) : null })
    if (err) setError(err.message)
    else { onSaved(); onClose() }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-lg text-white">{form.id ? 'Editar' : 'Novo'} item do planejamento</h2>

        <div>
          <label className="label">Categoria</label>
          <select className="input" value={form.category_id} onChange={e => set('category_id', e.target.value)}>
            <option value="">Selecionar...</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name} — {TYPE_LABELS[c.type]}</option>)}
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
              <input className="input" type="number" min={1} max={31} placeholder="Ex: 10" value={form.due_day} onChange={e => set('due_day', e.target.value)} />
              <p className="text-xs text-gray-600 mt-1">Gera lembrete automático</p>
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
              <strong className="text-amber-400">Item fixo</strong> — protegido no replanejamento da IA. Marque para contas obrigatórias como aluguel e luz.
            </label>
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>

        {!isIncome && form.category_id && (
          <p className="text-xs text-center text-gray-600">💡 Este item aparecerá automaticamente em Lembretes</p>
        )}
      </div>
    </div>
  )
}

export default function BudgetPage() {
  const { items, categories, loading, refetch } = useBudgetItems()
  const [modal, setModal] = useState(null)

  const incomeItems = items.filter(i => i.categories?.type === 'income')
  const expenseItems = items.filter(i => i.categories?.type !== 'income')

  const totalIncome = incomeItems.reduce((a, i) => a + Number(i.planned_amount), 0)
  const totalExpenses = expenseItems.reduce((a, i) => a + Number(i.planned_amount), 0)
  const balance = totalIncome - totalExpenses

  // Agrupa despesas por categoria
  const expensesByCategory = categories
    .filter(c => c.type !== 'income')
    .map(cat => ({ cat, items: expenseItems.filter(i => i.category_id === cat.id) }))
    .filter(g => g.items.length > 0)

  async function handleDelete(item) {
    if (item.is_fixed && !confirm(`"${item.name}" é fixo. Confirma exclusão?`)) return
    if (!item.is_fixed && !confirm(`Excluir "${item.name}"?`)) return
    await deleteBudgetItem(item.id)
    refetch()
  }

  const fmt = v => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Planejamento</h1>
          <p className="text-xs text-gray-500 mt-0.5">Receitas e despesas planejadas · itens de despesa geram lembretes automaticamente</p>
        </div>
        <button onClick={() => setModal({})} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={16}/> Novo item
        </button>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card">
          <div className="flex items-center gap-1.5 mb-1"><TrendingUp size={12} className="text-emerald-400"/><p className="text-xs text-gray-500">Receita planejada</p></div>
          <p className="text-base font-bold text-emerald-400">{fmt(totalIncome)}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-1.5 mb-1"><TrendingDown size={12} className="text-red-400"/><p className="text-xs text-gray-500">Despesas planejadas</p></div>
          <p className="text-base font-bold text-red-400">{fmt(totalExpenses)}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500 mb-1">Saldo previsto</p>
          <p className={`text-base font-bold ${balance >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(balance)}</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="card h-32 animate-pulse bg-gray-800"/>)}</div>
      ) : (
        <div className="space-y-5">

          {/* RECEITAS */}
          {incomeItems.length > 0 && (
            <div className="card border-emerald-500/20">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} className="text-emerald-400"/>
                  <p className="font-semibold text-white">Receitas</p>
                </div>
                <p className="text-sm font-bold text-emerald-400">{fmt(totalIncome)}</p>
              </div>
              <div className="space-y-1">
                {incomeItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between py-2 border-t border-gray-800">
                    <p className="text-sm text-gray-300">{item.name}</p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-emerald-400">{fmt(item.planned_amount)}</p>
                      <button onClick={() => setModal(item)} className="text-gray-600 hover:text-gray-400 p-1"><Edit2 size={13}/></button>
                      <button onClick={() => handleDelete(item)} className="text-gray-600 hover:text-red-400 p-1"><Trash2 size={13}/></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DESPESAS por categoria */}
          {expensesByCategory.map(({ cat, items: catItems }) => {
            const catTotal = catItems.reduce((a, i) => a + Number(i.planned_amount), 0)
            return (
              <div key={cat.id} className="card">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{cat.icon}</span>
                    <div>
                      <p className="font-semibold text-white text-sm">{cat.name}</p>
                      <p className="text-xs text-gray-500">{TYPE_LABELS[cat.type]}</p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-white">{fmt(catTotal)}</p>
                </div>
                <div className="space-y-0">
                  {catItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between py-2 border-t border-gray-800">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {item.is_fixed && <Lock size={11} className="text-amber-400 flex-shrink-0"/>}
                        <p className="text-sm text-gray-300 truncate">{item.name}</p>
                        {item.due_day && <span className="text-xs text-gray-600 flex-shrink-0">dia {item.due_day}</span>}
                        <span className="text-xs text-gray-700 flex-shrink-0">{item.recurrence === 'monthly' ? 'mensal' : item.recurrence === 'yearly' ? 'anual' : 'único'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <p className="text-sm font-medium text-white">{fmt(item.planned_amount)}</p>
                        <button onClick={() => setModal(item)} className="text-gray-600 hover:text-gray-400 p-1"><Edit2 size={13}/></button>
                        <button onClick={() => handleDelete(item)} className="text-gray-600 hover:text-red-400 p-1"><Trash2 size={13}/></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}

          {items.length === 0 && (
            <div className="card text-center py-10">
              <p className="text-gray-500 text-sm">Nenhum item no planejamento ainda.</p>
              <button onClick={() => setModal({})} className="text-emerald-400 text-sm hover:text-emerald-300 mt-2">+ Adicionar primeiro item</button>
            </div>
          )}
        </div>
      )}

      {modal !== null && <ItemModal initial={modal} categories={categories} onClose={() => setModal(null)} onSaved={refetch}/>}
    </div>
  )
}
