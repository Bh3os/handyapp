// The staff app shell in a real browser (TSK-0040; HH-STAFF-06, HH-OPS-04, HH-LANG-02, HH-BASE-01). Each role sees
// only its navigation; the EN/ES switch is stored per staff member and follows them to a new session. Accounts are
// synthetic (RULE-SYNTHETIC-DATA); the server runs with the migrated E2E_DATABASE_URL database.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { passSecondFactor } from '../mfa.js'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const databaseUrl = process.env['E2E_DATABASE_URL']
// This spec's own synthetic network (RFC 5737): the staff sign-in, reset and link limits count per network, so the
// suite must not share one address (playwright.config.ts trusts one forwarded hop on the main server).
const NETWORK = { 'x-forwarded-for': '198.51.100.32' }
const port = process.env['E2E_PORT'] ?? '4310'
const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OWNER = 'e2e-owner@example.test'
const PEOPLE = {
  office: 'e2e-shell-office@example.test',
  estimator: 'e2e-shell-estimator@example.test',
  worker: 'e2e-shell-worker@example.test',
} as const
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (n: number) => ['synthetic', 'staff', 'shell', 'passphrase', String(n)].join(' ')

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

async function setPassword(page: Page, path: string, password: string) {
  await page.goto(path)
  await page.getByLabel('New password').fill(password)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
}
async function signIn(page: Page, email: string, password: string, name: string) {
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // MFA is mandatory (TSK-0154): enrol on the account's first sign-in, the code afterwards.
  await passSecondFactor(page)
  await expect(page.getByText(name, { exact: true })).toBeVisible()
}
const menu = (page: Page) => page.getByRole('navigation', { name: /^(Main|Principal)$/ }).getByRole('link')
async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}
async function fresh(browser: Browser) {
  return (await browser.newContext({ extraHTTPHeaders: NETWORK })).newPage()
}

test.use({ extraHTTPHeaders: NETWORK })

test.describe('staff app shell (TSK-0040, HH-STAFF-06, HH-OPS-04)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-STAFF-06] the Owner lands on the action queue with the full menu, search and keyboard access', async ({
    page,
  }) => {
    await setPassword(page, ownerLink(), pw(1))
    await signIn(page, OWNER, pw(1), 'Signed in as E2E Owner')
    await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
    await expect(menu(page)).toHaveText([
      'Action queue',
      'My Day',
      'Requests',
      'Customers',
      'Estimates',
      'Scheduling board',
      'Inbox',
      'Message delivery',
      'Payments',
      'Cases',
      'Staff',
      'Audit log',
      'Retention reviews',
      'Privacy requests',
      'Owner Dashboard',
      'System health',
      'Configuration',
      'My account',
    ])
    await expect(page.getByRole('search')).toBeVisible()
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
    await axe(page)

    // Keyboard: the first Tab reaches the skip link, which moves focus to the main content.
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('#staff-main')).toBeFocused()
    // A menu link opens its screen with Enter.
    await page.getByRole('link', { name: 'Scheduling board' }).focus()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/staff\/schedule$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Scheduling board' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Scheduling board' })).toHaveAttribute('aria-current', 'page')
    // Back returns to the previous screen.
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()

    // Invite the other roles (the Owner's own staff API, with the session's CSRF token).
    const csrf = (await (await page.request.get('/api/v1/staff/auth/session')).json()).csrfToken as string
    for (const [role, email] of Object.entries(PEOPLE)) {
      const res = await page.request.post('/api/v1/staff/invitations', {
        data: { email, displayName: `E2E Shell ${role}`, role, reason: 'End-to-end shell test' },
        headers: { 'idempotency-key': `e2e-shell-invite-${role}-0001`, 'x-csrf-token': csrf },
      })
      expect(res.status()).toBe(201)
    }
  })

  test('[HH-STAFF-06] each other role sees only its own navigation', async ({ browser }) => {
    const expected = {
      office: [
        'Action queue',
        'My Day',
        'Requests',
        'Customers',
        'Scheduling board',
        'Inbox',
        'Message delivery',
        'Payments',
        'Cases',
        'Audit log',
        'My account',
      ],
      estimator: [
        'Action queue',
        'Requests',
        'Customers',
        'Estimates',
        'Scheduling board',
        'Inbox',
        'Message delivery',
        'My account',
      ],
      worker: ['My Day', 'My account'],
    }
    for (const [role, email] of Object.entries(PEOPLE) as [keyof typeof PEOPLE, string][]) {
      const page = await fresh(browser)
      await setPassword(page, staffAccess('password-link', email), pw(2))
      await signIn(page, email, pw(2), `Signed in as E2E Shell ${role}`)
      await expect(menu(page)).toHaveText(expected[role])
      await expect(
        page.getByRole('heading', { level: 1, name: role === 'worker' ? 'My Day' : 'Action queue' }),
      ).toBeVisible()
      if (role === 'worker') {
        await expect(page.getByRole('search')).toHaveCount(0)
        // A screen outside the role says so; the server still refuses its data.
        await page.goto('/staff/staff')
        await expect(page.getByText('This screen is not part of your role.')).toBeVisible()
        await axe(page)
      }
      await page.context().close()
    }
  })

  test('[HH-OPS-04][T70] the language switch is saved per staff member and follows them to a new session', async ({
    browser,
  }) => {
    const page = await fresh(browser)
    await signIn(page, PEOPLE.worker, pw(2), 'Signed in as E2E Shell worker')
    await page.getByLabel('Language').selectOption('es')
    await expect(page.getByRole('heading', { level: 1, name: 'Mi día' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')
    await expect(menu(page)).toHaveText(['Mi día', 'Mi cuenta'])
    await axe(page)
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Mi día' })).toBeVisible()

    // Another device: a new sign-in starts in Spanish; another staff member is not affected.
    const other = await fresh(browser)
    await signIn(other, PEOPLE.worker, pw(2), 'Sesión iniciada como E2E Shell worker')
    await expect(other.getByRole('heading', { level: 1, name: 'Mi día' })).toBeVisible()
    const office = await fresh(browser)
    await signIn(office, PEOPLE.office, pw(2), 'Signed in as E2E Shell office')
    await expect(office.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()

    await other.getByLabel('Idioma').selectOption('en')
    await expect(other.getByRole('heading', { level: 1, name: 'My Day' })).toBeVisible()
    for (const p of [page, other, office]) await p.context().close()
  })

  test('[HH-BASE-01] going offline shows the offline indicator without leaving the screen', async ({ browser }) => {
    const page = await fresh(browser)
    await signIn(page, PEOPLE.estimator, pw(2), 'Signed in as E2E Shell estimator')
    await page.context().setOffline(true)
    await expect(page.getByText('You are offline.')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
    await axe(page)
    await page.context().setOffline(false)
    await expect(page.getByText('You are offline.')).toHaveCount(0)
    await page.context().close()
  })
})
