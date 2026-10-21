// Customer and staff projections of an estimate version (TSK-0052; HH-EST-03, HH-ARC-04, HH-EST-01, T24,
// RULE-SERVER-AUTHZ).
// - The customer projection is an allow-list built from customer-facing columns only: it never reads the internal
//   cost and internal note tables, the preparer or any staff field, so an internal value cannot reach a customer
//   response, including by direct ID access. A version that is a draft or in review, a project the customer has no
//   access to and a malformed or unknown id all answer exactly like a missing record (null).
// - The staff projection shows the internal costs, margin, markup assumptions and estimator notes only to a role the
//   policy allows estimate.view_internal_cost (Owner; Estimator for their own estimates, PROPOSED); the field is
//   removed, not hidden, for every other role.
// - Amounts are read from bigint columns as integer cents (parseCents); no amount is recomputed for display, so the
//   customer sees exactly the stored, server-computed lines and totals. There is no tax line and no minimum line.
import type { Db, Tx } from '@handyhub/db'
import { type Cents, internalMargin, parseCents, quantityFromMinor, quantityToString } from '@handyhub/money'
import { type CustomerActor, decide, hasProjectAccess, type StaffActor } from '@handyhub/policy'
import { CUSTOMER_STATES, isUuid } from './model.js'

type Reader = Db | Tx

const cents = (v: string | number | null): Cents | null => (v === null ? null : parseCents(v))

export type CustomerEstimateLine = {
  position: number
  kind: string
  serviceCode: string | null
  description: string | null
  quantity: string | null
  unit: string | null
  unitPriceCents: Cents | null
  amountCents: Cents | null
}

export type CustomerEstimateVersion = {
  estimateNumber: string
  version: number
  state: string
  currency: 'USD'
  lines: CustomerEstimateLine[]
  assumptions: string[]
  exclusions: string[]
  customerResponsibilities: string[]
  dependencies: string[]
  scheduleAssumptions: string[]
  subtotalCents: Cents
  /** The discount totals row before the total (OWN-DEC-145), or null without a discount. */
  discount: { category: string; percentBps: number; amountCents: Cents } | null
  totalCents: Cents
  deposit: { required: false } | { required: true; amountCents: Cents }
  paymentTerm: string
  publishedAt: string
  validUntil: string | null
}

/** The fields a customer response may hold; every other field is forbidden (HH-ARC-04 deny-list test). */
export const CUSTOMER_VERSION_FIELDS = [
  'estimateNumber',
  'version',
  'state',
  'currency',
  'lines',
  'assumptions',
  'exclusions',
  'customerResponsibilities',
  'dependencies',
  'scheduleAssumptions',
  'subtotalCents',
  'discount',
  'totalCents',
  'deposit',
  'paymentTerm',
  'publishedAt',
  'validUntil',
] as const satisfies readonly (keyof CustomerEstimateVersion)[]

/** Shared selection of customer-facing version columns. */
async function versionRow(db: Reader, versionId: string) {
  return db
    .selectFrom('estimating.estimate_versions as v')
    .innerJoin('estimating.estimates as e', 'e.id', 'v.estimate_id')
    .select([
      'v.id',
      'v.project_id',
      'v.version',
      'v.state',
      'v.currency',
      'v.assumptions',
      'v.exclusions',
      'v.customer_responsibilities',
      'v.dependencies',
      'v.schedule_assumptions',
      'v.discount_category',
      'v.discount_percent_bps',
      'v.subtotal_cents',
      'v.discount_cents',
      'v.total_cents',
      'v.deposit_state',
      'v.deposit_cents',
      'v.payment_term',
      'v.published_at',
      'v.valid_until',
      'e.number',
    ])
    .where('v.id', '=', versionId)
    .executeTakeFirst()
}

async function lineRows(db: Reader, versionId: string) {
  return db
    .selectFrom('estimating.estimate_lines as l')
    .leftJoin('work.work_packages as wp', 'wp.id', 'l.work_package_id')
    .leftJoin('catalog.services as s', 's.id', 'wp.service_id')
    .select([
      'l.id',
      'l.position',
      'l.kind',
      'l.work_package_id',
      's.code as service_code',
      'l.description',
      'l.quantity_milli',
      'l.unit',
      'l.quantity_source',
      'l.unit_price_cents',
      'l.amount_cents',
    ])
    .where('l.version_id', '=', versionId)
    .orderBy('l.position')
    .execute()
}

const qtyText = (v: string | null) => (v === null ? null : quantityToString(quantityFromMinor(Number(v))))

/**
 * The customer view of one version, or null when it is not theirs to see (not found, no project access, a draft or a
 * version in review). Reads customer-facing columns only.
 */
export async function customerEstimateVersion(
  db: Reader,
  actor: CustomerActor,
  versionId: string,
  now = new Date(),
): Promise<CustomerEstimateVersion | null> {
  if (!isUuid(versionId)) return null
  const v = await versionRow(db, versionId)
  if (!v) return null
  if (!hasProjectAccess(actor, { projectId: v.project_id }, now)) return null
  if (!(CUSTOMER_STATES as readonly string[]).includes(v.state)) return null
  const subtotal = cents(v.subtotal_cents)
  const total = cents(v.total_cents)
  if (subtotal === null || total === null || v.published_at === null) return null
  const lines = await lineRows(db, versionId)
  const discount = cents(v.discount_cents)
  return {
    estimateNumber: v.number,
    version: v.version,
    state: v.state,
    currency: 'USD',
    lines: lines.map((l) => ({
      position: l.position,
      kind: l.kind,
      serviceCode: l.service_code ?? null,
      description: l.description,
      quantity: qtyText(l.quantity_milli),
      unit: l.unit,
      unitPriceCents: cents(l.unit_price_cents),
      amountCents: cents(l.amount_cents),
    })),
    assumptions: v.assumptions,
    exclusions: v.exclusions,
    customerResponsibilities: v.customer_responsibilities,
    dependencies: v.dependencies,
    scheduleAssumptions: v.schedule_assumptions,
    subtotalCents: subtotal,
    discount:
      v.discount_category !== null && v.discount_percent_bps !== null && discount !== null
        ? { category: v.discount_category, percentBps: v.discount_percent_bps, amountCents: discount }
        : null,
    totalCents: total,
    deposit:
      v.deposit_state === 'required' && v.deposit_cents !== null
        ? { required: true, amountCents: cents(v.deposit_cents) as Cents }
        : { required: false },
    paymentTerm: v.payment_term,
    publishedAt: v.published_at.toISOString(),
    validUntil: v.valid_until ? v.valid_until.toISOString() : null,
  }
}

const can = (
  actor: StaffActor,
  action: 'estimate.draft' | 'request.view' | 'estimate.view_internal_cost',
  projectId: string,
  ownerStaffId?: string,
) =>
  decide(actor, action, { projectId, ...(ownerStaffId ? { ownerStaffId } : {}) }, { now: new Date(), online: true })
    .effect === 'allow'

/**
 * The staff view of one version, or null when the caller may not read the project's estimates (estimate.draft or
 * request.view, PROPOSED) or the version does not exist. `internal` is present only with estimate.view_internal_cost.
 */
export async function staffEstimateVersion(db: Reader, actor: StaffActor, versionId: string) {
  if (!isUuid(versionId)) return null
  const v = await db
    .selectFrom('estimating.estimate_versions as v')
    .innerJoin('estimating.estimates as e', 'e.id', 'v.estimate_id')
    .selectAll('v')
    .select(['e.number'])
    .where('v.id', '=', versionId)
    .executeTakeFirst()
  if (!v) return null
  if (!can(actor, 'estimate.draft', v.project_id) && !can(actor, 'request.view', v.project_id)) return null
  const lines = await lineRows(db, versionId)
  const showInternal = can(actor, 'estimate.view_internal_cost', v.project_id, v.prepared_by)

  let internal = null
  if (showInternal) {
    const costs = await db
      .selectFrom('estimating.estimate_line_costs')
      .select(['line_id', 'material_cost_cents', 'labor_cost_cents', 'note'])
      .where('version_id', '=', versionId)
      .execute()
    const notes = await db
      .selectFrom('estimating.estimate_version_internals')
      .select(['markup_assumptions', 'estimator_notes'])
      .where('version_id', '=', versionId)
      .executeTakeFirst()
    const byLine = new Map(costs.map((c) => [c.line_id, c]))
    const baseLines = lines.filter((l) => l.kind === 'base')
    const revenue = cents(v.subtotal_cents)
    const knownCosts = baseLines.flatMap((l) => {
      const c = byLine.get(l.id)
      return [cents(c?.material_cost_cents ?? null), cents(c?.labor_cost_cents ?? null)].filter(
        (x): x is Cents => x !== null,
      )
    })
    internal = {
      lines: lines.map((l) => {
        const c = byLine.get(l.id)
        return {
          lineId: l.id,
          materialCostCents: cents(c?.material_cost_cents ?? null),
          laborCostCents: cents(c?.labor_cost_cents ?? null),
          note: c?.note ?? null,
        }
      }),
      // Margin of the base offer before the discount row, from the known costs; null until the totals exist.
      baseMargin: revenue === null ? null : internalMargin(revenue, knownCosts),
      markupAssumptions: notes?.markup_assumptions ?? null,
      estimatorNotes: notes?.estimator_notes ?? null,
    }
  }

  return {
    id: v.id,
    estimateId: v.estimate_id,
    estimateNumber: v.number,
    projectId: v.project_id,
    version: v.version,
    state: v.state,
    rowVersion: v.row_version,
    authoringMethod: v.authoring_method,
    currency: 'USD' as const,
    lines: lines.map((l) => ({
      id: l.id,
      position: l.position,
      kind: l.kind,
      workPackageId: l.work_package_id,
      serviceCode: l.service_code ?? null,
      description: l.description,
      quantity: qtyText(l.quantity_milli),
      unit: l.unit,
      quantitySource: l.quantity_source,
      unitPriceCents: cents(l.unit_price_cents),
      amountCents: cents(l.amount_cents),
    })),
    texts: {
      assumptions: v.assumptions,
      exclusions: v.exclusions,
      customerResponsibilities: v.customer_responsibilities,
      dependencies: v.dependencies,
      scheduleAssumptions: v.schedule_assumptions,
    },
    totals:
      v.subtotal_cents === null
        ? null
        : {
            subtotalCents: cents(v.subtotal_cents) as Cents,
            discount:
              v.discount_category !== null
                ? {
                    category: v.discount_category,
                    percentBps: v.discount_percent_bps as number,
                    amountCents: cents(v.discount_cents) as Cents,
                  }
                : null,
            totalCents: cents(v.total_cents) as Cents,
            depositState: v.deposit_state as 'not_required' | 'required' | 'not_configured',
            depositCents: cents(v.deposit_cents),
            computedAt: v.totals_computed_at?.toISOString() ?? null,
          },
    discountCategory: v.discount_category,
    // The policy versions the totals were computed with (HH-EST-03); the tax mode is a pinned reference only.
    pinned: {
      depositRuleVersion: v.deposit_rule_version,
      discountRuleVersion: v.discount_rule_version,
      taxModeVersion: v.tax_mode_version,
      validityPolicyVersion: v.validity_policy_version,
      paymentTerm: v.payment_term,
      paymentTermVersion: v.payment_term_version,
      termsVersion: v.terms_version,
    },
    preparedBy: v.prepared_by,
    createdAt: v.created_at.toISOString(),
    updatedAt: v.updated_at.toISOString(),
    publishedAt: v.published_at?.toISOString() ?? null,
    validUntil: v.valid_until?.toISOString() ?? null,
    firstViewedAt: v.first_viewed_at?.toISOString() ?? null,
    internal,
  }
}

export type StaffEstimateVersion = NonNullable<Awaited<ReturnType<typeof staffEstimateVersion>>>
