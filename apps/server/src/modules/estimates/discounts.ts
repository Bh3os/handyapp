// Discount requests with staff verification (TSK-0125; HH-EST-15, OWN-DEC-165, OWN-DEC-145, FACT-PRICING-DISCOUNTS,
// FACT-DEPOSIT-RULE, ENT-Request, ENT-EstimateVersion, ENT-AuditEvent, RULE-NO-INVENTED-FACTS, RULE-SERVER-AUTHZ).
// - The customer asks for one discount on the request form (military, senior or returning customer; the categories
//   of discount.rule). It is saved with the request (estimating.discount_requests, and in the original submission)
//   and stays pending verification: asking never approves it.
// - Staff record what they found, and nothing else (category, result, who, when; @handyhub/domain discount): a look
//   at military, veteran or spouse documentation, or at a photo ID for a senior, gives verified or not_verified; a
//   returning customer is found by the server from the matched job history (matchedCompletedJob), never by a staff
//   judgement; a case the standard process cannot verify goes to the Owner's review (Owner Decisions), and the Owner
//   approves or declines it, or overrides a recorded result. Every result is audited by its route.
// - On the estimate: a version may carry only the discount the customer requested (DISCOUNT_NOT_REQUESTED), and is
//   published with it while it is pending (provisional: the customer sees "pending verification") or verified, never
//   once verification failed (DISCOUNT_NOT_VERIFIED). Approving needs the discount verified (the approval transaction
//   and the database both check), so an approved price never depends on an unverified discount and is never raised
//   afterwards. A failed verification on a published version asks the estimator for a revised estimate (the
//   discount_revision queue item); the revision drops the discount, and the customer approves the revised estimate.
//   Once a version of the project is approved nothing more is recorded (ESTIMATE_APPROVED).
// - No verification detail appears in any message: nothing here writes an outbox event or a message.
import type { Db, Tx } from '@handyhub/db'
import {
  discountFailed,
  discountResultProblem,
  discountState,
  isDiscountCategory,
  localDateOf,
  returningWindowStart,
  type DiscountCategory,
  type DiscountResult,
  type DiscountState,
  type LocalDate,
} from '@handyhub/domain'
import { decide, type Action, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { loadConfig, type Config } from '../../platform/config/index.js'
import { projectRoots } from '../customers/links.js'
import { staffNames, type StaffRef } from '../customers/record.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'

type Reader = Db | Tx
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })

/** The results staff record from a check of the documentation or ID, or the owner-review step. */
export const STAFF_DISCOUNT_RESULTS = ['verified', 'not_verified', 'owner_review'] as const
/** The Owner's decision on a review, or an override of a recorded result. */
export const OWNER_DISCOUNT_RESULTS = ['owner_approved', 'owner_declined'] as const
const isOwnerResult = (r: DiscountResult) => (OWNER_DISCOUNT_RESULTS as readonly string[]).includes(r)
/** The queue items a discount opens: a revised estimate to write, and the Owner's review. */
export const DISCOUNT_QUEUE_TYPES = { revision: 'discount_revision', ownerReview: 'discount_owner_review' } as const

export type ProjectDiscount = {
  readonly id: string
  readonly requestId: string
  readonly projectId: string
  readonly category: DiscountCategory
  readonly requestedAt: Date
  readonly state: DiscountState
}

/** The project's requested discount and its state, or null when the customer asked for none. */
export async function projectDiscount(db: Reader, projectId: string): Promise<ProjectDiscount | null> {
  if (!UUID.test(projectId)) return null
  const r = await db
    .selectFrom('estimating.discount_requests')
    .select([
      'id',
      'request_id',
      'project_id',
      'category',
      'requested_at',
      sql<DiscountState>`estimating.discount_state(project_id)`.as('state'),
    ])
    .where('project_id', '=', projectId)
    .executeTakeFirst()
  if (!r || !isDiscountCategory(r.category)) return null
  return {
    id: r.id,
    requestId: r.request_id,
    projectId: r.project_id,
    category: r.category,
    requestedAt: r.requested_at,
    state: r.state,
  }
}

/**
 * The discounts the request form offers, from configuration: the share and categories (discount.rule) and the
 * eligibility facts the form states (discount.eligibility_verification). Null while either is NOT CONFIGURED: the form
 * then offers no discount (nothing is guessed).
 */
export type DiscountOffer = {
  readonly percentBps: number
  readonly categories: readonly DiscountCategory[]
  readonly seniorFromAge: number
  readonly returningWithinMonths: number
}
export function discountOffer(config: Config): DiscountOffer | null {
  const rule = config.get('discount.rule')
  const eligibility = config.get('discount.eligibility_verification')
  if (rule.state !== 'CONFIGURED' || eligibility.state !== 'CONFIGURED') return null
  return {
    percentBps: rule.value.percentBps,
    categories: rule.value.categories.filter(isDiscountCategory),
    seniorFromAge: eligibility.value.senior.fromAge,
    returningWithinMonths: eligibility.value.returningCustomer.withinMonths,
  }
}

/**
 * Saves the discount the customer asked for with their request, in the submission's transaction. Refused with a field
 * error when the form could not have offered it (the discount rule is NOT CONFIGURED or does not list it).
 */
export async function recordDiscountRequest(
  tx: Tx,
  config: Config,
  input: { requestId: string; projectId: string; category: string; at: Date },
): Promise<void> {
  const offer = discountOffer(config)
  if (!offer || !offer.categories.some((c) => c === input.category))
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.requestedDiscount', 'enum')] })
  await tx
    .insertInto('estimating.discount_requests')
    .values({
      project_id: input.projectId,
      request_id: input.requestId,
      category: input.category,
      requested_at: input.at,
    })
    .execute()
}

/**
 * The completed job that makes the project's customer a returning customer, or null (OWN-DEC-165): a job of another
 * project of the same customer as staff see it now (the customer, the records merged into it and the requests linked
 * to it by staff, HH-CRM-04: matching is never automatic), operationally complete or closed after its quality review
 * passed, on a date (business time zone) within the configured months before today. A reopened job does not count
 * (PROPOSED reading of "completed and non-voided": no job is voided in this build). NOT_CONFIGURED while the window or
 * the time zone is.
 */
export async function matchedCompletedJob(
  db: Reader,
  projectId: string,
  config: Config,
  now: Date,
): Promise<{ jobId: string; completedOn: LocalDate } | null> {
  const eligibility = config.get('discount.eligibility_verification')
  const zone = config.get('business.timezone')
  if (eligibility.state !== 'CONFIGURED' || zone.state !== 'CONFIGURED')
    throw new ApiError('NOT_CONFIGURED', {
      fieldErrors: [
        field(
          eligibility.state !== 'CONFIGURED' ? 'discount.eligibility_verification' : 'business.timezone',
          'NOT_CONFIGURED',
        ),
      ],
    })
  const root = await sql<{ root: string | null }>`SELECT crm.project_customer(${projectId}::uuid) AS root`.execute(db)
  const customer = root.rows[0]?.root
  if (!customer) return null
  const projects = [...(await projectRoots(db, [customer]))]
    .filter(([id, r]) => r === customer && id !== projectId)
    .map(([id]) => id)
  if (projects.length === 0) return null
  const jobs = await db
    .selectFrom('work.jobs as j')
    .innerJoin('quality.reviews as r', 'r.job_id', 'j.id')
    .select(['j.id', 'r.passed_at'])
    .where('j.project_id', 'in', projects)
    .where('j.operational_state', 'in', ['operationally_complete', 'closed'])
    .where('r.passed_at', 'is not', null)
    .orderBy('r.passed_at', 'desc')
    .execute()
  const start = returningWindowStart(
    localDateOf(now, zone.value.zone),
    eligibility.value.returningCustomer.withinMonths,
  )
  for (const j of jobs) {
    if (!j.passed_at || j.passed_at.getTime() > now.getTime()) continue
    const completedOn = localDateOf(j.passed_at, zone.value.zone)
    if (completedOn >= start) return { jobId: j.id, completedOn }
  }
  return null
}

function allowed(actor: StaffActor, action: Action, projectId: string): boolean {
  return decide(actor, action, { projectId }, { now: new Date(), online: true }).effect === 'allow'
}

/** The project of a request, for the policy's scope; null for an unknown request. */
export async function discountRequestFacts(db: Reader, requestId: string): Promise<{ projectId: string } | null> {
  if (!UUID.test(requestId)) return null
  const r = await db.selectFrom('intake.requests').select('project_id').where('id', '=', requestId).executeTakeFirst()
  return r ? { projectId: r.project_id } : null
}

export type DiscountVerificationView = {
  position: number
  category: string
  result: string
  verifiedBy: StaffRef
  verifiedAt: Date
}
export type DiscountView = {
  requestId: string
  projectId: string
  reference: string
  /** The eligibility staff check against, from configuration; null while NOT CONFIGURED. */
  eligibility: { percentBps: number; seniorFromAge: number; returningWithinMonths: number } | null
  /** Null: the customer asked for no discount. */
  discount: {
    category: string
    requestedAt: Date
    state: DiscountState
    verifications: DiscountVerificationView[]
    /** An estimate version of the project is approved: its price is fixed and nothing more is recorded. */
    approved: boolean
    /** A published version carries the discount although its verification failed: a revised estimate is needed. */
    revisionNeeded: boolean
    /** What this caller may record now (the server decides again). */
    actions: { verify: boolean; checkJobHistory: boolean; ownerReview: boolean; decide: boolean }
  } | null
}

async function projectApproved(db: Reader, projectId: string): Promise<boolean> {
  const v = await db
    .selectFrom('estimating.estimate_versions')
    .select('id')
    .where('project_id', '=', projectId)
    .where('state', '=', 'accepted')
    .executeTakeFirst()
  return v !== undefined
}

async function publishedWithDiscount(db: Reader, projectId: string): Promise<boolean> {
  const v = await db
    .selectFrom('estimating.estimate_versions')
    .select('id')
    .where('project_id', '=', projectId)
    .where('state', '=', 'published')
    .where('discount_category', 'is not', null)
    .executeTakeFirst()
  return v !== undefined
}

/** The request's discount as staff see it, or null for an unknown request. */
export async function discountView(db: Reader, actor: StaffActor, requestId: string): Promise<DiscountView | null> {
  if (!UUID.test(requestId)) return null
  const request = await db
    .selectFrom('intake.requests')
    .select(['id', 'project_id', 'reference'])
    .where('id', '=', requestId)
    .executeTakeFirst()
  if (!request) return null
  const d = await projectDiscount(db, request.project_id)
  const offer = discountOffer(await loadConfig(db))
  const base = {
    requestId: request.id,
    projectId: request.project_id,
    reference: request.reference,
    eligibility: offer && {
      percentBps: offer.percentBps,
      seniorFromAge: offer.seniorFromAge,
      returningWithinMonths: offer.returningWithinMonths,
    },
  }
  if (!d) return { ...base, discount: null }
  const rows = await db
    .selectFrom('estimating.discount_verifications')
    .select(['position', 'category', 'result', 'verified_by', 'verified_at'])
    .where('discount_request_id', '=', d.id)
    .orderBy('position')
    .execute()
  const names = await staffNames(
    db,
    rows.map((r) => r.verified_by),
  )
  const approved = await projectApproved(db, d.projectId)
  const owner = allowed(actor, 'discount.decide', d.projectId)
  const can = (result: DiscountResult, jobHistory = false) =>
    !approved &&
    allowed(actor, isOwnerResult(result) ? 'discount.decide' : 'discount.verify', d.projectId) &&
    discountResultProblem({ category: d.category, state: d.state, result, owner, jobHistory }) === null
  return {
    ...base,
    discount: {
      category: d.category,
      requestedAt: d.requestedAt,
      state: d.state,
      verifications: rows.map((r) => ({
        position: r.position,
        category: r.category,
        result: r.result,
        verifiedBy: names.get(r.verified_by) ?? { id: r.verified_by, name: null },
        verifiedAt: r.verified_at,
      })),
      approved,
      revisionNeeded: discountFailed(d.state) && (await publishedWithDiscount(db, d.projectId)),
      actions: {
        verify: d.category !== 'returning_customer' && can('verified'),
        checkJobHistory: d.category === 'returning_customer' && can('verified', true),
        ownerReview: can('owner_review'),
        decide: owner && (can('owner_approved') || can('owner_declined')),
      },
    },
  }
}

/** The project of the request locked (the approval transaction locks it too), with its discount; refusals as CONFLICT. */
async function lockedDiscount(tx: Tx, requestId: string): Promise<ProjectDiscount> {
  const facts = await discountRequestFacts(tx, requestId)
  if (!facts) throw new ApiError('NOT_FOUND')
  await tx.selectFrom('crm.projects').select('id').where('id', '=', facts.projectId).forUpdate().execute()
  const d = await projectDiscount(tx, facts.projectId)
  if (!d) throw new ApiError('CONFLICT', { fieldErrors: [field('discount', 'NO_DISCOUNT_REQUEST')] })
  if (await projectApproved(tx, d.projectId))
    throw new ApiError('CONFLICT', { fieldErrors: [field('discount', 'ESTIMATE_APPROVED')] })
  return d
}

async function insertResult(tx: Tx, actor: StaffActor, d: ProjectDiscount, result: DiscountResult) {
  const last = await tx
    .selectFrom('estimating.discount_verifications')
    .select(sql<number>`coalesce(max(position), 0)`.as('n'))
    .where('discount_request_id', '=', d.id)
    .executeTakeFirstOrThrow()
  const row = await tx
    .insertInto('estimating.discount_verifications')
    .values({
      discount_request_id: d.id,
      project_id: d.projectId,
      position: Number(last.n) + 1,
      category: d.category,
      result,
      verified_by: actor.userId,
    })
    .returning(['id', 'position'])
    .executeTakeFirstOrThrow()
  await syncDiscountItems(tx, d.projectId)
  return { id: row.id, position: row.position, category: d.category, result, state: discountState(result) }
}

export type RecordedDiscountResult = Awaited<ReturnType<typeof insertResult>>

/**
 * Records one result on the request's discount (see the header): a staff check (verified, not_verified), sending it to
 * the Owner's review (owner_review), or the Owner's decision (owner_approved, owner_declined). FORBIDDEN outside the
 * caller's grants; CONFLICT naming the reason (NO_DISCOUNT_REQUEST, ESTIMATE_APPROVED, or a DISCOUNT_RESULT_PROBLEMS
 * code). The caller records the audit event.
 */
export async function recordDiscountResult(
  tx: Tx,
  actor: StaffActor,
  requestId: string,
  result: DiscountResult,
): Promise<RecordedDiscountResult> {
  const facts = await discountRequestFacts(tx, requestId)
  if (!facts) throw new ApiError('NOT_FOUND')
  if (!allowed(actor, isOwnerResult(result) ? 'discount.decide' : 'discount.verify', facts.projectId))
    throw new ApiError('FORBIDDEN')
  const d = await lockedDiscount(tx, requestId)
  const problem = discountResultProblem({
    category: d.category,
    state: d.state,
    result,
    owner: allowed(actor, 'discount.decide', d.projectId),
    jobHistory: false,
  })
  if (problem) throw new ApiError('CONFLICT', { fieldErrors: [field('result', problem)] })
  return insertResult(tx, actor, d, result)
}

/**
 * The returning-customer check: the server looks for a matched completed job (matchedCompletedJob) and records
 * verified or not_verified; the staff member who asked is the verifier. Checked again while no match was found
 * (records may have been linked since). CONFLICT STAFF_CHECK_ONLY for a military or senior discount.
 */
export async function checkJobHistory(
  tx: Tx,
  actor: StaffActor,
  requestId: string,
  now = new Date(),
): Promise<RecordedDiscountResult & { matched: boolean }> {
  const facts = await discountRequestFacts(tx, requestId)
  if (!facts) throw new ApiError('NOT_FOUND')
  if (!allowed(actor, 'discount.verify', facts.projectId)) throw new ApiError('FORBIDDEN')
  const d = await lockedDiscount(tx, requestId)
  if (d.category !== 'returning_customer')
    throw new ApiError('CONFLICT', { fieldErrors: [field('result', 'STAFF_CHECK_ONLY')] })
  const match = await matchedCompletedJob(tx, d.projectId, await loadConfig(tx), now)
  const result: DiscountResult = match ? 'verified' : 'not_verified'
  const problem = discountResultProblem({
    category: d.category,
    state: d.state,
    result,
    owner: false,
    jobHistory: true,
  })
  if (problem) throw new ApiError('CONFLICT', { fieldErrors: [field('result', problem)] })
  return { ...(await insertResult(tx, actor, d, result)), matched: match !== null }
}

/**
 * Keeps the project's discount queue items in line with its records, in the caller's transaction (a result recorded,
 * a version published, withdrawn, declined or expired): the Owner's review (Owner Decisions) while the discount waits
 * for it, and a revised estimate to write while a published version carries a discount whose verification failed.
 */
export async function syncDiscountItems(tx: Tx, projectId: string): Promise<void> {
  const d = await projectDiscount(tx, projectId)
  if (!d) return
  const request = await tx
    .selectFrom('intake.requests')
    .select(['id', 'reference', 'state', 'responsible_staff_id'])
    .where('id', '=', d.requestId)
    .executeTakeFirstOrThrow()
  const common = { subjectId: request.id, projectId, reference: request.reference, status: d.state }
  if (d.state === 'owner_review')
    await openQueueItem(tx, { ...common, type: DISCOUNT_QUEUE_TYPES.ownerReview, reason: 'discount_owner_review' })
  else
    await resolveQueueItem(tx, { type: DISCOUNT_QUEUE_TYPES.ownerReview, subjectId: request.id, resolution: d.state })
  if (discountFailed(d.state) && (await publishedWithDiscount(tx, projectId)))
    await openQueueItem(tx, {
      ...common,
      type: DISCOUNT_QUEUE_TYPES.revision,
      reason: 'discount_not_verified',
      assignedStaffId: request.responsible_staff_id,
    })
  else await resolveQueueItem(tx, { type: DISCOUNT_QUEUE_TYPES.revision, subjectId: request.id, resolution: 'handled' })
}

/**
 * Why a version's discount keeps it from being published (readiness) or approved: DISCOUNT_NOT_REQUESTED when it is not
 * the discount the customer asked for, DISCOUNT_NOT_VERIFIED once verification failed; for approval also
 * DISCOUNT_PENDING_VERIFICATION until it is verified. Null when the version carries no discount or it may go ahead.
 */
export function discountProblem(
  category: string | null,
  requested: Pick<ProjectDiscount, 'category' | 'state'> | null,
  stage: 'publish' | 'approve',
): 'DISCOUNT_NOT_REQUESTED' | 'DISCOUNT_NOT_VERIFIED' | 'DISCOUNT_PENDING_VERIFICATION' | null {
  if (category === null) return null
  if (!requested || requested.category !== category) return 'DISCOUNT_NOT_REQUESTED'
  if (discountFailed(requested.state)) return 'DISCOUNT_NOT_VERIFIED'
  if (stage === 'approve' && requested.state !== 'verified') return 'DISCOUNT_PENDING_VERIFICATION'
  return null
}
