# Integração Pluggy — Design Spec

**Data:** 2026-05-06
**Branch:** `refatoração`
**Status:** Spec aprovado, aguarda implementação

## 1. Contexto e problema

O FinAPP hoje depende **100% de lançamento manual**. O usuário lança despesas no caixa do mercado, mas raramente lança receitas (salário cai e ele esquece). Resultado: KPIs mostram líquido absurdamente negativo (ex: `Entrou R$ 145 · Saiu R$ 2.153 · Líquido R$ -2.008`) porque o app só vê o lado de gasto.

Além disso:
- Transferências internas (Aplicação/Resgate RDB) viram pares fantasmas que poluem entrada+saída
- Pagamento de fatura de cartão é contado como despesa nova (double-count)
- Reservas pra meta perdem rastreio (separa R$ 200 pra cadeira, gasta em outra coisa, meta acha que tem 200 guardados)
- Não há suporte a múltiplas contas/cartões (NuBank débito + NuBank crédito + PicPay crédito)

**Solução escolhida:** integração com [MeuPluggy](https://meu.pluggy.ai/) (versão dev gratuita) via [Pluggy API](https://docs.pluggy.ai/) → puxa transações automaticamente via Open Finance regulado.

### Decisões tomadas no brainstorming
| Decisão | Escolha |
|---|---|
| Backend | Supabase Edge Functions (já usa Supabase) |
| Sincronização | Polling + botão manual (cron diário opcional depois) |
| Migração de dados existentes | Cutoff de data (manual antes, Pluggy depois) |
| Auto-classificação | Meio-termo: regras claras automáticas + inbox pros duvidosos |
| Arquitetura | Pluggy escreve em `transactions` com `raw_payload jsonb` pra auditoria (1 tabela + JSONB) |
| Scope | Tudo num spec só (Pluggy + transfer interna + fatura + vínculo meta + multi-conta) |
| Bancos no MVP | NuBank + PicPay (já conectados no MeuPluggy do usuário) |

### Out of scope (fica pra depois)
- Webhooks (sync real-time-ish do Pluggy)
- Cron diário automático (pg_cron)
- Regras de classificação customizáveis pelo usuário (UI pra criar regras)
- Suporte a Belvo/outras APIs concorrentes
- Importação de CSV (preserva como fallback caso Pluggy quebre)

---

## 2. Schema de dados

### 2.1 Tabelas novas

#### `pluggy_items`
Uma conexão Pluggy ↔ um banco autorizado.

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK → `auth.users` | RLS |
| `pluggy_item_id` | text UNIQUE | ID retornado pelo Pluggy |
| `connector_name` | text | "NuBank", "PicPay" |
| `status` | text | `LOGIN_IN_PROGRESS`, `UPDATED`, `WAITING_USER_INPUT`, `ERROR` |
| `last_sync_at` | timestamptz | |
| `created_at`, `updated_at` | timestamptz | default `now()` |

#### `accounts`
Cada conta dentro de um item — corrente, poupança, cartão.

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | RLS |
| `pluggy_item_id` | uuid FK → `pluggy_items` | |
| `pluggy_account_id` | text UNIQUE | ID Pluggy |
| `name` | text | "NuBank Conta", "NuBank Cartão", "PicPay Cartão" |
| `type` | text | `BANK` ou `CREDIT` |
| `subtype` | text | `CHECKING`, `SAVINGS`, `CREDIT_CARD` |
| `payment_source` | text | `fixed_income`, `variable_income`, `credit` (default por tipo, editável pelo user) |
| `created_at`, `updated_at` | timestamptz | |

#### `credit_card_bills`
Faturas de cartão.

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid PK | |
| `account_id` | uuid FK → `accounts` | só onde `type='CREDIT'` |
| `pluggy_bill_id` | text UNIQUE | |
| `due_date` | date | vencimento |
| `total_amount` | numeric | |
| `paid_amount` | numeric | calculado de `payments[]` |
| `status` | text | `OPEN`, `PAID`, `PARTIAL` |
| `raw_payload` | jsonb | snapshot completo do Pluggy |
| `created_at`, `updated_at` | timestamptz | |

#### `user_settings`
Configurações por usuário (cutoff de data e futuras).

| coluna | tipo | nota |
|---|---|---|
| `user_id` | uuid PK | RLS |
| `pluggy_cutoff_date` | date | Default = primeiro `pluggy_items.created_at` do user |
| `created_at`, `updated_at` | timestamptz | |

### 2.2 Alterações em `transactions`
| coluna nova | tipo | nota |
|---|---|---|
| `account_id` | uuid FK → `accounts` | nullable (manual antigas ficam null) |
| `pluggy_tx_id` | text UNIQUE | dedup natural |
| `raw_payload` | jsonb | snapshot do Pluggy, pra auditoria |
| `source` | text | `manual` ou `pluggy`, default `manual` |
| `status` | text | `approved` (default) ou `pending` (precisa user revisar) ou `ignored` |
| `bill_id` | uuid FK → `credit_card_bills` | tx de cartão sabe a qual fatura pertence |
| `card_number` | text | últimos 4 dígitos do plástico, pra distinguir 3 cartões PicPay sob mesma fatura |
| `goal_id` | uuid FK → `goals` | vincula tx a uma meta (sub-projeto C) |
| `linked_tx_id` | uuid FK → `transactions` | pra par anulável (ex: Aplicação RDB ↔ Resgate RDB) |
| `is_voided` | boolean | default `false`. Quando `true`, NÃO entra em `saidaSinceCutoff` nem em outros agregados. Setado em pares anuláveis. |

### 2.3 Mudança em `goals`
`goals.current_amount` deixa de ser editado manualmente — vira **derivado**:
```
current_amount = SUM(transactions.amount onde goal_id = X AND type='transfer')
              − SUM(transactions.amount onde goal_id = X AND type='expense')
```
Implementação: trigger ou view materializada, OU computar no client (simples). Decisão: computar no client por simplicidade.

---

## 3. Arquitetura backend (Supabase Edge Functions)

### 3.1 Setup
- **Env vars do Supabase** (Project Settings → Edge Functions → Secrets):
  - `PLUGGY_CLIENT_ID`
  - `PLUGGY_CLIENT_SECRET`
- **RLS** em todas as tabelas novas: política `auth.uid() = user_id`
- Edge Functions em **Deno/TypeScript** (default Supabase). Usam `createClient` com JWT do user pra respeitar RLS.

### 3.2 Endpoints (5 funções)

| Endpoint | Faz |
|---|---|
| `pluggy-connect-token` | Chama `POST https://api.pluggy.ai/connect_token` com client_id/secret → retorna token efêmero pro frontend abrir o widget |
| `pluggy-create-item` | Após widget retornar `itemId`, salva em `pluggy_items` + busca `/accounts` do Pluggy → cria rows em `accounts` |
| `pluggy-sync` | Recebe `itemId`. Chama `/items/X/sync` (force refresh) → polling até `UPDATED` → lê `/transactions` e `/credit-card-bills` desde `last_sync_at` (ou cutoff_date na primeira) → dedup por `pluggy_tx_id` → classifica → insere em `transactions` e `credit_card_bills`. Atualiza `last_sync_at`. Retorna `{ inserted, pending, skipped }` |
| `pluggy-list-items` | Lista conexões do user com status — pra UI da tela de Conexões |
| `pluggy-delete-item` | Revoga consent no Pluggy (`DELETE /items/X`) + soft-delete local (mantém histórico de tx, só marca item como inativo) |

### 3.3 Auth flow (criar conexão nova)
```
1. User clica "+ Nova conexão" no app
2. App chama Edge Function pluggy-connect-token
3. Backend → Pluggy POST /connect_token → retorna { connectToken, expiresAt }
4. App abre Pluggy Connect Widget com o token (SDK em iframe/popup)
5. User escolhe banco → autoriza via Open Finance → volta pro widget
6. Widget invoca callback no app com { itemId }
7. App chama Edge Function pluggy-create-item com itemId
8. Backend salva pluggy_items + busca /accounts → salva accounts
9. App mostra "Conexão criada. Sincronize quando quiser."
```

### 3.4 Sync flow
```
1. User clica "Sincronizar"
2. App → Edge Function pluggy-sync({ itemId })
3. Backend → POST /items/{itemId} (force refresh)
4. Polling GET /items/{itemId} até status='UPDATED' (~5-30s)
5. Para cada account do item:
   a) GET /transactions?accountId=X&from=last_sync_at (ou cutoff_date na primeira)
   b) Para cada tx:
      - Dedup: pluggy_tx_id já existe? → skip
      - Aplica regras de classificação (3.5) → insere em transactions
   c) Se account.type='CREDIT':
      - GET /credit-card-bills?accountId=X → upsert credit_card_bills
6. Pós-processamento: detecta pares anuláveis (ver 3.6)
7. Atualiza pluggy_items.last_sync_at
8. Retorna { inserted: N, pending: M, skipped: K }
9. App mostra toast: "5 novas tx (2 pendentes pra revisar)"
```

### 3.5 Regras de classificação (ordem — primeira que match vence)

| # | Detector | Resultado |
|---|---|---|
| 1 | `descriptionRaw` contém "Aplicação RDB" / "Resgate RDB" OR `operationType` ∈ `APLIC_FINANCEIRA`/`RESGATE_APLIC_FINANCEIRA` | `type='transfer'`, marca como interna (anulável). `status='approved'`. |
| 2 | `descriptionRaw` contém "Pagamento de fatura" AND `amount < 0` | `type='transfer'`, vincula `bill_id` por matching valor + data próxima. `status='approved'`. |
| 3 | account.type='BANK' AND amount < 0 (não match anterior) | `type='expense'`, `payment_source` herda da account (default `fixed_income`). `status='approved'`. |
| 4 | account.type='CREDIT' (compra no cartão, vinda do connector) | `type='expense'`, `payment_source='credit'`, copia `card_number` + `bill_id` do `creditCardMetadata`. `status='approved'`. |
| 5 | amount > 1000 AND `descriptionRaw` match `TRANSFERÊNCIA RECEBIDA - <CNPJ>` (regex empresa) | `type='income'`, `payment_source='fixed_income'`. `status='approved'` (presume salário). |
| 6 | `descriptionRaw` contém "Reembolso" / "Estorno" | `type='income'`, `status='pending'` — vai pra inbox (user decide: anular tx original ou tratar como income). |
| 7 | amount > 0 AND não match anterior (PIX recebido pequeno, etc.) | `type='income'`, `status='pending'` — inbox |
| 8 | Catch-all | `status='pending'` — inbox |

### 3.6 Pares anuláveis (pós-sync)
Após inserir tx novas, varre o mesmo item buscando par "Aplicação RDB R$X + Resgate RDB R$X" próximos no tempo (mesmo dia ou ±1 dia). Se acha:
- Vincula via `linked_tx_id` (cada uma referencia a outra)
- Marca os 2 com `is_voided=true` (coluna definida em 2.2)
- **Anulados ficam no banco mas NÃO entram no `saidaSinceCutoff`** — UI mostra em cinza com label "anulado"

---

## 4. Frontend

### 4.1 Telas novas

#### `/connections` (nova rota)
- Lista de conexões Pluggy: ícone do banco, nome, status badge, `last_sync_at`
- Botão **"+ Nova conexão"** — abre Pluggy Connect Widget (SDK npm `pluggy-connect-sdk`)
- Por conexão: botão "Sincronizar agora", "Desconectar"
- Subseção "Contas" — lista as `accounts` daquele item (NuBank Conta, NuBank Cartão, etc.) com edit de `payment_source` e nome

#### `/inbox` (nova rota) — pendentes pra revisar
- Lista de tx com `status='pending'`
- Cada item: data | descrição (`raw`) | valor | account | classificação sugerida (chip editável)
- Ações inline: ✓ Aprovar | ✎ Editar | ✕ Descartar (marca `status='ignored'`)
- Bulk: "Aprovar todas as pendentes da inbox"
- Estado vazio: "Tudo classificado ✓"

### 4.2 Ajustes nas pages existentes

#### Lançamentos
- Badge na linha de cada tx: `🔌 Pluggy` ou `✍️ Manual`
- Tx anuladas (par RDB): renderiza em cinza, recolhido como "Aplicação + Resgate anulado · R$ 500"
- Tx pendentes: badge laranja "Pendente" + clicar abre Inbox
- Filtro novo: por account (dropdown)

#### Dashboard
- Header ganha botão **"🔄 Sincronizar (N pendentes)"** — vermelho se N > 0
- Toast pós-sync: "5 novas tx · 2 pendentes"

#### Lançamento manual (TxModal)
- Adiciona campo opcional **"Conta"** (select de `accounts`). Se não selecionar, fica null. Mantém fluxo rápido.
- Adiciona campo opcional **"Vincular à meta"** (select de `goals` ativas).

### 4.3 Integração Pluggy Connect Widget
- Pacote npm `pluggy-connect-sdk` (oficial). React-friendly.
- Component abre modal do widget passando `connectToken` que veio da Edge Function
- `onSuccess` callback retorna `{ itemId }` → app chama `pluggy-create-item`

### 4.4 Roteamento
- `/connections` e `/inbox` viram itens no menu lateral (desktop)
- No mobile bottom nav: mantém os 5 atuais; `/connections` e `/inbox` ficam acessíveis via menu hambúrguer ou ícones secundários no Dashboard header

---

## 5. Vínculo meta ↔ transação (sub-projeto C)

### Modelagem
- `transactions.goal_id` (nova coluna FK → `goals`, nullable)
- `goals.current_amount` deixa de ser persistido manualmente, vira derivado:
```
current_amount = SUM(transactions.amount onde goal_id = X AND type='transfer')
              − SUM(transactions.amount onde goal_id = X AND type='expense')
```

### Fluxos
1. **Separar dinheiro pra meta** → user lança `transfer` com `goal_id=X` → `current_amount` da meta sobe
2. **Gastei o dinheiro guardado em outra coisa** → ao lançar a `expense`, marca `goal_id=X` → `current_amount` cai (meta sabe que perdeu reserva)
3. **Desistir totalmente** → cria `expense` com `goal_id=X` no valor total — ou ação explícita "Desistir desta meta" que faz isso

### UI
- TxModal: campo opcional "Vincular à meta" (select)
- GoalsPage: cada meta mostra `current_amount` derivado + lista das tx que a alimentaram (audit trail) + lista das que consumiram

---

## 6. Fatura de crédito (sub-projeto D, refinamento)

Schema (`credit_card_bills`) já está coberto na seção 2. Lógica:

### Detecção via Pluggy
- Cada conta `CREDIT` tem bills puxadas via `GET /credit-card-bills?accountId=X`
- `payments[]` array calcula:
  - `paid_amount = SUM(payments[].amount)`
  - `status`: `PAID` se >= `total_amount`; `PARTIAL` se > 0; `OPEN` se 0

### Vínculo tx ↔ bill
- Tx do cartão (regra #4) já vem com `bill_id` do `creditCardMetadata` do Pluggy (Open Finance)
- Tx de "Pagamento de fatura" (regra #2) procura bill com `total_amount` próximo do valor + `due_date` recente → vincula via `bill_id` em transactions e adiciona ao `paid_amount` da bill

### Cenário "pago, libera, gasta de novo, paga"
1. Compra cartão R$ 200 → tx `expense` com `bill_id=fatura_aberta`
2. User paga R$ 200 antes de fechar → tx `transfer` "Pagamento de fatura" → vincula com bill aberta, `paid_amount += 200`, status vira PAID
3. Cartão libera limite (visível: `saldo_origem_credit - saidaSinceCutoff` cai)
4. Nova compra R$ 200 → nova tx `expense` (mesma fatura ou nova, depende do fechamento)
5. Repete passos 2-3

### UI
- BillsPage ganha aba **"Faturas de Cartão"** — lista bills com `due_date`, `total_amount`, `paid_amount`, status, link pro cartão
- Item da fatura clicável → expande lista das tx daquela bill

---

## 7. Migração de dados existentes

### Estratégia: cutoff de data
1. Define `cutoff_date` (default: data da primeira conexão Pluggy)
2. Tx existentes recebem em batch: `source='manual'`, `account_id=null`, `pluggy_tx_id=null`, `status='approved'`
3. Pluggy sync passa `from=cutoff_date` em todo `GET /transactions` → ignora tudo anterior
4. Lançamento manual continua disponível pra qualquer data

### Onde armazenar
Tabela `user_settings` (definida em 2.1) com `pluggy_cutoff_date`.

### Primeira sync (após primeira conexão)
- Edge Function passa `from=cutoff_date` ao buscar tx do Pluggy
- Se vier muito volume (>200 tx), processa em batches de 50, retorna progresso pro frontend
- Toast final: "Importadas 87 tx desde 06/05/2026 — 12 pendentes pra revisar"

---

## 8. Configuração / Deploy

### Env vars (Supabase Project Settings → Edge Functions → Secrets)
- `PLUGGY_CLIENT_ID`
- `PLUGGY_CLIENT_SECRET`

### SQL migrations (ordem)
1. `001_pluggy_tables.sql` — `pluggy_items`, `accounts`, `credit_card_bills`, `user_settings`
2. `002_alter_transactions.sql` — adiciona `account_id`, `pluggy_tx_id` (UNIQUE), `raw_payload` (jsonb), `source`, `status`, `bill_id`, `card_number`, `goal_id`, `linked_tx_id`
3. `003_rls_policies.sql` — RLS `auth.uid() = user_id` em todas tabelas novas
4. `004_indexes.sql` — `idx_tx_pluggy_id` (UNIQUE), `idx_tx_account`, `idx_tx_status`, `idx_tx_bill`, `idx_accounts_item`
5. `005_seed_cutoff.sql` — backfill `user_settings` pros users existentes (`cutoff_date = today`)

### Deploy
- `supabase functions deploy pluggy-connect-token`
- `supabase functions deploy pluggy-create-item`
- `supabase functions deploy pluggy-sync`
- `supabase functions deploy pluggy-list-items`
- `supabase functions deploy pluggy-delete-item`
- `npm install pluggy-connect-sdk` no frontend
- Roteamento: adicionar `/connections` e `/inbox` no React Router + Layout

### Setup manual no Pluggy
1. Conta dev em `meu.pluggy.ai` (já existe — usuário já tem NuBank+PicPay conectados)
2. Dashboard → criar "App" → copiar `client_id`/`client_secret`
3. Colar nos secrets do Supabase

---

## 9. Métricas de sucesso (definição de "MVP funcionou")

- ✅ Conectar NuBank + PicPay via widget sem erro
- ✅ Sincronizar manualmente puxa N tx novas em <30s
- ✅ Tx do tipo "Aplicação RDB" + "Resgate RDB" no mesmo valor são detectadas como par anulável
- ✅ "Pagamento de fatura" não aparece como gasto novo — vincula com a bill correspondente
- ✅ Inbox tem ações de aprovar/editar/descartar funcionando
- ✅ Lançamento manual segue funcionando sem mudar nada do fluxo atual
- ✅ Dashboard mostra `saldoDisponivel` correto considerando tx Pluggy + manual + cutoff
- ✅ Vínculo meta-tx funcional: separar pra meta sobe `current_amount`; gastar reserva (com `goal_id`) baixa
- ✅ Faturas de cartão aparecem em `/bills` com status correto

---

## 10. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| MeuPluggy dev encerra acesso gratuito após mudança de política do Pluggy | Manter capacidade de lançamento manual intacta. Source code pra exportar tx do banco em CSV (export do app). Decisão sobre Belvo/CSV importer fica documentada como Plano B. |
| Latência 1-2h do Open Finance atrasa sync e usuário não vê tx recentes | Lançamento manual cobre o gap. UI deixa claro: "Última sync: 14h32 — última tx do banco pode levar até 2h pra aparecer." |
| Edge Function expira (default Supabase: 60s) durante sync grande | Implementar paginação por batch (50 tx por chamada). Frontend itera enquanto `has_more=true` no response. |
| `cutoff_date` mal escolhido causa duplicata/perda | UI da primeira conexão pergunta explícita: "A partir de qual data o Pluggy importa? (default: hoje)". Podemos mudar depois via `/connections`. |
| Regras de classificação erram em casos não previstos | Inbox absorve duvidosos. User pode editar/aprovar individualmente. Regras customizáveis ficam pra v2. |
| Usuário tem 3 cartões PicPay sob mesma conta — `card_number` pode confundir UI | Lançamentos mostra "PicPay (final 0035)" como sub-label. Filter inclui card_number. |

---

## 11. Próximos passos

1. **User revisa este spec** — aprova ou pede mudanças
2. **writing-plans skill** monta o implementation plan dividido em tasks
3. **Execução em fases dentro da branch `refatoração`**:
   - Fase 1: Schema + RLS (migrations)
   - Fase 2: Edge Functions (5)
   - Fase 3: Tela `/connections` + widget
   - Fase 4: Sync flow + regras de classificação
   - Fase 5: Tela `/inbox` + ajustes em Lançamentos
   - Fase 6: Vínculo meta-tx + UI em GoalsPage
   - Fase 7: Faturas de cartão em BillsPage
   - Fase 8: Testes manuais + ajustes
4. **Merge** da `refatoração` → `main` quando MVP estiver verde
