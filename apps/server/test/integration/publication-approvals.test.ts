// Owner approval before publishing over the threshold, against PostgreSQL 16 (TSK-0130; HH-EST-16, HH-EST-04, T26,
// OWN-DEC-173 with the final owner amendments of 2026-10-22, FACT-OWNER-APPROVAL-THRESHOLD, FACT-MARGIN-TARGET,
// RULE-SERVER-AUTHZ, RULE-MONEY-CENTS). The threshold is the seeded configuration (250000 cents); staff, customers,
// requests, amounts, costs and the test terms document are synthetic (RULE-SYNTHETIC-DATA).
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { loadConfig, recordPolicyVersion, type ConfigKey } from '../../src/platform/config/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { testConfig } from '../fixtures/env.js'

const pw = (n: number) => ['synthetic', 'approval', 'passphrase', 'number', String(n)].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'worker'] as const
type Person = (typeof PEOPLE)[number]

let t: TestDatabase
let app: FastifyInstance
const storage = new FakeObjectStorage()
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const ids = {} as Record<Person, string>

async function signIn(p: Person): Promise<[string, string]> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email: `${p}-approval@example.test`, password: pw(1) },
  })
  expect(res.statusCode).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

const TEST_TERMS = {
  documentId: 'test-estimate-terms-1',
  status: 'draft',
  attorneyReviewed: false,
  preparedOn: '2026-10-21',
  contentSha256: '0'.repeat(64),
}

async function setConfig(key: ConfigKey, value: unknown, sourceIds = ['TEST-SYNTHETIC']) {
  await recordPolicyVersion(t.db, {
    key,
    value: value as never,
    sourceIds,
    changedBy: 'test',
    reason: 'synthetic test configuration',
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
        email: `${p}-approval@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: p,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
  })
  for (const p of PEOPLE) [cookies[p], csrf[p]] = await signIn(p)
  await setConfig('legal.estimate_terms', TEST_TERMS)
})
afterAll(async () => {
  await app?.close()
  await t?.drop()
})

let seq = 0
const key = (what: string) => `synthetic-${what}-${String(++seq).padStart(6, '0')}`
const get = (who: Person, url: string) => app.inject({ method: 'GET', url, headers: { cookie: cookies[who] } })
function write(who: Person, method: 'POST' | 'PUT', url: string, payload: unknown, version?: number) {
  return app.inject({
    method,
    url,
    payload: payload as object,
    headers: {
      cookie: cookies[who],
      'x-csrf-token': csrf[who],
      'idempotency-key': key('write'),
      ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    },
  })
}

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

let ip = 1
async function readyRequest() {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': key('submit'), 'x-forwarded-for': `198.51.100.${++ip}` },
    payload: {
      formVersion: 'test-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }, { serviceId: 'SVC-PT-01' }],
      notSure: false,
      description: 'Synthetic approval project.',
      answers: [],
      property: { street: `${seq} Synthetic Way`, city: 'Testville', state: 'ky', zip: '40000', propertyType: 'house' },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Synthetic Approval Customer',
        email: `approval-customer-${seq}@example.test`,
        phone: '(502) 555-0101',
        preferredChannel: 'email',
      },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.statusCode).toBe(201)
  const { reference } = res.json<{ reference: string }>()
  const row = await t.db
    .selectFrom('intake.requests')
    .select(['id', 'project_id', 'state_version'])
    .where('reference', '=', reference)
    .executeTakeFirstOrThrow()
  expect(
    (await write('owner', 'PUT', `/api/v1/staff/requests/${row.id}/qualification`, { checks: ALL_OK }, 0)).statusCode,
  ).toBe(200)
  const moved = await write(
    'owner',
    'POST',
    `/api/v1/staff/requests/${row.id}/actions/online-estimate`,
    { workPackages: ['SVC-DW-01', 'SVC-PT-01'] },
    row.state_version,
  )
  expect(moved.statusCode).toBe(200)
  const project = await t.db
    .selectFrom('crm.projects')
    .select('reference')
    .where('id', '=', row.project_id)
    .executeTakeFirstOrThrow()
  return { id: row.id, projectId: row.project_id, reference: project.reference }
}

type Record_ = {
  id: string
  state: string
  basis: string
  reasons: string[]
  flags: string[]
  proposedTotalCents: number
  highestTotalCents: number | null
  discount: { category: string | null; amountCents: number } | null
  combinedProjectCents: number
  thresholdCents: number | null
  thresholdVersion: number | null
  linked: { reference: string; version: number; state: string; valueCents: number }[]
  costs: {
    laborCents: number | null
    materialCents: number | null
    complete: boolean
    grossProfitCents: number | null
    marginBps: number | null
  } | null
  requestedBy: { id: string; name: string | null }
  decidedBy: { id: string; name: string | null } | null
  comment: string | null
  invalidatedReason: string | null
  usedAt: string | null
  rowVersion: number
}
type OwnerApproval = {
  status: string
  evaluation: {
    required: boolean
    reasons: string[]
    thresholdCents: number | null
    proposedTotalCents: number
    combinedProjectCents: number
    linked: { reference: string; valueCents: number }[]
  } | null
  pendingApprovalId: string | null
  records: Record_[]
  actions: { request: boolean; decide: boolean; publishApproves: boolean }
}
type View = {
  id: string
  estimateNumber: string
  version: number
  state: string
  rowVersion: number
  workPackages: { id: string }[]
  readiness: { ready: boolean }
  ownerApproval: OwnerApproval | null
}
const view = async (who: Person, versionId: string) => {
  const res = await get(who, `/api/v1/staff/estimate-versions/${versionId}`)
  expect(res.statusCode).toBe(200)
  return res.json<View>()
}

type Line = { price: number; labor?: number; material?: number; kind?: 'base' | 'add_on' }
const lines = (packages: { id: string }[], list: Line[]) =>
  list.map((l, i) => ({
    kind: l.kind ?? 'base',
    workPackageId: packages[i % 2]?.id,
    description: `Synthetic line ${i + 1}`,
    quantity: '1',
    unit: 'job',
    unitPriceCents: l.price,
    ...(l.labor !== undefined || l.material !== undefined
      ? { internalCost: { laborCostCents: l.labor ?? null, materialCostCents: l.material ?? null } }
      : {}),
  }))

async function draftIn(projectId: string, list: Line[], who: Person = 'estimator', discountCategory?: string) {
  const res = await write(who, 'POST', `/api/v1/staff/projects/${projectId}/estimates`, {})
  expect(res.statusCode).toBe(201)
  const created = res.json<{ versionId: string; number: string }>()
  const v = await view(who, created.versionId)
  const saved = await save(who, created.versionId, v, list, discountCategory)
  return { versionId: created.versionId, number: created.number, view: saved }
}
async function save(who: Person, versionId: string, v: View, list: Line[], discountCategory?: string) {
  const res = await write(
    who,
    'PUT',
    `/api/v1/staff/estimate-versions/${versionId}/draft`,
    {
      lines: lines(v.workPackages, list),
      texts: { exclusions: ['Synthetic: moving furniture'] },
      ...(discountCategory ? { discountCategory } : {}),
    },
    v.rowVersion,
  )
  expect(res.statusCode).toBe(200)
  const out = res.json<View>()
  expect(out.readiness.ready).toBe(true)
  return out
}
async function draft(list: Line[], who: Person = 'estimator', discountCategory?: string) {
  const r = await readyRequest()
  return { ...r, ...(await draftIn(r.projectId, list, who, discountCategory)) }
}

const publish = (who: Person, versionId: string, rowVersion: number) =>
  write(who, 'POST', `/api/v1/staff/estimate-versions/${versionId}/publish`, {}, rowVersion)
const ask = (who: Person, versionId: string, rowVersion: number) =>
  write(who, 'POST', `/api/v1/staff/estimate-versions/${versionId}/owner-approval`, {}, rowVersion)
const decide = (
  who: Person,
  approvalId: string,
  rowVersion: number,
  decision: 'approve' | 'reject',
  comment?: string,
) =>
  write(
    who,
    'POST',
    `/api/v1/staff/publication-approvals/${approvalId}/decision`,
    { decision, ...(comment === undefined ? {} : { comment }) },
    rowVersion,
  )
const codes = (res: { json: () => unknown }) =>
  (res.json() as { error: { fieldErrors: { field: string; code: string }[] } }).error.fieldErrors.map((f) => [
    f.field,
    f.code,
  ])
const stateOf = async (id: string) =>
  (await t.db.selectFrom('estimating.estimate_versions').select('state').where('id', '=', id).executeTakeFirstOrThrow())
    .state
const auditActions = (targetId: string) =>
  t.db
    .selectFrom('platform.audit_events')
    .select(['action', 'actor_id', 'reason', 'summary', 'request_id'])
    .where('target_id', '=', targetId)
    .orderBy('seq')
    .execute()
const ownerDecisions = async (reference: string) =>
  (await get('owner', `/api/v1/staff/queue/owner-decisions?reference=${encodeURIComponent(reference)}`)).json<{
    items: { type: string; reason: string; subjectId: string; link: string }[]
  }>().items

describe('[HH-EST-16][FACT-OWNER-APPROVAL-THRESHOLD] the threshold boundary, "greater than" 250000 cents', () => {
  it('[HH-EST-16] the seeded threshold is 250000 cents, read by the Owner only', async () => {
    const res = await get('owner', '/api/v1/staff/settings/approval-threshold')
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      state: 'CONFIGURED',
      version: 1,
      thresholdCents: 250_000,
      sourceIds: ['FACT-OWNER-APPROVAL-THRESHOLD', 'OWN-DEC-173'],
    })
    for (const who of ['estimator', 'office', 'worker'] as const)
      expect((await get(who, '/api/v1/staff/settings/approval-threshold')).statusCode, who).toBe(403)
  })

  it('[HH-EST-16] exactly $2,500.00: no approval, the Estimator publishes directly', async () => {
    const d = await draft([{ price: 250_000 }])
    expect(d.view.ownerApproval).toMatchObject({
      status: 'not_required',
      evaluation: { required: false, reasons: [], thresholdCents: 250_000, proposedTotalCents: 250_000 },
      actions: { request: false },
    })
    expect((await publish('estimator', d.versionId, d.view.rowVersion)).statusCode).toBe(200)
    expect(await stateOf(d.versionId)).toBe('published')
  })

  it('[HH-EST-16][T26] $2,500.01: the Estimator is refused on the server without the Owner; nothing is published', async () => {
    const d = await draft([{ price: 250_001 }])
    expect(d.view.ownerApproval).toMatchObject({
      status: 'required',
      evaluation: { required: true, reasons: ['over_threshold'] },
      actions: { request: true, decide: false, publishApproves: false },
    })
    const res = await publish('estimator', d.versionId, d.view.rowVersion)
    expect(res.statusCode).toBe(409)
    expect(codes(res)).toEqual([
      ['ownerApproval', 'OWNER_APPROVAL_REQUIRED'],
      ['ownerApproval.reasons', 'over_threshold'],
    ])
    expect(await stateOf(d.versionId)).toBe('draft')
  })

  it('[HH-EST-16] after the decided 10% discount the final total is compared, not the subtotal', async () => {
    // $2,700.00 less 10% = $2,430.00: no approval.
    const under = await draft([{ price: 270_000 }], 'estimator', 'military')
    expect(under.view.ownerApproval?.evaluation).toMatchObject({ required: false, proposedTotalCents: 243_000 })
    expect((await publish('estimator', under.versionId, under.view.rowVersion)).statusCode).toBe(200)
    // $2,800.00 less 10% = $2,520.00: over; the queue shows the discount row.
    const over = await draft([{ price: 280_000 }], 'estimator', 'military')
    expect(over.view.ownerApproval?.evaluation).toMatchObject({ required: true, proposedTotalCents: 252_000 })
    const asked = await ask('estimator', over.versionId, over.view.rowVersion)
    expect(asked.statusCode).toBe(200)
    const record = asked.json<View>().ownerApproval?.records[0]
    expect(record).toMatchObject({
      discount: { category: 'military', amountCents: 28_000 },
      proposedTotalCents: 252_000,
    })
  })

  it('[HH-EST-16] an option that would carry the approved total over the threshold needs the Owner (PROPOSED)', async () => {
    const d = await draft([{ price: 200_000 }, { price: 60_000, kind: 'add_on' }])
    expect(d.view.ownerApproval?.evaluation).toMatchObject({
      required: true,
      reasons: ['options_over_threshold'],
      proposedTotalCents: 200_000,
    })
  })
})

describe('[HH-EST-16] the approval queue, the Owner decision and publishing the approved version', () => {
  it('[HH-EST-16][T26] request, Owner Decisions item, Owner approves with a comment, the Estimator publishes', async () => {
    const d = await draft([{ price: 300_000, labor: 150_000, material: 50_000 }])
    // Office and the Worker cannot ask; the Estimator asks.
    expect((await ask('office', d.versionId, d.view.rowVersion)).statusCode).toBe(403)
    const asked = await ask('estimator', d.versionId, d.view.rowVersion)
    expect(asked.statusCode).toBe(200)
    const oa = asked.json<View>().ownerApproval as OwnerApproval
    expect(oa).toMatchObject({ status: 'pending', actions: { request: false, decide: false } })
    const approvalId = oa.pendingApprovalId as string
    // Asking again for the same content returns the same record.
    const again = await ask('estimator', d.versionId, asked.json<View>().rowVersion)
    expect(again.json<View>().ownerApproval?.pendingApprovalId).toBe(approvalId)
    expect(codes(await publish('estimator', d.versionId, d.view.rowVersion))[0]).toEqual([
      'ownerApproval',
      'OWNER_APPROVAL_PENDING',
    ])

    // Owner Decisions: the item, and the approval queue with the fields of HH-EST-16; margin from complete costs.
    const items = await ownerDecisions(d.reference)
    expect(items).toEqual([
      expect.objectContaining({
        type: 'estimate_publication_approval',
        reason: 'over_threshold',
        subjectId: d.versionId,
        link: `/estimates/${d.versionId}`,
      }),
    ])
    for (const who of ['office', 'estimator'] as const) {
      expect((await get(who, '/api/v1/staff/publication-approvals')).statusCode, who).toBe(403)
      const mine = await get(who, `/api/v1/staff/queue/owner-decisions?reference=${d.reference}`)
      expect(mine.statusCode, who).toBe(403)
    }
    const queue = (await get('owner', '/api/v1/staff/publication-approvals')).json<{ items: Record_[] }>().items
    const entry = queue.find((q) => q.id === approvalId)
    expect(entry).toMatchObject({
      state: 'pending',
      basis: 'request',
      reasons: ['over_threshold'],
      proposedTotalCents: 300_000,
      discount: null,
      thresholdCents: 250_000,
      thresholdVersion: 1,
      requestedBy: { id: ids.estimator, name: 'Synthetic estimator' },
      costs: { laborCents: 150_000, materialCents: 50_000, complete: true, grossProfitCents: 100_000, marginBps: 3333 },
    })

    // Only the Owner decides; a decision needs a written comment.
    expect((await decide('estimator', approvalId, 1, 'approve', 'mine')).statusCode).toBe(403)
    expect((await decide('office', approvalId, 1, 'approve', 'mine')).statusCode).toBe(403)
    expect(codes(await decide('owner', approvalId, 1, 'approve'))).toEqual([['comment', 'COMMENT_REQUIRED']])
    const decided = await decide('owner', approvalId, 1, 'approve', 'Synthetic: price checked against the scope.')
    expect(decided.statusCode).toBe(200)
    expect(decided.json()).toMatchObject({
      state: 'approved',
      decidedBy: { id: ids.owner },
      comment: 'Synthetic: price checked against the scope.',
      usedAt: null,
    })
    expect(await ownerDecisions(d.reference)).toEqual([])
    expect((await decide('owner', approvalId, 2, 'reject', 'too late')).json()).toMatchObject({
      error: { fieldErrors: [{ field: 'state', code: 'APPROVAL_NOT_PENDING' }] },
    })

    const current = await view('estimator', d.versionId)
    expect(current.ownerApproval?.status).toBe('approved')
    const published = await publish('estimator', d.versionId, current.rowVersion)
    expect(published.statusCode).toBe(200)
    const used = await t.db
      .selectFrom('estimating.publication_approvals')
      .select(['state', 'used_at', 'decision_comment', 'document_version'])
      .where('id', '=', approvalId)
      .executeTakeFirstOrThrow()
    expect(used).toMatchObject({ state: 'approved', document_version: 1 })
    expect(used.used_at).not.toBeNull()
    const audit = await auditActions(approvalId)
    expect(audit.map((a) => a.action)).toEqual([
      'publication_approval.request',
      'publication_approval.request',
      'publication_approval.approve',
    ])
    expect(audit[2]).toMatchObject({ actor_id: ids.owner, reason: 'Synthetic: price checked against the scope.' })
    const publishAudit = await auditActions(d.versionId)
    expect(publishAudit.at(-1)?.summary).toMatchObject({ ownerApproval: { approvalId, basis: 'request' } })
  })

  it("[HH-EST-16] a rejection keeps the version unpublished, with the Owner's comment", async () => {
    const d = await draft([{ price: 260_000 }])
    const oa = (await ask('estimator', d.versionId, d.view.rowVersion)).json<View>().ownerApproval as OwnerApproval
    const rejected = await decide('owner', oa.pendingApprovalId as string, 1, 'reject', 'Synthetic: recheck the scope.')
    expect(rejected.statusCode).toBe(200)
    const v = await view('estimator', d.versionId)
    expect(v.ownerApproval).toMatchObject({ status: 'rejected', actions: { request: true } })
    expect(v.ownerApproval?.records[0]).toMatchObject({ state: 'rejected', comment: 'Synthetic: recheck the scope.' })
    expect(codes(await publish('estimator', d.versionId, v.rowVersion))[0]).toEqual([
      'ownerApproval',
      'OWNER_APPROVAL_REJECTED',
    ])
  })

  it('[HH-EST-16] any later change of price or scope invalidates the approval; an unchanged save keeps it', async () => {
    const d = await draft([{ price: 300_000 }])
    const oa = (await ask('estimator', d.versionId, d.view.rowVersion)).json<View>().ownerApproval as OwnerApproval
    const approvalId = oa.pendingApprovalId as string
    expect((await decide('owner', approvalId, 1, 'approve', 'Synthetic approval.')).statusCode).toBe(200)
    // The same content saved again: still approved.
    let v = await view('estimator', d.versionId)
    v = await save('estimator', d.versionId, v, [{ price: 300_000 }])
    expect(v.ownerApproval?.status).toBe('approved')
    // A price change after the approval: invalidated, and publishing needs a new approval.
    v = await save('estimator', d.versionId, v, [{ price: 299_000 }])
    expect(v.ownerApproval?.status).toBe('required')
    expect(v.ownerApproval?.records[0]).toMatchObject({
      id: approvalId,
      state: 'invalidated',
      invalidatedReason: 'content_changed',
    })
    expect(codes(await publish('estimator', d.versionId, v.rowVersion))[0]).toEqual([
      'ownerApproval',
      'OWNER_APPROVAL_REQUIRED',
    ])
    expect((await auditActions(approvalId)).map((a) => a.action)).toContain('publication_approval.invalidate')
    // A scope change (an exclusion) invalidates a pending request as well, and resolves its item.
    const asked = (await ask('estimator', d.versionId, v.rowVersion)).json<View>()
    expect(await ownerDecisions(d.reference)).toHaveLength(1)
    const res = await write(
      'estimator',
      'PUT',
      `/api/v1/staff/estimate-versions/${d.versionId}/draft`,
      {
        lines: lines(v.workPackages, [{ price: 299_000 }]),
        texts: { exclusions: ['Synthetic: a different exclusion'] },
      },
      asked.rowVersion,
    )
    expect(res.json<View>().ownerApproval?.records[0]).toMatchObject({ state: 'invalidated' })
    expect(await ownerDecisions(d.reference)).toEqual([])
  })
})

describe("[HH-EST-16] the Owner's own publication counts as approval, with its evidence", () => {
  it('[HH-EST-16] an Owner-created and Owner-published estimate over the threshold writes an approval record and audit', async () => {
    const d = await draft([{ price: 400_000 }], 'owner')
    expect(d.view.ownerApproval).toMatchObject({
      status: 'required',
      actions: { request: false, decide: false, publishApproves: true },
    })
    const res = await publish('owner', d.versionId, d.view.rowVersion)
    expect(res.statusCode).toBe(200)
    const record = await t.db
      .selectFrom('estimating.publication_approvals')
      .selectAll()
      .where('subject_id', '=', d.versionId)
      .executeTakeFirstOrThrow()
    expect(record).toMatchObject({ state: 'approved', basis: 'owner_publication', decided_by: ids.owner })
    expect(record.used_at).not.toBeNull()
    const approvalAudit = await auditActions(record.id)
    const publishAudit = (await auditActions(d.versionId)).find((a) => a.action === 'estimate.publish')
    expect(approvalAudit.map((a) => a.action)).toEqual(['publication_approval.approve'])
    // The same transaction (request) as the publication.
    expect(approvalAudit[0]?.request_id).toBe(publishAudit?.request_id)
  })

  it('[HH-EST-16] the Owner publishing a version an Estimator asked about decides that request', async () => {
    const d = await draft([{ price: 260_000 }])
    const asked = (await ask('estimator', d.versionId, d.view.rowVersion)).json<View>()
    const approvalId = asked.ownerApproval?.pendingApprovalId as string
    const owner = await view('owner', d.versionId)
    expect(owner.ownerApproval?.actions).toEqual({ request: false, decide: true, publishApproves: true })
    expect((await publish('owner', d.versionId, owner.rowVersion)).statusCode).toBe(200)
    const row = await t.db
      .selectFrom('estimating.publication_approvals')
      .select(['state', 'basis', 'decided_by', 'used_at'])
      .where('id', '=', approvalId)
      .executeTakeFirstOrThrow()
    expect(row).toMatchObject({ state: 'approved', basis: 'request', decided_by: ids.owner })
    expect(await ownerDecisions(d.reference)).toEqual([])
  })
})

describe("[HH-EST-16] splitting: the project's documents across their history", () => {
  it('[HH-EST-16] a second estimate of the same project that brings the total over the threshold needs the Owner', async () => {
    const first = await draft([{ price: 150_000 }])
    expect((await publish('estimator', first.versionId, first.view.rowVersion)).statusCode).toBe(200)
    const second = await draftIn(first.projectId, [{ price: 110_000 }])
    expect(second.view.ownerApproval?.evaluation).toMatchObject({
      required: true,
      reasons: ['combined_project_total'],
      combinedProjectCents: 260_000,
      linked: [{ reference: first.number, valueCents: 150_000 }],
    })
    expect(codes(await publish('estimator', second.versionId, second.view.rowVersion))[0]).toEqual([
      'ownerApproval',
      'OWNER_APPROVAL_REQUIRED',
    ])
    // Expired: still part of the project's history (no validity window).
    const p = await view('estimator', first.versionId)
    expect(
      (
        await write(
          'estimator',
          'POST',
          `/api/v1/staff/estimate-versions/${first.versionId}/expire`,
          { reason: 'Synthetic' },
          p.rowVersion,
        )
      ).statusCode,
    ).toBe(200)
    expect((await view('estimator', second.versionId)).ownerApproval?.status).toBe('required')
  })

  it('[HH-EST-16] a revision is not counted twice; a withdrawn estimate is no longer counted (PROPOSED)', async () => {
    const first = await draft([{ price: 150_000 }])
    expect((await publish('estimator', first.versionId, first.view.rowVersion)).statusCode).toBe(200)
    // Version 2 of the same estimate: its own version 1 is never added to it.
    const revised = await write('estimator', 'POST', `/api/v1/staff/estimate-versions/${first.versionId}/revise`, {})
    expect(revised.statusCode).toBe(201)
    const v2 = await view('estimator', revised.json<{ versionId: string }>().versionId)
    expect(v2.ownerApproval?.evaluation).toMatchObject({ required: false, combinedProjectCents: 150_000, linked: [] })
    // Another estimate while the first is published: over together; after withdrawing the first, not.
    const second = await draftIn(first.projectId, [{ price: 110_000 }])
    expect(second.view.ownerApproval?.status).toBe('required')
    const p = await view('estimator', first.versionId)
    const withdrawn = await write(
      'estimator',
      'POST',
      `/api/v1/staff/estimate-versions/${first.versionId}/withdraw`,
      { reason: 'Synthetic' },
      p.rowVersion,
    )
    expect(withdrawn.statusCode).toBe(200)
    expect((await view('estimator', second.versionId)).ownerApproval?.status).toBe('not_required')
  })
})

describe('[HH-EST-16][FACT-MARGIN-TARGET] flags and margin data from costs that exist', () => {
  it('[HH-EST-16] a negative margin from the known costs needs the Owner at any total', async () => {
    const d = await draft([{ price: 100_000, labor: 90_000, material: 20_000 }])
    expect(d.view.ownerApproval?.evaluation).toMatchObject({ required: true, reasons: ['negative_margin'] })
    const oa = (await ask('estimator', d.versionId, d.view.rowVersion)).json<View>().ownerApproval as OwnerApproval
    expect(oa.records[0]?.costs).toEqual({
      laborCents: 90_000,
      materialCents: 20_000,
      complete: true,
      grossProfitCents: -10_000,
      marginBps: -1000,
    })
  })

  it('[FACT-MARGIN-TARGET] no costs: no margin; incomplete costs: known costs without a final margin', async () => {
    const none = await draft([{ price: 300_000 }])
    const a = (await ask('estimator', none.versionId, none.view.rowVersion)).json<View>().ownerApproval as OwnerApproval
    expect(a.records[0]?.costs).toBeNull()
    const partial = await draft([{ price: 300_000, labor: 100_000 }])
    const b = (await ask('estimator', partial.versionId, partial.view.rowVersion)).json<View>()
      .ownerApproval as OwnerApproval
    expect(b.records[0]?.costs).toEqual({
      laborCents: 100_000,
      materialCents: null,
      complete: false,
      grossProfitCents: null,
      marginBps: null,
    })
  })
})

describe('[HH-EST-16] the threshold is Owner configuration, versioned and audited', () => {
  it('[HH-EST-16][T26] only the Owner changes it, with a reason; the next publication is decided under it', async () => {
    const before = await get('owner', '/api/v1/staff/settings/approval-threshold')
    const body = { thresholdCents: 300_000, reason: 'Synthetic: growth test.' }
    expect((await write('estimator', 'PUT', '/api/v1/staff/settings/approval-threshold', body, 1)).statusCode).toBe(403)
    expect((await write('office', 'PUT', '/api/v1/staff/settings/approval-threshold', body, 1)).statusCode).toBe(403)
    expect(
      (await write('owner', 'PUT', '/api/v1/staff/settings/approval-threshold', { thresholdCents: 300_000 }, 1))
        .statusCode,
    ).toBe(400)
    const changed = await write(
      'owner',
      'PUT',
      '/api/v1/staff/settings/approval-threshold',
      body,
      before.json<{ version: number }>().version,
    )
    expect(changed.statusCode).toBe(200)
    expect(changed.json()).toMatchObject({ state: 'CONFIGURED', version: 2, thresholdCents: 300_000 })
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary', 'reason', 'actor_id'])
      .where('action', '=', 'publication_approval.change_threshold')
      .executeTakeFirstOrThrow()
    expect(audit).toMatchObject({
      actor_id: ids.owner,
      reason: 'Synthetic: growth test.',
      summary: { fromCents: 250_000, toCents: 300_000, previousVersion: 1 },
    })
    const d = await draft([{ price: 250_001 }])
    expect(d.view.ownerApproval?.evaluation).toMatchObject({ required: false, thresholdCents: 300_000 })
    expect((await publish('estimator', d.versionId, d.view.rowVersion)).statusCode).toBe(200)
    // Restored for the rest of the file (a new version again).
    const restored = await write(
      'owner',
      'PUT',
      '/api/v1/staff/settings/approval-threshold',
      { thresholdCents: 250_000, reason: 'Synthetic: restore.' },
      2,
    )
    expect(restored.json()).toMatchObject({ version: 3, thresholdCents: 250_000 })
    expect((await loadConfig(t.db)).get('owner_approval.threshold')).toMatchObject({ version: 3 })
  })
})

describe('[HH-EST-16][RULE-SERVER-AUTHZ] the database backstop and the append-only record', () => {
  it('[HH-EST-16] a version over the threshold cannot become published without a used approval', async () => {
    const d = await draft([{ price: 260_000 }])
    await expect(
      sql`UPDATE estimating.estimate_versions SET state = 'published', published_at = now() WHERE id = ${d.versionId}`.execute(
        t.db,
      ),
    ).rejects.toThrow(/Owner's approval/)
  })

  it('[HH-EST-16] an approval keeps what the Owner was shown and is never deleted', async () => {
    const d = await draft([{ price: 260_000 }])
    const oa = (await ask('estimator', d.versionId, d.view.rowVersion)).json<View>().ownerApproval as OwnerApproval
    const id = oa.pendingApprovalId as string
    await expect(
      sql`UPDATE estimating.publication_approvals SET proposed_total_cents = 1, row_version = row_version + 1 WHERE id = ${id}`.execute(
        t.db,
      ),
    ).rejects.toThrow(/keeps what the Owner was shown/)
    await expect(sql`DELETE FROM estimating.publication_approvals WHERE id = ${id}`.execute(t.db)).rejects.toThrow(
      /never deleted/,
    )
  })
})
