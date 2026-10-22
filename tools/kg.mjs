#!/usr/bin/env node
// Query tool for the knowledge graph in kg/ (no dependencies). Agents use it instead of reading kg/ file by file.
// Usage: node tools/kg.mjs <index|lint|show|ctx|find|list|maps> ...   (see kg/README.md)
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, renameSync } from 'node:fs'
import { join, relative, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const KG = join(ROOT, 'kg')
const INDEX = join(KG, '_index.json')
const EDGES = ['decided_by', 'supersedes', 'superseded_by', 'depends_on', 'blocks', 'implements', 'constrained_by', 'uses', 'tested_by', 'part_of', 'related']
const SKIP = new Set(['README.md'])

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.') || name.startsWith('_')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { if (name !== 'maps') out.push(...walk(p)) }
    else if (name.endsWith('.md') && !SKIP.has(name)) out.push(p)
  }
  return out
}

const unq = (s) => s.trim().replace(/^["']|["']$/g, '')
const ids = (s) => [...s.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)].map((m) => m[1].trim())

// Minimal YAML front-matter reader: scalar keys, `links:` with one level of `edge: [..]` or `edge:\n  - ..`.
function parse(file) {
  const text = readFileSync(file, 'utf8')
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!m) return { file, error: 'no front matter' }
  const node = { file: relative(ROOT, file), links: {}, body: m[2].trim() }
  let inLinks = false, edge = null
  for (const raw of m[1].split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    const line = raw.replace(/\s+#.*$/, '')
    if (/^\S/.test(line)) {
      inLinks = false; edge = null
      const [k, ...rest] = line.split(':'); const v = rest.join(':').trim()
      if (k === 'links') { inLinks = true; continue }
      node[k.trim()] = unq(v)
    } else if (inLinks) {
      const em = line.match(/^\s+([a-z_]+):\s*(.*)$/)
      if (em && EDGES.includes(em[1])) { edge = em[1]; node.links[edge] = ids(em[2]); continue }
      if (em) { edge = null; (node.badEdges ??= []).push(em[1]); continue }
      if (edge && /^\s+-\s+/.test(line)) node.links[edge].push(...ids(line))
    }
  }
  // Wiki links in the body count as `related` when not already typed.
  const typed = new Set(Object.values(node.links).flat())
  const bodyLinks = ids(node.body).filter((i) => !typed.has(i) && i !== node.id)
  if (bodyLinks.length) node.links.related = [...new Set([...(node.links.related ?? []), ...bodyLinks])]
  return node
}

function build() {
  const nodes = {}, problems = []
  for (const f of walk(KG)) {
    const n = parse(f)
    if (n.error) { problems.push(`${relative(ROOT, f)}: ${n.error}`); continue }
    if (!n.id) { problems.push(`${n.file}: missing id`); continue }
    if (basename(f, '.md') !== n.id) problems.push(`${n.file}: file name differs from id ${n.id}`)
    if (nodes[n.id]) problems.push(`duplicate id ${n.id}: ${nodes[n.id].file} and ${n.file}`)
    for (const k of ['type', 'title', 'status']) if (!n[k]) problems.push(`${n.id}: missing ${k}`)
    for (const b of n.badEdges ?? []) problems.push(`${n.id}: unknown edge type ${b}`)
    nodes[n.id] = n
  }
  const back = {}
  for (const n of Object.values(nodes))
    for (const [e, ts] of Object.entries(n.links))
      for (const t of ts) {
        if (!nodes[t]) problems.push(`${n.id}: ${e} -> missing node ${t}`)
        ;(back[t] ??= []).push([e, n.id])
      }
  return { nodes, back, problems }
}

// Always built from the notes (fast for thousands of files), so results are never stale.
function load() {
  const { nodes, back } = build()
  return { nodes, back }
}

function index(quiet) {
  const { nodes, back, problems } = build()
  const idx = { nodes: {}, back }
  for (const [id, n] of Object.entries(nodes)) idx.nodes[id] = { ...n }
  // Written to a temporary file and renamed into place, so a process reading the index while another rebuilds it
  // (the tool tests run in parallel) never sees a half-written file.
  const tmp = `${INDEX}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(idx))
  renameSync(tmp, INDEX)
  if (!quiet) console.log(`indexed ${Object.keys(nodes).length} nodes; ${problems.length} problems (run lint)`)
  return idx
}

const line = (n) => `${n.id} [${n.type}${n.status && n.status !== 'active' ? '/' + n.status : ''}] ${n.title}`

function neighbours(idx, id) {
  const n = idx.nodes[id]; const out = []
  if (n) for (const [e, ts] of Object.entries(n.links)) for (const t of ts) out.push([e, t])
  for (const [e, s] of idx.back[id] ?? []) out.push([`<-${e}`, s])
  return out
}

function show(idx, id, depth = 1) {
  const n = idx.nodes[id]
  if (!n) return console.log(`no node ${id}; try: node tools/kg.mjs find ${id}`)
  console.log(`# ${line(n)}${n.priority ? ' ' + n.priority : ''}${n.area ? ' area=' + n.area : ''}${n.source ? '\nsource: ' + n.source : ''}\n${n.body}\n`)
  const seen = new Set([id]); let frontier = [id]
  for (let d = 1; d <= depth; d++) {
    const next = []
    for (const f of frontier) for (const [e, t] of neighbours(idx, f)) {
      if (seen.has(t)) continue; seen.add(t); next.push(t)
      const m = idx.nodes[t]
      console.log(`${'  '.repeat(d - 1)}- ${e} ${m ? line(m) : t + ' (missing)'}`)
    }
    frontier = next
  }
}

// Everything needed to work on a node, kept small: full text for the node, the requirements it implements, its
// acceptance tests, and every rule and fact that binds them; titles only for decisions, entities, journeys and the
// rest (load one with `show <id>`). `--full <type,...>` also prints those types in full, e.g. --full entity,decision.
const FULL_TYPES = new Set(['requirement', 'acceptance', 'rule', 'fact'])
function ctx(idx, id, extra = []) {
  const root = idx.nodes[id]
  if (!root) return console.log(`no node ${id}`)
  const full = new Set(extra)
  const shown = new Map([[id, root]]), titles = new Map()
  const want = (n, depth) => n && n.status !== 'superseded' && (FULL_TYPES.has(n.type) || full.has(n.type)) && (n.type !== 'requirement' || depth <= 1)
  let frontier = [id]
  for (let d = 1; d <= 2 && frontier.length; d++) {
    const next = []
    for (const cur of frontier) for (const [e, ts] of Object.entries(idx.nodes[cur].links)) for (const t of ts) {
      if (shown.has(t)) continue
      const n = idx.nodes[t]
      if (want(n, d) && (d === 1 || ['constrained_by', 'uses', 'tested_by'].includes(e))) { shown.set(t, n); next.push(t) }
      else if (!titles.has(t)) titles.set(t, e)
    }
    frontier = next
  }
  for (const n of shown.values()) console.log(`## ${line(n)}${n.priority ? ' ' + n.priority : ''}\n${n.body}\n`)
  const rest = [...titles].filter(([t]) => !shown.has(t))
  if (rest.length) {
    console.log('## linked (titles only; `show <id>` for one)')
    for (const [t, e] of rest) console.log(`- ${e} ${idx.nodes[t] ? line(idx.nodes[t]) : t}`)
  }
}

function find(idx, text) {
  const re = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  const hits = Object.values(idx.nodes).filter((n) => re.test(n.id) || re.test(n.title))
  const bodyHits = hits.length < 20 ? Object.values(idx.nodes).filter((n) => !hits.includes(n) && re.test(n.body)) : []
  for (const n of hits.slice(0, 60)) console.log(line(n))
  if (bodyHits.length) { console.log('-- in body:'); for (const n of bodyHits.slice(0, 30)) console.log(line(n)) }
}

function list(idx, type, status) {
  for (const n of Object.values(idx.nodes))
    if ((!type || n.type === type || n.area === type) && (!status || n.status === status)) console.log(line(n))
}

function maps(idx) {
  const dir = join(KG, 'maps'); mkdirSync(dir, { recursive: true })
  const by = {}
  for (const n of Object.values(idx.nodes)) (by[n.type] ??= []).push(n)
  for (const [type, ns] of Object.entries(by)) {
    ns.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }))
    const body = ns.map((n) => `- [[${n.id}]] ${n.title}${n.status !== 'active' ? ` (${n.status})` : ''}`).join('\n')
    writeFileSync(join(dir, `MAP-${type}.md`), `---\nid: MAP-${type}\ntype: map\ntitle: All ${type} nodes\nstatus: active\n---\nGenerated by \`node tools/kg.mjs maps\`; do not edit.\n\n${body}\n`)
  }
  console.log(`wrote ${Object.keys(by).length} maps`)
}

const [cmd, ...args] = process.argv.slice(2)
const flag = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt }
switch (cmd) {
  case 'index': index(false); break
  case 'lint': { const { problems, nodes } = build(); problems.forEach((p) => console.log(p)); console.log(`${Object.keys(nodes).length} nodes, ${problems.length} problems`); process.exitCode = problems.length ? 1 : 0; break }
  case 'show': show(load(), args[0], Number(flag('--depth', 1))); break
  case 'ctx': ctx(load(), args[0], (flag('--full', '') || '').split(',').filter(Boolean)); break
  case 'find': find(load(), args.join(' ')); break
  case 'list': list(load(), args[0] && !args[0].startsWith('--') ? args[0] : undefined, flag('--status')); break
  case 'maps': maps(index(true)); break
  default: console.log('usage: node tools/kg.mjs index|lint|maps | show <id> [--depth n] | ctx <id> | find <text> | list [type|area] [--status s]')
}
