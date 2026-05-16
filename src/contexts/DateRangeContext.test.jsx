import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { DateRangeProvider, useDateRange } from './DateRangeContext'
import { STORAGE_KEY } from '../lib/dateRange'

// Mock supabase: useCycles é chamado dentro do provider pra resolver 'cycle'
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({
          data: [{ id: 'c1', month_ref: '2026-05', start_date: '2026-05-14', end_date: '2026-06-15' }],
        }),
      }),
    }),
    channel: () => ({ on() { return this }, subscribe: () => ({}) }),
    removeChannel: () => {},
  },
}))

function Probe() {
  const { range, setRange } = useDateRange()
  return (
    <div>
      <span data-testid="label">{range?.label || 'loading'}</span>
      <span data-testid="start">{range?.startDate}</span>
      <button onClick={() => setRange({ preset: 'this_month' })}>this</button>
    </div>
  )
}

describe('DateRangeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('useDateRange fora do provider lança erro', () => {
    function Bare() { useDateRange(); return null }
    // suprimir error log do React no console
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Bare />)).toThrow(/DateRangeProvider/)
    spy.mockRestore()
  })

  it('bootstrap usa localStorage quando válido', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      startDate: '2026-04-01', endDate: '2026-04-30', preset: 'last_month', label: 'abril',
    }))
    render(<DateRangeProvider><Probe /></DateRangeProvider>)
    await screen.findByText('abril')
    expect(screen.getByTestId('start')).toHaveTextContent('2026-04-01')
  })

  it('bootstrap default = ciclo atual quando storage vazio', async () => {
    render(<DateRangeProvider initialToday={new Date(2026, 4, 16)}><Probe /></DateRangeProvider>)
    await screen.findByText(/Ciclo atual/)
    expect(screen.getByTestId('start')).toHaveTextContent('2026-05-14')
  })

  it('setRange com preset re-resolve start/end e persiste', async () => {
    render(<DateRangeProvider initialToday={new Date(2026, 4, 16)}><Probe /></DateRangeProvider>)
    await screen.findByText(/Ciclo atual/)
    act(() => { screen.getByText('this').click() })
    await screen.findByText(/maio de 2026/i)
    expect(screen.getByTestId('start')).toHaveTextContent('2026-05-01')
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY))
    expect(persisted.preset).toBe('this_month')
  })

  it('setRange com custom passa start/end direto', async () => {
    function CustomProbe() {
      const { range, setRange } = useDateRange()
      return (
        <div>
          <span data-testid="label">{range?.label}</span>
          <button onClick={() => setRange({
            preset: 'custom',
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            label: 'Ano todo',
          })}>year</button>
        </div>
      )
    }
    render(<DateRangeProvider initialToday={new Date(2026, 4, 16)}><CustomProbe /></DateRangeProvider>)
    await screen.findByText(/Ciclo atual/)
    act(() => { screen.getByText('year').click() })
    expect(screen.getByTestId('label')).toHaveTextContent('Ano todo')
  })
})
