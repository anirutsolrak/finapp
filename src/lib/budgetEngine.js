import { differenceInCalendarDays, format, startOfWeek, endOfWeek, parseISO, isBefore } from 'date-fns'

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

export function computeBucketSnapshot({ bucket, cycle, items = [], transactions = [], bills = [], today = new Date() }) {
  if (!cycle) {
    return { saldoOrigem: 0, reserva: 0, planejado: 0, gastoReal: 0, committed: 0, saldoDisponivel: 0, diasRestantes: 0, mediaDiaria: 0, metaSemanal: 0, pct: 0 }
  }
  const saldoOrigem = Number(bucket === 'credit' ? cycle.saldo_origem_credit : cycle.saldo_origem_income) || 0
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

  // Modelo unificado (renda e crédito): saldo_origem é o valor em conta/limite no momento em que
  // o usuário salvou Configurar ciclo (cycle.updated_at é o cutoff). Outflows logados DEPOIS desse
  // momento (tx.created_at >= updated_at) reduzem automaticamente o saldo exibido.
  // Tx pré-cutoff são consideradas "já embutidas" no saldo_origem (não dobram).
  // Reserva (%) incide sobre o saldoReal só na renda (crédito não tem reserva).
  const cutoff = cycle.updated_at ? new Date(cycle.updated_at) : null
  const saidaSinceCutoff = transactions
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

export function healthStatus(real, previsto) {
  const p = Number(previsto) || 0
  const r = Number(real) || 0
  if (p <= 0) return 'yellow'
  const diff = (r - p) / p
  if (diff >= 0.05) return 'green'
  if (diff <= -0.05) return 'red'
  return 'yellow'
}

// Snapshot da reserva: saldo carregado do ciclo anterior + aporte deste ciclo − usado neste ciclo.
// Nunca retorna disponivel < 0 (validamos no lançamento para impedir).
export function computeReservaSnapshot({ cycle, transactions = [] }) {
  if (!cycle) return { acumulada: 0, aporte: 0, usado: 0, disponivel: 0, total: 0 }
  const acumulada = Number(cycle.reserva_acumulada) || 0
  const saldoOrigemIncome = Number(cycle.saldo_origem_income) || 0
  const aporte = saldoOrigemIncome * (Number(cycle.reserva_pct) || 0) / 100
  const usado = transactions
    .filter(t => t.type === 'expense' && t.payment_source === 'reserve')
    .reduce((a, t) => a + Number(t.amount || 0), 0)
  const total = acumulada + aporte
  const disponivel = Math.max(total - usado, 0)
  return { acumulada, aporte, usado, disponivel, total }
}

export function isoWeekBounds(date = new Date()) {
  return {
    week_start: format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    week_end: format(endOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  }
}
