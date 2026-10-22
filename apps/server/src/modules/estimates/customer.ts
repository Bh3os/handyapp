// The customer's estimate view (TSK-0056; HH-EST-06, HH-EST-09, HH-EST-13, HH-PORT-10, HH-PORT-01, HH-ARC-04, T19,
// T24, OWN-DEC-103, OWN-DEC-127, FACT-ESTIMATE-VALIDITY, FACT-BUSINESS-NAME, RULE-NO-INVENTED-FACTS).
// - Every read goes through the caller's scope (TSK-0037): the project by its reference, then the estimate by its
//   number inside that project, then the version by its number. Another project, another project's estimate number,
//   an unknown version and a version that never reached the customer (draft, in review) are the same null, answered
//   NOT_FOUND. The content is the customer projection of the estimates module (customerVersionContent): customer-facing
//   columns only, never an internal cost, note, preparer or staff field; amounts are the stored integer cents.
// - The Documents tab lists every version the customer received, newest first, each with its status: current,
//   approved, declined, expired, superseded or withdrawn (HH-PORT-10). A published version past its valid-until time
//   reads as expired before the expiry job records it.
// - The terms: the version shows the terms document it pinned at publishing (HH-EST-13). Its wording is shown only
//   when it is a document this software holds and the recorded policy version names the same content hash; otherwise
//   the terms are NOT CONFIGURED and no wording is shown. A document that is not approved and attorney-reviewed is
//   shown as a draft that is not in effect (the TEST banner), and approval is refused (OQ-TERMS-OWNER-APPROVAL).
// - TSK-0057: approval is available on the current version while its pinned terms are in effect; otherwise the view
//   names every reason it is not (terms, superseded, expired, not published) and the current version to review
//   instead, or none: then "Request an Updated Estimate" (OWN-DEC-103). The view carries the content digest the
//   approval names, the customer's selected options kept on the server (HH-ID-07) with the server's total and deposit
//   for them, and, once approved, what was approved. Approving is the approval transaction (approval.ts).
// - TSK-0058 (HH-EST-12, HH-PORT-10, OWN-DEC-105): once approved, the next step (deposit due, or choose the work
//   appointment) and the approval receipt PDF: issued (a short-lived signed link) or still being prepared. The
//   Documents tab marks an approved version's receipt the same way.
import type { Db, Tx } from '@handyhub/db'
import { estimateTermsDocument, estimateTermsInEffect } from '@handyhub/domain/legal'
import type { CustomerActor, DataScope } from '@handyhub/policy'
import { customerDisplayZone, knownPropertyZone } from '@handyhub/domain'
import { loadConfig, type Config } from '../../platform/config/index.js'
import type { ObjectStorage } from '../../providers/index.js'
import { legalVersions } from '../legal/index.js'
import { findProject } from '../records/index.js'
import { approvalOfVersion, savedSelection, selectionTotals, versionContentDigest } from './approval.js'
import { acceptanceCheck } from './lifecycle.js'
import { discountRowLabel } from './customer-pdf.js'
import { CUSTOMER_STATES } from './model.js'
import { customerEstimateDocument, customerVersionContent } from './projections.js'
import { approvalNextStep, receiptOfVersion, type ApprovalNextStep, type ReceiptView } from './receipt.js'
import {
  customerVersionRow,
  customerVersionStatus,
  estimateResponses,
  type CustomerVersionRef,
  type CustomerVersionStatus,
  type ResponseRecord,
} from './responses.js'

type Reader = Db | Tx

export type CustomerEstimateListItem = {
  number: string
  version: number
  status: CustomerVersionStatus
  publishedAt: Date
  validUntil: Date | null
  totalCents: number
  /** TSK-0058: an approved version's receipt, issued or being prepared; null for any other version. */
  receipt: ReceiptView['state'] | null
}

/** The estimate versions of a project the customer received, newest first; null for a project outside the scope. */
export async function customerEstimateList(
  db: Reader,
  scope: DataScope,
  reference: string,
  now = new Date(),
): Promise<CustomerEstimateListItem[] | null> {
  const project = await findProject(db, scope, { reference })
  if (!project) return null
  const rows = await db
    .selectFrom('estimating.estimate_versions as v')
    .innerJoin('estimating.estimates as e', 'e.id', 'v.estimate_id')
    .leftJoin('estimating.approvals as a', 'a.version_id', 'v.id')
    .leftJoin('estimating.approval_receipts as rc', 'rc.approval_id', 'a.id')
    .select([
      'e.number',
      'v.version',
      'v.state',
      'v.published_at',
      'v.valid_until',
      'v.total_cents',
      'a.id as approval_id',
      'rc.id as receipt_id',
    ])
    .where('v.project_id', '=', project.id)
    .where('e.project_id', '=', project.id)
    .where('v.state', 'in', [...CUSTOMER_STATES])
    .orderBy('v.published_at', 'desc')
    .orderBy('v.version', 'desc')
    .execute()
  return rows.flatMap((r) =>
    r.published_at && r.total_cents !== null
      ? [
          {
            number: r.number,
            version: r.version,
            status: customerVersionStatus(r.state, r.valid_until, now),
            publishedAt: r.published_at,
            validUntil: r.valid_until,
            totalCents: Number(r.total_cents),
            receipt: r.approval_id ? (r.receipt_id ? ('issued' as const) : ('preparing' as const)) : null,
          },
        ]
      : [],
  )
}

export type TermsState = 'not_configured' | 'not_in_effect' | 'in_effect'
export type ApprovalReason = 'terms_not_configured' | 'terms_not_in_effect' | 'superseded' | 'expired' | 'not_published'

/** The totals of the customer's selection, as the server computes them (integer cents). */
export type SelectionView = {
  options: number[]
  subtotalCents: number
  discountCents: number
  totalCents: number
  deposit: { state: 'required' | 'not_required'; amountCents: number | null }
}
/** What was approved, once the version is approved. */
export type ApprovedView = SelectionView & { at: Date }

/** The terms a version pinned, as the customer may be shown them. */
export async function pinnedTerms(
  db: Reader,
  documentId: string | null,
): Promise<{ documentId: string | null; state: TermsState }> {
  const doc = estimateTermsDocument(documentId)
  if (!doc || documentId === null) return { documentId, state: 'not_configured' }
  const recorded = (await legalVersions(db, 'legal.estimate_terms')).find((v) => v.documentId === documentId)
  // Only the exact wording the recorded version names is ever shown (its content hash).
  if (!recorded || recorded.contentSha256 !== doc.contentSha256) return { documentId, state: 'not_configured' }
  return { documentId, state: estimateTermsInEffect(recorded, doc) ? 'in_effect' : 'not_in_effect' }
}

export type CustomerEstimateDetail = {
  reference: string
  number: string
  version: number
  status: CustomerVersionStatus
  issuerName: string | null
  publishedAt: Date
  validUntil: Date | null
  /** TSK-0123: the property's zone, or the business zone (business: true) while the property's zone is unknown. */
  validUntilZone: { zone: string; business: boolean } | null
  lines: {
    position: number
    kind: string
    serviceCode: string | null
    description: string | null
    quantity: string | null
    unit: string | null
    unitPriceCents: number | null
    amountCents: number | null
  }[]
  assumptions: string[]
  exclusions: string[]
  customerResponsibilities: string[]
  dependencies: string[]
  scheduleAssumptions: string[]
  subtotalCents: number
  /** The discount totals row before the total (OWN-DEC-145): its label as the customer PDF words it, and the amount. */
  reduction: { label: string; amountCents: number } | null
  totalCents: number
  deposit: { state: 'required' | 'not_required'; amountCents: number | null }
  paymentTerm: string
  document: { url: string; byteSize: number } | null
  terms: { documentId: string | null; state: TermsState }
  approval: {
    available: boolean
    reasons: ApprovalReason[]
    current: { number: string; version: number } | null
    /** The digest of this version's customer content, which an approval names (approval.ts). */
    contentDigest: string
    /** The customer's selected options with the server's totals (kept on the server across a stale verification). */
    selection: SelectionView | null
    approved: ApprovedView | null
    /** TSK-0058: once approved, the next step (OWN-DEC-105), or null once the project has moved past it. */
    nextStep: ApprovalNextStep | null
    /** TSK-0058: once approved, the approval receipt PDF. */
    receipt: ReceiptView | null
  }
  actions: { requestChanges: boolean; decline: boolean; requestUpdate: boolean }
  freshVerification: boolean
  responses: ResponseRecord[]
}

/**
 * The zone a version's expiry is shown in (TSK-0123; OWN-DEC-159 item 12): computed in business time (the stored
 * valid-until instant), shown in the property's own zone when it is known, otherwise in the business zone, said so.
 */
async function validityZone(db: Reader, projectId: string, config: Config) {
  const p = await db
    .selectFrom('crm.projects as p')
    .innerJoin('crm.properties as pr', 'pr.id', 'p.property_id')
    .select(['pr.time_zone', 'pr.time_zone_status'])
    .where('p.id', '=', projectId)
    .executeTakeFirst()
  const business = config.get('business.timezone')
  const known = p ? knownPropertyZone({ zone: p.time_zone, status: p.time_zone_status }) : null
  if (business.state !== 'CONFIGURED') return known ? { zone: known, business: false } : null
  return customerDisplayZone(known, business.value.zone)
}

/**
 * One version as the customer sees it, or null when it is not theirs to see. `storage` signs the short-lived link to
 * an uploaded version's customer PDF; while it is NOT CONFIGURED there is no link.
 */
export async function customerEstimateDetail(
  db: Reader,
  actor: CustomerActor,
  scope: DataScope,
  ref: CustomerVersionRef,
  storage: ObjectStorage | null,
  now = new Date(),
): Promise<CustomerEstimateDetail | null> {
  const row = await customerVersionRow(db, scope, ref)
  if (!row) return null
  const c = await customerVersionContent(db, row.id)
  if (!c || !c.totals || c.publishedAt === null) return null
  const config = await loadConfig(db)
  const name = config.get('business.name')
  const status = customerVersionStatus(row.state, row.valid_until, now)
  const terms = await pinnedTerms(db, c.termsVersion)

  const reasons: ApprovalReason[] = []
  if (terms.state === 'not_configured') reasons.push('terms_not_configured')
  if (terms.state === 'not_in_effect') reasons.push('terms_not_in_effect')
  const check = await acceptanceCheck(db, row.id, now)
  let current: { number: string; version: number } | null = null
  // An approved version needs no reason why it cannot be approved again.
  if (check && !check.acceptable && status !== 'approved') {
    reasons.push(check.code.toLowerCase() as ApprovalReason)
    if (check.current) current = { number: row.number, version: check.current.version }
  }
  const contentDigest = await versionContentDigest(db, row.id)
  if (!contentDigest) return null
  const available = status === 'current' && reasons.length === 0
  const selection =
    status === 'current' ? await selectionTotals(db, row.id, await savedSelection(db, row.id, actor.contactId)) : null
  const approvedRecord = status === 'approved' ? await approvalOfVersion(db, row.id) : null
  const view = (t: SelectionView): SelectionView => ({
    options: t.options,
    subtotalCents: t.subtotalCents,
    discountCents: t.discountCents,
    totalCents: t.totalCents,
    deposit: t.deposit,
  })

  const document = await customerEstimateDocument(db, actor, row.id, storage, now)
  const d = c.totals.deposit
  return {
    reference: row.reference,
    number: row.number,
    version: row.version,
    status,
    issuerName: name.state === 'CONFIGURED' ? name.value.documentName : null,
    publishedAt: new Date(c.publishedAt),
    validUntil: c.validUntil ? new Date(c.validUntil) : null,
    validUntilZone: await validityZone(db, row.project_id, config),
    lines: c.lines.map((l) => ({
      position: l.position,
      kind: l.kind,
      serviceCode: l.serviceCode,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceCents: l.unitPriceCents,
      amountCents: l.amountCents,
    })),
    assumptions: c.assumptions,
    exclusions: c.exclusions,
    customerResponsibilities: c.customerResponsibilities,
    dependencies: c.dependencies,
    scheduleAssumptions: c.scheduleAssumptions,
    subtotalCents: c.totals.subtotalCents,
    reduction: c.totals.discount
      ? { label: discountRowLabel(c.totals.discount), amountCents: c.totals.discount.amountCents }
      : null,
    totalCents: c.totals.totalCents,
    // A published version always has its deposit decided (migration 0032): required with its amount, or not required.
    deposit:
      d.state === 'required'
        ? { state: 'required', amountCents: d.amountCents }
        : { state: 'not_required', amountCents: null },
    paymentTerm: c.paymentTerm,
    document: document ? { url: document.url, byteSize: document.byteSize } : null,
    terms,
    approval: {
      available,
      reasons,
      current,
      contentDigest,
      selection: selection ? view(selection) : null,
      approved: approvedRecord ? { ...view(approvedRecord), at: approvedRecord.at } : null,
      nextStep: approvedRecord ? await approvalNextStep(db, row.project_id) : null,
      receipt: approvedRecord ? await receiptOfVersion(db, row.id, storage) : null,
    },
    actions: {
      requestChanges: status === 'current',
      decline: status === 'current',
      requestUpdate: status === 'expired' && current === null,
    },
    freshVerification: actor.freshVerification,
    responses: await estimateResponses(db, row.estimate_id),
  }
}
