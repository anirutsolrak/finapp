<div align="center">

# 💰 FinAPP

**Gestão financeira familiar com planejamento por ciclo, multi-conta e assistente de IA.**

Planeje o mês, materialize suas contas a pagar, registre gastos e veja o ritmo de
gasto (média diária e meta semanal) se recalcular em tempo real — sozinho ou a dois.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3FCF8E?logo=supabase&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-instal%C3%A1vel-5A0FC8?logo=pwa&logoColor=white)
![Claude](https://img.shields.io/badge/IA-Claude-D97757?logo=anthropic&logoColor=white)

</div>

## 📑 Sumário

- [Sobre](#-sobre)
- [Funcionalidades](#-funcionalidades)
- [Stack](#-stack)
- [Arquitetura](#-arquitetura)
- [Rodando localmente](#-rodando-localmente)
- [Variáveis de ambiente](#-variáveis-de-ambiente)
- [Setup do Supabase](#-setup-do-supabase)
- [Estrutura de pastas](#-estrutura-de-pastas)
- [Scripts](#-scripts)
- [Deploy](#-deploy)
- [Documentação](#-documentação)

## 📖 Sobre

FinAPP é um app de finanças pessoais **compartilhado por uma família**: ambos os
usuários enxergam e editam os mesmos dados financeiros. O modelo mental é:

1. **Planejar** o mês em *itens de orçamento* (templates de gasto e renda).
2. Cada item ativo **vira uma conta a pagar** (bill) do ciclo, automaticamente.
3. **Pagar** uma bill gera um *lançamento*, que reduz o saldo disponível na hora.
4. Um **motor de orçamento** recalcula média diária e meta semanal a cada mudança.
5. Uma **IA** (Claude) lê o contexto do mês e sugere ações já prontas pra aplicar.

Tudo é **reativo via Supabase Realtime**: um lançamento feito por um membro
aparece e recalcula os indicadores do outro em segundos, sem refresh.

## ✨ Funcionalidades

- **Dashboard** — KPIs por bucket (renda / crédito / reserva), saldos por grupo de
  conta, contas a vencer e indicador de saúde do gasto.
- **Transações** — CRUD de lançamentos, filtros por período, seleção em massa e
  fluxo de *pagar contas* em lote.
- **Planejamento** — itens de orçamento por período (`month_ref`), materialização
  de bills, configuração de ciclo e percentual de reserva.
- **Metas** — progresso por vínculo de transações (`goal_id`); plano de aporte
  sugerido pela IA.
- **Lista** — lista de compras/tarefas; um item marcado pode virar transação.
- **Importador CSV** — importa extrato do Nubank.
- **Chat IA** — assistente financeiro com contexto do mês que devolve ações
  estruturadas (`add_transaction`, `add_goal`, etc.).
- **PWA** — instalável, com aviso de atualização e cache offline.

## 🧱 Stack

| Camada | Tecnologia | Papel |
|--------|-----------|-------|
| UI | React 19 + React Router 7 | SPA e navegação |
| Estilo | Tailwind CSS 3 + PostCSS | utilitários de CSS |
| Build | Vite 8 | dev server e bundle |
| PWA | vite-plugin-pwa (Workbox) | app instalável + cache |
| Backend | Supabase (Postgres) | persistência, Auth, Realtime, RPCs |
| Estado | hooks + Realtime | carga e sincronização reativa |
| Datas | date-fns | manipulação de datas |
| IA | Claude via Edge Function | insights e ações sugeridas |
| Testes | Vitest + Testing Library | unit/integração |
| Deploy | Vercel | hospedagem (SPA rewrite) |

## 🏗 Arquitetura

```
Páginas (src/pages)         → telas
   ↓ usam
Hooks (src/hooks/useData)   → carregam dados e assinam Realtime (postgres_changes)
   ↓ chamam
Data layer (src/lib/db)     → queries PostgREST + RPCs (pay_bill, unpay_bill)
   ↓
Supabase Postgres           → schema, triggers e RLS (ver docs/supabase)

src/lib/budgetEngine  → motor de cálculo puro (sem I/O), testável
src/contexts          → Auth, DateRange (ciclo global), Selection (seleção em massa)
```

Não há cache server-side: cada hook reassina as tabelas que lê, então qualquer
mutação dispara refetch e recomputação dos indicadores.

## 🚀 Rodando localmente

**Pré-requisitos:** Node.js 18+ e um projeto no [Supabase](https://supabase.com).

```bash
# 1. Clone e instale
git clone <repo-url>
cd FinAPP
npm install

# 2. Configure o ambiente (veja a seção abaixo)
cp .env.example .env
#   edite .env com a URL e a anon key do seu projeto Supabase

# 3. Prepare o banco (veja "Setup do Supabase")

# 4. Rode em desenvolvimento
npm run dev
```

## 🔑 Variáveis de ambiente

Crie um `.env` na raiz (use `.env.example` como base). O **client** usa apenas:

| Variável | Obrigatória | Descrição |
|----------|:-----------:|-----------|
| `VITE_SUPABASE_URL` | ✅ | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | ✅ | Chave pública (anon/publishable) do projeto |

> **IA (opcional):** o chat com Claude não usa chave no client — a chamada passa
> por uma Edge Function `claude-proxy` no Supabase, que guarda a `ANTHROPIC_API_KEY`
> como *secret*. Para habilitar o chat, faça deploy da função e configure o secret:
> ```bash
> supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
> ```

## 🗄 Setup do Supabase

Os scripts SQL para subir o banco do zero (schema, funções, triggers, RLS e seed)
estão em **[docs/supabase/](docs/supabase/README.md)** — idempotentes e numerados
para rodar em ordem, manual (SQL Editor) ou automatizado (Supabase CLI / `psql`).

## 📁 Estrutura de pastas

```
src/
  pages/         Telas (Dashboard, Transactions, Budget, Goals, Lista, Chat, Settings)
  components/    UI reutilizável (modais, seletor de período, planning/, layout/)
  hooks/         useData.js — hooks de dados com Realtime
  contexts/      Auth, DateRange, Selection
  lib/           db, supabase, budgetEngine, claude, nubankCSV, todo, dateRange
  test/          setup e smoke tests
docs/
  supabase/      Scripts SQL de setup do banco
scripts/         Auditoria de cálculos (Python) — valida KPIs contra o banco
```

## 📜 Scripts

| Comando | Ação |
|---------|------|
| `npm run dev` | servidor de desenvolvimento |
| `npm run build` | build de produção |
| `npm run preview` | preview do build |
| `npm run lint` | ESLint |
| `npm test` | testes (watch) |
| `npm run test:run` | testes (single run) |

## ☁ Deploy

Deploy na **Vercel** (config em `vercel.json`, com rewrite de SPA). Configure as
variáveis de ambiente no painel do projeto. Build: `npm run build` · output: `dist/`.

## 📚 Documentação

- [docs/supabase/](docs/supabase/README.md) — setup do banco (schema, funções, triggers, RLS, seed)
