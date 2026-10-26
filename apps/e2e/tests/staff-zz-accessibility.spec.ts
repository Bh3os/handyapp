// The accessibility sweep of the staff app in a real browser (TSK-0104; HH-A11Y-01, HH-A11Y-02, HH-A11Y-03, T69,
// OWN-DEC-85, OWN-DEC-181). The sign-in pages and their errors, every screen of the Owner's menu, the search page, and
// a request's record with the records it links to pass axe (WCAG 2.x A and AA) in the light and the dark theme and at
// 320 px, reflow at 320 px and with 200% text, and hold still with reduced motion (apps/e2e/a11y.ts; the other staff
// specs run the same sweep on every state they reach). With the keyboard alone: a refused sign-in puts focus on the
// field to correct; the skip link and the menu work, and a screen change titles the page and moves focus to the main
// region; a dialog keeps focus inside, closes on Escape and gives focus back to its button. Named after staff-auth so
// the first Owner exists (CI runs the specs in one database, in name order). Screen readers and physical phones are
// not tested here: they stay UNVERIFIED (docs/accessibility-report.md). Every account, address and value is synthetic
// (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createDb } from '@handyhub/db'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { expectAccessible, tabTo } from '../a11y.js'
import { passSecondFactor } from '../mfa.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
// This spec's own synthetic network (RFC 5737): the request form and the staff sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.105' }
test.use({ extraHTTPHeaders: HEADERS })
const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OWNER = 'e2e-owner@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'accessibility', 'passphrase', '104'].join(' ')
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)

function staffAccess(...args: string[]): string {
  const out = execFileSync(process.execPath, [cli, ...args], {
    env: { ...process.env, HANDYHUB_ENV: 'ci', DATABASE_URL: databaseUrl, PORT: port, HOST: '127.0.0.1' },
    encoding: 'utf8',
    stdio: 'pipe',
  })
  return new URL(out.split('\n')[0] as string).pathname
}
/** The first Owner's invite, or a reset link when another spec already created the Owner. */
function ownerLink(): string {
  try {
    return staffAccess('create-owner', OWNER, 'E2E Owner')
  } catch {
    return staffAccess('password-link', OWNER)
  }
}

async function press(page: Page, target: Locator, options: { max?: number; back?: boolean } = {}) {
  await tabTo(page, target, options)
  await page.keyboard.press('Enter')
}

/** The Owner, signed in with the keyboard: a refused attempt first, which puts focus on the field to correct. */
async function signInOwner(page: Page) {
  await page.goto(ownerLink())
  const password = page.getByLabel('New password')
  await expect(password).toBeVisible()
  await expectAccessible(page, 'staff: set password')
  await press(page, page.getByRole('button', { name: 'Save password' }))
  await expect(password).toBeFocused()
  await expect(password).toHaveAttribute('aria-invalid', 'true')
  await expectAccessible(page, 'staff: set password refused')
  await page.keyboard.type(pw)
  await press(page, page.getByRole('button', { name: 'Save password' }))
  await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()

  await page.goto('/staff/sign-in')
  await expect(page).toHaveTitle('Staff sign-in – HandyHub staff')
  await expectAccessible(page, 'staff: sign in')
  const email = page.getByLabel('Email')
  await press(page, page.getByRole('button', { name: 'Sign in' }))
  await expect(email).toBeFocused()
  await expect(email).toHaveAttribute('aria-invalid', 'true')
  await expectAccessible(page, 'staff: sign in refused')
  await page.keyboard.type(OWNER)
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Password', { exact: true })).toBeFocused()
  await page.keyboard.type(pw)
  await page.keyboard.press('Enter')
  // The second factor: enrolment on a new database, the code afterwards; either page is swept before it is passed.
  await expect(page.locator('#staff-main input').first()).toBeVisible()
  await expectAccessible(page, 'staff: second factor')
  await passSecondFactor(page)
  await expect(page.getByText('Signed in as E2E Owner', { exact: true })).toBeVisible()
}

test.describe('accessibility sweep: staff app (TSK-0104)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-A11Y-01][HH-A11Y-02][HH-A11Y-03][T69] sign-in, every menu screen and a request record pass the sweep; keyboard, titles and focus follow each screen', async ({
    page,
  }) => {
    test.setTimeout(420_000)
    await signInOwner(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
    await expect(page).toHaveTitle('Action queue – HandyHub staff')

    // The skip link, then a menu entry with Enter: the screen is titled and focus moves to its main region.
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('#staff-main')).toBeFocused()
    // The menu comes before the main region, so Shift+Tab goes back to it.
    const nav = page.getByRole('navigation', { name: 'Main' })
    await press(page, nav.getByRole('link', { name: 'Requests', exact: true }), { back: true })
    await expect(page.getByRole('heading', { level: 1, name: 'Requests' })).toBeVisible()
    await expect(page).toHaveTitle('Requests – HandyHub staff')
    await expect(page.locator('#staff-main')).toBeFocused()
    // The next Tab starts in the new screen, not back in the menu.
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.getElementById('staff-main')?.contains(document.activeElement))).toBe(
      true,
    )

    // Every screen of the Owner's menu (My account included) and the search page.
    const screens = await nav.getByRole('link').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).pathname))
    expect(screens.length).toBeGreaterThan(10)
    for (const path of [...screens, '/staff/search?q=Test']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
      await expectAccessible(page, path)
    }

    // A request of this spec's own, its record and the records it links to.
    const res = await page.request.post('/api/v1/public/requests', {
      headers: { 'idempotency-key': `synthetic-e2e-a11y-staff-${Date.now()}` },
      data: {
        formVersion: 'e2e-1',
        privacyNoticeVersion: 'privacy-notice-1',
        services: [{ serviceId: 'SVC-DW-01' }],
        notSure: false,
        description: 'Synthetic accessibility staff sweep: a scuffed door frame.',
        property: { street: '105 Synthetic Lane', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
        timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
        estimatePreference: 'let_handyhub_decide',
        contact: {
          fullName: 'Test Customer',
          email: 'a11y-staff@example.test',
          phone: '(502) 555-0105',
          preferredChannel: 'email',
        },
        smsOptIn: false,
        marketingOptIn: false,
      },
    })
    expect(res.status()).toBe(201)
    const reference = ((await res.json()) as { reference: string }).reference
    const db = createDb(databaseUrl as string, { max: 1 })
    const request = await db
      .selectFrom('intake.requests')
      .select('id')
      .where('reference', '=', reference)
      .executeTakeFirstOrThrow()
      .finally(() => db.destroy())
    await page.goto(`/staff/requests/${request.id}`)
    await expect(page.getByText(reference).first()).toBeVisible()
    await expect(page).toHaveTitle('Requests – HandyHub staff')
    await expectAccessible(page, 'staff: request record')
    const linked = await page
      .locator('#staff-main a[href^="/staff/"]')
      .evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).pathname))])
    const records = linked.filter((p) => /\/[0-9a-f-]{36}(\/[a-z]+)?$/.test(p))
    expect(records.length).toBeGreaterThan(0)
    for (const path of records) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
      await expectAccessible(page, path.replace(/[0-9a-f-]{36}/g, ':id'))
    }
  })

  test('[HH-A11Y-01][HH-A11Y-02][T69] a dialog takes focus, keeps it inside, closes on Escape and gives it back to its button', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await page.goto('/staff/sign-in')
    await page.getByLabel('Email').fill(OWNER)
    await page.getByLabel('Password', { exact: true }).fill(pw)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await passSecondFactor(page)
    await expect(page.getByText('Signed in as E2E Owner', { exact: true })).toBeVisible()
    await page.goto('/staff/dashboard')
    await expect(page.getByRole('heading', { level: 2, name: /Staging Tools/ })).toBeVisible()
    // The Staging Tools' confirmation (this ci server has them); nothing is reset: the dialog is only opened.
    const reset = page.getByRole('button', { name: 'Reset Test Data' })
    await expect(reset).toBeVisible()
    // The Staging Tools sit at the end of a long dashboard.
    await press(page, reset, { max: 400 })
    const dialog = page.getByRole('dialog', { name: 'Reset test data?' })
    await expect(dialog).toBeVisible()
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)
    // Tab never reaches the page behind the dialog (the browser's own controls may take it, shown here as the body).
    for (let n = 0; n < 8; n++) {
      await page.keyboard.press('Tab')
      expect(
        await dialog.evaluate((d) => d.contains(document.activeElement) || document.activeElement === document.body),
      ).toBe(true)
    }
    await expectAccessible(page, 'staff: reset dialog')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(reset).toBeFocused()
  })
})
