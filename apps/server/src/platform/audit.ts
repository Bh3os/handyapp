// Append-only audit writer (TSK-0011; HH-SEC-06, ENT-AuditEvent, RULE-SERVER-AUTHZ, OWN-DEC-123). Adapted from
// Bh3os/handyhub-app (apps/server/src/platform/audit.ts).
// - audit.record(tx, event) inserts into platform.audit_events inside the caller's transaction: the event commits or
//   rolls back with the action it records, and a failed insert fails the action.
// - The summary is redacted through the shared secret-field schema before insert; the reason is free text and must
//   never carry secrets.
// - The request ID comes from the event or the current request context; an event without one is refused.
import type { Tx } from '@handyhub/db'
import { redact } from './redact.js'
import { currentContext } from './request-context.js'

export type AuditActor =
  | { kind: 'staff'; id: string; roles: readonly string[] }
  | { kind: 'customer'; id: string }
  | { kind: 'guest' }
  | { kind: 'system'; process: string }

export type AuditTarget = { type: string; id?: string; version?: number }

export type AuditSummaryValue =
  string | number | boolean | null | AuditSummaryValue[] | { [key: string]: AuditSummaryValue }

export type AuditEventInput = {
  actor: AuditActor
  /** Dotted, lower-case: `<area>.<verb>`, for example `staff.sign_in` or `estimate.publish`. */
  action: string
  target: AuditTarget
  /** Safe change summary, for example { changes: [{ field: 'status', from: 'draft', to: 'sent' }] }. */
  summary?: Record<string, AuditSummaryValue>
  result?: 'succeeded' | 'denied' | 'failed'
  reason?: string
  stepUpUsed?: boolean
  requestId?: string
}

export type RecordedAuditEvent = { id: string; seq: string }

export class AuditError extends Error {
  override name = 'AuditError'
}

async function record(tx: Tx, event: AuditEventInput): Promise<RecordedAuditEvent> {
  if (!tx.isTransaction) throw new AuditError('audit.record must run inside the business transaction (withTx)')
  const requestId = event.requestId ?? currentContext()?.requestId
  if (!requestId) throw new AuditError('audit.record needs a request or job correlation ID')
  const { actor } = event
  return tx
    .insertInto('platform.audit_events')
    .values({
      actor_kind: actor.kind,
      actor_id: actor.kind === 'staff' || actor.kind === 'customer' ? actor.id : null,
      actor_roles: actor.kind === 'staff' ? [...actor.roles] : [],
      actor_process: actor.kind === 'system' ? actor.process : null,
      action: event.action,
      target_type: event.target.type,
      target_id: event.target.id ?? null,
      target_version: event.target.version ?? null,
      result: event.result ?? 'succeeded',
      reason: event.reason ?? null,
      summary: JSON.stringify(redact(event.summary ?? {})),
      step_up_used: event.stepUpUsed ?? false,
      request_id: requestId,
    })
    .returning(['id', 'seq'])
    .executeTakeFirstOrThrow()
}

export const audit = { record }
