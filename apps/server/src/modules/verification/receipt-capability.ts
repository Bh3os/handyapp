// The receipt capability (TSK-0033; HH-INT-13, HH-ID-03, HH-ID-08, OWN-DEC-96, RULE-SERVER-AUTHZ).
// The browser tab that sent a request gets one random token for that request's receipt page, in the Receipt-Capability
// header of the submission (a header, not the body: the idempotency record stores the body). The row keeps only the
// token's SHA-256. The capability names one request; through it the tab sees its own contact's masked email and phone
// with their verification states, asks for codes, enters them, changes an unverified email and answers the account
// offer. It reaches nothing else: no other request, customer, project or history, and it is not project access.
// PROPOSED: it lasts as long as a customer session may (session.timings.customerSessionMaxHours, 8 hours,
// FACT-SESSION-TIMINGS), the decided limit for a customer's time on the site; while that value is NOT CONFIGURED no
// capability is made and the receipt says verification is not available here (the request is saved either way).
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import { loadConfig } from '../../platform/config/index.js'

export const RECEIPT_CAPABILITY_HEADER = 'receipt-capability'

export type ReceiptCapability = { id: string; requestId: string; expiresAt: Date }

const hash = (token: string) => createHash('sha256').update(token, 'utf8').digest('hex')
const TOKEN = /^[A-Za-z0-9_-]{43}$/

/** A new capability for one saved request; the token is returned once. Null while session.timings is NOT CONFIGURED. */
export async function createReceiptCapability(
  tx: Tx,
  requestId: string,
  now: Date = new Date(),
): Promise<{ token: string; capability: ReceiptCapability } | null> {
  const timings = (await loadConfig(tx)).get('session.timings')
  if (timings.state !== 'CONFIGURED' || timings.value.customerSessionMaxHours <= 0) return null
  const token = randomBytes(32).toString('base64url')
  const id = randomUUID()
  const expiresAt = new Date(now.getTime() + timings.value.customerSessionMaxHours * 3_600_000)
  await tx
    .insertInto('intake.receipt_capabilities')
    .values({ id, token_hash: hash(token), request_id: requestId, expires_at: expiresAt, created_at: now })
    .execute()
  return { token, capability: { id, requestId, expiresAt } }
}

/** The live capability for a header value, or null (unknown, malformed, expired or revoked: answered as not found). */
export async function resolveReceiptCapability(
  db: Db | Tx,
  token: unknown,
  now: Date = new Date(),
): Promise<ReceiptCapability | null> {
  if (typeof token !== 'string' || !TOKEN.test(token)) return null
  const row = await db
    .selectFrom('intake.receipt_capabilities')
    .select(['id', 'request_id', 'expires_at'])
    .where('token_hash', '=', hash(token))
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', now)
    .executeTakeFirst()
  return row ? { id: row.id, requestId: row.request_id, expiresAt: row.expires_at } : null
}
