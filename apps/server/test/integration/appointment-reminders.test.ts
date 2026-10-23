// The automatic appointment reminder 24 hours before every confirmed visit, against PostgreSQL 16 (TSK-0067, TSK-0121;
// HH-COM-11, HH-COM-05, HH-COM-06, HH-COM-02, HH-COM-15, T65, OWN-DEC-153, OWN-DEC-107, OWN-DEC-151, OWN-DEC-158,
// FACT-REMINDER-CADENCES, ENT-Visit, ENT-Message, RULE-DECIDED-VALUES-ACTIVE, RULE-SERVER-AUTHZ). Staff, customers,
// working hours and addresses are synthetic (RULE-SYNTHETIC-DATA): the hours below are test fixtures, never the
// business's hours. Nothing reaches a real provider: the fakes record what would be sent.
// - "Time passes": a reminder's send job is brought forward in the database; nothing depends on the time of day (the
//   visits are days ahead, and the text hours are judged at a fixed noon).
// - "Booked less than 24 hours ahead": the interval is raised for one test (a synthetic configuration version), since
//   the visit hours do not let a test place a visit exactly so many hours from now.
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
import { RELEASE_RECORD_CHECKS, releaseFailureItem, releaseValues } from '../../src/automations.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { linkHostsOf, releaseAutomation } from '../../src/modules/notifications/index.js'
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
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'
import { bodyOf } from '../fixtures/message-text.js'
import { verifyPropertyZone } from '../fixtures/zones.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

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
const fast = (a: Automation): Automation => ({ ...a, retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 } })
// The one notify.release registration's checks, delivery issues and values, as the server registers them
// (automations.ts). TSK-0122: the text hours are judged at a fixed noon in Louisville, never at the time the suite runs.
const NOON = new Date('2026-10-20T16:00:00Z')
const release = releaseAutomation(
  { email: p.email, sms: p.sms, linkHosts: linkHostsOf(SITE, undefined), clock: () => NOON },
  { recordChecks: RELEASE_RECORD_CHECKS, failureItem: releaseFailureItem, values: releaseValues(SITE) },
)
const registry = createAutomationRegistry([...appointmentReminderAutomations(), fast(release)])

async function signIn(who: Person): Promise<[string, string]> {
  const res = await signInWithMfa(app, {
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

async function setCadences(value: unknown) {
  await recordPolicyVersion(t.db, {
    key: 'reminders.cadences',
    value: value as never,
    sourceIds: ['TEST-SYNTHETIC'],
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
}
/** The seeded cadences (migration 0075), restored after a test changed them. */
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
  if (cadences.state !== 'CONFIGURED') throw new Error('migration 0075 seeds reminders.cadences')
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
  // TSK-0127: staff's address and county check, which a first confirmation needs.
  await verifyCountyOf(t.db, row.project_id)
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
const H = 3_600_000
/** Time passes: the visit's reminder deliveries become due now. */
async function due(visitId: string) {
  await sql`UPDATE platform.jobs SET run_at = now() WHERE automation = 'notify.release' AND state = 'queued'
            AND target_id IN (SELECT id::text FROM platform.message_deliveries WHERE message_key = ${MESSAGE}
                              AND record_id = ${visitId})`.execute(t.db)
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
const startsAt = async (visitId: string) =>
  new Date(
    (await t.db.selectFrom('work.visits').select('starts_at').where('id', '=', visitId).executeTakeFirstOrThrow())
      .starts_at,
  )

type View = {
  visitState: string
  cadence: { state: string; hoursBefore?: number; dueAt?: string }
  stoppedBy: string | null
  reminders: {
    id: string
    windowVersion: number | null
    current: boolean
    release: string
    state: string
    channel: string
    reason: string | null
    scheduledAt: string | null
    sentAt: string | null
    cancelledBy: { id: string } | 'system' | null
  }[]
}
const view = async (visitId: string, who: Person = 'office') => {
  const res = await staffGet(who, `/api/v1/staff/visits/${visitId}/reminders`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<View>()
}
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

/** A visit booked days ahead whose automatic reminder is scheduled (email and text). */
async function scheduled(date = freshDay()) {
  const pr = await siteVisitProject()
  const v = await bookedVisit(pr, date)
  await drain()
  const rows = await reminders(v.id)
  if (rows.length !== 2) throw new Error('the reminder was scheduled')
  return { pr, v, rows }
}

describe('[HH-COM-11][FACT-REMINDER-CADENCES][OWN-DEC-153] the automatic reminder 24 hours before each confirmed visit', () => {
  it('[HH-COM-11][T65] confirming schedules one reminder per destination 24 hours before the window; nobody releases it', async () => {
    const pr = await siteVisitProject()
    const v = await bookedVisit(pr, freshDay())
    expect(v.state).toBe('confirmed')
    await drain()
    const starts = await startsAt(v.id)
    const rows = await reminders(v.id)
    expect(rows.map((r) => [r.channel, r.subject_key, r.release, r.state, r.locale])).toEqual([
      ['email', appointmentReminderSubject(v.id, v.windowVersion), 'automatic', 'queued', 'en'],
      ['sms', appointmentReminderSubject(v.id, v.windowVersion), 'automatic', 'queued', 'en'],
    ])
    expect(starts.getTime() - (rows[0]?.scheduled_at as Date).getTime()).toBe(24 * H)
    const [job] = await t.db
      .selectFrom('platform.jobs')
      .select(['run_at', 'state'])
      .where('job_key', '=', `notify.release:${rows[0]?.id}`)
      .execute()
    expect([job?.state, starts.getTime() - (job?.run_at as Date).getTime()]).toEqual(['queued', 24 * H])
    // No draft waits for staff: no queue item asks anyone to release it.
    expect(await itemsOf('appointment_reminder', v.id)).toEqual([])
    const shown = await view(v.id)
    expect(shown.cadence).toEqual({
      state: 'CONFIGURED',
      proposed: false,
      hoursBefore: 24,
      dueAt: new Date(starts.getTime() - 24 * H).toISOString(),
    })
    expect(shown.reminders.map((r) => [r.channel, r.release, r.state, r.current])).toEqual([
      ['email', 'automatic', 'queued', true],
      ['sms', 'automatic', 'queued', true],
    ])
    for (const action of ['release', 'dismiss'])
      expect(
        (await staffWrite('office', `/api/v1/staff/appointment-reminders/${rows[0]?.id}/${action}`)).statusCode,
      ).toBe(404)
  })

  it('[OWN-DEC-151][OWN-DEC-158] at its time it sends once in the owner wording, never with the address; texts stay off', async () => {
    const { pr, v, rows } = await scheduled()
    const before = fakeEmail.sent.length
    await due(v.id)
    const after = await reminders(v.id)
    expect(after.map((r) => [r.channel, r.state, r.error_code])).toEqual([
      ['email', 'queued', null],
      // No text wording is released until A2P 10DLC (TSK-0133): recorded as not sent, with a delivery issue.
      ['sms', 'failed', 'template_not_configured'],
    ])
    expect(after[0]?.provider_message_id).toBeTruthy()
    const sent = fakeEmail.sent.slice(before)
    expect(sent.map((m) => [m.to, m.subject])).toEqual([
      [rows[0]?.destination, 'HandyHub | Upcoming Appointment Reminder'],
    ])
    const body = bodyOf(sent[0]?.text)
    expect(body).toContain('Hi Synthetic,')
    expect(body).toMatch(/Arrival window: 9:00 AM – 10:00 AM \((EDT|EST)\)/)
    expect(body).toContain(`Visit reference: ${pr.reference}-V${v.number}`)
    expect(body).not.toContain(pr.street)
    expect((await itemsOf('delivery_failed', after[1]?.id as string)).map((i) => i.reason)).toEqual([
      'delivery_not_configured',
    ])
    // Running it again sends nothing more: one reminder per subject and destination.
    await sql`UPDATE platform.jobs SET state = 'queued', run_at = now(), attempts = 0, finished_at = NULL
              WHERE job_key = ${`notify.release:${rows[0]?.id}`}`.execute(t.db)
    await drain()
    expect(fakeEmail.sent.length - before).toBe(1)
    expect((await view(v.id)).reminders.map((r) => [r.channel, r.state])).toEqual([
      ['email', 'queued'],
      ['sms', 'failed'],
    ])
  })

  it('[OWN-DEC-153] no "24-hour" reminder for a visit booked less than the interval ahead', async () => {
    // Synthetic: the interval is raised past the visit's distance (see the header); restored afterwards.
    await setCadences({ ...(seeded as object), appointment: { hoursBefore: 24 * 30, release: 'automatic' } })
    try {
      const pr = await siteVisitProject()
      const v = await bookedVisit(pr, freshDay())
      await drain()
      expect(await reminders(v.id)).toEqual([])
      expect((await auditOf('appointment_reminder.not_scheduled', v.id)).map((a) => a.summary)).toEqual([
        { messageKey: MESSAGE, windowVersion: v.windowVersion, reason: 'booked_within_interval' },
      ])
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
      expect(await reminders(v.id)).toEqual([])
      expect((await view(v.id)).cadence).toEqual({ state: 'NOT_CONFIGURED' })
    } finally {
      await setCadences(seeded)
    }
  })

  it('[HH-COM-02] a failed reminder is a delivery issue with Retry; the retry sends it once', async () => {
    const { v, rows } = await scheduled()
    fakeEmail.script({ outcome: 'rejected', errorCode: 'synthetic_rejected' })
    await due(v.id)
    const [email] = await reminders(v.id)
    expect([email?.state, email?.error_code]).toEqual(['failed', 'synthetic_rejected'])
    const [issue] = await itemsOf('delivery_failed', email?.id as string)
    expect(issue).toMatchObject({ reason: 'delivery_failed', project_id: email?.project_id, resolved_at: null })
    const before = fakeEmail.sent.length
    const retried = await staffWrite('office', `/api/v1/staff/message-deliveries/${rows[0]?.id}/retry`)
    expect(retried.statusCode, retried.body).toBe(200)
    await drain()
    expect(fakeEmail.sent.length - before).toBe(1)
    expect((await reminders(v.id))[0]?.state).toBe('queued')
  })
})

describe('[HH-COM-11][T65][HH-COM-05][OWN-DEC-153] cancelled when the visit changes; recalculated after a reschedule', () => {
  it('[T65] a cancellation cancels the scheduled reminder in its own transaction; nothing is sent', async () => {
    const { v, rows } = await scheduled()
    const res = await cancel(await visitOf(rows[0]?.project_id as string, v.id))
    expect(res.statusCode, res.body).toBe(200)
    expect((await reminders(v.id)).map((r) => [r.state, r.error_code, r.cancelled_by])).toEqual([
      ['cancelled', 'visit_canceled', 'system'],
      ['cancelled', 'visit_canceled', 'system'],
    ])
    expect(await auditOf('appointment_reminder.stop', rows[0]?.id as string)).toHaveLength(1)
    const before = fakeEmail.sent.length
    await due(v.id)
    expect(fakeEmail.sent.length).toBe(before)
    expect((await view(v.id)).stoppedBy).toBe('visit_canceled')
  })

  it('[T65][HH-COM-05] the send-time recheck refuses a reminder whose visit is no longer confirmed at its window', async () => {
    const { v, rows } = await scheduled()
    const row = rows[0] as (typeof rows)[number]
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
    // Another window's reminder is outdated.
    expect(await check(appointmentReminderSubject(v.id, v.windowVersion + 1))).toEqual({
      stale: 'visit_rescheduled',
    })
    expect((await cancel(await visitOf(row.project_id as string, v.id))).statusCode).toBe(200)
    expect(await check()).toEqual({ stale: 'visit_canceled' })
  })

  it('[T65][HH-COM-11] a reschedule cancels the old window’s reminder and schedules the new window’s, 24 hours before it', async () => {
    const { pr, v, rows } = await scheduled()
    const moved = await move(await visitOf(pr.projectId, v.id), freshDay())
    expect(moved.statusCode, moved.body).toBe(200)
    expect((await reminders(v.id)).map((r) => [r.id, r.state, r.error_code])).toEqual([
      [rows[0]?.id, 'cancelled', 'visit_rescheduled'],
      [rows[1]?.id, 'cancelled', 'visit_rescheduled'],
    ])
    await drain()
    const after = await visitOf(pr.projectId, v.id)
    expect(after.windowVersion).toBe(v.windowVersion + 1)
    const starts = await startsAt(v.id)
    const all = await reminders(v.id)
    expect(all.map((r) => [r.subject_key, r.channel, r.state])).toEqual([
      [appointmentReminderSubject(v.id, v.windowVersion), 'email', 'cancelled'],
      [appointmentReminderSubject(v.id, v.windowVersion), 'sms', 'cancelled'],
      [appointmentReminderSubject(v.id, after.windowVersion), 'email', 'queued'],
      [appointmentReminderSubject(v.id, after.windowVersion), 'sms', 'queued'],
    ])
    expect(starts.getTime() - (all[2]?.scheduled_at as Date).getTime()).toBe(24 * H)
    const shown = await view(v.id)
    expect(shown.reminders.map((r) => r.current)).toEqual([false, false, true, true])
    // At its time only the new window's reminder goes, with the new window.
    const before = fakeEmail.sent.length
    await due(v.id)
    const sent = fakeEmail.sent.slice(before)
    expect(sent).toHaveLength(1)
    expect(bodyOf(sent[0]?.text)).toMatch(/Arrival window: 11:00 AM – 12:00 PM/)
  })

  it('[HH-COM-11] a reassignment keeps the reminder (PROPOSED: its date and window do not change)', async () => {
    const { pr, v, rows } = await scheduled()
    const res = await staffWrite(
      'office',
      `/api/v1/staff/visits/${v.id}/reassign`,
      { workerIds: [ids.ben], reason: 'Synthetic: Ann is needed elsewhere.' },
      (await visitOf(pr.projectId, v.id)).version,
    )
    expect(res.statusCode, res.body).toBe(200)
    await drain()
    expect((await reminders(v.id)).map((r) => [r.id, r.state])).toEqual([
      [rows[0]?.id, 'queued'],
      [rows[1]?.id, 'queued'],
    ])
  })

  it('[HH-COM-11] the database cancels the scheduled reminder when the visit leaves confirmed any other way (migration 0060)', async () => {
    const { v } = await scheduled()
    // TSK-0078 (migration 0089): no access comes with its recorded outcome, in the same transaction.
    await t.db.transaction().execute(async (tx) => {
      await sql`INSERT INTO work.visit_outcomes (visit_id, project_id, job_id, kind, note, visit_state, recorded_by)
                SELECT v.id, v.project_id, v.job_id, 'no_access', 'Synthetic: gate locked', v.state, r.staff_user_id
                  FROM work.visits v JOIN work.reservations r ON r.visit_id = v.id AND r.resource = 'worker'
                 WHERE v.id = ${v.id} AND r.ended_at IS NULL LIMIT 1`.execute(tx)
      await sql`UPDATE work.visits SET state = 'no_access', version = version + 1 WHERE id = ${v.id}`.execute(tx)
    })
    expect((await reminders(v.id)).map((r) => [r.state, r.error_code, r.cancelled_by])).toEqual([
      ['cancelled', 'visit_no_access', 'system'],
      ['cancelled', 'visit_no_access', 'system'],
    ])
  })

  it('[HH-COM-11][HH-SCH-08][T65] On my way (TSK-0070) cancels the scheduled reminder in its own transaction, audited', async () => {
    const { v, rows } = await scheduled()
    const starts = await startsAt(v.id)
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
      recordTap(tx, ann, v.id, 'on_my_way', {}, new Date(starts.getTime() - 60 * 60_000)),
    )
    expect(tapped).toMatchObject({ recorded: true, toState: 'en_route', moved: true })
    expect((await reminders(v.id)).map((r) => [r.state, r.error_code, r.cancelled_by])).toEqual([
      ['cancelled', 'visit_en_route', 'system'],
      ['cancelled', 'visit_en_route', 'system'],
    ])
    // Cancelled by the application with its audit entry, not only by the database backstop (migration 0060).
    expect((await auditOf('appointment_reminder.stop', rows[0]?.id as string)).map((a) => a.summary)).toEqual([
      expect.objectContaining({ messageKey: MESSAGE, reason: 'visit_en_route' }),
    ])
  })
})

describe('[HH-COM-11][RULE-SERVER-AUTHZ] who sees the reminders', () => {
  it('Office, the Owner and an Estimator see them; a worker and a customer reach nothing', async () => {
    const { pr, v } = await scheduled()
    expect((await view(v.id, 'estimator')).reminders).toHaveLength(2)
    expect((await view(v.id, 'owner')).reminders).toHaveLength(2)
    expect((await staffGet('worker', `/api/v1/staff/visits/${v.id}/reminders`)).statusCode).toBe(403)
    const customer = await app.inject({
      method: 'GET',
      url: `/api/v1/staff/visits/${v.id}/reminders`,
      headers: { cookie: pr.cookie },
    })
    expect([401, 403]).toContain(customer.statusCode)
    expect((await staffGet('office', `/api/v1/staff/visits/${randomUUID()}/reminders`)).statusCode).toBe(404)
  })
})

describe('[HH-PRIV-03][HH-COM-11] appointment reminders in a privacy request (TSK-0100 x TSK-0067, TSK-0121)', () => {
  it("[HH-PRIV-03][HH-COM-11] the search keeps a visit's reminders with the job records; deleting the project's estimate never accepted leaves them scheduled", async () => {
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
    const { pr, v, rows } = await scheduled()
    const row = rows[0] as (typeof rows)[number]
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
    // The visit and its reminder (email and text): retained job records; the estimate never accepted is deletable.
    expect(plan.items).toContainEqual(
      expect.objectContaining({ category: 'job_records', disposition: 'retain', count: 3, reason: 'active_record' }),
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
    // The visit's reminder is not the estimate's data: it stays scheduled.
    const [still] = await reminders(v.id)
    expect(still).toMatchObject({ id: row.id, state: 'queued', record_type: 'visit', record_id: v.id })
    expect(still?.updated_at).toEqual(row.updated_at)
    expect((await view(v.id)).reminders[0]).toMatchObject({ id: row.id, state: 'queued', current: true })
  })
})
