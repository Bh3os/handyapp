// Staff passwords (TSK-0014; OWN-DEC-114, HH-STAFF-01, HH-SEC-02). Adapted from Bh3os/handyhub-app
// (apps/server/src/platform/passwords.ts). Argon2id from a maintained library (@node-rs/argon2) with the OWASP
// Password Storage parameters (m = 19 MiB, t = 2, p = 1); the PHC string keeps its parameters, so an older hash still
// verifies and is upgraded at the next sign-in.
//
// Policy (NIST SP 800-63B-4, PROPOSED values): length-based, no composition rules, no forced periodic change. MFA is
// optional, so every password may be the only factor: at least 15 characters, at most 128, any Unicode (NFKC, never
// truncated). Commonly used values and values made of the service name or the person's email are refused, from
// offline lists only: nothing is sent anywhere to check a password.
import { hash, verify } from '@node-rs/argon2'

/** Algorithm 2 = Argon2id in @node-rs/argon2. */
const ARGON2ID = 2
export const HASH_PARAMS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const
export const PASSWORD_MIN_LENGTH = 15
export const PASSWORD_MAX_LENGTH = 128

export type PasswordProblem = 'too_short' | 'too_long' | 'common' | 'contains_context'

export function normalizePassword(password: string): string {
  return password.normalize('NFKC')
}

const COMMON = new Set([
  'password',
  'passwordpassword',
  'password1234567',
  'password12345678',
  'mypasswordisgood',
  'thisismypassword',
  'iloveyouiloveyou',
  'correcthorsebatterystaple',
  'qwertyuiopasdfgh',
  'qwertyuiopasdfghjkl',
  'qwertyuiop123456',
  'asdfghjklqwertyu',
  '1q2w3e4r5t6y7u8i',
  '1qaz2wsx3edc4rfv',
  'zaq12wsxcde34rfv',
  'abcdefghijklmnop',
  'letmeinletmein',
  'welcomewelcome',
  'changemechangeme',
  'administrator123',
  'adminadminadmin',
  'trustno1trustno1',
  'monkeymonkeymonkey',
  'dragondragondragon',
  'footballfootball',
  'baseballbaseball',
  'sunshinesunshine',
  'princessprincess',
])

const SEQUENCES = [
  '0123456789012345678901234567890',
  'abcdefghijklmnopqrstuvwxyzabcdefghij',
  'qwertyuiopasdfghjklzxcvbnm',
]

function repeated(s: string): boolean {
  for (let n = 1; n <= 4 && n <= s.length / 2; n++) {
    const piece = s.slice(0, n)
    if (piece.repeat(Math.ceil(s.length / n)).slice(0, s.length) === s) return true
  }
  return false
}

function sequential(s: string): boolean {
  const reversed = [...s].reverse().join('')
  return SEQUENCES.some((seq) => seq.includes(s) || seq.includes(reversed))
}

function contextWords(value: string): string[] {
  const lower = value.toLowerCase().trim()
  const local = lower.split('@')[0] ?? ''
  return [lower, local, ...local.split(/[._+-]/), ...lower.split(/\s+/)].filter((w) => w.length >= 4)
}

const strip = (s: string) => s.replace(/[\s\p{P}\p{S}]/gu, '')

/** Checks a new password; `context` holds the person's email and name, which a guesser would try first. */
export function checkPassword(password: string, context: readonly string[] = []): PasswordProblem | null {
  const value = normalizePassword(password)
  const length = [...value].length
  if (length < PASSWORD_MIN_LENGTH) return 'too_short'
  if (length > PASSWORD_MAX_LENGTH) return 'too_long'
  const lower = value.toLowerCase()
  const compact = strip(lower)
  if (COMMON.has(lower) || COMMON.has(compact) || repeated(compact) || sequential(compact)) return 'common'
  const words = ['handyhub', ...context.flatMap(contextWords)].map(strip).filter((w) => w.length >= 4)
  if (words.some((w) => compact.includes(w))) {
    const rest = words.reduce((acc, w) => acc.replaceAll(w, ''), compact)
    if (rest.length < 10) return 'contains_context'
  }
  return null
}

export async function hashPassword(password: string): Promise<string> {
  return hash(normalizePassword(password), { algorithm: ARGON2ID, ...HASH_PARAMS })
}

let dummy: Promise<string> | null = null

/**
 * Verifies a presented password. Without a stored hash (unknown account, or no password yet) the same work is done
 * against a dummy hash, so the answer takes about as long either way and never reveals whether the email exists.
 */
export async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  const value = normalizePassword(password)
  if (!stored) {
    dummy ??= hash('handyhub-dummy-password-for-equal-timing', { algorithm: ARGON2ID, ...HASH_PARAMS })
    await verify(await dummy, value).catch(() => false)
    return false
  }
  try {
    return await verify(stored, value)
  } catch {
    return false
  }
}

/** Whether a stored hash was made with other parameters than today's. */
export function needsRehash(stored: string): boolean {
  const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(stored)
  if (!m) return true
  return (
    Number(m[1]) !== HASH_PARAMS.memoryCost ||
    Number(m[2]) !== HASH_PARAMS.timeCost ||
    Number(m[3]) !== HASH_PARAMS.parallelism
  )
}
