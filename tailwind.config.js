// shortcut: a paleta é trocada remapeando as classes de cinza existentes (gray-*, white,
// text-<cor>-400...) para variáveis CSS definidas em src/index.css, em vez de tokens
// semânticos para tudo (bg-surface, text-muted). Só a cor principal (brand) e o tom de
// "dinheiro entrando / pago" (positive) têm nome próprio. Migrar o resto se as telas crescerem.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`

const grays = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map(s => [s, v(`gray-${s}`)])
)
// Tons usados como TEXTO colorido: escuros no tema claro, pastéis no escuro.
const textTone = (c) => ({ 200: v(`${c}-text`), 300: v(`${c}-text`), 400: v(`${c}-text`) })

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        white: v('ink'),          // "text-white" = tinta principal (títulos), escura no tema claro
        onaccent: v('onaccent'),  // texto sobre botão da cor principal
        positive: v('positive'),  // dinheiro que entrou, conta paga
        gray: grays,
        brand: { ...textTone('brand'), 500: v('brand-500'), 600: v('brand-600') },
        ...Object.fromEntries(
          ['red', 'amber', 'purple', 'blue', 'cyan', 'teal', 'sky'].map(c => [c, textTone(c)])
        ),
      },
    },
  },
  plugins: [],
}
