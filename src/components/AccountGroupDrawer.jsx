// ─── AccountGroupDrawer — detalhe das contas de um grupo (banco/cartão/etc) ──
import { X, Wallet, CreditCard, Repeat, Mail } from 'lucide-react'

const fmt = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return 'R$ 0,00'
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const GROUP_META = {
  banks:    { label: 'Bancos',           Icon: Wallet,     color: '#10b981' },
  cards:    { label: 'Cartões',          Icon: CreditCard, color: '#a855f7' },
  loans:    { label: 'Empréstimos',      Icon: Repeat,     color: '#ef4444' },
  envelope: { label: 'Envelope',         Icon: Mail,       color: '#f97316' },
}

// Drawer lateral direita listando as contas de um grupo (banks/cards/loans/envelope).
// Mostra saldo individual + breakdown de entradas/saídas (bank/envelope) OU usado/limite (credit).
export default function AccountGroupDrawer({ group, snapshot, onClose }) {
  if (!group || !snapshot) return null
  const meta = GROUP_META[group]
  const Icon = meta.Icon

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex animate-in md:items-center md:justify-center md:p-4"
      onClick={onClose}
    >
      <div
        className="ml-auto h-full w-[88%] max-w-sm bg-gray-900 border-l border-gray-800 rounded-l-2xl p-4 overflow-y-auto animate-slide-right
                   md:ml-0 md:mr-0 md:h-auto md:max-h-[85vh] md:w-full md:max-w-md md:rounded-2xl md:border md:animate-in"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-bold text-white flex items-center gap-2">
            <Icon size={14} style={{ color: meta.color }} />
            {meta.label}
          </p>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800"
            aria-label="Fechar"
          >
            <X size={18}/>
          </button>
        </div>

        {snapshot.contas.length === 0 && (
          <p className="text-sm text-gray-500 py-4 text-center">Nenhuma conta neste grupo.</p>
        )}

        <div className="space-y-3">
          {snapshot.contas.map(s => (
            <AccountRow key={s.account.id} snapshot={s} group={group} />
          ))}
        </div>

        {snapshot.contas.length > 1 && (
          <div className="border-t border-gray-800 mt-4 pt-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-300">
              <span>Total</span>
              <span className="font-bold text-white">{fmt(snapshot.saldoTotal)}</span>
            </div>
            {group === 'cards' && snapshot.limiteTotal > 0 && (
              <div className="flex justify-between text-xs text-gray-500">
                <span>Limite agregado</span>
                <span>{fmt(snapshot.limiteTotal)} ({snapshot.pctComprometidoTotal?.toFixed(0) ?? 0}%)</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function AccountRow({ snapshot, group }) {
  const { account, saldoAtual, entradas, saidas, usado, limite, pctComprometido } = snapshot
  const isCredit = group === 'cards' || group === 'loans'

  return (
    <div className="rounded-xl bg-gray-800/60 p-3">
      <div className="flex justify-between items-start mb-2">
        <p className="text-sm font-medium text-white truncate pr-2">{account.name}</p>
        <p className="text-sm font-bold text-white flex-shrink-0">{fmt(saldoAtual)}</p>
      </div>

      {!isCredit && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-gray-500">Entradas</p>
            <p className="text-emerald-400 font-semibold">{fmt(entradas)}</p>
          </div>
          <div>
            <p className="text-gray-500">Saídas</p>
            <p className="text-red-400 font-semibold">{fmt(saidas)}</p>
          </div>
        </div>
      )}

      {isCredit && (
        <div className="space-y-1.5">
          {limite > 0 ? (
            <>
              <div className="w-full bg-gray-900 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-1.5 transition-all"
                  style={{
                    width: `${Math.min(pctComprometido || 0, 100)}%`,
                    background: (pctComprometido || 0) > 90 ? '#ef4444' : (pctComprometido || 0) > 70 ? '#f59e0b' : '#10b981',
                  }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Usado: {fmt(usado)}</span>
                <span>Limite: {fmt(limite)} ({pctComprometido?.toFixed(0) ?? 0}%)</span>
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-500">Sem limite definido — dívida do ciclo: {fmt(usado)}</p>
          )}
        </div>
      )}
    </div>
  )
}
