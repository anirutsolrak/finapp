# Onda 4 — Planejamento + Lançamentos numa página Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Execução nativa, em modo ponytail. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma tela só, por mês: você planeja as contas, marca como paga (gera o lançamento, ou não) e importa o extrato para completar e conciliar tudo.

**Architecture:** `PlanningPage` substitui `CombinedPlanningPage` + `BudgetPage` + `TransactionsPage`. O mês em foco (`month_ref`) é o único período: contas pelo `month_ref`, lançamentos pela data dentro do mês. O seletor global de período e os ciclos saem (não havia mais tela para criar ciclo, e eram dois seletores de período diferentes na mesma tela). Os modais grandes viram arquivos próprios, sem mudar de comportamento.

**Tech Stack:** React 19, Supabase JS, date-fns, Tailwind, Vitest + Testing Library.

**Spec:** pedido do usuário — "lançamento e planejamento deveria ser no mesmo lugar, você planeja e conforme paga isso gera o lançamento ou não (como já é), mas posso sempre importar meu extrato bancário pra atualizar tudo".

## Desenho da tela

```
‹  outubro de 2026  ›   [Hoje]              [Importar extrato] [+ Lançamento]
┌ Resumo ─────────────────────────────────────────────────────────────┐
│ Entrou  R$ …      Saiu  R$ …      Líquido  R$ …      (conta corrente) │
│ Planejado R$ …    Pago R$ …       Falta pagar R$ …   (contas do mês)  │
│ Nubank Conta R$ …  ·  Nubank Crédito R$ … de R$ …  ·  Caixinha R$ …   │
└───────────────────────────────────────────────────────────────────────┘
Plano do mês                     [Todos|Pendentes|Pagos]      [+ Conta]
  Da conta (n) · No cartão (n) · Únicos (n) · Itens do template (n)
Lançamentos (n)                  [tipo] [conta]
  linhas: descrição · data · conta · categoria · valor · editar · excluir
```

## O que muda de comportamento

- **Um período só.** Navegação por mês (‹ ›). Saem o seletor global, os presets (30/90 dias, personalizado) e os ciclos.
- **Sai "Ritmo de gasto"** (média diária/semanal) e os cartões Transferido/Investido: dependiam de ciclo e de saldo de origem que não têm mais tela de configuração. Sai junto a trava "Reserva insuficiente".
- **Volta o saldo por conta**, que só existia no Dashboard: é o número que confere com o banco depois de importar o extrato.
- **Importar extrato concilia com o plano.** Linha de despesa com o mesmo valor de uma conta pendente do mesmo mês já vem sugerida como pagamento dela; ao importar, o lançamento nasce vinculado e a conta fica paga. A sugestão é editável linha a linha.
- **Resumo do plano conta só o que é conta a pagar** e usa o valor do mês (não o do template).
- Nomes das seções: "Renda" → "Da conta", "Crédito" → "No cartão".

## Global Constraints

- Sem dependência nova. Banco intocado.
- Fluxo de pagamento em lote (selecionar → Confirmar → "já está no extrato" ou "lançar agora") não muda.
- Arquivo novo ≤ ~200 linhas; um componente, uma responsabilidade.

## Review Focus

1. Duas linhas do extrato com o mesmo valor e uma só conta pendente: só a primeira é sugerida; cada conta casa no máximo uma vez. Teste na Task 2.
2. Linha marcada como duplicata não recebe sugestão de conta. Teste na Task 2.
3. Valores com centavos (`1890` vs `1890.00`, `0.1 + 0.2`): comparação em centavos. Teste na Task 2.
4. Mês sem nada: tela mostra estados vazios, não quebra. Teste de render na Task 4.
5. Cartão de crédito no resumo: não entra em Entrou/Saiu; aparece como "usado de limite". Teste na Task 1.

---

### Task 1: Cálculos do resumo

**Files:** Modify `src/lib/budgetEngine.js`; Test `src/lib/budgetEngine.test.js`

- [ ] Teste que falha: `monthTotals({ items, transactions })` devolve `{ entrou, saiu, liquido, planejado, pago, falta }` — entrou/saiu só da conta corrente (crédito fora), planejado/pago pelas bills do mês; e `computeAccountSnapshot` para conta bancária (saldo inicial + entradas − saídas, com transferência) e cartão (usado).
- [ ] Implementar `monthTotals`; remover `computeBucketSnapshot`, `computeReservaSnapshot`, `BUCKET_LABELS` e imports mortos.

### Task 2: Conciliação do extrato com o plano

**Files:** Create `src/lib/reconcile.js`; Test `src/lib/reconcile.test.js`; Modify `src/lib/db.js`, `src/components/CSVImporterModal.jsx`

- [ ] Teste que falha: `matchBills(rows, bills)` devolve `rows` com `billId` sugerido (mesmo mês, mesmo valor em centavos, só despesa não duplicada, cada bill uma vez).
- [ ] Implementar `matchBills`.
- [ ] `db.js`: `getUnpaidBills(monthRefs)` e `markBillsPaid(ids)` (substitui o update inline do Planejamento).
- [ ] Importador: buscar contas pendentes dos meses do CSV, coluna "Plano" na revisão, gravar `bill_id`/`budget_item_id`/categoria do item e marcar as contas pagas ao final.

### Task 3: Componentes extraídos (mesmo comportamento)

**Files:** Create `src/components/planning/ItemModal.jsx`, `TemplatesSection.jsx`, `MonthSummary.jsx`, `src/components/TxModal.jsx`, `src/components/TransactionList.jsx`; Delete `src/components/planning/PlanningHeader.jsx`

- [ ] Mover `ItemModal` e `TemplatesSection` de `BudgetPage.jsx`; `TxModal` de `TransactionsPage.jsx` (sem a trava de reserva); lista + filtros para `TransactionList`.
- [ ] `MonthSummary`: três linhas do desenho, usando `monthTotals` e `computeAccountSnapshot`.

### Task 4: Página única e limpeza

**Files:** Create `src/pages/PlanningPage.jsx`, `src/pages/PlanningPage.test.jsx`; Modify `src/App.jsx`, `src/components/layout/Layout.jsx`, `src/hooks/useData.js`, `src/lib/db.js`; Delete `CombinedPlanningPage.jsx`, `BudgetPage.jsx`, `TransactionsPage.jsx`, `DateRangeSelector.jsx`, `DateRangeContext.jsx` (+teste), `lib/dateRange.js` (+teste)

- [ ] Teste que falha: `PlanningPage` renderiza com Supabase vazio e mostra "Plano do mês" e "Lançamentos".
- [ ] `PlanningPage`: mês em foco, hooks (`useBudget`, `useTransactions(inicio, fim)`, `useAccountTransactions`, `useGoals`), seleção e pagamento em lote (movidos de `BudgetPage`), modais.
- [ ] Hooks: `useTransactionsByCycle` vira `useTransactions(startDate, endDate)`; saem o `useTransactions` antigo, `useBills`, `useBudgetItems`, `useBudgetCycle`; entra `useAccountTransactions`.
- [ ] `db.js`: saem funções de ciclo e queries sem uso; volta `getAccountTransactions`.
- [ ] `App.jsx`/`Layout.jsx`: sem `DateRangeProvider`/`DateRangeSelector`.

### Task 5: Verificação e commit

- [ ] `npm run test:run`, `npm run build`, `npx eslint .` sem erro novo.
- [ ] Capturas (claro, escuro, largura de celular) no harness com Supabase falso.
- [ ] README: arquitetura e estrutura. Commit: `feat: planejamento e lançamentos numa página por mês`.
