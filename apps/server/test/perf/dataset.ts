// The representative synthetic dataset (TSK-0105; HH-NFR-01 "Dataset: 10,000 jobs", RULE-SYNTHETIC-DATA,
// RULE-NO-INVENTED-FACTS). Every record is created through the server's own routes and functions, with the steps of
// the staging fresh test data (freshDataKit, TSK-0141), never by writing tables around the business rules: a request
// is submitted by a fictional guest, qualified, estimated online, published and approved by the fictional customer,
// so each job has the request, project, customer, property, estimate, approval, deposit requirement, queue items,
// outbox events and audit trail a real one has.
// - Contacts are fictional: names say "TEST DATA (fictional)", e-mail addresses are on a reserved test domain and
//   phone numbers are in the fictional 555-0100 to 555-0199 range (one number per contact, spread over area codes).
// - The amount is the staging data's fictional test amount (just above the configured deposit threshold), never a
//   price. The mix below (how many requests stay open, how many estimates wait, how many visits are booked and
//   deposits recorded) is PROPOSED in OQ-PERF-BUDGET-DETAILS; HH-NFR-01 gives only the number of jobs.
// - Visits are booked on future days (planVisit refuses the past), at most three a day per synthetic worker, so the
//   schedule board and My Day see a realistic spread rather than one crowded day.
import { randomUUID } from 'node:crypto'
import { assertTestEmail, assertTestPhone, TEST_EMAIL_DOMAINS, withTx, type Tx } from '@handyhub/db'
import { addLocalDays, localDateOf } from '@handyhub/domain'
import { freshDataKit } from '../../src/modules/staging/fresh-data.js'
import { loadConfig } from '../../src/platform/config/index.js'
import { runWithContext } from '../../src/platform/request-context.js'
import type { PerfEnvironment } from './environment.js'

/** PROPOSED (OQ-PERF-BUDGET-DETAILS): the records around N jobs. */
export type DatasetMix = {
  /** Approved estimates with their job (HH-NFR-01: 10,000 at full size). */
  jobs: number
  /** Requests submitted and not yet estimated. */
  openRequests: number
  /** Estimates published and waiting for the customer (the approvals the write load consumes come on top). */
  awaitingApproval: number
  /** Jobs with a confirmed work visit on a future day (at full size about four weeks of three visits a day per worker). */
  bookedVisits: number
  /** Jobs whose deposit was recorded (cash, by staff; no provider is called). */
  depositsPaid: number
}

export function proposedMix(jobs: number): DatasetMix {
  return {
    jobs,
    openRequests: Math.ceil(jobs / 10),
    awaitingApproval: Math.ceil(jobs / 10),
    bookedVisits: Math.ceil(jobs / 10),
    depositsPaid: Math.ceil(jobs / 2),
  }
}

// Area codes 201 to 989 without N11 codes: 78,900 fictional numbers.
const AREAS: string[] = []
for (let a = 201; a <= 989; a++) if (!String(a).endsWith('11')) AREAS.push(String(a))
/** One counter for the whole process, so no two fictional contacts share an e-mail address or a number. */
let contactSeq = 0
let phoneSeq = 0

/**
 * Fictional contacts: an e-mail address on a reserved test domain and a 555-01xx number, each used once (a shared
 * number or address would make the records look like one customer's duplicates, which real customers are not).
 */
export function perfContacts() {
  const run = randomUUID().slice(0, 8)
  return {
    email: (label: string) => assertTestEmail(`perf-${run}-${label}-${++contactSeq}@${TEST_EMAIL_DOMAINS[0]}`),
    phone: () => {
      const i = phoneSeq++ % (AREAS.length * 100)
      const area = AREAS[Math.floor(i / 100)] as string
      return assertTestPhone(`+1${area}55501${String(i % 100).padStart(2, '0')}`)
    },
  }
}

export type Generated = {
  jobs: { jobId: string; projectId: string; reference: string }[]
  /** Published estimates waiting for the customer: the write load's approvals use some of them. */
  awaiting: { projectId: string; reference: string; requestId: string; contactId: string; number: string }[]
  /** Booked work visits: the visit, its job and its worker. */
  visits: { visitId: string; jobId: string; workerId: string; localDate: string }[]
  seconds: number
}

type Kit = ReturnType<typeof freshDataKit>

/** Plans and confirms one work visit for a job, at a fixed slot (worker, day, window) no other booking uses. */
async function book(kit: Kit, tx: Tx, projectId: string, workerId: string, localDate: string, slot: number) {
  const config = await loadConfig(tx)
  const zone = config.get('business.timezone')
  if (zone.state !== 'CONFIGURED') throw new Error('perf dataset: business.timezone is NOT CONFIGURED')
  await kit.propertyChecked(tx, projectId, zone.value.zone)
  // PROPOSED windows inside the synthetic hours: 09-11, 12-14, 15-17.
  const start = 9 + slot * 3
  await kit.invoke(tx, 'planVisit', {
    params: { projectId },
    body: {
      purpose: 'service',
      localDate,
      windowStart: `${String(start).padStart(2, '0')}:00`,
      windowEnd: `${String(start + 2).padStart(2, '0')}:00`,
      expectedDurationMinutes: 60,
      requiredWorkers: 1,
    },
    as: kit.owner,
  })
  const visit = await tx
    .selectFrom('work.visits')
    .select(['id', 'version'])
    .where('project_id', '=', projectId)
    .where('purpose', '=', 'service')
    .orderBy('created_at', 'desc')
    .executeTakeFirstOrThrow()
  await kit.invoke(tx, 'confirmVisit', {
    params: { visitId: visit.id },
    body: { workerIds: [workerId], reason: 'TEST DATA (fictional): performance dataset appointment.' },
    version: visit.version,
    as: kit.owner,
  })
  return visit.id
}

/**
 * Creates the mix through the routes, in `lanes` concurrent lanes (each its own fictional contacts and transactions).
 * Reports progress every 100 records.
 */
export async function generateDataset(
  env: PerfEnvironment,
  mix: DatasetMix,
  options: {
    lanes?: number
    /** The first booking slot (a later call on the same database continues after the visits of an earlier one). */
    firstSlot?: number
    progress?: (done: number, total: number) => void
  } = {},
): Promise<Generated> {
  const started = Date.now()
  const lanes = Math.max(1, options.lanes ?? 4)
  const workers = env.staff.filter((s) => s.role === 'worker')
  if (mix.bookedVisits > 0 && workers.length === 0) throw new Error('perf dataset: visits need synthetic workers')
  const zone = (await loadConfig(env.db)).get('business.timezone')
  if (zone.state !== 'CONFIGURED') throw new Error('perf dataset: business.timezone is NOT CONFIGURED')
  const today = localDateOf(new Date(), zone.value.zone)
  const out: Generated = { jobs: [], awaiting: [], visits: [], seconds: 0 }

  // One task list, dealt to the lanes in turn: kind, and for a job its booking slot and whether its deposit is paid.
  type Task = { kind: 'job'; book: number | null; pay: boolean } | { kind: 'open' } | { kind: 'awaiting' }
  const tasks: Task[] = []
  // A work visit waits for the deposit (the visit gates, TSK-0059), so every booked job is a paid one too.
  for (let i = 0; i < mix.jobs; i++)
    tasks.push({
      kind: 'job',
      book: i < mix.bookedVisits ? (options.firstSlot ?? 0) + i : null,
      pay: i < Math.max(mix.depositsPaid, mix.bookedVisits),
    })
  for (let i = 0; i < mix.openRequests; i++) tasks.push({ kind: 'open' })
  for (let i = 0; i < mix.awaitingApproval; i++) tasks.push({ kind: 'awaiting' })
  // Interleave the kinds (a fixed-seed shuffle), so every stretch of the dataset and of created_at mixes them.
  let seed = 20_261_026
  for (let i = tasks.length - 1; i > 0; i--) {
    seed = (seed * 48_271) % 2_147_483_647
    const j = seed % (i + 1)
    ;[tasks[i], tasks[j]] = [tasks[j] as Task, tasks[i] as Task]
  }

  let done = 0
  const runLane = async (lane: number) => {
    const kit = freshDataKit(
      {
        db: env.db,
        routes: env.routes,
        owner: { actor: env.owner, authenticatedAt: new Date() },
        codeKey: env.codeKey,
        requestId: `perf-dataset-${lane}`,
        runId: randomUUID(),
      },
      perfContacts(),
    )
    for (let i = lane; i < tasks.length; i += lanes) {
      const task = tasks[i] as Task
      // Each record is its own correlated request, as when it comes through the HTTP layer.
      await runWithContext({ requestId: `perf-dataset-${lane}-${i}` }, () =>
        withTx(env.db, async (tx) => {
          if (task.kind === 'open') {
            await kit.submit(tx, 'perf-request')
            return
          }
          if (task.kind === 'awaiting') {
            const e = await kit.published(tx, 'perf-estimate')
            out.awaiting.push({
              projectId: e.projectId,
              reference: e.reference,
              requestId: e.requestId,
              contactId: e.contactId,
              number: e.number,
            })
            return
          }
          const a = await kit.approved(tx, 'perf-job')
          if (task.pay) await kit.paid(tx, a)
          out.jobs.push({ jobId: a.jobId, projectId: a.projectId, reference: a.reference })
          if (task.book !== null) {
            // Slot k: worker k mod W, then three windows a day, from the day after tomorrow on.
            const worker = workers[task.book % workers.length] as (typeof workers)[number]
            const perDay = workers.length * 3
            const localDate = addLocalDays(today, 2 + Math.floor(task.book / perDay))
            const slot = Math.floor(task.book / workers.length) % 3
            const visitId = await book(kit, tx, a.projectId, worker.id, localDate, slot)
            out.visits.push({ visitId, jobId: a.jobId, workerId: worker.id, localDate })
          }
        }),
      )
      done++
      if (options.progress && done % 100 === 0) options.progress(done, tasks.length)
    }
  }
  await Promise.all(Array.from({ length: lanes }, (_, lane) => runLane(lane)))
  out.seconds = (Date.now() - started) / 1000
  return out
}
