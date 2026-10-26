// Property records and the protected access-code store in a real browser (TSK-0045; HH-CRM-02, HH-CRM-03, T28).
// The Owner opens the property of a synthetic request from its customer record, records a detail (a code typed into
// it is refused), changes the address (the old one stays a former address and the request keeps it), enters a gate
// code, reveals it once and hides it again. The code never appears in the property record's response. Accounts,
// requests, addresses and codes are synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { passSecondFactor } from '../mfa.js'
import { expectAccessible } from '../a11y.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OWNER = 'e2e-owner@example.test'
// Built at runtime so no literal looks like a credential or a code (RULE-SYNTHETIC-DATA).
const pw = (n: number) => ['synthetic', 'staff', 'properties', 'passphrase', String(n)].join(' ')
const GATE_CODE = ['SYNX', '4745', 'E2E'].join('-')

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
  await expectAccessible(page)
}

async function submit(request: APIRequestContext, email: string, street: string) {
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `e2e-properties-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      // A published privacy policy version (TSK-0024); an unknown version is refused.
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic e2e property-records request.',
      property: { street, city: 'Testville', state: 'KY', zip: '40445', propertyType: 'house' },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: { fullName: 'E2E Property Synthetic', email, phone: '(502) 555-0145', preferredChannel: 'email' },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { reference: string }).reference
}

// This spec's own synthetic client address (RFC 5737): the request-form limit counts per network.
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.145' } })

test.describe('property records and access codes (TSK-0045, HH-CRM-02, HH-CRM-03)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-CRM-02][HH-CRM-03][T28] details with their source, address history, and a code revealed once then hidden', async ({
    page,
  }) => {
    const run = Date.now()
    const email = `e2e-property-${run}@example.test`
    const street = `${run % 100000} Propertyspec Court`
    const moved = `${run % 100000} Propertyspec Moved Road`
    const reference = await submit(page.request, email, street)

    await setPassword(page, ownerLink(), pw(1))
    await signIn(page, OWNER, pw(1))
    await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()

    // From the customer record to its property.
    await page.getByRole('navigation').getByRole('link', { name: 'Customers' }).click()
    const search = page.getByRole('search', { name: 'Search customers' })
    await search.getByRole('searchbox', { name: 'Search customers' }).fill(email)
    await search.getByRole('button', { name: 'Search' }).click()
    // The search answers asynchronously: wait for the filtered list (one match) before opening it.
    const openCustomer = page.getByRole('link', { name: 'Open customer' })
    await expect(openCustomer).toHaveCount(1)
    await openCustomer.click()
    await expect(page.getByRole('heading', { level: 1, name: 'Customer E2E Property Synthetic' })).toBeVisible()
    await page.getByRole('region', { name: 'Properties' }).getByRole('link', { name: 'Open property' }).click()
    await expect(page).toHaveURL(/\/staff\/properties\/[0-9a-f-]{36}$/)
    const propertyId = page.url().split('/').pop() as string
    await expect(page.getByRole('heading', { level: 1, name: `Property ${street}, Testville, KY 40445` })).toBeVisible()
    const address = page.getByRole('region', { name: 'Service address' })
    await expect(address.getByText(/Last confirmed .* \(Request form, the customer\)/).first()).toBeVisible()
    await axe(page)

    // A detail with its source; an access code typed into it is refused.
    const details = page.getByRole('region', { name: 'Property details' })
    const notes = details.getByRole('article', { name: 'Access instructions (no codes)' })
    await expect(notes.getByText('Not recorded', { exact: true })).toBeVisible()
    await notes.getByRole('button', { name: 'Edit Access instructions (no codes)' }).click()
    const notesForm = notes.getByRole('form', { name: 'Edit Access instructions (no codes)' })
    await notesForm.getByRole('textbox', { name: 'Access instructions (no codes)' }).fill('Side gate, code 4821')
    await notesForm.getByLabel('Source').selectOption('customer_message')
    await notesForm.getByRole('textbox', { name: /Reason/ }).fill('Customer email')
    await notesForm.getByRole('button', { name: 'Save' }).click()
    await expect(notesForm.getByText(/This looks like an access code/)).toBeVisible()
    await notesForm.getByRole('textbox', { name: 'Access instructions (no codes)' }).fill('Use the side gate.')
    await notesForm.getByRole('button', { name: 'Save' }).click()
    await expect(notes.getByText('Use the side gate.')).toBeVisible()
    await expect(notes.getByText(/Last confirmed .* \(Customer in writing, E2E Owner\)/)).toBeVisible()

    // An address change keeps the old address as a former address; the request keeps the one it was sent with.
    await address.getByRole('button', { name: 'Change address' }).click()
    const addressForm = address.getByRole('form', { name: 'Change address' })
    await addressForm.getByRole('textbox', { name: 'Street address' }).fill(moved)
    await addressForm.getByRole('textbox', { name: /Reason/ }).fill('Customer called: the street was wrong')
    await addressForm.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('heading', { level: 1, name: `Property ${moved}, Testville, KY 40445` })).toBeVisible()
    await expect(address.getByText(`${street}, Testville, KY 40445`)).toBeVisible()
    const requests = page.getByRole('region', { name: 'Requests at this property' })
    await expect(requests.getByRole('link', { name: `Request ${reference}` })).toBeVisible()
    await expect(requests.getByText(`${street}, Testville, KY 40445`)).toBeVisible()
    await expect(requests.getByText('Former address')).toBeVisible()
    await expect(
      page.getByRole('region', { name: 'Change history' }).getByText(/Reason: Customer called: the street was wrong/),
    ).toBeVisible()

    // TSK-0127 (final owner amendments 2026-10-22): the ZIP check is screening; staff check the complete current
    // address and record its county before a first visit can be confirmed.
    const county = page.getByRole('region', { name: 'Address and county check' })
    await expect(county.getByText('Not verified yet for the current address.')).toBeVisible()
    await county.getByRole('button', { name: 'Record address and county check' }).click()
    const countyForm = county.getByRole('form', { name: 'Record address and county check' })
    await countyForm.getByLabel('County', { exact: true }).selectOption({ label: 'Jefferson County, KY' })
    await countyForm.getByLabel('I checked the complete address, including any unit number').check()
    await countyForm.getByRole('textbox', { name: 'How it was verified (optional)' }).fill('Synthetic county record')
    await countyForm.getByRole('button', { name: 'Record address and county check' }).click()
    await expect(
      county.getByText(
        /Jefferson County, KY: in the service area\. Verified by E2E Owner on .* \(address version 2\)\./,
      ),
    ).toBeVisible()
    await axe(page)

    // A gate code: entered, masked, revealed once, hidden again.
    const codes = page.getByRole('region', { name: 'Access codes' })
    const add = codes.getByRole('form', { name: 'Add an access code' })
    await add.getByLabel('Kind').selectOption('gate')
    await add.getByRole('textbox', { name: 'Label (optional)' }).fill('Back gate')
    await add.getByRole('textbox', { name: 'Code or key location' }).fill(GATE_CODE)
    await add.getByRole('textbox', { name: /Reason/ }).fill('Customer called with the gate code')
    await add.getByRole('button', { name: 'Save code' }).click()
    const item = codes.getByRole('listitem', { name: 'Gate code: Back gate' })
    await expect(item.getByText('Hidden')).toBeVisible()
    await expect(item.getByText('Never revealed')).toBeVisible()
    await expect(page.getByText(GATE_CODE)).toHaveCount(0)
    await axe(page)
    await item.getByRole('button', { name: 'Reveal code' }).click()
    await expect(item.getByText(GATE_CODE)).toBeVisible()
    await expect(item.getByText(/Shown for a short time only; this reveal is recorded/)).toBeVisible()
    await axe(page)
    await item.getByRole('button', { name: 'Hide' }).click()
    await expect(page.getByText(GATE_CODE)).toHaveCount(0)
    await expect(item.getByText('Hidden')).toBeVisible()

    // The record itself never carries the code; the reveal is listed with who and when.
    const record = await page.request.get(`/api/v1/staff/properties/${propertyId}`)
    expect(record.status()).toBe(200)
    expect(await record.text()).not.toContain(GATE_CODE)
    await page.reload()
    await expect(
      page.getByRole('listitem', { name: 'Gate code: Back gate' }).getByText(/Last revealed .* by E2E Owner/),
    ).toBeVisible()
    await expect(page.getByText(GATE_CODE)).toHaveCount(0)
  })
})
