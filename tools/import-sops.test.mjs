// tools/import-sops.mjs (TSK-0068; HH-PKT-03, HH-WORK-11, RULE-NO-INVENTED-FACTS): the committed seed is what the
// SOP-* nodes produce, and every imported line is the node's line, unchanged and in order, with its vault line.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { buildSops, normalize, parseItems, render, STAGES } from './import-sops.mjs'

const root = new URL('..', import.meta.url)
const sops = buildSops()
execFileSync(process.execPath, [new URL('kg.mjs', import.meta.url).pathname, 'index'], { stdio: 'ignore' })
const nodes = JSON.parse(readFileSync(new URL('kg/_index.json', root), 'utf8')).nodes

/** The non-blank lines of one "## " section of a node body (blank quote lines only separate quotes). */
function sectionLines(body, heading) {
  const lines = body.split('\n')
  const start = lines.indexOf(heading)
  assert.ok(start >= 0, heading)
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '))
  return lines.slice(start + 1, end < 0 ? undefined : end).filter((l) => l.trim() !== '' && !/^>\s*$/.test(l))
}
const itemLines = (items) => items.flatMap((i) => i.lines)
const withoutHeadings = (lines) => lines.filter((l) => !l.startsWith('### '))

test('[HH-PKT-03] packages/db/seed/sops.json is up to date with the SOP-* nodes', () => {
  const committed = readFileSync(new URL('packages/db/seed/sops.json', root), 'utf8')
  assert.equal(committed, render(sops))
})

test('[HH-PKT-03] 26 SOP versions, one per service, all pending competent review with Spanish pending', () => {
  assert.equal(sops.length, 26)
  assert.equal(new Set(sops.map((s) => s.serviceId)).size, 26)
  for (const s of sops) {
    assert.equal(s.id.slice(4), s.serviceId.slice(4))
    assert.equal(s.reviewState, 'pending_competent_review')
    assert.equal(s.spanishStatus, 'pending')
    assert.deepEqual(
      s.content.stages.map((x) => x.key),
      STAGES.map((x) => x.key),
    )
  }
})

test('[HH-PKT-03][HH-WORK-11] every imported line is the node line, unchanged and in order', () => {
  for (const s of sops) {
    const body = nodes[s.id].body
    s.content.stages.forEach((stage, i) => {
      assert.deepEqual(itemLines(stage.items), withoutHeadings(sectionLines(body, STAGES[i].heading)), s.id)
    })
    assert.deepEqual(
      itemLines(s.content.stopWork),
      withoutHeadings(sectionLines(body, '## Stop-work triggers, escalation and incidents (service-specific)')),
    )
    assert.deepEqual(
      itemLines(s.content.openQuestions),
      withoutHeadings(sectionLines(body, '## Open questions in the source SOP')),
    )
  }
})

test('[HH-PKT-03] each item names its vault line; only lines the graph added have none', () => {
  let located = 0
  for (const s of sops) {
    const vault = readFileSync(new URL(`sources/vault/${s.sourceFile}`, root), 'utf8').split('\n')
    const items = [...s.content.stages.flatMap((x) => x.items), ...s.content.stopWork, ...s.content.openQuestions]
    for (const item of items) {
      if (item.line === null) {
        // A graph annotation: it links to another node, which the vault file never does.
        assert.match(item.lines[0], /\[\[[A-Z]/, `${s.id} ${item.id}`)
        continue
      }
      assert.equal(normalize(vault[item.line - 1]), normalize(item.lines[0]), `${s.id} ${item.id}`)
      located++
    }
  }
  assert.ok(located > 2000)
})

test('[HH-PKT-03] a step keeps its evidence and the controls quoted before it; nothing is added', () => {
  const items = parseItems(
    [
      '### From "12. Step-by-step procedure"',
      '> HOLD (C-X-01): synthetic hold text.',
      '>',
      '> FLAG: synthetic flag text.',
      '',
      '- [ ] **Synthetic step:** do the synthetic thing.',
      '  - Evidence: photo, note',
      '- Synthetic second step.',
      '| Check | Evidence |',
      '|---|---|',
      '| Synthetic | Note |',
    ],
    '3',
  )
  assert.deepEqual(
    items.map((i) => [i.id, i.kind]),
    [
      ['3.1', 'control'],
      ['3.2', 'control'],
      ['3.3', 'step'],
      ['3.4', 'step'],
      ['3.5', 'table'],
    ],
  )
  assert.deepEqual(items[2].holdBefore, ['3.1', '3.2'])
  assert.deepEqual(items[2].evidence, ['photo', 'note'])
  assert.deepEqual(items[3].holdBefore, [])
  assert.equal(items[0].ref, 'C-X-01')
  assert.equal(items[1].control, 'FLAG')
  assert.ok(items.every((i) => i.section === 'From "12. Step-by-step procedure"'))
  assert.throws(() => parseItems(['- Step.', '  - Evidence: video'], '1'), /unknown evidence/)
})
