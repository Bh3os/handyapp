// Estimate model and server-side totals against PostgreSQL 16 (TSK-0052; HH-DATA-02, HH-EST-02, HH-EST-03,
// HH-BASE-02, T02, T03, T24, T31, RULE-SERVER-AUTHZ, RULE-MONEY-CENTS). Staff, customers, requests and amounts are
// synthetic (RULE-SYNTHETIC-DATA). Publishing is TSK-0055 (lifecycle.ts publishVersion, tested in
// estimate-lifecycle.test.ts): these tests publish with one SQL update that writes the same columns as publishing, so
// the database checks it exactly as it checks the lifecycle's own update.
import { loadServiceSeed, syncServices, type Tx, withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import type { CustomerActor, StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiError } from '../../src/api/errors.js'
import {
  createEstimate,
  CUSTOMER_VERSION_FIELDS,
  customerEstimateVersion,
  type DraftInput,
  saveDraft,
  staffEstimateVersion,
} from '../../src/modules/estimates/index.js'
import { createStaffUser } from '../../src/modules/identity/accounts.js'
import { submitRequest } from '../../src/modules/requests/submit.js'
import type { SubmitBody } from '../../src/modules/requests/schema.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'

const ROLES = {
  owner: 'owner',
  office: 'office',
  estimator: 'estimator',
  estimator2: 'estimator',
  worker: 'worker',
} as const
type Person = keyof typeof ROLES

let t: TestDatabase
const staff = {} as Record<Person, StaffActor>
let seq = 0

function must<T>(v: T | undefined): T {
  if (v === undefined) throw new Error('expected a value')
  return v
}

const actorOf = (id: string, role: (typeof ROLES)[Person]): StaffActor => ({
  kind: 'staff',
  userId: id,
  roles: [role],
  capabilities: [],
  status: 'active',
  freshAuth: false,
})

const customer = (projectId: string): CustomerActor => ({
  kind: 'customer',
  contactId: '00000000-0000-4000-8000-000000000001',
  projectAccess: [{ projectId, via: 'grant' }],
  freshVerification: false,
})

beforeAll(async () => {
  t = await createTestDatabase()
  await syncServices(t.db, loadServiceSeed())
  await withTx(t.db, async (tx) => {
    for (const [p, role] of Object.entries(ROLES) as [Person, (typeof ROLES)[Person]][]) {
      const user = await createStaffUser(tx, {
        email: `${p}-estimates@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role,
        issuedBy: 'test',
      })
      staff[p] = actorOf(user.id, role)
    }
  })
})
afterAll(async () => {
  await t?.drop()
})

/** A synthetic project with one work package per service, as Prepare Online Estimate leaves it (TSK-0042). */
async function newProject(): Promise<{ projectId: string; packages: [string, string]; reference: string }> {
  seq += 1
  const body = {
    formVersion: 'test-1',
    privacyNoticeVersion: 'privacy-notice-1',
    services: [{ serviceId: 'SVC-DW-01' }, { serviceId: 'SVC-PT-01' }],
    notSure: false,
    description: 'Synthetic estimate project.',
    answers: [],
    property: { street: `${seq} Synthetic Way`, city: 'Testville', state: 'ky', zip: '40000', propertyType: 'house' },
    timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
    estimatePreference: 'online',
    contact: {
      fullName: 'Synthetic Customer',
      email: `estimate-customer-${seq}@example.test`,
      phone: '(502) 555-0101',
      preferredChannel: 'email',
    },
    smsOptIn: false,
    marketingOptIn: false,
  } as unknown as SubmitBody
  return withTx(t.db, async (tx) => {
    const out = await submitRequest(tx, body, {
      idempotencyKey: `synthetic-estimate-${String(seq).padStart(6, '0')}`,
      requestId: `test-estimates-${seq}`,
    })
    const packages: string[] = []
    for (const [i, serviceId] of ['SVC-DW-01', 'SVC-PT-01'].entries()) {
      const row = await tx
        .insertInto('work.work_packages')
        .values({
          project_id: out.projectId,
          request_id: out.requestId,
          service_id: serviceId,
          service_version: 1,
          position: i + 1,
          created_by: staff.owner.userId,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      packages.push(row.id)
    }
    const project = await tx
      .selectFrom('crm.projects')
      .select('reference')
      .where('id', '=', out.projectId)
      .executeTakeFirstOrThrow()
    return { projectId: out.projectId, packages: [must(packages[0]), must(packages[1])], reference: project.reference }
  })
}

const tx = <T>(fn: (tx: Tx) => Promise<T>) => withTx(t.db, fn)

async function newDraft(who: Person = 'estimator') {
  const project = await newProject()
  const created = await tx((x) =>
    createEstimate(x, staff[who], { projectId: project.projectId, authoringMethod: 'written' }),
  )
  return { ...project, ...created }
}

const save = (versionId: string, input: DraftInput, who: Person = 'estimator') =>
  tx((x) => saveDraft(x, staff[who], versionId, input))

/** The field errors of a refused save, or a failure when it was not refused. */
async function refused(p: Promise<unknown>): Promise<{ status: number; fields: string[] }> {
  try {
    await p
  } catch (err) {
    if (!(err instanceof ApiError)) throw err
    return {
      status: err.status,
      fields: (err.options.fieldErrors ?? []).map((f) => `${f.field}:${f.code}`),
    }
  }
  throw new Error('expected the call to be refused')
}

async function publish(versionId: string) {
  await sql`UPDATE estimating.estimate_versions
            SET state = 'published', state_changed_at = now(), published_at = now(),
                published_by = ${staff.owner.userId}, valid_until = now() + interval '14 days',
                validity_policy_version = 1, terms_version = 'test-estimate-terms-1',
                customer_pdf_object_key = ${`estimates/published/${crypto.randomUUID()}`},
                customer_pdf_sha256 = ${'0'.repeat(64)}, customer_pdf_byte_size = 1
            WHERE id = ${versionId}`.execute(t.db)
}

const versionRow = (id: string) =>
  t.db.selectFrom('estimating.estimate_versions').selectAll().where('id', '=', id).executeTakeFirstOrThrow()

describe('[HH-EST-03][HH-DATA-02][T31] estimates and server-computed totals', () => {
  it('creates numbered estimates with a first draft version that copies the project payment term', async () => {
    const d = await newDraft()
    expect(d.number).toBe(`${d.reference}-E1`)
    expect(d.version).toBe(1)
    const second = await tx((x) =>
      createEstimate(x, staff.owner, { projectId: d.projectId, authoringMethod: 'uploaded' }),
    )
    expect(second.number).toBe(`${d.reference}-E2`)
    const v = await versionRow(d.versionId)
    expect(v).toMatchObject({ state: 'draft', currency: 'USD', payment_term: 'due_on_receipt', row_version: 1 })
    expect(v.total_cents).toBeNull()
  })

  it('computes each line half-up once, the subtotal as the sum of the lines, and pins the policy versions', async () => {
    const d = await newDraft()
    const out = await save(d.versionId, {
      lines: [
        {
          workPackageId: d.packages[0],
          description: 'Patch drywall',
          quantity: '2.5',
          unit: 'hour',
          unitPriceCents: 3333,
        },
        {
          workPackageId: d.packages[1],
          description: 'Paint wall',
          quantity: '0.125',
          unit: 'gallon',
          unitPriceCents: 12345,
        },
        { kind: 'add_on', description: 'Optional trim', quantity: '1', unit: 'job', unitPriceCents: 5000 },
      ],
      texts: { exclusions: ['Synthetic exclusion'], assumptions: ['  ', 'Synthetic assumption'] },
    })
    expect(out).toMatchObject({ complete: true, problems: [], rowVersion: 2 })
    const lines = await t.db
      .selectFrom('estimating.estimate_lines')
      .select(['position', 'kind', 'quantity_milli', 'unit_price_cents', 'amount_cents', 'currency'])
      .where('version_id', '=', d.versionId)
      .orderBy('position')
      .execute()
    // 2.5 x $33.33 = $83.325 -> $83.33; 0.125 x $123.45 = $15.43125 -> $15.43; the add-on is not in the base total.
    expect(lines).toEqual([
      {
        position: 1,
        kind: 'base',
        quantity_milli: '2500',
        unit_price_cents: '3333',
        amount_cents: '8333',
        currency: 'USD',
      },
      {
        position: 2,
        kind: 'base',
        quantity_milli: '125',
        unit_price_cents: '12345',
        amount_cents: '1543',
        currency: 'USD',
      },
      {
        position: 3,
        kind: 'add_on',
        quantity_milli: '1000',
        unit_price_cents: '5000',
        amount_cents: '5000',
        currency: 'USD',
      },
    ])
    const v = await versionRow(d.versionId)
    const active = await t.db
      .selectFrom('platform.policy_version')
      .select(['key', 'version'])
      .where('status', '=', 'active')
      .where('key', 'in', ['deposit.rule', 'tax.mode'])
      .execute()
    const versionOf = (k: string) => active.find((r) => r.key === k)?.version
    expect(v).toMatchObject({
      subtotal_cents: '9876',
      discount_cents: '0',
      total_cents: '9876',
      deposit_state: 'not_required',
      deposit_cents: null,
      deposit_rule_version: versionOf('deposit.rule'),
      tax_mode_version: versionOf('tax.mode'),
      exclusions: ['Synthetic exclusion'],
      assumptions: ['Synthetic assumption'],
    })
  })

  it('[T02][HH-BASE-02][HH-EST-02] a $35.00 estimate keeps exactly $35.00: no minimum, no top-up', async () => {
    const d = await newDraft()
    await save(d.versionId, {
      lines: [{ description: 'Small repair', quantity: '1', unit: 'job', unitPriceCents: 3500 }],
    })
    const v = await versionRow(d.versionId)
    expect(v).toMatchObject({
      subtotal_cents: '3500',
      discount_cents: '0',
      total_cents: '3500',
      deposit_state: 'not_required',
    })
    const staffView = await staffEstimateVersion(t.db, staff.owner, d.versionId)
    expect(staffView?.totals).toMatchObject({ subtotalCents: 3500, totalCents: 3500, discount: null })
  })

  it('ignores client-supplied amounts and totals: the server recomputes them', async () => {
    const d = await newDraft()
    const input = {
      lines: [{ description: 'Repair', quantity: '3', unit: 'each', unitPriceCents: 1999, amountCents: 1 }],
      totalCents: 1,
      subtotalCents: 1,
    } as unknown as DraftInput
    await save(d.versionId, input)
    const v = await versionRow(d.versionId)
    expect(v).toMatchObject({ subtotal_cents: '5997', total_cents: '5997' })
  })

  it('applies the configured discount as a totals row and the deposit on the total after it (OWN-DEC-145)', async () => {
    const d = await newDraft()
    const config = await t.db
      .selectFrom('platform.policy_version')
      .select(['key', 'version', 'value'])
      .where('status', '=', 'active')
      .where('key', 'in', ['discount.rule', 'deposit.rule'])
      .execute()
    const discountRule = config.find((r) => r.key === 'discount.rule')
    const depositRule = config.find((r) => r.key === 'deposit.rule')
    const bps = (discountRule?.value as { percentBps: number }).percentBps
    const { thresholdCents, percentBps } = depositRule?.value as { thresholdCents: number; percentBps: number }
    const lineCents = 150_005
    await save(d.versionId, {
      lines: [{ description: 'Large repair', quantity: '1', unit: 'job', unitPriceCents: lineCents }],
      discountCategory: (discountRule?.value as { categories: string[] }).categories[0] ?? null,
    })
    const v = await versionRow(d.versionId)
    // Integer arithmetic only (RULE-MONEY-CENTS): half-up on the subtotal, then half-up on the total.
    const half = (n: bigint, d: bigint) => (n * 2n + d) / (2n * d)
    const discount = half(BigInt(lineCents) * BigInt(bps), 10_000n)
    const total = BigInt(lineCents) - discount
    expect(total > BigInt(thresholdCents)).toBe(true)
    expect(v).toMatchObject({
      subtotal_cents: String(lineCents),
      discount_cents: String(discount),
      discount_percent_bps: bps,
      discount_rule_version: discountRule?.version,
      total_cents: String(total),
      deposit_state: 'required',
      deposit_cents: String(half(total * BigInt(percentBps), 10_000n)),
    })
    // The discount is never a line.
    const lines = await t.db
      .selectFrom('estimating.estimate_lines')
      .select('amount_cents')
      .where('version_id', '=', d.versionId)
      .execute()
    expect(lines).toEqual([{ amount_cents: String(lineCents) }])
  })

  it('saves an incomplete draft with unknown values kept unknown and no totals', async () => {
    const d = await newDraft()
    const out = await save(d.versionId, {
      lines: [
        { description: 'Measure first', quantity: null, unit: 'sq ft', unitPriceCents: 250 },
        { quantity: '2', unitPriceCents: null },
      ],
    })
    expect(out.complete).toBe(false)
    expect(out.problems).toEqual([
      { code: 'QUANTITY_UNKNOWN', line: 0 },
      { code: 'UNIT_PRICE_MISSING', line: 1 },
      { code: 'DESCRIPTION_MISSING', line: 1 },
    ])
    const v = await versionRow(d.versionId)
    expect(v).toMatchObject({ subtotal_cents: null, total_cents: null, deposit_state: null })
    const lines = await t.db
      .selectFrom('estimating.estimate_lines')
      .select(['quantity_milli', 'amount_cents'])
      .where('version_id', '=', d.versionId)
      .orderBy('position')
      .execute()
    expect(lines).toEqual([
      { quantity_milli: null, amount_cents: null },
      { quantity_milli: '2000', amount_cents: null },
    ])
  })

  it('[HH-EST-02][HH-DATA-02] refuses invalid lines and combinations with field errors and stores nothing', async () => {
    const d = await newDraft()
    const other = await newProject()
    const before = await versionRow(d.versionId)
    const r = await refused(
      save(d.versionId, {
        lines: [
          { description: 'Zero price', quantity: '1', unitPriceCents: 0 },
          { description: 'Negative price', quantity: '1', unitPriceCents: -500 },
          { description: 'Fraction of a cent', quantity: '1', unitPriceCents: 12.5 },
          { description: 'Negative quantity', quantity: '-1', unitPriceCents: 100 },
          { description: 'Rounds to zero', quantity: '0.001', unitPriceCents: 1 },
          { description: 'Zero quantity', quantity: '0', unitPriceCents: 100 },
          { description: 'Other project', quantity: '1', unitPriceCents: 100, workPackageId: other.packages[0] },
        ],
        discountCategory: 'synthetic_unknown_category',
      }),
    )
    expect(r.status).toBe(400)
    expect(r.fields).toEqual([
      'lines[0].unitPriceCents:NOT_POSITIVE',
      'lines[1].unitPriceCents:NOT_POSITIVE',
      'lines[2].unitPriceCents:NOT_INTEGER_CENTS',
      'lines[3].quantity:INVALID_QUANTITY',
      'lines[5].quantity:NOT_POSITIVE',
      'lines[6].workPackageId:WORK_PACKAGE_NOT_FOUND',
      'discountCategory:DISCOUNT_CATEGORY_UNKNOWN',
      'lines[4].unitPriceCents:LINE_NOT_POSITIVE',
    ])
    expect(await versionRow(d.versionId)).toEqual(before)
    const count = await t.db
      .selectFrom('estimating.estimate_lines')
      .select((eb) => eb.fn.countAll().as('n'))
      .where('version_id', '=', d.versionId)
      .executeTakeFirstOrThrow()
    expect(Number(count.n)).toBe(0)
  })

  it('[HH-DATA-02][RULE-MONEY-CENTS] an amount past the exact integer range is a field error, never a server error', async () => {
    const d = await newDraft()
    const before = await versionRow(d.versionId)
    // Each input is valid on its own; their product (or the sum of the lines) is not a safe integer of cents.
    const line = await refused(
      save(d.versionId, { lines: [{ description: 'Too large', quantity: '100000000', unitPriceCents: 100_000_000 }] }),
    )
    expect(line).toEqual({ status: 400, fields: ['lines[0].unitPriceCents:AMOUNT_TOO_LARGE'] })
    const big = { description: 'Large', quantity: '1', unitPriceCents: 5_000_000_000_000_000 }
    const sum = await refused(save(d.versionId, { lines: [big, big] }))
    expect(sum).toEqual({ status: 400, fields: ['lines:TOTAL_TOO_LARGE'] })
    expect(await versionRow(d.versionId)).toEqual(before)
  })

  it('keeps line identity across saves and removes lines no longer listed', async () => {
    const d = await newDraft()
    await save(d.versionId, {
      lines: [
        { description: 'First', quantity: '1', unitPriceCents: 1000, internalCost: { materialCostCents: 300 } },
        { description: 'Second', quantity: '1', unitPriceCents: 2000 },
      ],
    })
    const view = await staffEstimateVersion(t.db, staff.owner, d.versionId)
    const first = must(view?.lines[0])
    const second = must(view?.lines[1])
    await save(d.versionId, {
      lines: [{ id: second.id, description: 'Second, first now', quantity: '2', unitPriceCents: 2000 }],
    })
    const after = await staffEstimateVersion(t.db, staff.owner, d.versionId)
    expect(after?.lines).toEqual([expect.objectContaining({ id: second.id, position: 1, amountCents: 4000 })])
    expect(after?.totals?.totalCents).toBe(4000)
    const costs = await t.db
      .selectFrom('estimating.estimate_line_costs')
      .select('line_id')
      .where('line_id', '=', first.id)
      .execute()
    expect(costs).toEqual([])
    expect((await refused(save(d.versionId, { lines: [{ id: first.id, quantity: '1' }] }))).fields).toEqual([
      'lines[0].id:LINE_NOT_FOUND',
    ])
  })
})

describe('[RULE-SERVER-AUTHZ] only the Owner and Estimators draft estimates', () => {
  it('refuses Office and Worker, and answers a malformed id like a missing record', async () => {
    const p = await newProject()
    for (const who of ['office', 'worker'] as const) {
      const r = await refused(
        tx((x) => createEstimate(x, staff[who], { projectId: p.projectId, authoringMethod: 'written' })),
      )
      expect(r.status).toBe(403)
    }
    const d = await newDraft('owner')
    expect((await refused(save(d.versionId, { lines: [] }, 'worker'))).status).toBe(403)
    expect((await refused(save('not-a-uuid', { lines: [] }))).status).toBe(404)
    expect(await staffEstimateVersion(t.db, staff.worker, d.versionId)).toBeNull()
  })
})

describe('[T24][HH-EST-03][HH-ARC-04] internal costs never reach a customer', () => {
  const SECRET_NOTE = 'synthetic-internal-cost-note-7f3a'
  const SECRET_ESTIMATOR = 'synthetic-estimator-note-9c2e'
  const SECRET_MARKUP = 'synthetic-markup-assumption-4d1b'

  async function costedVersion() {
    const d = await newDraft()
    await save(d.versionId, {
      lines: [
        {
          workPackageId: d.packages[0],
          description: 'Customer-facing repair',
          quantity: '1',
          unit: 'job',
          quantitySource: 'measured_on_site',
          unitPriceCents: 25_000,
          internalCost: { materialCostCents: 4_321, laborCostCents: 8_765, note: SECRET_NOTE },
        },
      ],
      internal: { markupAssumptions: SECRET_MARKUP, estimatorNotes: SECRET_ESTIMATOR },
    })
    return d
  }

  it('a draft is not visible to the customer; a published version shows only allow-listed fields', async () => {
    const d = await costedVersion()
    expect(await customerEstimateVersion(t.db, customer(d.projectId), d.versionId)).toBeNull()
    await publish(d.versionId)
    const view = await customerEstimateVersion(t.db, customer(d.projectId), d.versionId)
    expect(view).toMatchObject({
      estimateNumber: d.number,
      state: 'published',
      totalCents: 25_000,
      lines: [
        {
          description: 'Customer-facing repair',
          quantity: '1',
          unit: 'job',
          amountCents: 25_000,
          serviceCode: 'DW-01',
        },
      ],
      deposit: { required: false },
      paymentTerm: 'due_on_receipt',
    })
    expect(Object.keys(view ?? {}).sort()).toEqual([...CUSTOMER_VERSION_FIELDS].sort())
    const json = JSON.stringify(view)
    for (const forbidden of [
      SECRET_NOTE,
      SECRET_ESTIMATOR,
      SECRET_MARKUP,
      '4321',
      '8765',
      staff.estimator.userId,
      'cost',
      'margin',
      'markup',
      'internal',
      'prepared',
      'measured_on_site',
      'tax',
      'minimum',
    ]) {
      expect(json.toLowerCase(), forbidden).not.toContain(forbidden.toLowerCase())
    }
  })

  it('another project, a guessed id and a malformed id answer like a missing record', async () => {
    const d = await costedVersion()
    await publish(d.versionId)
    const stranger = await newProject()
    expect(await customerEstimateVersion(t.db, customer(stranger.projectId), d.versionId)).toBeNull()
    expect(
      await customerEstimateVersion(t.db, customer(d.projectId), '00000000-0000-4000-8000-00000000abcd'),
    ).toBeNull()
    expect(await customerEstimateVersion(t.db, customer(d.projectId), "x' OR '1'='1")).toBeNull()
    const expired: CustomerActor = {
      ...customer(d.projectId),
      projectAccess: [{ projectId: d.projectId, via: 'grant', expiresAt: new Date(Date.now() - 1000) }],
    }
    expect(await customerEstimateVersion(t.db, expired, d.versionId)).toBeNull()
  })

  it('staff see internal costs and margin only with estimate.view_internal_cost', async () => {
    const d = await costedVersion()
    const owner = await staffEstimateVersion(t.db, staff.owner, d.versionId)
    expect(owner?.internal).toMatchObject({
      lines: [{ materialCostCents: 4_321, laborCostCents: 8_765, note: SECRET_NOTE }],
      baseMargin: { cost: 13_086, margin: 11_914 },
      markupAssumptions: SECRET_MARKUP,
      estimatorNotes: SECRET_ESTIMATOR,
    })
    // The preparing Estimator sees their own estimate's costs (PROPOSED matrix cell); another Estimator does not.
    expect((await staffEstimateVersion(t.db, staff.estimator, d.versionId))?.internal).not.toBeNull()
    const other = await staffEstimateVersion(t.db, staff.estimator2, d.versionId)
    expect(other).not.toBeNull()
    expect(other?.internal).toBeNull()
    const office = await staffEstimateVersion(t.db, staff.office, d.versionId)
    expect(office?.internal).toBeNull()
    expect(JSON.stringify(office)).not.toContain(SECRET_NOTE)
  })

  it('[RULE-SERVER-AUTHZ] another Estimator edits the draft but neither writes nor wipes its internal costs and notes', async () => {
    const d = await costedVersion()
    const view = await staffEstimateVersion(t.db, staff.estimator2, d.versionId)
    const lineId = must(view?.lines[0]?.id)
    // Sending internal values without estimate.view_internal_cost is refused, and nothing changes.
    for (const input of [
      { lines: [{ id: lineId, description: 'Edited', quantity: '1', unitPriceCents: 25_000, internalCost: null }] },
      {
        lines: [{ id: lineId, description: 'Edited', quantity: '1', unitPriceCents: 25_000 }],
        internal: { estimatorNotes: 'Synthetic overwrite' },
      },
    ] satisfies DraftInput[]) {
      expect((await refused(save(d.versionId, input, 'estimator2'))).status).toBe(403)
    }
    // A save that leaves them out keeps them as they are.
    await save(
      d.versionId,
      { lines: [{ id: lineId, description: 'Edited by another estimator', quantity: '2', unitPriceCents: 25_000 }] },
      'estimator2',
    )
    const back = await staffEstimateVersion(t.db, staff.estimator, d.versionId)
    expect(back?.lines[0]?.description).toBe('Edited by another estimator')
    expect(back?.internal).toMatchObject({
      lines: [{ materialCostCents: 4_321, laborCostCents: 8_765, note: SECRET_NOTE }],
      markupAssumptions: SECRET_MARKUP,
      estimatorNotes: SECRET_ESTIMATOR,
    })
  })
})

describe('[HH-DATA-03][HH-EST-10][T03] published versions are immutable and never recalculated', () => {
  it('refuses every change to a published version, its lines and its internal costs', async () => {
    const d = await newDraft()
    await save(d.versionId, {
      lines: [{ description: 'Repair', quantity: '1', unitPriceCents: 9_999, internalCost: { laborCostCents: 100 } }],
      internal: { estimatorNotes: 'Synthetic note' },
    })
    await publish(d.versionId)
    const line = await t.db
      .selectFrom('estimating.estimate_lines')
      .select('id')
      .where('version_id', '=', d.versionId)
      .executeTakeFirstOrThrow()
    const attempts = [
      sql`UPDATE estimating.estimate_versions SET total_cents = 1, subtotal_cents = 1 WHERE id = ${d.versionId}`,
      sql`UPDATE estimating.estimate_versions SET exclusions = '{x}' WHERE id = ${d.versionId}`,
      sql`UPDATE estimating.estimate_versions SET state = 'draft' WHERE id = ${d.versionId}`,
      sql`DELETE FROM estimating.estimate_versions WHERE id = ${d.versionId}`,
      sql`UPDATE estimating.estimate_lines SET description = 'Changed' WHERE id = ${line.id}`,
      sql`DELETE FROM estimating.estimate_lines WHERE id = ${line.id}`,
      sql`INSERT INTO estimating.estimate_lines (version_id, project_id, position, description)
          VALUES (${d.versionId}, ${d.projectId}, 2, 'Added')`,
      sql`UPDATE estimating.estimate_line_costs SET labor_cost_cents = 1 WHERE line_id = ${line.id}`,
      sql`UPDATE estimating.estimate_version_internals SET estimator_notes = 'x' WHERE version_id = ${d.versionId}`,
      sql`DELETE FROM estimating.estimates WHERE id = ${d.estimateId}`,
    ]
    for (const q of attempts) await expect(q.execute(t.db)).rejects.toThrow(/immutable|never|APPEND_ONLY|kept/)
    const r = await refused(save(d.versionId, { lines: [] }))
    expect(r.fields).toEqual(['state:VERSION_NOT_EDITABLE'])
    // Only the lifecycle moves forward, and the first customer view is recorded once.
    await sql`UPDATE estimating.estimate_versions SET first_viewed_at = now() WHERE id = ${d.versionId}`.execute(t.db)
    await expect(
      sql`UPDATE estimating.estimate_versions SET first_viewed_at = now() + interval '1 day' WHERE id = ${d.versionId}`.execute(
        t.db,
      ),
    ).rejects.toThrow(/once/)
    await sql`UPDATE estimating.estimate_versions SET state = 'accepted' WHERE id = ${d.versionId}`.execute(t.db)
  })

  it('a later policy version never changes a published version; a draft re-saved pins the new one', async () => {
    const published = await newDraft()
    const draft = await newDraft()
    const lines = { lines: [{ description: 'Repair', quantity: '1', unitPriceCents: 120_000 }] }
    await save(published.versionId, lines)
    await save(draft.versionId, lines)
    await publish(published.versionId)
    const before = await versionRow(published.versionId)
    const linesBefore = await t.db
      .selectFrom('estimating.estimate_lines')
      .selectAll()
      .where('version_id', '=', published.versionId)
      .execute()
    // The same decided values recorded again as a new version (no new business value is invented).
    const active = await t.db
      .selectFrom('platform.policy_version')
      .select(['key', 'value', 'source_ids'])
      .where('status', '=', 'active')
      .where('key', '=', 'deposit.rule')
      .executeTakeFirstOrThrow()
    const next = await recordPolicyVersion(t.db, {
      key: 'deposit.rule',
      value: active.value as never,
      sourceIds: active.source_ids,
      changedBy: 'test',
      reason: 'Synthetic re-recording of the same decided value',
    })
    expect(await versionRow(published.versionId)).toEqual(before)
    expect(
      await t.db
        .selectFrom('estimating.estimate_lines')
        .selectAll()
        .where('version_id', '=', published.versionId)
        .execute(),
    ).toEqual(linesBefore)
    await save(draft.versionId, lines)
    expect((await versionRow(draft.versionId)).deposit_rule_version).toBe(next)
    expect(before.deposit_rule_version).toBe(next - 1)
  })
})

describe('[HH-DATA-02][HH-EST-02] the database checks every stored amount', () => {
  it('refuses an amount that is not the half-up product, another currency, a wrong totals row or a $0 publish', async () => {
    const d = await newDraft()
    const insert = (over: Record<string, unknown>) =>
      t.db
        .insertInto('estimating.estimate_lines')
        .values({
          version_id: d.versionId,
          project_id: d.projectId,
          position: 1,
          description: 'Direct',
          quantity_milli: 2500,
          unit_price_cents: 3333,
          amount_cents: 8333,
          ...over,
        })
        .execute()
    await expect(insert({ amount_cents: 8332 })).rejects.toThrow(/estimate_lines_amount_exact/)
    await expect(insert({ currency: 'EUR' })).rejects.toThrow(/currency/)
    await expect(insert({ quantity_milli: -1, amount_cents: null, unit_price_cents: null })).rejects.toThrow(/quantity/)
    await expect(insert({ unit_price_cents: 0, amount_cents: 0 })).rejects.toThrow(/unit_price/)
    await expect(
      sql`UPDATE estimating.estimate_versions SET subtotal_cents = 100, discount_cents = 0, total_cents = 99,
          deposit_state = 'not_required', deposit_rule_version = 1, totals_computed_at = now() WHERE id = ${d.versionId}`.execute(
        t.db,
      ),
    ).rejects.toThrow(/totals_exact/)
    // A line that rounds to $0.00 can sit in a draft, but the version cannot be published with it.
    await insert({ quantity_milli: 1, unit_price_cents: 1, amount_cents: 0 })
    await sql`UPDATE estimating.estimate_versions SET subtotal_cents = 1, discount_cents = 0, total_cents = 1,
              deposit_state = 'not_required', deposit_rule_version = 1, tax_mode_version = 1,
              totals_computed_at = now() WHERE id = ${d.versionId}`.execute(t.db)
    await expect(publish(d.versionId)).rejects.toThrow(/priced above/)
  })

  it('[FACT-NO-MINIMUM][FACT-TAX-NO-LINE][FACT-NO-SURCHARGE] no column or policy key exists for a minimum, tax amount or surcharge', async () => {
    const cols = await sql<{ table_name: string; column_name: string }>`
      SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'estimating'`.execute(t.db)
    expect(cols.rows.length).toBeGreaterThan(20)
    const forbidden = /minimum|min_charge|floor|top_up|surcharge|fee|tax_(cents|amount|rate|line)|rounding_adj/
    expect(cols.rows.filter((c) => forbidden.test(c.column_name))).toEqual([])
    // The only tax column is the pinned tax-mode policy version; no amount is derived from it.
    expect(cols.rows.filter((c) => c.column_name.includes('tax')).map((c) => c.column_name)).toEqual([
      'tax_mode_version',
    ])
    const keys = await t.db.selectFrom('platform.policy_version').select('key').distinct().execute()
    expect(keys.filter((k) => /minimum|surcharge/.test(k.key))).toEqual([])
    const tax = await t.db
      .selectFrom('platform.policy_version')
      .select('value')
      .where('key', '=', 'tax.mode')
      .where('status', '=', 'active')
      .executeTakeFirstOrThrow()
    expect(tax.value).toEqual({ mode: 'no_tax_line' })
  })
})
