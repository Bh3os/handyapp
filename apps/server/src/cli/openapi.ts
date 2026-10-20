// pnpm --filter @handyhub/server openapi - writes apps/server/openapi.json from the registered modules (TSK-0010,
// HH-API-01). A unit test fails when the committed file differs from the routes.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderOpenApi } from '../api/openapi.js'
import { MODULES } from '../modules/index.js'

const file = fileURLToPath(new URL('../../openapi.json', import.meta.url))
writeFileSync(file, renderOpenApi(MODULES))
process.stdout.write(`wrote ${file}\n`)
