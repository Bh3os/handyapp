// The Areas page, county URLs, the sitemap, the not-found page and the content lint in a real browser against the built
// server (TSK-0023; HH-CUS-04, HH-CUS-05, T08, T75, HH-A11Y-02, OWN-DEC-48, OWN-DEC-57). With E2E_DATABASE_URL the
// sitemap also lists the services shown on the test site (fixtures/services.mjs). Every value is synthetic.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { expectAccessible } from '../a11y.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const root = fileURLToPath(new URL('../../../', import.meta.url))

// FACT-SERVICE-AREA (OWN-DEC-37), typed out from the fact: anchor, name, the towns the fact names.
const COUNTIES: [string, string, string | null][] = [
  ['jefferson-county-ky', 'Jefferson County, Kentucky', 'Includes Louisville.'],
  ['oldham-county-ky', 'Oldham County, Kentucky', null],
  ['bullitt-county-ky', 'Bullitt County, Kentucky', null],
  ['shelby-county-ky', 'Shelby County, Kentucky', null],
  ['meade-county-ky', 'Meade County, Kentucky', null],
  ['clark-county-in', 'Clark County, Indiana', null],
  ['floyd-county-in', 'Floyd County, Indiana', null],
  ['harrison-county-in', 'Harrison County, Indiana', 'Includes Corydon.'],
  ['scott-county-in', 'Scott County, Indiana', null],
  ['washington-county-in', 'Washington County, Indiana', 'Includes Salem.'],
  ['jefferson-county-in', 'Jefferson County, Indiana', 'Includes Madison.'],
]

type Seed = { id: string; slug: string }
const registry = (
  JSON.parse(readFileSync(new URL('../../../packages/db/seed/services.json', import.meta.url), 'utf8')) as {
    services: Seed[]
  }
).services

async function axe(page: Page) {
  await expectAccessible(page)
}

const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1] ?? '').pathname)

test.describe('Areas page (TSK-0023, HH-CUS-04)', () => {
  test('[HH-CUS-04][T75] one anchored section per county with its towns, kinds of work, request action and ZIP check', async ({
    page,
  }) => {
    const res = await page.goto('/areas')
    expect(res?.status()).toBe(200)
    await expect(page).toHaveTitle('Service area | HandyHub')
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Service area')
    const main = page.getByRole('main')
    await expect(main.getByRole('heading', { level: 2, name: 'Kentucky', exact: true })).toBeVisible()
    await expect(main.getByRole('heading', { level: 2, name: 'Indiana', exact: true })).toBeVisible()
    await expect(main.getByRole('heading', { level: 2, name: 'Check your ZIP code' })).toBeVisible()
    await expect(main.locator('[data-county]')).toHaveCount(COUNTIES.length)
    for (const [anchor, name, towns] of COUNTIES) {
      const section = main.locator(`article#${anchor}`)
      await expect(section.getByRole('heading', { level: 3 })).toHaveText(name)
      if (towns) await expect(section.getByTestId('county-towns')).toHaveText(towns)
      else await expect(section.getByTestId('county-towns')).toHaveCount(0)
      await expect(section.getByRole('link')).toHaveText([
        'Home Improvement',
        'Drywall',
        'Painting',
        'Cleaning',
        'Request a Free Estimate',
        'Check your ZIP code above',
      ])
      await expect(section.getByRole('link', { name: 'Request a Free Estimate' })).toHaveAttribute('href', '/request')
      await expect(section.getByRole('link', { name: 'Check your ZIP code above' })).toHaveAttribute(
        'href',
        '#zip-check',
      )
    }
    // No street, ZIP code, landmark or review is written on the page (OWN-DEC-48; the ZIP input is empty).
    const body = await main.innerText()
    expect(body).not.toMatch(/\b\d{5}\b|street|road|avenue|review|rated|\$\s?\d|24\/7|guarantee|insured|licensed/i)
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}')
    expect(ld['@type']).toBe('LocalBusiness')
    expect(ld.name).toBe('HandyHub')
    expect(ld.areaServed.map((a: { name: string }) => a.name)).toEqual(COUNTIES.map(([, name]) => name))
    expect(JSON.stringify(ld)).not.toMatch(/address|postal|telephone|email/i)
    await axe(page)
  })

  test('[HH-CUS-04] the footer links each county to its anchor on the Areas page', async ({ page }) => {
    await page.goto('/')
    const areas = page.getByRole('contentinfo').getByRole('region', { name: 'Service area' })
    await expect(areas.getByTestId('footer-areas').getByRole('link')).toHaveText(COUNTIES.map(([, name]) => name))
    await areas.getByRole('link', { name: 'Floyd County, Indiana' }).click()
    await expect(page).toHaveURL(/\/areas#floyd-county-in$/)
    await expect(page.locator('article#floyd-county-in')).toBeInViewport()
  })

  test('[HH-A11Y-02] the Areas page works at 320 px and with 200% text', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/areas')
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(await overflow()).toBeLessThanOrEqual(0)
    await axe(page)
    await page.setViewportSize({ width: 640, height: 720 })
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })
    expect(await overflow()).toBeLessThanOrEqual(0)
  })
})

test.describe('county URLs and the sitemap (TSK-0023, T08, HH-CUS-04, HH-CUS-05)', () => {
  test('[T08][HH-CUS-04] an unverified county URL redirects to its anchor and is absent from the sitemap', async ({
    page,
    request,
  }) => {
    for (const [anchor] of COUNTIES) {
      const res = await request.get(`/areas/${anchor}`, { maxRedirects: 0 })
      expect(res.status(), anchor).toBe(301)
      expect(res.headers()['location'], anchor).toBe(`/areas#${anchor}`)
    }
    await page.goto('/areas/harrison-county-in')
    await expect(page).toHaveURL(/\/areas#harrison-county-in$/)
    await expect(page.locator('article#harrison-county-in')).toBeInViewport()

    const sitemap = await request.get('/sitemap.xml')
    expect(sitemap.status()).toBe(200)
    expect(sitemap.headers()['content-type']).toMatch(/^application\/xml/)
    const paths = locs(await sitemap.text())
    for (const [anchor] of COUNTIES) expect(paths).not.toContain(`/areas/${anchor}`)
    expect(paths.filter((p) => p.startsWith('/areas/'))).toEqual([])
    // The homepage leads; the other public pages (with the legal pages of TSK-0024) are all listed.
    expect(paths[0]).toBe('/')
    expect(paths).toEqual(expect.arrayContaining(['/areas', '/services', '/privacy', '/sms-terms', '/terms']))
  })

  test('[HH-CUS-05] the sitemap lists only existing, public, indexable pages; private routes are noindex', async ({
    request,
  }) => {
    const paths = locs(await (await request.get('/sitemap.xml')).text())
    for (const p of paths) {
      const res = await request.get(p, { maxRedirects: 0 })
      expect(res.status(), p).toBe(200)
    }
    expect(paths.some((p) => /^\/(request|staff|portal|api|access|project|account|404|500)(\/|$)/.test(p))).toBe(false)
    const services = paths.filter((p) => p.startsWith('/services/'))
    if (databaseUrl) {
      // TSK-0132: every quality-reviewed service is published (OWN-DEC-180), so the sitemap lists all 26 pages.
      const shown = registry.map((s) => `/services/${s.slug}`)
      expect(shown).toHaveLength(26)
      expect(new Set(services)).toEqual(new Set(shown))
    } else expect(services).toEqual([])
    for (const p of ['/request', '/staff/', '/portal/'])
      expect((await request.get(p)).headers()['x-robots-tag'], p).toBe('noindex, nofollow')
  })

  test('[HH-CUS-04] a county outside the service area has no page: the not-found page', async ({ page }) => {
    const res = await page.goto('/areas/lake-county-in')
    expect(res?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Page not found')
  })
})

test.describe('not-found page (TSK-0023, HH-CUS-05)', () => {
  test('[HH-CUS-05] an unknown page answers 404 with a useful page that leads back to the site', async ({ page }) => {
    const res = await page.goto('/no-such-page')
    expect(res?.status()).toBe(404)
    await expect(page).toHaveTitle('Page not found | HandyHub')
    await expect(page.getByRole('main').getByText('We could not find what you were looking for.')).toBeVisible()
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
    const links = page.getByRole('main').getByRole('list').getByRole('link')
    await expect(links).toHaveText(['HandyHub home', 'Services', 'Service area', 'Request a Free Estimate'])
    await axe(page)
    await links.filter({ hasText: 'Service area' }).click()
    await expect(page).toHaveURL(/\/areas$/)
  })
})

test.describe('content lint (TSK-0023, HH-BASE-04)', () => {
  test('[HH-BASE-04] the built site, the catalog and the source pass the content lint', () => {
    const out = execFileSync(process.execPath, ['tools/content-lint.mjs', '--dist', 'apps/site/dist'], {
      cwd: root,
      encoding: 'utf8',
    })
    expect(out).toMatch(/content lint: \d+ texts checked, 0 problems/)
  })
})
