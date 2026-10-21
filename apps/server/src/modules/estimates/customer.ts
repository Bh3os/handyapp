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
// - Approval itself is the approval transaction (TSK-0057): this view never offers it. It names every reason it is not
//   available (terms, superseded, expired, not published) and the current version to review instead, or none: then
//   "Request an Updated Estimate" (OWN-DEC-103).
import type { Db, Tx } from '@handyhub/db'
import { estimateTermsDocument, estimateTermsInEffect } from '@handyhub/domain/legal'
import type { CustomerActor, DataScope } from '@handyhub/policy'
import { loadConfig } from '../../platform/config/index.js'
import type { ObjectStorage } from '../../providers/index.js'
import { legalVersions } from '../legal/index.js'
import { findProject } from '../records/index.js'
import { acceptanceCheck } from './lifecycle.js'
import { discountRowLabel } from './customer-pdf.js'
import { CUSTOMER_STATES } from './model.js'
import { customerEstimateDocument, customerVersionContent } from './projections.js'
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
    .select(['e.number', 'v.version', 'v.state', 'v.published_at', 'v.valid_until', 'v.total_cents'])
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
          },
        ]
      : [],
  )
}

export type TermsState = 'not_configured' | 'not_in_effect' | 'in_effect'
export type ApprovalReason =
  'terms_not_configured' | 'terms_not_in_effect' | 'superseded' | 'expired' | 'not_published' | 'approval_not_available'

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
  return { documentId, state: estimateTermsInEffect(recorded) ? 'in_effect' : 'not_in_effect' }
}

export type CustomerEstimateDetail = {
  reference: string
  number: string
  version: number
  status: CustomerVersionStatus
  issuerName: string | null
  publishedAt: Date
  validUntil: Date | null
  lines: {
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
  approval: { available: false; reasons: ApprovalReason[]; current: { number: string; version: number } | null }
  actions: { requestChanges: boolean; decline: boolean; requestUpdate: boolean }
  freshVerification: boolean
  responses: ResponseRecord[]
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
  // Approving online is the approval transaction of TSK-0057: never offered by this view.
  reasons.push('approval_not_available')

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
    lines: c.lines.map((l) => ({
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
    approval: { available: false, reasons, current },
    actions: {
      requestChanges: status === 'current',
      decline: status === 'current',
      requestUpdate: status === 'expired' && current === null,
    },
    freshVerification: actor.freshVerification,
    responses: await estimateResponses(db, row.estimate_id),
  }
}
