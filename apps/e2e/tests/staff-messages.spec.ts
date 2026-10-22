// The message delivery screen in a real browser (TSK-0119; HH-COM-14, HH-COM-13, HH-COM-02, OWN-DEC-151, OWN-DEC-152).
// An Office account of this spec sends a request through the public API: its receipt email has the owner's released
// wording but its values are wired by TSK-0120, so it is recorded as not sent and shown so, never as sent. The
// Templates tab previews the owner wording with sample values in a sandboxed frame. Every visitor, address and account
// is synthetic (RULE-SYNTHETIC-DATA); nothing reaches a real provider.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { passSecondFactor } from '../mfa.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.180' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OFFICE = 'e2e-messages-office@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'message', 'delivery', 'passphrase', '119'].join(' ')
const run = Date.now().toString(36)

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-messages' })
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

async function sendRequest(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `synthetic-e2e-messages-${run}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic message-delivery project: a scuffed hallway wall.',
      property: {
        street: '180 Synthetic Message Lane',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Test Message Customer',
        email: `messages-e2e-${run}@example.test`,
        phone: '(502) 555-0180',
        preferredChannel: 'email',
      },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { reference: string }).reference
}

/** This spec's Office user, signed in through the staff app in a browser of its own. */
async function officeSession(browser: Browser) {
  const staffAccess = (...args: string[]) =>
    new URL(
      execFileSync(process.execPath, [cli, ...args], {
        env: { ...process.env, HANDYHUB_ENV: 'ci', DATABASE_URL: databaseUrl, PORT: port, HOST: '127.0.0.1' },
        encoding: 'utf8',
        stdio: 'pipe',
      }).split('\n')[0] as string,
    ).pathname
  // An account of this spec's own, added straight to the database: the first Owner is created by the staff sign-in
  // spec (staff-auth), which must find no Owner yet whatever order the specs run in.
  await withDb(async (db) => {
    const existing = await db
      .selectFrom('identity.staff_users')
      .select('id')
      .where('email', '=', OFFICE)
      .executeTakeFirst()
    if (existing) return
    const user = await db
      .insertInto('identity.staff_users')
      .values({ email: OFFICE, display_name: 'E2E Messages Office', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: 'office', issued_by: 'e2e:messages', reason: null })
      .execute()
  })
  const context = await browser.newContext({ extraHTTPHeaders: HEADERS })
  const page = await context.newPage()
  await page.goto(staffAccess('password-link', OFFICE))
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

test.describe('message delivery and templates (TSK-0119)', () => {
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL')

  test('[HH-COM-14][HH-COM-13][HH-COM-02] Office sees the receipt as not sent with its reason, and previews the owner wording', async ({
    browser,
    request,
  }) => {
    const reference = await sendRequest(request)
    const office = await officeSession(browser)
    const p = office.page
    try {
      // The receipt's delivery is recorded once its job ran (TSK-0120: its values are wired; the ci test provider
      // intercepts it).
      await expect
        .poll(
          () =>
            withDb((db) =>
              db
                .selectFrom('platform.message_deliveries as d')
                .innerJoin('crm.projects as pr', 'pr.id', 'd.project_id')
                .select(['d.state', 'd.error_code', 'd.template_id'])
                .where('pr.reference', '=', reference)
                .where('d.message_key', '=', 'request.receipt')
                .execute(),
            ),
          { timeout: 15_000 },
        )
        .toEqual([{ state: 'queued', error_code: null, template_id: 'request_received' }])

      await p.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Message delivery' }).click()
      await expect(p.getByRole('heading', { level: 1, name: 'Message delivery' })).toBeVisible()
      await p.getByLabel('Project reference').fill(reference)
      await p.getByRole('button', { name: 'Apply' }).click()
      // The project's messages: its receipt (and its access link).
      const items = p.getByRole('list', { name: 'Messages' }).locator('li[data-message-key="request.receipt"]')
      await expect(items).toHaveCount(1)
      const item = items.first()
      await expect(item.getByText('request.receipt')).toBeVisible()
      // Accepted by the test provider, never shown as delivered (OWN-DEC-152 section 14).
      await expect(item.getByText('Accepted by the provider', { exact: true })).toBeVisible()
      await expect(item.getByText('Test provider: intercepted, never delivered to anyone')).toBeVisible()
      await expect(item.getByText(/^Email to m•••@example\.test$/)).toBeVisible()
      await expect(item.getByText('Delivered', { exact: true })).toHaveCount(0)
      await axe(p)

      // The owner wording, with sample values only, in a sandboxed frame; nothing is sent by previewing.
      await p.getByRole('tab', { name: 'Templates' }).click()
      const templates = p.getByRole('list', { name: 'Message templates' })
      const receipt = templates.locator('li[data-template-key="request.receipt"]')
      await expect(receipt.getByText('Template ID request_received')).toBeVisible()
      await expect(receipt).toHaveCount(1)
      await expect(receipt.getByText('Ready to send')).toBeVisible()
      await receipt.getByRole('button', { name: 'Preview' }).click()
      await expect(p.getByText("Subject: HandyHub | We've Received Your Request #HH-0000TEST")).toBeVisible()
      await expect(p.getByText(/Thank you for contacting HandyHub!/).first()).toBeVisible()
      const frame = p.frameLocator('iframe[title="Email as sent"]')
      await expect(frame.getByText('Hi Sample,')).toBeVisible()
      await expect(frame.getByText('Phone: Placeholder — not provided yet')).toBeVisible()
      await axe(p)

      // On a phone nothing scrolls sideways.
      await p.setViewportSize({ width: 375, height: 740 })
      const width = await p.evaluate(() => document.documentElement.scrollWidth)
      expect(width).toBeLessThanOrEqual(375)
    } finally {
      await office.close()
    }
  })
})
