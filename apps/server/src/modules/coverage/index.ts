// Coverage module (TSK-0022; HH-CUS-03, OWN-DEC-88). The public ZIP check: one of four outcomes with its message,
// from the same rule set as request submission and staff. An invalid format is a validation error with no outcome.
// TSK-0127 (OWN-DEC-179): the outcome also carries its OWN-DEC-179 code (SERVED, EDGE, OUTSIDE, UNKNOWN; PROPOSED
// mapping) and, for a PO Box or Unique ZIP, a note asking for the property's ZIP (PROPOSED wording, English only).
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import {
  COVERAGE_CODE,
  COVERAGE_OUTCOMES,
  isMailingZip,
  ZIP_PATTERN,
  type CoverageOutcome,
} from '@handyhub/domain/coverage'
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
    'Guest or customer. The outcome for a ZIP (in_coverage, boundary, out_of_coverage or unknown), its code ' +
    '(SERVED, EDGE, OUTSIDE, UNKNOWN) and its message, from the active coverage rule set; unknown while no rule set ' +
    'is active (configured: false). A PO Box or Unique ZIP is unknown with a note asking for the property ZIP (it ' +
    'never proves coverage). Area eligibility only: never an appointment, availability, price or travel charge, and ' +
    'never a reason to refuse a request.',
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
        required: ['zip', 'outcome', 'code', 'configured', 'message', 'note'],
        properties: {
          zip: { type: 'string' },
          outcome: { type: 'string', enum: [...COVERAGE_OUTCOMES] },
          code: { type: 'string', enum: [...new Set(Object.values(COVERAGE_CODE))] },
          configured: { type: 'boolean' },
          message: { type: 'string' },
          note: { type: ['string', 'null'] },
        },
      },
    },
  },
  handler: async (ctx) => {
    const { zip } = ctx.req.query as { zip: string }
    const result = await lookupCoverage(ctx.db, zip)
    const { t } = customerTranslator()
    return {
      body: {
        zip: zip.slice(0, 5),
        outcome: result.outcome,
        code: COVERAGE_CODE[result.outcome],
        configured: result.ruleSet !== null,
        message: t(OUTCOME_MESSAGE[result.outcome]),
        note: isMailingZip(result.zipCategory) ? t('coverage.mailingZip') : null,
      },
    }
  },
}

export const COVERAGE_MODULE: ApiModule = { name: 'coverage', routes: [check] }
