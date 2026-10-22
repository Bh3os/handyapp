// Staff replies and the portal Messages tab in real browsers (TSK-0050; HH-COM-08, HH-COM-09, HH-COM-02, C06, S06,
// HH-PORT-08, T66, OWN-DEC-120). A guest opens the project with the secure link and an emailed code (TSK-0034), which
// verifies the email; Office staff reply from the project in a browser of their own; the customer reads the reply in
// the portal's Messages tab. The e2e servers have no released reply wording, so the email is recorded truthfully as not
// sent (or, outside the contact hours, as waiting for the opening); the reply itself is on the project at once. Every
// visitor, address and account is synthetic (RULE-SYNTHETIC-DATA); nothing reaches a real provider.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'
import { passSecondFactor } from '../mfa.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
// This spec's own synthetic client address (RFC 5737): the request form allows 5 per network an hour.
const HEADERS = { 'x-forwarded-for': '198.51.100.150' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OFFICE = 'e2e-replies-office@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'replies', 'passphrase', '50'].join(' ')

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

/** A request sent through the API (the wizard has its own specs): its reference, request ID and link. */
async function sendRequest(request: APIRequestContext, email: string) {
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `synthetic-e2e-replies-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic replies project: a cracked ceiling patch.',
      property: {
        street: '50 Synthetic Reply Court',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
      estimatePreference: 'let_handyhub_decide',
      contact: { fullName: 'Replies E2E Customer', email, phone: '(502) 555-0150', preferredChannel: 'email' },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.status()).toBe(201)
  const reference = ((await res.json()) as { reference: string }).reference
  const row = await withDb((db) =>
    db
      .selectFrom('identity.project_access_grants as g')
      .innerJoin('intake.requests as r', 'r.id', 'g.request_id')
      .select(['g.id', 'g.nonce', 'r.id as request_id'])
      .where('r.reference', '=', reference)
      .executeTakeFirstOrThrow(),
  )
  return { reference, requestId: row.request_id, grantId: row.id, token: accessTokenFor(row) }
}

/** Opens the link, enters the emailed code (which verifies the email), and goes on to the project page. */
async function openProject(page: Page, link: { token: string; grantId: string; reference: string }) {
  await page.goto(`/access#${link.token}`)
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await expect(page.getByLabel('Code')).toBeFocused()
  const row = await withDb((db) =>
    db
      .selectFrom('identity.verification_codes')
      .select(['id', 'nonce'])
      .where('subject_ref', '=', `grant:${link.grantId}:email`)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirstOrThrow(),
  )
  await page.getByLabel('Code').fill(codeFor(row))
  await page.getByRole('button', { name: 'Open my project' }).click()
  await expect(page.getByRole('heading', { name: 'Your project', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Go to your project page' }).click()
  await expect(page.getByRole('heading', { level: 1, name: `Project ${link.reference}` })).toBeVisible()
}

/** Office staff of this spec's own, signed in through the staff app in a browser of its own. */
async function officeSession(browser: Browser) {
  const staffAccess = (...args: string[]) =>
    new URL(
      execFileSync(process.execPath, [cli, ...args], {
        env: { ...process.env, HANDYHUB_ENV: 'ci', DATABASE_URL: databaseUrl, PORT: port, HOST: '127.0.0.1' },
        encoding: 'utf8',
        stdio: 'pipe',
      }).split('\n')[0] as string,
    ).pathname
  // Added straight to the database: the first Owner is created by the staff sign-in spec (staff-auth), which must find
  // no Owner yet whatever order the specs run in.
  await withDb(async (db) => {
    const existing = await db
      .selectFrom('identity.staff_users')
      .select('id')
      .where('email', '=', OFFICE)
      .executeTakeFirst()
    if (existing) return
    const user = await db
      .insertInto('identity.staff_users')
      .values({ email: OFFICE, display_name: 'E2E Replies Office', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: 'office', issued_by: 'e2e:replies', reason: null })
      .execute()
  })
  const link = staffAccess('password-link', OFFICE)
  const context = await browser.newContext({ extraHTTPHeaders: HEADERS })
  const page = await context.newPage()
  await page.goto(link)
  await page.getByLabel('New password').fill(pw)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(OFFICE)
  await page.getByLabel('Password', { exact: true }).fill(pw)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // MFA is mandatory (TSK-0154): enrol on the account's first sign-in, the code afterwards.
  await passSecondFactor(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
  return { page, close: () => context.close() }
}

test.describe('staff replies and the portal Messages tab (TSK-0050, HH-COM-08, HH-COM-09)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-COM-08][HH-COM-09][HH-COM-02][T66][C06][HH-PORT-08] staff reply from the project; the customer sees it in Messages', async ({
    page,
    request,
    browser,
  }) => {
    const run = Date.now()
    // Free text carries the run in base 36: a 13-digit timestamp can pass the Luhn check and be refused as a card
    // number (sensitive_content), as the server must.
    const tag = run.toString(36)
    const email = `e2e-replies-${run}@example.test`
    const link = await sendRequest(request, email)
    await openProject(page, link)
    // Nothing written on the project yet: Messages says what will appear, never an invented message.
    await page.getByRole('tab', { name: 'Messages' }).click()
    const messages = page.getByRole('tabpanel')
    await expect(messages.getByText('No messages yet')).toBeVisible()

    const office = await officeSession(browser)
    try {
      const staff = office.page
      await staff.goto(`/staff/requests/${link.requestId}`)
      await staff.getByRole('link', { name: 'Open the project conversation' }).click()
      await expect(staff.getByRole('heading', { level: 1, name: `Conversation ${link.reference}` })).toBeVisible()
      await expect(
        staff.getByText('No messages on this project yet. Your reply starts the conversation.'),
      ).toBeVisible()
      const composer = staff.getByRole('region', { name: 'Reply to the customer' })
      // The emailed code verified the address: email is the customer's preferred permitted channel. Texts have no
      // opt-in, so they are not offered.
      await expect(composer.getByRole('radio', { name: new RegExp(`Email to ${email}`) })).toBeChecked()
      await expect(composer.getByRole('radio', { name: /Text to/ })).toBeDisabled()
      await expect(composer.getByText(/no text opt-in/)).toBeVisible()
      await expect(composer.getByTestId('reply-hours')).toHaveText(
        /contact hours \(08:00–22:00, America\/Kentucky\/Louisville\)/,
      )
      await expect(composer.getByText(/No approved wording for reply emails yet/)).toBeVisible()
      await axe(staff)
      const text = `Synthetic e2e reply ${tag}: we can come on Tuesday morning.`
      await composer.getByLabel('Reply').fill(text)
      await composer.getByRole('button', { name: 'Send' }).click()
      await expect(composer.getByText("Reply sent. It is on the customer's project page.")).toBeVisible()
      // The reply is in the conversation with its truthful delivery: waiting for the contact hours, or not sent
      // because the reply wording's values are not wired yet (TSK-0119) (never shown as sent).
      const thread = staff.getByRole('region', { name: 'Customer messages' })
      const sent = thread.getByRole('listitem', { name: 'E2E Replies Office' })
      await expect(sent.getByText(text)).toBeVisible()
      await expect(async () => {
        await staff.reload()
        await expect(
          thread
            .getByRole('listitem', { name: 'E2E Replies Office' })
            .getByText(
              /Not sent: the approved wording is released, but this message does not supply its values yet\.|Sends at .+ \(contact hours\)\./,
            ),
        ).toBeVisible({ timeout: 1000 })
      }).toPass({ timeout: 20_000 })
      await expect(thread.getByText(/^Sent$|^Delivered$/)).toHaveCount(0)
      await expect(composer.getByLabel('Reply')).toHaveValue('')
      await axe(staff)

      // The customer's Messages tab shows the reply on its next read, exactly as written.
      await page.getByRole('button', { name: 'Refresh' }).click()
      const list = messages.getByRole('list', { name: 'Project conversation' })
      const item = list.getByRole('listitem', { name: 'HandyHub, Email' })
      await expect(item.getByText(text)).toBeVisible()
      await expect(messages.getByText('E2E Replies Office')).toHaveCount(0)
      await expect(messages.getByText(email)).toHaveCount(0)
      await axe(page)
    } finally {
      await office.close()
    }
  })
})
