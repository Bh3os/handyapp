// Stop Work / Report Hazard in real browsers (TSK-0077; HH-WORK-09, HH-WORK-13, HH-OFF-03, HH-PKT-09, T48, HH-A11Y-01,
// OWN-DEC-80, OWN-DEC-152, OWN-DEC-172, RULE-SAFETY-GATES). An Estimator of this spec publishes an estimate through the
// staff API and the customer approves it through the customer API; the confirmed work visit is a fixture early today,
// so On my way is open at any hour the spec runs (as in staff-start-work.spec.ts). On My Day the worker taps On my way
// and Arrived; the visit's card carries Call 911 first and Stop Work / Report Hazard. With the phone offline the worker
// stops work for a suspected gas leak: the guidance (evacuate, call from a safe place, never a gas repair) shows at
// once, the stop shows "Saved on this phone" and "Not yet synchronized", and it is sent once the phone is back online.
// The database then holds the report and its critical hold written by one transaction; the Start Work briefing names
// the hold and Start stays off; the customer sees only "Work is paused for safety review."; the Owner finds the
// safety item in the action queue, opens the job's review page and releases the Owner-only work-paused notice draft.
// No estimate terms version is recorded by the migrations: this spec records a synthetic "approved and
// attorney-reviewed" v1.0 for its own run only and restores NOT CONFIGURED afterwards (a test fixture, never the
// owner's sign-off). axe checks each state. Every visitor, address, account, name and note is synthetic
// (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createDb } from '@handyhub/db'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import { localDateOf, resolveWindow } from '@handyhub/domain/local-time'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'
import { verifyCountyOf } from '../county.js'
import { verifyPropertyZone } from '../zones.js'
import { passSecondFactor } from '../mfa.js'
import { expectAccessible } from '../a11y.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.178' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const ESTIMATOR = 'e2e-stop-estimator@example.test'
const WORKER = 'e2e-stop-worker@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'stop', 'work', 'passphrase', '77'].join(' ')
const ZONE = 'America/Kentucky/Louisville'
/** A run-unique suffix in base 36 (never a long run of digits in free text). */
const run = Date.now().toString(36)

async function axe(page: Page) {
  await expectAccessible(page)
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-stop-work' })
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

/** A request for DW-01 sent through the API: its reference, IDs and link. */
async function sendRequest(request: APIRequestContext) {
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': ['synthetic', 'e2e', 'stop', 'request', run].join('-') },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic Stop Work project: a wall patch.',
      property: {
        street: '177 Synthetic Stop Court',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Test Stop Customer',
        email: `stop-e2e-${run}@example.test`,
        phone: '(502) 555-0178',
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
      .select(['g.id', 'g.nonce', 'r.id as request_id', 'r.project_id', 'p.property_id'])
      .where('r.reference', '=', reference)
      .executeTakeFirstOrThrow(),
  )
  // TSK-0127: staff's address and county check, which a first confirmation needs.
  await verifyCountyOf(databaseUrl as string, row.project_id)
  // TSK-0123: a new property's zone is unknown; this spec plans visits, so its zone is recorded first.
  await withDb((db) => verifyPropertyZone(db, row.project_id))
  return {
    reference,
    requestId: row.request_id,
    projectId: row.project_id,
    propertyId: row.property_id,
    grantId: row.id,
    token: accessTokenFor(row),
  }
}

/** Opens the link and enters the emailed code: the customer's session is verified and fresh. */
async function openProject(page: Page, link: { token: string; grantId: string; reference: string }) {
  await page.goto(`/access#${link.token}`)
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await page.getByRole('button', { name: 'Email me a code' }).click()
  await expect(page.getByLabel('Code')).toBeFocused()
  const row = await withDb((db) =>
    db
      .selectFrom('identity.verification_codes')
      .select(['id', 'nonce'])
      .where('subject_ref', '=', `grant:${link.grantId}:email`)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirstOrThrow(),
  )
  await page.getByLabel('Code').fill(codeFor(row))
  await page.getByRole('button', { name: 'Open my project' }).click()
  await expect(page.getByRole('heading', { name: 'Your project', exact: true })).toBeVisible()
}

/**
 * One of this spec's staff accounts, added straight to the database (the first Owner is created by the staff sign-in
 * spec, which must find no Owner yet whatever order the specs run in), signed in through the staff app in a browser of
 * its own; writes go through the staff API with the session. The worker is active with synthetic working hours.
 */
async function staffSession(browser: Browser, email: string, role: 'estimator' | 'office' | 'worker', home: string) {
  const id = await withDb((db) =>
    db.transaction().execute(async (tx) => {
      const existing = await tx
        .selectFrom('identity.staff_users')
        .select('id')
        .where('email', '=', email)
        .executeTakeFirst()
      if (existing) return existing.id
      const user = await tx
        .insertInto('identity.staff_users')
        .values({
          email,
          display_name: role === 'worker' ? 'Stopworker Synthetic' : `E2E Stop ${role}`,
          locale: 'en',
          ...(role === 'worker' ? { status: 'active', activated_at: new Date() } : {}),
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      await tx.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
      await tx
        .insertInto('identity.role_grants')
        .values({ staff_user_id: user.id, kind: 'role', name: role, issued_by: 'e2e:stop-work', reason: null })
        .execute()
      if (role === 'worker') {
        await tx
          .insertInto('work.worker_schedules')
          .values({ staff_user_id: user.id, version: 1, time_zone: ZONE, set_by: user.id, reason: 'E2E fixture' })
          .execute()
        for (let weekday = 1; weekday <= 7; weekday++)
          await tx
            .insertInto('work.working_hours')
            .values({ staff_user_id: user.id, version: 1, weekday, start_minute: 0, end_minute: 24 * 60 })
            .execute()
      }
      return user.id
    }),
  )
  const link = new URL(
    execFileSync(process.execPath, [cli, 'password-link', email], {
      env: { ...process.env, HANDYHUB_ENV: 'ci', DATABASE_URL: databaseUrl, PORT: port, HOST: '127.0.0.1' },
      encoding: 'utf8',
      stdio: 'pipe',
    }).split('\n')[0] as string,
  ).pathname
  const context = await browser.newContext({ extraHTTPHeaders: HEADERS })
  const page = await context.newPage()
  await page.goto(link)
  await page.getByLabel('New password').fill(pw)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(pw)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // MFA is mandatory (TSK-0154): enrol on the account's first sign-in, the code afterwards.
  await passSecondFactor(page)
  await expect(page.getByRole('heading', { level: 1, name: home })).toBeVisible()
  const csrf = ((await (await page.request.get('/api/v1/staff/auth/session')).json()) as { csrfToken: string })
    .csrfToken
  let k = 0
  const write = async (method: 'POST' | 'PUT', url: string, data: unknown, version?: number) => {
    const res = await page.request.fetch(url, {
      method,
      data,
      headers: {
        'x-csrf-token': csrf,
        'idempotency-key': ['synthetic', 'e2e', 'stop', role, run, String(++k)].join('-'),
        ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
      },
    })
    expect(res.status(), await res.text()).toBeLessThan(300)
    return res.json() as Promise<Record<string, unknown>>
  }
  return { id, page, write, close: () => context.close() }
}

/** Today's confirmed work visit for the worker, early today (see the header): reservation first, then the state. */
async function todaysVisit(link: { projectId: string; propertyId: string }, jobId: string, workerId: string) {
  const w = resolveWindow({ date: localDateOf(new Date(), ZONE), start: '00:10', end: '00:40', zone: ZONE })
  if (!w.ok) throw new Error('fixture window')
  return withDb((db) =>
    db.transaction().execute(async (tx) => {
      const v = await tx
        .insertInto('work.visits')
        .values({
          purpose: 'service',
          project_id: link.projectId,
          job_id: jobId,
          property_id: link.propertyId,
          local_date: w.window.date,
          window_start: w.window.start,
          window_end: w.window.end,
          time_zone: ZONE,
          start_offset_minutes: w.window.startOffsetMinutes,
          end_offset_minutes: w.window.endOffsetMinutes,
          starts_at: w.window.startsAt,
          ends_at: w.window.endsAt,
          window_set_by: workerId,
          expected_duration_minutes: 30,
          preparation_buffer_minutes: 0,
          travel_buffer_minutes: 0,
          required_workers: 1,
          created_by: workerId,
        })
        .returning(['id', 'version'])
        .executeTakeFirstOrThrow()
      await tx
        .insertInto('work.reservations')
        .values({
          visit_id: v.id,
          resource: 'worker',
          staff_user_id: workerId,
          role: 'lead',
          kind: 'confirmed',
          starts_at: w.window.startsAt,
          ends_at: new Date(w.window.endsAt.getTime() + 30 * 60_000),
          time_zone: ZONE,
          assigned_by: workerId,
        })
        .execute()
      await tx
        .updateTable('work.visits')
        .set({ state: 'confirmed', version: v.version + 1 })
        .where('id', '=', v.id)
        .execute()
      return v.id
    }),
  )
}

const OFFICE = 'e2e-stop-office@example.test'
const OWNER = 'e2e-owner@example.test'

function staffAccess(...args: string[]): string {
  const out = execFileSync(process.execPath, [cli, ...args], {
    env: { ...process.env, HANDYHUB_ENV: 'ci', DATABASE_URL: databaseUrl, PORT: port, HOST: '127.0.0.1' },
    encoding: 'utf8',
    stdio: 'pipe',
  })
  return new URL(out.split('\n')[0] as string).pathname
}
/** The first Owner's invite, or a reset link when another spec already created the Owner. */
function ownerLink(): string {
  try {
    return staffAccess('create-owner', OWNER, 'E2E Owner')
  } catch {
    return staffAccess('password-link', OWNER)
  }
}

const CHECKS = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

test.describe('Stop Work / Report Hazard: the critical hold, offline, the neutral customer status (TSK-0077)', () => {
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

  test('[HH-WORK-09][HH-WORK-13][HH-OFF-03][T48][RULE-SAFETY-GATES][HH-A11Y-01] a gas leak stopped offline: guidance at once, synchronized later, Start refused, customer sees only the neutral status', async ({
    page,
    request,
    browser,
  }) => {
    // Staff first: the county check of the request names a staff member.
    const estimator = await staffSession(browser, ESTIMATOR, 'estimator', 'Action queue')
    const office = await staffSession(browser, OFFICE, 'office', 'Action queue')
    const worker = await staffSession(browser, WORKER, 'worker', 'My Day')
    const link = await sendRequest(request)
    try {
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
      await openProject(page, link)
      const url = `/api/v1/customer/projects/${link.reference}/estimates/${number}/versions/1`
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
              fullName: 'Test Stop Customer',
            }),
          })
          return { step: 'approve', status: res.status, body: await res.text() }
        },
        {
          url,
          terms: { documentId: ESTIMATE_TERMS.documentId, sha256: ESTIMATE_TERMS.contentSha256 },
          key: ['e2e', 'stop', 'approve', run].join('-'),
        },
      )
      expect(approved, JSON.stringify(approved)).toMatchObject({ step: 'approve', status: 201 })
      const jobId = (
        await withDb((db) =>
          db.selectFrom('work.jobs').select('id').where('project_id', '=', link.projectId).executeTakeFirstOrThrow(),
        )
      ).id
      const visitId = await todaysVisit(link, jobId, worker.id)

      // My Day: On my way and Arrived; the active visit's card carries Call 911 first and Stop Work.
      const w = worker.page
      await w.reload()
      const card = w.getByTestId('myday-visit')
      await card.getByRole('button', { name: 'On my way' }).click()
      await card.getByRole('button', { name: 'Arrived' }).click()
      await expect(card.getByRole('button', { name: 'Finished' })).toBeVisible()
      const stop = card.getByTestId('stop-work')
      const call = stop.getByRole('link', { name: 'Call 911 — Immediate Emergency' })
      await expect(call).toHaveAttribute('href', 'tel:911')
      await expect(stop.getByRole('button', { name: 'Stop Work / Report Hazard' })).toBeEnabled()
      await axe(w)

      // Offline: Stop Work still opens and sends nothing to wait for; the guidance shows at once.
      await w.context().setOffline(true)
      await stop.getByRole('button', { name: 'Stop Work / Report Hazard' }).click()
      await expect(
        stop.getByText("You have the right to stop work. Nobody's permission is needed.", { exact: false }),
      ).toBeVisible()
      await stop.getByLabel('Suspected gas leak').check()
      const guidance = stop.getByTestId('stop-guidance')
      await expect(
        guidance.getByText('Evacuate immediately. From a safe location, call 911 or the gas utility.'),
      ).toBeVisible()
      await expect(guidance.getByText('Never attempt a gas repair.')).toBeVisible()
      await expect(stop.getByText(/resolved it on site/i)).toHaveCount(0)
      await stop.getByLabel('People are kept away from the area').check()
      await stop.getByLabel('What you see (optional)').fill('Synthetic: a smell of gas by the meter.')
      await stop.getByRole('button', { name: 'Stop work now' }).click()
      await expect(stop.getByText('Saved on this phone')).toBeVisible()
      await expect(stop.getByTestId('stop-not-synced')).toContainText(
        'Not yet synchronized. The office has not been notified automatically.',
      )
      await expect(stop.getByText(/There is no on-site fix for this/)).toBeVisible()
      await axe(w)
      const before = await withDb((db) =>
        db.selectFrom('work.issue_reports').select('id').where('job_id', '=', jobId).execute(),
      )
      expect(before).toEqual([])

      // Back online: the stop is sent with its key and recorded once.
      await w.context().setOffline(false)
      await expect(stop.getByText('Work stopped')).toBeVisible({ timeout: 15_000 })
      await expect(stop.getByText('Needs review by: the gas utility or a licensed gas professional')).toBeVisible()
      const written = await withDb(async (db) => {
        const reports = await db
          .selectFrom('work.issue_reports')
          .select([
            'id',
            'hazard',
            'severity',
            'hold_id',
            'reported_by',
            'reported_at',
            'device_recorded_at',
            'people_kept_away',
          ])
          .where('job_id', '=', jobId)
          .execute()
        const holds = await db
          .selectFrom('work.holds')
          .select(['id', 'kind', 'state', 'category', 'source', 'raised_at'])
          .where('scope_id', '=', jobId)
          .execute()
        return { reports, holds }
      })
      expect(written.reports).toHaveLength(1)
      expect(written.reports[0]).toMatchObject({
        hazard: 'gas_leak',
        severity: 'critical',
        reported_by: worker.id,
        people_kept_away: true,
      })
      expect(written.reports[0]?.device_recorded_at).not.toBeNull()
      expect(written.holds).toHaveLength(1)
      expect(written.holds[0]).toMatchObject({
        id: written.reports[0]?.hold_id,
        kind: 'critical_safety',
        state: 'open',
        category: 'gas_leak',
        source: 'hazard_report',
      })
      // Both carry the same transaction time (now() is the transaction's start): one transaction wrote them.
      expect(written.holds[0]?.raised_at.getTime()).toBe(written.reports[0]?.reported_at.getTime())

      // Office may stop work too, from anywhere, needing nobody's permission.
      const officeStop = await office.write('POST', `/api/v1/staff/jobs/${jobId}/hazard-reports`, {
        hazard: 'structural',
      })
      expect(officeStop).toMatchObject({ holdState: 'open', resolveOnSite: false })

      // The Start Work briefing names the critical hold; Start stays off.
      await card.getByTestId('myday-start').click()
      await expect(w.getByRole('link', { name: 'Call 911 — Immediate Emergency' })).toHaveCount(1)
      await expect(w.getByTestId('start-outcome')).toHaveText('Blocked')
      // Two critical holds (the worker's and Office's): each is named.
      await expect(w.getByTestId('start-items').getByText('A critical safety hold is open.')).toHaveCount(2)
      await expect(w.getByRole('button', { name: 'Start Work' })).toBeDisabled()
      await expect(w.getByTestId('stop-reports').getByRole('listitem')).toHaveCount(2)
      await axe(w)
      const visit = await withDb((db) =>
        db.selectFrom('work.visits').select('state').where('id', '=', visitId).executeTakeFirstOrThrow(),
      )
      expect(visit.state).toBe('arrived')

      // The customer sees only the neutral status, never the hazard.
      // The customer's session from the approval is still open: the project page shows the status.
      await page.goto(`/portal/p/${encodeURIComponent(link.reference)}`)
      await expect(page.getByText('Work is paused for safety review.')).toBeVisible()
      const body = (await page.locator('main').innerText()).toLowerCase()
      for (const word of ['gas', 'structural', 'hazard', 'stopworker']) expect(body).not.toContain(word)
      await axe(page)

      // The Owner finds the safety item in the action queue and releases the Owner-only work-paused notice.
      await page.goto(ownerLink())
      await page.getByLabel('New password').fill(pw)
      await page.getByRole('button', { name: 'Save password' }).click()
      await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
      await page.goto('/staff/sign-in')
      await page.getByLabel('Email').fill(OWNER)
      await page.getByLabel('Password', { exact: true }).fill(pw)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await passSecondFactor(page)
      await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
      const queue = page.locator('.staff-queue__list-wrap').first()
      await queue.getByLabel('Reference').fill(link.reference)
      const item = page.getByRole('listitem', { name: new RegExp(`Safety hold ${link.reference}`) }).first()
      await expect(async () => {
        await queue.getByRole('button', { name: 'Apply filters' }).click()
        await expect(item).toBeVisible({ timeout: 1000 })
      }).toPass({ timeout: 20_000 })
      await item.getByRole('link', { name: 'Review hold' }).click()
      await expect(
        page.getByRole('heading', { level: 1, name: `Holds and exceptions — ${link.reference}` }),
      ).toBeVisible()
      const notice = page.getByTestId('stop-notice')
      await expect(async () => {
        await page.reload()
        await expect(notice.first()).toBeVisible({ timeout: 1000 })
      }).toPass({ timeout: 30_000 })
      await expect(notice.first()).toContainText('Work-paused notice to the customer: Draft')
      await axe(page)
      await notice.first().getByRole('button', { name: 'Release to the customer' }).click()
      await expect(page.getByTestId('stop-notice').first()).toContainText('Queued')
      const delivery = await withDb((db) =>
        db
          .selectFrom('platform.message_deliveries')
          .select(['state', 'released_by'])
          .where('project_id', '=', link.projectId)
          .where('message_key', '=', 'job.paused')
          .execute(),
      )
      expect(delivery.length).toBe(1)
      expect(delivery[0]?.released_by).not.toBeNull()

      // On a phone nothing scrolls sideways.
      await w.setViewportSize({ width: 375, height: 740 })
      expect(await w.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    } finally {
      await estimator.close()
      await office.close()
      await worker.close()
    }
  })
})
