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
    const [summary, { data: bills }, { data: goals }, { data: items }] = await Promise.all([
      db.getMonthSummary(monthRef),
      db.getUpcomingBills(7),
      db.getGoals(),
      db.getBudgetItems(),
    ])
    setData({ summary, bills, goals, budgetItems: items })
    setLoading(false)
  }, [monthRef])

  useEffect(() => { load() }, [load])

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, load)
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
  return { items, categories, loading, refetch: load }
}
