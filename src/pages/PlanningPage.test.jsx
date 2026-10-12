import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Supabase vazio: toda query resolve com lista vazia.
vi.mock('../lib/supabase', () => {
  const query = () => {
    const q = { then: (resolve) => resolve({ data: [], error: null }) }
    for (const m of ['select', 'order', 'eq', 'gte', 'lte', 'in', 'or', 'not']) q[m] = () => q
    return q
  }
  return {
    supabase: {
      auth: {
        getSession: () => Promise.resolve({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      from: query,
      channel: () => ({ on() { return this }, subscribe: () => ({}) }),
      removeChannel: () => {},
    },
  }
})

import PlanningPage from './PlanningPage'
import { AuthProvider } from '../contexts/AuthContext'
import { SelectionProvider } from '../contexts/SelectionContext'

describe('PlanningPage', () => {
  it('mês sem nada mostra plano e lançamentos vazios, sem quebrar', async () => {
    render(<AuthProvider><SelectionProvider><PlanningPage /></SelectionProvider></AuthProvider>)
    expect(await screen.findByText(/Nenhuma conta planejada/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Plano do mês' })).toBeInTheDocument()
    expect(await screen.findByText(/Nenhum lançamento neste mês/)).toBeInTheDocument()
  })
})
