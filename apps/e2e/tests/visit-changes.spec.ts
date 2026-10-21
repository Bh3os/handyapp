// Reschedule, reassign, cancel and the customer's change requests in real browsers (TSK-0066; HH-SCH-07, HH-PORT-04,
// HH-OPS-03, HH-A11Y-01, T25, T42, OWN-DEC-107, OWN-DEC-119, OWN-DEC-134). A confirmed Estimate visit of a synthetic
// request: the customer presses "Request to Reschedule" in the Appointments tab and sees "Request received—awaiting
// staff confirmation." with the appointment still shown as confirmed; the Office user opens the visit from the board,
// confirms the request by moving it (with a reason), then reassigns it to the other worker; the customer sees the new
// window, presses "Request Cancellation", and the Office user confirms it, seeing the outcome of the cancellation
// rules first (an Estimate visit cancelled days ahead: nothing owed). The two workers and their working hours (every
// day 08:00-20:00) are this spec's own fixtures, added straight to the database: they are synthetic, not the
// business's hours. axe checks each state. Every visitor, address, account and name is synthetic
// (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { addLocalDays, localDateOf } from '@handyhub/domain/local-time'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.166' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OFFICE = 'e2e-changes-office@example.test'
const CREW = [
  { email: 'e2e-changes-ann@example.test', name: 'E2E Changes Ann' },
  { email: 'e2e-changes-ben@example.test', name: 'E2E Changes Ben' },
]
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'changes', 'passphrase', '66'].join(' ')
const ZONE = 'America/Kentucky/Louisville'
const STREET = '166 Synthetic Change Court'
/** A run-unique suffix in base 36 (never a long run of digits in free text). */
const run = Date.now().toString(36)

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-changes' })
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
    headers: { 'idempotency-key': `synthetic-e2e-changes-${run}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-02' }],
      notSure: false,
      description: 'Synthetic change project: a ceiling crack to look at.',
      property: { street: STREET, city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { flexible: true, needHelpToday: false, windows: ['afternoons'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Test Changes Customer',
        email: `changes-e2e-${run}@example.test`,
        phone: '(502) 555-0166',
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
          .values({ staff_user_id: user.id, kind: 'role', name: 'worker', issued_by: 'e2e:changes', reason: null })
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
      .values({ email: OFFICE, display_name: 'E2E Changes Office', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: 'office', issued_by: 'e2e:changes', reason: null })
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
        'idempotency-key': ['synthetic', 'e2e', 'changes', 'write', run, String(++n)].join('-'),
        ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
      },
    })
}

test.describe('Reschedule, reassign, cancel and customer change requests (TSK-0066)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-PORT-04][HH-SCH-07][T25][T42][HH-A11Y-01] a request keeps the booking until staff commit; reassignment moves it between workers; a confirmed cancellation shows its outcome', async ({
    page,
    browser,
  }) => {
    const [annId, benId] = await crew()
    const link = await sendRequest(page)
    const date = addLocalDays(localDateOf(new Date(), ZONE), 46)
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

      // The customer asks to reschedule: the request is received and the appointment stays confirmed.
      await openProject(page, link)
      await page.getByRole('tab', { name: 'Appointments' }).click()
      const item = page.getByRole('tabpanel').getByTestId('appointment-item')
      await expect(item.getByTestId('appointment')).toContainText('Confirmed')
      await item.getByRole('button', { name: 'Request to Reschedule' }).click()
      const ask = item.getByTestId('appointment-request-form')
      await ask.getByLabel('Reason (optional)').fill('Synthetic: a family trip')
      await ask.getByLabel('Times that work better for you (optional)').fill('Synthetic: an afternoon')
      await axe(page)
      await ask.getByRole('button', { name: 'Send request to reschedule' }).click()
      await expect(item.getByTestId('appointment-request')).toContainText(
        'Request received—awaiting staff confirmation.',
      )
      await expect(item.getByTestId('appointment')).toContainText('Confirmed')
      await expect(item.getByTestId('appointment-window')).toContainText(/arrival between 9:00 AM E[SD]T/)
      await expect(item.getByRole('button', { name: 'Request Cancellation' })).toHaveCount(0)
      await axe(page)
      const booking = await withDb((db) =>
        db.selectFrom('work.visits').select(['state', 'version']).where('id', '=', v.id).executeTakeFirstOrThrow(),
      )
      expect(booking).toEqual({ state: 'confirmed', version: v.version + 1 })

      // Staff open the visit from the board (a queue item's link) and confirm the request by moving it.
      await p.goto(`/staff/schedule/${v.id}`)
      const panel = p.getByTestId('board-selected')
      const request = panel.getByTestId('change-request')
      await expect(request).toContainText('Request to Reschedule')
      await expect(request).toContainText('Synthetic: a family trip')
      await expect(request).toContainText('Synthetic: an afternoon')
      await axe(p)
      await request.getByRole('button', { name: 'Move the visit as asked' }).click()
      const move = panel.getByRole('form', { name: 'Move this visit' })
      await expect(move).toContainText("Saving this confirms the customer's reschedule request.")
      await move.getByLabel('Arrival window starts').fill('13:00')
      await move.getByLabel('Arrival window ends').fill('14:00')
      await move.getByLabel('Reason (required)').fill('Synthetic: as the customer asked')
      await move.getByRole('button', { name: 'Save the new window' }).click()
      await expect(p.getByTestId('board-notice')).toHaveText('The new window is saved.')
      await expect(panel.getByTestId('change-request')).toHaveCount(0)
      await expect(panel.getByTestId('board-selected-window')).toContainText('1:00')

      // Reassign it to the other worker, with a reason: the window stays; the old reservation is history.
      await panel.getByRole('button', { name: 'Reassign' }).click()
      const reassign = panel.getByRole('form', { name: 'Reassign the visit' })
      await reassign.getByLabel(/E2E Changes Ann/).uncheck()
      await reassign.getByLabel(/E2E Changes Ben/).check()
      await reassign.getByLabel('Reason (required)').fill('Synthetic: Ann is needed elsewhere')
      await axe(p)
      await reassign.getByRole('button', { name: 'Reassign' }).click()
      await expect(p.getByTestId('board-notice')).toHaveText('The visit was reassigned.')
      await expect(panel.getByTestId('board-selected-team')).toContainText('E2E Changes Ben')
      await expect(panel.getByTestId('board-selected-team')).not.toContainText('E2E Changes Ann')
      const team = await withDb((db) =>
        db
          .selectFrom('work.reservations')
          .select(['staff_user_id', 'ended_reason'])
          .where('visit_id', '=', v.id)
          .orderBy('created_at')
          .execute(),
      )
      expect(team.map((r) => [r.staff_user_id, r.ended_reason])).toEqual([
        [annId, 'rescheduled'],
        [annId, 'reassigned'],
        [benId, null],
      ])
      const changes = await withDb((db) =>
        db
          .selectFrom('work.visit_changes')
          .select(['kind', 'initiator', 'reason'])
          .where('visit_id', '=', v.id)
          .orderBy('changed_at')
          .execute(),
      )
      expect(changes).toEqual([
        { kind: 'rescheduled', initiator: 'customer', reason: 'Synthetic: as the customer asked' },
        { kind: 'reassigned', initiator: null, reason: 'Synthetic: Ann is needed elsewhere' },
      ])

      // The customer sees the new window and asks to cancel.
      await page.reload()
      await page.getByRole('tab', { name: 'Appointments' }).click()
      const again = page.getByRole('tabpanel').getByTestId('appointment-item')
      await expect(again.getByTestId('appointment-window')).toContainText(/arrival between 1:00 PM E[SD]T/)
      await expect(again.getByTestId('appointment-request')).toHaveCount(0)
      await again.getByRole('button', { name: 'Request Cancellation' }).click()
      const cancelAsk = again.getByTestId('appointment-request-form')
      await expect(cancelAsk).not.toContainText('$')
      await cancelAsk.getByRole('button', { name: 'Send cancellation request' }).click()
      await expect(again.getByTestId('appointment-request')).toContainText(
        'Request received—awaiting staff confirmation.',
      )

      // Staff confirm it, seeing the outcome of the rules first; nothing is refunded or charged by the app.
      await p.reload()
      const asked = p.getByTestId('board-selected').getByTestId('change-request')
      await expect(asked).toContainText('Request Cancellation')
      await expect(asked.getByTestId('cancellation-outcome')).toContainText('Full deposit refund, no charge')
      await asked.getByRole('button', { name: 'Cancel the visit as asked' }).click()
      const cancel = p.getByTestId('board-selected').getByRole('form', { name: 'Cancel the visit' })
      await expect(cancel).toContainText("This confirms the customer's cancellation request.")
      await cancel.getByLabel('Reason (required)').fill('Synthetic: the customer cancelled')
      await axe(p)
      await cancel.getByRole('button', { name: 'Cancel the visit' }).click()
      await expect(p.getByTestId('board-notice')).toHaveText('The visit was canceled.')
      const canceled = await withDb((db) =>
        db.selectFrom('work.visits').select('state').where('id', '=', v.id).executeTakeFirstOrThrow(),
      )
      expect(canceled.state).toBe('canceled')

      await page.reload()
      await page.getByRole('tab', { name: 'Appointments' }).click()
      const last = page.getByRole('tabpanel').getByTestId('appointment-item')
      await expect(last.getByTestId('appointment')).toContainText('Canceled')
      await expect(last.getByRole('button', { name: 'Request to Reschedule' })).toHaveCount(0)
      await axe(page)
    } finally {
      await office.close()
    }
  })
})
