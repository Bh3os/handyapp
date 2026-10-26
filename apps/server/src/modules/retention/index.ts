// Retention module (TSK-0099; HH-PRIV-01, HH-DATA-09, ENT-RetentionReview, FACT-RETENTION-SCHEDULE, OWN-DEC-70,
// OWN-DEC-142, OQ-RETENTION-REVIEW, RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS).
//   GET /staff/retention          the schedule as configured, which categories the job can find yet, the last and
//                                 next run, and how many entries wait in the deletion-review queue
//   GET /staff/retention-reviews  the queue's entries with their hold checks, paged; one category on request
// Owner only (ROLE-MATRIX retention.view, PROPOSED, in the row of the Delete action). The daily job
// (retention.review_scan) opens the entries; nothing in this module deletes, archives or changes a record.
// TSK-0138 (OWN-DEC-177): the provisional defaults (staff accounts, consent records, settings history, technical logs,
// expired sessions and links), with periods in years or calendar days, and batch entries.
import type { Tx } from '@handyhub/db'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { pageSchema } from '../../api/pagination.js'
import type { Automation } from '../../platform/automation.js'
import { scheduleJob } from '../../platform/jobs.js'
import { ENTRY_STATES, RETENTION_AUTOMATION, listReviewEntries, retentionOverview } from './reviews.js'
import { RETENTION_PROCESS, runRetentionScan, type ScanResult } from './scan.js'
import { HOLD_CHECKS, PERIOD_CATEGORIES, RETENTION_CATEGORIES } from './schedule.js'

export { CATEGORY_DEFINITIONS, HOLD_CHECKS, PERIOD_CATEGORIES, RETENTION_CATEGORIES } from './schedule.js'
export { RETENTION_AUTOMATION, listReviewEntries, retentionOverview } from './reviews.js'
export { RETENTION_PROCESS, SCAN_BATCH, holdChecksFor, runRetentionScan, type ScanResult } from './scan.js'

const TEST = 'test/integration/retention.test.ts'

/** PROPOSED engineering default: a run that left due records behind is followed by the next batch after this delay. */
export const NEXT_BATCH_DELAY_MS = 5 * 60_000

const utcDate = (d: Date) => d.toISOString().slice(0, 10)
const nextUtcMidnight = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1))

/**
 * The daily scan: one job per UTC day (key `day:<date>:<batch>`). Each run schedules the next one in the same
 * transaction: the next batch soon when due records were left, else the first batch of the next day. The server
 * schedules today's job at start-up (idempotent by key), so a broken chain resumes on the next deploy.
 */
export function retentionReviewAutomation(): Automation {
  const automation: Automation = {
    name: RETENTION_AUTOMATION,
    trigger: { kind: 'schedule', description: 'once a day (UTC); each run schedules the next; scheduled at start-up' },
    identity: RETENTION_PROCESS,
    inputs: {
      description: 'the active retention.* configuration and the records whose period has ended',
      version: 1,
    },
    idempotency:
      'one job per UTC day and batch (key: day:<date>:<batch>); a record already in the queue gets no second entry',
    effect:
      'opens owner deletion-review entries for records past their retention period; never deletes, archives or ' +
      'changes a record',
    retry: { maxAttempts: 5, baseDelayMs: 60_000, maxDelayMs: 3_600_000 },
    timeoutMs: 60_000,
    exceptionOwner: 'owner',
    audit: { action: 'retention.review_scan' },
    handle: async ({ tx, job }) => {
      const result = await runRetentionScan(tx, { requestId: job.requestId })
      const now = new Date(result.at)
      const [, date = utcDate(now), batch = '1'] =
        /^day:(\d{4}-\d{2}-\d{2}):(\d+)$/.exec(String(job.payload['key'] ?? '')) ?? []
      const next = result.more
        ? { key: `day:${date}:${Number(batch) + 1}`, runAt: new Date(now.getTime() + NEXT_BATCH_DELAY_MS) }
        : { key: `day:${utcDate(nextUtcMidnight(now))}:1`, runAt: nextUtcMidnight(now) }
      await scheduleJob(tx, automation, {
        key: next.key,
        runAt: next.runAt,
        payload: { key: next.key },
        target: { type: 'retention_review_queue' },
        requestId: job.requestId,
      })
      return 'done'
    },
  }
  return automation
}

/** Schedules today's scan if it is not scheduled yet (boot; idempotent by key). */
export async function ensureRetentionScan(tx: Tx, requestId: string, now = new Date()): Promise<{ created: boolean }> {
  const key = `day:${utcDate(now)}:1`
  return scheduleJob(tx, retentionReviewAutomation(), {
    key,
    runAt: now,
    payload: { key },
    target: { type: 'retention_review_queue' },
    requestId,
  })
}

/** Runs one scan now, outside the schedule (the operator command; the same effect as the job). */
export async function scanNow(tx: Tx, requestId: string): Promise<ScanResult> {
  return runRetentionScan(tx, { requestId, process: `${RETENTION_PROCESS}.command` })
}

const read = {
  actors: ['staff'],
  permission: 'retention.view',
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'none',
  test: TEST,
} as const

const NULLABLE_STRING = { type: ['string', 'null'] } as const
const NULLABLE_INT = { type: ['integer', 'null'] } as const
const SCAN = {
  type: 'string',
  enum: ['scanned', 'start_not_recorded', 'no_period', 'while_referenced', 'not_stored'],
} as const

const CATEGORY = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'configKey', 'scan', 'state', 'years', 'days', 'after', 'version', 'sourceIds', 'entries'],
  properties: {
    id: { type: 'string', enum: [...RETENTION_CATEGORIES] },
    configKey: NULLABLE_STRING,
    scan: SCAN,
    state: { type: ['string', 'null'], enum: ['CONFIGURED', 'NOT_CONFIGURED', null] },
    years: NULLABLE_INT,
    days: NULLABLE_INT,
    after: NULLABLE_STRING,
    version: NULLABLE_INT,
    sourceIds: { type: 'array', items: { type: 'string' } },
    entries: { type: 'integer' },
  },
} as const

const OVERVIEW = {
  type: 'object',
  additionalProperties: false,
  required: [
    'automaticDeletion',
    'awaitingConfirmation',
    'timeZone',
    'categories',
    'lastScanAt',
    'nextScanAt',
    'entries',
  ],
  properties: {
    automaticDeletion: { type: 'boolean', enum: [false] },
    awaitingConfirmation: { type: 'boolean' },
    timeZone: NULLABLE_STRING,
    categories: { type: 'array', items: CATEGORY },
    lastScanAt: NULLABLE_STRING,
    nextScanAt: NULLABLE_STRING,
    entries: { type: 'integer' },
  },
} as const

const HOLD = {
  type: 'object',
  additionalProperties: false,
  required: ['check', 'result'],
  properties: {
    check: { type: 'string', enum: [...HOLD_CHECKS] },
    result: { type: 'string', enum: ['found', 'none_found', 'not_applicable', 'not_recorded'] },
    count: { type: 'integer' },
  },
} as const

const ENTRY = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'seq',
    'category',
    'record',
    'retentionStartedAt',
    'periodEndsAt',
    'years',
    'days',
    'count',
    'policy',
    'holdChecks',
    'holdsFound',
    'openedAt',
    'openedBy',
    'status',
  ],
  properties: {
    id: { type: 'string' },
    seq: { type: 'string' },
    category: { type: 'string', enum: [...PERIOD_CATEGORIES] },
    record: {
      type: 'object',
      additionalProperties: false,
      required: ['type', 'id', 'reference', 'projectId'],
      properties: {
        type: { type: 'string' },
        id: { type: 'string' },
        reference: { type: 'string' },
        projectId: NULLABLE_STRING,
      },
    },
    retentionStartedAt: { type: 'string', format: 'date-time' },
    periodEndsAt: { type: 'string', format: 'date-time' },
    years: NULLABLE_INT,
    days: NULLABLE_INT,
    count: NULLABLE_INT,
    policy: {
      type: 'object',
      additionalProperties: false,
      required: ['key', 'version'],
      properties: { key: { type: 'string' }, version: { type: 'integer' } },
    },
    holdChecks: { type: 'array', items: HOLD },
    holdsFound: { type: 'boolean' },
    openedAt: { type: 'string', format: 'date-time' },
    openedBy: { type: 'string' },
    // TSK-0100: the Owner's latest decision on the entry.
    status: {
      type: 'object',
      additionalProperties: false,
      required: ['state', 'until', 'decidedAt', 'reason'],
      properties: {
        state: { type: 'string', enum: [...ENTRY_STATES] },
        until: { type: ['string', 'null'], format: 'date-time' },
        decidedAt: { type: ['string', 'null'], format: 'date-time' },
        reason: { type: ['string', 'null'] },
      },
    },
  },
} as const

export function retentionModule(): ApiModule {
  const overview: RouteDef = {
    ...read,
    method: 'GET',
    path: '/staff/retention',
    operationId: 'getRetentionOverview',
    summary: 'The retention schedule and the deletion-review queue',
    description:
      'Owner only (ROLE-MATRIX retention.view). The retention schedule per category as configured (retention.*: ' +
      'the period, what starts it, the configuration version and its sources; OWN-DEC-70, OWN-DEC-142), whether ' +
      'the daily job can find the category’s records yet (scanned, start not recorded, no period), the last and ' +
      'next run, and how many entries wait for the Owner’s review. Nothing is deleted automatically; the periods ' +
      'await CPA and attorney confirmation (OQ-RETENTION-REVIEW). TSK-0138 (OWN-DEC-177): the provisional defaults ' +
      'for staff accounts, consent records, settings history (while referenced), technical logs (kept outside the ' +
      'database) and expired sessions and links, with periods in years or calendar days.',
    pagination: false,
    schema: { response: { 200: OVERVIEW } },
    handler: async (ctx: ApiContext) => ({ body: await retentionOverview(ctx.db) }),
  }

  const list: RouteDef = {
    ...read,
    method: 'GET',
    path: '/staff/retention-reviews',
    operationId: 'listRetentionReviews',
    summary: 'Deletion-review entries',
    description:
      'Owner only (ROLE-MATRIX retention.view). The records whose retention period ended, in the order the job ' +
      'opened them, optionally of one category: the record reference (never its personal content), when its ' +
      'period started and ended, the configuration version applied, and the hold checks (open holds on its ' +
      'project; complaints, warranties, disputes, claims, investigations, unfiled tax returns, legal and insurance ' +
      'holds are not recorded by the software yet and are listed as such). Read-only: the record is unchanged ' +
      'until the Owner decides. TSK-0100: each entry carries its status from the Owner’s latest decision (pending, ' +
      'archived, kept longer until a time, deleted); `status` narrows the list to one. TSK-0138 (OWN-DEC-177): an ' +
      'entry may name a disabled staff account, the history of a withdrawn consent, or a batch of expired sessions ' +
      'or links of one kind and month (`count` rows); its period is in years or calendar days.',
    pagination: true,
    schema: {
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: { type: 'string', enum: [...PERIOD_CATEGORIES] },
          status: { type: 'string', enum: [...ENTRY_STATES] },
        },
      },
      response: { 200: pageSchema(ENTRY) },
    },
    handler: async (ctx: ApiContext) => {
      const page = ctx.page as NonNullable<ApiContext['page']>
      const q = ctx.req.query as { category?: string; status?: string }
      return { body: await listReviewEntries(ctx.db, q, page) }
    },
  }

  return { name: 'retention', routes: [overview, list] }
}
