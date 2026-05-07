-- migration_pluggy_01_tables.sql
-- Cria tabelas pra integração Pluggy: items (conexões), accounts (contas dentro de items),
-- credit_card_bills (faturas), user_settings (cutoff_date e futuras configs).

CREATE TABLE IF NOT EXISTS pluggy_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pluggy_item_id text NOT NULL UNIQUE,
  connector_name text NOT NULL,
  status text NOT NULL DEFAULT 'UPDATED',
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pluggy_item_id uuid NOT NULL REFERENCES pluggy_items(id) ON DELETE CASCADE,
  pluggy_account_id text NOT NULL UNIQUE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('BANK','CREDIT')),
  subtype text,
  payment_source text NOT NULL CHECK (payment_source IN ('fixed_income','variable_income','credit','reserve')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_card_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  pluggy_bill_id text NOT NULL UNIQUE,
  due_date date NOT NULL,
  total_amount numeric NOT NULL DEFAULT 0,
  paid_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','PARTIAL','PAID')),
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pluggy_cutoff_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
