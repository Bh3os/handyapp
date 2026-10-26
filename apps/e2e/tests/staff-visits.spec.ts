// Visits on the request record in a real browser (TSK-0061; HH-SCH-01, HH-SCH-02, HH-DATA-06, T09, T37, T41). An Office
// user of this spec plans tentative Estimate visits on a synthetic request: a time inside the spring-forward gap is
// refused with a clear message; a time inside the repeated fall-back hour asks which reading and is stored with that
// offset; a window moved across the change keeps its local times and keeps the earlier window in its history. The
// browser runs in a far-away zone (Asia/Tokyo) to show that windows are read in the visit's own zone. The daylight-
// saving dates are found from the business zone (the next changes after now), so every window is in the future.
// Every visitor, address, account and name is synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createDb } from '@handyhub/db'
import { addLocalDays, localClockOf, localDateOf, offsetChanges } from '@handyhub/domain/local-time'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { verifyPropertyZone } from '../zones.js'
import { passSecondFactor } from '../mfa.js'
import { expectAccessible } from '../a11y.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.161' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OFFICE = 'e2e-visits-office@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'visits', 'passphrase', '61'].join(' ')

const ZONE = 'America/Kentucky/Louisville'
const MIN = 60_000
const changes = offsetChanges(ZONE, new Date(), new Date(Date.now() + 400 * 24 * 60 * MIN))
const fall = changes.find((c) => c.offsetAfter < c.offsetBefore)
const spring = changes.find((c) => c.offsetAfter > c.offsetBefore)
const clockAt = (ms: number) => new Date(ms).toISOString().slice(11, 16)
const twelveHour = (hhmm: string) => {
  const h = Number(hhmm.slice(0, 2))
  return `${h % 12 === 0 ? 12 : h % 12}:${hhmm.slice(3)}`
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-visits' })
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

async function axe(page: Page) {
  await expectAccessible(page)
}

/** A request sent through the API (the wizard has its own specs), with timing preferences on it. */
async function sendRequest(page: Page): Promise<{ requestId: string; projectId: string; reference: string }> {
  const res = await page.request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `synthetic-e2e-visits-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic visit project: a cracked ceiling to look at.',
      property: {
        street: '161 Synthetic Visit Court',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings', 'weekends'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Test Visit Customer',
        email: `visits-e2e-${Date.now()}@example.test`,
        phone: '(502) 555-0161',
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
  return { requestId: row.id, projectId: row.project_id, reference }
}

/** This spec's Office user, signed in through the staff app in a browser of its own, in a far-away zone. */
async function officeSession(browser: Browser) {
  const staffAccess = (...args: string[]) =>
    new URL(
      execFileSync(process.execPath, [cli, ...args], {
        env: { ...process.env, HANDYHUB_ENV: 'ci', DATABASE_URL: databaseUrl, PORT: port, HOST: '127.0.0.1' },
        encoding: 'utf8',
        stdio: 'pipe',
      }).split('\n')[0] as string,
    ).pathname
  // An account of this spec's own, added straight to the database: the first Owner is created by the staff sign-in
  // spec (staff-auth), which must find no Owner yet whatever order the specs run in.
  await withDb(async (db) => {
    const existing = await db
      .selectFrom('identity.staff_users')
      .select('id')
      .where('email', '=', OFFICE)
      .executeTakeFirst()
    if (existing) return
    const user = await db
      .insertInto('identity.staff_users')
      .values({ email: OFFICE, display_name: 'E2E Visits Office', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: 'office', issued_by: 'e2e:visits', reason: null })
      .execute()
  })
  const context = await browser.newContext({ extraHTTPHeaders: HEADERS, timezoneId: 'Asia/Tokyo', locale: 'en-US' })
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

test.describe('Visits: preferences, tentative visits and the business time zone (TSK-0061)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[T41][T09][HH-SCH-01][HH-SCH-02] gap refused, repeated hour stored with its offset, window moved across DST', async ({
    page,
    browser,
  }) => {
    if (!fall || !spring) throw new Error('the business zone must observe daylight saving time')
    const fallDate = localDateOf(fall.at, ZONE)
    const repeated = localClockOf(new Date(fall.at.getTime() - 30 * MIN), ZONE)
    const springDate = localDateOf(spring.at, ZONE)
    const gap = clockAt(spring.at.getTime() + spring.offsetBefore * MIN + 30 * MIN)

    const r = await sendRequest(page)
    const office = await officeSession(browser)
    try {
      const p = office.page
      await p.goto(`/staff/requests/${r.requestId}`)
      const section = p.getByTestId('project-visits')
      await expect(section.getByRole('heading', { name: 'Visits' })).toBeVisible()
      // T09: the customer's preferences are on the request; no visit exists until staff plan one.
      await expect(section.getByText('No visits yet.')).toBeVisible()
      await expect(section.getByTestId('visits-zone')).toHaveText(ZONE)
      await axe(p)

      const form = section.getByRole('form', { name: 'Plan a tentative visit' })
      await expect(form.getByLabel('Visit purpose')).toHaveValue('site_estimate')

      // Spring forward: the gap time is named at once and refused by the server.
      await form.getByLabel('Date', { exact: false }).fill(springDate)
      await form.getByLabel('Arrival window starts', { exact: false }).fill(gap)
      await form.getByLabel('Arrival window ends', { exact: false }).fill('04:00')
      await expect(form.getByTestId('windowStart-gap')).toContainText(`${gap} does not exist on ${springDate}`)
      await form.getByRole('button', { name: 'Plan tentative visit' }).click()
      await expect(
        form.getByText("This time does not exist on this date in the visit's time zone (the clocks move forward)."),
      ).toBeVisible()
      await expect(section.getByText('No visits yet.')).toBeVisible()

      // Fall back: the repeated time asks which reading; the later (standard time) one is stored with its offset.
      await form.getByLabel('Date', { exact: false }).fill(fallDate)
      await form.getByLabel('Arrival window starts', { exact: false }).fill(repeated)
      await form.getByLabel('Arrival window ends', { exact: false }).fill('03:00')
      const readings = form.getByRole('group', { name: `${repeated} happens twice on this date. Which one?` })
      await expect(readings.getByRole('radio')).toHaveCount(2)
      await readings.getByLabel(`${twelveHour(repeated)} AM EST`, { exact: false }).check()
      await form.getByRole('button', { name: 'Plan tentative visit' }).click()
      const first = section.getByTestId('visit').first()
      await expect(first.getByTestId('visit-window')).toContainText(
        `${twelveHour(repeated)} AM EST – 3:00 AM EST (${ZONE})`,
      )
      await expect(first.getByText('Tentative: not a booking')).toBeVisible()
      await expect(first.getByText('Outside the visit hours: it cannot be confirmed like this.')).toBeVisible()
      const stored = await withDb((db) =>
        db
          .selectFrom('work.visits')
          .select(['start_offset_minutes', 'starts_at', 'time_zone', 'job_id', 'state'])
          .where('project_id', '=', r.projectId)
          .executeTakeFirstOrThrow(),
      )
      expect(stored).toMatchObject({
        start_offset_minutes: fall.offsetAfter,
        time_zone: ZONE,
        job_id: null,
        state: 'tentative',
      })
      expect(new Date(stored.starts_at).getTime()).toBe(
        Date.parse(`${fallDate}T${repeated}:00Z`) - fall.offsetAfter * MIN,
      )

      // A window the day before the change, moved to the day after: same local times, the history keeps both.
      const before = addLocalDays(fallDate, -1)
      const after = addLocalDays(fallDate, 1)
      await form.getByLabel('Date', { exact: false }).fill(before)
      await form.getByLabel('Arrival window starts', { exact: false }).fill('09:00')
      await form.getByLabel('Arrival window ends', { exact: false }).fill('11:00')
      await form.getByRole('button', { name: 'Plan tentative visit' }).click()
      await expect(section.getByTestId('visit')).toHaveCount(2)
      const morning = section.getByTestId('visit').filter({ hasText: '9:00 AM EDT' })
      await morning.getByRole('button', { name: 'Change the window' }).click()
      await morning.getByLabel('Date', { exact: false }).fill(after)
      await morning.getByLabel('Reason (optional)').fill('Synthetic: the customer asked for Monday')
      await morning.getByRole('button', { name: 'Save the new window' }).click()
      const moved = section.getByTestId('visit').filter({ hasText: '9:00 AM EST – 11:00 AM EST' })
      await expect(moved.getByTestId('visit-history')).toContainText('Window 1:')
      await expect(moved.getByTestId('visit-history')).toContainText('9:00 AM EDT – 11:00 AM EDT')
      await expect(moved.getByTestId('visit-window-reason')).toHaveText(
        'Reason: Synthetic: the customer asked for Monday',
      )
      await axe(p)
    } finally {
      await office.close()
    }
  })
})
