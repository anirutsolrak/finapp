-- migration_todo_integration.sql
-- Adiciona rastreamento de importação em todo.items

ALTER TABLE todo.items
  ADD COLUMN IF NOT EXISTS done_at                TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS imported_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finapp_transaction_id  UUID REFERENCES public.transactions(id) ON DELETE SET NULL;

-- Trigger: preenche done_at ao marcar done=true, zera ao desmarcar
CREATE OR REPLACE FUNCTION todo.set_done_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.done = true AND (OLD IS NULL OR OLD.done = false OR OLD.done IS NULL) THEN
    NEW.done_at := now();
  ELSIF NEW.done = false THEN
    NEW.done_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_todo_done_at ON todo.items;
CREATE TRIGGER trg_todo_done_at
  BEFORE INSERT OR UPDATE ON todo.items
  FOR EACH ROW EXECUTE FUNCTION todo.set_done_at();

-- Backfill: itens já marcados como done recebem done_at = created_at
UPDATE todo.items SET done_at = created_at WHERE done = true AND done_at IS NULL;
