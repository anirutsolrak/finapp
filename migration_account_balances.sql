-- migration_account_balances.sql
-- Onda 4: adiciona saldo inicial (bank/envelope) e limite de crédito (credit) nas contas.
-- Saldo atual passa a ser derivado: opening_balance + Σ(entradas − saídas) vinculadas via account_id.
-- cycle.saldo_origem_income e cycle.saldo_origem_credit ficam deprecated (não removidos).

ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_limit    numeric NOT NULL DEFAULT 0;
