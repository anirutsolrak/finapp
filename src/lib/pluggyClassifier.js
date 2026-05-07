// Regras de classificação aplicadas em ordem. Primeira que match vence.
// Cada regra recebe (txPluggy, account) e retorna { type, payment_source, status, ...extras } ou null.

const RDB_KEYWORDS = ['Aplicação RDB', 'Resgate RDB']
const RDB_OP_TYPES = ['APLIC_FINANCEIRA', 'RESGATE_APLIC_FINANCEIRA']

function isRdbTransfer(tx) {
  if (RDB_OP_TYPES.includes(tx.operationType)) return true
  return RDB_KEYWORDS.some(k => (tx.descriptionRaw || '').includes(k))
}

function isPaymentOfBill(tx) {
  return (tx.descriptionRaw || '').toLowerCase().includes('pagamento de fatura') && tx.amount < 0
}

function matchBill(tx, candidateBills = []) {
  const txAmount = Math.abs(tx.amount)
  // Match por valor exato; se múltiplos, escolhe o de due_date mais próximo da data da tx
  const exact = candidateBills.filter(b => Math.abs(Number(b.total_amount) - txAmount) < 0.01)
  if (exact.length === 0) return null
  if (exact.length === 1) return exact[0].id
  // Tie-break: due_date mais próximo
  const txDate = new Date(tx.date)
  const sorted = exact.slice().sort((a, b) => {
    return Math.abs(new Date(a.due_date) - txDate) - Math.abs(new Date(b.due_date) - txDate)
  })
  return sorted[0].id
}

export function classifyTransaction(tx, account, opts = {}) {
  // Regra 1: Aplicação/Resgate RDB → transfer interna
  if (isRdbTransfer(tx)) {
    return {
      type: 'transfer',
      payment_source: account.payment_source,
      status: 'approved',
      is_internal: true,
    }
  }

  // Regra 2: Pagamento de fatura → transfer vinculado a bill
  if (isPaymentOfBill(tx)) {
    const bill_id = matchBill(tx, opts.candidateBills)
    return {
      type: 'transfer',
      payment_source: account.payment_source,
      status: 'approved',
      bill_id,
    }
  }

  // Regra 3: Conta BANK + saída → expense
  if (account.type === 'BANK' && tx.amount < 0) {
    return {
      type: 'expense',
      payment_source: account.payment_source,
      status: 'approved',
    }
  }

  // Regra 4: Conta CREDIT (compra no cartão)
  if (account.type === 'CREDIT') {
    const meta = tx.creditCardMetadata || {}
    return {
      type: 'expense',
      payment_source: 'credit',
      status: 'approved',
      card_number: meta.cardNumber || null,
      pluggy_bill_id: meta.billId || null, // será resolvido depois pra bill_id local
    }
  }

  // Regra 5: Salário (heurística: transferência recebida grande de CNPJ)
  const cnpjPattern = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/
  const looksLikeReceivedTransfer = /transfer[êe]ncia recebida/i.test(tx.descriptionRaw || '')
  if (tx.amount > 1000 && looksLikeReceivedTransfer && cnpjPattern.test(tx.descriptionRaw || '')) {
    return {
      type: 'income',
      payment_source: 'fixed_income',
      status: 'approved',
    }
  }

  // Regra 7: amount > 0 e nada match antes → income pending (inbox)
  if (tx.amount > 0) {
    return {
      type: 'income',
      payment_source: account.payment_source,
      status: 'pending',
    }
  }

  // Mais regras vão aqui...
  return { type: 'expense', payment_source: account.payment_source, status: 'pending' }
}
