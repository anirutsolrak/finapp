import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// Os prompts de PWA dependem de módulo virtual do plugin e de matchMedia, ausentes no Vitest/jsdom.
vi.mock('./components/UpdatePrompt', () => ({ default: () => null }))
vi.mock('./components/InstallPrompt', () => ({ default: () => null }))
vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [] }) }) }),
    channel: () => ({ on() { return this }, subscribe: () => ({}) }),
    removeChannel: () => {},
  },
}))

import App from './App'

// JSX com componente não importado passa no build e no lint; só quebra ao montar as rotas.
describe('App', () => {
  it('monta a tabela de rotas e manda rota antiga pro login quando deslogado', async () => {
    window.history.pushState({}, '', '/lista')
    render(<App />)
    expect((await screen.findAllByRole('button', { name: /entrar/i })).length).toBeGreaterThan(0)
  })
})
