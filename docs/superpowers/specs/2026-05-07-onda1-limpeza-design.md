# Onda 1 — Limpeza zero-risco

**Data:** 2026-05-07
**Branch:** `auditoria-features`
**Status:** Spec aprovado, aguarda implementação

## 1. Contexto e problema

O `INVENTARIO.md` identificou um fluxo inteiro de "fechamento semanal" (WeeklyCheckpoint) que nunca foi adotado pelo usuário:
- Tabela `weekly_checkpoints` no banco com **0 registros**
- Modal `WeeklyCheckpointModal` é abrido pelo botão "Fechar semana" no Dashboard mas ninguém usa
- Tab "Histórico" do Planejamento mostra "Nenhum checkpoint registrado ainda" sempre
- IA tem ação `record_checkpoint` que depende desse fluxo
- Chart "Previsto×Real" no Dashboard renderiza array vazio (`checkpointChart.length === 0` sempre)

Isso totaliza ~300 linhas de código + ~10 imports + 2 funções utilitárias (`healthStatus`, `isoWeekBounds`) que existem só pra alimentar esse fluxo morto.

**Esta onda remove tudo isso.** Zero risco (ninguém perde feature em uso). Libera ~300 linhas de superfície mental e desbloqueia as próximas ondas (Polimentos UX, Multi-conta, etc.) com codebase mais enxuto.

## 2. Decisões tomadas no brainstorming

| Decisão | Escolha |
|---|---|
| Estratégia geral | 1 spec por onda (6 ondas no total) |
| Primeira onda | Limpeza zero-risco |
| Tabela `weekly_checkpoints` no DB | Preservar (não dropar — permite rollback se mudarmos de ideia) |
| Migrations antigas (`migration_credit_and_checkpoints.sql`) | Mantém o arquivo (histórico) |
| INVENTARIO.md | Atualizar removendo as linhas que viraram resolvidas |

## 3. Escopo de remoção (8 áreas)

### 3.1 Arquivo deletado
- `src/components/WeeklyCheckpointModal.jsx` (103 linhas)

### 3.2 `src/pages/DashboardPage.jsx`
**Remover:**
- Linha 10: `import WeeklyCheckpointModal from '../components/WeeklyCheckpointModal'`
- Linha 8 inteira: `import { Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'`
- Linha 61: `const [checkpointOpen, setCheckpointOpen] = useState(false)`
- Da destructure linha 65: tirar `checkpoints = []`
- Linhas 95-103: `const checkpointChart = useMemo(...)`
- Linhas 152-154: botão `<button onClick={() => setCheckpointOpen(true)}>...Fechar semana</button>`
- Bloco linhas 220-237: `{checkpointChart.length > 0 && (<div className="card"><p className="section-title">Previsto×Real ...</p><ResponsiveContainer...><BarChart>...</BarChart>...</div>)}`
- Bloco linhas 240-249: `{checkpointOpen && (<WeeklyCheckpointModal cycle={cycle} ... onSaved={refetch}/>)}`

### 3.3 `src/pages/BudgetPage.jsx`
**Remover:**
- Linha 4: `useCheckpoints` do import (deixar os outros)
- Linha 259: `const { checkpoints } = useCheckpoints(40)`
- Tabs array (linhas ~321-335): remover o item `{ k: 'history', label: 'Histórico', icon: History }`
- Grid de tabs: trocar `grid-cols-3` por `grid-cols-2` (linha ~321)
- Linhas 339-359: bloco inteiro `{tab === 'history' && (<div>...checkpoints...</div>)}`
- Componente `StatusBadge` (linhas 239-251): só renderizado nos checkpoints — remover
- Import `History` do lucide (linha 3): verificar com grep se usado em outro lugar do arquivo; se não, remover

### 3.4 `src/pages/ChatPage.jsx`
**Remover:**
- Linha 7: `import { healthStatus, isoWeekBounds, computeBucketSnapshot } from '../lib/budgetEngine'`
- Linha 8: `import { subDays } from 'date-fns'`
- Linha 6: `addCheckpoint, getBudgetCycle` do import de `../lib/db` (manter os outros)
- Linha 48: entry `record_checkpoint: 'Fechar Semana'` do objeto `typeLabels`
- Linhas 317-340: branch inteiro `} else if (type === 'record_checkpoint') { ... }` na função `approveAction`

### 3.5 `src/lib/db.js`
**Remover:**
- Bloco "WEEKLY CHECKPOINTS" (linhas 142-150): funções `getCheckpoints`, `addCheckpoint`, `deleteCheckpoint`
- Em `getAIContext` (linhas 153-182):
  - Da Promise.all: tirar `getCheckpoints(null, 4)` e o `{ data: checkpoints }` da destructure
  - Do return object: tirar `lastCheckpoints: checkpoints || []`

### 3.6 `src/lib/budgetEngine.js`
**Remover:**
- Função `healthStatus()` (linhas 90-99)
- Função `isoWeekBounds()` (linhas 115-120)

### 3.7 `src/lib/claude.js`
**Remover:**
- Destructure `lastCheckpoints = []` em `buildSystemPrompt` (linha 9)
- Bloco "## ÚLTIMOS CHECKPOINTS SEMANAIS" no template (linhas 40-41)
- `record_checkpoint` da lista de action types válidos no prompt (linha ~83)
- Bloco de exemplo "Para fechar a semana (checkpoint): { type: 'record_checkpoint', ... }" (linhas ~88-92)

### 3.8 `src/hooks/useData.js`
**Remover:**
- Em `useDashboard`:
  - Da Promise.all: `db.getCheckpoints(null, 8)` e o `{ data: checkpoints }` da destructure
  - Do `setData`: `checkpoints: checkpoints || []`
  - Da subscribe: linha do canal `weekly_checkpoints`
- Função `useCheckpoints(limit = 20)` completa (linhas 152-170)

## 4. Documentação atualizada

### `INVENTARIO.md`
Remover/atualizar as menções a:
- Botão "Fechar semana" (Dashboard) — sai
- `checkpointChart` useMemo + imports recharts — sai
- Tab "Histórico" do Planejamento — sai
- `useCheckpoints` hook — sai
- `healthStatus`, `isoWeekBounds` em budgetEngine — sai
- WeeklyCheckpointModal — sai
- record_checkpoint da IA — sai

Adicionar nota no rodapé: "Onda 1 (Limpeza) executada em 2026-05-07. Tabela `weekly_checkpoints` preservada no DB pra eventual rollback."

## 5. Critérios de done

- ✅ Todas as remoções da seção 3 aplicadas
- ✅ `npm run build` limpo (sem warnings de import órfão)
- ✅ `npm test` passa (provavelmente "no tests found" — OK, pra não-Pluggy não temos tests aqui)
- ✅ `git status` clean
- ✅ Smoke test manual:
  - Acessar `/budget` mostra **só Renda e Crédito** (sem Histórico)
  - Dashboard sem botão "Fechar semana" e sem chart Previsto×Real
  - Chat: IA pode tentar criar `record_checkpoint`, vai cair no catch-all do `else` e tentar como transação — aceitável
- ✅ `INVENTARIO.md` atualizado com nota de execução
- ✅ Tabela `weekly_checkpoints` no DB **continua existindo** (não rodar DROP)

## 6. Estrutura de commits sugerida

Commits granulares por área, na ordem:

1. `chore(cleanup): remove WeeklyCheckpointModal component`
2. `chore(cleanup): remove botao Fechar Semana e chart Previsto×Real do Dashboard`
3. `chore(cleanup): remove tab Historico e useCheckpoints do Planejamento`
4. `chore(cleanup): remove record_checkpoint da IA (ChatPage + prompt)`
5. `chore(cleanup): remove getCheckpoints/addCheckpoint/deleteCheckpoint de db.js`
6. `chore(cleanup): remove healthStatus e isoWeekBounds de budgetEngine`
7. `chore(cleanup): remove lastCheckpoints e exemplo record_checkpoint do prompt da IA`
8. `chore(cleanup): remove useCheckpoints e checkpoints de useDashboard`
9. `docs: atualiza INVENTARIO.md pos-Onda1`

## 7. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Algum import órfão escapa e quebra build | `npm run build` no fim de cada commit revela imediatamente |
| Tabela `weekly_checkpoints` fica órfã no DB | Aceitável — não dropamos, preserva histórico (mesmo vazio) e permite rollback |
| IA propõe `record_checkpoint` no futuro | Cai no catch-all do `approveAction` (`else { for (item of items) addTransaction(toTransaction(item)) }`) — tenta criar como transação. Não ideal mas seguro (não quebra fluxo) |
| Migration `migration_credit_and_checkpoints.sql` ainda referencia tabela viva | Migration antiga não precisa ser modificada — schema do banco fica intacto |
| Outra parte do app usa `healthStatus`/`isoWeekBounds` que escapou do grep | Grep já confirmou que NÃO há outros usos. Build vai pegar se errei |

## 8. Próximos passos

1. Invocar **writing-plans skill** pra gerar o implementation plan task-by-task
2. Executar via subagent-driven-development
3. Merge na main
4. Avançar pra próxima onda (Onda 2: Polimentos UX) — novo spec
