-- Fecha o acesso aos dados: só os membros da família leem e escrevem.
--
-- Antes desta migração (conferido no banco em 2026-10-12):
--   - sem login, só com a anon key (que é pública, vai no bundle do app), dava para ler e
--     alterar budget_items, categories e profiles (policies com `using (true)`);
--   - o cadastro é aberto, e as policies "family share" aceitavam qualquer usuário logado
--     (`auth.uid() is not null`): quem se cadastrasse via tudo.
--
-- Depois: uma policy só por tabela, `family_only`, que exige estar em `family_members`.
-- A migração se confere no final e desfaz tudo (exception) se alguma visão não bater.
--
-- Fora do escopo: `todo.items` continua com a policy pública (é usada por outro app).

-- Trava: a lista de membros nasce de auth.users, então precisa ter só quem é da família.
do $$
begin
  if (select count(*) from auth.users) <> 2 then
    raise exception 'esperava 2 usuarios em auth.users, encontrei %', (select count(*) from auth.users);
  end if;
end $$;

-- ─── Quem é da família ──────────────────────────────────────────────────────
-- Para incluir alguém depois: insert into public.family_members (user_id) values ('<uuid>');
create table if not exists public.family_members (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.family_members enable row level security;  -- sem policy: invisível pela API

insert into public.family_members (user_id)
select id from auth.users
on conflict do nothing;

-- SECURITY DEFINER para conseguir ler family_members (que não tem policy).
create or replace function public.is_family()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.family_members where user_id = (select auth.uid()));
$$;
revoke all on function public.is_family() from public, anon;
grant execute on function public.is_family() to authenticated;

-- ─── Uma policy por tabela ──────────────────────────────────────────────────
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

-- ─── Conferência (aborta e desfaz tudo se falhar) ───────────────────────────
do $$
declare
  tabs text[] := array['accounts','bills','budget_cycles','budget_items','categories','goals','profiles','transactions'];
  members uuid[] := (select array_agg(user_id) from public.family_members);
  total jsonb := '{}'; t text; n bigint; uid uuid;
begin
  foreach t in array tabs loop
    execute format('select count(*) from public.%I', t) into n;
    total := total || jsonb_build_object(t, n);
  end loop;

  execute 'set local role anon';
  foreach t in array tabs loop
    execute format('select count(*) from public.%I', t) into n;
    if n <> 0 then raise exception 'anon ainda ve % linhas em %', n, t; end if;
  end loop;
  execute 'set local role postgres';

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  execute 'set local role authenticated';
  foreach t in array tabs loop
    execute format('select count(*) from public.%I', t) into n;
    if n <> 0 then raise exception 'usuario de fora ainda ve % linhas em %', n, t; end if;
  end loop;
  execute 'set local role postgres';

  foreach uid in array members loop
    perform set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    foreach t in array tabs loop
      execute format('select count(*) from public.%I', t) into n;
      if n <> (total ->> t)::bigint then
        raise exception 'membro % ve % de % linhas em %', uid, n, total ->> t, t;
      end if;
    end loop;
    execute 'set local role postgres';
  end loop;

  perform set_config('request.jwt.claims', '', true);
  raise notice 'ok: anon e usuario de fora veem 0 linhas; os % membros veem tudo (%)', array_length(members, 1), total;
end $$;
