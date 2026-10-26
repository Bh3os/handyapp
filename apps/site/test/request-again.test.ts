// Request This Service Again on the request form (TSK-0113; HH-ID-12, HH-ID-03, OWN-DEC-113). Every reference, name and
// address is synthetic (RULE-SYNTHETIC-DATA).
import { describe, expect, it } from 'vitest'
import { asksForPrefill, parsePrefill, prefillUrl, prefillValues, type RequestPrefill } from '../src/request/again.js'
import { DraftStore, draftKey, type DraftStorage } from '../src/request/draft.js'
import {
  EMPTY_VALUES,
  MAX_SERVICES,
  problemKey,
  stepOf,
  toBody,
  validate,
  type FormService,
} from '../src/request/form.js'
import { reviewSections } from '../src/request/review.js'

const REF = 'HH-7K2M9Q4D'
const SAVED = '0b6f8a52-1c1e-4c55-9a43-6f0f1c2d3e4f'
const services: FormService[] = [
  { id: 'SVC-DW-01', name: 'Patching & Repair', category: 'drywall', questions: [] },
  { id: 'SVC-PT-01', name: 'Residential Interior Painting', category: 'painting', questions: [] },
]
const prefill: RequestPrefill = {
  reference: REF,
  services: ['SVC-DW-01', 'SVC-XX-99'],
  notSure: false,
  address: {
    street: '113 Synthetic Lane',
    unit: null,
    city: 'Testville',
    state: 'KY',
    zip: '40000',
    propertyType: 'house',
  },
  contact: { fullName: 'Test Customer', email: 'again@example.test', phone: '(502) 555-0113' },
  preferredChannel: 'call',
}
const meta = { formVersion: 'wizard-1', privacyNoticeVersion: 'none-yet' }
const opts = { now: new Date('2026-10-26T16:00:00Z'), zone: 'America/Kentucky/Louisville', services }

describe('the starting point (TSK-0113, HH-ID-12)', () => {
  it('[HH-ID-03] is read only from the account’s own answer, for a well-formed reference or saved property', () => {
    expect(prefillUrl(`?again=${REF.toLowerCase()}`)).toBe(`/api/v1/customer/account/projects/${REF}/request-again`)
    expect(prefillUrl(`?property=${SAVED}`)).toBe(`/api/v1/customer/account/properties/${SAVED}/request`)
    expect(prefillUrl('?again=../../staff')).toBeNull()
    expect(prefillUrl('?property=1')).toBeNull()
    expect(prefillUrl('?service=SVC-DW-01')).toBeNull()
    expect(asksForPrefill('?again=nonsense')).toBe(true)
    expect(asksForPrefill('?service=SVC-DW-01')).toBe(false)
    expect(parsePrefill({ ...prefill, reference: 'nope' })).toBeNull()
    expect(parsePrefill({ ...prefill, price: 100 })).toEqual(prefill)
    expect(parsePrefill(prefill)).toEqual(prefill)
  })

  it('[OWN-DEC-113] reuses the services still offered, the address and the contact; nothing else, both consents unchecked', () => {
    const v = prefillValues(prefill, services, MAX_SERVICES)
    expect(v).toEqual({
      ...EMPTY_VALUES,
      services: ['SVC-DW-01'],
      street: '113 Synthetic Lane',
      city: 'Testville',
      state: 'KY',
      zip: '40000',
      propertyType: 'house',
      fullName: 'Test Customer',
      email: 'again@example.test',
      phone: '(502) 555-0113',
      preferredChannel: 'call',
      repeatOf: REF,
      detailsConfirmed: false,
    })
    expect(v.description).toBe('')
    expect(v.smsOptIn).toBe(false)
    expect(v.marketingOptIn).toBe(false)
    expect(v.requestedDiscount).toBe('')
  })

  it('[HH-ID-12] the property details are confirmed before the request goes on, on the property step', () => {
    const v = {
      ...prefillValues(prefill, services, MAX_SERVICES),
      description: 'Synthetic: the same wall again.',
      preferredDate: '2026-10-28',
      windows: ['mornings'],
      estimatePreference: 'online',
    }
    const problems = validate(v, meta, opts)
    expect(problems).toEqual([{ field: 'repeatOf.detailsConfirmed', code: 'detailsNotConfirmed' }])
    expect(stepOf('repeatOf.detailsConfirmed')).toBe('property')
    expect(problemKey('detailsNotConfirmed')).toBe('request.again.confirmRequired')
    const confirmed = { ...v, detailsConfirmed: true }
    expect(validate(confirmed, meta, opts)).toEqual([])
    expect(toBody(confirmed, meta, services).repeatOf).toEqual({ reference: REF, detailsConfirmed: true })
    // An ordinary request sends no repeatOf.
    expect(toBody({ ...confirmed, repeatOf: '' }, meta, services).repeatOf).toBeUndefined()
    // The review names the earlier project.
    const property = reviewSections(confirmed, services, { windows: [] }).find((s) => s.id === 'property')
    expect(property?.groups[0]?.rows.map((r) => [r.label, r.value])).toContainEqual(['Requested again from', REF])
  })

  it('[HH-ID-12] a draft never keeps the confirmation', () => {
    const data = new Map<string, string>()
    const storage: DraftStorage = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    }
    const store = new DraftStore(storage, 'guest', 7)
    store.save({ ...prefillValues(prefill, services, MAX_SERVICES), detailsConfirmed: true }, 'property')
    expect(JSON.parse(data.get(draftKey('guest')) ?? '{}').values.detailsConfirmed).toBe(false)
  })
})
