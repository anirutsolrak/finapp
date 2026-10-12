import { describe, it, expect, vi, beforeEach } from 'vitest'

const fromCalls = []
function makeChain(table) {
  const chain = {}
  chain.delete = () => { fromCalls.push({ table, op: 'delete' }); return chain }
  chain.update = (payload) => { fromCalls.push({ table, op: 'update', payload }); return chain }
  chain.eq = (col, val) => { fromCalls.push({ table, op: 'eq', col, val }); return chain }
  chain.insert = (payload) => { fromCalls.push({ table, op: 'insert', payload }); return chain }
  chain.select = () => chain
  chain.single = () => chain
  chain.then = (resolve) => resolve({ error: null })
  return chain
}

vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn(() => Promise.resolve({ data: 'tx-uuid-123', error: null })),
    from: vi.fn((table) => makeChain(table)),
  }
}))

import { payBill, unpayBill, deleteBudgetItem, addTransaction, updateTransaction } from './db'
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

describe('unpayBill', () => {
  beforeEach(() => { supabase.rpc.mockClear() })

  it('chama RPC unpay_bill com billId', async () => {
    await unpayBill('b1')
    expect(supabase.rpc).toHaveBeenCalledWith('unpay_bill', { p_bill_id: 'b1' })
  })
})

describe('deleteBudgetItem', () => {
  beforeEach(() => { fromCalls.length = 0 })

  it('deleta bills nao-pagas e desliga FK das pagas, depois desativa item', async () => {
    await deleteBudgetItem('item-1')

    // 1) DELETE FROM bills WHERE budget_item_id=item-1 AND is_paid=false
    const delPath = fromCalls.filter(c => c.table === 'bills')
    expect(delPath.some(c => c.op === 'delete')).toBe(true)
    expect(delPath.some(c => c.op === 'eq' && c.col === 'is_paid' && c.val === false)).toBe(true)

    // 2) UPDATE bills SET budget_item_id=null WHERE budget_item_id=item-1 AND is_paid=true
    expect(delPath.some(c => c.op === 'update' && c.payload?.budget_item_id === null)).toBe(true)
    expect(delPath.some(c => c.op === 'eq' && c.col === 'is_paid' && c.val === true)).toBe(true)

    // 3) UPDATE budget_items SET active=false WHERE id=item-1
    const itemPath = fromCalls.filter(c => c.table === 'budget_items')
    expect(itemPath.some(c => c.op === 'update' && c.payload?.active === false)).toBe(true)
    expect(itemPath.some(c => c.op === 'eq' && c.col === 'id' && c.val === 'item-1')).toBe(true)
  })
})

describe('lançamentos normalizados', () => {
  beforeEach(() => { fromCalls.length = 0 })
  const sent = (op) => fromCalls.find(c => c.table === 'transactions' && c.op === op).payload

  it('mudar a data recalcula month_ref', async () => {
    await updateTransaction('t1', { type: 'expense', date: '2026-11-03', month_ref: '2026-10', account_id: 'a1' })
    expect(sent('update').month_ref).toBe('2026-11')
  })

  it('transferência não grava account_id', async () => {
    await updateTransaction('t1', { type: 'transfer', date: '2026-10-01', account_id: 'a1', from_account_id: 'a1', to_account_id: 'a2' })
    expect(sent('update')).toMatchObject({ account_id: null, from_account_id: 'a1', to_account_id: 'a2' })
  })

  it('despesa não grava contas de origem/destino', async () => {
    await addTransaction({ type: 'expense', date: '2026-10-01', account_id: 'a1', from_account_id: 'a1', to_account_id: 'a2' })
    expect(sent('insert')).toMatchObject({ account_id: 'a1', from_account_id: null, to_account_id: null, month_ref: '2026-10' })
  })
})
