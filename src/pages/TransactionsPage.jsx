import { useState, useEffect, useMemo } from 'react'
import { format, parseISO, startOfWeek, isAfter, isBefore } from 'date-fns'
import { Plus, Trash2, ChevronLeft, ChevronRight, Edit2, TrendingUp, TrendingDown, ArrowRightLeft, Sparkles, Activity } from 'lucide-react'
import { useBudgetItems, useTransactionsByCycle, useCycles, useBills } from '../hooks/useData'
import { addTransaction, deleteTransaction, updateTransaction } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import { PAYMENT_SOURCE_LABELS, PAYMENT_SOURCE_ORDER, computeBucketSnapshot, computeReservaSnapshot, bucketOf } from '../lib/budgetEngine'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function BudgetVsSpent({ label, budget, spent }) {
  const pct = budget > 0 ? (spent / budget) * 100 : 0
  const color = pct > 100 ? 'text-red-400' : pct > 90 ? 'text-amber-400' : 'text-emerald-400'
  const restante = budget - spent
  const restanteColor = restante < 0 ? 'text-red-400' : 'text-emerald-400'
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500">{label}</span>
      <div className="text-right">
        <p className={`font-semibold ${color}`}>{fmt(spent)}</p>
        <p className="text-gray-600 text-[10px]">de {fmt(budget)}</p>
        <p className={`text-[10px] font-semibold ${restanteColor}`}>
          {restante >= 0 ? 'Resta ' : 'Excedeu '}{fmt(Math.abs(restante))}
        </p>
      </div>
    </div>
  )
}

function StatusDot({ spent, budget, label }) {
  const pct = budget > 0 ? (spent / budget) * 100 : 0
  const cfg = pct > 100
    ? { color: 'bg-red-500', text: 'text-red-400', msg: 'estourou' }
    : pct > 90
      ? { color: 'bg-amber-500', text: 'text-amber-400', msg: 'apertado' }
      : { color: 'bg-emerald-500', text: 'text-emerald-400', msg: 'no ritmo' }
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-2 h-2 rounded-full ${cfg.color}`}/>
      <span className={`text-xs ${cfg.text}`}>{label} {cfg.msg}</span>
    </div>
  )
}

const TYPE_LABELS = { income: 'Receita', expense: 'Despesa', investment: 'Investimento', transfer: 'Transferência' }
const TYPE_COLORS = { income: 'chip-income', expense: 'chip-expense', investment: 'chip-investment', transfer: 'badge bg-blue-500/20 text-blue-400' }
const CATEGORY_TYPE_LABELS = {
  income: 'Receita',
  essential: 'Essencial',
  variable: 'Variável',
  installment: 'Parcela',
  investment: 'Investimento',
  reserve: 'Reserva',
}
const SOURCE_CHIP = {
  fixed_income: 'badge bg-emerald-500/15 text-emerald-300',
  variable_income: 'badge bg-teal-500/15 text-teal-300',
  credit: 'badge bg-purple-500/15 text-purple-300',
  reserve: 'badge bg-cyan-500/15 text-cyan-300',
}

const EMPTY = { description: '', amount: '', type: 'expense', date: format(new Date(), 'yyyy-MM-dd'), category_id: '', notes: '', is_paid: true, payment_source: 'fixed_income' }

function TxModal({ onClose, onSaved, initial, categories, userId, reservaSnapshot }) {
  const [form, setForm] = useState({ ...EMPTY, ...initial })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Saldo de reserva disponível pro lançamento (devolve o valor antigo se estamos editando uma reserva)
  const reservaDisponivelPraLancamento = (reservaSnapshot?.disponivel || 0)
    + (initial?.payment_source === 'reserve' ? Number(initial?.amount || 0) : 0)

  async function save() {
    if (!form.description || !form.amount) return setError('Preencha descrição e valor.')
    if (!form.payment_source) return setError('Selecione a fonte de pagamento.')
    if (form.payment_source === 'reserve' && form.type === 'expense') {
      const novo = parseFloat(form.amount)
      if (novo > reservaDisponivelPraLancamento) {
        return setError(`Reserva insuficiente (disponível R$ ${reservaDisponivelPraLancamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).`)
      }
    }
    setSaving(true)
    const payload = {
      ...form,
      amount: parseFloat(form.amount),
      user_id: userId,
      category_id: form.category_id || null,
      budget_item_id: null,
    }
    const { error: err } = form.id ? await updateTransaction(form.id, payload) : await addTransaction(payload)
    if (err) setError(err.message)
    else { onSaved(); onClose() }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-lg text-white">{form.id ? 'Editar' : 'Novo'} Lançamento</h2>

        <div>
          <label className="label">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <button key={k} onClick={() => set('type', k)}
                className={`py-2 rounded-xl text-sm font-medium border transition-all ${form.type === k ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-gray-700 text-gray-400 hover:border-gray-600'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Descrição</label>
          <input className="input" placeholder="Ex: Mercado, Conta de luz..." value={form.description} onChange={e => set('description', e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Valor (R$)</label>
            <input className="input" type="number" step="0.01" min="0" placeholder="0,00" value={form.amount} onChange={e => set('amount', e.target.value)} />
          </div>
          <div>
            <label className="label">Data</label>
            <input className="input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Categoria</label>
          <select className="input" value={form.category_id} onChange={e => set('category_id', e.target.value)}>
            <option value="">Selecionar...</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>
                [{CATEGORY_TYPE_LABELS[c.type] || '—'}] {c.icon} {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Fonte de pagamento *</label>
          <select className="input" value={form.payment_source} onChange={e => set('payment_source', e.target.value)}>
            {PAYMENT_SOURCE_ORDER.map(s => (
              <option key={s} value={s}>{PAYMENT_SOURCE_LABELS[s]}</option>
            ))}
          </select>
          {form.payment_source === 'reserve' && form.type === 'expense' && (
            <p className="text-xs text-cyan-400 mt-1">
              Reserva disponível: R$ {reservaDisponivelPraLancamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} — não entra na média diária.
            </p>
          )}
        </div>

        <div>
          <label className="label">Notas (opcional)</label>
          <textarea className="input resize-none" rows={2} placeholder="Observações..." value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="paid" checked={form.is_paid} onChange={e => set('is_paid', e.target.checked)} className="accent-emerald-500 w-4 h-4"/>
          <label htmlFor="paid" className="text-sm text-gray-300">Já pago/recebido</label>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function TransactionsPage() {
  const { cycles, loading: cyclesLoading } = useCycles()
  const [currentCycleId, setCurrentCycleId] = useState(null)

  // Setar ciclo inicial = o que contém today, ou o mais recente
  useEffect(() => {
    if (cyclesLoading || cycles.length === 0 || currentCycleId) return
    const today = format(new Date(), 'yyyy-MM-dd')
    const containing = cycles.find(c => c.start_date <= today && today <= c.end_date)
    setCurrentCycleId((containing || cycles[0]).id)
  }, [cycles, cyclesLoading, currentCycleId])

  const currentCycle = useMemo(() => cycles.find(c => c.id === currentCycleId), [cycles, currentCycleId])
  const cycleIndex = useMemo(() => cycles.findIndex(c => c.id === currentCycleId), [cycles, currentCycleId])

  const { transactions, loading: txLoading, refetch } = useTransactionsByCycle(
    currentCycle?.start_date,
    currentCycle?.end_date,
  )
  const { items: budgetItems, categories } = useBudgetItems()
  const { bills } = useBills(currentCycle?.month_ref)
  const { user } = useAuth()
  const [modal, setModal] = useState(null)
  const [filterType, setFilterType] = useState('all')

  // Navegação de ciclo (cycles está ordenado start_date DESC, então cycles[0] é o mais recente)
  const prevCycle = () => {
    if (cycleIndex < cycles.length - 1) setCurrentCycleId(cycles[cycleIndex + 1].id)
  }
  const nextCycle = () => {
    if (cycleIndex > 0) setCurrentCycleId(cycles[cycleIndex - 1].id)
  }

  const cycleLabel = currentCycle
    ? `${format(parseISO(currentCycle.start_date), 'dd/MM/yyyy')} → ${format(parseISO(currentCycle.end_date), 'dd/MM/yyyy')}`
    : 'Sem ciclo'
  const isCurrentCycle = (() => {
    if (!currentCycle) return false
    const today = format(new Date(), 'yyyy-MM-dd')
    return currentCycle.start_date <= today && today <= currentCycle.end_date
  })()

  const filtered = filterType === 'all' ? transactions : transactions.filter(t => t.type === filterType)
  const loading = cyclesLoading || txLoading

  const incomeSnap = useMemo(
    () => computeBucketSnapshot({ bucket: 'income', cycle: currentCycle, items: budgetItems, transactions, bills }),
    [currentCycle, budgetItems, transactions, bills]
  )
  const reservaSnap = useMemo(
    () => computeReservaSnapshot({ cycle: currentCycle, transactions }),
    [currentCycle, transactions]
  )

  const metrics = useMemo(() => {
    const today = new Date()
    const todayStr = format(today, 'yyyy-MM-dd')
    const weekStart = startOfWeek(today, { weekStartsOn: 1 })

    const totals = { income: 0, expense: 0, investment: 0, transfer: 0 }
    let gastoHoje = 0, gastoSemana = 0
    const transferByCat = {}
    const investmentByCat = {}

    for (const t of transactions) {
      const amt = Number(t.amount) || 0
      totals[t.type] = (totals[t.type] || 0) + amt
      if (t.type === 'expense' && bucketOf(t.payment_source) === 'income') {
        const d = parseISO(t.date)
        if (t.date === todayStr) gastoHoje += amt
        if (!isBefore(d, weekStart) && !isAfter(d, today)) gastoSemana += amt
      }
      if (t.type === 'transfer') {
        const k = t.categories?.name || 'Sem categoria'
        transferByCat[k] = (transferByCat[k] || 0) + amt
      }
      if (t.type === 'investment') {
        const k = t.categories?.name || 'Sem categoria'
        investmentByCat[k] = (investmentByCat[k] || 0) + amt
      }
    }

    return {
      totals,
      gastoHoje,
      gastoSemana,
      orcamentoDia: incomeSnap.mediaDiaria,
      orcamentoSemana: incomeSnap.mediaDiaria * 7,
      transferByCat,
      investmentByCat,
      entrou: totals.income,
      saiu: totals.expense,
      liquido: totals.income - totals.expense,
    }
  }, [transactions, incomeSnap])

  async function handleDelete(id) {
    if (!confirm('Excluir este lançamento?')) return
    await deleteTransaction(id)
    refetch()
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Lançamentos</h1>
        <button onClick={() => setModal({})} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={16}/> Novo
        </button>
      </div>

      {!cyclesLoading && cycles.length === 0 && (
        <div className="card text-center py-8">
          <p className="text-sm text-gray-400">Nenhum ciclo configurado.</p>
          <p className="text-xs text-gray-500 mt-1">
            Vá em <span className="text-emerald-400">Planejamento → Configurar ciclo</span> pra começar.
          </p>
        </div>
      )}

      {currentCycle && (
        <>
      {/* Cycle nav */}
      <div className="card flex items-center justify-between">
        <button
          onClick={prevCycle}
          disabled={cycleIndex >= cycles.length - 1}
          className="p-2 hover:text-emerald-400 text-gray-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={18}/>
        </button>
        <p className="font-semibold text-white">{cycleLabel}</p>
        <button
          onClick={nextCycle}
          disabled={cycleIndex <= 0}
          className="p-2 hover:text-emerald-400 text-gray-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight size={18}/>
        </button>
      </div>

      {/* Bloco 1 — Orçamento vs Gasto (diário + semanal) */}
      {isCurrentCycle && currentCycle && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white flex items-center gap-2"><Activity size={14} className="text-emerald-400"/> Ritmo de gasto</p>
            <div className="flex gap-2">
              <StatusDot label="Hoje" spent={metrics.gastoHoje} budget={metrics.orcamentoDia}/>
              <StatusDot label="Semana" spent={metrics.gastoSemana} budget={metrics.orcamentoSemana}/>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-800">
            <BudgetVsSpent label="Diário" budget={metrics.orcamentoDia} spent={metrics.gastoHoje}/>
            <BudgetVsSpent label="Semanal" budget={metrics.orcamentoSemana} spent={metrics.gastoSemana}/>
          </div>
          <p className="text-[10px] text-gray-600">Estouro do diário não afeta o semanal. Ao fechar a semana, o orçamento diário dos dias restantes é reajustado automaticamente.</p>
        </div>
      )}

      {/* Bloco 2 — Alocação (transferências + investimentos) */}
      {(metrics.totals.transfer > 0 || metrics.totals.investment > 0) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="card">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-gray-500">Transferido</p>
              <ArrowRightLeft size={12} className="text-blue-400"/>
            </div>
            <p className="text-lg font-bold text-blue-400">{fmt(metrics.totals.transfer)}</p>
            {Object.entries(metrics.transferByCat).slice(0, 3).map(([k, v]) => (
              <p key={k} className="text-[10px] text-gray-500 truncate">→ {k} · {fmt(v)}</p>
            ))}
          </div>
          <div className="card">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-gray-500">Investido</p>
              <Sparkles size={12} className="text-purple-400"/>
            </div>
            <p className="text-lg font-bold text-purple-400">{fmt(metrics.totals.investment)}</p>
            {Object.entries(metrics.investmentByCat).slice(0, 3).map(([k, v]) => (
              <p key={k} className="text-[10px] text-gray-500 truncate">→ {k} · {fmt(v)}</p>
            ))}
          </div>
        </div>
      )}

      {/* Bloco 3 — Consolidado */}
      <div className="card flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <TrendingUp size={14} className="text-emerald-400"/>
          <span className="text-xs text-gray-500">Entrou</span>
          <span className="text-sm font-bold text-emerald-400">{fmt(metrics.entrou)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <TrendingDown size={14} className="text-red-400"/>
          <span className="text-xs text-gray-500">Saiu</span>
          <span className="text-sm font-bold text-red-400">{fmt(metrics.saiu)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Líquido</span>
          <span className={`text-sm font-bold ${metrics.liquido >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(metrics.liquido)}</span>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {['all', 'income', 'expense', 'investment', 'transfer'].map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${filterType === t ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-gray-700 text-gray-400'}`}>
            {t === 'all' ? 'Todos' : TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="card h-16 animate-pulse bg-gray-800"/>)}</div> : (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="card text-center py-10">
              <p className="text-gray-500 text-sm">Nenhum lançamento neste ciclo.</p>
              <button onClick={() => setModal({})} className="text-emerald-400 text-sm hover:text-emerald-300 mt-2">+ Adicionar primeiro</button>
            </div>
          )}
          {filtered.map(tx => (
            <div key={tx.id} className="card flex items-center gap-3 animate-in">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{tx.description}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-gray-500">{tx.date}</span>
                  <span className={TYPE_COLORS[tx.type] || 'badge bg-gray-700 text-gray-400'}>{TYPE_LABELS[tx.type]}</span>
                  {tx.payment_source && (
                    <span className={SOURCE_CHIP[tx.payment_source] || 'badge bg-gray-700 text-gray-400'}>
                      {PAYMENT_SOURCE_LABELS[tx.payment_source] || tx.payment_source}
                    </span>
                  )}
                  {tx.categories && <span className="text-xs text-gray-500">{tx.categories.icon} {tx.categories.name}</span>}
                  {!tx.is_paid && <span className="badge bg-amber-500/20 text-amber-400">Pendente</span>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <p className={`text-sm font-bold ${tx.type === 'income' ? 'text-emerald-400' : tx.type === 'expense' ? 'text-red-400' : 'text-purple-400'}`}>
                  {tx.type === 'income' ? '+' : '-'}R$ {Number(tx.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <button onClick={() => setModal(tx)} className="text-gray-600 hover:text-gray-400 p-1"><Edit2 size={14}/></button>
                <button onClick={() => handleDelete(tx.id)} className="text-gray-600 hover:text-red-400 p-1"><Trash2 size={14}/></button>
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}

      {modal !== null && (
        <TxModal
          initial={modal}
          categories={categories}
          userId={user?.id}
          reservaSnapshot={reservaSnap}
          onClose={() => setModal(null)}
          onSaved={refetch}
        />
      )}
    </div>
  )
}
