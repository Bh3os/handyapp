// Reviewed service content and care notes (TSK-0132; HH-CUS-02, HH-QA-05, T57, OWN-DEC-180, OWN-DEC-81,
// RULE-NO-INVENTED-FACTS, RULE-HUMAN-REVIEW).
import { describe, expect, it } from 'vitest'
import {
  jobCareView,
  MANUFACTURER_GUIDANCE,
  SERVICE_CONTENT,
  SERVICE_CONTENT_REVIEW,
  serviceContent,
  type ServiceCare,
} from '../src/service-content.js'

const entries = Object.entries(SERVICE_CONTENT)
const CODES = /^SVC-(HI-(0[1-9]|1[01])|DW-0[1-4]|PT-0[1-4]|CL-0[1-7])$/

describe('reviewed service content (TSK-0132, HH-CUS-02, OWN-DEC-180)', () => {
  it('[HH-CUS-02][OWN-DEC-180] all 26 services passed the review: description, work, preparation, 3-5 FAQs', () => {
    expect(entries).toHaveLength(26)
    expect(SERVICE_CONTENT_REVIEW).toEqual({ decision: 'OWN-DEC-180', task: 'TSK-0132', reviewedOn: '2026-10-22' })
    for (const [id, c] of entries) {
      expect(id).toMatch(CODES)
      expect(c.description.trim().length, id).toBeGreaterThan(40)
      expect(c.included.length, id).toBeGreaterThan(0)
      expect(c.excluded.length, id).toBeGreaterThan(0)
      expect(c.preparation.length, id).toBeGreaterThan(0)
      expect(c.faqs.length, id).toBeGreaterThanOrEqual(3)
      expect(c.faqs.length, id).toBeLessThanOrEqual(5)
      expect(new Set(c.faqs.map((f) => f.question)).size, id).toBe(c.faqs.length)
      expect(c.corrections.length, id).toBeGreaterThan(0)
      for (const r of c.related) {
        expect(r).toMatch(CODES)
        expect(r.slice(4, 6), `${id} -> ${r}`).not.toBe(id.slice(4, 6))
      }
    }
    expect(serviceContent('SVC-XX-99')).toBeUndefined()
  })

  it('[HH-CUS-02] consistent formatting: sentences end with a period, list items do not, straight apostrophes', () => {
    for (const [id, c] of entries) {
      const sentences = [c.description, ...c.preparation, ...c.care.lines, ...c.care.product.map((p) => p.text)]
      for (const f of c.faqs) sentences.push(f.answer)
      for (const s of sentences) expect(s, id).toMatch(/[.]$/)
      for (const f of c.faqs) expect(f.question, id).toMatch(/\?$/)
      for (const item of [...c.included, ...c.excluded]) expect(item, id).not.toMatch(/[.]$/)
      expect(JSON.stringify(c), id).not.toMatch(/[‘’“”]/)
    }
  })

  it('[HH-QA-05][OWN-DEC-81] product-dependent care lines are tied to the manufacturer guidance and state no time', () => {
    for (const [id, c] of entries) {
      const keys = c.care.product.map((p) => p.key)
      expect(new Set(keys).size, id).toBe(keys.length)
      for (const p of c.care.product) {
        expect(p.text, `${id} ${p.key}`).toContain(MANUFACTURER_GUIDANCE)
        expect(p.text, `${id} ${p.key}`).not.toMatch(/\d/)
      }
      for (const line of c.care.lines) expect(line, id).not.toMatch(/\d/)
    }
  })

  it('[OWN-DEC-180][RULE-HUMAN-REVIEW] safety-critical care lines are withheld with a reason and a named reviewer', () => {
    const withheld = entries.flatMap(([id, c]) => c.care.withheld.map((w) => ({ id, ...w })))
    expect(withheld.length).toBeGreaterThan(0)
    for (const w of withheld) {
      expect(w.topic.length, w.id).toBeGreaterThan(10)
      expect(w.reason, w.id).toMatch(
        /electrical|gas|structural|hazardous|HVAC|fall|ladder|slip|life safety|chemical|stripper|electric/i,
      )
      expect(w.reviewer.length, w.id).toBeGreaterThan(5)
    }
    // Gas relighting, attic wiring and railing loads are among them.
    const topics = (id: string) => SERVICE_CONTENT[id]?.care.withheld.map((w) => w.topic).join(' ') ?? ''
    expect(topics('SVC-HI-02')).toMatch(/relighting/)
    expect(topics('SVC-HI-07')).toMatch(/wiring/)
    expect(topics('SVC-HI-11')).toMatch(/railings/)
  })
})

describe('care notes for one completed job (HH-QA-05, T57)', () => {
  const care: ServiceCare = {
    lines: ['Synthetic general line.'],
    product: [
      { key: 'paint.dry', topic: 'Drying times', text: `Drying times: ${MANUFACTURER_GUIDANCE} for it.` },
      { key: 'paint.leftover', topic: 'Leftover paint', text: `Leftover paint: ${MANUFACTURER_GUIDANCE}.` },
    ],
    withheld: [{ topic: 'Synthetic withheld line', reason: 'electrical', reviewer: 'Synthetic reviewer' }],
  }

  it('[HH-QA-05][T57] a product line without stored guidance is omitted and flagged; withheld lines never appear', () => {
    const view = jobCareView(care, { 'paint.dry': 'Synthetic guidance text from the product record.' })
    expect(view.lines).toEqual([
      'Synthetic general line.',
      'Drying times: Synthetic guidance text from the product record.',
    ])
    expect(view.missingGuidance).toEqual(['paint.leftover'])
    expect(JSON.stringify(view)).not.toContain('Synthetic withheld line')
  })

  it('[HH-QA-05] blank guidance counts as missing; no time is ever filled in', () => {
    const view = jobCareView(care, { 'paint.dry': '   ', 'paint.leftover': undefined })
    expect(view.lines).toEqual(['Synthetic general line.'])
    expect(view.missingGuidance).toEqual(['paint.dry', 'paint.leftover'])
  })

  it('[HH-QA-05] every service care set works with no stored guidance: only the general lines remain', () => {
    for (const [id, c] of entries) {
      const view = jobCareView(c.care, {})
      expect(view.lines, id).toEqual(c.care.lines)
      expect(view.missingGuidance, id).toEqual(c.care.product.map((p) => p.key))
    }
  })
})
