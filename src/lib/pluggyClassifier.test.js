import { describe, it, expect } from 'vitest'
import { classifyTransaction, findVoidablePairs } from './pluggyClassifier'

describe('classifyTransaction', () => {
  it('Aplicação RDB → transfer interna', () => {
    const tx = {
      amount: -500,
      descriptionRaw: 'Aplicação RDB',
      operationType: 'APLIC_FINANCEIRA',
    }
    const account = { type: 'BANK', payment_source: 'fixed_income' }
    const result = classifyTransaction(tx, account)
    expect(result.type).toBe('transfer')
    expect(result.is_internal).toBe(true)
    expect(result.status).toBe('approved')
  })

  it('Pagamento de fatura → transfer com bill_id quando match', () => {
    const tx = {
      amount: -201.35,
      descriptionRaw: 'Pagamento de fatura',
      date: '2026-04-14',
    }
    const account = { type: 'BANK', payment_source: 'fixed_income' }
    const candidateBills = [
      { id: 'bill-uuid-1', total_amount: 201.35, due_date: '2026-04-14' },
      { id: 'bill-uuid-2', total_amount: 100, due_date: '2026-04-10' },
    ]
    const result = classifyTransaction(tx, account, { candidateBills })
    expect(result.type).toBe('transfer')
    expect(result.bill_id).toBe('bill-uuid-1')
    expect(result.status).toBe('approved')
  })

  it('compra no débito → expense com payment_source da account', () => {
    const tx = { amount: -55, descriptionRaw: 'Compra no débito - DROGA LESTE LJ33' }
    const account = { type: 'BANK', payment_source: 'fixed_income' }
    const result = classifyTransaction(tx, account)
    expect(result.type).toBe('expense')
    expect(result.payment_source).toBe('fixed_income')
    expect(result.status).toBe('approved')
  })

  it('compra no crédito → expense + card_number do metadata', () => {
    const tx = {
      amount: 119.90,  // sinal positivo no Pluggy = débito no cartão
      descriptionRaw: 'MICROSOFT*STORE',
      creditCardMetadata: { cardNumber: '0035', billId: 'pluggy-bill-uuid' },
    }
    const account = { type: 'CREDIT', payment_source: 'credit' }
    const result = classifyTransaction(tx, account)
    expect(result.type).toBe('expense')
    expect(result.payment_source).toBe('credit')
    expect(result.card_number).toBe('0035')
    expect(result.status).toBe('approved')
  })

  it('salário (TRANSFERÊNCIA RECEBIDA + CNPJ + > 1000) → income approved', () => {
    const tx = {
      amount: 8966.98,
      descriptionRaw: 'Transferência Recebida - SOLUCAO COOPERATIVA DE TRABALH - 23.798.999/0001-61 - ITAÚ',
    }
    const account = { type: 'BANK', payment_source: 'fixed_income' }
    const result = classifyTransaction(tx, account)
    expect(result.type).toBe('income')
    expect(result.payment_source).toBe('fixed_income')
    expect(result.status).toBe('approved')
  })

  it('PIX recebido pequeno → pending (vai pra inbox)', () => {
    const tx = {
      amount: 145,
      descriptionRaw: 'Transferência recebida pelo Pix - Gabriele Pereira da Silva',
    }
    const account = { type: 'BANK', payment_source: 'fixed_income' }
    const result = classifyTransaction(tx, account)
    expect(result.type).toBe('income')
    expect(result.status).toBe('pending')
  })

  it('reembolso → pending (vai pra inbox)', () => {
    const tx = {
      amount: 76.49,
      descriptionRaw: 'Reembolso recebido pelo Pix - KEETA DELIVERY BRAZIL LTDA',
    }
    const account = { type: 'BANK', payment_source: 'fixed_income' }
    const result = classifyTransaction(tx, account)
    expect(result.status).toBe('pending')
    expect(result.type).toBe('income')
  })

  it('estorno → pending', () => {
    const tx = {
      amount: 50,
      descriptionRaw: 'Estorno de compra',
    }
    const account = { type: 'BANK', payment_source: 'fixed_income' }
    const result = classifyTransaction(tx, account)
    expect(result.status).toBe('pending')
  })

  it('reembolso com valor alto + CNPJ NÃO vira salário (regra 6 precede regra 5)', () => {
    const tx = {
      amount: 8966.98,
      descriptionRaw: 'Reembolso de Transferência Recebida - SOLUCAO COOPERATIVA - 23.798.999/0001-61',
    }
    const account = { type: 'BANK', payment_source: 'fixed_income' }
    const result = classifyTransaction(tx, account)
    expect(result.status).toBe('pending')
    expect(result.type).toBe('income')
  })
})

describe('findVoidablePairs', () => {
  it('par Aplicação+Resgate mesmo valor mesma data → vincula', () => {
    const txs = [
      { id: 'a', amount: -500, date: '2026-04-15', is_internal: true, descriptionRaw: 'Aplicação RDB' },
      { id: 'b', amount: 500, date: '2026-04-15', is_internal: true, descriptionRaw: 'Resgate RDB' },
      { id: 'c', amount: -100, date: '2026-04-15', is_internal: false, descriptionRaw: 'Compra' },
    ]
    const pairs = findVoidablePairs(txs)
    expect(pairs).toHaveLength(1)
    expect(pairs[0]).toEqual({ a: 'a', b: 'b' })
  })

  it('par com 1 dia de diferença → ainda vincula', () => {
    const txs = [
      { id: 'a', amount: -200, date: '2026-04-15', is_internal: true, descriptionRaw: 'Aplicação RDB' },
      { id: 'b', amount: 200, date: '2026-04-16', is_internal: true, descriptionRaw: 'Resgate RDB' },
    ]
    expect(findVoidablePairs(txs)).toHaveLength(1)
  })

  it('par com 3 dias de diferença → não vincula', () => {
    const txs = [
      { id: 'a', amount: -200, date: '2026-04-15', is_internal: true, descriptionRaw: 'Aplicação RDB' },
      { id: 'b', amount: 200, date: '2026-04-19', is_internal: true, descriptionRaw: 'Resgate RDB' },
    ]
    expect(findVoidablePairs(txs)).toHaveLength(0)
  })

  it('valores diferentes → não vincula', () => {
    const txs = [
      { id: 'a', amount: -200, date: '2026-04-15', is_internal: true, descriptionRaw: 'Aplicação RDB' },
      { id: 'b', amount: 250, date: '2026-04-15', is_internal: true, descriptionRaw: 'Resgate RDB' },
    ]
    expect(findVoidablePairs(txs)).toHaveLength(0)
  })
})
