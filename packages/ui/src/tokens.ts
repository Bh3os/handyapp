// Brand palette (FACT-BRAND-IDENTITY, OWN-DEC-54) for places that cannot read CSS custom properties, such as the
// theme-color meta tag or a generated document. styles/tokens.css holds the full token set; a test keeps them equal.
export const BRAND = {
  navy: '#1A2B49',
  ivory: '#F7F5F0',
  gold: '#C79A55',
  charcoal: '#303942',
  stone: '#E7E2D9',
} as const

export type BrandColour = keyof typeof BRAND
