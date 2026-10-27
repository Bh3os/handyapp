// Tests of the traceability report (node --test). Fixture test sources and ids are built at runtime so the real scan
// of this repository does not read them as tests or as graph ids.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import {
  buildReport,
  classifyFailures,
  docMarkdown,
  extractTitles,
  layerOf,
  parseLimitations,
  problemsOf,
  REASONS,
  unlinkedConflicts,
} from './trace.mjs'

const q = "'"
const call = (fn, title) => `${fn}(${q}${title}${q}, () => {})`
const fakeReq = ['HH', 'ZZ', '01'].join('-')
const fakeAcc = ['T', '98'].join('')
const unknown = ['HH', 'ZZ', '77'].join('-')

const nodes = {
  [fakeReq]: {
    id: fakeReq,
    type: 'requirement',
    status: 'active',
    priority: 'P0',
    title: 'r',
    links: { tested_by: [fakeAcc] },
  },
  [`${fakeReq}0`]: { id: `${fakeReq}0`, type: 'requirement', status: 'active', priority: 'P1', title: 'r2', links: {} },
  [fakeAcc]: { id: fakeAcc, type: 'acceptance', status: 'active', title: 'a', links: {} },
  'TSK-9999': { id: 'TSK-9999', type: 'task', status: 'todo', title: 't', links: {} },
}
const back = { [fakeReq]: [['implements', 'TSK-9999']] }

describe('trace.mjs (TSK-0002, HH-AUD-03)', () => {
  test('extracts titles, modifiers, lines and ids', () => {
    const src = [call('describe', `group ${fakeReq}`), call('it.skip', 'later'), call('xit', `x ${fakeAcc}`)].join('\n')
    const titles = extractTitles('a.test.ts', src)
    assert.deepEqual(
      titles.map((t) => [t.line, t.kind, t.modifiers, t.ids]),
      [
        [1, 'describe', [], [fakeReq]],
        [2, 'it', ['skip'], []],
        [3, 'it', ['skip'], [fakeAcc]],
      ],
    )
  })

  test('counts direct and tested_by evidence, lists tasks and flags missing evidence and unknown ids', () => {
    const titles = extractTitles(
      'a.test.ts',
      [call('it', `via acceptance ${fakeAcc}`), call('it', `bad ${unknown}`)].join('\n'),
    )
    const { rows, unknownIds } = buildReport(nodes, back, titles)
    assert.deepEqual(rows[0].evidence, [`a.test.ts:1 via acceptance ${fakeAcc}`])
    assert.deepEqual(rows[0].tasks, ['TSK-9999 (todo)'])
    assert.equal(rows[0].missing, false)
    assert.equal(rows[1].missing, true)
    assert.deepEqual(unknownIds, [{ id: unknown, at: 'a.test.ts:2' }])
  })

  test('keeps baseline failures apart from new ones and reports stale entries and focused tests', () => {
    const src = [call('it.skip', 'known'), call('it.todo', 'new one'), call('it.only', 'focused')].join('\n')
    const titles = extractTitles('a.test.ts', src)
    const baseline = [
      { file: 'a.test.ts', title: 'known', reason: 'synthetic' },
      { file: 'a.test.ts', title: 'gone', reason: 'synthetic' },
    ]
    const r = classifyFailures(titles, baseline)
    assert.deepEqual(
      r.known.map((t) => t.title),
      ['known'],
    )
    assert.deepEqual(
      r.fresh.map((t) => t.title),
      ['new one'],
    )
    assert.deepEqual(
      r.stale.map((b) => b.title),
      ['gone'],
    )
    assert.deepEqual(
      r.only.map((t) => t.title),
      ['focused'],
    )
  })
})

describe('strict mode, limitations and the committed report (TSK-0110, HH-TEST-01)', () => {
  const lim = (reason, reviewer, text) =>
    `**Limitation (${reason}${reviewer ? `; reviewer: ${reviewer}` : ''}):** ${text}`
  const fakeReq2 = ['HH', 'ZZ', '02'].join('-')
  const fakeAcc2 = ['T', '97'].join('')
  const fakeTask = ['TSK', '9998'].join('-')
  const fakeSop = ['SOP', 'ZZ', '01'].join('-')
  const fakeQuestion = ['OQ', 'ZZ'].join('-')
  const graph = {
    [fakeReq]: { id: fakeReq, type: 'requirement', status: 'active', priority: 'P0', title: 'traced', links: {} },
    [fakeReq2]: {
      id: fakeReq2,
      type: 'requirement',
      status: 'active',
      priority: 'P0',
      title: 'limited',
      links: { tested_by: [fakeAcc2] },
      body: `Text.\n\n${lim('owner input', 'Owner', 'The value is NOT CONFIGURED.')}`,
    },
    [`${fakeReq}0`]: {
      id: `${fakeReq}0`,
      type: 'requirement',
      status: 'active',
      priority: 'P0',
      title: 'bare',
      links: {},
    },
    [fakeAcc]: { id: fakeAcc, type: 'acceptance', status: 'active', title: 'a', links: {} },
    [fakeAcc2]: {
      id: fakeAcc2,
      type: 'acceptance',
      status: 'active',
      title: 'b',
      links: {},
      body: lim('process requirement', 'Owner', 'Production only.'),
    },
    [fakeTask]: { id: fakeTask, type: 'task', status: 'done', title: 't', links: { implements: [fakeReq, fakeReq2] } },
    [fakeSop]: { id: fakeSop, type: 'sop', status: 'active', title: 's', links: {}, body: 'OPEN QUESTION (owner).' },
    [fakeQuestion]: { id: fakeQuestion, type: 'question', status: 'open', title: 'q', links: {} },
  }
  const titlesOf = (...lines) => extractTitles('apps/server/test/integration/a.test.ts', lines.join('\n'))

  test('[HH-TEST-01] a limitation names one of the four reasons and a reviewer; anything else is malformed', () => {
    const body = [
      lim('owner input', 'Owner', 'Missing value.'),
      lim('real gap', 'Owner and attorney', 'Not built.'),
      lim('later', 'Owner', 'Unknown reason.'),
      lim('owner decision', null, 'No reviewer.'),
    ].join('\n\n')
    assert.deepEqual(
      parseLimitations(body).map((l) => [l.reason, l.reviewer, l.valid]),
      [
        ['owner input', 'Owner', true],
        ['real gap', 'Owner and attorney', true],
        ['later', 'Owner', false],
        ['owner decision', null, false],
      ],
    )
    assert.deepEqual(REASONS, ['owner input', 'owner decision', 'process requirement', 'real gap'])
  })

  test('[HH-TEST-01] evidence has a layer from where its test lives', () => {
    assert.equal(layerOf('apps/e2e/tests/request.spec.ts'), 'e2e')
    assert.equal(layerOf('apps/server/test/integration/requests.test.ts'), 'integration')
    assert.equal(layerOf('packages/db/test/integration/sops.test.ts'), 'integration')
    assert.equal(layerOf('apps/portal/test/App.test.tsx'), 'ui')
    assert.equal(layerOf('apps/server/test/unit/estimates.test.ts'), 'unit')
    assert.equal(layerOf('tools/trace.test.mjs'), 'unit')
  })

  test('[HH-TEST-01][HH-AUD-04] strict mode fails an untraced P0 requirement, never a limited one, and an untagged done task', () => {
    const report = buildReport(graph, {}, titlesOf(call('it', `[${fakeReq}] evidence`)))
    const row = (id) => report.rows.find((r) => r.id === id)
    assert.deepEqual([row(fakeReq).untraced, row(fakeReq2).untraced, row(`${fakeReq}0`).untraced], [false, false, true])
    // A limitation never counts as evidence.
    assert.equal(row(fakeReq2).missing, true)
    assert.deepEqual(row(fakeReq).layers, ['integration'])
    assert.deepEqual(
      report.acceptance.map((a) => [a.id, a.untraced]),
      [
        [fakeAcc2, false],
        [fakeAcc, true],
      ],
    )
    assert.deepEqual(report.untaggedTasks, [{ id: fakeTask, ids: [fakeReq2] }])
    const failures = { fresh: [], stale: [], only: [], known: [] }
    assert.deepEqual(problemsOf(report, failures, { strict: false }), [])
    const strict = problemsOf(report, failures, { strict: true, docCurrent: false })
    assert.equal(strict.length, 5)
    assert.ok(strict.some((p) => p.includes(`untraced P0 requirement: ${fakeReq}0`)))
    assert.ok(strict.some((p) => p.includes(`acceptance test without evidence or limitation: ${fakeAcc}`)))
    assert.ok(strict.some((p) => p.includes(`done task ${fakeTask}`)))
    assert.ok(strict.some((p) => p.includes(fakeSop)))
    assert.ok(strict.some((p) => p.includes('out of date')))
  })

  test('[HH-AUD-02] an operational document that flags an open question needs a question node, linked either way', () => {
    assert.deepEqual(unlinkedConflicts(graph, {}), [fakeSop])
    assert.deepEqual(unlinkedConflicts(graph, { [fakeSop]: [['related', fakeQuestion]] }), [])
    const linked = { ...graph, [fakeSop]: { ...graph[fakeSop], links: { related: [fakeQuestion] } } }
    assert.deepEqual(unlinkedConflicts(linked, {}), [])
    const superseded = { ...graph, [fakeSop]: { ...graph[fakeSop], status: 'superseded' } }
    assert.deepEqual(unlinkedConflicts(superseded, {}), [])
  })

  test('[HH-TEST-01][HH-AUD-03] the committed report is deterministic and lists the limitations and the open questions', () => {
    const titles = titlesOf(call('it', `[${fakeReq}] evidence`))
    const doc = docMarkdown(buildReport(graph, {}, titles))
    assert.equal(doc, docMarkdown(buildReport(graph, {}, titles)))
    assert.match(doc, /Untraced \(neither\): 1\./)
    assert.ok(doc.includes(`- **${fakeReq2}** limited. The value is NOT CONFIGURED. _Reviewer: Owner._`))
    assert.ok(doc.includes(`- ${fakeQuestion}: q`))
    // No line numbers: the committed file changes only with the graph or the layers of the evidence.
    assert.doesNotMatch(doc, /a\.test\.ts:\d/)
  })
})
