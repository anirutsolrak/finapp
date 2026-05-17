# Planejamento Unificado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fundir páginas `/budget` e `/bills` em uma única `/budget`, com marcar-pago criando `transaction` atômica via RPC.

**Architecture:** Schema delta aditivo (2 colunas, sem renomes); 2 triggers Postgres materializam bills automaticamente do `budget_items`; 2 RPCs (`pay_bill`, `unpay_bill`) garantem atomicidade tx+bill; UI consolidada em `BudgetPage` com bills do ciclo embutidas em cada item.

**Tech Stack:** Vite + React 18, Supabase (Postgres + Realtime), Vitest, RTL, Tailwind, date-fns, lucide-react.

**Branch base:** `auditoria-features` (onde Onda 4-7 vivem). Aplique este plano direto na branch.

**Supabase note:** Por preferência do user ([memory:feedback_supabase_cli](C:/Users/Oem/.claude/projects/C--Users-Oem-Desktop-Projetos-FinAPP/memory/MEMORY.md)) — todas as migrations rodam via SQL Editor do Dashboard (CLI é instável). O plano gera arquivo `.sql` pra você copiar/colar.

---

## Onda A — Migration + RPCs (SQL puro)

### Task A.1: Pré-flight — checar FKs existentes

**Files:**
- Read: `migration_accounts.sql`, `migration_account_balances.sql`, `migration_credit_and_checkpoints.sql`

- [ ] **Step 1: Verificar regra de ON DELETE em transactions.account_id e bills.account_id**

Run:
```bash
grep -nE "REFERENCES accounts|account_id.*REFERENCES" migration_*.sql
```

Expected: identificar se FKs estão `ON DELETE CASCADE`, `SET NULL`, ou sem regra (default `NO ACTION`).

- [ ] **Step 2: Anotar resultado no topo da nova migration**

Se NÃO for `SET NULL`, adicionar no início de `migration_unified_planning.sql`:
```sql
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_account_id_fkey;
ALTER TABLE transactions ADD CONSTRAINT transactions_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL;
-- repete pra bills.account_id se existir
```

Sem commit ainda — só anota.

---

### Task A.2: Escrever `migration_unified_planning.sql`

**Files:**
- Create: `migration_unified_planning.sql` (na raiz)

- [ ] **Step 1: Criar arquivo com header + schema delta**

```sql
-- migration_unified_planning.sql
-- Onda 8: fusão Planejamento + Agenda de pagamentos.
-- Schema delta aditivo + 2 triggers de materialização + 2 RPCs (pay/unpay).
-- Aplicar via Supabase Dashboard SQL Editor (CLI instável).

-- 1) Schema delta -----------------------------------------------------------
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS bill_id uuid REFERENCES bills(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tx_bill_id ON transactions(bill_id);

ALTER TABLE budget_items
  ADD COLUMN IF NOT EXISTS default_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;
```

- [ ] **Step 2: Anexar função `materialize_bills_for_item`**

```sql
-- 2) Função de materialização ----------------------------------------------
CREATE OR REPLACE FUNCTION materialize_bills_for_item(p_item_id uuid)
RETURNS void AS $$
DECLARE
  v_item RECORD;
  v_cycle RECORD;
  v_due_date date;
BEGIN
  SELECT * INTO v_item FROM budget_items WHERE id = p_item_id AND active = true;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_cycle FROM budget_cycles
    WHERE CURRENT_DATE BETWEEN start_date AND end_date
    LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  v_due_date := make_date(
    EXTRACT(year FROM v_cycle.start_date)::int,
    EXTRACT(month FROM v_cycle.start_date)::int,
    LEAST(COALESCE(v_item.due_day, 15), 28)
  );

  INSERT INTO bills (user_id, budget_item_id, name, amount, due_date, is_fixed, recurrence, alert_days_before)
  VALUES (v_item.user_id, v_item.id, v_item.name, v_item.planned_amount, v_due_date,
          v_item.is_fixed,
          CASE WHEN v_item.recurrence = 'once' THEN 'none' ELSE v_item.recurrence END,
          3)
  ON CONFLICT (budget_item_id, month_ref) DO UPDATE
    SET amount = EXCLUDED.amount, name = EXCLUDED.name, due_date = EXCLUDED.due_date
    WHERE bills.is_paid = false;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 3: Anexar triggers (item + ciclo)**

```sql
-- 3) Triggers de materialização --------------------------------------------
CREATE OR REPLACE FUNCTION trg_item_materialize()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.active = true THEN PERFORM materialize_bills_for_item(NEW.id); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS materialize_on_item_change ON budget_items;
CREATE TRIGGER materialize_on_item_change
  AFTER INSERT OR UPDATE ON budget_items
  FOR EACH ROW EXECUTE FUNCTION trg_item_materialize();

CREATE OR REPLACE FUNCTION trg_cycle_materialize()
RETURNS TRIGGER AS $$
DECLARE v_item RECORD;
BEGIN
  FOR v_item IN
    SELECT id FROM budget_items WHERE active = true AND recurrence != 'once'
  LOOP
    PERFORM materialize_bills_for_item(v_item.id);
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS materialize_on_cycle_change ON budget_cycles;
CREATE TRIGGER materialize_on_cycle_change
  AFTER INSERT ON budget_cycles
  FOR EACH ROW EXECUTE FUNCTION trg_cycle_materialize();
```

- [ ] **Step 4: Anexar RPCs `pay_bill` e `unpay_bill`**

```sql
-- 4) RPCs (atomicidade pay/unpay) ------------------------------------------
CREATE OR REPLACE FUNCTION pay_bill(
  p_bill_id uuid, p_account_id uuid, p_amount numeric, p_date date,
  p_payment_source text, p_category_id uuid, p_budget_item_id uuid
) RETURNS uuid AS $$
DECLARE v_tx_id uuid; v_user_id uuid; v_name text;
BEGIN
  SELECT user_id, name INTO v_user_id, v_name FROM bills WHERE id = p_bill_id;
  INSERT INTO transactions
    (user_id, type, amount, date, account_id, payment_source, category_id,
     budget_item_id, bill_id, description)
  VALUES
    (v_user_id, 'expense', p_amount, p_date, p_account_id, p_payment_source,
     p_category_id, p_budget_item_id, p_bill_id, v_name)
  RETURNING id INTO v_tx_id;
  UPDATE bills SET is_paid = true, paid_at = now() WHERE id = p_bill_id;
  RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION unpay_bill(p_bill_id uuid) RETURNS void AS $$
BEGIN
  DELETE FROM transactions WHERE bill_id = p_bill_id;
  UPDATE bills SET is_paid = false, paid_at = NULL WHERE id = p_bill_id;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 5: Commit migration**

```bash
git add migration_unified_planning.sql
git commit -m "feat(db): migration unified planning — schema delta + triggers + RPCs"
```

---

### Task A.3: Aplicar migration via Dashboard

**Files:** (apenas execução)

- [ ] **Step 1: Abrir Supabase Dashboard → SQL Editor**

URL: https://supabase.com/dashboard/project/<project-ref>/sql/new

- [ ] **Step 2: Copiar conteúdo de `migration_unified_planning.sql` e executar**

Expected: "Success. No rows returned." (todos blocos sucedem)

- [ ] **Step 3: Smoke test no Dashboard**

Roda no SQL Editor:
```sql
-- Confirma que colunas existem
SELECT column_name FROM information_schema.columns
  WHERE table_name = 'transactions' AND column_name = 'bill_id';
-- Esperado: 1 linha 'bill_id'

SELECT column_name FROM information_schema.columns
  WHERE table_name = 'budget_items' AND column_name = 'default_account_id';
-- Esperado: 1 linha 'default_account_id'

-- Confirma RPCs existem
SELECT proname FROM pg_proc WHERE proname IN ('pay_bill', 'unpay_bill', 'materialize_bills_for_item');
-- Esperado: 3 linhas
```

- [ ] **Step 4: Smoke test trigger de item**

```sql
-- Cria item de teste, confirma que bill foi materializada
INSERT INTO budget_items (user_id, name, planned_amount, payment_source, recurrence, due_day, active)
VALUES ('49d01efc-e309-49be-98f2-684d0d4548e2', '__TEST_TRIGGER__', 100, 'fixed_income', 'monthly', 10, true)
RETURNING id;
-- Copia o id retornado, então:
SELECT * FROM bills WHERE budget_item_id = '<id-acima>';
-- Esperado: 1 linha com due_date no ciclo atual, amount=100, is_paid=false

-- Cleanup
DELETE FROM bills WHERE budget_item_id = '<id-acima>';
DELETE FROM budget_items WHERE id = '<id-acima>';
```

Se passar → A está pronta.

---

## Onda B — `db.js` helpers (TDD)

### Task B.1: `payBill` — test first

**Files:**
- Create: `src/lib/db.test.js`
- Modify: `src/lib/db.js`

- [ ] **Step 1: Escrever teste falhando**

`src/lib/db.test.js`:
```js
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./supabase', () => ({
  supabase: { rpc: vi.fn(() => Promise.resolve({ data: 'tx-uuid-123', error: null })) }
}))

import { payBill, unpayBill } from './db'
import { supabase } from './supabase'

describe('payBill', () => {
  beforeEach(() => { supabase.rpc.mockClear() })

  it('chama RPC pay_bill com payload mapeado', async () => {
    await payBill({
      billId: 'b1', accountId: 'a1', amount: 150.5, date: '2026-05-17',
      paymentSource: 'fixed_income', categoryId: 'c1', budgetItemId: 'i1',
    })
    expect(supabase.rpc).toHaveBeenCalledWith('pay_bill', {
      p_bill_id: 'b1', p_account_id: 'a1', p_amount: 150.5, p_date: '2026-05-17',
      p_payment_source: 'fixed_income', p_category_id: 'c1', p_budget_item_id: 'i1',
    })
  })
})
```

- [ ] **Step 2: Rodar — esperar falha**

Run: `npx vitest run src/lib/db.test.js`
Expected: FAIL com `payBill is not a function`

- [ ] **Step 3: Implementar `payBill` em `db.js`**

Adicionar após `markBillPaid` (que será removido no B.4):
```js
export const payBill = ({ billId, accountId, amount, date, paymentSource, categoryId, budgetItemId }) =>
  supabase.rpc('pay_bill', {
    p_bill_id: billId, p_account_id: accountId, p_amount: amount, p_date: date,
    p_payment_source: paymentSource, p_category_id: categoryId, p_budget_item_id: budgetItemId,
  })
```

- [ ] **Step 4: Rodar — esperar passar**

Run: `npx vitest run src/lib/db.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.test.js src/lib/db.js
git commit -m "feat(db): payBill helper via RPC + test"
```

---

### Task B.2: `unpayBill` — test first

**Files:**
- Modify: `src/lib/db.test.js`, `src/lib/db.js`

- [ ] **Step 1: Adicionar teste em `db.test.js`**

```js
describe('unpayBill', () => {
  beforeEach(() => { supabase.rpc.mockClear() })

  it('chama RPC unpay_bill com billId', async () => {
    await unpayBill('b1')
    expect(supabase.rpc).toHaveBeenCalledWith('unpay_bill', { p_bill_id: 'b1' })
  })
})
```

- [ ] **Step 2: Rodar — esperar falha**

Run: `npx vitest run src/lib/db.test.js`
Expected: FAIL com `unpayBill is not a function`

- [ ] **Step 3: Implementar em `db.js`**

```js
export const unpayBill = (billId) =>
  supabase.rpc('unpay_bill', { p_bill_id: billId })
```

- [ ] **Step 4: Rodar — esperar passar**

Run: `npx vitest run src/lib/db.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.test.js src/lib/db.js
git commit -m "feat(db): unpayBill helper via RPC + test"
```

---

### Task B.3: Ajustar `deleteBudgetItem` (preservar bills pagas)

**Files:**
- Modify: `src/lib/db.js:21-25`, `src/lib/db.test.js`

- [ ] **Step 1: Adicionar teste em `db.test.js`**

Topo do arquivo, ampliar o mock:
```js
const fromMock = vi.fn()
vi.mock('./supabase', () => ({
  supabase: {
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    from: (...args) => fromMock(...args),
  }
}))
```

Adicionar describe novo:
```js
describe('deleteBudgetItem', () => {
  it('deleta bills não-pagas e desliga FK das pagas', async () => {
    const calls = []
    fromMock.mockImplementation((table) => {
      const chain = {
        delete: () => chain,
        update: (payload) => { calls.push({ table, op: 'update', payload }); return chain },
        eq: (col, val) => { calls.push({ table, col, val }); return chain },
        then: (resolve) => resolve({ error: null }),
      }
      chain.delete = () => { calls.push({ table, op: 'delete' }); return chain }
      return chain
    })
    const { deleteBudgetItem } = await import('./db')
    await deleteBudgetItem('item-1')
    // assertion: 1 delete em bills com is_paid=false; 1 update em bills com is_paid=true; 1 update em budget_items active=false
    const ops = calls.filter(c => c.op)
    expect(ops.some(c => c.table === 'bills' && c.op === 'delete')).toBe(true)
    expect(ops.some(c => c.table === 'bills' && c.op === 'update' && c.payload?.budget_item_id === null)).toBe(true)
    expect(ops.some(c => c.table === 'budget_items' && c.op === 'update' && c.payload?.active === false)).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar — esperar falha (lógica atual deleta tudo)**

Run: `npx vitest run src/lib/db.test.js`
Expected: FAIL — falta o `update` que desliga FK das pagas

- [ ] **Step 3: Atualizar `deleteBudgetItem` em `db.js:21-25`**

Substituir bloco existente por:
```js
export const deleteBudgetItem = async (id) => {
  // Cascade ajustado: bills não-pagas viram lixo (apaga), pagas preservam histórico (FK vai pra NULL).
  await supabase.from('bills').delete().eq('budget_item_id', id).eq('is_paid', false)
  await supabase.from('bills').update({ budget_item_id: null }).eq('budget_item_id', id).eq('is_paid', true)
  return supabase.from('budget_items').update({ active: false }).eq('id', id)
}
```

- [ ] **Step 4: Rodar — esperar passar**

Run: `npx vitest run src/lib/db.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/db.test.js src/lib/db.js
git commit -m "fix(db): deleteBudgetItem preserva bills pagas (FK SET NULL)"
```

---

### Task B.4: Remover `markBillPaid`

**Files:**
- Modify: `src/lib/db.js:100`, `src/pages/BillsPage.jsx:7,173`

- [ ] **Step 1: Verificar callers de `markBillPaid`**

Run:
```bash
grep -rn "markBillPaid" src/
```

Expected: aparecer só em `src/lib/db.js` e `src/pages/BillsPage.jsx` (BillsPage será deletado na Onda D — ok deixar quebrar temporariamente)

- [ ] **Step 2: Remover export de `db.js`**

Deletar linha:
```js
export const markBillPaid = (id, paid = true) =>
  supabase.from('bills').update({ is_paid: paid }).eq('id', id)
```

- [ ] **Step 3: Rodar testes — confirmar suite global passa**

Run: `npx vitest run`
Expected: PASS (BillsPage não tem teste; quebra runtime resolvida na Onda D)

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.js
git commit -m "refactor(db): remove markBillPaid (substituido por payBill/unpayBill)"
```

---

## Onda C — Hook + Componentes novos

### Task C.1: Hook `useBudget` (items + bills do ciclo, joinados)

**Files:**
- Modify: `src/hooks/useData.js` (adicionar export)

- [ ] **Step 1: Adicionar `useBudget` ao final de `useData.js`**

```js
// Carrega budget_items + bills do ciclo atual, joinados no client.
// Cada item ganha .bill (a bill do ciclo atual, se materializada).
export function useBudget() {
  const { range } = useDateRange()
  const [data, setData] = useState({ items: [], bills: [], categories: [], accounts: [] })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!range) return
    setLoading(true)
    const [{ data: items }, { data: bills }, { data: cats }, { data: accts }] = await Promise.all([
      db.getBudgetItems(),
      db.getBillsByRange(range.startDate, range.endDate),
      db.getCategories(),
      db.getAccounts(),
    ])
    // Join: cada item recebe .bill (1 bill por month_ref via unique constraint)
    const billByItemId = new Map((bills || []).map(b => [b.budget_item_id, b]))
    const itemsWithBill = (items || []).map(i => ({ ...i, bill: billByItemId.get(i.id) || null }))
    setData({ items: itemsWithBill, bills: bills || [], categories: cats || [], accounts: accts || [] })
    setLoading(false)
  }, [range])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('budget-unified')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budget_items' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  return { ...data, loading, refetch: load }
}
```

- [ ] **Step 2: Smoke test no console do navegador**

Após `npm run dev`, abrir DevTools → console e injetar (apenas conferência manual):
```js
// Nenhum teste automatizado aqui — apenas verificar que não há erro de import
```

Visualmente: depois de aplicar Onda D, a página deve listar items com bills.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useData.js
git commit -m "feat(hook): useBudget joina items + bills do ciclo no client"
```

---

### Task C.2: `PayBillModal` — modal de confirmação

**Files:**
- Create: `src/components/PayBillModal.jsx`

- [ ] **Step 1: Criar componente**

```jsx
import { useState } from 'react'
import { format } from 'date-fns'
import { X } from 'lucide-react'
import { payBill } from '../lib/db'

const fmt = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Modal de confirmação ao marcar bill como paga.
// Pré-preenche conta (default_account_id ou primeira compatível), valor e data.
export default function PayBillModal({ bill, item, accounts, onClose, onPaid }) {
  const compatibleAccounts = accounts.filter(a => a.is_active !== false && (
    item.payment_source === 'credit'
      ? a.type === 'credit'
      : a.default_payment_source === item.payment_source
  ))
  const defaultAccountId = item.default_account_id
    || (compatibleAccounts.length === 1 ? compatibleAccounts[0].id : '')

  const [accountId, setAccountId] = useState(defaultAccountId)
  const [amount, setAmount] = useState(String(bill.amount))
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    if (!accountId) return setError('Selecione uma conta.')
    setSaving(true)
    const { error: err } = await payBill({
      billId: bill.id, accountId, amount: parseFloat(amount), date,
      paymentSource: item.payment_source, categoryId: item.category_id, budgetItemId: item.id,
    })
    setSaving(false)
    if (err) return setError(err.message || 'Falha ao marcar pago.')
    onPaid(); onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg text-white">Marcar como pago</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800"><X size={18}/></button>
        </div>
        <p className="text-sm text-gray-400">{bill.name} — planejado {fmt(bill.amount)}</p>

        <div>
          <label className="label">Conta</label>
          <select className="input" value={accountId} onChange={e => setAccountId(e.target.value)}>
            <option value="">Selecione...</option>
            {compatibleAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Valor real (R$)</label>
            <input className="input" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)}/>
          </div>
          <div>
            <label className="label">Data</label>
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)}/>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button onClick={confirm} disabled={saving || !accountId} className="btn-primary flex-1">{saving ? 'Salvando...' : 'Confirmar'}</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Smoke check (import só, sem render)**

Run: `npx vitest run` — Expected: PASS (sem teste novo, mas sintaxe válida)

- [ ] **Step 3: Commit**

```bash
git add src/components/PayBillModal.jsx
git commit -m "feat(component): PayBillModal confirma conta+valor+data e cria tx"
```

---

### Task C.3: `PlanItemRow` — linha unificada

**Files:**
- Create: `src/components/planning/PlanItemRow.jsx`

- [ ] **Step 1: Criar componente**

```jsx
import { differenceInDays, parseISO, format } from 'date-fns'
import { CheckCircle2, Circle, Edit2, Lock } from 'lucide-react'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function statusLabel(bill) {
  if (!bill) return { label: '— ainda sem lembrete neste ciclo', color: 'text-gray-600' }
  if (bill.is_paid) return { label: bill.paid_at ? `Pago em ${format(parseISO(bill.paid_at), 'dd/MM')}` : 'Pago', color: 'text-emerald-400' }
  const d = differenceInDays(parseISO(bill.due_date), new Date())
  if (d < 0)  return { label: `Atrasado há ${Math.abs(d)}d`, color: 'text-red-400' }
  if (d === 0) return { label: 'Vence hoje!',                color: 'text-red-400' }
  if (d <= 3) return { label: `Vence em ${d}d`,             color: 'text-amber-400' }
  return       { label: `Vence em ${d}d`,                    color: 'text-gray-400' }
}

export default function PlanItemRow({ item, onTogglePaid, onEdit }) {
  const bill = item.bill
  const st = statusLabel(bill)
  const isPaid = bill?.is_paid
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl border ${isPaid ? 'bg-gray-900 border-gray-800 opacity-70' : 'bg-gray-900 border-gray-800'}`}>
      <button
        onClick={() => onTogglePaid(item)}
        disabled={!bill}
        className={`flex-shrink-0 transition-colors ${isPaid ? 'text-emerald-400' : bill ? 'text-gray-600 hover:text-emerald-400' : 'text-gray-800'}`}
        title={bill ? '' : 'Sem bill materializada ainda'}
      >
        {isPaid ? <CheckCircle2 size={22}/> : <Circle size={22}/>}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className={`text-sm font-medium truncate ${isPaid ? 'text-gray-500 line-through' : 'text-white'}`}>{item.name}</p>
          {item.is_fixed && <Lock size={10} className="text-amber-400" title="Fixo"/>}
        </div>
        <p className={`text-xs ${st.color}`}>{st.label}</p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <p className="text-sm font-bold text-white mr-1">{fmt(bill?.amount ?? item.planned_amount)}</p>
        <button onClick={() => onEdit(item)} className="text-gray-600 hover:text-gray-400 p-1"><Edit2 size={14}/></button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/planning/PlanItemRow.jsx
git commit -m "feat(component): PlanItemRow linha unificada item+bill"
```

---

### Task C.4: `BucketSection` — agrupador colapsável

**Files:**
- Create: `src/components/planning/BucketSection.jsx`

- [ ] **Step 1: Criar componente**

```jsx
import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import PlanItemRow from './PlanItemRow'

const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function BucketSection({ label, items, onTogglePaid, onEdit, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  const planned = items.reduce((a, i) => a + Number(i.planned_amount || 0), 0)
  if (items.length === 0) return null
  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          {open ? <ChevronUp size={16} className="text-gray-500"/> : <ChevronDown size={16} className="text-gray-500"/>}
          <p className="font-semibold text-white">{label}</p>
          <span className="badge bg-gray-800 text-gray-400">{items.length}</span>
        </div>
        <p className="text-sm font-bold text-white">{fmt(planned)} planejado</p>
      </button>
      {open && (
        <div className="mt-3 pt-3 border-t border-gray-800 space-y-2">
          {items.map(i => <PlanItemRow key={i.id} item={i} onTogglePaid={onTogglePaid} onEdit={onEdit}/>)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/planning/BucketSection.jsx
git commit -m "feat(component): BucketSection agrupador por bucket"
```

---

### Task C.5: `PlanningHeader` — resumo do ciclo

**Files:**
- Create: `src/components/planning/PlanningHeader.jsx`

- [ ] **Step 1: Criar componente**

```jsx
const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function PlanningHeader({ items }) {
  const planned = items.reduce((a, i) => a + Number(i.planned_amount || 0), 0)
  const paid = items.reduce((a, i) => a + (i.bill?.is_paid ? Number(i.bill.amount || 0) : 0), 0)
  const pending = planned - paid
  return (
    <div className="card">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-xs text-gray-500">Planejado</p>
          <p className="text-sm font-bold text-white">{fmt(planned)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Pago</p>
          <p className="text-sm font-bold text-emerald-400">{fmt(paid)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Pendente</p>
          <p className="text-sm font-bold text-amber-400">{fmt(pending)}</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/planning/PlanningHeader.jsx
git commit -m "feat(component): PlanningHeader resumo planejado/pago/pendente"
```

---

## Onda D — Refator BudgetPage + remover BillsPage

### Task D.1: Refator `BudgetPage` usando novos componentes

**Files:**
- Modify: `src/pages/BudgetPage.jsx` (refator completo do retorno principal)

- [ ] **Step 1: Substituir imports e estado da página**

Adicionar no topo:
```jsx
import { useBudget } from '../hooks/useData'
import { unpayBill } from '../lib/db'
import { bucketOf } from '../lib/budgetEngine'
import PayBillModal from '../components/PayBillModal'
import BucketSection from '../components/planning/BucketSection'
import PlanningHeader from '../components/planning/PlanningHeader'
```

Trocar bloco de hooks no início do componente principal (estavam usando `useBudgetItems`, `useBudgetCycle`, etc.) por:
```jsx
const { items, categories, accounts, loading, refetch } = useBudget()
const [editing, setEditing] = useState(null)        // item sendo editado
const [payingItem, setPayingItem] = useState(null)  // item cuja bill será paga
const [filter, setFilter] = useState('all')         // 'all' | 'pending' | 'paid'
```

- [ ] **Step 2: Lógica de filtro e agrupamento por bucket**

```jsx
const filtered = items.filter(i => {
  if (filter === 'pending') return !i.bill?.is_paid
  if (filter === 'paid') return i.bill?.is_paid
  return true
})
const byBucket = {
  income:  filtered.filter(i => bucketOf(i.payment_source) === 'income'  && i.recurrence !== 'once'),
  credit:  filtered.filter(i => bucketOf(i.payment_source) === 'credit'  && i.recurrence !== 'once'),
  once:    filtered.filter(i => i.recurrence === 'once'),
}
```

- [ ] **Step 3: Handlers**

```jsx
async function handleTogglePaid(item) {
  if (!item.bill) return
  if (item.bill.is_paid) {
    if (!confirm(`Desmarcar "${item.name}" como pago? A transação vinculada será removida.`)) return
    await unpayBill(item.bill.id); refetch()
  } else {
    setPayingItem(item)
  }
}
```

- [ ] **Step 4: Substituir JSX do retorno principal**

```jsx
return (
  <div className="space-y-5">
    <div className="flex items-center justify-between">
      <h1 className="text-xl font-bold text-white">Planejamento</h1>
      <button onClick={() => setEditing({})} className="btn-primary flex items-center gap-1.5 text-sm">
        <Plus size={16}/> Novo item
      </button>
    </div>

    <PlanningHeader items={items}/>

    <div className="flex gap-2">
      {[['all','Todos'],['pending','Pendentes'],['paid','Pagos']].map(([v, l]) => (
        <button key={v} onClick={() => setFilter(v)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border ${filter === v ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-gray-700 text-gray-400'}`}>
          {l}
        </button>
      ))}
    </div>

    {loading ? (
      <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="card h-20 animate-pulse bg-gray-800"/>)}</div>
    ) : (
      <div className="space-y-3">
        <BucketSection label="Renda" items={byBucket.income} onTogglePaid={handleTogglePaid} onEdit={setEditing}/>
        <BucketSection label="Crédito" items={byBucket.credit} onTogglePaid={handleTogglePaid} onEdit={setEditing}/>
        <BucketSection label="Únicos" items={byBucket.once} onTogglePaid={handleTogglePaid} onEdit={setEditing} defaultOpen={false}/>
      </div>
    )}

    {editing !== null && (
      <ItemModal initial={editing} categories={categories} accounts={accounts}
                 onClose={() => setEditing(null)} onSaved={refetch}/>
    )}
    {payingItem && (
      <PayBillModal bill={payingItem.bill} item={payingItem} accounts={accounts}
                    onClose={() => setPayingItem(null)} onPaid={refetch}/>
    )}
  </div>
)
```

- [ ] **Step 5: Atualizar `ItemModal` interno do BudgetPage**

No `ItemModal` existente em BudgetPage.jsx, adicionar campo `default_account_id` no estado `EMPTY` (linha 17) e no formulário. Logo após "Fonte de pagamento", inserir:

```jsx
<div>
  <label className="label">Conta default (opcional)</label>
  <select className="input" value={form.default_account_id || ''} onChange={e => set('default_account_id', e.target.value || null)}>
    <option value="">— Perguntar ao marcar pago —</option>
    {accounts
      .filter(a => a.is_active !== false && (
        form.payment_source === 'credit' ? a.type === 'credit' : a.default_payment_source === form.payment_source
      ))
      .map(a => <option key={a.id} value={a.id}>{a.name}</option>)
    }
  </select>
</div>
```

Atualizar `EMPTY` (linha 17):
```js
const EMPTY = { name: '', planned_amount: '', is_fixed: false, due_day: '', recurrence: 'monthly', notes: '', category_id: '', active: true, payment_source: 'fixed_income', default_account_id: null }
```

Passar `accounts` como prop pro `ItemModal` (já vem do `useBudget`).

- [ ] **Step 6: Rodar build + tests**

Run: `npx vitest run && npx vite build`
Expected: tests PASS, build OK

- [ ] **Step 7: Commit**

```bash
git add src/pages/BudgetPage.jsx
git commit -m "refactor(budget): BudgetPage unificada com bills do ciclo e PayBillModal"
```

---

### Task D.2: Remover rota `/bills` e item de sidebar

**Files:**
- Modify: `src/App.jsx`, `src/components/layout/Layout.jsx`

- [ ] **Step 1: Localizar `<Route path="/bills"`**

Run:
```bash
grep -n "/bills\|BillsPage\|Agenda" src/App.jsx src/components/layout/Layout.jsx
```

- [ ] **Step 2: Remover linha de route em `App.jsx`**

Remover o import de `BillsPage` e o `<Route path="/bills" element={<BillsPage/>}/>`.

- [ ] **Step 3: Remover item de sidebar em `Layout.jsx`**

Remover entry `{ path: '/bills', label: 'Agenda de pagamentos', icon: ... }` (ou equivalente — adaptar ao formato encontrado no Step 1).

- [ ] **Step 4: Rodar build**

Run: `npx vite build`
Expected: build OK

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/components/layout/Layout.jsx
git commit -m "refactor(routes): remove /bills (funcionalidade fundida em /budget)"
```

---

### Task D.3: Deletar `BillsPage.jsx`

**Files:**
- Delete: `src/pages/BillsPage.jsx`

- [ ] **Step 1: Confirmar que não há mais referências**

Run:
```bash
grep -rn "BillsPage" src/
```

Expected: zero matches.

- [ ] **Step 2: Deletar arquivo**

Run:
```bash
rm src/pages/BillsPage.jsx
```

- [ ] **Step 3: Rodar tests + build**

Run: `npx vitest run && npx vite build`
Expected: PASS + build OK

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete BillsPage.jsx (funcionalidade migrada pra BudgetPage)"
```

---

### Task D.4: Smoke test manual do fluxo completo

**Files:** (sem mudanças, só execução)

- [ ] **Step 1: Subir dev server**

Run: `npm run dev` (abrir http://localhost:5173/)

- [ ] **Step 2: Validar — criar item**

Navegar pra /budget → "Novo item" → preencher "TESTE", R$ 50, fixed_income, monthly, due_day 20, salvar.
Expected: item aparece na seção "Renda" com status "Vence em Xd".

- [ ] **Step 3: Validar — marcar pago**

Click no checkbox do item TESTE → modal abre com NuBank pré-selecionado → R$ 50 pré-preenchido → confirmar.
Expected: item passa pra "Pago em DD/MM"; abrir /transactions → tx "TESTE" R$ 50 aparece com account=NuBank.

- [ ] **Step 4: Validar — desmarcar pago**

Click no checkbox de novo → confirmar dialogo.
Expected: item volta a pendente; tx some de /transactions.

- [ ] **Step 5: Cleanup do teste**

Click lápis → item modal abre → deletar (ou marcar inativo).

- [ ] **Step 6: Commit (não há mudanças de código, mas marca o checkpoint)**

```bash
git commit --allow-empty -m "test(manual): smoke test fluxo planejamento unificado OK"
```

---

## Onda E — Recovery do backup (sub-projeto B)

### Task E.1: Gerar `recovery_backup_2026_05_14.sql`

**Files:**
- Create: `recovery_backup_2026_05_14.sql` (raiz)

- [ ] **Step 1: Criar script**

```sql
-- recovery_backup_2026_05_14.sql
-- Recupera bills recorrentes do backup pré-Onda3 como budget_items.
-- Critério: nome aparece em >= 2 meses distintos no backup.
-- user_id = Carlos. Esposa vê via family-share RLS.
-- Aplica APÓS migration_unified_planning.sql.

INSERT INTO budget_items
  (user_id, name, planned_amount, payment_source, recurrence, due_day, is_fixed, active, category_id)
SELECT
  '49d01efc-e309-49be-98f2-684d0d4548e2'::uuid,
  initcap(lower(min(b.name))),
  round(avg(b.amount)::numeric, 2),
  CASE WHEN min(lower(b.name)) LIKE '%fatura%' THEN 'credit' ELSE 'fixed_income' END,
  'monthly',
  max(EXTRACT(day FROM b.due_date))::int,
  true,
  true,
  NULL
FROM backup_2026_05_14.bills b
WHERE b.name IS NOT NULL
GROUP BY lower(b.name)
HAVING count(DISTINCT to_char(b.due_date, 'YYYY-MM')) >= 2;
```

- [ ] **Step 2: Commit**

```bash
git add recovery_backup_2026_05_14.sql
git commit -m "feat(recovery): script recupera bills recorrentes do backup como budget_items"
```

---

### Task E.2: Aplicar via Dashboard

**Files:** (apenas execução)

- [ ] **Step 1: Abrir Dashboard → SQL Editor → colar conteúdo**

URL: https://supabase.com/dashboard/project/<project-ref>/sql/new

- [ ] **Step 2: Executar**

Expected: "Success. N rows affected" (N ≈ 10-12).

- [ ] **Step 3: Conferir resultado**

```sql
SELECT name, planned_amount, payment_source, due_day, category_id, default_account_id
FROM budget_items
WHERE active = true
ORDER BY created_at DESC
LIMIT 20;
```

Expected: ver lista de items recém-criados; `category_id` e `default_account_id` NULL.

- [ ] **Step 4: Smoke — confirma que trigger materializou bills**

```sql
SELECT bi.name, b.due_date, b.amount, b.is_paid
FROM budget_items bi
LEFT JOIN bills b ON b.budget_item_id = bi.id
  AND b.month_ref = to_char(CURRENT_DATE, 'YYYY-MM')
WHERE bi.active = true
ORDER BY bi.name;
```

Expected: cada item tem 1 bill no ciclo atual.

---

### Task E.3: User revisa e ajusta na UI

**Files:** (apenas operação manual)

- [ ] **Step 1: Abrir /budget no app**

Conferir lista de items recém-importados.

- [ ] **Step 2: Ajustar `category_id` de cada item**

Editar item por item: definir categoria correta (Essencial/Variável/Parcela/etc.).

- [ ] **Step 3: Ajustar `default_account_id` quando aplicável**

Pra cartões: "Fatura NuBank" → NuBank Crédito; "Fatura PicPay" → PicPay Crédito; "Cartao do Antonio" → conta correspondente.

- [ ] **Step 4: Desativar items que não fazem mais sentido**

Lápis → desmarcar "ativo" → salvar.

- [ ] **Checkpoint final:** Onda E done.

---

## Self-Review

Conferi vs spec:
- ✅ Schema delta (bill_id, default_account_id) — Task A.2
- ✅ Triggers materialização — Task A.2
- ✅ RPCs pay_bill / unpay_bill — Task A.2
- ✅ API db.js (payBill, unpayBill, deleteBudgetItem ajustado, markBillPaid removido) — Onda B
- ✅ Hook useBudget — Task C.1
- ✅ Componentes (PayBillModal, PlanItemRow, BucketSection, PlanningHeader) — C.2-C.5
- ✅ Refator BudgetPage — Task D.1
- ✅ Remoção /bills e BillsPage — Tasks D.2, D.3
- ✅ Smoke test manual — Task D.4
- ✅ Recovery sub-projeto B — Onda E
- ✅ Pré-condição FKs ON DELETE — Task A.1
- ✅ Edge case: item modal ganha `default_account_id` — Task D.1 Step 5

Sem placeholders. Tipos/nomes consistentes (payBill/unpayBill/useBudget).

