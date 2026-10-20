// Opaque tokens for sessions and links (TSK-0014; HH-SEC-02): 256 random bits, base64url; only the SHA-256 is stored.
import { createHash, randomBytes } from 'node:crypto'

export const TOKEN = /^[A-Za-z0-9_-]{43}$/

export function newToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Normalised login email: trimmed and lower-cased. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}
