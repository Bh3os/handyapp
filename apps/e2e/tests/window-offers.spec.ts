// Window offers held for the team and the customer's selection in real browsers (TSK-0063; HH-SCH-11, HH-LEAD-07,
// HH-SCH-04, T37, T38, OWN-DEC-99, OWN-DEC-144). An Office user of this spec plans an Estimate visit on a synthetic
// request and offers two windows held for the spec's synthetic worker; the customer opens the project with the secure
// link and a code (TSK-0034), chooses the second window in the Appointments tab and sees the confirmed visit with its
// date, arrival window, address and preparation instructions; the Office user then sees the offer chosen and the
// visit confirmed. The worker and its working hours (every day 08:00-20:00) are this spec's own fixtures, added
// straight to the database: they are synthetic, not the business's hours. The staff browser runs in a far-away zone
// (Asia/Tokyo) to show that windows are read in the property's zone. Every visitor, address, account and name is
// synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { addLocalDays, localDateOf } from '@handyhub/domain/local-time'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'
import { verifyCountyOf } from '../county.js'
import { verifyPropertyZone } from '../zones.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.163' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OFFICE = 'e2e-offers-office@example.test'
const WORKER = { email: 'e2e-offers-worker@example.test', name: 'E2E Offers Worker' }
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'offers', 'passphrase', '63'].join(' ')
const ZONE = 'America/Kentucky/Louisville'
const STREET = '163 Synthetic Offer Court'

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-offers' })
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

/** A request sent through the API (the wizard has its own specs), with its secure link. */
async function sendRequest(page: Page) {
  const res = await page.request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `synthetic-e2e-offers-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-02' }],
      notSure: false,
      description: 'Synthetic window-offer project: a ceiling crack to look at.',
      property: { street: STREET, city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { flexible: true, needHelpToday: false, windows: ['afternoons'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Test Offers Customer',
        email: `offers-e2e-${Date.now()}@example.test`,
        phone: '(502) 555-0163',
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
      .select(['g.id', 'g.nonce', 'r.id as request_id', 'r.project_id'])
      .where('r.reference', '=', reference)
      .executeTakeFirstOrThrow(),
  )
  // TSK-0127: staff's address and county check, which a first confirmation needs.
  await verifyCountyOf(databaseUrl as string, row.project_id)
  // TSK-0123: a new property's zone is unknown; this spec plans visits, so its zone is recorded first.
  await withDb((db) => verifyPropertyZone(db, row.project_id))
  return {
    reference,
    requestId: row.request_id,
    projectId: row.project_id,
    grantId: row.id,
    token: accessTokenFor(row),
  }
}

/** Opens the link, enters the emailed code, and goes on to the project page in the portal. */
async function openProject(page: Page, link: { token: string; grantId: string; reference: string }) {
  await page.goto(`/access#${link.token}`)
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await expect(page.getByLabel('Code')).toBeFocused()
  const row = await withDb((db) =>
    db
      .selectFrom('identity.verification_codes')
      .select(['id', 'nonce'])
      .where('subject_ref', '=', `grant:${link.grantId}:email`)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirstOrThrow(),
  )
  await page.getByLabel('Code').fill(codeFor(row))
  await page.getByRole('button', { name: 'Open my project' }).click()
  await expect(page.getByRole('heading', { name: 'Your project', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Go to your project page' }).click()
  await expect(page.getByRole('heading', { level: 1, name: `Project ${link.reference}` })).toBeVisible()
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
        .values({ staff_user_id: user.id, kind: 'role', name: 'worker', issued_by: 'e2e:offers', reason: null })
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
      .values({ email: OFFICE, display_name: 'E2E Offers Office', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: 'office', issued_by: 'e2e:offers', reason: null })
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

test.describe('Window offers held 24 hours and the customer selection (TSK-0063)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-SCH-11][HH-LEAD-07][T37][T38][OWN-DEC-144] staff offer two held windows; the customer chooses one and sees the visit', async ({
    page,
    browser,
  }) => {
    const workerId = await worker()
    const link = await sendRequest(page)
    const date = addLocalDays(localDateOf(new Date(), ZONE), 40)
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

      // Two windows (the configured minimum), held for the worker until the offer expires.
      await visit.getByRole('button', { name: 'Offer windows to the customer' }).click()
      const form = visit.getByTestId('offer-windows')
      await expect(form).toContainText('Offer 2 to 3 windows. Each window holds the whole team for 24 hours')
      const second = form.getByTestId('offer-window').nth(1)
      await second.getByLabel('Arrival window starts', { exact: false }).fill('13:00')
      await second.getByLabel('Arrival window ends', { exact: false }).fill('14:00')
      await form.getByLabel(/E2E Offers Worker/).check()
      await form.getByLabel(/Preparation instructions/).fill('Synthetic: please clear the hallway.')
      await axe(p)
      await form.getByRole('button', { name: 'Offer and hold these windows' }).click()
      const offer = visit.getByTestId('visit-offer')
      await expect(offer).toContainText('Offer 1')
      await expect(offer.getByTestId('offer-held')).toContainText('Held until')
      // Read in the property's zone, not this browser's (Asia/Tokyo).
      await expect(offer.getByTestId('offer-window-line').nth(1)).toContainText(/1:00 PM E[SD]T – 2:00 PM E[SD]T/)
      await expect(visit.getByRole('button', { name: 'Confirm with workers' })).toHaveCount(0)

      // The customer chooses the second window in the Appointments tab.
      await openProject(page, link)
      await page.getByRole('tab', { name: 'Appointments' }).click()
      const choose = page.getByTestId('window-offer')
      await expect(choose.getByRole('heading', { name: 'Choose a time for your estimate visit' })).toBeVisible()
      await expect(choose.getByTestId('offer-held')).toContainText('These times are held for you until')
      await expect(choose.getByTestId('offer-window')).toHaveCount(2)
      await axe(page)
      await choose.getByTestId('offer-window').nth(1).getByRole('button', { name: 'Choose this time' }).click()
      const card = page.getByRole('tabpanel').getByTestId('appointment')
      await expect(card).toContainText('Estimate visit')
      await expect(card).toContainText('Confirmed')
      await expect(card.getByTestId('appointment-window')).toContainText(
        /arrival between 1:00 PM E[SD]T and 2:00 PM E[SD]T/,
      )
      await expect(card).toContainText(STREET)
      await expect(card).toContainText('Synthetic: please clear the hallway.')
      await expect(page.getByTestId('window-offer')).toHaveCount(0)
      await axe(page)

      // Staff see the offer chosen and the visit confirmed; the other window's hold was released.
      await p.reload()
      const after = p.getByTestId('project-visits').getByTestId('visit')
      await expect(after.getByText('Confirmed', { exact: true })).toBeVisible()
      await expect(after.getByTestId('visit-offer')).toContainText('Chosen by the customer')
      const rows = await withDb((db) =>
        db
          .selectFrom('work.reservations as r')
          .innerJoin('work.visits as v', 'v.id', 'r.visit_id')
          .select(['r.kind', 'r.offer_position', 'r.ended_reason', 'r.staff_user_id'])
          .where('v.project_id', '=', link.projectId)
          .orderBy('r.offer_position')
          .execute(),
      )
      expect(rows).toEqual([
        { kind: 'hold', offer_position: 1, ended_reason: 'hold_released', staff_user_id: workerId },
        { kind: 'confirmed', offer_position: 2, ended_reason: null, staff_user_id: workerId },
      ])
      // T37: an Estimate visit creates no job.
      const jobs = await withDb((db) =>
        db.selectFrom('work.jobs').select('id').where('project_id', '=', link.projectId).execute(),
      )
      expect(jobs).toEqual([])
    } finally {
      await office.close()
    }
  })
})
