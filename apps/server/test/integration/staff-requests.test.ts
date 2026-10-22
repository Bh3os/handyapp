// Staff requests against PostgreSQL 16 (TSK-0042; HH-LEAD-01, HH-LEAD-02, HH-LEAD-08, HH-SVC-04, T01, T07, T26, T30,
// T37, T40, RULE-SERVER-AUTHZ). Staff, customers and requests are synthetic (RULE-SYNTHETIC-DATA).
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { apiModules } from '../../src/modules/index.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { newRequestQueueAutomation } from '../../src/modules/queue/index.js'
import { requestsModule } from '../../src/modules/requests/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { createWorker } from '../../src/platform/jobs.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa, TEST_MFA_KEY } from '../fixtures/staff-mfa.js'

const pw = (n: number) => ['synthetic', 'requests', 'passphrase', 'number', String(n)].join(' ')
const PEOPLE = ['owner', 'office', 'office2', 'estimator', 'worker'] as const
type Person = (typeof PEOPLE)[number]
const roleOf = (p: Person) => p.replace(/2$/, '') as 'owner' | 'office' | 'estimator' | 'worker'

let t: TestDatabase
let app: FastifyInstance
/** The same database with a project that has an appointment (obligation check), for the Owner routing. */
let owed: FastifyInstance
const ids = {} as Record<Person, string>
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const owedCookies = {} as Record<Person, string>
const owedCsrf = {} as Record<Person, string>
/** Projects the fake obligation check reports as having an appointment. */
const withAppointment = new Set<string>()

async function signIn(server: FastifyInstance, p: Person): Promise<[string, string]> {
  const res = await signInWithMfa(server, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email: `${p}-requests@example.test`, password: pw(1) },
  })
  expect(res.statusCode).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await server.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db } })
  const modules = apiModules({ secureCookies: false, mfaKey: TEST_MFA_KEY }).map((m) =>
    m.name === 'requests'
      ? requestsModule({
          obligationChecks: [
            {
              fact: 'appointmentExists',
              source: 'test',
              check: async (_tx, projectId) => withAppointment.has(projectId),
            },
          ],
        })
      : m,
  )
  owed = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, modules } })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: `${p}-requests@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: roleOf(p),
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
  })
  for (const p of PEOPLE) {
    ;[cookies[p], csrf[p]] = await signIn(app, p)
    ;[owedCookies[p], owedCsrf[p]] = await signIn(owed, p)
  }
})
afterAll(async () => {
  await app?.close()
  await owed?.close()
  await t?.drop()
})

const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
let seq = 0
const key = (what: string) => `synthetic-${what}-${String(++seq).padStart(6, '0')}`

function requestBody(over: Record<string, unknown> = {}) {
  return {
    formVersion: 'test-1',
    privacyNoticeVersion: 'privacy-notice-1',
    services: [{ serviceId: 'SVC-DW-01', notes: 'Synthetic service note' }, { serviceId: 'SVC-PT-01' }],
    notSure: false,
    description: 'Synthetic project description.',
    answers: [
      { serviceId: 'SVC-DW-01', question: 'damage_size_count_cause', kind: 'text', text: 'About six inches' },
      { serviceId: 'SVC-PT-01', question: 'colors', kind: 'unknown' },
    ],
    property: {
      street: '100 Synthetic Way',
      unit: 'Apt 2',
      city: 'Testville',
      state: 'ky',
      zip: '40000',
      propertyType: 'house',
    },
    timing: { preferredDate: future, flexible: false, needHelpToday: true, windows: ['mornings', 'weekends'] },
    estimatePreference: 'site_visit',
    contact: {
      fullName: 'Synthetic Customer',
      email: `customer-${seq}@example.test`,
      phone: '(502) 555-0101',
      preferredChannel: 'email',
    },
    smsOptIn: false,
    marketingOptIn: false,
    ...over,
  }
}

let ip = 1
/** Submits a synthetic request through the public API and returns its id and project. */
async function newRequest(over: Record<string, unknown> = {}) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: requestBody(over),
  })
  expect(res.statusCode).toBe(201)
  const { reference } = res.json<{ reference: string }>()
  const row = await t.db
    .selectFrom('intake.requests')
    .select(['id', 'project_id'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
  return { id: row.id, projectId: row.project_id, reference }
}

const runQueueWorker = () =>
  createWorker({ db: t.db, registry: createAutomationRegistry([newRequestQueueAutomation()]) }).runOnce()

type Server = 'app' | 'owed'
const server = (s: Server) => (s === 'app' ? app : owed)
const get = (who: Person, url: string, s: Server = 'app') =>
  server(s).inject({ method: 'GET', url, headers: { cookie: (s === 'app' ? cookies : owedCookies)[who] } })

function write(
  who: Person,
  method: 'POST' | 'PUT',
  url: string,
  payload: unknown,
  opts: { version?: number | null; key?: string; s?: Server } = {},
) {
  const s = opts.s ?? 'app'
  return server(s).inject({
    method,
    url,
    payload: payload as object,
    headers: {
      cookie: (s === 'app' ? cookies : owedCookies)[who],
      'x-csrf-token': (s === 'app' ? csrf : owedCsrf)[who],
      'idempotency-key': opts.key ?? key('write'),
      ...(opts.version === null || opts.version === undefined ? {} : { 'if-match': `"${opts.version}"` }),
    },
  })
}

type Detail = {
  id: string
  state: string
  version: number
  project: { id: string; state: string }
  original: Record<string, unknown> & { services: { code: string }[]; answers: unknown[] }
  contactVerification: { email: string; phone: string }
  coverage: { result: string }
  responsibleStaff: { id: string; name: string | null } | null
  assignments: { staff: { id: string }; previous: { id: string } | null; by: { id: string } }[]
  qualification: { revision: number } | null
  missingChecks: string[]
  notes: { body: string }[]
  decisions: {
    action: string
    fromState: string
    toState: string
    reasonCategory: string | null
    customerText: string | null
    customerMessage: string | null
    internalNote: string | null
    projectToState: string | null
  }[]
  workPackages: { code: string; position: number; state: string }[]
  nextStep: string
  actions: Record<string, boolean>
}
async function detail(who: Person, id: string, s: Server = 'app'): Promise<Detail> {
  const res = await get(who, `/api/v1/staff/requests/${id}`, s)
  expect(res.statusCode).toBe(200)
  expect(res.headers['etag']).toBe(`"${res.json<Detail>().version}"`)
  return res.json<Detail>()
}

const ALL_OK = {
  coverage: { outcome: 'ok' },
  service_fit: { outcome: 'ok' },
  essential_facts: { outcome: 'ok' },
  urgency: { outcome: 'ok', note: 'Customer asked for help today' },
  site_visit_need: { outcome: 'attention', note: 'Ceiling height unknown' },
  staff_equipment: { outcome: 'ok' },
  risk_flags: { outcome: 'ok' },
}
async function qualify(who: Person, id: string, checks: Record<string, unknown> = ALL_OK, revision = 0) {
  return write(who, 'PUT', `/api/v1/staff/requests/${id}/qualification`, { checks }, { version: revision })
}
const action = (id: string, name: string) => `/api/v1/staff/requests/${id}/actions/${name}`
const codes = (res: { json: () => unknown }) =>
  (res.json() as { error: { fieldErrors: { code: string }[] } }).error.fieldErrors.map((f) => f.code)

describe('the original request view (TSK-0042, HH-LEAD-01, OWN-DEC-116)', () => {
  it('[HH-LEAD-01][T01] staff see everything the customer sent, the badges and coverage; one request, one project', async () => {
    const r = await newRequest()
    const d = await detail('office', r.id)
    expect(d).toMatchObject({
      id: r.id,
      state: 'received',
      version: 1,
      source: 'public_form',
      project: { id: r.projectId, state: 'open' },
      contactVerification: { email: 'unverified', phone: 'unverified' },
      coverage: { result: 'unknown' },
      responsibleStaff: null,
      qualification: null,
      nextStep: 'qualify_and_choose',
      workPackages: [],
      actions: {
        askQuestion: true,
        prepareOnlineEstimate: true,
        arrangeEstimateVisit: true,
        notAFit: true,
        assign: true,
        qualify: true,
        addNote: true,
      },
    })
    expect(d.original).toMatchObject({
      services: [
        { serviceId: 'SVC-DW-01', code: 'DW-01', notes: 'Synthetic service note' },
        { serviceId: 'SVC-PT-01', code: 'PT-01', notes: null },
      ],
      notSure: false,
      description: 'Synthetic project description.',
      property: { street: '100 Synthetic Way', unit: 'Apt 2', city: 'Testville', state: 'KY', zip: '40000' },
      timing: { preferredDate: future, flexible: false, needHelpToday: true, windows: ['mornings', 'weekends'] },
      estimatePreference: 'site_visit',
      preferredChannel: 'email',
      contact: { fullName: 'Synthetic Customer', phone: '(502) 555-0101' },
    })
    expect(d.original.answers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          serviceCode: 'DW-01',
          question: 'damage_size_count_cause',
          text: 'About six inches',
        }),
        expect.objectContaining({ serviceCode: 'PT-01', question: 'colors', kind: 'unknown', number: null }),
      ]),
    )
    expect(d.missingChecks).toHaveLength(7)
    const projects = await t.db.selectFrom('crm.projects').select('id').where('reference', '=', r.reference).execute()
    expect(projects).toHaveLength(1)
  })

  it('[HH-LEAD-01] the original submission, its services and answers can never be edited', async () => {
    const r = await newRequest()
    await expect(
      sql`UPDATE intake.requests SET description = 'changed' WHERE id = ${r.id}`.execute(t.db),
    ).rejects.toThrow(/ORIGINAL_SUBMISSION/)
    await expect(
      sql`UPDATE intake.request_services SET notes = 'changed' WHERE request_id = ${r.id}`.execute(t.db),
    ).rejects.toThrow(/APPEND_ONLY/)
    await expect(sql`DELETE FROM intake.request_answers WHERE request_id = ${r.id}`.execute(t.db)).rejects.toThrow(
      /APPEND_ONLY/,
    )
  })

  it('[HH-LEAD-01][T26] workers, guests and unknown requests are refused on the server', async () => {
    const r = await newRequest()
    expect((await get('worker', `/api/v1/staff/requests/${r.id}`)).statusCode).toBe(403)
    expect((await get('worker', '/api/v1/staff/requests')).statusCode).toBe(403)
    expect((await app.inject({ method: 'GET', url: `/api/v1/staff/requests/${r.id}` })).statusCode).toBe(401)
    expect((await get('office', '/api/v1/staff/requests/00000000-0000-4000-8000-000000000000')).statusCode).toBe(404)
    for (const [path, body] of [
      ['ask-question', {}],
      ['not-a-fit', { category: 'coverage', customerReason: 'x' }],
    ] as const)
      expect((await write('worker', 'POST', action(r.id, path), body, { version: 1 })).statusCode).toBe(403)
    // The record header of TSK-0041 is still there for the queue's deep link.
    expect((await get('office', `/api/v1/staff/requests/${r.id}/summary`)).statusCode).toBe(200)
  })

  it('[HH-LEAD-01] the list shows requests newest first, filtered and paged; workers get nothing', async () => {
    const a = await newRequest()
    const b = await newRequest()
    const page = await get('office', '/api/v1/staff/requests?state=received&limit=1')
    expect(page.statusCode).toBe(200)
    const first = page.json<{ items: { id: string; services: string[]; customerName: string }[]; nextCursor: string }>()
    expect(first.items.map((i) => i.id)).toEqual([b.id])
    expect(first.items[0]).toMatchObject({ services: ['DW-01', 'PT-01'], customerName: 'Synthetic Customer' })
    const second = await get('office', `/api/v1/staff/requests?state=received&limit=1&cursor=${first.nextCursor}`)
    expect(second.json<{ items: { id: string }[] }>().items.map((i) => i.id)).toEqual([a.id])
    expect((await get('office', '/api/v1/staff/requests?state=everything')).statusCode).toBe(400)
    const forged = Buffer.from(JSON.stringify(['x'])).toString('base64url')
    expect((await get('office', `/api/v1/staff/requests?cursor=${forged}`)).statusCode).toBe(400)
  })
})

describe('responsible staff member, qualification and internal notes (TSK-0042, HH-LEAD-01, HH-LEAD-02)', () => {
  it('[HH-LEAD-01] exactly one responsible staff member; every reassignment is kept and the queue follows', async () => {
    const r = await newRequest()
    await runQueueWorker()
    const url = `/api/v1/staff/requests/${r.id}/responsible`
    expect((await write('office', 'PUT', url, { staffUserId: ids.office })).statusCode).toBe(428)
    // A worker cannot be made responsible for a request.
    expect((await write('office', 'PUT', url, { staffUserId: ids.worker }, { version: 1 })).statusCode).toBe(400)
    const first = await write('office', 'PUT', url, { staffUserId: ids.office2 }, { version: 1 })
    expect(first.statusCode).toBe(200)
    expect(first.json()).toMatchObject({ version: 2, state: 'received' })
    const stale = await write('office', 'PUT', url, { staffUserId: ids.estimator }, { version: 1 })
    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toMatchObject({ error: { code: 'STALE_VERSION', current: { version: 2 } } })
    expect((await write('owner', 'PUT', url, { staffUserId: ids.estimator }, { version: 2 })).statusCode).toBe(200)
    const d = await detail('office', r.id)
    expect(d.responsibleStaff).toEqual({ id: ids.estimator, name: 'Synthetic estimator' })
    expect(d.assignments.map((a) => [a.staff.id, a.previous?.id ?? null, a.by.id])).toEqual([
      [ids.office2, null, ids.office],
      [ids.estimator, ids.office2, ids.owner],
    ])
    const item = await t.db
      .selectFrom('ops.queue_items')
      .select(['assigned_staff_id', 'resolved_at'])
      .where('subject_id', '=', r.id)
      .executeTakeFirstOrThrow()
    expect(item).toEqual({ assigned_staff_id: ids.estimator, resolved_at: null })
    // Assigning is not a response: the request is still received and its new-request item stays open.
    expect(d.state).toBe('received')
    const assignees = await get('office', '/api/v1/staff/requests/assignees')
    const staff = assignees.json<{ staff: { id: string }[] }>().staff.map((s) => s.id)
    expect(staff).toEqual(expect.arrayContaining([ids.owner, ids.office, ids.estimator]))
    expect(staff).not.toContain(ids.worker)
  })

  it('[HH-LEAD-02][T40] staff record the qualification as revisions; risk flags stay visible, never declared safe', async () => {
    const r = await newRequest()
    const first = await qualify('estimator', r.id, { ...ALL_OK, risk_flags: { outcome: 'not_checked' } })
    expect(first.statusCode).toBe(200)
    expect(first.json()).toEqual({ revision: 1, missingChecks: ['risk_flags'], holdsOpened: [] })
    expect((await qualify('estimator', r.id, ALL_OK, 0)).statusCode).toBe(409)
    // TSK-0043: a flagged risk names what the potential hazard is about; it becomes a review hold (HH-LEAD-04).
    const vague = { ...ALL_OK, risk_flags: { outcome: 'attention', note: 'Possible water damage near wiring' } }
    const refusedVague = await qualify('office', r.id, vague, 1)
    expect(refusedVague.statusCode).toBe(409)
    expect(codes(refusedVague)).toEqual(['HAZARD_CATEGORY_REQUIRED'])
    const flagged = {
      ...ALL_OK,
      risk_flags: { outcome: 'attention', note: 'Possible water damage near wiring', hazards: ['licensed_trade'] },
    }
    const saved = await qualify('office', r.id, flagged, 1)
    expect(saved.json()).toMatchObject({ revision: 2, missingChecks: [], holdsOpened: [expect.any(String)] })
    const d = await detail('owner', r.id)
    expect(d.qualification).toMatchObject({
      revision: 2,
      checks: {
        risk_flags: { outcome: 'attention', note: 'Possible water damage near wiring', hazards: ['licensed_trade'] },
      },
    })
    // Every check must be answered; an unknown check is refused.
    const partial = await qualify('office', r.id, { coverage: { outcome: 'ok' } }, 2)
    expect(partial.statusCode).toBe(400)
    expect((await qualify('office', r.id, { ...ALL_OK, ai_guess: { outcome: 'ok' } }, 2)).statusCode).toBe(400)
    // Qualifying never moves the request.
    expect(d.state).toBe('received')
  })

  it('[HH-LEAD-02] internal notes are staff-only records, kept apart from customer messages and never edited', async () => {
    const r = await newRequest()
    const res = await write('office', 'POST', `/api/v1/staff/requests/${r.id}/notes`, {
      body: 'Synthetic internal note',
    })
    expect(res.statusCode).toBe(201)
    expect((await write('office', 'POST', `/api/v1/staff/requests/${r.id}/notes`, { body: '   ' })).statusCode).toBe(
      400,
    )
    const d = await detail('office', r.id)
    expect(d.notes.map((n) => n.body)).toEqual(['Synthetic internal note'])
    const row = await t.db
      .selectFrom('intake.request_notes')
      .select(['visibility'])
      .where('request_id', '=', r.id)
      .executeTakeFirstOrThrow()
    // TSK-0044 (HH-STAFF-05): the internal class is named internal_operational.
    expect(row.visibility).toBe('internal_operational')
    await expect(
      sql`UPDATE intake.request_notes SET body = 'x' WHERE request_id = ${r.id}`.execute(t.db),
    ).rejects.toThrow(/APPEND_ONLY/)
    // The note text is never written to the audit log.
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select('summary')
      .where('action', '=', 'request.add_note')
      .execute()
    expect(JSON.stringify(audit)).not.toContain('Synthetic internal note')
    // No customer message was created for it.
    const deliveries = await t.db
      .selectFrom('platform.message_deliveries')
      .select('id')
      .where('record_id', '=', r.id)
      .execute()
    expect(deliveries).toEqual([])
  })
})

describe('the four actions (TSK-0042, HH-LEAD-02, HH-SVC-04, OWN-DEC-99, OWN-DEC-116)', () => {
  it('[HH-LEAD-02][HH-LEAD-05] Ask a Question moves the request to needs information, sends nothing and leaves the clock running', async () => {
    const r = await newRequest()
    await runQueueWorker()
    expect((await write('office', 'POST', action(r.id, 'ask-question'), {})).statusCode).toBe(428)
    const k = key('ask')
    const res = await write(
      'office',
      'POST',
      action(r.id, 'ask-question'),
      { internalNote: 'Need ceiling height' },
      { version: 1, key: k },
    )
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      requestId: r.id,
      outcome: 'moved',
      state: 'needs_information',
      version: 3,
      projectState: 'open',
    })
    // The same key replays the same answer; nothing happens twice.
    const replay = await write(
      'office',
      'POST',
      action(r.id, 'ask-question'),
      { internalNote: 'Need ceiling height' },
      { version: 1, key: k },
    )
    expect(replay.headers['idempotent-replayed']).toBe('true')
    const d = await detail('office', r.id)
    expect(d).toMatchObject({ state: 'needs_information', nextStep: 'waiting_on_customer' })
    expect(d.decisions).toEqual([
      expect.objectContaining({
        action: 'ask_question',
        fromState: 'received',
        toState: 'needs_information',
        internalNote: 'Need ceiling height',
      }),
    ])
    // Asking is not yet a response (TSK-0043, OWN-DEC-116): the item stays, awaiting a first meaningful response.
    const item = await t.db
      .selectFrom('ops.queue_items')
      .select(['resolution', 'reason', 'subject_status'])
      .where('subject_id', '=', r.id)
      .where('type', '=', 'new_request')
      .executeTakeFirstOrThrow()
    expect(item).toEqual({ resolution: null, reason: 'awaiting_first_response', subject_status: 'needs_information' })
    const events = await t.db
      .selectFrom('platform.outbox_events')
      .select('type')
      .where('aggregate_id', '=', r.id)
      .orderBy('seq')
      .execute()
    expect(events.map((e) => e.type)).toEqual(['request.submitted', 'request.information_requested'])
    const deliveries = await t.db
      .selectFrom('platform.message_deliveries')
      .select('id')
      .where('record_id', '=', r.id)
      .execute()
    expect(deliveries).toEqual([])
    // An invalid transition is refused with its reason, and nothing changes.
    const again = await write('office', 'POST', action(r.id, 'ask-question'), {}, { version: 3 })
    expect(again.statusCode).toBe(409)
    expect(codes(again)).toEqual(['INVALID_TRANSITION'])
    expect((await detail('office', r.id)).version).toBe(3)
  })

  it('[HH-SVC-04][HH-LEAD-02] Prepare Online Estimate needs the qualification, then makes one work package per service', async () => {
    const r = await newRequest()
    const body = { workPackages: ['SVC-DW-01', 'SVC-PT-01'] }
    const early = await write('estimator', 'POST', action(r.id, 'online-estimate'), body, { version: 1 })
    expect(early.statusCode).toBe(409)
    expect(codes(early)).toEqual(['QUALIFICATION_INCOMPLETE'])
    expect((await detail('office', r.id)).state).toBe('received')
    await qualify('estimator', r.id)
    const unknown = await write(
      'estimator',
      'POST',
      action(r.id, 'online-estimate'),
      { workPackages: ['SVC-XX-99'] },
      { version: 1 },
    )
    expect(unknown.statusCode).toBe(400)
    const res = await write('estimator', 'POST', action(r.id, 'online-estimate'), body, { version: 1 })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ state: 'ready_for_estimate', version: 3 })
    const d = await detail('office', r.id)
    expect(d).toMatchObject({ state: 'ready_for_estimate', nextStep: 'prepare_estimate' })
    expect(d.workPackages).toEqual([
      expect.objectContaining({ code: 'DW-01', position: 1, state: 'planned' }),
      expect.objectContaining({ code: 'PT-01', position: 2, state: 'planned' }),
    ])
    // [T01] One project holds both packages; no job exists.
    const rows = await t.db
      .selectFrom('work.work_packages')
      .select(['project_id', 'job_id'])
      .where('request_id', '=', r.id)
      .execute()
    expect(rows).toEqual([
      { project_id: r.projectId, job_id: null },
      { project_id: r.projectId, job_id: null },
    ])
    await expect(sql`DELETE FROM work.work_packages WHERE request_id = ${r.id}`.execute(t.db)).rejects.toThrow(
      /never deleted/,
    )
  })

  it('[HH-SVC-04][T37][OWN-DEC-99] Arrange Estimate Visit needs a customer-facing explanation and books nothing', async () => {
    const r = await newRequest({ notSure: true, services: [], answers: [], otherServicesText: 'Synthetic other work' })
    await qualify('office', r.id)
    const without = await write(
      'office',
      'POST',
      action(r.id, 'estimate-visit'),
      { workPackages: ['SVC-HI-01'] },
      { version: 1 },
    )
    expect(without.statusCode).toBe(400)
    const res = await write(
      'office',
      'POST',
      action(r.id, 'estimate-visit'),
      { customerExplanation: 'We need to see the wall to measure it.', workPackages: ['SVC-HI-01', 'SVC-DW-01'] },
      { version: 1 },
    )
    expect(res.statusCode).toBe(200)
    const d = await detail('office', r.id)
    expect(d).toMatchObject({ state: 'needs_site_visit', nextStep: 'offer_visit_windows' })
    expect(d.decisions[0]).toMatchObject({
      action: 'arrange_estimate_visit',
      customerText: 'We need to see the wall to measure it.',
    })
    expect(d.workPackages.map((w) => w.code)).toEqual(['HI-01', 'DW-01'])
    const events = await t.db
      .selectFrom('platform.outbox_events')
      .select('type')
      .where('aggregate_id', '=', r.id)
      .execute()
    expect(events.map((e) => e.type)).toContain('request.site_visit_required')
    const deliveries = await t.db
      .selectFrom('platform.message_deliveries')
      .select('id')
      .where('record_id', '=', r.id)
      .execute()
    expect(deliveries).toEqual([])
    // From the site visit, staff can still prepare the estimate; packages already there are not duplicated.
    const next = await write(
      'office',
      'POST',
      action(r.id, 'online-estimate'),
      { workPackages: ['SVC-HI-01'] },
      { version: 3 },
    )
    expect(next.json()).toMatchObject({ state: 'ready_for_estimate' })
    expect((await detail('office', r.id)).workPackages).toHaveLength(2)
  })

  it('[HH-LEAD-08][T30][T07] Not a Fit needs a category and a plain reason; it closes and keeps the history', async () => {
    const r = await newRequest({
      property: { street: '9 Synthetic Rd', city: 'Faraway', state: 'ky', zip: '40000', propertyType: 'house' },
    })
    const noCategory = await write('office', 'POST', action(r.id, 'not-a-fit'), { customerReason: 'x' }, { version: 1 })
    expect(noCategory.statusCode).toBe(400)
    const noReason = await write(
      'office',
      'POST',
      action(r.id, 'not-a-fit'),
      { category: 'other', customerReason: ' ' },
      { version: 1 },
    )
    expect(noReason.statusCode).toBe(400)
    const res = await write(
      'office',
      'POST',
      action(r.id, 'not-a-fit'),
      {
        category: 'coverage',
        customerReason: 'the property is outside the area we serve.',
        internalNote: 'Synthetic staff-only risk note',
      },
      { version: 1 },
    )
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ outcome: 'moved', state: 'not_served', projectState: 'closed' })
    const d = await detail('office', r.id)
    expect(d).toMatchObject({
      state: 'not_served',
      nextStep: 'closed',
      project: { state: 'closed' },
      actions: { notAFit: false, askQuestion: false, prepareOnlineEstimate: false },
    })
    expect(d.decisions).toEqual([
      expect.objectContaining({
        action: 'not_a_fit',
        reasonCategory: 'coverage',
        customerText: 'the property is outside the area we serve.',
        customerMessage:
          "Thank you for considering HandyHub. We're unable to take on this project because the property is outside the area we serve.",
        internalNote: 'Synthetic staff-only risk note',
        projectToState: 'closed',
      }),
    ])
    // The original submission is still there after closing.
    expect(d.original).toMatchObject({ description: 'Synthetic project description.' })
    const events = await t.db
      .selectFrom('platform.outbox_events')
      .select('type')
      .where('aggregate_id', '=', r.id)
      .execute()
    expect(events.map((e) => e.type)).toContain('decision.not_a_fit_published')
    const again = await write(
      'office',
      'POST',
      action(r.id, 'not-a-fit'),
      { category: 'coverage', customerReason: 'x' },
      { version: 2 },
    )
    expect(again.statusCode).toBe(409)
  })

  it('[HH-LEAD-08] each category ends in its state; the decision is staff-only and AI plays no part', async () => {
    for (const [category, state] of [
      ['outside_scope', 'outside_scope'],
      ['specialist_assessment', 'declined'],
      ['other', 'declined'],
    ] as const) {
      const r = await newRequest()
      const res = await write(
        'owner',
        'POST',
        action(r.id, 'not-a-fit'),
        { category, customerReason: 'Synthetic reason' },
        { version: 1 },
      )
      expect(res.json(), category).toMatchObject({ state, projectState: 'closed' })
    }
  })

  it('[HH-LEAD-08][HH-STATE-02] with an appointment, Not a Fit routes to the Owner for financial review and closes nothing', async () => {
    const r = await newRequest()
    withAppointment.add(r.projectId)
    const res = await write(
      'office',
      'POST',
      action(r.id, 'not-a-fit'),
      { category: 'outside_scope', customerReason: 'Synthetic reason' },
      { version: 1, s: 'owed' },
    )
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({
      outcome: 'routed_to_owner',
      state: 'received',
      projectState: 'cancellation_review',
      version: 2,
    })
    const d = await detail('owner', r.id, 'owed')
    expect(d).toMatchObject({ state: 'received', nextStep: 'owner_review', project: { state: 'cancellation_review' } })
    expect(d.decisions[0]).toMatchObject({ action: 'not_a_fit_owner_review', customerMessage: null })
    // Nothing is published to the customer.
    const events = await t.db
      .selectFrom('platform.outbox_events')
      .select('type')
      .where('aggregate_id', '=', r.id)
      .execute()
    expect(events.map((e) => e.type)).not.toContain('decision.not_a_fit_published')
    // The Owner sees it in Owner Decisions; Office does not.
    const decisions = await get('owner', '/api/v1/staff/queue/owner-decisions?type=cancellation_review', 'owed')
    expect(decisions.json<{ items: { subjectId: string; reason: string; link: string }[] }>().items).toEqual([
      expect.objectContaining({ subjectId: r.id, reason: 'not_a_fit_with_obligations', link: `/requests/${r.id}` }),
    ])
    expect((await get('office', '/api/v1/staff/queue/owner-decisions', 'owed')).statusCode).toBe(403)
    // A second decision cannot close it while the Owner's review is open.
    const again = await write(
      'office',
      'POST',
      action(r.id, 'not-a-fit'),
      { category: 'other', customerReason: 'x' },
      { version: 2, s: 'owed' },
    )
    expect(again.statusCode).toBe(409)
    const ask = await write('office', 'POST', action(r.id, 'ask-question'), {}, { version: 2, s: 'owed' })
    expect(codes(ask)).toEqual(['PROJECT_NOT_OPEN'])
  })

  it('[T26] estimators (PROPOSED) and office may act; a stale version is refused with the current values', async () => {
    const r = await newRequest()
    await qualify('office', r.id)
    const stale = await write(
      'estimator',
      'POST',
      action(r.id, 'online-estimate'),
      { workPackages: ['SVC-DW-01'] },
      { version: 7 },
    )
    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toMatchObject({
      error: { code: 'STALE_VERSION', current: { version: 1, values: { state: 'received' } } },
    })
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'actor_id'])
      .where('target_id', '=', r.id)
      .orderBy('seq')
      .execute()
    expect(audit.map((a) => a.action)).toEqual(['request.submit', 'request.qualify'])
  })
})
