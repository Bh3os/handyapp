// The ZIP coverage checker in a real browser (TSK-0022, TSK-0127; HH-CUS-03, HH-INT-16, T07, OWN-DEC-88, OWN-DEC-73,
// OWN-DEC-179). First the owner's ZIP dataset as migration 0067 seeds it; then a rule set imported from a synthetic
// Census-format file whose 999xx ZIPs do not exist (RULE-SYNTHETIC-DATA), through the operations command, verifying
// the dataset, then approved, exactly as the real file would be.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type Page } from '@playwright/test'
import { GATE_PASSWORD, GATE_USER } from '../gate.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const gatedPort = process.env['E2E_GATED_PORT'] ?? '4313'
const cli = fileURLToPath(new URL('../../server/dist/cli/coverage.js', import.meta.url))
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)

const MESSAGES = {
  // PROPOSED wording (final owner amendments 2026-10-22): a ZIP match is screening, not address verification.
  in_coverage:
    'Your ZIP code looks like it’s in our service area. Tell us about your project, and we’ll confirm the address.',
  boundary: 'You may be within our service area. Send your request and we’ll confirm the address.',
  out_of_coverage: 'Outside our usual coverage? You can still request an estimate—we’ll check whether we can help.',
  unknown: "We couldn't confirm this ZIP. You can still submit your request for review.",
}
const MAILING_NOTE =
  'This ZIP code is used for mail only. Enter the ZIP code of the property where you need the work done.'
const ZIPS = { in_coverage: '99901', boundary: '99902', out_of_coverage: '99904', unknown: '99999' } as const

const HEADER =
  'OID_ZCTA5_20|GEOID_ZCTA5_20|NAMELSAD_ZCTA5_20|AREALAND_ZCTA5_20|AREAWATER_ZCTA5_20|MTFCC_ZCTA5_20|CLASSFP_ZCTA5_20|' +
  'FUNCSTAT_ZCTA5_20|OID_COUNTY_20|GEOID_COUNTY_20|NAMELSAD_COUNTY_20|AREALAND_COUNTY_20|AREAWATER_COUNTY_20|' +
  'MTFCC_COUNTY_20|CLASSFP_COUNTY_20|FUNCSTAT_COUNTY_20|AREALAND_PART|AREAWATER_PART'
const row = (zcta: string, geoid: string, county: string, land: number) =>
  `1|${zcta}|ZCTA5 ${zcta}|10|0|G6350|B5|S|2|${geoid}|${county}|10|0|G4020|H1|A|${land}|0`
const FILE = [
  HEADER,
  row('99901', '21901', 'Jefferson County', 100),
  row('99902', '21902', 'Oldham County', 70),
  row('99902', '21903', 'Synthetic County', 30),
  row('99904', '21903', 'Synthetic County', 100),
  '',
].join('\n')

function coverageCli(...args: string[]): string {
  return execFileSync(process.execPath, [cli, ...args], {
    env: { ...process.env, HANDYHUB_ENV: 'ci', DATABASE_URL: databaseUrl },
    encoding: 'utf8',
  })
}

async function check(page: Page, zip: string) {
  // The checker is a client:load island: a ZIP typed into the server-rendered form before it hydrates is lost (and
  // a click submits the bare HTML form). Astro removes the island's `ssr` attribute once it has hydrated.
  await expect(page.locator('astro-island', { has: page.locator('.hh-coverage__form') })).not.toHaveAttribute('ssr')
  await page.getByLabel('ZIP code', { exact: true }).fill(zip)
  await page.getByRole('button', { name: 'Check ZIP' }).click()
}

// This spec's own synthetic client address (RFC 5737): the request-form limit counts per network, and every spec
// reaches the server from 127.0.0.1 (playwright.config.ts trusts one hop on that server).
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.11' } })

test.describe('ZIP coverage checker (TSK-0022, HH-CUS-03, T07)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-CUS-03][OWN-DEC-179] the owner ZIP dataset answers from migration 0067: SERVED, EDGE, and UNKNOWN for a mailing ZIP', async ({
    page,
  }) => {
    const status = coverageCli('status')
    expect(status).toMatch(/ZIP dataset v1 .*\n {2}169 unique ZIP codes/)
    expect(status).toMatch(/Matches the stated counts\./)
    await page.goto('/')
    // ZIPs of the owner's dataset (OWN-DEC-179): one service county, two service counties, a PO Box ZIP.
    for (const [zip, outcome] of [
      ['40202', 'in_coverage'],
      ['40241', 'boundary'],
      ['40201', 'unknown'],
    ] as const) {
      await check(page, zip)
      const result = page.getByRole('status')
      await expect(result.getByText(MESSAGES[outcome])).toBeVisible()
      await expect(result).not.toContainText(/appointment|schedul|price|\$|travel/i)
      await expect(page.getByRole('link', { name: 'Continue with Request' })).toHaveAttribute('href', '/request')
      if (outcome === 'unknown') await expect(result.getByText(MAILING_NOTE)).toBeVisible()
      else await expect(result.getByText(MAILING_NOTE)).toHaveCount(0)
    }
    const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
    expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })

  test('[HH-CUS-03][T07] all four outcomes show the exact message and Continue with Request', async ({ page }) => {
    const dir = mkdtempSync(join(tmpdir(), 'coverage-'))
    writeFileSync(join(dir, 'relationship.txt'), FILE)
    const version = /Proposed rule set v(\d+)/.exec(
      coverageCli('import', join(dir, 'relationship.txt'), 'synthetic e2e'),
    )?.[1]
    expect(version).toBeTruthy()
    coverageCli('approve', version as string, 'e2e-owner', 'OWN-DEC-999')

    await page.goto('/')
    for (const outcome of ['in_coverage', 'boundary', 'out_of_coverage', 'unknown'] as const) {
      await check(page, ZIPS[outcome])
      const status = page.getByRole('status')
      await expect(status.getByText(MESSAGES[outcome])).toBeVisible()
      await expect(status).not.toContainText(/appointment|schedul|price|\$|travel/i)
      await expect(page.getByRole('link', { name: 'Continue with Request' })).toHaveAttribute('href', '/request')
    }
    const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
    expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
  })

  test('[HH-CUS-03][T07] an invalid ZIP shows a correction and no outcome', async ({ page }) => {
    await page.goto('/')
    await check(page, '4020')
    await expect(page.getByText('Enter a 5-digit ZIP code.')).toBeVisible()
    await expect(page.getByLabel('ZIP code', { exact: true })).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('link', { name: 'Continue with Request' })).toHaveCount(0)
  })

  test('[HH-CUS-03][T07] a failed lookup explains the problem and still continues', async ({ page }) => {
    await page.route('**/api/v1/public/coverage**', (route) => route.fulfill({ status: 503, body: '{}' }))
    await page.goto('/')
    await check(page, ZIPS.in_coverage)
    await expect(page.getByText("We couldn't check this ZIP right now.", { exact: false })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Continue with Request' })).toBeVisible()
  })

  test('[HH-INT-16][T07] the ZIP is carried into the form, rechecked when corrected, and the request stores the outcome', async ({
    page,
  }) => {
    await page.goto('/request')
    await page.evaluate(() => window.localStorage.clear())
    await page.goto('/')
    await check(page, ZIPS.out_of_coverage)
    await page.getByRole('link', { name: 'Continue with Request' }).click()
    await page.getByRole('button', { name: 'Continue as Guest' }).click()
    expect(page.url()).not.toContain(ZIPS.out_of_coverage)
    await page.getByLabel('Not sure what service I need').check()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Project description').fill('Synthetic project: a small hole in a hallway wall.')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByLabel('ZIP')).toHaveValue(ZIPS.out_of_coverage)
    await expect(page.getByText(MESSAGES.out_of_coverage)).toBeVisible()
    await page.getByLabel('Street address').fill('100 Synthetic Way')
    await page.getByLabel('City').fill('Testville')
    await page.getByLabel('State').fill('KY')
    // Correcting the ZIP rechecks coverage and keeps every other answer.
    await page.getByLabel('ZIP').fill(ZIPS.boundary)
    await expect(page.getByText(MESSAGES.boundary)).toBeVisible()
    await expect(page.getByLabel('Street address')).toHaveValue('100 Synthetic Way')
    await page.getByLabel('House', { exact: true }).check()
    await page.getByLabel('Preferred date').fill(future)
    await page.getByLabel('Mornings').check()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Full name').fill('Test Customer')
    await page.getByRole('textbox', { name: /^Email/ }).fill('coverage-customer@example.test')
    await page.getByRole('textbox', { name: /^Phone/ }).fill('(502) 555-0199')
    await page.getByLabel('Phone call', { exact: true }).check()
    await page.getByLabel('Let HandyHub decide').check()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Send Estimate Request' }).click()
    const reference = (
      await page
        .getByText(/HH-[0-9A-Z]{8}/)
        .first()
        .textContent()
    )?.match(/HH-[0-9A-Z]{8}/)?.[0]
    expect(reference).toBeTruthy()
    const db = createDb(databaseUrl as string, { max: 1 })
    try {
      const stored = await db
        .selectFrom('intake.requests')
        .select(['coverage_result', 'coverage_rule_set'])
        .where('reference', '=', reference as string)
        .executeTakeFirstOrThrow()
      expect(stored.coverage_result).toBe('boundary')
      expect(stored.coverage_rule_set).not.toBeNull()
    } finally {
      await db.destroy()
    }
  })

  test('[OWN-DEC-73][HH-CUS-03] the check works behind the staging access gate', async ({ browser }) => {
    const base = `http://127.0.0.1:${gatedPort}`
    // Without credentials the gate answers 401. Asked over HTTP, not by navigation: how a browser surfaces an
    // unanswered Basic challenge (a 401 page or a navigation error) differs between Chromium builds.
    const anonymous = await browser.newContext()
    const refused = await anonymous.request.get(`${base}/`)
    expect(refused.status()).toBe(401)
    expect(refused.headers()['www-authenticate']).toMatch(/^Basic /)
    await anonymous.close()
    const context = await browser.newContext({ httpCredentials: { username: GATE_USER, password: GATE_PASSWORD } })
    const page = await context.newPage()
    await page.goto(`${base}/`)
    await check(page, ZIPS.in_coverage)
    await expect(page.getByRole('status').getByText(MESSAGES.in_coverage)).toBeVisible()
    await context.close()
  })
})
