// Publishing, revising and the publishing permission in a real browser (TSK-0055; HH-EST-04, T26, T32, OWN-DEC-118,
// FACT-AUTOMATIC-MESSAGES). The Owner moves a synthetic request to "ready for estimate" and invites an Estimator, who
// writes, publishes and revises the estimate; the Owner then removes the Estimator's publishing permission and the
// Estimator's next publish is refused. The estimate terms v1.0 are not recorded yet (TSK-0056), so this spec records a
// synthetic test-only terms version for its own run and restores NOT CONFIGURED afterwards. Accounts, requests and
// amounts are synthetic (RULE-SYNTHETIC-DATA).
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
const ESTIMATOR = 'e2e-lifecycle-estimator@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (n: number) => ['synthetic', 'staff', 'lifecycle', 'passphrase', String(n)].join(' ')
// This spec's own synthetic client address (RFC 5737): the sign-in and request-form limits count per network.
const NETWORK = { 'x-forwarded-for': '198.51.100.30' }
test.use({ extraHTTPHeaders: NETWORK })

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
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-lifecycle' })
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

const CHECKS = [
  'coverage',
  'service_fit',
  'essential_facts',
  'urgency',
  'site_visit_need',
  'staff_equipment',
  'risk_flags',
]

test.describe('Estimate lifecycle: publish, revise and the publishing permission (TSK-0055)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test.beforeAll(async () => {
    // A synthetic test-only terms document (never real wording): lets a version become ready to publish.
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
    // The terms stay NOT CONFIGURED for every other spec, and Estimators may publish again as decided.
    await recordVersion('legal.estimate_terms', null, ['HH-EST-13', 'OWN-DEC-127', 'OQ-ATTORNEY-TERMS'])
    await recordVersion('estimate.publishing_roles', { roles: ['owner', 'estimator'] }, ['OWN-DEC-118'])
  })

  let requestId = ''
  let reference = ''

  test('[HH-EST-04][T32] an Estimator publishes directly, revises as version 2 and publishes it', async ({
    page,
    browser,
  }) => {
    // The Owner: a request ready for its estimate, and the Estimator invited.
    const res = await page.request.post('/api/v1/public/requests', {
      headers: { 'idempotency-key': `e2e-lifecycle-${Date.now()}` },
      data: {
        formVersion: 'e2e-1',
        privacyNoticeVersion: 'privacy-notice-1',
        services: [{ serviceId: 'SVC-DW-01' }],
        notSure: false,
        description: 'Synthetic e2e estimate lifecycle request.',
        property: { street: '530 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
        timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
        estimatePreference: 'online',
        contact: {
          fullName: 'E2E Lifecycle Customer',
          email: `e2e-lifecycle-${Date.now()}@example.test`,
          phone: '(502) 555-0145',
          preferredChannel: 'email',
        },
        smsOptIn: false,
        marketingOptIn: false,
      },
    })
    expect(res.status()).toBe(201)
    reference = ((await res.json()) as { reference: string }).reference
    await setPassword(page, ownerLink(), pw(1))
    await signIn(page, OWNER, pw(1))
    const csrf = await csrfOf(page)
    const invite = await page.request.post('/api/v1/staff/invitations', {
      data: { email: ESTIMATOR, displayName: 'E2E Lifecycle Estimator', role: 'estimator', reason: 'E2E lifecycle' },
      headers: { 'idempotency-key': `e2e-lifecycle-invite-${Date.now()}`, 'x-csrf-token': csrf },
    })
    expect(invite.status()).toBe(201)
    const list = (await (await page.request.get('/api/v1/staff/requests?state=received')).json()) as {
      items: { id: string; reference: string }[]
    }
    requestId = list.items.find((i) => i.reference === reference)?.id as string
    const act = (path: string, method: 'PUT' | 'POST', data: unknown, version: number) =>
      page.request.fetch(`/api/v1/staff/requests/${requestId}${path}`, {
        method,
        data,
        headers: {
          'x-csrf-token': csrf,
          'idempotency-key': `e2e-lifecycle-${path.replace(/\W/g, '')}-${Date.now()}`,
          'if-match': `"${version}"`,
        },
      })
    const checks = Object.fromEntries(CHECKS.map((c) => [c, { outcome: 'ok' }]))
    expect((await act('/qualification', 'PUT', { checks }, 0)).status()).toBe(200)
    const detail = (await (await page.request.get(`/api/v1/staff/requests/${requestId}`)).json()) as { version: number }
    expect(
      (await act('/actions/online-estimate', 'POST', { workPackages: ['SVC-DW-01'] }, detail.version)).status(),
    ).toBe(200)

    // The Estimator writes the estimate in the builder.
    const estimator = await (await browser.newContext({ extraHTTPHeaders: NETWORK })).newPage()
    await setPassword(estimator, staffAccess('password-link', ESTIMATOR), pw(2))
    await signIn(estimator, ESTIMATOR, pw(2))
    await estimator.goto(`/staff/requests/${requestId}`)
    await estimator.getByRole('button', { name: 'Write an Estimate' }).click()
    await expect(estimator.getByRole('heading', { level: 1, name: `Estimate ${reference}-E1` })).toBeVisible()
    await estimator.getByRole('button', { name: 'Add a line to Patching & Repair' }).click()
    const line = estimator.getByRole('group', { name: 'Line 1' })
    await line.getByLabel('Description').fill('Synthetic: patch the hole')
    await line.getByLabel('Quantity', { exact: true }).fill('1')
    await line.getByLabel('Unit', { exact: true }).fill('job')
    await line.getByLabel('Unit price (USD)').fill('250.00')
    await estimator.getByRole('button', { name: 'Save draft' }).click()
    await expect(estimator.getByText('Draft saved. Amounts and totals were computed on the server.')).toBeVisible()
    await expect(estimator.getByText('Ready to publish.', { exact: true })).toBeVisible()

    // Publish asks first, then publishes with no Owner approval per estimate.
    const panel = estimator.getByTestId('estimate-lifecycle')
    await panel.getByRole('button', { name: 'Publish', exact: true }).click()
    const confirm = panel.getByRole('group', { name: 'Publish version 1 to the customer?' })
    await expect(confirm).toBeVisible()
    await axe(estimator)
    await confirm.getByRole('button', { name: 'Publish now' }).click()
    await expect(panel.getByText('Published. The customer notice is queued.')).toBeVisible()
    await expect(estimator.getByText('This version can no longer be edited.')).toBeVisible()
    const history = panel.getByRole('table', { name: 'Version history' })
    const v1 = history.getByRole('row').nth(1)
    await expect(v1.getByText('Published', { exact: true })).toBeVisible()
    await expect(v1.getByText(/^Created by E2E Lifecycle Estimator/)).toBeVisible()
    await expect(v1.getByText(/^E2E Lifecycle Estimator, /)).toBeVisible()
    await expect(v1.getByText('$250.00')).toBeVisible()
    await axe(estimator)

    // Revise: version 2 is a new draft; version 1 is kept as it was.
    await panel.getByRole('button', { name: 'Revise as a new version' }).click()
    await expect(estimator.getByRole('heading', { level: 1, name: `Estimate ${reference}-E1` })).toBeVisible()
    await expect(estimator.getByText('Version 2', { exact: true }).first()).toBeVisible()
    const revised = estimator.getByRole('group', { name: 'Line 1' })
    await expect(revised.getByLabel('Description')).toHaveValue('Synthetic: patch the hole')
    await revised.getByLabel('Unit price (USD)').fill('240.00')
    await estimator.getByRole('button', { name: 'Save draft' }).click()
    await expect(estimator.getByText('Draft saved. Amounts and totals were computed on the server.')).toBeVisible()
    const panel2 = estimator.getByTestId('estimate-lifecycle')
    await expect(panel2.getByText('Revised from', { exact: true })).toBeVisible()
    await panel2.getByRole('button', { name: 'Publish', exact: true }).click()
    await panel2.getByRole('button', { name: 'Publish now' }).click()
    await expect(panel2.getByText('Published. The customer notice is queued.')).toBeVisible()
    const rows = panel2.getByRole('table', { name: 'Version history' }).getByRole('row')
    await expect(rows.nth(1).getByText('Superseded')).toBeVisible()
    await expect(rows.nth(2).getByText(/^Revised from version 1 by E2E Lifecycle Estimator/)).toBeVisible()
    await expect(rows.nth(2).getByText('$240.00')).toBeVisible()
    await axe(estimator)

    // Version 1 opens read-only, superseded, pointing to the current version.
    await rows.nth(1).getByRole('link', { name: 'Version 1' }).click()
    const old = estimator.getByTestId('estimate-lifecycle')
    await expect(old.getByText('The current version of this estimate is')).toBeVisible()
    await expect(old.getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0)
    await estimator.context().close()
  })

  test('[T26][OWN-DEC-118] after the Owner removes the permission, the Estimator can no longer publish', async ({
    page,
    browser,
  }) => {
    await signIn(page, OWNER, pw(1))
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Configuration' }).click()
    const setting = page.getByTestId('estimate-publishing')
    await expect(setting.getByRole('heading', { name: 'Who may publish estimates' })).toBeVisible()
    await expect(setting.getByText('The Owner can always publish.')).toBeVisible()
    const box = setting.getByLabel('Estimators may publish estimates')
    await expect(box).toBeChecked()
    await box.uncheck()
    await setting.getByRole('button', { name: 'Save' }).click()
    await expect(setting.getByText('Saved. It applies from the next publish.')).toBeVisible()
    await axe(page)

    // The Estimator revises version 2 into version 3: the draft is theirs to edit, but Publish is gone.
    const estimator = await (await browser.newContext({ extraHTTPHeaders: NETWORK })).newPage()
    await signIn(estimator, ESTIMATOR, pw(2))
    const request = (await (await estimator.request.get(`/api/v1/staff/requests/${requestId}`)).json()) as {
      project: { id: string }
    }
    const projectId = request.project.id
    const project = (await (await estimator.request.get(`/api/v1/staff/projects/${projectId}/estimates`)).json()) as {
      estimates: { versions: { versionId: string; version: number; state: string }[] }[]
    }
    const v2 = project.estimates[0]?.versions.find((v) => v.version === 2)?.versionId as string
    await estimator.goto(`/staff/estimates/${v2}`)
    const panel = estimator.getByTestId('estimate-lifecycle')
    await panel.getByRole('button', { name: 'Revise as a new version' }).click()
    await expect(estimator.getByText('Version 3', { exact: true }).first()).toBeVisible()
    await expect(estimator.getByText('Ready to publish.', { exact: true })).toBeVisible()
    await expect(
      estimator.getByTestId('estimate-lifecycle').getByRole('button', { name: 'Publish', exact: true }),
    ).toHaveCount(0)
    // The server refuses the Estimator's publish itself, not only the menu.
    const v3 = new URL(estimator.url()).pathname.split('/').at(-1) as string
    const view = (await (await estimator.request.get(`/api/v1/staff/estimate-versions/${v3}`)).json()) as {
      rowVersion: number
    }
    const refused = await estimator.request.post(`/api/v1/staff/estimate-versions/${v3}/publish`, {
      data: {},
      headers: {
        'x-csrf-token': await csrfOf(estimator),
        'idempotency-key': `e2e-lifecycle-refused-${Date.now()}`,
        'if-match': `"${view.rowVersion}"`,
      },
    })
    expect(refused.status()).toBe(403)
    await estimator.context().close()

    // The Owner gives the permission back.
    await page.reload()
    await page.getByTestId('estimate-publishing').getByLabel('Estimators may publish estimates').check()
    await page.getByTestId('estimate-publishing').getByRole('button', { name: 'Save' }).click()
    await expect(
      page.getByTestId('estimate-publishing').getByText('Saved. It applies from the next publish.'),
    ).toBeVisible()
  })
})
