// Launch phases and their switches (TSK-0142; HH-OPS-06, OWN-DEC-191): every switch starts off, a phase moves forward
// one step at a time and back to any earlier phase, and outside production nothing is public whatever the phase.
import { describe, expect, it } from 'vitest'
import {
  allowedPhaseMoves,
  INITIAL_LAUNCH_PHASE,
  isLaunchPhase,
  LAUNCH_PHASES,
  launchSwitches,
  phaseConfirmation,
  phaseMoveProblem,
  publicEffect,
} from '../src/launch.js'

describe('launch phases (TSK-0142, HH-OPS-06)', () => {
  it('[HH-OPS-06] phase 1 is the start, and every switch is off there', () => {
    expect(INITIAL_LAUNCH_PHASE).toBe('owner_acceptance_testing')
    expect(launchSwitches(INITIAL_LAUNCH_PHASE)).toEqual({
      invited_customers: false,
      public_submissions: false,
      search_indexing: false,
    })
    expect(launchSwitches('invited_customers')).toEqual({
      invited_customers: true,
      public_submissions: false,
      search_indexing: false,
    })
    expect(launchSwitches('public')).toEqual({
      invited_customers: false,
      public_submissions: true,
      search_indexing: true,
    })
  })

  it('[HH-OPS-06] forward one step at a time, back to any earlier phase, never to the same phase', () => {
    expect(phaseMoveProblem('owner_acceptance_testing', 'invited_customers')).toBeNull()
    expect(phaseMoveProblem('owner_acceptance_testing', 'public')).toBe('SKIPS_A_PHASE')
    expect(phaseMoveProblem('invited_customers', 'public')).toBeNull()
    expect(phaseMoveProblem('public', 'owner_acceptance_testing')).toBeNull()
    expect(phaseMoveProblem('public', 'public')).toBe('SAME_PHASE')
    expect(allowedPhaseMoves('owner_acceptance_testing')).toEqual(['invited_customers'])
    expect(allowedPhaseMoves('invited_customers')).toEqual(['owner_acceptance_testing', 'public'])
    expect(allowedPhaseMoves('public')).toEqual(['owner_acceptance_testing', 'invited_customers'])
  })

  it('[HH-OPS-06] each move has its own confirmation words', () => {
    expect(phaseConfirmation('owner_acceptance_testing', 'invited_customers')).toBe('APPROVE PHASE 2')
    expect(phaseConfirmation('invited_customers', 'public')).toBe('APPROVE PHASE 3')
    expect(phaseConfirmation('public', 'owner_acceptance_testing')).toBe('RETURN TO PHASE 1')
  })

  it('[HH-OPS-06] outside production nothing is public; in production the phase decides', () => {
    for (const env of ['local', 'ci', 'staging'] as const)
      for (const phase of LAUNCH_PHASES)
        expect(publicEffect(env, phase)).toEqual({ submissions: 'testers_only', indexing: false })
    expect(publicEffect('production', 'owner_acceptance_testing')).toEqual({ submissions: 'closed', indexing: false })
    expect(publicEffect('production', 'invited_customers')).toEqual({
      submissions: 'invitation_only',
      indexing: false,
    })
    expect(publicEffect('production', 'public')).toEqual({ submissions: 'open', indexing: true })
    expect(isLaunchPhase('public')).toBe(true)
    expect(isLaunchPhase('launched')).toBe(false)
  })
})
