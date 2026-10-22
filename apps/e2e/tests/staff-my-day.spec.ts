// My Day: On my way, Arrived and Finished in real browsers (TSK-0070; HH-OFF-09, HH-SCH-08, HH-PORT-07, HH-WORK-06,
// HH-A11Y-01, T23, T43, T47, T65, OWN-DEC-107, OWN-DEC-121, OWN-DEC-149). An Estimator of this spec publishes an
// estimate through the staff API and the customer approves it through the customer API after opening the project with
// the link and a code. Today's work visit is a fixture written the way the confirmation writes it (a covering
// reservation of this spec's worker, then the state), early today, because the API only plans visits in the future.
// The worker signs in, sees the visit on My Day with its address, directions link and the next action, and records
// On my way, Arrived and Finished; the customer's portal shows "On the way" and "Arrived" only once recorded, and no
// ETA appears anywhere. The on-the-way notice is recorded once, NOT CONFIGURED (never sent). No estimate terms version
// is recorded by the migrations: this spec records a synthetic "approved and attorney-reviewed" v1.0 for its own run
// only and restores NOT CONFIGURED afterwards (a test fixture, never the owner's sign-off). axe checks each state.
// Every visitor, address, account and name is synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import { localDateOf, resolveWindow } from '@handyhub/domain/local-time'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'
import { verifyCountyOf } from '../county.js'
import { verifyPropertyZone } from '../zones.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.172' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const ESTIMATOR = 'e2e-myday-estimator@example.test'
const WORKER = 'e2e-myday-worker@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'my', 'day', 'passphrase', '70'].join(' ')
const ZONE = 'America/Kentucky/Louisville'
const NO_ETA = /\bETA\b|estimated arrival|minutes away|arriving in/i
/** A run-unique suffix in base 36 (never a long run of digits in free text). */
const run = Date.now().toString(36)

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-my-day' })
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
    headers: { 'idempotency-key': ['synthetic', 'e2e', 'my', 'day', run].join('-') },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic My Day project: a wall patch.',
      property: {
        street: '170 Synthetic Day Court',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Test Day Customer',
        email: `myday-e2e-${run}@example.test`,
        phone: '(502) 555-0172',
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
async function staffSession(browser: Browser, email: string, role: 'estimator' | 'worker', home: string) {
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
          display_name: role === 'worker' ? 'Dayworker Synthetic' : 'E2E Day estimator',
          locale: 'en',
          ...(role === 'worker' ? { status: 'active', activated_at: new Date() } : {}),
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      await tx.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
      await tx
        .insertInto('identity.role_grants')
        .values({ staff_user_id: user.id, kind: 'role', name: role, issued_by: 'e2e:my-day', reason: null })
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
        'idempotency-key': ['synthetic', 'e2e', 'myday', role, run, String(++k)].join('-'),
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

const CHECKS = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

test.describe('My Day: On my way, Arrived and Finished (TSK-0070)', () => {
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

  test('[HH-OFF-09][HH-SCH-08][HH-PORT-07][HH-WORK-06][T23][T43][T47][T65][HH-A11Y-01] the worker records the sequence; the portal timeline follows the records; no ETA anywhere', async ({
    page,
    request,
    browser,
  }) => {
    const link = await sendRequest(request)
    const estimator = await staffSession(browser, ESTIMATOR, 'estimator', 'Action queue')
    const worker = await staffSession(browser, WORKER, 'worker', 'My Day')
    try {
      // The estimate, published and approved (the approval screens have their own specs).
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
              fullName: 'Test Day Customer',
            }),
          })
          return { step: 'approve', status: res.status, body: await res.text() }
        },
        {
          url,
          terms: { documentId: ESTIMATE_TERMS.documentId, sha256: ESTIMATE_TERMS.contentSha256 },
          key: ['e2e', 'my', 'day', 'approve', run].join('-'),
        },
      )
      expect(approved, JSON.stringify(approved)).toMatchObject({ step: 'approve', status: 201 })
      const jobId = (
        await withDb((db) =>
          db.selectFrom('work.jobs').select('id').where('project_id', '=', link.projectId).executeTakeFirstOrThrow(),
        )
      ).id
      const visitId = await todaysVisit(link, jobId, worker.id)

      // The customer's project page before: the timeline has no on-the-way entry.
      const workspace = () => page.goto(`/portal/p/${link.reference}`)
      await workspace()
      const timeline = page.getByRole('region', { name: 'Timeline' })
      await expect(timeline.getByText('Request received', { exact: true })).toBeVisible()
      await expect(timeline.getByText('On the way', { exact: true })).toHaveCount(0)

      // My Day: today's visit with its address, directions link and one 48 px next action.
      const w = worker.page
      await w.reload()
      const card = w.getByTestId('myday-visit')
      await expect(card).toHaveCount(1)
      await expect(card.getByRole('heading', { level: 2 })).toHaveText(`00:10–00:40 · Project ${link.reference}`)
      await expect(card.getByTestId('myday-address')).toContainText('170 Synthetic Day Court, Testville, KY 40000')
      const directions = card.getByRole('link', { name: 'Directions' })
      await expect(directions).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=/)
      await expect(card.getByTestId('myday-readiness')).toContainText('You have not viewed the job packet yet.')
      const onMyWay = card.getByRole('button', { name: 'On my way' })
      await expect(onMyWay).toBeVisible()
      expect((await onMyWay.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(48)
      await expect(card.getByRole('button', { name: 'Arrived' })).toHaveCount(0)
      expect(await w.locator('main').innerText()).not.toMatch(NO_ETA)
      await axe(w)

      // On my way: the visit is on the way; Arrived is next.
      await onMyWay.click()
      await expect(card.getByText('On the way', { exact: true })).toBeVisible()
      const arrived = card.getByRole('button', { name: 'Arrived' })
      await expect(arrived).toBeVisible()
      await expect(card.getByTestId('myday-mine')).toContainText('On my way at')
      await axe(w)

      // The automatic notice: once (TSK-0120: the email with its values, intercepted by the ci test provider; texts
      // have no wording until A2P 10DLC), no ETA in what was queued.
      await expect
        .poll(() =>
          withDb((db) =>
            db
              .selectFrom('platform.message_deliveries')
              .select(['channel', 'state', 'error_code'])
              .where('subject_key', '=', `visit_on_my_way:${visitId}`)
              .orderBy('channel')
              .execute(),
          ),
        )
        .toEqual([
          { channel: 'email', state: 'queued', error_code: null },
          { channel: 'sms', state: 'failed', error_code: 'template_not_configured' },
        ])

      // The portal: "On the way" in the timeline only now that it is recorded; no worker name, no ETA.
      await workspace()
      await expect(timeline.getByText('On the way', { exact: true })).toBeVisible()
      await expect(page.getByRole('region', { name: 'Latest update' }).getByText('On the way')).toBeVisible()
      expect(await page.locator('main').innerText()).not.toMatch(NO_ETA)
      expect(await page.locator('main').innerText()).not.toContain('Dayworker')
      await axe(page)

      // Arrived: the visit has arrived; only Finished is offered (no check-in between, OWN-DEC-149).
      await arrived.click()
      const finished = card.getByRole('button', { name: 'Finished' })
      await expect(finished).toBeVisible()
      await expect(card.getByTestId('myday-actions').getByRole('button')).toHaveCount(1)
      await expect(card.getByText('Arrived does not start work: Start Work runs its own online checks.')).toBeVisible()
      await workspace()
      await expect(timeline.getByText('Arrived', { exact: true })).toBeVisible()

      // Finished: the visit is completed; nothing more to record.
      await finished.click()
      await expect(card.getByText('Completed', { exact: true })).toBeVisible()
      await expect(card.getByTestId('myday-next')).toHaveText('Everything you record on this visit is recorded.')
      await expect(card.getByTestId('myday-actions').getByRole('button')).toHaveCount(0)
      const stamps = await withDb((db) =>
        db
          .selectFrom('work.time_stamps')
          .select(['kind', 'staff_user_id'])
          .where('visit_id', '=', visitId)
          .orderBy('recorded_at')
          .execute(),
      )
      expect(stamps).toEqual([
        { kind: 'arrived', staff_user_id: worker.id },
        { kind: 'finished', staff_user_id: worker.id },
      ])
      expect(await w.locator('main').innerText()).not.toMatch(NO_ETA)
      await axe(w)

      // On a phone nothing scrolls sideways.
      await w.setViewportSize({ width: 375, height: 740 })
      await expect(card).toBeVisible()
      expect(await w.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    } finally {
      await estimator.close()
      await worker.close()
    }
  })
})
