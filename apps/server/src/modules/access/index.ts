// Access module (TSK-0034; HH-ID-04, HH-ID-05, HH-INT-21, HH-ID-03, HH-ID-08, HH-PORT-01, RULE-SERVER-AUTHZ): the
// single-project guest link and its landing.
//   POST /public/access/open        the visitor pressed Open: where a code can go (masked); changes nothing
//   POST /public/access/codes       send (or resend) the code for the link to the grant's own contact
//   POST /public/access/exchange    the verified exchange: link + code -> a session for that one project
//   GET  /customer/access/session   which projects the caller's session opens (references only)
//   GET  /customer/projects/:ref    the opened project at a glance (the session's own project only)
// The link (/access#<token>) is a page; no GET anywhere takes the token, so a link-preview fetch consumes nothing,
// starts no session and reveals nothing (HH-ID-05, T17). The token travels only in POST bodies, which are never logged
// or audited. An unknown, malformed, expired or revoked token is answered NOT_FOUND exactly like a missing record; a
// reference, a database ID or a storage key is never an input that opens anything (HH-ID-04).
// The landing routes authenticate the caller themselves (AUTHENTICATION, like sign-in): the grant plus a one-time code
// establishes the guest's identity. The project route is authorized by the policy (ROLE-MATRIX "View intake queue and
// original requests": Customer "V (own)"): a session for project A asking for project B gets the same NOT_FOUND as a
// missing project (T19).
import { clientAddress, networkKey } from '../../access-gate.js'
import { ApiError } from '../../api/errors.js'
import { AUTHENTICATION, type ApiContext, type ApiModule, type RouteDef } from '../../api/route.js'
import { currentContext } from '../../platform/request-context.js'
import { readSessionToken, resolveCustomerSession, sessionCookie, type CodeKeySettings } from '../identity/index.js'
import { CONTACT_CHANNELS, type ContactChannel } from '../verification/contact-verification.js'
import { resolveGrant, type Grant } from './grants.js'
import { accessChannels, exchangeAccessCode, sendAccessCode } from './landing.js'
import { projectGlance, projectIdOf, referencesOf } from './projects.js'

export * from './grants.js'
export * from './landing.js'
export * from './link-message.js'

/** PROPOSED (no owner value): per client network and hour, on top of the configured per-code and per-address limits. */
export const ACCESS_OPEN_RATE_LIMIT = { bucket: 'public-access-open', limit: 30, windowSeconds: 3600 } as const
export const ACCESS_CODE_RATE_LIMIT = { bucket: 'public-access-code', limit: 30, windowSeconds: 3600 } as const
export const ACCESS_EXCHANGE_RATE_LIMIT = { bucket: 'public-access-exchange', limit: 60, windowSeconds: 3600 } as const

declare module 'fastify' {
  interface FastifyRequest {
    accessGrant?: Grant
  }
}

const TOKEN_FIELD = { type: 'string', minLength: 1, maxLength: 200 } as const
const CHANNEL_FIELD = { type: 'string', enum: [...CONTACT_CHANNELS] } as const
const CHANNELS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['channel', 'destination'],
    properties: { channel: CHANNEL_FIELD, destination: { type: 'string' } },
  },
} as const

/** The grant of the body's token, resolved before the handler; null answers NOT_FOUND. */
async function grantResource(ctx: Pick<ApiContext, 'req' | 'db'>) {
  const grant = await resolveGrant(ctx.db, (ctx.req.body as { token?: unknown } | undefined)?.token)
  if (!grant) return null
  ctx.req.accessGrant = grant
  return { projectId: grant.projectId }
}
const grantOf = (ctx: ApiContext): Grant => {
  const grant = ctx.req.accessGrant
  if (!grant) throw new ApiError('NOT_FOUND')
  return grant
}
const grantTarget = (grant: Grant) => ({ type: 'project_access_grant', id: grant.id })

export type AccessDeps = {
  /** The key behind one-time codes and link tokens (TSK-0016); NOT CONFIGURED: no code is sent, no grant opens. */
  codeKey: CodeKeySettings
  /** Proxies in front of the service (TRUST_PROXY_HOPS), for the client network the code limits count. */
  trustProxyHops?: number
}

export function accessModule(deps: AccessDeps): ApiModule {
  const clientOf = (ctx: ApiContext) => networkKey(clientAddress(ctx.req.raw, deps.trustProxyHops ?? 0))
  const landing = {
    actors: ['guest', 'customer'],
    permission: AUTHENTICATION,
    kind: 'write',
    expectedVersion: 'none',
    idempotency: 'none',
    pagination: false,
    test: 'test/integration/project-access.test.ts',
    resource: grantResource,
  } as const

  const open: RouteDef = {
    ...landing,
    method: 'POST',
    path: '/public/access/open',
    operationId: 'openAccessLink',
    summary: 'Open a project access link',
    description:
      'The visitor pressed Open on the access page (HH-ID-05). For a live grant: where its one-time code can go, ' +
      'masked (the grant’s own contact; the phone only by text with that request’s current SMS opt-in). Nothing ' +
      'else: no scope, address, financial detail or photo, and nothing changes (no code, no session, no consumption). ' +
      'An unknown, malformed, expired or revoked link is NOT_FOUND.',
    rateLimit: ACCESS_OPEN_RATE_LIMIT,
    audit: 'project_access.open',
    schema: {
      body: { type: 'object', additionalProperties: false, required: ['token'], properties: { token: TOKEN_FIELD } },
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          required: ['channels'],
          properties: { channels: CHANNELS_SCHEMA },
        },
      },
    },
    handler: async (ctx) => {
      const grant = grantOf(ctx)
      const channels = await accessChannels(ctx.tx ?? ctx.db, grant)
      await ctx.audit({ target: grantTarget(grant) })
      return { body: { channels } }
    },
  }

  const send: RouteDef = {
    ...landing,
    method: 'POST',
    path: '/public/access/codes',
    operationId: 'sendAccessCode',
    summary: 'Send or resend the code for an access link',
    description:
      'Sends a one-time code (the automatic message contact.verification_code) for a live grant to its own contact: ' +
      'by email, or by text with that request’s current SMS opt-in. The code lifetime and the attempt, resend and ' +
      'per-address limits come from session.timings and verification.limits: a resend inside the cooldown or over a ' +
      'limit is a neutral 429 with Retry-After; while the code key or those values are NOT CONFIGURED, 503 and ' +
      'nothing is sent. A phone without the opt-in is a 400 (sms_not_permitted).',
    rateLimit: ACCESS_CODE_RATE_LIMIT,
    audit: 'project_access.send_code',
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['token', 'channel'],
        properties: { token: TOKEN_FIELD, channel: CHANNEL_FIELD },
      },
      response: {
        202: {
          type: 'object',
          additionalProperties: false,
          required: ['sent'],
          properties: {
            sent: {
              type: 'object',
              additionalProperties: false,
              required: ['channel', 'destination', 'expiresAt'],
              properties: { channel: CHANNEL_FIELD, destination: { type: 'string' }, expiresAt: { type: 'string' } },
            },
          },
        },
      },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('sendAccessCode runs in its write transaction')
      const grant = grantOf(ctx)
      const body = ctx.req.body as { channel: ContactChannel }
      const out = await sendAccessCode(ctx.tx, deps.codeKey, {
        grant,
        channel: body.channel,
        clientIp: clientOf(ctx),
        httpRequestId: currentContext()?.requestId ?? ctx.req.id,
      })
      if (out.status === 'not_configured') throw new ApiError('NOT_CONFIGURED')
      if (out.status === 'rate_limited')
        throw new ApiError('RATE_LIMITED', { headers: { 'retry-after': String(out.retryAfterSeconds) } })
      if (out.status === 'sms_not_permitted')
        throw new ApiError('VALIDATION_FAILED', {
          fieldErrors: [{ field: 'body.channel', code: 'sms_not_permitted', message: '' }],
        })
      // Codes, tokens and addresses never reach the audit log; the channel does.
      await ctx.audit({ target: grantTarget(grant), summary: { channel: out.channel } })
      return {
        status: 202,
        body: { sent: { channel: out.channel, destination: out.sentTo, expiresAt: out.expiresAt.toISOString() } },
      }
    },
  }

  const exchange: RouteDef = {
    ...landing,
    method: 'POST',
    path: '/public/access/exchange',
    operationId: 'exchangeAccessLink',
    summary: 'Open the project with the link and its code',
    description:
      'The explicit verified exchange (HH-ID-05): the code of the channel’s latest send for this grant. A match ' +
      'records the exact value as verified on the contact, records the grant’s verified time and starts a new ' +
      'customer session for the grant’s one project (Set-Cookie; any earlier session of this browser ends). Other ' +
      'projects of the same customer, email or phone are never attached (HH-ID-03). A wrong, expired, replaced, used ' +
      'or exhausted code is one neutral 400 (body.code, invalid_code); the attempt is counted and kept, so the ' +
      'configured attempt limit holds.',
    rateLimit: ACCESS_EXCHANGE_RATE_LIMIT,
    audit: 'project_access.exchange',
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['token', 'channel', 'code'],
        properties: {
          token: TOKEN_FIELD,
          channel: CHANNEL_FIELD,
          code: { type: 'string', minLength: 1, maxLength: 20 },
        },
      },
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          required: ['project'],
          properties: {
            project: {
              type: 'object',
              additionalProperties: false,
              required: ['reference'],
              properties: { reference: { type: 'string' } },
            },
          },
        },
      },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('exchangeAccessLink runs in its write transaction')
      const body = ctx.req.body as { token: string; channel: ContactChannel; code: string }
      // Read again under a lock: a grant revoked since the policy step opens nothing (HH-ID-07 recheck).
      const grant = await resolveGrant(ctx.tx, body.token, new Date(), true)
      if (!grant) throw new ApiError('NOT_FOUND')
      const existing = await resolveCustomerSession(ctx.tx, readSessionToken(ctx.req))
      const out = await exchangeAccessCode(ctx.tx, deps.codeKey, {
        grant,
        channel: body.channel,
        code: body.code,
        clientIp: clientOf(ctx),
        ...(existing ? { replaces: existing.id } : {}),
      })
      if (!out.ok) {
        await ctx.audit({
          target: grantTarget(grant),
          summary: { channel: body.channel },
          result: 'denied',
          reason: 'invalid_code',
        })
        return {
          body: null,
          refusal: new ApiError('VALIDATION_FAILED', {
            fieldErrors: [{ field: 'body.code', code: 'invalid_code', message: '' }],
          }),
        }
      }
      await ctx.audit({ target: grantTarget(grant), summary: { channel: body.channel, project: out.projectId } })
      const [reference] = await referencesOf(ctx.tx, [out.projectId])
      return {
        body: { project: { reference } },
        headers: { 'set-cookie': sessionCookie(out.session) },
      }
    },
  }

  const session: RouteDef = {
    method: 'GET',
    path: '/customer/access/session',
    operationId: 'getCustomerAccess',
    summary: 'The projects this session opens',
    description:
      'For a live customer session: the references of the projects it opens (a guest link session: exactly one). ' +
      'Without a session, 401. Nothing about any other project, account or history.',
    actors: ['customer'],
    permission: AUTHENTICATION,
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: 'test/integration/project-access.test.ts',
    schema: {
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          required: ['projects'],
          properties: {
            projects: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['reference'],
                properties: { reference: { type: 'string' } },
              },
            },
          },
        },
      },
    },
    handler: async (ctx) => {
      const ids = ctx.actor.kind === 'customer' ? ctx.actor.projectAccess.map((p) => p.projectId) : []
      const references = await referencesOf(ctx.db, ids)
      return { body: { projects: references.map((reference) => ({ reference })) } }
    },
  }

  const project: RouteDef = {
    method: 'GET',
    path: '/customer/projects/:reference',
    operationId: 'getCustomerProject',
    summary: 'The opened project at a glance',
    description:
      'The project of the caller’s session, as the customer sent it: its reference, the services by their registry ' +
      'names, when it was sent and the request’s state code. A customer projection only (HH-PORT-01): no internal ' +
      'note, staff detail or other record. Any other project, an unknown reference or a malformed one is the same ' +
      'NOT_FOUND (T19), and the refusal is logged (AUTHZ_DENIED).',
    actors: ['customer'],
    permission: 'request.view',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: 'test/integration/project-access.test.ts',
    resource: async ({ req, db }) => {
      const id = await projectIdOf(db, (req.params as { reference: string }).reference)
      return id ? { projectId: id } : null
    },
    schema: {
      params: {
        type: 'object',
        additionalProperties: false,
        required: ['reference'],
        properties: { reference: { type: 'string', minLength: 1, maxLength: 40 } },
      },
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          required: ['reference', 'submittedAt', 'requestState', 'services', 'notSure'],
          properties: {
            reference: { type: 'string' },
            submittedAt: { type: 'string' },
            requestState: { type: 'string' },
            services: { type: 'array', items: { type: 'string' } },
            notSure: { type: 'boolean' },
          },
        },
      },
    },
    handler: async (ctx) => {
      const glance = await projectGlance(ctx.db, (ctx.req.params as { reference: string }).reference)
      if (!glance) throw new ApiError('NOT_FOUND')
      return { body: glance }
    },
  }

  return { name: 'access', routes: [open, send, exchange, session, project] }
}
