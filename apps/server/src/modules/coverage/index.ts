// Coverage module (TSK-0022; HH-CUS-03, OWN-DEC-88). The public ZIP check: one of four outcomes with its message,
// from the same rule set as request submission and staff. An invalid format is a validation error with no outcome.
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { COVERAGE_OUTCOMES, ZIP_PATTERN, type CoverageOutcome } from '@handyhub/domain/coverage'
import type { ApiModule, RouteDef } from '../../api/route.js'
import { lookupCoverage } from './coverage.js'

/** The owner's exact message per outcome (OWN-DEC-88). */
export const OUTCOME_MESSAGE: Record<CoverageOutcome, CustomerKey> = {
  in_coverage: 'coverage.outcome.in_coverage',
  boundary: 'coverage.outcome.boundary',
  out_of_coverage: 'coverage.outcome.out_of_coverage',
  unknown: 'coverage.outcome.unknown',
}

const check: RouteDef = {
  method: 'GET',
  path: '/public/coverage',
  operationId: 'checkCoverage',
  summary: 'ZIP coverage check',
  description:
    'Guest or customer. The outcome for a ZIP (in_coverage, boundary, out_of_coverage or unknown) and its message, ' +
    'from the active coverage rule set; unknown while no rule set is active (configured: false). Area eligibility ' +
    'only: never an appointment, availability, price or travel charge, and never a reason to refuse a request.',
  actors: ['guest', 'customer'],
  permission: 'request.submit',
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'none',
  pagination: false,
  test: 'test/integration/coverage.test.ts',
  schema: {
    querystring: {
      type: 'object',
      additionalProperties: false,
      required: ['zip'],
      properties: { zip: { type: 'string', pattern: ZIP_PATTERN } },
    },
    response: {
      200: {
        type: 'object',
        additionalProperties: false,
        required: ['zip', 'outcome', 'configured', 'message'],
        properties: {
          zip: { type: 'string' },
          outcome: { type: 'string', enum: [...COVERAGE_OUTCOMES] },
          configured: { type: 'boolean' },
          message: { type: 'string' },
        },
      },
    },
  },
  handler: async (ctx) => {
    const { zip } = ctx.req.query as { zip: string }
    const result = await lookupCoverage(ctx.db, zip)
    return {
      body: {
        zip: zip.slice(0, 5),
        outcome: result.outcome,
        configured: result.ruleSet !== null,
        message: customerTranslator().t(OUTCOME_MESSAGE[result.outcome]),
      },
    }
  },
}

export const COVERAGE_MODULE: ApiModule = { name: 'coverage', routes: [check] }
