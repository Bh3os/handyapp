// Customer sessions (TSK-0016; HH-SEC-02, HH-ARC-06, HH-ID-05, HH-ID-06, HH-ID-07, FACT-SESSION-TIMINGS).
// - A session starts only after a verified exchange (a consumed one-time code); the caller passes what it proved.
//   Every start is a new random token (no fixation); the row keeps its SHA-256, never the token.
// - Lifetimes come from configuration when the session starts: customerSessionIdleMinutes (30) and
//   customerSessionMaxHours (8). Each request past the idle window or the maximum ends the session; activity slides
//   the idle window only. Sessions can be revoked server-side (sign-out, access revoked).
// - The cookie is `__Host-hh_customer`: Secure, HttpOnly, SameSite=Lax, Path=/, no Domain, so it stays on the public
//   origin that set it and never reaches the staff origin (HH-ARC-06). CSRF: API writes take JSON bodies only, which a
//   cross-site form cannot send, and SameSite=Lax keeps the cookie off cross-site POSTs.
// - The session becomes the policy's CustomerActor: the verified contact, its project accesses (each limited by the
//   session's own expiry) and whether the verification is still fresh for approvals (HH-ID-07).
// - TSK-0036 (HH-ID-10, HH-ID-11): an account session names its account and the contact value it signed in with. The
//   projects it opens are read from the account's active identity links on every request, so a revoked link or a
//   closed account opens nothing from then on; a closed account's sessions resolve to nothing.
// - TSK-0149 (OWN-DEC-198 F2): ordinary device sessions stay independent; a security event (the customer's Sign out
//   everywhere, the Owner's revocation, a staff-assisted recovery) ends every session of the account at once.
// - TSK-0118 (HH-ID-13): an account session also reaches the projects of its organization memberships' scopes, read
//   on every request like its links (organization-access.ts), each limited to the membership's privileges; a project
//   the account is linked to itself stays its own, with every right of the project's customer.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import type { CustomerActor } from '@handyhub/policy'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { RequestActor, ResolveActor } from '../../api/route.js'
import { sql } from 'kysely'
import { loadConfig } from '../../platform/config/index.js'
import { organizationAccessOf, type OrganizationProjectAccess } from './organization-access.js'

export const CUSTOMER_COOKIE = '__Host-hh_customer'

export type StartSessionInput = {
  contactRef: string
  via: 'grant' | 'account'
  projectIds: readonly string[]
  /** When the contact was verified (the code's verifiedAt). */
  verifiedAt: Date
  /** A session this one replaces (it is revoked in the same transaction). */
  replaces?: string
  /** TSK-0034: the project access grant a guest session is started from (revoking the grant ends the session). */
  grantId?: string
  /** TSK-0036: the customer account an account session signs in to, and the contact it signed in with. */
  account?: { id: string; signInChannel: 'email' | 'phone' }
  now?: Date
}

export type StartedSession = { sessionId: string; token: string; expiresAt: Date; idleMinutes: number }

export type CustomerSession = {
  id: string
  contactRef: string
  via: 'grant' | 'account'
  projectIds: string[]
  verifiedAt: Date
  freshUntil: Date
  expiresAt: Date
  /** TSK-0036: the account of an account session (null for a guest-link session). */
  accountId: string | null
  signInChannel: 'email' | 'phone' | null
  /** TSK-0034: the project access grant a guest-link session was started from (null for an account session). */
  grantId: string | null
  /**
   * TSK-0118: the projects an account session reaches through its organization memberships (never one of
   * `projectIds`), each with the privileges the memberships grant; empty for a guest-link session.
   */
  organizationAccess: OrganizationProjectAccess[]
}

/** Why a session ended (the stored revoke_reason). */
export type SessionEndReason =
  | 'signed_out'
  | 'rotated'
  | 'access_revoked'
  | 'contact_changed'
  | 'account_closed'
  // TSK-0149 (OWN-DEC-198 F2): a security-triggered revocation of every session of an account.
  | 'security_revoked'

export class SessionConfigError extends Error {
  override name = 'SessionConfigError'
  readonly code = 'NOT_CONFIGURED'
}

const tokenHash = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex')
const TOKEN = /^[A-Za-z0-9_-]{43}$/

export async function startCustomerSession(tx: Tx, input: StartSessionInput): Promise<StartedSession> {
  if (!tx.isTransaction) throw new Error('startCustomerSession runs inside the business transaction (withTx)')
  const config = await loadConfig(tx)
  const timings = config.get('session.timings')
  const limits = config.get('verification.limits')
  if (timings.state !== 'CONFIGURED') throw new SessionConfigError('session.timings is NOT CONFIGURED')
  if (limits.state !== 'CONFIGURED') throw new SessionConfigError('verification.limits is NOT CONFIGURED')
  const now = input.now ?? new Date()
  const idleMinutes = timings.value.customerSessionIdleMinutes
  const expiresAt = new Date(now.getTime() + timings.value.customerSessionMaxHours * 3_600_000)
  const freshUntil = new Date(input.verifiedAt.getTime() + limits.value.freshVerificationMinutes * 60_000)
  if (input.replaces) await revokeCustomerSession(tx, input.replaces, 'rotated', now)
  const token = randomBytes(32).toString('base64url')
  const sessionId = randomUUID()
  await tx
    .insertInto('identity.customer_sessions')
    .values({
      id: sessionId,
      token_hash: tokenHash(token),
      contact_ref: input.contactRef,
      via: input.via,
      project_ids: [...input.projectIds],
      verified_at: input.verifiedAt,
      fresh_until: freshUntil,
      idle_minutes: idleMinutes,
      created_at: now,
      last_seen_at: now,
      expires_at: expiresAt,
      grant_id: input.grantId ?? null,
      account_id: input.account?.id ?? null,
      sign_in_channel: input.account?.signInChannel ?? null,
    })
    .execute()
  return { sessionId, token, expiresAt, idleMinutes }
}

/** The live session for a cookie token, sliding its idle window; null when unknown, revoked, idle or past maximum. */
export async function resolveCustomerSession(
  db: Db | Tx,
  token: string | undefined,
  now: Date = new Date(),
): Promise<CustomerSession | null> {
  if (!token || !TOKEN.test(token)) return null
  const row = await db
    .updateTable('identity.customer_sessions')
    .set({ last_seen_at: now })
    .where('token_hash', '=', tokenHash(token))
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', now)
    .where(sql<boolean>`last_seen_at + make_interval(mins => idle_minutes) > ${now}`)
    .returning([
      'id',
      'contact_ref',
      'via',
      'project_ids',
      'verified_at',
      'fresh_until',
      'expires_at',
      'account_id',
      'sign_in_channel',
      'grant_id',
    ])
    .executeTakeFirst()
  if (!row) return null
  let projectIds = row.project_ids
  let organizationAccess: OrganizationProjectAccess[] = []
  if (row.via === 'account') {
    // TSK-0036: an account opens only what its active links name, read now; a closed account opens nothing.
    if (!row.account_id) return null
    const account = await db
      .selectFrom('identity.customer_accounts')
      .select('state')
      .where('id', '=', row.account_id)
      .executeTakeFirst()
    if (account?.state !== 'active') return null
    const links = await db
      .selectFrom('identity.customer_identity_links')
      .select('project_id')
      .where('account_id', '=', row.account_id)
      .where('state', '=', 'active')
      .orderBy('decided_at')
      .execute()
    projectIds = links.map((l) => l.project_id)
    organizationAccess = (await organizationAccessOf(db, row.account_id)).filter(
      (a) => !projectIds.includes(a.projectId),
    )
  }
  return {
    id: row.id,
    contactRef: row.contact_ref,
    via: row.via as 'grant' | 'account',
    projectIds,
    verifiedAt: row.verified_at,
    freshUntil: row.fresh_until,
    expiresAt: row.expires_at,
    accountId: row.account_id,
    signInChannel: row.sign_in_channel as 'email' | 'phone' | null,
    grantId: row.grant_id,
    organizationAccess,
  }
}

/** Ends a session server-side; a revoked session never comes back. */
export async function revokeCustomerSession(
  db: Db | Tx,
  sessionId: string,
  reason: SessionEndReason,
  now: Date = new Date(),
): Promise<boolean> {
  const r = await db
    .updateTable('identity.customer_sessions')
    .set({ revoked_at: now, revoke_reason: reason })
    .where('id', '=', sessionId)
    .where('revoked_at', 'is', null)
    .executeTakeFirst()
  return Number(r.numUpdatedRows) > 0
}

/** Ends every live session started from these grants (TSK-0034: a revoked grant opens nothing any more). */
export async function revokeGrantSessions(
  tx: Tx,
  grantIds: readonly string[],
  now: Date = new Date(),
): Promise<number> {
  if (grantIds.length === 0) return 0
  const r = await tx
    .updateTable('identity.customer_sessions')
    .set({ revoked_at: now, revoke_reason: 'access_revoked' })
    .where('grant_id', 'in', [...grantIds])
    .where('revoked_at', 'is', null)
    .executeTakeFirst()
  return Number(r.numUpdatedRows)
}

/**
 * Ends every live session of an account except `keep` (TSK-0036, HH-ID-11): after a sign-in value change the other
 * devices sign in again; when the account closes, all of them end; after a security event (TSK-0149), all of them.
 */
export async function revokeAccountSessions(
  tx: Tx,
  accountId: string,
  reason: Extract<SessionEndReason, 'contact_changed' | 'account_closed' | 'security_revoked'>,
  options: { keep?: string; now?: Date } = {},
): Promise<number> {
  let q = tx
    .updateTable('identity.customer_sessions')
    .set({ revoked_at: options.now ?? new Date(), revoke_reason: reason })
    .where('account_id', '=', accountId)
    .where('revoked_at', 'is', null)
  if (options.keep) q = q.where('id', '<>', options.keep)
  const r = await q.executeTakeFirst()
  return Number(r.numUpdatedRows)
}

/** A fresh verification inside the session (for example a new code before an approval) restarts its fresh window. */
export async function refreshVerification(tx: Tx, sessionId: string, verifiedAt: Date): Promise<void> {
  const config = await loadConfig(tx)
  const limits = config.get('verification.limits')
  if (limits.state !== 'CONFIGURED') throw new SessionConfigError('verification.limits is NOT CONFIGURED')
  await tx
    .updateTable('identity.customer_sessions')
    .set({
      verified_at: verifiedAt,
      fresh_until: new Date(verifiedAt.getTime() + limits.value.freshVerificationMinutes * 60_000),
    })
    .where('id', '=', sessionId)
    .where('revoked_at', 'is', null)
    .execute()
}

/**
 * The policy actor for a session. Each project access ends with the session; fresh while within fresh_until. TSK-0118:
 * an organization access carries its privileges.
 */
export function customerActor(session: CustomerSession, now: Date = new Date()): CustomerActor {
  return {
    kind: 'customer',
    contactId: session.contactRef,
    projectAccess: [
      ...session.projectIds.map((projectId) => ({
        projectId,
        via: session.via,
        expiresAt: session.expiresAt,
      })),
      // TSK-0118: limited to the memberships' privileges (the policy's organization table).
      ...session.organizationAccess.map((a) => ({
        projectId: a.projectId,
        via: 'organization' as const,
        expiresAt: session.expiresAt,
        privileges: a.privileges,
      })),
    ],
    freshVerification: now.getTime() < session.freshUntil.getTime(),
  }
}

/** The session token from the request's Cookie header, if any. */
export function readSessionToken(req: Pick<FastifyRequest, 'headers'>): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq).trim() === CUSTOMER_COOKIE) return part.slice(eq + 1).trim()
  }
  return undefined
}

/** Set-Cookie value for a started session; it lasts no longer than the session's maximum. */
export function sessionCookie(session: Pick<StartedSession, 'token' | 'expiresAt'>, now: Date = new Date()): string {
  const maxAge = Math.max(0, Math.floor((session.expiresAt.getTime() - now.getTime()) / 1000))
  return `${CUSTOMER_COOKIE}=${session.token}; Path=/; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`
}

/** Set-Cookie value that removes the cookie (sign-out, ended session). */
export function clearedSessionCookie(): string {
  return `${CUSTOMER_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax`
}

export function setSessionCookie(reply: FastifyReply, session: Pick<StartedSession, 'token' | 'expiresAt'>): void {
  reply.header('set-cookie', sessionCookie(session))
}

/**
 * The caller for API requests: a live customer session becomes a CustomerActor, anything else a guest. Staff sessions
 * (TSK-0014) are resolved by their own resolver on the staff origin; `fallback` lets the two compose.
 */
export function customerSessionResolver(db: Db, fallback?: ResolveActor): ResolveActor {
  return async (req): Promise<RequestActor> => {
    const session = await resolveCustomerSession(db, readSessionToken(req))
    if (session) return { actor: customerActor(session) }
    return fallback ? fallback(req) : { actor: { kind: 'guest' } }
  }
}
