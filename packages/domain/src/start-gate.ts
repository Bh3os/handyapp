// The Start Work gate and its three administrative exceptions (TSK-0073, TSK-0074; HH-WORK-01, HH-WORK-02,
// HH-WORK-03, HH-WORK-04, HH-WORK-12, HH-PKT-04, HH-PKT-06, HH-OFF-04, T40, T45, T46, ENT-StartGateEvaluation,
// ENT-GateException, ENT-Hold, OWN-DEC-68, OWN-DEC-79, OWN-DEC-82, OWN-DEC-121, OWN-DEC-137, OWN-DEC-195, OWN-DEC-196,
// RULE-SAFETY-GATES, RULE-HUMAN-REVIEW).
// - The gate is the ten prerequisites of HH-WORK-01, in that order. The server reads each one from its own records and
//   names every missing item (never only the first), with the resolution owner of each. This module only decides: it
//   maps the missing codes the server found to items, outcome and the exceptions that may cover them.
// - Outcome: `blocked` when anything blocks (a hold, an unavailable critical resource, a missing SOP, the deposit, an
//   assignment problem), else `requires_review` when something waits for the Owner's review (an SOP pending competent
//   review in production, a Spanish safety text not released as AI-reviewed, a site difference), else
//   `needs_attention` when only the worker's own steps are missing, else `ready`. Only `ready` starts work. PROPOSED
//   (OQ-START-GATE-DETAILS): this mapping of codes to severities and resolution owners.
// - Exactly three administrative exceptions exist (OWN-DEC-68, HH-WORK-03). Each covers exactly one missing code of one
//   prerequisite and nothing else: customer not present, before-photos captured but the upload failed, deposit paid
//   but bookkeeping pending. EXCEPTABLE below is the whole list; no hold, safety, legal, qualification, scope,
//   authorization or access code is ever in it, and there is no fourth kind (the database refuses one too).
// - Nothing here clears a hold, a stop-work right or a critical resource block: an exception is evidence handling,
//   never approval of unsafe work.
import { defineMachine, type Guard } from './engine.js'
import { reasonGiven } from './guards.js'

/** The ten Start Work prerequisites of HH-WORK-01, in its order. */
export const START_GATE_ITEMS = [
  // 1. An active, signed-in worker with a current assignment to this job and visit (and, HH-WORK-12, arrived).
  'assignment',
  // 2. The correct property and site identity, and access to it.
  'site_identity',
  // 3. The current approved scope and change version reviewed and personally acknowledged (OWN-DEC-196: viewed).
  'scope_acknowledged',
  // 4. The approved SOP checklist and safety guidance in the worker's language (HH-PKT-04).
  'sop_language',
  // 5. No blocking job-level Hold; required legal or safety conditions resolved.
  'job_holds',
  // 6. Hazards and controls reviewed, and no unresolved critical safety hold.
  'safety_holds',
  // 7. Critical PPE, tools, equipment and materials confirmed available (HH-PKT-06).
  'critical_resources',
  // 8. The actual site condition reviewed and differences assessed (HH-WORK-12 step 2).
  'site_condition',
  // 9. Required before-photos captured and uploaded, or the approved upload-failure exception (HH-WORK-03).
  'before_photos',
  // 10. The required deposit satisfied, waived by the Owner, or the approved bookkeeping-pending exception.
  'deposit',
] as const
export type StartGateItem = (typeof START_GATE_ITEMS)[number]

export const START_GATE_OUTCOMES = ['ready', 'needs_attention', 'requires_review', 'blocked'] as const
export type StartGateOutcome = (typeof START_GATE_OUTCOMES)[number]

/** How a missing item weighs: the worker's own step, the Owner's review, or a block. */
export const GATE_SEVERITIES = ['attention', 'review', 'blocked'] as const
export type GateSeverity = (typeof GATE_SEVERITIES)[number]

/** Who resolves a missing item (PROPOSED). */
export const RESOLUTION_OWNERS = ['worker', 'owner', 'office'] as const
export type ResolutionOwner = (typeof RESOLUTION_OWNERS)[number]

/** The three administrative exceptions of OWN-DEC-68, and nothing else. */
export const GATE_EXCEPTION_KINDS = [
  'customer_not_present',
  'before_photo_upload_failed',
  'deposit_bookkeeping_pending',
] as const
export type GateExceptionKind = (typeof GATE_EXCEPTION_KINDS)[number]

/** The prerequisite each exception belongs to (one requirement per exception, OWN-DEC-68). */
export const EXCEPTION_REQUIREMENT = {
  customer_not_present: 'site_identity',
  before_photo_upload_failed: 'before_photos',
  deposit_bookkeeping_pending: 'deposit',
} as const satisfies Record<GateExceptionKind, StartGateItem>

type CodeRule = {
  readonly item: StartGateItem
  readonly severity: GateSeverity
  readonly owner: ResolutionOwner
  /** The one exception that may cover this code, or none. */
  readonly exceptable?: GateExceptionKind
}

/** Every code the gate can name, with its prerequisite, weight, resolution owner and the exception that may cover it. */
export const START_GATE_CODES = {
  // 1. Assignment and arrival.
  NOT_ASSIGNED: { item: 'assignment', severity: 'blocked', owner: 'office' },
  NOT_WORK_VISIT: { item: 'assignment', severity: 'blocked', owner: 'office' },
  VISIT_NOT_ACTIVE: { item: 'assignment', severity: 'blocked', owner: 'office' },
  ARRIVED_FIRST: { item: 'assignment', severity: 'attention', owner: 'worker' },
  ALREADY_STARTED: { item: 'assignment', severity: 'blocked', owner: 'worker' },
  JOB_NOT_STARTABLE: { item: 'assignment', severity: 'blocked', owner: 'owner' },
  // TSK-0094: resuming after a pause is for a worker who started work on the job before it, once per pause.
  NOT_STARTED_BEFORE: { item: 'assignment', severity: 'blocked', owner: 'worker' },
  RESUME_NOT_NEEDED: { item: 'assignment', severity: 'blocked', owner: 'worker' },
  // 2. Site identity and access.
  SITE_CHECK_MISSING: { item: 'site_identity', severity: 'attention', owner: 'worker' },
  PROPERTY_NOT_CONFIRMED: { item: 'site_identity', severity: 'review', owner: 'owner' },
  ACCESS_NOT_AVAILABLE: { item: 'site_identity', severity: 'review', owner: 'owner' },
  CUSTOMER_NOT_PRESENT: {
    item: 'site_identity',
    severity: 'attention',
    owner: 'worker',
    exceptable: 'customer_not_present',
  },
  // 3. Scope and packet: viewed (OWN-DEC-196) and personally acknowledged (TSK-0072).
  SCOPE_NOT_ACCEPTED: { item: 'scope_acknowledged', severity: 'blocked', owner: 'owner' },
  PACKET_NOT_VIEWED: { item: 'scope_acknowledged', severity: 'attention', owner: 'worker' },
  PACKET_CHANGED_SINCE_VIEWED: { item: 'scope_acknowledged', severity: 'attention', owner: 'worker' },
  PACKET_NOT_ACKNOWLEDGED: { item: 'scope_acknowledged', severity: 'attention', owner: 'worker' },
  PACKET_ACKNOWLEDGMENT_ENDED: { item: 'scope_acknowledged', severity: 'attention', owner: 'worker' },
  // 4. SOP and language.
  SOP_NOT_CONFIGURED: { item: 'sop_language', severity: 'blocked', owner: 'owner' },
  SOP_PENDING_COMPETENT_REVIEW: { item: 'sop_language', severity: 'review', owner: 'owner' },
  SPANISH_SAFETY_REVIEW_PENDING: { item: 'sop_language', severity: 'review', owner: 'owner' },
  // 5. Job-level Hold / Ready and intake review holds.
  JOB_ON_HOLD: { item: 'job_holds', severity: 'blocked', owner: 'owner' },
  REVIEW_HOLD_OPEN: { item: 'job_holds', severity: 'blocked', owner: 'owner' },
  // 6. Hazards and critical safety holds.
  CRITICAL_HOLD_OPEN: { item: 'safety_holds', severity: 'blocked', owner: 'owner' },
  HAZARDS_NOT_REVIEWED: { item: 'safety_holds', severity: 'attention', owner: 'worker' },
  // 7. Critical resources (the loadout, TSK-0071).
  LOADOUT_BLOCKED: { item: 'critical_resources', severity: 'blocked', owner: 'owner' },
  LOADOUT_NOT_CONFIRMED: { item: 'critical_resources', severity: 'attention', owner: 'worker' },
  LOADOUT_NOT_CONFIGURED: { item: 'critical_resources', severity: 'blocked', owner: 'owner' },
  // 8. Site condition.
  SITE_CONDITION_NOT_REVIEWED: { item: 'site_condition', severity: 'attention', owner: 'worker' },
  SITE_CONDITION_DIFFERS: { item: 'site_condition', severity: 'review', owner: 'owner' },
  // 9. Before photos.
  BEFORE_PHOTOS_MISSING: {
    item: 'before_photos',
    severity: 'attention',
    owner: 'worker',
    exceptable: 'before_photo_upload_failed',
  },
  // 10. Deposit (TSK-0059): an unpaid required deposit stays blocking; only verified money, the Owner's waiver or the
  // approved bookkeeping-pending exception passes it.
  DEPOSIT_REQUIRED: {
    item: 'deposit',
    severity: 'blocked',
    owner: 'office',
    exceptable: 'deposit_bookkeeping_pending',
  },
  DEPOSIT_REQUIREMENT_MISSING: { item: 'deposit', severity: 'blocked', owner: 'owner' },
} as const satisfies Record<string, CodeRule>
export type StartGateCode = keyof typeof START_GATE_CODES

/** The codes an exception may cover: derived from the table, so the list can never grow by itself. */
export const EXCEPTABLE: Readonly<Record<GateExceptionKind, readonly StartGateCode[]>> = Object.fromEntries(
  GATE_EXCEPTION_KINDS.map((k) => [
    k,
    (Object.keys(START_GATE_CODES) as StartGateCode[]).filter(
      (c) => (START_GATE_CODES[c] as CodeRule).exceptable === k,
    ),
  ]),
) as unknown as Record<GateExceptionKind, readonly StartGateCode[]>

/** One missing item as the server found it: the code and what it is about (a hold, a work package, or nothing). */
export type FoundMissing = { readonly code: StartGateCode; readonly ref: string | null }

/** An approved, still valid exception of this visit: what it covers. */
export type CoveringException = {
  readonly id: string
  readonly kind: GateExceptionKind
  /** Before-photo exceptions only: the work packages whose photos were captured and are pending upload. */
  readonly workPackageIds?: readonly string[]
}

export type GateMissing = {
  readonly code: StartGateCode
  readonly ref: string | null
  readonly severity: GateSeverity
  readonly resolutionOwner: ResolutionOwner
  /** The exception kind that may cover it (requested by an assigned worker, approved by the Owner), or null. */
  readonly exceptable: GateExceptionKind | null
  /** The approved exception that covers it now, or null. */
  readonly exceptionId: string | null
}

export type GateItemResult = {
  readonly item: StartGateItem
  /** met: nothing missing; excepted: everything missing is covered by an approved exception; missing otherwise. */
  readonly state: 'met' | 'missing' | 'excepted'
  readonly missing: readonly GateMissing[]
}

export type StartGateResult = {
  readonly outcome: StartGateOutcome
  readonly items: readonly GateItemResult[]
  /** The approved exceptions this evaluation used (each covering at least one missing item). */
  readonly exceptionsUsed: readonly string[]
}

function covering(m: FoundMissing, exceptions: readonly CoveringException[]): CoveringException | null {
  const rule = START_GATE_CODES[m.code] as CodeRule
  if (!rule.exceptable) return null
  return (
    exceptions.find(
      (e) =>
        e.kind === rule.exceptable &&
        (EXCEPTABLE[e.kind] as readonly string[]).includes(m.code) &&
        (e.kind !== 'before_photo_upload_failed' || (m.ref !== null && (e.workPackageIds ?? []).includes(m.ref))),
    ) ?? null
  )
}

/**
 * Decides the gate from every missing item the server found and the approved, valid exceptions of the visit. Every
 * prerequisite is listed, in order; a code is covered only by the one exception kind that may cover it.
 */
export function evaluateStartGate(
  found: readonly FoundMissing[],
  exceptions: readonly CoveringException[] = [],
): StartGateResult {
  const used = new Set<string>()
  const missing: GateMissing[] = found.map((m) => {
    const rule = START_GATE_CODES[m.code] as CodeRule
    const cover = covering(m, exceptions)
    if (cover) used.add(cover.id)
    return {
      code: m.code,
      ref: m.ref,
      severity: rule.severity,
      resolutionOwner: rule.owner,
      exceptable: rule.exceptable ?? null,
      exceptionId: cover?.id ?? null,
    }
  })
  const items = START_GATE_ITEMS.map((item): GateItemResult => {
    const mine = missing.filter((m) => START_GATE_CODES[m.code].item === item)
    const open = mine.filter((m) => m.exceptionId === null)
    return { item, state: mine.length === 0 ? 'met' : open.length === 0 ? 'excepted' : 'missing', missing: mine }
  })
  const open = missing.filter((m) => m.exceptionId === null)
  const outcome: StartGateOutcome = open.some((m) => m.severity === 'blocked')
    ? 'blocked'
    : open.some((m) => m.severity === 'review')
      ? 'requires_review'
      : open.length > 0
        ? 'needs_attention'
        : 'ready'
  return { outcome, items, exceptionsUsed: [...used].sort() }
}

/** Only a `ready` evaluation starts work; no other outcome, flag or role does. */
export function startAllowed(result: Pick<StartGateResult, 'outcome'>): boolean {
  return result.outcome === 'ready'
}

// --- The administrative exceptions (HH-WORK-03, ENT-GateException) -----------------------------------------------

/**
 * requested -> approved / declined (the Owner); requested / approved -> invalidated (a relevant change: scope, site
 * conditions, access or assignment) or expired (the visit ended). Never carried over to another visit.
 */
export const GATE_EXCEPTION_STATES = ['requested', 'approved', 'declined', 'invalidated', 'expired'] as const
export type GateExceptionState = (typeof GATE_EXCEPTION_STATES)[number]

/** Why an exception ended without being used further. */
export const GATE_EXCEPTION_ENDINGS = [
  'visit_ended',
  'scope_changed',
  'site_changed',
  'access_changed',
  'assignment_changed',
] as const
export type GateExceptionEnding = (typeof GATE_EXCEPTION_ENDINGS)[number]

/** Payment providers whose records verify a deposit (INT-Square; "Square or another approved provider"). */
export const APPROVED_DEPOSIT_PROVIDERS = ['square'] as const

export type GateExceptionFacts = {
  /** Who requested it, and who acts now (staff user ids). */
  readonly requestedBy?: string
  readonly actorId?: string
  readonly kind?: GateExceptionKind
  readonly followUpOwnerId?: string
  readonly followUpDue?: string
  /** Deposit exceptions: the Owner states the deposit was verified in the provider's own records. */
  readonly providerVerified?: boolean
  readonly reason?: string
}
type G = Guard<GateExceptionFacts>

const notOwnRequest: G = (f) => {
  if (f.requestedBy === undefined || f.actorId === undefined)
    return { code: 'FACTS_MISSING', message: 'The server must check: requestedBy, actorId.' }
  return f.requestedBy === f.actorId
    ? { code: 'OWN_REQUEST', message: 'The person who requested an exception never approves it.' }
    : null
}
const followUp: G = (f) =>
  typeof f.followUpOwnerId === 'string' && f.followUpOwnerId !== '' && /^\d{4}-\d{2}-\d{2}$/.test(f.followUpDue ?? '')
    ? null
    : { code: 'FOLLOW_UP_REQUIRED', message: 'Name the follow-up owner and the deadline.' }
const providerChecked: G = (f) =>
  f.kind !== 'deposit_bookkeeping_pending' || f.providerVerified === true
    ? null
    : {
        code: 'PROVIDER_VERIFICATION_REQUIRED',
        message: "Verify the deposit in the payment provider's own records before approving.",
      }
const declineReason: G = (f) => reasonGiven(f.reason, 'The reason for declining')

export const GATE_EXCEPTION_MACHINE = defineMachine({
  entity: 'gate_exception',
  dimension: 'lifecycle',
  states: GATE_EXCEPTION_STATES,
  initial: 'requested',
  final: ['declined', 'invalidated', 'expired'],
  proposed: true,
  transitions: [
    {
      event: 'approve',
      from: ['requested'],
      to: 'approved',
      actors: ['staff'],
      guards: [notOwnRequest, followUp, providerChecked],
      effects: ['queue.start_work_exception_sync'],
    },
    {
      event: 'decline',
      from: ['requested'],
      to: 'declined',
      actors: ['staff'],
      guards: [notOwnRequest, declineReason],
      effects: ['queue.start_work_exception_sync'],
    },
    { event: 'invalidate', from: ['requested', 'approved'], to: 'invalidated', actors: ['system'] },
    { event: 'expire', from: ['requested', 'approved'], to: 'expired', actors: ['system'] },
  ],
})

/** The evidence an exception request carries, per kind (what the worker states; the Owner verifies). */
export type ExceptionEvidence =
  | { readonly kind: 'customer_not_present'; readonly authorization: string; readonly contact: string }
  | {
      readonly kind: 'before_photo_upload_failed'
      readonly workPackageIds: readonly string[]
      readonly photosOnDevice: number
      readonly failure: string
    }
  | {
      readonly kind: 'deposit_bookkeeping_pending'
      readonly provider: (typeof APPROVED_DEPOSIT_PROVIDERS)[number]
      readonly transactionReference: string
      readonly amountCents: number
    }

/** Why an exception request is refused: what the records show does not match what the exception may cover. */
export type ExceptionRequestProblem =
  | 'REQUIREMENT_NOT_MISSING'
  | 'SCOPE_NOT_ACCEPTED'
  | 'ACCESS_INSTRUCTIONS_MISSING'
  | 'SITE_CHECK_FIRST'
  | 'PHOTOS_NOT_PENDING'
  | 'DEPOSIT_NOT_DUE'
  | 'AMOUNT_BELOW_DEPOSIT'
  | 'ALREADY_REQUESTED'

export type ExceptionRequestFacts = {
  /** The codes the gate names now for this worker (before any exception). */
  readonly missing: readonly FoundMissing[]
  readonly scopeAccepted: boolean
  /** The property has its access instructions recorded (an access notes or access windows detail). */
  readonly accessInstructions: boolean
  /** A live (requested or approved) exception of the same kind already exists on the visit. */
  readonly alreadyLive: boolean
  /** Deposit: the amount still due in cents (null when no deposit is due). */
  readonly depositDueCents: number | null
}

/** Every reason the records refuse this request; empty when it may be submitted to the Owner. */
export function exceptionRequestProblems(e: ExceptionEvidence, f: ExceptionRequestFacts): ExceptionRequestProblem[] {
  const out: ExceptionRequestProblem[] = []
  if (f.alreadyLive) out.push('ALREADY_REQUESTED')
  const has = (code: StartGateCode, ref?: string) =>
    f.missing.some((m) => m.code === code && (ref === undefined || m.ref === ref))
  switch (e.kind) {
    case 'customer_not_present':
      if (!f.scopeAccepted) out.push('SCOPE_NOT_ACCEPTED')
      if (!f.accessInstructions) out.push('ACCESS_INSTRUCTIONS_MISSING')
      // The worker still completes the site inspection and safety checks: the customer's absence is what they record.
      if (has('SITE_CHECK_MISSING')) out.push('SITE_CHECK_FIRST')
      else if (!has('CUSTOMER_NOT_PRESENT')) out.push('REQUIREMENT_NOT_MISSING')
      break
    case 'before_photo_upload_failed':
      if (e.workPackageIds.length === 0 || !e.workPackageIds.every((id) => has('BEFORE_PHOTOS_MISSING', id)))
        out.push('PHOTOS_NOT_PENDING')
      break
    case 'deposit_bookkeeping_pending':
      if (!has('DEPOSIT_REQUIRED') || f.depositDueCents === null) out.push('DEPOSIT_NOT_DUE')
      else if (e.amountCents < f.depositDueCents) out.push('AMOUNT_BELOW_DEPOSIT')
      break
  }
  return out
}

/**
 * Where an exception stands now, read from its record and the visit: requested and approved ones end when the visit
 * ends (completed, canceled, no access, or its service day is over) and when a relevant change happened since the
 * exception's packet version. The first ending found is the reason.
 */
export function effectiveExceptionState(
  e: { readonly state: GateExceptionState; readonly expiresAt: Date },
  facts: {
    readonly now: Date
    readonly visitState: string
    /** The critical packet sections that changed since the exception's packet version. */
    readonly changedSections: readonly string[]
    /** The requester is still assigned to the visit. */
    readonly requesterAssigned: boolean
  },
): { state: GateExceptionState; ending: GateExceptionEnding | null } {
  if (e.state !== 'requested' && e.state !== 'approved') return { state: e.state, ending: null }
  if (facts.now.getTime() >= e.expiresAt.getTime() || !['confirmed', 'en_route', 'arrived'].includes(facts.visitState))
    return { state: 'expired', ending: 'visit_ended' }
  if (facts.changedSections.includes('scope')) return { state: 'invalidated', ending: 'scope_changed' }
  if (facts.changedSections.includes('holds')) return { state: 'invalidated', ending: 'site_changed' }
  if (facts.changedSections.includes('site_access')) return { state: 'invalidated', ending: 'access_changed' }
  if (facts.changedSections.includes('assignment') || !facts.requesterAssigned)
    return { state: 'invalidated', ending: 'assignment_changed' }
  return { state: e.state, ending: null }
}
