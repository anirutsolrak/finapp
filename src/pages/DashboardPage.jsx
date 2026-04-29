import { useState, useMemo } from 'react'
import { format, differenceInDays, parseISO, startOfWeek, isBefore, isAfter } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { TrendingUp, AlertCircle, Target, ArrowRight, Sparkles, Settings, Clock, Wallet, CreditCard, CalendarCheck, Activity, PiggyBank, Lock, Receipt, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDashboard, useMonthRef } from '../hooks/useData'
import { useAuth } from '../contexts/AuthContext'
import { Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
import { computeBucketSnapshot, computeReservaSnapshot, bucketOf } from '../lib/budgetEngine'
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
  const [drawerOpen, setDrawerOpen] = useState(false)

  const firstName = profile?.full_name?.split(' ')[0] || 'Usuário'
  const monthLabel = format(new Date(), "MMMM 'de' yyyy", { locale: ptBR })

  const { bills = [], goals = [], budgetItems = [], cycle = null, transactions = [], checkpoints = [] } = data || {}

  const incomeSnap = useMemo(() => computeBucketSnapshot({ bucket: 'income', cycle, items: budgetItems, transactions, bills }), [cycle, budgetItems, transactions, bills])
  const creditSnap = useMemo(() => computeBucketSnapshot({ bucket: 'credit', cycle, items: budgetItems, transactions, bills }), [cycle, budgetItems, transactions, bills])
  const reservaSnap = useMemo(() => computeReservaSnapshot({ cycle, transactions }), [cycle, transactions])
  const creditUsedPct = creditSnap.saldoOrigem > 0 ? (creditSnap.gastoReal / creditSnap.saldoOrigem) * 100 : 0

  // Bills pagas no mês (bucket renda) — exclui itens de crédito.
  const paidBillsRendaMes = useMemo(
    () => (bills || [])
      .filter(b => b.is_paid && (b.budget_items?.payment_source || 'fixed_income') !== 'credit')
      .reduce((a, b) => a + Number(b.amount || 0), 0),
    [bills]
  )

  // Gasto desta semana (segunda → hoje) no bucket renda — pra comparar com a meta semanal.
  const gastoSemanaRenda = useMemo(() => {
    const today = new Date()
    const weekStart = startOfWeek(today, { weekStartsOn: 1 })
    return (transactions || [])
      .filter(t => t.type === 'expense' && bucketOf(t.payment_source) === 'income')
      .filter(t => {
        const d = parseISO(t.date)
        return !isBefore(d, weekStart) && !isAfter(d, today)
      })
      .reduce((a, t) => a + Number(t.amount || 0), 0)
  }, [transactions])
  const semanaPct = incomeSnap.metaSemanal > 0 ? (gastoSemanaRenda / incomeSnap.metaSemanal) * 100 : 0
  const semanaStatus = semanaPct > 100 ? 'red' : semanaPct >= 80 ? 'yellow' : 'green'

  const checkpointChart = useMemo(() => {
    const last = [...(checkpoints || [])].reverse().slice(-8)
    return last.map(cp => ({
      label: `${cp.week_start.slice(5)}`,
      Previsto: Number(cp.saldo_previsto),
      Real: Number(cp.saldo_real),
      status: cp.status,
    }))
  }, [checkpoints])

  const upcomingBills = bills.filter(b => !b.is_paid)

  if (loading) return (
    <div className="flex flex-col gap-4 animate-pulse">
      {[...Array(6)].map((_, i) => <div key={i} className="card h-20 bg-gray-800"/>)}
    </div>
  )

  const showDock = !!cycle

  return (
    <div className={`space-y-6 ${showDock ? 'pb-20' : ''}`}>
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
          <StatCard
            label="Saldo atual"
            value={incomeSnap.saldoOrigem}
            color={COLORS.income}
            icon={Wallet}
            sub="Em conta (você atualiza no Planejamento)"
          />
          <StatCard
            label="Reservado"
            value={incomeSnap.reserva}
            color={COLORS.reserve}
            icon={Lock}
            sub={`${cycle?.reserva_pct || 0}% do saldo`}
          />
          <StatCard
            label="Disponível pra gastar"
            value={incomeSnap.saldoDisponivel}
            color={incomeSnap.saldoDisponivel >= 0 ? COLORS.income : COLORS.installment}
            icon={TrendingUp}
            sub={`${incomeSnap.diasRestantes}d até virar o ciclo`}
          />
          <StatCard
            label="Bills pagas no mês"
            value={paidBillsRendaMes}
            color={COLORS.income}
            icon={Receipt}
            sub="Sai diretamente da conta"
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

      {/* Configure ciclo (CTA quando sem ciclo) */}
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

      {/* ── Bottom trigger (único): abre drawer com Ritmo / Reserva / Metas ── */}
      {showDock && (
        <div
          className="fixed left-0 right-0 z-30 px-4 pointer-events-none bottom-[calc(4rem+env(safe-area-inset-bottom)+0.5rem)] md:bottom-4"
        >
          <div className="max-w-5xl mx-auto pointer-events-auto">
            <button
              onClick={() => setDrawerOpen(true)}
              className="w-full bg-gray-900 border border-gray-800 rounded-2xl px-4 py-3 flex items-center justify-center gap-3 hover:bg-gray-800 transition-colors shadow-lg"
            >
              <span className="text-gray-500 text-lg leading-none">≡</span>
              <span className="flex items-center gap-2 text-xs font-semibold tracking-wider text-gray-300">
                <span className="flex items-center gap-1"><Activity size={11} style={{ color: HEALTH[semanaStatus] }}/> RITMO</span>
                <span className="text-gray-700">·</span>
                <span className="flex items-center gap-1"><PiggyBank size={11} className="text-cyan-400"/> RESERVA</span>
                <span className="text-gray-700">·</span>
                <span className="flex items-center gap-1"><Target size={11} className="text-emerald-400"/> METAS</span>
              </span>
            </button>
          </div>
        </div>
      )}

      {/* ── Drawer (mobile = lateral direita; desktop = centralizado) ── */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex animate-in md:items-center md:justify-center md:p-4"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="ml-auto h-full w-[88%] max-w-sm bg-gray-900 border-l border-gray-800 rounded-l-2xl p-4 overflow-y-auto animate-slide-right
                       md:ml-0 md:mr-0 md:h-auto md:max-h-[85vh] md:w-full md:max-w-md md:rounded-2xl md:border md:animate-in"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-white">Resumo rápido</p>
              <button
                onClick={() => setDrawerOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800"
                aria-label="Fechar"
              >
                <X size={18}/>
              </button>
            </div>

            <div className="space-y-4">
              {/* Ritmo */}
              <div className="space-y-2">
                <p className="section-title flex items-center gap-2 mb-2"><Activity size={12}/> Ritmo da semana</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: HEALTH[semanaStatus] + '30' }}>
                    <Activity size={18} style={{ color: HEALTH[semanaStatus] }}/>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">
                      {semanaStatus === 'green' && 'Semana no ritmo 🟢'}
                      {semanaStatus === 'yellow' && 'Semana no limite 🟡'}
                      {semanaStatus === 'red' && 'Semana estourou 🔴'}
                    </p>
                    <p className="text-xs text-gray-500 truncate">Gastou {fmt(gastoSemanaRenda)} de {fmt(incomeSnap.metaSemanal)}</p>
                  </div>
                  <p className="text-xs text-gray-500 flex-shrink-0">{incomeSnap.diasRestantes}d</p>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                  <div className="h-2 transition-all" style={{ width: `${Math.min(semanaPct, 100)}%`, background: HEALTH[semanaStatus] }}/>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="rounded-lg bg-gray-800/60 p-2">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Média diária</p>
                    <p className="text-sm font-bold text-emerald-400">{fmt(incomeSnap.mediaDiaria)}</p>
                  </div>
                  <div className="rounded-lg bg-gray-800/60 p-2">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Meta semanal</p>
                    <p className="text-sm font-bold text-emerald-400">{fmt(incomeSnap.metaSemanal)}</p>
                  </div>
                </div>
              </div>

              {/* Reserva */}
              <div className="space-y-2 pt-3 border-t border-gray-800">
                <p className="section-title flex items-center gap-2 mb-2"><PiggyBank size={12}/> Reserva</p>
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
                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                  <div><p className="text-gray-500">Acumulada</p><p className="font-semibold text-gray-300">{fmt(reservaSnap.acumulada)}</p></div>
                  <div><p className="text-gray-500">Aporte do ciclo</p><p className="font-semibold text-gray-300">{fmt(reservaSnap.aporte)}</p></div>
                </div>
              </div>

              {/* Metas */}
              <div className="space-y-2 pt-3 border-t border-gray-800">
                <div className="flex items-center justify-between mb-2">
                  <p className="section-title flex items-center gap-2 mb-0"><Target size={12}/> Metas</p>
                  {goals.length > 0 && (
                    <button onClick={() => { setDrawerOpen(false); navigate('/goals') }} className="text-xs text-emerald-400 hover:text-emerald-300">Ver todas →</button>
                  )}
                </div>
                {goals.length === 0 && (
                  <div className="text-center py-4">
                    <p className="text-sm text-gray-500">Nenhuma meta ativa.</p>
                    <button onClick={() => { setDrawerOpen(false); navigate('/goals') }} className="text-xs text-emerald-400 mt-2 hover:text-emerald-300">+ Criar meta</button>
                  </div>
                )}
                {goals.slice(0, 3).map(g => {
                  const pct = Math.min((Number(g.current_amount) / Number(g.target_amount)) * 100, 100)
                  return (
                    <div key={g.id} className="rounded-xl bg-gray-800/60 p-3">
                      <div className="flex justify-between items-start mb-1.5">
                        <p className="text-sm font-medium text-white truncate pr-2">{g.name}</p>
                        <span className="text-xs text-gray-500 flex-shrink-0">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-gray-900 rounded-full h-1.5">
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
          </div>
        </div>
      )}
    </div>
  )
}
