// Verification module (TSK-0033; HH-INT-13, HH-ID-03, HH-INT-14, HH-INT-11, HH-ID-06, RULE-SERVER-AUTHZ): the receipt
// page's contact verification and its answer to the optional account offer.
//   GET  /public/request-receipt/contact                the request's own contact: masked values and their states
//   POST /public/request-receipt/contact/codes          send (or resend) a code; an email change sends it to the new value
//   POST /public/request-receipt/contact/verify         enter a code
//   POST /public/request-receipt/account-offer/decline  "No thanks" to Create an Account: changes nothing else
// Every route needs the Receipt-Capability header of the tab that sent the request; an unknown, expired or revoked
// capability answers NOT_FOUND exactly like a missing record. A reference number is never an input. Nothing answered
// here mentions another customer, contact, project or account, whatever email or phone the request used (HH-ID-03).
// Permission: verifying the contact of the request just sent is part of submitting it (ROLE-GUEST "verifies a contact
// by one-time code"; ROLE-MATRIX "Submit a request": Guest and Customer Y); the capability limits it to that request.
import { clientAddress, networkKey } from '../../access-gate.js'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { currentContext } from '../../platform/request-context.js'
import { readSessionToken, resolveCustomerSession, sessionCookie, type CodeKeySettings } from '../identity/index.js'
import { startReceiptSession } from '../access/landing.js'
import {
  CONTACT_CHANNELS,
  contactStatus,
  sendContactCode,
  VERIFICATION_STATES,
  verifyContactCode,
  type ContactChannel,
  type ContactStatus,
  type SendProblem,
} from './contact-verification.js'
import { RECEIPT_CAPABILITY_HEADER, resolveReceiptCapability, type ReceiptCapability } from './receipt-capability.js'

export * from './contact-verification.js'
export * from './receipt-capability.js'

/** PROPOSED (no owner value): per client network and hour, on top of the configured per-code and per-address limits. */
export const CODE_SEND_RATE_LIMIT = { bucket: 'public-contact-code', limit: 30, windowSeconds: 3600 } as const
export const CODE_VERIFY_RATE_LIMIT = { bucket: 'public-contact-verify', limit: 60, windowSeconds: 3600 } as const
export const OFFER_RATE_LIMIT = { bucket: 'public-account-offer', limit: 30, windowSeconds: 3600 } as const

declare module 'fastify' {
  interface FastifyRequest {
    receiptCapability?: ReceiptCapability
  }
}

const CHANNEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['destination', 'state', 'available', 'change'],
  properties: {
    destination: { type: 'string' },
    state: { type: 'string', enum: [...VERIFICATION_STATES] },
    available: { type: 'boolean' },
    change: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['destination', 'state'],
      properties: {
        destination: { type: 'string' },
        state: { type: 'string', enum: ['pending', 'expired', 'failed'] },
      },
    },
  },
} as const
const STATUS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['email', 'phone'],
  properties: { email: CHANNEL_SCHEMA, phone: CHANNEL_SCHEMA },
} as const
const CHANNEL_FIELD = { type: 'string', enum: [...CONTACT_CHANNELS] } as const

/** The capability of the request header, resolved for the policy step; null answers NOT_FOUND. */
async function capabilityResource(ctx: Pick<ApiContext, 'req' | 'db'>) {
  const cap = await resolveReceiptCapability(ctx.db, ctx.req.headers[RECEIPT_CAPABILITY_HEADER])
  if (!cap) return null
  ctx.req.receiptCapability = cap
  return {}
}
const capOf = (ctx: ApiContext): ReceiptCapability => {
  const cap = ctx.req.receiptCapability
  if (!cap) throw new ApiError('NOT_FOUND')
  return cap
}

async function statusOf(ctx: ApiContext, requestId: string): Promise<ContactStatus> {
  const status = await contactStatus(ctx.tx ?? ctx.db, requestId)
  if (!status) throw new ApiError('NOT_FOUND')
  return status
}

const PROBLEM_FIELD: Record<SendProblem, string> = {
  already_verified: 'body.channel',
  sms_not_permitted: 'body.channel',
  invalid_destination: 'body.destination',
  change_not_available: 'body.destination',
}

export type VerificationDeps = {
  /** The key behind one-time codes (TSK-0016); NOT CONFIGURED: no code is sent and every code check fails. */
  codeKey: CodeKeySettings
  /** Proxies in front of the service (TRUST_PROXY_HOPS), for the client network the code limits count. */
  trustProxyHops?: number
}

export function verificationModule(deps: VerificationDeps): ApiModule {
  const clientOf = (ctx: ApiContext) => networkKey(clientAddress(ctx.req.raw, deps.trustProxyHops ?? 0))
  const common = {
    actors: ['guest', 'customer'],
    permission: 'request.submit',
    expectedVersion: 'none',
    idempotency: 'none',
    pagination: false,
    test: 'test/integration/contact-verification.test.ts',
    resource: capabilityResource,
  } as const

  const status: RouteDef = {
    ...common,
    method: 'GET',
    path: '/public/request-receipt/contact',
    operationId: 'getReceiptContact',
    summary: "The receipt's contact verification",
    description:
      "Under the Receipt-Capability header: the request's own email and phone, masked, each with its own verification " +
      'state (unverified, pending, verified, expired, failed), whether a code can be sent on it (texts need this ' +
      'request’s SMS opt-in), and an email change waiting for its code. Never another record, account or history.',
    kind: 'read',
    rateLimit: 'none',
    audit: 'none',
    schema: { response: { 200: STATUS_SCHEMA } },
    handler: async (ctx) => ({ body: await statusOf(ctx, capOf(ctx).requestId) }),
  }

  const send: RouteDef = {
    ...common,
    method: 'POST',
    path: '/public/request-receipt/contact/codes',
    operationId: 'sendReceiptContactCode',
    summary: 'Send or resend a verification code',
    description:
      'Sends a one-time code (the automatic message contact.verification_code, OWN-DEC-150) to the request’s email ' +
      'or, with this request’s SMS opt-in, by text to its phone. With `destination` (email only, while unverified) ' +
      'the code goes to the new address and the contact changes only when that code is entered (Change Contact). The ' +
      'code lifetime and the attempt, resend and per-address limits come from session.timings and verification.limits ' +
      '(TSK-0016): a resend inside the cooldown or over a limit is a neutral 429 with Retry-After; while the code key ' +
      'or those values are NOT CONFIGURED, 503 and nothing is sent. Refusals: 400 with already_verified, ' +
      'sms_not_permitted, invalid_destination or change_not_available.',
    kind: 'write',
    rateLimit: CODE_SEND_RATE_LIMIT,
    audit: 'contact_verification.send_code',
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['channel'],
        properties: { channel: CHANNEL_FIELD, destination: { type: 'string', minLength: 3, maxLength: 254 } },
      },
      response: {
        202: {
          type: 'object',
          additionalProperties: false,
          required: ['sent', 'contact'],
          properties: {
            sent: {
              type: 'object',
              additionalProperties: false,
              required: ['channel', 'destination', 'expiresAt', 'change'],
              properties: {
                channel: CHANNEL_FIELD,
                destination: { type: 'string' },
                expiresAt: { type: 'string' },
                change: { type: 'boolean' },
              },
            },
            contact: STATUS_SCHEMA,
          },
        },
      },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('sendReceiptContactCode runs in its write transaction')
      const cap = capOf(ctx)
      const body = ctx.req.body as { channel: ContactChannel; destination?: string }
      const out = await sendContactCode(ctx.tx, deps.codeKey, {
        requestId: cap.requestId,
        channel: body.channel,
        ...(body.destination !== undefined ? { destination: body.destination } : {}),
        clientIp: clientOf(ctx),
        httpRequestId: currentContext()?.requestId ?? ctx.req.id,
      })
      const target = { type: 'request', id: cap.requestId }
      if (out.status === 'not_configured') throw new ApiError('NOT_CONFIGURED')
      if (out.status === 'rate_limited')
        throw new ApiError('RATE_LIMITED', { headers: { 'retry-after': String(out.retryAfterSeconds) } })
      if (out.status === 'refused')
        throw new ApiError('VALIDATION_FAILED', {
          fieldErrors: [{ field: PROBLEM_FIELD[out.problem], code: out.problem, message: '' }],
        })
      // Codes and addresses never reach the audit log; the channel and whether it was a change do.
      await ctx.audit({ target, summary: { channel: out.channel, change: out.change } })
      return {
        status: 202,
        body: {
          sent: {
            channel: out.channel,
            destination: out.sentTo,
            expiresAt: out.expiresAt.toISOString(),
            change: out.change,
          },
          contact: await statusOf(ctx, cap.requestId),
        },
      }
    },
  }

  const verify: RouteDef = {
    ...common,
    method: 'POST',
    path: '/public/request-receipt/contact/verify',
    operationId: 'verifyReceiptContact',
    summary: 'Enter a verification code',
    description:
      'Checks the code of the channel’s latest send. A match marks that exact value verified (an email change then ' +
      'replaces the old address); the other channel is never touched. A wrong, expired, replaced, used or ' +
      'exhausted code is the same neutral 400 (field body.code, invalid_code); the attempt is counted and kept ' +
      '(the refusal commits), so the configured attempt limit holds. Verifying links nothing to any other record. ' +
      'TSK-0034: a match also starts this browser’s customer session for the request’s one project (Set-Cookie; ' +
      'projectAccess true), from the project’s live access grant; a verified email change first revokes the ' +
      'project’s grants and their sessions and issues a new grant. Without a usable grant, projectAccess is false.',
    kind: 'write',
    rateLimit: CODE_VERIFY_RATE_LIMIT,
    audit: 'contact_verification.verify',
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['channel', 'code'],
        properties: { channel: CHANNEL_FIELD, code: { type: 'string', minLength: 1, maxLength: 20 } },
      },
      response: {
        200: {
          type: 'object',
          additionalProperties: false,
          required: ['verified', 'contact'],
          properties: {
            verified: {
              type: 'object',
              additionalProperties: false,
              required: ['channel', 'changed', 'projectAccess'],
              properties: { channel: CHANNEL_FIELD, changed: { type: 'boolean' }, projectAccess: { type: 'boolean' } },
            },
            contact: STATUS_SCHEMA,
          },
        },
      },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('verifyReceiptContact runs in its write transaction')
      const cap = capOf(ctx)
      const body = ctx.req.body as { channel: ContactChannel; code: string }
      const out = await verifyContactCode(ctx.tx, deps.codeKey, {
        requestId: cap.requestId,
        channel: body.channel,
        code: body.code,
        clientIp: clientOf(ctx),
      })
      const target = { type: 'request', id: cap.requestId }
      if (!out.ok) {
        await ctx.audit({ target, summary: { channel: body.channel }, result: 'denied', reason: 'invalid_code' })
        return {
          body: null,
          refusal: new ApiError('VALIDATION_FAILED', {
            fieldErrors: [{ field: 'body.code', code: 'invalid_code', message: '' }],
          }),
        }
      }
      // TSK-0034 (HH-ID-05, HH-INT-21): the entered code is the verified exchange, so it starts this browser's
      // session for the request's one project (View My Request); a verified email change first revokes the
      // project's grants and issues a new one. Without a usable grant (NOT CONFIGURED) no session starts.
      const existing = await resolveCustomerSession(ctx.tx, readSessionToken(ctx.req))
      const session = await startReceiptSession(ctx.tx, deps.codeKey, {
        requestId: cap.requestId,
        changed: out.changed,
        ...(existing ? { replaces: existing.id } : {}),
      })
      await ctx.audit({
        target,
        summary: { channel: out.channel, changed: out.changed, projectAccess: session !== null },
      })
      return {
        body: {
          verified: { channel: out.channel, changed: out.changed, projectAccess: session !== null },
          contact: await statusOf(ctx, cap.requestId),
        },
        ...(session ? { headers: { 'set-cookie': sessionCookie(session) } } : {}),
      }
    },
  }

  const decline: RouteDef = {
    ...common,
    method: 'POST',
    path: '/public/request-receipt/account-offer/decline',
    operationId: 'declineAccountOffer',
    summary: 'No thanks to Create an Account',
    description:
      'Records that the guest declined the optional account offer (HH-INT-14). It changes nothing else: the request, ' +
      'its contact and verification states, the project and the receipt capability stay exactly as they were, and ' +
      'guest access to the project is never reduced by it.',
    kind: 'write',
    rateLimit: OFFER_RATE_LIMIT,
    audit: 'account_offer.decline',
    schema: {
      body: { type: 'object', additionalProperties: false, properties: {} },
      response: { 204: { type: 'null' } },
    },
    handler: async (ctx) => {
      await ctx.audit({ target: { type: 'request', id: capOf(ctx).requestId } })
      return { status: 204, body: null }
    },
  }

  return { name: 'verification', routes: [status, send, verify, decline] }
}
