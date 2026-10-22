// The retention reviews screen in a real browser (TSK-0099; HH-PRIV-01, HH-DATA-09, T74, ENT-RetentionReview,
// OWN-DEC-70, OWN-DEC-142). The spec records one synthetic audit entry dated eight years ago (the audit log accepts
// new entries only, so it is inserted, never edited), runs the retention review once with the operations command, and
// the Owner finds that entry in the deletion-review queue with its hold checks, while the entry itself is still in
// the audit log. Nothing is deleted. TSK-0100 (HH-PRIV-05): the entry opens the Delete confirmation, which says why
// deletion is blocked (audit entries are append-only for every role) and archives it instead. The Owner account is created by whichever spec runs first; this one only sets
// its password with a link. All data is synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type Page } from '@playwright/test'
import { passSecondFactor } from '../mfa.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.199' }
test.use({ extraHTTPHeaders: HEADERS })

const serverCli = (name: string) => fileURLToPath(new URL(`../../server/dist/cli/${name}.js`, import.meta.url))
const OWNER = 'e2e-owner@example.test'
// A per-run suffix in base 36, so a rerun on the same database records a new entry.
const RUN = Date.now().toString(36)
const ACTION = `automation.e2e_retention_probe_${RUN}`
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (n: number) => ['synthetic', 'retention', 'review', 'passphrase', String(n)].join(' ')

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
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

/** One synthetic audit entry recorded eight years ago; returns its sequence number. */
async function oldAuditEntry(): Promise<string> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-staff-retention' })
  try {
    const row = await db
      .insertInto('platform.audit_events')
      .values({
        occurred_at: new Date(Date.now() - 8 * 365.25 * 24 * 3600 * 1000),
        actor_kind: 'system',
        actor_process: 'e2e:staff-retention',
        action: ACTION,
        target_type: 'e2e_probe',
        result: 'succeeded',
        summary: JSON.stringify({ probe: RUN }),
        request_id: `e2e-retention-${RUN}`,
      })
      .returning(['seq'])
      .executeTakeFirstOrThrow()
    return String(row.seq)
  } finally {
    await db.destroy()
  }
}

async function stillInAuditLog(seq: string): Promise<number> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-staff-retention' })
  try {
    return (await db.selectFrom('platform.audit_events').select('id').where('seq', '=', seq).execute()).length
  } finally {
    await db.destroy()
  }
}

test.describe('retention reviews (TSK-0099, HH-PRIV-01, HH-DATA-09)', () => {
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-PRIV-01][HH-DATA-09][T74][HH-PRIV-05] an expired audit entry waits in the Owner review queue and is archived, not deleted', async ({
    page,
  }) => {
    const seq = await oldAuditEntry()
    const out = JSON.parse(run('retention-scan').trim()) as { opened: Record<string, number> }
    expect(out.opened['audit_log']).toBeGreaterThanOrEqual(1)

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
    await expect(page.getByText(/^Records whose retention period has ended wait here for your review\./)).toBeVisible()
    await expect(page.getByText('The retention periods await CPA and attorney confirmation.')).toBeVisible()
    const schedule = page.getByRole('list', { name: 'Retention schedule' })
    await expect(
      schedule
        .getByRole('listitem', { name: 'Requests that never became jobs' })
        .getByText('2 years after the request closed, then your deletion review.'),
    ).toBeVisible()
    await expect(
      schedule
        .getByRole('listitem', { name: 'Audit-log records' })
        .getByText('7 years after the entry was recorded, then your deletion review.'),
    ).toBeVisible()

    // The audit-log category only: this spec's entry, with its hold checks and no control to delete it.
    await page.getByLabel('Category').selectOption({ label: 'Audit-log records' })
    await page.getByRole('button', { name: 'Show entries' }).click()
    const entries = page.getByRole('list', { name: 'Review entries' })
    const entry = entries.getByRole('listitem', { name: `Audit entry: #${seq} ${ACTION}` })
    await expect(entry).toHaveCount(1)
    await expect(entry.getByText('Awaiting your review')).toBeVisible()
    await expect(entry.getByText('7 years under retention.audit_log, version 1')).toBeVisible()
    await expect(entry.getByText('Not applicable')).toBeVisible()
    await expect(entry.getByText('Not recorded in the software: check before deciding')).toHaveCount(8)
    await axe(page)

    // TSK-0100: the confirmation names the entry and says why it cannot be deleted; Archive keeps it.
    await entry.getByRole('button', { name: 'Delete, archive or keep…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Are you sure you want to delete this entry?' })
    await expect(dialog.getByText(`Audit entry: #${seq} ${ACTION}`)).toBeVisible()
    await expect(dialog.getByText('Audit entries are append-only for every role.')).toBeVisible()
    await expect(dialog.getByRole('button', { name: /^Confirm Delete/ })).toBeDisabled()
    await axe(page)
    await dialog.getByLabel('Reason (required)').fill('Synthetic e2e: audit entries are kept.')
    await dialog.getByRole('button', { name: 'Archive instead' }).click()
    await expect(dialog.getByText('Archived: the record is kept as it is.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(entry.getByText('Archived', { exact: true })).toBeVisible()

    // Nothing was deleted: the entry is still in the append-only audit log.
    expect(await stillInAuditLog(seq)).toBe(1)
  })
})
