// ─── TransactionList — lançamentos do mês em foco, com filtro por tipo e conta ─
import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { Edit2, Trash2 } from 'lucide-react'
import { TX_TYPE_LABELS } from '../lib/budgetEngine'
import { fmt } from '../lib/format'

const AMOUNT_TONE = { income: 'text-emerald-400', expense: 'text-red-400', investment: 'text-purple-400', transfer: 'text-blue-400' }
const chip = (on) => `px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${on ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-gray-700 text-gray-400'}`

function Row({ tx, accountName, onEdit, onDelete }) {
  const where = tx.type === 'transfer'
    ? `${accountName(tx.from_account_id) || '?'} → ${accountName(tx.to_account_id) || '?'}`
    : accountName(tx.account_id)
  return (
    <div className="card flex items-center gap-3 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{tx.description}</p>
        <p className="text-xs text-gray-500 truncate">
          {format(parseISO(tx.date), 'dd/MM')} · {TX_TYPE_LABELS[tx.type]}
          {where && ` · ${where}`}
          {tx.categories && ` · ${tx.categories.icon || ''} ${tx.categories.name}`}
        </p>
        {(tx.bill_id || !tx.is_paid) && (
          <div className="flex gap-1.5 mt-1">
            {tx.bill_id && <span className="badge bg-emerald-500/15 text-emerald-400">Conta do plano</span>}
            {!tx.is_paid && <span className="badge bg-amber-500/20 text-amber-400">Pendente</span>}
          </div>
        )}
      </div>
      <p className={`text-sm font-bold flex-shrink-0 ${AMOUNT_TONE[tx.type] || 'text-white'}`}>
        {tx.type === 'income' ? '+' : '−'}{fmt(tx.amount)}
      </p>
      <div className="flex flex-shrink-0">
        <button onClick={() => onEdit(tx)} className="text-gray-600 hover:text-gray-400 p-2" aria-label={`Editar ${tx.description}`}><Edit2 size={15}/></button>
        <button onClick={() => onDelete(tx)} className="text-gray-600 hover:text-red-400 p-2" aria-label={`Excluir ${tx.description}`}><Trash2 size={15}/></button>
      </div>
    </div>
  )
}

export default function TransactionList({ transactions, accounts, loading, onEdit, onDelete }) {
  const [type, setType] = useState('all')
  const [accountId, setAccountId] = useState('all')

  const accountName = (id) => accounts.find(a => a.id === id)?.name
  const shown = transactions
    .filter(t => type === 'all' || t.type === type)
    .filter(t => accountId === 'all' || [t.account_id, t.from_account_id, t.to_account_id].includes(accountId))

  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap items-center">
        {['all', ...Object.keys(TX_TYPE_LABELS)].map(t => (
          <button key={t} onClick={() => setType(t)} className={chip(type === t)}>
            {t === 'all' ? 'Todos' : TX_TYPE_LABELS[t]}
          </button>
        ))}
        {accounts.length > 1 && (
          <select aria-label="Filtrar por conta" className="input w-auto py-1.5 text-xs" value={accountId} onChange={e => setAccountId(e.target.value)}>
            <option value="all">Todas as contas</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="card h-16 animate-pulse bg-gray-800"/>)}</div>
      ) : shown.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-gray-500 text-sm">
            {transactions.length === 0 ? 'Nenhum lançamento neste mês. Pague uma conta do plano ou importe o extrato.' : 'Nenhum lançamento com esse filtro.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map(tx => <Row key={tx.id} tx={tx} accountName={accountName} onEdit={onEdit} onDelete={onDelete}/>)}
        </div>
      )}
    </div>
  )
}
