// supabase/functions/pluggy-sync/index.ts
// Sync de UM item: força refresh no Pluggy, polling até UPDATED, lê tx novas, classifica, insere.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { pluggyFetch, pluggyJson } from '../_shared/pluggy.ts'

const POLL_INTERVAL_MS = 2000
const POLL_MAX_ATTEMPTS = 20  // 40s total

interface PluggyTx {
  id: string
  date: string
  amount: number
  description?: string
  descriptionRaw?: string
  type: 'DEBIT' | 'CREDIT'
  status: 'PENDING' | 'POSTED'
  operationType?: string
  creditCardMetadata?: { cardNumber?: string; billId?: string }
}

interface ClassificationResult {
  type: 'income'|'expense'|'transfer'|'investment'
  payment_source: string
  status: 'approved'|'pending'
  is_internal?: boolean
  bill_id?: string | null
  card_number?: string | null
  pluggy_bill_id?: string | null
}

const RDB_KEYWORDS = ['Aplicação RDB', 'Resgate RDB']
const RDB_OP_TYPES = ['APLIC_FINANCEIRA', 'RESGATE_APLIC_FINANCEIRA']

function isRdb(tx: PluggyTx): boolean {
  if (RDB_OP_TYPES.includes(tx.operationType || '')) return true
  return RDB_KEYWORDS.some(k => (tx.descriptionRaw || '').includes(k))
}

function classify(
  tx: PluggyTx,
  account: { type: string; payment_source: string },
  candidateBills: Array<{ id: string; total_amount: number; due_date: string }>,
): ClassificationResult {
  // Regra 1: RDB
  if (isRdb(tx)) {
    return { type: 'transfer', payment_source: account.payment_source, status: 'approved', is_internal: true }
  }
  // Regra 2: Pagamento de fatura
  const desc = (tx.descriptionRaw || '').toLowerCase()
  if (desc.includes('pagamento de fatura') && tx.amount < 0) {
    const txAmount = Math.abs(tx.amount)
    const exact = candidateBills.filter(b => Math.abs(Number(b.total_amount) - txAmount) < 0.01)
    let bill_id: string | null = null
    if (exact.length === 1) bill_id = exact[0].id
    else if (exact.length > 1) {
      const txDate = new Date(tx.date)
      bill_id = exact.slice().sort((a, b) =>
        Math.abs(+new Date(a.due_date) - +txDate) - Math.abs(+new Date(b.due_date) - +txDate)
      )[0].id
    }
    return { type: 'transfer', payment_source: account.payment_source, status: 'approved', bill_id }
  }
  // Regra 6: reembolso/estorno
  if (desc.includes('reembolso') || desc.includes('estorno')) {
    return { type: 'income', payment_source: account.payment_source, status: 'pending' }
  }
  // Regra 3: BANK + saída
  if (account.type === 'BANK' && tx.amount < 0) {
    return { type: 'expense', payment_source: account.payment_source, status: 'approved' }
  }
  // Regra 4: CREDIT (compra no cartão)
  if (account.type === 'CREDIT') {
    return {
      type: 'expense', payment_source: 'credit', status: 'approved',
      card_number: tx.creditCardMetadata?.cardNumber || null,
      pluggy_bill_id: tx.creditCardMetadata?.billId || null,
    }
  }
  // Regra 5: salário
  const cnpjPattern = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/
  const isReceived = /transfer[êe]ncia recebida/i.test(tx.descriptionRaw || '')
  if (tx.amount > 1000 && isReceived && cnpjPattern.test(tx.descriptionRaw || '')) {
    return { type: 'income', payment_source: 'fixed_income', status: 'approved' }
  }
  // Regra 7: amount > 0 → pending
  if (tx.amount > 0) {
    return { type: 'income', payment_source: account.payment_source, status: 'pending' }
  }
  // Catch-all
  return { type: 'expense', payment_source: account.payment_source, status: 'pending' }
}

serve(async (req) => {
  const opts = handleOptions(req)
  if (opts) return opts
  try {
    const { itemId } = await req.json()
    if (!itemId) return jsonError('itemId required', 400)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonError('unauthorized', 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return jsonError('unauthorized', 401)

    // Carrega item local
    const { data: item } = await supabase
      .from('pluggy_items').select('*').eq('id', itemId).single()
    if (!item) return jsonError('item not found', 404)

    // Carrega cutoff
    const { data: settings } = await supabase
      .from('user_settings').select('pluggy_cutoff_date').eq('user_id', user.id).single()
    const cutoff = settings?.pluggy_cutoff_date || new Date().toISOString().slice(0, 10)
    const fromDate = item.last_sync_at ? new Date(item.last_sync_at).toISOString().slice(0, 10) : cutoff

    // Force refresh
    await pluggyFetch(`/items/${item.pluggy_item_id}`, { method: 'POST' })

    // Polling até UPDATED
    let pluggyItem: any = null
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      pluggyItem = await pluggyJson<any>(`/items/${item.pluggy_item_id}`)
      if (pluggyItem.status === 'UPDATED' || pluggyItem.status === 'OUTDATED') break
      if (pluggyItem.status === 'LOGIN_ERROR' || pluggyItem.status === 'ERROR') {
        await supabase.from('pluggy_items').update({ status: pluggyItem.status }).eq('id', itemId)
        return jsonError(`item status: ${pluggyItem.status}`, 500)
      }
      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    }

    // Lista accounts locais do item
    const { data: accounts } = await supabase
      .from('accounts').select('*').eq('pluggy_item_id', itemId)

    let inserted = 0, pending = 0, skipped = 0
    let truncated = false

    for (const account of accounts || []) {
      // Bills (se CREDIT) — buscar/upsert antes das tx pra poder vincular bill_id
      let billsByPluggyId: Record<string, string> = {}
      let candidateBills: Array<{ id: string; total_amount: number; due_date: string }> = []
      if (account.type === 'CREDIT') {
        try {
          const billsResp = await pluggyJson<{ results: any[] }>(`/items/${item.pluggy_item_id}/credit-card-bills`)
          for (const b of billsResp.results || []) {
            const paid = (b.payments || []).reduce((a: number, p: any) => a + Number(p.amount || 0), 0)
            const status = paid >= Number(b.totalAmount) ? 'PAID' : (paid > 0 ? 'PARTIAL' : 'OPEN')
            const { data: upserted } = await supabase
              .from('credit_card_bills')
              .upsert({
                account_id: account.id,
                pluggy_bill_id: b.id,
                due_date: b.dueDate,
                total_amount: b.totalAmount,
                paid_amount: paid,
                status,
                raw_payload: b,
                updated_at: new Date().toISOString(),
              }, { onConflict: 'pluggy_bill_id' })
              .select('id, total_amount, due_date')
              .single()
            if (upserted) {
              billsByPluggyId[b.id] = upserted.id
              candidateBills.push({ id: upserted.id, total_amount: upserted.total_amount, due_date: upserted.due_date })
            }
          }
        } catch (e) {
          // bills podem não existir pra contas BANK ou conexões não-OF; segue
        }
      } else {
        // Pra contas BANK, candidate bills do user (todas) pra matching de pagamento de fatura
        const { data: allBills } = await supabase
          .from('credit_card_bills').select('id, total_amount, due_date')
        candidateBills = allBills || []
      }

      // Lista tx desde fromDate
      const PAGE_SIZE = 500
      const txs = await pluggyJson<{ results: PluggyTx[]; total?: number }>(
        `/transactions?accountId=${account.pluggy_account_id}&from=${fromDate}&pageSize=${PAGE_SIZE}`
      )
      if ((txs.results?.length || 0) >= PAGE_SIZE) {
        console.warn(`pluggy-sync: account ${account.pluggy_account_id} retornou ${txs.results.length} tx (limite ${PAGE_SIZE}). Possivel truncamento. Sincronize de novo.`)
        truncated = true
      }

      // Dedup em batch: pega todos os pluggy_tx_ids existentes em uma query
      const txIds = (txs.results || []).map(t => t.id)
      let existingIds = new Set<string>()
      if (txIds.length > 0) {
        const { data: existingRows } = await supabase
          .from('transactions').select('pluggy_tx_id').in('pluggy_tx_id', txIds)
        existingIds = new Set((existingRows || []).map(r => r.pluggy_tx_id))
      }

      // Classifica e monta rows
      const rowsToInsert: any[] = []
      for (const tx of txs.results || []) {
        if (existingIds.has(tx.id)) { skipped++; continue }
        const cls = classify(tx, account, candidateBills)
        const billLocal = cls.pluggy_bill_id ? billsByPluggyId[cls.pluggy_bill_id] : (cls.bill_id || null)
        const amountAbs = Math.abs(tx.amount)
        rowsToInsert.push({
          user_id: user.id,
          account_id: account.id,
          pluggy_tx_id: tx.id,
          raw_payload: tx,
          source: 'pluggy',
          status: cls.status,
          type: cls.type,
          payment_source: cls.payment_source,
          amount: amountAbs,
          date: tx.date.slice(0, 10),
          description: tx.description || tx.descriptionRaw || '',
          month_ref: tx.date.slice(0, 7),
          bill_id: billLocal,
          card_number: cls.card_number || null,
        })
        if (cls.status === 'pending') pending++
        else inserted++
      }

      // Insert em batch
      if (rowsToInsert.length > 0) {
        const { error: bulkErr } = await supabase.from('transactions').insert(rowsToInsert)
        if (bulkErr) {
          console.error('bulk insert error', bulkErr)
          // Reverte contadores otimistas
          inserted = 0
          pending = 0
          return jsonError(`bulk insert failed: ${bulkErr.message}`, 500)
        }
      }
    }

    // Pós-sync: detectar pares anuláveis (Aplicação + Resgate RDB)
    // Busca tx internas recentes desse user, sem linked_tx_id ainda
    const { data: internals } = await supabase
      .from('transactions')
      .select('id, amount, date, type, raw_payload, linked_tx_id')
      .eq('user_id', user.id)
      .eq('source', 'pluggy')
      .eq('type', 'transfer')
      .is('linked_tx_id', null)
      .gte('date', fromDate)
    if (internals) {
      const isRdbLocal = (t: any) => {
        const desc = t.raw_payload?.descriptionRaw || ''
        return RDB_KEYWORDS.some(k => desc.includes(k)) || RDB_OP_TYPES.includes(t.raw_payload?.operationType)
      }
      const rdb = internals.filter(isRdbLocal)
      const outs = rdb.filter(t => Number(t.raw_payload?.amount) < 0)
      const ins = rdb.filter(t => Number(t.raw_payload?.amount) > 0)
      const used = new Set<string>()
      for (const out of outs) {
        const outDate = new Date(out.date)
        const partner = ins.find(i => {
          if (used.has(i.id)) return false
          if (Math.abs(Number(out.amount) - Number(i.amount)) > 0.01) return false
          const days = Math.abs((+new Date(i.date) - +outDate) / 86400000)
          return days <= 1
        })
        if (partner) {
          await supabase.from('transactions').update({ linked_tx_id: partner.id, is_voided: true }).eq('id', out.id)
          await supabase.from('transactions').update({ linked_tx_id: out.id, is_voided: true }).eq('id', partner.id)
          used.add(partner.id)
        }
      }
    }

    // Atualiza last_sync_at
    await supabase.from('pluggy_items').update({
      last_sync_at: new Date().toISOString(),
      status: pluggyItem?.status || 'UPDATED',
    }).eq('id', itemId)

    return new Response(JSON.stringify({ inserted, pending, skipped, truncated }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return jsonError(String(err.message || err), 500)
  }
})

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
