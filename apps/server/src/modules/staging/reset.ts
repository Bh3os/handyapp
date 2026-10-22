// Reset Test Data (TSK-0141; HH-OPS-05, OWN-DEC-191, RULE-SYNTHETIC-DATA, ENT-OutboxEvent, ENT-Message). What a reset
// removes, what it keeps, the counts the confirmation dialog shows, and the reset transaction itself.
// - One transaction, on the connection that holds the reset lock: it writes the running run (staging.reset_runs; the
//   database refuses it unless the database is positively identified as a test database), names it in
//   handyhub.staging_reset, clears every test-data table with one TRUNCATE (no CASCADE: a kept table that still
//   referenced a cleared one would fail the reset instead of losing rows), removes the customer accounts, contacts
//   and customers that are not kept for a designated reusable test account, schedules the removal of the stored files
//   the cleared rows named and today's retention scan again, checks the outcome, records the audit event and
//   completes the run. Any failure rolls everything back: nothing is half removed, and the failure is recorded as its
//   own run with its own audit event.
// - Pending outbox events, queued jobs (scheduled reminders among them) and message deliveries are cleared in the
//   same transaction, so nothing that was waiting can be sent afterwards; the send-time record checks would refuse
//   it anyway, as its record is gone. Jobs are deleted row by row, not truncated: the stored-file removal
//   (privacy.object_erasure) and retention-scan jobs are kept, pending ones included, and so are the outbox events
//   those jobs name. While a sending job is running (its lease is live) the reset is refused (RESET_SENDS_IN_FLIGHT):
//   the job table is locked first, so no job is leased while the reset runs.
// - Idempotent across a lost reply: the run names the request's idempotency scope, and a retry of a completed run is
//   answered with that run (findCompletedRun) instead of resetting again.
// - Kept: staff accounts, roles and grants, staff sessions, the service catalog and SOP versions, configuration
//   (policy versions), message templates, coverage (ZIP) rules and the ZIP dataset, equipment, working hours and time off, the audit log,
//   schema migrations, rate limits, the staging trail itself and the designated reusable test accounts.
import { withTx, type Db, type Tx } from '@handyhub/db'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import { audit, type AuditActor } from '../../platform/audit.js'
import { scheduleJob } from '../../platform/jobs.js'
import { OBJECT_ERASURE_AUTOMATION, objectErasureAutomation } from '../privacy/log.js'
import { ensureRetentionScan, RETENTION_AUTOMATION } from '../retention/index.js'
import { signInMissing } from '../accounts/accounts.js'
import type { CodeKeySettings } from '../identity/index.js'

/** The words the Owner types to confirm (OWN-DEC-191). */
export const CONFIRMATION_PHRASE = 'RESET TEST DATA'

/** The reset lock (pg advisory lock pair): 141 for this task, 1 for the reset. Held for the reset and the fresh data. */
export const RESET_LOCK = [141, 1] as const

/** What a reset removes, by the category the dialog shows; every cleared table belongs to exactly one category. */
export const CLEARED_CATEGORIES = {
  customers: [
    'crm.customer_notes',
    'crm.record_changes',
    'crm.candidate_matches',
    'crm.candidate_match_events',
    'crm.record_links',
    'platform.consent_records',
  ],
  properties: [
    'crm.properties',
    'crm.customer_properties',
    'crm.property_addresses',
    'crm.property_details',
    'crm.property_changes',
    'crm.access_instruction_secrets',
    'crm.access_code_reveals',
    // TSK-0123 (0066): the zone history of each property; TSK-0127 (0067): staff's address-and-county checks.
    'crm.property_time_zones',
    'crm.property_county_verifications',
  ],
  requests: [
    'crm.projects',
    'intake.requests',
    'intake.request_services',
    'intake.request_answers',
    'intake.request_assignments',
    'intake.request_conversations',
    'intake.request_decisions',
    'intake.request_notes',
    'intake.request_qualifications',
    'intake.response_clocks',
    'intake.response_events',
    'intake.receipt_capabilities',
    'intake.upload_capabilities',
    'intake.questions',
    'intake.question_replies',
  ],
  estimates: [
    'estimating.estimates',
    'estimating.estimate_versions',
    'estimating.estimate_lines',
    'estimating.estimate_line_costs',
    'estimating.estimate_version_internals',
    'estimating.estimate_documents',
    'estimating.customer_responses',
    'estimating.approval_selections',
    'estimating.approvals',
    // TSK-0130 (0068): the Owner's publication approvals of estimate versions.
    'estimating.publication_approvals',
  ],
  appointments: [
    'work.visits',
    'work.visit_windows',
    'work.window_offers',
    'work.window_offer_options',
    'work.visit_change_requests',
    'work.visit_changes',
    'work.reservations',
    'work.reservation_flags',
  ],
  jobs: [
    'work.jobs',
    'work.job_scope_snapshots',
    'work.scheduling_tasks',
    'work.work_packages',
    'work.work_package_sop_pins',
    'work.job_packets',
    'work.job_packet_views',
    'work.job_packet_exports',
    'work.holds',
    'work.work_package_loadouts',
    'work.loadout_checks',
    'work.job_packet_acknowledgments',
    'work.job_packet_acknowledgment_invalidations',
    'work.visit_departures',
    'work.time_stamps',
    'work.time_stamp_corrections',
    // TSK-0073, TSK-0074 (0074): site checks, Start Work evaluations and starts, and the administrative exceptions.
    'work.start_site_checks',
    'work.start_gate_evaluations',
    'work.work_starts',
    'work.gate_exceptions',
    // TSK-0077 (0079): Stop Work, hazard and issue reports, their photos, stabilization records and reviews.
    'work.issue_reports',
    'work.stabilization_records',
    'work.issue_report_reviews',
  ],
  payments: [
    'finance.payments',
    'finance.payment_allocations',
    'finance.deposit_requirements',
    'finance.deposit_waivers',
    'estimating.approval_receipts',
  ],
  conversations: [
    'comms.conversations',
    'comms.messages',
    'comms.message_links',
    'comms.project_reply_tokens',
    'platform.webhook_receipts',
  ],
  // TSK-0119 (0065): every provider attempt of a delivery.
  notifications: [
    'platform.message_deliveries',
    'platform.message_delivery_events',
    'platform.message_delivery_attempts',
  ],
  // TSK-0077 (0079): the photos of Stop Work, hazard and issue reports.
  attachments: ['intake.photos', 'intake.question_reply_photos', 'work.before_photos', 'work.issue_report_photos'],
  pending_messages: ['platform.outbox_events', 'platform.jobs'],
  sessions: [
    'identity.customer_sessions',
    'identity.project_access_grants',
    'identity.verification_codes',
    'identity.verification_attempts',
    'identity.customer_identity_links',
    'identity.customer_account_changes',
  ],
  workflow: [
    'ops.queue_items',
    'privacy.privacy_requests',
    'privacy.retention_reviews',
    'privacy.retention_decisions',
    'privacy.deletions',
  ],
} as const satisfies Record<string, readonly string[]>

export type ClearedCategory = keyof typeof CLEARED_CATEGORIES
export const CLEARED_TABLES: readonly string[] = Object.values(CLEARED_CATEGORIES).flat()

/** Removal jobs are kept; every other job, event and delivery must be gone so nothing can send later. */
export const KEPT_JOB_AUTOMATIONS: readonly string[] = [RETENTION_AUTOMATION, OBJECT_ERASURE_AUTOMATION]

/**
 * Cleared tables whose rows are deleted rather than truncated: the kept jobs stay, with the outbox events they name
 * (platform.jobs references platform.outbox_events, so neither is in the TRUNCATE).
 */
export const DELETED_TABLES: readonly string[] = ['platform.jobs', 'platform.outbox_events']
const TRUNCATED_TABLES = CLEARED_TABLES.filter((t) => !DELETED_TABLES.includes(t))
const KEPT = sql`${sql.val([...KEPT_JOB_AUTOMATIONS])}::text[]`
const JOBS_REMOVED = sql`platform.jobs WHERE automation <> ALL(${KEPT})`
const KEPT_EVENTS = sql`SELECT outbox_event_id FROM platform.jobs
  WHERE outbox_event_id IS NOT NULL AND automation = ANY(${KEPT})`
const EVENTS_REMOVED = sql`platform.outbox_events WHERE id NOT IN (${KEPT_EVENTS})`

/** Rows removed one by one (not with TRUNCATE): kept when they belong to a designated reusable test account. */
export const SELECTIVE_TABLES = [
  'identity.customer_accounts',
  'crm.contacts',
  'crm.customers',
  'platform.idempotency_keys',
] as const

/** The categories of the confirmation dialog, in order: the cleared ones, then the selectively removed records. */
export const REMOVED_CATEGORIES = [
  ...(Object.keys(CLEARED_CATEGORIES) as ClearedCategory[]),
  'customer_accounts',
  'customer_records',
  'idempotency_records',
  'stored_files',
] as const
export type RemovedCategory = (typeof REMOVED_CATEGORIES)[number]

/** What a reset keeps, counted before and after; each must be unchanged afterwards (the audit log only grows). */
export const PRESERVED = {
  staff_accounts: 'identity.staff_users',
  role_grants: 'identity.role_grants',
  staff_sessions: 'identity.staff_sessions',
  reusable_test_accounts: 'staging.reusable_test_accounts',
  services: 'catalog.services',
  service_versions: 'catalog.service_versions',
  sop_versions: 'catalog.sop_versions',
  loadout_versions: 'catalog.loadout_versions',
  configuration_versions: 'platform.policy_version',
  message_templates: 'platform.message_template_versions',
  coverage_rule_sets: 'platform.coverage_rule_sets',
  coverage_rules: 'platform.coverage_rules',
  // TSK-0127 (0067): the owner's service-area ZIP dataset (OWN-DEC-179), versioned policy data.
  coverage_zip_datasets: 'platform.coverage_zip_datasets',
  coverage_zip_entries: 'platform.coverage_zip_entries',
  equipment: 'work.equipment',
  worker_schedules: 'work.worker_schedules',
  working_hours: 'work.working_hours',
  time_off: 'work.time_off',
  schema_migrations: 'platform.schema_migration',
  audit_events: 'platform.audit_events',
} as const
export type PreservedCategory = keyof typeof PRESERVED

/** Kept without a count: staff sign-in details, rate limits, template heads and the staging trail itself. */
export const KEPT_TABLES = [
  'identity.auth_identities',
  'identity.staff_links',
  'identity.staff_mfa',
  'identity.staff_recovery_codes',
  'identity.staff_status_changes',
  'identity.rate_limits',
  'platform.message_templates',
  'platform.rate_counters',
  'staging.environment_marks',
  'staging.reset_runs',
  'staging.test_data_seedings',
] as const
/** Kept categories that may grow during a reset (the reset itself is audited). */
const MAY_GROW: ReadonlySet<PreservedCategory> = new Set(['audit_events', 'staff_sessions'])

/** The stored-file columns of the cleared tables (photos, estimate documents and PDFs, approval receipts). */
const STORED_FILES = [
  ['intake.photos', 'object_key'],
  ['estimating.estimate_documents', 'object_key'],
  ['estimating.estimate_versions', 'customer_pdf_object_key'],
  ['estimating.approval_receipts', 'object_key'],
  // TSK-0073 (0074): the before photos of field visits.
  ['work.before_photos', 'object_key'],
  ['work.issue_report_photos', 'object_key'],
] as const

/** Stored-file keys per removal job (the job payload is a comma-separated list). */
const KEYS_PER_JOB = 200

const KEPT_ACCOUNTS = sql`SELECT account_id FROM staging.reusable_test_accounts`
const KEPT_CONTACTS = sql`SELECT a.contact_id FROM identity.customer_accounts a
  WHERE a.id IN (${KEPT_ACCOUNTS})`
// The customers of kept accounts and contacts, with the customers they were merged into (the merge link is kept).
const KEPT_CUSTOMERS = sql`WITH RECURSIVE kept(id) AS (
    SELECT a.customer_id FROM identity.customer_accounts a WHERE a.id IN (${KEPT_ACCOUNTS})
    UNION SELECT c.customer_id FROM crm.contacts c WHERE c.id IN (${KEPT_CONTACTS})
    UNION SELECT cu.merged_into_id FROM crm.customers cu JOIN kept k ON cu.id = k.id WHERE cu.merged_into_id IS NOT NULL
  ) SELECT id FROM kept`

const ident = (table: string) =>
  sql.raw(
    table
      .split('.')
      .map((p) => `"${p.replace(/"/g, '')}"`)
      .join('.'),
  )

async function count(db: Db | Tx, table: string): Promise<number> {
  const { rows } = await sql<{ n: string }>`SELECT count(*)::text AS n FROM ${ident(table)}`.execute(db)
  return Number(rows[0]?.n ?? 0)
}

async function scalar(db: Db | Tx, query: ReturnType<typeof sql>): Promise<number> {
  const { rows } = await sql<{ n: string }>`SELECT (${query})::text AS n`.execute(db)
  return Number(rows[0]?.n ?? 0)
}

/** Rows each selectively removed table would lose. */
async function selectiveCounts(db: Db | Tx) {
  return {
    customer_accounts: await scalar(
      db,
      sql`SELECT count(*) FROM identity.customer_accounts WHERE id NOT IN (${KEPT_ACCOUNTS})`,
    ),
    contacts: await scalar(db, sql`SELECT count(*) FROM crm.contacts WHERE id NOT IN (${KEPT_CONTACTS})`),
    customers: await scalar(db, sql`SELECT count(*) FROM crm.customers WHERE id NOT IN (${KEPT_CUSTOMERS})`),
    idempotency: await count(db, 'platform.idempotency_keys'),
  }
}

async function storedFileKeys(db: Db | Tx): Promise<string[]> {
  const keys: string[] = []
  for (const [table, column] of STORED_FILES) {
    const { rows } = await sql<{ k: string }>`SELECT ${sql.ref(column)} AS k FROM ${ident(table)}
      WHERE ${sql.ref(column)} IS NOT NULL`.execute(db)
    keys.push(...rows.map((r) => r.k))
  }
  return [...new Set(keys)]
}

export type TableCounts = Record<string, number>
export type CategoryCount = { id: RemovedCategory; count: number }
export type PreservedCount = { id: PreservedCategory; count: number }

export type Preview = { removed: CategoryCount[]; total: number; preserved: PreservedCount[] }

async function tableCounts(db: Db | Tx): Promise<TableCounts> {
  const out: TableCounts = {}
  for (const t of TRUNCATED_TABLES) out[t] = await count(db, t)
  out['platform.jobs'] = await scalar(db, sql`SELECT count(*) FROM ${JOBS_REMOVED}`)
  out['platform.outbox_events'] = await scalar(db, sql`SELECT count(*) FROM ${EVENTS_REMOVED}`)
  return out
}

export function categories(tables: TableCounts, selective: Awaited<ReturnType<typeof selectiveCounts>>, files: number) {
  const removed: CategoryCount[] = (Object.keys(CLEARED_CATEGORIES) as ClearedCategory[]).map((id) => ({
    id,
    count: CLEARED_CATEGORIES[id].reduce((sum, t) => sum + (tables[t] ?? 0), 0),
  }))
  removed.push(
    { id: 'customer_accounts', count: selective.customer_accounts },
    { id: 'customer_records', count: selective.customers + selective.contacts },
    { id: 'idempotency_records', count: selective.idempotency },
    { id: 'stored_files', count: files },
  )
  return removed
}

export async function preservedCounts(db: Db | Tx): Promise<PreservedCount[]> {
  const out: PreservedCount[] = []
  for (const [id, table] of Object.entries(PRESERVED) as [PreservedCategory, string][])
    out.push({ id, count: await count(db, table) })
  return out
}

/** The counts the confirmation dialog shows: what would be removed now, and what is kept. */
export async function previewReset(db: Db | Tx): Promise<Preview> {
  const removed = categories(await tableCounts(db), await selectiveCounts(db), (await storedFileKeys(db)).length)
  return {
    removed,
    total: removed.filter((c) => c.id !== 'stored_files').reduce((s, c) => s + c.count, 0),
    preserved: await preservedCounts(db),
  }
}

export type ResetCheck = {
  id:
    | 'cleared_tables_empty'
    | 'test_accounts_removed'
    | 'nothing_left_to_send'
    | 'preserved_unchanged'
    | 'reusable_accounts_intact'
    | 'relationships_intact'
    | 'reusable_sign_in'
  ok: boolean
  /** Codes or table names only. */
  details: string[]
}

export type ResetOutcome = {
  runId: string
  seq: string
  state: 'completed' | 'failed'
  removed: CategoryCount[]
  preservedBefore: PreservedCount[]
  preservedAfter: PreservedCount[]
  checks: ResetCheck[]
  errors: { code: string; detail?: string }[]
  /** Removal jobs scheduled for the stored files the cleared rows named. */
  storedFileJobs: number
}

export class ResetCheckFailed extends Error {
  override name = 'ResetCheckFailed'
  constructor(readonly checks: ResetCheck[]) {
    super('a post-reset check failed')
  }
}

async function postChecks(
  tx: Tx,
  before: PreservedCount[],
  reusable: number,
  codeKey: CodeKeySettings,
): Promise<{ checks: ResetCheck[]; after: PreservedCount[] }> {
  const notEmpty: string[] = []
  for (const t of TRUNCATED_TABLES) if ((await count(tx, t)) > 0) notEmpty.push(t)
  const jobsLeft = await scalar(tx, sql`SELECT count(*) FROM ${JOBS_REMOVED}`)
  const eventsLeft = await scalar(tx, sql`SELECT count(*) FROM ${EVENTS_REMOVED}`)
  if (jobsLeft > 0) notEmpty.push('platform.jobs')
  if (eventsLeft > 0) notEmpty.push('platform.outbox_events')
  const left = await selectiveCounts(tx)
  const after = await preservedCounts(tx)
  const changed = after
    .filter((a) => {
      const b = before.find((x) => x.id === a.id)?.count ?? 0
      return MAY_GROW.has(a.id) ? a.count < b : a.count !== b
    })
    .map((a) => a.id)
  const brokenAccounts = await scalar(
    tx,
    sql`SELECT count(*) FROM staging.reusable_test_accounts r
      JOIN identity.customer_accounts a ON a.id = r.account_id
      LEFT JOIN crm.contacts c ON c.id = a.contact_id AND c.customer_id = a.customer_id
      WHERE c.id IS NULL`,
  )
  const orphanContacts = await scalar(
    tx,
    sql`SELECT count(*) FROM crm.contacts c LEFT JOIN crm.customers cu ON cu.id = c.customer_id WHERE cu.id IS NULL`,
  )
  const activeReusable = await scalar(
    tx,
    sql`SELECT count(*) FROM staging.reusable_test_accounts r JOIN identity.customer_accounts a ON a.id = r.account_id
      WHERE a.state = 'active' AND (a.sign_in_email IS NOT NULL OR a.sign_in_phone IS NOT NULL)`,
  )
  const missing = reusable > 0 ? await signInMissing(tx, codeKey) : []
  const checks: ResetCheck[] = [
    { id: 'cleared_tables_empty', ok: notEmpty.length === 0, details: notEmpty },
    {
      id: 'test_accounts_removed',
      ok: left.customer_accounts === 0 && left.contacts === 0 && left.customers === 0,
      details: [],
    },
    { id: 'nothing_left_to_send', ok: jobsLeft === 0 && notEmpty.length === 0, details: [] },
    { id: 'preserved_unchanged', ok: changed.length === 0, details: changed },
    { id: 'reusable_accounts_intact', ok: brokenAccounts === 0, details: [] },
    { id: 'relationships_intact', ok: orphanContacts === 0, details: [] },
    // Ready to sign in again: active with a sign-in value, and one-time-code sign-in configured (names the missing
    // configuration otherwise; that never fails the reset, it is reported).
    {
      id: 'reusable_sign_in',
      ok: activeReusable === reusable && missing.length === 0,
      details: missing.length ? missing : activeReusable === reusable ? [] : ['ACCOUNT_NOT_ACTIVE'],
    },
  ]
  return { checks, after }
}

/** Checks whose failure rolls the reset back (the sign-in readiness is reported, never a reason to keep test data). */
const BLOCKING: ReadonlySet<ResetCheck['id']> = new Set([
  'cleared_tables_empty',
  'test_accounts_removed',
  'nothing_left_to_send',
  'preserved_unchanged',
  'reusable_accounts_intact',
  'relationships_intact',
])

export type ResetInput = {
  mode: 'reset' | 'reset_and_seed'
  requestedBy: string
  /** The Owner as the audit log records them; the reset's audit event commits with the reset. */
  actor: Extract<AuditActor, { kind: 'staff' }>
  environment: 'local' | 'ci' | 'staging'
  requestId: string
  codeKey: CodeKeySettings
  /** The request's idempotency scope and body digest (idempotency.ts), recorded on the run. */
  idempotency?: { scope: string; requestHash: string }
}

/** The audit summary of a run: counts and codes only. */
const auditSummary = (mode: ResetInput['mode'], removed: CategoryCount[], errors: { code: string }[]) => ({
  mode,
  state: errors.length ? 'failed' : 'completed',
  removed: Object.fromEntries(removed.map((c) => [c.id, c.count])),
  errors: errors.map((e) => e.code),
})

function errorCode(err: unknown): { code: string; detail?: string } {
  if (err instanceof ResetCheckFailed) {
    const first = err.checks.find((c) => !c.ok)
    return first ? { code: 'CHECK_FAILED', detail: first.id } : { code: 'CHECK_FAILED' }
  }
  const pg = err as { code?: string }
  if (pg?.code === '55P03') return { code: 'LOCK_TIMEOUT' }
  if (pg?.code === '40P01') return { code: 'DEADLOCK' }
  if (typeof pg?.code === 'string' && /^[0-9A-Z]{5}$/.test(pg.code)) return { code: 'DATABASE_ERROR', detail: pg.code }
  return { code: 'INTERNAL' }
}

/**
 * Runs the reset in one transaction on `conn` (the connection that holds the reset lock). Refuses with CONFLICT
 * STAGING_NOT_IDENTIFIED when the database is not a positively identified test database. A failure inside rolls
 * everything back and is recorded as a failed run, which is returned.
 */
export async function runReset(conn: Db, input: ResetInput): Promise<ResetOutcome> {
  const identified = await scalar(conn, sql`SELECT CASE WHEN staging.database_identified() THEN 1 ELSE 0 END`)
  if (identified !== 1)
    throw new ApiError('CONFLICT', {
      fieldErrors: [{ field: 'database', code: 'STAGING_NOT_IDENTIFIED', message: '' }],
    })
  let removedForFailure: CategoryCount[] = []
  try {
    return await conn.transaction().execute(async (tx) => {
      await sql`SET LOCAL lock_timeout = '15s'`.execute(tx)
      // No job is leased while the reset runs; one already sending refuses it (retry when it has finished).
      await sql`LOCK TABLE platform.jobs IN SHARE ROW EXCLUSIVE MODE`.execute(tx)
      const inFlight = await scalar(
        tx,
        sql`SELECT count(*) FROM ${JOBS_REMOVED} AND state = 'running' AND locked_until > now()`,
      )
      if (inFlight > 0)
        throw new ApiError('CONFLICT', {
          fieldErrors: [{ field: 'reset', code: 'RESET_SENDS_IN_FLIGHT', message: '' }],
        })
      const before = await preservedCounts(tx)
      const tables = await tableCounts(tx)
      const selective = await selectiveCounts(tx)
      const keys = await storedFileKeys(tx)
      const removed = categories(tables, selective, keys.length)
      removedForFailure = removed.map((c) => ({ ...c, count: 0 }))
      const reusable = await count(tx, 'staging.reusable_test_accounts')
      const run = await tx
        .insertInto('staging.reset_runs')
        .values({
          mode: input.mode,
          state: 'running',
          requested_by: input.requestedBy,
          environment: input.environment,
          request_id: input.requestId.slice(0, 100),
          idempotency_scope: input.idempotency?.scope ?? null,
          request_hash: input.idempotency?.requestHash ?? null,
        })
        .returning(['id', sql<string>`seq::text`.as('seq')])
        .executeTakeFirstOrThrow()
      await sql`SELECT set_config('handyhub.staging_reset', ${run.id}, true)`.execute(tx)
      await sql`SELECT staging.reset_unlock()`.execute(tx)
      await sql`TRUNCATE ${sql.join(TRUNCATED_TABLES.map(ident))}`.execute(tx)
      await sql`SELECT staging.reset_relock()`.execute(tx)
      await sql`DELETE FROM ${JOBS_REMOVED}`.execute(tx)
      await sql`DELETE FROM ${EVENTS_REMOVED}`.execute(tx)
      await sql`DELETE FROM identity.customer_accounts WHERE id NOT IN (${KEPT_ACCOUNTS})`.execute(tx)
      await sql`DELETE FROM crm.contacts WHERE id NOT IN (${KEPT_CONTACTS})`.execute(tx)
      await sql`DELETE FROM crm.customers WHERE id NOT IN (${KEPT_CUSTOMERS})`.execute(tx)
      await sql`DELETE FROM platform.idempotency_keys`.execute(tx)
      // The removal of the stored files the cleared rows named, after the commit (idempotent; retried until done).
      const erasure = objectErasureAutomation(null)
      let storedFileJobs = 0
      for (let i = 0; i < keys.length; i += KEYS_PER_JOB) {
        storedFileJobs++
        await scheduleJob(tx, erasure, {
          key: `staging_reset:${run.id}:${storedFileJobs}`,
          payload: { keys: keys.slice(i, i + KEYS_PER_JOB).join(',') },
          target: { type: 'staging_reset_run', id: run.id },
          requestId: input.requestId,
        })
      }
      // Today's retention scan was a queued job too; each run schedules the next, so it is scheduled again.
      await ensureRetentionScan(tx, input.requestId)
      const { checks, after } = await postChecks(tx, before, reusable, input.codeKey)
      if (checks.some((c) => BLOCKING.has(c.id) && !c.ok)) throw new ResetCheckFailed(checks)
      // The reset's audit event, in the reset's own transaction: a committed reset is always in the audit log.
      await audit.record(tx, {
        actor: input.actor,
        action: 'staging.reset_test_data',
        target: { type: 'staging_reset_run', id: run.id },
        result: 'succeeded',
        summary: auditSummary(input.mode, removed, []),
        requestId: input.requestId,
      })
      await tx
        .updateTable('staging.reset_runs')
        .set({
          state: 'completed',
          finished_at: sql<Date>`clock_timestamp()`,
          removed: JSON.stringify({ tables, selective, storedFiles: keys.length, storedFileJobs }),
          preserved: JSON.stringify({ before, after }),
          checks: JSON.stringify(checks),
        })
        .where('id', '=', run.id)
        .execute()
      await sql`SELECT set_config('handyhub.staging_reset', '', true)`.execute(tx)
      return {
        runId: run.id,
        seq: run.seq,
        state: 'completed' as const,
        removed,
        preservedBefore: before,
        preservedAfter: after,
        checks,
        errors: [],
        storedFileJobs,
      }
    })
  } catch (err) {
    if (err instanceof ApiError) throw err
    const error = errorCode(err)
    const checks = err instanceof ResetCheckFailed ? err.checks : []
    const preserved = await preservedCounts(conn)
    const failed = await withTx(conn, async (tx) => {
      const row = await tx
        .insertInto('staging.reset_runs')
        .values({
          mode: input.mode,
          state: 'failed',
          requested_by: input.requestedBy,
          environment: input.environment,
          request_id: input.requestId.slice(0, 100),
          finished_at: sql<Date>`clock_timestamp()`,
          checks: JSON.stringify(checks),
          errors: JSON.stringify([error]),
        })
        .returning(['id', sql<string>`seq::text`.as('seq')])
        .executeTakeFirstOrThrow()
      await audit.record(tx, {
        actor: input.actor,
        action: 'staging.reset_test_data',
        target: { type: 'staging_reset_run', id: row.id },
        result: 'failed',
        summary: auditSummary(input.mode, removedForFailure, [error]),
        requestId: input.requestId,
      })
      return row
    })
    return {
      runId: failed.id,
      seq: failed.seq,
      state: 'failed',
      // Rolled back: nothing was removed.
      removed: removedForFailure,
      preservedBefore: preserved,
      preservedAfter: preserved,
      checks,
      errors: [error],
      storedFileJobs: 0,
    }
  }
}

/** Takes the reset lock on one connection for `fn`; CONFLICT RESET_RUNNING when another reset holds it. */
export async function withResetLock<T>(db: Db, fn: (conn: Db) => Promise<T>): Promise<T> {
  return db.connection().execute(async (conn) => {
    const { rows } = await sql<{
      ok: boolean
    }>`SELECT pg_try_advisory_lock(${RESET_LOCK[0]}, ${RESET_LOCK[1]}) AS ok`.execute(conn)
    if (rows[0]?.ok !== true)
      throw new ApiError('CONFLICT', { fieldErrors: [{ field: 'reset', code: 'RESET_RUNNING', message: '' }] })
    try {
      return await fn(conn)
    } finally {
      await sql`SELECT pg_advisory_unlock(${RESET_LOCK[0]}, ${RESET_LOCK[1]})`.execute(conn)
    }
  })
}

/** Whether a reset is running now (its lock is held by some session). */
export async function resetRunning(db: Db | Tx): Promise<boolean> {
  const { rows } = await sql<{ held: boolean }>`SELECT EXISTS (
      SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND classid = ${RESET_LOCK[0]} AND objid = ${RESET_LOCK[1]}
        AND objsubid = 2 AND granted) AS held`.execute(db)
  return rows[0]?.held === true
}

/** A completed (or still running) run of this idempotency scope, as the reset answered it; null when none. */
export async function findCompletedRun(db: Db | Tx, scope: string) {
  const row = await db
    .selectFrom('staging.reset_runs')
    .select(['id', sql<string>`seq::text`.as('seq'), 'mode', 'state', 'request_hash', 'removed', 'preserved', 'checks'])
    .where('idempotency_scope', '=', scope)
    .where('state', '<>', 'failed')
    .executeTakeFirst()
  if (!row) return null
  const removed = row.removed as {
    tables?: TableCounts
    selective?: Awaited<ReturnType<typeof selectiveCounts>>
    storedFiles?: number
    storedFileJobs?: number
  }
  const preserved = row.preserved as { before?: PreservedCount[]; after?: PreservedCount[] }
  const empty = { customer_accounts: 0, contacts: 0, customers: 0, idempotency: 0 }
  return {
    requestHash: row.request_hash,
    mode: row.mode as ResetInput['mode'],
    outcome: {
      runId: row.id,
      seq: row.seq,
      state: 'completed',
      removed: categories(removed.tables ?? {}, removed.selective ?? empty, removed.storedFiles ?? 0),
      preservedBefore: preserved.before ?? [],
      preservedAfter: preserved.after ?? [],
      checks: (row.checks as ResetCheck[]) ?? [],
      errors: [],
      storedFileJobs: removed.storedFileJobs ?? 0,
    } satisfies ResetOutcome,
  }
}
