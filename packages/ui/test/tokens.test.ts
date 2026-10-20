// Token checks (TSK-0018; HH-BASE-01, T75): the brand palette of FACT-BRAND-IDENTITY is reproduced exactly, both
// themes meet WCAG 2.2 AA for every text and control pair, and the typography rules of OWN-DEC-55 hold.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BRAND } from '../src/index.js'

const STYLES = join(dirname(fileURLToPath(import.meta.url)), '..', 'styles')
const css = (name: string) => readFileSync(join(STYLES, name), 'utf8')
const tokensCss = css('tokens.css')

/** Custom properties declared in the first block that follows `selector`. */
function block(selector: string): Map<string, string> {
  const start = tokensCss.indexOf(selector)
  if (start < 0) throw new Error(`no block for ${selector}`)
  const open = tokensCss.indexOf('{', start)
  const close = tokensCss.indexOf('}', open)
  const body = tokensCss.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, '')
  const map = new Map<string, string>()
  for (const m of body.matchAll(/(--hh-[\w-]+)\s*:\s*([^;]+);/g)) map.set(m[1] as string, (m[2] as string).trim())
  return map
}

const light = block(':root {')
const darkMedia = block(":root:not([data-theme='light'])")
const darkPinned = block(":root[data-theme='dark']")
const dark = new Map([...light, ...darkPinned])

function resolve(theme: Map<string, string>, name: string, depth = 0): string {
  const value = theme.get(name)
  if (value === undefined) throw new Error(`unknown token ${name}`)
  const ref = /^var\((--hh-[\w-]+)\)$/.exec(value)
  if (ref && depth < 10) return resolve(theme, ref[1] as string, depth + 1)
  return value
}

type Rgba = [number, number, number, number]
function parseColour(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(value)
  if (hex) {
    const n = parseInt(hex[1] as string, 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]
  }
  const rgba = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/.exec(value)
  if (rgba) return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), Number(rgba[4])]
  throw new Error(`not a colour: ${value}`)
}

function over([r, g, b, a]: Rgba, [br, bg, bb]: Rgba): Rgba {
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1]
}

function luminance([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG contrast ratio of a foreground token on a background token (alpha blended over the background). */
function contrast(theme: Map<string, string>, fg: string, bg: string): number {
  const back = parseColour(resolve(theme, bg))
  const front = over(parseColour(resolve(theme, fg)), back)
  const [hi, lo] = [luminance(front), luminance(back)].sort((a, b) => b - a) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

// Text pairs need 4.5:1 (WCAG 1.4.3); control boundaries and focus rings 3:1 (WCAG 1.4.11, 2.4.13).
const TEXT_PAIRS: [string, string][] = [
  ['--hh-text', '--hh-canvas'],
  ['--hh-text', '--hh-surface'],
  ['--hh-text', '--hh-surface-2'],
  ['--hh-text', '--hh-tint'],
  ['--hh-muted', '--hh-canvas'],
  ['--hh-muted', '--hh-surface'],
  ['--hh-muted', '--hh-surface-2'],
  ['--hh-link', '--hh-canvas'],
  ['--hh-link', '--hh-surface'],
  ['--hh-accent-text', '--hh-canvas'],
  ['--hh-on-action', '--hh-action'],
  ['--hh-on-action', '--hh-action-hover'],
  ['--hh-danger-text', '--hh-surface'],
  ['--hh-danger-text', '--hh-danger-tint'],
  ['--hh-success-text', '--hh-success-tint'],
  ['--hh-warning-text', '--hh-warning-tint'],
  ['--hh-info-text', '--hh-info-tint'],
  ['--hh-neutral-text', '--hh-neutral-tint'],
  ['--hh-text', '--hh-danger-tint'],
  ['--hh-text', '--hh-success-tint'],
  ['--hh-text', '--hh-warning-tint'],
  ['--hh-text', '--hh-neutral-tint'],
]
const CONTROL_PAIRS: [string, string][] = [
  ['--hh-line-strong', '--hh-surface'],
  ['--hh-line-strong', '--hh-canvas'],
  ['--hh-focus', '--hh-canvas'],
  ['--hh-focus', '--hh-surface'],
  ['--hh-action', '--hh-canvas'],
  ['--hh-action', '--hh-surface'],
  ['--hh-danger', '--hh-surface'],
  ['--hh-success', '--hh-success-tint'],
  ['--hh-warning', '--hh-warning-tint'],
]

describe('design tokens (TSK-0018, HH-BASE-01)', () => {
  it('[HH-BASE-01][T75] reproduces the five brand colours of FACT-BRAND-IDENTITY exactly', () => {
    expect(BRAND).toEqual({
      navy: '#1A2B49',
      ivory: '#F7F5F0',
      gold: '#C79A55',
      charcoal: '#303942',
      stone: '#E7E2D9',
    })
    for (const [name, value] of Object.entries(BRAND)) {
      expect(light.get(`--hh-${name}`)?.toUpperCase(), name).toBe(value)
    }
  })

  it('[HH-BASE-01] keeps the identity: navy action, ivory canvas, charcoal text, gold hairlines', () => {
    expect(resolve(light, '--hh-action')).toBe('#1a2b49')
    expect(resolve(light, '--hh-canvas')).toBe('#f7f5f0')
    expect(resolve(light, '--hh-text')).toBe('#303942')
    expect(light.get('--hh-hairline-gold')).toBe('1px solid var(--hh-gold)')
    expect(light.get('--hh-radius-sm')).toBe('2px')
  })

  it('[HH-BASE-01] the system dark theme and the pinned dark theme are identical', () => {
    expect([...darkMedia]).toEqual([...darkPinned])
  })

  for (const [themeName, theme] of [
    ['light', light],
    ['dark', dark],
  ] as const) {
    it(`[HH-BASE-01] ${themeName} theme: every text pair is at least 4.5:1`, () => {
      for (const [fg, bg] of TEXT_PAIRS) {
        expect(contrast(theme, fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
    })
    it(`[HH-BASE-01] ${themeName} theme: control borders, focus and action fills are at least 3:1`, () => {
      for (const [fg, bg] of CONTROL_PAIRS) {
        expect(contrast(theme, fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(3)
      }
    })
  }

  it('[HH-BASE-01] gold is never text on a light surface (2.4:1 on ivory); it is legible on navy', () => {
    expect(contrast(light, '--hh-gold', '--hh-canvas')).toBeLessThan(3)
    expect(contrast(light, '--hh-gold', '--hh-navy')).toBeGreaterThanOrEqual(4.5)
    const components = css('components.css') + css('base.css')
    expect(components).not.toMatch(/(^|[^-])color:\s*var\(--hh-(gold|accent)\)/m)
  })
})

describe('typography (TSK-0018, OWN-DEC-55)', () => {
  const all = css('base.css') + css('components.css') + css('fonts.css')
  const rules = all.replace(/\/\*[\s\S]*?\*\//g, '')

  it('[HH-BASE-01] Newsreader display sizes never go below 24 px', () => {
    for (const token of ['--hh-text-display', '--hh-text-h1', '--hh-text-h2']) {
      const min = /^clamp\(([\d.]+)rem/.exec(light.get(token) ?? '')
      expect(Number(min?.[1]), token).toBeGreaterThanOrEqual(1.5)
    }
  })

  it('[HH-BASE-01] nothing is set in italic and no italic face is shipped', () => {
    expect(rules).not.toMatch(/italic/i)
    expect([...css('fonts.css').matchAll(/font-style:\s*(\w+)/g)].map((m) => m[1])).toEqual(['normal', 'normal'])
  })

  it('[HH-BASE-01] both typefaces are self-hosted: no third-party font request', () => {
    expect(rules).not.toMatch(/https?:\/\//)
    expect(css('fonts.css')).toContain("url('../fonts/newsreader-latin-opsz-normal.woff2')")
    expect(css('fonts.css')).toContain("url('../fonts/source-sans-3-latin-wght-normal.woff2')")
  })

  it('[HH-BASE-01] square-shouldered: no pill radius anywhere', () => {
    expect(rules).not.toMatch(/border-radius:\s*(999|9999)px/)
  })

  it('[HH-BASE-01] motion stops under prefers-reduced-motion', () => {
    expect(tokensCss).toMatch(/prefers-reduced-motion: reduce[\s\S]*--hh-duration-base: 0ms/)
  })
})
