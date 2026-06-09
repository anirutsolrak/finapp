-- ════════════════════════════════════════════════════════════════════════════
-- FinAPP · 01 · SCHEMA
-- Schemas, tabelas, constraints e índices. Idempotente (pode rodar de novo).
-- Ordem respeita as foreign keys — rode este arquivo primeiro.
-- ════════════════════════════════════════════════════════════════════════════

create schema if not exists todo;

-- ─── PROFILES ────────────────────────────────────────────────────────────────
-- 1:1 com auth.users. Populada automaticamente no signup (ver 02_functions).
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text,
  email        text,
  avatar_url   text,
  role         text default 'member',
  notify_email text,
  created_at   timestamptz default now()
);

-- ─── CATEGORIES ──────────────────────────────────────────────────────────────
-- Dados de referência compartilhados (renda, essencial, variável, etc).
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  type       text not null check (type in ('income','investment','essential','variable','installment','reserve')),
  color      text default '#6366f1',
  icon       text default '📁',
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ─── ACCOUNTS ────────────────────────────────────────────────────────────────
-- Contas e cartões (multi-conta). saldoAtual é derivado no client a partir das tx.
create table if not exists public.accounts (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  name                   text not null,
  type                   text not null check (type in ('bank','credit','envelope')),
  subtype                text,
  default_payment_source text check (default_payment_source in ('fixed_income','variable_income','credit','reserve')),
  is_active              boolean not null default true,
  display_order          int not null default 0,
  notes                  text,
  opening_balance        numeric not null default 0,
  credit_limit           numeric not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index if not exists idx_accounts_user on public.accounts (user_id) where (is_active = true);

-- ─── GOALS ───────────────────────────────────────────────────────────────────
-- Metas financeiras. aggressiveness/total_months/months_completed = plano da IA.
create table if not exists public.goals (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references auth.users(id),
  name                 text not null,
  description          text,
  target_amount        numeric not null,
  current_amount       numeric default 0,
  monthly_contribution numeric default 0,
  target_date          date,
  is_completed         boolean default false,
  is_fixed             boolean default false,
  priority             int default 1,
  category             text,
  aggressiveness       text check (aggressiveness in ('very_high','high','medium','low','very_low')),
  total_months         int,
  months_completed     int default 0,
  ai_computed_at       timestamptz,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

-- ─── BUDGET_ITEMS ────────────────────────────────────────────────────────────
-- Templates de planejamento. Cada item ativo materializa bills por período.
create table if not exists public.budget_items (
  id                 uuid primary key default gen_random_uuid(),
  category_id        uuid references public.categories(id) on delete set null,
  name               text not null,
  planned_amount     numeric not null default 0,
  is_fixed           boolean not null default false,
  due_day            int check (due_day between 1 and 31),
  recurrence         text default 'monthly' check (recurrence in ('monthly','yearly','once')),
  active             boolean default true,
  notes              text,
  payment_source     text not null default 'fixed_income' check (payment_source in ('credit','fixed_income','variable_income','reserve')),
  default_account_id uuid references public.accounts(id) on delete set null,
  created_by         uuid references auth.users(id),
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- ─── BUDGET_CYCLES ───────────────────────────────────────────────────────────
-- Um ciclo de orçamento por usuário/mês (month_ref = 'YYYY-MM').
create table if not exists public.budget_cycles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  month_ref           text not null,
  start_date          date not null,
  end_date            date not null,
  saldo_origem_income numeric default 0,
  saldo_origem_credit numeric default 0,
  reserva_pct         numeric default 0,
  reserva_acumulada   numeric default 0,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now(),
  unique (user_id, month_ref)
);

-- ─── BILLS ───────────────────────────────────────────────────────────────────
-- Contas a pagar (materializadas dos budget_items ou avulsas). 1 bill por item/mês.
create table if not exists public.bills (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users(id),
  budget_item_id    uuid references public.budget_items(id) on delete set null,
  name              text not null,
  amount            numeric,
  due_date          date not null,
  month_ref         text not null,
  is_paid           boolean default false,
  is_fixed          boolean default false,
  recurrence        text default 'monthly' check (recurrence in ('monthly','yearly','once','none')),
  alert_days_before int default 3,
  paid_at           timestamptz,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),
  unique (budget_item_id, month_ref)
);
create index if not exists idx_bills_due_date on public.bills (due_date);
create index if not exists idx_bills_paid     on public.bills (is_paid);

-- ─── TRANSACTIONS ────────────────────────────────────────────────────────────
-- Lançamentos. type: income/expense/investment/transfer. Transfers usam from/to_account.
create table if not exists public.transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id),
  description     text not null,
  amount          numeric not null,
  type            text not null check (type in ('income','expense','investment','transfer')),
  date            date not null default current_date,
  month_ref       text,
  payment_source  text not null default 'fixed_income' check (payment_source in ('credit','fixed_income','variable_income','reserve')),
  is_paid         boolean default true,
  ai_suggested    boolean default false,
  notes           text,
  category_id     uuid references public.categories(id) on delete set null,
  budget_item_id  uuid references public.budget_items(id) on delete set null,
  goal_id         uuid references public.goals(id) on delete set null,
  bill_id         uuid references public.bills(id) on delete set null,
  account_id      uuid references public.accounts(id) on delete set null,
  from_account_id uuid references public.accounts(id) on delete set null,
  to_account_id   uuid references public.accounts(id) on delete set null,
  created_at      timestamptz default now()
);
create index if not exists idx_transactions_user         on public.transactions (user_id);
create index if not exists idx_transactions_date         on public.transactions (date);
create index if not exists idx_transactions_month        on public.transactions (month_ref);
create index if not exists idx_tx_bill_id                on public.transactions (bill_id);
create index if not exists idx_transactions_goal         on public.transactions (goal_id)         where (goal_id is not null);
create index if not exists idx_transactions_account      on public.transactions (account_id)      where (account_id is not null);
create index if not exists idx_transactions_from_account on public.transactions (from_account_id) where (from_account_id is not null);
create index if not exists idx_transactions_to_account   on public.transactions (to_account_id)   where (to_account_id is not null);

-- ─── WEEKLY_CHECKPOINTS ──────────────────────────────────────────────────────
-- Fechamento semanal previsto×real por bucket (income/credit).
create table if not exists public.weekly_checkpoints (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  cycle_id       uuid references public.budget_cycles(id) on delete cascade,
  week_start     date not null,
  week_end       date not null,
  bucket         text not null check (bucket in ('income','credit')),
  saldo_previsto numeric not null,
  saldo_real     numeric not null,
  status         text not null check (status in ('green','yellow','red')),
  note           text,
  created_at     timestamptz default now(),
  unique (user_id, week_start, bucket)
);

-- ─── CHAT_MESSAGES ───────────────────────────────────────────────────────────
-- Histórico do chat com a IA (privado por usuário).
create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references auth.users(id),
  role       text not null check (role in ('user','assistant','system')),
  content    text not null,
  metadata   jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
create index if not exists idx_chat_user on public.chat_messages (user_id);

-- ─── TODO.ITEMS ──────────────────────────────────────────────────────────────
-- Lista de compras/tarefas. Item importado vira transaction (finapp_transaction_id).
create table if not exists todo.items (
  id                    uuid primary key default gen_random_uuid(),
  category              text not null,
  name                  text not null,
  value                 numeric,
  notes                 text,
  done                  boolean not null default false,
  order_index           int not null default 0,
  done_at               timestamptz,
  imported_at           timestamptz,
  finapp_transaction_id uuid references public.transactions(id) on delete set null,
  created_at            timestamptz not null default now()
);
