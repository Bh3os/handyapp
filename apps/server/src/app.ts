// Fastify application factory (TSK-0001, TSK-0003, TSK-0010, TSK-0011, TSK-0017). Order: the request-ID context, the
// host check (hosts.ts: PUBLIC_ORIGIN and STAFF_ORIGIN), the staging access gate (in front of every route), the
// security headers, the health checks, the API modules under /api/v1, robots.txt, then the pages of each host.
import { existsSync } from 'node:fs'
import path from 'node:path'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyReply } from 'fastify'
import { accessGateHook, FailureLimiter } from './access-gate.js'
import type { Config } from './config.js'
import { createDb, isPublicServiceSlug, type Db } from '@handyhub/db'
import { registerApi, type SurfaceResolvers } from './api/register.js'
import type { ApiModule, ResolveActor } from './api/route.js'
import { databaseReadiness, type ReadinessCheck } from './health.js'
import { ANY_HOST_PATHS, contentSecurityPolicy, fileIn, hostSide, inlineHashes, securityHeaders } from './hosts.js'
import { apiModules } from './modules/index.js'
import type { ObjectStorage } from './providers/index.js'
import { staffSessionResolver } from './modules/identity/actor.js'
import { customerSessionResolver } from './modules/identity/customer-sessions.js'
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
  api?: {
    db?: Db
    modules?: readonly ApiModule[]
    resolveActor?: ResolveActor | SurfaceResolvers
    storage?: ObjectStorage | null
  }
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

  // Which host the request reached (TSK-0017). An unknown host serves nothing but the health checks, and the staff
  // host serves no webhook; the API surfaces check their own host (api/register.ts).
  app.addHook('onRequest', async (req, reply) => {
    const side = hostSide(config.hosts, req.headers.host)
    req.hostSide = side
    const url = req.url.split('?')[0] ?? '/'
    if (ANY_HOST_PATHS.has(url)) return
    if (side === 'unknown' || (side === 'staff' && /^\/webhooks(\/|$)/.test(url)))
      return reply.status(404).type('text/plain; charset=utf-8').send('Not Found')
  })

  app.addHook(
    'onRequest',
    accessGateHook(config.accessGate, gateLimiter ?? new FailureLimiter(), config.trustProxyHops),
  )

  // Security headers on every response, inline code allowed only by hash (TSK-0017; HH-SEC-02).
  const hashes = [config.siteDir, config.staffDir, config.portalDir].map(inlineHashes)
  const csp = contentSecurityPolicy({
    scripts: [...new Set(hashes.flatMap((h) => h.scripts))].sort(),
    styles: [...new Set(hashes.flatMap((h) => h.styles))].sort(),
  })
  const headers = securityHeaders(config, csp)
  app.addHook('onSend', async (req, reply, payload) => {
    headers(req, reply)
    return payload
  })

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
  // The caller per surface (TSK-0017): the staff API reads only the staff session (TSK-0014); the public and customer
  // APIs read only the customer session (TSK-0016). Otherwise a guest.
  const resolveActor: ResolveActor | SurfaceResolvers | undefined =
    api?.resolveActor ??
    (db
      ? { staff: staffSessionResolver(db, { secure: config.secureCookies }), public: customerSessionResolver(db) }
      : undefined)
  await registerApi(app, {
    db,
    hosts: config.hosts,
    trustProxyHops: config.trustProxyHops,
    modules:
      api?.modules ??
      apiModules({ secureCookies: config.secureCookies, mfaKey: config.mfaKey, storage: api?.storage ?? null }),
    ...(resolveActor ? { resolveActor } : {}),
  })

  // Robots: staging, and the staff host everywhere, disallow everything; otherwise the site's own robots.txt if any.
  const site = config.siteDir && existsSync(config.siteDir) ? path.resolve(config.siteDir) : undefined
  const staff = config.staffDir && existsSync(config.staffDir) ? path.resolve(config.staffDir) : undefined
  const portal = config.portalDir && existsSync(config.portalDir) ? path.resolve(config.portalDir) : undefined
  const roots = [site, staff, portal].filter((d): d is string => d !== undefined)
  if (roots.length) await app.register(fastifyStatic, { root: roots, serve: false })
  app.get('/robots.txt', async (req, reply) => {
    if (config.noindex || req.hostSide === 'staff') return reply.type('text/plain; charset=utf-8').send(NOINDEX_ROBOTS)
    if (site && fileIn(site, '/robots.txt')) return reply.sendFile('robots.txt', site)
    return reply.callNotFound()
  })

  // A single-page app: its file, otherwise its index.html so the app's own routes load; a missing asset is a 404.
  const spa = (reply: FastifyReply, root: string, rel: string) => {
    const file = fileIn(root, rel)
    if (file) return reply.sendFile(path.relative(root, file), root)
    if (/\.[A-Za-z0-9]+$/.test(rel)) return reply.callNotFound()
    return reply.header('cache-control', 'no-store').type('text/html; charset=utf-8').sendFile('index.html', root)
  }
  const under = (url: string, prefix: string) => url === prefix || url.startsWith(`${prefix}/`)

  // Pages by host (TSK-0017; HH-ARC-06):
  // - staff host: the staff app at the root (its /staff/... asset paths resolve too); nothing else;
  // - public host: /portal/* the customer portal, everything else the built site; never the staff app;
  // - single host (local, ci, the single Render URL): the staff app under /staff, the portal under /portal, the site.
  app.get('/*', async (req, reply) => {
    const side = req.hostSide ?? 'any'
    const url = req.url.split('?')[0] ?? '/'
    if (side === 'staff') {
      if (!staff) return reply.callNotFound()
      return spa(reply, staff, under(url, '/staff') ? url.slice('/staff'.length) || '/' : url)
    }
    if (side === 'any' && under(url, '/staff')) {
      if (!staff) return reply.callNotFound()
      if (url === '/staff') return reply.redirect('/staff/')
      return spa(reply, staff, url.slice('/staff'.length))
    }
    if (under(url, '/portal')) {
      if (!portal) return reply.callNotFound()
      if (url === '/portal') return reply.redirect('/portal/')
      return spa(reply, portal, url.slice('/portal'.length))
    }
    if (!site) return reply.callNotFound()
    // Service pages (TSK-0021; HH-CUS-02, OWN-DEC-84): the build holds a page for every registry service, and only a
    // service the site may show is served; a draft, or one not approved for production, is a 404. Unknown is not safe:
    // without a database no service page is served.
    const servicePage = /^\/services\/([^/]+)/.exec(url)
    if (servicePage) {
      const slug = (servicePage[1] ?? '').replace(/\.html$/, '')
      if (!db) return reply.callNotFound()
      let shown: boolean
      try {
        shown = await isPublicServiceSlug(db, config.env, slug)
      } catch {
        return reply
          .status(503)
          .header('cache-control', 'no-store')
          .type('text/plain; charset=utf-8')
          .send('Unavailable')
      }
      if (!shown) return reply.callNotFound()
      // Publication can change at any time; the page is checked again on every visit.
      reply.header('cache-control', 'no-cache')
    }
    const file =
      fileIn(site, url) ?? fileIn(site, `${url}.html`) ?? fileIn(site, `${url.replace(/\/$/, '')}/index.html`)
    if (!file) return reply.callNotFound()
    return servicePage
      ? reply.sendFile(path.relative(site, file), site, { cacheControl: false })
      : reply.sendFile(path.relative(site, file), site)
  })
  return app
}
