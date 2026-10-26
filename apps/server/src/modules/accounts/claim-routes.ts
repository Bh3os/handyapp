// The routes of verified project claiming (TSK-0124; HH-ID-14, HH-ID-03, OWN-DEC-160, OWN-DEC-198 F6,
// RULE-SERVER-AUTHZ). See claims.ts.
//   POST /customer/account/claims/codes   Add a project: a code to the named project's verified contact (one answer)
//   POST /customer/account/claims         ...the entered code: the project joins the account
// Both need a live account session: they establish what the account may open, so they are authentication routes like
// the enrollment from a guest link; a guest-link session or none is NOT_FOUND / 401. The audit log records whether a
// code went and which project was linked (staff only), never the reference, the contact value or the code.
import { REFERENCE_PATTERN } from '@handyhub/domain/request-form'
import { clientAddress, networkKey } from '../../access-gate.js'
import { ApiError } from '../../api/errors.js'
import { AUTHENTICATION, type ApiContext, type RouteDef } from '../../api/route.js'
import { loadConfig } from '../../platform/config/index.js'
import { currentContext } from '../../platform/request-context.js'
import { parseContact } from '../access/recovery.js'
import { readSessionToken, resolveCustomerSession, type CodeKeySettings } from '../identity/index.js'
import { ACCOUNT_CLAIM_ACCEPTED, ACCOUNT_CLAIMED } from '../records/index.js'
import { signInMissing } from './accounts.js'
import { claimProject, sendClaimCode } from './claims.js'

const TEST = 'test/integration/customer-dashboard.test.ts'

/**
 * PROPOSED (no owner value, OQ-CUSTOMER-DASHBOARD-DETAILS): per client network and hour, on top of the configured
 * per-code and per-address limits.
 */
export const CLAIM_CODE_RATE_LIMIT = { bucket: 'account-claim-code', limit: 10, windowSeconds: 3600 } as const
export const CLAIM_RATE_LIMIT = { bucket: 'account-claim', limit: 30, windowSeconds: 3600 } as const

const REFERENCE_FIELD = { type: 'string', minLength: 1, maxLength: 40 } as const
const CONTACT_FIELD = { type: 'string', minLength: 1, maxLength: 320 } as const
const CODE_FIELD = { type: 'string', minLength: 1, maxLength: 20 } as const

const fieldError = (field: string, code: string) =>
  new ApiError('VALIDATION_FAILED', { fieldErrors: [{ field, code, message: '' }] })

type ClaimBody = { reference: string; contact: string; code?: string }

/** The reference and contact as typed, normalised; a malformed one is a 400 that depends on no record. */
function parsed(body: ClaimBody) {
  const contact = parseContact(body.contact)
  const reference = body.reference.trim().toUpperCase()
  const fieldErrors = [
    ...(REFERENCE_PATTERN.test(reference) ? [] : [{ field: 'body.reference', code: 'invalid_reference', message: '' }]),
    ...(contact ? [] : [{ field: 'body.contact', code: 'invalid_contact', message: '' }]),
  ]
  if (!contact || fieldErrors.length > 0) throw new ApiError('VALIDATION_FAILED', { fieldErrors })
  return { reference, contact }
}

export function claimRoutes(deps: { codeKey: CodeKeySettings; trustProxyHops?: number }): RouteDef[] {
  const clientOf = (ctx: ApiContext) => networkKey(clientAddress(ctx.req.raw, deps.trustProxyHops ?? 0))
  const base = {
    actors: ['customer'],
    permission: AUTHENTICATION,
    kind: 'write',
    method: 'POST',
    expectedVersion: 'none',
    idempotency: 'none',
    pagination: false,
    test: TEST,
    resource: async (ctx: Pick<ApiContext, 'req' | 'db'>) => {
      const session = await resolveCustomerSession(ctx.db, readSessionToken(ctx.req))
      if (!session?.accountId) return null
      ctx.req.customerSession = session
      return {}
    },
  } as const
  const accountOf = (ctx: ApiContext): string => {
    const id = ctx.req.customerSession?.accountId
    if (!id) throw new ApiError('NOT_FOUND')
    return id
  }

  const codes: RouteDef = {
    ...base,
    path: '/customer/account/claims/codes',
    operationId: 'sendProjectClaimCode',
    summary: 'Add a project to the account: send the code',
    description:
      'For a live account session (HH-ID-14, OWN-DEC-160): the body names a guest project by its request reference and ' +
      'gives the email or mobile phone on that request. When a code already verified exactly that value for the ' +
      'request’s contact (the phone only by text, with its current SMS permission), a one-time code (purpose ' +
      'account_sign_in, the automatic message contact.verification_code) goes to it; never to anything else, and a ' +
      'matching name, email or phone alone links nothing (HH-ID-03). Every well-formed request gets the same 202 ' +
      '{accepted, codeMinutes} whether or not the project exists, the contact matches or is verified, the project is ' +
      'already in the account, a link to it was revoked by staff (staff restore access, OWN-DEC-198 F5) or a ' +
      'per-code limit was reached. A malformed reference (invalid_reference) or contact (invalid_contact) is a 400; a ' +
      'phone while texting is not available a 400 (texts_unavailable) for every phone, decided before any record is ' +
      'read; a network over its limit a 429; while the code key, session.timings or verification.limits is NOT ' +
      'CONFIGURED, 503. A guest-link session is NOT_FOUND; no session is 401.',
    rateLimit: CLAIM_CODE_RATE_LIMIT,
    audit: 'customer_account.claim_code',
    projection: ACCOUNT_CLAIM_ACCEPTED,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['reference', 'contact'],
        properties: { reference: REFERENCE_FIELD, contact: CONTACT_FIELD },
      },
      response: { 202: ACCOUNT_CLAIM_ACCEPTED.schema },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('sendProjectClaimCode runs in its write transaction')
      const accountId = accountOf(ctx)
      const { reference, contact } = parsed(ctx.req.body as ClaimBody)
      const out = await sendClaimCode(ctx.tx, deps.codeKey, {
        accountId,
        reference,
        contact,
        clientIp: clientOf(ctx),
        httpRequestId: currentContext()?.requestId ?? ctx.req.id,
      })
      if (out.status === 'not_configured') throw new ApiError('NOT_CONFIGURED')
      if (out.status === 'texts_unavailable') throw fieldError('body.contact', 'texts_unavailable')
      const timings = (await loadConfig(ctx.tx)).get('session.timings')
      if (timings.state !== 'CONFIGURED') throw new ApiError('NOT_CONFIGURED')
      // Whether a code went, why not, and for which project (staff only); never the reference or the contact value.
      await ctx.audit({
        target: { type: 'customer_account', id: accountId },
        summary: {
          channel: contact.channel,
          issued: out.issued,
          outcome: out.why,
          ...(out.projectId ? { project: out.projectId } : {}),
        },
      })
      return { status: 202, body: ACCOUNT_CLAIM_ACCEPTED.project({ codeMinutes: timings.value.oneTimeCodeMinutes }) }
    },
  }

  const claim: RouteDef = {
    ...base,
    path: '/customer/account/claims',
    operationId: 'claimProject',
    summary: 'Add a project to the account: enter the code',
    description:
      'The code last sent for this claim. A match, checked again now, links that one project to the account with the ' +
      'code as its evidence (claim_code): it opens at once in the account’s dashboard, in its section; the project ' +
      'and every other record keep their IDs and nothing is copied (T20). A wrong, expired or used code and a claim ' +
      'that matches nothing are the same neutral 400 (body.code, invalid_code); the attempt is counted and kept. ' +
      'Malformed input is a 400 as for the code; 503 while NOT CONFIGURED.',
    rateLimit: CLAIM_RATE_LIMIT,
    audit: 'customer_account.claim',
    projection: ACCOUNT_CLAIMED,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['reference', 'contact', 'code'],
        properties: { reference: REFERENCE_FIELD, contact: CONTACT_FIELD, code: CODE_FIELD },
      },
      response: { 200: ACCOUNT_CLAIMED.schema },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('claimProject runs in its write transaction')
      const accountId = accountOf(ctx)
      const body = ctx.req.body as ClaimBody & { code: string }
      const { reference, contact } = parsed(body)
      if ((await signInMissing(ctx.tx, deps.codeKey)).length > 0) throw new ApiError('NOT_CONFIGURED')
      const out = await claimProject(ctx.tx, deps.codeKey, {
        accountId,
        reference,
        contact,
        code: body.code,
        clientIp: clientOf(ctx),
      })
      const target = { type: 'customer_account', id: accountId }
      if (!out.ok) {
        await ctx.audit({
          target,
          summary: { channel: contact.channel, ...(out.projectId ? { project: out.projectId } : {}) },
          result: 'denied',
          reason: 'invalid_code',
        })
        return { body: null, refusal: fieldError('body.code', 'invalid_code') }
      }
      await ctx.audit({
        target,
        summary: { channel: out.channel, project: out.projectId, request: out.requestId, link: out.linkId },
      })
      return { body: ACCOUNT_CLAIMED.project({ reference: out.reference }) }
    },
  }

  return [codes, claim]
}
