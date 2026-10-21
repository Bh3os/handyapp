// Approve Estimate in a real browser (TSK-0057; HH-EST-06, HH-EST-07, HH-EST-08, HH-ID-07, T33, T34, OWN-DEC-103,
// OWN-DEC-105). A guest opens the project with the secure link and a code (TSK-0034); an Estimator of this spec
// publishes an estimate through the staff API; the customer's verification goes stale, a new code in the page makes
// it fresh again without losing the selected option, the name or the ticked box, and the customer approves the exact
// version. One approval, one job and one scheduling task exist afterwards, whatever is sent again.
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

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.157' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const ESTIMATOR = 'e2e-estimate-approval-estimator@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'estimate', 'approval', 'passphrase', '57'].join(' ')

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-estimate-approval' })
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
    headers: { 'idempotency-key': `synthetic-e2e-estimate-approval-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic approval project: a dented hallway wall.',
      property: {
        street: '157 Synthetic Approval Way',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['afternoons'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Test Approval Customer',
        email: `estimate-approval-e2e-${Date.now()}@example.test`,
        phone: '(502) 555-0157',
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
      .values({ email: ESTIMATOR, display_name: 'E2E Approval Estimator', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({
        staff_user_id: user.id,
        kind: 'role',
        name: 'estimator',
        issued_by: 'e2e:estimate-approval',
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
        'idempotency-key': `e2e-estimate-approval-${Date.now()}-${++k}`,
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

const counts = (projectId: string) =>
  withDb(async (db) => {
    const n = async (table: 'estimating.approvals' | 'work.jobs' | 'work.scheduling_tasks') =>
      Number(
        (
          await db
            .selectFrom(table)
            .select((eb) => eb.fn.countAll().as('n'))
            .where('project_id', '=', projectId)
            .executeTakeFirst()
        )?.n ?? 0,
      )
    return {
      approvals: await n('estimating.approvals'),
      jobs: await n('work.jobs'),
      tasks: await n('work.scheduling_tasks'),
    }
  })

test.describe('Approve Estimate: exact version, fresh verification, one job (TSK-0057)', () => {
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

  test('[HH-EST-06][HH-ID-07][T33][T34][HH-EST-08] a stale customer verifies again in the page and approves once: one job, one scheduling task', async ({
    page,
    request,
    browser,
  }) => {
    const link = await sendRequest(request)
    const estimator = await estimatorSession(browser)
    try {
      // The Estimator publishes a written estimate: base $1,250.00 and an optional add-on of $45.00.
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
              description: 'Synthetic: repair the hallway wall',
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

      // The customer opens the project; then their verification goes stale (older than the freshness window).
      await openProject(page, link)
      await withDb((db) =>
        db
          .updateTable('identity.customer_sessions')
          .set({ fresh_until: new Date(Date.now() - 60_000) })
          .where('grant_id', '=', link.grantId)
          .where('revoked_at', 'is', null)
          .execute(),
      )
      await page.goto(`/portal/p/${link.reference}/documents/${number}/1`)
      const view = page.getByTestId('estimate-view')
      await expect(view.getByText('Version 1: Current')).toBeVisible()
      const approval = view.getByTestId('estimate-approval')
      const box = approval.getByRole('checkbox', { name: 'I have read and accept the estimate terms' })
      await expect(box).not.toBeChecked()
      await expect(approval.getByText('Approving does not book an appointment or pay a deposit.')).toBeVisible()

      // Selecting the add-on: the server's total and deposit ($1,295.00; 20% = $259.00, FACT-DEPOSIT-RULE).
      await approval.getByRole('checkbox', { name: 'Synthetic: prime the patched area ($45.00)' }).check()
      const totals = approval.getByTestId('approval-totals')
      await expect(totals.getByText('$1,295.00').first()).toBeVisible()
      await expect(totals.getByText('$259.00')).toBeVisible()
      await box.check()
      await approval.getByLabel('Your full name', { exact: true }).fill('Test Approval Customer')
      await axe(page)
      await approval.getByRole('button', { name: 'Approve Estimate' }).click()
      await expect(
        approval.getByText("For your security, confirm it's you again with a new code, then try again."),
      ).toBeVisible()
      expect(await counts(link.projectId)).toEqual({ approvals: 0, jobs: 0, tasks: 0 })

      // A new code right here, to the session's own contact; the choices stay as they are.
      const verify = view.getByTestId('estimate-reverify')
      await verify.getByRole('button', { name: /^Email a code to / }).click()
      await expect(verify.getByText(/^We sent a code to /)).toBeVisible()
      await verify.getByLabel('Code').fill(codeFor(await latestCode(`reverify:grant:${link.grantId}:email`)))
      await verify.getByRole('button', { name: 'Confirm' }).click()
      await expect(view.getByTestId('estimate-reverify')).toHaveCount(0)
      await expect(approval.getByRole('checkbox', { name: 'Synthetic: prime the patched area ($45.00)' })).toBeChecked()
      await expect(box).toBeChecked()
      await expect(approval.getByLabel('Your full name', { exact: true })).toHaveValue('Test Approval Customer')

      // Approve Estimate: the exact version, once.
      const answer = page.waitForResponse((r) => r.url().endsWith('/approve') && r.request().method() === 'POST')
      await approval.getByRole('button', { name: 'Approve Estimate' }).click()
      const sent = await answer
      expect(sent.status()).toBe(201)
      const body = sent.request().postDataJSON() as Record<string, unknown>
      // TSK-0058 (OWN-DEC-105): $1,295.00 is over $1,000.00, so the deposit is the next step.
      await expect(view.getByText('Estimate approved—pay your deposit to proceed with scheduling.')).toBeVisible()
      await expect(view.getByText('Version 1: Approved')).toBeVisible()
      await expect(view.getByRole('button', { name: 'Approve Estimate' })).toHaveCount(0)
      await axe(page)
      expect(await counts(link.projectId)).toEqual({ approvals: 1, jobs: 1, tasks: 1 })

      // Sending it again from another tab (a new key) or a retry with the same key: still one of each.
      const url = `/api/v1/customer/projects/${link.reference}/estimates/${number}/versions/1/approve`
      const resend = (key: string) =>
        page.evaluate(
          async ({ url, body, key }) => {
            const res = await fetch(url, {
              method: 'POST',
              credentials: 'same-origin',
              headers: { 'content-type': 'application/json', 'idempotency-key': key },
              body: JSON.stringify(body),
            })
            return { status: res.status, replayed: res.headers.get('idempotent-replayed') }
          },
          { url, body, key },
        )
      expect(await resend(`portal-${'a'.repeat(32)}`)).toEqual({ status: 200, replayed: null })
      expect(await resend(sent.request().headers()['idempotency-key'] as string)).toEqual({
        status: 201,
        replayed: 'true',
      })
      expect(await counts(link.projectId)).toEqual({ approvals: 1, jobs: 1, tasks: 1 })
      const stored = await withDb((db) =>
        db
          .selectFrom('estimating.approvals')
          .select(['selected_options', 'total_cents', 'deposit_cents', 'full_name', 'test_mark', 'terms_document_id'])
          .where('project_id', '=', link.projectId)
          .executeTakeFirstOrThrow(),
      )
      expect(stored).toEqual({
        selected_options: [2],
        total_cents: '129500',
        deposit_cents: '25900',
        full_name: 'Test Approval Customer',
        test_mark: true,
        terms_document_id: ESTIMATE_TERMS.documentId,
      })

      // The Estimator sees the approval, the job and the scheduling task on the estimate.
      await estimator.page.goto(`/staff/estimates/${versionId}`)
      const panel = estimator.page.getByTestId('estimate-customer-approval')
      await expect(panel.getByText('TEST approval: not a real customer approval')).toBeVisible()
      await expect(panel.getByText(/^Version 1 approved by Test Approval Customer, /)).toBeVisible()
      await expect(panel.getByText('$1,295.00')).toBeVisible()
      await expect(panel.getByText('Pending preparation')).toBeVisible()
      await axe(estimator.page)

      // On a phone nothing scrolls sideways.
      await page.setViewportSize({ width: 375, height: 740 })
      await expect(view.getByText('Estimate approved—pay your deposit to proceed with scheduling.')).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    } finally {
      await estimator.close()
    }
  })
})
