// The final review and "Send Estimate Request" in a real browser (TSK-0030; HH-INT-19, HH-INT-10, HH-INT-07, T01, T10,
// T11): every section summarized with an Edit action that keeps everything else, the privacy policy linked with the
// version saved, one request for a double click, the draft's idempotency key across a lost response and a reload (the
// same body with its consents, or the request already received with its reference), and no send while a photo is
// still uploading. Every visitor, address, number and image is synthetic (RULE-SYNTHETIC-DATA).
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
const DRAFT_PHOTOS = '**/api/v1/public/request-drafts/photos'
const SMS_LABEL =
  'I agree to receive text messages from HandyHub about my service requests, estimates, appointments, and project updates at the phone number provided.'
const MARKETING_LABEL = 'Yes, HandyHub may send me marketing messages.'
const UNCERTAIN =
  'We could not confirm that your request arrived. Try again: sending it again never creates a second request.'
const ALREADY =
  'We had already received this request from this browser. Anything you changed after you first sent it was not included.'
/** A synthetic 1x1 PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

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

async function contact(page: Page, email: string, phone: string, consents = false) {
  await page.getByLabel('Full name').fill('Test Customer')
  await page.getByRole('textbox', { name: /^Email/ }).fill(email)
  await page.getByRole('textbox', { name: /^Phone/ }).fill(phone)
  await page.getByLabel('Phone call', { exact: true }).check()
  if (consents) {
    await page.getByLabel(SMS_LABEL).check()
    await page.getByLabel(MARKETING_LABEL).check()
  }
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
        'intake.requests.sms_opt_in',
        'intake.requests.marketing_opt_in',
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

/** The value of one review row, by section and label. */
function reviewValue(page: Page, section: string, label: string) {
  return page
    .locator(`[data-section="${section}"] dl > div`)
    .filter({ has: page.locator('dt', { hasText: new RegExp(`^${label}$`) }) })
    .locator('dd')
}

/** The send bodies this tab keeps (sessionStorage) and the drafts this browser keeps (localStorage). */
async function stored(page: Page) {
  return page.evaluate(() => ({
    sends: Object.keys(window.sessionStorage).filter((k) => k.startsWith('hh.request-send')),
    drafts: Object.entries(window.localStorage)
      .filter(([k]) => k.startsWith('hh.request-draft'))
      .map(([, v]) => v),
  }))
}

/** A send whose request is saved but whose answer never reaches the browser (a connection lost after the commit). */
async function loseTheAnswer(page: Page) {
  await page.route(SENT, async (route) => {
    await route.fetch()
    await route.abort('failed')
  })
  await page.getByRole('button', { name: 'Send Estimate Request' }).click()
  await expect(page.getByText(UNCERTAIN)).toBeVisible()
  await page.unroute(SENT)
}

// This spec's own synthetic client address (RFC 5737): the request-form limit counts per network (5 an hour), and
// every spec reaches the server from 127.0.0.1 (playwright.config.ts trusts one hop on that server). This spec sends
// five requests to the server in all.
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
      'These are your preferred times only. Your appointment is not confirmed until HandyHub sends you a confirmed date and arrival window.',
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
        sms_opt_in: false,
        marketing_opt_in: false,
        full_name: 'Test Customer',
        street: '200 Edited Way',
        unit: 'Apt 2',
      },
    ])
  })

  test('[HH-INT-10][T11][HH-INT-22] a lost response, a reload and Resume with both consents checked send the same body: the same request and reference', async ({
    page,
  }) => {
    const email = 'review-retry@example.test'
    await start(page)
    await page.getByLabel('Not sure what service I need').check()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Project description').fill('Synthetic project: a sticking closet door.')
    await page.getByRole('button', { name: 'Next' }).click()
    await property(page)
    await contact(page, email, '(502) 555-0182', true)

    await loseTheAnswer(page)
    const first = await saved(email)
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ sms_opt_in: true, marketing_opt_in: true })
    // The tab keeps the body it sent; the 7-day draft never keeps a consent.
    const kept = await stored(page)
    expect(kept.sends).toHaveLength(1)
    expect(kept.drafts.join('')).not.toMatch(/"smsOptIn":true|"marketingOptIn":true/)

    // A reload: the draft resumes on the review with the outcome still unknown, showing what it sends again.
    await page.reload()
    await page.getByRole('button', { name: 'Resume' }).click()
    await expect(page.getByRole('heading', { name: 'Step 5 of 5: Review and send' })).toBeVisible()
    await expect(page.getByText(UNCERTAIN)).toBeVisible()
    await expect(reviewValue(page, 'contact', 'Texts')).toHaveText('Yes')
    await expect(reviewValue(page, 'contact', 'Marketing permission')).toHaveText('Yes')
    await axe(page)

    // The same body under the same key: the request already saved, with its reference; still one request.
    let posts = 0
    await page.route(SENT, async (route) => {
      posts++
      await route.continue()
    })
    await page.getByRole('button', { name: 'Send Estimate Request' }).click()
    expect(await referenceOnReceipt(page)).toBe(first[0]?.reference)
    expect(posts).toBe(1)
    await expect(page.getByText(ALREADY)).toHaveCount(0)
    await page.unroute(SENT)
    expect(await saved(email)).toEqual(first)
    expect(await stored(page)).toEqual({ sends: [], drafts: [] })
  })

  test('[HH-INT-10][T11] changed details after a lost response: the request already received comes back with its reference and nothing is written', async ({
    page,
  }) => {
    const email = 'review-changed@example.test'
    await start(page)
    await page.getByLabel('Not sure what service I need').check()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Project description').fill('Synthetic project: a loose cabinet hinge.')
    await page.getByRole('button', { name: 'Next' }).click()
    await property(page)
    await contact(page, email, '(502) 555-0183')

    await loseTheAnswer(page)
    const first = await saved(email)
    expect(first).toHaveLength(1)

    // After a reload and Resume the details change under the key already used: the server names the request that key
    // created, and the customer gets its receipt; they are never told to start a second request.
    await page.reload()
    await page.getByRole('button', { name: 'Resume' }).click()
    await page.getByRole('button', { name: 'Edit Contact' }).click()
    await page.getByLabel('Full name').fill('Test Customer Changed')
    await page.getByRole('button', { name: 'Return to review' }).click()
    await page.getByRole('button', { name: 'Send Estimate Request' }).click()
    expect(await referenceOnReceipt(page)).toBe(first[0]?.reference)
    await expect(page.getByText(ALREADY)).toBeVisible()
    await expect(page.getByText(/start a new request/i)).toHaveCount(0)
    // What that request holds is not known here (TSK-0032): no project at a glance with the changed details and no
    // photo count; the receipt is kept for this tab at its own address like any other.
    expect(new URL(page.url()).pathname).toBe(`/request/received/${first[0]?.reference}`)
    await expect(page.getByRole('region', { name: 'Your project at a glance' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Your photos' })).toHaveCount(0)
    await expect(page.locator('main')).not.toContainText('Test Customer Changed')
    await axe(page)
    expect(await saved(email)).toEqual(first)
    expect(await stored(page)).toEqual({ sends: [], drafts: [] })
    await page.reload()
    expect(await referenceOnReceipt(page)).toBe(first[0]?.reference)
    await expect(page.getByText(ALREADY)).toBeVisible()
  })

  test('[HH-INT-07][HH-INT-19] nothing is sent while a photo is still uploading; the review says so', async ({
    page,
  }) => {
    await start(page)
    await page.getByLabel('Not sure what service I need').check()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Project description').fill('Synthetic project with a photo still uploading.')
    // The photo's upload is held until the review has been checked.
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route(DRAFT_PHOTOS, async (route) => {
      if (route.request().method() === 'POST') await held
      await route.continue()
    })
    await page
      .locator('input[type="file"][name="photos"]')
      .setInputFiles([{ name: 'wall.png', mimeType: 'image/png', buffer: PNG }])
    await expect(page.locator('.hh-request__photo').getByText('Uploading')).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await property(page)
    await contact(page, 'review-uploading@example.test', '(502) 555-0184')

    let posts = 0
    await page.route(SENT, async (route) => {
      posts++
      await route.continue()
    })
    const photosRegion = page.getByRole('region', { name: 'Photos', exact: true })
    await expect(photosRegion.getByRole('status')).toHaveText(
      '1 photo is still uploading. Wait for it to finish, or use Edit to remove it.',
    )
    const send = page.getByRole('button', { name: 'Send Estimate Request' })
    await expect(send).toBeDisabled()
    await expect(send).toHaveAccessibleDescription('Wait for your photos to finish uploading, or remove them.')
    await expect(page.getByText('Wait for your photos to finish uploading, or remove them.')).toBeVisible()
    await axe(page)
    // A submit some other way (the keyboard, a script) sends nothing either: the photo draft stays open.
    await page.locator('form.hh-request').evaluate((form) => (form as HTMLFormElement).requestSubmit())
    await expect(page.getByRole('heading', { name: 'Step 5 of 5: Review and send' })).toBeVisible()
    expect(posts).toBe(0)

    // Once the upload finishes, the notice goes and the request can be sent.
    release()
    await expect(photosRegion.getByText('Uploading')).toHaveCount(0)
    await expect(photosRegion.getByRole('status')).toHaveCount(0)
    await expect(send).toBeEnabled()
    expect(posts).toBe(0)
    await page.unroute(SENT)
    await page.unroute(DRAFT_PHOTOS)
  })
})
