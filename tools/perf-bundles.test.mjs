// tools/perf-bundles.mjs (TSK-0105; HH-NFR-01): page weight follows what a first visit downloads (stylesheets, scripts
// with their static imports, island components, fonts named by the CSS, images), source maps are not counted, and only
// a configured limit can fail; a null limit is NOT CONFIGURED and only reported. Synthetic build files in a temp dir.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appReport, checks, loadBundleBudgets, pageReferences, renderMarkdown, staticImports } from './perf-bundles.mjs'

function build() {
  const dir = mkdtempSync(join(tmpdir(), 'perf-bundles-'))
  mkdirSync(join(dir, '_astro'))
  const write = (p, s) => writeFileSync(join(dir, p), s)
  write(
    'index.html',
    '<html><head><link rel="stylesheet" href="/_astro/site.css"><script type="module" src="/_astro/page.js"></script>' +
      '</head><body><astro-island component-url="/_astro/Wizard.js" renderer-url="/_astro/client.js"></astro-island>' +
      '<img src="/_astro/photo.webp"></body></html>',
  )
  write('plain.html', '<html><body>No scripts</body></html>')
  write('_astro/site.css', `@font-face{src:url(/_astro/font.woff2)}${'body{color:red}'.repeat(50)}`)
  write('_astro/page.js', 'import{a}from"./shared.js";console.log(a)')
  write('_astro/Wizard.js', 'import{a}from"./shared.js";export default a')
  write('_astro/client.js', 'export default 1')
  write('_astro/shared.js', `export const a=${JSON.stringify('x'.repeat(4000))}`)
  write('_astro/unused.js', 'export const never=1')
  write('_astro/page.js.map', 'x'.repeat(100_000))
  write('_astro/font.woff2', Buffer.alloc(3000, 7))
  write('_astro/photo.webp', Buffer.alloc(2000, 9))
  return dir
}

test('[HH-NFR-01] references and static imports of a page are found', () => {
  assert.deepEqual(
    pageReferences(
      '<script src="/a.js"></script><link href="/b.css" rel="stylesheet"><x component-url="/c.js">',
    ).sort(),
    ['/a.js', '/b.css', '/c.js'],
  )
  assert.deepEqual(staticImports('import{a}from"./x.js";import"./y.js";export*from"../z.js";import("./lazy.js")'), [
    './x.js',
    './y.js',
    '../z.js',
  ])
})

test('[HH-NFR-01] a first visit counts the HTML, CSS, scripts with imports, fonts and images once; maps never', () => {
  const dir = build()
  try {
    const r = appReport(dir)
    const index = r.pages.find((p) => p.page === 'index.html')
    // index.html, site.css, page.js, Wizard.js, client.js, shared.js (once), font.woff2, photo.webp
    assert.equal(index.files, 8)
    assert.equal(index.byKind.font, 3000)
    assert.equal(index.byKind.image, 2000)
    assert.ok(index.byKind.js > 0 && index.byKind.css > 0 && index.byKind.html > 0)
    assert.equal(r.pages.at(-1).page, 'plain.html')
    assert.equal(r.sourceMaps, 1)
    // The shipped JavaScript counts every script of the build (unused.js too), but no source map.
    assert.ok(r.js.raw < 10_000)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('[HH-NFR-01] only a configured limit fails; NOT CONFIGURED limits are reported', () => {
  const dir = build()
  try {
    const reports = { site: appReport(dir) }
    const open = checks(reports, { site: { jsGzipBytes: null, largestPageGzipBytes: null } })
    assert.deepEqual(
      open.map((c) => c.state),
      ['not_configured', 'not_configured'],
    )
    const set = checks(reports, { site: { jsGzipBytes: 1, largestPageGzipBytes: 10_000_000 } })
    assert.deepEqual(
      set.map((c) => c.state),
      ['over', 'within'],
    )
    assert.match(renderMarkdown(reports, open), /NOT CONFIGURED/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('[HH-NFR-01] docs/perf/budgets.json invents no bundle limit: every one is NOT CONFIGURED until the Owner decides', () => {
  const budgets = loadBundleBudgets()
  for (const app of ['site', 'portal', 'staff'])
    for (const [key, value] of Object.entries(budgets[app])) assert.equal(value, null, `${app}.${key}`)
  const all = JSON.parse(readFileSync(new URL('../docs/perf/budgets.json', import.meta.url), 'utf8'))
  assert.equal(all.api.staff_read.p95Ms, 800)
  assert.equal(all.api.core_write.p95Ms, 1500)
})
