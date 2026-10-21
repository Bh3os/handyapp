import { describe, expect, it } from 'vitest'
import { REQUESTS_MODULE } from '../../src/modules/requests/index.js'
import {
  localDate,
  newReference,
  normalizeUsPhone,
  requestKeyTaken,
  semanticProblems,
  spamSignals,
} from '../../src/modules/requests/submit.js'
import type { SubmitBody } from '../../src/modules/requests/schema.js'

const base: SubmitBody = {
  formVersion: 'test-1',
  privacyNoticeVersion: 'draft-test-1',
  services: [{ serviceId: 'SVC-DW-01' }],
  notSure: false,
  description: 'Synthetic description.',
  property: { street: '1 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
  timing: { flexible: true, needHelpToday: false, windows: [] },
  estimatePreference: 'online',
  contact: { fullName: 'Test Customer', email: 'c@example.test', phone: '502-555-0100', preferredChannel: 'email' },
  smsOptIn: false,
  marketingOptIn: false,
}
const known = new Set(['SVC-DW-01', 'SVC-PT-01'])

describe('request submission helpers (TSK-0025, HH-INT-10, HH-INT-11)', () => {
  it('makes random HH- references that reveal no sequence', () => {
    const refs = new Set(Array.from({ length: 200 }, newReference))
    expect(refs.size).toBe(200)
    for (const r of refs) expect(r).toMatch(/^HH-[0-9A-HJKMNP-TV-Z]{8}$/)
  })

  it('normalizes US phone numbers and refuses others', () => {
    expect(normalizeUsPhone('(502) 555-0100')).toBe('+15025550100')
    expect(normalizeUsPhone('1 502 555 0100')).toBe('+15025550100')
    expect(normalizeUsPhone('555 1234')).toBeNull()
    expect(normalizeUsPhone('012 555 0100')).toBeNull()
  })

  it('flags honeypot, too-fast and link-heavy submissions without refusing them', () => {
    const now = 1_792_000_000_000
    expect(spamSignals(base, now)).toEqual([])
    expect(spamSignals({ ...base, website: 'x', startedAt: now - 1000 }, now)).toEqual([
      'honeypot_filled',
      'filled_too_fast',
    ])
    expect(spamSignals({ ...base, description: 'http:// https:// http://' }, now)).toEqual(['many_links'])
  })

  it('reads the date in the property time zone for the tomorrow-or-later rule', () => {
    expect(localDate(new Date('2026-10-21T02:00:00Z'), 'America/Kentucky/Louisville')).toBe('2026-10-20')
    const today = '2026-10-20'
    const p = (b: Partial<SubmitBody>) =>
      semanticProblems({ ...base, ...b }, { today, knownServices: known }).map((x) => x.field)
    expect(p({})).toEqual([])
    expect(p({ timing: { flexible: false, preferredDate: today, needHelpToday: false, windows: [] } })).toEqual([
      'body.timing.preferredDate',
    ])
    expect(p({ timing: { flexible: false, preferredDate: '2026-10-21', needHelpToday: false, windows: [] } })).toEqual(
      [],
    )
    expect(p({ timing: { flexible: true, needHelpToday: false, windows: ['any_time', 'evenings'] } })).toEqual([
      'body.timing.windows',
    ])
    expect(p({ services: [{ serviceId: 'SVC-DW-01' }, { serviceId: 'SVC-DW-01' }] })).toEqual(['body.services'])
    expect(p({ services: [], notSure: true })).toEqual([])
    // One required project description (HH-SVC-03, TSK-0027).
    expect(p({ description: '  ' })).toEqual(['body.description'])
    expect(p({ answers: [{ question: 'size', kind: 'unknown', unit: 'ft' }] })).toEqual(['body.answers.0.unit'])
  })
})

describe('one request per idempotency key (TSK-0030, HH-INT-10, T11)', () => {
  it("[HH-INT-10][T11] a unique violation on the request's key is a conflict; any other error stays what it is", () => {
    expect(requestKeyTaken({ code: '23505', constraint: 'requests_idempotency_key_key' })).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
      status: 409,
      retryable: false,
    })
    expect(requestKeyTaken({ code: '23505', constraint: 'requests_reference_key' })).toBeNull()
    expect(requestKeyTaken({ code: '23503', constraint: 'requests_idempotency_key_key' })).toBeNull()
    expect(requestKeyTaken(new Error('synthetic'))).toBeNull()
    expect(requestKeyTaken(null)).toBeNull()
  })

  it("[HH-INT-10] the submission's conflict names only the stored reference", () => {
    const submit = REQUESTS_MODULE.routes.find((r) => r.operationId === 'submitRequest')
    const detail = submit?.idempotencyConflict
    expect(detail?.({ status: 'received', reference: 'HH-0000TEST', submittedAt: '2026-10-20T16:00:00.000Z' })).toEqual(
      { reference: 'HH-0000TEST' },
    )
    expect(detail?.(null)).toBeUndefined()
    expect(detail?.({ reference: 7 })).toBeUndefined()
  })
})
