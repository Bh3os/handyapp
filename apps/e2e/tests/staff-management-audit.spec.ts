// The audit-log screen in a real browser (TSK-0098; HH-STAFF-08, HH-SEC-06, T74, OWN-DEC-123, OWN-DEC-142). This
// spec's synthetic Office user changes the staff app language twice (two audited actions of their own) and opens the
// Audit log: every entry is theirs. The Owner opens the Audit log, sees that it shows every recorded action, the
// 7-year retention rule with the owner deletion review, filters by the Office user and sees exactly those two
// entries, redacted change summaries and no edit or delete control. The Owner account is the one the staff sign-in
// spec creates (staff-auth runs first): this spec only sets a password for it with a reset link. The Office user is
// this spec's own synthetic fixture (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type Browser, type Page } from '@playwright/test'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.198' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OWNER = 'e2e-owner@example.test'
// A per-run suffix in base 36, so a rerun on the same database gets a new person.
const RUN = Date.now().toString(36)
const OFFICE = { email: `e2e-audit-office-${RUN}@example.test`, name: `E2E Audit Office ${RUN}` }
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (n: number) => ['synthetic', 'audit', 'log', 'passphrase', String(n)].join(' ')

function staffAccess(...args: string[]): string {
  const out = execFileSync(process.execPath, [cli, ...args], {
    env: { ...process.env, HANDYHUB_ENV: 'ci', DATABASE_URL: databaseUrl, PORT: port, HOST: '127.0.0.1' },
    encoding: 'utf8',
    stdio: 'pipe',
  })
  return new URL(out.split('\n')[0] as string).pathname
}

async function setPasswordAndSignIn(page: Page, email: string, password: string) {
  await page.goto(staffAccess('password-link', email))
  await page.getByLabel('New password').fill(password)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function fresh(browser: Browser): Promise<Page> {
  return (await browser.newContext({ extraHTTPHeaders: HEADERS })).newPage()
}

/** This spec's Office user, added straight to the database (no invitation email). */
async function office(): Promise<void> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-staff-audit' })
  try {
    await db.transaction().execute(async (tx) => {
      const user = await tx
        .insertInto('identity.staff_users')
        .values({ email: OFFICE.email, display_name: OFFICE.name, locale: 'en' })
        .returning('id')
        .executeTakeFirstOrThrow()
      await tx.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
      await tx
        .insertInto('identity.role_grants')
        .values({ staff_user_id: user.id, kind: 'role', name: 'office', issued_by: 'e2e:staff-audit', reason: null })
        .execute()
    })
  } finally {
    await db.destroy()
  }
}

/** The entries themselves: the list's own items, not the facts listed inside each entry. */
const entries = (page: Page) => page.getByRole('list', { name: 'Audit entries' }).locator(':scope > li')

test.describe('audit-log screen (TSK-0098, HH-STAFF-08, HH-SEC-06)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-STAFF-08][HH-SEC-06] Office sees only their own actions', async ({ browser }) => {
    await office()
    const page = await fresh(browser)
    await setPasswordAndSignIn(page, OFFICE.email, pw(1))
    await expect(page.getByText(`Signed in as ${OFFICE.name}`)).toBeVisible()
    // Two actions of their own: Spanish, then back to English.
    await page.getByLabel('Language').selectOption('es')
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    await page.getByLabel('Idioma').selectOption('en')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')

    await page.getByRole('link', { name: 'Audit log' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible()
    await expect(page.getByText(/^You see the actions you performed yourself\./)).toBeVisible()
    await expect(entries(page)).toHaveCount(2)
    for (const item of await entries(page).all()) {
      await expect(item.getByText(`By: ${OFFICE.name}`)).toBeVisible()
      await expect(item.getByText('staff.locale_change')).toBeVisible()
    }
    // No "who" filter, no review counts, and nothing to edit or delete.
    await expect(page.getByLabel('Who')).toHaveCount(0)
    await expect(page.getByText(/past the retention period/)).toHaveCount(0)
    await expect(page.getByRole('list', { name: 'Audit entries' }).getByRole('button')).toHaveCount(0)
    await axe(page)
    await page.context().close()
  })

  test('[HH-STAFF-08][HH-SEC-06][T74] the Owner sees every entry, the retention rule and filters by person', async ({
    browser,
  }) => {
    const page = await fresh(browser)
    await setPasswordAndSignIn(page, OWNER, pw(2))
    await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
    await page.getByRole('link', { name: 'Audit log' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Audit log' })).toBeVisible()
    await expect(page.getByText('You see every recorded action.')).toBeVisible()
    await expect(
      page.getByText(/^Entries are kept 7 years, then go to the owner's deletion review\. Nothing is deleted/),
    ).toBeVisible()
    await expect(page.getByText('The retention periods await CPA and attorney confirmation.')).toBeVisible()
    await expect(page.getByText(/past the retention period/)).toBeVisible()
    await expect(entries(page).first()).toBeVisible()

    // Filter by the Office user: exactly their two language changes, with the change summary.
    await page.getByLabel('Who').selectOption({ label: OFFICE.name })
    await page.getByRole('button', { name: 'Show entries' }).click()
    await expect(entries(page)).toHaveCount(2)
    for (const item of await entries(page).all()) {
      await expect(item.getByText(`By: ${OFFICE.name}`)).toBeVisible()
      await expect(item.getByText('Roles used: Office / Dispatcher')).toBeVisible()
      await expect(item.getByText('Succeeded')).toBeVisible()
    }
    await expect(entries(page).first().getByRole('definition').first()).toBeVisible()

    // The sign-in area: the passwords used in this spec appear nowhere on the page.
    await page.getByLabel('Who').selectOption({ label: 'Anyone' })
    await page.getByLabel('Area').selectOption({ label: 'Staff and sign-in' })
    await page.getByRole('button', { name: 'Show entries' }).click()
    await expect(
      entries(page)
        .first()
        .getByText(/^staff\./),
    ).toBeVisible()
    const text = (await page.locator('main').textContent()) ?? ''
    for (const p of [pw(1), pw(2)]) expect(text).not.toContain(p)
    await expect(page.getByRole('list', { name: 'Audit entries' }).getByRole('button')).toHaveCount(0)
    await axe(page)

    await page.context().close()
  })
})
