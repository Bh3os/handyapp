// Server entry point: node dist/main.js. PORT and HOST come from the environment; the full environment schema is
// validated at boot from TSK-0003 on.
import { fileURLToPath } from 'node:url'
import { buildApp } from './app.js'
import { createLogger } from './platform/logger.js'

const siteDir = process.env['SITE_DIR'] ?? fileURLToPath(new URL('../../site/dist', import.meta.url))
const port = Number(process.env['PORT'] ?? 3000)
const host = process.env['HOST'] ?? '127.0.0.1'

const logger = createLogger({ level: process.env['LOG_LEVEL'] ?? 'info', name: 'handyapp' })
const app = await buildApp({ siteDir, logger })
await app.listen({ port, host })
process.stdout.write(`server listening on http://${host}:${port}\n`)
