import { useState, useMemo } from 'react'
import { format, differenceInDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { TrendingUp, AlertCircle, Target, ArrowRight, Sparkles, Settings, CheckCircle2, Clock, Wallet, CreditCard, CalendarCheck, Activity, PiggyBank } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDashboard, useMonthRef } from '../hooks/useData'
import { useAuth } from '../contexts/AuthContext'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
import { computeBucketSnapshot, computeReservaSnapshot, liveHealth } from '../lib/budgetEngine'
import WeeklyCheckpointModal from '../components/WeeklyCheckpointModal'

const fmt = (v) => {
  if (typeof v === 'string') return v
  const n = Number(v)
  if (!Number.isFinite(n)) return 'R$ 0,00'
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const COLORS = { income: '#10b981', essential: '#f59e0b', variable: '#f97316', investment: '#8b5cf6', installment: '#ef4444', reserve: '#06b6d4', credit: '#a855f7' }
const HEALTH = { green: '#10b981', yellow: '#f59e0b', red: '#ef4444' }

function StatCard({ label, value, color, icon: Icon, sub }) {
  return (
    <div className="card flex flex-col gap-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500 font-medium">{label}</span>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center`} style={{ background: color + '20' }}>
          <Icon size={14} style={{ color }} />
        </div>
      </div>
      <p className="text-xl font-bold text-white">{fmt(value)}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  )
}

function BillAlert({ bill }) {
  const days = differenceInDays(parseISO(bill.due_date), new Date())
  const urgent = days <= 1
  const warn = days <= 3
  return (
    <div className={`flex items-center justify-between p-3 rounded-xl border ${urgent ? 'bg-red-500/10 border-red-500/30' : warn ? 'bg-amber-500/10 border-amber-500/30' : 'bg-gray-800 border-gray-700'}`}>
      <div>
        <p className="text-sm font-medium text-white">{bill.name}</p>
        <p className={`text-xs ${urgent ? 'text-red-400' : warn ? 'text-amber-400' : 'text-gray-400'}`}>
          {days === 0 ? '⚠️ Vence hoje' : days < 0 ? `⛔ Venceu há ${Math.abs(days)} dia(s)` : `📅 Vence em ${days} dia(s)`}
        </p>
      </div>
      <p className="text-sm font-bold text-white">{fmt(bill.amount)}</p>
    </div>
  )
}

export default function DashboardPage() {
  const { profile, user } = useAuth()
  const { monthRef } = useMonthRef()
  const { data, loading, refetch } = useDashboard(monthRef)
  const navigate = useNavigate()
  const [checkpointOpen, setCheckpointOpen] = useState(false)

  const firstName = profile?.full_name?.split(' ')[0] || 'Usuário'
  const monthLabel = format(new Date(), "MMMM 'de' yyyy", { locale: ptBR })

  const { summary = {}, bills = [], goals = [], budgetItems = [], cycle = null, transactions = [], checkpoints = [] } = data || {}

  const incomeSnap = useMemo(() => computeBucketSnapshot({ bucket: 'income', cycle, items: budgetItems, transactions, bills }), [cycle, budgetItems, transactions, bills])
  const creditSnap = useMemo(() => computeBucketSnapshot({ bucket: 'credit', cycle, items: budgetItems, transactions, bills }), [cycle, budgetItems, transactions, bills])
  const reservaSnap = useMemo(() => computeReservaSnapshot({ cycle, transactions }), [cycle, transactions])
  const health = useMemo(() => liveHealth({ cycle, snapshot: incomeSnap }), [cycle, incomeSnap])
  const creditUsedPct = creditSnap.saldoOrigem > 0 ? (creditSnap.gastoReal / creditSnap.saldoOrigem) * 100 : 0

  const totalIncome = cycle ? incomeSnap.saldoOrigem : (summary.income || 0)
  const totalPaid = cycle ? incomeSnap.gastoReal : (summary.paid || 0)
  const totalPending = cycle ? Math.max(incomeSnap.planejado - incomeSnap.gastoReal, 0) : (summary.pending || 0)
  const projectedBalance = cycle ? incomeSnap.saldoDisponivel : (summary.projectedBalance ?? (totalIncome - totalPaid - totalPending))

  const checkpointChart = useMemo(() => {
    const last = [...(checkpoints || [])].reverse().slice(-8)
    return last.map(cp => ({
      label: `${cp.week_start.slice(5)}`,
      Previsto: Number(cp.saldo_previsto),
      Real: Number(cp.saldo_real),
      status: cp.status,
    }))
  }, [checkpoints])

  const pieData = [
    { name: 'Essenciais', value: summary.essential || 0, color: COLORS.essential },
    { name: 'Variáveis', value: summary.variable || 0, color: COLORS.variable },
    { name: 'Parcelas', value: summary.installment || 0, color: COLORS.installment },
    { name: 'Investimento', value: summary.investment || 0, color: COLORS.investment },
  ].filter(d => d.value > 0)

  const plannedExpenses = budgetItems
    .filter(i => i.categories?.type !== 'income')
    .reduce((a, i) => a + Number(i.planned_amount || 0), 0)
  const summaryPaid = summary.paid || 0
  const summaryPending = summary.pending || 0
  const totalPlanned = Math.max(plannedExpenses, summaryPaid + summaryPending + creditSnap.gastoReal)
  const spentEffective = summaryPaid + summaryPending + creditSnap.gastoReal
  const spentPctRaw = totalPlanned > 0 ? (spentEffective / totalPlanned) * 100 : 0

  const upcomingBills = bills.filter(b => !b.is_paid)

  if (loading) return (
    <div className="flex flex-col gap-4 animate-pulse">
      {[...Array(6)].map((_, i) => <div key={i} className="card h-20 bg-gray-800"/>)}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Olá, {firstName} 👋</h1>
          <p className="text-gray-400 text-sm capitalize">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/chat')} className="btn-primary flex items-center gap-2 text-sm">
            <Sparkles size={15}/> IA
          </button>
          <button onClick={() => navigate('/settings')} className="md:hidden w-9 h-9 rounded-xl bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white transition-colors" title="Configurações">
            <Settings size={18}/>
          </button>
        </div>
      </div>

      {/* Alerts */}
      {upcomingBills.length > 0 && (
        <div>
          <p className="section-title flex items-center gap-2"><AlertCircle size={12}/> Contas próximas</p>
          <div className="space-y-2">
            {upcomingBills.slice(0, 3).map(b => <BillAlert key={b.id} bill={b}/>)}
            {upcomingBills.length > 3 && (
              <button onClick={() => navigate('/bills')} className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1 pl-1">
                Ver todas ({upcomingBills.length}) <ArrowRight size={12}/>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Stats Renda */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="section-title flex items-center gap-2"><Wallet size={12}/> Renda</p>
          <button onClick={() => setCheckpointOpen(true)} className="text-xs text-emerald-400 flex items-center gap-1 hover:text-emerald-300">
            <CalendarCheck size={12}/> Fechar semana
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Receita" value={totalIncome} color={COLORS.income} icon={TrendingUp} />
          <StatCard label="Pago" value={totalPaid} color={COLORS.income} icon={CheckCircle2} />
          <StatCard label="A pagar" value={totalPending} color={COLORS.essential} icon={Clock} />
          <StatCard
            label="Saldo projetado"
            value={projectedBalance}
            color={projectedBalance >= 0 ? COLORS.income : COLORS.installment}
            icon={Wallet}
            sub={projectedBalance >= 0 ? 'No positivo ✓' : 'Atenção!'}
          />
        </div>
      </div>

      {/* Stats Crédito */}
      {creditSnap.saldoOrigem > 0 && (
        <div>
          <p className="section-title flex items-center gap-2"><CreditCard size={12}/> Crédito</p>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Limite" value={creditSnap.saldoOrigem} color={COLORS.credit} icon={CreditCard}/>
            <StatCard label="Usado" value={creditSnap.gastoReal} color={COLORS.installment} icon={Clock}/>
            <StatCard label="Disponível" value={creditSnap.saldoDisponivel} color={COLORS.income} icon={Wallet}/>
            <StatCard label="% comprometido" value={`${creditUsedPct.toFixed(0)}%`} color={creditUsedPct > 90 ? COLORS.installment : creditUsedPct > 70 ? COLORS.essential : COLORS.income} icon={Activity} sub="do limite" />
          </div>
        </div>
      )}

      {/* Reserva */}
      {cycle && reservaSnap.total > 0 && (
        <div>
          <p className="section-title flex items-center gap-2"><PiggyBank size={12}/> Reserva</p>
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500">Disponível</p>
                <p className={`text-2xl font-bold ${reservaSnap.disponivel > 0 ? 'text-cyan-400' : 'text-gray-400'}`}>{fmt(reservaSnap.disponivel)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Usado este ciclo</p>
                <p className="text-sm font-bold text-red-400">{fmt(reservaSnap.usado)}</p>
              </div>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
              <div className="h-2 bg-cyan-500" style={{ width: `${Math.min((reservaSnap.usado / (reservaSnap.total || 1)) * 100, 100)}%` }}/>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1 border-t border-gray-800">
              <div><p className="text-gray-500">Acumulada do mês anterior</p><p className="font-semibold text-gray-300">{fmt(reservaSnap.acumulada)}</p></div>
              <div><p className="text-gray-500">Aporte deste ciclo</p><p className="font-semibold text-gray-300">{fmt(reservaSnap.aporte)}</p></div>
            </div>
            <p className="text-[10px] text-gray-600">Gastos lançados com fonte "Reserva" não afetam sua média diária.</p>
          </div>
        </div>
      )}

      {/* Saúde financeira atual */}
      {!cycle && (
        <div className="card flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-500/20">
              <Activity size={18} className="text-amber-400"/>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Configure o ciclo para ver média diária</p>
              <p className="text-xs text-gray-500">Defina saldo de origem e datas do mês em Planejamento.</p>
            </div>
          </div>
          <button onClick={() => navigate('/budget')} className="btn-primary text-xs flex items-center gap-1 flex-shrink-0">
            Configurar <ArrowRight size={12}/>
          </button>
        </div>
      )}
      {cycle && (
        <div className="card space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: HEALTH[health.status] + '30' }}>
              <Activity size={18} style={{ color: HEALTH[health.status] }}/>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">
                {health.status === 'green' && 'Economia no ritmo 🟢'}
                {health.status === 'yellow' && 'Na meta 🟡'}
                {health.status === 'red' && 'Estouro de orçamento 🔴'}
              </p>
              <p className="text-xs text-gray-500">Gasto atual {fmt(health.gastoReal)} · esperado p/ hoje {fmt(health.previstoHoje)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">{incomeSnap.diasRestantes}d restantes</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-800">
            <div className="rounded-lg bg-gray-800/60 p-2">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Média diária</p>
              <p className="text-sm font-bold text-emerald-400">{fmt(incomeSnap.mediaDiaria)}</p>
            </div>
            <div className="rounded-lg bg-gray-800/60 p-2">
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Meta semanal</p>
              <p className="text-sm font-bold text-emerald-400">{fmt(incomeSnap.metaSemanal)}</p>
            </div>
          </div>
          <p className="text-[10px] text-gray-500 pt-1">Baseado apenas no saldo de Renda (reserva {cycle.reserva_pct || 0}%). Crédito não entra nessa conta.</p>
        </div>
      )}

      {/* Progress bar split */}
      <div className="card">
        <div className="flex justify-between items-center mb-2">
          <p className="text-sm font-medium text-gray-300">Orçamento do mês</p>
          <p className="text-sm font-bold text-white">{spentPctRaw.toFixed(0)}%</p>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-2.5 mb-2 overflow-hidden flex">
          <div className="h-2.5 bg-emerald-500" style={{ width: `${Math.min((summaryPaid / (totalPlanned || 1)) * 100, 100)}%` }} />
          <div className="h-2.5 bg-amber-500" style={{ width: `${Math.min((summaryPending / (totalPlanned || 1)) * 100, 100)}%` }} />
          <div className="h-2.5 bg-purple-500" style={{ width: `${Math.min((creditSnap.gastoReal / (totalPlanned || 1)) * 100, 100)}%` }} />
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>{fmt(spentEffective)} de {fmt(totalPlanned)}</span>
          <span>Pago {fmt(summaryPaid)} · A pagar {fmt(summaryPending)} · Crédito {fmt(creditSnap.gastoReal)}</span>
        </div>
      </div>

      {/* Gráfico Previsto vs Real */}
      {checkpointChart.length > 0 && (
        <div className="card">
          <p className="section-title flex items-center gap-2"><Activity size={12}/> Previsto × Real (últimas semanas)</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={checkpointChart} margin={{ top: 5, right: 5, bottom: 5, left: -15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151"/>
              <XAxis dataKey="label" tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={{ stroke: '#374151' }}/>
              <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} axisLine={{ stroke: '#374151' }}/>
              <Tooltip formatter={v => fmt(v)} contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, color: '#f3f4f6' }}/>
              <Legend wrapperStyle={{ fontSize: 11 }}/>
              <Bar dataKey="Previsto" fill="#6b7280"/>
              <Bar dataKey="Real">
                {checkpointChart.map((d, i) => <Cell key={i} fill={HEALTH[d.status]}/>)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Pie Chart */}
      {pieData.length > 0 && (
        <div className="card">
          <p className="section-title">Distribuição de gastos</p>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="50%" height={140}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" strokeWidth={0}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color}/>)}
                </Pie>
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, color: '#f3f4f6' }}/>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2 flex-1">
              {pieData.map((d, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: d.color }}/>
                    <span className="text-xs text-gray-400">{d.name}</span>
                  </div>
                  <span className="text-xs font-medium text-white">{fmt(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Goals */}
      {goals.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="section-title flex items-center gap-2"><Target size={12}/> Metas</p>
            <button onClick={() => navigate('/goals')} className="text-xs text-emerald-400">Ver todas</button>
          </div>
          <div className="space-y-3">
            {goals.slice(0, 2).map(g => {
              const pct = Math.min((Number(g.current_amount) / Number(g.target_amount)) * 100, 100)
              return (
                <div key={g.id} className="card">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-sm font-medium text-white">{g.name}</p>
                    <span className="text-xs text-gray-500">{pct.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-1.5">
                    <div className="h-1.5 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }}/>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1.5">
                    <span>{fmt(g.current_amount)}</span>
                    <span>{fmt(g.target_amount)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {checkpointOpen && (
        <WeeklyCheckpointModal
          cycle={cycle}
          items={budgetItems}
          transactions={transactions}
          bills={bills}
          userId={user?.id}
          onClose={() => setCheckpointOpen(false)}
          onSaved={refetch}
        />
      )}
    </div>
  )
}
