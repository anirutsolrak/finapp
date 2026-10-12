import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

// Lê as variáveis de cor ("R G B") de cada tema direto do CSS que vai pra produção.
const [lightCss, darkCss] = readFileSync('src/index.css', 'utf8').split(':root[data-theme="dark"]')
const vars = (css) => Object.fromEntries(
  [...css.matchAll(/--([\w-]+):\s*(\d+) (\d+) (\d+)/g)].map(m => [m[1], m.slice(2).map(Number)])
)

// Contraste WCAG 2.x entre duas cores sRGB.
const lum = (rgb) => {
  const [r, g, b] = rgb.map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)

const TEXT = ['ink', 'positive', 'gray-100', 'gray-200', 'gray-300', 'gray-400', 'gray-500', 'gray-600']
const SURFACES = ['gray-950', 'gray-900']

describe.each([['claro', vars(lightCss)], ['escuro', vars(darkCss)]])('tema %s', (_nome, t) => {
  const accentText = Object.keys(t).filter(k => k.endsWith('-text'))

  it('define todos os tons', () => {
    for (const k of [...TEXT, ...SURFACES, 'gray-800', 'gray-700', 'onaccent', 'brand-500', 'brand-600']) {
      expect(t[k], k).toBeDefined()
    }
    expect(accentText.length).toBe(8)
  })

  it.each(SURFACES)('todo texto é legível sobre %s (>= 4.5:1)', (surface) => {
    for (const k of [...TEXT, ...accentText]) {
      expect(contrast(t[k], t[surface]), `${k} sobre ${surface}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('texto de botão é legível sobre a cor principal', () => {
    expect(contrast(t.onaccent, t['brand-500'])).toBeGreaterThanOrEqual(4.5)
    expect(contrast(t.onaccent, t['brand-600'])).toBeGreaterThanOrEqual(4.5)
  })

  // O pedido: nada de "verde sobre preto". Fundo escuro é ardósia, e a cor principal não é verde.
  it('fundo não é preto e a cor principal não é verde', () => {
    expect(Math.min(...t['gray-950'])).toBeGreaterThanOrEqual(40)
    const [r, g, b] = t['brand-500']
    expect(g).toBeLessThan(Math.max(r, b))
  })
})
