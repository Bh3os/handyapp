// JSON schemas of the change-order routes (TSK-0081; HH-API-01, HH-ARC-04). Input objects refuse unknown fields;
// response objects list every field, so a projection never carries more than it declares.
import { CHANGE_ORDER_ORIGINS, CHANGE_ORDER_STATES } from '@handyhub/domain'
import { CHANGE_ORDER_LINE_KINDS } from '@handyhub/money'

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
const TEXT_OR_NULL = (max: number) => ({ type: ['string', 'null'], maxLength: max }) as const
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
const upTo = (items: unknown, max: number) => ({ type: 'array', items, maxItems: max }) as const
const STAFF_REF = obj({ id: STR, name: STR_OR_NULL })

export const JOB_PARAMS = obj({ jobId: UUID })
export const CHANGE_ORDER_PARAMS = obj({ changeOrderId: UUID })
export const NO_QUERY = { type: 'object', additionalProperties: false, properties: {} } as const

const STEP_REF = obj({ workPackageId: UUID, stepId: { type: 'string', pattern: '^[0-9]+\\.[0-9]+$', maxLength: 10 } })

const LINE_INPUT = input(
  {
    kind: en(CHANGE_ORDER_LINE_KINDS),
    description: TEXT(2000),
    workPackageId: UUID_OR_NULL,
    // A plain decimal quantity of the unit, up to three decimals ("2.5"); null while unknown.
    quantity: { type: ['string', 'null'], maxLength: 20 },
    unit: TEXT_OR_NULL(40),
    unitPriceCents: { type: ['integer', 'null'], minimum: 1, maximum: 100_000_000 },
  },
  ['workPackageId', 'quantity', 'unit', 'unitPriceCents'],
)

const DRAFT_FIELDS = {
  reason: TEXT(2000),
  scope: TEXT(4000),
  scheduleImpact: TEXT_OR_NULL(2000),
  hazards: TEXT_OR_NULL(2000),
  resources: TEXT_OR_NULL(2000),
  measurements: TEXT_OR_NULL(2000),
  photoIds: upTo(UUID, 20),
  affectedSteps: upTo(STEP_REF, 50),
  lines: upTo(LINE_INPUT, 50),
}
const DRAFT_OPTIONAL = ['scheduleImpact', 'hazards', 'resources', 'measurements', 'photoIds', 'affectedSteps']

export const CREATE_BODY = input({ ...DRAFT_FIELDS, origin: en(CHANGE_ORDER_ORIGINS) }, [...DRAFT_OPTIONAL, 'origin'])
export const UPDATE_BODY = input(DRAFT_FIELDS, DRAFT_OPTIONAL)
export const EVENT_BODY = input({ reason: TEXT(1000) }, ['reason'])

export const WRITE_RESULT = obj({
  changeOrderId: STR,
  versionId: STR,
  state: en(CHANGE_ORDER_STATES),
  rowVersion: INT,
})
export const CREATE_RESULT = obj({
  changeOrderId: STR,
  number: INT,
  reference: STR,
  versionId: STR,
  origin: en(CHANGE_ORDER_ORIGINS),
  rowVersion: INT,
})

const LINE = obj({
  position: INT,
  kind: en(CHANGE_ORDER_LINE_KINDS),
  description: STR,
  workPackageId: STR_OR_NULL,
  quantity: STR_OR_NULL,
  unit: STR_OR_NULL,
  unitPriceCents: INT_OR_NULL,
  amountCents: INT_OR_NULL,
})
const VERSION = obj({
  versionId: STR,
  version: INT,
  state: en(CHANGE_ORDER_STATES),
  reason: STR,
  scope: STR,
  scheduleImpact: STR_OR_NULL,
  hazards: STR_OR_NULL,
  resources: STR_OR_NULL,
  measurements: STR_OR_NULL,
  photoIds: arr(STR),
  affectedSteps: arr(obj({ workPackageId: STR, stepId: STR })),
  base: obj({ snapshotId: STR, totalCents: INT }),
  chargesCents: INT_OR_NULL,
  creditsCents: INT_OR_NULL,
  revisedTotalCents: INT_OR_NULL,
  lines: arr(LINE),
  draftedBy: STAFF_REF,
  draftedAt: TIME,
  updatedAt: TIME,
  reviewedBy: nullable(STAFF_REF),
  reviewedAt: TIME_OR_NULL,
  withdrawnBy: nullable(STAFF_REF),
  withdrawnAt: TIME_OR_NULL,
  withdrawReason: STR_OR_NULL,
  rowVersion: INT,
})

export const CHANGE_ORDERS_VIEW = obj({
  jobId: STR,
  reference: STR,
  jobState: STR,
  approved: nullable(obj({ snapshotVersion: INT, totalCents: INT })),
  paidCents: INT,
  packages: arr(obj({ id: STR, code: STR, steps: arr(obj({ id: STR, stage: INT, text: STR })) })),
  photos: arr(obj({ id: STR, workPackageId: STR_OR_NULL, phase: STR, areaLabel: STR_OR_NULL })),
  changeOrders: arr(
    obj({
      changeOrderId: STR,
      number: INT,
      reference: STR,
      origin: en(CHANGE_ORDER_ORIGINS),
      createdAt: TIME,
      current: VERSION,
      history: arr(obj({ version: INT, state: en(CHANGE_ORDER_STATES), updatedAt: TIME_OR_NULL })),
      actions: obj({ edit: BOOL, review: BOOL, reopen: BOOL, withdraw: BOOL }),
    }),
  ),
  actions: obj({ create: BOOL, chooseOrigin: BOOL }),
})
