-- datafix_junho_unpaid_20260608.sql
-- One-off (2026-06-08): as bills de junho (month_ref 2026-06, vencimento 15/06)
-- nasceram is_paid=true por engano na migração — elas só seriam pagas em 15/06.
-- Nenhuma tinha transação vinculada (bill_id), então desmarcar NÃO afeta saldo.
--
-- Conferido antes: 11 bills pagas erradas em 2026-06 (Luz/junho já estava pendente).

UPDATE bills
SET is_paid = false, paid_at = NULL
WHERE month_ref = '2026-06' AND is_paid = true;

-- Verificação esperada depois: 0 pagas / 12 pendentes em 2026-06.
-- select count(*) filter (where is_paid), count(*) filter (where not is_paid)
-- from bills where month_ref = '2026-06';
