// Customer-agreed repeat-service schedules and their reminders against PostgreSQL 16 (TSK-0114; HH-SCH-10, HH-COM-05,
// T67, OWN-DEC-113, OWN-DEC-148, FACT-REMINDER-CADENCES, RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS). Staff, customers,
// addresses and references are synthetic (RULE-SYNTHETIC-DATA); nothing reaches a provider. Fixtures of this file's own
// throwaway database, never statements about the business:
// - contact.hours opens at 00:00 here, so an occurrence dated today is due whatever hour the test runs at (the reminder
//   is prepared at the opening of contact hours, PROPOSED);
// - a request's property starts with an unknown zone, so each project's zone is recorded as a synthetic verified one;
// - the reminder wording is NOT CONFIGURED: one test releases a synthetic template version in this database only, after
//   the tests that show it cannot be released without one.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { addLocalDays, localDateOf } from '@handyhub/domain'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import {
  linkHostsOf,
  recordConsent,
  releaseAutomation,
  type ConsentPurpose,
} from '../../src/modules/notifications/index.js'
import { releaseTemplateVersion } from '../../src/modules/notifications/templates.js'
import {
  repeatReminderAutomation,
  repeatReminderFailureItem,
  repeatReminderRecordCheck,
  repeatReminderValues,
} from '../../src/modules/repeat-service/index.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { createProviders } from '../../src/providers/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'
import { verifyPropertyZone } from '../fixtures/zones.js'

const SITE = 'https://site.example.test'
const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'repeat', 'service', 'code', 'key', 'for', 'tests', '0114'].join('-'),
})
const pw = (n: number) => ['synthetic', 'repeat', 'service', 'passphrase', String(n)].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof PEOPLE)[number]

let t: TestDatabase
let app: FastifyInstance
const storage = new FakeObjectStorage()
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>

const p = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
if (!p.fakes.email || !p.email || !p.sms) throw new Error('ci uses the fakes')
const fakeEmail = p.fakes.email
const fast = (a: Automation): Automation => ({ ...a, retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 } })
// The one notify.release registration, as automations.ts registers it, with the schedule's send-time check.
const release = releaseAutomation(
  { email: p.email, sms: p.sms, linkHosts: linkHostsOf(SITE, undefined) },
  {
    recordChecks: { service_series: repeatReminderRecordCheck },
    failureItem: repeatReminderFailureItem,
    values: repeatReminderValues(SITE),
  },
)
const registry = createAutomationRegistry([fast(repeatReminderAutomation()), fast(release)])
async function drain() {
  const w = createWorker({ db: t.db, registry })
  for (let i = 0; i < 30; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) return
    await new Promise((r) => setTimeout(r, 5))
  }
}

const email = (who: Person) => `${who}-repeat@example.test`
async function signIn(who: Person): Promise<[string, string]> {
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email: email(who), password: pw(1) },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, codeKey: KEY, storage } })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const who of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: email(who),
        displayName: `Synthetic ${who}`,
        locale: 'en',
        role: who,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[who] = user.id
    }
  })
  for (const who of PEOPLE) [cookies[who], csrf[who]] = await signIn(who)
  // See the header: today's occurrence is due at once.
  await recordPolicyVersion(t.db, {
    key: 'contact.hours',
    value: { days: 'every_day', open: '00:00', close: '22:00' } as never,
    sourceIds: ['TEST-SYNTHETIC'],
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

let seq = 0
const key = (what: string) => `synthetic-${what}-${String(++seq).padStart(6, '0')}-${randomUUID()}`
function staffWrite(who: Person, url: string, payload: unknown, extra: Record<string, string> = {}) {
  return app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    payload: payload as object,
    headers: { cookie: cookies[who], 'x-csrf-token': csrf[who], 'idempotency-key': key('staff'), ...extra },
  })
}
const staffGet = (who: Person, url: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie: cookies[who] } })
const today = () => localDateOf(new Date(), ZONE)
const codes = (res: { json: <T>() => T }) =>
  res.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors.map((f) => f.code)

let ip = 10
/** A submitted request for one service, with a synthetic verified property zone unless asked otherwise. */
async function submitted(contactEmail: string, opts: { zone?: boolean; phone?: string } = {}) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic repeat-service project.',
      answers: [],
      property: {
        street: `${seq} Synthetic Repeat Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Synthetic Repeat Customer',
        email: contactEmail,
        phone: opts.phone ?? '(502) 555-0114',
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
    .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
    .select(['r.id', 'r.project_id', 'r.contact_id', 'p.reference as projectReference'])
    .where('r.reference', '=', reference)
    .executeTakeFirstOrThrow()
  if (opts.zone !== false) await verifyPropertyZone(t.db, { projectId: row.project_id })
  return { requestId: row.id, projectId: row.project_id, contactId: row.contact_id, reference, contactEmail }
}

/** A customer session on the project, as its access link opens it. */
async function customerCookie(pr: { requestId: string; projectId: string; contactId: string }) {
  const grant = await t.db
    .selectFrom('identity.project_access_grants')
    .select('id')
    .where('request_id', '=', pr.requestId)
    .executeTakeFirstOrThrow()
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, {
      contactRef: pr.contactId,
      via: 'grant',
      projectIds: [pr.projectId],
      verifiedAt: new Date(),
      grantId: grant.id,
    }),
  )
  return `__Host-hh_customer=${s.token}`
}
const customer = (cookie: string, reference: string, path = '', payload?: unknown) =>
  app.inject({
    method: payload === undefined ? 'GET' : 'POST',
    url: `/api/v1/customer/projects/${reference}/repeat-service${path}`,
    ...(payload === undefined ? {} : { payload: payload as object }),
    headers: {
      cookie,
      ...(payload === undefined ? {} : { 'idempotency-key': key('customer'), 'x-forwarded-for': '2001:db8:114::1' }),
    },
  })

type View = {
  projectReference: string
  zone: string | null
  changeNoticeHours: number | null
  reminderWording: string
  schedules: {
    id: string
    state: string
    version: number
    nextDate: string
    reminders: boolean
    upcoming: { date: string; state: string; requestReference: string | null }[]
    requested: { date: string; reference: string }[]
    reminderDrafts: { id: string; date: string; state: string; reason: string | null }[]
    history: { change: string; by: { kind: string }; agreedVia: string | null; keptDates: string[] }[]
  }[]
  actions: { record: boolean; manage: boolean; releaseReminders: boolean }
}
const view = async (projectId: string, who: Person = 'office') => {
  const r = await staffGet(who, `/staff/projects/${projectId}/repeat-service`)
  expect(r.statusCode, r.body).toBe(200)
  return r.json<View>()
}
const weekly = { unit: 'week', count: 1 } as const
async function recordWeekly(projectId: string, nextDate = today(), reminders = true) {
  const r = await staffWrite('office', `/staff/projects/${projectId}/repeat-service`, {
    nextDate,
    interval: weekly,
    reminders,
    agreedVia: 'phone',
    customerAgreed: true,
    note: 'Synthetic: the customer asked for a weekly visit on the phone.',
  })
  expect(r.statusCode, r.body).toBe(201)
  await drain()
  const v = await view(projectId)
  return { v, series: v.schedules[0] as View['schedules'][number] }
}
const deliveriesOf = (seriesId: string) =>
  t.db
    .selectFrom('platform.message_deliveries')
    .select(['id', 'subject_key', 'state', 'error_code', 'release'])
    .select(sql<boolean>`sent_at IS NOT NULL`.as('sent'))
    .where('record_type', '=', 'service_series')
    .where('record_id', '=', seriesId)
    .orderBy('seq')
    .execute()
const queueItem = (subjectId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .select(['reason', 'resolved_at'])
    .where('type', '=', 'repeat_service_release')
    .where('subject_id', '=', subjectId)
    .executeTakeFirst()
const openItem = async (subjectId: string) => (await queueItem(subjectId))?.resolved_at === null
const consent = (to: string, purpose: ConsentPurpose, granted: boolean) =>
  withTx(t.db, (tx) =>
    recordConsent(tx, {
      purpose,
      channel: 'email',
      destination: to,
      granted,
      source: 'staff_recorded',
      recordedBy: ids.office,
    }),
  )
/** A complaint on the project, recorded by Office; closed by the Owner with its resolution. */
async function complaint(projectId: string) {
  const r = await staffWrite('office', `/staff/projects/${projectId}/complaints`, {
    category: 'work_quality',
    severity: 'moderate',
    source: 'message',
    assignedTo: ids.office,
    dueOn: today(),
    description: 'Synthetic: the customer says a patch is visible under the light.',
  })
  expect(r.statusCode, r.body).toBe(201)
  const caseId = r.json<{ caseId: string }>().caseId
  const step = async (who: Person, action: string, payload: unknown = {}) => {
    const v = (await staffGet('owner', `/staff/cases/${caseId}`)).json<{ version: number }>().version
    const res = await staffWrite(who, `/staff/cases/${caseId}/actions/${action}`, payload, { 'if-match': `"${v}"` })
    expect(res.statusCode, res.body).toBe(200)
  }
  return {
    close: async () => {
      await step('office', 'acknowledge')
      await step('office', 'investigate')
      await step('owner', 'resolve', { resolution: 'Synthetic: repainted and accepted.', recheckRequired: false })
      await step('owner', 'close')
    },
  }
}

describe('[HH-SCH-10][OWN-DEC-113] recording a customer-agreed schedule', () => {
  it('[HH-SCH-10][RULE-SERVER-AUTHZ] only staff who manage it record one, only with the customer’s agreement', async () => {
    const pr = await submitted(`repeat-${randomUUID().slice(0, 8)}@example.test`)
    const body = { nextDate: today(), interval: weekly, reminders: true, agreedVia: 'phone', customerAgreed: true }
    for (const who of ['estimator', 'worker'] as const) {
      expect((await staffWrite(who, `/staff/projects/${pr.projectId}/repeat-service`, body)).statusCode).toBe(403)
      expect((await staffGet(who, `/staff/projects/${pr.projectId}/repeat-service`)).statusCode).toBe(403)
    }
    // No schedule without the customer's agreement; no interval or date is ever proposed.
    let r = await staffWrite('office', `/staff/projects/${pr.projectId}/repeat-service`, {
      ...body,
      customerAgreed: false,
    })
    expect(codes(r)).toEqual(['CUSTOMER_AGREEMENT_REQUIRED'])
    r = await staffWrite('office', `/staff/projects/${pr.projectId}/repeat-service`, {
      ...body,
      nextDate: addLocalDays(today(), -1),
    })
    expect(codes(r)).toEqual(['IN_THE_PAST'])
    r = await staffWrite('office', `/staff/projects/${pr.projectId}/repeat-service`, {
      ...body,
      interval: { unit: 'week', count: 53 },
    })
    expect(r.statusCode).toBe(400)
    expect((await view(pr.projectId)).schedules).toEqual([])

    // Recorded: the next dates are the property's local dates, a week apart, and the history says how it was agreed.
    const { v, series } = await recordWeekly(pr.projectId)
    expect(v.zone).toBe(ZONE)
    expect(v.changeNoticeHours).toBe(24)
    expect(series.upcoming.map((u) => u.date)).toEqual([0, 7, 14, 21, 28, 35].map((d) => addLocalDays(today(), d)))
    expect(series.history).toEqual([
      expect.objectContaining({
        change: 'recorded',
        by: expect.objectContaining({ kind: 'staff' }),
        agreedVia: 'phone',
      }),
    ])
    expect(v.actions).toEqual({ record: false, manage: true, releaseReminders: true })
    // One active schedule per project: a second agreement is a change.
    r = await staffWrite('owner', `/staff/projects/${pr.projectId}/repeat-service`, body)
    expect(codes(r)).toEqual(['SERIES_ACTIVE'])
  })

  it('[HH-SCH-10] a schedule waits for the property’s zone (never assumed Eastern)', async () => {
    const pr = await submitted(`repeat-${randomUUID().slice(0, 8)}@example.test`, { zone: false })
    const r = await staffWrite('office', `/staff/projects/${pr.projectId}/repeat-service`, {
      nextDate: addLocalDays(today(), 3),
      interval: null,
      reminders: true,
      agreedVia: 'in_person',
      customerAgreed: true,
    })
    expect(codes(r)).toEqual(['PROPERTY_ZONE_UNKNOWN'])
    expect((await view(pr.projectId)).actions.record).toBe(false)
  })
})

describe('[HH-SCH-10][T67][FACT-REMINDER-CADENCES] repeat-service reminders: staff-released drafts', () => {
  it('[T67][RULE-NO-INVENTED-FACTS] a draft on the agreed date only, which cannot be released without approved wording', async () => {
    const pr = await submitted(`repeat-${randomUUID().slice(0, 8)}@example.test`)
    const { v, series } = await recordWeekly(pr.projectId)
    // Prepared for today's occurrence only, never sent by itself.
    const drafts = await deliveriesOf(series.id)
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({ state: 'draft', release: 'staff_released' })
    expect(drafts[0]?.subject_key).toContain(`:${today()}:`)
    expect(await queueItem(pr.projectId)).toMatchObject({ reason: 'repeat_reminder_ready', resolved_at: null })
    // The wording is NOT CONFIGURED: staff see the draft but cannot release it.
    expect(v.reminderWording).toBe('NOT_CONFIGURED')
    const r = await staffWrite('office', `/staff/repeat-service/${series.id}/reminders/${drafts[0]?.id}/release`, {})
    expect(codes(r)).toEqual(['TEMPLATE_NOT_CONFIGURED'])
    // Draining again prepares nothing more: one per date.
    await drain()
    expect(await deliveriesOf(series.id)).toHaveLength(1)
    // A schedule without reminders gets none.
    const other = await submitted(`repeat-${randomUUID().slice(0, 8)}@example.test`)
    const quiet = await recordWeekly(other.projectId, today(), false)
    expect(await deliveriesOf(quiet.series.id)).toEqual([])
  })

  it('[T67][HH-COM-05][OWN-DEC-124] an active complaint pauses the reminder; it is offered again once resolved', async () => {
    const pr = await submitted(`repeat-${randomUUID().slice(0, 8)}@example.test`)
    const c = await complaint(pr.projectId)
    const { series } = await recordWeekly(pr.projectId)
    const [draft] = await deliveriesOf(series.id)
    expect(draft).toMatchObject({ state: 'draft', error_code: 'held_case_active' })
    expect(await openItem(pr.projectId)).toBe(false)
    const r = await staffWrite('office', `/staff/repeat-service/${series.id}/reminders/${draft?.id}/release`, {})
    expect(codes(r)).toEqual(['TEMPLATE_NOT_CONFIGURED'])
    await c.close()
    expect((await deliveriesOf(series.id))[0]).toMatchObject({ state: 'draft', error_code: null })
    expect(await queueItem(pr.projectId)).toMatchObject({ resolved_at: null })
  })
})

describe('[HH-SCH-10][OWN-DEC-148][OWN-DEC-113] the customer changes or stops the schedule and its reminders', () => {
  it('[OWN-DEC-148] a change applies beyond the 24-hour notice; an occurrence inside it keeps its date', async () => {
    const pr = await submitted(`repeat-${randomUUID().slice(0, 8)}@example.test`)
    const cookie = await customerCookie(pr)
    const projectReference = (await view(pr.projectId)).projectReference
    // No schedule yet: nothing to change.
    let r = await customer(cookie, projectReference)
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json()).toEqual({ reference: projectReference, schedule: null })
    expect((await customer(cookie, projectReference, '/stop', {})).statusCode).toBe(404)

    const { series } = await recordWeekly(pr.projectId)
    r = await customer(cookie, projectReference)
    expect(r.json()).toEqual({
      reference: projectReference,
      schedule: {
        state: 'active',
        nextDates: [0, 7, 14].map((d) => ({ date: addLocalDays(today(), d), requested: false })),
        interval: weekly,
        reminders: true,
        changeNoticeHours: 24,
        stoppedAt: null,
      },
    })
    // Today started already, so it is inside the notice whatever the hour (tomorrow may not be, on a 25-hour day).
    r = await customer(cookie, projectReference, '/change', { nextDate: today(), interval: weekly })
    expect(codes(r)).toEqual(['WITHIN_CHANGE_NOTICE'])
    // Every two weeks from ten days on: today's occurrence is inside the notice and keeps its date and its reminder.
    const fortnight = { unit: 'week', count: 2 } as const
    r = await customer(cookie, projectReference, '/change', {
      nextDate: addLocalDays(today(), 10),
      interval: fortnight,
    })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json<{ schedule: { nextDates: { date: string }[] } }>().schedule.nextDates.map((d) => d.date)).toEqual([
      today(),
      addLocalDays(today(), 10),
      addLocalDays(today(), 24),
    ])
    const after = (await view(pr.projectId)).schedules[0] as View['schedules'][number]
    expect(after.upcoming[0]).toEqual({ date: today(), state: 'kept', requestReference: null })
    expect(after.history.at(-1)).toMatchObject({ change: 'changed', by: { kind: 'customer' }, keptDates: [today()] })
    expect((await deliveriesOf(series.id)).map((d) => d.state)).toEqual(['draft'])

    // Reminders off: the waiting draft is cancelled at once; back on, today's is prepared again.
    r = await customer(cookie, projectReference, '/reminders', { on: false })
    expect(r.json<{ schedule: { reminders: boolean } }>().schedule.reminders).toBe(false)
    expect(await deliveriesOf(series.id)).toEqual([
      expect.objectContaining({ state: 'cancelled', error_code: 'reminders_off' }),
    ])
    expect(await openItem(pr.projectId)).toBe(false)
    expect((await customer(cookie, projectReference, '/reminders', { on: true })).statusCode).toBe(200)
    await drain()
    expect((await deliveriesOf(series.id)).map((d) => d.state)).toEqual(['cancelled', 'draft'])

    // Stop: the schedule and its reminders end at once; the customer sees it stopped.
    r = await customer(cookie, projectReference, '/stop', {})
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json<{ schedule: { state: string; nextDates: unknown[] } }>().schedule).toMatchObject({
      state: 'stopped',
      nextDates: [],
    })
    expect((await deliveriesOf(series.id)).map((d) => [d.state, d.error_code])).toEqual([
      ['cancelled', 'reminders_off'],
      ['cancelled', 'series_stopped'],
    ])
    await drain()
    expect(await deliveriesOf(series.id)).toHaveLength(2)
    // Staff may record a new agreement later; the stopped schedule stays stopped.
    expect((await view(pr.projectId)).actions.record).toBe(true)
    r = await staffWrite(
      'office',
      `/staff/repeat-service/${series.id}/actions/stop`,
      { agreedVia: 'phone' },
      {
        'if-match': `"${(await view(pr.projectId)).schedules[0]?.version}"`,
      },
    )
    expect(codes(r)).toEqual(['SERIES_STOPPED'])
  })

  it('[T19][RULE-SERVER-AUTHZ] another project’s customer never sees or changes it', async () => {
    const a = await submitted(`repeat-${randomUUID().slice(0, 8)}@example.test`)
    const b = await submitted(`repeat-${randomUUID().slice(0, 8)}@example.test`)
    await recordWeekly(a.projectId, addLocalDays(today(), 3))
    const ref = (await view(a.projectId)).projectReference
    const other = await customerCookie(b)
    expect((await customer(other, ref)).statusCode).toBe(404)
    expect((await customer(other, ref, '/stop', {})).statusCode).toBe(404)
    expect((await view(a.projectId)).schedules[0]?.state).toBe('active')
  })

  it('[HH-COM-05][OWN-DEC-113] staff record a change the customer agreed to and skip an occurrence', async () => {
    const pr = await submitted(`repeat-${randomUUID().slice(0, 8)}@example.test`)
    const { series } = await recordWeekly(pr.projectId, addLocalDays(today(), 2))
    let r = await staffWrite(
      'office',
      `/staff/repeat-service/${series.id}/actions/change`,
      {
        nextDate: addLocalDays(today(), 3),
        interval: { unit: 'month', count: 1 },
        reminders: false,
        agreedVia: 'email',
      },
      { 'if-match': `"${series.version + 1}"` },
    )
    expect(r.statusCode).toBe(409)
    r = await staffWrite(
      'office',
      `/staff/repeat-service/${series.id}/actions/change`,
      {
        nextDate: addLocalDays(today(), 3),
        interval: { unit: 'month', count: 1 },
        reminders: false,
        agreedVia: 'email',
      },
      { 'if-match': `"${series.version}"` },
    )
    expect(r.statusCode, r.body).toBe(200)
    let s = r.json<View>().schedules[0] as View['schedules'][number]
    expect(s).toMatchObject({ nextDate: addLocalDays(today(), 3), reminders: false })
    expect(s.history.at(-1)).toMatchObject({ change: 'changed', agreedVia: 'email' })
    // Skip the next occurrence: it is listed as skipped no more; the one after stays.
    const next = s.upcoming[0]?.date as string
    r = await staffWrite(
      'office',
      `/staff/repeat-service/${series.id}/occurrences/${next}/skip`,
      { agreedVia: 'phone' },
      { 'if-match': `"${s.version}"` },
    )
    expect(r.statusCode, r.body).toBe(200)
    s = r.json<View>().schedules[0] as View['schedules'][number]
    expect(s.upcoming.map((u) => u.date)).not.toContain(next)
    r = await staffWrite(
      'office',
      `/staff/repeat-service/${series.id}/occurrences/${addLocalDays(today(), 4)}/skip`,
      { agreedVia: 'phone' },
      { 'if-match': `"${s.version}"` },
    )
    expect(codes(r)).toEqual(['NOT_AN_OCCURRENCE'])
  })
})

describe('[HH-SCH-10][OWN-DEC-113] each occurrence is a new request through the normal gates', () => {
  it('[HH-SCH-10] the request that carries an occurrence is linked; nothing of the earlier project is copied', async () => {
    const contactEmail = `repeat-${randomUUID().slice(0, 8)}@example.test`
    const pr = await submitted(contactEmail)
    const { series } = await recordWeekly(pr.projectId)
    // The customer sends their request for today's occurrence; another customer's request cannot be linked.
    const occurrence = await submitted(contactEmail.toUpperCase(), { phone: '(502) 555-0199' })
    const stranger = await submitted(`stranger-${randomUUID().slice(0, 8)}@example.test`, { phone: '(502) 555-0198' })
    const link = (reference: string, version: number, date = today()) =>
      staffWrite(
        'office',
        `/staff/repeat-service/${series.id}/occurrences/${date}/link`,
        { requestReference: reference },
        { 'if-match': `"${version}"` },
      )
    expect(codes(await link(stranger.reference, series.version))).toEqual(['NOT_THE_SAME_CUSTOMER'])
    expect(codes(await link(pr.reference, series.version))).toEqual(['SAME_PROJECT'])
    expect(codes(await link(occurrence.reference, series.version, addLocalDays(today(), 1)))).toEqual([
      'NOT_AN_OCCURRENCE',
    ])
    let r = await link(occurrence.reference, series.version)
    expect(r.statusCode, r.body).toBe(200)
    const s = r.json<View>().schedules[0] as View['schedules'][number]
    expect(s.upcoming[0]).toEqual({ date: today(), state: 'requested', requestReference: occurrence.reference })
    expect(s.requested).toEqual([expect.objectContaining({ date: today(), reference: occurrence.reference })])
    // Today's reminder is no longer needed.
    expect(await deliveriesOf(series.id)).toEqual([
      expect.objectContaining({ state: 'cancelled', error_code: 'occurrence_requested' }),
    ])
    r = await link(occurrence.reference, s.version, addLocalDays(today(), 7))
    expect(codes(r)).toEqual(['REQUEST_ALREADY_LINKED'])

    // The same gates as any request: its own customer, contact, property and project; waiting for staff review, with
    // no estimate, no price, no discount, an unverified contact and no consent but what it was sent with.
    const req = await t.db
      .selectFrom('intake.requests as r')
      .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
      .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
      .select(['r.state', 'r.customer_id', 'r.project_id', 'p.property_id', 'c.email_verification'])
      .where('r.id', '=', occurrence.requestId)
      .executeTakeFirstOrThrow()
    const first = await t.db
      .selectFrom('intake.requests as r')
      .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
      .select(['r.customer_id', 'p.property_id'])
      .where('r.id', '=', pr.requestId)
      .executeTakeFirstOrThrow()
    expect(req.state).toBe('received')
    expect(req.customer_id).not.toBe(first.customer_id)
    expect(req.property_id).not.toBe(first.property_id)
    expect(req.email_verification).toBe('unverified')
    const estimates = await t.db
      .selectFrom('estimating.estimates')
      .select('id')
      .where('project_id', '=', occurrence.projectId)
      .execute()
    expect(estimates).toEqual([])
    // No job, no appointment: those wait for its own approval and confirmation.
    expect(
      await t.db.selectFrom('work.jobs').select('id').where('project_id', '=', occurrence.projectId).execute(),
    ).toEqual([])
  })
})

describe('[T67][HH-COM-05] consent and state are rechecked when a released reminder sends', () => {
  it('[T67][HH-COM-05][OWN-DEC-113] released with approved wording; an opt-out or a stop at send time stops it', async () => {
    // A synthetic wording in this test database only (see the header).
    await withTx(t.db, (tx) =>
      releaseTemplateVersion(tx, {
        messageKey: 'reminder.repeat_service',
        channel: 'email',
        locale: 'en',
        subject: 'Synthetic repeat-service reminder',
        body: 'Synthetic test wording.\n\n{projectLink}',
        translationReview: 'source',
        sourceIds: ['TEST-SYNTHETIC'],
        releasedBy: 'test',
      }),
    )
    const send = async () => {
      const pr = await submitted(`repeat-${randomUUID().slice(0, 8)}@example.test`)
      const { series } = await recordWeekly(pr.projectId)
      const [draft] = await deliveriesOf(series.id)
      const r = await staffWrite('office', `/staff/repeat-service/${series.id}/reminders/${draft?.id}/release`, {})
      expect(r.statusCode, r.body).toBe(200)
      return { pr, series, draftId: draft?.id as string }
    }
    // Sent: the project's portal page is the link.
    const sent = await send()
    await drain()
    // Handed to the provider (the provider's status follows from its webhooks).
    expect((await deliveriesOf(sent.series.id))[0]).toMatchObject({ state: 'queued', sent: true })
    const mail = fakeEmail.sent.find((m) => m.to === sent.pr.contactEmail)
    expect(mail?.subject).toBe('Synthetic repeat-service reminder')
    expect(await queueItem(sent.pr.projectId)).toMatchObject({ resolved_at: expect.any(Date) })

    // Released, then the customer asks for no optional follow-ups: suppressed at send.
    const optedOut = await send()
    await consent(optedOut.pr.contactEmail, 'service_communication', false)
    await drain()
    expect((await deliveriesOf(optedOut.series.id))[0]).toMatchObject({
      state: 'suppressed',
      error_code: 'follow_ups_opted_out',
    })

    // Released, then the customer stops the schedule before it sends: cancelled, never sent.
    const stopped = await send()
    const cookie = await customerCookie(stopped.pr)
    const ref = (await view(stopped.pr.projectId)).projectReference
    expect((await customer(cookie, ref, '/stop', {})).statusCode).toBe(200)
    await drain()
    expect((await deliveriesOf(stopped.series.id))[0]).toMatchObject({
      state: 'cancelled',
      error_code: 'series_stopped',
    })
    expect(
      fakeEmail.sent.some((m) => m.to === stopped.pr.contactEmail && m.subject === 'Synthetic repeat-service reminder'),
    ).toBe(false)

    // Released while a case opens on the project: back to a held draft for staff.
    const held = await send()
    await complaint(held.pr.projectId)
    await drain()
    expect((await deliveriesOf(held.series.id))[0]).toMatchObject({ state: 'draft', error_code: 'held_case_active' })
  })
})

describe('[HH-SCH-10] the history is append-only', () => {
  it('refuses to rewrite a change or move a schedule to another project', async () => {
    const pr = await submitted(`repeat-${randomUUID().slice(0, 8)}@example.test`)
    const other = await submitted(`repeat-${randomUUID().slice(0, 8)}@example.test`)
    const { series } = await recordWeekly(pr.projectId, addLocalDays(today(), 5))
    await expect(
      sql`UPDATE work.service_series_changes SET note = 'rewritten' WHERE series_id = ${series.id}`.execute(t.db),
    ).rejects.toThrow(/append-only/)
    await expect(
      sql`UPDATE work.service_series SET project_id = ${other.projectId} WHERE id = ${series.id}`.execute(t.db),
    ).rejects.toThrow(/keeps its project/)
    await expect(sql`DELETE FROM work.service_series WHERE id = ${series.id}`.execute(t.db)).rejects.toThrow()
  })
})
