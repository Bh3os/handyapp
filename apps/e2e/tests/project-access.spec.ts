// The project access link and its landing in a real browser (TSK-0034; HH-ID-04, HH-ID-05, HH-ID-08, HH-INT-21,
// HH-ID-03, T01, T17, T19, T20). The link token and the codes a test enters are derived from the database with the e2e
// servers' synthetic code key (codes.ts); every visitor, address and number is synthetic (RULE-SYNTHETIC-DATA).
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
// This spec's own synthetic client address (RFC 5737): the request form allows 5 per network an hour.
const HEADERS = { 'x-forwarded-for': '198.51.100.35' }
test.use({ extraHTTPHeaders: HEADERS })

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
/** A request sent through the API (the wizard has its own specs); returns its reference and its link token. */
async function sendRequest(request: APIRequestContext, email: string) {
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `synthetic-e2e-access-${Date.now()}-${++n}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [],
      notSure: true,
      description: 'Synthetic access project: a squeaky stair.',
      property: { street: '35 Synthetic Lane', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
      estimatePreference: 'let_handyhub_decide',
      contact: { fullName: 'Test Customer', email, phone: '(502) 555-0135', preferredChannel: 'email' },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.status()).toBe(201)
  const reference = ((await res.json()) as { reference: string }).reference
  const grant = await withDb((db) =>
    db
      .selectFrom('identity.project_access_grants as g')
      .innerJoin('intake.requests as r', 'r.id', 'g.request_id')
      .select(['g.id', 'g.nonce'])
      .where('r.reference', '=', reference)
      .executeTakeFirstOrThrow(),
  )
  return { reference, grantId: grant.id, token: accessTokenFor(grant), cap: res.headers()['receipt-capability'] }
}

/** The code last sent for a grant's channel, derived from the stored row. */
async function grantCode(grantId: string, channel: 'email' | 'phone'): Promise<string> {
  const row = await withDb((db) =>
    db
      .selectFrom('identity.verification_codes')
      .select(['id', 'nonce'])
      .where('subject_ref', '=', `grant:${grantId}:${channel}`)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirstOrThrow(),
  )
  return codeFor(row)
}

/** What opening a link could change: its verified time, its codes and its sessions. */
const footprint = (grantId: string) =>
  withDb(async (db) => ({
    grant: await db
      .selectFrom('identity.project_access_grants')
      .select(['last_verified_at', 'revoked_at'])
      .where('id', '=', grantId)
      .executeTakeFirstOrThrow(),
    codes: (
      await db
        .selectFrom('identity.verification_codes')
        .select('id')
        .where('subject_ref', 'like', `grant:${grantId}:%`)
        .execute()
    ).length,
    sessions: (await db.selectFrom('identity.customer_sessions').select('id').where('grant_id', '=', grantId).execute())
      .length,
  }))

/** Opens a link in the page and enters its email code: the project shows. */
async function openWithCode(page: Page, link: { token: string; grantId: string }) {
  await page.goto(`/access#${link.token}`)
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await expect(page.getByLabel('Code')).toBeFocused()
  await page.getByLabel('Code').fill(await grantCode(link.grantId, 'email'))
  await page.getByRole('button', { name: 'Open my project' }).click()
  await expect(page.getByRole('heading', { name: 'Your project', exact: true })).toBeVisible()
}

test.describe('the project access link (TSK-0034)', () => {
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[T17][HH-ID-05][HH-ID-08][HH-INT-21] a preview fetch consumes nothing; Open, then the code, opens the one project and the token leaves the URL', async ({
    page,
    request,
  }) => {
    const email = 'access-e2e@example.test'
    const link = await sendRequest(request, email)
    const before = await footprint(link.grantId)
    expect(before).toEqual({ grant: { last_verified_at: null, revoked_at: null }, codes: 0, sessions: 0 })

    // A link-preview fetch (the fragment never leaves the client): the same static page, nothing consumed.
    const preview = await request.get('/access', { headers: { 'user-agent': 'SyntheticLinkPreviewBot/1.0' } })
    expect(preview.status()).toBe(200)
    expect(preview.headers()['cache-control']).toBe('no-store')
    expect(preview.headers()['referrer-policy']).toBe('no-referrer')
    expect(await preview.text()).not.toContain(link.reference)
    expect(await footprint(link.grantId)).toEqual(before)

    const posts: string[] = []
    const urls: string[] = []
    page.on('request', (r) => {
      urls.push(r.url())
      if (r.method() !== 'GET') posts.push(new URL(r.url()).pathname)
    })
    await page.goto(`/access#${link.token}`)
    await expect(page.getByRole('heading', { name: 'Open your project' })).toBeFocused()
    // The token is gone from the address bar at once, and nothing private is on the page before the code.
    expect(new URL(page.url()).hash).toBe('')
    expect(new URL(page.url()).pathname).toBe('/access')
    await expect(page.locator('main')).not.toContainText(new RegExp(`${link.reference}|Synthetic Lane|squeaky`, 'i'))
    expect(posts).toEqual([])
    await axe(page)
    expect(await footprint(link.grantId)).toEqual(before)

    await page.getByRole('button', { name: 'Open', exact: true }).click()
    await expect(page.getByRole('heading', { name: "Confirm it's you" })).toBeFocused()
    await expect(page.getByText('a***@example.test')).toBeVisible()
    // Without the SMS opt-in the phone is not offered.
    await expect(page.getByRole('button', { name: 'Text me a code' })).toHaveCount(0)
    await expect(page.locator('main')).not.toContainText(link.reference)
    await axe(page)
    await page.getByRole('button', { name: 'Email me a code' }).click()
    await expect(page.getByText('We sent a code to a***@example.test. It expires in 10 minutes.')).toBeVisible()
    await expect(page.getByLabel('Code')).toBeFocused()
    const code = await grantCode(link.grantId, 'email')
    await page.getByLabel('Code').fill(String((Number(code) + 1) % 1_000_000).padStart(6, '0'))
    await page.getByRole('button', { name: 'Open my project' }).click()
    await expect(page.getByText("That code didn't work. Check it and try again, or ask for a new code.")).toBeVisible()
    await page.getByLabel('Code').fill(code)
    await page.getByRole('button', { name: 'Open my project' }).click()

    await expect(page.getByRole('heading', { name: 'Your project', exact: true })).toBeFocused()
    await expect(page.getByText(`Request reference: ${link.reference}`)).toBeVisible()
    await expect(page.getByText('Request received · HandyHub will review the details')).toBeVisible()
    await expect(page.getByText('Not sure what service I need')).toBeVisible()
    await axe(page)
    expect(posts).toEqual([
      '/api/v1/public/access/open',
      '/api/v1/public/access/codes',
      '/api/v1/public/access/exchange',
      '/api/v1/public/access/exchange',
    ])
    // No request ever carried the token in its URL (the fragment is never sent).
    expect(urls.filter((u) => u.includes(link.token))).toEqual([])
    // The session is an HttpOnly cookie for this one project; the page keeps no token.
    const cookies = await page.context().cookies()
    expect(cookies.find((c) => c.name === '__Host-hh_customer')).toMatchObject({ httpOnly: true, secure: true })
    expect(await page.evaluate(() => JSON.stringify(window.sessionStorage))).not.toContain(link.token)
    const after = await footprint(link.grantId)
    expect(after.grant.last_verified_at).not.toBeNull()
    expect(after.sessions).toBe(1)

    // A reload shows the project from the session, never from the URL.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Your project', exact: true })).toBeVisible()
    expect(new URL(page.url()).hash).toBe('')
  })

  test('[T19][HH-ID-04][HH-ID-03][T20] guest A’s session never reaches project B, even with the same email', async ({
    browser,
    request,
  }) => {
    const email = 'access-same-e2e@example.test'
    const a = await sendRequest(request, email)
    const b = await sendRequest(request, email)
    const context = await browser.newContext({ extraHTTPHeaders: HEADERS })
    const page = await context.newPage()
    try {
      await openWithCode(page, a)
      await expect(page.getByText(`Request reference: ${a.reference}`)).toBeVisible()
      await expect(page.locator('main')).not.toContainText(b.reference)
      // Direct API calls from A's browser (its session cookie; altered references), not only the page.
      const api = (url: string) =>
        page.evaluate(async (u) => {
          const r = await fetch(u, { headers: { accept: 'application/json' } })
          return { status: r.status, body: (await r.json()) as { error?: { code?: string } } }
        }, url)
      expect((await api(`/api/v1/customer/projects/${a.reference}`)).status).toBe(200)
      for (const url of [`/api/v1/customer/projects/${b.reference}`, '/api/v1/customer/projects/HH-00000000']) {
        const res = await api(url)
        expect([res.status, res.body.error?.code], url).toEqual([404, 'NOT_FOUND'])
      }
      expect((await api('/api/v1/customer/access/session')).body).toEqual({ projects: [{ reference: a.reference }] })
      // B's link is untouched by A's exchange.
      expect(await footprint(b.grantId)).toEqual({
        grant: { last_verified_at: null, revoked_at: null },
        codes: 0,
        sessions: 0,
      })
    } finally {
      await context.close()
    }
  })

  test('[HH-ID-04][HH-ID-05] a link that opens nothing gets one neutral page with no project information', async ({
    page,
  }) => {
    const unknown = ['Synthetic', 'unknown', 'access', 'link', '0123456789abcdef'].join('_').slice(0, 43)
    await page.goto(`/access#${unknown}`)
    await page.getByRole('button', { name: 'Open', exact: true }).click()
    await expect(page.getByRole('heading', { name: "This link can't be opened" })).toBeFocused()
    await expect(
      page.getByText('It may have expired or been replaced. No project information is shown here.'),
    ).toBeVisible()
    await axe(page)
    // Without a link or a session the page says how to open a project.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Open your project with your secure link' })).toBeVisible()
  })

  test('[HH-INT-21][HH-ID-05] View My Request appears on the receipt once a code entered there opened the project', async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: HEADERS })
    const page = await context.newPage()
    try {
      const email = 'access-receipt-e2e@example.test'
      await page.goto('/request')
      await page.evaluate(() => window.localStorage.clear())
      await page.goto('/request')
      await page.getByRole('button', { name: 'Continue as Guest' }).click()
      await page.getByLabel('Not sure what service I need').check()
      await page.getByRole('button', { name: 'Next' }).click()
      await page.getByLabel('Project description').fill('Synthetic receipt access project: a sticking window.')
      await page.getByRole('button', { name: 'Next' }).click()
      await page.getByLabel('Street address').fill('36 Synthetic Lane')
      await page.getByLabel('City').fill('Testville')
      await page.getByLabel('State').fill('KY')
      await page.getByLabel('ZIP').fill('40000')
      await page.getByLabel('House', { exact: true }).check()
      await page.getByLabel('Preferred date').fill(future)
      await page.getByLabel('Mornings').check()
      await page.getByRole('button', { name: 'Next' }).click()
      await page.getByLabel('Full name').fill('Test Customer')
      await page.getByRole('textbox', { name: /^Email/ }).fill(email)
      await page.getByRole('textbox', { name: /^Phone/ }).fill('(502) 555-0136')
      await page.getByLabel('Phone call', { exact: true }).check()
      await page.getByLabel('Let HandyHub decide').check()
      await page.getByRole('button', { name: 'Next' }).click()
      await page.getByRole('button', { name: 'Send Estimate Request' }).click()
      await expect(page.getByRole('heading', { name: 'Your request is in.' })).toBeFocused()
      const reference = new URL(page.url()).pathname.replace('/request/received/', '')
      // No View My Request before it works.
      await expect(page.getByRole('link', { name: 'View My Request' })).toHaveCount(0)

      const emailRow = page.getByRole('region', { name: 'Verify your contact details' }).getByRole('group', {
        name: 'Email',
      })
      await emailRow.getByRole('button', { name: 'Email me a code' }).click()
      // The code row exists once the server answered the send.
      await expect(emailRow.getByLabel('Code')).toBeFocused()
      const contactCode = await withDb(async (db) => {
        const r = await db
          .selectFrom('intake.requests')
          .select('contact_id')
          .where('reference', '=', reference)
          .executeTakeFirstOrThrow()
        return db
          .selectFrom('identity.verification_codes')
          .select(['id', 'nonce'])
          .where('subject_ref', '=', `contact:${r.contact_id}:email`)
          .orderBy('created_at', 'desc')
          .limit(1)
          .executeTakeFirstOrThrow()
      })
      await emailRow.getByLabel('Code').fill(codeFor(contactCode))
      await emailRow.getByRole('button', { name: 'Verify' }).click()
      await expect(emailRow.getByText('Your email is verified.')).toBeVisible()
      const view = page.getByRole('link', { name: 'View My Request' })
      await expect(view).toBeVisible()
      await axe(page)
      await view.click()
      await expect(page.getByRole('heading', { name: 'Your project', exact: true })).toBeVisible()
      await expect(page.getByText(`Request reference: ${reference}`)).toBeVisible()
      // Back on the receipt (a reload), the session still opens this project, so View My Request stays.
      await page.goBack()
      await expect(page.getByRole('link', { name: 'View My Request' })).toBeVisible()
    } finally {
      await context.close()
    }
  })
})
