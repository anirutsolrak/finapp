import { useState, useEffect, useCallback, useMemo } from 'react'
import * as db from '../lib/db'
import { supabase } from '../lib/supabase'
import { computeAccountsGroupSnapshot } from '../lib/budgetEngine'
import { useDateRange } from '../contexts/DateRangeContext'

export function useDashboard() {
  const { range, cycles } = useDateRange()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!range) return
    setLoading(true)
    const [{ data: bills }, { data: goals }, { data: items }, { data: txs }] = await Promise.all([
      db.getBillsByRange(range.startDate, range.endDate),
      db.getGoals(),
      db.getBudgetItems(),
      db.getTransactionsByRange(range.startDate, range.endDate),
    ])
    const cycle = (cycles || []).find(c =>
      c.start_date === range.startDate && c.end_date === range.endDate
    ) || null
    setData({ bills, goals, budgetItems: items, cycle, transactions: txs })
    setLoading(false)
  }, [range, cycles])

  useEffect(() => { load() }, [load])

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_items' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_cycles' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { data, loading, refetch: load }
}

export function useTransactions() {
  const { range } = useDateRange()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!range) return
    setLoading(true)
    const { data } = await db.getTransactionsByRange(range.startDate, range.endDate)
    setTransactions(data || [])
    setLoading(false)
  }, [range])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('tx').on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, load).subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { transactions, loading, refetch: load }
}

export function useTransactionsByCycle(startDate, endDate) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!startDate || !endDate) {
      setTransactions([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await db.getTransactionsByRange(startDate, endDate)
    setTransactions(data || [])
    setLoading(false)
  }, [startDate, endDate])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('tx-cycle').on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, load).subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { transactions, loading, refetch: load }
}

export function useCycles() {
  const [cycles, setCycles] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('budget_cycles').select('*').order('start_date', { ascending: false })
    setCycles(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('cycles-list').on('postgres_changes', { event: '*', schema: 'public', table: 'budget_cycles' }, load).subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { cycles, loading, refetch: load }
}

export function useBills() {
  const { range } = useDateRange()
  const [bills, setBills] = useState([])
  const [allBills, setAllBills] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!range) return
    setLoading(true)
    const [{ data: ranged }, { data: all }] = await Promise.all([
      db.getBillsByRange(range.startDate, range.endDate),
      db.getAllBills(),
    ])
    setBills(ranged || [])
    setAllBills(all || [])
    setLoading(false)
  }, [range])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('bills').on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, load).subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { bills, allBills, loading, refetch: load }
}

export function useGoals() {
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await db.getGoals()
    setGoals(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  return { goals, loading, refetch: load }
}

export function useBudgetItems() {
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: its }, { data: cats }] = await Promise.all([db.getBudgetItems(), db.getCategories()])
    setItems(its || [])
    setCategories(cats || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('budget_items').on('postgres_changes', { event: '*', schema: 'public', table: 'budget_items' }, load).subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { items, categories, loading, refetch: load }
}

export function useBudgetCycle() {
  const { range, cycles } = useDateRange()
  const cycle = (cycles || []).find(c =>
    c.start_date === range?.startDate && c.end_date === range?.endDate
  ) || null
  return { cycle, loading: !range, refetch: () => {} }
}

export function useGoalLinkedTransactions() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('transactions')
      .select('id, amount, type, date, goal_id')
      .not('goal_id', 'is', null)
    setTransactions(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('tx-goals').on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, load).subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { transactions, loading, refetch: load }
}

export function useAccounts() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await db.getAccounts()
    setAccounts(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('accounts').on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, load).subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { accounts, loading, refetch: load }
}

// Agrega snapshots por grupo (banks / cards / loans / envelope) a partir de transactions.
// Recebe accounts como argumento (caller faz useAccounts uma única vez) pra evitar
// double-subscribe no canal realtime 'accounts'.
export function useAccountSnapshots(transactions = [], accounts = []) {
  return useMemo(() => ({
    banks: computeAccountsGroupSnapshot({
      accounts,
      transactions,
      filter: a => a.type === 'bank',
    }),
    cards: computeAccountsGroupSnapshot({
      accounts,
      transactions,
      filter: a => a.type === 'credit' && a.subtype === 'credit_card',
    }),
    loans: computeAccountsGroupSnapshot({
      accounts,
      transactions,
      filter: a => a.type === 'credit' && a.subtype === 'loan',
    }),
    envelope: computeAccountsGroupSnapshot({
      accounts,
      transactions,
      filter: a => a.type === 'envelope',
    }),
  }), [accounts, transactions])
}

