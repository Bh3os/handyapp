// Requests module (TSK-0025; HH-INT-10, HH-INT-11, HH-ID-01, HH-INT-21). The public submission route, and the
// staff record header the action queue's deep link opens (TSK-0041).
import { readIdempotencyKey } from '../../api/idempotency.js'
import type { ApiModule, RouteDef } from '../../api/route.js'
import { publicServices, type RegistryEnvironment } from '@handyhub/db'
import { serviceQuestions } from '@handyhub/domain/request-form'
import { loadConfig } from '../../platform/config/index.js'
import { formWindows } from './submit.js'
import { currentContext } from '../../platform/request-context.js'
import { photoLimits } from '../photos/photos.js'
import { MAX_SERVICES, SUBMIT_BODY, SUBMIT_RESPONSE, type SubmitBody } from './schema.js'
import { staffRequestSummary } from './staff-summary.js'
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
      body: {
        status: 'received',
        reference: out.reference,
        submittedAt: out.submittedAt.toISOString(),
        ...(body.photoDraft ? { photos: out.photos } : {}),
      },
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
    'the business time zone, the service limit and the photo limits (uploads.limits). draftDays is null while the value is NOT CONFIGURED; the wizard then keeps no draft. ' +
    'TSK-0028: the visit hours (contact.hours, FACT-HOURS), the preferred windows offered with their configured hours ' +
    '(request.window_hours; no hours while NOT CONFIGURED) and whether estimates are free (estimate.visit_fee, ' +
    'FACT-VISIT-FEE). Preferences only: nothing here is availability, a slot or a price.',
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
        required: ['draftDays', 'maxServices', 'timeZone', 'photos', 'visitHours', 'windows', 'freeEstimates'],
        properties: {
          draftDays: { type: ['integer', 'null'] },
          maxServices: { type: 'integer' },
          timeZone: { type: ['string', 'null'] },
          // The configured photo limits (uploads.limits, TSK-0031); null while NOT CONFIGURED (no photo uploads then).
          photos: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['maxFileBytes', 'maxPhotos', 'types'],
            properties: {
              maxFileBytes: { type: 'integer' },
              maxPhotos: { type: 'integer' },
              types: { type: 'array', items: { type: 'string' } },
            },
          },
          visitHours: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['open', 'close'],
            properties: { open: { type: 'string' }, close: { type: 'string' } },
          },
          windows: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['code'],
              properties: { code: { type: 'string' }, start: { type: 'string' }, end: { type: 'string' } },
            },
          },
          freeEstimates: { type: 'boolean' },
        },
      },
    },
  },
  handler: async (ctx) => {
    const config = await loadConfig(ctx.db)
    const hours = config.get('contact.hours')
    const fee = config.get('estimate.visit_fee')
    const timings = config.get('session.timings')
    const zone = config.get('business.timezone')
    return {
      body: {
        draftDays: timings.state === 'CONFIGURED' ? timings.value.requestDraftDays : null,
        maxServices: MAX_SERVICES,
        // The preferred date is tomorrow or later in the property's local time (OWN-DEC-92).
        timeZone: zone.state === 'CONFIGURED' ? zone.value.zone : null,
        photos: photoLimits(config),
        visitHours: hours.state === 'CONFIGURED' ? { open: hours.value.open, close: hours.value.close } : null,
        windows: formWindows(config),
        // The free-estimate wording appears only while the configured policy says so (FACT-VISIT-FEE).
        freeEstimates: fee.state === 'CONFIGURED' && fee.value.policy === 'free',
      },
      headers: { 'cache-control': 'no-cache' },
    }
  },
}

/** The services the public request form offers, with their questions (TSK-0027; HH-INT-15, HH-SVC-03, OWN-DEC-84). */
const publicServiceList: RouteDef = {
  method: 'GET',
  path: '/public/services',
  operationId: 'listRequestServices',
  summary: 'Services and their questions for the request form',
  description:
    'Public read of the registry services the public site may show (production: approved and published; other ' +
    'environments: staging or published), each with its registry name, category and the questions from its ' +
    'intake inputs. Draft services are never listed.',
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
        required: ['services'],
        properties: {
          services: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'category', 'name', 'questions'],
              properties: {
                id: { type: 'string' },
                category: { type: 'string' },
                name: { type: 'string' },
                questions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['key', 'label'],
                    properties: { key: { type: 'string' }, label: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  handler: async (ctx) => {
    const environment = (process.env['HANDYHUB_ENV'] ?? 'local') as RegistryEnvironment
    const listed = await publicServices(ctx.db, environment)
    const intakes = listed.length
      ? await ctx.db
          .selectFrom('catalog.service_versions')
          .select(['service_id', 'version', 'intake'])
          .where((eb) => eb.or(listed.map((s) => eb.and([eb('service_id', '=', s.id), eb('version', '=', s.version)]))))
          .execute()
      : []
    return {
      body: {
        services: listed.map((s) => ({
          id: s.id,
          category: s.category,
          name: s.name,
          questions: serviceQuestions(
            (intakes.find((i) => i.service_id === s.id)?.intake ?? { guideInputs: [] }) as { guideInputs: string[] },
          ),
        })),
      },
      headers: { 'cache-control': 'no-cache' },
    }
  },
}

export const REQUESTS_MODULE: ApiModule = {
  name: 'requests',
  routes: [submit, formSettings, publicServiceList, staffRequestSummary],
}
