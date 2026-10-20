// Single-use invite and reset links (TSK-0014; HH-STAFF-01, OWN-DEC-114, FACT-SESSION-TIMINGS). Adapted from
// Bh3os/handyhub-app (apps/server/src/platform/staff-credentials.ts).
// - Issuing a link ends every earlier open link of the account and writes `staff_link.issued` to the outbox in the
//   same transaction; the send job creates the token, stores only its SHA-256 and emails it, so the plain token never
//   sits in the outbox, the database or a log.
// - Validity comes from the decided configuration: session.timings.staffInviteLinkHours and passwordResetLinkHours
//   (24 hours each).
// - Using a link consumes it in one statement, so two requests with the same link cannot both pass.
import type { Tx } from '@handyhub/db'
import { sql } from 'kysely'
import { loadConfig, requireConfigured } from '../../platform/config/index.js'
import { outbox } from '../../platform/outbox.js'
import { hashToken, newToken, TOKEN } from './tokens.js'

export type LinkPurpose = 'invite' | 'reset'
export const LINK_EVENT = 'staff_link.issued'

async function validityHours(tx: Tx, purpose: LinkPurpose): Promise<number> {
  const timings = requireConfigured((await loadConfig(tx)).get('session.timings')).value
  return purpose === 'invite' ? timings.staffInviteLinkHours : timings.passwordResetLinkHours
}

async function invalidateOpenLinks(tx: Tx, staffUserId: string): Promise<void> {
  await tx
    .updateTable('identity.staff_links')
    .set({ invalidated_at: sql<Date>`now()` })
    .where('staff_user_id', '=', staffUserId)
    .where('consumed_at', 'is', null)
    .where('invalidated_at', 'is', null)
    .execute()
}

async function insertLink(tx: Tx, staffUserId: string, purpose: LinkPurpose, issuedBy: string) {
  await invalidateOpenLinks(tx, staffUserId)
  const hours = await validityHours(tx, purpose)
  return tx
    .insertInto('identity.staff_links')
    .values({
      staff_user_id: staffUserId,
      purpose,
      issued_by: issuedBy,
      expires_at: sql<Date>`now() + make_interval(hours => ${hours})`,
    })
    .returning(['id', 'expires_at'])
    .executeTakeFirstOrThrow()
}

/** Issues a link that the send job emails (the normal path: invites and "Forgot password?"). */
export async function issueLink(
  tx: Tx,
  input: { staffUserId: string; purpose: LinkPurpose; issuedBy: string },
): Promise<{ linkId: string }> {
  const link = await insertLink(tx, input.staffUserId, input.purpose, input.issuedBy)
  await outbox.add(tx, {
    type: LINK_EVENT,
    aggregate: { type: 'staff_user', id: input.staffUserId },
    payload: { linkId: link.id, purpose: input.purpose },
    idempotencyKey: `${LINK_EVENT}:${link.id}`,
  })
  return { linkId: link.id }
}

/**
 * Issues a link and returns its token at once, for the operations command run in the host shell (the first Owner,
 * emergency access). Nothing is emailed or logged; the command prints the link once.
 */
export async function issueLinkNow(
  tx: Tx,
  input: { staffUserId: string; purpose: LinkPurpose; issuedBy: string },
): Promise<{ token: string; expiresAt: Date }> {
  const link = await insertLink(tx, input.staffUserId, input.purpose, input.issuedBy)
  const token = await deliverToken(tx, link.id)
  if (!token) throw new Error('a new link could not be delivered')
  return { token, expiresAt: new Date(link.expires_at) }
}

/** Creates the token of an open, undelivered link and stores its hash; null when the link is no longer open. */
export async function deliverToken(tx: Tx, linkId: string): Promise<string | null> {
  const token = newToken()
  const row = await tx
    .updateTable('identity.staff_links')
    .set({ token_hash: hashToken(token), delivered_at: sql<Date>`now()` })
    .where('id', '=', linkId)
    .where('token_hash', 'is', null)
    .where('consumed_at', 'is', null)
    .where('invalidated_at', 'is', null)
    .where('expires_at', '>', sql<Date>`now()`)
    .returning('id')
    .executeTakeFirst()
  return row ? token : null
}

/** Consumes a link (single use); null when it is unknown, used, ended or expired. */
export async function consumeLink(
  tx: Tx,
  token: string,
): Promise<{ linkId: string; staffUserId: string; purpose: LinkPurpose } | null> {
  if (!TOKEN.test(token)) return null
  const row = await tx
    .updateTable('identity.staff_links')
    .set({ consumed_at: sql<Date>`now()` })
    .where('token_hash', '=', hashToken(token))
    .where('consumed_at', 'is', null)
    .where('invalidated_at', 'is', null)
    .where('expires_at', '>', sql<Date>`now()`)
    .returning(['id', 'staff_user_id', 'purpose'])
    .executeTakeFirst()
  return row ? { linkId: row.id, staffUserId: row.staff_user_id, purpose: row.purpose as LinkPurpose } : null
}
