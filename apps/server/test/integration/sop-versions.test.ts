// SOP versions pinned on the work packages of a job, against PostgreSQL 16 (TSK-0068; HH-PKT-03, HH-WORK-11, T43,
// ENT-SOPVersion, ENT-WorkPackage, OWN-DEC-17, OWN-DEC-108, RULE-SAFETY-GATES, RULE-SERVER-AUTHZ,
// RULE-NO-INVENTED-FACTS). Staff, customers, requests, amounts and reviewer names are synthetic (RULE-SYNTHETIC-DATA).
// No estimate terms version is recorded by the migrations: approval answers NOT CONFIGURED until the owner's sign-off
// (OQ-TERMS-OWNER-APPROVAL). To create a job, this file records a synthetic "approved and attorney-reviewed" terms
// version in its own throwaway test database only, then restores NOT CONFIGURED; that is a test fixture, never a
// statement that the owner approved anything.
import { randomUUID } from 'node:crypto'
import { loadServiceSeed, loadSopSeed, syncServices, syncSops, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import { dataScope, type StaffActor } from '@handyhub/policy'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { workPackageSopView } from '../../src/modules/sops/view.js'
import { recordPolicyVersion, type ConfigKey } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa } from '../fixtures/staff-mfa.js'

const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'sop', 'versions', 'code', 'key', 'for', 'tests', 'only', '0068'].join('-'),
})
const pw = (n: number) => ['synthetic', 'sop', 'versions', 'passphrase', String(n)].join(' ')
const PEOPLE = ['owner', 'estimator', 'worker'] as const
type Person = (typeof PEOPLE)[number]

let t: TestDatabase
let app: FastifyInstance
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>

const TERMS_FIXTURE = {
  documentId: ESTIMATE_TERMS.documentId,
  status: 'approved',
  attorneyReviewed: true,
  preparedOn: ESTIMATE_TERMS.preparedOn,
  contentSha256: ESTIMATE_TERMS.contentSha256,
}
// The service of this file's requests whose SOP is held back at first: its work package is NOT CONFIGURED.
const WITHOUT_SOP = 'SVC-PT-01'

async function setConfig(key: ConfigKey, value: unknown) {
  await recordPolicyVersion(t.db, {
    key,
    value: value as never,
    sourceIds: ['TEST-SYNTHETIC'],
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
}

async function signIn(p: Person): Promise<[string, string]> {
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email: `${p}-sop-versions@example.test`, password: pw(1) },
  })
  expect(res.statusCode).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  await syncSops(
    t.db,
    loadSopSeed().filter((s) => s.serviceId !== WITHOUT_SOP),
  )
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: t.db, codeKey: KEY, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: `${p}-sop-versions@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: p,
        issuedBy: 'test',
      })
      ids[p] = user.id
      await setPasswordHash(tx, user.id, hash)
    }
  })
  for (const p of PEOPLE) [cookies[p], csrf[p]] = await signIn(p)
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

let seq = 0
const key = (what: string) => `synthetic-${what}-${String(++seq).padStart(6, '0')}-${randomUUID()}`
function staffWrite(who: Person, url: string, payload: unknown, version?: number) {
  return app.inject({
    method: 'POST',
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
function staffPut(who: Person, url: string, payload: unknown, version: number) {
  return app.inject({
    method: 'PUT',
    url,
    payload: payload as object,
    headers: {
      cookie: cookies[who],
      'x-csrf-token': csrf[who],
      'idempotency-key': key('staff'),
      'if-match': `"${version}"`,
    },
  })
}
const staffGet = (who: Person, url: string) => app.inject({ method: 'GET', url, headers: { cookie: cookies[who] } })

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

/** A job: a request for DW-01 and PT-01, an estimate published and approved by the verified customer. */
async function approvedJob() {
  await setConfig('legal.estimate_terms', TERMS_FIXTURE)
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/public/requests',
      headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${68 + seq}` },
      payload: {
        formVersion: 'test-1',
        privacyNoticeVersion: 'privacy-notice-1',
        services: [{ serviceId: 'SVC-DW-01' }, { serviceId: WITHOUT_SOP }],
        notSure: false,
        description: 'Synthetic SOP pinning project.',
        answers: [],
        property: {
          street: `${seq} Synthetic Checklist Lane`,
          city: 'Testville',
          state: 'ky',
          zip: '40000',
          propertyType: 'house',
        },
        timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
        estimatePreference: 'online',
        contact: {
          fullName: 'Synthetic Checklist Customer',
          email: `sop-versions-${seq}-${randomUUID().slice(0, 8)}@example.test`,
          phone: '(502) 555-0168',
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
      .select(['id', 'project_id', 'state_version', 'contact_id'])
      .where('reference', '=', reference)
      .executeTakeFirstOrThrow()
    const grant = await t.db
      .selectFrom('identity.project_access_grants')
      .select('id')
      .where('request_id', '=', row.id)
      .executeTakeFirstOrThrow()
    expect(
      (await staffPut('owner', `/api/v1/staff/requests/${row.id}/qualification`, { checks: ALL_OK }, 0)).statusCode,
    ).toBe(200)
    const moved = await staffWrite(
      'owner',
      `/api/v1/staff/requests/${row.id}/actions/online-estimate`,
      { workPackages: ['SVC-DW-01', WITHOUT_SOP] },
      row.state_version,
    )
    expect(moved.statusCode, moved.body).toBe(200)
    const created = await staffWrite('estimator', `/api/v1/staff/projects/${row.project_id}/estimates`, {})
    expect(created.statusCode).toBe(201)
    const c = created.json<{ number: string; versionId: string }>()
    const view = await staffGet('estimator', `/api/v1/staff/estimate-versions/${c.versionId}`)
    const v = view.json<{ rowVersion: number; workPackages: { id: string }[] }>()
    const saved = await staffPut(
      'estimator',
      `/api/v1/staff/estimate-versions/${c.versionId}/draft`,
      {
        lines: [
          {
            kind: 'base',
            workPackageId: v.workPackages[0]?.id,
            description: 'Synthetic patch',
            quantity: '1',
            unit: 'patch',
            unitPriceCents: 12_500,
          },
          {
            kind: 'base',
            workPackageId: v.workPackages[1]?.id,
            description: 'Synthetic paint',
            quantity: '1',
            unit: 'room',
            unitPriceCents: 25_000,
          },
        ],
        texts: { exclusions: ['Synthetic: none'] },
      },
      v.rowVersion,
    )
    expect(saved.statusCode, saved.body).toBe(200)
    const pub = await staffWrite(
      'estimator',
      `/api/v1/staff/estimate-versions/${c.versionId}/publish`,
      {},
      saved.json<{ rowVersion: number }>().rowVersion,
    )
    expect(pub.statusCode, pub.body).toBe(200)
    const s = await withTx(t.db, (tx) =>
      startCustomerSession(tx, {
        contactRef: row.contact_id,
        via: 'grant',
        projectIds: [row.project_id],
        verifiedAt: new Date(),
        grantId: grant.id,
      }),
    )
    const cookie = `__Host-hh_customer=${s.token}`
    const url = `/api/v1/customer/projects/${reference}/estimates/${c.number}/versions/1`
    const d = (await app.inject({ method: 'GET', url, headers: { cookie } })).json<{
      totalCents: number
      approval: {
        contentDigest: string
        selection: { totalCents: number; deposit: { amountCents: number | null } } | null
      }
    }>()
    const approved = await app.inject({
      method: 'POST',
      url: `${url}/approve`,
      headers: {
        cookie,
        'idempotency-key': key('approve'),
        'x-forwarded-for': `2001:db8:68:${seq}::1`,
        'user-agent': 'SyntheticBrowser/1.0 (test)',
      },
      payload: {
        contentDigest: d.approval.contentDigest,
        options: [],
        totalCents: d.approval.selection?.totalCents ?? d.totalCents,
        depositCents: d.approval.selection?.deposit.amountCents ?? null,
        termsDocumentId: ESTIMATE_TERMS.documentId,
        termsSha256: ESTIMATE_TERMS.contentSha256,
        acceptTerms: true,
        fullName: 'Synthetic Checklist Customer',
      },
    })
    expect(approved.statusCode, approved.body).toBe(201)
    const packages = await t.db
      .selectFrom('work.work_packages')
      .selectAll()
      .where('project_id', '=', row.project_id)
      .orderBy('position')
      .execute()
    return { projectId: row.project_id, requestId: row.id, packages, customerCookie: cookie }
  } finally {
    // Back to NOT CONFIGURED: no estimate terms are in effect outside this fixture.
    await setConfig('legal.estimate_terms', null)
  }
}

type View = {
  workPackage: { id: string; serviceCode: string; jobId: string | null }
  pin: { state: string; pinnedAt: string | null; source: string | null }
  readiness: { ok: boolean; blockers: string[]; pendingReviewBanner: boolean }
  sop: {
    id: string
    sopId: string
    version: number
    reviewState: string
    current: boolean
    contentSha256: string
    hazardSha256: string
    qualitySha256: string
    rowVersion: number
    signOff: { reviewerName: string } | null
    stages: { key: string; steps: number; items: { id: string; kind: string; line: number | null; text: string }[] }[]
    hazards: { controls: { kind: string }[]; stopWork: unknown[] }
    openQuestions: unknown[]
  } | null
  actions: { signOff: boolean }
}
const sopView = async (who: Person, workPackageId: string) => {
  const res = await staffGet(who, `/api/v1/staff/work-packages/${workPackageId}/sop`)
  return { status: res.statusCode, body: res.json<View>() }
}
const ownerActor = (): StaffActor => ({
  kind: 'staff',
  userId: ids.owner,
  roles: ['owner'],
  capabilities: [],
  status: 'active',
  freshAuth: false,
})

let job: Awaited<ReturnType<typeof approvedJob>>
const dw = () => job.packages[0] as (typeof job.packages)[number]
const pt = () => job.packages[1] as (typeof job.packages)[number]

describe('[HH-PKT-03][T43] the approval pins the current SOP version on each work package of the job', () => {
  it('pins DW-01 with its exact version and digests, and records PT-01 as NOT CONFIGURED', async () => {
    job = await approvedJob()
    const version = await t.db
      .selectFrom('catalog.sop_versions')
      .selectAll()
      .where('sop_id', '=', 'SOP-DW-01')
      .executeTakeFirstOrThrow()
    expect(dw()).toMatchObject({ service_id: 'SVC-DW-01', sop_version_id: version.id })
    expect(dw().sop_pinned_at).not.toBeNull()
    expect(pt()).toMatchObject({ service_id: WITHOUT_SOP, sop_version_id: null, sop_pinned_at: null })
    const pins = await t.db
      .selectFrom('work.work_package_sop_pins')
      .selectAll()
      .where('project_id', '=', job.projectId)
      .orderBy('outcome')
      .execute()
    expect(pins.map((p) => [p.work_package_id, p.outcome, p.source])).toEqual([
      [pt().id, 'not_configured', 'approval'],
      [dw().id, 'pinned', 'approval'],
    ])
    expect(pins[1]).toMatchObject({
      sop_version_id: version.id,
      content_sha256: version.content_sha256,
      hazard_sha256: version.hazard_sha256,
      quality_sha256: version.quality_sha256,
    })
    // The record of a pinning is append-only.
    await expect(
      sql`UPDATE work.work_package_sop_pins SET source = 'import' WHERE work_package_id = ${dw().id}`.execute(t.db),
    ).rejects.toThrow(/APPEND_ONLY/)
  })

  it('[HH-WORK-11] the view shows the six stages verbatim with vault lines, the hazard and quality checks', async () => {
    const { status, body } = await sopView('owner', dw().id)
    expect(status).toBe(200)
    expect(body.pin).toMatchObject({ state: 'pinned', source: 'approval' })
    expect(body.pin.pinnedAt).not.toBeNull()
    expect(body.sop).toMatchObject({
      sopId: 'SOP-DW-01',
      version: 1,
      reviewState: 'pending_competent_review',
      current: true,
    })
    expect(body.sop?.stages.map((s) => s.key)).toEqual([
      'site_preparation',
      'setup_checks',
      'work_steps',
      'quality_checks',
      'cleanup_waste',
      'final_checks',
    ])
    // Every item is the seed's, in order: the checklist is never written or completed by the server.
    const seed = loadSopSeed().find((s) => s.id === 'SOP-DW-01')
    const seedStages = seed?.content.stages as { items: { id: string; line: number | null }[] }[]
    body.sop?.stages.forEach((s, i) =>
      expect(s.items.map((x) => [x.id, x.line])).toEqual(seedStages[i]?.items.map((x) => [x.id, x.line])),
    )
    expect(body.sop?.stages.every((s) => s.steps > 0)).toBe(true)
    expect(body.sop?.hazards.controls.length).toBeGreaterThan(0)
    expect(body.sop?.hazards.controls.every((c) => c.kind === 'control')).toBe(true)
    expect(body.sop?.hazards.stopWork.length).toBeGreaterThan(0)
    // ci runs like private staging: a version pending competent review runs under the banner.
    expect(body.readiness).toEqual({ ok: true, blockers: [], pendingReviewBanner: true })
    expect(body.actions.signOff).toBe(true)
  })

  it('[HH-PKT-03] NOT CONFIGURED has no checklist and cannot become ready', async () => {
    const { status, body } = await sopView('owner', pt().id)
    expect(status).toBe(200)
    expect(body.pin).toMatchObject({ state: 'not_configured', source: 'approval', pinnedAt: expect.any(String) })
    expect(body.sop).toBeNull()
    expect(body.readiness).toEqual({ ok: false, blockers: ['SOP_NOT_CONFIGURED'], pendingReviewBanner: false })
    expect(body.actions.signOff).toBe(false)
    // The database refuses a ready, started or complete package without a pinned SOP version. TSK-0073 (migration
    // 0074): a start is refused even earlier without its passing Start Work evaluation in the same transaction.
    for (const state of ['ready', 'in_progress', 'complete'])
      await expect(
        sql`UPDATE work.work_packages SET state = ${state} WHERE id = ${pt().id}`.execute(t.db),
      ).rejects.toThrow(state === 'in_progress' ? /only through the Start Work gate/ : /work_packages_sop_before_ready/)
  })

  it('[OWN-DEC-17] production needs the competent-review sign-off: pending review blocks there', async () => {
    const scope = dataScope(ownerActor(), 'job.view_packet', new Date())
    const prod = await workPackageSopView(t.db, ownerActor(), scope, dw().id, 'production')
    expect(prod.readiness).toEqual({ ok: false, blockers: ['SOP_PENDING_COMPETENT_REVIEW'], pendingReviewBanner: true })
    const staging = await workPackageSopView(t.db, ownerActor(), scope, dw().id, 'staging')
    expect(staging.readiness).toEqual({ ok: true, blockers: [], pendingReviewBanner: true })
  })

  it('[RULE-SERVER-AUTHZ] outside the record scope the package is not found; customers never reach it', async () => {
    // A worker reaches assigned jobs only, and no job assignment exists yet: the policy refuses.
    expect((await sopView('worker', dw().id)).status).toBe(403)
    expect((await sopView('owner', randomUUID())).status).toBe(404)
    const customer = await app.inject({
      method: 'GET',
      url: `/api/v1/staff/work-packages/${dw().id}/sop`,
      headers: { cookie: job.customerCookie },
    })
    expect([401, 403]).toContain(customer.statusCode)
  })

  it('[HH-PKT-03] an import pins the new SOP on a NOT CONFIGURED package of a planned job, once', async () => {
    const r = await syncSops(t.db, loadSopSeed())
    expect(r.created).toEqual(['SOP-PT-01'])
    expect(r.pinned).toBe(1)
    const { body } = await sopView('owner', pt().id)
    expect(body.pin).toMatchObject({ state: 'pinned', source: 'import' })
    expect(body.sop?.sopId).toBe('SOP-PT-01')
    expect(body.readiness.ok).toBe(true)
    expect((await syncSops(t.db, loadSopSeed())).pinned).toBe(0)
  })
})

describe('[OWN-DEC-17] the Owner records the competent reviewer’s sign-off', () => {
  const signOffUrl = (id: string) => `/api/v1/staff/sop-versions/${id}/sign-off`
  const REVIEW = {
    reviewerName: 'Synthetic Competent Reviewer',
    reviewerQualification: 'Synthetic qualified safety professional',
    reviewNote: 'Synthetic: reviewed this exact version for the test.',
  }

  it('is refused to anyone but the Owner, without the reviewer, or on a stale version', async () => {
    const { body } = await sopView('owner', dw().id)
    const sop = body.sop as NonNullable<View['sop']>
    const estimator = await staffWrite('estimator', signOffUrl(sop.id), REVIEW, sop.rowVersion)
    expect(estimator.statusCode).toBe(403)
    expect((await sopView('estimator', dw().id)).body.actions.signOff).toBe(false)
    const blank = await staffWrite(
      'owner',
      signOffUrl(sop.id),
      { reviewerName: ' ', reviewerQualification: '', reviewNote: '' },
      sop.rowVersion,
    )
    expect(blank.statusCode).toBe(409)
    expect(blank.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors.map((f) => f.code)).toEqual([
      'REVIEWER_REQUIRED',
      'QUALIFICATION_REQUIRED',
      'REASON_REQUIRED',
    ])
    const stale = await staffWrite('owner', signOffUrl(sop.id), REVIEW, sop.rowVersion + 5)
    expect(stale.statusCode).toBe(409)
    expect(stale.json<{ error: { code: string } }>().error.code).toBe('STALE_VERSION')
    const missing = await staffWrite('owner', signOffUrl(randomUUID()), REVIEW, 1)
    expect(missing.statusCode).toBe(404)
    expect((await sopView('owner', dw().id)).body.sop?.reviewState).toBe('pending_competent_review')
  })

  it('approves the version for production, is audited, and is recorded once', async () => {
    const { body } = await sopView('owner', dw().id)
    const sop = body.sop as NonNullable<View['sop']>
    const res = await staffWrite('owner', signOffUrl(sop.id), REVIEW, sop.rowVersion)
    expect(res.statusCode, res.body).toBe(200)
    expect(res.json()).toMatchObject({
      id: sop.id,
      sopId: 'SOP-DW-01',
      reviewState: 'approved',
      rowVersion: sop.rowVersion + 1,
    })
    const after = await sopView('owner', dw().id)
    expect(after.body.sop?.signOff).toMatchObject({ reviewerName: REVIEW.reviewerName })
    expect(after.body.readiness).toEqual({ ok: true, blockers: [], pendingReviewBanner: false })
    const scope = dataScope(ownerActor(), 'job.view_packet', new Date())
    expect((await workPackageSopView(t.db, ownerActor(), scope, dw().id, 'production')).readiness.ok).toBe(true)
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .selectAll()
      .where('action', '=', 'sop.sign_off')
      .where('target_id', '=', sop.id)
      .execute()
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ actor_kind: 'staff', actor_id: ids.owner, result: 'succeeded' })
    const again = await staffWrite('owner', signOffUrl(sop.id), REVIEW, sop.rowVersion + 1)
    expect(again.statusCode).toBe(409)
    expect(again.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors[0]?.code).toBe(
      'INVALID_TRANSITION',
    )
  })

  it('[HH-PKT-03] a later import is a new version pending review; the job keeps the exact version it pinned', async () => {
    const before = (await sopView('owner', dw().id)).body.sop as NonNullable<View['sop']>
    const changed = loadSopSeed().map((s) =>
      s.id === 'SOP-DW-01' ? { ...s, title: `${s.title} (synthetic change)`, contentSha256: 'b'.repeat(64) } : s,
    )
    expect((await syncSops(t.db, changed)).versioned).toEqual(['SOP-DW-01'])
    const after = (await sopView('owner', dw().id)).body
    expect(after.sop).toMatchObject({
      id: before.id,
      version: 1,
      reviewState: 'superseded',
      current: false,
      contentSha256: before.contentSha256,
      hazardSha256: before.hazardSha256,
      qualitySha256: before.qualitySha256,
    })
    // The pinned version keeps its own sign-off; the new one starts pending review and pins nothing already pinned.
    expect(after.readiness).toEqual({ ok: true, blockers: [], pendingReviewBanner: false })
    expect(after.actions.signOff).toBe(false)
    const next = await t.db
      .selectFrom('catalog.sop_versions')
      .select('id')
      .where('sop_id', '=', 'SOP-DW-01')
      .where('version', '=', 2)
      .executeTakeFirstOrThrow()
    await expect(
      sql`UPDATE work.work_packages SET sop_version_id = ${next.id} WHERE id = ${dw().id}`.execute(t.db),
    ).rejects.toThrow(/keeps the SOP version/)
  })
})
