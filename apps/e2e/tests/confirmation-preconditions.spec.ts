// A blocking hold stops a visit's confirmation, in a real browser (TSK-0064; HH-SCH-06, HH-SCH-05, T40, ENT-Hold,
// RULE-SAFETY-GATES). An Office user of this spec plans a tentative Estimate visit on a synthetic request; staff then
// flag a potential hazard on the request (a qualification revision whose risk flags name it), which opens a review
// hold. The visit says "Not ready to confirm" with the hold's reason and offers no Confirm; the server refuses a
// confirmation sent anyway, naming the hold, and nothing is reserved. Releasing the hold is the Owner's (covered by
// the integration tests): this spec never creates an Owner (the staff sign-in spec must find none). Every visitor,
// address, account, note and name is synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { addLocalDays, localDateOf } from '@handyhub/domain/local-time'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { verifyCountyOf } from '../county.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.174' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OFFICE = 'e2e-confirmation-office@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'confirmation', 'passphrase', '64'].join(' ')
const ZONE = 'America/Kentucky/Louisville'
const CHECKS = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-confirmation' })
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
    headers: { 'idempotency-key': ['synthetic', 'e2e', 'confirmation', Date.now().toString(36)].join('-') },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-02' }],
      notSure: false,
      description: 'Synthetic confirmation project: a ceiling to look at.',
      property: {
        street: '174 Synthetic Confirmation Court',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['afternoons'] },
      estimatePreference: 'site_visit',
      contact: {
        fullName: 'Test Confirmation Customer',
        email: `confirmation-e2e-${Date.now().toString(36)}@example.test`,
        phone: '(502) 555-0174',
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
  return { requestId: row.id, projectId: row.project_id }
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
      .values({ email: OFFICE, display_name: 'E2E Confirmation Office', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: 'office', issued_by: 'e2e:confirmation', reason: null })
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
  await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
  const csrf = ((await (await page.request.get('/api/v1/staff/auth/session')).json()) as { csrfToken: string })
    .csrfToken
  let k = 0
  const send = (method: 'POST' | 'PUT', url: string, data: unknown, version: number) =>
    page.request.fetch(url, {
      method,
      data,
      headers: {
        'x-csrf-token': csrf,
        'idempotency-key': ['e2e', 'confirmation', Date.now().toString(36), String(++k)].join('-'),
        'if-match': `"${version}"`,
      },
    })
  return { page, send, close: () => context.close() }
}

test.describe('A blocking hold stops a visit from being confirmed (TSK-0064)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-SCH-06][HH-SCH-05][T40][RULE-SAFETY-GATES] an open review hold: "Not ready to confirm", no Confirm, refused on the server', async ({
    page,
    browser,
  }) => {
    const r = await sendRequest(page)
    const date = addLocalDays(localDateOf(new Date(), ZONE), 31)
    const office = await officeSession(browser)
    try {
      const p = office.page
      await p.goto(`/staff/requests/${r.requestId}`)
      const section = p.getByTestId('project-visits')
      await expect(section.getByRole('heading', { name: 'Visits' })).toBeVisible()
      const form = section.getByRole('form', { name: 'Plan a tentative visit' })
      await form.getByLabel('Date', { exact: false }).fill(date)
      await form.getByLabel('Arrival window starts', { exact: false }).fill('13:00')
      await form.getByLabel('Arrival window ends', { exact: false }).fill('14:00')
      await form.getByLabel('Expected work (minutes)').fill('60')
      await form.getByLabel('Travel buffer (minutes)').fill('30')
      await form.getByLabel('Workers needed').fill('1')
      await form.getByRole('button', { name: 'Plan tentative visit' }).click()
      const visit = section.getByTestId('visit')
      await expect(visit).toHaveCount(1)
      await expect(visit.getByRole('button', { name: 'Confirm with workers' })).toBeVisible()
      await expect(visit.getByTestId('visit-blockers')).toHaveCount(0)

      // Staff flag a potential hazard on the request: a review hold opens.
      const url = `/api/v1/staff/requests/${r.requestId}/qualification`
      expect((await office.send('PUT', url, { checks: CHECKS }, 0)).status()).toBe(200)
      const flagged = await office.send(
        'PUT',
        url,
        {
          checks: {
            ...CHECKS,
            risk_flags: { outcome: 'attention', note: 'Synthetic: a sagging ceiling.', hazards: ['structural'] },
          },
        },
        1,
      )
      expect(flagged.status(), await flagged.text()).toBe(200)

      await p.reload()
      const blocked = p.getByTestId('project-visits').getByTestId('visit')
      const blockers = blocked.getByTestId('visit-blockers')
      await expect(blockers).toContainText('Not ready to confirm')
      await expect(blockers).toContainText(
        'A review hold on this project is open or under review. No visit can be confirmed until the Owner resolves it.',
      )
      await expect(blocked.getByRole('button', { name: 'Confirm with workers' })).toHaveCount(0)
      await expect(blocked.getByText('Tentative: not a booking')).toBeVisible()
      await axe(p)

      // A confirmation sent anyway is refused on the server, naming the hold; nothing is reserved.
      const v = await withDb((db) =>
        db
          .selectFrom('work.visits')
          .select(['id', 'version'])
          .where('project_id', '=', r.projectId)
          .executeTakeFirstOrThrow(),
      )
      const worker = await withDb((db) =>
        db.selectFrom('identity.staff_users').select('id').where('email', '=', OFFICE).executeTakeFirstOrThrow(),
      )
      const refused = await office.send(
        'POST',
        `/api/v1/staff/visits/${v.id}/confirm`,
        { workerIds: [worker.id] },
        v.version,
      )
      expect(refused.status()).toBe(409)
      const codes = ((await refused.json()) as { error: { fieldErrors: { code: string }[] } }).error.fieldErrors.map(
        (f) => f.code,
      )
      expect(codes).toContain('REVIEW_HOLD_OPEN')
      const after = await withDb(async (db) => ({
        visit: await db.selectFrom('work.visits').select('state').where('id', '=', v.id).executeTakeFirstOrThrow(),
        reservations: await db.selectFrom('work.reservations').select('id').where('visit_id', '=', v.id).execute(),
      }))
      expect(after).toEqual({ visit: { state: 'tentative' }, reservations: [] })
    } finally {
      await office.close()
    }
  })
})
