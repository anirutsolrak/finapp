import { differenceInDays, parseISO, format } from 'date-fns'
import { CheckCircle2, Circle, Edit2, Lock } from 'lucide-react'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function statusLabel(bill) {
  if (!bill) return { label: '— ainda sem lembrete neste ciclo', color: 'text-gray-600' }
  if (bill.is_paid) return { label: bill.paid_at ? `Pago em ${format(parseISO(bill.paid_at), 'dd/MM')}` : 'Pago', color: 'text-emerald-400' }
  const d = differenceInDays(parseISO(bill.due_date), new Date())
  if (d < 0)  return { label: `Atrasado há ${Math.abs(d)}d`, color: 'text-red-400' }
  if (d === 0) return { label: 'Vence hoje!',                color: 'text-red-400' }
  if (d <= 3) return { label: `Vence em ${d}d`,             color: 'text-amber-400' }
  return       { label: `Vence em ${d}d`,                    color: 'text-gray-400' }
}

export default function PlanItemRow({ item, onTogglePaid, onEdit }) {
  const bill = item.bill
  const st = statusLabel(bill)
  const isPaid = bill?.is_paid
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${isPaid ? 'bg-gray-900 border-gray-800 opacity-70' : 'bg-gray-900 border-gray-800'}`}>
      <button
        onClick={() => onTogglePaid(item)}
        disabled={!bill}
        className={`flex-shrink-0 transition-colors ${isPaid ? 'text-emerald-400' : bill ? 'text-gray-600 hover:text-emerald-400' : 'text-gray-800'}`}
        title={bill ? '' : 'Sem bill materializada ainda'}
      >
        {isPaid ? <CheckCircle2 size={22}/> : <Circle size={22}/>}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className={`text-sm font-medium truncate ${isPaid ? 'text-gray-500 line-through' : 'text-white'}`}>{item.name}</p>
          {item.is_fixed && <Lock size={10} className="text-amber-400" title="Fixo"/>}
        </div>
        <p className={`text-xs ${st.color}`}>{st.label}</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <p className="text-sm font-bold text-white mr-1">{fmt(bill?.amount ?? item.planned_amount)}</p>
        <button onClick={() => onEdit(item)} className="text-gray-600 hover:text-gray-400 p-1"><Edit2 size={14}/></button>
      </div>
    </div>
  )
}
