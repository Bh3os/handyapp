// Staff routes of the default preparation instructions (TSK-0146; OWN-DEC-194 B7, HH-SCH-11, HH-CUS-02,
// RULE-SERVER-AUTHZ).
//   GET  /staff/visits/:visitId/preparation-default      the text a visit's offer form starts from (visit.offer_windows)
//   GET  /staff/preparation-defaults                     the Owner's review of every service's default
//                                                        (service_content.approve)
//   POST /staff/services/:serviceId/preparation-defaults the Owner approves a service's default as its next version,
//                                                        or removes it (service_content.approve)
// The offer's own instructions are written by the offer routes (index.ts), checked by the same unsafe-instruction
// rules. The audit summary keeps the version, basis and length of a default, never its text.
import type { Tx } from '@handyhub/db'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, RouteDef } from '../../api/route.js'
import {
  approvePreparationDefault,
  preparationDefaults,
  visitPreparationDefault,
  type DefaultInput,
} from './preparation.js'
import {
  PREPARATION_DEFAULT_BODY,
  PREPARATION_DEFAULT_RESULT,
  PREPARATION_DEFAULTS,
  SERVICE_PARAMS,
  VISIT_PARAMS,
  VISIT_PREPARATION_DEFAULT,
} from './schemas.js'

const TEST = 'test/integration/preparation-defaults.test.ts'

const staffActor = (ctx: ApiContext) => {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

const visitProjectOf: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { visitId } = req.params as { visitId: string }
  const v = await db.selectFrom('work.visits').select('project_id').where('id', '=', visitId).executeTakeFirst()
  return v ? { projectId: v.project_id } : null
}

export function preparationRoutes(): RouteDef[] {
  const forVisit: RouteDef = {
    method: 'GET',
    path: '/staff/visits/:visitId/preparation-default',
    operationId: 'visitPreparationDefault',
    summary: "The preparation instructions a visit's offer starts from",
    description:
      'Staff with visit.offer_windows (Owner, Office; an Estimator PROPOSED). The Owner-approved default preparation ' +
      "instructions of the visit's services (OWN-DEC-194 B7): the job's work packages for a work visit, the project's " +
      'work packages (else the request’s services) for an estimate visit. text combines them (one service: its ' +
      'default; several: each under its service name, PROPOSED) and is null while none has an approved default; each ' +
      'service says approved (with its default version) or not_configured. tooLong: the combination is over the ' +
      '1,000 characters an offer keeps, so staff shorten it. Staff may change the text before offering; the offer ' +
      'keeps what they send.',
    actors: ['staff'],
    permission: 'visit.offer_windows',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    resource: visitProjectOf,
    schema: { params: VISIT_PARAMS, response: { 200: VISIT_PREPARATION_DEFAULT } },
    handler: async (ctx) => {
      staffActor(ctx)
      const { visitId } = ctx.req.params as { visitId: string }
      return { body: await visitPreparationDefault(ctx.db, ctx.scope, visitId) }
    },
  }

  const review: RouteDef = {
    method: 'GET',
    path: '/staff/preparation-defaults',
    operationId: 'listPreparationDefaults',
    summary: "Every service's default preparation instructions for offers",
    description:
      'The Owner only (service_content.approve). For each of the 26 services: the reviewed "Getting ready" steps of ' +
      'its approved page version (TSK-0132, OWN-DEC-180; one step per line, with the unsafe-instruction rules they ' +
      'meet, none for reviewed content), the default in force (null: NOT CONFIGURED, nothing is offered as a ' +
      'default), its version (0 for none) and every version approved, newest first.',
    actors: ['staff'],
    permission: 'service_content.approve',
    kind: 'read',
    idempotency: 'none',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'none',
    pagination: false,
    test: TEST,
    schema: { response: { 200: PREPARATION_DEFAULTS } },
    handler: async (ctx) => {
      staffActor(ctx)
      return { body: await preparationDefaults(ctx.db) }
    },
  }

  const approve: RouteDef = {
    method: 'POST',
    path: '/staff/services/:serviceId/preparation-defaults',
    operationId: 'approvePreparationDefault',
    summary: "Approve a service's default preparation instructions for offers",
    description:
      'The Owner only (service_content.approve; OWN-DEC-194 B7). Records the next version of the service’s default: ' +
      'source service_page takes the reviewed "Getting ready" steps of its approved page version as they are ' +
      '(SERVICE_PAGE_NOT_REVIEWED when there are none); source text is the Owner’s own text (TEXT_REQUIRED, ' +
      'TEXT_TOO_LONG over 1,000 characters); source none removes the default, so the service is NOT CONFIGURED again ' +
      '(NO_DEFAULT when there is none). currentVersion is the version the Owner saw (0 for none; STALE_VERSION ' +
      'otherwise). Every text passes the unsafe-instruction rules (VALIDATION_FAILED UNSAFE_<RULE>: hazardous ' +
      'materials, licensed trade work, structural work, heights and confined spaces, a hazard inspection; PROPOSED); ' +
      'the same text again is DEFAULT_UNCHANGED. An optional reason is kept. Offers saved afterwards start from it; ' +
      'offers already saved keep their instructions.',
    actors: ['staff'],
    permission: 'service_content.approve',
    kind: 'write',
    idempotency: 'required',
    expectedVersion: 'none',
    rateLimit: 'none',
    audit: 'visit.approve_preparation_default',
    pagination: false,
    test: TEST,
    schema: { params: SERVICE_PARAMS, body: PREPARATION_DEFAULT_BODY, response: { 200: PREPARATION_DEFAULT_RESULT } },
    handler: async (ctx) => {
      const { serviceId } = ctx.req.params as { serviceId: string }
      const body = ctx.req.body as DefaultInput
      const out = await approvePreparationDefault(ctx.tx as Tx, staffActor(ctx), serviceId, body)
      await ctx.audit({
        target: { type: 'preparation_default', id: out.id, version: out.version },
        summary: {
          serviceId: out.serviceId,
          version: out.version,
          basis: out.basis,
          serviceVersion: out.serviceVersion,
          length: out.length,
        },
        ...(body.reason?.trim() ? { reason: body.reason.trim() } : {}),
      })
      return {
        body: {
          id: out.id,
          serviceId: out.serviceId,
          version: out.version,
          basis: out.basis,
          serviceVersion: out.serviceVersion,
        },
      }
    },
  }

  return [forVisit, review, approve]
}
