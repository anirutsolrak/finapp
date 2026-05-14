-- migration_goal_link.sql
-- Vincula transações a metas (modelo "espelho honesto" da Onda 2).
-- Saldo da meta = current_amount inicial + SUM(transfer.amount) - SUM(expense.amount) onde goal_id = X.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS goal_id uuid REFERENCES goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_goal
  ON transactions(goal_id) WHERE goal_id IS NOT NULL;
