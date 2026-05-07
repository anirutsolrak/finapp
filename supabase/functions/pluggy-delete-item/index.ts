// supabase/functions/pluggy-delete-item/index.ts
// Revoga consent no Pluggy e remove o item localmente. Tx ficam (não excluímos histórico).
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { pluggyFetch } from '../_shared/pluggy.ts'

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

    // Pega o pluggy_item_id pra revogar lá
    const { data: item } = await supabase
      .from('pluggy_items').select('pluggy_item_id').eq('id', itemId).single()

    if (item) {
      const r = await pluggyFetch(`/items/${item.pluggy_item_id}`, { method: 'DELETE' })
      if (!r.ok && r.status !== 404) {
        return jsonError(`Pluggy delete failed: ${r.status}`, 500)
      }
    }

    // Remove local (cascade deleta accounts e bills via FK ON DELETE CASCADE)
    const { error } = await supabase.from('pluggy_items').delete().eq('id', itemId)
    if (error) return jsonError(error.message, 500)

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return jsonError(String(e.message || e), 500)
  }
})

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
