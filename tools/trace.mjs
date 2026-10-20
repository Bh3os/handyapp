#!/usr/bin/env node
// Requirement-to-evidence report (HH-AUD-03, HH-TEST-01; TSK-0002). Generated, never hand-edited.
//
// - Scans every test file for describe/it/test titles and the graph ids they name (HH-..., OWN-DEC-..., T.., TSK-...,
//   RULE-...). A title naming a requirement, or an acceptance test the requirement is `tested_by`, is its evidence.
// - Writes reports/traceability.md and reports/traceability.json: one row per active requirement with its evidence,
//   implementing tasks and whether evidence is missing.
// - Keeps pre-existing failures apart from new ones: a test marked skip, todo, fails or fixme must be listed in
//   tools/baseline-failures.json with its reason. An unlisted marked test, a stale baseline entry, a `.only` or an id
//   that is not in the graph fails the run (exit 1). Missing evidence is reported, not failed, until TSK-0110.
//
// Usage: node tools/trace.mjs [--out <dir>] [--baseline <file>] [--quiet]
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'kg',
  'sources',
  'reports',
  'coverage',
  'playwright-report',
  'test-results',
])
const TEST_FILE = /\.(test|spec)\.(ts|tsx|js|mjs)$/
const ID = /\b(HH-[A-Z0-9]+-\d+|OWN-DEC-\d+|T\d{2,3}|TSK-\d{4}|RULE-[A-Z0-9-]*[A-Z0-9])\b/g
// describe/it/test, optional modifiers (.skip, .only, .each(...) is not supported), then a quoted title.
const CALL = /\b(x?describe|x?it|test)((?:\.[a-zA-Z]+)*)\s*\(\s*(['"`])((?:\\.|(?!\3).)*)\3/g
const NOT_PASSING = new Set(['skip', 'todo', 'fails', 'fixme'])

/** Lists test files under `dir`, relative to `root`, in a stable order. */
export function findTestFiles(root, dir = root) {
  const out = []
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.') || SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...findTestFiles(root, p))
    else if (TEST_FILE.test(name)) out.push(relative(root, p))
  }
  return out
}

/** Extracts the titles of describe/it/test calls with their line, modifiers and the graph ids they name. */
export function extractTitles(file, source) {
  const titles = []
  for (const m of source.matchAll(CALL)) {
    const [, fn, mods, , title] = m
    const modifiers = mods.split('.').filter(Boolean)
    if (fn.startsWith('x')) modifiers.push('skip')
    const line = source.slice(0, m.index).split('\n').length
    titles.push({
      file,
      line,
      kind: fn.replace(/^x/, ''),
      title,
      modifiers,
      ids: [...new Set([...title.matchAll(ID)].map((i) => i[1]))],
    })
  }
  return titles
}

/** Splits not-passing tests into baseline (listed) and new (unlisted) ones, and finds stale baseline entries. */
export function classifyFailures(titles, baseline) {
  const key = (t) => `${t.file}\u0000${t.title}`
  const listed = new Map(baseline.map((b) => [key(b), b]))
  const marked = titles.filter((t) => t.modifiers.some((m) => NOT_PASSING.has(m)))
  const known = []
  const fresh = []
  for (const t of marked) (listed.has(key(t)) ? known : fresh).push(t)
  const markedKeys = new Set(marked.map(key))
  const stale = baseline.filter((b) => !markedKeys.has(key(b)))
  const only = titles.filter((t) => t.modifiers.includes('only'))
  return { known, fresh, stale, only }
}

/** Builds the report rows from the graph nodes, their back-links and the test titles. */
export function buildReport(nodes, back, titles) {
  const unknownIds = titles.flatMap((t) =>
    t.ids.filter((id) => !nodes[id]).map((id) => ({ id, at: `${t.file}:${t.line}` })),
  )
  const byId = new Map()
  for (const t of titles) for (const id of t.ids) byId.set(id, [...(byId.get(id) ?? []), t])
  const requirements = Object.values(nodes)
    .filter((n) => n.type === 'requirement' && n.status === 'active')
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
  const rows = requirements.map((r) => {
    const via = [r.id, ...(r.links?.tested_by ?? [])]
    const evidence = via.flatMap((id) => (byId.get(id) ?? []).map((t) => `${t.file}:${t.line} ${t.title}`))
    const tasks = (back[r.id] ?? [])
      .filter(([edge, from]) => edge === 'implements' && nodes[from]?.type === 'task')
      .map(([, from]) => `${from} (${nodes[from].status})`)
    return {
      id: r.id,
      priority: r.priority ?? '',
      title: r.title,
      evidence: [...new Set(evidence)],
      tasks,
      missing: evidence.length === 0,
    }
  })
  const decisions = [...byId.keys()].filter((id) => nodes[id]?.type === 'decision').sort()
  return { rows, decisions, unknownIds }
}

function markdown(report, failures) {
  const { rows, decisions, unknownIds } = report
  const covered = rows.filter((r) => !r.missing).length
  const p0 = rows.filter((r) => r.priority === 'P0')
  const p0Covered = p0.filter((r) => !r.missing).length
  const esc = (s) => String(s).replace(/\|/g, '\\|')
  const out = [
    '# Traceability report',
    '',
    'Generated by `node tools/trace.mjs`; do not edit by hand.',
    '',
    `- Requirements with test evidence: ${covered} of ${rows.length} (P0: ${p0Covered} of ${p0.length}).`,
    `- Decisions named in test titles: ${decisions.length ? decisions.join(', ') : 'none'}.`,
    `- Baseline (pre-existing) failures: ${failures.known.length}. New not-passing tests: ${failures.fresh.length}. Stale baseline entries: ${failures.stale.length}. Focused (.only) tests: ${failures.only.length}.`,
    `- Ids named in tests but missing from the graph: ${unknownIds.length ? unknownIds.map((u) => `${u.id} (${u.at})`).join(', ') : 'none'}.`,
    '',
  ]
  const list = (title, items, fmt) => {
    if (!items.length) return
    out.push(`## ${title}`, '', ...items.map((i) => `- ${fmt(i)}`), '')
  }
  list(
    'New not-passing tests (not in the baseline)',
    failures.fresh,
    (t) => `${t.file}:${t.line} ${t.title} [${t.modifiers.join(', ')}]`,
  )
  list('Baseline failures (pre-existing)', failures.known, (t) => `${t.file}:${t.line} ${t.title}`)
  list('Stale baseline entries', failures.stale, (b) => `${b.file} ${b.title}`)
  list('Focused tests', failures.only, (t) => `${t.file}:${t.line} ${t.title}`)
  out.push(
    '## Requirements',
    '',
    '| Requirement | P | Evidence | Implementing tasks | Missing |',
    '| --- | --- | --- | --- | --- |',
  )
  for (const r of rows)
    out.push(
      `| ${r.id} ${esc(r.title)} | ${r.priority} | ${r.evidence.length ? esc(r.evidence.join('<br>')) : ''} | ${r.tasks.join(', ')} | ${r.missing ? 'yes' : ''} |`,
    )
  return out.join('\n') + '\n'
}

function loadGraph() {
  execFileSync(process.execPath, [join(ROOT, 'tools', 'kg.mjs'), 'index'], { stdio: 'ignore' })
  return JSON.parse(readFileSync(join(ROOT, 'kg', '_index.json'), 'utf8'))
}

function main(argv) {
  const flag = (name, dflt) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : dflt
  }
  const outDir = join(ROOT, flag('--out', 'reports'))
  const baselineFile = join(ROOT, flag('--baseline', 'tools/baseline-failures.json'))
  const baseline = JSON.parse(readFileSync(baselineFile, 'utf8')).failures ?? []
  const { nodes, back } = loadGraph()
  const titles = findTestFiles(ROOT).flatMap((f) => extractTitles(f, readFileSync(join(ROOT, f), 'utf8')))
  const report = buildReport(nodes, back, titles)
  const failures = classifyFailures(titles, baseline)
  mkdirSync(outDir, { recursive: true })
  const md = markdown(report, failures)
  writeFileSync(join(outDir, 'traceability.md'), md)
  writeFileSync(join(outDir, 'traceability.json'), JSON.stringify({ ...report, failures }, null, 2) + '\n')
  if (!argv.includes('--quiet')) console.log(md.split('\n## ')[0].trim())
  const problems = failures.fresh.length + failures.stale.length + failures.only.length + report.unknownIds.length
  console.log(
    `\ntraceability: ${titles.length} test titles scanned; ${problems} problems; report in ${relative(ROOT, outDir)}/`,
  )
  return problems ? 1 : 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  process.exitCode = main(process.argv.slice(2))
