const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function PlanningHeader({ items }) {
  const planned = items.reduce((a, i) => a + Number(i.planned_amount || 0), 0)
  const paid = items.reduce((a, i) => a + (i.bill?.is_paid ? Number(i.bill.amount || 0) : 0), 0)
  const pending = planned - paid
  return (
    <div className="card">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-gray-500">Planejado</p>
          <p className="text-sm font-bold text-white">{fmt(planned)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Pago</p>
          <p className="text-sm font-bold text-emerald-400">{fmt(paid)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Pendente</p>
          <p className="text-sm font-bold text-amber-400">{fmt(pending)}</p>
        </div>
      </div>
    </div>
  )
}
