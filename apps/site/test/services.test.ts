// The service catalog and service pages (TSK-0021; HH-CUS-01, HH-CUS-02, OWN-DEC-51, OWN-DEC-66, OWN-DEC-84,
// FACT-SVC-REFER-OUT-TASKS, RULE-NO-INVENTED-FACTS).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import registry from '@handyhub/db/seed/services.json'
import { CATALOGS } from '@handyhub/i18n'
import { describe, expect, it } from 'vitest'
import { copyProblems } from '../src/site/claims.js'
import { applyListing, parseListedIds } from '../src/site/listing.js'
import {
  CATEGORIES,
  considerations,
  faqStructuredData,
  homeAgeLimits,
  NOT_SURE_HREF,
  relatedServices,
  requestHref,
  scopeFacts,
  serviceLimits,
  servicePath,
  siteServices,
} from '../src/site/services.js'

const customer: Record<string, string> = CATALOGS['customer.en']
const page = readFileSync(fileURLToPath(new URL('../src/pages/services/[slug].astro', import.meta.url)), 'utf8')
const catalogPage = readFileSync(fileURLToPath(new URL('../src/pages/services/index.astro', import.meta.url)), 'utf8')
const byCode = (code: string) => {
  const s = siteServices().find((x) => x.code === code)
  if (!s) throw new Error(code)
  return s
}
const texts = (keys: readonly string[]) => keys.map((k) => customer[k])

describe('service catalog (TSK-0021, HH-CUS-01)', () => {
  it('[HH-CUS-01] all 26 registry services, in the four categories, each with a unique page path', () => {
    const all = siteServices()
    expect(all).toHaveLength(26)
    expect(new Set(all.map((s) => s.id)).size).toBe(26)
    expect(new Set(all.map(servicePath)).size).toBe(26)
    expect(CATEGORIES).toEqual(['home_improvement', 'drywall', 'painting', 'cleaning'])
    expect(CATEGORIES.map((c) => all.filter((s) => s.category === c).length)).toEqual([11, 4, 4, 7])
    expect(all.map((s) => s.id).sort()).toEqual(registry.services.map((s) => s.id).sort())
  })

  it('[HH-CUS-01] the request action preselects by the immutable service ID; Not sure has its own action', () => {
    expect(requestHref(byCode('DW-01'))).toBe('/request?service=SVC-DW-01')
    expect(NOT_SURE_HREF).toBe('/request?service=not-sure')
    expect(catalogPage).toContain("t.t('request.services.notSure')")
    expect(catalogPage).toContain('href={NOT_SURE_HREF}')
    expect(page).toContain('href={requestHref(service)}')
  })

  it('[HH-CUS-01] related services are the other services of the same category', () => {
    const related = relatedServices(byCode('DW-02'))
    expect(related.map((s) => s.code)).toEqual(['DW-01', 'DW-03', 'DW-04'])
  })

  it('[HH-CUS-01] every registry service name passes the copy lint', () => {
    expect(siteServices().flatMap((s) => copyProblems(s.name).map((p) => `${s.code}: ${p.match}`))).toEqual([])
  })
})

describe('service page content (TSK-0021, HH-CUS-02, OWN-DEC-84)', () => {
  it('[HH-CUS-02] with no approved description, preparation or FAQs, each shows a visible Not provided yet state', () => {
    expect(customer['service.notProvided']).toBe('Not provided yet')
    for (const part of ['description', 'preparation', 'faq']) expect(page).toContain(`data-not-provided="${part}"`)
    // Nothing from the registry's draft content is rendered: no approved description exists (OQ-SERVICE-DESCRIPTIONS).
    expect(registry.services.every((s) => s.content.description === null)).toBe(true)
    expect(page).not.toMatch(/content\.description/)
  })

  it('[HH-CUS-02][OWN-DEC-51] every page names the licensed-trade, structural, hazardous-material and access limits', () => {
    for (const s of siteServices()) {
      const limits = serviceLimits(s)
      expect(limits.slice(-3)).toEqual(['service.limits.excluded', 'service.limits.hazmat', 'service.limits.access'])
    }
    expect(customer['service.limits.excluded']).toBe(
      "We don't do licensed trade work (gas, line-voltage electrical, plumbing or HVAC), structural work, or asbestos, lead or mold work.",
    )
    expect(customer['service.limits.heading']).toBe("Is there anything you don't do?")
  })

  it('[HH-CUS-02][OWN-DEC-66] the home-age limits apply to exactly the eight services; popcorn removal from 1981', () => {
    const limited = siteServices()
      .filter((s) => homeAgeLimits(s).length)
      .map((s) => s.code)
      .sort()
    expect(limited).toEqual(['DW-01', 'DW-02', 'DW-03', 'HI-09', 'PT-01', 'PT-02', 'PT-03', 'PT-04'])
    expect(texts(homeAgeLimits(byCode('DW-02')))).toEqual([
      "We don't take on paint-disturbing work in homes built before 1978.",
      'We remove popcorn ceilings only in homes built in 1981 or later.',
    ])
    expect(considerations(byCode('PT-01'))).toContain('service.considerations.homeYear')
    expect(considerations(byCode('HI-04'))).toEqual(['service.considerations.siteVisit'])
  })

  it('[HH-CUS-02] the referred-out tasks and the owner scope facts sit on their own services only', () => {
    const own = (code: string) =>
      serviceLimits(byCode(code)).filter((k) => !/excluded|hazmat|access|homeAge|popcorn/.test(k))
    expect(own('HI-01')).toEqual(['service.limits.fireplaceMounting'])
    expect(own('HI-04')).toEqual(['service.limits.fireplaceMounting'])
    expect(own('HI-02')).toEqual(['service.limits.burnerPorts'])
    expect(own('HI-06')).toEqual(['service.limits.roofEdgeGuards'])
    expect(own('HI-07')).toEqual(['service.limits.fixtureBoxing'])
    expect(own('HI-11')).toEqual(['service.limits.joistSistering'])
    expect(own('CL-02')).toEqual(['service.limits.appliancePullOut'])
    expect(own('CL-04')).toEqual(['service.limits.acidGroutHaze', 'service.scope.residentialOnly'])
    expect(own('CL-07')).toEqual(['service.limits.biocideFogging'])
    expect(own('DW-04')).toEqual(['service.scope.residentialOnly'])
    expect(own('PT-01')).toEqual([])
    expect(scopeFacts(byCode('DW-01'))).toEqual(['service.scope.dw01Repairs'])
    expect(scopeFacts(byCode('CL-07'))).toEqual(['service.scope.cl07Ducts'])
    expect(scopeFacts(byCode('HI-03'))).toEqual([])
  })

  it('[HH-CUS-02] the estimate approach and the at-a-glance facts use the approved wording', () => {
    expect(customer['service.estimate.approach']).toBe(
      'We estimate online when your details and photos are enough, and visit your property when an inspection or measurements are needed.',
    )
    for (const key of ['home.trust.pricing', 'home.trust.estimates', 'home.trust.visits'])
      expect(page).toContain(`t.t('${key}')`)
  })

  it('[HH-CUS-02] the questions are the request-form questions of the registry', () => {
    expect(byCode('CL-01').questions).toEqual(['Size/rooms', 'frequency', 'priorities', 'pets', 'condition'])
  })

  it('[HH-CUS-02][HH-BASE-04] no service-page text states a price, duration, credential, guarantee or review', () => {
    const keys = Object.keys(customer).filter((k) => k.startsWith('service.') || k.startsWith('services.'))
    expect(keys.length).toBeGreaterThan(40)
    for (const key of keys) {
      expect(copyProblems(customer[key] ?? ''), key).toEqual([])
      expect(customer[key], key).not.toMatch(/\$\s?\d|\b\d+\s*(hours?|days?|weeks?|minutes?)\b|same day/i)
    }
  })

  it('[HH-CUS-02][OWN-DEC-51] the FAQ structured data carries the limits text and cannot end its script tag', () => {
    const json = faqStructuredData('Q?', 'A </script> B')
    expect(json).not.toContain('</script>')
    expect(JSON.parse(json)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [{ '@type': 'Question', name: 'Q?', acceptedAnswer: { '@type': 'Answer', text: 'A </script> B' } }],
    })
    expect(page).toContain("faqStructuredData(limitsQuestion, limits.join(' '))")
  })
})

describe('listing from the API (TSK-0021, HH-CUS-01, OWN-DEC-84)', () => {
  it('[HH-CUS-01] reads the listed IDs; anything else is unknown', () => {
    expect(parseListedIds({ services: [{ id: 'SVC-DW-01' }, { id: 'SVC-PT-01' }] })).toEqual(
      new Set(['SVC-DW-01', 'SVC-PT-01']),
    )
    expect(parseListedIds({ services: [] })).toEqual(new Set())
    expect(parseListedIds(null)).toBeNull()
    expect(parseListedIds({ services: [{ name: 'x' }] })).toBeNull()
    expect(parseListedIds({ services: 'all' })).toBeNull()
  })

  function fakeRoot(ids: string[]) {
    const el = (data: Record<string, string>) => ({ dataset: data, hidden: true, textContent: '' })
    const items = ids.map((id) => el({ serviceId: id }))
    const status = el({})
    status.hidden = false
    const empty = el({})
    const list = el({})
    const group = {
      querySelectorAll: () => items,
      querySelector: (sel: string) => (sel === '[data-listing-empty]' ? empty : list),
    }
    const root = {
      querySelector: () => status,
      querySelectorAll: (sel: string) => (sel === '[data-service-id]' ? items : [group]),
    }
    return { root: root as unknown as ParentNode, items, status, empty, list }
  }

  it('[HH-CUS-01] shows only the listed services; an empty group shows its note', () => {
    const f = fakeRoot(['SVC-DW-01', 'SVC-CL-01'])
    applyListing(f.root, new Set(['SVC-DW-01']), 'Unavailable')
    expect(f.items.map((i) => i.hidden)).toEqual([false, true])
    expect(f.status.hidden).toBe(true)
    expect(f.empty.hidden).toBe(true)
    expect(f.list.hidden).toBe(false)
    const g = fakeRoot(['SVC-CL-01'])
    applyListing(g.root, new Set(), 'Unavailable')
    expect(g.empty.hidden).toBe(false)
    expect(g.list.hidden).toBe(true)
  })

  it('[HH-CUS-01] an unreadable list shows the unavailable state and lists nothing', () => {
    const f = fakeRoot(['SVC-DW-01'])
    applyListing(f.root, null, 'Unavailable')
    expect(f.items.map((i) => i.hidden)).toEqual([true])
    expect(f.status.hidden).toBe(false)
    expect(f.status.textContent).toBe('Unavailable')
  })
})
