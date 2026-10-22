// Notification templates, the automatic-message list and deliveries against PostgreSQL 16 and the provider fakes
// (TSK-0047; HH-COM-03, HH-COM-04, HH-COM-06, T04, T12, T65, T66, T74). Nothing reaches a real provider.
import { readdirSync, readFileSync } from 'node:fs'
import { withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  automaticPolicy,
  createDraft,
  currentTemplate,
  DraftError,
  MESSAGE_TYPES,
  notificationAutomation,
  recordConsent,
  releaseAutomation,
  releaseDraft,
  releaseTemplateVersion,
  templateProblems,
  type Recipient,
} from '../../src/modules/notifications/index.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { loadConfig, recordPolicyVersion } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { outbox } from '../../src/platform/outbox.js'
import { createProviders } from '../../src/providers/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { bodyOf } from '../fixtures/message-text.js'

let t: TestDatabase
beforeAll(async () => {
  t = await createTestDatabase()
})
afterAll(async () => {
  await t?.drop()
})

const providers = () => {
  const p = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
  if (!p.fakes.email || !p.fakes.sms) throw new Error('ci uses the fakes')
  return { providers: { email: p.email, sms: p.sms }, email: p.fakes.email, sms: p.fakes.sms }
}
let n = 0
const rid = () => `req-notify-${++n}`
const customer = (email: string, phone?: string): Recipient => ({
  kind: 'customer_contact',
  id: 'contact-synthetic-1',
  destinations: [
    { channel: 'email', destination: email, permission: 'preferred' },
    ...(phone ? [{ channel: 'sms' as const, destination: phone, permission: 'permitted' as const }] : []),
  ],
})
const event = (type: string, id: string) =>
  withTx(t.db, (tx) =>
    outbox.add(tx, { type, aggregate: { type: 'question', id }, idempotencyKey: `${type}:${id}`, requestId: rid() }),
  )
const deliveries = (subject: string) =>
  t.db.selectFrom('platform.message_deliveries').selectAll().where('subject_key', '=', subject).orderBy('seq').execute()
const tick = () => new Promise((r) => setTimeout(r, 15))
const fastRetry = (a: Automation): Automation => ({ ...a, retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 } })

describe('the automatic-message list is configuration (TSK-0047, HH-COM-06, RULE-DECIDED-VALUES-ACTIVE)', () => {
  it('is seeded active from FACT-AUTOMATIC-MESSAGES with its twenty-one customer messages and no reminder (TSK-0119)', async () => {
    const config = await loadConfig(t.db)
    const entry = config.get('messages.automatic')
    expect(entry.state).toBe('CONFIGURED')
    if (entry.state !== 'CONFIGURED') return
    expect(entry.sourceIds).toContain('FACT-AUTOMATIC-MESSAGES')
    expect(entry.value.customer).toHaveLength(21)
    const policy = automaticPolicy(config)
    for (const k of ['staff.reply', 'reminder.unanswered_estimate', 'reminder.appointment', 'review.request'])
      expect(policy.isAutomatic(k), k).toBe(false)
    const fact = readFileSync(new URL('../../../../kg/facts/FACT-AUTOMATIC-MESSAGES.md', import.meta.url), 'utf8')
    expect(fact.match(/^\| \d+ \|/gm)).toHaveLength(entry.value.customer.length)
    const ids = new Set(
      readdirSync(new URL('../../../../kg/', import.meta.url), { recursive: true })
        .map(String)
        .filter((f) => f.endsWith('.md'))
        .map((f) => f.replace(/^.*\//, '').replace(/\.md$/, '')),
    )
    for (const type of MESSAGE_TYPES.values())
      for (const id of type.sourceIds) expect(ids.has(id), `${type.key} cites ${id}`).toBe(true)
  })

  it('seeds only owner-worded templates, English for customers, free of access secrets and amounts (T74)', async () => {
    const rows = await t.db.selectFrom('platform.message_template_versions').selectAll().execute()
    // TSK-0119: every message type with an owner template ID has its email wording; texts keep the earlier four.
    const worded = [...MESSAGE_TYPES.values()].filter((m) => m.templateId).map((m) => m.key)
    expect(new Set(rows.map((r) => r.message_key))).toEqual(new Set(worded))
    expect(new Set(rows.filter((r) => r.channel === 'sms').map((r) => r.message_key))).toEqual(
      new Set(['question.notice', 'estimate.ready', 'invoice.ready', 'contact.verification_code']),
    )
    for (const r of rows) {
      if (r.audience === 'customer') expect(r.locale).toBe('en')
      expect(
        templateProblems({
          messageKey: r.message_key,
          channel: r.channel as 'email' | 'sms',
          locale: r.locale as 'en' | 'es',
          subject: r.subject,
          body: r.body,
          translationReview: r.translation_review as 'source' | 'ai_reviewed',
        }),
      ).toEqual([])
      expect(r.body).not.toMatch(/\$\s?\d/)
    }
    expect(await currentTemplate(t.db, 'reminder.repeat_service', 'email', 'en')).toBeNull()
  })

  it('refuses edits to a released template version and a Spanish customer version', async () => {
    await expect(
      t.db
        .updateTable('platform.message_template_versions')
        .set({ body: 'edited' })
        .where('message_key', '=', 'question.notice')
        .execute(),
    ).rejects.toThrow(/APPEND_ONLY/)
    await expect(
      withTx(t.db, (tx) =>
        releaseTemplateVersion(tx, {
          messageKey: 'question.notice',
          channel: 'sms',
          locale: 'es',
          subject: null,
          body: 'x {projectLink}',
          translationReview: 'ai_reviewed',
          sourceIds: ['OWN-DEC-98'],
          releasedBy: 'test',
        }),
      ),
    ).rejects.toThrow(/English only/)
  })
})

describe('automatic messages: one automation plus one job per event (TSK-0047, HH-COM-06, HH-COM-04)', () => {
  it('sends the question notice once in English by both channels and records metadata without the text', async () => {
    const f = providers()
    const automation = notificationAutomation({
      messageKey: 'question.notice',
      providers: f.providers,
      resolve: async (ctx) => ({
        subjectKey: `question:${ctx.job.target.id}`,
        record: { type: 'question', id: ctx.job.target.id ?? '' },
        recipients: [customer('customer-1@example.test', '+15025550101')],
        values: {
          customerName: 'Sam',
          reference: 'HH-0000TEST',
          projectLink: 'https://handyhub247.example/p/synthetic',
        },
      }),
    })
    // TSK-0048: a text needs the customer's SMS opt-in (HH-INT-22); this customer gave it on the request form.
    await withTx(t.db, (tx) =>
      recordConsent(tx, {
        purpose: 'transactional_sms',
        channel: 'sms',
        destination: '+15025550101',
        granted: true,
        source: 'request_form',
        disclosureVersion: 'synthetic-disclosure-1',
        recordedBy: 'customer:contact-synthetic-1',
      }),
    )
    await event('question.published', 'q-1')
    await event('question.published', 'q-1')
    const worker = createWorker({ db: t.db, registry: createAutomationRegistry([automation]) })
    await worker.runOnce()
    await worker.runOnce()
    expect(f.email.sent).toHaveLength(1)
    expect(f.sms.sent).toHaveLength(1)
    // TSK-0119: the email is the owner-style question_notice wording (version 2); the text keeps OWN-DEC-98's.
    expect(f.email.sent[0]).toMatchObject({
      to: 'customer-1@example.test',
      subject: 'HandyHub | We Have a Question About Your Request #HH-0000TEST',
    })
    expect(bodyOf(f.email.sent[0]?.text)).toBe(
      [
        'Hi Sam,',
        'HandyHub has a question about your request #HH-0000TEST.',
        'You can view the question and reply securely through your project page:',
        'https://handyhub247.example/p/synthetic',
        'Your answer helps us move your request to the next step.',
        'The HandyHub Team',
      ].join('\n\n'),
    )
    expect(f.sms.sent[0]?.text).toBe(
      'HandyHub has a question about your request. View and reply securely. https://handyhub247.example/p/synthetic',
    )
    const rows = await deliveries('question:q-1')
    expect(
      rows.map((r) => [r.channel, r.state, r.locale, r.template_version, r.provider, r.release, r.audience]),
    ).toEqual([
      ['email', 'queued', 'en', 2, 'fake', 'automatic', 'customer'],
      ['sms', 'queued', 'en', 1, 'fake', 'automatic', 'customer'],
    ])
    expect(rows.every((r) => r.provider_message_id && r.outbox_event_id && r.queued_at)).toBe(true)
    expect(JSON.stringify(rows)).not.toContain('View and reply')
    expect(JSON.stringify(rows)).not.toContain('Sam')
  })

  it('sends nothing for a message taken off the list, and records no delivery', async () => {
    const f = providers()
    await recordPolicyVersion(t.db, {
      key: 'messages.automatic',
      value: {
        customer: ['question.notice'],
        staffAccount: ['staff.invitation'],
        staffNotifications: ['staff_notice.case_opened'],
      },
      sourceIds: ['FACT-AUTOMATIC-MESSAGES'],
      changedBy: 'test',
      reason: 'synthetic test of an unlisted message',
    })
    const automation = notificationAutomation({
      messageKey: 'estimate.ready',
      providers: f.providers,
      resolve: async () => ({
        subjectKey: 'estimate:e-1',
        record: { type: 'estimate', id: 'e-1' },
        recipients: [customer('customer-2@example.test')],
        values: { projectLink: 'https://x.example/p' },
      }),
    })
    await withTx(t.db, (tx) =>
      outbox.add(tx, {
        type: 'estimate.version_published',
        aggregate: { type: 'estimate', id: 'e-1' },
        idempotencyKey: 'evp:e-1',
        requestId: rid(),
      }),
    )
    expect(await createWorker({ db: t.db, registry: createAutomationRegistry([automation]) }).runOnce()).toMatchObject({
      cancelled: 1,
    })
    expect(f.email.calls).toEqual([])
    expect(await deliveries('estimate:e-1')).toEqual([])
    // Restore the seeded list as a newer version for the rest of the file.
    const seeded = (
      await t.db
        .selectFrom('platform.policy_version')
        .select('value')
        .where('key', '=', 'messages.automatic')
        .where('changed_by', '=', 'migration:0065')
        .executeTakeFirstOrThrow()
    ).value
    await recordPolicyVersion(t.db, {
      key: 'messages.automatic',
      value: seeded as never,
      sourceIds: ['FACT-AUTOMATIC-MESSAGES'],
      changedBy: 'test',
      reason: 'restore',
    })
  })

  it('keeps the event and shows a failed delivery when the provider rejects; a retry after an outage sends once (T12)', async () => {
    const f = providers()
    // TSK-0119: a message whose values its resolver supplies (the question notice); the invoice notice is not wired.
    const resolve = async () => ({
      subjectKey: 'invoice:i-1',
      record: { type: 'invoice', id: 'i-1' },
      recipients: [customer('customer-3@example.test')],
      values: { reference: 'HH-0000TEST', projectLink: 'https://x.example/p' },
    })
    f.email.script({ outcome: 'retryable_error', errorCode: 'http_503' })
    const automation = fastRetry(
      notificationAutomation({ messageKey: 'question.notice', providers: f.providers, resolve }),
    )
    await withTx(t.db, (tx) =>
      outbox.add(tx, {
        type: 'question.published',
        aggregate: { type: 'invoice', id: 'i-1' },
        idempotencyKey: 'ii:i-1',
        requestId: rid(),
      }),
    )
    const worker = createWorker({ db: t.db, registry: createAutomationRegistry([automation]) })
    expect(await worker.runOnce()).toMatchObject({ retried: 1 })
    await tick()
    expect(await worker.runOnce()).toMatchObject({ succeeded: 1 })
    expect(f.email.calls.map((c) => c.idempotencyKey)).toEqual([
      f.email.calls[0]?.idempotencyKey,
      f.email.calls[0]?.idempotencyKey,
    ])
    expect(f.email.sent).toHaveLength(1)

    f.email.script({ outcome: 'rejected', errorCode: 'http_422_validation_error' })
    const rejected = notificationAutomation({
      messageKey: 'estimate.ready',
      providers: f.providers,
      resolve: async () => ({
        ...(await resolve()),
        subjectKey: 'estimate:e-2',
        values: { estimateNumber: 'HH-0000TEST-E1', projectLink: 'https://x.example/p' },
      }),
    })
    await withTx(t.db, (tx) =>
      outbox.add(tx, {
        type: 'estimate.version_published',
        aggregate: { type: 'estimate', id: 'e-2' },
        idempotencyKey: 'evp:e-2',
        requestId: rid(),
      }),
    )
    await createWorker({ db: t.db, registry: createAutomationRegistry([rejected]) }).runOnce()
    expect((await deliveries('estimate:e-2')).map((r) => [r.state, r.error_code])).toEqual([
      ['failed', 'http_422_validation_error'],
    ])
    expect(
      await t.db.selectFrom('platform.outbox_events').select('id').where('idempotency_key', '=', 'evp:e-2').execute(),
    ).toHaveLength(1)
  })

  it('records NOT CONFIGURED templates and off-allowlist destinations instead of sending', async () => {
    const f = providers()
    const automation = notificationAutomation({
      messageKey: 'request.receipt',
      providers: f.providers,
      resolve: async () => ({
        subjectKey: 'request:r-1',
        record: { type: 'request', id: 'r-1' },
        recipients: [customer('customer-4@example.test')],
        values: {},
      }),
    })
    const access = notificationAutomation({
      messageKey: 'question.notice',
      providers: f.providers,
      resolve: async () => ({
        subjectKey: 'question:q-real',
        record: { type: 'question', id: 'q-real' },
        recipients: [customer('someone@gmail.com')],
        values: { reference: 'HH-0000TEST', projectLink: 'https://x.example/p' },
      }),
    })
    await withTx(t.db, (tx) =>
      outbox.add(tx, {
        type: 'request.submitted',
        aggregate: { type: 'request', id: 'r-1' },
        idempotencyKey: 'rs:r-1',
        requestId: rid(),
      }),
    )
    await event('question.published', 'q-real')
    await createWorker({ db: t.db, registry: createAutomationRegistry([automation, access]) }).runOnce()
    // TSK-0120: the owner's request_received wording is wired; a resolver that leaves its reference out fails with that
    // name (the first name has its "Hi there," fallback), never a send.
    expect((await deliveries('request:r-1')).map((r) => [r.state, r.error_code, r.missing_variables])).toEqual([
      ['failed', 'template_values_missing', ['reference']],
    ])
    expect((await deliveries('question:q-real')).map((r) => [r.state, r.error_code])).toEqual([
      ['suppressed', 'not_on_test_allowlist'],
    ])
    expect(f.email.calls).toEqual([])
  })
})

describe('staff-released drafts (TSK-0047, HH-COM-06, HH-COM-09, T65, T66, T04)', () => {
  const office = { kind: 'staff' as const, id: 'staff-test-office', roles: ['office'] }

  it('refuses to draft an automatic message and stores no credential in a draft', async () => {
    const config = await loadConfig(t.db)
    const base = {
      config,
      recipient: customer('customer-5@example.test'),
      destination: {
        channel: 'email' as const,
        destination: 'customer-5@example.test',
        permission: 'preferred' as const,
      },
      record: { type: 'request', id: 'r-5' },
    }
    await expect(
      withTx(t.db, (tx) =>
        createDraft(tx, { ...base, messageKey: 'request.receipt', subjectKey: 'request:r-5', values: {} }),
      ),
    ).rejects.toThrow(DraftError)
    await expect(
      withTx(t.db, (tx) =>
        createDraft(tx, { ...base, messageKey: 'staff.reply', subjectKey: 'reply:1', values: { accessCode: '1234' } }),
      ),
    ).rejects.toThrow(/does not declare/)
  })

  it('queues an 11 PM question reminder until 8 AM, sends the estimate reminder at once, in English for a Spanish-locale sender', async () => {
    const f = providers()
    await withTx(t.db, async (tx) => {
      for (const key of ['reminder.unanswered_question', 'reminder.unanswered_estimate'])
        await releaseTemplateVersion(tx, {
          messageKey: key,
          channel: 'email',
          locale: 'en',
          subject: 'Synthetic test subject',
          body: 'Synthetic test body {projectLink}',
          translationReview: 'source',
          sourceIds: ['FACT-REMINDER-CADENCES'],
          releasedBy: 'test',
        })
    })
    const config = await loadConfig(t.db)
    const release = fastRetry(releaseAutomation(f.providers))
    // 23:00 in America/Kentucky/Louisville: a future night for the question reminder (it must wait for 8 AM, so it
    // is not due yet), a past night for the estimate reminder (it is released at once, so it is due now).
    const futureElevenPm = new Date('2026-12-01T04:00:00Z')
    const pastElevenPm = new Date('2026-10-10T03:00:00Z')
    const draft = (messageKey: string, subjectKey: string) =>
      withTx(t.db, (tx) =>
        createDraft(tx, {
          config,
          messageKey,
          subjectKey,
          record: { type: 'question', id: subjectKey },
          recipient: { ...customer('customer-6@example.test'), staffLocale: 'es' },
          destination: { channel: 'email', destination: 'customer-6@example.test', permission: 'preferred' },
          values: { projectLink: 'https://x.example/p' },
        }),
      )
    const q = await draft('reminder.unanswered_question', 'question:q-9:first')
    const e = await draft('reminder.unanswered_estimate', 'estimate:e-9:first')
    const rel = (id: string, now: Date) =>
      withTx(t.db, (tx) =>
        releaseDraft(tx, { config, deliveryId: id, actor: office, automation: release, requestId: rid(), now }),
      )
    expect((await rel(q.id, futureElevenPm)).runAt).toEqual(new Date('2026-12-01T13:00:00Z'))
    expect((await rel(e.id, pastElevenPm)).runAt).toEqual(pastElevenPm)
    await expect(rel(q.id, pastElevenPm)).rejects.toThrow(/not a draft/)
    await createWorker({ db: t.db, registry: createAutomationRegistry([release]) }).runOnce()
    expect(f.email.sent.map((m) => bodyOf(m.text))).toEqual(['Synthetic test body https://x.example/p'])
    const [qRow] = await deliveries('question:q-9:first')
    const [eRow] = await deliveries('estimate:e-9:first')
    expect([qRow?.state, qRow?.locale, qRow?.released_by]).toEqual(['queued', 'en', 'staff-test-office'])
    expect([eRow?.state, eRow?.provider]).toEqual(['queued', 'fake'])
    const audited = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'actor_id'])
      .where('action', '=', 'message.released')
      .execute()
    expect(audited).toHaveLength(2)
    // The release job is audited as processed and the delivery as the send it was, never the reverse (HH-SEC-06).
    const outcome = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'target_type', 'result'])
      .where('target_id', '=', e.id)
      .where('action', 'like', 'notification.%')
      .orderBy('seq')
      .execute()
    expect(outcome).toEqual([
      { action: 'notification.sent', target_type: 'message_delivery', result: 'succeeded' },
      { action: 'notification.processed', target_type: 'message_delivery', result: 'succeeded' },
    ])
  })

  it('sends staff notifications in the recipient staff member’s locale (HH-COM-03)', async () => {
    const f = providers()
    await withTx(t.db, async (tx) => {
      await releaseTemplateVersion(tx, {
        messageKey: 'staff_notice.customer_reply',
        channel: 'email',
        locale: 'en',
        subject: 'Synthetic EN',
        body: 'Synthetic EN {appLink}',
        translationReview: 'source',
        sourceIds: ['OWN-DEC-98'],
        releasedBy: 'test',
      })
      await releaseTemplateVersion(tx, {
        messageKey: 'staff_notice.customer_reply',
        channel: 'email',
        locale: 'es',
        subject: 'Sintético ES',
        body: 'Sintético ES {appLink}',
        translationReview: 'ai_reviewed',
        sourceIds: ['OWN-DEC-98'],
        releasedBy: 'test',
      })
    })
    const automation = notificationAutomation({
      messageKey: 'staff_notice.customer_reply',
      providers: f.providers,
      resolve: async () => ({
        subjectKey: 'reply:q-3',
        record: { type: 'question', id: 'q-3' },
        recipients: [
          {
            kind: 'staff_user',
            id: 'staff-es',
            staffLocale: 'es',
            destinations: [{ channel: 'email', destination: 'staff-es@example.test', permission: 'staff_account' }],
          },
          {
            kind: 'staff_user',
            id: 'staff-en',
            staffLocale: 'en',
            destinations: [{ channel: 'email', destination: 'staff-en@example.test', permission: 'staff_account' }],
          },
        ],
        values: { appLink: 'https://staff.example/q/3' },
      }),
    })
    await withTx(t.db, (tx) =>
      outbox.add(tx, {
        type: 'question.customer_replied',
        aggregate: { type: 'question', id: 'q-3' },
        idempotencyKey: 'qcr:q-3',
        requestId: rid(),
      }),
    )
    await createWorker({ db: t.db, registry: createAutomationRegistry([automation]) }).runOnce()
    expect(f.email.sent.map((m) => [m.to, bodyOf(m.text)])).toEqual([
      ['staff-es@example.test', 'Sintético ES https://staff.example/q/3'],
      ['staff-en@example.test', 'Synthetic EN https://staff.example/q/3'],
    ])
  })
})
