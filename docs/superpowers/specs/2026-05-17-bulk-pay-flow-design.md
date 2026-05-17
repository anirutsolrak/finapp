# Bulk-Pay Flow — Design Spec

**Data:** 2026-05-17
**Autor:** Carlos + Claude
**Status:** Aprovado para implementação

## Contexto e motivação

A Onda 8 (Planejamento Unificado) implementou o fluxo single-item: clicar `○` numa bill abre `PayBillModal` que pergunta conta/valor/data e cria 1 tx via RPC `pay_bill`.

Esse fluxo quebra quando o usuário **importa o extrato do banco via CSV**. As txs do extrato (Aluguel, Luz, Internet, etc.) já estão no DB. Se ele agora marca essas bills como pagas pelo fluxo atual, o app cria **txs duplicadas** — uma do extrato e outra da bill.

**Objetivo:** Adicionar um modo "já lançado no extrato" que só flipa `is_paid` sem criar tx. E aproveitar pra implementar bulk-pay (várias bills de uma vez), que casa naturalmente com o cenário "importei o extrato inteiro do mês".

## Escopo

**Inclui:**
- Seleção múltipla de bills via checkboxes em `PlanItemRow`
- Popup-na-base com contagem + Confirmar quando há seleção ativa
- Dialog de confirmação com 2 caminhos: "já lançado" (só flipa) vs "lançar agora" (cria N txs)
- Validação client-side: bloqueia "lançar agora" se algum item carece de `default_account_id`
- Mobile: esconde bottom nav enquanto seleção ativa, popup ocupa o lugar
- Deleta `PayBillModal` (sem uso após a refatoração)

**Fora de escopo:**
- Bulk-unpay (raro, perigoso; mantém fluxo single existente)
- Auto-match de txs do extrato com bills (vínculo `bill_id`) — txs do extrato ficam órfãs por design no caminho "já lançado"
- Per-item value override no bulk-pay (usa `bill.amount` planejado; ajustar fica no lápis da tx depois)
- Novos RPCs no Postgres — implementação client-side via Promise.all (decisão de viabilidade, aprovada)

## Decisões de design (brainstorming 2026-05-17)

1. **Single-item entra no mesmo fluxo bulk** — consistência > atalho
2. **Manual flow usa defaults** — `bill.amount`, `today`, `default_account_id`. Bloqueia batch inteiro se algum item faltar conta default
3. **"Já lançado" não vincula tx** — tx do extrato fica intocada, sem `bill_id`. Unpay só re-flipa is_paid e não mexe na tx do extrato
4. **Click em `✓` (paga) preserva flow single de unpay** — não entra no bulk; bulk é só pra pagar
5. **Mobile: bottom nav some** enquanto seleção ativa; popup ocupa o lugar visual

## Arquitetura

### State local em `BudgetPage`
```jsx
const [selected, setSelected] = useState(new Set())  // Set<bill.id>
const [confirming, setConfirming] = useState(false)  // dialog aberto
const [submitting, setSubmitting] = useState(false)  // loading durante batch
```

### Componentes

**`src/components/planning/SelectionPopup.jsx` (NOVO)**
Props: `count`, `total` (R$ somatório), `onClear`, `onConfirm`.
Renderiza fixed bottom popup. Desktop: centralizado, margem do rodapé. Mobile: full-width, encostado no rodapé (substitui nav).

**`src/components/planning/ConfirmPayDialog.jsx` (NOVO)**
Props: `items` (array de items selecionados), `onAlreadyImported`, `onPayNow`, `onCancel`.
Modal centralizado com 2 CTAs ("Sim, já lançado" / "Não, lançar agora") + Cancelar.

**`src/components/planning/PlanItemRow.jsx` (MODIFICADO)**
`onTogglePaid(item)` ganha lógica:
- bill paga → confirm + unpayBill (mantém atual)
- bill não paga → `onSelect(bill.id)` (toggle no Set)
Visual: quando `bill.id ∈ selected`, mostra `☑` em vez de `○`.

**`src/pages/BudgetPage.jsx` (MODIFICADO)**
Adiciona state acima, handlers `confirmPaid(bills)` e `payNow(bills)`, renderiza `<SelectionPopup>` e `<ConfirmPayDialog>` no fim. Remove import e uso de `PayBillModal`.

**`src/components/PayBillModal.jsx` (DELETAR)**
Sem uso após esta mudança.

**`src/contexts/SelectionContext.jsx` (NOVO)**
Context global leve: `{ active: bool, setActive: fn }`. Provider envolve `<App>`. `BudgetPage` sincroniza `selected.size > 0` via useEffect. Unmount força `setActive(false)`.

**`src/components/layout/Layout.jsx` (MODIFICADO)**
`useSelection()`. Quando `active`, esconde bottom nav (`className="hidden"`) e remove padding-bottom reservado pro nav. Desktop não muda.

### Data flow

**Caminho "Já lançado":**
```js
await supabase.from('bills')
  .update({ is_paid: true, paid_at: new Date().toISOString() })
  .in('id', [...selected])
// 1 round-trip. Sem RPC, sem criar tx.
```

**Caminho "Lançar agora":**
```js
// Validação client antes
const missing = items.filter(i => !i.default_account_id).map(i => i.name)
if (missing.length > 0) {
  toast.error(`Items sem conta default: ${missing.join(', ')}. Edite-os primeiro.`)
  return
}
// Bulk via Promise.all
const results = await Promise.all(items.map(item => payBill({
  billId: item.bill.id, accountId: item.default_account_id,
  amount: item.bill.amount, date: format(new Date(), 'yyyy-MM-dd'),
  paymentSource: item.payment_source, categoryId: item.category_id, budgetItemId: item.id,
})))
const failed = results.filter(r => r.error)
if (failed.length > 0) {
  toast.error(`${failed.length}/${items.length} falharam. Tente de novo.`)
  // mantém ids falhos em `selected`
} else {
  setSelected(new Set())
  refetch()
}
```

## Error handling

| Cenário | Tratamento |
|---|---|
| Item sem `default_account_id` no caminho "Lançar agora" | Bloqueia batch; toast lista nomes; user edita e re-tenta |
| `payBill` falha parcial (3/5 ok) | Toast com count; mantém só os falhos em `selected`; user re-confirma |
| Update bulk em `bills` falha (RLS/network) | Toast genérico; `selected` preservado |
| User navega embora com `selected.size > 0` | `BudgetPage` unmount → `setActive(false)` (nav volta); `selected` zera (state local). Aceitável |
| Click `✓` (paga) com seleção ativa | Fluxo single de unpay roda em paralelo; não toca em `selected` |
| Bill ainda não materializada | Checkbox `disabled` (já é hoje) |

## Testes

Sem testes automatizados novos. Smoke manual:

1. Marca 3 items pendentes → popup aparece com `3 selecionados · R$ X`
2. Confirmar → modal → "Sim, já lançado" → bills viram pagas no `/budget`, `/transactions` inalterado
3. Marca 2 items (1 sem `default_account_id`) → "Não, lançar agora" → toast bloqueia
4. Configura conta no item faltante → re-confirma → 2 txs aparecem em `/transactions`
5. Mobile: marca 1 item → bottom nav some, popup encosta no rodapé; limpa → nav volta

## Rollout

Ondas curtas, independentes:

1. **Onda A** — `SelectionContext` + provider em `App.jsx`; adapta `Layout.jsx` pra esconder nav
2. **Onda B** — Componentes novos: `SelectionPopup`, `ConfirmPayDialog`
3. **Onda C** — Adapta `PlanItemRow` (visual `☑` + handler split paga/não-paga)
4. **Onda D** — Refator `BudgetPage`: state, handlers, wire-up; remove `PayBillModal`
5. **Onda E** — Smoke test manual

**Risco:** baixo. Sem migration, sem RPC novo, sem mudança de schema. Reversão é git revert.
