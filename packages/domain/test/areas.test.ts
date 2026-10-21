// The service area as the site presents it (TSK-0023; HH-CUS-04, T08, FACT-SERVICE-AREA, OWN-DEC-37, OWN-DEC-57).
// The local content used for the page rule is synthetic (RULE-SYNTHETIC-DATA).
import { describe, expect, it } from 'vitest'
import {
  countyAnchor,
  countyBySlug,
  countyHref,
  countyPages,
  countyPath,
  countySlug,
  hasCountyPage,
  SERVICE_AREA,
  type ServiceAreaCounty,
} from '../src/areas.js'

// FACT-SERVICE-AREA, typed out from the fact independently of the module.
const FACT = [
  'KY:Jefferson',
  'KY:Oldham',
  'KY:Bullitt',
  'KY:Shelby',
  'KY:Meade',
  'IN:Clark',
  'IN:Floyd',
  'IN:Harrison',
  'IN:Scott',
  'IN:Washington',
  'IN:Jefferson',
]

describe('service area counties (TSK-0023, HH-CUS-04, FACT-SERVICE-AREA)', () => {
  it('[HH-CUS-04] lists exactly the eleven whole counties of OWN-DEC-37, with only the towns the fact names', () => {
    expect(SERVICE_AREA.map((c) => `${c.state}:${c.county}`)).toEqual(FACT)
    expect(Object.fromEntries(SERVICE_AREA.filter((c) => c.towns.length).map((c) => [countySlug(c), c.towns]))).toEqual(
      {
        'jefferson-county-ky': ['Louisville'],
        'harrison-county-in': ['Corydon'],
        'washington-county-in': ['Salem'],
        'jefferson-county-in': ['Madison'],
      },
    )
  })

  it('[HH-CUS-04] each county has its own anchor and URL; the two Jefferson counties are told apart by state', () => {
    const slugs = SERVICE_AREA.map(countySlug)
    expect(new Set(slugs).size).toBe(11)
    for (const s of slugs) expect(s).toMatch(/^[a-z]+-county-(ky|in)$/)
    const [ky] = SERVICE_AREA
    if (!ky) throw new Error('empty area')
    expect(countyPath(ky)).toBe('/areas/jefferson-county-ky')
    expect(countyAnchor(ky)).toBe('/areas#jefferson-county-ky')
    expect(countyBySlug('jefferson-county-in')).toMatchObject({ state: 'IN', county: 'Jefferson' })
    expect(countyBySlug('lake-county-in')).toBeNull()
    expect(countyBySlug('')).toBeNull()
  })

  it('[T08][HH-CUS-04] no approved local content exists, so no county has a page and links go to the anchor', () => {
    expect(countyPages()).toEqual([])
    for (const c of SERVICE_AREA) {
      expect(c.localContent).toBeNull()
      expect(countyHref(c)).toBe(countyAnchor(c))
    }
  })

  it('[T08][OWN-DEC-57] a county page needs at least two approved local lines and the approving decision', () => {
    const base: ServiceAreaCounty = { state: 'KY', county: 'Oldham', towns: [], localContent: null }
    const withContent = (lineKeys: string[], decision: string): ServiceAreaCounty => ({
      ...base,
      localContent: { lineKeys, decision },
    })
    expect(hasCountyPage(base)).toBe(false)
    expect(hasCountyPage(withContent(['areas.synthetic.one'], 'OWN-DEC-999'))).toBe(false)
    expect(hasCountyPage(withContent(['areas.synthetic.one', ' '], 'OWN-DEC-999'))).toBe(false)
    expect(hasCountyPage(withContent(['areas.synthetic.one', 'areas.synthetic.two'], 'PROPOSED'))).toBe(false)
    const ready = withContent(['areas.synthetic.one', 'areas.synthetic.two'], 'OWN-DEC-999')
    expect(hasCountyPage(ready)).toBe(true)
    expect(countyHref(ready)).toBe('/areas/oldham-county-ky')
    expect(countyPages([base, ready])).toEqual([ready])
  })
})
