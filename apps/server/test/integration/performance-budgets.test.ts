// Performance budgets in CI (TSK-0105; HH-NFR-01, RULE-SYNTHETIC-DATA). A small fixed synthetic dataset (made through
// the server's own routes, test/perf/dataset.ts) and the load of test/perf/load.ts, against the listening server:
// - the decided budgets of docs/perf/budgets.json hold: staff key reads p95 under 20 concurrent staff users, core
//   writes p95 while 16 of them keep reading; a NOT CONFIGURED budget (null) is measured, never enforced;
// - the statements a key read runs do not grow with the data (an N+1 query is caught at any size, where a timing
//   on a small dataset would not see it); the large measurement is test/perf/measure.test.ts (docs/perf/README.md).
// Timings on a shared CI runner are noisy; the budgets are far above what this small dataset needs, so only a real
// regression (or a pathological runner) fails them.
import { withTx } from '@handyhub/db'
import { sql } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { loadBudgets, verdicts } from '../perf/budgets.js'
import { generateDataset, proposedMix, type Generated } from '../perf/dataset.js'
import { openPerfEnvironment, type PerfEnvironment } from '../perf/environment.js'
import { buildPlan, countQueries, phases, runClients, summarize, type LoadPlan } from '../perf/load.js'

let perf: PerfEnvironment
let data: Generated
let plan: LoadPlan

beforeAll(async () => {
  perf = await openPerfEnvironment()
  data = await generateDataset(perf, proposedMix(24))
  plan = await buildPlan(perf, data)
}, 120_000)

afterAll(async () => {
  await perf?.close()
})

describe('performance budgets on a small fixed synthetic dataset (TSK-0105, HH-NFR-01)', () => {
  it('[HH-NFR-01] the dataset has jobs, open requests, waiting estimates and booked visits, all fictional', async () => {
    expect(data.jobs).toHaveLength(24)
    expect(data.awaiting.length).toBeGreaterThan(0)
    expect(data.visits.length).toBeGreaterThan(0)
    const contacts = await perf.db.selectFrom('crm.contacts').select(['full_name', 'email', 'phone_e164']).execute()
    for (const c of contacts) {
      expect(c.full_name).toContain('TEST DATA (fictional)')
      expect(c.email).toMatch(/@example\.test$/)
      expect(c.phone_e164).toMatch(/^\+1[2-9]\d{2}55501\d{2}$/)
    }
  })

  it('[HH-NFR-01] staff key reads stay within their p95 budget with 20 staff users at once', async () => {
    const budget = loadBudgets().api.staff_read.p95Ms
    const { samples } = await runClients(perf, phases(plan, { rounds: 2, writesPerLane: 0 }).staffReads)
    const unexpected = samples.filter((s) => !s.ok)
    expect(unexpected, JSON.stringify(unexpected.slice(0, 3))).toEqual([])
    const [v] = verdicts(samples).filter((x) => x.group === 'staff_read')
    expect(v?.n).toBeGreaterThan(50)
    if (budget !== null)
      expect(v?.p95, JSON.stringify(summarize(samples).map((o) => [o.op, o.p95]))).toBeLessThanOrEqual(budget)
  }, 120_000)

  it('[HH-NFR-01] submission, acceptance, schedule and start stay within the core-write p95 budget under load', async () => {
    const budget = loadBudgets().api.core_write.p95Ms
    const { samples } = await runClients(perf, phases(plan, { rounds: 1, writesPerLane: 6 }).writesUnderLoad)
    const writes = samples.filter((s) => s.group === 'core_write')
    const unexpected = samples.filter((s) => !s.ok)
    expect(unexpected, JSON.stringify(unexpected.slice(0, 3))).toEqual([])
    expect(new Set(writes.map((s) => s.op))).toEqual(
      new Set(['submit_request', 'approve_estimate', 'plan_visit', 'confirm_visit', 'start_work_attempt']),
    )
    const [v] = verdicts(writes).filter((x) => x.group === 'core_write')
    if (budget !== null)
      expect(v?.p95, JSON.stringify(summarize(writes).map((o) => [o.op, o.p95]))).toBeLessThanOrEqual(budget)
  }, 120_000)

  it('[HH-NFR-01] a key read runs the same number of statements when the data doubles (no N+1 queries)', async () => {
    const reads = [...[...plan.reads.values()].flat(), ...plan.customerReads]
    const before = await countQueries(perf, reads)
    // Twice the jobs. The new visits start a new round of the workers, so the first worker (whose My job packets is
    // counted) gets a second assigned job, and they land on the same days as the first ones (the board shows more).
    const workers = perf.staff.filter((s) => s.role === 'worker').length
    await generateDataset(perf, proposedMix(48), { firstSlot: Math.ceil(data.visits.length / workers) * workers })
    const after = await countQueries(perf, reads)
    const grown = [...after.entries()]
      .filter(([op, n]) => n > (before.get(op) ?? 0) + 2)
      .map(([op, n]) => `${op}: ${before.get(op)} -> ${n}`)
    expect(grown).toEqual([])
    expect(after.size).toBeGreaterThanOrEqual(15)
  }, 180_000)

  it('[HH-NFR-01] a job’s work packages are found through an index, not a scan of every package (0134)', async () => {
    const job = data.jobs[0]?.jobId as string
    const plan = await withTx(perf.db, async (tx) => {
      // The planner is told to avoid scans so the small dataset shows what 10,000 jobs make it choose.
      await sql`SET LOCAL enable_seqscan = off`.execute(tx)
      return (
        await sql<{ 'QUERY PLAN': string }>`EXPLAIN SELECT id FROM work.work_packages WHERE job_id = ${job}`.execute(tx)
      ).rows
        .map((r) => r['QUERY PLAN'])
        .join('\n')
    })
    expect(plan).toMatch(/work_packages_job/)
  })
})
