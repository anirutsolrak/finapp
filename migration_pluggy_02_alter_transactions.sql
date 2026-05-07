-- migration_pluggy_02_alter_transactions.sql
-- Adiciona colunas em transactions pra suporte Pluggy + multi-account + meta vínculo + par anulável.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pluggy_tx_id text,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','pluggy')),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved','pending','ignored')),
  ADD COLUMN IF NOT EXISTS bill_id uuid REFERENCES credit_card_bills(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS card_number text,
  ADD COLUMN IF NOT EXISTS goal_id uuid REFERENCES goals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_tx_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_voided boolean NOT NULL DEFAULT false;

-- pluggy_tx_id deve ser único quando presente (não-nulo)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_transactions_pluggy_tx_id
  ON transactions (pluggy_tx_id)
  WHERE pluggy_tx_id IS NOT NULL;
