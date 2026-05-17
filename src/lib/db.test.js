import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./supabase', () => ({
  supabase: { rpc: vi.fn(() => Promise.resolve({ data: 'tx-uuid-123', error: null })) }
}))

import { payBill } from './db'
import { supabase } from './supabase'

describe('payBill', () => {
  beforeEach(() => { supabase.rpc.mockClear() })

  it('chama RPC pay_bill com payload mapeado', async () => {
    await payBill({
      billId: 'b1', accountId: 'a1', amount: 150.5, date: '2026-05-17',
      paymentSource: 'fixed_income', categoryId: 'c1', budgetItemId: 'i1',
    })
    expect(supabase.rpc).toHaveBeenCalledWith('pay_bill', {
      p_bill_id: 'b1', p_account_id: 'a1', p_amount: 150.5, p_date: '2026-05-17',
      p_payment_source: 'fixed_income', p_category_id: 'c1', p_budget_item_id: 'i1',
    })
  })
})
