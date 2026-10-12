// ─── GoalActionModal — ação rápida de uma meta: guardar dinheiro ou pagar ────
import { useState } from 'react'
import { format } from 'date-fns'
import { addTransaction, upsertGoal } from '../../lib/db'
import { goalTx } from '../../lib/goals'
import { fmt } from '../../lib/format'

export default function GoalActionModal({ mode, goal, accounts, userId, onClose, onSaved }) {
  const isPay = mode === 'pay'
  const [form, setForm] = useState({
    amount: isPay ? String(goal.progress.target || '') : '',
    date: format(new Date(), 'yyyy-MM-dd'),
    account_id: accounts.find(a => a.type === 'bank')?.id || '',
    move: false, from_account_id: '', to_account_id: '',
    complete: true,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    const { payload, error: invalid } = goalTx({ mode, goal, form, userId, accounts })
    if (invalid) return setError(invalid)
    setSaving(true); setError('')
    let { error: err } = await addTransaction(payload)
    if (!err && isPay && form.complete) ({ error: err } = await upsertGoal({ id: goal.id, is_completed: true }))
    setSaving(false)
    if (err) return setError(err.message || 'Falha ao salvar.')
    onSaved(); onClose()
  }

  const accountOptions = accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" aria-label={`${isPay ? 'Pagar' : 'Guardar para'} ${goal.name}`}
        className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-sm p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div>
          <h2 className="font-bold text-lg text-white">{isPay ? 'Pagar' : 'Guardar para'} {goal.name}</h2>
          <p className="text-sm text-gray-400">
            {fmt(goal.progress.saved)} guardados de {fmt(goal.progress.target)}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="goal-amount">Valor (R$)</label>
            <input id="goal-amount" className="input" type="number" step="0.01" min="0" placeholder="0,00" autoFocus
              value={form.amount} onChange={e => set('amount', e.target.value)}/>
          </div>
          <div>
            <label className="label" htmlFor="goal-date">Data</label>
            <input id="goal-date" className="input" type="date" value={form.date} onChange={e => set('date', e.target.value)}/>
          </div>
        </div>

        {isPay ? (
          <>
            <div>
              <label className="label" htmlFor="goal-account">Sai de qual conta</label>
              <select id="goal-account" className="input" value={form.account_id} onChange={e => set('account_id', e.target.value)}>
                <option value="">Selecionar...</option>
                {accountOptions}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={form.complete} onChange={e => set('complete', e.target.checked)} className="accent-brand-500 w-4 h-4"/>
              Concluir a meta
            </label>
            <p className="text-xs text-gray-500">Cria uma despesa com o nome da meta nos lançamentos.</p>
          </>
        ) : (
          <>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={form.move} onChange={e => set('move', e.target.checked)} className="accent-brand-500 w-4 h-4"/>
              Também mover o dinheiro entre contas
            </label>
            {form.move ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="goal-from">De</label>
                  <select id="goal-from" className="input" value={form.from_account_id} onChange={e => set('from_account_id', e.target.value)}>
                    <option value="">Selecionar...</option>
                    {accountOptions}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="goal-to">Para</label>
                  <select id="goal-to" className="input" value={form.to_account_id} onChange={e => set('to_account_id', e.target.value)}>
                    <option value="">Selecionar...</option>
                    {accountOptions}
                  </select>
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500">Só registra a reserva: o saldo das contas não muda.</p>
            )}
          </>
        )}

        {error && <p className="text-red-400 text-sm" role="alert">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Salvando...' : isPay ? 'Pagar' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
