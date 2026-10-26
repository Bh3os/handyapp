// Saved properties, preferences and Request This Service Again (TSK-0113; HH-ID-12, HH-ID-03, HH-SCH-10, C11,
// ENT-CustomerAccount, ENT-Property, ENT-ConsentPreference, OWN-DEC-113, OWN-DEC-160, RULE-SERVER-AUTHZ).
// - Everything here belongs to the signed-in account only, and reaches only what the account's active links open
//   (HH-ID-03): the properties of its linked projects, its own names for them, its own preferences and the consent
//   records of its own verified sign-in values. A project, property or name outside that is NOT_FOUND, exactly like a
//   missing one (T19); a revoked link or a closed account hides it at once, as the session reads its links on every
//   request.
// - Saved properties (PROPOSED, OQ-SAVED-PROPERTIES-DETAILS): the customer names a property of their own history. The
//   address is the property record's, kept by staff and read each time; the customer never edits it here (ENT-Property:
//   the customer confirms details, staff change them). Every request makes its own property record, so the projects at
//   one address are shown once, by their latest project; one name per address and per account.
// - Preferences: the contact method a new request starts with is the account's own preference. Texting, marketing and
//   optional follow-ups are consent records of the account's verified email and phone (source portal, append-only), so
//   the send-time checks read them as they read every other permission (HH-COM-05, ENT-ConsentPreference). PROPOSED:
//   the portal stops any of them and gives back only email permissions; texts are agreed to on the request form, the
//   opt-in path the A2P 10DLC registration describes (HH-COM-12, OWN-DEC-147). Repeat-service reminders have no
//   schedule to change or stop until TSK-0114 builds them.
// - Request This Service Again (OWN-DEC-113, C11): the form starts from the earlier project's services (those still
//   offered), its property address and type, and the request's contact name, email and phone, which the customer
//   confirms are still current. Nothing else is reused: no description, answer, note, photo, timing, estimate choice,
//   price, discount, verification or consent. The new request is a new request with its own records, linked to the
//   earlier project (intake.request_repeats); pricing and appointments start again with staff review.
import { publicServices, type Db, type RegistryEnvironment, type Tx } from '@handyhub/db'
import { REFERENCE_PATTERN, type SubmitBody } from '@handyhub/domain/request-form'
import { maskForCustomer, type CustomerSession } from '../identity/index.js'
import { currentConsent, recordConsent, type ConsentPurpose, type ConsentState } from '../notifications/index.js'

type Reader = Db | Tx

export const CONTACT_METHODS = ['email', 'call', 'text'] as const
export type ContactMethod = (typeof CONTACT_METHODS)[number]
/** PROPOSED: a property name is 1 to 60 characters, unique (case aside) within one account. */
export const LABEL_MAX = 60

export type PropertyAddress = {
  street: string
  unit: string | null
  city: string
  state: string
  zip: string
  propertyType: SubmitBody['property']['propertyType']
}

/** One address of the account's history: its latest project, the address, and the customer's name for it. */
export type AccountProperty = {
  reference: string
  address: PropertyAddress
  saved: { id: string; label: string } | null
}

type ProjectAt = { projectId: string; reference: string; propertyId: string; createdAt: Date; address: PropertyAddress }

/** Case and spacing aside: two requests typed the same address the same way (unit and property type included). */
export function addressKey(a: PropertyAddress): string {
  const norm = (s: string | null) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  return [a.street, a.unit, a.city, a.state, a.zip.slice(0, 5), a.propertyType].map(norm).join('|')
}

/** The projects this session opens, newest first, each with its property address as it reads now. */
async function projectsAt(db: Reader, session: CustomerSession): Promise<ProjectAt[]> {
  if (!session.accountId || session.projectIds.length === 0) return []
  const rows = await db
    .selectFrom('crm.projects as p')
    .innerJoin('crm.properties as pr', 'pr.id', 'p.property_id')
    .select([
      'p.id',
      'p.reference',
      'p.created_at',
      'pr.id as property_id',
      'pr.street',
      'pr.unit',
      'pr.city',
      'pr.state',
      'pr.zip',
      'pr.property_type',
    ])
    .where('p.id', 'in', session.projectIds)
    .orderBy('p.created_at', 'desc')
    .orderBy('p.reference', 'desc')
    .execute()
  return rows.map((r) => ({
    projectId: r.id,
    reference: r.reference,
    propertyId: r.property_id,
    createdAt: r.created_at,
    address: {
      street: r.street,
      unit: r.unit,
      city: r.city,
      state: r.state,
      zip: r.zip,
      propertyType: r.property_type as PropertyAddress['propertyType'],
    },
  }))
}

type Group = { latest: ProjectAt; propertyIds: Set<string> }

/** The account's addresses, newest first: one per address, named by its latest project. */
function groupsOf(projects: readonly ProjectAt[]): Group[] {
  const byKey = new Map<string, Group>()
  for (const p of projects) {
    const key = addressKey(p.address)
    const g = byKey.get(key)
    if (g) g.propertyIds.add(p.propertyId)
    else byKey.set(key, { latest: p, propertyIds: new Set([p.propertyId]) })
  }
  return [...byKey.values()]
}

async function savedRows(db: Reader, accountId: string) {
  return db
    .selectFrom('identity.customer_saved_properties')
    .select(['id', 'property_id', 'label', 'created_at'])
    .where('account_id', '=', accountId)
    .orderBy('created_at')
    .execute()
}

/** Every address of the account's history with the customer's name for it: the named ones first, by name. */
export async function accountProperties(db: Reader, session: CustomerSession): Promise<AccountProperty[]> {
  if (!session.accountId) return []
  const groups = groupsOf(await projectsAt(db, session))
  const saved = await savedRows(db, session.accountId)
  const out = groups.map((g) => {
    const s = saved.find((x) => g.propertyIds.has(x.property_id))
    return {
      reference: g.latest.reference,
      address: g.latest.address,
      saved: s ? { id: s.id, label: s.label } : null,
    }
  })
  const named = out.filter((p) => p.saved).sort((a, b) => (a.saved?.label ?? '').localeCompare(b.saved?.label ?? ''))
  return [...named, ...out.filter((p) => !p.saved)]
}

export type SaveResult =
  { ok: true; id: string; propertyId: string } | { ok: false; why: 'not_found' | 'already_saved' | 'label_in_use' }

const tidy = (label: string) => label.trim().replace(/\s+/g, ' ')
/** A name as kept: trimmed, inner spaces collapsed; null when empty or too long. */
export function labelOf(label: string): string | null {
  const l = tidy(label)
  return l.length >= 1 && l.length <= LABEL_MAX ? l : null
}

async function labelTaken(db: Reader, accountId: string, label: string, except?: string): Promise<boolean> {
  const rows = await savedRows(db, accountId)
  return rows.some((r) => r.id !== except && r.label.toLowerCase() === label.toLowerCase())
}

/** Names the address of one of the account's projects (the project named by its reference). */
export async function saveProperty(
  tx: Tx,
  session: CustomerSession,
  input: { reference: string; label: string },
): Promise<SaveResult> {
  const accountId = session.accountId
  if (!accountId || !REFERENCE_PATTERN.test(input.reference)) return { ok: false, why: 'not_found' }
  const label = labelOf(input.label) as string
  // One save at a time per account: the checks below read what the other one wrote.
  await tx
    .selectFrom('identity.customer_accounts')
    .select('id')
    .where('id', '=', accountId)
    .forUpdate()
    .executeTakeFirst()
  const projects = await projectsAt(tx, session)
  // The reference may name an older project at an address: the name goes to the address's latest property record.
  const project = projects.find((p) => p.reference === input.reference)
  const target = project ? groupsOf(projects).find((g) => g.propertyIds.has(project.propertyId)) : undefined
  if (!target) return { ok: false, why: 'not_found' }
  const saved = await savedRows(tx, accountId)
  if (saved.some((s) => target.propertyIds.has(s.property_id))) return { ok: false, why: 'already_saved' }
  if (await labelTaken(tx, accountId, label)) return { ok: false, why: 'label_in_use' }
  const row = await tx
    .insertInto('identity.customer_saved_properties')
    .values({ account_id: accountId, property_id: target.latest.propertyId, label })
    .returning('id')
    .executeTakeFirstOrThrow()
  return { ok: true, id: row.id, propertyId: target.latest.propertyId }
}

/** The account's own saved property, while one of its linked projects is at that property; null otherwise. */
async function ownSaved(db: Reader, session: CustomerSession, id: string, lock = false) {
  if (!session.accountId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null
  let q = db
    .selectFrom('identity.customer_saved_properties')
    .select(['id', 'property_id', 'label', 'version'])
    .where('id', '=', id)
    .where('account_id', '=', session.accountId)
  if (lock) q = q.forUpdate()
  const row = await q.executeTakeFirst()
  if (!row) return null
  const projects = await projectsAt(db, session)
  const at = projects.filter((p) => p.propertyId === row.property_id)
  return at.length ? { ...row, latest: at[0] as ProjectAt } : null
}

export type RenameResult = { ok: true; propertyId: string } | { ok: false; why: 'not_found' | 'label_in_use' }

export async function renameProperty(
  tx: Tx,
  session: CustomerSession,
  input: { id: string; label: string },
): Promise<RenameResult> {
  if (!session.accountId) return { ok: false, why: 'not_found' }
  // One change at a time per account, as for a save: the name check reads what the other one wrote.
  await tx
    .selectFrom('identity.customer_accounts')
    .select('id')
    .where('id', '=', session.accountId)
    .forUpdate()
    .executeTakeFirst()
  const row = await ownSaved(tx, session, input.id, true)
  if (!row) return { ok: false, why: 'not_found' }
  const label = labelOf(input.label) as string
  if (await labelTaken(tx, session.accountId, label, row.id)) return { ok: false, why: 'label_in_use' }
  if (label !== row.label)
    await tx
      .updateTable('identity.customer_saved_properties')
      .set({ label, updated_at: new Date(), version: row.version + 1 })
      .where('id', '=', row.id)
      .execute()
  return { ok: true, propertyId: row.property_id }
}

/** Removes the customer's name for a property; the property and its projects are untouched. */
export async function removeProperty(
  tx: Tx,
  session: CustomerSession,
  id: string,
): Promise<{ ok: true; propertyId: string } | { ok: false }> {
  const row = await ownSaved(tx, session, id, true)
  if (!row) return { ok: false }
  await tx.deleteFrom('identity.customer_saved_properties').where('id', '=', row.id).execute()
  return { ok: true, propertyId: row.property_id }
}

// ---------------------------------------------------------------------------------------------------------------
// Request This Service Again: what the request form starts from

export type RequestPrefill = {
  /** The earlier project the new request is linked to. */
  reference: string
  services: string[]
  notSure: boolean
  address: PropertyAddress
  contact: { fullName: string; email: string; phone: string }
  preferredChannel: ContactMethod | null
}

/** A US number as people type it, (502) 555-0124; any other number as stored. */
export function displayPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164)
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164
}

async function preferredChannelOf(db: Reader, accountId: string): Promise<ContactMethod | null> {
  const row = await db
    .selectFrom('identity.customer_account_preferences')
    .select('preferred_channel')
    .where('account_id', '=', accountId)
    .executeTakeFirst()
  return (row?.preferred_channel as ContactMethod | null | undefined) ?? null
}

async function prefillFor(db: Reader, session: CustomerSession, project: ProjectAt, withServices: boolean) {
  const request = await db
    .selectFrom('intake.requests as r')
    .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
    .select(['r.id', 'r.not_sure', 'c.full_name', 'c.email', 'c.phone_e164'])
    .where('r.project_id', '=', project.projectId)
    .executeTakeFirst()
  if (!request || !session.accountId) return null
  let services: string[] = []
  if (withServices) {
    const environment = (process.env['HANDYHUB_ENV'] ?? 'local') as RegistryEnvironment
    const offered = new Set((await publicServices(db, environment)).map((s) => s.id))
    const rows = await db
      .selectFrom('intake.request_services')
      .select('service_id')
      .where('request_id', '=', request.id)
      .orderBy('position')
      .execute()
    // A service the form no longer offers is left out; the customer chooses again.
    services = rows.map((r) => r.service_id).filter((id) => offered.has(id))
  }
  return {
    reference: project.reference,
    services,
    notSure: withServices && request.not_sure,
    address: project.address,
    contact: { fullName: request.full_name, email: request.email, phone: displayPhone(request.phone_e164) },
    preferredChannel: await preferredChannelOf(db, session.accountId),
  } satisfies RequestPrefill
}

/** Request This Service Again from one of the account's projects; null for any other reference. */
export async function repeatPrefill(
  db: Reader,
  session: CustomerSession,
  reference: string,
): Promise<RequestPrefill | null> {
  if (!REFERENCE_PATTERN.test(reference)) return null
  const project = (await projectsAt(db, session)).find((p) => p.reference === reference)
  return project ? prefillFor(db, session, project, true) : null
}

/** A new request at a saved property: the address and contact only, linked to the latest project there. */
export async function savedPropertyPrefill(
  db: Reader,
  session: CustomerSession,
  id: string,
): Promise<RequestPrefill | null> {
  const row = await ownSaved(db, session, id)
  return row ? prefillFor(db, session, row.latest, false) : null
}

/**
 * The earlier project a submission names in repeatOf, when the caller's account session opens it: its ID and property
 * address. Null for anything else (no session, a guest-link session, another account's project, no such project).
 */
export async function repeatSource(
  db: Reader,
  session: CustomerSession | null,
  reference: string,
): Promise<{ projectId: string; accountId: string; address: PropertyAddress } | null> {
  if (!session?.accountId || !REFERENCE_PATTERN.test(reference)) return null
  const project = (await projectsAt(db, session)).find((p) => p.reference === reference)
  return project ? { projectId: project.projectId, accountId: session.accountId, address: project.address } : null
}

// ---------------------------------------------------------------------------------------------------------------
// Preferences

export const PERMISSIONS = ['marketing', 'follow_ups', 'texts'] as const
export type AccountPermission = (typeof PERMISSIONS)[number]
const PURPOSE: Record<AccountPermission, ConsentPurpose> = {
  marketing: 'marketing',
  // TSK-0092: a withdrawn service-communication consent on a channel stops the optional follow-ups on it.
  follow_ups: 'service_communication',
  texts: 'transactional_sms',
}

export type Preferences = {
  preferredChannel: ContactMethod | null
  email: { destination: string; marketing: ConsentState; followUps: ConsentState } | null
  phone: { destination: string; texts: ConsentState; marketing: ConsentState; followUps: ConsentState } | null
}

async function signInValues(db: Reader, accountId: string) {
  return db
    .selectFrom('identity.customer_accounts')
    .select(['sign_in_email', 'sign_in_phone', 'contact_id', 'state'])
    .where('id', '=', accountId)
    .executeTakeFirst()
}

export async function accountPreferences(db: Reader, session: CustomerSession): Promise<Preferences | null> {
  if (!session.accountId) return null
  const a = await signInValues(db, session.accountId)
  if (!a || a.state !== 'active') return null
  const email = a.sign_in_email
  const phone = a.sign_in_phone
  return {
    preferredChannel: await preferredChannelOf(db, session.accountId),
    email: email
      ? {
          destination: maskForCustomer('email', email),
          marketing: await currentConsent(db, 'email', email, 'marketing'),
          followUps: await currentConsent(db, 'email', email, 'service_communication'),
        }
      : null,
    phone: phone
      ? {
          destination: maskForCustomer('sms', phone),
          texts: await currentConsent(db, 'sms', phone, 'transactional_sms'),
          marketing: await currentConsent(db, 'sms', phone, 'marketing'),
          followUps: await currentConsent(db, 'sms', phone, 'service_communication'),
        }
      : null,
  }
}

export async function setPreferredChannel(tx: Tx, accountId: string, channel: ContactMethod | null): Promise<boolean> {
  const row = await tx
    .selectFrom('identity.customer_account_preferences')
    .select(['preferred_channel', 'version'])
    .where('account_id', '=', accountId)
    .forUpdate()
    .executeTakeFirst()
  if (!row) {
    await tx
      .insertInto('identity.customer_account_preferences')
      .values({ account_id: accountId, preferred_channel: channel })
      .onConflict((oc) => oc.column('account_id').doUpdateSet({ preferred_channel: channel, updated_at: new Date() }))
      .execute()
    return true
  }
  if (row.preferred_channel === channel) return false
  await tx
    .updateTable('identity.customer_account_preferences')
    .set({ preferred_channel: channel, updated_at: new Date(), version: row.version + 1 })
    .where('account_id', '=', accountId)
    .execute()
  return true
}

export type PermissionChoice =
  | { ok: true; recorded: boolean; state: ConsentState }
  | { ok: false; why: 'no_destination' | 'texts_on_request_form' | 'not_a_permission' }

/**
 * Records the customer's own choice for one permission of their own verified sign-in value, as an append-only consent
 * record (source portal). A choice already in effect records nothing. Stopping texts also ends the consent to
 * verification codes by text, as STOP does (TSK-0134).
 */
export async function setPermission(
  tx: Tx,
  input: {
    accountId: string
    channel: 'email' | 'sms'
    permission: AccountPermission
    granted: boolean
    /** The privacy notice version shown beside a marketing permission given here. */
    noticeVersion?: string
    httpRequestId: string
  },
): Promise<PermissionChoice> {
  if (input.channel === 'email' && input.permission === 'texts') return { ok: false, why: 'not_a_permission' }
  if (input.channel === 'sms' && input.granted) return { ok: false, why: 'texts_on_request_form' }
  const a = await signInValues(tx, input.accountId)
  const destination = input.channel === 'email' ? a?.sign_in_email : a?.sign_in_phone
  if (!a || a.state !== 'active' || !destination) return { ok: false, why: 'no_destination' }
  const purposes: ConsentPurpose[] =
    input.permission === 'texts' ? ['transactional_sms', 'sms_verification'] : [PURPOSE[input.permission]]
  const open: ConsentPurpose[] = []
  for (const p of purposes) {
    const state = await currentConsent(tx, input.channel, destination, p)
    if (input.granted ? state !== 'granted' : p === 'sms_verification' ? state === 'granted' : state !== 'withdrawn')
      open.push(p)
  }
  for (const purpose of open)
    await recordConsent(tx, {
      purpose,
      channel: input.channel,
      destination,
      granted: input.granted,
      source: 'portal',
      recordedBy: `customer:${a.contact_id}`,
      subject: { kind: 'customer_contact', id: a.contact_id },
      ...(input.granted && input.noticeVersion ? { disclosureVersion: input.noticeVersion } : {}),
      // Safe evidence only: the account and the HTTP request this was recorded in.
      evidence: { accountId: input.accountId, requestId: input.httpRequestId },
    })
  const state = await currentConsent(tx, input.channel, destination, PURPOSE[input.permission])
  return { ok: true, recorded: open.length > 0, state }
}
