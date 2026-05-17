import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import PlanItemRow from './PlanItemRow'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function BucketSection({ label, items, selected, onToggleSelect, onUnpay, onEdit, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  const planned = items.reduce((a, i) => a + Number(i.planned_amount || 0), 0)
  if (items.length === 0) return null
  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          {open ? <ChevronUp size={16} className="text-gray-500"/> : <ChevronDown size={16} className="text-gray-500"/>}
          <p className="font-semibold text-white">{label}</p>
          <span className="badge bg-gray-800 text-gray-400">{items.length}</span>
        </div>
        <p className="text-sm font-bold text-white">{fmt(planned)} planejado</p>
      </button>
      {open && (
        <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
          {items.map(i => (
            <PlanItemRow key={i.id} item={i}
              isSelected={selected.has(i.bill?.id)}
              onToggleSelect={onToggleSelect}
              onUnpay={onUnpay}
              onEdit={onEdit}/>
          ))}
        </div>
      )}
    </div>
  )
}
