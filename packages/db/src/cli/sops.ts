// pnpm db:sops - loads the SOP versions from seed/sops.json into DATABASE_URL (TSK-0068), after `pnpm db:services`.
// Safe to repeat: unchanged SOPs stay as they are, changed content becomes a new version pending competent review, and
// the unpinned work packages of planned jobs get the current version. Runs in every environment.
import { createDb } from '../client.js'
import { loadSopSeed, syncSops } from '../sops.js'

const url = process.env['DATABASE_URL']
if (!url) {
  process.stderr.write('DATABASE_URL is not set\n')
  process.exit(1)
}
const db = createDb(url, { max: 1, applicationName: 'handyapp-sops' })
try {
  const r = await syncSops(db, loadSopSeed())
  process.stdout.write(
    `sops: ${r.created.length} created, ${r.versioned.length} new versions, ${r.unchanged.length} unchanged, ` +
      `${r.pinned} work packages pinned\n`,
  )
} finally {
  await db.destroy()
}
