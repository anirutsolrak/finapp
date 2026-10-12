-- Fecha todo.items: a policy public_all deixava a tabela legível e alterável só com a
-- anon key. O app de lista que usava isso foi abandonado. Com RLS ligada e nenhuma
-- policy, a tabela fica inacessível pela API; os dados continuam lá.
-- Para reabrir só para a família:
--   create policy family_only on todo.items for all to authenticated
--     using ((select public.is_family())) with check ((select public.is_family()));

alter table todo.items enable row level security;
drop policy if exists public_all on todo.items;

-- Conferência (aborta e desfaz se a anon key ainda enxergar alguma linha).
do $$
declare n bigint;
begin
  execute 'set local role anon';
  begin
    execute 'select count(*) from todo.items' into n;
  exception when insufficient_privilege then n := 0;
  end;
  execute 'set local role postgres';
  if n <> 0 then raise exception 'anon ainda ve % linhas em todo.items', n; end if;
  raise notice 'ok: anon ve 0 linhas em todo.items';
end $$;
