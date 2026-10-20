// Staff sessions (TSK-0014; HH-SEC-02, OWN-DEC-114, FACT-SESSION-TIMINGS). Adapted from Bh3os/handyhub-app
// (apps/server/src/platform/session.ts). Opaque 256-bit tokens in a host-only cookie; only the SHA-256 is stored.
// - A new session (new ID) on every sign-in: no fixation.
// - Idle expiry from the decided configuration (session.timings.staffSessionIdleMinutes, 30 minutes): a session
//   unused for longer is refused and revoked on the next request.
// - Revocation takes effect on the next request; a disabled account's session can do nothing.
// - Fresh authentication for sensitive actions: a password entered within FRESH_AUTH_MINUTES (sign-in or re-entry).
import type { Db, Tx } from '@handyhub/db'
import { sql } from 'kysely'
import { loadConfig, requireConfigured } from '../../platform/config/index.js'
import { hashToken, newToken, TOKEN } from './tokens.js'

/** PROPOSED: a password entry counts as fresh authentication for 5 minutes (the old repo's step-up window). */
export const FRESH_AUTH_MINUTES = 5
/** last_seen_at is written at most once a minute, so every request does not write. */
const TOUCH_AFTER_MS = 60_000

export type CookieOptions = { secure: boolean }

/** `__Host-` (Secure, host-only, Path=/) in staging and production; plain over http in local and ci. */
export function sessionCookieName(options: CookieOptions): string {
  return options.secure ? '__Host-hh_staff' : 'hh_staff'
}

export function sessionCookie(token: string, options: CookieOptions): string {
  const parts = [`${sessionCookieName(options)}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict']
  if (options.secure) parts.push('Secure')
  return parts.join('; ')
}

export function clearedSessionCookie(options: CookieOptions): string {
  return `${sessionCookie('', options)}; Max-Age=0`
}

/** The session token from a Cookie header, when it is well formed. */
export function readSessionToken(header: string | undefined, options: CookieOptions): string | null {
  if (!header) return null
  const name = sessionCookieName(options)
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq).trim() === name) {
      const value = part.slice(eq + 1).trim()
      return TOKEN.test(value) ? value : null
    }
  }
  return null
}

export async function createSession(tx: Tx, staffUserId: string): Promise<{ id: string; token: string }> {
  const token = newToken()
  const row = await tx
    .insertInto('identity.staff_sessions')
    .values({ staff_user_id: staffUserId, token_hash: hashToken(token) })
    .returning('id')
    .executeTakeFirstOrThrow()
  return { id: row.id, token }
}

export async function revokeSession(tx: Tx, sessionId: string, reason: 'sign_out'): Promise<void> {
  await tx
    .updateTable('identity.staff_sessions')
    .set({ revoked_at: sql<Date>`now()`, revoke_reason: reason })
    .where('id', '=', sessionId)
    .where('revoked_at', 'is', null)
    .execute()
}

/** Revokes every live session of a staff user; returns how many. */
export async function revokeAllSessions(
  tx: Tx,
  staffUserId: string,
  reason: 'password_set' | 'disabled' | 'revoked_by_owner',
): Promise<number> {
  const res = await tx
    .updateTable('identity.staff_sessions')
    .set({ revoked_at: sql<Date>`now()`, revoke_reason: reason })
    .where('staff_user_id', '=', staffUserId)
    .where('revoked_at', 'is', null)
    .executeTakeFirst()
  return Number(res.numUpdatedRows)
}

export type LiveSession = {
  sessionId: string
  staffUserId: string
  displayName: string | null
  email: string
  locale: 'en' | 'es'
  roles: string[]
  capabilities: string[]
  freshAuth: boolean
}

/** Resolves a token to a live session of an active staff user, or null; slides the idle window. */
export async function resolveSession(db: Db, token: string, now = new Date()): Promise<LiveSession | null> {
  const row = await db
    .selectFrom('identity.staff_sessions as s')
    .innerJoin('identity.staff_users as u', 'u.id', 's.staff_user_id')
    .select([
      's.id',
      's.staff_user_id',
      's.last_seen_at',
      's.authenticated_at',
      's.revoked_at',
      'u.display_name',
      'u.email',
      'u.locale',
      'u.status',
    ])
    .where('s.token_hash', '=', hashToken(token))
    .executeTakeFirst()
  if (!row || row.revoked_at !== null || row.status !== 'active') return null
  const idleMinutes = requireConfigured((await loadConfig(db)).get('session.timings')).value.staffSessionIdleMinutes
  const lastSeen = new Date(row.last_seen_at).getTime()
  if (now.getTime() - lastSeen > idleMinutes * 60_000) {
    await db
      .updateTable('identity.staff_sessions')
      .set({ revoked_at: now, revoke_reason: 'idle_expired' })
      .where('id', '=', row.id)
      .where('revoked_at', 'is', null)
      .execute()
    return null
  }
  if (now.getTime() - lastSeen > TOUCH_AFTER_MS)
    await db.updateTable('identity.staff_sessions').set({ last_seen_at: now }).where('id', '=', row.id).execute()
  const grants = await db
    .selectFrom('identity.role_grants')
    .select(['kind', 'name'])
    .where('staff_user_id', '=', row.staff_user_id)
    .where('ended_at', 'is', null)
    .where('effective_from', '<=', now)
    .execute()
  return {
    sessionId: row.id,
    staffUserId: row.staff_user_id,
    displayName: row.display_name,
    email: row.email,
    locale: row.locale === 'es' ? 'es' : 'en',
    roles: grants.filter((g) => g.kind === 'role').map((g) => g.name),
    capabilities: grants.filter((g) => g.kind === 'capability').map((g) => g.name),
    freshAuth: now.getTime() - new Date(row.authenticated_at).getTime() <= FRESH_AUTH_MINUTES * 60_000,
  }
}
