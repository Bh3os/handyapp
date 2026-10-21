// Search hygiene for the public site (TSK-0023; HH-CUS-04, HH-CUS-05, T08, OWN-DEC-57, OWN-DEC-73, RULE-SYNTHETIC-DATA):
// - sitemap.xml lists only pages that exist, are public and are indexable: the built site's static pages that are
//   neither marked noindex nor private, the service pages the site may show in this environment (the same rule as the
//   pages themselves, TSK-0021), and county pages with approved local content (none today);
// - a county URL without its own page answers 301 to its anchor on the Areas page, so earlier county URLs never break;
// - robots.txt: outside production, and on the staff host, it disallows everything (app.ts); in production it names
//   the sitemap and keeps crawlers off the API. Private pages stay crawlable so their noindex is seen (hosts.ts).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import {
  AREAS_PATH,
  countyAnchor,
  countyBySlug,
  countyPages,
  countyPath,
  countySlug,
  hasCountyPage,
} from '@handyhub/domain/areas'
import { fileIn, isPrivatePath } from './hosts.js'

/** A page whose own robots meta says noindex (not found, error, the request form) stays out of the sitemap. */
const NOINDEX_META = /<meta\s[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i

/** Pages served by their own rule, not by being in the build: service pages (publication) and county pages. */
const GATED = /^\/(services|areas)\//

/** The URL path of a built page file: index.html is its directory, other pages drop ".html" (trailingSlash: never). */
export function pagePath(rel: string): string {
  const p = `/${rel.split(path.sep).join('/')}`.replace(/\.html$/, '')
  if (p === '/index') return '/'
  return p.endsWith('/index') ? p.slice(0, -'/index'.length) : p
}

/** The built site's static pages that may be indexed, sorted. */
export function staticSitePages(siteDir: string): string[] {
  const pages: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name.startsWith('.')) continue
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (name.endsWith('.html')) {
        const url = pagePath(path.relative(siteDir, full))
        if (GATED.test(url) || isPrivatePath('public', url)) continue
        if (NOINDEX_META.test(readFileSync(full, 'utf8'))) continue
        pages.push(url)
      }
    }
  }
  if (existsSync(siteDir)) walk(siteDir)
  return pages.sort()
}

export type CountyRoute = { kind: 'page'; file: string } | { kind: 'redirect'; location: string } | { kind: 'none' }

/**
 * What a county URL (/areas/<slug>) answers: its page, only when the county has approved local content and the page
 * was built; otherwise a 301 to its anchor on the Areas page; a slug that names no county of the area has nothing.
 */
export function countyRoute(siteDir: string | undefined, segment: string): CountyRoute {
  const slug = segment.replace(/\.html$/, '')
  const county = countyBySlug(slug)
  if (!county) return { kind: 'none' }
  const file = siteDir && hasCountyPage(county) ? fileIn(siteDir, `${countyPath(county)}.html`) : null
  return file ? { kind: 'page', file } : { kind: 'redirect', location: countyAnchor(county) }
}

/** County pages that exist: approved local content and a built page. */
export function countyPagePaths(siteDir: string): string[] {
  return countyPages()
    .filter((c) => fileIn(siteDir, `${AREAS_PATH}/${countySlug(c)}.html`) !== null)
    .map(countyPath)
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/** A sitemap (sitemaps.org 0.9) of absolute URLs: each path once, in order. No lastmod: no truthful date is kept. */
export function sitemapXml(origin: string, paths: readonly string[]): string {
  const urls = [...new Set(paths)].map((p) => `  <url><loc>${xmlEscape(new URL(p, origin).href)}</loc></url>`)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n')
}

/** robots.txt of the production public host. */
export function productionRobots(origin: string): string {
  return `User-agent: *\nDisallow: /api/\n\nSitemap: ${new URL('/sitemap.xml', origin).href}\n`
}
