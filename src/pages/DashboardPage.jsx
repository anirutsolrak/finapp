import { format, differenceInDays, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { TrendingUp, TrendingDown, AlertCircle, Target, PiggyBank, ArrowRight, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDashboard, useMonthRef } from '../hooks/useData'
import { useAuth } from '../contexts/AuthContext'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`

const COLORS = { income: '#10b981', essential: '#f59e0b', variable: '#f97316', investment: '#8b5cf6', installment: '#ef4444', reserve: '#06b6d4' }

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
  const { profile } = useAuth()
  const { monthRef } = useMonthRef()
  const { data, loading } = useDashboard(monthRef)
  const navigate = useNavigate()

  const firstName = profile?.full_name?.split(' ')[0] || 'Usuário'
  const monthLabel = format(new Date(), "MMMM 'de' yyyy", { locale: ptBR })

  if (loading) return (
    <div className="flex flex-col gap-4 animate-pulse">
      {[...Array(6)].map((_, i) => <div key={i} className="card h-20 bg-gray-800"/>)}
    </div>
  )

  const { summary = {}, bills = [], goals = [], budgetItems = [] } = data || {}
  const totalIncome = summary.income || 0
  const totalExpenses = summary.total_expenses || 0
  const balance = totalIncome - totalExpenses

  const pieData = [
    { name: 'Essenciais', value: summary.essential || 0, color: COLORS.essential },
    { name: 'Variáveis', value: summary.variable || 0, color: COLORS.variable },
    { name: 'Parcelas', value: summary.installment || 0, color: COLORS.installment },
    { name: 'Investimento', value: summary.investment || 0, color: COLORS.investment },
  ].filter(d => d.value > 0)

  const totalPlanned = budgetItems.filter(i => i.categories?.type !== 'income').reduce((a, i) => a + Number(i.planned_amount), 0)
  const spentPct = totalPlanned > 0 ? Math.min((totalExpenses / totalPlanned) * 100, 100) : 0

  const upcomingBills = bills.filter(b => !b.is_paid)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Olá, {firstName} 👋</h1>
          <p className="text-gray-400 text-sm capitalize">{monthLabel}</p>
        </div>
        <button onClick={() => navigate('/chat')} className="btn-primary flex items-center gap-2 text-sm">
          <Sparkles size={15}/> IA
        </button>
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

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Receita" value={totalIncome} color={COLORS.income} icon={TrendingUp} />
        <StatCard label="Gasto" value={totalExpenses} color={COLORS.installment} icon={TrendingDown} />
        <StatCard label="Saldo" value={balance} color={balance >= 0 ? COLORS.income : COLORS.installment} icon={balance >= 0 ? TrendingUp : TrendingDown} sub={balance >= 0 ? 'No positivo ✓' : 'Atenção!'} />
        <StatCard label="Investido" value={summary.investment || 0} color={COLORS.investment} icon={PiggyBank} />
      </div>

      {/* Progress bar */}
      <div className="card">
        <div className="flex justify-between items-center mb-2">
          <p className="text-sm font-medium text-gray-300">Orçamento do mês</p>
          <p className="text-sm font-bold text-white">{spentPct.toFixed(0)}%</p>
        </div>
        <div className="w-full bg-gray-800 rounded-full h-2.5 mb-2">
          <div className={`h-2.5 rounded-full transition-all ${spentPct > 90 ? 'bg-red-500' : spentPct > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${spentPct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-gray-500">
          <span>Gasto: {fmt(totalExpenses)}</span>
          <span>Planejado: {fmt(totalPlanned)}</span>
        </div>
      </div>

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
    </div>
  )
}
