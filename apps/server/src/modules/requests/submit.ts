// Request submission (TSK-0025, TSK-0029; HH-INT-10, HH-INT-11, HH-ID-01, HH-INT-21, HH-INT-22, HH-ARC-08, OWN-DEC-93,
// OWN-DEC-97).
// One transaction creates the customer, contact, property, project and request with its services and answers, and
// writes the request.submitted outbox event (staff intake item, receipt, access instructions consume it). The API
// framework's idempotency record commits in the same transaction, so a double tap or a retry returns this same result.
// - Never matched to an existing customer: every submission creates new records; staff see matching details only as
//   duplicate suggestions (HH-ID-02) and link records on review (HH-CRM-04).
// - Coverage never blocks a request: the server looks the ZIP up in the active rule set and stores the outcome with the
//   rule set it came from; unknown while no rule set is active (OWN-DEC-88, TSK-0022). The browser's check is not trusted.
// - Spam controls are quiet: signals flag the request for staff review; nothing is refused or discarded for them.
// - One request per idempotency key, for as long as the request exists (TSK-0030; HH-INT-10, T11): the API's
//   idempotency record expires (IDEMPOTENCY_RETENTION_HOURS) long before a browser draft does (FACT-SESSION-TIMINGS),
//   so a key that already created a request is a conflict that names the request's reference, never a second request
//   and never an internal error.
import { randomBytes } from 'node:crypto'
import { registryServices, type Tx } from '@handyhub/db'
import { PROJECT_MACHINE, REQUEST_MACHINE } from '@handyhub/domain'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import { loadConfig, requireConfigured, type Config } from '../../platform/config/index.js'
import { outbox } from '../../platform/outbox.js'
import { lookupCoverage, type CoverageResult } from '../coverage/coverage.js'
import { isLegalVersion } from '../legal/index.js'
import { recordConsent } from '../notifications/index.js'
import { bindDraftPhotos, createCapability, PhotoError, type PhotoSummary } from '../photos/photos.js'
import {
  localDate,
  normalizeUsPhone,
  offeredWindows,
  type OfferedWindow,
  semanticProblems,
  serviceQuestions,
  type SubmitBody,
} from '@handyhub/domain/request-form'

export { localDate, normalizeUsPhone, semanticProblems }

/**
 * The coverage of the property's ZIP, or unknown when the lookup fails: a failed lookup never loses the request
 * (OWN-DEC-88). A savepoint keeps the submission's transaction usable after a failed statement.
 */
export async function coverageOrUnknown(tx: Tx, zip: string, lookup = lookupCoverage): Promise<CoverageResult> {
  await sql`SAVEPOINT coverage_lookup`.execute(tx)
  try {
    const result = await lookup(tx, zip)
    await sql`RELEASE SAVEPOINT coverage_lookup`.execute(tx)
    return result
  } catch {
    await sql`ROLLBACK TO SAVEPOINT coverage_lookup`.execute(tx)
    return { outcome: 'unknown', ruleSet: null }
  }
}

/** The preferred windows the form offers, from contact.hours and request.window_hours (HH-INT-02, TSK-0028). */
export function formWindows(config: Config): OfferedWindow[] {
  const visit = config.get('contact.hours')
  const hours = config.get('request.window_hours')
  return offeredWindows(
    visit.state === 'CONFIGURED' ? visit.value : null,
    hours.state === 'CONFIGURED' ? hours.value : null,
  )
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Public reference HH-XXXXXXXX: 40 random bits, never a sequence, so it reveals no volume (ENT-Request). */
export function newReference(): string {
  let out = ''
  for (const b of randomBytes(8)) out += CROCKFORD[b % 32]
  return `HH-${out}`
}

/** PROPOSED: a form sent less than 3 seconds after it opened is flagged (old repo, 32 D-32-08). */
export const FILLED_TOO_FAST_MS = 3000

export function spamSignals(body: SubmitBody, now: number): string[] {
  const signals: string[] = []
  if (body.website !== undefined && body.website.trim() !== '') signals.push('honeypot_filled')
  if (body.startedAt !== undefined && now - body.startedAt < FILLED_TOO_FAST_MS) signals.push('filled_too_fast')
  const links = `${body.description ?? ''} ${body.otherServicesText ?? ''}`.match(/https?:\/\//gi) ?? []
  if (links.length > 2) signals.push('many_links')
  return signals
}

/**
 * The consents the request form gives, each its own append-only record in the submission's transaction (TSK-0029;
 * HH-INT-18, HH-INT-22, HH-COM-05, ENT-ConsentPreference, OWN-DEC-147):
 * - the SMS opt-in: purpose transactional texts, channel SMS, the number, the disclosure version shown beside the box,
 *   source request form and the time;
 * - the marketing permission: purpose marketing on email and on SMS, with the privacy policy version presented as the
 *   notice version (it describes marketing use). A marketing text still needs the SMS opt-in as well at send time.
 * Neither implies the other, and submitting implies neither. PROPOSED: an unchecked box records nothing, so it is never
 * read as a withdrawal of an earlier choice made for the same email or number; the request keeps both answers.
 */
export async function recordFormConsents(
  tx: Tx,
  body: SubmitBody,
  ctx: { contactId: string; phone: string; requestId: string; reference: string; at: Date },
): Promise<void> {
  const common = {
    granted: true,
    source: 'request_form' as const,
    recordedBy: `customer:${ctx.contactId}`,
    subject: { kind: 'customer_contact' as const, id: ctx.contactId },
    evidence: { requestId: ctx.requestId, reference: ctx.reference },
    at: ctx.at,
  }
  if (body.smsOptIn)
    await recordConsent(tx, {
      ...common,
      purpose: 'transactional_sms',
      channel: 'sms',
      destination: ctx.phone,
      disclosureVersion: body.smsDisclosureVersion as string,
    })
  if (body.marketingOptIn) {
    const notice = { purpose: 'marketing' as const, disclosureVersion: body.privacyNoticeVersion }
    await recordConsent(tx, { ...common, ...notice, channel: 'email', destination: body.contact.email })
    await recordConsent(tx, { ...common, ...notice, channel: 'sms', destination: ctx.phone })
  }
}

export type Submitted = { requestId: string; projectId: string; reference: string; submittedAt: Date }

/**
 * The conflict for a key that already created a request (TSK-0030, HH-INT-10): it names that request's reference, so
 * the browser whose answer was lost gets it back. The key is a random value only that browser holds, and the reference
 * grants nothing (HH-INT-12).
 */
export async function existingRequestConflict(tx: Tx, idempotencyKey: string): Promise<ApiError | null> {
  const row = await tx
    .selectFrom('intake.requests')
    .select('reference')
    .where('idempotency_key', '=', idempotencyKey)
    .executeTakeFirst()
  return row ? new ApiError('IDEMPOTENCY_CONFLICT', { existing: { reference: row.reference } }) : null
}

/** The unique index on intake.requests.idempotency_key (migration 0011). */
const REQUEST_KEY_CONSTRAINT = 'requests_idempotency_key_key'

/**
 * A unique violation on the request's idempotency key as the conflict it is (a safety net behind the lookup in
 * submitRequest; the failed statement leaves the transaction unusable, so it names no reference), or null for any
 * other error.
 */
export function requestKeyTaken(err: unknown): ApiError | null {
  const e = err as { code?: unknown; constraint?: unknown } | null
  return e?.code === '23505' && e.constraint === REQUEST_KEY_CONSTRAINT ? new ApiError('IDEMPOTENCY_CONFLICT') : null
}

export async function submitRequest(
  tx: Tx,
  body: SubmitBody,
  opts: { idempotencyKey: string; requestId: string; now?: Date },
): Promise<
  Submitted & { serviceCodes: string[]; spamSuspected: boolean; photos: PhotoSummary; photoCapability: string | null }
> {
  const now = opts.now ?? new Date()
  // Before anything is written: a key that already created a request (its idempotency record may have expired). The
  // framework's advisory lock on the caller's key is held, so no other submission of this caller with this key runs
  // meanwhile; the unique index below catches any other caller's.
  const existing = await existingRequestConflict(tx, opts.idempotencyKey)
  if (existing) throw existing
  const config = await loadConfig(tx)
  const zone = requireConfigured(config.get('business.timezone')).value.zone
  const term = requireConfigured(config.get('payment.term_default'))
  const services = new Map((await registryServices(tx)).map((s) => [s.id, s]))

  // Each service's questions come from its registry intake inputs; an answer to anything else is refused.
  const questions = new Map(
    [...services.values()].map((s) => [
      s.id,
      serviceQuestions(s.intake as { guideInputs: string[] }).map((q) => q.key),
    ]),
  )
  const problems = semanticProblems(body, {
    today: localDate(now, zone),
    knownServices: new Set(services.keys()),
    questions,
    windows: formWindows(config).map((w) => w.code),
  })
  // The privacy policy version the page presented must be a published version (TSK-0024; HH-PRIV-04, HH-INT-19).
  if (!(await isLegalVersion(tx, 'legal.privacy_notice', body.privacyNoticeVersion)))
    problems.push({ field: 'body.privacyNoticeVersion', code: 'unknown_version', message: '' })
  // The SMS disclosure beside the box must be a published version too (TSK-0029; HH-INT-22, ENT-ConsentPreference).
  if (
    body.smsDisclosureVersion !== undefined &&
    !(await isLegalVersion(tx, 'legal.sms_disclosure', body.smsDisclosureVersion))
  )
    problems.push({ field: 'body.smsDisclosureVersion', code: 'unknown_version', message: '' })
  if (problems.length) throw new ApiError('VALIDATION_FAILED', { fieldErrors: problems })

  const signals = spamSignals(body, now.getTime())
  // A service the public site does not show yet is flagged for review, never refused (it may be a stale page).
  if (body.services.some((s) => services.get(s.serviceId)?.public_status === 'draft'))
    signals.push('service_not_public')
  const spamSuspected = signals.some((s) => s !== 'service_not_public')
  // The spam-control fields are signals, not part of the customer's submission.
  const original: Partial<SubmitBody> = { ...body }
  delete original.website
  delete original.startedAt
  // The photo capability is a secret; the photos themselves are bound below (TSK-0031).
  delete original.photoDraft

  const c = body.contact
  const customer = await tx
    .insertInto('crm.customers')
    .values({ display_name: c.fullName, provenance: 'request_submission' })
    .returning('id')
    .executeTakeFirstOrThrow()
  const contact = await tx
    .insertInto('crm.contacts')
    .values({
      customer_id: customer.id,
      full_name: c.fullName,
      email: c.email.trim(),
      phone_e164: normalizeUsPhone(c.phone) as string,
      preferred_channel: c.preferredChannel,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const p = body.property
  const coverage = await coverageOrUnknown(tx, p.zip)
  const property = await tx
    .insertInto('crm.properties')
    .values({
      street: p.street.trim(),
      unit: p.unit?.trim() || null,
      city: p.city.trim(),
      state: p.state.toUpperCase(),
      zip: p.zip,
      property_type: p.propertyType,
      // Every served property is in the business time zone (FACT-TIMEZONE); staff correct it if ever needed.
      time_zone: zone,
      coverage_result: coverage.outcome,
      coverage_rule_set: coverage.ruleSet,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  await tx
    .insertInto('crm.customer_properties')
    .values({ customer_id: customer.id, property_id: property.id, relationship: 'requester' })
    .execute()
  const reference = newReference()
  const project = await tx
    .insertInto('crm.projects')
    .values({
      reference,
      customer_id: customer.id,
      property_id: property.id,
      state: PROJECT_MACHINE.initial,
      payment_term: term.value.term,
      payment_term_version: term.version,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  const request = await tx
    .insertInto('intake.requests')
    .values({
      reference,
      project_id: project.id,
      customer_id: customer.id,
      contact_id: contact.id,
      property_id: property.id,
      state: REQUEST_MACHINE.initial,
      source: 'public_form',
      idempotency_key: opts.idempotencyKey,
      submitted_at: now,
      privacy_notice_version: body.privacyNoticeVersion,
      form_version: body.formVersion,
      not_sure: body.notSure,
      description: body.description?.trim() || null,
      other_services_text: body.otherServicesText?.trim() || null,
      preferred_date: body.timing.preferredDate ?? null,
      flexible: body.timing.flexible,
      need_help_today: body.timing.needHelpToday,
      time_windows: body.timing.windows,
      estimate_preference: body.estimatePreference,
      preferred_channel: c.preferredChannel,
      sms_opt_in: body.smsOptIn,
      marketing_opt_in: body.marketingOptIn,
      coverage_result: coverage.outcome,
      coverage_rule_set: coverage.ruleSet,
      spam_suspected: spamSuspected,
      spam_signals: signals,
      original_submission: JSON.stringify(original),
    })
    .returning(['id', 'submitted_at'])
    .executeTakeFirstOrThrow()
    .catch((err: unknown) => {
      throw requestKeyTaken(err) ?? err
    })
  if (body.services.length)
    await tx
      .insertInto('intake.request_services')
      .values(
        body.services.map((s, i) => ({
          request_id: request.id,
          position: i + 1,
          service_id: s.serviceId,
          service_version: services.get(s.serviceId)?.version ?? 1,
          notes: s.notes?.trim() || null,
        })),
      )
      .execute()
  if (body.answers?.length)
    await tx
      .insertInto('intake.request_answers')
      .values(
        body.answers.map((a) => ({
          request_id: request.id,
          service_id: a.serviceId ?? null,
          question_key: a.question,
          value_kind: a.kind,
          value_number: a.kind === 'number' ? String(a.number) : null,
          value_text: a.kind === 'text' ? (a.text ?? null) : null,
          unit: a.kind === 'number' ? (a.unit ?? null) : null,
          approximate: a.kind === 'number' ? (a.approximate ?? false) : false,
        })),
      )
      .execute()

  // The draft's photos, bound by the server to this request and project; a bad token binds nothing (TSK-0031).
  const photos = await bindDraftPhotos(tx, { token: body.photoDraft, requestId: request.id, projectId: project.id })
  // TSK-0032 (HH-INT-07, HH-INT-12): when the draft was bound, a capability for this request's photos only, so the
  // receipt can follow their states and retry a failed photo without a new request. PROPOSED: it lives as long as a
  // draft (session.timings.requestDraftDays), the only configured lifetime for request uploads.
  // A photo problem never loses the request: without a configured lifetime no capability is made (nothing is written
  // before that check), and the receipt then reports the counts without a retry.
  const photoCapability = photos.bound
    ? await createCapability(tx, { scope: 'request', requestId: request.id }, now).then(
        (c) => c.token,
        (err: unknown) => {
          if (err instanceof PhotoError) return null
          throw err
        },
      )
    : null

  await recordFormConsents(tx, body, {
    contactId: contact.id,
    phone: normalizeUsPhone(c.phone) as string,
    requestId: request.id,
    reference,
    at: now,
  })

  // One event per request (unique key): the staff intake item, the receipt and the access instructions consume it,
  // so a retry never sends a second receipt (HH-INT-20). Identifiers only, no personal data.
  await outbox.add(tx, {
    type: 'request.submitted',
    aggregate: { type: 'request', id: request.id, version: 1 },
    payload: { requestId: request.id, projectId: project.id, reference, spamSuspected },
    idempotencyKey: `request.submitted:${request.id}`,
    requestId: opts.requestId,
  })
  return {
    requestId: request.id,
    projectId: project.id,
    reference,
    submittedAt: request.submitted_at,
    serviceCodes: body.services.map((s) => services.get(s.serviceId)?.code ?? s.serviceId),
    spamSuspected,
    photos: { received: photos.received, processing: photos.processing, failed: photos.failed },
    photoCapability,
  }
}
