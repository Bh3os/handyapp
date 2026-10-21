// Contact verification and the optional account offer on the receipt, in a real browser (TSK-0033; HH-INT-13,
// HH-ID-03, HH-INT-14, HH-ID-06, HH-INT-22, T16, T18, T20). The code a test enters is read back from the database and
// derived with the e2e servers' synthetic code key (codes.ts); every visitor, address and number is synthetic
// (RULE-SYNTHETIC-DATA).
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type Page } from '@playwright/test'
import { codeFor } from '../codes.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
const SMS_LABEL = 'I agree to receive HandyHub Service Texts at the phone number above.'

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

/** Sends a request through the wizard and waits for its receipt; returns the reference. */
async function sendRequest(page: Page, email: string, phone: string, texts: boolean): Promise<string> {
  await page.goto('/request')
  await page.evaluate(() => window.localStorage.clear())
  await page.goto('/request')
  await page.getByRole('button', { name: 'Continue as Guest' }).click()
  await page.getByLabel('Not sure what service I need').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Project description').fill('Synthetic verification project: a sticking closet door.')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Street address').fill('300 Synthetic Court')
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
  if (texts) await page.getByLabel(SMS_LABEL).check()
  await page.getByLabel('Let HandyHub decide').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { name: 'Step 5 of 5: Review and send' })).toBeVisible()
  await page.getByRole('button', { name: 'Send Estimate Request' }).click()
  await expect(page.getByRole('heading', { name: 'Your request is in.' })).toBeFocused()
  return new URL(page.url()).pathname.replace('/request/received/', '')
}

/** The request's contact and the code last sent to it on a channel, derived from the stored row. */
async function lastCode(reference: string, channel: 'email' | 'phone'): Promise<string> {
  const row = await withDb(async (db) => {
    const r = await db
      .selectFrom('intake.requests')
      .select('contact_id')
      .where('reference', '=', reference)
      .executeTakeFirstOrThrow()
    return db
      .selectFrom('identity.verification_codes')
      .select(['id', 'nonce'])
      .where('subject_ref', '=', `contact:${r.contact_id}:${channel}`)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirstOrThrow()
  })
  return codeFor(row)
}
const wrong = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, '0')
const channelGroup = (page: Page, name: 'Email' | 'Phone') =>
  page.getByRole('region', { name: 'Verify your contact details' }).getByRole('group', { name })

// This spec's own synthetic client address (RFC 5737): the request form allows 5 per network an hour, and this spec
// sends four requests.
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.29' } })

test.describe('contact verification on the receipt (TSK-0033)', () => {
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-INT-13][T16][HH-ID-03][HH-INT-14][T20] an existing customer’s email reveals nothing; it is verified on its own, and declining the account offer changes nothing', async ({
    page,
  }) => {
    const email = 'existing-e2e@example.test'
    // An existing customer: an earlier request with this email, verified through the receipt API.
    const earlier = await page.request.post('/api/v1/public/requests', {
      headers: { 'idempotency-key': 'e2e-verify-earlier-0001' },
      data: {
        formVersion: 'e2e-1',
        privacyNoticeVersion: 'privacy-notice-1',
        services: [],
        notSure: true,
        description: 'Synthetic earlier project.',
        property: { street: '1 Earlier Road', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
        timing: { flexible: true, needHelpToday: false, windows: ['any_time'] },
        estimatePreference: 'let_handyhub_decide',
        contact: { fullName: 'Earlier Customer', email, phone: '(502) 555-0181', preferredChannel: 'email' },
        smsOptIn: false,
        marketingOptIn: false,
      },
    })
    expect(earlier.status()).toBe(201)
    const earlierRef = ((await earlier.json()) as { reference: string }).reference
    const earlierCap = earlier.headers()['receipt-capability'] as string
    const capHeaders = { 'receipt-capability': earlierCap }
    expect(
      (
        await page.request.post('/api/v1/public/request-receipt/contact/codes', {
          headers: capHeaders,
          data: { channel: 'email' },
        })
      ).status(),
    ).toBe(202)
    expect(
      (
        await page.request.post('/api/v1/public/request-receipt/contact/verify', {
          headers: capHeaders,
          data: { channel: 'email', code: await lastCode(earlierRef, 'email') },
        })
      ).status(),
    ).toBe(200)
    const earlierBefore = await withDb((db) =>
      db
        .selectFrom('intake.requests')
        .innerJoin('crm.contacts', 'crm.contacts.id', 'intake.requests.contact_id')
        .select(['intake.requests.customer_id', 'crm.contacts.email_verification', 'crm.contacts.version'])
        .where('intake.requests.reference', '=', earlierRef)
        .executeTakeFirstOrThrow(),
    )

    // The same email on a new request in the browser: the receipt shows only this request's own contact.
    let statusReads = 0
    page.on('request', (r) => {
      if (r.method() === 'GET' && new URL(r.url()).pathname === '/api/v1/public/request-receipt/contact') statusReads++
    })
    const reference = await sendRequest(page, email, '(502) 555-0182', false)
    const panel = page.getByRole('region', { name: 'Verify your contact details' })
    const emailRow = channelGroup(page, 'Email')
    await expect(emailRow.getByText('e***@example.test')).toBeVisible()
    await expect(emailRow.getByText('Not verified')).toBeVisible()
    await expect(channelGroup(page, 'Phone').getByText('***0182')).toBeVisible()
    await expect(page.locator('main')).not.toContainText(
      new RegExp(`${earlierRef}|Earlier|already have|welcome back|earlier project|previous`, 'i'),
    )
    // Without the SMS opt-in the phone is not texted; the page says why.
    await expect(channelGroup(page, 'Phone')).toContainText('We verify phone numbers by text message only.')
    await expect(channelGroup(page, 'Phone').getByRole('button')).toHaveCount(0)
    // No account offer before a contact is verified.
    await expect(page.getByRole('region', { name: 'Keep your project history' })).toHaveCount(0)
    await axe(page)
    // The status is read once when the receipt opens, never polled (a second read would need a reason).
    await page.waitForTimeout(1000)
    expect(statusReads).toBe(1)

    await emailRow.getByRole('button', { name: 'Email me a code' }).click()
    await expect(emailRow.getByText('We sent a code to e***@example.test. It expires in 10 minutes.')).toBeVisible()
    await expect(emailRow.getByText('Code sent')).toBeVisible()
    await expect(emailRow.getByLabel('Code')).toBeFocused()
    const code = await lastCode(reference, 'email')
    await emailRow.getByLabel('Code').fill(wrong(code))
    await emailRow.getByRole('button', { name: 'Verify' }).click()
    await expect(
      emailRow.getByText("That code didn't work. Check it and try again, or ask for a new code."),
    ).toBeVisible()
    await emailRow.getByLabel('Code').fill(code)
    await emailRow.getByRole('button', { name: 'Verify' }).click()
    await expect(emailRow.getByText('Your email is verified.')).toBeVisible()
    await expect(emailRow.getByText('Verified', { exact: true })).toBeVisible()
    await expect(channelGroup(page, 'Phone').getByText('Not verified')).toBeVisible()
    await expect(panel).not.toContainText(new RegExp(earlierRef))

    // The optional account offer: Create an Account is not available yet; No thanks changes nothing.
    const offer = page.getByRole('region', { name: 'Keep your project history' })
    await expect(offer).toBeVisible()
    await expect(offer.getByRole('button', { name: 'Create an Account' })).toBeDisabled()
    await expect(offer.getByText('Accounts are not available yet.')).toBeVisible()
    await axe(page)
    const before = await withDb((db) =>
      db
        .selectFrom('intake.requests')
        .innerJoin('crm.contacts', 'crm.contacts.id', 'intake.requests.contact_id')
        .innerJoin('crm.projects', 'crm.projects.id', 'intake.requests.project_id')
        .select([
          'intake.requests.id',
          'intake.requests.customer_id',
          'intake.requests.state',
          'crm.contacts.email_verification',
          'crm.contacts.phone_verification',
          'crm.contacts.version',
          'crm.projects.id as project_id',
        ])
        .where('intake.requests.reference', '=', reference)
        .executeTakeFirstOrThrow(),
    )
    await offer.getByRole('button', { name: 'No thanks' }).click()
    await expect(page.getByText('No account needed. Nothing changes for your request.')).toBeVisible()
    await expect(offer).toHaveCount(0)
    const after = await withDb((db) =>
      db
        .selectFrom('intake.requests')
        .innerJoin('crm.contacts', 'crm.contacts.id', 'intake.requests.contact_id')
        .innerJoin('crm.projects', 'crm.projects.id', 'intake.requests.project_id')
        .select([
          'intake.requests.id',
          'intake.requests.customer_id',
          'intake.requests.state',
          'crm.contacts.email_verification',
          'crm.contacts.phone_verification',
          'crm.contacts.version',
          'crm.projects.id as project_id',
        ])
        .where('intake.requests.reference', '=', reference)
        .executeTakeFirstOrThrow(),
    )
    expect(after).toEqual(before)
    // A reload of this tab keeps the verified state and the answer; the receipt is otherwise unchanged.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Your request is in.' })).toBeFocused()
    await expect(channelGroup(page, 'Email').getByText('Verified', { exact: true })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Keep your project history' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Return Home' })).toHaveAttribute('href', '/')

    // Nothing linked: the new request has its own customer, and the earlier one is exactly as it was.
    expect(after.customer_id).not.toBe(earlierBefore.customer_id)
    const earlierAfter = await withDb((db) =>
      db
        .selectFrom('intake.requests')
        .innerJoin('crm.contacts', 'crm.contacts.id', 'intake.requests.contact_id')
        .select(['intake.requests.customer_id', 'crm.contacts.email_verification', 'crm.contacts.version'])
        .where('intake.requests.reference', '=', earlierRef)
        .executeTakeFirstOrThrow(),
    )
    expect(earlierAfter).toEqual(earlierBefore)
  })

  test('[HH-INT-13][HH-INT-22] the phone is verified by text on its own; Change Contact verifies the new email before it applies', async ({
    page,
  }) => {
    const reference = await sendRequest(page, 'typo-e2e@exmaple.test', '(502) 555-0183', true)
    const phoneRow = channelGroup(page, 'Phone')
    await phoneRow.getByRole('button', { name: 'Text me a code' }).click()
    await expect(phoneRow.getByText('We sent a code to ***0183. It expires in 10 minutes.')).toBeVisible()
    await phoneRow.getByLabel('Code').fill(await lastCode(reference, 'phone'))
    await phoneRow.getByRole('button', { name: 'Verify' }).click()
    await expect(phoneRow.getByText('Your phone is verified.')).toBeVisible()
    await expect(channelGroup(page, 'Email').getByText('Not verified')).toBeVisible()

    const emailRow = channelGroup(page, 'Email')
    await emailRow.getByRole('button', { name: 'Change Contact' }).click()
    await emailRow.getByLabel('New email address').fill('fixed-e2e@example.test')
    await expect(
      emailRow.getByText("We'll send a code to the new address. Your email changes only after you enter it."),
    ).toBeVisible()
    await axe(page)
    await emailRow.getByRole('button', { name: 'Send code' }).click()
    await expect(
      emailRow.getByText('We sent a code to f***@example.test. Your email changes only after you enter it.'),
    ).toBeVisible()
    // Still the old address until the code is entered.
    await expect(emailRow.getByText('t***@exmaple.test')).toBeVisible()
    await emailRow.getByLabel('Code').fill(await lastCode(reference, 'email'))
    await emailRow.getByRole('button', { name: 'Verify' }).click()
    await expect(emailRow.getByText('Your email is changed and verified.')).toBeVisible()
    await expect(emailRow.getByText('f***@example.test')).toBeVisible()
    const contact = await withDb((db) =>
      db
        .selectFrom('intake.requests')
        .innerJoin('crm.contacts', 'crm.contacts.id', 'intake.requests.contact_id')
        .select(['crm.contacts.email', 'crm.contacts.email_verification', 'crm.contacts.phone_verification'])
        .where('intake.requests.reference', '=', reference)
        .executeTakeFirstOrThrow(),
    )
    expect(contact).toEqual({
      email: 'fixed-e2e@example.test',
      email_verification: 'verified',
      phone_verification: 'verified',
    })
  })

  test('[T18][HH-ID-06] a code entered after it expired fails safely; Resend waits for the cooldown and a new code works', async ({
    page,
  }) => {
    const reference = await sendRequest(page, 'late-e2e@example.test', '(502) 555-0184', false)
    const emailRow = channelGroup(page, 'Email')
    await emailRow.getByRole('button', { name: 'Email me a code' }).click()
    await expect(emailRow.getByText('Code sent')).toBeVisible()
    const code = await lastCode(reference, 'email')
    // Resend right away: the cooldown answers how long to wait.
    await emailRow.getByRole('button', { name: 'Resend' }).click()
    await expect(emailRow.getByText(/^Please wait \d+ seconds? before asking for another code\.$/)).toBeVisible()
    // The code's 10 minutes pass.
    await withDb(async (db) => {
      const r = await db
        .selectFrom('intake.requests')
        .select('contact_id')
        .where('reference', '=', reference)
        .executeTakeFirstOrThrow()
      await db
        .updateTable('identity.verification_codes')
        .set({ created_at: new Date(Date.now() - 11 * 60_000), expires_at: new Date(Date.now() - 60_000) })
        .where('subject_ref', '=', `contact:${r.contact_id}:email`)
        .execute()
    })
    await emailRow.getByLabel('Code').fill(code)
    await emailRow.getByRole('button', { name: 'Verify' }).click()
    await expect(emailRow.getByText('Code expired')).toBeVisible()
    await expect(emailRow.getByText("That code can't be used anymore. Ask for a new code.")).toBeVisible()
    await expect(page.locator('main')).not.toContainText(/Synthetic Court.*HH-|\$/)
    await axe(page)
    await emailRow.getByRole('button', { name: 'Send a new code' }).click()
    await expect(emailRow.getByText('Code sent')).toBeVisible()
    await emailRow.getByLabel('Code').fill(await lastCode(reference, 'email'))
    await emailRow.getByRole('button', { name: 'Verify' }).click()
    await expect(emailRow.getByText('Your email is verified.')).toBeVisible()
  })
})
