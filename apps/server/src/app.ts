// Fastify application factory. TSK-0001 skeleton: serves the built public site when a directory is given.
// Health checks, the environment schema and the staging access gate arrive in TSK-0003; host routing in TSK-0017.
// TSK-0011: the redacting logger and the request-ID context used by log lines and audit events.
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify'
import type { Logger } from './platform/logger.js'
import { registerRequestContext, requestIdFrom } from './platform/request-context.js'

export interface AppOptions {
  /** Absolute path of the built public site (apps/site/dist). Omitted: no static site is served. */
  siteDir?: string
  /** The redacting logger from createLogger(). Omitted: no request logging. */
  logger?: Logger
}

export async function buildApp(options: AppOptions = {}): Promise<FastifyInstance> {
  const genReqId = (req: { headers: Record<string, string | string[] | undefined> }) =>
    requestIdFrom(req.headers['x-request-id'])
  const app: FastifyInstance = options.logger
    ? Fastify({ loggerInstance: options.logger as FastifyBaseLogger, genReqId })
    : Fastify({ logger: false, genReqId })
  registerRequestContext(app)
  if (options.siteDir) {
    await app.register(fastifyStatic, { root: options.siteDir, extensions: ['html'] })
  }
  return app
}
