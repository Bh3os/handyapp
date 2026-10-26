// The three first-visit site checks in a real browser (TSK-0126; OWN-DEC-167, OWN-DEC-179, HH-SCH-06, HH-CRM-02,
// RULE-SERVER-AUTHZ). An Office user of this spec plans a tentative Estimate visit on a synthetic request whose
// address nobody has checked yet: the visit is "Not ready to confirm" and names the missing checks. On the project's
// visits the Office user then records each check beside the information it rests on: the address and its county,
// the customer as their own site contact (prefilled, never typed again) with the authority confirmed, and the SERVED
// coverage. Confirm is then offered. An exception for a county outside the area is the Owner's (refused for Office
// here; the Owner's approval is covered by the integration tests): this spec never creates an Owner. Every visitor,
// address, account and name is synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { addLocalDays, localDateOf } from '@handyhub/domain/local-time'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { verifyPropertyZone } from '../zones.js'
import { passSecondFactor } from '../mfa.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.126' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OFFICE = 'e2e-site-checks-office@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'site', 'checks', 'passphrase', '126'].join(' ')
const ZONE = 'America/Kentucky/Louisville'

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-site-checks' })
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

/** A request sent through the API (the wizard has its own specs); 40202 is SERVED by ZIP only. */
async function sendRequest(page: Page): Promise<{ requestId: string; projectId: string }> {
  const res = await page.request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': ['synthetic', 'e2e', 'site', 'checks', Date.now().toString(36)].join('-') },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-02' }],
      notSure: false,
      description: 'Synthetic site-checks project: a ceiling to look at.',
      property: {
        street: '126 Synthetic Site Check Lane',
        unit: 'Unit 2',
        city: 'Testville',
        state: 'KY',
        zip: '40202',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['afternoons'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Test Site Checks Customer',
        email: `site-checks-e2e-${Date.now().toString(36)}@example.test`,
        phone: '(502) 555-0126',
        preferredChannel: 'email',
      },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.status()).toBe(201)
  const reference = ((await res.json()) as { reference: string }).reference
  const row = await withDb((db) =>
    db
      .selectFrom('intake.requests')
      .select(['id', 'project_id'])
      .where('reference', '=', reference)
      .executeTakeFirstOrThrow(),
  )
  // TSK-0123: a new property's zone is unknown; this spec plans visits, so its zone is recorded first.
  await withDb((db) => verifyPropertyZone(db, row.project_id))
  return { requestId: row.id, projectId: row.project_id }
}

/** This spec's Office user, signed in through the staff app in a browser of its own. */
async function officeSession(browser: Browser) {
  const staffAccess = (...args: string[]) =>
    new URL(
      execFileSync(process.execPath, [cli, ...args], {
        env: { ...process.env, HANDYHUB_ENV: 'ci', DATABASE_URL: databaseUrl, PORT: port, HOST: '127.0.0.1' },
        encoding: 'utf8',
        stdio: 'pipe',
      }).split('\n')[0] as string,
    ).pathname
  // An account of this spec's own, added straight to the database (never an Owner).
  await withDb(async (db) => {
    const existing = await db
      .selectFrom('identity.staff_users')
      .select('id')
      .where('email', '=', OFFICE)
      .executeTakeFirst()
    if (existing) return
    const user = await db
      .insertInto('identity.staff_users')
      .values({ email: OFFICE, display_name: 'E2E Site Checks Office', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: 'office', issued_by: 'e2e:site-checks', reason: null })
      .execute()
  })
  const context = await browser.newContext({ extraHTTPHeaders: HEADERS, locale: 'en-US' })
  const page = await context.newPage()
  await page.goto(staffAccess('password-link', OFFICE))
  await page.getByLabel('New password').fill(pw)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(OFFICE)
  await page.getByLabel('Password', { exact: true }).fill(pw)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // MFA is mandatory (TSK-0154): enrol on the account's first sign-in, the code afterwards.
  await passSecondFactor(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
  const csrf = ((await (await page.request.get('/api/v1/staff/auth/session')).json()) as { csrfToken: string })
    .csrfToken
  let k = 0
  const send = (url: string, data: unknown) =>
    page.request.fetch(url, {
      method: 'POST',
      data,
      headers: {
        'x-csrf-token': csrf,
        'idempotency-key': ['e2e', 'site-checks', Date.now().toString(36), String(++k)].join('-'),
      },
    })
  return { page, send, close: () => context.close() }
}

test.describe('The three site checks gate a first confirmation (TSK-0126)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-SCH-06][HH-CRM-02][OWN-DEC-167][RULE-SERVER-AUTHZ] each check beside what it rests on; Confirm only once all three are recorded', async ({
    page,
    browser,
  }) => {
    const r = await sendRequest(page)
    const date = addLocalDays(localDateOf(new Date(), ZONE), 33)
    const office = await officeSession(browser)
    try {
      const p = office.page
      await p.goto(`/staff/requests/${r.requestId}`)
      const section = p.getByTestId('project-visits')
      await expect(section.getByRole('heading', { name: 'Visits' })).toBeVisible()
      const form = section.getByRole('form', { name: 'Plan a tentative visit' })
      await form.getByLabel('Date', { exact: false }).fill(date)
      await form.getByLabel('Arrival window starts', { exact: false }).fill('13:00')
      await form.getByLabel('Arrival window ends', { exact: false }).fill('14:00')
      await form.getByLabel('Expected work (minutes)').fill('60')
      await form.getByLabel('Travel buffer (minutes)').fill('30')
      await form.getByLabel('Workers needed').fill('1')
      await form.getByRole('button', { name: 'Plan tentative visit' }).click()
      const visit = section.getByTestId('visit')
      await expect(visit).toHaveCount(1)
      const blockers = visit.getByTestId('visit-blockers')
      await expect(blockers).toContainText('Not ready to confirm')
      await expect(blockers).toContainText("Staff have not verified the property's complete address and county yet.")
      await expect(blockers).toContainText('No authorized site contact is recorded yet.')
      await expect(visit.getByRole('button', { name: 'Confirm with workers' })).toHaveCount(0)

      const checks = section.getByTestId('site-checks')
      await expect(checks.getByRole('heading', { name: 'First-visit site checks' })).toBeVisible()
      await expect(checks.getByTestId('site-check-address-value')).toHaveText(
        '126 Synthetic Site Check Lane, Unit 2, Testville, KY 40202 (address version 1)',
      )
      await expect(checks.getByTestId('site-check-coverage-value')).toContainText('Verify the address and county first')
      await axe(p)

      // 1. The address: the county chosen and the complete address checked.
      const address = checks.getByRole('form', { name: 'Record address check' })
      await address.getByLabel('County').selectOption({ label: 'Jefferson County, KY' })
      await address.getByLabel(/I checked the complete address/).check()
      await address.getByRole('button', { name: 'Record address check' }).click()
      await expect(checks.getByTestId('site-check-address')).toHaveAttribute('data-done', 'true')
      await expect(checks.getByTestId('site-check-coverage-value')).toHaveText(
        'SERVED: Jefferson County, KY is in the service area.',
      )

      // 2. The customer is their own site contact: prefilled from their record, authority confirmed.
      await checks.getByRole('button', { name: 'Record site contact' }).click()
      const contact = checks.getByRole('form', { name: 'Record site contact' })
      await expect(contact.getByTestId('site-contact-customer')).toContainText(
        'The customer, Test Site Checks Customer',
      )
      await contact.getByLabel('May give access to the property').check()
      await contact.getByLabel('May coordinate the visit').check()
      await contact.getByLabel(/I confirmed that this person is the site contact/).check()
      await axe(p)
      await contact.getByRole('button', { name: 'Record site contact' }).click()
      await expect(checks.getByTestId('site-check-contact')).toHaveAttribute('data-done', 'true')
      await expect(checks.getByTestId('site-check-contact-value')).toContainText(
        'Authorized to: May give access to the property, May coordinate the visit. Recorded by E2E Site Checks Office',
      )

      // An exception is the Owner's alone: the server refuses Office.
      const ids = await withDb((db) =>
        db.selectFrom('crm.project_coverage_acceptances').select('id').where('project_id', '=', r.projectId).execute(),
      )
      expect(ids).toEqual([])
      const refused = await office.send(`/api/v1/staff/projects/${r.projectId}/coverage-exception`, {
        countyVerificationId: '00000000-0000-4000-8000-000000000000',
        reason: 'Synthetic: not the Owner.',
      })
      expect(refused.status()).toBe(403)

      // 3. The SERVED coverage, accepted by staff with no owner approval.
      const coverage = checks.getByRole('form', { name: 'Accept coverage' })
      await coverage.getByLabel(/I confirm that Jefferson County, KY is in the service area/).check()
      await coverage.getByRole('button', { name: 'Accept coverage' }).click()
      await expect(checks.getByTestId('site-check-coverage')).toHaveAttribute('data-done', 'true')
      await expect(checks.getByTestId('site-check-coverage-acceptance')).toContainText(
        'Accepted by E2E Site Checks Office',
      )

      // Nothing stops the confirmation any more.
      const ready = section.getByTestId('visit')
      await expect(ready.getByTestId('visit-blockers')).toHaveCount(0)
      await expect(ready.getByRole('button', { name: 'Confirm with workers' })).toBeVisible()
      await axe(p)

      const audits = await withDb((db) =>
        db
          .selectFrom('platform.audit_events')
          .select('action')
          .where('action', 'in', ['property.verify_county', 'visit.site_contact', 'visit.accept_coverage'])
          .where('target_id', 'in', [r.projectId])
          .execute(),
      )
      expect(audits.map((a) => a.action).sort()).toEqual(['visit.accept_coverage', 'visit.site_contact'])
    } finally {
      await office.close()
    }
  })
})
