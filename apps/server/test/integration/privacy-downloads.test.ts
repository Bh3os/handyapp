// Customer downloads of retained, customer-visible documents against PostgreSQL 16 (TSK-0100; HH-PRIV-06, HH-SEC-05,
// HH-PORT-10, T68, ENT-Document, OWN-DEC-113, RULE-SERVER-AUTHZ). Staff, customers, documents and amounts are
// synthetic (RULE-SYNTHETIC-DATA); objects live in the in-memory fake storage, whose signed links can be checked.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { estimateDocumentProcessAutomation } from '../../src/modules/estimates/index.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { revokeGrantSessions, startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { forbiddenForCustomer } from '../../src/modules/records/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { PDF, pdf } from '../fixtures/documents.js'
import { testConfig } from '../fixtures/env.js'

const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'download', 'code', 'key', 'for', 'tests', 'only', '0100'].join('-'),
})
const pw = (n: number) => ['synthetic', 'privacy', 'download', 'passphrase', String(n)].join(' ')
const PEOPLE = ['owner', 'estimator'] as const
type Person = (typeof PEOPLE)[number]

let t: TestDatabase
let app: FastifyInstance
const storage = new FakeObjectStorage()
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>

let seq = 0
const key = (what: string) => `synthetic-download-${what}-${String(++seq).padStart(6, '0')}-${randomUUID().slice(0, 8)}`
const staffGet = (who: Person, url: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie: cookies[who] } })
function staffWrite(who: Person, method: 'POST' | 'PUT', url: string, payload: unknown, version?: number) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    payload: payload as object,
    headers: {
      cookie: cookies[who],
      'x-csrf-token': csrf[who],
      'idempotency-key': key('write'),
      ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    },
  })
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, storage, codeKey: KEY } })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: `${p}-download@example.test`,
        displayName: `Synthetic download ${p}`,
        locale: 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
    }
  })
  for (const p of PEOPLE) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      headers: { 'x-forwarded-for': '198.51.100.197' },
      payload: { email: `${p}-download@example.test`, password: pw(1) },
    })
    expect(res.statusCode, res.body).toBe(200)
    cookies[p] = String(res.headers['set-cookie']).split(';')[0] as string
    csrf[p] = res.json().csrfToken as string
  }
  await recordPolicyVersion(t.db, {
    key: 'legal.estimate_terms',
    value: {
      documentId: 'test-estimate-terms-1',
      status: 'draft',
      attorneyReviewed: false,
      preparedOn: '2026-10-21',
      contentSha256: '0'.repeat(64),
    } as never,
    sourceIds: ['TEST-SYNTHETIC'],
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

type Project = { requestId: string; projectId: string; reference: string; contactId: string; grantId: string }
let ip = 10
async function readyRequest(): Promise<Project> {
  const n = ++seq
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic download project.',
      answers: [],
      property: {
        street: `${n} Synthetic Download Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Synthetic Download Customer',
        email: `download-${n}-${randomUUID().slice(0, 6)}@example.test`,
        phone: '(502) 555-0197',
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
    .select(['r.id', 'r.project_id', 'r.state_version', 'r.contact_id', 'g.id as grant_id'])
    .where('r.reference', '=', reference)
    .executeTakeFirstOrThrow()
  expect(
    (await staffWrite('owner', 'PUT', `/staff/requests/${row.id}/qualification`, { checks: ALL_OK }, 0)).statusCode,
  ).toBe(200)
  const moved = await staffWrite(
    'owner',
    'POST',
    `/staff/requests/${row.id}/actions/online-estimate`,
    { workPackages: ['SVC-DW-01'] },
    row.state_version,
  )
  expect(moved.statusCode, moved.body).toBe(200)
  return { requestId: row.id, projectId: row.project_id, reference, contactId: row.contact_id, grantId: row.grant_id }
}

async function saveLines(versionId: string) {
  const v = (await staffGet('estimator', `/staff/estimate-versions/${versionId}`)).json<{
    rowVersion: number
    workPackages: { id: string }[]
  }>()
  const saved = await staffWrite(
    'estimator',
    'PUT',
    `/staff/estimate-versions/${versionId}/draft`,
    {
      lines: [
        {
          kind: 'base',
          workPackageId: v.workPackages[0]?.id,
          description: 'Synthetic drywall repair',
          quantity: '1',
          unit: 'each',
          unitPriceCents: 45_000,
        },
      ],
      texts: {},
    },
    v.rowVersion,
  )
  expect(saved.statusCode, saved.body).toBe(200)
  return saved.json<{ rowVersion: number }>().rowVersion
}

async function publish(versionId: string) {
  const v = (await staffGet('estimator', `/staff/estimate-versions/${versionId}`)).json<{ rowVersion: number }>()
  const res = await staffWrite('estimator', 'POST', `/staff/estimate-versions/${versionId}/publish`, {}, v.rowVersion)
  expect(res.statusCode, res.body).toBe(200)
}

/** A written estimate: created, drafted and (unless `draft`) published. */
async function writtenEstimate(p: Project, draft = false) {
  const created = await staffWrite('estimator', 'POST', `/staff/projects/${p.projectId}/estimates`, {})
  expect(created.statusCode, created.body).toBe(201)
  const e = created.json<{ estimateId: string; number: string; versionId: string }>()
  await saveLines(e.versionId)
  if (!draft) await publish(e.versionId)
  return e
}

/** An uploaded estimate: the PDF original processed, the agreement confirmed, then published. */
async function uploadedEstimate(p: Project) {
  const created = await staffWrite('estimator', 'POST', `/staff/projects/${p.projectId}/uploaded-estimates`, {})
  expect(created.statusCode, created.body).toBe(201)
  const e = created.json<{ estimateId: string; number: string; versionId: string }>()
  const rowVersion = await saveLines(e.versionId)
  const sent = await app.inject({
    method: 'POST',
    url: `/api/v1/staff/estimate-versions/${e.versionId}/documents/original`,
    payload: pdf({ text: 'Synthetic uploaded estimate document' }),
    headers: {
      cookie: cookies.estimator,
      'x-csrf-token': csrf.estimator,
      'content-type': PDF,
      'if-match': `"${rowVersion}"`,
    },
  })
  expect(sent.statusCode, sent.body).toBe(201)
  await createWorker({
    db: t.db,
    registry: createAutomationRegistry([estimateDocumentProcessAutomation(storage)]),
  }).runOnce()
  const v = (await staffGet('estimator', `/staff/estimate-versions/${e.versionId}`)).json<{ rowVersion: number }>()
  const confirmed = await staffWrite(
    'estimator',
    'PUT',
    `/staff/estimate-versions/${e.versionId}/agreement`,
    { confirmed: true },
    v.rowVersion,
  )
  expect(confirmed.statusCode, confirmed.body).toBe(200)
  await publish(e.versionId)
  return e
}

async function cookieFor(p: Project) {
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, {
      contactRef: p.contactId,
      via: 'grant',
      projectIds: [p.projectId],
      verifiedAt: new Date(),
      grantId: p.grantId,
    }),
  )
  return `__Host-hh_customer=${s.token}`
}
const downloads = (p: { reference: string }, number: string, version = 1) =>
  `/api/v1/customer/projects/${p.reference}/estimates/${number}/versions/${version}/documents`
const customerGet = (url: string, cookie?: string) =>
  app.inject({ method: 'GET', url, headers: cookie ? { cookie } : {} })

type Downloads = {
  reference: string
  number: string
  version: number
  documents: { kind: string; contentType: string; byteSize: number; url: string; expiresAt: string }[]
}

describe('customers download their retained, customer-visible documents (TSK-0100, HH-PRIV-06, T68)', () => {
  it('[HH-PRIV-06][T68][HH-SEC-05] the customer PDF as published, by a short-lived link issued after the checks', async () => {
    const a = await readyRequest()
    const e = await writtenEstimate(a)
    const cookie = await cookieFor(a)
    const before = Date.now()
    const res = await customerGet(downloads(a, e.number), cookie)
    expect(res.statusCode, res.body).toBe(200)
    const body = res.json<Downloads>()
    expect(body).toMatchObject({ reference: a.reference, number: e.number, version: 1 })
    expect(body.documents).toHaveLength(1)
    const [doc] = body.documents
    expect(doc).toMatchObject({ kind: 'estimate_pdf', contentType: 'application/pdf' })
    const row = await t.db
      .selectFrom('estimating.estimate_versions')
      .select(['customer_pdf_object_key', 'customer_pdf_byte_size'])
      .where('id', '=', e.versionId)
      .executeTakeFirstOrThrow()
    expect(doc?.byteSize).toBe(row.customer_pdf_byte_size)
    // The link names exactly the stored PDF and expires within minutes; no storage key or internal field is sent.
    expect(storage.resolveSignedUrl(doc?.url as string)).toEqual({
      ok: true,
      method: 'GET',
      key: row.customer_pdf_object_key,
    })
    const expires = new Date(doc?.expiresAt as string).getTime()
    expect(expires - before).toBeLessThanOrEqual(5 * 60_000 + 5_000)
    expect(expires - before).toBeGreaterThan(0)
    const fields = JSON.stringify(Object.keys(doc ?? {}))
    expect(Object.keys(doc ?? {}).filter(forbiddenForCustomer)).toEqual([])
    expect(fields).not.toContain('objectKey')
  })

  it('[HH-PRIV-06][T68] downloads are limited to the customer’s own retained, customer-visible documents', async () => {
    const a = await readyRequest()
    const b = await readyRequest()
    const ea = await writtenEstimate(a)
    const draft = await writtenEstimate(a, true)
    const eb = await writtenEstimate(b)
    const cookieA = await cookieFor(a)
    const cookieB = await cookieFor(b)
    // Another customer's estimate, by its own project or through this one: the same NOT_FOUND.
    expect((await customerGet(downloads(b, eb.number), cookieA)).statusCode).toBe(404)
    expect((await customerGet(downloads(a, eb.number), cookieA)).statusCode).toBe(404)
    expect((await customerGet(downloads(a, ea.number), cookieB)).statusCode).toBe(404)
    // A draft never reached the customer; an unknown version does not exist; no session is unauthenticated.
    expect((await customerGet(downloads(a, draft.number), cookieA)).statusCode).toBe(404)
    expect((await customerGet(downloads(a, ea.number, 2), cookieA)).statusCode).toBe(404)
    expect((await customerGet(downloads(a, ea.number))).statusCode).toBe(401)
    // A staff session is not a customer session.
    expect((await customerGet(downloads(a, ea.number), cookies.owner)).statusCode).toBeGreaterThanOrEqual(400)
    // A revoked project link opens nothing (revoking a grant ends the sessions started from it, TSK-0034).
    await withTx(t.db, async (tx) => {
      await tx
        .updateTable('identity.project_access_grants')
        .set({ revoked_at: new Date(), revoke_reason: 'staff_revoked', revoked_by: 'test' })
        .where('id', '=', a.grantId)
        .execute()
      await revokeGrantSessions(tx, [a.grantId])
    })
    expect((await customerGet(downloads(a, ea.number), cookieA)).statusCode).toBeGreaterThanOrEqual(400)
    // Customer B still gets their own.
    expect((await customerGet(downloads(b, eb.number), cookieB)).statusCode).toBe(200)
  })

  it('[HH-PRIV-06][HH-EST-11] an uploaded estimate: the customer document beside the PDF, never the private original', async () => {
    const a = await readyRequest()
    const e = await uploadedEstimate(a)
    const res = await customerGet(downloads(a, e.number), await cookieFor(a))
    expect(res.statusCode, res.body).toBe(200)
    const body = res.json<Downloads>()
    expect(body.documents.map((d) => d.kind)).toEqual(['estimate_pdf', 'estimate_document'])
    const docs = await t.db
      .selectFrom('estimating.estimate_documents')
      .select(['role', 'object_key', 'visibility'])
      .where('version_id', '=', e.versionId)
      .execute()
    const served = body.documents.map((d) => {
      const r = storage.resolveSignedUrl(d.url)
      return r.ok ? r.key : null
    })
    const customerDoc = docs.find((d) => d.role === 'customer_pdf' && d.visibility === 'customer')
    expect(served).toContain(customerDoc?.object_key)
    for (const d of docs.filter((x) => x.visibility !== 'customer')) expect(served).not.toContain(d.object_key)
  })
})
