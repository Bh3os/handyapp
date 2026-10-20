import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/** WCAG 2.0, 2.1 and 2.2 level A and AA rules (axe-core tags). */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OWNER = 'e2e-owner@example.test'
const WORKER = 'e2e-worker@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (n: number) => ['synthetic', 'end', 'to', 'end', 'passphrase', String(n)].join(' ')

/** The operations command prints one set-password link (HH-STAFF-01 safe bootstrap). */
function staffAccess(...args: string[]): string {
  const out = execFileSync(process.execPath, [cli, ...args], {
    env: { ...process.env, HANDYHUB_ENV: 'ci', DATABASE_URL: databaseUrl, PORT: port, HOST: '127.0.0.1' },
    encoding: 'utf8',
  })
  return new URL(out.split('\n')[0] as string).pathname
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
}

test.describe('staff sign-in, invites and password reset (TSK-0014, HH-STAFF-01, HH-SEC-02)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-STAFF-01] the first Owner sets a password from the bootstrap link and signs in; a wrong password fails', async ({
    page,
  }) => {
    const invite = staffAccess('create-owner', OWNER, 'E2E Owner')
    expect(invite).toMatch(/^\/staff\/invite\/[A-Za-z0-9_-]{43}$/)
    await page.goto(invite)
    await page.getByLabel('New password').fill('too short')
    await page.getByRole('button', { name: 'Save password' }).click()
    await expect(page.getByText('This value is too short or too small.')).toBeVisible()
    await setPassword(page, invite, pw(1))

    await signIn(page, OWNER, pw(2))
    await expect(page.getByRole('alert')).toHaveText('The email or password is not correct.')
    await signIn(page, OWNER, pw(1))
    await expect(page.getByRole('heading', { level: 1, name: 'Signed in as E2E Owner' })).toBeVisible()
    const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
    expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })

  test('[HH-STAFF-01] an unknown email gets the same answers as a known one', async ({ page }) => {
    await signIn(page, 'nobody-e2e@example.test', pw(1))
    await expect(page.getByRole('alert')).toHaveText('The email or password is not correct.')
    for (const email of ['nobody-e2e@example.test', OWNER]) {
      await page.goto('/staff/sign-in')
      await page.getByRole('button', { name: 'Forgot password?' }).click()
      await page.getByLabel('Email').fill(email)
      await page.getByRole('button', { name: 'Send reset link' }).click()
      await expect(page.getByText(/If that email belongs to a staff account, a reset link is on its way/)).toBeVisible()
    }
  })

  test('[HH-STAFF-01] the Owner invites a Worker, who sets a password and signs in', async ({ page, browser }) => {
    await signIn(page, OWNER, pw(1))
    await expect(page.getByRole('heading', { level: 1, name: 'Signed in as E2E Owner' })).toBeVisible()
    // Unsafe requests of a staff session carry its CSRF token (TSK-0015).
    const csrf = (await (await page.request.get('/api/v1/staff/auth/session')).json()).csrfToken as string
    const res = await page.request.post('/api/v1/staff/invitations', {
      data: { email: WORKER, displayName: 'E2E Worker', role: 'worker', reason: 'End-to-end test' },
      headers: { 'idempotency-key': 'e2e-invite-worker-0001', 'x-csrf-token': csrf },
    })
    expect(res.status()).toBe(201)
    const worker = await browser.newPage()
    await setPassword(worker, staffAccess('password-link', WORKER), pw(3))
    await signIn(worker, WORKER, pw(3))
    await expect(worker.getByRole('heading', { level: 1, name: 'Signed in as E2E Worker' })).toBeVisible()
    await worker.close()
  })

  test('[HH-STAFF-01][T22] a password reset revokes every session; sign-out ends the session', async ({
    page,
    browser,
  }) => {
    await signIn(page, OWNER, pw(1))
    await expect(page.getByRole('heading', { level: 1, name: 'Signed in as E2E Owner' })).toBeVisible()
    const other = await browser.newPage()
    await setPassword(other, staffAccess('password-link', OWNER), pw(4))
    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: 'Staff sign-in' })).toBeVisible()
    await signIn(other, OWNER, pw(4))
    await other.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(other.getByRole('heading', { level: 1, name: 'Staff sign-in' })).toBeVisible()
    await other.goto('/staff/')
    await expect(other.getByRole('heading', { level: 1, name: 'Staff sign-in' })).toBeVisible()
    await other.close()
  })
})
