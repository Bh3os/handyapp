// Staff management in a real browser (TSK-0097; HH-STAFF-02, HH-STAFF-03, HH-STAFF-07, T26, T27, T64). The Owner
// opens the Staff screen, gives this spec's synthetic worker the Office role (the change needs a fresh sign-in, so
// the screen asks for the password and then sends it), and disables the worker while the worker is signed in in
// another browser: the worker's next request finds no session, the worker's confirmed appointment stays booked and
// appears in the action queue for reassignment. The worker, their working hours (every day 08:00-18:00) and the
// request are this spec's own synthetic fixtures (RULE-SYNTHETIC-DATA), not the business's. The Owner account is the
// one the staff sign-in spec creates (staff-auth runs first): this spec only sets a password for it with a reset link.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { addLocalDays, localDateOf } from '@handyhub/domain/local-time'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { verifyCountyOf } from '../county.js'
import { verifyPropertyZone } from '../zones.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.197' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OWNER = 'e2e-owner@example.test'
const LEAVER = { email: 'e2e-staff-leaver@example.test', name: 'E2E Staff Leaver' }
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (n: number) => ['synthetic', 'staff', 'management', 'passphrase', String(n)].join(' ')
const ZONE = 'America/Kentucky/Louisville'

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-staff-management' })
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

function staffAccess(...args: string[]): string {
  const out = execFileSync(process.execPath, [cli, ...args], {
    env: { ...process.env, HANDYHUB_ENV: 'ci', DATABASE_URL: databaseUrl, PORT: port, HOST: '127.0.0.1' },
    encoding: 'utf8',
    stdio: 'pipe',
  })
  return new URL(out.split('\n')[0] as string).pathname
}

async function setPasswordAndSignIn(page: Page, email: string, password: string) {
  await page.goto(staffAccess('password-link', email))
  await page.getByLabel('New password').fill(password)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

/** This spec's worker with synthetic working hours (a version and its hours in one transaction), added straight to the database. */
async function leaver(): Promise<string> {
  return withDb((db) =>
    db.transaction().execute(async (tx) => {
      const user = await tx
        .insertInto('identity.staff_users')
        .values({ email: LEAVER.email, display_name: LEAVER.name, locale: 'en' })
        .returning('id')
        .executeTakeFirstOrThrow()
      await tx.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
      await tx
        .insertInto('identity.role_grants')
        .values({
          staff_user_id: user.id,
          kind: 'role',
          name: 'worker',
          issued_by: 'e2e:staff-management',
          reason: null,
        })
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
      return user.id
    }),
  )
}

const ALL_OK = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

/** A request needing a site visit, with a confirmed Estimate visit of the worker, through the Owner's staff API. */
async function bookedVisit(request: APIRequestContext, workerId: string): Promise<{ reference: string }> {
  const submitted = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `synthetic-e2e-staff-management-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-02' }],
      notSure: false,
      description: 'Synthetic staff management project: a ceiling to look at.',
      property: {
        street: '197 Synthetic Staff Court',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Test Staff Customer',
        email: `staff-management-e2e-${Date.now()}@example.test`,
        phone: '(502) 555-0197',
        preferredChannel: 'email',
      },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(submitted.status()).toBe(201)
  const { reference } = (await submitted.json()) as { reference: string }
  const row = await withDb((db) =>
    db
      .selectFrom('intake.requests')
      .select(['id', 'project_id'])
      .where('reference', '=', reference)
      .executeTakeFirstOrThrow(),
  )
  // TSK-0123: a new property's zone is unknown; this spec plans visits, so its zone is recorded first.
  await withDb((db) => verifyPropertyZone(db, row.project_id))
  const csrf = ((await (await request.get('/api/v1/staff/auth/session')).json()) as { csrfToken: string }).csrfToken
  let n = 0
  const write = async (method: 'post' | 'put', url: string, data: unknown, version?: number) => {
    const res = await request[method](`/api/v1${url}`, {
      data,
      headers: {
        'x-csrf-token': csrf,
        'idempotency-key': `synthetic-e2e-staff-management-${++n}-${Date.now()}`,
        ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
      },
    })
    expect(res.ok(), await res.text()).toBe(true)
    return res.json()
  }
  await write('put', `/staff/requests/${row.id}/qualification`, { checks: ALL_OK }, 0)
  await write(
    'post',
    `/staff/requests/${row.id}/actions/estimate-visit`,
    { customerExplanation: 'We need to see the synthetic ceiling.', workPackages: ['SVC-DW-02'] },
    1,
  )
  // TSK-0127: staff's address and county check, which a first confirmation needs.
  await verifyCountyOf(databaseUrl as string, row.project_id)
  const planned = (await write('post', `/staff/projects/${row.project_id}/visits`, {
    purpose: 'site_estimate',
    localDate: addLocalDays(localDateOf(new Date(), ZONE), 40),
    windowStart: '09:00',
    windowEnd: '10:00',
    expectedDurationMinutes: 60,
    travelBufferMinutes: 30,
    preparationBufferMinutes: 0,
    requiredWorkers: 1,
    equipment: [],
  })) as { visits: { id: string; version: number }[] }
  const visit = planned.visits[planned.visits.length - 1] as { id: string; version: number }
  await write('post', `/staff/visits/${visit.id}/confirm`, { workerIds: [workerId] }, visit.version)
  return { reference }
}

test.describe('Staff management: roles and offboarding (TSK-0097)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-STAFF-03][HH-STAFF-02][HH-STAFF-07][T27][T64] the Owner gives a role with a fresh sign-in and disables a signed-in worker', async ({
    page,
    browser,
  }) => {
    const workerId = await leaver()
    await setPasswordAndSignIn(page, OWNER, pw(1))
    await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()

    // The worker sets a password (the account becomes active) and is signed in in a browser of their own.
    const context = await browser.newContext({ extraHTTPHeaders: HEADERS })
    const worker = await context.newPage()
    try {
      await setPasswordAndSignIn(worker, LEAVER.email, pw(2))
      await expect(worker.getByRole('heading', { level: 1, name: 'My Day' })).toBeVisible()
      const { reference } = await bookedVisit(page.request, workerId)

      await page.getByRole('link', { name: 'Staff', exact: true }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Staff' })).toBeVisible()
      const card = page.getByTestId('staff-member').filter({ hasText: LEAVER.name })
      await expect(card.getByTestId('staff-member-roles')).toHaveText('Roles: Worker')
      await expect(card).toContainText('1 upcoming assignment, 0 flagged for review')
      await axe(page)
      await card.getByRole('button', { name: `Manage ${LEAVER.name}` }).click()
      const record = card.getByTestId('staff-member-record')
      await expect(record.getByTestId('staff-assignments')).toContainText(reference)

      // T64: giving a role needs a fresh sign-in. The Owner's last password entry is made older than the window.
      await withDb((db) =>
        db
          .updateTable('identity.staff_sessions')
          .set({ authenticated_at: new Date(Date.now() - 6 * 60_000) })
          .where('revoked_at', 'is', null)
          .where('staff_user_id', 'in', (eb) =>
            eb.selectFrom('identity.staff_users').select('id').where('email', '=', OWNER),
          )
          .execute(),
      )
      await record.getByLabel('Role or permission', { exact: true }).selectOption('role:office')
      await record.getByLabel('Reason', { exact: true }).fill('E2E: covers the desk')
      await record.getByRole('button', { name: 'Give', exact: true }).click()
      const prompt = record.getByTestId('staff-reauth')
      await expect(prompt).toContainText('This change needs a fresh sign-in.')
      await prompt.getByLabel('Password').fill(pw(1))
      await prompt.getByRole('button', { name: 'Confirm password' }).click()
      await expect(record.getByText('Given. It applies from this person', { exact: false })).toBeVisible()
      await expect(card.getByTestId('staff-member-roles')).toHaveText('Roles: Office / Dispatcher, Worker')
      await axe(page)

      // T27: disabling while the worker is signed in.
      await record.getByLabel('Reason (optional)').fill('E2E: left the team')
      await record.getByRole('button', { name: 'Disable account' }).click()
      const confirm = record.getByTestId('staff-disable-confirm')
      await expect(confirm).toContainText('Upcoming appointments stay booked')
      await confirm.getByRole('button', { name: 'Disable now' }).click()
      await expect(record.getByText('Disabled. 1 session ended; 1 appointment flagged for reassignment.')).toBeVisible()
      await expect(card.getByText('Disabled', { exact: true })).toBeVisible()
      await expect(record.getByRole('button', { name: 'Re-enable account' })).toBeVisible()
      await expect(record.getByTestId('staff-status-history')).toContainText('Reason: E2E: left the team')

      // The worker's next request finds no session: the app goes back to sign-in.
      await worker.reload()
      await expect(worker.getByRole('heading', { level: 1, name: 'Staff sign-in' })).toBeVisible()

      // The appointment stays booked and waits in the action queue for reassignment.
      await page.getByRole('link', { name: 'Action queue' }).click()
      const queue = page.locator('.staff-queue__list-wrap').first()
      await queue.getByLabel('Reference').fill(reference)
      await queue.getByRole('button', { name: 'Apply filters' }).click()
      const item = page.getByRole('listitem', { name: new RegExp(`Appointment flagged for review ${reference}`) })
      await expect(item).toBeVisible()
      await expect(item.getByText("An assigned person's account was disabled: reassign")).toBeVisible()
      await expect(item.getByRole('link', { name: 'Review the assignment' })).toBeVisible()
      await axe(page)

      const rows = await withDb((db) =>
        db
          .selectFrom('work.reservations as r')
          .innerJoin('work.visits as v', 'v.id', 'r.visit_id')
          .select(['v.state', 'r.ended_at'])
          .where('r.staff_user_id', '=', workerId)
          .execute(),
      )
      expect(rows).toEqual([{ state: 'confirmed', ended_at: null }])
    } finally {
      await context.close()
    }
  })
})
