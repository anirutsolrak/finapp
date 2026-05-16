import { differenceInCalendarDays, format, startOfWeek, parseISO, isBefore } from 'date-fns'

export const PAYMENT_SOURCE_LABELS = {
  credit: 'Crédito',
  fixed_income: 'Renda Fixa',
  variable_income: 'Renda Variável',
  reserve: 'Reserva',
}
export const PAYMENT_SOURCE_ORDER = ['fixed_income', 'variable_income', 'credit', 'reserve']
// Fontes válidas para itens do orçamento (a reserva é só para despesas não planejadas)
export const BUDGET_ITEM_PAYMENT_SOURCES = ['fixed_income', 'variable_income', 'credit']

export const BUCKET_LABELS = { income: 'Renda', credit: 'Crédito', reserve: 'Reserva' }

export function bucketOf(source) {
  if (source === 'credit') return 'credit'
  if (source === 'reserve') return 'reserve'
  return 'income'
}

function toDate(d) {
  if (!d) return null
  if (d instanceof Date) return d
  return typeof d === 'string' ? parseISO(d) : new Date(d)
}

// Tipos de lançamento que tiram dinheiro do bucket (despesa, transferência pra outro pote, investimento).
const OUTFLOW_TYPES = new Set(['expense', 'transfer', 'investment'])

export function computeBucketSnapshot({ bucket, cycle, items = [], transactions = [], bills = [], accounts = null, accountTransactions = null, today = new Date() }) {
  if (!cycle) {
    return { saldoOrigem: 0, reserva: 0, planejado: 0, gastoReal: 0, committed: 0, saldoDisponivel: 0, diasRestantes: 0, mediaDiaria: 0, metaSemanal: 0, pct: 0 }
  }
  // saldoAtual da conta precisa de TODO o histórico de tx (não filtrado por DateRange);
  // caller passa accountTransactions separado. Fallback pra `transactions` mantém back-compat.
  const allAccountTx = accountTransactions || transactions
  // Onda 4: se accounts foi passado, deriva saldoOrigem da soma dos saldos das contas.
  // Senão, cai no comportamento antigo (lê cycle.saldo_origem_*).
  let saldoOrigem
  if (accounts && accounts.length > 0) {
    if (bucket === 'credit') {
      // Bucket credit = soma dos credit_limit das contas credit_card (loan fica fora).
      saldoOrigem = accounts
        .filter(a => a.is_active !== false && a.type === 'credit' && a.subtype === 'credit_card')
        .reduce((a, ac) => a + (Number(ac.credit_limit) || 0), 0)
    } else {
      // Bucket income = soma do saldo derivado das contas bank.
      const banks = accounts.filter(a => a.is_active !== false && a.type === 'bank')
      saldoOrigem = banks.reduce((sum, account) => {
        const snap = computeAccountSnapshot({ account, transactions: allAccountTx })
        return sum + snap.saldoAtual
      }, 0)
    }
  } else {
    saldoOrigem = Number(bucket === 'credit' ? cycle.saldo_origem_credit : cycle.saldo_origem_income) || 0
  }

  const reservaPct = Number(cycle.reserva_pct) || 0
  // Reserva nominal (meta de separação do mês) calculada sobre o saldo_origem original.
  const reserva = bucket === 'credit' ? 0 : saldoOrigem * reservaPct / 100
  const itemsIn = items.filter(i => bucketOf(i.payment_source) === bucket && i.categories?.type !== 'income')
  const planejado = itemsIn.reduce((a, i) => a + Number(i.planned_amount || 0), 0)
  // Gasto real (display e pacing): só transações de despesa no bucket.
  const gastoReal = transactions
    .filter(t => t.type === 'expense' && bucketOf(t.payment_source) === bucket)
    .reduce((a, t) => a + Number(t.amount || 0), 0)

  // Committed informativo: tudo que está alocado no bucket — max(planned, bills, tx) por item
  // + adhoc. Crédito usa isso como "usado" porque o limite fica comprometido mesmo antes do pagamento.
  let committed = 0
  for (const item of itemsIn) {
    const billSum = bills
      .filter(b => b.budget_item_id === item.id)
      .reduce((a, b) => a + Number(b.amount || 0), 0)
    const txSum = transactions
      .filter(t => t.budget_item_id === item.id && OUTFLOW_TYPES.has(t.type))
      .reduce((a, t) => a + Number(t.amount || 0), 0)
    const planned = Number(item.planned_amount || 0)
    committed += Math.max(billSum, txSum, planned)
  }
  const adhocTx = transactions
    .filter(t => OUTFLOW_TYPES.has(t.type) && !t.budget_item_id && bucketOf(t.payment_source) === bucket)
    .reduce((a, t) => a + Number(t.amount || 0), 0)
  committed += adhocTx

  // Onda 4: quando accounts deriva saldoOrigem, saidaSinceCutoff já está embutida (saldoAtual = opening + entradas − saídas).
  // Pra não duplicar, modo derivado pula a subtração de saidaSinceCutoff.
  const cutoff = cycle.updated_at ? new Date(cycle.updated_at) : null
  const saidaSinceCutoff = (accounts && accounts.length > 0)
    ? 0
    : transactions
        .filter(t => OUTFLOW_TYPES.has(t.type) && bucketOf(t.payment_source) === bucket)
        .filter(t => !cutoff || (t.created_at && new Date(t.created_at) >= cutoff))
        .reduce((a, t) => a + Number(t.amount || 0), 0)
  const saldoReal = saldoOrigem - saidaSinceCutoff
  const saldoDisponivel = bucket === 'credit'
    ? Math.max(saldoReal, 0)
    : Math.max(saldoReal * (1 - reservaPct / 100), 0)
  const endDate = toDate(cycle.end_date)
  const startDate = toDate(cycle.start_date)
  // Recálculo trava no domingo: a média/meta só muda quando vira a semana (ou quando o usuário
  // edita saldo_origem). Entre domingos, diasRestantes/mediaDiaria/metaSemanal ficam fixos.
  const sundayAnchor = startOfWeek(today, { weekStartsOn: 0 })
  const anchor = startDate && isBefore(sundayAnchor, startDate) ? startDate : sundayAnchor
  const diasRestantes = endDate ? Math.max(differenceInCalendarDays(endDate, anchor) + 1, 1) : 1
  const mediaDiaria = bucket === 'credit' ? 0 : saldoDisponivel / diasRestantes
  const metaSemanal = bucket === 'credit' ? 0 : mediaDiaria * 7
  const pct = saldoOrigem > 0 ? (committed / saldoOrigem) * 100 : 0
  return { saldoOrigem, reserva, planejado, gastoReal, committed, saidaSinceCutoff, saldoReal, saldoDisponivel, diasRestantes, mediaDiaria, metaSemanal, pct }
}

// Snapshot da reserva: saldo carregado do ciclo anterior + aporte deste ciclo − usado neste ciclo.
// Nunca retorna disponivel < 0 (validamos no lançamento para impedir).
export function computeReservaSnapshot({ cycle, transactions = [], accounts = null, accountTransactions = null }) {
  if (!cycle) return { acumulada: 0, aporte: 0, usado: 0, disponivel: 0, total: 0 }
  const acumulada = Number(cycle.reserva_acumulada) || 0
  const allAccountTx = accountTransactions || transactions
  let saldoOrigemIncome
  if (accounts && accounts.length > 0) {
    const banks = accounts.filter(a => a.is_active !== false && a.type === 'bank')
    saldoOrigemIncome = banks.reduce((sum, account) => {
      const snap = computeAccountSnapshot({ account, transactions: allAccountTx })
      return sum + snap.saldoAtual
    }, 0)
  } else {
    saldoOrigemIncome = Number(cycle.saldo_origem_income) || 0
  }
  const aporte = saldoOrigemIncome * (Number(cycle.reserva_pct) || 0) / 100
  const usado = transactions
    .filter(t => t.type === 'expense' && t.payment_source === 'reserve')
    .reduce((a, t) => a + Number(t.amount || 0), 0)
  const total = acumulada + aporte
  const disponivel = Math.max(total - usado, 0)
  return { acumulada, aporte, usado, disponivel, total }
}

// ─── ACCOUNT SNAPSHOTS (Onda 4 — multi-conta) ────────────────────────────────

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

/**
 * Agregado por grupo de contas (bank / credit_card / loan / envelope).
 * `filter` é uma função (account) => boolean.
 */
export function computeAccountsGroupSnapshot({ accounts = [], transactions = [], filter }) {
  const contasFiltradas = accounts.filter(a => a.is_active !== false).filter(filter)
  const snapshots = contasFiltradas.map(account => computeAccountSnapshot({ account, transactions }))

  const saldoTotal = snapshots.reduce((a, s) => a + s.saldoAtual, 0)
  const entradasTotal = snapshots.reduce((a, s) => a + s.entradas, 0)
  const saidasTotal = snapshots.reduce((a, s) => a + s.saidas, 0)
  const usadoTotal = snapshots.reduce((a, s) => a + s.usado, 0)
  const limiteTotal = snapshots.reduce((a, s) => a + s.limite, 0)
  const pctComprometidoTotal = limiteTotal > 0 ? (usadoTotal / limiteTotal) * 100 : null

  return {
    contas: snapshots,
    saldoTotal,
    entradasTotal,
    saidasTotal,
    usadoTotal,
    limiteTotal,
    pctComprometidoTotal,
  }
}
