// A job's estimated versus actual costs in a real browser (TSK-0095; HH-FIN-17, HH-DATA-10, T73, OWN-DEC-189,
// RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS).
// This spec's Estimator publishes a $600.00 estimate (no deposit) whose line carries an internal material cost of
// $200.00 and a labor cost of $300.00, and its customer approves it. The Owner opens the job's costs: the estimate is
// read from the approved version; nothing actual is recorded, so every actual figure says not recorded or not
// configured (labor and burden need rates nobody entered), never $0.00, and the page states its sources. The
// Owner records a materials cost in cents (incomplete until confirmed) and confirms the category (final), and the
// actual total stays incomplete. The page is scanned with axe. No estimate terms version is in effect for real
// customers: a synthetic "approved and attorney-reviewed" v1.0 is recorded for this run only and NOT CONFIGURED
// restored afterwards, a test fixture and never the owner's sign-off. Every visitor, account, name, reference and
// amount is synthetic (RULE-SYNTHETIC-DATA). Assertions read this spec's own job only.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'
import { passSecondFactor } from '../mfa.js'
import { verifyPropertyZone } from '../zones.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.195' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const ESTIMATOR = 'e2e-cost-estimator@example.test'
// The Owner every spec shares (staff-auth.spec.ts creates it; whichever spec runs first does here).
const OWNER = 'e2e-owner@example.test'
const pw = ['synthetic', 'staff', 'job', 'cost', 'passphrase', '95'].join(' ')

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-job-costs' })
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
    headers: { 'idempotency-key': `synthetic-e2e-cost-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-PT-01' }],
      notSure: false,
      description: 'Synthetic job cost project: repaint a bedroom.',
      property: {
        street: '195 Synthetic Cost Court',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Test Cost Customer',
        email: `cost-e2e-${Date.now()}@example.test`,
        phone: '(502) 555-0195',
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

/** A staff account of this spec's own, signed in through the staff app in its own browser. */
async function staffSession(browser: Browser, email: string, role: 'estimator' | 'owner', name: string) {
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
      .values({ staff_user_id: user.id, kind: 'role', name: role, issued_by: 'e2e:job-costs', reason: null })
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
        'idempotency-key': `e2e-cost-${role}-${Date.now()}-${++k}`,
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

test.describe('Estimated versus actual job costs (TSK-0095)', () => {
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
  })

  test('[HH-FIN-17][HH-DATA-10][T73] missing cost shows incomplete, never $0.00, and the Owner records and confirms costs', async ({
    page,
    request,
    browser,
  }) => {
    const link = await sendRequest(request)
    const estimator = await staffSession(browser, ESTIMATOR, 'estimator', 'E2E Cost Estimator')
    const owner = await staffSession(browser, OWNER, 'owner', 'E2E Owner')
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
              description: 'Synthetic: repaint the bedroom',
              quantity: '1',
              unit: 'room',
              unitPriceCents: 60_000,
              internalCost: { materialCostCents: 20_000, laborCostCents: 30_000 },
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
            headers: { 'content-type': 'application/json', 'idempotency-key': `portal-${'c'.repeat(32)}` },
            body: JSON.stringify({
              contentDigest: detail.approval.contentDigest,
              options: [],
              totalCents: detail.totalCents,
              depositCents: detail.approval.selection?.deposit.amountCents ?? null,
              termsDocumentId: terms.documentId,
              termsSha256: terms.sha256,
              acceptTerms: true,
              fullName: 'Test Cost Customer',
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

      // The Estimator never reads the job's costs (PROPOSED: the Owner only).
      expect((await estimator.page.request.get(`/api/v1/staff/jobs/${jobId}/costs`)).status()).toBe(403)

      const o = owner.page
      await o.goto(`/staff/job-costs/${jobId}`)
      const costs = o.getByTestId('job-costs')
      await expect(costs.getByRole('heading', { level: 1, name: `Job costs: ${link.projectReference}` })).toBeVisible()
      await expect(costs.getByTestId('job-costs-sources')).toContainText('not revenue or money received')
      const row = (line: string) => costs.getByTestId(`job-cost-line-${line}`)
      await expect(row('materials')).toContainText('$200.00')
      await expect(row('materials')).toContainText('Not recorded')
      await expect(row('labor')).toContainText('$300.00')
      await expect(row('labor')).toContainText('Not configured')
      await expect(row('burden')).toContainText('Not configured')
      await expect(row('rental')).toContainText('Not estimated')
      await expect(costs.getByTestId('job-costs-table')).not.toContainText('$0.00')
      await expect(costs.getByTestId('job-cost-total')).toContainText('$500.00')
      await expect(costs.getByTestId('job-cost-total')).toContainText('Not recorded')
      // TSK-0131: no labor cost rate is entered for anyone on this job, so labor stays NOT CONFIGURED.
      await expect(costs.getByText(/stays incomplete until the job is operationally complete/)).toBeVisible()
      await axe(o)

      // A materials cost in cents: incomplete until the Owner confirms the category.
      const form = costs.getByRole('form', { name: 'Record a cost' })
      await form.getByLabel('Category').selectOption('materials')
      await form.getByLabel('Amount (USD)').fill('123.45')
      await form.getByLabel('Date incurred').fill(today())
      await form.getByLabel('What it was').fill('Synthetic: primer and paint')
      await form.getByRole('button', { name: 'Record cost' }).click()
      await expect(row('materials')).toContainText('$123.45 so far (incomplete)')
      await expect(costs.getByTestId('job-cost-entry')).toHaveCount(1)
      await costs.getByRole('button', { name: 'Confirm Materials' }).click()
      await expect(row('materials')).toContainText('Confirmed by E2E Owner')
      await expect(row('materials')).not.toContainText('so far')
      await expect(row('materials')).not.toContainText('Not available')
      // Labor cost and burden stay NOT CONFIGURED, so the actual total is still incomplete.
      await expect(costs.getByTestId('job-cost-total')).toContainText('$123.45 so far (incomplete)')
      await expect(costs.getByTestId('job-costs-incomplete')).toContainText('Labor')
      await expect(costs.getByRole('button', { name: 'Reopen Materials' })).toBeVisible()
      await axe(o)
    } finally {
      await estimator.close()
      await owner.close()
    }
  })
})
