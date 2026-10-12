import { describe, it, expect } from 'vitest'
import { goalProgress, goalTx } from './goals'
import { computeAccountSnapshot } from './budgetEngine'

const goal = { id: 'g1', name: 'Viagem', target_amount: 5000, current_amount: 1200 }

describe('goalProgress', () => {
  it('guardado = valor inicial + transferências − despesas da própria meta', () => {
    const txs = [
      { goal_id: 'g1', type: 'transfer', amount: 400 },
      { goal_id: 'g1', type: 'expense', amount: 100 },
      { goal_id: 'g2', type: 'transfer', amount: 999 },
      { goal_id: 'g1', type: 'income', amount: 50 },   // só transferência e despesa contam
    ]
    expect(goalProgress(goal, txs)).toEqual({ saved: 1500, target: 5000, missing: 3500, pct: 30 })
  })

  it('nunca fica negativo nem passa de 100%', () => {
    expect(goalProgress(goal, [{ goal_id: 'g1', type: 'expense', amount: 9000 }])).toMatchObject({ saved: 0, pct: 0, missing: 5000 })
    expect(goalProgress(goal, [{ goal_id: 'g1', type: 'transfer', amount: 9000 }])).toMatchObject({ pct: 100, missing: 0 })
  })

  it('meta sem alvo é 0%', () => {
    expect(goalProgress({ id: 'g1', target_amount: null }, [])).toEqual({ saved: 0, target: 0, missing: 0, pct: 0 })
  })
})

describe('goalTx', () => {
  const accounts = [{ id: 'a1', default_payment_source: 'fixed_income' }, { id: 'a2', default_payment_source: 'credit' }]
  const base = { goal, userId: 'u1', accounts }

  it('guardar sem mover dinheiro: transferência sem contas, que não altera saldo', () => {
    const { payload } = goalTx({ ...base, mode: 'save', form: { amount: '200', date: '2026-10-12' } })
    expect(payload).toMatchObject({
      type: 'transfer', amount: 200, goal_id: 'g1', user_id: 'u1', date: '2026-10-12',
      description: 'Guardado: Viagem', from_account_id: null, to_account_id: null,
    })
    const snap = computeAccountSnapshot({ account: { id: 'a1', type: 'bank', opening_balance: 10 }, transactions: [payload] })
    expect(snap.saldoAtual).toBe(10)
  })

  it('guardar movendo entre contas exige origem e destino diferentes', () => {
    const form = { amount: '200', date: '2026-10-12', move: true, from_account_id: 'a1', to_account_id: 'a1' }
    expect(goalTx({ ...base, mode: 'save', form }).error).toMatch(/diferentes/)
    expect(goalTx({ ...base, mode: 'save', form: { ...form, to_account_id: 'a2' } }).payload)
      .toMatchObject({ from_account_id: 'a1', to_account_id: 'a2' })
  })

  it('pagar: despesa na conta escolhida, com a fonte de pagamento da conta', () => {
    const { payload } = goalTx({ ...base, mode: 'pay', form: { amount: '5000', date: '2026-10-12', account_id: 'a2' } })
    expect(payload).toMatchObject({ type: 'expense', amount: 5000, account_id: 'a2', payment_source: 'credit', goal_id: 'g1', description: 'Viagem' })
  })

  it('recusa valor vazio, zero ou negativo, e pagar sem conta', () => {
    for (const amount of ['', '0', '-5', 'abc']) {
      expect(goalTx({ ...base, mode: 'save', form: { amount, date: '2026-10-12' } }).error).toBeTruthy()
    }
    expect(goalTx({ ...base, mode: 'pay', form: { amount: '10', date: '2026-10-12', account_id: '' } }).error).toMatch(/conta/i)
  })
})
