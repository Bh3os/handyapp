// Scheduling gates of work visits (TSK-0061; HH-SCH-11, HH-SCH-06, HH-FIN-02, OWN-DEC-104, OWN-DEC-105).
// A work visit's windows are planned and offered only once every gate of its job passes. A gate reads the job's own
// records in the visit's transaction and answers the codes of what is still missing (empty: it passes); the
// planning refusal names every code of every gate. Gates are added to WORK_VISIT_GATES by the module that owns the
// records they read: the deposit gate of HH-FIN-02 (a required deposit satisfied, or waived by the Owner) is the
// deposit module's. Estimate visits never pass through these gates: they are free and never wait for a deposit
// (FACT-VISIT-FEE, HH-SCH-06).
import type { Tx } from '@handyhub/db'

export type WorkVisitJob = { readonly jobId: string; readonly projectId: string }

export type WorkVisitGate = {
  /** The module and requirement that own the gate, for the contract and the audit summary. */
  readonly source: string
  /** The codes of the unmet requirements (stable, upper case); empty when the gate passes. */
  readonly unmet: (tx: Tx, job: WorkVisitJob) => Promise<readonly string[]>
}

/** The gates every work-visit window must pass, in order. */
export const WORK_VISIT_GATES: readonly WorkVisitGate[] = []

/** Every unmet code of every gate, in gate order. */
export async function unmetGates(
  tx: Tx,
  job: WorkVisitJob,
  gates: readonly WorkVisitGate[],
): Promise<readonly string[]> {
  const out: string[] = []
  for (const g of gates) out.push(...(await g.unmet(tx, job)))
  return out
}
