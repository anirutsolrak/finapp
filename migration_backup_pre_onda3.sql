-- migration_backup_pre_onda3.sql
-- Backup das tabelas antes do wipe da Onda 3 (multi-conta).
-- Schema separado pra preservar histórico sem poluir public.
-- Aplica ANTES de migration_wipe_pre_onda3.sql.

CREATE SCHEMA IF NOT EXISTS backup_2026_05_14;

CREATE TABLE backup_2026_05_14.transactions  AS SELECT * FROM public.transactions;
CREATE TABLE backup_2026_05_14.bills         AS SELECT * FROM public.bills;
CREATE TABLE backup_2026_05_14.budget_items  AS SELECT * FROM public.budget_items;
CREATE TABLE backup_2026_05_14.budget_cycles AS SELECT * FROM public.budget_cycles;
CREATE TABLE backup_2026_05_14.goals         AS SELECT * FROM public.goals;
