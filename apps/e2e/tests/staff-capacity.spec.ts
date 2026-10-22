// Confirming visits against real capacity in a browser (TSK-0062; HH-SCH-03, HH-SCH-04, T38, T39). An Office user of
// this spec plans two overlapping Estimate visits on a synthetic request and confirms the first, a two-person visit,
// with the spec's two synthetic workers: both are reserved for the whole range. Confirming the second with one of
// them is refused with the reason and the alternatives, and nothing is written. The two workers and their working
// hours (every day 08:00-18:00) are this spec's own fixtures, added straight to the database: they are synthetic, not
// the business's hours. The browser runs in a far-away zone (Asia/Tokyo) to show that times are read in the business
// zone. Every visitor, address, account and name is synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { addLocalDays, localDateOf } from '@handyhub/domain/local-time'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { verifyPropertyZone } from '../zones.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.162' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OFFICE = 'e2e-capacity-office@example.test'
const CREW = [
  { email: 'e2e-capacity-ann@example.test', name: 'E2E Capacity Ann' },
  { email: 'e2e-capacity-ben@example.test', name: 'E2E Capacity Ben' },
]
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'capacity', 'passphrase', '62'].join(' ')
const ZONE = 'America/Kentucky/Louisville'

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-capacity' })
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

/** A request sent through the API (the wizard has its own specs). */
async function sendRequest(page: Page): Promise<{ requestId: string; projectId: string }> {
  const res = await page.request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `synthetic-e2e-capacity-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-02' }],
      notSure: false,
      description: 'Synthetic capacity project: a textured ceiling to look at.',
      property: {
        street: '162 Synthetic Capacity Court',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['afternoons'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Test Capacity Customer',
        email: `capacity-e2e-${Date.now()}@example.test`,
        phone: '(502) 555-0162',
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

/** The spec's two field workers with synthetic working hours (a version and its hours in one transaction). */
async function crew(): Promise<string[]> {
  return withDb((db) =>
    db.transaction().execute(async (tx) => {
      const ids: string[] = []
      for (const c of CREW) {
        const existing = await tx
          .selectFrom('identity.staff_users')
          .select('id')
          .where('email', '=', c.email)
          .executeTakeFirst()
        if (existing) {
          ids.push(existing.id)
          continue
        }
        const user = await tx
          .insertInto('identity.staff_users')
          .values({ email: c.email, display_name: c.name, locale: 'en', status: 'active', activated_at: new Date() })
          .returning('id')
          .executeTakeFirstOrThrow()
        await tx
          .insertInto('identity.role_grants')
          .values({ staff_user_id: user.id, kind: 'role', name: 'worker', issued_by: 'e2e:capacity', reason: null })
          .execute()
        await tx
          .insertInto('work.worker_schedules')
          .values({ staff_user_id: user.id, version: 1, time_zone: ZONE, set_by: user.id, reason: 'E2E fixture' })
          .execute()
        for (let weekday = 1; weekday <= 7; weekday++)
          await tx
            .insertInto('work.working_hours')
            .values({ staff_user_id: user.id, version: 1, weekday, start_minute: 8 * 60, end_minute: 18 * 60 })
            .execute()
        ids.push(user.id)
      }
      return ids
    }),
  )
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
      .values({ email: OFFICE, display_name: 'E2E Capacity Office', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: 'office', issued_by: 'e2e:capacity', reason: null })
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
  await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
  return { page, close: () => context.close() }
}

test.describe('Capacity: a two-person visit and double-booking prevention (TSK-0062)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[T39][T38][HH-SCH-03][HH-SCH-04] both workers reserved; an overlapping booking refused with alternatives', async ({
    page,
    browser,
  }) => {
    const [annId, benId] = await crew()
    const r = await sendRequest(page)
    const date = addLocalDays(localDateOf(new Date(), ZONE), 30)
    const office = await officeSession(browser)
    try {
      const p = office.page
      await p.goto(`/staff/requests/${r.requestId}`)
      const section = p.getByTestId('project-visits')
      await expect(section.getByRole('heading', { name: 'Visits' })).toBeVisible()
      const form = section.getByRole('form', { name: 'Plan a tentative visit' })
      const planVisit = async (start: string, end: string, workers: string) => {
        await form.getByLabel('Date', { exact: false }).fill(date)
        await form.getByLabel('Arrival window starts', { exact: false }).fill(start)
        await form.getByLabel('Arrival window ends', { exact: false }).fill(end)
        await form.getByLabel('Expected work (minutes)').fill('60')
        await form.getByLabel('Travel buffer (minutes)').fill('30')
        await form.getByLabel('Workers needed').fill(workers)
        await form.getByRole('button', { name: 'Plan tentative visit' }).click()
      }
      await planVisit('09:00', '10:00', '2')
      await expect(section.getByTestId('visit')).toHaveCount(1)
      await planVisit('10:00', '11:00', '1')
      await expect(section.getByTestId('visit')).toHaveCount(2)

      // T39: the two-person visit is confirmed with both workers; both are reserved for the whole range.
      // Visits are listed by start: the two-person visit first.
      const two = section.getByTestId('visit').nth(0)
      await two.getByRole('button', { name: 'Confirm with workers' }).click()
      const confirmTwo = two.getByTestId('confirm-visit')
      await expect(confirmTwo.getByText('E2E Capacity Ann', { exact: false })).toBeVisible()
      // The free periods are read in the business zone, not this browser's zone (Asia/Tokyo).
      await expect(confirmTwo).toContainText('free 8:00 AM')
      await confirmTwo.getByLabel(/E2E Capacity Ann/).check()
      await confirmTwo.getByLabel(/E2E Capacity Ben/).check()
      await axe(p)
      await confirmTwo.getByRole('button', { name: 'Reserve and confirm' }).click()
      const reserved = two.getByTestId('visit-assignments')
      await expect(reserved).toContainText('E2E Capacity Ann (lead), confirmed, 8:30 AM')
      await expect(reserved).toContainText('E2E Capacity Ben (team), confirmed, 8:30 AM')
      await expect(two.getByText('Confirmed', { exact: true })).toBeVisible()

      // T38: the overlapping visit cannot take Ann as well: refused with the reason and the alternatives.
      const other = section.getByTestId('visit').nth(1)
      await other.getByRole('button', { name: 'Confirm with workers' }).click()
      const confirmOther = other.getByTestId('confirm-visit')
      await confirmOther.getByLabel(/E2E Capacity Ann/).check()
      await confirmOther.getByRole('button', { name: 'Reserve and confirm' }).click()
      const alert = confirmOther.getByRole('alert')
      await expect(alert).toContainText('The visit was not confirmed. Nothing was saved.')
      await expect(alert).toContainText('E2E Capacity Ann: Already booked or held for another visit at that time.')
      await expect(alert.getByTestId('capacity-alternatives')).toContainText('Free periods that day')
      await axe(p)

      const rows = await withDb((db) =>
        db
          .selectFrom('work.reservations as r')
          .innerJoin('work.visits as v', 'v.id', 'r.visit_id')
          .select(['r.visit_id', 'r.staff_user_id'])
          .where('v.project_id', '=', r.projectId)
          .where('r.ended_at', 'is', null)
          .execute(),
      )
      expect(rows.map((x) => x.staff_user_id).sort()).toEqual([annId, benId].sort())
      expect(new Set(rows.map((x) => x.visit_id)).size).toBe(1)
    } finally {
      await office.close()
    }
  })
})
