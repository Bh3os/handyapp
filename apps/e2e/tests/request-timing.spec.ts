// The property, timing and estimate-approach steps in a real browser (TSK-0028; HH-INT-16, HH-INT-17, HH-INT-02,
// HH-INT-03, T09, T24, T37, T41). Preferences only: nothing on the page or the receipt claims a slot, a booking or a
// fee. Every visitor, address and number is synthetic (RULE-SYNTHETIC-DATA).
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type Page } from '@playwright/test'

const databaseUrl = process.env['E2E_DATABASE_URL']
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const ZONE = 'America/Kentucky/Louisville'
const STREET = '300 Synthetic Court'

/** A calendar date in the business time zone, some days from now. */
function localDate(daysAhead: number): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  )
  const d = new Date(`${p['year']}-${p['month']}-${p['day']}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + daysAhead)
  return d.toISOString().slice(0, 10)
}
/** A Wednesday at least three days ahead. */
function weekday(): string {
  const d = new Date(`${localDate(3)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + ((3 - d.getUTCDay() + 7) % 7))
  return d.toISOString().slice(0, 10)
}

/** Wording that would claim a booking, a slot or a fee; none of it may appear (HH-INT-02, FACT-VISIT-FEE). */
const SLOT_CLAIM =
  /\$|\bbooked\b|\bslot\b|scheduled for|appointment is (set|booked|on|at)|confirmed for|visit fee|same-day (charge|fee)/i

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

// This spec's own synthetic client address (RFC 5737): the request-form limit counts per network, and every spec
// reaches the server from 127.0.0.1 (playwright.config.ts trusts one hop on that server).
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.14' } })

test.describe('property, timing and estimate approach (TSK-0028)', () => {
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[T09][HH-INT-02][HH-INT-17][HH-INT-16][HH-INT-03][T37] preferences are stored as preferences; nothing claims a slot', async ({
    page,
  }) => {
    const urls: string[] = []
    page.on('request', (r) => urls.push(r.url()))
    await page.goto('/request')
    await page.evaluate(() => window.localStorage.clear())
    await page.goto('/request')
    await page.getByRole('button', { name: 'Continue as Guest' }).click()
    await page.getByLabel('Not sure what service I need').check()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Project description').fill('Synthetic project: touch up a hallway wall.')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('heading', { name: 'Step 3 of 5: Property and timing' })).toBeVisible()

    // Full address with an optional unit; exactly the four property types (HH-INT-16, FACT-PROPERTY-TYPES).
    await page.getByLabel('Street address').fill(STREET)
    await page.getByLabel('Unit').fill('Apt 7')
    await page.getByLabel('City').fill('Testville')
    await page.getByLabel('State').fill('KY')
    await page.getByLabel('ZIP').fill('40000')
    const types = page.locator('input[name="propertyType"]')
    await expect(types).toHaveCount(4)
    for (const name of ['House', 'Apartment / condo', 'Townhouse', 'Rental / short-term rental'])
      await expect(page.getByLabel(name, { exact: true })).toBeVisible()
    await page.getByLabel('Townhouse', { exact: true }).check()

    // The owner's wording, the configured visit hours, and dates from tomorrow in the property's time zone.
    await expect(
      page.getByText(
        'These are your preferences. Your appointment is confirmed only after we send a date and arrival window.',
      ),
    ).toBeVisible()
    await expect(page.getByText('Visits every day, 8 AM–10 PM, by appointment.')).toBeVisible()
    await expect(page.getByLabel('Preferred date')).toHaveAttribute('min', localDate(1))

    // The five windows; Weekends with Mornings is explained, and must agree with the date (HH-INT-02).
    for (const name of ['Mornings', 'Afternoons', 'Evenings', 'Weekends', 'Any time'])
      await expect(page.getByLabel(name, { exact: true })).toBeVisible()
    await page.getByLabel('Preferred date').fill(weekday())
    await page.getByLabel('Mornings', { exact: true }).check()
    await page.getByLabel('Weekends', { exact: true }).check()
    await expect(
      page.getByText('Weekends with Mornings, Afternoons or Evenings means those times on a Saturday or Sunday.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Check these fields' })).toBeFocused()
    await expect(
      page.locator('[data-field="timing.windows"]').getByText('Weekends needs a Saturday or Sunday date.', {
        exact: false,
      }),
    ).toBeVisible()
    await axe(page)

    // Any time clears the others.
    await page.getByLabel('Any time', { exact: true }).check()
    await expect(page.getByLabel('Mornings', { exact: true })).not.toBeChecked()
    await expect(page.getByLabel('Weekends', { exact: true })).not.toBeChecked()

    // I'm flexible replaces the date; Need help today is a request for review, never an appointment.
    await page.getByLabel("I'm flexible").check()
    await expect(page.getByLabel('Preferred date')).toHaveCount(0)
    await page.getByLabel('Need help today?').check()
    await expect(page.getByLabel('Need help today?')).toHaveAccessibleDescription(
      'Optional. We review same-day requests and help when there is an opening. This is not a confirmed appointment.',
    )
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('heading', { name: 'Step 4 of 5: Contact' })).toBeVisible()

    // Going back keeps every preference (HH-INT-17).
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByLabel("I'm flexible")).toBeChecked()
    await expect(page.getByLabel('Need help today?')).toBeChecked()
    await expect(page.getByLabel('Any time', { exact: true })).toBeChecked()
    await expect(page.getByLabel('Unit')).toHaveValue('Apt 7')
    await page.getByRole('button', { name: 'Next' }).click()

    // The estimate approach: three choices, staff confirm it, and the configured free-estimate wording (HH-INT-03).
    await page.getByLabel('Full name').fill('Test Customer')
    await page.getByRole('textbox', { name: /^Email/ }).fill('timing-customer@example.test')
    await page.getByRole('textbox', { name: /^Phone/ }).fill('(502) 555-0177')
    await page.getByLabel('Email', { exact: true }).check()
    for (const name of ['Online Estimate', 'Site Visit', 'Let HandyHub decide'])
      await expect(page.getByLabel(name, { exact: true })).toBeVisible()
    await expect(page.getByText('Staff confirm the appropriate approach after review.')).toBeVisible()
    await expect(page.getByText('Free estimates—online or at your property.')).toBeVisible()
    await page.getByLabel('Site Visit', { exact: true }).check()
    await expect(page.locator('main')).not.toContainText(SLOT_CLAIM)
    await page.getByRole('button', { name: 'Next' }).click()

    // The review shows the full address and the preferences, and claims nothing.
    await expect(page.getByRole('heading', { name: 'Step 5 of 5: Review and send' })).toBeVisible()
    const review = page.locator('main')
    await expect(review).toContainText(`${STREET}, Apt 7`)
    await expect(review).toContainText('Testville, KY 40000')
    await expect(review).toContainText('Townhouse')
    await expect(review).toContainText("I'm flexible")
    await expect(review).toContainText('Any time')
    await expect(review).toContainText('Site Visit')
    await expect(review).not.toContainText(SLOT_CLAIM)

    await page.getByRole('button', { name: 'Send Estimate Request' }).click()
    await expect(page.getByRole('heading', { name: 'Your request is in.' })).toBeVisible()
    await expect(
      page.getByText('Your request is received. Pricing and your appointment will be confirmed separately.'),
    ).toBeVisible()
    await expect(page.locator('main')).not.toContainText(SLOT_CLAIM)
    const reference = (
      await page
        .getByText(/HH-[0-9A-Z]{8}/)
        .first()
        .textContent()
    )?.match(/HH-[0-9A-Z]{8}/)?.[0]
    expect(reference).toBeTruthy()

    // The address never reaches a URL (HH-INT-16).
    for (const url of [page.url(), ...urls]) expect(decodeURIComponent(url)).not.toMatch(/Synthetic Court|Apt 7/)

    const db = createDb(databaseUrl as string, { max: 1 })
    try {
      const r = await db
        .selectFrom('intake.requests')
        .innerJoin('crm.properties', 'crm.properties.id', 'intake.requests.property_id')
        .select([
          'intake.requests.id',
          'preferred_date',
          'flexible',
          'need_help_today',
          'time_windows',
          'estimate_preference',
          'street',
          'unit',
          'property_type',
        ])
        .where('reference', '=', reference as string)
        .executeTakeFirstOrThrow()
      expect(r).toMatchObject({
        preferred_date: null,
        flexible: true,
        need_help_today: true,
        time_windows: ['any_time'],
        estimate_preference: 'site_visit',
        street: STREET,
        unit: 'Apt 7',
        property_type: 'townhouse',
      })
      // A preference is never a visit or an appointment (T37, HH-SCH-01): the request's only event is its receipt.
      const events = await db
        .selectFrom('platform.outbox_events')
        .select('type')
        .where('aggregate_id', '=', r.id)
        .execute()
      expect(events.map((e) => e.type)).toEqual(['request.submitted'])
    } finally {
      await db.destroy()
    }
  })
})
