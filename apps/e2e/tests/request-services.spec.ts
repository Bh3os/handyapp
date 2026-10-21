// The services step and service questions in a real browser (TSK-0027; HH-INT-15, HH-SVC-03, T05, T06, T69). The e2e
// database shows a fixed set of services (fixtures/services.mjs); every value is synthetic.
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

async function start(page: Page, query = '') {
  await page.goto(`/request${query}`)
  await page.getByRole('button', { name: 'Continue as Guest' }).click()
  await expect(page.getByRole('heading', { name: 'Step 1 of 5: Services' })).toBeFocused()
}

// This spec's own synthetic client address (RFC 5737): the request-form limit counts per network, and every spec
// reaches the server from 127.0.0.1 (playwright.config.ts trusts one hop on that server).
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.13' } })

test.describe('services step and service questions (TSK-0027)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')
    await page.goto('/request')
    await page.evaluate(() => window.localStorage.clear())
  })

  test('[T05][HH-INT-15] a service page link opens its category with the service selected; switching categories keeps it', async ({
    page,
  }) => {
    await start(page, '?service=SVC-DW-01')
    await expect(page.getByRole('button', { name: /^Drywall/ })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('checkbox', { name: 'Patching & Repair' })).toBeChecked()
    await expect(page.getByText('Selected services — 1 of 5')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Home Improvement Repairs and installations/ })).toBeVisible()
    await axe(page)
    await page.getByRole('button', { name: /^Home Improvement/ }).click()
    await expect(page.getByRole('checkbox', { name: 'Patching & Repair' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Remove Patching & Repair' })).toBeVisible()
    await expect(page.getByText('Selected services — 1 of 5')).toBeVisible()
  })

  test('[HH-INT-15] a sixth service is refused, with the free-text field for more work; Remove frees a place', async ({
    page,
  }) => {
    await start(page)
    await page.getByRole('button', { name: /^Home Improvement/ }).click()
    const names = [
      'Picture Hanging & Art Installation',
      'Barbecue & Grill Cleaning/Maintenance',
      'Driveway Pressure Washing',
      'TV Mounting & Wire Hiding',
      'Door Hardware & Smart Locks',
    ]
    for (const name of names) await page.getByRole('checkbox', { name }).check()
    await expect(page.getByText('Selected services — 5 of 5')).toBeVisible()
    await page.getByRole('checkbox', { name: 'Gutter Maintenance & Leaf Protection' }).click()
    await expect(page.getByRole('checkbox', { name: 'Gutter Maintenance & Leaf Protection' })).not.toBeChecked()
    await expect(page.getByText('Selected services — 5 of 5')).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: 'You can choose up to 5 services.' })).toBeVisible()
    await expect(page.getByLabel('Other services (describe them here)')).toBeVisible()
    await page.getByRole('button', { name: 'Remove Driveway Pressure Washing' }).click()
    await page.getByRole('checkbox', { name: 'Gutter Maintenance & Leaf Protection' }).check()
    await expect(page.getByText('Selected services — 5 of 5')).toBeVisible()
    await axe(page)
  })

  test("[T06][HH-SVC-03] shared questions are asked once; I don't know survives submission as unknown", async ({
    page,
  }) => {
    await start(page)
    await page.getByRole('button', { name: /^Home Improvement/ }).click()
    await page.getByRole('checkbox', { name: 'Barbecue & Grill Cleaning/Maintenance' }).check()
    await page.getByRole('checkbox', { name: 'Gutter Maintenance & Leaf Protection' }).check()
    await page.getByRole('button', { name: 'Next' }).click()
    const shared = page.getByRole('region', { name: 'For your selected services' })
    await expect(shared.getByLabel('access', { exact: true })).toBeVisible()
    await expect(shared.getByLabel('condition', { exact: true })).toBeVisible()
    await expect(page.getByLabel('access', { exact: true })).toHaveCount(1)
    const grill = page.getByRole('region', { name: 'Barbecue & Grill Cleaning/Maintenance' })
    await expect(grill.getByLabel('Type/model')).toBeVisible()
    await page.getByLabel('Project description').fill('Synthetic project: grill and gutters.')
    await shared.getByLabel('access', { exact: true }).fill('Side gate, synthetic')
    // "I don't know" for the shared condition question.
    await shared.locator('[name="unknown:/condition"]').check()
    await grill.getByLabel('Type/model').fill('Synthetic gas grill')
    await axe(page)
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Street address').fill('100 Synthetic Way')
    await page.getByLabel('City').fill('Testville')
    await page.getByLabel('State').fill('KY')
    await page.getByLabel('ZIP').fill('40000')
    await page.getByLabel('House', { exact: true }).check()
    await page.getByLabel('Preferred date').fill(future)
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Full name').fill('Test Customer')
    await page.getByRole('textbox', { name: /^Email/ }).fill('services-customer@example.test')
    await page.getByRole('textbox', { name: /^Phone/ }).fill('(502) 555-0124')
    await page.getByLabel('Email', { exact: true }).last().check()
    await page.getByLabel('Online Estimate').check()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText("I don't know")).toBeVisible()
    await page.getByRole('button', { name: 'Send Estimate Request' }).click()
    await expect(page.getByRole('heading', { name: 'Your request is in.' })).toBeVisible()
    const reference = ((await page.getByText(/^Request reference: /).textContent()) ?? '').replace(
      'Request reference: ',
      '',
    )

    const db = createDb(databaseUrl as string, { max: 1 })
    try {
      const answers = await db
        .selectFrom('intake.request_answers as a')
        .innerJoin('intake.requests as r', 'r.id', 'a.request_id')
        .select(['a.service_id', 'a.question_key', 'a.value_kind', 'a.value_text', 'a.value_number'])
        .where('r.reference', '=', reference)
        .orderBy('a.question_key')
        .execute()
      expect(answers).toEqual([
        {
          service_id: null,
          question_key: 'access',
          value_kind: 'text',
          value_text: 'Side gate, synthetic',
          value_number: null,
        },
        { service_id: null, question_key: 'condition', value_kind: 'unknown', value_text: null, value_number: null },
        {
          service_id: 'SVC-HI-02',
          question_key: 'type_model',
          value_kind: 'text',
          value_text: 'Synthetic gas grill',
          value_number: null,
        },
      ])
    } finally {
      await db.destroy()
    }
  })

  test('[T69][HH-INT-15] category cards stack at 320 px without horizontal scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 })
    await start(page)
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
    await axe(page)
  })
})
