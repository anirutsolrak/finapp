// ─── TxModal — cria/edita um lançamento (despesa, receita, investimento, transferência) ─
import { useState } from 'react'
import { format } from 'date-fns'
import { addTransaction, updateTransaction } from '../lib/db'
import { PAYMENT_SOURCE_LABELS, PAYMENT_SOURCE_ORDER, TX_TYPE_LABELS } from '../lib/budgetEngine'

const CATEGORY_TYPE_LABELS = {
  income: 'Receita',
  essential: 'Essencial',
  variable: 'Variável',
  installment: 'Parcela',
  investment: 'Investimento',
  reserve: 'Reserva',
}
const EMPTY = { description: '', amount: '', type: 'expense', date: format(new Date(), 'yyyy-MM-dd'), category_id: '', notes: '', is_paid: true, payment_source: 'fixed_income', goal_id: '', account_id: '', from_account_id: '', to_account_id: '' }

export default function TxModal({ onClose, onSaved, initial, categories, userId, goals = [], accounts = [] }) {
  const [form, setForm] = useState({ ...EMPTY, ...initial })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!form.description || !form.amount) return setError('Preencha descrição e valor.')
    if (!form.payment_source) return setError('Selecione a fonte de pagamento.')
    if (form.type !== 'transfer' && !form.account_id) return setError('Selecione a conta.')
    if (form.type === 'transfer') {
      if (!form.from_account_id || !form.to_account_id) return setError('Selecione a conta de origem e destino.')
      if (form.from_account_id === form.to_account_id) return setError('Origem e destino devem ser diferentes.')
    }
    setSaving(true)
    const payload = {
      ...form,
      amount: parseFloat(form.amount),
      user_id: userId,
      category_id: form.category_id || null,
      goal_id: form.goal_id || null,
      account_id: form.account_id || null,
      from_account_id: form.from_account_id || null,
      to_account_id: form.to_account_id || null,
    }
    const { error: err } = form.id ? await updateTransaction(form.id, payload) : await addTransaction(payload)
    if (err) setError(err.message)
    else { onSaved(); onClose() }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="font-bold text-lg text-white">{form.id ? 'Editar' : 'Novo'} Lançamento</h2>

        <div>
          <label className="label">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(TX_TYPE_LABELS).map(([k, v]) => (
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
          <select className="input" value={form.category_id} onChange={e => set('category_id', e.target.value)}>
            <option value="">Selecionar...</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                [{CATEGORY_TYPE_LABELS[c.type] || '—'}] {c.icon} {c.name}
              </option>
            ))}
          </select>
        </div>

        {form.type !== 'transfer' && (
          <div>
            <label className="label">Conta *</label>
            <select className="input" value={form.account_id || ''} onChange={e => {
              const acc = accounts.find(a => a.id === e.target.value)
              set('account_id', e.target.value)
              // Auto-preenche payment_source com o default da conta
              if (acc?.default_payment_source) set('payment_source', acc.default_payment_source)
            }}>
              <option value="">Selecionar...</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {accounts.length === 0 && (
              <p className="text-xs text-amber-400 mt-1">
                Cadastre uma conta em Configurações → Contas antes de lançar.
              </p>
            )}
          </div>
        )}

        {form.type === 'transfer' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">De *</label>
              <select className="input" value={form.from_account_id || ''} onChange={e => set('from_account_id', e.target.value)}>
                <option value="">Selecionar...</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id} disabled={a.id === form.to_account_id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Para *</label>
              <select className="input" value={form.to_account_id || ''} onChange={e => set('to_account_id', e.target.value)}>
                <option value="">Selecionar...</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id} disabled={a.id === form.from_account_id}>{a.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div>
          <label className="label">Fonte de pagamento *</label>
          <select className="input" value={form.payment_source} onChange={e => set('payment_source', e.target.value)}>
            {PAYMENT_SOURCE_ORDER.map(s => (
              <option key={s} value={s}>{PAYMENT_SOURCE_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Vincular à meta (opcional)</label>
          <select className="input" value={form.goal_id || ''} onChange={e => set('goal_id', e.target.value)}>
            <option value="">— Nenhuma —</option>
            {goals.filter(g => !g.is_completed).map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          {form.goal_id && form.type !== 'transfer' && form.type !== 'expense' && (
            <p className="text-xs text-amber-400 mt-1">
              Só transferências (somam) e despesas (subtraem) afetam o saldo da meta.
            </p>
          )}
        </div>

        <div>
          <label className="label">Notas (opcional)</label>
          <textarea className="input resize-none" rows={2} placeholder="Observações..." value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
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
