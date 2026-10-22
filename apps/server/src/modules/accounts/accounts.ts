// Optional customer accounts with passwordless sign-in (TSK-0036; HH-ID-10, HH-ID-11, HH-ID-03, HH-INT-14,
// ENT-CustomerAccount, ENT-CustomerIdentityLink, ENT-AuthIdentity, OWN-DEC-63, OWN-DEC-71, OWN-DEC-87, OWN-DEC-97,
// OWN-DEC-141, RULE-SERVER-AUTHZ).
// - No password and no identity provider: an account signs in with TSK-0016's one-time code (purpose
//   account_sign_in: hashed, 10 minutes, the configured attempt, resend and per-address limits), sent as the automatic
//   message contact.verification_code in the owner's wording (OWN-DEC-150), to the account's verified email, or by
//   text to its verified phone while that number's SMS permission is current (HH-INT-22).
// - Enrollment (receipt offer, HH-INT-14; or later from the project's guest link, HH-ID-10) starts from one request's
//   own contact: the guest picks a channel that is already verified for that exact value, a new code goes to it, and
//   only the entered code creates the account (or signs in to the one that value already belongs to) and links that
//   one project. Other projects, customers or contacts with the same email or phone are never read, named or linked
//   (HH-ID-03, T20); the request, project and every other record keep their IDs, and a second enrollment links
//   nothing twice.
// - Sign-in names a contact value; every well-formed request gets one answer whether or not an account has it, and a
//   code goes only to an account's own verified value (HH-ID-03 style). A wrong code and an unknown value are the
//   same refusal.
// - Sessions are TSK-0016's customer sessions (30 minutes idle, 8 hours in total, server-side revocation) with
//   via 'account'; the projects they open are the account's active links, read on every request.
// - A sign-in email change needs a fresh sign-in (authority over the account: through the old email, or through the
//   account's verified phone, the documented recovery path) and a code to the new email. It sends a notice to the old
//   email (HH-ID-11), ends every other session of the account and renews the current one, so the old email keeps no
//   access. Until the notice can be sent (OQ-ACCOUNT-CONTACT-NOTICE) the change is NOT CONFIGURED.
// - Closing an account (the Owner, after review: TSK-0100) ends sign-in, its sessions, its project links and the
//   guest links of its projects; business records stay (OWN-DEC-71).
import { randomUUID } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import { sql } from 'kysely'
import { loadConfig } from '../../platform/config/index.js'
import { outbox } from '../../platform/outbox.js'
import {
  issueCode,
  maskForCustomer,
  normaliseDestination,
  revokeAccountSessions,
  startCustomerSession,
  verifyCode,
  type CodeKeySettings,
  type CustomerSession,
  type StartedSession,
} from '../identity/index.js'
import { automaticPolicy, currentConsent, templateReadiness } from '../notifications/index.js'

export type AccountChannel = 'email' | 'phone'
export type ContactValue = { channel: AccountChannel; value: string }

export const ACCOUNT_CODE_PURPOSE = 'account_sign_in' as const
/** The message of the notice to the old value (HH-ID-11) and the committed event that triggers it. */
export const CONTACT_CHANGED_MESSAGE_KEY = 'account.contact_changed'
export const CONTACT_CHANGED_EVENT = 'customer_account.contact_changed'

const codeChannel = (c: AccountChannel) => (c === 'email' ? 'email' : 'sms') as 'email' | 'sms'
export const enrollmentSubject = (requestId: string, contactId: string, channel: AccountChannel) =>
  `enroll:${requestId}:${contactId}:${channel}`
export const signInSubject = (accountId: string, channel: AccountChannel) => `account:${accountId}:${channel}`
export const emailChangeSubject = (accountId: string) => `account:${accountId}:email_change`
/** The subject an unknown value is checked against: no code is ever issued for it, so every code fails. */
const NO_ACCOUNT = (channel: AccountChannel) => `account:none:${channel}`
/** The contact reference of an account session (customer_sessions.contact_ref, audit actor). */
export const accountRef = (accountId: string) => `account:${accountId}`

/** One lock per sign-in value, so two enrollments of the same value never create two accounts. */
async function lockValue(tx: Tx, value: string): Promise<void> {
  await sql`SELECT pg_advisory_xact_lock(hashtext(${`customer_account:${value}`}))`.execute(tx)
}

type AccountRow = { id: string; sign_in_email: string | null; sign_in_phone: string | null }

/** The active account a sign-in value belongs to. */
export async function accountByValue(db: Db | Tx, contact: ContactValue): Promise<AccountRow | undefined> {
  return db
    .selectFrom('identity.customer_accounts')
    .select(['id', 'sign_in_email', 'sign_in_phone'])
    .where('state', '=', 'active')
    .where(contact.channel === 'email' ? 'sign_in_email' : 'sign_in_phone', '=', contact.value)
    .executeTakeFirst()
}

/** Whether a text may go to a number now: a current transactional SMS permission (no STOP since, HH-INT-22). */
async function textsAllowed(db: Db | Tx, phone: string): Promise<boolean> {
  return (await currentConsent(db, 'sms', phone, 'transactional_sms')) === 'granted'
}

/** What every sign-in needs, none of it about the caller's input; empty when configured. */
export async function signInMissing(db: Db | Tx, key: CodeKeySettings): Promise<string[]> {
  const config = await loadConfig(db)
  return [
    ...(key.state === 'configured' ? [] : key.missing),
    ...(config.get('session.timings').state === 'CONFIGURED' ? [] : ['session.timings']),
    ...(config.get('verification.limits').state === 'CONFIGURED' ? [] : ['verification.limits']),
  ]
}

// ---------------------------------------------------------------------------------------------------------------
// Enrollment

/** The request and contact an enrollment starts from: the receipt's request, or the guest link's grant. */
export type EnrollmentSource = { requestId: string; contactId: string; via: 'receipt_offer' | 'project_link' }

type SourceContact = {
  requestId: string
  projectId: string
  customerId: string
  contactId: string
  /** The exact values a code already verified for this contact, or null. */
  email: string | null
  phone: string | null
}

async function sourceContact(db: Db | Tx, source: EnrollmentSource): Promise<SourceContact> {
  const row = await db
    .selectFrom('intake.requests as r')
    .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
    .innerJoin('crm.contacts as c', (j) =>
      j.on('c.id', '=', source.contactId).onRef('c.customer_id', '=', 'p.customer_id'),
    )
    .select([
      'r.id as request_id',
      'p.id as project_id',
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
    .where('r.id', '=', source.requestId)
    .executeTakeFirstOrThrow()
  const email = normaliseDestination('email', row.email) ?? row.email.toLowerCase()
  const emailVerified = row.email_verification === 'verified' && row.email_verified_value === email
  const phoneVerified =
    row.phone_verification === 'verified' &&
    row.phone_verified_value === row.phone_e164 &&
    row.sms_opt_in &&
    (await textsAllowed(db, row.phone_e164))
  return {
    requestId: row.request_id,
    projectId: row.project_id,
    customerId: row.customer_id,
    contactId: row.contact_id,
    email: emailVerified ? email : null,
    phone: phoneVerified ? row.phone_e164 : null,
  }
}

export type EnrollmentChannel = { channel: AccountChannel; destination: string }

/** The channels an account can be created with: the contact's own verified values (the phone only with texts). */
export async function enrollmentChannels(db: Db | Tx, source: EnrollmentSource): Promise<EnrollmentChannel[]> {
  const c = await sourceContact(db, source)
  return [
    ...(c.email ? [{ channel: 'email' as const, destination: maskForCustomer('email', c.email) }] : []),
    ...(c.phone ? [{ channel: 'phone' as const, destination: maskForCustomer('sms', c.phone) }] : []),
  ]
}

export type SendResult =
  | { status: 'sent'; channel: AccountChannel; sentTo: string; expiresAt: Date }
  | { status: 'not_verified' }
  | { status: 'rate_limited'; retryAfterSeconds: number }
  | { status: 'not_configured'; missing: string[] }

type CodeInput = { clientIp?: string; httpRequestId: string; now?: Date }

/** Sends the enrollment code to the contact's verified value of the channel. */
export async function sendEnrollmentCode(
  tx: Tx,
  key: CodeKeySettings,
  input: CodeInput & { source: EnrollmentSource; channel: AccountChannel },
): Promise<SendResult> {
  const missing = await signInMissing(tx, key)
  if (missing.length > 0) return { status: 'not_configured', missing }
  const c = await sourceContact(tx, input.source)
  const value = input.channel === 'email' ? c.email : c.phone
  if (!value) return { status: 'not_verified' }
  const issued = await issueCode(tx, key, {
    purpose: ACCOUNT_CODE_PURPOSE,
    channel: codeChannel(input.channel),
    destination: value,
    subjectRef: enrollmentSubject(c.requestId, c.contactId, input.channel),
    ...(input.clientIp ? { clientIp: input.clientIp } : {}),
    requestId: input.httpRequestId,
    ...(input.now ? { now: input.now } : {}),
  })
  if (issued.status === 'issued')
    return { status: 'sent', channel: input.channel, sentTo: issued.maskedDestination, expiresAt: issued.expiresAt }
  if (issued.status === 'invalid_destination') return { status: 'not_verified' }
  return issued
}

export type EnrollResult =
  | { ok: false }
  | {
      ok: true
      accountId: string
      /** A new account (false: the value already had one, which the code now signed in to). */
      created: boolean
      /** The project was linked now (false: it was already linked to this account). */
      linked: boolean
      projectId: string
      session: StartedSession
    }

/**
 * The entered enrollment code: creates the account for that verified value, or signs in to the one it already has,
 * links the request's one project once, and starts the account session (replacing this browser's session).
 */
export async function enroll(
  tx: Tx,
  key: CodeKeySettings,
  input: {
    source: EnrollmentSource
    channel: AccountChannel
    code: string
    clientIp?: string
    replaces?: string
    now?: Date
  },
): Promise<EnrollResult> {
  if (!tx.isTransaction) throw new Error('enroll runs inside the business transaction (withTx)')
  const now = input.now ?? new Date()
  const c = await sourceContact(tx, input.source)
  const value = input.channel === 'email' ? c.email : c.phone
  const result = await verifyCode(tx, key, {
    purpose: ACCOUNT_CODE_PURPOSE,
    destination: value ?? (input.channel === 'email' ? 'nobody@invalid.invalid' : '+10000000000'),
    subjectRef: enrollmentSubject(c.requestId, c.contactId, input.channel),
    code: input.code,
    ...(input.clientIp ? { clientIp: input.clientIp } : {}),
    now,
  })
  if (!result.ok || !value || result.destination !== value) return { ok: false }

  await lockValue(tx, value)
  let account = await accountByValue(tx, { channel: input.channel, value })
  let created = false
  if (!account) {
    // The account's sign-in values: the one just proved, and the contact's other verified value when no other
    // account has it (so the account can be recovered through it, HH-ID-11).
    const other: ContactValue | null =
      input.channel === 'email'
        ? c.phone
          ? { channel: 'phone', value: c.phone }
          : null
        : c.email
          ? { channel: 'email', value: c.email }
          : null
    if (other) await lockValue(tx, other.value)
    const otherFree = other !== null && (await accountByValue(tx, other)) === undefined
    const email = input.channel === 'email' ? value : otherFree ? (other?.value ?? null) : null
    const phone = input.channel === 'phone' ? value : otherFree ? (other?.value ?? null) : null
    const id = randomUUID()
    await tx
      .insertInto('identity.customer_accounts')
      .values({
        id,
        sign_in_email: email,
        email_verified_at: email ? now : null,
        sign_in_phone: phone,
        phone_verified_at: phone ? now : null,
        customer_id: c.customerId,
        contact_id: c.contactId,
        enrolled_via: input.source.via,
        created_at: now,
      })
      .execute()
    account = { id, sign_in_email: email, sign_in_phone: phone }
    created = true
  }

  const existing = await tx
    .selectFrom('identity.customer_identity_links')
    .select('id')
    .where('account_id', '=', account.id)
    .where('project_id', '=', c.projectId)
    .where('state', '<>', 'revoked')
    .executeTakeFirst()
  if (!existing)
    await tx
      .insertInto('identity.customer_identity_links')
      .values({
        id: randomUUID(),
        account_id: account.id,
        customer_id: c.customerId,
        contact_id: c.contactId,
        project_id: c.projectId,
        request_id: c.requestId,
        authority: 'owner',
        evidence: input.source.via === 'receipt_offer' ? 'receipt_code' : 'project_link_code',
        evidence_channel: input.channel,
        evidence_code_id: result.codeId,
        state: 'active',
        decided_by: accountRef(account.id),
        decided_at: now,
      })
      .execute()
  const session = await startAccountSession(tx, account.id, input.channel, now, input.replaces)
  return { ok: true, accountId: account.id, created, linked: !existing, projectId: c.projectId, session }
}

async function startAccountSession(
  tx: Tx,
  accountId: string,
  channel: AccountChannel,
  now: Date,
  replaces: string | undefined,
): Promise<StartedSession> {
  return startCustomerSession(tx, {
    contactRef: accountRef(accountId),
    via: 'account',
    projectIds: [],
    verifiedAt: now,
    account: { id: accountId, signInChannel: channel },
    ...(replaces ? { replaces } : {}),
    now,
  })
}

// ---------------------------------------------------------------------------------------------------------------
// Sign-in

/** Internal only: the route gives every one of these the same answer. */
export type SignInCodeOutcome =
  { status: 'not_configured'; missing: string[] } | { status: 'accepted'; accountId: string | null; issued: boolean }

/** Sends a sign-in code when the value is an active account's own verified value; otherwise nothing is sent. */
export async function sendSignInCode(
  tx: Tx,
  key: CodeKeySettings,
  input: CodeInput & { contact: ContactValue },
): Promise<SignInCodeOutcome> {
  const missing = await signInMissing(tx, key)
  if (missing.length > 0) return { status: 'not_configured', missing }
  const account = await accountByValue(tx, input.contact)
  if (!account) return { status: 'accepted', accountId: null, issued: false }
  if (input.contact.channel === 'phone' && !(await textsAllowed(tx, input.contact.value)))
    return { status: 'accepted', accountId: account.id, issued: false }
  const issued = await issueCode(tx, key, {
    purpose: ACCOUNT_CODE_PURPOSE,
    channel: codeChannel(input.contact.channel),
    destination: input.contact.value,
    subjectRef: signInSubject(account.id, input.contact.channel),
    ...(input.clientIp ? { clientIp: input.clientIp } : {}),
    requestId: input.httpRequestId,
    ...(input.now ? { now: input.now } : {}),
  })
  return { status: 'accepted', accountId: account.id, issued: issued.status === 'issued' }
}

export type SignInResult =
  { ok: false; accountId: string | null } | { ok: true; accountId: string; session: StartedSession }

/** The entered sign-in code. A wrong code and an unknown value are the same refusal (an attempt is counted either way). */
export async function signIn(
  tx: Tx,
  key: CodeKeySettings,
  input: { contact: ContactValue; code: string; clientIp?: string; replaces?: string; now?: Date },
): Promise<SignInResult> {
  const now = input.now ?? new Date()
  const account = await accountByValue(tx, input.contact)
  const result = await verifyCode(tx, key, {
    purpose: ACCOUNT_CODE_PURPOSE,
    destination: input.contact.value,
    subjectRef: account ? signInSubject(account.id, input.contact.channel) : NO_ACCOUNT(input.contact.channel),
    code: input.code,
    ...(input.clientIp ? { clientIp: input.clientIp } : {}),
    now,
  })
  if (!account || !result.ok) return { ok: false, accountId: account?.id ?? null }
  // Read again under the value's lock: an account closed or changed since the code was sent opens nothing.
  await lockValue(tx, input.contact.value)
  const still = await accountByValue(tx, input.contact)
  if (still?.id !== account.id) return { ok: false, accountId: account.id }
  const session = await startAccountSession(tx, account.id, input.contact.channel, now, input.replaces)
  return { ok: true, accountId: account.id, session }
}

// ---------------------------------------------------------------------------------------------------------------
// The signed-in account

export type AccountView = {
  email: string | null
  phone: string | null
  projects: string[]
}

/** The account as its signed-in customer sees it: masked sign-in values and the references of its linked projects. */
export async function accountView(db: Db | Tx, session: CustomerSession): Promise<AccountView | null> {
  if (!session.accountId) return null
  const a = await db
    .selectFrom('identity.customer_accounts')
    .select(['sign_in_email', 'sign_in_phone', 'state'])
    .where('id', '=', session.accountId)
    .executeTakeFirst()
  if (!a || a.state !== 'active') return null
  const refs = session.projectIds.length
    ? await db.selectFrom('crm.projects').select(['id', 'reference']).where('id', 'in', session.projectIds).execute()
    : []
  const byId = new Map(refs.map((r) => [r.id, r.reference]))
  return {
    email: a.sign_in_email ? maskForCustomer('email', a.sign_in_email) : null,
    phone: a.sign_in_phone ? maskForCustomer('sms', a.sign_in_phone) : null,
    projects: session.projectIds.flatMap((id) => byId.get(id) ?? []),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Sign-in email change (HH-ID-11)

/**
 * What a sign-in email change needs before it may happen: the notice to the old value (HH-ID-11) must be able to go,
 * so account.contact_changed must be on the automatic list and have a released email wording. Empty when it can.
 */
export async function emailChangeMissing(db: Db | Tx, key: CodeKeySettings): Promise<string[]> {
  const missing = await signInMissing(db, key)
  const policy = automaticPolicy(await loadConfig(db))
  return [
    ...missing,
    ...(policy.isAutomatic(CONTACT_CHANGED_MESSAGE_KEY) ? [] : ['messages.automatic']),
    // TSK-0119: the notice's released wording must also have its values supplied (templateReadiness).
    ...((await templateReadiness(db, CONTACT_CHANGED_MESSAGE_KEY, 'email', 'en')).state === 'ready'
      ? []
      : [CONTACT_CHANGED_MESSAGE_KEY]),
  ]
}

export type EmailCodeResult =
  | { status: 'sent'; sentTo: string; expiresAt: Date }
  | { status: 'invalid_email' }
  | { status: 'unchanged' }
  | { status: 'rate_limited'; retryAfterSeconds: number }
  | { status: 'not_configured'; missing: string[] }

/** Sends a code to the new email. Whether another account has that email is not checked or told here. */
export async function sendEmailChangeCode(
  tx: Tx,
  key: CodeKeySettings,
  input: CodeInput & { session: CustomerSession; email: string },
): Promise<EmailCodeResult> {
  const missing = await emailChangeMissing(tx, key)
  if (missing.length > 0) return { status: 'not_configured', missing }
  const accountId = input.session.accountId
  if (!accountId) throw new Error('an email change needs an account session')
  const email = normaliseDestination('email', input.email)
  if (!email) return { status: 'invalid_email' }
  const account = await tx
    .selectFrom('identity.customer_accounts')
    .select('sign_in_email')
    .where('id', '=', accountId)
    .executeTakeFirstOrThrow()
  if (account.sign_in_email === email) return { status: 'unchanged' }
  const issued = await issueCode(tx, key, {
    purpose: ACCOUNT_CODE_PURPOSE,
    channel: 'email',
    destination: email,
    subjectRef: emailChangeSubject(accountId),
    ...(input.clientIp ? { clientIp: input.clientIp } : {}),
    requestId: input.httpRequestId,
    ...(input.now ? { now: input.now } : {}),
  })
  if (issued.status === 'issued')
    return { status: 'sent', sentTo: issued.maskedDestination, expiresAt: issued.expiresAt }
  if (issued.status === 'invalid_destination') return { status: 'invalid_email' }
  return issued
}

export type EmailChangeResult =
  | { ok: false; problem: 'invalid_code' | 'email_in_use' }
  | {
      ok: true
      session: StartedSession
      endedSessions: number
      changeId: string
      authority: 'old_contact' | 'other_contact'
    }

/**
 * The entered code of the new email. The change records what proved authority over the account, sends the notice to
 * the old email (outbox event, after commit), ends every other session of the account and renews this one.
 */
export async function changeEmail(
  tx: Tx,
  key: CodeKeySettings,
  input: {
    session: CustomerSession
    email: string
    code: string
    clientIp?: string
    httpRequestId: string
    now?: Date
  },
): Promise<EmailChangeResult> {
  if (!tx.isTransaction) throw new Error('changeEmail runs inside the business transaction (withTx)')
  const now = input.now ?? new Date()
  const accountId = input.session.accountId
  if (!accountId || !input.session.signInChannel) throw new Error('an email change needs an account session')
  const email = normaliseDestination('email', input.email) ?? input.email.trim().toLowerCase()
  const result = await verifyCode(tx, key, {
    purpose: ACCOUNT_CODE_PURPOSE,
    destination: email,
    subjectRef: emailChangeSubject(accountId),
    code: input.code,
    ...(input.clientIp ? { clientIp: input.clientIp } : {}),
    now,
  })
  if (!result.ok || result.destination !== email) return { ok: false, problem: 'invalid_code' }
  await lockValue(tx, email)
  // The code proved the new email belongs to this customer, so saying it already has an account reveals nothing.
  const holder = await accountByValue(tx, { channel: 'email', value: email })
  if (holder && holder.id !== accountId) return { ok: false, problem: 'email_in_use' }
  const before = await tx
    .selectFrom('identity.customer_accounts')
    .select(['sign_in_email'])
    .where('id', '=', accountId)
    .where('state', '=', 'active')
    .forUpdate()
    .executeTakeFirstOrThrow()
  await tx
    .updateTable('identity.customer_accounts')
    .set((eb) => ({ sign_in_email: email, email_verified_at: now, version: eb('version', '+', 1) }))
    .where('id', '=', accountId)
    .execute()
  const authority = input.session.signInChannel === 'email' ? 'old_contact' : 'other_contact'
  const changeId = randomUUID()
  await tx
    .insertInto('identity.customer_account_changes')
    .values({
      id: changeId,
      account_id: accountId,
      kind: 'email_changed',
      authority,
      old_value: before.sign_in_email,
      session_id: input.session.id,
      created_at: now,
    })
    .execute()
  if (before.sign_in_email)
    await outbox.add(tx, {
      type: CONTACT_CHANGED_EVENT,
      aggregate: { type: 'customer_account_change', id: changeId },
      idempotencyKey: `${CONTACT_CHANGED_EVENT}:${changeId}`,
      requestId: input.httpRequestId,
    })
  // The old email keeps no access: every other session ends; this one is renewed (a new token, the change's time).
  const endedSessions = await revokeAccountSessions(tx, accountId, 'contact_changed', { keep: input.session.id, now })
  const session = await startAccountSession(tx, accountId, input.session.signInChannel, now, input.session.id)
  return { ok: true, session, endedSessions, changeId, authority }
}

// ---------------------------------------------------------------------------------------------------------------
// Closing (OWN-DEC-71; the Owner's reviewed deletion is TSK-0100)

export type CloseResult = { closed: boolean; sessions: number; links: number; grants: number }

/**
 * Closes the login account: sign-in ends (its sign-in values are cleared), every session and project link is revoked,
 * and so are the guest links of its linked projects (reason account_deleted; their sessions end). Requests, projects,
 * contacts, estimates, invoices and every other business record stay exactly as they are.
 */
export async function closeCustomerAccount(
  tx: Tx,
  input: { accountId: string; by: string; now?: Date },
): Promise<CloseResult> {
  if (!tx.isTransaction) throw new Error('closeCustomerAccount runs inside the business transaction (withTx)')
  const now = input.now ?? new Date()
  const closed = await tx
    .updateTable('identity.customer_accounts')
    .set((eb) => ({
      state: 'closed',
      sign_in_email: null,
      email_verified_at: null,
      sign_in_phone: null,
      phone_verified_at: null,
      closed_at: now,
      close_reason: 'owner_deleted',
      closed_by: input.by,
      version: eb('version', '+', 1),
    }))
    .where('id', '=', input.accountId)
    .where('state', '=', 'active')
    .executeTakeFirst()
  if (Number(closed.numUpdatedRows) === 0) return { closed: false, sessions: 0, links: 0, grants: 0 }
  const sessions = await revokeAccountSessions(tx, input.accountId, 'account_closed', { now })
  const links = await tx
    .updateTable('identity.customer_identity_links')
    .set({ state: 'revoked', revoked_at: now, revoke_reason: 'account_closed', revoked_by: input.by })
    .where('account_id', '=', input.accountId)
    .where('state', '<>', 'revoked')
    .returning('project_id')
    .execute()
  const projectIds = [...new Set(links.map((l) => l.project_id))]
  let grants = 0
  if (projectIds.length > 0) {
    const revoked = await tx
      .updateTable('identity.project_access_grants')
      .set({ revoked_at: now, revoke_reason: 'account_deleted', revoked_by: input.by })
      .where('project_id', 'in', projectIds)
      .where('revoked_at', 'is', null)
      .returning('id')
      .execute()
    grants = revoked.length
    if (revoked.length > 0)
      await tx
        .updateTable('identity.customer_sessions')
        .set({ revoked_at: now, revoke_reason: 'account_closed' })
        .where(
          'grant_id',
          'in',
          revoked.map((g) => g.id),
        )
        .where('revoked_at', 'is', null)
        .execute()
  }
  await tx
    .updateTable('identity.customer_account_changes')
    .set({ old_value: null })
    .where('account_id', '=', input.accountId)
    .where('old_value', 'is not', null)
    .execute()
  return { closed: true, sessions, links: links.length, grants }
}
