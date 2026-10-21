// The Areas page, the footer's county links, the structured data and the not-found and error pages (TSK-0023;
// HH-CUS-04, HH-CUS-05, T08, T75, FACT-SERVICE-AREA, FACT-PUBLIC-CONTACT, OWN-DEC-48, OWN-DEC-57, RULE-LANGUAGES).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SERVICE_AREA } from '@handyhub/domain/areas'
import { customerTranslator } from '@handyhub/i18n'
import { describe, expect, it } from 'vitest'
import { areaByState, areaStructuredData, countyView } from '../src/site/areas.js'
import { copyProblems } from '../src/site/claims.js'

const SRC = fileURLToPath(new URL('../src', import.meta.url))
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8')
const t = customerTranslator()

/** Every key anywhere in a JSON value, at any depth. */
function keys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keys)
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => [k, ...keys(v)])
  return []
}

describe('Areas page (TSK-0023, HH-CUS-04)', () => {
  it('[HH-CUS-04] one section per county, grouped Kentucky then Indiana, named with the county and the state', () => {
    const states = areaByState(t)
    expect(states.map((s) => [s.label, s.counties.map((c) => c.name)])).toEqual([
      [
        'Kentucky',
        [
          'Jefferson County, Kentucky',
          'Oldham County, Kentucky',
          'Bullitt County, Kentucky',
          'Shelby County, Kentucky',
          'Meade County, Kentucky',
        ],
      ],
      [
        'Indiana',
        [
          'Clark County, Indiana',
          'Floyd County, Indiana',
          'Harrison County, Indiana',
          'Scott County, Indiana',
          'Washington County, Indiana',
          'Jefferson County, Indiana',
        ],
      ],
    ])
    expect(new Set(states.flatMap((s) => s.counties.map((c) => c.id))).size).toBe(11)
  })

  it('[HH-CUS-04][OWN-DEC-48] a section names only the towns of the fact; no street, ZIP code or other local detail', () => {
    const towns = SERVICE_AREA.map((c) => countyView(t, c).towns)
    expect(towns.filter((x) => x !== null)).toEqual([
      'Includes Louisville.',
      'Includes Corydon.',
      'Includes Salem.',
      'Includes Madison.',
    ])
    const page = read('pages/areas.astro')
    expect(page).toContain('id={c.id}')
    expect(page).toContain('<CoverageChecker client:load />')
    expect(page).toContain('href="/request"')
    expect(page).toContain('href="#zip-check"')
    expect(page).not.toMatch(/\b\d{5}\b/)
  })

  it('[T08][HH-CUS-04] without approved local content every county links to its anchor, also in the footer', () => {
    for (const c of SERVICE_AREA) expect(countyView(t, c).href).toMatch(/^\/areas#[a-z]+-county-(ky|in)$/)
    const footer = read('components/SiteFooter.astro')
    expect(footer).toContain('<a href={c.href}>{c.name}</a>')
    expect(footer).toContain('<a href={AREAS_PATH}>')
  })

  it('[HH-CUS-04][HH-CUS-05] the structured data names the brand, the counties and the states only', () => {
    const ld = JSON.parse(areaStructuredData(t, 'HandyHub')) as {
      '@type': string
      name: string
      areaServed: { name: string; containedInPlace: { name: string } }[]
    }
    expect(ld['@type']).toBe('LocalBusiness')
    expect(ld.name).toBe('HandyHub')
    expect(ld.areaServed.map((a) => a.name)).toEqual(SERVICE_AREA.map((c) => countyView(t, c).name))
    expect(new Set(ld.areaServed.map((a) => a.containedInPlace.name))).toEqual(new Set(['Kentucky', 'Indiana']))
    // No address, ZIP code, telephone or email (OWN-DEC-48, FACT-PUBLIC-CONTACT).
    for (const k of keys(ld))
      expect(k).not.toMatch(
        /address|postal|street|locality|telephone|email|geo|url|contactPoint|aggregateRating|review/i,
      )
    expect(read('pages/areas.astro')).toContain("areaStructuredData(t, 'HandyHub')")
  })

  it('[HH-BASE-04] every sentence of the area passes the copy lint', () => {
    const texts = [
      t.t('areas.title'),
      t.t('areas.intro'),
      ...areaByState(t).flatMap((s) => [s.label, ...s.counties.flatMap((c) => [c.name, c.towns ?? ''])]),
      areaStructuredData(t, 'HandyHub'),
    ]
    expect(texts.flatMap((x) => copyProblems(x))).toEqual([])
  })
})

describe('not-found and error pages (TSK-0023, HH-CUS-05)', () => {
  it('[HH-CUS-05] both pages use the layout, stay out of search and lead back to the site', () => {
    const notFound = read('pages/404.astro')
    const error = read('pages/500.astro')
    for (const p of [notFound, error]) {
      expect(p).toMatch(/<SiteLayout title=\{[^}]+\}[^>]* noindex>/)
      expect(p).toContain("t.t('site.homeLink')")
    }
    expect(notFound).toContain("t.t('error.NOT_FOUND')")
    expect(notFound).toContain('AREAS_PATH')
    expect(error).toContain("t.t('error.INTERNAL')")
    // The public pages themselves stay indexable (T75: the layout keeps its shell).
    for (const p of ['pages/index.astro', 'pages/areas.astro', 'pages/services/index.astro'])
      expect(read(p), p).not.toMatch(/noindex/)
  })
})
