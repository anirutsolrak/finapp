-- migration_pluggy_03_rls.sql
-- RLS para tabelas novas: cada user só lê/escreve as próprias rows.

ALTER TABLE pluggy_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_card_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- pluggy_items
CREATE POLICY "user owns pluggy_items" ON pluggy_items
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- accounts
CREATE POLICY "user owns accounts" ON accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- credit_card_bills (via account → user)
CREATE POLICY "user owns bills via account" ON credit_card_bills
  FOR ALL USING (
    EXISTS (SELECT 1 FROM accounts a WHERE a.id = credit_card_bills.account_id AND a.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM accounts a WHERE a.id = credit_card_bills.account_id AND a.user_id = auth.uid())
  );

-- user_settings
CREATE POLICY "user owns settings" ON user_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
