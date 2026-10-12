// ─── DateRangeSelector — dropdown do período/ciclo global (presets + custom) ─
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Calendar, Check } from 'lucide-react'
import { useDateRange } from '../contexts/DateRangeContext'

const PRESETS = [
  { key: 'cycle',      label: 'Ciclo atual' },
  { key: 'this_month', label: 'Mês atual' },
  { key: 'last_month', label: 'Mês passado' },
  { key: 'last_30d',   label: 'Últimos 30 dias' },
  { key: 'last_90d',   label: 'Últimos 90 dias' },
]

export default function DateRangeSelector() {
  const { range, setRange } = useDateRange()
  const [open, setOpen] = useState(false)
  const [customMode, setCustomMode] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (!ref.current?.contains(e.target)) {
        setOpen(false)
        setCustomMode(false)
      }
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  if (!range) return null

  function selectPreset(key) {
    setRange({ preset: key })
    setOpen(false)
    setCustomMode(false)
  }

  function applyCustom() {
    if (!customStart || !customEnd) return
    if (customStart > customEnd) return
    setRange({
      preset: 'custom',
      startDate: customStart,
      endDate: customEnd,
      label: `${customStart} → ${customEnd}`,
    })
    setOpen(false)
    setCustomMode(false)
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-200 hover:bg-gray-700 transition-colors"
        aria-label="Selecionar período"
      >
        <Calendar size={13}/>
        <span className="truncate max-w-[180px]">{range.label}</span>
        <ChevronDown size={12} className={open ? 'rotate-180 transition-transform' : 'transition-transform'}/>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-gray-900 border border-gray-800 rounded-xl shadow-lg z-50 overflow-hidden">
          {!customMode && (
            <div className="py-1">
              {PRESETS.map(p => (
                <button
                  key={p.key}
                  onClick={() => selectPreset(p.key)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-200 hover:bg-gray-800"
                >
                  <span>{p.label}</span>
                  {range.preset === p.key && <Check size={12} className="text-emerald-400"/>}
                </button>
              ))}
              <div className="border-t border-gray-800 mt-1"/>
              <button
                onClick={() => {
                  setCustomMode(true)
                  setCustomStart(range.startDate)
                  setCustomEnd(range.endDate)
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-200 hover:bg-gray-800"
              >
                <span>Personalizado…</span>
                {range.preset === 'custom' && <Check size={12} className="text-emerald-400"/>}
              </button>
            </div>
          )}

          {customMode && (
            <div className="p-3 space-y-2">
              <label className="block">
                <span className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">De</span>
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-gray-200"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">Até</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-gray-200"
                />
              </label>
              {customStart && customEnd && customStart > customEnd && (
                <p className="text-[10px] text-red-400">Data inicial deve ser menor ou igual à final.</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setCustomMode(false)}
                  className="flex-1 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200"
                >
                  Voltar
                </button>
                <button
                  onClick={applyCustom}
                  disabled={!customStart || !customEnd || customStart > customEnd}
                  className="flex-1 px-3 py-1.5 text-xs bg-emerald-600 text-onaccent rounded hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
                >
                  Aplicar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
