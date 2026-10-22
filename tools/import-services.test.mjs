// tools/import-services.mjs (TSK-0019, HH-SVC-01): the committed seed is what the SVC-* nodes produce.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildServices, pageContent, render, splitList } from './import-services.mjs'

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

test('[HH-CUS-02][OWN-DEC-180] a service with reviewed content is published with its review stamp; corrections stay out', () => {
  const reviewed = pageContent('SVC-PT-01')
  assert.equal(reviewed.publicStatus, 'published')
  assert.deepEqual(reviewed.content.review, { decision: 'OWN-DEC-180', task: 'TSK-0132', reviewedOn: '2026-10-22' })
  assert.equal(typeof reviewed.content.description, 'string')
  assert.equal('corrections' in reviewed.content, false)
  assert.ok(Array.isArray(reviewed.content.care.withheld))
  assert.deepEqual(pageContent('SVC-XX-99', undefined), { publicStatus: 'draft', content: { description: null } })
})
