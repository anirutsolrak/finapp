# Análise do README

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

---

## Visão geral
Este é um projeto de aplicação que visa proporcionar uma experiência fluida e intuitiva ao usuário.

## Funcionalidades
- Autenticação de usuários
- Integração com APIs externas
- Interface amigável

## Arquitetura (alto nível)
A arquitetura do sistema é baseada em uma abordagem modular, facilitando a manutenção e evolução do código.

## Requisitos
- Node.js (versão 14 ou superior)
- NPM (ou Yarn)
- Supabase para banco de dados

## Configuração (variáveis de ambiente)
As seguintes variáveis devem ser configuradas:
- `DATABASE_URL`: URL de conexão com o banco de dados Supabase
- `API_KEY`: chave da API para serviços externos

## Como rodar (dev/build/preview)
1. Clone o repositório.
2. Execute `npm install` para instalar as dependências.
3. Para rodar em desenvolvimento, use `npm run dev`.
4. Para gerar o build, use `npm run build`.
5. Para visualizar prévias, use `npm run preview`.

## Deploy (Vercel)
Utilize o [Vercel](https://vercel.com) para realizar o deploy da aplicação. O processo é simples e rápido com integração Git.

## Banco de dados/Supabase
Referências de setup e migrações estão disponíveis na documentação do Supabase. Siga as etapas para garantir que o banco de dados está corretamente configurado.

## PWA
A aplicação é uma Progressive Web App, permitindo acesso offline e experiência similar à de aplicativos nativos.

## IA (Claude) e segurança
Implementações de IA são usadas para melhorar a experiência do usuário. Medidas de segurança são implementadas para proteger dados e autenticação.

## Estrutura de pastas
- `/src`: Código fonte da aplicação.
- `/public`: Arquivos públicos.
- `/tests`: Testes automatizados.

## Contribuição
Contribuições são bem-vindas! Sinta-se à vontade para abrir problemas e pull requests para melhorias.

## Licença
Este projeto está licenciado sob a MIT License.