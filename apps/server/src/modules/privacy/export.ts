// The data export of a completed export request (TSK-0100; HH-PRIV-03, ENT-PrivacyRequest, OWN-DEC-113,
// OQ-PRIVACY-REQUESTS). Read when the customer downloads it, from the records as they are then, for the requester
// only: their customer name, their own contact values, their sign-in values, the properties and requests they
// submitted, the estimate versions they received, their approvals, the consent records of their
// own contact values, the privacy requests they made, the Request to Reschedule / Request Cancellation they made of
// their appointments (TSK-0066: their own words and preferred times, the appointment's number and the request's
// state; the staff decision reason and the cancellation outcome are staff handling) and photo counts. Other contacts of the customer (third parties),
// staff-only notes and handling (the job packets of TSK-0069 are staff work records; the appointment reminders of
// TSK-0067, like every message record, are not in the export), staff details and audit entries are excluded and named so (PROPOSED; the attorney
// reviews what an export must hold). The answer is the PRIVACY_EXPORT customer view (allow-listed fields only).
// TSK-0152 (OWN-DEC-201 I2): "Do not categorically exclude information solely because it originates in an audit log;
// evaluate disclosure rights and exceptions." The export now holds the requester's own data found in audit entries
// (activity): every entry of their own actions, and the entries about their own records (their privacy requests,
// their contact record and their login accounts), each with its time, action, record kind, result and who acted, as
// the requester, HandyHub staff (never a name) or automatically. Redacted, as restricted internal records or
// third-party information: the entries' summaries and reasons (staff reasoning, other people's values), staff
// identities, and entries about staff handling, internal notes, cases and other records (PROPOSED; the attorney
// confirms the exceptions, OQ-ATTORNEY-PRIVACY).
import type { Db, Tx } from '@handyhub/db'
import { CUSTOMER_STATES } from '../estimates/model.js'
import { customerVersionStatus } from '../estimates/responses.js'
import { customerVisiblePhoto, type ExportRecord } from '../records/index.js'

type Reader = Db | Tx

export const EXPORT_EXCLUDED = [
  'third_party_contacts',
  'staff_notes_and_handling',
  'staff_details',
  // TSK-0152 (OWN-DEC-201 I2): audit entries are in `activity`; their summaries, reasons and staff identities, and the
  // entries about restricted internal records, are not.
  'audit_entry_details',
  'restricted_audit_entries',
] as const

/** TSK-0152: the requester's own records whose audit entries by others are disclosed (PROPOSED). */
export const ACTIVITY_RECORD_TYPES = ['privacy_request', 'contact', 'customer_account'] as const

export async function customerExport(
  db: Reader,
  who: { customerId: string; contactId: string; accountId: string | null },
  now = new Date(),
): Promise<ExportRecord> {
  const customer = await db
    .selectFrom('crm.customers')
    .select('display_name')
    .where('id', '=', who.customerId)
    .executeTakeFirstOrThrow()
  const contact = await db
    .selectFrom('crm.contacts')
    .select(['full_name', 'email', 'phone_e164', 'preferred_channel', 'email_normalized'])
    .where('id', '=', who.contactId)
    .executeTakeFirstOrThrow()
  const account = await db
    .selectFrom('identity.customer_accounts')
    .select(['sign_in_email', 'sign_in_phone', 'created_at'])
    .where('customer_id', '=', who.customerId)
    .where('state', '=', 'active')
    .where((eb) =>
      eb.or([eb('contact_id', '=', who.contactId), ...(who.accountId ? [eb('id', '=', who.accountId)] : [])]),
    )
    .orderBy('created_at')
    .executeTakeFirst()
  // The requester's own requests only: another contact's requests of the same customer are third-party records.
  const requests = await db
    .selectFrom('intake.requests')
    .select([
      'id',
      'reference',
      'submitted_at',
      'not_sure',
      'other_services_text',
      'description',
      'preferred_date',
      'flexible',
      'need_help_today',
      'time_windows',
      'estimate_preference',
      'preferred_channel',
      'sms_opt_in',
      'marketing_opt_in',
      'project_id',
      'property_id',
    ])
    .where('customer_id', '=', who.customerId)
    .where('contact_id', '=', who.contactId)
    .orderBy('submitted_at')
    .execute()
  const propertyIds = [...new Set(requests.map((r) => r.property_id))]
  const properties = propertyIds.length
    ? await db
        .selectFrom('crm.properties as p')
        .select(['p.street', 'p.unit', 'p.city', 'p.state', 'p.zip', 'p.property_type'])
        .where('p.id', 'in', propertyIds)
        .orderBy('p.created_at')
        .execute()
    : []
  const requestIds = requests.map((r) => r.id)
  const services = requestIds.length
    ? await db
        .selectFrom('intake.request_services as s')
        .innerJoin('catalog.service_versions as v', (j) =>
          j.onRef('v.service_id', '=', 's.service_id').onRef('v.version', '=', 's.service_version'),
        )
        .select(['s.request_id', 'v.name'])
        .where('s.request_id', 'in', requestIds)
        .orderBy('s.position')
        .execute()
    : []
  const answers = requestIds.length
    ? await db
        .selectFrom('intake.request_answers')
        .select(['request_id', 'service_id', 'question_key', 'value_kind', 'value_number', 'value_text', 'unit'])
        .where('request_id', 'in', requestIds)
        .orderBy('question_key')
        .execute()
    : []
  const projectIds = [...new Set(requests.map((r) => r.project_id))]
  const estimates = projectIds.length
    ? await db
        .selectFrom('estimating.estimate_versions as v')
        .innerJoin('estimating.estimates as e', 'e.id', 'v.estimate_id')
        .select(['e.number', 'v.version', 'v.state', 'v.published_at', 'v.valid_until', 'v.total_cents'])
        .where('v.project_id', 'in', projectIds)
        .where('v.state', 'in', [...CUSTOMER_STATES])
        .orderBy('v.published_at')
        .execute()
    : []
  const approvals = projectIds.length
    ? await db
        .selectFrom('estimating.approvals as a')
        .innerJoin('estimating.estimates as e', 'e.id', 'a.estimate_id')
        .select(['e.number', 'a.version', 'a.created_at', 'a.full_name', 'a.total_cents', 'a.deposit_cents'])
        .where('a.project_id', 'in', projectIds)
        .orderBy('a.created_at')
        .execute()
    : []
  const destinations = [contact.email_normalized ?? contact.email.toLowerCase(), contact.phone_e164]
  const consents = await db
    .selectFrom('platform.consent_records')
    .select(['purpose', 'channel', 'granted', 'recorded_at'])
    .where('destination', 'in', destinations)
    .orderBy('seq')
    .execute()
  const privacyRequests = await db
    .selectFrom('privacy.privacy_requests')
    .select(['id', 'reference', 'kind', 'state', 'submitted_at'])
    .where('customer_id', '=', who.customerId)
    .where('contact_id', '=', who.contactId)
    .orderBy('reference')
    .execute()
  // The requester's own change requests of their appointments (TSK-0066, HH-PORT-04), never another contact's.
  const changeRequests = projectIds.length
    ? await db
        .selectFrom('work.visit_change_requests as c')
        .innerJoin('work.visits as v', 'v.id', 'c.visit_id')
        .innerJoin('crm.projects as p', 'p.id', 'c.project_id')
        .select([
          'p.reference',
          'v.number',
          'c.kind',
          'c.state',
          'c.reason',
          'c.preferred_times',
          'c.requested_at',
          'c.decided_at',
        ])
        .where('c.project_id', 'in', projectIds)
        .where('c.requested_by_contact', '=', who.contactId)
        .orderBy('c.requested_at')
        .orderBy('c.id')
        .execute()
    : []
  // TSK-0152 (OWN-DEC-201 I2): the requester's own data in audit entries, without summaries, reasons or staff names.
  const accountIds = (
    await db.selectFrom('identity.customer_accounts').select('id').where('contact_id', '=', who.contactId).execute()
  ).map((a) => a.id)
  const ownRecords = [
    { type: 'privacy_request', ids: privacyRequests.map((p) => p.id) },
    { type: 'contact', ids: [who.contactId] },
    { type: 'customer_account', ids: accountIds },
  ].filter((x) => x.ids.length > 0)
  const activity = await db
    .selectFrom('platform.audit_events')
    .select(['occurred_at', 'action', 'target_type', 'result', 'actor_kind', 'actor_id'])
    .where((eb) =>
      eb.or([
        eb.and([eb('actor_kind', '=', 'customer'), eb('actor_id', '=', who.contactId)]),
        ...ownRecords.map((x) => eb.and([eb('target_type', '=', x.type), eb('target_id', 'in', x.ids)])),
      ]),
    )
    .orderBy('seq')
    .execute()
  const photos = requestIds.length
    ? await db
        .selectFrom('intake.photos')
        .select('state')
        .where('request_id', 'in', requestIds)
        .where('state', '<>', 'removed')
        .where(customerVisiblePhoto)
        .execute()
    : []
  return {
    generatedAt: now,
    customer: { name: customer.display_name },
    contact: {
      fullName: contact.full_name,
      email: contact.email,
      phone: contact.phone_e164,
      preferredChannel: contact.preferred_channel,
    },
    account: account ? { email: account.sign_in_email, phone: account.sign_in_phone, since: account.created_at } : null,
    properties: properties.map((p) => ({
      street: p.street,
      unit: p.unit,
      city: p.city,
      state: p.state,
      zip: p.zip,
      propertyType: p.property_type,
    })),
    requests: requests.map((r) => ({
      reference: r.reference,
      submittedAt: r.submitted_at,
      services: services.filter((s) => s.request_id === r.id).map((s) => s.name),
      notSure: r.not_sure,
      otherServices: r.other_services_text,
      description: r.description,
      answers: answers
        .filter((a) => a.request_id === r.id)
        .map((a) => ({
          question: a.question_key,
          service: a.service_id,
          value: a.value_text ?? (a.value_number === null ? null : String(a.value_number)),
          unit: a.unit,
        })),
      preferredDate: r.preferred_date ? String(r.preferred_date).slice(0, 10) : null,
      flexible: r.flexible,
      needHelpToday: r.need_help_today,
      timeWindows: [...r.time_windows],
      estimatePreference: r.estimate_preference,
      preferredChannel: r.preferred_channel,
      smsOptIn: r.sms_opt_in,
      marketingOptIn: r.marketing_opt_in,
    })),
    estimates: estimates.flatMap((v) =>
      v.published_at && v.total_cents !== null
        ? [
            {
              number: v.number,
              version: v.version,
              status: customerVersionStatus(v.state, v.valid_until, now),
              publishedAt: v.published_at,
              totalCents: Number(v.total_cents),
            },
          ]
        : [],
    ),
    approvals: approvals.map((a) => ({
      number: a.number,
      version: a.version,
      approvedAt: a.created_at,
      fullName: a.full_name,
      totalCents: Number(a.total_cents),
      depositCents: a.deposit_cents === null ? null : Number(a.deposit_cents),
    })),
    consents: consents.map((c) => ({
      purpose: c.purpose,
      channel: c.channel,
      granted: c.granted,
      recordedAt: c.recorded_at,
    })),
    privacyRequests: privacyRequests.map((p) => ({
      reference: p.reference,
      kind: p.kind,
      state: p.state,
      submittedAt: p.submitted_at,
    })),
    appointmentRequests: changeRequests.map((c) => ({
      project: c.reference,
      appointment: c.number,
      kind: c.kind,
      state: c.state,
      reason: c.reason,
      preferredTimes: c.preferred_times,
      requestedAt: c.requested_at,
      endedAt: c.decided_at,
    })),
    activity: activity.map((a) => ({
      at: a.occurred_at,
      action: a.action,
      record: a.target_type,
      result: a.result,
      by:
        a.actor_kind === 'customer' && a.actor_id === who.contactId
          ? 'you'
          : a.actor_kind === 'staff'
            ? 'staff'
            : a.actor_kind === 'system'
              ? 'automatic'
              : 'other',
    })),
    photos: {
      received: photos.filter((p) => p.state === 'ready').length,
      processing: photos.filter((p) => p.state === 'quarantined').length,
      failed: photos.filter((p) => p.state === 'rejected').length,
    },
    excluded: [...EXPORT_EXCLUDED],
  }
}
