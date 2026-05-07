// supabase/functions/pluggy-create-item/index.ts
// Recebe { itemId } do widget, busca dados no Pluggy, salva pluggy_items + accounts no DB.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { pluggyJson } from '../_shared/pluggy.ts'

interface PluggyAccount {
  id: string
  name: string
  type: 'BANK' | 'CREDIT'
  subtype?: string
}

function defaultPaymentSource(type: string): string {
  if (type === 'CREDIT') return 'credit'
  return 'fixed_income'
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

    // Busca dados do item no Pluggy
    const item = await pluggyJson<any>(`/items/${itemId}`)

    // Insere pluggy_items
    const { data: itemRow, error: itemErr } = await supabase
      .from('pluggy_items')
      .insert({
        user_id: user.id,
        pluggy_item_id: itemId,
        connector_name: item.connector?.name || 'Unknown',
        status: item.status || 'UPDATED',
      })
      .select()
      .single()
    if (itemErr) return jsonError(itemErr.message, 500)

    // Busca accounts
    const accountsResp = await pluggyJson<{ results: PluggyAccount[] }>(`/accounts?itemId=${itemId}`)
    const accountsToInsert = accountsResp.results.map(a => ({
      user_id: user.id,
      pluggy_item_id: itemRow.id,
      pluggy_account_id: a.id,
      name: a.name,
      type: a.type,
      subtype: a.subtype || null,
      payment_source: defaultPaymentSource(a.type),
    }))
    const { error: accErr } = await supabase.from('accounts').insert(accountsToInsert)
    if (accErr) return jsonError(accErr.message, 500)

    return new Response(JSON.stringify({ ok: true, itemRow, accounts: accountsToInsert.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return jsonError(String(err.message || err), 500)
  }
})

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
