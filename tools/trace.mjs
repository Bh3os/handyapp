#!/usr/bin/env node
// Requirement-to-evidence report (HH-AUD-03, HH-TEST-01; TSK-0002, TSK-0110). Generated, never hand-edited.
//
// - Scans every test file for describe/it/test titles and the graph ids they name (HH-..., OWN-DEC-..., T.., TSK-...,
//   RULE-...). A title naming a requirement, or an acceptance test the requirement is `tested_by`, is its evidence.
//   Each piece of evidence has a layer, from where its file lives: unit (domain rules, money, policy, server units,
//   tools), integration (server API and PostgreSQL), ui (site, portal and staff app components) or e2e (the built
//   server in a browser).
// - Reads the stated limitations of requirement and acceptance nodes: a paragraph
//   `**Limitation (<reason>; reviewer: <who>):** <what is not met or not verified, and why>`, where the reason is one
//   of HH-TEST-01's four: owner input, owner decision, process requirement, real gap. A limitation never counts as
//   evidence; it says what stays open and who must act.
// - Writes reports/traceability.md and reports/traceability.json (every test title and line, the CI artifact), and
//   with --write-doc the short human-readable docs/traceability-report.md (coverage per P0 requirement, the
//   limitations, what the Owner must still decide or provide).
// - Keeps pre-existing failures apart from new ones: a test marked skip, todo, fails or fixme must be listed in
//   tools/baseline-failures.json with its reason. An unlisted marked test, a stale baseline entry, a `.only` or an id
//   that is not in the graph fails the run (exit 1).
// - --strict (TSK-0110, the CI `kg` job) also fails on: a P0 requirement or an acceptance test with neither tagged
//   evidence nor a stated limitation; a malformed limitation; a done task whose `implements` ids no test title names;
//   an operational document (SOP, fact, service) that flags an open question or a conflict without a link to a
//   question node (HH-AUD-02); and a docs/traceability-report.md that differs from the generated one.
//
// Usage: node tools/trace.mjs [--strict] [--write-doc] [--out <dir>] [--baseline <file>] [--quiet]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DOC = 'docs/traceability-report.md'
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

/** HH-TEST-01: why a requirement is deferred or limited. */
export const REASONS = ['owner input', 'owner decision', 'process requirement', 'real gap']
export const LAYERS = ['unit', 'integration', 'ui', 'e2e']
const LIMITATION = /^\*\*Limitation \(([^)]*)\):\*\*[ \t]*(.*)$/gm
/** Operational documents (HH-AUD-02): the business nodes taken from the owner's vault files. */
const OPERATIONAL = new Set(['sop', 'fact', 'service'])
const FLAGGED = /OPEN QUESTION|CONFLICT|conflicts with|UNSOURCED|contradict/

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

/** The layer of a test file, from where it lives. */
export function layerOf(file) {
  if (file.startsWith('apps/e2e/')) return 'e2e'
  if (/(^|\/)test\/integration\//.test(file)) return 'integration'
  if (/^apps\/(site|portal|staff)\//.test(file)) return 'ui'
  return 'unit'
}

/** The stated limitations of a node body; `valid` is false when the reason or the reviewer is missing or unknown. */
export function parseLimitations(body = '') {
  return [...body.matchAll(LIMITATION)].map((m) => {
    const [reason = '', ...rest] = m[1].split(';').map((s) => s.trim())
    const reviewer =
      rest
        .find((r) => r.startsWith('reviewer:'))
        ?.slice('reviewer:'.length)
        .trim() || null
    const text = m[2].trim()
    return { reason, reviewer, text, valid: REASONS.includes(reason) && reviewer !== null && text !== '' }
  })
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

/** Operational documents that flag an open question or a conflict but link to no question node, either way. */
export function unlinkedConflicts(nodes, back) {
  return Object.values(nodes)
    .filter((n) => OPERATIONAL.has(n.type) && n.status !== 'superseded' && FLAGGED.test(n.body ?? ''))
    .filter((n) => {
      const linked = [...Object.values(n.links ?? {}).flat(), ...(back[n.id] ?? []).map(([, from]) => from)]
      return !linked.some((id) => nodes[id]?.type === 'question')
    })
    .map((n) => n.id)
    .sort()
}

const byNumber = (a, b) => a.id.localeCompare(b.id, 'en', { numeric: true })

/** Builds the report rows from the graph nodes, their back-links and the test titles. */
export function buildReport(nodes, back, titles) {
  const unknownIds = titles.flatMap((t) =>
    t.ids.filter((id) => !nodes[id]).map((id) => ({ id, at: `${t.file}:${t.line}` })),
  )
  const byId = new Map()
  for (const t of titles) for (const id of t.ids) byId.set(id, [...(byId.get(id) ?? []), t])
  const evidenceOf = (ids) => {
    const found = ids.flatMap((id) => byId.get(id) ?? [])
    return {
      evidence: [...new Set(found.map((t) => `${t.file}:${t.line} ${t.title}`))],
      layers: LAYERS.filter((l) => found.some((t) => layerOf(t.file) === l)),
    }
  }
  const limitationsOf = (n) => parseLimitations(n.body)
  // Active requirements, and the open ones still waiting on the owner (for example the AI of wave 2).
  const requirements = Object.values(nodes)
    .filter((n) => n.type === 'requirement' && (n.status === 'active' || n.status === 'open'))
    .sort(byNumber)
  const rows = requirements.map((r) => {
    const { evidence, layers } = evidenceOf([r.id, ...(r.links?.tested_by ?? [])])
    const limitations = limitationsOf(r)
    const tasks = (back[r.id] ?? [])
      .filter(([edge, from]) => edge === 'implements' && nodes[from]?.type === 'task')
      .map(([, from]) => `${from} (${nodes[from].status})`)
    const missing = evidence.length === 0
    return {
      id: r.id,
      priority: r.priority ?? '',
      status: r.status,
      title: r.title,
      evidence,
      layers,
      acceptance: r.links?.tested_by ?? [],
      tasks,
      limitations,
      missing,
      untraced: r.priority === 'P0' && missing && !limitations.some((l) => l.valid),
    }
  })
  const acceptance = Object.values(nodes)
    .filter((n) => n.type === 'acceptance' && n.status === 'active')
    .sort(byNumber)
    .map((a) => {
      const { evidence, layers } = evidenceOf([a.id])
      const limitations = limitationsOf(a)
      const missing = evidence.length === 0
      const untraced = missing && !limitations.some((l) => l.valid)
      return { id: a.id, title: a.title, evidence, layers, limitations, missing, untraced }
    })
  const badLimitations = Object.values(nodes)
    .sort(byNumber)
    .flatMap((n) => limitationsOf(n).flatMap((l) => (l.valid ? [] : [{ id: n.id, reason: l.reason, text: l.text }])))
  // "Tests are tagged with the implements IDs": every id a done task implements is named by a test title.
  const untaggedTasks = Object.values(nodes)
    .filter((n) => n.type === 'task' && n.status === 'done')
    .sort(byNumber)
    .map((n) => ({ id: n.id, ids: (n.links?.implements ?? []).filter((id) => !byId.has(id)) }))
    .filter((t) => t.ids.length)
  const questions = Object.values(nodes)
    .filter((n) => n.type === 'question' && n.status === 'open')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((n) => ({ id: n.id, title: n.title, proposedDetails: n.id.endsWith('-DETAILS') }))
  const decisions = [...byId.keys()].filter((id) => nodes[id]?.type === 'decision').sort()
  return {
    rows,
    acceptance,
    decisions,
    unknownIds,
    badLimitations,
    untaggedTasks,
    unlinkedConflicts: unlinkedConflicts(nodes, back),
    questions,
  }
}

const esc = (s) => String(s).replace(/\|/g, '\\|')
const limitationLine = (l) => `${l.reason} (reviewer: ${l.reviewer ?? 'none'}): ${l.text}`

/** The detailed report (CI artifact): every test title and line. */
function markdown(report, failures) {
  const { rows, acceptance, decisions, unknownIds } = report
  const covered = rows.filter((r) => !r.missing).length
  const p0 = rows.filter((r) => r.priority === 'P0')
  const p0Covered = p0.filter((r) => !r.missing).length
  const out = [
    '# Traceability report',
    '',
    'Generated by `node tools/trace.mjs`; do not edit by hand. The short version is `docs/traceability-report.md`.',
    '',
    `- Requirements with test evidence: ${covered} of ${rows.length} (P0: ${p0Covered} of ${p0.length}). Untraced P0 requirements (no evidence, no limitation): ${p0.filter((r) => r.untraced).length}.`,
    `- Acceptance tests with test evidence: ${acceptance.filter((a) => !a.missing).length} of ${acceptance.length}.`,
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
  list('Malformed limitations', report.badLimitations, (b) => `${b.id}: (${b.reason}) ${b.text}`)
  list('Done tasks whose implemented ids no test names', report.untaggedTasks, (t) => `${t.id}: ${t.ids.join(', ')}`)
  list('Operational documents flagging a question without a question node', report.unlinkedConflicts, (id) => id)
  out.push(
    '## Requirements',
    '',
    '| Requirement | P | Evidence | Implementing tasks | Limitations | Missing |',
    '| --- | --- | --- | --- | --- | --- |',
  )
  for (const r of rows)
    out.push(
      `| ${r.id} ${esc(r.title)} | ${r.priority} | ${r.evidence.length ? esc(r.evidence.join('<br>')) : ''} | ${r.tasks.join(', ')} | ${esc(r.limitations.map(limitationLine).join('<br>'))} | ${r.missing ? 'yes' : ''} |`,
    )
  out.push('', '## Acceptance tests', '', '| Test | Evidence | Limitations |', '| --- | --- | --- |')
  for (const a of acceptance)
    out.push(
      `| ${a.id} ${esc(a.title)} | ${a.evidence.length ? esc(a.evidence.join('<br>')) : ''} | ${esc(a.limitations.map(limitationLine).join('<br>'))} |`,
    )
  return out.join('\n') + '\n'
}

/**
 * The short human-readable report committed as docs/traceability-report.md. It holds no line numbers or counts of
 * tests, so it changes only when the graph or the layers of a requirement's evidence change.
 */
export function docMarkdown(report) {
  const { rows, acceptance, questions } = report
  const p0 = rows.filter((r) => r.priority === 'P0')
  const limited = [...rows, ...acceptance].filter((r) => r.limitations.length)
  const all = limited.flatMap((r) => r.limitations.map((l) => ({ ...l, id: r.id, title: r.title })))
  const count = (reason) => all.filter((l) => l.reason === reason).length
  const layers = (r) => (r.layers.length ? r.layers.join(', ') : 'none')
  const lims = (r) => (r.limitations.length ? [...new Set(r.limitations.map((l) => l.reason))].join(', ') : '')
  const out = [
    '# Traceability report',
    '',
    'Generated by `node tools/trace.mjs --write-doc` from the knowledge graph (`kg/`) and the test titles; do not edit',
    'by hand. The CI `kg` job runs `node tools/trace.mjs --strict` and fails when this file is out of date, when a P0',
    'requirement or an acceptance test has neither tagged test evidence nor a stated limitation, or when an operational',
    'document flags a conflict without a question node. The detailed report, with every test title and line, is the',
    '`traceability` artifact of that job (`reports/traceability.md`).',
    '',
    '## Summary',
    '',
    `- P0 requirements: ${p0.length}. With tagged test evidence: ${p0.filter((r) => !r.missing).length}. With a stated limitation: ${p0.filter((r) => r.limitations.length).length}. Untraced (neither): ${p0.filter((r) => r.untraced).length}.`,
    `- Acceptance tests: ${acceptance.length} (${acceptance[0]?.id ?? ''} to ${acceptance.at(-1)?.id ?? ''}). With tagged test evidence: ${acceptance.filter((a) => !a.missing).length}. With a stated limitation: ${acceptance.filter((a) => a.limitations.length).length}.`,
    `- Stated limitations: ${all.length} (owner input ${count('owner input')}, owner decision ${count('owner decision')}, process requirement ${count('process requirement')}, real gap ${count('real gap')}).`,
    `- Open questions for the Owner or a professional: ${questions.length}, of which ${questions.filter((q) => q.proposedDetails).length} hold PROPOSED details awaiting approval.`,
    '',
    'How to read it:',
    '',
    '- **Evidence** is a test whose title names the requirement, or an acceptance test the requirement is `tested_by`.',
    '  Its layer: unit (domain rules, money, policy, server units, tools), integration (server API and PostgreSQL), ui',
    '  (site, portal and staff app components), e2e (the built server in a browser). Whether those tests pass is decided',
    '  by the `test` and `e2e` jobs of the same CI run; this report does not run them.',
    '- **Code and responsibility**: the implementing tasks name the modules; integration evidence covers the API and',
    '  data, ui evidence the screens.',
    '- **Reviewer**: every change was reviewed in its pull request and merged only with the required checks green. A',
    '  limitation names who must still act. A limited requirement is never called complete.',
    '',
    '## Limitations',
    '',
  ]
  for (const reason of REASONS) {
    const items = all.filter((l) => l.reason === reason)
    if (!items.length) continue
    out.push(`### ${reason[0].toUpperCase()}${reason.slice(1)}`, '')
    for (const l of items) out.push(`- **${l.id}** ${l.title}. ${l.text} _Reviewer: ${l.reviewer}._`)
    out.push('')
  }
  out.push(
    '## What the Owner must still decide or provide before launch',
    '',
    'Each item is a question node; read it with `node tools/kg.mjs show <id>`. The owner-input and owner-decision',
    'limitations above are part of this list.',
    '',
    '### Owner inputs, decisions and professional reviews',
    '',
    ...questions.filter((q) => !q.proposedDetails).map((q) => `- ${q.id}: ${q.title}`),
    '',
    '### PROPOSED details awaiting the Owner’s approval',
    '',
    ...questions.filter((q) => q.proposedDetails).map((q) => `- ${q.id}: ${q.title}`),
    '',
    '## P0 requirements',
    '',
    '| Requirement | Evidence layers | Acceptance tests | Implementing tasks | Limitations |',
    '| --- | --- | --- | --- | --- |',
  )
  for (const r of p0)
    out.push(
      `| ${r.id} ${esc(r.title)} | ${layers(r)} | ${r.acceptance.join(', ')} | ${r.tasks.map((t) => t.split(' ')[0]).join(', ')} | ${lims(r)} |`,
    )
  out.push('', '## Acceptance tests', '', '| Test | Evidence layers | Limitations |', '| --- | --- | --- |')
  for (const a of acceptance) out.push(`| ${a.id} ${esc(a.title)} | ${layers(a)} | ${lims(a)} |`)
  const others = rows.filter((r) => r.priority !== 'P0')
  if (others.length) {
    out.push('', '## P1 and P2 requirements', '', '| Requirement | P | Evidence layers | Limitations |')
    out.push('| --- | --- | --- | --- |')
    for (const r of others) {
      const open = r.status === 'open' ? ' (open: waiting on the owner)' : ''
      out.push(`| ${r.id} ${esc(r.title)}${open} | ${r.priority} | ${layers(r)} | ${lims(r)} |`)
    }
  }
  // Graph links read as plain ids outside Obsidian.
  return out.join('\n').replace(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g, '$1') + '\n'
}

/** Everything that fails the run; strict mode adds the TSK-0110 checks. */
export function problemsOf(report, failures, { strict, docCurrent = true }) {
  const problems = [
    ...failures.fresh.map((t) => `not passing and not in the baseline: ${t.file}:${t.line} ${t.title}`),
    ...failures.stale.map((b) => `stale baseline entry: ${b.file} ${b.title}`),
    ...failures.only.map((t) => `focused test: ${t.file}:${t.line} ${t.title}`),
    ...report.unknownIds.map((u) => `id not in the graph: ${u.id} at ${u.at}`),
  ]
  if (!strict) return problems
  return [
    ...problems,
    ...report.rows.filter((r) => r.untraced).map((r) => `untraced P0 requirement: ${r.id}`),
    ...report.acceptance
      .filter((a) => a.untraced)
      .map((a) => `acceptance test without evidence or limitation: ${a.id}`),
    ...report.badLimitations.map((b) => `malformed limitation in ${b.id}: (${b.reason})`),
    ...report.untaggedTasks.map((t) => `done task ${t.id}: no test title names ${t.ids.join(', ')}`),
    ...report.unlinkedConflicts.map((id) => `${id} flags an open question or conflict but links to no question node`),
    ...(docCurrent ? [] : [`${DOC} is out of date: run node tools/trace.mjs --write-doc`]),
  ]
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
  const strict = argv.includes('--strict')
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
  const doc = docMarkdown(report)
  const docFile = join(ROOT, DOC)
  if (argv.includes('--write-doc')) writeFileSync(docFile, doc)
  const docCurrent = existsSync(docFile) && readFileSync(docFile, 'utf8') === doc
  if (!argv.includes('--quiet')) console.log(md.split('\n## ')[0].trim())
  const problems = problemsOf(report, failures, { strict, docCurrent })
  for (const p of problems) console.log(`problem: ${p}`)
  console.log(
    `\ntraceability${strict ? ' (strict)' : ''}: ${titles.length} test titles scanned; ${problems.length} problems; report in ${relative(ROOT, outDir)}/`,
  )
  return problems.length ? 1 : 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  process.exitCode = main(process.argv.slice(2))
