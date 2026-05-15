import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import * as db from '../lib/db'
import { supabase } from '../lib/supabase'

export function useMonthRef() {
  const [monthRef, setMonthRef] = useState(format(new Date(), 'yyyy-MM'))
  return { monthRef, setMonthRef }
}

export function useDashboard(monthRef) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: bills }, { data: goals }, { data: items }, cycle, { data: txs }] = await Promise.all([
      db.getBills(monthRef),
      db.getGoals(),
      db.getBudgetItems(),
      db.getBudgetCycle(monthRef),
      db.getTransactions(monthRef),
    ])
    setData({ bills, goals, budgetItems: items, cycle, transactions: txs })
    setLoading(false)
  }, [monthRef])

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

export function useTransactions(monthRef) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await db.getTransactions(monthRef)
    setTransactions(data || [])
    setLoading(false)
  }, [monthRef])

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

export function useBills(monthRef) {
  const [bills, setBills] = useState([])
  const [allBills, setAllBills] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: monthly }, { data: all }] = await Promise.all([
      db.getBills(monthRef),
      db.getAllBills(),
    ])
    setBills(monthly || [])
    setAllBills(all || [])
    setLoading(false)
  }, [monthRef])

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

export function useBudgetCycle(monthRef) {
  const [cycle, setCycle] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const c = await db.getBudgetCycle(monthRef)
    setCycle(c || null)
    setLoading(false)
  }, [monthRef])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('cycles').on('postgres_changes', { event: '*', schema: 'public', table: 'budget_cycles' }, load).subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { cycle, loading, refetch: load }
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
