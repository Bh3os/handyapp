// Confirmation preconditions of a visit (TSK-0064; HH-SCH-06, HH-SCH-05, HH-FIN-02, T36, T40, ENT-Hold, ENT-Visit,
// ENT-DepositRequirement, ENT-SchedulingTask, OWN-DEC-82, OWN-DEC-104, OWN-DEC-137, RULE-SAFETY-GATES).
// One server-side check that every confirmation path runs inside its own transaction, at commit, before a visit
// becomes (or stays, for a reschedule) a committed booking: a staff confirmation (visits.ts confirmVisit), the
// customer's selection of an offered window (offers.ts selectWindow) and the reschedule of a confirmed visit
// (visits.ts changeWindow). It answers every unmet precondition at once, never only the first:
// - approval, for a work visit: the job exists, its project is still approved (or completed, for follow-up and return
//   work) and the job holds its accepted scope (approval: NO_JOB, APPROVAL_NOT_ACTIVE, SCOPE_NOT_ACCEPTED). The job row
//   is share-locked, so a writer that takes the job lock (a critical hold is written under it, RULE-SAFETY-GATES)
//   commits strictly before or after the confirmation;
// - the deposit, for a work visit: the deposit gate of TSK-0059 (deposit: DEPOSIT_REQUIRED,
//   DEPOSIT_REQUIREMENT_MISSING), always run here whatever gates the module was given; an estimate visit is free and
//   never waits for a deposit (FACT-VISIT-FEE);
// - the job's other registered scheduling gates (job: their codes);
// - no blocking hold on the project (holds.<holdId>: REVIEW_HOLD_OPEN, JOB_ON_HOLD, CRITICAL_HOLD_OPEN), one entry per
//   hold that blocks. Only the kinds of CONFIRMATION_BLOCKING_HOLD_KINDS block, while open or under review; ordinary
//   notes and non-blocking warnings never do. Migration 0057 refuses the same confirmation in the database itself.
// The visit's own facts (in the future, expected work and workers entered) and the capacity (workers, equipment,
// working hours, visit hours: capacity/resources.ts evaluate) are checked by each path beside these, in the same
// refusal. No role, flag or AI skips any of them: there is no parameter that does.
// PROPOSED (OQ-CONFIRMATION-PRECONDITIONS): an intake review hold blocks confirmation of every visit of its project,
// estimate visits included; the customer is told only that the time cannot be confirmed yet (and, when it is the
// deposit, that it is due), never which hold or why.
// Final owner amendments 2026-10-22 (TSK-0127, OWN-DEC-179, OWN-DEC-167): a ZIP-only coverage outcome is preliminary
// screening. A visit is confirmed (by staff or by the customer's selection) and windows are offered only once staff
// have verified the property's complete address and its county for its current address version, and that county is
// in the service area (coverage: COUNTY_NOT_VERIFIED, COUNTY_OUTSIDE_AREA; an outside county needs the Owner's
// exception, TSK-0126). Migration 0067 refuses the same confirmation in the database and records the verification.
// TSK-0126 (OWN-DEC-167): that check is the first of the three site checks of site-checks.ts (siteCheckProblems,
// with the authorized site contact and the accepted coverage), run beside these by every confirmation path; migration
// 0106 refuses the confirmation in the database without them. Moving or reassigning an already confirmed visit does
// not ask again.
// TSK-0145 (OWN-DEC-193, OWN-DEC-208; migration 0120):
// - A1: holds stay mandatory. While an intake review hold is open, the only visit of its project that can be
//   confirmed (or offered) is a site visit the Owner authorized as a hazard-evaluation inspection, naming the qualified
//   person and the safety conditions (authorizations.ts): the review holds it evaluates do not block that visit, and
//   stay open for every other one. A review hold raised after the authorization, a job-level Hold and a critical
//   safety hold still block it (PROPOSED, OQ-VISIT-AMENDMENT-DETAILS).
// - A2: an estimate visit needs no approved job (no approval, no deposit); a work visit needs its approved job and
//   every check. The same purpose-specific checks gate publishing windows (offers.ts), so options are offered only for
//   a visit whose own conditions are met.
// - A4: a work visit of a completed job (COMPLETED_JOB_STATES) needs its recorded follow-up authorization (a contractual
//   obligation, a warranty, the punch-list process or an approved return-work authorization): followUp
//   FOLLOW_UP_NOT_AUTHORIZED. New paid work needs an approved estimate or change order.
import type { Db, Tx } from '@handyhub/db'
import {
  BLOCKING_HOLD_STATES,
  CONFIRMATION_BLOCKING_HOLD_KINDS,
  isCompletedJob,
  isWorkVisitPurpose,
} from '@handyhub/domain'
import type { FieldError } from '../../api/errors.js'
import { confirmationDepositGate, depositGateProblem } from '../finance/deposit-gate.js'
import { DEPOSIT_GATE, unmetGates, type WorkVisitGate } from './gates.js'

type Reader = Db | Tx

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })

/** PROPOSED: work visits are planned while the project is approved or, for follow-up and return work, completed. */
export const WORK_VISIT_PROJECT_STATES = ['approved', 'completed'] as const

/** The refusal code of each kind of hold that blocks confirmation. */
export const HOLD_CODES = {
  review: 'REVIEW_HOLD_OPEN',
  job_requirement: 'JOB_ON_HOLD',
  critical_safety: 'CRITICAL_HOLD_OPEN',
} as const satisfies Record<(typeof CONFIRMATION_BLOCKING_HOLD_KINDS)[number], string>

/** What the check reads of a visit. */
export type VisitToCheck = {
  readonly id: string
  readonly purpose: string
  readonly project_id: string
  readonly job_id: string | null
}

const isWork = (v: VisitToCheck) => isWorkVisitPurpose(v.purpose)

/**
 * The approval a work visit needs: its job, an approved project and the job's accepted scope (job share-locked); for a
 * job already complete, the visit's recorded follow-up authorization (A4). An estimate visit needs none (A2).
 */
export async function approvalProblems(tx: Tx, v: VisitToCheck): Promise<FieldError[]> {
  if (!isWork(v)) return []
  if (v.job_id === null) return [field('approval', 'NO_JOB')]
  const job = await tx
    .selectFrom('work.jobs as j')
    .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
    .select(['j.id', 'j.operational_state', 'p.state'])
    .select((eb) =>
      eb
        .exists(eb.selectFrom('work.job_scope_snapshots as s').select('s.job_id').whereRef('s.job_id', '=', 'j.id'))
        .as('scoped'),
    )
    .where('j.id', '=', v.job_id)
    .forShare('j')
    .executeTakeFirst()
  if (!job) return [field('approval', 'NO_JOB')]
  const out: FieldError[] = []
  if (!(WORK_VISIT_PROJECT_STATES as readonly string[]).includes(job.state))
    out.push(field('approval', 'APPROVAL_NOT_ACTIVE'))
  if (!job.scoped) out.push(field('approval', 'SCOPE_NOT_ACCEPTED'))
  if (isCompletedJob(job.operational_state) && !(await hasFollowUpAuthorization(tx, v.id)))
    out.push(field('followUp', 'FOLLOW_UP_NOT_AUTHORIZED'))
  return out
}

async function hasFollowUpAuthorization(db: Reader, visitId: string): Promise<boolean> {
  const row = await db
    .selectFrom('work.follow_up_authorizations')
    .select('id')
    .where('visit_id', '=', visitId)
    .executeTakeFirst()
  return row !== undefined
}

/**
 * Every hold of the project that blocks confirming this visit now, oldest first: one entry per hold. A1: the intake
 * review holds the visit's own hazard-evaluation inspection evaluates do not block it (they stay open).
 */
export async function blockingHoldProblems(db: Reader, projectId: string, visitId?: string): Promise<FieldError[]> {
  const rows = await db
    .selectFrom('work.holds as h')
    .select(['h.id', 'h.kind'])
    .where('h.project_id', '=', projectId)
    .where('h.kind', 'in', [...CONFIRMATION_BLOCKING_HOLD_KINDS])
    .where('h.state', 'in', [...BLOCKING_HOLD_STATES])
    .$if(visitId !== undefined, (q) =>
      q.where((eb) =>
        eb.not(
          eb.and([
            eb('h.kind', '=', 'review'),
            eb.exists(
              eb
                .selectFrom('work.hazard_inspection_holds as ih')
                .innerJoin('work.hazard_inspection_authorizations as a', 'a.id', 'ih.authorization_id')
                .select('ih.hold_id')
                .whereRef('ih.hold_id', '=', 'h.id')
                .where('a.visit_id', '=', visitId as string),
            ),
          ]),
        ),
      ),
    )
    .orderBy('h.raised_at')
    .orderBy('h.id')
    .execute()
  return rows.map((r) => field(`holds.${r.id}`, HOLD_CODES[r.kind as keyof typeof HOLD_CODES] ?? 'CRITICAL_HOLD_OPEN'))
}

/** The newest county verification of the project's property for its current address version, or null. */
export async function currentCountyVerification(db: Reader, projectId: string) {
  return (
    (await db
      .selectFrom('crm.projects as pj')
      .innerJoin('crm.properties as p', 'p.id', 'pj.property_id')
      .innerJoin('crm.property_county_verifications as v', (j) =>
        j.onRef('v.property_id', '=', 'p.id').onRef('v.address_version', '=', 'p.address_version'),
      )
      .select(['v.id', 'v.state', 'v.county', 'v.in_area', 'v.address_version', 'v.verified_by', 'v.verified_at'])
      .where('pj.id', '=', projectId)
      .orderBy('v.seq', 'desc')
      .limit(1)
      .executeTakeFirst()) ?? null
  )
}

/**
 * Every unmet confirmation precondition of the visit (approval, deposit, the other registered gates, blocking holds),
 * in that order; empty when they all hold. Runs inside the confirming transaction.
 */
export async function confirmationPreconditions(
  tx: Tx,
  v: VisitToCheck,
  gates: readonly WorkVisitGate[],
): Promise<FieldError[]> {
  if (!tx.isTransaction) throw new Error('confirmationPreconditions runs inside the confirming transaction (withTx)')
  const out = await approvalProblems(tx, v)
  // An estimate visit never waits for a deposit; a work visit without its job is already refused for the approval.
  if (isWork(v) && v.job_id !== null) {
    const deposit = depositGateProblem(await confirmationDepositGate(tx, { kind: 'work', jobId: v.job_id }))
    if (deposit) out.push(deposit)
    for (const code of await unmetGates(
      tx,
      { jobId: v.job_id, projectId: v.project_id },
      gates.filter((g) => g !== DEPOSIT_GATE),
    ))
      out.push(field('job', code))
  }
  out.push(...(await blockingHoldProblems(tx, v.project_id, v.id)))
  return out
}

/**
 * What the customer is told when a selection's preconditions are unmet: that the time cannot be confirmed yet, and the
 * deposit when it is what is missing. Never a hold, its kind or category, a gate or a staff detail.
 */
export function customerRefusal(problems: readonly FieldError[]): FieldError[] {
  return [field('body.position', 'SCHEDULING_NOT_READY'), ...problems.filter((p) => p.field === 'deposit')]
}
