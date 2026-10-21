// Unanswered-estimate reminder drafts and their stop rules in a real browser (TSK-0060; HH-EST-14, HH-COM-05,
// HH-COM-09, T65, S01, OWN-DEC-78, OWN-DEC-132). An Estimator of this spec publishes an estimate through the staff API;
// the first reminder's time is brought forward in the database (24 hours pass), the draft appears in the action
// queue, and the Estimator sends it from the estimate's reminders panel. No wording is approved for the reminder, so
// it is recorded as not sent (NOT CONFIGURED), never as sent. The final reminder is drafted at its time and stops when
// the estimate is withdrawn. No estimate terms version is recorded by the migrations, so this spec records terms v1.0
// as "owner review pending" for its own run and restores NOT CONFIGURED afterwards. Every visitor, address, account
// and amount is synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.160' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const ESTIMATOR = 'e2e-estimate-reminders-estimator@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'estimate', 'reminders', 'passphrase', '60'].join(' ')

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-estimate-reminders' })
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

/** A request sent through the API (the wizard has its own specs): its reference, request ID and project. */
async function sendRequest(request: APIRequestContext) {
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `synthetic-e2e-estimate-reminders-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic estimate-reminder project: a dented hallway wall.',
      property: {
        street: '160 Synthetic Reminder Lane',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Test Reminder Customer',
        email: `estimate-reminders-e2e-${Date.now()}@example.test`,
        phone: '(502) 555-0160',
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
      .selectFrom('intake.requests')
      .select(['id', 'project_id'])
      .where('reference', '=', reference)
      .executeTakeFirstOrThrow(),
  )
  return { reference, requestId: row.id, projectId: row.project_id }
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
      .values({ email: ESTIMATOR, display_name: 'E2E Reminder Estimator', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({
        staff_user_id: user.id,
        kind: 'role',
        name: 'estimator',
        issued_by: 'e2e:estimate-reminders',
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
        'idempotency-key': `e2e-estimate-reminders-${Date.now()}-${++k}`,
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

/** The version's reminder draft jobs, once the in-process worker has scheduled them after publishing. */
const draftJobs = (versionId: string) =>
  withDb((db) =>
    db
      .selectFrom('platform.jobs')
      .select(['job_key', 'run_at'])
      .where('automation', '=', 'estimate.reminder_draft')
      .where('target_id', '=', versionId)
      .orderBy('run_at')
      .execute(),
  )
/** Time passes: the reminder job (first or final) is due now, and the worker runs it within its next poll. */
const bringForward = (versionId: string, step: 'first' | 'final') =>
  withDb((db) =>
    db
      .updateTable('platform.jobs')
      .set({ run_at: new Date() })
      .where('job_key', '=', `estimate.reminder_draft:${versionId}:${step}`)
      .execute(),
  )
const deliveries = (versionId: string) =>
  withDb((db) =>
    db
      .selectFrom('platform.message_deliveries')
      .select(['subject_key', 'state', 'error_code'])
      .where('record_type', '=', 'estimate_version')
      .where('record_id', '=', versionId)
      .where('message_key', '=', 'reminder.unanswered_estimate')
      .orderBy('seq')
      .execute(),
  )

test.describe('unanswered-estimate reminder drafts and their stop rules (TSK-0060)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test.beforeAll(async () => {
    await recordVersion(
      'legal.estimate_terms',
      {
        documentId: ESTIMATE_TERMS.documentId,
        status: 'owner_review_pending',
        attorneyReviewed: false,
        preparedOn: ESTIMATE_TERMS.preparedOn,
        contentSha256: ESTIMATE_TERMS.contentSha256,
      },
      ['HH-EST-13', 'OWN-DEC-127', 'TEST-SYNTHETIC'],
    )
  })
  test.afterAll(async () => {
    // The terms stay NOT CONFIGURED for every other spec.
    await recordVersion('legal.estimate_terms', null, ['HH-EST-13', 'OWN-DEC-127', 'OQ-ATTORNEY-TERMS'])
  })

  test('[HH-EST-14][T65][HH-COM-09][OWN-DEC-132] drafts at the cadence, staff send them, and a withdrawal stops the rest', async ({
    request,
    browser,
  }) => {
    const link = await sendRequest(request)
    const estimator = await estimatorSession(browser)
    const page = estimator.page
    try {
      // The Estimator moves the request on and publishes a written estimate.
      await estimator.write('PUT', `/api/v1/staff/requests/${link.requestId}/qualification`, { checks: CHECKS }, 0)
      const detail = (await (await page.request.get(`/api/v1/staff/requests/${link.requestId}`)).json()) as {
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
      const draft = (await (await page.request.get(`/api/v1/staff/estimate-versions/${versionId}`)).json()) as {
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
              description: 'Synthetic: repair the hallway wall',
              quantity: '1',
              unit: 'job',
              unitPriceCents: 38_000,
            },
          ],
        },
        draft.rowVersion,
      )
      await estimator.write(
        'POST',
        `/api/v1/staff/estimate-versions/${versionId}/publish`,
        {},
        saved['rowVersion'] as number,
      )

      // Publishing schedules the first and the final draft, 24 hours and 3 days later (FACT-REMINDER-CADENCES).
      await expect.poll(async () => (await draftJobs(versionId)).length, { timeout: 15_000 }).toBe(2)
      const version = await withDb((db) =>
        db
          .selectFrom('estimating.estimate_versions')
          .select('published_at')
          .where('id', '=', versionId)
          .executeTakeFirstOrThrow(),
      )
      const publishedAt = (version.published_at as Date).getTime()
      const jobs = await draftJobs(versionId)
      expect(jobs.map((j) => Math.round((j.run_at.getTime() - publishedAt) / 3_600_000))).toEqual([24, 72])

      // The estimate's page lists the schedule; no reminder is drafted yet.
      await page.goto(`/staff/estimates/${versionId}`)
      const panel = page.getByTestId('estimate-reminders')
      await expect(panel.getByRole('heading', { name: 'Customer reminders' })).toBeVisible()
      await expect(panel.getByText(/^First reminder drafted /)).toBeVisible()
      await expect(panel.getByText('No reminder has been drafted yet.')).toBeVisible()

      // 24 hours pass: the first reminder is a draft waiting in the action queue; nothing was sent.
      await bringForward(versionId, 'first')
      await expect
        .poll(async () => (await deliveries(versionId)).map((d) => d.state), { timeout: 15_000 })
        .toEqual(['draft'])
      await page.goto('/staff')
      await page.getByLabel('Reference', { exact: true }).fill(link.reference)
      await page.getByRole('button', { name: 'Apply filters' }).click()
      const item = page.getByRole('listitem').filter({ hasText: 'Estimate reminder to send' })
      await expect(item.getByText('The first reminder for an unanswered estimate is ready to send')).toBeVisible()
      await axe(page)
      await item.getByRole('link', { name: link.reference }).click()
      await expect(page).toHaveURL(new RegExp(`/staff/estimates/${versionId}$`))
      const reminders = panel.getByRole('list', { name: 'Customer reminders' })
      await expect(reminders.getByText('First reminder by Email')).toBeVisible()
      await expect(reminders.getByText('Draft, not sent')).toBeVisible()
      await axe(page)

      // Sent at once (any hour); with no approved wording it is recorded as not sent, never as sent.
      await panel.getByRole('button', { name: 'Send reminder' }).click()
      await expect(panel.getByText('Sent for delivery. Its outcome shows here.')).toBeVisible()
      await expect
        .poll(async () => (await deliveries(versionId)).map((d) => [d.state, d.error_code]), { timeout: 15_000 })
        .toEqual([['failed', 'template_not_configured']])
      await page.reload()
      await expect(reminders.getByText('Not sent', { exact: true })).toBeVisible()
      await expect(
        reminders.getByText('Reason: No approved wording for this message yet (not configured)'),
      ).toBeVisible()
      await expect(reminders.getByText(/^Sent by E2E Reminder Estimator, /)).toBeVisible()
      const queue = async () =>
        (
          (await (await page.request.get(`/api/v1/staff/queue?reference=${link.reference}`)).json()) as {
            items: { type: string; reason: string }[]
          }
        ).items.filter((i) => i.type === 'estimate_reminder')
      expect(await queue()).toEqual([])

      // Three days pass: the final reminder is drafted; then the estimate is withdrawn and it stops at once.
      await bringForward(versionId, 'final')
      await expect
        .poll(async () => (await deliveries(versionId)).map((d) => d.state), { timeout: 15_000 })
        .toEqual(['failed', 'draft'])
      expect((await queue()).map((i) => i.reason)).toEqual(['estimate_reminder_final'])
      const current = (await (await page.request.get(`/api/v1/staff/estimate-versions/${versionId}`)).json()) as {
        rowVersion: number
      }
      await estimator.write(
        'POST',
        `/api/v1/staff/estimate-versions/${versionId}/withdraw`,
        { reason: 'Synthetic e2e reason: the scope changed.' },
        current.rowVersion,
      )
      await page.reload()
      await expect(panel.getByText('Reminders stopped: The estimate was withdrawn.')).toBeVisible()
      await expect(reminders.getByText('Final reminder by Email')).toBeVisible()
      await expect(reminders.getByText('Reason: The estimate was withdrawn')).toBeVisible()
      await expect(panel.getByRole('button', { name: 'Send reminder' })).toHaveCount(0)
      expect(await queue()).toEqual([])
      expect((await deliveries(versionId)).map((d) => [d.state, d.error_code])).toEqual([
        ['failed', 'template_not_configured'],
        ['cancelled', 'withdrawn'],
      ])
      await axe(page)

      // On a phone the reminders panel fits the screen: nothing in it scrolls sideways.
      await page.setViewportSize({ width: 375, height: 740 })
      await expect(panel.getByRole('heading', { name: 'Customer reminders' })).toBeVisible()
      const box = await panel.boundingBox()
      expect(box !== null && box.x >= 0 && box.x + box.width <= 375).toBe(true)
      expect(
        await panel.evaluate((el) =>
          [el, ...el.querySelectorAll('*')].every((e) => e.getBoundingClientRect().right <= window.innerWidth),
        ),
      ).toBe(true)
    } finally {
      await estimator.close()
    }
  })
})
