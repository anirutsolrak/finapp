import { useState, useMemo } from 'react'
import { Plus, Trash2, Edit2, Target, Lock, CheckCircle2, Sparkles } from 'lucide-react'
import { useGoals, useBudgetItems } from '../hooks/useData'
import { upsertGoal, deleteGoal } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import {
  AGGRESSIVENESS_LABELS,
  AGGRESSIVENESS_ORDER,
  AGGRESSIVENESS_PCT,
  computeFreeBalance,
  computeGoalPlan,
} from '../lib/goalPlanner'

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

const fmtBRL = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

function GoalModal({ initial, onClose, onSaved, userId, freeBalance }) {
  const [form, setForm] = useState(() => {
    if (initial?.id) return { ...EMPTY, ...initial, aggressiveness: initial.aggressiveness || 'medium' }
    return EMPTY
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const plan = useMemo(() => {
    const target = parseFloat(form.target_amount)
    if (!target || target <= 0) return null
    return computeGoalPlan({
      targetAmount: target,
      currentAmount: parseFloat(form.current_amount) || 0,
      aggressiveness: form.aggressiveness,
      freeBalance,
    })
  }, [form.target_amount, form.current_amount, form.aggressiveness, freeBalance])

  async function save() {
    if (!form.name || !form.target_amount || !plan) return
    setSaving(true)
    const payload = {
      ...form,
      target_amount: parseFloat(form.target_amount),
      current_amount: parseFloat(form.current_amount) || 0,
      monthly_contribution: plan.monthly_contribution,
      target_date: plan.target_date,
      total_months: plan.total_months,
      months_completed: form.id ? (form.months_completed ?? 0) : 0,
      ai_computed_at: new Date().toISOString(),
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
            <label className="label">Já guardado (R$)</label>
            <input className="input" type="number" step="0.01" placeholder="0,00" value={form.current_amount} onChange={e => set('current_amount', e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label flex items-center gap-1"><Sparkles size={11} className="text-emerald-400"/> Ritmo de agressividade</label>
          <select className="input" value={form.aggressiveness} onChange={e => set('aggressiveness', e.target.value)}>
            {AGGRESSIVENESS_ORDER.map(k => (
              <option key={k} value={k}>{AGGRESSIVENESS_LABELS[k]}</option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Saldo livre disponível (receita − fixos): <span className="text-emerald-400 font-medium">{fmtBRL(freeBalance)}</span>
          </p>
        </div>

        {plan && plan.total_months > 0 && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 space-y-1">
            <p className="text-sm text-emerald-300 font-medium flex items-center gap-1">
              <Sparkles size={12}/> Plano calculado pela IA
            </p>
            <p className="text-xs text-gray-300">
              Alocando <span className="font-semibold text-white">{(AGGRESSIVENESS_PCT[form.aggressiveness] * 100).toFixed(0)}%</span> do saldo livre você contribui{' '}
              <span className="font-semibold text-emerald-400">{fmtBRL(plan.monthly_contribution)}/mês</span>{' '}
              por <span className="font-semibold text-white">{plan.total_months} mês(es)</span>.
            </p>
            <p className="text-xs text-gray-500">Previsão de conclusão: <span className="text-gray-300">{plan.target_date}</span></p>
          </div>
        )}

        {plan && plan.total_months === 0 && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
            <p className="text-xs text-emerald-300">✓ Meta já atingida! Você já possui o valor-alvo.</p>
          </div>
        )}

        {freeBalance <= 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
            <p className="text-xs text-amber-300">⚠ Saldo livre indisponível. Cadastre itens de receita e gastos fixos no Planejamento para ativar o cálculo automático.</p>
          </div>
        )}

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
          <button onClick={save} disabled={saving || !plan} className="btn-primary flex-1">{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

function GoalDots({ goal, onMark }) {
  const total = Number(goal.total_months) || 0
  const done = Number(goal.months_completed) || 0
  if (total <= 0) return null

  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {Array.from({ length: total }).map((_, i) => {
        const isDone = i < done
        const isNext = i === done
        const disabled = !isDone && !isNext
        return (
          <button
            key={i}
            disabled={disabled}
            onClick={() => onMark(goal, i)}
            title={isDone ? `Mês ${i + 1} marcado — clique para desfazer` : isNext ? `Marcar mês ${i + 1}` : `Mês ${i + 1} ainda bloqueado`}
            className={`w-3.5 h-3.5 rounded-full transition-all ${
              isDone
                ? 'bg-emerald-500 hover:bg-emerald-400'
                : isNext
                ? 'bg-gray-600 ring-2 ring-emerald-500/40 animate-pulse hover:bg-gray-500'
                : 'bg-gray-800 opacity-40 cursor-not-allowed'
            }`}
          />
        )
      })}
    </div>
  )
}

export default function GoalsPage() {
  const { goals, loading, refetch } = useGoals()
  const { items: budgetItems } = useBudgetItems()
  const { user } = useAuth()
  const [modal, setModal] = useState(null)

  const freeBalance = useMemo(() => computeFreeBalance(budgetItems), [budgetItems])

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

  async function markDot(goal, index) {
    const done = Number(goal.months_completed) || 0
    const monthly = Number(goal.monthly_contribution) || 0
    const target = Number(goal.target_amount) || 0
    const current = Number(goal.current_amount) || 0

    if (index === done) {
      const newDone = done + 1
      const newCurrent = Math.min(current + monthly, target)
      const total = Number(goal.total_months) || 0
      await upsertGoal({
        ...goal,
        months_completed: newDone,
        current_amount: newCurrent,
        is_completed: newDone >= total || newCurrent >= target,
      })
      refetch()
    } else if (index === done - 1) {
      const newDone = done - 1
      const newCurrent = Math.max(current - monthly, 0)
      await upsertGoal({
        ...goal,
        months_completed: newDone,
        current_amount: newCurrent,
        is_completed: false,
      })
      refetch()
    }
  }

  const active = goals.filter(g => !g.is_completed)
  const completed = goals.filter(g => g.is_completed)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Metas Financeiras</h1>
          <p className="text-xs text-gray-500 mt-0.5">Saldo livre: <span className="text-emerald-400 font-medium">{fmtBRL(freeBalance)}</span></p>
        </div>
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
            const pct = Math.min((Number(g.current_amount) / Number(g.target_amount)) * 100, 100)
            const total = Number(g.total_months) || 0
            const done = Number(g.months_completed) || 0
            const remainingMonths = Math.max(total - done, 0)
            const tagLabel = g.aggressiveness ? AGGRESSIVENESS_LABELS[g.aggressiveness] : null
            return (
              <div key={g.id} className="card animate-in">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-white">{g.name}</p>
                      {g.is_fixed && <Lock size={12} className="text-amber-400"/>}
                      <span className="badge bg-gray-700 text-gray-400 text-xs">P{g.priority}</span>
                      {tagLabel && <span className="badge bg-emerald-500/15 text-emerald-300 text-xs">{tagLabel}</span>}
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
                  <span>{fmtBRL(g.current_amount)}</span>
                  <span className="font-medium text-white">{pct.toFixed(0)}%</span>
                  <span>{fmtBRL(g.target_amount)}</span>
                </div>

                <GoalDots goal={g} onMark={markDot}/>

                {(g.monthly_contribution > 0 || g.target_date || total > 0) && (
                  <div className="mt-3 pt-3 border-t border-gray-800 flex flex-wrap gap-3 text-xs text-gray-500">
                    {g.monthly_contribution > 0 && <span>💰 {fmtBRL(g.monthly_contribution)}/mês</span>}
                    {total > 0 && <span>📅 {done}/{total} meses {remainingMonths > 0 ? `(faltam ${remainingMonths})` : '(completo)'}</span>}
                    {g.target_date && <span>🎯 Até {g.target_date}</span>}
                  </div>
                )}
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
          freeBalance={freeBalance}
          onClose={() => setModal(null)}
          onSaved={refetch}
        />
      )}
    </div>
  )
}
