// Fastify application factory (TSK-0001, TSK-0003, TSK-0010, TSK-0011, TSK-0017). Order: the request-ID context, the
// host check (hosts.ts: PUBLIC_ORIGIN and STAFF_ORIGIN), the staging access gate (in front of every route), the
// security headers, the health checks, the API modules under /api/v1, robots.txt and sitemap.xml, then the pages of
// each host; a missing or failing public page answers with the site's own not-found and error pages (TSK-0023).
import { existsSync } from 'node:fs'
import path from 'node:path'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import { accessGateHook, FailureLimiter } from './access-gate.js'
import type { Config } from './config.js'
import { createDb, isPublicServiceSlug, publicServices, type Db } from '@handyhub/db'
import { REFERENCE_PATTERN } from '@handyhub/domain/request-form'
import { registerApi, type SurfaceResolvers } from './api/register.js'
import type { ApiModule, ResolveActor } from './api/route.js'
import { databaseReadiness, type ReadinessCheck } from './health.js'
import { ANY_HOST_PATHS, contentSecurityPolicy, fileIn, hostSide, inlineHashes, securityHeaders } from './hosts.js'
import { apiModules } from './modules/index.js'
import type { SystemDeps } from './modules/system/index.js'
import { countyPagePaths, countyRoute, productionRobots, sitemapXml, staticSitePages } from './search.js'
import type { ObjectStorage } from './providers/index.js'
import { staffSessionResolver } from './modules/identity/actor.js'
import { customerSessionResolver } from './modules/identity/customer-sessions.js'
import type { CodeKeySettings } from './modules/identity/keys.js'
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
    /** The provider settings and variable names the system health and configuration views report (TSK-0101). */
    system?: SystemDeps
    /** The one-time-code key, the same one the code delivery job uses (boot.ts); unset: codes NOT CONFIGURED. */
    codeKey?: CodeKeySettings
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
      apiModules({
        secureCookies: config.secureCookies,
        mfaKey: config.mfaKey,
        accessCodeKey: config.accessCodeKey,
        storage: api?.storage ?? null,
        ...(api?.system ? { system: api.system } : {}),
        ...(api?.codeKey ? { codeKey: api.codeKey } : {}),
        trustProxyHops: config.trustProxyHops,
      }),
    ...(resolveActor ? { resolveActor } : {}),
  })

  // Robots (TSK-0023): staging, and the staff host everywhere, disallow everything; production names the sitemap.
  const site = config.siteDir && existsSync(config.siteDir) ? path.resolve(config.siteDir) : undefined
  const staff = config.staffDir && existsSync(config.staffDir) ? path.resolve(config.staffDir) : undefined
  const portal = config.portalDir && existsSync(config.portalDir) ? path.resolve(config.portalDir) : undefined
  const roots = [site, staff, portal].filter((d): d is string => d !== undefined)
  if (roots.length) await app.register(fastifyStatic, { root: roots, serve: false })
  // The public origin for absolute URLs: PUBLIC_ORIGIN when set; otherwise the request's host (https in staging and
  // production, where the server sits behind Render's TLS proxy).
  const https = config.env === 'staging' || config.env === 'production'
  const publicOrigin = (req: FastifyRequest) =>
    config.hosts.mode === 'split'
      ? config.hosts.publicOrigin
      : `${https ? 'https' : req.protocol}://${req.headers.host ?? `${config.host}:${config.port}`}`
  app.get('/robots.txt', async (req, reply) => {
    if (config.noindex || req.hostSide === 'staff') return reply.type('text/plain; charset=utf-8').send(NOINDEX_ROBOTS)
    if (!site) return reply.callNotFound()
    return reply.type('text/plain; charset=utf-8').send(productionRobots(publicOrigin(req)))
  })

  // The site's not-found and error pages (TSK-0023; HH-CUS-05) answer page requests on the public host; the API, the
  // staff app, the portal and missing assets keep their own plain answers.
  const sitePageRequest = (req: FastifyRequest) => {
    const url = req.url.split('?')[0] ?? '/'
    return (
      site !== undefined &&
      req.hostSide !== 'staff' &&
      (req.method === 'GET' || req.method === 'HEAD') &&
      !/^\/(staff|portal|api|webhooks)(\/|$)/.test(url) &&
      (!/\.[A-Za-z0-9]+$/.test(url) || url.endsWith('.html'))
    )
  }
  const sitePage = (reply: FastifyReply, status: number, name: '404.html' | '500.html') =>
    reply
      .status(status)
      .header('cache-control', 'no-store')
      .sendFile(name, site as string, { cacheControl: false })
  const errorPage = (req: FastifyRequest, reply: FastifyReply, status: number) =>
    sitePageRequest(req) && site && fileIn(site, '/500.html')
      ? sitePage(reply, status, '500.html')
      : reply
          .status(status)
          .header('cache-control', 'no-store')
          .type('text/plain; charset=utf-8')
          .send(status === 503 ? 'Unavailable' : 'Internal Server Error')
  app.setNotFoundHandler(async (req, reply) => {
    if (sitePageRequest(req) && site && fileIn(site, '/404.html')) return sitePage(reply, 404, '404.html')
    return reply
      .status(404)
      .send({ message: `Route ${req.method}:${req.url} not found`, error: 'Not Found', statusCode: 404 })
  })
  app.setErrorHandler(async (err: { statusCode?: number }, req, reply) => {
    const status = typeof err.statusCode === 'number' && err.statusCode >= 400 ? err.statusCode : 500
    // A client error, or a failure outside the site's pages, is answered by Fastify's own handler.
    if (status < 500 || !sitePageRequest(req)) throw err
    req.log.error({ err }, 'PAGE_ERROR')
    return errorPage(req, reply, status)
  })

  // sitemap.xml (TSK-0023; HH-CUS-04, HH-CUS-05, T08): only pages that exist, are public and are indexable. Service
  // pages follow the environment's publication rule (TSK-0021): without a database none is listed, as none is served.
  const staticPages = site ? staticSitePages(site) : []
  app.get('/sitemap.xml', async (req, reply) => {
    if (!site || req.hostSide === 'staff') return reply.callNotFound()
    let services: string[] = []
    if (db) {
      try {
        services = (await publicServices(db, config.env))
          .map((s) => `/services/${s.slug}`)
          .filter((p) => fileIn(site, `${p}.html`) !== null)
      } catch {
        return errorPage(req, reply, 503)
      }
    }
    return reply
      .header('cache-control', 'no-cache')
      .type('application/xml; charset=utf-8')
      .send(sitemapXml(publicOrigin(req), [...staticPages, ...countyPagePaths(site), ...services]))
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
    // County URLs (TSK-0023; HH-CUS-04, OWN-DEC-57): a county's own page only with approved local content, otherwise a
    // 301 to its anchor on the Areas page; a slug that names no county of the area is not found.
    const countyUrl = /^\/areas\/([^/]+)\/?$/.exec(url)
    if (countyUrl) {
      const route = countyRoute(site, (countyUrl[1] ?? '').toLowerCase())
      if (route.kind === 'redirect') return reply.redirect(route.location, 301)
      if (route.kind === 'none') return reply.callNotFound()
      return reply.sendFile(path.relative(site, route.file), site)
    }
    // The receipt page (TSK-0032; HH-INT-12): one static page for every well-formed reference. It holds no request
    // data: the browser that sent the request shows the receipt it was given; anywhere else the page says it is not
    // available. A reference grants nothing, so the page is the same whether or not the reference exists.
    const receiptUrl = /^\/request\/received\/([^/]+)$/.exec(url)
    if (receiptUrl) {
      const file = REFERENCE_PATTERN.test(receiptUrl[1] ?? '') ? fileIn(site, '/request/received.html') : null
      if (!file) return reply.callNotFound()
      return reply
        .header('cache-control', 'no-store')
        .sendFile(path.relative(site, file), site, { cacheControl: false })
    }
    // The access link landing (TSK-0034; HH-ID-05, HH-ID-08): one static page. The link's token is in the fragment,
    // which a browser never sends, so this GET reads nothing and changes nothing: a link-preview fetch consumes no
    // grant, starts no session and sees no project. Never cached or indexed, and no referrer leaves it (hosts.ts).
    if (url === '/access' || url === '/access/') {
      const file = fileIn(site, '/access.html')
      if (!file) return reply.callNotFound()
      return reply
        .header('cache-control', 'no-store')
        .sendFile(path.relative(site, file), site, { cacheControl: false })
    }
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
        return errorPage(req, reply, 503)
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
