import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  resolvePreset,
  loadFromStorage,
  saveToStorage,
  STORAGE_KEY,
} from '../lib/dateRange'

const DateRangeContext = createContext(null)

export function DateRangeProvider({ children, initialToday }) {
  const today = initialToday || new Date()
  const [cycles, setCycles] = useState([])
  const [range, setRangeState] = useState(null)

  // Bootstrap: carrega cycles + decide range inicial
  useEffect(() => {
    let cancelled = false
    async function init() {
      const { data } = await supabase
        .from('budget_cycles')
        .select('*')
        .order('start_date', { ascending: false })
      if (cancelled) return
      const cs = data || []
      setCycles(cs)
      const stored = loadFromStorage()
      if (stored?.preset === 'cycle') {
        setRangeState(resolvePreset('cycle', cs, today))
      } else if (stored) {
        setRangeState(stored)
      } else {
        setRangeState(resolvePreset('cycle', cs, today))
      }
    }
    init()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Realtime: cycles atualizam => recarrega lista (não mexe no range salvo)
  useEffect(() => {
    const ch = supabase.channel('date-range-cycles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_cycles' }, async () => {
        const { data } = await supabase
          .from('budget_cycles')
          .select('*')
          .order('start_date', { ascending: false })
        setCycles(data || [])
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  // Cross-tab sync via storage event
  useEffect(() => {
    function onStorage(e) {
      if (e.key !== STORAGE_KEY || !e.newValue) return
      try {
        const next = JSON.parse(e.newValue)
        setRangeState(next)
      } catch { /* ignora */ }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setRange = useCallback((input) => {
    let next
    if (input.preset === 'custom') {
      next = {
        startDate: input.startDate,
        endDate: input.endDate,
        preset: 'custom',
        label: input.label || `${input.startDate} → ${input.endDate}`,
      }
    } else {
      next = resolvePreset(input.preset, cycles, today)
    }
    setRangeState(next)
    saveToStorage(next)
  }, [cycles, today])

  return (
    <DateRangeContext.Provider value={{ range, setRange, cycles }}>
      {children}
    </DateRangeContext.Provider>
  )
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext)
  if (!ctx) throw new Error('useDateRange deve ser usado dentro de DateRangeProvider')
  return ctx
}
