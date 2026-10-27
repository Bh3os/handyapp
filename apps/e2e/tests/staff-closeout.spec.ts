// A job's closeout, the Owner's reopen and the follow-up after completion in a real browser (TSK-0092; HH-QA-09,
// HH-QA-10, T56, T64, T67, OWN-DEC-77, OWN-DEC-157, OWN-DEC-113).
// This spec's Estimator publishes an $800.00 estimate (no deposit) that its customer approves. A job reaches "Awaiting
// quality review" only through the worker's Finished (TSK-0083), which needs the whole checklist and photos, so the
// spec moves its job there directly, with its work package complete, in its own fresh e2e database, a test fixture
// (../quality-review.ts). The Owner's review passes, the final invoice is issued and paid in cash. Time passing is a
// fixture too: the review's pass is moved 49 hours back and the follow-up's preparation job made due now. Office
// releases the prepared follow-up and records the customer's answer; the review request stays unavailable without the
// customer's marketing permission. The Owner closes the job and reopens it with a reason. The page is scanned with
// axe. No estimate terms version is in effect for real customers: a synthetic "approved and attorney-reviewed" v1.0 is
// recorded for this run only and NOT CONFIGURED restored afterwards. Every visitor, account, name, reference and
// amount is synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createDb } from '@handyhub/db'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'
import { passSecondFactor } from '../mfa.js'
import { awaitQualityReview, followUpDue } from '../quality-review.js'
import { verifyPropertyZone } from '../zones.js'
import { expectAccessible } from '../a11y.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.192' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const ESTIMATOR = 'e2e-closeout-estimator@example.test'
const OFFICE = 'e2e-closeout-office@example.test'
// The Owner every spec shares (staff-auth.spec.ts creates it; whichever spec runs first does here).
const OWNER = 'e2e-owner@example.test'
const pw = ['synthetic', 'staff', 'closeout', 'passphrase', '92'].join(' ')

async function axe(page: Page) {
  await expectAccessible(page)
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-closeout' })
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
    headers: { 'idempotency-key': `synthetic-e2e-closeout-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-PT-01' }],
      notSure: false,
      description: 'Synthetic closeout project: repaint a hallway.',
      property: {
        street: '192 Synthetic Closeout Court',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Test Closeout Customer',
        email: `closeout-e2e-${Date.now()}@example.test`,
        phone: '(502) 555-0192',
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
async function staffSession(browser: Browser, email: string, role: 'estimator' | 'owner' | 'office', name: string) {
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
      .values({ staff_user_id: user.id, kind: 'role', name: role, issued_by: 'e2e:closeout', reason: null })
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
        'idempotency-key': `e2e-closeout-${role}-${Date.now()}-${++k}`,
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

test.describe("A job's closeout, the Owner's reopen and the follow-up (TSK-0092)", () => {
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

  test('[HH-QA-09][HH-QA-10][T56][T64][T67] the follow-up is released, the Owner closes and reopens the job', async ({
    page,
    request,
    browser,
  }) => {
    const link = await sendRequest(request)
    const estimator = await staffSession(browser, ESTIMATOR, 'estimator', 'E2E Closeout Estimator')
    const owner = await staffSession(browser, OWNER, 'owner', 'E2E Owner')
    const office = await staffSession(browser, OFFICE, 'office', 'E2E Closeout Office')
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
            headers: { 'content-type': 'application/json', 'idempotency-key': `portal-${'c'.repeat(32)}` },
            body: JSON.stringify({
              contentDigest: detail.approval.contentDigest,
              options: [],
              totalCents: detail.totalCents,
              depositCents: detail.approval.selection?.deposit.amountCents ?? null,
              termsDocumentId: terms.documentId,
              termsSha256: terms.sha256,
              acceptTerms: true,
              fullName: 'Test Closeout Customer',
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
      // The worker's Finished (walked by completion.test.ts): the job awaits quality review (see the header).
      await awaitQualityReview(databaseUrl as string, jobId, { workPackagesComplete: true })
      await owner.write('POST', `/api/v1/staff/jobs/${jobId}/invoices/final-draft`, {})
      // The Owner's review passes (its own screen is walked by staff-quality-review.spec.ts).
      await owner.write('POST', `/api/v1/staff/jobs/${jobId}/quality-review/actions/start`, {})
      const review = (await (await owner.page.request.get(`/api/v1/staff/jobs/${jobId}/quality-review`)).json()) as {
        review: { version: number }
      }
      await owner.write(
        'POST',
        `/api/v1/staff/jobs/${jobId}/quality-review/actions/decide`,
        { results: { scope: 'ok', checklist: 'ok', evidence: 'ok', walkthrough: 'ok' } },
        review.review.version,
      )

      // Operationally complete, not closed: the closeout names the unissued final invoice.
      const o = owner.page
      await o.goto(`/staff/closeout/${jobId}`)
      const closeout = o.getByTestId('closeout')
      await expect(
        closeout.getByRole('heading', { level: 1, name: `Closeout of project ${link.projectReference}` }),
      ).toBeVisible()
      await expect(closeout.getByText('Operationally complete', { exact: true })).toBeVisible()
      await expect(closeout.getByTestId('closeout-obligations')).toContainText('The final invoice is not issued.')
      await closeout.getByRole('button', { name: 'Close this job' }).click()
      await expect(o.getByRole('alert')).toHaveText('The final invoice is not issued.')

      // Issued and paid in cash: nothing is left open.
      const invoices = (await (await o.request.get(`/api/v1/staff/jobs/${jobId}/invoices`)).json()) as {
        final: { id: string; version: number }
      }
      await owner.write('POST', `/api/v1/staff/invoices/${invoices.final.id}/issue`, {}, invoices.final.version)
      await office.write('POST', `/api/v1/staff/invoices/${invoices.final.id}/payments`, {
        method: 'cash',
        amountCents: 80_000,
        receivedOn: today(),
      })

      // 48 hours later (see the header): the follow-up is prepared for staff release.
      await followUpDue(databaseUrl as string, jobId)
      const f = office.page
      await f.goto(`/staff/closeout/${jobId}`)
      const followUps = f.getByTestId('follow-ups')
      await expect(async () => {
        await f.reload()
        await expect(f.getByTestId('follow-up')).toHaveCount(1, { timeout: 1_000 })
      }).toPass({ timeout: 20_000 })
      await expect(f.getByTestId('follow-up')).toContainText('Follow-up after completion')
      await expect(followUps).toContainText(
        "The follow-up after completion is prepared 2 days after the Owner's quality review passed",
      )
      // Office never closes or reopens the job.
      await expect(f.getByRole('button', { name: 'Close this job' })).toHaveCount(0)
      await axe(f)
      await f.getByRole('button', { name: 'Send: Follow-up after completion' }).click()
      await expect(f.getByText('Released. It is checked again just before it goes.')).toBeVisible()
      // The customer's answer, as staff record it; a low one changes nothing about review requests, which need the
      // customer's marketing permission (none here).
      await followUps.getByLabel('Answer', { exact: true }).selectOption('negative')
      await followUps.getByRole('button', { name: 'Record the answer' }).click()
      await expect(f.getByText('Answer recorded.')).toBeVisible()
      await expect(f.getByTestId('satisfaction-responses')).toContainText('Negative')
      await expect(f.getByTestId('review-blocked')).toHaveText(
        'No review request now: the customer has not given marketing permission.',
      )

      // The Owner closes the job, then reopens it with a reason.
      await o.reload()
      await expect(closeout.getByTestId('closeout-ready')).toHaveText('Nothing is left open. The job may be closed.')
      await closeout.getByRole('button', { name: 'Close this job' }).click()
      await expect(o.getByText('The job is closed.', { exact: true })).toBeVisible()
      await expect(closeout.getByTestId('closeout-history')).toContainText('Closed · final invoice paid')
      await closeout.getByLabel('Reason', { exact: true }).fill('Synthetic: closed by mistake')
      await closeout.getByRole('button', { name: 'Reopen this job' }).click()
      // A fresh sign-in is asked for when the Owner's last one is not recent.
      const prompt = o.getByTestId('owner-reauth')
      const reopened = o.getByText('The job is reopened.', { exact: true })
      await expect(prompt.or(reopened)).toBeVisible()
      if (await prompt.isVisible()) {
        await prompt.getByLabel('Password').fill(pw)
        await prompt.getByRole('button', { name: 'Confirm password' }).click()
      }
      await expect(reopened).toBeVisible()
      await expect(closeout.getByText('Reopened', { exact: true }).first()).toBeVisible()
      await expect(closeout.getByTestId('closeout-history')).toContainText('Synthetic: closed by mistake')
      await axe(o)
    } finally {
      await estimator.close()
      await owner.close()
      await office.close()
    }
  })
})
