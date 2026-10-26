// Worker notes and proposed replies, and their Owner/Office review, against PostgreSQL 16 and the provider fakes
// (TSK-0155; HH-COM-16, HH-COM-08, HH-COM-01, HH-COM-03, T66, T26, ENT-Message, ENT-QueueItem, OWN-DEC-211,
// OWN-DEC-162, RULE-LANGUAGES, RULE-AI-WAVE2, RULE-SERVER-AUTHZ). Staff, customers, addresses and every text are
// synthetic and built at runtime (RULE-SYNTHETIC-DATA); nothing reaches a real provider. The estimate terms version
// recorded below is a fixture of this throwaway database.
// - Visits are fixtures in the first hours of today's local date (as in escalation.test.ts); dates come from
//   localDateOf(now, America/Kentucky/Louisville), never a weekday.
import { randomUUID } from 'node:crypto'
import {
  createDb,
  loadLoadoutSeed,
  loadServiceSeed,
  loadSopSeed,
  syncLoadouts,
  syncServices,
  syncSops,
  withTx,
  type Db,
} from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { localClockOf, localDateOf, offsetMinutesAt, resolveLocalTime, resolveWindow } from '@handyhub/domain'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { replyFailureItem, replyRecordCheck, replyValues, type InboundAddress } from '../../src/modules/inbox/index.js'
import { releaseAutomation, releaseTemplateVersion } from '../../src/modules/notifications/index.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { createProviders } from '../../src/providers/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { verifyCountyOf } from '../fixtures/county.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'
import { verifyPropertyZone } from '../fixtures/zones.js'

const ZONE = 'America/Kentucky/Louisville'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'proposals', 'code', 'key', 'for', 'tests', 'only', '0155'].join('-'),
})
const pw = ['synthetic', 'proposals', 'passphrase', '155'].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'ann', 'ben', 'cara'] as const
type Person = (typeof PEOPLE)[number]
const SITE = 'https://site.example.test'
const ADDRESS: InboundAddress = { local: 'replies', domain: 'inbound.example.test' }
const settings = readProviderSettings({ HANDYHUB_ENV: 'ci', INBOUND_EMAIL_ADDRESS: 'replies@inbound.example.test' })
const providers = createProviders(settings)
if (!providers.email || !providers.sms || !providers.fakes.email) throw new Error('ci uses the fakes')
const fakeEmail = providers.fakes.email

let t: TestDatabase
let wide: Db
let app: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>
const today = () => localDateOf(new Date(), ZONE)

const release: Automation = {
  ...releaseAutomation(
    { email: providers.email, sms: providers.sms, replyAddress: ADDRESS },
    { recordChecks: { project: replyRecordCheck }, failureItem: replyFailureItem, values: replyValues(SITE) },
  ),
  retry: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1 },
}
async function drain() {
  const w = createWorker({ db: t.db, registry: createAutomationRegistry([release]) })
  for (let i = 0; i < 20; i++) {
    const r = await w.runOnce()
    if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) return
    await new Promise((res) => setTimeout(res, 5))
  }
}

async function signIn(p: Person) {
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.155' },
    payload: { email: `${p}-proposals@example.test`, password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return { cookie, csrf: session.json<{ csrfToken: string }>().csrfToken }
}

let seq = 0
const key = () => `synthetic-proposals-${String(++seq).padStart(6, '0')}-${randomUUID()}`
function staffWrite(
  who: Person,
  url: string,
  payload: unknown,
  opts: { version?: number; method?: 'POST' | 'PUT' } = {},
) {
  return app.inject({
    method: opts.method ?? 'POST',
    url,
    payload: payload as object,
    headers: {
      cookie: cookies[who],
      'x-csrf-token': csrf[who],
      'idempotency-key': key(),
      ...(opts.version === undefined ? {} : { 'if-match': `"${opts.version}"` }),
    },
  })
}
const staffGet = (who: Person, url: string) => app.inject({ method: 'GET', url, headers: { cookie: cookies[who] } })
type Err = { error: { code: string; fieldErrors: { field: string; code: string }[] } }

beforeAll(async () => {
  t = await createTestDatabase()
  wide = createDb(t.url, { max: 8, applicationName: 'proposals-test' })
  await syncServices(t.db, loadServiceSeed())
  await syncSops(t.db, loadSopSeed())
  await syncLoadouts(t.db, loadLoadoutSeed())
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: wide, codeKey: KEY, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const role = p === 'ann' || p === 'ben' || p === 'cara' ? 'worker' : p
      const user = await createStaffUser(tx, {
        email: `${p}-proposals@example.test`,
        displayName: `Synthetic ${p}`,
        // A Spanish-speaking worker and a Spanish-locale Office reviewer: customer content stays English.
        locale: p === 'ben' || p === 'office' ? 'es' : 'en',
        role,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
  })
  for (const p of PEOPLE) ({ cookie: cookies[p], csrf: csrf[p] } = await signIn(p))
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
  // Synthetic reply wording for these tests only: the real wording is the owner's (OQ-STAFF-REPLY-WORDING).
  await withTx(t.db, async (tx) => {
    for (const channel of ['email', 'sms'] as const)
      await releaseTemplateVersion(tx, {
        messageKey: 'staff.reply',
        channel,
        locale: 'en',
        subject: channel === 'email' ? 'Synthetic proposal reply subject' : null,
        body: 'Synthetic proposal reply: {replyText}',
        translationReview: 'source',
        sourceIds: ['TSK-0155'],
        releasedBy: 'staff-synthetic-owner',
      })
  })
})
afterAll(async () => {
  await app?.close()
  await wide?.destroy()
  await t?.drop()
})

// --- Fixtures (as in escalation.test.ts) ------------------------------------------------------------------------------

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)
type Project = {
  requestId: string
  projectId: string
  propertyId: string
  contactId: string
  email: string
  reference: string
  cookie: string
}
let ip = 40

/** A qualified synthetic request with one DW-01 work package, and a verified customer session for its project. */
async function project(): Promise<Project> {
  const email = `proposals-${++seq}-${randomUUID().slice(0, 8)}@example.test`
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key(), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic proposals project.',
      answers: [],
      property: {
        street: `${seq} Synthetic Proposal Lane`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Synthetic Proposal Customer',
        email,
        phone: '(502) 555-0155',
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
    .select(['r.id', 'r.project_id', 'r.contact_id', 'p.property_id'])
    .where('r.reference', '=', reference)
    .executeTakeFirstOrThrow()
  await verifyCountyOf(t.db, row.project_id)
  await verifyPropertyZone(t.db, { projectId: row.project_id })
  const grant = await t.db
    .selectFrom('identity.project_access_grants')
    .select('id')
    .where('request_id', '=', row.id)
    .executeTakeFirstOrThrow()
  const q = await app.inject({
    method: 'PUT',
    url: `/api/v1/staff/requests/${row.id}/qualification`,
    payload: { checks: ALL_OK },
    headers: { cookie: cookies.owner, 'x-csrf-token': csrf.owner, 'idempotency-key': key(), 'if-match': '"0"' },
  })
  expect(q.statusCode, q.body).toBe(200)
  const moved = await staffWrite(
    'owner',
    `/api/v1/staff/requests/${row.id}/actions/estimate-visit`,
    { customerExplanation: 'We need to see the synthetic wall.', workPackages: ['SVC-DW-01'] },
    { version: 1 },
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
  // The customer's email is verified, so a reviewed reply can go to it (HH-COM-08).
  await sql`UPDATE crm.contacts SET email_verification = 'verified', email_verified_value = lower(email)
            WHERE id = ${row.contact_id}`.execute(t.db)
  return {
    requestId: row.id,
    projectId: row.project_id,
    propertyId: row.property_id,
    contactId: row.contact_id,
    email,
    reference,
    cookie: `__Host-hh_customer=${s.token}`,
  }
}

/** Approves one synthetic line through the real approval transaction; returns the job. */
async function approve(p: Project): Promise<string> {
  const created = await staffWrite('estimator', `/api/v1/staff/projects/${p.projectId}/estimates`, {})
  expect(created.statusCode, created.body).toBe(201)
  const c = created.json<{ number: string; versionId: string }>()
  const v = (await staffGet('estimator', `/api/v1/staff/estimate-versions/${c.versionId}`)).json<{
    rowVersion: number
    workPackages: { id: string }[]
  }>()
  const saved = await app.inject({
    method: 'PUT',
    url: `/api/v1/staff/estimate-versions/${c.versionId}/draft`,
    payload: {
      lines: [
        {
          kind: 'base',
          workPackageId: v.workPackages[0]?.id,
          description: 'Patch the synthetic wall',
          quantity: '1',
          unit: 'patch',
          unitPriceCents: 1250,
        },
      ],
      texts: { exclusions: ['Synthetic: moving furniture'] },
    },
    headers: {
      cookie: cookies.estimator,
      'x-csrf-token': csrf.estimator,
      'idempotency-key': key(),
      'if-match': `"${v.rowVersion}"`,
    },
  })
  expect(saved.statusCode, saved.body).toBe(200)
  const pub = await staffWrite(
    'estimator',
    `/api/v1/staff/estimate-versions/${c.versionId}/publish`,
    {},
    { version: saved.json<{ rowVersion: number }>().rowVersion },
  )
  expect(pub.statusCode, pub.body).toBe(200)
  const base = `/api/v1/customer/projects/${p.reference}/estimates/${c.number}/versions/1`
  const d = (await app.inject({ method: 'GET', url: base, headers: { cookie: p.cookie } })).json<{
    approval: { contentDigest: string; selection: { totalCents: number; deposit: { amountCents: number | null } } }
  }>()
  const res = await app.inject({
    method: 'POST',
    url: `${base}/approve`,
    headers: {
      cookie: p.cookie,
      'idempotency-key': key(),
      'x-forwarded-for': `2001:db8:155:${++ip}::1`,
      'user-agent': 'SyntheticBrowser/1.0 (test)',
    },
    payload: {
      contentDigest: d.approval.contentDigest,
      options: [],
      totalCents: d.approval.selection.totalCents,
      depositCents: d.approval.selection.deposit.amountCents,
      termsDocumentId: ESTIMATE_TERMS.documentId,
      termsSha256: ESTIMATE_TERMS.contentSha256,
      acceptTerms: true,
      fullName: 'Synthetic Proposal Customer',
    },
  })
  expect(res.statusCode, res.body).toBe(201)
  return (
    await t.db.selectFrom('work.jobs').select('id').where('project_id', '=', p.projectId).executeTakeFirstOrThrow()
  ).id
}

const SLOT_MINUTES = 30
const taken = new Map<string, Set<number>>()
/** The first free 30-minute slot after local midnight of `date` for the team (see my-day.test.ts). */
function fixtureWindow(date: string, team: Person[]) {
  const midnight = resolveLocalTime(date, '00:00', ZONE)
  if (midnight.kind !== 'unique') throw new Error('fixture midnight')
  for (let k = 0; k < 24; k++) {
    if (team.some((who) => taken.get(`${date}|${who}`)?.has(k))) continue
    const startsAt = new Date(midnight.at.instant.getTime() + k * SLOT_MINUTES * 60_000)
    const endsAt = new Date(startsAt.getTime() + (SLOT_MINUTES / 2) * 60_000)
    if (localDateOf(startsAt, ZONE) !== date) break
    const w = resolveWindow({
      date,
      start: localClockOf(startsAt, ZONE),
      end: localClockOf(endsAt, ZONE),
      zone: ZONE,
      startOffsetMinutes: offsetMinutesAt(startsAt, ZONE),
      endOffsetMinutes: offsetMinutesAt(endsAt, ZONE),
    })
    if (!w.ok) continue
    for (const who of team) {
      const set = taken.get(`${date}|${who}`) ?? new Set<number>()
      set.add(k)
      taken.set(`${date}|${who}`, set)
    }
    return w.window
  }
  throw new Error('fixture window')
}
/** A confirmed work visit today for the team (lead first). */
async function fixtureVisit(p: Project, jobId: string, team: Person[]): Promise<string> {
  const window = fixtureWindow(today(), team)
  return withTx(t.db, async (tx) => {
    const v = await tx
      .insertInto('work.visits')
      .values({
        purpose: 'service',
        project_id: p.projectId,
        job_id: jobId,
        property_id: p.propertyId,
        local_date: window.date,
        window_start: window.start,
        window_end: window.end,
        time_zone: ZONE,
        start_offset_minutes: window.startOffsetMinutes,
        end_offset_minutes: window.endOffsetMinutes,
        starts_at: window.startsAt,
        ends_at: window.endsAt,
        window_set_by: ids.office,
        expected_duration_minutes: SLOT_MINUTES / 2,
        preparation_buffer_minutes: 0,
        travel_buffer_minutes: 0,
        required_workers: team.length,
        created_by: ids.office,
      })
      .returning(['id', 'version'])
      .executeTakeFirstOrThrow()
    for (const [i, who] of team.entries())
      await tx
        .insertInto('work.reservations')
        .values({
          visit_id: v.id,
          resource: 'worker',
          staff_user_id: ids[who],
          role: i === 0 ? 'lead' : 'member',
          kind: 'confirmed',
          starts_at: window.startsAt,
          ends_at: new Date(window.endsAt.getTime() + (SLOT_MINUTES / 2) * 60_000),
          time_zone: ZONE,
          assigned_by: ids.office,
        })
        .execute()
    await tx
      .updateTable('work.visits')
      .set({ state: 'confirmed', version: v.version + 1 })
      .where('id', '=', v.id)
      .execute()
    return v.id
  })
}
/** A job with a confirmed visit today for Ann (lead) and Ben; Cara is not assigned. */
async function jobWithVisit() {
  const p = await project()
  const jobId = await approve(p)
  await fixtureVisit(p, jobId, ['ann', 'ben'])
  return { p, jobId }
}

// --- Helpers -------------------------------------------------------------------------------------------------------

type Own = {
  id: string
  version: number
  status: string
  text: string
  clarification: { question: string } | null
  rejectReason: string | null
  events: { kind: string; text: string | null }[]
  actions: { edit: boolean; submit: boolean; answer: boolean }
}
type Review = {
  id: string
  status: string
  clarificationOpen: boolean
  originalText: string
  sentMessage: { id: string; conversationId: string } | null
  actions: { clarify: boolean; reject: boolean; send: boolean }
}
const propose = (who: Person, jobId: string, text: string, submit = true) =>
  staffWrite(who, `/api/v1/staff/jobs/${jobId}/reply-proposals`, { text, submit })
async function proposed(who: Person, jobId: string, text: string, submit = true): Promise<Own> {
  const res = await propose(who, jobId, text, submit)
  expect(res.statusCode, res.body).toBe(201)
  return res.json<Own>()
}
const sendReviewed = (who: Person, id: string, body: string, extra: Record<string, unknown> = {}) =>
  staffWrite(who, `/api/v1/staff/reply-proposals/${id}/send`, {
    body,
    channel: 'email',
    approveEnglish: true,
    ...extra,
  })
const openItems = (subjectId: string) =>
  t.db
    .selectFrom('ops.queue_items')
    .select(['id', 'reason', 'reference', 'project_id'])
    .where('type', '=', 'reply_proposal')
    .where('subject_id', '=', subjectId)
    .where('resolved_at', 'is', null)
    .execute()
const mine = async (who: Person) => {
  const res = await staffGet(who, '/api/v1/staff/reply-proposals/mine')
  expect(res.statusCode, res.body).toBe(200)
  return res.json<{ items: Own[] }>().items
}

describe('workers propose; only Owner or Office send (TSK-0155, HH-COM-16, OWN-DEC-211)', () => {
  it('[HH-COM-16][T26][RULE-SERVER-AUTHZ] a worker cannot send a customer message, review or reach a job they are not on', async () => {
    const { p, jobId } = await jobWithVisit()
    const draft = await proposed('ann', jobId, 'Sintético: el cliente pregunta por la pintura.', false)
    // The project's reply composer and the review routes are refused to a worker, whatever they are assigned to.
    const direct = await staffWrite('ann', `/api/v1/staff/inbox/projects/${p.projectId}/replies`, {
      body: 'Synthetic direct reply.',
      channel: 'email',
    })
    expect(direct.statusCode).toBe(403)
    expect((await staffGet('ann', `/api/v1/staff/reply-proposals/${draft.id}`)).statusCode).toBe(403)
    expect((await sendReviewed('ann', draft.id, 'Synthetic English reply.')).statusCode).toBe(403)
    for (const [action, body] of [
      ['reject', { reason: 'x' }],
      ['clarification', { text: 'x' }],
    ] as const)
      expect((await staffWrite('ann', `/api/v1/staff/reply-proposals/${draft.id}/${action}`, body)).statusCode).toBe(
        403,
      )
    // The Estimator reviews nothing either.
    expect((await sendReviewed('estimator', draft.id, 'Synthetic English reply.')).statusCode).toBe(403)
    // A worker not assigned to the job neither proposes nor reads its notes; nor follows someone else's proposal.
    expect((await propose('cara', jobId, 'Sintético: no asignada.')).statusCode).toBe(403)
    expect((await staffGet('cara', `/api/v1/staff/jobs/${jobId}/notes-and-replies`)).statusCode).toBe(403)
    expect((await staffWrite('cara', `/api/v1/staff/reply-proposals/${draft.id}/submit`, {})).statusCode).toBe(403)
    expect((await mine('cara')).map((x) => x.id)).not.toContain(draft.id)
    // Nothing reached the customer conversation, and a draft is the worker's alone (not in review).
    expect(
      await t.db
        .selectFrom('comms.messages')
        .select('id')
        .where('project_id', '=', p.projectId)
        .where('direction', '<>', 'internal')
        .execute(),
    ).toEqual([])
    expect((await staffGet('office', `/api/v1/staff/reply-proposals/${draft.id}`)).statusCode).toBe(404)
    expect(await openItems(draft.id)).toEqual([])
    // The database refuses a decision by anyone but a live Owner or Office grant, whatever path writes.
    await expect(
      sql`UPDATE comms.reply_proposals SET state = 'rejected', reject_reason = 'x', decided_by = ${ids.ann},
            decided_at = now(), submitted_at = now() WHERE id = ${draft.id}`.execute(t.db),
    ).rejects.toThrow(/only an Owner or Office account decides/)
  })

  it('[HH-COM-16] a draft changes until it is submitted; the proposal reaches the review queue and notifies Owner and Office', async () => {
    const { p, jobId } = await jobWithVisit()
    const draft = await proposed('ben', jobId, 'Sintético: borrador.', false)
    expect([draft.status, draft.actions]).toEqual(['draft', { edit: true, submit: true, answer: false }])
    const edited = await staffWrite(
      'ben',
      `/api/v1/staff/reply-proposals/${draft.id}`,
      { text: 'Sintético: el cliente quiere saber cuándo volvemos.' },
      { method: 'PUT', version: draft.version },
    )
    expect(edited.statusCode, edited.body).toBe(200)
    // A stale version is refused.
    const stale = await staffWrite(
      'ben',
      `/api/v1/staff/reply-proposals/${draft.id}`,
      { text: 'Sintético: otra.' },
      { method: 'PUT', version: draft.version },
    )
    expect(stale.statusCode).toBe(409)
    const submitted = await staffWrite('ben', `/api/v1/staff/reply-proposals/${draft.id}/submit`, {})
    expect(submitted.statusCode, submitted.body).toBe(200)
    expect(submitted.json<Own>()).toMatchObject({
      status: 'awaiting_review',
      text: 'Sintético: el cliente quiere saber cuándo volvemos.',
      actions: { edit: false, submit: false, answer: false },
    })
    // Once submitted the text is frozen.
    const frozen = await staffWrite(
      'ben',
      `/api/v1/staff/reply-proposals/${draft.id}`,
      { text: 'Sintético: cambio.' },
      { method: 'PUT', version: submitted.json<Own>().version },
    )
    expect(frozen.json<Err>().error.fieldErrors[0]?.code).toBe('PROPOSAL_NOT_DRAFT')
    // The review item is the Owner's and Office's notice; it never quotes the worker's text.
    const items = await openItems(draft.id)
    expect(items).toEqual([
      expect.objectContaining({ reason: 'reply_proposed', reference: p.reference, project_id: p.projectId }),
    ])
    for (const who of ['owner', 'office'] as const) {
      const q = await staffGet(who, '/api/v1/staff/queue?type=reply_proposal')
      expect(q.statusCode, q.body).toBe(200)
      const listed = q.json<{ items: { subjectId: string; link: string; action: string }[] }>().items
      expect(listed.find((i) => i.subjectId === draft.id)).toMatchObject({
        link: `/reply-proposals/${draft.id}`,
        action: 'review_proposal',
      })
      expect(q.body).not.toContain('Sintético')
    }
    expect((await staffGet('ann', '/api/v1/staff/queue')).statusCode).toBe(403)
    const review = await staffGet('office', `/api/v1/staff/reply-proposals/${draft.id}`)
    expect(review.statusCode, review.body).toBe(200)
    expect(review.json<Review>()).toMatchObject({
      status: 'awaiting_review',
      originalText: 'Sintético: el cliente quiere saber cuándo volvemos.',
      actions: { clarify: true, reject: true, send: true },
    })
  })

  it('[HH-COM-16] clarification round trip: the reviewer asks, the worker answers, the item returns', async () => {
    const { jobId } = await jobWithVisit()
    const own = await proposed('ben', jobId, 'Sintético: dígale que falta una pieza.')
    const asked = await staffWrite('office', `/api/v1/staff/reply-proposals/${own.id}/clarification`, {
      text: 'Which part is missing? (synthetic)',
    })
    expect(asked.statusCode, asked.body).toBe(200)
    expect(asked.json<Review>()).toMatchObject({ clarificationOpen: true, actions: { clarify: false, send: true } })
    // The worker acts next: the reviewers' item resolves; a second question waits for the answer.
    expect(await openItems(own.id)).toEqual([])
    const twice = await staffWrite('owner', `/api/v1/staff/reply-proposals/${own.id}/clarification`, { text: 'x' })
    expect(twice.json<Err>().error.fieldErrors[0]?.code).toBe('CLARIFICATION_OPEN')
    const seen = (await mine('ben')).find((x) => x.id === own.id)
    expect(seen).toMatchObject({
      status: 'awaiting_review',
      clarification: { question: 'Which part is missing? (synthetic)' },
      actions: { answer: true },
    })
    // Another worker cannot answer for Ben.
    const other = await staffWrite('ann', `/api/v1/staff/reply-proposals/${own.id}/clarification-answer`, {
      text: 'x',
    })
    expect(other.statusCode).toBe(403)
    const answered = await staffWrite('ben', `/api/v1/staff/reply-proposals/${own.id}/clarification-answer`, {
      text: 'Sintético: la bisagra de la puerta.',
    })
    expect(answered.statusCode, answered.body).toBe(200)
    expect(answered.json<Own>()).toMatchObject({ clarification: null, actions: { answer: false } })
    expect(answered.json<Own>().events.map((e) => e.kind)).toEqual([
      'submitted',
      'clarification_requested',
      'clarification_answered',
    ])
    expect(await openItems(own.id)).toEqual([expect.objectContaining({ reason: 'clarification_answered' })])
    const again = await staffWrite('ben', `/api/v1/staff/reply-proposals/${own.id}/clarification-answer`, {
      text: 'x',
    })
    expect(again.json<Err>().error.fieldErrors[0]?.code).toBe('NO_OPEN_CLARIFICATION')
  })

  it('[HH-COM-16][HH-COM-03][T66] Office sends the English reply; the Spanish original stays with it, internal and audited', async () => {
    const { p, jobId } = await jobWithVisit()
    const spanish = 'Sintético: dígale al cliente que regresamos el martes con la pieza.'
    const english = 'Synthetic: we will be back on Tuesday with the part.'
    const own = await proposed('ben', jobId, spanish)
    // The approval is explicit: without it nothing is sent.
    const unapproved = await sendReviewed('office', own.id, english, { approveEnglish: false })
    expect(unapproved.statusCode).toBe(400)
    // The Office account uses Spanish; the customer message is the reviewer's English, in the English template.
    const res = await sendReviewed('office', own.id, english)
    expect(res.statusCode, res.body).toBe(201)
    const sent = res.json<{ id: string; conversationId: string; delivery: { id: string } }>()
    const d = await t.db
      .selectFrom('platform.message_deliveries')
      .select(['locale', 'message_key', 'released_by', 'audience'])
      .where('id', '=', sent.delivery.id)
      .executeTakeFirstOrThrow()
    expect([d.locale, d.message_key, d.released_by, d.audience]).toEqual(['en', 'staff.reply', ids.office, 'customer'])
    const m = await t.db
      .selectFrom('comms.messages')
      .select(['body_text', 'author_staff_id', 'direction'])
      .where('id', '=', sent.id)
      .executeTakeFirstOrThrow()
    expect(m).toEqual({ body_text: english, author_staff_id: ids.office, direction: 'outbound' })
    const row = await t.db
      .selectFrom('comms.reply_proposals')
      .select(['state', 'original_text', 'sent_message_id', 'decided_by'])
      .where('id', '=', own.id)
      .executeTakeFirstOrThrow()
    expect(row).toEqual({ state: 'sent', original_text: spanish, sent_message_id: sent.id, decided_by: ids.office })
    expect(await openItems(own.id)).toEqual([])
    // The worker sees Sent, never the English text.
    const seen = (await mine('ben')).find((x) => x.id === own.id)
    expect(seen?.status).toBe('sent')
    expect(JSON.stringify(seen)).not.toContain(english)
    // Staff see the original beside the reply on the project's conversation.
    const conv = await staffGet('office', `/api/v1/staff/inbox/conversations/${sent.conversationId}`)
    expect(conv.statusCode, conv.body).toBe(200)
    const reply = conv
      .json<{ messages: { id: string; body: string; proposal: { originalText: string } | null }[] }>()
      .messages.find((x) => x.id === sent.id)
    expect(reply).toMatchObject({ body: english, proposal: { originalText: spanish } })
    // The audit names the proposal, project, channel and message, never a text.
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['summary', 'actor_id'])
      .where('action', '=', 'inbox.reply_proposal_sent')
      .where('target_id', '=', own.id)
      .execute()
    expect(audit).toHaveLength(1)
    expect(audit[0]?.summary).toMatchObject({ project: p.reference, message: sent.id, channel: 'email' })
    expect(JSON.stringify(audit[0]?.summary)).not.toMatch(/martes|Tuesday/)
    // The email the customer receives holds the English text only (the English-only check of the sent message).
    await drain()
    const mails = fakeEmail.sent.filter((x) => x.to === p.email)
    expect(mails).toHaveLength(1)
    expect(mails[0]?.text).toContain(english)
    expect(`${mails[0]?.text} ${mails[0]?.html ?? ''}`).not.toContain('martes')
    // Sent is final: it never sends twice, and the database keeps it as it is.
    expect((await sendReviewed('owner', own.id, english)).json<Err>().error.fieldErrors[0]?.code).toBe(
      'PROPOSAL_NOT_AWAITING_REVIEW',
    )
    await expect(
      sql`UPDATE comms.reply_proposals SET original_text = 'x' WHERE id = ${own.id}`.execute(t.db),
    ).rejects.toThrow(/PROPOSAL_FINAL/)
    await expect(sql`DELETE FROM comms.reply_proposals WHERE id = ${own.id}`.execute(t.db)).rejects.toThrow(
      /never deleted/,
    )
  })

  it('[HH-COM-16] a rejected proposal never sends', async () => {
    const { p, jobId } = await jobWithVisit()
    const own = await proposed('ann', jobId, 'Sintético: propuesta que no se envía.')
    const rejected = await staffWrite('owner', `/api/v1/staff/reply-proposals/${own.id}/reject`, {
      reason: 'Synthetic: already answered by phone.',
    })
    expect(rejected.statusCode, rejected.body).toBe(200)
    expect(rejected.json<Review>()).toMatchObject({ status: 'rejected', actions: { send: false, reject: false } })
    expect(await openItems(own.id)).toEqual([])
    const send = await sendReviewed('office', own.id, 'Synthetic: this must never send.')
    expect(send.json<Err>().error.fieldErrors[0]?.code).toBe('PROPOSAL_NOT_AWAITING_REVIEW')
    expect((await mine('ann')).find((x) => x.id === own.id)).toMatchObject({
      status: 'rejected',
      rejectReason: 'Synthetic: already answered by phone.',
    })
    expect(
      await t.db
        .selectFrom('comms.messages')
        .select('id')
        .where('project_id', '=', p.projectId)
        .where('direction', '=', 'outbound')
        .execute(),
    ).toEqual([])
    await expect(
      sql`UPDATE comms.reply_proposals SET state = 'awaiting_review', reject_reason = NULL, decided_by = NULL,
            decided_at = NULL WHERE id = ${own.id}`.execute(t.db),
    ).rejects.toThrow(/PROPOSAL_FINAL/)
  })
})

describe('internal notes stay internal (TSK-0155, HH-COM-16, HH-COM-01, OWN-DEC-211 7, 8)', () => {
  it('[HH-COM-16][HH-COM-01] notes and originals never appear in an email, a text, the portal or a customer document', async () => {
    const { p, jobId } = await jobWithVisit()
    const marker = `nota-interna-${randomUUID().slice(0, 8)}`
    const note = await staffWrite('ben', `/api/v1/staff/jobs/${jobId}/notes`, { body: `Sintético ${marker}` })
    expect(note.statusCode, note.body).toBe(201)
    const own = await proposed('ben', jobId, `Sintético propuesta ${marker}`)
    const res = await sendReviewed('owner', own.id, 'Synthetic: thank you, we will follow up.')
    expect(res.statusCode, res.body).toBe(201)
    await drain()
    // The worker sees their own note on the job; the staff conversation keeps it apart from the customer's.
    const notes = await staffGet('ben', `/api/v1/staff/jobs/${jobId}/notes-and-replies`)
    expect(notes.json<{ notes: { body: string }[] }>().notes.map((n) => n.body)).toEqual([`Sintético ${marker}`])
    // Email and text: nothing sent anywhere carries the note or the original.
    const outbound = [...fakeEmail.sent.map((x) => `${x.subject} ${x.text} ${x.html ?? ''}`)]
    if (providers.fakes.sms) outbound.push(...providers.fakes.sms.sent.map((x) => JSON.stringify(x)))
    expect(outbound.some((x) => x.includes(marker))).toBe(false)
    expect(fakeEmail.sent.filter((x) => x.to === p.email)).toHaveLength(1)
    // The portal: every tab the customer reads, and the project list.
    const portal = ['overview', 'messages', 'documents', 'appointments', 'payments', 'photos']
    for (const tab of portal) {
      const r = await app.inject({
        method: 'GET',
        url: `/api/v1/customer/projects/${p.reference}/${tab}`,
        headers: { cookie: p.cookie },
      })
      expect(r.statusCode, `${tab} ${r.body}`).toBe(200)
      expect(r.body, tab).not.toContain(marker)
    }
    const messages = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/projects/${p.reference}/messages`,
      headers: { cookie: p.cookie },
    })
    expect(messages.json<{ messages: { text: string | null }[] }>().messages.map((x) => x.text)).toEqual([
      'Synthetic: thank you, we will follow up.',
    ])
    // Customer documents: the approved estimate as the customer reads it (the document's content and its record).
    const est = await t.db
      .selectFrom('estimating.estimates')
      .select('number')
      .where('project_id', '=', p.projectId)
      .executeTakeFirstOrThrow()
    const doc = await app.inject({
      method: 'GET',
      url: `/api/v1/customer/projects/${p.reference}/estimates/${est.number}/versions/1`,
      headers: { cookie: p.cookie },
    })
    expect(doc.statusCode, doc.body).toBe(200)
    expect(doc.body).not.toContain(marker)
    // The database keeps an internal message out of the customer conversation, whatever path writes.
    const customerConversation = res.json<{ conversationId: string }>().conversationId
    await expect(
      sql`INSERT INTO comms.messages (direction, channel, body_text, body_state, author_staff_id, link_state,
            match_rule, project_id, customer_id, conversation_id)
          SELECT 'internal', 'internal', 'x', 'received', ${ids.ben}, 'matched', 'staff', project_id, customer_id, id
            FROM comms.conversations WHERE id = ${customerConversation}`.execute(t.db),
    ).rejects.toThrow(/MESSAGE_AUDIENCE/)
  })

  it('[HH-COM-16][RULE-AI-WAVE2] no translation exists: the English message is the reviewer’s own text', async () => {
    const { jobId } = await jobWithVisit()
    const own = await proposed('ben', jobId, 'Sintético: solo español.')
    const review = (await staffGet('owner', `/api/v1/staff/reply-proposals/${own.id}`)).json<Record<string, unknown>>()
    // The review offers the original and the reviewer's composer; there is no draft, suggestion or translation.
    expect(Object.keys(review).sort()).toEqual(
      [
        'actions',
        'author',
        'clarificationOpen',
        'createdAt',
        'customer',
        'decided',
        'events',
        'id',
        'jobId',
        'maxLength',
        'originalText',
        'project',
        'rejectReason',
        'sentMessage',
        'status',
        'submittedAt',
        'version',
      ].sort(),
    )
  })
})
