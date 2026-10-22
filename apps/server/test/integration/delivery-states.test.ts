// Delivery states, retries, send-time rechecks and STOP/HELP/START against PostgreSQL 16 and the provider fakes
// (TSK-0048; HH-COM-02, HH-COM-05, HH-COM-12, HH-INT-22, OWN-DEC-147, T65, T66, T67, T76). Synthetic destinations only.
import { withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createDraft,
  currentConsent,
  deliveryStatusAutomation,
  keywordOf,
  nextState,
  notificationAutomation,
  recordConsent,
  releaseAutomation,
  releaseDraft,
  releaseTemplateVersion,
  type RecordChecks,
  type Recipient,
} from '../../src/modules/notifications/index.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { loadConfig } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { outbox } from '../../src/platform/outbox.js'
import { runWithContext } from '../../src/platform/request-context.js'
import { createProviders } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import type { SmsSender } from '../../src/providers/types.js'
import { recordWebhookReceipt } from '../../src/providers/webhooks.js'

let t: TestDatabase
let n = 0
const rid = () => `req-delivery-${++n}`
const office = { kind: 'staff' as const, id: 'staff-synthetic-office', roles: ['office'] }

beforeAll(async () => {
  t = await createTestDatabase()
  // Synthetic template versions for the drafts these tests release (the real wording is the owner's, T74).
  await withTx(t.db, async (tx) => {
    // TSK-0121: the appointment reminder is automatic now; the unpaid-invoice reminder stays a staff-released draft.
    for (const messageKey of ['review.request', 'reminder.unpaid_invoice'])
      for (const channel of ['email', 'sms'] as const)
        await releaseTemplateVersion(tx, {
          messageKey,
          channel,
          locale: 'en',
          subject: channel === 'email' ? 'Synthetic test subject' : null,
          body: 'Synthetic test body {projectLink}',
          translationReview: 'source',
          sourceIds: ['TSK-0048'],
          releasedBy: 'staff-synthetic-owner',
        })
  })
})
afterAll(async () => {
  await t?.drop()
})

const fakes = () => {
  const p = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
  if (!p.fakes.email || !p.fakes.sms || !p.email || !p.sms) throw new Error('ci uses the fakes')
  // TSK-0122: texts are judged at a fixed noon in Louisville (inside every permitted window), never at the time the
  // suite runs; the hours themselves are tested in delivery-hours.test.ts.
  return {
    providers: { email: p.email, sms: p.sms, clock: () => new Date('2026-10-20T16:00:00Z') },
    email: p.fakes.email,
    sms: p.fakes.sms,
  }
}
const optIn = (
  phone: string,
  purpose: 'transactional_sms' | 'marketing' = 'transactional_sms',
  channel: 'sms' | 'email' = 'sms',
) =>
  withTx(t.db, (tx) =>
    recordConsent(tx, {
      purpose,
      channel,
      destination: phone,
      granted: true,
      source: 'request_form',
      disclosureVersion: 'synthetic-disclosure-1',
      recordedBy: 'customer:contact-synthetic',
    }),
  )
const person = (destinations: Recipient['destinations']): Recipient => ({
  kind: 'customer_contact',
  id: 'contact-synthetic',
  destinations,
})
const delivery = (subject: string) =>
  t.db.selectFrom('platform.message_deliveries').selectAll().where('subject_key', '=', subject).orderBy('seq').execute()
/** Stores a verified provider event, as the webhook route does after the signature check. */
const receive = (provider: 'bird' | 'resend', deliveryId: string, payload: Record<string, unknown>, at?: string) =>
  runWithContext({ requestId: rid() }, () =>
    withTx(t.db, (tx) =>
      recordWebhookReceipt(tx, {
        provider,
        deliveryId,
        eventType: String(payload['type']),
        providerMessageId:
          provider === 'bird'
            ? ((payload['data'] as { sms_id?: string })?.sms_id ?? null)
            : ((payload['data'] as { email_id?: string })?.email_id ?? null),
        eventOccurredAt: at ? new Date(at) : null,
        payload,
        rawBody: Buffer.from(JSON.stringify(payload)),
      }),
    ),
  )
const statusWorker = () => createWorker({ db: t.db, registry: createAutomationRegistry([deliveryStatusAutomation()]) })
const drain = async (automations: Automation[]) => {
  const w = createWorker({ db: t.db, registry: createAutomationRegistry(automations) })
  for (let i = 0; i < 10; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) return
    await new Promise((res) => setTimeout(res, 5))
  }
}
const fastRetry = (a: Automation): Automation => ({ ...a, retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 } })

/** Sends one automatic question notice to an e-mail and a number, returning the subject. */
async function sendNotice(f: ReturnType<typeof fakes>, email: string, phone: string): Promise<string> {
  const id = `q-${++n}`
  const automation = notificationAutomation({
    messageKey: 'question.notice',
    providers: f.providers,
    resolve: async () => ({
      subjectKey: `question:${id}`,
      record: { type: 'question', id },
      recipients: [
        person([
          { channel: 'email', destination: email, permission: 'preferred' },
          { channel: 'sms', destination: phone, permission: 'permitted' },
        ]),
      ],
      // TSK-0119: the owner-style question notice greets the first name and names the request reference.
      values: { customerName: 'Sam', reference: 'HH-0000TEST', projectLink: 'https://handyhub247.example/p/synthetic' },
    }),
  })
  await withTx(t.db, (tx) =>
    outbox.add(tx, {
      type: 'question.published',
      aggregate: { type: 'question', id },
      idempotencyKey: `qp:${id}`,
      requestId: rid(),
    }),
  )
  await drain([automation])
  return `question:${id}`
}

describe('truthful delivery states from provider webhooks (TSK-0048, HH-COM-02)', () => {
  it('moves forward on sent and delivered, ignores older and duplicate events, and never shows "read"', async () => {
    const f = fakes()
    await optIn('+15025550111')
    const subject = await sendNotice(f, 'states-1@example.test', '+15025550111')
    const rows = await delivery(subject)
    expect(rows.map((r) => [r.channel, r.state])).toEqual([
      ['email', 'queued'],
      ['sms', 'queued'],
    ])
    const [email, sms] = rows
    await receive(
      'bird',
      'evt-1',
      { type: 'sms.sent', data: { sms_id: sms?.provider_message_id } },
      '2026-10-20T12:00:01Z',
    )
    await receive(
      'bird',
      'evt-2',
      { type: 'sms.delivered', data: { sms_id: sms?.provider_message_id } },
      '2026-10-20T12:00:05Z',
    )
    await receive(
      'bird',
      'evt-3',
      { type: 'sms.accepted', data: { sms_id: sms?.provider_message_id } },
      '2026-10-20T12:00:00Z',
    )
    await receive(
      'resend',
      'evt-4',
      { type: 'email.sent', data: { email_id: email?.provider_message_id } },
      '2026-10-20T12:00:02Z',
    )
    await receive(
      'resend',
      'evt-5',
      { type: 'email.opened', data: { email_id: email?.provider_message_id } },
      '2026-10-20T12:00:09Z',
    )
    // A retried delivery of the same event (same webhook-id) is stored once and has no second effect.
    await receive(
      'bird',
      'evt-2',
      { type: 'sms.delivered', data: { sms_id: sms?.provider_message_id } },
      '2026-10-20T12:00:05Z',
    )
    await statusWorker().runOnce()
    const after = await delivery(subject)
    expect(after.map((r) => [r.channel, r.state])).toEqual([
      ['email', 'sent'],
      ['sms', 'delivered'],
    ])
    const history = await t.db
      .selectFrom('platform.message_delivery_events')
      .select(['provider_type', 'from_state', 'to_state'])
      .where('delivery_id', '=', sms?.id ?? '')
      .orderBy('id')
      .execute()
    // Jobs may run in any order: whichever came first, the history ends at delivered and never steps back.
    expect(history.at(-1)).toMatchObject({ to_state: 'delivered' })
    expect(history.map((h) => h.to_state)).not.toContain('queued')
    expect(history.filter((h) => h.from_state === 'delivered')).toEqual([])
    const receipts = await t.db
      .selectFrom('platform.webhook_receipts')
      .select(['delivery_id', 'state'])
      .orderBy('seq')
      .execute()
    const stateOf = (id: string) => receipts.find((r) => r.delivery_id === id)?.state
    expect(receipts).toHaveLength(5)
    expect([stateOf('evt-2'), stateOf('evt-4')]).toEqual(['processed', 'processed'])
    // The older sent and accepted events apply or are ignored depending on arrival; neither moves the state back.
    expect(['processed', 'ignored']).toContain(stateOf('evt-1'))
    expect(stateOf('evt-3')).toBe('ignored')
    // Opens are not delivery states and are left for other consumers; "read" is never recorded.
    expect(stateOf('evt-5')).toBe('received')
  })

  it('shows a provider failure as failed with its reason, never as sent', async () => {
    const f = fakes()
    await optIn('+15025550112')
    const subject = await sendNotice(f, 'states-2@example.test', '+15025550112')
    const [email, sms] = await delivery(subject)
    await receive(
      'resend',
      'evt-6',
      { type: 'email.bounced', data: { email_id: email?.provider_message_id } },
      '2026-10-20T12:00:03Z',
    )
    await receive(
      'bird',
      'evt-7',
      { type: 'sms.failed', data: { sms_id: sms?.provider_message_id } },
      '2026-10-20T12:00:03Z',
    )
    await receive(
      'bird',
      'evt-8',
      { type: 'sms.sent', data: { sms_id: sms?.provider_message_id } },
      '2026-10-20T12:00:01Z',
    )
    await receive('bird', 'evt-9', { type: 'sms.delivered', data: { sms_id: 'sms_unknown' } }, '2026-10-20T12:00:01Z')
    await statusWorker().runOnce()
    expect((await delivery(subject)).map((r) => [r.state, r.error_code])).toEqual([
      ['failed', 'provider_email.bounced'],
      ['failed', 'provider_sms.failed'],
    ])
  })

  it('the state rules: delivered is final, older events and backwards steps never apply', () => {
    const t1 = new Date('2026-10-20T12:00:00Z')
    const t2 = new Date('2026-10-20T12:00:05Z')
    expect(nextState('queued', null, 'sent', t1)).toBe('sent')
    expect(nextState('sent', t2, 'queued', t1)).toBeNull()
    expect(nextState('delivered', t1, 'failed', t2)).toBeNull()
    expect(nextState('failed', t1, 'delivered', t2)).toBe('delivered')
    expect(nextState('sent', t2, 'failed', t1)).toBeNull()
    expect(nextState('suppressed', null, 'delivered', t1)).toBeNull()
    expect(nextState('draft', null, 'sent', t1)).toBeNull()
  })
})

describe('retries never double-send (TSK-0048, HH-COM-02, T66)', () => {
  it('a timeout whose send did reach the provider is retried under the same key and delivered once', async () => {
    const f = fakes()
    let calls = 0
    // The first call reaches the provider but the answer is lost (a timeout).
    const flaky: SmsSender = {
      provider: 'fake',
      async send(m) {
        calls++
        const r = await f.providers.sms.send(m)
        return calls === 1 ? { outcome: 'outcome_unknown', errorCode: 'timeout' } : r
      },
    }
    await optIn('+15025550113')
    const id = `q-retry-${++n}`
    const automation = fastRetry(
      notificationAutomation({
        messageKey: 'question.notice',
        providers: { email: f.providers.email, sms: flaky, clock: f.providers.clock },
        resolve: async () => ({
          subjectKey: `question:${id}`,
          record: { type: 'question', id },
          recipients: [person([{ channel: 'sms', destination: '+15025550113', permission: 'permitted' }])],
          values: { projectLink: 'https://handyhub247.example/p/synthetic' },
        }),
      }),
    )
    await withTx(t.db, (tx) =>
      outbox.add(tx, {
        type: 'question.published',
        aggregate: { type: 'question', id },
        idempotencyKey: `qp:${id}`,
        requestId: rid(),
      }),
    )
    await drain([automation])
    expect(calls).toBe(2)
    expect(f.sms.sent).toHaveLength(1)
    const [row] = await delivery(`question:${id}`)
    expect(row?.state).toBe('queued')
    expect(row?.provider_message_id).toBe(f.sms.sent[0]?.providerMessageId)
  })
})

/** Drafts one staff-released reminder and releases it; returns its subject. */
async function releaseReminder(input: {
  messageKey: string
  channel: 'sms' | 'email'
  destination: string
  record: { type: string; id: string }
  release: Automation
}): Promise<string> {
  const subject = `${input.record.type}:${input.record.id}:${input.messageKey}`
  const config = await loadConfig(t.db)
  const { id } = await withTx(t.db, (tx) =>
    createDraft(tx, {
      config,
      messageKey: input.messageKey,
      destination: { channel: input.channel, destination: input.destination, permission: 'preferred' },
      recipient: person([]),
      subjectKey: subject,
      record: input.record,
      values: { projectLink: 'https://handyhub247.example/p/synthetic' },
    }),
  )
  await withTx(t.db, (tx) =>
    releaseDraft(tx, {
      config,
      deliveryId: id,
      actor: office,
      automation: input.release,
      requestId: rid(),
      now: new Date('2026-10-01T15:00:00Z'),
    }),
  )
  return subject
}

describe('send-time rechecks of consent and record state (TSK-0048, HH-COM-05, T65, T67)', () => {
  it('a text needs the SMS opt-in: having a number is never consent (HH-INT-22, T76)', async () => {
    const f = fakes()
    const release = releaseAutomation(f.providers)
    const subject = await releaseReminder({
      messageKey: 'reminder.unpaid_invoice',
      channel: 'sms',
      destination: '+15025550120',
      record: { type: 'invoice', id: 'inv-no-opt-in' },
      release,
    })
    await drain([release])
    expect(f.sms.sent).toHaveLength(0)
    expect((await delivery(subject)).map((r) => [r.state, r.error_code])).toEqual([['suppressed', 'sms_no_opt_in']])
  })

  it('a STOP received after the release suppresses the queued text (T76)', async () => {
    const f = fakes()
    await optIn('+15025550121')
    const release = releaseAutomation(f.providers)
    const subject = await releaseReminder({
      messageKey: 'reminder.unpaid_invoice',
      channel: 'sms',
      destination: '+15025550121',
      record: { type: 'invoice', id: 'inv-stop' },
      release,
    })
    await receive('bird', 'evt-stop-1', {
      type: 'sms.received',
      data: { sms_id: 'sms_in_1', from: '+15025550121', to: '+15025550199', text: ' stop ' },
    })
    await statusWorker().runOnce()
    expect(await currentConsent(t.db, 'sms', '+15025550121', 'transactional_sms')).toBe('withdrawn')
    await drain([release])
    expect(f.sms.sent).toHaveLength(0)
    expect((await delivery(subject)).map((r) => [r.state, r.error_code])).toEqual([['suppressed', 'sms_opted_out']])
  })

  it('a cancelled or changed record drops its reminder at send time (T65)', async () => {
    const f = fakes()
    await optIn('+15025550122')
    const checks: RecordChecks = { invoice: async () => 'stale' }
    const release = releaseAutomation(f.providers, { recordChecks: checks })
    const subject = await releaseReminder({
      messageKey: 'reminder.unpaid_invoice',
      channel: 'sms',
      destination: '+15025550122',
      record: { type: 'invoice', id: 'inv-paid' },
      release,
    })
    await drain([release])
    expect(f.sms.sent).toHaveLength(0)
    expect((await delivery(subject)).map((r) => [r.state, r.error_code])).toEqual([['cancelled', 'record_changed']])
  })

  it('an active case holds a review request as a draft; a marketing opt-out blocks the queued one (T67)', async () => {
    const f = fakes()
    const checks: RecordChecks = {
      project: async (_tx, { recordId }) => (recordId === 'p-open-case' ? { hold: 'active_case' } : 'current'),
    }
    const release = releaseAutomation(f.providers, { recordChecks: checks })
    await optIn('held@example.test', 'marketing', 'email')
    const held = await releaseReminder({
      messageKey: 'review.request',
      channel: 'email',
      destination: 'held@example.test',
      record: { type: 'project', id: 'p-open-case' },
      release,
    })
    await optIn('optout@example.test', 'marketing', 'email')
    const optedOut = await releaseReminder({
      messageKey: 'review.request',
      channel: 'email',
      destination: 'optout@example.test',
      record: { type: 'project', id: 'p-ok' },
      release,
    })
    await withTx(t.db, (tx) =>
      recordConsent(tx, {
        purpose: 'marketing',
        channel: 'email',
        destination: 'optout@example.test',
        granted: false,
        source: 'portal',
        recordedBy: 'customer:contact-synthetic',
      }),
    )
    const noMarketing = await releaseReminder({
      messageKey: 'review.request',
      channel: 'email',
      destination: 'never@example.test',
      record: { type: 'project', id: 'p-ok-2' },
      release,
    })
    await drain([release])
    expect(f.email.sent).toHaveLength(0)
    expect((await delivery(held)).map((r) => [r.state, r.error_code, r.released_by])).toEqual([
      ['draft', 'held_active_case', null],
    ])
    expect((await delivery(optedOut)).map((r) => [r.state, r.error_code])).toEqual([
      ['suppressed', 'no_marketing_consent'],
    ])
    expect((await delivery(noMarketing)).map((r) => [r.state, r.error_code])).toEqual([
      ['suppressed', 'no_marketing_consent'],
    ])
  })

  it('a current record with consent sends once', async () => {
    const f = fakes()
    await optIn('+15025550123')
    const release = releaseAutomation(f.providers, { recordChecks: { invoice: async () => 'current' } })
    const subject = await releaseReminder({
      messageKey: 'reminder.unpaid_invoice',
      channel: 'sms',
      destination: '+15025550123',
      record: { type: 'invoice', id: 'inv-ok' },
      release,
    })
    await drain([release])
    expect(f.sms.sent).toHaveLength(1)
    expect((await delivery(subject)).map((r) => r.state)).toEqual(['queued'])
  })
})

describe('STOP, HELP and START update consent immediately (TSK-0048, HH-COM-12, OWN-DEC-147, T76)', () => {
  const inbound = (id: string, from: string, text: string) =>
    receive('bird', id, { type: 'sms.received', data: { sms_id: `sms_${id}`, from, to: '+15025550199', text } })
  const states = (phone: string) =>
    t.db
      .selectFrom('platform.consent_records')
      .select(['purpose', 'granted', 'source'])
      .where('destination', '=', phone)
      .orderBy('seq')
      .execute()

  it('STOP withdraws the opt-in and marketing texts, HELP changes nothing, START records a new opt-in only', async () => {
    const phone = '+15025550130'
    await optIn(phone)
    await optIn(phone, 'marketing')
    await inbound('kw-1', phone, 'STOP')
    await statusWorker().runOnce()
    expect(await currentConsent(t.db, 'sms', phone, 'transactional_sms')).toBe('withdrawn')
    expect(await currentConsent(t.db, 'sms', phone, 'marketing')).toBe('withdrawn')
    await inbound('kw-2', phone, 'Help')
    await statusWorker().runOnce()
    expect(await currentConsent(t.db, 'sms', phone, 'transactional_sms')).toBe('withdrawn')
    await inbound('kw-3', phone, 'START')
    await statusWorker().runOnce()
    expect(await currentConsent(t.db, 'sms', phone, 'transactional_sms')).toBe('granted')
    expect(await currentConsent(t.db, 'sms', phone, 'marketing')).toBe('withdrawn')
    expect(await states(phone)).toEqual([
      { purpose: 'transactional_sms', granted: true, source: 'request_form' },
      { purpose: 'marketing', granted: true, source: 'request_form' },
      { purpose: 'transactional_sms', granted: false, source: 'sms_keyword' },
      { purpose: 'marketing', granted: false, source: 'sms_keyword' },
      { purpose: 'transactional_sms', granted: true, source: 'sms_keyword' },
    ])
    const ids = (
      await t.db
        .selectFrom('platform.webhook_receipts')
        .select('id')
        .where('delivery_id', 'in', ['kw-1', 'kw-2', 'kw-3'])
        .execute()
    ).map((r) => r.id)
    const audits = await t.db
      .selectFrom('platform.audit_events')
      .select('action')
      .where('target_id', 'in', ids)
      .where('action', 'like', 'sms.keyword_%')
      .orderBy('seq')
      .execute()
    expect(audits.map((a) => a.action)).toEqual(['sms.keyword_stop', 'sms.keyword_help', 'sms.keyword_start'])
  })

  it('an ordinary reply is left for the inbox and changes no consent', async () => {
    const phone = '+15025550131'
    await optIn(phone)
    await inbound('kw-4', phone, 'Please stop by at 3pm')
    await statusWorker().runOnce()
    expect(await currentConsent(t.db, 'sms', phone, 'transactional_sms')).toBe('granted')
    const r = await t.db
      .selectFrom('platform.webhook_receipts')
      .select('state')
      .where('delivery_id', '=', 'kw-4')
      .executeTakeFirstOrThrow()
    expect(r.state).toBe('received')
  })

  it("Bird's suppression event (STOP or carrier opt-out) records the withdrawal once", async () => {
    const phone = '+15025550132'
    await optIn(phone)
    await receive('bird', 'sup-1', {
      type: 'sms_suppression.created',
      data: { suppression_id: 'ssu_1', destination: phone, originator: '+15025550199', reason: 'carrier_opted_out' },
    })
    await inbound('kw-5', phone, 'STOP')
    await statusWorker().runOnce()
    // Both report the same opt-out; whichever is processed first records it, and the second adds nothing.
    const withdrawals = (await states(phone)).filter((s) => !s.granted)
    expect(withdrawals).toHaveLength(1)
    expect(withdrawals[0]?.purpose).toBe('transactional_sms')
    expect(['provider_suppression', 'sms_keyword']).toContain(withdrawals[0]?.source)
  })

  it('recognises the keywords only as the whole message', () => {
    expect(['STOP', ' stop. ', 'Unsubscribe', 'START', 'unstop', 'HELP', 'info?'].map(keywordOf)).toEqual([
      'stop',
      'stop',
      'stop',
      'start',
      'start',
      'help',
      'help',
    ])
    expect(keywordOf('stop sending please')).toBeNull()
    expect(keywordOf('YES')).toBeNull()
  })

  it('the HELP reply wording is NOT CONFIGURED until the owner sets it (RULE-NO-INVENTED-FACTS)', async () => {
    expect((await loadConfig(t.db)).get('sms.help_reply')).toMatchObject({ state: 'NOT_CONFIGURED', version: 1 })
  })
})
