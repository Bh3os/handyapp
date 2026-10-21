// Customer records in a real browser (TSK-0044; HH-CRM-01, HH-ID-02, HH-STAFF-05, T21). Two synthetic requests share
// one email (a landlord and a tenant); the server's own job worker turns the second into a duplicate suggestion for
// staff review. The Owner opens it from the action queue, sees both customers kept separate with the suggestion
// labelled as one, records "not the same customer" with a reason, and adds a restricted note. Accounts, requests
// and notes are synthetic (RULE-SYNTHETIC-DATA).
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
const pw = (n: number) => ['synthetic', 'staff', 'customers', 'passphrase', String(n)].join(' ')

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
}
async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function submit(request: APIRequestContext, fullName: string, email: string, phone: string, street: string) {
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `e2e-customers-${fullName.replace(/\W/g, '')}-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      // A published privacy policy version (TSK-0024); an unknown version is refused.
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic e2e customer-records request.',
      property: { street, city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: { fullName, email, phone, preferredChannel: 'email' },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { reference: string }).reference
}

// This spec's own synthetic client address (RFC 5737): the request-form limit counts per network.
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.144' } })

test.describe('customer records and duplicate suggestions (TSK-0044, HH-CRM-01, HH-ID-02, HH-STAFF-05)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[T21][HH-ID-02][HH-CRM-01][HH-STAFF-05] a shared email is a suggestion for review; nothing is merged; notes keep their class', async ({
    page,
  }) => {
    const run = Date.now()
    const shared = `e2e-shared-${run}@example.test`
    await submit(page.request, 'E2E Landlord Synthetic', shared, '(502) 555-0171', `${run % 1000} Landlord Way`)
    const tenantRef = await submit(
      page.request,
      'E2E Tenant Synthetic',
      shared,
      '(502) 555-0172',
      `${run % 1000} Tenant Way`,
    )

    await setPassword(page, ownerLink(), pw(1))
    await signIn(page, OWNER, pw(1))
    await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()

    // The server's worker records the suggestion from the committed event and opens its queue item.
    const queue = page.locator('.staff-queue__list-wrap').first()
    await queue.getByLabel('Reference').fill(tenantRef)
    const item = page.getByRole('listitem', { name: new RegExp(`Possible duplicate customer ${tenantRef}`) })
    await expect(async () => {
      await queue.getByRole('button', { name: 'Apply filters' }).click()
      await expect(item).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 20_000 })
    await expect(
      item.getByText('Shares an email, phone or address with another customer: review, never merged automatically'),
    ).toBeVisible()
    await item.getByRole('link', { name: 'Review suggestion' }).click()
    await expect(page).toHaveURL(/\/staff\/customers\/[0-9a-f-]{36}$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Customer E2E Tenant Synthetic' })).toBeVisible()

    // The two customers stay separate: the record has only its own project; the other is a labelled suggestion.
    const projects = page.getByRole('region', { name: 'Projects and requests' })
    await expect(projects.getByRole('link')).toHaveCount(1)
    await expect(projects.getByRole('link', { name: `Request ${tenantRef}` })).toBeVisible()
    const suggestions = page.getByRole('region', { name: 'Possible duplicates' })
    await expect(
      suggestions.getByText(/Suggestions only: a shared email, phone or address is never proof/),
    ).toBeVisible()
    const suggestion = suggestions.getByRole('listitem', { name: 'Possible duplicate: E2E Landlord Synthetic' })
    await expect(suggestion.getByText('Shares: Same email')).toBeVisible()
    await expect(suggestion.getByText('Waiting for review')).toBeVisible()
    await expect(page.getByRole('button', { name: /merge/i })).toHaveCount(0)
    const contact = page.getByRole('article', { name: 'E2E Tenant Synthetic' })
    // Email and phone verification are shown separately.
    await expect(contact.getByText(/^Email: /)).toBeVisible()
    await expect(contact.getByText(/^Phone: /)).toBeVisible()
    await expect(page.getByText('Not available yet: these records are added in a later release.')).toHaveCount(2)
    await axe(page)

    // Not the same customer: a reason is required, and the suggestion is then reviewed; nothing else changes.
    await suggestion.getByLabel(/Reason/).fill('Landlord and tenant of the same address')
    await suggestion.getByRole('button', { name: 'Not the same customer' }).click()
    await expect(suggestion.getByText('Reviewed: not the same customer')).toBeVisible()
    await expect(suggestion.getByText(/Landlord and tenant of the same address/)).toBeVisible()
    await expect(projects.getByRole('link')).toHaveCount(1)

    // A restricted incident note keeps its class; the Owner reads it.
    const notes = page.getByRole('region', { name: 'Notes' })
    await expect(notes.getByText('Never write passwords, access codes or card numbers in a note.')).toBeVisible()
    await notes.getByLabel('New note').fill('Synthetic e2e note: the tenant reported a damaged step.')
    await notes.getByLabel('Visibility').selectOption('restricted_incident')
    await notes.getByRole('button', { name: 'Add note' }).click()
    const note = notes
      .getByRole('listitem')
      .filter({ hasText: 'Synthetic e2e note: the tenant reported a damaged step.' })
    await expect(note.getByText('Restricted: incident')).toBeVisible()
    const history = page.getByRole('region', { name: 'Activity history' })
    await expect(history.getByText('Possible duplicate reviewed: not the same customer')).toBeVisible()
    await expect(history.getByText('Request sent')).toBeVisible()
    await axe(page)

    // The request record links back to its own customer record.
    await projects.getByRole('link', { name: `Request ${tenantRef}` }).click()
    await expect(page.getByRole('heading', { level: 1, name: `Request ${tenantRef}` })).toBeVisible()
    await page.getByRole('link', { name: 'E2E Tenant Synthetic' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Customer E2E Tenant Synthetic' })).toBeVisible()

    // The customers list finds both by the shared email; each is its own record.
    await page.getByRole('navigation').getByRole('link', { name: 'Customers' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Customers' })).toBeVisible()
    const search = page.getByRole('search', { name: 'Search customers' })
    await search.getByRole('searchbox', { name: 'Search customers' }).fill(shared)
    await search.getByRole('button', { name: 'Search' }).click()
    await expect(page.getByRole('heading', { level: 2, name: 'E2E Landlord Synthetic' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'E2E Tenant Synthetic' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open customer' })).toHaveCount(2)
    await axe(page)
  })
})
