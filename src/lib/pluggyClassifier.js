// Regras de classificação aplicadas em ordem. Primeira que match vence.
// Cada regra recebe (txPluggy, account) e retorna { type, payment_source, status, ...extras } ou null.

const RDB_KEYWORDS = ['Aplicação RDB', 'Resgate RDB']
const RDB_OP_TYPES = ['APLIC_FINANCEIRA', 'RESGATE_APLIC_FINANCEIRA']

function isRdbTransfer(tx) {
  if (RDB_OP_TYPES.includes(tx.operationType)) return true
  return RDB_KEYWORDS.some(k => (tx.descriptionRaw || '').includes(k))
}

export function classifyTransaction(tx, account) {
  // Regra 1: Aplicação/Resgate RDB → transfer interna
  if (isRdbTransfer(tx)) {
    return {
      type: 'transfer',
      payment_source: account.payment_source,
      status: 'approved',
      is_internal: true,
    }
  }
  // Mais regras vão aqui...
  return { type: 'expense', payment_source: account.payment_source, status: 'pending' }
}
