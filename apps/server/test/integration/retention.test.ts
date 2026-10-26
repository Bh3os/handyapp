// The retention review against PostgreSQL 16 (TSK-0099; HH-PRIV-01, HH-DATA-09, T72, T74, ENT-RetentionReview,
// FACT-RETENTION-SCHEDULE, OWN-DEC-70, OWN-DEC-142, OQ-RETENTION-REVIEW, RULE-SERVER-AUTHZ). Staff, customers, requests
// and estimates are synthetic (RULE-SYNTHETIC-DATA); nothing reaches a provider. Time passing is a later scan clock:
// the records themselves are created now and never backdated or edited.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import {
  CATEGORY_DEFINITIONS,
  PERIOD_CATEGORIES,
  RETENTION_AUTOMATION,
  ensureRetentionScan,
  retentionReviewAutomation,
  runRetentionScan,
} from '../../src/modules/retention/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { loadConfig, parseValue, recordPolicyVersion, ConfigShapeError } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const pw = (n: number) => ['synthetic', 'retention', 'review', 'passphrase', String(n)].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof PEOPLE)[number]
const email = (p: Person) => `${p}-retention@example.test`

let t: TestDatabase
let app: FastifyInstance
const storage = new FakeObjectStorage()
const ids = {} as Record<Person, string>
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>

const YEAR_MS = 365.25 * 24 * 3600 * 1000
const later = (years: number, days = 0) => new Date(Date.now() + years * YEAR_MS + days * 24 * 3600 * 1000)

let seq = 0
const key = (what: string) => `synthetic-retention-${what}-${String(++seq).padStart(6, '0')}`
const get = (who: Person | null, url: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: who ? { cookie: cookies[who] } : {} })
function write(who: Person, method: 'POST' | 'PUT', url: string, payload: unknown, version?: number) {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    payload: payload as object,
    headers: {
      cookie: cookies[who],
      'x-csrf-token': csrf[who],
      'idempotency-key': key('write'),
      'x-forwarded-for': '198.51.100.199',
      ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    },
  })
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, storage } })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: email(p),
        displayName: `Synthetic retention ${p}`,
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
      headers: { 'x-forwarded-for': '198.51.100.199' },
      payload: { email: email(p), password: pw(1) },
    })
    expect(res.statusCode, res.body).toBe(200)
    cookies[p] = String(res.headers['set-cookie']).split(';')[0] as string
    csrf[p] = res.json().csrfToken as string
  }
  // Estimates publish under a synthetic test-only terms document (terms v1.0 is not recorded, TSK-0056).
  await recordPolicyVersion(t.db, {
    key: 'legal.estimate_terms',
    value: {
      documentId: 'test-estimate-terms-1',
      status: 'draft',
      attorneyReviewed: false,
      preparedOn: '2026-10-21',
      contentSha256: '0'.repeat(64),
    },
    sourceIds: ['TEST-SYNTHETIC'],
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

let ip = 10
/** A synthetic request through the public API. */
async function newRequest(estimatePreference: 'online' | 'site_visit' = 'site_visit') {
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
      description: 'Synthetic retention project.',
      answers: [],
      property: { street: `${n} Synthetic Way`, city: 'Testville', state: 'ky', zip: '40000', propertyType: 'house' },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference,
      contact: {
        fullName: `Synthetic Retention Customer ${n}`,
        email: `retention-customer-${n}@example.test`,
        phone: '(502) 555-0101',
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
    .select(['id', 'project_id', 'state_version'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
  return { id: row.id, projectId: row.project_id, version: row.state_version, reference }
}

/** A request closed with Not a fit (its project closes, no job). */
async function closedRequest() {
  const r = await newRequest()
  const res = await write(
    'office',
    'POST',
    `/staff/requests/${r.id}/actions/not-a-fit`,
    { category: 'coverage', customerReason: 'the property is outside the area we serve.' },
    r.version,
  )
  expect(res.statusCode, res.body).toBe(200)
  expect(res.json()).toMatchObject({ projectState: 'closed' })
  return r
}

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

/** An estimate published and then withdrawn: never accepted. */
async function withdrawnEstimate() {
  const r = await newRequest('online')
  expect((await write('owner', 'PUT', `/staff/requests/${r.id}/qualification`, { checks: ALL_OK }, 0)).statusCode).toBe(
    200,
  )
  const moved = await write(
    'owner',
    'POST',
    `/staff/requests/${r.id}/actions/online-estimate`,
    { workPackages: ['SVC-DW-01'] },
    r.version,
  )
  expect(moved.statusCode, moved.body).toBe(200)
  const created = await write('estimator', 'POST', `/staff/projects/${r.projectId}/estimates`, {})
  expect(created.statusCode, created.body).toBe(201)
  const { estimateId, number, versionId } = created.json<{ estimateId: string; number: string; versionId: string }>()
  const view = await get('estimator', `/staff/estimate-versions/${versionId}`)
  const v = view.json<{ rowVersion: number; workPackages: { id: string }[] }>()
  const saved = await write(
    'estimator',
    'PUT',
    `/staff/estimate-versions/${versionId}/draft`,
    {
      lines: [
        {
          kind: 'base',
          workPackageId: v.workPackages[0]?.id,
          description: 'Patch the synthetic hole',
          quantity: '1',
          unit: 'each',
          unitPriceCents: 12_345,
        },
      ],
      texts: {},
    },
    v.rowVersion,
  )
  expect(saved.statusCode, saved.body).toBe(200)
  const published = await write(
    'estimator',
    'POST',
    `/staff/estimate-versions/${versionId}/publish`,
    {},
    saved.json<{ rowVersion: number }>().rowVersion,
  )
  expect(published.statusCode, published.body).toBe(200)
  const withdrawn = await write(
    'estimator',
    'POST',
    `/staff/estimate-versions/${versionId}/withdraw`,
    { reason: 'Synthetic: sent to the wrong project.' },
    published.json<{ rowVersion: number }>().rowVersion,
  )
  expect(withdrawn.statusCode, withdrawn.body).toBe(200)
  return { ...r, estimateId, number, versionId }
}

const scan = (now: Date) => withTx(t.db, (tx) => runRetentionScan(tx, { now, requestId: `req-${key('scan')}` }))
const entriesFor = (recordId: string) =>
  t.db.selectFrom('privacy.retention_reviews').selectAll().where('record_id', '=', recordId).execute()

/** Row counts of a request and everything linked to it: nothing may change by a scan. */
async function footprint(r: { id: string; projectId: string }) {
  const one = async (table: string, column: string, id: string) =>
    Number(
      (
        await sql<{
          n: string
        }>`SELECT count(*)::text AS n FROM ${sql.table(table)} WHERE ${sql.ref(column)} = ${id}`.execute(t.db)
      ).rows[0]?.n,
    )
  return {
    request: await one('intake.requests', 'id', r.id),
    project: await one('crm.projects', 'id', r.projectId),
    decisions: await one('intake.request_decisions', 'request_id', r.id),
    services: await one('intake.request_services', 'request_id', r.id),
    packages: await one('work.work_packages', 'project_id', r.projectId),
    audit: await one('platform.audit_events', 'target_id', r.id),
  }
}

describe('the retention schedule as configuration (TSK-0099, HH-PRIV-01, FACT-RETENTION-SCHEDULE)', () => {
  it('[HH-PRIV-01][HH-DATA-09] every period category is seeded active with the decided years, citing the open review', async () => {
    const config = await loadConfig(t.db)
    for (const category of PERIOD_CATEGORIES) {
      const def = CATEGORY_DEFINITIONS[category]
      const entry = config.get(def.configKey as NonNullable<typeof def.configKey>)
      expect(entry.state, category).toBe('CONFIGURED')
      if (entry.state !== 'CONFIGURED') continue
      // TSK-0138: expired sessions and links count calendar days (OWN-DEC-177).
      if (def.decidedDays !== undefined) expect((entry.value as { days: number }).days, category).toBe(def.decidedDays)
      else expect((entry.value as { years: number }).years, category).toBe(def.decidedYears)
      expect(entry.value, category).toMatchObject({ automaticDeletion: false, holdsKeepRecords: true })
      expect(entry.sourceIds, category).toContain('OQ-RETENTION-REVIEW')
      expect(entry.proposed, category).toBe(false)
    }
  })

  it('[HH-PRIV-01] the shape refuses automatic deletion, records without their holds and a shorter period', () => {
    const base = {
      years: 2,
      after: 'request_closed',
      afterPeriod: 'owner_deletion_review',
      automaticDeletion: false,
      holdsKeepRecords: true,
    }
    expect(parseValue('retention.requests_not_converted', base)).toEqual(base)
    expect(parseValue('retention.requests_not_converted', { ...base, years: 3 })).toMatchObject({ years: 3 })
    for (const bad of [
      { ...base, years: 1 },
      { ...base, automaticDeletion: true },
      { ...base, holdsKeepRecords: false },
      { ...base, afterPeriod: 'delete' },
      { ...base, after: 'request_submitted' },
    ])
      expect(() => parseValue('retention.requests_not_converted', bad)).toThrow(ConfigShapeError)
  })
})

describe('the retention job opens review entries, never deletions (TSK-0099, HH-PRIV-01, HH-DATA-09)', () => {
  it('[HH-PRIV-01][HH-DATA-09] an expired request produces a review entry, not a deletion', async () => {
    const r = await closedRequest()
    const before = await footprint(r)
    expect(before).toMatchObject({ request: 1, project: 1 })

    // One year on: not due yet.
    await scan(later(1))
    expect(await entriesFor(r.id)).toEqual([])

    // Just over two years on: one entry in the Owner's queue; every row is still there, unchanged.
    const result = await scan(later(2, 2))
    expect(result.opened.requests_not_converted).toBeGreaterThanOrEqual(1)
    const [entry, ...others] = await entriesFor(r.id)
    expect(others).toEqual([])
    expect(entry).toMatchObject({
      category: 'requests_not_converted',
      record_type: 'request',
      record_ref: r.reference,
      project_id: r.projectId,
      policy_key: 'retention.requests_not_converted',
      policy_version: 1,
      period_years: 2,
      holds_found: false,
      opened_by: 'system.retention',
    })
    const decision = await t.db
      .selectFrom('intake.request_decisions')
      .select('decided_at')
      .where('request_id', '=', r.id)
      .orderBy('decided_at', 'desc')
      .executeTakeFirstOrThrow()
    expect(new Date(entry?.retention_started_at as Date).toISOString()).toBe(
      new Date(decision.decided_at).toISOString(),
    )
    const ends = new Date(decision.decided_at)
    ends.setUTCFullYear(ends.getUTCFullYear() + 2)
    expect(new Date(entry?.period_ends_at as Date).toISOString()).toBe(ends.toISOString())
    expect(entry?.hold_checks).toEqual([
      { check: 'open_holds', result: 'none_found' },
      ...[
        'complaints',
        'warranties',
        'disputes',
        'claims',
        'investigations',
        'unfiled_tax_returns',
        'legal_holds',
        'insurance_holds',
      ].map((check) => ({ check, result: 'not_recorded' })),
    ])
    const after = await footprint(r)
    expect({ ...after, audit: before.audit }).toEqual(before)
    const state = await t.db
      .selectFrom('intake.requests')
      .select(['state', 'description'])
      .where('id', '=', r.id)
      .executeTakeFirstOrThrow()
    expect(state).toEqual({ state: 'not_served', description: 'Synthetic retention project.' })

    // The scan is recorded in the audit log, with counts only (T74: material events traceable).
    const events = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'actor_kind', 'actor_process', 'summary'])
      .where('action', '=', 'retention.review_open')
      .execute()
    expect(events.length).toBeGreaterThanOrEqual(1)
    expect(events[0]).toMatchObject({ actor_kind: 'system', actor_process: 'system.retention' })

    // A second scan opens nothing more for the same record.
    await scan(later(2, 3))
    expect(await entriesFor(r.id)).toHaveLength(1)
  })

  it('[HH-PRIV-01][HH-DATA-09] an open hold on the project is found and named on the entry', async () => {
    const r = await closedRequest()
    await t.db
      .insertInto('work.holds')
      .values({
        kind: 'review',
        scope_type: 'request',
        scope_id: r.id,
        project_id: r.projectId,
        request_id: r.id,
        category: 'other',
        note: 'Synthetic review hold',
        source: 'qualification',
        source_ref: 'qualification:1',
        raised_by: ids.office,
      })
      .execute()
    await scan(later(2, 2))
    const [entry] = await entriesFor(r.id)
    expect(entry).toMatchObject({ holds_found: true })
    expect((entry?.hold_checks as { check: string }[])[0]).toEqual({ check: 'open_holds', result: 'found', count: 1 })
    expect(await footprint(r)).toMatchObject({ request: 1, project: 1 })
  })

  it('[HH-PRIV-01][HH-DATA-09] an unaccepted estimate enters the queue two years after it was withdrawn', async () => {
    const e = await withdrawnEstimate()
    await scan(later(1, 300))
    expect(await entriesFor(e.estimateId)).toEqual([])
    await scan(later(2, 2))
    const [entry] = await entriesFor(e.estimateId)
    expect(entry).toMatchObject({
      category: 'unaccepted_estimates',
      record_type: 'estimate',
      record_ref: e.number,
      project_id: e.projectId,
      policy_key: 'retention.unaccepted_estimates',
      period_years: 2,
    })
    // The estimate and its versions are untouched (protected evidence is never rewritten).
    const versions = await t.db
      .selectFrom('estimating.estimate_versions')
      .select(['state'])
      .where('estimate_id', '=', e.estimateId)
      .execute()
    expect(versions).toEqual([{ state: 'withdrawn' }])
    // The request is not closed and its project is open: it is not a request that never became a job.
    expect(await entriesFor(e.id)).toEqual([])
  })

  it('[HH-PRIV-01][T74] audit entries enter the queue after 7 years and stay in the append-only log', async () => {
    const count = async () =>
      Number((await sql<{ n: string }>`SELECT count(*)::text AS n FROM platform.audit_events`.execute(t.db)).rows[0]?.n)
    await scan(later(6, 300))
    const auditEntries = () =>
      t.db
        .selectFrom('privacy.retention_reviews')
        .select(sql<string>`count(*)::text`.as('n'))
        .where('category', '=', 'audit_log')
        .executeTakeFirstOrThrow()
    expect(Number((await auditEntries()).n)).toBe(0)
    const before = await count()
    const result = await withTx(t.db, (tx) =>
      runRetentionScan(tx, { now: later(7, 2), requestId: 'req-synthetic-retention-audit', limit: 10_000 }),
    )
    expect(result.opened.audit_log).toBe(before)
    // Every entry is still in the log; the scan itself added one event.
    expect(await count()).toBe(before + 1)
    const sample = await t.db
      .selectFrom('privacy.retention_reviews as rv')
      .innerJoin('platform.audit_events as ae', 'ae.id', 'rv.record_id')
      .select(['rv.record_ref', 'ae.seq', 'ae.action', 'rv.policy_key', 'rv.period_years'])
      .where('rv.category', '=', 'audit_log')
      .limit(5)
      .execute()
    for (const s of sample) {
      expect(s.record_ref).toBe(`#${s.seq} ${s.action}`)
      expect(s).toMatchObject({ policy_key: 'retention.audit_log', period_years: 7 })
    }
  })

  it('[HH-PRIV-01] a category whose configuration is NOT CONFIGURED opens nothing; batches are bounded', async () => {
    const r = await closedRequest()
    const original = (await loadConfig(t.db)).get('retention.requests_not_converted')
    await recordPolicyVersion(t.db, {
      key: 'retention.requests_not_converted',
      value: null,
      sourceIds: ['TEST-SYNTHETIC'],
      changedBy: 'test',
      reason: 'synthetic: not configured',
    })
    try {
      const result = await scan(later(5))
      expect(result.skipped).toContainEqual({ category: 'requests_not_converted', reason: 'not_configured' })
      expect(await entriesFor(r.id)).toEqual([])
    } finally {
      await recordPolicyVersion(t.db, {
        key: 'retention.requests_not_converted',
        value: original.state === 'CONFIGURED' ? original.value : null,
        sourceIds: [...original.sourceIds],
        changedBy: 'test',
        reason: 'restore after a synthetic test',
      })
    }
    // A run is bounded per category and says when more is due.
    const second = await closedRequest()
    const bounded = await withTx(t.db, (tx) =>
      runRetentionScan(tx, { now: later(5), requestId: 'req-synthetic-retention-batch', limit: 1 }),
    )
    expect(bounded.opened.requests_not_converted).toBe(1)
    expect(bounded.more).toBe(true)
    await scan(later(5))
    expect(await entriesFor(r.id)).toHaveLength(1)
    expect(await entriesFor(second.id)).toHaveLength(1)
    // Categories whose start the software does not record are skipped, never guessed.
    for (const c of ['customer_profiles', 'accepted_agreements', 'financial_records', 'job_records', 'safety_records'])
      expect(bounded.skipped).toContainEqual({ category: c, reason: 'start_not_recorded' })
  })

  it('[HH-DATA-09] review entries are append-only: no update, delete or truncate', async () => {
    const one = await t.db.selectFrom('privacy.retention_reviews').select('id').executeTakeFirstOrThrow()
    await expect(
      sql`UPDATE privacy.retention_reviews SET holds_found = true WHERE id = ${one.id}`.execute(t.db),
    ).rejects.toThrow(/APPEND_ONLY|permission denied/)
    await expect(sql`DELETE FROM privacy.retention_reviews WHERE id = ${one.id}`.execute(t.db)).rejects.toThrow(
      /APPEND_ONLY|permission denied/,
    )
    // TSK-0100: the Owner's decisions and the deletion log reference the entries, so a truncate is refused before the
    // append-only trigger is even reached.
    await expect(sql`TRUNCATE privacy.retention_reviews`.execute(t.db)).rejects.toThrow(
      /APPEND_ONLY|permission denied|cannot truncate/,
    )
  })

  it('[HH-PRIV-01] the daily job runs the scan and schedules the next day; scheduling is idempotent', async () => {
    const automation = retentionReviewAutomation()
    const requestId = `req-${key('job')}`
    expect(await withTx(t.db, (tx) => ensureRetentionScan(tx, requestId))).toEqual({ created: true })
    expect(await withTx(t.db, (tx) => ensureRetentionScan(tx, requestId))).toEqual({ created: false })
    const tick = await createWorker({ db: t.db, registry: createAutomationRegistry([automation]) }).runOnce()
    expect(tick.succeeded).toBe(1)
    const jobs = await t.db
      .selectFrom('platform.jobs')
      .select(['job_key', 'state', 'run_at'])
      .where('automation', '=', RETENTION_AUTOMATION)
      .orderBy('seq')
      .execute()
    const today = new Date().toISOString().slice(0, 10)
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10)
    expect(jobs.map((j) => [j.job_key, j.state])).toEqual([
      [`${RETENTION_AUTOMATION}:day:${today}:1`, 'succeeded'],
      [`${RETENTION_AUTOMATION}:day:${tomorrow}:1`, 'queued'],
    ])
    expect(new Date(jobs[1]?.run_at as Date).toISOString()).toBe(`${tomorrow}T00:00:00.000Z`)
    const audited = await t.db
      .selectFrom('platform.audit_events')
      .select('actor_process')
      .where('action', '=', 'retention.review_scan')
      .execute()
    expect(audited).toEqual([{ actor_process: 'system.retention' }])
  })
})

type Overview = {
  automaticDeletion: boolean
  awaitingConfirmation: boolean
  categories: {
    id: string
    configKey: string | null
    scan: string
    state: string | null
    years: number | null
    entries: number
  }[]
  lastScanAt: string | null
  nextScanAt: string | null
  entries: number
}
type Entry = {
  id: string
  category: string
  record: { type: string; id: string; reference: string }
  holdChecks: { check: string; result: string }[]
  holdsFound: boolean
}

describe('the deletion-review queue screen data (TSK-0099, HH-PRIV-01, ROLE-MATRIX retention.view)', () => {
  it('[HH-PRIV-01][HH-DATA-09] the Owner sees the schedule, the job state and the entries', async () => {
    const res = await get('owner', '/staff/retention')
    expect(res.statusCode, res.body).toBe(200)
    const o = res.json<Overview>()
    expect(o).toMatchObject({ automaticDeletion: false, awaitingConfirmation: true })
    expect(o.categories.map((c) => c.id)).toEqual([
      ...PERIOD_CATEGORIES,
      'settings_history',
      'technical_logs',
      'access_codes',
      'regulated_employee_records',
      'not_scheduled',
    ])
    expect(o.categories.find((c) => c.id === 'requests_not_converted')).toMatchObject({
      scan: 'scanned',
      state: 'CONFIGURED',
      years: 2,
    })
    expect(o.categories.find((c) => c.id === 'job_records')).toMatchObject({ scan: 'start_not_recorded', entries: 0 })
    expect(o.categories.find((c) => c.id === 'not_scheduled')).toMatchObject({ state: null, years: null })
    expect(o.lastScanAt).not.toBeNull()
    expect(o.nextScanAt).not.toBeNull()
    expect(o.entries).toBeGreaterThan(3)

    // Paging through one category; every entry names its record by reference only.
    const seen: Entry[] = []
    let cursor: string | null = null
    do {
      const page = await get(
        'owner',
        `/staff/retention-reviews?category=requests_not_converted&limit=2${cursor ? `&cursor=${cursor}` : ''}`,
      )
      expect(page.statusCode, page.body).toBe(200)
      const body = page.json<{ items: Entry[]; nextCursor: string | null }>()
      seen.push(...body.items)
      cursor = body.nextCursor
    } while (cursor)
    expect(seen.length).toBe(o.categories.find((c) => c.id === 'requests_not_converted')?.entries)
    expect(new Set(seen.map((e) => e.id)).size).toBe(seen.length)
    for (const e of seen) {
      expect(e.category).toBe('requests_not_converted')
      expect(e.record.type).toBe('request')
    }
    expect(seen.some((e) => e.holdsFound)).toBe(true)
    // T74: no personal content (names, emails, phone numbers, descriptions) in the queue.
    const all = await get('owner', '/staff/retention-reviews?limit=100')
    expect(all.body).not.toMatch(
      /Synthetic Retention Customer|retention-customer-|555-0101|Synthetic retention project/,
    )
  })

  it('[RULE-SERVER-AUTHZ] Office, Estimator and Worker are refused; no session is 401; bad input is 400', async () => {
    for (const p of ['office', 'estimator', 'worker'] as const) {
      expect((await get(p, '/staff/retention')).statusCode, p).toBe(403)
      expect((await get(p, '/staff/retention-reviews')).statusCode, p).toBe(403)
    }
    expect((await get(null, '/staff/retention')).statusCode).toBe(401)
    expect((await get('owner', '/staff/retention-reviews?category=everything')).statusCode).toBe(400)
    const crafted = Buffer.from(JSON.stringify(['1; DROP TABLE x'])).toString('base64url')
    expect((await get('owner', `/staff/retention-reviews?cursor=${crafted}`)).statusCode).toBe(400)
    // There is no route that decides, deletes or edits an entry.
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/staff/retention-reviews/${randomUUID()}`,
      headers: { cookie: cookies.owner, 'x-csrf-token': csrf.owner },
    })
    expect(del.statusCode).toBe(404)
  })
})
