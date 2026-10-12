-- ════════════════════════════════════════════════════════════════════════════
-- FinAPP · 04 · RLS (Row Level Security)
-- Modelo "family share": o app é usado por um casal que compartilha os mesmos
-- dados financeiros. Quem está em public.family_members lê e escreve tudo; quem
-- não está (anon key sem login, ou alguém que só se cadastrou) não vê nada.
-- Exceções privadas por usuário: chat_messages e weekly_checkpoints.
-- Rode depois de 03_triggers.
--
-- Num banco novo: cadastre os usuários no Auth e DEPOIS inclua cada um em
-- family_members (insert no fim deste arquivo), senão o app abre vazio.
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

-- ─── QUEM É DA FAMÍLIA ───────────────────────────────────────────────────────
create table if not exists public.family_members (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.family_members enable row level security;  -- sem policy: invisível pela API

-- SECURITY DEFINER para conseguir ler family_members (que não tem policy).
create or replace function public.is_family()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.family_members where user_id = (select auth.uid()));
$$;
revoke all on function public.is_family() from public, anon;
grant execute on function public.is_family() to authenticated;

-- ─── COMPARTILHADO: só a família lê/escreve ──────────────────────────────────
-- Uma policy por tabela (family_only). Remove as antigas, que aceitavam qualquer
-- usuário logado (auth.uid() is not null) ou até a anon key (using (true)).
do $$
declare t text; p record;
begin
  foreach t in array array['accounts','bills','budget_cycles','budget_items','categories','goals','profiles','transactions'] loop
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format(
      'create policy family_only on public.%I for all to authenticated
         using ((select public.is_family())) with check ((select public.is_family()))', t);
  end loop;
end $$;

-- ─── PRIVADO POR USUÁRIO ─────────────────────────────────────────────────────
drop policy if exists own_chat on public.chat_messages;
create policy own_chat on public.chat_messages
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists weekly_checkpoints_owner on public.weekly_checkpoints;
create policy weekly_checkpoints_owner on public.weekly_checkpoints
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── TODO ────────────────────────────────────────────────────────────────────
-- Sem policy: a Lista saiu do app e a tabela fica inacessível pela API (os dados continuam).
drop policy if exists public_all on todo.items;

-- ─── MEMBROS ─────────────────────────────────────────────────────────────────
-- Depois de cadastrar os usuários no Auth:
--   insert into public.family_members (user_id)
--   select id from auth.users where email in ('voce@exemplo.com', 'parceiro@exemplo.com');
