# Onda 3 — Multi-conta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar suporte a múltiplas contas (NuBank Conta, NuBank Crédito, PicPay Crédito, Biplay empréstimo, Aluguel envelope) no FinAPP. Cada tx ganha vínculo com uma `account` (ou par From/Para pra transferências internas). UI nova em /settings pra CRUD de contas.

**Architecture:** 3 migrations SQL (backup → wipe → accounts) + tabela `accounts` com RLS + 3 colunas FK em `transactions` (`account_id`, `from_account_id`, `to_account_id`). UI cresce em SettingsPage (seção Contas + modal) e TransactionsPage (TxModal estendido + badge + filtro). Reset clean de dados após backup.

**Tech Stack:** React 19, Vite 8, Supabase, date-fns, lucide-react.

**Spec:** [docs/superpowers/specs/2026-05-14-onda3-multiconta-design.md](docs/superpowers/specs/2026-05-14-onda3-multiconta-design.md)

**Branch:** `auditoria-features` (já checada)

---

## File Structure

| Arquivo | Ação | Responsabilidade após mudança |
|---|---|---|
| `migration_backup_pre_onda3.sql` | CRIAR | Schema `backup_2026_05_14` com cópia das tabelas (snapshot pré-wipe) |
| `migration_wipe_pre_onda3.sql` | CRIAR | DELETE das tabelas do user_id Carlos |
| `migration_accounts.sql` | CRIAR | Tabela `accounts` + colunas FK em `transactions` + RLS + indexes |
| `src/lib/db.js` | MODIFICAR | Append helpers `getAccounts`, `getAllAccounts`, `upsertAccount`, `deactivateAccount` |
| `src/hooks/useData.js` | MODIFICAR | Append hook `useAccounts` |
| `src/pages/SettingsPage.jsx` | MODIFICAR | Nova seção "Contas" + AccountModal CRUD |
| `src/pages/TransactionsPage.jsx` | MODIFICAR | TxModal estendido (campo Conta / De+Para), badge de conta na lista, filtro por conta |
| `INVENTARIO.md` | MODIFICAR | Adicionar seção Contas + entry de Onda 3 no histórico |

---

## Validation Strategy

- Sem testes unitários novos (lógica simples)
- `npm run build` limpo após cada commit
- Smoke test manual do user no fim:
  - Aplicar migrations 1→2→3 no Dashboard
  - Cadastrar 5 contas em /settings
  - Configurar ciclo novo
  - Lançar tx de cada tipo

**USER ACTIONS:** o user aplica as 3 migrations no Supabase Dashboard manualmente (CLI instável, conforme combinado). Plano não tenta aplicar via código.

---

### Task 1: Migration `migration_backup_pre_onda3.sql`

Cria schema separado com cópia das tabelas atuais. Permite rollback via SQL caso o user mude de ideia.

**Files:**
- Create: `migration_backup_pre_onda3.sql` (raiz do projeto)

- [ ] **Step 1: Criar arquivo SQL**

```sql
-- migration_backup_pre_onda3.sql
-- Backup das tabelas antes do wipe da Onda 3 (multi-conta).
-- Schema separado pra preservar histórico sem poluir public.
-- Aplica ANTES de migration_wipe_pre_onda3.sql.

CREATE SCHEMA IF NOT EXISTS backup_2026_05_14;

CREATE TABLE backup_2026_05_14.transactions  AS SELECT * FROM public.transactions;
CREATE TABLE backup_2026_05_14.bills         AS SELECT * FROM public.bills;
CREATE TABLE backup_2026_05_14.budget_items  AS SELECT * FROM public.budget_items;
CREATE TABLE backup_2026_05_14.budget_cycles AS SELECT * FROM public.budget_cycles;
CREATE TABLE backup_2026_05_14.goals         AS SELECT * FROM public.goals;
```

- [ ] **Step 2: Commit**

```bash
git add migration_backup_pre_onda3.sql
git commit -m "feat(migration): backup_pre_onda3 — schema backup_2026_05_14 com copia das tabelas"
```

---

### Task 2: Migration `migration_wipe_pre_onda3.sql`

DELETE dos dados do user Carlos. Aplicar SÓ depois do backup confirmar sucesso.

**Files:**
- Create: `migration_wipe_pre_onda3.sql` (raiz do projeto)

- [ ] **Step 1: Criar arquivo SQL**

```sql
-- migration_wipe_pre_onda3.sql
-- Wipe das tabelas do usuário Carlos (id 49d01efc-e309-49be-98f2-684d0d4548e2).
-- PRÉ-CONDIÇÃO: migration_backup_pre_onda3.sql aplicada com sucesso.
-- Aplicar APÓS confirmar backup.

DELETE FROM transactions  WHERE user_id = '49d01efc-e309-49be-98f2-684d0d4548e2';
DELETE FROM bills         WHERE user_id = '49d01efc-e309-49be-98f2-684d0d4548e2';
DELETE FROM budget_items  WHERE user_id = '49d01efc-e309-49be-98f2-684d0d4548e2';
DELETE FROM budget_cycles WHERE user_id = '49d01efc-e309-49be-98f2-684d0d4548e2';
DELETE FROM goals         WHERE user_id = '49d01efc-e309-49be-98f2-684d0d4548e2';
```

- [ ] **Step 2: Commit**

```bash
git add migration_wipe_pre_onda3.sql
git commit -m "feat(migration): wipe_pre_onda3 — DELETE dos dados do user"
```

---

### Task 3: Migration `migration_accounts.sql`

Cria a tabela `accounts` + colunas em `transactions` + RLS + indexes.

**Files:**
- Create: `migration_accounts.sql` (raiz do projeto)

- [ ] **Step 1: Criar arquivo SQL**

```sql
-- migration_accounts.sql
-- Tabela de contas (multi-conta da Onda 3).
-- Adiciona account_id / from_account_id / to_account_id em transactions.

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('bank', 'credit', 'envelope')),
  subtype text,
  default_payment_source text CHECK (default_payment_source IN ('fixed_income','variable_income','credit','reserve')),
  is_active boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS account_id      uuid REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS from_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS to_account_id   uuid REFERENCES accounts(id) ON DELETE SET NULL;

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user owns accounts" ON accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_accounts_user
  ON accounts(user_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_transactions_account
  ON transactions(account_id) WHERE account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_from_account
  ON transactions(from_account_id) WHERE from_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_to_account
  ON transactions(to_account_id) WHERE to_account_id IS NOT NULL;
```

- [ ] **Step 2: Commit**

```bash
git add migration_accounts.sql
git commit -m "feat(migration): accounts — tabela accounts + account_id/from/to em transactions"
```

---

### Task 4: db helpers + useAccounts hook

**Files:**
- Modify: `src/lib/db.js`
- Modify: `src/hooks/useData.js`

- [ ] **Step 1: Append helpers em `src/lib/db.js`**

No FINAL do arquivo `src/lib/db.js` (após `getAIContext` que termina com `}`):

```js

// ─── ACCOUNTS (Onda 3 — multi-conta) ────────────────────────────────────────
export const getAccounts = () =>
  supabase.from('accounts').select('*').eq('is_active', true).order('display_order').order('name')

export const getAllAccounts = () =>
  supabase.from('accounts').select('*').order('display_order').order('name')

export const upsertAccount = (account) => {
  if (account.id) {
    return supabase
      .from('accounts')
      .update({ ...account, updated_at: new Date().toISOString() })
      .eq('id', account.id)
      .select()
      .single()
  }
  return supabase.from('accounts').insert(account).select().single()
}

export const deactivateAccount = (id) =>
  supabase.from('accounts').update({ is_active: false }).eq('id', id)
```

- [ ] **Step 2: Append hook em `src/hooks/useData.js`**

No FINAL do arquivo `src/hooks/useData.js` (após `useGoalLinkedTransactions` que termina com `}`):

```js

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
    const ch = supabase.channel('accounts').on('postgres_changes', { event: '*', schema: 'public', table: 'accounts' }, load).subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { accounts, loading, refetch: load }
}
```

- [ ] **Step 3: Build pra validar**

Run: `npm run build`
Expected: build limpo. Pode dar warning de unused export se algum helper não for usado em outro lugar ainda — aceitável (vão ser usados nas próximas tasks).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.js src/hooks/useData.js
git commit -m "feat(accounts): db helpers + useAccounts hook"
```

---

### Task 5: SettingsPage com seção Contas + AccountModal CRUD

**Files:**
- Modify: `src/pages/SettingsPage.jsx`

Hoje SettingsPage é só edição de perfil. Vamos adicionar:
1. Componente `AccountModal` (definido no mesmo arquivo)
2. Seção "Contas" listando, editando, criando

- [ ] **Step 1: Adicionar imports e estado**

No topo de `src/pages/SettingsPage.jsx`, substituir os imports atuais por:

```jsx
import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Save, User, Mail, Bell, Shield, Wallet, Plus, Edit2, EyeOff } from 'lucide-react'
import { useAccounts } from '../hooks/useData'
import { upsertAccount, deactivateAccount } from '../lib/db'
```

- [ ] **Step 2: Adicionar componente `AccountModal` no mesmo arquivo**

ANTES do `export default function SettingsPage`, adicionar:

```jsx
const ACCOUNT_TYPE_LABELS = {
  bank: 'Conta bancária',
  credit: 'Cartão / Crédito',
  envelope: 'Envelope virtual',
}

const PAYMENT_SOURCE_LABELS = {
  fixed_income: 'Renda fixa',
  variable_income: 'Renda variável',
  credit: 'Crédito',
  reserve: 'Reserva',
}

const EMPTY_ACCOUNT = {
  name: '',
  type: 'bank',
  subtype: '',
  default_payment_source: 'fixed_income',
  is_active: true,
  display_order: 0,
  notes: '',
}

function defaultPaymentSourceForType(type) {
  if (type === 'credit') return 'credit'
  if (type === 'envelope') return 'variable_income'
  return 'fixed_income'
}

function AccountModal({ initial, userId, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    if (initial?.id) return { ...EMPTY_ACCOUNT, ...initial }
    return EMPTY_ACCOUNT
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => {
    setForm(f => {
      const next = { ...f, [k]: v }
      // Quando muda type, atualiza default_payment_source automaticamente
      if (k === 'type') {
        next.default_payment_source = defaultPaymentSourceForType(v)
      }
      return next
    })
  }

  async function save() {
    setError('')
    if (!form.name.trim()) return setError('Informe um nome.')
    setSaving(true)
    const { categories, ...clean } = form
    const payload = { ...clean, user_id: userId, display_order: Number(form.display_order) || 0 }
    const { error: err } = await upsertAccount(payload)
    setSaving(false)
    if (err) return setError(err.message || 'Falha ao salvar conta.')
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="font-bold text-lg text-white">{form.id ? 'Editar' : 'Nova'} conta</h2>

        <div>
          <label className="label">Nome</label>
          <input className="input" placeholder="Ex: NuBank Conta Corrente" value={form.name} onChange={e => set('name', e.target.value)} />
        </div>

        <div>
          <label className="label">Tipo</label>
          <select className="input" value={form.type} onChange={e => set('type', e.target.value)}>
            {Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Subtipo (opcional)</label>
          <input className="input" placeholder="Ex: checking, credit_card, loan, shared" value={form.subtype || ''} onChange={e => set('subtype', e.target.value)} />
        </div>

        <div>
          <label className="label">Fonte de pagamento padrão</label>
          <select className="input" value={form.default_payment_source} onChange={e => set('default_payment_source', e.target.value)}>
            {Object.entries(PAYMENT_SOURCE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <p className="text-xs text-gray-600 mt-1">Preenchido automaticamente ao escolher essa conta no lançamento.</p>
        </div>

        <div>
          <label className="label">Notas (opcional)</label>
          <textarea className="input resize-none" rows={2} placeholder="Observações..." value={form.notes || ''} onChange={e => set('notes', e.target.value)} />
        </div>

        <div>
          <label className="label">Ordem de exibição</label>
          <input type="number" className="input" value={form.display_order} onChange={e => set('display_order', e.target.value)} />
        </div>

        <div className="flex items-center gap-2">
          <input type="checkbox" id="aactive" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="accent-emerald-500 w-4 h-4"/>
          <label htmlFor="aactive" className="text-sm text-gray-300">Ativa</label>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Adicionar uso dos hooks + handlers no componente SettingsPage**

Dentro do componente `SettingsPage`, após os hooks/state existentes (linha ~6-10), adicionar:

```jsx
const { accounts, refetch: refetchAccounts } = useAccounts()
const [accountModal, setAccountModal] = useState(null)

async function handleDeactivate(account) {
  if (!confirm(`Desativar "${account.name}"? As transações existentes mantêm o vínculo.`)) return
  await deactivateAccount(account.id)
  refetchAccounts()
}
```

- [ ] **Step 4: Adicionar a seção "Contas" no JSX**

ANTES do bloco "PWA" (que começa com `{/* PWA */}`), adicionar:

```jsx
{/* Contas */}
<div className="card space-y-3">
  <div className="flex items-center justify-between">
    <p className="font-semibold text-white flex items-center gap-2"><Wallet size={16}/> Contas</p>
    <button onClick={() => setAccountModal({})} className="btn-primary flex items-center gap-1.5 text-xs">
      <Plus size={14}/> Nova conta
    </button>
  </div>

  {accounts.length === 0 ? (
    <p className="text-xs text-gray-500">Nenhuma conta cadastrada ainda. Crie a primeira pra começar a lançar transações.</p>
  ) : (
    <div className="space-y-2">
      {accounts.map(a => (
        <div key={a.id} className="flex items-center justify-between border-t border-gray-800 pt-2 first:border-0 first:pt-0">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white truncate">{a.name}</p>
            <p className="text-xs text-gray-500">{ACCOUNT_TYPE_LABELS[a.type] || a.type}{a.subtype ? ` · ${a.subtype}` : ''} · {PAYMENT_SOURCE_LABELS[a.default_payment_source] || '—'}</p>
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button onClick={() => setAccountModal(a)} className="text-gray-600 hover:text-gray-400 p-1" title="Editar">
              <Edit2 size={14}/>
            </button>
            <button onClick={() => handleDeactivate(a)} className="text-gray-600 hover:text-red-400 p-1" title="Desativar">
              <EyeOff size={14}/>
            </button>
          </div>
        </div>
      ))}
    </div>
  )}
</div>
```

- [ ] **Step 5: Adicionar render do AccountModal no fim do JSX**

ANTES do `</div>` final do componente, ADICIONAR (depois do botão "Salvar configurações"):

```jsx
{accountModal !== null && (
  <AccountModal
    initial={accountModal}
    userId={user?.id}
    onClose={() => setAccountModal(null)}
    onSaved={refetchAccounts}
  />
)}
```

- [ ] **Step 6: Build pra validar**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 7: Commit**

```bash
git add src/pages/SettingsPage.jsx
git commit -m "feat(settings): secao Contas com modal CRUD"
```

---

### Task 6: TxModal com campo Conta (income/expense/investment)

**Files:**
- Modify: `src/pages/TransactionsPage.jsx`

- [ ] **Step 1: Adicionar `useAccounts` no import e carregar contas**

No topo de `src/pages/TransactionsPage.jsx`, atualizar o import de hooks:

```jsx
import { useBudgetItems, useTransactionsByCycle, useCycles, useBills, useGoals, useAccounts } from '../hooks/useData'
```

Dentro do componente `TransactionsPage`, após os outros hooks (procurar `const { goals } = useGoals()`), adicionar:

```jsx
const { accounts } = useAccounts()
```

- [ ] **Step 2: Passar `accounts` como prop pro TxModal**

Localizar o render `<TxModal ...>` no fim do componente e adicionar prop:

```jsx
<TxModal
  initial={modal}
  categories={categories}
  userId={user?.id}
  reservaSnapshot={reservaSnap}
  goals={goals}
  accounts={accounts}
  onClose={() => setModal(null)}
  onSaved={refetch}
/>
```

- [ ] **Step 3: Receber `accounts` na assinatura do TxModal**

Localizar `function TxModal(...)` (linha ~57). Atualizar:

```jsx
function TxModal({ onClose, onSaved, initial, categories, userId, reservaSnapshot, goals = [], accounts = [] }) {
```

- [ ] **Step 4: Adicionar `account_id`, `from_account_id`, `to_account_id` no EMPTY**

Localizar `const EMPTY = { ... }` (linha ~55) e atualizar:

```jsx
const EMPTY = { description: '', amount: '', type: 'expense', date: format(new Date(), 'yyyy-MM-dd'), category_id: '', notes: '', is_paid: true, payment_source: 'fixed_income', goal_id: '', account_id: '', from_account_id: '', to_account_id: '' }
```

- [ ] **Step 5: Adicionar campo "Conta" no JSX do TxModal (não-transfer)**

Localizar o bloco "Fonte de pagamento" no JSX do TxModal (procurar `<label className="label">Fonte de pagamento *</label>`). LOGO ANTES desse bloco, adicionar:

```jsx
{form.type !== 'transfer' && (
  <div>
    <label className="label">Conta *</label>
    <select className="input" value={form.account_id || ''} onChange={e => {
      const acc = accounts.find(a => a.id === e.target.value)
      set('account_id', e.target.value)
      // Auto-preenche payment_source com o default da conta
      if (acc?.default_payment_source) set('payment_source', acc.default_payment_source)
    }}>
      <option value="">Selecionar...</option>
      {accounts.map(a => (
        <option key={a.id} value={a.id}>{a.name}</option>
      ))}
    </select>
    {accounts.length === 0 && (
      <p className="text-xs text-amber-400 mt-1">
        Cadastre uma conta em Configurações → Contas antes de lançar.
      </p>
    )}
  </div>
)}
```

- [ ] **Step 6: Adicionar validação de account_id no save**

Localizar a função `save()` dentro do TxModal (linha ~67-88). Adicionar validação antes de `setSaving(true)`:

```jsx
async function save() {
  if (!form.description || !form.amount) return setError('Preencha descrição e valor.')
  if (!form.payment_source) return setError('Selecione a fonte de pagamento.')
  if (form.type !== 'transfer' && !form.account_id) return setError('Selecione a conta.')
  if (form.payment_source === 'reserve' && form.type === 'expense') {
    const novo = parseFloat(form.amount)
    if (novo > reservaDisponivelPraLancamento) {
      return setError(`Reserva insuficiente (disponível R$ ${reservaDisponivelPraLancamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).`)
    }
  }
  setSaving(true)
  const payload = {
    ...form,
    amount: parseFloat(form.amount),
    user_id: userId,
    category_id: form.category_id || null,
    budget_item_id: null,
    goal_id: form.goal_id || null,
    account_id: form.account_id || null,
    from_account_id: form.from_account_id || null,
    to_account_id: form.to_account_id || null,
  }
  const { error: err } = form.id ? await updateTransaction(form.id, payload) : await addTransaction(payload)
  if (err) setError(err.message)
  else { onSaved(); onClose() }
  setSaving(false)
}
```

- [ ] **Step 7: Build pra validar**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 8: Commit**

```bash
git add src/pages/TransactionsPage.jsx
git commit -m "feat(tx): TxModal com campo Conta (income/expense/investment)"
```

---

### Task 7: TxModal com De/Para pra transfer + badge + filtro

**Files:**
- Modify: `src/pages/TransactionsPage.jsx`

- [ ] **Step 1: Adicionar bloco De/Para no JSX do TxModal**

Localizar onde adicionamos o campo "Conta" no Step 5 da Task 6. LOGO APÓS esse bloco (e ainda antes de "Fonte de pagamento"), adicionar:

```jsx
{form.type === 'transfer' && (
  <div className="grid grid-cols-2 gap-3">
    <div>
      <label className="label">De *</label>
      <select className="input" value={form.from_account_id || ''} onChange={e => set('from_account_id', e.target.value)}>
        <option value="">Selecionar...</option>
        {accounts.map(a => (
          <option key={a.id} value={a.id} disabled={a.id === form.to_account_id}>{a.name}</option>
        ))}
      </select>
    </div>
    <div>
      <label className="label">Para *</label>
      <select className="input" value={form.to_account_id || ''} onChange={e => set('to_account_id', e.target.value)}>
        <option value="">Selecionar...</option>
        {accounts.map(a => (
          <option key={a.id} value={a.id} disabled={a.id === form.from_account_id}>{a.name}</option>
        ))}
      </select>
    </div>
  </div>
)}
```

- [ ] **Step 2: Adicionar validação de from/to no save**

Localizar a função `save()` (após Task 6 Step 6). Adicionar validação dentro do save:

Trocar:
```jsx
if (form.type !== 'transfer' && !form.account_id) return setError('Selecione a conta.')
```

Por:
```jsx
if (form.type !== 'transfer' && !form.account_id) return setError('Selecione a conta.')
if (form.type === 'transfer') {
  if (!form.from_account_id || !form.to_account_id) return setError('Selecione a conta de origem e destino.')
  if (form.from_account_id === form.to_account_id) return setError('Origem e destino devem ser diferentes.')
}
```

- [ ] **Step 3: Adicionar filtro por conta na lista**

Localizar o state de filtros no componente `TransactionsPage` (procurar `const [filterType, setFilterType] = useState('all')`). ABAIXO, adicionar:

```jsx
const [filterAccount, setFilterAccount] = useState('all')
```

- [ ] **Step 4: Aplicar o filtro à lista**

Localizar onde `filtered` é computado (linha ~184). Atual:

```jsx
const filtered = filterType === 'all' ? transactions : transactions.filter(t => t.type === filterType)
```

Substituir por:

```jsx
const filtered = transactions
  .filter(t => filterType === 'all' || t.type === filterType)
  .filter(t => {
    if (filterAccount === 'all') return true
    if (t.type === 'transfer') return t.from_account_id === filterAccount || t.to_account_id === filterAccount
    return t.account_id === filterAccount
  })
```

- [ ] **Step 5: Adicionar UI do filtro de conta**

Localizar o bloco de filter por tipo no JSX (procurar `{/* Filter */}` e `['all', 'income', 'expense', ...].map`). LOGO APÓS o bloco do filtro por tipo, adicionar:

```jsx
{accounts.length > 0 && (
  <div className="flex gap-2 flex-wrap items-center">
    <span className="text-xs text-gray-500">Conta:</span>
    <select
      className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-1.5 text-xs text-gray-200"
      value={filterAccount}
      onChange={e => setFilterAccount(e.target.value)}
    >
      <option value="all">Todas</option>
      {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  </div>
)}
```

- [ ] **Step 6: Adicionar badge de conta na lista de tx**

Localizar o JSX que renderiza cada tx (procurar `{filtered.map(tx => (`). Dentro do bloco da tx, depois do badge de payment_source e antes de `tx.categories`, adicionar:

```jsx
{tx.type === 'transfer' && (tx.from_account_id || tx.to_account_id) && (() => {
  const from = accounts.find(a => a.id === tx.from_account_id)
  const to = accounts.find(a => a.id === tx.to_account_id)
  return (
    <span className="badge bg-blue-500/10 text-blue-300 text-[10px]">
      {from?.name || '?'} → {to?.name || '?'}
    </span>
  )
})()}
{tx.type !== 'transfer' && tx.account_id && (() => {
  const acc = accounts.find(a => a.id === tx.account_id)
  return acc ? (
    <span className="badge bg-gray-700 text-gray-300 text-[10px]">{acc.name}</span>
  ) : null
})()}
```

- [ ] **Step 7: Build pra validar**

Run: `npm run build`
Expected: build limpo.

- [ ] **Step 8: Commit**

```bash
git add src/pages/TransactionsPage.jsx
git commit -m "feat(tx): TxModal De/Para pra transfer + badge de conta + filtro"
```

---

### Task 8: Atualizar INVENTARIO.md pós-Onda 3

**Files:**
- Modify: `INVENTARIO.md`

- [ ] **Step 1: Atualizar seção 2 (Lançamentos)**

Localizar a tabela da seção "# 2. Lançamentos". Adicionar linhas novas no fim da tabela:

```markdown
| Campo "Conta" no TxModal | TransactionsPage TxModal | Select obrigatório pra income/expense/investment; auto-preenche payment_source | Modal Novo/Edit → select | ✅ | Onda 3 |
| Campos "De/Para" no TxModal (transfer) | TransactionsPage TxModal | 2 selects pra transferência entre contas próprias (from_account_id, to_account_id) | Tipo Transferência → 2 selects | ✅ | Onda 3 |
| Filtro por conta na lista | TransactionsPage | Select que filtra tx por account_id (ou from/to em transfer) | Header de filtros | ✅ | Onda 3 |
| Badge de conta na tx | TransactionsPage | Cada tx mostra nome da conta (ou "From → To" pra transfer) | Auto | ✅ | Onda 3 |
```

- [ ] **Step 2: Atualizar seção 8 (Configurações)**

Localizar a tabela da seção "# 8. Configurações". Adicionar linhas novas:

```markdown
| Seção "Contas" | SettingsPage | CRUD de contas (nome, tipo, subtype, default_payment_source) | Cards listando + botão Nova + Edit/Desativar | ✅ | Onda 3 |
| AccountModal | SettingsPage | Modal pra criar/editar conta | Click + Nova ou Edit | ✅ | Onda 3 |
| Botão "Desativar" conta | SettingsPage | Marca is_active=false (preserva FK das tx) | Click no ícone EyeOff | ✅ | Onda 3 — não deleta, só esconde |
```

- [ ] **Step 3: Atualizar seção 11 (Hooks)**

Adicionar entrada na tabela de hooks:

```markdown
| `useAccounts()` | Fetcha accounts ativas + realtime channel `accounts` | ✅ | Onda 3 |
```

- [ ] **Step 4: Atualizar seção 12 (Lib / Engine)**

Adicionar linha na tabela do `db.js`:

```markdown
| `getAccounts`, `getAllAccounts`, `upsertAccount`, `deactivateAccount` | Onda 3 — CRUD de contas |
```

(Ou ajustar a linha existente do db.js mencionando os novos helpers.)

- [ ] **Step 5: Atualizar resumo executivo**

Localizar "Pontos críticos identificados" (resumo executivo). Marcar como resolvidos:
- "payment_source só do tipo, não da conta" → ✅ **Resolvido na Onda 3 (account_id em tx)**
- "Multi-conta/multi-cartão sem distinção" → ✅ **Resolvido na Onda 3**

- [ ] **Step 6: Adicionar entry no Histórico de execução**

No fim do arquivo, na tabela "# Histórico de execução", adicionar:

```markdown
| 2026-05-14 | 3 — Multi-conta | Adicionada tabela `accounts` + colunas `account_id`/`from_account_id`/`to_account_id` em transactions. Seção Contas em /settings com CRUD. TxModal estendido (campo Conta pra income/expense/investment; De+Para pra transfer). Badge de conta + filtro por conta na lista de Lançamentos. Migrations aplicadas: backup_pre_onda3 (schema backup_2026_05_14), wipe_pre_onda3 (DELETE dos dados do user), accounts. Reset clean — usuário recadastrou tudo no novo ciclo. |
```

- [ ] **Step 7: Commit**

```bash
git add INVENTARIO.md
git commit -m "docs: atualiza INVENTARIO.md pos-Onda3 (multi-conta)"
```

---

## Smoke test final

Após os 8 commits, USER ACTIONS necessárias antes do smoke test no browser:

- [ ] **Step 1: Build final**

Run: `npm run build`
Expected: ✓ built sem warnings.

- [ ] **Step 2: Aplicar migration 1 (BACKUP) no Supabase Dashboard (USER ACTION)**

Vai em https://supabase.com/dashboard/project/vzbswcoogdarlzqstumy/sql/new

Cola o conteúdo de `migration_backup_pre_onda3.sql`. Click "Run".

Verifica:
```sql
SELECT table_name FROM information_schema.tables WHERE table_schema = 'backup_2026_05_14';
```
Expected: 5 linhas (transactions, bills, budget_items, budget_cycles, goals).

- [ ] **Step 3: Aplicar migration 2 (WIPE) — SÓ após confirmar Step 2 (USER ACTION)**

Cola o conteúdo de `migration_wipe_pre_onda3.sql`. Click "Run".

Verifica:
```sql
SELECT COUNT(*) FROM transactions WHERE user_id = '49d01efc-e309-49be-98f2-684d0d4548e2';
SELECT COUNT(*) FROM bills        WHERE user_id = '49d01efc-e309-49be-98f2-684d0d4548e2';
SELECT COUNT(*) FROM budget_items WHERE user_id = '49d01efc-e309-49be-98f2-684d0d4548e2';
SELECT COUNT(*) FROM budget_cycles WHERE user_id = '49d01efc-e309-49be-98f2-684d0d4548e2';
SELECT COUNT(*) FROM goals        WHERE user_id = '49d01efc-e309-49be-98f2-684d0d4548e2';
```
Expected: todos 0.

- [ ] **Step 4: Aplicar migration 3 (ACCOUNTS) (USER ACTION)**

Cola o conteúdo de `migration_accounts.sql`. Click "Run".

Verifica:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'accounts' AND table_schema = 'public';
```
Expected: 11 linhas (id, user_id, name, type, subtype, default_payment_source, is_active, display_order, notes, created_at, updated_at).

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'transactions' AND table_schema = 'public'
  AND column_name IN ('account_id', 'from_account_id', 'to_account_id');
```
Expected: 3 linhas.

- [ ] **Step 5: Smoke test no browser (USER ACTION)**

Run: `npm run dev`

**5a. Cadastrar contas:**
- Acessar `/settings`
- Scroll até "Contas"
- + Nova conta:
  - "NuBank Conta Corrente" / type=bank / subtype=checking / default=fixed_income
  - "NuBank Crédito" / type=credit / subtype=credit_card / default=credit
  - "PicPay Crédito" / type=credit / subtype=credit_card / default=credit
  - "Biplay" / type=credit / subtype=loan / default=credit
  - "Aluguel (esposa)" / type=envelope / subtype=shared / default=variable_income

**5b. Configurar ciclo novo:**
- Acessar `/budget` → Configurar ciclo
- start_date=2026-05-15, end_date=2026-06-15, saldo_origem_income e demais valores reais

**5c. Cadastrar items/bills do mês**

**5d. Lançar tx pra testar todas as variações:**
- `Receita`: salário, conta=NuBank Conta Corrente
- `Despesa`: mercado, conta=NuBank Conta Corrente
- `Despesa`: compra no cartão, conta=PicPay Crédito
- `Transferência`: pegar Biplay R$ 170, De=Biplay → Para=NuBank Conta Corrente
- `Transferência`: pagar fatura PicPay R$ 200, De=NuBank Conta Corrente → Para=PicPay Crédito
- `Receita`: aluguel esposa, conta=Aluguel (esposa)
- `Despesa`: gasto da esposa, conta=Aluguel (esposa)

**5e. Validar:**
- Filtro por conta na lista funciona
- Badge da conta aparece em cada tx
- Filtro "PicPay Crédito" mostra compra E transferência (de pagamento de fatura)

---

## Critérios de Done (spec mapping)

- [ ] Migrations 1, 2, 3 criadas e commitadas → Tasks 1, 2, 3
- [ ] Tabela `accounts` no schema com RLS → Task 3 (após aplicar)
- [ ] `transactions` com `account_id` / `from_account_id` / `to_account_id` → Task 3
- [ ] Helpers em `db.js` → Task 4
- [ ] Hook `useAccounts` → Task 4
- [ ] SettingsPage seção Contas + modal CRUD → Task 5
- [ ] TxModal com campo Conta → Task 6
- [ ] TxModal com De/Para pra transfer → Task 7
- [ ] Badge + filtro de conta na lista → Task 7
- [ ] `INVENTARIO.md` atualizado → Task 8
- [ ] Build limpo após cada commit → step "Build pra validar" em cada Task
- [ ] Smoke test → seção final
