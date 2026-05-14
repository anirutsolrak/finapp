import { supabase } from './supabase'
import { format, subMonths } from 'date-fns'
import { computeBucketSnapshot, computeReservaSnapshot } from './budgetEngine'

// ─── CATEGORIES ─────────────────────────────────────────────────────────────
export const getCategories = () =>
  supabase.from('categories').select('*').order('sort_order')

// ─── BUDGET ITEMS ────────────────────────────────────────────────────────────
export const getBudgetItems = () =>
  supabase.from('budget_items').select('*, categories(*)').eq('active', true).order('created_at')

export const upsertBudgetItem = (item) => {
  const { categories, ...data } = item
  if (data.id) {
    return supabase.from('budget_items').update(data).eq('id', data.id).select().single()
  }
  return supabase.from('budget_items').insert(data).select().single()
}

export const deleteBudgetItem = async (id) => {
  // Cascade: apaga lembretes (bills) que espelham este item — não faz sentido manter o aviso sem o planejamento.
  await supabase.from('bills').delete().eq('budget_item_id', id)
  return supabase.from('budget_items').update({ active: false }).eq('id', id)
}

// ─── TRANSACTIONS ────────────────────────────────────────────────────────────
export const getTransactions = (monthRef) => {
  let q = supabase
    .from('transactions')
    .select('*, categories(*), budget_items(name)')
    .order('date', { ascending: false })
  if (monthRef) q = q.eq('month_ref', monthRef)
  return q
}

export const getTransactionsByRange = (startDate, endDate) =>
  supabase
    .from('transactions')
    .select('*, categories(*), budget_items(name)')
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: false })

const withMonthRef = (data) => {
  if (!data.month_ref && data.date) return { ...data, month_ref: String(data.date).slice(0, 7) }
  return data
}

export const addTransaction = (tx) => {
  const { categories, budget_items, ...data } = tx
  return supabase.from('transactions').insert(withMonthRef(data)).select().single()
}

export const updateTransaction = (id, tx) => {
  const { categories, budget_items, ...data } = tx
  return supabase.from('transactions').update(withMonthRef(data)).eq('id', id).select().single()
}

export const deleteTransaction = async (id) => {
  await supabase.schema('todo').from('items')
    .update({ imported_at: null })
    .eq('finapp_transaction_id', id)
  return supabase.from('transactions').delete().eq('id', id)
}

// ─── BILLS ──────────────────────────────────────────────────────────────────
// budget_items(active, payment_source) permite detectar vínculos órfãos (item deletado no Planejamento)
export const getBills = (monthRef) => {
  let q = supabase.from('bills').select('*, budget_items(active, payment_source)').order('due_date')
  if (monthRef) q = q.eq('month_ref', monthRef)
  return q
}

export const getAllBills = () =>
  supabase.from('bills').select('*, budget_items(active, payment_source)').order('month_ref', { ascending: false }).order('due_date')

export const getUpcomingBills = (days = 7) => {
  const today = format(new Date(), 'yyyy-MM-dd')
  const future = format(new Date(Date.now() + days * 86400000), 'yyyy-MM-dd')
  return supabase.from('bills').select('*, budget_items(active, payment_source)').gte('due_date', today).lte('due_date', future).eq('is_paid', false).order('due_date')
}

export const upsertBill = (bill) => {
  const { budget_items, ...data } = bill
  if (data.id) {
    return supabase.from('bills').update(data).eq('id', data.id).select().single()
  }
  return supabase.from('bills').insert(data).select().single()
}

export const markBillPaid = (id, paid = true) =>
  supabase.from('bills').update({ is_paid: paid }).eq('id', id)

export const deleteBill = (id) =>
  supabase.from('bills').delete().eq('id', id)

// ─── GOALS ──────────────────────────────────────────────────────────────────
export const getGoals = () =>
  supabase.from('goals').select('*').order('priority')

export const upsertGoal = (goal) => {
  if (goal.id) {
    return supabase.from('goals').update(goal).eq('id', goal.id).select().single()
  }
  return supabase.from('goals').insert(goal).select().single()
}

export const deleteGoal = (id) =>
  supabase.from('goals').delete().eq('id', id)

// ─── CHAT ────────────────────────────────────────────────────────────────────
export const getChatMessages = (userId, limit = 50) =>
  supabase.from('chat_messages').select('*').eq('user_id', userId).order('created_at').limit(limit)

export const saveChatMessage = (msg) =>
  supabase.from('chat_messages').insert(msg).select().single()

export const clearChat = (userId) =>
  supabase.from('chat_messages').delete().eq('user_id', userId)

// ─── BUDGET CYCLES ───────────────────────────────────────────────────────────
export const getBudgetCycle = async (monthRef) => {
  const { data } = await supabase.from('budget_cycles').select('*').eq('month_ref', monthRef).maybeSingle()
  return data
}

export const upsertBudgetCycle = async (cycle) => {
  if (cycle.id) return supabase.from('budget_cycles').update({ ...cycle, updated_at: new Date().toISOString() }).eq('id', cycle.id).select().single()
  // Novo ciclo: puxa reserva acumulada do mês anterior se não veio explícita
  const payload = { ...cycle }
  if (payload.reserva_acumulada == null) {
    payload.reserva_acumulada = await computeRolloverReserva(payload.month_ref)
  }
  return supabase.from('budget_cycles').insert(payload).select().single()
}

// Saldo final de reserva de um ciclo = acumulada + aporte − usado (não negativo)
export const computeRolloverReserva = async (monthRef) => {
  if (!monthRef) return 0
  const prevMonth = format(subMonths(new Date(monthRef + '-01'), 1), 'yyyy-MM')
  const prevCycle = await getBudgetCycle(prevMonth)
  if (!prevCycle) return 0
  const { data: prevTxs } = await getTransactions(prevMonth)
  const snap = computeReservaSnapshot({ cycle: prevCycle, transactions: prevTxs || [] })
  return snap.disponivel
}

// ─── CONTEXT SNAPSHOT FOR AI ─────────────────────────────────────────────────
export const getAIContext = async () => {
  const monthRef = format(new Date(), 'yyyy-MM')
  const [{ data: items }, { data: txs }, { data: goals }, { data: upcoming }, { data: monthBills }, cycle] = await Promise.all([
    getBudgetItems(),
    getTransactions(monthRef),
    getGoals(),
    getUpcomingBills(10),
    getBills(monthRef),
    getBudgetCycle(monthRef),
  ])
  const incomeSnapshot = computeBucketSnapshot({ bucket: 'income', cycle, items: items || [], transactions: txs || [], bills: monthBills || [] })
  const creditSnapshot = computeBucketSnapshot({ bucket: 'credit', cycle, items: items || [], transactions: txs || [], bills: monthBills || [] })
  const reservaSnapshot = computeReservaSnapshot({ cycle, transactions: txs || [] })
  return {
    monthRef,
    budgetItems: items,
    transactions: txs,
    goals,
    upcomingBills: upcoming,
    bills: monthBills,
    cycle,
    incomeSnapshot,
    creditSnapshot,
    reservaSnapshot,
  }
}