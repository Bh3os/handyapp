// Tests of the traceability report (node --test). Fixture test sources and ids are built at runtime so the real scan
// of this repository does not read them as tests or as graph ids.
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { buildReport, classifyFailures, extractTitles } from './trace.mjs'

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
