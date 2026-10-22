// The mandatory second factor in the e2e journeys (TSK-0154; OWN-DEC-202, RULE-SYNTHETIC-DATA). Every staff sign-in now
// asks for the authenticator after the password: on the first sign-in of an account the staff app shows the setup key
// once and the account enrols; afterwards it asks for the current code. These helpers do what a person with an
// authenticator app would, through the real screens:
// - enrolment: read the setup key the page shows, type the code computed from it, acknowledge the recovery codes;
// - the challenge: find the account of the browser's pending session, open its sealed secret with the e2e servers'
//   synthetic key (the same AES-256-GCM sealing as apps/server/src/modules/identity/mfa.ts; a drift fails every staff
//   journey) and type the code of a time step the server has not accepted yet (a code is never accepted twice).
// Codes come from otpauth, the TOTP implementation the server uses (RFC 6238: SHA-1, 6 digits, 30 seconds). Secrets and
// codes are never logged; the key is synthetic and built at runtime, never a real key.
import { createDecipheriv, createHash } from 'node:crypto'
import { createDb } from '@handyhub/db'
import { expect, type Page } from '@playwright/test'
import { TOTP } from 'otpauth'
import { E2E_MFA_KEY } from './codes.js'

const PERIOD_MS = 30_000
const stepOf = (ms: number) => Math.floor(ms / PERIOD_MS)

/** The code of one 30-second step for a base32 secret. */
export function totpAt(secret: string, step: number): string {
  return new TOTP({ issuer: 'HandyHub', algorithm: 'SHA1', digits: 6, period: 30, secret }).generate({
    timestamp: step * PERIOD_MS,
  })
}

function unseal(sealed: string): string {
  const [v, iv, tag, data] = sealed.split('.')
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('unknown sealed secret format')
  const key = createHash('sha256').update(E2E_MFA_KEY).digest()
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
  decipher.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8')
}

/** The staff session token of the page's current host (hh_staff over http in ci). */
async function sessionToken(page: Page): Promise<string> {
  const host = new URL(page.url()).hostname
  const cookie = (await page.context().cookies()).find((c) => c.name === 'hh_staff' && c.domain === host)
  if (!cookie) throw new Error('no staff session cookie on this page')
  return cookie.value
}

/** The secret and the last accepted step of the account behind the page's pending session. */
async function pendingFactor(page: Page): Promise<{ secret: string; lastStep: number | null }> {
  const tokenHash = createHash('sha256')
    .update(await sessionToken(page))
    .digest('hex')
  const db = createDb(process.env['E2E_DATABASE_URL'] as string, { max: 1, applicationName: 'e2e-mfa' })
  try {
    const row = await db
      .selectFrom('identity.staff_sessions as s')
      .innerJoin('identity.staff_mfa as m', 'm.staff_user_id', 's.staff_user_id')
      .select(['m.secret_sealed', 'm.last_used_step'])
      .where('s.token_hash', '=', tokenHash)
      .where('s.revoked_at', 'is', null)
      .where('m.confirmed_at', 'is not', null)
      .executeTakeFirstOrThrow()
    return {
      secret: unseal(row.secret_sealed),
      lastStep: row.last_used_step === null ? null : Number(row.last_used_step),
    }
  } finally {
    await db.destroy()
  }
}

/**
 * A code the server accepts now: the current step's, or the next step's (one step of drift is allowed) when the
 * current one was used; otherwise it waits for the next step.
 */
function freshCode(secret: string, lastStep: number | null): string | null {
  const now = stepOf(Date.now())
  const step = Math.max(now, (lastStep ?? -1) + 1)
  return step <= now + 1 ? totpAt(secret, step) : null
}

/**
 * The recovery codes this test process saw at enrolment, by secret (shown once on the screen, as a person would keep
 * them): a sign-in whose acceptable time steps were all used already gives one of them instead of waiting.
 */
const recoveryCodesBySecret = new Map<string, string[]>()

const ENROL_HEADING = 'Set up your authenticator app'
const VERIFY_HEADING = 'Enter your authenticator code'

/** Enrols the authenticator on the enrolment screen (the setup key shown once) and returns its secret. */
export async function enrolAuthenticator(page: Page): Promise<{ secret: string; recoveryCodes: string[] }> {
  await expect(page.getByRole('heading', { level: 1, name: ENROL_HEADING })).toBeVisible()
  const key = page.getByTestId('mfa-secret')
  await expect(key).toHaveText(/^[A-Z2-7]{16,}$/)
  const secret = (await key.textContent()) as string
  await page.getByLabel('Authenticator code').fill(totpAt(secret, stepOf(Date.now())))
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Save your recovery codes' })).toBeVisible()
  const recoveryCodes = (await page.getByTestId('mfa-recovery-codes').locator('code').allTextContents()).map((c) =>
    c.trim(),
  )
  await page.getByRole('button', { name: 'I saved my recovery codes' }).click()
  recoveryCodesBySecret.set(secret, [...recoveryCodes])
  return { secret, recoveryCodes }
}

/** Gives the current authenticator code on the challenge screen. */
export async function enterAuthenticatorCode(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: VERIFY_HEADING })).toBeVisible()
  for (;;) {
    const { secret, lastStep } = await pendingFactor(page)
    const code = freshCode(secret, lastStep)
    if (code) {
      await page.getByLabel('Authenticator code').fill(code)
      await page.getByRole('button', { name: 'Continue' }).click()
      return
    }
    const recovery = recoveryCodesBySecret.get(secret)?.shift()
    if (recovery) {
      await page.getByRole('button', { name: 'Use a recovery code instead' }).click()
      await page.getByLabel('Recovery code').fill(recovery)
      await page.getByRole('button', { name: 'Continue' }).click()
      return
    }
    // Every acceptable step was used already (several sign-ins of one account within a minute): wait for the next.
    await page.waitForTimeout(PERIOD_MS - (Date.now() % PERIOD_MS) + 100)
  }
}

/**
 * After "Sign in" was clicked with a correct password: completes the second factor, enrolling the authenticator when
 * the account has none yet (its first sign-in) or giving the current code otherwise.
 */
export async function passSecondFactor(page: Page): Promise<void> {
  const enrol = page.getByRole('heading', { level: 1, name: ENROL_HEADING })
  const verify = page.getByRole('heading', { level: 1, name: VERIFY_HEADING })
  await expect(enrol.or(verify)).toBeVisible()
  if (await enrol.isVisible()) await enrolAuthenticator(page)
  else await enterAuthenticatorCode(page)
}
