// Return work of a case in a real browser (TSK-0094; HH-QA-07, HH-QA-08, HH-FIN-17, T56, FACT-WARRANTY, OWN-DEC-135,
// RULE-HUMAN-REVIEW, RULE-MONEY-CENTS).
// This spec's Estimator publishes an $800.00 estimate (no deposit) that its customer approves. A job reaches "Awaiting
// quality review" only through the worker's Finished (TSK-0083), which needs the whole checklist and photos, so the
// spec moves its job there directly in its own fresh e2e database, a test fixture (../quality-review.ts); the Owner's
// review itself passes through the real routes. The customer then reports that a seam opened, and the Owner records
// the complaint. On the case page the Owner classifies the return work (a workmanship problem the same day is a
// warranty claim under the 90-day window), records the coverage and price decision with a note and no amount, adds a
// return-visit punch item for the spec's synthetic worker (an active staff record that never signs in) and a cost in
// cents. The page is scanned with axe. No estimate terms version is in effect for real customers: a synthetic
// "approved and attorney-reviewed" v1.0 is recorded for this run only and NOT CONFIGURED restored afterwards, a test
// fixture and never the owner's sign-off. Every visitor, account, name, reference and amount is synthetic
// (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'
import { passSecondFactor } from '../mfa.js'
import { awaitQualityReview } from '../quality-review.js'
import { verifyPropertyZone } from '../zones.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.194' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const ESTIMATOR = 'e2e-return-estimator@example.test'
// The Owner every spec shares (staff-auth.spec.ts creates it; whichever spec runs first does here).
const OWNER = 'e2e-owner@example.test'
const WORKER = 'e2e-return-worker@example.test'
const pw = ['synthetic', 'staff', 'return', 'work', 'passphrase', '94'].join(' ')

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-return-work' })
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
    headers: { 'idempotency-key': `synthetic-e2e-return-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-PT-01' }],
      notSure: false,
      description: 'Synthetic return work project: repaint a hallway.',
      property: {
        street: '194 Synthetic Return Court',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Test Return Customer',
        email: `return-e2e-${Date.now()}@example.test`,
        phone: '(502) 555-0194',
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
      .values({ staff_user_id: user.id, kind: 'role', name: role, issued_by: 'e2e:return-work', reason: null })
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
        'idempotency-key': `e2e-return-${role}-${Date.now()}-${++k}`,
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

test.describe('Return work of a case (TSK-0094)', () => {
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

  test('[HH-QA-07][HH-QA-08][T56][FACT-WARRANTY] the Owner classifies a warranty claim, decides it and plans its punch work', async ({
    page,
    request,
    browser,
  }) => {
    const link = await sendRequest(request)
    const estimator = await staffSession(browser, ESTIMATOR, 'estimator', 'E2E Return Estimator')
    const owner = await staffSession(browser, OWNER, 'owner', 'E2E Owner')
    // The worker who will correct the item: an active synthetic staff record that never signs in.
    await withDb(async (db) => {
      const user = await db
        .insertInto('identity.staff_users')
        .values({
          email: WORKER,
          display_name: 'E2E Return Worker',
          locale: 'en',
          status: 'active',
          activated_at: new Date(),
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      await db
        .insertInto('identity.role_grants')
        .values({ staff_user_id: user.id, kind: 'role', name: 'worker', issued_by: 'e2e:return-work', reason: null })
        .execute()
    })
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
              unitPriceCents: 80_000,
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
            headers: { 'content-type': 'application/json', 'idempotency-key': `portal-${'r'.repeat(32)}` },
            body: JSON.stringify({
              contentDigest: detail.approval.contentDigest,
              options: [],
              totalCents: detail.totalCents,
              depositCents: detail.approval.selection?.deposit.amountCents ?? null,
              termsDocumentId: terms.documentId,
              termsSha256: terms.sha256,
              acceptTerms: true,
              fullName: 'Test Return Customer',
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
      // The worker's Finished (walked by completion.test.ts): the job awaits quality review (see the header); the
      // Owner's review passes through the real routes, so the job is operationally complete, reviewed today.
      await awaitQualityReview(databaseUrl as string, jobId)
      const started = await owner.write('POST', `/api/v1/staff/jobs/${jobId}/quality-review/actions/start`, {})
      const passed = await owner.write(
        'POST',
        `/api/v1/staff/jobs/${jobId}/quality-review/actions/decide`,
        { results: { scope: 'ok', checklist: 'ok', evidence: 'ok', walkthrough: 'ok' } },
        started['version'] as number,
      )
      expect(passed['jobState']).toBe('operationally_complete')
      const ownerId = await withDb(
        async (db) =>
          (
            await db
              .selectFrom('identity.staff_users')
              .select('id')
              .where('email', '=', OWNER)
              .executeTakeFirstOrThrow()
          ).id,
      )
      const complaint = await owner.write('POST', `/api/v1/staff/projects/${link.projectId}/complaints`, {
        category: 'work_quality',
        severity: 'moderate',
        source: 'call',
        assignedTo: ownerId,
        dueOn: today(),
        description: 'Synthetic: the customer says a seam opened in the hallway.',
        jobId,
      })

      const o = owner.page
      await o.goto(`/staff/cases/${complaint['caseId'] as string}`)
      const section = o.getByTestId('return-work')
      await expect(section.getByRole('heading', { level: 2, name: 'Return work' })).toBeVisible()
      await expect(section.getByTestId('return-work-window')).toContainText(`Reported ${today()}, within 90 days`)
      await expect(section.getByText('Not classified yet.', { exact: true })).toBeVisible()
      await expect(section.getByText(/Nothing here applies coverage or an exclusion by itself/)).toBeVisible()

      // A workmanship problem inside the window is recorded as a warranty claim.
      const classify = section.getByRole('form', { name: 'Classify the return work' })
      await classify.getByLabel('Classification').selectOption('workmanship_callback')
      await classify.getByRole('button', { name: 'Classify' }).click()
      await expect(section.getByTestId('return-work-class')).toHaveText('Warranty claim')
      await expect(section.getByTestId('return-work-decision')).toHaveText('Not decided yet.')

      // The Owner's decision: coverage and price with a note; no amount field exists.
      const decide = section.getByRole('form', { name: "Owner's decision" })
      await decide.getByLabel('Coverage').selectOption('covered')
      await decide.getByLabel('Price').selectOption('no_charge')
      await decide.getByLabel('Why (your note)').fill('Synthetic: the Owner decided after reading the case.')
      await decide.getByRole('button', { name: 'Record the decision' }).click()
      await expect(section.getByTestId('return-work-decision')).toContainText('Covered · No charge')

      // A return-visit punch item for the worker, and a cost in cents.
      const items = section.getByTestId('return-work-items')
      await items.getByLabel('Area').fill('Hallway')
      await items.getByLabel('What to correct').fill('Synthetic: re-tape the opened seam')
      await items.getByLabel('Required correction evidence').fill('Synthetic: a note of what was done')
      await items.getByLabel('Worker').selectOption({ label: 'E2E Return Worker' })
      await items.getByLabel('Due date').fill(today())
      await items.getByRole('button', { name: 'Add punch item' }).click()
      await expect(items.getByTestId('return-work-item')).toHaveCount(1)
      await expect(items.getByTestId('return-work-item')).toContainText('Open')
      const costs = section.getByTestId('return-work-costs')
      await costs.getByLabel('Amount (USD)').fill('12.50')
      await costs.getByLabel('What it was').fill('Synthetic: joint tape')
      await costs.getByRole('button', { name: 'Record cost' }).click()
      await expect(costs.getByTestId('return-work-totals')).toContainText('Costs recorded: $12.50')
      await expect(section).toContainText('Labor cost is incomplete')
      // The original job is untouched: still operationally complete.
      await expect(section.getByTestId('return-work-original')).toContainText('Operationally complete')
      await axe(o)
    } finally {
      await estimator.close()
      await owner.close()
    }
  })
})
