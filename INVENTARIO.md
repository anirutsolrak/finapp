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
| Card Bancos (agregado) | DashboardPage (Onda 4) | Soma do saldo derivado das contas `type=bank` (opening_balance + entradas − saídas) | Auto. Click abre drawer com breakdown por conta | ✅ | Onda 4 — substitui Saldo atual manual |
| Card Cartões (agregado) | DashboardPage (Onda 4) | Soma `usado / limite` das contas `type=credit subtype=credit_card` | Auto. Click abre drawer | ✅ | Onda 4 |
| Card Empréstimos | DashboardPage (Onda 4) | Soma da dívida do ciclo das contas `type=credit subtype=loan` (Biplay) | Auto. Click abre drawer | ✅ | Onda 4 |
| Card Envelope | DashboardPage (Onda 4) | Saldo do envelope (entradas − saídas) | Auto. Click abre drawer | ✅ | Onda 4 |
| Drawer drill-down por grupo | components/AccountGroupDrawer.jsx | Lista contas do grupo com saldo individual + breakdown (entradas/saídas pra bank/envelope; usado/limite/% pra credit) | Click num dos 4 cards | ✅ | Onda 4 |
| Card Disponível pra gastar | DashboardPage (Onda 4) | `saldoOrigem × (1 − reserva%)` com saldoOrigem agora derivado da soma dos bancos | Auto, só aparece se ciclo + saldo > 0 | ✅ | Onda 4 — saldo não é mais manual |
| Card Reservado | DashboardPage | `saldo_origem × reserva%` (saldoOrigem agora derivado) | Auto | ✅ | Onda 4 — re-derivado |
| Card Bills pagas no mês | DashboardPage | Soma de `bills.is_paid` no bucket renda do mês corrente | Auto | ✅ | Onda 4 — agora dentro da seção "Disponível pra gastar" |
| Card % comprometido cartões | DashboardPage (Onda 4) | Σ usado_cartões / Σ credit_limit (cor verde/âmbar/vermelho conforme %) | Auto | ✅ | Onda 4 — substitui % comprometido global |
| Botão 💵 "Pagar" (Cartões/Empréstimos) | DashboardPage (Onda 5) | Ícone $ no canto sup. direito dos cards Cartões e Empréstimos abre PayBillsModal | Click no 💵 (não no resto do card) | ✅ | Onda 5 — `stopPropagation` separa do click no drawer |
| PayBillsModal | components/PayBillsModal.jsx | Modal pra pagar fatura: select banco origem + lista contas-alvo (checkbox + valor) + datepicker → cria 1 transfer por linha marcada | Click no 💵 do card Cartões/Empréstimos | ✅ | Onda 5 — batch de transfers |
| Drawer "Ritmo · Reserva · Metas" | DashboardPage (final) | Trigger único na base que abre painel com 3 cards (semana corrente, reserva detalhada, metas resumidas) | Click no rodapé → painel slide-up (mobile) ou modal centralizado (desktop) | ✅ | Implementado recente, funciona bem |
| Card Ritmo da semana (dentro drawer) | DashboardPage | gastou X / metaSemanal, status verde/amarelo/vermelho, barra | Auto | ✅ | Compara `gastoSemanaRenda` (seg→hoje, só bucket renda) com `metaSemanal` |
| Card Reserva (dentro drawer) | DashboardPage | Disponível / Usado / Acumulada / Aporte | Auto | ✅ | - |
| Card Metas resumido (dentro drawer) | DashboardPage | Top 3 metas com progresso + link "Ver todas" | Auto | ✅ | - |
| Configure ciclo (CTA quando sem ciclo) | DashboardPage | Banner amber pedindo configurar | Aparece se `cycle === null` | ✅ | Linka pra `/budget` |

---

# 2. Lançamentos (`/transactions` — TransactionsPage)

Arquivo: [src/pages/TransactionsPage.jsx](src/pages/TransactionsPage.jsx)

| Feature | Onde | O que faz | Como usar | Status | Obs |
|---|---|---|---|---|---|
| Header + botão "Novo" | TransactionsPage | Abre TxModal vazio | Click + Novo | ✅ | - |
| Navegação por ciclo | TransactionsPage | Setas avançam/voltam entre `budget_cycles` (start_date → end_date) | Setas em volta do label | ✅ | Onda 2: substituiu navegação por mês calendário |
| Empty state sem ciclo | TransactionsPage | Banner pedindo configurar ciclo se `cycles.length === 0` | Auto | ✅ | Onda 2 |
| Card "Ritmo de gasto" (diário/semanal) | TransactionsPage | StatusDot + BudgetVsSpent (gastoHoje vs orçamento, gastoSemana vs metaSemanal) | Auto, só aparece se `isCurrentCycle && currentCycle` | ⚠️ | Filtra só `expense` no bucket `income` — ignora despesas de crédito/reserva (esse design é proposital mas pouco óbvio) |
| Card Transferido + Investido | TransactionsPage | Total transferido/investido no ciclo + breakdown por categoria | Auto, só aparece se houver | ✅ | - |
| Card Consolidado (Entrou/Saiu/Líquido) | TransactionsPage | Soma `income`, `expense`, mostra líquido do ciclo atual | Auto | ✅ | Onda 2: agora respeita o ciclo dinâmico |
| Filtro por tipo | TransactionsPage | Chips Todos/Receita/Despesa/Investimento/Transferência | Click | ✅ | - |
| Lista de tx | TransactionsPage | Cada tx com data, type chip, payment_source chip, categoria, badge "Pendente" se `!is_paid`, valor com sinal, edit/delete | Click no edit/delete | ✅ | - |
| TxModal (criar/editar tx) | TransactionsPage | Form com tipo (Receita/Despesa/Investimento/Transferência), descrição, valor, data, categoria, payment_source, vincular meta, notas, "Já pago/recebido" | Botão Novo ou Edit | ⚠️ | **Tipo "Receita" existe e funciona**, mas user esquece de lançar receitas. Sem campo "Account" (era da frente Pluggy) |
| Botão "Importar CSV" | TransactionsPage (Onda 6) | Abre CSVImporterModal pra importar extrato Conta Corrente ou fatura Cartão NuBank | Click no botão ao lado de "Novo" | ✅ | Onda 6 |
| CSVImporterModal | components/CSVImporterModal.jsx | Multi-step: tipo+upload → preview com categorização IA + dedup → confirm em batch | Click "Importar" → file → tabela editável | ✅ | Onda 6 — usa nubankCSV.js + aiCategorize.js |
| Validação de reserva | TransactionsPage | Bloqueia despesa em `reserve` se exceder disponível | Auto ao salvar | ✅ | - |
| Aviso reserva no modal | TransactionsPage | Mostra disponível da reserva quando seleciona `reserve` | Auto | ✅ | - |
| Categorias no modal | TransactionsPage TxModal | Select de `categories` da DB | Click | ✅ | Mostra chip `[Tipo]` antes do nome. Onda 2 |
| Campo "Vincular à meta" no TxModal | TransactionsPage TxModal | Select opcional pra vincular tx a uma meta (goal_id) | Modal Novo/Edit → select | ✅ | Onda 2 |
| Campo "Conta" no TxModal | TransactionsPage TxModal | Select obrigatório pra income/expense/investment; auto-preenche payment_source | Modal Novo/Edit → select | ✅ | Onda 3 |
| Campos "De/Para" no TxModal (transfer) | TransactionsPage TxModal | 2 selects pra transferência entre contas próprias (from_account_id, to_account_id) | Tipo Transferência → 2 selects | ✅ | Onda 3 |
| Filtro por conta na lista | TransactionsPage | Select que filtra tx por account_id (ou from/to em transfer) | Header de filtros | ✅ | Onda 3 |
| Badge de conta na tx | TransactionsPage | Cada tx mostra nome da conta (ou "From → To" pra transfer) | Auto | ✅ | Onda 3 |

---

# 3. Planejamento (`/budget` — BudgetPage)

Arquivo: [src/pages/BudgetPage.jsx](src/pages/BudgetPage.jsx)

| Feature | Onde | O que faz | Como usar | Status | Obs |
|---|---|---|---|---|---|
| Header com título + botões | BudgetPage:302-318 | Refresh, Configurar ciclo (settings icon), + Novo | Clicks | ✅ | - |
| Botão Refresh | BudgetPage:308-310 | Refaz fetch de items/cycle/tx/bills | Click no ícone redondo | ✅ | Útil quando dados não atualizam sozinhos |
| Botão Configurar ciclo | BudgetPage:311-313 | Abre CycleModal | Click | ✅ | - |
| Tabs Renda/Crédito | BudgetPage:321-335 | Troca o bucket exibido | Click | ✅ | - |
| SnapshotCard (Renda ou Crédito) | BudgetPage:203-237 | Card com saldo origem, gasto real, disponível, % comprometido (crédito) ou média/meta (renda), linha extra com reserva | Auto | ⚠️ | Renda: mostra "Gasto real" (só tx) — não considera bills pagas. Confuso versus card de Bills no Dashboard |
| Resumo da aba (Receita/Despesas/Balanço) | BudgetPage:351-364 | 3 mini-cards somando `planned_amount` por tipo | Auto | ✅ | - |
| Lista de Receitas (planejado) | BudgetPage:382-395 | Lista income items do bucket atual | Auto | ✅ | - |
| Lista de Despesas por categoria | BudgetPage:397-430 | Items agrupados por categoria, com badge `is_fixed`, dia de vencimento, edit/delete | Click | ✅ | - |
| ItemModal (criar/editar item) | BudgetPage:19-121 | Form com categoria, payment_source, nome, valor planejado, dia de vencimento (se despesa), recorrência, notas, fixo | Botão + Novo ou Edit | ✅ | Onda 2: select de categoria mostra chip `[Tipo]` antes do nome |
| CycleModal (Configurar ciclo) | BudgetPage:123-201 | Form com start_date, end_date, saldo_origem_income, saldo_origem_credit, reserva_pct | Click no Settings | ⚠️ | Strip de campos gerados está OK. Default `start_date` = primeiro do mês corrente — não bate com ciclo 15-15 |

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
| Header + botão Nova meta | GoalsPage:~206-211 | Mostra título + botão | Click | ✅ | Onda 2: removido "Saldo livre" do header |
| GoalModal (criar/editar) | GoalsPage:~27-100 | Form com nome, descrição, target, valor inicial, prioridade, fixa | Click + Nova | ✅ | Onda 2: removido aggressiveness, plano IA, freeBalance |
| Lista de metas ativas | GoalsPage:~230-280 | Card por meta com saldo derivado, barra, ícone silencioso | Auto | ✅ | Saldo = current_amount + SUM(tx vinculadas). Onda 2 |
| Ícone "Sem aporte neste ciclo" | GoalsPage | Moon icon ao lado da meta se não houve tx vinculada no ciclo atual | Auto | ✅ | Onda 2 |
| Toggle concluída + Reabrir | GoalsPage | Marca/desmarca is_completed | Click | ✅ | - |
| Vínculo via goal_id em tx | TxModal | Tx do tipo `transfer` ou `expense` com goal_id alimenta saldo da meta | Lançar tx + selecionar meta | ✅ | Onda 2 |

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
| ActionCard (proposta de ação da IA) | ChatPage:46-97 | Renderiza ação detectada (add_transaction, add_goal, add_bill, update_budget, add_budget_items) com botões Aprovar/Ignorar | Click | ✅ | - |
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
| Seção "Contas" | SettingsPage | CRUD de contas (nome, tipo, subtype, default_payment_source) | Cards listando + botão Nova + Edit/Desativar | ✅ | Onda 3 |
| AccountModal | SettingsPage | Modal pra criar/editar conta | Click + Nova ou Edit | ✅ | Onda 3 |
| Botão "Desativar" conta | SettingsPage | Marca is_active=false (preserva FK das tx) | Click no ícone EyeOff | ✅ | Onda 3 — não deleta, só esconde |

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

---

# 11. Hooks / Estado

Arquivo: [src/hooks/useData.js](src/hooks/useData.js)

| Hook | O que faz | Status | Obs |
|---|---|---|---|
| `useMonthRef()` | State local de monthRef (default = mês corrente) | ✅ | Cada page tem o seu — não compartilhado |
| `useDashboard(monthRef)` | Fetcha bills + goals + items + cycle + tx + subscribe realtime em 5 tabelas | ✅ | Útil mas pesado: 5 canais de realtime na mesma chamada |
| `useTransactions(monthRef)` | Fetcha tx + realtime channel `tx` | ✅ | - |
| `useBills(monthRef)` | Fetcha bills do mês + allBills + realtime | ✅ | - |
| `useGoals()` | Fetcha goals (sem filtro mês) | ✅ | - |
| `useBudgetItems()` | Fetcha items + categorias + realtime | ✅ | - |
| `useBudgetCycle(monthRef)` | Fetcha cycle do mês + realtime | ✅ | - |
| `useAccounts()` | Fetcha accounts ativas + realtime channel `accounts` | ✅ | Onda 3 |

---

# 12. Lib / Engine

| Arquivo | Exports principais | O que faz | Status | Obs |
|---|---|---|---|---|
| [src/lib/supabase.js](src/lib/supabase.js) | `supabase` | createClient com VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY | ✅ | - |
| [src/lib/db.js](src/lib/db.js) | ~25 funções (getCategories, addTransaction, getBills, etc.) + `getAccounts`, `getAllAccounts`, `upsertAccount`, `deactivateAccount` (Onda 3 — CRUD de contas) | API uniforme sobre Supabase | ✅ | Sem getMonthSummary, liveHealth, reseedBudgetCycle (limpos no f376701) |
| [src/lib/budgetEngine.js](src/lib/budgetEngine.js) | `computeBucketSnapshot`, `computeReservaSnapshot`, `bucketOf`, constantes | Cálculos puros do modelo | ✅ | - |
| [src/lib/claude.js](src/lib/claude.js) | `buildSystemPrompt`, `sendToClaudeAPI`, `extractAction`, `cleanText` | Cliente da Edge Function + prompt builder | ✅ | - |
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
2. ~~**categoria type no TxModal**~~ — ✅ **Resolvido na Onda 2 (chip de type)**
3. ~~**Filtros por mês calendário em TransactionsPage**~~ — ✅ **Resolvido na Onda 2 (navega por ciclo)**
4. ~~**freeBalance ignora saldo real**~~ — ✅ **Resolvido na Onda 2 (modelo de Metas reformulado)**

## Dead code (candidato a remover)

5. ~~**WeeklyCheckpointModal + tab Histórico do Planejamento + record_checkpoint da IA + useCheckpoints + healthStatus + chart Previsto×Real**~~ — ✅ resolvido na Onda 1 (2026-05-07).
6. ~~**`checkpointChart` useMemo + imports recharts (BarChart, etc.) em DashboardPage**~~ — ✅ resolvido na Onda 1 (2026-05-07).

## Vínculos quebrados conceitualmente

7. ~~**Meta vs transação**~~ — ✅ **Resolvido na Onda 2 (saldo derivado de tx vinculadas)**
8. ~~**Bills pagas no mês × Saldo atual**~~ — ✅ **Mitigado na Onda 4** (cards agregados separam Bancos vs Cartões vs Empréstimos; "Bills pagas no mês" virou métrica derivada na seção "Disponível pra gastar").
9. ~~**payment_source só do tipo, não da conta**~~ — ✅ **Resolvido na Onda 3 (account_id em tx)**
9b. ~~**Multi-conta/multi-cartão sem distinção**~~ — ✅ **Resolvido na Onda 3**

## Auditoria de dados (proposta)

10. ~~**CSV NuBank vs tx no app**~~ — ✅ **Resolvido na Onda 6 (CSV importer com dedup soft por date+amount+account_id)**

---

# Histórico de execução

| Data | Onda | Mudança |
|---|---|---|
| 2026-05-07 | 1 — Limpeza | Removido fluxo WeeklyCheckpoint completo (modal, chart Previsto×Real, tab Histórico, record_checkpoint da IA, healthStatus, isoWeekBounds, useCheckpoints). Tabela `weekly_checkpoints` preservada no DB. ~300 linhas removidas. |
| 2026-05-07 | 2 — Polimentos UX | Filtro por ciclo dinâmico em Lançamentos. Chip `[Tipo]` em categorias (TxModal+ItemModal). Metas reformuladas pra modelo "espelho honesto": saldo derivado de tx vinculadas via `goal_id`, sem agressividade/dots. `goalPlanner.js` deletado. Migration `migration_goal_link.sql` aplicada. Colunas órfãs em `goals` (aggressiveness etc.) preservadas pra rollback. |
| 2026-05-14 | 3 — Multi-conta | Adicionada tabela `accounts` + colunas `account_id`/`from_account_id`/`to_account_id` em transactions. Seção Contas em /settings com CRUD. TxModal estendido (campo Conta pra income/expense/investment; De+Para pra transfer). Badge de conta + filtro por conta na lista de Lançamentos. Migrations aplicadas: backup_pre_onda3 (schema backup_2026_05_14), wipe_pre_onda3 (DELETE dos dados do user), accounts. Reset clean — usuário recadastrou tudo no novo ciclo. |
| 2026-05-15 | 4 — Dashboard multi-conta | Migration `migration_account_balances.sql` (opening_balance + credit_limit em accounts). `budgetEngine` ganha `computeAccountSnapshot` + `computeAccountsGroupSnapshot`. Hook `useAccountSnapshots`. Novo componente `AccountGroupDrawer`. Dashboard refatorado: 4 cards agregados (Bancos / Cartões / Empréstimos / Envelope) com drill-down em drawer lateral. AccountModal ganha campos saldo inicial e limite. Saldo passa a ser derivado de transactions; `cycle.saldo_origem_*` fica deprecated (mantido no schema). Migration `migration_family_share.sql` aplicada antes (RLS familiar permissiva nas 5 tabelas pra compartilhamento total Carlos + Gabriele). |
| 2026-05-16 | 5 — Pagar fatura | Novo `PayBillsModal` (src/components/PayBillsModal.jsx). Cards Cartões/Empréstimos do Dashboard ganham botão 💵 que abre modal com select banco origem + lista contas-alvo (checkbox + valor pré-preenchido com dívida atual) + datepicker. Confirm cria 1 `transfer` por linha marcada (from=banco, to=cartão/loan). Zero migration, reusa snapshots da Onda 4. |
| 2026-05-16 | 6 — CSV importer NuBank | Novo `src/lib/nubankCSV.js` (parseExtrato + parseFatura), `src/lib/aiCategorize.js` (categorizeBatch via Claude proxy), `src/components/CSVImporterModal.jsx` (multi-step upload→preview→confirm). TransactionsPage ganha botão "Importar". IA categoriza descrições em 1 chamada; dedup soft por date+amount+account_id (warning na linha, checkbox OFF). Sem migration, sem mudança na Edge Function. |
