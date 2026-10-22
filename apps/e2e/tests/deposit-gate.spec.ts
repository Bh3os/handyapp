// The deposit request, staff-recorded deposit payments and the work-scheduling gate in a real browser (TSK-0059;
// HH-FIN-02, HH-FIN-09, HH-FIN-12, HH-SCH-06, T36, T64, INT-Square, OWN-DEC-104, OWN-DEC-105, OWN-DEC-138, S01).
// A guest opens the project with the secure link and a code; this spec's Estimator publishes a $1,275.00 estimate
// (deposit 20% = $255.00, FACT-DEPOSIT-RULE) and the customer approves it. The customer sees "Deposit due"; this
// spec's Office user opens the job's deposit from the action queue, pastes a Square link and records a check (pending)
// and a card payment; the customer then sees Pay by Card, the money received and the pending check, and work visits
// stay blocked because a check counts only once the Owner clears it. Office is refused clearing and waiving. The Owner's
// waiver itself is covered by the integration tests: this spec never creates an Owner (the staff sign-in spec must find
// none). No estimate terms version is in effect for real customers: this spec records a synthetic "approved and
// attorney-reviewed" v1.0 for its own run only and restores NOT CONFIGURED afterwards, a test fixture and never the
// owner's sign-off. Every visitor, account, name, link, reference and amount is synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'
import { verifyPropertyZone } from '../zones.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.159' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const ESTIMATOR = 'e2e-deposit-gate-estimator@example.test'
const OFFICE = 'e2e-deposit-gate-office@example.test'
// Built at runtime so no literal looks like a credential or a real payment (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'deposit', 'gate', 'passphrase', '59'].join(' ')
const SQUARE_LINK = ['https://square.link/u', ['synthetic', 'deposit', '0059'].join('-')].join('/')
const ref = (what: string) => ['SYNTH', what, '0059', String(Date.now())].join('-')

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-deposit-gate' })
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
    headers: { 'idempotency-key': `synthetic-e2e-deposit-gate-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-PT-01' }],
      notSure: false,
      description: 'Synthetic deposit project: repaint a dining room.',
      property: {
        street: '159 Synthetic Deposit Court',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Test Deposit Customer',
        email: `deposit-gate-e2e-${Date.now()}@example.test`,
        phone: '(502) 555-0159',
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
  // TSK-0123: a new property's zone is unknown; this spec plans visits, so its zone is recorded first.
  await withDb((db) => verifyPropertyZone(db, row.project_id))
  return {
    reference,
    requestId: row.request_id,
    projectId: row.project_id,
    grantId: row.id,
    token: accessTokenFor(row),
  }
}

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

/** A staff account of this spec's own (never the Owner), signed in through the staff app in its own browser. */
async function staffSession(browser: Browser, email: string, role: 'estimator' | 'office', name: string) {
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
      .where('email', '=', email)
      .executeTakeFirst()
    if (existing) return
    const user = await db
      .insertInto('identity.staff_users')
      .values({ email, display_name: name, locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: role, issued_by: 'e2e:deposit-gate', reason: null })
      .execute()
  })
  const context = await browser.newContext({ extraHTTPHeaders: HEADERS })
  const page = await context.newPage()
  await page.goto(staffAccess('password-link', email))
  await page.getByLabel('New password').fill(pw)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(pw)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
  const csrf = ((await (await page.request.get('/api/v1/staff/auth/session')).json()) as { csrfToken: string })
    .csrfToken
  let k = 0
  const send = (method: 'POST' | 'PUT', url: string, data: unknown, version?: number) =>
    page.request.fetch(url, {
      method,
      data,
      headers: {
        'x-csrf-token': csrf,
        'idempotency-key': `e2e-deposit-gate-${role}-${Date.now()}-${++k}`,
        ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
      },
    })
  const write = async (method: 'POST' | 'PUT', url: string, data: unknown, version?: number) => {
    const res = await send(method, url, data, version)
    expect(res.status(), await res.text()).toBeLessThan(300)
    return res.json() as Promise<Record<string, unknown>>
  }
  return { page, send, write, close: () => context.close() }
}

const CHECKS = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

test.describe('The deposit request, recorded deposit payments and the work-scheduling gate (TSK-0059)', () => {
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

  test('[HH-FIN-02][HH-FIN-09][HH-FIN-12][HH-SCH-06][T36][T64] deposit due, Square link, a pending check and a card payment; work visits stay blocked', async ({
    page,
    request,
    browser,
  }) => {
    const link = await sendRequest(request)
    const estimator = await staffSession(browser, ESTIMATOR, 'estimator', 'E2E Deposit Estimator')
    const office = await staffSession(browser, OFFICE, 'office', 'E2E Deposit Office')
    try {
      // The Estimator publishes a written estimate of $1,275.00.
      await estimator.write('PUT', `/api/v1/staff/requests/${link.requestId}/qualification`, { checks: CHECKS }, 0)
      const req = (await (await estimator.page.request.get(`/api/v1/staff/requests/${link.requestId}`)).json()) as {
        version: number
      }
      await estimator.write(
        'POST',
        `/api/v1/staff/requests/${link.requestId}/actions/online-estimate`,
        { workPackages: ['SVC-PT-01'] },
        req.version,
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
      const saved = await estimator.write(
        'PUT',
        `/api/v1/staff/estimate-versions/${versionId}/draft`,
        {
          lines: [
            {
              kind: 'base',
              workPackageId: draft.workPackages[0]?.id,
              description: 'Synthetic: repaint the dining room',
              quantity: '1',
              unit: 'room',
              unitPriceCents: 127_500,
            },
          ],
          texts: { exclusions: ['Synthetic: ceiling'] },
        },
        draft.rowVersion,
      )
      await estimator.write(
        'POST',
        `/api/v1/staff/estimate-versions/${versionId}/publish`,
        {},
        saved['rowVersion'] as number,
      )

      // The customer opens the project and approves the exact version (the approval screen has its own spec).
      await openProject(page, link)
      const approved = await page.evaluate(
        async ({ url, terms }) => {
          const detail = (await (await fetch(url, { credentials: 'same-origin' })).json()) as {
            totalCents: number
            approval: { contentDigest: string; selection: { deposit: { amountCents: number | null } } | null }
          }
          const res = await fetch(`${url}/approve`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json', 'idempotency-key': `portal-${'d'.repeat(32)}` },
            body: JSON.stringify({
              contentDigest: detail.approval.contentDigest,
              options: [],
              totalCents: detail.totalCents,
              depositCents: detail.approval.selection?.deposit.amountCents ?? null,
              termsDocumentId: terms.documentId,
              termsSha256: terms.sha256,
              acceptTerms: true,
              fullName: 'Test Deposit Customer',
            }),
          })
          return { status: res.status, deposit: detail.approval.selection?.deposit.amountCents ?? null }
        },
        {
          url: `/api/v1/customer/projects/${link.reference}/estimates/${number}/versions/1`,
          terms: { documentId: ESTIMATE_TERMS.documentId, sha256: ESTIMATE_TERMS.contentSha256 },
        },
      )
      // $1,275.00 is over $1,000.00: 20% = $255.00, computed by the server.
      expect(approved).toEqual({ status: 201, deposit: 25_500 })
      const jobId = await withDb(
        async (db) =>
          (
            await db
              .selectFrom('work.jobs')
              .select('id')
              .where('project_id', '=', link.projectId)
              .executeTakeFirstOrThrow()
          ).id,
      )

      // The customer: "Deposit due" in the owner's words, the next step, no Pay by Card before staff enter a link.
      await page.goto(`/portal/p/${link.reference}`)
      const payments = page.getByRole('region', { name: 'Payments' })
      await expect(
        payments.getByText(
          'Deposit due: $255.00. Please pay your deposit so we can confirm your work appointment. Payment does not guarantee a particular date.',
        ),
      ).toBeVisible()
      await expect(page.getByText('Estimate approved—pay your deposit to proceed with scheduling.')).toBeVisible()
      await expect(payments.getByRole('link', { name: 'Pay by Card' })).toHaveCount(0)

      // Office finds the deposit in the action queue (S01) and opens it.
      await office.page.goto('/staff/')
      await expect(office.page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
      const queue = office.page.locator('.staff-queue__list-wrap').first()
      await queue.getByLabel('Reference').fill(link.reference)
      const item = office.page.getByRole('listitem', { name: new RegExp(`Deposit to collect ${link.reference}`) })
      await expect(async () => {
        await queue.getByRole('button', { name: 'Apply filters' }).click()
        await expect(item).toBeVisible({ timeout: 1000 })
      }).toPass({ timeout: 20_000 })
      await item.getByRole('link', { name: 'Open the deposit' }).click()
      await expect(office.page).toHaveURL(new RegExp(`/staff/payments/${jobId}$`))
      await expect(office.page.getByRole('heading', { level: 1, name: 'Job deposit' })).toBeVisible()
      const panel = office.page.getByTestId('job-deposit')
      await expect(panel.getByText('$255.00').first()).toBeVisible()
      await expect(panel.getByTestId('deposit-work-scheduling')).toHaveText(
        'Blocked until the deposit is paid with verified money or the Owner waives it',
      )
      await expect(panel.getByRole('form', { name: 'Waive this deposit' })).toHaveCount(0)
      await axe(office.page)

      // The deposit request: the Square link created in the Square app.
      const linkForm = panel.getByRole('form', { name: 'Deposit request' })
      await linkForm.getByLabel('Square payment link for this deposit').fill(SQUARE_LINK)
      await linkForm.getByRole('button', { name: 'Save the link' }).click()
      await expect(panel.getByText('Payment link saved.')).toBeVisible()
      await expect(panel.getByRole('link', { name: SQUARE_LINK })).toBeVisible()

      // A check of $100.00 (pending until cleared), then a verified card payment of $155.00.
      const recordForm = panel.getByRole('form', { name: 'Record a deposit payment' })
      await recordForm.getByLabel('Method').selectOption('check')
      await recordForm.getByLabel(/Amount received/).fill('100.00')
      await recordForm.getByLabel('Transaction reference').fill(ref('CHECK'))
      await recordForm.getByLabel(/Payer name on the check/).fill('Test Deposit Customer')
      await recordForm.getByRole('button', { name: 'Record payment' }).click()
      await expect(panel.getByText('Payment recorded.')).toBeVisible()
      await expect(panel.getByText('Received (pending until cleared)')).toBeVisible()
      await recordForm.getByLabel('Method').selectOption('square_payment_link')
      await recordForm.getByLabel(/Amount received/).fill('155.00')
      await recordForm.getByLabel('Transaction reference').fill(ref('SQPAY'))
      await recordForm.getByRole('button', { name: 'Record payment' }).click()
      await expect(panel.getByTestId('deposit-payment')).toHaveCount(2)
      await expect(panel.getByText('Partly paid')).toBeVisible()
      // Office never clears a check (OWN-DEC-138) nor waives (OWN-DEC-76): no button, and the server refuses.
      await expect(panel.getByRole('button', { name: 'Mark check cleared' })).toHaveCount(0)
      await expect(panel.getByTestId('deposit-work-scheduling')).toHaveText(
        'Blocked until the deposit is paid with verified money or the Owner waives it',
      )
      await axe(office.page)
      const checkId = await withDb(
        async (db) =>
          (
            await db
              .selectFrom('finance.payments')
              .select('id')
              .where('job_id', '=', jobId)
              .where('method', '=', 'check')
              .executeTakeFirstOrThrow()
          ).id,
      )
      expect((await office.send('POST', `/api/v1/staff/payments/${checkId}/clear`, {})).status()).toBe(403)
      expect(
        (
          await office.send('POST', `/api/v1/staff/jobs/${jobId}/deposit/waiver`, { reason: 'Synthetic attempt' })
        ).status(),
      ).toBe(403)
      // The gate the work-visit confirmation calls: still shut (the check has not cleared).
      const gate = await withDb(
        async (db) =>
          (
            await db
              .selectNoFrom((eb) => eb.fn<string>('finance.work_visit_deposit_gate', [eb.val(jobId)]).as('gate'))
              .executeTakeFirstOrThrow()
          ).gate,
      )
      expect(gate).toBe('required')

      // The customer: Pay by Card opens the Square link; the card payment shows as received, the check as pending.
      await page.reload()
      await expect(payments.getByText('Received so far: $155.00.')).toBeVisible()
      await expect(payments.getByText('Pending: $100.00. A check counts once it has cleared.')).toBeVisible()
      await expect(payments.getByRole('link', { name: 'Pay by Card' })).toHaveAttribute('href', SQUARE_LINK)
      await axe(page)
      await page.setViewportSize({ width: 375, height: 740 })
      await expect(payments.getByRole('link', { name: 'Pay by Card' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    } finally {
      await estimator.close()
      await office.close()
    }
  })
})
