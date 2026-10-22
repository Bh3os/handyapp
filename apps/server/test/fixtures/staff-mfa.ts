// Staff sign-in with the mandatory second factor for tests (TSK-0154; OWN-DEC-202, RULE-SYNTHETIC-DATA). Every staff
// sign-in now ends in a session that waits for the authenticator: this helper finishes it through the real API, as a
// person would. A first sign-in enrols TOTP (the secret the server shows once is kept here, in memory, for this test
// file only); later sign-ins give the current code computed from that secret with the server's own TOTP code
// (currentCode), or one of the recovery codes when every acceptable time step was already used (a code is never
// accepted twice). The sealing key is synthetic and built at runtime, so no literal looks like a key.
import type { FastifyInstance, InjectOptions, LightMyRequestResponse as Response } from 'fastify'
import { currentCode } from '../../src/modules/identity/mfa.js'
import { Secret } from '../../src/providers/types.js'

/** The synthetic MFA_ENCRYPTION_KEY of the tests (at least 32 characters). */
export const TEST_MFA_KEY_TEXT = ['synthetic', 'mfa', 'sealing', 'key', 'for', 'tests', 'only'].join('-')
export const TEST_MFA_KEY = new Secret(TEST_MFA_KEY_TEXT)

type Factor = { secret: string; recoveryCodes: string[]; lastStep: number }
const factors = new Map<string, Factor>()
const PERIOD_MS = 30_000
const stepOf = (ms: number) => Math.floor(ms / PERIOD_MS)

const emailKey = (email: string) => email.trim().toLowerCase()

/** The authenticator this test file enrolled for an email (its secret and the recovery codes not used yet). */
export function enrolledFactor(email: string): Factor | undefined {
  return factors.get(emailKey(email))
}

/** Remembers an authenticator a test enrolled itself (through the API), so later sign-ins can use it. */
export function rememberFactor(email: string, secret: string, recoveryCodes: string[] = []): void {
  factors.set(emailKey(email), { secret, recoveryCodes: [...recoveryCodes], lastStep: stepOf(Date.now()) })
}

/** Forgets an authenticator (after the Owner reset it, or the account was disabled). */
export function forgetFactor(email: string): void {
  factors.delete(emailKey(email))
}

/**
 * The next code the server accepts for this email: the current step's TOTP code, or the next step's (the server
 * allows one step of drift) when the current one was used; otherwise a recovery code; otherwise null (wait a step).
 */
export function nextSecondFactor(email: string): { code: string } | { recoveryCode: string } | null {
  const f = factors.get(emailKey(email))
  if (!f) throw new Error(`no authenticator enrolled in this test file for ${email}`)
  const now = stepOf(Date.now())
  const step = Math.max(now, f.lastStep + 1)
  if (step <= now + 1) {
    f.lastStep = step
    return { code: currentCode(f.secret, step * PERIOD_MS) }
  }
  const recoveryCode = f.recoveryCodes.shift()
  return recoveryCode ? { recoveryCode } : null
}

/**
 * A TOTP code for a test to spend itself (for example at re-authentication), marked as used so it is not offered
 * again; waits for the next 30-second step when every acceptable one was used already.
 */
export async function spendTotp(email: string): Promise<string> {
  const f = factors.get(emailKey(email))
  if (!f) throw new Error(`no authenticator enrolled in this test file for ${email}`)
  for (;;) {
    const now = stepOf(Date.now())
    const step = Math.max(now, f.lastStep + 1)
    if (step <= now + 1) {
      f.lastStep = step
      return currentCode(f.secret, step * PERIOD_MS)
    }
    await waitForNextStep()
  }
}

const waitForNextStep = () => new Promise((resolve) => setTimeout(resolve, PERIOD_MS - (Date.now() % PERIOD_MS) + 50))

const cookieOf = (res: Response) => String(res.headers['set-cookie']).split(';')[0] as string

/**
 * Signs a staff member in completely: `options` is the sign-in request (POST /api/v1/staff/auth/sign-in with its
 * email and password, and any headers such as X-Forwarded-For or Host). A refused sign-in is returned as it is. A
 * sign-in that waits for its second factor is finished (enrolment the first time, the code afterwards) and the
 * answer is a 200 with the session view and the complete session's cookie, as a sign-in answered before MFA was
 * mandatory; the enrolment's recovery codes stay with the helper.
 */
export async function signInWithMfa(server: FastifyInstance, options: InjectOptions): Promise<Response> {
  const res = await server.inject(options)
  if (res.statusCode !== 202) return res
  const email = String((options.payload as { email?: unknown } | undefined)?.email ?? '')
  const step = res.json<{ step: 'enroll' | 'verify' }>().step
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(options.headers ?? {}))
    if (typeof v === 'string' && k.toLowerCase() !== 'cookie') headers[k] = v
  headers['cookie'] = cookieOf(res)
  const post = (path: string, payload?: object) =>
    server.inject({ method: 'POST', url: `/api/v1/staff/auth/mfa/${path}`, headers, ...(payload ? { payload } : {}) })
  if (step === 'enroll') {
    const started = await post('enroll')
    if (started.statusCode !== 200) return started
    const secret = started.json<{ secret: string }>().secret
    const now = Date.now()
    const confirmed = await post('confirm', { code: currentCode(secret, now) })
    if (confirmed.statusCode !== 200) return confirmed
    const body = confirmed.json<{ recoveryCodes: string[]; session: unknown }>()
    factors.set(emailKey(email), { secret, recoveryCodes: body.recoveryCodes, lastStep: stepOf(now) })
    const session = JSON.stringify(body.session)
    return Object.assign(Object.create(Object.getPrototypeOf(confirmed) as object) as Response, confirmed, {
      statusCode: 200,
      body: session,
      payload: session,
      rawPayload: Buffer.from(session),
      json: <T>() => JSON.parse(session) as T,
    })
  }
  for (;;) {
    const next = nextSecondFactor(email)
    if (next) return post('verify', next)
    // Every acceptable step was used and no recovery code is left: wait for the next time step.
    await waitForNextStep()
  }
}
