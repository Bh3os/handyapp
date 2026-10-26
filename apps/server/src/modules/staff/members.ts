// Staff management (TSK-0097; HH-STAFF-02, HH-STAFF-03, HH-STAFF-07, T26, T27, ENT-StaffUser, ENT-RoleGrant,
// OWN-DEC-28, OWN-DEC-114, OWN-DEC-123, RULE-SERVER-AUTHZ).
// - The Owner's staff list and each member's record: status, roles and capabilities with their grant history, the
//   disabling and re-enabling history, sign-in facts (password set, MFA, live sessions; never a hash or a token) and
//   the upcoming assignments with their review flags.
// - Role and capability grants: one live grant per kind and name; a grant is ended by a new fact, never edited. Nobody
//   grants themselves anything (the policy's not_self_subject). At least one active Owner always remains (here, and at
//   commit in the database, migration 0054; OWN-DEC-192 H2). PROPOSED: a person keeps at least one role (disable the account instead);
//   the `collect` capability is granted only to someone holding the Worker role (ENT-RoleGrant: "granted per worker").
//   TSK-0151 (OWN-DEC-200 H4): a `collect` grant records the worker's training (the date it was completed, not after
//   today, and what it covered; PROPOSED), refused without it here and in the database (migration 0098); the Worker
//   role alone never collects.
// - Offboarding (disable): in one transaction, after the account's in-flight writes have committed (lockAccountWrites),
//   the account is disabled, every session revoked, every open invite or reset link invalidated and the password
//   cleared (PROPOSED: re-enabling needs a new password through a single-use link), so nothing the person held still
//   works. Their upcoming reservations are flagged for reassignment by the database in the same transaction, and each
//   flagged visit gets its action-queue item (migration 0054); nothing is cancelled and their history stays (OWN-DEC-192
//   H5). The Owner cannot disable their own account (OWN-DEC-192 H2). TSK-0154 (OWN-DEC-202): offboarding also removes
//   the authenticator and the recovery codes, so every previous credential is invalid and a re-enabled account enrols
//   again.
// - Authenticator reset (TSK-0154, OWN-DEC-202; staff.reset_mfa, PROPOSED in the grant row: fresh sign-in, a reason,
//   never oneself): a staff member who lost their authenticator gets it removed with its recovery codes and every
//   session revoked at once; the next sign-in (with their password) enrols a new one before any staff screen.
// - Re-enabling (fresh sign-in and a reason; TSK-0151, OWN-DEC-200 H1, H3, OWN-DEC-202): the account returns to active
//   (or invited, when it never set a password) holding no grant at all, and a single-use reset (or invite) link is
//   emailed. Every grant it still held is ended in the same transaction (ended by the Owner; kept as history) and
//   listed in a permission review, which waits in the Owner Decisions (permission_review) until the Owner restores or
//   declines each one. Restoring is a new grant (fresh sign-in, a reason, never oneself; a collect grant records the
//   training again, PROPOSED) that names the earlier one; declining is protective (no fresh sign-in, an optional
//   reason). Giving the same role directly during the review counts as restoring it. PROPOSED: the last role cannot be
//   declined while the person holds none (give a role or disable the account instead). Disabling again closes the
//   review. The database refuses a re-enabled account that keeps an earlier grant (migration 0098).
import type { Tx } from '@handyhub/db'
import { isLocalDate, isTimeZone, localDateOf } from '@handyhub/domain'
import { CAPABILITIES, STAFF_ROLES } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { loadConfig } from '../../platform/config/index.js'
import { notDismissed } from '../capacity/flags.js'
import { issueLink } from '../identity/links.js'
import { removeMfa } from '../identity/mfa.js'
import { lockAccountWrites, revokeAllSessions } from '../identity/sessions.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'

type Reader = Pick<Tx, 'selectFrom'>

export type GrantKind = 'role' | 'capability'

/** The training a collect grant records (TSK-0151, OWN-DEC-200 H4; PROPOSED: a date and a description). */
export type Training = { completedOn: string; description: string }

/** The Owner Decisions item of an open permission review (queue registry permission_review). */
const REVIEW_ITEM = 'permission_review'

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const conflict = (f: string, code: string) => new ApiError('CONFLICT', { fieldErrors: [field(f, code)] })
const iso = (d: Date | string | null) => (d === null ? null : new Date(d).toISOString())
const STAFF_ISSUER = /^staff:([0-9a-f-]{36})$/

/** "staff:<id>" as the grant tables record a staff issuer; other issuers (bootstrap, operations) are system. */
export const issuerOf = (staffUserId: string) => `staff:${staffUserId}`

async function namesOf(db: Reader, ids: readonly string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids)]
  if (!unique.length) return new Map()
  const rows = await db
    .selectFrom('identity.staff_users')
    .select(['id', 'display_name'])
    .where('id', 'in', unique)
    .execute()
  return new Map(rows.map((r) => [r.id, r.display_name]))
}

function byWhom(issuer: string | null, names: Map<string, string | null>) {
  if (issuer === null) return null
  const id = STAFF_ISSUER.exec(issuer)?.[1]
  return id
    ? { staffUserId: id, name: names.get(id) ?? null, system: false }
    : { staffUserId: null, name: null, system: true }
}

/** Every staff member (disabled ones too: their history is kept), with the facts the list shows. */
export async function listMembers(db: Reader, actorId: string, now: Date) {
  const users = await db
    .selectFrom('identity.staff_users as u')
    .leftJoin('identity.auth_identities as a', 'a.staff_user_id', 'u.id')
    .select([
      'u.id',
      'u.display_name',
      'u.email',
      'u.locale',
      'u.status',
      'u.invited_at',
      'u.activated_at',
      'u.disabled_at',
      'u.version',
      'a.password_set_at',
    ])
    .orderBy(sql`u.status = 'disabled'`)
    .orderBy('u.display_name')
    .orderBy('u.id')
    .execute()
  const ids = users.map((u) => u.id)
  if (!ids.length) return []
  const grants = await db
    .selectFrom('identity.role_grants')
    .select(['staff_user_id', 'kind', 'name'])
    .where('staff_user_id', 'in', ids)
    .where('ended_at', 'is', null)
    .orderBy('effective_from')
    .execute()
  const mfa = await db
    .selectFrom('identity.staff_mfa')
    .select('staff_user_id')
    .where('staff_user_id', 'in', ids)
    .where('confirmed_at', 'is not', null)
    .execute()
  const sessions = await db
    .selectFrom('identity.staff_sessions')
    .select(['staff_user_id', sql<string>`count(*)`.as('n')])
    .where('staff_user_id', 'in', ids)
    .where('revoked_at', 'is', null)
    .groupBy('staff_user_id')
    .execute()
  const upcoming = await db
    .selectFrom('work.reservations as r')
    .select([
      'r.staff_user_id',
      sql<string>`count(*)`.as('n'),
      sql<string>`count(*) FILTER (WHERE EXISTS (SELECT 1 FROM work.reservation_flags f WHERE f.reservation_id = r.id
        AND NOT EXISTS (SELECT 1 FROM work.reservation_flag_dismissals d WHERE d.flag_id = f.id)))`.as('flagged'),
    ])
    .where('r.staff_user_id', 'in', ids)
    .where('r.ended_at', 'is', null)
    .where('r.ends_at', '>', now)
    .groupBy('r.staff_user_id')
    .execute()
  const reviews = await db
    .selectFrom('identity.permission_reviews')
    .select('staff_user_id')
    .where('staff_user_id', 'in', ids)
    .where('closed_at', 'is', null)
    .execute()
  const reviewing = new Set(reviews.map((r) => r.staff_user_id))
  const enrolled = new Set(mfa.map((m) => m.staff_user_id))
  const live = new Map(sessions.map((s) => [s.staff_user_id, Number(s.n)]))
  const ahead = new Map(upcoming.map((s) => [s.staff_user_id as string, s]))
  return users.map((u) => {
    const mine = grants.filter((g) => g.staff_user_id === u.id)
    const a = ahead.get(u.id)
    return {
      id: u.id,
      displayName: u.display_name,
      email: u.email,
      locale: u.locale === 'es' ? 'es' : 'en',
      status: u.status,
      self: u.id === actorId,
      roles: STAFF_ROLES.filter((r) => mine.some((g) => g.kind === 'role' && g.name === r)),
      capabilities: CAPABILITIES.filter((c) => mine.some((g) => g.kind === 'capability' && g.name === c)),
      invitedAt: iso(u.invited_at),
      activatedAt: iso(u.activated_at),
      disabledAt: iso(u.disabled_at),
      passwordSet: u.password_set_at != null,
      mfaEnrolled: enrolled.has(u.id),
      liveSessions: live.get(u.id) ?? 0,
      upcomingAssignments: a ? Number(a.n) : 0,
      flaggedAssignments: a ? Number(a.flagged) : 0,
      permissionReviewOpen: reviewing.has(u.id),
      version: u.version,
    }
  })
}

export type MemberSummary = Awaited<ReturnType<typeof listMembers>>[number]

/** One member's record: the summary, every grant (live and ended), the status history and the upcoming assignments. */
export async function memberDetail(db: Reader, actorId: string, staffUserId: string, now: Date) {
  const summary = (await listMembers(db, actorId, now)).find((m) => m.id === staffUserId)
  if (!summary) throw new ApiError('NOT_FOUND')
  const grants = await db
    .selectFrom('identity.role_grants')
    .select([
      'id',
      'kind',
      'name',
      'issued_by',
      'reason',
      'effective_from',
      'ended_at',
      'ended_by',
      'trained_on',
      'training',
    ])
    .where('staff_user_id', '=', staffUserId)
    .orderBy('effective_from')
    .orderBy('id')
    .execute()
  const review = await db
    .selectFrom('identity.permission_reviews')
    .select(['id', 'opened_by', 'opened_at'])
    .where('staff_user_id', '=', staffUserId)
    .where('closed_at', 'is', null)
    .executeTakeFirst()
  const reviewItems = review
    ? await db
        .selectFrom('identity.permission_review_items as i')
        .innerJoin('identity.role_grants as g', 'g.id', 'i.earlier_grant_id')
        .select([
          'i.id',
          'i.earlier_grant_id',
          'i.decision',
          'i.decided_by',
          'i.decided_at',
          'i.reason',
          'i.grant_id',
          'g.kind',
          'g.name',
        ])
        .where('i.review_id', '=', review.id)
        .orderBy(sql`g.kind = 'capability'`)
        .orderBy('g.effective_from')
        .orderBy('i.id')
        .execute()
    : []
  const changes = await db
    .selectFrom('identity.staff_status_changes')
    .select(['id', 'from_status', 'to_status', 'changed_by', 'reason', 'changed_at'])
    .where('staff_user_id', '=', staffUserId)
    .orderBy('changed_at')
    .orderBy('id')
    .execute()
  const assignments = await db
    .selectFrom('work.reservations as r')
    .innerJoin('work.visits as v', 'v.id', 'r.visit_id')
    .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
    .select([
      'r.id',
      'r.visit_id',
      'r.role',
      'r.kind',
      'r.starts_at',
      'r.ends_at',
      'r.time_zone',
      'v.state',
      'v.purpose',
      'p.reference',
      (eb) =>
        eb
          .selectFrom('intake.requests as q')
          .select('q.id')
          .whereRef('q.project_id', '=', 'v.project_id')
          .orderBy('q.submitted_at')
          .limit(1)
          .as('request_id'),
    ])
    .where('r.staff_user_id', '=', staffUserId)
    .where('r.ended_at', 'is', null)
    .where('r.ends_at', '>', now)
    .orderBy('r.starts_at')
    .execute()
  const flags = assignments.length
    ? await db
        .selectFrom('work.reservation_flags')
        .select(['reservation_id', 'cause'])
        .where(
          'reservation_id',
          'in',
          assignments.map((a) => a.id),
        )
        .where(notDismissed)
        .orderBy('flagged_at')
        .execute()
    : []
  const issuers = [
    ...grants.flatMap((g) => [g.issued_by, g.ended_by ?? '']),
    ...changes.map((c) => issuerOf(c.changed_by)),
    ...(review ? [issuerOf(review.opened_by)] : []),
    ...reviewItems.flatMap((i) => (i.decided_by ? [issuerOf(i.decided_by)] : [])),
  ].flatMap((i) => {
    const id = STAFF_ISSUER.exec(i)?.[1]
    return id ? [id] : []
  })
  const names = await namesOf(db, issuers)
  return {
    ...summary,
    grants: grants.map((g) => ({
      id: g.id,
      kind: g.kind as GrantKind,
      name: g.name,
      issuedBy: byWhom(g.issued_by, names),
      reason: g.reason,
      effectiveFrom: iso(g.effective_from) as string,
      endedAt: iso(g.ended_at),
      endedBy: byWhom(g.ended_by, names),
      training:
        g.trained_on !== null && g.training !== null ? { completedOn: g.trained_on, description: g.training } : null,
    })),
    permissionReview: review
      ? {
          id: review.id,
          openedAt: iso(review.opened_at) as string,
          openedBy: byWhom(issuerOf(review.opened_by), names),
          items: reviewItems.map((i) => ({
            id: i.id,
            earlierGrantId: i.earlier_grant_id,
            kind: i.kind as GrantKind,
            name: i.name,
            decision: i.decision as 'restored' | 'declined' | null,
            decidedAt: iso(i.decided_at),
            decidedBy: i.decided_by ? byWhom(issuerOf(i.decided_by), names) : null,
            reason: i.reason,
            grantId: i.grant_id,
          })),
        }
      : null,
    statusHistory: changes.map((c) => ({
      id: c.id,
      from: c.from_status,
      to: c.to_status,
      by: byWhom(issuerOf(c.changed_by), names),
      reason: c.reason,
      at: iso(c.changed_at) as string,
    })),
    assignments: assignments.map((a) => ({
      reservationId: a.id,
      visitId: a.visit_id,
      requestId: a.request_id,
      reference: a.reference,
      purpose: a.purpose,
      visitState: a.state,
      role: a.role,
      kind: a.kind,
      startsAt: iso(a.starts_at) as string,
      endsAt: iso(a.ends_at) as string,
      timeZone: a.time_zone,
      flags: [...new Set(flags.filter((f) => f.reservation_id === a.id).map((f) => f.cause))],
    })),
  }
}

export type MemberDetail = Awaited<ReturnType<typeof memberDetail>>

async function lockMember(tx: Tx, staffUserId: string) {
  const u = await tx
    .selectFrom('identity.staff_users')
    .select(['id', 'status', 'activated_at'])
    .where('id', '=', staffUserId)
    .forUpdate()
    .executeTakeFirst()
  if (!u) throw new ApiError('NOT_FOUND')
  return u
}

const lockOwners = (tx: Tx) => sql`SELECT identity.lock_owners()`.execute(tx)

/** Active Owners other than this person (after the owners lock, so concurrent changes are serialized). */
async function otherActiveOwners(tx: Tx, staffUserId: string): Promise<number> {
  const row = await tx
    .selectFrom('identity.role_grants as g')
    .innerJoin('identity.staff_users as u', 'u.id', 'g.staff_user_id')
    .select(sql<string>`count(*)`.as('n'))
    .where('g.kind', '=', 'role')
    .where('g.name', '=', 'owner')
    .where('g.ended_at', 'is', null)
    .where('u.status', '=', 'active')
    .where('u.id', '<>', staffUserId)
    .executeTakeFirstOrThrow()
  return Number(row.n)
}

async function liveGrants(tx: Tx, staffUserId: string) {
  return tx
    .selectFrom('identity.role_grants')
    .select(['id', 'kind', 'name'])
    .where('staff_user_id', '=', staffUserId)
    .where('ended_at', 'is', null)
    .execute()
}

const bump = (tx: Tx, staffUserId: string) =>
  tx
    .updateTable('identity.staff_users')
    .set((eb) => ({ version: eb('version', '+', 1) }))
    .where('id', '=', staffUserId)
    .execute()

export function validGrant(kind: GrantKind, name: string): boolean {
  return kind === 'role'
    ? (STAFF_ROLES as readonly string[]).includes(name)
    : (CAPABILITIES as readonly string[]).includes(name)
}

/** Today's date where the business is (FACT-TIMEZONE), or in UTC while the zone is NOT CONFIGURED. */
async function today(tx: Tx): Promise<string> {
  const z = (await loadConfig(tx)).get('business.timezone')
  return localDateOf(new Date(), z.state === 'CONFIGURED' && isTimeZone(z.value.zone) ? z.value.zone : 'UTC')
}

/** A collect grant records the worker's training (OWN-DEC-200 H4); no other grant records one. */
async function checkedTraining(tx: Tx, kind: GrantKind, name: string, training: Training | undefined) {
  const collect = kind === 'capability' && name === 'collect'
  if (!collect) {
    if (training)
      throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.training', 'TRAINING_NOT_USED')] })
    return null
  }
  const description = training?.description.trim() ?? ''
  if (!training || description === '')
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.training', 'TRAINING_REQUIRED')] })
  if (!isLocalDate(training.completedOn))
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.training.completedOn', 'DATE_INVALID')] })
  if (training.completedOn > (await today(tx)))
    throw new ApiError('VALIDATION_FAILED', {
      fieldErrors: [field('body.training.completedOn', 'TRAINING_DATE_FUTURE')],
    })
  return { trained_on: training.completedOn, training: description }
}

/** The open permission review of an account, locked, or null. */
async function openReview(tx: Tx, staffUserId: string) {
  return (
    (await tx
      .selectFrom('identity.permission_reviews')
      .select(['id'])
      .where('staff_user_id', '=', staffUserId)
      .where('closed_at', 'is', null)
      .forUpdate()
      .executeTakeFirst()) ?? null
  )
}

/** Closes the review once every earlier grant is restored or declined; resolves its Owner Decisions item. */
async function closeReviewIfDone(tx: Tx, staffUserId: string, reviewId: string): Promise<boolean> {
  const left = await tx
    .selectFrom('identity.permission_review_items')
    .select('id')
    .where('review_id', '=', reviewId)
    .where('decision', 'is', null)
    .executeTakeFirst()
  if (left) return false
  await tx
    .updateTable('identity.permission_reviews')
    .set({ closed_at: sql<Date>`now()`, closed_reason: 'reviewed' })
    .where('id', '=', reviewId)
    .execute()
  await resolveQueueItem(tx, { type: REVIEW_ITEM, subjectId: staffUserId, resolution: 'reviewed' })
  return true
}

/**
 * Grants a role or capability (the policy already checked the Owner, the fresh sign-in, the reason and not self). A
 * collect grant records the training. During a permission review, a grant of an earlier role or capability restores
 * it (the review item names the new grant).
 */
export async function grant(
  tx: Tx,
  input: {
    actorId: string
    staffUserId: string
    kind: GrantKind
    name: string
    reason: string
    training?: Training
  },
): Promise<{ grantId: string; restored: string | null; reviewClosed: boolean }> {
  if (!validGrant(input.kind, input.name))
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.name', 'enum')] })
  if (input.kind === 'role' && input.name === 'owner') await lockOwners(tx)
  const u = await lockMember(tx, input.staffUserId)
  if (u.status === 'disabled') throw conflict('staffUser', 'ACCOUNT_DISABLED')
  const live = await liveGrants(tx, input.staffUserId)
  if (live.some((g) => g.kind === input.kind && g.name === input.name)) throw conflict('body.name', 'GRANT_EXISTS')
  if (input.kind === 'capability' && !live.some((g) => g.kind === 'role' && g.name === 'worker'))
    throw conflict('body.name', 'CAPABILITY_NEEDS_WORKER')
  const trained = await checkedTraining(tx, input.kind, input.name, input.training)
  const row = await tx
    .insertInto('identity.role_grants')
    .values({
      staff_user_id: input.staffUserId,
      kind: input.kind,
      name: input.name,
      issued_by: issuerOf(input.actorId),
      reason: input.reason.trim(),
      ...(trained ?? {}),
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  // The earlier grant of the same role or capability in an open permission review is restored by this one.
  const review = await openReview(tx, input.staffUserId)
  let restored: string | null = null
  let reviewClosed = false
  if (review) {
    const item = await tx
      .selectFrom('identity.permission_review_items as i')
      .innerJoin('identity.role_grants as g', 'g.id', 'i.earlier_grant_id')
      .select('i.id')
      .where('i.review_id', '=', review.id)
      .where('i.decision', 'is', null)
      .where('g.kind', '=', input.kind)
      .where('g.name', '=', input.name)
      .executeTakeFirst()
    if (item) {
      await tx
        .updateTable('identity.permission_review_items')
        .set({
          decision: 'restored',
          decided_by: input.actorId,
          decided_at: sql<Date>`now()`,
          reason: input.reason.trim(),
          grant_id: row.id,
        })
        .where('id', '=', item.id)
        .execute()
      restored = item.id
      reviewClosed = await closeReviewIfDone(tx, input.staffUserId, review.id)
    }
  }
  await bump(tx, input.staffUserId)
  return { grantId: row.id, restored, reviewClosed }
}

/** An undecided item of the account's open permission review, with its earlier grant. */
async function reviewItem(tx: Tx, staffUserId: string, itemId: string) {
  const review = await openReview(tx, staffUserId)
  if (!review) throw conflict('staffUser', 'NO_OPEN_REVIEW')
  const item = await tx
    .selectFrom('identity.permission_review_items as i')
    .innerJoin('identity.role_grants as g', 'g.id', 'i.earlier_grant_id')
    .select(['i.id', 'i.decision', 'g.kind', 'g.name'])
    .where('i.review_id', '=', review.id)
    .where('i.id', '=', itemId)
    .forUpdate('i')
    .executeTakeFirst()
  if (!item) throw new ApiError('NOT_FOUND')
  if (item.decision !== null) throw conflict('body.itemId', 'REVIEW_ITEM_DECIDED')
  return { reviewId: review.id, itemId: item.id, kind: item.kind as GrantKind, name: item.name }
}

/**
 * Restores one earlier grant of a permission review (the policy already checked the Owner, the fresh sign-in, the
 * reason and not self): a new grant of the same role or capability, a collect grant with its training again.
 */
export async function restoreGrant(
  tx: Tx,
  input: { actorId: string; staffUserId: string; itemId: string; reason: string; training?: Training },
) {
  await lockMember(tx, input.staffUserId)
  const item = await reviewItem(tx, input.staffUserId, input.itemId)
  const out = await grant(tx, {
    actorId: input.actorId,
    staffUserId: input.staffUserId,
    kind: item.kind,
    name: item.name,
    reason: input.reason,
    ...(input.training ? { training: input.training } : {}),
  })
  return { ...out, kind: item.kind, name: item.name }
}

/**
 * Declines one earlier grant of a permission review (protective: no fresh sign-in; the reason is optional). PROPOSED:
 * the last role is not declined while the person holds none (CONFLICT LAST_ROLE: give a role or disable the account).
 */
export async function declineGrant(
  tx: Tx,
  input: { actorId: string; staffUserId: string; itemId: string; reason: string | null },
) {
  await lockMember(tx, input.staffUserId)
  const item = await reviewItem(tx, input.staffUserId, input.itemId)
  if (item.kind === 'role') {
    const roles = (await liveGrants(tx, input.staffUserId)).filter((g) => g.kind === 'role').length
    const pending = await tx
      .selectFrom('identity.permission_review_items as i')
      .innerJoin('identity.role_grants as g', 'g.id', 'i.earlier_grant_id')
      .select('i.id')
      .where('i.review_id', '=', item.reviewId)
      .where('i.decision', 'is', null)
      .where('i.id', '<>', item.itemId)
      .where('g.kind', '=', 'role')
      .executeTakeFirst()
    if (roles === 0 && !pending) throw conflict('body.itemId', 'LAST_ROLE')
  }
  await tx
    .updateTable('identity.permission_review_items')
    .set({ decision: 'declined', decided_by: input.actorId, decided_at: sql<Date>`now()`, reason: input.reason })
    .where('id', '=', item.itemId)
    .execute()
  const reviewClosed = await closeReviewIfDone(tx, input.staffUserId, item.reviewId)
  await bump(tx, input.staffUserId)
  return { kind: item.kind, name: item.name, reviewClosed }
}

/** Ends a live grant (protective: never delayed). The last role and the last active Owner are kept. */
export async function endGrant(
  tx: Tx,
  input: { actorId: string; staffUserId: string; kind: GrantKind; name: string },
): Promise<{ grantId: string }> {
  const owner = input.kind === 'role' && input.name === 'owner'
  if (owner) await lockOwners(tx)
  const u = await lockMember(tx, input.staffUserId)
  const live = await liveGrants(tx, input.staffUserId)
  const target = live.find((g) => g.kind === input.kind && g.name === input.name)
  if (!target) throw conflict('body.name', 'GRANT_NOT_LIVE')
  if (input.kind === 'role' && live.filter((g) => g.kind === 'role').length === 1)
    throw conflict('body.name', 'LAST_ROLE')
  if (owner && u.status === 'active' && (await otherActiveOwners(tx, input.staffUserId)) === 0)
    throw conflict('body.name', 'LAST_OWNER')
  await tx
    .updateTable('identity.role_grants')
    .set({ ended_at: sql<Date>`now()`, ended_by: issuerOf(input.actorId) })
    .where('id', '=', target.id)
    .where('ended_at', 'is', null)
    .execute()
  await bump(tx, input.staffUserId)
  return { grantId: target.id }
}

/**
 * Disables an account (offboarding, HH-STAFF-02): see the header. Returns what it ended and how many upcoming
 * assignments it flagged.
 */
export async function disable(
  tx: Tx,
  input: { actorId: string; staffUserId: string; reason: string | null },
): Promise<{
  sessionsRevoked: number
  linksInvalidated: number
  flagged: number
  upcoming: number
  mfaRemoved: boolean
  reviewClosed: boolean
}> {
  if (input.staffUserId === input.actorId) throw conflict('staffUser', 'OWN_ACCOUNT')
  // Every in-flight write of the person commits first; every later one sees the account disabled.
  await lockAccountWrites(tx, input.staffUserId)
  await lockOwners(tx)
  const u = await lockMember(tx, input.staffUserId)
  if (u.status === 'disabled') throw conflict('staffUser', 'ACCOUNT_DISABLED')
  const isOwner = (await liveGrants(tx, input.staffUserId)).some((g) => g.kind === 'role' && g.name === 'owner')
  if (isOwner && u.status === 'active' && (await otherActiveOwners(tx, input.staffUserId)) === 0)
    throw conflict('staffUser', 'LAST_OWNER')
  await tx
    .updateTable('identity.staff_users')
    .set((eb) => ({ status: 'disabled', disabled_at: sql<Date>`now()`, version: eb('version', '+', 1) }))
    .where('id', '=', input.staffUserId)
    .execute()
  const sessionsRevoked = await revokeAllSessions(tx, input.staffUserId, 'disabled')
  const links = await tx
    .updateTable('identity.staff_links')
    .set({ invalidated_at: sql<Date>`now()` })
    .where('staff_user_id', '=', input.staffUserId)
    .where('consumed_at', 'is', null)
    .where('invalidated_at', 'is', null)
    .executeTakeFirst()
  await tx
    .updateTable('identity.auth_identities')
    .set({ password_hash: null, password_set_at: null })
    .where('staff_user_id', '=', input.staffUserId)
    .execute()
  const mfa = await removeMfa(tx, input.staffUserId)
  // TSK-0151: a permission review still open ends with the account (its undecided grants stay undecided, as history).
  const review = await openReview(tx, input.staffUserId)
  if (review) {
    await tx
      .updateTable('identity.permission_reviews')
      .set({ closed_at: sql<Date>`now()`, closed_reason: 'account_disabled' })
      .where('id', '=', review.id)
      .execute()
    await resolveQueueItem(tx, { type: REVIEW_ITEM, subjectId: input.staffUserId, resolution: 'account_disabled' })
  }
  await tx
    .insertInto('identity.staff_status_changes')
    .values({
      staff_user_id: input.staffUserId,
      from_status: u.status,
      to_status: 'disabled',
      changed_by: input.actorId,
      reason: input.reason,
    })
    .execute()
  const counts = await tx
    .selectFrom('work.reservations as r')
    .select([
      sql<string>`count(*)`.as('upcoming'),
      sql<string>`count(*) FILTER (WHERE EXISTS (SELECT 1 FROM work.reservation_flags f WHERE f.reservation_id = r.id
        AND f.cause = 'account_disabled' AND f.flagged_at = now()))`.as('flagged'),
    ])
    .where('r.staff_user_id', '=', input.staffUserId)
    .where('r.ended_at', 'is', null)
    .where('r.ends_at', '>', sql<Date>`now()`)
    .executeTakeFirstOrThrow()
  return {
    sessionsRevoked,
    linksInvalidated: Number(links.numUpdatedRows),
    flagged: Number(counts.flagged),
    upcoming: Number(counts.upcoming),
    mfaRemoved: mfa.factor,
    reviewClosed: review !== null,
  }
}

/**
 * Resets a staff member's authenticator (TSK-0154): see the header. The policy already checked the Owner, the fresh
 * sign-in, the reason and not oneself. Refused for a disabled account (it has none: offboarding removed it) and for an
 * account without one (CONFLICT MFA_NOT_ENROLLED: it enrols at its next sign-in anyway).
 */
export async function resetMfa(
  tx: Tx,
  input: { staffUserId: string },
): Promise<{ sessionsRevoked: number; recoveryCodesRemoved: number }> {
  await lockAccountWrites(tx, input.staffUserId)
  const u = await lockMember(tx, input.staffUserId)
  if (u.status === 'disabled') throw conflict('staffUser', 'ACCOUNT_DISABLED')
  const removed = await removeMfa(tx, input.staffUserId)
  if (!removed.factor) throw conflict('staffUser', 'MFA_NOT_ENROLLED')
  const sessionsRevoked = await revokeAllSessions(tx, input.staffUserId, 'mfa_reset')
  await bump(tx, input.staffUserId)
  return { sessionsRevoked, recoveryCodesRemoved: removed.recoveryCodes }
}

/**
 * Re-enables a disabled account (see the header): it holds no grant afterwards; every earlier grant is ended and listed
 * in a new permission review for the Owner; a single-use reset (or invite) link is emailed (the old password was
 * cleared at offboarding).
 */
export async function enable(
  tx: Tx,
  input: { actorId: string; staffUserId: string; reason: string },
): Promise<{
  status: 'active' | 'invited'
  link: 'reset' | 'invite'
  reviewId: string | null
  grantsEnded: { kind: GrantKind; name: string }[]
}> {
  await lockOwners(tx)
  const u = await lockMember(tx, input.staffUserId)
  if (u.status !== 'disabled') throw conflict('staffUser', 'ACCOUNT_NOT_DISABLED')
  const status = u.activated_at !== null ? ('active' as const) : ('invited' as const)
  await tx
    .updateTable('identity.staff_users')
    .set((eb) => ({ status, disabled_at: null, version: eb('version', '+', 1) }))
    .where('id', '=', input.staffUserId)
    .execute()
  const change = await tx
    .insertInto('identity.staff_status_changes')
    .values({
      staff_user_id: input.staffUserId,
      from_status: 'disabled',
      to_status: status,
      changed_by: input.actorId,
      reason: input.reason.trim(),
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  // OWN-DEC-200 H3: earlier access is never restored by itself. Each grant ends now and waits for the Owner's review.
  const earlier = await liveGrants(tx, input.staffUserId)
  let reviewId: string | null = null
  if (earlier.length) {
    await tx
      .updateTable('identity.role_grants')
      .set({ ended_at: sql<Date>`now()`, ended_by: issuerOf(input.actorId) })
      .where(
        'id',
        'in',
        earlier.map((g) => g.id),
      )
      .where('ended_at', 'is', null)
      .execute()
    const review = await tx
      .insertInto('identity.permission_reviews')
      .values({ staff_user_id: input.staffUserId, status_change_id: change.id, opened_by: input.actorId })
      .returning('id')
      .executeTakeFirstOrThrow()
    await tx
      .insertInto('identity.permission_review_items')
      .values(earlier.map((g) => ({ review_id: review.id, earlier_grant_id: g.id })))
      .execute()
    await openQueueItem(tx, { type: REVIEW_ITEM, subjectId: input.staffUserId, reason: 'account_reenabled', status })
    reviewId = review.id
  }
  const link = status === 'active' ? ('reset' as const) : ('invite' as const)
  await issueLink(tx, { staffUserId: input.staffUserId, purpose: link, issuedBy: issuerOf(input.actorId) })
  return {
    status,
    link,
    reviewId,
    grantsEnded: earlier.map((g) => ({ kind: g.kind as GrantKind, name: g.name })),
  }
}

/** The Owner starts password recovery: a single-use reset link (an invite link while invited) is emailed. */
export async function startRecovery(
  tx: Tx,
  input: { actorId: string; staffUserId: string },
): Promise<{ link: 'reset' | 'invite' }> {
  const u = await lockMember(tx, input.staffUserId)
  if (u.status === 'disabled') throw conflict('staffUser', 'ACCOUNT_DISABLED')
  const link = u.status === 'invited' ? ('invite' as const) : ('reset' as const)
  await issueLink(tx, { staffUserId: input.staffUserId, purpose: link, issuedBy: issuerOf(input.actorId) })
  return { link }
}
