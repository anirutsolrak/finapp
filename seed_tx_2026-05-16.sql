-- seed_tx_2026-05-16.sql
-- Tx novas do dia 16/05 (NuBank Conta Corrente, fixed_income).
-- Aplica DEPOIS de seed_tx_2026-05.sql.

INSERT INTO transactions
  (user_id, type, amount, date, month_ref, description, account_id, payment_source, is_paid)
VALUES
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',  304.23,'2026-05-16','2026-05','Gastos esporádicos (débito)',           (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense', 2450.00,'2026-05-16','2026-05','Salão de festa (Agens)',                (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true);
