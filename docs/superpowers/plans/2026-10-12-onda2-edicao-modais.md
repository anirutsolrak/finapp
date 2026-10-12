# Onda 2 — Edição e modais Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Execução nativa, em modo ponytail. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda edição aplica, aparece na tela na hora e nenhum modal fecha por clique fora.

**Architecture:** Cada defeito é corrigido na causa, uma vez, no ponto compartilhado: o join item↔bill em `useBudget`, a normalização de lançamento em `db.js`, e os hooks de dados. Nada de componente novo.

**Tech Stack:** React 19, Supabase JS, Vitest.

**Spec:** diagnóstico feito por leitura do código e dos triggers (`docs/supabase/02_functions.sql`, `03_triggers.sql`). Não reproduzido contra o banco real (sem credenciais de login nesta sessão).

## Global Constraints

- Sem dependência nova, sem componente novo.
- Nenhum SQL é executado no banco. O único ajuste de banco vira arquivo para rodar no Dashboard.

## Causas encontradas

| # | Sintoma | Causa |
|---|---------|-------|
| 1 | Clique fora fecha o modal e perde o que foi digitado | Os 6 modais têm `onClick={onClose}` no fundo |
| 2 | Renomear item ou mudar o vencimento "só neste mês" não aparece | O modal grava na `bill` do mês, mas a linha e o próprio modal leem nome e dia do template |
| 3 | Totais "Planejado" não mudam ao editar o valor do mês | `PlanningHeader` e `BucketSection` somam `planned_amount` do template, não o valor da bill |
| 4 | Seções recolhem/reabrem sozinhas e a lista pisca a cada mudança | Todo refetch faz `setLoading(true)`, que troca a lista pelo esqueleto e desmonta as seções |
| 5 | Lançamentos mostra a tela vazia | Lista e resumo só renderizam se o período selecionado for exatamente um ciclo; não há mais tela para criar ciclo |
| 6 | Editar lançamento pago pelo Planejamento desfaz o vínculo com o item | `TxModal` força `budget_item_id: null` em todo save |
| 7 | Mudar a data de um lançamento deixa `month_ref` antigo | `withMonthRef` só preenche quando está vazio |
| 8 | Trocar tipo para/de Transferência deixa contas dos dois modos gravadas | Payload não limpa os campos do outro modo |
| 9 | Editar valor de conta já paga desalinha do lançamento | O modal só avisa, mas grava |
| 10 | Falhas silenciosas (desmarcar pago, excluir lançamento, salvar perfil, desativar conta) | O erro do Supabase é ignorado |
| 11 | Item novo em mês futuro cria também uma conta no mês do ciclo atual; conta excluída "só do mês" volta ao editar o template | Trigger `materialize_on_item_change` (existia por causa da IA, que saiu) |

## Review Focus

1. Item sem bill no mês: continua mostrando nome, valor e dia do template. Teste na Task 1.
2. Lançamento do tipo transferência nunca grava `account_id`; os outros nunca gravam origem/destino. Teste na Task 2.
3. Trocar o mês/período mostra por um instante os dados anteriores (consequência de não piscar o esqueleto). Aceito.
4. Fechar modal: só por Cancelar/Salvar/X. Verificação manual.
5. Período que não é ciclo: lista e consolidado aparecem; "Ritmo de gasto" só com ciclo. Verificação manual.

---

### Task 1: Planejamento lê o que grava (causas 2, 3, 9)

**Files:** Modify `src/hooks/useData.js`, `src/pages/BudgetPage.jsx`; Test `src/hooks/useData.test.js`

- [ ] Teste que falha: `overlayBill(item, bill)` devolve o item com `name`, `planned_amount` e `due_day` da bill do mês; sem bill, devolve os do template.
- [ ] Exportar `overlayBill` em `useData.js` e usar no join de `useBudget`.
- [ ] `ItemModal.save`: se a bill está paga e o valor mudou, erro "Desmarque o pagamento antes de mudar o valor".
- [ ] `TemplatesSection` não muda (itens sem bill mantêm o valor do template).

### Task 2: Lançamento normalizado no data layer (causas 6, 7, 8)

**Files:** Modify `src/lib/db.js`, `src/pages/TransactionsPage.jsx`; Test `src/lib/db.test.js`

- [ ] Teste que falha: `updateTransaction` recalcula `month_ref` pela data; transferência zera `account_id`; despesa zera `from/to_account_id`.
- [ ] Trocar `withMonthRef` por `normalizeTx` (sempre deriva `month_ref`, limpa contas do outro modo), usado por `addTransaction` e `updateTransaction`.
- [ ] `TxModal`: remover `budget_item_id: null` do payload.

### Task 3: Telas (causas 1, 4, 5, 10)

**Files:** Modify `src/pages/BudgetPage.jsx`, `TransactionsPage.jsx`, `GoalsPage.jsx`, `SettingsPage.jsx`, `src/components/CSVImporterModal.jsx`, `src/components/planning/ConfirmPayDialog.jsx`, `src/hooks/useData.js`

- [ ] Remover `onClick` de fechar no fundo e o `stopPropagation` do painel nos 6 modais.
- [ ] Hooks: `setLoading(true)` só no estado inicial, não a cada refetch.
- [ ] `TransactionsPage`: lista, filtros e consolidado fora do `currentCycle &&`; aviso de "Nenhum ciclo" sai.
- [ ] Mostrar o erro em `handleUnpay`, `handleDelete`, `saveProfile`, `handleDeactivate`.

### Task 4: Trigger legado (causa 11), verificação e commit

**Files:** Create `docs/supabase/migrations/2026-10-12-drop-item-materialize.sql`; Modify `docs/supabase/03_triggers.sql`

- [ ] SQL: `drop trigger if exists materialize_on_item_change on public.budget_items;` (não executar; fica para o Dashboard).
- [ ] `npm run test:run`, `npm run build`, `npx eslint .` sem erro novo (linha de base: 25).
- [ ] Commit: `fix: edições aplicam e aparecem; modais não fecham por clique fora`.
