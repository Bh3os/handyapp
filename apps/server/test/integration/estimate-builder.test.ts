// Write an Estimate: the staff builder's routes against PostgreSQL 16 (TSK-0053; HH-EST-01, HH-EST-05, T31, T40, T58,
// RULE-SERVER-AUTHZ, RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS). Staff, customers, requests, amounts and the test terms
// document are synthetic (RULE-SYNTHETIC-DATA).
import { loadServiceSeed, syncServices, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { encodeCursor } from '../../src/api/pagination.js'
import { publishReadiness } from '../../src/modules/estimates/index.js'
import { apiModules } from '../../src/modules/index.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { estimateToWriteQueueAutomation } from '../../src/modules/queue/index.js'
import { requestsModule } from '../../src/modules/requests/index.js'
import { createAutomationRegistry } from '../../src/platform/automation.js'
import { loadConfig, recordPolicyVersion, type ConfigKey } from '../../src/platform/config/index.js'
import { createWorker } from '../../src/platform/jobs.js'
import { testConfig } from '../fixtures/env.js'

const pw = (n: number) => ['synthetic', 'builder', 'passphrase', 'number', String(n)].join(' ')
const PEOPLE = ['owner', 'office', 'estimator', 'estimator2', 'worker'] as const
type Person = (typeof PEOPLE)[number]
const roleOf = (p: Person) => p.replace(/2$/, '') as 'owner' | 'office' | 'estimator' | 'worker'

let t: TestDatabase
let app: FastifyInstance
/** The same database where Not a Fit finds an obligation on the listed projects, so it routes to the Owner. */
let owed: FastifyInstance
const withAppointment = new Set<string>()
const ids = {} as Record<Person, string>
const cookies = {} as Record<Person, string>
const csrf = {} as Record<Person, string>
const owedSession = { cookie: '', csrf: '' }

async function signIn(p: Person, server: FastifyInstance = app): Promise<[string, string]> {
  const res = await server.inject({
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    payload: { email: `${p}-builder@example.test`, password: pw(1) },
  })
  expect(res.statusCode).toBe(200)
  const cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await server.inject({ method: 'GET', url: '/api/v1/staff/auth/session', headers: { cookie } })
  return [cookie, session.json<{ csrfToken: string }>().csrfToken]
}

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  app = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db } })
  const modules = apiModules({ secureCookies: false, mfaKey: null }).map((m) =>
    m.name === 'requests'
      ? requestsModule({
          obligationChecks: [
            {
              fact: 'appointmentExists',
              source: 'test',
              check: async (_tx, projectId) => withAppointment.has(projectId),
            },
          ],
        })
      : m,
  )
  owed = await buildApp({ config: testConfig({ TRUST_PROXY_HOPS: '1' }), api: { db: t.db, modules } })
  const hash = await hashPassword(pw(1))
  await withTx(t.db, async (tx) => {
    for (const p of PEOPLE) {
      const user = await createStaffUser(tx, {
        email: `${p}-builder@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role: roleOf(p),
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
  })
  for (const p of PEOPLE) [cookies[p], csrf[p]] = await signIn(p)
  ;[owedSession.cookie, owedSession.csrf] = await signIn('owner', owed)
})
afterAll(async () => {
  await owed?.close()
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
      description: 'Synthetic builder project.',
      answers: [],
      property: { street: `${seq} Synthetic Way`, city: 'Testville', state: 'ky', zip: '40000', propertyType: 'house' },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Synthetic Builder Customer',
        email: `builder-customer-${seq}@example.test`,
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
  return {
    id: row.id,
    projectId: row.project_id,
    reference,
    requestVersion: moved.json<{ version: number }>().version,
  }
}

type View = {
  id: string
  estimateNumber: string
  state: string
  rowVersion: number
  project: { id: string; reference: string }
  customer: { name: string }
  request: { id: string; reference: string } | null
  lines: { id: string; kind: string; workPackageId: string | null; amountCents: number | null }[]
  texts: Record<string, string[]>
  discountCategory: string | null
  totals: {
    subtotalCents: number
    discount: { category: string; percentBps: number; amountCents: number } | null
    totalCents: number
    depositState: string
    depositCents: number | null
  } | null
  paymentTerm: string
  document: {
    issuerName: string | null
    mailingAddress: string[] | null
    validityDays: number | null
    termsDocumentId: string | null
    discountCategories: string[] | null
  }
  workPackages: { id: string; serviceCode: string }[]
  readiness: { ready: boolean; problems: { code: string; line?: number; key?: string; sourceIds?: string[] }[] }
  internal: { estimatorNotes: string | null; lines: { materialCostCents: number | null }[] } | null
  canEdit: boolean
}

async function newDraft(who: Person = 'estimator') {
  const r = await readyRequest()
  const res = await write(who, 'POST', `/api/v1/staff/projects/${r.projectId}/estimates`, {})
  expect(res.statusCode).toBe(201)
  const created = res.json<{ estimateId: string; number: string; versionId: string; rowVersion: number }>()
  return { ...r, ...created }
}
const view = async (who: Person, versionId: string) => {
  const res = await get(who, `/api/v1/staff/estimate-versions/${versionId}`)
  expect(res.statusCode).toBe(200)
  return res.json<View>()
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

/** A synthetic test terms document (never real wording): lets a test see a version become ready. */
const TEST_TERMS = {
  documentId: 'test-estimate-terms-1',
  status: 'draft',
  attorneyReviewed: false,
  preparedOn: '2026-10-21',
  contentSha256: '0'.repeat(64),
}

const lines = (packages: { id: string }[]) => [
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
    quantitySource: 'reported_by_customer',
    unitPriceCents: 125_000,
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

describe('[HH-EST-01][T31] Write an Estimate from a request ready for its estimate', () => {
  it('the ready request opens a pending-estimate item; writing creates a numbered draft and the item shows it', async () => {
    const r = await readyRequest()
    const registry = createAutomationRegistry([estimateToWriteQueueAutomation()])
    await createWorker({ db: t.db, registry }).runOnce()
    const item = () =>
      t.db
        .selectFrom('ops.queue_items')
        .select(['reason', 'resolved_at', 'reference'])
        .where('type', '=', 'estimate_to_write')
        .where('subject_id', '=', r.id)
        .executeTakeFirst()
    expect(await item()).toMatchObject({ reason: 'ready_for_estimate', resolved_at: null, reference: r.reference })

    const projectList = await get('estimator', `/api/v1/staff/projects/${r.projectId}/estimates`)
    expect(projectList.json()).toEqual({ projectId: r.projectId, canWrite: true, estimates: [] })

    const res = await write('estimator', 'POST', `/api/v1/staff/projects/${r.projectId}/estimates`, {})
    expect(res.statusCode).toBe(201)
    const created = res.json<{ number: string; versionId: string; version: number; rowVersion: number }>()
    expect(created).toMatchObject({ version: 1, rowVersion: 1 })
    expect(created.number).toMatch(/^HH-[0-9A-Z]{8}-E1$/)
    expect(await item()).toMatchObject({ reason: 'estimate_draft', resolved_at: null })

    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'target_id'])
      .where('target_id', '=', created.versionId)
      .execute()
    expect(audit.map((a) => a.action)).toEqual(['estimate.create'])

    const v = await view('estimator', created.versionId)
    expect(v).toMatchObject({
      estimateNumber: created.number,
      state: 'draft',
      rowVersion: 1,
      customer: { name: 'Synthetic Builder Customer' },
      request: { id: r.id, reference: r.reference },
      lines: [],
      totals: null,
      paymentTerm: 'due_on_receipt',
      canEdit: true,
    })
    expect(v.workPackages.map((w) => w.serviceCode)).toEqual(['DW-01', 'PT-01'])

    const listed = await get('owner', '/api/v1/staff/estimates')
    expect(listed.json<{ items: { number: string; latest: { state: string } }[] }>().items).toContainEqual(
      expect.objectContaining({ number: created.number, latest: expect.objectContaining({ state: 'draft' }) }),
    )
  })

  it('saves lines per work package, an option, texts and the discount; the server computes every amount', async () => {
    const d = await newDraft()
    const before = await view('estimator', d.versionId)
    const res = await write(
      'estimator',
      'PUT',
      `/api/v1/staff/estimate-versions/${d.versionId}/draft`,
      {
        lines: lines(before.workPackages),
        discountCategory: 'military',
        texts: { exclusions: ['Synthetic: moving furniture'], assumptions: ['Synthetic: walls are dry'] },
        internal: { estimatorNotes: 'Synthetic internal note' },
      },
      before.rowVersion,
    )
    expect(res.statusCode).toBe(200)
    expect(res.headers['etag']).toBe('"2"')
    const v = res.json<View>()
    // 2.5 x $33.33 = $83.325, rounded once half-up to $83.33; the add-on is an option outside the base total.
    expect(v.lines.map((l) => [l.kind, l.amountCents])).toEqual([
      ['base', 8333],
      ['base', 125_000],
      ['add_on', 5997],
    ])
    expect(v.lines[0]?.workPackageId).toBe(before.workPackages[0]?.id)
    // Discount row before the total (10% of 133333 = 13333.3, half-up 13333); deposit 20% of the total after it.
    expect(v.totals).toEqual({
      subtotalCents: 133_333,
      discount: { category: 'military', percentBps: 1000, amountCents: 13_333 },
      totalCents: 120_000,
      depositState: 'required',
      depositCents: 24_000,
      computedAt: expect.any(String),
    })
    expect(v.texts).toMatchObject({
      exclusions: ['Synthetic: moving furniture'],
      assumptions: ['Synthetic: walls are dry'],
    })
    expect(v.internal?.estimatorNotes).toBe('Synthetic internal note')
    // No tax, minimum or surcharge row exists anywhere in the response.
    expect(JSON.stringify(v)).not.toMatch(/tax(?!ModeVersion)|minimum|surcharge/i)

    // A stale save is refused with the current version; nothing is overwritten.
    const stale = await write(
      'estimator',
      'PUT',
      `/api/v1/staff/estimate-versions/${d.versionId}/draft`,
      { lines: [] },
      before.rowVersion,
    )
    expect(stale.statusCode).toBe(409)
    expect(stale.json()).toMatchObject({ error: { code: 'STALE_VERSION', current: { version: 2 } } })
    // Without If-Match the save is refused before anything runs.
    expect(
      (await write('estimator', 'PUT', `/api/v1/staff/estimate-versions/${d.versionId}/draft`, { lines: [] }))
        .statusCode,
    ).toBe(428)
    // Client amounts are not part of the contract.
    const amounts = await write(
      'estimator',
      'PUT',
      `/api/v1/staff/estimate-versions/${d.versionId}/draft`,
      { lines: [{ description: 'x', quantity: '1', unitPriceCents: 100, amountCents: 1 }] },
      2,
    )
    expect(amounts.statusCode).toBe(400)

    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'summary'])
      .where('target_id', '=', d.versionId)
      .orderBy('seq')
      .execute()
    expect(audit.map((a) => a.action)).toEqual(['estimate.create', 'estimate.save_draft'])
    expect(audit[1]?.summary).toMatchObject({ lines: 3, complete: true, totalCents: 120_000, internalWritten: true })
  })

  it('[HH-EST-05] an incomplete draft is always saved: unknown quantities stay unknown, the totals stay empty', async () => {
    const d = await newDraft()
    const res = await write(
      'estimator',
      'PUT',
      `/api/v1/staff/estimate-versions/${d.versionId}/draft`,
      { lines: [{ description: 'Synthetic: size unknown until the visit', unitPriceCents: 5000 }] },
      1,
    )
    expect(res.statusCode).toBe(200)
    const v = res.json<View>()
    expect(v.totals).toBeNull()
    expect(v.readiness.ready).toBe(false)
    expect(v.readiness.problems).toContainEqual({ code: 'QUANTITY_UNKNOWN', line: 0 })
    // An invalid value is refused with its field and nothing is stored.
    const bad = await write(
      'estimator',
      'PUT',
      `/api/v1/staff/estimate-versions/${d.versionId}/draft`,
      { lines: [{ description: 'Synthetic', quantity: '1', unitPriceCents: 0 }] },
      2,
    )
    expect(bad.statusCode).toBe(400)
    expect(bad.json<{ error: { fieldErrors: { field: string; code: string }[] } }>().error.fieldErrors).toEqual([
      expect.objectContaining({ field: 'lines[0].unitPriceCents', code: 'NOT_POSITIVE' }),
    ])
    expect((await view('estimator', d.versionId)).rowVersion).toBe(2)
  })
})

describe('[HH-EST-05][HH-EST-01] publish readiness: a NOT CONFIGURED required value blocks publishing with its reason', () => {
  async function completeDraft() {
    const d = await newDraft()
    const v = await view('estimator', d.versionId)
    const res = await write(
      'estimator',
      'PUT',
      `/api/v1/staff/estimate-versions/${d.versionId}/draft`,
      { lines: lines(v.workPackages).slice(0, 2) },
      v.rowVersion,
    )
    expect(res.statusCode).toBe(200)
    return d
  }

  it('while the estimate terms are NOT CONFIGURED the complete draft is not ready; with the v1.0 sign-off it is', async () => {
    const d = await completeDraft()
    // TSK-0144: migration 0073 records the owner's sign-off of v1.0 (OWN-DEC-187): the seeded state is ready.
    const seeded = await view('estimator', d.versionId)
    expect(seeded.readiness).toEqual({ ready: true, problems: [] })
    expect(seeded.document.termsDocumentId).toBe('estimate-terms-1')
    const restore = await setConfig('legal.estimate_terms', null, ['HH-EST-13', 'OWN-DEC-127', 'OQ-ATTORNEY-TERMS'])
    try {
      const v = await view('estimator', d.versionId)
      expect(v.totals?.totalCents).toBe(133_333)
      expect(v.readiness).toEqual({
        ready: false,
        problems: [
          {
            code: 'NOT_CONFIGURED',
            key: 'legal.estimate_terms',
            sourceIds: ['HH-EST-13', 'OWN-DEC-127', 'OQ-ATTORNEY-TERMS'],
          },
        ],
      })
      expect(v.document.termsDocumentId).toBeNull()
      // The check publishing runs (TSK-0055) gives the same answer.
      expect(await publishReadiness(t.db, d.versionId)).toEqual(v.readiness)
    } finally {
      await restore()
    }
  })

  it('[T58][FACT-BUSINESS-ADDRESS] with the terms in place it is ready; the missing mailing address omits the line and blocks nothing', async () => {
    const d = await completeDraft()
    const restore = await setConfig('legal.estimate_terms', TEST_TERMS)
    try {
      const v = await view('estimator', d.versionId)
      expect(v.readiness).toEqual({ ready: true, problems: [] })
      expect(v.document).toEqual({
        issuerName: 'Handyhub LLC',
        mailingAddress: null,
        validityDays: 14,
        termsDocumentId: 'test-estimate-terms-1',
        discountCategories: ['military', 'senior', 'returning_customer'],
      })
    } finally {
      await restore()
    }
  })

  for (const [key, sources] of [
    ['estimate.validity', ['FACT-ESTIMATE-VALIDITY', 'TEST-SYNTHETIC']],
    ['business.name', ['FACT-BUSINESS-NAME', 'TEST-SYNTHETIC']],
    ['tax.mode', ['FACT-TAX-NO-LINE', 'TEST-SYNTHETIC']],
  ] as const) {
    it(`[RULE-NO-INVENTED-FACTS] ${key} NOT CONFIGURED: the draft still saves, readiness names the key and why`, async () => {
      const d = await completeDraft()
      const restoreTerms = await setConfig('legal.estimate_terms', TEST_TERMS)
      const restore = await setConfig(key, null, [...sources])
      try {
        const v = await view('estimator', d.versionId)
        // A draft can always be saved (HH-EST-05).
        const saved = await write(
          'estimator',
          'PUT',
          `/api/v1/staff/estimate-versions/${d.versionId}/draft`,
          { lines: lines(v.workPackages).slice(0, 2) },
          v.rowVersion,
        )
        expect(saved.statusCode).toBe(200)
        const after = saved.json<View>()
        expect(after.readiness.ready).toBe(false)
        expect(after.readiness.problems).toContainEqual({ code: 'NOT_CONFIGURED', key, sourceIds: [...sources] })
        // Nothing is put in its place.
        if (key === 'estimate.validity') expect(after.document.validityDays).toBeNull()
        if (key === 'business.name') expect(after.document.issuerName).toBeNull()
        expect(await publishReadiness(t.db, d.versionId)).toEqual(after.readiness)
      } finally {
        await restore()
        await restoreTerms()
      }
    })
  }

  it('a deposit rule NOT CONFIGURED is a reason, never "no deposit"; a policy change since the save makes the totals outdated', async () => {
    const d = await completeDraft()
    const restoreTerms = await setConfig('legal.estimate_terms', TEST_TERMS)
    const restore = await setConfig('deposit.rule', null, ['FACT-DEPOSIT-RULE', 'TEST-SYNTHETIC'])
    try {
      const v = await view('estimator', d.versionId)
      // Saved under the configured rule; the rule is now missing: both reasons are named.
      expect(v.readiness.problems).toEqual([
        { code: 'NOT_CONFIGURED', key: 'deposit.rule', sourceIds: ['FACT-DEPOSIT-RULE', 'TEST-SYNTHETIC'] },
        { code: 'TOTALS_OUTDATED' },
      ])
      const saved = await write(
        'estimator',
        'PUT',
        `/api/v1/staff/estimate-versions/${d.versionId}/draft`,
        { lines: lines(v.workPackages).slice(0, 2) },
        v.rowVersion,
      )
      const after = saved.json<View>()
      expect(after.totals?.depositState).toBe('not_configured')
      expect(after.readiness.problems).toEqual([
        { code: 'NOT_CONFIGURED', key: 'deposit.rule', sourceIds: ['FACT-DEPOSIT-RULE', 'TEST-SYNTHETIC'] },
      ])
    } finally {
      await restore()
      await restoreTerms()
    }
    // With the rule back, the totals saved under the missing rule are outdated until saved again.
    expect((await view('estimator', d.versionId)).readiness.problems).toEqual([{ code: 'TOTALS_OUTDATED' }])
  })
})

describe('[RULE-SERVER-AUTHZ] only the Owner and Estimators write estimates; internal values stay with their roles', () => {
  it('refuses Office and Workers on every route; a missing or malformed id answers like a missing record', async () => {
    const d = await newDraft('owner')
    for (const who of ['office', 'worker'] as const) {
      expect((await get(who, '/api/v1/staff/estimates')).statusCode).toBe(403)
      expect((await get(who, `/api/v1/staff/projects/${d.projectId}/estimates`)).statusCode).toBe(403)
      expect((await write(who, 'POST', `/api/v1/staff/projects/${d.projectId}/estimates`, {})).statusCode).toBe(403)
      expect((await get(who, `/api/v1/staff/estimate-versions/${d.versionId}`)).statusCode).toBe(403)
      expect(
        (await write(who, 'PUT', `/api/v1/staff/estimate-versions/${d.versionId}/draft`, { lines: [] }, 1)).statusCode,
      ).toBe(403)
    }
    expect((await get('estimator', `/api/v1/staff/estimate-versions/${crypto.randomUUID()}`)).statusCode).toBe(404)
    expect((await get('estimator', '/api/v1/staff/estimate-versions/not-a-uuid')).statusCode).toBe(400)
    const guest = await app.inject({ method: 'GET', url: `/api/v1/staff/estimate-versions/${d.versionId}` })
    expect(guest.statusCode).toBe(401)
  })

  it('another Estimator may edit the draft but neither sees nor overwrites its internal costs and notes', async () => {
    const d = await newDraft('estimator')
    const v = await view('estimator', d.versionId)
    const first = lines(v.workPackages)[0] as Record<string, unknown>
    const saved = await write(
      'estimator',
      'PUT',
      `/api/v1/staff/estimate-versions/${d.versionId}/draft`,
      {
        lines: [{ ...first, internalCost: { materialCostCents: 1234 } }],
        internal: { estimatorNotes: 'Synthetic confidential note' },
      },
      v.rowVersion,
    )
    const own = saved.json<View>()
    const other = await view('estimator2', d.versionId)
    expect(other.internal).toBeNull()
    expect(JSON.stringify(other)).not.toContain('Synthetic confidential note')
    // Sending internal values without the permission is refused.
    const lineId = own.lines[0]?.id
    const refused = await write(
      'estimator2',
      'PUT',
      `/api/v1/staff/estimate-versions/${d.versionId}/draft`,
      { lines: [{ ...first, id: lineId, internalCost: null }] },
      own.rowVersion,
    )
    expect(refused.statusCode).toBe(403)
    // A save that leaves them out keeps them.
    const edited = await write(
      'estimator2',
      'PUT',
      `/api/v1/staff/estimate-versions/${d.versionId}/draft`,
      { lines: [{ ...first, id: lineId, description: 'Edited by another estimator' }] },
      own.rowVersion,
    )
    expect(edited.statusCode).toBe(200)
    const back = await view('estimator', d.versionId)
    expect(back.lines[0]?.id).toBe(lineId)
    expect(back.internal?.estimatorNotes).toBe('Synthetic confidential note')
    expect(back.internal?.lines[0]?.materialCostCents).toBe(1234)
  })

  it('[T40][OWN-DEC-82] the builder holds no license, permit, credential or insurance field', async () => {
    const d = await newDraft()
    const v = await view('owner', d.versionId)
    expect(JSON.stringify(Object.keys(v))).not.toMatch(/licen|permit|credential|insur/i)
  })
})

/** The request's estimate_to_write item (the open one, else the latest resolved one). */
async function estimateItem(requestId: string) {
  return t.db
    .selectFrom('ops.queue_items')
    .select(['reason', 'subject_status', 'assigned_staff_id', 'resolved_at', 'resolution'])
    .where('type', '=', 'estimate_to_write')
    .where('subject_id', '=', requestId)
    .orderBy(sql`resolved_at IS NULL`, 'desc')
    .orderBy('opened_at', 'desc')
    .executeTakeFirst()
}
const action = (requestId: string, name: string) => `/api/v1/staff/requests/${requestId}/actions/${name}`

describe('[HH-OPS-01] the pending-estimate item follows the request in the same transaction', () => {
  it('opens with Prepare Online Estimate, before any worker runs', async () => {
    const r = await readyRequest()
    expect(await estimateItem(r.id)).toMatchObject({
      reason: 'ready_for_estimate',
      subject_status: 'ready_for_estimate',
      resolved_at: null,
    })
  })

  it('is resolved when Ask a Question moves the request to "needs information"', async () => {
    const r = await readyRequest()
    const res = await write('owner', 'POST', action(r.id, 'ask-question'), {}, r.requestVersion)
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ state: 'needs_information' })
    expect(await estimateItem(r.id)).toMatchObject({ resolved_at: expect.any(Date), resolution: 'handled' })
  })

  it('is resolved when Arrange Estimate Visit moves the request to "needs site visit"', async () => {
    const r = await readyRequest()
    const res = await write(
      'owner',
      'POST',
      action(r.id, 'estimate-visit'),
      { customerExplanation: 'Synthetic: we need to measure the wall.', workPackages: ['SVC-DW-01'] },
      r.requestVersion,
    )
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ state: 'needs_site_visit' })
    expect(await estimateItem(r.id)).toMatchObject({ resolved_at: expect.any(Date), resolution: 'handled' })
  })

  it('is resolved when Not a Fit closes the request and project, even with a draft written', async () => {
    const d = await newDraft()
    expect(await estimateItem(d.id)).toMatchObject({ reason: 'estimate_draft', resolved_at: null })
    const res = await write(
      'owner',
      'POST',
      action(d.id, 'not-a-fit'),
      { category: 'coverage', customerReason: 'Synthetic: outside the service area.' },
      d.requestVersion,
    )
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ projectState: 'closed' })
    expect(await estimateItem(d.id)).toMatchObject({ resolved_at: expect.any(Date), resolution: 'handled' })
    // The worker replaying request.ready_for_estimate opens nothing for the closed request.
    const registry = createAutomationRegistry([estimateToWriteQueueAutomation()])
    await createWorker({ db: t.db, registry }).runOnce()
    expect(await estimateItem(d.id)).toMatchObject({ resolved_at: expect.any(Date) })
  })

  it('is resolved when Not a Fit routes the project to the Owner (an obligation exists)', async () => {
    const r = await readyRequest()
    withAppointment.add(r.projectId)
    const res = await owed.inject({
      method: 'POST',
      url: action(r.id, 'not-a-fit'),
      payload: { category: 'coverage', customerReason: 'Synthetic: outside the service area.' },
      headers: {
        cookie: owedSession.cookie,
        'x-csrf-token': owedSession.csrf,
        'idempotency-key': key('owed'),
        'if-match': `"${r.requestVersion}"`,
      },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ outcome: 'routed_to_owner', state: 'ready_for_estimate' })
    expect(await estimateItem(r.id)).toMatchObject({ resolved_at: expect.any(Date), resolution: 'handled' })
  })

  it('names the new responsible staff member after a reassignment', async () => {
    const r = await readyRequest()
    expect((await estimateItem(r.id))?.assigned_staff_id).not.toBe(ids.estimator2)
    const res = await write(
      'owner',
      'PUT',
      `/api/v1/staff/requests/${r.id}/responsible`,
      { staffUserId: ids.estimator2 },
      r.requestVersion,
    )
    expect(res.statusCode).toBe(200)
    expect(await estimateItem(r.id)).toMatchObject({
      assigned_staff_id: ids.estimator2,
      subject_status: 'ready_for_estimate',
      resolved_at: null,
    })
  })
})

describe('[RULE-SERVER-AUTHZ][HH-EST-05] a draft of a project that is no longer open is not written', () => {
  it('after Not a Fit closes the project, saving the draft is refused with PROJECT_NOT_OPEN and nothing changes', async () => {
    const d = await newDraft()
    const v = await view('estimator', d.versionId)
    const first = await write(
      'estimator',
      'PUT',
      `/api/v1/staff/estimate-versions/${d.versionId}/draft`,
      { lines: lines(v.workPackages).slice(0, 1) },
      v.rowVersion,
    )
    expect(first.statusCode).toBe(200)
    const before = first.json<View>()
    const closed = await write(
      'owner',
      'POST',
      action(d.id, 'not-a-fit'),
      { category: 'coverage', customerReason: 'Synthetic: outside the service area.' },
      d.requestVersion,
    )
    expect(closed.json()).toMatchObject({ projectState: 'closed' })
    expect((await view('estimator', d.versionId)).canEdit).toBe(false)

    const refused = await write(
      'estimator',
      'PUT',
      `/api/v1/staff/estimate-versions/${d.versionId}/draft`,
      { lines: lines(v.workPackages), discountCategory: 'military' },
      before.rowVersion,
    )
    expect(refused.statusCode).toBe(409)
    expect(refused.json()).toMatchObject({
      error: {
        code: 'CONFLICT',
        fieldErrors: [expect.objectContaining({ field: 'projectId', code: 'PROJECT_NOT_OPEN' })],
      },
    })
    // The Owner is refused too: no role writes a draft of a closed project.
    const owner = await write(
      'owner',
      'PUT',
      `/api/v1/staff/estimate-versions/${d.versionId}/draft`,
      { lines: [] },
      before.rowVersion,
    )
    expect(owner.statusCode).toBe(409)
    const after = await view('estimator', d.versionId)
    expect(after.rowVersion).toBe(before.rowVersion)
    expect(after.lines).toEqual(before.lines)
    expect(after.totals).toEqual(before.totals)
    expect(after.discountCategory).toBeNull()
    const audit = await t.db
      .selectFrom('platform.audit_events')
      .select('action')
      .where('target_id', '=', d.versionId)
      .orderBy('seq')
      .execute()
    expect(audit.map((a) => a.action)).toEqual(['estimate.create', 'estimate.save_draft'])
  })
})

describe('[HH-API-05] the estimates list cursor', () => {
  it('pages with the cursor it issued; a crafted cursor is a 400 VALIDATION_FAILED, never a server error', async () => {
    await newDraft()
    await newDraft()
    const page1 = await get('owner', '/api/v1/staff/estimates?limit=1')
    expect(page1.statusCode).toBe(200)
    const one = page1.json<{ items: { estimateId: string }[]; nextCursor: string }>()
    expect(one.nextCursor).toEqual(expect.any(String))
    const page2 = await get('owner', `/api/v1/staff/estimates?limit=1&cursor=${one.nextCursor}`)
    expect(page2.statusCode).toBe(200)
    const two = page2.json<{ items: { estimateId: string }[] }>()
    expect(two.items).toHaveLength(1)
    expect(two.items[0]?.estimateId).not.toBe(one.items[0]?.estimateId)

    const id = crypto.randomUUID()
    for (const crafted of [
      ['x', '-'.repeat(36)],
      ['x', id],
      ['2026-10-21 03:06:04.123456+00', '-'.repeat(36)],
      ['2026-99-99 00:00:00+00', id],
      ['2026-02-30 00:00:00+00', id],
      ['2026-10-21 25:00:00+00', id],
      ['2026-10-21 03:06:04+00', 'not-a-uuid'],
      [12, id],
      ['2026-10-21 03:06:04+00'],
      ['2026-10-21 03:06:04+00', id, 'extra'],
    ]) {
      const res = await get('owner', `/api/v1/staff/estimates?cursor=${encodeCursor(crafted)}`)
      expect(res.statusCode, JSON.stringify(crafted)).toBe(400)
      expect(res.json()).toMatchObject({
        error: { code: 'VALIDATION_FAILED', fieldErrors: [{ field: 'querystring.cursor', code: 'invalid' }] },
      })
    }
    // The staff requests list checks its cursor the same way.
    const requests = await get('owner', `/api/v1/staff/requests?cursor=${encodeCursor(['x', '-'.repeat(36)])}`)
    expect(requests.statusCode).toBe(400)
  })
})
