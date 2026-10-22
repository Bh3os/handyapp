// pnpm db:loadouts - loads the loadout versions from seed/loadouts.json into DATABASE_URL (TSK-0071), after
// `pnpm db:services`. Safe to repeat: unchanged lists stay as they are and changed content becomes a new version; a
// work package keeps the version pinned on it. Runs in every environment.
import { createDb } from '../client.js'
import { loadLoadoutSeed, syncLoadouts } from '../loadouts.js'

const url = process.env['DATABASE_URL']
if (!url) {
  process.stderr.write('DATABASE_URL is not set\n')
  process.exit(1)
}
const db = createDb(url, { max: 1, applicationName: 'handyapp-loadouts' })
try {
  const r = await syncLoadouts(db, loadLoadoutSeed())
  process.stdout.write(
    `loadouts: ${r.created.length} created, ${r.versioned.length} new versions, ${r.unchanged.length} unchanged\n`,
  )
} finally {
  await db.destroy()
}
