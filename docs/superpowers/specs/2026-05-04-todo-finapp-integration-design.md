# Design: Integração Lista ToDo ↔ FinAPP

**Data:** 2026-05-04  
**Escopo:** Fase 1 — importação manual de despesas avulsas da lista familia para lançamentos no FinAPP

---

## Contexto

O app externo [lista-familia.vercel.app](https://lista-familia.vercel.app) é uma lista de compras/gastos familiares hospedada no mesmo projeto Supabase do FinAPP, no schema `todo`. A lista guarda informações ricas (notas, links, valores negociados) que não cabem no planejamento do FinAPP. O objetivo é criar uma ponte entre os dois: itens pagos na lista viram lançamentos no FinAPP, mantendo o controle financeiro completo.

**Fora de escopo (fase 2):** entradas de dinheiro (receitas), criação de gastos fixos recorrentes (budget_items).

---

## Modelo de Dados

### Mudanças em `todo.items`

Três novas colunas rastreiam o ciclo de vida da importação:

```sql
ALTER TABLE todo.items
  ADD COLUMN done_at       TIMESTAMPTZ,
  ADD COLUMN imported_at   TIMESTAMPTZ,
  ADD COLUMN finapp_transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL;
```

| Coluna | Tipo | Descrição |
|---|---|---|
| `done_at` | `timestamptz` | Preenchida por trigger quando `done` vira `true`; zerada quando volta a `false` |
| `imported_at` | `timestamptz` | Quando foi importado para o FinAPP; `null` = ainda não importado |
| `finapp_transaction_id` | `uuid` | FK para `public.transactions.id`; zerado automaticamente via `ON DELETE SET NULL` quando a transação é deletada no FinAPP |

### Trigger `done_at`

```sql
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

CREATE TRIGGER trg_todo_done_at
  BEFORE INSERT OR UPDATE ON todo.items
  FOR EACH ROW EXECUTE FUNCTION todo.set_done_at();
```

### Estados de um item

| `done` | `imported_at` | Estado | UI |
|---|---|---|---|
| `false` | `null` | Pendente | Normal, sem ação |
| `true` | `null` | Aguardando importação | Badge amarelo, checkbox disponível |
| `true` | preenchido | Importado | Esmaecido, badge verde, link para lançamento |

### Schema `todo` no Supabase

Já exposto nas configurações de API do Supabase. O cliente JS acessa via:
```js
supabase.schema('todo').from('items').select('*')
```

---

## Arquitetura

### Novos arquivos

| Arquivo | Descrição |
|---|---|
| `src/pages/ListaPage.jsx` | Página principal da integração |
| `src/lib/todo.js` | Funções de acesso ao schema `todo` e lógica de importação |
| `migration_todo_integration.sql` | Migration com colunas + trigger |

### Mudanças em arquivos existentes

| Arquivo | Mudança |
|---|---|
| `src/App.jsx` | Nova rota `/lista` |
| `src/components/layout/Layout.jsx` | Item "Lista" no menu lateral |
| `src/lib/db.js` | `deleteTransaction` verifica e limpa `todo.items` ao deletar transação originada da lista |

---

## Página `ListaPage`

### Layout

- Itens agrupados por `category` (campo texto da lista)
- Cada item mostra: nome, valor (`R$ X`), notes expandível (links e detalhes ricos)
- Header de grupo com nome da categoria e contagem de itens aguardando importação
- Botão **"Importar selecionados"** na toolbar, ativado quando há itens `done + não importados` selecionados

### Fluxo de importação (modal)

**Passo 1 — Seleção**
- Checkboxes nos itens com estado "Aguardando importação"
- Botão atalho "Selecionar todos prontos"

**Passo 2 — Confirmação de datas**
- Lista os itens selecionados
- Cada item tem campo de data pré-preenchido com `done_at`
- Itens com data posterior a `budget_cycles.end_date` do ciclo corrente ficam em vermelho com mensagem: *"Item do período MM/YYYY — importe-o no período correto ou ajuste a data"*
- Itens fora do período aparecem desabilitados e desmarcados no modal, com o aviso em vermelho — não bloqueiam os outros itens do lote

**Passo 3 — Categorias (opcional)**
- Pergunta: *"Deseja definir categoria específica para algum item?"*
- Se sim: lista os itens do lote com checkbox individual + dropdown com categorias do FinAPP
- Padrão para todos: primeira categoria com `type = 'variable'` da tabela `public.categories`

**Passo 4 — Confirmação e execução**
- Resumo: X itens, total R$ Y
- Ao confirmar:
  1. Cria uma `transaction` por item em `public.transactions` com `type = expense`, `payment_source = fixed_income`, `is_paid = true`
  2. Atualiza `todo.items` com `imported_at = now()` e `finapp_transaction_id = <id da transação criada>`

---

## Undo (desfazer importação)

O undo é tratado via deleção normal da transação no FinAPP (`TransactionsPage`):

- A coluna `finapp_transaction_id` tem `ON DELETE SET NULL` — quando a transação é deletada, o campo zera automaticamente no banco
- O `imported_at` precisa ser zerado explicitamente: `deleteTransaction` em `src/lib/db.js` deve checar se existe um `todo.items` com `finapp_transaction_id = id` e zerar `imported_at` também

```js
export const deleteTransaction = async (id) => {
  // Zera imported_at no item da lista se a transação veio dela
  await supabase.schema('todo').from('items')
    .update({ imported_at: null })
    .eq('finapp_transaction_id', id)
  return supabase.from('transactions').delete().eq('id', id)
}
```

Após isso, o item volta ao estado "Aguardando importação" na `ListaPage`.

---

## Validações e regras de negócio

| Regra | Comportamento |
|---|---|
| Data posterior ao ciclo corrente | Item excluído do lote, mensagem de aviso |
| Item sem valor (`value = null`) | Permitido — transação criada com `amount = 0`; usuário edita depois no FinAPP |
| Importação duplicada | Impossível via UI (itens já importados não têm checkbox); impossível via banco (`imported_at` preenchido) |
| Deleção de transação originada da lista | Zera `imported_at` e `finapp_transaction_id` via `deleteTransaction` atualizado |

---

## Campos da transação criada

| Campo `transactions` | Valor |
|---|---|
| `user_id` | usuário logado no FinAPP |
| `description` | `todo.items.name` |
| `amount` | `todo.items.value` (ou 0 se null) |
| `type` | `expense` |
| `payment_source` | `fixed_income` |
| `date` | data confirmada no modal (padrão: `done_at`) |
| `category_id` | categoria selecionada (padrão: id da primeira categoria com `type = 'variable'`) |
| `is_paid` | `true` |
| `notes` | `todo.items.notes` |
| `month_ref` | derivado da `date` (trigger existente cuida disso) |

---

## Navegação

- Ícone: `ShoppingCart` (Lucide)
- Label: "Lista"
- Posição no menu: após "Lançamentos"
- Rota: `/lista`
