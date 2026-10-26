// Reviewed default preparation instructions for window offers in real browsers (TSK-0146; OWN-DEC-194 B7, HH-SCH-11,
// HH-CUS-02, RULE-NO-INVENTED-FACTS). The Owner opens Settings: the TV-mounting service has no default (not
// configured) until the Owner approves the reviewed "Getting ready" steps of its service page. An Office user of this
// spec then offers windows of an Estimate visit on a synthetic TV-mounting request: the instructions start from that
// default; an unsafe edit is flagged while typing and refused by the server; the edited text is published with the
// offer, which shows it as edited from the default. At the end the Owner removes the default, so the service is NOT
// CONFIGURED again for the specs that follow in the shared database. The worker and its working hours (every day
// 08:00-20:00) are this spec's own fixtures, added straight to the database: they are synthetic, not the business's
// hours. Every visitor, address, account, name and instruction this spec writes is synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { addLocalDays, localDateOf } from '@handyhub/domain/local-time'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { verifyCountyOf } from '../county.js'
import { verifyPropertyZone } from '../zones.js'
import { passSecondFactor } from '../mfa.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.146' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
// The Owner every spec shares (staff-auth.spec.ts creates it; whichever spec runs first does here).
const OWNER = 'e2e-owner@example.test'
const OFFICE = 'e2e-preparation-office@example.test'
const WORKER = { email: 'e2e-preparation-worker@example.test', name: 'E2E Preparation Worker' }
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'preparation', 'passphrase', '146'].join(' ')
const ZONE = 'America/Kentucky/Louisville'
const SERVICE = 'SVC-HI-04'
const SERVICE_NAME = 'TV Mounting & Wire Hiding'
const EDIT = 'Synthetic: the side gate code is with the neighbor.'

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-preparation' })
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

/** The reviewed "Getting ready" steps of the service's published page version, one per line (TSK-0132). */
const reviewedSteps = () =>
  withDb(async (db) => {
    const r = await db
      .selectFrom('catalog.services as s')
      .innerJoin('catalog.service_versions as v', (j) =>
        j.onRef('v.service_id', '=', 's.id').onRef('v.version', '=', 's.published_version'),
      )
      .select('v.content')
      .where('s.id', '=', SERVICE)
      .executeTakeFirstOrThrow()
    return (r.content as { preparation: string[] }).preparation.join('\n')
  })

/** A request sent through the API (the wizard has its own specs). */
async function sendRequest(page: Page) {
  const res = await page.request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `synthetic-e2e-preparation-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: SERVICE }],
      notSure: false,
      description: 'Synthetic preparation-default project: a television to mount.',
      property: {
        street: '146 Synthetic Preparation Court',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['afternoons'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Test Preparation Customer',
        email: `preparation-e2e-${Date.now()}@example.test`,
        phone: '(502) 555-0146',
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
  await verifyCountyOf(databaseUrl as string, row.project_id)
  await withDb((db) => verifyPropertyZone(db, row.project_id))
  return { requestId: row.id, projectId: row.project_id }
}

/** The spec's field worker with synthetic working hours (a version and its hours in one transaction). */
async function worker(): Promise<void> {
  await withDb((db) =>
    db.transaction().execute(async (tx) => {
      const existing = await tx
        .selectFrom('identity.staff_users')
        .select('id')
        .where('email', '=', WORKER.email)
        .executeTakeFirst()
      if (existing) return
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
        .values({ staff_user_id: user.id, kind: 'role', name: 'worker', issued_by: 'e2e:preparation', reason: null })
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
    }),
  )
}

/** A staff account (this spec's Office user, or the shared Owner), signed in through the staff app in its own browser. */
async function staffSession(browser: Browser, email: string, role: 'office' | 'owner', name: string) {
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
      .where('email', '=', email)
      .executeTakeFirst()
    if (existing) return
    const user = await db
      .insertInto('identity.staff_users')
      .values({ email, display_name: name, locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: role, issued_by: 'e2e:preparation', reason: null })
      .execute()
  })
  const context = await browser.newContext({ extraHTTPHeaders: HEADERS, locale: 'en-US' })
  const page = await context.newPage()
  await page.goto(staffAccess('password-link', email))
  await page.getByLabel('New password').fill(pw)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(pw)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // MFA is mandatory (TSK-0154): enrol on the account's first sign-in, the code afterwards.
  await passSecondFactor(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
  return { page, close: () => context.close() }
}

/** The Owner's entry for the spec's service on the settings screen, opened. */
async function serviceEntry(page: Page) {
  await page.goto('/staff/settings')
  const section = page.getByTestId('preparation-defaults')
  await expect(section.getByRole('heading', { name: 'Default preparation instructions for offers' })).toBeVisible()
  const entry = section.getByTestId('preparation-service').filter({ hasText: SERVICE_NAME })
  await entry.locator('summary').click()
  return entry
}

test.describe('Reviewed default preparation instructions for offers (TSK-0146)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-SCH-11][HH-CUS-02][OWN-DEC-194] offers start from the approved default; an unsafe edit is refused; the edit is kept', async ({
    page,
    browser,
  }) => {
    await worker()
    const steps = await reviewedSteps()
    const link = await sendRequest(page)
    const date = addLocalDays(localDateOf(new Date(), ZONE), 43)
    const owner = await staffSession(browser, OWNER, 'owner', 'E2E Owner')
    const office = await staffSession(browser, OFFICE, 'office', 'E2E Preparation Office')
    try {
      // The Owner: NOT CONFIGURED until the reviewed steps are approved as the default.
      const o = owner.page
      let entry = await serviceEntry(o)
      await expect(entry.locator('summary')).toContainText('Not configured')
      await expect(entry.getByTestId('preparation-current-missing')).toContainText(
        'offers for this service start without instructions',
      )
      await expect(entry.getByTestId('preparation-page')).toHaveText(steps)
      await axe(o)
      await entry.getByRole('button', { name: 'Approve the reviewed steps as the default' }).click()
      await expect(entry.getByTestId('preparation-current')).toHaveText(steps)
      await expect(entry.locator('summary')).toContainText('Default version 1')

      // The Office user offers windows: the instructions start from the default.
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
      await visit.getByRole('button', { name: 'Offer windows to the customer' }).click()
      const form = visit.getByTestId('offer-windows')
      const instructions = form.getByLabel(/Preparation instructions/)
      await expect(instructions).toHaveValue(steps)
      await expect(form.getByTestId('offer-preparation-default')).toContainText(SERVICE_NAME)
      const second = form.getByTestId('offer-window').nth(1)
      await second.getByLabel('Arrival window starts', { exact: false }).fill('13:00')
      await second.getByLabel('Arrival window ends', { exact: false }).fill('14:00')
      await form.getByLabel(/E2E Preparation Worker/).check()

      // An unsafe edit is flagged while typing and refused by the server; nothing is offered.
      await instructions.fill(`${steps}\nSynthetic: climb onto the roof to check the antenna.`)
      await expect(form.getByTestId('offer-preparation')).toContainText(
        'Heights or confined spaces (roof, ladder, attic, crawl space): “climb onto the roof”',
      )
      await form.getByRole('button', { name: 'Offer and hold these windows' }).click()
      await expect(form).toContainText('The windows were not offered')
      await expect(form).toContainText('The instructions ask the customer to work at height or in a confined space')
      expect(
        await withDb((db) =>
          db.selectFrom('work.window_offers').select('id').where('project_id', '=', link.projectId).execute(),
        ),
      ).toEqual([])

      // The edited text is published with the offer and kept as edited from the default.
      await instructions.fill(`${steps}\n${EDIT}`)
      await expect(form.getByTestId('offer-preparation')).not.toContainText('ask the customer to do something unsafe')
      await axe(p)
      await form.getByRole('button', { name: 'Offer and hold these windows' }).click()
      const offer = visit.getByTestId('visit-offer')
      await expect(offer).toContainText('Offer 1')
      await expect(offer).toContainText(EDIT)
      await expect(offer.getByTestId('offer-preparation-basis')).toHaveText(
        'Preparation: edited from the approved default',
      )
      const row = await withDb((db) =>
        db
          .selectFrom('work.window_offers')
          .select(['preparation_instructions', 'preparation_basis'])
          .where('project_id', '=', link.projectId)
          .executeTakeFirstOrThrow(),
      )
      expect(row).toEqual({ preparation_instructions: `${steps}\n${EDIT}`, preparation_basis: 'edited' })

      // The Owner removes the default: the service is NOT CONFIGURED again; the offer keeps its instructions.
      entry = await serviceEntry(o)
      await entry.getByRole('button', { name: 'Remove the default' }).click()
      await expect(entry.locator('summary')).toContainText('Not configured')
      await expect(entry.getByTestId('preparation-history')).toContainText('Version 2: Default removed, by')
      await p.reload()
      await expect(p.getByTestId('visit-offer')).toContainText(EDIT)
    } finally {
      await office.close()
      await owner.close()
    }
  })
})
