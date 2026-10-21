// The customer estimate view, estimate terms v1.0, Request Changes and Decline in a real browser (TSK-0056; HH-EST-09,
// HH-EST-13, HH-EST-06, HH-PORT-10, T33, OWN-DEC-103, OWN-DEC-127). A guest opens the project with the secure link and
// a code (TSK-0034); an Estimator of this spec publishes an estimate through the staff API; the customer reads it in
// the Documents tab, requests changes and then declines; the Estimator finds the customer's words through the action
// queue. No estimate terms version is recorded by the migrations (nothing is in effect until the owner's sign-off), so
// this spec records terms v1.0 as "owner review pending" for its own run and restores NOT CONFIGURED afterwards. Every
// visitor, address, account and amount is synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.156' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const ESTIMATOR = 'e2e-portal-estimate-estimator@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'portal', 'estimate', 'passphrase', '56'].join(' ')

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-portal-estimate' })
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

/** A new active version of a configuration key, as recordPolicyVersion writes it (value null: NOT CONFIGURED). */
async function recordVersion(key: string, value: unknown, sourceIds: string[]) {
  await withDb((db) =>
    db.transaction().execute(async (trx) => {
      const latest = await trx
        .selectFrom('platform.policy_version')
        .select((eb) => eb.fn.max('version').as('max'))
        .where('key', '=', key)
        .executeTakeFirst()
      await trx
        .updateTable('platform.policy_version')
        .set({ status: 'superseded' })
        .where('key', '=', key)
        .where('status', '=', 'active')
        .execute()
      await trx
        .insertInto('platform.policy_version')
        .values({
          key,
          version: Number(latest?.max ?? 0) + 1,
          state: value === null ? 'not_configured' : 'configured',
          value: value === null ? null : JSON.stringify(value),
          proposed: value !== null,
          source_ids: sourceIds,
          changed_by: 'e2e',
          change_reason: 'synthetic e2e configuration',
        })
        .execute()
    }),
  )
}

/** A request sent through the API (the wizard has its own specs): its reference, request ID and link. */
async function sendRequest(request: APIRequestContext) {
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `synthetic-e2e-portal-estimate-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic estimate-view project: a cracked bedroom wall.',
      property: { street: '156 Synthetic Bend', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Test Estimate Customer',
        email: `portal-estimate-e2e-${Date.now()}@example.test`,
        phone: '(502) 555-0156',
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
  // From here the page's own timers are under the test's control, so a 30-second refresh takes no real time.
  await page.clock.install()
  await page.getByRole('link', { name: 'Go to your project page' }).click()
  await expect(page.getByRole('heading', { level: 1, name: `Project ${link.reference}` })).toBeVisible()
}

/** This spec's Estimator, signed in through the staff app in a browser of its own; writes go through the staff API. */
async function estimatorSession(browser: Browser) {
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
      .where('email', '=', ESTIMATOR)
      .executeTakeFirst()
    if (existing) return
    const user = await db
      .insertInto('identity.staff_users')
      .values({ email: ESTIMATOR, display_name: 'E2E Estimate Estimator', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({
        staff_user_id: user.id,
        kind: 'role',
        name: 'estimator',
        issued_by: 'e2e:portal-estimate',
        reason: null,
      })
      .execute()
  })
  const context = await browser.newContext({ extraHTTPHeaders: HEADERS })
  const page = await context.newPage()
  await page.goto(staffAccess('password-link', ESTIMATOR))
  await page.getByLabel('New password').fill(pw)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(ESTIMATOR)
  await page.getByLabel('Password', { exact: true }).fill(pw)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
  const csrf = ((await (await page.request.get('/api/v1/staff/auth/session')).json()) as { csrfToken: string })
    .csrfToken
  let k = 0
  const write = async (method: 'POST' | 'PUT', url: string, data: unknown, version?: number) => {
    const res = await page.request.fetch(url, {
      method,
      data,
      headers: {
        'x-csrf-token': csrf,
        'idempotency-key': `e2e-portal-estimate-${Date.now()}-${++k}`,
        ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
      },
    })
    expect(res.status(), await res.text()).toBeLessThan(300)
    return res.json() as Promise<Record<string, unknown>>
  }
  return { page, write, close: () => context.close() }
}

const CHECKS = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

test.describe('the customer estimate view, terms v1.0, Request Changes and Decline (TSK-0056)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test.beforeAll(async () => {
    // Terms v1.0 as a legal-document sign-off would record it before the owner's approval: owner review pending.
    await recordVersion(
      'legal.estimate_terms',
      {
        documentId: ESTIMATE_TERMS.documentId,
        status: 'owner_review_pending',
        attorneyReviewed: false,
        preparedOn: ESTIMATE_TERMS.preparedOn,
        contentSha256: ESTIMATE_TERMS.contentSha256,
      },
      ['HH-EST-13', 'OWN-DEC-127', 'TEST-SYNTHETIC'],
    )
  })
  test.afterAll(async () => {
    // The terms stay NOT CONFIGURED for every other spec.
    await recordVersion('legal.estimate_terms', null, ['HH-EST-13', 'OWN-DEC-127', 'OQ-ATTORNEY-TERMS'])
  })

  test('[HH-EST-09][HH-EST-13][T33][HH-PORT-10] request changes creates a staff item and keeps the version; no path accepts by timeout', async ({
    page,
    request,
    browser,
  }) => {
    const link = await sendRequest(request)
    const estimator = await estimatorSession(browser)
    try {
      // The Estimator moves the request on and publishes a written estimate (base $1,250.00, an optional add-on).
      await estimator.write('PUT', `/api/v1/staff/requests/${link.requestId}/qualification`, { checks: CHECKS }, 0)
      const detail = (await (await estimator.page.request.get(`/api/v1/staff/requests/${link.requestId}`)).json()) as {
        version: number
      }
      await estimator.write(
        'POST',
        `/api/v1/staff/requests/${link.requestId}/actions/online-estimate`,
        { workPackages: ['SVC-DW-01'] },
        detail.version,
      )
      const created = await estimator.write('POST', `/api/v1/staff/projects/${link.projectId}/estimates`, {})
      const versionId = created['versionId'] as string
      const number = created['number'] as string
      const draft = (await (
        await estimator.page.request.get(`/api/v1/staff/estimate-versions/${versionId}`)
      ).json()) as {
        rowVersion: number
        workPackages: { id: string }[]
      }
      const wp = draft.workPackages[0]?.id
      const saved = await estimator.write(
        'PUT',
        `/api/v1/staff/estimate-versions/${versionId}/draft`,
        {
          lines: [
            {
              kind: 'base',
              workPackageId: wp,
              description: 'Synthetic: repair the bedroom wall',
              quantity: '1',
              unit: 'job',
              unitPriceCents: 125_000,
            },
            {
              kind: 'add_on',
              workPackageId: wp,
              description: 'Synthetic: prime the patched area',
              quantity: '1',
              unit: 'area',
              unitPriceCents: 4500,
            },
          ],
          texts: { exclusions: ['Synthetic: furniture moving'] },
        },
        draft.rowVersion,
      )
      await estimator.write(
        'POST',
        `/api/v1/staff/estimate-versions/${versionId}/publish`,
        {},
        saved['rowVersion'] as number,
      )

      // The customer opens the project: Review this estimate leads to the Documents tab.
      await openProject(page, link)
      const status = page.getByRole('region', { name: 'Status' })
      await expect(status.getByText('Estimate ready')).toBeVisible()
      await status.getByRole('link', { name: 'Review this estimate' }).click()
      const docs = page.getByRole('tabpanel', { name: 'Documents' })
      const item = docs.getByRole('listitem').filter({ hasText: `Estimate ${number}, version 1` })
      await expect(item.getByText('Current', { exact: true })).toBeVisible()
      await expect(item.getByText(/Total: \$1,250\.00/)).toBeVisible()
      await axe(page)

      // The exact published version, with the TEST mark, the terms in full and why it cannot be approved.
      await item.getByRole('link', { name: `Estimate ${number}, version 1` }).click()
      await expect(page).toHaveURL(new RegExp(`/portal/p/${link.reference}/documents/${number}/1$`))
      const view = page.getByTestId('estimate-view')
      await expect(view.getByText('Version 1: Current')).toBeVisible()
      await expect(view.getByText('TEST — not a real invoice or estimate')).toBeVisible()
      await expect(view.getByText('Handyhub LLC', { exact: true })).toBeVisible()
      await expect(view.getByText('Synthetic: repair the bedroom wall')).toBeVisible()
      await expect(view.getByText('Optional add-on: Synthetic: prime the patched area')).toBeVisible()
      const totals = view.getByTestId('estimate-totals')
      await expect(totals.getByText('$1,250.00').first()).toBeVisible()
      // 20% of $1,250.00, over $1,000.00 (FACT-DEPOSIT-RULE).
      await expect(totals.getByText('$250.00')).toBeVisible()
      await expect(totals.getByText('Payment due on receipt')).toBeVisible()
      const terms = view.getByTestId('estimate-terms')
      await expect(terms.getByText('TEST — wording pending owner approval for real customer use')).toBeVisible()
      await terms.getByText('Read the estimate terms in full').click()
      await expect(
        terms.getByText('The estimate is valid for 14 days from when it is sent to you.', { exact: false }),
      ).toBeVisible()
      await expect(terms.getByText('Payment does not guarantee a particular date.')).toBeVisible()
      await expect(view.getByText("This estimate can't be approved here yet.")).toBeVisible()
      await expect(view.getByText('Not answering never approves an estimate.')).toBeVisible()
      await expect(view.getByRole('button', { name: /approve/i })).toHaveCount(0)
      await axe(page)

      // Request Changes: the message goes to staff; the version stays as it is.
      const message = 'Synthetic e2e request: please quote the add-on separately.'
      await view.getByRole('button', { name: 'Request Changes' }).click()
      await view.getByLabel('What would you like changed?').fill(message)
      await axe(page)
      await view.getByRole('button', { name: 'Send my request' }).click()
      await expect(view.getByText('Your request for changes was sent to HandyHub.')).toBeVisible()
      await expect(view.getByText(message)).toBeVisible()
      await expect(view.getByText('Version 1: Current')).toBeVisible()

      // The Estimator finds the follow-up item by the reference; its link opens the version with the customer's words.
      await estimator.page.getByLabel('Reference', { exact: true }).fill(link.reference)
      await estimator.page.getByRole('button', { name: 'Apply filters' }).click()
      const queueItem = estimator.page.getByRole('listitem').filter({ hasText: 'Customer response to an estimate' })
      await expect(queueItem.getByText('The customer requested changes to the estimate')).toBeVisible()
      await queueItem.getByRole('link', { name: link.reference }).click()
      await expect(estimator.page).toHaveURL(new RegExp(`/staff/estimates/${versionId}$`))
      const responses = estimator.page.getByRole('list', { name: 'Customer responses' })
      await expect(responses.getByText(message)).toBeVisible()
      await expect(responses.getByText(/^Changes requested, version 1, /)).toBeVisible()
      await axe(estimator.page)
      const staffView = (await (
        await estimator.page.request.get(`/api/v1/staff/estimate-versions/${versionId}`)
      ).json()) as { state: string }
      expect(staffView.state).toBe('published')

      // Time passes with no answer: the page refreshes on its own and nothing is ever accepted.
      await page.clock.fastForward(31_000)
      await page.clock.fastForward(31_000)
      await expect(view.getByText('Version 1: Current')).toBeVisible()
      const accepted = await withDb((db) =>
        db
          .selectFrom('estimating.estimate_versions')
          .select('state')
          .where('project_id', '=', link.projectId)
          .execute(),
      )
      expect(accepted.map((v) => v.state)).toEqual(['published'])

      // Decline with a reason: the version is declined, kept, and the staff item says so.
      await view.getByRole('button', { name: 'Decline' }).click()
      await view.getByLabel('Reason (optional)').fill('Synthetic e2e reason: postponing the project.')
      await view.getByRole('button', { name: 'Decline this estimate' }).click()
      await expect(view.getByText('You declined this estimate. HandyHub staff can see your answer.')).toBeVisible()
      await expect(view.getByText('Version 1: Declined')).toBeVisible()
      await expect(view.getByRole('button', { name: 'Request Changes' })).toHaveCount(0)
      await expect(view.getByText('Synthetic e2e reason: postponing the project.')).toBeVisible()
      await axe(page)
      const queue = (await (
        await estimator.page.request.get(`/api/v1/staff/queue?reference=${link.reference}`)
      ).json()) as { items: { type: string; reason: string }[] }
      expect(queue.items.filter((i) => i.type === 'estimate_response').map((i) => i.reason)).toEqual([
        'estimate_declined',
      ])

      // Back in the list the version reads Declined; on a phone nothing scrolls sideways.
      await view.getByRole('link', { name: 'All documents' }).click()
      await expect(docs.getByRole('listitem').filter({ hasText: number }).getByText('Declined')).toBeVisible()
      await page.setViewportSize({ width: 375, height: 740 })
      await docs.getByRole('link', { name: `Estimate ${number}, version 1` }).click()
      await expect(view.getByText('Version 1: Declined')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    } finally {
      await estimator.close()
    }
  })

  test('[HH-EST-13] the estimate terms on a page of their own, numbered, marked as not in effect', async ({ page }) => {
    await page.goto(`/portal/terms/${ESTIMATE_TERMS.documentId}`)
    await expect(page.getByRole('heading', { level: 1, name: 'Estimate Terms' })).toBeVisible()
    await expect(page.getByText('TEST — wording pending owner approval for real customer use')).toBeVisible()
    await expect(page.getByText('These terms are a draft and are not in effect yet.', { exact: false })).toBeVisible()
    await expect(page.locator('.portal-terms__sections > li')).toHaveCount(14)
    await expect(page.getByText('Estimates and invoices are issued under the name Handyhub LLC.')).toBeVisible()
    await axe(page)
  })
})
