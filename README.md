# FinançasFamília 💰

Planejador financeiro familiar com IA (Claude) integrada.

## Stack (visão rápida)

- **React 19 + React Router**: UI SPA e navegação.
- **Vite**: dev server e build.
- **Tailwind CSS + PostCSS/Autoprefixer**: estilos utilitários e pipeline de CSS.
- **Supabase (Postgres) + Realtime**: persistência e atualizações reativas (assinaturas em `postgres_changes`).
- **TanStack React Query**: cache, revalidação e sincronização de estado server↔client.
- **Claude (IA)**: geração de insights/ações via prompt com contexto do ciclo, snapshots e checkpoints.
- **PWA (vite-plugin-pwa + Workbox)**: app instalável e caching (inclui estratégia `NetworkFirst` para chamadas ao Supabase).
- **Vercel**: deploy (rewrite para SPA).

> Esta seção é a explicação introdutória de como cada recurso da stack é usado no projeto. A documentação detalhada do motor de orçamento está em `docs/budget-engine.md`.