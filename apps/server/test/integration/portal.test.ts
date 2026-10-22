// The customer project workspace frame against PostgreSQL 16 (TSK-0038; HH-PORT-02, HH-PORT-03, HH-PORT-06,
// HH-ARC-10, HH-PORT-01, HH-ARC-04, T19, T23, T24, RULE-SERVER-AUTHZ). Staff change the shared records through the
// staff API; the customer's Overview follows them. Every staff member, customer, request and note here is synthetic
// (RULE-SYNTHETIC-DATA).
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const pw = ['synthetic', 'portal', 'passphrase', '38'].join(' ')
const NOTE = 'SYNTHETIC-INTERNAL-NOTE-0038: neighbour dog, staff only.'
const RISK = 'SYNTHETIC-RISK-NOTE-0038: staff only.'

let t: TestDatabase
let app: FastifyInstance
let owner = { id: '', cookie: '', csrf: '' }

type Project = { reference: string; requestId: string; projectId: string; contactId: string }
let ip = 30
async function submit(email: string): Promise<Project> {
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': `synthetic-portal-${randomUUID()}`, 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic portal project: a cracked ceiling patch.',
      property: { street: '38 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
      estimatePreference: 'let_handyhub_decide',
      contact: { fullName: 'Synthetic Portal Customer', email, phone: '(502) 555-0138', preferredChannel: 'email' },
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

async function staffVersion(p: Project): Promise<number> {
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/staff/requests/${p.requestId}`,
    headers: { cookie: owner.cookie },
  })
  expect(res.statusCode).toBe(200)
  return res.json<{ version: number }>().version
}
async function staffWrite(method: 'POST' | 'PUT', url: string, payload: unknown, version: number) {
  const res = await app.inject({
    method,
    url: `/api/v1${url}`,
    payload: payload as object,
    headers: {
      cookie: owner.cookie,
      'x-csrf-token': owner.csrf,
      'idempotency-key': `synthetic-portal-write-${randomUUID()}`,
      'if-match': `"${version}"`,
    },
  })
  expect(res.statusCode, res.body).toBeLessThan(300)
  return res
}
const QUALIFIED = {
  coverage: { outcome: 'ok' },
  service_fit: { outcome: 'ok' },
  essential_facts: { outcome: 'ok' },
  urgency: { outcome: 'ok' },
  site_visit_need: { outcome: 'attention', note: 'Synthetic: ceiling height unknown' },
  staff_equipment: { outcome: 'ok' },
  risk_flags: { outcome: 'ok' },
}
const act = async (p: Project, name: string, body: Record<string, unknown>) =>
  staffWrite('POST', `/staff/requests/${p.requestId}/actions/${name}`, body, await staffVersion(p))

type Overview = {
  reference: string
  services: string[]
  notSure: boolean
  submittedAt: string
  status: { situation: string; step: string; waitingOn: string; nextAction: string; since: string; text: string | null }
  timeline: { kind: string; at: string; text: string | null }[]
  appointment: null
  payment: { state: string }
  refreshedAt: string
  refreshSeconds: number
}
async function overview(p: Project, cookie: string): Promise<Overview> {
  const res = await get(`/customer/projects/${p.reference}/overview`, cookie)
  expect(res.statusCode, res.body).toBe(200)
  expect(res.headers['cache-control']).toBe('private, no-store')
  // T24: no internal note, risk note, staff name or e-mail in any answer.
  for (const secret of [NOTE, RISK, 'Synthetic Portal Owner', 'owner-portal@example.test', owner.id])
    expect(res.body).not.toContain(secret)
  return res.json<Overview>()
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db } })
  const hash = await hashPassword(pw)
  const id = await withTx(t.db, async (tx) => {
    const user = await createStaffUser(tx, {
      email: 'owner-portal@example.test',
      displayName: 'Synthetic Portal Owner',
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
    payload: { email: 'owner-portal@example.test', password: pw },
  })
  expect(res.statusCode).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  owner = { id, cookie, csrf: session.json<{ csrfToken: string }>().csrfToken }
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

describe('the Overview follows the shared records (TSK-0038, HH-PORT-02, HH-PORT-03, T23)', () => {
  it('[HH-PORT-02][HH-PORT-03][HH-ARC-10] a new request: "Request received", waiting on HandyHub, nothing confirmed or due', async () => {
    const p = await submit('portal-received@example.test')
    const before = Date.now()
    const o = await overview(p, await customerCookie(p))
    expect(o).toMatchObject({
      reference: p.reference,
      services: ['Patching & Repair'],
      notSure: false,
      status: { situation: 'received', step: 'review_details', waitingOn: 'handyhub', nextAction: 'none', text: null },
      appointment: null,
      payment: { state: 'none' },
      // portal.refresh (PROPOSED 30 seconds, migration 0036).
      refreshSeconds: 30,
    })
    expect(o.timeline).toEqual([{ kind: 'received', at: o.submittedAt, text: null }])
    expect(o.status.since).toBe(o.submittedAt)
    expect(Date.parse(o.refreshedAt)).toBeGreaterThanOrEqual(before - 1000)
  })

  it('[T23][HH-PORT-02][HH-PORT-03][T24] staff internal handling changes nothing; Ask a Question makes it "Waiting on you" with Reply', async () => {
    const p = await submit('portal-moves@example.test')
    const cookie = await customerCookie(p)
    // Internal handling: a staff note and a qualification with a risk note; neither changes what the customer sees.
    await staffWrite('POST', `/staff/requests/${p.requestId}/notes`, { body: NOTE }, 1)
    await staffWrite('PUT', `/staff/requests/${p.requestId}/qualification`, { checks: QUALIFIED }, 0)
    expect((await overview(p, cookie)).status).toMatchObject({ situation: 'received', waitingOn: 'handyhub' })

    await act(p, 'ask-question', { internalNote: RISK })
    const o = await overview(p, cookie)
    expect(o.status).toMatchObject({
      situation: 'more_information',
      step: 'answer_questions',
      waitingOn: 'customer',
      nextAction: 'reply',
      text: null,
    })
    expect(o.timeline.map((e) => e.kind)).toEqual(['more_information', 'received'])
    expect(o.status.since).toBe(o.timeline[0]?.at)
  })

  it('[T23][HH-PORT-03][OWN-DEC-99] "Site visit needed" carries the explanation staff wrote for the customer', async () => {
    const p = await submit('portal-visit@example.test')
    const cookie = await customerCookie(p)
    await staffWrite('PUT', `/staff/requests/${p.requestId}/qualification`, { checks: QUALIFIED }, 0)
    await act(p, 'estimate-visit', {
      customerExplanation: 'We need to see the ceiling to measure it.',
      workPackages: ['SVC-DW-01'],
      internalNote: RISK,
    })
    const o = await overview(p, cookie)
    expect(o.status).toMatchObject({
      situation: 'site_visit',
      step: 'visit_windows_pending',
      waitingOn: 'handyhub',
      nextAction: 'none',
      text: 'We need to see the ceiling to measure it.',
    })
    expect(o.timeline[0]).toMatchObject({ kind: 'site_visit', text: 'We need to see the ceiling to measure it.' })
  })

  it('[T23][HH-PORT-03][HH-LEAD-08][T24] Not a Fit: the decision and reason in the owner’s wording; nobody waits; the risk note stays internal', async () => {
    const p = await submit('portal-decline@example.test')
    const cookie = await customerCookie(p)
    await act(p, 'not-a-fit', {
      category: 'coverage',
      customerReason: 'the property is outside the area we serve.',
      internalNote: RISK,
    })
    const o = await overview(p, cookie)
    const message =
      "Thank you for considering HandyHub. We're unable to take on this project because the property is outside the area we serve."
    expect(o.status).toMatchObject({ situation: 'not_a_fit', waitingOn: 'nobody', nextAction: 'none', text: message })
    expect(o.timeline.map((e) => [e.kind, e.text])).toEqual([
      ['not_a_fit', message],
      ['received', null],
    ])
    // The closed project stays visible through authorized access (OWN-DEC-100).
    expect((await get('/customer/projects', cookie)).json()).toMatchObject({
      projects: [{ reference: p.reference, status: { situation: 'not_a_fit', waitingOn: 'nobody' } }],
    })
  })

  it('[HH-PORT-03][T24] an internal decision (the Owner routing) is not on the customer timeline', async () => {
    const p = await submit('portal-owner-routing@example.test')
    const cookie = await customerCookie(p)
    // A synthetic Owner-routing row (the route needs accepted work or money, which no task records yet).
    await sql`INSERT INTO intake.request_decisions (request_id, project_id, action, event, from_state, to_state,
        project_from_state, project_to_state, reason_category, customer_text, internal_note, decided_by, request_version)
      VALUES (${p.requestId}, ${p.projectId}, 'not_a_fit_owner_review', 'route_to_owner_review', 'received', 'received',
        'open', 'cancellation_review', 'coverage', 'synthetic routed reason', ${RISK}, ${owner.id}, 1)`.execute(t.db)
    const o = await overview(p, cookie)
    expect(o.timeline.map((e) => e.kind)).toEqual(['received'])
    expect(JSON.stringify(o)).not.toContain('synthetic routed reason')
  })
})

describe('the projects list and the session’s scope (TSK-0038, HH-PORT-01, T19)', () => {
  it('[HH-PORT-01][HH-ARC-10] /customer/projects lists only the session’s project, with its status and the refresh interval', async () => {
    const a = await submit('portal-list-a@example.test')
    await submit('portal-list-b@example.test')
    const res = await get('/customer/projects', await customerCookie(a))
    expect(res.statusCode).toBe(200)
    const body = res.json<{ projects: { reference: string }[]; refreshSeconds: number; refreshedAt: string }>()
    expect(body.projects).toEqual([
      {
        reference: a.reference,
        services: ['Patching & Repair'],
        notSure: false,
        submittedAt: expect.any(String),
        status: {
          situation: 'received',
          step: 'review_details',
          waitingOn: 'handyhub',
          nextAction: 'none',
          since: expect.any(String),
        },
      },
    ])
    expect(body.refreshSeconds).toBe(30)
  })

  it('[T19][HH-PORT-01][HH-PORT-06] another project, a missing one and a malformed one are the same NOT_FOUND; no session is 401', async () => {
    const a = await submit('portal-scope-a@example.test')
    const b = await submit('portal-scope-b@example.test')
    const cookie = await customerCookie(a)
    const strip = (body: string) => body.replace(/"requestId":"[^"]+"/, '')
    const other = await get(`/customer/projects/${b.reference}/overview`, cookie)
    const missing = await get('/customer/projects/HH-00000000/overview', cookie)
    const malformed = await get('/customer/projects/not-a-reference/overview', cookie)
    for (const r of [other, missing, malformed]) expect(r.statusCode).toBe(404)
    expect(strip(other.body)).toBe(strip(missing.body))
    expect(strip(malformed.body)).toBe(strip(missing.body))
    expect(other.body).not.toContain(b.reference)
    const events = await t.db
      .selectFrom('platform.audit_events')
      .select(['result', 'summary'])
      .where('action', '=', 'security.scope_denied')
      .where('target_id', '=', b.projectId)
      .execute()
    expect(events).toEqual([{ result: 'denied', summary: { operation: 'getCustomerProjectOverview', method: 'GET' } }])
    // Expired or missing session: 401, the portal's "session ended" state.
    expect((await get(`/customer/projects/${a.reference}/overview`)).statusCode).toBe(401)
    expect((await get('/customer/projects')).statusCode).toBe(401)
    // Staff reach their own surface only: the customer routes refuse a staff session.
    expect((await get(`/customer/projects/${a.reference}/overview`, owner.cookie)).statusCode).not.toBe(200)
  })

  it('[HH-ARC-10][HH-PORT-06] a revoked session ends at once: the next refresh is 401, never the old data', async () => {
    const a = await submit('portal-revoked@example.test')
    const cookie = await customerCookie(a)
    expect((await get(`/customer/projects/${a.reference}/overview`, cookie)).statusCode).toBe(200)
    await t.db
      .updateTable('identity.customer_sessions')
      .set({ revoked_at: new Date(), revoke_reason: 'sign_out' })
      .where('contact_ref', '=', a.contactId)
      .execute()
    expect((await get(`/customer/projects/${a.reference}/overview`, cookie)).statusCode).toBe(401)
  })
})
