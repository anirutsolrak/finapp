// supabase/functions/pluggy-connect-token/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders, handleOptions } from '../_shared/cors.ts'
import { pluggyJson } from '../_shared/pluggy.ts'

serve(async (req) => {
  const opts = handleOptions(req)
  if (opts) return opts

  try {
    // Pluggy /connect_token cria token efêmero pro Connect Widget
    const data = await pluggyJson('/connect_token', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    return new Response(JSON.stringify({ accessToken: data.accessToken }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err.message || err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
