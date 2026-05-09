import { useState } from 'react'
import { CheckCircle2, X, Inbox as InboxIcon } from 'lucide-react'
import { usePendingTransactions } from '../hooks/usePluggy'
import { approveTransaction, ignoreTransaction } from '../lib/db'
import { PAYMENT_SOURCE_LABELS } from '../lib/budgetEngine'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const TYPE_LABEL = { income: 'Receita', expense: 'Despesa', transfer: 'Transferência', investment: 'Investimento' }

export default function InboxPage() {
  const { pending, refetch } = usePendingTransactions()
  const [working, setWorking] = useState(null)

  async function handleApprove(tx, patch = {}) {
    setWorking(tx.id)
    await approveTransaction(tx.id, patch)
    refetch()
    setWorking(null)
  }

  async function handleIgnore(tx) {
    if (!confirm('Descartar essa transação? Ela não vai entrar nos KPIs.')) return
    setWorking(tx.id)
    await ignoreTransaction(tx.id)
    refetch()
    setWorking(null)
  }

  async function handleApproveAll() {
    if (!confirm(`Aprovar todas as ${pending.length} pendentes?`)) return
    for (const tx of pending) await approveTransaction(tx.id)
    refetch()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2"><InboxIcon size={20}/> Inbox</h1>
          <p className="text-xs text-gray-500 mt-0.5">{pending.length} pendente(s) pra revisar</p>
        </div>
        {pending.length > 0 && (
          <button onClick={handleApproveAll} className="btn-primary text-sm flex items-center gap-1.5">
            <CheckCircle2 size={14}/> Aprovar todas
          </button>
        )}
      </div>

      {pending.length === 0 && (
        <div className="card text-center py-10">
          <p className="text-emerald-400 text-sm">Tudo classificado ✓</p>
        </div>
      )}

      <div className="space-y-2">
        {pending.map(tx => (
          <div key={tx.id} className="card space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{tx.description || tx.raw_payload?.descriptionRaw}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-gray-500">{tx.date}</span>
                  <span className="text-xs text-gray-500">· {tx.accounts?.name}</span>
                  <span className="badge bg-gray-700 text-gray-400 text-[10px]">{TYPE_LABEL[tx.type]}</span>
                  <span className="badge bg-gray-700 text-gray-400 text-[10px]">{PAYMENT_SOURCE_LABELS[tx.payment_source]}</span>
                </div>
              </div>
              <p className={`text-sm font-bold ${tx.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
              </p>
            </div>
            <div className="flex gap-2 pt-1 border-t border-gray-800">
              <button onClick={() => handleApprove(tx)} disabled={working === tx.id} className="btn-primary text-xs flex-1 flex items-center justify-center gap-1">
                <CheckCircle2 size={12}/> Aprovar
              </button>
              <button onClick={() => handleIgnore(tx)} disabled={working === tx.id} className="btn-ghost text-xs flex-1 flex items-center justify-center gap-1">
                <X size={12}/> Descartar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
