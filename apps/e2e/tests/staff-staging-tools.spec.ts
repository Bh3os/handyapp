// Owner Dashboard -> Staging Tools -> Test Data Management in a real browser (TSK-0141; HH-OPS-05, OWN-DEC-191,
// HH-A11Y-01). The main e2e server is an isolated ci system with STAGING_TOOLS=on, and its database was marked ci by
// the migration run. This spec's Office user is refused by the server; the Owner sees the STAGING / TEST MODE mark and
// the counts, cannot confirm without typing RESET TEST DATA, resets, and sees the summary with its checks. The reset
// clears the test records the earlier specs left (all synthetic) and keeps staff accounts and configuration; axe
// checks each state. Every account and record is synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type Page } from '@playwright/test'
import { passSecondFactor } from '../mfa.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic networks (RFC 5737): the sign-in limits count per network.
const OWNER_NET = { 'x-forwarded-for': '198.51.100.194' }
const OFFICE_NET = { 'x-forwarded-for': '198.51.100.195' }
const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OWNER = 'e2e-owner@example.test'
const OFFICE = 'e2e-staging-office@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (who: string) => ['synthetic', 'staging', 'tools', who, 'passphrase', '141'].join(' ')

function staffAccess(...args: string[]): string {
  const out = execFileSync(process.execPath, [cli, ...args], {
    env: { ...process.env, HANDYHUB_ENV: 'ci', DATABASE_URL: databaseUrl, PORT: port, HOST: '127.0.0.1' },
    encoding: 'utf8',
    stdio: 'pipe',
  })
  return new URL(out.split('\n')[0] as string).pathname
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-staging-tools' })
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function signIn(page: Page, email: string, password: string, link: string) {
  await page.goto(link)
  await page.getByLabel('New password').fill(password)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // Staff MFA is mandatory (TSK-0154, OWN-DEC-202): the first sign-in enrols the authenticator.
  await passSecondFactor(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
}

test.describe('Staging Tools: Test Data Management (TSK-0141, HH-OPS-05)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-OPS-05][T26] another role is refused by the server', async ({ browser }) => {
    // This spec's Office user, added straight to the database (the first Owner is another spec's).
    await withDb(async (db) => {
      const existing = await db
        .selectFrom('identity.staff_users')
        .select('id')
        .where('email', '=', OFFICE)
        .executeTakeFirst()
      if (existing) return
      const user = await db
        .insertInto('identity.staff_users')
        .values({ email: OFFICE, display_name: 'E2E Staging Office', locale: 'en' })
        .returning('id')
        .executeTakeFirstOrThrow()
      await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
      await db
        .insertInto('identity.role_grants')
        .values({ staff_user_id: user.id, kind: 'role', name: 'office', issued_by: 'e2e:staging', reason: null })
        .execute()
    })
    const context = await browser.newContext({ extraHTTPHeaders: OFFICE_NET })
    const page = await context.newPage()
    await signIn(page, OFFICE, pw('office'), staffAccess('password-link', OFFICE))
    const read = await page.request.get('/api/v1/staff/staging/test-data')
    expect(read.status()).toBe(403)
    await context.close()
  })

  test('[HH-OPS-05] the Owner resets the test data after typing the words', async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: OWNER_NET })
    const page = await context.newPage()
    await signIn(page, OWNER, pw('owner'), staffAccess('password-link', OWNER))
    const before = await withDb(async (db) => ({
      staff: Number(
        (
          await db
            .selectFrom('identity.staff_users')
            .select((e) => e.fn.countAll().as('n'))
            .executeTakeFirst()
        )?.n,
      ),
      config: Number(
        (
          await db
            .selectFrom('platform.policy_version')
            .select((e) => e.fn.countAll().as('n'))
            .executeTakeFirst()
        )?.n,
      ),
    }))
    await page.goto('/staff/dashboard')
    // Hydrated: the section is rendered from the server's answer.
    await expect(page.getByRole('heading', { level: 2, name: /Staging Tools/ })).toBeVisible()
    await expect(page.getByText('STAGING / TEST MODE')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Test Data Management' })).toBeVisible()
    await expect(page.getByTestId('staging-removed')).toBeVisible()
    await axe(page)

    await page.getByRole('button', { name: 'Reset Test Data' }).click()
    const dialog = page.getByRole('dialog', { name: 'Reset test data?' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(/test records in total/)).toBeVisible()
    await axe(page)
    // Not the exact words: the confirmation cannot be sent.
    await dialog.getByLabel('Type RESET TEST DATA to confirm').fill('reset test data')
    await expect(dialog.getByRole('button', { name: 'Delete test data' })).toBeDisabled()
    await dialog.getByLabel('Type RESET TEST DATA to confirm').fill('RESET TEST DATA')
    await dialog.getByRole('button', { name: 'Delete test data' }).click()
    const summary = page.getByTestId('reset-summary')
    await expect(summary.getByText('Reset completed.')).toBeVisible({ timeout: 30_000 })
    await expect(summary.getByText('No old message or reminder can be sent')).toBeVisible()
    await expect(summary.getByText('Kept configuration is unchanged')).toBeVisible()
    await axe(page)

    const after = await withDb(async (db) => ({
      staff: Number(
        (
          await db
            .selectFrom('identity.staff_users')
            .select((e) => e.fn.countAll().as('n'))
            .executeTakeFirst()
        )?.n,
      ),
      config: Number(
        (
          await db
            .selectFrom('platform.policy_version')
            .select((e) => e.fn.countAll().as('n'))
            .executeTakeFirst()
        )?.n,
      ),
      requests: Number(
        (
          await db
            .selectFrom('intake.requests')
            .select((e) => e.fn.countAll().as('n'))
            .executeTakeFirst()
        )?.n,
      ),
      pending: Number(
        (
          await db
            .selectFrom('platform.outbox_events')
            .select((e) => e.fn.countAll().as('n'))
            .executeTakeFirst()
        )?.n,
      ),
      runs: await db.selectFrom('staging.reset_runs').select(['state', 'mode']).execute(),
    }))
    expect(after.staff).toBe(before.staff)
    expect(after.config).toBe(before.config)
    expect(after.requests).toBe(0)
    expect(after.pending).toBe(0)
    expect(after.runs).toContainEqual({ state: 'completed', mode: 'reset' })
    await context.close()
  })
})
