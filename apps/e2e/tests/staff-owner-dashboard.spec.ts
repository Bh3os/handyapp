// The Owner Dashboard, its drill-down lists, its CSV and the accountant's files in a real browser (TSK-0096;
// HH-FIN-18, HH-FIN-16, HH-DATA-10, S11, T64, T73, OWN-DEC-125, RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS).
// This spec sends one service request and records one Square payout of its own; the Owner opens the dashboard for the
// days around today, finds both in the figures' supporting records, exports the dashboard (its values equal the
// screen's API answer) and the accountant's payout file (it holds this spec's payout). The page is scanned with axe.
// Every visitor, account, name, reference and amount is synthetic (RULE-SYNTHETIC-DATA). The e2e database is shared
// by every spec, so assertions read this spec's own records, never global totals.
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createDb } from '@handyhub/db'
import { parseCsv } from '@handyhub/domain'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { passSecondFactor } from '../mfa.js'
import { expectAccessible } from '../a11y.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.196' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
// The Owner every spec shares (staff-auth.spec.ts creates it; whichever spec runs first does here).
const OWNER = 'e2e-owner@example.test'
const pw = ['synthetic', 'staff', 'owner', 'dashboard', 'passphrase', '96'].join(' ')

async function axe(page: Page) {
  await expectAccessible(page)
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-owner-dashboard' })
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

/** The shared Owner, signed in through the staff app in its own browser. */
async function ownerSession(browser: Browser) {
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
      .where('email', '=', OWNER)
      .executeTakeFirst()
    if (existing) return
    const user = await db
      .insertInto('identity.staff_users')
      .values({ email: OWNER, display_name: 'E2E Owner', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: 'owner', issued_by: 'e2e:owner-dashboard', reason: null })
      .execute()
  })
  const context = await browser.newContext({ extraHTTPHeaders: HEADERS, acceptDownloads: true })
  const page = await context.newPage()
  await page.goto(staffAccess('password-link', OWNER))
  await page.getByLabel('New password').fill(pw)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(OWNER)
  await page.getByLabel('Password', { exact: true }).fill(pw)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await passSecondFactor(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
  const csrf = ((await (await page.request.get('/api/v1/staff/auth/session')).json()) as { csrfToken: string })
    .csrfToken
  return { page, csrf, close: () => context.close() }
}

const ZONE = 'America/Kentucky/Louisville'
const businessDate = (offsetDays: number) => {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE }).format(new Date()).slice(0, 10)
  const x = new Date(`${d}T12:00:00Z`)
  x.setUTCDate(x.getUTCDate() + offsetDays)
  return x.toISOString().slice(0, 10)
}

test.describe('The Owner Dashboard (TSK-0096)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-FIN-18][HH-FIN-16][T73][T64] figures open their records; the CSV equals the dashboard; the accountant file', async ({
    request,
    browser,
  }) => {
    const stamp = Date.now()
    const sent = await request.post('/api/v1/public/requests', {
      headers: { 'idempotency-key': `synthetic-e2e-dashboard-${stamp}` },
      data: {
        formVersion: 'e2e-1',
        privacyNoticeVersion: 'privacy-notice-1',
        services: [{ serviceId: 'SVC-PT-01' }],
        notSure: false,
        description: 'Synthetic dashboard project: repaint a hallway.',
        property: {
          street: '196 Synthetic Dashboard Court',
          city: 'Testville',
          state: 'KY',
          zip: '40000',
          propertyType: 'house',
        },
        timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
        estimatePreference: 'online',
        contact: {
          fullName: 'Test Dashboard Customer',
          email: `dashboard-e2e-${stamp}@example.test`,
          phone: '(502) 555-0196',
          preferredChannel: 'email',
        },
        smsOptIn: false,
        marketingOptIn: false,
      },
    })
    expect(sent.status()).toBe(201)
    const reference = ((await sent.json()) as { reference: string }).reference

    const owner = await ownerSession(browser)
    const o = owner.page
    try {
      // This spec's own Square payout, recorded by hand.
      const payoutRef = `SYNTH-E2E-PAYOUT-${stamp}`
      const payout = await o.request.post('/api/v1/staff/payouts', {
        data: { reference: payoutRef, amountCents: 12_345, paidOutOn: businessDate(0) },
        headers: { 'x-csrf-token': owner.csrf, 'idempotency-key': `e2e-dashboard-payout-${stamp}` },
      })
      expect(payout.status(), await payout.text()).toBe(201)

      await o.goto('/staff/dashboard')
      const dash = o.getByTestId('owner-dashboard')
      await expect(dash.getByRole('heading', { level: 1, name: 'Owner Dashboard' })).toBeVisible()
      // The days around today in the business zone, so a run across midnight still holds this spec's records.
      const from = businessDate(-1)
      const to = businessDate(1)
      await dash.getByLabel('From', { exact: true }).fill(from)
      await dash.getByLabel('To', { exact: true }).fill(to)
      await dash.getByRole('button', { name: 'Show', exact: true }).click()
      await expect(dash.getByText(`From ${from} to ${to} (3 days)`, { exact: false })).toBeVisible()
      await expect(dash.getByText(/Last updated/)).toBeVisible()
      await expect(dash.getByText(/Invoiced amounts are not money received/)).toBeVisible()
      await expect(dash.getByTestId('dashboard-accounting')).toContainText('Not configured')
      await expect(dash.locator('[data-figure="payments.write_offs"]')).toContainText('Not configured')
      await expect(dash.locator('[data-figure="payments.write_offs"]')).not.toContainText('$0.00')
      await axe(o)

      // A figure opens its supporting records: this spec's request and payout are among them.
      const requests = dash.locator('[data-figure="response.received"]')
      await requests.getByRole('button', { name: 'Show records' }).click()
      await expect(requests.getByRole('table')).toContainText(reference)
      const payouts = dash.locator('[data-figure="payments.payouts"]')
      await expect(payouts).toContainText('Basis: Payouts (settlement)')
      await payouts.getByRole('button', { name: 'Show records' }).click()
      await expect(payouts.getByRole('table')).toContainText(payoutRef)
      await expect(payouts.getByRole('table')).toContainText('$123.45')
      await axe(o)

      // The dashboard's CSV: the same values the dashboard answers for this period (sign-in is recent).
      const view = (await (await o.request.get(`/api/v1/staff/dashboard?from=${from}&to=${to}`)).json()) as {
        figures: { id: string; detail: unknown; current: { state: string; value: number | null } }[]
      }
      const exportForm = dash.getByRole('region', { name: 'Export the dashboard (CSV)' })
      const csvDownload = o.waitForEvent('download')
      await exportForm.getByRole('button', { name: 'Export CSV' }).click()
      const csvFile = await csvDownload
      expect(csvFile.suggestedFilename()).toBe(`owner-dashboard-${from}-to-${to}.csv`)
      const [header, ...rows] = parseCsv(await readFile(await csvFile.path(), 'utf8'))
      const col = (n: string) => (header as string[]).indexOf(n)
      const csvOf = (id: string) => rows.find((r) => r[col('figure')] === id)
      for (const id of ['payments.payouts', 'payments.invoiced', 'payments.received', 'response.received']) {
        const f = view.figures.find((x) => x.id === id)
        expect(csvOf(id)?.[col('state')], id).toBe(f?.current.state)
        expect(csvOf(id)?.[col('value')], id).toBe(f?.current.value === null ? '' : String(f?.current.value))
      }
      await expect(exportForm.getByRole('status')).toContainText('Exported')

      // The accountant's payout file holds this spec's payout, in exact dollars; a reason is required.
      const files = dash.getByRole('region', { name: 'Files for the accountant' })
      await files.getByRole('button', { name: 'Export file' }).click()
      await expect(files.getByRole('alert')).toHaveText('Enter the reason for the export.')
      await files.getByLabel('File', { exact: true }).selectOption('payouts')
      await files.getByLabel('Reason').fill('Synthetic: e2e month-end file')
      const fileDownload = o.waitForEvent('download')
      await files.getByRole('button', { name: 'Export file' }).click()
      const payoutFile = await fileDownload
      expect(payoutFile.suggestedFilename()).toBe(`payouts-${from}-to-${to}.csv`)
      const payoutRows = parseCsv(await readFile(await payoutFile.path(), 'utf8'))
      const ph = payoutRows[0] as string[]
      const mine = payoutRows.find((r) => r[ph.indexOf('reference')] === payoutRef)
      expect(mine?.[ph.indexOf('amount_usd')]).toBe('123.45')
      await axe(o)
    } finally {
      await owner.close()
    }
  })
})
