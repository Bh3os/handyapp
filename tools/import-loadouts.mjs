#!/usr/bin/env node
// Builds packages/db/seed/loadouts.json from the 26 FACT-INVENTORY-* nodes (TSK-0071; HH-PKT-05, HH-PKT-06,
// ENT-WorkPackage, RULE-NO-INVENTED-FACTS, RULE-SAFETY-GATES). Generated, never hand-edited: change the nodes, then run
// this tool.
//
// - Reads the graph through tools/kg.mjs (`index`, then kg/_index.json), never kg/ file by file.
// - Imports each node's "## Inventory checklist as written" section, the vault inventory file's own list, verbatim:
//   every non-blank line is kept unchanged, in order, inside exactly one part; nothing is written, reworded, completed
//   or reordered by this tool. Parts are:
//     group     a "#### " heading of the file, as written (the file's own groups: tools, chemicals, PPE ...);
//     item      a checklist line ("- [ ] "), with its indented sub-lines (the colour-coded cloths' sub-items, say);
//     note      a quoted line (the FLAG review notes added in the vault on 2026-10-03) or any other paragraph, kept
//               with the group it stands in;
//     proposed  the "Proposed additions in the vault file" paragraph: pending owner and safety review and approved for
//               nothing, so it is shown as such and never becomes a loadout item.
//   The other sections of the node (service-card defaults, the SOP's PPE, tools and materials sections) are review
//   material and are not imported.
// - Quantities are never invented: an item carries only the file's words; a count or size the file states stays in
//   the item's text, and no quantity field is filled in.
// - Source file and line: the node's `source:` names the vault file; each part's first line is found in that file
//   (sources/vault/, frozen), onward from the previous part. A line the graph added keeps `line: null`.
// - PROPOSED (OQ-LOADOUT-DETAILS): every item is `required`, since the files do not say which are only nice to have
//   (unknown is not safe, as for the SOP steps); and an item's category (shop and vehicle tools, consumable materials,
//   PPE, rental equipment, customer-supplied products, HH-PKT-05) is `not_classified`: the files group by their own
//   headings, which the loadout shows as written instead of guessing a category.
//
// Usage: node tools/import-loadouts.mjs [--check]   (--check exits 1 when the committed file is out of date)
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { locate, normalize, stable } from './import-sops.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'packages', 'db', 'seed', 'loadouts.json')
const VAULT = join(ROOT, 'sources', 'vault')

export const SECTION = '## Inventory checklist as written'
const PROPOSED = 'Proposed additions in the vault file'
const sha256 = (s) => createHash('sha256').update(s).digest('hex')

/** The lines of the node's "## Inventory checklist as written (...)" section. */
export function sectionLines(body) {
  const lines = body.split('\n')
  const start = lines.findIndex((l) => l.startsWith(SECTION))
  if (start < 0) return null
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '))
  return lines.slice(start + 1, end < 0 ? undefined : end)
}

/** The bold name an item line opens with ("- [ ] **Name:** text"), or null when it has none. */
export function itemName(line) {
  const m = /^- \[ \] \*\*(.+?)\*\*/.exec(line)
  return m ? m[1].replace(/:\s*$/, '').trim() : null
}

/**
 * The groups, items and notes of one section, every non-blank line kept verbatim. Items are numbered in file order
 * across the whole section (`key` "1", "2" ...), so a key names one item of one loadout version.
 */
export function parseLoadout(lines) {
  const groups = []
  let proposed = null
  let group = null
  let open = null // the part that following lines continue
  const ensureGroup = () => {
    if (!group) {
      group = { heading: null, lines: [], items: [], notes: [] }
      groups.push(group)
    }
    return group
  }
  const order = [] // every part in the order its first line appears
  let n = 0
  for (const line of lines) {
    if (line.trim() === '' || /^>\s*$/.test(line)) {
      open = null
      continue
    }
    if (line.startsWith('#### ')) {
      group = { heading: line.slice(5), lines: [line], items: [], notes: [] }
      groups.push(group)
      order.push(group)
      open = null
      continue
    }
    if (/^>/.test(line)) {
      if (open && open.quoted) {
        open.lines.push(line)
        continue
      }
      open = { lines: [line], quoted: true }
      ensureGroup().notes.push(open)
      order.push(open)
      continue
    }
    if (/^- \[ \] /.test(line)) {
      open = {
        key: String(++n),
        name: itemName(line),
        lines: [line],
        criticality: 'required',
        category: 'not_classified',
      }
      ensureGroup().items.push(open)
      order.push(open)
      continue
    }
    if (/^\s+\S/.test(line) && open && open.key) {
      open.lines.push(line)
      continue
    }
    if (line.startsWith(PROPOSED)) {
      if (proposed) throw new Error('two "Proposed additions" paragraphs')
      proposed = { lines: [line] }
      open = proposed
      order.push(proposed)
      continue
    }
    if (open && !open.key && !open.quoted) {
      open.lines.push(line)
      continue
    }
    open = { lines: [line] }
    ensureGroup().notes.push(open)
    order.push(open)
  }
  for (const g of groups) for (const note of g.notes) delete note.quoted
  return { groups, proposed, order }
}

/** One loadout version from one FACT-INVENTORY node; throws when the node lacks a part the import needs. */
export function loadoutFromNode(node, readVault = (file) => readFileSync(join(VAULT, file), 'utf8')) {
  const fail = (what) => {
    throw new Error(`${node.id}: ${what}`)
  }
  const service = (node.links.part_of ?? []).filter((id) => /^SVC-[A-Z]{2}-\d{2}$/.test(id))
  if (service.length !== 1) fail(`expected one SVC part_of link, found ${service.length}`)
  if (node.id.slice('FACT-INVENTORY-'.length) !== service[0].slice(4)) fail('the node and its service differ')
  const sourceFile = /^vault (.+?\.md)(;|$)/.exec(node.source ?? '')?.[1] ?? fail('no "vault <file>.md" source')
  const vaultText = readVault(sourceFile)
  const lines = sectionLines(node.body) ?? fail(`no "${SECTION}" section`)
  const content = parseLoadout(lines)
  if (!content.groups.some((g) => g.items.length > 0)) fail('no checklist item')
  // Each part's first line in the vault file, in section order (the order the parser met them).
  const vaultLines = vaultText.split('\n')
  locate(
    content.order.filter((p) => !('items' in p)),
    vaultLines,
  )
  // The vault file heads its groups with "## ", the node with "#### ": a heading is found by its text.
  const headings = vaultLines.map((l) => (/^#+\s/.test(l) ? normalize(l.replace(/^#+\s+/, '')) : null))
  let from = 0
  for (const g of content.groups) {
    const at = g.heading === null ? -1 : headings.indexOf(normalize(g.heading), from)
    g.line = at < 0 ? null : at + 1
    if (at >= 0) from = at + 1
    delete g.lines
  }
  delete content.order
  return {
    id: node.id,
    serviceId: service[0],
    title: node.title,
    sourceFile,
    sourceSha256: sha256(vaultText),
    content,
    contentSha256: sha256(stable(content)),
  }
}

export function buildLoadouts() {
  execFileSync(process.execPath, [join(ROOT, 'tools', 'kg.mjs'), 'index'], { stdio: 'ignore' })
  const idx = JSON.parse(readFileSync(join(ROOT, 'kg', '_index.json'), 'utf8'))
  return Object.values(idx.nodes)
    .filter((n) => n.type === 'fact' && /^FACT-INVENTORY-[A-Z]{2}-\d{2}$/.test(n.id) && n.status !== 'superseded')
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((n) => loadoutFromNode(n))
}

/** Pretty JSON with each item and note on one line, so a changed item is a one-line diff. */
function pretty(value, indent = '') {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'lines' in value && !('items' in value))
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

export function render(loadouts) {
  return `${pretty({
    $comment:
      'Generated by tools/import-loadouts.mjs from the FACT-INVENTORY-* nodes (TSK-0071). Do not edit: change the nodes, then rerun the tool.',
    loadouts,
  })}\n`
}

export { normalize }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = render(buildLoadouts())
  if (process.argv.includes('--check')) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
    if (current !== text) {
      console.error('packages/db/seed/loadouts.json is out of date: run node tools/import-loadouts.mjs')
      process.exit(1)
    }
    console.log('loadouts.json is up to date')
  } else {
    writeFileSync(OUT, text)
    console.log(`wrote ${OUT}`)
  }
}
