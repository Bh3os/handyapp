// Saved properties, preferences and Request This Service Again in a real browser (TSK-0113; HH-ID-12, HH-ID-03,
// HH-COM-05, T20, OWN-DEC-113). A guest sends a request for one service through the wizard, verifies the email and
// creates an account on the receipt. A second request with the same email that was never verified stays out of the
// account's history: it is not on the dashboard and Request This Service Again cannot start from it. From the dashboard
// the customer sets the contact method new requests start with, stops follow-ups after a job, names the property of
// their project, and requests the service again: the form starts from the service, the address and the contact,
// asks them to confirm the address is still current, and the new request is linked to the earlier project. The codes
// are read back from the database and derived with the e2e servers' synthetic code key (codes.ts). Every visitor,
// address and name is synthetic (RULE-SYNTHETIC-DATA).
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { codeFor } from '../codes.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
// This spec's own synthetic client address (RFC 5737), so its limits never meet another spec's.
const HEADERS = { 'x-forwarded-for': '198.51.100.113' }
test.use({ extraHTTPHeaders: HEADERS })

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-customer-saved-properties' })
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

const latestCode = async (where: { subject?: string; purpose?: string; destination?: string }) =>
  codeFor(
    await withDb((db) => {
      let q = db.selectFrom('identity.verification_codes').select(['id', 'nonce'])
      if (where.subject) q = q.where('subject_ref', '=', where.subject)
      if (where.purpose) q = q.where('purpose', '=', where.purpose)
      if (where.destination) q = q.where('destination', '=', where.destination)
      return q.orderBy('created_at', 'desc').limit(1).executeTakeFirstOrThrow()
    }),
  )
const requestOf = (reference: string) =>
  withDb((db) =>
    db
      .selectFrom('intake.requests')
      .select(['id', 'contact_id', 'project_id'])
      .where('reference', '=', reference)
      .executeTakeFirstOrThrow(),
  )

/** A request with the account's email that is never verified (sent through the API from a network of its own). */
async function unverifiedRequest(request: APIRequestContext, email: string): Promise<string> {
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'x-forwarded-for': '198.51.100.213', 'idempotency-key': `synthetic-e2e-saved-${Date.now()}-0001` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic saved-properties project that was never verified.',
      property: {
        street: '9 Unverified Synthetic Road',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: { fullName: 'Test Saved Customer', email, phone: '(502) 555-0113', preferredChannel: 'email' },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { reference: string }).reference
}

test.describe('saved properties, preferences and Request This Service Again (TSK-0113)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-ID-12][HH-ID-03][T20][OWN-DEC-113] a repeat request is prefilled from the account’s verified history and linked to it', async ({
    page,
    request,
  }) => {
    const email = 'saved-properties-e2e@example.test'
    // The first request, for one service, through the wizard.
    await page.goto('/request')
    await page.evaluate(() => window.localStorage.clear())
    await page.goto('/request?service=SVC-DW-01')
    await page.getByRole('button', { name: 'Continue as Guest' }).click()
    await expect(page.getByRole('checkbox', { name: 'Patching & Repair' })).toBeChecked()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Project description').fill('Synthetic saved-properties project: a cracked hallway wall.')
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Street address').fill('113 Synthetic Lane')
    await page.getByLabel('City').fill('Testville')
    await page.getByLabel('State').fill('KY')
    await page.getByLabel('ZIP').fill('40000')
    await page.getByLabel('House', { exact: true }).check()
    await page.getByLabel('Preferred date').fill(future)
    await page.getByLabel('Mornings').check()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Full name').fill('Test Saved Customer')
    await page.getByRole('textbox', { name: /^Email/ }).fill(email)
    await page.getByRole('textbox', { name: /^Phone/ }).fill('(502) 555-0113')
    await page.getByLabel('Email', { exact: true }).check()
    await page.getByLabel('Let HandyHub decide').check()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Send Estimate Request' }).click()
    await expect(page.getByRole('heading', { name: 'Your request is in.' })).toBeFocused()
    const first = new URL(page.url()).pathname.replace('/request/received/', '')
    const firstRow = await requestOf(first)

    // The email verified and the account created on the receipt.
    const verify = page
      .getByRole('region', { name: 'Verify your contact details' })
      .getByRole('group', { name: 'Email' })
    await verify.getByRole('button', { name: 'Email me a code' }).click()
    await expect(verify.getByLabel('Code')).toBeFocused()
    await verify.getByLabel('Code').fill(await latestCode({ subject: `contact:${firstRow.contact_id}:email` }))
    await verify.getByRole('button', { name: 'Verify' }).click()
    await expect(verify.getByText('Your email is verified.')).toBeVisible()
    const offer = page.getByRole('region', { name: 'Keep your project history' })
    await offer.getByRole('button', { name: 'Create an Account' }).click()
    await offer.getByRole('button', { name: 'Email me a code' }).click()
    await expect(offer.getByLabel('Code')).toBeFocused()
    await offer.getByLabel('Code').fill(await latestCode({ purpose: 'account_sign_in', destination: email }))
    await offer.getByRole('button', { name: 'Create my account' }).click()
    await expect(offer.getByText('Your account is ready, and this project is in it.')).toBeVisible()
    const accountId = (
      await withDb((db) =>
        db
          .selectFrom('identity.customer_accounts')
          .select('id')
          .where('sign_in_email', '=', email)
          .executeTakeFirstOrThrow(),
      )
    ).id

    // A request with the account's own email, never verified: not in the account's history.
    const unverified = await unverifiedRequest(request, email)

    await page.goto('/portal/')
    const item = page.getByRole('listitem', { name: `Project ${first}` })
    await expect(item).toBeVisible()
    await expect(page.getByRole('listitem', { name: `Project ${unverified}` })).toHaveCount(0)
    await expect(item.getByRole('link', { name: `Request This Service Again: project ${first}` })).toHaveAttribute(
      'href',
      `/request?again=${first}`,
    )
    await axe(page)

    // History limited to verified links: the unverified project cannot be requested again.
    await page.goto(`/request?again=${unverified}`)
    await expect(
      page.getByText(
        "We couldn't load the details of that project. Sign in to your account and try again, or fill in the form yourself.",
      ),
    ).toBeVisible()
    await expect(page.getByLabel('Street address')).toHaveCount(0)

    // Preferences: the contact method new requests start with, and no follow-ups after a job.
    await page.goto('/portal/')
    await page.getByRole('navigation', { name: 'Your account' }).getByRole('link', { name: 'Preferences' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Preferences' })).toBeVisible()
    await page.getByLabel('Phone call').check()
    await page.getByRole('button', { name: 'Save contact preference' }).click()
    await expect(page.getByText('Your contact preference is saved.')).toBeVisible()
    const followUps = page.getByTestId('permission-email-follow_ups')
    await expect(followUps).toContainText(': On')
    await followUps.getByRole('button', { name: /^Stop follow-ups after a job/ }).click()
    await expect(followUps).toContainText(': Off')
    await axe(page)
    const consent = await withDb((db) =>
      db
        .selectFrom('platform.consent_records')
        .select(['purpose', 'granted', 'source'])
        .where('destination', '=', email)
        .where('source', '=', 'portal')
        .execute(),
    )
    expect(consent).toEqual([{ purpose: 'service_communication', granted: false, source: 'portal' }])

    // Saved properties: the address of the project gets a name.
    await page.getByRole('link', { name: 'Back to your projects' }).click()
    await page.getByRole('navigation', { name: 'Your account' }).getByRole('link', { name: 'Saved properties' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Saved properties' })).toBeVisible()
    const address = page.getByRole('listitem', { name: '113 Synthetic Lane, Testville, KY 40000' })
    await expect(address.getByText(`Latest project: ${first}`)).toBeVisible()
    await address.getByLabel('Name for this property').fill('Home')
    await address.getByRole('button', { name: 'Save property' }).click()
    await expect(page.getByText('Saved as Home.')).toBeVisible()
    const home = page.getByRole('region', { name: 'Your saved properties' }).getByRole('listitem', { name: 'Home' })
    await expect(home.getByRole('link', { name: 'Request a service at Home' })).toHaveAttribute(
      'href',
      /^\/request\?property=[0-9a-f-]{36}$/,
    )
    await axe(page)

    // Request This Service Again: the service, the address and the contact, confirmed as still current.
    await page.goto('/portal/')
    await page.getByRole('link', { name: `Request This Service Again: project ${first}` }).click()
    await expect(page).toHaveURL(new RegExp(`/request\\?again=${first}$`))
    await expect(page.getByRole('checkbox', { name: 'Patching & Repair' })).toBeChecked()
    await page.getByRole('button', { name: 'Next' }).click()
    // The description of the earlier job is not reused.
    await expect(page.getByLabel('Project description')).toHaveValue('')
    await page.getByLabel('Project description').fill('Synthetic: the same hallway wall cracked again.')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(
      page.getByText(
        `These details come from your project ${first}. Check that they are still current before you continue.`,
      ),
    ).toBeVisible()
    await expect(page.getByLabel('Street address')).toHaveValue('113 Synthetic Lane')
    await expect(page.getByLabel('ZIP')).toHaveValue('40000')
    await expect(page.getByLabel('House', { exact: true })).toBeChecked()
    await page.getByLabel('Preferred date').fill(future)
    await page.getByLabel('Mornings').check()
    // Not confirmed yet: the form says what to do and stays on the step.
    await page.getByRole('button', { name: 'Next' }).click()
    const summary = page.getByRole('alert')
    await expect(summary).toBeFocused()
    await expect(summary).toContainText('Confirm that the property details are still current, or correct them first.')
    await axe(page)
    await page.getByLabel('The property details above are still current.').check()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByLabel('Full name')).toHaveValue('Test Saved Customer')
    await expect(page.getByRole('textbox', { name: /^Email/ })).toHaveValue(email)
    await expect(page.getByLabel('Phone call', { exact: true })).toBeChecked()
    // No permission is carried over: both boxes start unchecked.
    await expect(page.getByLabel('Yes, HandyHub may send me marketing messages.')).not.toBeChecked()
    await page.getByLabel('Let HandyHub decide').check()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByText('Requested again from')).toBeVisible()
    await page.getByRole('button', { name: 'Send Estimate Request' }).click()
    await expect(page.getByRole('heading', { name: 'Your request is in.' })).toBeFocused()
    const repeat = new URL(page.url()).pathname.replace('/request/received/', '')
    expect(repeat).not.toBe(first)

    const link = await withDb((db) =>
      db
        .selectFrom('intake.request_repeats as x')
        .innerJoin('intake.requests as r', 'r.id', 'x.request_id')
        .select(['x.source_project_id', 'x.account_id', 'x.same_address', 'r.preferred_channel', 'r.marketing_opt_in'])
        .where('r.reference', '=', repeat)
        .executeTakeFirstOrThrow(),
    )
    expect(link).toEqual({
      source_project_id: firstRow.project_id,
      account_id: accountId,
      same_address: true,
      preferred_channel: 'call',
      marketing_opt_in: false,
    })
  })
})
