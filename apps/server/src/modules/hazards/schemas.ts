// JSON schemas of the Stop Work, Report Hazard and issue report routes (TSK-0077; HH-API-01, HH-ARC-04). The Stop Work
// body has no required field: a stop is never refused for something left out (the hazard defaults to "other unsafe
// condition"). Input objects refuse unknown fields, so no flag can ask for less (no "skip hold", no "not critical").
import {
  GUIDANCE_CODES,
  HAZARD_KINDS,
  HAZARD_REVIEWERS,
  HOLD_STATES,
  ISSUE_CATEGORIES,
  ISSUE_SEVERITIES,
  NEXT_OWNERS,
  REPORT_KINDS,
} from '@handyhub/domain'

const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const UUID = { type: 'string', pattern: UUID_PATTERN } as const
const STR = { type: 'string' } as const
const STR_OR_NULL = { type: ['string', 'null'] } as const
const BOOL = { type: 'boolean' } as const
const BOOL_OR_NULL = { type: ['boolean', 'null'] } as const
const INT = { type: 'integer' } as const
const TIME = { type: 'string', format: 'date-time' } as const
const TIME_OR_NULL = { type: ['string', 'null'], format: 'date-time' } as const
const TEXT = (max: number) => ({ type: 'string', minLength: 1, maxLength: max, pattern: '\\S' }) as const
const en = (values: readonly string[]) => ({ type: 'string', enum: [...values] }) as const
const enOrNull = (values: readonly string[]) => ({ type: ['string', 'null'], enum: [...values, null] }) as const
const arr = (items: unknown) => ({ type: 'array', items }) as const

function obj(properties: Record<string, unknown>, nullable = false) {
  return {
    type: nullable ? ['object', 'null'] : 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  } as const
}
function input(properties: Record<string, unknown>, optional: readonly string[] = []) {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties).filter((k) => !optional.includes(k)),
    properties,
  } as const
}

export const JOB_PARAMS = obj({ jobId: UUID })
export const REPORT_PARAMS = obj({ reportId: UUID })
export const HOLD_PARAMS = obj({ holdId: UUID })
export const DELIVERY_PARAMS = obj({ reportId: UUID, deliveryId: UUID })
export const EMPTY_BODY = input({})

/** Stop Work / Report Hazard: everything optional; text is trimmed and long text is cut, never refused. */
export const HAZARD_BODY = input(
  {
    hazard: en(HAZARD_KINDS),
    // Lenient on purpose: a long text is cut, an id that is not the job's is left out, a device time that cannot be
    // read is not kept; none of them refuses the stop.
    description: STR,
    workPackageIds: arr(STR),
    visitId: STR,
    peopleKeptAway: BOOL,
    emergencyServicesCalled: BOOL,
    deviceRecordedAt: STR,
  },
  [
    'hazard',
    'description',
    'workPackageIds',
    'visitId',
    'peopleKeptAway',
    'emergencyServicesCalled',
    'deviceRecordedAt',
  ],
)

const RESOLUTION = input({
  whatHappened: TEXT(2000),
  steps: TEXT(2000),
  materials: TEXT(1000),
  howChecked: TEXT(1000),
  withinTrainingAndScope: BOOL,
})

export const ISSUE_BODY = input(
  {
    category: en(ISSUE_CATEGORIES),
    severity: en(ISSUE_SEVERITIES),
    description: TEXT(2000),
    workPackageId: UUID,
    visitId: UUID,
    nextOwner: en(NEXT_OWNERS),
    resolution: RESOLUTION,
    deviceRecordedAt: TIME,
  },
  ['severity', 'workPackageId', 'visitId', 'nextOwner', 'resolution', 'deviceRecordedAt'],
)

export const STABILIZATION_BODY = input(
  {
    trigger: TEXT(1000),
    actions: TEXT(2000),
    whyNecessary: TEXT(1000),
    evidence: TEXT(1000),
    ownerNotifiedAt: TIME,
    customerNotifiedAt: TIME,
    followUp: TEXT(1000),
  },
  ['evidence', 'ownerNotifiedAt', 'customerNotifiedAt', 'followUp'],
)

export const REVIEW_BODY = input({ note: TEXT(1000) }, ['note'])

export const PHOTO_QUERY = input({ deviceCapturedAt: TIME }, ['deviceCapturedAt'])

/** What a Stop Work answer carries: the hold, the guidance to show at once and the emergency call. */
export const HAZARD_RESULT = obj({
  reportId: STR,
  holdId: STR,
  holdState: en(HOLD_STATES),
  jobState: STR,
  jobPaused: BOOL,
  affectedWorkPackageIds: arr(STR),
  hazard: en(HAZARD_KINDS),
  reviewer: en(HAZARD_REVIEWERS),
  guidance: arr(en(GUIDANCE_CODES)),
  resolveOnSite: { type: 'boolean', enum: [false] },
  emergency: obj({ call911: STR }),
  reportedAt: TIME,
})

export const ISSUE_RESULT = obj({
  reportId: STR,
  kind: en(REPORT_KINDS),
  severity: en(ISSUE_SEVERITIES),
  holdId: STR_OR_NULL,
  jobState: STR,
  jobPaused: BOOL,
  resolvedOnSite: BOOL,
  reportedAt: TIME,
})

export const PHOTO_RESULT = obj({ photoId: STR, reportId: STR, uploadedAt: TIME, created: BOOL })
export const STABILIZATION_RESULT = obj({ stabilizationId: STR, reportId: STR, recordedAt: TIME })
export const REVIEW_RESULT = obj({ reportId: STR, reviewedAt: TIME })
export const SAFETY_HOLD_RESULT = obj({ holdId: STR, jobId: STR, projectReference: STR })

const STAFF_REF = obj({ id: STR, name: STR_OR_NULL })
const NOTICE = obj({
  deliveryId: STR,
  state: STR,
  channel: STR,
  errorCode: STR_OR_NULL,
  draftedAt: TIME,
  actions: obj({ release: BOOL, dismiss: BOOL }),
})

/** One report as the caller may see it: restricted details only for the Owner and the reporter (OWN-DEC-143). */
const REPORT = obj({
  reportId: STR,
  kind: en(REPORT_KINDS),
  restricted: BOOL,
  // Masked (null) for a restricted report the caller may not read.
  hazard: enOrNull(HAZARD_KINDS),
  category: enOrNull(ISSUE_CATEGORIES),
  severity: en(ISSUE_SEVERITIES),
  description: STR_OR_NULL,
  affectedWorkPackageIds: arr(STR),
  nextOwner: en(NEXT_OWNERS),
  peopleKeptAway: BOOL_OR_NULL,
  emergencyServicesCalled: BOOL_OR_NULL,
  resolution: obj({ whatHappened: STR, steps: STR, materials: STR, howChecked: STR }, true),
  reviewer: enOrNull(HAZARD_REVIEWERS),
  hold: obj({ holdId: STR, state: en(HOLD_STATES), version: INT }, true),
  jobPaused: BOOL,
  reportedBy: STAFF_REF,
  reportedAt: TIME,
  deviceRecordedAt: TIME_OR_NULL,
  photos: INT,
  stabilizations: arr(
    obj({
      id: STR,
      trigger: STR,
      actions: STR,
      whyNecessary: STR,
      evidence: STR_OR_NULL,
      ownerNotifiedAt: TIME_OR_NULL,
      customerNotifiedAt: TIME_OR_NULL,
      followUp: STR_OR_NULL,
      recordedBy: STAFF_REF,
      recordedAt: TIME,
    }),
  ),
  review: obj({ reviewedBy: STAFF_REF, reviewedAt: TIME, note: STR_OR_NULL }, true),
  customerNotice: arr(NOTICE),
  actions: obj({ addPhoto: BOOL, recordStabilization: BOOL, review: BOOL }),
})

export const REPORTS_VIEW = obj({
  jobId: STR,
  projectReference: STR,
  jobState: STR,
  reports: arr(REPORT),
  workPackages: arr(obj({ workPackageId: STR, serviceCode: STR, state: STR })),
  emergency: obj({ call911: STR }),
  actions: obj({ reportHazard: BOOL, reportIssue: BOOL }),
})

export const NOTICE_RESULT = obj({ reportId: STR, deliveryId: STR, state: STR })
