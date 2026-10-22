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
// Moving or reassigning an already confirmed visit does not ask again.
import type { Db, Tx } from '@handyhub/db'
import { BLOCKING_HOLD_STATES, CONFIRMATION_BLOCKING_HOLD_KINDS, isWorkVisitPurpose } from '@handyhub/domain'
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

/** The approval a work visit needs: its job, an approved project and the job's accepted scope (job share-locked). */
export async function approvalProblems(tx: Tx, v: VisitToCheck): Promise<FieldError[]> {
  if (!isWork(v)) return []
  if (v.job_id === null) return [field('approval', 'NO_JOB')]
  const job = await tx
    .selectFrom('work.jobs as j')
    .innerJoin('crm.projects as p', 'p.id', 'j.project_id')
    .select(['j.id', 'p.state'])
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
  return out
}

/** Every hold of the project that blocks confirmation now, oldest first: one entry per hold. */
export async function blockingHoldProblems(db: Reader, projectId: string): Promise<FieldError[]> {
  const rows = await db
    .selectFrom('work.holds')
    .select(['id', 'kind'])
    .where('project_id', '=', projectId)
    .where('kind', 'in', [...CONFIRMATION_BLOCKING_HOLD_KINDS])
    .where('state', 'in', [...BLOCKING_HOLD_STATES])
    .orderBy('raised_at')
    .orderBy('id')
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

/** The county check of a first confirmation: verified for the current address, and in the service area. */
export async function countyVerificationProblems(db: Reader, projectId: string): Promise<FieldError[]> {
  const v = await currentCountyVerification(db, projectId)
  if (!v) return [field('coverage', 'COUNTY_NOT_VERIFIED')]
  return v.in_area ? [] : [field('coverage', 'COUNTY_OUTSIDE_AREA')]
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
  out.push(...(await blockingHoldProblems(tx, v.project_id)))
  return out
}

/**
 * What the customer is told when a selection's preconditions are unmet: that the time cannot be confirmed yet, and the
 * deposit when it is what is missing. Never a hold, its kind or category, a gate or a staff detail.
 */
export function customerRefusal(problems: readonly FieldError[]): FieldError[] {
  return [field('body.position', 'SCHEDULING_NOT_READY'), ...problems.filter((p) => p.field === 'deposit')]
}
