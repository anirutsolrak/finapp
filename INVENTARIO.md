# Inventário de Features — FinAPP

**Branch:** `auditoria-features`
**Data da auditoria:** 2026-05-07
**Escopo:** mapear cada feature existente no app (onde vive, o que faz, como usar, status atual). Base pra decidir o que consertar/manter/remover/criar antes da próxima frente de trabalho.

## Legenda de status

- ✅ **funciona** — implementado e operacional
- ⚠️ **funciona mas confuso** — operacional, mas UX/conceito precisa ajuste
- 🟡 **parcial** — implementado parcialmente ou subutilizado
- ❌ **quebrado** — não funciona ou produz dados ruins
- 💤 **dead-code** — existe no código mas ninguém consome

## Stack

- **React 19** + **Vite 8** + **Tailwind 3** + **PWA** (vite-plugin-pwa)
- **Supabase** (Auth + Postgres + Edge Functions + Realtime)
- **date-fns**, **lucide-react**, **recharts**
- **Anthropic Claude** via Edge Function (`claude-proxy`)

## Roteamento

Todas as rotas autenticadas vivem dentro do `<Layout>` em [src/App.jsx](src/App.jsx). `/login` é pública. Sidebar (desktop) e bottom-tab (mobile) definidos em [src/components/layout/Layout.jsx](src/components/layout/Layout.jsx).

| Rota | Página | No menu? |
|---|---|---|
| `/` | DashboardPage | sidebar + bottom-tab |
| `/transactions` | TransactionsPage | sidebar + bottom-tab |
| `/lista` | ListaPage | sidebar + bottom-tab |
| `/budget` | BudgetPage | sidebar + bottom-tab |
| `/bills` | BillsPage | sidebar + bottom-tab |
| `/goals` | GoalsPage | só sidebar |
| `/chat` | ChatPage | só sidebar |
| `/settings` | SettingsPage | só sidebar (mobile via ícone no header do Dashboard) |
| `/login` | LoginPage | n/a |

---

# 1. Início (`/` — DashboardPage)

Arquivo: [src/pages/DashboardPage.jsx](src/pages/DashboardPage.jsx)

| Feature | Onde | O que faz | Como usar | Status | Obs |
|---|---|---|---|---|---|
| Saudação + mês corrente | DashboardPage:118-131 | Mostra "Olá, {nome}" + mês de referência | Automático ao logar | ✅ | - |
| Botão IA → /chat | DashboardPage:124 | Atalho pro chat | Click | ✅ | - |
| Botão Configurações (mobile) | DashboardPage:127 | Atalho `/settings` no header (só `md:hidden`) | Click | ✅ | - |
| Alerta "Contas próximas" | DashboardPage:134-146 | Lista até 3 bills não-pagas com indicador de urgência (vermelho ≤1d, âmbar ≤3d) | Aparece automático se houver bills pendentes | ✅ | Botão "Ver todas" linka pra `/bills` |
| Card Saldo atual | DashboardPage:157-163 | Mostra `cycle.saldo_origem_income` | Auto. User edita via Configurar Ciclo no Planejamento | ⚠️ | Sub-label "você atualiza no Planejamento" — fluxo manual de atualização confunde, é fácil esquecer |
| Card Reservado | DashboardPage:165-170 | `saldo_origem × reserva%` | Auto | ✅ | - |
| Card Disponível pra gastar | DashboardPage:172-178 | `saldoDisponivel = saldo_origem × (1 − reserva%)` | Auto | ⚠️ | Depende do user manter `saldo_origem` correto |
| Card Bills pagas no mês | DashboardPage:180-185 | Soma de `bills.is_paid` no bucket renda do mês corrente | Auto | ⚠️ | Mostra 6.6k mesmo com saldo de 800 — dois universos misturados visualmente |
| Botão "Fechar semana" | DashboardPage:152 | Abre WeeklyCheckpointModal | Click toda segunda-feira (em tese) | 💤 | **0 registros no banco**. Conceito frouxo, ninguém usa |
| Card Crédito (Limite/Usado/Disp/% comp.) | DashboardPage:~196-220 | StatCards do bucket crédito | Auto | ⚠️ | "Usado" mostra `gastoReal` (só tx); confunde porque saldo conta bills + tx |
| Drawer "Ritmo · Reserva · Metas" | DashboardPage (final) | Trigger único na base que abre painel com 3 cards (semana corrente, reserva detalhada, metas resumidas) | Click no rodapé → painel slide-up (mobile) ou modal centralizado (desktop) | ✅ | Implementado recente, funciona bem |
| Card Ritmo da semana (dentro drawer) | DashboardPage | gastou X / metaSemanal, status verde/amarelo/vermelho, barra | Auto | ✅ | Compara `gastoSemanaRenda` (seg→hoje, só bucket renda) com `metaSemanal` |
| Card Reserva (dentro drawer) | DashboardPage | Disponível / Usado / Acumulada / Aporte | Auto | ✅ | - |
| Card Metas resumido (dentro drawer) | DashboardPage | Top 3 metas com progresso + link "Ver todas" | Auto | ✅ | - |
| Configure ciclo (CTA quando sem ciclo) | DashboardPage | Banner amber pedindo configurar | Aparece se `cycle === null` | ✅ | Linka pra `/budget` |
| `checkpointChart` useMemo | DashboardPage:95-103 | Computa dados pro chart Previsto×Real | n/a | 💤 | Computado mas o **JSX que renderizava o BarChart foi removido**. Computação fica órfã — pode deletar |
| Imports `BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, Tooltip, ResponsiveContainer, Cell` | DashboardPage:8 | recharts | n/a | 💤 | Imports órfãos depois da remoção do chart |

---

# 2. Lançamentos (`/transactions` — TransactionsPage)

Arquivo: [src/pages/TransactionsPage.jsx](src/pages/TransactionsPage.jsx)

| Feature | Onde | O que faz | Como usar | Status | Obs |
|---|---|---|---|---|---|
| Header + botão "Novo" | TransactionsPage:246-251 | Abre TxModal vazio | Click + Novo | ✅ | - |
| Navegação por mês | TransactionsPage:178-179, 254-258 | `prevMonth/nextMonth` mudam `monthRef` | Setas em volta do label | ✅ | Usa `parseISO(monthRef + '-01')` pra evitar bug timezone |
| Card "Ritmo de gasto" (diário/semanal) | TransactionsPage:261-276 | StatusDot + BudgetVsSpent (gastoHoje vs orçamento, gastoSemana vs metaSemanal) | Auto, só aparece se `isCurrentMonth && cycle` | ⚠️ | Filtra só `expense` no bucket `income` — ignora despesas de crédito/reserva (esse design é proposital mas pouco óbvio) |
| Card Transferido + Investido | TransactionsPage:279-302 | Total transferido/investido no mês + breakdown por categoria | Auto, só aparece se houver | ✅ | - |
| Card Consolidado (Entrou/Saiu/Líquido) | TransactionsPage:305-320 | Soma `income`, `expense`, mostra líquido | Auto | ⚠️ | Filtra por mês calendário (não pelo ciclo 15-15). Fica negativo absurdo se user só lança despesas |
| Filtro por tipo | TransactionsPage:323-330 | Chips Todos/Receita/Despesa/Investimento/Transferência | Click | ✅ | - |
| Lista de tx | TransactionsPage:333-367 | Cada tx com data, type chip, payment_source chip, categoria, badge "Pendente" se `!is_paid`, valor com sinal, edit/delete | Click no edit/delete | ✅ | - |
| TxModal (criar/editar tx) | TransactionsPage:57-166 | Form com tipo (Receita/Despesa/Investimento/Transferência), descrição, valor, data, categoria, payment_source, notas, "Já pago/recebido" | Botão Novo ou Edit | ⚠️ | **Tipo "Receita" existe e funciona**, mas user esquece de lançar receitas. Não tem campo "Account" nem "Vincular meta" (era da frente Pluggy) |
| Validação de reserva | TransactionsPage:67-75 | Bloqueia despesa em `reserve` se exceder disponível | Auto ao salvar | ✅ | - |
| Aviso reserva no modal | TransactionsPage:138-142 | Mostra disponível da reserva quando seleciona `reserve` | Auto | ✅ | - |
| Categorias no modal | TransactionsPage:124-128 | Select de `categories` da DB | Click | ⚠️ | Sem mostrar `type` da categoria — fácil escolher categoria errada (essencial vs variável vs receita) |
| Imports `useCallback` (não em uso?) | n/a | - | - | n/a | - |

---

# 3. Planejamento (`/budget` — BudgetPage)

Arquivo: [src/pages/BudgetPage.jsx](src/pages/BudgetPage.jsx)

| Feature | Onde | O que faz | Como usar | Status | Obs |
|---|---|---|---|---|---|
| Header com título + botões | BudgetPage:302-318 | Refresh, Configurar ciclo (settings icon), + Novo | Clicks | ✅ | - |
| Botão Refresh | BudgetPage:308-310 | Refaz fetch de items/cycle/tx/bills | Click no ícone redondo | ✅ | Útil quando dados não atualizam sozinhos |
| Botão Configurar ciclo | BudgetPage:311-313 | Abre CycleModal | Click | ✅ | - |
| Tabs Renda/Crédito/Histórico | BudgetPage:321-335 | Troca o bucket exibido | Click | ⚠️ | Tab "Histórico" mostra checkpoints — mas estão zerados ⇒ vazio sempre |
| SnapshotCard (Renda ou Crédito) | BudgetPage:203-237 | Card com saldo origem, gasto real, disponível, % comprometido (crédito) ou média/meta (renda), linha extra com reserva | Auto | ⚠️ | Renda: mostra "Gasto real" (só tx) — não considera bills pagas. Confuso versus card de Bills no Dashboard |
| Resumo da aba (Receita/Despesas/Balanço) | BudgetPage:351-364 | 3 mini-cards somando `planned_amount` por tipo | Auto | ✅ | - |
| Lista de Receitas (planejado) | BudgetPage:382-395 | Lista income items do bucket atual | Auto | ✅ | - |
| Lista de Despesas por categoria | BudgetPage:397-430 | Items agrupados por categoria, com badge `is_fixed`, dia de vencimento, edit/delete | Click | ✅ | - |
| ItemModal (criar/editar item) | BudgetPage:19-121 | Form com categoria, payment_source, nome, valor planejado, dia de vencimento (se despesa), recorrência, notas, fixo | Botão + Novo ou Edit | ✅ | - |
| CycleModal (Configurar ciclo) | BudgetPage:123-201 | Form com start_date, end_date, saldo_origem_income, saldo_origem_credit, reserva_pct | Click no Settings | ⚠️ | Strip de campos gerados está OK. Default `start_date` = primeiro do mês corrente — não bate com ciclo 15-15 |
| Tab Histórico (fechamentos semanais) | BudgetPage:339-359 | Lista checkpoints do ciclo | Auto | 💤 | Nenhum checkpoint registrado. Fica sempre vazio |
| `useCheckpoints(40)` | BudgetPage:259 | Hook fetcha 40 checkpoints | Auto | 💤 | Só serve pra alimentar a tab Histórico vazia |

---

# 4. Agenda de pagamentos (`/bills` — BillsPage)

Arquivo: [src/pages/BillsPage.jsx](src/pages/BillsPage.jsx)

| Feature | Onde | O que faz | Como usar | Status | Obs |
|---|---|---|---|---|---|
| Header + botão Manual | BillsPage:193-207 | Toggle de view + + Manual | Click | ✅ | - |
| Toggle view (mês/acordeão) | BillsPage:199-202 | Alterna entre vista mensal e acordeão de todos os meses | Ícone LayoutList/Calendar | ✅ | - |
| Navegação mensal + resumo (Total/Pago/Pendente) | BillsPage:212-232 | Setas + label do mês + 3 mini-cards | Click setas | ✅ | - |
| Filtro Todos/Pendentes/Pagos | BillsPage:235-242 | Chips de filtro | Click | ✅ | - |
| Lista BillRow | BillsPage:20-49 | Cada bill com check toggle, status colorido (urgente/atrasado/normal/pago), badges (fixo, link com Planejamento), edit/delete | Click no check pra marcar pago, edit/delete na direita | ✅ | Bills geradas pelo Planejamento (FK `budget_item_id`) só permitem delete via Planejamento |
| Visão acordeão (todos os meses) | BillsPage:264-284 | Agrupa por month_ref com totais, expandível | Click no toggle | ✅ | Default expandido = mês corrente |
| ManualModal | BillsPage:80-135 | Form pra lembrete avulso (sem vínculo Planejamento) | Botão + Manual | ✅ | - |
| Indicador `urgentCount` | BillsPage:164-167, 196 | Conta bills com `due_date ≤ 3 dias` e não pagas | Auto | ✅ | - |
| Geração automática de bills do Planejamento | (db.js + provavelmente trigger Supabase) | Itens do Planejamento com `due_day` viram bills mensais | Auto via Planejamento | ⚠️ | Não consegui verificar 100% se gera só do mês corrente ou ciclo. Dependência de trigger SQL |

---

# 5. Metas (`/goals` — GoalsPage)

Arquivo: [src/pages/GoalsPage.jsx](src/pages/GoalsPage.jsx)

| Feature | Onde | O que faz | Como usar | Status | Obs |
|---|---|---|---|---|---|
| Header com saldo livre | GoalsPage:236-243 | Mostra freeBalance + botão Nova meta | Auto | ✅ | freeBalance vem de `computeFreeBalance(budgetItems)` — apenas planejamento, ignora saldo real |
| GoalModal (criar/editar) | GoalsPage:27-147 | Form com nome, descrição, valor alvo, já guardado, agressividade (5 níveis), prioridade, fixa | Click + Nova | ⚠️ | `current_amount` é editável manual — não é derivado de tx vinculadas |
| Plano calculado (preview) | GoalsPage:35-44, 104-122 | Mostra `monthly_contribution`, `total_months`, `target_date` baseado em `agressividade × freeBalance` | Auto ao preencher | ⚠️ | Se freeBalance ≤ 0 mostra warning amber. Mas freeBalance fica ruim quando user não cadastra income items no Planejamento |
| Lista de metas ativas | GoalsPage:254-300 | Card por meta com nome, fixa, prioridade, agressividade, progresso, dots, mensal/meses/data alvo | Auto | ✅ | - |
| GoalDots (marcar mês como pago) | GoalsPage:149-178 | Bolinha por mês — clicáveis em ordem | Click no próximo dot disponível | ⚠️ | Avança `months_completed` + soma `monthly_contribution` ao `current_amount`. **Não vincula tx real** |
| markDot (avançar/voltar mês) | GoalsPage:200-228 | Lógica de avanço/retrocesso dos dots | Click | ⚠️ | Inconsistência: separar dinheiro pra meta na vida real (lançar transferência) **não** atualiza meta. User precisa clicar dot manualmente |
| Toggle concluída + botão Reabrir | GoalsPage:195-198, 273, 309 | Marca/desmarca `is_completed` | Click | ✅ | - |
| Lista de metas concluídas | GoalsPage:302-315 | Cards opacos com botão Reabrir | Auto | ✅ | - |

---

# 6. Lista (`/lista` — ListaPage)

Arquivo: [src/pages/ListaPage.jsx](src/pages/ListaPage.jsx) (recente, frente "todo-finapp-integration")

| Feature | Onde | O que faz | Como usar | Status | Obs |
|---|---|---|---|---|---|
| Header + contador "aguardando importação" | ListaPage:276-308 | Conta items `done && !imported_at` | Auto | ✅ | - |
| Listagem agrupada por categoria | ListaPage:310-405 | Items vindos do schema `todo` agrupados por `category` | Auto | ✅ | Schema externo `todo.items` (presumivelmente outro app/lista) |
| Status do item (pending/ready/imported) | ListaPage:15-19 | Pending=square cinza; Ready=square colorido (selecionável); Imported=check + line-through + opacity | Auto | ✅ | - |
| Seleção múltipla (ready) | ListaPage:249-257, 339-348 | Checkboxes em items ready, "Selecionar todos prontos" | Click | ✅ | - |
| Notas expandíveis | ListaPage:259-264, 374-389 | Toggle notas longas | Click no chevron | ✅ | - |
| ImportModal — 3 passos | ListaPage:21-204 | Wizard: 1) datas, 2) categorias, 3) confirmar | Botão "Importar (N)" | ✅ | - |
| Validação fora do período | ListaPage:38-44, 50-51, 105-111 | Marca item com data > `cycle.end_date` como inválido pra importação | Auto | ✅ | Útil pra impedir tx em ciclo errado |
| Categorias custom por item (passo 2) | ListaPage:131-169 | Toggle entre "Usar padrão" (variable) e "Definir por item" | Click | ✅ | - |
| doImport (cria tx + marca todo importado) | ListaPage:54-79 | Loop: addTransaction → markTodoImported (atualiza `imported_at` + `finapp_transaction_id`) | Click "Confirmar" | ✅ | - |
| `addTransaction` hardcoded `payment_source: 'fixed_income'` | ListaPage:65 | Toda tx importada vai pra renda fixa | Auto | ⚠️ | Não dá pra escolher payment_source na importação |

---

# 7. Assistente IA (`/chat` — ChatPage)

Arquivo: [src/pages/ChatPage.jsx](src/pages/ChatPage.jsx) + [src/lib/claude.js](src/lib/claude.js)

| Feature | Onde | O que faz | Como usar | Status | Obs |
|---|---|---|---|---|---|
| Mensagem de boas-vindas | ChatPage:152-159 | Mostra na primeira sessão (sem histórico) | Auto | ✅ | - |
| Carregar histórico (últimas 40 msgs) | ChatPage:144-162 | `getChatMessages(user.id, 40)` | Auto | ✅ | - |
| Quick prompts | ChatPage:124-130, 405-414 | 5 botões com sugestões prontas | Click | ✅ | - |
| Input + envio (Enter / Shift+Enter) | ChatPage:352-354, 416-438 | textarea autogrow, envia ao Enter | Tecla / botão | ✅ | - |
| sendMessage (loop completo) | ChatPage:168-217 | salva user msg → buildSystemPrompt + getAIContext → sendToClaudeAPI → extractAction → render+save aiMsg | Auto | ✅ | - |
| ActionCard (proposta de ação da IA) | ChatPage:46-97 | Renderiza ação detectada (add_transaction, add_goal, add_bill, update_budget, add_budget_items, record_checkpoint) com botões Aprovar/Ignorar | Click | ⚠️ | record_checkpoint depende de cycle + cria checkpoints (zerados no banco) |
| Mensagem com bubble + timestamp | ChatPage:99-122 | User vs assistente com avatar | Auto | ✅ | - |
| Indicador "digitando" | ChatPage:11-19, 393-400 | TypingDot animado | Auto | ✅ | - |
| Approve action (multiplos types) | ChatPage:219-350 | Lógica complexa pra cada tipo: mapeia campos da IA → schema do banco, valida, executa | Click "Aprovar" | ⚠️ | Mapeia muitos aliases ("description"→"name", "amount"→"value", etc.). Frágil se IA mudar formato |
| toGoal: agressividade computa plano | ChatPage:283-307 | Se IA mandar `aggressiveness`, calcula plano automaticamente | Auto | ✅ | - |
| Limpar histórico | ChatPage:356-361, 376-378 | `clearChat(user.id)` + reset state | Click no Trash do header | ✅ | - |
| Edge Function `claude-proxy` | n/a (server-side) | Recebe `{messages, system}` e proxia pra Anthropic API | n/a | ✅ | Sem chave no client. Tratamento de erros traduzido em claude.js |
| `buildSystemPrompt` | claude.js:8-103 | Monta prompt gigante com contexto: orçamento, buckets, modelo de cálculo, items, tx, metas, bills, regras | Auto | ⚠️ | Já tem seção "Modelo de cálculo (importante)" explicando saldo_origem como saldo atual + cutoff. Sólido |
| extractAction / cleanText | claude.js:131-140 | Parse de `<ACTION>{...}</ACTION>` e remoção do bloco do texto | Auto | ✅ | - |

---

# 8. Configurações (`/settings` — SettingsPage)

Arquivo: [src/pages/SettingsPage.jsx](src/pages/SettingsPage.jsx)

| Feature | Onde | O que faz | Como usar | Status | Obs |
|---|---|---|---|---|---|
| Editar perfil (nome) | SettingsPage:30-45 | Input para `profile.full_name` | Edit + Save | ✅ | - |
| Mostrar e-mail (só leitura) | SettingsPage:36-39 | Display do `user.email` | n/a | ✅ | - |
| E-mail de alerta de vencimento | SettingsPage:40-44 | Input pra `notify_email` | Edit + Save | 🟡 | Persiste no banco mas **sem evidência** de que algum cron/trigger envia e-mails |
| Card "Instalar PWA" (instruções) | SettingsPage:48-56 | Texto estático com passos | Leitura | ✅ | - |
| Card Segurança (texto sobre Edge Function) | SettingsPage:59-62 | Disclaimer | Leitura | ✅ | - |
| Salvar configurações | SettingsPage:64-67, 16-23 | UPDATE em `profiles` + refresh do contexto | Click | ✅ | - |

---

# 9. Login (`/login` — LoginPage)

Arquivo: [src/pages/LoginPage.jsx](src/pages/LoginPage.jsx)

| Feature | Onde | O que faz | Como usar | Status | Obs |
|---|---|---|---|---|---|
| Toggle Login/Cadastrar | LoginPage:54-60 | Tabs internas | Click | ✅ | - |
| Form de login | LoginPage:63-101 | Email + senha + show/hide senha | Submit | ✅ | - |
| Form de cadastro | LoginPage:64-69 (extra: nome) | Adiciona campo nome | Submit | ✅ | - |
| Tradução de erros Supabase | LoginPage:33-40 | Map de erros conhecidos pra português | Auto | ✅ | - |
| Mensagem de confirmação por e-mail | LoginPage:88-93 | Banner verde se cadastro precisa confirmar e-mail | Auto | ✅ | - |
| Dica sobre confirmação de e-mail | LoginPage:110-116 | Link/instrução pro Supabase Dashboard | Leitura | ✅ | - |

---

# 10. Layout / PWA / Auth (infra global)

| Feature | Onde | O que faz | Como usar | Status | Obs |
|---|---|---|---|---|---|
| Sidebar desktop | Layout.jsx:30-58 | Menu lateral com 8 items + botão Sair no rodapé | Click | ✅ | - |
| Bottom tab bar (mobile) | Layout.jsx:67-85 | 5 atalhos (Início, Lançamentos, Lista, Agenda, Planejamento) | Click | ✅ | Goals/Chat/Settings ficam fora — só sidebar. Settings tem atalho no header do Dashboard |
| AuthProvider | AuthContext.jsx | Gerencia user/profile/session, signIn/signUp/signOut | useAuth() em qualquer page | ✅ | - |
| Fetch profile automático | AuthContext.jsx:25-28 | Carrega `profiles` row ao logar | Auto | ✅ | - |
| InstallPrompt (PWA) | components/InstallPrompt.jsx | Banner topo pra Android (beforeinstallprompt) ou iOS (instrução manual) | Auto, dismissable por sessão | ✅ | sessionStorage `pwa-install-dismissed` |
| UpdatePrompt (PWA) | components/UpdatePrompt.jsx | Banner inferior quando há nova versão do SW | Click "Atualizar" | ✅ | Auto-checa a cada 1h + ao ficar visível |
| WeeklyCheckpointModal | components/WeeklyCheckpointModal.jsx | Modal pra registrar saldo real semanal | Aberto pelo botão "Fechar semana" no Dashboard | 💤 | **0 registros no banco**. Conceito do "previsto" muda toda vez que tx é lançada — comparação real×previsto sem âncora |

---

# 11. Hooks / Estado

Arquivo: [src/hooks/useData.js](src/hooks/useData.js)

| Hook | O que faz | Status | Obs |
|---|---|---|---|
| `useMonthRef()` | State local de monthRef (default = mês corrente) | ✅ | Cada page tem o seu — não compartilhado |
| `useDashboard(monthRef)` | Fetcha bills + goals + items + cycle + tx + checkpoints + subscribe realtime em 5 tabelas | ✅ | Útil mas pesado: 5 canais de realtime na mesma chamada |
| `useTransactions(monthRef)` | Fetcha tx + realtime channel `tx` | ✅ | - |
| `useBills(monthRef)` | Fetcha bills do mês + allBills + realtime | ✅ | - |
| `useGoals()` | Fetcha goals (sem filtro mês) | ✅ | - |
| `useBudgetItems()` | Fetcha items + categorias + realtime | ✅ | - |
| `useBudgetCycle(monthRef)` | Fetcha cycle do mês + realtime | ✅ | - |
| `useCheckpoints(limit)` | Fetcha checkpoints + realtime | 💤 | Tabela vazia, hook ainda chamado em BudgetPage |

---

# 12. Lib / Engine

| Arquivo | Exports principais | O que faz | Status | Obs |
|---|---|---|---|---|
| [src/lib/supabase.js](src/lib/supabase.js) | `supabase` | createClient com VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY | ✅ | - |
| [src/lib/db.js](src/lib/db.js) | ~25 funções (getCategories, addTransaction, getBills, etc.) | API uniforme sobre Supabase | ✅ | Sem getMonthSummary, liveHealth, reseedBudgetCycle (limpos no f376701) |
| [src/lib/budgetEngine.js](src/lib/budgetEngine.js) | `computeBucketSnapshot`, `computeReservaSnapshot`, `bucketOf`, `healthStatus`, `isoWeekBounds`, constantes | Cálculos puros do modelo | ✅ | `healthStatus` só usada por WeeklyCheckpointModal e ChatPage record_checkpoint (ambos 💤) |
| [src/lib/goalPlanner.js](src/lib/goalPlanner.js) | `computeFreeBalance`, `computeGoalPlan`, AGGRESSIVENESS_* | freeBalance baseado só em planejamento | ⚠️ | Ignora saldo real do ciclo — sugestão de aporte pode ser descalibrada |
| [src/lib/claude.js](src/lib/claude.js) | `buildSystemPrompt`, `sendToClaudeAPI`, `extractAction`, `cleanText` | Cliente da Edge Function + prompt builder | ✅ | Ainda passa `lastCheckpoints` pro contexto (vazio sempre) |
| [src/lib/todo.js](src/lib/todo.js) | `getTodoItems`, `markTodoImported` | Acesso ao schema `todo` (Supabase schema separado) | ✅ | Schema externo do app de lista |

---

# 13. Banco de dados (migrations aplicadas)

Arquivos SQL na raiz, aplicados manualmente via Supabase Dashboard SQL Editor:

| Migration | O que adiciona | Status |
|---|---|---|
| `migration_credit_and_checkpoints.sql` | (precisa abrir pra ver — provavelmente: payment_source nas tx, weekly_checkpoints table) | ✅ |
| `migration_goals_and_monthref.sql` | Goals + month_ref nas transações | ✅ |
| `migration_reserva_acumulada.sql` | Coluna reserva_acumulada em budget_cycles | ✅ |
| `migration_todo_integration.sql` | Coluna `done_at`/`imported_at`/`finapp_transaction_id` no `todo.items` | ✅ |

Tabelas ativas: `auth.users`, `profiles`, `categories`, `budget_items`, `budget_cycles`, `transactions`, `bills`, `goals`, `chat_messages`, `weekly_checkpoints` (vazia), `todo.items` (schema separado).

---

# 14. Tooling / Scripts

| Arquivo | O que faz | Status |
|---|---|---|
| [scripts/audit.py](scripts/audit.py) | Replica `computeBucketSnapshot` em Python, busca dados via Supabase REST e imprime JSON com KPIs do app | ✅ |
| [scripts/audit.ps1](scripts/audit.ps1) | Wrapper PowerShell que carrega `.env.local` e invoca `audit.py` | ✅ |
| [scripts/README.md](scripts/README.md) | Doc do uso do audit | ✅ |
| [AUDIT.md](AUDIT.md) | Guia rápido pra rodar auditoria de cálculos | ✅ |

---

# 15. Categorias no banco (a verificar)

User mencionou que existem "Receita" e "Receita extra" como categorias. Não rodei query — vale conferir antes de propor mudanças.

```sql
SELECT id, name, type, icon, sort_order FROM categories ORDER BY type, sort_order;
```

---

# Pontos críticos identificados (resumo executivo)

## Coisas que funcionam mas são subutilizadas/confusas

1. **Receita no TxModal** — feature existe, user esquece de lançar. Sem nudge, sem reminder. **Talvez resolva com:** dashboard mostrar "última receita lançada há X dias" ou checklist mensal.
2. **categoria type no TxModal** — não mostra qual o tipo da categoria, fácil escolher "Variável" pra uma despesa essencial. **Talvez resolva com:** chip do type ao lado do nome no dropdown, ou agrupar por tipo.
3. **Filtros por mês calendário em TransactionsPage** — não bate com ciclo 15-15. **Talvez resolva com:** toggle "Mês / Ciclo" ou trocar default pra ciclo.
4. **freeBalance ignora saldo real** — `computeFreeBalance` usa só planejamento. **Talvez resolva com:** opção de usar saldo_origem.

## Dead code (candidato a remover)

5. **WeeklyCheckpointModal + tab Histórico do Planejamento + record_checkpoint da IA + useCheckpoints + healthStatus + chart Previsto×Real** — fluxo completo de checkpoint nunca foi adotado (0 registros). Removendo zera ~300 linhas de superfície.
6. **`checkpointChart` useMemo + imports recharts (BarChart, etc.) em DashboardPage** — computação órfã depois que removemos o card.

## Vínculos quebrados conceitualmente

7. **Meta vs transação** — separar dinheiro pra meta (lançar transferência) não atualiza meta. User precisa clicar dot manualmente. Se gastar o "separado" em outra coisa, meta segue achando que tá guardado.
8. **Bills pagas no mês × Saldo atual** — visualmente parece "gastei 6.6k com só 800 em conta". Concepts diferentes em cards próximos.
9. **payment_source só do tipo, não da conta** — não distingue NuBank crédito × PicPay crédito. PicPay tem 3 plásticos sob mesma fatura, app não vê.

## Auditoria de dados (proposta)

10. **CSV NuBank vs tx no app** — comparar pra detectar tx faltando, valores divergentes, tx no app sem correspondente no extrato.
