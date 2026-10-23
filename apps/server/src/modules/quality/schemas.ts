// JSON schemas of the quality-review routes (TSK-0084; HH-API-01, HH-ARC-04). Input objects refuse unknown fields;
// response objects list every field, so a projection never carries more than it declares.
import {
  AREA_RESULTS,
  PUNCH_ITEM_KINDS,
  PUNCH_ITEM_STATES,
  PUNCH_SEVERITIES,
  QUALITY_GATES,
  QUALITY_REVIEW_STATES,
} from '@handyhub/domain'

const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const UUID = { type: 'string', pattern: UUID_PATTERN } as const
const UUID_OR_NULL = { type: ['string', 'null'], pattern: UUID_PATTERN } as const
const STR = { type: 'string' } as const
const STR_OR_NULL = { type: ['string', 'null'] } as const
const INT = { type: 'integer' } as const
const BOOL = { type: 'boolean' } as const
const TIME = { type: 'string', format: 'date-time' } as const
const TIME_OR_NULL = { type: ['string', 'null'], format: 'date-time' } as const
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const
const DATE_OR_NULL = { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const
const TEXT = (max: number) => ({ type: 'string', minLength: 1, maxLength: max, pattern: '\\S' }) as const
const en = (values: readonly string[]) => ({ type: 'string', enum: [...values] }) as const
const enOrNull = (values: readonly string[]) => ({ type: ['string', 'null'], enum: [...values, null] }) as const

function obj(properties: Record<string, unknown>) {
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties } as const
}
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [{ type: 'null' }, schema] }) as const
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
const STAFF_REF_OR_NULL = nullable(STAFF_REF)

export const JOB_PARAMS = obj({ jobId: UUID })
export const ITEM_PARAMS = obj({ punchItemId: UUID })
export const NO_QUERY = input({})
export const EMPTY_BODY = input({})

const RESULT = en(AREA_RESULTS)
export const DECIDE_BODY = input(
  {
    results: obj({ scope: RESULT, checklist: RESULT, evidence: RESULT, walkthrough: RESULT }),
    note: TEXT(2000),
  },
  ['note'],
)
export const PUNCH_BODY = input(
  {
    kind: en(PUNCH_ITEM_KINDS),
    description: TEXT(1000),
    requiredEvidence: TEXT(500),
    assignedTo: UUID,
    dueOn: DATE,
    workPackageId: UUID,
    area: TEXT(120),
    holdId: UUID,
  },
  ['workPackageId', 'area', 'holdId'],
)
export const CORRECT_BODY = input({ note: TEXT(1000) })
export const RECHECK_BODY = input({ passed: BOOL, note: TEXT(1000) })

export const PUNCH_ITEM = obj({
  id: STR,
  workPackageId: UUID_OR_NULL,
  area: STR_OR_NULL,
  kind: en(PUNCH_ITEM_KINDS),
  severity: en(PUNCH_SEVERITIES),
  description: STR,
  requiredEvidence: STR,
  assignedTo: STAFF_REF,
  dueOn: DATE,
  holdId: UUID_OR_NULL,
  state: en(PUNCH_ITEM_STATES),
  createdBy: STAFF_REF,
  createdAt: TIME,
  correctionNote: STR_OR_NULL,
  correctedBy: STAFF_REF_OR_NULL,
  correctedAt: TIME_OR_NULL,
  recheckNote: STR_OR_NULL,
  recheckedBy: STAFF_REF_OR_NULL,
  recheckedAt: TIME_OR_NULL,
  version: INT,
  actions: obj({ correct: BOOL, recheck: BOOL }),
})

export const REVIEW_LIST = obj({
  reviews: arr(
    obj({
      jobId: STR,
      reference: STR,
      jobState: STR,
      reviewState: enOrNull(QUALITY_REVIEW_STATES),
      openPunchItems: INT,
      majorPunchItems: INT,
      nextDue: DATE_OR_NULL,
    }),
  ),
})

export const REVIEW_VIEW = obj({
  jobId: STR,
  projectId: STR,
  reference: STR,
  jobState: STR,
  review: nullable(
    obj({
      state: en(QUALITY_REVIEW_STATES),
      reviewer: STAFF_REF_OR_NULL,
      selfReview: BOOL,
      results: nullable(obj({ scope: RESULT, checklist: RESULT, evidence: RESULT, walkthrough: RESULT })),
      note: STR_OR_NULL,
      startedAt: TIME_OR_NULL,
      decidedAt: TIME_OR_NULL,
      passedAt: TIME_OR_NULL,
      version: INT,
    }),
  ),
  gate: en(QUALITY_GATES),
  scope: nullable(obj({ version: INT, totalCents: INT, lines: arr(STR) })),
  workPackages: arr(obj({ id: STR, code: STR, position: INT, state: STR })),
  evidence: obj({ beforePhotos: INT, afterPhotos: INT }),
  checklistRecorded: BOOL,
  walkthroughRecorded: BOOL,
  safetyHolds: arr(obj({ id: STR, category: STR, state: STR, raisedAt: TIME })),
  workers: arr(STAFF_REF),
  punchItems: arr(PUNCH_ITEM),
  history: arr(
    obj({
      event: STR,
      punchItemId: UUID_OR_NULL,
      from: STR_OR_NULL,
      to: STR,
      actor: STAFF_REF,
      note: STR_OR_NULL,
      at: TIME,
    }),
  ),
  actions: obj({ start: BOOL, addPunchItem: BOOL, decide: BOOL }),
})

export const OWN_ITEMS = obj({ punchItems: arr(PUNCH_ITEM) })
export const REVIEW_RESULT = obj({ jobId: STR, state: en(QUALITY_REVIEW_STATES), jobState: STR, version: INT })
export const PUNCH_RESULT = obj({
  punchItemId: STR,
  state: en(PUNCH_ITEM_STATES),
  reviewState: en(QUALITY_REVIEW_STATES),
  version: INT,
})
