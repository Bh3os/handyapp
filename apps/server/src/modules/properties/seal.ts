// Sealing of access codes (TSK-0045; HH-CRM-03, HH-SEC-04, ENT-AccessInstructionSecret). AES-256-GCM under
// ACCESS_CODE_ENCRYPTION_KEY with a fresh 96-bit IV per value, bound to the code's row ID as additional authenticated
// data: a sealed value copied onto another row (or another property) does not open. The format is the MFA store's
// `v1.<iv>.<tag>.<ciphertext>` in base64url (modules/identity/mfa.ts). Without the key the store is NOT CONFIGURED:
// nothing is sealed or opened, and no stand-in key is ever made up.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { Secret } from '../../providers/types.js'

const VERSION = 'v1'

function keyOf(key: Secret): Buffer {
  // A separate derivation label, so even a key reused elsewhere would not produce the same cipher key.
  return createHash('sha256').update('handyhub-access-code|').update(key.reveal()).digest()
}

const aad = (secretId: string) => Buffer.from(`access_instruction_secret|${secretId}`, 'utf8')

/** Seals one access code for the row `secretId`. */
export function sealAccessCode(key: Secret, secretId: string, plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyOf(key), iv)
  cipher.setAAD(aad(secretId))
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [
    VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    data.toString('base64url'),
  ].join('.')
}

/** Opens a sealed access code of the row `secretId`; throws when the key, the row or the value does not match. */
export function openAccessCode(key: Secret, secretId: string, sealed: string): string {
  const [v, iv, tag, data] = sealed.split('.')
  if (v !== VERSION || !iv || !tag || !data) throw new Error('unknown sealed access code format')
  const decipher = createDecipheriv('aes-256-gcm', keyOf(key), Buffer.from(iv, 'base64url'))
  decipher.setAAD(aad(secretId))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}
