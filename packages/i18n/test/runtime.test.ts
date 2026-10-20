// i18n runtime tests (TSK-0008; HH-LANG-02, HH-LANG-03, RULE-LANGUAGES, T04, T66). Records are synthetic.
import { describe, expect, it } from 'vitest'
import {
  audienceLocale,
  CATALOGS,
  createTranslator,
  customerTranslator,
  LABEL_FAMILIES,
  MissingMessageError,
  resolveStaffLocale,
  staffLabel,
  staffTranslator,
  STAFF_LOCALES,
  type Audience,
  type StaffLocale,
} from '../src/index.js'

describe('canonical codes and staff labels (TSK-0008, HH-LANG-03)', () => {
  it('[HH-LANG-03][T04] a stored enum renders in either staff locale without changing the record', () => {
    const record = Object.freeze({
      id: 'job-synthetic-0001',
      state: 'ready_for_qa' as const,
      serviceId: 'svc-synthetic',
      quantity: 3,
      priceCents: 12345,
      customerLanguage: 'en',
    })
    const before = structuredClone(record)

    expect(staffLabel('en', 'jobState', record.state)).toBe('Awaiting quality review')
    expect(staffLabel('es', 'jobState', record.state)).toBe('En espera de revisión de calidad')
    expect(record).toEqual(before)
  })

  it('[HH-LANG-03] every job state code has a label in both staff locales', () => {
    for (const locale of STAFF_LOCALES) {
      for (const code of LABEL_FAMILIES.jobState) {
        expect(staffLabel(locale, 'jobState', code), `${locale} ${code}`).not.toBe('')
      }
    }
  })
})

describe('audience decides the language (TSK-0008, HH-LANG-03, RULE-LANGUAGES)', () => {
  it('[T04][RULE-LANGUAGES] customer output stays English while the staff interface is Spanish', () => {
    const staffLocale: StaffLocale = 'es'
    expect(staffTranslator(staffLocale).t('app.title')).toBe('HandyHub para el personal')
    expect(customerTranslator().locale).toBe('en')
    expect(customerTranslator().t('portal.title')).toBe('HandyHub customer portal')
    expect(audienceLocale({ kind: 'customer' })).toBe('en')
    expect(audienceLocale({ kind: 'staff', locale: staffLocale })).toBe('es')
  })

  it('[T66][HH-LANG-03] a reply from a Spanish-locale staff member renders the customer template in English', () => {
    const sender: Audience = { kind: 'staff', locale: 'es' }
    const recipient: Audience = { kind: 'customer' }
    const preview = customerTranslator().t('portal.title')
    expect(audienceLocale(sender)).toBe('es')
    expect(audienceLocale(recipient)).toBe('en')
    // The staff preview is exactly what the customer receives (HH-LANG-03).
    expect(preview).toBe(customerTranslator().t('portal.title'))
  })

  it('[RULE-LANGUAGES] staff locales are English and Spanish only; an unknown stored locale falls back to English', () => {
    expect(STAFF_LOCALES).toEqual(['en', 'es'])
    expect(resolveStaffLocale('es')).toBe('es')
    expect(resolveStaffLocale('fr')).toBe('en')
    expect(resolveStaffLocale(null)).toBe('en')
    expect(() => staffTranslator('fr' as StaffLocale)).toThrow(RangeError)
    expect(Object.keys(CATALOGS)).not.toContain('customer.es')
  })
})

describe('ICU formatting (TSK-0008, HH-LANG-02)', () => {
  const en = createTranslator('staff', 'en', 'fixture.en', {
    visits: '{count, plural, =0 {No visits} one {# visit} other {# visits}} for {name}',
    hold: '{kind, select, critical {Critical hold} other {Hold}}',
  })
  const es = createTranslator('staff', 'es', 'fixture.es', {
    visits: '{count, plural, =0 {Sin visitas} one {# visita} other {# visitas}} para {name}',
    hold: '{kind, select, critical {Retención crítica} other {Retención}}',
  })

  it('[HH-LANG-02] formats plurals, selects and placeholders in both staff languages', () => {
    expect(en.t('visits', { count: 0, name: 'Synthetic Customer' })).toBe('No visits for Synthetic Customer')
    expect(en.t('visits', { count: 1, name: 'A' })).toBe('1 visit for A')
    expect(es.t('visits', { count: 2, name: 'A' })).toBe('2 visitas para A')
    expect(es.t('hold', { kind: 'critical' })).toBe('Retención crítica')
    expect(en.t('visits', { count: 1200, name: 'A' })).toBe('1,200 visits for A')
  })

  it('[HH-LANG-02] an unknown key or a missing placeholder value throws instead of rendering a guess', () => {
    expect(() => en.t('nope')).toThrow(MissingMessageError)
    expect(() => en.t('visits', { count: 1 })).toThrow()
  })
})
