// Delivery hours against PostgreSQL 16 and the provider fakes (TSK-0122; HH-COM-15, HH-COM-05, HH-COM-09, T65,
// OWN-DEC-154, OWN-DEC-207, OWN-DEC-190, OWN-DEC-159, FACT-HOURS). Every destination is synthetic (RULE-SYNTHETIC-DATA)
// and nothing reaches a real provider. The send clock is injected (providers.clock), so no test depends on the time of
// day the suite runs; a held job is kept from running early by moving its run time into the future.
import { randomUUID } from 'node:crypto'
import { withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  notificationAutomation,
  recordConsent,
  releaseTemplateVersion,
  type Recipient,
} from '../../src/modules/notifications/index.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { loadConfig, recordPolicyVersion } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { outbox } from '../../src/platform/outbox.js'
import { createProviders } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import type { SmsSender } from '../../src/providers/types.js'

let t: TestDatabase
let n = 0
const rid = () => `req-hours-${++n}`
// 11 PM EDT on 21 October 2026, and the next 9 AM EDT (the unknown-zone fallback's opening, 13:00 UTC).
const ELEVEN_PM = new Date('2026-10-22T03:00:00Z')
const NINE_AM = new Date('2026-10-22T13:00:00Z')
let clock = ELEVEN_PM

beforeAll(async () => {
  t = await createTestDatabase()
})
afterAll(async () => {
  await t?.drop()
})

const fakes = () => {
  const p = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
  if (!p.fakes.email || !p.fakes.sms || !p.email || !p.sms) throw new Error('ci uses the fakes')
  return { providers: { email: p.email, sms: p.sms, clock: () => clock }, email: p.fakes.email, sms: p.fakes.sms }
}
const optIn = (phone: string, granted = true) =>
  withTx(t.db, (tx) =>
    recordConsent(tx, {
      purpose: 'transactional_sms',
      channel: 'sms',
      destination: phone,
      granted,
      source: granted ? 'request_form' : 'sms_keyword',
      ...(granted ? { disclosureVersion: 'synthetic-disclosure-1' } : {}),
      recordedBy: 'customer:contact-synthetic',
    }),
  )
/** A synthetic contact record, so a recipient zone can be recorded on it (TSK-0123). */
async function contact(zone: string | null): Promise<string> {
  const id = randomUUID()
  const customer = randomUUID()
  await sql`INSERT INTO crm.customers (id, display_name, provenance)
            VALUES (${customer}, 'Synthetic Hours Customer', 'staff_entry')`.execute(t.db)
  await sql`INSERT INTO crm.contacts (id, customer_id, full_name, email, phone_e164, preferred_channel, time_zone)
            VALUES (${id}, ${customer}, 'Synthetic Hours Contact', ${`hours-${id.slice(0, 8)}@example.test`},
                    '+15025550199', 'text', ${zone})`.execute(t.db)
  return id
}
const deliveries = (subject: string) =>
  t.db
    .selectFrom('platform.message_deliveries')
    .selectAll()
    .where('subject_key', '=', subject)
    .orderBy('channel')
    .execute()
const jobsOf = (automation: string, eventId: string) =>
  t.db
    .selectFrom('platform.jobs')
    .select(['job_key', 'run_at', 'state'])
    .where('automation', '=', automation)
    .where('outbox_event_id', '=', eventId)
    .orderBy('seq')
    .execute()
async function drain(automations: Automation[]) {
  const w = createWorker({ db: t.db, registry: createAutomationRegistry(automations) })
  for (let i = 0; i < 10; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) return
  }
}
const runOnce = (automations: Automation[]) =>
  createWorker({ db: t.db, registry: createAutomationRegistry(automations) }).runOnce()
/** The held job is kept from running before its time (these instants are in the past by the real clock). */
const holdJobs = () =>
  sql`UPDATE platform.jobs SET run_at = now() + interval '1 day' WHERE state = 'queued'`.execute(t.db)
const wakeJobs = () => sql`UPDATE platform.jobs SET run_at = now() WHERE state = 'queued'`.execute(t.db)
/** The held text's own job of the event runs again now (it already ran early here: its time is in the past). */
const rerunHeld = (eventId: string) =>
  sql`UPDATE platform.jobs SET state = 'queued', run_at = now(), attempts = 0, finished_at = NULL
      WHERE outbox_event_id = ${eventId} AND job_key LIKE '%:held:%'`.execute(t.db)
const event = async (type: string, id: string) => {
  await withTx(t.db, (tx) =>
    outbox.add(tx, { type, aggregate: { type: 'question', id }, idempotencyKey: `${type}:${id}`, requestId: rid() }),
  )
  const e = await t.db
    .selectFrom('platform.outbox_events')
    .select('id')
    .where('idempotency_key', '=', `${type}:${id}`)
    .executeTakeFirstOrThrow()
  return e.id
}

/** The automatic question notice (FACT-AUTOMATIC-MESSAGES #4) to an email and a number; `stale` ends it. */
function notice(f: ReturnType<typeof fakes>, recipient: Recipient, state: { stale: boolean }) {
  return notificationAutomation({
    messageKey: 'question.notice',
    providers: f.providers,
    resolve: async (ctx) =>
      state.stale
        ? 'stale'
        : {
            subjectKey: `question:${ctx.job.target.id}`,
            record: { type: 'question', id: ctx.job.target.id ?? '' },
            recipients: [recipient],
            values: { customerName: 'Sam', reference: 'HH-0000TEST', projectLink: 'https://handyhub247.example/p/x' },
          },
  })
}
const recipient = (email: string, phone: string, contactId = 'contact-synthetic'): Recipient => ({
  kind: 'customer_contact',
  id: contactId,
  destinations: [
    { channel: 'email', destination: email, permission: 'preferred' },
    { channel: 'sms', destination: phone, permission: 'permitted' },
  ],
})

describe('[HH-COM-15][OWN-DEC-154] email at once; a text waits for the recipient’s permitted local hours', () => {
  it('[T65][OWN-DEC-207] at 11 PM the email goes at once; the text waits for 9 AM Eastern (zone unknown) and then sends once', async () => {
    const f = fakes()
    await optIn('+15025550131')
    const state = { stale: false }
    const a = notice(f, recipient('hours-1@example.test', '+15025550131'), state)
    clock = ELEVEN_PM
    const eventId = await event('question.published', 'q-hours-1')
    await drain([a])
    expect(f.email.sent.map((m) => m.to)).toEqual(['hours-1@example.test'])
    expect(f.sms.sent).toEqual([])
    const [email, sms] = await deliveries('question:q-hours-1')
    expect(email?.provider_message_id).toBeTruthy()
    // The text: queued with its next allowed time and the window it waits for; never shown as sent.
    expect([sms?.state, sms?.error_code, sms?.text_window, sms?.scheduled_at, sms?.provider_message_id]).toEqual([
      'queued',
      'waiting_text_hours',
      'unknown_zone_fallback',
      NINE_AM,
      null,
    ])
    const held = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary'])
      .where('target_id', '=', sms?.id as string)
      .execute()
    // Audited as held each time it is found outside the hours (here also by its own job, which ran early).
    expect([...new Set(held.map((h) => h.action))]).toEqual(['notification.held'])
    // A job of its own, at 9 AM, for the same event (it resolves the records afresh then).
    expect((await jobsOf('notify.question.notice', eventId)).map((j) => [j.state, j.run_at])).toEqual([
      ['succeeded', expect.any(Date)],
      ['succeeded', expect.any(Date)],
    ])
    // At 8:59 AM it is still outside: held again. At 9:00 AM it goes, once; the email is not sent again.
    clock = new Date(NINE_AM.getTime() - 60_000)
    await rerunHeld(eventId)
    await drain([a])
    expect(f.sms.sent).toEqual([])
    clock = NINE_AM
    await rerunHeld(eventId)
    await drain([a])
    expect(f.sms.sent.map((m) => m.to)).toEqual(['+15025550131'])
    expect(f.email.sent).toHaveLength(1)
    const [, sent] = await deliveries('question:q-hours-1')
    expect([sent?.state, sent?.error_code, sent?.text_window]).toEqual(['queued', null, 'unknown_zone_fallback'])
    expect(sent?.provider_message_id).toBeTruthy()
  })

  it('[HH-COM-05] an opt-out between queueing and sending suppresses the held text', async () => {
    const f = fakes()
    await optIn('+15025550132')
    const a = notice(f, recipient('hours-2@example.test', '+15025550132'), { stale: false })
    clock = ELEVEN_PM
    await event('question.published', 'q-hours-2')
    await runOnce([a])
    await holdJobs()
    expect((await deliveries('question:q-hours-2'))[1]?.error_code).toBe('waiting_text_hours')
    // Overnight the customer texts STOP.
    await optIn('+15025550132', false)
    clock = NINE_AM
    await wakeJobs()
    await drain([a])
    expect(f.sms.sent).toEqual([])
    const [, sms] = await deliveries('question:q-hours-2')
    expect([sms?.state, sms?.error_code]).toEqual(['suppressed', 'sms_opted_out'])
  })

  it('[HH-COM-15][T65] an obsolete message waiting for the hours is cancelled, never sent', async () => {
    const f = fakes()
    await optIn('+15025550133')
    const state = { stale: false }
    const a = notice(f, recipient('hours-3@example.test', '+15025550133'), state)
    clock = ELEVEN_PM
    await event('question.published', 'q-hours-3')
    await runOnce([a])
    await holdJobs()
    // Overnight the question is answered (the resolver finds the record no longer calls for it).
    state.stale = true
    clock = NINE_AM
    await wakeJobs()
    await drain([a])
    expect(f.sms.sent).toEqual([])
    const [, sms] = await deliveries('question:q-hours-3')
    expect([sms?.state, sms?.error_code, sms?.cancelled_by]).toEqual(['cancelled', 'record_changed', 'system'])
  })

  it('[OWN-DEC-159][HH-COM-15] a recipient with a verified Central zone: 7:59 AM Central waits, 8:00 AM Central goes', async () => {
    const f = fakes()
    await optIn('+15025550134')
    const contactId = await contact('America/Chicago')
    const a = notice(f, recipient('hours-4@example.test', '+15025550134', contactId), { stale: false })
    // 7:59 AM CDT on 22 October 2026 is 12:59 UTC: 8:59 AM Eastern, but before 8 AM for this recipient.
    clock = new Date('2026-10-22T12:59:00Z')
    await event('question.published', 'q-hours-4')
    await runOnce([a])
    await holdJobs()
    const [, held] = await deliveries('question:q-hours-4')
    expect([held?.error_code, held?.text_window, held?.scheduled_at]).toEqual([
      'waiting_text_hours',
      'recipient_zone',
      new Date('2026-10-22T13:00:00Z'),
    ])
    clock = new Date('2026-10-22T13:00:00Z')
    await wakeJobs()
    await drain([a])
    expect(f.sms.sent.map((m) => m.to)).toEqual(['+15025550134'])
    // 9:59 PM CDT the same day is still inside for this recipient (and outside the unknown-zone fallback).
    clock = new Date('2026-10-23T02:59:00Z')
    await event('question.published', 'q-hours-4b')
    await drain([a])
    expect(f.sms.sent.map((m) => m.to)).toEqual(['+15025550134', '+15025550134'])
  })
})

describe('[OWN-DEC-207][HH-COM-15] what never waits', () => {
  it('a verification code requested at 11 PM is not queued: it goes at once', async () => {
    const f = fakes()
    await optIn('+15025550135')
    const code = notificationAutomation({
      messageKey: 'contact.verification_code',
      providers: f.providers,
      resolve: async (ctx) => ({
        subjectKey: `code:${ctx.job.target.id}`,
        record: { type: 'verification', id: ctx.job.target.id ?? '' },
        recipients: [
          {
            kind: 'customer_contact',
            id: 'contact-synthetic',
            destinations: [{ channel: 'sms', destination: '+15025550135', permission: 'preferred' }],
          },
        ],
        values: { verificationCode: '246810', codeLifetimeMinutes: '10' },
      }),
    })
    clock = ELEVEN_PM
    await event('contact.verification_code_requested', 'code-hours-1')
    await drain([code])
    expect(f.sms.sent.map((m) => m.to)).toEqual(['+15025550135'])
    const [row] = await deliveries('code:code-hours-1')
    expect([row?.state, row?.error_code, row?.text_window]).toEqual(['queued', null, 'not_held'])
  })
})

describe('[OWN-DEC-190][HH-COM-15] live texts stay off until A2P 10DLC', () => {
  it('a text that would reach a carrier is recorded as failed (sms_disabled), never sent; the switch is configuration', async () => {
    await withTx(t.db, (tx) =>
      releaseTemplateVersion(tx, {
        messageKey: 'contact.verification_code',
        channel: 'sms',
        locale: 'en',
        subject: null,
        body: 'Synthetic test code {verificationCode} ({codeLifetimeMinutes} min)',
        translationReview: 'source',
        sourceIds: ['TSK-0122'],
        releasedBy: 'staff-synthetic-owner',
      }),
    )
    expect((await loadConfig(t.db)).get('sms.live_delivery')).toMatchObject({
      state: 'CONFIGURED',
      value: { enabled: false },
    })
    const f = fakes()
    await optIn('+15025550136')
    const carrier: string[] = []
    // A stand-in for the real carrier adapter (provider "bird"): it must never be called while texts are off.
    const live: SmsSender = {
      provider: 'bird',
      async send(m) {
        carrier.push(m.to)
        return { outcome: 'accepted', providerMessageId: `synthetic-${randomUUID()}`, status: 'queued' }
      },
    }
    const code = (id: string) =>
      notificationAutomation({
        messageKey: 'contact.verification_code',
        providers: { email: f.providers.email, sms: live, clock: () => NINE_AM },
        resolve: async () => ({
          subjectKey: `code:${id}`,
          record: { type: 'verification', id },
          recipients: [
            {
              kind: 'customer_contact',
              id: 'contact-synthetic',
              destinations: [{ channel: 'sms', destination: '+15025550136', permission: 'preferred' }],
            },
          ],
          values: { verificationCode: '135790', codeLifetimeMinutes: '10' },
        }),
      })
    await event('contact.verification_code_requested', 'code-live-1')
    await drain([code('code-live-1')])
    expect(carrier).toEqual([])
    const [off] = await deliveries('code:code-live-1')
    expect([off?.state, off?.error_code]).toEqual(['failed', 'sms_disabled'])
    // Turned on (only once A2P 10DLC is complete: a new configuration version), the carrier is reached.
    await recordPolicyVersion(t.db, {
      key: 'sms.live_delivery',
      value: { enabled: true },
      sourceIds: ['TEST-SYNTHETIC'],
      changedBy: 'test',
      reason: 'synthetic test configuration',
    })
    try {
      await event('contact.verification_code_requested', 'code-live-2')
      await drain([code('code-live-2')])
      expect(carrier).toEqual(['+15025550136'])
    } finally {
      await recordPolicyVersion(t.db, {
        key: 'sms.live_delivery',
        value: { enabled: false },
        sourceIds: ['OWN-DEC-190'],
        changedBy: 'test',
        reason: 'synthetic test configuration restored',
      })
    }
  })
})
