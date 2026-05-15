-- migration_wipe_pre_onda3.sql
-- Wipe das tabelas da família Carlos (49d01efc...) + esposa Gabriele (b846902c...).
-- PRÉ-CONDIÇÃO: migration_backup_pre_onda3.sql aplicada com sucesso.
-- Aplicar APÓS confirmar backup.
--
-- Notas:
-- - budget_items é tabela compartilhada da família (sem coluna user_id).
-- - bills tem coluna user_id mas em produção todas estavam com user_id=NULL e
--   budget_item_id=NULL (vínculos perdidos por bug anterior), então o filtro
--   por user_id não pegava. Usamos DELETE total.
-- Limpamos as duas sem filtro.

DELETE FROM transactions  WHERE user_id IN ('49d01efc-e309-49be-98f2-684d0d4548e2', 'b846902c-475e-4669-afa7-5d59221716a7');
DELETE FROM bills;
DELETE FROM budget_cycles WHERE user_id IN ('49d01efc-e309-49be-98f2-684d0d4548e2', 'b846902c-475e-4669-afa7-5d59221716a7');
DELETE FROM goals         WHERE user_id IN ('49d01efc-e309-49be-98f2-684d0d4548e2', 'b846902c-475e-4669-afa7-5d59221716a7');
DELETE FROM budget_items;
