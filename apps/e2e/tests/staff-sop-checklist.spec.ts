// The SOP version pinned on each work package of a job, in a real browser (TSK-0068; HH-PKT-03, HH-WORK-11, T43,
// OWN-DEC-17, OWN-DEC-108). The e2e set-up imports the SOP versions of every service but SVC-HI-06
// (fixtures/services.mjs), so this spec's job has one work package with its pinned SOP (DW-01) and one that is NOT
// CONFIGURED (HI-06). An Estimator of this spec publishes the estimate through the staff API and the customer approves it
// through the customer API after opening the project with the link and a code; the Estimator then opens the request
// record. No estimate terms version is recorded by the migrations: this spec records a synthetic "approved and
// attorney-reviewed" v1.0 for its own run only and restores NOT CONFIGURED afterwards (a test fixture, never the owner's
// sign-off). Every visitor, address, account, name and amount is synthetic (RULE-SYNTHETIC-DATA).
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
const HEADERS = { 'x-forwarded-for': '198.51.100.168' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const ESTIMATOR = 'e2e-sop-checklist-estimator@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'sop', 'checklist', 'passphrase', '68'].join(' ')

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-sop-checklist' })
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

/** A request for DW-01 and HI-06 sent through the API: its reference, IDs and link. */
async function sendRequest(request: APIRequestContext) {
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `synthetic-e2e-sop-checklist-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }, { serviceId: 'SVC-HI-06' }],
      notSure: false,
      description: 'Synthetic checklist project: a wall patch and the gutters.',
      property: {
        street: '168 Synthetic Checklist Court',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Test Checklist Customer',
        email: `sop-checklist-e2e-${Date.now()}@example.test`,
        phone: '(502) 555-0168',
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

/** Opens the link and enters the emailed code: the customer's session is verified and fresh. */
async function openProject(page: Page, link: { token: string; grantId: string; reference: string }) {
  await page.goto(`/access#${link.token}`)
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await expect(page.getByLabel('Code')).toBeFocused()
  await page.getByLabel('Code').fill(codeFor(await latestCode(`grant:${link.grantId}:email`)))
  await page.getByRole('button', { name: 'Open my project' }).click()
  await expect(page.getByRole('heading', { name: 'Your project', exact: true })).toBeVisible()
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
      .values({ email: ESTIMATOR, display_name: 'E2E Checklist Estimator', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: 'estimator', issued_by: 'e2e:sop-checklist', reason: null })
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
        'idempotency-key': `e2e-sop-checklist-${Date.now()}-${++k}`,
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

test.describe('SOP versions pinned per work package (TSK-0068)', () => {
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

  test('[HH-PKT-03][HH-WORK-11][T43] the job pins the exact SOP per package; NOT CONFIGURED shows no checklist', async ({
    page,
    request,
    browser,
  }) => {
    const link = await sendRequest(request)
    const estimator = await estimatorSession(browser)
    try {
      await estimator.write('PUT', `/api/v1/staff/requests/${link.requestId}/qualification`, { checks: CHECKS }, 0)
      const detail = (await (await estimator.page.request.get(`/api/v1/staff/requests/${link.requestId}`)).json()) as {
        version: number
      }
      await estimator.write(
        'POST',
        `/api/v1/staff/requests/${link.requestId}/actions/online-estimate`,
        { workPackages: ['SVC-DW-01', 'SVC-HI-06'] },
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
              description: 'Synthetic: patch the wall',
              quantity: '1',
              unit: 'job',
              unitPriceCents: 32_500,
            },
            {
              kind: 'base',
              workPackageId: draft.workPackages[1]?.id,
              description: 'Synthetic: clear the gutters',
              quantity: '1',
              unit: 'job',
              unitPriceCents: 21_000,
            },
          ],
          texts: { exclusions: ['Synthetic: roof repairs'] },
        },
        draft.rowVersion,
      )
      await estimator.write(
        'POST',
        `/api/v1/staff/estimate-versions/${versionId}/publish`,
        {},
        saved['rowVersion'] as number,
      )

      // The customer opens the project with a fresh code and approves the exact published version.
      await openProject(page, link)
      const url = `/api/v1/customer/projects/${link.reference}/estimates/${number}/versions/1`
      // Same-origin calls from the customer's own page, with the session the code just verified.
      const approved = await page.evaluate(
        async ({ url, terms, key }) => {
          const got = await fetch(url, { credentials: 'same-origin' })
          if (got.status !== 200) return { step: 'view', status: got.status, body: await got.text() }
          const shown = (await got.json()) as {
            approval: {
              contentDigest: string
              selection: { totalCents: number; deposit: { amountCents: number | null } }
            }
          }
          const res = await fetch(`${url}/approve`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json', 'idempotency-key': key },
            body: JSON.stringify({
              contentDigest: shown.approval.contentDigest,
              options: [],
              totalCents: shown.approval.selection.totalCents,
              depositCents: shown.approval.selection.deposit.amountCents,
              termsDocumentId: terms.documentId,
              termsSha256: terms.sha256,
              acceptTerms: true,
              fullName: 'Test Checklist Customer',
            }),
          })
          return { step: 'approve', status: res.status, body: await res.text() }
        },
        {
          url,
          terms: { documentId: ESTIMATE_TERMS.documentId, sha256: ESTIMATE_TERMS.contentSha256 },
          key: `e2e-sop-checklist-approve-${Date.now()}`,
        },
      )
      expect(approved, JSON.stringify(approved)).toMatchObject({ step: 'approve', status: 201 })

      // The database holds the exact pin for DW-01 and the NOT CONFIGURED record for HI-06.
      const pins = await withDb((db) =>
        db
          .selectFrom('work.work_package_sop_pins as p')
          .leftJoin('catalog.sop_versions as v', 'v.id', 'p.sop_version_id')
          .select(['p.service_id', 'p.outcome', 'p.source', 'v.sop_id', 'v.version'])
          .where('p.project_id', '=', link.projectId)
          .orderBy('p.service_id')
          .execute(),
      )
      expect(pins).toEqual([
        { service_id: 'SVC-DW-01', outcome: 'pinned', source: 'approval', sop_id: 'SOP-DW-01', version: 1 },
        { service_id: 'SVC-HI-06', outcome: 'not_configured', source: 'approval', sop_id: null, version: null },
      ])

      // The Estimator opens the request record: each work package's SOP checklist, opened on demand.
      const staff = estimator.page
      await staff.goto(`/staff/requests/${link.requestId}`)
      const section = staff.getByRole('region', { name: 'SOP checklists' })
      await expect(section).toBeVisible()
      const dw = section.locator('[data-work-package="DW-01"]')
      await dw.getByRole('button', { name: 'Show the SOP checklist' }).click()
      const sop = dw.getByTestId('work-package-sop')
      await expect(sop.getByText('Pending competent review', { exact: true }).first()).toBeVisible()
      await expect(sop.getByText('No procedure for licensed or hazardous work')).toBeVisible()
      await expect(sop.getByText('SOP DW-01: Professional Patching, Repair & Handyman Services')).toBeVisible()
      await expect(sop.locator('[data-stage]')).toHaveCount(6)
      const work = sop.locator('[data-stage="work_steps"]')
      await work.locator('summary').click()
      await expect(work.getByText(/^Vault line \d+$/).first()).toBeVisible()
      await expect(work.locator('[data-item]').first()).toBeVisible()
      // An Estimator does not record sign-offs (the Owner does, sop.sign_off_review).
      await expect(sop.getByRole('button', { name: 'Record the sign-off' })).toHaveCount(0)

      const hi = section.locator('[data-work-package="HI-06"]')
      await hi.getByRole('button', { name: 'Show the SOP checklist' }).click()
      await expect(hi.getByText('NOT CONFIGURED: no SOP version for this service')).toBeVisible()
      await expect(hi.getByTestId('work-package-sop')).toHaveCount(0)
      await axe(staff)

      // On a phone nothing scrolls sideways.
      await staff.setViewportSize({ width: 375, height: 740 })
      await expect(work.getByText(/^Vault line \d+$/).first()).toBeVisible()
      expect(await staff.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    } finally {
      await estimator.close()
    }
  })
})
