// Transactional outbox and job queue against PostgreSQL 16 (TSK-0012; HH-ARC-08, HH-ARC-09, HH-AUTO-01).
import { withTx } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { sql } from 'kysely'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createAutomationRegistry, type Automation, type JobContext } from '../../src/platform/automation.js'
import { createWorker, listFailedJobs, queueStats, retryFailedJob, scheduleJob } from '../../src/platform/jobs.js'
import { outbox, OutboxError } from '../../src/platform/outbox.js'

let t: TestDatabase
beforeAll(async () => {
  t = await createTestDatabase()
  await sql`CREATE TABLE public.effects (automation text NOT NULL, job_key text NOT NULL, target text)`.execute(t.db)
})
afterAll(async () => {
  await t.drop()
})
beforeEach(async () => {
  // Each test starts with an empty queue; audit rows stay (append-only) and are filtered by request ID.
  await sql`DELETE FROM public.effects; DELETE FROM platform.jobs; DELETE FROM platform.outbox_events`.execute(t.db)
})

let seq = 0
const rid = () => `req-outbox-test-${++seq}`

function automation(name: string, over: Partial<Automation> = {}): Automation {
  return {
    name,
    trigger: { kind: 'event', eventTypes: ['request.submitted'] },
    identity: `system.${name}`,
    inputs: { description: 'request id', version: 1 },
    idempotency: 'job key: one per event',
    effect: 'one row in public.effects',
    retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 },
    timeoutMs: 5000,
    exceptionOwner: 'office',
    audit: { action: `${name}.done` },
    handle: async (ctx: JobContext) => {
      await sql`INSERT INTO public.effects VALUES (${name}, ${ctx.idempotencyKey}, ${ctx.job.target.id})`.execute(
        ctx.tx,
      )
    },
    ...over,
  }
}

const submit = (id: string, requestId = rid()) =>
  withTx(t.db, (tx) =>
    outbox.add(tx, {
      type: 'request.submitted',
      aggregate: { type: 'request', id, version: 1 },
      payload: { requestId: id },
      idempotencyKey: `request.submitted:${id}`,
      requestId,
    }),
  )
const effects = async () =>
  (await sql<{ automation: string; target: string }>`SELECT automation, target FROM public.effects`.execute(t.db)).rows
const jobs = () => t.db.selectFrom('platform.jobs').selectAll().orderBy('seq').execute()
const tick = () => new Promise((r) => setTimeout(r, 15))

describe('outbox.add (TSK-0012, HH-ARC-08)', () => {
  it('leaves no event when the business transaction rolls back', async () => {
    await expect(
      withTx(t.db, async (tx) => {
        await outbox.add(tx, {
          type: 'request.submitted',
          aggregate: { type: 'request', id: 'r-rollback' },
          idempotencyKey: 'k-rollback',
          requestId: rid(),
        })
        throw new Error('business write failed')
      }),
    ).rejects.toThrow('business write failed')
    expect(await t.db.selectFrom('platform.outbox_events').selectAll().execute()).toEqual([])
  })

  it('returns the existing event for a repeated idempotency key and refuses the key for a different event', async () => {
    const first = await submit('r-1')
    const again = await submit('r-1')
    expect(first.created).toBe(true)
    expect(again).toEqual({ id: first.id, created: false })
    expect(await t.db.selectFrom('platform.outbox_events').select('id').execute()).toHaveLength(1)
    await expect(
      withTx(t.db, (tx) =>
        outbox.add(tx, {
          type: 'estimate.published',
          aggregate: { type: 'estimate', id: 'e-1' },
          idempotencyKey: 'request.submitted:r-1',
          requestId: rid(),
        }),
      ),
    ).rejects.toThrow(/different event/)
  })

  it('refuses secret-looking payload fields, critical holds and writes outside a transaction', async () => {
    const add = (over: object) =>
      withTx(t.db, (tx) =>
        outbox.add(tx, {
          type: 'request.submitted',
          aggregate: { type: 'request' },
          idempotencyKey: `k-${seq++}`,
          requestId: rid(),
          ...over,
        }),
      )
    await expect(add({ payload: { accessCode: 'x' } })).rejects.toThrow(OutboxError)
    await expect(add({ payload: { verificationCode: 'x' } })).rejects.toThrow(/looks secret/)
    await expect(add({ type: 'job.critical_hold_placed' })).rejects.toThrow(/critical hold/)
    await expect(
      outbox.add(t.db as never, {
        type: 'request.submitted',
        aggregate: { type: 'request' },
        idempotencyKey: 'k-x',
        requestId: rid(),
      }),
    ).rejects.toThrow(/inside the business transaction/)
  })
})

describe('job worker (TSK-0012, HH-ARC-09, HH-AUTO-01)', () => {
  it('runs each declared consumer once per event, even when dispatch and workers run twice in parallel', async () => {
    const registry = createAutomationRegistry([automation('receipt_test.send'), automation('intake_test.notify')])
    const requestId = rid()
    await submit('r-once', requestId)
    await submit('r-once', requestId)
    const w1 = createWorker({ db: t.db, registry, workerId: 'w1' })
    const w2 = createWorker({ db: t.db, registry, workerId: 'w2' })
    await Promise.all([w1.runOnce(), w2.runOnce()])
    await Promise.all([w1.runOnce(), w2.runOnce()])
    expect((await effects()).sort((a, b) => a.automation.localeCompare(b.automation))).toEqual([
      { automation: 'intake_test.notify', target: 'r-once' },
      { automation: 'receipt_test.send', target: 'r-once' },
    ])
    expect((await jobs()).map((j) => [j.automation, j.state, j.attempts])).toEqual(
      expect.arrayContaining([
        ['receipt_test.send', 'succeeded', 1],
        ['intake_test.notify', 'succeeded', 1],
      ]),
    )
    const event = await t.db.selectFrom('platform.outbox_events').selectAll().executeTakeFirstOrThrow()
    expect(event).toMatchObject({ state: 'dispatched', jobs_created: 2 })
    const audited = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'actor_process', 'target_type', 'target_id'])
      .where('request_id', '=', requestId)
      .execute()
    expect(audited).toEqual(
      expect.arrayContaining([
        {
          action: 'receipt_test.send.done',
          actor_process: 'system.receipt_test.send',
          target_type: 'request',
          target_id: 'r-once',
        },
      ]),
    )
  })

  it('rolls back a failed attempt and retries it, so the effect happens once', async () => {
    let calls = 0
    const flaky = automation('flaky_test.send', {
      handle: async (ctx) => {
        calls++
        await sql`INSERT INTO public.effects VALUES ('flaky_test.send', ${ctx.idempotencyKey}, ${ctx.job.target.id})`.execute(
          ctx.tx,
        )
        if (ctx.job.attempt === 1)
          throw Object.assign(new Error('provider unavailable'), { name: 'ProviderUnavailable' })
      },
    })
    const worker = createWorker({ db: t.db, registry: createAutomationRegistry([flaky]) })
    await submit('r-flaky')
    expect(await worker.runOnce()).toMatchObject({ dispatched: 1, retried: 1, succeeded: 0 })
    expect(await effects()).toEqual([])
    expect((await jobs())[0]).toMatchObject({ state: 'queued', attempts: 1, last_error_class: 'ProviderUnavailable' })
    await tick()
    expect(await worker.runOnce()).toMatchObject({ succeeded: 1 })
    expect(calls).toBe(2)
    expect(await effects()).toEqual([{ automation: 'flaky_test.send', target: 'r-flaky' }])
    expect((await jobs())[0]).toMatchObject({ state: 'succeeded', attempts: 2, last_error_class: null })
  })

  it('ends in failed after the last retry, lists it for the exception owner, and a staff retry is audited', async () => {
    const broken = automation('broken_test.send', {
      retry: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 },
      handle: async () => {
        throw Object.assign(new Error('rejected'), { name: 'ProviderRejected' })
      },
    })
    const registry = createAutomationRegistry([broken])
    const worker = createWorker({ db: t.db, registry })
    const requestId = rid()
    await submit('r-broken', requestId)
    const results = []
    for (let i = 0; i < 4; i++) {
      results.push(await worker.runOnce())
      await tick()
    }
    expect(results.map((r) => [r.retried, r.failed])).toEqual([
      [1, 0],
      [1, 0],
      [0, 1],
      [0, 0],
    ])
    const [job] = await jobs()
    const jobId = job?.id ?? ''
    expect(job).toMatchObject({ state: 'failed', attempts: 3, last_error_class: 'ProviderRejected' })
    expect(job?.finished_at).toBeInstanceOf(Date)
    const failed = await listFailedJobs(t.db, registry)
    expect(failed).toEqual([
      expect.objectContaining({
        automation: 'broken_test.send',
        exceptionOwner: 'office',
        attempts: 3,
        errorClass: 'ProviderRejected',
        target: { type: 'request', id: 'r-broken' },
      }),
    ])
    const failAudit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'result'])
      .where('request_id', '=', requestId)
      .execute()
    expect(failAudit).toEqual([{ action: 'automation.failed', result: 'failed' }])
    expect((await queueStats(t.db)).jobs.failed).toBe(1)

    await withTx(t.db, (tx) =>
      retryFailedJob(tx, {
        jobId: jobId,
        actor: { kind: 'staff', id: 'staff-test-office', roles: ['office'] },
        reason: 'Synthetic retry',
        requestId: rid(),
      }),
    )
    expect((await jobs())[0]).toMatchObject({ state: 'queued', attempts: 0, finished_at: null })
    const retryAudit = await t.db
      .selectFrom('platform.audit_events')
      .select(['action', 'actor_id'])
      .where('action', '=', 'automation.retry')
      .where('target_id', '=', jobId)
      .execute()
    expect(retryAudit).toEqual([{ action: 'automation.retry', actor_id: 'staff-test-office' }])
    await expect(
      withTx(t.db, (tx) => retryFailedJob(tx, { jobId: jobId, actor: { kind: 'guest' }, requestId: rid() })),
    ).rejects.toThrow(/not in the failed state/)
  })

  it('records a consumer that finds its effect outdated as cancelled, with no effect', async () => {
    const stale = automation('stale_test.send', { handle: async () => 'cancelled' })
    const worker = createWorker({ db: t.db, registry: createAutomationRegistry([stale]) })
    await submit('r-stale')
    expect(await worker.runOnce()).toMatchObject({ cancelled: 1 })
    expect((await jobs())[0]).toMatchObject({ state: 'cancelled' })
    expect(await effects()).toEqual([])
  })

  it('requeues an expired lease as interrupted and reconciles before sending again', async () => {
    let sends = 0
    const reconciling = automation('reconcile_test.send', {
      reconcile: async () => 'done',
      handle: async () => {
        sends++
        return 'done'
      },
    })
    const registry = createAutomationRegistry([reconciling])
    await submit('r-lease')
    const worker = createWorker({ db: t.db, registry })
    // Simulate a worker that claimed the job and died mid-send: running, lease already expired.
    await worker.runOnce()
    expect(sends).toBe(1)
    await sql`UPDATE platform.jobs SET state = 'running', finished_at = NULL, locked_by = 'dead-worker',
      locked_until = now() - interval '1 second'`.execute(t.db)
    const r = await worker.runOnce()
    expect(r).toMatchObject({ requeued: 1, succeeded: 1 })
    expect(sends).toBe(1)
    expect((await jobs())[0]).toMatchObject({ state: 'succeeded', attempts: 2, interrupted: false })
  })

  it('fails an attempt that passes its timeout and aborts its signal', async () => {
    let aborted = false
    const slow = automation('slow_test.send', {
      timeoutMs: 50,
      retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
      handle: (ctx) =>
        new Promise((resolve) => {
          ctx.signal.addEventListener('abort', () => {
            aborted = true
            resolve(undefined)
          })
        }),
    })
    await submit('r-slow')
    expect(await createWorker({ db: t.db, registry: createAutomationRegistry([slow]) }).runOnce()).toMatchObject({
      failed: 1,
    })
    expect(aborted).toBe(true)
    expect((await jobs())[0]).toMatchObject({ state: 'failed', last_error_class: 'JobTimeout' })
  })

  it('runs a scheduled job only when it is due, once per key', async () => {
    const reminder = automation('reminder_test.draft', { trigger: { kind: 'schedule', description: 'test schedule' } })
    const worker = createWorker({ db: t.db, registry: createAutomationRegistry([reminder]) })
    const later = new Date(Date.now() + 60 * 60 * 1000)
    const requestId = rid()
    const created = await withTx(t.db, async (tx) => [
      await scheduleJob(tx, reminder, {
        key: 'appt-1',
        runAt: later,
        target: { type: 'appointment', id: 'appt-1' },
        requestId,
      }),
      await scheduleJob(tx, reminder, { key: 'appt-1', runAt: later, requestId }),
      await scheduleJob(tx, reminder, { key: 'appt-2', target: { type: 'appointment', id: 'appt-2' }, requestId }),
    ])
    expect(created.map((c) => c.created)).toEqual([true, false, true])
    expect(await worker.runOnce()).toMatchObject({ succeeded: 1 })
    expect(await effects()).toEqual([{ automation: 'reminder_test.draft', target: 'appt-2' }])
    const stats = await queueStats(t.db)
    expect(stats.jobs).toMatchObject({ queued: 1, succeeded: 1 })
    expect(stats.oldestQueuedSeconds).toBeNull()
  })

  it('reports queue age and pending events, and leaves unknown automations queued (HH-NFR-02)', async () => {
    await submit('r-stats')
    const stats = await queueStats(t.db)
    expect(stats.pendingEvents).toBe(1)
    expect(stats.oldestPendingEventSeconds).toBeGreaterThanOrEqual(0)
    await withTx(t.db, (tx) =>
      scheduleJob(tx, automation('orphan_test.run', { trigger: { kind: 'schedule', description: 'x' } }), {
        key: 'o-1',
        requestId: rid(),
      }),
    )
    await createWorker({ db: t.db, registry: createAutomationRegistry([automation('other_test.send')]) }).runOnce()
    expect((await jobs()).find((j) => j.automation === 'orphan_test.run')).toMatchObject({
      state: 'queued',
      attempts: 0,
    })
  })
})
