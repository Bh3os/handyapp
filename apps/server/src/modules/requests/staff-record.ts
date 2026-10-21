// The staff view of one request (TSK-0042; HH-LEAD-01, HH-LEAD-02, HH-SVC-04, OWN-DEC-116, RULE-SERVER-AUTHZ).
// - The original request exactly as the customer sent it: services, answers, description, full address, timing,
//   preferences and contact details come from the stored submission and its services and answers, which nothing can
//   edit. The current contact verification badges (email and phone separately) and the coverage outcome are shown
//   beside it, never mixed into it.
// - The handling record next to it: the responsible staff member and every reassignment, the latest qualification,
//   internal notes (staff only), each decision with its reason, the work packages, the next step and the follow-up
//   due time, and which actions this caller may take now.
// Read by staff holding request.view (Owner, Office, Estimator PROPOSED); workers are refused by the policy.
import type { Db, Tx } from '@handyhub/db'
import {
  eventsFrom,
  type NotAFitCategory,
  type Qualification,
  REQUEST_CLOSED_STATES,
  REQUEST_MACHINE,
  type RequestState,
  unqualifiedChecks,
} from '@handyhub/domain'
import { serviceQuestions } from '@handyhub/domain/request-form'
import { customerTranslator } from '@handyhub/i18n'
import { decide, type Action, type Actor } from '@handyhub/policy'

type Reader = Db | Tx
export type StaffRef = { id: string; name: string | null }

export type RequestActions = {
  askQuestion: boolean
  prepareOnlineEstimate: boolean
  arrangeEstimateVisit: boolean
  notAFit: boolean
  assign: boolean
  qualify: boolean
  addNote: boolean
}

/** PROPOSED next-step codes (HH-LEAD-01 "the request shows the next step"), labelled by the staff catalogs. */
export const NEXT_STEPS = [
  'qualify_and_choose',
  'waiting_on_customer',
  'offer_visit_windows',
  'prepare_estimate',
  'estimate_published',
  'owner_review',
  'closed',
] as const
export type NextStep = (typeof NEXT_STEPS)[number]

export function nextStepOf(state: RequestState, projectState: string): NextStep {
  if (projectState === 'cancellation_review') return 'owner_review'
  if ((REQUEST_CLOSED_STATES as readonly string[]).includes(state)) return 'closed'
  switch (state) {
    case 'needs_information':
      return 'waiting_on_customer'
    case 'needs_site_visit':
      return 'offer_visit_windows'
    case 'ready_for_estimate':
      return 'prepare_estimate'
    case 'estimated':
      return 'estimate_published'
    default:
      return 'qualify_and_choose'
  }
}

/** An event is open from a state directly, or after start_review when the request is still received. */
export function canSend(state: RequestState, event: string): boolean {
  const direct = eventsFrom(REQUEST_MACHINE, state) as string[]
  if (direct.includes(event)) return true
  return state === 'received' && (eventsFrom(REQUEST_MACHINE, 'reviewing') as string[]).includes(event)
}

function allowed(actor: Actor, action: Action, projectId: string): boolean {
  return decide(actor, action, { projectId }, { now: new Date(), online: true }).effect === 'allow'
}

/** Which actions the caller may take now: their grants and the request's state (the server checks both again). */
export function availableActions(actor: Actor, state: RequestState, projectState: string, projectId: string) {
  const projectOpen = projectState === 'open'
  return {
    askQuestion:
      projectOpen && allowed(actor, 'request.ask_question', projectId) && canSend(state, 'request_information'),
    prepareOnlineEstimate:
      projectOpen &&
      allowed(actor, 'request.choose_estimate_approach', projectId) &&
      canSend(state, 'mark_ready_for_estimate'),
    arrangeEstimateVisit:
      projectOpen &&
      allowed(actor, 'request.choose_estimate_approach', projectId) &&
      canSend(state, 'require_site_visit'),
    notAFit: projectOpen && allowed(actor, 'request.not_a_fit', projectId) && canSend(state, 'decline_not_a_fit'),
    assign: allowed(actor, 'request.assign', projectId),
    qualify: allowed(actor, 'request.qualify', projectId),
    addNote: allowed(actor, 'request.add_note', projectId),
  } satisfies RequestActions
}

/** What the customer sees for a Not a Fit decision, in the owner's wording (OWN-DEC-100); customer text is English. */
export function notAFitCustomerMessage(reason: string): string {
  return customerTranslator().t('decision.notAFit.customerMessage', { reason: reason.trim().replace(/[.!\s]+$/, '') })
}

async function staffNames(db: Reader, ids: (string | null | undefined)[]): Promise<Map<string, StaffRef>> {
  const wanted = [...new Set(ids.filter((i): i is string => typeof i === 'string' && i.length > 0))]
  if (wanted.length === 0) return new Map()
  const rows = await db
    .selectFrom('identity.staff_users')
    .select(['id', 'display_name'])
    .where('id', 'in', wanted)
    .execute()
  return new Map(rows.map((r) => [r.id, { id: r.id, name: r.display_name }]))
}

/** The latest qualification of a request, or null when none was recorded. */
export async function latestQualification(
  db: Reader,
  requestId: string,
): Promise<{ revision: number; checks: unknown; recorded_by: string; recorded_at: Date } | undefined> {
  return db
    .selectFrom('intake.request_qualifications')
    .select(['revision', 'checks', 'recorded_by', 'recorded_at'])
    .where('request_id', '=', requestId)
    .orderBy('revision', 'desc')
    .limit(1)
    .executeTakeFirst()
}

type Submitted = {
  property?: { street?: string; unit?: string; city?: string; state?: string; zip?: string; propertyType?: string }
  contact?: { fullName?: string; email?: string; phone?: string; preferredChannel?: string }
}

/** The full staff view of a request, or null when it does not exist. */
export async function staffRequestView(db: Reader, requestId: string, actor: Actor) {
  const r = await db
    .selectFrom('intake.requests as r')
    .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
    .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
    .select([
      'r.id',
      'r.reference',
      'r.state',
      'r.state_version',
      'r.source',
      'r.submitted_at',
      'r.form_version',
      'r.privacy_notice_version',
      'r.not_sure',
      'r.description',
      'r.other_services_text',
      'r.preferred_date',
      'r.flexible',
      'r.need_help_today',
      'r.time_windows',
      'r.estimate_preference',
      'r.preferred_channel',
      'r.sms_opt_in',
      'r.marketing_opt_in',
      'r.coverage_result',
      'r.coverage_rule_set',
      'r.spam_suspected',
      'r.spam_signals',
      'r.original_submission',
      'r.responsible_staff_id',
      'p.id as project_id',
      'p.reference as project_reference',
      'p.state as project_state',
      'c.email_verification',
      'c.phone_verification',
    ])
    .where('r.id', '=', requestId)
    .executeTakeFirst()
  if (!r) return null

  const services = await db
    .selectFrom('intake.request_services as rs')
    .innerJoin('catalog.services as s', 's.id', 'rs.service_id')
    .leftJoin('catalog.service_versions as v', (j) =>
      j.onRef('v.service_id', '=', 'rs.service_id').onRef('v.version', '=', 'rs.service_version'),
    )
    .select(['rs.service_id', 's.code', 'rs.notes', 'rs.position', 'v.intake'])
    .where('rs.request_id', '=', requestId)
    .orderBy('rs.position')
    .execute()
  const labels = new Map<string, string>()
  for (const s of services)
    for (const q of serviceQuestions((s.intake ?? { guideInputs: [] }) as { guideInputs: string[] }))
      if (!labels.has(q.key)) labels.set(q.key, q.label)
  const codeOf = new Map(services.map((s) => [s.service_id, s.code]))

  const answers = await db
    .selectFrom('intake.request_answers')
    .select(['service_id', 'question_key', 'value_kind', 'value_number', 'value_text', 'unit', 'approximate'])
    .where('request_id', '=', requestId)
    .execute()

  const assignments = await db
    .selectFrom('intake.request_assignments')
    .select(['staff_user_id', 'previous_staff_user_id', 'assigned_by', 'assigned_at'])
    .where('request_id', '=', requestId)
    .orderBy('assigned_at')
    .orderBy('id')
    .execute()
  const qualification = await latestQualification(db, requestId)
  const notes = await db
    .selectFrom('intake.request_notes')
    .select(['id', 'author_staff_id', 'body', 'created_at'])
    .where('request_id', '=', requestId)
    .orderBy('created_at')
    .orderBy('id')
    .execute()
  const decisions = await db
    .selectFrom('intake.request_decisions')
    .selectAll()
    .where('request_id', '=', requestId)
    .orderBy('decided_at')
    .orderBy('id')
    .execute()
  const packages = await db
    .selectFrom('work.work_packages as w')
    .innerJoin('catalog.services as s', 's.id', 'w.service_id')
    .select(['w.id', 'w.service_id', 's.code', 'w.position', 'w.state'])
    .where('w.project_id', '=', r.project_id)
    .orderBy('w.position')
    .execute()
  const item = await db
    .selectFrom('ops.queue_items')
    .select('due_at')
    .where('subject_type', '=', 'request')
    .where('subject_id', '=', requestId)
    .where('resolved_at', 'is', null)
    .where('due_at', 'is not', null)
    .orderBy('due_at')
    .limit(1)
    .executeTakeFirst()
  const catalog = await db.selectFrom('catalog.services').select(['id', 'code']).orderBy('code').execute()

  const names = await staffNames(db, [
    r.responsible_staff_id,
    ...assignments.flatMap((a) => [a.staff_user_id, a.previous_staff_user_id, a.assigned_by]),
    qualification?.recorded_by,
    ...notes.map((n) => n.author_staff_id),
    ...decisions.map((d) => d.decided_by),
  ])
  const ref = (id: string | null | undefined): StaffRef | null => (id ? (names.get(id) ?? { id, name: null }) : null)

  const sent = (r.original_submission ?? {}) as Submitted
  const state = r.state as RequestState
  const checks = (qualification?.checks ?? null) as Qualification | null
  return {
    id: r.id,
    reference: r.reference,
    state,
    version: r.state_version,
    source: r.source,
    submittedAt: r.submitted_at.toISOString(),
    formVersion: r.form_version,
    privacyNoticeVersion: r.privacy_notice_version,
    spam: { suspected: r.spam_suspected, signals: r.spam_signals },
    project: { id: r.project_id, reference: r.project_reference, state: r.project_state },
    original: {
      services: services.map((s) => ({ serviceId: s.service_id, code: s.code, notes: s.notes })),
      notSure: r.not_sure,
      otherServicesText: r.other_services_text,
      description: r.description,
      answers: answers.map((a) => ({
        serviceCode: a.service_id ? (codeOf.get(a.service_id) ?? null) : null,
        question: a.question_key,
        label: labels.get(a.question_key) ?? null,
        kind: a.value_kind,
        number: a.value_number === null ? null : Number(a.value_number),
        text: a.value_text,
        unit: a.unit,
        approximate: a.approximate,
      })),
      property: {
        street: sent.property?.street ?? '',
        unit: sent.property?.unit ?? null,
        city: sent.property?.city ?? '',
        state: (sent.property?.state ?? '').toUpperCase(),
        zip: sent.property?.zip ?? '',
        propertyType: sent.property?.propertyType ?? '',
      },
      timing: {
        preferredDate: r.preferred_date,
        flexible: r.flexible,
        needHelpToday: r.need_help_today,
        windows: r.time_windows,
      },
      estimatePreference: r.estimate_preference,
      preferredChannel: r.preferred_channel,
      smsOptIn: r.sms_opt_in,
      marketingOptIn: r.marketing_opt_in,
      contact: {
        fullName: sent.contact?.fullName ?? '',
        email: sent.contact?.email ?? '',
        phone: sent.contact?.phone ?? '',
      },
    },
    contactVerification: { email: r.email_verification, phone: r.phone_verification },
    coverage: { result: r.coverage_result, ruleSet: r.coverage_rule_set },
    responsibleStaff: ref(r.responsible_staff_id),
    assignments: assignments.map((a) => ({
      staff: ref(a.staff_user_id) as StaffRef,
      previous: ref(a.previous_staff_user_id),
      by: ref(a.assigned_by) as StaffRef,
      at: a.assigned_at.toISOString(),
    })),
    qualification: qualification
      ? {
          revision: qualification.revision,
          checks: checks ?? {},
          recordedBy: ref(qualification.recorded_by) as StaffRef,
          recordedAt: qualification.recorded_at.toISOString(),
        }
      : null,
    missingChecks: unqualifiedChecks(checks),
    notes: notes.map((n) => ({
      id: n.id,
      body: n.body,
      author: ref(n.author_staff_id) as StaffRef,
      createdAt: n.created_at.toISOString(),
    })),
    decisions: decisions.map((d) => ({
      id: d.id,
      action: d.action,
      event: d.event,
      fromState: d.from_state,
      toState: d.to_state,
      projectFromState: d.project_from_state,
      projectToState: d.project_to_state,
      reasonCategory: d.reason_category as NotAFitCategory | null,
      customerText: d.customer_text,
      // The customer's view of a published Not a Fit; the Owner routing publishes nothing to the customer.
      customerMessage: d.action === 'not_a_fit' && d.customer_text ? notAFitCustomerMessage(d.customer_text) : null,
      internalNote: d.internal_note,
      decidedBy: ref(d.decided_by) as StaffRef,
      decidedAt: d.decided_at.toISOString(),
    })),
    workPackages: packages.map((w) => ({
      id: w.id,
      serviceId: w.service_id,
      code: w.code,
      position: w.position,
      state: w.state,
    })),
    nextStep: nextStepOf(state, r.project_state),
    followUpDueAt: item?.due_at ? item.due_at.toISOString() : null,
    actions: availableActions(actor, state, r.project_state, r.project_id),
    serviceCatalog: catalog,
  }
}
