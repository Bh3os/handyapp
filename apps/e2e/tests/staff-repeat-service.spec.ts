// A customer-agreed repeat-service schedule in a real browser (TSK-0114; HH-SCH-10, HH-ID-12, OWN-DEC-113,
// OWN-DEC-148). A guest sends a request; its property's zone is recorded as a synthetic verified one (../zones.ts).
// Office opens the project's repeat service from the request record and records the schedule the customer agreed to:
// every two weeks from a date two weeks ahead, with reminders. The customer opens their project with the access link
// and code, sees the schedule in the workspace, stops its reminders, is refused a next date inside the 24-hour notice,
// changes it to one date only, and stops it; Office then sees every change by the customer in the history. Dates are
// local dates of the property's zone, two weeks or more ahead, so nothing depends on the hour the spec runs (no
// reminder is due during the run). Both pages are scanned with axe. Every visitor, account, name and reference is
// synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'
import { passSecondFactor } from '../mfa.js'
import { verifyPropertyZone } from '../zones.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.114' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OFFICE = 'e2e-repeat-office@example.test'
const pw = ['synthetic', 'staff', 'repeat', 'passphrase', '114'].join(' ')
const ZONE = 'America/Kentucky/Louisville'

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-repeat-service' })
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

/** A local date of the property's zone, some calendar days from today (calendar arithmetic only). */
function localDate(days: number): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date()).slice(0, 10)
  const d = new Date(`${today}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
/** The portal's way of writing a local date ("November 9, 2026"). */
const longDate = (date: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', dateStyle: 'long' }).format(new Date(`${date}T12:00:00Z`))

async function sendRequest(request: APIRequestContext) {
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `synthetic-e2e-repeat-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic repeat-service project: a wall patched every few weeks.',
      property: {
        street: '114 Synthetic Repeat Road',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Test Repeat Customer',
        email: `repeat-e2e-${Date.now()}@example.test`,
        phone: '(502) 555-0114',
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
      .selectFrom('identity.project_access_grants as g')
      .innerJoin('intake.requests as r', 'r.id', 'g.request_id')
      .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
      .select(['g.id', 'g.nonce', 'r.id as request_id', 'r.project_id', 'p.reference as project_reference'])
      .where('r.reference', '=', reference)
      .executeTakeFirstOrThrow(),
  )
  await withDb((db) => verifyPropertyZone(db, row.project_id))
  return {
    reference,
    projectReference: row.project_reference,
    requestId: row.request_id,
    projectId: row.project_id,
    grantId: row.id,
    token: accessTokenFor(row),
  }
}

const latestCode = (subject: string) =>
  withDb((db) =>
    db
      .selectFrom('identity.verification_codes')
      .select(['id', 'nonce'])
      .where('subject_ref', '=', subject)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirstOrThrow(),
  )

async function openProject(page: Page, link: { token: string; grantId: string }) {
  await page.goto(`/access#${link.token}`)
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await expect(page.getByLabel('Code')).toBeFocused()
  await page.getByLabel('Code').fill(codeFor(await latestCode(`grant:${link.grantId}:email`)))
  await page.getByRole('button', { name: 'Open my project' }).click()
  await expect(page.getByRole('heading', { name: 'Your project', exact: true })).toBeVisible()
}

/** Office: a staff account of this spec's own, signed in through the staff app in its own browser. */
async function officeSession(browser: Browser) {
  const staffAccess = (...args: string[]) =>
    new URL(
      execFileSync(process.execPath, [cli, ...args], {
        env: { ...process.env, HANDYHUB_ENV: 'ci', DATABASE_URL: databaseUrl, PORT: port, HOST: '127.0.0.1' },
        encoding: 'utf8',
        stdio: 'pipe',
      }).split('\n')[0] as string,
    ).pathname
  await withDb(async (db) => {
    const existing = await db
      .selectFrom('identity.staff_users')
      .select('id')
      .where('email', '=', OFFICE)
      .executeTakeFirst()
    if (existing) return
    const user = await db
      .insertInto('identity.staff_users')
      .values({ email: OFFICE, display_name: 'E2E Repeat Office', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: 'office', issued_by: 'e2e:repeat-service', reason: null })
      .execute()
  })
  const context = await browser.newContext({ extraHTTPHeaders: HEADERS })
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
  return { page, close: () => context.close() }
}

test.describe('A customer-agreed repeat-service schedule (TSK-0114)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-SCH-10][HH-ID-12][OWN-DEC-113][OWN-DEC-148] staff record it; the customer changes and stops it', async ({
    page,
    request,
    browser,
  }) => {
    const link = await sendRequest(request)
    const office = await officeSession(browser)
    const first = localDate(14)
    try {
      // From the request record to the project's repeat service: nothing recorded, nothing suggested.
      await office.page.goto(`/staff/requests/${link.requestId}`)
      await office.page.getByRole('link', { name: 'Repeat service' }).click()
      const screen = office.page.getByTestId('repeat-service')
      await expect(
        screen.getByRole('heading', { name: `Repeat service · Project ${link.projectReference}` }),
      ).toBeVisible()
      await expect(screen.getByText('No repeat-service schedule is recorded for this project.')).toBeVisible()
      const record = screen.getByRole('form', { name: 'Record the schedule the customer agreed to' })
      await expect(record.getByLabel('Next service date')).toHaveValue('')
      await record.getByLabel('Next service date').fill(first)
      await record.getByLabel('How often').selectOption('week')
      await record.getByLabel('How many (days, weeks or months)').fill('2')
      await record.getByLabel('How the customer agreed').selectOption('phone')
      await record.getByLabel('The customer agreed to this schedule.').check()
      await record.getByRole('button', { name: 'Record the schedule' }).click()
      await expect(screen.getByText('The schedule is recorded.')).toBeVisible()
      const current = screen.getByTestId('repeat-current')
      await expect(current).toContainText('Every 2 weeks')
      await expect(current.getByTestId('repeat-upcoming').getByRole('listitem').first()).toContainText(
        `${first} Scheduled`,
      )
      await expect(
        screen.getByText(
          'The reminder wording is NOT CONFIGURED: no reminder can be released until the Owner approves it.',
        ),
      ).toBeVisible()
      await axe(office.page)

      // The customer's workspace: the schedule, its reminders and its notice.
      await openProject(page, link)
      await page.getByRole('link', { name: 'Go to your project page' }).click()
      const section = page.getByTestId('portal-repeat-service')
      await expect(section.getByRole('heading', { name: 'Repeat service' })).toBeVisible()
      await expect(section).toContainText('Every 2 weeks')
      await expect(section.getByRole('listitem')).toHaveText([
        longDate(first),
        longDate(localDate(28)),
        longDate(localDate(42)),
      ])
      await expect(section).toContainText('Changes apply to dates more than 24 hours away.')
      await axe(page)
      await section.getByRole('button', { name: 'Stop Reminders' }).click()
      await expect(section.getByText('Reminders are off. Your schedule stays as it is.')).toBeVisible()
      await expect(section.getByRole('button', { name: 'Turn Reminders Back On' })).toBeVisible()

      // A next date inside the notice is refused; one date only, three weeks ahead, is accepted.
      await section.getByRole('button', { name: 'Change the Schedule' }).click()
      const change = section.getByRole('form', { name: 'Change the Schedule' })
      await change.getByLabel('Next service date').fill(localDate(0))
      await change.getByRole('button', { name: 'Save the Change' }).click()
      await expect(section.getByRole('alert')).toHaveText('The next date must be more than 24 hours away.')
      await change.getByLabel('Next service date').fill(localDate(21))
      await change.getByLabel('How often').selectOption('none')
      await change.getByRole('button', { name: 'Save the Change' }).click()
      await expect(section.getByText('Your schedule is changed.')).toBeVisible()
      await expect(section).toContainText('One date only')
      await expect(section.getByRole('listitem')).toHaveText([longDate(localDate(21))])

      // Stopping asks first.
      await section.getByRole('button', { name: 'Stop the Schedule' }).click()
      await section.getByRole('button', { name: 'Yes, Stop It' }).click()
      await expect(section.getByText('Your schedule is stopped.')).toBeVisible()
      await expect(section).toContainText('This repeat-service schedule was stopped on')

      // Staff see every change, by the customer; a new agreement can be recorded.
      await office.page.reload()
      const history = office.page.getByTestId('repeat-history')
      await expect(history.getByRole('listitem')).toHaveCount(4)
      await expect(history.getByRole('listitem').nth(0)).toContainText('Stopped')
      await expect(history.getByRole('listitem').nth(0)).toContainText('By the customer')
      await expect(history.getByRole('listitem').nth(1)).toContainText('Changed · One date only')
      await expect(history.getByRole('listitem').nth(2)).toContainText('Reminders turned off')
      await expect(history.getByRole('listitem').nth(3)).toContainText('Recorded · Every 2 weeks')
      await expect(office.page.getByRole('form', { name: 'Record the schedule the customer agreed to' })).toBeVisible()
    } finally {
      await office.close()
    }
  })
})
