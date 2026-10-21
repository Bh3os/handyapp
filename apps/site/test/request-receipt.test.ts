// The receipt (TSK-0032; HH-INT-12, HH-INT-07, OWN-DEC-94, FACT-RESPONSE-TARGET, FACT-HOURS, RULE-NO-INVENTED-FACTS).
// Synthetic values only (RULE-SYNTHETIC-DATA).
import { readFileSync } from 'node:fs'
import { customerTranslator } from '@handyhub/i18n'
import { nextStepsLines, receiptPath, REFERENCE_PATTERN } from '@handyhub/domain/request-form'
import { describe, expect, it } from 'vitest'
import { copyProblems } from '../src/site/claims.js'
import { EMPTY_VALUES, offeredWindows, type FormService, type FormValues } from '../src/request/form.js'
import {
  countsFromServer,
  loadReceipt,
  nextStepsText,
  parseReceipt,
  receiptGlance,
  receiptRecord,
  checkedAtText,
  withPhotoCounts,
  referenceFromPath,
  RECEIPT_STORAGE_KEY,
  saveReceipt,
  type ReceiptRecord,
} from '../src/request/receipt.js'

const { t } = customerTranslator()
const kg = (path: string) => readFileSync(new URL(`../../../kg/${path}`, import.meta.url), 'utf8')
/** The owner's exact response wording as the fact records it (receipt page and receipt email). */
const OWNER_RESPONSE = /receipt email, exact\): "([^"]+)"/.exec(kg('facts/FACT-RESPONSE-TARGET.md'))?.[1]

const services: FormService[] = [{ id: 'SVC-DW-01', name: 'Patching & Repair', category: 'drywall', questions: [] }]
const values: FormValues = {
  ...EMPTY_VALUES,
  services: ['SVC-DW-01'],
  description: 'Synthetic project: a dent behind a door.',
  street: '100 Synthetic Way',
  unit: 'Apt 2',
  city: 'Testville',
  state: 'KY',
  zip: '40000',
  propertyType: 'house',
  preferredDate: '2026-11-07',
  windows: ['mornings', 'weekends'],
  fullName: 'Test Customer',
  email: 'receipt-unit@example.test',
  phone: '(502) 555-0142',
  preferredChannel: 'call',
  estimatePreference: 'let_handyhub_decide',
}
const HOURS = { open: '08:00', close: '22:00' }

/** sessionStorage as a Map. */
class MemoryStorage {
  readonly data = new Map<string, string>()
  getItem(k: string) {
    return this.data.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.data.set(k, v)
  }
}
const storage = () => new MemoryStorage() as unknown as Storage

const record = (over: Partial<ReceiptRecord> = {}): ReceiptRecord => ({
  v: 1,
  reference: 'HH-7K3QABCD',
  submittedAt: '2026-10-21T12:00:00.000Z',
  glance: receiptGlance(values, services, offeredWindows(null, null)),
  photos: { received: 1, processing: 0, failed: 1 },
  photosCheckedAt: '2026-10-21T12:00:00.000Z',
  facts: { visitHours: HOURS, responseMinutes: 60 },
  ...over,
})

describe('the receipt wording is the owner’s (TSK-0032, HH-INT-12, OWN-DEC-94)', () => {
  it('[HH-INT-12] the headings and sentences are the approved wording', () => {
    expect(t('request.receipt.title')).toBe('Your request is in.')
    expect(t('request.receipt.thanks')).toBe('Thank you for choosing HandyHub.')
    expect(t('request.receipt.reference', { reference: 'HH-7K3QABCD' })).toBe('Request reference: HH-7K3QABCD')
    expect(t('request.receipt.glance')).toBe('Your project at a glance')
    expect(t('request.receipt.photos.title')).toBe('Your photos')
    expect(t('request.receipt.next.title')).toBe('What happens next?')
    expect(t('request.receipt.separate')).toBe(
      'Your request is received. Pricing and your appointment will be confirmed separately.',
    )
    expect(t('request.home')).toBe('Return Home')
    // Every sentence above is also in the owner's answer.
    const owner = kg('decisions/OWN-DEC-94.md')
    for (const s of [
      'Your request is in.',
      'Thank you for choosing HandyHub.',
      'Your project at a glance',
      'What happens next?',
    ])
      expect(owner).toContain(s)
  })

  it('[HH-INT-12] with the decided hours and target the next steps are exactly the owner’s sentences', () => {
    expect(OWNER_RESPONSE).toMatch(/^We'll review your project/)
    expect(nextStepsText({ visitHours: HOURS, responseMinutes: 60 })).toBe(OWNER_RESPONSE)
  })

  it('[HH-INT-12][RULE-NO-INVENTED-FACTS] the target and hours come from configuration; unknown states no time', () => {
    expect(nextStepsLines({ visitHours: HOURS, responseMinutes: 60 }).map((l) => l.key)).toEqual([
      'request.receipt.next.review',
      'request.receipt.next.targetHours',
      'request.receipt.next.outside',
    ])
    expect(nextStepsText({ visitHours: { open: '09:00', close: '21:30' }, responseMinutes: 90 })).toContain(
      'within 90 minutes during our daily hours, 9 AM–9:30 PM.',
    )
    expect(nextStepsText({ visitHours: HOURS, responseMinutes: 120 })).toContain('within 2 hours')
    for (const facts of [
      { visitHours: null, responseMinutes: 60 },
      { visitHours: HOURS, responseMinutes: null },
    ])
      expect(nextStepsText(facts)).toBe("We'll review your project and contact you using your preferred method.")
  })

  it('[HH-BASE-04] the catalog sentences pass the copy lint and never promise a booking or a price', () => {
    for (const key of [
      'request.receipt.next.targetHours',
      'request.receipt.next.targetMinutes',
      'request.receipt.photos.retryHint',
      'request.receipt.unavailable.text',
    ] as const)
      expect(copyProblems(t(key, { count: 1, hours: '8 AM–10 PM' }).replace(/within one (hour|minute)/, ''))).toEqual(
        [],
      )
    expect(nextStepsText(record().facts)).not.toMatch(/guarantee|24\/7|\$|book/i)
  })
})

describe('your project at a glance (TSK-0032, HH-INT-12)', () => {
  it('[HH-INT-12] summarizes services, description, property address, preferred timing and contact details as sent', () => {
    const glance = receiptGlance(values, services, offeredWindows(null, null))
    expect(glance.map((e) => [e.id, e.label, e.lines])).toEqual([
      ['services', 'Services', ['Patching & Repair']],
      ['description', 'Project description', ['Synthetic project: a dent behind a door.']],
      ['address', 'Property address', ['100 Synthetic Way, Apt 2', 'Testville, KY 40000']],
      ['timing', 'Preferred timing', ['Saturday, November 7, 2026', 'Mornings', 'Weekends']],
      [
        'contact',
        'Contact details',
        ['Test Customer', 'receipt-unit@example.test', '(502) 555-0142', 'Preferred method: Phone call'],
      ],
    ])
  })

  it('[HH-INT-12] leaves out what was not sent', () => {
    const glance = receiptGlance(
      {
        ...values,
        services: [],
        notSure: true,
        description: '',
        flexible: true,
        windows: ['any_time'],
        needHelpToday: true,
      },
      services,
      offeredWindows(null, null),
    )
    expect(glance.find((e) => e.id === 'description')).toBeUndefined()
    expect(glance.find((e) => e.id === 'services')?.lines).toEqual(['Not sure what service I need'])
    expect(glance.find((e) => e.id === 'timing')?.lines).toEqual(["I'm flexible", 'Any time', 'Need help today? Yes'])
  })
})

describe('the receipt is kept only in the tab that sent the request (TSK-0032, HH-INT-12, RULE-SERVER-AUTHZ)', () => {
  it('[HH-INT-12] a saved receipt is shown again for its own reference only', () => {
    const s = storage()
    saveReceipt(s, record())
    expect(loadReceipt(s, 'HH-7K3QABCD')).toEqual(record())
    expect(loadReceipt(s, 'HH-00000000')).toBeNull()
    expect(loadReceipt(storage(), 'HH-7K3QABCD')).toBeNull()
    expect(loadReceipt(null, 'HH-7K3QABCD')).toBeNull()
  })

  it('[HH-INT-12] anything that is not a receipt the wizard wrote is no receipt', () => {
    const s = storage()
    for (const raw of [
      'not json',
      JSON.stringify({ ...record(), v: 2 }),
      JSON.stringify({ ...record(), reference: 'HH-7k3q' }),
      JSON.stringify({ ...record(), glance: [{ id: 'history', label: 'Earlier projects', lines: [] }] }),
      JSON.stringify({ ...record(), photos: { received: -1, processing: 0, failed: 0 } }),
      JSON.stringify({ ...record(), facts: { visitHours: { open: '8', close: '22:00' }, responseMinutes: 60 } }),
      // Counts are never kept without the time they were taken (T13).
      JSON.stringify({ ...record(), photosCheckedAt: undefined }),
      JSON.stringify({ ...record(), photosCheckedAt: 12 }),
      JSON.stringify({ ...record(), already: 'yes' }),
    ]) {
      s.setItem(RECEIPT_STORAGE_KEY, raw)
      expect(loadReceipt(s, 'HH-7K3QABCD'), raw).toBeNull()
    }
    expect(parseReceipt(record())).toEqual(record())
  })

  it('[HH-INT-12] the receipt URL carries a well-formed reference only', () => {
    expect(receiptPath('HH-7K3QABCD')).toBe('/request/received/HH-7K3QABCD')
    expect(referenceFromPath('/request/received/HH-7K3QABCD')).toBe('HH-7K3QABCD')
    for (const p of [
      '/request/received/hh-7k3qabcd',
      '/request/received/HH-7K3Q',
      '/request/received/HH-0000000O',
      '/request',
      '/request/received/',
    ])
      expect(referenceFromPath(p), p).toBeNull()
    expect(REFERENCE_PATTERN.test('HH-ABCDEFGH')).toBe(true)
  })
})

describe('photo outcomes are reported as the server recorded them (TSK-0032, HH-INT-07, T13)', () => {
  it('[T13][HH-INT-07] received, processing and failed are counted separately; photos that never arrived are failed', () => {
    expect(
      countsFromServer([{ state: 'ready' }, { state: 'quarantined' }, { state: 'rejected' }, { state: 'ready' }], 1),
    ).toEqual({
      received: 2,
      processing: 1,
      failed: 2,
    })
    expect(t('request.receipt.photos.received', { count: 2 })).toBe('Received: 2')
    expect(t('request.receipt.photos.processing', { count: 1 })).toBe('Processing: 1')
    expect(t('request.receipt.photos.failed', { count: 2 })).toBe('Failed: 2')
  })
})

describe('the receipt record holds only what the save confirmed (TSK-0032 with TSK-0030, HH-INT-12, HH-INT-10)', () => {
  const saved = {
    reference: 'HH-7K3QABCD',
    submittedAt: '2026-10-21T12:00:00.000Z',
    glance: receiptGlance(values, services, offeredWindows(null, null)),
    facts: { visitHours: HOURS, responseMinutes: 60 },
    now: new Date('2026-10-21T12:00:05.000Z'),
  }

  it('[HH-INT-12][T13] a fresh save: the glance as sent, the server counts plus the photos that never arrived', () => {
    expect(
      receiptRecord({ ...saved, kind: 'sent', photos: { received: 1, processing: 1, failed: 0 }, notStored: 1 }),
    ).toEqual({
      v: 1,
      reference: 'HH-7K3QABCD',
      submittedAt: '2026-10-21T12:00:00.000Z',
      glance: saved.glance,
      photos: { received: 1, processing: 1, failed: 1 },
      // The server counted them when it saved the request.
      photosCheckedAt: '2026-10-21T12:00:00.000Z',
      facts: saved.facts,
    })
    expect(receiptRecord({ ...saved, kind: 'sent', photos: null, notStored: 0 })).not.toHaveProperty('photosCheckedAt')
    expect(receiptRecord({ ...saved, kind: 'sent', photos: null, notStored: 0 }).photos).toBeNull()
    expect(receiptRecord({ ...saved, kind: 'sent', submittedAt: null, photos: null, notStored: 2 })).toMatchObject({
      photos: { received: 0, processing: 0, failed: 2 },
      photosCheckedAt: '2026-10-21T12:00:05.000Z',
    })
  })

  it('[HH-INT-10][HH-INT-12][RULE-NO-INVENTED-FACTS] a key that already created a request: its reference only, no glance and no photo count invented', () => {
    const already = receiptRecord({
      ...saved,
      submittedAt: null,
      kind: 'already',
      photos: { received: 3, processing: 0, failed: 0 },
      notStored: 1,
    })
    expect(already).toEqual({
      v: 1,
      reference: 'HH-7K3QABCD',
      submittedAt: null,
      glance: [],
      photos: null,
      already: true,
      facts: saved.facts,
    })
    // Kept for the tab like any receipt, so a reload of its page shows it again.
    const s = storage()
    saveReceipt(s, already)
    expect(loadReceipt(s, 'HH-7K3QABCD')).toEqual(already)
    expect(t('request.receipt.already')).toBe(
      'We had already received this request from this browser. Anything you changed after you first sent it was not included.',
    )
  })
})

describe('the tab keeps the latest photo counts, with when they were taken (TSK-0032, T13, HH-INT-07)', () => {
  it('[T13][HH-INT-12] counts learned after a Retry or a processing photo settling replace the stored ones; a reload shows them', () => {
    const s = storage()
    const sent = record({ photos: { received: 1, processing: 1, failed: 1 } })
    saveReceipt(s, sent)
    // A Retry succeeded and the processing photo was checked as received.
    const later = withPhotoCounts(sent, { received: 3, processing: 0, failed: 0 }, '2026-10-21T12:04:00.000Z')
    saveReceipt(s, later)
    expect(loadReceipt(s, 'HH-7K3QABCD')).toEqual({
      ...sent,
      photos: { received: 3, processing: 0, failed: 0 },
      photosCheckedAt: '2026-10-21T12:04:00.000Z',
    })
    // Nothing else of the record changes, and no capability or file is ever kept with it.
    expect(JSON.stringify(loadReceipt(s, 'HH-7K3QABCD'))).not.toMatch(/capability|blob:|preview/i)
  })

  it('[T13] after a reload the counts are labelled with the time they were taken, never as current', () => {
    const at = checkedAtText('2026-10-21T16:04:00.000Z', 'America/Kentucky/Louisville')
    expect(at).toBe('Oct 21, 2026, 12:04 PM')
    expect(t('request.receipt.photos.asOf', { time: at })).toBe(
      'These counts are from Oct 21, 2026, 12:04 PM, the last time this page checked.',
    )
    expect(checkedAtText(undefined)).toBe('')
    expect(checkedAtText('not a time')).toBe('')
    expect(copyProblems(t('request.receipt.photos.asOf', { time: at }))).toEqual([])
  })
})

describe('the receipt not available here (TSK-0032, HH-INT-12)', () => {
  it('[HH-INT-12] says the receipt is kept in the browser tab that sent the request, promising nothing else', () => {
    // PROPOSED wording (customer copy, not the owner's): the receipt lives in the sending tab's sessionStorage.
    expect(t('request.receipt.unavailable.text')).toBe(
      'A receipt is shown only in the browser tab that sent the request, after the request was saved.',
    )
    expect(copyProblems(t('request.receipt.unavailable.text'))).toEqual([])
  })
})
