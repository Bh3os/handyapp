// The contact step with the SMS opt-in and the separate marketing permission in a real browser (TSK-0029, TSK-0133;
// HH-INT-18, HH-INT-22, HH-COM-12, OWN-DEC-190, T10, T76). The label and the disclosure below are the owner's opt-in
// point A of OWN-DEC-190, typed out independently of the site catalog. Every visitor, address and number is synthetic
// (RULE-SYNTHETIC-DATA); the support contact is NOT CONFIGURED (OWN-DEC-131), so it shows labelled placeholders.
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type Page } from '@playwright/test'

const databaseUrl = process.env['E2E_DATABASE_URL']
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
const SMS_LABEL =
  'I agree to receive text messages from HandyHub about my service requests, estimates, appointments, and project updates at the phone number provided.'
const DISCLOSURE =
  'Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for assistance. Consent is not required to purchase services.'
const MARKETING_LABEL = 'Yes, HandyHub may send me marketing messages.'

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function toContact(page: Page, email: string, phone: string) {
  await page.goto('/request')
  await page.evaluate(() => window.localStorage.clear())
  await page.goto('/request')
  await page.getByRole('button', { name: 'Continue as Guest' }).click()
  await page.getByLabel('Not sure what service I need').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Project description').fill('Synthetic project: patch a small wall dent.')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Street address').fill('400 Synthetic Lane')
  await page.getByLabel('City').fill('Testville')
  await page.getByLabel('State').fill('KY')
  await page.getByLabel('ZIP').fill('40000')
  await page.getByLabel('House', { exact: true }).check()
  await page.getByLabel('Preferred date').fill(future)
  await page.getByLabel('Mornings').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { name: 'Step 4 of 5: Contact' })).toBeVisible()
  await page.getByLabel('Full name').fill('Test Customer')
  await page.getByRole('textbox', { name: /^Email/ }).fill(email)
  await page.getByRole('textbox', { name: /^Phone/ }).fill(phone)
  await page.getByLabel('Online Estimate', { exact: true }).check()
}

async function send(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { name: 'Step 5 of 5: Review and send' })).toBeVisible()
  await page.getByRole('button', { name: 'Send Estimate Request' }).click()
  await expect(page.getByRole('heading', { name: 'Your request is in.' })).toBeFocused()
  return ((await page.getByText(/^Request reference: /).textContent()) ?? '').replace('Request reference: ', '')
}

async function consents(reference: string) {
  const db = createDb(databaseUrl as string, { max: 1 })
  try {
    const request = await db
      .selectFrom('intake.requests')
      .innerJoin('crm.contacts', 'crm.contacts.id', 'intake.requests.contact_id')
      .select(['intake.requests.sms_opt_in', 'intake.requests.marketing_opt_in', 'crm.contacts.phone_e164'])
      .select('crm.contacts.email')
      .where('intake.requests.reference', '=', reference)
      .executeTakeFirstOrThrow()
    const rows = await db
      .selectFrom('platform.consent_records')
      .select(['purpose', 'channel', 'granted', 'disclosure_version', 'source', 'recorded_at'])
      .where('destination', 'in', [request.phone_e164, request.email.toLowerCase()])
      .orderBy('seq')
      .execute()
    return { request, rows }
  } finally {
    await db.destroy()
  }
}

// This spec's own synthetic client address (RFC 5737): the request-form limit counts per network, and every spec
// reaches the server from 127.0.0.1 (playwright.config.ts trusts one hop on that server).
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.22' } })

test.describe('contact step: SMS opt-in and separate marketing permission (TSK-0029)', () => {
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-INT-22][HH-INT-18][T76] unchecked by default, separate, with the disclosure; no consent when left unchecked', async ({
    page,
  }) => {
    await toContact(page, 'contact-unchecked@example.test', '(502) 555-0161')
    await expect(
      page.getByText('We use your contact details to reply to your request and to contact you about your project.'),
    ).toBeVisible()
    const sms = page.getByLabel(SMS_LABEL)
    const marketing = page.getByLabel(MARKETING_LABEL)
    await expect(sms).not.toBeChecked()
    await expect(marketing).not.toBeChecked()
    // Separate groups: checking one never checks the other.
    await expect(page.getByRole('group', { name: 'Text messages (optional)' }).getByRole('checkbox')).toHaveCount(1)
    await expect(page.getByRole('group', { name: 'Marketing (optional)' }).getByRole('checkbox')).toHaveCount(1)
    await sms.check()
    await expect(marketing).not.toBeChecked()
    await sms.uncheck()
    await marketing.check()
    await expect(sms).not.toBeChecked()
    await marketing.uncheck()

    // The disclosure next to the box (OWN-DEC-190): frequency, rates, STOP, HELP, not a condition of purchase, the
    // support contact and the links.
    const disclosure = page.getByTestId('sms-disclosure')
    for (const text of [DISCLOSURE, 'Support contact:']) await expect(disclosure.getByText(text)).toBeVisible()
    await expect(disclosure.getByText('Placeholder — not provided yet')).toHaveCount(2)
    await expect(sms).toHaveAccessibleDescription(/Reply STOP to opt out or HELP for assistance\./)
    await expect(disclosure.getByRole('link', { name: /SMS Terms/ })).toHaveAttribute('href', '/sms-terms')
    await expect(disclosure.getByRole('link', { name: /Privacy Policy/ })).toHaveAttribute('href', '/privacy')
    await axe(page)

    // Text as the preferred method needs the opt-in: the form says so and keeps the choice (HH-INT-22, T10).
    await page.getByLabel('Text', { exact: true }).check()
    await expect(page.getByRole('status').filter({ hasText: 'Texts need your agreement' })).toBeVisible()
    await page.getByRole('button', { name: 'Next' }).click()
    const summary = page.getByRole('alert').filter({ hasText: 'Check these fields' })
    await expect(summary).toBeFocused()
    await expect(
      summary.getByRole('link', { name: /How should we contact you\?: Texts need your agreement/ }),
    ).toBeVisible()
    await expect(page.getByLabel('Text', { exact: true })).toBeChecked()
    await axe(page)
    await page.getByLabel('Email', { exact: true }).check()

    const reference = await send(page)
    const { request, rows } = await consents(reference)
    expect(request).toMatchObject({ sms_opt_in: false, marketing_opt_in: false })
    // No consent at all: no text goes to this number (HH-COM-05).
    expect(rows).toEqual([])
  })

  test('[HH-INT-22][T76][ENT-ConsentPreference] a checked box records the disclosure version, source and time', async ({
    page,
  }) => {
    await toContact(page, 'contact-opted-in@example.test', '(502) 555-0162')
    await page.getByLabel(SMS_LABEL).check()
    await page.getByLabel('Text', { exact: true }).check()
    await expect(page.getByRole('status').filter({ hasText: 'Texts need your agreement' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Next' }).click()
    const review = page.getByRole('region', { name: 'Contact' })
    await expect(review.getByText('Texts', { exact: true })).toBeVisible()
    await expect(review.locator('dd', { hasText: /^Yes$/ })).toHaveCount(1)
    await expect(review.locator('dd', { hasText: /^No$/ })).toHaveCount(1)
    await page.getByRole('button', { name: 'Back' }).click()
    const started = Date.now()
    const reference = await send(page)
    const { request, rows } = await consents(reference)
    expect(request).toMatchObject({ sms_opt_in: true, marketing_opt_in: false })
    expect(rows.map((r) => [r.purpose, r.channel, r.granted, r.disclosure_version, r.source])).toEqual([
      ['transactional_sms', 'sms', true, 'sms-disclosure-2', 'request_form'],
    ])
    expect(rows[0]?.recorded_at.getTime()).toBeGreaterThanOrEqual(started - 60_000)
  })

  test('[HH-COM-12][T76] the disclosure links open the SMS terms and the privacy policy', async ({ page, context }) => {
    await toContact(page, 'contact-links@example.test', '(502) 555-0163')
    const disclosure = page.getByTestId('sms-disclosure')
    for (const [name, path, title] of [
      [/SMS Terms/, '/sms-terms', 'SMS Terms'],
      [/Privacy Policy/, '/privacy', 'Privacy Policy'],
    ] as const) {
      const [tab] = await Promise.all([context.waitForEvent('page'), disclosure.getByRole('link', { name }).click()])
      await tab.waitForLoadState()
      await expect(tab).toHaveURL(new RegExp(`${path}$`))
      await expect(tab.getByRole('heading', { level: 1 })).toHaveText(title)
      await tab.close()
    }
    // The form itself is untouched while the documents were read.
    await expect(page.getByRole('textbox', { name: /^Email/ })).toHaveValue('contact-links@example.test')
  })
})
