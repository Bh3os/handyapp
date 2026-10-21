// The customer estimate view, estimate terms v1.0, Request Changes and Decline against PostgreSQL 16 (TSK-0056;
// HH-EST-09, HH-EST-13, HH-EST-06, HH-PORT-10, HH-PORT-01, HH-ID-07, T19, T24, T33, OWN-DEC-103, OWN-DEC-127,
// RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS). Staff, customers, requests, amounts and messages are synthetic
// (RULE-SYNTHETIC-DATA); nothing reaches a real provider.
import { createHash, randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { ESTIMATE_TERMS, legalContent } from '@handyhub/domain/legal'
import { CATALOGS } from '@handyhub/i18n'
import type { StaffActor } from '@handyhub/policy'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { estimateResponseNoticeAutomations } from '../../src/modules/estimates/index.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { MODULES } from '../../src/modules/index.js'
import { forbiddenForCustomer } from '../../src/modules/records/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { loadConfig, recordPolicyVersion, type ConfigKey } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { createProviders } from '../../src/providers/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { testConfig } from '../fixtures/env.js'

const pw = (n: number) => ['synthetic', 'portal', 'estimates', 'passphrase', String(n)].join(' ')
const PEOPLE = ['owner', 'estimator'] as const
type Person = (typeof PEOPLE)[number]
const INTERNAL_NOTE = 'SYNTHETIC-INTERNAL-0056: staff-only markup note.'
const customerCatalog: Record<string, string> = CATALOGS['customer.en']

let t: TestDatabase
let app: FastifyInstance
const storage = new FakeObjectStorage()
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const staff = {} as Record<Person, StaffActor>

/** Terms v1.0 as the owner's legal-document sign-off would record it: owner review pending, not attorney-reviewed. */
const V1_RECORDED = {
  documentId: ESTIMATE_TERMS.documentId,
  status: 'owner_review_pending',
  attorneyReviewed: false,
  preparedOn: ESTIMATE_TERMS.preparedOn,
  contentSha256: ESTIMATE_TERMS.contentSha256,
}
/** A synthetic test-only terms document this software holds no wording for (never real wording). */
const TEST_TERMS = {
  documentId: 'test-estimate-terms-1',
  status: 'draft',
  attorneyReviewed: false,
  preparedOn: '2026-10-21',
  contentSha256: '0'.repeat(64),
}

async function setConfig(key: ConfigKey, value: unknown, sourceIds = ['TEST-SYNTHETIC']) {
  await recordPolicyVersion(t.db, {
    key,
    value: value as never,
    sourceIds,
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
}

async function signIn(p: Person): Promise<[string, string]> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email: `${p}-portal-estimates@example.test`, password: pw(1) },
  })
  expect(res.statusCode).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, storage } })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: `${p}-portal-estimates@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      staff[p] = { kind: 'staff', userId: user.id, roles: [p], capabilities: [], status: 'active', freshAuth: false }
    }
  })
  for (const p of PEOPLE) [cookies[p], csrf[p]] = await signIn(p)
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

let seq = 0
const key = (what: string) => `synthetic-${what}-${String(++seq).padStart(6, '0')}-${randomUUID()}`
function staffWrite(who: Person, method: 'POST' | 'PUT', url: string, payload: unknown, version?: number) {
  return app.inject({
    method,
    url,
    payload: payload as object,
    headers: {
      cookie: cookies[who],
      'x-csrf-token': csrf[who],
      'idempotency-key': key('staff'),
      ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    },
  })
}
const staffGet = (who: Person, url: string) => app.inject({ method: 'GET', url, headers: { cookie: cookies[who] } })

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

type Project = { requestId: string; projectId: string; reference: string; contactId: string }
let ip = 1
async function readyRequest(): Promise<Project> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }, { serviceId: 'SVC-PT-01' }],
      notSure: false,
      description: 'Synthetic customer estimate project.',
      answers: [],
      property: {
        street: `${seq} Synthetic Court`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Synthetic Estimate Customer',
        email: `portal-estimates-${seq}@example.test`,
        phone: '(502) 555-0156',
        preferredChannel: 'email',
      },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  const { reference } = res.json<{ reference: string }>()
  const row = await t.db
    .selectFrom('intake.requests')
    .select(['id', 'project_id', 'state_version', 'contact_id'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
  expect(
    (await staffWrite('owner', 'PUT', `/api/v1/staff/requests/${row.id}/qualification`, { checks: ALL_OK }, 0))
      .statusCode,
  ).toBe(200)
  const moved = await staffWrite(
    'owner',
    'POST',
    `/api/v1/staff/requests/${row.id}/actions/online-estimate`,
    { workPackages: ['SVC-DW-01', 'SVC-PT-01'] },
    row.state_version,
  )
  expect(moved.statusCode, moved.body).toBe(200)
  return { requestId: row.id, projectId: row.project_id, reference, contactId: row.contact_id }
}

type StaffView = {
  id: string
  estimateNumber: string
  version: number
  rowVersion: number
  workPackages: { id: string }[]
  lifecycle: { customerResponses: { kind: string; version: number; at: string; message: string | null }[] }
}
const staffView = async (versionId: string) => {
  const res = await staffGet('estimator', `/api/v1/staff/estimate-versions/${versionId}`)
  expect(res.statusCode).toBe(200)
  return res.json<StaffView>()
}

/** A published estimate (base lines 2 x $12.50 + $1,250.00, an optional add-on), under the given terms. */
async function published(terms: Record<string, unknown> = V1_RECORDED) {
  await setConfig('legal.estimate_terms', terms)
  const p = await readyRequest()
  const created = await staffWrite('estimator', 'POST', `/api/v1/staff/projects/${p.projectId}/estimates`, {})
  expect(created.statusCode).toBe(201)
  const c = created.json<{ number: string; versionId: string }>()
  const v = await staffView(c.versionId)
  const lines = [
    {
      kind: 'base',
      workPackageId: v.workPackages[0]?.id,
      description: 'Patch the synthetic hole',
      quantity: '2',
      unit: 'patch',
      quantitySource: 'measured_on_site',
      unitPriceCents: 1250,
      internalCost: { materialCostCents: 300, laborCostCents: 400, note: INTERNAL_NOTE },
    },
    {
      kind: 'base',
      workPackageId: v.workPackages[1]?.id,
      description: 'Paint the synthetic wall',
      quantity: '1',
      unit: 'room',
      unitPriceCents: 125_000,
    },
    {
      kind: 'add_on',
      workPackageId: v.workPackages[1]?.id,
      description: 'Synthetic optional trim',
      quantity: '3',
      unit: 'door',
      unitPriceCents: 1999,
    },
  ]
  const saved = await staffWrite(
    'estimator',
    'PUT',
    `/api/v1/staff/estimate-versions/${c.versionId}/draft`,
    {
      lines,
      texts: { exclusions: ['Synthetic: moving furniture'] },
      internal: { markupAssumptions: INTERNAL_NOTE, estimatorNotes: INTERNAL_NOTE },
    },
    v.rowVersion,
  )
  expect(saved.statusCode, saved.body).toBe(200)
  const pub = await staffWrite(
    'estimator',
    'POST',
    `/api/v1/staff/estimate-versions/${c.versionId}/publish`,
    {},
    saved.json<{ rowVersion: number }>().rowVersion,
  )
  expect(pub.statusCode, pub.body).toBe(200)
  return { ...p, number: c.number, versionId: c.versionId }
}

async function customerCookie(p: Pick<Project, 'contactId' | 'projectId'>, verifiedAt = new Date()) {
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, { contactRef: p.contactId, via: 'grant', projectIds: [p.projectId], verifiedAt }),
  )
  return `__Host-hh_customer=${s.token}`
}
const base = (e: { reference: string; number: string }, version = 1) =>
  `/api/v1/customer/projects/${e.reference}/estimates/${e.number}/versions/${version}`
const customerGet = (url: string, cookie: string) => app.inject({ method: 'GET', url, headers: { cookie } })
function customerPost(url: string, cookie: string, payload: unknown, idempotencyKey = key('customer')) {
  return app.inject({
    method: 'POST',
    url,
    payload: payload as object,
    headers: { cookie, 'idempotency-key': idempotencyKey, 'x-forwarded-for': '198.51.100.250' },
  })
}

const versionRow = (id: string) =>
  t.db.selectFrom('estimating.estimate_versions').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
const responsesOf = (versionId: string) =>
  t.db.selectFrom('estimating.customer_responses').selectAll().where('version_id', '=', versionId).execute()
const itemOf = (versionId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .selectAll()
    .where('type', '=', 'estimate_response')
    .where('subject_id', '=', versionId)
    .orderBy('opened_at', 'desc')
    .execute()

/** Every property name in a JSON value. */
function keysOf(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => keysOf(x, out))
  else if (v && typeof v === 'object')
    for (const [k, x] of Object.entries(v)) {
      out.push(k)
      keysOf(x, out)
    }
  return out
}

describe('[HH-EST-13][OWN-DEC-127] estimate terms v1.0 as a versioned document of the agreed policies', () => {
  it('its content hash is the SHA-256 of the exact wording and values; the stated values are the active policies', async () => {
    const hash = createHash('sha256').update(legalContent(ESTIMATE_TERMS, customerCatalog), 'utf8').digest('hex')
    expect(hash).toBe(ESTIMATE_TERMS.contentSha256)
    // Each number the terms state is the active policy value, never typed into the text (HH-EST-13).
    const config = await loadConfig(t.db)
    const validity = config.get('estimate.validity')
    const deposit = config.get('deposit.rule')
    const reopen = config.get('request.reopen_period')
    if (validity.state !== 'CONFIGURED' || deposit.state !== 'CONFIGURED' || reopen.state !== 'CONFIGURED')
      throw new Error('the decided policies are seeded active')
    expect(ESTIMATE_TERMS.values).toEqual({
      estimateValidityDays: validity.value.days,
      depositThresholdCents: deposit.value.thresholdCents,
      depositPercent: deposit.value.percentBps / 100,
      reopenDays: reopen.value.days,
    })
    // Not in effect until the owner approves the wording (OQ-TERMS-OWNER-APPROVAL); nothing activates it here.
    expect(ESTIMATE_TERMS).toMatchObject({ status: 'owner_review_pending', attorneyReviewed: false })
  })

  it('[RULE-NO-INVENTED-FACTS] the migrations record no terms version: the key stays NOT CONFIGURED', async () => {
    const fresh = await createTestDatabase()
    try {
      const rows = await fresh.db
        .selectFrom('platform.policy_version')
        .select(['version', 'state', 'status'])
        .where('key', '=', 'legal.estimate_terms')
        .execute()
      expect(rows).toEqual([{ version: 1, state: 'not_configured', status: 'active' }])
    } finally {
      await fresh.drop()
    }
  })
})

describe('[HH-PORT-10][HH-EST-06][T24] the customer reads the exact published version in the Documents tab', () => {
  it('lists the version with its status and shows it exactly as stored, with no internal field', async () => {
    const e = await published()
    const cookie = await customerCookie(e)
    const docs = await customerGet(`/api/v1/customer/projects/${e.reference}/documents`, cookie)
    expect(docs.statusCode).toBe(200)
    const list = docs.json<{ state: string; estimates: Record<string, unknown>[] }>()
    expect(list.state).toBe('listed')
    expect(list.estimates).toEqual([
      expect.objectContaining({ number: e.number, version: 1, status: 'current', totalCents: 127_500 }),
    ])

    const res = await customerGet(base(e), cookie)
    expect(res.statusCode, res.body).toBe(200)
    expect(res.headers['cache-control']).toBe('private, no-store')
    const v = res.json<Record<string, unknown>>()
    expect(v).toMatchObject({
      reference: e.reference,
      number: e.number,
      version: 1,
      status: 'current',
      issuerName: 'Handyhub LLC',
      subtotalCents: 127_500,
      reduction: null,
      totalCents: 127_500,
      // 20% of $1,275.00, over $1,000.00 (FACT-DEPOSIT-RULE), as stored at publishing.
      deposit: { state: 'required', amountCents: 25_500 },
      paymentTerm: 'due_on_receipt',
      exclusions: ['Synthetic: moving furniture'],
      document: null,
      testMark: true,
      actions: { requestChanges: true, decline: true, requestUpdate: false },
      freshVerification: true,
      responses: [],
    })
    expect(v['lines']).toEqual([
      expect.objectContaining({ kind: 'base', quantity: '2', unitPriceCents: 1250, amountCents: 2500 }),
      expect.objectContaining({ kind: 'base', quantity: '1', unitPriceCents: 125_000, amountCents: 125_000 }),
      expect.objectContaining({ kind: 'add_on', quantity: '3', unitPriceCents: 1999, amountCents: 5997 }),
    ])
    // T24: no internal cost, note, preparer or staff field, by name or by value.
    expect(keysOf(v).filter(forbiddenForCustomer)).toEqual([])
    expect(res.body).not.toContain(INTERNAL_NOTE)
    expect(res.body).not.toContain(staff.estimator.userId)
    expect(res.body).not.toContain('materialCost')
  })

  it('[HH-EST-13] terms v1.0 pinned but not approved: shown as not in effect, and approval is refused', async () => {
    const e = await published()
    const v = (await customerGet(base(e), await customerCookie(e))).json<{
      terms: unknown
      approval: unknown
    }>()
    expect(v.terms).toEqual({ documentId: 'estimate-terms-1', state: 'not_in_effect' })
    // TSK-0057: approval exists now, and is refused while the terms are not in effect.
    expect(v.approval).toMatchObject({
      available: false,
      reasons: ['terms_not_in_effect'],
      current: null,
      approved: null,
    })
  })

  it('[RULE-NO-INVENTED-FACTS] terms this software holds no wording for, or a hash that differs, are NOT CONFIGURED', async () => {
    const synthetic = await published(TEST_TERMS)
    const a = (await customerGet(base(synthetic), await customerCookie(synthetic))).json<{
      terms: unknown
      approval: { reasons: string[] }
    }>()
    expect(a.terms).toEqual({ documentId: 'test-estimate-terms-1', state: 'not_configured' })
    expect(a.approval.reasons).toEqual(['terms_not_configured'])

    // The v1.0 ID recorded with another content hash: its wording is never shown for it.
    const altered = await published({ ...V1_RECORDED, contentSha256: 'f'.repeat(64) })
    const b = (await customerGet(base(altered), await customerCookie(altered))).json<{ terms: unknown }>()
    expect(b.terms).toEqual({ documentId: 'estimate-terms-1', state: 'not_configured' })
  })

  it('[T19][HH-PORT-01] another project, its estimate number, a draft or an unknown version: the same NOT_FOUND', async () => {
    const a = await published()
    const b = await published()
    const cookieA = await customerCookie(a)
    // B's estimate through A's project, and B's project through A's session.
    expect((await customerGet(base({ reference: a.reference, number: b.number }), cookieA)).statusCode).toBe(404)
    expect((await customerGet(base(b), cookieA)).statusCode).toBe(404)
    expect((await customerGet(`/api/v1/customer/projects/${b.reference}/documents`, cookieA)).statusCode).toBe(404)
    expect((await customerGet(base(a, 2), cookieA)).statusCode).toBe(404)
    // A revision being drafted never reaches the customer.
    const revised = await staffWrite('estimator', 'POST', `/api/v1/staff/estimate-versions/${a.versionId}/revise`, {})
    expect(revised.statusCode, revised.body).toBeLessThan(300)
    expect((await customerGet(base(a, 2), cookieA)).statusCode).toBe(404)
    // A write on B's estimate through A's session is not found either, and records nothing.
    const refused = await customerPost(`${base(b)}/decline`, cookieA, {})
    expect(refused.statusCode).toBe(404)
    expect(await responsesOf(b.versionId)).toEqual([])
    expect((await versionRow(b.versionId)).state).toBe('published')
    // Without a session: 401.
    expect((await app.inject({ method: 'GET', url: base(a) })).statusCode).toBe(401)
  })
})

describe('[HH-EST-09][T33] Request Changes and Decline keep history; silence never accepts', () => {
  it('Request Changes records the message, keeps the version and opens one staff item; a retry records it once', async () => {
    const e = await published()
    const cookie = await customerCookie(e)
    const before = await versionRow(e.versionId)
    const message = 'Synthetic request: please quote the trim without paint.'
    const k = key('changes')
    const res = await customerPost(`${base(e)}/request-changes`, cookie, { message }, k)
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json()).toMatchObject({
      reference: e.reference,
      number: e.number,
      version: 1,
      kind: 'changes_requested',
      status: 'current',
    })
    // The same answer again (a double click or a lost reply): the stored answer, nothing recorded twice.
    const replay = await customerPost(`${base(e)}/request-changes`, cookie, { message }, k)
    expect(replay.statusCode).toBe(201)
    expect(replay.headers['idempotent-replayed']).toBe('true')

    // The version is unchanged: still published, same row version.
    const after = await versionRow(e.versionId)
    expect({ state: after.state, row_version: after.row_version }).toEqual({
      state: 'published',
      row_version: before.row_version,
    })
    const rows = await responsesOf(e.versionId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      kind: 'changes_requested',
      message,
      version_state: 'published',
      contact_ref: e.contactId,
      project_id: e.projectId,
    })
    expect(rows[0]?.customer_session_id).toEqual(expect.any(String))

    // One staff follow-up item, linked to the version's screen.
    const items = await itemOf(e.versionId)
    expect(items).toEqual([
      expect.objectContaining({
        reason: 'estimate_changes_requested',
        subject_type: 'estimate_version',
        subject_status: 'published',
        reference: e.reference,
        resolved_at: null,
      }),
    ])
    const queue = await staffGet('estimator', `/api/v1/staff/queue?reference=${e.reference}`)
    expect(queue.statusCode).toBe(200)
    expect(queue.body).toContain(`/estimates/${e.versionId}`)

    // The staff estimate view lists the customer's words; the audit keeps what happened, never the words.
    const sv = await staffView(e.versionId)
    expect(sv.lifecycle.customerResponses).toEqual([
      { kind: 'changes_requested', version: 1, at: expect.any(String), message },
    ])
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'actor_kind', 'summary'])
      .where('target_id', '=', e.versionId)
      .where('action', '=', 'estimate.request_changes')
      .execute()
    expect(audit).toEqual([
      expect.objectContaining({
        actor_kind: 'customer',
        summary: expect.objectContaining({ kind: 'changes_requested', from: 'published', to: 'published' }),
      }),
    ])
    expect(JSON.stringify(audit)).not.toContain('Synthetic request')

    // The customer sees their own answer in the history; the version is still the current offer.
    const v = (await customerGet(base(e), cookie)).json<{ status: string; responses: unknown[] }>()
    expect(v.status).toBe('current')
    expect(v.responses).toEqual([{ kind: 'changes_requested', version: 1, at: expect.any(String), message }])
  })

  it('a message is required; an empty one is refused and nothing is recorded', async () => {
    const e = await published()
    const cookie = await customerCookie(e)
    expect((await customerPost(`${base(e)}/request-changes`, cookie, { message: '' })).statusCode).toBe(400)
    expect((await customerPost(`${base(e)}/request-changes`, cookie, { message: '   ' })).statusCode).toBe(400)
    expect(await responsesOf(e.versionId)).toEqual([])
  })

  it('[HH-ID-07] a verification older than the freshness window is refused with its reason; nothing is written', async () => {
    const e = await published()
    // verification.limits: fresh for 15 minutes (migration 0010).
    const stale = await customerCookie(e, new Date(Date.now() - 20 * 60_000))
    for (const [path, body] of [
      ['request-changes', { message: 'Synthetic stale request.' }],
      ['decline', {}],
    ] as const) {
      const res = await customerPost(`${base(e)}/${path}`, stale, body)
      expect(res.statusCode, path).toBe(403)
      expect(res.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors).toEqual([
        expect.objectContaining({ field: 'verification', code: 'FRESH_VERIFICATION_REQUIRED' }),
      ])
    }
    expect(await responsesOf(e.versionId)).toEqual([])
    expect((await versionRow(e.versionId)).state).toBe('published')
    // Reading still works, and says the verification is not fresh.
    const v = (await customerGet(base(e), stale)).json<{ freshVerification: boolean }>()
    expect(v.freshVerification).toBe(false)
  })

  it('Decline moves the version to declined with the optional reason, once; every record is kept', async () => {
    const e = await published()
    const cookie = await customerCookie(e)
    const res = await customerPost(`${base(e)}/decline`, cookie, { reason: 'Synthetic: chose to wait.' })
    expect(res.statusCode, res.body).toBe(201)
    expect(res.json()).toMatchObject({ kind: 'declined', status: 'declined' })
    expect((await versionRow(e.versionId)).state).toBe('declined')
    expect(await itemOf(e.versionId)).toEqual([
      expect.objectContaining({ reason: 'estimate_declined', subject_status: 'declined', resolved_at: null }),
    ])
    // Declining again, or asking for changes on a declined version: refused with its status; nothing more recorded.
    const again = await customerPost(`${base(e)}/decline`, cookie, {})
    expect(again.statusCode).toBe(409)
    expect(again.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors).toEqual([
      expect.objectContaining({ code: 'VERSION_DECLINED' }),
    ])
    expect((await customerPost(`${base(e)}/request-changes`, cookie, { message: 'x' })).statusCode).toBe(409)
    expect(await responsesOf(e.versionId)).toHaveLength(1)
    // The documents list says declined; the version and its lines are all still there.
    const docs = (await customerGet(`/api/v1/customer/projects/${e.reference}/documents`, cookie)).json<{
      estimates: { status: string }[]
    }>()
    expect(docs.estimates.map((x) => x.status)).toEqual(['declined'])
    const v = (await customerGet(base(e), cookie)).json<{ status: string; lines: unknown[]; actions: unknown }>()
    expect(v.status).toBe('declined')
    expect(v.lines).toHaveLength(3)
    expect(v.actions).toEqual({ requestChanges: false, decline: false, requestUpdate: false })
    // A decline without a reason is fine too (another estimate).
    const other = await published()
    expect((await customerPost(`${base(other)}/decline`, await customerCookie(other), {})).statusCode).toBe(201)
    expect((await responsesOf(other.versionId))[0]).toMatchObject({ kind: 'declined', message: null })
  })

  it('the history is append-only: the database refuses any change or deletion of a response', async () => {
    const e = await published()
    await customerPost(`${base(e)}/request-changes`, await customerCookie(e), { message: 'Synthetic: keep me.' })
    await expect(
      sql`UPDATE estimating.customer_responses SET message = 'rewritten' WHERE version_id = ${e.versionId}`.execute(
        t.db,
      ),
    ).rejects.toThrow(/append-only/)
    await expect(
      sql`DELETE FROM estimating.customer_responses WHERE version_id = ${e.versionId}`.execute(t.db),
    ).rejects.toThrow(/append-only/)
    // A decline can only be written with the version's own move to declined.
    await expect(
      sql`INSERT INTO estimating.customer_responses (project_id, estimate_id, version_id, kind, version_state, contact_ref)
          SELECT project_id, estimate_id, id, 'declined', 'published', 'synthetic' FROM estimating.estimate_versions
          WHERE id = ${e.versionId}`.execute(t.db),
    ).rejects.toThrow(/decline is recorded with/)
  })

  it('[T33] no response, retry or timeout accepts: only the explicit approval POST approves, and an expired version only asks for an update', async () => {
    // TSK-0057: the one route that approves is the approval transaction's POST (estimate-approval.test.ts); none of
    // the response routes holds estimate.approve.
    expect(
      MODULES.flatMap((m) => m.routes)
        .filter((r) => r.permission === 'estimate.approve')
        .map((r) => [r.method, r.operationId]),
    ).toEqual([['POST', 'approveEstimate']])
    const e = await published()
    const cookie = await customerCookie(e)
    await customerPost(`${base(e)}/request-changes`, cookie, { message: 'Synthetic: any news?' })
    // Time passes with no answer from the customer: the version expires; it is never accepted.
    await sql`UPDATE estimating.estimate_versions SET state = 'expired', state_changed_at = now(),
              row_version = row_version + 1 WHERE id = ${e.versionId}`.execute(t.db)
    const v = (await customerGet(base(e), cookie)).json<{
      status: string
      actions: unknown
      approval: { reasons: string[]; current: unknown }
    }>()
    expect(v.status).toBe('expired')
    expect(v.actions).toEqual({ requestChanges: false, decline: false, requestUpdate: true })
    expect(v.approval).toMatchObject({ current: null })
    expect(v.approval.reasons).toContain('expired')
    expect((await customerPost(`${base(e)}/decline`, cookie, {})).statusCode).toBe(409)
    const update = await customerPost(`${base(e)}/request-update`, cookie, {})
    expect(update.statusCode, update.body).toBe(201)
    expect(update.json()).toMatchObject({ kind: 'update_requested', status: 'expired' })
    expect((await versionRow(e.versionId)).state).toBe('expired')
    const accepted = await t.db
      .selectFrom('estimating.estimate_versions')
      .select('id')
      .where('state', '=', 'accepted')
      .execute()
    expect(accepted).toEqual([])
    expect(await itemOf(e.versionId)).toEqual([
      expect.objectContaining({ reason: 'estimate_update_requested', resolved_at: null }),
    ])
  })

  it('publishing a revised version answers the request: its staff item resolves and the old version is superseded', async () => {
    const e = await published()
    const cookie = await customerCookie(e)
    await customerPost(`${base(e)}/request-changes`, cookie, { message: 'Synthetic: lower the paint line.' })
    const revised = await staffWrite('estimator', 'POST', `/api/v1/staff/estimate-versions/${e.versionId}/revise`, {})
    expect(revised.statusCode, revised.body).toBeLessThan(300)
    const next = revised.json<{ versionId: string; rowVersion: number }>()
    const pub = await staffWrite(
      'estimator',
      'POST',
      `/api/v1/staff/estimate-versions/${next.versionId}/publish`,
      {},
      next.rowVersion,
    )
    expect(pub.statusCode, pub.body).toBe(200)
    expect(await itemOf(e.versionId)).toEqual([expect.objectContaining({ resolution: 'revised' })])
    const v1 = (await customerGet(base(e), cookie)).json<{ status: string; approval: { current: unknown } }>()
    expect(v1.status).toBe('superseded')
    expect(v1.approval.current).toEqual({ number: e.number, version: 2 })
    const docs = (await customerGet(`/api/v1/customer/projects/${e.reference}/documents`, cookie)).json<{
      estimates: { version: number; status: string }[]
    }>()
    expect(docs.estimates.map((x) => [x.version, x.status])).toEqual([
      [2, 'current'],
      [1, 'superseded'],
    ])
    // The customer's answer on version 1 stays in the history of version 2's estimate.
    const v2 = (await customerGet(base(e, 2), cookie)).json<{ responses: { version: number }[] }>()
    expect(v2.responses.map((r) => r.version)).toEqual([1])
  })

  it('[FACT-AUTOMATIC-MESSAGES] the staff notice goes to the responsible staff member, and stays NOT CONFIGURED', async () => {
    const p = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
    const e = await published()
    const res = await customerPost(`${base(e)}/decline`, await customerCookie(e), { reason: 'Synthetic: no thanks.' })
    expect(res.statusCode).toBe(201)
    const worker = createWorker({
      db: t.db,
      registry: createAutomationRegistry(
        estimateResponseNoticeAutomations({
          providers: { email: p.email, sms: null },
          staffAppUrl: 'https://staff.example.test',
        }),
      ),
    })
    await worker.runOnce()
    const responseId = (await responsesOf(e.versionId))[0]?.id as string
    const deliveries = await t.db
      .selectFrom('platform.message_deliveries')
      .select([
        'message_key',
        'channel',
        'audience',
        'state',
        'error_code',
        'recipient_kind',
        'recipient_id',
        'project_id',
      ])
      .where('subject_key', '=', `estimate_customer_response:${responseId}`)
      .execute()
    // No request is assigned, so the estimator who prepared the version is told. No wording is approved for the
    // notice yet: the delivery is recorded as not configured, never as sent. TSK-0049: the delivery records its
    // project; a staff notice never carries the project's customer reply token.
    expect(deliveries).toEqual([
      {
        message_key: 'staff_notice.estimate_declined',
        channel: 'email',
        audience: 'staff',
        state: 'failed',
        error_code: 'template_not_configured',
        recipient_kind: 'staff_user',
        recipient_id: staff.estimator.userId,
        project_id: e.projectId,
      },
    ])
    expect(p.fakes.email?.sent ?? []).toEqual([])
  })
})
