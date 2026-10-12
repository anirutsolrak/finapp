// ═══════════════════════════════════════════════════════════════════════════
// budgetEngine — cálculos PUROS (sem I/O): rótulos de fonte de pagamento, resumo
// do mês e saldo por conta. Coberto por budgetEngine.test.js.
// ═══════════════════════════════════════════════════════════════════════════
export const PAYMENT_SOURCE_LABELS = {
  credit: 'Crédito',
  fixed_income: 'Renda Fixa',
  variable_income: 'Renda Variável',
  reserve: 'Reserva',
}
export const TX_TYPE_LABELS = { income: 'Receita', expense: 'Despesa', investment: 'Investimento', transfer: 'Transferência' }
export const PAYMENT_SOURCE_ORDER = ['fixed_income', 'variable_income', 'credit', 'reserve']
// Fontes válidas para itens do orçamento (a reserva é só para despesas não planejadas)
export const BUDGET_ITEM_PAYMENT_SOURCES = ['fixed_income', 'variable_income', 'credit']

// Tipos de categoria válidos pra items de despesa no Planejamento.
// Income/reserve ficam fora — esses categorias existem mas só são usadas em Transactions.
export const BUDGET_ITEM_CATEGORY_TYPES = ['essential', 'variable', 'investment']

export function bucketOf(source) {
  if (source === 'credit') return 'credit'
  if (source === 'reserve') return 'reserve'
  return 'income'
}

const sum = (rows) => rows.reduce((a, r) => a + (Number(r.amount) || 0), 0)

// Resumo do mês em foco.
// - entrou/saiu/liquido: lançamentos do mês que passam pela conta corrente (cartão fica fora).
// - planejado/pago/falta: contas a pagar do mês, pelo valor da bill (itens de renda ficam fora).
export function monthTotals({ items = [], transactions = [] }) {
  const bank = transactions.filter(t => bucketOf(t.payment_source) !== 'credit')
  const entrou = sum(bank.filter(t => t.type === 'income'))
  const saiu = sum(bank.filter(t => t.type === 'expense'))
  const bills = items.filter(i => i.bill && i.categories?.type !== 'income').map(i => i.bill)
  const planejado = sum(bills)
  const pago = sum(bills.filter(b => b.is_paid))
  return { entrou, saiu, liquido: entrou - saiu, planejado, pago, falta: planejado - pago }
}

// ─── SALDO POR CONTA ─────────────────────────────────────────────────────────

// Tipos de entrada que aumentam o saldo de uma conta.
const INFLOW_TYPES = new Set(['income'])
// Tipos de saída que reduzem o saldo de uma conta (não inclui 'transfer' — transfers são
// tratadas separadamente via from_account_id/to_account_id).
const EXPENSE_OUTFLOW_TYPES = new Set(['expense', 'investment'])

/**
 * Snapshot de UMA conta: saldo atual + entradas/saídas do conjunto de transactions passado.
 *
 * - bank / envelope: saldo = opening_balance + entradas − saídas
 * - credit (credit_card / loan): saldo NÃO usa opening_balance. saldoAtual = dívida do ciclo
 *   (Σ saídas − Σ pagamentos via transfer entrando).
 */
export function computeAccountSnapshot({ account, transactions = [] }) {
  if (!account) return null

  const openingBalance = Number(account.opening_balance) || 0
  const creditLimit = Number(account.credit_limit) || 0
  const isCredit = account.type === 'credit'

  // Entradas: income com account_id == conta + transfers chegando (to_account_id == conta).
  const entradas = transactions
    .filter(t => {
      if (INFLOW_TYPES.has(t.type) && t.account_id === account.id) return true
      if (t.type === 'transfer' && t.to_account_id === account.id) return true
      return false
    })
    .reduce((a, t) => a + Number(t.amount || 0), 0)

  // Saídas: expense/investment com account_id == conta + transfers saindo (from_account_id == conta).
  const saidas = transactions
    .filter(t => {
      if (EXPENSE_OUTFLOW_TYPES.has(t.type) && t.account_id === account.id) return true
      if (t.type === 'transfer' && t.from_account_id === account.id) return true
      return false
    })
    .reduce((a, t) => a + Number(t.amount || 0), 0)

  const saldoAtual = isCredit
    ? saidas - entradas  // credit: dívida líquida (saídas − pagamentos via transfer entrando)
    : openingBalance + entradas - saidas

  const usado = isCredit ? Math.max(saldoAtual, 0) : 0
  const pctComprometido = (isCredit && creditLimit > 0) ? (usado / creditLimit) * 100 : null

  return {
    account,
    saldoAtual,
    entradas,
    saidas,
    usado,
    limite: creditLimit,
    pctComprometido,
  }
}
