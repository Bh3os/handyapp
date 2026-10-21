// The request wizard's form model and draft store (TSK-0026; HH-INT-08, HH-INT-09, FACT-SESSION-TIMINGS).
import { describe, expect, it } from 'vitest'
import { DraftStore, draftKey, type DraftStorage } from '../src/request/draft.js'
import {
  answerKey,
  answersFor,
  EMPTY_VALUES,
  firstPreferredDate,
  formatClock,
  fromServer,
  offeredWindows,
  problemKey,
  questionPlan,
  stepOf,
  toBody,
  validate,
  type FormService,
  type FormValues,
} from '../src/request/form.js'

const meta = { formVersion: 'wizard-1', privacyNoticeVersion: 'none-yet' }
const now = new Date('2026-10-20T16:00:00Z')
const services: FormService[] = [
  {
    id: 'SVC-DW-01',
    name: 'Patching & Repair',
    category: 'drywall',
    questions: [
      { key: 'moisture', label: 'moisture' },
      { key: 'texture', label: 'texture' },
    ],
  },
  {
    id: 'SVC-PT-01',
    name: 'Residential Interior Painting',
    category: 'painting',
    questions: [
      { key: 'colors', label: 'colors' },
      { key: 'texture', label: 'texture' },
    ],
  },
]
const opts = { now, zone: 'America/Kentucky/Louisville', services }
const complete: FormValues = {
  ...EMPTY_VALUES,
  notSure: true,
  description: 'Synthetic description.',
  street: '1 Synthetic Way',
  city: 'Testville',
  state: 'KY',
  zip: '40000',
  propertyType: 'house',
  preferredDate: '2026-10-21',
  windows: ['mornings'],
  estimatePreference: 'online',
  fullName: 'Test Customer',
  email: 'c@example.test',
  phone: '502-555-0100',
  preferredChannel: 'email',
}

class MemoryStorage implements DraftStorage {
  readonly map = new Map<string, string>()
  getItem(k: string) {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.map.set(k, v)
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
}

describe('request form validation shared with the server (TSK-0026, HH-INT-09)', () => {
  it('accepts a complete form and sends exactly the server body', () => {
    expect(validate(complete, meta, opts)).toEqual([])
    const body = toBody(complete, meta)
    expect(body).toMatchObject({
      notSure: true,
      services: [],
      timing: { preferredDate: '2026-10-21', flexible: false },
      smsOptIn: false,
      marketingOptIn: false,
    })
    expect(body).not.toHaveProperty('website')
  })

  it('reports empty fields as required and wrong values by kind, each owned by its step', () => {
    const problems = validate({ ...complete, street: '', zip: '4000', propertyType: '', phone: '555 1234' }, meta, opts)
    expect(problems).toEqual(
      expect.arrayContaining([
        { field: 'property.street', code: 'required' },
        { field: 'property.zip', code: 'pattern' },
        { field: 'property.propertyType', code: 'required' },
      ]),
    )
    // Each problem belongs to its step; the semantic checks run on every step (TSK-0028), so the phone's format
    // problem is reported for the contact step at the same time.
    expect(problems.map((p) => [p.field, stepOf(p.field)])).toEqual([
      ['property.street', 'property'],
      ['property.zip', 'property'],
      ['property.propertyType', 'property'],
      ['contact.phone', 'contact'],
    ])
    // The semantic checks: the phone, the date in the property's time zone.
    expect(validate({ ...complete, phone: '555 1234', preferredDate: '2026-10-20' }, meta, opts)).toEqual([
      { field: 'timing.preferredDate', code: 'minimum' },
      { field: 'contact.phone', code: 'format' },
    ])
    expect(problemKey('pattern')).toBe('error.field.format')
  })

  it('maps server field errors onto the wizard fields and steps', () => {
    const found = fromServer([
      { field: 'body.contact.email', code: 'format' },
      { field: 'body.services.0.serviceId', code: 'enum' },
    ])
    expect(found.map((p) => [p.field, stepOf(p.field)])).toEqual([
      ['contact.email', 'contact'],
      ['services.0.serviceId', 'services'],
    ])
  })
})

describe('property and timing preferences (TSK-0028, HH-INT-02, HH-INT-16, HH-INT-17)', () => {
  const zone = 'America/Kentucky/Louisville'
  const visit = { open: '08:00', close: '22:00' }

  it('[HH-INT-02][T09] offers the five windows without hours while the window hours are not configured', () => {
    expect(offeredWindows(visit, null)).toEqual([
      { code: 'mornings' },
      { code: 'afternoons' },
      { code: 'evenings' },
      { code: 'weekends' },
      { code: 'any_time' },
    ])
    expect(offeredWindows(null, null).map((w) => w.code)).toHaveLength(5)
  })

  it('[HH-INT-02] shows configured hours and leaves out a window outside the visit hours', () => {
    // Synthetic hours for the test only: the owner has not given any (OQ-WINDOW-HOURS).
    const hours = {
      mornings: { start: '08:00', end: '12:00' },
      afternoons: { start: '12:00', end: '17:00' },
      evenings: { start: '17:00', end: '23:00' },
    }
    expect(offeredWindows(visit, hours)).toEqual([
      { code: 'mornings', start: '08:00', end: '12:00' },
      { code: 'afternoons', start: '12:00', end: '17:00' },
      { code: 'weekends' },
      { code: 'any_time' },
    ])
    expect(['08:00', '12:00', '12:30', '22:00', '00:00'].map(formatClock)).toEqual([
      '8 AM',
      '12 PM',
      '12:30 PM',
      '10 PM',
      '12 AM',
    ])
  })

  it('[HH-INT-02][T09] Weekends must agree with the date; I am flexible always agrees; Any time stands alone', () => {
    const timing = (over: Partial<FormValues>) => validate({ ...complete, ...over }, meta, opts)
    // 2026-10-21 is a Wednesday, 2026-10-24 a Saturday.
    expect(timing({ windows: ['mornings', 'weekends'] })).toEqual([{ field: 'timing.windows', code: 'weekendDate' }])
    expect(problemKey('weekendDate')).toBe('request.timing.weekendDate')
    expect(timing({ windows: ['mornings', 'weekends'], preferredDate: '2026-10-24' })).toEqual([])
    expect(timing({ windows: ['weekends'], flexible: true })).toEqual([])
    // Reported when leaving the property step, before the later steps are filled in.
    expect(timing({ windows: ['weekends'], fullName: '', email: '', phone: '', preferredChannel: '' })).toContainEqual({
      field: 'timing.windows',
      code: 'weekendDate',
    })
    expect(timing({ windows: ['any_time', 'mornings'] })).toEqual([{ field: 'timing.windows', code: 'invalid' }])
    // A window the form does not offer is refused, as the server does.
    expect(validate({ ...complete, windows: ['evenings'] }, meta, { ...opts, windows: ['mornings'] })).toEqual([
      { field: 'timing.windows', code: 'enum' },
    ])
  })

  it('[HH-INT-17][T09] I am flexible replaces the date; Need help today is a flag sent with the preferences', () => {
    const body = toBody({ ...complete, flexible: true, needHelpToday: true, windows: ['any_time'] }, meta)
    expect(body.timing).toEqual({ flexible: true, needHelpToday: true, windows: ['any_time'] })
    expect(validate({ ...complete, flexible: false, preferredDate: '' }, meta, opts)).toEqual([
      { field: 'timing.preferredDate', code: 'required' },
    ])
  })

  it('[HH-INT-17][T41] dates start tomorrow in the property time zone, across both DST changes', () => {
    // 23:30 local on 2026-10-20 (EDT) is already 2026-10-21 in UTC.
    expect(firstPreferredDate(new Date('2026-10-21T03:30:00Z'), zone)).toBe('2026-10-21')
    // Spring forward, 2026-03-08: 01:59 EST and 03:00 EDT are the same local day.
    expect(firstPreferredDate(new Date('2026-03-08T06:59:00Z'), zone)).toBe('2026-03-09')
    expect(firstPreferredDate(new Date('2026-03-08T07:00:00Z'), zone)).toBe('2026-03-09')
    expect(firstPreferredDate(new Date('2026-03-08T04:59:00Z'), zone)).toBe('2026-03-08')
    // Fall back, 2026-11-01: both 01:30 hours (EDT, then EST) are 2026-11-01.
    expect(firstPreferredDate(new Date('2026-11-01T05:30:00Z'), zone)).toBe('2026-11-02')
    expect(firstPreferredDate(new Date('2026-11-01T06:30:00Z'), zone)).toBe('2026-11-02')
    // Month and year ends.
    expect(firstPreferredDate(new Date('2026-12-31T20:00:00Z'), zone)).toBe('2027-01-01')
  })

  it('[HH-INT-16] the full address is required, the unit optional, and the property type one of the four', () => {
    const body = toBody({ ...complete, unit: '' }, meta)
    expect(body.property).toEqual({
      street: '1 Synthetic Way',
      city: 'Testville',
      state: 'KY',
      zip: '40000',
      propertyType: 'house',
    })
    expect(toBody({ ...complete, unit: 'Apt 2' }, meta).property.unit).toBe('Apt 2')
    expect(validate({ ...complete, city: '', state: '', propertyType: 'mansion' }, meta, opts)).toEqual(
      expect.arrayContaining([
        { field: 'property.city', code: 'required' },
        { field: 'property.state', code: 'required' },
        { field: 'property.propertyType', code: 'enum' },
      ]),
    )
  })
})

describe('service questions (TSK-0027, HH-SVC-03, T06)', () => {
  it('asks a question several selected services share once, and the rest per service', () => {
    expect(questionPlan(services)).toEqual({
      shared: [{ key: 'texture', label: 'texture' }],
      perService: [
        { serviceId: 'SVC-DW-01', questions: [{ key: 'moisture', label: 'moisture' }] },
        { serviceId: 'SVC-PT-01', questions: [{ key: 'colors', label: 'colors' }] },
      ],
    })
  })

  it("sends I don't know as unknown (never zero), typed answers as text, and skips empty ones", () => {
    const v: FormValues = {
      ...complete,
      notSure: false,
      services: ['SVC-DW-01', 'SVC-PT-01'],
      answers: {
        [answerKey(undefined, 'texture')]: { text: '', unknown: true },
        [answerKey('SVC-DW-01', 'moisture')]: { text: 'A damp patch, synthetic', unknown: false },
        [answerKey('SVC-PT-01', 'colors')]: { text: '', unknown: false },
      },
      notes: { 'SVC-PT-01': 'Synthetic note' },
    }
    expect(answersFor(v, services)).toEqual([
      { question: 'texture', kind: 'unknown' },
      { serviceId: 'SVC-DW-01', question: 'moisture', kind: 'text', text: 'A damp patch, synthetic' },
    ])
    expect(toBody(v, meta, services).services).toEqual([
      { serviceId: 'SVC-DW-01' },
      { serviceId: 'SVC-PT-01', notes: 'Synthetic note' },
    ])
    expect(validate(v, meta, opts)).toEqual([])
  })

  it('refuses a sixth service and an unknown service ID, as the server does', () => {
    const six = ['SVC-DW-01', 'SVC-PT-01', 'SVC-A', 'SVC-B', 'SVC-C', 'SVC-D']
    expect(validate({ ...complete, services: six }, meta, opts).map((p) => p.field)).toContain('services')
    expect(validate({ ...complete, notSure: false, services: ['SVC-HI-99'] }, meta, opts)).toEqual([
      { field: 'services.0.serviceId', code: 'enum' },
    ])
  })
})

describe('browser drafts (TSK-0026, HH-INT-08, FACT-SESSION-TIMINGS)', () => {
  it('keeps a draft for the configured days, then expires it', () => {
    const storage = new MemoryStorage()
    const store = new DraftStore(storage, 'guest', 7)
    store.save(complete, 'contact', now.getTime())
    const draft = store.load(now.getTime() + 6 * 86_400_000)
    expect(draft?.values).toEqual(complete)
    expect(draft?.step).toBe('contact')
    expect(store.load(now.getTime() + 7 * 86_400_000 + 1)).toBeNull()
    expect(storage.map.size).toBe(0)
  })

  it('stores nothing while the period is not configured, and only form fields otherwise', () => {
    const storage = new MemoryStorage()
    new DraftStore(storage, 'guest', null).save(complete, 'services')
    expect(storage.map.size).toBe(0)
    const store = new DraftStore(storage, 'guest', 7)
    store.save({ ...complete, ...({ password: 'x', website: 'y' } as object) } as FormValues, 'review')
    const raw = storage.map.get(draftKey('guest')) ?? ''
    expect(raw).not.toMatch(/password|website/)
  })

  it('keeps one draft per identity, so another person never sees it', () => {
    const storage = new MemoryStorage()
    new DraftStore(storage, 'guest', 7).save(complete, 'job')
    expect(new DraftStore(storage, 'customer:synthetic-2', 7).load()).toBeNull()
    new DraftStore(storage, 'guest', 7).clear()
    expect(new DraftStore(storage, 'guest', 7).load()).toBeNull()
  })
})

describe('contact step consents (TSK-0029, HH-INT-18, HH-INT-22, OWN-DEC-147)', () => {
  const withDisclosure = { ...meta, smsDisclosureVersion: 'sms-disclosure-1' }

  it('[HH-INT-22][HH-INT-18] both boxes start unchecked and are sent as the customer left them', () => {
    expect(EMPTY_VALUES).toMatchObject({ smsOptIn: false, marketingOptIn: false })
    expect(toBody(complete, withDisclosure)).toMatchObject({
      smsOptIn: false,
      marketingOptIn: false,
      smsDisclosureVersion: 'sms-disclosure-1',
    })
    expect(toBody({ ...complete, smsOptIn: true }, withDisclosure)).toMatchObject({
      smsOptIn: true,
      marketingOptIn: false,
    })
    expect(toBody({ ...complete, marketingOptIn: true }, withDisclosure)).toMatchObject({
      smsOptIn: false,
      marketingOptIn: true,
    })
    // Neither is required: a request with both unchecked is complete (submitting is never SMS consent).
    expect(validate(complete, withDisclosure, opts)).toEqual([])
  })

  it('[HH-INT-22][T10] text as the preferred method needs the opt-in, and the form says so instead of changing it', () => {
    const textOnly = { ...complete, preferredChannel: 'text' }
    expect(validate(textOnly, withDisclosure, opts)).toEqual([
      { field: 'contact.preferredChannel', code: 'smsOptInRequired' },
    ])
    expect(stepOf('contact.preferredChannel')).toBe('contact')
    expect(problemKey('smsOptInRequired')).toBe('request.contact.textNeedsOptIn')
    expect(toBody(textOnly, withDisclosure).contact.preferredChannel).toBe('text')
    expect(validate({ ...textOnly, smsOptIn: true }, withDisclosure, opts)).toEqual([])
  })

  it('[HH-INT-22] an opt-in without the disclosure version shown is refused, on the contact step', () => {
    expect(validate({ ...complete, smsOptIn: true }, meta, opts)).toEqual([
      { field: 'smsDisclosureVersion', code: 'required' },
    ])
    expect(stepOf('smsDisclosureVersion')).toBe('contact')
    expect(stepOf('marketingOptIn')).toBe('contact')
  })

  it('[HH-INT-22][HH-INT-08] a draft never keeps the consent boxes: a resumed form shows them unchecked', () => {
    const storage = new MemoryStorage()
    const store = new DraftStore(storage, 'guest', 7)
    store.save({ ...complete, smsOptIn: true, marketingOptIn: true }, 'contact', now.getTime())
    const raw = storage.map.get(draftKey('guest')) ?? ''
    expect(raw).toContain('"smsOptIn":false')
    expect(raw).toContain('"marketingOptIn":false')
    expect(raw).not.toMatch(/OptIn":true/)
    expect(store.load(now.getTime())?.values).toMatchObject({
      smsOptIn: false,
      marketingOptIn: false,
      email: complete.email,
    })
  })
})
