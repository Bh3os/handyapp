// pnpm db:migrate - applies the pending migrations to DATABASE_URL (TSK-0004). Refused drift exits non-zero.
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
