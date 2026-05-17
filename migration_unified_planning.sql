-- migration_unified_planning.sql
-- Onda 8: fusão Planejamento + Agenda de pagamentos.
-- Schema delta aditivo + 2 triggers de materialização + 2 RPCs (pay/unpay).
-- Aplicar via Supabase Dashboard SQL Editor (CLI instável).

-- 1) Schema delta -----------------------------------------------------------
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS bill_id uuid REFERENCES bills(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tx_bill_id ON transactions(bill_id);

ALTER TABLE budget_items
  ADD COLUMN IF NOT EXISTS default_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;

-- 2) Função de materialização ----------------------------------------------
CREATE OR REPLACE FUNCTION materialize_bills_for_item(p_item_id uuid)
RETURNS void AS $$
DECLARE
  v_item RECORD;
  v_cycle RECORD;
  v_due_date date;
BEGIN
  SELECT * INTO v_item FROM budget_items WHERE id = p_item_id AND active = true;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_cycle FROM budget_cycles
    WHERE CURRENT_DATE BETWEEN start_date AND end_date
    LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  v_due_date := make_date(
    EXTRACT(year FROM v_cycle.start_date)::int,
    EXTRACT(month FROM v_cycle.start_date)::int,
    LEAST(COALESCE(v_item.due_day, 15), 28)
  );

  -- budget_items é family-share (sem user_id). Pega user_id do ciclo, que tem.
  INSERT INTO bills (user_id, budget_item_id, name, amount, due_date, month_ref, is_fixed, recurrence, alert_days_before)
  VALUES (v_cycle.user_id, v_item.id, v_item.name, v_item.planned_amount, v_due_date,
          to_char(v_due_date, 'YYYY-MM'),
          v_item.is_fixed,
          CASE WHEN v_item.recurrence = 'once' THEN 'none' ELSE v_item.recurrence END,
          3)
  ON CONFLICT (budget_item_id, month_ref) DO UPDATE
    SET amount = EXCLUDED.amount, name = EXCLUDED.name, due_date = EXCLUDED.due_date
    WHERE bills.is_paid = false;
END;
$$ LANGUAGE plpgsql;

-- 3) Triggers de materialização --------------------------------------------
CREATE OR REPLACE FUNCTION trg_item_materialize()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.active = true THEN PERFORM materialize_bills_for_item(NEW.id); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS materialize_on_item_change ON budget_items;
CREATE TRIGGER materialize_on_item_change
  AFTER INSERT OR UPDATE ON budget_items
  FOR EACH ROW EXECUTE FUNCTION trg_item_materialize();

CREATE OR REPLACE FUNCTION trg_cycle_materialize()
RETURNS TRIGGER AS $$
DECLARE v_item RECORD;
BEGIN
  FOR v_item IN
    SELECT id FROM budget_items WHERE active = true AND recurrence != 'once'
  LOOP
    PERFORM materialize_bills_for_item(v_item.id);
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS materialize_on_cycle_change ON budget_cycles;
CREATE TRIGGER materialize_on_cycle_change
  AFTER INSERT ON budget_cycles
  FOR EACH ROW EXECUTE FUNCTION trg_cycle_materialize();

-- 4) RPCs (atomicidade pay/unpay) ------------------------------------------
CREATE OR REPLACE FUNCTION pay_bill(
  p_bill_id uuid, p_account_id uuid, p_amount numeric, p_date date,
  p_payment_source text, p_category_id uuid, p_budget_item_id uuid
) RETURNS uuid AS $$
DECLARE v_tx_id uuid; v_user_id uuid; v_name text;
BEGIN
  SELECT user_id, name INTO v_user_id, v_name FROM bills WHERE id = p_bill_id;
  INSERT INTO transactions
    (user_id, type, amount, date, account_id, payment_source, category_id,
     budget_item_id, bill_id, description)
  VALUES
    (v_user_id, 'expense', p_amount, p_date, p_account_id, p_payment_source,
     p_category_id, p_budget_item_id, p_bill_id, v_name)
  RETURNING id INTO v_tx_id;
  UPDATE bills SET is_paid = true, paid_at = now() WHERE id = p_bill_id;
  RETURN v_tx_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION unpay_bill(p_bill_id uuid) RETURNS void AS $$
BEGIN
  DELETE FROM transactions WHERE bill_id = p_bill_id;
  UPDATE bills SET is_paid = false, paid_at = NULL WHERE id = p_bill_id;
END;
$$ LANGUAGE plpgsql;
