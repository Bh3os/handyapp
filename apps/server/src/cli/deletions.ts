// Operations command for the deletion log (TSK-0100; HH-PRIV-03, HH-PRIV-05, T72). Run in the host shell (Render
// shell) with DATABASE_URL set:
//   node apps/server/dist/cli/deletions.js export [--since <ISO time>] > deletions.json
//       prints the deletion log as JSON, oldest first: record types, IDs, references, reasons and times only (never
//       deleted content), to keep outside the database backups;
//   node apps/server/dist/cli/deletions.js reapply <file> [--operator <name>]
//       after a restore, before the controlled resume: applies each exported deletion again (a record that is gone is
//       absent; one that something now blocks is left in place and reported; the rest is erased again with a new log
//       entry naming the original). Prints one line per entry.
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createDb, withTx } from '@handyhub/db'
import { loadConfig } from '../config.js'
import { exportDeletions, parseExportedDeletions, reapplyDeletions } from '../modules/privacy/index.js'
import { runWithContext } from '../platform/request-context.js'

const [command, ...rest] = process.argv.slice(2)
const option = (name: string) => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 ? rest[i + 1] : undefined
}
if (command !== 'export' && command !== 'reapply') {
  process.stderr.write('usage: deletions.js export [--since <ISO time>] | reapply <file> [--operator <name>]\n')
  process.exit(2)
}
const config = loadConfig(process.env)
if (!config.databaseUrl) {
  process.stderr.write('DATABASE_URL is not set\n')
  process.exit(1)
}
const db = createDb(config.databaseUrl as string, { max: 1, applicationName: 'handyapp-deletions' })
const requestId = `ops:${randomUUID()}`
try {
  if (command === 'export') {
    const since = option('since')
    if (since !== undefined && Number.isNaN(Date.parse(since))) throw new Error('--since needs an ISO time')
    process.stdout.write(`${JSON.stringify(await exportDeletions(db, since ? new Date(since) : undefined), null, 2)}\n`)
  } else {
    const file = rest.find((a, i) => !a.startsWith('--') && rest[i - 1] !== '--operator')
    if (!file) throw new Error('reapply needs the exported file')
    const entries = parseExportedDeletions(await readFile(file, 'utf8'))
    const operator = option('operator')
    const results = await runWithContext({ requestId }, () =>
      withTx(db, (tx) => reapplyDeletions(tx, entries, { requestId, ...(operator ? { operator } : {}) })),
    )
    for (const r of results) process.stdout.write(`${JSON.stringify(r)}\n`)
  }
} finally {
  await db.destroy()
}
