# Onda 5 — Pagar fatura (simples) — Design Spec

**Data:** 2026-05-15
**Branch:** `auditoria-features`
**Pré-requisito:** Onda 4 (Dashboard multi-conta) aplicada.

---

## Goal

Adicionar um fluxo rápido pro user marcar fatura de cartão/empréstimo como paga. "Fatura" aqui é simplificada: dívida atual acumulada já calculada pela Onda 4 (`accountSnapshots.cards.contas[i].usado`). Sem ciclo de fechamento, sem due date, sem closing date. YAGNI extremo — só um botão que cria as `transfer` certas.

---

## Architecture

### Modelo de dados

**Nenhuma migration.** Reusa colunas `from_account_id` / `to_account_id` em `transactions` (criadas na Onda 3).

### Fluxo do usuário

1. No Dashboard, card agregado "💳 Cartões" (e "🔁 Empréstimos") ganha um botão secundário 💵 no canto superior.
2. Click no botão 💵 → abre `PayBillsModal` pra esse grupo.
3. No modal:
   - User escolhe a conta de origem (select de bancos ativos).
   - Lista de contas-alvo (cartões ou empréstimos ativos) com checkbox + input de valor (pré-preenchido com `usado`).
   - User confere/edita valores e marca quais quer pagar.
   - User confirma a data (default hoje).
   - Click "Confirmar pagamento" → cria 1 `transaction` tipo `transfer` por checkbox marcado.
4. Modal fecha. Realtime atualiza o Dashboard automaticamente (dívida cai, saldo do banco cai).

### Botão 💵 vs drawer drill-down (Onda 4)

O card agregado já é um `<button>` que abre o drawer (Onda 4). O botão 💵 fica embutido no canto superior direito do card, usando `onClick` com `e.stopPropagation()` pra não propagar pro card. Visualmente: ícone pequeno discreto, não compete com o conteúdo principal.

```
┌──────────────────────────────┐
│ 💳 Cartões              💵   │ ← stopPropagation, abre PayBillsModal
│ R$ 1.500,00                  │ ← resto: click abre drawer (Onda 4)
│ de R$ 5.000 (30%)            │
└──────────────────────────────┘
```

### PayBillsModal — anatomia

**Props:**
- `group: 'cards' | 'loans' | null` — grupo alvo (null = fechado)
- `snapshot: AccountsGroupSnapshot` — snapshot do grupo (Onda 4)
- `accounts: Account[]` — todas as contas (pra pegar bancos)
- `userId: string` — pra preencher user_id da transaction
- `onClose: () => void`
- `onSaved: () => void` — callback após criar transfers (refetch dashboard)

**Estado interno:**
- `fromAccountId` (string) — conta de origem selecionada (default: 1º banco ativo)
- `date` (string) — data do pagamento (default: hoje)
- `targets` (`{ [account_id]: { selected: boolean, amount: number } }`) — selecionados + valores

**Render:**
1. Header: ícone do grupo + título "Pagar cartões" ou "Pagar empréstimos"
2. Select "Pagar com": lista de bancos (`type=bank`, ativos)
3. Datepicker "Data do pagamento" (default hoje)
4. Lista de contas-alvo (cards ou loans ativos no grupo):
   - Linha por conta: `[checkbox] [nome] [input valor]`
   - Checkbox default ON se `usado > 0`
   - Input pré-preenchido com `usado`, editável (pra Biplay, user adiciona juros)
5. Resumo: "Total a pagar: R$ X" (soma dos valores selecionados)
6. Botões: Cancelar / Confirmar pagamento

**Lógica do submit (`save`):**
```js
async function save() {
  const selected = Object.entries(targets).filter(([_, v]) => v.selected && Number(v.amount) > 0)
  if (selected.length === 0) return setError('Selecione ao menos uma conta com valor > 0.')
  if (!fromAccountId) return setError('Escolha a conta de origem.')

  setSaving(true)
  for (const [toAccountId, { amount }] of selected) {
    const targetAccount = snapshot.contas.find(s => s.account.id === toAccountId)?.account
    const tx = {
      user_id: userId,
      type: 'transfer',
      amount: Number(amount),
      date,
      from_account_id: fromAccountId,
      to_account_id: toAccountId,
      payment_source: 'fixed_income',
      description: `Pagamento — ${targetAccount?.name || 'conta'}`,
      is_paid: true,
    }
    await addTransaction(tx)
  }
  setSaving(false)
  onSaved()
  onClose()
}
```

### Aplicação pro Biplay (empréstimos)

Mesmo modal. Biplay tem `usado > 0` (dívida acumulada do ciclo). User edita o valor pra somar juros antes de confirmar. Sem feature especial.

---

## Components affected

| Arquivo | Mudança |
|---|---|
| `src/components/PayBillsModal.jsx` | **Novo** — modal de pagamento de fatura/dívida |
| `src/pages/DashboardPage.jsx` | Botão 💵 nos cards "Cartões" e "Empréstimos" + estado `payModalGroup` + renderiza `PayBillsModal` |
| `INVENTARIO.md` | Atualiza histórico + cards do Dashboard |

Nenhuma mudança em `budgetEngine.js`, `db.js`, `useData.js`. O fluxo reusa `addTransaction` e os snapshots da Onda 4.

---

## Data flow

```
DashboardPage
  └─ accountSnapshots (Onda 4)
  └─ accounts (useAccounts)

  Card "💳 Cartões" tem:
    - <button> principal → setAccountDrawerGroup('cards')  (drawer Onda 4)
    - <button> 💵 (stopPropagation) → setPayModalGroup('cards')

  PayBillsModal
    └─ recebe snapshot + accounts
    └─ user confirma → addTransaction (1 por conta selecionada)
    └─ onSaved → refetch via realtime (canal 'transactions' já existe)
```

---

## Error handling

- **Nenhuma conta bank disponível**: modal mostra mensagem "Cadastre uma conta bancária primeiro pra usar como origem do pagamento" + botão fecha. Não permite confirmar.
- **Valor 0 ou negativo**: input mostra erro inline. Confirm desabilita se total = 0.
- **Falha ao criar transaction** (rede/RLS): mostra erro no modal, mantém form aberto. Transactions já criadas no batch ficam no banco (não faz rollback).
- **Conta-alvo sem dívida** (`usado === 0`): aparece na lista mas com checkbox default OFF. User pode marcar manualmente se quiser fazer pagamento antecipado.

---

## Testing strategy

Manual (single-user, sem suite):

1. **Setup:** Onda 4 aplicada. NuBank CC com `opening_balance = 1500`. NuBank Crédito com `credit_limit = 3000`. Lançar 1 expense de R$ 500 em NuBank Crédito.
2. **Open modal:** Dashboard → click no botão 💵 do card "Cartões". Modal abre.
3. **Select origem:** dropdown mostra "NuBank Conta Corrente" como única opção. Selecionado.
4. **Lista alvos:** NuBank Crédito aparece com checkbox marcado + valor 500. PicPay Crédito aparece com checkbox desmarcado + valor 0.
5. **Editar valor:** user altera NuBank Crédito pra 300 (paga parcial). Total a pagar: R$ 300.
6. **Confirmar:** click "Confirmar pagamento". Modal fecha. Dashboard atualiza:
   - Card Bancos: R$ 1.500 − R$ 300 = R$ 1.200
   - Card Cartões: R$ 500 − R$ 300 = R$ 200 (de R$ 5.000 total se PicPay = 2000)
7. **Verificar tx criada:** /transactions deve mostrar 1 transfer "Pagamento — NuBank Crédito" R$ 300, NuBank CC → NuBank Crédito.
8. **Não-propagação:** click em outro lugar do card Cartões ainda abre drawer (não modal). 💵 só dispara modal.
9. **Biplay:** click 💵 no card Empréstimos. Modal mostra Biplay com `usado` atual. User adiciona juros editando o valor. Confirma. Tx transfer criada.
10. **Sem bank cadastrado:** desativar a única bank ativa → click 💵 → modal mostra mensagem de erro.

---

## Out of scope

- ❌ closing_day / due_day (escolha "fatura simples")
- ❌ Cálculo de "fatura corrente" vs "próxima fatura"
- ❌ Histórico de faturas pagas (já consultável em /transactions filtrando type=transfer)
- ❌ Notificação de vencimento (alerta de bills cobre)
- ❌ Pagamento parcial sugerido (user edita manualmente)
- ❌ Reconciliação com extrato do cartão
- ❌ Rollback se 1 transfer falhar no batch

---

## Decisões tomadas no brainstorming

1. **Escopo:** Fatura simples — só botão "Pagar dívida atual" ✅
2. **Localização do botão:** Card agregado (Cartões/Empréstimos), não drawer/settings ✅
3. **Biplay:** Mesmo modal, mesmo padrão (user edita valor pra somar juros) ✅
4. **Closing/due dates:** Não implementar (YAGNI) ✅
