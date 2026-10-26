// Privacy request refinements against PostgreSQL 16 (TSK-0152; OWN-DEC-201 I1 to I5, HH-PRIV-03, HH-PRIV-05,
// HH-PRIV-01, HH-PRIV-07, T68, T72, ENT-PrivacyRequest, ENT-AuditEvent, ENT-Payment, ENT-RetentionReview,
// RULE-SERVER-AUTHZ, RULE-HUMAN-REVIEW). Staff, customers, requests, amounts and names are synthetic
// (RULE-SYNTHETIC-DATA); nothing reaches a provider. A second server built as production shares the throwaway
// database, to show the Delete actions waiting for the reviewed table-to-retention mapping. Estimate terms are a
// synthetic in-effect fixture of this throwaway database only, never a statement that the owner approved any wording.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { UNRECORDED_DELETION_CHECKS } from '../../src/modules/privacy/index.js'
import { mappingDigest, mappingRows, runRetentionScan } from '../../src/modules/retention/index.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'privacy', 'refinements', 'key', 'for', 'tests', 'only', '0152'].join('-'),
})
const pw = (n: number) => ['synthetic', 'privacy', 'refinements', 'passphrase', String(n)].join(' ')
const PEOPLE = ['owner', 'office', 'estimator'] as const
type Person = (typeof PEOPLE)[number]
const email = (p: Person) => `${p}-refinements@example.test`

let t: TestDatabase
let app: FastifyInstance
let prod: FastifyInstance
const storage = new FakeObjectStorage()
const ids = {} as Record<Person, string>
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>

const YEAR_MS = 365.25 * 24 * 3600 * 1000
const later = (years: number, days = 0) => new Date(Date.now() + years * YEAR_MS + days * 24 * 3600 * 1000)

let seq = 0
const key = (what: string) => `synthetic-refine-${what}-${String(++seq).padStart(6, '0')}-${randomUUID().slice(0, 8)}`
const get = (who: Person, url: string, target = app) =>
  target.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie: cookies[who] } })
function write(
  who: Person,
  url: string,
  payload: unknown,
  options: { version?: number; method?: 'POST' | 'PUT'; target?: FastifyInstance } = {},
) {
  return (options.target ?? app).inject({
    method: options.method ?? 'POST',
    url: `/api/v1${url}`,
    payload: payload as object,
    headers: {
      cookie: cookies[who],
      'x-csrf-token': csrf[who],
      'idempotency-key': key('write'),
      'x-forwarded-for': '198.51.100.152',
      ...(options.version === undefined ? {} : { 'if-match': `"${options.version}"` }),
    },
  })
}
const codes = (res: { json: () => unknown }) =>
  (res.json() as { error: { fieldErrors: { code: string }[] } }).error.fieldErrors.map((f) => f.code)

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, storage, codeKey: KEY } })
  prod = await buildApp({
    config: { ...testConfig({ TRUST_PROXY_HOPS: '1' }), env: 'production' },
    api: { db: t.db, storage, codeKey: KEY },
  })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: email(p),
        displayName: `Synthetic refinements ${p}`,
        locale: 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
  })
  for (const p of PEOPLE) {
    const res = await signInWithMfa(app, {
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      headers: { 'x-forwarded-for': '198.51.100.152' },
      payload: { email: email(p), password: pw(1) },
    })
    expect(res.statusCode, res.body).toBe(200)
    cookies[p] = String(res.headers['set-cookie']).split(';')[0] as string
    csrf[p] = res.json().csrfToken as string
  }
  await recordPolicyVersion(t.db, {
    key: 'legal.estimate_terms',
    value: {
      documentId: ESTIMATE_TERMS.documentId,
      status: 'approved',
      attorneyReviewed: true,
      preparedOn: ESTIMATE_TERMS.preparedOn,
      contentSha256: ESTIMATE_TERMS.contentSha256,
    } as never,
    sourceIds: ['TEST-SYNTHETIC'],
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
})
afterAll(async () => {
  await prod?.close()
  await app?.close()
  await t?.drop()
})

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

type Project = {
  requestId: string
  projectId: string
  reference: string
  contactId: string
  customerId: string
  grantId: string
  version: number
  email: string
}
let ip = 10
async function readyRequest(): Promise<Project> {
  const n = ++seq
  const mail = `refine-customer-${n}-${randomUUID().slice(0, 6)}@example.test`
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: `Synthetic refinements project ${n}.`,
      answers: [],
      property: {
        street: `${n} Synthetic Refinement Way`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: `Synthetic Refinement Customer ${n}`,
        email: mail,
        phone: '(502) 555-0152',
        preferredChannel: 'email',
      },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  const { reference } = res.json<{ reference: string }>()
  const row = await t.db
    .selectFrom('intake.requests as r')
    .innerJoin('identity.project_access_grants as g', 'g.request_id', 'r.id')
    .select(['r.id', 'r.project_id', 'r.state_version', 'r.contact_id', 'r.customer_id', 'g.id as grant_id'])
    .where('r.reference', '=', reference)
    .executeTakeFirstOrThrow()
  const r = {
    requestId: row.id,
    projectId: row.project_id,
    reference,
    contactId: row.contact_id,
    customerId: row.customer_id,
    grantId: row.grant_id,
    version: row.state_version,
    email: mail,
  }
  expect(
    (
      await write(
        'owner',
        `/staff/requests/${r.requestId}/qualification`,
        { checks: ALL_OK },
        { version: 0, method: 'PUT' },
      )
    ).statusCode,
  ).toBe(200)
  const moved = await write(
    'owner',
    `/staff/requests/${r.requestId}/actions/online-estimate`,
    { workPackages: ['SVC-DW-01'] },
    { version: r.version },
  )
  expect(moved.statusCode, moved.body).toBe(200)
  return r
}

type Estimate = Project & { estimateId: string; number: string; versionId: string }

async function publish(versionId: string): Promise<number> {
  const view = await get('estimator', `/staff/estimate-versions/${versionId}`)
  const v = view.json<{ rowVersion: number; workPackages: { id: string }[] }>()
  const saved = await write(
    'estimator',
    `/staff/estimate-versions/${versionId}/draft`,
    {
      lines: [
        {
          kind: 'base',
          workPackageId: v.workPackages[0]?.id,
          description: 'Patch the synthetic hole',
          quantity: '1',
          unit: 'each',
          unitPriceCents: 12_345,
        },
      ],
      texts: {},
    },
    { version: v.rowVersion, method: 'PUT' },
  )
  expect(saved.statusCode, saved.body).toBe(200)
  const published = await write(
    'estimator',
    `/staff/estimate-versions/${versionId}/publish`,
    {},
    { version: saved.json<{ rowVersion: number }>().rowVersion },
  )
  expect(published.statusCode, published.body).toBe(200)
  return published.json<{ rowVersion: number }>().rowVersion
}

/** An estimate published and then withdrawn: never accepted. */
async function withdrawnEstimate(project?: Project): Promise<Estimate> {
  const r = project ?? (await readyRequest())
  const created = await write('estimator', `/staff/projects/${r.projectId}/estimates`, {})
  expect(created.statusCode, created.body).toBe(201)
  const { estimateId, number, versionId } = created.json<{ estimateId: string; number: string; versionId: string }>()
  const rowVersion = await publish(versionId)
  const withdrawn = await write(
    'estimator',
    `/staff/estimate-versions/${versionId}/withdraw`,
    { reason: 'Synthetic: sent to the wrong project.' },
    { version: rowVersion },
  )
  expect(withdrawn.statusCode, withdrawn.body).toBe(200)
  return { ...r, estimateId, number, versionId }
}

/** An estimate published and approved by the customer: a job with its deposit requirement. */
async function approvedEstimate(project?: Project): Promise<Estimate & { jobId: string }> {
  const r = project ?? (await readyRequest())
  const created = await write('estimator', `/staff/projects/${r.projectId}/estimates`, {})
  expect(created.statusCode, created.body).toBe(201)
  const { estimateId, number, versionId } = created.json<{ estimateId: string; number: string; versionId: string }>()
  await publish(versionId)
  const cookie = await customerCookie(r)
  const base = `/customer/projects/${r.reference}/estimates/${number}/versions/1`
  const d = (await customerGet(base, cookie)).json<{
    totalCents: number
    approval: {
      contentDigest: string
      selection: { options: number[]; totalCents: number; deposit: { amountCents: number | null } } | null
    }
  }>()
  const res = await customerPost(`${base}/approve`, cookie, {
    contentDigest: d.approval.contentDigest,
    options: d.approval.selection?.options ?? [],
    totalCents: d.approval.selection?.totalCents ?? d.totalCents,
    depositCents: d.approval.selection?.deposit.amountCents ?? null,
    termsDocumentId: ESTIMATE_TERMS.documentId,
    termsSha256: ESTIMATE_TERMS.contentSha256,
    acceptTerms: true,
    fullName: 'Synthetic Refinement Customer',
  })
  expect(res.statusCode, res.body).toBe(201)
  const job = await t.db
    .selectFrom('work.jobs as j')
    .innerJoin('estimating.approvals as a', 'a.id', 'j.approval_id')
    .select('j.id')
    .where('a.estimate_id', '=', estimateId)
    .executeTakeFirstOrThrow()
  return { ...r, estimateId, number, versionId, jobId: job.id }
}

const scan = (now: Date) => withTx(t.db, (tx) => runRetentionScan(tx, { now, requestId: `req-${key('scan')}` }))
async function entryFor(recordId: string) {
  return t.db
    .selectFrom('privacy.retention_reviews')
    .select(['id', 'record_ref'])
    .where('record_id', '=', recordId)
    .executeTakeFirstOrThrow()
}

async function customerCookie(p: Pick<Project, 'contactId' | 'projectId' | 'grantId'>, verifiedAt = new Date()) {
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, {
      contactRef: p.contactId,
      via: 'grant',
      projectIds: [p.projectId],
      verifiedAt,
      grantId: p.grantId,
    }),
  )
  return `__Host-hh_customer=${s.token}`
}
let client = 0
function customerPost(url: string, cookie: string, payload: unknown) {
  return app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    payload: payload as object,
    headers: {
      cookie,
      'idempotency-key': key('customer'),
      'x-forwarded-for': `2001:db8:152:${++client}::1`,
      'user-agent': 'SyntheticBrowser/1.0 (test)',
    },
  })
}
const customerGet = (url: string, cookie: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie } })
const PR = (p: { reference: string }, rest = '') => `/customer/projects/${p.reference}/privacy-requests${rest}`

const ALL_CHECKS = [...UNRECORDED_DELETION_CHECKS]

/** A customer's request of one kind, submitted and reviewed: its id and version. */
async function reviewed(p: Project, kind: 'export' | 'correction' | 'deletion', body: unknown = {}) {
  const cookie = await customerCookie(p)
  const submitted = await customerPost(PR(p, `/${kind}`), cookie, body)
  expect(submitted.statusCode, submitted.body).toBe(201)
  const row = await t.db
    .selectFrom('privacy.privacy_requests')
    .select(['id', 'version'])
    .where('reference', '=', submitted.json<{ reference: string }>().reference)
    .executeTakeFirstOrThrow()
  const started = await write('owner', `/staff/privacy-requests/${row.id}/review`, {}, { version: row.version })
  expect(started.statusCode, started.body).toBe(200)
  return { id: row.id, version: started.json<{ version: number }>().version, cookie }
}

async function staleOwnerSignIn<T>(fn: () => Promise<T>): Promise<T> {
  await sql`UPDATE identity.staff_sessions SET authenticated_at = now() - interval '10 minutes'
             WHERE staff_user_id = ${ids.owner} AND revoked_at IS NULL`.execute(t.db)
  try {
    return await fn()
  } finally {
    await sql`UPDATE identity.staff_sessions SET authenticated_at = now()
               WHERE staff_user_id = ${ids.owner} AND revoked_at IS NULL`.execute(t.db)
  }
}

describe('I1: identity verification by risk, with a secure alternative (TSK-0152, OWN-DEC-201)', () => {
  it('[HH-PRIV-03][HH-PRIV-07] an export or a deletion is completed only once the Owner confirms the identity evidence', async () => {
    const p = await readyRequest()
    const r = await reviewed(p, 'export')
    const detail = (await get('owner', `/staff/privacy-requests/${r.id}`)).json<{
      identity: { risk: string; method: string; via: string; confirmedAt: string | null }
    }>()
    expect(detail.identity).toMatchObject({
      risk: 'elevated',
      method: 'fresh_session_code',
      via: 'link',
      confirmedAt: null,
    })
    const refused = await write(
      'owner',
      `/staff/privacy-requests/${r.id}/decision`,
      { decision: 'complete', reason: 'Synthetic: export prepared.' },
      { version: r.version },
    )
    expect(refused.statusCode).toBe(400)
    expect(codes(refused)).toEqual(['IDENTITY_NOT_CONFIRMED'])
    const done = await write(
      'owner',
      `/staff/privacy-requests/${r.id}/decision`,
      { decision: 'complete', reason: 'Synthetic: export prepared.', identityConfirmed: true },
      { version: r.version },
    )
    expect(done.statusCode, done.body).toBe(200)
    expect(done.json()).toMatchObject({
      state: 'completed',
      identity: { confirmedBy: 'Synthetic refinements owner', confirmedAt: expect.any(String) },
    })
    const row = await t.db
      .selectFrom('privacy.privacy_requests')
      .select(['identity_confirmed_by', 'identity_confirmed_at'])
      .where('id', '=', r.id)
      .executeTakeFirstOrThrow()
    expect(row.identity_confirmed_by).toBe(ids.owner)
    // Recorded once, with the decision: never changed afterwards.
    await expect(
      sql`UPDATE privacy.privacy_requests SET identity_confirmed_at = now() WHERE id = ${r.id}`.execute(t.db),
    ).rejects.toThrow()
    // Declining needs no confirmation.
    const other = await readyRequest()
    const d = await reviewed(other, 'deletion')
    const declined = await write(
      'owner',
      `/staff/privacy-requests/${d.id}/decision`,
      { decision: 'decline', reason: 'Synthetic: not the account holder.' },
      { version: d.version },
    )
    expect(declined.statusCode, declined.body).toBe(200)
  })

  it('[HH-PRIV-03] a correction is standard: the fresh code is enough', async () => {
    const p = await readyRequest()
    const r = await reviewed(p, 'correction', { details: 'Synthetic: my phone is wrong.' })
    const detail = (await get('owner', `/staff/privacy-requests/${r.id}`)).json<{ identity: { risk: string } }>()
    expect(detail.identity.risk).toBe('standard')
  })

  it('[HH-PRIV-03][RULE-SERVER-AUTHZ] the Owner records a request verified outside the portal; the person is named by a value on file', async () => {
    const p = await readyRequest()
    const body = {
      kind: 'export',
      project: p.reference,
      contact: p.email.toUpperCase(),
      check: 'call_to_phone_on_file',
      note: 'Synthetic: called back on the phone on file; the person confirmed the project.',
    }
    expect((await write('office', '/staff/privacy-requests', body)).statusCode).toBe(403)
    const stale = await staleOwnerSignIn(() => write('owner', '/staff/privacy-requests', body))
    expect(stale.statusCode).toBe(403)
    expect(stale.json()).toMatchObject({ error: { code: 'FRESH_AUTH_REQUIRED' } })
    const wrong = await write('owner', '/staff/privacy-requests', { ...body, contact: 'someone-else@example.test' })
    expect(wrong.statusCode).toBe(400)
    expect(codes(wrong)).toEqual(['CONTACT_NOT_ON_FILE'])
    const noProject = await write('owner', '/staff/privacy-requests', { ...body, project: 'HH-NOPE00' })
    expect(codes(noProject)).toEqual(['PROJECT_NOT_FOUND'])
    // Another project's contact is not this project's requester.
    const elsewhere = await readyRequest()
    expect(codes(await write('owner', '/staff/privacy-requests', { ...body, contact: elsewhere.email }))).toEqual([
      'CONTACT_NOT_ON_FILE',
    ])
    expect(
      await t.db.selectFrom('privacy.privacy_requests').select('id').where('project_id', '=', p.projectId).execute(),
    ).toEqual([])

    const recorded = await write('owner', '/staff/privacy-requests', body)
    expect(recorded.statusCode, recorded.body).toBe(201)
    const d = recorded.json<{
      id: string
      reference: string
      state: string
      identity: Record<string, unknown>
      deadlines: { acknowledgmentDueOn: string | null }
    }>()
    expect(d.state).toBe('received')
    expect(d.identity).toMatchObject({
      risk: 'elevated',
      method: 'staff_verified',
      via: 'owner',
      check: 'call_to_phone_on_file',
      note: body.note,
      recordedBy: 'Synthetic refinements owner',
    })
    // TSK-0136: the dates are counted as for a request made in the portal.
    expect(d.deadlines.acknowledgmentDueOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    const row = await t.db
      .selectFrom('privacy.privacy_requests')
      .select(['contact_id', 'session_id', 'identity_method', 'identity_recorded_by'])
      .where('id', '=', d.id)
      .executeTakeFirstOrThrow()
    expect(row).toMatchObject({
      contact_id: p.contactId,
      session_id: null,
      identity_method: 'staff_verified',
      identity_recorded_by: ids.owner,
    })
    // One open request of each kind per customer.
    expect(codes(await write('owner', '/staff/privacy-requests', body))).toEqual(['PRIVACY_REQUEST_OPEN'])
    // The person sees it in their project page once they have access again.
    const mine = (await customerGet(PR(p), await customerCookie(p))).json<{ requests: { reference: string }[] }>()
    expect(mine.requests.map((x) => x.reference)).toEqual([d.reference])
    // The note stays on the request; the audit keeps what happened, never the contact value or the note.
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['summary', 'step_up_used'])
      .where('action', '=', 'privacy.request_record')
      .where('target_id', '=', d.id)
      .executeTakeFirstOrThrow()
    expect(audit.step_up_used).toBe(true)
    expect(JSON.stringify(audit.summary)).not.toContain(p.email)
    expect(JSON.stringify(audit.summary)).not.toContain('called back')
    // The database keeps how the identity was verified, and only the Owner records it.
    await expect(
      sql`UPDATE privacy.privacy_requests SET identity_note = 'changed' WHERE id = ${d.id}`.execute(t.db),
    ).rejects.toThrow(/keeps how the identity was verified/)
    await expect(
      sql`INSERT INTO privacy.privacy_requests (kind, customer_id, contact_id, project_id, identity_method,
            identity_verified_at, identity_check, identity_note, identity_recorded_by, request_id)
          VALUES ('deletion', ${p.customerId}, ${p.contactId}, ${p.projectId}, 'staff_verified', now(),
            'photo_id_in_person', 'Synthetic', ${ids.office}, 'synthetic')`.execute(t.db),
    ).rejects.toThrow(/the Owner records/)
  })
})

describe('I2: the export holds the requester’s data found in audit entries (TSK-0152, OWN-DEC-201, T68)', () => {
  it('[HH-PRIV-03][T68] their own actions and the handling of their own requests, without summaries, reasons or staff names', async () => {
    const p = await readyRequest()
    // A third party of the same customer asks too: their entries are not the requester's.
    const r = await reviewed(p, 'export')
    const done = await write(
      'owner',
      `/staff/privacy-requests/${r.id}/decision`,
      { decision: 'complete', reason: 'Synthetic: secret staff reasoning 7Q.', identityConfirmed: true },
      { version: r.version },
    )
    expect(done.statusCode, done.body).toBe(200)
    const ref = done.json<{ reference: string }>().reference
    const res = await customerGet(PR(p, `/${ref}/export`), r.cookie)
    expect(res.statusCode, res.body).toBe(200)
    const data = res.json<{
      activity: { at: string; action: string; record: string; result: string; by: string }[]
      excluded: string[]
    }>()
    expect(data.activity).toContainEqual(
      expect.objectContaining({ action: 'privacy.request_submit', record: 'privacy_request', by: 'you' }),
    )
    expect(data.activity).toContainEqual(
      expect.objectContaining({ action: 'privacy.review_start', record: 'privacy_request', by: 'staff' }),
    )
    expect(data.activity).toContainEqual(
      expect.objectContaining({
        action: 'privacy.decide',
        record: 'privacy_request',
        by: 'staff',
        result: 'succeeded',
      }),
    )
    for (const a of data.activity) expect(Object.keys(a).sort()).toEqual(['action', 'at', 'by', 'record', 'result'])
    const text = JSON.stringify(data.activity)
    expect(text).not.toContain('secret staff reasoning')
    expect(text).not.toContain('Synthetic refinements owner')
    expect(text).not.toContain(ids.owner)
    // Staff handling of the request and its estimate are restricted internal records, left out.
    expect(data.activity.map((a) => a.action)).not.toContain('request.qualify')
    expect(data.excluded).toEqual(expect.arrayContaining(['audit_entry_details', 'restricted_audit_entries']))
    expect(data.excluded).not.toContain('audit_entries')
    // Another customer's actions never appear.
    const other = await readyRequest()
    await reviewed(other, 'deletion')
    const again = (await customerGet(PR(p, `/${ref}/export`), r.cookie)).json<{ activity: unknown[] }>()
    expect(again.activity).toHaveLength(data.activity.length)
  })
})

describe('I3: correction history (TSK-0152, OWN-DEC-201)', () => {
  it('[HH-PRIV-03][HH-PRIV-05] a correction keeps the record changes and the new entries beside protected records', async () => {
    const p = await readyRequest()
    const r = await reviewed(p, 'correction', { details: 'Synthetic: my phone and the invoice phone are wrong.' })
    // Nothing recorded yet: completing is refused.
    const early = await write(
      'owner',
      `/staff/privacy-requests/${r.id}/decision`,
      { decision: 'complete', reason: 'Synthetic: corrected.' },
      { version: r.version },
    )
    expect(early.statusCode).toBe(400)
    expect(codes(early)).toEqual(['CORRECTION_NOT_RECORDED'])
    // The contact is corrected in its own screen (its history keeps the values before and after).
    const edited = await write(
      'owner',
      `/staff/customers/${p.customerId}/contacts/${p.contactId}`,
      {
        fullName: 'Synthetic Refinement Customer',
        email: p.email,
        phone: '(502) 555-0153',
        preferredChannel: 'email',
        reason: 'Synthetic: privacy correction request.',
      },
      { version: 1, method: 'PUT' },
    )
    expect(edited.statusCode, edited.body).toBe(200)
    // A protected record is corrected by a new entry beside it.
    expect(
      (
        await write('office', `/staff/privacy-requests/${r.id}/corrections`, {
          recordKind: 'invoice',
          recordRef: 'INV-SYNTH-1',
          correction: 'Synthetic.',
        })
      ).statusCode,
    ).toBe(403)
    const entry = await write('owner', `/staff/privacy-requests/${r.id}/corrections`, {
      recordKind: 'invoice',
      recordRef: 'INV-SYNTH-1',
      correction: 'Synthetic: the phone on the issued invoice is outdated; the right one is on file.',
    })
    expect(entry.statusCode, entry.body).toBe(200)
    const d = entry.json<{
      version: number
      corrections: {
        changes: { record: string; fields: string[] }[]
        entries: { recordKind: string; recordRef: string; recordedBy: { name: string } }[]
      }
    }>()
    expect(d.corrections.changes).toEqual([
      expect.objectContaining({ record: 'contact', fields: expect.arrayContaining(['phone']) }),
    ])
    expect(JSON.stringify(d.corrections.changes)).not.toContain('555')
    expect(d.corrections.entries).toEqual([
      expect.objectContaining({
        recordKind: 'invoice',
        recordRef: 'INV-SYNTH-1',
        recordedBy: expect.objectContaining({ name: 'Synthetic refinements owner' }),
      }),
    ])
    // The entries are append-only.
    await expect(sql`UPDATE privacy.request_corrections SET correction = 'x'`.execute(t.db)).rejects.toThrow(
      /never changed or deleted/,
    )
    await expect(sql`DELETE FROM privacy.request_corrections`.execute(t.db)).rejects.toThrow(/never changed or deleted/)
    const completed = await write(
      'owner',
      `/staff/privacy-requests/${r.id}/decision`,
      { decision: 'complete', reason: 'Synthetic: corrected.' },
      { version: d.version },
    )
    expect(completed.statusCode, completed.body).toBe(200)
    // Once decided, no further correction is recorded on it.
    const after = await write('owner', `/staff/privacy-requests/${r.id}/corrections`, {
      recordKind: 'payment',
      recordRef: 'PAY-SYNTH-1',
      correction: 'Synthetic.',
    })
    expect(codes(after)).toEqual(['ALREADY_DECIDED'])
    // Only a correction request takes corrections.
    const other = await readyRequest()
    const exp = await reviewed(other, 'export')
    expect(
      codes(
        await write('owner', `/staff/privacy-requests/${exp.id}/corrections`, {
          recordKind: 'other',
          recordRef: 'X-1',
          correction: 'Synthetic.',
        }),
      ),
    ).toEqual(['NOT_A_CORRECTION'])
  })
})

describe('I4: accounting checks before deletion (TSK-0152, OWN-DEC-201)', () => {
  it('[HH-PRIV-05][HH-DATA-09] no recorded payment or invoice is none found; an unlinked discrepancy never blocks', async () => {
    const e = await withdrawnEstimate()
    // An open reconciliation item on the same project, not linked to the estimate (it has no approval).
    await t.db
      .insertInto('finance.reconciliation_items')
      .values({
        kind: 'unmatched_payment',
        source: 'bank',
        project_id: e.projectId,
        amount_cents: 1_000,
        description: 'Synthetic: a deposit nobody can match yet.',
        reported_by: ids.office,
      })
      .execute()
    await scan(later(2, 2))
    const entry = await entryFor(e.estimateId)
    const preview = (await get('owner', `/staff/retention-reviews/${entry.id}/deletion`)).json<{
      target: { blockers: string[]; checks: { check: string; result: string }[]; confirm: string[] }
    }>()
    expect(preview.target.blockers).toEqual([])
    for (const check of ['issued_invoices', 'payments', 'refunds', 'reconciliation_records', 'financial_discrepancies'])
      expect(preview.target.checks).toContainEqual({ check, result: 'none_found' })
    expect(preview.target.confirm).not.toContain('payments')
    expect(preview.target.confirm).not.toContain('issued_invoices')
    const deleted = await write('owner', `/staff/retention-reviews/${entry.id}/delete`, {
      reason: 'Synthetic: past its period.',
      confirmedChecks: ALL_CHECKS,
    })
    expect(deleted.statusCode, deleted.body).toBe(200)
  })

  it('[HH-PRIV-05][HH-PRIV-03] a linked discrepancy blocks and is escalated; a privacy deletion still deletes what is unrelated', async () => {
    // An unaccepted estimate on the project goes; the approved one stays as protected evidence.
    const lost = await withdrawnEstimate()
    const e = await approvedEstimate(lost)
    // A check received on the job, not yet cleared: the reconciliation queue lists it as pending.
    await t.db
      .insertInto('finance.payments')
      .values({
        project_id: e.projectId,
        job_id: e.jobId,
        method: 'check',
        payer_name: 'Synthetic Payer',
        reference: 'SYNTH-CHECK-1',
        amount_cents: 5_000,
        received_on: new Date().toISOString().slice(0, 10),
        collector_staff_id: ids.office,
        recorded_by: ids.office,
        state: 'received',
      })
      .execute()
    const r = await reviewed(e, 'deletion')
    const detail = (await get('owner', `/staff/privacy-requests/${r.id}`)).json<{
      plan: {
        checks: { check: string; result: string; count?: number }[]
        confirm: string[]
        deletable: { estimates: { reference: string }[] }
      }
    }>()
    expect(detail.plan.checks).toContainEqual({ check: 'financial_discrepancies', result: 'found', count: 1 })
    expect(detail.plan.checks).toContainEqual({ check: 'payments', result: 'found', count: 1 })
    expect(detail.plan.confirm).not.toContain('payments')
    expect(detail.plan.deletable.estimates.map((x) => x.reference)).toEqual([lost.number])
    const decided = await write(
      'owner',
      `/staff/privacy-requests/${r.id}/decision`,
      {
        decision: 'complete',
        reason: 'Synthetic: eligible data deleted.',
        confirmedChecks: ALL_CHECKS,
        closeAccess: false,
        identityConfirmed: true,
      },
      { version: r.version },
    )
    expect(decided.statusCode, decided.body).toBe(200)
    expect(decided.json()).toMatchObject({
      state: 'partially_completed',
      outcome: { deleted: [{ category: 'unaccepted_estimates', count: 1 }] },
    })
    // The approved estimate's own Delete is blocked by the discrepancy, besides its protected evidence.
    const { estimateTarget } = await import('../../src/modules/privacy/index.js')
    const target = await estimateTarget(t.db, e.estimateId)
    expect(target.blockers).toEqual(expect.arrayContaining(['protected_evidence', 'financial_discrepancy']))
    expect(target.checks).toContainEqual({ check: 'financial_discrepancies', result: 'found', count: 1 })
    // The discrepancy waits in the reconciliation queue for authorized review.
    const queue = (await get('owner', '/staff/reconciliation')).json<{
      records: { kind: string; projectReference: string }[]
    }>()
    expect(queue.records).toContainEqual(
      expect.objectContaining({ kind: 'pending_check', projectReference: e.reference }),
    )
  })
})

describe('I5: the reviewed table-to-retention mapping (TSK-0152, OWN-DEC-201)', () => {
  it('[HH-PRIV-01] the mapping, its digest and the live audit of this database', async () => {
    expect((await get('office', '/staff/retention-mapping')).statusCode).toBe(403)
    const res = await get('owner', '/staff/retention-mapping')
    expect(res.statusCode, res.body).toBe(200)
    const s = res.json<{
      digest: string
      tables: number
      environment: string
      productionDeletion: string
      live: { unannotated: string[]; missing: string[] }
      categories: { category: string; tables: string[] }[]
    }>()
    expect(s.digest).toBe(mappingDigest())
    expect(s.tables).toBe(mappingRows().length)
    expect(s.environment).toBe('ci')
    // Every table of the database is in the inventory, and every inventory table exists.
    expect(s.live).toEqual({ unannotated: [], missing: [] })
    expect(s.categories.find((c) => c.category === 'audit_log')?.tables).toContain('platform.audit_events')
  })

  it('[HH-PRIV-05][HH-PRIV-03][T72] in production nothing is deleted until a review confirmed by the CPA and the attorney', async () => {
    const e = await withdrawnEstimate()
    await scan(later(2, 2))
    const entry = await entryFor(e.estimateId)
    const status = (await get('owner', '/staff/retention-mapping', prod)).json<{
      environment: string
      productionDeletion: string
      digest: string
    }>()
    expect(status).toMatchObject({ environment: 'production', productionDeletion: 'disabled' })

    // Confirm Delete is refused with nothing deleted, and the refusal is audited.
    const refused = await write(
      'owner',
      `/staff/retention-reviews/${entry.id}/delete`,
      { reason: 'Synthetic: past its period.', confirmedChecks: ALL_CHECKS },
      { target: prod },
    )
    expect(refused.statusCode).toBe(409)
    expect(codes(refused)).toEqual(['MAPPING_NOT_REVIEWED'])
    expect(
      await t.db.selectFrom('estimating.estimates').select('id').where('id', '=', e.estimateId).executeTakeFirst(),
    ).toBeTruthy()
    const denied = await t.db
      .selectFrom('platform.audit_events')
      .select(['result', 'summary'])
      .where('action', '=', 'privacy.record_delete')
      .where('target_id', '=', entry.id)
      .executeTakeFirstOrThrow()
    expect(denied).toMatchObject({ result: 'denied', summary: { blockers: ['mapping_not_reviewed'] } })
    // The audit-retention delete waits too.
    const audits = await write(
      'owner',
      '/staff/audit-retention/delete',
      { fromSeq: '1', toSeq: '1', reason: 'Synthetic.', confirmedChecks: [] },
      { target: prod },
    )
    expect(audits.statusCode).toBe(409)
    expect(codes(audits)).toEqual(['MAPPING_NOT_REVIEWED'])
    // A privacy deletion request keeps its estimates (erasure not available here yet) and still closes access.
    const r = await reviewed(e, 'deletion')
    const decided = await write(
      'owner',
      `/staff/privacy-requests/${r.id}/decision`,
      {
        decision: 'complete',
        reason: 'Synthetic: close access; records wait for the mapping review.',
        confirmedChecks: ALL_CHECKS,
        closeAccess: true,
        identityConfirmed: true,
      },
      { version: r.version, target: prod },
    )
    expect(decided.statusCode, decided.body).toBe(200)
    expect(decided.json()).toMatchObject({
      state: 'partially_completed',
      outcome: {
        accessClosed: true,
        retained: expect.arrayContaining([
          expect.objectContaining({ category: 'unaccepted_estimates', reason: 'erasure_not_available', count: 1 }),
        ]),
      },
    })
    expect(
      await t.db.selectFrom('estimating.estimates').select('id').where('id', '=', e.estimateId).executeTakeFirst(),
    ).toBeTruthy()

    // Recording the review: the Owner only, with a fresh sign-in, of the mapping in force.
    const review = (over: Record<string, unknown> = {}) => ({
      digest: status.digest,
      cpaConfirmed: true,
      attorneyConfirmed: true,
      note: 'Synthetic: the mapping report was reviewed.',
      ...over,
    })
    expect((await write('office', '/staff/retention-mapping/reviews', review(), { target: prod })).statusCode).toBe(403)
    const stale = await staleOwnerSignIn(() =>
      write('owner', '/staff/retention-mapping/reviews', review(), { target: prod }),
    )
    expect(stale.statusCode).toBe(403)
    const other = await write('owner', '/staff/retention-mapping/reviews', review({ digest: 'f'.repeat(64) }), {
      target: prod,
    })
    expect(codes(other)).toEqual(['STALE_MAPPING'])
    // The Owner's own review without the CPA keeps deletion disabled.
    const partial = await write('owner', '/staff/retention-mapping/reviews', review({ cpaConfirmed: false }), {
      target: prod,
    })
    expect(partial.statusCode, partial.body).toBe(200)
    expect((await get('owner', '/staff/retention-mapping', prod)).json()).toMatchObject({
      productionDeletion: 'disabled',
      current: true,
    })
    expect(
      codes(
        await write(
          'owner',
          `/staff/retention-reviews/${entry.id}/delete`,
          { reason: 'Synthetic: past its period.', confirmedChecks: ALL_CHECKS },
          { target: prod },
        ),
      ),
    ).toEqual(['MAPPING_NOT_REVIEWED'])
    const full = await write('owner', '/staff/retention-mapping/reviews', review(), { target: prod })
    expect(full.statusCode, full.body).toBe(200)
    expect((await get('owner', '/staff/retention-mapping', prod)).json()).toMatchObject({
      productionDeletion: 'enabled',
      latest: { cpaConfirmed: true, attorneyConfirmed: true, recordedBy: { id: ids.owner } },
    })
    const deleted = await write(
      'owner',
      `/staff/retention-reviews/${entry.id}/delete`,
      { reason: 'Synthetic: past its period.', confirmedChecks: ALL_CHECKS },
      { target: prod },
    )
    expect(deleted.statusCode, deleted.body).toBe(200)
    // The reviews are append-only.
    await expect(sql`UPDATE privacy.mapping_reviews SET note = 'x'`.execute(t.db)).rejects.toThrow(
      /never changed or deleted/,
    )
    await expect(sql`DELETE FROM privacy.mapping_reviews`.execute(t.db)).rejects.toThrow(/never changed or deleted/)
  })
})
