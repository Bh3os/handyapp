// pnpm data-inventory - writes docs/data-inventory.md from the table annotations and the retention schedule
// (TSK-0099, HH-PRIV-01). A unit test fails when the committed file differs from the annotations.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderDataInventory } from '../modules/retention/inventory.js'

const file = fileURLToPath(new URL('../../../../docs/data-inventory.md', import.meta.url))
writeFileSync(file, renderDataInventory())
process.stdout.write(`wrote ${file}\n`)
