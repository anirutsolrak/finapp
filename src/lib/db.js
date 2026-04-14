import { supabase } from './supabase'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { computeFreeBalance } from './goalPlanner'

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

export const deleteBudgetItem = (id) =>
  supabase.from('budget_items').update({ active: false }).eq('id', id)

// ─── TRANSACTIONS ────────────────────────────────────────────────────────────
export const getTransactions = (monthRef) => {
  let q = supabase
    .from('transactions')
    .select('*, categories(*), budget_items(name)')
    .order('date', { ascending: false })
  if (monthRef) q = q.eq('month_ref', monthRef)
  return q
}

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

export const deleteTransaction = (id) =>
  supabase.from('transactions').delete().eq('id', id)

// ─── BILLS ──────────────────────────────────────────────────────────────────
export const getBills = (monthRef) => {
  let q = supabase.from('bills').select('*').order('due_date')
  if (monthRef) q = q.eq('month_ref', monthRef)
  return q
}

export const getAllBills = () =>
  supabase.from('bills').select('*').order('month_ref', { ascending: false }).order('due_date')

export const getUpcomingBills = (days = 7) => {
  const today = format(new Date(), 'yyyy-MM-dd')
  const future = format(new Date(Date.now() + days * 86400000), 'yyyy-MM-dd')
  return supabase.from('bills').select('*').gte('due_date', today).lte('due_date', future).eq('is_paid', false).order('due_date')
}

export const upsertBill = (bill) => {
  if (bill.id) {
    return supabase.from('bills').update(bill).eq('id', bill.id).select().single()
  }
  return supabase.from('bills').insert(bill).select().single()
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

// ─── DASHBOARD SUMMARY ───────────────────────────────────────────────────────
export const getMonthSummary = async (monthRef) => {
  const { data: txs } = await supabase.from('transactions').select('amount,type,categories(type)').eq('month_ref', monthRef)
  if (!txs) return {}
  const sum = (type) => txs.filter(t => t.categories?.type === type || t.type === type).reduce((a, t) => a + Number(t.amount), 0)
  return {
    income: sum('income'),
    essential: sum('essential'),
    variable: sum('variable'),
    investment: sum('investment'),
    installment: sum('installment'),
    reserve: sum('reserve'),
    total_expenses: txs.filter(t => t.type === 'expense').reduce((a, t) => a + Number(t.amount), 0),
  }
}

// ─── CONTEXT SNAPSHOT FOR AI ─────────────────────────────────────────────────
export const getAIContext = async () => {
  const monthRef = format(new Date(), 'yyyy-MM')
  const [{ data: items }, { data: txs }, { data: goals }, { data: bills }] = await Promise.all([
    getBudgetItems(),
    getTransactions(monthRef),
    getGoals(),
    getUpcomingBills(10),
  ])
  const freeBalance = computeFreeBalance(items || [])
  return { monthRef, budgetItems: items, transactions: txs, goals, upcomingBills: bills, freeBalance }
}