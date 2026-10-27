// A discount requested on the request form and verified by staff, in a real browser (TSK-0125; HH-EST-15, T31,
// OWN-DEC-165, OWN-DEC-145, FACT-PRICING-DISCOUNTS, FACT-DEPOSIT-RULE). A guest asks for the military discount in the
// wizard; an Estimator of this spec publishes an estimate carrying it (staff API); the customer sees it pending
// verification and cannot approve; the Estimator records "Verified" on the request's record; the customer approves the
// discounted total, and the deposit is computed on it. The checkbox alone never approves.
// No estimate terms version is approved for real customers (approval answers NOT CONFIGURED everywhere). To exercise
// approval, this spec records a synthetic "approved and attorney-reviewed" v1.0 for its own run only and restores NOT
// CONFIGURED afterwards: a test fixture, never the owner's sign-off. Every visitor, address, account, name and amount
// is synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'
import { passSecondFactor } from '../mfa.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.125' }
test.use({ extraHTTPHeaders: HEADERS })
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const ESTIMATOR = 'e2e-discount-estimator@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'discount', 'verification', 'passphrase', '125'].join(' ')

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-discount-requests' })
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

/** The latest code sent for a subject, as the delivery job would derive it. */
/** The newest code for the subject; the click that sends it returns before the row is written, so wait for it. */
async function latestCode(subject: string) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = await withDb((db) =>
      db
        .selectFrom('identity.verification_codes')
        .select(['id', 'nonce'])
        .where('subject_ref', '=', subject)
        .orderBy('created_at', 'desc')
        .limit(1)
        .executeTakeFirst(),
    )
    if (code) return code
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`no verification code for ${subject}`)
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
      .values({ email: ESTIMATOR, display_name: 'E2E Discount Estimator', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: 'estimator', issued_by: 'e2e:discount', reason: null })
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
        'idempotency-key': `e2e-discount-${Date.now()}-${++k}`,
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

/** The wizard to its review, asking for the military discount on the contact step. */
async function sendWithDiscount(page: Page): Promise<string> {
  await page.goto('/request')
  await page.evaluate(() => window.localStorage.clear())
  await page.goto('/request')
  await page.getByRole('button', { name: 'Continue as Guest' }).click()
  await page.getByLabel('Not sure what service I need').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Project description').fill('Synthetic project: patch a small wall dent.')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Street address').fill('125 Synthetic Discount Lane')
  await page.getByLabel('City').fill('Testville')
  await page.getByLabel('State').fill('KY')
  await page.getByLabel('ZIP').fill('40000')
  await page.getByLabel('House', { exact: true }).check()
  await page.getByLabel('Preferred date').fill(future)
  await page.getByLabel('Mornings').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { name: 'Step 4 of 5: Contact' })).toBeVisible()
  await page.getByLabel('Full name').fill('Test Discount Customer')
  await page.getByRole('textbox', { name: /^Email/ }).fill(`discount-e2e-${Date.now()}@example.test`)
  await page.getByRole('textbox', { name: /^Phone/ }).fill('(502) 555-0125')
  await page.getByLabel('Email', { exact: true }).check()
  await page.getByLabel('Online Estimate', { exact: true }).check()

  // One discount, with what each needs from configuration; none is chosen by default.
  const group = page.getByRole('group', { name: 'Discount (optional)' })
  await expect(
    group.getByText(/^HandyHub offers a 10% discount for military members, seniors and returning/),
  ).toBeVisible()
  await expect(group.getByText(/Only one 10% discount applies per job/)).toBeVisible()
  await expect(group.getByLabel('No discount')).toBeChecked()
  await expect(group.getByLabel('Senior: 60 or older')).toBeVisible()
  await expect(group.getByLabel('Returning customer: a completed HandyHub job in the last 12 months')).toBeVisible()
  await expect(group.getByText(/we never photograph, copy or keep it/)).toBeVisible()
  await expect(group.getByRole('radio')).toHaveCount(4)
  await group.getByLabel('Military: service members, veterans and military spouses').check()
  await axe(page)

  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { name: 'Step 5 of 5: Review and send' })).toBeVisible()
  const review = page.getByRole('region', { name: 'Contact' })
  await expect(review.getByText('Discount requested')).toBeVisible()
  await expect(review.getByText('Military (pending verification)')).toBeVisible()
  await page.getByRole('button', { name: 'Send Estimate Request' }).click()
  await expect(page.getByRole('heading', { name: 'Your request is in.' })).toBeFocused()
  return ((await page.getByText(/^Request reference: /).textContent()) ?? '').replace('Request reference: ', '')
}

test.describe('a requested discount is verified by staff before approval (TSK-0125)', () => {
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

  test('[HH-EST-15][T31] asked on the form, provisional on the estimate, verified on the record, then approved once', async ({
    page,
    browser,
  }) => {
    const reference = await sendWithDiscount(page)
    const row = await withDb((db) =>
      db
        .selectFrom('intake.requests as r')
        .innerJoin('identity.project_access_grants as g', 'g.request_id', 'r.id')
        .innerJoin('estimating.discount_requests as d', 'd.request_id', 'r.id')
        .select(['r.id as request_id', 'r.project_id', 'g.id', 'g.nonce', 'd.category'])
        .where('r.reference', '=', reference)
        .executeTakeFirstOrThrow(),
    )
    expect(row.category).toBe('military')

    const estimator = await estimatorSession(browser)
    try {
      // The Estimator publishes $1,500.00 with the requested discount: $150.00 off, $1,350.00, deposit $270.00.
      await estimator.write('PUT', `/api/v1/staff/requests/${row.request_id}/qualification`, { checks: CHECKS }, 0)
      const detail = (await (await estimator.page.request.get(`/api/v1/staff/requests/${row.request_id}`)).json()) as {
        version: number
      }
      await estimator.write(
        'POST',
        `/api/v1/staff/requests/${row.request_id}/actions/online-estimate`,
        { workPackages: ['SVC-DW-01'] },
        detail.version,
      )
      const created = await estimator.write('POST', `/api/v1/staff/projects/${row.project_id}/estimates`, {})
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
              description: 'Synthetic: repair the wall dent',
              quantity: '1',
              unit: 'job',
              unitPriceCents: 150_000,
            },
          ],
          texts: { exclusions: ['Synthetic: furniture moving'] },
          discountCategory: 'military',
        },
        draft.rowVersion,
      )
      await estimator.write(
        'POST',
        `/api/v1/staff/estimate-versions/${versionId}/publish`,
        {},
        saved['rowVersion'] as number,
      )

      // The customer opens the project: the discount row is pending verification and approval waits for it.
      const token = accessTokenFor({ id: row.id, nonce: row.nonce })
      await page.goto(`/access#${token}`)
      await page.getByRole('button', { name: 'Open', exact: true }).click()
      await page.getByRole('button', { name: 'Email me a code' }).click()
      await page.getByLabel('Code').fill(codeFor(await latestCode(`grant:${row.id}:email`)))
      await page.getByRole('button', { name: 'Open my project' }).click()
      await expect(page.getByRole('heading', { name: 'Your project', exact: true })).toBeVisible()
      await page.goto(`/portal/p/${reference}/documents/${number}/1`)
      const view = page.getByTestId('estimate-view')
      const totals = view.getByTestId('estimate-totals')
      await expect(totals.getByText('Discount (military) -10%')).toBeVisible()
      await expect(totals.getByText('Pending verification')).toBeVisible()
      await expect(totals.getByText('$1,350.00')).toBeVisible()
      await expect(view.getByTestId('estimate-reduction-pending')).toContainText('ask for an owner review')
      await expect(
        view.getByText(
          'The discount on this estimate is pending verification. You can approve the estimate once it is confirmed.',
        ),
      ).toBeVisible()
      await expect(view.getByRole('button', { name: 'Approve Estimate' })).toHaveCount(0)
      await axe(page)

      // The Estimator records the result on the request's record: category, result, who and when, nothing else.
      await estimator.page.goto(`/staff/requests/${row.request_id}`)
      const panel = estimator.page.getByTestId('request-discount')
      await expect(panel).toContainText(
        'Military (service members, veterans and military spouses with their documentation)',
      )
      await expect(panel.getByText('Pending verification', { exact: true })).toBeVisible()
      await expect(panel.getByText(/Never photograph, scan, copy or upload it/)).toBeVisible()
      await expect(panel.getByRole('textbox')).toHaveCount(0)
      await axe(estimator.page)
      await panel.getByRole('button', { name: 'Verified', exact: true }).click()
      await expect(panel.getByText('Recorded.')).toBeVisible()
      await expect(panel.getByTestId('discount-verifications')).toContainText('E2E Discount Estimator')
      await expect(panel.getByRole('button', { name: 'Verified', exact: true })).toHaveCount(0)
      const verifications = await withDb((db) =>
        db
          .selectFrom('estimating.discount_verifications')
          .select(['category', 'result'])
          .where('project_id', '=', row.project_id)
          .execute(),
      )
      expect(verifications).toEqual([{ category: 'military', result: 'verified' }])

      // The customer approves the discounted total; the deposit is 20% of it (FACT-DEPOSIT-RULE).
      await page.reload()
      await expect(totals.getByText('Pending verification')).toHaveCount(0)
      const approval = view.getByTestId('estimate-approval')
      await approval.getByRole('checkbox', { name: 'I have read and accept the estimate terms' }).check()
      await approval.getByLabel('Your full name', { exact: true }).fill('Test Discount Customer')
      const answer = page.waitForResponse((r) => r.url().endsWith('/approve') && r.request().method() === 'POST')
      await approval.getByRole('button', { name: 'Approve Estimate' }).click()
      expect((await answer).status()).toBe(201)
      await expect(view.getByText('Version 1: Approved')).toBeVisible()
      const stored = await withDb((db) =>
        db
          .selectFrom('estimating.approvals')
          .select(['total_cents', 'discount_cents', 'deposit_cents'])
          .where('project_id', '=', row.project_id)
          .executeTakeFirstOrThrow(),
      )
      expect(stored).toEqual({ total_cents: '135000', discount_cents: '15000', deposit_cents: '27000' })

      // Once approved, the record says the price is fixed and offers nothing more.
      await estimator.page.reload()
      await expect(panel.getByText(/Its price is fixed/)).toBeVisible()
      await expect(panel.getByRole('button')).toHaveCount(0)
    } finally {
      await estimator.close()
    }
  })
})
