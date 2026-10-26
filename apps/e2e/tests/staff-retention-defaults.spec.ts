// The provisional retention defaults in a real browser (TSK-0138; HH-PRIV-01, HH-DATA-09, HH-STAFF-02,
// ENT-RetentionReview, OWN-DEC-177, OQ-RETENTION-REVIEW, OQ-RETENTION-DEFAULTS-DETAILS). The spec records one synthetic
// staff account that left eight years ago (inserted disabled, with its departure time; nothing else of it exists), runs
// the retention review once with the operations command, and the Owner finds that account in the deletion-review
// queue. The schedule shows the five defaults of OWN-DEC-177. The Delete confirmation says the software does not
// delete this kind of record yet, and the Owner archives it instead: the account is still there. Other specs share the
// database, so the spec looks only at its own account. The Owner account is created by whichever spec runs first; this
// one only sets its password with a link. All data is synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createDb } from '@handyhub/db'
import { expect, test, type Page } from '@playwright/test'
import { passSecondFactor } from '../mfa.js'
import { expectAccessible } from '../a11y.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
// This spec's own synthetic client address (RFC 5737): the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.138' }
test.use({ extraHTTPHeaders: HEADERS })

const serverCli = (name: string) => fileURLToPath(new URL(`../../server/dist/cli/${name}.js`, import.meta.url))
const OWNER = 'e2e-owner@example.test'
// A per-run suffix in base 36, so a rerun on the same database records a new account.
const RUN = Date.now().toString(36)
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (n: number) => ['synthetic', 'retention', 'defaults', 'passphrase', String(n)].join(' ')

function run(name: string, ...args: string[]): string {
  return execFileSync(process.execPath, [serverCli(name), ...args], {
    env: { ...process.env, HANDYHUB_ENV: 'ci', DATABASE_URL: databaseUrl, PORT: port, HOST: '127.0.0.1' },
    encoding: 'utf8',
    stdio: 'pipe',
  })
}
const linkPath = (out: string) => new URL(out.split('\n')[0] as string).pathname
/** The first Owner's invite, or a reset link when another spec already created the Owner. */
function ownerLink(): string {
  try {
    return linkPath(run('staff-access', 'create-owner', OWNER, 'E2E Owner'))
  } catch {
    return linkPath(run('staff-access', 'password-link', OWNER))
  }
}

async function axe(page: Page) {
  await expectAccessible(page)
}

const withDb = async <T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> => {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-staff-retention-defaults' })
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

/** A synthetic staff account disabled eight years ago (a worker who left); returns its id. */
const departedAccount = () =>
  withDb(async (db) => {
    const departed = new Date(Date.UTC(new Date().getUTCFullYear() - 8, 0, 15, 15, 0, 0))
    const user = await db
      .insertInto('identity.staff_users')
      .values({
        email: `e2e-departed-${RUN}@example.test`,
        display_name: `E2E departed worker ${RUN}`,
        locale: 'en',
        status: 'disabled',
        invited_at: departed,
        disabled_at: departed,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: 'worker', issued_by: 'e2e:staff-retention-defaults' })
      .execute()
    return user.id
  })

test.describe('retention defaults (TSK-0138, OWN-DEC-177, HH-PRIV-01)', () => {
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-PRIV-01][HH-DATA-09][HH-STAFF-02] a staff account that left 7 years ago waits in the Owner review queue and is archived, not deleted', async ({
    page,
  }) => {
    const id = await departedAccount()
    const out = JSON.parse(run('retention-scan').trim()) as { opened: Record<string, number> }
    expect(out.opened['staff_accounts']).toBeGreaterThanOrEqual(1)

    await page.goto(ownerLink())
    await page.getByLabel('New password').fill(pw(1))
    await page.getByRole('button', { name: 'Save password' }).click()
    await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
    await page.goto('/staff/sign-in')
    await page.getByLabel('Email').fill(OWNER)
    await page.getByLabel('Password', { exact: true }).fill(pw(1))
    await page.getByRole('button', { name: 'Sign in' }).click()
    // MFA is mandatory (TSK-0154): enrol on the account's first sign-in, the code afterwards.
    await passSecondFactor(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()

    await page.getByRole('link', { name: 'Retention reviews' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Retention reviews' })).toBeVisible()
    const schedule = page.getByRole('list', { name: 'Retention schedule' })
    await expect(
      schedule
        .getByRole('listitem', { name: 'Staff accounts' })
        .getByText("7 years after the staff member's departure (access ends at once), then your deletion review."),
    ).toBeVisible()
    await expect(
      schedule
        .getByRole('listitem', { name: 'Consent records' })
        .getByText('5 years after the last relevant use (the withdrawal), then your deletion review.'),
    ).toBeVisible()
    await expect(
      schedule
        .getByRole('listitem', { name: 'Login sessions and access links' })
        .getByText('30 days after the session or link expired or ended, then your deletion review.'),
    ).toBeVisible()
    await expect(
      schedule.getByRole('listitem', { name: 'Technical logs' }).getByText(/^Ordinary application logs: 90 days\./),
    ).toBeVisible()
    await expect(
      schedule
        .getByRole('listitem', { name: 'Settings and content history' })
        .getByText(/^Kept while retained records depend on it;/),
    ).toBeVisible()

    // The staff-account category only: this spec's account, named by its ID, never by its name or email.
    await page.getByLabel('Category').selectOption({ label: 'Staff accounts' })
    await page.getByRole('button', { name: 'Show entries' }).click()
    const entries = page.getByRole('list', { name: 'Review entries' })
    const entry = entries.getByRole('listitem', { name: `Staff account: ${id.slice(0, 8)}` })
    await expect(entry).toHaveCount(1)
    await expect(entry.getByText('Awaiting your review')).toBeVisible()
    await expect(entry.getByText('7 years under retention.staff_accounts, version 1')).toBeVisible()
    await expect(entries.getByText(`E2E departed worker ${RUN}`)).toHaveCount(0)
    await axe(page)

    // No irreversible deletion until the CPA and the attorney confirm the periods: Archive keeps the account.
    await entry.getByRole('button', { name: 'Delete, archive or keep…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Are you sure you want to delete this entry?' })
    await expect(dialog.getByText(`Staff account: ${id.slice(0, 8)}`)).toBeVisible()
    await expect(
      dialog.getByText('The software does not delete this kind of record yet; its history is kept.'),
    ).toBeVisible()
    await expect(dialog.getByRole('button', { name: /^Confirm Delete/ })).toBeDisabled()
    await axe(page)
    await dialog.getByLabel('Reason (required)').fill('Synthetic e2e: keep the departed account.')
    await dialog.getByRole('button', { name: 'Archive instead' }).click()
    await expect(dialog.getByText('Archived: the record is kept as it is.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(entry.getByText('Archived', { exact: true })).toBeVisible()

    // Nothing was deleted: the account is still there, still disabled.
    const kept = await withDb((db) =>
      db.selectFrom('identity.staff_users').select('status').where('id', '=', id).executeTakeFirst(),
    )
    expect(kept).toEqual({ status: 'disabled' })
  })
})
