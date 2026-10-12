// ═══════════════════════════════════════════════════════════════════════════
// GoalsPage — gestão das metas: criar, editar, concluir, reabrir, excluir.
// As ações do dia a dia (guardar, pagar) vêm do GoalCards, o mesmo cartão que
// aparece na tela principal. O progresso vem pronto de useGoals (goal.progress).
// Estrutura: GoalModal → página principal (no fim).
// ═══════════════════════════════════════════════════════════════════════════
import { useState } from 'react'
import { Plus, Trash2, Target } from 'lucide-react'
import { useGoals, useAccounts } from '../hooks/useData'
import { upsertGoal, deleteGoal } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import GoalCards from '../components/goals/GoalCards'

const EMPTY = { name: '', description: '', target_amount: '', current_amount: '0', priority: 1 }

function GoalModal({ initial, userId, onClose, onSaved }) {
  const [form, setForm] = useState(() => initial?.id ? { ...EMPTY, ...initial } : EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    const target = parseFloat(form.target_amount)
    if (!form.name.trim()) return setError('Informe o nome da meta.')
    if (!(target > 0)) return setError('Informe o valor alvo.')
    setSaving(true); setError('')
    const { error: err } = await upsertGoal({
      ...(form.id ? { id: form.id } : { user_id: userId }),  // editar não troca o dono da meta
      name: form.name.trim(),
      description: form.description,
      target_amount: target,
      current_amount: parseFloat(form.current_amount) || 0,
      priority: form.priority,
    })
    setSaving(false)
    if (err) return setError(err.message || 'Falha ao salvar a meta.')
    onSaved(); onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" aria-label={form.id ? 'Editar meta' : 'Nova meta'}
        className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="font-bold text-lg text-white">{form.id ? 'Editar' : 'Nova'} meta</h2>

        <div>
          <label className="label" htmlFor="g-name">Nome da meta</label>
          <input id="g-name" className="input" placeholder="Ex: Placa de vídeo, Viagem..." value={form.name} onChange={e => set('name', e.target.value)} />
        </div>

        <div>
          <label className="label" htmlFor="g-desc">Descrição (opcional)</label>
          <textarea id="g-desc" className="input resize-none" rows={2} value={form.description || ''} onChange={e => set('description', e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="g-target">Valor alvo (R$)</label>
            <input id="g-target" className="input" type="number" step="0.01" min="0" placeholder="0,00" value={form.target_amount} onChange={e => set('target_amount', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="g-initial">Já guardado antes (R$)</label>
            <input id="g-initial" className="input" type="number" step="0.01" min="0" placeholder="0,00" value={form.current_amount} onChange={e => set('current_amount', e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-gray-500 -mt-2">
          "Já guardado antes" é o que você tinha separado antes de usar o app. Daí em diante, use o botão Guardar da meta.
        </p>

        <div>
          <label className="label" htmlFor="g-priority">Ordem na lista (1 aparece primeiro)</label>
          <input id="g-priority" className="input" type="number" min={1} max={10} value={form.priority} onChange={e => set('priority', parseInt(e.target.value) || 1)} />
        </div>

        {error && <p className="text-red-400 text-sm" role="alert">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────────
export default function GoalsPage() {
  const { goals, loading, refetch } = useGoals()
  const { accounts } = useAccounts()
  const { user } = useAuth()
  const [modal, setModal] = useState(null)

  async function handleDelete(goal) {
    if (!confirm(`Excluir a meta "${goal.name}"? Os lançamentos ligados a ela continuam, só perdem o vínculo.`)) return
    const { error } = await deleteGoal(goal.id)
    if (error) alert('Falha ao excluir: ' + error.message)
    refetch()
  }

  async function toggleComplete(goal) {
    const { error } = await upsertGoal({ id: goal.id, is_completed: !goal.is_completed })
    if (error) alert('Falha ao atualizar: ' + error.message)
    refetch()
  }

  const active = goals.filter(g => !g.is_completed)
  const completed = goals.filter(g => g.is_completed)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Metas</h1>
        <button onClick={() => setModal({})} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={16}/> Nova meta
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="card h-36 animate-pulse bg-gray-800"/>)}</div>
      ) : active.length === 0 ? (
        <div className="card text-center py-10">
          <Target size={32} className="text-gray-700 mx-auto mb-2"/>
          <p className="text-gray-500 text-sm">Nenhuma meta ativa.</p>
          <button onClick={() => setModal({})} className="text-brand-400 text-sm font-medium mt-2">+ Criar a primeira meta</button>
        </div>
      ) : (
        <GoalCards goals={active} accounts={accounts} userId={user?.id} onChanged={refetch}
          onEdit={setModal} onDelete={handleDelete} onToggleComplete={toggleComplete}/>
      )}

      {completed.length > 0 && (
        <div className="space-y-2">
          <p className="section-title mt-4">Concluídas</p>
          {completed.map(g => (
            <div key={g.id} className="card flex items-center justify-between gap-2 py-3">
              <p className="text-sm text-gray-500 line-through truncate">{g.name}</p>
              <div className="flex items-center flex-shrink-0">
                <button onClick={() => toggleComplete(g)} className="text-sm text-brand-400 px-2 py-1">Reabrir</button>
                <button onClick={() => handleDelete(g)} className="text-gray-600 hover:text-red-400 p-1.5" aria-label={`Excluir ${g.name}`}><Trash2 size={15}/></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal !== null && (
        <GoalModal initial={modal} userId={user?.id} onClose={() => setModal(null)} onSaved={refetch}/>
      )}
    </div>
  )
}
