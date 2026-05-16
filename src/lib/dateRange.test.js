import { describe, it, expect, beforeEach } from 'vitest'
import {
  resolvePreset,
  findCycleForRange,
  loadFromStorage,
  saveToStorage,
  STORAGE_KEY,
} from './dateRange'

const cycles = [
  { id: 'c1', month_ref: '2026-05', start_date: '2026-05-14', end_date: '2026-06-15' },
  { id: 'c2', month_ref: '2026-04', start_date: '2026-04-15', end_date: '2026-05-13' },
]

describe('resolvePreset', () => {
  const today = new Date(2026, 4, 16) // maio = mês 4 (0-indexed)

  it('cycle: retorna o cycle que contém today', () => {
    const r = resolvePreset('cycle', cycles, today)
    expect(r.startDate).toBe('2026-05-14')
    expect(r.endDate).toBe('2026-06-15')
    expect(r.preset).toBe('cycle')
    expect(r.label).toMatch(/Ciclo atual/)
  })

  it('cycle: fallback pra mês atual quando nenhum ciclo contém today', () => {
    const r = resolvePreset('cycle', [], today)
    expect(r.preset).toBe('this_month')
    expect(r.startDate).toBe('2026-05-01')
    expect(r.endDate).toBe('2026-05-31')
  })

  it('this_month: primeiro ao último dia do mês de today', () => {
    const r = resolvePreset('this_month', cycles, today)
    expect(r.startDate).toBe('2026-05-01')
    expect(r.endDate).toBe('2026-05-31')
    expect(r.label).toMatch(/maio de 2026/i)
  })

  it('last_month: primeiro ao último dia do mês anterior', () => {
    const r = resolvePreset('last_month', cycles, today)
    expect(r.startDate).toBe('2026-04-01')
    expect(r.endDate).toBe('2026-04-30')
  })

  it('last_30d: 30 dias atrás até today', () => {
    const r = resolvePreset('last_30d', cycles, today)
    expect(r.startDate).toBe('2026-04-16')
    expect(r.endDate).toBe('2026-05-16')
    expect(r.label).toMatch(/30 dias/)
  })

  it('last_90d: 90 dias atrás até today', () => {
    const r = resolvePreset('last_90d', cycles, today)
    expect(r.startDate).toBe('2026-02-15')
    expect(r.endDate).toBe('2026-05-16')
  })
})

describe('findCycleForRange', () => {
  it('match exato retorna o cycle', () => {
    const c = findCycleForRange(cycles, { startDate: '2026-05-14', endDate: '2026-06-15' })
    expect(c?.id).toBe('c1')
  })
  it('sem match retorna null', () => {
    const c = findCycleForRange(cycles, { startDate: '2026-04-01', endDate: '2026-04-30' })
    expect(c).toBeNull()
  })
  it('lista vazia retorna null', () => {
    expect(findCycleForRange([], { startDate: '2026-05-14', endDate: '2026-06-15' })).toBeNull()
  })
})

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('saveToStorage grava JSON na chave', () => {
    saveToStorage({ startDate: '2026-05-14', endDate: '2026-06-15', preset: 'cycle', label: 'X' })
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toMatchObject({
      startDate: '2026-05-14',
      preset: 'cycle',
    })
  })

  it('loadFromStorage retorna o objeto válido', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      startDate: '2026-05-14', endDate: '2026-06-15', preset: 'cycle', label: 'X',
    }))
    expect(loadFromStorage()).toMatchObject({ preset: 'cycle' })
  })

  it('loadFromStorage retorna null se chave vazia', () => {
    expect(loadFromStorage()).toBeNull()
  })

  it('loadFromStorage retorna null se JSON corrompido', () => {
    localStorage.setItem(STORAGE_KEY, '{ not json')
    expect(loadFromStorage()).toBeNull()
  })

  it('loadFromStorage retorna null se shape inválido (sem startDate)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ preset: 'cycle' }))
    expect(loadFromStorage()).toBeNull()
  })
})
