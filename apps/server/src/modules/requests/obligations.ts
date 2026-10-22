// Obligations that make a plain Not a Fit wrong (TSK-0042; HH-LEAD-08, HH-STATE-02, OWN-DEC-100). If work was
// accepted, an appointment exists or money was received, the request goes to the Owner for cancellation and
// financial review instead of closing.
//
// Each fact is read from the module that owns its records: estimates and approvals (TSK-0052, TSK-0057), visits
// (TSK-0061, TSK-0063) and payments (TSK-0086). A module adds its check to DEFAULT_OBLIGATION_CHECKS when its tables
// exist. Until then no such record can exist, so the fact is known to be false: a check that is not built yet is
// never mistaken for an unknown, and a check that fails throws (the decision is refused, never assumed safe).
import type { ObligationFacts } from '@handyhub/domain'
import type { Tx } from '@handyhub/db'

export type ObligationFact = keyof ObligationFacts

export type ObligationCheck = {
  /** Which fact the check answers. */
  readonly fact: ObligationFact
  /** The task or module that owns the records it reads. */
  readonly source: string
  /** True when the project has such a record (an accepted estimate, a visit not cancelled, a recorded payment). */
  readonly check: (tx: Tx, projectId: string) => Promise<boolean>
}

/**
 * TSK-0061: a visit of the project (estimate or work) that is not canceled. PROPOSED: a tentative visit counts, and an
 * expired one (an offer nobody took) does not.
 */
export const VISIT_OBLIGATION_CHECK: ObligationCheck = {
  fact: 'appointmentExists',
  source: 'visits (TSK-0061)',
  check: async (tx, projectId) => {
    const found = await tx
      .selectFrom('work.visits')
      .select('id')
      .where('project_id', '=', projectId)
      .where('state', 'not in', ['canceled', 'expired'])
      .limit(1)
      .executeTakeFirst()
    return found !== undefined
  },
}

/**
 * TSK-0121 (OWN-DEC-197 E4, OWN-DEC-208): an accepted estimate version of the project (the approval of TSK-0057) is
 * accepted work.
 */
export const ACCEPTED_WORK_OBLIGATION_CHECK: ObligationCheck = {
  fact: 'workAccepted',
  source: 'approvals (TSK-0057)',
  check: async (tx, projectId) => {
    const found = await tx
      .selectFrom('estimating.estimate_versions')
      .select('id')
      .where('project_id', '=', projectId)
      .where('state', '=', 'accepted')
      .limit(1)
      .executeTakeFirst()
    return found !== undefined
  },
}

/**
 * TSK-0121 (OWN-DEC-197 E4, OWN-DEC-208): a payment staff recorded on the project (TSK-0059). PROPOSED: a returned or
 * voided payment still counts, so the Owner reviews it.
 */
export const PAYMENT_OBLIGATION_CHECK: ObligationCheck = {
  fact: 'moneyReceived',
  source: 'payments (TSK-0059)',
  check: async (tx, projectId) => {
    const found = await tx
      .selectFrom('finance.payments')
      .select('id')
      .where('project_id', '=', projectId)
      .limit(1)
      .executeTakeFirst()
    return found !== undefined
  },
}

/** The checks of the modules that exist: visits, accepted estimates and recorded payments. */
export const DEFAULT_OBLIGATION_CHECKS: readonly ObligationCheck[] = [
  VISIT_OBLIGATION_CHECK,
  ACCEPTED_WORK_OBLIGATION_CHECK,
  PAYMENT_OBLIGATION_CHECK,
]

/** The three facts for a project, read inside the decision's transaction (after the project row is locked). */
export async function obligationFacts(
  tx: Tx,
  projectId: string,
  checks: readonly ObligationCheck[],
): Promise<Required<ObligationFacts>> {
  const facts: { -readonly [K in ObligationFact]-?: boolean } = {
    workAccepted: false,
    appointmentExists: false,
    moneyReceived: false,
  }
  for (const c of checks) if (await c.check(tx, projectId)) facts[c.fact] = true
  return facts
}
