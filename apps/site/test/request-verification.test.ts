// Contact verification and the account offer on the receipt (TSK-0033; HH-INT-13, HH-ID-03, HH-INT-14, OWN-DEC-94,
// OWN-DEC-96, RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS). Synthetic values only (RULE-SYNTHETIC-DATA).
import { readFileSync } from 'node:fs'
import { SMS_VERIFICATION_DISCLOSURE } from '@handyhub/domain/legal'
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { describe, expect, it } from 'vitest'
import { copyProblems } from '../src/site/claims.js'
import { parseReceipt, withAccountDeclined, type ReceiptRecord } from '../src/request/receipt.js'
import {
  api,
  minutesLeft,
  noticeText,
  offerAccount,
  parseStatus,
  problemNotice,
  type ContactStatus,
  type Fetch,
} from '../src/request/verification.js'

const { t } = customerTranslator()
const catalog = JSON.parse(
  readFileSync(new URL('../../../packages/i18n/src/catalogs/customer.en.json', import.meta.url), 'utf8'),
) as Record<string, string>
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const CAP = ['Synthetic', 'receipt', 'capability', '0123456789abcd'].join('_')
const status = (email = 'unverified', phone = 'unverified'): ContactStatus => ({
  email: { destination: 'c***@example.test', state: email as 'unverified', available: true, change: null },
  phone: { destination: '***0143', state: phone as 'unverified', available: false, change: null },
  smsCodeConsent: 'offered',
})
const record = (over: Record<string, unknown> = {}) => ({
  v: 1,
  reference: 'HH-7K3QABCD',
  submittedAt: '2026-10-21T12:00:00.000Z',
  glance: [],
  photos: null,
  facts: { visitHours: null, responseMinutes: null },
  ...over,
})

/** A fetch that records each call and answers with the given status, body and headers. */
function fakeFetch(answer: { status: number; body?: unknown; headers?: Record<string, string> }) {
  const calls: { url: string; init: RequestInit }[] = []
  const f: Fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(answer.status === 204 ? null : JSON.stringify(answer.body ?? {}), {
      status: answer.status,
      headers: { 'content-type': 'application/json', ...(answer.headers ?? {}) },
    })
  }
  return { f, calls }
}

describe('the server’s answers in the customer’s words (TSK-0033, HH-INT-13, T18)', () => {
  it('[HH-INT-13][T18] every code failure reads the same; limits, NOT CONFIGURED and a missing capability are explained', () => {
    const field = (code: string) => ({
      error: { code: 'VALIDATION_FAILED', fieldErrors: [{ field: 'body.code', code }] },
    })
    expect(problemNotice(400, field('invalid_code'), null)).toEqual({ key: 'request.verify.error.invalidCode' })
    expect(problemNotice(400, field('already_verified'), null).key).toBe('request.verify.error.alreadyVerified')
    expect(problemNotice(400, field('sms_not_permitted'), null).key).toBe('request.verify.phoneNoTexts')
    expect(problemNotice(400, field('invalid_destination'), null).key).toBe('request.verify.error.invalidEmail')
    expect(problemNotice(429, { error: { code: 'RATE_LIMITED' } }, '25')).toEqual({
      key: 'request.verify.error.wait',
      values: { seconds: 25 },
    })
    expect(problemNotice(429, { error: { code: 'RATE_LIMITED' } }, '3600').key).toBe('request.verify.error.tooMany')
    expect(problemNotice(503, { error: { code: 'NOT_CONFIGURED' } }, null).key).toBe(
      'request.verify.error.notConfigured',
    )
    expect(problemNotice(404, { error: { code: 'NOT_FOUND' } }, null).key).toBe('request.verify.unavailable')
    expect(problemNotice(500, null, null).key).toBe('request.verify.error.failed')
    expect(noticeText({ key: 'request.verify.error.wait', values: { seconds: 1 } })).toBe(
      'Please wait 1 second before asking for another code.',
    )
  })

  it('[HH-ID-06] the minutes left come from the server’s expiry, never from the page', () => {
    const now = Date.parse('2026-10-21T12:00:00Z')
    expect(minutesLeft('2026-10-21T12:10:00Z', now)).toBe(10)
    expect(minutesLeft('2026-10-21T12:00:10Z', now)).toBe(1)
    expect(minutesLeft('not a time', now)).toBe(1)
    expect(t('request.verify.expiresIn', { minutes: 10 })).toBe('It expires in 10 minutes.')
  })

  it('[HH-INT-13] a status is read defensively', () => {
    expect(parseStatus(status())).toEqual(status())
    expect(parseStatus({ email: status().email })).toBeNull()
    // TSK-0134: the receipt's consent to a verification code by text is part of every status.
    expect(parseStatus({ email: status().email, phone: status().phone })).toBeNull()
    expect(parseStatus({ ...status(), smsCodeConsent: 'granted' })).toBeNull()
    expect(parseStatus({ ...status(), smsCodeConsent: 'recorded' })?.smsCodeConsent).toBe('recorded')
    expect(parseStatus({ ...status(), phone: { ...status().phone, state: 'linked' } })).toBeNull()
    expect(parseStatus(null)).toBeNull()
  })
})

describe('the calls carry only the receipt capability (TSK-0033, RULE-SERVER-AUTHZ, HH-ID-03)', () => {
  it('[RULE-SERVER-AUTHZ] status, send, verify and decline send the capability header and no reference', async () => {
    const s = status()
    const { f, calls } = fakeFetch({ status: 200, body: s })
    expect(await api.status(f, CAP)).toEqual({ ok: true, data: s })
    const sent = fakeFetch({
      status: 202,
      body: { sent: { destination: 'n***@example.test', expiresAt: '2026-10-21T12:10:00Z', change: true }, contact: s },
    })
    expect(await api.send(sent.f, CAP, 'email', 'new@example.test')).toMatchObject({
      ok: true,
      data: { sentTo: 'n***@example.test', change: true },
    })
    const verified = fakeFetch({ status: 200, body: { verified: { channel: 'email', changed: false }, contact: s } })
    expect(await api.verify(verified.f, CAP, 'email', ' 123456 ')).toMatchObject({ ok: true, data: { changed: false } })
    const consent = fakeFetch({ status: 200, body: { recorded: true, contact: { ...s, smsCodeConsent: 'recorded' } } })
    expect(await api.smsConsent(consent.f, CAP)).toMatchObject({ ok: true, data: { smsCodeConsent: 'recorded' } })
    const declined = fakeFetch({ status: 204 })
    expect(await api.decline(declined.f, CAP)).toEqual({ ok: true, data: true })
    const all = [...calls, ...sent.calls, ...verified.calls, ...consent.calls, ...declined.calls]
    expect(all.map((c) => `${c.init.method} ${c.url}`)).toEqual([
      'GET /api/v1/public/request-receipt/contact',
      'POST /api/v1/public/request-receipt/contact/codes',
      'POST /api/v1/public/request-receipt/contact/verify',
      'POST /api/v1/public/request-receipt/contact/sms-consent',
      'POST /api/v1/public/request-receipt/account-offer/decline',
    ])
    for (const c of all) {
      expect((c.init.headers as Record<string, string>)['receipt-capability']).toBe(CAP)
      expect(`${c.url} ${String(c.init.body ?? '')}`).not.toMatch(/HH-/)
    }
    expect(JSON.parse(String(sent.calls[0]?.init.body))).toEqual({ channel: 'email', destination: 'new@example.test' })
    expect(JSON.parse(String(verified.calls[0]?.init.body))).toEqual({ channel: 'email', code: '123456' })
    expect(JSON.parse(String(declined.calls[0]?.init.body))).toEqual({})
    // TSK-0134 [OWN-DEC-178]: agreeing sends the disclosure version the page showed, and nothing else.
    expect(JSON.parse(String(consent.calls[0]?.init.body))).toEqual({
      agreed: true,
      disclosureVersion: SMS_VERIFICATION_DISCLOSURE.documentId,
    })
  })

  it('[HH-INT-13] a refused or failed call becomes the customer’s notice', async () => {
    const wrong = fakeFetch({
      status: 400,
      body: { error: { code: 'VALIDATION_FAILED', fieldErrors: [{ field: 'body.code', code: 'invalid_code' }] } },
    })
    expect(await api.verify(wrong.f, CAP, 'email', '000000')).toEqual({
      ok: false,
      notice: { key: 'request.verify.error.invalidCode' },
    })
    const offline: Fetch = async () => {
      throw new TypeError('network')
    }
    expect(await api.status(offline, CAP)).toEqual({ ok: false, notice: { key: 'request.verify.error.failed' } })
  })
})

describe('the optional account offer (TSK-0033, HH-INT-14, OWN-DEC-94)', () => {
  it('[HH-INT-14] it comes only after a verified contact, and not again once declined', () => {
    expect(offerAccount(null, false)).toBe(false)
    expect(offerAccount(status(), false)).toBe(false)
    expect(offerAccount(status('pending'), false)).toBe(false)
    expect(offerAccount(status('verified'), false)).toBe(true)
    expect(offerAccount(status('unverified', 'verified'), false)).toBe(true)
    expect(offerAccount(status('verified'), true)).toBe(false)
  })

  it('[HH-INT-14][OWN-DEC-94][HH-ID-10] the action is the owner’s "Create an Account"; it is optional and needs a one-time code (TSK-0036)', () => {
    expect(t('request.continue.account')).toBe('Create an Account')
    expect(readFileSync(new URL('../../../kg/decisions/OWN-DEC-94.md', import.meta.url), 'utf8')).toContain(
      'Create an Account',
    )
    expect(t('request.account.optional')).toMatch(/optional/)
    expect(t('account.enroll.choose')).toMatch(/one-time code/)
    expect(t('account.enroll.choose')).toMatch(/only after you enter it/)
  })
})

describe('the receipt keeps its capability in this tab only (TSK-0033)', () => {
  it('[HH-INT-13] a record with or without a capability is read; a malformed one is no receipt', () => {
    expect(parseReceipt(record())).not.toBeNull()
    expect(parseReceipt(record({ capability: null }))).not.toBeNull()
    expect((parseReceipt(record({ capability: CAP, accountOffer: 'declined' })) as ReceiptRecord).capability).toBe(CAP)
    expect(parseReceipt(record({ capability: 'short' }))).toBeNull()
    expect(parseReceipt(record({ accountOffer: 'accepted' }))).toBeNull()
  })

  it('[HH-INT-14][T13] declining keeps the photo counts the tab wrote back since, and only this request’s record', () => {
    const shown = record({ capability: CAP }) as unknown as ReceiptRecord
    const counts = { received: 2, processing: 0, failed: 0 }
    const stored = { ...shown, photos: counts, photosCheckedAt: '2026-01-02T03:04:05.000Z' }
    expect(withAccountDeclined(stored, shown)).toEqual({ ...stored, accountOffer: 'declined' })
    expect(withAccountDeclined(null, shown)).toEqual({ ...shown, accountOffer: 'declined' })
    const other = { ...stored, reference: 'HH-OTHER-0000' }
    expect(withAccountDeclined(other, shown)).toEqual({ ...shown, accountOffer: 'declined' })
  })
})

describe('the verification wording (TSK-0033, HH-ID-03, HH-BASE-04, RULE-NO-INVENTED-FACTS)', () => {
  const keys = Object.keys(catalog).filter((k) => k.startsWith('request.verify.') || k.startsWith('request.account.'))
  it('[HH-ID-03][T16] nothing tells a guest an account, a customer or earlier records exist', () => {
    expect(keys.length).toBeGreaterThan(30)
    for (const key of keys)
      expect(t(key as CustomerKey, { destination: 'c***@example.test', minutes: 10, seconds: 5 })).not.toMatch(
        /already have|existing|earlier|previous|we found|on file|welcome back/i,
      )
  })

  it('[HH-BASE-04] every sentence passes the copy lint and states no time, price or booking of its own', () => {
    for (const key of keys) {
      const text = t(key as CustomerKey, { destination: 'c***@example.test', minutes: 10, seconds: 5 })
      expect(copyProblems(text)).toEqual([])
      expect(text).not.toMatch(/\$|book|guarantee|24\/7/i)
    }
    // The only number is the code's own lifetime, filled in from the server's expiry.
    expect(catalog['request.verify.expiresIn']).toContain('{minutes')
  })

  it('[HH-INT-13][OWN-DEC-96] the receipt offers the owner’s Resend and Change Contact', () => {
    expect(t('request.verify.resend')).toBe('Resend')
    expect(t('request.verify.change')).toBe('Change Contact')
    const owner = readFileSync(new URL('../../../kg/decisions/OWN-DEC-96.md', import.meta.url), 'utf8')
    expect(owner).toContain('Resend, and Change Contact')
  })
})
