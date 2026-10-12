// ─── goals — regras PURAS das metas (progresso e lançamentos de guardar/pagar) ─

// Guardado = valor inicial + transferências vinculadas − despesas vinculadas (nunca negativo).
export function goalProgress(goal, transactions = []) {
  const moved = transactions
    .filter(t => t.goal_id === goal.id)
    .reduce((a, t) => a + (t.type === 'transfer' ? 1 : t.type === 'expense' ? -1 : 0) * Number(t.amount || 0), 0)
  const saved = Math.max((Number(goal.current_amount) || 0) + moved, 0)
  const target = Number(goal.target_amount) || 0
  return {
    saved,
    target,
    missing: Math.max(target - saved, 0),
    pct: target > 0 ? Math.min((saved / target) * 100, 100) : 0,
  }
}

// Monta o lançamento de uma ação rápida da meta. Devolve { payload } ou { error }.
// - save: transferência vinculada à meta. Sem contas é só a reserva (não altera saldo);
//   com `form.move`, sai de uma conta e entra em outra.
// - pay: despesa vinculada à meta, na conta escolhida.
export function goalTx({ mode, goal, form, userId, accounts = [] }) {
  const amount = parseFloat(form.amount)
  if (!(amount > 0)) return { error: 'Informe um valor maior que zero.' }
  if (!form.date) return { error: 'Informe a data.' }
  const base = { user_id: userId, amount, date: form.date, goal_id: goal.id, is_paid: true }

  if (mode === 'pay') {
    const account = accounts.find(a => a.id === form.account_id)
    if (!account) return { error: 'Selecione a conta de onde sai o pagamento.' }
    return { payload: {
      ...base, type: 'expense', description: goal.name,
      account_id: account.id, payment_source: account.default_payment_source || 'fixed_income',
    } }
  }

  if (form.move) {
    if (!form.from_account_id || !form.to_account_id) return { error: 'Selecione a conta de origem e a de destino.' }
    if (form.from_account_id === form.to_account_id) return { error: 'Origem e destino devem ser diferentes.' }
  }
  return { payload: {
    ...base, type: 'transfer', description: `Guardado: ${goal.name}`, payment_source: 'fixed_income',
    from_account_id: form.move ? form.from_account_id : null,
    to_account_id: form.move ? form.to_account_id : null,
  } }
}
