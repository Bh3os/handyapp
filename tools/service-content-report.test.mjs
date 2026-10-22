// tools/service-content-report.mjs (TSK-0132; OWN-DEC-180 requirement 15): the committed report is what the reviewed
// content produces, and it lists all 26 services with their status and the withheld content.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { renderReport, status } from './service-content-report.mjs'

test('[HH-CUS-02][OWN-DEC-180] docs/service-content-report.md is up to date with the reviewed content', () => {
  const committed = readFileSync(new URL('../docs/service-content-report.md', import.meta.url), 'utf8')
  assert.equal(committed, renderReport())
})

test('[HH-CUS-02][OWN-DEC-180] the report lists every service, its status and what was withheld', () => {
  const registry = JSON.parse(readFileSync(new URL('../packages/db/seed/services.json', import.meta.url), 'utf8'))
  const report = renderReport(registry)
  for (const s of registry.services) assert.match(report, new RegExp(`\\| ${s.code} \\| `))
  assert.match(report, /## Withheld for safety or factual verification/)
  assert.match(report, /relighting the grill/)
  assert.match(report, /No professional review is claimed/)
  assert.equal(status({ publicStatus: 'draft' }, undefined), 'Withheld (draft)')
})
