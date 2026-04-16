# Budget Engine — Renda, Crédito e Checkpoints

Documento técnico do motor de orçamento implementado em [src/lib/budgetEngine.js](../src/lib/budgetEngine.js).

## Buckets

Todo `budget_item` e toda `transaction` carregam `payment_source` obrigatório:

| payment_source    | bucket   | significado                                |
|-------------------|----------|--------------------------------------------|
| `fixed_income`    | `income` | Renda fixa (salário, aluguel recebido)     |
| `variable_income` | `income` | Renda variável (freelas, extras)           |
| `credit`          | `credit` | Gasto no cartão / limite de crédito        |

O helper `bucketOf(source)` normaliza os dois tipos de renda no bucket único `income`. Crédito **não** entra no saldo livre de metas ([src/lib/goalPlanner.js](../src/lib/goalPlanner.js) filtra `payment_source !== 'credit'`).

## Ciclo (`budget_cycles`)

Um registro por usuário/mês, com:
- `start_date` / `end_date`
- `saldo_origem_income`, `saldo_origem_credit` — "teto" de cada bucket
- `reserva_pct` — margem de segurança aplicada sobre o saldo origem

O auto-seed na migração garante um ciclo padrão do mês corrente derivado dos `budget_items` ativos. O botão **Reseed** na BudgetPage recalcula `saldo_origem_*` depois de reclassificações manuais.

## Snapshot reativo

`computeBucketSnapshot({ bucket, cycle, items, transactions })` roda no cliente e devolve valores com semântica **diferente por bucket**:

**Bucket `income`** (dinheiro que é seu):
```
saldoOrigem     = cycle.saldo_origem_income
reserva         = saldoOrigem * reserva_pct / 100
gastoReal       = Σ transactions(expense, income)
saldoDisponivel = max(saldoOrigem - reserva - gastoReal, 0)
diasRestantes   = max(end_date - today + 1, 1)
mediaDiaria     = saldoDisponivel / diasRestantes
metaSemanal     = mediaDiaria * 7
```

**Bucket `credit`** (dívida — idealmente não se usa):
```
saldoOrigem     = cycle.saldo_origem_credit   (limite do cartão)
reserva         = 0                           (não aplica — crédito é dívida, não sobra pra "reservar")
gastoReal       = Σ transactions(expense, credit)
saldoDisponivel = max(saldoOrigem - gastoReal, 0)
mediaDiaria     = 0                           (não faz sentido racionar limite de crédito ao longo do mês)
metaSemanal     = 0
```

Reserva e projeção temporal (média diária / meta semanal) são exclusivas de renda porque é o único bucket que representa recurso próprio a ser distribuído até o fim do ciclo. Crédito vira apenas contador `limite → usado → disponível`.

Como todo hook (`useDashboard`, `useBudgetCycle`, etc) assina `postgres_changes` em `transactions`, `budget_items`, `budget_cycles` e `weekly_checkpoints`, **qualquer mutação força recomputação** — não há cache server-side; o efeito "apertar o cinto" emerge naturalmente do recálculo de `mediaDiaria` (bucket renda) após cada gasto registrado.

## Saúde ao vivo

`liveHealth({ cycle, snapshot, today })` interpola o gasto esperado para o dia corrente:

```
previstoHoje = (saldoOrigem - reserva) * (diasCorridos / duracaoCiclo)
delta        = (gastoReal - previstoHoje) / (saldoOrigem - reserva)
status       = delta <= -0.05 → 'green'   (gastando abaixo do ritmo)
             | delta >=  0.05 → 'red'     (estouro)
             | otherwise       → 'yellow' (dentro da margem ±5%)
```

Exibido como círculo colorido no Dashboard.

## Checkpoint semanal

Semana ISO segunda→domingo (`isoWeekBounds`). O `WeeklyCheckpointModal` sugere por padrão a semana anterior e, para cada bucket, grava em `weekly_checkpoints`:

- `saldo_previsto`: `snapshot.saldoDisponivel` no momento do fechamento
- `saldo_real`: input do usuário (saldo real em conta/fatura)
- `status`: `healthStatus(real, previsto)` — verde se real ≥ previsto +5%, vermelho se real ≤ previsto -5%, amarelo na faixa central
- `note` opcional

Histórico fica visível na aba **Histórico** da BudgetPage e, agregado, no BarChart Previsto×Real do Dashboard.

## Fluxo de uma transação reativa

1. Usuário registra expense R$500 (payment_source=`fixed_income`) em `/transactions`.
2. Supabase insere linha e dispara realtime.
3. `useDashboard` e `useBudgetCycle` recebem o evento, refazem fetch.
4. `computeBucketSnapshot` recalcula: `gastoReal +=500` → `saldoDisponivel -=500` → `mediaDiaria` encolhe.
5. UI re-renderiza com novos KPIs (<2s end-to-end).

## Sincronização com IA

`getAIContext` ([src/lib/db.js](../src/lib/db.js)) injeta no prompt do Claude:
- `cycle` do mês corrente
- `incomeSnapshot` e `creditSnapshot`
- `health` atual
- Últimos 4 `weekly_checkpoints`

O prompt em [src/lib/claude.js](../src/lib/claude.js) exige `payment_source` em toda ACTION que crie transação ou budget_item, e aceita o novo tipo `record_checkpoint { bucket, saldo_real, week_start?, note? }`.

## Fora de escopo

- **Sazonalidade**: detectar padrões mensais repetidos nos checkpoints. Precisa de ≥3 meses de log para ter sinal — próxima iteração.
- **Múltiplos cartões**: hoje crédito é bucket único; particionar por cartão exige nova tabela `credit_accounts` e FK em `budget_items`/`transactions`.
- **Notificações (push / e-mail / Google Calendar)**: descartadas por decisão de produto. O usuário não esquece data de vencimento — esquece o que precisa pagar. O app já cobre isso com o dashboard de bills próximas, então notificação externa não agrega.
