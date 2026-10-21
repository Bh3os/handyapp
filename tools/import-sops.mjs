#!/usr/bin/env node
// Builds packages/db/seed/sops.json from the 26 SOP-* nodes (TSK-0068; HH-PKT-03, HH-WORK-11, ENT-SOPVersion,
// OWN-DEC-17, OWN-DEC-108, RULE-NO-INVENTED-FACTS). Generated, never hand-edited: change the nodes, then run this tool.
//
// - Reads the graph through tools/kg.mjs (`index`, then kg/_index.json), never kg/ file by file.
// - Imports each SOP node's checklist verbatim: the six stages of HH-WORK-11 (the node's "## 1." to "## 6."
//   sections), the service-specific stop-work, escalation and incident section, and the open questions of the source
//   SOP. Every non-blank line of those sections is kept unchanged, in order, inside exactly one item; nothing is
//   written, reworded, completed or reordered by this tool. Items are:
//     step     a list item ("- " or "- [ ] "), with its indented continuation lines; an "Evidence:" sub-line (the node
//              lists the photo, measurement or note the step's own wording asks for) becomes its evidence kinds;
//     control  a quoted HOLD, GATE or FLAG line (review controls added in the vault on 2026-10-03, pending review);
//     table    consecutive table rows (the quality checkpoints tables);
//     note     any other paragraph or quotation.
//   A step names the controls quoted directly before it (`holdBefore`): the nodes' rule is that "a HOLD placed before
//   a step must be cleared before that step starts". No other relation is inferred.
// - Source file and line (HH-PKT-03): the node's `source:` names the vault file; each item's first line is found in
//   that file (sources/vault/, frozen) with link targets removed, searching onward from the previous item. A line the
//   graph added (none in the vault) keeps `line: null`, so it is never presented as vault text.
// - Every version is imported as "pending competent review" (OWN-DEC-17); the Owner's sign-off is recorded later on
//   the version in the database. Spanish is "pending": no Spanish SOP text exists (OWN-DEC-79).
// - PROPOSED: every step is `required` (unknown is not safe, OWN-DEC-17); which steps are optional is not stated in
//   the SOPs, so none is treated as optional.
//
// Usage: node tools/import-sops.mjs [--check]   (--check exits 1 when the committed file is out of date)
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'packages', 'db', 'seed', 'sops.json')
const VAULT = join(ROOT, 'sources', 'vault')

/** The six ordered checklist stages of HH-WORK-11 (OWN-DEC-108), as the SOP nodes head them. */
export const STAGES = [
  { stage: 1, key: 'site_preparation', heading: '## 1. Site preparation and property protection' },
  { stage: 2, key: 'setup_checks', heading: '## 2. Setup and required measurements/checks' },
  { stage: 3, key: 'work_steps', heading: '## 3. Service-specific work steps' },
  { stage: 4, key: 'quality_checks', heading: '## 4. Quality checks' },
  { stage: 5, key: 'cleanup_waste', heading: '## 5. Cleanup and waste handling' },
  { stage: 6, key: 'final_checks', heading: '## 6. Final checks, completion photos and walkthrough' },
]
const STOP_WORK = '## Stop-work triggers, escalation and incidents (service-specific)'
const OPEN_QUESTIONS = '## Open questions in the source SOP'
const EVIDENCE_KINDS = ['photo', 'measurement', 'note']

/** A line as the vault file holds it: Markdown link targets and wiki-link brackets removed, quote marker dropped. */
export function normalize(line) {
  return line
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]*)(\|[^\]]*)?\]\]/g, '$1')
    .replace(/^\s*>\s?/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Splits a node body into its "## " sections, each a list of lines. */
function sections(body) {
  const out = new Map()
  let current = null
  for (const line of body.split('\n')) {
    if (line.startsWith('## ')) {
      current = line
      out.set(line, [])
    } else if (current) out.get(current).push(line)
  }
  return out
}

/**
 * The items of one section, every non-blank line kept verbatim. `prefix` numbers the items (`3.4` is the fourth item
 * of stage 3).
 */
export function parseItems(lines, prefix) {
  const items = []
  let section = null
  let open = null // the item that following lines may continue
  let pendingControls = []
  const push = (item) => {
    item.id = `${prefix}.${items.length + 1}`
    item.section = section
    items.push(item)
    open = item
    return item
  }
  for (const line of lines) {
    if (line.trim() === '') {
      open = null
      continue
    }
    if (line.startsWith('### ')) {
      section = line.slice(4)
      open = null
      pendingControls = []
      continue
    }
    if (/^>/.test(line)) {
      if (/^>\s*$/.test(line)) {
        open = null
        continue
      }
      if (open && open.quoted) {
        open.lines.push(line)
        continue
      }
      const m = /^(HOLD|GATE|FLAG)\b(?: \(([^)]*)\))?/.exec(line.replace(/^>\s?/, ''))
      const item = m
        ? push({ kind: 'control', control: m[1], ref: m[2] ?? null, lines: [line], quoted: true })
        : push({ kind: 'note', lines: [line], quoted: true })
      if (item.kind === 'control') pendingControls.push(item.id)
      continue
    }
    const bullet = /^- (\[ \] )?/.exec(line)
    if (bullet) {
      push({
        kind: 'step',
        checkbox: Boolean(bullet[1]),
        lines: [line],
        evidence: [],
        required: true,
        holdBefore: pendingControls,
      })
      pendingControls = []
      continue
    }
    if (/^(\s+)\S/.test(line) && open && open.kind === 'step') {
      const ev = /^ {2}- Evidence: (.+)$/.exec(line)
      open.lines.push(line)
      if (ev) {
        const kinds = ev[1].split(',').map((s) => s.trim())
        for (const k of kinds) if (!EVIDENCE_KINDS.includes(k)) throw new Error(`${prefix}: unknown evidence "${k}"`)
        open.evidence.push(...kinds)
      }
      continue
    }
    if (/^\|/.test(line)) {
      if (open && open.kind === 'table') {
        open.lines.push(line)
        continue
      }
      push({ kind: 'table', lines: [line] })
      continue
    }
    if (open && open.kind === 'note' && !open.quoted) {
      open.lines.push(line)
      continue
    }
    push({ kind: 'note', lines: [line] })
  }
  for (const item of items) delete item.quoted
  return items
}

/** Finds each item's first line in the vault file, onward from the previous match; null when the graph added it. */
export function locate(items, vaultLines) {
  const normalized = vaultLines.map(normalize)
  let from = 0
  for (const item of items) {
    const target = normalize(item.lines[0])
    let at = normalized.indexOf(target, from)
    if (at < 0) at = normalized.indexOf(target)
    item.line = at < 0 || target === '' ? null : at + 1
    if (at >= 0) from = at + 1
  }
  return items
}

/** Stable JSON: keys sorted at every level, so a hash depends on content only. */
export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
      .join(',')}}`
  return JSON.stringify(value)
}
const sha256 = (s) => createHash('sha256').update(s).digest('hex')

/** One SOP version from one SOP node; throws when the node lacks a part the import needs. */
export function sopFromNode(node, readVault = (file) => readFileSync(join(VAULT, file), 'utf8')) {
  const fail = (what) => {
    throw new Error(`${node.id}: ${what}`)
  }
  const service = (node.links.part_of ?? []).filter((id) => /^SVC-[A-Z]{2}-\d{2}$/.test(id))
  if (service.length !== 1) fail(`expected one SVC part_of link, found ${service.length}`)
  const sourceFile = /^vault (.+?\.md)(;|$)/.exec(node.source ?? '')?.[1] ?? fail('no "vault <file>.md" source')
  const vaultText = readVault(sourceFile)
  const vaultLines = vaultText.split('\n')
  const parts = sections(node.body)
  const take = (heading, prefix) => {
    const lines = parts.get(heading) ?? fail(`no "${heading}" section`)
    return locate(parseItems(lines, prefix), vaultLines)
  }
  const stages = STAGES.map((s) => ({
    stage: s.stage,
    key: s.key,
    heading: s.heading.slice(3),
    items: take(s.heading, String(s.stage)),
  }))
  const stopWork = take(STOP_WORK, 'stop')
  const openQuestions = take(OPEN_QUESTIONS, 'oq')
  const content = { stages, stopWork, openQuestions }
  // The hazard checks: every HOLD, GATE and FLAG control of the stages, and the stop-work section; the quality checks:
  // stage 4. Each has its own digest, so a work package pins the exact hazard and quality versions too.
  const hazards = {
    controls: stages.flatMap((s) => s.items.filter((i) => i.kind === 'control')),
    stopWork,
  }
  const quality = stages.find((s) => s.key === 'quality_checks').items
  return {
    id: node.id,
    serviceId: service[0],
    title: node.title,
    sourceFile,
    sourceSha256: sha256(vaultText),
    reviewState: 'pending_competent_review',
    spanishStatus: 'pending',
    content,
    contentSha256: sha256(stable(content)),
    hazardSha256: sha256(stable(hazards)),
    qualitySha256: sha256(stable(quality)),
  }
}

export function buildSops() {
  execFileSync(process.execPath, [join(ROOT, 'tools', 'kg.mjs'), 'index'], { stdio: 'ignore' })
  const idx = JSON.parse(readFileSync(join(ROOT, 'kg', '_index.json'), 'utf8'))
  return Object.values(idx.nodes)
    .filter((n) => n.type === 'sop' && /^SOP-[A-Z]{2}-\d{2}$/.test(n.id) && n.status !== 'superseded')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((n) => sopFromNode(n))
}

/** Pretty JSON with each checklist item on one line, so a changed step is a one-line diff. */
function pretty(value, indent = '') {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'kind' in value && 'lines' in value)
    return JSON.stringify(value)
  const next = `${indent}  `
  if (Array.isArray(value))
    return value.length ? `[\n${value.map((v) => next + pretty(v, next)).join(',\n')}\n${indent}]` : '[]'
  if (value && typeof value === 'object') {
    const keys = Object.keys(value)
    return keys.length
      ? `{\n${keys.map((k) => `${next}${JSON.stringify(k)}: ${pretty(value[k], next)}`).join(',\n')}\n${indent}}`
      : '{}'
  }
  return JSON.stringify(value)
}

export function render(sops) {
  return `${pretty({
    $comment:
      'Generated by tools/import-sops.mjs from the SOP-* nodes (TSK-0068). Do not edit: change the nodes, then rerun the tool.',
    sops,
  })}\n`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = render(buildSops())
  if (process.argv.includes('--check')) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
    if (current !== text) {
      console.error('packages/db/seed/sops.json is out of date: run node tools/import-sops.mjs')
      process.exit(1)
    }
    console.log('sops.json is up to date')
  } else {
    writeFileSync(OUT, text)
    console.log(`wrote ${OUT}`)
  }
}
