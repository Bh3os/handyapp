// JSON schemas of the completion routes (TSK-0083; HH-API-01). Inputs refuse unknown fields; responses list every
// field.
import { PARTICIPANT_ROLES, QUALITY_REVIEW_STATES, WALKTHROUGH_OUTCOMES } from '@handyhub/domain'

const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const UUID = { type: 'string', pattern: UUID_PATTERN } as const
const STR = { type: 'string' } as const
const STR_OR_NULL = { type: ['string', 'null'] } as const
const INT = { type: 'integer' } as const
const INT_OR_NULL = { type: ['integer', 'null'] } as const
const BOOL = { type: 'boolean' } as const
const TIME = { type: 'string', format: 'date-time' } as const
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

export const JOB_PARAMS = obj({ jobId: UUID })
export const NO_QUERY = input({})

export const SUBMIT_BODY = input(
  {
    outcome: en(WALKTHROUGH_OUTCOMES),
    participantName: TEXT(200),
    participantRole: en(PARTICIPANT_ROLES),
    comments: TEXT(2000),
  },
  ['participantName', 'participantRole', 'comments'],
)
export const SUBMIT_RESULT = obj({
  completionId: STR,
  walkthroughId: STR,
  submittedAt: TIME,
  jobState: STR,
  caseNumber: INT_OR_NULL,
  reviewState: en(QUALITY_REVIEW_STATES),
})
export const COMPLETION_VIEW = obj({
  jobId: STR,
  jobState: STR,
  packages: arr(obj({ code: STR, checklistComplete: BOOL, beforePhotos: INT, afterPhotos: INT })),
  problems: arr(input({ code: STR, workPackage: STR }, ['workPackage'])),
  submission: nullable(
    obj({
      submittedAt: TIME,
      worker: obj({ id: STR, name: STR_OR_NULL }),
      walkthrough: obj({
        outcome: en(WALKTHROUGH_OUTCOMES),
        participantName: STR_OR_NULL,
        participantRole: enOrNull(PARTICIPANT_ROLES),
        comments: STR_OR_NULL,
        caseNumber: INT_OR_NULL,
      }),
    }),
  ),
  actions: obj({ submit: BOOL }),
})
