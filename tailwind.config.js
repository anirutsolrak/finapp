// shortcut: a paleta é trocada remapeando as classes existentes (gray-*, white, text-<acento>-400...)
// para variáveis CSS definidas em src/index.css, em vez de tokens semânticos (bg-surface, text-muted).
// Migrar para tokens se o número de telas crescer.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`

const grays = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map(s => [s, v(`gray-${s}`)])
)
// Tons usados como TEXTO de acento: escuros no tema claro, claros no escuro.
const accentText = (c) => ({ 200: v(`${c}-text`), 300: v(`${c}-text`), 400: v(`${c}-text`) })

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        white: v('ink'),          // "text-white" = tinta principal (títulos), escura no tema claro
        onaccent: v('onaccent'),  // texto sobre botão de acento
        gray: grays,
        emerald: { ...accentText('emerald'), 500: v('emerald-500'), 600: v('emerald-600') },
        ...Object.fromEntries(
          ['red', 'amber', 'purple', 'blue', 'cyan', 'teal', 'sky'].map(c => [c, accentText(c)])
        ),
      },
    },
  },
  plugins: [],
}
