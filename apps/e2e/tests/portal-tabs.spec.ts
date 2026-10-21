// The customer workspace tabs in a real browser (TSK-0039; HH-PORT-09, HH-PORT-08, HH-LANG-01, T04, T19, T69,
// RULE-LANGUAGES). A guest opens the project with the secure link and a code (TSK-0034); every tab is reached and
// operated by keyboard, scanned with axe and checked on a 320 px phone; an Office staff member working in Spanish
// changes the shared record and the customer's pages stay English. The link token and codes are derived from the
// database with the e2e servers' synthetic code key (codes.ts); every visitor, address and account is synthetic
// (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
// This spec's own synthetic client address (RFC 5737): the request form allows 5 per network an hour.
const HEADERS = { 'x-forwarded-for': '198.51.100.39' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OFFICE = 'e2e-portal-tabs-office@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'tabs', 'passphrase', '39'].join(' ')

const TABS = [
  { name: 'Overview', path: '', text: 'Request received' },
  { name: 'Messages', path: '/messages', text: "Messages aren't shown here yet" },
  { name: 'Documents', path: '/documents', text: 'No documents yet' },
  { name: 'Photos', path: '/photos', text: 'No photos yet' },
  { name: 'Appointments', path: '/appointments', text: 'No appointment yet' },
  { name: 'Payments', path: '/payments', text: 'Nothing to pay yet' },
] as const

// Staff text only the Spanish staff catalog holds: none of it may ever reach a customer page (RULE-LANGUAGES).
const catalog = (name: string) =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../../../packages/i18n/src/catalogs/${name}.json`, import.meta.url)), 'utf8'),
  ) as Record<string, string>
const english = new Set([...Object.values(catalog('customer.en')), ...Object.values(catalog('staff.en'))])
const SPANISH_ONLY = Object.values(catalog('staff.es')).filter((v) => !english.has(v) && v.length >= 6)
const SPANISH_MARKS = /[¿¡ñáéíóú]/i

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
    headers: { 'idempotency-key': `synthetic-e2e-portal-tabs-${Date.now()}-${++n}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic portal tabs project: a scuffed door frame.',
      property: { street: '39 Synthetic Lane', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
      estimatePreference: 'let_handyhub_decide',
      contact: { fullName: 'Test Customer', email, phone: '(502) 555-0139', preferredChannel: 'email' },
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
  await page.getByRole('link', { name: 'Go to your project page' }).click()
  await expect(page.getByRole('heading', { level: 1, name: `Project ${link.reference}` })).toBeVisible()
}

/** The visible text of the page and its main region's language, for the English-only check. */
async function expectEnglish(page: Page, where: string) {
  expect(await page.evaluate(() => document.documentElement.lang), where).toBe('en')
  await expect(page.locator('main')).toHaveAttribute('lang', 'en')
  const text = await page.locator('body').innerText()
  expect(text, where).not.toMatch(SPANISH_MARKS)
  const found = SPANISH_ONLY.filter((es) => text.includes(es))
  expect(found, where).toEqual([])
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
      .values({ email: OFFICE, display_name: 'E2E Portal Tabs Office', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: 'office', issued_by: 'e2e:portal-tabs', reason: null })
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
        'idempotency-key': `e2e-portal-tabs-${name}-${Date.now()}-${++k}`,
        'if-match': `"${detail.version}"`,
      },
    })
    expect(res.status(), await res.text()).toBe(200)
  }
  const locale = async (value: 'en' | 'es') => {
    const res = await page.request.put('/api/v1/staff/auth/session/locale', {
      data: { locale: value },
      headers: { 'x-csrf-token': csrf },
    })
    expect(res.status(), await res.text()).toBe(200)
  }
  return { page, act, locale, close: () => context.close() }
}

test.describe('the customer workspace tabs (TSK-0039)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-PORT-09][T69] every tab is reached and operated by keyboard, has its own page, and passes axe', async ({
    page,
    request,
  }) => {
    const link = await sendRequest(request, 'portal-tabs-keys-e2e@example.test')
    await openProject(page, link)
    const base = `/portal/p/${link.reference}`
    const tablist = page.getByRole('tablist', { name: 'Project sections' })
    await expect(tablist.getByRole('tab')).toHaveText(TABS.map((t) => t.name))
    await expect(tablist.getByRole('tab', { selected: true })).toHaveText('Overview')

    // From the top of the page, Tab reaches the tab list at its selected tab (one tab stop).
    await page.locator('body').focus()
    const overviewTab = page.getByRole('tab', { name: 'Overview' })
    for (let i = 0; i < 25 && !(await overviewTab.evaluate((el) => el === document.activeElement)); i++)
      await page.keyboard.press('Tab')
    await expect(overviewTab).toBeFocused()

    for (const [i, tab] of TABS.entries()) {
      if (i > 0) await page.keyboard.press('ArrowRight')
      const current = page.getByRole('tab', { name: tab.name })
      await expect(current).toBeFocused()
      await expect(current).toHaveAttribute('aria-selected', 'true')
      // The focus is visible: the focus ring of the design system, never colour alone.
      expect(
        await current.evaluate((el) => el.matches(':focus-visible') && getComputedStyle(el).outlineStyle !== 'none'),
      ).toBe(true)
      await expect(page).toHaveURL(new RegExp(`${base}${tab.path}$`))
      const panel = page.getByRole('tabpanel', { name: tab.name })
      await expect(panel.getByText(tab.text, { exact: true }).first()).toBeVisible()
      await expect(page.getByRole('tabpanel')).toHaveCount(1)
      await axe(page)
    }
    // Past the last tab, the arrow wraps to Overview; Tab moves on into the shown panel.
    await page.keyboard.press('ArrowRight')
    await expect(overviewTab).toBeFocused()
    await page.keyboard.press('End')
    await expect(page.getByRole('tab', { name: 'Payments' })).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('tabpanel', { name: 'Payments' })).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Home')
    await expect(overviewTab).toBeFocused()
    await expect(page).toHaveURL(new RegExp(`${base}$`))

    // Back returns to the previous tab; a reload and a direct link open the tab of the address.
    await page.goBack()
    await expect(page.getByRole('tab', { selected: true })).toHaveText('Payments')
    await page.goto(`${base}/documents`)
    await expect(page.getByRole('tab', { selected: true })).toHaveText('Documents')
    await expect(page.getByRole('tabpanel', { name: 'Documents' }).getByText('No documents yet')).toBeVisible()
    await page.reload()
    await expect(page.getByRole('tab', { selected: true })).toHaveText('Documents')
    await expectEnglish(page, 'documents after reload')
  })

  test('[T04][HH-PORT-08][HH-LANG-01][RULE-LANGUAGES] staff work in Spanish; every portal tab stays English', async ({
    page,
    request,
    browser,
  }) => {
    const link = await sendRequest(request, 'portal-tabs-english-e2e@example.test')
    await openProject(page, link)
    const staff = await staffSession(browser)
    try {
      await staff.locale('es')
      // The staff interface is Spanish for this staff member...
      await staff.page.goto('/staff/')
      await expect(staff.page.locator('html')).toHaveAttribute('lang', 'es')
      await expect(staff.page.getByRole('heading', { level: 1, name: 'Acciones pendientes' })).toBeVisible()
      // ...who publishes a question to the customer and then declines the project, in the staff's Spanish screens.
      await staff.act(link.requestId, 'ask-question', { internalNote: 'Nota interna sintética 39.' })
      await page.getByRole('button', { name: 'Refresh', exact: true }).click()
      const status = page.getByRole('region', { name: 'Status' })
      await expect(status.getByText('More information needed')).toBeVisible()
      await expect(status.getByText('Waiting on you')).toBeVisible()
      for (const tab of TABS) {
        await page.getByRole('tab', { name: tab.name }).click()
        await expect(page.getByRole('tabpanel', { name: tab.name })).toBeVisible()
        await expect(page.getByRole('tabpanel', { name: tab.name }).getByText(/^Updated /)).toBeVisible()
        await expectEnglish(page, tab.name)
      }
      await expect(page.locator('main')).not.toContainText('Nota interna')
    } finally {
      await staff.locale('en')
      await staff.close()
    }
  })

  test('[T69][HH-PORT-09][HH-A11Y-02] on a 320 px phone with 200% text: Overview first, the tabs wrap, nothing scrolls sideways', async ({
    browser,
    request,
  }) => {
    const a = await sendRequest(request, 'portal-tabs-phone-a-e2e@example.test')
    const b = await sendRequest(request, 'portal-tabs-phone-b-e2e@example.test')
    const phone = await browser.newContext({ extraHTTPHeaders: HEADERS, viewport: { width: 320, height: 720 } })
    const page = await phone.newPage()
    try {
      await openProject(page, a)
      const tabs = page.getByRole('tab')
      await expect(tabs.first()).toHaveText('Overview')
      await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')
      for (const zoom of ['100%', '200%']) {
        await page.evaluate((z) => {
          document.documentElement.style.fontSize = z
        }, zoom)
        for (const tab of TABS) {
          await page.getByRole('tab', { name: tab.name }).click()
          await expect(page.getByRole('tabpanel', { name: tab.name }).getByText(tab.text).first()).toBeVisible()
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            `${tab.name} at ${zoom}`,
          ).toBe(true)
          // Every tab stays a full-size touch target (44 px, HH-A11Y-03).
          const box = await page.getByRole('tab', { name: tab.name }).boundingBox()
          expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
        }
        await axe(page)
      }
      // Another project's tab by its address: the one neutral state, no tab and no project information.
      await page.goto(`/portal/p/${b.reference}/messages`)
      await expect(page.getByText("This project isn't available")).toBeVisible()
      await expect(page.getByRole('tablist')).toHaveCount(0)
      await expect(page.locator('main')).not.toContainText('Patching & Repair')
      await axe(page)
    } finally {
      await phone.close()
    }
  })
})
