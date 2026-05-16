# Onda 7 — Seletor de período global (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o filtro por `month_ref` em todo o app por um seletor global de range de datas no header, com presets (Ciclo atual / Mês atual / Mês passado / Últimos 30 / Últimos 90) + range custom, persistido em localStorage. Derivados de ciclo (Disponível pra gastar, Reserva, Ritmo) ficam visíveis só quando o range bate exato com um cycle existente.

**Architecture:** Context Provider global (`<DateRangeProvider>`) embrulha a árvore autenticada e expõe `useDateRange()`. Um componente `<DateRangeSelector>` no `Layout` mexe no context. Hooks de dados (`useDashboard`, `useTransactions`, `useBills`, `useBudgetCycle`) deixam de receber `monthRef` por prop e leem o range diretamente. `useTransactionsByCycle(start, end)` permanece como primitiva pra casos com range explícito.

**Tech Stack:** React 19 + Vite 8 + Context API. Testes com Vitest + @testing-library/react + jsdom (a serem instalados). Supabase para dados. date-fns 4 para manipulação de datas.

**Spec:** [docs/superpowers/specs/2026-05-16-onda7-date-range-global-design.md](../specs/2026-05-16-onda7-date-range-global-design.md)

**Branch:** `auditoria-features`. Não criar branch novo — Carlos trabalha direto nessa branch.

---

## File Structure

**Criar:**
- `src/contexts/DateRangeContext.jsx` — Provider + hook `useDateRange`. Bootstrap, localStorage sync, storage event listener.
- `src/lib/dateRange.js` — funções puras: `resolvePreset(presetKey, cycles, today)`, `findCycleForRange(cycles, range)`, `loadFromStorage()`, `saveToStorage(range)`. Não toca React.
- `src/components/DateRangeSelector.jsx` — dropdown UI (presets + custom).
- `src/lib/dateRange.test.js` — unit tests das funções puras.
- `src/contexts/DateRangeContext.test.jsx` — testes do Provider/hook (mock de localStorage e supabase).
- `vitest.config.js` — config Vitest (jsdom env).
- `src/test/setup.js` — setup global do teste (cleanup RTL, mock matchMedia se preciso).

**Modificar:**
- `package.json` — devDependencies (vitest, @testing-library/react, @testing-library/jest-dom, jsdom).
- `src/App.jsx` — envolver `<AppRoutes>` com `<DateRangeProvider>`.
- `src/components/layout/Layout.jsx` — adicionar `<DateRangeSelector>` no header desktop e mobile.
- `src/lib/db.js` — adicionar `getBillsByRange(start, end)`.
- `src/hooks/useData.js` — refatorar `useDashboard`, `useTransactions`, `useBills`, `useBudgetCycle` pra ler `useDateRange()` e remover arg `monthRef`. Remover `useMonthRef`.
- `src/pages/DashboardPage.jsx` — remover `useMonthRef`. Esconder bloco "Disponível pra gastar" e Ritmo/Reserva quando `cycle === null`.
- `src/pages/TransactionsPage.jsx` — remover state local `currentCycleId` + navegação prev/next. Ler range global.
- `src/pages/BillsPage.jsx` — remover state `currentDate`. Ler range global.
- `src/pages/BudgetPage.jsx` — remover `useMonthRef`. CycleModal recebe `monthRef` derivado de `range.startDate.slice(0,7)`.
- `src/pages/ListaPage.jsx` — remover `monthRef` inline. Ler range global e usar primeiro cycle dentro do range.
- `INVENTARIO.md` — adicionar entrada "Onda 7 — Seletor de período global".

---

## Fase 0 — Quick fix imediato (não-código)

Destrava o ciclo atual antes da implementação da Onda 7. Não depende de nenhum código novo. Executar antes da Task 1.

- [ ] **Step 0.1: Aplicar UPDATE no cycle.start_date**

Conteúdo do SQL:
```sql
UPDATE budget_cycles
  SET start_date = '2026-05-14'
  WHERE month_ref = '2026-05';
```

Tentar via Supabase CLI primeiro:
```powershell
supabase db execute --file - <<'SQL'
UPDATE budget_cycles
  SET start_date = '2026-05-14'
  WHERE month_ref = '2026-05';
SQL
```

Se a CLI falhar (qualquer erro): colar o SQL no Dashboard SQL Editor em `https://vzbswcoogdarlzqstumy.supabase.co` → SQL Editor → Run.

Verificar: `SELECT month_ref, start_date, end_date FROM budget_cycles WHERE month_ref='2026-05';` deve mostrar `start_date='2026-05-14'`, `end_date='2026-06-15'`.

- [ ] **Step 0.2: Aplicar seed_tx_2026-05.sql**

Arquivo já existe em `seed_tx_2026-05.sql` (commit 27c9600). Mesma estratégia: CLI primeiro, Dashboard se falhar.

```powershell
supabase db execute --file seed_tx_2026-05.sql
```

Verificar: `SELECT COUNT(*) FROM transactions WHERE month_ref='2026-05';` deve mostrar 42+ tx (delta da inserção).

- [ ] **Step 0.3: Smoke browser**

Rodar `npm run dev`, abrir Dashboard. Esperar ver:
- Card "Bancos" com saldo NuBank refletindo o extrato + salário do dia 14.
- Card "Cartões" com NuBank Crédito + PicPay carregando.
- Bloco "Disponível pra gastar" aparecendo (ciclo atual existe e bate com month_ref='2026-05').

Se algo estiver errado, parar a Onda 7 aqui e debugar.

- [ ] **Step 0.4: Commit (apenas se algo no repo mudou — provavelmente não)**

Fase 0 não muda código. Não há commit aqui. Seguir pra Task 1.

---

## Task 1: Setup Vitest + React Testing Library

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`
- Create: `src/test/setup.js`

- [ ] **Step 1.1: Instalar dependências de teste**

Run:
```powershell
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

Expected: instala 4 pacotes em devDependencies sem warnings críticos.

- [ ] **Step 1.2: Criar `vitest.config.js`**

Conteúdo completo:
```js
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
  },
})
```

- [ ] **Step 1.3: Criar `src/test/setup.js`**

Conteúdo completo:
```js
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
```

- [ ] **Step 1.4: Adicionar scripts ao `package.json`**

Modificar a seção `"scripts"` em [package.json](../../../package.json) pra incluir:
```json
"test": "vitest",
"test:run": "vitest run"
```

Mantenha os scripts existentes (`dev`, `build`, `lint`, `preview`, `generate-pwa-assets`) inalterados.

- [ ] **Step 1.5: Criar um teste smoke pra validar setup**

Criar `src/test/smoke.test.js`:
```js
import { describe, it, expect } from 'vitest'

describe('Vitest setup', () => {
  it('roda', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 1.6: Rodar o teste smoke**

Run: `npm run test:run -- src/test/smoke.test.js`
Expected: PASS, 1 test.

- [ ] **Step 1.7: Commit**

```powershell
git add package.json package-lock.json vitest.config.js src/test/setup.js src/test/smoke.test.js
git commit -m "chore(test): setup Vitest + RTL + jsdom"
```

---

## Task 2: Funções puras de dateRange (TDD)

**Files:**
- Create: `src/lib/dateRange.js`
- Create: `src/lib/dateRange.test.js`

Funções puras separam a lógica de presets/storage/cycle-matching da React tree. Testáveis sem renderer.

- [ ] **Step 2.1: Escrever testes que falham**

Criar `src/lib/dateRange.test.js`:
```js
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  resolvePreset,
  findCycleForRange,
  loadFromStorage,
  saveToStorage,
  STORAGE_KEY,
} from './dateRange'

const cycles = [
  { id: 'c1', month_ref: '2026-05', start_date: '2026-05-14', end_date: '2026-06-15' },
  { id: 'c2', month_ref: '2026-04', start_date: '2026-04-15', end_date: '2026-05-13' },
]

describe('resolvePreset', () => {
  const today = new Date('2026-05-16')

  it('cycle: retorna o cycle que contém today', () => {
    const r = resolvePreset('cycle', cycles, today)
    expect(r.startDate).toBe('2026-05-14')
    expect(r.endDate).toBe('2026-06-15')
    expect(r.preset).toBe('cycle')
    expect(r.label).toMatch(/Ciclo atual/)
  })

  it('cycle: fallback pra mês atual quando nenhum ciclo contém today', () => {
    const r = resolvePreset('cycle', [], today)
    expect(r.preset).toBe('this_month')
    expect(r.startDate).toBe('2026-05-01')
    expect(r.endDate).toBe('2026-05-31')
  })

  it('this_month: primeiro ao último dia do mês de today', () => {
    const r = resolvePreset('this_month', cycles, today)
    expect(r.startDate).toBe('2026-05-01')
    expect(r.endDate).toBe('2026-05-31')
    expect(r.label).toMatch(/maio de 2026/i)
  })

  it('last_month: primeiro ao último dia do mês anterior', () => {
    const r = resolvePreset('last_month', cycles, today)
    expect(r.startDate).toBe('2026-04-01')
    expect(r.endDate).toBe('2026-04-30')
  })

  it('last_30d: 30 dias atrás até today', () => {
    const r = resolvePreset('last_30d', cycles, today)
    expect(r.startDate).toBe('2026-04-16')
    expect(r.endDate).toBe('2026-05-16')
    expect(r.label).toMatch(/30 dias/)
  })

  it('last_90d: 90 dias atrás até today', () => {
    const r = resolvePreset('last_90d', cycles, today)
    expect(r.startDate).toBe('2026-02-15')
    expect(r.endDate).toBe('2026-05-16')
  })
})

describe('findCycleForRange', () => {
  it('match exato retorna o cycle', () => {
    const c = findCycleForRange(cycles, { startDate: '2026-05-14', endDate: '2026-06-15' })
    expect(c?.id).toBe('c1')
  })
  it('sem match retorna null', () => {
    const c = findCycleForRange(cycles, { startDate: '2026-04-01', endDate: '2026-04-30' })
    expect(c).toBeNull()
  })
  it('lista vazia retorna null', () => {
    expect(findCycleForRange([], { startDate: '2026-05-14', endDate: '2026-06-15' })).toBeNull()
  })
})

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('saveToStorage grava JSON na chave', () => {
    saveToStorage({ startDate: '2026-05-14', endDate: '2026-06-15', preset: 'cycle', label: 'X' })
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY))).toMatchObject({
      startDate: '2026-05-14',
      preset: 'cycle',
    })
  })

  it('loadFromStorage retorna o objeto válido', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      startDate: '2026-05-14', endDate: '2026-06-15', preset: 'cycle', label: 'X',
    }))
    expect(loadFromStorage()).toMatchObject({ preset: 'cycle' })
  })

  it('loadFromStorage retorna null se chave vazia', () => {
    expect(loadFromStorage()).toBeNull()
  })

  it('loadFromStorage retorna null se JSON corrompido', () => {
    localStorage.setItem(STORAGE_KEY, '{ not json')
    expect(loadFromStorage()).toBeNull()
  })

  it('loadFromStorage retorna null se shape inválido (sem startDate)', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ preset: 'cycle' }))
    expect(loadFromStorage()).toBeNull()
  })
})
```

- [ ] **Step 2.2: Rodar pra confirmar que falha**

Run: `npm run test:run -- src/lib/dateRange.test.js`
Expected: FAIL com "Failed to resolve import './dateRange'".

- [ ] **Step 2.3: Implementar `src/lib/dateRange.js`**

Conteúdo completo:
```js
import { format, parseISO, startOfMonth, endOfMonth, subMonths, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const STORAGE_KEY = 'finapp:dateRange'

const fmt = (d) => format(d, 'yyyy-MM-dd')
const ddMM = (s) => format(parseISO(s), 'dd/MM')

export function resolvePreset(presetKey, cycles, today = new Date()) {
  const todayStr = fmt(today)
  switch (presetKey) {
    case 'cycle': {
      const c = (cycles || []).find(c => c.start_date <= todayStr && todayStr <= c.end_date)
      if (c) {
        return {
          startDate: c.start_date,
          endDate: c.end_date,
          preset: 'cycle',
          label: `Ciclo atual (${ddMM(c.start_date)} → ${ddMM(c.end_date)})`,
        }
      }
      return resolvePreset('this_month', cycles, today)
    }
    case 'this_month': {
      const s = startOfMonth(today)
      const e = endOfMonth(today)
      return {
        startDate: fmt(s),
        endDate: fmt(e),
        preset: 'this_month',
        label: format(s, "MMMM 'de' yyyy", { locale: ptBR }),
      }
    }
    case 'last_month': {
      const ref = subMonths(today, 1)
      const s = startOfMonth(ref)
      const e = endOfMonth(ref)
      return {
        startDate: fmt(s),
        endDate: fmt(e),
        preset: 'last_month',
        label: format(s, "MMMM 'de' yyyy", { locale: ptBR }),
      }
    }
    case 'last_30d': {
      const s = subDays(today, 30)
      return {
        startDate: fmt(s),
        endDate: todayStr,
        preset: 'last_30d',
        label: 'Últimos 30 dias',
      }
    }
    case 'last_90d': {
      const s = subDays(today, 90)
      return {
        startDate: fmt(s),
        endDate: todayStr,
        preset: 'last_90d',
        label: 'Últimos 90 dias',
      }
    }
    default:
      throw new Error(`Preset desconhecido: ${presetKey}`)
  }
}

export function findCycleForRange(cycles, range) {
  if (!range || !cycles?.length) return null
  return cycles.find(c =>
    c.start_date === range.startDate && c.end_date === range.endDate
  ) || null
}

export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.startDate || !parsed?.endDate || !parsed?.preset || !parsed?.label) return null
    return parsed
  } catch {
    return null
  }
}

export function saveToStorage(range) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(range))
  } catch { /* ignora quota errors */ }
}
```

- [ ] **Step 2.4: Rodar testes**

Run: `npm run test:run -- src/lib/dateRange.test.js`
Expected: PASS, todos os testes.

- [ ] **Step 2.5: Commit**

```powershell
git add src/lib/dateRange.js src/lib/dateRange.test.js
git commit -m "feat(date-range): funções puras de preset/cycle-match/storage"
```

---

## Task 3: DateRangeContext + Provider + useDateRange (TDD)

**Files:**
- Create: `src/contexts/DateRangeContext.jsx`
- Create: `src/contexts/DateRangeContext.test.jsx`

- [ ] **Step 3.1: Escrever testes que falham**

Criar `src/contexts/DateRangeContext.test.jsx`:
```jsx
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
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
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
    expect(() => render(<Bare />)).toThrow(/DateRangeProvider/)
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
    render(<DateRangeProvider initialToday={new Date('2026-05-16')}><Probe /></DateRangeProvider>)
    await screen.findByText(/Ciclo atual/)
    expect(screen.getByTestId('start')).toHaveTextContent('2026-05-14')
  })

  it('setRange com preset re-resolve start/end e persiste', async () => {
    render(<DateRangeProvider initialToday={new Date('2026-05-16')}><Probe /></DateRangeProvider>)
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
    render(<DateRangeProvider initialToday={new Date('2026-05-16')}><CustomProbe /></DateRangeProvider>)
    await screen.findByText(/Ciclo atual/)
    act(() => { screen.getByText('year').click() })
    expect(screen.getByTestId('label')).toHaveTextContent('Ano todo')
  })
})
```

- [ ] **Step 3.2: Rodar pra confirmar que falha**

Run: `npm run test:run -- src/contexts/DateRangeContext.test.jsx`
Expected: FAIL com "Failed to resolve import './DateRangeContext'".

- [ ] **Step 3.3: Implementar `src/contexts/DateRangeContext.jsx`**

Conteúdo completo:
```jsx
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  resolvePreset,
  loadFromStorage,
  saveToStorage,
  STORAGE_KEY,
} from '../lib/dateRange'

const DateRangeContext = createContext(null)

export function DateRangeProvider({ children, initialToday }) {
  const today = initialToday || new Date()
  const [cycles, setCycles] = useState([])
  const [range, setRangeState] = useState(null)

  // Bootstrap: carrega cycles + decide range inicial
  useEffect(() => {
    let cancelled = false
    async function init() {
      const { data } = await supabase
        .from('budget_cycles')
        .select('*')
        .order('start_date', { ascending: false })
      if (cancelled) return
      const cs = data || []
      setCycles(cs)
      const stored = loadFromStorage()
      if (stored?.preset === 'cycle') {
        // Re-resolve cycle (datas podem ter mudado)
        setRangeState(resolvePreset('cycle', cs, today))
      } else if (stored) {
        setRangeState(stored)
      } else {
        setRangeState(resolvePreset('cycle', cs, today))
      }
    }
    init()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Realtime: cycles atualizam => re-bootstrap (mas não mexe no range salvo do user)
  useEffect(() => {
    const ch = supabase.channel('date-range-cycles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_cycles' }, async () => {
        const { data } = await supabase
          .from('budget_cycles')
          .select('*')
          .order('start_date', { ascending: false })
        setCycles(data || [])
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  // Cross-tab sync via storage event
  useEffect(() => {
    function onStorage(e) {
      if (e.key !== STORAGE_KEY || !e.newValue) return
      try {
        const next = JSON.parse(e.newValue)
        setRangeState(next)
      } catch { /* ignora */ }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setRange = useCallback((input) => {
    let next
    if (input.preset === 'custom') {
      next = {
        startDate: input.startDate,
        endDate: input.endDate,
        preset: 'custom',
        label: input.label || `${input.startDate} → ${input.endDate}`,
      }
    } else {
      next = resolvePreset(input.preset, cycles, today)
    }
    setRangeState(next)
    saveToStorage(next)
  }, [cycles, today])

  return (
    <DateRangeContext.Provider value={{ range, setRange, cycles }}>
      {children}
    </DateRangeContext.Provider>
  )
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext)
  if (!ctx) throw new Error('useDateRange deve ser usado dentro de DateRangeProvider')
  return ctx
}
```

- [ ] **Step 3.4: Rodar testes**

Run: `npm run test:run -- src/contexts/DateRangeContext.test.jsx`
Expected: PASS, todos os testes.

- [ ] **Step 3.5: Commit**

```powershell
git add src/contexts/DateRangeContext.jsx src/contexts/DateRangeContext.test.jsx
git commit -m "feat(date-range): provider + useDateRange hook"
```

---

## Task 4: Componente DateRangeSelector

**Files:**
- Create: `src/components/DateRangeSelector.jsx`

Componente UI. Não vai ter unit test isolado (vai aparecer no smoke browser na Task 13). Mantém o plano enxuto.

- [ ] **Step 4.1: Criar `src/components/DateRangeSelector.jsx`**

Conteúdo completo:
```jsx
import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Calendar, Check } from 'lucide-react'
import { useDateRange } from '../contexts/DateRangeContext'

const PRESETS = [
  { key: 'cycle',      label: 'Ciclo atual' },
  { key: 'this_month', label: 'Mês atual' },
  { key: 'last_month', label: 'Mês passado' },
  { key: 'last_30d',   label: 'Últimos 30 dias' },
  { key: 'last_90d',   label: 'Últimos 90 dias' },
]

export default function DateRangeSelector() {
  const { range, setRange } = useDateRange()
  const [open, setOpen] = useState(false)
  const [customMode, setCustomMode] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    function onClick(e) {
      if (!ref.current?.contains(e.target)) {
        setOpen(false)
        setCustomMode(false)
      }
    }
    if (open) document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  if (!range) return null

  function selectPreset(key) {
    setRange({ preset: key })
    setOpen(false)
    setCustomMode(false)
  }

  function applyCustom() {
    if (!customStart || !customEnd) return
    if (customStart > customEnd) return
    setRange({
      preset: 'custom',
      startDate: customStart,
      endDate: customEnd,
      label: `${customStart} → ${customEnd}`,
    })
    setOpen(false)
    setCustomMode(false)
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-200 hover:bg-gray-700 transition-colors"
        aria-label="Selecionar período"
      >
        <Calendar size={13}/>
        <span className="truncate max-w-[180px]">{range.label}</span>
        <ChevronDown size={12} className={open ? 'rotate-180 transition-transform' : 'transition-transform'}/>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-64 bg-gray-900 border border-gray-800 rounded-xl shadow-lg z-50 overflow-hidden">
          {!customMode && (
            <div className="py-1">
              {PRESETS.map(p => (
                <button
                  key={p.key}
                  onClick={() => selectPreset(p.key)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-200 hover:bg-gray-800"
                >
                  <span>{p.label}</span>
                  {range.preset === p.key && <Check size={12} className="text-emerald-400"/>}
                </button>
              ))}
              <div className="border-t border-gray-800 mt-1"/>
              <button
                onClick={() => {
                  setCustomMode(true)
                  setCustomStart(range.startDate)
                  setCustomEnd(range.endDate)
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-200 hover:bg-gray-800"
              >
                <span>Personalizado…</span>
                {range.preset === 'custom' && <Check size={12} className="text-emerald-400"/>}
              </button>
            </div>
          )}

          {customMode && (
            <div className="p-3 space-y-2">
              <label className="block">
                <span className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">De</span>
                <input
                  type="date"
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-gray-200"
                />
              </label>
              <label className="block">
                <span className="block text-[10px] text-gray-500 uppercase tracking-wide mb-1">Até</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-xs text-gray-200"
                />
              </label>
              {customStart && customEnd && customStart > customEnd && (
                <p className="text-[10px] text-red-400">Data inicial deve ser menor ou igual à final.</p>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setCustomMode(false)}
                  className="flex-1 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200"
                >
                  Voltar
                </button>
                <button
                  onClick={applyCustom}
                  disabled={!customStart || !customEnd || customStart > customEnd}
                  className="flex-1 px-3 py-1.5 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
                >
                  Aplicar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4.2: Commit**

```powershell
git add src/components/DateRangeSelector.jsx
git commit -m "feat(date-range): DateRangeSelector dropdown component"
```

---

## Task 5: Plugar Provider em App.jsx + Selector em Layout.jsx

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/layout/Layout.jsx`

- [ ] **Step 5.1: Envolver árvore com DateRangeProvider em App.jsx**

Em [src/App.jsx](../../../src/App.jsx), adicione o import (mantenha os outros imports inalterados):
```jsx
import { DateRangeProvider } from './contexts/DateRangeContext'
```

Modifique o return do `App()`:
```jsx
export default function App() {
  return (
    <BrowserRouter>
      <InstallPrompt />
      <UpdatePrompt />
      <AuthProvider>
        <DateRangeProvider>
          <AppRoutes />
        </DateRangeProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
```

`DateRangeProvider` dentro de `AuthProvider` é proposital: queries de cycles dependem do user autenticado (RLS).

- [ ] **Step 5.2: Adicionar DateRangeSelector ao Layout.jsx**

Em [src/components/layout/Layout.jsx](../../../src/components/layout/Layout.jsx), adicione o import:
```jsx
import DateRangeSelector from '../DateRangeSelector'
```

Modifique a sidebar desktop e o main pra incluir o seletor. O seletor aparece em **dois lugares**:
1. No topo do main content (visível em mobile e desktop)

Substituir o bloco `{/* ── Main Content ── */}` por:
```jsx
{/* ── Main Content ── */}
<main className="flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
  <div className="max-w-5xl mx-auto p-4 md:p-6">
    {/* Header com seletor de período */}
    <div className="flex justify-end mb-3">
      <DateRangeSelector />
    </div>
    <Outlet />
  </div>
</main>
```

- [ ] **Step 5.3: Smoke browser**

Run: `npm run dev`
Abrir o app em `http://localhost:5173/`. Esperar:
- Logar.
- Ver o seletor no topo do main, label "Ciclo atual (14/05 → 15/06)".
- Click abre dropdown com 5 presets + "Personalizado…".
- Trocar pra "Mês atual" muda label sem erro.
- Reload mantém a seleção.
- DevTools → Application → Local Storage → `finapp:dateRange` existe.

- [ ] **Step 5.4: Commit**

```powershell
git add src/App.jsx src/components/layout/Layout.jsx
git commit -m "feat(date-range): plugar provider + seletor no Layout"
```

---

## Task 6: db.getBillsByRange + refactor useDashboard

**Files:**
- Modify: `src/lib/db.js`
- Modify: `src/hooks/useData.js`

- [ ] **Step 6.1: Adicionar getBillsByRange em db.js**

Em [src/lib/db.js](../../../src/lib/db.js), logo após `getAllBills` (linha ~76), adicionar:
```js
export const getBillsByRange = (startDate, endDate) =>
  supabase
    .from('bills')
    .select('*, budget_items(active, payment_source)')
    .gte('due_date', startDate)
    .lte('due_date', endDate)
    .order('due_date')
```

Não remover `getBills(monthRef)` — outras chamadas (rollover) ainda usam.

- [ ] **Step 6.2: Refatorar useDashboard em useData.js**

Em [src/hooks/useData.js](../../../src/hooks/useData.js), substituir a função `useDashboard` (linhas 12-43) por:

```js
export function useDashboard() {
  const { range, cycles } = useDateRange()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!range) return
    setLoading(true)
    const [{ data: bills }, { data: goals }, { data: items }, { data: txs }] = await Promise.all([
      db.getBillsByRange(range.startDate, range.endDate),
      db.getGoals(),
      db.getBudgetItems(),
      db.getTransactionsByRange(range.startDate, range.endDate),
    ])
    const cycle = (cycles || []).find(c =>
      c.start_date === range.startDate && c.end_date === range.endDate
    ) || null
    setData({ bills, goals, budgetItems: items, cycle, transactions: txs })
    setLoading(false)
  }, [range, cycles])

  useEffect(() => { load() }, [load])

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_items' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_cycles' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { data, loading, refetch: load }
}
```

Adicionar o import no topo do arquivo (após imports existentes):
```js
import { useDateRange } from '../contexts/DateRangeContext'
```

- [ ] **Step 6.3: Commit (parcial — Dashboard ainda quebrado em runtime)**

Nesse ponto `DashboardPage` ainda chama `useDashboard(monthRef)` com arg, mas a função ignora — vai funcionar parcialmente. Commit pra check-pointar:

```powershell
git add src/lib/db.js src/hooks/useData.js
git commit -m "refactor(useDashboard): lê range do DateRangeContext em vez de monthRef"
```

---

## Task 7: Refactor useTransactions, useBills, useBudgetCycle; remover useMonthRef

**Files:**
- Modify: `src/hooks/useData.js`

- [ ] **Step 7.1: Substituir useTransactions, useBills, useBudgetCycle**

Em [src/hooks/useData.js](../../../src/hooks/useData.js):

Substituir `useTransactions` (linhas 45-64) por:
```js
export function useTransactions() {
  const { range } = useDateRange()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!range) return
    setLoading(true)
    const { data } = await db.getTransactionsByRange(range.startDate, range.endDate)
    setTransactions(data || [])
    setLoading(false)
  }, [range])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('tx').on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, load).subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { transactions, loading, refetch: load }
}
```

Substituir `useBills` (linhas 113-137) por:
```js
export function useBills() {
  const { range } = useDateRange()
  const [bills, setBills] = useState([])
  const [allBills, setAllBills] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!range) return
    setLoading(true)
    const [{ data: ranged }, { data: all }] = await Promise.all([
      db.getBillsByRange(range.startDate, range.endDate),
      db.getAllBills(),
    ])
    setBills(ranged || [])
    setAllBills(all || [])
    setLoading(false)
  }, [range])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('bills').on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, load).subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { bills, allBills, loading, refetch: load }
}
```

Substituir `useBudgetCycle` (linhas 177-196) por:
```js
export function useBudgetCycle() {
  const { range, cycles } = useDateRange()
  const cycle = (cycles || []).find(c =>
    c.start_date === range?.startDate && c.end_date === range?.endDate
  ) || null
  return { cycle, loading: !range, refetch: () => {} }
}
```

`useBudgetCycle` agora deriva direto do context — sem queries próprias (cycles já são carregados pelo provider). `refetch` vira no-op (cycles refazem via realtime do provider).

- [ ] **Step 7.2: Remover useMonthRef**

Apagar a função `useMonthRef` (linhas 7-10). Apagar também o import `import { format } from 'date-fns'` da linha 2 **se** nenhuma outra função no arquivo o usar. Verificar antes:

Run: `npm run test:run -- --reporter=verbose 2>&1 | findstr "format"`

Se não houver outros usos do `format`, remova o import. Se houver, mantenha.

- [ ] **Step 7.3: Commit**

```powershell
git add src/hooks/useData.js
git commit -m "refactor(hooks): useTransactions/useBills/useBudgetCycle leem DateRangeContext"
```

---

## Task 8: Esconder derivados em DashboardPage quando cycle null

**Files:**
- Modify: `src/pages/DashboardPage.jsx`

- [ ] **Step 8.1: Atualizar imports e chamada do hook**

Em [src/pages/DashboardPage.jsx](../../../src/pages/DashboardPage.jsx), modificar linha 6:
```jsx
import { useDashboard, useAccountSnapshots, useAccounts } from '../hooks/useData'
```
(Removido `useMonthRef`.)

Modificar linhas 56-57:
```jsx
  const { data, loading } = useDashboard()
```
(Removido `useMonthRef()` e o arg.)

- [ ] **Step 8.2: Condicionar bloco "Disponível pra gastar" em cycle != null**

O bloco já está condicionado em `cycle &&` (linha 228). Sem alteração necessária.

- [ ] **Step 8.3: Condicionar bottom-trigger em cycle != null**

Linha 104:
```jsx
const showDock = !!cycle
```
(Já estava assim — mantém.)

A spec pede esconder Ritmo/Reserva mas manter Metas. Olhando o código: o bottom-trigger é um botão único que abre o drawer com Ritmo+Reserva+Metas juntos. Se `cycle = null`, o `showDock = false` já esconde tudo. Isso significa que Metas ficam invisíveis também quando o range não bate com cycle.

**Decisão pragmática:** o drawer inteiro fica oculto quando `cycle = null`. Metas continuam acessíveis via aba `/goals` (sidebar). Manter o comportamento atual evita reorganizar o drawer.

Adicionar comentário explicativo logo acima da linha 104:
```jsx
// Drawer (Ritmo/Reserva/Metas) só aparece quando range bate exato com um cycle.
// Quando não bate, Metas continuam acessíveis via /goals.
const showDock = !!cycle
```

- [ ] **Step 8.4: Smoke browser**

Run: `npm run dev`
- Logar, ir pro Dashboard.
- Range default = "Ciclo atual" → bloco "Disponível pra gastar" visível, dock no fundo visível.
- Trocar pra "Últimos 90 dias" → bloco "Disponível pra gastar" some, dock some.
- Voltar pra "Ciclo atual" → tudo volta.

- [ ] **Step 8.5: Commit**

```powershell
git add src/pages/DashboardPage.jsx
git commit -m "feat(dashboard): lê DateRangeContext + esconde derivados quando range != cycle"
```

---

## Task 9: Migrar TransactionsPage

**Files:**
- Modify: `src/pages/TransactionsPage.jsx`

Esta página tem state local `currentCycleId` e navegação prev/next por ciclos. Conforme decisão Q1, navegação local é removida — seletor global passa a fazer esse trabalho.

- [ ] **Step 9.1: Remover state local e navegação de ciclo**

Em [src/pages/TransactionsPage.jsx](../../../src/pages/TransactionsPage.jsx), modificar o import da linha 4:
```jsx
import { useBudgetItems, useTransactions, useBills, useGoals, useAccounts } from '../hooks/useData'
```
(Trocou `useTransactionsByCycle, useCycles` por `useTransactions`.)

Adicionar import:
```jsx
import { useDateRange } from '../contexts/DateRangeContext'
```

Substituir a porção inicial da função `TransactionsPage` (de "export default function" até logo antes de "const { items: budgetItems") — linhas 249-271:

```jsx
export default function TransactionsPage() {
  const { range, cycles } = useDateRange()
  const currentCycle = useMemo(
    () => cycles.find(c => c.start_date === range?.startDate && c.end_date === range?.endDate) || null,
    [cycles, range]
  )

  const { transactions, loading: txLoading, refetch } = useTransactions()
  const { items: budgetItems, categories } = useBudgetItems()
  const { bills } = useBills()
  const { goals } = useGoals()
  const { accounts } = useAccounts()
  const [importerOpen, setImporterOpen] = useState(false)
  const { user } = useAuth()
  const [modal, setModal] = useState(null)
  const [filterType, setFilterType] = useState('all')
  const [filterAccount, setFilterAccount] = useState('all')
```

(Apagou `useCycles()`, `currentCycleId` state, `useEffect` de bootstrap, `cycleIndex`, `prevCycle`, `nextCycle`.)

- [ ] **Step 9.2: Atualizar label do header**

Substituir as linhas 286-293 (cálculo de `cycleLabel` e `isCurrentCycle`) por:
```jsx
  const cycleLabel = range?.label || 'Sem período'
  const isCurrentCycle = !!currentCycle
```

- [ ] **Step 9.3: Remover botões prev/next do JSX**

Encontrar o bloco "Cycle nav" no JSX (linhas 387-404 do arquivo original — pode ter shift após edições acima). Substituir o `<div className="card flex items-center justify-between">…</div>` completo por:

```jsx
      {/* Cycle label (sem nav — seletor global controla o período) */}
      <div className="card flex items-center justify-center">
        <p className="font-semibold text-white">{cycleLabel}</p>
      </div>
```

Remover também os imports `ChevronLeft, ChevronRight` da linha de imports da `lucide-react` **se** nenhum outro lugar do arquivo os usar (`grep ChevronLeft` no arquivo antes de remover).

- [ ] **Step 9.4: Smoke browser**

Run: `npm run dev`
- Ir em /transactions.
- Lista mostra tx do range global (Ciclo atual por default).
- Trocar pra "Mês passado" no header → lista atualiza pra tx de abril.
- Filtros tipo/conta continuam funcionando.
- Botões prev/next não existem mais. Label do cycle ainda aparece.

- [ ] **Step 9.5: Commit**

```powershell
git add src/pages/TransactionsPage.jsx
git commit -m "refactor(transactions): lê range global; remove nav local de ciclo"
```

---

## Task 10: Migrar BillsPage

**Files:**
- Modify: `src/pages/BillsPage.jsx`

- [ ] **Step 10.1: Remover state currentDate, usar range global**

Em [src/pages/BillsPage.jsx](../../../src/pages/BillsPage.jsx):

Adicionar import:
```jsx
import { useDateRange } from '../contexts/DateRangeContext'
```

Substituir linhas 137-145:
```jsx
export default function BillsPage() {
  const { range } = useDateRange()
  const [viewMode, setViewMode] = useState('month') // 'month' | 'all'
  const [filterPaid, setFilterPaid] = useState('all') // 'all' | 'pending' | 'paid'
  const [modal, setModal] = useState(null)
  const { user } = useAuth()

  const { bills, allBills, loading, refetch } = useBills()
```

(Apagou `currentDate` state e cálculo de `monthRef`.)

- [ ] **Step 10.2: Atualizar label de header da página**

Linha 188 hoje:
```jsx
const monthLabel = format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })
```

Substituir por:
```jsx
const monthLabel = range?.label || 'Sem período'
```

- [ ] **Step 10.3: Remover botões prev/next mês**

Localizar as linhas 213-217 do arquivo original (podem ter shift após edições acima):
```jsx
<div className="flex items-center justify-between mb-3">
  <button onClick={() => setCurrentDate(d => subMonths(d, 1))} className="p-1.5 text-gray-400 hover:text-white"><ChevronLeft size={18}/></button>
  <p className="font-semibold text-white capitalize">{monthLabel}</p>
  <button onClick={() => setCurrentDate(d => addMonths(d, 1))} className="p-1.5 text-gray-400 hover:text-white"><ChevronRight size={18}/></button>
</div>
```

Substituir por (mantém só o label):
```jsx
<div className="flex items-center justify-center mb-3">
  <p className="font-semibold text-white capitalize">{monthLabel}</p>
</div>
```

Remover imports `subMonths, addMonths` de `date-fns` no topo do arquivo se nenhum outro lugar os usar. Remover `ChevronLeft, ChevronRight` da linha de imports de `lucide-react` se nenhum outro lugar os usar.

- [ ] **Step 10.4: Smoke browser**

Run: `npm run dev`
- Ir em /bills.
- Lista mostra bills com `due_date` no range global.
- Trocar range → lista atualiza.
- Visão "all" continua mostrando todas as bills agrupadas (não depende de range).

- [ ] **Step 10.5: Commit**

```powershell
git add src/pages/BillsPage.jsx
git commit -m "refactor(bills): lê range global; remove nav local de mês"
```

---

## Task 11: Migrar BudgetPage

**Files:**
- Modify: `src/pages/BudgetPage.jsx`

- [ ] **Step 11.1: Trocar useMonthRef por useDateRange**

Em [src/pages/BudgetPage.jsx](../../../src/pages/BudgetPage.jsx):

Modificar import linha 4:
```jsx
import { useBudgetItems, useBudgetCycle, useTransactions, useBills } from '../hooks/useData'
```
(Removido `useMonthRef`.)

Adicionar import:
```jsx
import { useDateRange } from '../contexts/DateRangeContext'
```

Substituir linha 244-248:
```jsx
  const { range } = useDateRange()
  const monthRef = range?.startDate?.slice(0, 7) || ''
  const { cycle, refetch: refetchCycle } = useBudgetCycle()
  const { transactions, refetch: refetchTx } = useTransactions()
  const { bills, refetch: refetchBills } = useBills()
```

`monthRef` continua sendo derivado pra ser passado ao `CycleModal` (que insere novo cycle com `month_ref` populado). O cycle exibido é o que bate com o range global.

- [ ] **Step 11.2: Ajustar subtítulo da página**

Linha 294 hoje:
```jsx
<p className="text-xs text-gray-500 mt-0.5">Ciclo {monthRef} · {cycle ? `${cycle.start_date} → ${cycle.end_date}` : 'sem ciclo'}</p>
```

Manter como está — `monthRef` já está derivado do range, comportamento é equivalente.

- [ ] **Step 11.3: Smoke browser**

Run: `npm run dev`
- Ir em /budget.
- Ciclo exibido bate com o range global.
- Trocar range pra "Mês passado" → cycle muda (se existir cycle de abril) ou some.
- Configurar ciclo (modal) ainda funciona pro mês corrente.

- [ ] **Step 11.4: Commit**

```powershell
git add src/pages/BudgetPage.jsx
git commit -m "refactor(budget): lê range global em vez de useMonthRef"
```

---

## Task 12: Migrar ListaPage

**Files:**
- Modify: `src/pages/ListaPage.jsx`

- [ ] **Step 12.1: Substituir monthRef inline por range global**

Em [src/pages/ListaPage.jsx](../../../src/pages/ListaPage.jsx):

Adicionar import:
```jsx
import { useDateRange } from '../contexts/DateRangeContext'
```

Modificar linhas 206-216:
```jsx
export default function ListaPage() {
  const { user } = useAuth()
  const { range, cycles } = useDateRange()
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [cycle, setCycle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [showModal, setShowModal] = useState(false)
  const [expandedNotes, setExpandedNotes] = useState(new Set())
```

(Apagou `monthRef` inline.)

Modificar `load` callback (linhas 218-232) — só puxa todos os itens/categorias, e deriva `cycle` do context:
```jsx
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [todoRes, catsRes] = await Promise.all([
        getTodoItems(),
        supabase.from('categories').select('*').order('sort_order'),
      ])
      setItems(todoRes.data || [])
      setCategories(catsRes.data || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const c = (cycles || []).find(c =>
      c.start_date === range?.startDate && c.end_date === range?.endDate
    ) || null
    setCycle(c)
  }, [cycles, range])
```

- [ ] **Step 12.2: Smoke browser**

Run: `npm run dev`
- Ir em /lista.
- Lista de items aparece igual antes.
- O `cycle` interno (usado pra criar tx ao "concluir item") reflete o range global. Trocar pra "Últimos 90 dias" deixa cycle null → tentar concluir item provavelmente cria tx sem cycle vinculado. Aceitar comportamento (ler código se houver crash).

- [ ] **Step 12.3: Commit**

```powershell
git add src/pages/ListaPage.jsx
git commit -m "refactor(lista): lê range global em vez de monthRef inline"
```

---

## Task 13: Smoke browser end-to-end

**Files:** (nenhuma alteração de código — só verificação)

- [ ] **Step 13.1: Rodar todos os testes auto**

Run: `npm run test:run`
Expected: PASS, todos os tests (smoke, dateRange, DateRangeContext).

- [ ] **Step 13.2: Build de produção pra validar lint/imports**

Run: `npm run build`
Expected: build OK, sem erros de import.

- [ ] **Step 13.3: Dev server + checklist completo**

Run: `npm run dev` → `http://localhost:5173/`. Logar como Carlos.

Checklist (marcar mentalmente cada item):

**Persistência**
- [ ] Reload mantém range.
- [ ] DevTools → Application → Local Storage → `finapp:dateRange` tem JSON válido.
- [ ] Logout/login mantém range no localStorage.

**Presets**
- [ ] Default 1º acesso (limpar localStorage primeiro) = "Ciclo atual (14/05 → 15/06)".
- [ ] "Mês atual" = 01/05 → 31/05.
- [ ] "Mês passado" = 01/04 → 30/04.
- [ ] "Últimos 30 dias" = today-30 → today.
- [ ] "Últimos 90 dias" = today-90 → today.

**Custom**
- [ ] "Personalizado…" abre 2 date pickers.
- [ ] Start > end desabilita "Aplicar".
- [ ] Aplicar com valores válidos atualiza label e persiste.

**Páginas**
- [ ] Dashboard: cards de contas reagem ao range. "Disponível pra gastar" aparece só quando range bate com cycle (ex: "Ciclo atual"). Some quando "Últimos 90 dias".
- [ ] Transactions: lista filtrada. Nav prev/next de ciclo sumiu (decisão Q1).
- [ ] Bills: lista filtrada por `due_date`.
- [ ] Budget: cycle do range exibido (ou "sem ciclo" se não bate).
- [ ] Lista: items carregados normalmente; cycle interno reflete range.

**Cross-tab**
- [ ] Abrir 2 abas, mudar range numa → outra atualiza após focus (storage event dispara).

Se algum item falhar, abrir issue local (arquivar como TODO numa nova task de fix) ou voltar e ajustar.

- [ ] **Step 13.4: Commit (vazio — só marcar progresso)**

Sem mudança de código. Skip se nada quebrou. Se algo precisou fix, commit do fix com mensagem `fix(onda7): <descrição>`.

---

## Task 14: Atualizar INVENTARIO.md

**Files:**
- Modify: `INVENTARIO.md`

- [ ] **Step 14.1: Ler INVENTARIO.md atual**

Run: cat-equivalent via Read tool — verificar onde adicionar entrada (provavelmente na seção que lista as Ondas).

- [ ] **Step 14.2: Adicionar entrada da Onda 7**

Inserir ao final da seção de Ondas:

```markdown
### Onda 7 — Seletor de período global (2026-05-16)

Substitui filtro implícito por `month_ref` por seletor global no header. Presets (Ciclo atual / Mês atual / Mês passado / Últimos 30 / Últimos 90) + range custom (date pickers). Persistido em `localStorage` chave `finapp:dateRange`, sincronizado cross-tab via storage event.

- **Arquivos novos:** `src/contexts/DateRangeContext.jsx`, `src/lib/dateRange.js`, `src/components/DateRangeSelector.jsx` + testes.
- **Hooks afetados:** `useDashboard`, `useTransactions`, `useBills`, `useBudgetCycle` agora leem range do context (sem arg `monthRef`). `useMonthRef` removido.
- **Páginas migradas:** 5 (Dashboard, Transactions, Bills, Budget, Lista). TransactionsPage perdeu navegação prev/next de ciclo (substituída pelo seletor global).
- **Derivados de ciclo (Disponível pra gastar, Ritmo, Reserva)** só aparecem quando o range bate exato com um cycle existente.
- **Fase 0 aplicada antes da Onda:** UPDATE `cycle.start_date='2026-05-14'` + `seed_tx_2026-05.sql` (destravou ciclo atual).
- **Testing:** Vitest + RTL + jsdom instalados. Unit tests cobrem `dateRange.js` (presets, cycle match, storage) e `DateRangeContext`.
- **Spec:** `docs/superpowers/specs/2026-05-16-onda7-date-range-global-design.md`.
- **Plan:** `docs/superpowers/plans/2026-05-16-onda7-date-range-global.md`.
```

- [ ] **Step 14.3: Commit final**

```powershell
git add INVENTARIO.md
git commit -m "docs: INVENTARIO.md pos-Onda7"
```

---

## Notas finais

**Out of scope explicit (não fazer nessa Onda):**
- Compartilhar range via URL (`?from=...&to=...`).
- Sincronizar cross-device por banco.
- Refactor de `month_ref` na coluna `transactions` (continua sendo populado nos INSERTs para compat com `db.computeRolloverReserva`).
- Reorganizar bottom-trigger drawer pra mostrar só Metas quando cycle null (decisão: drawer inteiro fica oculto; Metas continuam acessíveis via `/goals`).

**Resumo de commits esperados (~10):**
1. `chore(test): setup Vitest + RTL + jsdom`
2. `feat(date-range): funções puras de preset/cycle-match/storage`
3. `feat(date-range): provider + useDateRange hook`
4. `feat(date-range): DateRangeSelector dropdown component`
5. `feat(date-range): plugar provider + seletor no Layout`
6. `refactor(useDashboard): lê range do DateRangeContext em vez de monthRef`
7. `refactor(hooks): useTransactions/useBills/useBudgetCycle leem DateRangeContext`
8. `feat(dashboard): lê DateRangeContext + esconde derivados quando range != cycle`
9. `refactor(transactions): lê range global; remove nav local de ciclo`
10. `refactor(bills): lê range global; remove nav local de mês`
11. `refactor(budget): lê range global em vez de useMonthRef`
12. `refactor(lista): lê range global em vez de monthRef inline`
13. `docs: INVENTARIO.md pos-Onda7`
