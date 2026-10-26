// The customer workspace tabs against PostgreSQL 16 (TSK-0039; HH-PORT-09, HH-PORT-08, HH-PORT-01, HH-ARC-04, T04,
// T19, T23, T24, RULE-SERVER-AUTHZ, RULE-LANGUAGES). Every staff member, customer, request, photo and note here is
// synthetic (RULE-SYNTHETIC-DATA).
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const pw = ['synthetic', 'portal', 'tabs', 'passphrase', '39'].join(' ')
const NOTE = 'SYNTHETIC-INTERNAL-NOTE-0039: staff only.'
// Customer free text in the customer's own language (HH-PORT-08): kept exactly as written.
const SPANISH = 'Proyecto sintético: la pared del pasillo tiene un agujero pequeño. ¿Pueden repararla?'
const TABS = ['messages', 'documents', 'photos', 'appointments', 'payments'] as const
const OPERATIONS = [
  'getCustomerProjectMessages',
  'getCustomerProjectDocuments',
  'getCustomerProjectPhotos',
  'getCustomerProjectAppointments',
  'getCustomerProjectPayments',
]

let t: TestDatabase
let app: FastifyInstance
let staff = { id: '', cookie: '', csrf: '' }

type Project = { reference: string; requestId: string; projectId: string; contactId: string }
let ip = 60
async function submit(email: string, description = 'Synthetic portal tabs project: a scuffed door frame.') {
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': `synthetic-portal-tabs-${randomUUID()}`, 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description,
      property: { street: '39 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
      estimatePreference: 'let_handyhub_decide',
      contact: { fullName: 'Synthetic Tabs Customer', email, phone: '(502) 555-0139', preferredChannel: 'email' },
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
  return { reference, requestId: r.id, projectId: r.project_id, contactId: r.contact_id } satisfies Project
}

async function customerCookie(p: Project) {
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, {
      contactRef: p.contactId,
      via: 'grant',
      projectIds: [p.projectId],
      verifiedAt: new Date(),
    }),
  )
  return `__Host-hh_customer=${s.token}`
}
const get = (url: string, cookie?: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: cookie ? { cookie } : {} })

async function staffWrite(method: 'POST' | 'PUT', url: string, payload: unknown, version?: number) {
  const res = await app.inject({
    method,
    url: `/api/v1${url}`,
    payload: payload as object,
    headers: {
      cookie: staff.cookie,
      'x-csrf-token': staff.csrf,
      'idempotency-key': `synthetic-portal-tabs-write-${randomUUID()}`,
      ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    },
  })
  expect(res.statusCode, res.body).toBeLessThan(300)
  return res
}
async function act(p: Project, name: string, body: Record<string, unknown>) {
  const detail = await app.inject({
    method: 'GET',
    url: `/api/v1/staff/requests/${p.requestId}`,
    headers: { cookie: staff.cookie },
  })
  expect(detail.statusCode).toBe(200)
  return staffWrite(
    'POST',
    `/staff/requests/${p.requestId}/actions/${name}`,
    body,
    detail.json<{ version: number }>().version,
  )
}

/** One stored photo row on the project's request (the object itself is never read here). */
let photoN = 0
async function photo(
  p: Project,
  over: { uploader_kind: 'customer' | 'staff'; state?: 'ready' | 'quarantined' | 'rejected' | 'removed' },
) {
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
  const n = ++photoN
  const state = over.state ?? 'ready'
  await t.db
    .insertInto('intake.photos')
    .values({
      id,
      capability_id: cap,
      request_id: p.requestId,
      project_id: p.projectId,
      object_key: `requests/photos/synthetic-tabs-${n}`,
      content_type: 'image/png',
      byte_size: 1000 + n,
      sha256: createHash('sha256').update(`synthetic-tabs-${n}`).digest('hex'),
      state,
      rejection_reason: state === 'rejected' ? 'malformed' : null,
      uploader_kind: over.uploader_kind,
    })
    .execute()
  return id
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db } })
  const hash = await hashPassword(pw)
  const id = await withTx(t.db, async (tx) => {
    const user = await createStaffUser(tx, {
      email: 'owner-portal-tabs@example.test',
      displayName: 'Synthetic Tabs Owner',
      locale: 'en',
      role: 'owner',
      issuedBy: 'test',
    })
    await setPasswordHash(tx, user.id, hash)
    return user.id
  })
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email: 'owner-portal-tabs@example.test', password: pw },
  })
  expect(res.statusCode).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  staff = { id, cookie, csrf: session.json<{ csrfToken: string }>().csrfToken }
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

describe('the workspace tabs (TSK-0039, HH-PORT-09, OWN-DEC-106)', () => {
  it('[HH-PORT-09][T23][HH-ARC-10] each tab answers its truthful state for the session’s project, private and uncached', async () => {
    const p = await submit('portal-tabs-states@example.test')
    const cookie = await customerCookie(p)
    const before = Date.now()
    const answers: Record<string, unknown> = {}
    for (const tab of TABS) {
      const res = await get(`/customer/projects/${p.reference}/${tab}`, cookie)
      expect(res.statusCode, `${tab}: ${res.body}`).toBe(200)
      expect(res.headers['cache-control']).toBe('private, no-store')
      const body = res.json<{ reference: string; refreshedAt: string; refreshSeconds: number }>()
      expect(body.reference).toBe(p.reference)
      // portal.refresh (30 seconds, OWN-DEC-192 F7; version 2, migration 0135), the same interval as the Overview.
      expect(body.refreshSeconds).toBe(30)
      expect(Date.parse(body.refreshedAt)).toBeGreaterThanOrEqual(before - 1000)
      answers[tab] = Object.fromEntries(
        Object.entries(body).filter(([k]) => !['reference', 'refreshedAt', 'refreshSeconds'].includes(k)),
      )
    }
    // TSK-0150 (OWN-DEC-199): portal.messages.none.text and portal.documents.none.text. The request's automatic
    // notices are not in the Messages tab (only the conversation is), and the Documents tab lists estimates
    // (with the approval receipt) and invoices only; payment receipts are in Payments, and care notes nowhere yet.
    const notices = await t.db
      .selectFrom('platform.outbox_events')
      .select('type')
      .where('aggregate_id', 'in', [p.requestId, p.projectId])
      .execute()
    expect(notices.length).toBeGreaterThan(0)
    expect(answers).toEqual({
      // TSK-0050: the project conversation; nothing has been written on this project yet.
      messages: { messages: [] },
      documents: { state: 'none' },
      // TSK-0076: the customer's uploads and the photos staff shared, listed (none yet); links last linkSeconds.
      photos: { photos: { received: 0, processing: 0, failed: 0 }, yours: [], shared: [], linkSeconds: 300 },
      appointments: { state: 'none' },
      payments: { state: 'none' },
    })
  })

  it('[HH-PORT-09][HH-PORT-11][T24][HH-DATA-07] Photos counts and lists only the customer’s own photos; no internal photo, key or record ID leaves the server', async () => {
    const p = await submit('portal-tabs-photos@example.test')
    const cookie = await customerCookie(p)
    const ids = [
      await photo(p, { uploader_kind: 'customer' }),
      await photo(p, { uploader_kind: 'customer' }),
      await photo(p, { uploader_kind: 'customer', state: 'quarantined' }),
      await photo(p, { uploader_kind: 'customer', state: 'rejected' }),
      await photo(p, { uploader_kind: 'customer', state: 'removed' }),
      // A staff photo starts internal: it is not the customer's and is not counted.
      await photo(p, { uploader_kind: 'staff' }),
    ]
    const res = await get(`/customer/projects/${p.reference}/photos`, cookie)
    expect(res.statusCode).toBe(200)
    expect(res.json<{ photos: unknown }>().photos).toEqual({ received: 2, processing: 1, failed: 1 })
    // TSK-0076 (HH-PORT-11): the customer's own uploads are listed with their state (no storage here: no link);
    // the removed one and the internal staff photo are not.
    const yours = res.json<{ yours: { id: string; state: string; url: string | null }[] }>().yours
    expect(yours.map((y) => [y.id, y.state, y.url])).toEqual([
      [ids[0], 'ready', null],
      [ids[1], 'ready', null],
      [ids[2], 'quarantined', null],
      [ids[3], 'rejected', null],
    ])
    for (const secret of [ids[4], ids[5], 'synthetic-tabs', 'requests/photos', p.requestId, p.projectId])
      expect(res.body).not.toContain(secret)
  })

  it('[T19][HH-PORT-01][HH-PORT-06] another project, a missing and a malformed reference are the same NOT_FOUND on every tab; no session is 401', async () => {
    const a = await submit('portal-tabs-scope-a@example.test')
    const b = await submit('portal-tabs-scope-b@example.test')
    const cookie = await customerCookie(a)
    const strip = (body: string) => body.replace(/"requestId":"[^"]+"/, '')
    for (const tab of TABS) {
      const other = await get(`/customer/projects/${b.reference}/${tab}`, cookie)
      const missing = await get(`/customer/projects/HH-00000000/${tab}`, cookie)
      const malformed = await get(`/customer/projects/not-a-reference/${tab}`, cookie)
      for (const r of [other, missing, malformed]) expect(r.statusCode, tab).toBe(404)
      expect(strip(other.body)).toBe(strip(missing.body))
      expect(strip(malformed.body)).toBe(strip(missing.body))
      expect(other.body).not.toContain(b.reference)
      expect((await get(`/customer/projects/${a.reference}/${tab}`)).statusCode, tab).toBe(401)
      // Staff reach their own surface only: the customer routes refuse a staff session.
      expect((await get(`/customer/projects/${a.reference}/${tab}`, staff.cookie)).statusCode, tab).not.toBe(200)
    }
    // Each refusal of an existing project is a security event naming the operation, never the project's data.
    const events = await t.db
      .selectFrom('platform.audit_events')
      .select(['summary'])
      .where('action', '=', 'security.scope_denied')
      .where('target_id', '=', b.projectId)
      .execute()
    expect(events.map((e) => (e.summary as { operation: string }).operation).sort()).toEqual([...OPERATIONS].sort())
  })
})

describe('customer content stays English; customer free text as written (TSK-0039, HH-PORT-08, T04, RULE-LANGUAGES)', () => {
  it('[T04][HH-PORT-08][HH-LANG-01] a Spanish-locale staff member’s decision reaches the customer in English; the customer’s own words are kept as written', async () => {
    const p = await submit('portal-tabs-english@example.test', SPANISH)
    const cookie = await customerCookie(p)
    await staffWrite('PUT', '/staff/auth/session/locale', { locale: 'es' })
    try {
      const session = await app.inject({
        method: 'GET',
        url: '/api/v1/staff/auth/session',
        headers: { cookie: staff.cookie },
      })
      expect(session.json<{ locale: string }>().locale).toBe('es')
      await act(p, 'not-a-fit', {
        category: 'coverage',
        customerReason: 'the property is outside the area we serve.',
        internalNote: NOTE,
      })
      const o = await get(`/customer/projects/${p.reference}/overview`, cookie)
      expect(o.statusCode).toBe(200)
      const message =
        "Thank you for considering HandyHub. We're unable to take on this project because the property is outside the area we serve."
      expect(o.json<{ status: { text: string } }>().status.text).toBe(message)
      // The customer answers carry codes and English only: no staff-locale text and no internal note.
      for (const tab of ['overview', ...TABS]) {
        const res = await get(`/customer/projects/${p.reference}/${tab}`, cookie)
        expect(res.statusCode).toBe(200)
        expect(res.body).not.toMatch(/[¿¡ñáéíóú]/i)
        expect(res.body).not.toContain(NOTE)
      }
      // The customer's free text is stored and shown to staff exactly as written: never translated or rewritten.
      const stored = await t.db
        .selectFrom('intake.requests')
        .select('description')
        .where('id', '=', p.requestId)
        .executeTakeFirstOrThrow()
      expect(stored.description).toBe(SPANISH)
      const detail = await app.inject({
        method: 'GET',
        url: `/api/v1/staff/requests/${p.requestId}`,
        headers: { cookie: staff.cookie },
      })
      expect(detail.statusCode).toBe(200)
      expect(detail.body).toContain(JSON.stringify(SPANISH).slice(1, -1))
    } finally {
      await staffWrite('PUT', '/staff/auth/session/locale', { locale: 'en' })
    }
  })
})
