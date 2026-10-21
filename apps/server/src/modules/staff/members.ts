// Staff management (TSK-0097; HH-STAFF-02, HH-STAFF-03, HH-STAFF-07, T26, T27, ENT-StaffUser, ENT-RoleGrant,
// OWN-DEC-28, OWN-DEC-114, OWN-DEC-123, RULE-SERVER-AUTHZ).
// - The Owner's staff list and each member's record: status, roles and capabilities with their grant history, the
//   disabling and re-enabling history, sign-in facts (password set, MFA, live sessions; never a hash or a token) and
//   the upcoming assignments with their review flags.
// - Role and capability grants: one live grant per kind and name; a grant is ended by a new fact, never edited. Nobody
//   grants themselves anything (the policy's not_self_subject). At least one active Owner always remains (here, and at
//   commit in the database, migration 0054). PROPOSED: a person keeps at least one role (disable the account instead);
//   the `collect` capability is granted only to someone holding the Worker role (ENT-RoleGrant: "granted per worker").
// - Offboarding (disable): in one transaction, after the account's in-flight writes have committed (lockAccountWrites),
//   the account is disabled, every session revoked, every open invite or reset link invalidated and the password
//   cleared (PROPOSED: re-enabling needs a new password through a single-use link), so nothing the person held still
//   works. Their upcoming reservations are flagged for reassignment by the database in the same transaction, and each
//   flagged visit gets its action-queue item (migration 0054); nothing is cancelled and their history stays. PROPOSED:
//   the Owner cannot disable their own account.
// - Re-enabling (fresh sign-in and a reason): the account returns to active (or invited, when it never set a password)
//   with its role grants unchanged, and a single-use reset (or invite) link is emailed.
import type { Tx } from '@handyhub/db'
import { CAPABILITIES, STAFF_ROLES } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { issueLink } from '../identity/links.js'
import { lockAccountWrites, revokeAllSessions } from '../identity/sessions.js'

type Reader = Pick<Tx, 'selectFrom'>

export type GrantKind = 'role' | 'capability'

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
      sql<string>`count(*) FILTER (WHERE EXISTS (SELECT 1 FROM work.reservation_flags f WHERE f.reservation_id = r.id))`.as(
        'flagged',
      ),
    ])
    .where('r.staff_user_id', 'in', ids)
    .where('r.ended_at', 'is', null)
    .where('r.ends_at', '>', now)
    .groupBy('r.staff_user_id')
    .execute()
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
    .select(['id', 'kind', 'name', 'issued_by', 'reason', 'effective_from', 'ended_at', 'ended_by'])
    .where('staff_user_id', '=', staffUserId)
    .orderBy('effective_from')
    .orderBy('id')
    .execute()
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
        .orderBy('flagged_at')
        .execute()
    : []
  const issuers = [
    ...grants.flatMap((g) => [g.issued_by, g.ended_by ?? '']),
    ...changes.map((c) => issuerOf(c.changed_by)),
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
    })),
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

/** Grants a role or capability (the policy already checked the Owner, the fresh sign-in, the reason and not self). */
export async function grant(
  tx: Tx,
  input: { actorId: string; staffUserId: string; kind: GrantKind; name: string; reason: string },
): Promise<{ grantId: string }> {
  if (!validGrant(input.kind, input.name))
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.name', 'enum')] })
  if (input.kind === 'role' && input.name === 'owner') await lockOwners(tx)
  const u = await lockMember(tx, input.staffUserId)
  if (u.status === 'disabled') throw conflict('staffUser', 'ACCOUNT_DISABLED')
  const live = await liveGrants(tx, input.staffUserId)
  if (live.some((g) => g.kind === input.kind && g.name === input.name)) throw conflict('body.name', 'GRANT_EXISTS')
  if (input.kind === 'capability' && !live.some((g) => g.kind === 'role' && g.name === 'worker'))
    throw conflict('body.name', 'CAPABILITY_NEEDS_WORKER')
  const row = await tx
    .insertInto('identity.role_grants')
    .values({
      staff_user_id: input.staffUserId,
      kind: input.kind,
      name: input.name,
      issued_by: issuerOf(input.actorId),
      reason: input.reason.trim(),
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await bump(tx, input.staffUserId)
  return { grantId: row.id }
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
): Promise<{ sessionsRevoked: number; linksInvalidated: number; flagged: number; upcoming: number }> {
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
  }
}

/** Re-enables a disabled account and emails a single-use reset (or invite) link: the old password was cleared. */
export async function enable(
  tx: Tx,
  input: { actorId: string; staffUserId: string; reason: string },
): Promise<{ status: 'active' | 'invited'; link: 'reset' | 'invite' }> {
  const u = await lockMember(tx, input.staffUserId)
  if (u.status !== 'disabled') throw conflict('staffUser', 'ACCOUNT_NOT_DISABLED')
  const status = u.activated_at !== null ? ('active' as const) : ('invited' as const)
  await tx
    .updateTable('identity.staff_users')
    .set((eb) => ({ status, disabled_at: null, version: eb('version', '+', 1) }))
    .where('id', '=', input.staffUserId)
    .execute()
  await tx
    .insertInto('identity.staff_status_changes')
    .values({
      staff_user_id: input.staffUserId,
      from_status: 'disabled',
      to_status: status,
      changed_by: input.actorId,
      reason: input.reason.trim(),
    })
    .execute()
  const link = status === 'active' ? ('reset' as const) : ('invite' as const)
  await issueLink(tx, { staffUserId: input.staffUserId, purpose: link, issuedBy: issuerOf(input.actorId) })
  return { status, link }
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
