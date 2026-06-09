// ═══════════════════════════════════════════════════════════════════════════
// claude.js — integração com a IA (Claude). Monta o prompt com o contexto
// financeiro, chama a Edge Function `claude-proxy` (que guarda a chave da
// Anthropic) e extrai a <ACTION> estruturada que o app aplica.
// ═══════════════════════════════════════════════════════════════════════════
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const CLAUDE_MODEL = 'claude-sonnet-4-20250514'
const EDGE_FN_URL = 'https://vzbswcoogdarlzqstumy.supabase.co/functions/v1/claude-proxy'
const SUPABASE_ANON_KEY = 'sb_publishable_ynzrEH34nzVwEMp0m_7BZg_8ZZDB9yg'

export function buildSystemPrompt(context, userName) {
  const { monthRef, budgetItems, transactions, goals, upcomingBills, cycle, incomeSnapshot, creditSnapshot, reservaSnapshot } = context
  const totalBudget = (budgetItems || []).reduce((a, i) => a + Number(i.planned_amount), 0)
  const totalSpent = (transactions || []).filter(t => t.type === 'expense').reduce((a, t) => a + Number(t.amount), 0)
  const fixedItems = (budgetItems || []).filter(i => i.is_fixed).map(i => `${i.name}: R$${i.planned_amount}`).join(', ')

  return `Você é o assistente financeiro pessoal de ${userName || 'usuário'} e sua família.
Hoje é ${format(new Date(), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}, mês de referência: ${monthRef}.

## ESTADO ATUAL DO ORÇAMENTO
- Orçamento planejado total: R$${totalBudget.toFixed(2)}
- Gasto no mês até agora: R$${totalSpent.toFixed(2)}
- Saldo disponível: R$${(totalBudget - totalSpent).toFixed(2)}

## BUCKETS (RENDA vs CRÉDITO vs RESERVA)
**Modelo de cálculo (importante):**
- Renda: \`saldo_origem_income\` = SALDO em conta no momento em que o usuário salvou Configurar ciclo. \`cycle.updated_at\` é o cutoff: outflows (tx expense/transfer/investment no bucket renda) com \`created_at >= updated_at\` reduzem automaticamente o saldo exibido. Tx pré-cutoff são consideradas já embutidas no saldo_origem (não dobram).
- saldoReal = saldo_origem − soma_outflow_pos_cutoff. Disponível = saldoReal × (1 − reserva%).
- Média diária = disponível ÷ dias_restantes_até_fim_do_ciclo. Recálculo trava no último domingo (entre domingos os valores ficam constantes).
- Para resetar a contagem: usuário edita Configurar ciclo (atualiza saldo + zera o cutoff em updated_at).
- Crédito: \`saldoDisponivel\` = limite − committed (committed = max(planned, bills, tx) por item + adhoc tx).
- Reserva: acumulada (rollover) + aporte (saldo_origem × reserva%) − usado (tx com payment_source=reserve).

**Snapshot atual:**
${incomeSnapshot ? `- Renda: saldo atual R$${Number(incomeSnapshot.saldoOrigem).toFixed(2)} | reservado R$${Number(incomeSnapshot.reserva).toFixed(2)} | disponível R$${Number(incomeSnapshot.saldoDisponivel).toFixed(2)} | gasto via tx R$${Number(incomeSnapshot.gastoReal).toFixed(2)} | média diária R$${Number(incomeSnapshot.mediaDiaria).toFixed(2)} (${incomeSnapshot.diasRestantes}d) | meta semanal R$${Number(incomeSnapshot.metaSemanal).toFixed(2)}` : '- Renda: sem ciclo configurado'}
${creditSnapshot ? `- Crédito: limite R$${Number(creditSnapshot.saldoOrigem).toFixed(2)} | usado (tx) R$${Number(creditSnapshot.gastoReal).toFixed(2)} | disponível R$${Number(creditSnapshot.saldoDisponivel).toFixed(2)}` : '- Crédito: sem limite configurado'}
${reservaSnapshot ? `- Reserva: acumulada R$${Number(reservaSnapshot.acumulada).toFixed(2)} | aporte do mês R$${Number(reservaSnapshot.aporte).toFixed(2)} | usado R$${Number(reservaSnapshot.usado).toFixed(2)} | disponível R$${Number(reservaSnapshot.disponivel).toFixed(2)}` : '- Reserva: sem saldo'}
${cycle ? `- Ciclo: ${cycle.start_date} → ${cycle.end_date} · reserva ${cycle.reserva_pct || 0}%` : ''}

## ITENS FIXOS (NUNCA PODEM SER ALTERADOS OU REMOVIDOS):
${fixedItems || 'Nenhum'}

## ITENS DO PLANEJAMENTO:
${(budgetItems || []).map(i => `- ${i.name} (${i.categories?.name || 'sem categoria'}): R$${i.planned_amount} ${i.is_fixed ? '[FIXO]' : ''}`).join('\n') || 'Nenhum'}

## TRANSAÇÕES DO MÊS:
${(transactions || []).slice(0, 20).map(t => `- ${t.date} | ${t.description}: R$${t.amount} (${t.type})`).join('\n') || 'Nenhuma transação ainda.'}

## METAS ATIVAS:
${(goals || []).filter(g => !g.is_completed).map(g => {
  return `- ${g.name}: R$${g.current_amount}/${g.target_amount} (prioridade ${g.priority || 1})`
}).join('\n') || 'Nenhuma meta.'}

## LEMBRETES A VENCER (próximos 10 dias):
${(upcomingBills || []).map(b => `- ${b.name}: R$${b.amount} vence em ${b.due_date} ${b.is_fixed ? '[FIXO]' : ''}`).join('\n') || 'Nenhum.'}

## REGRAS DE OURO:
1. NUNCA sugira alterar, remover ou reduzir valores de itens marcados como [FIXO].
2. Ao sugerir redistribuição de orçamento para uma meta, use apenas o saldo disponível de itens variáveis.
3. Quando o usuário relatar um gasto ou intenção de compra, faça perguntas de clarificação se necessário (valor, categoria, prazo).
4. Metas funcionam por **vínculo com transações**: o usuário lança uma \`transfer\` ou \`expense\` com \`goal_id=X\` pra somar/subtrair do saldo da meta. O app NÃO calcula automaticamente quanto guardar por mês. Sugira o valor-alvo da meta; o usuário decide quando e quanto guardar.
5. **payment_source é OBRIGATÓRIO** em add_transaction e add_budget_items (valores: "credit" | "fixed_income" | "variable_income" | "reserve"). Gastos no cartão de crédito = "credit"; pagos com salário/renda fixa = "fixed_income"; freelas/extras = "variable_income"; imprevistos/gastos não planejados que devem sair da reserva acumulada = "reserve". Em add_budget_items, NÃO use "reserve" (planejamento cobre apenas renda e crédito — a reserva é consumida direto via transação). Se o usuário não deixar claro, pergunte antes de emitir a ACTION.

   **Reserva**: o usuário tem um bucket de reserva que acumula mês a mês (acumulada + aporte do mês − usado = disponível). Quando ele disser "salvar na reserva", "tirar da reserva", "pagar com a reserva", "usar reserva" ou descrever um imprevisto que não deve afetar a média diária/semanal da renda, use payment_source: "reserve". Gastos na reserva NÃO entram no ritmo de gasto diário/semanal da renda. A reserva nunca pode ficar negativa — se o valor solicitado exceder o disponível, alerte antes de emitir a ACTION. Para AUMENTAR a reserva ("salvar na reserva", "guardar X na reserva"), isso é feito ajustando o % de aporte do ciclo na aba Planejamento (não via add_transaction) — oriente o usuário quando ele pedir isso.
6. Sempre que sugerir lançar dados, retorne um JSON estruturado NO FINAL da resposta, entre as tags <ACTION> e </ACTION>.

Para UM item:
{
  "type": "add_transaction" | "add_goal" | "add_bill" | "update_budget",
  "data": { "description": "...", "amount": 100, "type": "expense", "payment_source": "fixed_income" },
  "description": "Resumo legível da ação"
}

Exemplo de meta:
{
  "type": "add_goal",
  "data": { "name": "Placa de vídeo", "target_amount": 3500, "current_amount": 0, "priority": 2 },
  "description": "Meta: Placa de vídeo (R$ 3500 alvo)"
}

Para MÚLTIPLOS itens do mesmo tipo, use "items" como array:
{
  "type": "add_transaction",
  "data": { "items": [ {"description":"...", "amount": 100}, {"description":"...", "amount": 200} ] },
  "description": "Resumo legível"
}

7. Fale sempre em português brasileiro, de forma amigável e direta.
8. Use os snapshots de Renda/Crédito/Reserva para embasar recomendações sobre ritmo de gasto, ajuste de meta semanal e atingimento de metas.`
}

// ─── Chamada à Edge Function ─────────────────────────────────────────────────
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

// ─── Parsing da ACTION sugerida pela IA ──────────────────────────────────────
export function extractAction(text) {
  const match = text.match(/<ACTION>([\s\S]*?)<\/ACTION>/)
  if (!match) return null
  try { return JSON.parse(match[1].trim()) }
  catch { return null }
}

export function cleanText(text) {
  return text.replace(/<ACTION>[\s\S]*?<\/ACTION>/g, '').trim()
}