// Business settings and the legal documents in a real browser (TSK-0144; HH-FIN-04, HH-EST-13, T58, T33, OWN-DEC-183,
// OWN-DEC-187, RULE-SERVER-AUTHZ, HH-A11Y-01). The Owner (created by an earlier spec; this spec only resets the
// password) opens Settings: the mailing address is NOT CONFIGURED, the Owner enters a synthetic placeholder address
// with a reason (never a real address, RULE-SYNTHETIC-DATA), the website still never shows it, and the Owner removes
// it again. The legal documents show the owner's sign-off of estimate terms v1.0 with the attorney review still open.
// Other specs replace the terms record for their own runs and restore NOT CONFIGURED; this spec records the sign-off
// exactly as migration 0073 does (ESTIMATE_TERMS_V1_RECORD) for its run and restores NOT CONFIGURED afterwards.
// Office is refused by the server.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { ESTIMATE_TERMS_V1_RECORD } from '@handyhub/domain/legal'
import { expect, test, type Page } from '@playwright/test'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OWNER = 'e2e-owner@example.test'
const OFFICE = 'e2e-settings-office@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (n: number) => ['synthetic', 'staff', 'settings', 'passphrase', String(n)].join(' ')
// This spec's own synthetic client addresses (RFC 5737): the sign-in limits count per network.
const OWNER_NETWORK = { 'x-forwarded-for': '198.51.100.206' }
const OFFICE_NETWORK = { 'x-forwarded-for': '198.51.100.207' }
const PUBLIC_NETWORK = { 'x-forwarded-for': '198.51.100.208' }
test.use({ extraHTTPHeaders: OWNER_NETWORK })
/** A run-unique suffix in base 36 (never a long run of digits in free text). */
const run = Date.now().toString(36)
/** Clearly synthetic placeholder lines: no real street, city or ZIP code. */
const LINES = [`SYNTHETIC-TEST-ADDRESS ${run} line one`, 'SYNTHETIC-TEST-ADDRESS line two']

function staffAccess(...args: string[]): string {
  const out = execFileSync(process.execPath, [cli, ...args], {
    env: { ...process.env, HANDYHUB_ENV: 'ci', DATABASE_URL: databaseUrl, PORT: port, HOST: '127.0.0.1' },
    encoding: 'utf8',
    stdio: 'pipe',
  })
  return new URL(out.split('\n')[0] as string).pathname
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
  await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-settings' })
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

/** A new active version of a configuration key, as recordPolicyVersion writes it (value null: NOT CONFIGURED). */
async function recordVersion(key: string, value: unknown, sourceIds: string[]) {
  await withDb((db) =>
    db.transaction().execute(async (trx) => {
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
    }),
  )
}
const activeState = (key: string) =>
  withDb(
    async (db) =>
      (
        await db
          .selectFrom('platform.policy_version')
          .select('state')
          .where('key', '=', key)
          .where('status', '=', 'active')
          .executeTakeFirst()
      )?.state,
  )

test.describe('Business settings and the legal documents (TSK-0144)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test.beforeAll(async () => {
    await recordVersion('legal.estimate_terms', ESTIMATE_TERMS_V1_RECORD, [
      'OWN-DEC-187',
      'HH-EST-13',
      'OWN-DEC-127',
      'OQ-ATTORNEY-TERMS',
    ])
    // The mailing address starts NOT CONFIGURED, as on a fresh staging database.
    if ((await activeState('business.mailing_address')) !== 'not_configured')
      await recordVersion('business.mailing_address', null, ['FACT-BUSINESS-ADDRESS', 'OWN-DEC-183'])
    // A synthetic Office member for the refusal check.
    await withDb(async (db) => {
      const user = await db
        .insertInto('identity.staff_users')
        .values({ email: OFFICE, display_name: 'E2E Settings Office', locale: 'en' })
        .returning('id')
        .executeTakeFirstOrThrow()
      await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
      await db
        .insertInto('identity.role_grants')
        .values({ staff_user_id: user.id, kind: 'role', name: 'office', issued_by: 'e2e:settings', reason: null })
        .execute()
    })
  })
  test.afterAll(async () => {
    // The terms stay NOT CONFIGURED for every other spec; the address never outlives this spec.
    await recordVersion('legal.estimate_terms', null, ['HH-EST-13', 'OWN-DEC-127', 'OQ-ATTORNEY-TERMS'])
    if ((await activeState('business.mailing_address')) !== 'not_configured')
      await recordVersion('business.mailing_address', null, ['FACT-BUSINESS-ADDRESS', 'OWN-DEC-183'])
  })

  test('[HH-FIN-04][T58][OWN-DEC-183][HH-EST-13][OWN-DEC-187] the Owner enters and removes the mailing address and sees the terms sign-off', async ({
    page,
    browser,
  }) => {
    await setPassword(page, staffAccess('password-link', OWNER), pw(1))
    await signIn(page, OWNER, pw(1))
    await page.goto('/staff/settings')
    await expect(page.getByRole('heading', { level: 1, name: 'Configuration' })).toBeVisible()

    // NOT CONFIGURED until entered: documents leave the line out.
    const business = page.getByTestId('business-details')
    await expect(business.getByRole('heading', { level: 2, name: 'Business details' })).toBeVisible()
    await expect(business.getByTestId('mailing-address-current')).toContainText('NOT CONFIGURED')
    await expect(business.getByText(/leave the address line out until you enter it/)).toBeVisible()

    // The legal documents: v1.0 approved by the owner (OWN-DEC-187), the attorney review still open.
    const terms = page.getByTestId('legal-documents').getByRole('listitem', { name: 'Estimate terms' })
    await expect(terms.getByText('Approved by the owner')).toBeVisible()
    await expect(
      terms.getByText(
        'Owner sign-off: OWN-DEC-187, 2026-10-21 (owner answers 2026-10-21 R10-Q2): "I approve v1.0 now"',
      ),
    ).toBeVisible()
    await expect(terms.getByText('Attorney review: not reviewed.')).toBeVisible()
    await expect(terms.getByText('Customer approvals are accepted under this version.')).toBeVisible()
    await expect(terms.getByText('Still waiting on: OQ-ATTORNEY-TERMS')).toBeVisible()
    await expect(terms.getByText('Real customer use also waits for: OWN-DEC-191, OQ-ATTORNEY-PRIVACY')).toBeVisible()
    const privacy = page.getByTestId('legal-documents').getByRole('listitem', { name: 'Privacy policy' })
    await expect(privacy.getByText('Still waiting on: OQ-ATTORNEY-PRIVACY')).toBeVisible()
    await axe(page)

    // The Owner enters a synthetic placeholder address with a reason (the sign-in just now is the fresh sign-in).
    await business.getByLabel('Mailing address (one line per row, up to 4 lines)').fill(LINES.join('\n'))
    await business.getByLabel('Reason for the change').fill(`Synthetic e2e entry ${run}`)
    await business.getByRole('button', { name: 'Save the mailing address' }).click()
    await expect(business.getByText('The mailing address is saved. Documents print it from now on.')).toBeVisible()
    await expect(business.getByText('Mailing address in force (configuration version', { exact: false })).toBeVisible()
    await expect(business.getByText(LINES[0] as string)).toBeVisible()
    await axe(page)

    // The website never shows it (OWN-DEC-48).
    const visitor = await browser.newContext({ extraHTTPHeaders: PUBLIC_NETWORK })
    try {
      const site = await visitor.request.get('/api/v1/public/site')
      expect(site.status()).toBe(200)
      expect(await site.text()).not.toContain('SYNTHETIC-TEST-ADDRESS')
      const home = await visitor.newPage()
      await home.goto('/')
      expect(await home.content()).not.toContain('SYNTHETIC-TEST-ADDRESS')
    } finally {
      await visitor.close()
    }

    // The Owner removes it again: NOT CONFIGURED.
    await business.getByLabel('Reason for the change').fill(`Synthetic e2e removal ${run}`)
    await business.getByRole('button', { name: 'Remove the mailing address' }).click()
    await expect(business.getByText('The mailing address is removed: NOT CONFIGURED.')).toBeVisible()
    await expect(business.getByTestId('mailing-address-current')).toContainText('NOT CONFIGURED')
    expect(await activeState('business.mailing_address')).toBe('not_configured')
  })

  test('[RULE-SERVER-AUTHZ] Office sees neither section and the server refuses both', async ({ browser }) => {
    const context = await browser.newContext({ extraHTTPHeaders: OFFICE_NETWORK })
    try {
      const page = await context.newPage()
      await setPassword(page, staffAccess('password-link', OFFICE), pw(2))
      await signIn(page, OFFICE, pw(2))
      for (const path of ['/api/v1/staff/settings/business-details', '/api/v1/staff/settings/legal-documents'])
        expect((await page.request.get(path)).status(), path).toBe(403)
      const csrf = ((await (await page.request.get('/api/v1/staff/auth/session')).json()) as { csrfToken: string })
        .csrfToken
      const put = await page.request.put('/api/v1/staff/settings/business-details/mailing-address', {
        data: { lines: LINES, reason: `Synthetic e2e office attempt ${run}` },
        headers: { 'x-csrf-token': csrf, 'idempotency-key': `synthetic-e2e-settings-office-${run}`, 'if-match': '"1"' },
      })
      expect(put.status()).toBe(403)
      await page.goto('/staff/settings')
      await expect(page.getByTestId('business-details')).toHaveCount(0)
      await expect(page.getByTestId('legal-documents')).toHaveCount(0)
    } finally {
      await context.close()
    }
  })
})
