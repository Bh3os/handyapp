// Staff requests in a real browser (TSK-0042; HH-LEAD-01, HH-LEAD-02, HH-LEAD-08, HH-SVC-04, T26, T30, T37).
// Synthetic requests are submitted through the public API; the Owner opens each one from the requests list, reads
// the original request, records the qualification and takes one of the four actions. Accounts and requests are
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
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (n: number) => ['synthetic', 'staff', 'requests', 'passphrase', String(n)].join(' ')

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

// This spec's own synthetic client address (RFC 5737): the request-form limit counts per network.
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.17' } })

let n = 0
async function submitRequest(request: APIRequestContext, description: string): Promise<string> {
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `e2e-staff-requests-${Date.now()}-${++n}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'draft-e2e-1',
      services: [{ serviceId: 'SVC-DW-01' }, { serviceId: 'SVC-PT-01' }],
      notSure: false,
      description,
      property: { street: '400 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'E2E Requests Customer',
        email: `e2e-requests-${n}@example.test`,
        phone: '(502) 555-0143',
        preferredChannel: 'email',
      },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { reference: string }).reference
}

/** Opens a request from the requests list, by reference. */
async function openFromList(page: Page, reference: string) {
  await page.getByRole('navigation').getByRole('link', { name: 'Requests' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Requests' })).toBeVisible()
  const item = page.getByRole('listitem', { name: `Request ${reference}` })
  await item.getByRole('link', { name: 'Open request' }).click()
  await expect(page.getByRole('heading', { level: 1, name: `Request ${reference}` })).toBeVisible()
}

const CHECKS = [
  'Coverage',
  'Service fit',
  'Missing essential facts',
  'Urgency',
  'Need for a site visit',
  'Staff and equipment eligibility',
  'Risk flags',
]
async function qualifyAll(page: Page) {
  const form = page.getByRole('region', { name: 'Qualification' })
  for (const check of CHECKS) await form.getByRole('group', { name: check, exact: true }).getByLabel('OK').check()
  await form.getByRole('button', { name: 'Save qualification' }).click()
  await expect(page.getByText('Qualification saved.')).toBeVisible()
}

test.describe('staff requests: original view, qualification and the four actions (TSK-0042)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  const refs: string[] = []
  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext({
      baseURL: `http://127.0.0.1:${port}`,
      extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.17' },
    })
    for (const d of ['estimate', 'visit', 'question', 'decline'])
      refs.push(await submitRequest(request, `Synthetic e2e ${d} request.`))
    await request.dispose()
  })

  test.beforeEach(async ({ page }) => {
    await page.goto(ownerLink())
    await page.getByLabel('New password').fill(pw(1))
    await page.getByRole('button', { name: 'Save password' }).click()
    await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
    await page.goto('/staff/sign-in')
    await page.getByLabel('Email').fill(OWNER)
    await page.getByLabel('Password', { exact: true }).fill(pw(1))
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
  })

  test('[HH-LEAD-01][HH-LEAD-02][HH-SVC-04] the original request, the qualification and Prepare Online Estimate', async ({
    page,
  }) => {
    const reference = refs[0] as string
    await openFromList(page, reference)
    const original = page.getByTestId('original-request')
    await expect(original.getByText('Synthetic e2e estimate request.')).toBeVisible()
    await expect(original.getByText(/400 Synthetic Way, Testville, KY 40000/)).toBeVisible()
    await expect(original.getByText('Email: Unverified')).toBeVisible()
    await expect(original.getByText('Phone: Unverified')).toBeVisible()
    // The original request has no edit control.
    await expect(original.getByRole('textbox')).toHaveCount(0)
    await expect(page.getByText("Customer's stated preference: Site visit. Staff confirm the approach.")).toBeVisible()
    await axe(page)

    // The estimating routes need the qualification first: the server says what is missing.
    await page.getByRole('button', { name: 'Prepare Online Estimate', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm: Prepare Online Estimate' }).click()
    await expect(page.getByText('Record every qualification point first.')).toBeVisible()

    // The form stays open with what was entered; after the qualification the same confirmation goes through.
    await qualifyAll(page)
    await page.getByRole('button', { name: 'Confirm: Prepare Online Estimate' }).click()
    await expect(page.getByText('Done. The request has moved on.')).toBeVisible()
    await expect(page.getByText('Ready for estimate').first()).toBeVisible()
    const history = page.getByRole('region', { name: 'History' })
    await expect(history.getByText('Received → Ready for estimate')).toBeVisible()
    // One project, one work package per service.
    await expect(history.getByRole('listitem').filter({ hasText: 'Patching & Repair' })).toBeVisible()
    await expect(history.getByRole('listitem').filter({ hasText: 'Residential Interior Painting' })).toBeVisible()
    await axe(page)
  })

  test('[HH-SVC-04][T37] Arrange Estimate Visit needs a customer-facing explanation and books nothing', async ({
    page,
  }) => {
    await openFromList(page, refs[1] as string)
    await qualifyAll(page)
    await page.getByRole('button', { name: 'Arrange Estimate Visit', exact: true }).click()
    await expect(page.getByText(/No visit is booked and no message is sent now/)).toBeVisible()
    await page.getByLabel(/Short explanation for the customer/).fill('We need to see the wall to measure it.')
    await page.getByRole('button', { name: 'Confirm: Arrange Estimate Visit' }).click()
    await expect(page.getByText('Done. The request has moved on.')).toBeVisible()
    await expect(page.getByText('Offer estimate-visit windows')).toBeVisible()
    await expect(page.getByText('Shown to the customer: We need to see the wall to measure it.')).toBeVisible()
  })

  test('[HH-LEAD-02][HH-STATE-02] Ask a Question moves the request on; asking again is refused by the server', async ({
    page,
  }) => {
    await openFromList(page, refs[2] as string)
    await page.getByRole('button', { name: 'Ask a Question', exact: true }).click()
    await page.getByLabel('Internal note (staff only, optional)').fill('Synthetic: need the ceiling height.')
    await page.getByRole('button', { name: 'Confirm: Ask a Question' }).click()
    await expect(page.getByText('Done. The request has moved on.')).toBeVisible()
    await expect(page.getByText("Waiting on the customer's answers")).toBeVisible()
    await expect(page.getByText('Internal note (staff only): Synthetic: need the ceiling height.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ask a Question', exact: true })).toBeDisabled()

    // The server refuses the invalid transition whatever the screen offers.
    const id = new URL(page.url()).pathname.split('/').pop() as string
    const csrf = ((await (await page.request.get('/api/v1/staff/auth/session')).json()) as { csrfToken: string })
      .csrfToken
    const detail = (await (await page.request.get(`/api/v1/staff/requests/${id}`)).json()) as { version: number }
    const again = await page.request.post(`/api/v1/staff/requests/${id}/actions/ask-question`, {
      data: {},
      headers: {
        'x-csrf-token': csrf,
        'idempotency-key': `e2e-ask-again-${Date.now()}`,
        'if-match': `"${detail.version}"`,
      },
    })
    expect(again.status()).toBe(409)
    expect(((await again.json()) as { error: { fieldErrors: { code: string }[] } }).error.fieldErrors).toEqual([
      expect.objectContaining({ code: 'INVALID_TRANSITION' }),
    ])
  })

  test('[HH-LEAD-08][T30][T26] Not a Fit shows the customer text, closes and keeps the history; guests are refused', async ({
    page,
    browser,
  }) => {
    await openFromList(page, refs[3] as string)
    await page.getByRole('button', { name: 'Not a Fit', exact: true }).click()
    await page.getByLabel('Reason category').selectOption('coverage')
    await page.getByLabel(/Plain-language reason the customer sees/).fill('the property is outside the area we serve.')
    const text =
      "Thank you for considering HandyHub. We're unable to take on this project because the property is outside the area we serve."
    await expect(page.getByText(text)).toBeVisible()
    await axe(page)
    await page.getByRole('button', { name: 'Confirm: Not a Fit' }).click()
    await expect(page.getByText('Done. The request has moved on.')).toBeVisible()
    await expect(page.getByText('Closed; the history is kept')).toBeVisible()
    await expect(page.getByRole('region', { name: 'History' }).getByText(text)).toBeVisible()
    await expect(page.getByTestId('original-request').getByText('Synthetic e2e decline request.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Not a Fit', exact: true })).toBeDisabled()

    const guest = await (await browser.newContext()).newPage()
    expect((await guest.request.get('/api/v1/staff/requests')).status()).toBe(401)
    await guest.context().close()
  })
})
