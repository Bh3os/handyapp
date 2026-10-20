// pnpm db:types - regenerates src/schema.ts from the migrations (TSK-0004). Migrates a scratch database on the
// TEST_DATABASE_URL server, reads its catalog and writes the table types.
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { PACKAGE_ROOT } from '../migrate.js'
import { createTestDatabase } from '../testing.js'
import { introspect, renderSchema } from '../typegen.js'

const scratch = await createTestDatabase()
try {
  const file = path.join(PACKAGE_ROOT, 'src', 'schema.ts')
  await writeFile(file, renderSchema(await introspect(scratch.url)))
  process.stdout.write(`wrote ${path.relative(process.cwd(), file)}\n`)
} finally {
  await scratch.drop()
}
