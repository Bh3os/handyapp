// JSON schemas of the job-cost routes (TSK-0095; HH-API-01, HH-ARC-04, HH-FIN-17, HH-DATA-10). Input objects refuse
// unknown fields: there is no labor, burden, rate, margin or target to send. Response objects list every field; a
// figure is its state and, when known, its cents (never a zero standing for "unknown").
import {
  JOB_COST_CATEGORIES,
  JOB_COST_EVENTS,
  JOB_COST_LINES,
  JOB_COST_MAX_CENTS,
  REPORT_BASES,
  REPORT_DEFINITIONS,
} from '@handyhub/domain'

const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const UUID = { type: 'string', pattern: UUID_PATTERN } as const
const STR = { type: 'string' } as const
const STR_OR_NULL = { type: ['string', 'null'] } as const
const INT = { type: 'integer' } as const
const INT_OR_NULL = { type: ['integer', 'null'] } as const
const BOOL = { type: 'boolean' } as const
const TIME_OR_NULL = { type: ['string', 'null'], format: 'date-time' } as const
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const
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
export const CATEGORY_PARAMS = obj({ jobId: UUID, category: en(JOB_COST_CATEGORIES) })
export const COST_PARAMS = obj({ costId: UUID })
export const NO_QUERY = input({})

export const COST_BODY = input({
  category: en(JOB_COST_CATEGORIES),
  amountCents: { type: 'integer', minimum: 1, maximum: JOB_COST_MAX_CENTS },
  incurredOn: DATE,
  note: TEXT(500),
})
export const VOID_BODY = input({ reason: TEXT(500) })
export const CONFIRM_BODY = input({ note: TEXT(1000) }, ['note'])
export const REOPEN_BODY = input({ reason: TEXT(1000) })

/** A figure: complete (cents), incomplete (the known part), not recorded, not estimated or not configured (null). */
const FIGURE = obj({
  state: en(['complete', 'incomplete', 'not_recorded', 'not_estimated', 'not_configured']),
  cents: INT_OR_NULL,
})

const SOURCE = obj({
  record: STR,
  where: arr(obj({ column: STR, values: arr(STR) })),
  countsOnce: en(['per_row', 'per_estimate', 'per_payment']),
})
/** A report definition with its declared source states (@handyhub/domain REPORT_DEFINITIONS). */
export const REPORT = obj({
  id: en(REPORT_DEFINITIONS.map((d) => d.id)),
  basis: en(REPORT_BASES),
  includes: arr(SOURCE),
  excludes: arr(SOURCE),
  unknown: en(['incomplete', 'unavailable']),
  builtBy: STR,
})
export const REPORTS = obj({ reports: arr(REPORT) })

export const JOB_COSTS_VIEW = obj({
  jobId: STR,
  projectId: STR,
  projectReference: STR,
  jobState: STR,
  estimate: nullable(obj({ number: STR_OR_NULL, version: INT_OR_NULL })),
  changeOrders: INT,
  lines: arr(
    obj({
      line: en(JOB_COST_LINES),
      estimated: FIGURE,
      actual: FIGURE,
      varianceCents: INT_OR_NULL,
      confirmed: nullable(obj({ by: STAFF_REF_OR_NULL, at: TIME_OR_NULL })),
      actions: obj({ confirm: BOOL, reopen: BOOL }),
    }),
  ),
  totals: obj({
    estimated: FIGURE,
    actual: FIGURE,
    varianceCents: INT_OR_NULL,
    incompleteLines: arr(en(JOB_COST_LINES)),
  }),
  /** Elapsed minutes per worker and visit (OWN-DEC-69); their cost needs a labor rate that is NOT CONFIGURED. */
  labor: obj({
    minutes: INT,
    minutesComplete: BOOL,
    unknownTimes: INT,
    times: arr(
      obj({
        visitId: STR,
        visitNumber: INT,
        localDate: STR,
        staffUserId: STR,
        name: STR_OR_NULL,
        minutes: INT_OR_NULL,
        flagged: BOOL,
      }),
    ),
  }),
  entries: arr(
    obj({
      id: STR,
      category: en(JOB_COST_CATEGORIES),
      amountCents: INT,
      incurredOn: STR,
      note: STR,
      recordedBy: STAFF_REF_OR_NULL,
      recordedAt: TIME_OR_NULL,
      voided: nullable(obj({ reason: STR_OR_NULL, by: STAFF_REF_OR_NULL, at: TIME_OR_NULL })),
      actions: obj({ void: BOOL }),
    }),
  ),
  returnWork: obj({ cost: FIGURE, entries: INT, caseIds: arr(STR) }),
  history: arr(
    obj({
      event: en(JOB_COST_EVENTS),
      category: en(JOB_COST_CATEGORIES),
      costId: STR_OR_NULL,
      actor: STAFF_REF_OR_NULL,
      note: STR_OR_NULL,
      at: TIME_OR_NULL,
    }),
  ),
  report: REPORT,
  actions: obj({ record: BOOL }),
})
