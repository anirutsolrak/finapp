-- ════════════════════════════════════════════════════════════════════════════
-- FinAPP · 03 · TRIGGERS
-- Liga as funções de 02_functions às tabelas. Rode depois de 02_functions.
-- `drop ... if exists` antes de criar mantém o arquivo idempotente.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── AUTH ────────────────────────────────────────────────────────────────────
-- Cria profile no signup. Trigger vive no schema auth (padrão Supabase).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── TRANSACTIONS ────────────────────────────────────────────────────────────
drop trigger if exists trg_tx_month_ref on public.transactions;
create trigger trg_tx_month_ref
  before insert or update on public.transactions
  for each row execute function public.set_transactions_month_ref();

-- ─── BILLS ───────────────────────────────────────────────────────────────────
drop trigger if exists trg_bills_month_ref on public.bills;
create trigger trg_bills_month_ref
  before insert or update on public.bills
  for each row execute function public.set_bills_month_ref();

drop trigger if exists bills_upd on public.bills;
create trigger bills_upd
  before update on public.bills
  for each row execute function public.update_updated_at();

drop trigger if exists on_bill_paid on public.bills;
create trigger on_bill_paid
  before update on public.bills
  for each row execute function public.bill_paid_rollover();

-- ─── BUDGET_ITEMS ────────────────────────────────────────────────────────────
drop trigger if exists budget_items_upd on public.budget_items;
create trigger budget_items_upd
  before update on public.budget_items
  for each row execute function public.update_updated_at();

drop trigger if exists materialize_on_item_change on public.budget_items;
create trigger materialize_on_item_change
  after insert or update on public.budget_items
  for each row execute function public.trg_item_materialize();

-- ─── BUDGET_CYCLES ───────────────────────────────────────────────────────────
drop trigger if exists materialize_on_cycle_change on public.budget_cycles;
create trigger materialize_on_cycle_change
  after insert on public.budget_cycles
  for each row execute function public.trg_cycle_materialize();

-- ─── GOALS ───────────────────────────────────────────────────────────────────
drop trigger if exists goals_upd on public.goals;
create trigger goals_upd
  before update on public.goals
  for each row execute function public.update_updated_at();

-- ─── TODO.ITEMS ──────────────────────────────────────────────────────────────
drop trigger if exists trg_todo_done_at on todo.items;
create trigger trg_todo_done_at
  before insert or update on todo.items
  for each row execute function todo.set_done_at();
