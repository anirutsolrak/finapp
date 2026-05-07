# Integração Pluggy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar Pluggy (via MeuPluggy dev) ao FinAPP pra puxar tx automaticamente do NuBank+PicPay, com auto-classificação, inbox de pendentes, vínculo meta-tx, modelo de fatura crédito e detecção de transferências internas.

**Architecture:** Supabase Edge Functions (Deno/TS) chamando Pluggy API; transações vão pra tabela `transactions` existente (1 tabela + `raw_payload jsonb` pra auditoria); 5 tabelas novas (`pluggy_items`, `accounts`, `credit_card_bills`, `user_settings`); polling + botão manual de sync; auto-classificação por regras com inbox pros duvidosos; cutoff de data pra coexistir com tx manuais antigas.

**Tech Stack:** React 19 + Vite + Supabase JS 2.x + Tailwind + Lucide + date-fns + `pluggy-connect-sdk` (frontend); Supabase Edge Functions Deno + `@supabase/supabase-js` (backend); Vitest 1.x (testes unitários do classifier).

**Spec:** `docs/superpowers/specs/2026-05-06-integracao-pluggy-design.md`

**Branch:** `refatoração` (já existe, fora de `main`)

---

## File Structure

### Migrations (raiz, padrão do projeto)
- `migration_pluggy_01_tables.sql` — pluggy_items, accounts, credit_card_bills, user_settings
- `migration_pluggy_02_alter_transactions.sql` — colunas novas + linked_tx_id self-FK
- `migration_pluggy_03_rls.sql` — políticas RLS
- `migration_pluggy_04_indexes.sql` — índices únicos e de busca
- `migration_pluggy_05_seed_settings.sql` — backfill user_settings

### Edge Functions
- `supabase/functions/_shared/pluggy.ts` — cliente Pluggy reutilizado
- `supabase/functions/_shared/cors.ts` — headers CORS reutilizados
- `supabase/functions/pluggy-connect-token/index.ts`
- `supabase/functions/pluggy-create-item/index.ts`
- `supabase/functions/pluggy-list-items/index.ts`
- `supabase/functions/pluggy-delete-item/index.ts`
- `supabase/functions/pluggy-sync/index.ts`

### Frontend — lib (lógica pura, testável)
- `src/lib/pluggyClassifier.js` — regras de classificação + detecção de pares anuláveis
- `src/lib/pluggyClassifier.test.js` — testes unitários (Vitest)
- `src/lib/pluggyClient.js` — wrapper que chama Edge Functions

### Frontend — hooks
- `src/hooks/usePluggy.js` — useConnections, usePendingTransactions, useAccounts

### Frontend — pages
- `src/pages/ConnectionsPage.jsx` — `/connections`
- `src/pages/InboxPage.jsx` — `/inbox`

### Frontend — modificações
- `src/lib/db.js` — novos helpers (getAccounts, getPendingTx, approveTx, etc.)
- `src/pages/TransactionsPage.jsx` — badge fonte, filtro account, tx anuladas
- `src/pages/DashboardPage.jsx` — botão sincronizar com contador
- `src/pages/BudgetPage.jsx` — TxModal ganha campo Conta + Vincular meta
- `src/pages/GoalsPage.jsx` — current_amount derivado das tx
- `src/pages/BillsPage.jsx` — aba Faturas de Cartão
- `src/components/layout/Layout.jsx` — rotas /connections e /inbox
- `src/App.jsx` — registra rotas novas
- `package.json` — adiciona vitest, pluggy-connect-sdk

---

# Fase 1 — Schema (SQL migrations)

Migrations vão pra raiz (padrão do projeto). User aplica manualmente via Supabase Dashboard → SQL Editor → cola e executa. Cada task aqui cria UM arquivo + commit. Aplicação no banco fica pra Task 1.6 (manual).

### Task 1.1: Migration de tabelas novas

**Files:**
- Create: `migration_pluggy_01_tables.sql`

- [ ] **Step 1: Criar arquivo da migration**

```sql
-- migration_pluggy_01_tables.sql
-- Cria tabelas pra integração Pluggy: items (conexões), accounts (contas dentro de items),
-- credit_card_bills (faturas), user_settings (cutoff_date e futuras configs).

CREATE TABLE IF NOT EXISTS pluggy_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pluggy_item_id text NOT NULL UNIQUE,
  connector_name text NOT NULL,
  status text NOT NULL DEFAULT 'UPDATED',
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pluggy_item_id uuid NOT NULL REFERENCES pluggy_items(id) ON DELETE CASCADE,
  pluggy_account_id text NOT NULL UNIQUE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('BANK','CREDIT')),
  subtype text,
  payment_source text NOT NULL CHECK (payment_source IN ('fixed_income','variable_income','credit','reserve')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_card_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  pluggy_bill_id text NOT NULL UNIQUE,
  due_date date NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PARTIAL','PAID')),
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pluggy_cutoff_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Commit**

```bash
git add migration_pluggy_01_tables.sql
git commit -m "feat(pluggy): migration 01 — tabelas novas (items, accounts, bills, settings)"
```

---

### Task 1.2: Migration alter transactions

**Files:**
- Create: `migration_pluggy_02_alter_transactions.sql`

- [ ] **Step 1: Criar arquivo da migration**

```sql
-- migration_pluggy_02_alter_transactions.sql
-- Adiciona colunas em transactions pra suporte Pluggy + multi-account + meta vínculo + par anulável.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pluggy_tx_id text,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','pluggy')),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','pending','ignored')),
  ADD COLUMN IF NOT EXISTS bill_id uuid REFERENCES credit_card_bills(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS card_number text,
  ADD COLUMN IF NOT EXISTS goal_id uuid REFERENCES goals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_tx_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_voided boolean NOT NULL DEFAULT false;

-- pluggy_tx_id deve ser único quando presente (não-nulo)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_transactions_pluggy_tx_id
  ON transactions (pluggy_tx_id)
  WHERE pluggy_tx_id IS NOT NULL;
```

- [ ] **Step 2: Commit**

```bash
git add migration_pluggy_02_alter_transactions.sql
git commit -m "feat(pluggy): migration 02 — colunas novas em transactions"
```

---

### Task 1.3: Migration de RLS

**Files:**
- Create: `migration_pluggy_03_rls.sql`

- [ ] **Step 1: Criar arquivo da migration**

```sql
-- migration_pluggy_03_rls.sql
-- RLS para tabelas novas: cada user só lê/escreve as próprias rows.

ALTER TABLE pluggy_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_card_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- pluggy_items
CREATE POLICY "user owns pluggy_items" ON pluggy_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- accounts
CREATE POLICY "user owns accounts" ON accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- credit_card_bills (via account → user)
CREATE POLICY "user owns bills via account" ON credit_card_bills
  FOR ALL USING (
    EXISTS (SELECT 1 FROM accounts a WHERE a.id = credit_card_bills.account_id AND a.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM accounts a WHERE a.id = credit_card_bills.account_id AND a.user_id = auth.uid())
  );

-- user_settings
CREATE POLICY "user owns settings" ON user_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 2: Commit**

```bash
git add migration_pluggy_03_rls.sql
git commit -m "feat(pluggy): migration 03 — RLS policies"
```

---

### Task 1.4: Migration de índices

**Files:**
- Create: `migration_pluggy_04_indexes.sql`

- [ ] **Step 1: Criar arquivo**

```sql
-- migration_pluggy_04_indexes.sql
-- Índices pra busca eficiente.

CREATE INDEX IF NOT EXISTS idx_pluggy_items_user ON pluggy_items(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_item ON accounts(pluggy_item_id);
CREATE INDEX IF NOT EXISTS idx_bills_account ON credit_card_bills(account_id);
CREATE INDEX IF NOT EXISTS idx_bills_due ON credit_card_bills(due_date);

CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_transactions_bill ON transactions(bill_id) WHERE bill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_goal ON transactions(goal_id) WHERE goal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_linked ON transactions(linked_tx_id) WHERE linked_tx_id IS NOT NULL;
```

- [ ] **Step 2: Commit**

```bash
git add migration_pluggy_04_indexes.sql
git commit -m "feat(pluggy): migration 04 — indexes"
```

---

### Task 1.5: Migration seed user_settings

**Files:**
- Create: `migration_pluggy_05_seed_settings.sql`

- [ ] **Step 1: Criar arquivo**

```sql
-- migration_pluggy_05_seed_settings.sql
-- Backfill user_settings pros usuários existentes (cutoff = data atual).

INSERT INTO user_settings (user_id, pluggy_cutoff_date)
SELECT id, CURRENT_DATE FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
```

- [ ] **Step 2: Commit**

```bash
git add migration_pluggy_05_seed_settings.sql
git commit -m "feat(pluggy): migration 05 — seed user_settings"
```

---

### Task 1.6: Aplicar migrations no Supabase

**Files:** (nenhum — operação manual)

- [ ] **Step 1: Abrir Supabase Dashboard**

Vai em https://supabase.com/dashboard/project/vzbswcoogdarlzqstumy/sql/new

- [ ] **Step 2: Aplicar migration 01**

Cola o conteúdo de `migration_pluggy_01_tables.sql`, clica em "Run". Confirma "Success. No rows returned".

- [ ] **Step 3: Aplicar 02, 03, 04, 05 nessa ordem**

Repete pra cada migration. Cada uma deve completar sem erro.

- [ ] **Step 4: Validar tabelas criadas**

No SQL Editor:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('pluggy_items','accounts','credit_card_bills','user_settings');
```

Esperado: 4 linhas com os 4 nomes.

- [ ] **Step 5: Validar colunas novas em transactions**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'transactions'
  AND column_name IN ('account_id','pluggy_tx_id','raw_payload','source','status','bill_id','card_number','goal_id','linked_tx_id','is_voided');
```

Esperado: 10 linhas.

- [ ] **Step 6: Validar seed**

```sql
SELECT user_id, pluggy_cutoff_date FROM user_settings;
```

Esperado: 1 linha (seu user) com `pluggy_cutoff_date` = hoje.

---

# Fase 2 — Setup do projeto

### Task 2.1: Configurar Pluggy app + secrets no Supabase

**Files:** (nenhum — operação manual)

- [ ] **Step 1: Pegar credenciais Pluggy**

Vai em https://meu.pluggy.ai/ → menu superior → "Apps" (ou "Developer" / "Dashboard de desenvolvedor"). Cria um App novo se ainda não existir. Copia `clientId` e `clientSecret`.

- [ ] **Step 2: Adicionar secrets no Supabase**

https://supabase.com/dashboard/project/vzbswcoogdarlzqstumy/settings/functions → "Edge Function Secrets" → adicionar:
- `PLUGGY_CLIENT_ID` = (valor copiado)
- `PLUGGY_CLIENT_SECRET` = (valor copiado)

Salva. Não há commit (segredos não vão pro git).

---

### Task 2.2: Instalar Vitest pra testes unitários

**Files:**
- Modify: `package.json`
- Create: `vitest.config.js`

- [ ] **Step 1: Instalar Vitest**

```bash
npm install --save-dev vitest @vitest/ui
```

- [ ] **Step 2: Criar vitest.config.js**

```js
// vitest.config.js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.{js,jsx}'],
  },
})
```

- [ ] **Step 3: Adicionar script de test no package.json**

Em `package.json`, adicionar dentro de `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Validar setup**

```bash
npm test
```

Esperado: "No test files found" (porque ainda não há testes). Sem erros de configuração.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.js
git commit -m "chore: adiciona Vitest para testes unitarios"
```

---

### Task 2.3: Instalar pluggy-connect-sdk

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Instalar SDK**

```bash
npm install pluggy-connect-sdk
```

- [ ] **Step 2: Validar build**

```bash
npm run build
```

Esperado: build sem erros.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: adiciona pluggy-connect-sdk"
```

---

# Fase 3 — Lógica de classificação (TDD)

Lib pura, sem deps externas. Testa caso a caso. Vamos TDD: escreve teste, vê falhar, implementa o mínimo, vê passar, commit.

### Task 3.1: Skeleton do classifier + primeiro teste (Aplicação RDB)

**Files:**
- Create: `src/lib/pluggyClassifier.js`
- Create: `src/lib/pluggyClassifier.test.js`

- [ ] **Step 1: Escrever o primeiro teste (vai falhar)**

Cria `src/lib/pluggyClassifier.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { classifyTransaction } from './pluggyClassifier'

describe('classifyTransaction', () => {
  it('Aplicação RDB → transfer interna', () => {
    const tx = {
      amount: -500,
      descriptionRaw: 'Aplicação RDB',
      operationType: 'APLIC_FINANCEIRA',
    }
    const account = { type: 'BANK', payment_source: 'fixed_income' }
    const result = classifyTransaction(tx, account)
    expect(result.type).toBe('transfer')
    expect(result.is_internal).toBe(true)
    expect(result.status).toBe('approved')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

```bash
npm test
```

Esperado: FAIL com "classifyTransaction is not a function" ou similar.

- [ ] **Step 3: Implementar mínimo**

Cria `src/lib/pluggyClassifier.js`:

```js
// Regras de classificação aplicadas em ordem. Primeira que match vence.
// Cada regra recebe (txPluggy, account) e retorna { type, payment_source, status, ...extras } ou null.

const RDB_KEYWORDS = ['Aplicação RDB', 'Resgate RDB']
const RDB_OP_TYPES = ['APLIC_FINANCEIRA', 'RESGATE_APLIC_FINANCEIRA']

function isRdbTransfer(tx) {
  if (RDB_OP_TYPES.includes(tx.operationType)) return true
  return RDB_KEYWORDS.some(k => (tx.descriptionRaw || '').includes(k))
}

export function classifyTransaction(tx, account) {
  // Regra 1: Aplicação/Resgate RDB → transfer interna
  if (isRdbTransfer(tx)) {
    return {
      type: 'transfer',
      payment_source: account.payment_source,
      status: 'approved',
      is_internal: true,
    }
  }
  // Mais regras vão aqui...
  return { type: 'expense', payment_source: account.payment_source, status: 'pending' }
}
```

- [ ] **Step 4: Rodar e ver passar**

```bash
npm test
```

Esperado: PASS — 1 teste OK.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pluggyClassifier.js src/lib/pluggyClassifier.test.js
git commit -m "feat(pluggy): classifier — regra 1 RDB transfer interna"
```

---

### Task 3.2: Pagamento de fatura

**Files:**
- Modify: `src/lib/pluggyClassifier.js`
- Modify: `src/lib/pluggyClassifier.test.js`

- [ ] **Step 1: Adicionar teste**

Append em `pluggyClassifier.test.js`:

```js
it('Pagamento de fatura → transfer com bill_id quando match', () => {
  const tx = {
    amount: -201.35,
    descriptionRaw: 'Pagamento de fatura',
    date: '2026-04-14',
  }
  const account = { type: 'BANK', payment_source: 'fixed_income' }
  const candidateBills = [
    { id: 'bill-uuid-1', total_amount: 201.35, due_date: '2026-04-14' },
    { id: 'bill-uuid-2', total_amount: 100, due_date: '2026-04-10' },
  ]
  const result = classifyTransaction(tx, account, { candidateBills })
  expect(result.type).toBe('transfer')
  expect(result.bill_id).toBe('bill-uuid-1')
  expect(result.status).toBe('approved')
})
```

- [ ] **Step 2: Rodar — esperado FAIL** (`bill_id` não vem)

```bash
npm test
```

- [ ] **Step 3: Implementar regra 2**

Em `pluggyClassifier.js`, antes do `return` final:

```js
function isPaymentOfBill(tx) {
  return (tx.descriptionRaw || '').toLowerCase().includes('pagamento de fatura') && tx.amount < 0
}

function matchBill(tx, candidateBills = []) {
  const txAmount = Math.abs(tx.amount)
  // Match por valor exato; se múltiplos, escolhe o de due_date mais próximo da data da tx
  const exact = candidateBills.filter(b => Math.abs(Number(b.total_amount) - txAmount) < 0.01)
  if (exact.length === 0) return null
  if (exact.length === 1) return exact[0].id
  // Tie-break: due_date mais próximo
  const txDate = new Date(tx.date)
  const sorted = exact.slice().sort((a, b) => {
    return Math.abs(new Date(a.due_date) - txDate) - Math.abs(new Date(b.due_date) - txDate)
  })
  return sorted[0].id
}
```

E adiciona regra dentro de `classifyTransaction`, depois da regra 1:

```js
  // Regra 2: Pagamento de fatura → transfer vinculado a bill
  if (isPaymentOfBill(tx)) {
    const bill_id = matchBill(tx, opts.candidateBills)
    return {
      type: 'transfer',
      payment_source: account.payment_source,
      status: 'approved',
      bill_id,
    }
  }
```

E muda a assinatura pra aceitar opts:

```js
export function classifyTransaction(tx, account, opts = {}) {
```

- [ ] **Step 4: Rodar — esperado PASS**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/pluggyClassifier.js src/lib/pluggyClassifier.test.js
git commit -m "feat(pluggy): classifier — regra 2 pagamento de fatura com matching de bill"
```

---

### Task 3.3: Compra no débito (BANK + amount<0)

**Files:**
- Modify: `src/lib/pluggyClassifier.js`
- Modify: `src/lib/pluggyClassifier.test.js`

- [ ] **Step 1: Teste**

Append:

```js
it('compra no débito → expense com payment_source da account', () => {
  const tx = { amount: -55, descriptionRaw: 'Compra no débito - DROGA LESTE LJ33' }
  const account = { type: 'BANK', payment_source: 'fixed_income' }
  const result = classifyTransaction(tx, account)
  expect(result.type).toBe('expense')
  expect(result.payment_source).toBe('fixed_income')
  expect(result.status).toBe('approved')
})
```

- [ ] **Step 2: Rodar — esperado FAIL** (cai no catch-all que devolve `pending`)

- [ ] **Step 3: Implementar regra 3**

Adiciona em `classifyTransaction`, depois da regra 2:

```js
  // Regra 3: Conta BANK + saída → expense
  if (account.type === 'BANK' && tx.amount < 0) {
    return {
      type: 'expense',
      payment_source: account.payment_source,
      status: 'approved',
    }
  }
```

- [ ] **Step 4: Rodar — esperado PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/pluggyClassifier.js src/lib/pluggyClassifier.test.js
git commit -m "feat(pluggy): classifier — regra 3 compra no debito"
```

---

### Task 3.4: Compra no crédito (CREDIT + metadata)

**Files:**
- Modify: `src/lib/pluggyClassifier.js`
- Modify: `src/lib/pluggyClassifier.test.js`

- [ ] **Step 1: Teste**

Append:

```js
it('compra no crédito → expense + card_number do metadata', () => {
  const tx = {
    amount: 119.90,  // sinal positivo no Pluggy = débito no cartão
    descriptionRaw: 'MICROSOFT*STORE',
    creditCardMetadata: { cardNumber: '0035', billId: 'pluggy-bill-uuid' },
  }
  const account = { type: 'CREDIT', payment_source: 'credit' }
  const result = classifyTransaction(tx, account)
  expect(result.type).toBe('expense')
  expect(result.payment_source).toBe('credit')
  expect(result.card_number).toBe('0035')
  expect(result.status).toBe('approved')
})
```

- [ ] **Step 2: Rodar — esperado FAIL**

- [ ] **Step 3: Implementar regra 4**

Adiciona em `classifyTransaction`, depois da regra 3:

```js
  // Regra 4: Conta CREDIT (compra no cartão)
  if (account.type === 'CREDIT') {
    const meta = tx.creditCardMetadata || {}
    return {
      type: 'expense',
      payment_source: 'credit',
      status: 'approved',
      card_number: meta.cardNumber || null,
      pluggy_bill_id: meta.billId || null, // será resolvido depois pra bill_id local
    }
  }
```

- [ ] **Step 4: Rodar — esperado PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/pluggyClassifier.js src/lib/pluggyClassifier.test.js
git commit -m "feat(pluggy): classifier — regra 4 compra no credito com metadata"
```

---

### Task 3.5: Salário (TRANSFERÊNCIA RECEBIDA + CNPJ + amount > 1000)

**Files:**
- Modify: `src/lib/pluggyClassifier.js`
- Modify: `src/lib/pluggyClassifier.test.js`

- [ ] **Step 1: Teste**

Append:

```js
it('salário (TRANSFERÊNCIA RECEBIDA + CNPJ + > 1000) → income approved', () => {
  const tx = {
    amount: 8966.98,
    descriptionRaw: 'Transferência Recebida - SOLUCAO COOPERATIVA DE TRABALH - 23.798.999/0001-61 - ITAÚ',
  }
  const account = { type: 'BANK', payment_source: 'fixed_income' }
  const result = classifyTransaction(tx, account)
  expect(result.type).toBe('income')
  expect(result.payment_source).toBe('fixed_income')
  expect(result.status).toBe('approved')
})

it('PIX recebido pequeno → pending (vai pra inbox)', () => {
  const tx = {
    amount: 145,
    descriptionRaw: 'Transferência recebida pelo Pix - Gabriele Pereira da Silva',
  }
  const account = { type: 'BANK', payment_source: 'fixed_income' }
  const result = classifyTransaction(tx, account)
  expect(result.type).toBe('income')
  expect(result.status).toBe('pending')
})
```

- [ ] **Step 2: Rodar — esperado FAIL** (no catch-all default)

- [ ] **Step 3: Implementar regras 5 + 7**

Adiciona em `classifyTransaction`:

```js
  // Regra 5: Salário (heurística: transferência recebida grande de CNPJ)
  const cnpjPattern = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/
  const looksLikeReceivedTransfer = /transfer[êe]ncia recebida/i.test(tx.descriptionRaw || '')
  if (tx.amount > 1000 && looksLikeReceivedTransfer && cnpjPattern.test(tx.descriptionRaw || '')) {
    return {
      type: 'income',
      payment_source: 'fixed_income',
      status: 'approved',
    }
  }

  // Regra 7: amount > 0 e nada match antes → income pending (inbox)
  if (tx.amount > 0) {
    return {
      type: 'income',
      payment_source: account.payment_source,
      status: 'pending',
    }
  }
```

- [ ] **Step 4: Rodar — esperado PASS** (ambos testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pluggyClassifier.js src/lib/pluggyClassifier.test.js
git commit -m "feat(pluggy): classifier — regras 5 e 7 salario e PIX pendente"
```

---

### Task 3.6: Reembolso/estorno → pending

**Files:**
- Modify: `src/lib/pluggyClassifier.js`
- Modify: `src/lib/pluggyClassifier.test.js`

- [ ] **Step 1: Teste**

Append:

```js
it('reembolso → pending (vai pra inbox)', () => {
  const tx = {
    amount: 76.49,
    descriptionRaw: 'Reembolso recebido pelo Pix - KEETA DELIVERY BRAZIL LTDA',
  }
  const account = { type: 'BANK', payment_source: 'fixed_income' }
  const result = classifyTransaction(tx, account)
  expect(result.status).toBe('pending')
  expect(result.type).toBe('income')
})

it('estorno → pending', () => {
  const tx = {
    amount: 50,
    descriptionRaw: 'Estorno de compra',
  }
  const account = { type: 'BANK', payment_source: 'fixed_income' }
  const result = classifyTransaction(tx, account)
  expect(result.status).toBe('pending')
})
```

- [ ] **Step 2: Rodar — esperado: o do reembolso passa (já cai na regra 7), mas a INTENÇÃO é capturar reembolso/estorno explicitamente. Adicionamos a regra 6 antes da 5/7 pra forçar.**

- [ ] **Step 3: Implementar regra 6**

Adiciona ANTES da regra 5 em `classifyTransaction`:

```js
  // Regra 6: Reembolso/estorno → pending (user decide se anula original ou trata como income)
  const desc = (tx.descriptionRaw || '').toLowerCase()
  if (desc.includes('reembolso') || desc.includes('estorno')) {
    return {
      type: 'income',
      payment_source: account.payment_source,
      status: 'pending',
    }
  }
```

- [ ] **Step 4: Rodar — esperado PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/pluggyClassifier.js src/lib/pluggyClassifier.test.js
git commit -m "feat(pluggy): classifier — regra 6 reembolso/estorno pendente"
```

---

### Task 3.7: Detector de pares anuláveis (RDB)

**Files:**
- Modify: `src/lib/pluggyClassifier.js`
- Modify: `src/lib/pluggyClassifier.test.js`

- [ ] **Step 1: Teste**

Append:

```js
import { findVoidablePairs } from './pluggyClassifier'

describe('findVoidablePairs', () => {
  it('par Aplicação+Resgate mesmo valor mesma data → vincula', () => {
    const txs = [
      { id: 'a', amount: -500, date: '2026-04-15', is_internal: true, descriptionRaw: 'Aplicação RDB' },
      { id: 'b', amount: 500, date: '2026-04-15', is_internal: true, descriptionRaw: 'Resgate RDB' },
      { id: 'c', amount: -100, date: '2026-04-15', is_internal: false, descriptionRaw: 'Compra' },
    ]
    const pairs = findVoidablePairs(txs)
    expect(pairs).toHaveLength(1)
    expect(pairs[0]).toEqual({ a: 'a', b: 'b' })
  })

  it('par com 1 dia de diferença → ainda vincula', () => {
    const txs = [
      { id: 'a', amount: -200, date: '2026-04-15', is_internal: true, descriptionRaw: 'Aplicação RDB' },
      { id: 'b', amount: 200, date: '2026-04-16', is_internal: true, descriptionRaw: 'Resgate RDB' },
    ]
    expect(findVoidablePairs(txs)).toHaveLength(1)
  })

  it('par com 3 dias de diferença → não vincula', () => {
    const txs = [
      { id: 'a', amount: -200, date: '2026-04-15', is_internal: true, descriptionRaw: 'Aplicação RDB' },
      { id: 'b', amount: 200, date: '2026-04-19', is_internal: true, descriptionRaw: 'Resgate RDB' },
    ]
    expect(findVoidablePairs(txs)).toHaveLength(0)
  })

  it('valores diferentes → não vincula', () => {
    const txs = [
      { id: 'a', amount: -200, date: '2026-04-15', is_internal: true, descriptionRaw: 'Aplicação RDB' },
      { id: 'b', amount: 250, date: '2026-04-15', is_internal: true, descriptionRaw: 'Resgate RDB' },
    ]
    expect(findVoidablePairs(txs)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Rodar — esperado FAIL**

- [ ] **Step 3: Implementar findVoidablePairs**

Append em `pluggyClassifier.js`:

```js
const VOIDABLE_DAY_TOLERANCE = 1

export function findVoidablePairs(txs) {
  const internals = txs.filter(t => t.is_internal)
  const outs = internals.filter(t => Number(t.amount) < 0)
  const ins = internals.filter(t => Number(t.amount) > 0)
  const usedIns = new Set()
  const pairs = []
  for (const out of outs) {
    const outDate = new Date(out.date)
    const candidate = ins.find(inn => {
      if (usedIns.has(inn.id)) return false
      if (Math.abs(Number(inn.amount) + Number(out.amount)) > 0.01) return false
      const days = Math.abs((new Date(inn.date) - outDate) / 86400000)
      return days <= VOIDABLE_DAY_TOLERANCE
    })
    if (candidate) {
      pairs.push({ a: out.id, b: candidate.id })
      usedIns.add(candidate.id)
    }
  }
  return pairs
}
```

- [ ] **Step 4: Rodar — esperado PASS** (4 testes)

- [ ] **Step 5: Commit**

```bash
git add src/lib/pluggyClassifier.js src/lib/pluggyClassifier.test.js
git commit -m "feat(pluggy): classifier — detector de pares anulaveis RDB"
```

---

# Fase 4 — Edge Functions

Cada edge function vive em `supabase/functions/<name>/index.ts`. O CLI Supabase precisa estar instalado pra deploy. Cada task entrega 1 function + commit. Deploy é manual no fim de cada uma.

### Task 4.1: Setup Supabase CLI + estrutura

**Files:**
- Create: `supabase/config.toml` (gerado pelo CLI)
- Create: `supabase/functions/.gitignore`
- Create: `supabase/functions/_shared/cors.ts`
- Create: `supabase/functions/_shared/pluggy.ts`

- [ ] **Step 1: Instalar Supabase CLI**

Windows:
```bash
npm install -g supabase
supabase --version
```

Esperado: versão 1.x ou superior impressa.

- [ ] **Step 2: Inicializar projeto Supabase local**

```bash
supabase init
```

Esperado: cria pasta `supabase/` com `config.toml`. Se perguntar sobre VS Code/IntelliJ, responde `n`.

- [ ] **Step 3: Criar shared cors**

Cria `supabase/functions/_shared/cors.ts`:

```ts
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE',
}

export function handleOptions(req: Request): Response | null {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  return null
}
```

- [ ] **Step 4: Criar shared pluggy client**

Cria `supabase/functions/_shared/pluggy.ts`:

```ts
const PLUGGY_API = 'https://api.pluggy.ai'

let cachedToken: { value: string; expiresAt: number } | null = null

export async function getApiKey(): Promise<string> {
  // Cache 30 min — Pluggy API key dura 2h, mas renovamos antes pra ter folga
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value
  const clientId = Deno.env.get('PLUGGY_CLIENT_ID')
  const clientSecret = Deno.env.get('PLUGGY_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new Error('Pluggy credentials missing')

  const r = await fetch(`${PLUGGY_API}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  })
  if (!r.ok) throw new Error(`Pluggy /auth failed: ${r.status} ${await r.text()}`)
  const data = await r.json()
  cachedToken = { value: data.apiKey, expiresAt: Date.now() + 30 * 60_000 }
  return data.apiKey
}

export async function pluggyFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const apiKey = await getApiKey()
  const headers = new Headers(init.headers)
  headers.set('X-API-KEY', apiKey)
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json')
  return fetch(`${PLUGGY_API}${path}`, { ...init, headers })
}

export async function pluggyJson<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await pluggyFetch(path, init)
  if (!r.ok) throw new Error(`Pluggy ${path} ${r.status}: ${await r.text()}`)
  return r.json() as Promise<T>
}
```

- [ ] **Step 5: Commit**

```bash
git add supabase/
git commit -m "chore(pluggy): setup Supabase CLI + shared helpers (cors, pluggy client)"
```

---

### Task 4.2: pluggy-connect-token

**Files:**
- Create: `supabase/functions/pluggy-connect-token/index.ts`

- [ ] **Step 1: Criar function**

```ts
// supabase/functions/pluggy-connect-token/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { pluggyJson } from '../_shared/pluggy.ts'

serve(async (req) => {
  const opts = handleOptions(req)
  if (opts) return opts

  try {
    // Pluggy /connect_token cria token efêmero pro Connect Widget
    const data = await pluggyJson('/connect_token', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    return new Response(JSON.stringify({ accessToken: data.accessToken }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/pluggy-connect-token/
git commit -m "feat(pluggy): edge function pluggy-connect-token"
```

- [ ] **Step 3: Login Supabase CLI (uma vez)**

```bash
supabase login
```

Abre browser, autoriza. Espera "Logged in".

- [ ] **Step 4: Linkar projeto**

```bash
supabase link --project-ref vzbswcoogdarlzqstumy
```

Pede senha do banco (se não souber, pula com Enter — não precisa pra Edge Functions).

- [ ] **Step 5: Deploy**

```bash
supabase functions deploy pluggy-connect-token --no-verify-jwt=false
```

Esperado: "Deployed successfully". Anota a URL retornada.

- [ ] **Step 6: Testar via curl**

```bash
curl -X POST "https://vzbswcoogdarlzqstumy.functions.supabase.co/pluggy-connect-token" \
  -H "Authorization: Bearer SEU_USER_JWT" \
  -H "apikey: SEU_ANON_KEY"
```

Substitui `SEU_USER_JWT` (pega no devtools do app rodando, em qualquer fetch pra Supabase) e `SEU_ANON_KEY` (do `.env`).

Esperado: `{"accessToken":"..."}` (string longa).

---

### Task 4.3: pluggy-create-item

**Files:**
- Create: `supabase/functions/pluggy-create-item/index.ts`

- [ ] **Step 1: Criar function**

```ts
// supabase/functions/pluggy-create-item/index.ts
// Recebe { itemId } do widget, busca dados no Pluggy, salva pluggy_items + accounts no DB.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { pluggyJson } from '../_shared/pluggy.ts'

interface PluggyAccount {
  id: string
  name: string
  type: 'BANK' | 'CREDIT'
  subtype?: string
}

function defaultPaymentSource(type: string): string {
  if (type === 'CREDIT') return 'credit'
  return 'fixed_income'
}

serve(async (req) => {
  const opts = handleOptions(req)
  if (opts) return opts

  try {
    const { itemId } = await req.json()
    if (!itemId) return jsonError('itemId required', 400)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError('unauthorized', 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return jsonError('unauthorized', 401)

    // Busca dados do item no Pluggy
    const item = await pluggyJson<any>(`/items/${itemId}`)

    // Insere pluggy_items
    const { data: itemRow, error: itemErr } = await supabase
      .from('pluggy_items')
      .insert({
        user_id: user.id,
        pluggy_item_id: itemId,
        connector_name: item.connector?.name || 'Unknown',
        status: item.status || 'UPDATED',
      })
      .select()
      .single()
    if (itemErr) return jsonError(itemErr.message, 500)

    // Busca accounts
    const accountsResp = await pluggyJson<{ results: PluggyAccount[] }>(`/accounts?itemId=${itemId}`)
    const accountsToInsert = accountsResp.results.map(a => ({
      user_id: user.id,
      pluggy_item_id: itemRow.id,
      pluggy_account_id: a.id,
      name: a.name,
      type: a.type,
      subtype: a.subtype || null,
      payment_source: defaultPaymentSource(a.type),
    }))
    const { error: accErr } = await supabase.from('accounts').insert(accountsToInsert)
    if (accErr) return jsonError(accErr.message, 500)

    return new Response(JSON.stringify({ ok: true, itemRow, accounts: accountsToInsert.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return jsonError(String(err.message || err), 500)
  }
})

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy pluggy-create-item
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/pluggy-create-item/
git commit -m "feat(pluggy): edge function pluggy-create-item"
```

---

### Task 4.4: pluggy-list-items

**Files:**
- Create: `supabase/functions/pluggy-list-items/index.ts`

- [ ] **Step 1: Criar function**

```ts
// supabase/functions/pluggy-list-items/index.ts
// Lista pluggy_items do user com count de accounts e tx pendentes.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'

serve(async (req) => {
  const opts = handleOptions(req)
  if (opts) return opts

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return err401()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return err401()

    const { data: items, error } = await supabase
      .from('pluggy_items')
      .select('id, pluggy_item_id, connector_name, status, last_sync_at, accounts(id, name, type, payment_source)')
      .order('created_at', { ascending: false })

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e.message || e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

function err401() {
  return new Response(JSON.stringify({ error: 'unauthorized' }), {
    status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
```

- [ ] **Step 2: Deploy + commit**

```bash
supabase functions deploy pluggy-list-items
git add supabase/functions/pluggy-list-items/
git commit -m "feat(pluggy): edge function pluggy-list-items"
```

---

### Task 4.5: pluggy-delete-item

**Files:**
- Create: `supabase/functions/pluggy-delete-item/index.ts`

- [ ] **Step 1: Criar function**

```ts
// supabase/functions/pluggy-delete-item/index.ts
// Revoga consent no Pluggy e remove o item localmente. Tx ficam (não excluímos histórico).
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { pluggyFetch } from '../_shared/pluggy.ts'

serve(async (req) => {
  const opts = handleOptions(req)
  if (opts) return opts

  try {
    const { itemId } = await req.json()
    if (!itemId) return jsonError('itemId required', 400)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError('unauthorized', 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return jsonError('unauthorized', 401)

    // Pega o pluggy_item_id pra revogar lá
    const { data: item } = await supabase
      .from('pluggy_items').select('pluggy_item_id').eq('id', itemId).single()

    if (item) {
      const r = await pluggyFetch(`/items/${item.pluggy_item_id}`, { method: 'DELETE' })
      if (!r.ok && r.status !== 404) {
        return jsonError(`Pluggy delete failed: ${r.status}`, 500)
      }
    }

    // Remove local (cascade deleta accounts e bills via FK ON DELETE CASCADE)
    const { error } = await supabase.from('pluggy_items').delete().eq('id', itemId)
    if (error) return jsonError(error.message, 500)

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return jsonError(String(e.message || e), 500)
  }
})

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
```

- [ ] **Step 2: Deploy + commit**

```bash
supabase functions deploy pluggy-delete-item
git add supabase/functions/pluggy-delete-item/
git commit -m "feat(pluggy): edge function pluggy-delete-item"
```

---

### Task 4.6: pluggy-sync (mais complexa)

**Files:**
- Create: `supabase/functions/pluggy-sync/index.ts`

- [ ] **Step 1: Criar function**

```ts
// supabase/functions/pluggy-sync/index.ts
// Sync de UM item: força refresh no Pluggy, polling até UPDATED, lê tx novas, classifica, insere.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { pluggyFetch, pluggyJson } from '../_shared/pluggy.ts'

const POLL_INTERVAL_MS = 2000
const POLL_MAX_ATTEMPTS = 20  // 40s total

interface PluggyTx {
  id: string
  date: string
  amount: number
  description?: string
  descriptionRaw?: string
  type: 'DEBIT' | 'CREDIT'
  status: 'PENDING' | 'POSTED'
  operationType?: string
  creditCardMetadata?: { cardNumber?: string; billId?: string }
}

interface ClassificationResult {
  type: 'income'|'expense'|'transfer'|'investment'
  payment_source: string
  status: 'approved'|'pending'
  is_internal?: boolean
  bill_id?: string | null
  card_number?: string | null
  pluggy_bill_id?: string | null
}

const RDB_KEYWORDS = ['Aplicação RDB', 'Resgate RDB']
const RDB_OP_TYPES = ['APLIC_FINANCEIRA', 'RESGATE_APLIC_FINANCEIRA']

function isRdb(tx: PluggyTx): boolean {
  if (RDB_OP_TYPES.includes(tx.operationType || '')) return true
  return RDB_KEYWORDS.some(k => (tx.descriptionRaw || '').includes(k))
}

function classify(
  tx: PluggyTx,
  account: { type: string; payment_source: string },
  candidateBills: Array<{ id: string; total_amount: number; due_date: string }>,
): ClassificationResult {
  // Regra 1: RDB
  if (isRdb(tx)) {
    return { type: 'transfer', payment_source: account.payment_source, status: 'approved', is_internal: true }
  }
  // Regra 2: Pagamento de fatura
  const desc = (tx.descriptionRaw || '').toLowerCase()
  if (desc.includes('pagamento de fatura') && tx.amount < 0) {
    const txAmount = Math.abs(tx.amount)
    const exact = candidateBills.filter(b => Math.abs(Number(b.total_amount) - txAmount) < 0.01)
    let bill_id: string | null = null
    if (exact.length === 1) bill_id = exact[0].id
    else if (exact.length > 1) {
      const txDate = new Date(tx.date)
      bill_id = exact.slice().sort((a, b) =>
        Math.abs(+new Date(a.due_date) - +txDate) - Math.abs(+new Date(b.due_date) - +txDate)
      )[0].id
    }
    return { type: 'transfer', payment_source: account.payment_source, status: 'approved', bill_id }
  }
  // Regra 6: reembolso/estorno
  if (desc.includes('reembolso') || desc.includes('estorno')) {
    return { type: 'income', payment_source: account.payment_source, status: 'pending' }
  }
  // Regra 3: BANK + saída
  if (account.type === 'BANK' && tx.amount < 0) {
    return { type: 'expense', payment_source: account.payment_source, status: 'approved' }
  }
  // Regra 4: CREDIT (compra no cartão)
  if (account.type === 'CREDIT') {
    return {
      type: 'expense', payment_source: 'credit', status: 'approved',
      card_number: tx.creditCardMetadata?.cardNumber || null,
      pluggy_bill_id: tx.creditCardMetadata?.billId || null,
    }
  }
  // Regra 5: salário
  const cnpjPattern = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/
  const isReceived = /transfer[êe]ncia recebida/i.test(tx.descriptionRaw || '')
  if (tx.amount > 1000 && isReceived && cnpjPattern.test(tx.descriptionRaw || '')) {
    return { type: 'income', payment_source: 'fixed_income', status: 'approved' }
  }
  // Regra 7: amount > 0 → pending
  if (tx.amount > 0) {
    return { type: 'income', payment_source: account.payment_source, status: 'pending' }
  }
  // Catch-all
  return { type: 'expense', payment_source: account.payment_source, status: 'pending' }
}

serve(async (req) => {
  const opts = handleOptions(req)
  if (opts) return opts
  try {
    const { itemId } = await req.json()
    if (!itemId) return jsonError('itemId required', 400)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError('unauthorized', 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return jsonError('unauthorized', 401)

    // Carrega item local
    const { data: item } = await supabase
      .from('pluggy_items').select('*').eq('id', itemId).single()
    if (!item) return jsonError('item not found', 404)

    // Carrega cutoff
    const { data: settings } = await supabase
      .from('user_settings').select('pluggy_cutoff_date').eq('user_id', user.id).single()
    const cutoff = settings?.pluggy_cutoff_date || new Date().toISOString().slice(0, 10)
    const fromDate = item.last_sync_at ? new Date(item.last_sync_at).toISOString().slice(0, 10) : cutoff

    // Force refresh
    await pluggyFetch(`/items/${item.pluggy_item_id}`, { method: 'POST' })

    // Polling até UPDATED
    let pluggyItem: any = null
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      pluggyItem = await pluggyJson<any>(`/items/${item.pluggy_item_id}`)
      if (pluggyItem.status === 'UPDATED' || pluggyItem.status === 'OUTDATED') break
      if (pluggyItem.status === 'LOGIN_ERROR' || pluggyItem.status === 'ERROR') {
        await supabase.from('pluggy_items').update({ status: pluggyItem.status }).eq('id', itemId)
        return jsonError(`item status: ${pluggyItem.status}`, 500)
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    }

    // Lista accounts locais do item
    const { data: accounts } = await supabase
      .from('accounts').select('*').eq('pluggy_item_id', itemId)

    let inserted = 0, pending = 0, skipped = 0

    for (const account of accounts || []) {
      // Bills (se CREDIT) — buscar/upsert antes das tx pra poder vincular bill_id
      let billsByPluggyId: Record<string, string> = {}
      let candidateBills: Array<{ id: string; total_amount: number; due_date: string }> = []
      if (account.type === 'CREDIT') {
        try {
          const billsResp = await pluggyJson<{ results: any[] }>(`/items/${item.pluggy_item_id}/credit-card-bills`)
          for (const b of billsResp.results || []) {
            const paid = (b.payments || []).reduce((a: number, p: any) => a + Number(p.amount || 0), 0)
            const status = paid >= Number(b.totalAmount) ? 'PAID' : (paid > 0 ? 'PARTIAL' : 'OPEN')
            const { data: upserted } = await supabase
              .from('credit_card_bills')
              .upsert({
                account_id: account.id,
                pluggy_bill_id: b.id,
                due_date: b.dueDate,
                total_amount: b.totalAmount,
                paid_amount: paid,
                status,
                raw_payload: b,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'pluggy_bill_id' })
              .select('id, total_amount, due_date')
              .single()
            if (upserted) {
              billsByPluggyId[b.id] = upserted.id
              candidateBills.push({ id: upserted.id, total_amount: upserted.total_amount, due_date: upserted.due_date })
            }
          }
        } catch (e) {
          // bills podem não existir pra contas BANK ou conexões não-OF; segue
        }
      } else {
        // Pra contas BANK, candidate bills do user (todas) pra matching de pagamento de fatura
        const { data: allBills } = await supabase
          .from('credit_card_bills').select('id, total_amount, due_date')
        candidateBills = allBills || []
      }

      // Lista tx desde fromDate
      const txs = await pluggyJson<{ results: PluggyTx[] }>(
        `/transactions?accountId=${account.pluggy_account_id}&from=${fromDate}&pageSize=500`
      )

      for (const tx of txs.results || []) {
        // Dedup
        const { data: existing } = await supabase
          .from('transactions').select('id').eq('pluggy_tx_id', tx.id).maybeSingle()
        if (existing) { skipped++; continue }

        // Classifica
        const cls = classify(tx, account, candidateBills)
        const billLocal = cls.pluggy_bill_id ? billsByPluggyId[cls.pluggy_bill_id] : (cls.bill_id || null)

        // monta amount: Pluggy retorna negativo pra DEBIT em conta corrente, positivo pra DEBIT no cartão (oposto)
        // Normalizamos pro modelo do app: amount sempre positivo, type indica direção
        const amountAbs = Math.abs(tx.amount)

        const { error: insErr } = await supabase.from('transactions').insert({
          user_id: user.id,
          account_id: account.id,
          pluggy_tx_id: tx.id,
          raw_payload: tx,
          source: 'pluggy',
          status: cls.status,
          type: cls.type,
          payment_source: cls.payment_source,
          amount: amountAbs,
          date: tx.date.slice(0, 10),
          description: tx.description || tx.descriptionRaw || '',
          month_ref: tx.date.slice(0, 7),
          bill_id: billLocal,
          card_number: cls.card_number || null,
        })
        if (insErr) { console.error('insert error', insErr); continue }

        if (cls.status === 'pending') pending++
        else inserted++
      }
    }

    // Pós-sync: detectar pares anuláveis (Aplicação + Resgate RDB)
    // Busca tx internas recentes desse user, sem linked_tx_id ainda
    const { data: internals } = await supabase
      .from('transactions')
      .select('id, amount, date, type, raw_payload, linked_tx_id')
      .eq('user_id', user.id)
      .eq('source', 'pluggy')
      .eq('type', 'transfer')
      .is('linked_tx_id', null)
      .gte('date', fromDate)
    if (internals) {
      const isRdbLocal = (t: any) => {
        const desc = t.raw_payload?.descriptionRaw || ''
        return RDB_KEYWORDS.some(k => desc.includes(k)) || RDB_OP_TYPES.includes(t.raw_payload?.operationType)
      }
      const rdb = internals.filter(isRdbLocal)
      const outs = rdb.filter(t => Number(t.raw_payload?.amount) < 0)
      const ins = rdb.filter(t => Number(t.raw_payload?.amount) > 0)
      const used = new Set<string>()
      for (const out of outs) {
        const outDate = new Date(out.date)
        const partner = ins.find(i => {
          if (used.has(i.id)) return false
          if (Math.abs(Number(out.amount) - Number(i.amount)) > 0.01) return false
          const days = Math.abs((+new Date(i.date) - +outDate) / 86400000)
          return days <= 1
        })
        if (partner) {
          await supabase.from('transactions').update({ linked_tx_id: partner.id, is_voided: true }).eq('id', out.id)
          await supabase.from('transactions').update({ linked_tx_id: out.id, is_voided: true }).eq('id', partner.id)
          used.add(partner.id)
        }
      }
    }

    // Atualiza last_sync_at
    await supabase.from('pluggy_items').update({
      last_sync_at: new Date().toISOString(),
      status: pluggyItem?.status || 'UPDATED',
    }).eq('id', itemId)

    return new Response(JSON.stringify({ inserted, pending, skipped }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return jsonError(String(err.message || err), 500)
  }
})

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
```

- [ ] **Step 2: Deploy**

```bash
supabase functions deploy pluggy-sync
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/pluggy-sync/
git commit -m "feat(pluggy): edge function pluggy-sync (force refresh + classify + dedup + voidable pairs)"
```

---

# Fase 5 — Frontend client (db helpers + hooks)

### Task 5.1: pluggyClient.js (wrapper das edge functions)

**Files:**
- Create: `src/lib/pluggyClient.js`

- [ ] **Step 1: Criar arquivo**

```js
// src/lib/pluggyClient.js
// Wrapper que invoca as Edge Functions da Pluggy. Usa supabase.functions.invoke pra autenticar.
import { supabase } from './supabase'

async function invoke(fnName, body = {}) {
  const { data, error } = await supabase.functions.invoke(fnName, { body })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

export const pluggyConnectToken = () => invoke('pluggy-connect-token')
export const pluggyCreateItem = (itemId) => invoke('pluggy-create-item', { itemId })
export const pluggyListItems = () => invoke('pluggy-list-items')
export const pluggyDeleteItem = (itemId) => invoke('pluggy-delete-item', { itemId })
export const pluggySync = (itemId) => invoke('pluggy-sync', { itemId })
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/pluggyClient.js
git commit -m "feat(pluggy): cliente JS para invocar edge functions"
```

---

### Task 5.2: db.js helpers novos

**Files:**
- Modify: `src/lib/db.js`

- [ ] **Step 1: Adicionar helpers no fim de db.js (antes do export final, se houver)**

Append ao `src/lib/db.js`:

```js
// ─── PLUGGY / ACCOUNTS / INBOX ───────────────────────────────────────────────
export const getAccounts = () =>
  supabase.from('accounts').select('*, pluggy_items(connector_name)').order('name')

export const updateAccount = (id, patch) =>
  supabase.from('accounts').update(patch).eq('id', id).select().single()

export const getPendingTransactions = (limit = 100) =>
  supabase.from('transactions')
    .select('*, accounts(name), categories(*)')
    .eq('status', 'pending')
    .order('date', { ascending: false })
    .limit(limit)

export const approveTransaction = (id, patch = {}) =>
  supabase.from('transactions').update({ status: 'approved', ...patch }).eq('id', id)

export const ignoreTransaction = (id) =>
  supabase.from('transactions').update({ status: 'ignored' }).eq('id', id)

export const getCreditCardBills = () =>
  supabase.from('credit_card_bills')
    .select('*, accounts(name)')
    .order('due_date', { ascending: false })

export const getUserSettings = async () => {
  const { data } = await supabase.from('user_settings').select('*').maybeSingle()
  return data
}

export const updateUserSettings = (patch) =>
  supabase.from('user_settings').upsert(patch, { onConflict: 'user_id' }).select().single()
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/db.js
git commit -m "feat(pluggy): db helpers — accounts, pending tx, bills, user_settings"
```

---

### Task 5.3: usePluggy hooks

**Files:**
- Create: `src/hooks/usePluggy.js`

- [ ] **Step 1: Criar arquivo**

```js
// src/hooks/usePluggy.js
import { useState, useEffect, useCallback } from 'react'
import * as db from '../lib/db'
import * as pluggy from '../lib/pluggyClient'
import { supabase } from '../lib/supabase'

export function useConnections() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await pluggy.pluggyListItems()
      setItems(data.items || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('pluggy_items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pluggy_items' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { items, loading, refetch: load }
}

export function useAccounts() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await db.getAccounts()
    setAccounts(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('accounts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { accounts, loading, refetch: load }
}

export function usePendingTransactions() {
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await db.getPendingTransactions()
    setPending(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('pending_tx')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { pending, loading, refetch: load }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/usePluggy.js
git commit -m "feat(pluggy): hooks useConnections/useAccounts/usePendingTransactions"
```

---

# Fase 6 — Tela /connections

### Task 6.1: ConnectionsPage skeleton

**Files:**
- Create: `src/pages/ConnectionsPage.jsx`
- Modify: `src/App.jsx`
- Modify: `src/components/layout/Layout.jsx`

- [ ] **Step 1: Criar ConnectionsPage**

```jsx
// src/pages/ConnectionsPage.jsx
import { useState } from 'react'
import { Plus, RefreshCw, Trash2, Link2 } from 'lucide-react'
import { useConnections, useAccounts } from '../hooks/usePluggy'
import { pluggySync, pluggyDeleteItem, pluggyConnectToken, pluggyCreateItem } from '../lib/pluggyClient'
import { updateAccount } from '../lib/db'
import { PluggyConnect } from 'pluggy-connect-sdk'

const STATUS_BADGE = {
  UPDATED: 'badge bg-emerald-500/15 text-emerald-300',
  OUTDATED: 'badge bg-amber-500/15 text-amber-300',
  LOGIN_IN_PROGRESS: 'badge bg-blue-500/15 text-blue-300',
  WAITING_USER_INPUT: 'badge bg-amber-500/15 text-amber-300',
  ERROR: 'badge bg-red-500/15 text-red-300',
}

export default function ConnectionsPage() {
  const { items, refetch } = useConnections()
  const { accounts, refetch: refetchAccounts } = useAccounts()
  const [syncing, setSyncing] = useState(null)
  const [error, setError] = useState('')

  async function handleSync(id) {
    setSyncing(id); setError('')
    try {
      const r = await pluggySync(id)
      alert(`Sincronizado: ${r.inserted} novas · ${r.pending} pendentes · ${r.skipped} duplicadas`)
      refetch(); refetchAccounts()
    } catch (e) {
      setError(e.message)
    } finally {
      setSyncing(null)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Desconectar essa conexão? As tx ficam, mas novas sync param.')) return
    try {
      await pluggyDeleteItem(id)
      refetch(); refetchAccounts()
    } catch (e) {
      setError(e.message)
    }
  }

  async function handleNew() {
    try {
      const { accessToken } = await pluggyConnectToken()
      const widget = new PluggyConnect({
        connectToken: accessToken,
        includeSandbox: false,
        onSuccess: async ({ item }) => {
          try {
            await pluggyCreateItem(item.id)
            refetch(); refetchAccounts()
          } catch (e) {
            setError(e.message)
          }
        },
        onError: (err) => setError(err.message || 'Erro no widget'),
      })
      widget.init()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Conexões</h1>
          <p className="text-xs text-gray-500 mt-0.5">{items.length} ativa(s)</p>
        </div>
        <button onClick={handleNew} className="btn-primary flex items-center gap-1.5 text-sm">
          <Plus size={16}/> Nova conexão
        </button>
      </div>

      {error && <div className="card bg-red-500/10 border-red-500/30 text-red-400 text-sm">{error}</div>}

      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link2 size={18} className="text-emerald-400"/>
                <div>
                  <p className="text-sm font-semibold text-white">{item.connector_name}</p>
                  <p className="text-xs text-gray-500">
                    Última sync: {item.last_sync_at ? new Date(item.last_sync_at).toLocaleString('pt-BR') : 'nunca'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={STATUS_BADGE[item.status] || 'badge bg-gray-700 text-gray-400'}>{item.status}</span>
                <button onClick={() => handleSync(item.id)} disabled={syncing === item.id} className="btn-ghost text-xs flex items-center gap-1">
                  <RefreshCw size={12} className={syncing === item.id ? 'animate-spin' : ''}/> Sincronizar
                </button>
                <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-300 p-1">
                  <Trash2 size={14}/>
                </button>
              </div>
            </div>
            <div className="border-t border-gray-800 pt-2 space-y-2">
              <p className="text-xs text-gray-500">Contas:</p>
              {(item.accounts || []).map(acc => {
                const local = accounts.find(a => a.id === acc.id) || acc
                return (
                  <div key={acc.id} className="flex items-center justify-between text-xs">
                    <span className="text-gray-300">{acc.name} · {acc.type}</span>
                    <select
                      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs"
                      value={local.payment_source}
                      onChange={async (e) => {
                        await updateAccount(acc.id, { payment_source: e.target.value })
                        refetchAccounts()
                      }}
                    >
                      <option value="fixed_income">Renda Fixa</option>
                      <option value="variable_income">Renda Variável</option>
                      <option value="credit">Crédito</option>
                    </select>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="card text-center py-10">
            <p className="text-gray-500 text-sm">Nenhuma conexão ainda.</p>
            <p className="text-xs text-gray-600 mt-1">Clique em "+ Nova conexão" pra autorizar seu primeiro banco.</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Adicionar rota em App.jsx**

Em `src/App.jsx`, importar e adicionar Route:

```jsx
import ConnectionsPage from './pages/ConnectionsPage'
// ...
<Route path="/connections" element={<ConnectionsPage/>} />
```

(Localizar o componente `<Routes>` e adicionar dentro dele.)

- [ ] **Step 3: Adicionar item no Layout**

Em `src/components/layout/Layout.jsx`, adicionar `Link2` no import de `lucide-react`. Adicionar item em `SIDEBAR_NAV`:

```js
{ to: '/connections', icon: Link2, label: 'Conexões' },
```

- [ ] **Step 4: Build pra validar**

```bash
npm run build
```

Esperado: build limpo.

- [ ] **Step 5: Commit**

```bash
git add src/pages/ConnectionsPage.jsx src/App.jsx src/components/layout/Layout.jsx
git commit -m "feat(pluggy): tela /connections com listagem, sync, delete e widget"
```

---

# Fase 7 — Tela /inbox

### Task 7.1: InboxPage

**Files:**
- Create: `src/pages/InboxPage.jsx`
- Modify: `src/App.jsx`
- Modify: `src/components/layout/Layout.jsx`

- [ ] **Step 1: Criar InboxPage**

```jsx
// src/pages/InboxPage.jsx
import { useState } from 'react'
import { CheckCircle2, X, Inbox as InboxIcon } from 'lucide-react'
import { usePendingTransactions } from '../hooks/usePluggy'
import { approveTransaction, ignoreTransaction } from '../lib/db'
import { PAYMENT_SOURCE_LABELS } from '../lib/budgetEngine'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const TYPE_LABEL = { income: 'Receita', expense: 'Despesa', transfer: 'Transferência', investment: 'Investimento' }

export default function InboxPage() {
  const { pending, refetch } = usePendingTransactions()
  const [working, setWorking] = useState(null)

  async function handleApprove(tx, patch = {}) {
    setWorking(tx.id)
    await approveTransaction(tx.id, patch)
    refetch()
    setWorking(null)
  }

  async function handleIgnore(tx) {
    if (!confirm('Descartar essa transação? Ela não vai entrar nos KPIs.')) return
    setWorking(tx.id)
    await ignoreTransaction(tx.id)
    refetch()
    setWorking(null)
  }

  async function handleApproveAll() {
    if (!confirm(`Aprovar todas as ${pending.length} pendentes?`)) return
    for (const tx of pending) await approveTransaction(tx.id)
    refetch()
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2"><InboxIcon size={20}/> Inbox</h1>
          <p className="text-xs text-gray-500 mt-0.5">{pending.length} pendente(s) pra revisar</p>
        </div>
        {pending.length > 0 && (
          <button onClick={handleApproveAll} className="btn-primary text-sm flex items-center gap-1.5">
            <CheckCircle2 size={14}/> Aprovar todas
          </button>
        )}
      </div>

      {pending.length === 0 && (
        <div className="card text-center py-10">
          <p className="text-emerald-400 text-sm">Tudo classificado ✓</p>
        </div>
      )}

      <div className="space-y-2">
        {pending.map(tx => (
          <div key={tx.id} className="card space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{tx.description || tx.raw_payload?.descriptionRaw}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-xs text-gray-500">{tx.date}</span>
                  <span className="text-xs text-gray-500">· {tx.accounts?.name}</span>
                  <span className="badge bg-gray-700 text-gray-400 text-[10px]">{TYPE_LABEL[tx.type]}</span>
                  <span className="badge bg-gray-700 text-gray-400 text-[10px]">{PAYMENT_SOURCE_LABELS[tx.payment_source]}</span>
                </div>
              </div>
              <p className={`text-sm font-bold ${tx.type === 'income' ? 'text-emerald-400' : 'text-red-400'}`}>
                {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
              </p>
            </div>
            <div className="flex gap-2 pt-1 border-t border-gray-800">
              <button onClick={() => handleApprove(tx)} disabled={working === tx.id} className="btn-primary text-xs flex-1 flex items-center justify-center gap-1">
                <CheckCircle2 size={12}/> Aprovar
              </button>
              <button onClick={() => handleIgnore(tx)} disabled={working === tx.id} className="btn-ghost text-xs flex-1 flex items-center justify-center gap-1">
                <X size={12}/> Descartar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Adicionar rota e item no Layout**

Em `src/App.jsx`:
```jsx
import InboxPage from './pages/InboxPage'
// ...
<Route path="/inbox" element={<InboxPage/>} />
```

Em `src/components/layout/Layout.jsx`, adicionar `Inbox` no import lucide-react. E em `SIDEBAR_NAV`:
```js
{ to: '/inbox', icon: Inbox, label: 'Inbox' },
```

- [ ] **Step 3: Build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/InboxPage.jsx src/App.jsx src/components/layout/Layout.jsx
git commit -m "feat(pluggy): tela /inbox com pending tx e bulk approve"
```

---

# Fase 8 — Ajustes em pages existentes

### Task 8.1: Botão "Sincronizar" no Dashboard com contador

**Files:**
- Modify: `src/pages/DashboardPage.jsx`

- [ ] **Step 1: Adicionar import e estado**

Em `src/pages/DashboardPage.jsx`, no topo:

```jsx
import { useConnections, usePendingTransactions } from '../hooks/usePluggy'
import { pluggySync } from '../lib/pluggyClient'
```

Dentro do componente DashboardPage, antes do return:

```jsx
const { items: connections } = useConnections()
const { pending } = usePendingTransactions()
const [syncing, setSyncing] = useState(false)

async function handleSyncAll() {
  setSyncing(true)
  let total = { inserted: 0, pending: 0 }
  for (const c of connections) {
    try {
      const r = await pluggySync(c.id)
      total.inserted += r.inserted
      total.pending += r.pending
    } catch (e) { /* segue */ }
  }
  setSyncing(false)
  alert(`Sincronizado: ${total.inserted} novas, ${total.pending} pendentes`)
}
```

- [ ] **Step 2: Adicionar botão no header do Dashboard**

No JSX do header (procurar o `<button onClick={() => navigate('/chat')}>`), adicionar antes:

```jsx
{connections.length > 0 && (
  <button onClick={handleSyncAll} disabled={syncing}
    className={`btn-ghost flex items-center gap-1.5 text-sm ${pending.length > 0 ? 'border-amber-500/50 text-amber-300' : ''}`}>
    <RefreshCw size={14} className={syncing ? 'animate-spin' : ''}/>
    Sincronizar{pending.length > 0 ? ` (${pending.length})` : ''}
  </button>
)}
```

E adicionar `RefreshCw` no import de lucide-react.

- [ ] **Step 3: Build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/DashboardPage.jsx
git commit -m "feat(pluggy): botao sincronizar com contador de pendentes no Dashboard"
```

---

### Task 8.2: Badge fonte + tx anuladas em TransactionsPage

**Files:**
- Modify: `src/pages/TransactionsPage.jsx`

- [ ] **Step 1: Adicionar badges de source e voided**

Em `src/pages/TransactionsPage.jsx`, encontrar onde renderiza cada tx (procurar `tx.payment_source &&`). Adicionar antes do payment_source:

```jsx
{tx.source === 'pluggy' && <span className="badge bg-blue-500/15 text-blue-300 text-[10px]">🔌</span>}
{tx.is_voided && <span className="badge bg-gray-700 text-gray-500 text-[10px]">anulado</span>}
```

E na linha do amount, adicionar `${tx.is_voided ? 'opacity-40 line-through' : ''}` à className.

- [ ] **Step 2: Filtrar tx voided do "Saiu" se quiser (opcional — já está documentado que não conta)**

Onde computa `gastoSemana` e similares, adicionar `&& !t.is_voided`:

```jsx
.filter(t => t.type === 'expense' && bucketOf(t.payment_source) === 'income' && !t.is_voided)
```

E no `for (const t of transactions)` do `metrics` useMemo, adicionar early continue:

```js
if (t.is_voided) continue
```

- [ ] **Step 3: Build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/TransactionsPage.jsx
git commit -m "feat(pluggy): badge de fonte + ignora tx anuladas em metrics"
```

---

### Task 8.3: Filtro por account em TransactionsPage

**Files:**
- Modify: `src/pages/TransactionsPage.jsx`

- [ ] **Step 1: Adicionar import de useAccounts e estado**

```jsx
import { useAccounts } from '../hooks/usePluggy'
// ...
const { accounts } = useAccounts()
const [filterAccount, setFilterAccount] = useState('all')
```

- [ ] **Step 2: Adicionar dropdown no header de filtros**

Localizar onde estão os botões `setFilterType` (Todos, Receita, Despesa, etc.) e adicionar um select ao lado:

```jsx
<select className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-gray-200"
  value={filterAccount} onChange={e => setFilterAccount(e.target.value)}>
  <option value="all">Todas as contas</option>
  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
</select>
```

- [ ] **Step 3: Aplicar filtro**

Onde calcula `filtered`:

```js
const filtered = transactions
  .filter(t => filterType === 'all' || t.type === filterType)
  .filter(t => filterAccount === 'all' || t.account_id === filterAccount)
```

- [ ] **Step 4: Build + commit**

```bash
npm run build
git add src/pages/TransactionsPage.jsx
git commit -m "feat(pluggy): filtro por account em TransactionsPage"
```

---

### Task 8.4: TxModal — campo Conta + Vincular meta

**Files:**
- Modify: `src/pages/TransactionsPage.jsx`

- [ ] **Step 1: Passar accounts e goals pro TxModal**

Localizar `<TxModal ... />` no JSX. Adicionar props `accounts` e `goals`:

```jsx
<TxModal ... accounts={accounts} goals={goals}/>
```

E carregar `goals` via hook:
```jsx
import { useGoals } from '../hooks/useData'
// ...
const { goals } = useGoals()
```

- [ ] **Step 2: Adicionar campos no TxModal**

Dentro de `function TxModal(...)`, encontrar o JSX dos campos. Adicionar após o campo de description (ou onde fizer sentido):

```jsx
<div>
  <label className="label">Conta (opcional)</label>
  <select className="input" value={form.account_id || ''} onChange={e => set('account_id', e.target.value || null)}>
    <option value="">— Sem conta —</option>
    {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
  </select>
</div>

<div>
  <label className="label">Vincular à meta (opcional)</label>
  <select className="input" value={form.goal_id || ''} onChange={e => set('goal_id', e.target.value || null)}>
    <option value="">— Sem meta —</option>
    {goals.filter(g => !g.is_completed).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
  </select>
</div>
```

E receber `accounts` e `goals` na assinatura:
```jsx
function TxModal({ onClose, onSaved, initial, categories, userId, reservaSnapshot, accounts = [], goals = [] }) {
```

E no payload do save, garantir que `account_id` e `goal_id` vão:
```js
const payload = {
  ...form,
  amount: parseFloat(form.amount),
  user_id: userId,
  category_id: form.category_id || null,
  account_id: form.account_id || null,
  goal_id: form.goal_id || null,
  budget_item_id: null,
}
```

- [ ] **Step 3: Build + commit**

```bash
npm run build
git add src/pages/TransactionsPage.jsx
git commit -m "feat(pluggy): TxModal com campos Conta e Vincular meta"
```

---

# Fase 9 — Vínculo meta-tx (sub-projeto C)

### Task 9.1: GoalsPage — current_amount derivado

**Files:**
- Modify: `src/pages/GoalsPage.jsx`

- [ ] **Step 1: Buscar tx vinculadas a metas**

Adiciona import:
```jsx
import { useTransactions, useMonthRef } from '../hooks/useData'
```

Dentro do componente:
```jsx
const { monthRef } = useMonthRef()
const { transactions } = useTransactions(monthRef)

function computeGoalAmount(goalId) {
  // Soma transfers (aporte) - expenses (consumiu reserva)
  let amount = 0
  for (const t of transactions) {
    if (t.goal_id !== goalId) continue
    if (t.type === 'transfer') amount += Number(t.amount)
    else if (t.type === 'expense') amount -= Number(t.amount)
  }
  return Math.max(amount, 0)
}
```

- [ ] **Step 2: Substituir uso de g.current_amount pela função**

Localizar onde `g.current_amount` é renderizado. Substituir por `computeGoalAmount(g.id)`.

Exemplo:
```jsx
<span>{fmtBRL(computeGoalAmount(g.id))}</span> / <span>{fmtBRL(g.target_amount)}</span>
```

- [ ] **Step 3: Mostrar lista de tx vinculadas (audit trail) — opcional pro MVP**

Pode pular pro MVP. Se quiser:
```jsx
<details className="mt-2">
  <summary className="text-xs text-gray-500 cursor-pointer">Tx vinculadas</summary>
  <ul className="text-xs text-gray-400 mt-1 space-y-0.5">
    {transactions.filter(t => t.goal_id === g.id).map(t => (
      <li key={t.id}>{t.date} · {t.description} · {t.type === 'transfer' ? '+' : '-'}{fmtBRL(t.amount)}</li>
    ))}
  </ul>
</details>
```

- [ ] **Step 4: Build + commit**

```bash
npm run build
git add src/pages/GoalsPage.jsx
git commit -m "feat(pluggy): GoalsPage com current_amount derivado das tx vinculadas"
```

---

# Fase 10 — Faturas de cartão (sub-projeto D)

### Task 10.1: BillsPage ganha aba Faturas de Cartão

**Files:**
- Modify: `src/pages/BillsPage.jsx`

- [ ] **Step 1: Adicionar hook + estado de aba**

No topo de BillsPage:
```jsx
import { useState, useEffect } from 'react'
import { CreditCard } from 'lucide-react'
import { getCreditCardBills } from '../lib/db'
```

Dentro do componente, adicionar:
```jsx
const [tab, setTab] = useState('lembretes') // 'lembretes' | 'faturas'
const [creditBills, setCreditBills] = useState([])

useEffect(() => {
  if (tab === 'faturas') {
    getCreditCardBills().then(({ data }) => setCreditBills(data || []))
  }
}, [tab])
```

- [ ] **Step 2: Adicionar tabs no header**

Antes do conteúdo principal:
```jsx
<div className="grid grid-cols-2 gap-2 mb-4">
  <button onClick={() => setTab('lembretes')}
    className={`py-2 rounded-xl text-sm font-medium border ${tab === 'lembretes' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-gray-700 text-gray-400'}`}>
    Lembretes
  </button>
  <button onClick={() => setTab('faturas')}
    className={`py-2 rounded-xl text-sm font-medium border flex items-center justify-center gap-1.5 ${tab === 'faturas' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-gray-700 text-gray-400'}`}>
    <CreditCard size={14}/> Faturas de Cartão
  </button>
</div>
```

- [ ] **Step 3: Renderizar aba faturas**

Wrap o conteúdo atual de "lembretes" com `{tab === 'lembretes' && (...)}`. Adicionar:

```jsx
{tab === 'faturas' && (
  <div className="space-y-2">
    {creditBills.length === 0 && (
      <div className="card text-center py-8 text-sm text-gray-500">Nenhuma fatura sincronizada ainda.</div>
    )}
    {creditBills.map(b => (
      <div key={b.id} className="card flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-white">{b.accounts?.name}</p>
          <p className="text-xs text-gray-500">Vence {b.due_date}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-white">R$ {Number(b.total_amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <p className={`text-xs font-semibold ${b.status === 'PAID' ? 'text-emerald-400' : b.status === 'PARTIAL' ? 'text-amber-400' : 'text-red-400'}`}>
            {b.status === 'PAID' ? 'Paga' : b.status === 'PARTIAL' ? `Parcial — R$ ${Number(b.paid_amount).toFixed(2)}` : 'Aberta'}
          </p>
        </div>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 4: Build + commit**

```bash
npm run build
git add src/pages/BillsPage.jsx
git commit -m "feat(pluggy): aba Faturas de Cartao em BillsPage"
```

---

# Fase 11 — Validação ponta-a-ponta

Tarefas manuais. Cada uma marca um critério da seção 9 (Métricas) do spec.

### Task 11.1: Conectar NuBank + PicPay e validar widget

- [ ] **Step 1: Rodar dev server**

```bash
npm run dev
```

- [ ] **Step 2: Abrir /connections no app**

- [ ] **Step 3: Clicar "+ Nova conexão"**

Esperado: widget Pluggy abre.

- [ ] **Step 4: Selecionar NuBank → autorizar via OAuth**

Esperado: callback `onSuccess` dispara, item aparece na lista de conexões com status `UPDATED`.

- [ ] **Step 5: Repetir pra PicPay**

Esperado: 2 conexões na tela.

- [ ] **Step 6: Validar accounts criadas**

No SQL Editor do Supabase:
```sql
SELECT name, type, payment_source FROM accounts WHERE user_id = auth.uid() ORDER BY name;
```

Esperado: linhas pra cada conta exposta pelo Pluggy (NuBank Conta, NuBank Cartão, PicPay Cartão).

---

### Task 11.2: Sincronizar e validar tx + classificação

- [ ] **Step 1: Clicar "Sincronizar" em uma das conexões**

Esperado: alert com `inserted: N · pending: M · skipped: 0`.

- [ ] **Step 2: Validar tx no banco**

```sql
SELECT date, description, amount, type, payment_source, status, source FROM transactions
WHERE source = 'pluggy' ORDER BY date DESC LIMIT 20;
```

Esperado: linhas com `source='pluggy'` e classificação plausível.

- [ ] **Step 3: Validar inbox**

Acessar `/inbox`. Esperado: tx com `status='pending'` listadas.

---

### Task 11.3: Validar pares anuláveis (RDB)

- [ ] **Step 1: Buscar pares vinculados**

```sql
SELECT id, description, amount, linked_tx_id, is_voided FROM transactions
WHERE source = 'pluggy' AND linked_tx_id IS NOT NULL
ORDER BY date DESC;
```

Esperado: pares com `is_voided=true` referenciando-se mutuamente, descrição "Aplicação RDB" + "Resgate RDB".

- [ ] **Step 2: Validar UI em Lançamentos**

Acessar `/transactions`. As tx voided devem aparecer em cinza/risco (badge "anulado").

---

### Task 11.4: Validar pagamento de fatura

- [ ] **Step 1: Buscar tx com bill_id**

```sql
SELECT t.date, t.description, t.amount, t.bill_id, b.due_date, b.total_amount, b.status
FROM transactions t JOIN credit_card_bills b ON t.bill_id = b.id
WHERE t.source = 'pluggy' ORDER BY t.date DESC;
```

Esperado: tx "Pagamento de fatura" vinculadas com a bill correspondente; `status='PAID'` na bill.

- [ ] **Step 2: Validar UI em /bills aba Faturas**

A fatura deve aparecer com status correto (Paga, Parcial, Aberta).

---

### Task 11.5: Validar lançamento manual + vínculo meta

- [ ] **Step 1: Em /transactions, criar nova tx tipo `transfer`, valor 100, vincular à meta "Cadeira"**

Esperado: tx criada com `goal_id` setado.

- [ ] **Step 2: Em /goals, validar current_amount**

Esperado: `current_amount` da meta Cadeira aumenta em R$ 100.

- [ ] **Step 3: Criar nova tx tipo `expense`, valor 50, vincular à mesma meta**

Esperado: `current_amount` da meta cai em R$ 50.

---

### Task 11.6: Smoke geral + script audit

- [ ] **Step 1: Rodar audit script**

```bash
SUPABASE_SECRET=sb_secret_... python scripts/audit.py --month 2026-05
```

Esperado: JSON sai limpo, números batem com o que a UI mostra.

- [ ] **Step 2: Validar Dashboard**

Acessar `/`. KPIs de Renda + Crédito + Reserva devem refletir o cutoff (tx Pluggy contam, manual antiga conta).

- [ ] **Step 3: Commit final do MVP**

```bash
git commit --allow-empty -m "milestone(pluggy): MVP integracao Pluggy validado ponta-a-ponta"
```

---

# Critérios de Done (do spec — métricas de sucesso)

Verifica cada item antes de considerar o MVP completo:

- [ ] Conectar NuBank + PicPay via widget sem erro (Task 11.1)
- [ ] Sincronizar manualmente puxa N tx novas em <30s (Task 11.2)
- [ ] Pares Aplicação+Resgate RDB são detectados como anuláveis (Task 11.3)
- [ ] "Pagamento de fatura" não aparece como gasto novo, vincula com bill (Task 11.4)
- [ ] Inbox tem ações de aprovar/editar/descartar funcionando (Task 11.2)
- [ ] Lançamento manual segue funcionando sem mudança no fluxo (Task 11.5)
- [ ] Dashboard mostra `saldoDisponivel` correto considerando tx Pluggy + manual + cutoff (Task 11.6)
- [ ] Vínculo meta-tx funcional (Task 11.5)
- [ ] Faturas de cartão aparecem em `/bills` com status correto (Task 11.4)
