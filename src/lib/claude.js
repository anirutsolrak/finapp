import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { supabase } from './supabase'

const EDGE_FN_URL = 'https://vzbswcoogdarlzqstumy.supabase.co/functions/v1/claude-proxy'

export function buildSystemPrompt(context, userName) {
  const { monthRef, budgetItems, transactions, goals, upcomingBills } = context
  const totalBudget = (budgetItems || []).reduce((a, i) => a + Number(i.planned_amount), 0)
  const totalSpent = (transactions || []).filter(t => t.type === 'expense').reduce((a, t) => a + Number(t.amount), 0)
  const fixedItems = (budgetItems || []).filter(i => i.is_fixed).map(i => `${i.name}: R$${i.planned_amount}`).join(', ')

  return `Você é o assistente financeiro pessoal de ${userName || 'usuário'} e sua família.
Hoje é ${format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}, mês de referência: ${monthRef}.

## ESTADO ATUAL DO ORÇAMENTO
- Orçamento planejado total: R$${totalBudget.toFixed(2)}
- Gasto no mês até agora: R$${totalSpent.toFixed(2)}
- Saldo disponível: R$${(totalBudget - totalSpent).toFixed(2)}

## ITENS FIXOS (NUNCA PODEM SER ALTERADOS OU REMOVIDOS):
${fixedItems}

## ITENS DO ORÇAMENTO:
${(budgetItems || []).map(i => `- ${i.name} (${i.categories?.name}): R$${i.planned_amount} ${i.is_fixed ? '[FIXO]' : ''}`).join('\n')}

## TRANSAÇÕES DO MÊS:
${(transactions || []).slice(0, 20).map(t => `- ${t.date} | ${t.description}: R$${t.amount} (${t.type})`).join('\n') || 'Nenhuma transação ainda.'}

## METAS ATIVAS:
${(goals || []).map(g => `- ${g.name}: R$${g.current_amount}/${g.target_amount} (contribuição mensal: R$${g.monthly_contribution})`).join('\n') || 'Nenhuma meta.'}

## CONTAS A VENCER (próximos 10 dias):
${(upcomingBills || []).map(b => `- ${b.name}: R$${b.amount} vence em ${b.due_date} ${b.is_fixed ? '[FIXO]' : ''}`).join('\n') || 'Nenhuma conta a vencer.'}

## REGRAS DE OURO:
1. NUNCA sugira alterar, remover ou reduzir valores de itens marcados como [FIXO].
2. Ao sugerir redistribuição de orçamento para uma meta, use apenas o saldo disponível de itens variáveis.
3. Quando o usuário relatar um gasto ou intenção de compra, faça perguntas de clarificação se necessário (valor, categoria, prazo).
4. Sempre que sugerir lançar dados, retorne um JSON estruturado NO FINAL da resposta, entre as tags <ACTION> e </ACTION>. Use SEMPRE este formato:

Para UM item:
{
  "type": "add_transaction" | "add_goal" | "add_bill" | "update_budget",
  "data": { "description": "...", "amount": 100, "type": "expense", ... },
  "description": "Resumo legível da ação"
}

Para MÚLTIPLOS itens do mesmo tipo, use "items" como array:
{
  "type": "add_transaction",
  "data": { "items": [ {"description":"...", "amount": 100}, {"description":"...", "amount": 200} ] },
  "description": "Resumo legível"
}

NUNCA misture tipos diferentes em uma única ação. Prefira ações simples e únicas sempre que possível.
5. Fale sempre em português brasileiro, de forma amigável e direta.
6. Dê insights semanais sobre distribuição de gastos quando relevante.`
}

export async function sendToClaudeAPI(messages, systemPrompt) {
  // Pega o token JWT do usuário logado para autenticar na Edge Function
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Usuário não autenticado.')

  const resp = await fetch(EDGE_FN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ messages, system: systemPrompt }),
  })

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}))
    const msg = err.error || `Erro ${resp.status}`
    if (msg.includes('ANTHROPIC_API_KEY not configured')) {
      throw new Error('Chave da API não configurada no Supabase. Siga as instruções abaixo.')
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