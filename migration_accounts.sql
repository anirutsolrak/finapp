-- migration_accounts.sql
-- Tabela de contas (multi-conta da Onda 3).
-- Adiciona account_id / from_account_id / to_account_id em transactions.

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('bank', 'credit', 'envelope')),
  subtype text,
  default_payment_source text CHECK (default_payment_source IN ('fixed_income','variable_income','credit','reserve')),
  is_active boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS account_id      uuid REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS from_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS to_account_id   uuid REFERENCES accounts(id) ON DELETE SET NULL;

ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user owns accounts" ON accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_accounts_user
  ON accounts(user_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_transactions_account
  ON transactions(account_id) WHERE account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_from_account
  ON transactions(from_account_id) WHERE from_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_to_account
  ON transactions(to_account_id) WHERE to_account_id IS NOT NULL;
