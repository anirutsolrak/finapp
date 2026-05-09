import { useState, useMemo, useEffect } from 'react'
import { format, differenceInDays, parseISO, addMonths, subMonths } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, CheckCircle2, Circle, Trash2, Edit2, Lock, Bell, Link, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, LayoutList, Calendar, CreditCard } from 'lucide-react'
import { useBills } from '../hooks/useData'
import { upsertBill, markBillPaid, deleteBill, getCreditCardBills } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'

const EMPTY = { name: '', amount: '', due_date: format(new Date(), 'yyyy-MM-dd'), is_fixed: false, recurrence: 'none', alert_days_before: 3 }

function getStatus(bill) {
  if (bill.is_paid) return { label: bill.paid_at ? `Pago em ${format(parseISO(bill.paid_at), 'dd/MM')}` : 'Pago', color: 'text-emerald-400', bg: 'bg-gray-900 border-gray-800' }
  const days = differenceInDays(parseISO(bill.due_date), new Date())
  if (days < 0)   return { label: `Venceu há ${Math.abs(days)}d`, color: 'text-red-400',   bg: 'bg-red-500/10 border-red-500/30' }
  if (days === 0)  return { label: 'Vence hoje!',                  color: 'text-red-400',   bg: 'bg-red-500/10 border-red-500/30' }
  if (days <= 3)   return { label: `Vence em ${days}d`,            color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' }
  return           { label: `Vence em ${days}d`,                   color: 'text-gray-500',  bg: 'bg-gray-900 border-gray-800' }
}

function BillRow({ bill, onToggle, onEdit, onDelete }) {
  const st = getStatus(bill)
  // Só exibe o link com Planejamento se o item ainda está ativo. Órfão = vínculo quebrado.
  const fromPlan = !!bill.budget_item_id && bill.budget_items?.active === true
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border animate-in ${st.bg}`}>
      <button onClick={() => onToggle(bill)} className={`flex-shrink-0 transition-colors ${bill.is_paid ? 'text-emerald-400' : 'text-gray-600 hover:text-emerald-400'}`}>
        {bill.is_paid ? <CheckCircle2 size={22}/> : <Circle size={22}/>}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className={`text-sm font-medium truncate ${bill.is_paid ? 'text-gray-500 line-through' : 'text-white'}`}>{bill.name}</p>
          {bill.is_fixed && <Lock size={10} className="text-amber-400 flex-shrink-0" title="Fixo — renova todo mês"/>}
          {fromPlan && <Link size={10} className="text-emerald-700 flex-shrink-0" title="Gerado pelo Planejamento"/>}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className={`text-xs font-medium ${st.color}`}>{st.label}</span>
          {bill.recurrence && bill.recurrence !== 'none' && (
            <span className="text-xs text-gray-700">{bill.recurrence === 'monthly' ? '· Mensal' : '· Anual'}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {bill.amount > 0 && <p className="text-sm font-bold text-white mr-1">R$ {Number(bill.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>}
        {!fromPlan && <button onClick={() => onEdit(bill)} className="text-gray-600 hover:text-gray-400 p-1"><Edit2 size={14}/></button>}
        <button onClick={() => onDelete(bill)} className="text-gray-600 hover:text-red-400 p-1"><Trash2 size={14}/></button>
      </div>
    </div>
  )
}

function MonthAccordion({ monthRef, bills, onToggle, onEdit, onDelete, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const label = format(parseISO(monthRef + '-02'), "MMMM 'de' yyyy", { locale: ptBR })
  const total = bills.reduce((a, b) => a + Number(b.amount || 0), 0)
  const paid = bills.filter(b => b.is_paid).reduce((a, b) => a + Number(b.amount || 0), 0)
  const pending = bills.filter(b => !b.is_paid).length

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          {open ? <ChevronUp size={16} className="text-gray-500"/> : <ChevronDown size={16} className="text-gray-500"/>}
          <p className="font-semibold text-white capitalize">{label}</p>
          {pending > 0 && <span className="badge bg-amber-500/20 text-amber-400">{pending} pendente{pending > 1 ? 's' : ''}</span>}
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-white">R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className="text-xs text-emerald-500">R$ {paid.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} pago</p>
        </div>
      </button>
      {open && (
        <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
          {bills.map(b => <BillRow key={b.id} bill={b} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete}/>)}
        </div>
      )}
    </div>
  )
}

function ManualModal({ initial, onClose, onSaved, userId }) {
  const [form, setForm] = useState(initial?.id && !initial.budget_item_id ? { ...initial, amount: initial.amount ?? '' } : EMPTY)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!form.name.trim()) return
    setSaving(true)
    await upsertBill({ ...form, amount: parseFloat(form.amount) || 0, user_id: userId, budget_item_id: null })
    onSaved(); onClose()
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div>
          <h2 className="font-bold text-lg text-white">Lembrete manual</h2>
          <p className="text-xs text-gray-500 mt-1">Para lembretes avulsos que não precisam estar no Planejamento</p>
        </div>
        <div>
          <label className="label">Descrição</label>
          <input className="input" placeholder="Ex: Renovar CNH, Consulta médica..." value={form.name} onChange={e => set('name', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Valor (opcional)</label>
            <input className="input" type="number" step="0.01" placeholder="0,00" value={form.amount} onChange={e => set('amount', e.target.value)} />
          </div>
          <div>
            <label className="label">Data</label>
            <input className="input" type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Repetição</label>
            <select className="input" value={form.recurrence} onChange={e => set('recurrence', e.target.value)}>
              <option value="none">Não repete</option>
              <option value="monthly">Mensal</option>
              <option value="yearly">Anual</option>
            </select>
          </div>
          <div>
            <label className="label">Alertar (dias antes)</label>
            <input className="input" type="number" min={1} max={30} value={form.alert_days_before} onChange={e => set('alert_days_before', parseInt(e.target.value))} />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

export default function BillsPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState('month') // 'month' | 'all'
  const [filterPaid, setFilterPaid] = useState('all') // 'all' | 'pending' | 'paid'
  const [modal, setModal] = useState(null)
  const [tab, setTab] = useState('lembretes') // 'lembretes' | 'faturas'
  const [creditBills, setCreditBills] = useState([])
  const { user } = useAuth()

  useEffect(() => {
    if (tab === 'faturas') {
      getCreditCardBills().then(({ data }) => setCreditBills(data || []))
    }
  }, [tab])

  const monthRef = format(currentDate, 'yyyy-MM')
  const { bills, allBills, loading, refetch } = useBills(monthRef)

  // Agrupa todas as bills por month_ref para visão acordeão
  const billsByMonth = useMemo(() => {
    const grouped = {}
    allBills.forEach(b => {
      const m = b.month_ref || 'sem-data'
      if (!grouped[m]) grouped[m] = []
      grouped[m].push(b)
    })
    return Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]))
  }, [allBills])

  const filteredBills = bills.filter(b => {
    if (filterPaid === 'pending') return !b.is_paid
    if (filterPaid === 'paid') return b.is_paid
    return true
  })

  const urgentCount = bills.filter(b => {
    if (b.is_paid) return false
    return differenceInDays(parseISO(b.due_date), new Date()) <= 3
  }).length

  const monthTotal = bills.reduce((a, b) => a + Number(b.amount || 0), 0)
  const monthPaid = bills.filter(b => b.is_paid).reduce((a, b) => a + Number(b.amount || 0), 0)

  async function togglePaid(bill) {
    await markBillPaid(bill.id, !bill.is_paid)
    refetch()
  }

  async function handleDelete(bill) {
    const isLinked = bill.budget_item_id && bill.budget_items?.active === true
    if (isLinked) {
      alert(`"${bill.name}" está vinculado a um item ativo no Planejamento. Exclua o item lá — este registro (e os futuros) será removido junto automaticamente.`)
      return
    }
    if (!confirm(`Excluir "${bill.name}"?`)) return
    await deleteBill(bill.id)
    refetch()
  }

  const monthLabel = format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Agenda de pagamentos</h1>
          {urgentCount > 0 && <p className="text-xs text-amber-400 mt-0.5">⚠ {urgentCount} urgente(s) este mês</p>}
        </div>
        <div className="flex items-center gap-2">
          {tab === 'lembretes' && (
            <button onClick={() => setViewMode(v => v === 'month' ? 'all' : 'month')}
              className="btn-ghost p-2" title={viewMode === 'month' ? 'Ver todos os meses' : 'Ver por mês'}>
              {viewMode === 'month' ? <LayoutList size={16}/> : <Calendar size={16}/>}
            </button>
          )}
          <button onClick={() => setModal({})} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus size={16}/> Manual
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button onClick={() => setTab('lembretes')}
          className={`py-2 rounded-xl text-sm font-medium border ${tab === 'lembretes' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-gray-700 text-gray-400'}`}>
          Lembretes
        </button>
        <button onClick={() => setTab('faturas')}
          className={`py-2 rounded-xl text-sm font-medium border flex items-center justify-center gap-1.5 ${tab === 'faturas' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-gray-700 text-gray-400'}`}>
          <CreditCard size={14}/> Faturas de Cartão
        </button>
      </div>

      {tab === 'lembretes' && (viewMode === 'month' ? (
        <>
          {/* Navegação mensal */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => setCurrentDate(d => subMonths(d, 1))} className="p-1.5 text-gray-400 hover:text-white"><ChevronLeft size={18}/></button>
              <p className="font-semibold text-white capitalize">{monthLabel}</p>
              <button onClick={() => setCurrentDate(d => addMonths(d, 1))} className="p-1.5 text-gray-400 hover:text-white"><ChevronRight size={18}/></button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-xs text-gray-500">Total</p>
                <p className="text-sm font-bold text-white">R$ {monthTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Pago</p>
                <p className="text-sm font-bold text-emerald-400">R$ {monthPaid.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Pendente</p>
                <p className="text-sm font-bold text-amber-400">R$ {(monthTotal - monthPaid).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              </div>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex gap-2">
            {[['all','Todos'],['pending','Pendentes'],['paid','Pagos']].map(([v, l]) => (
              <button key={v} onClick={() => setFilterPaid(v)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${filterPaid === v ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-gray-700 text-gray-400'}`}>
                {l}
              </button>
            ))}
          </div>

          {/* Lista do mês */}
          {loading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="card h-16 animate-pulse bg-gray-800"/>)}</div>
          ) : (
            <div className="space-y-2">
              {filteredBills.length === 0 && (
                <div className="card text-center py-10">
                  <Bell size={28} className="text-gray-700 mx-auto mb-2"/>
                  <p className="text-gray-500 text-sm">
                    {filterPaid === 'pending' ? 'Nenhum lembrete pendente.' : filterPaid === 'paid' ? 'Nenhum pago ainda.' : 'Nenhum lembrete neste mês.'}
                  </p>
                  <p className="text-gray-600 text-xs mt-1">Adicione itens em Planejamento para gerar lembretes automáticos.</p>
                </div>
              )}
              {filteredBills.map(bill => (
                <BillRow key={bill.id} bill={bill} onToggle={togglePaid} onEdit={setModal} onDelete={handleDelete}/>
              ))}
            </div>
          )}
        </>
      ) : (
        /* Visão acordeão — todos os meses */
        <div className="space-y-3">
          {billsByMonth.length === 0 && (
            <div className="card text-center py-10">
              <p className="text-gray-500 text-sm">Nenhum lembrete cadastrado.</p>
            </div>
          )}
          {billsByMonth.map(([month, mbills]) => (
            <MonthAccordion
              key={month}
              monthRef={month}
              bills={mbills}
              onToggle={togglePaid}
              onEdit={setModal}
              onDelete={handleDelete}
              defaultOpen={month === format(new Date(), 'yyyy-MM')}
            />
          ))}
        </div>
      ))}

      {tab === 'faturas' && (
        <div className="space-y-2">
          {creditBills.length === 0 && (
            <div className="card text-center py-8 text-sm text-gray-500">Nenhuma fatura sincronizada ainda.</div>
          )}
          {creditBills.map(b => (
            <div key={b.id} className="card flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">{b.accounts?.name}</p>
                <p className="text-xs text-gray-500">Vence {b.due_date}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-white">R$ {Number(b.total_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                <p className={`text-xs font-semibold ${b.status === 'PAID' ? 'text-emerald-400' : b.status === 'PARTIAL' ? 'text-amber-400' : 'text-red-400'}`}>
                  {b.status === 'PAID' ? 'Paga' : b.status === 'PARTIAL' ? `Parcial — R$ ${Number(b.paid_amount).toFixed(2)}` : 'Aberta'}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {modal !== null && <ManualModal initial={modal} userId={user?.id} onClose={() => setModal(null)} onSaved={refetch}/>}
    </div>
  )
}
