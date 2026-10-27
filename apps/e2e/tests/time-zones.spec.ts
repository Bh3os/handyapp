// The time-zone policy in a real browser (TSK-0123; OWN-DEC-159, HH-SCH-02, HH-DATA-06, T41). A synthetic request's
// property starts with an unknown zone: the staff queue flags it, the request record names it unknown and plans no
// visit. An Office user of this spec opens the property from the queue item, verifies a Central zone from the county
// of the address, and then plans a tentative visit: a time inside the Central spring-forward gap is refused, and a
// window is shown in Central time with the zone named. The browser runs in a far-away zone (Asia/Tokyo) to show that
// times are read in the property's own zone. Every visitor, address, account and name is synthetic
// (RULE-SYNTHETIC-DATA); the county is a synthetic name.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createDb } from '@handyhub/db'
import { addLocalDays, localDateOf, offsetChanges } from '@handyhub/domain/local-time'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { passSecondFactor } from '../mfa.js'
import { expectAccessible } from '../a11y.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.185' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OFFICE = 'e2e-zones-office@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'zones', 'passphrase', '123'].join(' ')
const CENTRAL = 'America/Chicago'
const BUSINESS = 'America/Kentucky/Louisville'
const MIN = 60_000
const spring = offsetChanges(CENTRAL, new Date(), new Date(Date.now() + 400 * 24 * 60 * MIN)).find(
  (c) => c.offsetAfter > c.offsetBefore,
)
const clockAt = (ms: number) => new Date(ms).toISOString().slice(11, 16)
/** A run-unique tag for free text, in base 36 (no raw timestamp digits). */
const tag = Date.now().toString(36)

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-zones' })
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

async function axe(page: Page) {
  await expectAccessible(page)
}

/** A request sent through the API (the wizard has its own specs), at a synthetic Indiana address. */
async function sendRequest(page: Page) {
  const res = await page.request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `synthetic-e2e-zones-${tag}-${Math.random().toString(36).slice(2)}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic time-zone project: a cracked ceiling to look at.',
      property: {
        street: `185 Synthetic Zone Court ${tag}`,
        city: 'Testville',
        state: 'IN',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Test Zone Customer',
        email: `zones-e2e-${tag}@example.test`,
        phone: '(502) 555-0185',
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
      .select(['id', 'project_id', 'property_id', 'customer_id'])
      .where('reference', '=', reference)
      .executeTakeFirstOrThrow(),
  )
  return { requestId: row.id, propertyId: row.property_id, customerId: row.customer_id, reference }
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
      .values({ email: OFFICE, display_name: 'E2E Zones Office', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: 'office', issued_by: 'e2e:zones', reason: null })
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

test.describe('Time zones: unknown flagged, Central verified, visits in the property zone (TSK-0123)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[OWN-DEC-159][HH-SCH-02][T41] unknown zone flagged; Office verifies Central; the gap is refused; CDT/CST named', async ({
    page,
    browser,
  }) => {
    if (!spring) throw new Error('America/Chicago must observe daylight saving time')
    const springDate = localDateOf(spring.at, CENTRAL)
    const gap = clockAt(spring.at.getTime() + spring.offsetBefore * MIN + 30 * MIN)
    const r = await sendRequest(page)
    const office = await officeSession(browser)
    try {
      const p = office.page

      // The request record: the zone is unknown, said so, and no visit can be planned.
      await p.goto(`/staff/requests/${r.requestId}`)
      const section = p.getByTestId('project-visits')
      await expect(section.getByRole('heading', { name: 'Visits' })).toBeVisible()
      await expect(section.getByTestId('visits-zone')).toHaveText('Unknown')
      await expect(
        section.getByText("The property's time zone is not verified, so no visit can be planned."),
      ).toBeVisible()
      await expect(section.getByRole('form', { name: 'Plan a tentative visit' })).toHaveCount(0)

      // The queue flags the property; its one action opens the property record.
      await p.goto('/staff')
      await expect(p.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
      const queue = p.locator('.staff-queue__list-wrap').first()
      await queue.getByLabel('Reference').fill(r.reference)
      const item = p.getByRole('listitem', { name: new RegExp(`Property time zone to verify ${r.reference}`) })
      await expect(async () => {
        await queue.getByRole('button', { name: 'Apply filters' }).click()
        await expect(item).toHaveCount(1, { timeout: 1000 })
      }).toPass({ timeout: 20_000 })
      await expect(item.getByText("The property's time zone is unknown")).toBeVisible()
      await item.getByRole('link', { name: 'Verify the time zone' }).click()
      await expect(p).toHaveURL(new RegExp(`/staff/properties/${r.propertyId}$`))

      // The property record: unknown, flagged; Office verifies a Central zone from the county.
      const zone = p.getByRole('region', { name: 'Time zone' })
      await expect(zone.getByTestId('property-zone-state')).toContainText('Unknown')
      await expect(zone.getByTestId('property-zone-state')).toContainText('Unknown: needs verification')
      await expect(zone.getByText(/Eastern time is never assumed/)).toBeVisible()
      await axe(p)
      await zone.getByRole('button', { name: 'Verify the time zone' }).click()
      const form = zone.getByRole('form', { name: 'Verify the time zone' })
      await form.getByLabel('Time zone (IANA)').selectOption(CENTRAL)
      await form.getByLabel('County of the verified address').fill('Synthetic')
      await form.getByLabel('Reason').fill(`Synthetic: county read from the verified address ${tag}`)
      await form.getByRole('button', { name: 'Save' }).click()
      await expect(zone.getByTestId('property-zone-state')).toContainText(`${CENTRAL} (Central time)`)
      await expect(zone.getByTestId('property-zone-state')).toContainText('Verified')
      await expect(zone.getByTestId('property-zone-history').getByRole('listitem')).toHaveCount(2)
      await expect(p.getByTestId('property-zone')).toHaveText(`${CENTRAL} (Central time)`)
      await axe(p)

      // Back on the request: planning in the property's zone, the Central gap refused, the window named in Central.
      await p.goto(`/staff/requests/${r.requestId}`)
      await expect(section.getByTestId('visits-zone')).toHaveText(CENTRAL)
      const plan = section.getByRole('form', { name: 'Plan a tentative visit' })
      await expect(plan.getByText(`Times are in ${CENTRAL}.`)).toBeVisible()
      await plan.getByLabel('Date', { exact: false }).fill(springDate)
      await plan.getByLabel('Arrival window starts', { exact: false }).fill(gap)
      await plan.getByLabel('Arrival window ends', { exact: false }).fill('05:00')
      await plan.getByRole('button', { name: 'Plan tentative visit' }).click()
      await expect(
        plan.getByText("This time does not exist on this date in the visit's time zone (the clocks move forward)."),
      ).toBeVisible()
      await expect(section.getByText('No visits yet.')).toBeVisible()
      const date = addLocalDays(localDateOf(new Date(), BUSINESS), 3)
      await plan.getByLabel('Date', { exact: false }).fill(date)
      await plan.getByLabel('Arrival window starts', { exact: false }).fill('09:00')
      await plan.getByLabel('Arrival window ends', { exact: false }).fill('11:00')
      await plan.getByRole('button', { name: 'Plan tentative visit' }).click()
      const visit = section.getByTestId('visit')
      await expect(visit).toHaveCount(1)
      await expect(visit.getByTestId('visit-window')).toContainText(
        /9:00 AM C[DS]T – 11:00 AM C[DS]T \(America\/Chicago\)/,
      )
      const stored = await withDb((db) =>
        db
          .selectFrom('work.visits as v')
          .innerJoin('crm.projects as p', 'p.id', 'v.project_id')
          .innerJoin('intake.requests as q', 'q.project_id', 'p.id')
          .select(['v.time_zone', 'v.starts_at', 'v.start_offset_minutes'])
          .where('q.id', '=', r.requestId)
          .executeTakeFirstOrThrow(),
      )
      expect(stored.time_zone).toBe(CENTRAL)
      expect(new Date(stored.starts_at).getTime()).toBe(
        Date.parse(`${date}T09:00:00Z`) - stored.start_offset_minutes * MIN,
      )

      // The recipient's own zone for texts is unknown and flagged: never taken from the property.
      await p.goto(`/staff/customers/${r.customerId}`)
      await expect(p.getByTestId('contact-zone')).toHaveText('Unknown: flagged for verification')
      await axe(p)
    } finally {
      await office.close()
    }
  })
})
