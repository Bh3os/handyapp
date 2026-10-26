// Completion: the walkthrough and the worker's Finished for a job (TSK-0083; HH-QA-01, HH-QA-03, HH-WORK-12, T55,
// ENT-Walkthrough, FACT-SVC-PHOTO-MINIMUM, OWN-DEC-75, OWN-DEC-109, OWN-DEC-64, RULE-SAFETY-GATES).
// - The walkthrough records one outcome in the worker's words: "Everything looks good" (accepted), "Accepted with
//   follow-up items", "I have a concern" (disputed) or "Customer unavailable". Customer unavailable names nobody and is
//   never acceptance; a concern goes to the Owner as a dispute case; acceptance never bypasses the Owner's review.
// - Finished submits the job as "Awaiting quality review", never complete: only when every work package's checklist
//   has every required step completed (a skipped required step blocks, TSK-0075) and has its before and after photos
//   (FACT-SVC-PHOTO-MINIMUM), with no hold open, by a worker who started work on the job.
// PROPOSED (OQ-COMPLETION-DETAILS): one submission per job by any worker who started work on it, a photo counted
// while it is not rejected, and the participant's standing (the customer or an authorized representative).

export const WALKTHROUGH_OUTCOMES = ['accepted', 'accepted_with_follow_up', 'disputed', 'customer_unavailable'] as const
export type WalkthroughOutcome = (typeof WALKTHROUGH_OUTCOMES)[number]

export const PARTICIPANT_ROLES = ['customer', 'authorized_representative'] as const
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number]

/** Customer unavailable (or silence) is never acceptance (OWN-DEC-75). */
export const isAcceptance = (outcome: WalkthroughOutcome): boolean =>
  outcome === 'accepted' || outcome === 'accepted_with_follow_up'

export type WalkthroughInput = {
  readonly outcome: WalkthroughOutcome
  readonly participantName?: string | null
  readonly participantRole?: ParticipantRole | null
  readonly comments?: string | null
}

/** What a walkthrough record lacks: who took part (except when unavailable), and what a concern or follow-up is. */
export function walkthroughProblems(w: WalkthroughInput): string[] {
  const out: string[] = []
  const named = Boolean(w.participantName?.trim())
  if (w.outcome === 'customer_unavailable') {
    if (named || w.participantRole) out.push('NO_PARTICIPANT_WHEN_UNAVAILABLE')
  } else {
    if (!named) out.push('PARTICIPANT_REQUIRED')
    if (!w.participantRole) out.push('PARTICIPANT_ROLE_REQUIRED')
  }
  if ((w.outcome === 'disputed' || w.outcome === 'accepted_with_follow_up') && !w.comments?.trim())
    out.push('COMMENTS_REQUIRED')
  return out
}

export type CompletionFacts = {
  readonly jobState: string
  readonly holdsOpen: number
  readonly workStarted: boolean
  /** TSK-0094: after a pause, the worker started or resumed through the gate since (absent: not paused). */
  readonly resumed?: boolean
  readonly alreadySubmitted: boolean
  readonly packages: readonly {
    readonly code: string
    readonly checklistComplete: boolean
    readonly beforePhotos: number
    readonly afterPhotos: number
  }[]
}

export type CompletionProblem = { readonly code: string; readonly workPackage?: string }

/** Everything that blocks Finished now, each named (HH-QA-01: missing evidence is never shown as a pass). */
export function completionProblems(f: CompletionFacts): CompletionProblem[] {
  const out: CompletionProblem[] = []
  if (f.alreadySubmitted) out.push({ code: 'ALREADY_SUBMITTED' })
  else if (f.jobState !== 'in_progress') out.push({ code: 'JOB_NOT_IN_PROGRESS' })
  if (f.holdsOpen > 0) out.push({ code: 'HOLD_OPEN' })
  if (!f.workStarted) out.push({ code: 'WORK_NOT_STARTED' })
  else if (f.resumed === false) out.push({ code: 'RESUME_REQUIRED' })
  for (const p of f.packages) {
    if (!p.checklistComplete) out.push({ code: 'CHECKLIST_INCOMPLETE', workPackage: p.code })
    if (p.beforePhotos === 0) out.push({ code: 'BEFORE_PHOTO_MISSING', workPackage: p.code })
    if (p.afterPhotos === 0) out.push({ code: 'AFTER_PHOTO_MISSING', workPackage: p.code })
  }
  return out
}
