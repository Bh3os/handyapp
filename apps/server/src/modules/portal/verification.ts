// Fresh verification inside a customer session (TSK-0057; HH-ID-07, HH-ID-06, HH-EST-07, OWN-DEC-103, OWN-DEC-96,
// RULE-SERVER-AUTHZ).
//   GET  /customer/session/verification         whether the session is fresh enough for an approval; where a code can go
//   POST /customer/session/verification/codes   a new one-time code to the session's own verified contact
//   POST /customer/session/verification         the entered code: the session's verification is fresh again
// - Approving an estimate (and later a change order or an access-contact change) needs a verification newer than
//   verification.limits.freshVerificationMinutes (PROPOSED 15). When it is older, the page asks for a new code here
//   without leaving the estimate, so the selected options are kept (on the page, and on the server: approval.ts).
// - The code goes only to the session's own verified contact: a guest-link session's grant contact (its email; its
//   phone by text only with that request's own current SMS opt-in, HH-INT-22), or an account session's own verified
//   sign-in values (the phone while its SMS permission is current). Never to a value the caller types.
// - The codes are TSK-0016's one-time codes (hashed, 10 minutes, the configured attempt, resend and per-address
//   limits), delivered as the automatic message contact.verification_code in the owner's wording (OWN-DEC-150). Their
//   subject is the session's grant or account with a "reverify" mark, so such a code never opens a link or signs in.
// - A correct code restarts the session's fresh window (refreshVerification); nothing else changes: no new session,
//   no other project, no contact change. A wrong code is the same neutral answer as everywhere, and its attempt is
//   counted and kept. Codes, contact values and tokens never reach the audit log.
import type { Db, Tx } from '@handyhub/db'
import { clientAddress, networkKey } from '../../access-gate.js'
import { ApiError } from '../../api/errors.js'
import { AUTHENTICATION, type ApiContext, type RouteDef } from '../../api/route.js'
import { currentContext } from '../../platform/request-context.js'
import { grantContactTarget } from '../access/landing.js'
import {
  issueCode,
  maskForCustomer,
  readSessionToken,
  refreshVerification,
  resolveCustomerSession,
  verifyCode,
  type CodeKeySettings,
  type CodePurpose,
  type CustomerSession,
} from '../identity/index.js'
import { currentConsent } from '../notifications/index.js'
import { ACCOUNT_CODE_SENT, SESSION_VERIFICATION } from '../records/index.js'

export type SessionVerificationDeps = {
  /** The key behind one-time codes (TSK-0016); NOT CONFIGURED: no code is sent. */
  codeKey: CodeKeySettings
  /** Proxies in front of the service (TRUST_PROXY_HOPS), for the client network the code limits count. */
  trustProxyHops?: number
}

/** PROPOSED (no owner value): per client network and hour, on top of the configured per-code and per-address limits. */
export const REVERIFY_CODE_RATE_LIMIT = { bucket: 'customer-reverify-code', limit: 20, windowSeconds: 3600 } as const
export const REVERIFY_RATE_LIMIT = { bucket: 'customer-reverify', limit: 60, windowSeconds: 3600 } as const

type Channel = 'email' | 'phone'
type Target = { channel: Channel; destination: string; purpose: CodePurpose; subject: string }

const reverifySubject = (kind: 'grant' | 'account', id: string, channel: Channel) => `reverify:${kind}:${id}:${channel}`
const codeChannel = (c: Channel) => (c === 'email' ? 'email' : 'sms') as 'email' | 'sms'

/** Where the session's re-verification code can go: its own verified contact only. */
export async function reverifyTargets(db: Db | Tx, session: CustomerSession): Promise<Target[]> {
  if (session.via === 'grant') {
    if (!session.grantId) return []
    const grant = await db
      .selectFrom('identity.project_access_grants')
      .select(['id', 'contact_id', 'request_id', 'revoked_at'])
      .where('id', '=', session.grantId)
      .executeTakeFirst()
    if (!grant || grant.revoked_at !== null) return []
    const t = await grantContactTarget(db, { contactId: grant.contact_id, requestId: grant.request_id })
    const purpose = 'project_access' as const
    return [
      { channel: 'email', destination: t.email, purpose, subject: reverifySubject('grant', grant.id, 'email') },
      ...(t.textsAllowed
        ? [
            {
              channel: 'phone' as const,
              destination: t.phone,
              purpose,
              subject: reverifySubject('grant', grant.id, 'phone'),
            },
          ]
        : []),
    ]
  }
  if (!session.accountId) return []
  const a = await db
    .selectFrom('identity.customer_accounts')
    .select(['id', 'state', 'sign_in_email', 'sign_in_phone'])
    .where('id', '=', session.accountId)
    .executeTakeFirst()
  if (!a || a.state !== 'active') return []
  const purpose = 'account_sign_in' as const
  const out: Target[] = []
  if (a.sign_in_email)
    out.push({
      channel: 'email',
      destination: a.sign_in_email,
      purpose,
      subject: reverifySubject('account', a.id, 'email'),
    })
  if (a.sign_in_phone && (await currentConsent(db, 'sms', a.sign_in_phone, 'transactional_sms')) === 'granted')
    out.push({
      channel: 'phone',
      destination: a.sign_in_phone,
      purpose,
      subject: reverifySubject('account', a.id, 'phone'),
    })
  return out
}

const CHANNEL_FIELD = { type: 'string', enum: ['email', 'phone'] } as const
const CODE_FIELD = { type: 'string', minLength: 1, maxLength: 20 } as const
const SENT_SCHEMA = ACCOUNT_CODE_SENT.schema

declare module 'fastify' {
  interface FastifyRequest {
    reverifySession?: CustomerSession
  }
}

const TEST = 'test/integration/estimate-approval.test.ts'

export function sessionVerificationRoutes(deps: SessionVerificationDeps): RouteDef[] {
  const clientOf = (ctx: ApiContext) => networkKey(clientAddress(ctx.req.raw, deps.trustProxyHops ?? 0))
  const httpId = (ctx: ApiContext) => currentContext()?.requestId ?? ctx.req.id
  const base = {
    actors: ['customer'],
    permission: AUTHENTICATION,
    expectedVersion: 'none',
    idempotency: 'none',
    pagination: false,
    test: TEST,
    // The caller's own live session; anything else is 401 before this (customer actors only).
    resource: async (ctx: Pick<ApiContext, 'req' | 'db'>) => {
      const session = await resolveCustomerSession(ctx.db, readSessionToken(ctx.req))
      if (!session) return null
      ctx.req.reverifySession = session
      return {}
    },
  } as const
  const sessionOf = (ctx: ApiContext): CustomerSession => {
    const s = ctx.req.reverifySession
    if (!s) throw new ApiError('NOT_FOUND')
    return s
  }
  const target = { type: 'customer_session' }

  const status: RouteDef = {
    ...base,
    method: 'GET',
    path: '/customer/session/verification',
    operationId: 'getSessionVerification',
    summary: 'Whether this session’s verification is fresh enough to approve',
    description:
      'For a live customer session: whether its verification is fresh enough for an approval (HH-ID-07: newer than ' +
      'verification.limits.freshVerificationMinutes), until when, and where a new one-time code can go: the ' +
      'session’s own verified contact, masked (a guest link’s contact; an account’s sign-in values; a phone only ' +
      'with a current SMS permission). Nothing about any other contact, project or account.',
    kind: 'read',
    rateLimit: 'none',
    audit: 'none',
    projection: SESSION_VERIFICATION,
    schema: { response: { 200: SESSION_VERIFICATION.schema } },
    handler: async (ctx) => {
      const session = sessionOf(ctx)
      const targets = await reverifyTargets(ctx.db, session)
      return {
        body: SESSION_VERIFICATION.project({
          fresh: Date.now() < session.freshUntil.getTime(),
          freshUntil: session.freshUntil,
          channels: targets.map((t) => ({
            channel: t.channel,
            destination: maskForCustomer(codeChannel(t.channel), t.destination),
          })),
        }),
      }
    },
  }

  const codes: RouteDef = {
    ...base,
    method: 'POST',
    path: '/customer/session/verification/codes',
    operationId: 'sendSessionVerificationCode',
    summary: 'Send a new code to verify this session again',
    description:
      'Sends a one-time code (the automatic message contact.verification_code) to the session’s own verified contact ' +
      'on the chosen channel, to make its verification fresh again before an approval (HH-ID-07). A channel the ' +
      'session cannot use is VALIDATION_FAILED (not_available); 429 with Retry-After within the resend cooldown or ' +
      'over the per-destination and per-address limits; 503 while codes are NOT CONFIGURED: nothing is sent.',
    kind: 'write',
    rateLimit: REVERIFY_CODE_RATE_LIMIT,
    audit: 'customer_session.verification_code',
    projection: ACCOUNT_CODE_SENT,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['channel'],
        properties: { channel: CHANNEL_FIELD },
      },
      response: { 202: SENT_SCHEMA },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('sendSessionVerificationCode runs in its write transaction')
      const session = sessionOf(ctx)
      const channel = (ctx.req.body as { channel: Channel }).channel
      const t = (await reverifyTargets(ctx.tx, session)).find((x) => x.channel === channel)
      if (!t)
        throw new ApiError('VALIDATION_FAILED', {
          fieldErrors: [{ field: 'body.channel', code: 'not_available', message: '' }],
        })
      const issued = await issueCode(ctx.tx, deps.codeKey, {
        purpose: t.purpose,
        channel: codeChannel(t.channel),
        destination: t.destination,
        subjectRef: t.subject,
        clientIp: clientOf(ctx),
        requestId: httpId(ctx),
      })
      if (issued.status === 'not_configured' || issued.status === 'invalid_destination')
        throw new ApiError('NOT_CONFIGURED')
      if (issued.status === 'rate_limited')
        throw new ApiError('RATE_LIMITED', { headers: { 'retry-after': String(issued.retryAfterSeconds) } })
      await ctx.audit({ target: { ...target, id: session.id }, summary: { channel } })
      return {
        status: 202,
        body: ACCOUNT_CODE_SENT.project({
          sent: { channel, destination: issued.maskedDestination, expiresAt: issued.expiresAt },
        }),
      }
    },
  }

  const confirm: RouteDef = {
    ...base,
    method: 'POST',
    path: '/customer/session/verification',
    operationId: 'confirmSessionVerification',
    summary: 'Enter the code: this session’s verification is fresh again',
    description:
      'The code sent to the session’s own verified contact on that channel. A match restarts the session’s fresh ' +
      'verification window (HH-ID-07); nothing else changes (no new session, project or contact). A wrong, expired, ' +
      'used or exhausted code is the same neutral 400 (invalid_code), and its attempt is counted and kept.',
    kind: 'write',
    rateLimit: REVERIFY_RATE_LIMIT,
    audit: 'customer_session.reverify',
    projection: SESSION_VERIFICATION,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['channel', 'code'],
        properties: { channel: CHANNEL_FIELD, code: CODE_FIELD },
      },
      response: { 200: SESSION_VERIFICATION.schema },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('confirmSessionVerification runs in its write transaction')
      const session = sessionOf(ctx)
      const body = ctx.req.body as { channel: Channel; code: string }
      const targets = await reverifyTargets(ctx.tx, session)
      const t = targets.find((x) => x.channel === body.channel)
      const invalid = new ApiError('VALIDATION_FAILED', {
        fieldErrors: [{ field: 'body.code', code: 'invalid_code', message: '' }],
      })
      const result = t
        ? await verifyCode(ctx.tx, deps.codeKey, {
            purpose: t.purpose,
            destination: t.destination,
            subjectRef: t.subject,
            code: body.code,
            clientIp: clientOf(ctx),
          })
        : ({ ok: false } as const)
      const sessionTarget = { ...target, id: session.id }
      if (!t || !result.ok || result.destination !== t.destination) {
        // The attempt stays counted: committed, then refused.
        await ctx.audit({ target: sessionTarget, result: 'denied', reason: 'invalid_code' })
        return { body: null, refusal: invalid }
      }
      await refreshVerification(ctx.tx, session.id, result.verifiedAt)
      const renewed = await resolveCustomerSession(ctx.tx, readSessionToken(ctx.req))
      await ctx.audit({ target: sessionTarget, summary: { channel: body.channel } })
      const freshUntil = renewed?.freshUntil ?? session.freshUntil
      return {
        body: SESSION_VERIFICATION.project({
          fresh: true,
          freshUntil,
          channels: targets.map((x) => ({
            channel: x.channel,
            destination: maskForCustomer(codeChannel(x.channel), x.destination),
          })),
        }),
      }
    },
  }

  return [status, codes, confirm]
}
