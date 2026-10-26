// The permanent customer dashboard and verified project claiming in a real browser (TSK-0124; HH-ID-14, HH-ID-03,
// HH-ID-02, HH-PRIV-06, T20, OWN-DEC-160, OWN-DEC-198). A guest sends a request through the wizard, verifies the email
// and creates an account on the receipt; on the dashboard they add two more of their guest projects, each with a code
// sent to that request's own verified email; a request with the account's email that was never verified is not added
// whatever code is tried. This spec's Estimator publishes an estimate on one project; the customer approves it from
// the dashboard; once the project's work is complete (a synthetic state here: the Owner's quality review is its own
// spec) it sits in the Project History, where the approved estimate is downloaded. The codes are read back from the
// database and derived with the e2e servers' synthetic code key (codes.ts). No estimate terms version is recorded by
// the migrations, so this spec records a synthetic "approved and attorney-reviewed" v1.0 for its own run only and
// restores NOT CONFIGURED afterwards: a test fixture, never the owner's sign-off. Every visitor, address, account, name
// and amount is synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { codeFor } from '../codes.js'
import { passSecondFactor } from '../mfa.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
// This spec's own synthetic client address (RFC 5737), so its limits never meet another spec's.
const HEADERS = { 'x-forwarded-for': '198.51.100.124' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const ESTIMATOR = 'e2e-customer-dashboard-estimator@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'customer', 'dashboard', 'passphrase', '124'].join(' ')
const SENT = /^If these details match a HandyHub request, we sent a code to the contact on that request\./

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-customer-dashboard' })
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
const latestCode = async (subject: string) =>
  codeFor(
    await withDb((db) =>
      db
        .selectFrom('identity.verification_codes')
        .select(['id', 'nonce'])
        .where('subject_ref', '=', subject)
        .orderBy('created_at', 'desc')
        .limit(1)
        .executeTakeFirstOrThrow(),
    ),
  )
const codesFor = (subjectPrefix: string) =>
  withDb(async (db) =>
    Number(
      (
        await db
          .selectFrom('identity.verification_codes')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('subject_ref', 'like', `${subjectPrefix}%`)
          .executeTakeFirstOrThrow()
      ).n,
    ),
  )
const requestOf = (reference: string) =>
  withDb((db) =>
    db
      .selectFrom('intake.requests')
      .select(['id', 'contact_id', 'project_id'])
      .where('reference', '=', reference)
      .executeTakeFirstOrThrow(),
  )

/** Sends a request through the wizard and waits for its receipt; returns the reference. */
async function sendThroughWizard(page: Page, email: string): Promise<string> {
  await page.goto('/request')
  await page.evaluate(() => window.localStorage.clear())
  await page.goto('/request')
  await page.getByRole('button', { name: 'Continue as Guest' }).click()
  await page.getByLabel('Not sure what service I need').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Project description').fill('Synthetic dashboard project: a loose cabinet door.')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Street address').fill('124 Synthetic Court')
  await page.getByLabel('City').fill('Testville')
  await page.getByLabel('State').fill('KY')
  await page.getByLabel('ZIP').fill('40000')
  await page.getByLabel('House', { exact: true }).check()
  await page.getByLabel('Preferred date').fill(future)
  await page.getByLabel('Mornings').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Full name').fill('Test Dashboard Customer')
  await page.getByRole('textbox', { name: /^Email/ }).fill(email)
  await page.getByRole('textbox', { name: /^Phone/ }).fill('(502) 555-0124')
  await page.getByLabel('Phone call', { exact: true }).check()
  await page.getByLabel('Let HandyHub decide').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Send Estimate Request' }).click()
  await expect(page.getByRole('heading', { name: 'Your request is in.' })).toBeFocused()
  return new URL(page.url()).pathname.replace('/request/received/', '')
}

let sentByApi = 0
/** A request sent through the API (from a network of its own); its email verified on the receipt when asked. */
async function sendByApi(request: APIRequestContext, email: string, verify: boolean) {
  const ip = { 'x-forwarded-for': `198.51.100.${200 + ++sentByApi}` }
  const res = await request.post('/api/v1/public/requests', {
    headers: { ...ip, 'idempotency-key': `synthetic-e2e-customer-dashboard-${Date.now()}-${sentByApi}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic dashboard project: a dented hallway wall.',
      property: { street: '124 Synthetic Way', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: { fullName: 'Test Dashboard Customer', email, phone: '(502) 555-0124', preferredChannel: 'email' },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.status()).toBe(201)
  const reference = ((await res.json()) as { reference: string }).reference
  const r = await requestOf(reference)
  if (verify) {
    const headers = { ...ip, 'receipt-capability': res.headers()['receipt-capability'] as string }
    const sent = await request.post('/api/v1/public/request-receipt/contact/codes', {
      headers,
      data: { channel: 'email' },
    })
    expect(sent.status()).toBe(202)
    const verified = await request.post('/api/v1/public/request-receipt/contact/verify', {
      headers,
      data: { channel: 'email', code: await latestCode(`contact:${r.contact_id}:email`) },
    })
    expect(verified.status()).toBe(200)
  }
  return { reference, requestId: r.id, projectId: r.project_id }
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
      .values({ email: ESTIMATOR, display_name: 'E2E Dashboard Estimator', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({
        staff_user_id: user.id,
        kind: 'role',
        name: 'estimator',
        issued_by: 'e2e:customer-dashboard',
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
  // MFA is mandatory (TSK-0154): enrol on the account's first sign-in.
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
        'idempotency-key': `e2e-customer-dashboard-${Date.now()}-${++k}`,
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

/** The Estimator publishes a written estimate of $700.00 (no deposit) on the request; its number. */
async function publishEstimate(browser: Browser, s: { requestId: string; projectId: string }): Promise<string> {
  const estimator = await estimatorSession(browser)
  try {
    await estimator.write('PUT', `/api/v1/staff/requests/${s.requestId}/qualification`, { checks: CHECKS }, 0)
    const detail = (await (await estimator.page.request.get(`/api/v1/staff/requests/${s.requestId}`)).json()) as {
      version: number
    }
    await estimator.write(
      'POST',
      `/api/v1/staff/requests/${s.requestId}/actions/online-estimate`,
      { workPackages: ['SVC-DW-01'] },
      detail.version,
    )
    const created = await estimator.write('POST', `/api/v1/staff/projects/${s.projectId}/estimates`, {})
    const versionId = created['versionId'] as string
    const draft = (await (await estimator.page.request.get(`/api/v1/staff/estimate-versions/${versionId}`)).json()) as {
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
            description: 'Synthetic: patch the hallway wall',
            quantity: '1',
            unit: 'job',
            unitPriceCents: 70_000,
          },
        ],
        texts: {},
      },
      draft.rowVersion,
    )
    await estimator.write(
      'POST',
      `/api/v1/staff/estimate-versions/${versionId}/publish`,
      {},
      saved['rowVersion'] as number,
    )
    return created['number'] as string
  } finally {
    await estimator.close()
  }
}

/** Add a project on the dashboard: the reference and the email, then the code read back for this claim. */
async function addProject(page: Page, accountId: string, s: { reference: string; projectId: string }, email: string) {
  const add = page.getByRole('region', { name: 'Add a project to your account' })
  await add.getByLabel('Request reference').fill(s.reference)
  await add.getByLabel('Email or mobile phone').fill(email)
  await add.getByRole('button', { name: 'Send me a code' }).click()
  await expect(add.getByText(SENT)).toBeVisible()
  await expect(add.getByLabel('Code')).toBeFocused()
  await add.getByLabel('Code').fill(await latestCode(`claim:${accountId}:${s.projectId}:email`))
  await add.getByRole('button', { name: 'Add this project' }).click()
  await expect(add.getByText(`Project ${s.reference} is now in your account.`)).toBeVisible()
}

test.describe('the permanent customer dashboard and verified project claiming (TSK-0124)', () => {
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

  test('[HH-ID-14][T20][HH-ID-03][HH-PRIV-06] a guest claims two projects with codes, finds them in their sections and downloads an approved estimate from the Project History; an unverified match links nothing', async ({
    page,
    browser,
    request,
  }) => {
    const email = 'dashboard-e2e@example.test'
    // The guest's first request, its email verified and the account created on the receipt.
    const first = await sendThroughWizard(page, email)
    const firstRow = await requestOf(first)
    const verify = page
      .getByRole('region', { name: 'Verify your contact details' })
      .getByRole('group', { name: 'Email' })
    await verify.getByRole('button', { name: 'Email me a code' }).click()
    await expect(verify.getByLabel('Code')).toBeFocused()
    await verify.getByLabel('Code').fill(await latestCode(`contact:${firstRow.contact_id}:email`))
    await verify.getByRole('button', { name: 'Verify' }).click()
    await expect(verify.getByText('Your email is verified.')).toBeVisible()
    const offer = page.getByRole('region', { name: 'Keep your project history' })
    await offer.getByRole('button', { name: 'Create an Account' }).click()
    await offer.getByRole('button', { name: 'Email me a code' }).click()
    await expect(offer.getByLabel('Code')).toBeFocused()
    const accountCode = await withDb((db) =>
      db
        .selectFrom('identity.verification_codes')
        .select(['id', 'nonce'])
        .where('purpose', '=', 'account_sign_in')
        .where('destination', '=', email)
        .orderBy('created_at', 'desc')
        .limit(1)
        .executeTakeFirstOrThrow(),
    )
    await offer.getByLabel('Code').fill(codeFor(accountCode))
    await offer.getByRole('button', { name: 'Create my account' }).click()
    await expect(offer.getByText('Your account is ready, and this project is in it.')).toBeVisible()
    const accountId = (
      await withDb((db) =>
        db
          .selectFrom('identity.customer_accounts')
          .select('id')
          .where('sign_in_email', '=', email)
          .executeTakeFirstOrThrow(),
      )
    ).id

    // Two more guest projects, each verified on its own receipt with its own email; and one with the account's email
    // that was never verified.
    const second = await sendByApi(request, 'dashboard-e2e-second@example.test', true)
    const third = await sendByApi(request, 'dashboard-e2e-third@example.test', true)
    const unverified = await sendByApi(request, email, false)

    // The account page leads to the dashboard.
    await page.getByRole('link', { name: 'Go to your account' }).click()
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeFocused()
    await page.getByRole('link', { name: 'Open your dashboard' }).click()
    await expect(page).toHaveURL(/\/portal\/$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Your projects' })).toBeVisible()
    const active = page.getByRole('region', { name: 'Active' })
    await expect(active.getByRole('listitem', { name: `Project ${first}` })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Request an Estimate' })).toHaveAttribute('href', '/request')
    await axe(page)

    // Each claim needs the code sent to that request's own verified email.
    await addProject(page, accountId, second, 'dashboard-e2e-second@example.test')
    await expect(active.getByRole('listitem', { name: `Project ${second.reference}` })).toBeVisible()
    await addProject(page, accountId, third, 'dashboard-e2e-third@example.test')
    await expect(active.getByRole('listitem', { name: `Project ${third.reference}` })).toBeVisible()
    await axe(page)

    // The unverified project with the account's own email: the same answer, no code is sent, no code adds it.
    const add = page.getByRole('region', { name: 'Add a project to your account' })
    await add.getByLabel('Request reference').fill(unverified.reference)
    await add.getByLabel('Email or mobile phone').fill(email)
    await add.getByRole('button', { name: 'Send me a code' }).click()
    await expect(add.getByText(SENT)).toBeVisible()
    expect(await codesFor(`claim:${accountId}:${unverified.projectId}:`)).toBe(0)
    await add.getByLabel('Code').fill('123456')
    await add.getByRole('button', { name: 'Add this project' }).click()
    await expect(add.getByText("That code didn't work. Check it and try again, or ask for a new code.")).toBeVisible()
    await expect(page.getByRole('listitem', { name: `Project ${unverified.reference}` })).toHaveCount(0)
    const links = await withDb((db) =>
      db
        .selectFrom('identity.customer_identity_links')
        .select(['project_id', 'evidence'])
        .where('account_id', '=', accountId)
        .where('state', '=', 'active')
        .execute(),
    )
    expect(links.map((l) => [l.project_id, l.evidence]).sort()).toEqual(
      [
        [firstRow.project_id, 'receipt_code'],
        [second.projectId, 'claim_code'],
        [third.projectId, 'claim_code'],
      ].sort(),
    )

    // HandyHub sends an estimate on the second project; the customer approves it from the dashboard.
    const number = await publishEstimate(browser, second)
    await page.goto(`/portal/p/${second.reference}/documents/${number}/1`)
    const view = page.getByTestId('estimate-view')
    await expect(view.getByText('Version 1: Current')).toBeVisible()
    const approval = view.getByTestId('estimate-approval')
    const box = approval.getByRole('checkbox', { name: 'I have read and accept the estimate terms' })
    await expect(box).toBeEnabled()
    await box.check()
    await expect(box).toBeChecked()
    await approval.getByLabel('Your full name', { exact: true }).fill('Test Dashboard Customer')
    await approval.getByRole('button', { name: 'Approve Estimate' }).click()
    await expect(view.getByText('Version 1: Approved')).toBeVisible()

    // The work is complete (synthetic: the Owner's quality review has its own spec); the project moves to the
    // Project History, the others stay Active.
    await withDb((db) =>
      db.updateTable('crm.projects').set({ state: 'completed' }).where('id', '=', second.projectId).execute(),
    )
    await page.goto('/portal/')
    const history = page.getByRole('region', { name: 'Project History' })
    const done = history.getByRole('listitem', { name: `Project ${second.reference}` })
    await expect(done).toBeVisible()
    await expect(done.getByText('1 document')).toBeVisible()
    await expect(active.getByRole('listitem')).toHaveCount(2)
    await expect(page.getByRole('region', { name: 'Cancelled and archived' })).toContainText(
      'Cancelled and closed projects appear here.',
    )
    await axe(page)

    // Its documents: the approved estimate, downloaded by a short-lived link.
    await done.getByRole('link', { name: `Documents for ${second.reference}` }).click()
    const docs = page.getByRole('tabpanel', { name: 'Documents' })
    await expect(docs.getByText('Approved', { exact: true }).first()).toBeVisible()
    await docs.getByRole('button', { name: `Download estimate ${number}, version 1` }).click()
    const pdf = docs.getByRole('link', { name: /^Estimate PDF \(\d+ KB\)$/ })
    await expect(pdf).toBeVisible()
    expect(await pdf.getAttribute('href')).toMatch(/^https:\/\/fake-r2\.invalid\/estimates\/published\/.+sig=/)
    // The download is in the access log.
    const logged = await withDb((db) =>
      db
        .selectFrom('platform.audit_events')
        .select('action')
        .where('action', '=', 'estimate_document.customer_download')
        .where('actor_id', '=', `account:${accountId}`)
        .execute(),
    )
    expect(logged.length).toBeGreaterThan(0)

    // On a phone nothing scrolls sideways.
    await page.setViewportSize({ width: 375, height: 740 })
    await page.goto('/portal/')
    await expect(page.getByRole('region', { name: 'Project History' })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })
})
