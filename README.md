<div align="center">

# 💰 FinAPP

**Gestão financeira familiar: planejamento do mês, lançamentos e metas.**

Planeje o mês, pague as contas planejadas (cada pagamento vira um lançamento) e
importe o extrato do banco para manter tudo em dia — sozinho ou a dois.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3FCF8E?logo=supabase&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-instal%C3%A1vel-5A0FC8?logo=pwa&logoColor=white)

</div>

> [!IMPORTANT]
> **Reescrita em andamento.** O código original foi movido para a branch
> [`legado`](../../tree/legado). Ele foi lançado com funcionalidades demais de uma
> vez, várias pouco úteis e mal pensadas. A `main` agora caminha para uma versão
> mais objetiva, enxuta e útil, focada em **planejamento + lançamentos** (com
> importação de extrato) e **metas**.
>
> Saíram nesta fase: Dashboard, Lista e toda a parte de IA (chat/assistente e
> categorização). Essas funcionalidades serão reescritas e reintroduzidas depois
> do lançamento da versão nova.

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
4. **Importar o extrato** do banco completa os lançamentos que faltam.

Tudo é **reativo via Supabase Realtime**: um lançamento feito por um membro
aparece e recalcula os indicadores do outro em segundos, sem refresh.

## ✨ Funcionalidades

- **Planejamento** — itens de orçamento por período (`month_ref`), materialização
  de bills e pagamento de contas (individual ou em lote).
- **Lançamentos** — CRUD de transações, filtros por período e consolidado do que
  entrou e saiu da conta corrente.
- **Importador CSV** — importa extrato e fatura do Nubank, com revisão antes de gravar.
- **Metas** — progresso por vínculo de transações (`goal_id`).
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

## 🗄 Setup do Supabase

Os scripts SQL para subir o banco do zero (schema, funções, triggers, RLS e seed)
estão em **[docs/supabase/](docs/supabase/README.md)** — idempotentes e numerados
para rodar em ordem, manual (SQL Editor) ou automatizado (Supabase CLI / `psql`).

## 📁 Estrutura de pastas

```
src/
  pages/         Telas (CombinedPlanning → Transactions + Budget, Goals, Settings)
  components/    UI reutilizável (modais, seletor de período, planning/, layout/)
  hooks/         useData.js — hooks de dados com Realtime
  contexts/      Auth, DateRange, Selection
  lib/           db, supabase, budgetEngine, nubankCSV, dateRange
  test/          setup e smoke tests
docs/
  supabase/      Scripts SQL de setup do banco
  superpowers/   Planos de implementação da reescrita
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
- [docs/superpowers/plans/](docs/superpowers/plans/) — planos de cada onda da reescrita
