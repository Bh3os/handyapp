// The large performance measurement (TSK-0105; HH-NFR-01, RULE-SYNTHETIC-DATA). Not part of CI (CI runs the small
// fixed dataset of test/integration/performance-budgets.test.ts); run it on purpose, on a quiet machine or staging-like
// host, as docs/perf/README.md describes:
//   PERF_JOBS=10000 pnpm --filter @handyhub/server perf
// It builds a throwaway database, generates the synthetic dataset through the server's own routes, runs the phases of
// load.ts against the listening server and writes one JSON result to docs/perf/results/ (lab results on the machine
// that ran it: never field data and never a promise). PERF_NOTE describes the machine (for example "shared laptop,
// other test suites running"); it is copied into the result.
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { sql } from 'kysely'
import { expect, it } from 'vitest'
import { verdicts, loadBudgets } from './budgets.js'
import { generateDataset, proposedMix } from './dataset.js'
import { openPerfEnvironment } from './environment.js'
import { renderResult } from './report.js'
import { buildPlan, countQueries, exportOps, phases, runClients, summarize, type Sample } from './load.js'

const env = (name: string, fallback: number) => Number(process.env[name] ?? fallback)

/** Row counts of the tables the measured screens read. */
const COUNTED = [
  'crm.customers',
  'crm.contacts',
  'crm.properties',
  'crm.projects',
  'intake.requests',
  'estimating.estimates',
  'estimating.approvals',
  'work.jobs',
  'work.visits',
  'work.reservations',
  'finance.deposit_requirements',
  'finance.payments',
  'ops.queue_items',
  'platform.audit_events',
  'platform.outbox_events',
] as const

it(
  'measures the budgets on the representative synthetic dataset (HH-NFR-01)',
  async () => {
    const jobs = env('PERF_JOBS', 10_000)
    const rounds = env('PERF_ROUNDS', 5)
    const loadBefore = os.loadavg()
    const perf = await openPerfEnvironment()
    try {
      const mix = proposedMix(jobs)
      const data = await generateDataset(perf, mix, {
        lanes: env('PERF_LANES', 6),
        progress: (done, total) => {
          if (done % 1000 === 0) process.stdout.write(`perf dataset: ${done} of ${total}\n`)
        },
      })
      const rows: Record<string, number> = {}
      for (const table of COUNTED)
        rows[table] = Number(
          (await sql<{ n: string }>`SELECT count(*)::text AS n FROM ${sql.raw(table)}`.execute(perf.db)).rows[0]?.n ??
            0,
        )
      await sql`ANALYZE`.execute(perf.db)
      const plan = await buildPlan(perf, data)
      const reads = [...[...plan.reads.values()].flat(), ...plan.customerReads]
      // Warm-up and statements per request, each read alone.
      const queries = await countQueries(perf, reads)
      const p = phases(plan, { rounds, writesPerLane: env('PERF_WRITES', 40) })
      perf.queries.statements.clear()
      const a = await runClients(perf, p.staffReads)
      const statements = [...perf.queries.statements.entries()]
        .map(([text, s]) => ({ text, ...s, totalMs: Math.round(s.totalMs), meanMs: s.totalMs / s.count }))
        .sort((x, y) => y.totalMs - x.totalMs)
        .slice(0, 15)
      const b = await runClients(perf, p.writesUnderLoad)
      const c = await runClients(perf, p.customers)
      const exports = await exportOps(perf)
      const d = await runClients(perf, [exports.flatMap((op) => [op, op, op])])
      const tag = (xs: Sample[], phase: string) => xs.map((s) => ({ ...s, phase }))
      const all = [...tag(a.samples, 'A'), ...tag(b.samples, 'B'), ...tag(c.samples, 'C'), ...tag(d.samples, 'D')]
      // The budget of each group from its own phase: reads under the 20-user read load, writes under the mixed load.
      const budgets = loadBudgets()
      const judged = [
        ...verdicts(a.samples, budgets).filter((v) => v.group === 'staff_read'),
        ...verdicts(
          b.samples.filter((s) => s.group === 'core_write'),
          budgets,
        ).filter((v) => v.group === 'core_write'),
        ...verdicts(c.samples, budgets).filter((v) => v.group === 'customer_read'),
        ...verdicts(d.samples, budgets).filter((v) => v.group === 'export'),
      ]
      const version =
        (await sql<{ v: string }>`SELECT current_setting('server_version') AS v`.execute(perf.db)).rows[0]?.v ?? null
      const commit = (() => {
        try {
          return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
        } catch {
          return null
        }
      })()
      const result = {
        kind: 'lab',
        task: 'TSK-0105',
        measuredAt: new Date().toISOString(),
        commit,
        note: process.env['PERF_NOTE'] ?? null,
        machine: {
          platform: `${os.platform()} ${os.release()}`,
          cpus: os.cpus().length,
          cpuModel: os.cpus()[0]?.model ?? null,
          memoryGb: Math.round(os.totalmem() / 2 ** 30),
          loadAverageBefore: loadBefore.map((x) => Math.round(x * 10) / 10),
          loadAverageAfter: os.loadavg().map((x) => Math.round(x * 10) / 10),
          node: process.version,
          postgres: version,
        },
        dataset: { mix, generatedSeconds: data.seconds, rows },
        protocol: {
          users: perf.staff.length,
          rounds,
          phases: {
            A: `${p.staffReads.length} staff users, closed loop, ${rounds} rounds of their role's reads`,
            B: `${p.writesUnderLoad.length} clients: 4 write lanes (submission, acceptance, schedule, start) and readers`,
            C: `${p.customers.length} customers reading their project overview`,
            D: 'the Owner, alone: each export three times',
          },
          seconds: { A: a.seconds, B: b.seconds, C: c.seconds, D: d.seconds },
        },
        verdicts: judged,
        operations: {
          A: summarize(a.samples, queries),
          B: summarize(b.samples, queries),
          C: summarize(c.samples, queries),
          D: summarize(d.samples, queries),
        },
        topStatementsPhaseA: statements,
        unexpected: [...new Map(all.filter((s) => !s.ok).map((s) => [`${s.op}:${s.status}`, s])).values()],
      }
      const dir = fileURLToPath(new URL('../../../../docs/perf/results/', import.meta.url))
      mkdirSync(dir, { recursive: true })
      const file = `${dir}${result.measuredAt.slice(0, 10)}-${jobs}-jobs.json`
      writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`)
      process.stdout.write(`perf result: ${file}\n\n${renderResult(result)}`)
      // The measurement records what it found; it fails only when it could not measure (no samples at all).
      expect(all.length).toBeGreaterThan(0)
    } finally {
      await perf.close()
    }
  },
  6 * 3_600_000,
)
