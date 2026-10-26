// Verified project claiming (TSK-0124; HH-ID-14, HH-ID-03, HH-ID-02, HH-ID-09, ENT-CustomerIdentityLink, OWN-DEC-160
// "securely associate existing guest projects with their verified account", OWN-DEC-198 F1, F5, F6,
// RULE-SERVER-AUTHZ).
// - A signed-in account customer adds a guest project to their account by naming it (the request reference from the
//   receipt) and the email or mobile phone on that request. A one-time code (purpose account_sign_in, the automatic
//   message contact.verification_code in the owner's wording, OWN-DEC-150) goes to the request's contact, and only to
//   the exact value a code already verified for that contact (OWN-DEC-198 F6: "previously verified" contacts): the
//   phone only by text, while texting is available and with the number's current SMS permission. Only the entered code
//   links the project, with the code as the link's evidence (claim_code). A name, an email or a phone that merely
//   matches never links anything, and the account's own sign-in values prove nothing about another project
//   (HH-ID-02, HH-ID-03).
// - Anti-enumeration (HH-ID-03, OWN-DEC-198 F6): every well-formed request gets the same answer whether or not the
//   reference names a project, the contact matches it, the contact is verified, the project is already in the account
//   or a code was sent; a wrong code and a claim that matches nothing are the same refusal. Only what depends on no
//   record differs: a malformed reference or contact (400), texts unavailable for every phone (400), a network over
//   its limit (429) and NOT CONFIGURED (503).
// - A project staff or the Owner took away is not restored by a claim (OWN-DEC-198 F5): when this account's link to it
//   was revoked, or its newest guest link was revoked by staff or for an account deletion, nothing is sent; staff
//   restore access (TSK-0149).
// - The project and every other record keep their IDs; nothing is copied or merged. The account session reads its
//   links on every request, so the claimed project opens at once, in its dashboard section (portal/overview.ts).
import { randomUUID } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import { REFERENCE_PATTERN } from '@handyhub/domain/request-form'
import { sql } from 'kysely'
import { NO_REISSUE_AFTER } from '../access/recovery.js'
import { issueCode, normaliseDestination, verifyCode, type CodeKeySettings } from '../identity/index.js'
import { currentConsent } from '../notifications/index.js'
import {
  ACCOUNT_CODE_PURPOSE,
  accountRef,
  signInMissing,
  textsAvailable,
  type AccountChannel,
  type ContactValue,
} from './accounts.js'

/** The code of one claim: this account, that project, that channel. */
export const claimSubject = (accountId: string, projectId: string, channel: AccountChannel) =>
  `claim:${accountId}:${projectId}:${channel}`
/** The subject an unmatched claim is checked against: no code is ever issued for it, so every code fails. */
const NO_PROJECT = (accountId: string, channel: AccountChannel) => `claim:${accountId}:none:${channel}`

/** Why nothing was sent (internal: the route answers every one of them the same way). */
export type ClaimWithheld = 'no_project' | 'no_match' | 'already_linked' | 'revoked'

type ClaimTarget = { projectId: string; requestId: string; customerId: string; contactId: string; value: string }
type Lookup = { projectId: string | null } & ({ target: ClaimTarget } | { target: null; why: ClaimWithheld })

/**
 * The request of the named project whose contact a code already verified for exactly this value, when the project may
 * be claimed into this account. Reads one project only: no other project, customer or account is read or named.
 */
async function lookup(db: Db | Tx, accountId: string, reference: string, contact: ContactValue): Promise<Lookup> {
  if (!REFERENCE_PATTERN.test(reference)) return { projectId: null, target: null, why: 'no_project' }
  const project = await db.selectFrom('crm.projects').select('id').where('reference', '=', reference).executeTakeFirst()
  if (!project) return { projectId: null, target: null, why: 'no_project' }
  const projectId = project.id
  const own = await db
    .selectFrom('identity.customer_identity_links')
    .select('state')
    .where('account_id', '=', accountId)
    .where('project_id', '=', projectId)
    .execute()
  if (own.some((l) => l.state !== 'revoked')) return { projectId, target: null, why: 'already_linked' }
  if (own.length > 0) return { projectId, target: null, why: 'revoked' }
  const newest = await db
    .selectFrom('identity.project_access_grants')
    .select('revoke_reason')
    .where('project_id', '=', projectId)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst()
  if (newest?.revoke_reason && (NO_REISSUE_AFTER as readonly string[]).includes(newest.revoke_reason))
    return { projectId, target: null, why: 'revoked' }

  const rows = await db
    .selectFrom('intake.requests as r')
    .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
    .innerJoin('crm.contacts as c', (j) =>
      j.onRef('c.id', '=', 'r.contact_id').onRef('c.customer_id', '=', 'p.customer_id'),
    )
    .select([
      'r.id as request_id',
      'p.customer_id',
      'c.id as contact_id',
      'c.email',
      'c.phone_e164',
      'c.email_verification',
      'c.email_verified_value',
      'c.phone_verification',
      'c.phone_verified_value',
      'r.sms_opt_in',
    ])
    .where('r.project_id', '=', projectId)
    .orderBy('r.submitted_at', 'desc')
    .execute()
  for (const r of rows) {
    const verified =
      contact.channel === 'email'
        ? r.email_verification === 'verified' &&
          r.email_verified_value === contact.value &&
          (normaliseDestination('email', r.email) ?? r.email.toLowerCase()) === contact.value
        : r.phone_verification === 'verified' &&
          r.phone_verified_value === contact.value &&
          r.phone_e164 === contact.value &&
          r.sms_opt_in &&
          (await currentConsent(db, 'sms', contact.value, 'transactional_sms')) === 'granted'
    if (verified)
      return {
        projectId,
        target: {
          projectId,
          requestId: r.request_id,
          customerId: r.customer_id,
          contactId: r.contact_id,
          value: contact.value,
        },
      }
  }
  return { projectId, target: null, why: 'no_match' }
}

/** Internal only: the route gives every `accepted` the same answer. */
export type ClaimCodeOutcome =
  | { status: 'not_configured'; missing: string[] }
  | { status: 'texts_unavailable' }
  | { status: 'accepted'; projectId: string | null; issued: boolean; why: ClaimWithheld | 'sent' | 'limited' }

/** Sends the claim code to the project's verified contact when the claim may go ahead; otherwise nothing is sent. */
export async function sendClaimCode(
  tx: Tx,
  key: CodeKeySettings,
  input: {
    accountId: string
    reference: string
    contact: ContactValue
    clientIp?: string
    httpRequestId: string
    now?: Date
  },
): Promise<ClaimCodeOutcome> {
  if (!tx.isTransaction) throw new Error('sendClaimCode runs inside the business transaction (withTx)')
  const missing = await signInMissing(tx, key)
  if (missing.length > 0) return { status: 'not_configured', missing }
  // OWN-DEC-198 F4: decided before any record is read, so the refusal is the same for every caller.
  if (input.contact.channel === 'phone' && !(await textsAvailable(tx))) return { status: 'texts_unavailable' }
  const found = await lookup(tx, input.accountId, input.reference, input.contact)
  if (!found.target) return { status: 'accepted', projectId: found.projectId, issued: false, why: found.why }
  const issued = await issueCode(tx, key, {
    purpose: ACCOUNT_CODE_PURPOSE,
    channel: input.contact.channel === 'email' ? 'email' : 'sms',
    destination: found.target.value,
    subjectRef: claimSubject(input.accountId, found.target.projectId, input.contact.channel),
    ...(input.clientIp ? { clientIp: input.clientIp } : {}),
    requestId: input.httpRequestId,
    ...(input.now ? { now: input.now } : {}),
  })
  if (issued.status === 'not_configured') return { status: 'not_configured', missing: issued.missing }
  const sent = issued.status === 'issued'
  return { status: 'accepted', projectId: found.projectId, issued: sent, why: sent ? 'sent' : 'limited' }
}

export type ClaimResult =
  | { ok: false; projectId: string | null }
  | { ok: true; projectId: string; requestId: string; reference: string; linkId: string; channel: AccountChannel }

/**
 * The entered claim code. A match, re-checked now (the project may have been linked or taken away since the code was
 * sent), links the project to the account once with the code as its evidence. A wrong code and a claim that matches
 * nothing are the same refusal; the attempt is counted either way.
 */
export async function claimProject(
  tx: Tx,
  key: CodeKeySettings,
  input: { accountId: string; reference: string; contact: ContactValue; code: string; clientIp?: string; now?: Date },
): Promise<ClaimResult> {
  if (!tx.isTransaction) throw new Error('claimProject runs inside the business transaction (withTx)')
  const now = input.now ?? new Date()
  const found = await lookup(tx, input.accountId, input.reference, input.contact)
  const result = await verifyCode(tx, key, {
    purpose: ACCOUNT_CODE_PURPOSE,
    destination: input.contact.value,
    subjectRef: found.target
      ? claimSubject(input.accountId, found.target.projectId, input.contact.channel)
      : NO_PROJECT(input.accountId, input.contact.channel),
    code: input.code,
    ...(input.clientIp ? { clientIp: input.clientIp } : {}),
    now,
  })
  const target = found.target
  if (!target || !result.ok || result.destination !== target.value) return { ok: false, projectId: found.projectId }
  // One claim of a project into an account at a time; the unique index keeps one live link in any case.
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`account_claim:${input.accountId}:${target.projectId}`}))`.execute(
    tx,
  )
  const again = await lookup(tx, input.accountId, input.reference, input.contact)
  if (!again.target) return { ok: false, projectId: found.projectId }
  const linkId = randomUUID()
  await tx
    .insertInto('identity.customer_identity_links')
    .values({
      id: linkId,
      account_id: input.accountId,
      customer_id: target.customerId,
      contact_id: target.contactId,
      project_id: target.projectId,
      request_id: target.requestId,
      authority: 'owner',
      evidence: 'claim_code',
      evidence_channel: input.contact.channel,
      evidence_code_id: result.codeId,
      state: 'active',
      decided_by: accountRef(input.accountId),
      decided_at: now,
    })
    .execute()
  return {
    ok: true,
    projectId: target.projectId,
    requestId: target.requestId,
    reference: input.reference,
    linkId,
    channel: input.contact.channel,
  }
}
