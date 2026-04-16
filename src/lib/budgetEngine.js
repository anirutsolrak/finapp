import { addDays, differenceInCalendarDays, format, startOfWeek, endOfWeek, parseISO, isBefore } from 'date-fns'

export const PAYMENT_SOURCE_LABELS = {
  credit: 'Crédito',
  fixed_income: 'Renda Fixa',
  variable_income: 'Renda Variável',
}
export const PAYMENT_SOURCE_ORDER = ['fixed_income', 'variable_income', 'credit']

export const BUCKET_LABELS = { income: 'Renda', credit: 'Crédito' }

export function bucketOf(source) {
  return source === 'credit' ? 'credit' : 'income'
}

function toDate(d) {
  if (!d) return null
  if (d instanceof Date) return d
  return typeof d === 'string' ? parseISO(d) : new Date(d)
}

export function computeBucketSnapshot({ bucket, cycle, items = [], transactions = [], today = new Date() }) {
  if (!cycle) {
    return { saldoOrigem: 0, reserva: 0, planejado: 0, gastoReal: 0, saldoDisponivel: 0, diasRestantes: 0, mediaDiaria: 0, metaSemanal: 0, pct: 0 }
  }
  const saldoOrigem = Number(bucket === 'credit' ? cycle.saldo_origem_credit : cycle.saldo_origem_income) || 0
  // Reserva e média diária/semanal só fazem sentido no bucket renda.
  // Crédito é dívida: limite − usado = disponível, sem projeção temporal.
  const reserva = bucket === 'credit' ? 0 : saldoOrigem * (Number(cycle.reserva_pct) || 0) / 100
  const itemsIn = items.filter(i => bucketOf(i.payment_source) === bucket && i.categories?.type !== 'income')
  const planejado = itemsIn.reduce((a, i) => a + Number(i.planned_amount || 0), 0)
  const gastoReal = transactions
    .filter(t => t.type === 'expense' && bucketOf(t.payment_source) === bucket)
    .reduce((a, t) => a + Number(t.amount || 0), 0)
  const saldoDisponivel = Math.max(saldoOrigem - reserva - gastoReal, 0)
  const endDate = toDate(cycle.end_date)
  const diasRestantes = endDate ? Math.max(differenceInCalendarDays(endDate, today) + 1, 1) : 1
  const mediaDiaria = bucket === 'credit' ? 0 : saldoDisponivel / diasRestantes
  const metaSemanal = bucket === 'credit' ? 0 : mediaDiaria * 7
  const pct = saldoOrigem > 0 ? (gastoReal / saldoOrigem) * 100 : 0
  return { saldoOrigem, reserva, planejado, gastoReal, saldoDisponivel, diasRestantes, mediaDiaria, metaSemanal, pct }
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

export function isoWeekBounds(date = new Date()) {
  return {
    week_start: format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
    week_end: format(endOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd'),
  }
}
