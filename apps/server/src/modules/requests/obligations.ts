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

/** The checks of the modules that exist. None of accepted estimates, visits or payments is built yet. */
export const DEFAULT_OBLIGATION_CHECKS: readonly ObligationCheck[] = []

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
