// Human-reviewed merges and relinks with the Owner's reversal in a real browser (TSK-0046; HH-CRM-04, HH-ID-02, T21,
// T29). Two synthetic requests share an email and a phone: the server's worker records a duplicate suggestion, and
// nothing is merged until the Owner opens the merge review, checks both records and confirms with a reason. A third
// request is then linked to the surviving customer and back, and the Owner reverses the link and the merge; each step
// keeps its history. Accounts, requests and contact details are synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { passSecondFactor } from '../mfa.js'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OWNER = 'e2e-owner@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (n: number) => ['synthetic', 'staff', 'record', 'links', 'passphrase', String(n)].join(' ')

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

async function submit(request: APIRequestContext, fullName: string, email: string, phone: string, street: string) {
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `e2e-links-${fullName.replace(/\W/g, '')}-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      // A published privacy policy version (TSK-0024); an unknown version is refused.
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic e2e record-links request.',
      property: { street, city: 'Testville', state: 'KY', zip: '40046', propertyType: 'house' },
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
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.146' } })

test.describe('human-reviewed merges and relinks (TSK-0046, HH-CRM-04, HH-ID-02, T21, T29)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[T29][T21][HH-CRM-04][HH-ID-02] a suggestion is merged only after the preview; a request is relinked; the Owner reverses both', async ({
    page,
  }) => {
    const run = Date.now()
    const one = `E2E Merge One ${run}`
    const two = `E2E Merge Two ${run}`
    const renter = `E2E Relink Renter ${run}`
    const shared = `e2e-merge-${run}@example.test`
    const oneRef = await submit(page.request, one, shared, '(502) 555-0146', `${run % 1000} Merge Way`)
    const twoRef = await submit(page.request, two, shared, '(502) 555-0146', `${run % 1000} Second Merge Way`)
    const renterRef = await submit(
      page.request,
      renter,
      `e2e-relink-${run}@example.test`,
      '(502) 555-0147',
      `${run % 1000} Relink Way`,
    )

    await setPassword(page, ownerLink(), pw(1))
    await signIn(page, OWNER, pw(1))
    await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()

    // The worker turns the shared contact into a suggestion for review; nothing is merged by it.
    const queue = page.locator('.staff-queue__list-wrap').first()
    await queue.getByLabel('Reference').fill(twoRef)
    const item = page.getByRole('listitem', { name: new RegExp(`Possible duplicate customer ${twoRef}`) })
    await expect(async () => {
      await queue.getByRole('button', { name: 'Apply filters' }).click()
      await expect(item).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 20_000 })
    await item.getByRole('link', { name: 'Review suggestion' }).click()
    await expect(page.getByRole('heading', { level: 1, name: `Customer ${two}` })).toBeVisible()
    const suggestion = page.getByRole('listitem', { name: `Possible duplicate: ${one}` })
    await expect(suggestion.getByText('Waiting for review')).toBeVisible()
    await expect(page.getByRole('button', { name: /merge/i })).toHaveCount(0)

    // The merge review: both records, their projects, documents and payments, before anything happens.
    await suggestion.getByRole('link', { name: 'Review merge' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Review merge' })).toBeVisible()
    const source = page.getByRole('region', { name: `Record to merge: ${two}` })
    const survivor = page.getByRole('region', { name: `Record that stays: ${one}` })
    await expect(source.getByText(new RegExp(`Project ${twoRef}`))).toBeVisible()
    await expect(survivor.getByText(new RegExp(`Project ${oneRef}`))).toBeVisible()
    await expect(page.getByText('Not available yet: these records are added in a later release.')).toHaveCount(2)
    await expect(page.getByText(/Customer access is rechecked: no one gets access/)).toBeVisible()
    await axe(page)
    await page.getByLabel(/Reason/).fill('Same person sent two requests')
    await page.getByRole('button', { name: 'Merge records' }).click()

    // The record that stays shows both projects; the merge is in its history with the reason.
    await expect(page.getByRole('heading', { level: 1, name: `Customer ${one}` })).toBeVisible()
    const projects = page.getByRole('region', { name: 'Projects and requests' })
    await expect(projects.getByRole('link', { name: `Request ${oneRef}` })).toBeVisible()
    await expect(projects.getByRole('link', { name: `Request ${twoRef}` })).toBeVisible()
    const history = page.getByRole('region', { name: 'Merges and relinks' })
    const mergeItem = history.getByRole('listitem', { name: `${two} merged into ${one}` })
    await expect(mergeItem.getByText('In effect')).toBeVisible()
    await expect(mergeItem.getByText(/Reason: Same person sent two requests/)).toBeVisible()
    await expect(page.getByRole('article', { name: two }).getByText(/From a record merged into this one/)).toBeVisible()
    await axe(page)

    // A request from someone else is linked to this customer from its request record, after its own preview.
    await page.getByRole('navigation').getByRole('link', { name: 'Customers' }).click()
    const search = page.getByRole('search', { name: 'Search customers' })
    await search.getByRole('searchbox', { name: 'Search customers' }).fill(renterRef)
    await search.getByRole('button', { name: 'Search' }).click()
    // The search answers asynchronously: wait for the filtered list (one match) before opening it.
    const openRenter = page.getByRole('link', { name: 'Open customer' })
    await expect(openRenter).toHaveCount(1)
    await openRenter.click()
    await expect(page.getByRole('heading', { level: 1, name: `Customer ${renter}` })).toBeVisible()
    await page.getByRole('link', { name: `Request ${renterRef}` }).click()
    await expect(page.getByRole('heading', { level: 1, name: `Request ${renterRef}` })).toBeVisible()
    await page.getByRole('link', { name: 'Link to another customer' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Link the request to another customer' })).toBeVisible()
    const find = page.getByRole('search', { name: 'Find the customer' })
    await find.getByRole('searchbox', { name: 'Find the customer' }).fill(one)
    await find.getByRole('button', { name: 'Search' }).click()
    await page.getByRole('button', { name: `Choose ${one}` }).click()
    await expect(page.getByRole('region', { name: `Will be linked to: ${one}` })).toBeVisible()
    await expect(page.getByRole('region', { name: `Linked to now: ${renter}` })).toBeVisible()
    await expect(page.getByText(/The requester never gets access to that customer's other projects/)).toBeVisible()
    await axe(page)
    await page.getByLabel(/Reason/).fill('Synthetic: the owner of this home asked for the work')
    await page.getByRole('button', { name: 'Link the request' }).click()
    await expect(page.getByRole('heading', { level: 1, name: `Customer ${one}` })).toBeVisible()
    await expect(projects.getByRole('link', { name: `Request ${renterRef}` })).toBeVisible()

    // The Owner reverses the relink, then the merge: each comes back as it was, and the history keeps both.
    const relinkItem = history.getByRole('listitem', { name: `Request ${renterRef} linked from ${renter} to ${one}` })
    await relinkItem.getByLabel(/Reason/).fill('Linked to the wrong customer')
    await relinkItem.getByRole('button', { name: 'Reverse' }).click()
    await expect(relinkItem.getByText('Reversed', { exact: true })).toBeVisible()
    await expect(relinkItem.getByText(/Reason: Linked to the wrong customer/)).toBeVisible()
    await expect(projects.getByRole('link', { name: `Request ${renterRef}` })).toHaveCount(0)
    await mergeItem.getByLabel(/Reason/).fill('Not the same person after all')
    await mergeItem.getByRole('button', { name: 'Reverse' }).click()
    await expect(mergeItem.getByText('Reversed', { exact: true })).toBeVisible()
    await expect(projects.getByRole('link', { name: `Request ${twoRef}` })).toHaveCount(0)
    await expect(projects.getByRole('link', { name: `Request ${oneRef}` })).toBeVisible()
    await axe(page)

    // The merged record is its own record again; its suggestion is closed with the Owner's reason.
    await mergeItem.getByRole('link', { name: two }).click()
    await expect(page.getByRole('heading', { level: 1, name: `Customer ${two}` })).toBeVisible()
    await expect(
      page.getByRole('region', { name: 'Projects and requests' }).getByRole('link', { name: `Request ${twoRef}` }),
    ).toBeVisible()
    const closed = page.getByRole('listitem', { name: `Possible duplicate: ${one}` })
    await expect(closed.getByText('Reviewed: not the same customer')).toBeVisible()
    await expect(closed.getByText(/Not the same person after all/)).toBeVisible()
  })
})
