// Business settings and the legal documents against PostgreSQL 16 (TSK-0144; HH-FIN-04, HH-EST-13, T58, T33,
// OWN-DEC-183, OWN-DEC-187, FACT-BUSINESS-ADDRESS, ENT-PolicyVersion, ENT-AuditEvent, RULE-SERVER-AUTHZ,
// RULE-NO-INVENTED-FACTS, RULE-SYNTHETIC-DATA). The mailing address here is a synthetic placeholder, never a real
// address: the real one is entered by the Owner on staging and production and never reaches the repository.
import { createHash } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import {
  ESTIMATE_TERMS,
  ESTIMATE_TERMS_V1_RECORD,
  ESTIMATE_TERMS_V1_SIGN_OFF,
  estimateTermsApproved,
  estimateTermsInEffect,
  legalContent,
} from '@handyhub/domain/legal'
import { CATALOGS } from '@handyhub/i18n'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { documentDetails } from '../../src/modules/estimates/readiness.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { loadConfig, parseValue, policyVersion } from '../../src/platform/config/index.js'
import { testConfig } from '../fixtures/env.js'

const pw = (n: number) => ['synthetic', 'business', 'settings', 'passphrase', String(n)].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof PEOPLE)[number]
/** Clearly synthetic placeholder lines (RULE-SYNTHETIC-DATA): no real street, city or ZIP code. */
const SYNTHETIC_LINES = ['SYNTHETIC-TEST-ADDRESS line one', 'SYNTHETIC-TEST-ADDRESS line two']

let t: TestDatabase
let app: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>
let staleOwner: [string, string]

async function signIn(p: Person): Promise<[string, string]> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email: `${p}-business@example.test`, password: pw(1) },
  })
  expect(res.statusCode).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db } })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: `${p}-business@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
  })
  for (const p of PEOPLE) [cookies[p], csrf[p]] = await signIn(p)
  // A second Owner session whose password entry is older than the fresh-sign-in window.
  staleOwner = await signIn('owner')
  await sql`UPDATE identity.staff_sessions SET authenticated_at = now() - interval '30 minutes'
            WHERE id = (SELECT id FROM identity.staff_sessions WHERE staff_user_id = ${ids.owner}
                        ORDER BY created_at DESC LIMIT 1)`.execute(t.db)
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

let seq = 0
const key = () => `synthetic-business-${String(++seq).padStart(6, '0')}`
const who = (p: Person | [string, string]): [string, string] => (Array.isArray(p) ? p : [cookies[p], csrf[p]])
const get = (p: Person, url: string) => app.inject({ method: 'GET', url, headers: { cookie: cookies[p] } })
function put(p: Person | [string, string], payload: unknown, version?: number) {
  const [cookie, token] = who(p)
  return app.inject({
    method: 'PUT',
    url: '/api/v1/staff/settings/business-details/mailing-address',
    payload: payload as object,
    headers: {
      cookie,
      'x-csrf-token': token,
      'idempotency-key': key(),
      ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    },
  })
}
type Setting = { state: string; version: number | null; lines: string[] | null; sourceIds: string[] }
const setting = async () =>
  (await get('owner', '/api/v1/staff/settings/business-details')).json<{ mailingAddress: Setting }>().mailingAddress

describe('[HH-EST-13][OWN-DEC-187][T33] the owner sign-off of estimate terms v1.0 is recorded on the terms version', () => {
  it('migration 0073 records v1.0 as approved with the sign-off exactly as OWN-DEC-187 states it; no attorney review', async () => {
    const config = await loadConfig(t.db)
    const entry = config.get('legal.estimate_terms')
    expect(entry).toMatchObject({ state: 'CONFIGURED', version: 2, proposed: false })
    if (entry.state !== 'CONFIGURED') throw new Error('the sign-off is recorded')
    expect(entry.value).toEqual(ESTIMATE_TERMS_V1_RECORD)
    expect(ESTIMATE_TERMS_V1_RECORD).toMatchObject({
      documentId: ESTIMATE_TERMS.documentId,
      preparedOn: ESTIMATE_TERMS.preparedOn,
      contentSha256: ESTIMATE_TERMS.contentSha256,
    })
    expect(entry.sourceIds).toEqual(['OWN-DEC-187', 'HH-EST-13', 'OWN-DEC-127', 'OQ-ATTORNEY-TERMS'])
    expect(ESTIMATE_TERMS_V1_SIGN_OFF).toEqual({
      by: 'owner',
      decisionId: 'OWN-DEC-187',
      source: 'owner answers 2026-10-21 R10-Q2',
      signedOn: '2026-10-21',
      wording: 'I approve v1.0 now',
    })
    // No staff user is invented: the decision is the recorded authorization (OWN-DEC-128).
    const row = await t.db
      .selectFrom('platform.policy_version')
      .select(['changed_by', 'change_reason'])
      .where('key', '=', 'legal.estimate_terms')
      .where('version', '=', 2)
      .executeTakeFirstOrThrow()
    expect(row.changed_by).toBe('migration:0073')
    expect(row.change_reason).toMatch(/^OWN-DEC-187/)
    // The superseded NOT CONFIGURED version stays (append-only).
    expect(await policyVersion(t.db, 'legal.estimate_terms', 1)).toMatchObject({ state: 'NOT_CONFIGURED' })
    // The recorded hash is the exact wording this software holds; the wording itself is unchanged by the sign-off.
    const hash = createHash('sha256')
      .update(legalContent(ESTIMATE_TERMS, CATALOGS['customer.en']), 'utf8')
      .digest('hex')
    expect(entry.value.contentSha256).toBe(hash)
    expect(entry.value.attorneyReviewed).toBe(false)
  })

  it('in effect for customer approvals without the banner; an attorney review is never faked', () => {
    expect(ESTIMATE_TERMS).toMatchObject({
      status: 'approved',
      attorneyReviewed: false,
      attorneyReviewRequired: false,
      ownerSignOff: ESTIMATE_TERMS_V1_SIGN_OFF,
    })
    expect(estimateTermsApproved(ESTIMATE_TERMS)).toBe(true)
    expect(estimateTermsInEffect(ESTIMATE_TERMS_V1_RECORD, ESTIMATE_TERMS)).toBe(true)
    // Without the owner's sign-off, an approved status alone is not enough for a version that was not reviewed.
    const { ownerSignOff: _drop, ...unsigned } = ESTIMATE_TERMS_V1_RECORD
    void _drop
    expect(estimateTermsInEffect(unsigned, ESTIMATE_TERMS)).toBe(false)
    expect(estimateTermsInEffect({ ...ESTIMATE_TERMS_V1_RECORD, status: 'owner_review_pending' }, ESTIMATE_TERMS)).toBe(
      false,
    )
    // A version that needs an attorney review (the next one) is not in effect on the owner's sign-off alone.
    expect(estimateTermsInEffect(ESTIMATE_TERMS_V1_RECORD, { attorneyReviewRequired: true })).toBe(false)
    // A sign-off is only ever recorded on an approved version; the stored shape refuses anything else.
    expect(() =>
      parseValue('legal.estimate_terms', { ...ESTIMATE_TERMS_V1_RECORD, status: 'owner_review_pending' }),
    ).toThrow(/sign-off is recorded only on an approved version/)
    expect(() =>
      parseValue('legal.estimate_terms', {
        ...ESTIMATE_TERMS_V1_RECORD,
        ownerSignOff: { ...ESTIMATE_TERMS_V1_SIGN_OFF, by: 'office' },
      }),
    ).toThrow(/ownerSignOff\.by/)
  })

  it('[RULE-SERVER-AUTHZ] the Owner reads the legal documents with the sign-off and the open reviews; no one else', async () => {
    const res = await get('owner', '/api/v1/staff/settings/legal-documents')
    expect(res.statusCode, res.body).toBe(200)
    const docs = res.json<{ documents: Record<string, unknown>[] }>().documents
    expect(docs.map((d) => d['key'])).toEqual([
      'legal.privacy_notice',
      'legal.sms_terms',
      'legal.website_terms',
      'legal.sms_disclosure',
      'legal.estimate_terms',
    ])
    expect(docs.find((d) => d['key'] === 'legal.estimate_terms')).toEqual({
      key: 'legal.estimate_terms',
      state: 'CONFIGURED',
      version: 2,
      documentId: 'estimate-terms-1',
      status: 'approved',
      attorneyReviewed: false,
      attorneyReviewRequired: false,
      ownerSignOff: ESTIMATE_TERMS_V1_SIGN_OFF,
      inEffect: true,
      wordingMatches: true,
      effectiveFrom: expect.any(String),
      // The attorney review of the left-out clauses and the next version stays open (OQ-ATTORNEY-TERMS) ...
      waitsOn: ['OQ-ATTORNEY-TERMS'],
      // ... and real customer use still waits for the launch phases and the privacy review (OWN-DEC-187).
      realUseWaitsOn: ['OWN-DEC-191', 'OQ-ATTORNEY-PRIVACY'],
    })
    for (const d of docs.filter((x) => x['key'] !== 'legal.estimate_terms'))
      expect(d, String(d['key'])).toMatchObject({
        state: 'CONFIGURED',
        status: 'draft',
        attorneyReviewed: false,
        ownerSignOff: null,
        inEffect: null,
        wordingMatches: true,
        waitsOn: ['OQ-ATTORNEY-PRIVACY'],
      })
    for (const p of ['office', 'estimator', 'worker'] as const)
      expect((await get(p, '/api/v1/staff/settings/legal-documents')).statusCode, p).toBe(403)
  })
})

describe('[HH-FIN-04][T58][OWN-DEC-183] the Owner enters the mailing address in Business settings', () => {
  it('[FACT-BUSINESS-ADDRESS] NOT CONFIGURED until entered: documents omit the line; other roles cannot read it', async () => {
    const res = await get('owner', '/api/v1/staff/settings/business-details')
    expect(res.statusCode).toBe(200)
    expect(res.headers['etag']).toBe('"1"')
    expect(res.json()).toEqual({
      mailingAddress: {
        state: 'NOT_CONFIGURED',
        version: 1,
        lines: null,
        sourceIds: ['FACT-BUSINESS-ADDRESS', 'OQ-MAILING-ADDRESS'],
      },
    })
    expect(documentDetails(await loadConfig(t.db)).mailingAddress).toBeNull()
    for (const p of ['office', 'estimator', 'worker'] as const)
      expect((await get(p, '/api/v1/staff/settings/business-details')).statusCode, p).toBe(403)
  })

  it('[RULE-SERVER-AUTHZ] only the Owner, with a fresh sign-in, a reason and the version shown; nothing else writes', async () => {
    const body = { lines: SYNTHETIC_LINES, reason: 'Synthetic: test entry.' }
    for (const p of ['office', 'estimator', 'worker'] as const) {
      const res = await put(p, body, 1)
      expect(res.statusCode, p).toBe(403)
      expect(res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } })
    }
    const stale = await put(staleOwner, body, 1)
    expect(stale.statusCode).toBe(403)
    expect(stale.json()).toMatchObject({ error: { code: 'FRESH_AUTH_REQUIRED' } })
    expect((await put('owner', { lines: SYNTHETIC_LINES }, 1)).statusCode).toBe(400)
    const blank = await put('owner', { lines: SYNTHETIC_LINES, reason: '   ' }, 1)
    expect(blank.statusCode).toBe(400)
    expect(blank.json()).toMatchObject({ error: { fieldErrors: [{ field: 'body.reason', code: 'required' }] } })
    expect((await put('owner', { lines: ['a', 'b', 'c', 'd', 'e'], reason: 'Synthetic' }, 1)).statusCode).toBe(400)
    expect((await put('owner', { lines: ['x'.repeat(121)], reason: 'Synthetic' }, 1)).statusCode).toBe(400)
    expect((await put('owner', body)).statusCode).toBe(428)
    const conflict = await put('owner', body, 7)
    expect(conflict.statusCode).toBe(409)
    expect(conflict.json()).toMatchObject({ error: { code: 'STALE_VERSION' } })
    expect(await setting()).toMatchObject({ state: 'NOT_CONFIGURED', version: 1 })
    const audits = await t.db
      .selectFrom('platform.audit_events')
      .select('id')
      .where('action', '=', 'business_settings.change_mailing_address')
      .execute()
    expect(audits).toEqual([])
  })

  it('a new configuration version, audited without the address; documents print it; the website never shows it', async () => {
    const res = await put(
      'owner',
      { lines: ['  SYNTHETIC-TEST-ADDRESS  line one ', '', SYNTHETIC_LINES[1]], reason: ' Synthetic: test entry. ' },
      1,
    )
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toEqual({
      state: 'CONFIGURED',
      version: 2,
      lines: SYNTHETIC_LINES,
      sourceIds: ['FACT-BUSINESS-ADDRESS', 'OWN-DEC-183'],
    })
    const row = await t.db
      .selectFrom('platform.policy_version')
      .select(['changed_by', 'change_reason', 'state'])
      .where('key', '=', 'business.mailing_address')
      .where('version', '=', 2)
      .executeTakeFirstOrThrow()
    expect(row).toEqual({ changed_by: ids.owner, change_reason: 'Synthetic: test entry.', state: 'configured' })
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['actor_id', 'summary', 'reason', 'step_up_used', 'target_type', 'target_id', 'target_version'])
      .where('action', '=', 'business_settings.change_mailing_address')
      .executeTakeFirstOrThrow()
    expect(audit).toEqual({
      actor_id: ids.owner,
      summary: { from: 'NOT_CONFIGURED', to: 'CONFIGURED', lineCount: 2, previousVersion: 1 },
      reason: 'Synthetic: test entry.',
      step_up_used: true,
      target_type: 'policy_version',
      target_id: 'business.mailing_address',
      target_version: 2,
    })
    // The audit record never holds the address itself (OWN-DEC-183).
    expect(JSON.stringify(audit)).not.toContain('SYNTHETIC-TEST-ADDRESS')

    // Estimates, approval receipts and invoices read their issuer details from configuration (HH-FIN-04).
    expect(documentDetails(await loadConfig(t.db))).toMatchObject({
      issuerName: 'Handyhub LLC',
      mailingAddress: SYNTHETIC_LINES,
    })
    // The website never shows it (OWN-DEC-48).
    const site = await app.inject({ method: 'GET', url: '/api/v1/public/site' })
    expect(site.statusCode).toBe(200)
    expect(site.body).not.toContain('SYNTHETIC-TEST-ADDRESS')
  })

  it('the Owner removes it again: NOT CONFIGURED, a new version; the old versions stay', async () => {
    const res = await put('owner', { lines: null, reason: 'Synthetic: remove the test entry.' }, 2)
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({ state: 'NOT_CONFIGURED', version: 3, lines: null })
    expect(documentDetails(await loadConfig(t.db)).mailingAddress).toBeNull()
    const blankOnly = await put('owner', { lines: ['  ', ''], reason: 'Synthetic: blank lines only.' }, 3)
    expect(blankOnly.json()).toMatchObject({ state: 'NOT_CONFIGURED', version: 4 })
    expect(await policyVersion(t.db, 'business.mailing_address', 2)).toMatchObject({
      state: 'CONFIGURED',
      value: { lines: SYNTHETIC_LINES },
    })
    const audits = await t.db
      .selectFrom('platform.audit_events')
      .select('summary')
      .where('action', '=', 'business_settings.change_mailing_address')
      .orderBy('seq')
      .execute()
    expect(audits.map((a) => a.summary)).toEqual([
      { from: 'NOT_CONFIGURED', to: 'CONFIGURED', lineCount: 2, previousVersion: 1 },
      { from: 'CONFIGURED', to: 'NOT_CONFIGURED', lineCount: 0, previousVersion: 2 },
      { from: 'NOT_CONFIGURED', to: 'NOT_CONFIGURED', lineCount: 0, previousVersion: 3 },
    ])
  })
})
