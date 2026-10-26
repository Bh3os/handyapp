// The routes of saved properties, preferences and Request This Service Again (TSK-0113; HH-ID-12, HH-ID-03,
// OWN-DEC-113, RULE-SERVER-AUTHZ). See saved.ts.
//   GET  /customer/account/properties                         the addresses of the account's history, with its names
//   POST /customer/account/properties                         name the address of one of its projects
//   POST /customer/account/properties/:id                     rename
//   POST /customer/account/properties/:id/remove              remove the name (never the property)
//   GET  /customer/account/properties/:id/request             a new request at a saved property: what the form starts from
//   GET  /customer/account/projects/:reference/request-again  Request This Service Again: what the form starts from
//   GET  /customer/account/preferences                        the contact method and the permissions of its sign-in values
//   POST /customer/account/preferences                        the contact method new requests start with
//   POST /customer/account/permissions                        stop (or give back an email) permission
// Every route needs a live account session, like the account itself (index.ts): the account's own settings are not a
// project's, so the policy's customer column (scoped to projects) does not decide them; the route reads the account
// and its active links on every request instead, and anything outside them is NOT_FOUND. A guest-link session is
// NOT_FOUND; no session is 401. The audit log records what changed and for which property or permission, never an
// address, a name the customer typed or a contact value.
import { ApiError } from '../../api/errors.js'
import { AUTHENTICATION, type ApiContext, type RouteDef } from '../../api/route.js'
import { currentContext } from '../../platform/request-context.js'
import { isLegalVersion } from '../legal/index.js'
import { readSessionToken, resolveCustomerSession, type CustomerSession } from '../identity/index.js'
import { ACCOUNT_PREFERENCES, ACCOUNT_PROPERTIES, REQUEST_PREFILL } from '../records/index.js'
import {
  accountPreferences,
  accountProperties,
  CONTACT_METHODS,
  labelOf,
  LABEL_MAX,
  PERMISSIONS,
  removeProperty,
  renameProperty,
  repeatPrefill,
  saveProperty,
  savedPropertyPrefill,
  setPermission,
  setPreferredChannel,
  type AccountPermission,
  type ContactMethod,
} from './saved.js'

const TEST = 'test/integration/customer-saved-properties.test.ts'

/** PROPOSED (no owner value, OQ-SAVED-PROPERTIES-DETAILS): changes per client network and hour. */
export const ACCOUNT_SETTINGS_RATE_LIMIT = { bucket: 'account-settings', limit: 120, windowSeconds: 3600 } as const

const LABEL_FIELD = { type: 'string', minLength: 1, maxLength: 200 } as const
const REFERENCE_FIELD = { type: 'string', minLength: 1, maxLength: 40 } as const
const ID_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: { type: 'string', minLength: 1, maxLength: 64 } },
} as const
const REFERENCE_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['reference'],
  properties: { reference: REFERENCE_FIELD },
} as const

const fieldError = (field: string, code: string, error: 'VALIDATION_FAILED' | 'CONFLICT' = 'VALIDATION_FAILED') =>
  new ApiError(error, { fieldErrors: [{ field, code, message: '' }] })

/** A name as kept, or the 400 that says it is empty or longer than LABEL_MAX characters. */
function label(raw: string): string {
  const l = labelOf(raw)
  if (l === null) throw fieldError('body.label', 'invalid_label')
  return l
}

export function savedRoutes(): RouteDef[] {
  const base = {
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
  const read = { ...base, kind: 'read', method: 'GET', rateLimit: 'none', audit: 'none' } as const
  const write = { ...base, kind: 'write', method: 'POST', rateLimit: ACCOUNT_SETTINGS_RATE_LIMIT } as const
  /** The session as the resource check found it; a write reads it again inside its transaction. */
  const sessionOf = async (ctx: ApiContext): Promise<CustomerSession & { accountId: string }> => {
    const s = ctx.tx ? await resolveCustomerSession(ctx.tx, readSessionToken(ctx.req)) : ctx.req.customerSession
    if (!s?.accountId) throw new ApiError('NOT_FOUND')
    return s as CustomerSession & { accountId: string }
  }
  const target = (session: { accountId: string }) => ({ type: 'customer_account', id: session.accountId })
  const properties = async (ctx: ApiContext, session: CustomerSession) =>
    ACCOUNT_PROPERTIES.project({ properties: await accountProperties(ctx.tx ?? ctx.db, session) })
  const preferences = async (ctx: ApiContext, session: CustomerSession) => {
    const p = await accountPreferences(ctx.tx ?? ctx.db, session)
    if (!p) throw new ApiError('NOT_FOUND')
    return ACCOUNT_PREFERENCES.project(p)
  }

  const list: RouteDef = {
    ...read,
    path: '/customer/account/properties',
    operationId: 'getAccountProperties',
    summary: 'Saved properties',
    description:
      'For a live account session (HH-ID-12): the addresses of the projects the account’s active links open, one per ' +
      'address (case and spacing aside), each named by its latest project’s reference, with the customer’s own name ' +
      'for it (saved) or null. Named ones first, by name. The address is the property record’s as it reads now; ' +
      'nothing of another account, customer or project is read. A guest-link session is NOT_FOUND; no session is 401.',
    projection: ACCOUNT_PROPERTIES,
    schema: { response: { 200: ACCOUNT_PROPERTIES.schema } },
    handler: async (ctx) => ({ body: await properties(ctx, await sessionOf(ctx)) }),
  }

  const save: RouteDef = {
    ...write,
    path: '/customer/account/properties',
    operationId: 'saveAccountProperty',
    summary: 'Save a property',
    description:
      'Names the address of one of the account’s projects (named by its reference) with a name of 1 to ' +
      `${LABEL_MAX} characters (trimmed). A reference the account’s links do not open is NOT_FOUND like a missing ` +
      'one; an address already named is a 409 (body.reference, already_saved); a name the account already uses, ' +
      'case aside, a 409 (body.label, label_in_use); an empty or too long name a 400 (invalid_label). Answers the ' +
      'saved properties. The property record itself never changes here.',
    audit: 'customer_account.save_property',
    projection: ACCOUNT_PROPERTIES,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['reference', 'label'],
        properties: { reference: REFERENCE_FIELD, label: LABEL_FIELD },
      },
      response: { 200: ACCOUNT_PROPERTIES.schema },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('saveAccountProperty runs in its write transaction')
      const session = await sessionOf(ctx)
      const body = ctx.req.body as { reference: string; label: string }
      const out = await saveProperty(ctx.tx, session, {
        reference: body.reference.trim().toUpperCase(),
        label: label(body.label),
      })
      if (!out.ok) {
        if (out.why === 'not_found') throw new ApiError('NOT_FOUND')
        if (out.why === 'already_saved') throw fieldError('body.reference', 'already_saved', 'CONFLICT')
        throw fieldError('body.label', 'label_in_use', 'CONFLICT')
      }
      await ctx.audit({ target: target(session), summary: { savedProperty: out.id, property: out.propertyId } })
      return { body: await properties(ctx, session) }
    },
  }

  const rename: RouteDef = {
    ...write,
    path: '/customer/account/properties/:id',
    operationId: 'renameAccountProperty',
    summary: 'Rename a saved property',
    description:
      'Renames one of the account’s own saved properties while one of its linked projects is at that property ' +
      '(otherwise NOT_FOUND, like a missing one). The same name rules and refusals as saving. Answers the saved ' +
      'properties.',
    audit: 'customer_account.rename_property',
    projection: ACCOUNT_PROPERTIES,
    schema: {
      params: ID_PARAMS,
      body: { type: 'object', additionalProperties: false, required: ['label'], properties: { label: LABEL_FIELD } },
      response: { 200: ACCOUNT_PROPERTIES.schema },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('renameAccountProperty runs in its write transaction')
      const session = await sessionOf(ctx)
      const id = (ctx.req.params as { id: string }).id
      const out = await renameProperty(ctx.tx, session, { id, label: label((ctx.req.body as { label: string }).label) })
      if (!out.ok) {
        if (out.why === 'not_found') throw new ApiError('NOT_FOUND')
        throw fieldError('body.label', 'label_in_use', 'CONFLICT')
      }
      await ctx.audit({ target: target(session), summary: { savedProperty: id, property: out.propertyId } })
      return { body: await properties(ctx, session) }
    },
  }

  const remove: RouteDef = {
    ...write,
    path: '/customer/account/properties/:id/remove',
    operationId: 'removeAccountProperty',
    summary: 'Remove a saved property',
    description:
      'Removes the customer’s name for one of the account’s own saved properties (NOT_FOUND otherwise). The property ' +
      'record, its projects and every other record stay as they are. Answers the saved properties.',
    audit: 'customer_account.remove_property',
    projection: ACCOUNT_PROPERTIES,
    schema: { params: ID_PARAMS, response: { 200: ACCOUNT_PROPERTIES.schema } },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('removeAccountProperty runs in its write transaction')
      const session = await sessionOf(ctx)
      const id = (ctx.req.params as { id: string }).id
      const out = await removeProperty(ctx.tx, session, id)
      if (!out.ok) throw new ApiError('NOT_FOUND')
      await ctx.audit({ target: target(session), summary: { savedProperty: id, property: out.propertyId } })
      return { body: await properties(ctx, session) }
    },
  }

  const PREFILL_TEXT =
    'Nothing else of the earlier request is reused: no description, answer, note, photo, timing, estimate choice, ' +
    'price, discount, verification or consent (OWN-DEC-113: new pricing and appointments need review). The ' +
    'contact method is the account’s preference, or null. The form asks the customer to confirm the details are ' +
    'still current and sends repeatOf with the reference, which links the new request to that project.'

  const savedPrefill: RouteDef = {
    ...read,
    path: '/customer/account/properties/:id/request',
    operationId: 'getSavedPropertyRequest',
    summary: 'A new request at a saved property',
    description:
      'For one of the account’s own saved properties (NOT_FOUND otherwise): what the request form starts from, the ' +
      'property address and type as they read now and the contact name, email and phone of the latest linked ' +
      'project’s request at that property, with that project’s reference; no service is chosen. ' +
      PREFILL_TEXT,
    projection: REQUEST_PREFILL,
    schema: { params: ID_PARAMS, response: { 200: REQUEST_PREFILL.schema } },
    handler: async (ctx) => {
      const prefill = await savedPropertyPrefill(ctx.db, await sessionOf(ctx), (ctx.req.params as { id: string }).id)
      if (!prefill) throw new ApiError('NOT_FOUND')
      return { body: REQUEST_PREFILL.project(prefill) }
    },
  }

  const again: RouteDef = {
    ...read,
    path: '/customer/account/projects/:reference/request-again',
    operationId: 'getRequestAgain',
    summary: 'Request This Service Again',
    description:
      'For one of the projects the account’s active links open (any other reference, or a link that was revoked, is ' +
      'NOT_FOUND like a missing project, HH-ID-03): what the request form starts from, the services of that request ' +
      'the form still offers (in their order), whether it was “not sure”, the property address and type as they ' +
      'read now, and the request’s contact name, email and phone as they read now. ' +
      PREFILL_TEXT,
    projection: REQUEST_PREFILL,
    schema: { params: REFERENCE_PARAMS, response: { 200: REQUEST_PREFILL.schema } },
    handler: async (ctx) => {
      const reference = (ctx.req.params as { reference: string }).reference.trim().toUpperCase()
      const prefill = await repeatPrefill(ctx.db, await sessionOf(ctx), reference)
      if (!prefill) throw new ApiError('NOT_FOUND')
      return { body: REQUEST_PREFILL.project(prefill) }
    },
  }

  const getPreferences: RouteDef = {
    ...read,
    path: '/customer/account/preferences',
    operationId: 'getAccountPreferences',
    summary: 'Preferences',
    description:
      'For a live account session: the contact method new requests start with (null: none chosen), and for the ' +
      'account’s own verified sign-in email and phone (masked) the current state of each permission as the ' +
      'send-time checks read it (granted, withdrawn or none): marketing, optional follow-ups after a job (the ' +
      'satisfaction check and review requests) and, for the phone, texts (the SMS opt-in). Null for a value the ' +
      'account has none of.',
    projection: ACCOUNT_PREFERENCES,
    schema: { response: { 200: ACCOUNT_PREFERENCES.schema } },
    handler: async (ctx) => ({ body: await preferences(ctx, await sessionOf(ctx)) }),
  }

  const putChannel: RouteDef = {
    ...write,
    path: '/customer/account/preferences',
    operationId: 'setAccountPreferences',
    summary: 'Set the contact method new requests start with',
    description:
      'The contact method (email, call or text, or null for none) the request form starts with for this account. A ' +
      'preference only: each request still records its own choice, and texts still need the SMS opt-in on that ' +
      'request. Answers the preferences.',
    audit: 'customer_account.preferences',
    projection: ACCOUNT_PREFERENCES,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['preferredChannel'],
        properties: { preferredChannel: { anyOf: [{ type: 'null' }, { type: 'string', enum: CONTACT_METHODS }] } },
      },
      response: { 200: ACCOUNT_PREFERENCES.schema },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('setAccountPreferences runs in its write transaction')
      const session = await sessionOf(ctx)
      const channel = (ctx.req.body as { preferredChannel: ContactMethod | null }).preferredChannel
      const changed = await setPreferredChannel(ctx.tx, session.accountId, channel)
      await ctx.audit({ target: target(session), summary: { preferredChannel: channel, changed } })
      return { body: await preferences(ctx, session) }
    },
  }

  const putPermission: RouteDef = {
    ...write,
    path: '/customer/account/permissions',
    operationId: 'setAccountPermission',
    summary: 'Stop or give back a permission',
    description:
      'Records the customer’s own choice for one permission of the account’s own verified sign-in email or phone, as ' +
      'an append-only consent record (source portal) that the send-time checks honour at once (HH-COM-05). ' +
      'marketing and follow_ups on email or sms, texts on sms only (else 400 not_a_permission). Any of them may be ' +
      'stopped; stopping texts also ends the consent to verification codes by text, as STOP does. Only email ' +
      'permissions are given back here (PROPOSED): a text permission is given on the request form, the opt-in path ' +
      'of the A2P 10DLC registration (400 texts_on_request_form). Giving marketing back needs the published privacy ' +
      'notice version shown beside it (400 unknown_version). A value the account does not have is a 400 ' +
      '(no_destination). A choice already in effect records nothing. Answers the preferences.',
    audit: 'customer_account.permission',
    projection: ACCOUNT_PREFERENCES,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['channel', 'permission', 'granted'],
        properties: {
          channel: { type: 'string', enum: ['email', 'sms'] },
          permission: { type: 'string', enum: PERMISSIONS },
          // Consent is never inferred from a coerced value (as on the request form): only true or false pass.
          granted: { enum: [true, false] },
          privacyNoticeVersion: { type: 'string', pattern: '^[A-Za-z0-9._-]{1,40}$' },
        },
      },
      response: { 200: ACCOUNT_PREFERENCES.schema },
    },
    handler: async (ctx) => {
      if (!ctx.tx) throw new Error('setAccountPermission runs in its write transaction')
      const session = await sessionOf(ctx)
      const body = ctx.req.body as {
        channel: 'email' | 'sms'
        permission: AccountPermission
        granted: boolean
        privacyNoticeVersion?: string
      }
      if (body.channel === 'email' && body.permission === 'texts')
        throw fieldError('body.permission', 'not_a_permission')
      if (body.channel === 'sms' && body.granted) throw fieldError('body.granted', 'texts_on_request_form')
      if (
        body.granted &&
        body.permission === 'marketing' &&
        (body.privacyNoticeVersion === undefined ||
          !(await isLegalVersion(ctx.tx, 'legal.privacy_notice', body.privacyNoticeVersion)))
      )
        throw fieldError('body.privacyNoticeVersion', 'unknown_version')
      const out = await setPermission(ctx.tx, {
        accountId: session.accountId,
        channel: body.channel,
        permission: body.permission,
        granted: body.granted,
        ...(body.granted && body.privacyNoticeVersion ? { noticeVersion: body.privacyNoticeVersion } : {}),
        httpRequestId: currentContext()?.requestId ?? ctx.req.id,
      })
      if (!out.ok) throw fieldError(out.why === 'no_destination' ? 'body.channel' : 'body.permission', out.why)
      await ctx.audit({
        target: target(session),
        summary: { channel: body.channel, permission: body.permission, granted: body.granted, recorded: out.recorded },
      })
      return { body: await preferences(ctx, session) }
    },
  }

  return [list, save, rename, remove, savedPrefill, again, getPreferences, putChannel, putPermission]
}
