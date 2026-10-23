// JSON schemas of the checklist routes (TSK-0075; HH-API-01). Inputs refuse unknown fields; responses list every field.
import { CHECKLIST_STEP_STATES, SOP_EVIDENCE_KINDS } from '@handyhub/domain'

const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const UUID = { type: 'string', pattern: UUID_PATTERN } as const
const UUID_OR_NULL = { type: ['string', 'null'], pattern: UUID_PATTERN } as const
const STR = { type: 'string' } as const
const STR_OR_NULL = { type: ['string', 'null'] } as const
const INT = { type: 'integer' } as const
const INT_OR_NULL = { type: ['integer', 'null'] } as const
const BOOL = { type: 'boolean' } as const
const TIME = { type: 'string', format: 'date-time' } as const
const TIME_OR_NULL = { type: ['string', 'null'], format: 'date-time' } as const
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

export const JOB_PARAMS = obj({ jobId: UUID })
export const NO_QUERY = input({})

export const STEP_BODY = input(
  {
    workPackageId: UUID,
    stepId: { type: 'string', pattern: '^[1-6]\\.[0-9]{1,3}$' },
    version: { type: 'integer', minimum: 0 },
    measurement: TEXT(200),
    note: TEXT(2000),
    photoIds: { type: 'array', items: UUID, maxItems: 20 },
    reason: TEXT(1000),
  },
  ['measurement', 'note', 'photoIds', 'reason'],
)
export const STEP_RESULT = obj({
  id: STR,
  state: en(CHECKLIST_STEP_STATES),
  version: INT,
  workPackageId: STR,
  stepId: STR,
})
export const HANDOFF_BODY = input({ note: TEXT(2000), toWorkerId: UUID, workPackageId: UUID }, [
  'toWorkerId',
  'workPackageId',
])
export const HANDOFF_RESULT = obj({ handoffId: STR, at: TIME })

const SUMMARY = obj({
  steps: INT,
  completed: INT,
  skipped: INT,
  requiredSkipped: INT,
  requiredOpen: INT,
  complete: BOOL,
})
export const CHECKLIST_SUMMARY = SUMMARY

export const CHECKLIST_VIEW = obj({
  jobId: STR,
  reference: STR,
  jobState: STR,
  blockers: arr(STR),
  packages: arr(
    obj({
      workPackageId: STR,
      code: STR,
      state: STR,
      sop: nullable(obj({ versionId: STR, title: STR_OR_NULL, pendingReview: BOOL })),
      currentStage: INT,
      summary: SUMMARY,
      stages: arr(
        obj({
          stage: INT,
          key: STR,
          heading: STR,
          open: BOOL,
          steps: arr(
            obj({
              stepId: STR,
              text: STR,
              line: INT_OR_NULL,
              required: BOOL,
              evidence: arr(en(SOP_EVIDENCE_KINDS)),
              holdBefore: arr(STR),
              state: en(CHECKLIST_STEP_STATES),
              version: INT,
              measurement: STR_OR_NULL,
              note: STR_OR_NULL,
              photoIds: arr(STR),
              skipReason: STR_OR_NULL,
              worker: STAFF_REF_OR_NULL,
              completedBy: STAFF_REF_OR_NULL,
              completedAt: TIME_OR_NULL,
              actions: arr(STR),
            }),
          ),
        }),
      ),
    }),
  ),
  photos: arr(obj({ id: STR, workPackageId: STR, phase: STR, areaLabel: STR_OR_NULL, uploadedAt: TIME })),
  handoffs: arr(
    obj({ id: STR, workPackageId: UUID_OR_NULL, from: STAFF_REF, to: STAFF_REF_OR_NULL, note: STR, at: TIME }),
  ),
  workers: arr(STAFF_REF),
  actions: obj({ handoff: BOOL }),
})
