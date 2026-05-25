# External ID Dedup — Design Spec

**Data:** 2026-05-25
**Autor:** Carlos + Claude
**Status:** Aprovado para implementação

## Contexto e motivação

A sessão de hoje fechou com várias divergências entre o saldo real da NuBank Conta Corrente e o saldo calculado pelo app:

- Duplicata oculta no CSV (R$ 8 + R$ 8 no mesmo dia foi colapsada pelo dedup atual)
- Lançamento manual ("Padaria R$ 22,68") colidiu com CSV ("BRUNA PAES R$ 22,70")
- Agregação manual ("Gastos esporádicos R$ 304,23") vs CSV individual

Causa raiz: `isDup` em [CSVImporterModal.jsx:88-90](src/components/CSVImporterModal.jsx) compara apenas `(date, amount)`. Frágil em valores idênticos no mesmo dia, e cego pra descrição.

Solução: usar o **UUID por tx que o NuBank já entrega na coluna `Identificador`** do CSV de extrato, e gerar um ID sintético determinístico pra CSV de fatura. Salvar como `external_id` em `transactions` com UNIQUE index parcial.

## Escopo

**Inclui:**
- Coluna `transactions.external_id text` + UNIQUE index parcial (NULL permitido)
- Parser do extrato (`parseExtrato`) extrai `Identificador` → `external_id`
- Parser da fatura (`parseFatura`) gera `external_id` sintético determinístico
- Importer (`CSVImporterModal.isDup`) — estrito por `external_id`, fallback `(date, amount)`
- Tests pro parser

**Fora de escopo:**
- Backfill de tx antigas (ficam com `external_id NULL`; dedup futuro usa fallback pra elas)
- Mudança no `db.js` (spread genérico já passa o campo)
- UI nova de "merge manual+CSV" (usuário decide manualmente pelo checkbox + ⚠)

## Decisões de design (brainstorming 2026-05-25)

1. **Dedup estrito por external_id + fallback `(date, amount)`** quando algum lado não tem external_id
2. **Sem backfill** — tx antigas ficam NULL; dedup degrada gracefully via fallback
3. **Fatura ganha external_id sintético** via hash determinístico de `(date, amount, description_normalizada)`

## Arquitetura

### Schema

```sql
ALTER TABLE transactions ADD COLUMN external_id text;
CREATE UNIQUE INDEX uniq_tx_external_id
  ON transactions(external_id)
  WHERE external_id IS NOT NULL;
```

- `text` (não `uuid`) — acomoda IDs sintéticos tipo `nu-credit:2026-05-15:114.74:claude-ai`
- UNIQUE parcial — `NULL` repetido permitido pra tx antigas/manuais
- DB enforça anti-duplicata mesmo se importer tiver bug

### Parser — `src/lib/nubankCSV.js`

**`parseExtrato`:** localiza coluna `identificador` no header e expõe no `ParsedRow`:

```js
const idxId = header.findIndex(h => h === 'identificador')
rows.push({
  date, amount: Math.abs(valor), description: desc || '',
  type: valor < 0 ? 'expense' : 'income',
  external_id: idxId >= 0 ? (cols[idxId] || null) : null,
  raw: { dateStr, valStr, desc },
})
```

**`parseFatura`:** gera `external_id` sintético via função helper:

```js
function syntheticId(prefix, date, amount, description) {
  const norm = (description || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // remove acentos
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${prefix}:${date}:${amount.toFixed(2)}:${norm}`
}
```

Exemplo: `nu-credit:2026-05-15:114.74:claude-ai-subscription`. Mesma input → mesma output (determinístico, re-import vira no-op).

### Importer — `src/components/CSVImporterModal.jsx`

Substituir `isDup` (~linha 88):

```js
const isDup = (r) => {
  if (r.external_id && existing.some(e => e.external_id === r.external_id)) {
    return true
  }
  return existing.some(e =>
    e.date === r.date && Number(e.amount).toFixed(2) === Number(r.amount).toFixed(2)
  )
}
```

E garantir que o payload do insert inclui `external_id` (vem direto do `ParsedRow`).

### DB layer

Nenhuma mudança — `src/lib/db.js` já faz spread genérico em `addTransaction`/`updateTransaction`. Campo flui automaticamente.

### Error handling

| Cenário | Tratamento |
|---|---|
| Constraint UNIQUE viola (race condition ou bug) | Supabase retorna erro `23505`; UI mostra "Tx já existe (uuid: X)" e pula a linha. Batch continua. |
| `Identificador` ausente no header do CSV | `external_id = null`; cai no fallback de dedup. Continua funcionando. |
| Manual com `(date, amount)` igual a CSV | `isDup` retorna true via fallback. Linha CSV vem com ⚠, desmarcada. Usuário decide. |
| Fatura re-importada com descrição ligeiramente diferente | Hash muda → cria 2 entradas. Fallback `(date, amount)` ainda flagga visualmente. |

## Testes

Sem teste de UI. **Novo** `src/lib/nubankCSV.test.js`:

- `parseExtrato` extrai `external_id` do header `Identificador`
- `parseExtrato` retorna `external_id=null` quando header não tem essa coluna
- `parseFatura` gera external_id determinístico (chamar 2x com mesma input → mesma string)
- `syntheticId` é case-insensitive na descrição (normaliza acentos e punctuation)

## Rollout

Ondas curtas, independentes:

1. **Onda A** — Migration: ALTER + UNIQUE INDEX
2. **Onda B** — Parser: extrato + fatura + helper `syntheticId` + tests
3. **Onda C** — Importer: nova `isDup` + payload passa external_id
4. **Onda D** — Smoke test manual: re-importa CSV antigo (deve dar 0 duplicatas novas), sobe CSV de junho (deve flagar corretamente)

**Risco:** baixo. Mudança aditiva (nova coluna, sem mudar comportamento de fallback). Reversão = drop column + revert parser/importer.
