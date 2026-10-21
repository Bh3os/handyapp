// The service area as the public site presents it (TSK-0023; HH-CUS-04, T08, FACT-SERVICE-AREA, OWN-DEC-37,
// OWN-DEC-48, OWN-DEC-57). Shared by the site (the Areas page, the footer, the structured data) and the server (county
// URLs, the sitemap). Pure data and functions.
//
// - The eleven whole counties of OWN-DEC-37, with the towns FACT-SERVICE-AREA names and nothing else: no street,
//   landmark, neighbourhood, drive time or ZIP code (OWN-DEC-48). A test checks the list equals the coverage.area
//   configuration (migration 0015); this list never feeds coverage, which comes only from that configuration.
// - A county has a dedicated page only with authentic local content the owner approved (OWN-DEC-57): at least two
//   lines, citing the decision that approved them. None has been supplied, so every county lives on the Areas page
//   under its anchor, and its county URL answers 301 to that anchor.

export const AREA_STATES = ['KY', 'IN'] as const
export type AreaState = (typeof AREA_STATES)[number]

/** Owner-approved local content for a dedicated county page: catalog keys of the lines, and the approving decision. */
export type CountyLocalContent = { readonly lineKeys: readonly string[]; readonly decision: string }

export type ServiceAreaCounty = {
  readonly state: AreaState
  /** The county name without "County", as coverage.area records it. */
  readonly county: string
  /** Towns FACT-SERVICE-AREA names in this county; empty when it names none. */
  readonly towns: readonly string[]
  /** Approved local content (OWN-DEC-57); null while none has been supplied. */
  readonly localContent: CountyLocalContent | null
}

/** FACT-SERVICE-AREA (OWN-DEC-37: "then whole counties"), in the fact's order. */
export const SERVICE_AREA: readonly ServiceAreaCounty[] = [
  { state: 'KY', county: 'Jefferson', towns: ['Louisville'], localContent: null },
  { state: 'KY', county: 'Oldham', towns: [], localContent: null },
  { state: 'KY', county: 'Bullitt', towns: [], localContent: null },
  { state: 'KY', county: 'Shelby', towns: [], localContent: null },
  { state: 'KY', county: 'Meade', towns: [], localContent: null },
  { state: 'IN', county: 'Clark', towns: [], localContent: null },
  { state: 'IN', county: 'Floyd', towns: [], localContent: null },
  { state: 'IN', county: 'Harrison', towns: ['Corydon'], localContent: null },
  { state: 'IN', county: 'Scott', towns: [], localContent: null },
  { state: 'IN', county: 'Washington', towns: ['Salem'], localContent: null },
  { state: 'IN', county: 'Jefferson', towns: ['Madison'], localContent: null },
]

export const AREAS_PATH = '/areas'

/** 'jefferson-county-ky': the county's anchor on the Areas page and its county URL segment (PROPOSED form). */
export function countySlug(c: Pick<ServiceAreaCounty, 'state' | 'county'>): string {
  return `${c.county.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-county-${c.state.toLowerCase()}`
}

/** The county URL: its dedicated page when one is published, otherwise it redirects to the anchor. */
export const countyPath = (c: Pick<ServiceAreaCounty, 'state' | 'county'>) => `${AREAS_PATH}/${countySlug(c)}`

/** The county's section on the Areas page. */
export const countyAnchor = (c: Pick<ServiceAreaCounty, 'state' | 'county'>) => `${AREAS_PATH}#${countySlug(c)}`

/** Whether a county may have its own page (OWN-DEC-57): at least two approved local lines and the approving decision. */
export function hasCountyPage(c: Pick<ServiceAreaCounty, 'localContent'>): boolean {
  const content = c.localContent
  return (
    content !== null &&
    content.lineKeys.filter((k) => k.trim() !== '').length >= 2 &&
    /^OWN-DEC-\d+$/.test(content.decision)
  )
}

/** Where links to a county go (HH-CUS-04): its page when it has one, otherwise its anchor on the Areas page. */
export const countyHref = (c: ServiceAreaCounty) => (hasCountyPage(c) ? countyPath(c) : countyAnchor(c))

/** The county a county URL segment names, or null. */
export function countyBySlug(
  slug: string,
  area: readonly ServiceAreaCounty[] = SERVICE_AREA,
): ServiceAreaCounty | null {
  return area.find((c) => countySlug(c) === slug) ?? null
}

/** The counties that have a dedicated page. */
export const countyPages = (area: readonly ServiceAreaCounty[] = SERVICE_AREA) => area.filter(hasCountyPage)
