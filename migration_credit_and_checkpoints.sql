-- =========================================================================
-- Migração: Crédito isolado + Fonte de pagamento + Ciclos + Checkpoints
-- Aplique UMA vez no SQL Editor do Supabase dashboard.
-- =========================================================================

-- 1) payment_source em budget_items e transactions -------------------------
ALTER TABLE budget_items
  ADD COLUMN IF NOT EXISTS payment_source TEXT
    CHECK (payment_source IN ('credit','fixed_income','variable_income'))
    DEFAULT 'fixed_income';

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS payment_source TEXT
    CHECK (payment_source IN ('credit','fixed_income','variable_income'))
    DEFAULT 'fixed_income';

UPDATE budget_items  SET payment_source = 'fixed_income' WHERE payment_source IS NULL;
UPDATE transactions  SET payment_source = 'fixed_income' WHERE payment_source IS NULL;

ALTER TABLE budget_items ALTER COLUMN payment_source SET NOT NULL;
ALTER TABLE transactions ALTER COLUMN payment_source SET NOT NULL;

-- 2) Ciclo de planejamento (um por user+mês) ------------------------------
CREATE TABLE IF NOT EXISTS budget_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month_ref TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  saldo_origem_income NUMERIC(14,2) DEFAULT 0,
  saldo_origem_credit NUMERIC(14,2) DEFAULT 0,
  reserva_pct NUMERIC(5,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, month_ref)
);

ALTER TABLE budget_cycles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS budget_cycles_owner ON budget_cycles;
CREATE POLICY budget_cycles_owner ON budget_cycles
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 3) Checkpoints semanais ------------------------------------------------
CREATE TABLE IF NOT EXISTS weekly_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cycle_id UUID REFERENCES budget_cycles(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end   DATE NOT NULL,
  bucket TEXT NOT NULL CHECK (bucket IN ('income','credit')),
  saldo_previsto NUMERIC(14,2) NOT NULL,
  saldo_real     NUMERIC(14,2) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('green','yellow','red')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, week_start, bucket)
);

ALTER TABLE weekly_checkpoints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS weekly_checkpoints_owner ON weekly_checkpoints;
CREATE POLICY weekly_checkpoints_owner ON weekly_checkpoints
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4) Auto-seed do ciclo do mês corrente para cada user com items ---------
INSERT INTO budget_cycles (user_id, month_ref, start_date, end_date, saldo_origem_income, saldo_origem_credit, reserva_pct)
SELECT
  bi.created_by AS user_id,
  to_char(CURRENT_DATE, 'YYYY-MM') AS month_ref,
  date_trunc('month', CURRENT_DATE)::date AS start_date,
  (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date AS end_date,
  COALESCE(SUM(CASE
    WHEN bi.payment_source IN ('fixed_income','variable_income')
     AND c.type = 'income'
     AND bi.active = true
    THEN bi.planned_amount ELSE 0 END), 0) AS saldo_origem_income,
  COALESCE(SUM(CASE
    WHEN bi.payment_source = 'credit'
     AND c.type = 'income'
     AND bi.active = true
    THEN bi.planned_amount ELSE 0 END), 0) AS saldo_origem_credit,
  0 AS reserva_pct
FROM budget_items bi
JOIN categories   c ON c.id = bi.category_id
WHERE bi.created_by IS NOT NULL
GROUP BY bi.created_by
ON CONFLICT (user_id, month_ref) DO NOTHING;
