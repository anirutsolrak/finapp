-- migration_wipe_pre_onda3.sql
-- Wipe das tabelas da família Carlos (49d01efc...) + esposa Gabriele (b846902c...).
-- PRÉ-CONDIÇÃO: migration_backup_pre_onda3.sql aplicada com sucesso.
-- Aplicar APÓS confirmar backup.
--
-- Nota: budget_items é tabela compartilhada da família (sem coluna user_id),
-- então o DELETE não tem filtro — limpa o catálogo inteiro.

DELETE FROM transactions  WHERE user_id IN ('49d01efc-e309-49be-98f2-684d0d4548e2', 'b846902c-475e-4669-afa7-5d59221716a7');
DELETE FROM bills         WHERE user_id IN ('49d01efc-e309-49be-98f2-684d0d4548e2', 'b846902c-475e-4669-afa7-5d59221716a7');
DELETE FROM budget_cycles WHERE user_id IN ('49d01efc-e309-49be-98f2-684d0d4548e2', 'b846902c-475e-4669-afa7-5d59221716a7');
DELETE FROM goals         WHERE user_id IN ('49d01efc-e309-49be-98f2-684d0d4548e2', 'b846902c-475e-4669-afa7-5d59221716a7');
DELETE FROM budget_items;
