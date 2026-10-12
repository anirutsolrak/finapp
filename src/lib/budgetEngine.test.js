import { describe, it, expect } from 'vitest'
import { monthTotals, computeAccountSnapshot } from './budgetEngine'

describe('monthTotals', () => {
  const items = [
    { id: 'i1', categories: { type: 'essential' }, bill: { amount: 1890, is_paid: true } },
    { id: 'i2', categories: { type: 'variable' }, bill: { amount: 1200, is_paid: false } },
    { id: 'i3', categories: { type: 'income' }, bill: { amount: 6200, is_paid: true } },  // renda não é conta a pagar
    { id: 'i4', categories: { type: 'essential' }, bill: null },                           // template sem conta no mês
  ]
  const transactions = [
    { type: 'income', amount: 6200, payment_source: 'fixed_income' },
    { type: 'expense', amount: 1890, payment_source: 'fixed_income' },
    { type: 'expense', amount: 27.9, payment_source: 'credit' },   // cartão não mexe na conta corrente
    { type: 'transfer', amount: 400, payment_source: 'fixed_income' },
  ]

  it('plano soma só contas a pagar do mês, pelo valor da bill', () => {
    expect(monthTotals({ items, transactions })).toMatchObject({ planejado: 3090, pago: 1890, falta: 1200 })
  })

  it('entrou/saiu consideram só a conta corrente', () => {
    expect(monthTotals({ items, transactions })).toMatchObject({ entrou: 6200, saiu: 1890, liquido: 4310 })
  })

  it('mês vazio é tudo zero', () => {
    expect(monthTotals({})).toEqual({ entrou: 0, saiu: 0, liquido: 0, planejado: 0, pago: 0, falta: 0 })
  })
})

describe('computeAccountSnapshot', () => {
  const txs = [
    { type: 'income', amount: 1000, account_id: 'a1' },
    { type: 'expense', amount: 300, account_id: 'a1' },
    { type: 'transfer', amount: 200, from_account_id: 'a1', to_account_id: 'a2' },  // paga a fatura
    { type: 'expense', amount: 450, account_id: 'a2' },
  ]

  it('conta bancária: saldo inicial + entradas − saídas (transferência sai)', () => {
    const snap = computeAccountSnapshot({ account: { id: 'a1', type: 'bank', opening_balance: 50 }, transactions: txs })
    expect(snap.saldoAtual).toBe(550)
  })

  it('cartão: usado = compras − pagamentos recebidos, sem saldo inicial', () => {
    const snap = computeAccountSnapshot({ account: { id: 'a2', type: 'credit', opening_balance: 999, credit_limit: 1000 }, transactions: txs })
    expect(snap).toMatchObject({ usado: 250, limite: 1000, pctComprometido: 25 })
  })
})
