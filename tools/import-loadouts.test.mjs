// tools/import-loadouts.mjs (TSK-0071; HH-PKT-05, RULE-NO-INVENTED-FACTS): the committed seed is what the
// FACT-INVENTORY-* nodes produce, every imported line is the node's line, unchanged and in order, and nothing is added.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildLoadouts, itemName, parseLoadout, render, sectionLines } from './import-loadouts.mjs'

const root = new URL('..', import.meta.url)
const loadouts = buildLoadouts()
execFileSync(process.execPath, [new URL('kg.mjs', import.meta.url).pathname, 'index'], { stdio: 'ignore' })
const nodes = JSON.parse(readFileSync(new URL('kg/_index.json', root), 'utf8')).nodes
const items = (l) => l.content.groups.flatMap((g) => g.items)

test('[HH-PKT-05] packages/db/seed/loadouts.json is up to date with the FACT-INVENTORY-* nodes', () => {
  const committed = readFileSync(new URL('packages/db/seed/loadouts.json', root), 'utf8')
  assert.equal(committed, render(loadouts))
})

test('[HH-PKT-05] 26 loadouts, one per service, each with checklist items', () => {
  assert.equal(loadouts.length, 26)
  assert.equal(new Set(loadouts.map((l) => l.serviceId)).size, 26)
  for (const l of loadouts) {
    assert.equal(l.id.slice('FACT-INVENTORY-'.length), l.serviceId.slice(4))
    assert.ok(items(l).length > 0, l.id)
    assert.match(l.sourceFile, /^Required inventory\/inventory-.+\.md$/)
  }
})

test('[HH-PKT-05] every line of the section is kept once, unchanged and in order', () => {
  for (const l of loadouts) {
    const expected = sectionLines(nodes[l.id].body).filter((x) => x.trim() !== '' && !/^>\s*$/.test(x))
    const got = []
    for (const g of l.content.groups) {
      if (g.heading !== null) got.push(`#### ${g.heading}`)
      // Within a group the file's order is notes and items interleaved; compare as multisets per group and in full
      // order below.
      got.push(...[...g.notes, ...g.items].flatMap((p) => p.lines))
    }
    if (l.content.proposed) got.push(...l.content.proposed.lines)
    assert.deepEqual([...got].sort(), [...expected].sort(), l.id)
    // Items keep the file's order exactly.
    const itemLines = items(l).flatMap((i) => i.lines)
    assert.deepEqual(
      itemLines,
      expected.filter((x) => itemLines.includes(x)),
      l.id,
    )
  }
})

test('[HH-PKT-05][HH-PKT-06] PROPOSED: every item required and not classified; no quantity is invented', () => {
  for (const l of loadouts) {
    const keys = items(l).map((i) => i.key)
    assert.deepEqual(
      keys,
      keys.map((_, n) => String(n + 1)),
      l.id,
    )
    for (const i of items(l)) {
      assert.equal(i.criticality, 'required')
      assert.equal(i.category, 'not_classified')
      assert.deepEqual(Object.keys(i).sort(), ['category', 'criticality', 'key', 'line', 'lines', 'name'])
      assert.ok(i.lines[0].startsWith('- [ ] '), i.lines[0])
      assert.equal(i.name, itemName(i.lines[0]))
      assert.ok(typeof i.line === 'number', `${l.id} ${i.key} has a vault line`)
    }
  }
})

test('[HH-PKT-05] the proposed additions are never loadout items', () => {
  const parsed = parseLoadout([
    '#### A. Group',
    '- [ ] **One:** first.',
    '\t- [ ] **Sub:** part of one.',
    '> FLAG (X): about the group.',
    '> continued.',
    '',
    'Proposed additions in the vault file (pending): Item two (PROPOSED).',
  ])
  assert.equal(parsed.groups.length, 1)
  assert.deepEqual(
    parsed.groups[0].items.map((i) => i.lines),
    [['- [ ] **One:** first.', '\t- [ ] **Sub:** part of one.']],
  )
  assert.deepEqual(parsed.groups[0].notes[0].lines, ['> FLAG (X): about the group.', '> continued.'])
  assert.deepEqual(parsed.proposed.lines, ['Proposed additions in the vault file (pending): Item two (PROPOSED).'])
  for (const l of loadouts) {
    assert.ok(l.content.proposed, l.id)
    for (const i of items(l)) assert.ok(!i.lines[0].startsWith('Proposed additions'))
  }
})
