// ═══════════════════════════════════════════════════════════════════════════
// useData — hooks de dados do app. Cada hook carrega de src/lib/db ao montar e
// recarrega quando o app volta a ficar visível; as telas chamam `refetch` depois
// de cada mutação. É aqui que se mexe pra mudar O QUE cada tela carrega.
// ═══════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react'
import * as db from '../lib/db'
import { supabase } from '../lib/supabase'
import { goalProgress } from '../lib/goals'

// Carrega ao montar (e quando `load` muda) e de novo quando o app volta a ficar visível
// (trocar de aba, reabrir o PWA): é o que mantém os dois aparelhos da família em dia.
// `load` recebe isCurrent(): falso quando a resposta chega depois de o hook já ter mudado
// de período, pra uma resposta atrasada do mês anterior não sobrescrever a tela.
// shortcut: sem Realtime (as tabelas do app não estão na publication do Supabase, e o cliente
// reaproveita canal de mesmo nome ao reassinar). Ligar se precisar de atualização ao vivo.
function useAutoLoad(load) {
  useEffect(() => {
    let current = true
    const run = () => load(() => current)
    const onVisible = () => { if (document.visibilityState === 'visible') run() }
    run()
    document.addEventListener('visibilitychange', onVisible)
    return () => { current = false; document.removeEventListener('visibilitychange', onVisible) }
  }, [load])
}

const always = () => true

// Lançamentos com data entre startDate e endDate (inclusive).
export function useTransactions(startDate, endDate) {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (isCurrent = always) => {
    const { data } = startDate && endDate ? await db.getTransactionsByRange(startDate, endDate) : { data: [] }
    if (!isCurrent()) return
    setTransactions(data || [])
    setLoading(false)
  }, [startDate, endDate])

  useAutoLoad(load)
  return { transactions, loading, refetch: load }
}

// Metas já com o progresso calculado (goal.progress), a partir dos lançamentos vinculados.
export function useGoals() {
  const [goals, setGoals] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [{ data: gs }, { data: txs }] = await Promise.all([
      db.getGoals(),
      supabase.from('transactions').select('id, amount, type, goal_id').not('goal_id', 'is', null),
    ])
    setGoals((gs || []).map(g => ({ ...g, progress: goalProgress(g, txs || []) })))
    setLoading(false)
  }, [])

  useAutoLoad(load)
  return { goals, loading, refetch: load }
}

// Histórico inteiro de lançamentos ligados a contas — base do saldo por conta.
export function useAccountTransactions() {
  const [transactions, setTransactions] = useState([])

  const load = useCallback(async () => {
    const { data } = await db.getAccountTransactions()
    setTransactions(data || [])
  }, [])

  useAutoLoad(load)
  return { transactions, refetch: load }
}

export function useAccounts() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data } = await db.getAccounts()
    setAccounts(data || [])
    setLoading(false)
  }, [])

  useAutoLoad(load)
  return { accounts, loading, refetch: load }
}

// Visão per-período de um item: nome, valor e dia vêm da bill do mês quando ela existe;
// sem bill, valem os do template. É o que o modal grava, então é o que a tela precisa ler.
export function overlayBill(item, bill) {
  if (!bill) return { ...item, bill: null }
  return { ...item, name: bill.name, planned_amount: bill.amount, due_day: Number(bill.due_date.slice(8, 10)), bill }
}

// Carrega budget_items + bills de UM month_ref (o mês em foco), joinados no client.
// Cada item ganha .bill (a bill daquele month_ref, se existir).
export function useBudget(monthRef) {
  const [data, setData] = useState({ items: [], bills: [], categories: [], accounts: [] })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (isCurrent = always) => {
    if (!monthRef) return
    const [{ data: items }, { data: bills }, { data: cats }, { data: accts }] = await Promise.all([
      db.getBudgetItems(),
      db.getBillsByMonthRef(monthRef),
      db.getCategories(),
      db.getAccounts(),
    ])
    if (!isCurrent()) return
    // Join 1:1 — índice único (budget_item_id, month_ref) garante no máx. 1 bill por item.
    const billByItemId = new Map((bills || []).map(b => [b.budget_item_id, b]))
    const itemsWithBill = (items || []).map(i => overlayBill(i, billByItemId.get(i.id)))
    setData({ items: itemsWithBill, bills: bills || [], categories: cats || [], accounts: accts || [] })
    setLoading(false)
  }, [monthRef])

  useAutoLoad(load)
  return { ...data, loading, refetch: load }
}
