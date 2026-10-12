// ═══════════════════════════════════════════════════════════════════════════
// useData — hooks de dados do app. Cada hook carrega de src/lib/db e assina
// Realtime (postgres_changes): qualquer mutação refaz o fetch automaticamente.
// É aqui que se mexe pra mudar O QUE cada tela carrega.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react'
import * as db from '../lib/db'
import { supabase } from '../lib/supabase'
import { useDateRange } from '../contexts/DateRangeContext'

export function useTransactions() {
  const { range } = useDateRange()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!range) return
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

// Visão per-período de um item: nome, valor e dia vêm da bill do mês quando ela existe;
// sem bill, valem os do template. É o que o modal grava, então é o que a tela precisa ler.
export function overlayBill(item, bill) {
  if (!bill) return { ...item, bill: null }
  return { ...item, name: bill.name, planned_amount: bill.amount, due_day: Number(bill.due_date.slice(8, 10)), bill }
}

// Carrega budget_items + bills de UM month_ref (período em foco no Planejamento),
// joinados no client. Cada item ganha .bill (a bill daquele month_ref, se existir).
// Per-período: o month_ref vem do seletor da tela, não do range global.
export function useBudget(monthRef) {
  const [data, setData] = useState({ items: [], bills: [], categories: [], accounts: [] })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!monthRef) return
    const [{ data: items }, { data: bills }, { data: cats }, { data: accts }] = await Promise.all([
      db.getBudgetItems(),
      db.getBillsByMonthRef(monthRef),
      db.getCategories(),
      db.getAccounts(),
    ])
    // Join 1:1 — unique constraint (budget_item_id, month_ref) garante no máx. 1 bill por item.
    const billByItemId = new Map((bills || []).map(b => [b.budget_item_id, b]))
    const itemsWithBill = (items || []).map(i => overlayBill(i, billByItemId.get(i.id)))
    setData({ items: itemsWithBill, bills: bills || [], categories: cats || [], accounts: accts || [] })
    setLoading(false)
  }, [monthRef])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('budget-unified')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_items' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { ...data, loading, refetch: load }
}

