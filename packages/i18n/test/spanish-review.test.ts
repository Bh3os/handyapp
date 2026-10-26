// Spanish review helpers (TSK-0102; HH-LANG-02, HH-LANG-04, T70, OWN-DEC-79). Fixture catalogs are synthetic.
import { describe, expect, it } from 'vitest'
import {
  createTranslator,
  glossaryProblems,
  releasedSpanish,
  untranslatedKeys,
  type SpanishSafetyRecord,
} from '../src/index.js'

const record = (status: SpanishSafetyRecord['status']): SpanishSafetyRecord => ({
  status,
  en: '0'.repeat(16),
  es: '1'.repeat(16),
  tool: 'compare-staff-safety-es@1',
  checkedOn: '2026-10-26',
  problems: [],
})

describe('Spanish safety release (TSK-0102, HH-LANG-04)', () => {
  const en = {
    'stop.synthetic': 'Never touch the synthetic wire. Call 911 for {who}.',
    'escalation.synthetic': 'Call the Owner.',
    'nav.synthetic': 'My Day',
  }
  const es = {
    'stop.synthetic': 'Toca el cable sintético. Llama al 911 por {who}.',
    'escalation.synthetic': 'Llama al propietario.',
    'nav.synthetic': 'Mi día',
  }

  it('[HH-LANG-04][T70] a safety message whose comparison failed shows the approved English to a Spanish reader', () => {
    const catalog = releasedSpanish(en, es, {
      'stop.synthetic': record('pending'),
      'escalation.synthetic': record('ai_reviewed'),
    })
    const t = createTranslator('staff', 'es', 'staff.es', catalog).t
    expect(t('stop.synthetic', { who: 'A' })).toBe('Never touch the synthetic wire. Call 911 for A.')
    expect(t('escalation.synthetic')).toBe('Llama al propietario.')
    expect(t('nav.synthetic')).toBe('Mi día')
  })

  it("[HH-LANG-04] the owner's own Spanish is released as it is", () => {
    const catalog = releasedSpanish(en, es, { 'escalation.synthetic': record('owner_wording') })
    expect(catalog['escalation.synthetic']).toBe('Llama al propietario.')
  })
})

describe('Spanish catalog checks (TSK-0102, HH-LANG-02)', () => {
  it('[HH-LANG-02] a message left in English is reported; names, units and same-spelled words are not', () => {
    const en = { a: 'Save the visit', b: 'Total {amount}', c: '{name}, {time}', d: 'PDF', e: '{n} min' }
    const es = { a: 'Save the visit', b: 'Total {amount}', c: '{name}, {time}', d: 'PDF', e: '{n} min' }
    expect(untranslatedKeys(en, es)).toEqual(['a'])
  })

  it('[HH-LANG-02] a glossary term rendered another way is reported', () => {
    const en = {
      a: 'The job is on Hold until the Owner sets Ready.',
      b: 'Use Start Work first.',
      c: 'Quote: "Your estimate is ready"',
    }
    const es = {
      a: 'El trabajo está en espera hasta que el dueño lo marque como Listo.',
      b: 'Use primero Iniciar trabajo.',
      c: 'Cita: "Your estimate is ready"',
    }
    expect(glossaryProblems(en, es).map((p) => [p.key, p.term])).toEqual([
      ['a', 'Owner (the role)'],
      ['a', 'hold (a job, review or safety hold)'],
    ])
  })
})
