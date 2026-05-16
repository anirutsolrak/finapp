# Onda 5 — Pagar fatura (simples) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar botão "Pagar fatura/dívida" nos cards Cartões e Empréstimos do Dashboard. Click abre PayBillsModal com lista de contas-alvo + valores pré-preenchidos. Submit cria 1 transfer por checkbox marcado.

**Architecture:** Zero migration, zero refactor no engine. Reusa `addTransaction` e os snapshots da Onda 4. Novo componente `PayBillsModal.jsx`. DashboardPage ganha estado `payModalGroup` + botão 💵 nos cards (com `stopPropagation` pra não conflitar com drawer drill-down da Onda 4).

**Tech Stack:** React 19, Vite, Supabase, date-fns, Tailwind, lucide-react.

**Testing:** Manual smoke test no browser — projeto não tem suite automatizada.

**Pré-requisito:** Onda 4 aplicada (cards multi-conta + drawer drill-down funcionando).

---

## File Structure

| Arquivo | Responsabilidade | Status |
|---|---|---|
| `src/components/PayBillsModal.jsx` | Modal de pagamento — select banco origem, lista contas-alvo, batch de transfers | **NOVO** |
| `src/pages/DashboardPage.jsx` | Botão 💵 nos cards Cartões/Empréstimos + estado payModalGroup + render do modal | Modificado |
| `INVENTARIO.md` | Linha de histórico Onda 5 + atualizar cards Dashboard | Modificado |

---

## Task 1: Componente PayBillsModal

**Files:**
- Create: `src/components/PayBillsModal.jsx`

- [ ] **Step 1: Criar o componente**

Conteúdo de `src/components/PayBillsModal.jsx`:

```jsx
import { useState, useMemo } from 'react'
import { format } from 'date-fns'
import { X, CreditCard, Repeat } from 'lucide-react'
import { addTransaction } from '../lib/db'

const fmt = (v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return 'R$ 0,00'
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const GROUP_META = {
  cards: { label: 'Pagar cartões',      Icon: CreditCard, color: '#a855f7' },
  loans: { label: 'Pagar empréstimos',  Icon: Repeat,     color: '#ef4444' },
}

// Modal pra pagar fatura/dívida de um grupo (cards ou loans).
// Cria 1 transfer (bank → conta-alvo) por linha marcada.
//
// Props:
//   group: 'cards' | 'loans' | null  — grupo alvo (null = fechado)
//   snapshot: AccountsGroupSnapshot retornado por computeAccountsGroupSnapshot
//   accounts: Account[] — todas as contas (pra listar bancos disponíveis)
//   userId: string
//   onClose: () => void
//   onSaved: () => void
export default function PayBillsModal({ group, snapshot, accounts, userId, onClose, onSaved }) {
  const banks = useMemo(
    () => (accounts || []).filter(a => a.is_active !== false && a.type === 'bank'),
    [accounts]
  )

  const [fromAccountId, setFromAccountId] = useState(banks[0]?.id || '')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [targets, setTargets] = useState(() => {
    const initial = {}
    for (const s of (snapshot?.contas || [])) {
      initial[s.account.id] = {
        selected: s.usado > 0,
        amount: s.usado || 0,
      }
    }
    return initial
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!group) return null
  const meta = GROUP_META[group]
  const Icon = meta.Icon

  const totalToPay = Object.values(targets)
    .filter(t => t.selected)
    .reduce((a, t) => a + (Number(t.amount) || 0), 0)

  const updateTarget = (accountId, patch) => {
    setTargets(prev => ({ ...prev, [accountId]: { ...prev[accountId], ...patch } }))
  }

  async function save() {
    setError('')
    if (banks.length === 0) return setError('Cadastre uma conta bancária primeiro.')
    if (!fromAccountId) return setError('Escolha a conta de origem.')
    const selected = Object.entries(targets).filter(([_, v]) => v.selected && Number(v.amount) > 0)
    if (selected.length === 0) return setError('Selecione ao menos uma conta com valor > 0.')

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
      const { error: err } = await addTransaction(tx)
      if (err) {
        setSaving(false)
        return setError(err.message || 'Falha ao salvar pagamento.')
      }
    }
    setSaving(false)
    onSaved?.()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-lg text-white flex items-center gap-2">
            <Icon size={18} style={{ color: meta.color }}/>
            {meta.label}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-800"
            aria-label="Fechar"
          >
            <X size={18}/>
          </button>
        </div>

        {banks.length === 0 && (
          <p className="text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            Cadastre uma conta bancária primeiro pra usar como origem do pagamento.
          </p>
        )}

        {banks.length > 0 && (
          <>
            <div>
              <label className="label">Pagar com</label>
              <select className="input" value={fromAccountId} onChange={e => setFromAccountId(e.target.value)}>
                {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>

            <div>
              <label className="label">Data do pagamento</label>
              <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
            </div>

            <div>
              <label className="label">Contas a pagar</label>
              {(snapshot?.contas || []).length === 0 ? (
                <p className="text-xs text-gray-500">Nenhuma conta neste grupo.</p>
              ) : (
                <div className="space-y-2">
                  {snapshot.contas.map(s => {
                    const target = targets[s.account.id] || { selected: false, amount: 0 }
                    return (
                      <div key={s.account.id} className="flex items-center gap-2 bg-gray-800/60 rounded-lg p-2">
                        <input
                          type="checkbox"
                          checked={target.selected}
                          onChange={e => updateTarget(s.account.id, { selected: e.target.checked })}
                          className="accent-emerald-500 w-4 h-4 flex-shrink-0"
                        />
                        <span className="text-sm text-white flex-1 truncate">{s.account.name}</span>
                        <input
                          type="number"
                          step="0.01"
                          className="input w-28 text-right"
                          value={target.amount}
                          onChange={e => updateTarget(s.account.id, { amount: e.target.value })}
                          placeholder="0,00"
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-between text-sm border-t border-gray-800 pt-3">
              <span className="text-gray-400">Total a pagar</span>
              <span className="font-bold text-white">{fmt(totalToPay)}</span>
            </div>
          </>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button
            onClick={save}
            disabled={saving || banks.length === 0 || totalToPay <= 0}
            className="btn-primary flex-1"
          >
            {saving ? 'Pagando...' : 'Confirmar pagamento'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/PayBillsModal.jsx
git commit -m "feat(dashboard): PayBillsModal pra pagar cartões/empréstimos em batch (Onda 5)"
```

---

## Task 2: DashboardPage — botão 💵 + estado payModalGroup

**Files:**
- Modify: `src/pages/DashboardPage.jsx`

- [ ] **Step 1: Atualizar imports — adicionar DollarSign + PayBillsModal**

Localizar o import do lucide-react no início do arquivo (já tem `Mail, Repeat` da Onda 4). Substituir essa linha por:

```jsx
import { TrendingUp, AlertCircle, Target, ArrowRight, Sparkles, Settings, Clock, Wallet, CreditCard, Activity, PiggyBank, Lock, Receipt, X, Repeat, Mail, DollarSign } from 'lucide-react'
```

E logo após o import do `AccountGroupDrawer`, adicionar:

```jsx
import PayBillsModal from '../components/PayBillsModal'
```

- [ ] **Step 2: Adicionar estado payModalGroup e useAuth pra user.id**

Localizar onde está `const [accountDrawerGroup, setAccountDrawerGroup] = useState(null)`. **Logo após** essa linha, adicionar:

```jsx
  const [payModalGroup, setPayModalGroup] = useState(null)
```

E verificar se o componente já desestrutura `user` do `useAuth` — se só desestrutura `profile`, ajustar pra incluir `user`:

```jsx
  const { profile, user } = useAuth()
```

(o `user` é necessário pra passar `user.id` no PayBillsModal).

- [ ] **Step 3: Adicionar botão 💵 nos cards Cartões e Empréstimos**

No card "💳 Cartões" (dentro do bloco `accountSnapshots.cards.contas.length > 0 &&`), localizar o `<div className="flex items-center justify-between mb-1">` e substituir por:

```jsx
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500 font-medium">💳 Cartões</span>
                <div className="flex items-center gap-1">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={e => { e.stopPropagation(); setPayModalGroup('cards') }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setPayModalGroup('cards') } }}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-emerald-400 hover:bg-gray-800 cursor-pointer"
                    aria-label="Pagar cartões"
                    title="Pagar cartões"
                  >
                    <DollarSign size={13}/>
                  </span>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: COLORS.credit + '20' }}>
                    <CreditCard size={14} style={{ color: COLORS.credit }} />
                  </div>
                </div>
              </div>
```

E no card "🔁 Empréstimos" (dentro do bloco `accountSnapshots.loans.contas.length > 0 &&`), fazer a mesma substituição mas pra loans:

```jsx
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500 font-medium">🔁 Empréstimos</span>
                <div className="flex items-center gap-1">
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={e => { e.stopPropagation(); setPayModalGroup('loans') }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setPayModalGroup('loans') } }}
                    className="w-6 h-6 rounded-md flex items-center justify-center text-gray-400 hover:text-emerald-400 hover:bg-gray-800 cursor-pointer"
                    aria-label="Pagar empréstimos"
                    title="Pagar empréstimos"
                  >
                    <DollarSign size={13}/>
                  </span>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: COLORS.installment + '20' }}>
                    <Repeat size={14} style={{ color: COLORS.installment }} />
                  </div>
                </div>
              </div>
```

**Importante:** uso `<span role="button">` ao invés de `<button>` aninhado porque HTML não permite `<button>` dentro de `<button>` (o card todo é um `<button>`). O `role="button"` + `tabIndex={0}` + handler de Enter/Space mantém acessibilidade.

- [ ] **Step 4: Renderizar o PayBillsModal**

Localizar onde renderiza o `AccountGroupDrawer` (perto do fim do return). Logo **após** essa renderização (antes do `</div>` raiz), adicionar:

```jsx
      <PayBillsModal
        group={payModalGroup}
        snapshot={payModalGroup ? accountSnapshots[payModalGroup] : null}
        accounts={accounts}
        userId={user?.id}
        onClose={() => setPayModalGroup(null)}
        onSaved={() => {/* realtime cuida do refresh */}}
      />
```

- [ ] **Step 5: Build smoke check**

```bash
npx vite build 2>&1 | tail -10
```

Esperado: `✓ built in X.XXs` sem erros.

- [ ] **Step 6: Verificação manual no browser**

Rodar `npm run dev`. Validar:

1. Dashboard carrega normal.
2. No card Cartões, ícone 💵 aparece no canto superior (entre o título e o ícone de CreditCard).
3. Click no 💵 abre PayBillsModal — NÃO abre o drawer drill-down.
4. Click no resto do card abre drawer (comportamento Onda 4).
5. Modal mostra: select banco origem, datepicker, lista cards com checkbox + valor.
6. Editar valor, marcar/desmarcar checkboxes funciona.
7. Confirmar pagamento → modal fecha + transactions de transfer aparecem em /transactions.
8. Dashboard atualiza realtime (dívida do cartão cai, saldo bank cai).
9. Repetir pro card Empréstimos.

- [ ] **Step 7: Commit**

```bash
git add src/pages/DashboardPage.jsx
git commit -m "feat(dashboard): botão 💵 nos cards Cartões/Empréstimos abre PayBillsModal (Onda 5)"
```

---

## Task 3: Atualizar INVENTARIO.md

**Files:**
- Modify: `INVENTARIO.md`

- [ ] **Step 1: Adicionar linha no histórico de execução**

Localizar a tabela "Histórico de execução" no fim do INVENTARIO. Adicionar linha após a linha da Onda 4:

```markdown
| 2026-05-16 | 5 — Pagar fatura | Novo `PayBillsModal` (src/components/PayBillsModal.jsx). Cards Cartões/Empréstimos do Dashboard ganham botão 💵 que abre modal com select banco origem + lista contas-alvo (checkbox + valor pré-preenchido com dívida atual) + datepicker. Confirm cria 1 `transfer` por linha marcada (from=banco, to=cartão/loan). Zero migration, reusa snapshots da Onda 4. |
```

- [ ] **Step 2: Adicionar feature na tabela do Dashboard**

Localizar a tabela `# 1. Início (`/` — DashboardPage)`. Adicionar linha após "Card % comprometido cartões":

```markdown
| Botão 💵 "Pagar" (Cartões/Empréstimos) | DashboardPage (Onda 5) | Ícone $ no canto sup. direito dos cards Cartões e Empréstimos abre PayBillsModal | Click no 💵 (não no resto do card) | ✅ | Onda 5 — `stopPropagation` separa do click no drawer |
| PayBillsModal | components/PayBillsModal.jsx | Modal pra pagar fatura: select banco origem + lista contas-alvo (checkbox + valor) + datepicker → cria 1 transfer por linha marcada | Click no 💵 do card Cartões/Empréstimos | ✅ | Onda 5 — batch de transfers |
```

- [ ] **Step 3: Commit**

```bash
git add INVENTARIO.md
git commit -m "docs: atualiza INVENTARIO.md pos-Onda5"
```

---

## Final Sanity Check

- [ ] **Step 1: Smoke test end-to-end**

`npm run dev` e validar:

1. Dashboard carrega sem erro de console
2. Botão 💵 visível nos cards Cartões e Empréstimos
3. Click no 💵 abre modal correto, sem disparar drawer
4. Click no resto do card ainda abre drawer (Onda 4 intacta)
5. Modal: select banco, datepicker, lista cards/loans funcionais
6. Confirmar pagamento cria tx em /transactions e atualiza Dashboard via realtime
7. Validação: sem banco → aviso; total 0 → botão disabled; erro RLS → mensagem

- [ ] **Step 2: Verificar git log**

```bash
git log --oneline auditoria-features ^main | head -10
```

Esperado: ~3 commits da Onda 5 (modal, dashboard, inventário) somados aos 7+1 da Onda 4 + 2 spec/plan.

---

## Out of scope (registrado)

- ❌ closing_day / due_day em accounts → não implementar (escolha "fatura simples")
- ❌ Fatura corrente vs próxima → não implementar
- ❌ Histórico de faturas pagas → consultável em /transactions filtrando type=transfer
- ❌ Notificação de vencimento → alerta de bills cobre
- ❌ Rollback batch se 1 transfer falhar → out of scope (raríssimo, user corrige na mão)
- ❌ CSV importer NuBank → Onda 6
