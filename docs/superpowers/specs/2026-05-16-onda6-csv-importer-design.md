# Onda 6 — CSV importer NuBank (Design Spec)

**Data:** 2026-05-16
**Branch:** `auditoria-features`
**Pré-requisito:** Onda 3 (multi-conta) + Onda 4 (Dashboard derivado) aplicadas.

---

## Goal

Permitir importar transações em batch a partir do CSV de extrato bancário e da fatura do cartão NuBank, com categorização automática via IA (Claude) e detecção soft de duplicatas. Reduz o lançamento manual.

---

## Architecture

### Onde fica

Botão **"Importar CSV"** no header de `/transactions`, ao lado do "Novo". Click abre `CSVImporterModal`.

### Fluxo (multi-step)

**Step 1 — Tipo de CSV + upload:**
- Radio:
  - `Extrato Conta Corrente` → mapeia pra conta cujo `name LIKE 'NuBank Conta%'` ou primeira `type=bank` ativa. Type da tx: `income` (valor > 0) ou `expense` (valor < 0).
  - `Fatura Cartão` → mapeia pra conta cujo `name LIKE 'NuBank Cr%'` ou primeira `type=credit subtype=credit_card`. Type da tx: sempre `expense`.
- Input `<input type="file" accept=".csv">`
- Botão "Próximo" desabilitado até user escolher tipo + arquivo

**Step 2 — Parse + preview com IA:**

Parser detecta colunas e parseia. Em paralelo, chama `categorizeBatch(descriptions, categories)` que envia 1 prompt pro Claude via `sendToClaudeAPI` e recebe sugestões de category_id.

Renderiza tabela editável (1 linha por tx):

| ✓ | Data | Descrição | Valor | Tipo | Categoria | Status |
|---|---|---|---|---|---|---|
| ☑ | 12/05/2026 | PIX João | -50,00 | Despesa | Pessoais | OK |
| ☐ | 13/05/2026 | Salário | 5000,00 | Receita | Salário | ⚠ duplicata |
| ☑ | 14/05/2026 | iFood | -42,30 | Despesa | Alimentação | IA |

- Checkbox por linha (default ON; OFF se duplicate)
- Edita inline: tipo, categoria (select), descrição, valor
- Warning "⚠ duplicata" se existe tx com `date + amount + account_id` matching no banco

**Step 3 — Confirm:**
- Botão "Importar N selecionadas" cria N `transactions` via `addTransaction` em loop sequencial
- Erros de RLS/rede param o batch e mostram quantas foram criadas até ali

### Parser NuBank — `src/lib/nubankCSV.js`

```js
// parseExtrato(text: string) → { rows: ParsedRow[], errors: string[] }
// parseFatura(text: string)  → { rows: ParsedRow[], errors: string[] }
//
// ParsedRow shape:
//   { date: 'YYYY-MM-DD', amount: number, description: string, type: 'income'|'expense', raw: object }
```

**Extrato (`Data,Valor,Identificador,Descrição`):**
- Header detection: case-insensitive, ignora colunas extras
- Data: `DD/MM/YYYY` → `YYYY-MM-DD`
- Valor: aceita `-50,00` ou `-50.00`. Negativo → `type=expense`, valor positivado. Positivo → `type=income`
- Descrição: trim, sem alteração
- Identificador: ignorado pelo MVP (sem `external_id` no schema)

**Fatura (`date,title,amount`):**
- Headers em inglês conforme padrão atual do NuBank
- Data: já `YYYY-MM-DD`
- Valor: sempre positivo → `type=expense`
- Descrição: campo `title`

**Robustez:**
- Aceita BOM no início, CRLF/LF, aspas em campos (CSV padrão com quoting)
- Linha mal-formada → entra em `errors[]` com número da linha, não bloqueia o resto
- Encoding: assume UTF-8

### IA categorização — `src/lib/aiCategorize.js`

```js
// Chama Claude via Edge Function existente. Sem mexer no supabase/functions/claude-proxy.
//
// categorizeBatch(rows, categories) → Promise<{ [description: string]: string | null }>
//   rows: ParsedRow[]
//   categories: { id, name, type }[]
//   retorna mapa { description: category_id | null }
```

Prompt enviado:
```
Você é um classificador de transações financeiras.

Categorias disponíveis (use APENAS estes IDs):
- abc123 — Alimentação (expense)
- def456 — Transporte (expense)
- ...

Para cada descrição abaixo, retorne o category_id mais apropriado.
Se não tiver certeza, retorne null.

Descrições:
1. PIX João
2. iFood Pedido 12345
3. Uber Trip

Responda APENAS um JSON neste formato:
{"1": "abc123", "2": "abc123", "3": "def456"}
```

Implementação:
- 1 chamada por upload (não 1 por linha)
- Timeout 30s, fallback: categoria `null` em todas (user categoriza manual)
- Erros de rede/parse → categoriza tudo como null, mostra warning no preview

### Dedup soft

Antes de renderizar a preview, query:
```js
const { data: existing } = await supabase
  .from('transactions')
  .select('id, date, amount, account_id')
  .in('date', uniqueDates)
  .in('amount', uniqueAmounts)
  .eq('account_id', targetAccountId)
```

Pra cada `ParsedRow`, marca `isDuplicate = true` se existe match em `existing` com mesma `date + amount + account_id`. Checkbox default OFF, badge ⚠. User decide.

### Componentes

| Arquivo | Responsabilidade | Status |
|---|---|---|
| `src/lib/nubankCSV.js` | `parseExtrato`, `parseFatura` | **NOVO** |
| `src/lib/aiCategorize.js` | `categorizeBatch` via claude.js | **NOVO** |
| `src/components/CSVImporterModal.jsx` | Modal multi-step (upload → preview → confirm) | **NOVO** |
| `src/pages/TransactionsPage.jsx` | Botão "Importar CSV" no header + render do modal | Modificado |
| `INVENTARIO.md` | Histórico + features | Modificado |

---

## Data flow

```
TransactionsPage
  └─ Botão "Importar CSV" → setImporterOpen(true)

CSVImporterModal
  Step 1: File + tipo
    └─ user escolhe tipo (extrato/fatura) e arquivo
    └─ FileReader lê texto (utf-8)

  Step 2: Parse + preview
    └─ nubankCSV.parseExtrato(text) ou parseFatura(text) → rows
    └─ db.getCategories() → categories
    └─ aiCategorize.categorizeBatch(rows, categories) → { desc: cat_id }
    └─ supabase query dedup → marks isDuplicate
    └─ renderiza tabela editável

  Step 3: Confirm
    └─ Pra cada row selecionada: addTransaction({ ...row, account_id, category_id, payment_source })
    └─ realtime atualiza Dashboard/lista
    └─ fecha modal
```

---

## Error handling

- **CSV mal-formado** (sem header reconhecido): Step 2 mostra "Formato não reconhecido. Esperado: [colunas]". Botão "Tentar outro arquivo".
- **Linha inválida** (data/valor não parseável): aparece em `errors[]` mostrado no topo da preview ("X linhas ignoradas por erro de formato"). Não bloqueia.
- **Conta-alvo não encontrada** (sem NuBank CC/Crédito ativa): Step 2 mostra select pra user escolher manualmente qual conta usar.
- **IA falha** (timeout / API down): preview renderiza com `category_id = null` em todas as linhas. Warning amarelo "IA indisponível — categorize manualmente." User pode editar.
- **Batch insert falha no meio**: para no erro, mostra "N de M importadas". User pode tentar novamente (dedup pega as já criadas na 2ª tentativa).
- **Sem categorias no banco**: select fica vazio; user importa sem categoria. Não bloqueia.

---

## Testing strategy

Manual (single-user, sem suite):

1. **Setup:** Onda 4+5 aplicadas. NuBank CC e NuBank Crédito ativos com saldos preenchidos.
2. **Mock extrato:** salvar arquivo `test_extrato.csv` com:
   ```csv
   Data,Valor,Identificador,Descrição
   12/05/2026,-50.00,abc,"PIX João"
   13/05/2026,5000.00,def,"Salário"
   14/05/2026,-42.30,ghi,"iFood Pedido"
   ```
3. `/transactions` → "Importar CSV" → escolher "Extrato Conta Corrente" → upload `test_extrato.csv` → Próximo
4. Preview deve mostrar 3 linhas, todas com IA preenchendo categorias (ou null se IA falhar).
5. Editar categoria de uma linha. Desmarcar uma. Click "Importar 2 selecionadas".
6. /transactions deve mostrar as 2 novas tx vinculadas à NuBank CC. Dashboard atualiza (saldo NuBank CC = opening_balance + 5000 − 50).
7. **Re-importar** mesmo CSV → todas as 3 linhas com ⚠ duplicata.
8. **Mock fatura:** arquivo `test_fatura.csv`:
   ```csv
   date,title,amount
   2026-05-10,Mercado XYZ,150.00
   2026-05-11,Posto ABC,90.50
   ```
9. Importar como fatura → 2 expenses vinculados a NuBank Crédito, payment_source=credit. Card Cartões no Dashboard reflete a dívida.
10. **IA offline:** desligar wifi → reimportar → preview renderiza com categories null, warning visível, user importa manualmente.

---

## Out of scope

- ❌ Importer para outros bancos (Bradesco, Itaú, PicPay) — futuro com parser plugável
- ❌ Detecção automática "pagamento de fatura" → transfer (deixar como expense incorreto; user corrige se quiser)
- ❌ Múltiplos arquivos no mesmo upload
- ❌ Histórico de importações / undo
- ❌ Reconciliação contínua (Pluggy/Open Finance) — frente abandonada
- ❌ Campo `external_id` em transactions (identificador único do banco) — adicionar futuro pra dedup forte
- ❌ Importer pra Biplay, envelope
- ❌ Sugerir budget_item automaticamente (só categoria por enquanto)
- ❌ Vincular goal via importer (user faz manual depois)

---

## Decisões tomadas no brainstorming

1. **Escopo CSV:** ambos (extrato + fatura) com 2 modos no mesmo modal ✅
2. **Inteligência:** avançado com IA categorizando via Claude ✅
3. **Dedup:** soft (warning + checkbox OFF), não bloqueia ✅ (incluído como defensivo barato mesmo sem ser pedido explicitamente)
4. **Edge Function:** reusa `claude-proxy` existente sem modificar — `sendToClaudeAPI` aceita system+messages genéricos ✅
