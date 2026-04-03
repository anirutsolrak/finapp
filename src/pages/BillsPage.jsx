import { useState } from 'react'
import { format, differenceInDays, parseISO } from 'date-fns'
import { Plus, CheckCircle2, Circle, Trash2, Bell, Edit2, Lock } from 'lucide-react'
import { useBills } from '../hooks/useData'
import { upsertBill, markBillPaid, deleteBill } from '../lib/db'
import { useAuth } from '../contexts/AuthContext'

const EMPTY = { name: '', amount: '', due_date: format(new Date(), 'yyyy-MM-dd'), is_fixed: false, recurrence: 'monthly', alert_days_before: 3 }

function getBillStatus(bill) {
  if (bill.is_paid) return { label: 'Pago', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' }
  const days = differenceInDays(parseISO(bill.due_date), new Date())
  if (days < 0) return { label: `Vencida há ${Math.abs(days)}d`, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' }
  if (days === 0) return { label: 'Vence hoje!', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' }
  if (days <= 3) return { label: `Vence em ${days}d`, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' }
  return { label: `Vence em ${days}d`, color: 'text-gray-400', bg: 'bg-gray-800 border-gray-700' }
}

function BillModal({ initial, onClose, onSaved, userId }) {
  const [form, setForm] = useState(initial?.id ? initial : EMPTY)
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    if (!form.name || !form.due_date) return
    setSaving(true)
    await upsertBill({ ...form, amount: parseFloat(form.amount) || 0, user_id: userId })
    onSaved(); onClose()
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-lg text-white">{form.id ? 'Editar' : 'Nova'} Conta</h2>

        <div>
          <label className="label">Nome da conta</label>
          <input className="input" placeholder="Ex: Aluguel, Internet..." value={form.name} onChange={e => set('name', e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Valor (R$)</label>
            <input className="input" type="number" step="0.01" placeholder="0,00" value={form.amount} onChange={e => set('amount', e.target.value)} />
          </div>
          <div>
            <label className="label">Vencimento</label>
            <input className="input" type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
          </div>
        </div>

        <div>
          <label className="label">Recorrência</label>
          <select className="input" value={form.recurrence} onChange={e => set('recurrence', e.target.value)}>
            <option value="monthly">Mensal</option>
            <option value="yearly">Anual</option>
            <option value="once">Única vez</option>
            <option value="none">Sem recorrência</option>
          </select>
        </div>

        <div>
          <label className="label">Alertar com antecedência (dias)</label>
          <input className="input" type="number" min={1} max={30} value={form.alert_days_before} onChange={e => set('alert_days_before', parseInt(e.target.value))} />
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="fixed" checked={form.is_fixed} onChange={e => set('is_fixed', e.target.checked)} className="accent-amber-500 w-4 h-4"/>
          <label htmlFor="fixed" className="text-sm text-gray-300">Conta fixa (não pode ser removida do orçamento)</label>
        </div>

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

export default function BillsPage() {
  const { bills, loading, refetch } = useBills()
  const { user } = useAuth()
  const [modal, setModal] = useState(null)
  const [filter, setFilter] = useState('pending')

  const filtered = filter === 'all' ? bills : filter === 'pending' ? bills.filter(b => !b.is_paid) : bills.filter(b => b.is_paid)

  const alertCount = bills.filter(b => {
    if (b.is_paid) return false
    const d = differenceInDays(parseISO(b.due_date), new Date())
    return d <= 3
  }).length

  async function togglePaid(bill) {
    await markBillPaid(bill.id, !bill.is_paid)
    refetch()
  }

  async function handleDelete(bill) {
    if (bill.is_fixed && !confirm(`"${bill.name}" é uma conta fixa. Confirma a exclusão?`)) return
    if (!bill.is_fixed && !confirm(`Excluir "${bill.name}"?`)) return
    await deleteBill(bill.id)
    refetch()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Contas & Vencimentos</h1>
          {alertCount > 0 && (
            <p className="text-xs text-amber-400 flex items-center gap-1 mt-0.5">
              <Bell size={12}/> {alertCount} conta(s) vencendo em breve
            </p>
          )}
        </div>
        <button onClick={() => setModal({})} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={16}/> Nova
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {[['pending','Pendentes'],['paid','Pagas'],['all','Todas']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${filter === v ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-gray-700 text-gray-400'}`}>
            {l}
          </button>
        ))}
      </div>

      {loading ? <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="card h-20 animate-pulse bg-gray-800"/>)}</div> : (
        <div className="space-y-2">
          {filtered.length === 0 && (
            <div className="card text-center py-10">
              <p className="text-gray-500 text-sm">Nenhuma conta {filter === 'pending' ? 'pendente' : filter === 'paid' ? 'paga' : ''} encontrada.</p>
            </div>
          )}
          {filtered.map(bill => {
            const status = getBillStatus(bill)
            return (
              <div key={bill.id} className={`card flex items-center gap-3 border animate-in ${status.bg}`}>
                <button onClick={() => togglePaid(bill)} className={`flex-shrink-0 transition-colors ${bill.is_paid ? 'text-emerald-400' : 'text-gray-600 hover:text-emerald-400'}`}>
                  {bill.is_paid ? <CheckCircle2 size={22}/> : <Circle size={22}/>}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium ${bill.is_paid ? 'text-gray-500 line-through' : 'text-white'}`}>{bill.name}</p>
                    {bill.is_fixed && <Lock size={11} className="text-amber-400 flex-shrink-0"/>}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className={`text-xs font-medium ${status.color}`}>{status.label}</p>
                    <span className="text-xs text-gray-600">•</span>
                    <span className="text-xs text-gray-500 capitalize">{bill.recurrence === 'monthly' ? 'Mensal' : bill.recurrence === 'yearly' ? 'Anual' : 'Única'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <p className="text-sm font-bold text-white">R$ {Number(bill.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  <button onClick={() => setModal(bill)} className="text-gray-600 hover:text-gray-400 p-1"><Edit2 size={14}/></button>
                  <button onClick={() => handleDelete(bill)} className="text-gray-600 hover:text-red-400 p-1"><Trash2 size={14}/></button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modal !== null && <BillModal initial={modal} userId={user?.id} onClose={() => setModal(null)} onSaved={refetch}/>}
    </div>
  )
}
