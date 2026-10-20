// Requests module (TSK-0025; HH-INT-10, HH-INT-11, HH-ID-01, HH-INT-21). The public submission route.
import { readIdempotencyKey } from '../../api/idempotency.js'
import type { ApiModule, RouteDef } from '../../api/route.js'
import { loadConfig } from '../../platform/config/index.js'
import { currentContext } from '../../platform/request-context.js'
import { MAX_SERVICES, SUBMIT_BODY, SUBMIT_RESPONSE, type SubmitBody } from './schema.js'
import { submitRequest } from './submit.js'

/** PROPOSED (old repo, 32 D-32-08): 5 submissions per client network per hour; no owner value exists. */
export const SUBMIT_RATE_LIMIT = { bucket: 'public-request-submit', limit: 5, windowSeconds: 3600 } as const

const submit: RouteDef = {
  method: 'POST',
  path: '/public/requests',
  operationId: 'submitRequest',
  summary: 'Send Estimate Request',
  description:
    'Guest or customer submission. One transaction creates a new customer, contact, property, project (not a job or ' +
    'appointment) and the request with its services and answers, plus one request.submitted outbox event. Never ' +
    'matched to existing customers. The same Idempotency-Key returns the same request; a changed body is a 409. ' +
    'Rate limited per client network with a neutral 429. Spam signals only flag the request for review.',
  actors: ['guest', 'customer'],
  permission: 'request.submit',
  kind: 'write',
  idempotency: 'required',
  expectedVersion: 'none',
  rateLimit: SUBMIT_RATE_LIMIT,
  audit: 'request.submit',
  pagination: false,
  test: 'test/integration/requests.test.ts',
  schema: {
    body: SUBMIT_BODY,
    response: { 201: SUBMIT_RESPONSE },
  },
  handler: async (ctx) => {
    if (!ctx.tx) throw new Error('submitRequest runs inside its write transaction')
    const body = ctx.req.body as SubmitBody
    const out = await submitRequest(ctx.tx, body, {
      idempotencyKey: readIdempotencyKey(ctx.req.headers['idempotency-key']),
      requestId: currentContext()?.requestId ?? ctx.req.id,
    })
    // The audit event carries the reference and codes only, never the visitor's personal data.
    await ctx.audit({
      target: { type: 'request', id: out.requestId, version: 1 },
      summary: { reference: out.reference, services: out.serviceCodes, spamSuspected: out.spamSuspected },
    })
    return {
      status: 201,
      body: { status: 'received', reference: out.reference, submittedAt: out.submittedAt.toISOString() },
    }
  },
}

/** The request form's settings, from configuration (TSK-0026): how long the browser keeps an unfinished draft. */
const formSettings: RouteDef = {
  method: 'GET',
  path: '/public/request-form',
  operationId: 'getRequestFormSettings',
  summary: 'Request form settings',
  description:
    'Public read of the configured request-draft period (session.timings.requestDraftDays, FACT-SESSION-TIMINGS), ' +
    'the business time zone and the service limit. draftDays is null while the value is NOT CONFIGURED; the wizard then keeps no draft.',
  actors: ['guest', 'customer'],
  permission: 'request.submit',
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'none',
  pagination: false,
  test: 'test/integration/requests.test.ts',
  schema: {
    response: {
      200: {
        type: 'object',
        additionalProperties: false,
        required: ['draftDays', 'maxServices', 'timeZone'],
        properties: {
          draftDays: { type: ['integer', 'null'] },
          maxServices: { type: 'integer' },
          timeZone: { type: ['string', 'null'] },
        },
      },
    },
  },
  handler: async (ctx) => {
    const config = await loadConfig(ctx.db)
    const timings = config.get('session.timings')
    const zone = config.get('business.timezone')
    return {
      body: {
        draftDays: timings.state === 'CONFIGURED' ? timings.value.requestDraftDays : null,
        maxServices: MAX_SERVICES,
        // The preferred date is tomorrow or later in the property's local time (OWN-DEC-92).
        timeZone: zone.state === 'CONFIGURED' ? zone.value.zone : null,
      },
      headers: { 'cache-control': 'no-cache' },
    }
  },
}

export const REQUESTS_MODULE: ApiModule = { name: 'requests', routes: [submit, formSettings] }
