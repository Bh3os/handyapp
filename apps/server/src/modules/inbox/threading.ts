// Per-project reply tokens (TSK-0049; HH-COM-07, INT-Resend, OWN-DEC-120). Each project has one random token; its
// customer emails reply to `<local>+<token>@<domain>` of the configured receiving address (INBOUND_EMAIL_ADDRESS), so a
// reply names its project by a reliable reference instead of by the sender's name. The token identifies a thread
// only: it grants no access, reveals nothing, and a reply carrying it is still checked against the project's contacts.
// While no receiving address is configured, no token is handed out and replies match by thread headers and verified
// contact email only.
import { randomBytes } from 'node:crypto'
import type { Tx } from '@handyhub/db'

export type InboundAddress = { local: string; domain: string }

export const REPLY_TOKEN = /^[a-z2-7]{20}$/
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567'

/** 20 base32 characters from 100 random bits. */
export function newReplyToken(): string {
  const bytes = randomBytes(13)
  let bits = 0
  let value = 0
  let out = ''
  for (const b of bytes) {
    value = (value << 8) | b
    bits += 8
    while (bits >= 5 && out.length < 20) {
      out += BASE32[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  return out
}

/** The project's reply token, created on first use (one per project, never changed). */
export async function projectReplyToken(tx: Tx, projectId: string): Promise<string> {
  await tx
    .insertInto('comms.project_reply_tokens')
    .values({ project_id: projectId, token: newReplyToken() })
    .onConflict((oc) => oc.column('project_id').doNothing())
    .execute()
  const row = await tx
    .selectFrom('comms.project_reply_tokens')
    .select('token')
    .where('project_id', '=', projectId)
    .executeTakeFirstOrThrow()
  return row.token
}

export function replyAddress(address: InboundAddress, token: string): string {
  return `${address.local}+${token}@${address.domain}`
}

/** The reply tokens among the recipients of an inbound email: plus-addresses of the configured receiving address. */
export function replyTokensIn(recipients: readonly string[], address: InboundAddress | null): string[] {
  if (!address) return []
  const out = new Set<string>()
  for (const r of recipients) {
    const at = r.lastIndexOf('@')
    if (at < 0 || r.slice(at + 1).toLowerCase() !== address.domain) continue
    const local = r.slice(0, at).toLowerCase()
    const plus = local.indexOf('+')
    if (plus < 0 || local.slice(0, plus) !== address.local) continue
    const token = local.slice(plus + 1)
    if (REPLY_TOKEN.test(token)) out.add(token)
  }
  return [...out]
}
