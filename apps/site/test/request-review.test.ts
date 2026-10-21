// The wizard's final review and the draft's send (TSK-0030; HH-INT-19, HH-INT-10, T11). Synthetic values only.
import { describe, expect, it } from 'vitest'
import { DraftStore, draftKey, newSend, type DraftStorage } from '../src/request/draft.js'
import { EMPTY_VALUES, offeredWindows, type FormService, type FormValues } from '../src/request/form.js'
import { addressLines, dateText, REVIEW_SECTIONS, reviewSections, SECTION_STEP } from '../src/request/review.js'

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
const values: FormValues = {
  ...EMPTY_VALUES,
  services: ['SVC-DW-01', 'SVC-PT-01'],
  notes: { 'SVC-PT-01': 'Synthetic note: two rooms.' },
  answers: {
    '/texture': { text: 'Smooth', unknown: false },
    'SVC-DW-01/moisture': { text: '', unknown: true },
    'SVC-PT-01/colors': { text: 'Synthetic white', unknown: false },
  },
  otherServicesText: 'Synthetic extra work beyond five services.',
  description: 'Synthetic description of the project.',
  street: '100 Synthetic Way',
  unit: 'Apt 7',
  city: 'Testville',
  state: 'KY',
  zip: '40000',
  propertyType: 'townhouse',
  preferredDate: '2026-10-31',
  needHelpToday: true,
  windows: ['mornings', 'weekends'],
  estimatePreference: 'let_handyhub_decide',
  fullName: 'Test Customer',
  email: 'review@example.test',
  phone: '(502) 555-0100',
  preferredChannel: 'call',
  smsOptIn: true,
  marketingOptIn: false,
}
const windows = offeredWindows(null, null)

type Section = ReturnType<typeof reviewSections>[number]
const flat = (s: Section) =>
  s.groups.flatMap((g) =>
    g.rows.map((r) => [g.title ?? '', r.label, typeof r.value === 'string' ? r.value : [...r.value]]),
  )
const section = (id: string) => {
  const s = reviewSections(values, services, { windows }).find((x) => x.id === id)
  if (!s) throw new Error(`no section ${id}`)
  return s
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

describe('final review (TSK-0030, HH-INT-19)', () => {
  it('[HH-INT-19] has six sections in order, each with the step its Edit action opens', () => {
    const sections = reviewSections(values, services, { windows })
    expect(sections.map((s) => [s.id, s.step, s.title])).toEqual([
      ['services', 'services', 'Services'],
      ['job', 'job', 'About the job'],
      ['photos', 'job', 'Photos'],
      ['property', 'property', 'Property'],
      ['timing', 'property', 'Preferred timing'],
      ['contact', 'contact', 'Contact'],
    ])
    expect(REVIEW_SECTIONS.map((id) => SECTION_STEP[id])).toEqual(sections.map((s) => s.step))
  })

  it('[HH-INT-19] shows the services, the extra work, every answer per service with its notes, and unknown as unknown', () => {
    expect(flat(section('services'))).toEqual([
      ['', 'Select services', ['Patching & Repair', 'Residential Interior Painting']],
      ['', 'Other services (describe them here)', 'Synthetic extra work beyond five services.'],
    ])
    expect(flat(section('job'))).toEqual([
      ['', 'Project description', 'Synthetic description of the project.'],
      ['For your selected services', 'texture', 'Smooth'],
      ['Patching & Repair', 'moisture', "I don't know"],
      ['Residential Interior Painting', 'colors', 'Synthetic white'],
      ['Residential Interior Painting', 'Notes for Residential Interior Painting', 'Synthetic note: two rooms.'],
    ])
    // Not sure is shown when chosen; an unanswered question is simply not listed.
    const notSure = reviewSections({ ...values, services: [], notSure: true }, services, { windows })
    expect(flat(notSure[0] as Section)).toContainEqual(['', 'Not sure what service I need', 'Yes'])
  })

  it('[HH-INT-19][HH-INT-16] shows the full address with unit, the property type and the timing preferences', () => {
    expect(flat(section('property'))).toEqual([
      ['', 'Property address', ['100 Synthetic Way, Apt 7', 'Testville, KY 40000']],
      ['', 'Property type', 'Townhouse'],
    ])
    expect(flat(section('timing'))).toEqual([
      ['', 'Preferred date', 'Saturday, October 31, 2026'],
      ['', 'Need help today?', 'Yes'],
      ['', 'Preferred times', ['Mornings', 'Weekends']],
    ])
    const flexible = reviewSections({ ...values, flexible: true, needHelpToday: false }, services, { windows })
    expect(flat(flexible[4] as Section)).toEqual([
      ['', 'Preferred date', "I'm flexible"],
      ['', 'Preferred times', ['Mornings', 'Weekends']],
    ])
    // Configured window hours are shown as the step shows them (HH-INT-02).
    const hours = offeredWindows(
      { open: '08:00', close: '22:00' },
      {
        mornings: { start: '08:00', end: '12:00' },
        afternoons: { start: '12:00', end: '17:00' },
        evenings: { start: '17:00', end: '22:00' },
      },
    )
    const withHours = reviewSections({ ...values, windows: ['mornings'] }, services, { windows: hours })
    expect(flat(withHours[4] as Section)).toContainEqual(['', 'Preferred times', ['Mornings (8 AM–12 PM)']])
  })

  it('[HH-INT-19][HH-INT-22] shows the contact details, the channel, both consents separately and the estimate choice', () => {
    expect(flat(section('contact'))).toEqual([
      ['', 'Full name', 'Test Customer'],
      ['', 'Email', 'review@example.test'],
      ['', 'Phone', '(502) 555-0100'],
      ['', 'How should we contact you?', 'Phone call'],
      ['', 'Texts', 'Yes'],
      ['', 'Marketing permission', 'No'],
      ['', 'How would you like your estimate?', 'Let HandyHub decide'],
    ])
  })

  it('[HH-INT-19] never shows a price, a fee or a confirmed time', () => {
    const text = JSON.stringify(reviewSections(values, services, { windows }))
    expect(text).not.toMatch(/\$|\bfee\b|\bprice\b|confirmed|booked|appointment/i)
  })

  it('formats a date in words and leaves anything else as typed; joins the address lines', () => {
    expect(dateText('2026-11-03')).toBe('Tuesday, November 3, 2026')
    expect(dateText('soon')).toBe('soon')
    expect(addressLines({ street: ' 1 Way ', unit: '', city: 'Testville', state: 'IN', zip: '47000' })).toEqual([
      '1 Way',
      'Testville, IN 47000',
    ])
    expect(addressLines({ street: '', unit: '', city: '', state: '', zip: '' })).toEqual([])
  })
})

describe("the draft's send (TSK-0030, HH-INT-10, T11)", () => {
  const now = Date.UTC(2026, 9, 20, 16)

  it('[HH-INT-10][T11] keeps one idempotency key and start time per draft, across a reload', () => {
    const storage = new MemoryStorage()
    const send = newSend(now)
    expect(send.idempotencyKey).toMatch(/^[A-Za-z0-9._:-]{8,128}$/)
    expect(newSend(now).idempotencyKey).not.toBe(send.idempotencyKey)
    new DraftStore(storage, 'guest', 7).save(values, 'review', now, send)
    // A new page (a reload) reads the same send back with the draft.
    const draft = new DraftStore(storage, 'guest', 7).load(now + 60_000)
    expect(draft?.send).toEqual(send)
    expect(draft?.step).toBe('review')
  })

  it('[HH-INT-10] a draft without a valid send loads without one, and Clear Draft removes it with the draft', () => {
    const storage = new MemoryStorage()
    const store = new DraftStore(storage, 'guest', 7)
    store.save(values, 'contact', now)
    expect(store.load(now)?.send).toBeUndefined()
    const raw = JSON.parse(storage.map.get(draftKey('guest')) ?? '{}') as Record<string, unknown>
    storage.map.set(draftKey('guest'), JSON.stringify({ ...raw, send: { idempotencyKey: 'bad key!', startedAt: 1 } }))
    expect(store.load(now)?.send).toBeUndefined()
    store.save(values, 'review', now, newSend(now))
    store.clear()
    expect(store.load(now)).toBeNull()
  })
})
