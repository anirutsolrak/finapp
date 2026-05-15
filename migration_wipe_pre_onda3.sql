-- migration_wipe_pre_onda3.sql
-- Wipe das tabelas do usuário Carlos (id 49d01efc-e309-49be-98f2-684d0d4548e2).
-- PRÉ-CONDIÇÃO: migration_backup_pre_onda3.sql aplicada com sucesso.
-- Aplicar APÓS confirmar backup.

DELETE FROM transactions  WHERE user_id = '49d01efc-e309-49be-98f2-684d0d4548e2';
DELETE FROM bills         WHERE user_id = '49d01efc-e309-49be-98f2-684d0d4548e2';
DELETE FROM budget_items  WHERE user_id = '49d01efc-e309-49be-98f2-684d0d4548e2';
DELETE FROM budget_cycles WHERE user_id = '49d01efc-e309-49be-98f2-684d0d4548e2';
DELETE FROM goals         WHERE user_id = '49d01efc-e309-49be-98f2-684d0d4548e2';
