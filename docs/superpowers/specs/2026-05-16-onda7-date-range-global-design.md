# Onda 7 — Seletor de período global (Design Spec)

**Data:** 2026-05-16
**Branch:** `auditoria-features`
**Pré-requisito:** Onda 4 (Dashboard multi-conta) aplicada. Ondas 5 e 6 não bloqueiam.

---

## Goal

Substituir o filtro implícito por `month_ref` (mês-calendário) pelo seletor global de período. Um único seletor no app-shell controla o intervalo de datas que **todas** as 5 páginas (Dashboard, Transactions, Bills, Budget, Lista) usam pra agregar transações e bills.

Resolve o gap herdado da Onda 4 (ciclos cross-month, ex: 15/05 → 15/06, não casam com `month_ref`) e habilita visões novas como "últimos 90 dias".

---

## Decisões de produto (do brainstorming)

| # | Decisão | Escolha |
|---|---|---|
| Q1 | Escopo do seletor | Global no header (5 páginas) |
| Q2 | Tipos de range | Presets + range custom |
| Q3 | Derivados de ciclo quando range ≠ ciclo único | Esconde bloco |
| Q4 | Persistência | localStorage |
| Q5 | Default 1º acesso | Ciclo atual (fallback mês atual) |
| Q6 | Faseamento | Fase 0 hoje (SQL) + Onda 7 depois |

---

## Architecture

### Fase 0 — Quick fix imediato (não requer código novo)

Antes da Onda 7, destravar o ciclo atual via dois SQLs:

```sql
UPDATE budget_cycles
  SET start_date = '2026-05-14'
  WHERE month_ref = '2026-05';
```

Depois, aplicar `seed_tx_2026-05.sql` (já commitado em 27c9600). Resultado: o salário do dia 14/05 passa a contar no ciclo atual sem precisar da Onda 7.

Tentativa via Supabase CLI primeiro; fallback Dashboard SQL Editor.

### Contexto global

**Novo arquivo `src/contexts/DateRangeContext.jsx`:**

```js
const DateRangeContext = createContext(null)

export function DateRangeProvider({ children }) {
  const [range, setRangeState] = useState(loadFromStorage)
  const [cycles, setCycles] = useState([])

  // Bootstrap: se localStorage vazio, default = ciclo atual (today entre start/end_date)
  // ou mês atual se nenhum cycle ativo.

  // localStorage sync (escrita) + storage event listener (leitura cross-tab).

  return <DateRangeContext.Provider value={{ range, setRange, preset: range.preset }}>
    {children}
  </DateRangeContext.Provider>
}

export const useDateRange = () => {
  const ctx = useContext(DateRangeContext)
  if (!ctx) throw new Error('useDateRange deve ser usado dentro de DateRangeProvider')
  return ctx
}
```

**Shape do `range`:**

```ts
{
  startDate: 'YYYY-MM-DD',   // ISO date, inclusivo
  endDate:   'YYYY-MM-DD',   // ISO date, inclusivo
  preset:    'cycle' | 'this_month' | 'last_month' | 'last_30d' | 'last_90d' | 'custom',
  label:     string,         // ex: "Ciclo atual (14/05 → 13/06)"
}
```

O `cycleId` não vai no shape — é sempre derivado via `cycles.find(c => c.start_date === range.startDate && c.end_date === range.endDate)` dentro de quem precisa. Evita estado redundante.

**Chave localStorage:** `finapp:dateRange` — JSON do shape acima. Validação: ao carregar, se preset === 'cycle', recalcula start/end do cycle ativo (datas podem ter mudado entre sessões).

### Seletor UI

**Novo componente `src/components/DateRangeSelector.jsx`:**

- Botão no app-shell (mobile: header da página; desktop: sidebar topo). Mostra `range.label`.
- Click abre dropdown:
  ```
  ▼ Ciclo atual (14/05 → 13/06)
  ──────────────────────────────
    Ciclo atual          ✓
    Mês atual (maio/26)
    Mês passado (abril/26)
    Últimos 30 dias
    Últimos 90 dias
  ──────────────────────────────
    Personalizado…
  ```
- "Personalizado…" mostra inline 2 inputs `type="date"` + botão "Aplicar" (validação: start ≤ end).
- Sem libs novas (date picker nativo do browser).

### Onde plugar no app

`src/App.jsx`: embrulhar a árvore com `<DateRangeProvider>` logo dentro de `<AuthProvider>`. O seletor entra em `src/components/Layout.jsx` (ou onde mora o header global).

### Hooks afetados

`src/hooks/useData.js`:

| Hook hoje | Mudança |
|---|---|
| `useMonthRef()` | **Remover.** Nenhuma UI consome mais. Pontos internos que dependem de `month_ref` (rollover reserva em `db.computeRolloverReserva`, INSERTs em `withMonthRef`) continuam usando `month_ref` derivado da `date` da tx — não dependem do filtro de UI. |
| `useDashboard(monthRef)` | Sem arg. Lê `useDateRange()`. Internamente chama `getTransactionsByRange(start, end)` + `getBillsByRange(start, end)` + busca cycle por match exato `(start_date, end_date)`. |
| `useTransactions(monthRef)` | Sem arg. Lê `useDateRange()`. Usa `getTransactionsByRange`. |
| `useBills(monthRef)` | Sem arg. Lê `useDateRange()`. Usa `getBillsByRange` (nova função). |
| `useBudgetCycle(monthRef)` | Sem arg. Lê `useDateRange()`. Retorna cycle por match exato, senão null. |
| `useTransactionsByCycle(start, end)` | **Manter.** Primitiva pra range arbitrário, usada quando o caller passa um intervalo explícito (não vem do contexto global). Hoje é chamado por components que recebem `cycle` via props. |

`src/lib/db.js`:

```js
// Nova função
export const getBillsByRange = (startDate, endDate) =>
  supabase.from('bills')
    .select('*, budget_items(active, payment_source)')
    .gte('due_date', startDate)
    .lte('due_date', endDate)
    .order('due_date')
```

`getTransactions(monthRef)` e `getBills(monthRef)` ficam no arquivo por compat (usados em pontos isolados — ex: rollover reserva precisa do month anterior), mas não são chamados mais pelas páginas.

### Lógica de "cycle match" e derivados condicionais

Em `useDashboard`:

```js
// cycles: array carregado uma vez por sessão (useCycles)
const cycle = cycles.find(c =>
  c.start_date === range.startDate && c.end_date === range.endDate
) || null
```

`cycle === null` => esconde o bloco "Disponível pra gastar" e oculta as métricas Ritmo/Reserva no bottom-trigger drawer (Metas continua aparecendo — Metas não dependem de cycle).

`cycle !== null` => Dashboard renderiza igual hoje.

### Migrações de página

| Página | Mudança |
|---|---|
| `DashboardPage` | `useMonthRef()` → `useDateRange()`. Header da página perde "subtítulo do mês" (vira o `range.label` do seletor global). Bloco "Disponível pra gastar" condicional em `cycle != null`. |
| `TransactionsPage` | Remove seletor de mês local. Lista filtrada por `range`. |
| `BillsPage` | Remove seletor local. Lista bills com `due_date` dentro do range. |
| `BudgetPage` | Remove seletor local. Carrega budget_items + cycle que casa com o range (ou null). Se cycle null: mostra mensagem "Período não corresponde a um ciclo configurado". |
| `ListaPage` | Remove seletor local. |

---

## Data flow (Dashboard, exemplo)

```
DateRangeProvider (bootstrap: ler localStorage ou default=ciclo atual)
       │
       ▼
DateRangeSelector (no app-shell)
       │ user clica preset/custom
       ▼
setRange({ startDate, endDate, preset, label })
       │ Context propaga + localStorage.setItem
       ▼
useDashboard() (lê via useDateRange)
       │
       ├─ db.getTransactionsByRange(start, end) ──┐
       ├─ db.getBillsByRange(start, end)          ├─► data = { transactions, bills, cycle, ... }
       ├─ cycles.find(c => c.start === start &&   │
       │             c.end === end)               │
       └─ db.getBudgetItems() ────────────────────┘
                                                   │
                                                   ▼
                                          DashboardPage renderiza
                                          (esconde derivados se cycle === null)
```

---

## Error handling / edge cases

- **localStorage corrompido:** `JSON.parse` falha → bootstrap recai pro default (ciclo atual).
- **Custom range com start > end:** UI bloqueia o "Aplicar".
- **Custom range muito longo (ex: 5 anos):** sem limite hard. Performance dos `gte/lte` no Supabase é OK até dezenas de milhares de tx.
- **Range cross-cycle (ex: últimos 90d cobre 3 ciclos):** `cycle = null` → derivados escondidos como esperado.
- **Nenhum cycle existe na tabela:** default cai pra mês atual (Q5).
- **Storage event de outra aba:** Context atualiza estado → todas as queries refetch via `useEffect` dependente de range.

---

## Testing

**Unitários (Vitest):**
- `useDateRange` — default sem storage; default com cycle; restore válido; restore corrompido; setRange persiste; preset='cycle' re-resolve datas.
- Função `findCycleForRange(cycles, range)` — match exato, multi-match (impossível pelo schema mas defender), null.

**Smoke browser (manual, após implementação):**
- Trocar preset no header → 5 páginas atualizam.
- "Personalizado" → validação start ≤ end; aplicar persiste; reload mantém.
- Range = ciclo atual → bloco "Disponível" aparece no Dashboard.
- Range = "Últimos 90 dias" → bloco "Disponível" some.
- Abrir 2 abas → mudar range numa, outra atualiza.

---

## Out of scope (Onda 7)

- Compartilhar range via URL (`?from=...&to=...`). Pode virar Onda 8.
- Sincronizar range cross-device por banco (`user_preferences`). Só se Carlos+Gabriele precisarem divergir.
- Refactor de `month_ref` na tabela `transactions`: continua sendo gravado nos INSERTs por compat (rollover de reserva ainda usa). Só não é mais filtro de UI.
- Remoção das funções `getTransactions(monthRef)`/`getBills(monthRef)` em `db.js`: mantidas pra rollover reserva e backwards compat.

---

## Alternativas consideradas

**A. Context Provider global** — escolhida.

**B. Hook sem Context (só localStorage + storage event)** — rejeitada. Cada página precisaria coordenar leitura manual e re-renders ficam menos previsíveis.

**C. Híbrido (só Dashboard usa range, outras páginas mantêm month_ref)** — rejeitada por contradizer Q1.
