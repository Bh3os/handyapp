// Privacy request acknowledgment, targets and deadlines against PostgreSQL 16 (TSK-0136; HH-PRIV-07, HH-PRIV-03,
// OWN-DEC-175, OWN-DEC-205, FACT-PRIVACY-REQUEST-TARGETS, FACT-BUSINESS-CALENDAR, ENT-PrivacyRequest, ENT-QueueItem,
// RULE-SERVER-AUTHZ, RULE-HUMAN-REVIEW). Staff, customers and requests are synthetic (RULE-SYNTHETIC-DATA); nothing
// reaches a provider. Requests are received now; the expected dates are counted from the stored receipt with the
// domain's calendar functions, so the tests hold at any hour and across a clock change. Time passing is a later `now`
// given to the deadline check: nothing is backdated.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import {
  addBusinessDays,
  addLocalDays,
  endOfLocalDay,
  FEDERAL_HOLIDAYS,
  localDateOf,
  privacyRequestDates,
  type BusinessCalendar,
} from '@handyhub/domain'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import {
  privacyDeadlineAutomation,
  requestDeadlines,
  syncPrivacyDeadlineItem,
} from '../../src/modules/privacy/index.js'
import { forbiddenForCustomer } from '../../src/modules/records/index.js'
import { loadConfig, recordPolicyVersion } from '../../src/platform/config/index.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'privacy', 'deadline', 'key', 'for', 'tests', 'only', '0136'].join('-'),
})
const pw = (n: number) => ['synthetic', 'privacy', 'deadline', 'passphrase', String(n)].join(' ')
const PEOPLE = ['owner', 'office'] as const
type Person = (typeof PEOPLE)[number]
const email = (p: Person) => `${p}-privacy-deadlines@example.test`
const ZONE = 'America/Kentucky/Louisville'
const CALENDAR: BusinessCalendar = {
  workdays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
  holidays: [...FEDERAL_HOLIDAYS],
  observance: 'federal_weekend_rule',
  closedDates: [],
}
const TARGETS = { substantiveAcknowledgmentBusinessDays: 3, completionCalendarDays: 30 }

let t: TestDatabase
let app: FastifyInstance
const ids = {} as Record<Person, string>
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>

let seq = 0
const key = (what: string) => `synthetic-deadline-${what}-${String(++seq).padStart(6, '0')}-${randomUUID().slice(0, 8)}`
const get = (who: Person, url: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie: cookies[who] } })
function write(who: Person, url: string, payload: unknown, version?: number, method: 'POST' | 'PUT' = 'POST') {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    payload: payload as object,
    headers: {
      cookie: cookies[who],
      'x-csrf-token': csrf[who],
      'idempotency-key': key('write'),
      'x-forwarded-for': '198.51.100.136',
      ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    },
  })
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, codeKey: KEY } })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: email(p),
        displayName: `Synthetic deadline ${p}`,
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
      headers: { 'x-forwarded-for': '198.51.100.136' },
      payload: { email: email(p), password: pw(1) },
    })
    expect(res.statusCode, res.body).toBe(200)
    cookies[p] = String(res.headers['set-cookie']).split(';')[0] as string
    csrf[p] = res.json().csrfToken as string
  }
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

type Project = { projectId: string; reference: string; contactId: string; grantId: string }
let ip = 10
/** A synthetic request through the public API; its customer is a guest with a secure project link (no account). */
async function newProject(): Promise<Project> {
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
      description: `Synthetic deadline project ${n}.`,
      answers: [],
      property: {
        street: `${n} Synthetic Deadline Way`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: `Synthetic Deadline Customer ${n}`,
        email: `deadline-customer-${n}-${randomUUID().slice(0, 6)}@example.test`,
        phone: '(502) 555-0136',
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
    .select(['r.project_id', 'r.contact_id', 'g.id as grant_id'])
    .where('r.reference', '=', reference)
    .executeTakeFirstOrThrow()
  const project = await t.db
    .selectFrom('crm.projects')
    .select('reference')
    .where('id', '=', row.project_id)
    .executeTakeFirstOrThrow()
  return { projectId: row.project_id, reference: project.reference, contactId: row.contact_id, grantId: row.grant_id }
}

/** A guest session from the project's secure link, verified now (fresh enough to ask). */
async function guestCookie(p: Project) {
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
let client = 0
const customerPost = (url: string, cookie: string) =>
  app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    payload: {},
    headers: {
      cookie,
      'idempotency-key': key('customer'),
      'x-forwarded-for': `2001:db8:136:${++client}::1`,
      'user-agent': 'SyntheticBrowser/1.0 (test)',
    },
  })
const customerGet = (url: string, cookie: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie } })
const PR = (p: Project, rest = '') => `/customer/projects/${p.reference}/privacy-requests${rest}`

type Deadlines = {
  state: string
  receivedOn: string | null
  zone: string | null
  calendarVersion: number | null
  targetsVersion: number | null
  acknowledgedAt: string | null
  acknowledgmentDueOn: string | null
  substantiveAcknowledgedAt: string | null
  targetDueOn: string | null
  targetOn: string | null
  extensions: { previousTargetOn: string; targetOn: string; reason: string }[]
  legalDeadline: { on: string | null; note: string | null; recordedAt: string | null }
  alerts: string[]
}
type Detail = { id: string; version: number; state: string; deadlines: Deadlines; plan: { confirm: string[] } }

/** A guest's request of a kind: its row and the Owner's detail. */
async function submit(kind: 'export' | 'deletion', p?: Project) {
  const project = p ?? (await newProject())
  const cookie = await guestCookie(project)
  const res = await customerPost(PR(project, `/${kind}`), cookie)
  expect(res.statusCode, res.body).toBe(201)
  const body = res.json<{ reference: string } & Record<string, unknown>>()
  const row = await t.db
    .selectFrom('privacy.privacy_requests')
    .selectAll()
    .where('reference', '=', body.reference)
    .executeTakeFirstOrThrow()
  return { project, cookie, body, row }
}
const detail = async (id: string) => {
  const res = await get('owner', `/staff/privacy-requests/${id}`)
  expect(res.statusCode, res.body).toBe(200)
  return res.json<Detail>()
}
const item = (id: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .select(['type', 'reason', 'due_at', 'resolved_at', 'resolution', 'reference'])
    .where('subject_type', '=', 'privacy_request')
    .where('subject_id', '=', id)
    .orderBy('opened_at', 'desc')
    .executeTakeFirst()
const sync = (id: string, now: Date) =>
  withTx(t.db, (tx) => syncPrivacyDeadlineItem(tx, id, { now, requestId: `req-${key('sync')}` }))
/** Noon of a local date in the business zone, as an instant (a later `now`). */
const noonOf = (date: string) => new Date(endOfLocalDay(date, ZONE).getTime() - 12 * 3600 * 1000)

describe('privacy request dates (TSK-0136, HH-PRIV-07, OWN-DEC-175, OWN-DEC-205)', () => {
  it('[HH-PRIV-07][T68] a guest without an account submits; the automatic acknowledgment carries the dates counted in the business zone', async () => {
    const { project, cookie, body, row } = await submit('export')
    // No login account: the secure project link is enough (OWN-DEC-175 item 7).
    expect(row.account_id).toBeNull()
    const expected = privacyRequestDates(row.submitted_at, ZONE, CALENDAR, TARGETS)
    expect(row).toMatchObject({
      received_on: expected.receivedOn,
      time_zone: ZONE,
      calendar_version: 1,
      targets_version: 1,
      acknowledgment_due_on: expected.acknowledgmentDueOn,
      target_due_on: expected.targetDueOn,
      legal_deadline_on: null,
    })
    expect(row.received_on).toBe(localDateOf(row.submitted_at, ZONE))
    expect(row.acknowledged_at?.getTime()).toBe(row.submitted_at.getTime())
    // The 30 days are calendar days, the 3 business days are counted on the calendar (Monday to Friday, holidays).
    expect(expected.targetDueOn).toBe(addLocalDays(expected.receivedOn, 30))
    expect(expected.acknowledgmentDueOn).toBe(addBusinessDays(expected.receivedOn, 3, CALENDAR))

    // The customer's acknowledgment: received, the substantive acknowledgment due date and the target; never the
    // legal deadline field or anything internal.
    expect(body).toMatchObject({
      state: 'received',
      acknowledgedAt: row.submitted_at.toISOString(),
      acknowledgmentDueOn: expected.acknowledgmentDueOn,
      reviewStartedAt: null,
      targetOn: expected.targetDueOn,
      extensions: [],
    })
    expect(Object.keys(body).filter(forbiddenForCustomer)).toEqual([])
    expect(Object.keys(body)).not.toContain('deadlines')
    const mine = (await customerGet(PR(project), cookie)).json<{ requests: Record<string, unknown>[] }>()
    expect(mine.requests[0]).toMatchObject({ reference: body.reference, targetOn: expected.targetDueOn })
    expect(Object.keys(mine.requests[0] as object)).not.toContain('legalDeadline')
    // T68: another customer's session never reaches this project's requests.
    const other = await newProject()
    expect((await customerGet(PR(project), await guestCookie(other))).statusCode).toBe(404)

    // The Owner Decisions item, due at the end of the substantive acknowledgment date in the business zone.
    expect(await item(row.id)).toMatchObject({
      type: 'privacy_request',
      reason: 'privacy_acknowledgment_due',
      due_at: endOfLocalDay(expected.acknowledgmentDueOn, ZONE),
      resolved_at: null,
      reference: project.reference,
    })
    const decisions = (await get('owner', '/staff/queue/owner-decisions')).json<{
      items: { type: string; subjectId: string; link: string }[]
    }>()
    expect(decisions.items).toContainEqual(
      expect.objectContaining({ type: 'privacy_request', subjectId: row.id, link: `/privacy/${row.id}` }),
    )
    expect((await get('office', '/staff/queue/owner-decisions')).statusCode).toBe(403)
    // The deadline job waits for that moment.
    const job = await t.db
      .selectFrom('platform.jobs')
      .select(['run_at', 'state'])
      .where('job_key', '=', `privacy.request_deadlines:${row.id}:acknowledgment:${expected.acknowledgmentDueOn}`)
      .executeTakeFirstOrThrow()
    expect(job).toEqual({ run_at: endOfLocalDay(expected.acknowledgmentDueOn, ZONE), state: 'queued' })

    // The Owner's list and detail show the dates.
    const d = await detail(row.id)
    expect(d.deadlines).toMatchObject({
      state: 'CONFIGURED',
      receivedOn: expected.receivedOn,
      acknowledgmentDueOn: expected.acknowledgmentDueOn,
      targetDueOn: expected.targetDueOn,
      targetOn: expected.targetDueOn,
      substantiveAcknowledgedAt: null,
      legalDeadline: { on: null, note: null, recordedAt: null },
      alerts: [],
    })
    const list = (await get('owner', '/staff/privacy-requests?state=received')).json<{ items: Detail[] }>()
    expect(list.items.find((i) => i.id === row.id)?.deadlines.targetOn).toBe(expected.targetDueOn)
  })

  it('[HH-PRIV-07] nothing closes when the dates pass; the overdue alerts say which date passed', async () => {
    const { row } = await submit('export')
    const ack = row.acknowledgment_due_on as string
    const target = row.target_due_on as string
    // The day after the substantive acknowledgment was due, the Owner has not reviewed it yet.
    const afterAck = noonOf(addLocalDays(ack, 1))
    expect(await sync(row.id, afterAck)).toBe('open')
    expect(await item(row.id)).toMatchObject({
      reason: 'privacy_acknowledgment_overdue',
      due_at: endOfLocalDay(ack, ZONE),
      resolved_at: null,
    })
    expect((await requestDeadlines(t.db, [row.id], afterAck)).get(row.id)?.alerts).toEqual(['acknowledgment_overdue'])
    // Long after the internal target: still received, never rejected or closed.
    const afterTarget = noonOf(addLocalDays(target, 5))
    await withTx(t.db, async (tx) => {
      const job = privacyDeadlineAutomation()
      const out = await job.handle({
        tx,
        job: {
          id: randomUUID(),
          key: 'synthetic',
          automation: job.name,
          attempt: 1,
          payload: {},
          eventId: null,
          eventType: null,
          target: { type: 'privacy_request', id: row.id },
          requestId: `req-${key('job')}`,
        },
        idempotencyKey: 'synthetic',
        log: { info() {}, warn() {}, error() {}, debug() {} } as never,
        signal: new AbortController().signal,
      })
      expect(out).toBe('done')
    })
    await sync(row.id, afterTarget)
    expect(await item(row.id)).toMatchObject({ reason: 'privacy_completion_overdue', resolved_at: null })
    expect((await requestDeadlines(t.db, [row.id], afterTarget)).get(row.id)?.alerts).toEqual([
      'acknowledgment_overdue',
      'completion_overdue',
    ])
    const after = await t.db
      .selectFrom('privacy.privacy_requests')
      .select(['state', 'decided_at', 'target_due_on'])
      .where('id', '=', row.id)
      .executeTakeFirstOrThrow()
    expect(after).toEqual({ state: 'received', decided_at: null, target_due_on: target })
    // The dates are counted once: the database refuses to move them.
    await expect(
      sql`UPDATE privacy.privacy_requests SET target_due_on = target_due_on + 10 WHERE id = ${row.id}`.execute(t.db),
    ).rejects.toThrow(/counted once/)
    await expect(
      sql`UPDATE privacy.privacy_requests SET acknowledged_at = now() WHERE id = ${row.id}`.execute(t.db),
    ).rejects.toThrow(/recorded once/)
  })

  it('[HH-PRIV-07][RULE-HUMAN-REVIEW] the review is the substantive acknowledgment; the Owner extends the target with a reason the customer sees', async () => {
    const { project, cookie, body, row } = await submit('export')
    let d = await detail(row.id)
    const reviewed = await write('owner', `/staff/privacy-requests/${row.id}/review`, {}, d.version)
    expect(reviewed.statusCode, reviewed.body).toBe(200)
    d = reviewed.json<Detail>()
    expect(d.deadlines.substantiveAcknowledgedAt).not.toBeNull()
    const target = row.target_due_on as string
    expect(await item(row.id)).toMatchObject({
      reason: 'privacy_completion_due',
      due_at: endOfLocalDay(target, ZONE),
    })

    // Owner only; a reason and a later date are needed; the version shown.
    const later = addLocalDays(target, 15)
    const reason = 'Synthetic: the export needs records from an archived job.'
    expect(
      (await write('office', `/staff/privacy-requests/${row.id}/extension`, { targetOn: later, reason }, d.version))
        .statusCode,
    ).toBe(403)
    const notLater = await write(
      'owner',
      `/staff/privacy-requests/${row.id}/extension`,
      { targetOn: target, reason },
      d.version,
    )
    expect(notLater.statusCode).toBe(400)
    expect(notLater.json()).toMatchObject({ error: { fieldErrors: [{ code: 'NOT_AFTER_TARGET' }] } })
    expect(
      (await write('owner', `/staff/privacy-requests/${row.id}/extension`, { targetOn: later, reason: ' ' }, d.version))
        .statusCode,
    ).toBe(400)
    const stale = await write(
      'owner',
      `/staff/privacy-requests/${row.id}/extension`,
      { targetOn: later, reason },
      d.version - 1,
    )
    expect(stale.json()).toMatchObject({ error: { code: 'STALE_VERSION' } })
    const extended = await write(
      'owner',
      `/staff/privacy-requests/${row.id}/extension`,
      { targetOn: later, reason },
      d.version,
    )
    expect(extended.statusCode, extended.body).toBe(200)
    expect(extended.json()).toMatchObject({ previous: target, current: later, version: d.version + 1 })
    d = await detail(row.id)
    expect(d.deadlines).toMatchObject({
      targetDueOn: target,
      targetOn: later,
      extensions: [{ previousTargetOn: target, targetOn: later, reason }],
    })
    expect(await item(row.id)).toMatchObject({ reason: 'privacy_completion_due', due_at: endOfLocalDay(later, ZONE) })
    // The customer is told the new date and why (the notice is shown in the portal).
    const mine = (await customerGet(PR(project), cookie)).json<{ requests: Record<string, unknown>[] }>()
    expect(mine.requests.find((r) => r['reference'] === body.reference)).toMatchObject({
      targetOn: later,
      extensions: [{ targetOn: later, reason }],
    })
    // Audited, with the dates.
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary', 'reason'])
      .where('target_id', '=', row.id)
      .where('action', '=', 'privacy.target_extend')
      .executeTakeFirstOrThrow()
    expect(audit).toMatchObject({ summary: { from: target, to: later }, reason })
    // Extensions are append-only, and only a live Owner records one, from the target in force.
    await expect(sql`DELETE FROM privacy.privacy_request_extensions`.execute(t.db)).rejects.toThrow()
    await expect(sql`UPDATE privacy.privacy_request_extensions SET reason = 'x'`.execute(t.db)).rejects.toThrow()
    await expect(
      sql`INSERT INTO privacy.privacy_request_extensions (privacy_request_id, previous_target_on, target_on, reason,
            decided_by, request_id) VALUES (${row.id}, ${later}, ${addLocalDays(later, 1)}, 'Synthetic', ${ids.office},
            'synthetic')`.execute(t.db),
    ).rejects.toThrow(/Owner/)
    await expect(
      sql`INSERT INTO privacy.privacy_request_extensions (privacy_request_id, previous_target_on, target_on, reason,
            decided_by, request_id) VALUES (${row.id}, ${target}, ${addLocalDays(later, 1)}, 'Synthetic', ${ids.owner},
            'synthetic')`.execute(t.db),
    ).rejects.toThrow()
  })

  it('[HH-PRIV-07][RULE-HUMAN-REVIEW] the legal deadline is a separate field the Owner records; never computed, never shown to the customer', async () => {
    const { project, cookie, body, row } = await submit('export')
    let d = await detail(row.id)
    expect(d.deadlines.legalDeadline.on).toBeNull()
    const on = addLocalDays(row.received_on as string, 45)
    const note = 'Synthetic: the date the attorney gave for this request.'
    expect(
      (await write('office', `/staff/privacy-requests/${row.id}/legal-deadline`, { on, note }, d.version, 'PUT'))
        .statusCode,
    ).toBe(403)
    const before = await write(
      'owner',
      `/staff/privacy-requests/${row.id}/legal-deadline`,
      { on: addLocalDays(row.received_on as string, -1), note },
      d.version,
      'PUT',
    )
    expect(before.json()).toMatchObject({ error: { fieldErrors: [{ code: 'BEFORE_RECEIPT' }] } })
    const recorded = await write(
      'owner',
      `/staff/privacy-requests/${row.id}/legal-deadline`,
      { on, note },
      d.version,
      'PUT',
    )
    expect(recorded.statusCode, recorded.body).toBe(200)
    d = await detail(row.id)
    expect(d.deadlines.legalDeadline).toMatchObject({ on, note })
    // The internal dates are unchanged by it.
    expect(d.deadlines.targetOn).toBe(row.target_due_on)
    // Past the legal deadline (and the target): both alerts; the item says the legal deadline passed.
    const afterLegal = noonOf(addLocalDays(on, 1))
    await sync(row.id, afterLegal)
    expect(await item(row.id)).toMatchObject({ reason: 'privacy_legal_deadline_overdue', resolved_at: null })
    expect((await requestDeadlines(t.db, [row.id], afterLegal)).get(row.id)?.alerts).toContain('legal_deadline_overdue')
    // The customer's view never names it (PROPOSED: internal until the attorney's wording).
    const mine = (await customerGet(PR(project), cookie)).json<{ requests: Record<string, unknown>[] }>()
    const shown = mine.requests.find((r) => r['reference'] === body.reference) as Record<string, unknown>
    expect(JSON.stringify(shown)).not.toContain(on)
    // Cleared with a note.
    const cleared = await write(
      'owner',
      `/staff/privacy-requests/${row.id}/legal-deadline`,
      { on: null, note: 'Synthetic: the attorney withdrew it.' },
      d.version,
      'PUT',
    )
    expect(cleared.json()).toMatchObject({ previous: on, current: null })
  })

  it('[HH-PRIV-07][HH-PRIV-03] a deletion completed after its target is a partial response for retained records; the item leaves Owner Decisions', async () => {
    const { row } = await submit('deletion')
    let d = await detail(row.id)
    d = (await write('owner', `/staff/privacy-requests/${row.id}/review`, {}, d.version)).json<Detail>()
    await sync(row.id, noonOf(addLocalDays(row.target_due_on as string, 2)))
    expect(await item(row.id)).toMatchObject({ reason: 'privacy_completion_overdue' })
    const decided = await write(
      'owner',
      `/staff/privacy-requests/${row.id}/decision`,
      {
        decision: 'complete',
        reason: 'Synthetic: eligible data deleted; the request record stays.',
        confirmedChecks: d.plan.confirm,
        closeAccess: false,
        identityConfirmed: true,
      },
      d.version,
    )
    expect(decided.statusCode, decided.body).toBe(200)
    const out = decided.json<Detail & { outcome: { retained: { category: string }[] } }>()
    // Never denied because records must be kept: a partial response naming what stays.
    expect(out.state).toBe('partially_completed')
    expect(out.outcome.retained.length).toBeGreaterThan(0)
    expect(out.deadlines.alerts).toEqual([])
    expect(await item(row.id)).toMatchObject({ resolution: 'decided' })
    expect((await item(row.id))?.resolved_at).not.toBeNull()
    // A decided request takes no extension or legal deadline.
    const late = await write(
      'owner',
      `/staff/privacy-requests/${row.id}/extension`,
      { targetOn: addLocalDays(row.target_due_on as string, 30), reason: 'Synthetic' },
      out.version,
    )
    expect(late.json()).toMatchObject({ error: { fieldErrors: [{ code: 'ALREADY_DECIDED' }] } })
  })
})

describe('the business-day calendar (TSK-0136, OWN-DEC-205, FACT-BUSINESS-CALENDAR)', () => {
  it('[HH-PRIV-07][RULE-SERVER-AUTHZ] the Owner reads and changes the calendar; a request keeps the version it was counted with', async () => {
    const shown = await get('owner', '/staff/settings/business-calendar')
    expect(shown.statusCode, shown.body).toBe(200)
    const setting = shown.json<{
      version: number
      calendar: BusinessCalendar
      observed: { holiday: string; observed: string }[]
    }>()
    expect(setting).toMatchObject({ version: 1, calendar: CALENDAR })
    expect(setting.observed.filter((h) => h.holiday === 'independence_day').length).toBe(2)
    expect((await get('office', '/staff/settings/business-calendar')).statusCode).toBe(403)

    const old = await submit('export')
    // The Owner closes the first business day after today: requests received from now on count around it.
    const today = localDateOf(new Date(), ZONE)
    const closed = addBusinessDays(today, 1, CALENDAR)
    const next = { ...CALENDAR, closedDates: [closed] }
    const body = { workdays: next.workdays, holidays: next.holidays, closedDates: next.closedDates }
    expect(
      (await write('office', '/staff/settings/business-calendar', { ...body, reason: 'Synthetic' }, 1, 'PUT'))
        .statusCode,
    ).toBe(403)
    expect(
      (
        await write(
          'owner',
          '/staff/settings/business-calendar',
          { ...body, workdays: [], reason: 'Synthetic' },
          1,
          'PUT',
        )
      ).statusCode,
    ).toBe(400)
    const changed = await write(
      'owner',
      '/staff/settings/business-calendar',
      { ...body, reason: 'Synthetic: closed for an internal event.' },
      1,
      'PUT',
    )
    expect(changed.statusCode, changed.body).toBe(200)
    expect(changed.json()).toMatchObject({ version: 2, calendar: { closedDates: [closed] } })
    const entry = (await loadConfig(t.db)).get('business.calendar')
    expect(entry).toMatchObject({
      state: 'CONFIGURED',
      version: 2,
      sourceIds: ['FACT-BUSINESS-CALENDAR', 'OWN-DEC-205'],
    })

    const fresh = await submit('export')
    const expected = privacyRequestDates(fresh.row.submitted_at, ZONE, next, TARGETS)
    expect(fresh.row).toMatchObject({ calendar_version: 2, acknowledgment_due_on: expected.acknowledgmentDueOn })
    // The earlier request keeps its dates and version 1.
    const kept = await t.db
      .selectFrom('privacy.privacy_requests')
      .select(['calendar_version', 'acknowledgment_due_on'])
      .where('id', '=', old.row.id)
      .executeTakeFirstOrThrow()
    expect(kept).toEqual({ calendar_version: 1, acknowledgment_due_on: old.row.acknowledgment_due_on })
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['summary'])
      .where('action', '=', 'business_settings.change_calendar')
      .executeTakeFirstOrThrow()
    expect(audit.summary).toMatchObject({ to: { closedDates: [closed] }, previousVersion: 1 })
  })

  it('[HH-PRIV-07][RULE-NO-INVENTED-FACTS] while the calendar is NOT CONFIGURED a request has no dates and says so; its job counts them later', async () => {
    const before = (await loadConfig(t.db)).get('business.calendar')
    if (before.state !== 'CONFIGURED') throw new Error('expected a configured calendar')
    await recordPolicyVersion(t.db, {
      key: 'business.calendar',
      value: null,
      sourceIds: ['FACT-BUSINESS-CALENDAR'],
      changedBy: 'test',
      reason: 'synthetic test configuration',
    })
    const { row } = await submit('export')
    expect(row).toMatchObject({ received_on: null, acknowledgment_due_on: null, target_due_on: null })
    expect(row.acknowledged_at).not.toBeNull()
    expect(await item(row.id)).toMatchObject({ reason: 'privacy_dates_not_configured', due_at: null })
    expect((await detail(row.id)).deadlines).toMatchObject({ state: 'NOT_CONFIGURED', alerts: [] })
    await recordPolicyVersion(t.db, {
      key: 'business.calendar',
      value: before.value,
      sourceIds: ['FACT-BUSINESS-CALENDAR', 'OWN-DEC-205'],
      changedBy: 'test',
      reason: 'synthetic test configuration restored',
    })
    // The deadline job (as migration 0103 schedules for older requests) counts them from the receipt.
    await withTx(t.db, async (tx) => {
      const job = privacyDeadlineAutomation()
      await job.handle({
        tx,
        job: {
          id: randomUUID(),
          key: 'synthetic',
          automation: job.name,
          attempt: 1,
          payload: {},
          eventId: null,
          eventType: null,
          target: { type: 'privacy_request', id: row.id },
          requestId: `req-${key('job')}`,
        },
        idempotencyKey: 'synthetic',
        log: { info() {}, warn() {}, error() {}, debug() {} } as never,
        signal: new AbortController().signal,
      })
    })
    const counted = await t.db
      .selectFrom('privacy.privacy_requests')
      .select(['received_on', 'acknowledgment_due_on'])
      .where('id', '=', row.id)
      .executeTakeFirstOrThrow()
    const calendar = { ...before.value }
    expect(counted).toEqual({
      received_on: localDateOf(row.submitted_at, ZONE),
      acknowledgment_due_on: privacyRequestDates(row.submitted_at, ZONE, calendar, TARGETS).acknowledgmentDueOn,
    })
    expect(await item(row.id)).toMatchObject({ reason: 'privacy_acknowledgment_due' })
  })
})
