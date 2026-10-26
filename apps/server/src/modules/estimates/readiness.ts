// Publish readiness of an estimate version and the configured document details it shows (TSK-0053; HH-EST-01,
// HH-EST-05, S04 step 3, FACT-BUSINESS-NAME, FACT-BUSINESS-ADDRESS, FACT-ESTIMATE-VALIDITY, RULE-NO-INVENTED-FACTS,
// RULE-DECIDED-VALUES-ACTIVE).
// - The readiness check is what publishing (TSK-0055) runs before it moves a version on, and what the staff builder
//   shows while the estimator writes: every reason a version cannot be published yet, each with its code, the line it
//   concerns and, for a missing value, the configuration key and the open fact or question that explains it. A draft
//   can always be saved whatever readiness says (HH-EST-05).
// - Values the version needs from configuration: the issuer name (business.name), the validity period
//   (estimate.validity) and the business time zone its days are counted in (business.timezone, TSK-0055), the estimate
//   terms (legal.estimate_terms, HH-EST-13), the tax mode the totals pin (tax.mode) and the deposit rule (deposit.rule). While one is NOT CONFIGURED the version is not ready, with that key as the
//   reason; no default is ever put in its place. The mailing address is not one of them: while it is missing the
//   address line is omitted and nothing is blocked (FACT-BUSINESS-ADDRESS, HH-EST-05).
// - The stored totals must be exactly what the active configuration gives for the stored lines: a policy that changed
//   since the draft was saved (deposit, discount or tax-mode version) makes the version TOTALS_OUTDATED until it is
//   saved again, so publishing never pins a policy version the totals were not computed with.
// - An uploaded version (TSK-0054, HH-EST-11) also needs its documents: the original uploaded and processed
//   (DOCUMENT_MISSING, DOCUMENT_PROCESSING, DOCUMENT_REJECTED), a PDF for the customer (PDF_REQUIRED while a Word
//   original has none: no faithful converter exists in this deployment) and the confirmation that the document and
//   the structured amounts agree, given for the current customer PDF (AGREEMENT_NOT_CONFIRMED).
// - TSK-0125 (HH-EST-15, OWN-DEC-165): a discount is only the one the customer requested (DISCOUNT_NOT_REQUESTED), and
//   never once its verification failed (DISCOUNT_NOT_VERIFIED). A discount still pending verification is published as
//   provisional; approving it waits for the verification (discounts.ts).
import type { Db, Tx } from '@handyhub/db'
import { cents, type EstimateLineInput, isLineKind, quantityFromMinor } from '@handyhub/money'
import type { Config, ConfigKey } from '../../platform/config/index.js'
import { loadConfig } from '../../platform/config/index.js'
import { DOCX_TYPE } from './document-content.js'
import { EDITABLE_STATES, readinessProblems, type ReadinessProblem } from './model.js'
import { currentDocuments } from './documents.js'
import { computeVersionTotals, discountFor, pricingPolicies } from './pricing.js'
import { discountProblem, projectDiscount, type ProjectDiscount } from './discounts.js'

/**
 * The configuration a version cannot be published without (PROPOSED list, from HH-EST-01 and migration 0026). The
 * business time zone (TSK-0055): the validity days are counted in it (FACT-ESTIMATE-VALIDITY).
 */
export const PUBLISH_REQUIRED_KEYS = [
  'business.name',
  'estimate.validity',
  'legal.estimate_terms',
  'tax.mode',
  'deposit.rule',
  'business.timezone',
] as const satisfies readonly ConfigKey[]

export type PublishProblemCode =
  | Exclude<ReadinessProblem['code'], 'DEPOSIT_RULE_NOT_CONFIGURED'>
  | 'NOT_CONFIGURED'
  | 'VERSION_NOT_EDITABLE'
  | 'DISCOUNT_NOT_CONFIGURED'
  | 'DISCOUNT_CATEGORY_UNKNOWN'
  | 'DISCOUNT_NOT_REQUESTED'
  | 'DISCOUNT_NOT_VERIFIED'
  | 'TOTALS_OUTDATED'
  | DocumentProblemCode

/** Why an uploaded version's documents keep it from publishing (TSK-0054, HH-EST-11). */
export const DOCUMENT_PROBLEM_CODES = [
  'DOCUMENT_MISSING',
  'DOCUMENT_PROCESSING',
  'DOCUMENT_REJECTED',
  'PDF_REQUIRED',
  'AGREEMENT_NOT_CONFIRMED',
] as const
export type DocumentProblemCode = (typeof DOCUMENT_PROBLEM_CODES)[number]

export const PUBLISH_PROBLEM_CODES = [
  'NOT_CONFIGURED',
  'VERSION_NOT_EDITABLE',
  'NO_LINES',
  'QUANTITY_UNKNOWN',
  'UNIT_PRICE_MISSING',
  'DESCRIPTION_MISSING',
  'LINE_NOT_POSITIVE',
  'NOT_AN_OPTION',
  'TOTAL_NOT_POSITIVE',
  'UNSUPPORTED_CURRENCY',
  'DISCOUNT_NOT_CONFIGURED',
  'DISCOUNT_CATEGORY_UNKNOWN',
  'DISCOUNT_NOT_REQUESTED',
  'DISCOUNT_NOT_VERIFIED',
  'TOTALS_OUTDATED',
  ...DOCUMENT_PROBLEM_CODES,
] as const satisfies readonly PublishProblemCode[]

export type PublishProblem = {
  readonly code: PublishProblemCode
  /** The line (0-based position in the version) the problem concerns. */
  readonly line?: number
  /** NOT_CONFIGURED: the configuration key that is missing, and the graph ids that explain why. */
  readonly key?: ConfigKey
  readonly sourceIds?: readonly string[]
}

export type Readiness = { readonly ready: boolean; readonly problems: readonly PublishProblem[] }

/** The current documents of an uploaded version as readiness needs them. */
export type DocumentSnapshot = {
  readonly original: { readonly id: string; readonly contentType: string; readonly state: string } | null
  readonly customerPdf: { readonly id: string; readonly state: string } | null
}

/** The stored version as readiness needs it: its state, the pinned policy versions and the stored totals. */
export type VersionSnapshot = {
  readonly state: string
  readonly authoringMethod: string
  /** Uploaded versions: the customer PDF the agree-confirmation was given for, or null. */
  readonly agreementDocumentId: string | null
  /** Uploaded versions: the current documents; null for a written version. */
  readonly documents: DocumentSnapshot | null
  readonly discountCategory: string | null
  readonly discountRuleVersion: number | null
  /** TSK-0125: the discount the customer requested for the project and its state; null when none was requested. */
  readonly discountRequest: Pick<ProjectDiscount, 'category' | 'state'> | null
  readonly subtotalCents: number | null
  readonly discountCents: number | null
  readonly totalCents: number | null
  readonly depositState: string | null
  readonly depositCents: number | null
  readonly depositRuleVersion: number | null
  readonly taxModeVersion: number | null
}

export type LineSnapshot = {
  readonly kind: string
  readonly description: string | null
  /** Thousandths of the unit, or null while unknown. */
  readonly quantityMilli: number | null
  readonly unitPriceCents: number | null
}

/** The readiness of one version under the active configuration. Pure: the same inputs always give the same answer. */
export function readinessOf(version: VersionSnapshot, lines: readonly LineSnapshot[], config: Config): Readiness {
  const problems: PublishProblem[] = []
  for (const key of PUBLISH_REQUIRED_KEYS) {
    const entry = config.get(key)
    if (entry.state === 'NOT_CONFIGURED')
      problems.push({ code: 'NOT_CONFIGURED', key, sourceIds: [...entry.sourceIds] })
  }
  if (!(EDITABLE_STATES as readonly string[]).includes(version.state)) problems.push({ code: 'VERSION_NOT_EDITABLE' })

  const policies = pricingPolicies(config)
  const discount = discountFor(policies, version.discountCategory)
  if (!discount.ok) problems.push({ code: discount.problem.code })
  else {
    const requested = discountProblem(version.discountCategory, version.discountRequest, 'publish')
    if (requested) problems.push({ code: requested as 'DISCOUNT_NOT_REQUESTED' | 'DISCOUNT_NOT_VERIFIED' })
  }
  const applied = discount.ok ? discount.discount : null

  const priced = computeVersionTotals({
    lines: lines.map((l): EstimateLineInput => ({
      kind: isLineKind(l.kind) ? l.kind : 'base',
      quantity: l.quantityMilli === null ? null : quantityFromMinor(l.quantityMilli),
      unitPrice: l.unitPriceCents === null ? null : cents(l.unitPriceCents),
    })),
    policies,
    discountPercent: applied?.percent ?? null,
  })
  const content = readinessProblems(
    lines.map((l) => ({ description: l.description })),
    priced.problems,
    priced.totals?.depositState ?? null,
  )
  // The deposit rule is reported once, as the missing configuration value above.
  for (const p of content)
    if (p.code !== 'DEPOSIT_RULE_NOT_CONFIGURED')
      problems.push(p.line === undefined ? { code: p.code } : { code: p.code, line: p.line })

  const t = priced.totals
  if (t && discount.ok) {
    const same =
      version.subtotalCents === t.subtotal &&
      version.discountCents === t.discount &&
      version.totalCents === t.total &&
      version.depositState === t.depositState &&
      version.depositCents === t.deposit &&
      version.depositRuleVersion === t.depositRuleVersion &&
      version.taxModeVersion === t.taxModeVersion &&
      version.discountRuleVersion === (applied?.version ?? null)
    if (!same) problems.push({ code: 'TOTALS_OUTDATED' })
  }
  if (version.authoringMethod === 'uploaded') for (const code of documentReadiness(version)) problems.push({ code })
  return { ready: problems.length === 0, problems }
}

/** The document reasons of an uploaded version, each named once, in the order the estimator resolves them. */
export function documentReadiness(version: VersionSnapshot): DocumentProblemCode[] {
  const out = new Set<DocumentProblemCode>()
  const original = version.documents?.original ?? null
  const pdf = version.documents?.customerPdf ?? null
  if (!original) out.add('DOCUMENT_MISSING')
  else {
    for (const doc of [original, pdf]) {
      if (doc?.state === 'quarantined') out.add('DOCUMENT_PROCESSING')
      if (doc?.state === 'rejected') out.add('DOCUMENT_REJECTED')
    }
    if (original.contentType === DOCX_TYPE && (pdf === null || pdf.state === 'rejected')) out.add('PDF_REQUIRED')
  }
  if (version.agreementDocumentId === null || pdf === null || version.agreementDocumentId !== pdf.id)
    out.add('AGREEMENT_NOT_CONFIRMED')
  return [...out]
}

/** The issuer, validity and payment details a version shows, from configuration; null where NOT CONFIGURED. */
export type DocumentDetails = {
  /** The name on estimates (FACT-BUSINESS-NAME); null while NOT CONFIGURED. */
  readonly issuerName: string | null
  /** The mailing-address lines, or null: the line is then omitted (FACT-BUSINESS-ADDRESS), never replaced. */
  readonly mailingAddress: readonly string[] | null
  /** Days of validity counted from publishing (FACT-ESTIMATE-VALIDITY); null while NOT CONFIGURED. */
  readonly validityDays: number | null
  /** The terms document the version will carry (HH-EST-13); null while NOT CONFIGURED. */
  readonly termsDocumentId: string | null
  /** The discount categories of the active rule (FACT-PRICING-DISCOUNTS); null while NOT CONFIGURED. */
  readonly discountCategories: readonly string[] | null
}

export function documentDetails(config: Config): DocumentDetails {
  const name = config.get('business.name')
  const address = config.get('business.mailing_address')
  const validity = config.get('estimate.validity')
  const terms = config.get('legal.estimate_terms')
  const discount = config.get('discount.rule')
  return {
    issuerName: name.state === 'CONFIGURED' ? name.value.documentName : null,
    mailingAddress: address.state === 'CONFIGURED' ? [...address.value.lines] : null,
    validityDays: validity.state === 'CONFIGURED' ? validity.value.days : null,
    termsDocumentId: terms.state === 'CONFIGURED' ? terms.value.documentId : null,
    discountCategories: discount.state === 'CONFIGURED' ? [...discount.value.categories] : null,
  }
}

type Reader = Db | Tx

/** Reads the stored version and its lines; null when the version does not exist. */
export async function versionSnapshot(
  db: Reader,
  versionId: string,
): Promise<{ version: VersionSnapshot; lines: LineSnapshot[] } | null> {
  const v = await db
    .selectFrom('estimating.estimate_versions')
    .select([
      'project_id',
      'state',
      'authoring_method',
      'agreement_document_id',
      'discount_category',
      'discount_rule_version',
      'subtotal_cents',
      'discount_cents',
      'total_cents',
      'deposit_state',
      'deposit_cents',
      'deposit_rule_version',
      'tax_mode_version',
    ])
    .where('id', '=', versionId)
    .executeTakeFirst()
  if (!v) return null
  const lines = await db
    .selectFrom('estimating.estimate_lines')
    .select(['kind', 'description', 'quantity_milli', 'unit_price_cents'])
    .where('version_id', '=', versionId)
    .orderBy('position')
    .execute()
  const num = (x: string | number | null) => (x === null ? null : Number(x))
  const docs = v.authoring_method === 'uploaded' ? await currentDocuments(db, versionId) : null
  const requested = await projectDiscount(db, v.project_id)
  return {
    version: {
      state: v.state,
      authoringMethod: v.authoring_method,
      agreementDocumentId: v.agreement_document_id,
      documents: docs && {
        original: docs.original && {
          id: docs.original.id,
          contentType: docs.original.contentType,
          state: docs.original.state,
        },
        customerPdf: docs.customerPdf && { id: docs.customerPdf.id, state: docs.customerPdf.state },
      },
      discountCategory: v.discount_category,
      discountRuleVersion: v.discount_rule_version,
      discountRequest: requested && { category: requested.category, state: requested.state },
      subtotalCents: num(v.subtotal_cents),
      discountCents: num(v.discount_cents),
      totalCents: num(v.total_cents),
      depositState: v.deposit_state,
      depositCents: num(v.deposit_cents),
      depositRuleVersion: v.deposit_rule_version,
      taxModeVersion: v.tax_mode_version,
    },
    lines: lines.map((l) => ({
      kind: l.kind,
      description: l.description,
      quantityMilli: num(l.quantity_milli),
      unitPriceCents: num(l.unit_price_cents),
    })),
  }
}

/**
 * The publish readiness of a stored version under the active configuration, or null when it does not exist. The
 * publishing step (TSK-0055) calls this in its own transaction, under the version's row lock, and refuses to publish
 * while `ready` is false, naming the problems.
 */
export async function publishReadiness(db: Reader, versionId: string, config?: Config): Promise<Readiness | null> {
  const snapshot = await versionSnapshot(db, versionId)
  if (!snapshot) return null
  return readinessOf(snapshot.version, snapshot.lines, config ?? (await loadConfig(db)))
}
