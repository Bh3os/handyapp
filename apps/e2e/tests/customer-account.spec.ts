// Optional customer accounts with passwordless sign-in, in a real browser (TSK-0036; HH-ID-10, HH-ID-11, HH-ID-03,
// HH-INT-14, HH-INT-01, T20, T22). The codes a test enters are read back from the database and derived with the e2e
// servers' synthetic code key (codes.ts); every visitor, address and number is synthetic (RULE-SYNTHETIC-DATA).
// The notice to the old email after a sign-in email change has no owner decision yet (OQ-ACCOUNT-CONTACT-NOTICE); the
// change test makes that decision in this e2e database only (a synthetic template and a new version of the automatic
// list) and restores the list afterwards.
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type Page } from '@playwright/test'
import { codeFor } from '../codes.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
// This spec's own synthetic client address (RFC 5737), so its limits never meet another spec's.
const HEADERS = { 'x-forwarded-for': '198.51.100.136' }
test.use({ extraHTTPHeaders: HEADERS })

const SENT = /^If these details belong to a HandyHub account, we sent a code to them\./

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
async function sendRequest(page: Page, email: string): Promise<string> {
  await page.goto('/request')
  await page.evaluate(() => window.localStorage.clear())
  await page.goto('/request')
  await page.getByRole('button', { name: 'Continue as Guest' }).click()
  await page.getByLabel('Not sure what service I need').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Project description').fill('Synthetic account project: a wobbly handrail.')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Street address').fill('136 Synthetic Court')
  await page.getByLabel('City').fill('Testville')
  await page.getByLabel('State').fill('KY')
  await page.getByLabel('ZIP').fill('40000')
  await page.getByLabel('House', { exact: true }).check()
  await page.getByLabel('Preferred date').fill(future)
  await page.getByLabel('Mornings').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Full name').fill('Test Customer')
  await page.getByRole('textbox', { name: /^Email/ }).fill(email)
  await page.getByRole('textbox', { name: /^Phone/ }).fill('(502) 555-0136')
  await page.getByLabel('Phone call', { exact: true }).check()
  await page.getByLabel('Let HandyHub decide').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Send Estimate Request' }).click()
  await expect(page.getByRole('heading', { name: 'Your request is in.' })).toBeFocused()
  return new URL(page.url()).pathname.replace('/request/received/', '')
}

/** The code last sent for a subject (or, for an account code, to a destination), derived from the stored row. */
async function codeOf(where: { subject: string } | { destination: string }) {
  const row = await withDb((db) => {
    let q = db.selectFrom('identity.verification_codes').select(['id', 'nonce'])
    q =
      'subject' in where
        ? q.where('subject_ref', '=', where.subject)
        : q.where('purpose', '=', 'account_sign_in').where('destination', '=', where.destination)
    return q.orderBy('created_at', 'desc').limit(1).executeTakeFirstOrThrow()
  })
  return codeFor(row)
}
const accountCode = (destination: string) => codeOf({ destination })
const requestOf = (reference: string) =>
  withDb((db) =>
    db
      .selectFrom('intake.requests')
      .select(['id', 'contact_id', 'project_id'])
      .where('reference', '=', reference)
      .executeTakeFirstOrThrow(),
  )
/** Lets the resend cooldown pass for a destination by moving its codes back in time (they keep their expiry). */
const afterCooldown = (destination: string) =>
  withDb(async (db) => {
    const rows = await db
      .selectFrom('identity.verification_codes')
      .select(['id', 'created_at'])
      .where('destination', '=', destination)
      .execute()
    for (const r of rows)
      await db
        .updateTable('identity.verification_codes')
        .set({ created_at: new Date(r.created_at.getTime() - 120_000) })
        .where('id', '=', r.id)
        .execute()
  })
const codesTo = (destination: string) =>
  withDb(async (db) =>
    Number(
      (
        await db
          .selectFrom('identity.verification_codes')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('destination', '=', destination)
          .executeTakeFirstOrThrow()
      ).n,
    ),
  )

/** Verifies the receipt's email with its code. */
async function verifyEmail(page: Page, reference: string) {
  const row = page.getByRole('region', { name: 'Verify your contact details' }).getByRole('group', { name: 'Email' })
  await row.getByRole('button', { name: 'Email me a code' }).click()
  await expect(row.getByLabel('Code')).toBeFocused()
  const { contact_id } = await requestOf(reference)
  await row.getByLabel('Code').fill(await codeOf({ subject: `contact:${contact_id}:email` }))
  await row.getByRole('button', { name: 'Verify' }).click()
  await expect(row.getByText('Your email is verified.')).toBeVisible()
}

/** Create an Account in the receipt's offer, with the code sent to the verified email. */
async function createAccount(page: Page, email: string) {
  const offer = page.getByRole('region', { name: 'Keep your project history' })
  await offer.getByRole('button', { name: 'Create an Account' }).click()
  await expect(offer.getByText(/Your account is created only after you enter it\.$/)).toBeVisible()
  await offer.getByRole('button', { name: 'Email me a code' }).click()
  await expect(offer.getByLabel('Code')).toBeFocused()
  await offer.getByLabel('Code').fill(await accountCode(email))
  await offer.getByRole('button', { name: 'Create my account' }).click()
  await expect(offer.getByText('Your account is ready, and this project is in it.')).toBeVisible()
}

/** Signs in on /account with the code sent to the email. */
async function signIn(page: Page, email: string) {
  await afterCooldown(email)
  await page.goto('/account')
  const form = page.getByRole('region', { name: 'Sign in' })
  await form.getByLabel('Email or mobile phone').fill(email)
  await form.getByRole('button', { name: 'Send me a code' }).click()
  await expect(form.getByText(SENT)).toBeVisible()
  await form.getByLabel('Code').fill(await accountCode(email))
  await form.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeFocused()
}

const accountRows = (email: string) =>
  withDb((db) =>
    db
      .selectFrom('identity.customer_accounts as a')
      .leftJoin('identity.customer_identity_links as l', 'l.account_id', 'a.id')
      .select(['a.id', 'l.project_id', 'l.state'])
      .where('a.sign_in_email', '=', email)
      .execute(),
  )
const requestCount = () =>
  withDb(async (db) =>
    Number(
      (
        await db
          .selectFrom('intake.requests')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .executeTakeFirstOrThrow()
      ).n,
    ),
  )

test.describe('optional customer accounts (TSK-0036)', () => {
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-INT-01][OWN-DEC-87] the entry choice offers Create an Account and Sign in; Sign in opens the account page', async ({
    page,
  }) => {
    await page.goto('/request')
    await page.evaluate(() => window.localStorage.clear())
    await page.goto('/request')
    const dialog = page.getByRole('dialog', { name: 'How would you like to continue?' })
    await dialog.getByRole('button', { name: 'Create an Account' }).click()
    await expect(page.getByRole('heading', { name: 'Step 1 of 5: Services' })).toBeFocused()
    await expect(page.getByText(/^Send your request first\. On the receipt, verify your email or phone/)).toBeVisible()
    await page.goto('/request')
    await page.getByRole('link', { name: 'Already have an account? Sign in' }).click()
    await expect(page).toHaveURL(/\/account$/)
    await expect(page.getByRole('heading', { level: 2, name: 'Sign in', exact: true })).toBeVisible()
    const res = await page.request.get('/account')
    expect(res.headers()['cache-control']).toBe('no-store')
    await axe(page)
  })

  test('[T20][HH-INT-14][HH-ID-10][HH-ID-03] Create an Account on the receipt links this one project once; doing it again duplicates nothing', async ({
    page,
  }) => {
    const email = 'account-e2e@example.test'
    const reference = await sendRequest(page, email)
    const before = await requestCount()
    await verifyEmail(page, reference)
    await axe(page)
    await createAccount(page, email)
    await axe(page)
    const { project_id } = await requestOf(reference)
    expect(await accountRows(email)).toEqual([{ id: expect.any(String), project_id, state: 'active' }])

    // The account page lists the one project and opens it.
    await page.getByRole('link', { name: 'Go to your account' }).click()
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeFocused()
    await expect(page.getByText('a***@example.test')).toBeVisible()
    await page.getByRole('button', { name: `View ${reference}` }).click()
    await expect(page.getByRole('heading', { level: 3, name: 'Your project', exact: true })).toBeFocused()
    await expect(page.getByText(`Request reference: ${reference}`)).toBeVisible()
    await axe(page)

    // Creating the account again from the same receipt signs in to the same account; nothing is duplicated.
    await page.goBack()
    await page.reload()
    await afterCooldown(email)
    await createAccount(page, email)
    const rows = await accountRows(email)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.project_id).toBe(project_id)
    expect(await requestCount()).toBe(before)
  })

  test('[HH-ID-10][HH-ID-03][HH-ID-11] sign-in says the same for an unknown email; Sign Out ends the session', async ({
    page,
  }) => {
    await page.goto('/account')
    const form = page.getByRole('region', { name: 'Sign in' })
    await form.getByLabel('Email or mobile phone').fill('account-nobody-e2e@example.test')
    await form.getByRole('button', { name: 'Send me a code' }).click()
    await expect(form.getByText(SENT)).toBeVisible()
    await form.getByLabel('Code').fill('123456')
    await form.getByRole('button', { name: 'Sign in' }).click()
    await expect(form.getByText("That code didn't work. Check it and try again, or ask for a new code.")).toBeVisible()
    expect(await codesTo('account-nobody-e2e@example.test')).toBe(0)
    await axe(page)

    await signIn(page, 'account-e2e@example.test')
    await page.getByRole('button', { name: 'Sign Out', exact: true }).click()
    await expect(page.getByText("You're signed out.")).toBeVisible()
    await page.reload()
    await expect(page.getByRole('heading', { level: 2, name: 'Sign in', exact: true })).toBeVisible()
    expect((await page.request.get('/api/v1/customer/account')).status()).toBe(401)
  })

  test('[HH-ID-11][T22] texts cannot be used while live texts are off; Sign out everywhere ends every session at once', async ({
    page,
    browser,
  }) => {
    // Its own account, so the per-address code limit of the other tests' address is never reached.
    const email = 'account-everywhere-e2e@example.test'
    // TSK-0149 (OWN-DEC-198 F4): live texts are off in this database (until A2P 10DLC), so every phone gets the same
    // words, and the page offers asking HandyHub for help to every visitor.
    await page.goto('/account')
    const form = page.getByRole('region', { name: 'Sign in' })
    await form.getByLabel('Email or mobile phone').fill('(502) 555-0136')
    await form.getByRole('button', { name: 'Send me a code' }).click()
    await expect(form.getByText("Texts can't be used right now. Use your email instead.")).toBeVisible()
    await expect(page.getByRole('region', { name: "Still can't get in? Ask HandyHub for help" })).toBeVisible()
    await axe(page)

    // OWN-DEC-198 F2: two browsers signed in to the same account stay independent until Sign out everywhere.
    const otherContext = await browser.newContext({ extraHTTPHeaders: HEADERS })
    const other = await otherContext.newPage()
    try {
      // This browser creates the account on its receipt; another browser signs in to it.
      const reference = await sendRequest(page, email)
      await verifyEmail(page, reference)
      await createAccount(page, email)
      await signIn(other, email)
      await page.goto('/account')
      await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()
      const everywhere = page.getByRole('region', { name: 'Sign out everywhere' })
      await expect(everywhere).toBeVisible()
      await axe(page)
      await everywhere.getByRole('button', { name: 'Sign out everywhere' }).click()
      await expect(page.getByText("You're signed out on every device.")).toBeVisible()
      await other.reload()
      await expect(other.getByRole('heading', { level: 2, name: 'Sign in', exact: true })).toBeVisible()
      expect((await page.request.get('/api/v1/customer/account')).status()).toBe(401)
      expect((await other.request.get('/api/v1/customer/account')).status()).toBe(401)
    } finally {
      await otherContext.close()
    }
  })

  test.describe('the sign-in email change (HH-ID-11, T22)', () => {
    test('[T22][HH-ID-11] a fresh sign-in and a code to the new email change it; the other browser is signed out and the old email no longer signs in', async ({
      page,
      browser,
    }) => {
      const email = 'account-change-e2e@example.test'
      const next = 'account-moved-e2e@example.test'
      // TSK-0120: the owner's account_email_changed wording is wired (OWN-DEC-151), so the change is available as
      // configured; nothing is released or listed for this spec.
      const otherContext = await browser.newContext({ extraHTTPHeaders: HEADERS })
      const other = await otherContext.newPage()
      try {
        // This browser creates the account on its receipt (a fresh verification); another browser signs in to it.
        const reference = await sendRequest(page, email)
        await verifyEmail(page, reference)
        await createAccount(page, email)
        await signIn(other, email)
        await page.goto('/account')
        await expect(page.getByRole('heading', { name: 'Your account' })).toBeFocused()

        const change = page.getByRole('region', { name: 'Change your sign-in email' })
        await change.getByRole('button', { name: 'Change email' }).click()
        await change.getByLabel('New email address').fill(next)
        await change.getByRole('button', { name: 'Send code' }).click()
        await expect(change.getByText(/^We sent a code to a\*\*\*@example\.test\./)).toBeVisible()
        await expect(change.getByLabel('Code')).toBeFocused()
        await change.getByLabel('Code').fill(await accountCode(next))
        await change.getByRole('button', { name: 'Change my email' }).click()
        await expect(
          page.getByText("Your sign-in email is changed. You're signed out on your other devices."),
        ).toBeVisible()
        await axe(page)

        // The other browser's session ended on the server.
        await other.reload()
        await expect(other.getByRole('heading', { level: 2, name: 'Sign in', exact: true })).toBeVisible()
        // This browser's session was renewed and still works.
        await page.reload()
        await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible()

        // The old email signs in to nothing: the same neutral answer, and no code is issued for it.
        const before = await codesTo(email)
        const asked = await other.request.post('/api/v1/public/account/sign-in/codes', { data: { contact: email } })
        expect(asked.status()).toBe(202)
        expect(await codesTo(email)).toBe(before)
        const ended = await withDb((db) =>
          db
            .selectFrom('identity.customer_sessions as s')
            .innerJoin('identity.customer_accounts as a', 'a.id', 's.account_id')
            .select('s.revoke_reason')
            .where('a.sign_in_email', '=', next)
            .where('s.revoke_reason', '=', 'contact_changed')
            .execute(),
        )
        expect(ended.length).toBeGreaterThanOrEqual(1)

        // TSK-0120 (MESSAGE 21, scenario I): the notice to the old and to the new address, once each, handed to the
        // ci test provider (never shown as delivered).
        await expect
          .poll(
            () =>
              withDb((db) =>
                db
                  .selectFrom('platform.message_deliveries')
                  .select(['destination', 'state', 'provider'])
                  .where('message_key', '=', 'account.contact_changed')
                  .where('destination', 'in', [email, next])
                  .orderBy('destination')
                  .execute(),
              ),
            { timeout: 15_000 },
          )
          .toEqual([email, next].sort().map((destination) => ({ destination, state: 'queued', provider: 'fake' })))
      } finally {
        await otherContext.close()
      }
    })
  })
})
