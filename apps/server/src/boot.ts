// Boot (TSK-0003): validate the environment, build the app and listen. A missing or invalid required variable throws
// ConfigError before anything listens, so Render keeps the previous deploy serving.
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.js'
import { loadConfig } from './config.js'

export interface BootOptions {
  /** Directory of the built site used when SITE_DIR is not set. */
  defaultSiteDir?: string
  logger?: boolean
}

export async function boot(env: Readonly<Record<string, string | undefined>>, options: BootOptions = {}) {
  const config = loadConfig(env)
  const siteDir = config.siteDir ?? options.defaultSiteDir
  const app: FastifyInstance = await buildApp({
    config: siteDir === undefined ? config : { ...config, siteDir },
    logger: options.logger ?? false,
  })
  const address = await app.listen({ port: config.port, host: config.host })
  return { app, config, address }
}
