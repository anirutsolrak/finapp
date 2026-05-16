import { sendToClaudeAPI } from './claude'

// Pede pro Claude categorizar uma lista de descrições.
// rows: ParsedRow[]
// categories: { id, name, type }[]  // de db.getCategories()
//
// Retorna { [description]: category_id | null }
// Se houver falha (timeout, JSON malformado, etc.), retorna mapa vazio
// — UI cai pra categoria null em todas as linhas (user categoriza manual).
export async function categorizeBatch(rows, categories) {
  if (!rows || rows.length === 0 || !categories || categories.length === 0) return {}

  const catList = categories.map(c => `- ${c.id} — ${c.name} (${c.type})`).join('\n')
  const numbered = rows.map((r, i) => `${i + 1}. ${r.description} (${r.type})`).join('\n')

  const system = `Você é um classificador de transações financeiras brasileiras.

Categorias disponíveis (use APENAS estes IDs exatos):
${catList}

Para cada descrição numerada abaixo, retorne o category_id mais apropriado.
Se não tiver certeza, retorne null.
Combine com o tipo da transação (income/expense) ao escolher.

Responda APENAS um objeto JSON neste formato exato, sem nenhum texto adicional:
{"1": "category_id_ou_null", "2": "...", ...}`

  const messages = [{ role: 'user', content: numbered }]

  try {
    const reply = await sendToClaudeAPI(messages, system)
    const jsonMatch = reply.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return {}
    const parsed = JSON.parse(jsonMatch[0])
    const result = {}
    rows.forEach((r, i) => {
      const catId = parsed[String(i + 1)]
      result[r.description] = catId && catId !== 'null' ? catId : null
    })
    return result
  } catch (err) {
    console.warn('[aiCategorize] falha:', err)
    return {}
  }
}
