// pnpm db:migrate - applies the pending migrations to DATABASE_URL (TSK-0004). Refused drift exits non-zero.
// TSK-0141: afterwards the database records which environment migrated it (HANDYHUB_ENV, when set to a known
// environment), so a database that production migrated is marked before any server starts on it.
import { createDb } from '../client.js'
import { MARK_ENVIRONMENTS, recordEnvironmentMark, type MarkEnvironment } from '../environment.js'
import { migrate } from '../migrate.js'

const url = process.env['DATABASE_URL']
if (!url) {
  process.stderr.write('DATABASE_URL is not set\n')
  process.exit(1)
}
const result = await migrate(url, { appliedBy: process.env['USER'] ?? 'migrator' })
process.stdout.write(
  `applied: ${result.applied.join(', ') || 'none'}; already applied: ${result.alreadyApplied.length}\n`,
)
const env = process.env['HANDYHUB_ENV']
if (env && (MARK_ENVIRONMENTS as readonly string[]).includes(env)) {
  const db = createDb(url, { max: 1, applicationName: 'handyapp-migrate' })
  try {
    const mark = await recordEnvironmentMark(db, env as MarkEnvironment, 'migration')
    if (mark === 'refused') process.stdout.write(`environment mark ${env} refused: this database served production\n`)
  } finally {
    await db.destroy()
  }
}
