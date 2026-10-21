// The Areas page, the footer's county links and the area's structured data (TSK-0023; HH-CUS-04, HH-CUS-05, T08,
// FACT-SERVICE-AREA, FACT-BUSINESS-NAME, FACT-PUBLIC-CONTACT, OWN-DEC-48, OWN-DEC-57). The counties and towns come
// from @handyhub/domain/areas; every sentence comes from the customer catalog. Nothing here names a street, a city of
// residence or a ZIP code of the business, and the structured data carries no address, telephone or email
// (OWN-DEC-47, OWN-DEC-131: the contact stays a placeholder).
import {
  AREA_STATES,
  countyHref,
  countySlug,
  SERVICE_AREA,
  type AreaState,
  type ServiceAreaCounty,
} from '@handyhub/domain/areas'
import type { CustomerKey, Translator } from '@handyhub/i18n'

export const STATE_LABEL: Record<AreaState, CustomerKey> = { KY: 'areas.state.KY', IN: 'areas.state.IN' }

export type AreaCountyView = {
  readonly county: ServiceAreaCounty
  /** The anchor id on the Areas page. */
  readonly id: string
  /** Where links to the county go: its page when published, otherwise its anchor. */
  readonly href: string
  /** "Jefferson County, Kentucky". */
  readonly name: string
  /** "Includes Louisville." or null when the fact names no town. */
  readonly towns: string | null
}

const list = (items: readonly string[]) =>
  new Intl.ListFormat('en-US', { style: 'long', type: 'conjunction' }).format(items)

export function countyView(t: Translator<CustomerKey>, county: ServiceAreaCounty): AreaCountyView {
  return {
    county,
    id: countySlug(county),
    href: countyHref(county),
    name: t.t('areas.county.name', { county: county.county, state: t.t(STATE_LABEL[county.state]) }),
    towns: county.towns.length ? t.t('areas.county.towns', { towns: list(county.towns) }) : null,
  }
}

/** The counties grouped by state, Kentucky first, in the fact's order. */
export function areaByState(
  t: Translator<CustomerKey>,
  area: readonly ServiceAreaCounty[] = SERVICE_AREA,
): { state: AreaState; label: string; counties: AreaCountyView[] }[] {
  return AREA_STATES.map((state) => ({
    state,
    label: t.t(STATE_LABEL[state]),
    counties: area.filter((c) => c.state === state).map((c) => countyView(t, c)),
  }))
}

/**
 * Structured data naming the counties and the states only (schema.org LocalBusiness with areaServed; PROPOSED type):
 * the brand name, no address, no telephone, no email. `<` is escaped so the JSON cannot end the script tag.
 */
export function areaStructuredData(
  t: Translator<CustomerKey>,
  brand: string,
  area: readonly ServiceAreaCounty[] = SERVICE_AREA,
): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: brand,
    areaServed: area.map((c) => ({
      '@type': 'AdministrativeArea',
      name: countyView(t, c).name,
      containedInPlace: { '@type': 'State', name: t.t(STATE_LABEL[c.state]) },
    })),
  }).replace(/</g, '\\u003c')
}
