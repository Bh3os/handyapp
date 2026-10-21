// Sitemap and county URL helpers (TSK-0023; HH-CUS-04, HH-CUS-05, T08, OWN-DEC-57). Synthetic pages only.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  countyPagePaths,
  countyRoute,
  pagePath,
  productionRobots,
  sitemapXml,
  staticSitePages,
} from '../../src/search.js'

const dir = mkdtempSync(join(tmpdir(), 'search-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const NOINDEX = '<meta charset="utf-8" /><meta name="robots" content="noindex, nofollow" />'
for (const [rel, head] of [
  ['index.html', ''],
  ['areas.html', ''],
  ['help/index.html', ''],
  ['404.html', NOINDEX],
  ['request.html', ''],
  ['portal.html', ''],
  ['services/synthetic.html', ''],
  ['areas/meade-county-ky.html', ''],
] as const) {
  mkdirSync(join(dir, rel, '..'), { recursive: true })
  writeFileSync(join(dir, rel), `<!doctype html><html><head>${head}</head><body>x</body></html>`)
}

describe('sitemap helpers (TSK-0023, HH-CUS-05)', () => {
  it('[HH-CUS-05] page paths follow the build: index is its directory, ".html" is dropped', () => {
    expect(pagePath('index.html')).toBe('/')
    expect(pagePath('services.html')).toBe('/services')
    expect(pagePath(join('help', 'index.html'))).toBe('/help')
    expect(pagePath(join('services', 'x.html'))).toBe('/services/x')
  })

  it('[HH-CUS-05][T08] static pages exclude noindex pages, private routes and the gated service and county pages', () => {
    expect(staticSitePages(dir)).toEqual(['/', '/areas', '/help'])
    expect(staticSitePages(join(dir, 'missing'))).toEqual([])
  })

  it('[HH-CUS-05] the sitemap holds absolute, escaped URLs, each once', () => {
    const xml = sitemapXml('https://www.example.test', ['/', '/a?b=1&c=2', '/'])
    expect(xml).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '  <url><loc>https://www.example.test/</loc></url>',
        '  <url><loc>https://www.example.test/a?b=1&amp;c=2</loc></url>',
        '</urlset>',
        '',
      ].join('\n'),
    )
    expect(productionRobots('https://www.example.test')).toContain('Sitemap: https://www.example.test/sitemap.xml\n')
  })
})

describe('county URLs (TSK-0023, HH-CUS-04, OWN-DEC-57)', () => {
  it('[T08][HH-CUS-04] without approved local content a county redirects, even when a page was built', () => {
    expect(countyRoute(dir, 'meade-county-ky')).toEqual({ kind: 'redirect', location: '/areas#meade-county-ky' })
    expect(countyRoute(dir, 'meade-county-ky.html')).toEqual({ kind: 'redirect', location: '/areas#meade-county-ky' })
    expect(countyRoute(undefined, 'scott-county-in')).toEqual({ kind: 'redirect', location: '/areas#scott-county-in' })
    expect(countyRoute(dir, 'lake-county-in')).toEqual({ kind: 'none' })
    expect(countyPagePaths(dir)).toEqual([])
  })
})
