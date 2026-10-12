import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('../lib/db', () => ({ getTransactionsByRange: vi.fn() }))

import * as db from '../lib/db'
import { overlayBill, useTransactions } from './useData'

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

describe('useTransactions', () => {
  beforeEach(() => { db.getTransactionsByRange.mockReset() })

  it('ignora resposta atrasada de um mês que já saiu da tela', async () => {
    let answerSeptember
    db.getTransactionsByRange
      .mockImplementationOnce(() => new Promise(resolve => { answerSeptember = resolve }))  // setembro demora
      .mockImplementationOnce(() => Promise.resolve({ data: [{ id: 'outubro' }] }))
    const { result, rerender } = renderHook(({ s, e }) => useTransactions(s, e), {
      initialProps: { s: '2026-09-01', e: '2026-09-30' },
    })
    rerender({ s: '2026-10-01', e: '2026-10-31' })
    await waitFor(() => expect(result.current.transactions).toEqual([{ id: 'outubro' }]))

    await act(async () => { answerSeptember({ data: [{ id: 'setembro' }] }) })
    expect(result.current.transactions).toEqual([{ id: 'outubro' }])
  })

  it('recarrega quando o app volta a ficar visível', async () => {
    db.getTransactionsByRange.mockResolvedValue({ data: [] })
    renderHook(() => useTransactions('2026-10-01', '2026-10-31'))
    await waitFor(() => expect(db.getTransactionsByRange).toHaveBeenCalledTimes(1))

    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    await waitFor(() => expect(db.getTransactionsByRange).toHaveBeenCalledTimes(2))
  })
})
