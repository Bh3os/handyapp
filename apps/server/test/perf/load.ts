// The load runner (TSK-0105; HH-NFR-01): staff key reads, the portal overview, core writes and exports over real HTTP
// on loopback against the listening server, with closed-loop virtual users (each sends its next request as soon as
// the previous one answered: no think time, so the load is an upper bound of what 20 active people cause). Latency
// is measured at the client, from sending the request to the last byte of the answer; no third-party provider is
// called (outside production the outbox only queues, and nothing here waits for it).
// PROPOSED in OQ-PERF-BUDGET-DETAILS: which operations count as key reads and core writes, the closed loop, the
// rounds, and the percentile method (nearest rank).
import { randomUUID } from 'node:crypto'
import { addLocalDays, localDateOf } from '@handyhub/domain'
import type { SubmitBody } from '@handyhub/domain/request-form'
import { withTx } from '@handyhub/db'
import { startCustomerSession } from '../../src/modules/identity/customer-sessions.js'
import { freshDataKit } from '../../src/modules/staging/fresh-data.js'
import { loadConfig } from '../../src/platform/config/index.js'
import { runWithContext } from '../../src/platform/request-context.js'
import { perfContacts, type Generated } from './dataset.js'
import type { PerfEnvironment, StaffSession } from './environment.js'

/** At most this many approvals, and work visits planned and confirmed, the write load prepares (PROPOSED). */
const MAX_SCHEDULED = 200

export type Group = 'staff_read' | 'customer_read' | 'core_write' | 'export'

export type Sample = { op: string; group: Group; ms: number; status: number; ok: boolean; detail?: string }

export type OpSummary = {
  op: string
  group: Group
  n: number
  p50: number
  p95: number
  max: number
  /** Answers outside the expected statuses (refusals the operation does not expect, server errors). */
  errors: number
  statuses: Record<string, number>
  /** Statements the server ran for one request of this operation, measured alone (no other load). */
  queries: number | null
}

/** Nearest-rank percentile of the samples (ms), rounded to 0.1 ms. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil((p / 100) * sorted.length)))
  return Math.round((sorted[rank - 1] as number) * 10) / 10
}

type Http = { method: 'GET' | 'POST' | 'PUT'; path: string; body?: unknown; headers?: Record<string, string> }
export type Op = {
  id: string
  group: Group
  /** Statuses the operation expects (a refusal the dataset makes certain, such as Start Work on a future visit). */
  expect?: number[]
  build: () => Promise<Http> | Http
  /** The session the request carries, if any. */
  as?: StaffSession | { cookie: string; csrf?: string } | null
}

async function send(env: PerfEnvironment, op: Op, built?: Http): Promise<Sample> {
  const req = built ?? (await op.build())
  const headers: Record<string, string> = { ...(req.headers ?? {}) }
  if (op.as) {
    headers['cookie'] = op.as.cookie
    if (req.method !== 'GET' && op.as.csrf) headers['x-csrf-token'] = op.as.csrf
  }
  if (req.method !== 'GET') headers['idempotency-key'] ??= `synthetic-perf-${randomUUID()}`
  if (req.body !== undefined) headers['content-type'] = 'application/json'
  const started = performance.now()
  const res = await fetch(`${env.origin}${req.path}`, {
    method: req.method,
    headers,
    ...(req.body === undefined ? {} : { body: JSON.stringify(req.body) }),
  })
  const bytes = await res.arrayBuffer()
  const ms = performance.now() - started
  const ok = (op.expect ?? [200, 201]).includes(res.status)
  // An unexpected answer keeps the start of its error body (codes only: the API never echoes personal data).
  const detail = ok ? undefined : Buffer.from(bytes).toString('utf8').slice(0, 300)
  return { op: op.id, group: op.group, ms, status: res.status, ok, ...(detail === undefined ? {} : { detail }) }
}

export type LoadPlan = {
  /** Read operations per staff role (each virtual user cycles through its role's list). */
  reads: Map<StaffSession, Op[]>
  customerReads: Op[]
  /** The write lanes: submission (one operation, repeated), acceptance, schedule (plan, confirm), start. */
  writes: Op[][]
}

const pick = <T>(xs: readonly T[], i: number): T => xs[i % xs.length] as T

/** The operations of the plan, built over the generated dataset. */
export async function buildPlan(env: PerfEnvironment, data: Generated): Promise<LoadPlan> {
  const config = await loadConfig(env.db)
  const zone = config.get('business.timezone')
  if (zone.state !== 'CONFIGURED') throw new Error('perf load: business.timezone is NOT CONFIGURED')
  const today = localDateOf(new Date(), zone.value.zone)
  const monthAgo = addLocalDays(today, -30)
  const byRole = (role: StaffSession['role']) => env.staff.filter((s) => s.role === role)
  const customers = await env.db
    .selectFrom('crm.contacts')
    .select(['full_name', 'email'])
    .orderBy('created_at')
    .limit(500)
    .execute()
  const requests = await env.db.selectFrom('intake.requests').select('id').orderBy('submitted_at').limit(500).execute()
  const customerIds = await env.db.selectFrom('crm.customers').select('id').orderBy('created_at').limit(500).execute()
  let n = 0
  const next = () => n++
  // Searches staff type: part of a fictional name, an exact e-mail address, a project reference.
  const search = (): Http => {
    const i = next()
    const c = pick(customers, i)
    const q =
      i % 3 === 0
        ? (c.full_name.split(' ').at(-1) ?? 'perf')
        : i % 3 === 1
          ? (c.email ?? 'nobody@example.test')
          : pick(data.jobs, i).reference
    return { method: 'GET', path: `/api/v1/staff/customers?q=${encodeURIComponent(q)}` }
  }
  const officeReads = (s: StaffSession): Op[] => [
    { id: 'queue', group: 'staff_read', as: s, build: () => ({ method: 'GET', path: '/api/v1/staff/queue' }) },
    {
      id: 'schedule_day',
      group: 'staff_read',
      as: s,
      build: () => ({ method: 'GET', path: `/api/v1/staff/schedule?date=${pick(data.visits, next()).localDate}` }),
    },
    {
      id: 'schedule_week',
      group: 'staff_read',
      as: s,
      build: () => ({
        method: 'GET',
        path: `/api/v1/staff/schedule?view=week&date=${pick(data.visits, next()).localDate}`,
      }),
    },
    { id: 'customer_search', group: 'staff_read', as: s, build: search },
    {
      id: 'customers_list',
      group: 'staff_read',
      as: s,
      build: () => ({ method: 'GET', path: '/api/v1/staff/customers' }),
    },
    {
      id: 'requests_list',
      group: 'staff_read',
      as: s,
      build: () => ({ method: 'GET', path: '/api/v1/staff/requests?state=open' }),
    },
    {
      id: 'request_summary',
      group: 'staff_read',
      as: s,
      build: () => ({ method: 'GET', path: `/api/v1/staff/requests/${pick(requests, next()).id}/summary` }),
    },
    {
      id: 'customer_record',
      group: 'staff_read',
      as: s,
      build: () => ({ method: 'GET', path: `/api/v1/staff/customers/${pick(customerIds, next()).id}` }),
    },
    {
      id: 'job_packet',
      group: 'staff_read',
      as: s,
      build: () => ({ method: 'GET', path: `/api/v1/staff/jobs/${pick(data.jobs, next()).jobId}/packet` }),
    },
  ]
  const reads = new Map<StaffSession, Op[]>()
  for (const s of byRole('owner'))
    reads.set(s, [
      {
        id: 'dashboard',
        group: 'staff_read',
        as: s,
        build: () => ({ method: 'GET', path: `/api/v1/staff/dashboard?from=${monthAgo}&to=${today}` }),
      },
      {
        id: 'dashboard_records',
        group: 'staff_read',
        as: s,
        build: () => ({
          method: 'GET',
          path: `/api/v1/staff/dashboard/records?from=${monthAgo}&to=${today}&figure=overview.new_requests`,
        }),
      },
      {
        id: 'owner_decisions',
        group: 'staff_read',
        as: s,
        build: () => ({ method: 'GET', path: '/api/v1/staff/queue/owner-decisions' }),
      },
      ...officeReads(s),
    ])
  for (const s of byRole('office')) reads.set(s, officeReads(s))
  for (const s of byRole('estimator'))
    reads.set(
      s,
      officeReads(s).filter((o) => ['queue', 'customer_search', 'requests_list', 'request_summary'].includes(o.id)),
    )
  for (const s of byRole('worker')) {
    const own = data.visits.filter((v) => v.workerId === s.id)
    reads.set(s, [
      { id: 'my_day', group: 'staff_read', as: s, build: () => ({ method: 'GET', path: '/api/v1/staff/my/day' }) },
      {
        id: 'my_job_packets',
        group: 'staff_read',
        as: s,
        build: () => ({ method: 'GET', path: '/api/v1/staff/my/job-packets' }),
      },
      ...(own.length
        ? [
            {
              id: 'job_packet',
              group: 'staff_read' as const,
              as: s,
              build: (): Http => ({ method: 'GET', path: `/api/v1/staff/jobs/${pick(own, next()).jobId}/packet` }),
            },
          ]
        : []),
    ])
  }

  // Customers: a session on each of a sample of projects (as the access link or account sign-in gives).
  const sample = data.jobs.filter((_, i) => i % Math.max(1, Math.floor(data.jobs.length / 40)) === 0).slice(0, 40)
  const customerSessions: { cookie: string; reference: string }[] = []
  for (const j of sample) {
    const s = await withTx(env.db, async (tx) => {
      const req = await tx
        .selectFrom('intake.requests as r')
        .innerJoin('identity.project_access_grants as g', 'g.request_id', 'r.id')
        .select(['r.contact_id', 'g.id as grant'])
        .where('r.project_id', '=', j.projectId)
        .executeTakeFirstOrThrow()
      return startCustomerSession(tx, {
        contactRef: req.contact_id,
        via: 'grant',
        projectIds: [j.projectId],
        verifiedAt: new Date(),
        grantId: req.grant,
      })
    })
    customerSessions.push({ cookie: `__Host-hh_customer=${s.token}`, reference: j.reference })
  }
  const customerReads: Op[] = customerSessions.map((c) => ({
    id: 'portal_overview',
    group: 'customer_read',
    as: { cookie: c.cookie },
    build: () => ({ method: 'GET', path: `/api/v1/customer/projects/${c.reference}/overview` }),
  }))

  // Core writes. Submission: a fictional guest per request, each from its own documentation-range network.
  const notice = config.get('legal.privacy_notice')
  const services = (
    await env.db.selectFrom('catalog.services').select('id').where('public_status', '<>', 'draft').limit(2).execute()
  ).map((r) => r.id)
  const zip = await env.db
    .selectFrom('intake.requests as r')
    .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
    .innerJoin('crm.properties as pr', 'pr.id', 'p.property_id')
    .select('pr.zip')
    .executeTakeFirstOrThrow()
    .then((r) => r.zip)
  const contacts = perfContacts()
  let guests = 0
  const submit: Op = {
    id: 'submit_request',
    group: 'core_write',
    build: () => {
      const i = ++guests
      const body: SubmitBody = {
        formVersion: 'perf-test-data-1',
        privacyNoticeVersion: notice.state === 'CONFIGURED' ? notice.value.documentId : 'not-configured-1',
        services: services.map((serviceId) => ({ serviceId })),
        notSure: services.length === 0,
        description: 'TEST DATA (fictional): a made-up request of the performance measurement. Not a real customer.',
        answers: [],
        property: {
          street: `${i} Fictional Measure Lane`,
          unit: 'Test perf',
          city: 'Testville',
          state: 'KY',
          zip,
          propertyType: 'house',
        },
        timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
        estimatePreference: 'online',
        contact: {
          fullName: `TEST DATA (fictional) measure ${i}`,
          email: contacts.email('measure'),
          phone: contacts.phone().slice(2),
          preferredChannel: 'email',
        },
        smsOptIn: false,
        marketingOptIn: false,
      }
      return {
        method: 'POST',
        path: '/api/v1/public/requests',
        body,
        headers: { 'x-forwarded-for': `203.0.113.${(i % 250) + 1}` },
      }
    },
    expect: [200, 201],
  }

  // Acceptance: the customer approves a published estimate (each estimate once), after reading it as a customer does.
  const terms = config.get('legal.estimate_terms')
  const approvals: Op[] = []
  for (const [k, e] of data.awaiting.slice(0, MAX_SCHEDULED).entries()) {
    // Each fictional customer from their own documentation-range network, as real customers are.
    const network = { 'x-forwarded-for': `192.0.2.${(k % 250) + 1}` }
    const session = await withTx(env.db, async (tx) => {
      const grant = await tx
        .selectFrom('identity.project_access_grants')
        .select('id')
        .where('request_id', '=', e.requestId)
        .executeTakeFirstOrThrow()
      return startCustomerSession(tx, {
        contactRef: e.contactId,
        via: 'grant',
        projectIds: [e.projectId],
        verifiedAt: new Date(),
        grantId: grant.id,
      })
    })
    const cookie = `__Host-hh_customer=${session.token}`
    const path = `/api/v1/customer/projects/${e.reference}/estimates/${e.number}/versions/1`
    approvals.push({
      id: 'approve_estimate',
      group: 'core_write',
      as: { cookie },
      build: async () => {
        const view = await fetch(`${env.origin}${path}`, { headers: { cookie, ...network } })
        const v = (await view.json()) as {
          totalCents: number
          approval: {
            contentDigest: string
            selection: { options: number[]; totalCents: number; deposit: { amountCents: number | null } } | null
          }
        }
        const s = v.approval.selection
        if (terms.state !== 'CONFIGURED') throw new Error('perf load: legal.estimate_terms is NOT CONFIGURED')
        const name = await env.db
          .selectFrom('crm.contacts')
          .select('full_name')
          .where('id', '=', e.contactId)
          .executeTakeFirstOrThrow()
        return {
          method: 'POST',
          path: `${path}/approve`,
          headers: network,
          body: {
            contentDigest: v.approval.contentDigest,
            options: s?.options ?? [],
            totalCents: s?.totalCents ?? v.totalCents,
            depositCents: s?.deposit.amountCents ?? null,
            termsDocumentId: terms.value.documentId,
            termsSha256: terms.value.contentSha256,
            acceptTerms: true,
            fullName: name.full_name,
          },
        }
      },
    })
  }

  // Schedule: Office plans a work visit for a paid job without one, on a day after the dataset's bookings, and
  // confirms it with a worker (the visit gates, capacity and reservation checks run in the confirmation).
  const bookedJobs = new Set(data.visits.map((v) => v.jobId))
  const paid = await env.db
    .selectFrom('finance.payments')
    .select(['job_id', 'project_id'])
    .distinct()
    .orderBy('job_id')
    .execute()
  const schedulable = paid.filter((j) => !bookedJobs.has(j.job_id)).slice(0, MAX_SCHEDULED)
  // Staff's property checks come before planning (time zone, county, site contact, coverage), outside the timing.
  const kit = freshDataKit({
    db: env.db,
    routes: env.routes,
    owner: { actor: env.owner, authenticatedAt: new Date() },
    codeKey: env.codeKey,
    requestId: 'perf-load-setup',
    runId: randomUUID(),
  })
  for (const [k, j] of schedulable.entries())
    await runWithContext({ requestId: `perf-load-setup-${k}` }, () =>
      withTx(env.db, (tx) => kit.propertyChecked(tx, j.project_id, zone.value.zone)),
    )
  const lastDay = data.visits.reduce((d, v) => (v.localDate > d ? v.localDate : d), addLocalDays(today, 2))
  const office = (byRole('office')[0] ?? byRole('owner')[0]) as StaffSession
  const workers = byRole('worker')
  const schedule: Op[] = schedulable.flatMap((j, k): Op[] => {
    const start = 9 + (Math.floor(k / workers.length) % 3) * 3
    const worker = pick(workers, k)
    return [
      {
        id: 'plan_visit',
        group: 'core_write',
        as: office,
        build: () => ({
          method: 'POST',
          path: `/api/v1/staff/projects/${j.project_id}/visits`,
          body: {
            purpose: 'service',
            localDate: addLocalDays(lastDay, 1 + Math.floor(k / (workers.length * 3))),
            windowStart: `${String(start).padStart(2, '0')}:00`,
            windowEnd: `${String(start + 2).padStart(2, '0')}:00`,
            expectedDurationMinutes: 60,
            requiredWorkers: 1,
          },
        }),
      },
      {
        id: 'confirm_visit',
        group: 'core_write',
        as: office,
        build: async () => {
          const visit = await env.db
            .selectFrom('work.visits')
            .select(['id', 'version'])
            .where('project_id', '=', j.project_id)
            .orderBy('created_at', 'desc')
            .executeTakeFirst()
          // A plan that was refused leaves nothing to confirm: the confirmation is then refused too (and counted).
          return {
            method: 'POST',
            path: `/api/v1/staff/visits/${visit?.id ?? randomUUID()}/confirm`,
            body: { workerIds: [worker.id], reason: 'TEST DATA (fictional): performance measurement appointment.' },
            headers: { 'if-match': `"${visit?.version ?? 1}"` },
          }
        },
      },
    ]
  })

  // Start: an assigned worker presses Start Work on a booked visit. The dataset's visits are on future days, so
  // the gate refuses (the measured path is the full evaluation under the row locks and its recorded refusal).
  const starts: Op[] = data.visits.map((v) => {
    const s = env.staff.find((x) => x.id === v.workerId) as StaffSession
    return {
      id: 'start_work_attempt',
      group: 'core_write',
      as: s,
      expect: [409, 422, 403],
      build: async () => {
        const packet = await fetch(`${env.origin}/api/v1/staff/jobs/${v.jobId}/packet`, {
          headers: { cookie: s.cookie },
        })
        const p = (await packet.json()) as { version?: number; packet?: { version?: number } }
        return {
          method: 'POST',
          path: `/api/v1/staff/visits/${v.visitId}/start`,
          body: { packetVersion: p.packet?.version ?? p.version ?? 1 },
        }
      },
    }
  })

  return {
    reads,
    customerReads,
    writes: [[submit], approvals, schedule, starts],
  }
}

/** Plan exports for the Owner (after a fresh sign-in, as the routes require). */
export async function exportOps(env: PerfEnvironment): Promise<Op[]> {
  const owner = await env.freshOwner()
  const zone = (await loadConfig(env.db)).get('business.timezone')
  if (zone.state !== 'CONFIGURED') throw new Error('perf load: business.timezone is NOT CONFIGURED')
  const today = localDateOf(new Date(), zone.value.zone)
  const from = addLocalDays(today, -365)
  const reason = 'TEST DATA (fictional): performance measurement.'
  return [
    {
      id: 'export_dashboard_csv',
      group: 'export',
      as: owner,
      build: () => ({ method: 'POST', path: '/api/v1/staff/dashboard/exports', body: { from, to: today } }),
    },
    ...['invoices', 'payments'].map((dataset): Op => ({
      id: `export_accounting_${dataset}`,
      group: 'export',
      as: owner,
      build: () => ({
        method: 'POST',
        path: '/api/v1/staff/accounting/exports',
        body: { dataset, from, to: today, reason },
      }),
    })),
    {
      id: 'export_visit_timestamps',
      group: 'export',
      as: owner,
      build: () => ({
        method: 'POST',
        path: '/api/v1/staff/timestamps/exports',
        body: { from, to: today, reason },
      }),
    },
  ]
}

export type LoadResult = { samples: Sample[]; seconds: number }

/** Concurrent clients, each sending its own operations one after another (closed loop). */
export async function runClients(env: PerfEnvironment, clients: readonly (readonly Op[])[]): Promise<LoadResult> {
  const started = performance.now()
  const samples: Sample[] = []
  await Promise.all(
    clients.map(async (ops) => {
      for (const op of ops) samples.push(await send(env, op))
    }),
  )
  return { samples, seconds: (performance.now() - started) / 1000 }
}

const repeat = <T>(xs: readonly T[], rounds: number): T[] => Array.from({ length: rounds }, () => xs).flat()

export type Phases = {
  /** A: the 20 staff users read, each its role's list `rounds` times. */
  staffReads: Op[][]
  /** B: core writes (four lanes: submission, acceptance, schedule, start) while the other 16 staff users read. */
  writesUnderLoad: Op[][]
  /** C: 20 customers read their project overview. */
  customers: Op[][]
}

/** PROPOSED (OQ-PERF-BUDGET-DETAILS): the phases of one measurement. */
export function phases(plan: LoadPlan, options: { rounds: number; writesPerLane: number }): Phases {
  const users = [...plan.reads.values()]
  const lanes = [
    Array.from({ length: options.writesPerLane }, () => plan.writes[0]?.[0] as Op),
    ...plan.writes.slice(1).map((lane) => lane.slice(0, options.writesPerLane)),
  ].filter((lane) => lane.length > 0 && lane[0] !== undefined)
  // The write lanes are people too: the busiest readers (Owner and Office first) stay, so 20 stay active in all.
  const readers = users.slice(0, Math.max(0, users.length - lanes.length))
  return {
    staffReads: users.map((ops) => repeat(ops, options.rounds)),
    writesUnderLoad: [...lanes, ...readers.map((ops) => repeat(ops, options.rounds))],
    customers: Array.from({ length: Math.min(20, plan.customerReads.length) }, (_, u) =>
      Array.from(
        { length: options.rounds * 3 },
        (_, r) => plan.customerReads[(u + r) % plan.customerReads.length] as Op,
      ),
    ),
  }
}

/** Each read once, alone, counting the statements the server ran for it (after the same request as warm-up). */
export async function countQueries(env: PerfEnvironment, ops: readonly Op[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  for (const op of ops) {
    if (out.has(op.id) || op.group === 'core_write') continue
    // The same request twice: the first brings anything it generates on first read up to date (a job packet).
    const req = await op.build()
    await send(env, op, req)
    const before = env.queries.count
    await send(env, op, req)
    out.set(op.id, env.queries.count - before)
  }
  return out
}

export function summarize(samples: readonly Sample[], queries: Map<string, number> = new Map()): OpSummary[] {
  const byOp = new Map<string, Sample[]>()
  for (const s of samples) byOp.set(s.op, [...(byOp.get(s.op) ?? []), s])
  return [...byOp.entries()]
    .map(([op, xs]) => {
      const ms = xs.map((x) => x.ms)
      const statuses: Record<string, number> = {}
      for (const x of xs) statuses[x.status] = (statuses[x.status] ?? 0) + 1
      return {
        op,
        group: (xs[0] as Sample).group,
        n: xs.length,
        p50: percentile(ms, 50),
        p95: percentile(ms, 95),
        max: percentile(ms, 100),
        errors: xs.filter((x) => !x.ok).length,
        statuses,
        queries: queries.get(op) ?? null,
      }
    })
    .sort((a, b) => a.group.localeCompare(b.group) || a.op.localeCompare(b.op))
}

/** The p95 of every sample of a group together (the budget's unit in HH-NFR-01). */
export function groupP95(samples: readonly Sample[], group: Group): { n: number; p95: number } {
  const ms = samples.filter((s) => s.group === group).map((s) => s.ms)
  return { n: ms.length, p95: percentile(ms, 95) }
}
