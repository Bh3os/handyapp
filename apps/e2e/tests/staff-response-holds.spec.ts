// The first-response clock and review holds in a real browser (TSK-0043; HH-LEAD-04, HH-LEAD-05, OWN-DEC-115,
// OWN-DEC-116, T40, RULE-SAFETY-GATES). Synthetic requests are submitted through the public API; the Owner sees the
// internal response target in the queue and on the record, records a call that stops it, flags a potential hazard
// that blocks estimating, and resolves the review hold with a note and the reviewer. Accounts and requests are
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
const pw = (n: number) => ['synthetic', 'staff', 'clock', 'passphrase', String(n)].join(' ')

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
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.23' } })

let n = 0
async function submitRequest(request: APIRequestContext, description: string): Promise<string> {
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `e2e-clock-holds-${Date.now()}-${++n}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description,
      property: { street: '500 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'E2E Clock Customer',
        email: `e2e-clock-${n}@example.test`,
        phone: '(502) 555-0144',
        preferredChannel: 'email',
      },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.status()).toBe(201)
  const body = (await res.json()) as { reference: string }
  // The internal target is never shown to the customer.
  expect(JSON.stringify(body)).not.toMatch(/due|target|clock/i)
  return body.reference
}

const CHECKS = [
  'Coverage',
  'Service fit',
  'Missing essential facts',
  'Urgency',
  'Need for a site visit',
  'Staff and equipment eligibility',
]

test.describe('the first-response clock and review holds (TSK-0043)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  const refs: string[] = []
  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext({
      baseURL: `http://127.0.0.1:${port}`,
      extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.23' },
    })
    for (const d of ['clock', 'hazard']) refs.push(await submitRequest(request, `Synthetic e2e ${d} request.`))
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

  test('[HH-LEAD-05][OWN-DEC-115][OWN-DEC-116] the queue and the record show the internal target; a recorded call stops it', async ({
    page,
  }) => {
    const reference = refs[0] as string
    const queue = page.locator('.staff-queue__list-wrap').first()
    await queue.getByLabel('Reference').fill(reference)
    const item = page.getByRole('listitem', { name: new RegExp(`New request ${reference}`) })
    await expect(async () => {
      await queue.getByRole('button', { name: 'Apply filters' }).click()
      await expect(item).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 20_000 })
    // Remaining (or paused, or overdue) time in daily hours, always labelled an internal target.
    await expect(item.getByText(/(left|Overdue by).* · Internal response target, not a customer promise/)).toBeVisible()
    await axe(page)

    await item.getByRole('link', { name: 'Review request' }).click()
    await expect(page.getByRole('heading', { level: 1, name: `Request ${reference}` })).toBeVisible()
    await expect(page.getByTestId('response-clock')).toContainText('Internal response target, not a customer promise')
    const first = page.getByRole('region', { name: 'First response' })
    await expect(first.getByText('No conversations recorded.')).toBeVisible()
    await axe(page)

    // A completed call with its outcome is a meaningful response: the clock stops.
    const form = first.getByRole('form', { name: 'Record a completed conversation' })
    await form.getByLabel('How you spoke with the customer').selectOption('phone')
    await form.getByLabel(/Outcome \(staff only\)/).fill('Synthetic: talked through the job; photos to follow.')
    await form.getByRole('button', { name: 'Record a completed conversation' }).click()
    await expect(page.getByText('Conversation recorded.')).toBeVisible()
    await expect(first.getByText('Answered', { exact: true })).toBeVisible()
    await expect(first.getByText('Synthetic: talked through the job; photos to follow.')).toBeVisible()
    await expect(page.getByTestId('response-clock')).toContainText('a conversation was recorded')

    // Answered but still received: it stays a new request, shown as answered, until one of the four actions takes it.
    await page.getByRole('link', { name: 'Back to the action queue' }).click()
    await queue.getByLabel('Reference').fill(reference)
    await queue.getByRole('button', { name: 'Apply filters' }).click()
    await expect(item.getByText(/Answered (within|after) the target/)).toBeVisible()
    await item.getByRole('link', { name: 'Review request' }).click()
    await page.getByRole('button', { name: 'Ask a Question', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm: Ask a Question' }).click()
    await expect(page.getByText('Done. The request has moved on.')).toBeVisible()

    // Answered and handled: the new-request item leaves the queue. The request's failed receipt (TSK-0032) and its
    // failed project access link (TSK-0034), both NOT CONFIGURED, stay listed as their own delivery items.
    await page.getByRole('link', { name: 'Back to the action queue' }).click()
    await queue.getByLabel('Reference').fill(reference)
    await queue.getByRole('button', { name: 'Apply filters' }).click()
    await expect(page.getByRole('listitem', { name: new RegExp(`Delivery failure ${reference}`) })).toHaveCount(2)
    await expect(item).toHaveCount(0)
  })

  test('[HH-LEAD-04][T40][RULE-SAFETY-GATES] a hazard flag opens a review hold that blocks estimating until the Owner resolves it', async ({
    page,
  }) => {
    const reference = refs[1] as string
    await page.getByRole('navigation').getByRole('link', { name: 'Requests' }).click()
    await page
      .getByRole('listitem', { name: `Request ${reference}` })
      .getByRole('link', { name: 'Open request' })
      .click()
    await expect(page.getByRole('heading', { level: 1, name: `Request ${reference}` })).toBeVisible()

    // The risk flags need attention: name the potential hazard and say what was seen.
    const form = page.getByRole('region', { name: 'Qualification' })
    for (const check of CHECKS) await form.getByRole('group', { name: check, exact: true }).getByLabel('OK').check()
    const risk = form.getByRole('group', { name: 'Risk flags', exact: true })
    await risk.getByLabel('Needs attention').check()
    await risk.getByLabel('Licensed trade work (electrical, plumbing, HVAC, gas)').check()
    await risk.getByLabel('Note (optional)').fill('Synthetic: the customer mentions sparking outlets.')
    await form.getByRole('button', { name: 'Save qualification' }).click()
    await expect(page.getByText('Qualification saved.')).toBeVisible()

    const holds = page.getByRole('region', { name: 'Review holds' })
    await expect(holds.getByText('Licensed trade work (electrical, plumbing, HVAC, gas)')).toBeVisible()
    await expect(holds.getByText('Open', { exact: true })).toBeVisible()
    await expect(holds.getByText('Estimating is blocked until every review hold is resolved.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Prepare Online Estimate', exact: true })).toBeDisabled()
    await axe(page)

    // The server refuses the estimate path whatever the screen offers.
    const id = new URL(page.url()).pathname.split('/').pop() as string
    const csrf = ((await (await page.request.get('/api/v1/staff/auth/session')).json()) as { csrfToken: string })
      .csrfToken
    const detail = (await (await page.request.get(`/api/v1/staff/requests/${id}`)).json()) as { version: number }
    const refused = await page.request.post(`/api/v1/staff/requests/${id}/actions/online-estimate`, {
      data: { workPackages: ['SVC-DW-01'] },
      headers: {
        'x-csrf-token': csrf,
        'idempotency-key': `e2e-held-estimate-${Date.now()}`,
        'if-match': `"${detail.version}"`,
      },
    })
    expect(refused.status()).toBe(409)
    expect(((await refused.json()) as { error: { fieldErrors: { code: string }[] } }).error.fieldErrors).toEqual([
      expect.objectContaining({ code: 'REVIEW_HOLD_OPEN' }),
    ])

    // Review, then resolve with how it was resolved and who reviewed it.
    await holds.getByRole('button', { name: 'Start review' }).click()
    await expect(holds.getByText('Under review', { exact: true })).toBeVisible()
    await holds.getByRole('button', { name: 'Resolve', exact: true }).click()
    const resolve = holds.getByRole('form', { name: 'Resolve' })
    await resolve
      .getByLabel(/How it was resolved/)
      .fill('Synthetic: the outlets are out of scope; the job avoids them.')
    await resolve.getByLabel(/Who reviewed it/).fill('Synthetic Owner')
    await resolve.getByRole('button', { name: 'Confirm: resolve the hold' }).click()
    await expect(holds.getByText('Resolved', { exact: true })).toBeVisible()
    await expect(holds.getByText(/reviewed by Synthetic Owner/)).toBeVisible()
    await expect(holds.getByText('Estimating is blocked until every review hold is resolved.')).toHaveCount(0)

    await page.getByRole('button', { name: 'Prepare Online Estimate', exact: true }).click()
    await page.getByRole('button', { name: 'Confirm: Prepare Online Estimate' }).click()
    await expect(page.getByText('Done. The request has moved on.')).toBeVisible()
    await axe(page)
  })
})
