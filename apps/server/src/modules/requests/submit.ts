// Request submission (TSK-0025; HH-INT-10, HH-INT-11, HH-ID-01, HH-INT-21, HH-ARC-08, OWN-DEC-93, OWN-DEC-97).
// One transaction creates the customer, contact, property, project and request with its services and answers, and
// writes the request.submitted outbox event (staff intake item, receipt, access instructions consume it). The API
// framework's idempotency record commits in the same transaction, so a double tap or a retry returns this same result.
// - Never matched to an existing customer: every submission creates new records; staff see matching details only as
//   duplicate suggestions (HH-ID-02) and link records on review (HH-CRM-04).
// - Coverage never blocks a request; until the coverage rules exist it is recorded as unknown (OWN-DEC-88, TSK-0022).
// - Spam controls are quiet: signals flag the request for staff review; nothing is refused or discarded for them.
import { randomBytes } from 'node:crypto'
import { registryServices, type Tx } from '@handyhub/db'
import { PROJECT_MACHINE, REQUEST_MACHINE } from '@handyhub/domain'
import { ApiError } from '../../api/errors.js'
import { loadConfig, requireConfigured } from '../../platform/config/index.js'
import { outbox } from '../../platform/outbox.js'
import {
  localDate,
  normalizeUsPhone,
  semanticProblems,
  serviceQuestions,
  type SubmitBody,
} from '@handyhub/domain/request-form'

export { localDate, normalizeUsPhone, semanticProblems }

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

export type Submitted = { requestId: string; projectId: string; reference: string; submittedAt: Date }

export async function submitRequest(
  tx: Tx,
  body: SubmitBody,
  opts: { idempotencyKey: string; requestId: string; now?: Date },
): Promise<Submitted & { serviceCodes: string[]; spamSuspected: boolean }> {
  const now = opts.now ?? new Date()
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
  })
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
      coverage_result: 'unknown',
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
      coverage_result: 'unknown',
      spam_suspected: spamSuspected,
      spam_signals: signals,
      original_submission: JSON.stringify(original),
    })
    .returning(['id', 'submitted_at'])
    .executeTakeFirstOrThrow()
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
  }
}
