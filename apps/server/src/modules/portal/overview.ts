// The customer project overview, read from the shared records (TSK-0038; HH-PORT-02, HH-PORT-03, HH-PORT-06,
// HH-ARC-04, HH-ARC-10, HH-PORT-01, T23, T24, RULE-SERVER-AUTHZ).
// - Every read goes through the caller's scope (TSK-0037): a project outside it is null, answered NOT_FOUND.
// - The status is the customer projection of the records (@handyhub/domain customerStatus): the request and project
//   states, and the staff decisions published to the customer. The records later tasks build (estimate, visit, job,
//   hold, invoice) are not read yet, so no estimate, appointment, hold or balance is ever claimed.
// - The timeline lists only what the customer may see: the request they sent, "More information needed", "Site
//   visit needed" with its customer explanation (OWN-DEC-99), and the Not a Fit decision in the owner's wording
//   (OWN-DEC-100). Internal notes, qualification, assignment, the Owner routing and every staff name stay on the
//   server: this module never selects them (HH-PORT-03, T24).
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
import { findProject } from '../records/repository.js'
import { notAFitCustomerMessage } from '../requests/staff-record.js'

type Reader = Db | Tx

/** What the customer timeline shows (HH-PORT-03), by code; the portal holds the English labels. */
type TimelineKind = CustomerTimelineKind
export type TimelineEntry = { kind: TimelineKind; at: Date; text: string | null }

/** The staff decisions a customer sees, and how; every other action (and the Owner routing) is internal. */
const PUBLISHED_DECISIONS: Readonly<Record<string, TimelineKind>> = {
  ask_question: 'more_information',
  arrange_estimate_visit: 'site_visit',
  not_a_fit: 'not_a_fit',
}

export type ProjectOverview = {
  reference: string
  services: string[]
  notSure: boolean
  submittedAt: Date
  status: CustomerStatus & { since: Date; text: string | null }
  timeline: TimelineEntry[]
  /** Payment summary, shown beside the status and never merged into it: no estimate, deposit or invoice exists yet. */
  payment: { state: 'none' }
  /** The confirmed appointment: none until visits exist (TSK-0061). */
  appointment: null
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
    .where('action', 'in', Object.keys(PUBLISHED_DECISIONS) as ('ask_question' | 'not_a_fit')[])
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
  const facts: PortalFacts = { requestState: r.state as RequestState, projectState: p.state as ProjectState }
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
    payment: { state: 'none' as const },
    appointment: null,
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
