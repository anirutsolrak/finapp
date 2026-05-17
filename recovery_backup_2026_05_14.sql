-- recovery_backup_2026_05_14.sql
-- Recupera bills recorrentes do backup pré-Onda3 como budget_items.
-- Critério: nome aparece em >= 2 meses distintos no backup.
-- user_id = Carlos. Esposa vê via family-share RLS.
-- Aplica APÓS migration_unified_planning.sql.

INSERT INTO budget_items
  (user_id, name, planned_amount, payment_source, recurrence, due_day, is_fixed, active, category_id)
SELECT
  '49d01efc-e309-49be-98f2-684d0d4548e2'::uuid,
  initcap(lower(min(b.name))),
  round(avg(b.amount)::numeric, 2),
  CASE WHEN min(lower(b.name)) LIKE '%fatura%' THEN 'credit' ELSE 'fixed_income' END,
  'monthly',
  max(EXTRACT(day FROM b.due_date))::int,
  true,
  true,
  NULL
FROM backup_2026_05_14.bills b
WHERE b.name IS NOT NULL
GROUP BY lower(b.name)
HAVING count(DISTINCT to_char(b.due_date, 'YYYY-MM')) >= 2;
