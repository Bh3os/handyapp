// Owner Dashboard -> Staging Tools -> Test Data Management in a real browser (TSK-0141; HH-OPS-05, OWN-DEC-191,
// HH-A11Y-01). The main e2e server is an isolated ci system with STAGING_TOOLS=on, and its database was marked ci by
// the migration run. This spec's Office user is refused by the server; the Owner sees the STAGING / TEST MODE mark and
// the counts, cannot confirm without typing RESET TEST DATA, resets, and sees the summary with its checks. The reset
// clears the test records the earlier specs left (all synthetic) and keeps staff accounts and configuration; axe
// checks each state. Every account and record is synthetic (RULE-SYNTHETIC-DATA).
// TSK-0142 (HH-OPS-06, OWN-DEC-191), in the same serial file so the counts above never race with them: the Owner creates
// the Owner Acceptance Testing accounts (fictional, example.test; no credential on screen), and moves the launch phase
// in Settings with a written approval and the typed words, then returns to phase 1. On this ci server the phase opens
// nothing public (testers only); production enforcement is covered by the integration tests.
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
// TSK-0142: this spec's own second Owner for the test-account and launch-phase tests. A password link revokes every
// session of its account, so these tests never reset the shared first Owner while other specs are signed in as it.
const OAT_OWNER = 'e2e-oat-tester-owner@example.test'
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

/** A staff account of this spec, added straight to the database once (synthetic; the first Owner is another spec's). */
async function ensureStaff(email: string, name: string, role: 'office' | 'owner') {
  await withDb(async (db) => {
    const existing = await db
      .selectFrom('identity.staff_users')
      .select('id')
      .where('email', '=', email)
      .executeTakeFirst()
    if (existing) return
    const user = await db
      .insertInto('identity.staff_users')
      .values({ email, display_name: name, locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: role, issued_by: 'e2e:staging', reason: null })
      .execute()
  })
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

  test('[HH-OPS-06] the Owner creates the test accounts: one fictional account per role, no credential shown', async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: OWNER_NET })
    const page = await context.newPage()
    await ensureStaff(OAT_OWNER, 'E2E OAT Owner', 'owner')
    await signIn(page, OAT_OWNER, pw('oat-owner'), staffAccess('password-link', OAT_OWNER))
    await page.goto('/staff/dashboard')
    const section = page.getByTestId('staging-test-accounts')
    await expect(section.getByRole('heading', { name: 'Test accounts' })).toBeVisible()
    for (const id of ['customer', 'guest_customer', 'worker', 'estimator', 'office', 'owner'])
      await expect(section.getByTestId(`test-account-${id}`)).toContainText('@example.test')
    await axe(page)
    await section.getByRole('button', { name: 'Create the test accounts' }).click()
    const outcomes = page.getByTestId('test-account-outcomes')
    await expect(outcomes.getByText('Staff (Worker): created')).toBeVisible({ timeout: 30_000 })
    await expect(outcomes.getByText('Customer: created')).toBeVisible()
    await expect(outcomes.getByText('Guest Customer: no account needed')).toBeVisible()
    await expect(section.getByTestId('test-account-customer')).toContainText('kept through resets')
    await expect(section.getByTestId('test-account-owner')).toContainText('invited')
    await expect(section).not.toContainText(/password:|token/i)
    await axe(page)
    const invited = await withDb(async (db) =>
      db
        .selectFrom('identity.staff_users as u')
        .innerJoin('identity.auth_identities as i', 'i.staff_user_id', 'u.id')
        .select(['u.email', 'u.status', 'i.password_hash'])
        .where('u.email', 'like', 'oat-%@example.test')
        .orderBy('u.email')
        .execute(),
    )
    expect(invited.map((u) => [u.email, u.status, u.password_hash])).toEqual([
      ['oat-estimator@example.test', 'invited', null],
      ['oat-office@example.test', 'invited', null],
      ['oat-owner@example.test', 'invited', null],
      ['oat-worker@example.test', 'invited', null],
    ])
    await context.close()
  })

  test('[HH-OPS-06] the Owner moves the launch phase only with an approval and the words, and can return', async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: OWNER_NET })
    const page = await context.newPage()
    await ensureStaff(OAT_OWNER, 'E2E OAT Owner', 'owner')
    await signIn(page, OAT_OWNER, pw('oat-owner'), staffAccess('password-link', OAT_OWNER))
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Configuration' }).click()
    const setting = page.getByTestId('launch-phase')
    await expect(setting.getByTestId('launch-current')).toHaveText('Phase 1: Owner Acceptance Testing')
    for (const id of ['invited_customers', 'public_submissions', 'search_indexing'])
      await expect(setting.getByTestId(`launch-switch-${id}`)).toContainText('Off')
    await expect(setting.getByTestId('launch-effect')).toContainText('only authorized testers')
    await axe(page)
    await setting.getByRole('button', { name: 'Approve Invited customers' }).click()
    const dialog = page.getByRole('dialog', { name: 'Move to Invited customers?' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Record and change the phase' })).toBeDisabled()
    await dialog.getByLabel('Your approval, in your own words').fill('Synthetic e2e approval of phase 2.')
    await dialog.getByLabel('Type APPROVE PHASE 2 to confirm').fill('approve phase 2')
    await expect(dialog.getByRole('button', { name: 'Record and change the phase' })).toBeDisabled()
    await dialog.getByLabel('Type APPROVE PHASE 2 to confirm').fill('APPROVE PHASE 2')
    await axe(page)
    await dialog.getByRole('button', { name: 'Record and change the phase' }).click()
    await expect(setting.getByTestId('launch-current')).toHaveText('Phase 2: Invited customers')
    await expect(setting.getByTestId('launch-switch-invited_customers')).toContainText('On')
    await expect(setting.getByTestId('launch-history')).toContainText('Synthetic e2e approval of phase 2.')
    // Back to phase 1, recorded the same way, so the rest of the suite runs in the starting phase.
    await setting.getByRole('button', { name: 'Return to Owner Acceptance Testing' }).click()
    const back = page.getByRole('dialog', { name: 'Move to Owner Acceptance Testing?' })
    await back.getByLabel('Your approval, in your own words').fill('Synthetic e2e return to phase 1.')
    await back.getByLabel('Type RETURN TO PHASE 1 to confirm').fill('RETURN TO PHASE 1')
    await back.getByRole('button', { name: 'Record and change the phase' }).click()
    await expect(setting.getByTestId('launch-current')).toHaveText('Phase 1: Owner Acceptance Testing')
    const recorded = await withDb(async (db) =>
      db
        .selectFrom('platform.audit_events')
        .select(['result', 'reason'])
        .where('action', '=', 'launch.change_phase')
        .where('result', '=', 'succeeded')
        .execute(),
    )
    expect(recorded.map((r) => r.reason)).toEqual(
      expect.arrayContaining(['Synthetic e2e approval of phase 2.', 'Synthetic e2e return to phase 1.']),
    )
    await context.close()
  })
})
