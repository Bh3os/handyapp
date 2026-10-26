#!/usr/bin/env node
// Page weight and bundle sizes of the three builds (TSK-0105; HH-NFR-01: no large hero assets, unbounded galleries,
// unnecessary map loads or heavy third-party scripts). Reads apps/site/dist, apps/portal/dist and apps/staff/dist
// after `pnpm build` and reports, per app, the JavaScript and CSS it ships (raw and gzip) and, per page, what a first
// visit with an empty cache downloads: the HTML, its stylesheets, its scripts with every static import (Astro island
// components and their renderer included), the fonts its stylesheets name and its images. Source maps are not counted
// (browsers load them only with the developer tools open).
// The limits come from docs/perf/budgets.json (bundles): a null limit is NOT CONFIGURED and is reported, never
// enforced (OQ-PERF-BUDGET-DETAILS holds the PROPOSED values); a configured limit that is exceeded exits 1.
//
// Usage: node tools/perf-bundles.mjs [--json <file>]   (markdown on stdout; CI appends it to the step summary)
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const APPS = ['site', 'portal', 'staff']

const gz = (buf) => gzipSync(buf, { level: 9 }).length
const COMPRESSED = /\.(woff2?|png|jpe?g|webp|avif|gif)$/i

/** Every file under a directory, as paths relative to it ('/'-separated). */
export function filesOf(dir) {
  const out = []
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const full = join(d, name)
      if (statSync(full).isDirectory()) walk(full)
      else out.push(relative(dir, full).split(sep).join('/'))
    }
  }
  if (existsSync(dir)) walk(dir)
  return out.sort()
}

/** A URL of the page to a file of the build: as is, or without the app's base path (/staff/, /portal/). */
export function resolveAsset(dir, url) {
  const path = url.split(/[?#]/)[0]
  if (!path.startsWith('/') || path.startsWith('//')) return null
  const direct = join(dir, path)
  if (existsSync(direct) && statSync(direct).isFile()) return direct
  const stripped = join(dir, path.split('/').slice(2).join('/'))
  return existsSync(stripped) && statSync(stripped).isFile() ? stripped : null
}

/** What one file costs on the wire: gzip for text, as is for already compressed formats. */
function wire(file) {
  const buf = readFileSync(file)
  return { raw: buf.length, wire: COMPRESSED.test(file) ? buf.length : gz(buf) }
}

/** The URLs an HTML page loads first: stylesheets, scripts, island components and renderers, images, preloads. */
export function pageReferences(html) {
  const urls = new Set()
  const patterns = [
    /<link\b[^>]*\brel=["'](?:stylesheet|modulepreload|preload)["'][^>]*\bhref=["']([^"']+)["']/gi,
    /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\brel=["'](?:stylesheet|modulepreload|preload)["']/gi,
    /<script\b[^>]*\bsrc=["']([^"']+)["']/gi,
    /\b(?:component|renderer|before-hydration)-url=["']([^"']+)["']/gi,
    /<img\b[^>]*\bsrc=["']([^"']+)["']/gi,
  ]
  for (const re of patterns) for (const m of html.matchAll(re)) urls.add(m[1])
  return [...urls]
}

/** The static imports of an ES module (relative specifiers), resolved next to it. */
export function staticImports(code) {
  const out = new Set()
  for (const m of code.matchAll(/(?:\bimport|\bexport)\s*(?:[^'"()]*?\bfrom\s*)?["'](\.{1,2}\/[^"']+)["']/g))
    out.add(m[1])
  return [...out]
}

/** The fonts and images a stylesheet names (url(...)). */
export function cssUrls(css) {
  return [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]).filter((u) => !u.startsWith('data:'))
}

/** The files one page downloads on a first visit, with their wire sizes. */
export function pageWeight(dir, htmlFile) {
  const seen = new Map()
  const add = (file) => {
    if (!file || seen.has(file)) return
    seen.set(file, wire(file))
    const text = /\.(js|mjs|css)$/.test(file) ? readFileSync(file, 'utf8') : null
    if (file.endsWith('.js') || file.endsWith('.mjs'))
      for (const spec of staticImports(text))
        add(existsSync(join(dirname(file), spec)) ? join(dirname(file), spec) : null)
    if (file.endsWith('.css'))
      for (const u of cssUrls(text))
        add(
          u.startsWith('/') ? resolveAsset(dir, u) : existsSync(join(dirname(file), u)) ? join(dirname(file), u) : null,
        )
  }
  seen.set(htmlFile, wire(htmlFile))
  for (const url of pageReferences(readFileSync(htmlFile, 'utf8'))) add(resolveAsset(dir, url))
  let raw = 0
  let total = 0
  const byKind = { html: 0, css: 0, js: 0, font: 0, image: 0 }
  for (const [file, size] of seen) {
    raw += size.raw
    total += size.wire
    const kind = file.endsWith('.html')
      ? 'html'
      : file.endsWith('.css')
        ? 'css'
        : /\.m?js$/.test(file)
          ? 'js'
          : /\.woff2?$/.test(file)
            ? 'font'
            : 'image'
    byKind[kind] += size.wire
  }
  return {
    page: relative(dir, htmlFile).split(sep).join('/'),
    files: seen.size,
    rawBytes: raw,
    wireBytes: total,
    byKind,
  }
}

/** One app's build: the JavaScript and CSS it ships, and the weight of each page. */
export function appReport(dir) {
  const files = filesOf(dir)
  const sum = (re) =>
    files
      .filter((f) => re.test(f))
      .reduce(
        (acc, f) => {
          const buf = readFileSync(join(dir, f))
          return { raw: acc.raw + buf.length, gzip: acc.gzip + gz(buf) }
        },
        { raw: 0, gzip: 0 },
      )
  const largest = files
    .filter((f) => /\.(m?js|css)$/.test(f))
    .map((f) => ({ file: f, ...wire(join(dir, f)) }))
    .sort((a, b) => b.wire - a.wire)
    .slice(0, 3)
  const pages = files.filter((f) => f.endsWith('.html')).map((f) => pageWeight(dir, join(dir, f)))
  pages.sort((a, b) => b.wireBytes - a.wireBytes)
  return {
    js: sum(/\.m?js$/),
    css: sum(/\.css$/),
    sourceMaps: files.filter((f) => f.endsWith('.map')).length,
    largest,
    pages,
  }
}

export function loadBundleBudgets(file = join(ROOT, 'docs', 'perf', 'budgets.json')) {
  return JSON.parse(readFileSync(file, 'utf8')).bundles
}

/** Each limit with what was measured: 'within', 'over', or 'not_configured' (a null limit). */
export function checks(reports, budgets) {
  const out = []
  for (const app of Object.keys(reports)) {
    const limits = budgets[app] ?? {}
    const measured = {
      jsGzipBytes: reports[app].js.gzip,
      cssGzipBytes: reports[app].css.gzip,
      largestPageGzipBytes: reports[app].pages[0]?.wireBytes ?? 0,
    }
    for (const key of Object.keys(limits).filter((k) => !k.startsWith('$'))) {
      const limit = limits[key]
      const value = measured[key]
      out.push({
        app,
        key,
        value,
        limit,
        state: limit === null ? 'not_configured' : value <= limit ? 'within' : 'over',
      })
    }
  }
  return out
}

const kb = (n) => `${(n / 1024).toFixed(1)} KB`

export function renderMarkdown(reports, results) {
  const lines = ['## Bundle sizes and page weight (TSK-0105, lab: the build, not field data)', '']
  lines.push(
    '| App | JS raw | JS gzip | CSS raw | CSS gzip | Source maps in the build |',
    '| --- | --- | --- | --- | --- | --- |',
  )
  for (const [app, r] of Object.entries(reports))
    lines.push(
      `| ${app} | ${kb(r.js.raw)} | ${kb(r.js.gzip)} | ${kb(r.css.raw)} | ${kb(r.css.gzip)} | ${r.sourceMaps} |`,
    )
  lines.push('', '| App | Heaviest first visits (HTML + CSS + JS + fonts + images, gzip) |', '| --- | --- |')
  for (const [app, r] of Object.entries(reports))
    lines.push(
      `| ${app} | ${r.pages
        .slice(0, 3)
        .map((p) => `${p.page} ${kb(p.wireBytes)} (JS ${kb(p.byKind.js)}, fonts ${kb(p.byKind.font)})`)
        .join('; ')} |`,
    )
  lines.push('', '| Limit | Measured | Limit | State |', '| --- | --- | --- | --- |')
  for (const c of results)
    lines.push(
      `| ${c.app}.${c.key} | ${kb(c.value)} | ${c.limit === null ? 'NOT CONFIGURED' : kb(c.limit)} | ${c.state} |`,
    )
  return `${lines.join('\n')}\n`
}

function main(argv) {
  const missing = APPS.filter((a) => !existsSync(join(ROOT, 'apps', a, 'dist')))
  if (missing.length) {
    console.error(`perf-bundles: no build for ${missing.join(', ')}; run pnpm build first`)
    return 2
  }
  const reports = Object.fromEntries(APPS.map((a) => [a, appReport(join(ROOT, 'apps', a, 'dist'))]))
  const results = checks(reports, loadBundleBudgets())
  process.stdout.write(renderMarkdown(reports, results))
  const json = argv.indexOf('--json')
  if (json >= 0 && argv[json + 1])
    writeFileSync(argv[json + 1], `${JSON.stringify({ kind: 'lab', reports, checks: results }, null, 2)}\n`)
  const over = results.filter((c) => c.state === 'over')
  for (const c of over)
    console.error(`perf-bundles: ${c.app}.${c.key} is ${c.value} bytes, over its limit of ${c.limit}`)
  return over.length ? 1 : 0
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  process.exitCode = main(process.argv.slice(2))
