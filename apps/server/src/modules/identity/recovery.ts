// The Owner's own lost authenticator (TSK-0154; OWN-DEC-202, HH-STAFF-01, HH-SEC-06). PROPOSED recovery path, never a
// way to turn MFA off: first the Owner's single-use recovery codes (shown once at enrolment, accepted at the sign-in
// challenge); when none is left, the operations command `staff-access reset-mfa <email> <reason>` run in the host
// shell (Render shell: access to the host is the proof of authority, as for the first-Owner bootstrap). It removes the
// authenticator and its recovery codes and revokes every session in one transaction, audited with the reason; the
// Owner's next sign-in with their password enrols a new authenticator before any staff screen. Staff members who are
// not Owners are reset by the Owner in the staff app (POST /staff/members/:id/mfa-reset), never here.
import type { Tx } from '@handyhub/db'
import { audit, type AuditActor } from '../../platform/audit.js'
import { accountForSignIn } from './accounts.js'
import { removeMfa } from './mfa.js'
import { revokeAllSessions } from './sessions.js'

export type OwnerRecoveryOutcome =
  | { outcome: 'reset'; staffUserId: string; sessionsRevoked: number; recoveryCodesRemoved: number }
  | { outcome: 'not_an_owner' }
  | { outcome: 'not_enrolled' }

export const OPERATIONS_ACTOR: AuditActor = { kind: 'system', process: 'ops:staff-access' }

export async function recoverOwnerMfa(
  tx: Tx,
  input: { email: string; reason: string; actor?: AuditActor },
): Promise<OwnerRecoveryOutcome> {
  const reason = input.reason.trim()
  if (!reason) throw new Error('a reason is required')
  const account = await accountForSignIn(tx, input.email)
  const owner = account
    ? await tx
        .selectFrom('identity.role_grants')
        .select('id')
        .where('staff_user_id', '=', account.id)
        .where('kind', '=', 'role')
        .where('name', '=', 'owner')
        .where('ended_at', 'is', null)
        .executeTakeFirst()
    : undefined
  if (!account || account.status === 'disabled' || !owner) return { outcome: 'not_an_owner' }
  const removed = await removeMfa(tx, account.id)
  if (!removed.factor) return { outcome: 'not_enrolled' }
  const sessionsRevoked = await revokeAllSessions(tx, account.id, 'mfa_reset')
  await audit.record(tx, {
    actor: input.actor ?? OPERATIONS_ACTOR,
    action: 'staff.mfa_reset',
    target: { type: 'staff_user', id: account.id },
    summary: { change: 'mfa_reset', sessionsRevoked, recoveryCodesRemoved: removed.recoveryCodes, operations: true },
    reason,
  })
  return { outcome: 'reset', staffUserId: account.id, sessionsRevoked, recoveryCodesRemoved: removed.recoveryCodes }
}
