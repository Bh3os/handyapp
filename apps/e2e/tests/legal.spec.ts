// The privacy policy, SMS terms and website terms in a real browser (TSK-0024; HH-PRIV-04, HH-COM-12, HH-CUS-05,
// HH-A11Y-02, OWN-DEC-72, OWN-DEC-147, T76). The checklist below is the A2P 10DLC website list of OWN-DEC-147, typed
// out independently of the site catalog. With E2E_DATABASE_URL the support contact is read from configuration; it is
// NOT CONFIGURED (OWN-DEC-131), so it shows labelled placeholders that are never links.
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const databaseUrl = process.env['E2E_DATABASE_URL']
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const ENTITY = 'HandyHub is the brand name of ODD JOBS & MORE LLC, a Kentucky limited liability company.'
const NO_SHARING =
  'Mobile numbers and SMS opt-in data are never shared with or sold to third parties for marketing purposes.'
const PAGES = [
  { path: '/privacy', link: 'Privacy Policy', title: 'Privacy Policy', id: 'privacy-notice-1' },
  { path: '/sms-terms', link: 'SMS Terms', title: 'SMS Terms', id: 'sms-terms-1' },
  { path: '/terms', link: 'Website Terms', title: 'Website Terms', id: 'website-terms-1' },
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

test.describe('legal pages reachable from the footer and the request form (TSK-0024, HH-COM-12, HH-CUS-05)', () => {
  test('[HH-COM-12][HH-CUS-05][T76] each page opens from the footer of the homepage', async ({ page }) => {
    for (const p of PAGES) {
      await page.goto('/')
      const legal = page.getByRole('contentinfo').getByRole('navigation', { name: 'Legal' })
      await legal.getByRole('link', { name: p.link }).click()
      await expect(page).toHaveURL(new RegExp(`${p.path}$`))
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(p.title)
      await expect(page).toHaveTitle(`${p.title} | HandyHub`)
    }
  })

  test('[HH-COM-12][T76] the request form links to the privacy policy and the SMS terms', async ({ page }) => {
    test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')
    for (const p of PAGES) {
      await page.goto('/request')
      // The links sit below the form; the "How would you like to continue?" dialog comes first.
      await page.getByRole('button', { name: 'Continue as Guest' }).click()
      await expect(page.getByRole('heading', { name: 'Step 1 of 5: Services' })).toBeFocused()
      await page.getByRole('navigation', { name: 'Legal' }).getByRole('link', { name: p.link }).click()
      await expect(page).toHaveURL(new RegExp(`${p.path}$`))
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(p.title)
    }
  })

  test('[HH-COM-12][FACT-LEGAL-ENTITY][T76] the same business and brand name on the site and every legal page', async ({
    page,
  }) => {
    for (const path of ['/', '/request', '/services', ...PAGES.map((p) => p.path)]) {
      await page.goto(path)
      if (path !== '/request')
        await expect(page.getByRole('contentinfo').getByTestId('legal-entity'), path).toHaveText(ENTITY)
      const body = await page.locator('body').innerText()
      expect(body, path).not.toMatch(/Handyhub LLC/)
    }
    for (const p of PAGES) {
      await page.goto(p.path)
      await expect(page.getByRole('main').getByText(ENTITY)).toHaveCount(1)
    }
  })
})

test.describe('A2P 10DLC checklist (TSK-0024, HH-COM-12, OWN-DEC-147, T76)', () => {
  test('[HH-COM-12][T76] the privacy policy has the SMS section with the no-sharing statement', async ({ page }) => {
    await page.goto('/privacy')
    const sms = page.getByRole('region', { name: 'Text messages (SMS)' })
    await expect(sms).toBeVisible()
    await expect(sms.getByText(NO_SHARING)).toBeVisible()
    await expect(sms.getByRole('link', { name: 'Read the SMS Terms' })).toHaveAttribute('href', '/sms-terms')
  })

  test('[HH-COM-12][T76] the SMS terms list every required element', async ({ page }) => {
    await page.goto('/sms-terms')
    const main = page.getByRole('main')
    const checklist: [string, RegExp][] = [
      ['program name', /Program name: HandyHub Service Texts\./],
      ['message types', /A receipt for your request/],
      ['message types: codes', /One-time verification codes\./],
      ['message types: reminders', /Up to two reminders about an estimate you have not answered\./],
      ['message frequency', /Message frequency varies with your request and project\./],
      ['rates', /Message and data rates may apply\./],
      ['stop', /Reply STOP to opt out\./],
      ['help', /Reply HELP for help\./],
      ['start', /Reply START to receive texts again\./],
      ['opt-in', /The box is not checked in advance/],
      ['marketing separate', /Marketing texts are sent only if you also gave separate marketing permission\./],
      ['no sharing', new RegExp(NO_SHARING.replace(/[.]/g, '\\.'))],
    ]
    const text = await main.innerText()
    for (const [element, pattern] of checklist) expect(text, element).toMatch(pattern)
    await expect(page.getByRole('region', { name: 'Message frequency' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Message and data rates' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'How to stop texts' })).toBeVisible()
    const help = page.getByRole('region', { name: 'How to get help' })
    await expect(help.getByText('Support contact:')).toBeVisible()
    await expect(help.getByRole('term')).toHaveText(['Phone', 'Email'])
    await expect(main.getByRole('link', { name: 'Read the Privacy Policy' })).toHaveAttribute('href', '/privacy')
  })

  test('[HH-COM-12][HH-CUS-05] the support contact is a labelled placeholder, never a link (OWN-DEC-131)', async ({
    page,
  }) => {
    test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')
    for (const path of ['/sms-terms', '/privacy', '/terms']) {
      await page.goto(path)
      const contact = page.getByRole('main').locator('[data-legal-contact]')
      await expect(contact.getByText('Placeholder — not provided yet')).toHaveCount(2)
      await expect(contact.getByRole('link')).toHaveCount(0)
      await expect(page.locator('a[href^="tel:"], a[href^="mailto:"]')).toHaveCount(0)
    }
  })

  test('[HH-CUS-05] an unreadable contact shows the unavailable state, never invented values', async ({ page }) => {
    await page.route('**/api/v1/public/site', (route) => route.fulfill({ status: 503, body: '{}' }))
    await page.goto('/sms-terms')
    const contact = page.getByRole('main').locator('[data-legal-contact]')
    await expect(contact.getByText('This is temporarily unavailable. Please try again shortly.')).toHaveCount(2)
  })
})

test.describe('drafts marked and versioned; nothing invented (TSK-0024, HH-PRIV-04, OWN-DEC-72)', () => {
  test('[HH-PRIV-04][OWN-DEC-72] every page shows the draft banner, its version and its pending items', async ({
    page,
  }) => {
    for (const p of PAGES) {
      await page.goto(p.path)
      await expect(page.getByRole('note')).toContainText('Draft - not reviewed by an attorney')
      await expect(page.getByTestId('legal-version')).toContainText(`Document ID: ${p.id}.`)
      await expect(page.locator('[data-legal-document]')).toHaveAttribute('data-document-id', p.id)
    }
    await page.goto('/privacy')
    await expect(page.locator('[data-pending~="OQ-RETENTION-REVIEW"]')).toContainText('Pending CPA and attorney review')
    await page.goto('/terms')
    await expect(page.locator('[data-pending~="OQ-ATTORNEY-TERMS"]')).toHaveCount(3)
    await expect(page.getByRole('region', { name: 'Workmanship warranty' })).toContainText(
      'HandyHub gives a 90-day workmanship warranty, counted from the reviewed completion date.',
    )
  })

  test('[HH-PRIV-04][RULE-NO-INVENTED-FACTS] no undecided clause, address or contact value on the pages', async ({
    page,
  }) => {
    for (const p of PAGES) {
      await page.goto(p.path)
      const text = await page.getByRole('main').innerText()
      expect(text, p.path).not.toMatch(/arbitrat|indemn|governed by the laws|hold harmless|late fee|guarantee/i)
      expect(text, p.path).not.toMatch(/Telnyx|ZITADEL|licensed|insured/i)
      expect(text, p.path).not.toMatch(/\b\d{3}[-. )]\d{3}[-. ]\d{4}\b|@[a-z0-9-]+\.[a-z]{2,}/i)
    }
  })
})

test.describe('legal pages accessibility (TSK-0024, HH-A11Y-02)', () => {
  test('[HH-A11Y-02] no WCAG A/AA violation; the table of contents moves to each section', async ({ page }) => {
    for (const p of PAGES) {
      await page.goto(p.path)
      await expect(page.getByRole('banner')).toHaveCount(1)
      await expect(page.getByRole('main')).toHaveCount(1)
      await expect(page.getByRole('contentinfo')).toHaveCount(1)
      await axe(page)
    }
    await page.goto('/sms-terms')
    await page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'How to get help' }).click()
    await expect(page).toHaveURL(/#help$/)
    await expect(page.getByRole('heading', { level: 2, name: 'How to get help' })).toBeInViewport()
  })

  test('[HH-A11Y-02] no horizontal scrolling at 320 px or with 200% text', async ({ page }) => {
    for (const p of PAGES) {
      await page.setViewportSize({ width: 320, height: 720 })
      await page.goto(p.path)
      await noHorizontalScroll(page)
      await axe(page)
      await page.setViewportSize({ width: 640, height: 720 })
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%'
      })
      await noHorizontalScroll(page)
    }
  })
})
