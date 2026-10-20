// Transactional outbox (TSK-0012; HH-ARC-08, ENT-OutboxEvent). Adapted from Bh3os/handyhub-app
// (apps/server/src/platform/outbox.ts).
// - outbox.add(tx, event) writes the event in the business transaction: both commit or neither does.
// - The idempotency key is unique: a retried submission or approval returns the event already written instead of a
//   second one, so a customer gets one receipt per request.
// - The payload is minimal: identifiers and flags only. A field named like a secret (password, token, code, access
//   instructions, message body) is refused, not redacted, so no consumer ever depends on a secret in the outbox.
// - A critical hold never goes through the outbox (RULE-SAFETY-GATES): such event types are refused.
import type { Tx } from '@handyhub/db'
import type { JobPayload } from './automation.js'
import { isSecretField } from './redact.js'
import { currentContext } from './request-context.js'

export type OutboxEventInput = {
  /** Dotted, lower-case: `<aggregate>.<past tense>`, for example `request.submitted`. */
  type: string
  aggregate: { type: string; id?: string; version?: number }
  payload?: JobPayload
  /** Unique per business effect, for example `request.submitted:<request id>`. */
  idempotencyKey: string
  requestId?: string
}

export type AddedOutboxEvent = { id: string; created: boolean }

export class OutboxError extends Error {
  override name = 'OutboxError'
}

const CRITICAL_HOLD = /(^|[._])critical_hold([._]|$)/

async function add(tx: Tx, event: OutboxEventInput): Promise<AddedOutboxEvent> {
  if (!tx.isTransaction) throw new OutboxError('outbox.add must run inside the business transaction (withTx)')
  if (CRITICAL_HOLD.test(event.type)) throw new OutboxError('A critical hold is never written through the outbox')
  const payload = event.payload ?? {}
  for (const [k, v] of Object.entries(payload)) {
    if (isSecretField(k)) throw new OutboxError(`Outbox payload field ${k} looks secret; send an identifier instead`)
    if (v !== null && typeof v === 'object') throw new OutboxError(`Outbox payload field ${k} must be a flat value`)
  }
  const requestId = event.requestId ?? currentContext()?.requestId
  if (!requestId) throw new OutboxError('outbox.add needs a request or job correlation ID')
  const inserted = await tx
    .insertInto('platform.outbox_events')
    .values({
      type: event.type,
      aggregate_type: event.aggregate.type,
      aggregate_id: event.aggregate.id ?? null,
      aggregate_version: event.aggregate.version ?? null,
      payload: JSON.stringify(payload),
      idempotency_key: event.idempotencyKey,
      request_id: requestId,
    })
    .onConflict((oc) => oc.column('idempotency_key').doNothing())
    .returning('id')
    .executeTakeFirst()
  if (inserted) return { id: inserted.id, created: true }
  const existing = await tx
    .selectFrom('platform.outbox_events')
    .select(['id', 'type', 'aggregate_type', 'aggregate_id'])
    .where('idempotency_key', '=', event.idempotencyKey)
    .executeTakeFirstOrThrow()
  if (
    existing.type !== event.type ||
    existing.aggregate_type !== event.aggregate.type ||
    existing.aggregate_id !== (event.aggregate.id ?? null)
  )
    throw new OutboxError(`Idempotency key ${event.idempotencyKey} is already used by a different event`)
  return { id: existing.id, created: false }
}

export const outbox = { add }
