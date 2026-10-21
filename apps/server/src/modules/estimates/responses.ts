// The customer's answers to a published estimate (TSK-0056; HH-EST-09, HH-EST-06, OWN-DEC-103, C05 step 3,
// FACT-ESTIMATE-VALIDITY, FACT-AUTOMATIC-MESSAGES, RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS).
// - Request Changes: the customer's message is kept as a revision request on the project; the version stays exactly as
//   it is (published, still the current offer). Decline: the version moves published -> declined with the customer's
//   optional reason, every earlier record kept. Request an Updated Estimate: on a version that expired with no current
//   version to show (OWN-DEC-103), a request for a new one; nothing else changes.
// - Each runs in one transaction under the estimate's row lock and then the version's (the lifecycle's lock order, so a
//   publish, a supersede or the expiry job of the same estimate serializes with it). The server decides from the
//   version as it is then: a version that is no longer current answers with what it is now, never a stale success.
// - In the same transaction: the append-only response row (migration 0043), the staff follow-up item (queue type
//   estimate_response, one per version) and the committed event that notifies the responsible staff member
//   (staff_notice.estimate_changes_requested or staff_notice.estimate_declined). Those staff notices are automatic
//   (messages.automatic), but no wording for them is approved yet: each delivery is recorded as
//   template_not_configured, never as sent, until a template is released (NOT CONFIGURED, FACT-AUTOMATIC-MESSAGES).
// - Nothing here can accept an estimate: there is no accepting response, and silence, a question or a request for
//   changes never approves anything (HH-EST-09). Approval is the approval transaction (TSK-0057).
// - Estimate reminders (HH-EST-14, TSK-0060) stop on any customer response: the rows here are what they read, and
//   the response's transaction cancels the waiting drafts (stopEstimateReminders).
import type { Db, Tx } from '@handyhub/db'
import { apply, effectiveEstimateState, type EstimateVersionState } from '@handyhub/domain'
import type { CustomerActor, DataScope } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import type { Automation } from '../../platform/automation.js'
import { outbox } from '../../platform/outbox.js'
import { currentContext } from '../../platform/request-context.js'
import { notificationAutomation, type NotificationProviders, type Recipient } from '../notifications/index.js'
import { openQueueItem, resolveQueueItem } from '../queue/index.js'
import { findProject } from '../records/index.js'
import { currentVersion } from './lifecycle.js'
import { CUSTOMER_STATES } from './model.js'
import { stopEstimateReminders } from './reminders.js'

type Reader = Db | Tx

export const RESPONSE_KINDS = ['changes_requested', 'declined', 'update_requested'] as const
export type ResponseKind = (typeof RESPONSE_KINDS)[number]

/** The committed events of a response; each notifies the responsible staff member (FACT-AUTOMATIC-MESSAGES). */
export const ESTIMATE_CHANGES_REQUESTED_EVENT = 'estimate.changes_requested'
export const ESTIMATE_DECLINED_EVENT = 'estimate.declined'
const EVENT_OF: Record<ResponseKind, string> = {
  changes_requested: ESTIMATE_CHANGES_REQUESTED_EVENT,
  declined: ESTIMATE_DECLINED_EVENT,
  update_requested: ESTIMATE_CHANGES_REQUESTED_EVENT,
}
/** The staff follow-up item's reason per response (queue type estimate_response). */
const REASON_OF: Record<ResponseKind, string> = {
  changes_requested: 'estimate_changes_requested',
  declined: 'estimate_declined',
  update_requested: 'estimate_update_requested',
}
export const ESTIMATE_RESPONSE_ITEM = 'estimate_response'

/** PROPOSED limits on the customer's words: a message up to 2000 characters, a decline reason up to 1000. */
export const RESPONSE_LIMITS = { message: 2000, reason: 1000 } as const

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })

/** What a customer's version is called in the portal: the effective state, with "current" for the open offer. */
export type CustomerVersionStatus = 'current' | 'approved' | 'declined' | 'expired' | 'superseded' | 'withdrawn'
export function customerVersionStatus(state: string, validUntil: Date | null, now: Date): CustomerVersionStatus {
  const effective = effectiveEstimateState(state as EstimateVersionState, validUntil, now)
  if (effective === 'published') return 'current'
  if (effective === 'accepted') return 'approved'
  return effective as CustomerVersionStatus
}

/** The estimate and version a customer names by project reference, estimate number and version number. */
export type CustomerVersionRef = { reference: string; number: string; version: number }

/**
 * The version a customer may see, by reference, estimate number and version number, inside the caller's scope: a
 * project outside it, another project's estimate number, an unknown version and a version that never reached the
 * customer (draft, in review) are all null, answered like a missing record (T19).
 */
export async function customerVersionRow(db: Reader, scope: DataScope, ref: CustomerVersionRef) {
  const project = await findProject(db, scope, { reference: ref.reference })
  if (!project || !Number.isInteger(ref.version) || ref.version < 1) return null
  const row = await db
    .selectFrom('estimating.estimate_versions as v')
    .innerJoin('estimating.estimates as e', 'e.id', 'v.estimate_id')
    .select(['v.id', 'v.estimate_id', 'v.project_id', 'v.version', 'v.state', 'v.valid_until', 'e.number'])
    .where('e.project_id', '=', project.id)
    .where('v.project_id', '=', project.id)
    .where('e.number', '=', ref.number)
    .where('v.version', '=', ref.version)
    .where('v.state', 'in', [...CUSTOMER_STATES])
    .executeTakeFirst()
  return row ? { ...row, reference: project.reference } : null
}

async function dbNow(tx: Tx): Promise<Date> {
  const r = await sql<{ now: Date }>`SELECT now() AS now`.execute(tx)
  return new Date((r.rows[0] as { now: Date }).now)
}

export type RecordedResponse = {
  responseId: string
  versionId: string
  kind: ResponseKind
  at: Date
  status: CustomerVersionStatus
  /** The version's state before and after (a decline: published -> declined). */
  from: string
  to: string
}

/**
 * Records one customer response on a version (Request Changes, Decline, Request an Updated Estimate). Refuses with
 * CONFLICT, naming the version's status now, when the version is not one the response applies to; NOT_FOUND for
 * anything outside the scope. The caller authorizes the action (estimate.request_changes, estimate.decline).
 */
export async function recordCustomerResponse(
  tx: Tx,
  actor: CustomerActor,
  scope: DataScope,
  input: CustomerVersionRef & { kind: ResponseKind; message?: string | undefined; sessionId?: string | null },
): Promise<RecordedResponse> {
  const found = await customerVersionRow(tx, scope, input)
  if (!found) throw new ApiError('NOT_FOUND')
  // The lifecycle's lock order: the estimate first, then the version.
  await tx.selectFrom('estimating.estimates').select('id').where('id', '=', found.estimate_id).forUpdate().execute()
  const v = await tx
    .selectFrom('estimating.estimate_versions')
    .select(['id', 'estimate_id', 'project_id', 'version', 'state', 'valid_until', 'row_version'])
    .where('id', '=', found.id)
    .forUpdate()
    .executeTakeFirstOrThrow()
  const now = await dbNow(tx)
  const status = customerVersionStatus(v.state, v.valid_until, now)
  const notApplicable = () =>
    new ApiError('CONFLICT', { fieldErrors: [field('version', `VERSION_${status.toUpperCase()}`)] })
  const message = input.message?.trim() ? input.message.trim() : null

  let to = v.state
  let versionState: 'published' | 'expired' | 'withdrawn' | 'superseded'
  if (input.kind === 'changes_requested') {
    if (status !== 'current') throw notApplicable()
    if (!message) throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.message', 'required')] })
    versionState = 'published'
  } else if (input.kind === 'declined') {
    if (status !== 'current') throw notApplicable()
    const moved = apply(
      { machine: 'estimate_version.lifecycle', state: v.state as EstimateVersionState, version: v.row_version },
      'decline',
      { actor: 'customer', expectedVersion: v.row_version, now, facts: message ? { reason: message } : {} },
    )
    if (!moved.ok) throw new ApiError('CONFLICT', { fieldErrors: [field('state', moved.code)] })
    await tx
      .updateTable('estimating.estimate_versions')
      .set({ state: moved.to, state_changed_at: now, row_version: moved.version })
      .where('id', '=', v.id)
      .execute()
    to = moved.to
    versionState = 'published'
  } else {
    // Request an Updated Estimate: only when this version can no longer be approved and no current version exists.
    if (status !== 'expired') throw notApplicable()
    if (await currentVersion(tx, v.estimate_id, now))
      throw new ApiError('CONFLICT', { fieldErrors: [field('version', 'CURRENT_VERSION_EXISTS')] })
    versionState = 'expired'
  }

  const row = await tx
    .insertInto('estimating.customer_responses')
    .values({
      project_id: v.project_id,
      estimate_id: v.estimate_id,
      version_id: v.id,
      kind: input.kind,
      message,
      version_state: versionState,
      contact_ref: actor.contactId,
      customer_session_id: input.sessionId ?? null,
      created_at: now,
    })
    .returning(['id', 'created_at'])
    .executeTakeFirstOrThrow()
  // TSK-0060 (HH-EST-14): any customer response stops the estimate's waiting reminder drafts.
  await stopEstimateReminders(tx, v.id)

  // The staff follow-up item, assigned to the request's responsible staff member when there is one.
  const request = await tx
    .selectFrom('intake.requests')
    .select(['responsible_staff_id'])
    .where('project_id', '=', v.project_id)
    .orderBy('submitted_at')
    .executeTakeFirst()
  await openQueueItem(tx, {
    type: ESTIMATE_RESPONSE_ITEM,
    subjectId: v.id,
    reason: REASON_OF[input.kind],
    projectId: v.project_id,
    reference: found.reference,
    status: to,
    assignedStaffId: request?.responsible_staff_id ?? null,
    openedAt: now,
  })

  const type = EVENT_OF[input.kind]
  await outbox.add(tx, {
    type,
    aggregate: { type: 'estimate_customer_response', id: row.id },
    payload: { kind: input.kind, version: v.version },
    idempotencyKey: `${type}:${row.id}`,
    requestId: currentContext()?.requestId ?? `estimate-response:${row.id}`,
  })
  return {
    responseId: row.id,
    versionId: v.id,
    kind: input.kind,
    at: row.created_at,
    status: customerVersionStatus(to, v.valid_until, now),
    from: v.state,
    to,
  }
}

/**
 * Publishing a newer version answers the customer's earlier responses: their follow-up items are resolved as revised
 * (PROPOSED resolution). Runs in the publishing transaction.
 */
export async function resolveResponsesOnRevision(tx: Tx, estimateId: string, publishedVersion: number): Promise<void> {
  const older = await tx
    .selectFrom('estimating.estimate_versions')
    .select('id')
    .where('estimate_id', '=', estimateId)
    .where('version', '<', publishedVersion)
    .execute()
  for (const o of older)
    await resolveQueueItem(tx, { type: ESTIMATE_RESPONSE_ITEM, subjectId: o.id, resolution: 'revised' })
}

export type ResponseRecord = { kind: ResponseKind; version: number; at: Date; message: string | null }

/** Every response the customer gave on an estimate, newest first (the append-only history, HH-EST-09). */
export async function estimateResponses(db: Reader, estimateId: string): Promise<ResponseRecord[]> {
  const rows = await db
    .selectFrom('estimating.customer_responses as r')
    .innerJoin('estimating.estimate_versions as v', 'v.id', 'r.version_id')
    .select(['r.kind', 'v.version', 'r.created_at', 'r.message'])
    .where('r.estimate_id', '=', estimateId)
    .orderBy('r.created_at', 'desc')
    .orderBy('r.id', 'desc')
    .execute()
  return rows.map((r) => ({ kind: r.kind as ResponseKind, version: r.version, at: r.created_at, message: r.message }))
}

/** Staff notice message keys per event (message-types.ts). */
export const STAFF_NOTICE_OF: Readonly<Record<string, string>> = {
  [ESTIMATE_CHANGES_REQUESTED_EVENT]: 'staff_notice.estimate_changes_requested',
  [ESTIMATE_DECLINED_EVENT]: 'staff_notice.estimate_declined',
}

export type ResponseNoticeDeps = {
  providers: NotificationProviders
  /** Base URL of the staff app; undefined while not configured (the link is then left out). */
  staffAppUrl?: string | undefined
}

/**
 * The automatic staff notices of a customer response (FACT-AUTOMATIC-MESSAGES "Staff notifications"): the responsible
 * staff member of the request, or else the staff member who prepared the version (PROPOSED), by their account email,
 * in their own interface language. No wording is approved for these notices yet, so each delivery is recorded as
 * template_not_configured (NOT CONFIGURED) and the staff follow-up item stays the reliable signal.
 */
export function estimateResponseNoticeAutomations(deps: ResponseNoticeDeps): Automation[] {
  return Object.values(STAFF_NOTICE_OF).map((messageKey) =>
    notificationAutomation({
      messageKey,
      providers: deps.providers,
      resolve: async ({ tx, job }) => {
        const id = job.target.id
        if (!id) return 'stale'
        const r = await tx
          .selectFrom('estimating.customer_responses as r')
          .innerJoin('estimating.estimate_versions as v', 'v.id', 'r.version_id')
          .select(['r.id', 'r.project_id', 'r.version_id', 'v.prepared_by'])
          .where('r.id', '=', id)
          .executeTakeFirst()
        if (!r) return 'stale'
        const request = await tx
          .selectFrom('intake.requests')
          .select('responsible_staff_id')
          .where('project_id', '=', r.project_id)
          .orderBy('submitted_at')
          .executeTakeFirst()
        const staffId = request?.responsible_staff_id ?? r.prepared_by
        const person = await tx
          .selectFrom('identity.staff_users')
          .select(['id', 'email', 'locale'])
          .where('id', '=', staffId)
          .where('status', '=', 'active')
          .executeTakeFirst()
        const recipients: Recipient[] = person
          ? [
              {
                kind: 'staff_user',
                id: person.id,
                staffLocale: person.locale === 'es' ? 'es' : 'en',
                destinations: [{ channel: 'email', destination: person.email, permission: 'staff_account' }],
              },
            ]
          : []
        const base = deps.staffAppUrl?.replace(/\/$/, '')
        return {
          subjectKey: `estimate_customer_response:${r.id}`,
          record: { type: 'estimate_version', id: r.version_id },
          recipients,
          values: base ? { appLink: `${base}/estimates/${r.version_id}` } : {},
        }
      },
    }),
  )
}
