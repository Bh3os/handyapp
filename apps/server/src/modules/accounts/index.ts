// Accounts module (TSK-0036; HH-ID-10, HH-ID-11, HH-ID-03, HH-INT-14, ENT-CustomerAccount, ENT-CustomerIdentityLink,
// OWN-DEC-63, OWN-DEC-87, RULE-SERVER-AUTHZ): optional customer accounts with one-time-code sign-in.
//   POST /public/request-receipt/account/codes   enrollment from the receipt offer: a code to a verified value
//   POST /public/request-receipt/account         ...the entered code: create (or sign in to) the account, link it
//   GET  /customer/account/enrollment            enrollment later, from a guest-link session: the usable channels
//   POST /customer/account/enrollment/codes      ...a code to a verified value
//   POST /customer/account/enrollment            ...the entered code
//   POST /public/account/sign-in/codes           sign-in: one answer whether or not the value has an account
//   POST /public/account/sign-in                 ...the entered code
//   GET  /customer/account                       the signed-in account (masked values, linked project references)
//   POST /customer/account/email/codes           sign-in email change: a code to the new email (fresh sign-in)
//   POST /customer/account/email                 ...the entered code: notice to the old email, other sessions end
//   POST /customer/session/sign-out              Sign Out (any customer session)
// Enrollment and sign-in establish who the caller is, so they are authentication routes (like the staff sign-in and
// the access link exchange). The receipt routes need the Receipt-Capability header of the tab that sent the request;
// the guest-link routes need a live session started from that project's access grant; an unknown, expired or revoked
// capability or a session of another kind is NOT_FOUND like a missing record. No answer before a correct code ever
// says whether an account, customer, contact or project exists for a value (HH-ID-03). Codes, links, tokens and
// contact values never reach the audit log or the logs.
import { clientAddress, networkKey } from '../../access-gate.js'
import { ApiError } from '../../api/errors.js'
import { AUTHENTICATION, type ApiContext, type ApiModule, type RouteDef } from '../../api/route.js'
import { currentContext } from '../../platform/request-context.js'
import { loadConfig } from '../../platform/config/index.js'
import { parseContact } from '../access/recovery.js'
import {
  clearedSessionCookie,
  readSessionToken,
  resolveCustomerSession,
  revokeCustomerSession,
  sessionCookie,
  type CodeKeySettings,
  type CustomerSession,
} from '../identity/index.js'
import { ACCOUNT_CODE_SENT, ACCOUNT_SIGNED_IN, CUSTOMER_ACCOUNT, ENROLLMENT_CHANNEL, listOf } from '../records/index.js'
import { RECEIPT_CAPABILITY_HEADER, resolveReceiptCapability } from '../verification/receipt-capability.js'
import {
  accountView,
  changeEmail,
  emailChangeMissing,
  enroll,
  enrollmentChannels,
  sendEmailChangeCode,
  sendEnrollmentCode,
  sendSignInCode,
  signIn,
  signInMissing,
  type AccountChannel,
  type EnrollmentSource,
  type SendResult,
} from './accounts.js'

export * from './accounts.js'
export * from './notice.js'

/** PROPOSED (no owner value): per client network and hour, on top of the configured per-code and per-address limits. */
export const ENROLL_CODE_RATE_LIMIT = { bucket: 'account-enroll-code', limit: 30, windowSeconds: 3600 } as const
export const ENROLL_RATE_LIMIT = { bucket: 'account-enroll', limit: 60, windowSeconds: 3600 } as const
export const SIGN_IN_CODE_RATE_LIMIT = { bucket: 'account-sign-in-code', limit: 20, windowSeconds: 3600 } as const
export const SIGN_IN_RATE_LIMIT = { bucket: 'account-sign-in', limit: 60, windowSeconds: 3600 } as const
export const EMAIL_CODE_RATE_LIMIT = { bucket: 'account-email-code', limit: 20, windowSeconds: 3600 } as const
export const EMAIL_CHANGE_RATE_LIMIT = { bucket: 'account-email-change', limit: 60, windowSeconds: 3600 } as const

/** The one answer to every accepted sign-in code request, whether or not a code was sent. */
export type SignInAccepted = { accepted: true; codeMinutes: number }

declare module 'fastify' {
  interface FastifyRequest {
    enrollmentSource?: EnrollmentSource
    customerSession?: CustomerSession
  }
}

const TEST = 'test/integration/customer-accounts.test.ts'
const CHANNEL_FIELD = { type: 'string', enum: ['email', 'phone'] } as const
const CODE_FIELD = { type: 'string', minLength: 1, maxLength: 20 } as const
const CONTACT_FIELD = { type: 'string', minLength: 1, maxLength: 320 } as const
// The answers are the declared customer views (records/projections.ts, TSK-0037 HH-ARC-04): allow-listed fields only.
const ACCOUNT_SCHEMA = CUSTOMER_ACCOUNT.schema
const SENT_SCHEMA = ACCOUNT_CODE_SENT.schema
const ENROLLED_SCHEMA = ACCOUNT_SIGNED_IN.schema

const invalidCode = () =>
  new ApiError('VALIDATION_FAILED', { fieldErrors: [{ field: 'body.code', code: 'invalid_code', message: '' }] })

export type AccountsDeps = {
  /** The key behind one-time codes (TSK-0016); NOT CONFIGURED: no code is sent and nobody signs in. */
  codeKey: CodeKeySettings
  /** Proxies in front of the service (TRUST_PROXY_HOPS), for the client network the code limits count. */
  trustProxyHops?: number
}

export function accountsModule(deps: AccountsDeps): ApiModule {
  const clientOf = (ctx: ApiContext) => networkKey(clientAddress(ctx.req.raw, deps.trustProxyHops ?? 0))
  const httpId = (ctx: ApiContext) => currentContext()?.requestId ?? ctx.req.id
  const sessionOf = async (ctx: ApiContext) => resolveCustomerSession(ctx.tx ?? ctx.db, readSessionToken(ctx.req))

  /** The signed-in account as the page shows it; null for a session that is not an account's. */
  const viewOf = async (ctx: ApiContext, session: CustomerSession | null, fresh: boolean) => {
    if (!session?.accountId) return null
    const view = await accountView(ctx.tx ?? ctx.db, session)
    if (!view) return null
    const missing = await emailChangeMissing(ctx.tx ?? ctx.db, deps.codeKey)
    return {
      email: view.email,
      phone: view.phone,
      projects: view.projects.map((reference) => ({ reference })),
      freshVerification: fresh,
      emailChange: missing.length === 0 ? ('available' as const) : ('not_configured' as const),
    }
  }

  const sendAnswer = (out: SendResult) => {
    if (out.status === 'not_configured') throw new ApiError('NOT_CONFIGURED')
    if (out.status === 'rate_limited')
      throw new ApiError('RATE_LIMITED', { headers: { 'retry-after': String(out.retryAfterSeconds) } })
    if (out.status === 'not_verified')
      throw new ApiError('VALIDATION_FAILED', {
        fieldErrors: [{ field: 'body.channel', code: 'not_verified', message: '' }],
      })
    return {
      status: 202,
      body: ACCOUNT_CODE_SENT.project({
        sent: { channel: out.channel, destination: out.sentTo, expiresAt: out.expiresAt },
      }),
    }
  }

  /** The entered enrollment code, shared by the receipt and the guest-link routes. */
  const enrollHandler = async (ctx: ApiContext, source: EnrollmentSource) => {
    if (!ctx.tx) throw new Error('enrollment runs in its write transaction')
    if ((await signInMissing(ctx.tx, deps.codeKey)).length > 0) throw new ApiError('NOT_CONFIGURED')
    const body = ctx.req.body as { channel: AccountChannel; code: string }
    const existing = await sessionOf(ctx)
    const out = await enroll(ctx.tx, deps.codeKey, {
      source,
      channel: body.channel,
      code: body.code,
      clientIp: clientOf(ctx),
      ...(existing ? { replaces: existing.id } : {}),
    })
    const target = { type: 'request', id: source.requestId }
    if (!out.ok) {
      await ctx.audit({ target, summary: { channel: body.channel }, result: 'denied', reason: 'invalid_code' })
      return { body: null, refusal: invalidCode() }
    }
    await ctx.audit({
      target: { type: 'customer_account', id: out.accountId },
      summary: {
        channel: body.channel,
        via: source.via,
        created: out.created,
        linked: out.linked,
        project: out.projectId,
        request: source.requestId,
      },
    })
    const session = await resolveCustomerSession(ctx.tx, out.session.token)
    return {
      body: ACCOUNT_SIGNED_IN.project({ account: await viewOf(ctx, session, true) }),
      headers: { 'set-cookie': sessionCookie(out.session) },
    }
  }

  // ----- Enrollment from the receipt offer (HH-INT-14) -----
  const receipt = {
    actors: ['guest', 'customer'],
    permission: AUTHENTICATION,
    kind: 'write',
    expectedVersion: 'none',
    idempotency: 'none',
    pagination: false,
    test: TEST,
    resource: async (ctx: Pick<ApiContext, 'req' | 'db'>) => {
      const cap = await resolveReceiptCapability(ctx.db, ctx.req.headers[RECEIPT_CAPABILITY_HEADER])
      if (!cap) return null
      const request = await ctx.db
        .selectFrom('intake.requests')
        .select(['id', 'contact_id', 'project_id'])
        .where('id', '=', cap.requestId)
        .executeTakeFirst()
      if (!request) return null
      ctx.req.enrollmentSource = { requestId: request.id, contactId: request.contact_id, via: 'receipt_offer' }
      return {}
    },
  } as const
  const sourceOf = (ctx: ApiContext): EnrollmentSource => {
    const s = ctx.req.enrollmentSource
    if (!s) throw new ApiError('NOT_FOUND')
    return s
  }

  const receiptCodes: RouteDef = {
    ...receipt,
    method: 'POST',
    path: '/public/request-receipt/account/codes',
    operationId: 'sendReceiptAccountCode',
    summary: 'Create an Account: send the code',
    description:
      'Under the Receipt-Capability header, after the guest chose Create an Account (HH-INT-14, OWN-DEC-63): a one-time ' +
      'code (purpose account_sign_in, the automatic message contact.verification_code) to the request’s own email or ' +
      'phone, which must already be verified for that exact value (the phone only by text, with that request’s current ' +
      'SMS opt-in). Nothing is created yet. A channel that is not verified is a 400 (not_verified); a resend inside the ' +
      'cooldown or over a limit is a neutral 429 with Retry-After; while the code key, session.timings or ' +
      'verification.limits is NOT CONFIGURED, 503 and nothing is sent.',
    rateLimit: ENROLL_CODE_RATE_LIMIT,
    audit: 'customer_account.enrollment_code',
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['channel'],
        properties: { channel: CHANNEL_FIELD },
      },
      response: { 202: SENT_SCHEMA },
    },
    projection: ACCOUNT_CODE_SENT,
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('sendReceiptAccountCode runs in its write transaction')
      const source = sourceOf(ctx)
      const { channel } = ctx.req.body as { channel: AccountChannel }
      const out = await sendEnrollmentCode(ctx.tx, deps.codeKey, {
        source,
        channel,
        clientIp: clientOf(ctx),
        httpRequestId: httpId(ctx),
      })
      const answer = sendAnswer(out)
      // The customer's intent to create an account is recorded here (HH-ID-10); the code and the address are not.
      await ctx.audit({ target: { type: 'request', id: source.requestId }, summary: { channel, via: source.via } })
      return answer
    },
  }

  const receiptEnroll: RouteDef = {
    ...receipt,
    method: 'POST',
    path: '/public/request-receipt/account',
    operationId: 'enrollFromReceipt',
    summary: 'Create an Account: enter the code',
    description:
      'The code of the channel’s latest enrollment send. A match creates the account for that verified value (with ' +
      'the contact’s other verified value too, when no other account has it), or signs in to the account the value ' +
      'already belongs to, and links this request’s one project to it once: the request, project and every other ' +
      'record keep their IDs, nothing is duplicated, and no other project, customer or contact with the same email or ' +
      'phone is read or linked (HH-ID-03, T20). It starts the account session (Set-Cookie; any earlier session of ' +
      'this browser ends). A wrong, expired, replaced or used code is a neutral 400 (body.code, invalid_code); the ' +
      'attempt is counted and kept.',
    rateLimit: ENROLL_RATE_LIMIT,
    audit: 'customer_account.enroll',
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['channel', 'code'],
        properties: { channel: CHANNEL_FIELD, code: CODE_FIELD },
      },
      response: { 200: ENROLLED_SCHEMA },
    },
    projection: ACCOUNT_SIGNED_IN,
    handler: async (ctx) => enrollHandler(ctx, sourceOf(ctx)),
  }

  // ----- Enrollment later, from the project's guest link (HH-ID-10, HH-INT-14 "registering later") -----
  const linkSession = {
    actors: ['customer'],
    permission: AUTHENTICATION,
    expectedVersion: 'none',
    idempotency: 'none',
    pagination: false,
    test: TEST,
    resource: async (ctx: Pick<ApiContext, 'req' | 'db'>) => {
      const session = await resolveCustomerSession(ctx.db, readSessionToken(ctx.req))
      if (!session?.grantId) return null
      const grant = await ctx.db
        .selectFrom('identity.project_access_grants')
        .select(['request_id', 'contact_id'])
        .where('id', '=', session.grantId)
        .where('revoked_at', 'is', null)
        .executeTakeFirst()
      if (!grant) return null
      ctx.req.enrollmentSource = { requestId: grant.request_id, contactId: grant.contact_id, via: 'project_link' }
      return {}
    },
  } as const

  const linkChannels: RouteDef = {
    ...linkSession,
    method: 'GET',
    path: '/customer/account/enrollment',
    operationId: 'getAccountEnrollment',
    summary: 'Create an Account from the project link: the usable channels',
    description:
      'For a live guest-link session: the channels an account can be created with, masked: the grant’s contact’s ' +
      'own values that a code already verified (the phone only with its current SMS permission). An account session ' +
      'or no session is NOT_FOUND. Nothing about any other project, contact or account.',
    kind: 'read',
    rateLimit: 'none',
    audit: 'none',
    projection: ENROLLMENT_CHANNEL,
    schema: { response: { 200: listOf('channels', ENROLLMENT_CHANNEL) } },
    handler: async (ctx) => ({
      body: { channels: (await enrollmentChannels(ctx.db, sourceOf(ctx))).map((c) => ENROLLMENT_CHANNEL.project(c)) },
    }),
  }

  const linkCodes: RouteDef = {
    ...linkSession,
    method: 'POST',
    path: '/customer/account/enrollment/codes',
    operationId: 'sendLinkAccountCode',
    summary: 'Create an Account from the project link: send the code',
    description:
      'As the receipt’s enrollment code, for the guest-link session’s one project and the grant’s own contact. ' +
      'Refusals: 400 not_verified, 429 with Retry-After, 503 while NOT CONFIGURED.',
    kind: 'write',
    rateLimit: ENROLL_CODE_RATE_LIMIT,
    audit: 'customer_account.enrollment_code',
    schema: receiptCodes.schema,
    projection: ACCOUNT_CODE_SENT,
    handler: receiptCodes.handler,
  }

  const linkEnroll: RouteDef = {
    ...linkSession,
    method: 'POST',
    path: '/customer/account/enrollment',
    operationId: 'enrollFromProjectLink',
    summary: 'Create an Account from the project link: enter the code',
    description:
      'As the receipt’s enrollment: creates (or signs in to) the account and links the guest-link session’s one ' +
      'project once, replacing the guest-link session with the account session (Set-Cookie). Nothing else is linked. ' +
      'A wrong code is a neutral 400 (invalid_code), counted and kept.',
    kind: 'write',
    rateLimit: ENROLL_RATE_LIMIT,
    audit: 'customer_account.enroll',
    schema: receiptEnroll.schema,
    projection: ACCOUNT_SIGNED_IN,
    handler: async (ctx) => enrollHandler(ctx, sourceOf(ctx)),
  }

  // ----- Sign-in -----
  const signInBase = {
    actors: ['guest', 'customer'],
    permission: AUTHENTICATION,
    kind: 'write',
    expectedVersion: 'none',
    idempotency: 'none',
    pagination: false,
    test: TEST,
  } as const
  const contactOf = (raw: string) => {
    const contact = parseContact(raw)
    if (!contact)
      throw new ApiError('VALIDATION_FAILED', {
        fieldErrors: [{ field: 'body.contact', code: 'invalid_contact', message: '' }],
      })
    return contact
  }

  const signInCodes: RouteDef = {
    ...signInBase,
    method: 'POST',
    path: '/public/account/sign-in/codes',
    operationId: 'sendAccountSignInCode',
    summary: 'Sign in: send a one-time code',
    description:
      'Sign in without a password (OWN-DEC-63): the body names an email or a mobile phone. When it is an active ' +
      'account’s verified sign-in value, a one-time code (purpose account_sign_in, the automatic message ' +
      'contact.verification_code) goes to it, the phone only by text with its current SMS permission. Every ' +
      'well-formed request gets the same 202 {accepted, codeMinutes} whether or not an account has the value, the ' +
      'phone may be texted, or a per-code limit was reached (HH-ID-03); codeMinutes is the configured code lifetime. ' +
      'A value that is neither an email nor a US phone number is a 400 (invalid_contact); a network over its limit ' +
      'a 429 for everyone; while the code key, session.timings or verification.limits is NOT CONFIGURED, 503 for ' +
      'everyone.',
    rateLimit: SIGN_IN_CODE_RATE_LIMIT,
    audit: 'customer_account.sign_in_code',
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['contact'],
        properties: { contact: CONTACT_FIELD },
      },
      response: {
        202: {
          type: 'object',
          additionalProperties: false,
          required: ['accepted', 'codeMinutes'],
          properties: { accepted: { type: 'boolean' }, codeMinutes: { type: 'integer' } },
        },
      },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('sendAccountSignInCode runs in its write transaction')
      const contact = contactOf((ctx.req.body as { contact: string }).contact)
      const out = await sendSignInCode(ctx.tx, deps.codeKey, {
        contact,
        clientIp: clientOf(ctx),
        httpRequestId: httpId(ctx),
      })
      if (out.status === 'not_configured') throw new ApiError('NOT_CONFIGURED')
      const timings = (await loadConfig(ctx.tx)).get('session.timings')
      if (timings.state !== 'CONFIGURED') throw new ApiError('NOT_CONFIGURED')
      // The value never reaches the audit log; whether a code went, and to which account, does (staff only).
      await ctx.audit({
        target: out.accountId ? { type: 'customer_account', id: out.accountId } : { type: 'customer_account' },
        summary: { channel: contact.channel, issued: out.issued },
      })
      const body: SignInAccepted = { accepted: true, codeMinutes: timings.value.oneTimeCodeMinutes }
      return { status: 202, body }
    },
  }

  const signInRoute: RouteDef = {
    ...signInBase,
    method: 'POST',
    path: '/public/account/sign-in',
    operationId: 'accountSignIn',
    summary: 'Sign in: enter the code',
    description:
      'The code last sent to the value. A match starts a new account session (Set-Cookie; any earlier session of this ' +
      'browser ends; other devices keep theirs): 30 minutes idle, 8 hours in total (session.timings), revocable on the ' +
      'server. A wrong, expired or used code and a value without an account are the same neutral 400 (body.code, ' +
      'invalid_code); the attempt is counted and kept. Signing in through the account’s other verified contact is ' +
      'also how access is recovered when one contact is lost (HH-ID-11). 503 while NOT CONFIGURED.',
    rateLimit: SIGN_IN_RATE_LIMIT,
    audit: 'customer_account.sign_in',
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['contact', 'code'],
        properties: { contact: CONTACT_FIELD, code: CODE_FIELD },
      },
      response: { 200: ENROLLED_SCHEMA },
    },
    projection: ACCOUNT_SIGNED_IN,
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('accountSignIn runs in its write transaction')
      const body = ctx.req.body as { contact: string; code: string }
      const contact = contactOf(body.contact)
      if ((await signInMissing(ctx.tx, deps.codeKey)).length > 0) throw new ApiError('NOT_CONFIGURED')
      const existing = await sessionOf(ctx)
      const out = await signIn(ctx.tx, deps.codeKey, {
        contact,
        code: body.code,
        clientIp: clientOf(ctx),
        ...(existing ? { replaces: existing.id } : {}),
      })
      if (!out.ok) {
        await ctx.audit({
          target: out.accountId ? { type: 'customer_account', id: out.accountId } : { type: 'customer_account' },
          summary: { channel: contact.channel },
          result: 'denied',
          reason: 'invalid_code',
        })
        return { body: null, refusal: invalidCode() }
      }
      await ctx.audit({
        target: { type: 'customer_account', id: out.accountId },
        summary: { channel: contact.channel },
      })
      const session = await resolveCustomerSession(ctx.tx, out.session.token)
      return {
        body: ACCOUNT_SIGNED_IN.project({ account: await viewOf(ctx, session, true) }),
        headers: { 'set-cookie': sessionCookie(out.session) },
      }
    },
  }

  // ----- The signed-in account -----
  const accountBase = {
    actors: ['customer'],
    permission: AUTHENTICATION,
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
  const accountSessionOf = (ctx: ApiContext): CustomerSession => {
    const s = ctx.req.customerSession
    if (!s) throw new ApiError('NOT_FOUND')
    return s
  }
  const fresh = (ctx: ApiContext) => ctx.actor.kind === 'customer' && ctx.actor.freshVerification

  const account: RouteDef = {
    ...accountBase,
    method: 'GET',
    path: '/customer/account',
    operationId: 'getCustomerAccount',
    summary: 'The signed-in account',
    description:
      'For a live account session: its sign-in email and phone (masked), the references of its linked projects (the ' +
      'customer switches between them, HH-PORT-09), whether the sign-in is fresh enough for a contact change, and ' +
      'whether a sign-in email change is available (not_configured while its notice to the old email cannot be sent, ' +
      'OQ-ACCOUNT-CONTACT-NOTICE). A guest-link session is NOT_FOUND; no session is 401.',
    kind: 'read',
    rateLimit: 'none',
    audit: 'none',
    projection: CUSTOMER_ACCOUNT,
    schema: { response: { 200: ACCOUNT_SCHEMA } },
    handler: async (ctx) => {
      const view = await viewOf(ctx, accountSessionOf(ctx), fresh(ctx))
      if (!view) throw new ApiError('NOT_FOUND')
      return { body: CUSTOMER_ACCOUNT.project(view) }
    },
  }

  const emailCodes: RouteDef = {
    ...accountBase,
    method: 'POST',
    path: '/customer/account/email/codes',
    operationId: 'sendAccountEmailCode',
    summary: 'Change the sign-in email: send a code to the new email',
    description:
      'Needs a fresh sign-in (authority over the account, HH-ID-11: within verification.limits.freshVerificationMinutes ' +
      'of a sign-in through the old email, or through the account’s verified phone, the recovery path); otherwise ' +
      '403 FRESH_AUTH_REQUIRED and the page asks for a new sign-in code. Sends a one-time code to the new email; ' +
      'whether another account has it is not checked or told here. 400 invalid_email or unchanged; 429 with ' +
      'Retry-After; 503 while the notice to the old email (account.contact_changed) is not on the automatic list or ' +
      'has no released wording, or codes are NOT CONFIGURED: nothing is sent and nothing changes.',
    kind: 'write',
    rateLimit: EMAIL_CODE_RATE_LIMIT,
    audit: 'customer_account.email_code',
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['email'],
        properties: { email: { type: 'string', minLength: 3, maxLength: 320 } },
      },
      response: { 202: SENT_SCHEMA },
    },
    projection: ACCOUNT_CODE_SENT,
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('sendAccountEmailCode runs in its write transaction')
      const session = accountSessionOf(ctx)
      if ((await emailChangeMissing(ctx.tx, deps.codeKey)).length > 0) throw new ApiError('NOT_CONFIGURED')
      if (!fresh(ctx)) throw new ApiError('FRESH_AUTH_REQUIRED')
      const out = await sendEmailChangeCode(ctx.tx, deps.codeKey, {
        session,
        email: (ctx.req.body as { email: string }).email,
        clientIp: clientOf(ctx),
        httpRequestId: httpId(ctx),
      })
      if (out.status === 'not_configured') throw new ApiError('NOT_CONFIGURED')
      if (out.status === 'rate_limited')
        throw new ApiError('RATE_LIMITED', { headers: { 'retry-after': String(out.retryAfterSeconds) } })
      if (out.status === 'invalid_email' || out.status === 'unchanged')
        throw new ApiError('VALIDATION_FAILED', {
          fieldErrors: [{ field: 'body.email', code: out.status, message: '' }],
        })
      await ctx.audit({ target: { type: 'customer_account', id: session.accountId ?? '' } })
      return {
        status: 202,
        body: ACCOUNT_CODE_SENT.project({
          sent: { channel: 'email', destination: out.sentTo, expiresAt: out.expiresAt },
        }),
      }
    },
  }

  const emailChange: RouteDef = {
    ...accountBase,
    method: 'POST',
    path: '/customer/account/email',
    operationId: 'changeAccountEmail',
    summary: 'Change the sign-in email: enter the code',
    description:
      'The code sent to the new email, inside a fresh sign-in (else 403 FRESH_AUTH_REQUIRED). A match makes it the ' +
      'account’s sign-in email, records what proved authority (the old email, or the account’s other verified ' +
      'contact: the recovery path) and sends the notice account.contact_changed to the old email after commit ' +
      '(HH-ID-11). Every other session of the account ends and this one is renewed (Set-Cookie), so the old email ' +
      'keeps no access. The project contact records and their guest links are business records and do not change. A ' +
      'wrong code is a neutral 400 (invalid_code), counted and kept; an email that another account already has is a ' +
      '409 (email_in_use) once its code proved it is the customer’s; 503 while NOT CONFIGURED as above.',
    kind: 'write',
    rateLimit: EMAIL_CHANGE_RATE_LIMIT,
    audit: 'customer_account.email_change',
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['email', 'code'],
        properties: { email: { type: 'string', minLength: 3, maxLength: 320 }, code: CODE_FIELD },
      },
      response: { 200: ENROLLED_SCHEMA },
    },
    projection: ACCOUNT_SIGNED_IN,
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('changeAccountEmail runs in its write transaction')
      const session = accountSessionOf(ctx)
      if ((await emailChangeMissing(ctx.tx, deps.codeKey)).length > 0) throw new ApiError('NOT_CONFIGURED')
      if (!fresh(ctx)) throw new ApiError('FRESH_AUTH_REQUIRED')
      const body = ctx.req.body as { email: string; code: string }
      const out = await changeEmail(ctx.tx, deps.codeKey, {
        session,
        email: body.email,
        code: body.code,
        clientIp: clientOf(ctx),
        httpRequestId: httpId(ctx),
      })
      const target = { type: 'customer_account', id: session.accountId ?? '' }
      if (!out.ok) {
        await ctx.audit({ target, result: 'denied', reason: out.problem })
        return {
          body: null,
          refusal:
            out.problem === 'email_in_use'
              ? new ApiError('CONFLICT', { fieldErrors: [{ field: 'body.email', code: 'email_in_use', message: '' }] })
              : invalidCode(),
        }
      }
      await ctx.audit({
        target,
        summary: { authority: out.authority, endedSessions: out.endedSessions, change: out.changeId },
      })
      const renewed = await resolveCustomerSession(ctx.tx, out.session.token)
      return {
        body: ACCOUNT_SIGNED_IN.project({ account: await viewOf(ctx, renewed, true) }),
        headers: { 'set-cookie': sessionCookie(out.session) },
      }
    },
  }

  const signOut: RouteDef = {
    method: 'POST',
    path: '/customer/session/sign-out',
    operationId: 'customerSignOut',
    summary: 'Sign Out',
    description:
      'Ends the caller’s customer session on the server (an account session or a guest-link session) and clears the ' +
      'cookie. Other sessions of the account are not affected. Without a live session, 401.',
    actors: ['customer'],
    permission: AUTHENTICATION,
    kind: 'write',
    expectedVersion: 'none',
    idempotency: 'none',
    pagination: false,
    test: TEST,
    rateLimit: 'none',
    audit: 'customer_session.sign_out',
    schema: {
      body: { type: 'object', additionalProperties: false, properties: {} },
      response: { 204: { type: 'null' } },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('customerSignOut runs in its write transaction')
      const session = await sessionOf(ctx)
      if (session) await revokeCustomerSession(ctx.tx, session.id, 'signed_out')
      await ctx.audit({
        target: session?.accountId
          ? { type: 'customer_account', id: session.accountId }
          : { type: 'customer_session', ...(session ? { id: session.id } : {}) },
      })
      return { status: 204, body: null, headers: { 'set-cookie': clearedSessionCookie() } }
    },
  }

  return {
    name: 'accounts',
    routes: [
      receiptCodes,
      receiptEnroll,
      linkChannels,
      linkCodes,
      linkEnroll,
      signInCodes,
      signInRoute,
      account,
      emailCodes,
      emailChange,
      signOut,
    ],
  }
}
