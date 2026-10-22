// Owner approval before publishing over the threshold in real browsers (TSK-0130; HH-EST-16, HH-EST-04, T26,
// OWN-DEC-173 with the final owner amendments of 2026-10-22, FACT-OWNER-APPROVAL-THRESHOLD, HH-A11Y-01). The Owner
// (created by an earlier spec; this spec only resets the password) invites an Estimator, who writes a $2,600.00
// estimate: publishing waits for the Owner, the Estimator asks, the Owner finds it in the approval queue of Owner
// Decisions, approves it with a comment, and the Estimator publishes that exact version. The estimate terms v1.0 are
// not recorded by the migrations: this spec records a synthetic test-only terms version for its own run and restores
// NOT CONFIGURED afterwards. The threshold is the seeded configuration. Every account, request, amount and comment is
// synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type Page } from '@playwright/test'
import { passSecondFactor } from '../mfa.js'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OWNER = 'e2e-owner@example.test'
const ESTIMATOR = 'e2e-approval-estimator@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (n: number) => ['synthetic', 'staff', 'owner', 'approval', 'passphrase', String(n)].join(' ')
// This spec's own synthetic client addresses (RFC 5737): the sign-in and request-form limits count per network.
const OWNER_NETWORK = { 'x-forwarded-for': '198.51.100.191' }
const ESTIMATOR_NETWORK = { 'x-forwarded-for': '198.51.100.192' }
const REQUEST_NETWORK = { 'x-forwarded-for': '198.51.100.193' }
test.use({ extraHTTPHeaders: OWNER_NETWORK })
/** A run-unique suffix in base 36 (never a long run of digits in free text). */
const run = Date.now().toString(36)

function staffAccess(...args: string[]): string {
  const out = execFileSync(process.execPath, [cli, ...args], {
    env: { ...process.env, HANDYHUB_ENV: 'ci', DATABASE_URL: databaseUrl, PORT: port, HOST: '127.0.0.1' },
    encoding: 'utf8',
    stdio: 'pipe',
  })
  return new URL(out.split('\n')[0] as string).pathname
}
async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}
async function setPassword(page: Page, link: string, password: string) {
  await page.goto(link)
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
async function csrfOf(page: Page): Promise<string> {
  return ((await (await page.request.get('/api/v1/staff/auth/session')).json()) as { csrfToken: string }).csrfToken
}

/** A new active version of a configuration key, as recordPolicyVersion writes it (value null: NOT CONFIGURED). */
async function recordVersion(key: string, value: unknown, sourceIds: string[]) {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-owner-approval' })
  try {
    await db.transaction().execute(async (trx) => {
      const latest = await trx
        .selectFrom('platform.policy_version')
        .select((eb) => eb.fn.max('version').as('max'))
        .where('key', '=', key)
        .executeTakeFirst()
      await trx
        .updateTable('platform.policy_version')
        .set({ status: 'superseded' })
        .where('key', '=', key)
        .where('status', '=', 'active')
        .execute()
      await trx
        .insertInto('platform.policy_version')
        .values({
          key,
          version: Number(latest?.max ?? 0) + 1,
          state: value === null ? 'not_configured' : 'configured',
          value: value === null ? null : JSON.stringify(value),
          proposed: false,
          source_ids: sourceIds,
          changed_by: 'e2e',
          change_reason: 'synthetic e2e configuration',
        })
        .execute()
    })
  } finally {
    await db.destroy()
  }
}

const CHECKS = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

test.describe('Owner approval before publishing over the threshold (TSK-0130)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test.beforeAll(async () => {
    await recordVersion(
      'legal.estimate_terms',
      {
        documentId: 'test-estimate-terms-1',
        status: 'draft',
        attorneyReviewed: false,
        preparedOn: '2026-10-21',
        contentSha256: '0'.repeat(64),
      },
      ['TEST-SYNTHETIC'],
    )
  })
  test.afterAll(async () => {
    await recordVersion('legal.estimate_terms', null, ['HH-EST-13', 'OWN-DEC-127', 'OQ-ATTORNEY-TERMS'])
  })

  test('[HH-EST-16][T26] over $2,500.00 the Estimator asks, the Owner approves with a comment, then it is published', async ({
    page,
    browser,
  }) => {
    // A synthetic request, qualified and ready for its estimate (the Owner, through the staff API).
    const res = await page.request.post('/api/v1/public/requests', {
      headers: { ...REQUEST_NETWORK, 'idempotency-key': ['synthetic', 'e2e', 'owner', 'approval', run].join('-') },
      data: {
        formVersion: 'e2e-1',
        privacyNoticeVersion: 'privacy-notice-1',
        services: [{ serviceId: 'SVC-DW-01' }],
        notSure: false,
        description: 'Synthetic e2e owner approval request.',
        property: { street: '191 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
        timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
        estimatePreference: 'online',
        contact: {
          fullName: 'E2E Approval Customer',
          email: `e2e-approval-${run}@example.test`,
          phone: '(502) 555-0191',
          preferredChannel: 'email',
        },
        smsOptIn: false,
        marketingOptIn: false,
      },
    })
    expect(res.status()).toBe(201)
    const reference = ((await res.json()) as { reference: string }).reference
    await setPassword(page, staffAccess('password-link', OWNER), pw(1))
    await signIn(page, OWNER, pw(1))
    const csrf = await csrfOf(page)
    const invite = await page.request.post('/api/v1/staff/invitations', {
      data: { email: ESTIMATOR, displayName: 'E2E Approval Estimator', role: 'estimator', reason: 'E2E approval' },
      headers: { 'idempotency-key': ['e2e', 'approval', 'invite', run].join('-'), 'x-csrf-token': csrf },
    })
    expect(invite.status()).toBe(201)
    const list = (await (await page.request.get('/api/v1/staff/requests?state=received')).json()) as {
      items: { id: string; reference: string }[]
    }
    const requestId = list.items.find((i) => i.reference === reference)?.id as string
    const act = (path: string, method: 'PUT' | 'POST', data: unknown, version: number) =>
      page.request.fetch(`/api/v1/staff/requests/${requestId}${path}`, {
        method,
        data,
        headers: {
          'x-csrf-token': csrf,
          'idempotency-key': ['e2e', 'approval', path.replace(/\W/g, ''), run].join('-'),
          'if-match': `"${version}"`,
        },
      })
    expect((await act('/qualification', 'PUT', { checks: CHECKS }, 0)).status()).toBe(200)
    const detail = (await (await page.request.get(`/api/v1/staff/requests/${requestId}`)).json()) as { version: number }
    expect(
      (await act('/actions/online-estimate', 'POST', { workPackages: ['SVC-DW-01'] }, detail.version)).status(),
    ).toBe(200)

    // The Estimator writes $2,600.00: publishing waits for the Owner.
    const estimator = await (await browser.newContext({ extraHTTPHeaders: ESTIMATOR_NETWORK })).newPage()
    await setPassword(estimator, staffAccess('password-link', ESTIMATOR), pw(2))
    await signIn(estimator, ESTIMATOR, pw(2))
    await estimator.goto(`/staff/requests/${requestId}`)
    await estimator.getByRole('button', { name: 'Write an Estimate' }).click()
    await expect(estimator.getByRole('heading', { level: 1, name: `Estimate ${reference}-E1` })).toBeVisible()
    const versionUrl = estimator.url()
    await estimator.getByRole('button', { name: 'Add a line to Patching & Repair' }).click()
    const line = estimator.getByRole('group', { name: 'Line 1' })
    await line.getByLabel('Description').fill('Synthetic: patch and finish the wall')
    await line.getByLabel('Quantity', { exact: true }).fill('1')
    await line.getByLabel('Unit', { exact: true }).fill('job')
    await line.getByLabel('Unit price (USD)').fill('2600.00')
    await estimator.getByRole('button', { name: 'Save draft' }).click()
    await expect(estimator.getByText('Draft saved. Amounts and totals were computed on the server.')).toBeVisible()
    const approval = estimator.getByTestId('owner-approval')
    await expect(approval.getByText('Owner approval needed', { exact: true })).toBeVisible()
    await expect(approval.getByText('Over $2,500.00 (configuration version 1)')).toBeVisible()
    await expect(
      approval.getByText('The final proposed total is over the Owner approval threshold', { exact: true }),
    ).toBeVisible()
    const lifecycle = estimator.getByTestId('estimate-lifecycle')
    await expect(lifecycle.getByRole('button', { name: 'Publish', exact: true })).toBeDisabled()
    await expect(lifecycle.getByText("Publishing waits for the Owner's approval.")).toBeVisible()
    await axe(estimator)
    await approval.getByRole('button', { name: 'Ask the Owner to approve' }).click()
    await expect(approval.getByText('The Owner was asked to approve this version.')).toBeVisible()
    await expect(approval.getByText('Waiting for the Owner', { exact: true }).first()).toBeVisible()

    // The Owner: the approval queue in Owner Decisions, then the decision on the estimate.
    await page.goto('/staff')
    await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
    const queue = page.getByTestId('approval-queue')
    const row = queue.getByTestId('approval-queue-item').filter({ hasText: `${reference}-E1` })
    await expect(row).toHaveCount(1)
    await expect(row.getByText('$2,600.00')).toBeVisible()
    await expect(row.getByText('E2E Approval Estimator')).toBeVisible()
    await axe(page)
    await row.getByRole('link', { name: new RegExp(`^${reference}-E1 version 1`) }).click()
    await expect(page.getByRole('heading', { level: 1, name: `Estimate ${reference}-E1` })).toBeVisible()
    const decide = page.getByTestId('owner-approval-decide')
    await expect(decide.getByText('Prepared by E2E Approval Estimator')).toBeVisible()
    await decide.getByLabel('Comment').fill('Synthetic: scope and price checked.')
    await axe(page)
    await decide.getByRole('button', { name: 'Approve for publishing' }).click()
    await expect(page.getByText('Approved. This exact version can now be published.')).toBeVisible()
    await expect(page.getByTestId('owner-approval').getByText('Synthetic: scope and price checked.')).toBeVisible()

    // The Estimator publishes the approved version.
    await estimator.goto(versionUrl)
    await expect(estimator.getByRole('heading', { level: 1, name: `Estimate ${reference}-E1` })).toBeVisible()
    await expect(
      estimator.getByTestId('owner-approval').getByText('Approved by the Owner', { exact: true }),
    ).toBeVisible()
    const panel = estimator.getByTestId('estimate-lifecycle')
    await panel.getByRole('button', { name: 'Publish', exact: true }).click()
    await panel.getByRole('button', { name: 'Publish now' }).click()
    await expect(panel.getByText('Published. The customer notice is queued.')).toBeVisible()
    await expect(estimator.getByTestId('owner-approval').getByText(/^Used to publish, /)).toBeVisible()
    await axe(estimator)
    await estimator.context().close()
  })

  test('[HH-EST-16] the Owner sees the threshold in force in Settings', async ({ page }) => {
    await signIn(page, OWNER, pw(1))
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Configuration' }).click()
    const setting = page.getByTestId('approval-threshold')
    await expect(setting.getByRole('heading', { name: 'Owner approval threshold' })).toBeVisible()
    await expect(setting.getByText(/^Over \$2,500\.00 \(configuration version \d+\)$/)).toBeVisible()
    await axe(page)
  })
})
