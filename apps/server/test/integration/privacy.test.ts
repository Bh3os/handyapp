// Privacy requests, the Owner's Delete or Archive decisions and the deletion log against PostgreSQL 16 (TSK-0100;
// HH-PRIV-03, HH-PRIV-05, HH-DATA-09, T22, T72, ENT-PrivacyRequest, ENT-RetentionReview, OWN-DEC-70, OWN-DEC-71,
// OWN-DEC-113, ROLE-MATRIX, RULE-SERVER-AUTHZ). Staff, customers, requests, amounts and names are synthetic
// (RULE-SYNTHETIC-DATA); nothing reaches a provider. Time passing is a later scan clock: records are created now and
// never backdated. Estimate terms are recorded as a synthetic in-effect fixture in this throwaway database only, so
// estimates can be published and approved; that is never a statement that the owner approved any wording.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { estimateReminderAutomations } from '../../src/modules/estimates/index.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import {
  exportDeletions,
  objectErasureAutomation,
  OBJECT_ERASURE_AUTOMATION,
  reapplyDeletions,
  UNRECORDED_DELETION_CHECKS,
} from '../../src/modules/privacy/index.js'
import { forbiddenForCustomer } from '../../src/modules/records/index.js'
import { runRetentionScan } from '../../src/modules/retention/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { testConfig } from '../fixtures/env.js'
import { reviewOutcome, standInQualityReview } from '../fixtures/quality-review.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'privacy', 'code', 'key', 'for', 'tests', 'only', '0100'].join('-'),
})
const pw = (n: number) => ['synthetic', 'privacy', 'request', 'passphrase', String(n)].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof PEOPLE)[number]
const email = (p: Person) => `${p}-privacy@example.test`

let t: TestDatabase
let app: FastifyInstance
const storage = new FakeObjectStorage()
const ids = {} as Record<Person, string>
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>

const YEAR_MS = 365.25 * 24 * 3600 * 1000
const later = (years: number, days = 0) => new Date(Date.now() + years * YEAR_MS + days * 24 * 3600 * 1000)

let seq = 0
const key = (what: string) => `synthetic-privacy-${what}-${String(++seq).padStart(6, '0')}-${randomUUID().slice(0, 8)}`
const get = (who: Person | null, url: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: who ? { cookie: cookies[who] } : {} })
function write(who: Person, url: string, payload: unknown, version?: number, method: 'POST' | 'PUT' = 'POST') {
  return app.inject({
    method,
    url: `/api/v1${url}`,
    payload: payload as object,
    headers: {
      cookie: cookies[who],
      'x-csrf-token': csrf[who],
      'idempotency-key': key('write'),
      'x-forwarded-for': '198.51.100.198',
      ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    },
  })
}

const TERMS_FIXTURE = {
  documentId: ESTIMATE_TERMS.documentId,
  status: 'approved',
  attorneyReviewed: true,
  preparedOn: ESTIMATE_TERMS.preparedOn,
  contentSha256: ESTIMATE_TERMS.contentSha256,
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, storage, codeKey: KEY } })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: email(p),
        displayName: `Synthetic privacy ${p}`,
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
      headers: { 'x-forwarded-for': '198.51.100.198' },
      payload: { email: email(p), password: pw(1) },
    })
    expect(res.statusCode, res.body).toBe(200)
    cookies[p] = String(res.headers['set-cookie']).split(';')[0] as string
    csrf[p] = res.json().csrfToken as string
  }
  await recordPolicyVersion(t.db, {
    key: 'legal.estimate_terms',
    value: TERMS_FIXTURE as never,
    sourceIds: ['TEST-SYNTHETIC'],
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

type Project = {
  requestId: string
  projectId: string
  reference: string
  contactId: string
  customerId: string
  grantId: string
  version: number
}
let ip = 10
/** A synthetic request through the public API. */
async function newRequest(estimatePreference: 'online' | 'site_visit' = 'online'): Promise<Project> {
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
      description: `Synthetic privacy project ${n}.`,
      answers: [],
      property: {
        street: `${n} Synthetic Privacy Way`,
        city: 'Testville',
        state: 'ky',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference,
      contact: {
        fullName: `Synthetic Privacy Customer ${n}`,
        email: `privacy-customer-${n}-${randomUUID().slice(0, 6)}@example.test`,
        phone: '(502) 555-0198',
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
    .select(['r.id', 'r.project_id', 'r.state_version', 'r.contact_id', 'r.customer_id', 'g.id as grant_id'])
    .where('r.reference', '=', reference)
    .executeTakeFirstOrThrow()
  return {
    requestId: row.id,
    projectId: row.project_id,
    reference,
    contactId: row.contact_id,
    customerId: row.customer_id,
    grantId: row.grant_id,
    version: row.state_version,
  }
}

/** The request moved on to an online estimate. */
async function readyRequest(): Promise<Project> {
  const r = await newRequest('online')
  expect(
    (await write('owner', `/staff/requests/${r.requestId}/qualification`, { checks: ALL_OK }, 0, 'PUT')).statusCode,
  ).toBe(200)
  const moved = await write(
    'owner',
    `/staff/requests/${r.requestId}/actions/online-estimate`,
    { workPackages: ['SVC-DW-01'] },
    r.version,
  )
  expect(moved.statusCode, moved.body).toBe(200)
  return r
}

type Estimate = Project & { estimateId: string; number: string; versionId: string }

/** Saves synthetic lines on a draft version and publishes it; the published row version. */
async function publish(versionId: string): Promise<number> {
  const view = await get('estimator', `/staff/estimate-versions/${versionId}`)
  const v = view.json<{ rowVersion: number; workPackages: { id: string }[] }>()
  const saved = await write(
    'estimator',
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
    'PUT',
  )
  expect(saved.statusCode, saved.body).toBe(200)
  const published = await write(
    'estimator',
    `/staff/estimate-versions/${versionId}/publish`,
    {},
    saved.json<{ rowVersion: number }>().rowVersion,
  )
  expect(published.statusCode, published.body).toBe(200)
  return published.json<{ rowVersion: number }>().rowVersion
}

/** An estimate published and then withdrawn: never accepted. */
async function withdrawnEstimate(project?: Project): Promise<Estimate> {
  const r = project ?? (await readyRequest())
  const created = await write('estimator', `/staff/projects/${r.projectId}/estimates`, {})
  expect(created.statusCode, created.body).toBe(201)
  const { estimateId, number, versionId } = created.json<{ estimateId: string; number: string; versionId: string }>()
  const rowVersion = await publish(versionId)
  const withdrawn = await write(
    'estimator',
    `/staff/estimate-versions/${versionId}/withdraw`,
    { reason: 'Synthetic: sent to the wrong project.' },
    rowVersion,
  )
  expect(withdrawn.statusCode, withdrawn.body).toBe(200)
  return { ...r, estimateId, number, versionId }
}

const scan = (now: Date) => withTx(t.db, (tx) => runRetentionScan(tx, { now, requestId: `req-${key('scan')}` }))
async function entryFor(recordId: string) {
  const row = await t.db
    .selectFrom('privacy.retention_reviews')
    .select(['id', 'record_ref'])
    .where('record_id', '=', recordId)
    .executeTakeFirst()
  if (!row) throw new Error(`no review entry for ${recordId}`)
  return row
}

async function customerCookie(p: Pick<Project, 'contactId' | 'projectId' | 'grantId'>, verifiedAt = new Date()) {
  const s = await withTx(t.db, (tx) =>
    startCustomerSession(tx, {
      contactRef: p.contactId,
      via: 'grant',
      projectIds: [p.projectId],
      verifiedAt,
      grantId: p.grantId,
    }),
  )
  return `__Host-hh_customer=${s.token}`
}
let client = 0
function customerPost(url: string, cookie: string, payload: unknown) {
  return app.inject({
    method: 'POST',
    url: `/api/v1${url}`,
    payload: payload as object,
    headers: {
      cookie,
      'idempotency-key': key('customer'),
      'x-forwarded-for': `2001:db8:100:${++client}::1`,
      'user-agent': 'SyntheticBrowser/1.0 (test)',
    },
  })
}
const customerGet = (url: string, cookie: string) =>
  app.inject({ method: 'GET', url: `/api/v1${url}`, headers: { cookie } })

/** The customer approves the current version of an estimate (the approval transaction, TSK-0057). */
async function approve(e: Estimate, version: number, cookie: string) {
  const base = `/customer/projects/${e.reference}/estimates/${e.number}/versions/${version}`
  const d = (await customerGet(base, cookie)).json<{
    totalCents: number
    approval: {
      contentDigest: string
      selection: { options: number[]; totalCents: number; deposit: { amountCents: number | null } } | null
    }
  }>()
  const res = await customerPost(`${base}/approve`, cookie, {
    contentDigest: d.approval.contentDigest,
    options: d.approval.selection?.options ?? [],
    totalCents: d.approval.selection?.totalCents ?? d.totalCents,
    depositCents: d.approval.selection?.deposit.amountCents ?? null,
    termsDocumentId: ESTIMATE_TERMS.documentId,
    termsSha256: ESTIMATE_TERMS.contentSha256,
    acceptTerms: true,
    fullName: 'Synthetic Privacy Customer',
  })
  expect(res.statusCode, res.body).toBe(201)
}

const count = async (table: string, column: string, id: string) =>
  Number(
    (
      await sql<{
        n: string
      }>`SELECT count(*)::text AS n FROM ${sql.table(table)} WHERE ${sql.ref(column)} = ${id}`.execute(t.db)
    ).rows[0]?.n,
  )

const ALL_CHECKS = [...UNRECORDED_DELETION_CHECKS]

/** Runs the object erasure job of a deletion (what the worker does after the commit). */
async function runObjectErasure(deletionId: string) {
  const job = await t.db
    .selectFrom('platform.jobs')
    .select(['payload', 'state'])
    .where('automation', '=', OBJECT_ERASURE_AUTOMATION)
    .where('target_id', '=', deletionId)
    .executeTakeFirstOrThrow()
  expect(job.state).toBe('queued')
  await objectErasureAutomation(storage).handle({ job: { payload: job.payload } } as never)
}

async function staleOwnerSignIn<T>(fn: () => Promise<T>): Promise<T> {
  await sql`UPDATE identity.staff_sessions SET authenticated_at = now() - interval '10 minutes'
             WHERE staff_user_id = ${ids.owner} AND revoked_at IS NULL`.execute(t.db)
  try {
    return await fn()
  } finally {
    await sql`UPDATE identity.staff_sessions SET authenticated_at = now()
               WHERE staff_user_id = ${ids.owner} AND revoked_at IS NULL`.execute(t.db)
  }
}

describe('the Owner Delete action on a review entry (TSK-0100, HH-PRIV-05, HH-DATA-09)', () => {
  it('[HH-PRIV-05][T72] the confirmation names the record, what goes and stays; Confirm Delete logs references only', async () => {
    const e = await withdrawnEstimate()
    const pdfKey = (
      await t.db
        .selectFrom('estimating.estimate_versions')
        .select('customer_pdf_object_key')
        .where('id', '=', e.versionId)
        .executeTakeFirstOrThrow()
    ).customer_pdf_object_key as string
    expect(storage.objects.has(pdfKey)).toBe(true)
    await scan(later(2, 2))
    const entry = await entryFor(e.estimateId)

    const preview = await get('owner', `/staff/retention-reviews/${entry.id}/deletion`)
    expect(preview.statusCode, preview.body).toBe(200)
    const p = preview.json<{
      status: { state: string }
      early: boolean
      target: {
        record: { type: string; reference: string }
        permanent: boolean
        removes: { kind: string; count: number }[]
        keeps: { kind: string; count: number }[]
        checks: { check: string; result: string }[]
        blockers: string[]
        confirm: string[]
      }
    }>()
    expect(p.status.state).toBe('pending')
    // The test's scan clock runs two years ahead of the database clock, so the period has not ended "now" yet.
    expect(p.early).toBe(true)
    expect(p.target.record).toMatchObject({ type: 'estimate', reference: e.number })
    expect(p.target.permanent).toBe(true)
    expect(p.target.blockers).toEqual([])
    expect(p.target.removes).toContainEqual({ kind: 'estimate_versions', count: 1 })
    expect(p.target.removes).toContainEqual({ kind: 'estimate_lines', count: 1 })
    expect(p.target.removes).toContainEqual({ kind: 'stored_files', count: 1 })
    expect(p.target.keeps).toContainEqual({ kind: 'project_and_request', count: 1 })
    expect(p.target.checks).toContainEqual({ check: 'open_holds', result: 'none_found' })
    expect(p.target.checks).toContainEqual({ check: 'signed_approvals', result: 'none_found' })
    // Not recorded by the software: never "none found", always for the Owner to confirm.
    expect(p.target.checks).toContainEqual({ check: 'disputes', result: 'not_recorded' })
    expect(p.target.checks).toContainEqual({ check: 'issued_invoices', result: 'not_recorded' })
    expect(p.target.confirm.sort()).toEqual([...ALL_CHECKS].sort())

    // A fresh sign-in is required; nothing is deleted without it.
    const stale = await staleOwnerSignIn(() =>
      write('owner', `/staff/retention-reviews/${entry.id}/delete`, {
        reason: 'Synthetic: past its period.',
        confirmedChecks: ALL_CHECKS,
      }),
    )
    expect(stale.statusCode).toBe(403)
    expect(stale.json()).toMatchObject({ error: { code: 'FRESH_AUTH_REQUIRED' } })
    // Every not-recorded check must be confirmed.
    const unconfirmed = await write('owner', `/staff/retention-reviews/${entry.id}/delete`, {
      reason: 'Synthetic: past its period.',
      confirmedChecks: ALL_CHECKS.filter((c) => c !== 'disputes'),
    })
    expect(unconfirmed.statusCode).toBe(400)
    expect(unconfirmed.json()).toMatchObject({
      error: { fieldErrors: [{ field: 'body.confirmedChecks.disputes', code: 'CHECK_NOT_CONFIRMED' }] },
    })
    // A reason is required.
    const noReason = await write('owner', `/staff/retention-reviews/${entry.id}/delete`, {
      confirmedChecks: ALL_CHECKS,
    })
    expect(noReason.statusCode).toBe(400)
    expect(await count('estimating.estimates', 'id', e.estimateId)).toBe(1)

    const res = await write('owner', `/staff/retention-reviews/${entry.id}/delete`, {
      reason: 'Synthetic: past its period.',
      confirmedChecks: ALL_CHECKS,
    })
    expect(res.statusCode, res.body).toBe(200)
    const { deletionId } = res.json<{ deletionId: string; status: { state: string } }>()
    expect(res.json()).toMatchObject({ status: { state: 'deleted' }, blockers: [] })

    // The estimate and everything that belonged to it are gone; the project, request and entry stay.
    expect(await count('estimating.estimates', 'id', e.estimateId)).toBe(0)
    expect(await count('estimating.estimate_versions', 'estimate_id', e.estimateId)).toBe(0)
    expect(await count('estimating.estimate_lines', 'version_id', e.versionId)).toBe(0)
    expect(await count('crm.projects', 'id', e.projectId)).toBe(1)
    expect(await count('intake.requests', 'id', e.requestId)).toBe(1)
    expect(await count('privacy.retention_reviews', 'id', entry.id)).toBe(1)

    // The log keeps actor, time, reference, reason and counts; never the deleted content.
    const log = await t.db
      .selectFrom('privacy.deletions')
      .selectAll()
      .where('id', '=', deletionId)
      .executeTakeFirstOrThrow()
    expect(log).toMatchObject({
      record_type: 'estimate',
      record_id: e.estimateId,
      record_ref: e.number,
      source: 'retention_review',
      review_id: entry.id,
      reason: 'Synthetic: past its period.',
      early: true,
      permanent: true,
      decided_by: ids.owner,
    })
    expect(log.removed).toMatchObject({ estimate_versions: 1, estimate_lines: 1, stored_files: 1 })
    expect([...log.checks_confirmed].sort()).toEqual([...ALL_CHECKS].sort())
    expect(JSON.stringify(log)).not.toContain('Patch the synthetic hole')
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .selectAll()
      .where('action', '=', 'privacy.record_delete')
      .where('target_id', '=', e.estimateId)
      .where('result', '=', 'succeeded')
      .executeTakeFirstOrThrow()
    expect(audit).toMatchObject({ reason: 'Synthetic: past its period.', step_up_used: true })
    expect(JSON.stringify(audit.summary)).not.toContain('Patch the synthetic hole')

    // The stored file goes after the commit, by the job.
    expect(storage.objects.has(pdfKey)).toBe(true)
    await runObjectErasure(deletionId)
    expect(storage.objects.has(pdfKey)).toBe(false)

    // Nothing follows a deletion; the log lists it.
    const again = await write('owner', `/staff/retention-reviews/${entry.id}/delete`, {
      reason: 'Synthetic: again.',
      confirmedChecks: ALL_CHECKS,
    })
    expect(again.statusCode).toBe(409)
    expect(again.json()).toMatchObject({ error: { fieldErrors: [{ code: 'ALREADY_DELETED' }] } })
    const archive = await write('owner', `/staff/retention-reviews/${entry.id}/archive`, { reason: 'Synthetic.' })
    expect(archive.statusCode).toBe(409)
    const list = await get('owner', '/staff/deletions')
    expect(list.statusCode).toBe(200)
    expect(list.json<{ items: { id: string; record: { reference: string } }[] }>().items[0]).toMatchObject({
      id: deletionId,
      record: { reference: e.number },
      decidedBy: { id: ids.owner, name: 'Synthetic privacy owner' },
    })
    const entries = await get('owner', '/staff/retention-reviews?status=deleted')
    expect(entries.json<{ items: { id: string }[] }>().items.map((i) => i.id)).toContain(entry.id)
  })

  it('[HH-PRIV-05][HH-DATA-09] delete blocked by protected financial evidence (a signed approval; issued invoices are not recorded yet) archives instead', async () => {
    const e = await withdrawnEstimate()
    await scan(later(2, 2))
    const entry = await entryFor(e.estimateId)
    // Later the estimate was revised, published again and approved by the customer: protected evidence now exists.
    const revised = await write('estimator', `/staff/estimate-versions/${e.versionId}/revise`, {})
    expect(revised.statusCode, revised.body).toBeLessThan(300)
    const v2 = revised.json<{ versionId: string }>()
    await publish(v2.versionId)
    await approve(e, 2, await customerCookie(e))

    const preview = (await get('owner', `/staff/retention-reviews/${entry.id}/deletion`)).json<{
      target: { blockers: string[]; checks: { check: string; result: string; count?: number }[] }
    }>()
    expect(preview.target.blockers).toContain('protected_evidence')
    expect(preview.target.checks).toContainEqual({ check: 'signed_approvals', result: 'found', count: 1 })
    expect(preview.target.checks).toContainEqual({ check: 'jobs', result: 'found', count: 1 })
    // The job's deposit requirement (TSK-0064) is protected evidence too.
    expect(preview.target.checks).toContainEqual({ check: 'deposit_records', result: 'found', count: 1 })
    expect(preview.target.checks).toContainEqual({ check: 'issued_invoices', result: 'not_recorded' })
    // No payment is recorded yet: the Owner still checks for one taken outside the software (never "none found").
    expect(preview.target.checks).toContainEqual({ check: 'payments', result: 'not_recorded' })
    // A payment recorded on the job is found.
    const job = await t.db
      .selectFrom('work.jobs as j')
      .innerJoin('estimating.approvals as a', 'a.id', 'j.approval_id')
      .select(['j.id', 'j.project_id'])
      .where('a.estimate_id', '=', e.estimateId)
      .executeTakeFirstOrThrow()
    await t.db
      .insertInto('finance.payments')
      .values({
        project_id: job.project_id,
        job_id: job.id,
        method: 'cash',
        amount_cents: 5_000,
        received_on: new Date().toISOString().slice(0, 10),
        collector_staff_id: ids.office,
        recorded_by: ids.office,
        state: 'recorded',
      })
      .execute()
    const withPayment = (await get('owner', `/staff/retention-reviews/${entry.id}/deletion`)).json<{
      target: { blockers: string[]; checks: { check: string; result: string; count?: number }[]; confirm: string[] }
    }>()
    expect(withPayment.target.checks).toContainEqual({ check: 'payments', result: 'found', count: 1 })
    expect(withPayment.target.blockers).toContain('protected_evidence')
    expect(withPayment.target.confirm).not.toContain('payments')

    const res = await write('owner', `/staff/retention-reviews/${entry.id}/delete`, {
      reason: 'Synthetic: confirm anyway.',
      confirmedChecks: ALL_CHECKS,
    })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors.map((f) => f.code)).toContain(
      'PROTECTED_EVIDENCE',
    )
    // Nothing deleted; the refusal is audited as denied.
    expect(await count('estimating.estimates', 'id', e.estimateId)).toBe(1)
    expect(await count('estimating.approvals', 'estimate_id', e.estimateId)).toBe(1)
    expect(await count('privacy.deletions', 'record_id', e.estimateId)).toBe(0)
    const denied = await t.db
      .selectFrom('platform.audit_events')
      .select(['result', 'summary'])
      .where('action', '=', 'privacy.record_delete')
      .where('target_id', '=', e.estimateId)
      .executeTakeFirstOrThrow()
    expect(denied.result).toBe('denied')
    expect(denied.summary).toMatchObject({ blockers: expect.arrayContaining(['protected_evidence']) })

    // Archive instead: the record is kept exactly as it is.
    const archived = await write('owner', `/staff/retention-reviews/${entry.id}/archive`, {
      reason: 'Synthetic: kept as approval evidence.',
    })
    expect(archived.statusCode, archived.body).toBe(200)
    expect(archived.json()).toMatchObject({ status: { state: 'archived' }, blockers: ['protected_evidence'] })
    expect(await count('estimating.estimate_versions', 'estimate_id', e.estimateId)).toBe(2)
    const decision = await t.db
      .selectFrom('privacy.retention_decisions')
      .selectAll()
      .where('review_id', '=', entry.id)
      .executeTakeFirstOrThrow()
    expect(decision).toMatchObject({ decision: 'archive', blockers: ['protected_evidence'], decided_by: ids.owner })
  })

  it('[HH-PRIV-05][HH-DATA-09][HH-FIN-04] delete blocked by an issued invoice archives instead', async () => {
    const e = await withdrawnEstimate()
    await scan(later(2, 2))
    const entry = await entryFor(e.estimateId)
    const revised = await write('estimator', `/staff/estimate-versions/${e.versionId}/revise`, {})
    expect(revised.statusCode, revised.body).toBeLessThan(300)
    await publish(revised.json<{ versionId: string }>().versionId)
    await approve(e, 2, await customerCookie(e))
    const job = await t.db
      .selectFrom('work.jobs as j')
      .innerJoin('estimating.approvals as a', 'a.id', 'j.approval_id')
      .select(['j.id'])
      .where('a.estimate_id', '=', e.estimateId)
      .executeTakeFirstOrThrow()
    // A draft is working data: before issue the check is still the Owner's (never "none found").
    const prepared = await write('office', `/staff/jobs/${job.id}/invoices/final-draft`, {})
    expect(prepared.statusCode, prepared.body).toBe(200)
    const draft = prepared.json<{ final: { id: string; version: number } }>().final
    const before = (await get('owner', `/staff/retention-reviews/${entry.id}/deletion`)).json<{
      target: { checks: { check: string; result: string; count?: number }[] }
    }>()
    expect(before.target.checks).toContainEqual({ check: 'issued_invoices', result: 'not_recorded' })
    // Issued after the review passes (the stand-in of fixtures/quality-review.ts, this throwaway database only).
    await standInQualityReview(t.db)
    await reviewOutcome(t.db, job.id, 'passed')
    const issued = await write('office', `/staff/invoices/${draft.id}/issue`, {}, draft.version)
    expect(issued.statusCode, issued.body).toBe(200)

    const preview = (await get('owner', `/staff/retention-reviews/${entry.id}/deletion`)).json<{
      target: { blockers: string[]; checks: { check: string; result: string; count?: number }[]; confirm: string[] }
    }>()
    expect(preview.target.checks).toContainEqual({ check: 'issued_invoices', result: 'found', count: 1 })
    expect(preview.target.blockers).toContain('protected_evidence')
    expect(preview.target.confirm).not.toContain('issued_invoices')
    const res = await write('owner', `/staff/retention-reviews/${entry.id}/delete`, {
      reason: 'Synthetic: confirm anyway.',
      confirmedChecks: ALL_CHECKS,
    })
    expect(res.statusCode).toBe(409)
    expect(res.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors.map((f) => f.code)).toContain(
      'PROTECTED_EVIDENCE',
    )
    expect(await count('finance.invoices', 'id', draft.id)).toBe(1)
    expect(await count('estimating.estimates', 'id', e.estimateId)).toBe(1)
    const archived = await write('owner', `/staff/retention-reviews/${entry.id}/archive`, {
      reason: 'Synthetic: kept as invoice evidence.',
    })
    expect(archived.statusCode, archived.body).toBe(200)
    expect(archived.json()).toMatchObject({ status: { state: 'archived' }, blockers: ['protected_evidence'] })
    expect(await count('finance.invoices', 'id', draft.id)).toBe(1)
  })

  it('[HH-PRIV-05] an open hold blocks deletion; requests and audit entries are not erased; Keep longer comes back', async () => {
    const e = await withdrawnEstimate()
    await t.db
      .insertInto('work.holds')
      .values({
        kind: 'review',
        scope_type: 'request',
        scope_id: e.requestId,
        project_id: e.projectId,
        request_id: e.requestId,
        category: 'other',
        note: 'Synthetic review hold',
        source: 'qualification',
        source_ref: 'qualification:1',
        raised_by: ids.office,
      })
      .execute()
    const closed = await newRequest('site_visit')
    const notFit = await write(
      'office',
      `/staff/requests/${closed.requestId}/actions/not-a-fit`,
      { category: 'coverage', customerReason: 'the property is outside the area we serve.' },
      closed.version,
    )
    expect(notFit.statusCode, notFit.body).toBe(200)
    await scan(later(2, 2))

    const held = await entryFor(e.estimateId)
    const blocked = await write('owner', `/staff/retention-reviews/${held.id}/delete`, {
      reason: 'Synthetic.',
      confirmedChecks: ALL_CHECKS,
    })
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors.map((f) => f.code)).toEqual(
      ['HOLD_FOUND'],
    )
    expect(await count('estimating.estimates', 'id', e.estimateId)).toBe(1)

    const request = await entryFor(closed.requestId)
    const preview = (await get('owner', `/staff/retention-reviews/${request.id}/deletion`)).json<{
      target: { blockers: string[]; permanent: boolean }
    }>()
    expect(preview.target.blockers).toEqual(['erasure_not_available'])
    const refused = await write('owner', `/staff/retention-reviews/${request.id}/delete`, {
      reason: 'Synthetic.',
      confirmedChecks: ALL_CHECKS,
    })
    expect(refused.statusCode).toBe(409)
    expect(await count('intake.requests', 'id', closed.requestId)).toBe(1)

    // Keep longer: refused in the past, accepted ahead; a time that passed brings the entry back.
    const past = await write('owner', `/staff/retention-reviews/${request.id}/keep`, {
      reason: 'Synthetic.',
      keepUntil: new Date(Date.now() - 60_000).toISOString(),
    })
    expect(past.statusCode).toBe(400)
    const until = new Date(Date.now() + YEAR_MS)
    const kept = await write('owner', `/staff/retention-reviews/${request.id}/keep`, {
      reason: 'Synthetic: the customer may come back.',
      keepUntil: until.toISOString(),
    })
    expect(kept.statusCode, kept.body).toBe(200)
    expect(kept.json()).toMatchObject({ status: { state: 'kept' } })
    const listed = (await get('owner', '/staff/retention-reviews?status=kept')).json<{
      items: { id: string; status: { state: string; until: string } }[]
    }>()
    expect(listed.items.find((i) => i.id === request.id)?.status).toMatchObject({
      state: 'kept',
      until: until.toISOString(),
    })
    await t.db
      .insertInto('privacy.retention_decisions')
      .values({
        review_id: request.id,
        decision: 'extend',
        reason: 'Synthetic: an extension that already ended.',
        keep_until: new Date(Date.now() - 1000),
        decided_by: ids.owner,
        request_id: 'synthetic-test',
      })
      .execute()
    const pending = (await get('owner', `/staff/retention-reviews/${request.id}/deletion`)).json<{
      status: { state: string }
    }>()
    expect(pending.status.state).toBe('pending')
  })

  it('[HH-PRIV-05] audit entries are append-only for every role: Delete is refused, Archive is offered', async () => {
    await scan(later(7, 2))
    const entry = await t.db
      .selectFrom('privacy.retention_reviews')
      .select('id')
      .where('record_type', '=', 'audit_event')
      .executeTakeFirstOrThrow()
    const preview = (await get('owner', `/staff/retention-reviews/${entry.id}/deletion`)).json<{
      target: { blockers: string[] }
    }>()
    expect(preview.target.blockers).toContain('audit_append_only')
    const res = await write('owner', `/staff/retention-reviews/${entry.id}/delete`, {
      reason: 'Synthetic.',
      confirmedChecks: ALL_CHECKS,
    })
    expect(res.statusCode).toBe(409)
    const archived = await write('owner', `/staff/retention-reviews/${entry.id}/archive`, { reason: 'Synthetic.' })
    expect(archived.statusCode).toBe(200)
  })

  it('[HH-PRIV-05][RULE-SERVER-AUTHZ] no other role has a delete action, and the database refuses a delete outside an erasure', async () => {
    const e = await withdrawnEstimate()
    await scan(later(2, 2))
    const entry = await entryFor(e.estimateId)
    for (const who of ['office', 'estimator', 'worker'] as const) {
      expect((await get(who, `/staff/retention-reviews/${entry.id}/deletion`)).statusCode, who).toBe(403)
      expect((await get(who, '/staff/deletions')).statusCode, who).toBe(403)
      for (const action of ['delete', 'archive', 'keep'])
        expect(
          (
            await write(who, `/staff/retention-reviews/${entry.id}/${action}`, {
              reason: 'Synthetic.',
              confirmedChecks: ALL_CHECKS,
              keepUntil: new Date(Date.now() + YEAR_MS).toISOString(),
            })
          ).statusCode,
          `${who} ${action}`,
        ).toBeGreaterThanOrEqual(400)
    }
    expect((await get(null, '/staff/deletions')).statusCode).toBe(401)
    const unknown = await get('owner', `/staff/retention-reviews/${randomUUID()}/deletion`)
    expect(unknown.statusCode).toBe(404)
    expect(await count('estimating.estimates', 'id', e.estimateId)).toBe(1)

    // The data layer: an estimate is never deleted outside the transaction of its deletion log entry.
    await expect(sql`DELETE FROM estimating.estimates WHERE id = ${e.estimateId}`.execute(t.db)).rejects.toThrow(
      /APPEND_ONLY/,
    )
    await expect(
      sql`DELETE FROM estimating.estimate_versions WHERE estimate_id = ${e.estimateId}`.execute(t.db),
    ).rejects.toThrow()
    // A setting naming a log entry written by another transaction permits nothing.
    const gone = await withdrawnEstimate()
    await scan(later(2, 2))
    const done = await write('owner', `/staff/retention-reviews/${(await entryFor(gone.estimateId)).id}/delete`, {
      reason: 'Synthetic.',
      confirmedChecks: ALL_CHECKS,
    })
    expect(done.statusCode, done.body).toBe(200)
    const old = { id: done.json<{ deletionId: string }>().deletionId }
    await expect(
      withTx(t.db, async (tx) => {
        await sql`SELECT set_config('handyhub.erasure', ${old.id}, true)`.execute(tx)
        await sql`DELETE FROM estimating.estimate_versions WHERE estimate_id = ${e.estimateId}`.execute(tx)
      }),
    ).rejects.toThrow()
    expect(await count('estimating.estimate_versions', 'estimate_id', e.estimateId)).toBe(1)
    // The log and the decisions are append-only.
    await expect(sql`UPDATE privacy.deletions SET reason = 'x' WHERE id = ${old.id}`.execute(t.db)).rejects.toThrow()
    await expect(sql`DELETE FROM privacy.retention_decisions`.execute(t.db)).rejects.toThrow()
  })
})

describe('privacy requests reviewed by the Owner (TSK-0100, HH-PRIV-03, OWN-DEC-71, OWN-DEC-113)', () => {
  const PR = (p: { reference: string }, rest = '') => `/customer/projects/${p.reference}/privacy-requests${rest}`

  it('[HH-PRIV-03][T22] a deletion request: fresh identity, Owner review, eligible data deleted, access closed, protected records stay', async () => {
    // One project with an estimate never accepted and an approved one (protected evidence).
    const lost = await withdrawnEstimate()
    const created = await write('estimator', `/staff/projects/${lost.projectId}/estimates`, {})
    expect(created.statusCode, created.body).toBe(201)
    const extra = created.json<{ estimateId: string; number: string; versionId: string }>()
    await publish(extra.versionId)
    const approved: Estimate = { ...lost, ...extra }
    await approve(approved, 1, await customerCookie(approved))
    // An account of this contact, linked to the project, and its session (TSK-0036 records, written directly).
    const accountId = randomUUID()
    const codeId = randomUUID()
    const contact = await t.db
      .selectFrom('crm.contacts')
      .select(['email'])
      .where('id', '=', approved.contactId)
      .executeTakeFirstOrThrow()
    await sql`INSERT INTO identity.verification_codes (id, purpose, channel, destination, subject_ref, nonce, code_digest,
                max_attempts, expires_at, request_id, consumed_at)
              VALUES (${codeId}, 'account_sign_in', 'email', ${contact.email.toLowerCase()},
                ${`enroll:${approved.requestId}:${approved.contactId}:email`}, ${'0'.repeat(32)}, ${'0'.repeat(64)}, 5,
                now() + interval '10 minutes', 'synthetic-test', now())`.execute(t.db)
    await sql`INSERT INTO identity.customer_accounts (id, sign_in_email, email_verified_at, customer_id, contact_id,
                enrolled_via) VALUES (${accountId}, ${contact.email.toLowerCase()}, now(), ${approved.customerId},
                ${approved.contactId}, 'project_link')`.execute(t.db)
    await sql`INSERT INTO identity.customer_identity_links (id, account_id, customer_id, contact_id, project_id,
                request_id, authority, evidence, evidence_channel, evidence_code_id, state, decided_by, decided_at)
              VALUES (${randomUUID()}, ${accountId}, ${approved.customerId}, ${approved.contactId}, ${approved.projectId},
                ${approved.requestId}, 'owner', 'project_link_code', 'email', ${codeId}, 'active',
                ${`account:${accountId}`}, now())`.execute(t.db)
    const accountSession = await withTx(t.db, (tx) =>
      startCustomerSession(tx, {
        contactRef: `account:${accountId}`,
        via: 'account',
        projectIds: [],
        verifiedAt: new Date(),
        account: { id: accountId, signInChannel: 'email' },
      }),
    )
    const accountCookie = `__Host-hh_customer=${accountSession.token}`

    // A stale verification is refused with nothing written; a fresh one submits.
    const stale = await customerCookie(approved, new Date(Date.now() - 24 * 3600 * 1000))
    const refused = await customerPost(PR(approved, '/deletion'), stale, {})
    expect(refused.statusCode).toBe(403)
    expect(refused.json()).toMatchObject({ error: { fieldErrors: [{ code: 'FRESH_VERIFICATION_REQUIRED' }] } })
    const cookie = await customerCookie(approved)
    const listed = (await customerGet(PR(approved), stale)).json<{ freshVerification: boolean; requests: unknown[] }>()
    expect(listed).toMatchObject({ freshVerification: false, requests: [] })
    const submitted = await customerPost(PR(approved, '/deletion'), accountCookie, {})
    expect(submitted.statusCode, submitted.body).toBe(201)
    const pr = submitted.json<{ reference: string; state: string }>()
    expect(pr).toMatchObject({ kind: 'deletion', state: 'received', outcome: null })
    expect(pr.reference).toMatch(/^PR-[0-9]{6}$/)
    expect(Object.keys(pr).filter(forbiddenForCustomer)).toEqual([])
    const second = await customerPost(PR(approved, '/deletion'), cookie, {})
    expect(second.statusCode).toBe(409)
    expect(second.json()).toMatchObject({ error: { fieldErrors: [{ code: 'PRIVACY_REQUEST_OPEN' }] } })

    // The Owner's list and the scoped search.
    const row = await t.db
      .selectFrom('privacy.privacy_requests')
      .selectAll()
      .where('reference', '=', pr.reference)
      .executeTakeFirstOrThrow()
    expect(row).toMatchObject({
      customer_id: approved.customerId,
      contact_id: approved.contactId,
      account_id: accountId,
      identity_method: 'fresh_session_code',
    })
    const page = (await get('owner', '/staff/privacy-requests?state=received')).json<{ items: { id: string }[] }>()
    expect(page.items.map((i) => i.id)).toContain(row.id)
    expect((await get('office', '/staff/privacy-requests')).statusCode).toBe(403)
    const detail = await get('owner', `/staff/privacy-requests/${row.id}`)
    expect(detail.statusCode, detail.body).toBe(200)
    const plan = detail.json<{
      version: number
      plan: {
        items: { category: string; disposition: string; count: number; reason: string | null }[]
        deletable: { estimates: { reference: string }[]; accountIds: string[] }
        confirm: string[]
      }
    }>()
    expect(plan.plan.items).toContainEqual(
      expect.objectContaining({ category: 'login_account', disposition: 'delete', count: 1 }),
    )
    expect(plan.plan.items).toContainEqual(
      expect.objectContaining({ category: 'unaccepted_estimates', disposition: 'delete', count: 1 }),
    )
    expect(plan.plan.items).toContainEqual(
      expect.objectContaining({ category: 'accepted_agreements', disposition: 'retain', reason: 'protected_evidence' }),
    )
    expect(plan.plan.items).toContainEqual(
      expect.objectContaining({ category: 'financial_records', disposition: 'not_recorded' }),
    )
    expect(plan.plan.deletable.estimates.map((x) => x.reference)).toEqual([lost.number])
    expect(plan.plan.deletable.accountIds).toEqual([accountId])

    // Deciding needs the review first, then every check confirmed, closeAccess chosen and a fresh sign-in.
    const early = await write(
      'owner',
      `/staff/privacy-requests/${row.id}/decision`,
      { decision: 'complete', reason: 'Synthetic.', confirmedChecks: ALL_CHECKS, closeAccess: true },
      plan.version,
    )
    expect(early.statusCode).toBe(409)
    expect(early.json()).toMatchObject({ error: { fieldErrors: [{ code: 'REVIEW_NOT_STARTED' }] } })
    const reviewed = await write('owner', `/staff/privacy-requests/${row.id}/review`, {}, plan.version)
    expect(reviewed.statusCode, reviewed.body).toBe(200)
    const r = reviewed.json<{ version: number; state: string; findings: { items: unknown[] } }>()
    expect(r.state).toBe('under_review')
    expect(r.findings.items.length).toBeGreaterThan(0)
    expect(JSON.stringify(r.findings)).not.toContain('Synthetic Privacy Customer')
    const noAccessChoice = await write(
      'owner',
      `/staff/privacy-requests/${row.id}/decision`,
      { decision: 'complete', reason: 'Synthetic.', confirmedChecks: ALL_CHECKS },
      r.version,
    )
    expect(noAccessChoice.statusCode).toBe(400)
    const unchecked = await write(
      'owner',
      `/staff/privacy-requests/${row.id}/decision`,
      { decision: 'complete', reason: 'Synthetic.', confirmedChecks: [], closeAccess: true },
      r.version,
    )
    expect(unchecked.statusCode).toBe(400)
    const stalePw = await staleOwnerSignIn(() =>
      write(
        'owner',
        `/staff/privacy-requests/${row.id}/decision`,
        { decision: 'complete', reason: 'Synthetic.', confirmedChecks: ALL_CHECKS, closeAccess: true },
        r.version,
      ),
    )
    expect(stalePw.statusCode).toBe(403)
    expect(await count('estimating.estimates', 'id', lost.estimateId)).toBe(1)

    const decided = await write(
      'owner',
      `/staff/privacy-requests/${row.id}/decision`,
      {
        decision: 'complete',
        reason: 'Synthetic: identity confirmed; eligible data deleted.',
        confirmedChecks: ALL_CHECKS,
        closeAccess: true,
      },
      r.version,
    )
    expect(decided.statusCode, decided.body).toBe(200)
    const d = decided.json<{
      state: string
      accessClosed: boolean
      outcome: { deleted: unknown[]; retained: { category: string }[] }
    }>()
    expect(d.state).toBe('partially_completed')
    expect(d.accessClosed).toBe(true)
    expect(d.outcome.deleted).toEqual(
      expect.arrayContaining([
        { category: 'unaccepted_estimates', count: 1 },
        { category: 'login_account', count: 1 },
      ]),
    )
    expect(d.outcome.retained.map((i) => i.category)).toEqual(
      expect.arrayContaining(['accepted_agreements', 'requests', 'customer_profile', 'audit_log']),
    )

    // Eligible data went; protected records stayed; nothing cascaded.
    expect(await count('estimating.estimates', 'id', lost.estimateId)).toBe(0)
    expect(await count('estimating.estimates', 'id', approved.estimateId)).toBe(1)
    expect(await count('estimating.approvals', 'estimate_id', approved.estimateId)).toBe(1)
    expect(await count('work.jobs', 'project_id', approved.projectId)).toBe(1)
    expect(await count('intake.requests', 'id', approved.requestId)).toBe(1)
    // Sign-in, sessions and project links are revoked: every cookie of this customer opens nothing now.
    const account = await t.db
      .selectFrom('identity.customer_accounts')
      .select(['state', 'sign_in_email', 'close_reason'])
      .where('id', '=', accountId)
      .executeTakeFirstOrThrow()
    expect(account).toEqual({ state: 'closed', sign_in_email: null, close_reason: 'owner_deleted' })
    for (const c of [cookie, accountCookie, stale])
      expect((await customerGet(PR(approved), c)).statusCode).toBeGreaterThanOrEqual(400)
    const grant = await t.db
      .selectFrom('identity.project_access_grants')
      .select(['revoked_at', 'revoke_reason'])
      .where('id', '=', approved.grantId)
      .executeTakeFirstOrThrow()
    expect(grant.revoke_reason).toBe('account_deleted')
    const log = await t.db
      .selectFrom('privacy.deletions')
      .select(['record_type', 'record_ref', 'source', 'early', 'reason'])
      .where('privacy_request_id', '=', row.id)
      .orderBy('seq')
      .execute()
    expect(log).toEqual([
      expect.objectContaining({
        record_type: 'estimate',
        record_ref: lost.number,
        source: 'privacy_request',
        early: true,
      }),
      expect.objectContaining({ record_type: 'customer_account', source: 'privacy_request', early: false }),
    ])
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['reason', 'step_up_used', 'summary'])
      .where('action', '=', 'privacy.decide')
      .where('target_id', '=', row.id)
      .executeTakeFirstOrThrow()
    expect(audit).toMatchObject({ reason: 'Synthetic: identity confirmed; eligible data deleted.', step_up_used: true })
    // A decided request is final.
    const twice = await write(
      'owner',
      `/staff/privacy-requests/${row.id}/decision`,
      { decision: 'decline', reason: 'Synthetic.' },
      d.state === 'partially_completed' ? r.version + 1 : r.version,
    )
    expect(twice.statusCode).toBe(409)
  })

  it('[HH-PRIV-03] a hold keeps the records it covers, but access can still be closed', async () => {
    const e = await withdrawnEstimate()
    await t.db
      .insertInto('work.holds')
      .values({
        kind: 'review',
        scope_type: 'request',
        scope_id: e.requestId,
        project_id: e.projectId,
        request_id: e.requestId,
        category: 'other',
        note: 'Synthetic review hold',
        source: 'qualification',
        source_ref: 'qualification:1',
        raised_by: ids.office,
      })
      .execute()
    const cookie = await customerCookie(e)
    const submitted = await customerPost(PR(e, '/deletion'), cookie, {})
    expect(submitted.statusCode, submitted.body).toBe(201)
    const row = await t.db
      .selectFrom('privacy.privacy_requests')
      .select(['id', 'version'])
      .where('reference', '=', submitted.json<{ reference: string }>().reference)
      .executeTakeFirstOrThrow()
    const reviewed = await write('owner', `/staff/privacy-requests/${row.id}/review`, {}, row.version)
    const plan = reviewed.json<{
      version: number
      plan: { items: { category: string; disposition: string; reason: string }[] }
    }>()
    expect(plan.plan.items).toContainEqual(
      expect.objectContaining({ category: 'unaccepted_estimates', disposition: 'retain', reason: 'hold' }),
    )
    const decided = await write(
      'owner',
      `/staff/privacy-requests/${row.id}/decision`,
      {
        decision: 'complete',
        reason: 'Synthetic: hold keeps records.',
        confirmedChecks: ALL_CHECKS,
        closeAccess: true,
      },
      plan.version,
    )
    expect(decided.statusCode, decided.body).toBe(200)
    expect(decided.json()).toMatchObject({ state: 'partially_completed', accessClosed: true })
    expect(await count('estimating.estimates', 'id', e.estimateId)).toBe(1)
    expect((await customerGet(PR(e), cookie)).statusCode).toBeGreaterThanOrEqual(400)
  })

  it('[HH-PRIV-03][T68] an export request: the Owner completes it and only the requester downloads their own data', async () => {
    const e = await withdrawnEstimate()
    // Another contact of the same customer: a third party to this request.
    await t.db
      .insertInto('crm.contacts')
      .values({
        customer_id: e.customerId,
        full_name: 'Synthetic Third Party',
        email: 'third-party-privacy@example.test',
        phone_e164: '+15025550197',
        email_verification: 'unverified',
        phone_verification: 'unverified',
        preferred_channel: 'email',
        is_primary: false,
      } as never)
      .execute()
    const cookie = await customerCookie(e)
    const submitted = await customerPost(PR(e, '/export'), cookie, {})
    expect(submitted.statusCode, submitted.body).toBe(201)
    const ref = submitted.json<{ reference: string }>().reference
    // Not available before the Owner completes it.
    expect((await customerGet(PR(e, `/${ref}/export`), cookie)).statusCode).toBe(404)
    const row = await t.db
      .selectFrom('privacy.privacy_requests')
      .select(['id', 'version'])
      .where('reference', '=', ref)
      .executeTakeFirstOrThrow()
    const reviewed = await write('owner', `/staff/privacy-requests/${row.id}/review`, {}, row.version)
    const decided = await write(
      'owner',
      `/staff/privacy-requests/${row.id}/decision`,
      { decision: 'complete', reason: 'Synthetic: export prepared.' },
      reviewed.json<{ version: number }>().version,
    )
    expect(decided.statusCode, decided.body).toBe(200)
    expect(decided.json()).toMatchObject({ state: 'completed', outcome: { exportReady: true } })

    const res = await customerGet(PR(e, `/${ref}/export`), cookie)
    expect(res.statusCode, res.body).toBe(200)
    const data = res.json<Record<string, unknown>>()
    expect(data).toMatchObject({
      customer: { name: expect.stringContaining('Synthetic Privacy Customer') },
      contact: { fullName: expect.stringContaining('Synthetic Privacy Customer'), phone: '+15025550198' },
      requests: [
        expect.objectContaining({ reference: e.reference, description: expect.stringContaining('Synthetic') }),
      ],
      estimates: [expect.objectContaining({ number: e.number, status: 'withdrawn', totalCents: 12_345 })],
      excluded: expect.arrayContaining(['third_party_contacts', 'staff_notes_and_handling']),
    })
    expect(JSON.stringify(data)).not.toContain('Synthetic Third Party')
    expect(JSON.stringify(data)).not.toContain('third-party-privacy@example.test')
    // A stale verification and another customer's session get nothing.
    expect((await customerGet(PR(e, `/${ref}/export`), await customerCookie(e, new Date(0)))).statusCode).toBe(403)
    const other = await readyRequest()
    const otherCookie = await customerCookie(other)
    expect((await customerGet(PR(e, `/${ref}/export`), otherCookie)).statusCode).toBe(404)
    expect((await customerGet(PR(other, `/${ref}/export`), otherCookie)).statusCode).toBe(404)
    expect((await customerGet(PR(e), otherCookie)).statusCode).toBe(404)
  })

  it('[HH-PRIV-03] a correction request keeps the customer’s words and is declined or completed by the Owner only', async () => {
    const e = await readyRequest()
    const cookie = await customerCookie(e)
    expect((await customerPost(PR(e, '/correction'), cookie, {})).statusCode).toBe(400)
    const submitted = await customerPost(PR(e, '/correction'), cookie, { details: 'Synthetic: my unit number is 2B.' })
    expect(submitted.statusCode, submitted.body).toBe(201)
    expect(submitted.json()).toMatchObject({ kind: 'correction', details: 'Synthetic: my unit number is 2B.' })
    const row = await t.db
      .selectFrom('privacy.privacy_requests')
      .select(['id', 'version'])
      .where('reference', '=', submitted.json<{ reference: string }>().reference)
      .executeTakeFirstOrThrow()
    for (const who of ['office', 'estimator', 'worker'] as const)
      expect((await write(who, `/staff/privacy-requests/${row.id}/review`, {}, row.version)).statusCode, who).toBe(403)
    const reviewed = await write('owner', `/staff/privacy-requests/${row.id}/review`, {}, row.version)
    const declined = await write(
      'owner',
      `/staff/privacy-requests/${row.id}/decision`,
      { decision: 'decline', reason: 'Synthetic: the unit number on file already reads 2B.' },
      reviewed.json<{ version: number }>().version,
    )
    expect(declined.statusCode, declined.body).toBe(200)
    const mine = (await customerGet(PR(e), cookie)).json<{ requests: { state: string; outcome: unknown }[] }>()
    expect(mine.requests[0]).toMatchObject({ state: 'declined' })
    // The Owner's reason stays internal.
    expect(JSON.stringify(mine)).not.toContain('already reads 2B')
  })
})

describe('deletions re-applied after a restore (TSK-0100, T72, HH-PRIV-03)', () => {
  it('[T72][HH-PRIV-05] exported log entries are applied again: back records erased, blocked ones reported, twice is a no-op', async () => {
    const e = await withdrawnEstimate()
    await scan(later(2, 2))
    const entry = await entryFor(e.estimateId)
    const deleted = await write('owner', `/staff/retention-reviews/${entry.id}/delete`, {
      reason: 'Synthetic: past its period.',
      confirmedChecks: ALL_CHECKS,
    })
    expect(deleted.statusCode, deleted.body).toBe(200)
    const exported = await exportDeletions(t.db)
    const mine = exported.find((x) => x.recordId === e.estimateId)
    expect(mine).toMatchObject({ recordType: 'estimate', recordRef: e.number, reason: 'Synthetic: past its period.' })
    expect(JSON.stringify(exported)).not.toContain('Patch the synthetic hole')

    // A restored database holds an estimate that was deleted after its backup: here, one never deleted, named by an
    // exported entry; and one now protected by an approval, which is left in place.
    const restored = await withdrawnEstimate()
    const approved = await withdrawnEstimate()
    const revised = await write('estimator', `/staff/estimate-versions/${approved.versionId}/revise`, {})
    await publish(revised.json<{ versionId: string }>().versionId)
    await approve(approved, 2, await customerCookie(approved))
    const original = {
      id: randomUUID(),
      reason: 'Synthetic: deleted after the backup.',
      decidedAt: new Date().toISOString(),
    }
    const file = [
      ...(mine ? [mine] : []),
      { ...original, recordType: 'estimate' as const, recordId: restored.estimateId, recordRef: restored.number },
      {
        ...original,
        id: randomUUID(),
        recordType: 'estimate' as const,
        recordId: approved.estimateId,
        recordRef: approved.number,
      },
    ]
    const results = await withTx(t.db, (tx) =>
      reapplyDeletions(tx, file, { requestId: 'synthetic-restore', operator: 'test' }),
    )
    expect(results.map((r) => r.outcome)).toEqual(['absent', 'reapplied', 'blocked'])
    expect(results[2]?.blockers).toContain('protected_evidence')
    expect(await count('estimating.estimates', 'id', restored.estimateId)).toBe(0)
    expect(await count('estimating.estimates', 'id', approved.estimateId)).toBe(1)
    const reapplied = await t.db
      .selectFrom('privacy.deletions')
      .selectAll()
      .where('record_id', '=', restored.estimateId)
      .executeTakeFirstOrThrow()
    expect(reapplied).toMatchObject({
      source: 'restore_reapply',
      original_deletion_id: original.id,
      decided_by: 'system.restore:test',
      reason: original.reason,
    })
    const twice = await withTx(t.db, (tx) => reapplyDeletions(tx, file, { requestId: 'synthetic-restore-2' }))
    expect(twice.map((r) => r.outcome)).toEqual(['absent', 'absent', 'blocked'])
    // The export keeps the original identity of a re-applied entry, so it is never applied twice over.
    expect((await exportDeletions(t.db)).filter((x) => x.id === original.id)).toHaveLength(1)
  })
})

describe('erasing an estimate whose project has messages, questions and replies (TSK-0100 with TSK-0051, TSK-0060)', () => {
  const registry = createAutomationRegistry(estimateReminderAutomations({ publicSiteUrl: 'http://127.0.0.1:4610' }))
  /** Runs the reminder jobs that are due now (the worker knows only the reminder automations). */
  async function drain() {
    const w = createWorker({ db: t.db, registry })
    for (let i = 0; i < 12; i++) {
      const r = await w.runOnce()
      if (r.dispatched + r.succeeded + r.retried + r.failed + r.cancelled === 0) return
    }
  }
  const due = async (versionId: string, step: 'first' | 'final') => {
    await sql`UPDATE platform.jobs SET run_at = now() WHERE automation = 'estimate.reminder_draft'
              AND job_key = ${`estimate.reminder_draft:${versionId}:${step}`}`.execute(t.db)
    await drain()
  }
  const deliveries = (versionId: string) =>
    t.db
      .selectFrom('platform.message_deliveries')
      .select(['id', 'message_key', 'state', 'released_by'])
      .where('record_type', '=', 'estimate_version')
      .where('record_id', '=', versionId)
      .orderBy('seq')
      .execute()
  type Preview = {
    target: { removes: { kind: string; count: number }[]; keeps: { kind: string; count: number }[]; blockers: string[] }
  }
  /** A published estimate on a ready request (not withdrawn yet). */
  async function publishedEstimate(r?: Project) {
    const project = r ?? (await readyRequest())
    const created = await write('estimator', `/staff/projects/${project.projectId}/estimates`, {})
    expect(created.statusCode, created.body).toBe(201)
    const ids = created.json<{ estimateId: string; number: string; versionId: string }>()
    const rowVersion = await publish(ids.versionId)
    return { ...project, ...ids, rowVersion }
  }
  async function withdraw(versionId: string, rowVersion: number) {
    const res = await write(
      'estimator',
      `/staff/estimate-versions/${versionId}/withdraw`,
      { reason: 'Synthetic: sent to the wrong project.' },
      rowVersion,
    )
    expect(res.statusCode, res.body).toBe(200)
  }

  it('[HH-PRIV-05][HH-EST-14] reminder drafts nobody released go with the estimate; a sent message keeps only the reference', async () => {
    const e = await publishedEstimate()
    await drain()
    await due(e.versionId, 'first')
    await due(e.versionId, 'final')
    // The first draft was replaced by the final one; both are waiting or cancelled drafts nobody released.
    expect((await deliveries(e.versionId)).map((d) => [d.message_key, d.state])).toEqual([
      ['reminder.unanswered_estimate', 'cancelled'],
      ['reminder.unanswered_estimate', 'draft'],
    ])
    const drafted = await deliveries(e.versionId)
    // A message the customer received about the version (synthetic: the estimate-ready notice, sent).
    const sent = await t.db
      .insertInto('platform.message_deliveries')
      .values({
        message_key: 'estimate.ready',
        channel: 'email',
        audience: 'customer',
        subject_key: `estimate_version:${e.versionId}`,
        release: 'automatic',
        state: 'sent',
        locale: 'en',
        record_type: 'estimate_version',
        record_id: e.versionId,
        recipient_kind: 'customer_contact',
        recipient_id: e.contactId,
        destination: 'privacy-sent-notice@example.test',
        channel_permission: 'preferred',
        project_id: e.projectId,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    await withdraw(e.versionId, e.rowVersion)
    expect((await deliveries(e.versionId)).filter((d) => d.state === 'draft')).toEqual([])
    await scan(later(2, 2))
    const entry = await entryFor(e.estimateId)

    const p = (await get('owner', `/staff/retention-reviews/${entry.id}/deletion`)).json<Preview>()
    expect(p.target.blockers).toEqual([])
    expect(p.target.removes).toContainEqual({ kind: 'reminder_drafts', count: 2 })
    expect(p.target.keeps).toContainEqual({ kind: 'message_records', count: 1 })

    const res = await write('owner', `/staff/retention-reviews/${entry.id}/delete`, {
      reason: 'Synthetic: past its period.',
      confirmedChecks: ALL_CHECKS,
    })
    expect(res.statusCode, res.body).toBe(200)
    const { deletionId } = res.json<{ deletionId: string }>()
    expect(await count('estimating.estimates', 'id', e.estimateId)).toBe(0)
    // The drafts are gone; the sent notice stays and names the erased version only by its id.
    expect((await deliveries(e.versionId)).map((d) => d.id)).toEqual([sent.id])
    const log = await t.db
      .selectFrom('privacy.deletions')
      .select('removed')
      .where('id', '=', deletionId)
      .executeTakeFirstOrThrow()
    expect(log.removed).toMatchObject({ reminder_drafts: 2, estimate_versions: 1 })
    // The audit entries about the drafts stay (append-only); the queue item and the waiting jobs are closed.
    for (const d of drafted) expect(await count('platform.audit_events', 'target_id', d.id)).toBeGreaterThanOrEqual(1)
    const items = await t.db
      .selectFrom('ops.queue_items')
      .select(['resolved_at'])
      .where('subject_id', '=', e.versionId)
      .execute()
    expect(items.every((i) => i.resolved_at !== null)).toBe(true)
    const waiting = await t.db
      .selectFrom('platform.jobs')
      .select('id')
      .where('target_id', '=', e.versionId)
      .where('state', '=', 'queued')
      .execute()
    expect(waiting).toEqual([])
    // Nothing left for the reminder jobs to trip over.
    await drain()
    const failed = await t.db
      .selectFrom('platform.jobs')
      .select('id')
      .where('target_id', '=', e.versionId)
      .where('state', '=', 'failed')
      .execute()
    expect(failed).toEqual([])
  })

  it('[HH-PRIV-05][HH-LEAD-03] a question and the customer’s reply on the project stay; the estimate is erased', async () => {
    const r = await newRequest('online')
    const stateVersion = async () =>
      (
        await t.db
          .selectFrom('intake.requests')
          .select('state_version')
          .where('id', '=', r.requestId)
          .executeTakeFirstOrThrow()
      ).state_version
    const asked = await write(
      'office',
      `/staff/requests/${r.requestId}/questions`,
      { text: 'Synthetic: how wide is the hole?', kind: 'measurement', noHazardInspection: true },
      await stateVersion(),
    )
    expect(asked.statusCode, asked.body).toBe(201)
    const questionId = (
      await t.db
        .selectFrom('intake.questions')
        .select('id')
        .where('request_id', '=', r.requestId)
        .executeTakeFirstOrThrow()
    ).id
    const replied = await customerPost(
      `/customer/projects/${r.reference}/questions/${questionId}/replies`,
      await customerCookie(r),
      { text: 'Synthetic: about a hand wide.' },
    )
    expect(replied.statusCode, replied.body).toBe(201)
    // The reply in hand, staff move the request on to an online estimate and publish it.
    const qualified = await write('owner', `/staff/requests/${r.requestId}/qualification`, { checks: ALL_OK }, 0, 'PUT')
    expect(qualified.statusCode, qualified.body).toBe(200)
    const moved = await write(
      'owner',
      `/staff/requests/${r.requestId}/actions/online-estimate`,
      { workPackages: ['SVC-DW-01'] },
      await stateVersion(),
    )
    expect(moved.statusCode, moved.body).toBe(200)
    const e = await publishedEstimate(r)
    await drain()
    await due(e.versionId, 'first')
    expect((await deliveries(e.versionId)).map((d) => d.state)).toEqual(['draft'])
    await withdraw(e.versionId, e.rowVersion)
    await scan(later(2, 2))
    const entry = await entryFor(e.estimateId)
    const p = (await get('owner', `/staff/retention-reviews/${entry.id}/deletion`)).json<Preview>()
    expect(p.target.blockers).toEqual([])
    expect(p.target.removes).toContainEqual({ kind: 'reminder_drafts', count: 1 })

    const res = await write('owner', `/staff/retention-reviews/${entry.id}/delete`, {
      reason: 'Synthetic: past its period.',
      confirmedChecks: ALL_CHECKS,
    })
    expect(res.statusCode, res.body).toBe(200)
    expect(await count('estimating.estimates', 'id', e.estimateId)).toBe(0)
    expect(await deliveries(e.versionId)).toEqual([])
    // The question and the reply belong to the request, which stays with its project.
    expect(await count('intake.questions', 'id', questionId)).toBe(1)
    expect(await count('intake.question_replies', 'question_id', questionId)).toBe(1)
    expect(await count('intake.requests', 'id', e.requestId)).toBe(1)
    expect(await count('crm.projects', 'id', e.projectId)).toBe(1)
  })
})
