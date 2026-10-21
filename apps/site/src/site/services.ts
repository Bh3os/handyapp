// Service catalog and service pages (TSK-0021; HH-CUS-01, HH-CUS-02, OWN-DEC-33, OWN-DEC-51, OWN-DEC-66, OWN-DEC-84).
// Built at build time from the service registry (packages/db/seed/services.json, generated from the SVC-* nodes). The
// build holds a page for every registry service; the server serves only those the site may show (a draft is a 404),
// and the catalog lists only the services GET /api/v1/public/services returns (site/listing.ts).
//
// What a page says comes from the registry and from owner-approved facts only (RULE-NO-INVENTED-FACTS):
// - name, category and the request-form questions: the registry (HH-SVC-01, HH-SVC-03);
// - estimate approach: OWN-DEC-84 and OWN-DEC-99; at a glance: FACT-SERVICE-AREA, FACT-PRICING-PER-JOB, FACT-VISIT-FEE,
//   FACT-HOURS (the approved homepage sentences of OWN-DEC-86);
// - limits: FACT-SVC-EXCLUDED-SCOPE (OWN-DEC-51), FACT-SVC-SUSPECTED-HAZMAT, FACT-SVC-ACCESS-EQUIPMENT,
//   FACT-SVC-HOME-AGE-LIMITS (OWN-DEC-66), FACT-SVC-REFER-OUT-TASKS, FACT-SVC-RESIDENTIAL-ONLY;
// - scope the owner stated: FACT-SVC-DW01-REPAIR-SCOPE, FACT-SVC-CL07-SCOPE.
// No owner-approved description, preparation steps or service FAQs exist yet (OQ-SERVICE-DESCRIPTIONS): those parts
// show a visible "Not provided yet" state, never filler copy.
import registry from '@handyhub/db/seed/services.json'
import { serviceQuestions } from '@handyhub/domain/request-form'
import type { CustomerKey } from '@handyhub/i18n'

/** The four categories in the order of HH-CUS-01 and the request form (OWN-DEC-90). */
export const CATEGORIES = ['home_improvement', 'drywall', 'painting', 'cleaning'] as const
export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_LABEL: Record<Category, CustomerKey> = {
  home_improvement: 'request.category.home_improvement',
  drywall: 'request.category.drywall',
  painting: 'request.category.painting',
  cleaning: 'request.category.cleaning',
}
export const CATEGORY_TEXT: Record<Category, CustomerKey> = {
  home_improvement: 'request.categoryText.home_improvement',
  drywall: 'request.categoryText.drywall',
  painting: 'request.categoryText.painting',
  cleaning: 'request.categoryText.cleaning',
}

export type SiteService = {
  /** The immutable service ID, e.g. SVC-DW-01 (HH-SVC-01). */
  readonly id: string
  readonly code: string
  readonly category: Category
  readonly slug: string
  readonly name: string
  /** The labels of the questions the request form asks for this service (HH-SVC-03). */
  readonly questions: readonly string[]
  readonly homeAgeLimits: boolean
}

type SeedEntry = {
  id: string
  code: string
  category: string
  slug: string
  name: string
  intake: { guideInputs: string[] }
  homeAgeLimits: boolean
}

function isCategory(c: string): c is Category {
  return (CATEGORIES as readonly string[]).includes(c)
}

/** Every registry service, in category order and then registry order. */
export function siteServices(entries: readonly SeedEntry[] = registry.services): SiteService[] {
  const out = entries.map((s) => {
    if (!isCategory(s.category)) throw new Error(`${s.id}: unknown category ${s.category}`)
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(s.slug)) throw new Error(`${s.id}: slug ${s.slug} is not a URL slug`)
    return {
      id: s.id,
      code: s.code,
      category: s.category,
      slug: s.slug,
      name: s.name,
      questions: serviceQuestions(s.intake).map((q) => q.label),
      homeAgeLimits: s.homeAgeLimits,
    }
  })
  return CATEGORIES.flatMap((c) => out.filter((s) => s.category === c))
}

/** The service page URL. */
export const servicePath = (s: Pick<SiteService, 'slug'>) => `/services/${s.slug}`

/** The request action of a service page: the form opens with this service preselected by its ID (HH-CUS-01). */
export const requestHref = (s: Pick<SiteService, 'id'>) => `/request?service=${encodeURIComponent(s.id)}`

/** The request action for "Not sure what service I need": the form opens with that option chosen (HH-CUS-01). */
export const NOT_SURE_HREF = '/request?service=not-sure'

/**
 * Related services: the other services of the same category, in registry order. PROPOSED: the graph names no
 * relations between services, so the category is the relation. Only the ones the site shows are listed at run time.
 */
export function relatedServices(service: SiteService, all: readonly SiteService[] = siteServices()): SiteService[] {
  return all.filter((s) => s.category === service.category && s.id !== service.id)
}

/** Facts the owner gave about a service's scope (shown under "What's included"). */
const SCOPE: Readonly<Record<string, readonly CustomerKey[]>> = {
  'DW-01': ['service.scope.dw01Repairs'],
  'CL-07': ['service.scope.cl07Ducts'],
  'DW-04': ['service.scope.residentialOnly'],
  'CL-04': ['service.scope.residentialOnly'],
}

/** The tasks referred out at launch, by service (FACT-SVC-REFER-OUT-TASKS). */
const REFERRED_OUT: Readonly<Record<string, readonly CustomerKey[]>> = {
  'HI-01': ['service.limits.fireplaceMounting'],
  'HI-02': ['service.limits.burnerPorts'],
  'HI-04': ['service.limits.fireplaceMounting'],
  'HI-06': ['service.limits.roofEdgeGuards'],
  'HI-07': ['service.limits.fixtureBoxing'],
  'HI-11': ['service.limits.joistSistering'],
  'CL-02': ['service.limits.appliancePullOut'],
  'CL-04': ['service.limits.acidGroutHaze'],
  'CL-07': ['service.limits.biocideFogging'],
}

/** The owner's scope facts for a service; empty when the owner gave none. */
export function scopeFacts(s: Pick<SiteService, 'code'>): readonly CustomerKey[] {
  return SCOPE[s.code] ?? []
}

/** The home-age limits that apply to a service (FACT-SVC-HOME-AGE-LIMITS); popcorn removal is DW-02. */
export function homeAgeLimits(s: Pick<SiteService, 'code' | 'homeAgeLimits'>): CustomerKey[] {
  if (!s.homeAgeLimits) return []
  return s.code === 'DW-02'
    ? ['service.limits.homeAge1978', 'service.limits.popcorn1981']
    : ['service.limits.homeAge1978']
}

/**
 * "Is there anything you don't do?" (OWN-DEC-51): the service's own limits, the home-age limits where they apply, and
 * the licensed-trade, structural, hazardous-material and access limits of every service. The same text is the answer
 * in the page's FAQ structured data.
 */
export function serviceLimits(s: Pick<SiteService, 'code' | 'homeAgeLimits'>): CustomerKey[] {
  const own = [
    ...(REFERRED_OUT[s.code] ?? []),
    ...(SCOPE[s.code] ?? []).filter((k) => k === 'service.scope.residentialOnly'),
  ]
  return [...own, ...homeAgeLimits(s), 'service.limits.excluded', 'service.limits.hazmat', 'service.limits.access']
}

/** Relevant considerations: the home-age limits and the year check where they apply, and when a site visit is needed. */
export function considerations(s: Pick<SiteService, 'code' | 'homeAgeLimits'>): CustomerKey[] {
  const age = homeAgeLimits(s)
  return [
    ...age,
    ...(age.length ? (['service.considerations.homeYear'] as const) : []),
    'service.considerations.siteVisit',
  ]
}

/** FAQ structured data (schema.org FAQPage) for the limits question; `<` is escaped so the JSON cannot end the tag. */
export function faqStructuredData(question: string, answer: string): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [{ '@type': 'Question', name: question, acceptedAnswer: { '@type': 'Answer', text: answer } }],
  }).replace(/</g, '\\u003c')
}
