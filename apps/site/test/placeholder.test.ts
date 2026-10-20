// Source checks of the placeholder page: English, hidden from search engines, and no invented business facts.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('../src/pages/index.astro', import.meta.url), 'utf8')

describe('public site placeholder (TSK-0001, RULE-NO-INVENTED-FACTS, RULE-SYNTHETIC-DATA)', () => {
  it('is an English page hidden from search engines', () => {
    expect(page).toContain('<html lang="en">')
    expect(page).toContain('<meta name="robots" content="noindex, nofollow" />')
  })

  it('states no price, credential or guarantee', () => {
    expect(page).not.toMatch(/\$\s?\d/)
    expect(page).not.toMatch(/licensed|insured|bonded|certified|guarantee|warranty/i)
  })
})
