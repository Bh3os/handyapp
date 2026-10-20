// tools/import-services.mjs (TSK-0019, HH-SVC-01): the committed seed is what the SVC-* nodes produce.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildServices, render, splitList } from './import-services.mjs'

test('[HH-SVC-01] packages/db/seed/services.json is up to date with the SVC-* nodes', () => {
  const committed = readFileSync(new URL('../packages/db/seed/services.json', import.meta.url), 'utf8')
  const services = buildServices()
  assert.equal(services.length, 26)
  assert.equal(committed, render(services))
})

test('splits request topics on commas outside parentheses', () => {
  assert.deepEqual(splitList('rooms, occupancy/pets, product preferences (if volunteered, optional).'), [
    'rooms',
    'occupancy/pets',
    'product preferences (if volunteered, optional)',
  ])
})
