// The service catalog and service pages (TSK-0021, TSK-0132; HH-CUS-01, HH-CUS-02, HH-QA-05, OWN-DEC-51, OWN-DEC-66,
// OWN-DEC-84, OWN-DEC-180, FACT-SVC-REFER-OUT-TASKS, RULE-NO-INVENTED-FACTS).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import registry from '@handyhub/db/seed/services.json'
import { MANUFACTURER_GUIDANCE, SERVICE_CONTENT } from '@handyhub/domain/service-content'
import { CATALOGS, customerTranslator } from '@handyhub/i18n'
import { describe, expect, it } from 'vitest'
import { copyProblems } from '../src/site/claims.js'
import { areaServed } from '../src/site/areas.js'
import { applyListing, parseListedIds } from '../src/site/listing.js'
import {
  CATEGORIES,
  considerations,
  faqStructuredData,
  homeAgeLimits,
  NOT_SURE_HREF,
  pageContent,
  relatedServices,
  requestHref,
  scopeFacts,
  serviceLimits,
  servicePath,
  serviceStructuredData,
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

  it('[HH-CUS-01][OWN-DEC-180] related services: the linked services of other categories, then the same category', () => {
    expect(relatedServices(byCode('DW-02')).map((s) => s.code)).toEqual(['PT-01', 'DW-01', 'DW-03', 'DW-04'])
    expect(relatedServices(byCode('PT-02')).map((s) => s.code)).toEqual(['HI-10', 'HI-11', 'PT-01', 'PT-03', 'PT-04'])
    expect(relatedServices(byCode('CL-03')).map((s) => s.code)).toEqual([
      'CL-01',
      'CL-02',
      'CL-04',
      'CL-05',
      'CL-06',
      'CL-07',
    ])
    for (const s of siteServices())
      expect(
        relatedServices(s).some((r) => r.id === s.id),
        s.code,
      ).toBe(false)
  })

  it('[HH-CUS-01] every registry service name passes the copy lint', () => {
    expect(siteServices().flatMap((s) => copyProblems(s.name).map((p) => `${s.code}: ${p.match}`))).toEqual([])
  })
})

describe('service page content (TSK-0021, HH-CUS-02, OWN-DEC-84)', () => {
  it('[HH-CUS-02][OWN-DEC-180] every service page renders its quality-reviewed content, never a missing state', () => {
    for (const entry of registry.services) {
      const content = entry.content as { review?: { decision: string; task: string } }
      expect(content.review, entry.id).toEqual({ decision: 'OWN-DEC-180', task: 'TSK-0132', reviewedOn: '2026-10-22' })
      expect(entry.publicStatus, entry.id).toBe('published')
    }
    for (const s of siteServices()) {
      const c = s.content
      if (!c) throw new Error(`${s.code}: no reviewed content`)
      expect(c.description.length, s.code).toBeGreaterThan(40)
      expect(c.included.length, s.code).toBeGreaterThan(0)
      expect(c.preparation.length, s.code).toBeGreaterThan(0)
      expect(c.faqs.length, s.code).toBeGreaterThanOrEqual(3)
      expect(c.faqs.length, s.code).toBeLessThanOrEqual(5)
    }
    expect(page).not.toMatch(/data-not-provided|notProvided/)
    for (const part of ['description', 'included', 'excluded', 'preparation', 'care', 'faqs'])
      expect(page).toContain(`data-testid="${part}"`)
  })

  it('[HH-CUS-02] a registry entry without reviewed content has no page content (a draft stays a draft)', () => {
    expect(pageContent({ description: null })).toBeNull()
    expect(pageContent(undefined)).toBeNull()
    expect(() => pageContent({ description: 'x', included: 'y' })).toThrow()
  })

  it('[HH-QA-05][OWN-DEC-180] care lines on a page: general and product lines only; withheld lines never appear', () => {
    for (const s of siteServices()) {
      const reviewed = SERVICE_CONTENT[s.id]
      if (!reviewed || !s.content) throw new Error(s.code)
      expect(s.content.care).toEqual([...reviewed.care.lines, ...reviewed.care.product.map((p) => p.text)])
      for (const p of reviewed.care.product) expect(p.text, `${s.code} ${p.key}`).toContain(MANUFACTURER_GUIDANCE)
      const shown = JSON.stringify(s.content)
      for (const w of [...reviewed.care.withheld, ...reviewed.withheldContent]) {
        expect(shown, s.code).not.toContain(w.topic)
        expect(shown, s.code).not.toContain(w.reason)
      }
      for (const f of reviewed.flags) expect(shown, s.code).not.toContain(f.text)
    }
    // The safety-critical lines named in OWN-DEC-180 item 6 are withheld on the services they apply to.
    const withheld = (code: string) => SERVICE_CONTENT[`SVC-${code}`]?.care.withheld.length ?? 0
    for (const code of [
      'HI-02',
      'HI-04',
      'HI-05',
      'HI-06',
      'HI-07',
      'HI-10',
      'HI-11',
      'DW-02',
      'PT-02',
      'PT-04',
      'CL-06',
      'CL-07',
    ])
      expect(withheld(code), code).toBeGreaterThan(0)
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
    const noDuration = /\$\s?\d|\b\d+\s*(hours?|days?|weeks?|minutes?|lbs?|pounds?|feet|ft|inches)\b|same day/i
    for (const key of keys) {
      expect(copyProblems(customer[key] ?? ''), key).toEqual([])
      expect(customer[key], key).not.toMatch(noDuration)
    }
    for (const s of siteServices()) {
      const c = s.content
      if (!c) throw new Error(s.code)
      const texts = [c.description, ...c.included, ...c.excluded, ...c.preparation, ...c.care]
      for (const f of c.faqs) texts.push(f.question, f.answer)
      for (const text of texts) {
        expect(copyProblems(text), `${s.code}: ${text}`).toEqual([])
        expect(text, s.code).not.toMatch(noDuration)
        expect(text, s.code).not.toMatch(/\b(flawless|perfect\w*|eco-?(safe|friendly)|non-toxic|guarantee|5-star)/i)
      }
      // Removed claims never come back as included work (they may appear only as "not included" or in an answer).
      for (const text of [c.description, ...c.included, ...c.care])
        expect(text, s.code).not.toMatch(/\b(sanitiz\w*|disinfect\w*|steriliz\w*|air quality|energy|waterproof\w*)/i)
    }
  })

  it('[HH-CUS-02][OWN-DEC-51] the FAQ structured data carries every question and cannot end its script tag', () => {
    const json = faqStructuredData([
      { question: 'Q1?', answer: 'A1' },
      { question: 'Q?', answer: 'A </script> B' },
    ])
    expect(json).not.toContain('</script>')
    expect(JSON.parse(json)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        { '@type': 'Question', name: 'Q1?', acceptedAnswer: { '@type': 'Answer', text: 'A1' } },
        { '@type': 'Question', name: 'Q?', acceptedAnswer: { '@type': 'Answer', text: 'A </script> B' } },
      ],
    })
    expect(page).toContain("{ question: limitsQuestion, answer: limits.join(' ') }")
    expect(page).toContain('faqStructuredData(faqs)')
  })

  it('[HH-CUS-02][OWN-DEC-180] local search: a description and Service data naming the 11 counties, no address', () => {
    const t = customerTranslator()
    const s = byCode('PT-01')
    const data = JSON.parse(serviceStructuredData(s, 'HandyHub', areaServed(t)))
    expect(data['@type']).toBe('Service')
    expect(data.name).toBe(s.name)
    expect(data.description).toBe(s.content?.description)
    expect(data.provider).toEqual({ '@type': 'LocalBusiness', name: 'HandyHub' })
    expect(data.areaServed).toHaveLength(11)
    expect(JSON.stringify(data)).not.toMatch(/address|telephone|email|price|rating/i)
    expect(t.t('service.meta.description', { service: s.name })).toBe(
      'Residential Interior Painting from HandyHub in the Louisville metro area of Kentucky and Southern Indiana. Free estimates—online or at your property.',
    )
    expect(copyProblems(t.t('service.meta.description', { service: s.name }))).toEqual([])
    expect(page).toContain('description={description}')
    expect(page).toContain('href="/areas"')
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

  it("[HH-CUS-01][OWN-DEC-180] a root that is itself the group (a page's related list) shows its listed items", () => {
    const f = fakeRoot(['SVC-DW-01', 'SVC-CL-01'])
    const list = { hidden: true }
    const empty = { hidden: true }
    const root = {
      ...(f.root as unknown as Record<string, unknown>),
      matches: (sel: string) => sel === '[data-listing-group]',
      querySelectorAll: (sel: string) => (sel === '[data-service-id]' ? f.items : []),
      querySelector: (sel: string) =>
        sel === '[data-listing-status]' ? f.status : sel === '[data-listing-empty]' ? empty : list,
    }
    applyListing(root as unknown as ParentNode, new Set(['SVC-CL-01']), 'Unavailable')
    expect(f.items.map((i) => i.hidden)).toEqual([true, false])
    expect(list.hidden).toBe(false)
    expect(empty.hidden).toBe(true)
  })

  it('[HH-CUS-01] an unreadable list shows the unavailable state and lists nothing', () => {
    const f = fakeRoot(['SVC-DW-01'])
    applyListing(f.root, null, 'Unavailable')
    expect(f.items.map((i) => i.hidden)).toEqual([true])
    expect(f.status.hidden).toBe(false)
    expect(f.status.textContent).toBe('Unavailable')
  })
})
