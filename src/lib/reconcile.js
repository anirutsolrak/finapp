// ─── reconcile — casa linhas do extrato com as contas pendentes do plano ─────
const cents = (v) => Math.round(Number(v) * 100)

// Devolve as linhas com `billId` sugerido: despesa não duplicada, mesmo mês e mesmo valor
// de uma conta pendente. Cada conta é usada no máximo uma vez, na ordem do extrato.
// shortcut: só casa valor exato; pagar com juros/desconto exige escolher a conta na revisão.
export function matchBills(rows, bills) {
  const free = [...bills]
  return rows.map(r => {
    if (r.type !== 'expense' || r.isDuplicate) return { ...r, billId: null }
    const i = free.findIndex(b => b.month_ref === r.date.slice(0, 7) && cents(b.amount) === cents(r.amount))
    return { ...r, billId: i < 0 ? null : free.splice(i, 1)[0].id }
  })
}
