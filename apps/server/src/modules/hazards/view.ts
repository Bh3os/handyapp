// The reports of a job as the caller may see them (TSK-0077; HH-WORK-08, HH-WORK-09, HH-INC-02, HH-STAFF-05, T54,
// OWN-DEC-143, RULE-SERVER-AUTHZ).
// - Every staff member who may stop work on the job (its assigned workers, Office, the Estimator, the Owner) sees that a
//   report exists, its severity, whether it stopped work and where its hold stands.
// - A restricted report (an injury, an incident) shows what was reported, its text, resolution, photos and
//   stabilization only to the Owner and the worker who reported it; everyone else sees the masked record (OWN-DEC-143).
// - The work-paused customer notice is listed for the Owner only, who alone releases or dismisses it (OWN-DEC-152).
// - TSK-0129 (HH-PKT-09): the Owner's escalation contact in force (or NOT CONFIGURED) beside Call 911, and the recorded
//   Call Owner / Call 911 / Owner-unreachable taps: every one for the Owner, the caller's own for everyone else.
import type { Db, Tx } from '@handyhub/db'
import {
  HAZARD_REVIEWER,
  type HazardKind,
  type IssueCategory,
  type IssueSeverity,
  type NextOwner,
  type ReportKind,
} from '@handyhub/domain'
import { decide, type Action, type Resource, type StaffActor } from '@handyhub/policy'
import { escalationCalls, ownerEscalationContact } from '../escalation/store.js'
import { NOTICE_RECORD_TYPE, WORK_PAUSED_MESSAGE_KEY } from './actions.js'

type Reader = Db | Tx

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)
const allowed = (actor: StaffActor, action: Action, resource: Resource) =>
  decide(actor, action, resource, { now: new Date(), online: true }).effect === 'allow'

export async function reportsView(db: Reader, actor: StaffActor, jobId: string, resource: Resource) {
  const job = await db
    .selectFrom('work.jobs as j')
    .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
    .select(['j.id', 'j.project_id', 'j.operational_state', 'p.reference'])
    .where('j.id', '=', jobId)
    .executeTakeFirst()
  if (!job) return null
  const rows = await db
    .selectFrom('work.issue_reports as r')
    .leftJoin('work.holds as h', 'h.id', 'r.hold_id')
    .leftJoin('work.issue_report_reviews as v', 'v.report_id', 'r.id')
    .select([
      'r.id',
      'r.kind',
      'r.hazard',
      'r.category',
      'r.severity',
      'r.description',
      'r.affected_work_package_ids',
      'r.visibility',
      'r.next_owner',
      'r.people_kept_away',
      'r.emergency_services_called',
      'r.resolved_on_site',
      'r.resolution_what_happened',
      'r.resolution_steps',
      'r.resolution_materials',
      'r.resolution_check',
      'r.hold_id',
      'r.job_paused',
      'r.reported_by',
      'r.reported_at',
      'r.device_recorded_at',
      'h.state as hold_state',
      'h.version as hold_version',
      'v.reviewed_by',
      'v.reviewed_at',
      'v.note as review_note',
    ])
    .where('r.job_id', '=', jobId)
    .orderBy('r.reported_at', 'desc')
    .orderBy('r.id')
    .execute()
  const ids = rows.map((r) => r.id)
  const photos = ids.length
    ? await db
        .selectFrom('work.issue_report_photos')
        .select(['report_id', (eb) => eb.fn.countAll<string>().as('n')])
        .where('report_id', 'in', ids)
        .groupBy('report_id')
        .execute()
    : []
  const stabilizations = ids.length
    ? await db
        .selectFrom('work.stabilization_records')
        .selectAll()
        .where('report_id', 'in', ids)
        .orderBy('recorded_at')
        .execute()
    : []
  const owner = actor.roles.includes('owner')
  const notices =
    ids.length && owner
      ? await db
          .selectFrom('platform.message_deliveries')
          .select(['id', 'record_id', 'state', 'channel', 'error_code', 'created_at'])
          .where('record_type', '=', NOTICE_RECORD_TYPE)
          .where('record_id', 'in', ids)
          .where('message_key', '=', WORK_PAUSED_MESSAGE_KEY)
          .orderBy('seq')
          .execute()
      : []
  const people = [
    ...new Set([...rows.flatMap((r) => [r.reported_by, r.reviewed_by]), ...stabilizations.map((s) => s.recorded_by)]),
  ].filter((x): x is string => typeof x === 'string')
  const names = new Map(
    people.length
      ? (
          await db.selectFrom('identity.staff_users').select(['id', 'display_name']).where('id', 'in', people).execute()
        ).map((p) => [p.id, p.display_name])
      : [],
  )
  const ref = (id: string) => ({ id, name: names.get(id) ?? null })
  const packages = await db
    .selectFrom('work.work_packages as w')
    .innerJoin('catalog.services as s', 's.id', 'w.service_id')
    .select(['w.id', 'w.state', 's.code'])
    .where('w.job_id', '=', jobId)
    .orderBy('w.position')
    .execute()
  const facts = { ...resource, projectId: job.project_id }
  return {
    jobId: job.id,
    projectReference: job.reference,
    jobState: job.operational_state,
    reports: rows.map((r) => {
      const restricted = r.visibility === 'restricted_incident'
      // OWN-DEC-143: the Owner (audited by the route) and the reporting worker; nobody else.
      const reads = !restricted || allowed(actor, 'incident.view_restricted', { ...facts, ownerStaffId: r.reported_by })
      const mayAdd = !restricted || r.reported_by === actor.userId || owner
      const hazard = r.hazard as HazardKind | null
      return {
        reportId: r.id,
        kind: r.kind as ReportKind,
        restricted,
        hazard: reads ? hazard : null,
        category: reads ? (r.category as IssueCategory | null) : null,
        severity: r.severity as IssueSeverity,
        description: reads ? r.description : null,
        affectedWorkPackageIds: reads ? r.affected_work_package_ids : [],
        nextOwner: r.next_owner as NextOwner,
        peopleKeptAway: reads ? r.people_kept_away : null,
        emergencyServicesCalled: reads ? r.emergency_services_called : null,
        resolution:
          reads && r.resolved_on_site
            ? {
                whatHappened: r.resolution_what_happened ?? '',
                steps: r.resolution_steps ?? '',
                materials: r.resolution_materials ?? '',
                howChecked: r.resolution_check ?? '',
              }
            : null,
        reviewer: reads && hazard ? HAZARD_REVIEWER[hazard] : null,
        hold:
          r.hold_id && r.hold_state && r.hold_version !== null
            ? { holdId: r.hold_id, state: r.hold_state as 'open', version: r.hold_version }
            : null,
        jobPaused: r.job_paused,
        reportedBy: reads ? ref(r.reported_by) : { id: '', name: null },
        reportedAt: r.reported_at.toISOString(),
        deviceRecordedAt: iso(r.device_recorded_at),
        photos: reads ? Number(photos.find((p) => p.report_id === r.id)?.n ?? 0) : 0,
        stabilizations: reads
          ? stabilizations
              .filter((s) => s.report_id === r.id)
              .map((s) => ({
                id: s.id,
                trigger: s.trigger_text,
                actions: s.actions,
                whyNecessary: s.why_necessary,
                evidence: s.evidence,
                ownerNotifiedAt: iso(s.owner_notified_at),
                customerNotifiedAt: iso(s.customer_notified_at),
                followUp: s.follow_up,
                recordedBy: ref(s.recorded_by),
                recordedAt: s.recorded_at.toISOString(),
              }))
          : [],
        review:
          r.reviewed_by && r.reviewed_at
            ? { reviewedBy: ref(r.reviewed_by), reviewedAt: r.reviewed_at.toISOString(), note: r.review_note }
            : null,
        customerNotice: notices
          .filter((n) => n.record_id === r.id)
          .map((n) => ({
            deliveryId: n.id,
            state: n.state,
            channel: n.channel,
            errorCode: n.error_code,
            draftedAt: n.created_at.toISOString(),
            actions: { release: n.state === 'draft', dismiss: n.state === 'draft' },
          })),
        actions: {
          addPhoto: mayAdd && allowed(actor, 'job.add_photo', facts),
          recordStabilization: mayAdd && r.hold_id !== null && allowed(actor, 'job.report_issue', facts),
          review: r.hold_id === null && !r.reviewed_by && allowed(actor, 'issue_report.review', facts),
        },
      }
    }),
    workPackages: packages.map((p) => ({ workPackageId: p.id, serviceCode: p.code, state: p.state })),
    emergency: { call911: 'tel:911' },
    escalation: { owner: await ownerEscalationContact(db), calls: await escalationCalls(db, actor, jobId) },
    actions: {
      reportHazard: allowed(actor, 'hazard.report', facts),
      reportIssue: allowed(actor, 'job.report_issue', facts),
    },
  }
}
