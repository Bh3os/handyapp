// The access link landing's server side (TSK-0034; HH-ID-05, HH-ID-04, HH-INT-13, HH-ID-03, HH-ID-06, OWN-DEC-96,
// OWN-DEC-97, RULE-SERVER-AUTHZ).
// - Opening a link (POST, after the visitor pressed Open) only names where a code can go: the grant's own contact,
//   masked; email always, the phone only by text and only with that request's own current SMS opt-in (HH-INT-22,
//   OQ-PHONE-VERIFY-SMS-OPT-IN). It changes nothing.
// - The code is TSK-0016's one-time code (purpose project_access, subject `grant:<id>:<channel>`), sent to the
//   contact's current value as the automatic message contact.verification_code, with its configured lifetime and
//   attempt, resend and per-address limits.
// - The exchange (POST with the code) is the only step that opens anything: it records the grant's verified time,
//   records that exact value as verified on the contact (the same proof as on the receipt), and starts a new customer
//   session for the grant's one project, replacing any session the browser had. Nothing else is attached: other
//   projects with the same email or phone stay unlinked (HH-ID-03, T20).
// - Receipt (TSK-0033): a code entered on the receipt is the same verified exchange, so it starts the same
//   single-project session from the project's live grant. A verified email change there first revokes the project's
//   grants (ENT-ProjectAccessGrant: revoked on a contact change; their sessions end) and issues a new grant for the
//   new value; that grant's link is not sent (only the listed triggers send it, FACT-AUTOMATIC-MESSAGES #3).
import type { Db, Tx } from '@handyhub/db'
import {
  issueCode,
  maskForCustomer,
  normaliseDestination,
  startCustomerSession,
  verifyCode,
  type CodeKeySettings,
  type StartedSession,
} from '../identity/index.js'
import { currentConsent } from '../notifications/index.js'
import { recordChannelVerified, type ContactChannel } from '../verification/contact-verification.js'
import { issueGrant, liveGrantOfProject, markVerified, revokeProjectGrants, type Grant } from './grants.js'

const PURPOSE = 'project_access' as const
const codeChannel = (c: ContactChannel) => (c === 'email' ? 'email' : 'sms') as 'email' | 'sms'
export const grantSubject = (grantId: string, channel: ContactChannel) => `grant:${grantId}:${channel}`

export type AccessChannel = { channel: ContactChannel; destination: string }

type Target = { contactId: string; email: string; phone: string; textsAllowed: boolean }

async function targetOf(db: Db | Tx, grant: Grant): Promise<Target> {
  const contact = await db
    .selectFrom('crm.contacts')
    .select(['id', 'email', 'phone_e164'])
    .where('id', '=', grant.contactId)
    .executeTakeFirstOrThrow()
  const request = await db
    .selectFrom('intake.requests')
    .select(['sms_opt_in'])
    .where('id', '=', grant.requestId)
    .executeTakeFirstOrThrow()
  const textsAllowed =
    request.sms_opt_in && (await currentConsent(db, 'sms', contact.phone_e164, 'transactional_sms')) === 'granted'
  return {
    contactId: contact.id,
    email: normaliseDestination('email', contact.email) ?? contact.email.toLowerCase(),
    phone: contact.phone_e164,
    textsAllowed,
  }
}

const valueOf = (t: Target, channel: ContactChannel) => (channel === 'email' ? t.email : t.phone)

/** Where the grant's code can go, masked; nothing about the project, the request or any other record. */
export async function accessChannels(db: Db | Tx, grant: Grant): Promise<AccessChannel[]> {
  const t = await targetOf(db, grant)
  return [
    { channel: 'email' as const, destination: maskForCustomer('email', t.email) },
    ...(t.textsAllowed ? [{ channel: 'phone' as const, destination: maskForCustomer('sms', t.phone) }] : []),
  ]
}

export type AccessSendResult =
  | { status: 'sent'; channel: ContactChannel; sentTo: string; expiresAt: Date }
  | { status: 'sms_not_permitted' }
  | { status: 'rate_limited'; retryAfterSeconds: number }
  | { status: 'not_configured'; missing: string[] }

export async function sendAccessCode(
  tx: Tx,
  key: CodeKeySettings,
  input: { grant: Grant; channel: ContactChannel; clientIp?: string; httpRequestId: string; now?: Date },
): Promise<AccessSendResult> {
  const t = await targetOf(tx, input.grant)
  if (input.channel === 'phone' && !t.textsAllowed) return { status: 'sms_not_permitted' }
  const issued = await issueCode(tx, key, {
    purpose: PURPOSE,
    channel: codeChannel(input.channel),
    destination: valueOf(t, input.channel),
    subjectRef: grantSubject(input.grant.id, input.channel),
    ...(input.clientIp ? { clientIp: input.clientIp } : {}),
    requestId: input.httpRequestId,
    ...(input.now ? { now: input.now } : {}),
  })
  if (issued.status === 'issued')
    return { status: 'sent', channel: input.channel, sentTo: issued.maskedDestination, expiresAt: issued.expiresAt }
  // The contact's own stored value is always a valid destination; anything else is not configured.
  if (issued.status === 'invalid_destination') return { status: 'not_configured', missing: ['contact'] }
  return issued
}

/** Starts the single-project guest session of a verified exchange. */
async function startGrantSession(
  tx: Tx,
  grant: Grant,
  verifiedAt: Date,
  replaces: string | undefined,
): Promise<StartedSession> {
  await markVerified(tx, grant.id, verifiedAt)
  return startCustomerSession(tx, {
    contactRef: grant.contactId,
    via: 'grant',
    projectIds: [grant.projectId],
    verifiedAt,
    grantId: grant.id,
    ...(replaces ? { replaces } : {}),
    now: verifiedAt,
  })
}

export type ExchangeResult = { ok: true; session: StartedSession; projectId: string } | { ok: false }

/**
 * The verified exchange: the code of the grant's channel, entered by POST. Every failure is the same neutral outcome
 * and its attempt is counted (the caller commits before answering it).
 */
export async function exchangeAccessCode(
  tx: Tx,
  key: CodeKeySettings,
  input: { grant: Grant; channel: ContactChannel; code: string; clientIp?: string; replaces?: string; now?: Date },
): Promise<ExchangeResult> {
  const now = input.now ?? new Date()
  const t = await targetOf(tx, input.grant)
  const destination = valueOf(t, input.channel)
  const result = await verifyCode(tx, key, {
    purpose: PURPOSE,
    destination,
    subjectRef: grantSubject(input.grant.id, input.channel),
    code: input.code,
    ...(input.clientIp ? { clientIp: input.clientIp } : {}),
    now,
  })
  if (!result.ok || result.destination !== destination) return { ok: false }
  await recordChannelVerified(tx, t.contactId, input.channel, destination)
  const session = await startGrantSession(tx, input.grant, now, input.replaces)
  return { ok: true, session, projectId: input.grant.projectId }
}

/**
 * The receipt's verified code (TSK-0033 route) starts the guest session of the request's project. A verified email
 * change first revokes the project's grants and issues a new one for the new value. Null when no grant can be used
 * (the code key or access.grants NOT CONFIGURED): the verification itself stands either way.
 */
export async function startReceiptSession(
  tx: Tx,
  key: CodeKeySettings,
  input: { requestId: string; changed: boolean; replaces?: string; now?: Date },
): Promise<StartedSession | null> {
  const now = input.now ?? new Date()
  const request = await tx
    .selectFrom('intake.requests')
    .select(['id', 'project_id', 'contact_id'])
    .where('id', '=', input.requestId)
    .executeTakeFirstOrThrow()
  let grant: Grant | null
  if (input.changed) {
    await revokeProjectGrants(tx, {
      projectId: request.project_id,
      reason: 'contact_changed',
      by: `customer:${request.contact_id}`,
      now,
    })
    const issued = await issueGrant(tx, key, {
      projectId: request.project_id,
      contactId: request.contact_id,
      requestId: request.id,
      reason: 'contact_change',
      now,
    })
    grant = issued?.grant ?? null
  } else {
    grant = await liveGrantOfProject(tx, request.project_id, now)
  }
  if (!grant) return null
  return startGrantSession(tx, grant, now, input.replaces)
}
