#!/usr/bin/env node
// Builds packages/db/seed/services.json from the 26 SVC-* nodes (TSK-0019; HH-SVC-01, HH-SVC-02). Generated, never
// hand-edited: change the nodes (or the staff catalogs for the Spanish labels), then run this tool.
//
// - Reads the graph through tools/kg.mjs (`index`, then kg/_index.json), never kg/ file by file.
// - Takes only what the nodes state: stable ID and code, category, slug, catalog name (the service title), canonical
//   name (kept as an alias), the request topics (guide 6.2 extra inputs and the spec intake), the linked SOP, whether
//   the home-age limits apply, and the node's source. No description, price or claim is invented here.
// - Page content and care notes (TSK-0132, OWN-DEC-180): the reviewed content of
//   packages/domain/src/service-content.ts (description, included and excluded work, preparation, FAQs, care notes,
//   related services, the withheld content and the flags list) with the review stamp. A service with reviewed content
//   is `published`: OWN-DEC-180 is its approval, so syncServices() publishes the version (HH-CUS-02). A service without
//   it keeps a null description and stays a draft. The corrections list is report data only and is not copied.
// - Staff labels: English is the catalog name; Spanish comes from packages/i18n/src/catalogs/staff.es.json
//   (`enum.service.<code>`, AI-translated per OWN-DEC-79). The tool also checks that staff.en.json carries the catalog
//   name for every code, so the registry and the catalogs never disagree.
//
// Usage: node tools/import-services.mjs [--check]   (--check exits 1 when the committed file is out of date)
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SERVICE_CONTENT, SERVICE_CONTENT_REVIEW } from '../packages/domain/src/service-content.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'packages', 'db', 'seed', 'services.json')
const CATALOGS = join(ROOT, 'packages', 'i18n', 'src', 'catalogs')

export const CATEGORIES = {
  Cleaning: 'cleaning',
  Drywall: 'drywall',
  'Home Improvement': 'home_improvement',
  Painting: 'painting',
}

const HEADER =
  /^Category: (?<category>[^.]+)\. Catalog name \(guide 6\.2\): (?<name>.+?)\. Canonical name \(spec Appendix B\): (?<canonical>.+?)\. Slug: `(?<slug>[a-z0-9-]+)`\./m

/** Splits a comma list, keeping commas inside parentheses. */
export function splitList(text) {
  const out = []
  let depth = 0
  let cur = ''
  for (const ch of text) {
    if (ch === '(') depth++
    if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.trim().replace(/\.$/, '')).filter(Boolean)
}

function bulletAfter(body, label) {
  const line = body.split('\n').find((l) => l.startsWith(`- ${label}`))
  if (!line) return undefined
  return line.slice(line.indexOf(':', label.length) + 1).trim()
}

/** The public status and versioned page content of a service: its reviewed content, or a draft with none. */
export function pageContent(id, reviewed = SERVICE_CONTENT[id]) {
  if (!reviewed) return { publicStatus: 'draft', content: { description: null } }
  const content = { ...reviewed }
  delete content.corrections
  return { publicStatus: 'published', content: { ...content, review: { ...SERVICE_CONTENT_REVIEW } } }
}

/** One registry entry from one SVC node; throws when the node lacks a field the registry needs. */
export function serviceFromNode(node, labels) {
  const fail = (what) => {
    throw new Error(`${node.id}: ${what}`)
  }
  const h = HEADER.exec(node.body)?.groups ?? fail('no "Category: ... Slug:" header line')
  const category = CATEGORIES[h.category] ?? fail(`unknown category ${h.category}`)
  const code = node.id.replace(/^SVC-/, '')
  if (h.name !== node.title) fail(`catalog name "${h.name}" differs from the node title "${node.title}"`)
  const sop = (node.links.uses ?? []).filter((id) => id.startsWith('SOP-'))
  if (sop.length !== 1) fail(`expected one SOP link, found ${sop.length}`)
  const guideInputs = bulletAfter(node.body, 'Guide 6.2 extra inputs') ?? fail('no "Guide 6.2 extra inputs" line')
  const specIntake = bulletAfter(node.body, 'Spec intake') ?? fail('no "Spec intake" line')
  const es = labels.es[`enum.service.${code}`] ?? fail(`staff.es.json has no enum.service.${code}`)
  const en = labels.en[`enum.service.${code}`]
  if (en !== h.name) fail(`staff.en.json enum.service.${code} must be the catalog name "${h.name}"`)
  return {
    id: node.id,
    code,
    category,
    slug: h.slug,
    name: h.name,
    aliases: h.canonical === h.name ? [] : [h.canonical],
    staffLabel: { en, es },
    ...pageContent(node.id),
    schedulingMode: 'standard',
    intake: { guideInputs: splitList(guideInputs), specIntake: splitList(specIntake) },
    estimateRoute: 'online_or_site_visit',
    sopId: sop[0],
    homeAgeLimits: (node.links.constrained_by ?? []).includes('FACT-SVC-HOME-AGE-LIMITS'),
    source: node.source ?? null,
  }
}

export function buildServices() {
  execFileSync(process.execPath, [join(ROOT, 'tools', 'kg.mjs'), 'index'], { stdio: 'ignore' })
  const idx = JSON.parse(readFileSync(join(ROOT, 'kg', '_index.json'), 'utf8'))
  const labels = {
    en: JSON.parse(readFileSync(join(CATALOGS, 'staff.en.json'), 'utf8')),
    es: JSON.parse(readFileSync(join(CATALOGS, 'staff.es.json'), 'utf8')),
  }
  const nodes = Object.values(idx.nodes)
    .filter((n) => n.type === 'service' && /^SVC-[A-Z]{2}-\d{2}$/.test(n.id) && n.status !== 'superseded')
    .sort((a, b) => a.id.localeCompare(b.id))
  return nodes.map((n) => serviceFromNode(n, labels))
}

export function render(services) {
  return `${JSON.stringify(
    {
      $comment:
        'Generated by tools/import-services.mjs from the SVC-* nodes (TSK-0019). Do not edit: change the nodes, then rerun the tool.',
      services,
    },
    null,
    2,
  )}\n`
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = render(buildServices())
  if (process.argv.includes('--check')) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
    if (current !== text) {
      console.error('packages/db/seed/services.json is out of date: run node tools/import-services.mjs')
      process.exit(1)
    }
    console.log('services.json is up to date')
  } else {
    writeFileSync(OUT, text)
    console.log(`wrote ${OUT}`)
  }
}
