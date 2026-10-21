// "Send Estimate Request" after a lost answer (TSK-0030; HH-INT-10, HH-INT-07, T11): the body kept for the tab, what a
// resumed send restores, and how every answer is read. Synthetic values only (RULE-SYNTHETIC-DATA).
import { describe, expect, it } from 'vitest'
import { DraftStore, draftKey, newSend, type DraftStorage } from '../src/request/draft.js'
import { EMPTY_VALUES, toBody, type FormMeta, type FormValues } from '../src/request/form.js'
import {
  keepsBody,
  resumedFrom,
  SendStore,
  sendKey,
  sendOutcome,
  type SendData,
  type SendOutcome,
  type SendReply,
} from '../src/request/send.js'

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

/** A blocked storage (private mode, a full quota): every call throws. */
const BLOCKED: DraftStorage = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
}

const values: FormValues = {
  ...EMPTY_VALUES,
  notSure: true,
  description: 'Synthetic project: a sticking closet door.',
  street: '100 Synthetic Way',
  city: 'Testville',
  state: 'KY',
  zip: '40000',
  propertyType: 'house',
  preferredDate: '2026-10-31',
  windows: ['mornings'],
  estimatePreference: 'let_handyhub_decide',
  fullName: 'Test Customer',
  email: 'send@example.test',
  phone: '(502) 555-0100',
  preferredChannel: 'call',
  smsOptIn: true,
  marketingOptIn: true,
}
const now = Date.UTC(2026, 9, 20, 16)
const meta: FormMeta = {
  formVersion: 'wizard-1',
  privacyNoticeVersion: 'privacy-notice-1',
  smsDisclosureVersion: 'sms-disclosure-1',
  startedAt: now,
}
const CAPABILITY = 'synthetic-photo-draft-capability-0001'

describe("the tab's kept send (TSK-0030, HH-INT-10)", () => {
  it('[HH-INT-10] keeps the exact body under its idempotency key in the tab storage, and removes it', () => {
    const tab = new MemoryStorage()
    const sends = new SendStore(tab)
    const key = newSend(now).idempotencyKey
    const body = JSON.stringify({ ...toBody(values, meta), photoDraft: CAPABILITY })
    sends.save(key, body)
    expect(tab.map.get(sendKey(key))).toBe(body)
    expect(sendKey(key)).toBe(`hh.request-send:${key}`)
    expect(sends.load(key)).toBe(body)
    expect(sends.load(newSend(now).idempotencyKey)).toBeNull()
    sends.clear(key)
    expect(sends.load(key)).toBeNull()
    expect(tab.map.size).toBe(0)
  })

  it('[HH-INT-10] a blocked or missing storage never breaks the send', () => {
    for (const storage of [BLOCKED, null]) {
      const sends = new SendStore(storage)
      expect(() => sends.save('synthetic-key-0001', '{}')).not.toThrow()
      expect(sends.load('synthetic-key-0001')).toBeNull()
      expect(() => sends.clear('synthetic-key-0001')).not.toThrow()
    }
  })

  it('[HH-INT-10][T11] a resumed draft with the kept consents and photo draft rebuilds the identical body', () => {
    // The 7-day draft never keeps the consents or the photo capability; the tab keeps the body that was sent.
    const browser = new MemoryStorage()
    const send = newSend(now)
    new DraftStore(browser, 'guest', 7).save(values, 'review', now, send)
    const sent = JSON.stringify({ ...toBody(values, meta), photoDraft: CAPABILITY })
    expect(browser.map.get(draftKey('guest'))).not.toMatch(/smsOptIn":true|marketingOptIn":true|photo-draft/)

    const draft = new DraftStore(browser, 'guest', 7).load(now + 60_000)
    expect(draft?.send).toEqual(send)
    expect(draft?.values.smsOptIn).toBe(false)
    const kept = resumedFrom(sent)
    expect(kept).toEqual({ smsOptIn: true, marketingOptIn: true, photoDraft: CAPABILITY })
    const restored = { ...(draft?.values as FormValues), smsOptIn: true, marketingOptIn: true }
    expect(JSON.stringify({ ...toBody(restored, meta), photoDraft: kept?.photoDraft })).toBe(sent)
    // Without them the body differs, which the server would answer as a conflict.
    expect(JSON.stringify({ ...toBody(draft?.values as FormValues, meta) })).not.toBe(sent)
  })

  it('[HH-INT-10] reads only a body the wizard wrote', () => {
    expect(resumedFrom(JSON.stringify(toBody({ ...values, smsOptIn: false }, meta)))).toEqual({
      smsOptIn: false,
      marketingOptIn: true,
      photoDraft: null,
    })
    for (const raw of ['', 'not json', 'null', '[]', '{"smsOptIn":true}', JSON.stringify({ formVersion: 1 })])
      expect(resumedFrom(raw)).toBeNull()
  })
})

describe('the answer to a send (TSK-0030, HH-INT-10, T11, T71)', () => {
  const reply = (status: number, data: SendData): SendReply => ({ status, data })
  const envelope = (code: string, extra: Record<string, unknown> = {}) => ({
    error: { code, message: `Synthetic ${code} message.`, fieldErrors: [], ...extra },
  })

  it('[T11][HH-INT-10] a receipt, or the request the key already created, with its reference', () => {
    const photos = { received: 1, processing: 0, failed: 0 }
    expect(sendOutcome(reply(201, { reference: 'HH-0000TEST', photos }))).toEqual({
      kind: 'sent',
      reference: 'HH-0000TEST',
      photos,
    })
    expect(sendOutcome(reply(201, { reference: 'HH-0000TEST' }))).toEqual({
      kind: 'sent',
      reference: 'HH-0000TEST',
      photos: null,
    })
    // A conflict on a key that already created a request names it: the customer is never sent to start again.
    expect(
      sendOutcome(reply(409, envelope('IDEMPOTENCY_CONFLICT', { existing: { reference: 'HH-0000TEST' } }))),
    ).toEqual({ kind: 'already', reference: 'HH-0000TEST' })
    expect(sendOutcome(reply(409, envelope('IDEMPOTENCY_CONFLICT')))).toEqual({ kind: 'conflict' })
  })

  it('[HH-INT-10][T71] an answer that did not arrive, or arrived cut short, is uncertain, never a failure', () => {
    expect(sendOutcome('network')).toEqual({ kind: 'uncertain' })
    expect(sendOutcome(reply(201, null))).toEqual({ kind: 'uncertain' })
    expect(sendOutcome(reply(502, null))).toEqual({ kind: 'uncertain' })
    expect(sendOutcome(reply(504, { reference: 7 }))).toEqual({ kind: 'uncertain' })
  })

  it("[HH-INT-09][HH-INT-10] the server's own refusals: field errors, or its message", () => {
    const fieldErrors = [{ field: 'body.contact.email', code: 'format' }]
    expect(sendOutcome(reply(400, envelope('VALIDATION_FAILED', { fieldErrors })))).toEqual({
      kind: 'fields',
      fieldErrors,
    })
    expect(sendOutcome(reply(400, envelope('VALIDATION_FAILED')))).toEqual({
      kind: 'refused',
      message: 'Synthetic VALIDATION_FAILED message.',
    })
    expect(sendOutcome(reply(429, envelope('RATE_LIMITED')))).toEqual({
      kind: 'refused',
      message: 'Synthetic RATE_LIMITED message.',
    })
    expect(sendOutcome(reply(500, envelope('INTERNAL')))).toEqual({
      kind: 'refused',
      message: 'Synthetic INTERNAL message.',
    })
    expect(sendOutcome(reply(404, null))).toEqual({ kind: 'refused', message: null })
  })

  it('[HH-INT-10] keeps the body only while the outcome is not known', () => {
    const outcomes: [SendOutcome, boolean][] = [
      [{ kind: 'uncertain' }, true],
      [{ kind: 'conflict' }, true],
      [{ kind: 'sent', reference: 'HH-0000TEST', photos: null }, false],
      [{ kind: 'already', reference: 'HH-0000TEST' }, false],
      [{ kind: 'fields', fieldErrors: [] }, false],
      [{ kind: 'refused', message: null }, false],
    ]
    for (const [outcome, kept] of outcomes) expect(keepsBody(outcome), outcome.kind).toBe(kept)
  })
})
