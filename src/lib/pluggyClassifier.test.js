import { describe, it, expect } from 'vitest'
import { classifyTransaction } from './pluggyClassifier'

describe('classifyTransaction', () => {
  it('Aplicação RDB → transfer interna', () => {
    const tx = {
      amount: -500,
      descriptionRaw: 'Aplicação RDB',
      operationType: 'APLIC_FINANCEIRA',
    }
    const account = { type: 'BANK', payment_source: 'fixed_income' }
    const result = classifyTransaction(tx, account)
    expect(result.type).toBe('transfer')
    expect(result.is_internal).toBe(true)
    expect(result.status).toBe('approved')
  })

  it('Pagamento de fatura → transfer com bill_id quando match', () => {
    const tx = {
      amount: -201.35,
      descriptionRaw: 'Pagamento de fatura',
      date: '2026-04-14',
    }
    const account = { type: 'BANK', payment_source: 'fixed_income' }
    const candidateBills = [
      { id: 'bill-uuid-1', total_amount: 201.35, due_date: '2026-04-14' },
      { id: 'bill-uuid-2', total_amount: 100, due_date: '2026-04-10' },
    ]
    const result = classifyTransaction(tx, account, { candidateBills })
    expect(result.type).toBe('transfer')
    expect(result.bill_id).toBe('bill-uuid-1')
    expect(result.status).toBe('approved')
  })
})
