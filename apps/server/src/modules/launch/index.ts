// Launch-phase switches (TSK-0142; HH-OPS-06, OWN-DEC-191, OWN-DEC-212, OWN-DEC-22, RULE-SERVER-AUTHZ).
//   GET /staff/launch        the phase in force, its switches, what they mean here, the allowed moves and the history
//   PUT /staff/launch/phase  the Owner moves the phase, with the typed words, a written approval and a fresh sign-in
// - Every database starts in phase 1 (migration 0076): customer invitations, public submissions and search indexing
//   are off. Nothing moves a phase by itself: only this route does, for the Owner (policy_values.change, and the Owner
//   role checked again), one step forward or back to an earlier phase; the database refuses anything else as well.
// - Each move is a new launch.phase configuration version naming the Owner and the approval they wrote, and an audit
//   event in the same transaction, so the decision is recorded with who, when and why.
// - The switches decide in production only (@handyhub/domain publicEffect): staging stays behind the access gate and
//   out of search whatever its phase, so a phase can be moved there to test the switch without opening anything.
import type { Tx } from '@handyhub/db'
import {
  allowedPhaseMoves,
  isLaunchPhase,
  LAUNCH_PHASES,
  LAUNCH_SWITCHES,
  launchSwitches,
  phaseConfirmation,
  phaseMoveProblem,
  phaseNumber,
  publicEffect,
  type LaunchEnvironment,
  type LaunchPhase,
} from '@handyhub/domain'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { recordPolicyVersion } from '../../platform/config/index.js'
import { FRESH_AUTH_MINUTES } from '../identity/sessions.js'
import { readLaunchPhase, type LaunchGate } from './state.js'

export { LaunchGate, readLaunchPhase } from './state.js'

const TEST = 'test/integration/launch-phase.test.ts'
const SOURCES = ['OWN-DEC-191', 'HH-OPS-06'] as const

const S = { type: 'string' } as const
const NS = { type: ['string', 'null'] } as const
const B = { type: 'boolean' } as const
const PHASE = { type: 'string', enum: [...LAUNCH_PHASES] } as const
const obj = (properties: Record<string, unknown>) =>
  ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties }) as const
const list = (items: unknown) => ({ type: 'array', items }) as const
const PERSON = { anyOf: [{ type: 'null' }, obj({ id: S, name: NS })] } as const

const VIEW = obj({
  environment: { type: 'string', enum: ['local', 'ci', 'staging', 'production'] },
  phase: PHASE,
  phaseNumber: { type: 'integer', enum: [1, 2, 3] },
  version: { type: ['integer', 'null'] },
  changedAt: { type: ['string', 'null'], format: 'date-time' },
  changedBy: PERSON,
  approval: NS,
  switches: list(obj({ id: { type: 'string', enum: [...LAUNCH_SWITCHES] }, on: B })),
  effect: obj({
    submissions: { type: 'string', enum: ['open', 'invitation_only', 'closed', 'testers_only'] },
    indexing: B,
  }),
  moves: list(obj({ to: PHASE, confirmation: S })),
  freshAuthMinutes: { type: 'integer' },
  history: list(
    obj({
      version: { type: 'integer' },
      phase: PHASE,
      changedAt: { type: 'string', format: 'date-time' },
      changedBy: PERSON,
      approval: NS,
    }),
  ),
})

const MOVE_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['phase', 'confirmation', 'reason'],
  properties: {
    phase: PHASE,
    confirmation: { type: 'string', maxLength: 60 },
    // The Owner's recorded approval, in their own words (the written reason policy_values.change needs).
    reason: { type: 'string', minLength: 1, maxLength: 2000 },
  },
} as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** The Owner, checked again by the handler (the policy already decided; RULE-SERVER-AUTHZ, defence in depth). */
function owner(ctx: ApiContext) {
  if (ctx.actor.kind !== 'staff' || !ctx.actor.roles.includes('owner')) throw new ApiError('FORBIDDEN')
  return ctx.actor
}

async function names(db: ApiContext['db'] | Tx, ids: string[]): Promise<Map<string, string | null>> {
  const staff = ids.filter((id) => UUID.test(id))
  if (staff.length === 0) return new Map()
  const rows = await db
    .selectFrom('identity.staff_users')
    .select(['id', 'display_name'])
    .where('id', 'in', staff)
    .execute()
  return new Map(rows.map((r) => [r.id, r.display_name]))
}

const person = (id: string | null, known: Map<string, string | null>) =>
  id !== null && UUID.test(id) ? { id, name: known.get(id) ?? null } : null

export async function launchView(db: ApiContext['db'] | Tx, environment: LaunchEnvironment) {
  const current = await readLaunchPhase(db)
  const rows = await db
    .selectFrom('platform.policy_version')
    .select(['version', 'value', 'created_at', 'changed_by', 'change_reason'])
    .where('key', '=', 'launch.phase')
    .orderBy('version', 'desc')
    .limit(50)
    .execute()
  const known = await names(db, [...rows.map((r) => r.changed_by), current.changedBy ?? ''])
  const switches = launchSwitches(current.phase)
  return {
    environment,
    phase: current.phase,
    phaseNumber: phaseNumber(current.phase),
    version: current.version,
    changedAt: current.changedAt?.toISOString() ?? null,
    changedBy: person(current.changedBy, known),
    approval: current.approval,
    switches: LAUNCH_SWITCHES.map((id) => ({ id, on: switches[id] })),
    effect: publicEffect(environment, current.phase),
    moves: allowedPhaseMoves(current.phase).map((to) => ({ to, confirmation: phaseConfirmation(current.phase, to) })),
    freshAuthMinutes: FRESH_AUTH_MINUTES,
    history: rows.flatMap((r) => {
      const phase = (r.value as { phase?: unknown } | null)?.phase
      return isLaunchPhase(phase)
        ? [
            {
              version: r.version,
              phase,
              changedAt: r.created_at.toISOString(),
              changedBy: person(r.changed_by, known),
              approval: r.change_reason,
            },
          ]
        : []
    }),
  }
}

const field = (f: string, code: string) => ({ field: f, code, message: '' })

export type LaunchDeps = {
  environment: LaunchEnvironment
  /** This process's cached phase for search indexing (app.ts), cleared when the Owner moves the phase. */
  gate?: LaunchGate | null
}

export function launchModule(deps: LaunchDeps): ApiModule {
  const view: RouteDef = {
    method: 'GET',
    path: '/staff/launch',
    operationId: 'getLaunchPhase',
    summary: 'Launch phase and its switches',
    description:
      'The Owner only (dashboard.view, and the Owner role checked again). The launch phase in force (launch.phase: ' +
      'owner_acceptance_testing, invited_customers or public; phase 1 when it cannot be read), the switches it sets ' +
      '(invited customers, public submissions, search indexing: all off in phase 1), what they mean in this ' +
      'environment (outside production nothing is public whatever the phase: testers only, never indexed), the moves ' +
      'the Owner may make with the words to type for each, and the history of phase decisions with who made them and ' +
      'the approval they recorded. ETag: the configuration version. Reads only.',
    actors: ['staff'],
    permission: 'dashboard.view',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    schema: { response: { 200: VIEW } },
    handler: async (ctx) => {
      owner(ctx)
      const body = await launchView(ctx.db, deps.environment)
      return { body, version: body.version ?? 0 }
    },
  }

  const move: RouteDef = {
    method: 'PUT',
    path: '/staff/launch/phase',
    operationId: 'setLaunchPhase',
    summary: 'Move the launch phase (the Owner only)',
    description:
      'The Owner only (policy_values.change: a fresh sign-in within ' +
      `${FRESH_AUTH_MINUTES} minutes, and the Owner role checked again), with If-Match: the configuration version ` +
      'shown, the words to type for this move (confirmation, from getLaunchPhase) and the Owner’s written approval ' +
      '(reason). ' +
      'Moves one step forward (phase 1 to 2 after the Owner approves Owner Acceptance Testing, 2 to 3 after the ' +
      'Owner approves the invited-customer launch) or back to any earlier phase; anything else is VALIDATION_FAILED ' +
      '(SAME_PHASE, SKIPS_A_PHASE, confirmation_mismatch) and changes nothing. Records the next launch.phase version ' +
      'citing OWN-DEC-191 with the approval as its reason, and an audit event with the old and new phase, in one ' +
      'transaction; the database refuses a change that is not the Owner’s, not recorded or not one allowed step. ' +
      'Refusals are audited too.',
    actors: ['staff'],
    permission: 'policy_values.change',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'required',
    rateLimit: 'none',
    freshAuthMinutes: FRESH_AUTH_MINUTES,
    audit: 'launch.change_phase',
    pagination: false,
    test: TEST,
    schema: { body: MOVE_BODY, response: { 200: VIEW } },
    handler: async (ctx) => {
      const actor = owner(ctx)
      const tx = ctx.tx as Tx
      if (!tx) throw new Error('setLaunchPhase runs in its write transaction')
      const body = ctx.req.body as { phase: LaunchPhase; confirmation: string; reason: string }
      const approval = body.reason.trim()
      const target = { type: 'policy_version', id: 'launch.phase' }
      // The same lock recordPolicyVersion takes, so the version compared is the one superseded.
      await sql`SELECT pg_advisory_xact_lock(hashtext(${'policy_version:launch.phase'}))`.execute(tx)
      const before = await readLaunchPhase(tx)
      if (ctx.expectedVersion() !== (before.version ?? 0))
        throw new ApiError('STALE_VERSION', { current: { version: before.version ?? 0 } })
      const refuse = async (code: string, f: string): Promise<never> => {
        await ctx.auditAlways({
          target,
          result: 'denied',
          reason: code,
          summary: { from: before.phase, to: body.phase, environment: deps.environment },
        })
        throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field(f, code)] })
      }
      if (approval === '') await refuse('required', 'body.reason')
      const problem = phaseMoveProblem(before.phase, body.phase)
      if (problem) await refuse(problem, 'body.phase')
      if (body.confirmation !== phaseConfirmation(before.phase, body.phase))
        await refuse('confirmation_mismatch', 'body.confirmation')
      const version = await recordPolicyVersion(tx, {
        key: 'launch.phase',
        value: { phase: body.phase },
        sourceIds: [...SOURCES],
        changedBy: actor.userId,
        reason: approval,
      })
      await ctx.audit({
        target: { ...target, version },
        summary: {
          from: before.phase,
          to: body.phase,
          previousVersion: before.version,
          environment: deps.environment,
          switches: launchSwitches(body.phase),
        },
        reason: approval,
        stepUpUsed: true,
      })
      deps.gate?.invalidate()
      const out = await launchView(tx, deps.environment)
      return { body: out, version }
    },
  }

  return { name: 'launch', routes: [view, move] }
}
