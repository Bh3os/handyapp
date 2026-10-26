// pnpm data-inventory - writes docs/data-inventory.md from the table annotations and the retention schedule
// (TSK-0099, HH-PRIV-01), and docs/retention-mapping-review.md, the table-to-retention mapping the Owner, the CPA and
// the attorney review (TSK-0152, OWN-DEC-201 I5). A unit test fails when a committed file differs from the annotations.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { renderDataInventory } from '../modules/retention/inventory.js'
import { renderMappingReview } from '../modules/retention/mapping-review.js'

for (const [name, render] of [
  ['data-inventory.md', renderDataInventory],
  ['retention-mapping-review.md', renderMappingReview],
] as const) {
  const file = fileURLToPath(new URL(`../../../../docs/${name}`, import.meta.url))
  writeFileSync(file, render())
  process.stdout.write(`wrote ${file}\n`)
}
