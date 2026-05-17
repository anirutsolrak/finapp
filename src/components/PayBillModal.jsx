import { useState } from 'react'
import { format } from 'date-fns'
import { X } from 'lucide-react'
import { payBill } from '../lib/db'

const fmt = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Modal de confirmação ao marcar bill como paga.
// Pré-preenche conta (default_account_id ou primeira compatível), valor e data.
export default function PayBillModal({ bill, item, accounts, onClose, onPaid }) {
  const compatibleAccounts = accounts.filter(a => a.is_active !== false && (
    item.payment_source === 'credit'
      ? a.type === 'credit'
      : a.default_payment_source === item.payment_source
  ))
  const defaultAccountId = item.default_account_id
    || (compatibleAccounts.length === 1 ? compatibleAccounts[0].id : '')

  const [accountId, setAccountId] = useState(defaultAccountId)
  const [amount, setAmount] = useState(String(bill.amount))
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    if (!accountId) return setError('Selecione uma conta.')
    setSaving(true)
    const { error: err } = await payBill({
      billId: bill.id, accountId, amount: parseFloat(amount), date,
      paymentSource: item.payment_source, categoryId: item.category_id, budgetItemId: item.id,
    })
    setSaving(false)
    if (err) return setError(err.message || 'Falha ao marcar pago.')
    onPaid(); onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg text-white">Marcar como pago</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800"><X size={18}/></button>
        </div>
        <p className="text-sm text-gray-400">{bill.name} — planejado {fmt(bill.amount)}</p>

        <div>
          <label className="label">Conta</label>
          <select className="input" value={accountId} onChange={e => setAccountId(e.target.value)}>
            <option value="">Selecione...</option>
            {compatibleAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Valor real (R$)</label>
            <input className="input" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}/>
          </div>
          <div>
            <label className="label">Data</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)}/>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={confirm} disabled={saving || !accountId} className="btn-primary flex-1">{saving ? 'Salvando...' : 'Confirmar'}</button>
        </div>
      </div>
    </div>
  )
}
