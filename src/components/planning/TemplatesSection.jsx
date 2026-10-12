// ─── TemplatesSection — contas recorrentes (templates) ainda sem conta no mês em foco ─
import { useState } from 'react'
import { ChevronUp, ChevronDown, Edit2 } from 'lucide-react'
import { fmt } from '../../lib/format'

// Itens ativos do template que ainda não têm conta no mês em foco.
// Permite "puxar" um item pro mês (cria a bill) — completa o fluxo per-período.
export default function TemplatesSection({ items, onAdd, onEdit }) {
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(null)
  if (items.length === 0) return null

  async function add(item) {
    setAdding(item.id)
    await onAdd(item)
    setAdding(null)
  }

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          {open ? <ChevronUp size={16} className="text-gray-500"/> : <ChevronDown size={16} className="text-gray-500"/>}
          <p className="font-semibold text-gray-400">Contas recorrentes fora deste mês</p>
          <span className="badge bg-gray-800 text-gray-400">{items.length}</span>
        </div>
      </button>
      {open && (
        <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
          {items.map(i => (
            <div key={i.id} className="flex items-center gap-3 p-3 rounded-xl border bg-gray-900 border-gray-800">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-300 truncate">{i.name}</p>
                <p className="text-xs text-gray-600">{fmt(i.planned_amount)} · valor padrão</p>
              </div>
              <button onClick={() => onEdit(i)} className="text-gray-600 hover:text-gray-400 p-1"><Edit2 size={14}/></button>
              <button onClick={() => add(i)} disabled={adding === i.id}
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50">
                {adding === i.id ? '...' : '+ Adicionar a este mês'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
