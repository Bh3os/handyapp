// Transition engine (HH-STATE-01, HH-STATE-02, HH-DATA-05; TSK-0009). Every state change is a named event of one
// machine: the event lists the states it may leave, the one state it enters, the actor kinds that may send it, its
// guards and its declared side effects. There is no generic "set status": the only way to a new state is an event,
// and its target is fixed by the table, never chosen by the caller. A refusal changes nothing and returns a stable
// code with a plain reason naming every unmet requirement.
//
// One machine covers one state dimension of one entity. A job's operational, visit, hold, quality and financial
// states are separate machines (HH-DATA-05), so an event of one dimension can never move another.
//
// Authorization (role and record scope) is decided by @handyhub/policy before an event is applied; the actor kinds
// here are a second, coarse check that a customer or the system never sends a staff-only event.

/** Who sends an event: a staff user, the verified customer, or the system (automation, approval transaction). */
export type ActorKind = 'staff' | 'customer' | 'system'

/** One unmet requirement: a stable code and a plain sentence that names what is missing. */
export type Problem = { readonly code: string; readonly message: string }

/** A guard returns null when its requirement holds, or the problem when it does not. */
export type Guard<F> = (facts: F, now: Date) => Problem | null

export type Transition<S extends string, E extends string, F> = {
  readonly event: E
  readonly from: readonly S[]
  readonly to: S
  readonly actors: readonly ActorKind[]
  readonly guards?: readonly Guard<F>[]
  /** Side effects the module performs in the same transaction (outbox events, tasks), declared by name. */
  readonly effects?: readonly string[]
}

export type Machine<S extends string, E extends string, F> = {
  readonly entity: string
  /** The state dimension this machine covers ("lifecycle", "operational", "financial", ...). */
  readonly dimension: string
  readonly states: readonly S[]
  readonly initial: S
  /** Final states: no event leaves them. */
  readonly final: readonly S[]
  readonly transitions: readonly Transition<S, E, F>[]
  /** True while the table is a PROPOSED model, not one the owner decided. */
  readonly proposed?: boolean
}

export type StateOf<M> = M extends { readonly states: readonly (infer S)[] } ? S : never
export type EventOf<M> = M extends { readonly transitions: readonly { readonly event: infer E }[] } ? E : never
export type FactsOf<M> = M extends { readonly transitions: readonly { readonly guards?: readonly Guard<infer F>[] }[] }
  ? F
  : never

/** The current record as the server read it, under its row lock. */
export type EntityState<S extends string> = { readonly state: S; readonly version: number }

export type TransitionContext<F> = {
  readonly actor: ActorKind
  /** The version the caller last saw; a different current version is refused as stale. */
  readonly expectedVersion: number
  readonly now: Date
  readonly facts: F
}

export type RefusalCode =
  'UNKNOWN_STATE' | 'UNKNOWN_EVENT' | 'INVALID_TRANSITION' | 'ACTOR_NOT_ALLOWED' | 'STALE_VERSION' | 'GUARD_FAILED'

export type TransitionResult<S extends string, E extends string> =
  | {
      readonly ok: true
      readonly entity: string
      readonly dimension: string
      readonly event: E
      readonly from: S
      readonly to: S
      readonly version: number
      readonly effects: readonly string[]
    }
  | {
      readonly ok: false
      readonly code: RefusalCode
      readonly message: string
      /** Every unmet requirement (for GUARD_FAILED), so the user can fix them all and retry. */
      readonly problems: readonly Problem[]
    }

export class MachineDefinitionError extends Error {}

/**
 * Validates a machine table once, at module load: known states, a known initial state, no event leaving a final
 * state, one target per (event, state) pair, and every state reachable from the initial state.
 */
export function defineMachine<const S extends string, const E extends string, F>(
  m: Machine<S, E, F>,
): Machine<S, E, F> {
  const states = new Set<string>(m.states)
  const fail = (msg: string): never => {
    throw new MachineDefinitionError(`${m.entity}.${m.dimension}: ${msg}`)
  }
  if (states.size !== m.states.length) fail('duplicate state')
  if (!states.has(m.initial)) fail(`unknown initial state ${m.initial}`)
  for (const s of m.final) if (!states.has(s)) fail(`unknown final state ${s}`)
  const seen = new Set<string>()
  for (const t of m.transitions) {
    if (t.from.length === 0) fail(`${t.event} leaves no state`)
    if (t.actors.length === 0) fail(`${t.event} has no actor`)
    if (!states.has(t.to)) fail(`${t.event} enters unknown state ${t.to}`)
    for (const s of t.from) {
      if (!states.has(s)) fail(`${t.event} leaves unknown state ${s}`)
      if (m.final.includes(s)) fail(`${t.event} leaves final state ${s}`)
      const key = `${t.event}|${s}`
      if (seen.has(key)) fail(`${t.event} from ${s} is defined twice`)
      seen.add(key)
    }
  }
  const reached = new Set<string>([m.initial])
  let grew = true
  while (grew) {
    grew = false
    for (const t of m.transitions) {
      if (!reached.has(t.to) && t.from.some((s) => reached.has(s))) {
        reached.add(t.to)
        grew = true
      }
    }
  }
  for (const s of m.states) if (!reached.has(s)) fail(`state ${s} is unreachable`)
  return m
}

/** The events that may leave a state (for menus; the server still applies and checks each). */
export function eventsFrom<S extends string, E extends string, F>(m: Machine<S, E, F>, state: S): E[] {
  return m.transitions.filter((t) => t.from.includes(state)).map((t) => t.event)
}

/**
 * Applies one named event to the current record. Pure: the caller persists the result, with the audit entry and the
 * declared effects, in the same transaction, using `version` as the new row version.
 */
export function transition<S extends string, E extends string, F>(
  m: Machine<S, E, F>,
  current: EntityState<S>,
  event: E,
  ctx: TransitionContext<F>,
): TransitionResult<S, E> {
  const refuse = (code: RefusalCode, message: string, problems: readonly Problem[] = []) =>
    ({ ok: false, code, message, problems }) as const
  if (!m.states.includes(current.state)) {
    return refuse('UNKNOWN_STATE', `${label(m)} has no state "${String(current.state)}".`)
  }
  const candidates = m.transitions.filter((t) => t.event === event)
  if (candidates.length === 0) return refuse('UNKNOWN_EVENT', `${label(m)} has no event "${String(event)}".`)
  const t = candidates.find((c) => c.from.includes(current.state))
  if (!t) {
    const allowed = candidates.flatMap((c) => c.from).join(', ')
    return refuse(
      'INVALID_TRANSITION',
      `${label(m)}: "${event}" is not allowed from "${current.state}"; it is allowed only from: ${allowed}.`,
    )
  }
  if (!t.actors.includes(ctx.actor)) {
    return refuse('ACTOR_NOT_ALLOWED', `${label(m)}: "${event}" cannot be sent by ${ctx.actor}.`)
  }
  if (ctx.expectedVersion !== current.version) {
    return refuse('STALE_VERSION', `${label(m)} changed since you loaded it; reload and try again.`)
  }
  const problems = (t.guards ?? []).map((g) => g(ctx.facts, ctx.now)).filter((p): p is Problem => p !== null)
  if (problems.length > 0) {
    return refuse(
      'GUARD_FAILED',
      `${label(m)}: "${event}" needs: ${problems.map((p) => p.message).join(' ')}`,
      problems,
    )
  }
  return {
    ok: true,
    entity: m.entity,
    dimension: m.dimension,
    event,
    from: current.state,
    to: t.to,
    version: current.version + 1,
    effects: t.effects ?? [],
  }
}

function label(m: { readonly entity: string; readonly dimension: string }): string {
  return m.dimension === 'lifecycle' ? m.entity : `${m.entity} (${m.dimension})`
}
