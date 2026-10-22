// Appointment reminder drafts in a real browser (TSK-0067; HH-COM-11, HH-COM-05, HH-COM-09, T65, S01, OWN-DEC-78,
// OWN-DEC-107). An Office user of this spec confirms an Estimate visit of a synthetic request through the staff API;
// its reminder is scheduled 24 hours before the arrival window. The draft's time is brought forward in the database
// (the visit is near), the draft appears in the action queue, and the Office user opens it on the scheduling board,
// sees the date and window, address and preparation, and sends it. No wording is approved for the reminder, so it is
// recorded as not sent (NOT CONFIGURED), never as sent. The visit is then moved (a new reminder for the new window)
// and cancelled: the waiting reminder is cancelled with it and never sends. The worker and its working hours (every
// day 08:00-20:00) are this spec's own fixtures, added straight to the database: they are synthetic, not the
// business's hours. axe checks each state. Every visitor, address, account and name is synthetic
// (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { addLocalDays, localDateOf } from '@handyhub/domain/local-time'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { verifyCountyOf } from '../county.js'
import { verifyPropertyZone } from '../zones.js'
import { passSecondFactor } from '../mfa.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.171' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OFFICE = 'e2e-appointment-reminders-office@example.test'
const WORKER = { email: 'e2e-appointment-reminders-ann@example.test', name: 'E2E Reminders Ann' }
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'appointment', 'reminders', 'passphrase', '67'].join(' ')
const ZONE = 'America/Kentucky/Louisville'
const STREET = '171 Synthetic Reminder Court'
/** A run-unique suffix in base 36 (never a long run of digits in free text). */
const run = Date.now().toString(36)

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-appointment-reminders' })
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
async function sendRequest(request: APIRequestContext) {
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': ['synthetic', 'e2e', 'appointment', 'reminders', run].join('-') },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-02' }],
      notSure: false,
      description: 'Synthetic reminder project: a ceiling crack to look at.',
      property: { street: STREET, city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Test Reminder Customer',
        email: `appointment-reminders-e2e-${run}@example.test`,
        phone: '(502) 555-0171',
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
  // TSK-0127: staff's address and county check, which a first confirmation needs.
  await verifyCountyOf(databaseUrl as string, row.project_id)
  // TSK-0123: a new property's zone is unknown; this spec plans visits, so its zone is recorded first.
  await withDb((db) => verifyPropertyZone(db, row.project_id))
  return { reference, requestId: row.id, projectId: row.project_id }
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
        .values({ staff_user_id: user.id, kind: 'role', name: 'worker', issued_by: 'e2e:reminders', reason: null })
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
      .values({ email: OFFICE, display_name: 'E2E Reminders Office', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: 'office', issued_by: 'e2e:reminders', reason: null })
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
  return { page, close: () => context.close() }
}

/** Staff writes through the API with the signed-in session (its cookie and CSRF token), as another screen would. */
async function staffApi(request: APIRequestContext) {
  const session = await request.get('/api/v1/staff/auth/session')
  const csrf = ((await session.json()) as { csrfToken: string }).csrfToken
  let n = 0
  return (url: string, data: unknown, version?: number) =>
    request.post(url, {
      data: data as object,
      headers: {
        'x-csrf-token': csrf,
        'idempotency-key': ['synthetic', 'e2e', 'reminders', 'write', run, String(++n)].join('-'),
        ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
      },
    })
}

const draftJobs = (visitId: string) =>
  withDb((db) =>
    db
      .selectFrom('platform.jobs')
      .select(['job_key', 'run_at', 'state'])
      .where('automation', '=', 'appointment.reminder_draft')
      .where('target_id', '=', visitId)
      .orderBy('seq')
      .execute(),
  )
const deliveries = (visitId: string) =>
  withDb((db) =>
    db
      .selectFrom('platform.message_deliveries')
      .select(['id', 'state', 'error_code', 'provider_message_id'])
      .where('record_type', '=', 'visit')
      .where('record_id', '=', visitId)
      .where('message_key', '=', 'reminder.appointment')
      .orderBy('seq')
      .execute(),
  )
/** The visit is near: its reminder's draft job (for this window version) is due now. */
const bringForward = (visitId: string, windowVersion: number) =>
  withDb((db) =>
    db
      .updateTable('platform.jobs')
      .set({ run_at: new Date() })
      .where('job_key', '=', `appointment.reminder_draft:${visitId}:w${windowVersion}`)
      .where('state', '=', 'queued')
      .execute(),
  )
/** The daily contact hours open: a released reminder's send job is due now. */
const sendNow = (deliveryId: string) =>
  withDb((db) =>
    db
      .updateTable('platform.jobs')
      .set({ run_at: new Date() })
      .where('job_key', '=', `notify.release:${deliveryId}`)
      .where('state', '=', 'queued')
      .execute(),
  )
const visitRow = (visitId: string) =>
  withDb((db) =>
    db
      .selectFrom('work.visits')
      .select(['state', 'version', 'window_version', 'starts_at'])
      .where('id', '=', visitId)
      .executeTakeFirstOrThrow(),
  )

test.describe('Appointment reminder drafts (TSK-0067)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-COM-11][T65][HH-COM-05][HH-COM-09] the draft 24 hours before waits in the queue for staff to send; a moved or cancelled visit’s reminder never sends', async ({
    page,
    browser,
  }) => {
    const annId = await worker()
    const link = await sendRequest(page.request)
    const date = addLocalDays(localDateOf(new Date(), ZONE), 41)
    const office = await officeSession(browser)
    try {
      const p = office.page
      const write = await staffApi(p.request)
      const planned = await write(`/api/v1/staff/projects/${link.projectId}/visits`, {
        purpose: 'site_estimate',
        localDate: date,
        windowStart: '09:00',
        windowEnd: '10:00',
        expectedDurationMinutes: 60,
        travelBufferMinutes: 30,
        preparationBufferMinutes: 0,
        requiredWorkers: 1,
        equipment: [],
      })
      expect(planned.status()).toBe(201)
      const v = ((await planned.json()) as { visits: { id: string; version: number }[] }).visits[0] as {
        id: string
        version: number
      }
      expect((await write(`/api/v1/staff/visits/${v.id}/confirm`, { workerIds: [annId] }, v.version)).status()).toBe(
        200,
      )

      // Confirming schedules the draft 24 hours before the arrival window (FACT-REMINDER-CADENCES, OWN-DEC-107).
      await expect.poll(async () => (await draftJobs(v.id)).length, { timeout: 15_000 }).toBe(1)
      const booked = await visitRow(v.id)
      const [job] = await draftJobs(v.id)
      expect((booked.starts_at as Date).getTime() - (job?.run_at as Date).getTime()).toBe(24 * 3_600_000)

      // The board's visit lists the schedule; nothing is drafted yet.
      await p.goto(`/staff/schedule/${v.id}`)
      const panel = p.getByTestId('board-selected').getByTestId('appointment-reminders')
      await expect(panel.getByRole('heading', { name: 'Appointment reminder' })).toBeVisible()
      await expect(panel.getByText(/^Drafted 24 hours before the arrival window/)).toBeVisible()
      await expect(panel.getByText('No reminder has been drafted yet.')).toBeVisible()
      await axe(p)

      // The visit is near: the draft waits in the action queue; nothing was sent.
      await bringForward(v.id, booked.window_version)
      await expect
        .poll(async () => (await deliveries(v.id)).map((d) => d.state), { timeout: 15_000 })
        .toEqual(['draft'])
      await p.goto('/staff')
      await p.getByLabel('Reference', { exact: true }).fill(link.reference)
      await p.getByRole('button', { name: 'Apply filters' }).click()
      const item = p.getByRole('listitem').filter({ hasText: 'Appointment reminder to send' })
      await expect(item).toHaveCount(1)
      await expect(item.getByText('The reminder for a confirmed appointment is ready to send')).toBeVisible()
      await axe(p)
      await item.getByRole('link', { name: link.reference }).click()
      await expect(p).toHaveURL(new RegExp(`/staff/schedule/${v.id}$`))
      const list = panel.getByRole('list', { name: 'Appointment reminder' })
      await expect(list.getByText('Reminder by Email')).toBeVisible()
      await expect(list.getByText('Draft, not sent')).toBeVisible()
      await expect(list.getByText(`${STREET}, Testville, KY 40000`)).toBeVisible()
      await expect(list.getByText(/9:00 AM E[SD]T/)).toBeVisible()
      await expect(list.getByText('None were given with the offered windows.')).toBeVisible()
      await axe(p)

      // Sent by staff: it goes out inside the contact hours. The owner's wording is released (TSK-0119) but its values are
      // wired by TSK-0121, so it is recorded as not sent.
      await panel.getByRole('button', { name: 'Send reminder' }).click()
      await expect(panel.getByText('Released for delivery. Its outcome shows here.')).toBeVisible()
      const [first] = await deliveries(v.id)
      await sendNow(first?.id as string)
      await expect
        .poll(async () => (await deliveries(v.id)).map((d) => [d.state, d.error_code]), { timeout: 15_000 })
        .toEqual([['failed', 'template_values_not_wired']])
      await p.reload()
      await expect(list.getByText('Not sent', { exact: true })).toBeVisible()
      await expect(
        list.getByText('Reason: The approved wording is released, but its values are not supplied yet'),
      ).toBeVisible()
      await expect(list.getByText(/^Sent by E2E Reminders Office, /)).toBeVisible()
      const queue = async (type: string) =>
        (
          (await (await p.request.get(`/api/v1/staff/queue?reference=${link.reference}`)).json()) as {
            items: { type: string; reason: string }[]
          }
        ).items.filter((i) => i.type === type)
      expect(await queue('appointment_reminder')).toEqual([])
      // OWN-DEC-107: the delivery failure is recorded for staff (a delivery issue with Retry).
      const issue = await withDb((db) =>
        db
          .selectFrom('ops.queue_items')
          .select(['reason', 'resolved_at'])
          .where('type', '=', 'delivery_failed')
          .where('subject_id', '=', first?.id as string)
          .execute(),
      )
      expect(issue).toEqual([{ reason: 'delivery_not_configured', resolved_at: null }])

      // The visit moves: the new window gets its own reminder, drafted when it is near.
      const before = await visitRow(v.id)
      const moved = await write(
        `/api/v1/staff/visits/${v.id}/window`,
        { localDate: date, windowStart: '13:00', windowEnd: '14:00', reason: 'Synthetic: the customer asked' },
        before.version,
      )
      expect(moved.status()).toBe(200)
      const after = await visitRow(v.id)
      await expect.poll(async () => (await draftJobs(v.id)).length, { timeout: 15_000 }).toBe(2)
      await bringForward(v.id, after.window_version)
      await expect
        .poll(async () => (await deliveries(v.id)).map((d) => d.state), { timeout: 15_000 })
        .toEqual(['failed', 'draft'])
      await p.reload()
      await expect(list.getByText('For an earlier date or window')).toBeVisible()
      await expect(list.getByText(/1:00 PM E[SD]T/)).toBeVisible()
      await expect(list.getByText('Reason: The appointment moved to another date or window')).toHaveCount(0)
      await axe(p)

      // On a phone the reminder panel fits the screen: nothing in it scrolls sideways.
      await p.setViewportSize({ width: 375, height: 740 })
      await expect(panel.getByRole('heading', { name: 'Appointment reminder' })).toBeVisible()
      const box = await panel.boundingBox()
      expect(box !== null && box.x >= 0 && box.x + box.width <= 375).toBe(true)

      // The visit is cancelled before anyone sends it: the waiting reminder is cancelled with it and never sends.
      const cancelled = await write(
        `/api/v1/staff/visits/${v.id}/cancel`,
        { reason: 'Synthetic: the customer cancelled', initiator: 'customer' },
        after.version,
      )
      expect(cancelled.status()).toBe(200)
      expect((await deliveries(v.id)).map((d) => [d.state, d.error_code, d.provider_message_id])).toEqual([
        ['failed', 'template_values_not_wired', null],
        ['cancelled', 'visit_canceled', null],
      ])
      expect(await queue('appointment_reminder')).toEqual([])
      // The board lists no canceled visit; the visit's reminders say why nothing is sent.
      const shown = (await (await p.request.get(`/api/v1/staff/visits/${v.id}/reminders`)).json()) as {
        stoppedBy: string | null
        reminders: { state: string; reason: string | null; actions: { release: boolean } }[]
      }
      expect(shown.stoppedBy).toBe('visit_canceled')
      expect(shown.reminders.map((r) => [r.state, r.reason, r.actions.release])).toEqual([
        ['failed', 'template_values_not_wired', false],
        ['cancelled', 'visit_canceled', false],
      ])
    } finally {
      await office.close()
    }
  })
})
