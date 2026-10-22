// The customer project overview, read from the shared records (TSK-0038; HH-PORT-02, HH-PORT-03, HH-PORT-06,
// HH-ARC-04, HH-ARC-10, HH-PORT-01, T23, T24, RULE-SERVER-AUTHZ).
// - Every read goes through the caller's scope (TSK-0037): a project outside it is null, answered NOT_FOUND.
// - The status is the customer projection of the records (@handyhub/domain customerStatus): the request and project
//   states, and the staff decisions published to the customer. The records later tasks build (visit, hold, invoice)
//   are not read yet, so no appointment, hold or balance is ever claimed. TSK-0058: the approval is read (approved,
//   and a required deposit still due), so the step after approval is the owner's wording. TSK-0059: the job's deposit
//   is read (the amount due, verified and pending money, the staff-pasted Square link) for the payment summary and
//   the next step.
// - The timeline lists only what the customer may see: the request they sent, "More information needed", "Site
//   visit needed" with its customer explanation (OWN-DEC-99), and the Not a Fit decision in the owner's wording
//   (OWN-DEC-100). Internal notes, qualification, assignment, the Owner routing and every staff name stay on the
//   server: this module never selects them (HH-PORT-03, T24).
// - TSK-0063: the visits feed the status (windows offered for the customer to choose, a confirmed visit) and the
//   appointment beside it: the next confirmed visit with its date, arrival window, address, purpose and preparation
//   instructions (visits/offers.ts appointmentsOf, the same customer view as the Appointments tab).
// - TSK-0077: an open or under-review critical safety hold of the project makes the status "Work is paused for safety
//   review." and nothing more: the hazard, its report and every staff detail stay on the server.
import type { Db, Tx } from '@handyhub/db'
import {
  customerStatus,
  type CustomerStatus,
  type CustomerTimelineKind,
  type PortalFacts,
  type ProjectState,
  type RequestState,
} from '@handyhub/domain'
import type { DataScope } from '@handyhub/policy'
import { loadConfig } from '../../platform/config/index.js'
import { approvalFacts } from '../estimates/receipt.js'
import { customerDeposit, type CustomerDeposit } from '../finance/index.js'
import { findProject } from '../records/repository.js'
import { replyWindow } from '../questions/model.js'
import { notAFitCustomerMessage } from '../requests/staff-record.js'
import { appointmentsOf, overviewVisitFacts, type CustomerAppointment } from '../visits/offers.js'

type Reader = Db | Tx

/** What the customer timeline shows (HH-PORT-03), by code; the portal holds the English labels. */
type TimelineKind = CustomerTimelineKind
export type TimelineEntry = { kind: TimelineKind; at: Date; text: string | null }

/** The staff decisions a customer sees, and how; every other action (and the Owner routing) is internal. */
const PUBLISHED_DECISIONS: Readonly<Record<string, TimelineKind>> = {
  ask_question: 'more_information',
  arrange_estimate_visit: 'site_visit',
  not_a_fit: 'not_a_fit',
  // TSK-0051 (OWN-DEC-101).
  close_no_response: 'closed_no_response',
}

export type ProjectOverview = {
  reference: string
  services: string[]
  notSure: boolean
  submittedAt: Date
  status: CustomerStatus & { since: Date; text: string | null }
  timeline: TimelineEntry[]
  /**
   * Payment summary, shown beside the status and never merged into it. TSK-0059: the job's deposit while it is due
   * (or once verified money covers it); no invoice exists yet.
   */
  payment: CustomerDeposit
  /** The next confirmed visit (TSK-0063), or none. */
  appointment: CustomerAppointment | null
  refreshedAt: Date
  /** portal.refresh.pollSeconds; 0 while NOT CONFIGURED (the page then refreshes only when asked). */
  refreshSeconds: number
}

export type ProjectSummary = Pick<ProjectOverview, 'reference' | 'services' | 'notSure' | 'submittedAt'> & {
  status: CustomerStatus & { since: Date }
}

/** How often an open project view refreshes itself (HH-ARC-10); 0 while NOT CONFIGURED. */
export async function refreshSeconds(db: Reader): Promise<number> {
  const setting = (await loadConfig(db)).get('portal.refresh')
  return setting.state === 'CONFIGURED' ? setting.value.pollSeconds : 0
}

async function overviewFor(db: Reader, project: { id: string; reference: string }, now: Date) {
  const p = await db.selectFrom('crm.projects').select(['state']).where('id', '=', project.id).executeTakeFirstOrThrow()
  const r = await db
    .selectFrom('intake.requests')
    .select(['id', 'state', 'submitted_at', 'not_sure'])
    .where('project_id', '=', project.id)
    .executeTakeFirst()
  if (!r) return null
  const services = await db
    .selectFrom('intake.request_services as s')
    .innerJoin('catalog.service_versions as v', (j) =>
      j.onRef('v.service_id', '=', 's.service_id').onRef('v.version', '=', 's.service_version'),
    )
    .select('v.name')
    .where('s.request_id', '=', r.id)
    .orderBy('s.position')
    .execute()
  // Only the published decisions, and only their customer-facing columns (never internal_note or decided_by).
  const decisions = await db
    .selectFrom('intake.request_decisions')
    .select(['id', 'action', 'customer_text', 'decided_at'])
    .where('request_id', '=', r.id)
    .where('project_id', '=', project.id)
    .where('action', 'in', Object.keys(PUBLISHED_DECISIONS))
    .orderBy('decided_at')
    .orderBy('id')
    .execute()
  const entries: TimelineEntry[] = [{ kind: 'received', at: r.submitted_at, text: null }]
  for (const d of decisions) {
    const kind = PUBLISHED_DECISIONS[d.action] as TimelineKind
    const text =
      kind === 'not_a_fit' && d.customer_text
        ? notAFitCustomerMessage(d.customer_text)
        : kind === 'site_visit'
          ? d.customer_text
          : null
    entries.push({ kind, at: d.decided_at, text })
  }
  // TSK-0070 (HH-PORT-07): each visit's recorded "On my way" (the tap that moved it) and its first recorded "Arrived",
  // at their server times; nothing before a worker records them, and no worker, ETA or location.
  const visitTaps = await db
    .selectFrom('work.visits as v')
    .leftJoin('work.visit_departures as d', (j) => j.onRef('d.visit_id', '=', 'v.id').on('d.moved_visit', '=', true))
    .select([
      'v.id',
      'd.recorded_at as departed_at',
      (eb) =>
        eb
          .selectFrom('work.time_stamps as s')
          .select((x) => x.fn.min('s.recorded_at').as('first'))
          .whereRef('s.visit_id', '=', 'v.id')
          .where('s.kind', '=', 'arrived')
          .as('arrived_at'),
    ])
    .where('v.project_id', '=', project.id)
    .where('v.state', 'in', ['en_route', 'arrived', 'completed'])
    .execute()
  for (const v of visitTaps) {
    if (v.departed_at) entries.push({ kind: 'on_the_way', at: new Date(v.departed_at), text: null })
    if (v.arrived_at) entries.push({ kind: 'arrived', at: new Date(v.arrived_at), text: null })
  }
  entries.sort((a, b) => a.at.getTime() - b.at.getTime())
  // TSK-0051: a "Closed—no response" request within its reopen period, with a question still open, can be reopened by
  // the customer's reply (FACT-REOPEN-PERIOD).
  let reopenByReply = false
  if (r.state === 'closed_no_response') {
    const w = await replyWindow(db, r, await loadConfig(db), now)
    const open = await db
      .selectFrom('intake.questions')
      .select('id')
      .where('request_id', '=', r.id)
      .where('state', '=', 'published')
      .limit(1)
      .executeTakeFirst()
    reopenByReply = w.window === 'reopen' && open !== undefined
  }
  // TSK-0059: the job's deposit for the payment summary (the amount due, verified and pending money, the Square link).
  const payment = await customerDeposit(db, project.id)
  const visits = overviewVisitFacts(await appointmentsOf(db, project.id, now), p.state === 'approved')
  // TSK-0077 (HH-WORK-09, T48): an unresolved critical safety hold shows only "Work is paused for safety review.":
  // no hazard, report, note or worker is read for the customer (HH-INC-02).
  const safety = await db
    .selectFrom('work.holds')
    .select('id')
    .where('project_id', '=', project.id)
    .where('kind', '=', 'critical_safety')
    .where('state', 'in', ['open', 'under_review'])
    .limit(1)
    .executeTakeFirst()
  const facts: PortalFacts = {
    requestState: r.state as RequestState,
    projectState: p.state as ProjectState,
    ...(reopenByReply ? { reopenByReply } : {}),
    // TSK-0058 (HH-EST-12, OWN-DEC-105) with TSK-0059's deposit: an approved project waits on the customer's deposit
    // while it is due; received or waived, the next step is choosing the work appointment.
    ...(await approvalFacts(db, project.id)),
    // TSK-0063: the windows offered to choose from and the next confirmed visit.
    visitWindowsOffered: visits.visitWindowsOffered,
    workWindowsOffered: visits.workWindowsOffered,
    ...(visits.visit ? { visit: visits.visit } : {}),
    ...(safety ? { hold: 'safety' as const } : {}),
  }
  const status = customerStatus(facts)
  // The entry that put the project where it is now dates the status and carries its customer text.
  const current = [...entries].reverse().find((e) => e.kind === status.situation)
  const latest = entries[entries.length - 1] as TimelineEntry
  return {
    reference: project.reference,
    services: services.map((s) => s.name),
    notSure: r.not_sure,
    submittedAt: r.submitted_at,
    status: { ...status, since: (current ?? latest).at, text: current?.text ?? null },
    // Newest first: the latest update leads.
    timeline: entries.reverse(),
    payment,
    appointment: visits.appointment,
    refreshedAt: now,
  }
}

/** The overview of one project in the caller's scope; null for any other or unknown project. */
export async function projectOverview(
  db: Reader,
  scope: DataScope,
  reference: string,
  now = new Date(),
): Promise<ProjectOverview | null> {
  const project = await findProject(db, scope, { reference })
  if (!project) return null
  const o = await overviewFor(db, project, now)
  return o ? { ...o, refreshSeconds: await refreshSeconds(db) } : null
}

/** Every project the caller's scope names (a guest link: one; an account: its linked projects), as summaries. */
export async function projectSummaries(db: Reader, scope: DataScope, now = new Date()): Promise<ProjectSummary[]> {
  if (scope.kind !== 'projects') return []
  const out: ProjectSummary[] = []
  for (const id of scope.projectIds) {
    const project = await findProject(db, scope, { id })
    if (!project) continue
    const o = await overviewFor(db, project, now)
    if (o)
      out.push({
        reference: o.reference,
        services: o.services,
        notSure: o.notSure,
        submittedAt: o.submittedAt,
        status: {
          situation: o.status.situation,
          step: o.status.step,
          waitingOn: o.status.waitingOn,
          nextAction: o.status.nextAction,
          since: o.status.since,
        },
      })
  }
  return out
}
