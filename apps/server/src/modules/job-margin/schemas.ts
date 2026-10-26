// JSON schemas of the job-margin routes (TSK-0131; HH-API-01, HH-ARC-04, HH-FIN-20). Input objects refuse unknown
// fields; response objects list every field. A margin that is not final carries no percentage, profit or totals,
// only why (`gaps`); amounts are integer cents and percentages basis points.
import { LABOR_RATE_MAX_CENTS, MARGIN_FLAGS, MARGIN_GAPS, MARGIN_REASONS } from '@handyhub/domain'

const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const UUID = { type: 'string', pattern: UUID_PATTERN } as const
const STR = { type: 'string' } as const
const STR_OR_NULL = { type: ['string', 'null'] } as const
const INT = { type: 'integer' } as const
const INT_OR_NULL = { type: ['integer', 'null'] } as const
const BOOL = { type: 'boolean' } as const
const TIME = { type: 'string', format: 'date-time' } as const
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const
const TEXT = (max: number) => ({ type: 'string', minLength: 1, maxLength: max, pattern: '\\S' }) as const
const en = (values: readonly string[]) => ({ type: 'string', enum: [...values] }) as const
const arr = (items: unknown) => ({ type: 'array', items }) as const

function obj(properties: Record<string, unknown>) {
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties } as const
}
function input(properties: Record<string, unknown>, optional: readonly string[] = []) {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties).filter((k) => !optional.includes(k)),
    properties,
  } as const
}
const RATE = { type: 'integer', minimum: 0, maximum: LABOR_RATE_MAX_CENTS } as const

export const RATE_BODY = input({
  staffUserId: UUID,
  effectiveOn: DATE,
  rateCents: RATE,
  burdenCents: { anyOf: [{ type: 'null' }, RATE] },
  reason: TEXT(500),
})
export const REVIEW_BODY = input({ reason: en(MARGIN_REASONS), note: TEXT(1000) }, ['note'])
export const TARGET_BODY = input({
  targetBps: { type: 'integer', minimum: 1, maximum: 9999 },
  reason: TEXT(1000),
})

export const TARGET_SETTING = obj({
  state: en(['CONFIGURED', 'NOT_CONFIGURED']),
  version: INT_OR_NULL,
  targetBps: INT_OR_NULL,
  sourceIds: arr(STR),
})

export const LABOR_RATES_VIEW = obj({
  today: STR,
  workers: arr(
    obj({
      staffUserId: STR,
      name: STR_OR_NULL,
      status: STR,
      roles: arr(STR),
      inForce: { anyOf: [{ type: 'null' }, obj({ effectiveOn: STR, rateCents: INT, burdenCents: INT_OR_NULL })] },
      rates: arr(
        obj({
          id: STR,
          effectiveOn: STR,
          rateCents: INT,
          burdenCents: INT_OR_NULL,
          reason: STR,
          enteredBy: obj({ id: STR, name: STR_OR_NULL }),
          enteredAt: TIME,
        }),
      ),
    }),
  ),
})

const MARGIN = obj({
  state: en(['complete', 'incomplete']),
  revenueCents: INT_OR_NULL,
  costCents: INT_OR_NULL,
  grossProfitCents: INT_OR_NULL,
  marginBps: INT_OR_NULL,
  gaps: arr(en(MARGIN_GAPS)),
})

/** The margin part of the job cost report (GET /staff/jobs/:jobId/costs). */
export const MARGIN_VIEW = obj({
  targetBps: INT_OR_NULL,
  targetVersion: INT_OR_NULL,
  estimatedPriceCents: INT_OR_NULL,
  revenue: obj({
    state: en(['complete', 'not_invoiced', 'incomplete']),
    cents: INT_OR_NULL,
    invoicedCents: INT,
    refundsCents: INT,
    creditsCents: INT,
    gaps: arr(en(MARGIN_GAPS)),
  }),
  estimated: MARGIN,
  actual: MARGIN,
  varianceBps: INT_OR_NULL,
  profitVarianceCents: INT_OR_NULL,
  flag: en(MARGIN_FLAGS),
  estimatedFlag: en(MARGIN_FLAGS),
  reviewed: BOOL,
  reviews: arr(
    obj({
      id: STR,
      reason: en(MARGIN_REASONS),
      note: STR_OR_NULL,
      revenueCents: INT,
      costCents: INT,
      grossProfitCents: INT,
      marginBps: INT_OR_NULL,
      targetBps: INT,
      recordedBy: obj({ id: STR, name: STR_OR_NULL }),
      recordedAt: TIME,
      current: BOOL,
    }),
  ),
  report: en(['job_margin']),
  actions: obj({ review: BOOL }),
})
