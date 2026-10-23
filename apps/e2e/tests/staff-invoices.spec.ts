// The invoice drafted from the approved scope, the issue waiting for the Owner's quality review, and the issued
// invoice in the customer's Documents tab, in a real browser (TSK-0085, TSK-0086; HH-FIN-04, HH-FIN-05, HH-FIN-07,
// HH-PORT-10, HH-QA-02, T58, T59, OWN-DEC-110, OWN-DEC-138).
// This spec's Estimator publishes a $1,275.00 estimate (deposit 20% = $255.00, FACT-DEPOSIT-RULE) that its customer
// approves; its Office user records the deposit and opens the job's invoices: the draft holds the approved line and
// the deposit credit, and issuing waits for the Owner's quality review, which is not built (TSK-0084): no Issue button
// and the server refuses it. The spec then installs the stand-in gate of ../quality-review.ts for this one job in its
// own fresh e2e database (restored afterwards), and Office issues: the invoice number, the confirmed, pending and
// remaining money; the customer sees the invoice as current with its balance. This spec never creates an Owner. No
// estimate terms version is in effect for real customers: a synthetic "approved and attorney-reviewed" v1.0 is
// recorded for this run only and NOT CONFIGURED restored afterwards, a test fixture and never the owner's sign-off.
// Every visitor, account, name, reference and amount is synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'
import { passSecondFactor } from '../mfa.js'
import { passQualityReview, restoreQualityGate } from '../quality-review.js'
import { verifyPropertyZone } from '../zones.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.185' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const ESTIMATOR = 'e2e-invoices-estimator@example.test'
const OFFICE = 'e2e-invoices-office@example.test'
const pw = ['synthetic', 'staff', 'invoices', 'passphrase', '85'].join(' ')

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-invoices' })
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

async function sendRequest(request: APIRequestContext) {
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `synthetic-e2e-invoices-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-PT-01' }],
      notSure: false,
      description: 'Synthetic invoice project: repaint a hallway.',
      property: {
        street: '185 Synthetic Invoice Court',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Test Invoice Customer',
        email: `invoices-e2e-${Date.now()}@example.test`,
        phone: '(502) 555-0185',
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
      .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
      .select(['g.id', 'g.nonce', 'r.id as request_id', 'r.project_id', 'p.reference as project_reference'])
      .where('r.reference', '=', reference)
      .executeTakeFirstOrThrow(),
  )
  await withDb((db) => verifyPropertyZone(db, row.project_id))
  return {
    reference,
    projectReference: row.project_reference,
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
      .values({ staff_user_id: user.id, kind: 'role', name: role, issued_by: 'e2e:invoices', reason: null })
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
  // MFA is mandatory (TSK-0154): enrol on the account's first sign-in, the code afterwards.
  await passSecondFactor(page)
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
        'idempotency-key': `e2e-invoices-${role}-${Date.now()}-${++k}`,
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
const today = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Kentucky/Louisville' }).format(new Date()).slice(0, 10)

test.describe('Invoices drafted from the approved scope, issued after the quality review (TSK-0085, TSK-0086)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test.beforeAll(async () => {
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
    await recordVersion('legal.estimate_terms', null, ['HH-EST-13', 'OWN-DEC-127', 'OQ-TERMS-OWNER-APPROVAL'])
    if (databaseUrl) await restoreQualityGate(databaseUrl)
  })

  test('[HH-FIN-05][HH-FIN-04][HH-QA-02][HH-PORT-10][T58][T59] the draft, the issue waiting for the review, and the issued invoice', async ({
    page,
    request,
    browser,
  }) => {
    const link = await sendRequest(request)
    const estimator = await staffSession(browser, ESTIMATOR, 'estimator', 'E2E Invoice Estimator')
    const office = await staffSession(browser, OFFICE, 'office', 'E2E Invoice Office')
    try {
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
      ).json()) as { rowVersion: number; workPackages: { id: string }[] }
      const saved = await estimator.write(
        'PUT',
        `/api/v1/staff/estimate-versions/${versionId}/draft`,
        {
          lines: [
            {
              kind: 'base',
              workPackageId: draft.workPackages[0]?.id,
              description: 'Synthetic: repaint the hallway',
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
            headers: { 'content-type': 'application/json', 'idempotency-key': `portal-${'i'.repeat(32)}` },
            body: JSON.stringify({
              contentDigest: detail.approval.contentDigest,
              options: [],
              totalCents: detail.totalCents,
              depositCents: detail.approval.selection?.deposit.amountCents ?? null,
              termsDocumentId: terms.documentId,
              termsSha256: terms.sha256,
              acceptTerms: true,
              fullName: 'Test Invoice Customer',
            }),
          })
          return res.status
        },
        {
          url: `/api/v1/customer/projects/${link.reference}/estimates/${number}/versions/1`,
          terms: { documentId: ESTIMATE_TERMS.documentId, sha256: ESTIMATE_TERMS.contentSha256 },
        },
      )
      expect(approved).toBe(201)
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
      // The deposit ($255.00) paid in cash and recorded by Office (the deposit panel has its own spec).
      await office.write('POST', `/api/v1/staff/jobs/${jobId}/deposit/payments`, {
        method: 'cash',
        amountCents: 25_500,
        receivedOn: today(),
      })

      // Office opens the job: the final invoice draft, prepared automatically from the approved scope.
      await office.page.goto(`/staff/payments/${jobId}`)
      const invoices = office.page.getByTestId('job-invoices')
      const final = invoices.getByTestId('invoice-final')
      await expect(async () => {
        await office.page.reload()
        await expect(final).toBeVisible({ timeout: 1000 })
      }).toPass({ timeout: 20_000 })
      await expect(final.getByRole('heading', { name: /Final invoice \(draft\)/ })).toBeVisible()
      await expect(final.getByTestId('invoice-line')).toHaveCount(1)
      await expect(final.getByTestId('invoice-line')).toContainText('Synthetic: repaint the hallway')
      await expect(final.getByTestId('invoice-total')).toHaveText('$1,275.00')
      await expect(final.getByTestId('invoice-deposit-credit')).toHaveText('-$255.00')
      // Issuing waits for the Owner's quality review (none is recorded): it says so, and there is no Issue button.
      await expect(final.getByTestId('invoice-blocking')).toContainText(
        "The Owner's quality review of this job is not decided yet, so a final invoice cannot be issued.",
      )
      await expect(final.getByTestId('invoice-notes')).toContainText(
        'No mailing address is configured: the invoice has no address line.',
      )
      await expect(final.getByRole('button', { name: 'Issue invoice' })).toHaveCount(0)
      await axe(office.page)
      const view = (await (await office.page.request.get(`/api/v1/staff/jobs/${jobId}/invoices`)).json()) as {
        final: { id: string; version: number }
      }
      const refused = await office.send('POST', `/api/v1/staff/invoices/${view.final.id}/issue`, {}, view.final.version)
      expect(refused.status()).toBe(409)
      expect(await refused.text()).toContain('QUALITY_REVIEW_NOT_RECORDED')

      // Once the review passes (the stand-in gate, this job only), Office issues it.
      await passQualityReview(databaseUrl as string, jobId)
      await office.page.reload()
      await final.getByRole('button', { name: 'Issue invoice' }).click()
      await expect(invoices.getByText("Invoice issued. The customer's notice goes out automatically.")).toBeVisible()
      const invoiceNumber = `${link.projectReference}-I1`
      await expect(final.getByRole('heading', { name: new RegExp(`Invoice ${invoiceNumber}`) })).toBeVisible()
      await expect(final.getByTestId('invoice-confirmed')).toHaveText('$0.00')
      await expect(final.getByTestId('invoice-pending')).toHaveText('$0.00')
      await expect(final.getByTestId('invoice-remaining')).toHaveText('$1,020.00')

      // A partial cash payment recorded on the invoice: confirmed apart from the remaining balance.
      const form = final.getByRole('form', { name: 'Record a payment on this invoice' })
      await form.getByLabel(/Amount received/).fill('20.00')
      await form.getByRole('button', { name: 'Record payment' }).click()
      await expect(final.getByTestId('invoice-confirmed')).toHaveText('$20.00')
      await expect(final.getByTestId('invoice-remaining')).toHaveText('$1,000.00')
      await expect(final.getByText('Partially paid')).toBeVisible()
      await axe(office.page)

      // TSK-0087 (HH-FIN-08, HH-FIN-09, T60): Office pastes the invoice's Square link (a non-Square link is refused),
      // records a verified Square payment once, and the same reference again is refused.
      const linkForm = final.getByRole('form', { name: 'Card payment link' })
      await linkForm.getByLabel(/Square payment link for this invoice/).fill('https://pay.example.test/synthetic')
      await linkForm.getByRole('button', { name: 'Save the link' }).click()
      await expect(invoices.getByRole('alert')).toBeVisible()
      await expect(final.getByTestId('invoice-payment-link')).toHaveCount(0)
      await linkForm.getByLabel(/Square payment link for this invoice/).fill('https://square.link/u/SYNTHE2E087')
      await linkForm.getByRole('button', { name: 'Save the link' }).click()
      await expect(final.getByTestId('invoice-payment-link').getByRole('link')).toHaveAttribute(
        'href',
        'https://square.link/u/SYNTHE2E087',
      )
      const squareRef = `SYNTH-SQ-${Date.now()}`
      for (const attempt of [1, 2]) {
        await form.getByLabel('Method').selectOption('square_payment_link')
        await form.getByLabel(/Amount received/).fill('100.00')
        await form.getByLabel(/Transaction reference/).fill(squareRef)
        await form.getByRole('button', { name: 'Record payment' }).click()
        if (attempt === 1) await expect(final.getByTestId('invoice-remaining')).toHaveText('$900.00')
      }
      await expect(invoices.getByText('A payment with this method and reference is already recorded.')).toBeVisible()
      await expect(final.getByTestId('invoice-remaining')).toHaveText('$900.00')

      // The customer's Documents tab: the invoice, current, with the balance still owed.
      await page.goto(`/portal/p/${link.reference}/documents`)
      const list = page.getByTestId('documents-invoices')
      await expect(list.getByText(`Invoice ${invoiceNumber}`, { exact: true })).toBeVisible()
      await expect(list.getByText('Current', { exact: true })).toBeVisible()
      // The PDF is rendered by a background job after the issue: the tab says it is being prepared until then, so
      // reload until the download is offered.
      const download = list.getByRole('button', { name: `Download invoice ${invoiceNumber} (PDF)` })
      await expect(async () => {
        if (!(await download.isVisible())) await page.reload()
        await expect(download).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 30_000 })
      await expect(list.getByTestId('documents-invoice-balance')).toHaveText('Balance due: $900.00')
      await axe(page)

      // TSK-0087 (HH-PORT-12, T60): the Payments tab matches the ledger, Pay by Card opens the staff-pasted link, and
      // coming back from Square's "success" page marks nothing paid.
      const payments = await withDb((db) =>
        db.selectFrom('finance.payments').select('id').where('job_id', '=', jobId).execute(),
      )
      await page.goto(`/portal/p/${link.reference}/payments?status=success&transactionId=SYNTH-RETURN`)
      const tab = page.getByTestId('payments-tab')
      await expect(tab.getByTestId('payments-balance')).toHaveText('$900.00')
      await expect(tab.getByTestId('payments-confirmed')).toHaveText('$375.00')
      await expect(tab.getByRole('link', { name: 'Pay by Card' })).toHaveAttribute(
        'href',
        'https://square.link/u/SYNTHE2E087',
      )
      await expect(tab.getByTestId('payments-placeholder')).toHaveCount(4)
      // TSK-0087 part 2: each confirmed payment has its receipt; the partial ones say so.
      await expect(tab.getByTestId('payments-receipt')).toHaveCount(3)
      await expect(tab.getByTestId('payments-receipt').last()).toContainText(
        'Partial payment: $900.00 still due after it.',
      )
      await expect(tab.getByText('Returning from the card payment page does not mark anything paid.')).toBeVisible()
      expect(
        await withDb((db) => db.selectFrom('finance.payments').select('id').where('job_id', '=', jobId).execute()),
      ).toHaveLength(payments.length)
      await axe(page)
      await page.goto(`/portal/p/${link.reference}/documents`)
      await page.setViewportSize({ width: 375, height: 740 })
      await expect(list.getByText(`Invoice ${invoiceNumber}`, { exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    } finally {
      await estimator.close()
      await office.close()
    }
  })
})
