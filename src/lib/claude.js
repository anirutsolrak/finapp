import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const CLAUDE_MODEL = 'claude-sonnet-4-20250514'
const EDGE_FN_URL = 'https://vzbswcoogdarlzqstumy.supabase.co/functions/v1/claude-proxy'
const SUPABASE_ANON_KEY = 'sb_publishable_ynzrEH34nzVwEMp0m_7BZg_8ZZDB9yg'

export function buildSystemPrompt(context, userName) {
  const { monthRef, budgetItems, transactions, goals, upcomingBills, freeBalance = 0, cycle, incomeSnapshot, creditSnapshot, reservaSnapshot, health, lastCheckpoints = [] } = context
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

## BUCKETS (RENDA vs CRÉDITO vs RESERVA)
**Modelo de cálculo (importante):**
- Renda: \`saldo_origem_income\` = SALDO ATUAL em conta (líquido, não receita total). O usuário atualiza esse valor manualmente em Configurar ciclo quando quer forçar recálculo.
- Disponível pra gastar = saldo_origem × (1 − reserva%). NÃO se subtrai gasto/bills daqui — o saldo já é líquido.
- Média diária = disponível ÷ dias_restantes_até_fim_do_ciclo.
- Recálculo da média/meta semanal **trava no último domingo** — entre domingos os valores ficam constantes; viram só na virada de semana ou quando o usuário edita o ciclo.
- Crédito: \`saldoDisponivel\` = limite − committed (committed = max(planned, bills, tx) por item + adhoc tx).
- Reserva: acumulada (rollover) + aporte (saldo_origem × reserva%) − usado (tx com payment_source=reserve).

**Snapshot atual:**
${incomeSnapshot ? `- Renda: saldo atual R$${Number(incomeSnapshot.saldoOrigem).toFixed(2)} | reservado R$${Number(incomeSnapshot.reserva).toFixed(2)} | disponível R$${Number(incomeSnapshot.saldoDisponivel).toFixed(2)} | gasto via tx R$${Number(incomeSnapshot.gastoReal).toFixed(2)} | média diária R$${Number(incomeSnapshot.mediaDiaria).toFixed(2)} (${incomeSnapshot.diasRestantes}d) | meta semanal R$${Number(incomeSnapshot.metaSemanal).toFixed(2)}` : '- Renda: sem ciclo configurado'}
${creditSnapshot ? `- Crédito: limite R$${Number(creditSnapshot.saldoOrigem).toFixed(2)} | usado (tx) R$${Number(creditSnapshot.gastoReal).toFixed(2)} | disponível R$${Number(creditSnapshot.saldoDisponivel).toFixed(2)}` : '- Crédito: sem limite configurado'}
${reservaSnapshot ? `- Reserva: acumulada R$${Number(reservaSnapshot.acumulada).toFixed(2)} | aporte do mês R$${Number(reservaSnapshot.aporte).toFixed(2)} | usado R$${Number(reservaSnapshot.usado).toFixed(2)} | disponível R$${Number(reservaSnapshot.disponivel).toFixed(2)}` : '- Reserva: sem saldo'}
${health ? `- Saúde atual: ${health.status === 'green' ? '🟢 no ritmo' : health.status === 'yellow' ? '🟡 na meta' : '🔴 estouro'} (gasto R$${Number(health.gastoReal).toFixed(2)} · previsto p/ hoje R$${Number(health.previstoHoje).toFixed(2)})` : ''}
${cycle ? `- Ciclo: ${cycle.start_date} → ${cycle.end_date} · reserva ${cycle.reserva_pct || 0}%` : ''}

## ÚLTIMOS CHECKPOINTS SEMANAIS
${lastCheckpoints.slice(0, 4).map(c => `- ${c.week_start}→${c.week_end} [${c.bucket}] previsto R$${Number(c.saldo_previsto).toFixed(2)} · real R$${Number(c.saldo_real).toFixed(2)} · ${c.status}${c.note ? ` · "${c.note}"` : ''}`).join('\n') || '- Nenhum registrado ainda.'}

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
5. **payment_source é OBRIGATÓRIO** em add_transaction e add_budget_items (valores: "credit" | "fixed_income" | "variable_income" | "reserve"). Gastos no cartão de crédito = "credit"; pagos com salário/renda fixa = "fixed_income"; freelas/extras = "variable_income"; imprevistos/gastos não planejados que devem sair da reserva acumulada = "reserve". Em add_budget_items, NÃO use "reserve" (planejamento cobre apenas renda e crédito — a reserva é consumida direto via transação). Se o usuário não deixar claro, pergunte antes de emitir a ACTION.

   **Reserva**: o usuário tem um bucket de reserva que acumula mês a mês (acumulada + aporte do mês − usado = disponível). Quando ele disser "salvar na reserva", "tirar da reserva", "pagar com a reserva", "usar reserva" ou descrever um imprevisto que não deve afetar a média diária/semanal da renda, use payment_source: "reserve". Gastos na reserva NÃO entram no ritmo de gasto diário/semanal da renda. A reserva nunca pode ficar negativa — se o valor solicitado exceder o disponível, alerte antes de emitir a ACTION. Para AUMENTAR a reserva ("salvar na reserva", "guardar X na reserva"), isso é feito ajustando o % de aporte do ciclo na aba Planejamento (não via add_transaction) — oriente o usuário quando ele pedir isso.
6. Sempre que sugerir lançar dados, retorne um JSON estruturado NO FINAL da resposta, entre as tags <ACTION> e </ACTION>.

Para UM item:
{
  "type": "add_transaction" | "add_goal" | "add_bill" | "update_budget" | "record_checkpoint",
  "data": { "description": "...", "amount": 100, "type": "expense", "payment_source": "fixed_income" },
  "description": "Resumo legível da ação"
}

Para fechar a semana (checkpoint):
{
  "type": "record_checkpoint",
  "data": { "bucket": "income" | "credit" | "reserve", "saldo_real": 3200, "week_start": "2026-04-06", "note": "opcional" },
  "description": "Fecha a semana com saldo real informado"
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

7. Fale sempre em português brasileiro, de forma amigável e direta.
8. Use os snapshots de Renda/Crédito/Reserva e os checkpoints recentes para embasar recomendações sobre ritmo de gasto, ajuste de meta semanal e atingimento de metas.`
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