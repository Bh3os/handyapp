// The customer portal's workspace frame in a real browser (TSK-0038; HH-PORT-02, HH-PORT-03, HH-PORT-06, HH-ARC-10,
// HH-PORT-01, T19, T23, T71). A guest opens the project with the secure link and a code (TSK-0034); Office staff change
// the shared record through the staff API in a second browser; the customer's Overview follows on its own refresh. The
// link token and codes are derived from the database with the e2e servers' synthetic code key (codes.ts); every
// visitor, address and account is synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'
import { passSecondFactor } from '../mfa.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
// This spec's own synthetic client address (RFC 5737): the request form allows 5 per network an hour.
const HEADERS = { 'x-forwarded-for': '198.51.100.38' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OFFICE = 'e2e-portal-office@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'portal', 'passphrase', '38'].join(' ')

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1 })
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

let n = 0
/** A request sent through the API (the wizard has its own specs): its reference, request ID and link. */
async function sendRequest(request: APIRequestContext, email: string) {
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `synthetic-e2e-portal-${Date.now()}-${++n}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic portal project: a dented hallway wall.',
      property: { street: '38 Synthetic Lane', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
      estimatePreference: 'let_handyhub_decide',
      contact: { fullName: 'Test Customer', email, phone: '(502) 555-0138', preferredChannel: 'email' },
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
      .select(['g.id', 'g.nonce', 'r.id as request_id'])
      .where('r.reference', '=', reference)
      .executeTakeFirstOrThrow(),
  )
  return { reference, requestId: row.request_id, grantId: row.id, token: accessTokenFor(row) }
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
  // From here the page's own timers are under the test's control, so a 30-second refresh takes no real time.
  await page.clock.install()
  await page.getByRole('link', { name: 'Go to your project page' }).click()
  await expect(page.getByRole('heading', { level: 1, name: `Project ${link.reference}` })).toBeVisible()
}

/** Office staff, signed in through the staff app in a browser of its own; staff writes go through the staff API. */
async function staffSession(browser: Browser) {
  const staffAccess = (...args: string[]) =>
    new URL(
      execFileSync(process.execPath, [cli, ...args], {
        env: { ...process.env, HANDYHUB_ENV: 'ci', DATABASE_URL: databaseUrl, PORT: port, HOST: '127.0.0.1' },
        encoding: 'utf8',
        stdio: 'pipe',
      }).split('\n')[0] as string,
    ).pathname
  // An Office account of this spec's own, added straight to the database: the first Owner is created by the staff
  // sign-in spec (staff-auth), which must find no Owner yet whatever order the specs run in.
  await withDb(async (db) => {
    const existing = await db
      .selectFrom('identity.staff_users')
      .select('id')
      .where('email', '=', OFFICE)
      .executeTakeFirst()
    if (existing) return
    const user = await db
      .insertInto('identity.staff_users')
      .values({ email: OFFICE, display_name: 'E2E Portal Office', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: 'office', issued_by: 'e2e:portal', reason: null })
      .execute()
  })
  const link = staffAccess('password-link', OFFICE)
  const context = await browser.newContext({ extraHTTPHeaders: HEADERS })
  const page = await context.newPage()
  await page.goto(link)
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
  const csrf = ((await (await page.request.get('/api/v1/staff/auth/session')).json()) as { csrfToken: string })
    .csrfToken
  let k = 0
  const act = async (requestId: string, name: string, data: Record<string, unknown>) => {
    const detail = (await (await page.request.get(`/api/v1/staff/requests/${requestId}`)).json()) as {
      version: number
    }
    const res = await page.request.post(`/api/v1/staff/requests/${requestId}/actions/${name}`, {
      data,
      headers: {
        'x-csrf-token': csrf,
        'idempotency-key': `e2e-portal-${name}-${Date.now()}-${++k}`,
        'if-match': `"${detail.version}"`,
      },
    })
    expect(res.status(), await res.text()).toBe(200)
  }
  return { act, close: () => context.close() }
}

test.describe('the customer project workspace frame (TSK-0038)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[T23][HH-PORT-02][HH-PORT-03][HH-ARC-10] the next action changes when staff change the shared record', async ({
    page,
    request,
    browser,
  }) => {
    const link = await sendRequest(request, 'portal-e2e@example.test')
    await openProject(page, link)
    const status = page.getByRole('region', { name: 'Status' })
    await expect(status.getByText('Request received', { exact: true })).toBeVisible()
    await expect(status.getByText('Waiting on HandyHub')).toBeVisible()
    await expect(status.getByText('HandyHub will review the details.')).toBeVisible()
    await expect(page.getByText('Services: Patching & Repair')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Appointment' }).getByText('No upcoming appointment')).toBeVisible()
    await expect(page.getByRole('region', { name: 'Payments' }).getByText('Nothing to pay yet')).toBeVisible()
    await expect(page.getByText(/^Updated /)).toBeVisible()
    await axe(page)

    const owner = await staffSession(browser)
    try {
      // Staff ask a question: the customer's page picks it up on its own refresh (portal.refresh, 30 seconds).
      await owner.act(link.requestId, 'ask-question', { internalNote: 'Synthetic e2e staff-only note 38.' })
      await expect(status.getByText('Waiting on HandyHub')).toBeVisible()
      await page.clock.fastForward(31_000)
      await expect(status.getByText('More information needed')).toBeVisible()
      await expect(status.getByText('Waiting on you')).toBeVisible()
      await expect(status.getByText('Answer the listed questions.')).toBeVisible()
      // Reply exists, inactive with its reason until the reply screen arrives (TSK-0051): never a fake action.
      await expect(status.getByRole('button', { name: 'Reply' })).toBeDisabled()
      await expect(status.getByText("This isn't available here yet.")).toBeVisible()
      await expect(
        page.getByRole('region', { name: 'Latest update' }).getByText('More information needed'),
      ).toBeVisible()

      // Not a Fit: the decision and reason in the owner's wording after the customer's own Refresh.
      await owner.act(link.requestId, 'not-a-fit', {
        category: 'other',
        customerReason: 'this synthetic project needs a specialist assessment.',
        internalNote: 'Synthetic e2e risk note 38.',
      })
      await page.getByRole('button', { name: 'Refresh', exact: true }).click()
      const message =
        "Thank you for considering HandyHub. We're unable to take on this project because this synthetic project needs a specialist assessment."
      await expect(status.getByText(message)).toBeVisible()
      await expect(status.getByText('Nothing is needed from you')).toBeVisible()
      await expect(status.getByRole('button')).toHaveCount(0)
      const timeline = page.getByRole('region', { name: 'Timeline' })
      await expect(timeline.getByRole('listitem')).toHaveCount(3)
      await expect(page.locator('main')).not.toContainText('Synthetic e2e')
      await axe(page)
    } finally {
      await owner.close()
    }

    // The projects list shows the one project of this session with its status.
    await page.getByRole('link', { name: 'All projects' }).click()
    const item = page.getByRole('listitem', { name: `Project ${link.reference}` })
    await expect(item.getByText('Not a fit')).toBeVisible()
    await expect(page.getByRole('listitem')).toHaveCount(1)
    await axe(page)
  })

  test('[HH-PORT-06][T71][HH-ARC-10] a failed fetch shows the failure state, never stale data as current', async ({
    page,
    request,
  }) => {
    const link = await sendRequest(request, 'portal-failure-e2e@example.test')
    await openProject(page, link)
    const status = page.getByRole('region', { name: 'Status' })
    await expect(status.getByText('Request received', { exact: true })).toBeVisible()
    const updated = await page.getByText(/^Updated /).textContent()

    // The network fails: the refresh keeps what was shown, marked stale with the time it is from.
    await page.route('**/api/v1/customer/projects/*/overview', (route) => route.abort('failed'))
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(page.getByText("This page couldn't be updated")).toBeVisible()
    await expect(page.getByText(/What you see is from .* and may be out of date\./)).toBeVisible()
    await expect(page.getByText(/^Updated /)).toHaveCount(0)
    for (const name of ['Status', 'Appointment', 'Payments', 'Timeline'])
      await expect(page.getByRole('region', { name })).toHaveAttribute('data-stale', 'true')
    // Polling keeps failing quietly in the same state; it never flips back to "current".
    await page.clock.fastForward(31_000)
    await expect(page.getByText("This page couldn't be updated")).toBeVisible()
    await axe(page)

    // The network is back: one Try again and the page is current again.
    await page.unroute('**/api/v1/customer/projects/*/overview')
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByText(/^Updated /)).toBeVisible()
    await expect(status).not.toHaveAttribute('data-stale', 'true')
    expect(updated).toMatch(/^Updated /)

    // A failed first read: the failure state with Try again and no project data at all.
    await page.route('**/api/v1/customer/projects/*/overview', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":{"code":"UNAVAILABLE"}}' }),
    )
    await page.reload()
    await expect(page.getByRole('alert')).toContainText("Your project couldn't be loaded")
    await expect(page.getByRole('region', { name: 'Status' })).toHaveCount(0)
    await expect(page.locator('main')).not.toContainText('Request received')
    await page.unroute('**/api/v1/customer/projects/*/overview')
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(status.getByText('Request received', { exact: true })).toBeVisible()
  })

  test('[HH-PORT-06][T19][HH-PORT-01] no session, another project and a phone: truthful states only', async ({
    browser,
    request,
  }) => {
    const a = await sendRequest(request, 'portal-scope-a-e2e@example.test')
    const b = await sendRequest(request, 'portal-scope-b-e2e@example.test')
    // Without a session: the ended-session state, with the way back through the secure link.
    const guest = await browser.newContext({ extraHTTPHeaders: HEADERS })
    const anon = await guest.newPage()
    await anon.goto(`/portal/p/${a.reference}`)
    await expect(anon.getByText('Your secure session has ended')).toBeVisible()
    await expect(anon.getByRole('link', { name: 'Open your project' })).toHaveAttribute('href', '/access')
    await expect(anon.locator('main')).not.toContainText('Synthetic Lane')
    await guest.close()

    // A's session on a phone: its own project works; B's reference is one neutral state.
    const phone = await browser.newContext({ extraHTTPHeaders: HEADERS, viewport: { width: 375, height: 740 } })
    const page = await phone.newPage()
    try {
      await openProject(page, a)
      await expect(page.getByRole('region', { name: 'Status' }).getByText('Waiting on HandyHub')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await axe(page)
      await page.goto(`/portal/p/${b.reference}`)
      await expect(page.getByText("This project isn't available")).toBeVisible()
      await expect(page.locator('main')).not.toContainText('Patching & Repair')
      await axe(page)
    } finally {
      await phone.close()
    }
  })
})
