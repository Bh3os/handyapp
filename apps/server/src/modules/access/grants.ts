// Project access grants: the single-project guest link (TSK-0034; HH-ID-04, HH-ID-05, HH-INT-21, HH-ID-03, HH-ID-08,
// HH-DATA-01, ENT-ProjectAccessGrant, OWN-DEC-97, RULE-SERVER-AUTHZ).
// - A grant names one project, the contact it was issued for, the request it came from, its scope (the Customer
//   column of ROLE-MATRIX for that one project), its expiry and its revocation. It never extends to another project of
//   the same customer, email or phone (HH-ID-04).
// - The link's token is 256 bits derived from the server's code key and the grant's random nonce
//   (HMAC-SHA-256 over "project_access|<grant id>|<nonce>", base64url): the database keeps the nonce and the token's
//   SHA-256 only, so the database alone cannot rebuild a link, and a retried send carries the same link. Maintained
//   primitives only (node:crypto), as for one-time codes (TSK-0016); no invented cryptography (HH-ID-08).
// - The lifetime is access.grants.linkHours (PROPOSED 24 hours, HH-ID-06). Without the code key or that value no
//   grant is issued (NOT CONFIGURED): the request is saved either way and nothing pretends a link exists.
// - A revocation is final (the database refuses to undo it) and ends every session started from the grant.
import { createHmac, randomUUID } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import { loadConfig } from '../../platform/config/index.js'
import { revokeGrantSessions, type CodeKeySettings } from '../identity/index.js'
import { newNonce } from '../identity/keys.js'
import { hashToken, TOKEN } from '../identity/tokens.js'
import type { Secret } from '../../providers/types.js'

export type GrantReason = 'submission' | 'contact_change' | 'reissue' | 'staff_reissue'
export type RevokeReason = 'contact_changed' | 'staff_revoked' | 'account_deleted' | 'corrected_link'

export type Grant = {
  id: string
  projectId: string
  contactId: string
  requestId: string
  expiresAt: Date
}

/** The link token of a grant. */
export function accessToken(key: Secret, grantId: string, nonce: string): string {
  return createHmac('sha256', key.reveal()).update(['project_access', grantId, nonce].join('|')).digest('base64url')
}

/** The access page a link opens; the token is in the fragment, which browsers never send to a server (HH-ID-08). */
export function accessLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, '')}/access#${token}`
}

export type IssueGrantInput = {
  projectId: string
  contactId: string
  requestId: string
  reason: GrantReason
  now?: Date
}

/** Issues a grant inside the caller's transaction; null while the code key or access.grants is NOT CONFIGURED. */
export async function issueGrant(
  tx: Tx,
  key: CodeKeySettings,
  input: IssueGrantInput,
): Promise<{ grant: Grant; token: string } | null> {
  if (!tx.isTransaction) throw new Error('issueGrant runs inside the business transaction (withTx)')
  if (key.state !== 'configured') return null
  const setting = (await loadConfig(tx)).get('access.grants')
  if (setting.state !== 'CONFIGURED') return null
  const now = input.now ?? new Date()
  const id = randomUUID()
  const nonce = newNonce()
  const token = accessToken(key.key, id, nonce)
  const expiresAt = new Date(now.getTime() + setting.value.linkHours * 3_600_000)
  await tx
    .insertInto('identity.project_access_grants')
    .values({
      id,
      project_id: input.projectId,
      contact_id: input.contactId,
      request_id: input.requestId,
      scope: 'guest_project',
      issued_reason: input.reason,
      nonce,
      token_hash: hashToken(token),
      created_at: now,
      expires_at: expiresAt,
    })
    .execute()
  return {
    grant: { id, projectId: input.projectId, contactId: input.contactId, requestId: input.requestId, expiresAt },
    token,
  }
}

const GRANT_COLUMNS = ['id', 'project_id', 'contact_id', 'request_id', 'expires_at', 'nonce'] as const
type GrantRow = {
  id: string
  project_id: string
  contact_id: string
  request_id: string
  expires_at: Date
  nonce: string
}
const toGrant = (r: GrantRow): Grant => ({
  id: r.id,
  projectId: r.project_id,
  contactId: r.contact_id,
  requestId: r.request_id,
  expiresAt: r.expires_at,
})

/**
 * The live grant a presented token stands for, or null: unknown, malformed, expired and revoked are one answer, so
 * the caller answers them like a missing record. Reading never changes the grant (HH-ID-05).
 */
export async function resolveGrant(
  db: Db | Tx,
  token: unknown,
  now: Date = new Date(),
  lock = false,
): Promise<Grant | null> {
  if (typeof token !== 'string' || !TOKEN.test(token)) return null
  const q = db
    .selectFrom('identity.project_access_grants')
    .select([...GRANT_COLUMNS])
    .where('token_hash', '=', hashToken(token))
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', now)
  const row = await (lock ? q.forUpdate() : q).executeTakeFirst()
  return row ? toGrant(row) : null
}

/**
 * The project a presented token was ever issued for, whatever the grant's state (TSK-0035: an expired or revoked link
 * may ask for a new one). It opens nothing: the caller only learns which project a reissue would be for.
 */
export async function projectOfAnyGrant(db: Db | Tx, token: unknown): Promise<string | null> {
  if (typeof token !== 'string' || !TOKEN.test(token)) return null
  const row = await db
    .selectFrom('identity.project_access_grants')
    .select('project_id')
    .where('token_hash', '=', hashToken(token))
    .executeTakeFirst()
  return row?.project_id ?? null
}

/** A grant with its nonce (the access-link job derives its token again), whatever its state. */
export async function grantForSend(
  db: Db | Tx,
  where: { grantId: string } | { requestId: string; reason: GrantReason },
): Promise<(Grant & { nonce: string; revoked: boolean }) | null> {
  let q = db
    .selectFrom('identity.project_access_grants')
    .select([...GRANT_COLUMNS, 'revoked_at'])
    .orderBy('created_at', 'desc')
    .limit(1)
  q =
    'grantId' in where
      ? q.where('id', '=', where.grantId)
      : q.where('request_id', '=', where.requestId).where('issued_reason', '=', where.reason)
  const row = await q.executeTakeFirst()
  return row ? { ...toGrant(row), nonce: row.nonce, revoked: row.revoked_at !== null } : null
}

/** The newest live grant of a project (a guest session on the receipt is started from it). */
export async function liveGrantOfProject(tx: Tx, projectId: string, now: Date = new Date()): Promise<Grant | null> {
  const row = await tx
    .selectFrom('identity.project_access_grants')
    .select([...GRANT_COLUMNS])
    .where('project_id', '=', projectId)
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', now)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst()
  return row ? toGrant(row) : null
}

/** Revokes every live grant of a project and ends their sessions; returns the revoked grant IDs. */
export async function revokeProjectGrants(
  tx: Tx,
  input: { projectId: string; reason: RevokeReason; by: string; now?: Date },
): Promise<string[]> {
  const now = input.now ?? new Date()
  const rows = await tx
    .updateTable('identity.project_access_grants')
    .set({ revoked_at: now, revoke_reason: input.reason, revoked_by: input.by })
    .where('project_id', '=', input.projectId)
    .where('revoked_at', 'is', null)
    .returning('id')
    .execute()
  const ids = rows.map((r) => r.id)
  await revokeGrantSessions(tx, ids, now)
  return ids
}

/** Records a verified exchange on the grant (ENT-ProjectAccessGrant "last verified time"). */
export async function markVerified(tx: Tx, grantId: string, at: Date): Promise<void> {
  await tx
    .updateTable('identity.project_access_grants')
    .set({ last_verified_at: at })
    .where('id', '=', grantId)
    .where('revoked_at', 'is', null)
    .execute()
}
