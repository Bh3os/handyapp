// Customer account security (TSK-0149; OWN-DEC-198 F2, F4, F5, F6; HH-ID-11, HH-ID-09, HH-ID-03, HH-ID-04,
// ENT-CustomerAccount, ENT-ProjectAccessGrant, ENT-AuditEvent, RULE-SERVER-AUTHZ). Migration 0100 keeps the records
// true whatever path writes.
// - F2, security-triggered global sign-out: ordinary device sessions stay independent (a new sign-in replaces only
//   this browser's session; Sign Out ends only this one). A security event ends every session of the account at once:
//   the customer's Sign out everywhere, the Owner's revocation after a suspected compromise (with a written reason),
//   and the start of a staff-assisted recovery.
// - F4, the secure alternative when phone recovery is not available (texts off until A2P 10DLC, no released text
//   wording, or the phone lost too): the visitor asks HandyHub for help (help.ts); the Owner verifies the person's
//   identity through the contact details on file and starts a staff-assisted recovery with a new sign-in email. Nothing
//   changes until the customer enters the code sent to that email at sign-in (accounts.ts completeRecovery), so the new
//   address is verified by its owner (F3); the old address gets the notice of MESSAGE 21. A recovery expires after
//   RECOVERY_HOURS (PROPOSED) and the Owner may cancel it; one pending recovery per account and per email.
// - F5, F6, the secure alternative at the reissue limits or after staff revoked a link: the Owner, after verifying
//   identity, sends a new link for that one project to its contact on file (issued_reason staff_reissue), never to a
//   value the visitor typed. The customer's own reissue keeps its limits and still never restores a link staff revoked.
// - What the Owner sees to help: the active accounts whose sign-in value is the typed one, and the projects whose
//   reference or contact on file matches, with the state of their newest link and today's reissues. Staff only; the
//   visitor's answer never depends on it.
// Every action is audited by its route (the reason or the identity evidence in the audit reason, never a code, link or
// token).
import type { Db, Tx } from '@handyhub/db'
import type { StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'
import { loadConfig } from '../../platform/config/index.js'
import { outbox } from '../../platform/outbox.js'
import { issueGrant } from '../access/grants.js'
import { ACCESS_REQUESTED_EVENT } from '../access/link-message.js'
import { reissueMissing, type ContactValue } from '../access/recovery.js'
import {
  maskForCustomer,
  normaliseDestination,
  revokeAccountSessions,
  type CodeKeySettings,
} from '../identity/index.js'
import { accountByValue, emailChangeMissing, lockValue } from './accounts.js'

/** PROPOSED (no owner value): how long a staff-assisted recovery waits for the code to its new email. */
export const RECOVERY_HOURS = 24
/** PROPOSED limits of the Owner's written reason and identity evidence. */
export const SECURITY_LIMITS = { reason: 2000, evidence: 2000 } as const

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })
const invalid = (f: string, code: string) => new ApiError('VALIDATION_FAILED', { fieldErrors: [field(f, code)] })
const conflict = (f: string, code: string) => new ApiError('CONFLICT', { fieldErrors: [field(f, code)] })

/** A required text of the Owner's (trimmed, inner whitespace kept), or a VALIDATION_FAILED naming the field. */
export function ownerText(value: string | null | undefined, f: string, max: number): string {
  const v = (value ?? '').trim()
  if (v === '') throw invalid(f, 'required')
  if (v.length > max) throw invalid(f, 'TOO_LONG')
  return v
}

// ---------------------------------------------------------------------------------------------------------------
// F2: every session of an account at once

/** Ends every live session of the account (security_revoked); returns how many ended. */
export async function signOutEverywhere(tx: Tx, accountId: string, now: Date = new Date()): Promise<number> {
  if (!tx.isTransaction) throw new Error('signOutEverywhere runs inside the business transaction (withTx)')
  return revokeAccountSessions(tx, accountId, 'security_revoked', { now })
}

/** Whether an active account with this ID exists (the staff routes' record check). */
export async function activeAccount(db: Db | Tx, accountId: string): Promise<boolean> {
  const row = await db
    .selectFrom('identity.customer_accounts')
    .select('id')
    .where('id', '=', accountId)
    .where('state', '=', 'active')
    .executeTakeFirst()
  return row !== undefined
}

// ---------------------------------------------------------------------------------------------------------------
// F4: the Owner's staff-assisted recovery

export type RecoveryStarted = { recoveryId: string; endedSessions: number; expiresAt: Date }

/**
 * Starts a staff-assisted recovery of an active account after the Owner verified the person's identity: names the new
 * sign-in email (a code to it completes the recovery at sign-in), records how identity was verified, ends every session
 * of the account (F2) and replaces any earlier pending recovery of it. NOT_CONFIGURED while the notice to the old email
 * cannot be sent (the same rule as the customer's own email change).
 */
export async function startRecovery(
  tx: Tx,
  key: CodeKeySettings,
  actor: StaffActor,
  input: { accountId: string; email: string; evidence: string; helpRequestId?: string | null; now?: Date },
): Promise<RecoveryStarted> {
  if (!tx.isTransaction) throw new Error('startRecovery runs inside the business transaction (withTx)')
  if ((await emailChangeMissing(tx, key)).length > 0) throw new ApiError('NOT_CONFIGURED')
  const now = input.now ?? new Date()
  const email = normaliseDestination('email', input.email)
  if (!email) throw invalid('body.email', 'invalid_email')
  const evidence = ownerText(input.evidence, 'body.evidence', SECURITY_LIMITS.evidence)
  await lockValue(tx, email)
  const account = await tx
    .selectFrom('identity.customer_accounts')
    .select(['id', 'sign_in_email'])
    .where('id', '=', input.accountId)
    .where('state', '=', 'active')
    .forUpdate()
    .executeTakeFirst()
  if (!account) throw new ApiError('NOT_FOUND')
  if (account.sign_in_email === email) throw invalid('body.email', 'unchanged')
  const holder = await accountByValue(tx, { channel: 'email', value: email })
  if (holder) throw conflict('body.email', 'email_in_use')
  if (input.helpRequestId) {
    const help = await tx
      .selectFrom('identity.access_help_requests')
      .select('id')
      .where('id', '=', input.helpRequestId)
      .executeTakeFirst()
    if (!help) throw invalid('body.helpRequestId', 'NOT_FOUND')
  }
  // An earlier pending recovery of this account, and an expired one of this email, end here.
  await tx
    .updateTable('identity.customer_account_recoveries')
    .set({ state: 'cancelled', cancelled_by: actor.userId, cancelled_at: now })
    .where('state', '=', 'pending')
    .where((eb) =>
      eb.or([eb('account_id', '=', account.id), eb.and([eb('new_email', '=', email), eb('expires_at', '<=', now)])]),
    )
    .execute()
  const other = await tx
    .selectFrom('identity.customer_account_recoveries')
    .select('id')
    .where('state', '=', 'pending')
    .where('new_email', '=', email)
    .executeTakeFirst()
  if (other) throw conflict('body.email', 'recovery_pending')
  const expiresAt = new Date(now.getTime() + RECOVERY_HOURS * 3_600_000)
  const row = await tx
    .insertInto('identity.customer_account_recoveries')
    .values({
      account_id: account.id,
      help_request_id: input.helpRequestId ?? null,
      new_email: email,
      identity_evidence: evidence,
      started_by: actor.userId,
      started_at: now,
      expires_at: expiresAt,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const endedSessions = await revokeAccountSessions(tx, account.id, 'security_revoked', { now })
  return { recoveryId: row.id, endedSessions, expiresAt }
}

/** Cancels the account's pending recovery; false when there is none. */
export async function cancelRecovery(tx: Tx, actor: StaffActor, accountId: string, now = new Date()) {
  const r = await tx
    .updateTable('identity.customer_account_recoveries')
    .set({ state: 'cancelled', cancelled_by: actor.userId, cancelled_at: now })
    .where('account_id', '=', accountId)
    .where('state', '=', 'pending')
    .returning('id')
    .executeTakeFirst()
  return r?.id ?? null
}

// ---------------------------------------------------------------------------------------------------------------
// F5, F6: a new link to the contact on file, sent by the Owner

export type LinkSent = { grantId: string; expiresAt: Date; sentTo: string }

/**
 * Issues a new grant for the project to its contact on file (the newest request's contact) and sends it with the
 * automatic message project.access_link after commit. Whatever revoked the earlier links, this is staff restoring
 * access. NOT_CONFIGURED while a link cannot be sent (the code key, access.grants, access.recovery or the wording).
 */
export async function sendLinkToContactOnFile(
  tx: Tx,
  key: CodeKeySettings,
  input: { projectId: string; httpRequestId: string; now?: Date },
): Promise<LinkSent> {
  if (!tx.isTransaction) throw new Error('sendLinkToContactOnFile runs inside the business transaction (withTx)')
  if ((await reissueMissing(tx, key)).length > 0) throw new ApiError('NOT_CONFIGURED')
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`access_reissue:${input.projectId}`}))`.execute(tx)
  const onFile = await tx
    .selectFrom('intake.requests as r')
    .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
    .select(['r.id as requestId', 'c.id as contactId', 'c.email'])
    .where('r.project_id', '=', input.projectId)
    .orderBy('r.submitted_at', 'desc')
    .limit(1)
    .executeTakeFirst()
  if (!onFile) throw new ApiError('NOT_FOUND')
  const issued = await issueGrant(tx, key, {
    projectId: input.projectId,
    contactId: onFile.contactId,
    requestId: onFile.requestId,
    reason: 'staff_reissue',
    ...(input.now ? { now: input.now } : {}),
  })
  if (!issued) throw new ApiError('NOT_CONFIGURED')
  await outbox.add(tx, {
    type: ACCESS_REQUESTED_EVENT,
    aggregate: { type: 'project_access_grant', id: issued.grant.id },
    idempotencyKey: `${ACCESS_REQUESTED_EVENT}:${issued.grant.id}`,
    requestId: input.httpRequestId,
  })
  return { grantId: issued.grant.id, expiresAt: issued.grant.expiresAt, sentTo: maskForCustomer('email', onFile.email) }
}

// ---------------------------------------------------------------------------------------------------------------
// What the Owner sees to help (staff only)

export type AccountMatch = {
  id: string
  email: string | null
  phone: string | null
  createdAt: Date
  liveSessions: number
  projects: string[]
  recovery: { id: string; email: string; expiresAt: Date } | null
}

export type ProjectMatch = {
  id: string
  reference: string
  /** How it matched: the typed reference, or the email or phone of its contact on file. */
  matchedBy: ('reference' | 'email' | 'phone')[]
  contact: { name: string; email: string; phone: string }
  link: { state: 'live' | 'expired' | 'revoked' | 'none'; revokeReason: string | null; expiresAt: Date | null }
  reissuesToday: number
  reissueLimit: number | null
}

export type AccessMatches = { accounts: AccountMatch[]; projects: ProjectMatch[] }

const MATCHES_SHOWN = 20

/** The accounts and projects a typed contact (and reference) points to, for the Owner's identity check. */
export async function accessMatches(
  db: Db | Tx,
  query: { contact: ContactValue | null; reference: string | null },
  now: Date = new Date(),
): Promise<AccessMatches> {
  const { contact } = query
  const reference = query.reference?.trim().toUpperCase() || null
  const accountRows = contact
    ? await db
        .selectFrom('identity.customer_accounts')
        .select(['id', 'sign_in_email', 'sign_in_phone', 'created_at'])
        .where('state', '=', 'active')
        .where(contact.channel === 'email' ? 'sign_in_email' : 'sign_in_phone', '=', contact.value)
        .limit(MATCHES_SHOWN)
        .execute()
    : []
  const accounts: AccountMatch[] = []
  for (const a of accountRows) {
    const sessions = await db
      .selectFrom('identity.customer_sessions')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('account_id', '=', a.id)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', now)
      .executeTakeFirst()
    const links = await db
      .selectFrom('identity.customer_identity_links as l')
      .innerJoin('crm.projects as p', 'p.id', 'l.project_id')
      .select('p.reference')
      .where('l.account_id', '=', a.id)
      .where('l.state', '=', 'active')
      .orderBy('l.decided_at')
      .execute()
    const recovery = await db
      .selectFrom('identity.customer_account_recoveries')
      .select(['id', 'new_email', 'expires_at'])
      .where('account_id', '=', a.id)
      .where('state', '=', 'pending')
      .where('expires_at', '>', now)
      .executeTakeFirst()
    accounts.push({
      id: a.id,
      email: a.sign_in_email,
      phone: a.sign_in_phone,
      createdAt: a.created_at,
      liveSessions: Number(sessions?.n ?? 0),
      projects: links.map((l) => l.reference),
      recovery: recovery ? { id: recovery.id, email: recovery.new_email, expiresAt: recovery.expires_at } : null,
    })
  }

  // Projects by the typed reference, or by the email or phone of a request's contact.
  const projectIds = new Set<string>()
  if (reference) {
    const p = await db.selectFrom('crm.projects').select('id').where('reference', '=', reference).executeTakeFirst()
    if (p) projectIds.add(p.id)
  }
  if (contact) {
    const rows = await db
      .selectFrom('intake.requests as r')
      .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
      .select('r.project_id')
      .where(
        contact.channel === 'email'
          ? sql<boolean>`lower(btrim(c.email)) = ${contact.value}`
          : sql<boolean>`c.phone_e164 = ${contact.value}`,
      )
      .orderBy('r.submitted_at', 'desc')
      .limit(MATCHES_SHOWN)
      .execute()
    for (const r of rows) projectIds.add(r.project_id)
  }
  const recovery = (await loadConfig(db)).get('access.recovery')
  const projects: ProjectMatch[] = []
  for (const id of [...projectIds].slice(0, MATCHES_SHOWN)) {
    const onFile = await db
      .selectFrom('intake.requests as r')
      .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
      .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
      .select(['p.reference', 'c.full_name', 'c.email', 'c.phone_e164'])
      .where('r.project_id', '=', id)
      .orderBy('r.submitted_at', 'desc')
      .limit(1)
      .executeTakeFirst()
    if (!onFile) continue
    const newest = await db
      .selectFrom('identity.project_access_grants')
      .select(['expires_at', 'revoked_at', 'revoke_reason'])
      .where('project_id', '=', id)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst()
    const reissues = await db
      .selectFrom('identity.project_access_grants')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('project_id', '=', id)
      .where('issued_reason', '=', 'reissue')
      .where('created_at', '>', new Date(now.getTime() - 86_400_000))
      .executeTakeFirst()
    const email = normaliseDestination('email', onFile.email) ?? onFile.email.toLowerCase()
    projects.push({
      id,
      reference: onFile.reference,
      matchedBy: [
        ...(reference === onFile.reference ? (['reference'] as const) : []),
        ...(contact?.channel === 'email' && contact.value === email ? (['email'] as const) : []),
        ...(contact?.channel === 'phone' && contact.value === onFile.phone_e164 ? (['phone'] as const) : []),
      ],
      contact: { name: onFile.full_name, email: onFile.email, phone: onFile.phone_e164 },
      link: !newest
        ? { state: 'none', revokeReason: null, expiresAt: null }
        : {
            state: newest.revoked_at ? 'revoked' : newest.expires_at.getTime() > now.getTime() ? 'live' : 'expired',
            revokeReason: newest.revoke_reason,
            expiresAt: newest.expires_at,
          },
      reissuesToday: Number(reissues?.n ?? 0),
      reissueLimit: recovery.state === 'CONFIGURED' ? recovery.value.maxReissuesPerProjectPerDay : null,
    })
  }
  return { accounts, projects }
}
