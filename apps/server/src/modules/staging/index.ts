// Staging Tools: Test Data Management (TSK-0141; HH-OPS-05, OWN-DEC-191, S11, RULE-SYNTHETIC-DATA, RULE-SERVER-AUTHZ,
// T26). Owner Dashboard -> Staging Tools -> Test Data Management: "Reset Test Data" and "Reset & Create Fresh Test
// Data", in a positively identified staging or isolated test environment only.
// - Never in production: apiModules registers this module only when the process identifies itself as staging, local
//   or ci with STAGING_TOOLS=on (and, in staging, the access gate); STAGING_TOOLS is refused at boot in production,
//   and this factory refuses a production environment. Outside that the routes do not exist (404 like any unknown
//   path). The contract (openapi.json) lists them as staging-only.
// - On every call the database must also identify itself (migration 0069: a staging, local or ci mark and never a
//   production mark); the reset's own run row is refused by the database otherwise.
// - Owner only, on the server: the policy decides (dashboard.view to read; records.delete to reset or designate, the
//   Owner's "Delete action" row, PROPOSED mapping: the matrix has no row for test data) and the handler checks the
//   Owner role itself. The reset needs a password entered within FRESH_AUTH_MINUTES and the typed words
//   RESET TEST DATA. Every attempt, refused or not, is in the append-only audit log; every run is in the protected
//   staging trail (staging.reset_runs).
import type { Db } from '@handyhub/db'
import { databaseIdentity, isStagingDatabaseName } from '@handyhub/db'
import type { StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { createHash } from 'node:crypto'
import { ApiError, type FieldError } from '../../api/errors.js'
import { actorKey, readIdempotencyKey, requestHash } from '../../api/idempotency.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import type { StagingCheck } from '../../config.js'
import { currentContext } from '../../platform/request-context.js'
import type { CodeKeySettings } from '../identity/index.js'
import { FRESH_AUTH_MINUTES } from '../identity/sessions.js'
import { createFreshTestData, NOT_AVAILABLE, recordSeeding, SCENARIOS, type ScenarioOutcome } from './fresh-data.js'
import {
  CONFIRMATION_PHRASE,
  findCompletedRun,
  PRESERVED,
  previewReset,
  REMOVED_CATEGORIES,
  resetRunning,
  runReset,
  withResetLock,
  type ResetCheck,
} from './reset.js'

export { CLEARED_CATEGORIES, CLEARED_TABLES, CONFIRMATION_PHRASE, PRESERVED, SELECTIVE_TABLES } from './reset.js'
export { SCENARIOS, NOT_AVAILABLE } from './fresh-data.js'

export type StagingEnvironment = 'local' | 'ci' | 'staging'

export type StagingDeps = {
  /** The environment this process identified itself as (never production). */
  environment: StagingEnvironment
  /** The process checks (stagingToolsEnvironment): each must pass for a write. */
  checks: readonly StagingCheck[]
  /** The one-time-code key: reusable accounts sign in with codes; fresh registered customers are enrolled with it. */
  codeKey: CodeKeySettings
  /** Every other module's routes, which the fresh test data goes through (invoke.ts). */
  routes: readonly RouteDef[]
}

const TEST = 'test/integration/staging-reset.test.ts'

const CHECK_IDS = [
  'environment',
  'flag',
  'access_gate',
  'database_host',
  'database_marked',
  'database_never_production',
  'database_name',
] as const
const RESET_CHECK_IDS = [
  'cleared_tables_empty',
  'test_accounts_removed',
  'nothing_left_to_send',
  'preserved_unchanged',
  'reusable_accounts_intact',
  'relationships_intact',
  'reusable_sign_in',
] as const satisfies readonly ResetCheck['id'][]

const S = { type: 'string' } as const
const I = { type: 'integer' } as const
const B = { type: 'boolean' } as const
const NS = { type: ['string', 'null'] } as const
const DATE = { type: 'string', format: 'date-time' } as const
const NDATE = { type: ['string', 'null'], format: 'date-time' } as const
const obj = (properties: Record<string, unknown>) =>
  ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties }) as const
const list = (items: unknown) => ({ type: 'array', items }) as const

const REMOVED = list(obj({ id: { type: 'string', enum: [...REMOVED_CATEGORIES] }, count: I }))
const KEPT = list(obj({ id: { type: 'string', enum: Object.keys(PRESERVED) }, count: I }))
const RESET_CHECKS = list(obj({ id: { type: 'string', enum: [...RESET_CHECK_IDS] }, ok: B, details: list(S) }))
const ERRORS = list(obj({ code: S, detail: NS }))
const OUTCOMES = list(
  obj({
    id: { type: 'string', enum: [...SCENARIOS] },
    state: { type: 'string', enum: ['created', 'blocked', 'not_available', 'failed'] },
    references: list(S),
    step: NS,
    codes: list(S),
    task: NS,
  }),
)
const SEEDING = {
  anyOf: [
    { type: 'null' },
    obj({ state: { type: 'string', enum: ['completed', 'partial', 'failed'] }, outcomes: OUTCOMES }),
  ],
} as const
const RUN = obj({
  id: S,
  seq: S,
  mode: { type: 'string', enum: ['reset', 'reset_and_seed'] },
  state: { type: 'string', enum: ['running', 'completed', 'failed'] },
  requestedAt: DATE,
  finishedAt: NDATE,
  requestedBy: obj({ id: S, name: NS }),
  removedTotal: I,
  checks: RESET_CHECKS,
  errors: ERRORS,
  seeding: SEEDING,
})

const STATUS_SCHEMA = obj({
  environment: { type: 'string', enum: ['local', 'ci', 'staging'] },
  identified: B,
  checks: list(obj({ id: { type: 'string', enum: [...CHECK_IDS] }, ok: B })),
  running: B,
  confirmationPhrase: { type: 'string', enum: [CONFIRMATION_PHRASE] },
  freshAuthMinutes: I,
  removed: REMOVED,
  total: I,
  preserved: KEPT,
  reusableAccounts: list(obj({ accountId: S, email: NS, phone: NS, state: S, designatedAt: DATE })),
  freshData: list(obj({ id: { type: 'string', enum: [...SCENARIOS] }, available: B, task: NS })),
  runs: list(RUN),
})

const RESET_RESULT = obj({
  runId: S,
  seq: S,
  mode: { type: 'string', enum: ['reset', 'reset_and_seed'] },
  state: { type: 'string', enum: ['completed', 'failed'] },
  removed: REMOVED,
  preservedBefore: KEPT,
  preservedAfter: KEPT,
  checks: RESET_CHECKS,
  errors: ERRORS,
  storedFileJobs: I,
  seeding: SEEDING,
})

type Check = { id: (typeof CHECK_IDS)[number]; ok: boolean }

/**
 * The process checks with the database's own (read now), all of which must pass: marked as a test database and never
 * as production, and in staging the staging database itself (STAGING_DATABASE_PATTERN, render.yaml). The database
 * applies the same name rule to the run row (migration 0069), so this check is not the only one.
 */
export async function stagingIdentification(
  deps: Pick<StagingDeps, 'environment' | 'checks'>,
  db: Db,
): Promise<{ identified: boolean; checks: Check[] }> {
  const identity = await databaseIdentity(db)
  const checks: Check[] = [
    ...deps.checks.map((c) => ({ id: c.id, ok: c.ok })),
    { id: 'database_marked', ok: identity.marks.some((m) => m !== 'production') },
    { id: 'database_never_production', ok: !identity.servedProduction },
    { id: 'database_name', ok: deps.environment !== 'staging' || isStagingDatabaseName(identity.database) },
  ]
  return { identified: identity.identified && checks.every((c) => c.ok), checks }
}
const identification = stagingIdentification

/** The Owner, checked again by the handler (the policy already decided; RULE-SERVER-AUTHZ, defence in depth). */
function owner(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff' || !ctx.actor.roles.includes('owner')) throw new ApiError('FORBIDDEN')
  return ctx.actor
}

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })

type RunRow = {
  id: string
  seq: string
  mode: string
  state: string
  requested_at: Date
  finished_at: Date | null
  requested_by: string
  name: string | null
  removed: unknown
  checks: unknown
  errors: unknown
  seeding_state: string | null
  outcomes: unknown
}

function removedTotal(removed: unknown): number {
  const r = removed as { tables?: Record<string, number>; selective?: Record<string, number> } | null
  const sum = (o: Record<string, number> | undefined) => Object.values(o ?? {}).reduce((s, n) => s + Number(n), 0)
  return sum(r?.tables) + sum(r?.selective)
}

async function recentRuns(db: Db) {
  const { rows } = await sql<RunRow>`SELECT r.id, r.seq::text AS seq, r.mode, r.state, r.requested_at, r.finished_at,
      r.requested_by, u.display_name AS name, r.removed, r.checks, r.errors, s.state AS seeding_state, s.outcomes
    FROM staging.reset_runs r
    JOIN identity.staff_users u ON u.id = r.requested_by
    LEFT JOIN staging.test_data_seedings s ON s.run_id = r.id
    ORDER BY r.seq DESC LIMIT 5`.execute(db)
  return rows.map((r) => ({
    id: r.id,
    seq: r.seq,
    mode: r.mode,
    state: r.state,
    requestedAt: r.requested_at.toISOString(),
    finishedAt: r.finished_at?.toISOString() ?? null,
    requestedBy: { id: r.requested_by, name: r.name },
    removedTotal: removedTotal(r.removed),
    checks: (r.checks as ResetCheck[]) ?? [],
    errors: ((r.errors as { code: string; detail?: string }[]) ?? []).map((e) => ({
      code: e.code,
      detail: e.detail ?? null,
    })),
    seeding: r.seeding_state ? { state: r.seeding_state, outcomes: r.outcomes as ScenarioOutcome[] } : null,
  }))
}

export function stagingModule(deps: StagingDeps): ApiModule {
  if ((deps.environment as string) === 'production')
    throw new Error('Staging Tools never exist in production (TSK-0141, OWN-DEC-191)')

  const status: RouteDef = {
    method: 'GET',
    path: '/staff/staging/test-data',
    operationId: 'getStagingTestData',
    summary: 'Staging Tools: Test Data Management',
    description:
      'STAGING ONLY: registered only in a staging or isolated local or ci test environment with STAGING_TOOLS=on ' +
      '(never in production, where the path does not exist). Owner only (dashboard.view, and the Owner role checked ' +
      'again). The environment checks (environment, flag, access gate in staging, the database marked as a test ' +
      'database and never as production), whether a reset is running, what a reset would remove now by category ' +
      'with counts (stored files counted separately), what it keeps with counts, the designated reusable test ' +
      'accounts, the fresh-data scenarios (available, or not yet with the task that builds them), the words to ' +
      'type and the latest five runs of the protected staging trail. Counts and codes only. Reads only.',
    actors: ['staff'],
    permission: 'dashboard.view',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    schema: { response: { 200: STATUS_SCHEMA } },
    handler: async (ctx) => {
      owner(ctx)
      const id = await identification(deps, ctx.db)
      const preview = await previewReset(ctx.db)
      const accounts = await ctx.db
        .selectFrom('staging.reusable_test_accounts as r')
        .innerJoin('identity.customer_accounts as a', 'a.id', 'r.account_id')
        .select(['a.id', 'a.sign_in_email', 'a.sign_in_phone', 'a.state', 'r.designated_at'])
        .orderBy('r.designated_at')
        .execute()
      return {
        body: {
          environment: deps.environment,
          identified: id.identified,
          checks: id.checks,
          running: await resetRunning(ctx.db),
          confirmationPhrase: CONFIRMATION_PHRASE,
          freshAuthMinutes: FRESH_AUTH_MINUTES,
          removed: preview.removed,
          total: preview.total,
          preserved: preview.preserved,
          reusableAccounts: accounts.map((a) => ({
            accountId: a.id,
            email: a.sign_in_email,
            phone: a.sign_in_phone,
            state: a.state,
            designatedAt: a.designated_at.toISOString(),
          })),
          freshData: SCENARIOS.map((s) => ({ id: s, available: !NOT_AVAILABLE[s], task: NOT_AVAILABLE[s] ?? null })),
          runs: await recentRuns(ctx.db),
        },
      }
    },
  }

  const reset: RouteDef = {
    method: 'POST',
    path: '/staff/staging/test-data/reset',
    operationId: 'resetStagingTestData',
    summary: 'Reset Test Data, or Reset & Create Fresh Test Data',
    description:
      'STAGING ONLY (see getStagingTestData; never registered in production). Owner only (records.delete, PROPOSED ' +
      'mapping, and the Owner role checked again) with a password entered within the fresh sign-in window and the ' +
      'typed words RESET TEST DATA (confirmation; anything else is VALIDATION_FAILED and changes nothing). Refused ' +
      'with CONFLICT STAGING_NOT_IDENTIFIED unless every environment check passes and the database itself is a ' +
      'marked test database that never served production (in staging: the staging database itself; in local or ' +
      'ci: a database on this machine), with CONFLICT RESET_RUNNING while another reset holds the lock, and with ' +
      'CONFLICT RESET_SENDS_IN_FLIGHT while a message job is being sent (retry when it has finished). One transaction removes every test record (customers except designated reusable test ' +
      'accounts, requests, estimates and revisions, appointments and bookings, jobs, assignments and visits, ' +
      'payments, deposits and receipts, conversations and notifications, photos and documents, pending messages ' +
      'and scheduled reminders, customer sessions and project links, queue and privacy workflow records) and keeps ' +
      'staff accounts and roles, the service catalog, SOPs, configuration, message templates, ZIP coverage, ' +
      'equipment and working hours, the audit log and the staging trail; stored files are removed by a job after ' +
      'the commit (those removal jobs, and pending ones from before, are kept). The outcome is checked before the ' +
      'commit (cleared, nothing left to send, kept records unchanged, relationships, reusable accounts) and audited ' +
      'in the same transaction; any failure rolls everything back and is recorded as a failed run. A repeated reset ' +
      'is safe; a retry with the same Idempotency-Key after a committed reset is answered with that run. freshData: afterwards the fictional scenarios are created through the server’s own ' +
      'routes, each reported as created, blocked (with the refusal codes) or not available yet. Counts, codes and ' +
      'public references only.',
    actors: ['staff'],
    permission: 'records.delete',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    freshAuthMinutes: FRESH_AUTH_MINUTES,
    audit: 'staging.reset_test_data',
    pagination: false,
    test: TEST,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['confirmation', 'freshData'],
        properties: { confirmation: { type: 'string', maxLength: 60 }, freshData: B },
      },
      response: { 200: RESET_RESULT },
    },
    handler: async (ctx) => {
      const actor = owner(ctx)
      const body = ctx.req.body as { confirmation: string; freshData: boolean }
      const mode = body.freshData ? 'reset_and_seed' : 'reset'
      const target = { type: 'staging_test_data' }
      const refuse = async (error: ApiError, reason: string): Promise<never> => {
        await ctx.auditAlways({ target, result: 'denied', reason, summary: { mode } })
        throw error
      }
      if (body.confirmation !== CONFIRMATION_PHRASE)
        await refuse(
          new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.confirmation', 'confirmation_mismatch')] }),
          'confirmation_mismatch',
        )
      const id = await identification(deps, ctx.db)
      if (!id.identified)
        await refuse(
          new ApiError('CONFLICT', {
            fieldErrors: [
              field('environment', 'STAGING_NOT_IDENTIFIED'),
              ...id.checks.filter((c) => !c.ok).map((c) => field(`environment.${c.id}`, 'CHECK_FAILED')),
            ],
          }),
          'staging_not_identified',
        )
      const requestId = currentContext()?.requestId ?? ctx.req.id
      // The run names this request's idempotency scope: a retry after a committed reset whose reply was lost (its
      // idempotency record rolled back with the route) is answered with that run, never a second reset.
      const idempotency = {
        scope: createHash('sha256')
          .update(`${actorKey(actor)}|resetStagingTestData|${readIdempotencyKey(ctx.req.headers['idempotency-key'])}`)
          .digest('hex'),
        requestHash: requestHash({ params: ctx.req.params, query: ctx.req.query, body: ctx.req.body }),
      }
      let result
      try {
        result = await withResetLock(ctx.db, async (conn) => {
          const done = await findCompletedRun(conn, idempotency.scope)
          if (done) {
            if (done.requestHash !== idempotency.requestHash) throw new ApiError('IDEMPOTENCY_CONFLICT')
            const seeded = await conn
              .selectFrom('staging.test_data_seedings')
              .select(['state', 'outcomes'])
              .where('run_id', '=', done.outcome.runId)
              .executeTakeFirst()
            const seeding = seeded ? { state: seeded.state, outcomes: seeded.outcomes as ScenarioOutcome[] } : null
            return { outcome: done.outcome, seeding, replayed: true }
          }
          const outcome = await runReset(conn, {
            mode,
            requestedBy: actor.userId,
            actor: { kind: 'staff', id: actor.userId, roles: actor.roles },
            environment: deps.environment,
            requestId,
            codeKey: deps.codeKey,
            idempotency,
          })
          if (outcome.state !== 'completed' || !body.freshData) return { outcome, seeding: null, replayed: false }
          const outcomes = await createFreshTestData({
            db: ctx.db,
            routes: deps.routes,
            owner: { actor, authenticatedAt: ctx.authenticatedAt },
            codeKey: deps.codeKey,
            requestId,
            runId: outcome.runId,
          })
          const state = await recordSeeding(ctx.db, outcome.runId, outcomes, requestId)
          return { outcome, seeding: { state, outcomes }, replayed: false }
        })
      } catch (err) {
        if (err instanceof ApiError) return refuse(err, err.options.fieldErrors?.[0]?.code ?? err.code)
        throw err
      }
      const { outcome, seeding, replayed } = result
      // The reset itself is audited in its own transaction (staging.reset_test_data, reset.ts); this event records the
      // reply: the run answered, the fresh data's outcome, and whether it repeated an earlier run's reply.
      await ctx.audit({
        action: 'staging.reset_answered',
        target: { type: 'staging_reset_run', id: outcome.runId },
        result: outcome.state === 'completed' ? 'succeeded' : 'failed',
        summary: { mode, state: outcome.state, seeding: seeding?.state ?? null, replayed },
      })
      return {
        body: {
          runId: outcome.runId,
          seq: outcome.seq,
          mode,
          state: outcome.state,
          removed: outcome.removed,
          preservedBefore: outcome.preservedBefore,
          preservedAfter: outcome.preservedAfter,
          checks: outcome.checks,
          errors: outcome.errors.map((e) => ({ code: e.code, detail: e.detail ?? null })),
          storedFileJobs: outcome.storedFileJobs,
          seeding,
        },
      }
    },
  }

  const designate: RouteDef = {
    method: 'POST',
    path: '/staff/staging/test-data/reusable-accounts',
    operationId: 'setReusableTestAccount',
    summary: 'Designate or release a reusable test account',
    description:
      'STAGING ONLY (see getStagingTestData; never registered in production). Owner only (records.delete, PROPOSED ' +
      'mapping). Names an active customer account by its sign-in email: reusable true keeps it (with its customer ' +
      'and contact records) through every later reset so it can sign in again; false lets the next reset remove it. ' +
      'The database must be a marked test database (CONFLICT STAGING_NOT_IDENTIFIED otherwise); an email that names ' +
      'no active account is NOT_FOUND.',
    actors: ['staff'],
    permission: 'records.delete',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'staging.designate_test_account',
    pagination: false,
    test: TEST,
    schema: {
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['email', 'reusable'],
        properties: { email: { type: 'string', minLength: 3, maxLength: 320 }, reusable: B },
      },
      response: { 200: obj({ accountId: S, reusable: B }) },
    },
    handler: async (ctx) => {
      const actor = owner(ctx)
      const tx = ctx.tx
      if (!tx) throw new Error('setReusableTestAccount runs in its write transaction')
      const id = await identification(deps, ctx.db)
      if (!id.identified)
        throw new ApiError('CONFLICT', { fieldErrors: [field('environment', 'STAGING_NOT_IDENTIFIED')] })
      const body = ctx.req.body as { email: string; reusable: boolean }
      const account = await tx
        .selectFrom('identity.customer_accounts')
        .select('id')
        .where('sign_in_email', '=', body.email.trim().toLowerCase())
        .where('state', '=', 'active')
        .executeTakeFirst()
      if (!account) throw new ApiError('NOT_FOUND')
      if (body.reusable)
        await tx
          .insertInto('staging.reusable_test_accounts')
          .values({ account_id: account.id, designated_by: actor.userId })
          .onConflict((oc) => oc.column('account_id').doNothing())
          .execute()
      else await tx.deleteFrom('staging.reusable_test_accounts').where('account_id', '=', account.id).execute()
      await ctx.audit({
        target: { type: 'customer_account', id: account.id },
        summary: { reusable: body.reusable },
      })
      return { body: { accountId: account.id, reusable: body.reusable } }
    },
  }

  return { name: 'staging', routes: [status, reset, designate] }
}
