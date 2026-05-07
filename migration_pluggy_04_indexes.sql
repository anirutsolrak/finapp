-- migration_pluggy_04_indexes.sql
-- Índices pra busca eficiente.

CREATE INDEX IF NOT EXISTS idx_pluggy_items_user ON pluggy_items(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_item ON accounts(pluggy_item_id);
CREATE INDEX IF NOT EXISTS idx_bills_account ON credit_card_bills(account_id);
CREATE INDEX IF NOT EXISTS idx_bills_due ON credit_card_bills(due_date);

CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_transactions_bill ON transactions(bill_id) WHERE bill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_goal ON transactions(goal_id) WHERE goal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_linked ON transactions(linked_tx_id) WHERE linked_tx_id IS NOT NULL;
