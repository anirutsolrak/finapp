// ─── ConfirmPayDialog — confirmação de pagamento em lote do Planejamento ─────
import { AlertCircle } from 'lucide-react'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Dialog que aparece após "Confirmar" do SelectionPopup.
// Pergunta se os items já estão lançados no extrato. 3 CTAs.
export default function ConfirmPayDialog({ items, onAlreadyImported, onPayNow, onCancel, submitting, error }) {
  const total = items.reduce((a, i) => a + Number(i.bill?.amount || 0), 0)
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-lg text-white">Confirmar {items.length} pagamento{items.length > 1 ? 's' : ''}</h2>
        <p className="text-sm text-gray-300">
          Total: <span className="font-bold text-white">{fmt(total)}</span>
        </p>
        <p className="text-sm text-gray-400">
          Esses lançamentos já estão no extrato do banco (importados via CSV)?
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex gap-2">
            <AlertCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5"/>
            <p className="text-xs text-red-300 whitespace-pre-line">{error}</p>
          </div>
        )}

        <div className="space-y-2 pt-1">
          <button onClick={onAlreadyImported} disabled={submitting}
            className="w-full btn-primary text-sm disabled:opacity-50">
            ✓ Sim — só marcar como pago
          </button>
          <button onClick={onPayNow} disabled={submitting}
            className="w-full btn-secondary text-sm disabled:opacity-50">
            ✗ Não — lançar despesa agora
          </button>
          <button onClick={onCancel} disabled={submitting}
            className="w-full btn-ghost text-sm disabled:opacity-50">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
