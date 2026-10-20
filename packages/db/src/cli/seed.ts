// pnpm db:seed - synthetic records for local, ci and staging only (TSK-0004; RULE-SYNTHETIC-DATA). The environment
// check runs before any connection is opened.
import { createDb } from '../client.js'
import { runSeeders, seedEnvironment } from '../seed.js'
import { SEEDERS } from '../seeders.js'

const environment = seedEnvironment(process.env)
const url = process.env['DATABASE_URL']
if (!url) {
  process.stderr.write('DATABASE_URL is not set\n')
  process.exit(1)
}
const db = createDb(url, { max: 1, applicationName: 'handyapp-seed' })
try {
  const ran = await runSeeders(db, SEEDERS, { environment })
  process.stdout.write(`seeded (${environment}): ${ran.join(', ') || 'no seeders registered'}\n`)
} finally {
  await db.destroy()
}
