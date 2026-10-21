// Scoped idempotency keys (TSK-0010; HH-API-04). A write route with `idempotency: 'required'` needs an
// Idempotency-Key header. Inside the write's own transaction:
// 1. an advisory lock on (actor, operation, key) makes a concurrent duplicate wait for the first to finish;
// 2. a live record with the same body hash returns the stored response (Idempotent-Replayed: true); a different body
//    is IDEMPOTENCY_CONFLICT and nothing runs (a route may name what the key already created in the conflict, read from
//    the stored response: the public request submission returns the request's reference, HH-INT-10);
// 3. otherwise the handler runs and the response is stored in the same transaction, so a crash after commit leaves a
//    record the retry returns, and a rollback leaves none.
import { createHash } from 'node:crypto'
import type { Tx } from '@handyhub/db'
import type { Actor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError, type ExistingResult } from './errors.js'

/** PROPOSED retention of an idempotency record (engineering default; no owner decision needed). */
export const IDEMPOTENCY_RETENTION_HOURS = 24

const KEY = /^[A-Za-z0-9._:-]{8,128}$/

export function readIdempotencyKey(header: string | string[] | undefined): string {
  const value = Array.isArray(header) ? header[0] : header
  if (value === undefined || !KEY.test(value)) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED')
  return value
}

/** The scope an idempotency key belongs to: the caller's identity. Guests share one scope; their keys are random. */
export function actorKey(actor: Actor): string {
  switch (actor.kind) {
    case 'staff':
      return `staff:${actor.userId}`
    case 'customer':
      return `customer:${actor.contactId}`
    case 'guest':
      return 'guest'
    case 'ai':
      return 'ai'
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`)
      .join(',')}}`
  return JSON.stringify(value ?? null)
}

/** Hash of what the request asks for: path parameters, query and body, independent of key order. */
export function requestHash(parts: { params: unknown; query: unknown; body: unknown }): string {
  return createHash('sha256').update(stable(parts)).digest('hex')
}

export type StoredResponse = { status: number; body: unknown }
export type IdempotencyScope = { actorKey: string; operation: string; key: string; bodyHash: string }

/** What a conflict may tell the caller about the write the key already made, read from its stored response body. */
export type ConflictDetail = (storedBody: unknown) => ExistingResult | undefined

/** Locks the scope and returns the stored response of a live record, or null when the operation must run. */
export async function claim(tx: Tx, scope: IdempotencyScope, detail?: ConflictDetail): Promise<StoredResponse | null> {
  const lockName = `idempotency|${scope.actorKey}|${scope.operation}|${scope.key}`
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockName}, 0))`.execute(tx)
  const row = await tx
    .selectFrom('platform.idempotency_keys')
    .select(['body_hash', 'response_status', 'response_body'])
    .where('actor_key', '=', scope.actorKey)
    .where('operation', '=', scope.operation)
    .where('idempotency_key', '=', scope.key)
    .where('expires_at', '>', sql<Date>`now()`)
    .executeTakeFirst()
  if (!row) return null
  if (row.body_hash !== scope.bodyHash) {
    const existing = detail?.(row.response_body)
    throw new ApiError('IDEMPOTENCY_CONFLICT', existing ? { existing } : {})
  }
  return { status: row.response_status, body: row.response_body }
}

/** Stores the response with the write; an expired record under the same key is replaced. */
export async function store(tx: Tx, scope: IdempotencyScope, response: StoredResponse, requestId: string) {
  const values = {
    actor_key: scope.actorKey,
    operation: scope.operation,
    idempotency_key: scope.key,
    body_hash: scope.bodyHash,
    response_status: response.status,
    response_body: JSON.stringify(response.body ?? null),
    request_id: requestId,
    created_at: sql<Date>`now()`,
    expires_at: sql<Date>`now() + make_interval(hours => ${IDEMPOTENCY_RETENTION_HOURS})`,
  }
  await tx
    .insertInto('platform.idempotency_keys')
    .values(values)
    .onConflict((oc) =>
      oc
        .columns(['actor_key', 'operation', 'idempotency_key'])
        .doUpdateSet(values)
        .where('platform.idempotency_keys.expires_at', '<=', sql<Date>`now()`),
    )
    .execute()
}
