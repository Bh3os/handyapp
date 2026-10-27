// Draft, published and replaced window offers in real browsers (TSK-0145; OWN-DEC-194 B1, B3, B4; HH-SCH-11,
// HH-SCH-04, T38, OWN-DEC-144). An Office user of this spec plans an Estimate visit on a synthetic request and saves two
// windows as a draft: nothing is held and no clock runs. Publishing the draft starts the 24-hour hold for the spec's
// synthetic worker. The Office user then replaces the published offer with new windows and a reason: the old offer
// shows as replaced, its holds are released and the same worker holds the new windows. The worker and its working
// hours (every day 08:00-20:00) are this spec's own fixtures, added straight to the database: they are synthetic, not
// the business's hours. Every visitor, address, account and name is synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createDb } from '@handyhub/db'
import { addLocalDays, localDateOf } from '@handyhub/domain/local-time'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { verifyCountyOf } from '../county.js'
import { verifyPropertyZone } from '../zones.js'
import { passSecondFactor } from '../mfa.js'
import { expectAccessible } from '../a11y.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.245' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OFFICE = 'e2e-amendments-office@example.test'
const WORKER = { email: 'e2e-amendments-worker@example.test', name: 'E2E Amendments Worker' }
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'amendments', 'passphrase', '145'].join(' ')
const ZONE = 'America/Kentucky/Louisville'
const STREET = '145 Synthetic Amendment Court'

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-amendments' })
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

async function axe(page: Page) {
  await expectAccessible(page)
}

/** A request sent through the API (the wizard has its own specs), with its secure link. */
async function sendRequest(page: Page) {
  const res = await page.request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `synthetic-e2e-amendments-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-02' }],
      notSure: false,
      description: 'Synthetic offer-amendment project: a ceiling crack to look at.',
      property: { street: STREET, city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { flexible: true, needHelpToday: false, windows: ['afternoons'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Test Amendments Customer',
        email: `amendments-e2e-${Date.now()}@example.test`,
        phone: '(502) 555-0145',
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
      .select(['r.id as request_id', 'r.project_id'])
      .where('r.reference', '=', reference)
      .executeTakeFirstOrThrow(),
  )
  // TSK-0127: staff's address and county check, which a first confirmation needs.
  await verifyCountyOf(databaseUrl as string, row.project_id)
  // TSK-0123: a new property's zone is unknown; this spec plans visits, so its zone is recorded first.
  await withDb((db) => verifyPropertyZone(db, row.project_id))
  return { reference, requestId: row.request_id, projectId: row.project_id }
}

/** The spec's field worker with synthetic working hours (a version and its hours in one transaction). */
async function worker(): Promise<string> {
  return withDb((db) =>
    db.transaction().execute(async (tx) => {
      const existing = await tx
        .selectFrom('identity.staff_users')
        .select('id')
        .where('email', '=', WORKER.email)
        .executeTakeFirst()
      if (existing) return existing.id
      const user = await tx
        .insertInto('identity.staff_users')
        .values({
          email: WORKER.email,
          display_name: WORKER.name,
          locale: 'en',
          status: 'active',
          activated_at: new Date(),
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      await tx
        .insertInto('identity.role_grants')
        .values({ staff_user_id: user.id, kind: 'role', name: 'worker', issued_by: 'e2e:amendments', reason: null })
        .execute()
      await tx
        .insertInto('work.worker_schedules')
        .values({ staff_user_id: user.id, version: 1, time_zone: ZONE, set_by: user.id, reason: 'E2E fixture' })
        .execute()
      for (let weekday = 1; weekday <= 7; weekday++)
        await tx
          .insertInto('work.working_hours')
          .values({ staff_user_id: user.id, version: 1, weekday, start_minute: 8 * 60, end_minute: 20 * 60 })
          .execute()
      return user.id
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
      .values({ email: OFFICE, display_name: 'E2E Amendments Office', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: 'office', issued_by: 'e2e:amendments', reason: null })
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

const holdsOf = (projectId: string) =>
  withDb((db) =>
    db
      .selectFrom('work.reservations as r')
      .innerJoin('work.visits as v', 'v.id', 'r.visit_id')
      .innerJoin('work.window_offers as o', 'o.id', 'r.offer_id')
      .select(['o.number', 'r.kind', 'r.offer_position', 'r.ended_reason', 'r.staff_user_id'])
      .where('v.project_id', '=', projectId)
      .orderBy('o.number')
      .orderBy('r.offer_position')
      .execute(),
  )

test.describe('Draft, published and replaced window offers (TSK-0145)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-SCH-11][OWN-DEC-194][OWN-DEC-144][T38] a draft holds nothing; publishing starts the hold; a replacement needs a reason', async ({
    page,
    browser,
  }) => {
    const workerId = await worker()
    const link = await sendRequest(page)
    const date = addLocalDays(localDateOf(new Date(), ZONE), 41)
    const office = await officeSession(browser)
    try {
      const p = office.page
      await p.goto(`/staff/requests/${link.requestId}`)
      const section = p.getByTestId('project-visits')
      await expect(section.getByRole('heading', { name: 'Visits' })).toBeVisible()
      const plan = section.getByRole('form', { name: 'Plan a tentative visit' })
      await plan.getByLabel('Date', { exact: false }).fill(date)
      await plan.getByLabel('Arrival window starts', { exact: false }).fill('09:00')
      await plan.getByLabel('Arrival window ends', { exact: false }).fill('10:00')
      await plan.getByLabel('Expected work (minutes)').fill('60')
      await plan.getByLabel('Travel buffer (minutes)').fill('30')
      await plan.getByLabel('Workers needed').fill('1')
      await plan.getByRole('button', { name: 'Plan tentative visit' }).click()
      const visit = section.getByTestId('visit')
      await expect(visit).toHaveCount(1)

      // B1: saved as a draft, nothing is held and no clock runs.
      await visit.getByRole('button', { name: 'Offer windows to the customer' }).click()
      const form = visit.getByTestId('offer-windows')
      await expect(form).toContainText('A draft holds nothing and starts no clock.')
      const second = form.getByTestId('offer-window').nth(1)
      await second.getByLabel('Arrival window starts', { exact: false }).fill('13:00')
      await second.getByLabel('Arrival window ends', { exact: false }).fill('14:00')
      await form.getByLabel(/E2E Amendments Worker/).check()
      await axe(p)
      await form.getByRole('button', { name: 'Save as draft' }).click()
      const draft = visit.getByTestId('visit-offer')
      await expect(draft).toContainText('Draft offer')
      await expect(draft.getByTestId('offer-draft')).toContainText('nothing is held and no clock runs')
      expect(await holdsOf(link.projectId)).toEqual([])

      // Publishing starts the 24 hours and holds the worker for both windows.
      await draft.getByRole('button', { name: 'Publish', exact: true }).click()
      const offer = visit.getByTestId('visit-offer')
      await expect(offer).toContainText('Offer 1')
      await expect(offer.getByTestId('offer-published')).toContainText('held 24 hours from then')
      await expect(offer.getByTestId('offer-held')).toContainText('Held until')
      expect(await holdsOf(link.projectId)).toEqual([
        { number: 1, kind: 'hold', offer_position: 1, ended_reason: null, staff_user_id: workerId },
        { number: 1, kind: 'hold', offer_position: 2, ended_reason: null, staff_user_id: workerId },
      ])

      // B4: new windows replace the published offer, with a reason.
      await visit.getByRole('button', { name: 'Replace the offer' }).click()
      const replace = visit.getByTestId('offer-windows')
      await expect(replace.getByRole('heading', { name: 'Replace the published offer' })).toBeVisible()
      await replace
        .getByTestId('offer-window')
        .nth(0)
        .getByLabel('Arrival window starts', { exact: false })
        .fill('10:00')
      await replace.getByTestId('offer-window').nth(0).getByLabel('Arrival window ends', { exact: false }).fill('11:00')
      const later = replace.getByTestId('offer-window').nth(1)
      await later.getByLabel('Arrival window starts', { exact: false }).fill('15:00')
      await later.getByLabel('Arrival window ends', { exact: false }).fill('16:00')
      await replace.getByLabel(/E2E Amendments Worker/).check()
      await replace.getByLabel('Why the offer is replaced').fill('Synthetic: the customer asked for later times.')
      await axe(p)
      await replace.getByRole('button', { name: 'Replace the offer' }).click()
      const offers = visit.getByTestId('visit-offer')
      await expect(offers).toHaveCount(2)
      await expect(offers.nth(0)).toContainText('Offer 2')
      await expect(offers.nth(1).getByTestId('offer-closed-reason')).toContainText(
        'Replaced by offer 2 by E2E Amendments Office: Synthetic: the customer asked for later times.',
      )
      expect(await holdsOf(link.projectId)).toEqual([
        { number: 1, kind: 'hold', offer_position: 1, ended_reason: 'hold_released', staff_user_id: workerId },
        { number: 1, kind: 'hold', offer_position: 2, ended_reason: 'hold_released', staff_user_id: workerId },
        { number: 2, kind: 'hold', offer_position: 1, ended_reason: null, staff_user_id: workerId },
        { number: 2, kind: 'hold', offer_position: 2, ended_reason: null, staff_user_id: workerId },
      ])
    } finally {
      await office.close()
    }
  })
})
