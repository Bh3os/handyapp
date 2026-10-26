// JSON schemas of the Start Work routes (TSK-0073, TSK-0074; HH-API-01, HH-ARC-04). Input objects refuse unknown
// fields: no override, force, skip or fourth exception kind can be sent (VALIDATION_FAILED). Response objects list
// every field.
import {
  APPROVED_DEPOSIT_PROVIDERS,
  GATE_EXCEPTION_ENDINGS,
  GATE_EXCEPTION_KINDS,
  GATE_EXCEPTION_STATES,
  GATE_SEVERITIES,
  JOB_HOLD_CATEGORIES,
  RESOLUTION_OWNERS,
  START_GATE_CODES,
  START_GATE_ITEMS,
  START_GATE_OUTCOMES,
} from '@handyhub/domain'

const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const UUID = { type: 'string', pattern: UUID_PATTERN } as const
const STR = { type: 'string' } as const
const STR_OR_NULL = { type: ['string', 'null'] } as const
const INT = { type: 'integer' } as const
const INT_OR_NULL = { type: ['integer', 'null'] } as const
const BOOL = { type: 'boolean' } as const
const TIME = { type: 'string', format: 'date-time' } as const
const TIME_OR_NULL = { type: ['string', 'null'], format: 'date-time' } as const
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const
const TEXT = (max: number) => ({ type: 'string', minLength: 1, maxLength: max, pattern: '\\S' }) as const
const en = (values: readonly string[]) => ({ type: 'string', enum: [...values] }) as const
const enOrNull = (values: readonly string[]) => ({ type: ['string', 'null'], enum: [...values, null] }) as const

function obj(properties: Record<string, unknown>, nullable = false) {
  return {
    type: nullable ? ['object', 'null'] : 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  } as const
}
/** An input object: unknown fields refused; `optional` fields may be left out. */
function input(properties: Record<string, unknown>, optional: readonly string[] = []) {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties).filter((k) => !optional.includes(k)),
    properties,
  } as const
}
const arr = (items: unknown) => ({ type: 'array', items }) as const
const STAFF_REF = obj({ id: STR, name: STR_OR_NULL })

export const VISIT_PARAMS = obj({ visitId: UUID })
export const JOB_PARAMS = obj({ jobId: UUID })
export const HOLD_PARAMS = obj({ holdId: UUID })
export const EXCEPTION_PARAMS = obj({ exceptionId: UUID })
/** Start-gate reads take no query: there is no flag that changes what the gate checks. */
export const NO_QUERY = input({})

const MISSING = obj({
  code: en(Object.keys(START_GATE_CODES)),
  ref: STR_OR_NULL,
  severity: en(GATE_SEVERITIES),
  resolutionOwner: en(RESOLUTION_OWNERS),
  exceptable: enOrNull(GATE_EXCEPTION_KINDS),
  exceptionId: STR_OR_NULL,
})
export const GATE_ITEMS = arr(
  obj({ item: en(START_GATE_ITEMS), state: en(['met', 'missing', 'excepted']), missing: arr(MISSING) }),
)

const GATE_EXCEPTION = obj({
  id: STR,
  kind: en(GATE_EXCEPTION_KINDS),
  requirement: en(START_GATE_ITEMS),
  state: en(GATE_EXCEPTION_STATES),
  ending: enOrNull(GATE_EXCEPTION_ENDINGS),
  reason: STR,
  requestedBy: STAFF_REF,
  requestedAt: TIME,
  decidedAt: TIME_OR_NULL,
  followUpDue: { type: ['string', 'null'] },
  version: INT,
})

export const START_GATE = obj({
  visitId: STR,
  visitNumber: INT,
  visitState: STR,
  /** TSK-0094: a return visit (return_work) starts without moving the job; see `mode` for resuming. */
  visitPurpose: STR,
  /** What this answer evaluates: Start Work, or resuming after the job's latest pause (TSK-0094, HH-INC-03). */
  mode: en(['start', 'resume']),
  pausedAt: TIME_OR_NULL,
  jobId: STR_OR_NULL,
  projectReference: STR,
  checkedAt: TIME,
  outcome: en(START_GATE_OUTCOMES),
  items: GATE_ITEMS,
  packet: obj({ version: INT, contentSha256: STR }, true),
  workPackages: arr(obj({ workPackageId: STR, serviceCode: STR, beforePhotos: INT })),
  siteCheck: obj(
    {
      propertyConfirmed: BOOL,
      accessAvailable: BOOL,
      customerPresent: BOOL,
      hazardsReviewed: BOOL,
      siteCondition: en(['as_described', 'differs']),
      holdId: STR_OR_NULL,
      holdState: STR_OR_NULL,
      packetVersion: INT,
      recordedAt: TIME,
    },
    true,
  ),
  exceptions: arr(GATE_EXCEPTION),
  started: obj({ startId: STR, startedAt: TIME }, true),
  /** The emergency call is always offered, first, with nothing in front of it (owner amendment; OWN-DEC-208). */
  emergency: obj({ call911: STR }),
  actions: obj({
    start: BOOL,
    resume: BOOL,
    recordSiteCheck: BOOL,
    uploadBeforePhotos: BOOL,
    requestException: arr(en(GATE_EXCEPTION_KINDS)),
  }),
})

export const START_BODY = input({ packetVersion: { type: 'integer', minimum: 1 } })
export const START_RESULT = obj({
  started: BOOL,
  startId: STR,
  startedAt: TIME,
  evaluationId: STR,
  jobState: STR,
  jobStateBefore: STR,
  packetVersion: INT,
  scopeVersion: INT_OR_NULL,
  sopVersionIds: arr(STR),
  acknowledgmentId: STR,
  exceptionIds: arr(STR),
  workPackagesStarted: arr(STR),
})

export const RESUME_RESULT = obj({
  resumed: BOOL,
  resumptionId: STR,
  resumedAt: TIME,
  pausedAt: TIME,
  startId: STR_OR_NULL,
  evaluationId: STR,
  jobState: STR,
  jobStateBefore: STR,
  packetVersion: INT,
  acknowledgmentId: STR,
  exceptionIds: arr(STR),
  workPackagesResumed: arr(STR),
})

export const SITE_CHECK_BODY = input(
  {
    propertyConfirmed: BOOL,
    accessAvailable: BOOL,
    customerPresent: BOOL,
    hazardsReviewed: BOOL,
    siteCondition: en(['as_described', 'differs']),
    note: TEXT(1000),
  },
  ['note'],
)
export const SITE_CHECK_RESULT = obj({ siteCheckId: STR, recordedAt: TIME, holdId: STR_OR_NULL })

export const PHOTO_QUERY = input({ workPackageId: UUID, deviceCapturedAt: TIME }, ['deviceCapturedAt'])
export const PHOTO_RESULT = obj({ photoId: STR, workPackageId: STR, uploadedAt: TIME, created: BOOL })

const REASON = TEXT(1000)
export const EXCEPTION_BODY = {
  oneOf: [
    input({
      kind: { const: 'customer_not_present' },
      reason: REASON,
      evidence: input({ authorization: TEXT(1000), contact: TEXT(300) }),
    }),
    input({
      kind: { const: 'before_photo_upload_failed' },
      reason: REASON,
      evidence: input({
        workPackageIds: { type: 'array', minItems: 1, maxItems: 26, uniqueItems: true, items: UUID },
        photosOnDevice: { type: 'integer', minimum: 1, maximum: 500 },
        failure: TEXT(1000),
      }),
    }),
    input({
      kind: { const: 'deposit_bookkeeping_pending' },
      reason: REASON,
      evidence: input({
        provider: en(APPROVED_DEPOSIT_PROVIDERS),
        transactionReference: TEXT(200),
        amountCents: { type: 'integer', minimum: 1, maximum: 100_000_000 },
      }),
    }),
  ],
} as const
export const EXCEPTION_RESULT = obj({ exceptionId: STR, kind: en(GATE_EXCEPTION_KINDS), state: STR, version: INT })

export const APPROVE_BODY = input(
  { followUpOwnerId: UUID, followUpDue: DATE, note: TEXT(1000), providerVerified: BOOL },
  ['note', 'providerVerified'],
)
export const DECLINE_BODY = input({ reason: TEXT(1000) })

export const JOB_HOLD_BODY = input({ category: en(JOB_HOLD_CATEGORIES), note: TEXT(1000) })
export const READY_BODY = input({ resolutionNote: TEXT(2000) })
export const CRITICAL_REVIEW_BODY = input({})
export const CRITICAL_RESOLVE_BODY = input({
  resolutionNote: TEXT(2000),
  evidence: TEXT(2000),
  reviewer: TEXT(200),
  reviewerQualification: TEXT(200),
})
export const CRITICAL_CANCEL_BODY = input({ reason: TEXT(1000) })
export const HOLD_RESULT = obj({ holdId: STR, kind: STR, state: STR, version: INT, jobId: STR })

const REVIEW_HOLD = obj({
  holdId: STR,
  kind: en(['review', 'job_requirement', 'critical_safety']),
  category: STR,
  source: STR,
  state: STR,
  version: INT,
  note: STR,
  raisedBy: STAFF_REF,
  raisedAt: TIME,
  resolutionNote: STR_OR_NULL,
  reviewer: STR_OR_NULL,
  resolvedAt: TIME_OR_NULL,
  actions: obj({ setReady: BOOL, startReview: BOOL, resolve: BOOL, cancel: BOOL }),
})
const REVIEW_EXCEPTION = obj({
  id: STR,
  visitId: STR,
  visitNumber: INT,
  kind: en(GATE_EXCEPTION_KINDS),
  requirement: en(START_GATE_ITEMS),
  state: en(GATE_EXCEPTION_STATES),
  ending: enOrNull(GATE_EXCEPTION_ENDINGS),
  reason: STR,
  evidence: {
    type: 'object',
    additionalProperties: false,
    properties: {
      authorization: STR,
      contact: STR,
      workPackageIds: arr(STR),
      photosOnDevice: INT,
      failure: STR,
      provider: STR,
      transactionReference: STR,
      amountCents: INT,
    },
  },
  requestedBy: STAFF_REF,
  requestedAt: TIME,
  decidedBy: { ...STAFF_REF, type: ['object', 'null'] },
  decidedAt: TIME_OR_NULL,
  decisionNote: STR_OR_NULL,
  followUpOwner: { ...STAFF_REF, type: ['object', 'null'] },
  followUpDue: { type: ['string', 'null'] },
  followUp: en(['none', 'open', 'resolved']),
  version: INT,
  actions: obj({ approve: BOOL, decline: BOOL }),
})
export const START_REVIEW = obj({
  jobId: STR,
  projectReference: STR,
  jobState: STR,
  holds: arr(REVIEW_HOLD),
  exceptions: arr(REVIEW_EXCEPTION),
  followUpOwners: arr(STAFF_REF),
  actions: obj({ setHold: BOOL }),
})
