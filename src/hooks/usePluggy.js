import { useState, useEffect, useCallback } from 'react'
import * as db from '../lib/db'
import * as pluggy from '../lib/pluggyClient'
import { supabase } from '../lib/supabase'

export function useConnections() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await pluggy.pluggyListItems()
      setItems(data.items || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('pluggy_items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pluggy_items' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { items, loading, refetch: load }
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
    const ch = supabase.channel('accounts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { accounts, loading, refetch: load }
}

export function usePendingTransactions() {
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await db.getPendingTransactions()
    setPending(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('pending_tx')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { pending, loading, refetch: load }
}
