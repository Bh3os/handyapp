// The server Playwright tests against (TSK-0026). With TEST_DATABASE_URL (CI: the postgres:16 service; locally the
// developer's PostgreSQL) it creates a fresh migrated database, loads the service registry and starts the built server
// on it, so request flows run against the real API; the database is dropped when Playwright stops the server.
// Without TEST_DATABASE_URL the server starts without a database, as before. Data is synthetic only.
import { fileURLToPath } from 'node:url'
import { loadServiceSeed, syncServices } from '@handyhub/db'
import { createTestDatabase } from '@handyhub/db/testing'
import { boot } from '../server/dist/boot.js'

const env = { ...process.env }
let database
if (process.env['TEST_DATABASE_URL']) {
  database = await createTestDatabase()
  await syncServices(database.db, loadServiceSeed())
  env['DATABASE_URL'] = database.url
}

const { app, address } = await boot(env, {
  defaultSiteDir: fileURLToPath(new URL('../site/dist', import.meta.url)),
  logger: false,
})
process.stdout.write(`e2e server listening on ${address}${database ? ' with a fresh database' : ''}\n`)

let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  // The server first (its pool closes cleanly), then the database.
  await app.close().catch(() => undefined)
  await database?.drop().catch(() => undefined)
  process.exit(0)
}
process.on('SIGTERM', stop)
process.on('SIGINT', stop)
process.on('SIGHUP', stop)
