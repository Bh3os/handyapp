// The deposit gate of visit confirmation (TSK-0059; HH-SCH-06, HH-FIN-02, HH-SCH-05, T36, OWN-DEC-104, OWN-DEC-119,
// RULE-SAFETY-GATES, RULE-SERVER-AUTHZ). The one function every visit confirmation calls, inside its own transaction,
// before it commits a visit (the visit model TSK-0061 and the confirmation preconditions TSK-0064 call it):
// - an estimate visit is free and never waits for a deposit: always open;
// - a work visit is open only when its job's deposit requirement is not required, satisfied by verified money (an
//   uncleared check never satisfies it) or waived by the Owner; otherwise it is shut with DEPOSIT_REQUIRED, or with
//   DEPOSIT_REQUIREMENT_MISSING when the job has no requirement (no approval: never treated as "no deposit").
// The answer comes from finance.work_visit_deposit_gate, which share-locks the requirement and reads the money and
// the waiver themselves, so a payment, a check move or a waiver commits strictly before or after the confirmation.
// No role, flag or AI can open it: there is no parameter that skips it; only the Owner's waiver record does.
import type { Tx } from '@handyhub/db'
import { sql } from 'kysely'
import { ApiError, type FieldError } from '../../api/errors.js'

export type ConfirmationDepositGate =
  | { open: true; basis: 'estimate_visit' | 'not_required' | 'satisfied' | 'waived' }
  | { open: false; code: 'DEPOSIT_REQUIRED' | 'DEPOSIT_REQUIREMENT_MISSING' }

export type VisitToConfirm = { kind: 'estimate' } | { kind: 'work'; jobId: string }

/** Whether the deposit lets this visit be confirmed now; runs in the confirming transaction (share lock). */
export async function confirmationDepositGate(tx: Tx, visit: VisitToConfirm): Promise<ConfirmationDepositGate> {
  if (!tx.isTransaction) throw new Error('confirmationDepositGate runs inside the confirming transaction (withTx)')
  if (visit.kind === 'estimate') return { open: true, basis: 'estimate_visit' }
  const r = await sql<{ gate: string }>`SELECT finance.work_visit_deposit_gate(${visit.jobId}::uuid) AS gate`.execute(
    tx,
  )
  const gate = r.rows[0]?.gate
  if (gate === 'not_required' || gate === 'satisfied' || gate === 'waived') return { open: true, basis: gate }
  return { open: false, code: gate === 'missing' ? 'DEPOSIT_REQUIREMENT_MISSING' : 'DEPOSIT_REQUIRED' }
}

/** The unmet precondition of a shut gate, for a refusal that names every unmet precondition (HH-SCH-06). */
export function depositGateProblem(gate: ConfirmationDepositGate): FieldError | null {
  return gate.open ? null : { field: 'deposit', code: gate.code, message: '' }
}

/** Refuses (CONFLICT naming the deposit) unless the deposit lets this visit be confirmed now. */
export async function requireConfirmationDepositGate(tx: Tx, visit: VisitToConfirm): Promise<void> {
  const problem = depositGateProblem(await confirmationDepositGate(tx, visit))
  if (problem) throw new ApiError('CONFLICT', { fieldErrors: [problem] })
}
