-- Rodar uma vez no SQL Editor do Dashboard Supabase. Idempotente.
--
-- Remove o trigger que criava uma conta (bill) no mês do ciclo atual a cada
-- insert/update de budget_items. Ele existia para itens criados pela IA do chat,
-- que saiu do app. Efeitos colaterais que somem com a remoção:
--   - item novo criado num mês futuro ganhava também uma conta no mês atual;
--   - conta excluída "só do mês" voltava ao editar categoria/fonte do item.
-- O app já cria a conta do mês em foco por conta própria (createBillForPeriod).
--
-- Atenção: a branch `legado` dependia deste trigger para os itens criados pelo chat.

drop trigger if exists materialize_on_item_change on public.budget_items;
