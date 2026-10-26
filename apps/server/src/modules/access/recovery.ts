// Neutral recovery for expired or revoked access (TSK-0035; HH-ID-09, HH-ID-06, HH-ID-04, HH-ID-03, HH-INT-11,
// ENT-ProjectAccessGrant, OWN-DEC-97 "Expired links offer a safe way to request new access", RULE-SERVER-AUTHZ).
// The visitor of a link that opens nothing (expired, revoked, unknown), or of /access without a link, asks for a new
// one with the email or mobile phone on the request; the project is named by the old link this tab still holds or by
// the request reference from the receipt. Neither opens anything.
// - Anti-enumeration (HH-ID-03, HH-ID-09): the answer is one and the same 202 whether or not a project, a contact or an
//   account exists, whether the details match, whether the per-project limit is reached and whether a link is sent.
//   Only what does not depend on any record differs: a malformed contact or a missing project reference is a 400, a
//   network over its limit a 429 for everyone, and while sending is NOT CONFIGURED (code key, access.grants,
//   access.recovery, or no released wording of project.access_link) a 503 for everyone, so nothing claims a link is
//   on its way that cannot be (no fake success).
// - On a match a new grant is issued for that one project and its contact on file (issued_reason 'reissue'), and the
//   automatic message project.access_link sends its link to that contact only (project.access_requested), never to
//   anything the visitor typed. Other projects of the same customer, email or phone are never touched or named
//   (HH-ID-09 "limited to that project"). Older grants keep their own expiry: a reissue never ends a session.
// - Limits: per client network by the route (ACCESS_REISSUE_RATE_LIMIT) and per project per day from access.recovery,
//   both decided as built by OWN-DEC-198 F5 (TSK-0124 recorded access.recovery version 2, no longer PROPOSED). A project whose newest grant staff revoked, or revoked for an
//   account deletion, gets no link on request (PROPOSED: staff decide when access comes back).
// - The contact value, the token and the reference are never logged or audited; the audit event says only whether a
//   link was issued and, for a known project, which.
import type { Db, Tx } from '@handyhub/db'
import { normalizeUsPhone } from '@handyhub/domain/request-form'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import { AUTHENTICATION, type RouteDef } from '../../api/route.js'
import { loadConfig } from '../../platform/config/index.js'
import { outbox } from '../../platform/outbox.js'
import { currentContext } from '../../platform/request-context.js'
import { normaliseDestination, type CodeKeySettings } from '../identity/index.js'
import { automaticPolicy, templateReadiness } from '../notifications/index.js'
import { issueGrant, projectOfAnyGrant } from './grants.js'
import { ACCESS_LINK_MESSAGE_KEY, ACCESS_REQUESTED_EVENT } from './link-message.js'
import { projectIdOf } from './projects.js'

/** Revocations after which a link is not sent on request (PROPOSED: staff or the owner restore access themselves). */
export const NO_REISSUE_AFTER = ['staff_revoked', 'account_deleted'] as const

export type ContactValue = { channel: 'email' | 'phone'; value: string }

/** The typed contact as stored (email lower-cased; a US phone in E.164), or null when it is neither. */
export function parseContact(raw: string): ContactValue | null {
  const s = raw.trim()
  if (s.includes('@')) {
    const email = normaliseDestination('email', s)
    return email ? { channel: 'email', value: email } : null
  }
  const phone = normalizeUsPhone(s)
  return phone ? { channel: 'phone', value: phone } : null
}

/** What sending a new link needs, none of it about the visitor's input; empty when everything is configured. */
export async function reissueMissing(db: Db | Tx, key: CodeKeySettings): Promise<string[]> {
  const config = await loadConfig(db)
  return [
    ...(key.state === 'configured' ? [] : key.missing),
    ...(config.get('access.grants').state === 'CONFIGURED' ? [] : ['access.grants']),
    ...(config.get('access.recovery').state === 'CONFIGURED' ? [] : ['access.recovery']),
    // TSK-0120: the access message must be on the automatic list, or no new link would be sent.
    ...(automaticPolicy(config).isAutomatic(ACCESS_LINK_MESSAGE_KEY) ? [] : ['messages.automatic']),
    // TSK-0119: the access message's released wording must also have its values supplied (templateReadiness).
    ...((await templateReadiness(db, ACCESS_LINK_MESSAGE_KEY, 'email', 'en')).state === 'ready'
      ? []
      : [ACCESS_LINK_MESSAGE_KEY]),
  ]
}

export type ReissueInput = {
  /** The old link this tab still holds (any state), or undefined. */
  token?: string | undefined
  /** The request reference from the receipt, when no old link is held. */
  reference?: string | undefined
  contact: ContactValue
  requestId: string
  now?: Date
}

/** Internal only: the route answers every one of these the same way. */
export type ReissueOutcome =
  | { status: 'not_configured'; missing: string[] }
  | { status: 'issued'; projectId: string; grantId: string }
  | { status: 'withheld'; projectId: string | null; why: 'no_match' | 'limit' | 'revoked' }

export async function requestReissue(tx: Tx, key: CodeKeySettings, input: ReissueInput): Promise<ReissueOutcome> {
  if (!tx.isTransaction) throw new Error('requestReissue runs inside the business transaction (withTx)')
  const missing = await reissueMissing(tx, key)
  if (missing.length > 0) return { status: 'not_configured', missing }
  const now = input.now ?? new Date()
  const projectId =
    (input.token ? await projectOfAnyGrant(tx, input.token) : null) ??
    (input.reference ? await projectIdOf(tx, input.reference) : null)
  if (!projectId) return { status: 'withheld', projectId: null, why: 'no_match' }
  // One reissue at a time per project, so the daily limit holds under concurrent requests.
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`access_reissue:${projectId}`}))`.execute(tx)

  const onFile = await tx
    .selectFrom('intake.requests as r')
    .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
    .select(['r.id as requestId', 'c.id as contactId', 'c.email', 'c.phone_e164'])
    .where('r.project_id', '=', projectId)
    .orderBy('r.submitted_at', 'desc')
    .limit(1)
    .executeTakeFirst()
  const matches =
    onFile !== undefined &&
    (input.contact.channel === 'email'
      ? normaliseDestination('email', onFile.email) === input.contact.value
      : onFile.phone_e164 === input.contact.value)
  if (!onFile || !matches) return { status: 'withheld', projectId, why: 'no_match' }

  const newest = await tx
    .selectFrom('identity.project_access_grants')
    .select('revoke_reason')
    .where('project_id', '=', projectId)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst()
  if (newest?.revoke_reason && (NO_REISSUE_AFTER as readonly string[]).includes(newest.revoke_reason))
    return { status: 'withheld', projectId, why: 'revoked' }

  const recovery = (await loadConfig(tx)).get('access.recovery')
  if (recovery.state !== 'CONFIGURED') return { status: 'not_configured', missing: ['access.recovery'] }
  const recent = await tx
    .selectFrom('identity.project_access_grants')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('project_id', '=', projectId)
    .where('issued_reason', '=', 'reissue')
    .where('created_at', '>', new Date(now.getTime() - 86_400_000))
    .executeTakeFirst()
  if (Number(recent?.n ?? 0) >= recovery.value.maxReissuesPerProjectPerDay)
    return { status: 'withheld', projectId, why: 'limit' }

  const issued = await issueGrant(tx, key, {
    projectId,
    contactId: onFile.contactId,
    requestId: onFile.requestId,
    reason: 'reissue',
    now,
  })
  if (!issued) return { status: 'not_configured', missing: ['access.grants'] }
  await outbox.add(tx, {
    type: ACCESS_REQUESTED_EVENT,
    aggregate: { type: 'project_access_grant', id: issued.grant.id },
    idempotencyKey: `${ACCESS_REQUESTED_EVENT}:${issued.grant.id}`,
    requestId: input.requestId,
  })
  return { status: 'issued', projectId, grantId: issued.grant.id }
}

/**
 * Per client network and hour, on top of the per-project limit of access.recovery: decided as built by OWN-DEC-198 F5
 * (10 per network per hour), recorded with access.recovery version 2 by TSK-0124.
 */
export const ACCESS_REISSUE_RATE_LIMIT = { bucket: 'public-access-reissue', limit: 10, windowSeconds: 3600 } as const

/** The one answer to every accepted reissue request, matched or not. */
export const REISSUE_ACCEPTED = { accepted: true } as const

export function reissueRoute(deps: { codeKey: CodeKeySettings }): RouteDef {
  return {
    method: 'POST',
    path: '/public/access/reissue',
    operationId: 'requestAccessLink',
    summary: 'Ask for a new project access link',
    description:
      'The neutral recovery of an expired, revoked or lost link (HH-ID-09). The body names the project by the old ' +
      'link this tab still holds (any state) or by the request reference, and gives the email or mobile phone on the ' +
      'request. Every well-formed request is the same 202 {accepted: true}, whether or not a project, contact or ' +
      'account exists, the details match, the per-project limit (access.recovery) is reached or a link is sent. On a ' +
      'match a new grant for that one project is issued and the automatic message project.access_link sends it to ' +
      'the contact on file only; other projects of the same customer, email or phone are never touched. A contact ' +
      'that is neither an email nor a US phone number, or no token and no reference, is a 400; while the code key, ' +
      'access.grants, access.recovery or the wording of project.access_link is NOT CONFIGURED, 503 for every caller.',
    actors: ['guest', 'customer'],
    permission: AUTHENTICATION,
    kind: 'write',
    expectedVersion: 'none',
    idempotency: 'none',
    pagination: false,
    test: 'test/integration/access-recovery.test.ts',
    rateLimit: ACCESS_REISSUE_RATE_LIMIT,
    audit: 'project_access.reissue',
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['contact'],
        properties: {
          token: { type: 'string', minLength: 1, maxLength: 200 },
          reference: { type: 'string', minLength: 1, maxLength: 40 },
          contact: { type: 'string', minLength: 1, maxLength: 320 },
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
      if (!ctx.tx) throw new Error('requestAccessLink runs in its write transaction')
      const body = ctx.req.body as { token?: string; reference?: string; contact: string }
      const contact = parseContact(body.contact)
      const fieldErrors = [
        ...(contact ? [] : [{ field: 'body.contact', code: 'invalid_contact', message: '' }]),
        ...(body.token || body.reference?.trim() ? [] : [{ field: 'body.reference', code: 'required', message: '' }]),
      ]
      if (!contact || fieldErrors.length > 0) throw new ApiError('VALIDATION_FAILED', { fieldErrors })
      const out = await requestReissue(ctx.tx, deps.codeKey, {
        token: body.token,
        reference: body.reference?.trim().toUpperCase(),
        contact,
        requestId: currentContext()?.requestId ?? ctx.req.id,
      })
      if (out.status === 'not_configured') throw new ApiError('NOT_CONFIGURED')
      // The contact, the token and the reference never reach the audit log.
      await ctx.audit(
        out.status === 'issued'
          ? { target: { type: 'project_access_grant', id: out.grantId }, summary: { project: out.projectId } }
          : {
              target: out.projectId ? { type: 'project', id: out.projectId } : { type: 'project_access_grant' },
              summary: { issued: false, why: out.why },
            },
      )
      return { status: 202, body: REISSUE_ACCEPTED }
    },
  }
}
