// Postgres job queue and in-process worker (TSK-0012; HH-ARC-08, HH-ARC-09, HH-AUTO-01, HH-NFR-02). Adapted from
// Bh3os/handyhub-app (apps/server/src/platform/outbox.ts: dispatchOutbox, runJobs).
// Delivery is at-least-once with idempotent effects, never "exactly once":
// - dispatch turns each pending outbox event into one job per declared automation; the job key `<event>:<automation>`
//   is unique, so dispatching twice creates no second job;
// - claim takes runnable jobs with FOR UPDATE SKIP LOCKED and leases them, so two workers never run the same job;
// - a job's database effects, its success and its audit event commit in one transaction; a failure rolls the effects
//   back and schedules a retry with bounded exponential backoff, and the last failed attempt ends in 'failed', the
//   state the staff exceptions queue lists with the automation's exception owner;
// - the sweep requeues jobs whose lease expired (worker crash, timeout) and marks them interrupted, so a declared
//   reconcile step checks the provider's own record before anything is sent again.
import { randomUUID } from 'node:crypto'
import { withTx, type Db, type Tx } from '@handyhub/db'
import { sql } from 'kysely'
import pino from 'pino'
import { audit, type AuditActor } from './audit.js'
import {
  retryDelayMs,
  type Automation,
  type AutomationRegistry,
  type ExceptionOwnerRole,
  type JobPayload,
  type JobView,
} from './automation.js'
import type { Logger } from './logger.js'
import { runWithContext } from './request-context.js'

export type ScheduleJobInput = {
  /** Unique per effect, for example `appointment_reminder:<appointment id>:<version>`. */
  key: string
  runAt?: Date
  payload?: JobPayload
  target?: { type: string; id?: string }
  requestId: string
}

/** Schedules a job of a schedule-triggered automation inside the caller's transaction. Idempotent by key. */
export async function scheduleJob(
  tx: Tx,
  automation: Automation,
  input: ScheduleJobInput,
): Promise<{ created: boolean }> {
  if (!tx.isTransaction) throw new Error('scheduleJob must run inside the business transaction (withTx)')
  if (automation.trigger.kind !== 'schedule') throw new Error(`Automation ${automation.name} is not schedule-triggered`)
  const row = await tx
    .insertInto('platform.jobs')
    .values({
      automation: automation.name,
      job_key: `${automation.name}:${input.key}`,
      target_type: input.target?.type ?? null,
      target_id: input.target?.id ?? null,
      payload: JSON.stringify(input.payload ?? {}),
      request_id: input.requestId,
      run_at: input.runAt ?? new Date(),
      max_attempts: automation.retry.maxAttempts,
    })
    .onConflict((oc) => oc.column('job_key').doNothing())
    .returning('id')
    .executeTakeFirst()
  return { created: row !== undefined }
}

type JobRow = {
  id: string
  automation: string
  job_key: string
  outbox_event_id: string | null
  event_type: string | null
  target_type: string | null
  target_id: string | null
  payload: unknown
  request_id: string
  attempts: number
  max_attempts: number
  interrupted: boolean
}

export class LeaseLostError extends Error {
  override name = 'LeaseLostError'
}

export type TickResult = {
  requeued: number
  dispatched: number
  succeeded: number
  retried: number
  failed: number
  cancelled: number
}

export type WorkerOptions = {
  db: Db
  registry: AutomationRegistry
  workerId?: string
  batchSize?: number
  pollIntervalMs?: number
  logger?: Logger
}

export type Worker = {
  /** One pass: sweep expired leases, dispatch pending events, run the runnable jobs. */
  runOnce(): Promise<TickResult>
  start(): void
  stop(): Promise<void>
}

const silent = pino({ enabled: false })

export function createWorker(options: WorkerOptions): Worker {
  const { db, registry } = options
  const workerId = options.workerId ?? `worker-${randomUUID()}`
  const batchSize = options.batchSize ?? 20
  const log = options.logger ?? silent

  const systemActor = (a: Automation | undefined, name: string): AuditActor => ({
    kind: 'system',
    process: a?.identity ?? `automation.${name}`,
  })

  async function sweep(): Promise<number> {
    return withTx(db, async (tx) => {
      const rows = await tx
        .updateTable('platform.jobs')
        .set({
          state: sql<string>`CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END`,
          finished_at: sql<Date | null>`CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END`,
          interrupted: true,
          locked_by: null,
          locked_until: null,
          run_at: sql<Date>`now()`,
          last_error_class: 'LeaseExpired',
          updated_at: sql<Date>`now()`,
        })
        .where('state', '=', 'running')
        .where('locked_until', '<', sql<Date>`now()`)
        .returning(['id', 'automation', 'state', 'attempts', 'request_id', 'target_type', 'target_id'])
        .execute()
      for (const r of rows.filter((x) => x.state === 'failed')) {
        await audit.record(tx, {
          actor: systemActor(registry.get(r.automation), r.automation),
          action: 'automation.failed',
          target: { type: 'job', id: r.id },
          result: 'failed',
          summary: { automation: r.automation, attempts: r.attempts, error: 'LeaseExpired' },
          requestId: r.request_id,
        })
      }
      return rows.length
    })
  }

  async function dispatch(): Promise<number> {
    return withTx(db, async (tx) => {
      const events = await tx
        .selectFrom('platform.outbox_events')
        .selectAll()
        .where('state', '=', 'pending')
        .orderBy('seq')
        .limit(batchSize)
        .forUpdate()
        .skipLocked()
        .execute()
      for (const ev of events) {
        const consumers = registry.forEvent(ev.type)
        for (const a of consumers) {
          await tx
            .insertInto('platform.jobs')
            .values({
              automation: a.name,
              job_key: `${ev.id}:${a.name}`,
              outbox_event_id: ev.id,
              event_type: ev.type,
              target_type: ev.aggregate_type,
              target_id: ev.aggregate_id,
              payload: JSON.stringify(ev.payload),
              request_id: ev.request_id,
              max_attempts: a.retry.maxAttempts,
            })
            .onConflict((oc) => oc.column('job_key').doNothing())
            .execute()
        }
        if (consumers.length === 0) log.warn({ eventType: ev.type, eventId: ev.id }, 'outbox event has no automation')
        await tx
          .updateTable('platform.outbox_events')
          .set({ state: 'dispatched', dispatched_at: sql<Date>`now()`, jobs_created: consumers.length })
          .where('id', '=', ev.id)
          .execute()
      }
      return events.length
    })
  }

  async function claim(): Promise<JobRow[]> {
    // Only jobs of automations this worker knows; others stay queued and visible in queueStats.
    const names = registry.all().map((a) => a.name)
    if (names.length === 0) return []
    const leaseMs = Math.max(...registry.all().map((a) => a.timeoutMs), 1000) + 30_000
    const { rows } = await sql<JobRow>`
      UPDATE platform.jobs SET state = 'running', attempts = attempts + 1, locked_by = ${workerId},
        locked_until = now() + make_interval(secs => ${leaseMs / 1000}), updated_at = now()
      WHERE id IN (
        SELECT id FROM platform.jobs WHERE state = 'queued' AND run_at <= now() AND automation = ANY(${names})
        ORDER BY run_at, seq LIMIT ${batchSize} FOR UPDATE SKIP LOCKED)
      RETURNING id, automation, job_key, outbox_event_id, event_type, target_type, target_id, payload, request_id,
        attempts, max_attempts, interrupted`.execute(db)
    return rows
  }

  const view = (j: JobRow): JobView => ({
    id: j.id,
    key: j.job_key,
    automation: j.automation,
    attempt: j.attempts,
    payload: (j.payload ?? {}) as JobPayload,
    eventId: j.outbox_event_id,
    eventType: j.event_type,
    target: { type: j.target_type, id: j.target_id },
    requestId: j.request_id,
  })

  async function finish(tx: Tx, j: JobRow, a: Automation, state: 'succeeded' | 'cancelled', reconciled: boolean) {
    const updated = await tx
      .updateTable('platform.jobs')
      .set({
        state,
        locked_by: null,
        locked_until: null,
        interrupted: false,
        last_error_class: null,
        finished_at: sql<Date>`now()`,
        updated_at: sql<Date>`now()`,
      })
      .where('id', '=', j.id)
      .where('state', '=', 'running')
      .where('locked_by', '=', workerId)
      .executeTakeFirst()
    if (Number(updated.numUpdatedRows) !== 1) throw new LeaseLostError(`Lease on job ${j.id} was lost`)
    await audit.record(tx, {
      actor: systemActor(a, a.name),
      action: state === 'cancelled' ? 'automation.cancelled' : a.audit.action,
      target: j.target_type
        ? { type: j.target_type, ...(j.target_id ? { id: j.target_id } : {}) }
        : { type: 'job', id: j.id },
      summary: { automation: a.name, job: j.id, attempt: j.attempts, reconciled },
      requestId: j.request_id,
    })
  }

  async function fail(j: JobRow, a: Automation | undefined, err: unknown): Promise<'retried' | 'failed'> {
    const errorClass = (err instanceof Error && err.name ? err.name : 'Error').slice(0, 120)
    const final = !a || j.attempts >= j.max_attempts
    return withTx(db, async (tx) => {
      const delay = a ? retryDelayMs(a.retry, j.attempts) : 0
      const updated = await tx
        .updateTable('platform.jobs')
        .set({
          state: final ? 'failed' : 'queued',
          finished_at: final ? sql<Date>`now()` : null,
          run_at: sql<Date>`now() + make_interval(secs => ${delay / 1000})`,
          locked_by: null,
          locked_until: null,
          last_error_class: errorClass,
          updated_at: sql<Date>`now()`,
        })
        .where('id', '=', j.id)
        .where('state', '=', 'running')
        .where('locked_by', '=', workerId)
        .executeTakeFirst()
      if (Number(updated.numUpdatedRows) !== 1) throw new LeaseLostError(`Lease on job ${j.id} was lost`)
      if (final)
        await audit.record(tx, {
          actor: systemActor(a, j.automation),
          action: 'automation.failed',
          target: { type: 'job', id: j.id },
          result: 'failed',
          summary: { automation: j.automation, attempts: j.attempts, error: errorClass },
          requestId: j.request_id,
        })
      return final ? 'failed' : 'retried'
    })
  }

  async function runJob(j: JobRow): Promise<'succeeded' | 'cancelled' | 'retried' | 'failed' | 'lost'> {
    const a = registry.get(j.automation)
    return runWithContext({ requestId: j.request_id }, async () => {
      const jobLog = log.child({ job: j.id, automation: j.automation, attempt: j.attempts })
      try {
        if (!a) throw Object.assign(new Error(`No automation ${j.automation}`), { name: 'UnknownAutomation' })
        const ctxBase = { job: view(j), idempotencyKey: j.job_key, log: jobLog }
        if (j.interrupted && a.reconcile && (await a.reconcile(ctxBase)) === 'done') {
          await withTx(db, (tx) => finish(tx, j, a, 'succeeded', true))
          return 'succeeded'
        }
        const outcome = await withTx(db, async (tx) => {
          await sql.raw(`SET LOCAL statement_timeout = ${Math.trunc(a.timeoutMs)}`).execute(tx)
          const controller = new AbortController()
          const result = await withTimeout(
            a.handle({ ...ctxBase, tx, signal: controller.signal }),
            a.timeoutMs,
            controller,
          )
          const state = result === 'cancelled' ? 'cancelled' : 'succeeded'
          await finish(tx, j, a, state, false)
          return state
        })
        return outcome
      } catch (err) {
        if (err instanceof LeaseLostError) {
          jobLog.warn('job lease lost; the sweep requeues it')
          return 'lost'
        }
        jobLog.error({ err }, 'job attempt failed')
        try {
          return await fail(j, a, err)
        } catch (e) {
          if (e instanceof LeaseLostError) return 'lost'
          throw e
        }
      }
    })
  }

  async function runOnce(): Promise<TickResult> {
    const result: TickResult = { requeued: 0, dispatched: 0, succeeded: 0, retried: 0, failed: 0, cancelled: 0 }
    result.requeued = await sweep()
    result.dispatched = await dispatch()
    for (const job of await claim()) {
      const r = await runJob(job)
      if (r !== 'lost') result[r]++
    }
    return result
  }

  let timer: NodeJS.Timeout | undefined
  let running: Promise<unknown> | undefined
  let stopped = true
  const loop = () => {
    if (stopped) return
    running = runOnce()
      .catch((err: unknown) => log.error({ err }, 'worker tick failed'))
      .finally(() => {
        running = undefined
        if (!stopped) timer = setTimeout(loop, options.pollIntervalMs ?? 1000)
      })
  }
  return {
    runOnce,
    start() {
      if (!stopped) return
      stopped = false
      loop()
    },
    async stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      await running
    },
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, controller: AbortController): Promise<T> {
  let t: NodeJS.Timeout | undefined
  const timeout = new Promise<never>((_, reject) => {
    t = setTimeout(() => {
      const err = Object.assign(new Error(`Job timed out after ${ms} ms`), { name: 'JobTimeout' })
      reject(err) // settles the race as a timeout before the handler can react to the abort
      controller.abort(err)
    }, ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(t))
}

export type FailedJob = {
  id: string
  automation: string
  exceptionOwner: ExceptionOwnerRole | null
  attempts: number
  errorClass: string | null
  target: { type: string | null; id: string | null }
  failedAt: Date
}

/** The permanent failures for the staff exceptions queue, oldest first, each with its exception owner. */
export async function listFailedJobs(db: Db, registry: AutomationRegistry, limit = 100): Promise<FailedJob[]> {
  const rows = await db
    .selectFrom('platform.jobs')
    .select(['id', 'automation', 'attempts', 'last_error_class', 'target_type', 'target_id', 'updated_at'])
    .where('state', '=', 'failed')
    .orderBy('updated_at')
    .limit(limit)
    .execute()
  return rows.map((r) => ({
    id: r.id,
    automation: r.automation,
    exceptionOwner: registry.get(r.automation)?.exceptionOwner ?? null,
    attempts: r.attempts,
    errorClass: r.last_error_class,
    target: { type: r.target_type, id: r.target_id },
    failedAt: r.updated_at,
  }))
}

/**
 * Staff retry of a failed job: queued again with a fresh attempt budget, audited. The job key is unchanged, so a
 * provider that already holds the effect sees the same idempotency key. Authorization is the caller's (policy).
 */
export async function retryFailedJob(
  tx: Tx,
  input: { jobId: string; actor: AuditActor; reason?: string; requestId?: string },
): Promise<void> {
  const row = await tx
    .updateTable('platform.jobs')
    .set({ state: 'queued', attempts: 0, finished_at: null, run_at: sql<Date>`now()`, updated_at: sql<Date>`now()` })
    .where('id', '=', input.jobId)
    .where('state', '=', 'failed')
    .returning(['id', 'automation', 'last_error_class'])
    .executeTakeFirst()
  if (!row) throw new Error(`Job ${input.jobId} is not in the failed state`)
  await audit.record(tx, {
    actor: input.actor,
    action: 'automation.retry',
    target: { type: 'job', id: row.id },
    summary: { automation: row.automation, previousError: row.last_error_class },
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.requestId ? { requestId: input.requestId } : {}),
  })
}

export type QueueStats = {
  jobs: Record<'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled', number>
  pendingEvents: number
  oldestQueuedSeconds: number | null
  oldestPendingEventSeconds: number | null
  retrying: number
}

/** Queue age, retries and permanent failures (HH-NFR-02). Counts only: no payloads. */
export async function queueStats(db: Db): Promise<QueueStats> {
  const { rows } = await sql<{ state: string; n: number }>`
    SELECT state, count(*)::int AS n FROM platform.jobs GROUP BY state`.execute(db)
  const jobs = { queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0 }
  for (const r of rows) jobs[r.state as keyof typeof jobs] = r.n
  const ages = await sql<{ q: number | null; e: number | null; retrying: number; pending: number }>`
    SELECT
      (SELECT extract(epoch FROM now() - min(run_at))::float8 FROM platform.jobs
        WHERE state = 'queued' AND run_at <= now()) AS q,
      (SELECT extract(epoch FROM now() - min(created_at))::float8 FROM platform.outbox_events
        WHERE state = 'pending') AS e,
      (SELECT count(*)::int FROM platform.jobs WHERE state = 'queued' AND attempts > 0) AS retrying,
      (SELECT count(*)::int FROM platform.outbox_events WHERE state = 'pending') AS pending`.execute(db)
  const a = ages.rows[0]
  return {
    jobs,
    pendingEvents: a?.pending ?? 0,
    oldestQueuedSeconds: a?.q ?? null,
    oldestPendingEventSeconds: a?.e ?? null,
    retrying: a?.retrying ?? 0,
  }
}
