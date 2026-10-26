// JSON schemas of the Owner Dashboard and accounting-export routes (TSK-0096; HH-API-01, HH-ARC-04, HH-FIN-16,
// HH-FIN-18). A figure is its state and, when known or incomplete, its integer value (cents, a count, minutes or basis
// points); an unknown value is null with its state, never a zero.
import {
  ACCOUNTING_DATASETS,
  DASHBOARD_FIGURE_IDS,
  DASHBOARD_SCOPES,
  DASHBOARD_SECTIONS,
  DASHBOARD_UNITS,
  FIGURE_STATES,
  REPORT_BASES,
  REPORT_DEFINITIONS,
} from '@handyhub/domain'

const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const STR = { type: 'string' } as const
const STR_OR_NULL = { type: ['string', 'null'] } as const
const INT = { type: 'integer' } as const
const INT_OR_NULL = { type: ['integer', 'null'] } as const
const BOOL = { type: 'boolean' } as const
const TIME = { type: 'string', format: 'date-time' } as const
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const
const en = (values: readonly string[]) => ({ type: 'string', enum: [...values] }) as const

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
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [{ type: 'null' }, schema] }) as const
const arr = (items: unknown) => ({ type: 'array', items }) as const

export const PERIOD_QUERY = input({ from: DATE, to: DATE })
export const RECORDS_QUERY = input(
  {
    from: DATE,
    to: DATE,
    figure: en(DASHBOARD_FIGURE_IDS),
    detail: { type: 'string', pattern: UUID_PATTERN },
    previous: { type: 'boolean' },
  },
  ['detail', 'previous'],
)
export const DASHBOARD_EXPORT_BODY = input({ from: DATE, to: DATE })
export const ACCOUNTING_EXPORT_BODY = input({
  dataset: en(ACCOUNTING_DATASETS),
  from: DATE,
  to: DATE,
  reason: { type: 'string', minLength: 1, maxLength: 500, pattern: '\\S' },
})

const VALUE = obj({ state: en(FIGURE_STATES), value: INT_OR_NULL })
const REPORT = nullable(
  obj({
    id: en(REPORT_DEFINITIONS.map((d) => d.id)),
    basis: en(REPORT_BASES),
    unknown: en(['incomplete', 'unavailable']),
  }),
)
const PERIOD = obj({ from: DATE, to: DATE, days: INT, previous: obj({ from: DATE, to: DATE }) })

export const DASHBOARD_VIEW = obj({
  period: PERIOD,
  zone: STR,
  generatedAt: TIME,
  figures: arr(
    obj({
      id: en(DASHBOARD_FIGURE_IDS),
      section: en(DASHBOARD_SECTIONS),
      unit: en(DASHBOARD_UNITS),
      scope: en(DASHBOARD_SCOPES),
      report: REPORT,
      detail: nullable(obj({ id: STR, name: STR_OR_NULL })),
      current: VALUE,
      previous: nullable(VALUE),
    }),
  ),
  accounting: obj({
    depositRevenueRecognition: en(['not_configured']),
    taxTreatment: en(['not_configured']),
    writeOffPresentation: en(['not_configured']),
  }),
})

export const DASHBOARD_RECORDS = obj({
  figure: en(DASHBOARD_FIGURE_IDS),
  unit: en(DASHBOARD_UNITS),
  scope: en(DASHBOARD_SCOPES),
  report: REPORT,
  detail: STR_OR_NULL,
  period: obj({ from: DATE, to: DATE }),
  generatedAt: TIME,
  value: VALUE,
  total: INT,
  totalCents: INT_OR_NULL,
  truncated: BOOL,
  rows: arr(
    obj({
      id: STR,
      reference: STR_OR_NULL,
      on: STR_OR_NULL,
      state: STR_OR_NULL,
      cents: INT_OR_NULL,
      minutes: INT_OR_NULL,
      link: nullable(obj({ screen: STR, id: STR_OR_NULL })),
    }),
  ),
})

export const EXPORT_FILE = obj({
  filename: STR,
  contentType: en(['text/csv']),
  rows: INT,
  csv: STR,
})
