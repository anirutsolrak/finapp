import { addMonths, format } from 'date-fns'

export const AGGRESSIVENESS_PCT = {
  very_high: 0.15,
  high: 0.10,
  medium: 0.07,
  low: 0.04,
  very_low: 0.02,
}

export const AGGRESSIVENESS_LABELS = {
  very_high: 'Muito agressivo (15%)',
  high: 'Agressivo (10%)',
  medium: 'Mediano (7%)',
  low: 'Baixo (4%)',
  very_low: 'Muito baixo (2%)',
}

export const AGGRESSIVENESS_ORDER = ['very_high', 'high', 'medium', 'low', 'very_low']

export function computeFreeBalance(budgetItems) {
  const income = (budgetItems || [])
    .filter(i => i.categories?.type === 'income')
    .reduce((a, i) => a + Number(i.planned_amount || 0), 0)
  const fixed = (budgetItems || [])
    .filter(i => i.is_fixed && i.categories?.type !== 'income')
    .reduce((a, i) => a + Number(i.planned_amount || 0), 0)
  return Math.max(income - fixed, 0)
}

export function computeGoalPlan({ targetAmount, currentAmount = 0, aggressiveness = 'medium', freeBalance = 0, startDate = new Date() }) {
  const target = Number(targetAmount) || 0
  const current = Number(currentAmount) || 0
  const remaining = Math.max(target - current, 0)
  const pct = AGGRESSIVENESS_PCT[aggressiveness] ?? AGGRESSIVENESS_PCT.medium
  const monthlyRaw = Number(freeBalance) * pct
  const monthly = Math.max(Math.round(monthlyRaw), 1)
  const totalMonths = remaining > 0 ? Math.max(Math.ceil(remaining / monthly), 1) : 0
  const target_date = totalMonths > 0
    ? format(addMonths(startDate, totalMonths), 'yyyy-MM-dd')
    : format(startDate, 'yyyy-MM-dd')
  return {
    monthly_contribution: monthly,
    total_months: totalMonths,
    target_date,
  }
}
