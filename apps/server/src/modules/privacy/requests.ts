// Privacy requests (TSK-0100; HH-PRIV-03, ENT-PrivacyRequest, OWN-DEC-71, OWN-DEC-113, OWN-DEC-70, T22,
// RULE-HUMAN-REVIEW, OQ-PRIVACY-REQUESTS). A customer asks from verified project access for an export of their data, a
// correction or deletion; the Owner reviews and decides.
// - Identity confirmation (PROPOSED, OQ-PRIVACY-REQUESTS): a one-time code entered in this session within the
//   configured freshness window (verification.limits), the same check as an approval (HH-ID-07). One open request of
//   each kind per customer.
// - Review: the scoped search (plan.ts) runs when the Owner opens the review and again when they decide; what it found
//   is kept as categories and counts (findings), never the records' content.
// - Decision: complete or decline, with the Owner's reason and a fresh sign-in (the route). Completing a deletion runs
//   the deletions the plan allows under the customer's lock, each with its log entry, and, when the Owner chooses so,
//   closes sign-in and project access (OWN-DEC-71: even while a hold keeps records; an unpaid balance never blocks
//   it); every not-recorded check (complaints, disputes, claims, invoices, payments...) must be confirmed first. The
//   outcome the customer is told names the deleted and retained categories, why, and until when where known.
// - What the request does not do here: response deadlines are NOT CONFIGURED; a correction is made in the records'
//   own screens and the decision records that it was handled; the outcome notice message is NOT CONFIGURED (no
//   approved wording; the outcome is shown in the portal while access remains).
import type { Db, Tx } from '@handyhub/db'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import { toPage, type Page, type PageRequest } from '../../api/pagination.js'
import { closeCustomerAccount } from '../accounts/accounts.js'
import { revokeGrantSessions, type CustomerSession } from '../identity/customer-sessions.js'
import { recordDeletion, scheduleObjectErasure } from './log.js'
import { customerPlan, type Plan, type PlanItem, type PlanSubject } from './plan.js'
import { eraseEstimate, estimateTarget, type CheckOutcome } from './targets.js'
import { unconfirmed } from './decisions.js'

type Reader = Db | Tx

export const PRIVACY_REQUEST_KINDS = ['export', 'correction', 'deletion'] as const
export type PrivacyRequestKind = (typeof PRIVACY_REQUEST_KINDS)[number]
export const PRIVACY_REQUEST_STATES = [
  'received',
  'under_review',
  'completed',
  'partially_completed',
  'declined',
] as const
export type PrivacyRequestState = (typeof PRIVACY_REQUEST_STATES)[number]
export const DETAILS_MAX = 2000

export type Outcome = {
  deleted: { category: string; count: number }[]
  retained: PlanItem[]
  excluded: PlanItem[]
  exportReady: boolean
  accessClosed: boolean
}

type Row = {
  id: string
  reference: string
  kind: string
  customer_id: string
  contact_id: string
  account_id: string | null
  project_id: string
  details: string | null
  state: string
  submitted_at: Date
  review_started_at: Date | null
  decided_at: Date | null
  outcome: unknown
  findings: unknown
  access_closed: boolean | null
  version: number
}

const COLUMNS = [
  'id',
  'reference',
  'kind',
  'customer_id',
  'contact_id',
  'account_id',
  'project_id',
  'details',
  'state',
  'submitted_at',
  'review_started_at',
  'decided_at',
  'outcome',
  'findings',
  'access_closed',
  'version',
] as const

/** Who the session is: the verified contact (an account's own contact) and the account, for this project's customer. */
export async function requesterOf(
  db: Reader,
  session: CustomerSession,
  projectId: string,
): Promise<{ customerId: string; contactId: string; accountId: string | null } | null> {
  const project = await db
    .selectFrom('crm.projects')
    .select('customer_id')
    .where('id', '=', projectId)
    .executeTakeFirst()
  if (!project) return null
  let contactId = session.contactRef
  if (session.accountId) {
    const account = await db
      .selectFrom('identity.customer_accounts')
      .select(['contact_id', 'customer_id', 'state'])
      .where('id', '=', session.accountId)
      .executeTakeFirst()
    if (!account || account.state !== 'active' || account.customer_id !== project.customer_id) return null
    contactId = account.contact_id
  }
  const contact = await db
    .selectFrom('crm.contacts')
    .select('customer_id')
    .where('id', '=', contactId)
    .executeTakeFirst()
  if (!contact || contact.customer_id !== project.customer_id) return null
  return { customerId: project.customer_id, contactId, accountId: session.accountId }
}

export type CustomerPrivacyRequest = {
  reference: string
  kind: PrivacyRequestKind
  state: PrivacyRequestState
  details: string | null
  submittedAt: Date
  decidedAt: Date | null
  outcome: Outcome | null
}

const toCustomer = (r: Row): CustomerPrivacyRequest => ({
  reference: r.reference,
  kind: r.kind as PrivacyRequestKind,
  state: r.state as PrivacyRequestState,
  details: r.details,
  submittedAt: r.submitted_at,
  decidedAt: r.decided_at,
  outcome: (r.outcome as Outcome | null) ?? null,
})

/** The requester's own privacy requests about this customer, newest first. */
export async function customerPrivacyRequests(
  db: Reader,
  who: { customerId: string; contactId: string },
): Promise<CustomerPrivacyRequest[]> {
  const rows = await db
    .selectFrom('privacy.privacy_requests')
    .select(COLUMNS)
    .where('customer_id', '=', who.customerId)
    .where('contact_id', '=', who.contactId)
    .orderBy('submitted_at', 'desc')
    .orderBy('reference', 'desc')
    .execute()
  return rows.map((r) => toCustomer(r as Row))
}

/** One of the requester's own requests by its reference; null for anything else. */
export async function customerPrivacyRequest(
  db: Reader,
  who: { customerId: string; contactId: string },
  reference: string,
): Promise<(CustomerPrivacyRequest & { id: string }) | null> {
  if (!/^PR-[0-9]{6,12}$/.test(reference)) return null
  const r = await db
    .selectFrom('privacy.privacy_requests')
    .select(COLUMNS)
    .where('reference', '=', reference)
    .where('customer_id', '=', who.customerId)
    .where('contact_id', '=', who.contactId)
    .executeTakeFirst()
  return r ? { ...toCustomer(r as Row), id: r.id } : null
}

/** A new request from a verified, fresh session. */
export async function submitPrivacyRequest(
  tx: Tx,
  input: {
    kind: PrivacyRequestKind
    details: string | null
    projectId: string
    session: CustomerSession
    requestId: string
    now?: Date
  },
): Promise<CustomerPrivacyRequest & { id: string }> {
  const now = input.now ?? new Date()
  if (now.getTime() >= input.session.freshUntil.getTime())
    throw new ApiError('FORBIDDEN', {
      fieldErrors: [{ field: 'verification', code: 'FRESH_VERIFICATION_REQUIRED', message: '' }],
    })
  const who = await requesterOf(tx, input.session, input.projectId)
  if (!who) throw new ApiError('NOT_FOUND')
  const details = input.kind === 'correction' ? (input.details?.trim() ?? '') : null
  if (input.kind === 'correction' && (!details || details.length > DETAILS_MAX))
    throw new ApiError('VALIDATION_FAILED', {
      fieldErrors: [{ field: 'body.details', code: details ? 'too_long' : 'required', message: '' }],
    })
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`privacy.customer:${who.customerId}`}, 0))`.execute(tx)
  const open = await tx
    .selectFrom('privacy.privacy_requests')
    .select('reference')
    .where('customer_id', '=', who.customerId)
    .where('kind', '=', input.kind)
    .where('state', 'in', ['received', 'under_review'])
    .executeTakeFirst()
  if (open)
    throw new ApiError('CONFLICT', { fieldErrors: [{ field: 'kind', code: 'PRIVACY_REQUEST_OPEN', message: '' }] })
  const row = await tx
    .insertInto('privacy.privacy_requests')
    .values({
      kind: input.kind,
      customer_id: who.customerId,
      contact_id: who.contactId,
      account_id: who.accountId,
      project_id: input.projectId,
      details,
      identity_method: 'fresh_session_code',
      identity_verified_at: input.session.verifiedAt,
      session_id: input.session.id,
      request_id: input.requestId,
    })
    .returning(COLUMNS)
    .executeTakeFirstOrThrow()
  return { ...toCustomer(row as Row), id: row.id }
}

// ---------------------------------------------------------------------------------------------------------------
// The Owner's side

export type StaffPrivacyRequest = CustomerPrivacyRequest & {
  id: string
  version: number
  project: { reference: string }
  customer: { name: string }
  contact: { name: string; email: string | null; phone: string | null }
  account: boolean
  reviewStartedAt: Date | null
  accessClosed: boolean | null
}

type StaffRow = Row & {
  project_reference: string
  customer_name: string
  contact_name: string
  contact_email: string | null
  contact_phone: string | null
}

function staffQuery(db: Reader) {
  return db
    .selectFrom('privacy.privacy_requests as r')
    .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
    .innerJoin('crm.customers as c', 'c.id', 'r.customer_id')
    .innerJoin('crm.contacts as k', 'k.id', 'r.contact_id')
    .select([
      ...COLUMNS.map((c) => `r.${c}` as const),
      'p.reference as project_reference',
      'c.display_name as customer_name',
      'k.full_name as contact_name',
      'k.email as contact_email',
      'k.phone_e164 as contact_phone',
    ])
}

const toStaff = (r: StaffRow): StaffPrivacyRequest => ({
  ...toCustomer(r),
  id: r.id,
  version: r.version,
  project: { reference: r.project_reference },
  customer: { name: r.customer_name },
  contact: { name: r.contact_name, email: r.contact_email, phone: r.contact_phone },
  account: r.account_id !== null,
  reviewStartedAt: r.review_started_at,
  accessClosed: r.access_closed,
})

const SEQ_CURSOR = /^PR-[0-9]{6,12}$/

/** The Owner's list: open requests first when no state is chosen, oldest first (the order they arrived). */
export async function listPrivacyRequests(
  db: Db,
  filters: { state?: string },
  page: PageRequest,
): Promise<Page<StaffPrivacyRequest>> {
  if (filters.state !== undefined && !(PRIVACY_REQUEST_STATES as readonly string[]).includes(filters.state))
    throw new ApiError('VALIDATION_FAILED', {
      fieldErrors: [{ field: 'querystring.state', code: 'invalid', message: '' }],
    })
  let q = staffQuery(db)
  if (filters.state) q = q.where('r.state', '=', filters.state)
  if (page.after !== undefined) {
    const [ref] = page.after
    if (page.after.length !== 1 || typeof ref !== 'string' || !SEQ_CURSOR.test(ref))
      throw new ApiError('VALIDATION_FAILED', {
        fieldErrors: [{ field: 'querystring.cursor', code: 'invalid', message: '' }],
      })
    q = q.where('r.reference', '>', ref)
  }
  const rows = await q
    .orderBy('r.reference')
    .limit(page.limit + 1)
    .execute()
  const out = toPage(rows, page, (r) => [r.reference])
  return { items: out.items.map((r) => toStaff(r as StaffRow)), nextCursor: out.nextCursor }
}

export type StaffPrivacyDetail = StaffPrivacyRequest & {
  /** The scoped search as it is now. */
  plan: Plan
  /** What the review found when it started (categories and counts). */
  findings: { items: PlanItem[]; checks: CheckOutcome[]; at: string } | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

async function staffRow(db: Reader, id: string): Promise<StaffRow | null> {
  if (!UUID.test(id)) return null
  return ((await staffQuery(db).where('r.id', '=', id).executeTakeFirst()) as StaffRow | undefined) ?? null
}

export async function privacyRequestExists(db: Reader, id: string): Promise<boolean> {
  return (await staffRow(db, id)) !== null
}

const subjectOf = (r: Row): PlanSubject => ({
  customerId: r.customer_id,
  contactId: r.contact_id,
  accountIds: r.account_id ? [r.account_id] : [],
})

export async function privacyRequestDetail(
  db: Reader,
  id: string,
  now = new Date(),
): Promise<StaffPrivacyDetail | null> {
  const r = await staffRow(db, id)
  if (!r) return null
  return {
    ...toStaff(r),
    plan: await customerPlan(db, subjectOf(r), now),
    findings: (r.findings as StaffPrivacyDetail['findings']) ?? null,
  }
}

const lockCustomer = (tx: Tx, customerId: string) =>
  sql`SELECT pg_advisory_xact_lock(hashtextextended(${`privacy.customer:${customerId}`}, 0))`.execute(tx)

/** Opens the Owner's review: received -> under_review, keeping what the search found. */
export async function startReview(
  tx: Tx,
  input: { id: string; staffUserId: string; expectedVersion: number },
): Promise<StaffPrivacyDetail> {
  const r = await staffRow(tx, input.id)
  if (!r) throw new ApiError('NOT_FOUND')
  await lockCustomer(tx, r.customer_id)
  const now = new Date()
  if (r.state !== 'received')
    throw new ApiError('CONFLICT', { fieldErrors: [{ field: 'state', code: 'REVIEW_ALREADY_STARTED', message: '' }] })
  const plan = await customerPlan(tx, subjectOf(r), now)
  const updated = await tx
    .updateTable('privacy.privacy_requests')
    .set((eb) => ({
      state: 'under_review',
      review_started_at: now,
      review_started_by: input.staffUserId,
      findings: JSON.stringify({ items: plan.items, checks: plan.checks, at: now.toISOString() }),
      version: eb('version', '+', 1),
    }))
    .where('id', '=', r.id)
    .where('version', '=', input.expectedVersion)
    .executeTakeFirst()
  if (Number(updated.numUpdatedRows) === 0) throw new ApiError('STALE_VERSION', { current: { version: r.version } })
  return (await privacyRequestDetail(tx, r.id, now)) as StaffPrivacyDetail
}

export type DecisionInput = {
  id: string
  staffUserId: string
  expectedVersion: number
  decision: 'complete' | 'decline'
  reason: string
  confirmedChecks: readonly string[]
  /** Deletion requests: close sign-in, sessions and project access links (OWN-DEC-71). */
  closeAccess?: boolean
  requestId: string
}

export type DecisionResult = {
  detail: StaffPrivacyDetail
  deletions: { id: string; recordType: string; reference: string }[]
}

/** The Owner's decision. A deletion runs only what the plan allows now, under the customer's lock. */
export async function decidePrivacyRequest(tx: Tx, input: DecisionInput): Promise<DecisionResult> {
  const r = await staffRow(tx, input.id)
  if (!r) throw new ApiError('NOT_FOUND')
  await lockCustomer(tx, r.customer_id)
  const now = new Date()
  if (r.state === 'received')
    throw new ApiError('CONFLICT', { fieldErrors: [{ field: 'state', code: 'REVIEW_NOT_STARTED', message: '' }] })
  if (r.state !== 'under_review')
    throw new ApiError('CONFLICT', { fieldErrors: [{ field: 'state', code: 'ALREADY_DECIDED', message: '' }] })
  if (r.version !== input.expectedVersion) throw new ApiError('STALE_VERSION', { current: { version: r.version } })
  const reason = input.reason.trim()
  const deletions: DecisionResult['deletions'] = []
  let state: 'completed' | 'partially_completed' | 'declined'
  let outcome: Outcome
  let accessClosed = false
  const plan = await customerPlan(tx, subjectOf(r), now)

  if (input.decision === 'decline') {
    state = 'declined'
    outcome = { deleted: [], retained: [], excluded: [], exportReady: false, accessClosed: false }
  } else if (r.kind === 'deletion') {
    if (input.closeAccess === undefined)
      throw new ApiError('VALIDATION_FAILED', {
        fieldErrors: [{ field: 'body.closeAccess', code: 'required', message: '' }],
      })
    const missing = unconfirmed(plan.confirm, input.confirmedChecks)
    if (missing) throw missing
    const deleted: Outcome['deleted'] = []
    let estimatesDeleted = 0
    let estimatesKept = 0
    for (const e of plan.deletable.estimates) {
      // Checked again under the estimate's row lock; anything that now blocks it is kept, never forced.
      const t = await estimateTarget(tx, e.id, { now, lock: true })
      if (t.blockers.length > 0) {
        estimatesKept += 1
        continue
      }
      const expected = Object.fromEntries(t.removes.map((x) => [x.kind, x.count]))
      const entry = await recordDeletion(tx, {
        recordType: 'estimate',
        recordId: e.id,
        recordRef: e.reference,
        projectId: e.projectId,
        source: 'privacy_request',
        privacyRequestId: r.id,
        reason,
        // Before the end of the period that starts when the estimate expired or closed (OWN-DEC-70: early deletion of
        // an eligible record with a recorded reason).
        early: true,
        permanent: true,
        checksConfirmed: plan.confirm,
        removed: expected,
        decidedBy: input.staffUserId,
        requestId: input.requestId,
      })
      const erased = await eraseEstimate(tx, { estimateId: e.id, deletionId: entry.id })
      for (const [kind, count] of Object.entries(expected))
        if ((erased.removed[kind] ?? 0) !== count)
          throw new ApiError('CONFLICT', { fieldErrors: [{ field: 'record', code: 'RECORD_CHANGED', message: '' }] })
      await scheduleObjectErasure(tx, { deletionId: entry.id, keys: erased.objectKeys, requestId: input.requestId })
      deletions.push({ id: entry.id, recordType: 'estimate', reference: e.reference })
      estimatesDeleted += 1
    }
    if (estimatesDeleted) deleted.push({ category: 'unaccepted_estimates', count: estimatesDeleted })
    if (input.closeAccess) {
      accessClosed = true
      let accounts = 0
      for (const accountId of plan.deletable.accountIds) {
        const closed = await closeCustomerAccount(tx, { accountId, by: input.staffUserId, now })
        if (!closed.closed) continue
        accounts += 1
        const entry = await recordDeletion(tx, {
          recordType: 'customer_account',
          recordId: accountId,
          recordRef: `Login account (${r.reference})`,
          projectId: null,
          source: 'privacy_request',
          privacyRequestId: r.id,
          reason,
          early: false,
          permanent: true,
          checksConfirmed: plan.confirm,
          removed: {
            sign_in_values: 1,
            sessions: closed.sessions,
            project_links: closed.links,
            access_links: closed.grants,
          },
          decidedBy: input.staffUserId,
          requestId: input.requestId,
        })
        deletions.push({ id: entry.id, recordType: 'customer_account', reference: `Login account (${r.reference})` })
      }
      // The requester's own project access links and every session started from them or as this contact.
      const grants = plan.deletable.grantIds.length
        ? await tx
            .updateTable('identity.project_access_grants')
            .set({ revoked_at: now, revoke_reason: 'account_deleted', revoked_by: input.staffUserId })
            .where('id', 'in', plan.deletable.grantIds)
            .where('revoked_at', 'is', null)
            .returning('id')
            .execute()
        : []
      await revokeGrantSessions(
        tx,
        grants.map((g) => g.id),
        now,
      )
      await tx
        .updateTable('identity.customer_sessions')
        .set({ revoked_at: now, revoke_reason: 'access_revoked' })
        .where('contact_ref', '=', r.contact_id)
        .where('revoked_at', 'is', null)
        .execute()
      if (accounts) deleted.push({ category: 'login_account', count: accounts })
      if (plan.deletable.grantIds.length + plan.deletable.sessions > 0)
        deleted.push({ category: 'access_links', count: plan.deletable.grantIds.length + plan.deletable.sessions })
    }
    const after = await customerPlan(tx, subjectOf(r), now)
    const retained = after.items.filter((i) => i.disposition === 'retain')
    // An estimate that something blocked between the review and the decision is kept and said so.
    if (estimatesKept && !retained.some((i) => i.category === 'unaccepted_estimates'))
      retained.push({
        category: 'unaccepted_estimates',
        disposition: 'retain',
        count: estimatesKept,
        reason: 'active_record',
        retention: 'unaccepted_estimates',
        years: null,
        reviewAt: null,
      })
    outcome = {
      deleted,
      retained,
      excluded: after.items.filter((i) => i.disposition === 'exclude'),
      exportReady: false,
      accessClosed,
    }
    state = retained.length > 0 ? 'partially_completed' : 'completed'
  } else {
    state = 'completed'
    outcome = {
      deleted: [],
      retained: [],
      excluded: plan.items.filter((i) => i.disposition === 'exclude'),
      exportReady: r.kind === 'export',
      accessClosed: false,
    }
  }

  await tx
    .updateTable('privacy.privacy_requests')
    .set((eb) => ({
      state,
      decided_at: now,
      decided_by: input.staffUserId,
      decision_reason: reason,
      checks_confirmed: input.decision === 'complete' && r.kind === 'deletion' ? [...plan.confirm] : [],
      outcome: JSON.stringify(outcome),
      access_closed: accessClosed,
      version: eb('version', '+', 1),
    }))
    .where('id', '=', r.id)
    .execute()
  return { detail: (await privacyRequestDetail(tx, r.id, now)) as StaffPrivacyDetail, deletions }
}
