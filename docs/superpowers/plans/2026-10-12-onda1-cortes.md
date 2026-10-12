# Onda 1 — Cortes (Dashboard, Lista, IA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Execução nativa, em modo ponytail (menor mudança que resolve). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar a `main` buildando só com Planejamento + Lançamentos (com importação de extrato), Metas e Configurações.

**Architecture:** A working tree tem um corte pela metade: páginas deletadas, cópias idênticas em `src/components/features/` com imports relativos quebrados, e `App.jsx` sem importar `GoalsPage`/`SettingsPage`. Em vez de consertar ~20 imports nas cópias, restauramos `BudgetPage.jsx` e `TransactionsPage.jsx` do git e apagamos as cópias. `CombinedPlanningPage` (abas) fica como casca até a onda 4.

**Tech Stack:** React 19, React Router 7, Vite 8, Tailwind 3, Supabase JS, Vitest + Testing Library.

**Spec:** design aprovado em chat (2026-10-12). Programa completo: 1 Cortes → 2 Edição e modais → 3 Tema → 4 Planejamento + lançamentos numa página → 5 Metas.

## Global Constraints

- Banco intocado: nenhuma tabela, schema (`todo`, `chat_messages`) ou Edge Function (`claude-proxy`) é apagado.
- Sem dependência nova.
- Só sai o que o corte deixou órfão. Código morto anterior ao corte (`useBudgetCycle`, `getAllAccounts`, `BUCKET_LABELS`) fica fora desta onda.
- Código original preservado na branch `legado` (commit `a747f10`).

## Review Focus

1. Rota antiga salva no celular (`/budget`, `/lista`, `/chat`, `/transactions`) deve cair na tela principal, não em tela branca. Coberto pelo teste da Task 1.
2. JSX que usa componente não importado não quebra o build nem o lint (não há `react/jsx-no-undef`), só em runtime. Coberto pelo teste da Task 1.
3. Importar CSV sem IA: todas as linhas chegam com categoria vazia e continuam editáveis antes de gravar. Verificação manual (Task 2).
4. Excluir lançamento não pode mais depender do schema `todo`. Coberto pela leitura do diff (Task 3).
5. No celular, Metas e Configurações precisam ser alcançáveis pela barra inferior. Verificação manual (Task 1).

---

### Task 1: Restaurar telas e consertar rotas

**Files:**
- Restore: `src/pages/BudgetPage.jsx`, `src/pages/TransactionsPage.jsx`
- Delete: `src/components/features/`
- Modify: `src/pages/CombinedPlanningPage.jsx`, `src/App.jsx`, `src/components/layout/Layout.jsx`
- Test: `src/App.test.jsx`

- [ ] **Step 1: Teste que falha.** Criar `src/App.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({ needRefresh: [false, () => {}], offlineReady: [false, () => {}], updateServiceWorker: () => {} }),
}))
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

describe('App', () => {
  it('monta a tabela de rotas e manda rota antiga pro login quando deslogado', async () => {
    window.history.pushState({}, '', '/lista')
    render(<App />)
    expect((await screen.findAllByRole('button', { name: /entrar/i })).length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2:** `npx vitest run src/App.test.jsx` → FAIL (`GoalsPage is not defined` ou import não resolvido).
- [ ] **Step 3: Restaurar e apagar cópias.** Confirmar que as cópias são idênticas e então:

```bash
git checkout HEAD -- src/pages/BudgetPage.jsx src/pages/TransactionsPage.jsx
diff --strip-trailing-cr src/pages/BudgetPage.jsx src/components/features/BudgetFeature.jsx
diff --strip-trailing-cr src/pages/TransactionsPage.jsx src/components/features/TransactionsFeature.jsx
rm -r src/components/features
```

- [ ] **Step 4:** `CombinedPlanningPage.jsx`: importar `TransactionsPage from './TransactionsPage'` e `BudgetPage from './BudgetPage'`, tirar o import de `React` e o comentário de placeholder.
- [ ] **Step 5:** `App.jsx`: importar `GoalsPage` e `SettingsPage`; trocar a rota `transactions` por `<Route path="*" element={<Navigate to="/" replace />} />`.
- [ ] **Step 6:** `Layout.jsx`: uma lista `NAV` só (`/`, `/goals`, `/settings`) usada pela sidebar e pela barra inferior; remover ícones não usados do import.
- [ ] **Step 7:** `npx vitest run src/App.test.jsx` → PASS.

### Task 2: Importador CSV sem IA

**Files:** Modify `src/components/CSVImporterModal.jsx`

- [ ] Remover o import de `categorizeBatch`, o estado `aiUsed`, o selo "IA categorizou" e o ícone `Sparkles`; `categoryId` nasce `null`. Ajustar o comentário de cabeçalho.

### Task 3: Código órfão do corte

**Files:**
- Delete: `src/lib/todo.js`, `src/components/AccountGroupDrawer.jsx`, `src/components/PayBillsModal.jsx` (só o Dashboard usava)
- Modify: `src/lib/db.js`, `src/hooks/useData.js`, `src/lib/budgetEngine.js`, `src/index.css`, `src/pages/SettingsPage.jsx`, `src/pages/BudgetPage.jsx`, `src/pages/TransactionsPage.jsx`, `vite.config.js`

- [ ] `db.js`: remover seção CHAT, `getAIContext`, `getUpcomingBills`, `getBills`, `upsertBill`, o update em `todo.items` dentro de `deleteTransaction` e o import de `computeBucketSnapshot`.
- [ ] `useData.js`: remover `useDashboard` e `useAccountSnapshots` (e o import de `computeAccountsGroupSnapshot`); `budgetEngine.js`: remover `computeAccountsGroupSnapshot` se ficar sem uso.
- [ ] `index.css`: remover `.bubble-user`, `.bubble-ai`, `.chat-action-card`.
- [ ] Textos: card "Segurança" (IA) em Configurações; "replanejamento da IA" no Planejamento; menção ao Dashboard em Lançamentos; `description` do manifest PWA.

### Task 4: Docs, verificação e commit

- [ ] Vitest e ESLint ignoram `.claude/` (worktrees antigos entram na varredura hoje).
- [ ] README: funcionalidades, stack, variáveis de ambiente e estrutura de pastas sem Dashboard/Lista/IA.
- [ ] `npm run test:run` → tudo verde; `npm run build` → sucesso; `npm run lint` → nenhum erro novo em relação à linha de base (73 erros pré-existentes).
- [ ] Commit: `refactor: corta Dashboard, Lista e IA; restaura build`.
