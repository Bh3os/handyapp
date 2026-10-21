// The service catalog and service pages in a real browser (TSK-0021; HH-CUS-01, HH-CUS-02, T05, T75, HH-A11Y-02).
// The e2e database shows a fixed set of services on the test site (fixtures/services.mjs); every other registry
// service is a draft and has no page. Every value entered is synthetic.
import { readFileSync } from 'node:fs'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const databaseUrl = process.env['E2E_DATABASE_URL']
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const CATEGORY = {
  home_improvement: 'Home Improvement',
  drywall: 'Drywall',
  painting: 'Painting',
  cleaning: 'Cleaning',
}

type Seed = { id: string; slug: string; name: string; category: keyof typeof CATEGORY }
const registry = (
  JSON.parse(readFileSync(new URL('../../../packages/db/seed/services.json', import.meta.url), 'utf8')) as {
    services: Seed[]
  }
).services
// The services fixtures/services.mjs shows on the test site (read from its source: importing it would run it).
const fixture = readFileSync(new URL('../fixtures/services.mjs', import.meta.url), 'utf8')
const staged = new Set(
  [...(/E2E_STAGED_SERVICES = \[([^\]]*)\]/.exec(fixture)?.[1] ?? '').matchAll(/'(SVC-[A-Z]{2}-\d{2})'/g)].map(
    (m) => m[1],
  ),
)
const published = registry.filter((s) => staged.has(s.id))
const drafts = registry.filter((s) => !staged.has(s.id))

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)
}

test.describe('service catalog and pages (TSK-0021)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')
    expect(published.length).toBeGreaterThan(0)
    expect(drafts.length).toBeGreaterThan(0)
    await page.goto('/request')
    await page.evaluate(() => window.localStorage.clear())
  })

  test('[HH-CUS-01] the catalog lists the published services in their four categories, never a draft', async ({
    page,
  }) => {
    await page.goto('/')
    await page.getByRole('banner').getByRole('link', { name: 'Services' }).click()
    await expect(page).toHaveURL(/\/services$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Services' })).toBeVisible()
    const main = page.getByRole('main')
    for (const [code, label] of Object.entries(CATEGORY)) {
      const region = main.getByRole('region', { name: label, exact: true })
      await expect(region).toBeVisible()
      const expected = published.filter((s) => s.category === code).map((s) => s.name)
      if (expected.length) await expect(region.getByRole('link')).toHaveText(expected)
      else await expect(region.getByText('No services are listed in this category yet.')).toBeVisible()
    }
    for (const s of drafts) await expect(main.getByRole('link', { name: s.name, exact: true })).toHaveCount(0)
    const notSure = page.getByTestId('not-sure')
    await expect(notSure.getByRole('heading', { name: 'Not sure what service I need' })).toBeVisible()
    await axe(page)
  })

  test('[HH-CUS-01][HH-CUS-02][T05] each published service has a page whose request action preselects it', async ({
    page,
  }) => {
    for (const s of published) {
      const res = await page.goto(`/services/${s.slug}`)
      expect(res?.status(), s.slug).toBe(200)
      await expect(page).toHaveTitle(`${s.name} | HandyHub`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(s.name)
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(CATEGORY[s.category])
      await expect(page.getByTestId('service-cta')).toHaveAttribute('href', `/request?service=${s.id}`)
      for (const heading of [
        "What's included",
        'How we estimate',
        'Getting ready',
        'What we ask about',
        'Relevant considerations',
        "Is there anything you don't do?",
        'Questions and answers',
        'Related services',
        'At a glance',
      ])
        await expect(page.getByRole('heading', { level: 2, name: heading, exact: true })).toBeVisible()
      // No approved description, preparation or FAQs exist yet: each shows the visible state, never filler.
      await expect(page.locator('[data-not-provided]')).toHaveCount(3)
      await expect(page.getByText('Not provided yet', { exact: true })).toHaveCount(3)
      const related = page.getByTestId('related').getByRole('link')
      for (const r of drafts.filter((d) => d.category === s.category))
        await expect(related.filter({ hasText: r.name })).toBeHidden()
      const body = await page.locator('main').innerText()
      expect(body, s.slug).not.toMatch(/\$\s?\d|guarantee|warrant|insured|24\/7|\bexpert|\bpremium/i)
      const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? '{}')
      expect(ld['@type']).toBe('FAQPage')
      expect(ld.mainEntity[0].name).toBe("Is there anything you don't do?")
      expect(ld.mainEntity[0].acceptedAnswer.text).toBe(
        (await page.getByTestId('limits').getByRole('listitem').allInnerTexts()).join(' '),
      )
    }

    // The request action opens the entry choice, then the form with the service's category open and it selected.
    const first = published.find((s) => s.id === 'SVC-DW-01')
    if (!first) throw new Error('SVC-DW-01 is not shown on the test site (fixtures/services.mjs)')
    await page.goto(`/services/${first.slug}`)
    await page.getByTestId('service-cta').click()
    await expect(page).toHaveURL(new RegExp(`/request\\?service=${first.id}$`))
    await page.getByRole('button', { name: 'Continue as Guest' }).click()
    await expect(page.getByRole('button', { name: new RegExp(`^${CATEGORY[first.category]}`) })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByRole('checkbox', { name: first.name })).toBeChecked()
    await expect(page.getByText('Selected services — 1 of 5')).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Not sure what service I need' })).not.toBeChecked()
  })

  test('[HH-CUS-02][OWN-DEC-84] an unpublished service has no page: 404', async ({ page }) => {
    for (const s of drafts) {
      const res = await page.request.get(`/services/${s.slug}`)
      expect(res.status(), s.slug).toBe(404)
    }
    expect((await page.request.get('/services/not-a-service')).status()).toBe(404)
  })

  test('[HH-CUS-01][T05] Not sure what service I need opens the form with that option chosen and no service', async ({
    page,
  }) => {
    await page.goto('/services')
    await page.getByTestId('not-sure').getByRole('link', { name: 'Describe your project' }).click()
    await expect(page).toHaveURL(/\/request\?service=not-sure$/)
    await page.getByRole('button', { name: 'Continue as Guest' }).click()
    await expect(page.getByRole('checkbox', { name: 'Not sure what service I need' })).toBeChecked()
    await expect(page.getByText('Selected services — 0 of 5')).toBeVisible()
  })

  test('[HH-A11Y-02][T75] a service page: limits, no WCAG A/AA violation, 320 px and 200% text', async ({ page }) => {
    const painting = published.find((s) => s.id === 'SVC-PT-01')
    if (!painting) throw new Error('SVC-PT-01 is not shown on the test site (fixtures/services.mjs)')
    await page.goto(`/services/${painting.slug}`)
    const limits = page.getByTestId('limits').getByRole('listitem')
    await expect(limits).toContainText([
      "We don't take on paint-disturbing work in homes built before 1978.",
      "We don't do licensed trade work (gas, line-voltage electrical, plumbing or HVAC), structural work, or asbestos, lead or mold work.",
      'If asbestos, lead or mold is suspected, the affected work stops. We do no sampling or testing.',
      'We use ladders only and do no roof-edge work.',
    ])
    await expect(page.getByTestId('glance')).toContainText('Visits every day, 8 AM–10 PM, by appointment.')
    await expect(page.getByTestId('glance')).toContainText('Every project individually priced to match its scope.')
    await axe(page)
    await page.setViewportSize({ width: 320, height: 720 })
    await noHorizontalScroll(page)
    await axe(page)
    await page.setViewportSize({ width: 640, height: 720 })
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })
    await noHorizontalScroll(page)
    await page.goto('/services')
    await page.setViewportSize({ width: 320, height: 720 })
    await noHorizontalScroll(page)
  })

  test('[HH-CUS-01] an unreadable service list shows the unavailable state and lists nothing', async ({ page }) => {
    await page.route('**/api/v1/public/services', (route) => route.fulfill({ status: 503, body: '{}' }))
    await page.goto('/services')
    await expect(
      page.getByRole('main').getByText('This is temporarily unavailable. Please try again shortly.'),
    ).toBeVisible()
    await expect(page.getByRole('main').locator('[data-service-id]:visible')).toHaveCount(0)
  })
})
