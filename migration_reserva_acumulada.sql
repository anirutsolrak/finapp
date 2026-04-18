-- =========================================================================
-- Migração: Reserva como payment_source + acumulação entre ciclos
-- Aplique UMA vez no SQL Editor do Supabase dashboard.
-- =========================================================================

-- 1) Permitir 'reserve' como payment_source em budget_items e transactions
ALTER TABLE budget_items
  DROP CONSTRAINT IF EXISTS budget_items_payment_source_check;
ALTER TABLE budget_items
  ADD CONSTRAINT budget_items_payment_source_check
    CHECK (payment_source IN ('credit','fixed_income','variable_income','reserve'));

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_payment_source_check;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_payment_source_check
    CHECK (payment_source IN ('credit','fixed_income','variable_income','reserve'));

-- 2) Saldo acumulado da reserva entre ciclos
ALTER TABLE budget_cycles
  ADD COLUMN IF NOT EXISTS reserva_acumulada NUMERIC(14,2) DEFAULT 0;
