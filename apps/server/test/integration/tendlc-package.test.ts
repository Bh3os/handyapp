// The A2P 10DLC registration package against PostgreSQL 16 (TSK-0133; OWN-DEC-190, HH-COM-12, HH-INT-22,
// ENT-PolicyVersion, T76). The package (docs/10dlc/registration.md) quotes the released text templates as its sample
// messages and states that live texts are off and the HELP reply and the support contact are NOT CONFIGURED: each is
// checked here against the seeded database, so a released template or a changed setting fails until the package is
// updated. Every visitor, address and number is synthetic (RULE-SYNTHETIC-DATA).
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loadServiceSeed, syncServices } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import {
  legalContent,
  legalTextContent,
  PRIVACY_NOTICE,
  SMS_DISCLOSURE,
  SMS_DISCLOSURE_V1,
  SMS_TERMS,
  SMS_TERMS_V1,
} from '@handyhub/domain/legal'
import { CATALOGS } from '@handyhub/i18n'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { isLegalVersion, legalVersions } from '../../src/modules/legal/index.js'
import { currentTemplate, messageType, renderTemplate } from '../../src/modules/notifications/index.js'
import { portalLink } from '../../src/modules/notifications/values.js'
import { SAMPLE_VALUES, type VariableName } from '../../src/modules/notifications/variables.js'
import { loadConfig, requireConfigured } from '../../src/platform/config/index.js'
import { testConfig } from '../fixtures/env.js'

const ROOT = new URL('../../../../', import.meta.url)
/** The package with its line breaks and blockquote markers folded, so a quote may wrap. */
const doc = readFileSync(fileURLToPath(new URL('docs/10dlc/registration.md', ROOT)), 'utf8')
  .replace(/\n>\s?/g, ' ')
  .replace(/\s+/g, ' ')
/** The production origin the samples show (FACT-DOMAIN). */
const ORIGIN = 'https://handyhub247.com'

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

describe('the consent texts of the package are published versions (TSK-0133, ENT-PolicyVersion, HH-INT-22)', () => {
  it('[HH-COM-12][ENT-PolicyVersion] the SMS terms version 2 is the active draft; version 1 stays published', async () => {
    const entry = requireConfigured((await loadConfig(t.db)).get('legal.sms_terms'))
    expect(entry.version).toBe(2)
    expect(entry.proposed).toBe(true)
    expect(entry.sourceIds).toEqual(expect.arrayContaining(['OQ-ATTORNEY-PRIVACY', 'OWN-DEC-190']))
    const hash = createHash('sha256').update(legalContent(SMS_TERMS, CATALOGS['customer.en']), 'utf8').digest('hex')
    expect(entry.value).toEqual({
      documentId: 'sms-terms-2',
      status: 'draft',
      attorneyReviewed: false,
      preparedOn: SMS_TERMS.preparedOn,
      contentSha256: hash,
    })
    const versions = await legalVersions(t.db, 'legal.sms_terms')
    expect(versions.map((v) => [v.documentId, v.active, v.contentSha256])).toEqual([
      ['sms-terms-2', true, SMS_TERMS.contentSha256],
      ['sms-terms-1', false, SMS_TERMS_V1.contentSha256],
    ])
  })

  it('[HH-INT-22][ENT-PolicyVersion] the request form’s SMS opt-in version 2 is active; consents under version 1 stay valid', async () => {
    const versions = await legalVersions(t.db, 'legal.sms_disclosure')
    expect(versions.map((v) => [v.documentId, v.active, v.contentSha256])).toEqual([
      ['sms-disclosure-2', true, SMS_DISCLOSURE.contentSha256],
      ['sms-disclosure-1', false, SMS_DISCLOSURE_V1.contentSha256],
    ])
    const v1 = createHash('sha256').update(legalTextContent(SMS_DISCLOSURE_V1, CATALOGS['customer.en'])).digest('hex')
    expect(v1).toBe(SMS_DISCLOSURE_V1.contentSha256)
    expect(await isLegalVersion(t.db, 'legal.sms_disclosure', 'sms-disclosure-1')).toBe(true)
    expect(await isLegalVersion(t.db, 'legal.sms_disclosure', 'sms-disclosure-3')).toBe(false)
  })

  it('[HH-INT-22][T76] a request sent from a page still showing version 1 is accepted and records version 1', async () => {
    const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/requests',
      headers: { 'idempotency-key': 'synthetic-tendlc-key-0001', 'x-forwarded-for': '198.51.100.71' },
      payload: {
        formVersion: 'test-1',
        privacyNoticeVersion: PRIVACY_NOTICE.documentId,
        services: [{ serviceId: 'SVC-DW-01', notes: 'Synthetic note' }],
        notSure: false,
        description: 'Synthetic project description.',
        answers: [{ serviceId: 'SVC-DW-01', question: 'damage_size_count_cause', kind: 'text', text: 'Synthetic' }],
        property: { street: '100 Synthetic Way', city: 'Testville', state: 'ky', zip: '40000', propertyType: 'house' },
        timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['mornings'] },
        estimatePreference: 'online',
        contact: {
          fullName: 'Test Customer',
          email: 'tendlc-v1@example.test',
          phone: '(502) 555-0171',
          preferredChannel: 'text',
        },
        smsOptIn: true,
        smsDisclosureVersion: 'sms-disclosure-1',
        marketingOptIn: false,
      },
    })
    expect(res.statusCode, res.body).toBe(201)
    const rows = await t.db
      .selectFrom('platform.consent_records')
      .select(['purpose', 'granted', 'source', 'disclosure_version'])
      .where('destination', '=', '+15025550171')
      .execute()
    expect(rows).toEqual([
      { purpose: 'transactional_sms', granted: true, source: 'request_form', disclosure_version: 'sms-disclosure-1' },
    ])
  })
})

describe('the package’s sample messages are the released text templates (TSK-0133, OWN-DEC-190, HH-COM-12)', () => {
  it('[HH-COM-12][OWN-DEC-190] every released customer text template is quoted and filled in as a sample', async () => {
    const keys = await t.db
      .selectFrom('platform.message_template_versions')
      .select('message_key')
      .distinct()
      .where('channel', '=', 'sms')
      .where('audience', '=', 'customer')
      .where('locale', '=', 'en')
      .orderBy('message_key')
      .execute()
    expect(keys.map((k) => k.message_key)).toEqual([
      'contact.verification_code',
      'estimate.ready',
      'invoice.ready',
      'question.notice',
    ])
    const minutes = requireConfigured((await loadConfig(t.db)).get('session.timings')).value.oneTimeCodeMinutes
    const samples = /### 4\.5 Sample messages (.*?) The templates/.exec(doc)?.[1] ?? ''
    expect(samples.match(/\d\. "/g) ?? []).toHaveLength(keys.length)
    for (const { message_key: key } of keys) {
      const template = await currentTemplate(t.db, key, 'sms', 'en')
      if (!template) throw new Error(`no released text template for ${key}`)
      expect(doc, key).toContain(`| \`${key}\` | "${template.body}" |`)
      // Filled in as the samples say: the registry's preview values, the code lifetime in force and a project link
      // on the production origin; never a real customer's data.
      const values: Record<string, string> = {}
      for (const name of Object.keys(messageType(key).variables)) {
        if (!template.body.includes(`{${name}}`)) continue
        values[name] =
          name === 'projectLink'
            ? (portalLink(ORIGIN, SAMPLE_VALUES.reference) as string)
            : name === 'codeLifetimeMinutes'
              ? String(minutes)
              : SAMPLE_VALUES[name as VariableName]
      }
      const sms = renderTemplate(template, values, { linkHosts: ['handyhub247.com'] }).body
      expect(samples, key).toContain(`"${sms}"`)
      expect(sms.length).toBeGreaterThanOrEqual(20)
      expect(sms).toContain('HandyHub')
    }
  })
})

describe('what the package says is not configured or off is so (TSK-0133, OWN-DEC-190, FACT-PUBLIC-CONTACT)', () => {
  it('[OWN-DEC-190] live texts are off, the HELP reply and the support contact are NOT CONFIGURED', async () => {
    const config = await loadConfig(t.db)
    expect(requireConfigured(config.get('sms.live_delivery')).value).toEqual({ enabled: false })
    expect(doc).toContain('`sms.live_delivery` is `{"enabled": false}`')
    expect(config.get('sms.help_reply').state).toBe('NOT_CONFIGURED')
    expect(config.get('business.public_contact').state).toBe('NOT_CONFIGURED')
  })
})
