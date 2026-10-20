// Boot (TSK-0003, TSK-0013): validate the environment, build the app and listen. A missing or invalid required variable
// throws ConfigError before anything listens, so Render keeps the previous deploy serving.
// With a database: the provider webhooks (/webhooks/bird, /webhooks/resend) and the in-process job worker run too;
// the worker stops and the pool closes when the app closes.
import { createDb } from '@handyhub/db'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.js'
import { AUTOMATIONS } from './automations.js'
import { loadConfig } from './config.js'
import { createAutomationRegistry } from './platform/automation.js'
import { createWorker } from './platform/jobs.js'
import type { Logger } from './platform/logger.js'
import { readProviderSettings } from './providers/settings.js'
import { registerWebhookRoutes } from './providers/webhooks.js'

export interface BootOptions {
  /** Directory of the built site used when SITE_DIR is not set. */
  defaultSiteDir?: string
  logger?: boolean
  /** Start the job worker when a database is configured. Default true. */
  worker?: boolean
}

export async function boot(env: Readonly<Record<string, string | undefined>>, options: BootOptions = {}) {
  const config = loadConfig(env)
  const providers = readProviderSettings(env)
  const registry = createAutomationRegistry(AUTOMATIONS)
  const siteDir = config.siteDir ?? options.defaultSiteDir
  const app: FastifyInstance = await buildApp({
    config: siteDir === undefined ? config : { ...config, siteDir },
    logger: options.logger ?? false,
  })
  if (config.databaseUrl) {
    const db = createDb(config.databaseUrl, { applicationName: 'handyapp-server' })
    await registerWebhookRoutes(app, { db, secrets: providers.webhookSecrets })
    const worker = createWorker({ db, registry, logger: app.log as unknown as Logger })
    if (options.worker !== false) worker.start()
    app.addHook('onClose', async () => {
      await worker.stop()
      await db.destroy()
    })
  }
  const address = await app.listen({ port: config.port, host: config.host })
  return { app, config, address }
}
