// The final review and "Send Estimate Request" in a real browser (TSK-0030; HH-INT-19, HH-INT-10, T01, T10, T11):
// every section summarized with an Edit action that keeps everything else, the privacy policy linked with the version
// saved, one request for a double click, and the draft's idempotency key across a lost response and a reload.
// Every visitor, address and number is synthetic (RULE-SYNTHETIC-DATA).
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type Page } from '@playwright/test'

const databaseUrl = process.env['E2E_DATABASE_URL']
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
const futureText = new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' }).format(
  new Date(`${future}T12:00:00Z`),
)
/** Wording a request summary must never contain: a price, a fee, a slot or a confirmed time. */
const CLAIM =
  /\$|\bbooked\b|\bslot\b|scheduled for|appointment is (set|booked|on|at)|confirmed for|visit fee|same-day (charge|fee)/i
const SENT = '**/api/v1/public/requests'

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function start(page: Page) {
  await page.goto('/request')
  await page.evaluate(() => window.localStorage.clear())
  await page.goto('/request')
  await page.getByRole('button', { name: 'Continue as Guest' }).click()
  await expect(page.getByRole('heading', { name: 'Step 1 of 5: Services' })).toBeFocused()
}

async function property(page: Page, unit = '') {
  await page.getByLabel('Street address').fill('100 Synthetic Way')
  if (unit) await page.getByLabel('Unit').fill(unit)
  await page.getByLabel('City').fill('Testville')
  await page.getByLabel('State').fill('KY')
  await page.getByLabel('ZIP').fill('40000')
  await page.getByLabel('House', { exact: true }).check()
  await page.getByLabel('Preferred date').fill(future)
  await page.getByLabel('Mornings').check()
  await page.getByRole('button', { name: 'Next' }).click()
}

async function contact(page: Page, email: string, phone: string) {
  await page.getByLabel('Full name').fill('Test Customer')
  await page.getByRole('textbox', { name: /^Email/ }).fill(email)
  await page.getByRole('textbox', { name: /^Phone/ }).fill(phone)
  await page.getByLabel('Phone call', { exact: true }).check()
  await page.getByLabel('Let HandyHub decide').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { name: 'Step 5 of 5: Review and send' })).toBeVisible()
}

async function referenceOnReceipt(page: Page): Promise<string> {
  await expect(page.getByRole('heading', { name: 'Your request is in.' })).toBeFocused()
  return ((await page.getByText(/^Request reference: /).textContent()) ?? '').replace('Request reference: ', '')
}

/** Every request saved for one synthetic email, with what the review promised to send. */
async function saved(email: string) {
  const db = createDb(databaseUrl as string, { max: 1 })
  try {
    return await db
      .selectFrom('intake.requests')
      .innerJoin('crm.contacts', 'crm.contacts.id', 'intake.requests.contact_id')
      .innerJoin('crm.properties', 'crm.properties.id', 'intake.requests.property_id')
      .select([
        'intake.requests.reference',
        'intake.requests.privacy_notice_version',
        'crm.contacts.full_name',
        'crm.properties.street',
        'crm.properties.unit',
      ])
      .where('crm.contacts.email', '=', email)
      .execute()
  } finally {
    await db.destroy()
  }
}

// This spec's own synthetic client address (RFC 5737): the request-form limit counts per network (5 an hour), and
// every spec reaches the server from 127.0.0.1 (playwright.config.ts trusts one hop on that server). This spec sends
// four requests to the server in all.
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.25' } })

test.describe('final review and Send Estimate Request (TSK-0030)', () => {
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-INT-19][T01][T11] every section with Edit; an edited section shows on review; a double click sends once with the notice version', async ({
    page,
  }) => {
    const email = 'review-once@example.test'
    await start(page)
    await page.getByRole('button', { name: /^Drywall/ }).click()
    await page.getByRole('checkbox', { name: 'Patching & Repair' }).check()
    await page.getByLabel('Other services (describe them here)').fill('Synthetic extra work: a loose towel bar.')
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Project description').fill('Synthetic project: a dent behind a door.')
    await page.getByLabel('Notes for Patching & Repair').fill('Synthetic note: about the size of a coin.')
    await page.getByRole('button', { name: 'Next' }).click()
    await property(page, 'Apt 2')
    await contact(page, email, '(502) 555-0181')

    // The summary: services, answers, photos, the full address, timing and contact details (HH-INT-19).
    const region = (name: string) => page.getByRole('region', { name, exact: true })
    await expect(region('Services')).toContainText('Patching & Repair')
    await expect(region('Services')).toContainText('Synthetic extra work: a loose towel bar.')
    await expect(region('About the job')).toContainText('Synthetic project: a dent behind a door.')
    await expect(region('About the job')).toContainText('Notes for Patching & Repair')
    await expect(region('About the job')).toContainText('Synthetic note: about the size of a coin.')
    await expect(region('Photos')).toContainText('No photos added.')
    await expect(region('Property')).toContainText('100 Synthetic Way, Apt 2')
    await expect(region('Property')).toContainText('Testville, KY 40000')
    await expect(region('Property')).toContainText('House')
    await expect(region('Preferred timing')).toContainText(futureText)
    await expect(region('Preferred timing')).toContainText('Mornings')
    await expect(region('Preferred timing')).toContainText(
      'These are your preferences. Your appointment is confirmed only after we send a date and arrival window.',
    )
    for (const text of ['Test Customer', email, '(502) 555-0181', 'Phone call', 'Let HandyHub decide'])
      await expect(region('Contact')).toContainText(text)
    for (const name of ['Services', 'About the job', 'Photos', 'Property', 'Preferred timing', 'Contact'])
      await expect(region(name).getByRole('button', { name: `Edit ${name}` })).toBeVisible()
    // The privacy policy is linked, with the exact version this request is sent with.
    await expect(page.getByRole('link', { name: 'Privacy Policy (opens in a new tab)', exact: true })).toHaveAttribute(
      'href',
      '/privacy',
    )
    await expect(page.getByTestId('privacy-version')).toContainText('Document ID: privacy-notice-1.')
    // No price and no confirmed time.
    await expect(page.locator('main')).not.toContainText(CLAIM)
    await axe(page)

    // Edit opens the step with everything kept; Return to review shows the change and every other answer.
    await region('Property').getByRole('button', { name: 'Edit Property' }).click()
    await expect(page.getByRole('heading', { name: 'Step 3 of 5: Property and timing' })).toBeFocused()
    await expect(page.getByLabel('Unit')).toHaveValue('Apt 2')
    await expect(page.getByLabel('Mornings')).toBeChecked()
    await page.getByLabel('Street address').fill('200 Edited Way')
    await page.getByRole('button', { name: 'Return to review' }).click()
    await expect(page.getByRole('heading', { name: 'Step 5 of 5: Review and send' })).toBeFocused()
    await expect(region('Property')).toContainText('200 Edited Way, Apt 2')
    await expect(region('Property')).not.toContainText('100 Synthetic Way')
    await expect(region('About the job')).toContainText('Synthetic note: about the size of a coin.')
    await expect(region('Contact')).toContainText(email)

    await region('Services').getByRole('button', { name: 'Edit Services' }).click()
    await expect(page.getByRole('heading', { name: 'Step 1 of 5: Services' })).toBeFocused()
    await expect(page.getByRole('button', { name: 'Remove Patching & Repair' })).toBeVisible()
    await page.getByRole('button', { name: 'Return to review' }).click()
    await expect(region('About the job')).toContainText('Synthetic project: a dent behind a door.')

    // A double click: the button is pending at once and one request reaches the server (HH-INT-10, T11).
    let posts = 0
    await page.route(SENT, async (route) => {
      posts++
      await new Promise((resolve) => setTimeout(resolve, 750))
      await route.continue()
    })
    const send = page.getByRole('button', { name: 'Send Estimate Request' })
    await send.dblclick()
    await expect(send).toHaveAttribute('aria-disabled', 'true')
    const reference = await referenceOnReceipt(page)
    expect(posts).toBe(1)
    await page.unroute(SENT)

    // The saved request holds the edited address and the privacy policy version that was presented.
    expect(await saved(email)).toEqual([
      {
        reference,
        privacy_notice_version: 'privacy-notice-1',
        full_name: 'Test Customer',
        street: '200 Edited Way',
        unit: 'Apt 2',
      },
    ])
  })

  test("[HH-INT-10][T11][HH-INT-19] a lost response and a reload keep the draft's key: changed details conflict, the same details return the saved request", async ({
    page,
  }) => {
    const email = 'review-retry@example.test'
    await start(page)
    await page.getByLabel('Not sure what service I need').check()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Project description').fill('Synthetic project: a sticking closet door.')
    await page.getByRole('button', { name: 'Next' }).click()
    await property(page)
    await contact(page, email, '(502) 555-0182')

    // The request is saved, but its answer never reaches the browser (a connection lost after the commit).
    await page.route(SENT, async (route) => {
      await route.fetch()
      await route.abort('failed')
    })
    await page.getByRole('button', { name: 'Send Estimate Request' }).click()
    await expect(
      page.getByText(
        'We could not confirm that your request arrived. Try again: sending it again never creates a second request.',
      ),
    ).toBeVisible()
    await page.unroute(SENT)
    const first = await saved(email)
    expect(first).toHaveLength(1)

    // A reload: the draft resumes on the review, with its own idempotency key.
    await page.reload()
    await page.getByRole('button', { name: 'Resume' }).click()
    await expect(page.getByRole('heading', { name: 'Step 5 of 5: Review and send' })).toBeVisible()

    // Changed details under the key already used: refused as a conflict, nothing written, no retry offered.
    await page.getByRole('button', { name: 'Edit Contact' }).click()
    await page.getByLabel('Full name').fill('Test Customer Changed')
    await page.getByRole('button', { name: 'Return to review' }).click()
    await page.getByRole('button', { name: 'Send Estimate Request' }).click()
    const conflict = page.getByText('This request was already sent with different details. Start a new request.')
    await expect(conflict).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0)
    await axe(page)
    expect(await saved(email)).toEqual(first)

    // The same details again: the request already saved, with its reference; still one request.
    await page.getByRole('button', { name: 'Edit Contact' }).click()
    await page.getByLabel('Full name').fill('Test Customer')
    await page.getByRole('button', { name: 'Return to review' }).click()
    await page.getByRole('button', { name: 'Send Estimate Request' }).click()
    expect(await referenceOnReceipt(page)).toBe(first[0]?.reference)
    expect(await saved(email)).toEqual(first)
    expect(
      await page.evaluate(() => Object.keys(window.localStorage).filter((k) => k.startsWith('hh.request-draft'))),
    ).toEqual([])
  })
})
