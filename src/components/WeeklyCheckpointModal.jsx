import { useState, useMemo } from 'react'
import { X, CheckCircle2, AlertTriangle } from 'lucide-react'
import { addCheckpoint } from '../lib/db'
import { healthStatus, isoWeekBounds, computeBucketSnapshot } from '../lib/budgetEngine'
import { subDays } from 'date-fns'

const fmt = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

export default function WeeklyCheckpointModal({ cycle, items, transactions, userId, onClose, onSaved }) {
  const prevWeek = useMemo(() => isoWeekBounds(subDays(new Date(), 7)), [])

  const incomeSnap = useMemo(() => computeBucketSnapshot({ bucket: 'income', cycle, items, transactions }), [cycle, items, transactions])
  const creditSnap = useMemo(() => computeBucketSnapshot({ bucket: 'credit', cycle, items, transactions }), [cycle, items, transactions])

  const [form, setForm] = useState({
    saldo_real_income: '',
    saldo_real_credit: '',
    note: '',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!cycle) return
    setSaving(true)
    const payload = (bucket, saldoReal, previsto) => ({
      user_id: userId,
      cycle_id: cycle.id,
      week_start: prevWeek.week_start,
      week_end: prevWeek.week_end,
      bucket,
      saldo_previsto: previsto,
      saldo_real: parseFloat(saldoReal) || 0,
      status: healthStatus(parseFloat(saldoReal) || 0, previsto),
      note: form.note || null,
    })
    const tasks = []
    if (form.saldo_real_income !== '') tasks.push(addCheckpoint(payload('income', form.saldo_real_income, incomeSnap.saldoDisponivel)))
    if (form.saldo_real_credit !== '') tasks.push(addCheckpoint(payload('credit', form.saldo_real_credit, creditSnap.saldoDisponivel)))
    await Promise.all(tasks)
    onSaved?.()
    onClose()
    setSaving(false)
  }

  const canSave = form.saldo_real_income !== '' || form.saldo_real_credit !== ''

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-bold text-lg text-white">Fechar semana</h2>
            <p className="text-xs text-gray-500 mt-0.5">{prevWeek.week_start} → {prevWeek.week_end}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 p-1"><X size={16}/></button>
        </div>

        <div className="bg-gray-800/60 rounded-xl p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Saldo previsto (Renda)</span>
            <span className="text-emerald-400 font-semibold">{fmt(incomeSnap.saldoDisponivel)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Saldo previsto (Crédito)</span>
            <span className="text-purple-400 font-semibold">{fmt(creditSnap.saldoDisponivel)}</span>
          </div>
        </div>

        <div>
          <label className="label">Saldo real em conta — Renda (R$)</label>
          <input type="number" step="0.01" className="input" placeholder="Deixe vazio se não aplicável"
                 value={form.saldo_real_income} onChange={e => set('saldo_real_income', e.target.value)} />
        </div>

        <div>
          <label className="label">Saldo real em conta — Crédito (R$)</label>
          <input type="number" step="0.01" className="input" placeholder="Deixe vazio se não aplicável"
                 value={form.saldo_real_credit} onChange={e => set('saldo_real_credit', e.target.value)} />
        </div>

        <div>
          <label className="label">Anotação (opcional)</label>
          <textarea rows={2} className="input resize-none" placeholder="O que aconteceu nesta semana..."
                    value={form.note} onChange={e => set('note', e.target.value)} />
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-xs text-amber-200 flex gap-2">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5"/>
          <p>Ao salvar, o sistema compara real × previsto e registra o status da semana. Estouros ajustam a média diária das semanas seguintes.</p>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={saving || !canSave || !cycle} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
            {saving ? 'Salvando...' : <><CheckCircle2 size={14}/> Fechar semana</>}
          </button>
        </div>
      </div>
    </div>
  )
}
