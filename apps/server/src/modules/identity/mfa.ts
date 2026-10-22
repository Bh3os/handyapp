// Staff MFA (TSK-0015; HH-STAFF-01, HH-SEC-02, OWN-DEC-114), mandatory for every staff role since TSK-0154
// (OWN-DEC-202): one TOTP authenticator per staff user, from a maintained library (otpauth, RFC 6238: SHA-1, 6 digits,
// 30 seconds), with single-use recovery codes.
// - Without MFA_ENCRYPTION_KEY nobody can enrol or give a code, so staff sign-in is refused in every environment
//   (fail closed, mfaNotConfigured); the server logs MFA_NOT_CONFIGURED_LOG for the operator.
// - The shared secret is sealed with AES-256-GCM under MFA_ENCRYPTION_KEY and shown only once, at enrolment.
// - A code is accepted within one step of clock drift and never twice (last_used_step).
// - Recovery codes: 10 random codes, shown once when MFA is confirmed; only their SHA-256 is stored.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import { sql } from 'kysely'
import { Secret as TotpSecret, TOTP } from 'otpauth'
import { ApiError } from '../../api/errors.js'
import type { Secret } from '../../providers/types.js'
import { hashToken } from './tokens.js'

export const RECOVERY_CODE_COUNT = 10

/** The operator error logged when staff sign-in is refused for a missing key (names the variable, never a value). */
export const MFA_NOT_CONFIGURED_LOG =
  'MFA_NOT_CONFIGURED: staff sign-in is refused until the operator sets MFA_ENCRYPTION_KEY (at least 32 random characters) in the environment'

/** Staff sign-in while MFA_ENCRYPTION_KEY is unset: NOT_CONFIGURED, field mfa, code MFA_NOT_CONFIGURED. */
export function mfaNotConfigured(): ApiError {
  return new ApiError('NOT_CONFIGURED', { fieldErrors: [{ field: 'mfa', code: 'MFA_NOT_CONFIGURED', message: '' }] })
}
const PERIOD = 30

function keyOf(key: Secret): Buffer {
  return createHash('sha256').update(key.reveal()).digest()
}

/** Seals a TOTP secret: `v1.<iv>.<tag>.<ciphertext>` in base64url. */
export function seal(key: Secret, plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyOf(key), iv)
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join(
    '.',
  )
}

export function unseal(key: Secret, sealed: string): string {
  const [v, iv, tag, data] = sealed.split('.')
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('unknown sealed secret format')
  const decipher = createDecipheriv('aes-256-gcm', keyOf(key), Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}

function totp(secretBase32: string, label = 'staff'): TOTP {
  return new TOTP({ issuer: 'HandyHub', label, algorithm: 'SHA1', digits: 6, period: PERIOD, secret: secretBase32 })
}

/** The time step a code matches (within one step of drift), or null. */
export function matchStep(secretBase32: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null
  const delta = totp(secretBase32).validate({ token: code, timestamp: now, window: 1 })
  return delta === null ? null : Math.floor(now / 1000 / PERIOD) + delta
}

/** The current code for a secret (tests and the enrolment check only). */
export function currentCode(secretBase32: string, now = Date.now()): string {
  return totp(secretBase32).generate({ timestamp: now })
}

export type MfaState = { enrolled: boolean; pending: boolean; recoveryCodesLeft: number }

export async function mfaState(db: Db | Tx, staffUserId: string): Promise<MfaState> {
  const row = await db
    .selectFrom('identity.staff_mfa')
    .select('confirmed_at')
    .where('staff_user_id', '=', staffUserId)
    .executeTakeFirst()
  const left = await db
    .selectFrom('identity.staff_recovery_codes')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('staff_user_id', '=', staffUserId)
    .where('used_at', 'is', null)
    .executeTakeFirstOrThrow()
  return {
    enrolled: Boolean(row?.confirmed_at),
    pending: Boolean(row && !row.confirmed_at),
    recoveryCodesLeft: Number(left.n),
  }
}

/** Starts (or restarts) an unconfirmed enrolment; returns the secret and the otpauth URI to show once. */
export async function startEnrolment(
  tx: Tx,
  key: Secret,
  staffUserId: string,
  label: string,
): Promise<{ secret: string; uri: string }> {
  const secret = new TotpSecret({ size: 20 }).base32
  await tx
    .deleteFrom('identity.staff_mfa')
    .where('staff_user_id', '=', staffUserId)
    .where('confirmed_at', 'is', null)
    .execute()
  await tx
    .insertInto('identity.staff_mfa')
    .values({ staff_user_id: staffUserId, secret_sealed: seal(key, secret) })
    .execute()
  return { secret, uri: totp(secret, label).toString() }
}

/** Checks a TOTP code for an enrolled (or, with `pending`, an enrolling) user and records its step against replay. */
export async function useTotp(
  tx: Tx,
  key: Secret,
  staffUserId: string,
  code: string,
  options: { pending?: boolean } = {},
): Promise<boolean> {
  const row = await tx
    .selectFrom('identity.staff_mfa')
    .select(['secret_sealed', 'confirmed_at', 'last_used_step'])
    .where('staff_user_id', '=', staffUserId)
    .forUpdate()
    .executeTakeFirst()
  if (!row || Boolean(row.confirmed_at) === Boolean(options.pending)) return false
  const step = matchStep(unseal(key, row.secret_sealed), code)
  if (step === null || (row.last_used_step !== null && step <= Number(row.last_used_step))) return false
  await tx
    .updateTable('identity.staff_mfa')
    .set({ last_used_step: String(step), ...(options.pending ? { confirmed_at: sql<Date>`now()` } : {}) })
    .where('staff_user_id', '=', staffUserId)
    .execute()
  return true
}

/** Replaces the user's recovery codes; returns the new codes to show once. */
export async function newRecoveryCodes(tx: Tx, staffUserId: string): Promise<string[]> {
  await tx.deleteFrom('identity.staff_recovery_codes').where('staff_user_id', '=', staffUserId).execute()
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = randomBytes(8).toString('hex')
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`
  })
  await tx
    .insertInto('identity.staff_recovery_codes')
    .values(codes.map((c) => ({ staff_user_id: staffUserId, code_hash: hashToken(c) })))
    .execute()
  return codes
}

/** Uses one recovery code (single use); false when it is unknown or used. */
export async function useRecoveryCode(tx: Tx, staffUserId: string, code: string): Promise<boolean> {
  const normalised = code.trim().toLowerCase()
  if (!/^[0-9a-f]{4}(-[0-9a-f]{4}){3}$/.test(normalised)) return false
  const row = await tx
    .updateTable('identity.staff_recovery_codes')
    .set({ used_at: sql<Date>`now()` })
    .where('staff_user_id', '=', staffUserId)
    .where('code_hash', '=', hashToken(normalised))
    .where('used_at', 'is', null)
    .returning('id')
    .executeTakeFirst()
  return row !== undefined
}

/**
 * Removes the authenticator and the recovery codes (the Owner's reset, offboarding, the operations recovery of an
 * Owner's own; TSK-0154). The caller revokes every session of the person in the same transaction. Returns whether an
 * authenticator (confirmed or still enrolling) and how many unused recovery codes were removed.
 */
export async function removeMfa(tx: Tx, staffUserId: string): Promise<{ factor: boolean; recoveryCodes: number }> {
  const codes = await tx
    .deleteFrom('identity.staff_recovery_codes')
    .where('staff_user_id', '=', staffUserId)
    .returning('used_at')
    .execute()
  const res = await tx.deleteFrom('identity.staff_mfa').where('staff_user_id', '=', staffUserId).executeTakeFirst()
  return { factor: Number(res.numDeletedRows) > 0, recoveryCodes: codes.filter((c) => c.used_at === null).length }
}
