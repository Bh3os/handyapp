// Scheduling gates of work visits (TSK-0061; HH-SCH-11, HH-SCH-06, HH-FIN-02, OWN-DEC-104, OWN-DEC-105).
// A work visit's windows are planned and offered only once every gate of its job passes. A gate reads the job's own
// records in the visit's transaction and answers the codes of what is still missing (empty: it passes); the
// planning refusal names every code of every gate. Gates are added to WORK_VISIT_GATES by the module that owns the
// records they read: the deposit gate of HH-FIN-02 (a required deposit satisfied, or waived by the Owner) is the
// deposit module's. Estimate visits never pass through these gates: they are free and never wait for a deposit
// (FACT-VISIT-FEE, HH-SCH-06).
// TSK-0059: the deposit gate (finance/deposit-gate.ts, confirmationDepositGate) is the first registered gate: a work
// visit's window is planned or changed only while the job's deposit is not required, satisfied by verified money or
// waived by the Owner (DEPOSIT_REQUIRED; DEPOSIT_REQUIREMENT_MISSING for a job without a requirement). It runs in the
// visit's own transaction and share-locks the requirement, so a payment, a check move or a waiver commits strictly
// before or after the planning. No role, flag or AI skips it.
import type { Tx } from '@handyhub/db'
import { confirmationDepositGate } from '../finance/deposit-gate.js'

export type WorkVisitJob = { readonly jobId: string; readonly projectId: string }

export type WorkVisitGate = {
  /** The module and requirement that own the gate, for the contract and the audit summary. */
  readonly source: string
  /** The codes of the unmet requirements (stable, upper case); empty when the gate passes. */
  readonly unmet: (tx: Tx, job: WorkVisitJob) => Promise<readonly string[]>
}

/** The deposit gate of HH-FIN-02 / HH-SCH-06 (TSK-0059), as a work-visit gate. */
export const DEPOSIT_GATE: WorkVisitGate = {
  source: 'finance.deposit (TSK-0059; HH-FIN-02, HH-SCH-06)',
  unmet: async (tx, job) => {
    const gate = await confirmationDepositGate(tx, { kind: 'work', jobId: job.jobId })
    return gate.open ? [] : [gate.code]
  },
}

/** The gates every work-visit window must pass, in order. */
export const WORK_VISIT_GATES: readonly WorkVisitGate[] = [DEPOSIT_GATE]

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
