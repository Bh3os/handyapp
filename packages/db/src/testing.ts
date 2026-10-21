// Integration-test database harness (TSK-0004; HH-ARC-01). Adapted from Bh3os/handyhub-app
// (apps/server/test/integration/db.ts), with a migrated template so a test file does not re-run every migration.
// - TEST_DATABASE_URL names a PostgreSQL 16 server and a maintenance database the user may create databases from
//   (CI: postgres://handyhub:handyhub@localhost:5432/postgres; locally postgres:postgres on 127.0.0.1).
// - The template `hh_tpl_<hash of the migration checksums>` is migrated once, under an advisory lock, built under a
//   work name and renamed when complete; a changed migration set gives a new template.
// - Each test file calls createTestDatabase() in beforeAll and drop() in afterAll, and so sees its own empty, fully
//   migrated database `hh_test_<random>`. { migrated: false } gives an empty database without migrations.
import { createHash, randomBytes } from 'node:crypto'
import pg from 'pg'
import { createDb, type Db } from './client.js'
import { listMigrations, migrate, MIGRATIONS_DIR } from './migrate.js'

const NAME = /^hh_(tpl|test)_[0-9a-f]+(_wip)?$/
const TEMPLATE_LOCK = 'handyapp.test-template'

export type TestDatabase = { name: string; url: string; db: Db; drop: () => Promise<void> }

/** The admin connection for tests. Missing, or pointed at production, fails instead of skipping. */
export function testDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env['TEST_DATABASE_URL']
  if (!url) throw new Error('TEST_DATABASE_URL is not set: point it at a PostgreSQL 16 server (see README, Commands)')
  if (env['HANDYHUB_ENV'] === 'production') throw new Error('Integration tests never run with HANDYHUB_ENV=production')
  return url
}

export function databaseUrl(adminUrl: string, name: string): string {
  const u = new URL(adminUrl)
  u.pathname = `/${name}`
  return u.toString()
}

function ident(name: string): string {
  if (!NAME.test(name)) throw new Error(`Refusing to touch database ${name}: not a test database name`)
  return `"${name}"`
}

async function withAdmin<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: testDatabaseUrl(), application_name: 'handyapp-test-harness' })
  await c.connect()
  try {
    return await fn(c)
  } finally {
    await c.end()
  }
}

// A database another backend is still leaving (55006 object_in_use) is retried for a few seconds.
async function retryInUse<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if ((err as { code?: string }).code !== '55006' || attempt >= 50) throw err
      await new Promise((r) => setTimeout(r, 100))
    }
  }
}

async function exists(c: pg.Client, name: string): Promise<boolean> {
  return (await c.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])).rowCount === 1
}

/** Name of the migrated template for the migrations on disk; builds it when it does not exist yet. */
export async function ensureTemplate(dir = MIGRATIONS_DIR): Promise<string> {
  const migrations = await listMigrations(dir)
  const hash = createHash('sha256')
    .update(migrations.map((m) => `${m.file}:${m.checksum}`).join('\n'))
    .digest('hex')
    .slice(0, 16)
  const name = `hh_tpl_${hash}`
  const wip = `${name}_wip`
  return withAdmin(async (c) => {
    await c.query('SELECT pg_advisory_lock(hashtext($1))', [TEMPLATE_LOCK])
    try {
      if (await exists(c, name)) return name
      await c.query(`DROP DATABASE IF EXISTS ${ident(wip)} WITH (FORCE)`)
      await c.query(`CREATE DATABASE ${ident(wip)} TEMPLATE template0`)
      await migrate(databaseUrl(testDatabaseUrl(), wip), { appliedBy: 'test-template', dir })
      await retryInUse(() => c.query(`ALTER DATABASE ${ident(wip)} RENAME TO ${ident(name)}`))
      // Marked as a template so any role with CREATEDB can clone it, and so it cannot be connected to by mistake.
      await c.query(`ALTER DATABASE ${ident(name)} WITH IS_TEMPLATE true ALLOW_CONNECTIONS false`)
      return name
    } finally {
      await c.query('SELECT pg_advisory_unlock(hashtext($1))', [TEMPLATE_LOCK])
    }
  })
}

export async function createTestDatabase(options: { migrated?: boolean } = {}): Promise<TestDatabase> {
  const template = options.migrated === false ? 'template0' : await ensureTemplate()
  const name = `hh_test_${randomBytes(8).toString('hex')}`
  await withAdmin((c) =>
    retryInUse(() =>
      c.query(`CREATE DATABASE ${ident(name)} TEMPLATE ${template === 'template0' ? template : ident(template)}`),
    ),
  )
  const url = databaseUrl(testDatabaseUrl(), name)
  const db = createDb(url, { max: 4, applicationName: 'handyapp-test' })
  return {
    name,
    url,
    db,
    drop: async () => {
      await db.destroy()
      // pg's pool.end() resolves before its connections have closed. Dropping WITH (FORCE) at once would terminate a
      // connection that is still closing, and its pool would then report an unhandled error (a race that shows under
      // load). Wait for this file's connections to leave; only a connection still open after that is forced out.
      await withAdmin(async (c) => {
        try {
          await retryInUse(() => c.query(`DROP DATABASE IF EXISTS ${ident(name)}`))
        } catch (err) {
          if ((err as { code?: string }).code !== '55006') throw err
          await c.query(`DROP DATABASE IF EXISTS ${ident(name)} WITH (FORCE)`)
        }
      })
    },
  }
}
