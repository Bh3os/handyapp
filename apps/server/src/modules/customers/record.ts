// The staff view of one customer record (TSK-0044; HH-CRM-01, HH-ID-02, HH-STAFF-05, OWN-DEC-117, OWN-DEC-143,
// RULE-SERVER-AUTHZ). Read by staff holding customer.view, inside their scope (TSK-0037):
// - the customer: stable ID, display name, status, provenance and customer-facing language (English);
// - each contact with its email and phone verification shown separately (OWN-DEC-96), the preferred channel and the
//   channel permissions as the send-time checks read them: the SMS opt-in with its records, opt-outs included
//   (HH-INT-22), and the separate marketing permission per channel with its history (ENT-ConsentPreference);
// - the authorized properties, the projects with their requests;
// - documents and payments: not available in this release (their records are built by later tasks), said as such,
//   never shown as an empty list;
// - notes (the customer's own and its requests'), each with its visibility class: a restricted note is masked for a
//   role that may not read it (it exists, its class and time; never its text or author) (HH-STAFF-05, OWN-DEC-143);
// - possible duplicates, for the roles holding customer.view_duplicates only, labelled as suggestions (HH-ID-02);
// - the activity history: submissions, handling, notes, record changes, consent records and messages, newest first,
//   with the same masking;
// - TSK-0046 (HH-CRM-04): a record that is not merged also shows the contacts, properties, notes and projects of the
//   customers merged into it and the projects linked to it (each item names the record it belongs to, which never
//   changes), and every merge and relink of the record with its reason, access recheck and reversal. A merged record
//   shows its own records, the survivor it was merged into and where each project is seen now.
import type { Db, Tx } from '@handyhub/db'
import { NOTE_VISIBILITIES } from '@handyhub/domain'
import { decide, readsVisibility, type Action, type Actor, type DataScope } from '@handyhub/policy'
import { sql } from 'kysely'
import { customerInScope } from '../../platform/data-scope.js'
import { contactBadges } from '../verification/contact-verification.js'
import { groupMembers, linkHistory, projectCustomers, projectsUnder } from './links.js'

type Reader = Db | Tx
export type StaffRef = { id: string; name: string | null }

/** PROPOSED: the activity history shows the newest 200 entries; the record's own sections hold everything else. */
export const TIMELINE_LIMIT = 200

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Whether the caller may take an action on the record. Every write here sends its required reason, so availability
 * is decided as if it had one; the server decides again, with the reason given, when the action is sent.
 */
function allowed(actor: Actor, action: Action): boolean {
  return decide(actor, action, {}, { now: new Date(), online: true, reason: 'given' }).effect === 'allow'
}

export async function staffNames(db: Reader, ids: (string | null | undefined)[]): Promise<Map<string, StaffRef>> {
  const wanted = [...new Set(ids.filter((i): i is string => typeof i === 'string' && UUID.test(i)))]
  if (wanted.length === 0) return new Map()
  const rows = await db
    .selectFrom('identity.staff_users')
    .select(['id', 'display_name'])
    .where('id', 'in', wanted)
    .execute()
  return new Map(rows.map((r) => [r.id, { id: r.id, name: r.display_name }]))
}

export type ConsentEntry = {
  purpose: string
  channel: string
  granted: boolean
  source: string
  disclosureVersion: string | null
  recordedAt: string
  /** The record was made for this contact; false: the same destination, recorded elsewhere (a STOP, another request). */
  ownRecord: boolean
}
type Permission = { state: 'granted' | 'withdrawn' | 'none'; since: string | null }

function permission(history: ConsentEntry[], purpose: string, channel: string): Permission {
  // History is newest first; the latest record is the current state (ENT-ConsentPreference).
  const latest = history.find((h) => h.purpose === purpose && h.channel === channel)
  return latest
    ? { state: latest.granted ? 'granted' : 'withdrawn', since: latest.recordedAt }
    : { state: 'none', since: null }
}

export type TimelineEntry = {
  at: string
  kind: string
  actor: { kind: 'staff' | 'customer' | 'system'; name: string | null }
  reference: string | null
  codes: string[]
  channel: string | null
  state: string | null
}

export type CustomerRecordView = Awaited<ReturnType<typeof buildView>>

/** The customer's ID when it exists inside the scope; null otherwise (an altered ID finds nothing). */
export async function findCustomer(db: Reader, scope: DataScope, customerId: string): Promise<string | null> {
  if (!UUID.test(customerId)) return null
  const row = await db
    .selectFrom('crm.customers as cu')
    .select('cu.id')
    .where('cu.id', '=', customerId)
    .where(customerInScope('cu.id', scope))
    .executeTakeFirst()
  return row?.id ?? null
}

/**
 * The full staff view of a customer, or null when it does not exist or lies outside the scope. `revealedIncidents`
 * lists the restricted incident notes this read showed in full, for the audit event the matrix requires.
 */
export async function staffCustomerView(db: Reader, scope: DataScope, customerId: string, actor: Actor) {
  const id = await findCustomer(db, scope, customerId)
  if (!id) return null
  return buildView(db, id, actor)
}

async function buildView(db: Reader, id: string, actor: Actor) {
  const now = new Date()
  const customer = await db
    .selectFrom('crm.customers')
    .select(['id', 'display_name', 'status', 'merged_into_id', 'provenance', 'language', 'created_at', 'version'])
    .where('id', '=', id)
    .executeTakeFirstOrThrow()
  // TSK-0046 (HH-CRM-04): a customer that is not merged shows its own records and those of the customers merged into
  // it (each still on its own record, never moved), and the projects linked to it; a merged record shows its own.
  const merged = customer.status === 'merged'
  const members = merged ? [id] : await groupMembers(db, [id])
  const contacts = await db
    .selectFrom('crm.contacts')
    .select([
      'id',
      'customer_id',
      'full_name',
      'email',
      'phone_e164',
      'email_verification',
      'phone_verification',
      'preferred_channel',
      'is_primary',
      'created_at',
      'version',
    ])
    .where('customer_id', 'in', members)
    .orderBy(sql<number>`(customer_id = ${id}::uuid)::int`, 'desc')
    .orderBy('is_primary', 'desc')
    .orderBy('created_at')
    .orderBy('id')
    .execute()
  const contactIds = contacts.map((c) => c.id)
  const destinations = contacts.flatMap((c) => [c.email.trim().toLowerCase(), c.phone_e164])
  const consents = destinations.length
    ? await db
        .selectFrom('platform.consent_records')
        .select([
          'purpose',
          'channel',
          'destination',
          'granted',
          'source',
          'disclosure_version',
          'recorded_at',
          'subject_kind',
          'subject_id',
        ])
        .where('destination', 'in', destinations)
        .orderBy('seq', 'desc')
        .execute()
    : []

  const contactViews = []
  for (const c of contacts) {
    const badges = await contactBadges(db, c, now)
    const email = c.email.trim().toLowerCase()
    const history: ConsentEntry[] = consents
      .filter((r) => (r.channel === 'email' ? r.destination === email : r.destination === c.phone_e164))
      .map((r) => ({
        purpose: r.purpose,
        channel: r.channel,
        granted: r.granted,
        source: r.source,
        disclosureVersion: r.disclosure_version,
        recordedAt: r.recorded_at.toISOString(),
        ownRecord: r.subject_kind === 'customer_contact' && r.subject_id === c.id,
      }))
    contactViews.push({
      id: c.id,
      customerId: c.customer_id,
      fullName: c.full_name,
      email: c.email,
      phone: c.phone_e164,
      preferredChannel: c.preferred_channel,
      isPrimary: c.is_primary,
      version: c.version,
      verification: badges,
      permissions: {
        sms: permission(history, 'transactional_sms', 'sms'),
        marketingEmail: permission(history, 'marketing', 'email'),
        marketingSms: permission(history, 'marketing', 'sms'),
      },
      consentHistory: history,
    })
  }

  const properties = await db
    .selectFrom('crm.customer_properties as cp')
    .innerJoin('crm.properties as p', 'p.id', 'cp.property_id')
    .select([
      'p.id',
      'p.street',
      'p.unit',
      'p.city',
      'p.state',
      'p.zip',
      'p.property_type',
      'p.coverage_result',
      'cp.relationship',
      'cp.customer_id',
    ])
    .where('cp.customer_id', 'in', members)
    .orderBy('cp.created_at')
    .execute()

  const projectIds = merged
    ? (await db.selectFrom('crm.projects').select('id').where('customer_id', '=', id).execute()).map((p) => p.id)
    : await projectsUnder(db, id)
  const projects = projectIds.length
    ? await db
        .selectFrom('crm.projects')
        .select(['id', 'reference', 'state', 'created_at', 'property_id', 'customer_id'])
        .where('id', 'in', projectIds)
        .orderBy('created_at', 'desc')
        .orderBy('id')
        .execute()
    : []
  const currentOf = await projectCustomers(db, projectIds)
  const requests = projectIds.length
    ? await db
        .selectFrom('intake.requests')
        .select(['id', 'reference', 'state', 'project_id', 'submitted_at', 'contact_id'])
        .where('project_id', 'in', projectIds)
        .orderBy('submitted_at', 'desc')
        .execute()
    : []
  const requestIds = requests.map((r) => r.id)
  const refOf = new Map(requests.map((r) => [r.id, r.reference]))

  // Notes: the customer's own and those of its requests, each with its class.
  const customerNotes = await db
    .selectFrom('crm.customer_notes')
    .select(['id', 'author_staff_id', 'visibility', 'body', 'created_at'])
    .where('customer_id', 'in', members)
    .execute()
  const requestNotes = requestIds.length
    ? await db
        .selectFrom('intake.request_notes')
        .select(['id', 'request_id', 'project_id', 'author_staff_id', 'visibility', 'body', 'created_at'])
        .where('request_id', 'in', requestIds)
        .execute()
    : []
  const decisions = requestIds.length
    ? await db
        .selectFrom('intake.request_decisions')
        .select(['request_id', 'action', 'decided_by', 'decided_at'])
        .where('request_id', 'in', requestIds)
        .execute()
    : []
  const assignments = requestIds.length
    ? await db
        .selectFrom('intake.request_assignments')
        .select(['request_id', 'assigned_by', 'assigned_at'])
        .where('request_id', 'in', requestIds)
        .execute()
    : []
  const changes = await db
    .selectFrom('crm.record_changes')
    .select(['record_type', 'fields', 'changed_by', 'changed_at'])
    .where('customer_id', 'in', members)
    .execute()
  const messages = contactIds.length
    ? await db
        .selectFrom('platform.message_deliveries')
        .select(['message_key', 'channel', 'state', 'created_at', 'record_type', 'record_id'])
        .where('recipient_kind', '=', 'customer_contact')
        .where('recipient_id', 'in', contactIds)
        .execute()
    : []

  const mayViewDuplicates = allowed(actor, 'customer.view_duplicates')
  const matches = mayViewDuplicates
    ? await db
        .selectFrom('crm.candidate_matches as m')
        .select([
          'm.id',
          'm.customer_id',
          'm.candidate_customer_id',
          'm.reasons',
          'm.status',
          'm.detected_at',
          'm.version',
        ])
        .where((eb) => eb.or([eb('m.customer_id', '=', id), eb('m.candidate_customer_id', '=', id)]))
        .orderBy('m.detected_at', 'desc')
        .execute()
    : []
  const matchEvents = matches.length
    ? await db
        .selectFrom('crm.candidate_match_events')
        .select(['match_id', 'event', 'reasons', 'reason', 'staff_id', 'recorded_at'])
        .where(
          'match_id',
          'in',
          matches.map((m) => m.id),
        )
        .orderBy('recorded_at')
        .execute()
    : []
  const otherIds = matches.map((m) => (m.customer_id === id ? m.candidate_customer_id : m.customer_id))
  const others = otherIds.length
    ? await db
        .selectFrom('crm.customers')
        .select(['id', 'display_name', 'status'])
        .where('id', 'in', otherIds)
        .execute()
    : []
  const otherOf = new Map(others.map((o) => [o.id, o]))

  const links = await linkHistory(db, members, projectIds)
  const linkNames = new Map(
    (
      await db
        .selectFrom('crm.customers')
        .select(['id', 'display_name', 'merged_into_id'])
        .where('id', 'in', [id, ...(customer.merged_into_id ? [customer.merged_into_id] : [])])
        .execute()
    ).map((c) => [c.id, c.display_name]),
  )

  const names = await staffNames(db, [
    ...customerNotes.map((n) => n.author_staff_id),
    ...requestNotes.map((n) => n.author_staff_id),
    ...decisions.map((d) => d.decided_by),
    ...assignments.map((a) => a.assigned_by),
    ...changes.map((c) => c.changed_by),
    ...matchEvents.map((e) => e.staff_id),
  ])
  const ref = (sid: string | null): StaffRef | null => (sid ? (names.get(sid) ?? { id: sid, name: null }) : null)
  const staffActor = (sid: string | null) => ({ kind: 'staff' as const, name: ref(sid)?.name ?? null })

  // Each note's class decides who reads it; a restricted note the caller may not read is masked.
  const revealedIncidents: string[] = []
  const projectOfRequest = new Map(requests.map((r) => [r.id, r.project_id]))
  type NoteView = {
    id: string
    source: 'customer' | 'request'
    requestReference: string | null
    visibility: string
    masked: boolean
    body: string | null
    author: StaffRef | null
    createdAt: string
  }
  const noteViews: NoteView[] = [
    ...customerNotes.map((n) => ({
      ...n,
      source: 'customer' as const,
      request_id: null as string | null,
      project_id: null,
    })),
    ...requestNotes.map((n) => ({ ...n, source: 'request' as const })),
  ].map((n) => {
    const read = readsVisibility(
      actor,
      n.visibility,
      {
        ownerStaffId: n.author_staff_id,
        ...(n.request_id ? { projectId: projectOfRequest.get(n.request_id) as string } : {}),
      },
      now,
    )
    if (read.allowed && read.audit && n.visibility === 'restricted_incident') revealedIncidents.push(n.id)
    return {
      id: n.id,
      source: n.source,
      requestReference: n.request_id ? (refOf.get(n.request_id) ?? null) : null,
      visibility: n.visibility,
      masked: !read.allowed,
      body: read.allowed ? n.body : null,
      author: read.allowed ? ref(n.author_staff_id) : null,
      createdAt: n.created_at.toISOString(),
    }
  })
  noteViews.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))

  const timeline: TimelineEntry[] = []
  const entry = (e: Partial<TimelineEntry> & Pick<TimelineEntry, 'at' | 'kind' | 'actor'>) =>
    timeline.push({ reference: null, codes: [], channel: null, state: null, ...e })
  for (const r of requests)
    entry({
      at: r.submitted_at.toISOString(),
      kind: 'request_submitted',
      actor: { kind: 'customer', name: null },
      reference: r.reference,
      state: r.state,
    })
  for (const a of assignments)
    entry({
      at: a.assigned_at.toISOString(),
      kind: 'request_assigned',
      actor: staffActor(a.assigned_by),
      reference: refOf.get(a.request_id) ?? null,
    })
  for (const d of decisions)
    entry({
      at: d.decided_at.toISOString(),
      kind: 'request_decision',
      actor: staffActor(d.decided_by),
      reference: refOf.get(d.request_id) ?? null,
      codes: [d.action],
    })
  for (const n of noteViews)
    entry({
      at: n.createdAt,
      kind: n.source === 'customer' ? 'customer_note' : 'request_note',
      actor: n.masked ? { kind: 'staff', name: null } : { kind: 'staff', name: n.author?.name ?? null },
      reference: n.requestReference,
      codes: [n.visibility],
    })
  for (const c of changes)
    entry({
      at: c.changed_at.toISOString(),
      kind: c.record_type === 'customer' ? 'customer_changed' : 'contact_changed',
      actor: staffActor(c.changed_by),
      codes: c.fields,
    })
  for (const c of contactViews)
    for (const h of c.consentHistory)
      entry({
        at: h.recordedAt,
        kind: h.granted ? 'consent_granted' : 'consent_withdrawn',
        actor: {
          kind:
            h.source === 'staff_recorded'
              ? 'staff'
              : h.source === 'request_form' || h.source === 'portal'
                ? 'customer'
                : 'system',
          name: null,
        },
        codes: [h.purpose, h.source],
        channel: h.channel,
      })
  for (const m of messages)
    entry({
      at: m.created_at.toISOString(),
      kind: 'message',
      actor: { kind: 'system', name: null },
      reference: m.record_type === 'request' && m.record_id ? (refOf.get(m.record_id) ?? null) : null,
      codes: [m.message_key],
      channel: m.channel,
      state: m.state,
    })
  for (const l of links) {
    entry({
      at: l.at,
      kind: l.kind === 'merge' ? 'customer_merged' : 'request_relinked',
      actor: { kind: 'staff', name: l.by.name },
      reference: l.requestReference,
    })
    if (l.reversal)
      entry({
        at: l.reversal.at,
        kind: 'link_reversed',
        actor: { kind: 'staff', name: l.reversal.by.name },
        reference: l.requestReference,
      })
  }
  for (const e of matchEvents)
    entry({
      at: e.recorded_at.toISOString(),
      kind: `candidate_${e.event}`,
      actor: e.staff_id ? staffActor(e.staff_id) : { kind: 'system', name: null },
      codes: e.reasons,
    })
  timeline.sort((a, b) => b.at.localeCompare(a.at) || a.kind.localeCompare(b.kind))

  const candidates = matches.map((m) => {
    const otherId = m.customer_id === id ? m.candidate_customer_id : m.customer_id
    const other = otherOf.get(otherId)
    const review = [...matchEvents]
      .reverse()
      .find((e) => e.match_id === m.id && (e.event === 'dismissed' || e.event === 'merge_reversed'))
    return {
      id: m.id,
      version: m.version,
      customer: { id: otherId, displayName: other?.display_name ?? '', status: other?.status ?? 'active' },
      reasons: m.reasons,
      status: m.status,
      detectedAt: m.detected_at.toISOString(),
      lastReview:
        review && m.status === 'dismissed'
          ? { by: ref(review.staff_id), reason: review.reason ?? '', at: review.recorded_at.toISOString() }
          : null,
    }
  })

  const editable = customer.status !== 'merged'
  return {
    id: customer.id,
    displayName: customer.display_name,
    status: customer.status,
    mergedIntoId: customer.merged_into_id,
    mergedInto: customer.merged_into_id
      ? { id: customer.merged_into_id, displayName: linkNames.get(customer.merged_into_id) ?? '' }
      : null,
    provenance: customer.provenance,
    language: customer.language,
    createdAt: customer.created_at.toISOString(),
    version: customer.version,
    contacts: contactViews,
    properties: properties.map((p) => ({
      id: p.id,
      street: p.street,
      unit: p.unit,
      city: p.city,
      state: p.state,
      zip: p.zip,
      propertyType: p.property_type,
      coverage: p.coverage_result,
      relationship: p.relationship,
      customerId: p.customer_id,
    })),
    projects: projects.map((p) => ({
      id: p.id,
      reference: p.reference,
      state: p.state,
      createdAt: p.created_at.toISOString(),
      // The customer the project was created for, and the one staff see it under now (TSK-0046).
      customerId: p.customer_id,
      currentCustomerId: currentOf.get(p.id) ?? p.customer_id,
      requests: requests
        .filter((r) => r.project_id === p.id)
        .map((r) => ({ id: r.id, reference: r.reference, state: r.state, submittedAt: r.submitted_at.toISOString() })),
    })),
    // Not built yet (estimates, invoices and payments arrive with later tasks): said so, never an empty list.
    documents: { state: 'not_available' as const },
    payments: { state: 'not_available' as const },
    notes: noteViews,
    candidates: { visible: mayViewDuplicates, items: candidates },
    links,
    timeline: timeline.slice(0, TIMELINE_LIMIT),
    timelineTruncated: timeline.length > TIMELINE_LIMIT,
    actions: {
      edit: editable && allowed(actor, 'customer.edit'),
      addNote: editable && allowed(actor, 'request.add_note'),
      recordWithdrawal: allowed(actor, 'customer.edit'),
      reviewCandidates: mayViewDuplicates && allowed(actor, 'customer.merge'),
      merge: editable && allowed(actor, 'customer.merge'),
      relink: allowed(actor, 'request.correct_link'),
      reverseLinks: allowed(actor, 'customer.reverse_link_change'),
      noteVisibilities: [...NOTE_VISIBILITIES],
    },
    revealedIncidents,
  }
}
