import { useState, useMemo } from 'react'
import { Plus, Trash2, Edit2, Target, Lock, CheckCircle2, Moon } from 'lucide-react'
import { useGoals, useGoalLinkedTransactions, useCycles, useTransactionsByCycle } from '../hooks/useData'
import { upsertGoal, deleteGoal } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'

const EMPTY = {
  name: '',
  description: '',
  target_amount: '',
  current_amount: '0',
  is_fixed: false,
  priority: 1,
  category: '',
}

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
