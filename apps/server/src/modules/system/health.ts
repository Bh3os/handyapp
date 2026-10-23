// The Owner's system health report (TSK-0101; HH-NFR-02, HH-ARC-09, HH-COM-02, T12, T71, RULE-SERVER-AUTHZ). It reads
// only what the system records: the job queue and the outbox, message deliveries, webhook receipts, request photos,
// the request-to-intake integrity check, the migrations and the configuration. A part the system cannot observe
// (backups, the last restore drill, scheduling conflicts before scheduling exists, error tracking without a tracker)
// is reported as unknown or not configured, never as healthy (T71: no false success or safe-ready state).
// Nothing secret or personal leaves here: counts, codes, times and record references only; never a destination, a
// payload, message text, an object key or a variable's value.
import { listMigrations, planMigrations, type Db } from '@handyhub/db'
import { sql } from 'kysely'
import { loadConfig } from '../../platform/config/index.js'
import type { ProviderSettings } from '../../providers/settings.js'

export const HEALTH_CHECKS = [
  'database',
  'migrations',
  'jobs',
  'outbox',
  'deliveries_email',
  'deliveries_sms',
  'callbacks_bird',
  'callbacks_resend',
  'uploads',
  'intake_integrity',
  'configuration',
  'scheduling_conflicts',
  'error_tracking',
  'backups',
  'restore_drill',
] as const
export type HealthCheckId = (typeof HEALTH_CHECKS)[number]

/**
 * ok: checked and nothing needs a person. attention: something waits longer than expected. failed: a permanent
 * failure or a broken component. not_configured: a setting or provider is missing. unknown: the system cannot observe
 * it. Only `ok` is ever shown as healthy.
 */
export const HEALTH_STATUSES = ['ok', 'attention', 'failed', 'not_configured', 'unknown'] as const
export type HealthStatus = (typeof HEALTH_STATUSES)[number]

export const HEALTH_METRICS = [
  'pending',
  'queued',
  'running',
  'retrying',
  'overdue',
  'interrupted',
  'failed',
  'stale',
  'received',
  'processing_failed',
  'quarantined',
  'rejected',
  'missing',
  'configured',
  'not_configured',
  'proposed',
] as const
export type HealthMetric = (typeof HEALTH_METRICS)[number]

/** Why a check reads as it does, when the counts alone do not say it. */
export const HEALTH_NOTES = [
  'migrations_unreadable',
  'provider_unknown',
  'fake_provider',
  'rejected_callbacks_in_logs',
  'no_scheduling_records',
  'no_error_tracker',
  'backups_not_observable',
  'no_restore_drill_recorded',
] as const
export type HealthNote = (typeof HEALTH_NOTES)[number]

export const PROVIDER_CHANNELS = ['email', 'sms', 'storage'] as const
export const PROVIDER_MODES = ['real', 'fake', 'not_configured', 'unknown'] as const
export type ProviderMode = (typeof PROVIDER_MODES)[number]

/**
 * How long work may wait before it needs attention, in minutes: queued jobs past their run time, pending outbox
 * events, queued messages, quarantined photos and received requests without their intake item. PROPOSED engineering
 * default; no owner decision sets it.
 */
export const HEALTH_STALE_MINUTES = 15
/** How many rows each detail list shows, newest first. PROPOSED engineering default. */
export const HEALTH_LIST_LIMIT = 20

/** The automations whose failures belong to a check (apps/server/src/modules/photos and notifications). */
const PHOTO_PROCESSING = 'photo.process'
const PROVIDER_EVENTS = 'notify.provider_events'

export type HealthCheck = {
  id: HealthCheckId
  status: HealthStatus
  metrics: { id: HealthMetric; value: number }[]
  oldestAt: Date | null
  latestAt: Date | null
  /** Environment variable names (never values) that the check needs and that are not set. */
  missing: string[]
  note: HealthNote | null
  /** The graph nodes that explain a missing or unknown state. */
  sourceIds: string[]
  /** The staff app screen that acts on it. */
  link: string | null
}

export type ProviderView = {
  channel: (typeof PROVIDER_CHANNELS)[number]
  mode: ProviderMode
  provider: 'resend' | 'bird' | 'r2' | null
  missing: string[]
}

export type HealthReport = {
  checkedAt: Date
  environment: string | null
  checks: HealthCheck[]
  providers: ProviderView[]
  webhookSecrets: { bird: boolean | null; resend: boolean | null }
  testDestinations: { emails: number; phones: number } | null
  failedJobs: {
    id: string
    automation: string
    targetType: string | null
    attempts: number
    maxAttempts: number
    errorClass: string | null
    failedAt: Date
  }[]
  failedDeliveries: {
    id: string
    messageKey: string
    channel: string
    audience: string
    errorCode: string | null
    updatedAt: Date
  }[]
  failedCallbacks: {
    jobId: string
    provider: string | null
    eventType: string | null
    attempts: number
    errorClass: string | null
    failedAt: Date
  }[]
  uploadProblems: {
    id: string
    state: string
    reason: string | null
    contentType: string
    byteSize: number
    uploadedAt: Date
    requestId: string | null
    reference: string | null
  }[]
  missingFromIntake: { requestId: string; reference: string; submittedAt: Date }[]
}

export type HealthOptions = {
  now?: Date
  staleMinutes?: number
  /** The process's provider settings; null when this process was not given them (reported as unknown). */
  providers?: ProviderSettings | null
  /** The migrations folder; tests may point elsewhere. */
  migrationsDir?: string
}

const n = (v: unknown): number => Number(v ?? 0)
const at = (v: unknown): Date | null => (v === null || v === undefined ? null : new Date(v as string | Date))
const metrics = (values: Partial<Record<HealthMetric, unknown>>) =>
  (Object.entries(values) as [HealthMetric, unknown][]).map(([id, value]) => ({ id, value: n(value) }))

function check(id: HealthCheckId, status: HealthStatus, extra: Partial<Omit<HealthCheck, 'id' | 'status'>> = {}) {
  return {
    id,
    status,
    metrics: [],
    oldestAt: null,
    latestAt: null,
    missing: [],
    note: null,
    sourceIds: [],
    link: null,
    ...extra,
  } satisfies HealthCheck
}

/** The provider settings as the health screen shows them: the mode and missing variable names, never a value. */
export function providerViews(settings: ProviderSettings | null | undefined): ProviderView[] {
  const real = { email: 'resend', sms: 'bird', storage: 'r2' } as const
  return PROVIDER_CHANNELS.map((channel) => {
    if (!settings) return { channel, mode: 'unknown', provider: null, missing: [] }
    const s = settings[channel]
    if (s.adapter === 'not_configured') return { channel, mode: 'not_configured', provider: null, missing: s.missing }
    // The staging log sender (TSK-0112) is a test provider like the fakes: nothing reaches a real inbox.
    // The local disk storage likewise (docs/local-mac.md): a folder on one computer, never R2.
    if (s.adapter === 'fake' || s.adapter === 'log' || s.adapter === 'disk')
      return { channel, mode: 'fake', provider: null, missing: [] }
    return { channel, mode: 'real', provider: real[channel], missing: [] }
  })
}

/** A permanent failure outranks a provider that is missing, which outranks work that waits too long. */
function deliveryStatus(failed: number, stale: number, provider: ProviderView): HealthStatus {
  if (failed > 0) return 'failed'
  if (provider.mode === 'not_configured') return 'not_configured'
  if (stale > 0) return 'attention'
  if (provider.mode === 'unknown') return 'unknown'
  return 'ok'
}

async function migrationsCheck(db: Db, dir: string | undefined): Promise<HealthCheck> {
  try {
    const onDisk = await listMigrations(dir)
    const { rows } = await sql<{ version: string; file: string; checksum: string }>`
      SELECT version, file, checksum FROM platform.schema_migration ORDER BY version`.execute(db)
    const pending = planMigrations(onDisk, rows).length
    return check('migrations', pending === 0 ? 'ok' : 'attention', { metrics: metrics({ pending }) })
  } catch {
    // A changed or missing migration file, or an unreadable table: the schema is not known to match the code.
    return check('migrations', 'failed', { note: 'migrations_unreadable' })
  }
}

/** Builds the report. Every query reads committed records only; nothing is written. */
export async function collectHealth(db: Db, options: HealthOptions = {}): Promise<HealthReport> {
  const now = options.now ?? new Date()
  const staleBefore = new Date(now.getTime() - (options.staleMinutes ?? HEALTH_STALE_MINUTES) * 60_000)
  const settings = options.providers ?? null
  const providers = providerViews(settings)
  const byChannel = Object.fromEntries(providers.map((p) => [p.channel, p])) as Record<
    ProviderView['channel'],
    ProviderView
  >

  let database: HealthCheck
  try {
    await sql`SELECT 1`.execute(db)
    database = check('database', 'ok')
  } catch {
    database = check('database', 'failed')
  }

  const jobs =
    (
      await sql<Record<string, unknown>>`
      SELECT
        count(*) FILTER (WHERE state = 'queued')::int AS queued,
        count(*) FILTER (WHERE state = 'running')::int AS running,
        count(*) FILTER (WHERE state = 'queued' AND attempts > 0)::int AS retrying,
        count(*) FILTER (WHERE state = 'queued' AND run_at < ${staleBefore})::int AS overdue,
        count(*) FILTER (WHERE state = 'queued' AND interrupted)::int AS interrupted,
        count(*) FILTER (WHERE state = 'failed')::int AS failed,
        count(*) FILTER (WHERE state = 'failed' AND automation = ${PHOTO_PROCESSING})::int AS photo_failed,
        min(run_at) FILTER (WHERE state = 'queued' AND run_at <= ${now}) AS oldest_due,
        max(updated_at) FILTER (WHERE state = 'failed') AS latest_failed
      FROM platform.jobs
      WHERE state IN ('queued', 'running', 'failed')`.execute(db)
    ).rows[0] ?? {}
  const jobsCheck = check(
    'jobs',
    n(jobs['failed']) > 0 ? 'failed' : n(jobs['overdue']) + n(jobs['interrupted']) > 0 ? 'attention' : 'ok',
    {
      metrics: metrics({
        queued: jobs['queued'],
        running: jobs['running'],
        retrying: jobs['retrying'],
        overdue: jobs['overdue'],
        interrupted: jobs['interrupted'],
        failed: jobs['failed'],
      }),
      oldestAt: at(jobs['oldest_due']),
      latestAt: at(jobs['latest_failed']),
    },
  )

  const outbox =
    (
      await sql<Record<string, unknown>>`
      SELECT count(*)::int AS pending, count(*) FILTER (WHERE created_at < ${staleBefore})::int AS stale,
        min(created_at) AS oldest
      FROM platform.outbox_events WHERE state = 'pending'`.execute(db)
    ).rows[0] ?? {}
  const outboxCheck = check('outbox', n(outbox['stale']) > 0 ? 'attention' : 'ok', {
    metrics: metrics({ pending: outbox['pending'], stale: outbox['stale'] }),
    oldestAt: at(outbox['oldest']),
  })

  const deliveryRows = (
    await sql<Record<string, unknown>>`
      SELECT channel,
        count(*) FILTER (WHERE state = 'queued')::int AS queued,
        count(*) FILTER (WHERE state = 'queued' AND coalesce(queued_at, created_at) < ${staleBefore})::int AS stale,
        count(*) FILTER (WHERE state = 'failed')::int AS failed,
        min(coalesce(queued_at, created_at)) FILTER (WHERE state = 'queued') AS oldest,
        max(updated_at) FILTER (WHERE state = 'failed') AS latest_failed
      FROM platform.message_deliveries WHERE state IN ('queued', 'failed') GROUP BY channel`.execute(db)
  ).rows
  const deliveryCheck = (channel: 'email' | 'sms'): HealthCheck => {
    const r = deliveryRows.find((x) => x['channel'] === channel) ?? {}
    const provider = byChannel[channel]
    const failed = n(r['failed'])
    return check(
      channel === 'email' ? 'deliveries_email' : 'deliveries_sms',
      deliveryStatus(failed, n(r['stale']), provider),
      {
        metrics: metrics({ queued: r['queued'], stale: r['stale'], failed }),
        oldestAt: at(r['oldest']),
        latestAt: at(r['latest_failed']),
        missing: provider.missing,
        note: provider.mode === 'fake' ? 'fake_provider' : provider.mode === 'unknown' ? 'provider_unknown' : null,
        // Delivery failures are action-queue items with Retry (T12, OWN-DEC-115).
        link: failed > 0 ? '/' : null,
      },
    )
  }

  const callbackRows = (
    await sql<Record<string, unknown>>`
      SELECT p.provider,
        (SELECT count(*)::int FROM platform.webhook_receipts r WHERE r.provider = p.provider) AS received,
        (SELECT max(received_at) FROM platform.webhook_receipts r WHERE r.provider = p.provider) AS latest,
        (SELECT count(*)::int FROM platform.webhook_receipts r WHERE r.provider = p.provider AND r.state = 'failed')
          + (SELECT count(*)::int FROM platform.jobs j JOIN platform.webhook_receipts r ON r.id::text = j.target_id
             WHERE j.automation = ${PROVIDER_EVENTS} AND j.state = 'failed' AND r.provider = p.provider) AS failed
      FROM (VALUES ('bird'), ('resend')) AS p (provider)`.execute(db)
  ).rows
  const callbackCheck = (provider: 'bird' | 'resend'): HealthCheck => {
    const r = callbackRows.find((x) => x['provider'] === provider) ?? {}
    const secret = settings ? settings.webhookSecrets[provider] !== null : null
    const failed = n(r['failed'])
    const status: HealthStatus =
      failed > 0 ? 'failed' : secret === false ? 'not_configured' : secret === null ? 'unknown' : 'ok'
    return check(provider === 'bird' ? 'callbacks_bird' : 'callbacks_resend', status, {
      metrics: metrics({ received: r['received'], failed }),
      latestAt: at(r['latest']),
      missing: secret === false ? [provider === 'bird' ? 'BIRD_WEBHOOK_SECRET' : 'RESEND_WEBHOOK_SECRET'] : [],
      // Deliveries whose signature or timestamp did not verify are refused and logged, never stored (TSK-0013).
      note: secret === null ? 'provider_unknown' : 'rejected_callbacks_in_logs',
      sourceIds: [provider === 'bird' ? 'INT-Bird' : 'INT-Resend'],
    })
  }

  const photos =
    (
      await sql<Record<string, unknown>>`
      SELECT count(*) FILTER (WHERE state = 'quarantined')::int AS quarantined,
        count(*) FILTER (WHERE state = 'quarantined' AND uploaded_at < ${staleBefore})::int AS stale,
        count(*) FILTER (WHERE state = 'rejected')::int AS rejected,
        min(uploaded_at) FILTER (WHERE state = 'quarantined') AS oldest,
        max(processed_at) FILTER (WHERE state = 'rejected') AS latest_rejected
      FROM intake.photos WHERE state IN ('quarantined', 'rejected')`.execute(db)
    ).rows[0] ?? {}
  const storage = byChannel.storage
  const photoFailed = n(jobs['photo_failed'])
  // A rejected photo is the server refusing a bad file, as it should; it is counted, not a failure of the system.
  const uploadsCheck = check(
    'uploads',
    photoFailed > 0
      ? 'failed'
      : storage.mode === 'not_configured'
        ? 'not_configured'
        : n(photos['stale']) > 0
          ? 'attention'
          : storage.mode === 'unknown'
            ? 'unknown'
            : 'ok',
    {
      metrics: metrics({
        quarantined: photos['quarantined'],
        stale: photos['stale'],
        rejected: photos['rejected'],
        processing_failed: photoFailed,
      }),
      oldestAt: at(photos['oldest']),
      latestAt: at(photos['latest_rejected']),
      missing: storage.missing,
      note: storage.mode === 'fake' ? 'fake_provider' : storage.mode === 'unknown' ? 'provider_unknown' : null,
      sourceIds: ['INT-R2'],
    },
  )

  // Request-to-intake integrity (HH-NFR-02): every received request has its open new_request item in staff intake.
  const missingRows = (
    await sql<{ id: string; reference: string; submitted_at: Date; total: number }>`
      SELECT r.id, r.reference, r.submitted_at, count(*) OVER ()::int AS total
      FROM intake.requests r
      WHERE r.state = 'received' AND r.submitted_at < ${staleBefore}
        AND NOT EXISTS (
          SELECT 1 FROM ops.queue_items q
          WHERE q.type = 'new_request' AND q.subject_id = r.id::text AND q.resolved_at IS NULL)
      ORDER BY r.submitted_at
      LIMIT ${HEALTH_LIST_LIMIT}`.execute(db)
  ).rows
  const missing = n(missingRows[0]?.total)
  const integrityCheck = check('intake_integrity', missing > 0 ? 'failed' : 'ok', {
    metrics: metrics({ missing }),
    oldestAt: missingRows[0]?.submitted_at ?? null,
    link: missing > 0 ? '/' : null,
  })

  const config = await loadConfig(db)
  const entries = config.entries()
  const notConfigured = entries.filter((e) => e.state === 'NOT_CONFIGURED').length
  const configurationCheck = check('configuration', notConfigured > 0 ? 'not_configured' : 'ok', {
    metrics: metrics({
      configured: entries.length - notConfigured,
      not_configured: notConfigured,
      proposed: entries.filter((e) => e.state === 'CONFIGURED' && e.proposed).length,
    }),
    link: '/settings',
  })

  const failedJobs = await db
    .selectFrom('platform.jobs')
    .select(['id', 'automation', 'target_type', 'attempts', 'max_attempts', 'last_error_class', 'updated_at'])
    .where('state', '=', 'failed')
    .orderBy('updated_at', 'desc')
    .orderBy('seq', 'desc')
    .limit(HEALTH_LIST_LIMIT)
    .execute()

  const failedDeliveries = await db
    .selectFrom('platform.message_deliveries')
    .select(['id', 'message_key', 'channel', 'audience', 'error_code', 'updated_at'])
    .where('state', '=', 'failed')
    .orderBy('updated_at', 'desc')
    .orderBy('seq', 'desc')
    .limit(HEALTH_LIST_LIMIT)
    .execute()

  const failedCallbacks = (
    await sql<Record<string, unknown>>`
      SELECT j.id AS job_id, r.provider, r.event_type, j.attempts, j.last_error_class, j.updated_at
      FROM platform.jobs j LEFT JOIN platform.webhook_receipts r ON r.id::text = j.target_id
      WHERE j.automation = ${PROVIDER_EVENTS} AND j.state = 'failed'
      ORDER BY j.updated_at DESC, j.seq DESC
      LIMIT ${HEALTH_LIST_LIMIT}`.execute(db)
  ).rows

  const uploadProblems = (
    await sql<Record<string, unknown>>`
      SELECT p.id, p.state, p.rejection_reason, p.content_type, p.byte_size, p.uploaded_at, p.request_id, r.reference
      FROM intake.photos p LEFT JOIN intake.requests r ON r.id = p.request_id
      WHERE p.state = 'rejected' OR (p.state = 'quarantined' AND p.uploaded_at < ${staleBefore})
      ORDER BY p.uploaded_at DESC, p.id
      LIMIT ${HEALTH_LIST_LIMIT}`.execute(db)
  ).rows

  return {
    checkedAt: now,
    environment: settings?.environment ?? null,
    checks: [
      database,
      await migrationsCheck(db, options.migrationsDir),
      jobsCheck,
      outboxCheck,
      deliveryCheck('email'),
      deliveryCheck('sms'),
      callbackCheck('bird'),
      callbackCheck('resend'),
      uploadsCheck,
      integrityCheck,
      configurationCheck,
      // Not observable yet: scheduling records arrive with the visit model, there is no error tracker, and backups
      // and restore drills are kept outside this system (Render; TSK-0106). Unknown is not safe: never shown as ok.
      check('scheduling_conflicts', 'unknown', { note: 'no_scheduling_records', sourceIds: ['HH-NFR-02'] }),
      check('error_tracking', 'not_configured', { note: 'no_error_tracker', sourceIds: ['HH-NFR-02'] }),
      check('backups', 'unknown', {
        note: 'backups_not_observable',
        sourceIds: ['OQ-PRODUCTION-HOSTING', 'INT-Render'],
      }),
      check('restore_drill', 'unknown', { note: 'no_restore_drill_recorded', sourceIds: ['HH-NFR-03', 'T72'] }),
    ],
    providers,
    webhookSecrets: {
      bird: settings ? settings.webhookSecrets.bird !== null : null,
      resend: settings ? settings.webhookSecrets.resend !== null : null,
    },
    testDestinations: settings
      ? { emails: settings.testDestinations.emails.length, phones: settings.testDestinations.phones.length }
      : null,
    failedJobs: failedJobs.map((j) => ({
      id: j.id,
      automation: j.automation,
      targetType: j.target_type,
      attempts: j.attempts,
      maxAttempts: j.max_attempts,
      errorClass: j.last_error_class,
      failedAt: j.updated_at,
    })),
    failedDeliveries: failedDeliveries.map((d) => ({
      id: d.id,
      messageKey: d.message_key,
      channel: d.channel,
      audience: d.audience,
      errorCode: d.error_code,
      updatedAt: d.updated_at,
    })),
    failedCallbacks: failedCallbacks.map((c) => ({
      jobId: String(c['job_id']),
      provider: (c['provider'] as string | null) ?? null,
      eventType: (c['event_type'] as string | null) ?? null,
      attempts: n(c['attempts']),
      errorClass: (c['last_error_class'] as string | null) ?? null,
      failedAt: at(c['updated_at']) as Date,
    })),
    uploadProblems: uploadProblems.map((p) => ({
      id: String(p['id']),
      state: String(p['state']),
      reason: (p['rejection_reason'] as string | null) ?? null,
      contentType: String(p['content_type']),
      byteSize: n(p['byte_size']),
      uploadedAt: at(p['uploaded_at']) as Date,
      requestId: (p['request_id'] as string | null) ?? null,
      reference: (p['reference'] as string | null) ?? null,
    })),
    missingFromIntake: missingRows.map((r) => ({
      requestId: r.id,
      reference: r.reference,
      submittedAt: r.submitted_at,
    })),
  }
}
