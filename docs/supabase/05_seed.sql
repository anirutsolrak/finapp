-- ════════════════════════════════════════════════════════════════════════════
-- FinAPP · 05 · SEED
-- Dados iniciais opcionais. Categorias são compartilhadas (sem user_id) e
-- necessárias pro app funcionar. Conta e ciclo iniciais ficam comentados —
-- descomente e ajuste o user_id depois de criar seu usuário no Auth.
-- Rode depois de 04_rls. Idempotente via ON CONFLICT (name).
-- ════════════════════════════════════════════════════════════════════════════

-- ─── CATEGORIAS BASE ─────────────────────────────────────────────────────────
insert into public.categories (name, type, icon, color, sort_order) values
  ('Salário',        'income',      '💰', '#22c55e', 1),
  ('Renda Extra',    'income',      '✨', '#84cc16', 2),
  ('Moradia',        'essential',   '🏠', '#6366f1', 3),
  ('Contas',         'essential',   '🧾', '#0ea5e9', 4),
  ('Mercado',        'essential',   '🛒', '#14b8a6', 5),
  ('Transporte',     'essential',   '🚗', '#f97316', 6),
  ('Saúde',          'essential',   '🩺', '#ef4444', 7),
  ('Lazer',          'variable',    '🎉', '#ec4899', 8),
  ('Restaurante',    'variable',    '🍽️', '#f59e0b', 9),
  ('Compras',        'variable',    '🛍️', '#a855f7', 10),
  ('Assinaturas',    'variable',    '📺', '#8b5cf6', 11),
  ('Investimentos',  'investment',  '📈', '#10b981', 12),
  ('Parcelamentos',  'installment', '💳', '#64748b', 13),
  ('Reserva',        'reserve',     '🛟', '#0891b2', 14)
on conflict (name) do nothing;

-- ─── CONTA INICIAL (opcional) ────────────────────────────────────────────────
-- Substitua '<SEU_USER_ID>' pelo id do seu usuário (auth.users / Dashboard > Auth).
--
-- insert into public.accounts (user_id, name, type, subtype, opening_balance, default_payment_source)
-- values ('<SEU_USER_ID>', 'Conta Corrente', 'bank', 'checking', 0, 'fixed_income');
--
-- insert into public.accounts (user_id, name, type, subtype, credit_limit, default_payment_source)
-- values ('<SEU_USER_ID>', 'Cartão de Crédito', 'credit', 'credit_card', 5000, 'credit');

-- ─── CICLO DO MÊS CORRENTE (opcional) ────────────────────────────────────────
-- O app também cria/edita o ciclo pela tela de Orçamento. Exemplo manual:
--
-- insert into public.budget_cycles (user_id, month_ref, start_date, end_date, reserva_pct)
-- values (
--   '<SEU_USER_ID>',
--   to_char(current_date, 'YYYY-MM'),
--   date_trunc('month', current_date)::date,
--   (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
--   10
-- )
-- on conflict (user_id, month_ref) do nothing;
