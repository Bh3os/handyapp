// The one-time-code key of the e2e servers (TSK-0033) and the code a stored row stands for. The key is synthetic and
// built at runtime, so no literal looks like a credential (RULE-SYNTHETIC-DATA). The derivation mirrors deriveCode of
// apps/server/src/modules/identity/keys.ts (HMAC-SHA-256 over "code|<id>|<nonce>", the first 64 bits modulo 10^digits);
// a drift would make every verification e2e fail.
import { createHmac } from 'node:crypto'

export const E2E_CODE_KEY = ['e2e', 'synthetic', 'one', 'time', 'code', 'key', 'not', 'secret'].join('-')

export function codeFor(row: { id: string; nonce: string }, digits = 6): string {
  const n =
    createHmac('sha256', E2E_CODE_KEY).update(['code', row.id, row.nonce].join('|')).digest().readBigUInt64BE(0) %
    10n ** BigInt(digits)
  return n.toString().padStart(digits, '0')
}
