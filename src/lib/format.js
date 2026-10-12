// ─── format — formatação de exibição compartilhada ──────────────────────────
export const fmt = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
