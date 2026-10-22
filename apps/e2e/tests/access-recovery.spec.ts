// Expired or revoked access fails safely with a neutral recovery page, in a real browser (TSK-0035; HH-ID-09, HH-ID-06,
// HH-ID-08, HH-ID-03, T18). The link token and the codes a test enters are derived from the database with the e2e
// servers' synthetic code key (codes.ts); every visitor, address and number is synthetic (RULE-SYNTHETIC-DATA).
// TSK-0120: the access message is the owner's secure_access_link with its values wired, so asking for a new link is
// accepted with the same neutral answer for every contact alike; a new link goes only to a known contact.
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
// This spec's own synthetic client address (RFC 5737), so its limits never meet another spec's.
const HEADERS = { 'x-forwarded-for': '198.51.100.36' }
test.use({ extraHTTPHeaders: HEADERS })

const DONE =
  'Thanks. If these details match a HandyHub request, a new secure link is on its way to the contact details on that request. It opens your project only after a one-time code.'

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
async function sendRequest(request: APIRequestContext, email: string) {
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `synthetic-e2e-recovery-${Date.now()}-${++n}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [],
      notSure: true,
      description: 'Synthetic recovery project: a rattling door.',
      property: { street: '37 Synthetic Lane', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
      estimatePreference: 'let_handyhub_decide',
      contact: { fullName: 'Test Customer', email, phone: '(502) 555-0137', preferredChannel: 'email' },
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
      .select(['g.id', 'g.nonce', 'g.project_id'])
      .where('r.reference', '=', reference)
      .executeTakeFirstOrThrow(),
  )
  return { reference, grantId: grant.id, projectId: grant.project_id, token: accessTokenFor(grant) }
}

const grantCode = async (grantId: string) =>
  codeFor(
    await withDb((db) =>
      db
        .selectFrom('identity.verification_codes')
        .select(['id', 'nonce'])
        .where('subject_ref', '=', `grant:${grantId}:email`)
        .orderBy('created_at', 'desc')
        .limit(1)
        .executeTakeFirstOrThrow(),
    ),
  )

test.describe('neutral recovery for expired or revoked access (TSK-0035)', () => {
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[T18][HH-ID-09][HH-ID-03][HH-ID-08] a revoked link shows the neutral recovery page; asking gets the same answer for a known and an unknown contact', async ({
    page,
    request,
  }) => {
    const email = 'recover-e2e@example.test'
    const link = await sendRequest(request, email)
    // Staff corrected the link (revocation is final; its sessions end).
    await withDb((db) =>
      db
        .updateTable('identity.project_access_grants')
        .set({ revoked_at: new Date(), revoke_reason: 'corrected_link', revoked_by: 'e2e' })
        .where('id', '=', link.grantId)
        .execute(),
    )
    const urls: string[] = []
    const posts: { path: string; body: string }[] = []
    page.on('request', (r) => {
      urls.push(r.url())
      if (r.method() === 'POST') posts.push({ path: new URL(r.url()).pathname, body: r.postData() ?? '' })
    })
    await page.goto(`/access#${link.token}`)
    await page.getByRole('button', { name: 'Open', exact: true }).click()
    await expect(page.getByRole('heading', { name: "This link can't be opened" })).toBeFocused()
    const recovery = page.getByRole('region', { name: 'Ask for a new secure link' })
    await expect(recovery).toBeVisible()
    // The old link names the project, so only the contact is asked for; nothing about the project is shown.
    await expect(recovery.getByLabel('Request reference')).toHaveCount(0)
    await expect(page.locator('main')).not.toContainText(new RegExp(`${link.reference}|Synthetic Lane|rattling`, 'i'))
    await axe(page)

    await recovery.getByLabel('Email or mobile phone').fill(email)
    await recovery.getByRole('button', { name: 'Send a new link' }).click()
    // The neutral answer replaces the form (an unknown contact gets the same one: compared through the API below).
    await expect(recovery.getByText(DONE)).toBeVisible()
    await expect(recovery.getByLabel('Email or mobile phone')).toHaveCount(0)
    const reissues = posts.filter((p) => p.path === '/api/v1/public/access/reissue')
    expect(reissues.map((p) => JSON.parse(p.body) as unknown)).toEqual([{ token: link.token, contact: email }])
    // The same answer for a known and an unknown contact, from the API directly.
    const answer = async (contact: string) => {
      const res = await request.post('/api/v1/public/access/reissue', { data: { token: link.token, contact } })
      return [res.status(), await res.json()]
    }
    expect(await answer(email)).toEqual(await answer('nobody-e2e@example.test'))
    // Only the known contact got new links (the page's ask and the direct one); the unknown one nothing. The token
    // never travelled in a URL or left this origin.
    const grants = await withDb((db) =>
      db
        .selectFrom('identity.project_access_grants')
        .select('issued_reason')
        .where('project_id', '=', link.projectId)
        .orderBy('created_at')
        .execute(),
    )
    expect(grants.map((g) => g.issued_reason)).toEqual(['submission', 'reissue', 'reissue'])
    const origin = new URL(page.url()).origin
    expect(urls.filter((u) => new URL(u).origin !== origin)).toEqual([])
    expect(urls.filter((u) => u.includes(link.token))).toEqual([])
    expect(new URL(page.url()).hash).toBe('')
    await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
    expect(await page.evaluate(() => JSON.stringify(window.sessionStorage))).not.toContain(link.token)
  })

  test('[T18][HH-ID-09][HH-ID-06] wrong codes until the attempts run out show the neutral code page, which offers a new code', async ({
    page,
    request,
  }) => {
    const email = 'recover-attempts-e2e@example.test'
    const link = await sendRequest(request, email)
    const max = await withDb(async (db) => {
      const row = await db
        .selectFrom('platform.policy_version')
        .select('value')
        .where('key', '=', 'verification.limits')
        .orderBy('version', 'desc')
        .limit(1)
        .executeTakeFirstOrThrow()
      return (row.value as { maxAttemptsPerCode: number }).maxAttemptsPerCode
    })
    await page.goto(`/access#${link.token}`)
    await page.getByRole('button', { name: 'Open', exact: true }).click()
    await page.getByRole('button', { name: 'Email me a code' }).click()
    await expect(page.getByLabel('Code')).toBeFocused()
    const code = await grantCode(link.grantId)
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0')
    for (let i = 1; i < max; i++) {
      await page.getByLabel('Code').fill(wrong)
      await page.getByRole('button', { name: 'Open my project' }).click()
      await expect(
        page.getByText("That code didn't work. Check it and try again, or ask for a new code."),
      ).toBeVisible()
    }
    await page.getByLabel('Code').fill(wrong)
    await page.getByRole('button', { name: 'Open my project' }).click()
    await expect(page.getByRole('heading', { name: "That code can't be used anymore" })).toBeFocused()
    await expect(page.getByLabel('Code', { exact: true })).toHaveCount(0)
    await expect(page.locator('main')).not.toContainText(link.reference)
    await axe(page)

    // Past the resend cooldown (the stored code is moved back), a new code is sent and opens the project.
    await withDb(async (db) => {
      const sent = await db
        .selectFrom('identity.verification_codes')
        .select(['id', 'created_at'])
        .where('subject_ref', '=', `grant:${link.grantId}:email`)
        .execute()
      for (const c of sent)
        await db
          .updateTable('identity.verification_codes')
          .set({ created_at: new Date(c.created_at.getTime() - 60_000) })
          .where('id', '=', c.id)
          .execute()
    })
    await page.getByRole('button', { name: 'Email me a code' }).click()
    await expect(page.getByLabel('Code')).toBeFocused()
    await page.getByLabel('Code').fill(await grantCode(link.grantId))
    await page.getByRole('button', { name: 'Open my project' }).click()
    await expect(page.getByRole('heading', { name: 'Your project', exact: true })).toBeFocused()
    await expect(page.getByText(`Request reference: ${link.reference}`)).toBeVisible()
  })

  test('[HH-ID-09][HH-ID-06] without a link the page asks for the reference and the contact, and checks only the form', async ({
    browser,
  }) => {
    const context = await browser.newContext({ extraHTTPHeaders: HEADERS })
    const page = await context.newPage()
    try {
      await page.goto('/access')
      await expect(page.getByRole('heading', { name: 'Open your project with your secure link' })).toBeVisible()
      const recovery = page.getByRole('region', { name: 'Ask for a new secure link' })
      await recovery.getByRole('button', { name: 'Send a new link' }).click()
      await expect(recovery.getByLabel('Request reference')).toBeFocused()
      await expect(recovery.getByText('Enter the request reference from your receipt.')).toBeVisible()
      await expect(recovery.getByText('Enter a valid email address or mobile phone number.')).toBeVisible()
      await axe(page)
      await recovery.getByLabel('Request reference').fill('HH-00000000')
      await recovery.getByLabel('Email or mobile phone').fill('not a contact')
      await recovery.getByRole('button', { name: 'Send a new link' }).click()
      await expect(recovery.getByLabel('Email or mobile phone')).toBeFocused()
      await expect(recovery.getByText('Request reference')).toBeVisible()
      await recovery.getByLabel('Email or mobile phone').fill('(502) 555-0138')
      await recovery.getByRole('button', { name: 'Send a new link' }).click()
      await expect(recovery.getByText(DONE)).toBeVisible()
    } finally {
      await context.close()
    }
  })
})
