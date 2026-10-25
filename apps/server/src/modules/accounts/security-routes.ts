// The routes of customer account security (TSK-0149; OWN-DEC-198 F2, F4, F5, F6; HH-ID-11, HH-ID-09, HH-ID-03,
// RULE-SERVER-AUTHZ). See security.ts and help.ts.
//   POST /customer/account/sign-out-everywhere                   the customer ends every session of their account
//   POST /public/access/help                                     ask HandyHub for help: one answer for every visitor
//   GET  /staff/access-help                                      the Owner: open and recently closed help requests
//   GET  /staff/access-help/lookup                               ...the accounts and projects a contact points to
//   GET  /staff/access-help/:id                                  ...one request with its matches (the queue's link)
//   POST /staff/access-help/:id/close                            ...closed once with an outcome and a note
//   POST /staff/customer-accounts/:accountId/sign-out-everywhere the Owner ends every session (a written reason)
//   POST /staff/customer-accounts/:accountId/recovery            ...a staff-assisted recovery after identity checks
//   POST /staff/customer-accounts/:accountId/recovery/cancel     ...cancels the pending one
//   POST /staff/projects/:projectId/access-link                  ...a new link to the project's contact on file
// The customer and public routes establish or end who the caller is (AUTHENTICATION, like sign-in and Sign Out). The
// staff routes are decided by the policy: the Owner (ROLE-MATRIX "Decide privacy requests; Delete action; delete a
// login account", PROPOSED mapping). Every write records its audit event: what was done and the Owner's reason or
// identity evidence, never a code, link, token or the visitor's typed value.
import type { Tx } from '@handyhub/db'
import { ApiError } from '../../api/errors.js'
import { AUTHENTICATION, type ApiContext, type RouteDef } from '../../api/route.js'
import { currentContext } from '../../platform/request-context.js'
import { parseContact } from '../access/recovery.js'
import {
  clearedSessionCookie,
  readSessionToken,
  resolveCustomerSession,
  type CodeKeySettings,
} from '../identity/index.js'
import {
  askForHelp,
  closeHelp,
  HELP_ACCEPTED,
  HELP_KINDS,
  HELP_OUTCOMES,
  helpDetail,
  helpView,
  type HelpDetail,
  type HelpItem,
  type HelpKind,
  type HelpOutcome,
} from './help.js'
import {
  accessMatches,
  activeAccount,
  cancelRecovery,
  ownerText,
  SECURITY_LIMITS,
  sendLinkToContactOnFile,
  signOutEverywhere,
  startRecovery,
  type AccessMatches,
} from './security.js'

const TEST = 'test/integration/account-security.test.ts'

/** PROPOSED (no owner value): help requests per client network and hour, for known and unknown contacts alike. */
export const HELP_RATE_LIMIT = { bucket: 'public-access-help', limit: 5, windowSeconds: 3600 } as const

const UUID = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
} as const
const STRING = { type: 'string' } as const
const NULLABLE_STRING = { type: ['string', 'null'] } as const
const INT = { type: 'integer' } as const
const DATE_TIME = { type: 'string', format: 'date-time' } as const
const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
})
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [{ type: 'null' }, schema] })
const params = (name: string) => ({
  type: 'object',
  additionalProperties: false,
  required: [name],
  properties: { [name]: UUID },
})
const MATCHES = object({
  accounts: {
    type: 'array',
    items: object({
      id: STRING,
      email: NULLABLE_STRING,
      phone: NULLABLE_STRING,
      createdAt: DATE_TIME,
      liveSessions: INT,
      projects: { type: 'array', items: STRING },
      recovery: nullable(object({ id: STRING, email: STRING, expiresAt: DATE_TIME })),
    }),
  },
  projects: {
    type: 'array',
    items: object({
      id: STRING,
      reference: STRING,
      matchedBy: { type: 'array', items: { type: 'string', enum: ['reference', 'email', 'phone'] } },
      contact: object({ name: STRING, email: STRING, phone: STRING }),
      link: object({
        state: { type: 'string', enum: ['live', 'expired', 'revoked', 'none'] },
        revokeReason: NULLABLE_STRING,
        expiresAt: nullable(DATE_TIME),
      }),
      reissuesToday: INT,
      reissueLimit: { type: ['integer', 'null'] },
    }),
  },
})
const ITEM_FIELDS = {
  id: STRING,
  kind: { type: 'string', enum: [...HELP_KINDS] },
  channel: { type: 'string', enum: ['email', 'phone'] },
  contact: STRING,
  reference: NULLABLE_STRING,
  createdAt: DATE_TIME,
  state: { type: 'string', enum: ['open', 'closed'] },
  outcome: { type: ['string', 'null'], enum: [...HELP_OUTCOMES, null] },
  note: NULLABLE_STRING,
  closedBy: nullable(object({ id: STRING, name: NULLABLE_STRING })),
  closedAt: nullable(DATE_TIME),
  version: INT,
}
const ITEM = object(ITEM_FIELDS)
const DETAIL = object({ ...ITEM_FIELDS, matches: MATCHES })
const VIEW = object({ open: { type: 'array', items: ITEM }, closed: { type: 'array', items: ITEM } })

const iso = (d: Date | null) => (d ? d.toISOString() : null)
const itemBody = (i: HelpItem) => ({
  ...i,
  createdAt: i.createdAt.toISOString(),
  closedAt: iso(i.closedAt),
})
const matchesBody = (m: AccessMatches) => ({
  accounts: m.accounts.map((a) => ({
    ...a,
    createdAt: a.createdAt.toISOString(),
    recovery: a.recovery ? { ...a.recovery, expiresAt: a.recovery.expiresAt.toISOString() } : null,
  })),
  projects: m.projects.map((p) => ({ ...p, link: { ...p.link, expiresAt: iso(p.link.expiresAt) } })),
})
const detailBody = (d: HelpDetail) => ({ ...itemBody(d), matches: matchesBody(d.matches) })

const staffActor = (ctx: ApiContext) => {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}
const httpId = (ctx: ApiContext) => currentContext()?.requestId ?? ctx.req.id

export function securityRoutes(deps: { codeKey: CodeKeySettings }): RouteDef[] {
  const staffRead = {
    actors: ['staff'],
    method: 'GET',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
  } as const
  const staffWrite = {
    actors: ['staff'],
    method: 'POST',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    pagination: false,
    test: TEST,
  } as const
  /** The account named by the path, while it is active; anything else is NOT_FOUND like a missing record. */
  const accountResource = async ({ req, db }: Pick<ApiContext, 'req' | 'db'>) =>
    (await activeAccount(db, (req.params as { accountId: string }).accountId)) ? {} : null
  const helpRequestId = (body: { helpRequestId?: string | null }) => body.helpRequestId ?? null

  return [
    // ----- The customer (F2) -----
    {
      method: 'POST',
      path: '/customer/account/sign-out-everywhere',
      operationId: 'customerSignOutEverywhere',
      summary: 'Sign out everywhere',
      description:
        'For a live account session: ends every session of the account on the server at once, this one included, and ' +
        'clears the cookie (OWN-DEC-198 F2: a security-triggered sign-out, for example when the customer thinks someone ' +
        'else used their account). Ordinary sign-ins and Sign Out keep the other devices signed in. A guest-link ' +
        'session is NOT_FOUND; no session is 401.',
      actors: ['customer'],
      permission: AUTHENTICATION,
      kind: 'write',
      expectedVersion: 'none',
      idempotency: 'none',
      pagination: false,
      test: TEST,
      rateLimit: 'none',
      audit: 'customer_account.sign_out_everywhere',
      resource: async (ctx) => {
        const session = await resolveCustomerSession(ctx.db, readSessionToken(ctx.req))
        return session?.accountId ? {} : null
      },
      schema: {
        body: { type: 'object', additionalProperties: false, properties: {} },
        response: { 204: { type: 'null' } },
      },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const session = await resolveCustomerSession(tx, readSessionToken(ctx.req))
        if (!session?.accountId) throw new ApiError('NOT_FOUND')
        const ended = await signOutEverywhere(tx, session.accountId)
        await ctx.audit({
          target: { type: 'customer_account', id: session.accountId },
          summary: { endedSessions: ended },
        })
        return { status: 204, body: null, headers: { 'set-cookie': clearedSessionCookie() } }
      },
    },

    // ----- Every visitor (F4, F5, F6) -----
    {
      method: 'POST',
      path: '/public/access/help',
      operationId: 'requestAccessHelp',
      summary: 'Ask HandyHub for help signing in or getting a new link',
      description:
        'The secure alternative (OWN-DEC-198 F4, F5): when texts cannot be used to sign in, a contact is lost, or a new ' +
        'link cannot be sent (the reissue limits, a link staff revoked). The body names what is needed (sign_in or ' +
        'project_link), the email or mobile phone used, and the request reference when the visitor has it. Every ' +
        'well-formed request is the same 202 {accepted: true}, whether or not an account, a project or a contact ' +
        'matches (F6). The Owner reads it in the staff queue, verifies the person’s identity through the contact ' +
        'details on file and answers through them; nothing is ever sent to the typed value. An open request for the ' +
        'same need and contact is not repeated. A contact that is neither an email nor a US phone number is a 400 ' +
        '(invalid_contact); a network over its limit a 429 for everyone.',
      actors: ['guest', 'customer'],
      permission: AUTHENTICATION,
      kind: 'write',
      expectedVersion: 'none',
      idempotency: 'none',
      pagination: false,
      test: TEST,
      rateLimit: HELP_RATE_LIMIT,
      audit: 'access_help.request',
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'contact'],
          properties: {
            kind: { type: 'string', enum: [...HELP_KINDS] },
            contact: { type: 'string', minLength: 1, maxLength: 320 },
            reference: { type: 'string', maxLength: 40 },
          },
        },
        response: {
          202: {
            type: 'object',
            additionalProperties: false,
            required: ['accepted'],
            properties: { accepted: { type: 'boolean' } },
          },
        },
      },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const body = ctx.req.body as { kind: HelpKind; contact: string; reference?: string }
        const contact = parseContact(body.contact)
        if (!contact)
          throw new ApiError('VALIDATION_FAILED', {
            fieldErrors: [{ field: 'body.contact', code: 'invalid_contact', message: '' }],
          })
        const out = await askForHelp(tx, { kind: body.kind, contact, reference: body.reference ?? null })
        // The typed contact and reference never reach the audit log.
        await ctx.audit({
          target: { type: 'access_help_request', id: out.id },
          summary: { kind: body.kind, channel: contact.channel, created: out.created },
        })
        return { status: 202, body: HELP_ACCEPTED }
      },
    },

    // ----- The Owner -----
    {
      ...staffRead,
      path: '/staff/access-help',
      operationId: 'getAccessHelpRequests',
      summary: 'Requests for help signing in or getting a new link',
      description:
        'The Owner (customer_account.assist_recovery): the open help requests (oldest first) and the last 50 closed ones ' +
        'with their outcome and note. Read only.',
      permission: 'customer_account.assist_recovery',
      schema: { response: { 200: VIEW } },
      handler: async (ctx) => {
        const view = await helpView(ctx.db)
        return { body: { open: view.open.map(itemBody), closed: view.closed.map(itemBody) } }
      },
    },
    {
      ...staffRead,
      path: '/staff/access-help/lookup',
      operationId: 'lookupCustomerAccess',
      summary: 'The accounts and projects an email, phone or reference points to',
      description:
        'The Owner (customer_account.assist_recovery), to verify a person’s identity before helping: the active ' +
        'accounts whose sign-in email or phone is the given one (sessions, linked projects, a pending recovery) and the ' +
        'projects whose reference is the given one or whose request contact has that email or phone (the contact on ' +
        'file, the state of the newest link and today’s reissues against the limit). At most 20 of each. A contact ' +
        'that is neither an email nor a US phone number, or neither given, is a 400.',
      permission: 'customer_account.assist_recovery',
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            contact: { type: 'string', maxLength: 320 },
            reference: { type: 'string', maxLength: 40 },
          },
        },
        response: { 200: MATCHES },
      },
      handler: async (ctx) => {
        const q = ctx.req.query as { contact?: string; reference?: string }
        const contact = q.contact?.trim() ? parseContact(q.contact) : null
        if (q.contact?.trim() && !contact)
          throw new ApiError('VALIDATION_FAILED', {
            fieldErrors: [{ field: 'querystring.contact', code: 'invalid_contact', message: '' }],
          })
        if (!contact && !q.reference?.trim())
          throw new ApiError('VALIDATION_FAILED', {
            fieldErrors: [{ field: 'querystring.contact', code: 'required', message: '' }],
          })
        return { body: matchesBody(await accessMatches(ctx.db, { contact, reference: q.reference ?? null })) }
      },
    },
    {
      ...staffRead,
      path: '/staff/access-help/:id',
      operationId: 'getAccessHelpRequest',
      summary: 'One request for help, with what it points to',
      description:
        'The Owner (customer_account.assist_recovery): one help request (the staff queue item opens it) with the ' +
        'accounts and projects its contact and reference point to, as the lookup shows them. NOT_FOUND when there is ' +
        'no such request.',
      permission: 'customer_account.assist_recovery',
      schema: { params: params('id'), response: { 200: DETAIL } },
      handler: async (ctx) => {
        const detail = await helpDetail(ctx.db, (ctx.req.params as { id: string }).id)
        if (!detail) throw new ApiError('NOT_FOUND')
        return { body: detailBody(detail) }
      },
    },
    {
      ...staffWrite,
      path: '/staff/access-help/:id/close',
      operationId: 'closeAccessHelpRequest',
      summary: 'Close a request for help',
      description:
        'The Owner (customer_account.assist_recovery), once: the outcome (access_restored, identity_not_verified, ' +
        'no_match, no_action; PROPOSED) and a note saying what was done and how identity was verified. A closed request ' +
        'is a CONFLICT (HELP_REQUEST_CLOSED). The staff queue item resolves. Audited. Returns the request.',
      permission: 'customer_account.assist_recovery',
      audit: 'access_help.close',
      resource: async ({ req, db }) => {
        const { id } = req.params as { id: string }
        const row = await db
          .selectFrom('identity.access_help_requests')
          .select('id')
          .where('id', '=', id)
          .executeTakeFirst()
        return row ? {} : null
      },
      schema: {
        params: params('id'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['outcome', 'note'],
          properties: {
            outcome: { type: 'string', enum: [...HELP_OUTCOMES] },
            note: { type: 'string', minLength: 1, maxLength: SECURITY_LIMITS.reason + 100 },
          },
        },
        response: { 200: DETAIL },
      },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const { id } = ctx.req.params as { id: string }
        const body = ctx.req.body as { outcome: HelpOutcome; note: string }
        const out = await closeHelp(tx, staffActor(ctx), id, body)
        await ctx.audit({
          target: { type: 'access_help_request', id, version: out.version },
          summary: { outcome: body.outcome },
          reason: body.note.trim(),
        })
        const detail = await helpDetail(tx, id)
        if (!detail) throw new ApiError('NOT_FOUND')
        return { body: detailBody(detail) }
      },
    },
    {
      ...staffWrite,
      path: '/staff/customer-accounts/:accountId/sign-out-everywhere',
      operationId: 'revokeCustomerAccountSessions',
      summary: 'End every session of a customer account',
      description:
        'The Owner (customer_account.revoke_sessions; OWN-DEC-198 F2), for example after a suspected compromise: every ' +
        'session of the account ends at once; the customer signs in again with a code to a verified contact. A written ' +
        'reason is required and audited. An unknown or closed account is NOT_FOUND.',
      permission: 'customer_account.revoke_sessions',
      audit: 'customer_account.revoke_sessions',
      resource: accountResource,
      schema: {
        params: params('accountId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['reason'],
          properties: { reason: { type: 'string', minLength: 1, maxLength: SECURITY_LIMITS.reason + 100 } },
        },
        response: { 200: object({ endedSessions: INT }) },
      },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const { accountId } = ctx.req.params as { accountId: string }
        const reason = ownerText((ctx.req.body as { reason: string }).reason, 'body.reason', SECURITY_LIMITS.reason)
        const ended = await signOutEverywhere(tx, accountId)
        await ctx.audit({
          target: { type: 'customer_account', id: accountId },
          summary: { endedSessions: ended },
          reason,
        })
        return { body: { endedSessions: ended } }
      },
    },
    {
      ...staffWrite,
      path: '/staff/customer-accounts/:accountId/recovery',
      operationId: 'startCustomerAccountRecovery',
      summary: 'Start a staff-assisted recovery of a customer account',
      description:
        'The Owner (customer_account.assist_recovery; OWN-DEC-198 F4, HH-ID-11 "a documented, audited recovery ' +
        'process"), after verifying the person’s identity through the contact details on file: names the new sign-in ' +
        'email and records how identity was verified (evidence). Every session of the account ends at once (F2) and an ' +
        'earlier pending recovery of it is replaced. Nothing else changes until the customer signs in with a code sent ' +
        'to the new email, within 24 hours (PROPOSED): then the account takes that email and the old and the new ' +
        'address get the notice account.contact_changed. 400 invalid_email or unchanged; 409 email_in_use (another ' +
        'account has it) or recovery_pending (another account’s recovery names it); 503 while the notice cannot be ' +
        'sent. An unknown or closed account is NOT_FOUND. Audited.',
      permission: 'customer_account.assist_recovery',
      audit: 'customer_account.recovery_start',
      resource: accountResource,
      schema: {
        params: params('accountId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['email', 'evidence'],
          properties: {
            email: { type: 'string', minLength: 3, maxLength: 320 },
            evidence: { type: 'string', minLength: 1, maxLength: SECURITY_LIMITS.evidence + 100 },
            helpRequestId: { anyOf: [{ type: 'null' }, UUID] },
          },
        },
        response: { 201: object({ recoveryId: STRING, endedSessions: INT, expiresAt: DATE_TIME }) },
      },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const { accountId } = ctx.req.params as { accountId: string }
        const body = ctx.req.body as { email: string; evidence: string; helpRequestId?: string | null }
        const out = await startRecovery(tx, deps.codeKey, staffActor(ctx), {
          accountId,
          email: body.email,
          evidence: body.evidence,
          helpRequestId: helpRequestId(body),
        })
        // The new email stays in the recovery record; the audit names the recovery, never the address.
        await ctx.audit({
          target: { type: 'customer_account', id: accountId },
          summary: { recovery: out.recoveryId, endedSessions: out.endedSessions, helpRequest: helpRequestId(body) },
          reason: body.evidence.trim(),
        })
        return {
          status: 201,
          body: {
            recoveryId: out.recoveryId,
            endedSessions: out.endedSessions,
            expiresAt: out.expiresAt.toISOString(),
          },
        }
      },
    },
    {
      ...staffWrite,
      path: '/staff/customer-accounts/:accountId/recovery/cancel',
      operationId: 'cancelCustomerAccountRecovery',
      summary: 'Cancel a pending staff-assisted recovery',
      description:
        'The Owner (customer_account.assist_recovery): the account’s pending recovery ends; its new email can no ' +
        'longer sign in. Without a pending recovery, a CONFLICT (NO_PENDING_RECOVERY). Audited.',
      permission: 'customer_account.assist_recovery',
      audit: 'customer_account.recovery_cancel',
      resource: accountResource,
      schema: {
        params: params('accountId'),
        body: { type: 'object', additionalProperties: false, properties: {} },
        response: { 200: object({ recoveryId: STRING }) },
      },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const { accountId } = ctx.req.params as { accountId: string }
        const id = await cancelRecovery(tx, staffActor(ctx), accountId)
        if (!id)
          throw new ApiError('CONFLICT', {
            fieldErrors: [{ field: 'recovery', code: 'NO_PENDING_RECOVERY', message: '' }],
          })
        await ctx.audit({ target: { type: 'customer_account', id: accountId }, summary: { recovery: id } })
        return { body: { recoveryId: id } }
      },
    },
    {
      ...staffWrite,
      path: '/staff/projects/:projectId/access-link',
      operationId: 'sendProjectAccessLink',
      summary: 'Send a new access link to the project’s contact on file',
      description:
        'The Owner (project_access.send_link; OWN-DEC-198 F5, F6), after verifying the person’s identity: a new ' +
        'single-project link (24 hours, access.grants) for the contact on file of the project’s newest request, sent ' +
        'with the automatic message project.access_link after commit, never to any other address. This is how staff ' +
        'restore access, also after a link staff revoked, and it does not count against the customer’s own reissue ' +
        'limit. Older links keep their own expiry. The evidence (how identity was verified) is required and audited. ' +
        '503 while a link cannot be sent (the code key, access.grants, access.recovery or the message wording). An ' +
        'unknown project is NOT_FOUND.',
      permission: 'project_access.send_link',
      audit: 'project_access.staff_reissue',
      resource: async ({ req, db }) => {
        const { projectId } = req.params as { projectId: string }
        const p = await db.selectFrom('crm.projects').select('id').where('id', '=', projectId).executeTakeFirst()
        return p ? { projectId: p.id } : null
      },
      schema: {
        params: params('projectId'),
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['evidence'],
          properties: {
            evidence: { type: 'string', minLength: 1, maxLength: SECURITY_LIMITS.evidence + 100 },
            helpRequestId: { anyOf: [{ type: 'null' }, UUID] },
          },
        },
        response: { 201: object({ grantId: STRING, expiresAt: DATE_TIME, sentTo: STRING }) },
      },
      handler: async (ctx) => {
        const tx = ctx.tx as Tx
        const { projectId } = ctx.req.params as { projectId: string }
        const body = ctx.req.body as { evidence: string; helpRequestId?: string | null }
        const evidence = ownerText(body.evidence, 'body.evidence', SECURITY_LIMITS.evidence)
        const out = await sendLinkToContactOnFile(tx, deps.codeKey, { projectId, httpRequestId: httpId(ctx) })
        await ctx.audit({
          target: { type: 'project_access_grant', id: out.grantId },
          summary: { project: projectId, helpRequest: helpRequestId(body) },
          reason: evidence,
        })
        return {
          status: 201,
          body: { grantId: out.grantId, expiresAt: out.expiresAt.toISOString(), sentTo: out.sentTo },
        }
      },
    },
  ]
}
