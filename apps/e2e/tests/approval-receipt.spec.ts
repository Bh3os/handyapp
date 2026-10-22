// The approval receipt in a real browser (TSK-0058; HH-EST-12, HH-EST-10, HH-PORT-10, T23, T33, OWN-DEC-105,
// OWN-DEC-126, FACT-AUTOMATIC-MESSAGES). A guest opens the project with the secure link and a code; this spec's
// Estimator publishes an estimate at or under the deposit threshold; the customer approves it and sees the owner's next
// step ("Estimate approved—choose your work appointment."), then the approval receipt PDF once the server's job has
// issued it, in the estimate view and in Documents. The receipt message is not sent: its email wording is released but
// its values are not wired yet (TSK-0119) and texts have no wording; each destination is recorded as not sent, never as
// sent, and staff see that on the estimate.
// No estimate terms version is recorded by the migrations, and v1.0 is not approved for real customers (approval
// answers NOT CONFIGURED everywhere). To exercise the flow, this spec records a synthetic "approved and
// attorney-reviewed" v1.0 for its own run only and restores NOT CONFIGURED afterwards: a test fixture, never the
// owner's sign-off. Every visitor, address, account, name and amount is synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'
import { passSecondFactor } from '../mfa.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.158' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const ESTIMATOR = 'e2e-approval-receipt-estimator@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'approval', 'receipt', 'passphrase', '58'].join(' ')

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-approval-receipt' })
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
    headers: { 'idempotency-key': `synthetic-e2e-approval-receipt-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic receipt project: a scuffed stair wall.',
      property: {
        street: '158 Synthetic Receipt Way',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Test Receipt Customer',
        email: `approval-receipt-e2e-${Date.now()}@example.test`,
        phone: '(502) 555-0158',
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

/** The latest code sent for a subject, as the delivery job would derive it. */
const latestCode = (subject: string) =>
  withDb((db) =>
    db
      .selectFrom('identity.verification_codes')
      .select(['id', 'nonce'])
      .where('subject_ref', '=', subject)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirstOrThrow(),
  )

/** Opens the link, enters the emailed code, and goes on to the project page in the portal. */
async function openProject(page: Page, link: { token: string; grantId: string; reference: string }) {
  await page.goto(`/access#${link.token}`)
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await expect(page.getByLabel('Code')).toBeFocused()
  await page.getByLabel('Code').fill(codeFor(await latestCode(`grant:${link.grantId}:email`)))
  await page.getByRole('button', { name: 'Open my project' }).click()
  await expect(page.getByRole('heading', { name: 'Your project', exact: true })).toBeVisible()
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
      .values({ email: ESTIMATOR, display_name: 'E2E Receipt Estimator', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({
        staff_user_id: user.id,
        kind: 'role',
        name: 'estimator',
        issued_by: 'e2e:approval-receipt',
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
  // MFA is mandatory (TSK-0154): enrol on the account's first sign-in, the code afterwards.
  await passSecondFactor(page)
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
        'idempotency-key': `e2e-approval-receipt-${Date.now()}-${++k}`,
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

test.describe('The approval receipt: next step, PDF and truthful delivery (TSK-0058)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test.beforeAll(async () => {
    // A synthetic in-effect record of v1.0 for this spec's run only (see the header).
    await recordVersion(
      'legal.estimate_terms',
      {
        documentId: ESTIMATE_TERMS.documentId,
        status: 'approved',
        attorneyReviewed: true,
        preparedOn: ESTIMATE_TERMS.preparedOn,
        contentSha256: ESTIMATE_TERMS.contentSha256,
      },
      ['HH-EST-13', 'OWN-DEC-127', 'TEST-SYNTHETIC'],
    )
  })
  test.afterAll(async () => {
    // The terms stay NOT CONFIGURED for every other spec.
    await recordVersion('legal.estimate_terms', null, ['HH-EST-13', 'OWN-DEC-127', 'OQ-TERMS-OWNER-APPROVAL'])
  })

  test("[HH-EST-12][OWN-DEC-105][T23][T33][HH-PORT-10] after approving: the owner's next step, then the receipt PDF; the message is recorded, never sent", async ({
    page,
    request,
    browser,
  }) => {
    const link = await sendRequest(request)
    const estimator = await estimatorSession(browser)
    try {
      // The Estimator publishes a written estimate of $900.00: at or under $1,000.00, so no deposit.
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
      ).json()) as { rowVersion: number; workPackages: { id: string }[] }
      const saved = await estimator.write(
        'PUT',
        `/api/v1/staff/estimate-versions/${versionId}/draft`,
        {
          lines: [
            {
              kind: 'base',
              workPackageId: draft.workPackages[0]?.id,
              description: 'Synthetic: repair the stair wall',
              quantity: '1',
              unit: 'job',
              unitPriceCents: 90_000,
            },
          ],
          texts: { exclusions: ['Synthetic: no repainting of the ceiling'] },
        },
        draft.rowVersion,
      )
      await estimator.write(
        'POST',
        `/api/v1/staff/estimate-versions/${versionId}/publish`,
        {},
        saved['rowVersion'] as number,
      )

      // The customer opens the project and approves the exact version.
      await openProject(page, link)
      await page.goto(`/portal/p/${link.reference}/documents/${number}/1`)
      const view = page.getByTestId('estimate-view')
      await expect(view.getByText('Version 1: Current')).toBeVisible()
      const approval = view.getByTestId('estimate-approval')
      // The page is an island: it is interactive once its checkbox reacts.
      const box = approval.getByRole('checkbox', { name: 'I have read and accept the estimate terms' })
      await expect(box).toBeEnabled()
      await box.check()
      await expect(box).toBeChecked()
      await approval.getByLabel('Your full name', { exact: true }).fill('Test Receipt Customer')
      const answer = page.waitForResponse((r) => r.url().endsWith('/approve') && r.request().method() === 'POST')
      await approval.getByRole('button', { name: 'Approve Estimate' }).click()
      const sent = await answer
      expect(sent.status()).toBe(201)
      expect(((await sent.json()) as { nextStep: string }).nextStep).toBe('choose_work_appointment')

      // The receipt: the next step in the owner's words, and the PDF once the server has issued it.
      await expect(view.getByText('Estimate approved—choose your work appointment.')).toBeVisible()
      await expect(view.getByText('Version 1: Approved')).toBeVisible()
      await expect(view.getByText('TEST — not a real invoice or estimate').first()).toBeVisible()
      const receipt = view.getByTestId('approval-receipt')
      const download = receipt.getByRole('link', { name: 'Download your approval receipt (PDF)' })
      await expect(async () => {
        await page.reload()
        await expect(download).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 30_000 })
      // A short-lived signed link from the private object storage (the fake of ci), never a storage key alone.
      expect(await download.getAttribute('href')).toMatch(/^https:\/\/fake-r2\.invalid\/estimates\/receipts\/.+sig=/)
      await axe(page)

      // One receipt, recorded with its hash and the approval's TEST mark; one confirmation email (link only).
      const stored = await withDb(async (db) => {
        const a = await db
          .selectFrom('estimating.approvals')
          .select(['id', 'total_cents', 'deposit_state'])
          .where('project_id', '=', link.projectId)
          .executeTakeFirstOrThrow()
        const receipts = await db
          .selectFrom('estimating.approval_receipts')
          .select(['test_mark', 'terms_document_id', 'content_type'])
          .where('approval_id', '=', a.id)
          .execute()
        const deliveries = await db
          .selectFrom('platform.message_deliveries')
          .select(['channel', 'state', 'error_code'])
          .where('message_key', '=', 'approval.receipt')
          .where('record_id', '=', a.id)
          .orderBy('channel')
          .execute()
        return { a, receipts, deliveries }
      })
      expect(stored.a).toMatchObject({ total_cents: '90000', deposit_state: 'not_required' })
      expect(stored.receipts).toEqual([
        { test_mark: true, terms_document_id: ESTIMATE_TERMS.documentId, content_type: 'application/pdf' },
      ])
      expect(stored.deliveries).toEqual([
        // TSK-0120: the email with its values (intercepted by the ci test provider); texts have no wording yet.
        { channel: 'email', state: 'queued', error_code: null },
        { channel: 'sms', state: 'failed', error_code: 'template_not_configured' },
      ])

      // The Overview names the same next step; Documents marks the receipt.
      await page.goto(`/portal/p/${link.reference}`)
      await expect(page.getByText('Estimate approved—choose your work appointment.').first()).toBeVisible()
      await page.goto(`/portal/p/${link.reference}/documents`)
      await expect(page.getByTestId('documents-receipt')).toHaveText(
        'Approval receipt (PDF): open the estimate to download it.',
      )
      await axe(page)

      // The Estimator sees the issued receipt and the message as it truly stands.
      await estimator.page.goto(`/staff/estimates/${versionId}`)
      const panel = estimator.page.getByTestId('estimate-customer-approval')
      await expect(panel.getByTestId('approval-receipt-state')).toHaveText(/^Issued /)
      // TSK-0120: the confirmation email went to the ci test provider (queued, never shown as delivered).
      await expect(panel.getByText('Email: Queued', { exact: true })).toBeVisible()
      await axe(estimator.page)

      // On a phone nothing scrolls sideways.
      await page.setViewportSize({ width: 375, height: 740 })
      await page.goto(`/portal/p/${link.reference}/documents/${number}/1`)
      await expect(page.getByRole('link', { name: 'Download your approval receipt (PDF)' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    } finally {
      await estimator.close()
    }
  })
})
