// ─── MonthSummary — resumo do mês: o que passou pela conta, o plano e o saldo por conta ─
import { monthTotals, computeAccountSnapshot } from '../../lib/budgetEngine'
import { fmt } from '../../lib/format'

function Stat({ label, value, tone }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-base sm:text-lg font-bold ${tone}`}>{fmt(value)}</p>
    </div>
  )
}

// Cartão mostra o quanto do limite está usado; as outras contas, o saldo (histórico inteiro).
function AccountChip({ account, transactions }) {
  const snap = computeAccountSnapshot({ account, transactions })
  const isCredit = account.type === 'credit'
  const value = isCredit ? snap.usado : snap.saldoAtual
  return (
    <div className="rounded-xl bg-gray-800 px-3 py-2 min-w-0">
      <p className="text-xs text-gray-500 truncate">{account.name}</p>
      <p className={`text-sm font-semibold ${!isCredit && value < 0 ? 'text-red-400' : 'text-white'}`}>
        {fmt(value)}
        {isCredit && <span className="font-normal text-gray-500"> usado{snap.limite > 0 && ` de ${fmt(snap.limite)}`}</span>}
      </p>
    </div>
  )
}

export default function MonthSummary({ items, transactions, accounts, accountTransactions }) {
  const t = monthTotals({ items, transactions })
  const pct = t.planejado > 0 ? Math.min((t.pago / t.planejado) * 100, 100) : 0
  return (
    <div className="card space-y-4">
      <div>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Entrou" value={t.entrou} tone="text-emerald-400"/>
          <Stat label="Saiu" value={t.saiu} tone="text-red-400"/>
          <Stat label="Líquido" value={t.liquido} tone={t.liquido >= 0 ? 'text-emerald-400' : 'text-red-400'}/>
        </div>
        <p className="text-xs text-gray-500 mt-1">Só o que passou pela conta corrente neste mês. Compras no cartão não entram.</p>
      </div>

      <div className="pt-3 border-t border-gray-800">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <p className="text-sm font-semibold text-white">Contas do mês</p>
          <p className="text-sm text-gray-400">
            <span className="font-semibold text-white">{fmt(t.pago)}</span> pagos de {fmt(t.planejado)}
          </p>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-2 my-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Contas pagas no mês">
          <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }}/>
        </div>
        <p className="text-sm text-gray-400">
          Falta pagar <span className={`font-semibold ${t.falta > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{fmt(t.falta)}</span>
        </p>
      </div>

      {accounts.length > 0 && (
        <div className="pt-3 border-t border-gray-800 grid grid-cols-2 md:grid-cols-3 gap-2">
          {accounts.map(a => <AccountChip key={a.id} account={a} transactions={accountTransactions}/>)}
        </div>
      )}
    </div>
  )
}
