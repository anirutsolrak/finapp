// ─── GoalCards — cartões de meta com as ações rápidas Guardar e Pagar ────────
// Usado na tela principal (só as ações rápidas) e na tela Metas (passando também
// os handlers de gestão: editar, excluir, concluir).
import { useState } from 'react'
import { PiggyBank, CreditCard, Edit2, Trash2, CheckCircle2 } from 'lucide-react'
import GoalActionModal from './GoalActionModal'
import { fmt } from '../../lib/format'

function GoalCard({ goal, onAction, onEdit, onDelete, onToggleComplete }) {
  const { saved, target, missing, pct } = goal.progress
  return (
    <div className="card flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-white truncate">{goal.name}</p>
          {goal.description && <p className="text-xs text-gray-500 truncate">{goal.description}</p>}
        </div>
        {onEdit && (
          <div className="flex flex-shrink-0">
            <button onClick={() => onToggleComplete(goal)} className="text-gray-600 hover:text-brand-400 p-1.5" aria-label={`Concluir ${goal.name}`} title="Marcar como concluída"><CheckCircle2 size={16}/></button>
            <button onClick={() => onEdit(goal)} className="text-gray-600 hover:text-gray-400 p-1.5" aria-label={`Editar ${goal.name}`}><Edit2 size={15}/></button>
            <button onClick={() => onDelete(goal)} className="text-gray-600 hover:text-red-400 p-1.5" aria-label={`Excluir ${goal.name}`}><Trash2 size={15}/></button>
          </div>
        )}
      </div>

      <div>
        <div className="w-full bg-gray-800 rounded-full h-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`Progresso de ${goal.name}`}>
          <div className="h-2 rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }}/>
        </div>
        <div className="flex items-baseline justify-between gap-2 mt-1.5">
          <p className="text-sm text-gray-400">
            <span className="font-semibold text-white">{fmt(saved)}</span> de {fmt(target)}
          </p>
          <p className="text-sm font-semibold text-brand-400">{pct.toFixed(0)}%</p>
        </div>
        <p className="text-xs text-gray-500">{missing > 0 ? `Faltam ${fmt(missing)}` : 'Valor alcançado'}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 mt-auto">
        <button onClick={() => onAction('save', goal)} className="btn-primary text-sm flex items-center justify-center gap-1.5 py-1.5">
          <PiggyBank size={15}/> Guardar
        </button>
        <button onClick={() => onAction('pay', goal)} className="btn-secondary text-sm flex items-center justify-center gap-1.5 py-1.5">
          <CreditCard size={15}/> Pagar
        </button>
      </div>
    </div>
  )
}

export default function GoalCards({ goals, accounts, userId, onChanged, onEdit, onDelete, onToggleComplete }) {
  const [action, setAction] = useState(null)  // { mode: 'save' | 'pay', goal }
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {goals.map(g => (
          <GoalCard key={g.id} goal={g} onAction={(mode, goal) => setAction({ mode, goal })}
            onEdit={onEdit} onDelete={onDelete} onToggleComplete={onToggleComplete}/>
        ))}
      </div>
      {action && (
        <GoalActionModal mode={action.mode} goal={action.goal} accounts={accounts} userId={userId}
          onClose={() => setAction(null)} onSaved={onChanged}/>
      )}
    </>
  )
}
