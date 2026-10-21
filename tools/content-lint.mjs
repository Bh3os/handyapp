#!/usr/bin/env node
// Content lint (TSK-0023; HH-BASE-04, HH-CUS-04, HH-CUS-05, OWN-DEC-11, OWN-DEC-35, OWN-DEC-54, RULE-NO-INVENTED-FACTS).
// Runs the copy lint of the claims register (apps/site/src/site/claims.ts: the blocked claim families and the
// allow-list of owner-approved wording) over every customer text, so availability, response-time, review, credential
// and price claims that are not approved wording fail CI:
// - the customer catalog (packages/i18n customer.en.json), which holds every customer sentence;
// - the service names of the registry (packages/db/seed/services.json), which the site shows as they are;
// - the public site and portal source, comments removed (comments cite rules and never reach a customer);
// - with --dist <dir>, the built pages: their visible text, text attributes and structured data.
//   node tools/content-lint.mjs [--dist apps/site/dist]      (exit 1 on any problem)
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { copyProblems } from '../apps/site/src/site/claims.ts'

export const ROOT = fileURLToPath(new URL('..', import.meta.url))

const SOURCE_DIRS = ['apps/site/src', 'apps/portal/src']
/** The register itself names the blocked words; the generated validator holds no customer text. */
const SKIPPED = [/claims\.ts$/, /\.generated\.ts$/]

function walk(dir, keep) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name)
    if (name.startsWith('.') || name === 'node_modules') return []
    return statSync(p).isDirectory() ? walk(p, keep) : keep(name) ? [p] : []
  })
}

/** Source text without its comments (the same rule as the site's copy-lint test). */
export function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|\s)\/\/.*$/gm, ' ')
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#')
      return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
    return ENTITIES[e.toLowerCase()] ?? m
  })

/** Every string value inside a JSON document (structured data), or nothing when it is not JSON. */
function jsonStrings(text) {
  const out = []
  const visit = (v) => {
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) v.forEach(visit)
    else if (v && typeof v === 'object') Object.values(v).forEach(visit)
  }
  try {
    visit(JSON.parse(text))
  } catch {
    // Not JSON: nothing to read.
  }
  return out
}

/** The customer-visible text of a built page: body text, text attributes and structured data; never code or styles. */
export function htmlText(html) {
  const texts = []
  let rest = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (_m, attrs, body) => {
    if (/type=["']?application\/ld\+json/i.test(attrs)) texts.push(...jsonStrings(body))
    return ' '
  })
  rest = rest.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
  for (const m of rest.matchAll(/\s(alt|title|aria-label|placeholder|content|data-[a-z-]+)=("([^"]*)"|'([^']*)')/gi)) {
    const value = decode(m[3] ?? m[4] ?? '').trim()
    if (value && /[a-z]{2}/i.test(value)) texts.push(value)
  }
  const body = decode(rest.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
  if (body) texts.push(body)
  return texts
}

/** The texts to check, each with where it comes from. */
export function collectTexts({ root = ROOT, dist = [] } = {}) {
  const entries = []
  const catalog = JSON.parse(readFileSync(path.join(root, 'packages/i18n/src/catalogs/customer.en.json'), 'utf8'))
  for (const [key, text] of Object.entries(catalog)) entries.push({ where: `customer.en.json ${key}`, text })
  const registry = JSON.parse(readFileSync(path.join(root, 'packages/db/seed/services.json'), 'utf8'))
  for (const s of registry.services) entries.push({ where: `services.json ${s.id} name`, text: s.name })
  for (const dir of SOURCE_DIRS)
    for (const file of walk(path.join(root, dir), (n) => /\.(astro|tsx?|html)$/.test(n))) {
      if (SKIPPED.some((r) => r.test(file))) continue
      entries.push({ where: path.relative(root, file), text: stripComments(readFileSync(file, 'utf8')) })
    }
  for (const d of dist) {
    const dir = path.resolve(root, d)
    if (!existsSync(dir)) throw new Error(`--dist ${d}: no such directory (build the site first)`)
    for (const file of walk(dir, (n) => n.endsWith('.html')))
      for (const text of htmlText(readFileSync(file, 'utf8'))) entries.push({ where: path.relative(root, file), text })
  }
  return entries
}

/** The problems in the given texts: `where`, the matched words and the rule's reason. */
export function lintTexts(entries) {
  return entries.flatMap(({ where, text }) =>
    copyProblems(text).map((p) => ({ where, match: p.match, reason: p.reason })),
  )
}

function main(argv) {
  const dist = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dist' && argv[i + 1]) dist.push(argv[++i])
    else throw new Error(`unknown argument ${argv[i]} (usage: node tools/content-lint.mjs [--dist <dir>])`)
  }
  const entries = collectTexts({ dist })
  const problems = lintTexts(entries)
  for (const p of problems) process.stderr.write(`${p.where}: "${p.match}" - ${p.reason}\n`)
  process.stdout.write(`content lint: ${entries.length} texts checked, ${problems.length} problems\n`)
  return problems.length ? 1 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = main(process.argv.slice(2))
