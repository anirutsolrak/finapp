// ═══════════════════════════════════════════════════════════════════════════
// dateRange — lógica do período/ciclo global (presets, persistência local).
// Resolve presets (ciclo atual, este mês, últimos 30/90d) em {startDate,endDate}
// e guarda a escolha no localStorage. Consumido pelo DateRangeContext.
// ═══════════════════════════════════════════════════════════════════════════
import { format, parseISO, startOfMonth, endOfMonth, subMonths, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const STORAGE_KEY = 'finapp:dateRange'

const fmt = (d) => format(d, 'yyyy-MM-dd')
const ddMM = (s) => format(parseISO(s), 'dd/MM')

export function resolvePreset(presetKey, cycles, today = new Date()) {
  const todayStr = fmt(today)
  switch (presetKey) {
    case 'cycle': {
      const c = (cycles || []).find(c => c.start_date <= todayStr && todayStr <= c.end_date)
      if (c) {
        return {
          startDate: c.start_date,
          endDate: c.end_date,
          preset: 'cycle',
          label: `Ciclo atual (${ddMM(c.start_date)} → ${ddMM(c.end_date)})`,
        }
      }
      return resolvePreset('this_month', cycles, today)
    }
    case 'this_month': {
      const s = startOfMonth(today)
      const e = endOfMonth(today)
      return {
        startDate: fmt(s),
        endDate: fmt(e),
        preset: 'this_month',
        label: format(s, "MMMM 'de' yyyy", { locale: ptBR }),
      }
    }
    case 'last_month': {
      const ref = subMonths(today, 1)
      const s = startOfMonth(ref)
      const e = endOfMonth(ref)
      return {
        startDate: fmt(s),
        endDate: fmt(e),
        preset: 'last_month',
        label: format(s, "MMMM 'de' yyyy", { locale: ptBR }),
      }
    }
    case 'last_30d': {
      const s = subDays(today, 30)
      return {
        startDate: fmt(s),
        endDate: todayStr,
        preset: 'last_30d',
        label: 'Últimos 30 dias',
      }
    }
    case 'last_90d': {
      const s = subDays(today, 90)
      return {
        startDate: fmt(s),
        endDate: todayStr,
        preset: 'last_90d',
        label: 'Últimos 90 dias',
      }
    }
    default:
      throw new Error(`Preset desconhecido: ${presetKey}`)
  }
}

export function findCycleForRange(cycles, range) {
  if (!range || !cycles?.length) return null
  return cycles.find(c =>
    c.start_date === range.startDate && c.end_date === range.endDate
  ) || null
}

export function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.startDate || !parsed?.endDate || !parsed?.preset || !parsed?.label) return null
    return parsed
  } catch {
    return null
  }
}

export function saveToStorage(range) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(range))
  } catch { /* ignora quota errors */ }
}
