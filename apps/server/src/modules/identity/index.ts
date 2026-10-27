// Identity module (HH-ARC-02): the staff sign-in API (TSK-0014; HH-STAFF-01, HH-SEC-02, OWN-DEC-114) and, re-exported
// below, customer one-time codes and customer sessions (TSK-0016), which the features that use them call.
// Staff sign-in API (TSK-0014; HH-STAFF-01, HH-SEC-02, OWN-DEC-114). Every write goes through the route contract with
// audit. Errors are generic: a wrong password, an unknown email and an account that cannot sign in all answer
// INVALID_CREDENTIALS, and "Forgot password?" always answers the same, so no response reveals whether an email exists.
import { STAFF_ROLES } from '@handyhub/policy'
import type { FastifyRequest } from 'fastify'
import { clientAddress } from '../../access-gate.js'
import { ApiError, type FieldError } from '../../api/errors.js'
import { AUTHENTICATION, type ApiModule, type RouteDef } from '../../api/route.js'
import { accountForSignIn, createStaffUser, DuplicateStaffEmailError, setPasswordHash } from './accounts.js'
import { consumeLink, issueLink } from './links.js'
import { checkPassword, hashPassword, needsRehash, PASSWORD_MIN_LENGTH, verifyPassword } from './passwords.js'
import { hit, networkOf, RATE_RULES, release } from './rate-limit.js'
import type { Secret } from '../../providers/types.js'
import { mfaNotConfigured, MFA_NOT_CONFIGURED_LOG, mfaState, useTotp } from './mfa.js'
import { securityRoutes } from './security.js'
import { freshView, mfaPendingView, sessionView, viewOf } from './views.js'
import {
  clearedSessionCookie as clearedStaffCookie,
  createSession,
  rotateSession,
  revokeSession,
  sessionCookie as staffSessionCookie,
  type CookieOptions,
} from './sessions.js'
import { normalizeEmail } from './tokens.js'

const TEST = 'test/integration/staff-auth.test.ts'

const emailField = { type: 'string', minLength: 3, maxLength: 254 } as const
/** The policy is checked by the server after validation; the schema only bounds the input. */
const passwordField = { type: 'string', minLength: 1, maxLength: 1024 } as const

function passwordError(problem: ReturnType<typeof checkPassword>): FieldError[] {
  const code = problem === 'too_short' ? 'minLength' : problem === 'too_long' ? 'maxLength' : 'passwordCommon'
  return [{ field: 'body.password', code, message: '' }]
}

export type IdentityDeps = {
  cookies: CookieOptions
  /** Seals TOTP secrets; null while MFA is NOT CONFIGURED (MFA_ENCRYPTION_KEY unset). */
  mfaKey: Secret | null
  /** Proxies that append to X-Forwarded-For (TRUST_PROXY_HOPS), as the API rate limiter and the access gate read it. */
  trustProxyHops: number
}

export function identityModule(deps: IdentityDeps): ApiModule {
  // The network a per-network limit counts: the client the trusted proxies saw, never the proxy itself (behind
  // Render every request would otherwise share one address and one limit). Without trusted hops, the socket peer.
  const clientNetwork = (req: FastifyRequest) => networkOf(clientAddress(req.raw, deps.trustProxyHops))
  const base = {
    expectedVersion: 'none' as const,
    pagination: false,
    test: TEST,
  }
  const routes: RouteDef[] = [
    {
      ...base,
      method: 'POST',
      path: '/staff/auth/sign-in',
      operationId: 'staffSignIn',
      summary: 'Staff sign-in with email and password',
      description:
        'Verifies the password (argon2id, equal timing for unknown emails), starts a new session (new ID) and sets the host-only session cookie. The password never completes a sign-in (MFA is mandatory for every staff role, OWN-DEC-202): the session waits for the authenticator code (step verify) or, for an account without an authenticator, for its enrolment (step enroll), and reaches nothing else. Refused for everyone while MFA_ENCRYPTION_KEY is NOT CONFIGURED (NOT_CONFIGURED, field mfa, code MFA_NOT_CONFIGURED). Rate limited per account and per network. Sign-in and failed sign-in are audited.',
      actors: ['guest', 'staff', 'customer'],
      permission: AUTHENTICATION,
      beforeSecondFactor: true,
      kind: 'write',
      idempotency: 'none',
      rateLimit: { ...RATE_RULES.signInAccount, enforcedBy: 'handler' },
      audit: 'staff.sign_in',
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['email', 'password'],
          properties: { email: emailField, password: passwordField },
        },
        response: { 202: mfaPendingView },
      },
      handler: async ({ req, db, tx, audit, auditAlways }) => {
        // TSK-0154 (OWN-DEC-202): MFA is mandatory, so without the key that seals authenticators nobody can complete
        // a sign-in: refused for everyone (fail closed), with an operator error naming the variable (never a value).
        if (!deps.mfaKey) {
          req.log.error({ variable: 'MFA_ENCRYPTION_KEY' }, MFA_NOT_CONFIGURED_LOG)
          throw mfaNotConfigured()
        }
        const { email, password } = req.body as { email: string; password: string }
        // Failures are counted; a network or account over its limit is refused even with the right password. Each
        // attempt is counted before the password is checked, and a successful one is given back (TSK-0109 AUTH-1).
        const network = clientNetwork(req)
        const key = normalizeEmail(email)
        const attemptAt = new Date()
        await hit(db, RATE_RULES.signInNetwork, network, attemptAt)
        await hit(db, RATE_RULES.signInAccount, key, attemptAt)
        const account = await accountForSignIn(db, email)
        const verified = await verifyPassword(account?.passwordHash ?? null, password)
        if (!account || !verified || account.status !== 'active') {
          await auditAlways({
            result: 'denied',
            reason: 'invalid_credentials',
            target: account ? { type: 'staff_user', id: account.id } : { type: 'staff_sign_in' },
          })
          throw new ApiError('INVALID_CREDENTIALS')
        }
        await release(db, RATE_RULES.signInNetwork, network, attemptAt)
        await release(db, RATE_RULES.signInAccount, key, attemptAt)
        const trx = tx as NonNullable<typeof tx>
        if (account.passwordHash && needsRehash(account.passwordHash))
          await trx
            .updateTable('identity.auth_identities')
            .set({ password_hash: await hashPassword(password) })
            .where('staff_user_id', '=', account.id)
            .execute()
        // The password alone never completes a sign-in (TSK-0154, OWN-DEC-202): an enrolled account gets a pending
        // session for its authenticator code (TSK-0015); an account without one (a new or migrated account, or one
        // whose authenticator the Owner reset) gets an enrolment session, which reaches nothing but enrolment.
        const enrolled = (await mfaState(trx, account.id)).enrolled
        const step = enrolled ? ('verify' as const) : ('enroll' as const)
        const session = await createSession(trx, account.id, enrolled ? 'mfa_pending' : 'mfa_enrollment')
        await audit({ target: { type: 'staff_user', id: account.id }, summary: { mfa: step } })
        const cookie = { 'set-cookie': staffSessionCookie(session.token, deps.cookies) }
        return { status: 202, body: { mfaRequired: true, step }, headers: cookie }
      },
    },
    {
      ...base,
      method: 'POST',
      path: '/staff/auth/sign-out',
      operationId: 'staffSignOut',
      summary: 'Sign out',
      description:
        'Revokes the current session on the server and clears the cookie. Always available to a signed-in user, also before the second factor (TSK-0154).',
      actors: ['guest', 'staff'],
      permission: AUTHENTICATION,
      beforeSecondFactor: true,
      kind: 'write',
      idempotency: 'none',
      rateLimit: 'none',
      audit: 'staff.sign_out',
      schema: { response: { 204: { type: 'null' } } },
      handler: async ({ req, tx, audit }) => {
        const session = req.staffSession ?? req.staffPendingSession
        if (!session || !tx) throw new ApiError('UNAUTHENTICATED')
        await revokeSession(tx, session.sessionId, 'sign_out')
        await audit({ target: { type: 'staff_user', id: session.staffUserId } })
        return { status: 204, body: null, headers: { 'set-cookie': clearedStaffCookie(deps.cookies) } }
      },
    },
    {
      ...base,
      method: 'GET',
      path: '/staff/auth/session',
      operationId: 'staffSession',
      summary: 'The signed-in staff member',
      description:
        'The current session: name, email, locale, roles and the navigation. Never a hash. A session before its second factor gets UNAUTHENTICATED (field session, code MFA_REQUIRED).',
      actors: ['staff'],
      permission: AUTHENTICATION,
      kind: 'read',
      idempotency: 'none',
      rateLimit: 'none',
      audit: 'none',
      schema: { response: { 200: sessionView } },
      handler: async ({ req }) => {
        if (!req.staffSession) throw new ApiError('UNAUTHENTICATED')
        return { body: viewOf(req.staffSession) }
      },
    },
    {
      ...base,
      test: 'test/integration/staff-shell.test.ts',
      method: 'PUT',
      path: '/staff/auth/session/locale',
      operationId: 'staffSetLocale',
      summary: 'Choose the staff language (English or Spanish)',
      description:
        "Stores the signed-in staff member's own locale on their staff identity, so it follows them across devices and sessions (HH-OPS-04, ENT-StaffUser: each user edits only their own locale). It changes staff screens and staff notifications only, never customer messages or documents (HH-LANG-03).",
      actors: ['staff'],
      permission: AUTHENTICATION,
      kind: 'write',
      idempotency: 'none',
      rateLimit: 'none',
      audit: 'staff.locale_change',
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['locale'],
          properties: { locale: { type: 'string', enum: ['en', 'es'] } },
        },
        response: { 200: sessionView },
      },
      handler: async ({ req, tx, audit }) => {
        const session = req.staffSession
        if (!session || !tx) throw new ApiError('UNAUTHENTICATED')
        const { locale } = req.body as { locale: 'en' | 'es' }
        if (locale !== session.locale)
          await tx
            .updateTable('identity.staff_users')
            .set((eb) => ({ locale, version: eb('version', '+', 1) }))
            .where('id', '=', session.staffUserId)
            .execute()
        await audit({
          target: { type: 'staff_user', id: session.staffUserId },
          summary: { from: session.locale, to: locale },
        })
        return { body: viewOf({ ...session, locale }) }
      },
    },
    {
      ...base,
      method: 'POST',
      path: '/staff/auth/reauth',
      operationId: 'staffReauthenticate',
      summary: 'Enter the password again for a sensitive action',
      description:
        'Fresh authentication (HH-STAFF-03): a correct password, or the authenticator code when MFA is enrolled, rotates the session (new token and CSRF token) and marks it freshly authenticated. Rate limited; failures are audited.',
      actors: ['staff'],
      permission: AUTHENTICATION,
      kind: 'write',
      idempotency: 'none',
      rateLimit: { ...RATE_RULES.signInAccount, enforcedBy: 'handler' },
      audit: 'staff.reauth',
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: { password: passwordField, code: { type: 'string', minLength: 6, maxLength: 6 } },
          anyOf: [{ required: ['password'] }, { required: ['code'] }],
        },
        response: { 200: sessionView },
      },
      handler: async ({ req, db, tx, audit, auditAlways }) => {
        const session = req.staffSession
        if (!session || !tx) throw new ApiError('UNAUTHENTICATED')
        const attemptAt = new Date()
        await hit(db, RATE_RULES.signInAccount, session.email, attemptAt)
        const body = req.body as { password?: string; code?: string }
        const account = await accountForSignIn(db, session.email)
        const ok =
          body.code !== undefined
            ? deps.mfaKey !== null && (await useTotp(tx, deps.mfaKey, session.staffUserId, body.code))
            : await verifyPassword(account?.passwordHash ?? null, body.password ?? '')
        if (!ok) {
          await auditAlways({
            result: 'denied',
            reason: 'invalid_credentials',
            target: { type: 'staff_user', id: session.staffUserId },
          })
          throw new ApiError('INVALID_CREDENTIALS')
        }
        await release(db, RATE_RULES.signInAccount, session.email, attemptAt)
        const rotated = await rotateSession(tx, session.sessionId, { state: 'complete', authenticated: true })
        if (!rotated) throw new ApiError('UNAUTHENTICATED')
        await audit({
          target: { type: 'staff_user', id: session.staffUserId },
          summary: { method: body.code !== undefined ? 'totp' : 'password' },
        })
        return {
          body: await freshView(tx, session.staffUserId, rotated.token),
          headers: { 'set-cookie': staffSessionCookie(rotated.token, deps.cookies) },
        }
      },
    },
    {
      ...base,
      method: 'POST',
      path: '/staff/auth/password/forgot',
      operationId: 'staffForgotPassword',
      summary: 'Forgot password: email a reset link',
      description:
        'Always answers 202 the same way. When the email belongs to an account that is not disabled, a single-use reset link (valid per session.timings) is emailed through the outbox. Rate limited per email and per network.',
      actors: ['guest', 'staff', 'customer'],
      permission: AUTHENTICATION,
      beforeSecondFactor: true,
      kind: 'write',
      idempotency: 'none',
      rateLimit: { ...RATE_RULES.resetAccount, enforcedBy: 'handler' },
      audit: 'staff.password_reset_request',
      schema: {
        body: { type: 'object', additionalProperties: false, required: ['email'], properties: { email: emailField } },
        response: {
          202: {
            type: 'object',
            additionalProperties: false,
            required: ['accepted'],
            properties: { accepted: { type: 'boolean' } },
          },
        },
      },
      handler: async ({ req, db, tx, audit }) => {
        const email = normalizeEmail((req.body as { email: string }).email)
        await hit(db, RATE_RULES.resetNetwork, clientNetwork(req))
        await hit(db, RATE_RULES.resetAccount, email)
        const trx = tx as NonNullable<typeof tx>
        const account = await accountForSignIn(trx, email)
        if (account && account.status !== 'disabled') {
          await issueLink(trx, { staffUserId: account.id, purpose: 'reset', issuedBy: 'self' })
          await audit({ target: { type: 'staff_user', id: account.id } })
        } else {
          await audit({ target: { type: 'staff_password_reset' }, result: 'denied', reason: 'no_eligible_account' })
        }
        return { status: 202, body: { accepted: true } }
      },
    },
    {
      ...base,
      method: 'POST',
      path: '/staff/auth/password/set',
      operationId: 'staffSetPassword',
      summary: 'Set a password with an invite or reset link',
      description:
        'Consumes the single-use link, checks the length-based policy, stores the argon2id hash, activates an invited account and revokes every session: the person then signs in again, with the authenticator (a reset never removes it) or, without one, by enrolling it first (TSK-0154).',
      actors: ['guest', 'staff', 'customer'],
      permission: AUTHENTICATION,
      beforeSecondFactor: true,
      kind: 'write',
      idempotency: 'none',
      rateLimit: { ...RATE_RULES.linkNetwork, enforcedBy: 'handler' },
      audit: 'staff.password_set',
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['token', 'password'],
          properties: { token: { type: 'string', minLength: 1, maxLength: 100 }, password: passwordField },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['passwordSet'],
            properties: { passwordSet: { type: 'boolean' } },
          },
        },
      },
      handler: async ({ req, db, tx, audit, auditAlways }) => {
        const { token, password } = req.body as { token: string; password: string }
        await hit(db, RATE_RULES.linkNetwork, clientNetwork(req))
        const trx = tx as NonNullable<typeof tx>
        const link = await consumeLink(trx, token)
        const user = link
          ? await trx
              .selectFrom('identity.staff_users')
              .select(['email', 'display_name', 'status'])
              .where('id', '=', link.staffUserId)
              .executeTakeFirst()
          : undefined
        if (!link || !user || user.status === 'disabled') {
          await auditAlways({ result: 'denied', reason: 'link_invalid', target: { type: 'staff_link' } })
          throw new ApiError('LINK_INVALID')
        }
        const problem = checkPassword(password, [user.email, user.display_name ?? ''])
        if (problem) throw new ApiError('VALIDATION_FAILED', { fieldErrors: passwordError(problem) })
        const { revoked } = await setPasswordHash(trx, link.staffUserId, await hashPassword(password))
        await audit({
          target: { type: 'staff_user', id: link.staffUserId },
          summary: { purpose: link.purpose, sessionsRevoked: revoked },
        })
        return { body: { passwordSet: true } }
      },
    },
    {
      ...base,
      method: 'POST',
      path: '/staff/invitations',
      operationId: 'inviteStaff',
      summary: 'Invite a staff member with a role',
      description:
        'Owner only, with fresh authentication (ROLE-MATRIX staff.invite). Creates an invited account with no password and its role grant, and emails a single-use invite link through the outbox. There is no public registration.',
      actors: ['staff'],
      permission: 'staff.invite',
      kind: 'write',
      idempotency: 'required',
      rateLimit: 'none',
      audit: 'staff.invite',
      resource: async () => ({ subjectStaffId: 'new-account' }),
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['email', 'displayName', 'role', 'reason'],
          properties: {
            email: emailField,
            // ROLE-MATRIX: inviting and granting roles need a written reason and fresh authentication.
            reason: { type: 'string', minLength: 1, maxLength: 2000 },
            displayName: { type: 'string', minLength: 1, maxLength: 120 },
            role: { type: 'string', enum: [...STAFF_ROLES] },
            locale: { type: 'string', enum: ['en', 'es'] },
          },
        },
        response: {
          201: {
            type: 'object',
            additionalProperties: false,
            required: ['staffUserId', 'status'],
            properties: { staffUserId: { type: 'string' }, status: { type: 'string', enum: ['invited'] } },
          },
        },
      },
      handler: async ({ req, tx, actor, audit }) => {
        const body = req.body as {
          email: string
          displayName: string
          role: (typeof STAFF_ROLES)[number]
          locale?: 'en' | 'es'
          reason: string
        }
        const trx = tx as NonNullable<typeof tx>
        const issuer = actor.kind === 'staff' ? `staff:${actor.userId}` : 'unknown'
        let user: { id: string }
        try {
          user = await createStaffUser(trx, {
            email: body.email,
            displayName: body.displayName,
            locale: body.locale ?? 'en',
            role: body.role,
            issuedBy: issuer,
            reason: body.reason,
          })
        } catch (err) {
          if (err instanceof DuplicateStaffEmailError) throw new ApiError('CONFLICT')
          throw err
        }
        await issueLink(trx, { staffUserId: user.id, purpose: 'invite', issuedBy: issuer })
        await audit({ target: { type: 'staff_user', id: user.id }, summary: { role: body.role }, reason: body.reason })
        return { status: 201, body: { staffUserId: user.id, status: 'invited' } }
      },
    },
  ]
  routes.push(...securityRoutes(deps, { test: TEST, sessionView }))
  return { name: 'identity', routes }
}

export { PASSWORD_MIN_LENGTH }

// Customer one-time codes and customer sessions (TSK-0016).
export {
  CODE_ISSUED_EVENT,
  CODE_PURPOSES,
  issueCode,
  maskForCustomer,
  normaliseDestination,
  verifyCode,
  type CodeChannel,
  type CodePurpose,
  type IssueInput,
  type IssueResult,
  type VerifyInput,
  type VerifyResult,
} from './codes.js'
export {
  CODE_MESSAGE_BODY,
  CODE_MESSAGE_KEY,
  CODE_TEMPLATES,
  codeDeliveryAutomation,
  CodeDeliveryError,
  type CodeDeliveryDeps,
} from './delivery.js'
export { MIN_CODE_KEY_LENGTH, readCodeKey, type CodeKeySettings } from './keys.js'
export {
  clearedSessionCookie,
  CUSTOMER_COOKIE,
  customerActor,
  customerSessionResolver,
  readSessionToken,
  refreshVerification,
  resolveCustomerSession,
  revokeAccountSessions,
  revokeCustomerSession,
  revokeGrantSessions,
  sessionCookie,
  SessionConfigError,
  setSessionCookie,
  startCustomerSession,
  type CustomerSession,
  type SessionEndReason,
  type StartedSession,
  type StartSessionInput,
} from './customer-sessions.js'
export { organizationAccessOf, type OrganizationProjectAccess } from './organization-access.js'
