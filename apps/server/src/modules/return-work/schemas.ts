// JSON schemas of the return-work routes (TSK-0094; HH-API-01, HH-ARC-04, HH-QA-07, HH-QA-08). Input objects refuse
// unknown fields: there is no exclusion, coverage rule or amount to send with a decision, and no field reopens the
// original job. Response objects list every field.
import {
  CASE_STATES,
  COVERAGE_DECISIONS,
  PRICE_DECISIONS,
  PUNCH_ITEM_STATES,
  RETURN_COST_KINDS,
  RETURN_COST_MAX_CENTS,
  RETURN_WORK_CLASSES,
} from '@handyhub/domain'
import { NEW_VISIT_BODY } from '../visits/schemas.js'

const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const UUID = { type: 'string', pattern: UUID_PATTERN } as const
const UUID_OR_NULL = { type: ['string', 'null'], pattern: UUID_PATTERN } as const
const STR = { type: 'string' } as const
const STR_OR_NULL = { type: ['string', 'null'] } as const
const INT = { type: 'integer' } as const
const BOOL = { type: 'boolean' } as const
const BOOL_OR_NULL = { type: ['boolean', 'null'] } as const
const TIME_OR_NULL = { type: ['string', 'null'], format: 'date-time' } as const
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const
const DATE_OR_NULL = { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const
const TEXT = (max: number) => ({ type: 'string', minLength: 1, maxLength: max, pattern: '\\S' }) as const
const en = (values: readonly string[]) => ({ type: 'string', enum: [...values] }) as const

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

export const CASE_PARAMS = obj({ caseId: UUID })
export const RETURN_WORK_PARAMS = obj({ returnWorkId: UUID })
export const ITEM_PARAMS = obj({ itemId: UUID })
export const COST_PARAMS = obj({ costId: UUID })
export const JOB_PARAMS = obj({ jobId: UUID })
export const NO_QUERY = input({})

export const CLASSIFY_BODY = input({ classification: en(RETURN_WORK_CLASSES), note: TEXT(1000) }, ['note'])
export const DECISION_BODY = input({
  coverage: en(COVERAGE_DECISIONS),
  price: en(PRICE_DECISIONS),
  note: TEXT(1000),
})
/** A return visit's window and planning facts: the visit body without its purpose, which is always return_work. */
const VISIT_FIELDS = Object.fromEntries(
  Object.entries(NEW_VISIT_BODY.properties).filter(([k]) => k !== 'purpose'),
) as Omit<typeof NEW_VISIT_BODY.properties, 'purpose'>
export const RETURN_VISIT_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['localDate', 'windowStart', 'windowEnd'],
  properties: VISIT_FIELDS,
} as const
export const LINK_VISIT_BODY = input({ visitId: UUID })
export const RETURN_JOB_BODY = input({ jobId: UUID_OR_NULL })
export const ITEM_BODY = input(
  {
    workPackageId: UUID,
    area: TEXT(120),
    description: TEXT(1000),
    requiredEvidence: TEXT(500),
    assignedTo: UUID,
    dueOn: DATE,
  },
  ['workPackageId', 'area'],
)
export const CORRECT_BODY = input({ note: TEXT(1000) })
export const RECHECK_BODY = input({ passed: BOOL, note: TEXT(1000) })
export const COST_BODY = input({
  kind: en(RETURN_COST_KINDS),
  amountCents: { type: 'integer', minimum: 1, maximum: RETURN_COST_MAX_CENTS },
  note: TEXT(500),
})
export const VOID_BODY = input({ reason: TEXT(500) })

export const RESULT = obj({ returnWorkId: STR, version: INT })
export const CLASSIFY_RESULT = obj({ returnWorkId: STR, classification: en(RETURN_WORK_CLASSES), version: INT })
export const VISIT_RESULT = obj({ returnWorkId: STR, visitId: STR, version: INT })
export const ITEM_RESULT = obj({ itemId: STR, state: en(PUNCH_ITEM_STATES), version: INT })
export const COST_RESULT = obj({ costId: STR, returnWorkId: STR })

const JOB_REF = obj({ jobId: STR, state: STR, projectReference: STR })
const ACTIONS = obj({
  classify: BOOL,
  decide: BOOL,
  planVisit: BOOL,
  linkVisit: BOOL,
  linkJob: BOOL,
  addItem: BOOL,
  addCost: BOOL,
})

export const RETURN_WORK_VIEW = obj({
  caseId: STR,
  caseState: en(CASE_STATES),
  originalJob: nullable(JOB_REF),
  warranty: nullable(
    obj({
      reviewedCompletionOn: DATE_OR_NULL,
      lastDayOn: DATE_OR_NULL,
      reportedOn: DATE,
      within: BOOL_OR_NULL,
      days: INT,
      reviewState: STR_OR_NULL,
    }),
  ),
  workPackages: arr(obj({ id: STR, code: STR })),
  workers: arr(obj({ id: STR, name: STR_OR_NULL })),
  returnWork: nullable(
    obj({
      id: STR,
      version: INT,
      classification: en(RETURN_WORK_CLASSES),
      classificationNote: STR_OR_NULL,
      classifiedBy: STAFF_REF_OR_NULL,
      classifiedAt: TIME_OR_NULL,
      window: obj({ reviewedCompletionOn: DATE_OR_NULL, reportedOn: DATE_OR_NULL, within: BOOL_OR_NULL }),
      decision: nullable(
        obj({
          coverage: en(COVERAGE_DECISIONS),
          price: en(PRICE_DECISIONS),
          note: STR_OR_NULL,
          decidedBy: STAFF_REF_OR_NULL,
          decidedAt: TIME_OR_NULL,
        }),
      ),
      returnJob: nullable(JOB_REF),
      visits: arr(
        obj({
          visitId: STR,
          number: INT,
          state: STR,
          localDate: DATE_OR_NULL,
          windowStart: STR,
          windowEnd: STR,
          linkedAt: TIME_OR_NULL,
        }),
      ),
      items: arr(
        obj({
          id: STR,
          workPackageId: STR_OR_NULL,
          area: STR_OR_NULL,
          description: STR,
          requiredEvidence: STR,
          assignedTo: STAFF_REF_OR_NULL,
          dueOn: DATE_OR_NULL,
          state: en(PUNCH_ITEM_STATES),
          correctionNote: STR_OR_NULL,
          correctedBy: STAFF_REF_OR_NULL,
          correctedAt: TIME_OR_NULL,
          correctedOnVisit: STR_OR_NULL,
          recheckNote: STR_OR_NULL,
          recheckedBy: STAFF_REF_OR_NULL,
          recheckedAt: TIME_OR_NULL,
          version: INT,
          actions: obj({ recheck: BOOL }),
        }),
      ),
      costs: arr(
        obj({
          id: STR,
          kind: en(RETURN_COST_KINDS),
          amountCents: INT,
          note: STR,
          recordedBy: STAFF_REF_OR_NULL,
          recordedAt: TIME_OR_NULL,
          voided: nullable(obj({ reason: STR_OR_NULL, by: STAFF_REF_OR_NULL, at: TIME_OR_NULL })),
          actions: obj({ void: BOOL }),
        }),
      ),
      /** Costs in integer cents (RULE-MONEY-CENTS); labor is elapsed minutes only, its cost incomplete (HH-FIN-17). */
      totals: obj({
        costCents: INT,
        laborMinutes: INT,
        laborMinutesComplete: BOOL,
        laborCost: en(['incomplete']),
      }),
      history: arr(
        obj({ event: STR, subjectId: STR_OR_NULL, actor: STAFF_REF_OR_NULL, note: STR_OR_NULL, at: TIME_OR_NULL }),
      ),
    }),
  ),
  actions: ACTIONS,
})

export const OWN_ITEMS = obj({
  jobId: STR,
  items: arr(
    obj({
      id: STR,
      workPackageId: STR_OR_NULL,
      area: STR_OR_NULL,
      description: STR,
      requiredEvidence: STR,
      dueOn: DATE_OR_NULL,
      state: en(PUNCH_ITEM_STATES),
      correctionNote: STR_OR_NULL,
      version: INT,
      actions: obj({ correct: BOOL }),
    }),
  ),
})
