-- migration_reconcile_triggers.sql
-- Reconciliação das triggers de materialização de bills (2026-06-08).
--
-- CONTEXTO / BUG:
-- Existiam DUAS triggers materializando bills em meses diferentes no INSERT/UPDATE
-- de budget_items, gerando duplicação (todo item nascia com bill em 2 meses):
--   1) materialize_on_item_change -> materialize_bills_for_item  (usava o mês do
--      START do ciclo => maio)
--   2) on_budget_item_upsert      -> sync_budget_item_to_bill     (LEGADA, fora do
--      repo; usava o mês do CALENDÁRIO => junho)
-- Essa divergência era a origem das bills de junho que nasceram pagas por engano
-- na migração anterior.
--
-- DECISÃO:
-- Regra única = materializar no MÊS DE PAGAMENTO do ciclo vigente (mês do end_date;
-- ciclo 14/05->15/06 paga em junho). INSERT-only (ON CONFLICT DO NOTHING) para
-- preservar valores per-período e nunca tocar bill paga.
-- A trigger materialize_on_item_change (e a função abaixo) é mantida porque o fluxo
-- da IA (ChatPage) cria budget_items e depende dela pra materializar a bill.
--
-- Aplicado via Supabase Dashboard (CLI instável). Backup feito antes:
--   create table bills_backup_20260608 as select * from bills;

-- 1) Função única: materializa no mês de pagamento (end_date), INSERT-only.
CREATE OR REPLACE FUNCTION materialize_bills_for_item(p_item_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_item  RECORD;
  v_cycle RECORD;
  v_due   date;
BEGIN
  SELECT * INTO v_item FROM budget_items WHERE id = p_item_id AND active = true;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_cycle FROM budget_cycles
    WHERE CURRENT_DATE BETWEEN start_date AND end_date
    ORDER BY end_date
    LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  -- Mês de PAGAMENTO = mês do end_date do ciclo.
  v_due := make_date(
    EXTRACT(year  FROM v_cycle.end_date)::int,
    EXTRACT(month FROM v_cycle.end_date)::int,
    LEAST(COALESCE(v_item.due_day, 15), 28)
  );

  INSERT INTO bills (user_id, budget_item_id, name, amount, due_date, month_ref,
                     is_fixed, recurrence, alert_days_before)
  VALUES (v_cycle.user_id, v_item.id, v_item.name, v_item.planned_amount, v_due,
          to_char(v_due, 'YYYY-MM'),
          v_item.is_fixed,
          CASE WHEN v_item.recurrence = 'once' THEN 'none' ELSE v_item.recurrence END,
          3)
  ON CONFLICT (budget_item_id, month_ref) DO NOTHING;  -- preserva per-período e paga
END;
$$;

-- 2) Remove a trigger legada duplicada (calendário). A função fica órfã (sem trigger).
DROP TRIGGER IF EXISTS on_budget_item_upsert ON budget_items;
-- Opcional (não removido por segurança): DROP FUNCTION IF EXISTS sync_budget_item_to_bill();
