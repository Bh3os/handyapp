// The staff home in a real browser (TSK-0041; HH-OPS-01, HH-OPS-02, HH-STAFF-06). A synthetic request is submitted
// through the public API; the server's own job worker turns its request.submitted event into a queue item; the Owner
// opens it from the action queue and the deep link opens the request's record. A worker has My Day instead and the
// server refuses them the queue. Accounts and requests are synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { passSecondFactor } from '../mfa.js'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OWNER = 'e2e-owner@example.test'
const WORKER = 'e2e-queue-worker@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (n: number) => ['synthetic', 'staff', 'queue', 'passphrase', String(n)].join(' ')

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
async function setPassword(page: Page, path: string, password: string) {
  await page.goto(path)
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
}
async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

// This spec's own synthetic client address (RFC 5737): the request-form limit counts per network, and every spec
// reaches the server from 127.0.0.1 (playwright.config.ts trusts one hop on that server).
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.16' } })

test.describe('the staff home: action queue and Owner Decisions (TSK-0041, HH-OPS-01, HH-OPS-02)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-OPS-01][HH-OPS-02][HH-STAFF-06] a new request appears in the Owner’s queue and its deep link opens the record', async ({
    page,
    browser,
  }) => {
    const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
    const submitted = await page.request.post('/api/v1/public/requests', {
      headers: { 'idempotency-key': `e2e-queue-request-${Date.now()}` },
      data: {
        formVersion: 'e2e-1',
        // A published privacy policy version (TSK-0024, migration 0021); an unknown version is refused.
        privacyNoticeVersion: 'privacy-notice-1',
        services: [{ serviceId: 'SVC-DW-01' }],
        notSure: false,
        description: 'Synthetic e2e queue request.',
        property: { street: '300 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
        timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['mornings'] },
        estimatePreference: 'online',
        contact: {
          fullName: 'E2E Queue Customer',
          email: 'e2e-queue-customer@example.test',
          phone: '(502) 555-0142',
          preferredChannel: 'email',
        },
        smsOptIn: false,
        marketingOptIn: false,
      },
    })
    expect(submitted.status()).toBe(201)
    const { reference } = (await submitted.json()) as { reference: string }

    await setPassword(page, ownerLink(), pw(1))
    await signIn(page, OWNER, pw(1))
    await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Owner Decisions' })).toBeVisible()
    // Earlier specs share this database and may leave their own Owner Decisions (a job to close, a privacy request):
    // a new request is never one of them.
    const decisions = page.getByRole('region', { name: 'Owner Decisions' })
    await expect(decisions.getByText(reference)).toHaveCount(0)

    // The server's worker opens the item from the committed event; filtering by reference finds it.
    const queue = page.locator('.staff-queue__list-wrap').first()
    await queue.getByLabel('Reference').fill(reference)
    await queue.getByRole('button', { name: 'Apply filters' }).click()
    const item = page.getByRole('listitem', { name: new RegExp(`New request ${reference}`) })
    await expect(async () => {
      await queue.getByRole('button', { name: 'Apply filters' }).click()
      await expect(item).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 20_000 })
    await expect(item.getByText('New request waiting for a first response')).toBeVisible()
    await expect(item.getByText('Status: Received')).toBeVisible()
    await expect(item.getByText('Unassigned')).toBeVisible()
    await expect(decisions.getByText(reference)).toHaveCount(0)
    await expect(item.getByText(/^Opened .* ago$/)).toBeVisible()
    await axe(page)

    // The one action opens the record through its deep link.
    await item.getByRole('link', { name: 'Review request' }).click()
    await expect(page).toHaveURL(/\/staff\/requests\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { level: 1, name: `Request ${reference}` })).toBeVisible()
    await expect(page.getByText('Patching & Repair')).toBeVisible()
    await axe(page)
    const deepLink = page.url()

    // The deep link opens the record directly too, in a new session (a bookmark or a shared link).
    const other = await (await browser.newContext()).newPage()
    await signIn(other, OWNER, pw(1))
    await expect(other.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
    await other.goto(deepLink)
    await expect(other.getByRole('heading', { level: 1, name: `Request ${reference}` })).toBeVisible()
    await other.getByRole('link', { name: 'Back to the action queue' }).click()
    await expect(other.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
    await other.context().close()

    // Invite a worker for the next test (the Owner's own staff API, with the session's CSRF token).
    const csrf = (await (await page.request.get('/api/v1/staff/auth/session')).json()).csrfToken as string
    const invited = await page.request.post('/api/v1/staff/invitations', {
      data: { email: WORKER, displayName: 'E2E Queue worker', role: 'worker', reason: 'End-to-end queue test' },
      headers: { 'idempotency-key': 'e2e-queue-invite-worker-0001', 'x-csrf-token': csrf },
    })
    expect(invited.status()).toBe(201)
  })

  test('[HH-STAFF-06][T26] a worker lands on My Day; the queue and the record are refused on the server', async ({
    page,
  }) => {
    await setPassword(page, staffAccess('password-link', WORKER), pw(2))
    await signIn(page, WORKER, pw(2))
    await expect(page.getByRole('heading', { level: 1, name: 'My Day' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Action queue' })).toHaveCount(0)
    expect((await page.request.get('/api/v1/staff/queue')).status()).toBe(403)
    expect((await page.request.get('/api/v1/staff/queue/owner-decisions')).status()).toBe(403)
    await page.goto('/staff/queue')
    await expect(page.getByText('This screen is not part of your role.')).toBeVisible()
    await axe(page)
  })
})
