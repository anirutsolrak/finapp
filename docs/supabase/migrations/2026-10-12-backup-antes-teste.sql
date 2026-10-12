-- Backup dos dados antes de testar a versão nova contra o banco de produção.
-- Copia todas as tabelas de `public` e `todo` para o schema `backup_20261012`
-- (uma tabela por origem, nome `<schema>__<tabela>`). Idempotente: não sobrescreve
-- uma cópia que já existe.
--
-- O schema de backup fica FORA de `public` de propósito: tabela criada em `public`
-- sem RLS fica legível pela API com a anon key.
--
-- Restaurar uma tabela (exemplo com transactions), em uma transação:
--   begin;
--   delete from public.transactions;
--   insert into public.transactions select * from backup_20261012.public__transactions;
--   commit;
-- Apagar o backup quando não precisar mais:
--   drop schema backup_20261012 cascade;

create schema if not exists backup_20261012;

do $$
declare r record; n bigint;
begin
  for r in
    select table_schema, table_name from information_schema.tables
    where table_schema in ('public', 'todo') and table_type = 'BASE TABLE'
      and table_name not like '%backup%'   -- não recopia backups antigos
    order by 1, 2
  loop
    execute format('create table if not exists backup_20261012.%I as table %I.%I',
      r.table_schema || '__' || r.table_name, r.table_schema, r.table_name);
    execute format('select count(*) from backup_20261012.%I', r.table_schema || '__' || r.table_name) into n;
    raise notice 'backup %.% -> % linhas', r.table_schema, r.table_name, n;
  end loop;
end $$;
