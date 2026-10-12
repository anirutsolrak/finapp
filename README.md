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
> **Versão nova, enxuta.** O código original foi movido para a branch
> [`legado`](../../tree/legado). Ele foi lançado com funcionalidades demais de uma
> vez, várias pouco úteis e mal pensadas. A `main` é a versão mais objetiva, enxuta
> e útil, focada em **planejamento + lançamentos** (com importação de extrato) e
> **metas**.
>
> Saíram nesta fase: Dashboard, Lista, toda a parte de IA (chat/assistente e
> categorização), os ciclos de orçamento e o "ritmo de gasto". O que fizer falta será
> reescrito e reintroduzido depois do lançamento da versão nova.

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

1. **Planejar** o mês: cada conta recorrente (template) vira uma *conta a pagar* (bill) do mês.
2. **Pagar** uma conta gera um *lançamento* — ou só marca como paga, se ele já veio do extrato.
3. **Importar o extrato** do banco completa os lançamentos e já baixa as contas do plano
   que batem em mês e valor.
4. O **saldo por conta** fecha a conferência com o banco.

Os dados são **compartilhados pela família**: o que um membro lança aparece para o
outro assim que ele voltar ao app (cada tela recarrega ao ficar visível).

## ✨ Funcionalidades

- **Tela única por mês** — resumo (entrou / saiu / líquido, contas pagas e saldo por
  conta), plano do mês e lançamentos do mês no mesmo lugar.
- **Plano do mês** — contas a pagar por período (`month_ref`), pagamento individual ou
  em lote, contas recorrentes puxadas de um mês para o outro.
- **Lançamentos** — CRUD de transações com filtro por tipo e conta.
- **Importador de extrato** — CSV de conta e de fatura do Nubank, com revisão, detecção de
  duplicatas e conciliação com as contas pendentes do plano.
- **Metas** — aparecem na tela principal; **Guardar** registra o dinheiro separado (com ou
  sem mover entre contas) e **Pagar** lança a despesa e conclui a meta, em dois toques.
- **Tema** — tons pastéis sobre neutros, com lavanda como cor principal; o modo escuro usa
  as mesmas cores num tom mais fundo. Segue o sistema ou a escolha em Configurações.
- **PWA** — instalável, com aviso de atualização e cache offline.

## 🧱 Stack

| Camada | Tecnologia | Papel |
|--------|-----------|-------|
| UI | React 19 + React Router 7 | SPA e navegação |
| Estilo | Tailwind CSS 3 + PostCSS | utilitários de CSS |
| Build | Vite 8 | dev server e bundle |
| PWA | vite-plugin-pwa (Workbox) | app instalável + cache |
| Backend | Supabase (Postgres) | persistência, Auth, RLS, RPCs |
| Estado | hooks de dados | carga, recarga ao voltar ao app e após cada mutação |
| Tema | variáveis CSS + Tailwind | tons pastéis sobre neutros; o escuro é o mesmo, num tom mais fundo |
| Datas | date-fns | manipulação de datas |
| Testes | Vitest + Testing Library | unit/integração |
| Deploy | Vercel | hospedagem (SPA rewrite) |

## 🏗 Arquitetura

```
Páginas (src/pages)         → telas (PlanningPage é a principal)
   ↓ usam
Hooks (src/hooks/useData)   → carregam dados; recarregam ao voltar ao app e após mutações
   ↓ chamam
Data layer (src/lib/db)     → queries PostgREST + RPCs (pay_bill, unpay_bill)
   ↓
Supabase Postgres           → schema, triggers e RLS (ver docs/supabase)

src/lib/budgetEngine  → cálculos puros (resumo do mês, saldo por conta), testados
src/lib/reconcile     → casa linhas do extrato com contas pendentes do plano
src/lib/goals         → progresso da meta e lançamentos de guardar/pagar
src/contexts          → Auth, Selection (seleção em massa)
```

O período é sempre **um mês** (`month_ref`): as contas pelo mês de referência, os
lançamentos pela data dentro do mês. Não há cache: toda mutação recarrega os dados da
tela, e cada hook recarrega quando o app volta a ficar visível. O Realtime do Supabase
não é usado.

**Acesso:** só quem está em `public.family_members` lê e escreve os dados (RLS). A anon
key sozinha, ou um usuário que apenas se cadastrou, não vê nada.

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
  pages/         Telas (Planning, Goals, Settings, Login)
  components/    UI reutilizável (modais, lista de lançamentos, planning/, goals/, layout/)
  hooks/         useData.js — hooks de dados com Realtime
  contexts/      Auth, Selection
  lib/           db, supabase, budgetEngine, reconcile, goals, nubankCSV, format
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
