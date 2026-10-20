// Boot (TSK-0003, TSK-0013): validate the environment, build the app and listen. A missing or invalid required variable
// throws ConfigError before anything listens, so Render keeps the previous deploy serving.
// With a database: the provider webhooks (/webhooks/bird, /webhooks/resend) and the in-process job worker run too;
// the worker stops and the pool closes when the app closes.
import { randomUUID } from 'node:crypto'
import { createDb, withTx } from '@handyhub/db'
import type { FastifyInstance } from 'fastify'
import { buildApp } from './app.js'
import { buildAutomations } from './automations.js'
import { loadConfig } from './config.js'
import { ensureBootstrapOwner } from './modules/identity/accounts.js'
import { codeDeliveryAutomation, readCodeKey } from './modules/identity/index.js'
import { createAutomationRegistry } from './platform/automation.js'
import { createWorker } from './platform/jobs.js'
import type { Logger } from './platform/logger.js'
import { runWithContext } from './platform/request-context.js'
import { createProviders } from './providers/index.js'
import { readProviderSettings } from './providers/settings.js'
import { registerWebhookRoutes } from './providers/webhooks.js'

export interface BootOptions {
  /** Directory of the built site used when SITE_DIR is not set. */
  defaultSiteDir?: string
  /** Directory of the built staff app used when STAFF_DIR is not set. */
  defaultStaffDir?: string
  logger?: boolean
  /** Start the job worker when a database is configured. Default true. */
  worker?: boolean
}

export async function boot(env: Readonly<Record<string, string | undefined>>, options: BootOptions = {}) {
  const config = loadConfig(env)
  const providers = readProviderSettings(env)
  const codeKey = readCodeKey(env)
  const siteDir = config.siteDir ?? options.defaultSiteDir
  const staffDir = config.staffDir ?? options.defaultStaffDir
  // One pool for the API, the webhooks and the worker. The API caller comes from the staff or the customer session
  // cookie (TSK-0014, TSK-0016; buildApp's default resolver).
  const db = config.databaseUrl ? createDb(config.databaseUrl, { applicationName: 'handyapp-server' }) : undefined
  // Object storage needs no logger; the senders below get the app's (their destination guard logs suppressions).
  const storage = createProviders(providers).storage
  const app: FastifyInstance = await buildApp({
    config: {
      ...config,
      ...(siteDir === undefined ? {} : { siteDir }),
      ...(staffDir === undefined ? {} : { staffDir }),
    },
    logger: options.logger ?? false,
    ...(db ? { api: { db, storage } } : { api: { storage } }),
  })
  const sent = createProviders(providers, { logger: app.log as unknown as Logger })
  const registry = createAutomationRegistry([
    ...buildAutomations({ providers: { ...sent, storage }, staffAppUrl: config.staffAppUrl }),
    codeDeliveryAutomation({ providers: sent, codeKey }),
  ])
  if (db) {
    await registerWebhookRoutes(app, { db, secrets: providers.webhookSecrets })
    // The first Owner (HH-STAFF-01 safe bootstrap): only while no Owner exists; one invite through the outbox.
    if (config.bootstrapOwner) {
      const owner = config.bootstrapOwner
      const requestId = `boot:${randomUUID()}`
      const outcome = await runWithContext({ requestId }, () =>
        withTx(db, (tx) => ensureBootstrapOwner(tx, { ...owner, requestId })),
      )
      app.log.info({ outcome }, 'first owner bootstrap')
    }
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
