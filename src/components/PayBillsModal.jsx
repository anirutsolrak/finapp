// ═══════════════════════════════════════════════════════════════════════════
// PayBillsModal — pagamento em lote de cartões/empréstimos a partir do saldo
// devedor do grupo de contas. Gera as transações de pagamento.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { X, CreditCard, Repeat } from 'lucide-react'
import { addTransaction } from '../lib/db'

const fmt = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return 'R$ 0,00'
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const GROUP_META = {
  cards: { label: 'Pagar cartões',      Icon: CreditCard, color: '#a855f7' },
  loans: { label: 'Pagar empréstimos',  Icon: Repeat,     color: '#ef4444' },
}

// Modal pra pagar fatura/dívida de um grupo (cards ou loans).
// Cria 1 transfer (bank → conta-alvo) por linha marcada.
export default function PayBillsModal({ group, snapshot, accounts, userId, onClose, onSaved }) {
  const banks = useMemo(
    () => (accounts || []).filter(a => a.is_active !== false && a.type === 'bank'),
    [accounts]
  )

  const [fromAccountId, setFromAccountId] = useState(banks[0]?.id || '')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [targets, setTargets] = useState(() => {
    const initial = {}
    for (const s of (snapshot?.contas || [])) {
      initial[s.account.id] = {
        selected: s.usado > 0,
        amount: s.usado || 0,
      }
    }
    return initial
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!group) return null
  const meta = GROUP_META[group]
  const Icon = meta.Icon

  const totalToPay = Object.values(targets)
    .filter(t => t.selected)
    .reduce((a, t) => a + (Number(t.amount) || 0), 0)

  const updateTarget = (accountId, patch) => {
    setTargets(prev => ({ ...prev, [accountId]: { ...prev[accountId], ...patch } }))
  }

  async function save() {
    setError('')
    if (banks.length === 0) return setError('Cadastre uma conta bancária primeiro.')
    if (!fromAccountId) return setError('Escolha a conta de origem.')
    const selected = Object.entries(targets).filter(([_, v]) => v.selected && Number(v.amount) > 0)
    if (selected.length === 0) return setError('Selecione ao menos uma conta com valor > 0.')

    setSaving(true)
    for (const [toAccountId, { amount }] of selected) {
      const targetAccount = snapshot.contas.find(s => s.account.id === toAccountId)?.account
      const tx = {
        user_id: userId,
        type: 'transfer',
        amount: Number(amount),
        date,
        from_account_id: fromAccountId,
        to_account_id: toAccountId,
        payment_source: 'fixed_income',
        description: `Pagamento — ${targetAccount?.name || 'conta'}`,
        is_paid: true,
      }
      const { error: err } = await addTransaction(tx)
      if (err) {
        setSaving(false)
        return setError(err.message || 'Falha ao salvar pagamento.')
      }
    }
    setSaving(false)
    onSaved?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg text-white flex items-center gap-2">
            <Icon size={18} style={{ color: meta.color }}/>
            {meta.label}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800"
            aria-label="Fechar"
          >
            <X size={18}/>
          </button>
        </div>

        {banks.length === 0 && (
          <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            Cadastre uma conta bancária primeiro pra usar como origem do pagamento.
          </p>
        )}

        {banks.length > 0 && (
          <>
            <div>
              <label className="label">Pagar com</label>
              <select className="input" value={fromAccountId} onChange={e => setFromAccountId(e.target.value)}>
                {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Data do pagamento</label>
              <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
            </div>

            <div>
              <label className="label">Contas a pagar</label>
              {(snapshot?.contas || []).length === 0 ? (
                <p className="text-xs text-gray-500">Nenhuma conta neste grupo.</p>
              ) : (
                <div className="space-y-2">
                  {snapshot.contas.map(s => {
                    const target = targets[s.account.id] || { selected: false, amount: 0 }
                    return (
                      <div key={s.account.id} className="flex items-center gap-2 bg-gray-800/60 rounded-lg p-2">
                        <input
                          type="checkbox"
                          checked={target.selected}
                          onChange={e => updateTarget(s.account.id, { selected: e.target.checked })}
                          className="accent-emerald-500 w-4 h-4 flex-shrink-0"
                        />
                        <span className="text-sm text-white flex-1 truncate">{s.account.name}</span>
                        <input
                          type="number"
                          step="0.01"
                          className="input w-28 text-right"
                          value={target.amount}
                          onChange={e => updateTarget(s.account.id, { amount: e.target.value })}
                          placeholder="0,00"
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-between text-sm border-t border-gray-800 pt-3">
              <span className="text-gray-400">Total a pagar</span>
              <span className="font-bold text-white">{fmt(totalToPay)}</span>
            </div>
          </>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button
            onClick={save}
            disabled={saving || banks.length === 0 || totalToPay <= 0}
            className="btn-primary flex-1"
          >
            {saving ? 'Pagando...' : 'Confirmar pagamento'}
          </button>
        </div>
      </div>
    </div>
  )
}
