// Staff session lifecycle and optional MFA routes (TSK-0015; HH-SEC-02, HH-STAFF-01, HH-STAFF-02, OWN-DEC-114).
// - MFA is optional: TOTP enrolment needs fresh authentication, a confirming code, and shows the recovery codes once.
//   Once enrolled, a password alone starts only a pending session; the second factor (or a recovery code) completes
//   it with a new session token. Changing MFA ends the user's other sessions.
// - "Sign out everywhere" revokes every session of the signed-in user; the Owner can revoke every session of a staff
//   member at once (ROLE-MATRIX staff.revoke_sessions: never delayed, audited).
// Without MFA_ENCRYPTION_KEY, MFA is NOT CONFIGURED: enrolment is refused and nothing else changes.
import { ApiError } from '../../api/errors.js'
import { AUTHENTICATION, type JsonSchema, type RouteDef } from '../../api/route.js'
import type { IdentityDeps } from './index.js'
import { freshView } from './views.js'
import {
  mfaState,
  newRecoveryCodes,
  removeMfa,
  RECOVERY_CODE_COUNT,
  startEnrolment,
  useRecoveryCode,
  useTotp,
} from './mfa.js'
import { check, hit, RATE_RULES } from './rate-limit.js'
import { clearedSessionCookie, revokeAllSessions, revokeSession, rotateSession, sessionCookie } from './sessions.js'

const FRESH_MINUTES = 5

const none = { type: 'null' } as const

export function securityRoutes(deps: IdentityDeps, shared: { test: string; sessionView: JsonSchema }): RouteDef[] {
  const base = {
    expectedVersion: 'none' as const,
    pagination: false,
    test: 'test/integration/staff-security.test.ts',
  }
  const requireKey = () => {
    if (!deps.mfaKey) throw new ApiError('NOT_CONFIGURED')
    return deps.mfaKey
  }
  void shared.test
  return [
    {
      ...base,
      method: 'GET',
      path: '/staff/auth/mfa',
      operationId: 'staffMfaStatus',
      summary: 'MFA status of the signed-in staff member',
      description: 'Whether an authenticator is enrolled and how many recovery codes are left. Never a secret.',
      actors: ['staff'],
      permission: AUTHENTICATION,
      kind: 'read',
      idempotency: 'none',
      rateLimit: 'none',
      audit: 'none',
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['enrolled', 'pending', 'recoveryCodesLeft', 'available'],
            properties: {
              enrolled: { type: 'boolean' },
              pending: { type: 'boolean' },
              recoveryCodesLeft: { type: 'integer' },
              available: { type: 'boolean' },
            },
          },
        },
      },
      handler: async ({ req, db }) => {
        if (!req.staffSession) throw new ApiError('UNAUTHENTICATED')
        return { body: { ...(await mfaState(db, req.staffSession.staffUserId)), available: deps.mfaKey !== null } }
      },
    },
    {
      ...base,
      method: 'POST',
      path: '/staff/auth/mfa/enroll',
      operationId: 'staffMfaEnroll',
      summary: 'Start enrolling an authenticator app',
      description:
        'Needs fresh authentication. Returns the TOTP secret and otpauth URI once, for the authenticator app; enrolment completes only with a confirming code.',
      actors: ['staff'],
      permission: AUTHENTICATION,
      kind: 'write',
      idempotency: 'none',
      rateLimit: 'none',
      freshAuthMinutes: FRESH_MINUTES,
      audit: 'staff.mfa_enroll_start',
      schema: {
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['secret', 'otpauthUri'],
            properties: { secret: { type: 'string' }, otpauthUri: { type: 'string' } },
          },
        },
      },
      handler: async ({ req, tx, audit }) => {
        const session = req.staffSession
        if (!session || !tx) throw new ApiError('UNAUTHENTICATED')
        const key = requireKey()
        if ((await mfaState(tx, session.staffUserId)).enrolled) throw new ApiError('CONFLICT')
        const started = await startEnrolment(tx, key, session.staffUserId, session.email)
        await audit({ target: { type: 'staff_user', id: session.staffUserId } })
        return { body: { secret: started.secret, otpauthUri: started.uri } }
      },
    },
    {
      ...base,
      method: 'POST',
      path: '/staff/auth/mfa/confirm',
      operationId: 'staffMfaConfirm',
      summary: 'Confirm the authenticator and get recovery codes',
      description: `Checks a code from the new authenticator, enables MFA, ends the user's other sessions, rotates this one and returns ${RECOVERY_CODE_COUNT} single-use recovery codes once.`,
      actors: ['staff'],
      permission: AUTHENTICATION,
      kind: 'write',
      idempotency: 'none',
      rateLimit: { ...RATE_RULES.signInAccount, enforcedBy: 'handler' },
      audit: 'staff.mfa_enable',
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['code'],
          properties: { code: { type: 'string', minLength: 6, maxLength: 6 } },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['recoveryCodes', 'session'],
            properties: { recoveryCodes: { type: 'array', items: { type: 'string' } }, session: shared.sessionView },
          },
        },
      },
      handler: async ({ req, db, tx, audit, auditAlways }) => {
        const session = req.staffSession
        if (!session || !tx) throw new ApiError('UNAUTHENTICATED')
        const key = requireKey()
        await check(db, RATE_RULES.signInAccount, `mfa:${session.email}`)
        if (!(await useTotp(tx, key, session.staffUserId, (req.body as { code: string }).code, { pending: true }))) {
          await hit(db, RATE_RULES.signInAccount, `mfa:${session.email}`)
          await auditAlways({
            result: 'denied',
            reason: 'invalid_code',
            target: { type: 'staff_user', id: session.staffUserId },
          })
          throw new ApiError('INVALID_CREDENTIALS')
        }
        const recoveryCodes = await newRecoveryCodes(tx, session.staffUserId)
        await revokeAllSessions(tx, session.staffUserId, 'mfa_changed', session.sessionId)
        const rotated = await rotateSession(tx, session.sessionId, { state: 'complete', authenticated: true })
        if (!rotated) throw new ApiError('UNAUTHENTICATED')
        await audit({ target: { type: 'staff_user', id: session.staffUserId } })
        return {
          body: { recoveryCodes, session: await freshView(tx, session.staffUserId, rotated.token) },
          headers: { 'set-cookie': sessionCookie(rotated.token, deps.cookies) },
        }
      },
    },
    {
      ...base,
      method: 'POST',
      path: '/staff/auth/mfa/verify',
      operationId: 'staffMfaVerify',
      summary: 'Complete sign-in with the authenticator or a recovery code',
      description:
        'For a session waiting for its second factor: a valid TOTP code or an unused recovery code completes it with a new session token. Rate limited; failures are audited.',
      actors: ['guest', 'staff', 'customer'],
      permission: AUTHENTICATION,
      kind: 'write',
      idempotency: 'none',
      rateLimit: { ...RATE_RULES.signInAccount, enforcedBy: 'handler' },
      audit: 'staff.mfa_verify',
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            code: { type: 'string', minLength: 6, maxLength: 6 },
            recoveryCode: { type: 'string', minLength: 1, maxLength: 40 },
          },
          anyOf: [{ required: ['code'] }, { required: ['recoveryCode'] }],
        },
        response: { 200: shared.sessionView },
      },
      handler: async ({ req, db, tx, audit, auditAlways }) => {
        const pending = req.staffPendingSession
        if (!pending || !tx) throw new ApiError('UNAUTHENTICATED')
        const key = requireKey()
        const limitKey = `mfa:${pending.email}`
        await check(db, RATE_RULES.signInAccount, limitKey)
        const body = req.body as { code?: string; recoveryCode?: string }
        const ok =
          body.code !== undefined
            ? await useTotp(tx, key, pending.staffUserId, body.code)
            : await useRecoveryCode(tx, pending.staffUserId, body.recoveryCode ?? '')
        if (!ok) {
          await hit(db, RATE_RULES.signInAccount, limitKey)
          await auditAlways({
            result: 'denied',
            reason: 'invalid_code',
            target: { type: 'staff_user', id: pending.staffUserId },
          })
          throw new ApiError('INVALID_CREDENTIALS')
        }
        const rotated = await rotateSession(tx, pending.sessionId, { state: 'complete', authenticated: true })
        if (!rotated) throw new ApiError('UNAUTHENTICATED')
        await audit({
          target: { type: 'staff_user', id: pending.staffUserId },
          summary: { method: body.code !== undefined ? 'totp' : 'recovery_code' },
        })
        return {
          body: await freshView(tx, pending.staffUserId, rotated.token),
          headers: { 'set-cookie': sessionCookie(rotated.token, deps.cookies) },
        }
      },
    },
    {
      ...base,
      method: 'POST',
      path: '/staff/auth/mfa/disable',
      operationId: 'staffMfaDisable',
      summary: 'Remove the authenticator',
      description:
        "Needs fresh authentication. Removes the authenticator and the recovery codes and ends the user's other sessions.",
      actors: ['staff'],
      permission: AUTHENTICATION,
      kind: 'write',
      idempotency: 'none',
      rateLimit: 'none',
      freshAuthMinutes: FRESH_MINUTES,
      audit: 'staff.mfa_disable',
      schema: { response: { 204: none } },
      handler: async ({ req, tx, audit }) => {
        const session = req.staffSession
        if (!session || !tx) throw new ApiError('UNAUTHENTICATED')
        if (!(await removeMfa(tx, session.staffUserId))) throw new ApiError('NOT_FOUND')
        await revokeAllSessions(tx, session.staffUserId, 'mfa_changed', session.sessionId)
        await audit({ target: { type: 'staff_user', id: session.staffUserId } })
        return { status: 204, body: null }
      },
    },
    {
      ...base,
      method: 'POST',
      path: '/staff/auth/sessions/revoke-all',
      operationId: 'staffSignOutEverywhere',
      summary: 'Sign out everywhere',
      description: 'Revokes every session of the signed-in staff member, this one included, and clears the cookie.',
      actors: ['staff'],
      permission: AUTHENTICATION,
      kind: 'write',
      idempotency: 'none',
      rateLimit: 'none',
      audit: 'staff.sessions_revoke_all',
      schema: { response: { 204: none } },
      handler: async ({ req, tx, audit }) => {
        const session = req.staffSession
        if (!session || !tx) throw new ApiError('UNAUTHENTICATED')
        const others = await revokeAllSessions(tx, session.staffUserId, 'revoked_all', session.sessionId)
        await revokeSession(tx, session.sessionId, 'revoked_all')
        await audit({
          target: { type: 'staff_user', id: session.staffUserId },
          summary: { sessionsRevoked: others + 1 },
        })
        return { status: 204, body: null, headers: { 'set-cookie': clearedSessionCookie(deps.cookies) } }
      },
    },
    {
      ...base,
      method: 'POST',
      path: '/staff/:id/sessions/revoke',
      operationId: 'revokeStaffSessions',
      summary: 'Revoke every session of a staff member',
      description:
        'Owner only (ROLE-MATRIX staff.revoke_sessions; protective, never delayed by a fresh sign-in or a reason). Every session of the staff member ends at once; their history is kept.',
      actors: ['staff'],
      permission: 'staff.revoke_sessions',
      kind: 'write',
      idempotency: 'none',
      rateLimit: 'none',
      audit: 'staff.revoke_sessions',
      schema: {
        params: {
          type: 'object',
          additionalProperties: false,
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
        response: {
          200: {
            type: 'object',
            additionalProperties: false,
            required: ['sessionsRevoked'],
            properties: { sessionsRevoked: { type: 'integer' } },
          },
        },
      },
      resource: async ({ req, db }) => {
        const { id } = req.params as { id: string }
        const user = await db.selectFrom('identity.staff_users').select('id').where('id', '=', id).executeTakeFirst()
        return user ? { subjectStaffId: id } : null
      },
      handler: async ({ req, tx, audit }) => {
        const { id } = req.params as { id: string }
        if (!tx) throw new ApiError('UNAUTHENTICATED')
        const n = await revokeAllSessions(tx, id, 'revoked_by_owner')
        await audit({ target: { type: 'staff_user', id }, summary: { sessionsRevoked: n } })
        return { body: { sessionsRevoked: n } }
      },
    },
  ]
}
