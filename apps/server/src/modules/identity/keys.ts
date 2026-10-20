// The code key and the keyed derivations behind one-time codes (TSK-0016; HH-SEC-02, HH-INT-13, RULE-SERVER-AUTHZ).
// - CODE_HASH_KEY is a server secret set by the owner in Render (sync: false). Codes are derived from it and a
//   per-code random nonce, so no code is ever stored, put in the outbox, or logged: the delivery job derives the same
//   code again, a retried send carries the same code, and the verifier compares a keyed digest in constant time.
// - Client addresses are kept only as keyed digests, for the per-client limits.
// - local and ci without a key use a random key for the life of the process; staging and production without one
//   leave codes NOT CONFIGURED (nothing is sent and issuing refuses), never a fake success.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { ConfigError, type EnvironmentName } from '../../config.js'
import { Secret } from '../../providers/types.js'

export type CodeKeySettings =
  { state: 'configured'; key: Secret; ephemeral: boolean } | { state: 'not_configured'; missing: ['CODE_HASH_KEY'] }

/** At least 32 characters: the key is used as HMAC-SHA-256 key material. */
export const MIN_CODE_KEY_LENGTH = 32

export function readCodeKey(env: Readonly<Record<string, string | undefined>>): CodeKeySettings {
  const environment = env['HANDYHUB_ENV'] as EnvironmentName | undefined
  const raw = env['CODE_HASH_KEY']?.trim()
  if (raw) {
    if (raw.length < MIN_CODE_KEY_LENGTH)
      throw new ConfigError(`CODE_HASH_KEY must be at least ${MIN_CODE_KEY_LENGTH} characters`)
    return { state: 'configured', key: new Secret(raw), ephemeral: false }
  }
  if (environment === 'local' || environment === 'ci')
    return { state: 'configured', key: new Secret(randomBytes(32).toString('hex')), ephemeral: true }
  return { state: 'not_configured', missing: ['CODE_HASH_KEY'] }
}

const hmac = (key: Secret, ...parts: string[]) => createHmac('sha256', key.reveal()).update(parts.join('|'))

/** The code for a row: digits from HMAC(key, id, nonce). The modulo bias over 64 bits is negligible. */
export function deriveCode(key: Secret, codeId: string, nonce: string, digits: number): string {
  const n = hmac(key, 'code', codeId, nonce).digest().readBigUInt64BE(0) % 10n ** BigInt(digits)
  return n.toString().padStart(digits, '0')
}

/** The keyed digest stored with the row and compared on verification. */
export function codeDigest(key: Secret, codeId: string, code: string): string {
  return hmac(key, 'digest', codeId, code).digest('hex')
}

export function digestsEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex')
  const y = Buffer.from(b, 'hex')
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y)
}

/** A client address as a keyed digest, or null when unknown. */
export function clientKey(key: Secret, ip: string | undefined): string | null {
  return ip ? hmac(key, 'client', ip).digest('hex') : null
}

export function newNonce(): string {
  return randomBytes(16).toString('hex')
}
