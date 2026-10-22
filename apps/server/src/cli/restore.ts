// Operations command for a database restore (TSK-0106; HH-NFR-03, HH-PRIV-03, T72; docs/runbooks/restore.md). Run in
// a shell that can reach the database, with DATABASE_URL set to the database named in each step:
//   node apps/server/dist/cli/restore.js export --since <ISO time> > replay.json
//       from the damaged or live database: the deletion log entries (references only) and the consent withdrawals
//       (with their destinations: personal data, kept as privately as a backup) recorded at or after the backup's time;
//   node apps/server/dist/cli/restore.js fingerprint > fingerprint.json
//       row counts, row checksums and relationship counts per table (names, counts and checksums only, no values);
//   node apps/server/dist/cli/restore.js check [--compare <fingerprint.json>]
//       the integrity checks of the restored database, and what differs from a fingerprint taken elsewhere (the
//       backup's, or the damaged database's: the missing data). Exit 1 when a check fails;
//   node apps/server/dist/cli/restore.js reapply <replay.json> [--operator <name>]
//       on the restored database, before the controlled resume: re-applies the deletions and the withdrawals in one
//       transaction and prints one line per entry. Running it twice changes nothing the second time.
// Never point `reapply` at the database the export came from by mistake: it is harmless there (every entry is absent
// or present), but the restore is not done until it ran on the restored database.
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createDb, withTx } from '@handyhub/db'
import { loadConfig } from '../config.js'
import {
  exportConsentWithdrawals,
  parseExportedWithdrawals,
  reapplyConsentWithdrawals,
} from '../modules/notifications/consent-replay.js'
import { exportDeletions, parseExportedDeletions, reapplyDeletions } from '../modules/privacy/index.js'
import { runWithContext } from '../platform/request-context.js'
import {
  compareFingerprints,
  databaseFingerprint,
  integrityChecks,
  type DatabaseFingerprint,
} from '../platform/restore.js'

const REPLAY_KIND = 'handyhub.restore-replay'

const [command, ...rest] = process.argv.slice(2)
const option = (name: string) => {
  const i = rest.indexOf(`--${name}`)
  return i >= 0 ? rest[i + 1] : undefined
}
const COMMANDS = ['export', 'fingerprint', 'check', 'reapply']
if (!command || !COMMANDS.includes(command)) {
  process.stderr.write(
    'usage: restore.js export --since <ISO time> | fingerprint | check [--compare <file>] | reapply <file> [--operator <name>]\n',
  )
  process.exit(2)
}
const config = loadConfig(process.env)
if (!config.databaseUrl) {
  process.stderr.write('DATABASE_URL is not set\n')
  process.exit(1)
}
const db = createDb(config.databaseUrl as string, { max: 1, applicationName: 'handyapp-restore' })
const requestId = `ops:${randomUUID()}`
let exitCode = 0
try {
  if (command === 'export') {
    const since = option('since')
    if (since === undefined || Number.isNaN(Date.parse(since))) throw new Error('export needs --since <ISO time>')
    const from = new Date(since)
    const replay = {
      kind: REPLAY_KIND,
      version: 1,
      exportedAt: new Date().toISOString(),
      since: from.toISOString(),
      deletions: await exportDeletions(db, from),
      consentWithdrawals: await exportConsentWithdrawals(db, from),
    }
    process.stdout.write(`${JSON.stringify(replay, null, 2)}\n`)
  } else if (command === 'fingerprint') {
    process.stdout.write(`${JSON.stringify(await databaseFingerprint(db), null, 2)}\n`)
  } else if (command === 'check') {
    const checks = await integrityChecks(db)
    const file = option('compare')
    const differences = file
      ? compareFingerprints(
          JSON.parse(await readFile(file, 'utf8')) as DatabaseFingerprint,
          await databaseFingerprint(db),
        )
      : null
    const ok = checks.every((c) => c.ok)
    process.stdout.write(`${JSON.stringify({ ok, checks, differences }, null, 2)}\n`)
    if (!ok) exitCode = 1
  } else {
    const file = rest.find((a, i) => !a.startsWith('--') && rest[i - 1] !== '--operator')
    if (!file) throw new Error('reapply needs the exported file')
    const replay = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>
    if (replay['kind'] !== REPLAY_KIND || replay['version'] !== 1)
      throw new Error(`the file is not a ${REPLAY_KIND} export (version 1)`)
    const deletions = parseExportedDeletions(JSON.stringify(replay['deletions']))
    const withdrawals = parseExportedWithdrawals(replay['consentWithdrawals'])
    const operator = option('operator')
    const results = await runWithContext({ requestId }, () =>
      withTx(db, async (tx) => ({
        deletions: await reapplyDeletions(tx, deletions, { requestId, ...(operator ? { operator } : {}) }),
        consentWithdrawals: await reapplyConsentWithdrawals(tx, withdrawals, operator ? { operator } : {}),
      })),
    )
    for (const r of results.deletions) process.stdout.write(`${JSON.stringify({ deletion: r })}\n`)
    for (const r of results.consentWithdrawals) process.stdout.write(`${JSON.stringify({ withdrawal: r })}\n`)
  }
} finally {
  await db.destroy()
}
process.exit(exitCode)
