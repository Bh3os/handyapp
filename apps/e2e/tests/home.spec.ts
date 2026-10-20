// The public site shell and homepage in a real browser (TSK-0020; HH-CUS-05, HH-CUS-06, HH-CUS-07, HH-A11Y-02, T75).
// The wording fixture is the owner's text typed out from OWN-DEC-86, independently of the site catalog. With
// E2E_DATABASE_URL the footer reads the configured payment methods and contact; without it those checks skip.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const databaseUrl = process.env['E2E_DATABASE_URL']
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const wording = JSON.parse(readFileSync(new URL('../fixtures/home-wording.json', import.meta.url), 'utf8')) as {
  title: string
  trustFacts: string[]
  whyHeading: string
  whySubtitle: string
  whyItems: string[]
  paymentMethods: string[]
}
const siteDist = fileURLToPath(new URL('../../site/dist', import.meta.url))

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

function builtFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? builtFiles(p) : /\.(html|js|css|json|txt|xml)$/.test(name) ? [p] : []
  })
}

test.describe('homepage wording (TSK-0020, HH-CUS-06)', () => {
  test('[HH-CUS-06][T75] the hero and Why HandyHub match the approved wording exactly', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(wording.title)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(wording.title)
    await expect(page.getByTestId('trust-facts').getByRole('listitem')).toHaveText(wording.trustFacts)
    await expect(page.getByRole('heading', { level: 2, name: wording.whyHeading })).toBeVisible()
    await expect(page.getByRole('heading', { level: 3 })).toHaveText(wording.whySubtitle)
    await expect(page.getByTestId('why-items').getByRole('listitem')).toHaveText(wording.whyItems)
    for (const label of wording.whyItems.map((i) => i.slice(0, i.indexOf(':') + 1)))
      await expect(page.getByTestId('why-items').locator('strong', { hasText: label })).toBeVisible()
  })

  test('[HH-CUS-06][HH-INT-01] the request actions use the approved wording and open the request page', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByRole('banner').getByRole('link', { name: 'Request an Estimate' })).toHaveAttribute(
      'href',
      '/request',
    )
    await page.getByRole('main').getByRole('link', { name: 'Request a Free Estimate' }).click()
    await expect(page).toHaveURL(/\/request$/)
  })

  test('[HH-CUS-07][HH-BASE-04] no surcharge or invented claim anywhere in the build or on the page', async ({
    page,
  }) => {
    const files = builtFiles(siteDist)
    expect(files.some((f) => f.endsWith('index.html'))).toBe(true)
    for (const file of files) expect(readFileSync(file, 'utf8'), file).not.toMatch(/surcharge|convenience fee/i)
    await page.goto('/')
    const text = await page.locator('body').innerText()
    expect(text).not.toMatch(/surcharge|convenience fee|24\/7|guarantee|licensed|insured|\$\s?\d/i)
  })
})

test.describe('site shell accessibility (TSK-0020, HH-A11Y-02, HH-CUS-05)', () => {
  test('[HH-A11Y-02] landmarks, skip link and keyboard order; no WCAG A/AA violation', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('banner')).toHaveCount(1)
    await expect(page.getByRole('main')).toHaveCount(1)
    await expect(page.getByRole('contentinfo')).toHaveCount(1)
    await page.keyboard.press('Tab')
    const skip = page.getByRole('link', { name: 'Skip to main content' })
    await expect(skip).toBeFocused()
    await expect(skip).toBeInViewport()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('main')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Request a Free Estimate' })).toBeFocused()
    await axe(page)
  })

  test('[HH-A11Y-02] no horizontal scrolling at 320 px or with 200% text', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await page.goto('/')
    await noHorizontalScroll(page)
    await axe(page)
    await page.setViewportSize({ width: 640, height: 720 })
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%'
    })
    await noHorizontalScroll(page)
  })
})

test.describe('footer facts from configuration (TSK-0020, HH-CUS-05, HH-CUS-07)', () => {
  test.beforeEach(() => {
    test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')
  })

  test('[HH-CUS-07][HH-SEC-02] the configured payment methods are listed, cards named as taken with Square', async ({
    page,
  }) => {
    // The footer script runs under the strict CSP of TSK-0017 (inline code by hash only).
    const violations: string[] = []
    page.on('console', (m) => {
      if (/Content Security Policy/i.test(m.text())) violations.push(m.text())
    })
    const res = await page.goto('/')
    expect(res?.headers()['content-security-policy']).toContain("script-src 'self'")
    const footer = page.getByRole('contentinfo')
    const methods = footer.getByRole('region', { name: 'Payment methods' }).getByRole('listitem')
    await expect(methods).toHaveText(wording.paymentMethods)
    await expect(footer.getByRole('status')).toBeHidden()
    expect(violations).toEqual([])
    await axe(page)
  })

  test('[HH-CUS-05] the unset public phone and email are labelled placeholders and never links', async ({ page }) => {
    await page.goto('/')
    const contact = page.getByRole('contentinfo').getByRole('region', { name: 'Contact' })
    await expect(contact.getByText('Placeholder — not provided yet')).toHaveCount(2)
    await expect(contact.getByRole('link')).toHaveCount(0)
    await expect(page.locator('a[href^="tel:"], a[href^="mailto:"]')).toHaveCount(0)
    await page.setViewportSize({ width: 320, height: 720 })
    await noHorizontalScroll(page)
    await axe(page)
  })
})

test.describe('footer without the facts (TSK-0020, HH-CUS-05)', () => {
  test('[HH-CUS-05] an unreadable facts response shows the unavailable state, never invented values', async ({
    page,
  }) => {
    await page.route('**/api/v1/public/site', (route) => route.fulfill({ status: 503, body: '{}' }))
    await page.goto('/')
    const footer = page.getByRole('contentinfo')
    await expect(footer.getByText('This is temporarily unavailable. Please try again shortly.')).toHaveCount(3)
    await expect(footer.getByRole('region', { name: 'Payment methods' }).getByRole('listitem')).toHaveCount(0)
  })
})
