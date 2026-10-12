// ═══════════════════════════════════════════════════════════════════════════
// PlanningPage — a tela principal. Um mês em foco: o plano (contas a pagar) e
// os lançamentos daquele mês, lado a lado. Pagar uma conta gera o lançamento;
// importar o extrato completa e concilia o resto.
// Estrutura: helpers de mês → página (dados, pagamento em lote, layout).
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect } from 'react'
import { format, addMonths, endOfMonth, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, Upload, ChevronLeft, ChevronRight } from 'lucide-react'
import { useBudget, useTransactions, useAccountTransactions, useGoals } from '../hooks/useData'
import { unpayBill, payBill, createBillForPeriod, markBillsPaid, deleteTransaction } from '../lib/db'
import { bucketOf } from '../lib/budgetEngine'
import { useAuth } from '../contexts/AuthContext'
import { useSelection } from '../contexts/SelectionContext'
import MonthSummary from '../components/planning/MonthSummary'
import GoalCards from '../components/goals/GoalCards'
import BucketSection from '../components/planning/BucketSection'
import TemplatesSection from '../components/planning/TemplatesSection'
import ItemModal from '../components/planning/ItemModal'
import SelectionPopup from '../components/planning/SelectionPopup'
import ConfirmPayDialog from '../components/planning/ConfirmPayDialog'
import TransactionList from '../components/TransactionList'
import TxModal from '../components/TxModal'
import CSVImporterModal from '../components/CSVImporterModal'

const thisMonth = () => format(new Date(), 'yyyy-MM')
const shiftMonth = (monthRef, n) => format(addMonths(parseISO(`${monthRef}-01`), n), 'yyyy-MM')
const FILTERS = [['all', 'Todas'], ['pending', 'Pendentes'], ['paid', 'Pagas']]

export default function PlanningPage() {
  const { user } = useAuth()
  const { setActive } = useSelection()
  const [monthRef, setMonthRef] = useState(thisMonth)
  const startDate = `${monthRef}-01`
  const endDate = format(endOfMonth(parseISO(startDate)), 'yyyy-MM-dd')

  const { items, categories, accounts, loading, refetch } = useBudget(monthRef)
  const { transactions, loading: txLoading, refetch: refetchTx } = useTransactions(startDate, endDate)
  const { transactions: accountTxs, refetch: refetchAccountTxs } = useAccountTransactions()
  const { goals, refetch: refetchGoals } = useGoals()

  const [filter, setFilter] = useState('all')
  const [editingItem, setEditingItem] = useState(null)
  const [editingTx, setEditingTx] = useState(null)
  const [importerOpen, setImporterOpen] = useState(false)
  const [selected, setSelected] = useState(new Set())
  const [confirming, setConfirming] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [dialogError, setDialogError] = useState('')

  // Não depende do Realtime estar ligado no projeto: toda mutação recarrega as fontes da tela.
  const refreshAll = () => { refetch(); refetchTx(); refetchAccountTxs(); refetchGoals() }
  const activeGoals = goals.filter(g => !g.is_completed)

  // O plano do mês = itens COM conta (bill) no mês em foco. Dos demais, só os recorrentes são
  // oferecidos pra puxar: item único (once) pertence ao mês em que foi criado.
  const inMonth = items.filter(i => i.bill)
  const templates = items.filter(i => !i.bill && i.recurrence !== 'once')
  const shown = inMonth.filter(i => filter === 'all' || (filter === 'paid') === !!i.bill.is_paid)
  const byBucket = {
    account: shown.filter(i => bucketOf(i.payment_source) !== 'credit' && i.recurrence !== 'once'),
    credit: shown.filter(i => bucketOf(i.payment_source) === 'credit' && i.recurrence !== 'once'),
    once: shown.filter(i => i.recurrence === 'once'),
  }

  // Seleção ativa esconde a barra inferior no celular (ver SelectionContext).
  useEffect(() => { setActive(selected.size > 0) }, [selected.size, setActive])
  useEffect(() => () => setActive(false), [setActive])

  const selectedItems = inMonth.filter(i => selected.has(i.bill.id))
  const selectedTotal = selectedItems.reduce((a, i) => a + Number(i.bill.amount || 0), 0)
  const clearSelection = () => setSelected(new Set())

  function changeMonth(n) {
    setMonthRef(m => n === 0 ? thisMonth() : shiftMonth(m, n))
    clearSelection()
  }

  function toggleSelect(item) {
    if (!item.bill) return
    setSelected(prev => {
      const next = new Set(prev)
      if (!next.delete(item.bill.id)) next.add(item.bill.id)
      return next
    })
  }

  async function handleUnpay(item) {
    if (!confirm(`Desmarcar "${item.name}" como pago? O lançamento vinculado será removido.`)) return
    const { error } = await unpayBill(item.bill.id)
    if (error) alert('Falha ao desmarcar: ' + error.message)
    refreshAll()
  }

  async function addToMonth(item) {
    const { error } = await createBillForPeriod({ item, monthRef })
    if (error) alert('Falha ao adicionar: ' + error.message)
    refreshAll()
  }

  // Lançamento que paga uma conta do plano: excluir reabre a conta (mantém plano e extrato coerentes).
  async function handleDeleteTx(tx) {
    const msg = tx.bill_id
      ? `"${tx.description}" paga uma conta do plano. Excluir o lançamento e reabrir a conta?`
      : `Excluir "${tx.description}"?`
    if (!confirm(msg)) return
    const { error } = tx.bill_id ? await unpayBill(tx.bill_id) : await deleteTransaction(tx.id)
    if (error) alert('Falha ao excluir: ' + error.message)
    refreshAll()
  }

  function closePayDialog() {
    setConfirming(false); setDialogError(''); setSubmitting(false)
  }

  // "Já está no extrato": só marca como pago, sem criar lançamento.
  async function confirmAlreadyImported() {
    setSubmitting(true); setDialogError('')
    const { error } = await markBillsPaid([...selected])
    if (error) { setSubmitting(false); return setDialogError(error.message || 'Falha ao atualizar as contas.') }
    clearSelection(); closePayDialog(); refreshAll()
  }

  // "Lançar agora": cria a despesa de cada conta na conta default do item.
  async function confirmPayNow() {
    setSubmitting(true); setDialogError('')
    const toPay = selectedItems.filter(i => !i.bill.is_paid)
    const missing = toPay
      .filter(i => !accounts.some(a => a.id === i.default_account_id && a.is_active !== false))
      .map(i => i.name)
    if (missing.length > 0) {
      setSubmitting(false)
      return setDialogError('Estes itens precisam de conta default antes:\n  • ' + missing.join('\n  • ') + '\nEdite cada um (lápis) e tente de novo.')
    }
    const today = format(new Date(), 'yyyy-MM-dd')
    const results = await Promise.all(toPay.map(i => payBill({
      billId: i.bill.id, accountId: i.default_account_id, amount: i.bill.amount,
      date: today, paymentSource: i.payment_source, categoryId: i.category_id, budgetItemId: i.id,
    })))
    const failed = results.filter(r => r.error).length
    refreshAll()
    if (failed > 0) { setSubmitting(false); return setDialogError(`${failed} de ${toPay.length} falharam. Mantive selecionados pra tentar de novo.`) }
    clearSelection(); closePayDialog()
  }

  const bucketProps = { selected, onToggleSelect: toggleSelect, onUnpay: handleUnpay, onEdit: setEditingItem }

  return (
    <div className="space-y-6">
      {/* Mês em foco + ações */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button onClick={() => changeMonth(-1)} className="p-2 rounded-xl text-gray-400 hover:bg-gray-800" aria-label="Mês anterior"><ChevronLeft size={20}/></button>
          <h1 className="text-xl font-bold text-white first-letter:uppercase text-center min-w-[11rem]">
            {format(parseISO(startDate), "MMMM 'de' yyyy", { locale: ptBR })}
          </h1>
          <button onClick={() => changeMonth(1)} className="p-2 rounded-xl text-gray-400 hover:bg-gray-800" aria-label="Próximo mês"><ChevronRight size={20}/></button>
          {monthRef !== thisMonth() && (
            <button onClick={() => changeMonth(0)} className="text-sm font-medium text-brand-400 px-2 py-1">Hoje</button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setImporterOpen(true)} className="btn-ghost flex items-center gap-1.5 text-sm">
            <Upload size={16}/> Importar extrato
          </button>
          {/* Fora do mês atual, o lançamento novo nasce no mês que está na tela. */}
          <button onClick={() => setEditingTx(monthRef === thisMonth() ? {} : { date: startDate })} className="btn-primary flex items-center gap-1.5 text-sm">
            <Plus size={16}/> Lançamento
          </button>
        </div>
      </div>

      <MonthSummary items={inMonth} transactions={transactions} accounts={accounts} accountTransactions={accountTxs}/>

      {/* Metas: sempre à vista, com guardar/pagar a dois toques */}
      {activeGoals.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-bold text-white">Metas</h2>
          <GoalCards goals={activeGoals} accounts={accounts} userId={user?.id} onChanged={refreshAll}/>
        </section>
      )}

      {/* Plano do mês */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-base font-bold text-white">Plano do mês</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {FILTERS.map(([v, label]) => (
              <button key={v} onClick={() => setFilter(v)} aria-pressed={filter === v}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border ${filter === v ? 'bg-brand-500/20 border-brand-500 text-brand-400' : 'border-gray-700 text-gray-400'}`}>
                {label}
              </button>
            ))}
            <button onClick={() => setEditingItem({})} className="btn-ghost flex items-center gap-1 text-sm py-1.5">
              <Plus size={15}/> Conta
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="card h-20 animate-pulse bg-gray-800"/>)}</div>
        ) : (
          <>
            {inMonth.length === 0 && (
              <div className="card text-center py-8">
                <p className="text-gray-500 text-sm">Nenhuma conta planejada para este mês.</p>
                <button onClick={() => setEditingItem({})} className="text-brand-400 text-sm font-medium mt-2">+ Planejar a primeira conta</button>
              </div>
            )}
            <BucketSection label="Da conta" items={byBucket.account} {...bucketProps}/>
            <BucketSection label="No cartão" items={byBucket.credit} {...bucketProps}/>
            <BucketSection label="Únicos" items={byBucket.once} {...bucketProps} defaultOpen={false}/>
            <TemplatesSection items={templates} onAdd={addToMonth} onEdit={setEditingItem}/>
          </>
        )}
      </section>

      {/* Lançamentos do mês */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-white">
          Lançamentos <span className="text-sm font-normal text-gray-500">{transactions.length}</span>
        </h2>
        <TransactionList transactions={transactions} accounts={accounts} goals={goals} loading={txLoading} onEdit={setEditingTx} onDelete={handleDeleteTx}/>
      </section>

      {editingItem !== null && (
        <ItemModal initial={editingItem} categories={categories} accounts={accounts} monthRef={monthRef}
          onClose={() => setEditingItem(null)} onSaved={refreshAll}/>
      )}
      {editingTx !== null && (
        <TxModal initial={editingTx} categories={categories} userId={user?.id} goals={goals} accounts={accounts}
          onClose={() => setEditingTx(null)} onSaved={refreshAll}/>
      )}
      <CSVImporterModal open={importerOpen} accounts={accounts} userId={user?.id}
        onClose={() => setImporterOpen(false)} onSaved={refreshAll}/>
      <SelectionPopup count={selected.size} total={selectedTotal} onClear={clearSelection}
        onConfirm={() => setConfirming(true)} disabled={submitting}/>
      {confirming && (
        <ConfirmPayDialog items={selectedItems} onAlreadyImported={confirmAlreadyImported} onPayNow={confirmPayNow}
          onCancel={closePayDialog} submitting={submitting} error={dialogError}/>
      )}
    </div>
  )
}
