-- migration_pluggy_05_seed_settings.sql
-- Backfill user_settings pros usuários existentes (cutoff = data atual).

INSERT INTO user_settings (user_id, pluggy_cutoff_date)
SELECT id, CURRENT_DATE FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
