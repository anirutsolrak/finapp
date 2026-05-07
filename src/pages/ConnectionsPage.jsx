// src/pages/ConnectionsPage.jsx
import { useState } from 'react'
import { Plus, RefreshCw, Trash2, Link2 } from 'lucide-react'
import { useConnections, useAccounts } from '../hooks/usePluggy'
import { pluggySync, pluggyDeleteItem, pluggyConnectToken, pluggyCreateItem } from '../lib/pluggyClient'
import { updateAccount } from '../lib/db'
import { PluggyConnect } from 'pluggy-connect-sdk'

const STATUS_BADGE = {
  UPDATED: 'badge bg-emerald-500/15 text-emerald-300',
  OUTDATED: 'badge bg-amber-500/15 text-amber-300',
  LOGIN_IN_PROGRESS: 'badge bg-blue-500/15 text-blue-300',
  WAITING_USER_INPUT: 'badge bg-amber-500/15 text-amber-300',
  ERROR: 'badge bg-red-500/15 text-red-300',
}

export default function ConnectionsPage() {
  const { items, refetch } = useConnections()
  const { accounts, refetch: refetchAccounts } = useAccounts()
  const [syncing, setSyncing] = useState(null)
  const [error, setError] = useState('')

  async function handleSync(id) {
    setSyncing(id); setError('')
    try {
      const r = await pluggySync(id)
      alert(`Sincronizado: ${r.inserted} novas · ${r.pending} pendentes · ${r.skipped} duplicadas`)
      refetch(); refetchAccounts()
    } catch (e) {
      setError(e.message)
    } finally {
      setSyncing(null)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Desconectar essa conexão? As tx ficam, mas novas sync param.')) return
    try {
      await pluggyDeleteItem(id)
      refetch(); refetchAccounts()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleNew() {
    try {
      const { accessToken } = await pluggyConnectToken()
      const widget = new PluggyConnect({
        connectToken: accessToken,
        includeSandbox: false,
        onSuccess: async ({ item }) => {
          try {
            await pluggyCreateItem(item.id)
            refetch(); refetchAccounts()
          } catch (e) {
            setError(e.message)
          }
        },
        onError: (err) => setError(err.message || 'Erro no widget'),
      })
      widget.init()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Conexões</h1>
          <p className="text-xs text-gray-500 mt-0.5">{items.length} ativa(s)</p>
        </div>
        <button onClick={handleNew} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={16}/> Nova conexão
        </button>
      </div>

      {error && <div className="card bg-red-500/10 border-red-500/30 text-red-400 text-sm">{error}</div>}

      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link2 size={18} className="text-emerald-400"/>
                <div>
                  <p className="text-sm font-semibold text-white">{item.connector_name}</p>
                  <p className="text-xs text-gray-500">
                    Última sync: {item.last_sync_at ? new Date(item.last_sync_at).toLocaleString('pt-BR') : 'nunca'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={STATUS_BADGE[item.status] || 'badge bg-gray-700 text-gray-400'}>{item.status}</span>
                <button onClick={() => handleSync(item.id)} disabled={syncing === item.id} className="btn-ghost text-xs flex items-center gap-1">
                  <RefreshCw size={12} className={syncing === item.id ? 'animate-spin' : ''}/> Sincronizar
                </button>
                <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-300 p-1">
                  <Trash2 size={14}/>
                </button>
              </div>
            </div>
            <div className="border-t border-gray-800 pt-2 space-y-2">
              <p className="text-xs text-gray-500">Contas:</p>
              {(item.accounts || []).map(acc => {
                const local = accounts.find(a => a.id === acc.id) || acc
                return (
                  <div key={acc.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-300">{acc.name} · {acc.type}</span>
                    <select
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
                      value={local.payment_source}
                      onChange={async (e) => {
                        await updateAccount(acc.id, { payment_source: e.target.value })
                        refetchAccounts()
                      }}
                    >
                      <option value="fixed_income">Renda Fixa</option>
                      <option value="variable_income">Renda Variável</option>
                      <option value="credit">Crédito</option>
                    </select>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="card text-center py-10">
            <p className="text-gray-500 text-sm">Nenhuma conexão ainda.</p>
            <p className="text-xs text-gray-600 mt-1">Clique em "+ Nova conexão" pra autorizar seu primeiro banco.</p>
          </div>
        )}
      </div>
    </div>
  )
}
