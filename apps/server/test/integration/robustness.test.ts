// Cross-cutting robustness suite against PostgreSQL 16 (TSK-0107; HH-TEST-03, HH-DATA-04, HH-AUTO-02, HH-ARC-09,
// HH-NFR-03, T11, T12, T65, T67, FACT-AUTOMATIC-MESSAGES, RULE-HUMAN-REVIEW, RULE-SAFETY-GATES). Staff, customers,
// addresses and amounts are synthetic (RULE-SYNTHETIC-DATA); the estimate terms version recorded below is a fixture of
// this throwaway database only. Nothing reaches a provider: the senders are the in-memory fakes.
// - Interruptions are injected inside the database, so the real write path is what fails: a trigger on the outbox
//   (the last write of a business transaction, HH-ARC-08) raises for one event type, or holds the transaction open
//   until the test ends its server process (pg_terminate_backend, as a PostgreSQL restart does) or lets it go.
// - Races: concurrent writes on one record under different keys; the database decides which one wins.
// - The automations run over a whole fictional business, built by the staging fresh test data (TSK-0141) through the
//   server's own routes: requests, a registered customer, a published, an approved and a paid estimate, booked visits
//   and a question. Two workers drain the queue at once. Half of the first attempts "crash" after their effect (the
//   lease is taken away, as if the process died before the commit); half of the messages lose the provider's answer
//   to their first hand-over. Then every email's provider callbacks arrive newest first and repeated, and the queue
//   is drained again. Finally every event is dispatched again and every finished job is run a second time.
// - The tests' own instants are fixed; the assertions compare records with records, never with the hour or weekday
//   the suite runs (the fresh test data books its visits from today, as it does on staging).
import { createHash, randomUUID } from 'node:crypto'
import { createDb, loadServiceSeed, loadSopSeed, syncServices, syncSops, withTx, type Db } from '@handyhub/db'
import { createTestDatabase, type TestDatabase } from '@handyhub/db/testing'
import { ESTIMATE_TERMS, PRIVACY_NOTICE, SMS_DISCLOSURE } from '@handyhub/domain/legal'
import type { StaffActor } from '@handyhub/policy'
import type { FastifyInstance } from 'fastify'
import { sql } from 'kysely'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildApp } from '../../src/app.js'
import { buildAutomations } from '../../src/automations.js'
import { setWorkingHours } from '../../src/modules/capacity/availability.js'
import { createStaffUser, setPasswordHash } from '../../src/modules/identity/accounts.js'
import { codeDeliveryAutomation, readCodeKey, type CodeKeySettings } from '../../src/modules/identity/index.js'
import { hashPassword } from '../../src/modules/identity/passwords.js'
import { apiModules } from '../../src/modules/index.js'
import { recordConsent } from '../../src/modules/notifications/consent.js'
import { createFreshTestData } from '../../src/modules/staging/fresh-data.js'
import { createAutomationRegistry, type Automation } from '../../src/platform/automation.js'
import { recordPolicyVersion } from '../../src/platform/config/index.js'
import { createWorker, type Worker } from '../../src/platform/jobs.js'
import { runWithContext } from '../../src/platform/request-context.js'
import { FakeEmailSender } from '../../src/providers/resend/index.js'
import { FakeSmsSender } from '../../src/providers/bird/index.js'
import { FakeObjectStorage } from '../../src/providers/r2/index.js'
import { recordWebhookReceipt } from '../../src/providers/webhooks.js'
import type { EmailMessage, EmailSender, SendOutcome, SmsMessage, SmsSender } from '../../src/providers/types.js'
import { testConfig } from '../fixtures/env.js'
import { signInWithMfa, TEST_MFA_KEY } from '../fixtures/staff-mfa.js'

const SITE = 'https://site.example.test'
const STAFF = 'https://staff.example.test'
const APP = 'handyapp-tsk0107-robustness'
const KEY: CodeKeySettings = readCodeKey({
  HANDYHUB_ENV: 'ci',
  CODE_HASH_KEY: ['synthetic', 'robustness', 'code', 'key', 'for', 'tests', 'only', '0107'].join('-'),
})
const pw = ['synthetic', 'robustness', 'passphrase', '107'].join(' ')
/** Every weekday 08:00-20:00: a synthetic fixture, never the business's hours. */
const WEEK = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, start: '08:00', end: '20:00' }))

let t: TestDatabase
let wide: Db
let app: FastifyInstance
const ids = { owner: '', ann: '' }
const owner = { cookie: '', csrf: '' }

let seq = 0
const key = (what: string) => `synthetic-${what}-${String(++seq).padStart(6, '0')}-${randomUUID()}`
let ip = 20
const nextIp = () => `198.51.100.${++ip}`

beforeAll(async () => {
  t = await createTestDatabase()
  // Wide enough for every concurrent request and both workers; its server processes are the ones the tests end.
  wide = createDb(t.url, { max: 16, applicationName: APP })
  await syncServices(t.db, loadServiceSeed())
  await syncSops(t.db, loadSopSeed())
  await recordPolicyVersion(t.db, {
    key: 'legal.estimate_terms',
    value: {
      documentId: ESTIMATE_TERMS.documentId,
      status: 'approved',
      attorneyReviewed: true,
      preparedOn: ESTIMATE_TERMS.preparedOn,
      contentSha256: ESTIMATE_TERMS.contentSha256,
    } as never,
    sourceIds: ['TEST-SYNTHETIC'],
    changedBy: 'test',
    reason: 'synthetic test configuration',
  })
  app = await buildApp({
    config: testConfig({ TRUST_PROXY_HOPS: '1' }),
    api: { db: wide, codeKey: KEY, storage: new FakeObjectStorage() },
  })
  const hash = await hashPassword(pw)
  await withTx(t.db, async (tx) => {
    for (const [p, role] of [
      ['owner', 'owner'],
      ['ann', 'worker'],
    ] as const) {
      const user = await createStaffUser(tx, {
        email: `${p}-robust@example.test`,
        displayName: `Synthetic ${p}`,
        locale: 'en',
        role,
        issuedBy: 'test',
      })
      await setPasswordHash(tx, user.id, hash)
      ids[p] = user.id
    }
    await setWorkingHours(tx, ids.owner, ids.ann, { periods: WEEK }, { expectedVersion: 0, now: new Date() })
  })
  const res = await signInWithMfa(app, {
    method: 'POST',
    url: '/api/v1/staff/auth/sign-in',
    headers: { 'x-forwarded-for': '198.51.100.107' },
    payload: { email: 'owner-robust@example.test', password: pw },
  })
  expect(res.statusCode, res.body).toBe(200)
  owner.cookie = String(res.headers['set-cookie']).split(';')[0] as string
  const session = await app.inject({
    method: 'GET',
    url: '/api/v1/staff/auth/session',
    headers: { cookie: owner.cookie },
  })
  owner.csrf = session.json<{ csrfToken: string }>().csrfToken
  // The fault injection (this throwaway database only, in its public schema, which the fingerprint leaves out).
  await sql
    .raw(
      `CREATE TABLE public.robustness_faults (event_type text PRIMARY KEY, mode text NOT NULL CHECK (mode IN ('fail', 'hang')));
      CREATE FUNCTION public.robustness_fault() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        m text;
        deadline timestamptz := clock_timestamp() + interval '20 seconds';
      BEGIN
        SELECT mode INTO m FROM public.robustness_faults WHERE event_type = NEW.type;
        IF m = 'fail' THEN
          RAISE EXCEPTION 'synthetic fault at the last write of the transaction (TSK-0107)';
        END IF;
        WHILE m = 'hang' AND clock_timestamp() < deadline LOOP
          PERFORM pg_sleep(0.05);
          SELECT mode INTO m FROM public.robustness_faults WHERE event_type = NEW.type;
        END LOOP;
        RETURN NEW;
      END $$;
      CREATE TRIGGER robustness_fault BEFORE INSERT ON platform.outbox_events
        FOR EACH ROW EXECUTE FUNCTION public.robustness_fault();
      CREATE FUNCTION public.robustness_fingerprint() RETURNS TABLE (name text, f text) LANGUAGE plpgsql AS $$
      DECLARE r record;
      BEGIN
        FOR r IN SELECT table_schema AS s, table_name AS n FROM information_schema.tables
          WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema', 'public')
          ORDER BY 1, 2 LOOP
          name := r.s || '.' || r.n;
          EXECUTE format('SELECT md5(coalesce(string_agg(h, '','' ORDER BY h), '''')) FROM (SELECT md5(x::text) AS h FROM %I.%I x) q', r.s, r.n) INTO f;
          RETURN NEXT;
        END LOOP;
      END $$;`,
    )
    .execute(t.db)
}, 60_000)

afterEach(async () => {
  await sql`DELETE FROM public.robustness_faults`.execute(t.db)
})

afterAll(async () => {
  await app?.close()
  await wide?.destroy()
  await t?.drop()
})

/** Every table's content as one digest per table (the public schema of the fault injection left out). */
async function fingerprint(): Promise<Map<string, string>> {
  const { rows } = await sql<{ name: string; f: string }>`SELECT name, f FROM public.robustness_fingerprint()`.execute(
    t.db,
  )
  return new Map(rows.map((r) => [r.name, r.f]))
}
const changedTables = (a: Map<string, string>, b: Map<string, string>) =>
  [...new Set([...a.keys(), ...b.keys()])].filter((k) => a.get(k) !== b.get(k)).sort()

const fault = (eventType: string, mode: 'fail' | 'hang') =>
  sql`INSERT INTO public.robustness_faults VALUES (${eventType}, ${mode})`.execute(t.db)
const release = () => sql`DELETE FROM public.robustness_faults`.execute(t.db)

/** The server processes of this suite's pool that wait inside the hang fault. */
async function hanging(): Promise<number[]> {
  const { rows } = await sql<{ pid: number }>`SELECT pid FROM pg_stat_activity
    WHERE datname = ${t.name} AND application_name = ${APP} AND wait_event = 'PgSleep'`.execute(t.db)
  return rows.map((r) => r.pid)
}

/** Ends server processes as a PostgreSQL restart does, from a connection of its own. */
async function terminate(pids: number[]) {
  const admin = new pg.Client({ connectionString: t.url, application_name: 'handyapp-tsk0107-admin' })
  await admin.connect()
  try {
    for (const pid of pids) await admin.query('SELECT pg_terminate_backend($1, 5000)', [pid])
  } finally {
    await admin.end()
  }
}

function requestBody(n: string, over: Record<string, unknown> = {}) {
  return {
    formVersion: 'test-1',
    privacyNoticeVersion: PRIVACY_NOTICE.documentId,
    services: [{ serviceId: 'SVC-PT-01' }],
    notSure: false,
    description: `Synthetic robustness request ${n}.`,
    answers: [],
    property: { street: `${n} Synthetic Way`, city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
    timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
    estimatePreference: 'online',
    contact: {
      fullName: `Synthetic Robust ${n}`,
      email: `robust-${n}@example.test`,
      phone: '(502) 555-0107',
      preferredChannel: 'email',
    },
    smsOptIn: false,
    marketingOptIn: false,
    ...over,
  }
}
const submit = (payload: unknown, k: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/public/requests',
    headers: { 'idempotency-key': k, 'x-forwarded-for': nextIp() },
    payload: payload as Record<string, unknown>,
  })
/** The Owner publishes a question on a request, at the version the Owner saw. */
const publishQuestion = (requestId: string, version: number, k: string, text = 'Synthetic: which wall is it?') =>
  app.inject({
    method: 'POST',
    url: `/api/v1/staff/requests/${requestId}/questions`,
    payload: { text, kind: 'general', noHazardInspection: true },
    headers: { cookie: owner.cookie, 'x-csrf-token': owner.csrf, 'idempotency-key': k, 'if-match': `"${version}"` },
  })
const requestsFor = async (n: string) =>
  t.db
    .selectFrom('intake.requests as r')
    .innerJoin('crm.contacts as c', 'c.id', 'r.contact_id')
    .select(['r.id', 'r.reference', 'r.state_version'])
    .where('c.email', '=', `robust-${n}@example.test`)
    .execute()
const eventsOf = async (aggregateId: string) =>
  t.db.selectFrom('platform.outbox_events').select('type').where('aggregate_id', '=', aggregateId).execute()
type ErrorBody = { error: { code: string; retryable: boolean } }

/**
 * Tables a failed write may still change, each written in a transaction of its own by design: the per-network rate
 * counter of the public submission (counted before the write, so a burst of failures is limited too).
 */
const OUTSIDE_THE_WRITE = ['platform.rate_counters']

// --- A transaction failing half-way ---------------------------------------------------------------------------------

describe('[HH-DATA-04][HH-TEST-03] a write that fails half-way leaves nothing behind; the retry under its key succeeds once', () => {
  it('[T11][HH-INT-10] a request submission failing at its outbox write: a retryable error, no request, no receipt', async () => {
    const n = 'half-way'
    const k = key('submit')
    await fault('request.submitted', 'fail')
    const before = await fingerprint()
    const failed = await submit(requestBody(n), k)
    expect(failed.statusCode, failed.body).toBe(500)
    expect(failed.json<ErrorBody>().error).toMatchObject({ code: 'INTERNAL', retryable: true })
    for (const table of changedTables(before, await fingerprint())) expect(OUTSIDE_THE_WRITE).toContain(table)
    expect(await requestsFor(n)).toEqual([])
    // The cause is gone: the browser's retry under the same key creates the one request, and a further retry
    // returns that same answer.
    await release()
    const created = await submit(requestBody(n), k)
    expect(created.statusCode, created.body).toBe(201)
    const replayed = await submit(requestBody(n), k)
    expect(replayed.statusCode).toBe(201)
    expect(replayed.headers['idempotent-replayed']).toBe('true')
    expect(replayed.json()).toEqual(created.json())
    const [r] = await requestsFor(n)
    expect(r?.reference).toBe(created.json<{ reference: string }>().reference)
    expect((await eventsOf(r?.id as string)).filter((e) => e.type === 'request.submitted')).toHaveLength(1)
  })

  it('[HH-DATA-04] a staff write failing at its outbox write changes nothing; the retry publishes one question', async () => {
    const n = 'staff-half-way'
    expect((await submit(requestBody(n), key('submit'))).statusCode).toBe(201)
    const [r] = await requestsFor(n)
    const publish = (k: string) => publishQuestion(r?.id as string, r?.state_version as number, k)
    const k = key('publish')
    await fault('question.published', 'fail')
    const before = await fingerprint()
    const failed = await publish(k)
    expect(failed.statusCode, failed.body).toBe(500)
    expect(failed.json<ErrorBody>().error).toMatchObject({ code: 'INTERNAL', retryable: true })
    expect(changedTables(before, await fingerprint())).toEqual([])
    await release()
    const done = await publish(k)
    expect([200, 201], done.body).toContain(done.statusCode)
    const again = await publish(k)
    expect(again.statusCode).toBe(done.statusCode)
    expect(again.headers['idempotent-replayed']).toBe('true')
    const questions = await t.db
      .selectFrom('intake.questions')
      .select('id')
      .where('request_id', '=', r?.id as string)
      .execute()
    expect(questions).toHaveLength(1)
  })
})

// --- Interruptions ----------------------------------------------------------------------------------------------------

describe('[HH-NFR-03][HH-DATA-04][HH-TEST-03] interruptions: a lost connection and a client retry while the first write runs', () => {
  it('the database connection ends mid-write (a restart): a retryable error, nothing written, the server keeps serving', async () => {
    const n = 'connection-lost'
    const k = key('submit')
    await fault('request.submitted', 'hang')
    const before = await fingerprint()
    const pending = submit(requestBody(n), k)
    await expect.poll(hanging, { timeout: 10_000 }).toHaveLength(1)
    await terminate(await hanging())
    const failed = await pending
    expect(failed.statusCode, failed.body).toBe(500)
    expect(failed.json<ErrorBody>().error).toMatchObject({ code: 'INTERNAL', retryable: true })
    for (const table of changedTables(before, await fingerprint())) expect(OUTSIDE_THE_WRITE).toContain(table)
    expect(await requestsFor(n)).toEqual([])
    await release()
    // The same pool serves the next requests from new connections; the retry under the key creates one request.
    const created = await submit(requestBody(n), k)
    expect(created.statusCode, created.body).toBe(201)
    expect(await requestsFor(n)).toHaveLength(1)
  })

  it('[T11] a client that timed out retries while the first write still runs: one request, the same answer twice', async () => {
    const n = 'timed-out'
    const k = key('submit')
    await fault('request.submitted', 'hang')
    const first = submit(requestBody(n), k)
    await expect.poll(hanging, { timeout: 10_000 }).toHaveLength(1)
    // The retry waits for the first write under the key's lock; a changed body under the key is refused.
    const retry = submit(requestBody(n), k)
    const changed = submit(requestBody(n, { description: 'Synthetic: a different body.' }), k)
    await new Promise((r) => setTimeout(r, 200))
    expect(await requestsFor(n)).toEqual([])
    await release()
    const [a, b, c] = await Promise.all([first, retry, changed])
    expect(a.statusCode, a.body).toBe(201)
    expect(b.statusCode, b.body).toBe(201)
    expect(b.headers['idempotent-replayed']).toBe('true')
    expect(b.json()).toEqual(a.json())
    expect(c.statusCode, c.body).toBe(409)
    expect(c.json<ErrorBody>().error.code).toBe('IDEMPOTENCY_CONFLICT')
    const rows = await requestsFor(n)
    expect(rows).toHaveLength(1)
    expect((await eventsOf(rows[0]?.id as string)).filter((e) => e.type === 'request.submitted')).toHaveLength(1)
  })
})

// --- Races on one record ------------------------------------------------------------------------------------------

describe('[HH-DATA-04][HH-API-04][HH-TEST-03] races on one record: one write wins, every other answer is a correct refusal', () => {
  it('four staff writes on the same request version at once: one question; the others are refused, never a 500', async () => {
    const n = 'race'
    expect((await submit(requestBody(n), key('submit'))).statusCode).toBe(201)
    const [r] = await requestsFor(n)
    const results = await Promise.all(
      [1, 2, 3, 4].map((i) =>
        publishQuestion(r?.id as string, r?.state_version as number, key('race'), `Synthetic: question ${i}?`),
      ),
    )
    // Which write wins is the database's choice; the others were made against a version that no longer exists.
    const won = results.filter((x) => x.statusCode === 201)
    expect(won).toHaveLength(1)
    for (const x of results.filter((y) => y.statusCode !== 201)) {
      expect(x.statusCode, x.body).toBe(409)
      expect(['STALE_VERSION', 'CONFLICT']).toContain(x.json<ErrorBody>().error.code)
    }
    const questions = await t.db
      .selectFrom('intake.questions')
      .select('id')
      .where('request_id', '=', r?.id as string)
      .execute()
    expect(questions.map((q) => q.id)).toEqual([won[0]?.json<{ questionId: string }>().questionId])
    const events = await t.db
      .selectFrom('platform.outbox_events')
      .select('id')
      .where('type', '=', 'question.published')
      .where('aggregate_id', '=', questions[0]?.id as string)
      .execute()
    expect(events).toHaveLength(1)
  })
})

// --- Automations --------------------------------------------------------------------------------------------------

/**
 * Tables the automations may write (their declared effects, HH-AUTO-01): jobs and events, the audit trail, message
 * deliveries and their history, staff queue items, issued documents, the final-invoice draft prepared from the
 * approved scope, records of what a message did (response clocks, question notices) and staff-review suggestions.
 */
const AUTOMATION_EFFECTS = [
  'crm.candidate_match_events',
  'crm.candidate_matches',
  'estimating.approval_receipts',
  'finance.invoice_deposit_credits',
  'finance.invoice_lines',
  'finance.invoices',
  'intake.questions',
  'intake.response_clocks',
  'intake.response_events',
  'ops.queue_items',
  'platform.audit_events',
  'platform.jobs',
  'platform.message_deliveries',
  'platform.message_delivery_attempts',
  'platform.message_delivery_events',
  'platform.outbox_events',
  // The provider callbacks of this test are stored as the webhook route stores them; notify.provider_events marks
  // each one processed or ignored.
  'platform.webhook_receipts',
]

/**
 * What only people decide (HH-AUTO-02, RULE-HUMAN-REVIEW, RULE-SAFETY-GATES): approvals and prices, scope and change
 * decisions, capacity (visits, windows, reservations), holds, starts and exceptions, payments, allocations, refunds,
 * waivers and voids, cases, consent, deletions and retention decisions. No automation writes any of them.
 */
const PEOPLE_DECIDE = [
  'estimating.approval_selections',
  'estimating.approvals',
  'estimating.discount_requests',
  'estimating.estimate_lines',
  'estimating.estimate_versions',
  'estimating.publication_approvals',
  'finance.deposit_requirements',
  'finance.deposit_waivers',
  'finance.invoice_voids',
  'finance.payment_adjustments',
  'finance.payment_allocations',
  'finance.payments',
  'finance.refunds',
  'platform.consent_records',
  'privacy.deletions',
  'privacy.retention_decisions',
  'quality.cases',
  'quality.return_work',
  'work.change_order_decisions',
  'work.change_order_versions',
  'work.gate_exceptions',
  'work.hazard_inspection_holds',
  'work.holds',
  'work.job_completions',
  'work.job_packet_acknowledgments',
  'work.jobs',
  'work.reservations',
  'work.scheduling_tasks',
  'work.visits',
  'work.window_offers',
  'work.work_resumptions',
  'work.work_starts',
]

/** Half of the messages, by their key: the provider takes the first hand-over, and its answer is lost. */
const answerLost = (idempotencyKey: string) =>
  parseInt(createHash('sha256').update(idempotencyKey).digest('hex').slice(-1), 16) % 2 === 1

/** A sender that hands every message to the fake, and loses the answer to the first hand-over of half of the keys. */
class LostFirstAnswer<M extends { idempotencyKey: string }> {
  readonly provider = 'fake' as const
  readonly #seen = new Set<string>()
  constructor(readonly inner: { send(m: M): Promise<SendOutcome> }) {}
  async send(message: M): Promise<SendOutcome> {
    const out = await this.inner.send(message)
    if (!answerLost(message.idempotencyKey) || this.#seen.has(message.idempotencyKey)) return out
    this.#seen.add(message.idempotencyKey)
    return { outcome: 'outcome_unknown', errorCode: 'synthetic_answer_lost' }
  }
}

describe('[HH-AUTO-02][HH-ARC-09][HH-TEST-03] every automation over a whole business: crashes, lost answers, two workers, run twice', () => {
  const email = new FakeEmailSender()
  const sms = new FakeSmsSender()
  const emailSender = new LostFirstAnswer<EmailMessage>(email) satisfies EmailSender
  const smsSender = new LostFirstAnswer<SmsMessage>(sms) satisfies SmsSender
  let automations: Automation[] = []
  let workers: Worker[] = []
  let before = new Map<string, string>()
  let stopped = ''
  const crashed = new Set<string>()
  const calledBack = new Set<string>()

  /** Both workers tick together until nothing is runnable; retries are due at once (their back-off is not waited). */
  async function drain() {
    for (let round = 0; round < 80; round++) {
      const ticks = await Promise.all(workers.map((w) => w.runOnce()))
      await sql`UPDATE platform.jobs SET run_at = now() WHERE state = 'queued' AND attempts > 0 AND run_at > now()`.execute(
        t.db,
      )
      const busy = ticks.some((r) => Object.values(r).some((v) => v > 0))
      const { rows } = await sql<{ n: number }>`SELECT count(*)::int AS n FROM platform.jobs
        WHERE (state = 'queued' AND run_at <= now()) OR state = 'running'`.execute(t.db)
      if (!busy && rows[0]?.n === 0) return round
    }
    throw new Error('the queue did not settle')
  }

  beforeAll(async () => {
    const modules = apiModules({
      secureCookies: false,
      mfaKey: TEST_MFA_KEY,
      codeKey: KEY,
      trustProxyHops: 1,
      environment: 'ci',
      storage: new FakeObjectStorage(),
    })
    const actor: StaffActor = {
      kind: 'staff',
      userId: ids.owner,
      roles: ['owner'],
      capabilities: [],
      status: 'active',
      freshAuth: true,
    }
    // As the staging reset runs it: inside a request, whose ID correlates every event it writes.
    const requestId = 'synthetic-tsk0107-world'
    const outcomes = await runWithContext({ requestId }, () =>
      createFreshTestData({
        db: t.db,
        routes: modules.flatMap((m) => m.routes),
        owner: { actor, authenticatedAt: new Date() },
        codeKey: KEY,
        requestId,
        runId: randomUUID(),
      }),
    )
    const created = outcomes.filter((o) => o.state === 'created').map((o) => o.id)
    expect(created, JSON.stringify(outcomes)).toEqual([
      'guest_customer_request',
      'registered_customer',
      'estimate_awaiting_approval',
      'estimate_visit',
      'approved_estimate',
      'test_payment',
      'confirmed_work_visit',
      'customer_conversation',
    ])
    // A customer who opted in to texts and sent STOP before any message went out: consent is checked at send time.
    const stop = requestBody('stopped', {
      contact: {
        fullName: 'Synthetic Robust stopped',
        email: 'robust-stopped@example.test',
        phone: '(502) 555-0199',
        preferredChannel: 'text',
      },
      smsOptIn: true,
      smsDisclosureVersion: SMS_DISCLOSURE.documentId,
    })
    expect((await submit(stop, key('submit'))).statusCode).toBe(201)
    const [asked] = await requestsFor('stopped')
    // Staff ask them a question: its notice has an owner-worded text (FACT-AUTOMATIC-MESSAGES #4).
    const question = await publishQuestion(asked?.id as string, asked?.state_version as number, key('publish'))
    expect([200, 201], question.body).toContain(question.statusCode)
    stopped = '+15025550199'
    await withTx(t.db, (tx) =>
      recordConsent(tx, {
        purpose: 'transactional_sms',
        channel: 'sms',
        destination: stopped,
        granted: false,
        source: 'sms_keyword',
        recordedBy: 'system:synthetic-test',
      }),
    )
    const declared = [
      ...buildAutomations({
        providers: { email: emailSender, sms: smsSender, storage: new FakeObjectStorage() },
        staffAppUrl: STAFF,
        codeKey: KEY,
        publicSiteUrl: SITE,
      }),
      codeDeliveryAutomation({ providers: { email: emailSender, sms: smsSender }, codeKey: KEY }),
    ]
    automations = declared
    // A crash after the effect and before the commit: half of the first attempts lose their lease from outside, as a
    // worker that died would; the transaction then rolls back and the sweep gives the job to a worker again.
    const crashing = declared.map((a) => ({
      ...a,
      handle: async (ctx: Parameters<Automation['handle']>[0]) => {
        const out = await a.handle(ctx)
        if (ctx.job.attempt === 1 && parseInt(ctx.job.id.slice(-1), 16) % 2 === 0 && !crashed.has(ctx.job.id)) {
          crashed.add(ctx.job.id)
          await sql`UPDATE platform.jobs SET locked_by = 'synthetic-crashed-worker', locked_until = now() - interval '1 second'
            WHERE id = ${ctx.job.id}`.execute(wide)
        }
        return out
      },
    }))
    const registry = createAutomationRegistry(crashing)
    workers = ['a', 'b'].map((w) => createWorker({ db: wide, registry, workerId: `synthetic-worker-${w}` }))
    before = await fingerprint()
    await drain()
    // Resend's callbacks for every accepted email, newest first and each twice (a webhook delivered again): delivered,
    // then the older sent. A delivery's success starts what follows it (reminders, the response clock), so drain again.
    for (const m of email.sent) {
      calledBack.add(m.providerMessageId)
      for (const [type, at] of [
        ['email.delivered', '2026-10-20T12:00:05Z'],
        ['email.sent', '2026-10-20T12:00:02Z'],
        ['email.delivered', '2026-10-20T12:00:05Z'],
      ] as const) {
        const payload = { type, data: { email_id: m.providerMessageId } }
        await runWithContext({ requestId: `synthetic-webhook-${m.providerMessageId}` }, () =>
          withTx(t.db, (tx) =>
            recordWebhookReceipt(tx, {
              provider: 'resend',
              deliveryId: `${m.providerMessageId}:${type}`,
              eventType: type,
              providerMessageId: m.providerMessageId,
              eventOccurredAt: new Date(at),
              payload,
              rawBody: Buffer.from(JSON.stringify(payload)),
            }),
          ),
        )
      }
    }
    await drain()
  }, 120_000)

  it('[HH-ARC-09] the queue settles: every job succeeded or was cancelled, none failed or left running', async () => {
    const jobs = await t.db
      .selectFrom('platform.jobs')
      .select(['automation', 'state', 'last_error_class', 'interrupted'])
      .where('run_at', '<=', new Date())
      .execute()
    const bad = jobs.filter((j) => !['succeeded', 'cancelled'].includes(j.state))
    expect(bad, JSON.stringify(bad)).toEqual([])
    expect(jobs.length).toBeGreaterThan(20)
    // Both kinds of interruption happened, and every job they hit finished once.
    expect(crashed.size).toBeGreaterThan(0)
    expect(email.calls.length).toBeGreaterThan(email.sent.length)
  })

  it('[HH-AUTO-02][RULE-HUMAN-REVIEW] the automations wrote only their declared effects, never a decision people make', async () => {
    expect(PEOPLE_DECIDE.filter((x) => AUTOMATION_EFFECTS.includes(x))).toEqual([])
    const after = await fingerprint()
    for (const table of [...PEOPLE_DECIDE, ...AUTOMATION_EFFECTS]) expect(after.has(table), table).toBe(true)
    const changed = changedTables(before, after)
    expect(changed.filter((x) => !AUTOMATION_EFFECTS.includes(x))).toEqual([])
    // The final-invoice draft is only a draft: issuing it stays with staff after the Owner's quality review.
    const invoices = await t.db.selectFrom('finance.invoices').select('state').execute()
    expect(invoices.filter((i) => i.state !== 'draft')).toEqual([])
  })

  it('[HH-COM-02][T65] each message was handed over under one key and accepted once, however often it was retried', async () => {
    const accepted = await t.db
      .selectFrom('platform.message_deliveries')
      .select(['channel', 'provider_message_id', 'state'])
      .where('provider_message_id', 'is not', null)
      .execute()
    const sent = [...email.sent, ...sms.sent]
    expect(sent.length).toBeGreaterThan(5)
    expect(accepted.map((d) => d.provider_message_id).sort()).toEqual(sent.map((m) => m.providerMessageId).sort())
    // A lost answer is retried under the same key; a crash after the provider took a message hands it over again
    // under the same key. Either way the provider holds one message.
    const handovers = (k: string) => [...email.calls, ...sms.calls].filter((c) => c.idempotencyKey === k).length
    for (const m of sent.filter((x) => answerLost(x.idempotencyKey)))
      expect(handovers(m.idempotencyKey)).toBeGreaterThan(1)
    const crashedAfterSend = sent.filter((x) => !answerLost(x.idempotencyKey) && handovers(x.idempotencyKey) > 1)
    expect(crashedAfterSend.length).toBeGreaterThan(0)
  })

  it('[HH-DATA-04][HH-COM-02] provider callbacks out of order and repeated: each delivery shows delivered once', async () => {
    const rows = await t.db
      .selectFrom('platform.message_deliveries')
      .select(['id', 'state', 'provider_message_id'])
      .where('provider_message_id', 'in', [...calledBack])
      .execute()
    expect(rows).toHaveLength(calledBack.size)
    for (const d of rows) expect(d.state, d.provider_message_id ?? '').toBe('delivered')
    const events = await t.db
      .selectFrom('platform.message_delivery_events')
      .select(['delivery_id', 'from_state', 'to_state'])
      .where(
        'delivery_id',
        'in',
        rows.map((d) => d.id),
      )
      .execute()
    // The two workers may take the older sent first; either way each delivery steps to delivered once and never
    // back, and the repeated delivered changes nothing.
    expect(events.filter((e) => e.to_state === 'delivered')).toHaveLength(rows.length)
    expect(events.filter((e) => e.from_state === 'delivered')).toEqual([])
    const receipts = await t.db
      .selectFrom('platform.webhook_receipts')
      .select(['state'])
      .where('provider_message_id', 'in', [...calledBack])
      .execute()
    expect(receipts).toHaveLength(calledBack.size * 2)
    expect(receipts.filter((r) => r.state === 'received')).toEqual([])
  })

  it('[T67][HH-COM-05] a STOP recorded after the request was queued blocks its texts at send time', async () => {
    expect(sms.calls.filter((m) => m.to === stopped)).toEqual([])
    const texts = await t.db
      .selectFrom('platform.message_deliveries')
      .select(['message_key', 'state', 'error_code'])
      .where('channel', '=', 'sms')
      .where('destination', '=', stopped)
      .execute()
    // The question notice's text is suppressed by the STOP; a text whose wording is not released yet fails earlier.
    expect(texts.filter((d) => d.message_key === 'question.notice')).toEqual([
      { message_key: 'question.notice', state: 'suppressed', error_code: 'sms_opted_out' },
    ])
    for (const d of texts)
      expect([
        ['suppressed', 'sms_opted_out'],
        ['failed', 'template_not_configured'],
      ]).toContainEqual([d.state, d.error_code])
  })

  it('[HH-ARC-09] every event dispatched again (a dispatcher that died before marking it): no new job, nothing sent', async () => {
    const jobs = await t.db.selectFrom('platform.jobs').select('id').execute()
    const calls = email.calls.length + sms.calls.length
    const settled = await fingerprint()
    await sql`UPDATE platform.outbox_events SET state = 'pending', dispatched_at = NULL WHERE state = 'dispatched'`.execute(
      t.db,
    )
    await drain()
    expect((await t.db.selectFrom('platform.jobs').select('id').execute()).length).toBe(jobs.length)
    expect(email.calls.length + sms.calls.length).toBe(calls)
    expect(changedTables(settled, await fingerprint())).toEqual(['platform.outbox_events'])
  })

  it('[HH-AUTO-01][HH-ARC-09] every finished job run a second time changes nothing and hands nothing new to a provider', async () => {
    const done = await t.db
      .selectFrom('platform.jobs')
      .selectAll()
      .where('state', 'in', ['succeeded', 'cancelled'])
      .orderBy('seq')
      .execute()
    const byName = new Map(automations.map((a) => [a.name, a]))
    const settled = await fingerprint()
    const sent = email.sent.length + sms.sent.length
    const quiet = { info() {}, warn() {}, error() {}, debug() {}, trace() {}, fatal() {}, child: () => quiet }
    const changedBy: string[] = []
    for (const j of done) {
      const a = byName.get(j.automation)
      if (!a) continue
      const job = {
        id: j.id,
        key: j.job_key,
        automation: j.automation,
        attempt: j.attempts + 1,
        maxAttempts: j.max_attempts,
        payload: (j.payload ?? {}) as Record<string, string | number | boolean | null>,
        eventId: j.outbox_event_id,
        eventType: j.event_type,
        target: { type: j.target_type, id: j.target_id },
        requestId: j.request_id,
      }
      const calls = email.calls.length + sms.calls.length
      await runWithContext({ requestId: j.request_id }, () =>
        withTx(wide, (tx) =>
          a.handle({
            tx,
            job,
            idempotencyKey: j.job_key,
            log: quiet as never,
            signal: new AbortController().signal,
          }),
        ),
      )
      if (email.calls.length + sms.calls.length !== calls) changedBy.push(j.automation)
    }
    expect(changedBy).toEqual([])
    expect(email.sent.length + sms.sent.length).toBe(sent)
    expect(changedTables(settled, await fingerprint())).toEqual([])
  }, 60_000)
})
