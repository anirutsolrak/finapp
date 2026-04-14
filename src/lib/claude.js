import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const CLAUDE_MODEL = 'claude-sonnet-4-20250514'
const EDGE_FN_URL = 'https://vzbswcoogdarlzqstumy.supabase.co/functions/v1/claude-proxy'
const SUPABASE_ANON_KEY = 'sb_publishable_ynzrEH34nzVwEMp0m_7BZg_8ZZDB9yg'

export function buildSystemPrompt(context, userName) {
  const { monthRef, budgetItems, transactions, goals, upcomingBills, freeBalance = 0 } = context
  const totalBudget = (budgetItems || []).reduce((a, i) => a + Number(i.planned_amount), 0)
  const totalSpent = (transactions || []).filter(t => t.type === 'expense').reduce((a, t) => a + Number(t.amount), 0)
  const fixedItems = (budgetItems || []).filter(i => i.is_fixed).map(i => `${i.name}: R$${i.planned_amount}`).join(', ')
  const committedMonthly = (goals || [])
    .filter(g => !g.is_completed)
    .reduce((a, g) => a + Number(g.monthly_contribution || 0), 0)

  return `Você é o assistente financeiro pessoal de ${userName || 'usuário'} e sua família.
Hoje é ${format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}, mês de referência: ${monthRef}.

## ESTADO ATUAL DO ORÇAMENTO
- Orçamento planejado total: R$${totalBudget.toFixed(2)}
- Gasto no mês até agora: R$${totalSpent.toFixed(2)}
- Saldo disponível: R$${(totalBudget - totalSpent).toFixed(2)}

## SALDO LIVRE PARA METAS
- Saldo livre (receita - gastos fixos): R$${Number(freeBalance).toFixed(2)}
- Comprometido por metas ativas (mensal): R$${committedMonthly.toFixed(2)}
- Folga mensal restante: R$${Math.max(Number(freeBalance) - committedMonthly, 0).toFixed(2)}

Para criar uma meta, escolha UMA tag de agressividade (consome % do saldo livre por mês):
- very_high (15%), high (10%), medium (7%), low (4%), very_low (2%)
O app calcula automaticamente monthly_contribution, total_months e target_date a partir da tag — NUNCA sugira esses campos manualmente.

## ITENS FIXOS (NUNCA PODEM SER ALTERADOS OU REMOVIDOS):
${fixedItems || 'Nenhum'}

## ITENS DO PLANEJAMENTO:
${(budgetItems || []).map(i => `- ${i.name} (${i.categories?.name || 'sem categoria'}): R$${i.planned_amount} ${i.is_fixed ? '[FIXO]' : ''}`).join('\n') || 'Nenhum'}

## TRANSAÇÕES DO MÊS:
${(transactions || []).slice(0, 20).map(t => `- ${t.date} | ${t.description}: R$${t.amount} (${t.type})`).join('\n') || 'Nenhuma transação ainda.'}

## METAS ATIVAS:
${(goals || []).filter(g => !g.is_completed).map(g => {
  const tag = g.aggressiveness ? ` [${g.aggressiveness}]` : ''
  const dots = g.total_months ? ` | progresso: ${g.months_completed || 0}/${g.total_months} meses` : ''
  return `- ${g.name}${tag}: R$${g.current_amount}/${g.target_amount} (R$${g.monthly_contribution}/mês)${dots}`
}).join('\n') || 'Nenhuma meta.'}

## LEMBRETES A VENCER (próximos 10 dias):
${(upcomingBills || []).map(b => `- ${b.name}: R$${b.amount} vence em ${b.due_date} ${b.is_fixed ? '[FIXO]' : ''}`).join('\n') || 'Nenhum.'}

## REGRAS DE OURO:
1. NUNCA sugira alterar, remover ou reduzir valores de itens marcados como [FIXO].
2. Ao sugerir redistribuição de orçamento para uma meta, use apenas o saldo disponível de itens variáveis.
3. Quando o usuário relatar um gasto ou intenção de compra, faça perguntas de clarificação se necessário (valor, categoria, prazo).
4. Para metas: sempre use \`aggressiveness\` (very_high | high | medium | low | very_low) em vez de \`monthly_contribution\` manual. Se as metas ativas já consomem >100% do saldo livre, alerte o usuário antes de criar outra.
5. Sempre que sugerir lançar dados, retorne um JSON estruturado NO FINAL da resposta, entre as tags <ACTION> e </ACTION>.

Para UM item:
{
  "type": "add_transaction" | "add_goal" | "add_bill" | "update_budget",
  "data": { "description": "...", "amount": 100, "type": "expense" },
  "description": "Resumo legível da ação"
}

Exemplo de meta (use aggressiveness, não monthly_contribution):
{
  "type": "add_goal",
  "data": { "name": "Placa de vídeo", "target_amount": 3500, "current_amount": 0, "aggressiveness": "high", "priority": 2 },
  "description": "Meta: Placa de vídeo em ritmo agressivo (10% do saldo livre)"
}

Para MÚLTIPLOS itens do mesmo tipo, use "items" como array:
{
  "type": "add_transaction",
  "data": { "items": [ {"description":"...", "amount": 100}, {"description":"...", "amount": 200} ] },
  "description": "Resumo legível"
}

6. Fale sempre em português brasileiro, de forma amigável e direta.
7. Dê insights sobre distribuição de gastos e sugestões para atingir metas quando relevante.`
}

export async function sendToClaudeAPI(messages, systemPrompt) {
  const resp = await fetch(EDGE_FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ messages, system: systemPrompt }),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    const msg = err.error || `Erro ${resp.status}`
    if (resp.status === 401) throw new Error('Erro de autenticação na Edge Function.')
    if (resp.status === 500 && msg.includes('ANTHROPIC_API_KEY')) {
      throw new Error('Chave da API Anthropic não configurada nos Secrets do Supabase.')
    }
    throw new Error(msg)
  }

  const data = await resp.json()
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error))
  return data.content?.[0]?.text || ''
}

export function extractAction(text) {
  const match = text.match(/<ACTION>([\s\S]*?)<\/ACTION>/)
  if (!match) return null
  try { return JSON.parse(match[1].trim()) }
  catch { return null }
}

export function cleanText(text) {
  return text.replace(/<ACTION>[\s\S]*?<\/ACTION>/g, '').trim()
}