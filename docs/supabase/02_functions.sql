-- ════════════════════════════════════════════════════════════════════════════
-- FinAPP · 02 · FUNCTIONS
-- Funções de apoio (triggers e RPCs). Rode depois de 01_schema.
-- Os triggers que chamam estas funções estão em 03_triggers.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── UTIL ────────────────────────────────────────────────────────────────────
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- Deriva month_ref ('YYYY-MM') de date/due_date quando não informado.
create or replace function public.set_transactions_month_ref()
returns trigger language plpgsql as $$
begin
  if new.month_ref is null and new.date is not null then
    new.month_ref := to_char(new.date::date, 'YYYY-MM');
  end if;
  return new;
end;
$$;

create or replace function public.set_bills_month_ref()
returns trigger language plpgsql as $$
begin
  if new.month_ref is null and new.due_date is not null then
    new.month_ref := to_char(new.due_date::date, 'YYYY-MM');
  end if;
  return new;
end;
$$;

-- ─── ONBOARDING ──────────────────────────────────────────────────────────────
-- Cria o profile automaticamente quando um usuário se cadastra no Auth.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  raise log 'handle_new_user error: %', sqlerrm;
  return new;
end;
$$;

-- ─── MATERIALIZAÇÃO DE BILLS ─────────────────────────────────────────────────
-- Gera a bill do ciclo corrente a partir de um budget_item ativo.
-- ON CONFLICT DO NOTHING: nunca sobrescreve bill já existente (preserva paga/editada).
create or replace function public.materialize_bills_for_item(p_item_id uuid)
returns void language plpgsql as $$
declare v_item record; v_cycle record; v_due date;
begin
  select * into v_item from budget_items where id = p_item_id and active = true;
  if not found then return; end if;

  select * into v_cycle from budget_cycles
    where current_date between start_date and end_date
    order by end_date limit 1;
  if not found then return; end if;

  v_due := make_date(
    extract(year  from v_cycle.end_date)::int,
    extract(month from v_cycle.end_date)::int,
    least(coalesce(v_item.due_day, 15), 28));

  insert into bills (user_id, budget_item_id, name, amount, due_date, month_ref,
                     is_fixed, recurrence, alert_days_before)
  values (v_cycle.user_id, v_item.id, v_item.name, v_item.planned_amount, v_due,
          to_char(v_due, 'YYYY-MM'), v_item.is_fixed,
          case when v_item.recurrence = 'once' then 'none' else v_item.recurrence end, 3)
  on conflict (budget_item_id, month_ref) do nothing;
end;
$$;

-- Trigger fn: materializa quando um item é criado/ativado.
create or replace function public.trg_item_materialize()
returns trigger language plpgsql as $$
begin
  if new.active = true then perform materialize_bills_for_item(new.id); end if;
  return new;
end;
$$;

-- Trigger fn: ao abrir um ciclo novo, materializa todos os itens recorrentes ativos.
create or replace function public.trg_cycle_materialize()
returns trigger language plpgsql as $$
declare v_item record;
begin
  for v_item in select id from budget_items where active = true and recurrence != 'once'
  loop
    perform materialize_bills_for_item(v_item.id);
  end loop;
  return new;
end;
$$;

-- Ao pagar uma bill recorrente, abre automaticamente a do próximo período.
create or replace function public.bill_paid_rollover()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_next_due date; v_next_month text; v_interval interval;
begin
  if old.is_paid = false and new.is_paid = true then
    new.paid_at := now();

    if    new.recurrence = 'monthly' then v_interval := interval '1 month';
    elsif new.recurrence = 'yearly'  then v_interval := interval '1 year';
    else  return new;  -- 'once'/'none': não gera próxima
    end if;

    v_next_due   := new.due_date + v_interval;
    v_next_month := to_char(v_next_due, 'YYYY-MM');

    if new.budget_item_id is not null then
      insert into bills (budget_item_id, name, amount, due_date, month_ref, is_fixed, is_paid, recurrence, alert_days_before)
      values (new.budget_item_id, new.name, new.amount, v_next_due, v_next_month, new.is_fixed, false, new.recurrence, new.alert_days_before)
      on conflict (budget_item_id, month_ref) do nothing;
    else
      insert into bills (name, amount, due_date, month_ref, is_fixed, is_paid, recurrence, alert_days_before, user_id)
      values (new.name, new.amount, v_next_due, v_next_month, new.is_fixed, false, new.recurrence, new.alert_days_before, new.user_id);
    end if;
  end if;

  if old.is_paid = true and new.is_paid = false then
    new.paid_at := null;
  end if;
  return new;
end;
$$;

-- ─── RPCs DE PAGAMENTO ───────────────────────────────────────────────────────
-- Paga uma bill: cria a transaction de despesa e marca a bill como paga. Atômico.
create or replace function public.pay_bill(
  p_bill_id uuid, p_account_id uuid, p_amount numeric, p_date date,
  p_payment_source text, p_category_id uuid, p_budget_item_id uuid)
returns uuid language plpgsql as $$
declare v_tx_id uuid; v_user_id uuid; v_name text;
begin
  select user_id, name into v_user_id, v_name from bills where id = p_bill_id;
  insert into transactions
    (user_id, type, amount, date, account_id, payment_source, category_id,
     budget_item_id, bill_id, description)
  values
    (v_user_id, 'expense', p_amount, p_date, p_account_id, p_payment_source,
     p_category_id, p_budget_item_id, p_bill_id, v_name)
  returning id into v_tx_id;
  update bills set is_paid = true, paid_at = now() where id = p_bill_id;
  return v_tx_id;
end;
$$;

-- Desfaz o pagamento: apaga a transaction vinculada e reabre a bill.
create or replace function public.unpay_bill(p_bill_id uuid)
returns void language plpgsql as $$
begin
  delete from transactions where bill_id = p_bill_id;
  update bills set is_paid = false, paid_at = null where id = p_bill_id;
end;
$$;

-- ─── TODO ────────────────────────────────────────────────────────────────────
-- Carimba done_at quando um item é concluído (e limpa quando reaberto).
create or replace function todo.set_done_at()
returns trigger language plpgsql as $$
begin
  if new.done = true and (old is null or old.done = false or old.done is null) then
    new.done_at := now();
  elsif new.done = false then
    new.done_at := null;
  end if;
  return new;
end;
$$;
