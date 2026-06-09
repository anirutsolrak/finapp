# Setup do Supabase — FinAPP

Scripts SQL para subir o banco do FinAPP do zero. Todos são **idempotentes**
(podem rodar mais de uma vez sem quebrar) e devem ser executados **na ordem**:

| Ordem | Arquivo | O que faz |
|-------|---------|-----------|
| 1 | [`01_schema.sql`](01_schema.sql) | Schemas (`public`, `todo`), tabelas, constraints e índices |
| 2 | [`02_functions.sql`](02_functions.sql) | Funções de trigger e RPCs (`pay_bill`, `unpay_bill`, materialização) |
| 3 | [`03_triggers.sql`](03_triggers.sql) | Liga as funções às tabelas |
| 4 | [`04_rls.sql`](04_rls.sql) | Habilita RLS e cria as policies (modelo *family share*) |
| 5 | [`05_seed.sql`](05_seed.sql) | Categorias base + conta/ciclo inicial (opcional) |

## Pré-requisitos

1. Um projeto criado em [supabase.com](https://supabase.com).
2. Auth por e-mail/senha habilitado (Dashboard → **Authentication → Providers**).

## Opção A — Manual (SQL Editor)

1. Dashboard → **SQL Editor → New query**.
2. Cole o conteúdo de cada arquivo, **na ordem da tabela acima**, e rode um a um.
3. No `05_seed.sql`, ajuste o `user_id` nos blocos comentados se quiser semear
   conta/ciclo iniciais (pegue o id em **Authentication → Users**).

## Opção B — Automatizado (Supabase CLI)

```bash
# 1. Linke o projeto (uma vez)
npx supabase login
npx supabase link --project-ref <SEU_PROJECT_REF>

# 2. Rode os scripts na ordem
npx supabase db execute --file docs/supabase/01_schema.sql
npx supabase db execute --file docs/supabase/02_functions.sql
npx supabase db execute --file docs/supabase/03_triggers.sql
npx supabase db execute --file docs/supabase/04_rls.sql
npx supabase db execute --file docs/supabase/05_seed.sql
```

> Alternativa via `psql`: `psql "$DATABASE_URL" -f docs/supabase/01_schema.sql` (idem para os demais).

## Modelo de dados (resumo)

```
auth.users ──1:1── profiles
     │
     ├──< accounts ──────< (saldo derivado das transactions)
     ├──< budget_cycles ──< weekly_checkpoints
     ├──< budget_items ───< bills ───< transactions >─── categories
     ├──< goals <──────────────────────┘  │
     └──< chat_messages                    └──> todo.items (item importado vira tx)
```

- **budget_items** são *templates*; cada item ativo **materializa** uma `bill` por
  ciclo (`materialize_bills_for_item`), com no máximo 1 bill por item/mês
  (`unique (budget_item_id, month_ref)`).
- **pay_bill** cria a `transaction` de despesa e marca a bill como paga, de forma
  atômica. **bill_paid_rollover** abre a bill do próximo período em recorrências.
- **RLS** segue o modelo *family share*: dados financeiros são compartilhados entre
  usuários autenticados; `chat_messages` e `weekly_checkpoints` são privados.

## Notas de reconstrução

Estes scripts são uma reconstrução **limpa** do banco atual. Foram deixados de fora
de propósito (resíduo de migrações antigas, sem uso pelo app):

- tabela `bills_backup_20260608` e `monthly_summaries`;
- trigger duplicado `transactions_month_ref` (mantido só `trg_tx_month_ref`);
- função órfã `sync_budget_item_to_bill` (sem trigger; substituída pela materialização);
- policies redundantes `auth_*` / `*_owner` sobrepostas pelas `family_share_*`.
