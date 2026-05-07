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
})
