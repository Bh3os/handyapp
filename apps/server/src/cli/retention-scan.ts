// Operations command for the retention review (TSK-0099; HH-PRIV-01, ENT-RetentionReview, OWN-DEC-70). Run in the
// host shell (Render shell) with DATABASE_URL set:
//   node apps/server/dist/cli/retention-scan.js
// It runs the daily scan once, now: records past their retention period get an entry in the Owner's deletion-review
// queue. It deletes, archives and changes nothing, and prints only how many entries it opened per category.
import { randomUUID } from 'node:crypto'
import { createDb, withTx } from '@handyhub/db'
import { loadConfig } from '../config.js'
import { scanNow } from '../modules/retention/index.js'
import { runWithContext } from '../platform/request-context.js'

const config = loadConfig(process.env)
if (!config.databaseUrl) {
  process.stderr.write('DATABASE_URL is not set\n')
  process.exit(1)
}
const db = createDb(config.databaseUrl as string, { max: 1, applicationName: 'handyapp-retention-scan' })
const requestId = `ops:${randomUUID()}`
try {
  const result = await runWithContext({ requestId }, () => withTx(db, (tx) => scanNow(tx, requestId)))
  process.stdout.write(`${JSON.stringify({ opened: result.opened, more: result.more })}\n`)
} finally {
  await db.destroy()
}
