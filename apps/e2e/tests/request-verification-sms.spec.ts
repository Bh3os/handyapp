// Phone verification opt-in on the receipt, in a real browser (TSK-0134; OWN-DEC-178, OWN-DEC-190 opt-in point B,
// HH-INT-13, HH-INT-22, ENT-ConsentPreference). The code a test enters is read back from the database and derived with
// the e2e servers' synthetic code key (codes.ts); every visitor, address and number is synthetic
// (RULE-SYNTHETIC-DATA). Assertions read only the records these tests create (the database is shared by every spec).
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type Page } from '@playwright/test'
import { codeFor } from '../codes.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
// The owner's wording (OWN-DEC-190 opt-in point B and the disclosure beside each checkbox).
const CODE_LABEL = 'I agree to receive a one-time SMS verification code from HandyHub at the phone number provided.'
const DISCLOSURE =
  'Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for assistance. Consent is not required to purchase services.'

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1 })
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

/** Sends a request without the SMS opt-in through the wizard and waits for its receipt; returns the reference. */
async function sendRequest(page: Page, email: string, phone: string): Promise<string> {
  await page.goto('/request')
  await page.evaluate(() => window.localStorage.clear())
  await page.goto('/request')
  await page.getByRole('button', { name: 'Continue as Guest' }).click()
  await page.getByLabel('Not sure what service I need').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Project description').fill('Synthetic phone opt-in project: a squeaky cabinet door.')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Street address').fill('400 Synthetic Court')
  await page.getByLabel('City').fill('Testville')
  await page.getByLabel('State').fill('KY')
  await page.getByLabel('ZIP').fill('40000')
  await page.getByLabel('House', { exact: true }).check()
  await page.getByLabel('Preferred date').fill(future)
  await page.getByLabel('Mornings').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Full name').fill('Test Customer')
  await page.getByRole('textbox', { name: /^Email/ }).fill(email)
  await page.getByRole('textbox', { name: /^Phone/ }).fill(phone)
  await page.getByLabel('Phone call', { exact: true }).check()
  await page.getByLabel('Let HandyHub decide').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { name: 'Step 5 of 5: Review and send' })).toBeVisible()
  await page.getByRole('button', { name: 'Send Estimate Request' }).click()
  await expect(page.getByRole('heading', { name: 'Your request is in.' })).toBeFocused()
  return new URL(page.url()).pathname.replace('/request/received/', '')
}

/** The request's contact, its phone, its consent records and the codes sent to it. */
async function recordsOf(reference: string) {
  return withDb(async (db) => {
    const r = await db
      .selectFrom('intake.requests')
      .innerJoin('crm.contacts', 'crm.contacts.id', 'intake.requests.contact_id')
      .select(['intake.requests.id', 'intake.requests.contact_id', 'crm.contacts.phone_e164'])
      .where('intake.requests.reference', '=', reference)
      .executeTakeFirstOrThrow()
    const consents = await db
      .selectFrom('platform.consent_records')
      .select(['purpose', 'granted', 'source', 'disclosure_version', 'evidence'])
      .where('destination', '=', r.phone_e164)
      .orderBy('seq')
      .execute()
    const codes = await db
      .selectFrom('identity.verification_codes')
      .select(['id', 'nonce'])
      .where('subject_ref', '=', `contact:${r.contact_id}:phone`)
      .orderBy('created_at', 'desc')
      .execute()
    return { requestId: r.id, consents, codes }
  })
}
const channelGroup = (page: Page, name: 'Email' | 'Phone') =>
  page.getByRole('region', { name: 'Verify your contact details' }).getByRole('group', { name, exact: true })

// This spec's own synthetic client address (RFC 5737): the request form allows 5 per network an hour.
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.236' } })

test.describe('phone verification opt-in on the receipt (TSK-0134)', () => {
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[OWN-DEC-178][OWN-DEC-190][HH-INT-13][ENT-ConsentPreference] the unchecked box and its disclosure; no code before the consent; then the phone is verified by text', async ({
    page,
  }) => {
    const reference = await sendRequest(page, 'phone-opt-in-e2e@example.test', '(502) 555-0191')
    const phoneRow = channelGroup(page, 'Phone')
    const box = phoneRow.getByRole('checkbox', { name: CODE_LABEL })
    await expect(box).toBeVisible()
    await expect(box).not.toBeChecked()
    await expect(phoneRow.getByText(DISCLOSURE)).toBeVisible()
    await expect(phoneRow.getByRole('link', { name: /^Privacy Policy/ })).toHaveAttribute('href', '/privacy')
    await expect(phoneRow.getByRole('link', { name: /^SMS Terms/ })).toHaveAttribute('href', '/sms-terms')
    await expect(phoneRow.getByRole('link', { name: /^Website Terms/ })).toHaveAttribute('href', '/terms')
    await expect(phoneRow).toContainText('you can verify your email instead')
    await axe(page)

    // Without the box: nothing is recorded and no code is sent.
    await phoneRow.getByRole('button', { name: 'Text me a code' }).click()
    await expect(
      phoneRow.getByText('Check the box to agree before we text you a code, or verify your email instead.'),
    ).toBeVisible()
    let rows = await recordsOf(reference)
    expect(rows.consents).toEqual([])
    expect(rows.codes).toEqual([])
    await axe(page)

    // With the box: the consent is recorded first, then the code goes.
    await box.check()
    await phoneRow.getByRole('button', { name: 'Text me a code' }).click()
    await expect(phoneRow.getByText('We sent a code to ***0191. It expires in 10 minutes.')).toBeVisible()
    await expect(
      phoneRow.getByText('You agreed to receive a one-time verification code by text at this number.'),
    ).toBeVisible()
    rows = await recordsOf(reference)
    expect(rows.consents.map((c) => [c.purpose, c.granted, c.source, c.disclosure_version])).toEqual([
      ['sms_verification', true, 'receipt', 'sms-verification-disclosure-1'],
    ])
    expect(rows.consents[0]?.evidence).toMatchObject({ requestId: rows.requestId, reference })
    expect(rows.codes).toHaveLength(1)
    await phoneRow.getByLabel('Code').fill(codeFor(rows.codes[0] as { id: string; nonce: string }))
    await phoneRow.getByRole('button', { name: 'Verify' }).click()
    await expect(phoneRow.getByText('Your phone is verified.')).toBeVisible()
    await expect(phoneRow.getByText('Verified', { exact: true })).toBeVisible()
    await expect(channelGroup(page, 'Email').getByText('Not verified')).toBeVisible()
    await axe(page)
  })

  test('[OWN-DEC-178][HH-INT-13] leaving the box unchecked never blocks: the email is verified instead and nothing is recorded for the phone', async ({
    page,
  }) => {
    const reference = await sendRequest(page, 'phone-declined-e2e@example.test', '(502) 555-0192')
    const emailRow = channelGroup(page, 'Email')
    await emailRow.getByRole('button', { name: 'Email me a code' }).click()
    await expect(emailRow.getByText('Code sent')).toBeVisible()
    const code = await withDb(async (db) => {
      const r = await db
        .selectFrom('intake.requests')
        .select('contact_id')
        .where('reference', '=', reference)
        .executeTakeFirstOrThrow()
      const row = await db
        .selectFrom('identity.verification_codes')
        .select(['id', 'nonce'])
        .where('subject_ref', '=', `contact:${r.contact_id}:email`)
        .orderBy('created_at', 'desc')
        .limit(1)
        .executeTakeFirstOrThrow()
      return codeFor(row)
    })
    await emailRow.getByLabel('Code').fill(code)
    await emailRow.getByRole('button', { name: 'Verify' }).click()
    await expect(emailRow.getByText('Your email is verified.')).toBeVisible()
    const phoneRow = channelGroup(page, 'Phone')
    await expect(phoneRow.getByText('Not verified')).toBeVisible()
    await expect(phoneRow.getByRole('checkbox', { name: CODE_LABEL })).not.toBeChecked()
    const rows = await recordsOf(reference)
    expect(rows.consents).toEqual([])
    expect(rows.codes).toEqual([])
  })
})
