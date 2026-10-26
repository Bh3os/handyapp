// The Owner's system health screen and configuration view in a real browser (TSK-0101; HH-NFR-02, T71,
// RULE-SERVER-AUTHZ). A synthetic failed job is written to the e2e database; the Owner sees it on System health, sees
// unobservable parts as unknown, and opens the configuration view with its NOT CONFIGURED values. Another role is
// refused by the server. Accounts and records are synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createDb } from '@handyhub/db'
import { expect, test, type Page } from '@playwright/test'
import { passSecondFactor } from '../mfa.js'
import { expectAccessible } from '../a11y.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
// This spec's own synthetic network (RFC 5737): the staff sign-in, reset and link limits count per network, so the
// suite must not share one address (playwright.config.ts trusts one forwarded hop on the main server).
const NETWORK = { 'x-forwarded-for': '198.51.100.33' }
const port = process.env['E2E_PORT'] ?? '4310'
const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OWNER = 'e2e-owner@example.test'
const OFFICE = 'e2e-system-office@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (n: number) => ['synthetic', 'staff', 'system', 'passphrase', String(n)].join(' ')

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
async function signIn(page: Page, email: string, password: string) {
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // MFA is mandatory (TSK-0154): enrol on the account's first sign-in, the code afterwards.
  await passSecondFactor(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
}
async function axe(page: Page) {
  await expectAccessible(page)
}

test.use({ extraHTTPHeaders: NETWORK })

test.describe('system health and configuration (TSK-0101, HH-NFR-02)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test.beforeAll(async () => {
    // A synthetic permanently failed job, as a provider outage would leave one.
    const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-system' })
    try {
      await db
        .insertInto('platform.jobs')
        .values({
          automation: 'e2e.synthetic_probe',
          job_key: `e2e.synthetic_probe:${Date.now()}`,
          request_id: 'e2e-system-1',
          state: 'failed',
          attempts: 2,
          max_attempts: 2,
          last_error_class: 'SyntheticOutage',
          finished_at: new Date(),
        })
        .execute()
    } finally {
      await db.destroy()
    }
  })

  test('[HH-NFR-02][T71] the Owner sees the failed job, truthful unknown states and the configuration view', async ({
    page,
  }) => {
    await setPassword(page, ownerLink(), pw(1))
    await signIn(page, OWNER, pw(1))
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'System health' }).click()
    await expect(page).toHaveURL(/\/staff\/health$/)
    await expect(page.getByRole('heading', { level: 1, name: 'System health' })).toBeVisible()
    await expect(page.getByRole('listitem', { name: 'Database: OK' })).toBeVisible()
    await expect(page.getByRole('listitem', { name: 'Background jobs: Failed' })).toBeVisible()
    await expect(page.getByText('e2e.synthetic_probe')).toBeVisible()
    await expect(page.getByText('Error: SyntheticOutage')).toBeVisible()
    // What the system cannot observe is never shown as OK (T71).
    await expect(page.getByRole('listitem', { name: 'Backups: Unknown' })).toBeVisible()
    await expect(page.getByRole('listitem', { name: 'Last restore drill: Unknown' })).toBeVisible()
    await expect(page.getByRole('listitem', { name: 'Error tracking: NOT CONFIGURED' })).toBeVisible()
    await expect(page.getByRole('listitem', { name: 'Configuration values: NOT CONFIGURED' })).toBeVisible()
    await axe(page)

    await page.getByRole('link', { name: 'Open configuration' }).click()
    await expect(page).toHaveURL(/\/staff\/settings$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Configuration' })).toBeVisible()
    const help = page.getByRole('listitem', { name: 'Reply to a HELP text' })
    await expect(help.getByText('NOT CONFIGURED')).toBeVisible()
    await expect(help.getByText(/OQ-ATTORNEY-PRIVACY/)).toBeVisible()
    await expect(page.getByText('AI features: disabled')).toBeVisible()
    await expect(page.getByText('DATABASE_URL', { exact: true })).toBeVisible()
    await axe(page)

    // Invite an Office member for the refusal check (the Owner's own staff API, with the session's CSRF token).
    const csrf = (await (await page.request.get('/api/v1/staff/auth/session')).json()).csrfToken as string
    const invited = await page.request.post('/api/v1/staff/invitations', {
      data: { email: OFFICE, displayName: 'E2E System office', role: 'office', reason: 'End-to-end system test' },
      headers: { 'idempotency-key': 'e2e-system-invite-office-0001', 'x-csrf-token': csrf },
    })
    expect(invited.status()).toBe(201)
  })

  test('[RULE-SERVER-AUTHZ][HH-NFR-02] Office has no System health menu item and the server refuses its data', async ({
    browser,
  }) => {
    const page = await (await browser.newContext({ extraHTTPHeaders: NETWORK })).newPage()
    await setPassword(page, staffAccess('password-link', OFFICE), pw(2))
    await signIn(page, OFFICE, pw(2))
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'System health' }),
    ).toHaveCount(0)
    await page.goto('/staff/health')
    await expect(page.getByText('This screen is not part of your role.')).toBeVisible()
    for (const path of ['/api/v1/staff/system/health', '/api/v1/staff/system/configuration'])
      expect((await page.request.get(path)).status()).toBe(403)
    await page.context().close()
  })
})
