// The scheduling board in a browser (TSK-0065; HH-SCH-13, HH-OPS-03, HH-A11Y-02, HH-A11Y-01, T42, T69). An Office user
// of this spec sees a day by worker: a two-person Estimate visit on both of the spec's synthetic workers and a
// tentative visit not assigned yet. They start moving the booked visit from the board while someone else moves it
// first: saving shows the conflict banner with the current values and nothing is overwritten; reviewed and redone
// on the current version, the move is checked again and saved. On a 320 px screen the board starts as the simple
// list, with no sideways scrolling. Everything is driven with the keyboard (the board's alternative to dragging), and
// axe checks each state. The two workers and their working hours (every day 08:00-18:00) are this spec's own
// fixtures, added straight to the database: they are synthetic, not the business's hours. Every visitor, address,
// account and name is synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { addLocalDays, localDateOf } from '@handyhub/domain/local-time'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { verifyCountyOf } from '../county.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.165' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OFFICE = 'e2e-board-office@example.test'
const CREW = [
  { email: 'e2e-board-ann@example.test', name: 'E2E Board Ann' },
  { email: 'e2e-board-ben@example.test', name: 'E2E Board Ben' },
]
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'board', 'passphrase', '65'].join(' ')
const ZONE = 'America/Kentucky/Louisville'
/** A run-unique suffix in base 36 (never a long run of digits in free text). */
const run = Date.now().toString(36)

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-board' })
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

/** A request sent through the API (the wizard has its own specs); its project is open for Estimate visits. */
async function sendRequest(page: Page): Promise<{ projectId: string; reference: string }> {
  const res = await page.request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': ['synthetic', 'e2e', 'board', run].join('-') },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-02' }],
      notSure: false,
      description: 'Synthetic board project: a ceiling to look at.',
      property: {
        street: '165 Synthetic Board Lane',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Test Board Customer',
        email: `board-e2e-${run}@example.test`,
        phone: '(502) 555-0165',
        preferredChannel: 'email',
      },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.status()).toBe(201)
  const reference = ((await res.json()) as { reference: string }).reference
  const row = await withDb((db) =>
    db.selectFrom('intake.requests').select('project_id').where('reference', '=', reference).executeTakeFirstOrThrow(),
  )
  const project = await withDb((db) =>
    db.selectFrom('crm.projects').select('reference').where('id', '=', row.project_id).executeTakeFirstOrThrow(),
  )
  // TSK-0127: staff's address and county check, which a first confirmation needs.
  await verifyCountyOf(databaseUrl as string, row.project_id)
  return { projectId: row.project_id, reference: project.reference }
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
          .values({ staff_user_id: user.id, kind: 'role', name: 'worker', issued_by: 'e2e:board', reason: null })
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
      .values({ email: OFFICE, display_name: 'E2E Board Office', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: 'office', issued_by: 'e2e:board', reason: null })
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
  return { page, context, close: () => context.close() }
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
        'idempotency-key': ['synthetic', 'e2e', 'board', 'write', run, String(++n)].join('-'),
        ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
      },
    })
}

type Visit = { id: string; version: number }

test.describe('Scheduling board: by worker, stale edits and small screens (TSK-0065)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-SCH-13][HH-OPS-03][T42][T69][HH-A11Y-02] a day by worker; a stale move conflicts with the current values; usable at 320 px', async ({
    page,
    browser,
  }) => {
    const [annId, benId] = await crew()
    const r = await sendRequest(page)
    const date = addLocalDays(localDateOf(new Date(), ZONE), 44)
    const office = await officeSession(browser)
    try {
      const p = office.page
      const write = await staffApi(p.request)
      const plan = async (start: string, end: string, workers: number): Promise<Visit> => {
        const res = await write(`/api/v1/staff/projects/${r.projectId}/visits`, {
          purpose: 'site_estimate',
          localDate: date,
          windowStart: start,
          windowEnd: end,
          expectedDurationMinutes: 60,
          travelBufferMinutes: 30,
          preparationBufferMinutes: 0,
          requiredWorkers: workers,
          equipment: [],
        })
        expect(res.status()).toBe(201)
        const all = ((await res.json()) as { visits: (Visit & { window: { start: string } })[] }).visits
        return all.find((v) => v.window.start === start) as Visit
      }
      const two = await plan('09:00', '10:00', 2)
      const confirmed = await write(
        `/api/v1/staff/visits/${two.id}/confirm`,
        { workerIds: [annId, benId] },
        two.version,
      )
      expect(confirmed.status()).toBe(200)
      await plan('14:00', '15:00', 1)

      // The board on that day: the two-person visit on both workers; the tentative one apart.
      await p.goto('/staff/schedule')
      await expect(p.getByRole('heading', { level: 1, name: 'Scheduling board' })).toBeVisible()
      await p.getByRole('button', { name: 'By worker' }).click()
      await p.getByLabel('Go to date').fill(date)
      await p.getByRole('button', { name: 'Show this date' }).press('Enter')
      const ann = p.getByRole('region', { name: 'E2E Board Ann' })
      const ben = p.getByRole('region', { name: 'E2E Board Ben' })
      const annEntry = ann.getByTestId('board-entry').filter({ hasText: r.reference })
      await expect(annEntry).toHaveCount(1)
      await expect(ben.getByTestId('board-entry').filter({ hasText: r.reference })).toHaveCount(1)
      // Times are read in the business zone, not this browser's (Asia/Tokyo).
      await expect(annEntry).toContainText('9:00')
      await expect(annEntry).toContainText('Estimate visit')
      await expect(annEntry).toContainText('Team: E2E Board Ann (lead), E2E Board Ben (team)')
      await expect(annEntry).toContainText('Work 60 min · Travel 30 min · Preparation 0 min')
      // 08:00-18:00, 08:30-11:00 reserved: 7 h 30 min left.
      await expect(ann.getByTestId('board-capacity')).toHaveText('Free: 7 h 30 min')
      const unassigned = p.getByRole('region', { name: 'Not assigned to a worker yet' })
      await expect(unassigned.getByTestId('board-entry').filter({ hasText: r.reference })).toContainText(
        'Tentative: not a booking',
      )
      await axe(p)

      // Open the booked visit and start a move, with the keyboard only.
      await annEntry.getByRole('button').focus()
      await p.keyboard.press('Enter')
      const panel = p.getByTestId('board-selected')
      await expect(panel.getByRole('heading', { level: 2 })).toBeFocused()
      await panel.getByRole('button', { name: 'Move' }).press('Enter')
      const form = panel.getByRole('form', { name: 'Move this visit' })
      await form.getByLabel('Arrival window starts').fill('10:00')
      await form.getByLabel('Arrival window ends').fill('11:00')
      // TSK-0066: a booked visit's reschedule records its reason.
      await form.getByLabel('Reason (required)').fill('Synthetic: the customer asked for later')

      // Meanwhile someone else moves it first, from another screen.
      const current = await withDb((db) =>
        db.selectFrom('work.visits').select('version').where('id', '=', two.id).executeTakeFirstOrThrow(),
      )
      const first = await write(
        `/api/v1/staff/visits/${two.id}/window`,
        { localDate: date, windowStart: '11:00', windowEnd: '12:00', reason: 'Synthetic: the other editor' },
        current.version,
      )
      expect(first.status()).toBe(200)

      // Saving the stale edit: the conflict with the current values; nothing was overwritten.
      await form.getByRole('button', { name: 'Save the new window' }).press('Enter')
      const banner = form.getByTestId('conflict-banner')
      await expect(banner).toBeVisible()
      await expect(banner.getByRole('row', { name: /Arrival window starts/ })).toHaveText(/11:00\s*10:00/)
      await axe(p)
      const after = await withDb((db) =>
        db
          .selectFrom('work.visits')
          .select(['version', 'window_start'])
          .where('id', '=', two.id)
          .executeTakeFirstOrThrow(),
      )
      expect([after.version, after.window_start.slice(0, 5)]).toEqual([current.version + 1, '11:00'])

      // Reviewed and redone on the current version: checked again on the server, then saved.
      await banner.getByRole('button', { name: 'Review and redo my change' }).press('Enter')
      await expect(form.getByTestId('conflict-banner')).toHaveCount(0)
      await form.getByRole('button', { name: 'Save the new window' }).press('Enter')
      await expect(p.getByTestId('board-notice')).toHaveText('The new window is saved.')
      await expect(panel.getByTestId('board-selected-window')).toContainText('10:00')
      const saved = await withDb((db) =>
        db
          .selectFrom('work.visits')
          .select(['version', 'window_start'])
          .where('id', '=', two.id)
          .executeTakeFirstOrThrow(),
      )
      expect([saved.version, saved.window_start.slice(0, 5)]).toEqual([current.version + 2, '10:00'])
      // The team moved with it: both workers still reserved, never doubled.
      const active = await withDb((db) =>
        db
          .selectFrom('work.reservations')
          .select('staff_user_id')
          .where('visit_id', '=', two.id)
          .where('ended_at', 'is', null)
          .execute(),
      )
      expect(active.map((a) => a.staff_user_id).sort()).toEqual([annId, benId].sort())

      // At 320 px: the simple list by default, every visit reachable, nothing scrolls sideways.
      const phone = await office.context.newPage()
      await phone.setViewportSize({ width: 320, height: 800 })
      await phone.goto('/staff/schedule')
      await expect(phone.getByRole('heading', { level: 1, name: 'Scheduling board' })).toBeVisible()
      await expect(phone.getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')
      await phone.getByLabel('Go to date').fill(date)
      await phone.getByRole('button', { name: 'Show this date' }).press('Enter')
      const list = phone.getByTestId('board-list')
      await expect(list.getByTestId('board-entry').filter({ hasText: r.reference })).toHaveCount(2)
      await expect(list.getByTestId('board-list-capacity')).toContainText('E2E Board Ann: Free:')
      const sideways = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(sideways).toBeLessThanOrEqual(0)
      await axe(phone)
      // The lanes reflow at 320 px too.
      await phone.getByRole('button', { name: 'By worker' }).press('Enter')
      await expect(phone.getByRole('region', { name: 'E2E Board Ann' })).toBeVisible()
      expect(await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(
        0,
      )
      await phone.getByRole('button', { name: 'Week' }).press('Enter')
      await expect(phone.getByRole('region', { name: 'E2E Board Ann' }).getByTestId('board-day')).toHaveCount(7)
      expect(await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(
        0,
      )
      await axe(phone)
    } finally {
      await office.close()
    }
  })
})
