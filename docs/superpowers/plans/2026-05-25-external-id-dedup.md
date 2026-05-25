# External ID Dedup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar a dedup do CSV importer 100% robusto usando UUID nativo do extrato NuBank + hash determinístico pra fatura, evitando duplicatas e false-positives em re-imports.

**Architecture:** Coluna nova `transactions.external_id text` com UNIQUE index parcial (NULL múltiplo permitido). Parser de extrato extrai `Identificador` do CSV; parser de fatura gera ID sintético via `nu-credit:date:amount:descricao-normalizada`. Dedup virou estrito por external_id quando disponível; fallback antigo `(date, amount)` cobre tx legadas e CSV sem UUID.

**Tech Stack:** Postgres (Supabase), Vite + React, Vitest. Aplicar via Supabase Dashboard SQL Editor.

**Branch base:** `main` (continuação direta).

---

## Onda A — Migration

### Task A.1: Escrever `migration_external_id.sql`

**Files:**
- Create: `migration_external_id.sql` (raiz)

- [ ] **Step 1: Criar arquivo**

```sql
-- migration_external_id.sql
-- Adiciona transactions.external_id pra dedup robusto via UUID do CSV NuBank
-- (extrato) ou hash determinístico (fatura). NULL é permitido pra tx legadas/manuais.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_tx_external_id
  ON transactions(external_id)
  WHERE external_id IS NOT NULL;
```

- [ ] **Step 2: Commit**

```bash
git add migration_external_id.sql
git commit -m "feat(db): migration external_id em transactions + UNIQUE index parcial"
```

---

### Task A.2: USER aplica migration via Dashboard

**Files:** apenas execução.

- [ ] **Step 1: Supabase Dashboard → SQL Editor → cola o conteúdo de `migration_external_id.sql` → Run**

Expected: "Success. No rows returned."

- [ ] **Step 2: Smoke verify**

```sql
SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'transactions' AND column_name = 'external_id';
-- esperado: 1 linha, data_type 'text'

SELECT indexname FROM pg_indexes
  WHERE tablename = 'transactions' AND indexname = 'uniq_tx_external_id';
-- esperado: 1 linha
```

---

## Onda B — Parser + tests (TDD)

### Task B.1: Helper `syntheticId` (TDD)

**Files:**
- Create: `src/lib/nubankCSV.test.js`
- Modify: `src/lib/nubankCSV.js`

- [ ] **Step 1: Criar `src/lib/nubankCSV.test.js` com teste falhando**

```js
import { describe, it, expect } from 'vitest'
import { syntheticId, parseExtrato, parseFatura } from './nubankCSV'

describe('syntheticId', () => {
  it('gera ID deterministico (mesma input -> mesma output)', () => {
    const a = syntheticId('nu-credit', '2026-05-15', 114.74, 'Claude.AI Subscription')
    const b = syntheticId('nu-credit', '2026-05-15', 114.74, 'Claude.AI Subscription')
    expect(a).toBe(b)
    expect(a).toBe('nu-credit:2026-05-15:114.74:claude-ai-subscription')
  })

  it('normaliza acentos e punctuation', () => {
    const id = syntheticId('nu-credit', '2026-05-01', 50, 'PADARIA São João!')
    expect(id).toBe('nu-credit:2026-05-01:50.00:padaria-sao-joao')
  })

  it('aceita descricao vazia', () => {
    const id = syntheticId('nu-credit', '2026-05-01', 10, '')
    expect(id).toBe('nu-credit:2026-05-01:10.00:')
  })
})
```

- [ ] **Step 2: Rodar — esperar falha (syntheticId not exported)**

Run: `npx vitest run src/lib/nubankCSV.test.js`
Expected: FAIL `syntheticId is not a function` ou similar.

- [ ] **Step 3: Adicionar `syntheticId` em `src/lib/nubankCSV.js`**

Adicionar no topo do arquivo, após os helpers existentes (parseDateBR/parseAmount/etc) e ANTES de `parseExtrato`:

```js
// Gera external_id determinístico pra CSVs sem UUID nativo (ex: fatura de cartão).
// Mesma input (date+amount+description) sempre gera a mesma string — re-import vira no-op.
export function syntheticId(prefix, date, amount, description) {
  const norm = (description || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // remove acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${prefix}:${date}:${amount.toFixed(2)}:${norm}`
}
```

- [ ] **Step 4: Rodar — esperar passar**

Run: `npx vitest run src/lib/nubankCSV.test.js`
Expected: 3/3 PASS no describe('syntheticId').

- [ ] **Step 5: Commit**

```bash
git add src/lib/nubankCSV.js src/lib/nubankCSV.test.js
git commit -m "feat(parser): syntheticId helper deterministico + tests"
```

---

### Task B.2: `parseExtrato` extrai `Identificador` (TDD)

**Files:**
- Modify: `src/lib/nubankCSV.js`, `src/lib/nubankCSV.test.js`

- [ ] **Step 1: Adicionar describe em `src/lib/nubankCSV.test.js`**

Anexar ao final do arquivo:

```js
describe('parseExtrato', () => {
  const csvComUUID = `Data,Valor,Identificador,Descrição
01/05/2026,-45.78,69f4e06f-e5d3-49e0-bca5-f45bea1f48e0,Compra no débito - DROGA LESTE LJ33
04/05/2026,44.90,69f89194-666e-41d1-9965-7bd4b9e32461,Resgate RDB`

  const csvSemUUID = `Data,Valor,Descrição
01/05/2026,-45.78,Compra no débito - DROGA LESTE LJ33`

  it('extrai external_id do header Identificador', () => {
    const { rows } = parseExtrato(csvComUUID)
    expect(rows).toHaveLength(2)
    expect(rows[0].external_id).toBe('69f4e06f-e5d3-49e0-bca5-f45bea1f48e0')
    expect(rows[1].external_id).toBe('69f89194-666e-41d1-9965-7bd4b9e32461')
  })

  it('retorna external_id=null quando header nao tem Identificador', () => {
    const { rows } = parseExtrato(csvSemUUID)
    expect(rows).toHaveLength(1)
    expect(rows[0].external_id).toBeNull()
  })
})
```

- [ ] **Step 2: Rodar — esperar falha**

Run: `npx vitest run src/lib/nubankCSV.test.js`
Expected: novo describe FAIL (rows não têm external_id ainda).

- [ ] **Step 3: Atualizar `parseExtrato` em `src/lib/nubankCSV.js`**

Localizar a função `parseExtrato`. Adicionar a busca pelo índice e incluir no rows.push:

Logo após `const idxDesc = header.findIndex(...)`, adicionar:
```js
const idxId = header.findIndex(h => h === 'identificador')
```

No `rows.push({...})`, ADICIONAR a propriedade `external_id`:
```js
rows.push({
  date,
  amount: Math.abs(valor),
  description: desc || '',
  type: valor < 0 ? 'expense' : 'income',
  external_id: idxId >= 0 ? (cols[idxId] || null) : null,
  raw: { dateStr, valStr, desc },
})
```

- [ ] **Step 4: Rodar — esperar passar**

Run: `npx vitest run src/lib/nubankCSV.test.js`
Expected: PASS em todos os describe.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nubankCSV.js src/lib/nubankCSV.test.js
git commit -m "feat(parser): parseExtrato extrai external_id do Identificador"
```

---

### Task B.3: `parseFatura` gera external_id sintético (TDD)

**Files:**
- Modify: `src/lib/nubankCSV.js`, `src/lib/nubankCSV.test.js`

- [ ] **Step 1: Adicionar describe em `src/lib/nubankCSV.test.js`**

Anexar ao final:

```js
describe('parseFatura', () => {
  const faturaCsv = `date,title,amount
2026-05-15,Claude.AI Subscription,114.74
2026-05-16,Xbox Game Pass,77.00`

  it('gera external_id sintetico deterministico', () => {
    const { rows } = parseFatura(faturaCsv)
    expect(rows).toHaveLength(2)
    expect(rows[0].external_id).toBe('nu-credit:2026-05-15:114.74:claude-ai-subscription')
    expect(rows[1].external_id).toBe('nu-credit:2026-05-16:77.00:xbox-game-pass')
  })

  it('chamar 2x com mesmo input gera mesma string', () => {
    const a = parseFatura(faturaCsv)
    const b = parseFatura(faturaCsv)
    expect(a.rows[0].external_id).toBe(b.rows[0].external_id)
  })
})
```

- [ ] **Step 2: Rodar — esperar falha**

Run: `npx vitest run src/lib/nubankCSV.test.js`
Expected: novo describe FAIL.

- [ ] **Step 3: Atualizar `parseFatura` em `src/lib/nubankCSV.js`**

Localizar a função `parseFatura`. No `rows.push({...})`, ADICIONAR `external_id` usando `syntheticId`:

```js
rows.push({
  date,
  amount,
  description: title,
  type: 'expense',
  external_id: syntheticId('nu-credit', date, amount, title),
  raw: { dateStr: cols[idxDate], titleStr: title, amountStr: cols[idxAmount] },
})
```

(Mantém os outros campos do rows.push existente; só adiciona `external_id`. Adapta a estrutura do `raw` ao que já existe no parseFatura.)

- [ ] **Step 4: Rodar — esperar passar todos**

Run: `npx vitest run src/lib/nubankCSV.test.js`
Expected: PASS em todos os describe.

- [ ] **Step 5: Commit**

```bash
git add src/lib/nubankCSV.js src/lib/nubankCSV.test.js
git commit -m "feat(parser): parseFatura gera external_id sintetico via syntheticId"
```

---

## Onda C — Importer

### Task C.1: `isDup` estrito por external_id + fallback

**Files:**
- Modify: `src/components/CSVImporterModal.jsx`

- [ ] **Step 1: Localizar `isDup` atual**

Run:
```bash
grep -n "isDup\|isDuplicate" src/components/CSVImporterModal.jsx
```

Provavelmente em torno da linha 88-90.

- [ ] **Step 2: Substituir a função `isDup`**

Achar bloco existente:
```js
const isDup = (r) => existing.some(e =>
  e.date === r.date && Number(e.amount).toFixed(2) === Number(r.amount).toFixed(2)
)
```

Trocar por:
```js
const isDup = (r) => {
  // Estrito: se ambos têm external_id, casamento é certeza de duplicata.
  if (r.external_id && existing.some(e => e.external_id === r.external_id)) {
    return true
  }
  // Fallback: (date, amount) cobre tx antigas sem external_id e CSVs sem UUID.
  return existing.some(e =>
    e.date === r.date && Number(e.amount).toFixed(2) === Number(r.amount).toFixed(2)
  )
}
```

- [ ] **Step 3: Garantir que `existing` (carregado do DB) inclui `external_id`**

Procurar a linha onde `existing` é carregado (`supabase.from('transactions').select(...)` ou similar). Garantir que `select` inclui `external_id`. Se hoje for `select('*')`, já vem; se for explicito, adicionar.

Run:
```bash
grep -n "from('transactions')" src/components/CSVImporterModal.jsx
```

Inspecionar e ajustar se faltar `external_id` no select.

- [ ] **Step 4: Garantir que insert envia `external_id`**

Procurar onde as rows selecionadas são enviadas pro DB. O payload precisa incluir `external_id` (vem direto do `ParsedRow`). Se o código fizer spread `{ ...r }`, o campo flui automaticamente. Se for explícito (`{ date, amount, type, description, ... }`), ADICIONAR `external_id: r.external_id`.

Run:
```bash
grep -n "addTransaction\|insert\|supabase.from" src/components/CSVImporterModal.jsx
```

Inspecionar e ajustar conforme necessário.

- [ ] **Step 5: Rodar tests + build**

Run: `npx vitest run`
Expected: tudo passa (testes existentes + os 3 novos do parser).

Run: `npx vite build`
Expected: build OK.

- [ ] **Step 6: Commit**

```bash
git add src/components/CSVImporterModal.jsx
git commit -m "feat(import): isDup estrito por external_id + fallback (date, amount)"
```

---

## Onda D — Smoke test manual (USER)

### Task D.1: Re-import do CSV de Maio (dedup teste)

**Files:** apenas execução manual.

- [ ] **Step 1: Garantir dev server rodando**

URL: http://localhost:5173/ — hard refresh (Ctrl+Shift+R).

- [ ] **Step 2: Importar `NU_471229581_01MAI2026_24MAI2026.csv` de novo**

Em `/transactions` → Importar → escolhe o CSV.
Expected: a maioria das linhas vem ⚠ desmarcadas (duplicatas detectadas via external_id ou fallback). Linha do dia 25/05 (R$ 727,19 FGTS e R$ 320 cake) NÃO devem aparecer no CSV (CSV vai até 24/05).

- [ ] **Step 3: Importar sem confirmar**

Cancela o import sem confirmar. **Não deve criar nenhuma nova linha em `transactions`.**

- [ ] **Step 4: Confere no Supabase Dashboard**

```sql
SELECT count(*) FROM transactions
  WHERE account_id = (SELECT id FROM accounts WHERE name = 'NuBank Conta Corrente')
    AND month_ref = '2026-05';
```

Expected: mesmo count de antes do re-import.

- [ ] **Step 5: Verificar populamento futuro**

Quando subir CSV de Junho (ou qualquer próximo):
```sql
SELECT count(*) FROM transactions WHERE external_id IS NOT NULL;
```

Esse número cresce conforme novos imports rolam. Tx antigas ficam NULL (decisão de spec, sem backfill).

- [ ] **Step 6: Marcar checkpoint**

```bash
git commit --allow-empty -m "test(manual): external_id dedup smoke test OK"
```

---

## Self-Review

**Spec coverage:**
- ✅ Schema delta (external_id text + UNIQUE parcial) — Task A.1
- ✅ `parseExtrato` extrai Identificador — Task B.2
- ✅ `parseFatura` synthetic ID — Task B.3
- ✅ Helper `syntheticId` determinístico — Task B.1
- ✅ Dedup estrito + fallback — Task C.1
- ✅ Smoke test — Task D.1
- ✅ Sem backfill (deixar NULL) — coberto implicitamente (migration não toca rows existentes)
- ✅ db.js sem mudanças — coberto na spec, plan não cria task pra ele

**Placeholder scan:** todas as steps têm código ou comando concreto. Sem TBD/TODO.

**Type consistency:** `external_id` (snake_case) usado consistentemente em parser, importer, DB. `syntheticId` (camelCase) é o helper JS — naming OK por convenção.

