// The request wizard shell in a real browser (TSK-0026; HH-INT-01, HH-INT-08, HH-INT-09, T01, T10, T69; TSK-0024,
// HH-PRIV-04: the saved privacy policy version). The server runs with the migrated E2E_DATABASE_URL database (the
// draft period comes from its configuration and requests are saved there); every visitor and value is synthetic.
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type Page } from '@playwright/test'

const databaseUrl = process.env['E2E_DATABASE_URL']
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function startAsGuest(page: Page) {
  await page.goto('/request')
  await expect(page.getByRole('dialog', { name: 'How would you like to continue?' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue as Guest' }).click()
  await expect(page.getByRole('heading', { name: 'Step 1 of 5: Services' })).toBeFocused()
}

async function fillToReview(page: Page, phone = '(502) 555-0123') {
  await page.getByLabel('Not sure what service I need').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Project description').fill('Synthetic project: a small hole in a hallway wall.')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Street address').fill('100 Synthetic Way')
  await page.getByLabel('City').fill('Testville')
  await page.getByLabel('State').fill('KY')
  await page.getByLabel('ZIP').fill('40000')
  await page.getByLabel('House', { exact: true }).check()
  await page.getByLabel('Preferred date').fill(future)
  await page.getByLabel('Mornings').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Full name').fill('Test Customer')
  await page.getByRole('textbox', { name: /^Email/ }).fill('wizard-customer@example.test')
  await page.getByRole('textbox', { name: /^Phone/ }).fill(phone)
  await page.getByLabel('Phone call', { exact: true }).check()
  await page.getByLabel('Let HandyHub decide').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { name: 'Step 5 of 5: Review and send' })).toBeVisible()
}

// This spec's own synthetic client address (RFC 5737): the request-form limit counts per network, and every spec
// reaches the server from 127.0.0.1 (playwright.config.ts trusts one hop on that server).
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.15' } })

test.describe('request wizard shell (TSK-0026)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')
    await page.goto('/request')
    await page.evaluate(() => window.localStorage.clear())
  })

  test('[HH-INT-01][T69] the continue choice is an accessible dialog with Guest first; dismissing returns to browsing', async ({
    page,
  }) => {
    await page.goto('/request')
    const dialog = page.getByRole('dialog', { name: 'How would you like to continue?' })
    await expect(dialog).toBeVisible()
    await expect(
      dialog.getByText('Request an estimate without creating an account. Manage your project through a secure link.'),
    ).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Create an Account' })).toBeDisabled()
    await axe(page)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('link', { name: 'Return Home' })).toHaveAttribute('href', '/')
    await page.getByRole('button', { name: 'Choose how to continue' }).click()
    await expect(dialog).toBeVisible()
    await page.getByRole('button', { name: 'Continue as Guest' }).click()
    await expect(page.getByRole('heading', { name: 'Step 1 of 5: Services' })).toBeFocused()
    await expect(page.getByText(/saved in this browser for 7 days/)).toBeVisible()
    await axe(page)
  })

  test('[HH-INT-08] a reload offers Resume, which restores the step and every value; Clear Draft empties it', async ({
    page,
  }) => {
    await startAsGuest(page)
    await page.getByLabel('Not sure what service I need').check()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Project description').fill('Synthetic draft text that must survive a reload.')
    await page.reload()
    await expect(page.getByText('You have an unfinished request saved in this browser.')).toBeVisible()
    await axe(page)
    await page.getByRole('button', { name: 'Resume' }).click()
    await expect(page.getByRole('heading', { name: 'Step 2 of 5: About the job' })).toBeVisible()
    await expect(page.getByLabel('Project description')).toHaveValue('Synthetic draft text that must survive a reload.')
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByLabel('Not sure what service I need')).toBeChecked()

    await page.reload()
    await page.getByRole('button', { name: 'Clear Draft' }).click()
    await expect(page.getByText('Your saved draft was cleared.')).toBeVisible()
    expect(
      await page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith('hh.request-draft'))),
    ).toEqual([])
    await page.getByRole('button', { name: 'Continue as Guest' }).click()
    await expect(page.getByLabel('Not sure what service I need')).not.toBeChecked()
    await page.reload()
    await expect(page.getByRole('dialog', { name: 'How would you like to continue?' })).toBeVisible()
  })

  test('[HH-INT-09][T10] missing fields show an error summary that takes focus and errors beside each field; nothing typed is lost', async ({
    page,
  }) => {
    await startAsGuest(page)
    await page.getByLabel('Not sure what service I need').check()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Project description').fill('Synthetic description.')
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('City').fill('Testville')
    await page.getByLabel('ZIP').fill('4000')
    await page.getByRole('button', { name: 'Next' }).click()
    const summary = page.getByRole('alert').filter({ hasText: 'Check these fields' })
    await expect(summary).toBeFocused()
    await expect(summary.getByRole('link', { name: /Street address: This field is required\./ })).toBeVisible()
    await expect(summary.getByRole('link', { name: /ZIP: This value is not in the expected format\./ })).toBeVisible()
    await expect(page.getByLabel('ZIP')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByLabel('City')).toHaveValue('Testville')
    await expect(page.getByLabel('ZIP')).toHaveValue('4000')
    await summary.getByRole('link', { name: /Street address/ }).click()
    await expect(page.getByLabel('Street address')).toBeFocused()
    await axe(page)
  })

  test('[HH-INT-09][T10] a field the server rejects is shown beside that field and every input is kept', async ({
    page,
  }) => {
    await startAsGuest(page)
    await fillToReview(page)
    await page.route('**/api/v1/public/requests', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Some of the information is missing or not valid. Check the highlighted fields.',
            fieldErrors: [
              { field: 'body.contact.email', code: 'format', message: 'This value is not in the expected format.' },
            ],
            requestId: 'req-e2e-synthetic',
            retryable: false,
          },
        }),
      }),
    )
    await page.getByRole('button', { name: 'Send Estimate Request' }).click()
    await expect(page.getByRole('heading', { name: 'Step 4 of 5: Contact' })).toBeVisible()
    await expect(page.getByRole('alert').filter({ hasText: 'Check these fields' })).toBeFocused()
    await expect(page.getByRole('textbox', { name: /^Email/ })).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('textbox', { name: /^Email/ })).toHaveValue('wizard-customer@example.test')
    await expect(page.getByLabel('Full name')).toHaveValue('Test Customer')
    await page.unroute('**/api/v1/public/requests')
  })

  test('[T01][HH-INT-10] a complete guest request is saved by the API and shows the receipt only after; the draft is cleared', async ({
    page,
  }) => {
    await startAsGuest(page)
    await fillToReview(page)
    await expect(page.getByText('Synthetic project: a small hole in a hallway wall.')).toBeVisible()
    await axe(page)
    await page.getByRole('button', { name: 'Send Estimate Request' }).click()
    await expect(page.getByRole('heading', { name: 'Your request is in.' })).toBeFocused()
    await expect(page.getByText(/^Request reference: HH-[0-9A-HJKMNP-TV-Z]{8}$/)).toBeVisible()
    await expect(
      page.getByText('Your request is received. Pricing and your appointment will be confirmed separately.'),
    ).toBeVisible()
    expect(
      await page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith('hh.request-draft'))),
    ).toEqual([])
    await axe(page)
    // The privacy policy version the page presented is saved with the request (TSK-0024; HH-PRIV-04, HH-INT-19).
    const reference = ((await page.getByText(/^Request reference: /).textContent()) ?? '').replace(
      'Request reference: ',
      '',
    )
    const db = createDb(databaseUrl as string, { max: 1 })
    try {
      const saved = await db
        .selectFrom('intake.requests')
        .select('privacy_notice_version')
        .where('reference', '=', reference)
        .executeTakeFirstOrThrow()
      expect(saved.privacy_notice_version).toBe('privacy-notice-1')
    } finally {
      await db.destroy()
    }
  })

  test('[T69] the form works at 320 px wide without horizontal scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await startAsGuest(page)
    await page.getByLabel('Not sure what service I need').check()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Next' }).click()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    await axe(page)
  })
})
