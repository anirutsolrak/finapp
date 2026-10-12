// ─── SelectionPopup — barra fixa de ação da seleção em massa (count + CTAs) ──
import { X, Check } from 'lucide-react'
import { fmt } from '../../lib/format'

// Popup fixo no rodapé com count, total e CTAs Limpar/Confirmar.
// Desktop: centralizado, margem do rodapé. Mobile: full-width, encostado (substitui nav, ver SelectionContext).
export default function SelectionPopup({ count, total, onClear, onConfirm, disabled = false }) {
  if (count === 0) return null
  return (
    <div className="fixed z-40 left-0 right-0 bottom-0 px-4 pb-[env(safe-area-inset-bottom)]
                    md:left-1/2 md:right-auto md:bottom-4 md:-translate-x-1/2 md:pb-0">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 shadow-lg
                      flex items-center justify-between gap-3 md:max-w-md md:mx-auto">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">{count} selecionado{count > 1 ? 's' : ''}</p>
          <p className="text-xs text-gray-400">{fmt(total)}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={onClear} disabled={disabled}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white flex items-center gap-1">
            <X size={14}/> Limpar
          </button>
          <button onClick={onConfirm} disabled={disabled}
            className="btn-primary text-sm flex items-center gap-1.5 disabled:opacity-50">
            <Check size={14}/> Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}
