import { describe, it, expect } from 'vitest'
import { matchBills } from './reconcile'

const bill = (id, amount, month_ref = '2026-10') => ({ id, amount, month_ref })
const row = (amount, extra = {}) => ({ date: '2026-10-08', amount, type: 'expense', ...extra })

describe('matchBills', () => {
  it('sugere a conta pendente do mesmo mês com o mesmo valor', () => {
    const [r] = matchBills([row(1890)], [bill('b1', 1200), bill('b2', 1890)])
    expect(r.billId).toBe('b2')
  })

  it('cada conta casa no máximo uma vez', () => {
    const out = matchBills([row(120), row(120)], [bill('b1', 120)])
    expect(out.map(r => r.billId)).toEqual(['b1', null])
  })

  it('compara em centavos (numeric do banco vem como string ou float)', () => {
    const out = matchBills([row(0.1 + 0.2), row(1890)], [bill('b1', '0.30'), bill('b2', '1890.00')])
    expect(out.map(r => r.billId)).toEqual(['b1', 'b2'])
  })

  it('não sugere para receita, duplicata ou conta de outro mês', () => {
    const out = matchBills(
      [row(50, { type: 'income' }), row(50, { isDuplicate: true }), row(50, { date: '2026-11-02' })],
      [bill('b1', 50)],
    )
    expect(out.map(r => r.billId)).toEqual([null, null, null])
  })
})
