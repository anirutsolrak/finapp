import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { Plus, Edit2, Trash2, Lock, TrendingUp, TrendingDown, Settings, RefreshCw, Wallet, CreditCard, History, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useBudgetItems, useBudgetCycle, useTransactions, useCheckpoints, useMonthRef, useBills } from '../hooks/useData'
import { upsertBudgetItem, deleteBudgetItem, upsertBudgetCycle, reseedBudgetCycle } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'
import {
  PAYMENT_SOURCE_LABELS,
  BUDGET_ITEM_PAYMENT_SOURCES,
  bucketOf,
  computeBucketSnapshot,
  computeReservaSnapshot,
} from '../lib/budgetEngine'

const TYPE_LABELS = { income: 'Receita', investment: 'Investimento', essential: 'Essencial', variable: 'Variável', installment: 'Parcela/Empréstimo', reserve: 'Reserva' }
const EMPTY = { name: '', planned_amount: '', is_fixed: false, due_day: '', recurrence: 'monthly', notes: '', category_id: '', active: true, payment_source: 'fixed_income' }
const fmt = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function ItemModal({ initial, categories, defaultBucket, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    if (initial?.id) return { ...EMPTY, ...initial, planned_amount: initial.planned_amount ?? '' }
    return { ...EMPTY, payment_source: defaultBucket === 'credit' ? 'credit' : 'fixed_income' }
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const selectedCat = categories.find(c => c.id === form.category_id)
  const isIncome = selectedCat?.type === 'income'

  async function save() {
    if (!form.name.trim()) return setError('Informe um nome.')
    if (!form.planned_amount) return setError('Informe o valor.')
    if (!form.category_id) return setError('Selecione uma categoria.')
    if (!form.payment_source) return setError('Selecione a fonte de pagamento.')
    setSaving(true)
    const { categories: _c, ...cleanForm } = form
    const { error: err } = await upsertBudgetItem({
      ...cleanForm,
      planned_amount: parseFloat(cleanForm.planned_amount),
      due_day: cleanForm.due_day ? parseInt(cleanForm.due_day) : null,
    })
    if (err) setError(err.message)
    else { onSaved(); onClose() }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-lg text-white">{form.id ? 'Editar' : 'Novo'} item</h2>

        <div>
          <label className="label">Categoria</label>
          <select className="input" value={form.category_id} onChange={e => set('category_id', e.target.value)}>
            <option value="">Selecionar...</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name} — {TYPE_LABELS[c.type]}</option>)}
          </select>
        </div>

        <div>
          <label className="label">Fonte de pagamento *</label>
          <select className="input" value={form.payment_source} onChange={e => set('payment_source', e.target.value)}>
            {BUDGET_ITEM_PAYMENT_SOURCES.map(s => (
              <option key={s} value={s}>{PAYMENT_SOURCE_LABELS[s]}</option>
            ))}
          </select>
          <p className="text-xs text-gray-600 mt-1">Define se este item entra no bucket Renda ou Crédito. Reserva é só para imprevistos (lançamentos avulsos).</p>
        </div>

        <div>
          <label className="label">Nome</label>
          <input className="input" placeholder={isIncome ? 'Ex: Salário, Freelance...' : 'Ex: Aluguel, Mercado...'} value={form.name} onChange={e => set('name', e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{isIncome ? 'Valor esperado (R$)' : 'Valor planejado (R$)'}</label>
            <input className="input" type="number" step="0.01" min="0" placeholder="0,00" value={form.planned_amount} onChange={e => set('planned_amount', e.target.value)} />
          </div>
          {!isIncome && (
            <div>
              <label className="label">Dia de vencimento</label>
              <input className="input" type="number" min={1} max={31} placeholder="Ex: 10" value={form.due_day || ''} onChange={e => set('due_day', e.target.value)} />
            </div>
          )}
        </div>

        <div>
          <label className="label">Recorrência</label>
          <select className="input" value={form.recurrence} onChange={e => set('recurrence', e.target.value)}>
            <option value="monthly">Mensal</option>
            <option value="yearly">Anual</option>
            <option value="once">Única vez</option>
          </select>
        </div>

        <div>
          <label className="label">Observações</label>
          <input className="input" placeholder="Opcional..." value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
        </div>

        {!isIncome && (
          <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
            <input type="checkbox" id="bfixed" checked={form.is_fixed} onChange={e => set('is_fixed', e.target.checked)} className="accent-amber-500 w-4 h-4 mt-0.5 flex-shrink-0"/>
            <label htmlFor="bfixed" className="text-sm text-amber-200 cursor-pointer">
              <strong className="text-amber-400">Item fixo</strong> — protegido no replanejamento da IA.
            </label>
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

function CycleModal({ cycle, userId, monthRef, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    saldo_origem_income: cycle?.saldo_origem_income ?? 0,
    saldo_origem_credit: cycle?.saldo_origem_credit ?? 0,
    reserva_pct: cycle?.reserva_pct ?? 0,
    start_date: cycle?.start_date || format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'),
    end_date: cycle?.end_date || format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), 'yyyy-MM-dd'),
  }))
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    setSaving(true)
    await upsertBudgetCycle({
      ...(cycle || {}),
      user_id: userId,
      month_ref: monthRef,
      saldo_origem_income: parseFloat(form.saldo_origem_income) || 0,
      saldo_origem_credit: parseFloat(form.saldo_origem_credit) || 0,
      reserva_pct: parseFloat(form.reserva_pct) || 0,
      start_date: form.start_date,
      end_date: form.end_date,
    })
    onSaved()
    onClose()
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-lg text-white">Configurar ciclo — {monthRef}</h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Início do ciclo</label>
            <input type="date" className="input" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
          </div>
          <div>
            <label className="label">Fim do ciclo</label>
            <input type="date" className="input" value={form.end_date} onChange={e => set('end_date', e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Saldo origem — Renda (R$)</label>
          <input type="number" step="0.01" className="input" value={form.saldo_origem_income} onChange={e => set('saldo_origem_income', e.target.value)} />
        </div>

        <div>
          <label className="label">Saldo origem — Crédito (R$)</label>
          <input type="number" step="0.01" className="input" value={form.saldo_origem_credit} onChange={e => set('saldo_origem_credit', e.target.value)} />
        </div>

        <div>
          <label className="label">Margem de reserva (%)</label>
          <input type="number" step="0.1" min="0" max="100" className="input" value={form.reserva_pct} onChange={e => set('reserva_pct', e.target.value)} />
          <p className="text-xs text-gray-600 mt-1">Percentual reservado antes do cálculo de média diária.</p>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

function SnapshotCard({ snapshot, bucket, reservaSnapshot }) {
  const isCredit = bucket === 'credit'
  const pct = snapshot.saldoOrigem > 0 ? (snapshot.gastoReal / snapshot.saldoOrigem) * 100 : 0
  return (
    <div className="card space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isCredit ? <CreditCard size={14} className="text-purple-400"/> : <Wallet size={14} className="text-emerald-400"/>}
          <p className="text-sm font-semibold text-white">Ciclo — {isCredit ? 'Crédito' : 'Renda'}</p>
        </div>
        {!isCredit && <span className="text-xs text-gray-500">{snapshot.diasRestantes}d restantes</span>}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div><p className="text-gray-500">{isCredit ? 'Limite' : 'Saldo origem'}</p><p className="font-semibold text-white">{fmt(snapshot.saldoOrigem)}</p></div>
        <div><p className="text-gray-500">{isCredit ? 'Usado' : 'Gasto real'}</p><p className="font-semibold text-red-400">{fmt(snapshot.gastoReal)}</p></div>
        <div><p className="text-gray-500">Disponível</p><p className={`font-semibold ${snapshot.saldoDisponivel > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(snapshot.saldoDisponivel)}</p></div>
        {isCredit ? (
          <div><p className="text-gray-500">% comprometido</p><p className="font-semibold text-white">{pct.toFixed(0)}%</p></div>
        ) : (
          <>
            <div><p className="text-gray-500">Média diária</p><p className="font-semibold text-white">{fmt(snapshot.mediaDiaria)}</p></div>
            <div><p className="text-gray-500">Meta semanal</p><p className="font-semibold text-white">{fmt(snapshot.metaSemanal)}</p></div>
          </>
        )}
      </div>
      {!isCredit && reservaSnapshot && (
        <div className="mt-2 pt-2 border-t border-gray-800 grid grid-cols-3 gap-2 text-[11px]">
          <div><p className="text-gray-500">Reserva disp.</p><p className={`font-semibold ${reservaSnapshot.disponivel > 0 ? 'text-cyan-400' : 'text-gray-400'}`}>{fmt(reservaSnapshot.disponivel)}</p></div>
          <div><p className="text-gray-500">Usado ciclo</p><p className="font-semibold text-red-400">{fmt(reservaSnapshot.usado)}</p></div>
          <div><p className="text-gray-500">Acumulada</p><p className="font-semibold text-gray-300">{fmt(reservaSnapshot.acumulada)}</p></div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }) {
  const cfg = {
    green: { bg: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', icon: CheckCircle2, label: 'Economia' },
    yellow: { bg: 'bg-amber-500/15 text-amber-300 border-amber-500/30', icon: AlertTriangle, label: 'Na meta' },
    red: { bg: 'bg-red-500/15 text-red-300 border-red-500/30', icon: AlertTriangle, label: 'Estouro' },
  }[status] || { bg: 'bg-gray-700 text-gray-400', icon: AlertTriangle, label: status }
  const Icon = cfg.icon
  return (
    <span className={`badge border ${cfg.bg} flex items-center gap-1 text-xs`}>
      <Icon size={11}/> {cfg.label}
    </span>
  )
}

export default function BudgetPage() {
  const { monthRef } = useMonthRef()
  const { items, categories, loading, refetch } = useBudgetItems()
  const { cycle, refetch: refetchCycle } = useBudgetCycle(monthRef)
  const { transactions } = useTransactions(monthRef)
  const { bills } = useBills(monthRef)
  const { checkpoints } = useCheckpoints(40)
  const { user } = useAuth()

  const [tab, setTab] = useState('income')
  const [itemModal, setItemModal] = useState(null)
  const [cycleModal, setCycleModal] = useState(false)
  const [reseeding, setReseeding] = useState(false)

  const incomeSnapshot = useMemo(() => computeBucketSnapshot({ bucket: 'income', cycle, items, transactions, bills }), [cycle, items, transactions, bills])
  const creditSnapshot = useMemo(() => computeBucketSnapshot({ bucket: 'credit', cycle, items, transactions, bills }), [cycle, items, transactions, bills])
  const reservaSnapshot = useMemo(() => computeReservaSnapshot({ cycle, transactions }), [cycle, transactions])

  const bucketItems = useMemo(() => items.filter(i => bucketOf(i.payment_source) === tab), [items, tab])
  const incomeItems = bucketItems.filter(i => i.categories?.type === 'income')
  const expenseItems = bucketItems.filter(i => i.categories?.type !== 'income')
  const totalIncome = incomeItems.reduce((a, i) => a + Number(i.planned_amount), 0)
  const totalExpenses = expenseItems.reduce((a, i) => a + Number(i.planned_amount), 0)

  const expensesByCategory = categories
    .filter(c => c.type !== 'income')
    .map(cat => ({ cat, items: expenseItems.filter(i => i.category_id === cat.id) }))
    .filter(g => g.items.length > 0)

  async function handleDelete(item) {
    if (item.is_fixed && !confirm(`"${item.name}" é fixo. Confirma exclusão?`)) return
    if (!item.is_fixed && !confirm(`Excluir "${item.name}"?`)) return
    await deleteBudgetItem(item.id)
    refetch()
  }

  async function handleReseed() {
    setReseeding(true)
    await reseedBudgetCycle(monthRef, user?.id)
    await Promise.all([refetch(), refetchCycle()])
    setReseeding(false)
  }

  const activeSnapshot = tab === 'credit' ? creditSnapshot : incomeSnapshot

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Planejamento</h1>
          <p className="text-xs text-gray-500 mt-0.5">Ciclo {monthRef} · {cycle ? `${cycle.start_date} → ${cycle.end_date}` : 'sem ciclo'}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={handleReseed} disabled={reseeding} title="Reseed ciclo a partir dos itens" className="w-9 h-9 rounded-xl bg-gray-800 flex items-center justify-center text-gray-400 hover:text-emerald-400 disabled:opacity-50">
            <RefreshCw size={16} className={reseeding ? 'animate-spin' : ''}/>
          </button>
          <button onClick={() => setCycleModal(true)} title="Configurar ciclo" className="w-9 h-9 rounded-xl bg-gray-800 flex items-center justify-center text-gray-400 hover:text-white">
            <Settings size={16}/>
          </button>
          <button onClick={() => setItemModal({})} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus size={16}/> Novo
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { k: 'income',  label: 'Renda',    icon: Wallet },
          { k: 'credit',  label: 'Crédito',  icon: CreditCard },
          { k: 'history', label: 'Histórico', icon: History },
        ].map(({ k, label, icon: Icon }) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`py-2 rounded-xl text-sm font-medium border transition-all flex items-center justify-center gap-1.5 ${tab === k ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-gray-700 text-gray-400 hover:border-gray-600'}`}
          >
            <Icon size={14}/> {label}
          </button>
        ))}
      </div>

      {tab !== 'history' && <SnapshotCard snapshot={activeSnapshot} bucket={tab} reservaSnapshot={tab === 'income' ? reservaSnapshot : null}/>}

      {tab === 'history' && (
        <div className="space-y-2">
          <p className="section-title flex items-center gap-2"><History size={12}/> Fechamentos semanais</p>
          {checkpoints.length === 0 && (
            <div className="card text-center py-8">
              <p className="text-gray-500 text-sm">Nenhum checkpoint registrado ainda.</p>
              <p className="text-xs text-gray-600 mt-1">Use "Fechar semana" no Dashboard toda segunda-feira.</p>
            </div>
          )}
          {checkpoints.map(cp => (
            <div key={cp.id} className="card flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">{cp.week_start} → {cp.week_end}</p>
                <p className="text-xs text-gray-500">{cp.bucket === 'credit' ? '💳 Crédito' : '💰 Renda'} · previsto {fmt(cp.saldo_previsto)} · real {fmt(cp.saldo_real)}</p>
                {cp.note && <p className="text-xs text-gray-600 mt-1 italic">"{cp.note}"</p>}
              </div>
              <StatusBadge status={cp.status}/>
            </div>
          ))}
        </div>
      )}

      {tab !== 'history' && (
        <>
          {/* Resumo da aba */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card">
              <div className="flex items-center gap-1.5 mb-1"><TrendingUp size={12} className="text-emerald-400"/><p className="text-xs text-gray-500">Receita</p></div>
              <p className="text-base font-bold text-emerald-400">{fmt(totalIncome)}</p>
            </div>
            <div className="card">
              <div className="flex items-center gap-1.5 mb-1"><TrendingDown size={12} className="text-red-400"/><p className="text-xs text-gray-500">Despesas</p></div>
              <p className="text-base font-bold text-red-400">{fmt(totalExpenses)}</p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-500 mb-1">Balanço</p>
              <p className={`text-base font-bold ${(totalIncome - totalExpenses) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmt(totalIncome - totalExpenses)}</p>
            </div>
          </div>

          {loading ? (
            <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="card h-32 animate-pulse bg-gray-800"/>)}</div>
          ) : (
            <div className="space-y-5">
              {incomeItems.length > 0 && (
                <div className="card border-emerald-500/20">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <TrendingUp size={16} className="text-emerald-400"/>
                      <p className="font-semibold text-white">Receitas</p>
                    </div>
                    <p className="text-sm font-bold text-emerald-400">{fmt(totalIncome)}</p>
                  </div>
                  <div className="space-y-1">
                    {incomeItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between py-2 border-t border-gray-800">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <p className="text-sm text-gray-300 truncate">{item.name}</p>
                          <span className="badge bg-gray-800 text-gray-500 text-[10px] flex-shrink-0">{PAYMENT_SOURCE_LABELS[item.payment_source]}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <p className="text-sm font-medium text-emerald-400">{fmt(item.planned_amount)}</p>
                          <button onClick={() => setItemModal(item)} className="text-gray-600 hover:text-gray-400 p-1"><Edit2 size={13}/></button>
                          <button onClick={() => handleDelete(item)} className="text-gray-600 hover:text-red-400 p-1"><Trash2 size={13}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {expensesByCategory.map(({ cat, items: catItems }) => {
                const catTotal = catItems.reduce((a, i) => a + Number(i.planned_amount), 0)
                return (
                  <div key={cat.id} className="card">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{cat.icon}</span>
                        <div>
                          <p className="font-semibold text-white text-sm">{cat.name}</p>
                          <p className="text-xs text-gray-500">{TYPE_LABELS[cat.type]}</p>
                        </div>
                      </div>
                      <p className="text-sm font-bold text-white">{fmt(catTotal)}</p>
                    </div>
                    <div className="space-y-0">
                      {catItems.map(item => (
                        <div key={item.id} className="flex items-center justify-between py-2 border-t border-gray-800">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {item.is_fixed && <Lock size={11} className="text-amber-400 flex-shrink-0"/>}
                            <p className="text-sm text-gray-300 truncate">{item.name}</p>
                            <span className="badge bg-gray-800 text-gray-500 text-[10px] flex-shrink-0">{PAYMENT_SOURCE_LABELS[item.payment_source]}</span>
                            {item.due_day && <span className="text-xs text-gray-600 flex-shrink-0">dia {item.due_day}</span>}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <p className="text-sm font-medium text-white">{fmt(item.planned_amount)}</p>
                            <button onClick={() => setItemModal(item)} className="text-gray-600 hover:text-gray-400 p-1"><Edit2 size={13}/></button>
                            <button onClick={() => handleDelete(item)} className="text-gray-600 hover:text-red-400 p-1"><Trash2 size={13}/></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

              {bucketItems.length === 0 && (
                <div className="card text-center py-10">
                  <p className="text-gray-500 text-sm">Nenhum item no bucket {tab === 'credit' ? 'Crédito' : 'Renda'} ainda.</p>
                  <button onClick={() => setItemModal({})} className="text-emerald-400 text-sm hover:text-emerald-300 mt-2">+ Adicionar primeiro item</button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {itemModal !== null && (
        <ItemModal
          initial={itemModal}
          categories={categories}
          defaultBucket={tab === 'credit' ? 'credit' : 'income'}
          onClose={() => setItemModal(null)}
          onSaved={refetch}
        />
      )}

      {cycleModal && (
        <CycleModal
          cycle={cycle}
          userId={user?.id}
          monthRef={monthRef}
          onClose={() => setCycleModal(false)}
          onSaved={refetchCycle}
        />
      )}
    </div>
  )
}
