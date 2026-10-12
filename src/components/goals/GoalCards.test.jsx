import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

vi.mock('../../lib/db', () => ({
  addTransaction: vi.fn(() => Promise.resolve({ error: null })),
  upsertGoal: vi.fn(() => Promise.resolve({ error: null })),
}))

import GoalCards from './GoalCards'
import { addTransaction, upsertGoal } from '../../lib/db'

const goal = { id: 'g1', name: 'Viagem', progress: { saved: 1200, target: 5000, missing: 3800, pct: 24 } }
const accounts = [
  { id: 'a2', name: 'Cartão', type: 'credit', default_payment_source: 'credit' },
  { id: 'a1', name: 'Conta', type: 'bank', default_payment_source: 'fixed_income' },
]

describe('GoalCards', () => {
  beforeEach(() => { addTransaction.mockClear(); upsertGoal.mockClear() })

  it('guardar: dois toques e um valor criam a reserva vinculada à meta', async () => {
    const onChanged = vi.fn()
    render(<GoalCards goals={[goal]} accounts={accounts} userId="u1" onChanged={onChanged}/>)

    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/valor/i), { target: { value: '200' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(addTransaction).toHaveBeenCalledWith(expect.objectContaining({
      type: 'transfer', amount: 200, goal_id: 'g1', from_account_id: null, to_account_id: null,
    }))
    expect(upsertGoal).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('pagar: sugere o valor alvo e a conta bancária, cria a despesa e conclui a meta', async () => {
    render(<GoalCards goals={[goal]} accounts={accounts} userId="u1" onChanged={() => {}}/>)

    fireEvent.click(screen.getByRole('button', { name: /pagar/i }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByLabelText(/valor/i)).toHaveValue(5000)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Pagar' }))

    await waitFor(() => expect(upsertGoal).toHaveBeenCalledWith({ id: 'g1', is_completed: true }))
    expect(addTransaction).toHaveBeenCalledWith(expect.objectContaining({
      type: 'expense', amount: 5000, account_id: 'a1', payment_source: 'fixed_income', goal_id: 'g1',
    }))
  })

  it('valor inválido mostra erro e não grava nada', () => {
    render(<GoalCards goals={[goal]} accounts={accounts} userId="u1" onChanged={() => {}}/>)
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Guardar' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/maior que zero/)
    expect(addTransaction).not.toHaveBeenCalled()
  })
})
