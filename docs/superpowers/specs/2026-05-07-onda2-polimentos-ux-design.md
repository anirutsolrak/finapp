# Onda 2 — Polimentos UX

**Data:** 2026-05-07
**Branch:** `auditoria-features`
**Status:** Spec aprovado, aguarda implementação

## 1. Contexto e problema

Após a Onda 1 (Limpeza), o INVENTARIO.md identificou 4 áreas confusas no app. No brainstorming, 1 saiu (lembrete de receita — é cultura do user, não responsabilidade do app) e 1 cresceu (freeBalance virou "reformular Metas inteiro"). Sobrou:

**2.A — Lançamentos filtra por mês calendário, não por ciclo**
A vida do usuário roda em ciclos (atual 15/04→15/05, mas o ciclo é dinâmico — pode mudar). A view "Abril 2026" mistura tx do ciclo anterior (1-14/04) com o atual (15/04→). Cards "Ritmo", "Consolidado" e a navegação por setas operam em mês, não em ciclo.

**2.B — Categorias no select sem chip de type**
Hoje o select mostra `🏠 Aluguel` sem indicar se é receita/essencial/variável/etc. Fácil escolher categoria errada. Aplica em TxModal (Lançamentos) e ItemModal (Planejamento).

**2.C — Metas com modelo errado**
User: "tudo confunde minha esposa". Quatro frentes confusas:
- "Saldo livre" calculado com regra estranha (planejamento - fixos)
- "Quanto já foi guardado" vem de cliques nos dots (não da realidade)
- "Quanto guardar por mês" calculado por agressividade que parece arbitrária
- "Quando vai atingir" só faz sentido se contribuição mensal for cumprida

User: "se apertar, vou lá e gasto o que tava guardado". O app não pode impedir — tem que **refletir** isso.

Modelo escolhido: **espelho honesto + indicador silencioso**.

## 2. Decisões tomadas no brainstorming

| Decisão | Escolha |
|---|---|
| Estratégia | 4 áreas viraram 3 (lembrete de receita saiu) |
| Lançamentos | Sempre por ciclo dinâmico (sem toggle Mês/Ciclo) |
| Modelo Metas | Espelho honesto (saldo derivado de tx vinculadas) |
| Indicador de "meta parada" | Ícone silencioso (sem banner, sem notificação) |
| Schema `goals` | Manter colunas órfãs por agora; drop num commit futuro após validação |
| `transactions.goal_id` | Adicionar via nova migration `migration_goal_link.sql` |
| `goalPlanner.js` | Deletar inteiro |
| `freeBalance` | Removido (ninguém consome mais) |

## 3. Escopo

### 3.A Filtro por ciclo em Lançamentos

**`src/pages/TransactionsPage.jsx`:**
- State `monthRef` (string `'2026-05'`) é substituído por state `{ cycleId, startDate, endDate }` (objeto único pra navegação)
- Navegação `prevMonth/nextMonth` (setas) vira `prevCycle/nextCycle` — busca ciclos anterior/próximo em `budget_cycles` ordenados por `start_date` (filtra `start_date < currentStart` pra anterior, `start_date > currentStart` pra próximo)
- Header mostra `15/04/2026 → 15/05/2026` em vez de `Abril de 2026`
- Se não há ciclo no DB, mostra CTA "Configure o primeiro ciclo no Planejamento"
- `isCurrentMonth` vira `isCurrentCycle` (today entre start_date e end_date)

**`src/hooks/useData.js`:**
- `useTransactions(monthRef)` ganha versão alternativa OU é refatorado pra aceitar `(startDate, endDate)`
- Filtro Supabase: `.gte('date', start).lte('date', end)` em vez de `.eq('month_ref', monthRef)`

**`src/lib/db.js`:**
- `getTransactions(monthRef)` ganha versão pra range OU refatorado:
  ```js
  getTransactionsByRange(startDate, endDate) =>
    supabase.from('transactions')
      .select('*, categories(*), budget_items(name)')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false })
  ```

**Impacto colateral:**
- `useTransactions` também é chamado em `BudgetPage.jsx` — verificar se precisa migrar lá também ou manter `monthRef`. Decisão: BudgetPage usa o ciclo via `useMonthRef`/`useBudgetCycle`, então pode manter passando `monthRef` pra retrocompat até definirmos.
- **Decisão**: criar `useTransactionsByCycle(cycleId)` separado pra Lançamentos, manter `useTransactions(monthRef)` pra BudgetPage. Simplifica.

### 3.B Chip de type em categorias

**`src/pages/TransactionsPage.jsx` (TxModal):**
- Mudar a renderização do `<option>`:
  ```jsx
  <option key={c.id} value={c.id}>[{TYPE_LABELS[c.type] || '—'}] {c.icon} {c.name}</option>
  ```
- Mapa `TYPE_LABELS` já existe em TransactionsPage:
  ```js
  const TYPE_LABELS = { income: 'Receita', expense: 'Despesa', investment: 'Investimento', transfer: 'Transferência' }
  ```
- Mas categorias têm types diferentes (income, essential, variable, installment, investment, reserve). Precisamos de outro mapa:
  ```js
  const CATEGORY_TYPE_LABELS = {
    income: 'Receita',
    essential: 'Essencial',
    variable: 'Variável',
    installment: 'Parcela',
    investment: 'Investimento',
    reserve: 'Reserva',
  }
  ```

**`src/pages/BudgetPage.jsx` (ItemModal):**
- Já tem `TYPE_LABELS` com os 6 types (linha 15) — usar esse no `<option>`:
  ```jsx
  <option key={c.id} value={c.id}>[{TYPE_LABELS[c.type]}] {c.icon} {c.name}</option>
  ```
- BudgetPage atual mostra `{c.icon} {c.name} — {TYPE_LABELS[c.type]}` (com em-dash). Trocar pelo prefixo `[]`.

### 3.C Reformulação de Metas (espelho honesto)

**`migration_goal_link.sql` (novo):**
```sql
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS goal_id uuid REFERENCES goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_goal
  ON transactions(goal_id) WHERE goal_id IS NOT NULL;
```

**`src/pages/GoalsPage.jsx`:**
- Remover import `computeFreeBalance, computeGoalPlan, AGGRESSIVENESS_*` de `../lib/goalPlanner`
- Remover `useBudgetItems` (não usa mais sem freeBalance)
- Adicionar `useTransactionsByCycle` (ou alternativa) pra somar tx por goal_id no ciclo atual
- Remover state/lógica de `freeBalance`
- Remover componente `GoalDots` inteiro
- Remover função `markDot` inteira
- Função nova `computeGoalAmount(goal, allTransactions)`:
  ```js
  function computeGoalAmount(goal, allTransactions) {
    const initial = Number(goal.current_amount) || 0  // valor inicial declarado na criação
    let fromTx = 0
    for (const t of allTransactions || []) {
      if (t.goal_id !== goal.id) continue
      if (t.type === 'transfer') fromTx += Number(t.amount)
      else if (t.type === 'expense') fromTx -= Number(t.amount)
    }
    return Math.max(initial + fromTx, 0)
  }
  ```
- Função nova `hasMovementInCycle(goalId, cycleTransactions)`:
  ```js
  function hasMovementInCycle(goalId, cycleTransactions) {
    return (cycleTransactions || []).some(t => t.goal_id === goalId)
  }
  ```
- Card de cada meta renderiza:
  - Nome + ícone `<Moon size={12} className="text-gray-500" title="Sem aporte neste ciclo"/>` (lucide-react) se `!hasMovementInCycle(g.id, cycleTransactions)`
  - Barra de progresso usando `computeGoalAmount(g.id, allTransactions)` / `target_amount`
  - Texto `R$ {current_derivado} / R$ {target}`
  - Remover: dots, "💰 R$ X/mês", "📅 N/T meses", "🎯 Até data"
- Header da página: remover "Saldo livre: R$ X"

**`src/pages/GoalsPage.jsx` (GoalModal):**
- Remover campo `aggressiveness` (select)
- Manter campos: nome, descrição, target_amount, current_amount, priority, is_fixed, category
- Rótulo do `current_amount` muda pra **"Valor inicial já guardado (R$)"** com tooltip "Quanto você já tinha guardado pra essa meta antes de começar a vincular tx no app. Depois de criada, o saldo é atualizado automaticamente pelas tx vinculadas."
- Remover preview "Plano calculado pela IA"
- Remover warning "freeBalance indisponível"
- Save payload (campos enviados pro upsert):
  ```js
  {
    name, description, target_amount, current_amount,
    priority, is_fixed, category,
    user_id,
  }
  ```
  Campos antigos (aggressiveness, monthly_contribution, target_date, total_months, months_completed, ai_computed_at) **NÃO** são enviados — banco mantém o valor existente se tiver. Pra goals novas, ficam null/default.

**`src/pages/TransactionsPage.jsx` (TxModal):**
- Adicionar campo opcional "Vincular à meta" no form (select de goals ativas)
- Persistir `goal_id` ao salvar
- Recebe `goals` como prop OU usa hook `useGoals()` interno

**`src/lib/goalPlanner.js`:**
- **DELETAR** o arquivo inteiro.

**`src/lib/claude.js`:**
- Remover import `computeGoalPlan, AGGRESSIVENESS_PCT` se houver
- Remover bloco de regra que menciona aggressiveness/monthly_contribution no prompt
- Remover `toGoal` na função `approveAction` (ChatPage) — refatorar pra criar goal sem agressividade
- Mantém ação `add_goal` mas com schema simplificado: `{ name, target_amount, current_amount?, priority?, is_fixed? }`

**`src/pages/ChatPage.jsx`:**
- Função `toGoal` atual usa aggressiveness — refatorar:
  ```js
  function toGoal(item) {
    return {
      user_id: user.id,
      name: item.name || item.description || item.title || 'Sem nome',
      description: item.description || null,
      target_amount: parseFloat(item.target_amount || item.amount || 0),
      current_amount: parseFloat(item.current_amount || 0),
      is_fixed: item.is_fixed ?? false,
      priority: item.priority || 1,
    }
  }
  ```
- Remover import `computeGoalPlan, AGGRESSIVENESS_PCT` de goalPlanner (delete acima já cobre)

**`src/hooks/useData.js`:**
- Hook novo `useTransactionsByCycle(startDate, endDate)` — usado por TransactionsPage (lista do ciclo) e GoalsPage (pra hasMovementInCycle)
- Hook novo `useAllTransactions()` — usado por GoalsPage (pra computeGoalAmount global)
  - Implementação: `supabase.from('transactions').select('*').not('goal_id', 'is', null)` — só tx que importam pra metas (otimização: filtra direto no banco)

**Decisão de escopo da soma:**
- `computeGoalAmount(goal, allTransactions)` soma **todas as tx vinculadas** (sem filtro de ciclo). Faz sentido: a meta acumula desde sempre.
- `hasMovementInCycle(goalId, cycleTransactions)` checa só o ciclo atual pra o ícone Moon.
- GoalsPage usa **2 hooks**: `useGoals()` + `useTransactionsByCycle(currentCycle.start, currentCycle.end)` + `useAllTransactions()` filtrado por goal_id.

### 3.D Limpeza de imports/refs órfãos

- `goalPlanner.js` deletado → remover qualquer import em outros arquivos
- `freeBalance` removido → grep e limpar
- `markDot` removido → grep e limpar

## 4. Documentação atualizada

### `INVENTARIO.md`

Atualizar:
- Seção 5 (Metas): remover linhas referentes a GoalDots, markDot, aggressiveness, freeBalance. Adicionar linhas novas (current_amount derivado, indicador silencioso, vínculo via goal_id em tx)
- Seção 2 (Lançamentos): mencionar que navega por ciclo
- Resumo executivo: marcar itens "Filtro por mês calendário", "freeBalance ignora saldo real", "Vínculo meta vs transação", "categoria sem chip de type" como ✅ resolvidos
- Histórico de execução: adicionar entrada da Onda 2

## 5. Critérios de done

- ✅ Todas as remoções e adições da seção 3 aplicadas
- ✅ `npm run build` limpo
- ✅ `git status` clean
- ✅ Migration `migration_goal_link.sql` aplicada no Supabase (manual)
- ✅ Smoke test manual:
  - `/transactions` navega por ciclo (15/04→15/05) e setas avançam ciclo
  - TxModal mostra `[Receita] 💰 Salário` no select de categoria
  - GoalsPage sem dots, sem agressividade, com `current_amount` derivado das tx
  - Criar tx tipo `transfer` com `goal_id` setado → meta sobe; criar `expense` com mesmo goal_id → meta cai
  - Meta sem tx no ciclo mostra ícone silencioso (zzz/moon)
- ✅ `INVENTARIO.md` atualizado
- ✅ Tabela `goals` mantém colunas órfãs (não dropar agora)

## 6. Estrutura de commits sugerida

Áreas independentes, commits granulares:

1. `feat(migration): adiciona transactions.goal_id pra vincular tx a meta`
2. `feat(tx): TxModal categoria mostra chip de type`
3. `feat(budget): ItemModal categoria mostra chip de type`
4. `feat(tx): Lançamentos navega por ciclo dinamico (start_date → end_date)`
5. `refactor(goals): GoalsPage com current_amount derivado de tx`
6. `refactor(goals): GoalModal sem agressividade/monthly_contribution`
7. `feat(tx): TxModal ganha campo Vincular meta`
8. `chore(cleanup): deleta goalPlanner.js orfao`
9. `refactor(ai): claude.js sem agressividade no prompt + ChatPage toGoal simplificado`
10. `docs: atualiza INVENTARIO.md pos-Onda2`

## 7. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Migration falha por já ter `goal_id` (cherry-pick antigo deixou em parked) | `ADD COLUMN IF NOT EXISTS` — idempotente |
| Goals existentes (Cadeira) ficam com current_amount manual diferente do derivado | Aceitar: ao migrar, o derivado começa em 0 (sem tx vinculadas ainda). User pode "ajustar" criando uma tx histórica com goal_id e data antiga, ou aceitar o reset visual. Documentar no commit que migra Goals |
| BudgetPage.useCheckpoints já foi removido, mas useTransactions(monthRef) ainda existe — confusão se mexe nele | Criar `useTransactionsByCycle` separado, deixar `useTransactions(monthRef)` intacto |
| IA propõe goal com aggressiveness no formato antigo | toGoal nova ignora campo. Sem quebra de fluxo |
| Filtro por ciclo quebra quando não há ciclo configurado | CTA "configure ciclo" + fallback pra mês corrente (ou mostra empty state) |

## 8. Próximos passos

1. Invocar **writing-plans skill** pra gerar implementation plan
2. Executar via subagent-driven-development
3. Smoke test do user
4. Merge na main
5. Avançar pra Onda 3 (Multi-conta) — novo spec
