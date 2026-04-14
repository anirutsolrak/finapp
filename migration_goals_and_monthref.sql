-- =========================================================================
-- Migração: Metas com agressividade + dots + backfill month_ref
-- Rode este arquivo uma vez no SQL Editor do Supabase (dashboard)
-- =========================================================================

-- 1) Novas colunas em goals --------------------------------------------------
ALTER TABLE goals
  ADD COLUMN IF NOT EXISTS aggressiveness TEXT
    CHECK (aggressiveness IN ('very_high','high','medium','low','very_low')),
  ADD COLUMN IF NOT EXISTS total_months     INTEGER,
  ADD COLUMN IF NOT EXISTS months_completed INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_computed_at   TIMESTAMPTZ;

-- 2) Backfill de month_ref em transações/bills (corrige dashboard zerado) ---
UPDATE transactions
   SET month_ref = to_char(date::date, 'YYYY-MM')
 WHERE month_ref IS NULL
   AND date IS NOT NULL;

UPDATE bills
   SET month_ref = to_char(due_date::date, 'YYYY-MM')
 WHERE month_ref IS NULL
   AND due_date IS NOT NULL;

-- 3) Trigger para garantir month_ref sempre preenchido ao inserir/editar ---
CREATE OR REPLACE FUNCTION set_transactions_month_ref()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.month_ref IS NULL AND NEW.date IS NOT NULL THEN
    NEW.month_ref := to_char(NEW.date::date, 'YYYY-MM');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tx_month_ref ON transactions;
CREATE TRIGGER trg_tx_month_ref
  BEFORE INSERT OR UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION set_transactions_month_ref();

CREATE OR REPLACE FUNCTION set_bills_month_ref()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.month_ref IS NULL AND NEW.due_date IS NOT NULL THEN
    NEW.month_ref := to_char(NEW.due_date::date, 'YYYY-MM');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bills_month_ref ON bills;
CREATE TRIGGER trg_bills_month_ref
  BEFORE INSERT OR UPDATE ON bills
  FOR EACH ROW EXECUTE FUNCTION set_bills_month_ref();

-- 4) Tornar bills.month_ref NOT NULL e recriar unique index ---------------
-- (aplicado manualmente em prod em 2026-04-14 para resolver conflitos de
-- duplicidade de bills geradas pelo Planejamento. Registrado aqui para
-- manter histórico reproduzível.)
BEGIN;
ALTER TABLE public.bills ALTER COLUMN month_ref SET NOT NULL;
DROP INDEX IF EXISTS public.bills_budget_item_month_unique;
CREATE UNIQUE INDEX bills_budget_item_month_unique
  ON public.bills (budget_item_id, month_ref);
COMMIT;

-- 5) Validação do índice (opcional — só para conferência) -----------------
-- SELECT i.relname AS index_name, pg_get_expr(idx.indpred, idx.indrelid) AS predicate
--   FROM pg_index idx
--   JOIN pg_class i ON i.oid = idx.indexrelid
--   JOIN pg_class t ON t.oid = idx.indrelid
--  WHERE t.relname = 'bills'
--    AND i.relname = 'bills_budget_item_month_unique'
--    AND idx.indisunique = true;
