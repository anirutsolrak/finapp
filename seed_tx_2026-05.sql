-- seed_tx_2026-05.sql
-- Primeira importação manual: extrato NuBank CC (01-15/05) + fatura NuBank Crédito (3 compras) + PicPay R$ 77.
-- Aplica DEPOIS de seed_accounts_and_cycle.sql + migration_account_balances.sql.
-- user_id Carlos (49d01efc-...). Como RLS familiar é permissiva, esposa também vê.
--
-- Decisões de mapeamento:
--   - "Pagamento de fatura -293,30" do extrato fica como expense fixed_income (modelo simples).
--     A linha equivalente "Pagamento recebido -293,30" da fatura.csv NÃO entra aqui pra evitar
--     duplicação. O cartão começa o ciclo limpo, mostrando só as 3 compras novas.
--   - "PIX Blipay -211,02" fica como expense (não como transfer pra Biplay), pelo mesmo motivo —
--     Biplay aparece zerado no ciclo. Se quiser rastrear empréstimo formalmente, edita depois.
--   - Categoria fica NULL em todas. Categorize pela UI conforme for usando.

-- 1) Ajusta credit_limit do PicPay (caso não tenha preenchido pelo /settings).
UPDATE accounts SET credit_limit = 200 WHERE name = 'PicPay Crédito';

-- 2) Insere 42 transactions de maio/2026.
INSERT INTO transactions
  (user_id, type, amount, date, month_ref, description, account_id, payment_source, is_paid)
VALUES
  -- ─── 01/05 ──────────────────────────────────────────────────────────────
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',    45.78,'2026-05-01','2026-05','Droga Leste LJ33',                      (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),

  -- ─── 02/05 ──────────────────────────────────────────────────────────────
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',    24.00,'2026-05-02','2026-05','Moris Comércio',                        (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',    10.00,'2026-05-02','2026-05','Diego Moraes',                          (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',    10.00,'2026-05-02','2026-05','Maria de Lourdes',                      (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',    23.50,'2026-05-02','2026-05','Comércio Diversos',                     (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',    16.00,'2026-05-02','2026-05','Álvaro Pescados',                       (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',   400.00,'2026-05-02','2026-05','PIX Gabriele Silva (esposa)',           (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),

  -- ─── 03/05 ──────────────────────────────────────────────────────────────
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',    20.98,'2026-05-03','2026-05','Açaiteria Rafaello',                    (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',   166.80,'2026-05-03','2026-05','The Factory',                           (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),

  -- ─── 04/05 ──────────────────────────────────────────────────────────────
  ('49d01efc-e309-49be-98f2-684d0d4548e2','income',     44.90,'2026-05-04','2026-05','Resgate RDB',                           (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',    44.90,'2026-05-04','2026-05','Claro Flex (débito)',                   (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),

  -- ─── 05/05 ──────────────────────────────────────────────────────────────
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',    33.00,'2026-05-05','2026-05','PIX Gabriele Silva (esposa)',           (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),

  -- ─── 06/05 ──────────────────────────────────────────────────────────────
  ('49d01efc-e309-49be-98f2-684d0d4548e2','income',     79.00,'2026-05-06','2026-05','Resgate RDB',                           (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',    29.00,'2026-05-06','2026-05','PIX RecargaPay (Carlos)',               (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),

  -- ─── 07/05 ──────────────────────────────────────────────────────────────
  ('49d01efc-e309-49be-98f2-684d0d4548e2','income',    170.00,'2026-05-07','2026-05','PIX recebido (BMP)',                    (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),

  -- ─── 08/05 ──────────────────────────────────────────────────────────────
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',   170.00,'2026-05-08','2026-05','PIX Gabriele Silva (esposa)',           (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',    50.00,'2026-05-08','2026-05','PIX Vanderlei Rosa',                    (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),

  -- ─── 14/05 — dia do salário e maior volume ──────────────────────────────
  ('49d01efc-e309-49be-98f2-684d0d4548e2','income',   8981.98,'2026-05-14','2026-05','Salário (Solução Cooperativa)',         (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',    58.59,'2026-05-14','2026-05','LRV Mercadinho',                        (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',    10.95,'2026-05-14','2026-05','Quitanda Tama',                         (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',    45.99,'2026-05-14','2026-05','Mercado Timaia',                        (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',   293.30,'2026-05-14','2026-05','Pagamento fatura NuBank Crédito',       (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',   188.82,'2026-05-14','2026-05','PIX PicPay',                            (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',     9.31,'2026-05-14','2026-05','PIX PicPay (Carlos)',                   (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',   211.02,'2026-05-14','2026-05','PIX Biplay (pagamento empréstimo)',     (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',   123.54,'2026-05-14','2026-05','Boleto Claro',                          (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',    15.50,'2026-05-14','2026-05','Bruna Paes e Doces',                    (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',    59.97,'2026-05-14','2026-05','Droga Leste LJ33',                      (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',   922.00,'2026-05-14','2026-05','PIX Maria de Fátima Santos',            (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',  1522.00,'2026-05-14','2026-05','PIX Antonio Arquilino',                 (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',   187.00,'2026-05-14','2026-05','PIX Gabriele Silva (esposa)',           (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),

  -- ─── 15/05 ──────────────────────────────────────────────────────────────
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',    93.46,'2026-05-15','2026-05','Comercial Zampieri',                    (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',   179.00,'2026-05-15','2026-05','Valfredo Alves',                        (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',    35.00,'2026-05-15','2026-05','Art Cão',                               (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',   137.66,'2026-05-15','2026-05','LRV Mercadinho',                        (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',    30.00,'2026-05-15','2026-05','Bruna Paes e Doces',                    (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',   211.54,'2026-05-15','2026-05','PIX Santander (SHPP)',                  (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',   376.37,'2026-05-15','2026-05','PIX Santander (SHPP)',                  (SELECT id FROM accounts WHERE name='NuBank Conta Corrente' LIMIT 1),'fixed_income',true),

  -- ─── Fatura NuBank Crédito (ciclo corrente — 3 compras) ────────────────
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',     4.01,'2026-05-15','2026-05','IOF de compra internacional',           (SELECT id FROM accounts WHERE name='NuBank Crédito' LIMIT 1),'credit',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',   114.74,'2026-05-15','2026-05','Claude.AI Subscription',                (SELECT id FROM accounts WHERE name='NuBank Crédito' LIMIT 1),'credit',true),
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',    19.90,'2026-05-16','2026-05','Mp *Melimais (MercadoLivre)',           (SELECT id FROM accounts WHERE name='NuBank Crédito' LIMIT 1),'credit',true),

  -- ─── PicPay Crédito (Xbox Game Pass) ───────────────────────────────────
  ('49d01efc-e309-49be-98f2-684d0d4548e2','expense',    77.00,'2026-05-16','2026-05','Xbox Game Pass (assinatura)',           (SELECT id FROM accounts WHERE name='PicPay Crédito' LIMIT 1),'credit',true);
