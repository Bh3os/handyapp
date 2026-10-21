// Estimates, versions and lines: creating an estimate and saving a draft version (TSK-0052; HH-DATA-02, HH-EST-01,
// HH-EST-02, HH-EST-03, HH-BASE-02, ENT-Estimate, ENT-EstimateVersion, RULE-SERVER-AUTHZ, RULE-MONEY-CENTS).
// - The server owns every amount: a draft is saved as lines (quantity, unit price) and the server computes each line
//   amount and the totals with @handyhub/money under the active configuration, then stores them with the policy
//   versions it used. Client-supplied amounts or totals are never read (HH-EST-03).
// - A draft can always be saved incomplete: an unknown quantity or a missing price stays unknown and the totals stay
//   empty until every line is priced. What is invalid is refused with a field error and nothing is stored: a negative
//   or non-decimal quantity, a non-integer, $0 or negative unit price, a line that rounds to $0.00, an unknown discount
//   category, a work package of another project (HH-DATA-02: nothing is clamped).
// - Authorization is decided here on the server through the policy (estimate.draft, Owner and Estimator), so a route
//   that calls these functions cannot skip it. Routes add the audit event (TSK-0053).
// - Internal costs and notes are written only by a role the policy allows estimate.view_internal_cost (TSK-0053): a
//   caller who may not see them cannot send them either, and a save that leaves them out keeps them as they are (an
//   omitted line cost or internal block is kept; null removes it), so another estimator's save never wipes them.
// - Only draft and in-review versions of an open project are written; the database refuses any change to a published
//   version, its lines and its internal costs (migration 0026). Lifecycle transitions and publishing are TSK-0055.
// - Both authoring methods (HH-EST-11) save the same record: an uploaded estimate's structured amounts are its lines
//   (for example one base line of quantity 1 at the total the document states, and each option as a line), priced
//   by the same server code, so both methods give the same totals, deposit and customer projection. Its documents
//   are documents.ts; a save clears the uploaded version's agree-confirmation.
import type { Tx } from '@handyhub/db'
import {
  type BasisPoints,
  type Cents,
  type EstimateLineInput,
  type EstimateProblem,
  isLineKind,
  type LineKind,
  lineTotal,
  MoneyError,
  parseCents,
  quantity as parseQuantity,
  type Quantity,
  quantityFromMinor,
} from '@handyhub/money'
import { type Action, decide, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { loadConfig } from '../../platform/config/index.js'
import { computeVersionTotals, discountFor, pricingPolicies } from './pricing.js'

/** Versions whose content can still change (ENT-EstimateVersion). */
export const EDITABLE_STATES = ['draft', 'in_review'] as const
/** Versions a customer with access to the project may read; drafts and versions in review never reach a customer. */
export const CUSTOMER_STATES = ['published', 'accepted', 'declined', 'expired', 'withdrawn', 'superseded'] as const
export const QUANTITY_SOURCES = ['measured_on_site', 'reported_by_customer'] as const
export type QuantitySource = (typeof QUANTITY_SOURCES)[number]
export const AUTHORING_METHODS = ['written', 'uploaded'] as const
export type AuthoringMethod = (typeof AUTHORING_METHODS)[number]
/** The customer-facing lists of a version (HH-EST-01). */
export const TEXT_LISTS = [
  'assumptions',
  'exclusions',
  'customerResponsibilities',
  'dependencies',
  'scheduleAssumptions',
] as const
export type TextList = (typeof TEXT_LISTS)[number]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** True for a well-formed id; anything else is answered like a missing record, never a database error. */
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

/** PROPOSED limits of one draft (no owner value exists): lines per version, list entries and their length. */
export const DRAFT_LIMITS = { lines: 200, listEntries: 50, listEntryLength: 1000, internalText: 5000 } as const

export type DraftLineInput = {
  /** An existing line of this version to keep; omitted for a new line. */
  readonly id?: string
  readonly kind?: LineKind
  readonly workPackageId?: string | null
  readonly description?: string | null
  /** Plain decimal in the line's unit ("2.5"); null while unknown (never zero for unknown). */
  readonly quantity?: string | null
  readonly unit?: string | null
  readonly quantitySource?: QuantitySource | null
  /** Integer cents; null while the price is not written yet. */
  readonly unitPriceCents?: number | null
  /** Staff-only internal cost of the line (HH-EST-03). Omitted: kept as stored; null: removed. */
  readonly internalCost?: {
    readonly materialCostCents?: number | null
    readonly laborCostCents?: number | null
    readonly note?: string | null
  } | null
}

export type DraftInput = {
  /** The full ordered list of lines: lines of the version not listed are removed. */
  readonly lines: readonly DraftLineInput[]
  /** The job's one discount category (FACT-PRICING-DISCOUNTS), or null for none. */
  readonly discountCategory?: string | null
  readonly texts?: Partial<Record<TextList, readonly string[]>>
  /** Staff-only: markup assumptions and confidential estimator notes (HH-EST-03). Omitted: kept as stored. */
  readonly internal?: { readonly markupAssumptions?: string | null; readonly estimatorNotes?: string | null } | null
}

function authorize(actor: StaffActor, action: Action, projectId: string): void {
  if (decide(actor, action, { projectId }, { now: new Date(), online: true }).effect !== 'allow') {
    throw new ApiError('FORBIDDEN')
  }
}

const field = (f: string, code: string, message: string): FieldError => ({ field: f, code, message })

/**
 * Runs the totals, turning an amount past the exact integer range into field errors (nothing is stored), never a
 * server error: each line whose own amount overflows is named; otherwise the sum is too large.
 */
function totalsOrFieldErrors<T>(
  lines: readonly { quantity: Quantity | null; unitPrice: Cents | null }[],
  errors: FieldError[],
  compute: () => T,
): T {
  try {
    return compute()
  } catch (err) {
    if (!(err instanceof MoneyError) || err.code !== 'OUT_OF_RANGE') throw err
    const before = errors.length
    lines.forEach((l, i) => {
      if (l.quantity === null || l.unitPrice === null) return
      try {
        lineTotal(l.unitPrice, l.quantity)
      } catch (e) {
        if (!(e instanceof MoneyError) || e.code !== 'OUT_OF_RANGE') throw e
        errors.push(field(`lines[${i}].unitPriceCents`, 'AMOUNT_TOO_LARGE', 'The line amount is too large.'))
      }
    })
    if (errors.length === before) errors.push(field('lines', 'TOTAL_TOO_LARGE', 'The total is too large.'))
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: errors })
  }
}

/** Creates estimate number <project reference>-E<n> with its first draft version (written or uploaded). */
export async function createEstimate(
  tx: Tx,
  actor: StaffActor,
  input: { projectId: string; authoringMethod: AuthoringMethod },
): Promise<{ estimateId: string; number: string; versionId: string; version: number }> {
  if (!isUuid(input.projectId)) throw new ApiError('NOT_FOUND')
  authorize(actor, 'estimate.draft', input.projectId)
  if (!(AUTHORING_METHODS as readonly string[]).includes(input.authoringMethod)) {
    throw new ApiError('VALIDATION_FAILED', {
      fieldErrors: [field('authoringMethod', 'INVALID', 'Choose written or uploaded.')],
    })
  }
  // The project row lock serializes estimate numbering per project.
  const project = await tx
    .selectFrom('crm.projects')
    .select(['id', 'reference', 'state', 'payment_term', 'payment_term_version'])
    .where('id', '=', input.projectId)
    .forUpdate()
    .executeTakeFirst()
  if (!project) throw new ApiError('NOT_FOUND')
  if (project.state !== 'open')
    throw new ApiError('CONFLICT', {
      fieldErrors: [field('projectId', 'PROJECT_NOT_OPEN', 'The project is not open.')],
    })
  const last = await tx
    .selectFrom('estimating.estimates')
    .select((eb) => eb.fn.max('sequence').as('max'))
    .where('project_id', '=', project.id)
    .executeTakeFirst()
  const sequence = Number(last?.max ?? 0) + 1
  const number = `${project.reference}-E${sequence}`
  const estimate = await tx
    .insertInto('estimating.estimates')
    .values({ project_id: project.id, sequence, number, created_by: actor.userId })
    .returning('id')
    .executeTakeFirstOrThrow()
  const version = await tx
    .insertInto('estimating.estimate_versions')
    .values({
      estimate_id: estimate.id,
      project_id: project.id,
      version: 1,
      authoring_method: input.authoringMethod,
      payment_term: project.payment_term,
      payment_term_version: project.payment_term_version,
      prepared_by: actor.userId,
      updated_by: actor.userId,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return { estimateId: estimate.id, number, versionId: version.id, version: 1 }
}

type ParsedLine = {
  id: string | null
  kind: LineKind
  workPackageId: string | null
  description: string | null
  quantity: Quantity | null
  unit: string | null
  quantitySource: QuantitySource | null
  unitPrice: Cents | null
  /** undefined: keep the stored cost; null: remove it. */
  cost: { material: Cents | null; labor: Cents | null; note: string | null } | null | undefined
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)

function money(v: unknown, path: string, errors: FieldError[], positive: boolean): Cents | null {
  if (v === null || v === undefined) return null
  try {
    const c = parseCents(v)
    if (positive ? c <= 0 : c < 0) {
      errors.push(
        field(
          path,
          positive ? 'NOT_POSITIVE' : 'NEGATIVE_AMOUNT',
          positive ? 'Must be above $0.00.' : 'Cannot be negative.',
        ),
      )
      return null
    }
    return c
  } catch (err) {
    if (!(err instanceof MoneyError)) throw err
    errors.push(field(path, 'NOT_INTEGER_CENTS', 'Must be a whole number of cents.'))
    return null
  }
}

function parseLine(raw: DraftLineInput, i: number, errors: FieldError[]): ParsedLine {
  const at = (f: string) => `lines[${i}].${f}`
  const kind = raw.kind ?? 'base'
  if (!isLineKind(kind)) errors.push(field(at('kind'), 'INVALID', 'Choose base, alternate or add-on.'))
  let qty: Quantity | null = null
  if (raw.quantity !== null && raw.quantity !== undefined) {
    try {
      qty = parseQuantity(String(raw.quantity))
      if (qty === 0) {
        errors.push(field(at('quantity'), 'NOT_POSITIVE', 'A quantity is above zero; leave it empty while unknown.'))
        qty = null
      }
    } catch (err) {
      if (!(err instanceof MoneyError)) throw err
      errors.push(field(at('quantity'), err.code, 'Enter a quantity of zero or more with at most three decimals.'))
    }
  }
  const source = raw.quantitySource ?? null
  if (source !== null && !(QUANTITY_SOURCES as readonly string[]).includes(source)) {
    errors.push(field(at('quantitySource'), 'INVALID', 'Measured on site or reported by the customer.'))
  }
  if (source !== null && raw.quantity == null) {
    errors.push(field(at('quantitySource'), 'QUANTITY_UNKNOWN', 'A source needs a quantity.'))
  }
  const description = text(raw.description)
  if (description !== null && description.length > 2000)
    errors.push(field(at('description'), 'TOO_LONG', 'At most 2000 characters.'))
  const unit = text(raw.unit)
  if (unit !== null && unit.length > 40) errors.push(field(at('unit'), 'TOO_LONG', 'At most 40 characters.'))
  const unitPrice = money(raw.unitPriceCents, at('unitPriceCents'), errors, true)
  const c = raw.internalCost
  const note = c ? text(c.note) : null
  if (note !== null && note.length > 2000)
    errors.push(field(at('internalCost.note'), 'TOO_LONG', 'At most 2000 characters.'))
  return {
    id: typeof raw.id === 'string' ? raw.id : null,
    kind: isLineKind(kind) ? kind : 'base',
    workPackageId: raw.workPackageId ?? null,
    description,
    quantity: qty,
    unit,
    quantitySource: source,
    unitPrice,
    cost:
      c === undefined
        ? undefined
        : c
          ? {
              material: money(c.materialCostCents, at('internalCost.materialCostCents'), errors, false),
              labor: money(c.laborCostCents, at('internalCost.laborCostCents'), errors, false),
              note,
            }
          : null,
  }
}

function parseTexts(input: DraftInput['texts'], errors: FieldError[]): Record<TextList, string[]> {
  const out = {} as Record<TextList, string[]>
  for (const key of TEXT_LISTS) {
    const list = input?.[key] ?? []
    if (!Array.isArray(list) || list.length > DRAFT_LIMITS.listEntries) {
      errors.push(field(`texts.${key}`, 'TOO_MANY', `At most ${DRAFT_LIMITS.listEntries} entries.`))
      out[key] = []
      continue
    }
    out[key] = list.flatMap((entry, i) => {
      const t = text(entry)
      if (t === null) return []
      if (t.length > DRAFT_LIMITS.listEntryLength) {
        errors.push(field(`texts.${key}[${i}]`, 'TOO_LONG', `At most ${DRAFT_LIMITS.listEntryLength} characters.`))
      }
      return [t]
    })
  }
  return out
}

/**
 * Saves the whole content of a draft or in-review version and recomputes its totals on the server. Returns the new
 * row version and the problems that still keep the totals empty (incomplete lines). `expectedRowVersion`, when
 * given, refuses a stale save (HH-API-04).
 */
export async function saveDraft(
  tx: Tx,
  actor: StaffActor,
  versionId: string,
  input: DraftInput,
  options: { expectedRowVersion?: number } = {},
): Promise<{ rowVersion: number; complete: boolean; problems: readonly ReadinessProblem[] }> {
  if (!isUuid(versionId)) throw new ApiError('NOT_FOUND')
  const current = await tx
    .selectFrom('estimating.estimate_versions')
    .select(['id', 'project_id', 'state', 'row_version', 'prepared_by'])
    .where('id', '=', versionId)
    .forUpdate()
    .executeTakeFirst()
  if (!current) throw new ApiError('NOT_FOUND')
  authorize(actor, 'estimate.draft', current.project_id)
  // Internal costs and notes: only a role that may see them may write them (HH-EST-03, RULE-SERVER-AUTHZ).
  const sendsInternal =
    input.internal !== undefined ||
    (Array.isArray(input.lines) && input.lines.some((l) => l.internalCost !== undefined))
  if (
    sendsInternal &&
    decide(
      actor,
      'estimate.view_internal_cost',
      { projectId: current.project_id, ownerStaffId: current.prepared_by },
      { now: new Date(), online: true },
    ).effect !== 'allow'
  )
    throw new ApiError('FORBIDDEN')
  // Only a draft of an open project is written, as createEstimate requires and the builder's canEdit shows; the
  // share lock waits for a Not a Fit or Owner routing that is closing the project (RULE-SERVER-AUTHZ).
  const project = await tx
    .selectFrom('crm.projects')
    .select('state')
    .where('id', '=', current.project_id)
    .forShare()
    .executeTakeFirstOrThrow()
  if (project.state !== 'open')
    throw new ApiError('CONFLICT', {
      fieldErrors: [field('projectId', 'PROJECT_NOT_OPEN', 'The project is not open.')],
    })
  if (!(EDITABLE_STATES as readonly string[]).includes(current.state)) {
    throw new ApiError('CONFLICT', {
      fieldErrors: [field('state', 'VERSION_NOT_EDITABLE', 'A published version is not edited; revise it instead.')],
    })
  }
  if (options.expectedRowVersion !== undefined && options.expectedRowVersion !== current.row_version) {
    throw new ApiError('STALE_VERSION', { current: { version: current.row_version } })
  }

  const errors: FieldError[] = []
  if (!Array.isArray(input.lines) || input.lines.length > DRAFT_LIMITS.lines) {
    throw new ApiError('VALIDATION_FAILED', {
      fieldErrors: [field('lines', 'TOO_MANY', `At most ${DRAFT_LIMITS.lines} lines.`)],
    })
  }
  const lines = input.lines.map((l, i) => parseLine(l, i, errors))
  const texts = parseTexts(input.texts, errors)
  const markup = text(input.internal?.markupAssumptions)
  const notes = text(input.internal?.estimatorNotes)
  if ((markup?.length ?? 0) > DRAFT_LIMITS.internalText)
    errors.push(field('internal.markupAssumptions', 'TOO_LONG', 'Too long.'))
  if ((notes?.length ?? 0) > DRAFT_LIMITS.internalText)
    errors.push(field('internal.estimatorNotes', 'TOO_LONG', 'Too long.'))

  // Lines keep their identity: a listed id must be a line of this version, listed once.
  const existing = await tx
    .selectFrom('estimating.estimate_lines')
    .select('id')
    .where('version_id', '=', versionId)
    .execute()
  const known = new Set(existing.map((r) => r.id))
  const seen = new Set<string>()
  lines.forEach((l, i) => {
    if (l.id === null) return
    if (!known.has(l.id) || seen.has(l.id))
      errors.push(field(`lines[${i}].id`, 'LINE_NOT_FOUND', 'Not a line of this version.'))
    seen.add(l.id)
  })
  // Work packages of this project only (HH-SVC-04).
  const packageIds = [...new Set(lines.flatMap((l) => (l.workPackageId ? [l.workPackageId] : [])))]
  const packages = packageIds.length
    ? await tx
        .selectFrom('work.work_packages')
        .select('id')
        .where('project_id', '=', current.project_id)
        .where(sql<boolean>`id::text = ANY(${packageIds})`)
        .execute()
    : []
  const ownPackages = new Set(packages.map((p) => p.id))
  lines.forEach((l, i) => {
    if (l.workPackageId && !ownPackages.has(l.workPackageId)) {
      errors.push(field(`lines[${i}].workPackageId`, 'WORK_PACKAGE_NOT_FOUND', 'Not a work package of this project.'))
    }
  })

  // Discount from configuration (FACT-PRICING-DISCOUNTS, OWN-DEC-145).
  const config = await loadConfig(tx)
  const policies = pricingPolicies(config)
  const discount = discountFor(policies, text(input.discountCategory))
  if (!discount.ok) {
    errors.push(
      field(
        'discountCategory',
        discount.problem.code,
        discount.problem.code === 'DISCOUNT_NOT_CONFIGURED'
          ? 'The discount rule is NOT CONFIGURED.'
          : 'Not a discount category of the active discount rule.',
      ),
    )
  }

  // Server totals; a line that rounds to $0.00 or below is refused now, not at publishing only (OWN-DEC-145).
  const pricedLines: EstimateLineInput[] = lines.map((l) => ({
    kind: l.kind,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
  }))
  const discountPercent: BasisPoints | null = discount.ok ? (discount.discount?.percent ?? null) : null
  const priced = totalsOrFieldErrors(lines, errors, () =>
    computeVersionTotals({ lines: pricedLines, policies, discountPercent }),
  )
  for (const p of priced.problems) {
    if (p.code === 'LINE_NOT_POSITIVE') {
      errors.push(field(`lines[${p.line}].unitPriceCents`, 'LINE_NOT_POSITIVE', 'The line amount must be above $0.00.'))
    }
    if (p.code === 'TOTAL_NOT_POSITIVE')
      errors.push(field('discountCategory', 'TOTAL_NOT_POSITIVE', 'The total must be above $0.00.'))
  }
  if (errors.length > 0) throw new ApiError('VALIDATION_FAILED', { fieldErrors: errors })

  // Write: lines not listed are removed; listed lines are updated in place; new lines are inserted.
  const keep = lines.flatMap((l) => (l.id ? [l.id] : []))
  await tx
    .deleteFrom('estimating.estimate_lines')
    .where('version_id', '=', versionId)
    .$if(keep.length > 0, (q) => q.where('id', 'not in', keep))
    .execute()
  for (const [i, l] of lines.entries()) {
    const amount = priced.lineAmounts[i] ?? null
    const values = {
      position: i + 1,
      kind: l.kind,
      work_package_id: l.workPackageId,
      description: l.description,
      quantity_milli: l.quantity === null ? null : quantityFromMinor(l.quantity),
      unit: l.unit,
      quantity_source: l.quantitySource,
      unit_price_cents: l.unitPrice,
      amount_cents: amount,
      updated_at: new Date(),
    }
    const lineId = l.id
      ? (
          await tx
            .updateTable('estimating.estimate_lines')
            .set(values)
            .where('id', '=', l.id)
            .where('version_id', '=', versionId)
            .returning('id')
            .executeTakeFirstOrThrow()
        ).id
      : (
          await tx
            .insertInto('estimating.estimate_lines')
            .values({ ...values, version_id: versionId, project_id: current.project_id })
            .returning('id')
            .executeTakeFirstOrThrow()
        ).id
    if (l.cost === undefined) {
      // Omitted: the stored cost of an existing line stays as it is.
    } else if (l.cost && (l.cost.material !== null || l.cost.labor !== null || l.cost.note !== null)) {
      const cost = {
        material_cost_cents: l.cost.material,
        labor_cost_cents: l.cost.labor,
        note: l.cost.note,
        updated_at: new Date(),
      }
      await tx
        .insertInto('estimating.estimate_line_costs')
        .values({ ...cost, line_id: lineId, version_id: versionId })
        .onConflict((oc) => oc.column('line_id').doUpdateSet(cost))
        .execute()
    } else {
      await tx.deleteFrom('estimating.estimate_line_costs').where('line_id', '=', lineId).execute()
    }
  }
  if (input.internal !== undefined) {
    const internal = { markup_assumptions: markup, estimator_notes: notes, updated_at: new Date() }
    await tx
      .insertInto('estimating.estimate_version_internals')
      .values({ ...internal, version_id: versionId })
      .onConflict((oc) => oc.column('version_id').doUpdateSet(internal))
      .execute()
  }

  const t = priced.totals
  const applied = discount.ok ? discount.discount : null
  const rowVersion = current.row_version + 1
  await tx
    .updateTable('estimating.estimate_versions')
    .set({
      assumptions: texts.assumptions,
      exclusions: texts.exclusions,
      customer_responsibilities: texts.customerResponsibilities,
      dependencies: texts.dependencies,
      schedule_assumptions: texts.scheduleAssumptions,
      discount_category: applied?.category ?? null,
      discount_percent_bps: applied?.percent ?? null,
      discount_rule_version: applied?.version ?? null,
      subtotal_cents: t?.subtotal ?? null,
      discount_cents: t?.discount ?? null,
      total_cents: t?.total ?? null,
      deposit_state: t?.depositState ?? null,
      deposit_cents: t?.deposit ?? null,
      deposit_rule_version: t?.depositRuleVersion ?? null,
      tax_mode_version: t?.taxModeVersion ?? null,
      totals_computed_at: t ? new Date() : null,
      // Uploaded versions (TSK-0054, HH-EST-11): changed amounts need a new agree-confirmation, so a save clears it.
      agreement_document_id: null,
      agreement_confirmed_by: null,
      agreement_confirmed_at: null,
      updated_by: actor.userId,
      updated_at: new Date(),
      row_version: rowVersion,
    })
    .where('id', '=', versionId)
    .execute()
  return {
    rowVersion,
    complete: t !== null,
    problems: readinessProblems(
      lines.map((l) => ({ description: l.description })),
      priced.problems,
      t?.depositState ?? null,
    ),
  }
}

/** What still keeps a version from being complete: unpriced lines, missing descriptions, a missing deposit rule. */
export type ReadinessProblem = {
  readonly code:
    | 'QUANTITY_UNKNOWN'
    | 'UNIT_PRICE_MISSING'
    | 'DESCRIPTION_MISSING'
    | 'LINE_NOT_POSITIVE'
    | 'NOT_AN_OPTION'
    | 'NO_LINES'
    | 'TOTAL_NOT_POSITIVE'
    | 'UNSUPPORTED_CURRENCY'
    | 'DEPOSIT_RULE_NOT_CONFIGURED'
  readonly line?: number
}

export function readinessProblems(
  lines: readonly { description: string | null }[],
  pricing: readonly EstimateProblem[],
  depositState: string | null,
): ReadinessProblem[] {
  const out: ReadinessProblem[] = pricing.map((p) => ('line' in p ? { code: p.code, line: p.line } : { code: p.code }))
  lines.forEach((l, line) => {
    if (l.description === null) out.push({ code: 'DESCRIPTION_MISSING', line })
  })
  if (depositState === 'not_configured') out.push({ code: 'DEPOSIT_RULE_NOT_CONFIGURED' })
  return out.sort((a, b) => (a.line ?? -1) - (b.line ?? -1))
}
