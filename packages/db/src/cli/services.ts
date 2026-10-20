// pnpm db:services - loads the service registry from seed/services.json into DATABASE_URL (TSK-0019). Safe to repeat:
// unchanged services stay as they are and changed content becomes a new version. Runs in every environment.
import { createDb } from '../client.js'
import { loadServiceSeed, syncServices } from '../services.js'

const url = process.env['DATABASE_URL']
if (!url) {
  process.stderr.write('DATABASE_URL is not set\n')
  process.exit(1)
}
const db = createDb(url, { max: 1, applicationName: 'handyapp-services' })
try {
  const r = await syncServices(db, loadServiceSeed())
  process.stdout.write(
    `services: ${r.created.length} created, ${r.versioned.length} new versions, ${r.unchanged.length} unchanged\n`,
  )
} finally {
  await db.destroy()
}
