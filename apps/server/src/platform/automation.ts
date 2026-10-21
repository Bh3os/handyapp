// Automation declarations (TSK-0012; HH-AUTO-01, HH-ARC-09). Every background consumer is a deterministic rule (no
// AI) registered with its trigger, the identity it acts as, its inputs and their version, how its effect is
// deduplicated, the effect it may have, retry and timeout, the staff role that owns its failures, and its audit
// action. The registry refuses an incomplete declaration at start-up, so no consumer runs undeclared.
import type { Tx } from '@handyhub/db'
import type { Logger } from './logger.js'

/** Staff roles that can own an automation's failures (ROLE-OWNER, ROLE-OFFICE, ROLE-ESTIMATOR, ROLE-WORKER). */
export const EXCEPTION_OWNER_ROLES = ['owner', 'office', 'estimator', 'worker'] as const
export type ExceptionOwnerRole = (typeof EXCEPTION_OWNER_ROLES)[number]

export type JobPayload = Record<string, string | number | boolean | null>

export type JobView = {
  id: string
  key: string
  automation: string
  /** 1 on the first run. */
  attempt: number
  /** The job's attempt budget (the automation's retry.maxAttempts when it was created); unset in hand-built views. */
  maxAttempts?: number
  payload: JobPayload
  eventId: string | null
  eventType: string | null
  target: { type: string | null; id: string | null }
  requestId: string
}

export type JobContext = {
  /** The job's transaction: database effects commit together with the job's success, or not at all. */
  tx: Tx
  job: JobView
  /** Stable across retries; pass it to providers so a retried send is not a second send. */
  idempotencyKey: string
  log: Logger
  /** Aborted when the declared timeout passes; provider calls must honour it. */
  signal: AbortSignal
}

/** undefined or 'done': the effect happened. 'cancelled': the current state made it outdated, so nothing was done. */
export type JobOutcome = 'done' | 'cancelled' | undefined

export type ReconcileContext = { job: JobView; idempotencyKey: string; log: Logger }

export type Automation = {
  /** Dotted lower-case name, for example `request_receipt.send`. */
  name: string
  trigger: { kind: 'event'; eventTypes: readonly string[] } | { kind: 'schedule'; description: string }
  /** The system identity it acts as; recorded as the audit actor. */
  identity: string
  inputs: { description: string; version: number }
  /** How a repeated job has no second effect (the job key is passed as the idempotency key). */
  idempotency: string
  /** The one effect it is allowed to have. */
  effect: string
  retry: { maxAttempts: number; baseDelayMs: number; maxDelayMs: number }
  timeoutMs: number
  exceptionOwner: ExceptionOwnerRole
  audit: { action: string }
  /**
   * Called before re-running a job whose previous attempt has no known outcome (for example a provider timeout).
   * 'done': the provider already has the effect, so the job succeeds without another send.
   */
  reconcile?: (ctx: ReconcileContext) => Promise<'done' | 'retry'>
  /**
   * Called once after the job's last attempt failed and the failure was recorded, in a transaction of its own, so the
   * records the automation owns can say so truthfully (TSK-0032: a delivery queued by a staff retry goes back to
   * failed instead of reading queued for good). Best effort: an error here is logged and changes nothing else.
   */
  onFinalFailure?: (ctx: FinalFailureContext) => Promise<void>
  handle: (ctx: JobContext) => Promise<JobOutcome>
}

export type FinalFailureContext = { tx: Tx; job: JobView; errorClass: string; log: Logger }

export class AutomationDeclarationError extends Error {
  override name = 'AutomationDeclarationError'
}

const DOTTED = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/
const NAME = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/

function text(v: unknown): boolean {
  return typeof v === 'string' && v.trim().length > 0
}
function int(v: unknown, min: number, max: number): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
}

/** Throws AutomationDeclarationError naming every missing or invalid part of the declaration. */
export function validateAutomation(a: Automation): void {
  const problems: string[] = []
  const decl = a as Partial<Automation>
  if (!text(decl.name) || !NAME.test(String(decl.name))) problems.push('name')
  const trigger = decl.trigger
  if (!trigger) problems.push('trigger')
  else if (trigger.kind === 'event') {
    if (trigger.eventTypes.length === 0 || !trigger.eventTypes.every((t) => DOTTED.test(t))) problems.push('trigger')
  } else if (trigger.kind !== 'schedule' || !text(trigger.description)) problems.push('trigger')
  if (!text(decl.identity)) problems.push('identity')
  if (!decl.inputs || !text(decl.inputs.description) || !int(decl.inputs.version, 1, 1_000_000)) problems.push('inputs')
  if (!text(decl.idempotency)) problems.push('idempotency')
  if (!text(decl.effect)) problems.push('effect')
  const r = decl.retry
  if (
    !r ||
    !int(r.maxAttempts, 1, 100) ||
    !int(r.baseDelayMs, 1, 86_400_000) ||
    !int(r.maxDelayMs, 1, 86_400_000) ||
    r.maxDelayMs < r.baseDelayMs
  )
    problems.push('retry')
  if (!int(decl.timeoutMs, 1, 3_600_000)) problems.push('timeoutMs')
  if (!(EXCEPTION_OWNER_ROLES as readonly string[]).includes(String(decl.exceptionOwner)))
    problems.push('exceptionOwner')
  if (!decl.audit || !DOTTED.test(String(decl.audit.action))) problems.push('audit')
  if (typeof decl.handle !== 'function') problems.push('handle')
  if (decl.reconcile !== undefined && typeof decl.reconcile !== 'function') problems.push('reconcile')
  if (decl.onFinalFailure !== undefined && typeof decl.onFinalFailure !== 'function') problems.push('onFinalFailure')
  if (problems.length)
    throw new AutomationDeclarationError(
      `Automation ${String(decl.name)} is missing or invalid: ${problems.join(', ')}`,
    )
}

export type AutomationRegistry = {
  get(name: string): Automation | undefined
  forEvent(eventType: string): Automation[]
  all(): readonly Automation[]
}

export function createAutomationRegistry(automations: readonly Automation[]): AutomationRegistry {
  const byName = new Map<string, Automation>()
  for (const a of automations) {
    validateAutomation(a)
    if (byName.has(a.name)) throw new AutomationDeclarationError(`Automation ${a.name} is declared twice`)
    byName.set(a.name, a)
  }
  const list = [...byName.values()]
  return {
    get: (name) => byName.get(name),
    forEvent: (type) => list.filter((a) => a.trigger.kind === 'event' && a.trigger.eventTypes.includes(type)),
    all: () => list,
  }
}

/** Delay before the next attempt: baseDelayMs doubled per failed attempt, capped at maxDelayMs. */
export function retryDelayMs(retry: Automation['retry'], failedAttempts: number): number {
  return Math.min(retry.maxDelayMs, retry.baseDelayMs * 2 ** Math.max(0, failedAttempts - 1))
}
