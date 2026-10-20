// Staff accounts (TSK-0014; HH-STAFF-01, ENT-StaffUser, ENT-AuthIdentity, ENT-RoleGrant). Accounts exist only by the
// Owner's invitation or the one-time bootstrap: there is no public registration. No function here returns a hash.
import type { Db, Tx } from '@handyhub/db'
import type { StaffRole } from '@handyhub/policy'
import { sql } from 'kysely'
import { audit, type AuditActor } from '../../platform/audit.js'
import { issueLink } from './links.js'
import { revokeAllSessions } from './sessions.js'
import { normalizeEmail } from './tokens.js'

export class DuplicateStaffEmailError extends Error {
  override name = 'DuplicateStaffEmailError'
}

export type NewStaffUser = {
  email: string
  displayName: string | null
  locale: 'en' | 'es'
  role: StaffRole
  issuedBy: string
  reason?: string
}

/** Creates an invited account with its sign-in identity (no password yet) and its role grant. */
export async function createStaffUser(tx: Tx, input: NewStaffUser): Promise<{ id: string }> {
  const email = normalizeEmail(input.email)
  const exists = await tx.selectFrom('identity.staff_users').select('id').where('email', '=', email).executeTakeFirst()
  if (exists) throw new DuplicateStaffEmailError('a staff account with this email exists')
  const user = await tx
    .insertInto('identity.staff_users')
    .values({ email, display_name: input.displayName, locale: input.locale })
    .returning('id')
    .executeTakeFirstOrThrow()
  await tx.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
  await tx
    .insertInto('identity.role_grants')
    .values({
      staff_user_id: user.id,
      kind: 'role',
      name: input.role,
      issued_by: input.issuedBy,
      reason: input.reason ?? null,
    })
    .execute()
  return user
}

export type SignInAccount = {
  id: string
  status: string
  passwordHash: string | null
  email: string
  name: string | null
}

/** The account behind a login email, with its hash for verification only (never returned by an API). */
export async function accountForSignIn(db: Db | Tx, email: string): Promise<SignInAccount | null> {
  const row = await db
    .selectFrom('identity.staff_users as u')
    .innerJoin('identity.auth_identities as a', 'a.staff_user_id', 'u.id')
    .select(['u.id', 'u.status', 'u.email', 'u.display_name', 'a.password_hash'])
    .where('u.email', '=', normalizeEmail(email))
    .executeTakeFirst()
  return row
    ? { id: row.id, status: row.status, passwordHash: row.password_hash, email: row.email, name: row.display_name }
    : null
}

/** Stores a new password hash, activates an invited account and revokes every session (the person signs in again). */
export async function setPasswordHash(tx: Tx, staffUserId: string, passwordHash: string): Promise<{ revoked: number }> {
  await tx
    .updateTable('identity.auth_identities')
    .set({ password_hash: passwordHash, password_set_at: sql<Date>`now()` })
    .where('staff_user_id', '=', staffUserId)
    .execute()
  await tx
    .updateTable('identity.staff_users')
    .set((eb) => ({
      status: 'active',
      activated_at: sql<Date>`coalesce(activated_at, now())`,
      version: eb('version', '+', 1),
    }))
    .where('id', '=', staffUserId)
    .where('status', '=', 'invited')
    .execute()
  return { revoked: await revokeAllSessions(tx, staffUserId, 'password_set') }
}

/** Whether an Owner account exists that is not disabled (invited or active). */
export async function ownerExists(db: Db | Tx): Promise<boolean> {
  const row = await db
    .selectFrom('identity.role_grants as g')
    .innerJoin('identity.staff_users as u', 'u.id', 'g.staff_user_id')
    .select('g.id')
    .where('g.kind', '=', 'role')
    .where('g.name', '=', 'owner')
    .where('g.ended_at', 'is', null)
    .where('u.status', '<>', 'disabled')
    .executeTakeFirst()
  return row !== undefined
}

const BOOTSTRAP: AuditActor = { kind: 'system', process: 'staff.bootstrap' }

/**
 * The first Owner (HH-STAFF-01 safe bootstrap): while no Owner exists, BOOTSTRAP_OWNER_EMAIL becomes an invited Owner
 * and one invite is sent through the outbox. No password is ever set here; with an Owner present it does nothing.
 */
export async function ensureBootstrapOwner(
  tx: Tx,
  input: { email: string; displayName: string | null; requestId: string },
): Promise<'created' | 'present'> {
  await sql`SELECT pg_advisory_xact_lock(hashtextextended('identity.bootstrap_owner', 0))`.execute(tx)
  if (await ownerExists(tx)) return 'present'
  const user = await createStaffUser(tx, {
    email: input.email,
    displayName: input.displayName,
    locale: 'en',
    role: 'owner',
    issuedBy: 'system:bootstrap',
    reason: 'First Owner from BOOTSTRAP_OWNER_EMAIL',
  })
  await issueLink(tx, { staffUserId: user.id, purpose: 'invite', issuedBy: 'system:bootstrap' })
  await audit.record(tx, {
    actor: BOOTSTRAP,
    action: 'staff.invite',
    target: { type: 'staff_user', id: user.id },
    summary: { role: 'owner', bootstrap: true },
    requestId: input.requestId,
  })
  return 'created'
}
