// The audit-retention workflow in a real browser (TSK-0135; HH-SEC-08, HH-SEC-06, T74, ENT-AuditEvent, OWN-DEC-164).
// The spec records three synthetic audit entries dated in 2016 (the audit log accepts new entries only, so they are
// inserted, never edited), runs the daily retention review once with the operations command (it seals the hash
// chain), and the Owner deletes exactly those entries from the retention screen: the range preview, every check the
// software does not record confirmed, a reason. The trail shows the operation and the chain verifies across the
// deletion. Only this spec's entries are counted. The Owner account is created by whichever spec runs first; this one
// only sets its password with a link. All data is synthetic (RULE-SYNTHETIC-DATA).
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
const HEADERS = { 'x-forwarded-for': '198.51.100.135' }
test.use({ extraHTTPHeaders: HEADERS })

const serverCli = (name: string) => fileURLToPath(new URL(`../../server/dist/cli/${name}.js`, import.meta.url))
const OWNER = 'e2e-owner@example.test'
// A per-run suffix in base 36, so a rerun on the same database records new entries.
const RUN = Date.now().toString(36)
const ACTION = `automation.e2e_audit_retention_probe_${RUN}`
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (n: number) => ['synthetic', 'audit', 'retention', 'passphrase', String(n)].join(' ')

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

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-staff-retention-audit' })
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

/** Three synthetic audit entries recorded in 2016, in one statement (consecutive seqs); returns their seqs. */
const oldEntries = () =>
  withDb(async (db) => {
    const rows = await db
      .insertInto('platform.audit_events')
      .values(
        [0, 1, 2].map((i) => ({
          occurred_at: new Date(Date.UTC(2016, 0, 12, 15, i, 0)),
          actor_kind: 'system',
          actor_process: 'e2e:staff-retention-audit',
          action: ACTION,
          target_type: 'e2e_probe',
          result: 'succeeded',
          summary: JSON.stringify({ probe: RUN, n: i }),
          request_id: `e2e-audit-retention-${RUN}`,
        })),
      )
      .returning(['seq'])
      .execute()
    return rows.map((r) => String(r.seq)).sort((a, b) => Number(a) - Number(b))
  })

const remaining = (seqs: readonly string[]) =>
  withDb(
    async (db) =>
      (
        await db
          .selectFrom('platform.audit_events')
          .select('id')
          .where('seq', 'in', [...seqs])
          .execute()
      ).length,
  )

test.describe('audit retention (TSK-0135, HH-SEC-08)', () => {
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-SEC-08][HH-SEC-06][HH-STAFF-08][T74] the Owner deletes audit entries past 7 years in the retention workflow; the trail and the chain show it', async ({
    page,
  }) => {
    const seqs = await oldEntries()
    const [from, , to] = seqs as [string, string, string]
    run('retention-scan')

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
    const section = page.getByTestId('audit-retention')
    await expect(section.getByRole('heading', { name: 'Audit-record retention' })).toBeVisible()
    await expect(
      section.getByText(/^Audit entries are never edited\. 7 years after an entry was recorded/),
    ).toBeVisible()
    await expect(section.getByText(/the backup retention is NOT CONFIGURED/)).toBeVisible()

    await section.getByLabel('From entry #').fill(from)
    await section.getByLabel('To entry #').fill(to)
    await section.getByRole('button', { name: 'Show range' }).click()
    const range = section.getByTestId('audit-range')
    await expect(range.getByText(`Entries #${from} to #${to}: 3 entries`)).toBeVisible()
    const del = range.getByRole('button', { name: /^Delete these entries permanently/ })
    await expect(del).toBeDisabled()
    for (const box of await range.getByRole('checkbox').all()) await box.check()
    await range.getByLabel('Reason (required)').fill('Synthetic e2e: past the period, no longer obligation.')
    await axe(page)
    await range.getByRole('button', { name: 'Delete these entries permanently' }).click()
    await expect(section.getByText('The entries are deleted; the operation is in the trail.')).toBeVisible()
    await expect(section.getByRole('listitem', { name: `Deleted: entries #${from} to #${to}` })).toBeVisible()

    await section.getByRole('button', { name: 'Verify the hash chain' }).click()
    await expect(section.getByText(/^The chain verifies: /)).toBeVisible()
    expect(await remaining(seqs)).toBe(0)
  })
})
