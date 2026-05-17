-- migration_family_share.sql
-- Compartilhamento familiar: qualquer usuário autenticado vê e edita tudo.
-- Aplica nas 6 tabelas: transactions, bills, budget_cycles, goals, accounts, budget_items.
-- Funciona porque o projeto só tem 2 users (Carlos + Gabriele, mesma família).
--
-- Nota: a policy nova convive com policies antigas. Como Postgres combina
-- policies com OR, a mais permissiva prevalece. Limpeza das antigas pode
-- ser feita num commit futuro (não é necessário pra funcionar).

CREATE POLICY "family_share_transactions" ON transactions
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "family_share_bills" ON bills
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "family_share_budget_cycles" ON budget_cycles
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "family_share_goals" ON goals
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "user owns accounts" ON accounts;
CREATE POLICY "family_share_accounts" ON accounts
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- budget_items virou family-share quando wipe pre-Onda3 removeu user_id da tabela.
-- A policy antiga ("user owns budget_items") referenciava user_id e quebrou silenciosamente
-- — UPDATEs retornavam 0 rows sem erro. Limpa antigas e adiciona permissiva.
DROP POLICY IF EXISTS "user owns budget_items" ON budget_items;
DROP POLICY IF EXISTS "budget_items_user_policy" ON budget_items;
DROP POLICY IF EXISTS "Users can manage their budget items" ON budget_items;
CREATE POLICY "family_share_budget_items" ON budget_items
  FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
