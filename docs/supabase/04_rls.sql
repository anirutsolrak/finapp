-- ════════════════════════════════════════════════════════════════════════════
-- FinAPP · 04 · RLS (Row Level Security)
-- Modelo "family share": o app é usado por um casal que compartilha os mesmos
-- dados financeiros, então a maioria das tabelas é visível a QUALQUER usuário
-- autenticado (auth.uid() IS NOT NULL) em vez de filtrar por user_id.
-- Exceções privadas por usuário: chat_messages e weekly_checkpoints.
-- Rode depois de 03_triggers.
-- ════════════════════════════════════════════════════════════════════════════

-- Habilita RLS em todas as tabelas.
alter table public.profiles           enable row level security;
alter table public.categories         enable row level security;
alter table public.accounts           enable row level security;
alter table public.goals              enable row level security;
alter table public.budget_items       enable row level security;
alter table public.budget_cycles      enable row level security;
alter table public.bills              enable row level security;
alter table public.transactions       enable row level security;
alter table public.weekly_checkpoints enable row level security;
alter table public.chat_messages      enable row level security;
alter table todo.items                enable row level security;

-- ─── COMPARTILHADO: qualquer autenticado lê/escreve ──────────────────────────
drop policy if exists family_share_accounts on public.accounts;
create policy family_share_accounts on public.accounts
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists family_share_goals on public.goals;
create policy family_share_goals on public.goals
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists family_share_budget_items on public.budget_items;
create policy family_share_budget_items on public.budget_items
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists family_share_budget_cycles on public.budget_cycles;
create policy family_share_budget_cycles on public.budget_cycles
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists family_share_bills on public.bills;
create policy family_share_bills on public.bills
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists family_share_transactions on public.transactions;
create policy family_share_transactions on public.transactions
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ─── REFERÊNCIA: leitura/escrita aberta a autenticados ───────────────────────
drop policy if exists all_see_categories on public.categories;
create policy all_see_categories on public.categories
  for all using (true) with check (true);

drop policy if exists all_see_profiles on public.profiles;
create policy all_see_profiles on public.profiles
  for select using (true);

drop policy if exists profiles_insert_service on public.profiles;
create policy profiles_insert_service on public.profiles
  for insert with check (true);

-- ─── PRIVADO POR USUÁRIO ─────────────────────────────────────────────────────
drop policy if exists own_chat on public.chat_messages;
create policy own_chat on public.chat_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists weekly_checkpoints_owner on public.weekly_checkpoints;
create policy weekly_checkpoints_owner on public.weekly_checkpoints
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── TODO ────────────────────────────────────────────────────────────────────
drop policy if exists public_all on todo.items;
create policy public_all on todo.items
  for all using (true) with check (true);
