// Write an Estimate in a real browser (TSK-0053; HH-EST-01, HH-EST-05, T31, T58). A synthetic request is submitted
// through the public API and moved to "ready for estimate" by the Owner (TSK-0042); an Estimator opens the pending
// estimate from the action queue, writes an estimate and builds its draft. Accounts, requests and amounts are
// synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OWNER = 'e2e-owner@example.test'
const ESTIMATOR = 'e2e-estimates-estimator@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (n: number) => ['synthetic', 'staff', 'estimates', 'passphrase', String(n)].join(' ')

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
async function setPasswordAndSignIn(page: Page, link: string, email: string, password: string) {
  await page.goto(link)
  await page.getByLabel('New password').fill(password)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
}

// This spec's own synthetic client address (RFC 5737): the request-form limit counts per network.
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.26' } })

async function submitRequest(request: APIRequestContext): Promise<string> {
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `e2e-staff-estimates-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }, { serviceId: 'SVC-PT-01' }],
      notSure: false,
      description: 'Synthetic e2e estimate builder request.',
      property: { street: '500 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'E2E Estimates Customer',
        email: `e2e-estimates-${Date.now()}@example.test`,
        phone: '(502) 555-0144',
        preferredChannel: 'email',
      },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { reference: string }).reference
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

test.describe('Write an Estimate: the staff builder (TSK-0053)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  let reference = ''
  test('[HH-LEAD-02] the Owner invites an Estimator and moves a request to "ready for estimate"', async ({ page }) => {
    reference = await submitRequest(page.request)
    await setPasswordAndSignIn(page, ownerLink(), OWNER, pw(1))
    const csrf = ((await (await page.request.get('/api/v1/staff/auth/session')).json()) as { csrfToken: string })
      .csrfToken
    const invite = await page.request.post('/api/v1/staff/invitations', {
      data: { email: ESTIMATOR, displayName: 'E2E Estimates Estimator', role: 'estimator', reason: 'E2E builder' },
      headers: { 'idempotency-key': `e2e-estimates-invite-${Date.now()}`, 'x-csrf-token': csrf },
    })
    expect(invite.status()).toBe(201)

    const list = (await (await page.request.get('/api/v1/staff/requests?state=received')).json()) as {
      items: { id: string; reference: string }[]
    }
    const id = list.items.find((i) => i.reference === reference)?.id as string
    const write = (path: string, method: 'PUT' | 'POST', data: unknown, version: number) =>
      page.request.fetch(`/api/v1/staff/requests/${id}${path}`, {
        method,
        data,
        headers: {
          'x-csrf-token': csrf,
          'idempotency-key': `e2e-estimates-${path.replace(/\W/g, '')}-${Date.now()}`,
          'if-match': `"${version}"`,
        },
      })
    const checks = Object.fromEntries(CHECKS.map((c) => [c, { outcome: 'ok' }]))
    expect((await write('/qualification', 'PUT', { checks }, 0)).status()).toBe(200)
    const detail = (await (await page.request.get(`/api/v1/staff/requests/${id}`)).json()) as { version: number }
    const moved = await write(
      '/actions/online-estimate',
      'POST',
      { workPackages: ['SVC-DW-01', 'SVC-PT-01'] },
      detail.version,
    )
    expect(moved.status()).toBe(200)
  })

  test('[HH-EST-01][HH-EST-05][T31][T58] an Estimator opens the pending estimate and builds a draft', async ({
    page,
  }) => {
    await setPasswordAndSignIn(page, staffAccess('password-link', ESTIMATOR), ESTIMATOR, pw(2))

    // The pending-estimate item opens with Prepare Online Estimate (and the request.ready_for_estimate job keeps it).
    const item = page.getByRole('listitem', { name: `Pending estimate ${reference}` })
    await expect(async () => {
      await page.reload()
      await expect(item).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await expect(item.getByText('Ready for an estimate')).toBeVisible()
    await item.getByRole('link', { name: 'Write the estimate' }).click()
    await expect(page.getByRole('heading', { level: 1, name: `Request ${reference}` })).toBeVisible()

    await page.getByRole('button', { name: 'Write an Estimate' }).click()
    await expect(page.getByRole('heading', { level: 1, name: `Estimate ${reference}-E1` })).toBeVisible()

    // Issuer and validity from configuration; the missing address line is omitted; the terms are NOT CONFIGURED.
    const doc = page.getByTestId('estimate-document')
    await expect(doc.getByText('Handyhub LLC')).toBeVisible()
    await expect(doc.getByText('Not provided: the address line is left out.')).toBeVisible()
    await expect(doc.getByText('14 days from publishing')).toBeVisible()
    await expect(doc.getByText('Payment due on receipt')).toBeVisible()
    await expect(doc.getByText('NOT CONFIGURED')).toBeVisible()
    await axe(page)

    // A base line on the drywall work package, an optional add-on on the painting one.
    await page.getByRole('button', { name: 'Add a line to Patching & Repair' }).click()
    const first = page.getByRole('group', { name: 'Line 1' })
    await first.getByLabel('Description').fill('Synthetic: patch the hole')
    await first.getByLabel('Quantity', { exact: true }).fill('2.5')
    await first.getByLabel('Unit', { exact: true }).fill('sq ft')
    await first.getByLabel('Quantity source').selectOption('measured_on_site')
    await first.getByLabel('Unit price (USD)').fill('33.33')
    await page.getByRole('button', { name: 'Add a line to Residential Interior Painting' }).click()
    const second = page.getByRole('group', { name: 'Line 2' })
    await second.getByLabel('Line type').selectOption('add_on')
    await second.getByLabel('Description').fill('Synthetic: paint the trim')
    await second.getByLabel('Quantity', { exact: true }).fill('3')
    await second.getByLabel('Unit', { exact: true }).fill('door')
    await second.getByLabel('Unit price (USD)').fill('19.99')
    await page.getByLabel('Exclusions').fill('Synthetic: moving furniture')
    await page.getByLabel('Estimator notes').fill('Synthetic internal note')
    await page.getByRole('button', { name: 'Save draft' }).click()
    await expect(page.getByText('Draft saved. Amounts and totals were computed on the server.')).toBeVisible()

    // Server amounts: 2.5 x $33.33 rounds once half-up to $83.33; the add-on stays outside the total; no deposit.
    await expect(page.getByText('Line amount: $83.33')).toBeVisible()
    await expect(page.getByText('Line amount: $59.97')).toBeVisible()
    const totals = page.getByTestId('estimate-totals')
    await expect(totals.getByText('$83.33').first()).toBeVisible()
    await expect(totals.getByText('Not required under the deposit rule')).toBeVisible()
    await expect(page.getByText(/tax/i)).toHaveCount(0)
    await expect(page.getByText(/minimum/i)).toHaveCount(0)

    // Not ready to publish, with the reason: the estimate terms are NOT CONFIGURED.
    const readiness = page.getByRole('region', { name: 'Ready to publish?' })
    await expect(
      readiness.getByText('Estimate terms version is NOT CONFIGURED (HH-EST-13, OWN-DEC-127, OQ-ATTORNEY-TERMS)'),
    ).toBeVisible()
    await axe(page)

    // The draft is kept: reloading shows what was saved.
    await page.reload()
    await expect(page.getByRole('group', { name: 'Line 1' }).getByLabel('Description')).toHaveValue(
      'Synthetic: patch the hole',
    )
    await expect(page.getByLabel('Exclusions')).toHaveValue('Synthetic: moving furniture')

    // The estimates screen lists it.
    await page.getByRole('navigation').getByRole('link', { name: 'Estimates' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Estimates' })).toBeVisible()
    const listed = page.getByRole('listitem', { name: `Estimate ${reference}-E1` })
    await expect(listed.getByText('Total $83.33')).toBeVisible()
    await expect(listed.getByText('Draft')).toBeVisible()
  })
})
