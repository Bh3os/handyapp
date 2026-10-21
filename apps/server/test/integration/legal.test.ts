// The legal documents as policy versions against PostgreSQL 16 (TSK-0024; ENT-PolicyVersion, HH-PRIV-04, HH-COM-12,
// HH-INT-19, OWN-DEC-72, T74, T76). Every visitor, address and number is synthetic (RULE-SYNTHETIC-DATA).
import { createHash } from 'node:crypto'
import { loadServiceSeed, syncServices } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { LEGAL_DOCUMENTS, legalContent, PRIVACY_NOTICE, WEBSITE_TERMS } from '@handyhub/domain/legal'
import { CATALOGS } from '@handyhub/i18n'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { legalVersions } from '../../src/modules/legal/index.js'
import { loadConfig, recordPolicyVersion, requireConfigured } from '../../src/platform/config/index.js'
import { testConfig } from '../fixtures/env.js'

let t: TestDatabase
let app: FastifyInstance
beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db } })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
let ip = 40
const body = (privacyNoticeVersion: string, n: number) => ({
  formVersion: 'test-1',
  privacyNoticeVersion,
  services: [{ serviceId: 'SVC-DW-01', notes: 'Synthetic note' }],
  notSure: false,
  description: 'Synthetic project description.',
  answers: [{ serviceId: 'SVC-DW-01', question: 'damage_size_count_cause', kind: 'text', text: 'Synthetic' }],
  property: { street: '100 Synthetic Way', city: 'Testville', state: 'ky', zip: '40000', propertyType: 'house' },
  timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['mornings'] },
  estimatePreference: 'online',
  contact: {
    fullName: 'Test Customer',
    email: `legal-${n}@example.test`,
    phone: '(502) 555-0142',
    preferredChannel: 'email',
  },
  smsOptIn: false,
  marketingOptIn: false,
})
const submit = (payload: unknown, key: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key, 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: payload as Record<string, unknown>,
  })

describe('seeded legal document versions (TSK-0024, ENT-PolicyVersion, HH-PRIV-04, OWN-DEC-72)', () => {
  it('[HH-PRIV-04] each document is one active draft version whose ID and hash match the published wording', async () => {
    const config = await loadConfig(t.db)
    for (const doc of LEGAL_DOCUMENTS) {
      const entry = requireConfigured(config.get(doc.configKey))
      expect(entry.version, doc.configKey).toBe(doc.version)
      expect(entry.proposed, doc.configKey).toBe(true)
      expect(entry.value).toEqual({
        documentId: doc.documentId,
        status: 'draft',
        attorneyReviewed: false,
        preparedOn: doc.preparedOn,
        contentSha256: doc.contentSha256,
      })
      const hash = createHash('sha256').update(legalContent(doc, CATALOGS['customer.en']), 'utf8').digest('hex')
      expect(entry.value.contentSha256).toBe(hash)
      expect(entry.sourceIds).toContain('OQ-ATTORNEY-PRIVACY')
    }
  })

  it('[RULE-DECIDED-VALUES-ACTIVE] the values the wording states equal the active configuration', async () => {
    const config = await loadConfig(t.db)
    const v = WEBSITE_TERMS.values
    const validity = requireConfigured(config.get('estimate.validity')).value
    const deposit = requireConfigured(config.get('deposit.rule')).value
    const cancellation = requireConfigured(config.get('cancellation.rules')).value
    expect(v['estimateValidityDays']).toBe(validity.days)
    expect(v['depositThresholdCents']).toBe(deposit.thresholdCents)
    expect((v['depositPercent'] ?? 0) * 100).toBe(deposit.percentBps)
    expect(v['cancellationNoticeHours']).toBe(cancellation.noticeHours)
    expect(v['lateCancellationCents']).toBe(cancellation.lateCancellationCents)
    expect(cancellation.rescheduleFree).toBe(true)
    expect(requireConfigured(config.get('payment.term_default')).value.term).toBe('due_on_receipt')
    // The terms list exactly the configured methods (cards through Square links and Tap to Pay, then the rest).
    expect(requireConfigured(config.get('payment.methods')).value.methods).toEqual([
      'square_payment_link',
      'square_tap_to_pay',
      'cash',
      'check',
      'zelle',
      'cash_app',
      'chime',
    ])
    expect(PRIVACY_NOTICE.values['maxRequestPhotos']).toBe(
      requireConfigured(config.get('uploads.limits')).value.maxRequestPhotos,
    )
    expect(PRIVACY_NOTICE.values['requestDraftDays']).toBe(
      requireConfigured(config.get('session.timings')).value.requestDraftDays,
    )
    // The SMS terms say "up to two" estimate, question and invoice reminders: each cadence has a first and a final.
    const cadences = requireConfigured(config.get('reminders.cadences')).value
    for (const c of [cadences.unansweredEstimate, cadences.unansweredQuestion, cadences.unpaidInvoice])
      expect(c.finalHours).toBeGreaterThan(c.firstHours)
    expect(cadences.repeatService.schedule).toBe('customer_agreed')
  })

  it('[ENT-PolicyVersion] the public contact the SMS terms show is still NOT CONFIGURED (OWN-DEC-131)', async () => {
    const config = await loadConfig(t.db)
    expect(config.get('business.public_contact').state).toBe('NOT_CONFIGURED')
    expect(config.get('sms.help_reply').state).toBe('NOT_CONFIGURED')
  })
})

describe('the privacy policy version is saved with each request (TSK-0024, HH-PRIV-04, HH-INT-19, T74)', () => {
  it('[HH-PRIV-04][HH-INT-19] a request saves the presented privacy policy version', async () => {
    const res = await submit(body(PRIVACY_NOTICE.documentId, 1), 'synthetic-legal-key-0001')
    expect(res.statusCode).toBe(201)
    const r = await t.db
      .selectFrom('intake.requests')
      .select(['privacy_notice_version', 'original_submission'])
      .where('reference', '=', res.json<{ reference: string }>().reference)
      .executeTakeFirstOrThrow()
    expect(r.privacy_notice_version).toBe('privacy-notice-1')
    expect((r.original_submission as { privacyNoticeVersion: string }).privacyNoticeVersion).toBe('privacy-notice-1')
  })

  it('[HH-PRIV-04] a version that was never published is refused next to its field, and nothing is saved', async () => {
    const before = await t.db.selectFrom('intake.requests').select(t.db.fn.countAll().as('n')).executeTakeFirst()
    const res = await submit(body('none-yet', 2), 'synthetic-legal-key-0002')
    expect(res.statusCode).toBe(400)
    const err = res.json<{ error: { fieldErrors: { field: string; code: string }[] } }>().error
    expect(err.fieldErrors).toContainEqual(
      expect.objectContaining({ field: 'body.privacyNoticeVersion', code: 'unknown_version' }),
    )
    const after = await t.db.selectFrom('intake.requests').select(t.db.fn.countAll().as('n')).executeTakeFirst()
    expect(Number(after?.n)).toBe(Number(before?.n))
  })

  it('[ENT-PolicyVersion] after a new version, a page that presented the older one can still be sent', async () => {
    await recordPolicyVersion(t.db, {
      key: 'legal.privacy_notice',
      value: {
        documentId: 'privacy-notice-2',
        status: 'draft',
        attorneyReviewed: false,
        preparedOn: '2026-10-22',
        contentSha256: 'a'.repeat(64),
      },
      sourceIds: ['HH-PRIV-04'],
      changedBy: 'test:synthetic',
      reason: 'synthetic second version',
      proposed: true,
    })
    expect((await legalVersions(t.db, 'legal.privacy_notice')).map((v) => [v.documentId, v.active])).toEqual([
      ['privacy-notice-2', true],
      ['privacy-notice-1', false],
    ])
    for (const [n, id] of [
      [3, 'privacy-notice-1'],
      [4, 'privacy-notice-2'],
    ] as const) {
      const res = await submit(body(id, n), `synthetic-legal-key-000${n}`)
      expect(res.statusCode, id).toBe(201)
    }
  })
})
