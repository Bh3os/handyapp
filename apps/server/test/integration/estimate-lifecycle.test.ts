// The estimate lifecycle against PostgreSQL 16 and the provider fakes (TSK-0055; HH-EST-04, HH-STATE-01, T26, T32,
// OWN-DEC-102, OWN-DEC-103, OWN-DEC-118, FACT-AUTOMATIC-MESSAGES, RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS). Staff,
// customers, requests, amounts and the test terms document are synthetic (RULE-SYNTHETIC-DATA); nothing reaches a
// real provider.
import { createHash } from 'node:crypto'
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { estimateValidUntil, zonedParts } from '@handyhub/domain'
import type { StaffActor } from '@handyhub/policy'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiError } from '../../src/api/errors.js'
import { buildApp } from '../../src/app.js'
import {
  acceptanceCheck,
  customerPdfInput,
  estimateExpiryAutomation,
  estimateReadyAutomation,
  expireIfDue,
  publishVersion,
  renderCustomerPdf,
} from '../../src/modules/estimates/index.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { estimateToWriteQueueAutomation } from '../../src/modules/queue/index.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { loadConfig, recordPolicyVersion, type ConfigKey } from '../../src/platform/config/index.js'
import { createWorker, scheduleJob } from '../../src/platform/jobs.js'
import { createProviders } from '../../src/providers/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { readProviderSettings } from '../../src/providers/settings.js'
import { testConfig } from '../fixtures/env.js'

const pw = (n: number) => ['synthetic', 'lifecycle', 'passphrase', 'number', String(n)].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'estimator2', 'worker'] as const
type Person = (typeof PEOPLE)[number]
const roleOf = (p: Person) => p.replace(/2$/, '') as 'owner' | 'office' | 'estimator' | 'worker'

let t: TestDatabase
let app: FastifyInstance
const storage = new FakeObjectStorage()
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const staff = {} as Record<Person, StaffActor>

async function signIn(p: Person): Promise<[string, string]> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email: `${p}-lifecycle@example.test`, password: pw(1) },
  })
  expect(res.statusCode).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

/** A synthetic test terms document (never real wording, never attorney-reviewed): lets a version become ready. */
const TEST_TERMS = {
  documentId: 'test-estimate-terms-1',
  status: 'draft',
  attorneyReviewed: false,
  preparedOn: '2026-10-21',
  contentSha256: '0'.repeat(64),
}

/** Records a new active version of a key (null: NOT CONFIGURED) and returns a function that restores the old value. */
async function setConfig(key: ConfigKey, value: unknown, sourceIds = ['TEST-SYNTHETIC']) {
  const before = (await loadConfig(t.db)).get(key)
  await recordPolicyVersion(t.db, {
    key,
    value: value as never,
    sourceIds,
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
  return async () => {
    await recordPolicyVersion(t.db, {
      key,
      value: (before.state === 'CONFIGURED' ? before.value : null) as never,
      sourceIds: before.sourceIds.length ? [...before.sourceIds] : ['TEST-SYNTHETIC'],
      changedBy: 'test',
      reason: 'restore after a synthetic test',
    })
  }
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, storage } })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: `${p}-lifecycle@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: roleOf(p),
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      staff[p] = {
        kind: 'staff',
        userId: user.id,
        roles: [roleOf(p)],
        capabilities: [],
        status: 'active',
        freshAuth: false,
      }
    }
  })
  for (const p of PEOPLE) [cookies[p], csrf[p]] = await signIn(p)
  // Terms v1.0 is not recorded yet (TSK-0056): this file publishes under a synthetic test-only terms document.
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
/** A synthetic request through the public API, qualified and moved on with Prepare Online Estimate (TSK-0042). */
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
      description: 'Synthetic lifecycle project.',
      answers: [],
      property: { street: `${seq} Synthetic Way`, city: 'Testville', state: 'ky', zip: '40000', propertyType: 'house' },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Synthetic Lifecycle Customer',
        email: `lifecycle-customer-${seq}@example.test`,
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
  return { id: row.id, projectId: row.project_id, reference }
}

type Lifecycle = {
  effectiveState: string
  publishedAt: string | null
  publishedBy: { id: string; name: string | null } | null
  validUntil: string | null
  termsVersion: string | null
  customerPdf: { sha256: string; byteSize: number } | null
  revisedFrom: { versionId: string; version: number } | null
  current: { versionId: string; version: number } | null
  actions: Record<
    'publish' | 'requestReview' | 'returnToDraft' | 'withdraw' | 'expire' | 'recordDecline' | 'revise',
    boolean
  >
  history: {
    versionId: string
    version: number
    state: string
    createdBy: { id: string; name: string | null }
    revisedFromVersion: number | null
    lastEditedBy: { id: string; name: string | null }
    publishedBy: { id: string; name: string | null } | null
    publishedAt: string | null
    validUntil: string | null
    totalCents: number | null
  }[]
}
type View = {
  id: string
  estimateId: string
  estimateNumber: string
  version: number
  state: string
  rowVersion: number
  workPackages: { id: string; serviceCode: string }[]
  totals: { totalCents: number } | null
  readiness: { ready: boolean; problems: { code: string; key?: string; line?: number }[] }
  lines: { description: string | null; unitPriceCents: number | null }[]
  canEdit: boolean
  lifecycle: Lifecycle
}
const view = async (who: Person, versionId: string) => {
  const res = await get(who, `/api/v1/staff/estimate-versions/${versionId}`)
  expect(res.statusCode).toBe(200)
  return res.json<View>()
}

const LINES = (packages: { id: string }[], price = 125_000) => [
  {
    kind: 'base',
    workPackageId: packages[0]?.id,
    description: 'Patch the synthetic hole',
    quantity: '2.5',
    unit: 'sq ft',
    quantitySource: 'measured_on_site',
    unitPriceCents: 3333,
  },
  {
    kind: 'base',
    workPackageId: packages[1]?.id,
    description: 'Paint the synthetic wall',
    quantity: '1',
    unit: 'room',
    unitPriceCents: price,
  },
  {
    kind: 'add_on',
    workPackageId: packages[1]?.id,
    description: 'Synthetic optional trim',
    quantity: '3',
    unit: 'door',
    unitPriceCents: 1999,
  },
]

/** A written draft with complete lines, ready to publish under the test terms. */
async function readyDraft(who: Person = 'estimator') {
  const r = await readyRequest()
  const res = await write(who, 'POST', `/api/v1/staff/projects/${r.projectId}/estimates`, {})
  expect(res.statusCode).toBe(201)
  const created = res.json<{ estimateId: string; number: string; versionId: string }>()
  const v = await view(who, created.versionId)
  const saved = await write(
    who,
    'PUT',
    `/api/v1/staff/estimate-versions/${created.versionId}/draft`,
    { lines: LINES(v.workPackages), texts: { exclusions: ['Synthetic: moving furniture'] } },
    v.rowVersion,
  )
  expect(saved.statusCode).toBe(200)
  const ready = saved.json<View>()
  expect(ready.readiness).toEqual({ ready: true, problems: [] })
  return { ...r, ...created, view: ready }
}

const publish = (who: Person, versionId: string, rowVersion: number) =>
  write(who, 'POST', `/api/v1/staff/estimate-versions/${versionId}/publish`, {}, rowVersion)

const versionRow = (id: string) =>
  t.db.selectFrom('estimating.estimate_versions').selectAll().where('id', '=', id).executeTakeFirstOrThrow()
const auditOf = (id: string) =>
  t.db
    .selectFrom('platform.audit_events')
    .select(['action', 'actor_kind', 'actor_id', 'summary', 'reason'])
    .where('target_id', '=', id)
    .orderBy('seq')
    .execute()

describe("[HH-EST-04][T26][OWN-DEC-118] publishing permission per role, under the Owner's publishing policy", () => {
  it('a Worker and an Office user are refused on the server; nothing changes', async () => {
    const d = await readyDraft()
    for (const who of ['worker', 'office'] as const) {
      const res = await publish(who, d.versionId, d.view.rowVersion)
      expect(res.statusCode, who).toBe(403)
    }
    expect((await versionRow(d.versionId)).state).toBe('draft')
    // The Worker cannot even read the version; Office reads it (request.view) but holds no lifecycle action.
    expect((await get('worker', `/api/v1/staff/estimate-versions/${d.versionId}`)).statusCode).toBe(403)
    expect((await auditOf(d.versionId)).map((a) => a.action)).not.toContain('estimate.publish')
  })

  it('an Estimator publishes directly while the policy grants it, with no owner approval per estimate', async () => {
    const d = await readyDraft()
    expect(d.view.lifecycle.actions.publish).toBe(true)
    const res = await publish('estimator', d.versionId, d.view.rowVersion)
    expect(res.statusCode).toBe(200)
    const v = res.json<View>()
    expect(v).toMatchObject({ state: 'published', canEdit: false })
    expect(v.lifecycle.publishedBy).toEqual({ id: staff.estimator.userId, name: 'Synthetic estimator' })
    const audit = await auditOf(d.versionId)
    expect(audit.map((a) => a.action)).toEqual(['estimate.create', 'estimate.save_draft', 'estimate.publish'])
    expect(audit[2]).toMatchObject({ actor_kind: 'staff', actor_id: staff.estimator.userId })
    expect(audit[2]?.summary).toMatchObject({ version: 1, termsVersion: TEST_TERMS.documentId, superseded: null })
  })

  it("[T26] after the Owner removes the Estimator's permission, the Estimator's next publish is refused", async () => {
    const before = await get('owner', '/api/v1/staff/settings/estimate-publishing')
    expect(before.statusCode).toBe(200)
    expect(before.json()).toMatchObject({ roles: ['owner', 'estimator'], estimatorsMayPublish: true })
    const etag = Number(String(before.headers['etag']).replace(/"/g, ''))
    // Only the Owner changes who may publish.
    for (const who of ['estimator', 'office', 'worker'] as const) {
      expect((await get(who, '/api/v1/staff/settings/estimate-publishing')).statusCode, who).toBe(403)
      const res = await write(
        who,
        'PUT',
        '/api/v1/staff/settings/estimate-publishing',
        { estimatorsMayPublish: true },
        etag,
      )
      expect(res.statusCode, who).toBe(403)
    }
    const d = await readyDraft()
    const off = await write(
      'owner',
      'PUT',
      '/api/v1/staff/settings/estimate-publishing',
      { estimatorsMayPublish: false },
      etag,
    )
    expect(off.statusCode).toBe(200)
    expect(off.json()).toMatchObject({ roles: ['owner'], estimatorsMayPublish: false, version: etag + 1 })
    // A stale If-Match is refused with the current version.
    const stale = await write(
      'owner',
      'PUT',
      '/api/v1/staff/settings/estimate-publishing',
      { estimatorsMayPublish: true },
      etag,
    )
    expect(stale.statusCode).toBe(409)

    // Immediately: the very next publish by the Estimator is refused; the builder no longer offers it.
    expect((await publish('estimator', d.versionId, d.view.rowVersion)).statusCode).toBe(403)
    expect((await view('estimator', d.versionId)).lifecycle.actions.publish).toBe(false)
    // The function refuses as well (no route can skip the check).
    await expect(
      withTx(t.db, (tx) =>
        publishVersion(tx, staff.estimator, d.versionId, {
          storage,
          testMark: true,
          expiry: estimateExpiryAutomation(),
        }),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' })
    // The Owner always may publish (ROLE-MATRIX "Publish an estimate version": Owner Y).
    expect((await publish('owner', d.versionId, d.view.rowVersion)).statusCode).toBe(200)

    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'actor_id', 'summary'])
      .where('action', '=', 'estimate.change_publishers')
      .execute()
    expect(audit).toEqual([
      expect.objectContaining({
        actor_id: staff.owner.userId,
        summary: expect.objectContaining({ from: ['owner', 'estimator'], to: ['owner'] }),
      }),
    ])
    const on = await write(
      'owner',
      'PUT',
      '/api/v1/staff/settings/estimate-publishing',
      { estimatorsMayPublish: true },
      etag + 1,
    )
    expect(on.json()).toMatchObject({ roles: ['owner', 'estimator'], version: etag + 2 })
  })
})

describe('[HH-EST-04][S04][HH-EST-05] publishing runs the readiness check and refuses, naming each reason', () => {
  it('a NOT CONFIGURED value keeps the version unpublished; it is never read as a default', async () => {
    const d = await readyDraft()
    const restore = await setConfig('legal.estimate_terms', null, ['HH-EST-13', 'OWN-DEC-127', 'OQ-ATTORNEY-TERMS'])
    try {
      const res = await publish('estimator', d.versionId, d.view.rowVersion)
      expect(res.statusCode).toBe(409)
      expect(res.json<{ error: { fieldErrors: { field: string; code: string }[] } }>().error.fieldErrors).toEqual([
        expect.objectContaining({ field: 'readiness.legal.estimate_terms', code: 'NOT_CONFIGURED' }),
      ])
    } finally {
      await restore()
    }
    const row = await versionRow(d.versionId)
    expect(row).toMatchObject({ state: 'draft', published_at: null, terms_version: null, customer_pdf_sha256: null })
    const events = await t.db
      .selectFrom('platform.outbox_events')
      .select('id')
      .where('aggregate_id', '=', d.versionId)
      .execute()
    expect(events).toEqual([])
  })

  it('an incomplete draft, a stale version, a review hold and missing storage are each refused', async () => {
    const d = await readyDraft()
    const incomplete = await write(
      'estimator',
      'PUT',
      `/api/v1/staff/estimate-versions/${d.versionId}/draft`,
      { lines: [{ description: 'Synthetic: size unknown', unitPriceCents: 5000 }] },
      d.view.rowVersion,
    )
    const v = incomplete.json<View>()
    const refused = await publish('estimator', d.versionId, v.rowVersion)
    expect(refused.statusCode).toBe(409)
    expect(refused.json<{ error: { fieldErrors: { field: string; code: string }[] } }>().error.fieldErrors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'lines[0]', code: 'QUANTITY_UNKNOWN' })]),
    )
    expect((await publish('estimator', d.versionId, v.rowVersion - 1)).json()).toMatchObject({
      error: { code: 'STALE_VERSION' },
    })
    expect(
      (await write('estimator', 'POST', `/api/v1/staff/estimate-versions/${d.versionId}/publish`, {})).statusCode,
    ).toBe(428)

    // A potential hazard under review blocks publishing (HH-LEAD-04, RULE-SAFETY-GATES).
    const held = await readyDraft()
    await t.db
      .insertInto('work.holds')
      .values({
        kind: 'review',
        scope_type: 'request',
        scope_id: held.id,
        project_id: held.projectId,
        request_id: held.id,
        category: 'structural',
        note: 'Synthetic: sagging ceiling seen in a photo.',
        source: 'qualification',
        source_ref: 'synthetic-1',
        raised_by: staff.owner.userId,
      })
      .execute()
    const blocked = await publish('owner', held.versionId, held.view.rowVersion)
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json()).toMatchObject({ error: { fieldErrors: [{ field: 'holds', code: 'REVIEW_HOLD_OPEN' }] } })

    // Without object storage the customer PDF cannot be stored: NOT CONFIGURED, nothing published (never faked).
    const other = await readyDraft()
    await expect(
      withTx(t.db, (tx) =>
        publishVersion(tx, staff.owner, other.versionId, {
          storage: null,
          testMark: true,
          expiry: estimateExpiryAutomation(),
        }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_CONFIGURED' })
    expect((await versionRow(other.versionId)).state).toBe('draft')
  })

  it('[HH-EST-11] an uploaded version without its document and the agree-confirmation is refused', async () => {
    const r = await readyRequest()
    const res = await write('estimator', 'POST', `/api/v1/staff/projects/${r.projectId}/uploaded-estimates`, {})
    const created = res.json<{ versionId: string }>()
    const v = await view('estimator', created.versionId)
    const saved = await write(
      'estimator',
      'PUT',
      `/api/v1/staff/estimate-versions/${created.versionId}/draft`,
      { lines: [{ kind: 'base', description: 'Synthetic uploaded total', quantity: '1', unitPriceCents: 50_000 }] },
      v.rowVersion,
    )
    const refused = await publish('estimator', created.versionId, saved.json<View>().rowVersion)
    expect(refused.statusCode).toBe(409)
    expect(refused.json<{ error: { fieldErrors: { code: string }[] } }>().error.fieldErrors.map((f) => f.code)).toEqual(
      ['DOCUMENT_MISSING', 'AGREEMENT_NOT_CONFIRMED'],
    )
  })
})

describe('[HH-EST-04][C05] what publishing pins, stores and sends', () => {
  it('pins validity and terms, stores the customer PDF with its hash, moves the request on and schedules expiry', async () => {
    const d = await readyDraft()
    const registry = createAutomationRegistry([estimateToWriteQueueAutomation()])
    await createWorker({ db: t.db, registry }).runOnce()
    const res = await publish('estimator', d.versionId, d.view.rowVersion)
    expect(res.statusCode).toBe(200)
    const v = res.json<View>()
    const row = await versionRow(d.versionId)
    const validity = (await loadConfig(t.db)).get('estimate.validity')
    if (validity.state !== 'CONFIGURED') throw new Error('estimate.validity is decided (14 days)')
    // Valid for the configured days from publishing, counted in the business time zone, until 11:59:59 PM business
    // time on the last day (FACT-ESTIMATE-VALIDITY: 14 days; PROPOSED end of day).
    const zone = (await loadConfig(t.db)).get('business.timezone')
    if (zone.state !== 'CONFIGURED') throw new Error('business.timezone is configured')
    expect(row.valid_until).toEqual(estimateValidUntil(row.published_at as Date, validity.value.days, zone.value.zone))
    const end = zonedParts(row.valid_until as Date, zone.value.zone)
    expect([end.hour, end.minute]).toEqual([23, 59])
    const published = zonedParts(row.published_at as Date, zone.value.zone)
    const days = Math.round(
      (Date.UTC(end.year, end.month - 1, end.day) - Date.UTC(published.year, published.month - 1, published.day)) /
        86_400_000,
    )
    expect(days).toBe(validity.value.days)
    expect(row).toMatchObject({
      state: 'published',
      published_by: staff.estimator.userId,
      validity_policy_version: validity.version,
      terms_version: TEST_TERMS.documentId,
    })
    expect(v.lifecycle).toMatchObject({
      effectiveState: 'published',
      termsVersion: TEST_TERMS.documentId,
      current: { versionId: d.versionId, version: 1 },
      customerPdf: { sha256: row.customer_pdf_sha256, byteSize: row.customer_pdf_byte_size },
    })

    // The stored PDF is exactly what the version renders as published: same bytes, same SHA-256.
    const stored = storage.objects.get(row.customer_pdf_object_key as string)
    expect(stored?.contentType).toBe('application/pdf')
    const hash = createHash('sha256')
      .update(stored?.bytes as Uint8Array)
      .digest('hex')
    expect(hash).toBe(row.customer_pdf_sha256)
    const again = await renderCustomerPdf(
      (await customerPdfInput(t.db, d.versionId, { testMark: true })) as NonNullable<
        Awaited<ReturnType<typeof customerPdfInput>>
      >,
    )
    expect(createHash('sha256').update(again).digest('hex')).toBe(hash)
    const served = await get('estimator', `/api/v1/staff/estimate-versions/${d.versionId}/customer-pdf`)
    expect(served.statusCode).toBe(200)
    expect(served.headers['x-content-sha256']).toBe(hash)
    expect(createHash('sha256').update(served.rawPayload).digest('hex')).toBe(hash)

    // The request moves on to estimated and its pending-estimate item is resolved.
    const request = await t.db.selectFrom('intake.requests').select('state').where('id', '=', d.id).executeTakeFirst()
    expect(request?.state).toBe('estimated')
    const item = await t.db
      .selectFrom('ops.queue_items')
      .select(['resolved_at'])
      .where('type', '=', 'estimate_to_write')
      .where('subject_id', '=', d.id)
      .executeTakeFirstOrThrow()
    expect(item.resolved_at).not.toBeNull()

    // One estimate.version_published event; one expiry job at the valid-until time.
    const events = await t.db
      .selectFrom('platform.outbox_events')
      .select(['type', 'payload'])
      .where('aggregate_id', '=', d.versionId)
      .execute()
    expect(events).toEqual([{ type: 'estimate.version_published', payload: { estimateId: d.estimateId, version: 1 } }])
    const job = await t.db
      .selectFrom('platform.jobs')
      .select(['automation', 'run_at', 'state'])
      .where('target_id', '=', d.versionId)
      .executeTakeFirstOrThrow()
    expect(job).toMatchObject({ automation: 'estimate.validity_expiry', state: 'queued', run_at: row.valid_until })

    // Published versions are immutable: the draft route refuses, and nothing is silently edited.
    const edit = await write(
      'estimator',
      'PUT',
      `/api/v1/staff/estimate-versions/${d.versionId}/draft`,
      { lines: [] },
      v.rowVersion,
    )
    expect(edit.statusCode).toBe(409)
    expect((await publish('estimator', d.versionId, v.rowVersion)).statusCode).toBe(409)
  })

  it('[FACT-AUTOMATIC-MESSAGES] queues the estimate-ready notice once, with no amounts, rechecked at send time', async () => {
    const p = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci' }))
    const fakes = { email: p.fakes.email, sms: p.fakes.sms }
    const d = await readyDraft()
    expect((await publish('estimator', d.versionId, d.view.rowVersion)).statusCode).toBe(200)
    const notify = estimateReadyAutomation({ providers: { email: p.email, sms: p.sms } })
    const worker = createWorker({ db: t.db, registry: createAutomationRegistry([notify]) })
    await worker.runOnce()
    await worker.runOnce()
    const deliveries = await t.db
      .selectFrom('platform.message_deliveries')
      .select(['message_key', 'channel', 'state', 'error_code', 'release', 'record_type', 'record_id'])
      .where('subject_key', '=', `estimate_version:${d.versionId}`)
      .orderBy('channel')
      .execute()
    // One delivery per channel. Without a configured public site there is no portal link, so the email records the
    // missing link instead of linking somewhere invented; a text needs the customer's SMS opt-in.
    expect(deliveries).toEqual([
      {
        message_key: 'estimate.ready',
        channel: 'email',
        state: 'failed',
        error_code: 'template_values_missing',
        release: 'automatic',
        record_type: 'estimate_version',
        record_id: d.versionId,
      },
      expect.objectContaining({ channel: 'sms', state: 'suppressed', error_code: 'sms_no_opt_in' }),
    ])
    expect(fakes.email?.sent ?? []).toEqual([])

    // TSK-0120: with the public site configured, the email says only that the estimate is ready, with the project's
    // portal link (the owner-style estimate_ready wording, the estimate number and the first name, never an amount).
    const linked = await readyDraft()
    const email = await t.db
      .selectFrom('intake.requests as r')
      .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
      .select(['c.email', 'r.reference'])
      .where('r.id', '=', linked.id)
      .executeTakeFirstOrThrow()
    const allowed = createProviders(readProviderSettings({ HANDYHUB_ENV: 'ci', TEST_EMAIL_DESTINATIONS: email.email }))
    const withLink = estimateReadyAutomation({
      providers: { email: allowed.email, sms: allowed.sms },
      publicSiteUrl: 'https://example.test',
    })
    expect((await publish('estimator', linked.versionId, linked.view.rowVersion)).statusCode).toBe(200)
    await createWorker({ db: t.db, registry: createAutomationRegistry([withLink]) }).runOnce()
    const sent = allowed.fakes.email?.sent ?? []
    expect(sent).toHaveLength(1)
    const number = (
      await t.db
        .selectFrom('estimating.estimate_versions as v')
        .innerJoin('estimating.estimates as e', 'e.id', 'v.estimate_id')
        .select('e.number')
        .where('v.id', '=', linked.versionId)
        .executeTakeFirstOrThrow()
    ).number
    expect(sent[0]).toMatchObject({ to: email.email, subject: `HandyHub | Your Estimate #${number} Is Ready` })
    expect(sent[0]?.text).toMatch(new RegExp(`^Hi [^\\n]+,\\n\\nYour HandyHub estimate #${number} is ready\\.`))
    expect(sent[0]?.text).toContain(`\n\nhttps://example.test/portal/p/${email.reference}\n\n`)
    expect(sent[0]?.html).toContain(`href="https://example.test/portal/p/${email.reference}"`)
    // No amount anywhere in the message (FACT-AUTOMATIC-MESSAGES: no amounts, only a secure link).
    expect(`${sent[0]?.subject} ${sent[0]?.text} ${sent[0]?.html}`.replaceAll(number, '')).not.toMatch(
      /\$|1,25|total|deposit/i,
    )
    // The project reference in the link is random and may hold digits of its own, so it is set aside too.
    expect(`${sent[0]?.subject} ${sent[0]?.text}`.replaceAll(number, '').replaceAll(email.reference, '')).not.toMatch(
      /\d{3,}/,
    )

    // A version withdrawn before the job runs sends nothing (stale).
    const later = await readyDraft()
    const pub = await publish('estimator', later.versionId, later.view.rowVersion)
    const withdrawn = await write(
      'estimator',
      'POST',
      `/api/v1/staff/estimate-versions/${later.versionId}/withdraw`,
      { reason: 'Synthetic: sent to the wrong project.' },
      pub.json<View>().rowVersion,
    )
    expect(withdrawn.statusCode).toBe(200)
    await createWorker({ db: t.db, registry: createAutomationRegistry([withLink]) }).runOnce()
    expect(allowed.fakes.email?.sent ?? []).toHaveLength(1)
    const none = await t.db
      .selectFrom('platform.message_deliveries')
      .select('id')
      .where('subject_key', '=', `estimate_version:${later.versionId}`)
      .execute()
    expect(none).toEqual([])
  })
})

describe('[T32][HH-EST-04] revisions are kept; superseded and expired versions cannot be accepted', () => {
  it('revising creates version 2; publishing it supersedes version 1, which stays as it was', async () => {
    const d = await readyDraft('estimator')
    const p1 = await publish('estimator', d.versionId, d.view.rowVersion)
    expect(p1.statusCode).toBe(200)
    const v1Before = await versionRow(d.versionId)
    const linesBefore = await t.db
      .selectFrom('estimating.estimate_lines')
      .selectAll()
      .where('version_id', '=', d.versionId)
      .execute()

    // Workers and Office do not revise; another Estimator does, as a new version of the same estimate.
    for (const who of ['worker', 'office'] as const)
      expect((await write(who, 'POST', `/api/v1/staff/estimate-versions/${d.versionId}/revise`, {})).statusCode).toBe(
        403,
      )
    const revised = await write('estimator2', 'POST', `/api/v1/staff/estimate-versions/${d.versionId}/revise`, {})
    expect(revised.statusCode).toBe(201)
    const v2 = revised.json<{ versionId: string; version: number; number: string; rowVersion: number }>()
    expect(v2).toMatchObject({ version: 2, number: d.number })
    // One version being edited at a time.
    const twice = await write('estimator2', 'POST', `/api/v1/staff/estimate-versions/${d.versionId}/revise`, {})
    expect(twice.json()).toMatchObject({ error: { fieldErrors: [{ field: 'estimate', code: 'DRAFT_EXISTS' }] } })

    // The edit lands in version 2 only.
    const draft = await view('estimator2', v2.versionId)
    expect(draft).toMatchObject({ state: 'draft', canEdit: true })
    expect(draft.lines.map((l) => l.unitPriceCents)).toEqual([3333, 125_000, 1999])
    expect(draft.lifecycle.revisedFrom).toEqual({ versionId: d.versionId, version: 1 })
    const edited = await write(
      'estimator2',
      'PUT',
      `/api/v1/staff/estimate-versions/${v2.versionId}/draft`,
      { lines: LINES(draft.workPackages, 99_000), texts: { exclusions: ['Synthetic: moving furniture'] } },
      draft.rowVersion,
    )
    expect(edited.statusCode).toBe(200)
    expect(await versionRow(d.versionId)).toEqual(v1Before)

    const p2 = await publish('owner', v2.versionId, edited.json<View>().rowVersion)
    expect(p2.statusCode).toBe(200)
    const v1 = await versionRow(d.versionId)
    expect(v1).toEqual({
      ...v1Before,
      state: 'superseded',
      state_changed_at: v1.state_changed_at,
      row_version: v1Before.row_version + 1,
    })
    expect(
      await t.db.selectFrom('estimating.estimate_lines').selectAll().where('version_id', '=', d.versionId).execute(),
    ).toEqual(linesBefore)

    // The version history shows creator, reviser and publisher of each version.
    const history = p2.json<View>().lifecycle.history
    expect(
      history.map((h) => [h.version, h.state, h.createdBy.name, h.revisedFromVersion, h.publishedBy?.name]),
    ).toEqual([
      [1, 'superseded', 'Synthetic estimator', null, 'Synthetic estimator'],
      [2, 'published', 'Synthetic estimator2', 1, 'Synthetic owner'],
    ])
    expect(history.map((h) => h.totalCents)).toEqual([133_333, 107_333])
    expect((await auditOf(d.versionId)).map((a) => a.action)).toContain('estimate.supersede')
    expect((await auditOf(v2.versionId)).map((a) => a.action)).toEqual([
      'estimate.revise',
      'estimate.save_draft',
      'estimate.publish',
    ])

    // [T32] Approving version 1 is refused, with version 2 as the one to review; the database refuses it too.
    expect(await acceptanceCheck(t.db, d.versionId)).toEqual({
      acceptable: false,
      code: 'SUPERSEDED',
      current: { versionId: v2.versionId, version: 2 },
    })
    expect(await acceptanceCheck(t.db, v2.versionId)).toEqual({ acceptable: true })
    await expect(
      sql`UPDATE estimating.estimate_versions SET state = 'accepted' WHERE id = ${d.versionId}`.execute(t.db),
    ).rejects.toThrow(/never becomes accepted/)
    await expect(
      sql`UPDATE estimating.estimate_versions SET state = 'published' WHERE id = ${d.versionId}`.execute(t.db),
    ).rejects.toThrow(/never becomes published/)
    // A version is never written straight into a later state, and numbering follows on.
    await expect(
      sql`INSERT INTO estimating.estimate_versions (estimate_id, project_id, version, state, authoring_method,
            payment_term, payment_term_version, prepared_by, updated_by, revised_from_id)
          VALUES (${d.estimateId}, ${d.projectId}, 3, 'published', 'written', 'due_on_receipt', 1,
            ${staff.owner.userId}, ${staff.owner.userId}, ${d.versionId})`.execute(t.db),
    ).rejects.toThrow(/starts as a draft/)
    await expect(
      sql`INSERT INTO estimating.estimate_versions (estimate_id, project_id, version, authoring_method,
            payment_term, payment_term_version, prepared_by, updated_by, revised_from_id)
          VALUES (${d.estimateId}, ${d.projectId}, 5, 'written', 'due_on_receipt', 1,
            ${staff.owner.userId}, ${staff.owner.userId}, ${d.versionId})`.execute(t.db),
    ).rejects.toThrow(/follows version 2/)
  })

  it('[T32] an expired version is refused with "Request an Updated Estimate" (no current version); the job expires it', async () => {
    const d = await readyDraft()
    // Published 15 days ago (14-day validity): the database guard decides as it does for the lifecycle's update.
    await sql`UPDATE estimating.estimate_versions
              SET state = 'published', state_changed_at = now() - interval '15 days',
                  published_at = now() - interval '15 days', published_by = ${staff.estimator.userId},
                  valid_until = now() - interval '1 day', validity_policy_version = 1,
                  terms_version = ${TEST_TERMS.documentId},
                  customer_pdf_object_key = ${`estimates/published/${crypto.randomUUID()}`},
                  customer_pdf_sha256 = ${'0'.repeat(64)}, customer_pdf_byte_size = 1, row_version = row_version + 1
              WHERE id = ${d.versionId}`.execute(t.db)
    // Past its validity it already reads as expired, and approving it is refused before the job records it.
    expect((await view('estimator', d.versionId)).lifecycle).toMatchObject({ effectiveState: 'expired', current: null })
    expect(await acceptanceCheck(t.db, d.versionId)).toEqual({ acceptable: false, code: 'EXPIRED', current: null })
    await expect(
      sql`UPDATE estimating.estimate_versions SET state = 'accepted' WHERE id = ${d.versionId}`.execute(t.db),
    ).rejects.toThrow(/expired estimate version is never accepted/)

    // The validity job records it, as the system, once.
    const expiry = estimateExpiryAutomation()
    await withTx(t.db, (tx) =>
      scheduleJob(tx, expiry, {
        key: d.versionId,
        target: { type: 'estimate_version', id: d.versionId },
        requestId: 'test-expiry',
      }),
    )
    await createWorker({ db: t.db, registry: createAutomationRegistry([expiry]) }).runOnce()
    expect((await versionRow(d.versionId)).state).toBe('expired')
    const audit = await auditOf(d.versionId)
    expect(audit.at(-1)).toMatchObject({ action: 'estimate.expire', actor_kind: 'system' })
    expect(await withTx(t.db, (tx) => expireIfDue(tx, d.versionId))).toBe('unchanged')
    expect(await acceptanceCheck(t.db, d.versionId)).toEqual({ acceptable: false, code: 'EXPIRED', current: null })
    await expect(
      sql`UPDATE estimating.estimate_versions SET state = 'accepted' WHERE id = ${d.versionId}`.execute(t.db),
    ).rejects.toThrow(/never becomes accepted/)
  })

  it('the expiry job never expires a version early: it fails and retries instead', async () => {
    const d = await readyDraft()
    expect((await publish('estimator', d.versionId, d.view.rowVersion)).statusCode).toBe(200)
    const fast: Automation = { ...estimateExpiryAutomation(), retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 } }
    await withTx(t.db, (tx) =>
      scheduleJob(tx, fast, {
        key: `${d.versionId}:early`,
        target: { type: 'estimate_version', id: d.versionId },
        requestId: 'test-expiry-early',
      }),
    )
    const result = await createWorker({ db: t.db, registry: createAutomationRegistry([fast]) }).runOnce()
    expect(result.failed).toBe(1)
    expect((await versionRow(d.versionId)).state).toBe('published')
  })
})

describe("[HH-EST-04] withdraw, expire now and record a decline, within each role's permission", () => {
  it('needs a reason to withdraw or expire, keeps the reason in the audit log and the version as it was', async () => {
    const a = await readyDraft()
    const pa = (await publish('estimator', a.versionId, a.view.rowVersion)).json<View>()
    expect(pa.lifecycle.actions).toMatchObject({ withdraw: true, expire: true, recordDecline: true, revise: true })
    const noReason = await write(
      'estimator',
      'POST',
      `/api/v1/staff/estimate-versions/${a.versionId}/withdraw`,
      {},
      pa.rowVersion,
    )
    expect(noReason.statusCode).toBe(400)
    const blank = await write(
      'estimator',
      'POST',
      `/api/v1/staff/estimate-versions/${a.versionId}/expire`,
      { reason: '   ' },
      pa.rowVersion,
    )
    expect(blank.json()).toMatchObject({ error: { code: 'VALIDATION_FAILED', fieldErrors: [{ field: 'reason' }] } })
    for (const who of ['worker', 'office'] as const)
      expect(
        (
          await write(
            who,
            'POST',
            `/api/v1/staff/estimate-versions/${a.versionId}/expire`,
            { reason: 'x' },
            pa.rowVersion,
          )
        ).statusCode,
      ).toBe(403)
    const expired = await write(
      'estimator',
      'POST',
      `/api/v1/staff/estimate-versions/${a.versionId}/expire`,
      { reason: 'Synthetic: material prices changed.' },
      pa.rowVersion,
    )
    expect(expired.statusCode).toBe(200)
    expect(expired.json<View>().state).toBe('expired')
    expect((await auditOf(a.versionId)).at(-1)).toMatchObject({
      action: 'estimate.expire',
      reason: 'Synthetic: material prices changed.',
      summary: expect.objectContaining({ from: 'published', to: 'expired' }),
    })
    // A final state never changes again.
    const again = await write(
      'estimator',
      'POST',
      `/api/v1/staff/estimate-versions/${a.versionId}/withdraw`,
      { reason: 'Synthetic' },
      expired.json<View>().rowVersion,
    )
    expect(again.json()).toMatchObject({ error: { fieldErrors: [{ field: 'state', code: 'INVALID_TRANSITION' }] } })

    // Office records the customer's decline (PROPOSED cell), with the customer's optional reason.
    const b = await readyDraft()
    const pb = (await publish('owner', b.versionId, b.view.rowVersion)).json<View>()
    const declined = await write(
      'office',
      'POST',
      `/api/v1/staff/estimate-versions/${b.versionId}/record-decline`,
      {},
      pb.rowVersion,
    )
    expect(declined.statusCode).toBe(200)
    expect((await versionRow(b.versionId)).state).toBe('declined')
    expect(await acceptanceCheck(t.db, b.versionId)).toEqual({
      acceptable: false,
      code: 'NOT_PUBLISHED',
      current: null,
    })
  })

  it('request review and back to the draft keep the version editable; neither publishes', async () => {
    const d = await readyDraft()
    const reviewed = await write(
      'estimator',
      'POST',
      `/api/v1/staff/estimate-versions/${d.versionId}/request-review`,
      {},
      d.view.rowVersion,
    )
    expect(reviewed.statusCode).toBe(200)
    expect(reviewed.json<View>()).toMatchObject({ state: 'in_review', canEdit: true })
    expect(reviewed.json<View>().lifecycle.actions).toMatchObject({
      publish: true,
      returnToDraft: true,
      requestReview: false,
    })
    const back = await write(
      'estimator',
      'POST',
      `/api/v1/staff/estimate-versions/${d.versionId}/return-to-draft`,
      {},
      reviewed.json<View>().rowVersion,
    )
    expect(back.json<View>().state).toBe('draft')
    expect(
      (await write('worker', 'POST', `/api/v1/staff/estimate-versions/${d.versionId}/request-review`, {}, 1))
        .statusCode,
    ).toBe(403)
  })

  it('revising an estimate with an accepted version is refused (PROPOSED: accepted work changes by change order)', async () => {
    const d = await readyDraft()
    const p = (await publish('estimator', d.versionId, d.view.rowVersion)).json<View>()
    // The approval transaction is TSK-0057; the database accepts a current, unexpired published version.
    await sql`UPDATE estimating.estimate_versions SET state = 'accepted' WHERE id = ${d.versionId}`.execute(t.db)
    expect(p.lifecycle.actions.revise).toBe(true)
    const res = await write('owner', 'POST', `/api/v1/staff/estimate-versions/${d.versionId}/revise`, {})
    expect(res.json()).toMatchObject({ error: { fieldErrors: [{ field: 'estimate', code: 'ESTIMATE_ACCEPTED' }] } })
    expect((await view('owner', d.versionId)).lifecycle.actions.revise).toBe(false)
  })
})

describe('[RULE-SERVER-AUTHZ] the lifecycle functions refuse a caller the policy refuses', () => {
  it('a Worker cannot publish through the function either', async () => {
    const d = await readyDraft()
    await expect(
      withTx(t.db, (tx) =>
        publishVersion(tx, staff.worker, d.versionId, { storage, testMark: true, expiry: estimateExpiryAutomation() }),
      ),
    ).rejects.toBeInstanceOf(ApiError)
    expect((await versionRow(d.versionId)).state).toBe('draft')
  })
})
