// The three launch phases and their switches (TSK-0142; HH-OPS-06, OWN-DEC-191, OWN-DEC-212, OWN-DEC-22). Pure rules,
// shared by the server (configuration launch.phase, the request form and search) and the screens:
// - Phase 1, owner_acceptance_testing: the starting state of every database. Customer invitations, public submissions
//   and search indexing are all off. No real customer is invited and nothing is public.
// - Phase 2, invited_customers: only after the Owner's explicit approval of phase 1. Customer access is invitation-only;
//   public submissions and search indexing stay off.
// - Phase 3, public: only after the Owner's explicit approval of phase 2. The public request form and search indexing
//   are on.
// - A phase moves forward one step at a time, and only by the Owner's recorded approval; moving back to an earlier
//   phase (closing again) is always possible, by the Owner, and recorded the same way. Nothing moves a phase by itself.
// - The switches decide in production only. Staging stays behind the access gate and out of search whatever its
//   phase (OWN-DEC-73, RULE-SYNTHETIC-DATA): there a phase can be moved to test the switch, and changes nothing public.

export const LAUNCH_PHASES = ['owner_acceptance_testing', 'invited_customers', 'public'] as const
export type LaunchPhase = (typeof LAUNCH_PHASES)[number]

/** The phase every database starts in, and the one assumed whenever the configured phase cannot be read. */
export const INITIAL_LAUNCH_PHASE: LaunchPhase = 'owner_acceptance_testing'

export const LAUNCH_SWITCHES = ['invited_customers', 'public_submissions', 'search_indexing'] as const
export type LaunchSwitch = (typeof LAUNCH_SWITCHES)[number]

export function isLaunchPhase(value: unknown): value is LaunchPhase {
  return typeof value === 'string' && (LAUNCH_PHASES as readonly string[]).includes(value)
}

/** 1, 2 or 3. */
export function phaseNumber(phase: LaunchPhase): 1 | 2 | 3 {
  return (LAUNCH_PHASES.indexOf(phase) + 1) as 1 | 2 | 3
}

/**
 * The switches a phase sets. invited_customers: invited customers may have access (phase 2; in phase 3 everyone may,
 * so the invitation-only restriction no longer applies and the switch reads off). public_submissions and
 * search_indexing: phase 3 only.
 */
export function launchSwitches(phase: LaunchPhase): Record<LaunchSwitch, boolean> {
  return {
    invited_customers: phase === 'invited_customers',
    public_submissions: phase === 'public',
    search_indexing: phase === 'public',
  }
}

export type PhaseMoveProblem = 'SAME_PHASE' | 'SKIPS_A_PHASE'

/** Whether the Owner may move from one phase to another: forward one step, or back to any earlier phase. */
export function phaseMoveProblem(from: LaunchPhase, to: LaunchPhase): PhaseMoveProblem | null {
  const a = phaseNumber(from)
  const b = phaseNumber(to)
  if (a === b) return 'SAME_PHASE'
  if (b > a + 1) return 'SKIPS_A_PHASE'
  return null
}

/** The phases the Owner may move to from this one, in order. */
export function allowedPhaseMoves(from: LaunchPhase): LaunchPhase[] {
  return LAUNCH_PHASES.filter((to) => phaseMoveProblem(from, to) === null)
}

/**
 * The words the Owner types to confirm a move (the move's own phrase, so a confirmation for one move never confirms
 * another). PROPOSED wording: no owner decision words it.
 */
export function phaseConfirmation(from: LaunchPhase, to: LaunchPhase): string {
  if (phaseNumber(to) < phaseNumber(from)) return `RETURN TO PHASE ${phaseNumber(to)}`
  return `APPROVE PHASE ${phaseNumber(to)}`
}

export type LaunchEnvironment = 'local' | 'ci' | 'staging' | 'production'

/**
 * What the phase means for the public in this environment. Outside production nothing is public, whatever the phase:
 * the access gate (staging) or an isolated test system (local, ci) keeps every visitor a named tester, and every
 * response is noindex. In production the phase decides; a phase that cannot be read is phase 1 (fail closed).
 */
export function publicEffect(
  environment: LaunchEnvironment,
  phase: LaunchPhase,
): { submissions: 'open' | 'invitation_only' | 'closed' | 'testers_only'; indexing: boolean } {
  if (environment !== 'production') return { submissions: 'testers_only', indexing: false }
  if (phase === 'public') return { submissions: 'open', indexing: true }
  if (phase === 'invited_customers') return { submissions: 'invitation_only', indexing: false }
  return { submissions: 'closed', indexing: false }
}
