-- seed_accounts_and_cycle.sql
-- Cadastra as 5 contas da família + ciclo 15/05 → 15/06 com valores zerados.
-- Aplica DEPOIS de migration_family_share.sql.
-- user_id usado: Carlos (49d01efc...). Como compartilhamento é total, esposa também vê.

INSERT INTO accounts (user_id, name, type, subtype, default_payment_source, display_order, notes) VALUES
  ('49d01efc-e309-49be-98f2-684d0d4548e2', 'NuBank Conta Corrente', 'bank',     'checking',    'fixed_income',     1, 'Conta principal — entradas e despesas no débito.'),
  ('49d01efc-e309-49be-98f2-684d0d4548e2', 'NuBank Crédito',         'credit',   'credit_card', 'credit',           2, 'Cartão de crédito do NuBank.'),
  ('49d01efc-e309-49be-98f2-684d0d4548e2', 'PicPay Crédito',         'credit',   'credit_card', 'credit',           3, 'Cartão de crédito do PicPay (3 plásticos compartilham fatura).'),
  ('49d01efc-e309-49be-98f2-684d0d4548e2', 'Biplay',                  'credit',   'loan',        'credit',           4, 'Empréstimo rotativo: puxa valor, devolve com juros mês seguinte.'),
  ('49d01efc-e309-49be-98f2-684d0d4548e2', 'Aluguel (esposa)',        'envelope', 'shared',      'variable_income',  5, 'Envelope virtual: entrada esporádica do aluguel + gastos vinculados.');

-- Ciclo 15/05/2026 → 15/06/2026 com valores zerados (user ajusta depois pela UI).
INSERT INTO budget_cycles (user_id, month_ref, start_date, end_date, saldo_origem_income, saldo_origem_credit, reserva_pct, reserva_acumulada) VALUES
  ('49d01efc-e309-49be-98f2-684d0d4548e2', '2026-05', '2026-05-15', '2026-06-15', 0, 0, 15, 0);
