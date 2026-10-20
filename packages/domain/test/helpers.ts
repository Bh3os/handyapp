// Test helpers for exhaustive transition tables (TSK-0009).
import type { Machine } from '../src/index.js'

/** True when `to` can be reached from `from` without passing through any state in `avoid`. */
export function reachableAvoiding<S extends string>(
  m: Machine<S, string, never>,
  from: S,
  to: S,
  avoid: readonly S[],
): boolean {
  const seen = new Set<S>([from])
  const queue: S[] = [from]
  while (queue.length > 0) {
    const s = queue.shift() as S
    if (s === to) return true
    for (const t of m.transitions) {
      if (t.from.includes(s) && !seen.has(t.to) && (t.to === to || !avoid.includes(t.to))) {
        seen.add(t.to)
        queue.push(t.to)
      }
    }
  }
  return false
}

/** Every (state, event) pair of a machine, with whether the table allows it. */
export function pairs<S extends string, E extends string>(m: Machine<S, E, never>) {
  const events = [...new Set(m.transitions.map((t) => t.event))]
  return m.states.flatMap((state) =>
    events.map((event) => ({
      state,
      event,
      transition: m.transitions.find((t) => t.event === event && t.from.includes(state)),
    })),
  )
}
