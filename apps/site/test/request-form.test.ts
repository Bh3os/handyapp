// The request wizard's form model and draft store (TSK-0026; HH-INT-08, HH-INT-09, FACT-SESSION-TIMINGS).
import { describe, expect, it } from 'vitest'
import { DraftStore, draftKey, type DraftStorage } from '../src/request/draft.js'
import {
  answerKey,
  answersFor,
  EMPTY_VALUES,
  fromServer,
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
    expect(problems.map((p) => stepOf(p.field))).toEqual(problems.map(() => 'property'))
    // Semantic checks run once the schema passes: the phone, the date in the property's time zone.
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
