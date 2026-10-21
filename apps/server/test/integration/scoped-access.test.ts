// Scoped data access and customer projections against PostgreSQL 16 (TSK-0037; HH-DATA-01, HH-ARC-04, HH-PORT-01,
// HH-DATA-07, HH-TEST-02, T19, T24, T57, T68, RULE-SERVER-AUTHZ). Every staff member, customer, request, note, photo
// and key here is synthetic (RULE-SYNTHETIC-DATA).
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { dataScope, type Actor, type StaffRole } from '@handyhub/policy'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import {
  findProject,
  findRequest,
  forbiddenForCustomer,
  requestPhotos,
  scopedProjectReferences,
} from '../../src/modules/records/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { testConfig } from '../fixtures/env.js'

const ROLES: readonly StaffRole[] = ['owner', 'office', 'estimator', 'worker']
const pw = ['synthetic', 'scoped', 'passphrase', '37'].join(' ')
const NOTE = 'SYNTHETIC-INTERNAL-NOTE-0037: gate is sticky, staff only.'

let t: TestDatabase
let app: FastifyInstance
const staff = {} as Record<StaffRole, { id: string; cookie: string; csrf: string }>

type Project = { reference: string; requestId: string; projectId: string; contactId: string }
let A: Project
let B: Project
let C: Project
/** Photos of A by who uploaded them and their visibility class. */
const photosA = {} as Record<'customer' | 'internal' | 'shared' | 'restricted', string>
let photoB = ''

let ip = 10
async function submit(email: string): Promise<Project> {
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': `synthetic-scoped-${randomUUID()}`, 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic scoped-access project: a small drywall dent.',
      property: { street: '37 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
      estimatePreference: 'let_handyhub_decide',
      contact: { fullName: 'Synthetic Scoped Customer', email, phone: '(502) 555-0137', preferredChannel: 'email' },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  const reference = res.json<{ reference: string }>().reference
  const r = await t.db
    .selectFrom('intake.requests')
    .select(['id', 'project_id', 'contact_id'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
  return { reference, requestId: r.id, projectId: r.project_id, contactId: r.contact_id }
}

/** One stored photo row on a request (the object itself is never read here). */
async function photo(p: Project, uploader: 'customer' | 'staff', n: number): Promise<string> {
  const cap = randomUUID()
  await t.db
    .insertInto('intake.upload_capabilities')
    .values({
      id: cap,
      token_hash: createHash('sha256').update(randomBytes(32)).digest('hex'),
      scope: 'request',
      request_id: p.requestId,
      expires_at: new Date(Date.now() + 3_600_000),
    })
    .execute()
  const id = randomUUID()
  await t.db
    .insertInto('intake.photos')
    .values({
      id,
      capability_id: cap,
      request_id: p.requestId,
      project_id: p.projectId,
      object_key: `requests/photos/synthetic-scoped-${n}`,
      content_type: 'image/png',
      byte_size: 1000 + n,
      sha256: createHash('sha256').update(`synthetic-${n}`).digest('hex'),
      state: 'ready',
      uploader_kind: uploader,
    })
    .execute()
  return id
}

async function customerCookie(contactRef: string, projectIds: string[]) {
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, { contactRef, via: 'grant', projectIds, verifiedAt: new Date() }),
  )
  return `__Host-hh_customer=${s.token}`
}
/**
 * TSK-0036: an account session for an account of `owner`'s contact whose active links name `linked` (code-evidenced
 * links as enrollment writes them; synthetic evidence). The session itself names no project: on every request it
 * opens what the account's active links name. Returns the cookie and the link IDs by project.
 */
async function accountCookie(owner: Project, linked: Project[]) {
  return withTx(t.db, async (tx) => {
    const now = new Date()
    const email = `account-${randomUUID().slice(0, 8)}@example.test`
    const codeId = randomUUID()
    await tx
      .insertInto('identity.verification_codes')
      .values({
        id: codeId,
        purpose: 'account_sign_in',
        channel: 'email',
        destination: email,
        subject_ref: 'synthetic-scoped-account',
        nonce: randomBytes(16).toString('hex'),
        code_digest: createHash('sha256').update(codeId).digest('hex'),
        max_attempts: 1,
        expires_at: new Date(now.getTime() + 600_000),
        request_id: 'synthetic-scoped-account',
        created_at: now,
      })
      .execute()
    const accountId = randomUUID()
    const customerOf = async (p: Project) =>
      (
        await tx
          .selectFrom('crm.projects')
          .select('customer_id')
          .where('id', '=', p.projectId)
          .executeTakeFirstOrThrow()
      ).customer_id
    await tx
      .insertInto('identity.customer_accounts')
      .values({
        id: accountId,
        sign_in_email: email,
        email_verified_at: now,
        customer_id: await customerOf(owner),
        contact_id: owner.contactId,
        enrolled_via: 'receipt_offer',
        created_at: now,
      })
      .execute()
    const links: Record<string, string> = {}
    // Linked one after another, in the order given (the session lists them in link order).
    for (const [i, p] of linked.entries()) {
      links[p.projectId] = randomUUID()
      await tx
        .insertInto('identity.customer_identity_links')
        .values({
          id: links[p.projectId] as string,
          account_id: accountId,
          customer_id: await customerOf(p),
          contact_id: p.contactId,
          project_id: p.projectId,
          request_id: p.requestId,
          authority: 'owner',
          evidence: 'receipt_code',
          evidence_channel: 'email',
          evidence_code_id: codeId,
          state: 'active',
          decided_by: `customer_account:${accountId}`,
          decided_at: new Date(now.getTime() - (linked.length - i) * 1000),
        })
        .execute()
    }
    const s = await startCustomerSession(tx, {
      contactRef: `customer_account:${accountId}`,
      via: 'account',
      projectIds: [],
      verifiedAt: now,
      account: { id: accountId, signInChannel: 'email' },
    })
    return { cookie: `__Host-hh_customer=${s.token}`, links }
  })
}
const get = (url: string, cookie?: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: cookie ? { cookie } : {} })
const strip = (body: string) => body.replace(/"requestId":"[^"]+"/, '')
const securityEvents = (projectId: string) =>
  t.db
    .selectFrom('platform.audit_events')
    .select(['actor_kind', 'actor_id', 'result', 'reason', 'summary'])
    .where('action', '=', 'security.scope_denied')
    .where('target_id', '=', projectId)
    .orderBy('seq')
    .execute()

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: t.db, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw)
  for (const role of ROLES) {
    const id = await withTx(t.db, async (tx) => {
      const user = await createStaffUser(tx, {
        email: `${role}-scoped@example.test`,
        displayName: `Synthetic Scoped ${role}`,
        locale: 'en',
        role,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      return user.id
    })
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/staff/auth/sign-in',
      payload: { email: `${role}-scoped@example.test`, password: pw },
    })
    expect(res.statusCode).toBe(200)
    const cookie = String(res.headers['set-cookie']).split(';')[0] as string
    const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
    staff[role] = { id, cookie, csrf: session.json<{ csrfToken: string }>().csrfToken }
  }
  A = await submit('scoped-a@example.test')
  B = await submit('scoped-b@example.test')
  C = await submit('scoped-c@example.test')
  photosA.customer = await photo(A, 'customer', 1)
  photosA.internal = await photo(A, 'staff', 2)
  photosA.shared = await photo(A, 'staff', 3)
  photosA.restricted = await photo(A, 'staff', 4)
  photoB = await photo(B, 'customer', 5)
  // The share and the restriction are later steps on a photo that started internal.
  await t.db
    .updateTable('intake.photos')
    .set({ visibility: 'customer_shared' })
    .where('id', '=', photosA.shared)
    .execute()
  await t.db
    .updateTable('intake.photos')
    .set({ visibility: 'restricted_incident' })
    .where('id', '=', photosA.restricted)
    .execute()
  // Internal handling on A: a staff note and a responsible staff member.
  const note = await app.inject({
    method: 'POST',
    url: `/api/v1/staff/requests/${A.requestId}/notes`,
    headers: { cookie: staff.owner.cookie, 'x-csrf-token': staff.owner.csrf, 'idempotency-key': 'synthetic-note-0037' },
    payload: { body: NOTE },
  })
  expect(note.statusCode).toBe(201)
  await t.db
    .updateTable('intake.requests')
    .set({ responsible_staff_id: staff.office.id })
    .where('id', '=', A.requestId)
    .execute()
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

describe('project B is unreachable from project A’s session (TSK-0037, HH-DATA-01, HH-PORT-01, T19)', () => {
  it('[T19][HH-DATA-01][HH-PORT-01] every read of B by reference, ID or child ID is the same NOT_FOUND as a missing record, logged as a security event', async () => {
    const cookie = await customerCookie(A.contactId, [A.projectId])
    expect((await get(`/customer/projects/${A.reference}`, cookie)).statusCode).toBe(200)
    expect((await get(`/customer/requests/${A.requestId}/photos`, cookie)).statusCode).toBe(200)
    const missing = await get('/customer/projects/HH-00000000', cookie)
    const missingRequest = await get(`/customer/requests/${randomUUID()}/photos`, cookie)
    const altered = [
      await get(`/customer/projects/${B.reference}`, cookie),
      await get(`/customer/projects/${B.projectId}`, cookie),
      await get(`/customer/requests/${B.requestId}/photos`, cookie),
      // A's own request ID cannot be swapped for B's project and back: the chain is the request's own project.
      await get(`/customer/requests/${B.projectId}/photos`, cookie),
    ]
    for (const res of [...altered, missing, missingRequest]) {
      expect(res.statusCode).toBe(404)
      expect(res.json().error.code).toBe('NOT_FOUND')
      expect(res.body).not.toContain(B.reference)
      expect(res.body).not.toContain(photoB)
    }
    for (const res of altered) expect(strip(res.body)).toBe(strip(missing.body))
    // The two existing records of B asked for are security events; nothing names the request or its contents.
    const events = await securityEvents(B.projectId)
    expect(events.map((e) => [e.actor_kind, e.actor_id, e.result, e.reason])).toEqual([
      ['customer', A.contactId, 'denied', 'outside_scope'],
      ['customer', A.contactId, 'denied', 'outside_scope'],
    ])
    expect(events.map((e) => (e.summary as { operation: string }).operation)).toEqual([
      'getCustomerProject',
      'listCustomerRequestPhotos',
    ])
    expect(JSON.stringify(events)).not.toContain(B.reference)
    // The session lists only its own project.
    expect((await get('/customer/access/session', cookie)).json()).toEqual({ projects: [{ reference: A.reference }] })
  })

  it('[T19][HH-TEST-02] a guest without a session, and a guest asking for B’s photos, get the neutral refusal and a security event', async () => {
    expect((await get(`/customer/projects/${B.reference}`)).statusCode).toBe(401)
    const before = (await securityEvents(B.projectId)).length
    const res = await get(`/customer/requests/${B.requestId}/photos`)
    expect(res.statusCode).toBe(404)
    expect(strip(res.body)).toBe(strip((await get(`/customer/requests/${randomUUID()}/photos`)).body))
    const events = await securityEvents(B.projectId)
    expect(events).toHaveLength(before + 1)
    expect(events.at(-1)?.actor_kind).toBe('guest')
  })

  it('[T19][HH-DATA-01] a guest’s upload capability for one draft cannot remove B’s photo by ID; nothing changes', async () => {
    const draft = await app.inject({
      method: 'POST',
      url: '/api/v1/public/request-drafts',
      headers: { 'x-forwarded-for': '198.51.100.200' },
    })
    expect(draft.statusCode).toBe(201)
    const capability = draft.json<{ capability: string }>().capability
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/public/request-drafts/photos/${photoB}`,
      headers: { 'upload-capability': capability, 'x-forwarded-for': '198.51.100.200' },
    })
    expect(res.statusCode).toBe(404)
    const row = await t.db
      .selectFrom('intake.photos')
      .select('state')
      .where('id', '=', photoB)
      .executeTakeFirstOrThrow()
    expect(row.state).toBe('ready')
  })

  it('[HH-PORT-01][HH-DATA-01] an account customer reaches exactly the linked projects, never another', async () => {
    // TSK-0036: an account session opens what the account's active links name (here A and C).
    const { cookie } = await accountCookie(A, [A, C])
    expect((await get('/customer/access/session', cookie)).json()).toEqual({
      projects: [{ reference: A.reference }, { reference: C.reference }],
    })
    expect((await get(`/customer/projects/${C.reference}`, cookie)).statusCode).toBe(200)
    expect((await get(`/customer/projects/${B.reference}`, cookie)).statusCode).toBe(404)
    // The TSK-0038 projects list and Overview read the same scope.
    const listed = (await get('/customer/projects', cookie)).json<{ projects: { reference: string }[] }>()
    expect(listed.projects.map((p) => p.reference).sort()).toEqual([A.reference, C.reference].sort())
    expect((await get(`/customer/projects/${C.reference}/overview`, cookie)).statusCode).toBe(200)
    expect((await get(`/customer/projects/${B.reference}/overview`, cookie)).statusCode).toBe(404)
  })

  it('[HH-ID-10][HH-DATA-01] an account session re-reads its active links on every request: a revoked link opens nothing', async () => {
    const { cookie, links } = await accountCookie(A, [A, C])
    expect((await get(`/customer/projects/${C.reference}/overview`, cookie)).statusCode).toBe(200)
    await t.db
      .updateTable('identity.customer_identity_links')
      .set({ state: 'revoked', revoked_at: new Date(), revoke_reason: 'corrected_link', revoked_by: 'test' })
      .where('id', '=', links[C.projectId] as string)
      .execute()
    // The same session, the next request: C is gone everywhere, the same NOT_FOUND as a missing project.
    expect((await get('/customer/access/session', cookie)).json()).toEqual({ projects: [{ reference: A.reference }] })
    const listed = (await get('/customer/projects', cookie)).json<{ projects: { reference: string }[] }>()
    expect(listed.projects.map((p) => p.reference)).toEqual([A.reference])
    // The TSK-0039 workspace tabs too.
    const tabs = ['messages', 'documents', 'photos', 'appointments', 'payments']
    expect((await get(`/customer/projects/${A.reference}/photos`, cookie)).statusCode).toBe(200)
    for (const url of [
      `/customer/projects/${C.reference}`,
      `/customer/projects/${C.reference}/overview`,
      ...tabs.map((tab) => `/customer/projects/${C.reference}/${tab}`),
    ])
      expect((await get(url, cookie)).statusCode, url).toBe(404)
    expect((await get(`/customer/requests/${C.requestId}/photos`, cookie)).statusCode).toBe(404)
    expect((await get(`/customer/projects/${A.reference}/overview`, cookie)).statusCode).toBe(200)
  })

  it('[HH-DATA-01] the repository helpers find nothing outside the scope they are given', async () => {
    const now = new Date()
    const customer: Actor = {
      kind: 'customer',
      contactId: A.contactId,
      projectAccess: [{ projectId: A.projectId, via: 'grant' }],
      freshVerification: true,
    }
    const scope = dataScope(customer, 'request.view', now)
    expect(await findProject(t.db, scope, { reference: A.reference })).toEqual({
      id: A.projectId,
      reference: A.reference,
    })
    expect(await findProject(t.db, scope, { reference: B.reference })).toBeNull()
    expect(await findProject(t.db, scope, { id: B.projectId })).toBeNull()
    expect(await findRequest(t.db, scope, B.requestId)).toBeNull()
    expect(await requestPhotos(t.db, scope, B.requestId, 'customer')).toBeNull()
    expect(await scopedProjectReferences(t.db, scope)).toEqual([A.reference])
    // An expired access is no access.
    const expired = dataScope(
      {
        ...customer,
        projectAccess: [{ projectId: A.projectId, via: 'grant', expiresAt: new Date(now.getTime() - 1) }],
      },
      'request.view',
      now,
    )
    expect(await findProject(t.db, expired, { reference: A.reference })).toBeNull()
    // A guest, the AI module and a worker without request.view reach nothing; the Owner reaches both projects.
    const staffActor = (role: StaffRole): Actor => ({
      kind: 'staff',
      userId: staff[role].id,
      roles: [role],
      capabilities: [],
      status: 'active',
      freshAuth: false,
    })
    for (const actor of [{ kind: 'guest' } as Actor, { kind: 'ai' } as Actor, staffActor('worker')])
      expect(await findRequest(t.db, dataScope(actor, 'request.view', now), A.requestId)).toBeNull()
    const owner = dataScope(staffActor('owner'), 'request.view', now)
    expect((await findRequest(t.db, owner, B.requestId))?.projectId).toBe(B.projectId)
    // The Owner's `all` scope is never a dump of every project.
    expect(await scopedProjectReferences(t.db, owner)).toEqual([])
  })
})

describe('customers only ever receive customer projections (TSK-0037, HH-ARC-04, HH-PORT-01, T24)', () => {
  /** Every key anywhere in a JSON body. */
  const keys = (v: unknown, out: string[] = []): string[] => {
    if (Array.isArray(v)) for (const x of v) keys(x, out)
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) {
        out.push(k)
        keys(x, out)
      }
    return out
  }

  it('[T24][HH-ARC-04][HH-PORT-01] no customer response holds an internal field or value, even with internal records on the project', async () => {
    const cookie = await customerCookie(A.contactId, [A.projectId])
    const stored = await t.db
      .selectFrom('intake.photos')
      .select(['id', 'object_key', 'sha256'])
      .where('project_id', '=', A.projectId)
      .execute()
    // A served photo's signed URL names its own object; an internal photo's key and every hash appear nowhere.
    const internalKeys = stored.filter((p) => p.id === photosA.internal || p.id === photosA.restricted)
    const responses = [
      await get('/customer/access/session', cookie),
      await get(`/customer/projects/${A.reference}`, cookie),
      await get(`/customer/requests/${A.requestId}/photos`, cookie),
    ]
    for (const res of responses) {
      expect(res.statusCode).toBe(200)
      expect(keys(res.json()).filter(forbiddenForCustomer)).toEqual([])
      for (const secret of [
        NOTE,
        staff.office.id,
        staff.owner.id,
        'Synthetic Scoped',
        A.projectId,
        A.contactId,
        photosA.internal,
        photosA.restricted,
        ...internalKeys.map((p) => p.object_key),
        ...stored.map((p) => p.sha256),
      ])
        expect(res.body).not.toContain(secret)
    }
    // The opened project is exactly the PROJECT_GLANCE allow-list.
    expect(Object.keys(responses[1]?.json() ?? {}).sort()).toEqual(
      ['notSure', 'reference', 'requestState', 'services', 'submittedAt'].sort(),
    )
  })
})

describe('media is internal by default; customers see their own and shared photos only (TSK-0037, HH-DATA-07, T57)', () => {
  it('[T57][HH-DATA-07][HH-PORT-01] the customer sees their upload and the shared photo; internal and restricted ones are not there', async () => {
    const cookie = await customerCookie(A.contactId, [A.projectId])
    const res = await get(`/customer/requests/${A.requestId}/photos`, cookie)
    const ids = res.json<{ photos: { id: string }[] }>().photos.map((p) => p.id)
    expect(ids.sort()).toEqual([photosA.customer, photosA.shared].sort())
    const staffView = await get(`/staff/requests/${A.requestId}/photos`, staff.owner.cookie)
    expect(
      staffView
        .json<{ photos: { id: string }[] }>()
        .photos.map((p) => p.id)
        .sort(),
    ).toEqual(Object.values(photosA).sort())
  })

  it('[HH-DATA-07][ENT-Photo] a new photo is internal unless it says otherwise; a staff photo starts internal; the uploader never changes', async () => {
    const id = await photo(A, 'staff', 6)
    const row = await t.db
      .selectFrom('intake.photos')
      .select(['visibility', 'uploader_kind'])
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
    // TSK-0044 (HH-STAFF-05): the internal class is named internal_operational.
    expect(row).toEqual({ visibility: 'internal_operational', uploader_kind: 'staff' })
    const cap = await t.db
      .selectFrom('intake.photos')
      .select('capability_id')
      .where('id', '=', id)
      .executeTakeFirstOrThrow()
    await expect(
      t.db
        .insertInto('intake.photos')
        .values({
          id: randomUUID(),
          capability_id: cap.capability_id,
          request_id: A.requestId,
          project_id: A.projectId,
          object_key: 'requests/photos/synthetic-scoped-7',
          content_type: 'image/png',
          byte_size: 1007,
          sha256: createHash('sha256').update('synthetic-7').digest('hex'),
          uploader_kind: 'staff',
          visibility: 'customer_shared',
        })
        .execute(),
    ).rejects.toThrow(/PHOTO_INTERNAL_FIRST/)
    await expect(
      t.db.updateTable('intake.photos').set({ uploader_kind: 'customer' }).where('id', '=', id).execute(),
    ).rejects.toThrow(/PHOTO_UPLOADER/)
  })
})

describe('each staff role and altered IDs (TSK-0037, HH-TEST-02, HH-STAFF-04, T68)', () => {
  it('[T68][HH-TEST-02] Owner, Office and Estimator read records in scope; an altered ID is NOT_FOUND on every read', async () => {
    for (const role of ['owner', 'office', 'estimator'] as const) {
      const cookie = staff[role].cookie
      expect((await get(`/staff/requests/${A.requestId}`, cookie)).statusCode, role).toBe(200)
      expect((await get(`/staff/requests/${A.requestId}/summary`, cookie)).statusCode, role).toBe(200)
      const list = await get('/staff/requests?limit=50', cookie)
      expect(list.statusCode, role).toBe(200)
      const refs = list.json<{ items: { reference: string }[] }>().items.map((i) => i.reference)
      expect(refs, role).toEqual(expect.arrayContaining([A.reference, B.reference, C.reference]))
      for (const path of ['', '/summary', '/photos']) {
        const res = await get(`/staff/requests/${randomUUID()}${path}`, cookie)
        expect([role, path, res.statusCode]).toEqual([role, path, 404])
        // A project ID in place of a request ID names no request.
        expect((await get(`/staff/requests/${A.projectId}${path}`, cookie)).statusCode).toBe(404)
      }
    }
  })

  it('[T68][HH-TEST-02] a Worker (no request.view) is refused existing requests and finds no altered ID; nothing is listed', async () => {
    const cookie = staff.worker.cookie
    expect((await get(`/staff/requests/${A.requestId}`, cookie)).statusCode).toBe(403)
    expect((await get(`/staff/requests/${A.requestId}/photos`, cookie)).statusCode).toBe(403)
    expect((await get('/staff/requests', cookie)).statusCode).toBe(403)
    expect((await get(`/staff/requests/${randomUUID()}`, cookie)).statusCode).toBe(404)
  })

  it('[T68][HH-TEST-02] a write with an altered ID is NOT_FOUND for every role and changes nothing', async () => {
    const notes = async () => (await t.db.selectFrom('intake.request_notes').select('id').execute()).length
    const before = await notes()
    for (const role of ROLES) {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/staff/requests/${randomUUID()}/notes`,
        headers: {
          cookie: staff[role].cookie,
          'x-csrf-token': staff[role].csrf,
          'idempotency-key': `synthetic-altered-${role}-0037`,
        },
        payload: { body: 'Synthetic note on an altered ID.' },
      })
      expect([role, res.statusCode]).toEqual([role, 404])
    }
    expect(await notes()).toBe(before)
  })

  it('[T68][HH-ARC-06] a staff session opens no customer record, and a customer session no staff record', async () => {
    expect((await get(`/customer/projects/${A.reference}`, staff.owner.cookie)).statusCode).toBe(401)
    const customer = await customerCookie(A.contactId, [A.projectId])
    expect((await get(`/staff/requests/${A.requestId}`, customer)).statusCode).toBe(401)
    expect((await get(`/staff/requests/${A.requestId}/photos`, customer)).statusCode).toBe(401)
  })
})
