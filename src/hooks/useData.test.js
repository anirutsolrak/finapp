import { describe, it, expect, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: {} }))

import { overlayBill } from './useData'

const item = { id: 'i1', name: 'Aluguel', planned_amount: 1000, due_day: 10, is_fixed: true }

describe('overlayBill', () => {
  it('mostra nome, valor e dia da bill do mês por cima do template', () => {
    const bill = { id: 'b1', name: 'Aluguel (reajuste)', amount: 1200, due_date: '2026-10-05' }
    expect(overlayBill(item, bill)).toEqual({
      ...item, name: 'Aluguel (reajuste)', planned_amount: 1200, due_day: 5, bill,
    })
  })

  it('sem bill no mês mantém os valores do template', () => {
    expect(overlayBill(item, undefined)).toEqual({ ...item, bill: null })
  })
})
