// The service catalog and the 26 service pages in a real browser (TSK-0021, TSK-0132; HH-CUS-01, HH-CUS-02, HH-QA-05,
// T05, T75, HH-A11Y-02, OWN-DEC-180). The registry publishes every quality-reviewed service (fixtures/services.mjs), so
// all 26 pages are shown; the 404 rule is checked by moving one service back to a draft inside its own test. Every
// value entered is synthetic.
import { readFileSync } from 'node:fs'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type Page } from '@playwright/test'

const databaseUrl = process.env['E2E_DATABASE_URL']
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const CATEGORY = {
  home_improvement: 'Home Improvement',
  drywall: 'Drywall',
  painting: 'Painting',
  cleaning: 'Cleaning',
}

type Content = {
  description: string
  included: string[]
  excluded: string[]
  preparation: string[]
  faqs: { question: string; answer: string }[]
  care: { lines: string[]; product: { text: string }[]; withheld: { topic: string }[] }
  withheldContent: { topic: string }[]
  flags: { text: string }[]
}
type Seed = { id: string; slug: string; name: string; category: keyof typeof CATEGORY; content: Content }
const registry = (
  JSON.parse(readFileSync(new URL('../../../packages/db/seed/services.json', import.meta.url), 'utf8')) as {
    services: Seed[]
  }
).services
const ordered = (Object.keys(CATEGORY) as (keyof typeof CATEGORY)[]).flatMap((c) =>
  registry.filter((s) => s.category === c),
)
const SECTIONS = [
  "What's included",
  'How we estimate',
  'Getting ready',
  'What we ask about',
  'Relevant considerations',
  "Is there anything you don't do?",
  'Questions and answers',
  'Related services',
  'At a glance',
]

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

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1 })
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

async function structuredData(page: Page): Promise<Record<string, unknown>[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents()
  return blocks.map((b) => JSON.parse(b) as Record<string, unknown>)
}

test.describe('service catalog and pages (TSK-0021, TSK-0132)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')
    expect(registry).toHaveLength(26)
    await page.goto('/request')
    await page.evaluate(() => window.localStorage.clear())
  })

  test('[HH-CUS-01][OWN-DEC-180] the catalog lists all 26 reviewed services in their four categories', async ({
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
      await expect(region.getByRole('link')).toHaveText(registry.filter((s) => s.category === code).map((s) => s.name))
    }
    const notSure = page.getByTestId('not-sure')
    await expect(notSure.getByRole('heading', { name: 'Not sure what service I need' })).toBeVisible()
    await axe(page)
  })

  test('[HH-CUS-02][HH-QA-05][T75][OWN-DEC-180] all 26 pages: navigation, reviewed content, care, FAQs and search data', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    for (const s of ordered) {
      await page.goto('/services')
      await page.getByRole('main').getByRole('link', { name: s.name, exact: true }).click()
      await expect(page, s.slug).toHaveURL(new RegExp(`/services/${s.slug}$`))
      await expect(page).toHaveTitle(`${s.name} | HandyHub`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(s.name)
      await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(CATEGORY[s.category])
      await expect(page.getByTestId('service-cta')).toHaveAttribute('href', `/request?service=${s.id}`)
      for (const heading of SECTIONS)
        await expect(page.getByRole('heading', { level: 2, name: heading, exact: true }), s.slug).toBeVisible()
      const c = s.content
      await expect(page.getByTestId('description')).toHaveText(c.description)
      await expect(page.getByTestId('included').getByRole('listitem')).toHaveText(c.included)
      await expect(page.getByTestId('excluded').getByRole('listitem')).toHaveText(c.excluded)
      await expect(page.getByTestId('preparation').getByRole('listitem')).toHaveText(c.preparation)
      const care = [...c.care.lines, ...c.care.product.map((p) => p.text)]
      if (care.length) {
        await expect(page.getByRole('heading', { level: 2, name: 'After the work' })).toBeVisible()
        await expect(page.getByTestId('care').getByRole('listitem')).toHaveText(care)
      } else await expect(page.getByTestId('care')).toHaveCount(0)
      const faqs = page.getByTestId('faqs')
      await expect(faqs.getByRole('heading', { level: 3 })).toHaveText(c.faqs.map((f) => f.question))
      await expect(page.locator('[data-not-provided]')).toHaveCount(0)
      await expect(page.getByText('Not provided yet', { exact: true })).toHaveCount(0)

      // Nothing withheld or flagged reaches the page, and no claim the review removed.
      const body = await page.locator('main').innerText()
      for (const w of [...c.care.withheld, ...c.withheldContent]) expect(body, s.slug).not.toContain(w.topic)
      for (const f of c.flags) expect(body, s.slug).not.toContain(f.text)
      expect(body, s.slug).not.toMatch(/\$\s?\d|guarantee|warrant|insured|24\/7|\bexpert|\bpremium|flawless|5-star/i)

      // Internal links: related services and the request form; the service-area link goes to the 11 counties.
      await expect(page.getByTestId('related').getByRole('link').first()).toBeVisible()
      await expect(
        page.getByTestId('glance').getByRole('link', { name: 'See the 11 counties we serve' }),
      ).toHaveAttribute('href', '/areas')

      // Local search: the description, the FAQ data (every FAQ, then the limits) and the Service data.
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        'content',
        `${s.name} from HandyHub in the Louisville metro area of Kentucky and Southern Indiana. Free estimates—online or at your property.`,
      )
      const [faq, service] = await structuredData(page)
      expect(faq?.['@type']).toBe('FAQPage')
      const entities = faq?.['mainEntity'] as { name: string; acceptedAnswer: { text: string } }[]
      expect(entities.map((e) => e.name)).toEqual([...c.faqs.map((f) => f.question), "Is there anything you don't do?"])
      expect(entities.at(-1)?.acceptedAnswer.text).toBe(
        (await page.getByTestId('limits').getByRole('listitem').allInnerTexts()).join(' '),
      )
      expect(service?.['@type']).toBe('Service')
      expect(service?.['name']).toBe(s.name)
      expect(service?.['areaServed']).toHaveLength(11)
    }
  })

  test('[HH-CUS-01][HH-CUS-02][T05] on all 26 pages the request action opens the form with that service preselected', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    for (const s of ordered) {
      await page.evaluate(() => window.localStorage.clear())
      await page.goto(`/services/${s.slug}`)
      await page.getByTestId('service-cta').click()
      await expect(page).toHaveURL(new RegExp(`/request\\?service=${s.id}$`))
      await page.getByRole('button', { name: 'Continue as Guest' }).click()
      await expect(page.getByRole('button', { name: new RegExp(`^${CATEGORY[s.category]}`) }), s.id).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      await expect(page.getByRole('checkbox', { name: s.name, exact: true }), s.id).toBeChecked()
      await expect(page.getByText('Selected services — 1 of 5')).toBeVisible()
      await expect(page.getByRole('checkbox', { name: 'Not sure what service I need' })).not.toBeChecked()
    }
  })

  test('[HH-CUS-02][OWN-DEC-84] a service moved back to a draft has no page and is not listed: 404', async ({
    page,
  }) => {
    const s = registry.find((x) => x.id === 'SVC-CL-05')
    if (!s) throw new Error('SVC-CL-05 is not in the registry')
    await withDb((db) =>
      db.updateTable('catalog.services').set({ public_status: 'draft' }).where('id', '=', s.id).execute(),
    )
    try {
      expect((await page.request.get(`/services/${s.slug}`)).status()).toBe(404)
      await page.goto('/services')
      await expect(page.getByRole('main').getByRole('link', { name: s.name, exact: true })).toHaveCount(0)
      await expect(page.getByRole('main').getByRole('link', { name: 'Deep Cleaning', exact: true })).toBeVisible()
    } finally {
      await withDb((db) =>
        db.updateTable('catalog.services').set({ public_status: 'published' }).where('id', '=', s.id).execute(),
      )
    }
    expect((await page.request.get(`/services/${s.slug}`)).status()).toBe(200)
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

  test('[HH-A11Y-02][T75] service pages: limits, no WCAG A/AA violation, 320 px and 200% text', async ({ page }) => {
    test.setTimeout(240_000)
    const painting = registry.find((s) => s.id === 'SVC-PT-01')
    if (!painting) throw new Error('SVC-PT-01 is not in the registry')
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
    // Every page passes the WCAG scan at desktop width and has no horizontal scroll at 320 px (mobile).
    for (const s of ordered) {
      await page.setViewportSize({ width: 1280, height: 900 })
      await page.goto(`/services/${s.slug}`)
      await axe(page)
      await page.setViewportSize({ width: 320, height: 720 })
      await noHorizontalScroll(page)
    }
    await page.goto(`/services/${painting.slug}`)
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
