// Appointment reminder drafts 24 hours before, staff-released and rechecked, against PostgreSQL 16 (TSK-0067;
// HH-COM-11, HH-COM-05, HH-COM-06, HH-COM-09, T65, OWN-DEC-78, OWN-DEC-107, FACT-REMINDER-CADENCES, ENT-Visit,
// ENT-Message, RULE-DECIDED-VALUES-ACTIVE, RULE-SERVER-AUTHZ). Staff, customers, working hours, addresses and
// preparation steps are synthetic (RULE-SYNTHETIC-DATA): the hours below are test fixtures, never the business's
// hours. Nothing reaches a real provider: the fakes record what would be sent, and no reminder wording is approved,
// so a released reminder is recorded as template_not_configured.
// - "Time passes": a reminder job's run time is brought forward in the database, as in the estimate reminder tests.
// - "Confirmed less than 24 hours ahead": the interval is raised for one test (a synthetic configuration version),
//   since the visit hours do not let a test place a visit exactly so many hours from now.
import { randomUUID } from 'node:crypto'
import { createDb, loadServiceSeed, syncServices, withTx, type Db } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { addLocalDays, localDateOf } from '@handyhub/domain'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { StaffActor } from '@handyhub/policy'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { RELEASE_RECORD_CHECKS, releaseFailureItem } from '../../src/automations.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { nextContactTime, releaseAutomation } from '../../src/modules/notifications/index.js'
import { recordTap } from '../../src/modules/field/taps.js'
import { customerPlan, reapplyDeletions } from '../../src/modules/privacy/index.js'
import {
  appointmentReminderAutomations,
  appointmentReminderRecordCheck,
  appointmentReminderSubject,
} from '../../src/modules/visits/index.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { loadConfig, recordPolicyVersion } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { createProviders } from '../../src/providers/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { testConfig } from '../fixtures/env.js'
import { verifyPropertyZone } from '../fixtures/zones.js'

const ZONE = 'America/Kentucky/Louisville'
const SITE = 'http://127.0.0.1:4610'
const MESSAGE = 'reminder.appointment'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'reminders', 'code', 'key', 'for', 'tests', 'only', '0067'].join('-'),
})
const pw = ['synthetic', 'appointment', 'reminders', 'passphrase', '67'].join(' ')
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
/** A day of its own for each booking, so the synthetic crew is never double-booked. */
let nextDay = 3
const freshDay = () => day(nextDay++)
/** Every weekday 08:00-20:00: a synthetic fixture. */
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '08:00', end: '20:00' }))

const p = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
if (!p.fakes.email || !p.fakes.sms || !p.email || !p.sms) throw new Error('ci uses the fakes')
const fakeEmail = p.fakes.email
const fakeSms = p.fakes.sms
const fast = (a: Automation): Automation => ({ ...a, retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 } })
// The one notify.release registration's checks and delivery issues, as the server registers them (automations.ts).
const release = releaseAutomation(
  { email: p.email, sms: p.sms },
  { recordChecks: RELEASE_RECORD_CHECKS, failureItem: releaseFailureItem },
)
const registry = createAutomationRegistry([...appointmentReminderAutomations({ publicSiteUrl: SITE }), fast(release)])

async function signIn(who: Person): Promise<[string, string]> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.170' },
    payload: { email: `${who}-reminders@example.test`, password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

let seq = 0
const key = (what: string) => `synthetic-${what}-${String(++seq).padStart(6, '0')}-${randomUUID()}`
function staffWrite(
  who: Person,
  url: string,
  payload: unknown = {},
  version?: number,
  method: 'POST' | 'PUT' = 'POST',
) {
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

async function setCadences(value: unknown) {
  await recordPolicyVersion(t.db, {
    key: 'reminders.cadences',
    value: value as never,
    sourceIds: ['TEST-SYNTHETIC'],
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
}
/** The seeded cadences (migration 0005), restored after a test changed them. */
let seeded: unknown

beforeAll(async () => {
  t = await createTestDatabase()
  wide = createDb(t.url, { max: 8, applicationName: 'appointment-reminders-test' })
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: wide, codeKey: KEY, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const who of SIGNED_IN) {
      const user = await createStaffUser(tx, {
        email: `${who}-reminders@example.test`,
        displayName: `Synthetic ${who}`,
        locale: who === 'office' ? 'es' : 'en',
        role: who,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[who] = user.id
    }
    for (const c of CREW) {
      const user = await createStaffUser(tx, {
        email: `${c}-crew-reminders@example.test`,
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
  for (const who of SIGNED_IN) [cookies[who], csrf[who]] = await signIn(who)
  for (const c of CREW) {
    const res = await staffWrite('owner', `/api/v1/staff/workers/${ids[c]}/working-hours`, { periods: WEEK }, 0, 'PUT')
    expect(res.statusCode, res.body).toBe(200)
  }
  const cadences = (await loadConfig(t.db)).get('reminders.cadences')
  if (cadences.state !== 'CONFIGURED') throw new Error('migration 0005 seeds reminders.cadences')
  seeded = cadences.value
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
type Project = { requestId: string; projectId: string; reference: string; cookie: string; street: string }
let ip = 30

/** A qualified synthetic request with "Site visit needed", and a verified customer session for its project. */
async function siteVisitProject(): Promise<Project> {
  const street = `${++seq} Synthetic Reminder Row`
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic reminder project.',
      answers: [],
      property: { street, city: 'Testville', state: 'ky', zip: '40000', propertyType: 'house' },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Reminder Customer',
        email: `reminders-${seq}-${randomUUID().slice(0, 8)}@example.test`,
        phone: '(502) 555-0167',
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
  // TSK-0123: the property's zone is unknown until verified; these tests plan visits, so it is verified first.
  await verifyPropertyZone(t.db, { projectId: row.project_id })
  const grant = await t.db
    .selectFrom('identity.project_access_grants')
    .select('id')
    .where('request_id', '=', row.id)
    .executeTakeFirstOrThrow()
  expect(
    (await staffWrite('owner', `/api/v1/staff/requests/${row.id}/qualification`, { checks: ALL_OK }, 0, 'PUT'))
      .statusCode,
  ).toBe(200)
  const moved = await staffWrite(
    'owner',
    `/api/v1/staff/requests/${row.id}/actions/estimate-visit`,
    { customerExplanation: 'We need to see the synthetic ceiling.', workPackages: ['SVC-DW-01'] },
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
  return {
    requestId: row.id,
    projectId: row.project_id,
    reference,
    cookie: `__Host-hh_customer=${s.token}`,
    street,
  }
}

type VisitView = { id: string; number: number; state: string; version: number; windowVersion: number }
const visitOf = async (projectId: string, visitId: string) => {
  const res = await staffGet('office', `/api/v1/staff/projects/${projectId}/visits`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<{ visits: VisitView[] }>().visits.find((v) => v.id === visitId) as VisitView
}
const PLAN = {
  windowStart: '09:00',
  windowEnd: '10:00',
  expectedDurationMinutes: 60,
  travelBufferMinutes: 30,
  preparationBufferMinutes: 0,
  requiredWorkers: 1,
  equipment: [],
}
async function planVisit(pr: Project, date: string): Promise<VisitView> {
  const res = await staffWrite('office', `/api/v1/staff/projects/${pr.projectId}/visits`, {
    ...PLAN,
    purpose: 'site_estimate',
    localDate: date,
  })
  expect(res.statusCode, res.body).toBe(201)
  const all = res.json<{ visits: VisitView[] }>().visits
  return all[all.length - 1] as VisitView
}
/** A confirmed estimate visit: planned by Office and confirmed with one worker. */
async function bookedVisit(pr: Project, date: string, worker: Crew = 'ann'): Promise<VisitView> {
  const v = await planVisit(pr, date)
  const res = await staffWrite(
    'office',
    `/api/v1/staff/visits/${v.id}/confirm`,
    { workerIds: [ids[worker]] },
    v.version,
  )
  expect(res.statusCode, res.body).toBe(200)
  return visitOf(pr.projectId, v.id)
}

/** Runs the worker until nothing is left to do now. */
async function drain() {
  const w = createWorker({ db: t.db, registry })
  for (let i = 0; i < 12; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) return
  }
}
const draftJobs = (visitId: string) =>
  t.db
    .selectFrom('platform.jobs')
    .select(['job_key', 'run_at', 'state', 'payload'])
    .where('automation', '=', 'appointment.reminder_draft')
    .where('target_id', '=', visitId)
    .orderBy('seq')
    .execute()
/** Time passes: the visit's reminder draft job (for its window version) becomes due now. */
async function due(visitId: string, windowVersion: number) {
  await sql`UPDATE platform.jobs SET run_at = now() WHERE automation = 'appointment.reminder_draft'
            AND job_key = ${`appointment.reminder_draft:${visitId}:w${windowVersion}`}`.execute(t.db)
  await drain()
}
/** The contact hours pass: a released reminder's send job becomes due now. */
async function sendNow(deliveryId: string) {
  await sql`UPDATE platform.jobs SET run_at = now() WHERE automation = 'notify.release'
            AND job_key LIKE ${`notify.release:${deliveryId}%`} AND state = 'queued'`.execute(t.db)
  await drain()
}
const reminders = (visitId: string) =>
  t.db
    .selectFrom('platform.message_deliveries')
    .selectAll()
    .where('record_type', '=', 'visit')
    .where('record_id', '=', visitId)
    .where('message_key', '=', MESSAGE)
    .orderBy('seq')
    .execute()
const itemsOf = (type: string, subjectId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .selectAll()
    .where('type', '=', type)
    .where('subject_id', '=', subjectId)
    .orderBy('opened_at')
    .execute()
const auditOf = (action: string, targetId: string) =>
  t.db
    .selectFrom('platform.audit_events')
    .selectAll()
    .where('action', '=', action)
    .where('target_id', '=', targetId)
    .orderBy('seq')
    .execute()

type View = {
  visitState: string
  cadence: { state: string; hoursBefore?: number; contactHoursOnly?: boolean; draftAt?: string }
  stoppedBy: string | null
  reminders: {
    id: string
    windowVersion: number | null
    current: boolean
    state: string
    channel: string
    reason: string | null
    content: { visitWindow: string; serviceAddress: string; preparationSteps: string | null }
    releasedBy: { id: string } | null
    sendAt: string | null
    cancelledBy: { id: string } | 'system' | null
    actions: { release: boolean; dismiss: boolean }
  }[]
}
const view = async (visitId: string, who: Person = 'office') => {
  const res = await staffGet(who, `/api/v1/staff/visits/${visitId}/reminders`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<View>()
}
const releaseIt = (id: string, who: Person = 'office') =>
  staffWrite(who, `/api/v1/staff/appointment-reminders/${id}/release`)
const dismissIt = (id: string, who: Person = 'office') =>
  staffWrite(who, `/api/v1/staff/appointment-reminders/${id}/dismiss`)
const move = (v: VisitView, date: string) =>
  staffWrite(
    'office',
    `/api/v1/staff/visits/${v.id}/window`,
    { localDate: date, windowStart: '11:00', windowEnd: '12:00', reason: 'Synthetic: the customer asked to move it.' },
    v.version,
  )
const cancel = (v: VisitView) =>
  staffWrite(
    'office',
    `/api/v1/staff/visits/${v.id}/cancel`,
    { reason: 'Synthetic: the customer cancelled.', initiator: 'customer' },
    v.version,
  )

/** A booked visit whose reminder draft is prepared now (its time brought forward). */
async function drafted(date = freshDay()) {
  const pr = await siteVisitProject()
  const v = await bookedVisit(pr, date)
  await drain()
  await due(v.id, v.windowVersion)
  const [row] = await reminders(v.id)
  if (!row) throw new Error('the reminder was drafted')
  return { pr, v, row }
}

describe('[HH-COM-11][FACT-REMINDER-CADENCES][OWN-DEC-107] a reminder draft 24 hours before each confirmed visit', () => {
  it('[HH-COM-11][T65] confirming schedules one draft 24 hours before the window; at its time a staff-released draft with its queue item, never sent', async () => {
    const pr = await siteVisitProject()
    const v = await bookedVisit(pr, freshDay())
    expect(v.state).toBe('confirmed')
    await drain()
    const [job] = await draftJobs(v.id)
    const visit = await t.db
      .selectFrom('work.visits')
      .select('starts_at')
      .where('id', '=', v.id)
      .executeTakeFirstOrThrow()
    // 24 hours before the arrival window starts (reminders.cadences.appointment.hoursBefore, OWN-DEC-107).
    expect(new Date(visit.starts_at).getTime() - new Date(job?.run_at as Date).getTime()).toBe(24 * 3_600_000)
    expect([job?.state, job?.payload]).toEqual(['queued', { windowVersion: v.windowVersion, cadenceVersion: 1 }])
    // Not yet due: nothing drafted.
    expect(await reminders(v.id)).toEqual([])
    await due(v.id, v.windowVersion)
    const rows = await reminders(v.id)
    expect(rows.map((r) => [r.state, r.release, r.channel, r.subject_key])).toEqual([
      ['draft', 'staff_released', 'email', appointmentReminderSubject(v.id, v.windowVersion)],
    ])
    const values = rows[0]?.variables as Record<string, string>
    expect(values['serviceAddress']).toBe(`${pr.street}, Testville, KY 40000`)
    expect(values['visitWindow']).toContain('9:00')
    expect(values['projectLink']).toBe(`${SITE}/portal/p/${encodeURIComponent(pr.reference)}`)
    // No preparation steps were given (the visit was confirmed by staff, not from an offer): none is made up.
    expect(values['preparationSteps']).toBeUndefined()
    const [item] = await itemsOf('appointment_reminder', v.id)
    expect(item).toMatchObject({ reason: 'appointment_reminder', resolved_at: null })
    expect(item?.subject_status).toBe('draft')
    expect(new Date(item?.due_at as Date).getTime()).toBe(new Date(visit.starts_at).getTime())
    expect(await auditOf('appointment_reminder.drafted', rows[0]?.id as string)).toHaveLength(1)
    // The worker runs again: still a draft, nothing sent (OWN-DEC-78: staff release every reminder).
    await drain()
    expect((await reminders(v.id)).map((r) => r.state)).toEqual(['draft'])
    expect(fakeEmail.sent.filter((m) => m.to === rows[0]?.destination)).toHaveLength(0)
    const shown = await view(v.id)
    expect(shown).toMatchObject({
      visitState: 'confirmed',
      cadence: { state: 'CONFIGURED', hoursBefore: 24, contactHoursOnly: true },
      stoppedBy: null,
    })
    expect(shown.reminders).toEqual([
      expect.objectContaining({
        windowVersion: v.windowVersion,
        current: true,
        state: 'draft',
        channel: 'email',
        content: {
          visitWindow: values['visitWindow'],
          serviceAddress: values['serviceAddress'],
          preparationSteps: null,
        },
        actions: { release: true, dismiss: true },
      }),
    ])
  })

  it('[HH-COM-11][OWN-DEC-107] the preparation steps staff gave with the offered windows are in the draft', async () => {
    const pr = await siteVisitProject()
    const date = freshDay()
    const v = await planVisit(pr, date)
    const windows = ['09:00', '12:00'].map((start) => ({
      localDate: date,
      windowStart: start,
      windowEnd: `${String(Number(start.slice(0, 2)) + 1).padStart(2, '0')}:00`,
    }))
    const offered = await staffWrite(
      'office',
      `/api/v1/staff/visits/${v.id}/offers`,
      { windows, workerIds: [ids.ben], preparationInstructions: 'Synthetic: please clear a path to the ceiling.' },
      v.version,
    )
    expect(offered.statusCode, offered.body).toBe(201)
    const selected = await app.inject({
      method: 'POST',
      url: `/api/v1/customer/projects/${pr.reference}/window-offers/1/select`,
      payload: { position: 2 },
      headers: { cookie: pr.cookie, 'idempotency-key': key('select'), 'x-forwarded-for': `203.0.113.${++ip}` },
    })
    expect(selected.statusCode, selected.body).toBe(200)
    await drain()
    const after = await visitOf(pr.projectId, v.id)
    expect(after.state).toBe('confirmed')
    await due(v.id, after.windowVersion)
    const [row] = await reminders(v.id)
    expect((row?.variables as Record<string, string>)['preparationSteps']).toBe(
      'Synthetic: please clear a path to the ceiling.',
    )
    expect((row?.variables as Record<string, string>)['visitWindow']).toContain('12:00')
  })

  it('[HH-COM-11][OWN-DEC-107] confirmed less than the interval ahead, the draft is prepared at once', async () => {
    // Synthetic: the interval is raised past the visit's distance (see the header); restored afterwards.
    await setCadences({ ...(seeded as object), appointment: { hoursBefore: 24 * 30, contactHoursOnly: true } })
    try {
      const pr = await siteVisitProject()
      const v = await bookedVisit(pr, freshDay())
      await drain()
      const [job] = await draftJobs(v.id)
      expect(job?.state).toBe('succeeded')
      expect((await reminders(v.id)).map((r) => r.state)).toEqual(['draft'])
    } finally {
      await setCadences(seeded)
    }
  })

  it('[RULE-DECIDED-VALUES-ACTIVE] while the cadence is NOT CONFIGURED no reminder is scheduled', async () => {
    await setCadences(null)
    try {
      const pr = await siteVisitProject()
      const v = await bookedVisit(pr, freshDay())
      await drain()
      expect(await draftJobs(v.id)).toEqual([])
      expect((await view(v.id)).cadence).toEqual({ state: 'NOT_CONFIGURED' })
    } finally {
      await setCadences(seeded)
    }
  })
})

describe('[HH-COM-11][HH-COM-09][T65] staff release; it sends inside the contact hours and is rechecked at send time', () => {
  it('a released reminder waits for the contact hours; without approved wording it is recorded as not configured, never as sent', async () => {
    const { v, row } = await drafted()
    const before = Date.now()
    const res = await releaseIt(row.id)
    expect(res.statusCode, res.body).toBe(200)
    const [job] = await t.db
      .selectFrom('platform.jobs')
      .select(['run_at'])
      .where('job_key', '=', `notify.release:${row.id}`)
      .execute()
    // HH-COM-09: an appointment reminder is held to the daily contact hours (now, or the next opening).
    const config = await loadConfig(t.db)
    const hours = config.get('contact.hours')
    const zone = config.get('business.timezone')
    if (hours.state !== 'CONFIGURED' || zone.state !== 'CONFIGURED') throw new Error('seeded by migration 0005')
    const expected = nextContactTime(new Date(before), hours.value, zone.value.zone).getTime()
    expect(Math.abs(new Date(job?.run_at as Date).getTime() - Math.max(expected, before))).toBeLessThan(60_000)
    const shown = await view(v.id)
    expect(shown.reminders[0]).toMatchObject({ state: 'queued', releasedBy: { id: ids.office } })
    expect(shown.reminders[0]?.sendAt).not.toBeNull()
    expect((await itemsOf('appointment_reminder', v.id))[0]?.resolution).toBe('released')
    expect(await auditOf('message.released', row.id)).toHaveLength(1)
    await sendNow(row.id)
    const [sent] = await reminders(v.id)
    // No template version of reminder.appointment is released (OQ-APPOINTMENT-REMINDER-WORDING).
    expect([sent?.state, sent?.error_code]).toEqual(['failed', 'template_not_configured'])
    expect(fakeEmail.sent.filter((m) => m.to === row.destination)).toHaveLength(0)
    // OWN-DEC-107: delivery failures are recorded for staff, as a delivery issue with Retry.
    const [issue] = await itemsOf('delivery_failed', row.id)
    expect(issue).toMatchObject({ reason: 'delivery_not_configured', project_id: row.project_id, resolved_at: null })
    const retried = await staffWrite('office', `/api/v1/staff/message-deliveries/${row.id}/retry`)
    expect(retried.statusCode, retried.body).toBe(200)
    expect((await reminders(v.id))[0]?.state).toBe('queued')
  })

  it('[T65] a cancelled visit’s reminder never sends: a waiting draft is cancelled with the cancellation', async () => {
    const { v, row } = await drafted()
    const res = await cancel(await visitOf(row.project_id as string, v.id))
    expect(res.statusCode, res.body).toBe(200)
    const [after] = await reminders(v.id)
    expect([after?.state, after?.error_code, after?.cancelled_by]).toEqual(['cancelled', 'visit_canceled', 'system'])
    expect(await auditOf('appointment_reminder.stop', row.id)).toHaveLength(1)
    expect((await itemsOf('appointment_reminder', v.id))[0]?.resolved_at).not.toBeNull()
    await drain()
    expect((await reminders(v.id))[0]?.state).toBe('cancelled')
    const shown = await view(v.id)
    expect(shown.stoppedBy).toBe('visit_canceled')
    expect(shown.reminders[0]?.actions).toEqual({ release: false, dismiss: false })
    expect(codes((await releaseIt(row.id)).body)).toEqual([['reminder', 'REMINDER_NOT_DRAFT']])
  })

  it('[T65][HH-COM-05] a cancelled visit’s reminder never sends: released and waiting for the contact hours, it is cancelled', async () => {
    const { v, row } = await drafted()
    expect((await releaseIt(row.id)).statusCode).toBe(200)
    // The send job is still waiting (as if released at 11 PM): the visit is cancelled first.
    await sql`UPDATE platform.jobs SET run_at = now() + interval '8 hours' WHERE job_key = ${`notify.release:${row.id}`}`.execute(
      t.db,
    )
    expect((await cancel(await visitOf(row.project_id as string, v.id))).statusCode).toBe(200)
    expect((await reminders(v.id)).map((r) => [r.state, r.error_code])).toEqual([['cancelled', 'visit_canceled']])
    await sendNow(row.id)
    expect((await reminders(v.id)).map((r) => [r.state, r.provider_message_id])).toEqual([['cancelled', null]])
    expect(fakeEmail.sent.filter((m) => m.to === row.destination)).toHaveLength(0)
  })

  it('[T65][HH-COM-05] the send-time recheck refuses a reminder whose visit is no longer confirmed', async () => {
    const { v, row } = await drafted()
    const check = (subjectKey = row.subject_key) =>
      withTx(t.db, (tx) =>
        appointmentReminderRecordCheck(tx, { recordType: 'visit', recordId: v.id, messageKey: MESSAGE, subjectKey }),
      )
    expect(await check()).toBe('current')
    // Another message type about the same record is not this check's.
    expect(
      await withTx(t.db, (tx) =>
        appointmentReminderRecordCheck(tx, {
          recordType: 'visit',
          recordId: v.id,
          messageKey: 'appointment.changed',
          subjectKey: 'x',
        }),
      ),
    ).toBe('current')
    // An earlier window's reminder is outdated.
    expect(await check(appointmentReminderSubject(v.id, v.windowVersion + 1))).toEqual({
      stale: 'visit_rescheduled',
    })
    expect((await cancel(await visitOf(row.project_id as string, v.id))).statusCode).toBe(200)
    expect(await check()).toEqual({ stale: 'visit_canceled' })
  })

  it('[T65][HH-COM-11] a reschedule cancels the old window’s reminder and drafts the new window’s at its time', async () => {
    const { pr, v, row } = await drafted()
    const moved = await move(await visitOf(pr.projectId, v.id), freshDay())
    expect(moved.statusCode, moved.body).toBe(200)
    const [old] = await reminders(v.id)
    expect([old?.id, old?.state, old?.error_code]).toEqual([row.id, 'cancelled', 'visit_rescheduled'])
    expect(await auditOf('appointment_reminder.stop', row.id)).toHaveLength(1)
    await drain()
    const after = await visitOf(pr.projectId, v.id)
    expect(after.windowVersion).toBe(v.windowVersion + 1)
    const jobs = await draftJobs(v.id)
    expect(jobs.map((j) => [j.job_key.split(':').at(-1), j.state])).toEqual([
      [`w${v.windowVersion}`, 'succeeded'],
      [`w${after.windowVersion}`, 'queued'],
    ])
    await due(v.id, after.windowVersion)
    const rows = await reminders(v.id)
    expect(rows.map((r) => [r.subject_key, r.state])).toEqual([
      [appointmentReminderSubject(v.id, v.windowVersion), 'cancelled'],
      [appointmentReminderSubject(v.id, after.windowVersion), 'draft'],
    ])
    expect((rows[1]?.variables as Record<string, string>)['visitWindow']).toContain('11:00')
    const shown = await view(v.id)
    expect(shown.reminders.map((r) => [r.current, r.actions.release])).toEqual([
      [false, false],
      [true, true],
    ])
  })

  it('[T65] a released reminder rescheduled before it sends is suppressed at send time, never sent', async () => {
    const { pr, v, row } = await drafted()
    expect((await releaseIt(row.id)).statusCode).toBe(200)
    await sql`UPDATE platform.jobs SET run_at = now() + interval '8 hours' WHERE job_key = ${`notify.release:${row.id}`}`.execute(
      t.db,
    )
    expect((await move(await visitOf(pr.projectId, v.id), freshDay())).statusCode).toBe(200)
    expect((await reminders(v.id)).map((r) => [r.state, r.error_code])).toEqual([['cancelled', 'visit_rescheduled']])
    await sendNow(row.id)
    expect(fakeEmail.sent.filter((m) => m.to === row.destination)).toHaveLength(0)
  })

  it('[HH-COM-11] a reassignment keeps the reminder (PROPOSED: its date, window, address and preparation do not change)', async () => {
    const { pr, v, row } = await drafted()
    const res = await staffWrite(
      'office',
      `/api/v1/staff/visits/${v.id}/reassign`,
      { workerIds: [ids.ben], reason: 'Synthetic: Ann is needed elsewhere.' },
      (await visitOf(pr.projectId, v.id)).version,
    )
    expect(res.statusCode, res.body).toBe(200)
    await drain()
    expect((await reminders(v.id)).map((r) => [r.id, r.state])).toEqual([[row.id, 'draft']])
    expect((await draftJobs(v.id)).length).toBe(1)
  })

  it('[HH-COM-11] the database cancels a waiting reminder when the visit leaves confirmed any other way (migration 0060)', async () => {
    const { v, row } = await drafted()
    await sql`UPDATE work.visits SET state = 'no_access', version = version + 1 WHERE id = ${v.id}`.execute(t.db)
    const [after] = await reminders(v.id)
    expect([after?.state, after?.error_code, after?.cancelled_by]).toEqual(['cancelled', 'visit_no_access', 'system'])
    expect((await itemsOf('appointment_reminder', v.id))[0]?.resolution).toBe('visit_no_access')
    expect(codes((await releaseIt(row.id)).body)).toEqual([['reminder', 'REMINDER_NOT_DRAFT']])
  })

  it('[HH-COM-11][HH-SCH-08][T65] On my way (TSK-0070) cancels the waiting reminder in its own transaction, audited, and resolves its queue item', async () => {
    const { v, row } = await drafted()
    const visit = await t.db
      .selectFrom('work.visits')
      .select(['starts_at'])
      .where('id', '=', v.id)
      .executeTakeFirstOrThrow()
    // The tap's own transaction, an hour before the window (the On my way rule allows three hours, OWN-DEC-107).
    const ann: StaffActor = {
      kind: 'staff',
      userId: ids.ann,
      roles: ['worker'],
      capabilities: [],
      status: 'active',
      freshAuth: false,
    }
    const tapped = await withTx(t.db, (tx) =>
      recordTap(tx, ann, v.id, 'on_my_way', {}, new Date(new Date(visit.starts_at).getTime() - 60 * 60_000)),
    )
    expect(tapped).toMatchObject({ recorded: true, toState: 'en_route', moved: true })
    const [after] = await reminders(v.id)
    expect([after?.state, after?.error_code, after?.cancelled_by]).toEqual(['cancelled', 'visit_en_route', 'system'])
    // Cancelled by the application with its audit entry, not only by the database backstop (migration 0060).
    expect((await auditOf('appointment_reminder.stop', row.id)).map((a) => a.summary)).toEqual([
      expect.objectContaining({ messageKey: MESSAGE, reason: 'visit_en_route' }),
    ])
    expect((await itemsOf('appointment_reminder', v.id))[0]?.resolved_at).not.toBeNull()
    expect(codes((await releaseIt(row.id)).body)).toEqual([['reminder', 'REMINDER_NOT_DRAFT']])
  })

  it('[HH-COM-11][HH-COM-05] a release rechecks the visit: a reminder sent already for the window is refused as a duplicate', async () => {
    const { v, row } = await drafted()
    // A second draft of the same window on another channel (as if the customer's channel changed), and the first one
    // handed to the provider: the second is a duplicate.
    await sql`INSERT INTO platform.message_deliveries (message_key, channel, audience, subject_key, release, state, locale,
                record_type, record_id, recipient_kind, recipient_id, destination, channel_permission, variables,
                project_id)
              SELECT message_key, 'sms', audience, subject_key, release, 'draft', locale, record_type, record_id,
                recipient_kind, recipient_id, '+15025550167', 'permitted', variables, project_id
                FROM platform.message_deliveries WHERE id = ${row.id}`.execute(t.db)
    await sql`UPDATE platform.message_deliveries SET state = 'sent', released_by = ${ids.office}, queued_at = now(),
                provider = 'fake', provider_message_id = 'synthetic-provider-message-67'
              WHERE id = ${row.id}`.execute(t.db)
    const second = (await reminders(v.id))[1]
    const res = await releaseIt(second?.id as string)
    expect(res.statusCode).toBe(409)
    expect(codes(res.body)).toEqual([['reminder', 'already_reminded']])
    expect((await reminders(v.id)).map((r) => [r.state, r.error_code])).toEqual([
      ['sent', null],
      ['cancelled', 'already_reminded'],
    ])
    expect(fakeSms.sent).toHaveLength(0)
  })

  it('[HH-COM-11] changed preparation steps or address refresh the draft for review before it is sent', async () => {
    const { v, row } = await drafted()
    await sql`UPDATE platform.message_deliveries SET variables = variables || '{"serviceAddress": "Synthetic old address"}'::jsonb
              WHERE id = ${row.id}`.execute(t.db)
    const res = await releaseIt(row.id)
    expect(res.statusCode).toBe(409)
    expect(codes(res.body)).toEqual([['reminder', 'details_changed']])
    const [after] = await reminders(v.id)
    expect(after?.state).toBe('draft')
    expect((after?.variables as Record<string, string>)['serviceAddress']).toBe(
      (row.variables as Record<string, string>)['serviceAddress'],
    )
    expect((await releaseIt(row.id)).statusCode).toBe(200)
  })
})

describe('[HH-COM-11][RULE-SERVER-AUTHZ] who reviews, sends and dismisses', () => {
  it('dismiss keeps the draft as cancelled with who dismissed it; a second dismiss is a conflict', async () => {
    const { v, row } = await drafted()
    const res = await dismissIt(row.id, 'owner')
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json<View>().reminders[0]).toMatchObject({
      state: 'cancelled',
      reason: 'dismissed',
      cancelledBy: { id: ids.owner },
    })
    expect((await itemsOf('appointment_reminder', v.id))[0]?.resolution).toBe('dismissed')
    expect(await auditOf('appointment_reminder.dismiss', row.id)).toHaveLength(1)
    expect(codes((await dismissIt(row.id, 'owner')).body)).toEqual([['reminder', 'REMINDER_NOT_DRAFT']])
  })

  it('an Estimator sees the reminders but cannot send them; a worker and a customer reach nothing', async () => {
    const { pr, v, row } = await drafted()
    const est = await view(v.id, 'estimator')
    expect(est.reminders[0]?.actions).toEqual({ release: false, dismiss: false })
    expect((await releaseIt(row.id, 'estimator')).statusCode).toBe(403)
    expect((await dismissIt(row.id, 'estimator')).statusCode).toBe(403)
    expect((await staffGet('worker', `/api/v1/staff/visits/${v.id}/reminders`)).statusCode).toBe(403)
    expect((await releaseIt(row.id, 'worker')).statusCode).toBe(403)
    const customer = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/appointment-reminders/${row.id}/release`,
      payload: {},
      headers: { cookie: pr.cookie, 'idempotency-key': key('customer') },
    })
    expect([401, 403]).toContain(customer.statusCode)
    expect((await reminders(v.id))[0]?.state).toBe('draft')
    // Another message's delivery is not an appointment reminder.
    expect((await releaseIt(randomUUID())).statusCode).toBe(404)
  })
})

describe('[HH-PRIV-03][HH-COM-11] appointment reminders in a privacy request (TSK-0100 x TSK-0067)', () => {
  it("[HH-PRIV-03][HH-COM-11] the search keeps a visit's reminders with the job records; deleting the project's estimate never accepted leaves the draft and its queue item", async () => {
    // The estimate terms version is a fixture of this throwaway database (publishing names it).
    await recordPolicyVersion(t.db, {
      key: 'legal.estimate_terms',
      value: {
        documentId: ESTIMATE_TERMS.documentId,
        status: 'approved',
        attorneyReviewed: true,
        preparedOn: ESTIMATE_TERMS.preparedOn,
        contentSha256: ESTIMATE_TERMS.contentSha256,
      },
      sourceIds: ['TEST-SYNTHETIC'],
      changedBy: 'test',
      reason: 'synthetic test configuration',
    })
    const { pr, v, row } = await drafted()
    const created = await staffWrite('estimator', `/api/v1/staff/projects/${pr.projectId}/estimates`)
    expect(created.statusCode, created.body).toBe(201)
    const lost = created.json<{ estimateId: string; number: string; versionId: string }>()
    const draft = (await staffGet('estimator', `/api/v1/staff/estimate-versions/${lost.versionId}`)).json<{
      rowVersion: number
      workPackages: { id: string }[]
    }>()
    const saved = await staffWrite(
      'estimator',
      `/api/v1/staff/estimate-versions/${lost.versionId}/draft`,
      {
        lines: [
          {
            kind: 'base',
            workPackageId: draft.workPackages[0]?.id,
            description: 'Synthetic: the withdrawn ceiling patch',
            quantity: '1',
            unit: 'patch',
            unitPriceCents: 900,
          },
        ],
        texts: {},
      },
      draft.rowVersion,
      'PUT',
    )
    expect(saved.statusCode, saved.body).toBe(200)
    const published = await staffWrite(
      'estimator',
      `/api/v1/staff/estimate-versions/${lost.versionId}/publish`,
      {},
      saved.json<{ rowVersion: number }>().rowVersion,
    )
    expect(published.statusCode, published.body).toBe(200)
    const withdrawn = await staffWrite(
      'estimator',
      `/api/v1/staff/estimate-versions/${lost.versionId}/withdraw`,
      { reason: 'Synthetic: sent by mistake.' },
      published.json<{ rowVersion: number }>().rowVersion,
    )
    expect(withdrawn.statusCode, withdrawn.body).toBe(200)

    const owner = await t.db
      .selectFrom('intake.requests as r')
      .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
      .select(['p.customer_id', 'r.contact_id'])
      .where('r.id', '=', pr.requestId)
      .executeTakeFirstOrThrow()
    const plan = await customerPlan(t.db, {
      customerId: owner.customer_id,
      contactId: owner.contact_id,
      accountIds: [],
    })
    // The visit and its one reminder draft: retained job records; the estimate never accepted is deletable.
    expect(plan.items).toContainEqual(
      expect.objectContaining({ category: 'job_records', disposition: 'retain', count: 2, reason: 'active_record' }),
    )
    expect(plan.deletable.estimates).toEqual([expect.objectContaining({ id: lost.estimateId })])

    const done = await withTx(t.db, (tx) =>
      reapplyDeletions(
        tx,
        [
          {
            id: randomUUID(),
            recordType: 'estimate',
            recordId: lost.estimateId,
            recordRef: lost.number,
            reason: 'Synthetic: never accepted.',
            decidedAt: new Date().toISOString(),
          },
        ],
        { requestId: `req-${key('erase')}` },
      ),
    )
    expect(done).toEqual([expect.objectContaining({ outcome: 'reapplied', blockers: [] })])
    // The visit's reminder is not the estimate's data: the draft, its content and its open queue item stay.
    const [still] = await reminders(v.id)
    expect(still).toMatchObject({ id: row.id, state: 'draft', record_type: 'visit', record_id: v.id })
    expect(still?.updated_at).toEqual(row.updated_at)
    expect((await itemsOf('appointment_reminder', v.id)).map((i) => i.resolved_at)).toEqual([null])
    expect((await view(v.id)).reminders[0]).toMatchObject({ id: row.id, state: 'draft', current: true })
  })
})
