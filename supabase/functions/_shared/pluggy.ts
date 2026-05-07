const PLUGGY_API = 'https://api.pluggy.ai'

let cachedToken: { value: string; expiresAt: number } | null = null

export async function getApiKey(): Promise<string> {
  // Cache 30 min — Pluggy API key dura 2h, mas renovamos antes pra ter folga
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value
  const clientId = Deno.env.get('PLUGGY_CLIENT_ID')
  const clientSecret = Deno.env.get('PLUGGY_CLIENT_SECRET')
  if (!clientId || !clientSecret) throw new Error('Pluggy credentials missing')

  const r = await fetch(`${PLUGGY_API}/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  })
  if (!r.ok) throw new Error(`Pluggy /auth failed: ${r.status} ${await r.text()}`)
  const data = await r.json()
  cachedToken = { value: data.apiKey, expiresAt: Date.now() + 30 * 60_000 }
  return data.apiKey
}

export async function pluggyFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const apiKey = await getApiKey()
  const headers = new Headers(init.headers)
  headers.set('X-API-KEY', apiKey)
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json')
  return fetch(`${PLUGGY_API}${path}`, { ...init, headers })
}

export async function pluggyJson<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await pluggyFetch(path, init)
  if (!r.ok) throw new Error(`Pluggy ${path} ${r.status}: ${await r.text()}`)
  return r.json() as Promise<T>
}
