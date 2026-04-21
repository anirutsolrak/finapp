import { addDays, differenceInCalendarDays, format, startOfWeek, endOfWeek, parseISO, isBefore } from 'date-fns'

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
  // Reserva e média diária/semanal só fazem sentido no bucket renda.
  // Crédito é dívida: limite − usado = disponível, sem projeção temporal.
  const reserva = bucket === 'credit' ? 0 : saldoOrigem * (Number(cycle.reserva_pct) || 0) / 100
  const itemsIn = items.filter(i => bucketOf(i.payment_source) === bucket && i.categories?.type !== 'income')
  const planejado = itemsIn.reduce((a, i) => a + Number(i.planned_amount || 0), 0)
  // Legado: soma só as transações de despesa no bucket. Mantido pra cards que mostram "gasto real".
  const gastoReal = transactions
    .filter(t => t.type === 'expense' && bucketOf(t.payment_source) === bucket)
    .reduce((a, t) => a + Number(t.amount || 0), 0)

  // Committed = tudo que já foi comprometido no bucket (o que entra no saldoDisponivel).
  // Por item do planejamento: max(planned, bills linkados, tx linkadas) pra não contar em dobro quando
  // uma bill/tx representa a execução de um item planejado. Adhoc (sem item) soma à parte.
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

  const saldoDisponivel = Math.max(saldoOrigem - reserva - committed, 0)
  const endDate = toDate(cycle.end_date)
  const diasRestantes = endDate ? Math.max(differenceInCalendarDays(endDate, today) + 1, 1) : 1
  const mediaDiaria = bucket === 'credit' ? 0 : saldoDisponivel / diasRestantes
  const metaSemanal = bucket === 'credit' ? 0 : mediaDiaria * 7
  const pct = saldoOrigem > 0 ? (committed / saldoOrigem) * 100 : 0
  return { saldoOrigem, reserva, planejado, gastoReal, committed, saldoDisponivel, diasRestantes, mediaDiaria, metaSemanal, pct }
}

// Gera array de semanas ISO (seg-dom) dentro do ciclo com meta_semanal e saldo_previsto_final
export function projectWeeks({ cycle, snapshot, today = new Date() }) {
  if (!cycle) return []
  const end = toDate(cycle.end_date)
  const weeks = []
  let cursor = startOfWeek(today, { weekStartsOn: 1 })
  let saldoRestante = snapshot.saldoDisponivel
  // total de dias restantes até fim do ciclo
  while (!isBefore(end, cursor)) {
    const wEnd = endOfWeek(cursor, { weekStartsOn: 1 })
    const wClamped = isBefore(end, wEnd) ? end : wEnd
    const dias = differenceInCalendarDays(wClamped, cursor) + 1
    const meta = snapshot.mediaDiaria * dias
    const saldoFinal = Math.max(saldoRestante - meta, 0)
    weeks.push({
      week_start: format(cursor, 'yyyy-MM-dd'),
      week_end: format(wClamped, 'yyyy-MM-dd'),
      dias,
      meta_semanal: meta,
      saldo_previsto_final: saldoFinal,
    })
    saldoRestante = saldoFinal
    cursor = addDays(wEnd, 1)
  }
  return weeks
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

// Status de saúde ao vivo: real atual vs esperado para o dia corrente (interpolação linear)
export function liveHealth({ cycle, snapshot, today = new Date() }) {
  if (!cycle) return { status: 'yellow', delta: 0, previstoHoje: 0 }
  const start = toDate(cycle.start_date)
  const end = toDate(cycle.end_date)
  const totalDias = Math.max(differenceInCalendarDays(end, start) + 1, 1)
  const diasPassados = Math.min(Math.max(differenceInCalendarDays(today, start) + 1, 0), totalDias)
  const gastoEsperado = (snapshot.saldoOrigem - snapshot.reserva) * (diasPassados / totalDias)
  const gastoReal = snapshot.gastoReal
  const delta = gastoEsperado - gastoReal
  const status = healthStatus(gastoEsperado, gastoReal) // se real maior que esperado => red
  return { status, delta, previstoHoje: gastoEsperado, gastoReal }
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
