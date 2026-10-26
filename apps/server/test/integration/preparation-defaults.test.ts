// Reviewed service-specific default preparation instructions for window offers against PostgreSQL 16 (TSK-0146;
// OWN-DEC-194 B7, HH-SCH-11, HH-CUS-02, OWN-DEC-180, RULE-NO-INVENTED-FACTS, RULE-HUMAN-REVIEW, RULE-SERVER-AUTHZ).
// Staff, customers, working hours, windows and every instruction text the test writes are synthetic
// (RULE-SYNTHETIC-DATA); the defaults taken "from the service page" are the reviewed steps of the seeded registry
// (TSK-0132). Nothing reaches a provider. One test writes a draft's instructions with the triggers off for that one
// statement (session_replication_role), as if it had been saved before the unsafe-instruction rules existed.
import { randomUUID } from 'node:crypto'
import { createDb, loadServiceSeed, syncServices, withTx, type Db } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { addLocalDays, localDateOf, servicePagePreparation } from '@handyhub/domain'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'
import { verifyPropertyZone } from '../fixtures/zones.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'preparation', 'default', 'code', 'key', 'for', 'tests', 'only', '0146'].join('-'),
})
const pw = ['synthetic', 'preparation', 'passphrase', '146'].join(' ')
const SIGNED_IN = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof SIGNED_IN)[number]
const CREW = ['ann', 'ben'] as const
type Crew = (typeof CREW)[number]

let t: TestDatabase
let wide: Db
let app: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person | Crew, string>

const today = () => localDateOf(new Date(), ZONE)
const day = (n: number) => addLocalDays(today(), n)
/** Every weekday 08:00-20:00: a synthetic fixture. */
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '08:00', end: '20:00' }))

async function signIn(server: FastifyInstance, p: Person): Promise<[string, string]> {
  const res = await signInWithMfa(server, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.146' },
    payload: { email: `${p}-preparation@example.test`, password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await server.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

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
const codes = (body: string): [string, string][] =>
  JSON.parse(body).error.fieldErrors.map((f: { field: string; code: string }) => [f.field, f.code])

beforeAll(async () => {
  t = await createTestDatabase()
  wide = createDb(t.url, { max: 16, applicationName: 'preparation-test' })
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: wide, codeKey: KEY, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of SIGNED_IN) {
      const user = await createStaffUser(tx, {
        email: `${p}-preparation@example.test`,
        displayName: `Synthetic ${p}`,
        locale: p === 'office' ? 'es' : 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
    for (const c of CREW) {
      const user = await createStaffUser(tx, {
        email: `${c}-crew-preparation@example.test`,
        displayName: `Synthetic ${c}`,
        locale: 'en',
        role: 'worker',
        issuedBy: 'test',
      })
      await sql`UPDATE identity.staff_users SET status = 'active', activated_at = now() WHERE id = ${user.id}`.execute(
        tx,
      )
      ids[c] = user.id
    }
  })
  for (const p of SIGNED_IN) [cookies[p], csrf[p]] = await signIn(app, p)
  for (const c of CREW) {
    const res = await staffWrite('owner', 'PUT', `/api/v1/staff/workers/${ids[c]}/working-hours`, { periods: WEEK }, 0)
    expect(res.statusCode, res.body).toBe(200)
  }
})
afterAll(async () => {
  await app?.close()
  await wide?.destroy()
  await t?.drop()
})

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)
type Project = { requestId: string; projectId: string; reference: string; cookie: string }
let ip = 20

/** A qualified synthetic request for these services with "Site visit needed", and a verified customer session. */
async function siteVisitProject(services: string[]): Promise<Project> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: services.map((serviceId) => ({ serviceId })),
      notSure: false,
      description: 'Synthetic preparation-default project.',
      answers: [],
      property: {
        street: `${++seq} Synthetic Preparation Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Preparation Customer',
        email: `preparation-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0164',
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
    .select(['id', 'project_id', 'contact_id'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
  await verifyCountyOf(t.db, row.project_id)
  await verifyPropertyZone(t.db, { projectId: row.project_id })
  const grant = await t.db
    .selectFrom('identity.project_access_grants')
    .select('id')
    .where('request_id', '=', row.id)
    .executeTakeFirstOrThrow()
  expect(
    (await staffWrite('owner', 'PUT', `/api/v1/staff/requests/${row.id}/qualification`, { checks: ALL_OK }, 0))
      .statusCode,
  ).toBe(200)
  const moved = await staffWrite(
    'owner',
    'POST',
    `/api/v1/staff/requests/${row.id}/actions/estimate-visit`,
    { customerExplanation: 'We need to see the synthetic work area.', workPackages: services },
    1,
  )
  expect(moved.statusCode, moved.body).toBe(200)
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, {
      contactRef: row.contact_id,
      via: 'grant',
      projectIds: [row.project_id],
      verifiedAt: new Date(),
      grantId: grant.id,
    }),
  )
  return { requestId: row.id, projectId: row.project_id, reference, cookie: `__Host-hh_customer=${s.token}` }
}

type OfferView = {
  id: string
  number: number | null
  state: string
  version: number
  preparationInstructions: string | null
  preparationBasis: string | null
}
type VisitView = { id: string; version: number; offers: OfferView[] }

async function planVisit(p: Project, date: string): Promise<VisitView> {
  const res = await staffWrite('office', 'POST', `/api/v1/staff/projects/${p.projectId}/visits`, {
    purpose: 'site_estimate',
    localDate: date,
    windowStart: '09:00',
    windowEnd: '10:00',
    expectedDurationMinutes: 60,
    travelBufferMinutes: 30,
    preparationBufferMinutes: 0,
    requiredWorkers: 1,
    equipment: [],
  })
  expect(res.statusCode, res.body).toBe(201)
  const all = res.json<{ visits: VisitView[] }>().visits
  return all[all.length - 1] as VisitView
}
const twoWindows = (date: string) => [
  { localDate: date, windowStart: '09:00', windowEnd: '10:00' },
  { localDate: date, windowStart: '14:00', windowEnd: '15:00' },
]
const offer = (v: VisitView, date: string, worker: Crew, extra: Record<string, unknown> = {}) =>
  staffWrite(
    'office',
    'POST',
    `/api/v1/staff/visits/${v.id}/offers`,
    { windows: twoWindows(date), workerIds: [ids[worker]], ...extra },
    v.version,
  )

type ServiceReview = {
  serviceId: string
  name: string
  servicePage: { version: number; text: string | null; problems: string[] } | null
  current: { id: string; version: number; text: string | null; basis: string; serviceVersion: number | null } | null
  version: number
  history: { version: number; text: string | null; basis: string; reason: string | null; approvedBy: { id: string } }[]
}
const review = async () => {
  const res = await staffGet('owner', '/api/v1/staff/preparation-defaults')
  expect(res.statusCode, res.body).toBe(200)
  return res.json<{ services: ServiceReview[] }>().services
}
const serviceReview = async (id: string) => (await review()).find((s) => s.serviceId === id) as ServiceReview
const approveDefault = (who: Person, serviceId: string, body: object) =>
  staffWrite(who, 'POST', `/api/v1/staff/services/${serviceId}/preparation-defaults`, body)
const visitDefault = (who: Person, visitId: string) =>
  staffGet(who, `/api/v1/staff/visits/${visitId}/preparation-default`)

/** The reviewed "Getting ready" steps of a service in the seeded registry (TSK-0132). */
async function reviewedSteps(serviceId: string): Promise<string> {
  const r = await t.db
    .selectFrom('catalog.services as s')
    .innerJoin('catalog.service_versions as v', (j) =>
      j.onRef('v.service_id', '=', 's.id').onRef('v.version', '=', 's.published_version'),
    )
    .select('v.content')
    .where('s.id', '=', serviceId)
    .executeTakeFirstOrThrow()
  return servicePagePreparation((r.content as { preparation: string[] }).preparation) as string
}

/** Synthetic edits the test writes (never customer wording). */
const EDITED = 'Synthetic edited step: clear the hallway.\nSynthetic edited step: keep pets in another room.'
const UNSAFE = 'Synthetic: please scrape the peeling lead paint off the ceiling before the visit.'

describe('[HH-SCH-11][OWN-DEC-194][RULE-NO-INVENTED-FACTS] B7: defaults are the Owner-approved reviewed steps; none until approved', () => {
  it('[OWN-DEC-194][RULE-NO-INVENTED-FACTS] every service starts NOT CONFIGURED; the review shows the reviewed page steps', async () => {
    const services = await review()
    expect(services).toHaveLength(26)
    for (const s of services) {
      expect(s.current, s.serviceId).toBeNull()
      expect(s.version, s.serviceId).toBe(0)
      expect(s.history, s.serviceId).toEqual([])
      // TSK-0132: every page passed the quality review; its steps meet no unsafe-instruction rule.
      expect(s.servicePage?.text, s.serviceId).toBe(await reviewedSteps(s.serviceId))
      expect(s.servicePage?.problems, s.serviceId).toEqual([])
    }
    const p = await siteVisitProject(['SVC-HI-04'])
    const v = await planVisit(p, day(3))
    const res = await visitDefault('office', v.id)
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toEqual({
      visitId: v.id,
      text: null,
      tooLong: false,
      services: [{ serviceId: 'SVC-HI-04', name: expect.any(String), state: 'not_configured', version: null }],
    })
    // No default in force: an offer with no instructions records none; staff text records staff.
    const made = await offer(v, day(3), 'ann', { draft: true, preparationInstructions: 'Synthetic staff text.' })
    expect(made.statusCode, made.body).toBe(201)
    const o = made.json<{ visits: VisitView[] }>().visits.find((x) => x.id === v.id)?.offers[0] as OfferView
    expect(o.preparationBasis).toBe('staff')
    expect(o.preparationInstructions).toBe('Synthetic staff text.')
  })

  it('[RULE-SERVER-AUTHZ][OWN-DEC-194] only the Owner reviews and approves defaults; workers never read them', async () => {
    expect((await staffGet('office', '/api/v1/staff/preparation-defaults')).statusCode).toBe(403)
    expect((await staffGet('estimator', '/api/v1/staff/preparation-defaults')).statusCode).toBe(403)
    expect((await staffGet('worker', '/api/v1/staff/preparation-defaults')).statusCode).toBe(403)
    for (const who of ['office', 'estimator', 'worker'] as const) {
      const res = await approveDefault(who, 'SVC-HI-04', { source: 'service_page', currentVersion: 0 })
      expect(res.statusCode, `${who} ${res.body}`).toBe(403)
    }
    const p = await siteVisitProject(['SVC-HI-04'])
    const v = await planVisit(p, day(4))
    expect((await visitDefault('worker', v.id)).statusCode).toBe(403)
    expect((await visitDefault('owner', randomUUID())).statusCode).toBe(404)
    expect(await t.db.selectFrom('catalog.preparation_defaults').select('id').execute()).toEqual([])
    // The database refuses a default not approved by a live Owner, whatever path writes it.
    await expect(
      t.db
        .insertInto('catalog.preparation_defaults')
        .values({ service_id: 'SVC-HI-04', version: 1, text: 'Synthetic.', basis: 'edited', approved_by: ids.office })
        .execute(),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('[OWN-DEC-194][HH-CUS-02] the Owner approves the reviewed steps or an edit, versioned; unsafe text is refused', async () => {
    const steps = await reviewedSteps('SVC-DW-01')
    const stale = await approveDefault('owner', 'SVC-DW-01', { source: 'service_page', currentVersion: 1 })
    expect(stale.statusCode, stale.body).toBe(409)
    expect(stale.json().error.code).toBe('STALE_VERSION')
    const first = await approveDefault('owner', 'SVC-DW-01', { source: 'service_page', currentVersion: 0 })
    expect(first.statusCode, first.body).toBe(200)
    expect(first.json()).toMatchObject({ serviceId: 'SVC-DW-01', version: 1, basis: 'service_page' })
    let s = await serviceReview('SVC-DW-01')
    expect(s.current).toMatchObject({ version: 1, text: steps, basis: 'service_page' })
    expect(s.current?.serviceVersion).toBe(s.servicePage?.version)
    expect(
      codes((await approveDefault('owner', 'SVC-DW-01', { source: 'service_page', currentVersion: 1 })).body),
    ).toEqual([['body.text', 'DEFAULT_UNCHANGED']])

    // Unsafe text never becomes a default; nothing is written.
    const unsafe = await approveDefault('owner', 'SVC-DW-01', { source: 'text', text: UNSAFE, currentVersion: 1 })
    expect(unsafe.statusCode, unsafe.body).toBe(400)
    expect(codes(unsafe.body)).toEqual([['body.text', 'UNSAFE_HAZARDOUS_MATERIALS']])
    expect(codes((await approveDefault('owner', 'SVC-DW-01', { source: 'text', currentVersion: 1 })).body)).toEqual([
      ['body.text', 'TEXT_REQUIRED'],
    ])

    const edited = await approveDefault('owner', 'SVC-DW-01', {
      source: 'text',
      text: `  ${EDITED}  `,
      reason: 'Synthetic: shorter for offers.',
      currentVersion: 1,
    })
    expect(edited.statusCode, edited.body).toBe(200)
    expect(edited.json()).toMatchObject({ version: 2, basis: 'edited' })
    s = await serviceReview('SVC-DW-01')
    expect(s.current).toMatchObject({ version: 2, text: EDITED, basis: 'edited' })
    expect(s.history.map((h) => [h.version, h.basis, h.reason])).toEqual([
      [2, 'edited', 'Synthetic: shorter for offers.'],
      [1, 'service_page', null],
    ])
    expect(s.history.every((h) => h.approvedBy.id === ids.owner)).toBe(true)
    // Versions are never changed.
    await expect(
      sql`UPDATE catalog.preparation_defaults SET text = 'Synthetic changed.'`.execute(t.db),
    ).rejects.toThrow()
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['summary'])
      .where('action', '=', 'visit.approve_preparation_default')
      .execute()
    expect(audit.map((a) => (a.summary as { version: number }).version).sort()).toEqual([1, 2])
    expect(JSON.stringify(audit)).not.toContain('Synthetic edited step')
  })

  it('[OWN-DEC-194] an offer starts from the default per service; several services are combined under their names', async () => {
    const one = await siteVisitProject(['SVC-DW-01'])
    const v1 = await planVisit(one, day(5))
    const d1 = (await visitDefault('office', v1.id)).json()
    expect(d1.text).toBe(EDITED)
    expect(d1.services).toEqual([{ serviceId: 'SVC-DW-01', name: expect.any(String), state: 'approved', version: 2 }])

    const two = await siteVisitProject(['SVC-DW-01', 'SVC-HI-04'])
    const v2 = await planVisit(two, day(5))
    const d2 = (await visitDefault('estimator', v2.id)).json()
    // SVC-HI-04 has no approved default: it is NOT CONFIGURED, and only SVC-DW-01's default is offered.
    expect(d2.text).toBe(EDITED)
    expect(d2.services.map((s: { state: string }) => s.state)).toEqual(['approved', 'not_configured'])
    expect((await approveDefault('owner', 'SVC-HI-04', { source: 'service_page', currentVersion: 0 })).statusCode).toBe(
      200,
    )
    const d3 = (await visitDefault('office', v2.id)).json()
    const names = d3.services.map((s: { name: string }) => s.name)
    expect(d3.text).toBe(`${names[0]}:\n${EDITED}\n\n${names[1]}:\n${await reviewedSteps('SVC-HI-04')}`)
    expect(d3.tooLong).toBe(false)

    // The Owner removes a default: the service is NOT CONFIGURED again, its history kept.
    const removed = await approveDefault('owner', 'SVC-HI-04', { source: 'none', currentVersion: 1 })
    expect(removed.statusCode, removed.body).toBe(200)
    const hi = await serviceReview('SVC-HI-04')
    expect(hi.current).toBeNull()
    expect(hi.history.map((h) => [h.version, h.basis, h.text === null])).toEqual([
      [2, 'removed', true],
      [1, 'service_page', false],
    ])
    expect((await visitDefault('office', v2.id)).json().text).toBe(EDITED)
    expect(codes((await approveDefault('owner', 'SVC-HI-04', { source: 'none', currentVersion: 2 })).body)).toEqual([
      ['source', 'NO_DEFAULT'],
    ])
  })
})

describe('[HH-SCH-11][OWN-DEC-194][HH-CUS-02] B7: staff adjust the instructions safely; the offer keeps what was sent', () => {
  it('[OWN-DEC-194][HH-CUS-02] an unsafe edit is refused and nothing is written', async () => {
    const p = await siteVisitProject(['SVC-DW-01'])
    const v = await planVisit(p, day(6))
    const res = await offer(v, day(6), 'ann', { preparationInstructions: `${EDITED}\n${UNSAFE}` })
    expect(res.statusCode, res.body).toBe(400)
    expect(codes(res.body)).toEqual([['body.preparationInstructions', 'UNSAFE_HAZARDOUS_MATERIALS']])
    const climb = await offer(v, day(6), 'ann', {
      draft: true,
      preparationInstructions: 'Synthetic: climb onto the roof and open the electrical panel.',
    })
    expect(codes(climb.body)).toEqual([
      ['body.preparationInstructions', 'UNSAFE_HEIGHTS_AND_CONFINED_SPACES'],
      ['body.preparationInstructions', 'UNSAFE_LICENSED_TRADE'],
    ])
    expect(await t.db.selectFrom('work.window_offers').select('id').where('visit_id', '=', v.id).execute()).toEqual([])
    expect(await t.db.selectFrom('work.reservations').select('id').where('visit_id', '=', v.id).execute()).toEqual([])
  })

  it('[OWN-DEC-194][HH-SCH-11] the default kept as given, or the edited text, stays with the offer and the confirmed visit', async () => {
    const p = await siteVisitProject(['SVC-DW-01'])
    const v = await planVisit(p, day(7))
    const kept = await offer(v, day(7), 'ann', { draft: true, preparationInstructions: EDITED })
    expect(kept.statusCode, kept.body).toBe(201)
    const draft = kept.json<{ visits: VisitView[] }>().visits.find((x) => x.id === v.id)?.offers[0] as OfferView
    expect(draft.preparationBasis).toBe('default')
    const d = await t.db
      .selectFrom('catalog.preparation_defaults')
      .select('id')
      .where('service_id', '=', 'SVC-DW-01')
      .where('version', '=', 2)
      .executeTakeFirstOrThrow()
    expect(
      (await t.db.selectFrom('work.window_offers').selectAll().where('id', '=', draft.id).executeTakeFirstOrThrow())
        .preparation_default_ids,
    ).toEqual([d.id])
    expect(
      (await staffWrite('office', 'POST', `/api/v1/staff/window-offers/${draft.id}/discard`, {}, draft.version))
        .statusCode,
    ).toBe(200)

    // Staff edit the default: the offer keeps the edited text, which the customer sees with the confirmed visit.
    const text = `${EDITED}\nSynthetic staff addition: leave the porch light on.`
    const after = (await staffGet('office', `/api/v1/staff/projects/${p.projectId}/visits`)).json<{
      visits: VisitView[]
    }>()
    const fresh = after.visits.find((x) => x.id === v.id) as VisitView
    const made = await offer(fresh, day(7), 'ann', { preparationInstructions: text })
    expect(made.statusCode, made.body).toBe(201)
    const o = made.json<{ visits: VisitView[] }>().visits.find((x) => x.id === v.id)?.offers[0] as OfferView
    expect(o).toMatchObject({ state: 'open', preparationInstructions: text, preparationBasis: 'edited' })
    // A later change of the default never changes an offer already made.
    expect(
      (
        await approveDefault('owner', 'SVC-DW-01', {
          source: 'text',
          text: 'Synthetic later default.',
          currentVersion: 2,
        })
      ).statusCode,
    ).toBe(200)
    const selected = await app.inject({
      method: 'POST',
      url: `/api/v1/customer/projects/${p.reference}/window-offers/${o.number}/select`,
      payload: { position: 1 },
      headers: { cookie: p.cookie, 'idempotency-key': key('select'), 'x-forwarded-for': '203.0.113.146' },
    })
    expect(selected.statusCode, selected.body).toBe(200)
    const tab = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/projects/${p.reference}/appointments`,
      headers: { cookie: p.cookie },
    })
    expect(tab.statusCode, tab.body).toBe(200)
    expect(tab.json().appointments.map((a: { preparationInstructions: string }) => a.preparationInstructions)).toEqual([
      text,
    ])
    // The offer keeps its instructions and their basis: the database refuses a change.
    await expect(
      sql`UPDATE work.window_offers SET preparation_basis = 'default' WHERE id = ${o.id}`.execute(t.db),
    ).rejects.toThrow()
  })

  it('[OWN-DEC-194] a draft is checked again when it is published', async () => {
    const p = await siteVisitProject(['SVC-DW-01'])
    const v = await planVisit(p, day(8))
    const made = await offer(v, day(8), 'ben', { draft: true })
    expect(made.statusCode, made.body).toBe(201)
    const draft = made.json<{ visits: VisitView[] }>().visits.find((x) => x.id === v.id)?.offers[0] as OfferView
    // A default was in force and staff sent nothing: the offer records the default as removed.
    expect(draft).toMatchObject({ preparationInstructions: null, preparationBasis: 'edited' })
    // A draft whose instructions predate the rules (see the header).
    await withTx(t.db, async (tx) => {
      await sql`SET LOCAL session_replication_role = replica`.execute(tx)
      await sql`UPDATE work.window_offers SET preparation_instructions = ${UNSAFE} WHERE id = ${draft.id}`.execute(tx)
    })
    const res = await staffWrite('office', 'POST', `/api/v1/staff/window-offers/${draft.id}/publish`, {}, draft.version)
    expect(res.statusCode, res.body).toBe(409)
    expect(codes(res.body)).toEqual([['preparationInstructions', 'UNSAFE_HAZARDOUS_MATERIALS']])
    const row = await t.db.selectFrom('work.window_offers').selectAll().where('id', '=', draft.id).executeTakeFirst()
    expect(row?.state).toBe('draft')
  })
})
