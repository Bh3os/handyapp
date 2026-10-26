// First-visit site checks (TSK-0126; OWN-DEC-167, OWN-DEC-179, OWN-DEC-206, HH-SCH-06, HH-CRM-02, ENT-Property,
// ENT-Contact, ENT-CoverageRule, ENT-Visit, ENT-AuditEvent, RULE-SERVER-AUTHZ, RULE-SAFETY-GATES). The three checks a
// confirmation needs, each recorded by staff with the information it rests on (migration 0106):
// 1. the verified property address: the address-and-county check of TSK-0127 for the current address version,
//    recorded on the property record (properties/index.ts verifyCounty) after the automated pre-validation of
//    @handyhub/domain addressProblems (a PO box street, a mailing ZIP, a ZIP of another state stop it);
// 2. the authorized site contact: the person the project's customer designated (themselves, prefilled from their
//    contact record, or a person they named) with name, role and a phone or email, and what staff confirmed they may
//    do (give access to the property, coordinate the visit). Never money or contract changes. A changed contact is the
//    next version and is confirmed again; a customer contact whose name, phone or email changed since needs it again;
// 3. the service-area coverage of the verified county: SERVED accepted by the Owner or Office, no owner approval
//    (OWN-DEC-179); OUTSIDE only with the Owner's exception and a written reason (visit.approve_coverage_exception).
//    The outcome is the county check's, never the caller's. An exception lifts this check only: the approval, the
//    deposit gate and every blocking hold still apply (no legal, licensing or safety restriction is overridden).
// The checks persist across the project's visits; a new address version, a new county check or a changed contact
// makes the checks resting on it missing again (PROPOSED, OQ-SITE-CHECK-DETAILS: every confirmation needs them
// current). siteCheckProblems names every missing check for each confirmation path, the view shows each checkbox
// with what it rests on (no blind confirmation), and the database refuses a confirmation without them (0106).
import type { Db, Tx } from '@handyhub/db'
import {
  addressProblems,
  confirmedCoverage,
  contactAuthorized,
  looksLikeAccessCode,
  looksLikeCardNumber,
  SITE_CONTACT_AUTHORITIES,
  type AddressProblem,
  type DetailSource,
  type SiteContactAuthority,
  type SiteContactDesignation,
} from '@handyhub/domain'
import { normalizeUsPhone } from '@handyhub/domain/request-form'
import { rowFor, scopeIncludesProject, type Action, type DataScope, type StaffActor } from '@handyhub/policy'
import { ApiError, type FieldError } from '../../api/errors.js'
import { lookupCoverage } from '../coverage/coverage.js'
import { currentCountyVerification } from './preconditions.js'

type Reader = Db | Tx

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })

/** Whether one of the actor's roles holds the action (the matrix row's cell has a rule for it). */
const holds = (actor: StaffActor, action: Action) =>
  actor.roles.some((role) => rowFor(action)?.cells[role].rules[action] !== undefined)

/** PROPOSED input bounds (no owner value). */
export const SITE_CONTACT_LIMITS = { name: 200, role: 100, email: 254, note: 1000, reason: 1000 } as const

/** Why the site-contact check is unmet. */
export type SiteContactProblem = 'SITE_CONTACT_MISSING' | 'SITE_CONTACT_NOT_AUTHORIZED' | 'SITE_CONTACT_CHANGED'

type ContactRow = {
  id: string
  version: number
  designation: string
  contact_id: string | null
  full_name: string
  role: string | null
  phone_e164: string | null
  email: string | null
  authority: string[]
  source: string
  note: string | null
  recorded_by: string
  recorded_at: Date
}

/** The project's current site contact (its newest version), or null. */
async function currentSiteContact(db: Reader, projectId: string): Promise<ContactRow | null> {
  return (
    (await db
      .selectFrom('crm.project_site_contacts')
      .select([
        'id',
        'version',
        'designation',
        'contact_id',
        'full_name',
        'role',
        'phone_e164',
        'email',
        'authority',
        'source',
        'note',
        'recorded_by',
        'recorded_at',
      ])
      .where('project_id', '=', projectId)
      .orderBy('version', 'desc')
      .limit(1)
      .executeTakeFirst()) ?? null
  )
}

/** The project customer's contact a "customer" designation rests on: the primary one, else the first. */
async function customerContact(db: Reader, projectId: string) {
  return (
    (await db
      .selectFrom('crm.projects as p')
      .innerJoin('crm.contacts as c', 'c.customer_id', 'p.customer_id')
      .select(['c.id', 'c.full_name', 'c.phone_e164', 'c.email'])
      .where('p.id', '=', projectId)
      .orderBy('c.is_primary', 'desc')
      .orderBy('c.created_at')
      .limit(1)
      .executeTakeFirst()) ?? null
  )
}

/** Whether a customer designation still matches the contact record it was confirmed on (name, phone, email). */
async function contactChanged(db: Reader, c: ContactRow): Promise<boolean> {
  if (c.designation !== 'customer' || c.contact_id === null) return false
  const k = await db
    .selectFrom('crm.contacts')
    .select(['full_name', 'phone_e164', 'email'])
    .where('id', '=', c.contact_id)
    .executeTakeFirst()
  return (
    !k ||
    k.full_name !== c.full_name ||
    k.phone_e164 !== c.phone_e164 ||
    k.email.toLowerCase() !== (c.email ?? '').toLowerCase()
  )
}

async function siteContactProblem(db: Reader, c: ContactRow | null): Promise<SiteContactProblem | null> {
  if (!c) return 'SITE_CONTACT_MISSING'
  if (!contactAuthorized(c.authority)) return 'SITE_CONTACT_NOT_AUTHORIZED'
  if (await contactChanged(db, c)) return 'SITE_CONTACT_CHANGED'
  return null
}

/** The project's newest coverage acceptance on the given county check, or null. */
async function acceptanceOn(db: Reader, projectId: string, countyVerificationId: string) {
  return (
    (await db
      .selectFrom('crm.project_coverage_acceptances')
      .select(['id', 'county_verification_id', 'outcome', 'exception_reason', 'accepted_by', 'accepted_at'])
      .where('project_id', '=', projectId)
      .where('county_verification_id', '=', countyVerificationId)
      .orderBy('seq', 'desc')
      .limit(1)
      .executeTakeFirst()) ?? null
  )
}

/**
 * Every missing site check of the project, at once (empty: all three hold): the address and county not verified for
 * the current address version (coverage: COUNTY_NOT_VERIFIED), the site contact (siteContact: SITE_CONTACT_MISSING,
 * SITE_CONTACT_NOT_AUTHORIZED, SITE_CONTACT_CHANGED) and, once the county is verified, its coverage (coverage:
 * COVERAGE_NOT_ACCEPTED for SERVED, COUNTY_OUTSIDE_AREA for OUTSIDE without the Owner's exception).
 */
export async function siteCheckProblems(db: Reader, projectId: string): Promise<FieldError[]> {
  const out: FieldError[] = []
  const verified = await currentCountyVerification(db, projectId)
  if (!verified) out.push(field('coverage', 'COUNTY_NOT_VERIFIED'))
  const contact = await siteContactProblem(db, await currentSiteContact(db, projectId))
  if (contact) out.push(field('siteContact', contact))
  if (verified && !(await acceptanceOn(db, projectId, verified.id)))
    out.push(field('coverage', verified.in_area ? 'COVERAGE_NOT_ACCEPTED' : 'COUNTY_OUTSIDE_AREA'))
  return out
}

/** The pre-validation problems of the project property's current address (what the address checkbox shows). */
export async function propertyAddressProblems(
  db: Reader,
  address: { street: string; state: string; zip: string },
): Promise<AddressProblem[]> {
  const zip = await lookupCoverage(db, address.zip).catch(() => null)
  return addressProblems(address, { category: zip?.zipCategory ?? null, counties: zip?.counties ?? [] })
}

type StaffRef = { id: string; name: string | null }

/**
 * The three checkboxes as staff see them, each with what it rests on (no blind confirmation): the current address
 * with its pre-validation and its county check; the current site contact with the customer's contact to prefill it;
 * the coverage outcome of the verified county with its acceptance or exception; and what the caller may record.
 */
export async function siteChecksView(
  db: Reader,
  actor: StaffActor,
  projectId: string,
  names: (ids: string[]) => Promise<Map<string, StaffRef>>,
) {
  const p = await db
    .selectFrom('crm.projects as pj')
    .innerJoin('crm.properties as pr', 'pr.id', 'pj.property_id')
    .select(['pr.id', 'pr.version', 'pr.address_version', 'pr.street', 'pr.unit', 'pr.city', 'pr.state', 'pr.zip'])
    .where('pj.id', '=', projectId)
    .executeTakeFirstOrThrow()
  const verified = await currentCountyVerification(db, projectId)
  const contact = await currentSiteContact(db, projectId)
  const contactProblem = await siteContactProblem(db, contact)
  const acceptance = verified ? await acceptanceOn(db, projectId, verified.id) : null
  const customer = await customerContact(db, projectId)
  const staff = await names([
    ...(verified ? [verified.verified_by] : []),
    ...(contact ? [contact.recorded_by] : []),
    ...(acceptance ? [acceptance.accepted_by] : []),
  ])
  const ref = (id: string) => staff.get(id) ?? { id, name: null }
  const outcome = verified ? confirmedCoverage(verified.in_area) : null
  const confirmer = holds(actor, 'visit.confirm')
  return {
    property: {
      id: p.id,
      version: p.version,
      addressVersion: p.address_version,
      address: { street: p.street, unit: p.unit, city: p.city, state: p.state, zip: p.zip },
    },
    address: {
      done: verified !== null,
      problems: await propertyAddressProblems(db, p),
      verification: verified
        ? {
            id: verified.id,
            state: verified.state,
            county: verified.county,
            inArea: verified.in_area,
            addressVersion: verified.address_version,
            verifiedBy: ref(verified.verified_by),
            verifiedAt: new Date(verified.verified_at).toISOString(),
          }
        : null,
    },
    siteContact: {
      done: contactProblem === null,
      problem: contactProblem,
      current: contact
        ? {
            version: contact.version,
            designation: contact.designation,
            name: contact.full_name,
            role: contact.role,
            phone: contact.phone_e164,
            email: contact.email,
            authority: contact.authority,
            source: contact.source,
            note: contact.note,
            recordedBy: ref(contact.recorded_by),
            recordedAt: new Date(contact.recorded_at).toISOString(),
          }
        : null,
      customer: customer ? { name: customer.full_name, phone: customer.phone_e164, email: customer.email } : null,
    },
    coverage: {
      done: acceptance !== null,
      outcome,
      countyVerificationId: verified?.id ?? null,
      acceptance: acceptance
        ? {
            outcome: acceptance.outcome,
            exceptionReason: acceptance.exception_reason,
            acceptedBy: ref(acceptance.accepted_by),
            acceptedAt: new Date(acceptance.accepted_at).toISOString(),
          }
        : null,
    },
    actions: {
      verifyAddress: confirmer,
      recordSiteContact: confirmer,
      acceptCoverage: confirmer && outcome === 'served' && acceptance === null,
      approveException:
        holds(actor, 'visit.approve_coverage_exception') && outcome === 'outside' && acceptance === null,
    },
  }
}
export type SiteChecksView = Awaited<ReturnType<typeof siteChecksView>>

export type SiteContactInput = {
  /** The version the caller saw (0: none yet). */
  readonly currentVersion: number
  readonly designation: SiteContactDesignation
  /** A person the customer named: their name, role and a phone or email (the customer's come from their record). */
  readonly fullName?: string | null
  readonly role?: string | null
  readonly phone?: string | null
  readonly email?: string | null
  readonly authority: readonly SiteContactAuthority[]
  readonly source: DetailSource
  readonly note?: string | null
}

const text = (s: string | null | undefined) => {
  const t = (s ?? '').trim().replace(/\s+/g, ' ')
  return t === '' ? null : t
}

/**
 * Records the project's site contact as its next version, with the authority staff confirmed (none: designated but
 * not authorized yet). Refusals: NOT_FOUND, STALE_VERSION (another version was recorded meanwhile), VALIDATION_FAILED
 * (NAME_REQUIRED, ROLE_REQUIRED, CONTACT_REQUIRED, PHONE_INVALID, EMAIL_INVALID, NOT_FOR_CUSTOMER, a code-looking or
 * card-looking text), CONFLICT (NO_CUSTOMER_CONTACT).
 */
export async function recordSiteContact(
  tx: Tx,
  actor: StaffActor,
  scope: DataScope,
  projectId: string,
  input: SiteContactInput,
) {
  if (!scopeIncludesProject(scope, projectId)) throw new ApiError('NOT_FOUND')
  const project = await tx
    .selectFrom('crm.projects')
    .select('id')
    .where('id', '=', projectId)
    .forUpdate()
    .executeTakeFirst()
  if (!project) throw new ApiError('NOT_FOUND')
  const current = await currentSiteContact(tx, projectId)
  if ((current?.version ?? 0) !== input.currentVersion)
    throw new ApiError('STALE_VERSION', {
      current: { version: current?.version ?? 0, values: { designation: current?.designation ?? null } },
    })
  const bad: FieldError[] = []
  const note = text(input.note)
  const role = text(input.role)
  for (const [f, v] of [
    ['body.note', note],
    ['body.role', role],
    ['body.fullName', text(input.fullName)],
  ] as const)
    if (v && (looksLikeAccessCode(v) || looksLikeCardNumber(v))) bad.push(field(f, 'sensitive_content'))
  let person: {
    contactId: string | null
    name: string
    role: string | null
    phone: string | null
    email: string | null
  }
  if (input.designation === 'customer') {
    // Prefilled from the customer's own record; nothing of it is typed again.
    for (const f of ['fullName', 'role', 'phone', 'email'] as const)
      if (text(input[f]) !== null) bad.push(field(`body.${f}`, 'NOT_FOR_CUSTOMER'))
    if (bad.length) throw new ApiError('VALIDATION_FAILED', { fieldErrors: bad })
    const c = await customerContact(tx, projectId)
    if (!c) throw new ApiError('CONFLICT', { fieldErrors: [field('body.designation', 'NO_CUSTOMER_CONTACT')] })
    person = { contactId: c.id, name: c.full_name, role: null, phone: c.phone_e164, email: c.email }
  } else {
    const name = text(input.fullName)
    const phoneText = text(input.phone)
    const emailText = text(input.email)
    const phone = phoneText ? normalizeUsPhone(phoneText) : null
    if (!name) bad.push(field('body.fullName', 'NAME_REQUIRED'))
    if (!role) bad.push(field('body.role', 'ROLE_REQUIRED'))
    if (!phoneText && !emailText) bad.push(field('body.phone', 'CONTACT_REQUIRED'))
    if (phoneText && !phone) bad.push(field('body.phone', 'PHONE_INVALID'))
    if (emailText && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailText)) bad.push(field('body.email', 'EMAIL_INVALID'))
    if (bad.length) throw new ApiError('VALIDATION_FAILED', { fieldErrors: bad })
    person = { contactId: null, name: name as string, role, phone, email: emailText }
  }
  const authority = SITE_CONTACT_AUTHORITIES.filter((a) => input.authority.includes(a))
  const row = await tx
    .insertInto('crm.project_site_contacts')
    .values({
      project_id: projectId,
      version: (current?.version ?? 0) + 1,
      designation: input.designation,
      contact_id: person.contactId,
      full_name: person.name,
      role: person.role,
      phone_e164: person.phone,
      email: person.email,
      authority,
      source: input.source,
      note,
      recorded_by: actor.userId,
    })
    .returning(['id', 'version'])
    .executeTakeFirstOrThrow()
  return { id: row.id, version: row.version, designation: input.designation, authority, note }
}

/**
 * Records the project's coverage on the current county check: SERVED accepted (visit.confirm), or OUTSIDE with the
 * Owner's exception and its reason (visit.approve_coverage_exception). Refusals: NOT_FOUND, FORBIDDEN (an exception
 * by anyone but the Owner), CONFLICT (COUNTY_NOT_VERIFIED, COUNTY_CHECK_CHANGED: the check the caller saw is no longer
 * current; COUNTY_OUTSIDE_AREA: SERVED asked for an outside county; EXCEPTION_NOT_NEEDED: an exception for a county
 * inside the area; COVERAGE_ACCEPTED: already recorded on this check), VALIDATION_FAILED (REASON_REQUIRED, a
 * code-looking or card-looking reason).
 */
export async function recordCoverage(
  tx: Tx,
  actor: StaffActor,
  scope: DataScope,
  projectId: string,
  input: { countyVerificationId: string; exceptionReason?: string | null },
  kind: 'accept' | 'exception',
) {
  if (!scopeIncludesProject(scope, projectId)) throw new ApiError('NOT_FOUND')
  if (kind === 'exception' && !holds(actor, 'visit.approve_coverage_exception')) throw new ApiError('FORBIDDEN')
  const project = await tx
    .selectFrom('crm.projects')
    .select('id')
    .where('id', '=', projectId)
    .forUpdate()
    .executeTakeFirst()
  if (!project) throw new ApiError('NOT_FOUND')
  const conflict = (code: string, f = 'coverage') => new ApiError('CONFLICT', { fieldErrors: [field(f, code)] })
  const verified = await currentCountyVerification(tx, projectId)
  if (!verified) throw conflict('COUNTY_NOT_VERIFIED')
  if (verified.id !== input.countyVerificationId) throw conflict('COUNTY_CHECK_CHANGED', 'body.countyVerificationId')
  const outcome = confirmedCoverage(verified.in_area)
  if (kind === 'accept' && outcome !== 'served') throw conflict('COUNTY_OUTSIDE_AREA')
  if (kind === 'exception' && outcome === 'served') throw conflict('EXCEPTION_NOT_NEEDED')
  if (await acceptanceOn(tx, projectId, verified.id)) throw conflict('COVERAGE_ACCEPTED')
  const reason = kind === 'exception' ? text(input.exceptionReason) : null
  if (kind === 'exception') {
    if (!reason) throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.reason', 'REASON_REQUIRED')] })
    if (looksLikeAccessCode(reason) || looksLikeCardNumber(reason))
      throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.reason', 'sensitive_content')] })
  }
  const row = await tx
    .insertInto('crm.project_coverage_acceptances')
    .values({
      project_id: projectId,
      county_verification_id: verified.id,
      outcome,
      exception_reason: reason,
      accepted_by: actor.userId,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return {
    id: row.id,
    outcome,
    reason,
    countyVerificationId: verified.id,
    addressVersion: verified.address_version,
    county: verified.county,
    state: verified.state,
  }
}
