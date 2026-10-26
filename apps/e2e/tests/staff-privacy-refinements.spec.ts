// Privacy request refinements in a real browser (TSK-0152; OWN-DEC-201 I1, I5, HH-PRIV-03, HH-PRIV-01, HH-PRIV-05). A
// synthetic request is sent through the API; the Owner records a privacy request for its contact, verified outside the
// portal (the secure alternative path), reviews it and completes it after confirming the identity evidence; then the
// Owner reads the table-to-retention mapping on the Retention reviews screen and records a review without the CPA's and
// the attorney's confirmations, so production deletion stays disabled. The Owner account is created by whichever spec
// runs first; this one only sets its password with a link. It asserts only on the records it creates (the database is
// shared with the other specs). Every visitor, address and account is synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { passSecondFactor } from '../mfa.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.152' }
test.use({ extraHTTPHeaders: HEADERS })

const serverCli = (name: string) => fileURLToPath(new URL(`../../server/dist/cli/${name}.js`, import.meta.url))
const OWNER = 'e2e-owner@example.test'
// A per-run suffix in base 36 (never raw digits in free text).
const RUN = Date.now().toString(36)
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (who: string) => ['synthetic', 'refinements', who, 'passphrase', '152'].join(' ')

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

/** The Owner signed in through the staff app in a browser of their own. */
async function ownerSession(browser: Browser) {
  const context = await browser.newContext({ extraHTTPHeaders: HEADERS })
  const page = await context.newPage()
  await page.goto(ownerLink())
  await page.getByLabel('New password').fill(pw('owner'))
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(OWNER)
  await page.getByLabel('Password', { exact: true }).fill(pw('owner'))
  await page.getByRole('button', { name: 'Sign in' }).click()
  // MFA is mandatory (TSK-0154): enrol on the account's first sign-in, the code afterwards.
  await passSecondFactor(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
  return { page, close: () => context.close() }
}

test.describe('privacy request refinements (TSK-0152, OWN-DEC-201)', () => {
  test('[HH-PRIV-03][HH-PRIV-01] a request verified outside the portal, the identity confirmation and the mapping review', async ({
    browser,
    request,
  }) => {
    test.setTimeout(180_000)
    const contactEmail = `refinements-e2e-${RUN}@example.test`
    const sent = await request.post('/api/v1/public/requests', {
      headers: { 'idempotency-key': `synthetic-e2e-refinements-${RUN}` },
      data: {
        formVersion: 'e2e-1',
        privacyNoticeVersion: 'privacy-notice-1',
        services: [{ serviceId: 'SVC-DW-01' }],
        notSure: false,
        description: 'Synthetic refinements project: a cracked closet wall.',
        property: {
          street: '152 Synthetic Refinement Row',
          city: 'Testville',
          state: 'KY',
          zip: '40000',
          propertyType: 'house',
        },
        timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
        estimatePreference: 'online',
        contact: {
          fullName: 'Test Refinements Customer',
          email: contactEmail,
          phone: '(502) 555-0152',
          preferredChannel: 'email',
        },
        smsOptIn: false,
        marketingOptIn: false,
      },
    })
    expect(sent.status()).toBe(201)
    const project = ((await sent.json()) as { reference: string }).reference

    const owner = await ownerSession(browser)
    try {
      const page = owner.page
      await page.getByRole('link', { name: 'Privacy requests' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Privacy requests' })).toBeVisible()
      // I1, the secure alternative: the Owner verified the person another way and records the request.
      await page.getByText('Record a request verified outside the portal').click()
      const form = page.getByRole('form', { name: 'Record a request verified outside the portal' })
      await form.getByLabel('Kind of request').selectOption({ label: 'Data export' })
      await form.getByLabel('Project reference').fill(project)
      await form.getByLabel('Email or phone on file').fill(contactEmail)
      await form.getByLabel('How you verified them').selectOption({ label: 'A call to the phone on file' })
      await form.getByLabel('Verification note (required)').fill('Synthetic e2e: called back on the phone on file.')
      await form.getByRole('button', { name: 'Record the request' }).click()
      const done = form.getByText(/^Request PR-\d+ is recorded\.$/)
      await expect(done).toBeVisible()
      const reference = (await done.textContent())?.match(/PR-\d+/)?.[0] as string
      await axe(page)

      const entry = page.getByRole('listitem', { name: `${reference}: Data export` })
      await expect(entry).toHaveCount(1)
      await entry.getByRole('button', { name: 'Open' }).click()
      const detail = page.getByTestId('privacy-detail')
      await expect(
        detail.getByText(/^Verified by .* outside the portal on .*: A call to the phone on file$/),
      ).toBeVisible()
      await expect(detail.getByText('Risk: elevated')).toBeVisible()
      await detail.getByRole('button', { name: 'Start the review' }).click()
      await expect(detail.getByText('Under review')).toBeVisible()
      await detail
        .getByLabel('Reason (required)')
        .fill('Synthetic e2e: identity verified by a call back; export prepared.')
      // I1: an export is elevated: the Owner confirms the identity evidence before completing it.
      const submit = detail.getByRole('button', { name: /^Record the decision/ })
      await expect(submit).toBeDisabled()
      await detail.getByRole('checkbox', { name: /^I checked the identity evidence above/ }).check()
      await submit.click()
      await expect(
        detail.getByText('The data export is available to the customer in their project page.'),
      ).toBeVisible()
      await expect(detail.getByText(/^Identity evidence confirmed by .* on /)).toBeVisible()
      await axe(page)

      // I5: the table-to-retention mapping, reviewed by the Owner, the CPA and the attorney.
      await page.getByRole('link', { name: 'Retention reviews' }).click()
      const mapping = page.getByTestId('mapping-review')
      await expect(mapping.getByRole('heading', { name: 'Table-to-retention mapping' })).toBeVisible()
      await expect(mapping.getByText('This server: ci')).toBeVisible()
      await expect(
        mapping.getByText('Every table of this database is in the inventory, and every inventory table exists.'),
      ).toBeVisible()
      // Without the CPA's and the attorney's confirmations deletion in production stays disabled.
      await mapping.getByLabel('Note (required)').fill('Synthetic e2e: the Owner read the mapping report.')
      await mapping.getByRole('button', { name: 'Record the review' }).click()
      await expect(mapping.getByText('The review is recorded.')).toBeVisible()
      await expect(mapping.getByText('Production deletion disabled')).toBeVisible()
      await expect(mapping.getByText(/^Last review: .*, of this mapping$/)).toBeVisible()
      await axe(page)
    } finally {
      await owner.close()
    }
  })
})
