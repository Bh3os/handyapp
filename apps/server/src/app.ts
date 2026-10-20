// Fastify application factory (TSK-0001, TSK-0003, TSK-0010, TSK-0011). Order: the request-ID context, the staging
// access gate (first route hook, in front of every route), noindex headers outside production, the health checks,
// robots.txt, the API modules under /api/v1, then the built public site. Host routing for the portal and the staff app arrives in TSK-0017.
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify'
import { accessGateHook, FailureLimiter } from './access-gate.js'
import type { Config } from './config.js'
import { createDb, type Db } from '@handyhub/db'
import { registerApi } from './api/register.js'
import type { ApiModule, ResolveActor } from './api/route.js'
import { databaseReadiness, type ReadinessCheck } from './health.js'
import { MODULES } from './modules/index.js'
import { createLogger, type Logger } from './platform/logger.js'
import { registerRequestContext, requestIdFrom } from './platform/request-context.js'

export interface AppOptions {
  config: Config
  /** Readiness check; defaults to one built from config.databaseUrl. */
  readiness?: ReadinessCheck
  /** Gate failure counter; tests pass their own clock. */
  gateLimiter?: FailureLimiter
  /** Request logging: a redacting logger from createLogger(), true for one at config.logLevel, false (tests) for none. */
  logger?: Logger | boolean
  /** The API (TSK-0010): database, modules and caller resolution. Defaults: a pool from config.databaseUrl, MODULES,
   *  and every caller a guest until staff and customer sessions exist (TSK-0014). */
  api?: { db?: Db; modules?: readonly ApiModule[]; resolveActor?: ResolveActor }
}

/** JSON-schema validation: unknown fields are refused rather than silently dropped, and every problem is reported. */
export const AJV_OPTIONS = { customOptions: { removeAdditional: false as const, allErrors: true } }

/** Outside production robots.txt disallows everything (RULE-SYNTHETIC-DATA: staging stays out of search). */
export const NOINDEX_ROBOTS = 'User-agent: *\nDisallow: /\n'

export async function buildApp({
  config,
  readiness,
  gateLimiter,
  logger = false,
  api,
}: AppOptions): Promise<FastifyInstance> {
  const genReqId = (req: { headers: Record<string, string | string[] | undefined> }) =>
    requestIdFrom(req.headers['x-request-id'])
  const instance = logger === true ? createLogger({ level: config.logLevel, name: 'handyapp' }) : logger || undefined
  const app: FastifyInstance = instance
    ? Fastify({ loggerInstance: instance as FastifyBaseLogger, genReqId, ajv: AJV_OPTIONS })
    : Fastify({ logger: false, genReqId, ajv: AJV_OPTIONS })
  registerRequestContext(app)

  app.addHook(
    'onRequest',
    accessGateHook(config.accessGate, gateLimiter ?? new FailureLimiter(), config.trustProxyHops),
  )

  if (config.noindex) {
    app.addHook('onSend', async (_req, reply, payload) => {
      reply.header('x-robots-tag', 'noindex, nofollow')
      return payload
    })
    app.get('/robots.txt', async (_req, reply) => reply.type('text/plain; charset=utf-8').send(NOINDEX_ROBOTS))
  }

  const ready = readiness ?? databaseReadiness(config.databaseUrl)
  app.addHook('onClose', async () => ready.close())

  // Liveness: the process answers. No database call, no private data; the only route outside the gate.
  app.get('/healthz', async (_req, reply) => reply.header('cache-control', 'no-store').send({ status: 'ok' }))

  // Readiness: the database answers and every migration is applied.
  app.get('/readyz', async (_req, reply) => {
    const result = await ready.check()
    return reply
      .status(result.ready ? 200 : 503)
      .header('cache-control', 'no-store')
      .send({ status: result.ready ? 'ready' : 'not_ready', checks: result.checks })
  })

  // The API under /api/v1 (behind the gate like every route).
  const ownDb = api?.db === undefined && config.databaseUrl !== undefined
  const db =
    api?.db ?? (config.databaseUrl ? createDb(config.databaseUrl, { applicationName: 'handyapp-api' }) : undefined)
  if (ownDb && db) app.addHook('onClose', async () => db.destroy())
  await registerApi(app, {
    db,
    modules: api?.modules ?? MODULES,
    ...(api?.resolveActor ? { resolveActor: api.resolveActor } : {}),
  })

  if (config.siteDir) {
    await app.register(fastifyStatic, { root: config.siteDir, extensions: ['html'] })
  }
  return app
}
