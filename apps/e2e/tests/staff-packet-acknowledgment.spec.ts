// Personal packet acknowledgments and readiness invalidation in real browsers (TSK-0072; HH-DATA-08, HH-WORK-10,
// HH-PKT-02, HH-A11Y-01, T44, T51, ENT-Acknowledgment, OWN-DEC-121). An Estimator of this spec publishes an estimate
// through the staff API and the customer approves it through the customer API after opening the project with the link
// and a code; this spec's Office user plans and confirms a work visit with this spec's first worker (working hours
// every day 08:00-20:00: a synthetic fixture, not the business's hours). The first worker opens the packet from My Day,
// ticks "I reviewed this packet myself" and acknowledges version 1; the Office user records an access code (a critical
// site-access change) and the worker's acknowledgment no longer counts until they acknowledge version 2. The Office
// user then reassigns the visit to the second worker: the first loses the packet (a new acknowledgment is refused)
// and the second inherits nothing and must review personally. The Office sees each assigned worker's state but cannot
// acknowledge. No estimate terms version is recorded by the migrations: this spec records a synthetic "approved and
// attorney-reviewed" v1.0 for its own run only and restores NOT CONFIGURED afterwards (a test fixture, never the
// owner's sign-off). axe checks each state. Every visitor, address, account, name and code is synthetic
// (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import { addLocalDays, localDateOf } from '@handyhub/domain/local-time'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'
import { verifyPropertyZone } from '../zones.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.175' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const ESTIMATOR = 'e2e-ack-estimator@example.test'
const OFFICE = 'e2e-ack-office@example.test'
const FIRST = 'e2e-ack-first-worker@example.test'
const SECOND = 'e2e-ack-second-worker@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'packet', 'acknowledgment', 'passphrase', '72'].join(' ')
const CODE = ['3', '8', '2', '7', '5'].join('')
const ZONE = 'America/Kentucky/Louisville'
/** A run-unique suffix in base 36 (never a long run of digits in free text). */
const run = Date.now().toString(36)

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-packet-acknowledgment' })
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
    headers: { 'idempotency-key': ['synthetic', 'e2e', 'packet', 'ack', run].join('-') },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic acknowledgment project: a wall patch.',
      property: {
        street: '172 Synthetic Review Court',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Test Review Customer',
        email: `packet-ack-e2e-${run}@example.test`,
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
async function staffSession(
  browser: Browser,
  email: string,
  role: 'estimator' | 'office' | 'worker',
  home: string,
  name = `E2E Review ${role}`,
) {
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
          display_name: name,
          locale: 'en',
          ...(role === 'worker' ? { status: 'active', activated_at: new Date() } : {}),
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      await tx.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
      await tx
        .insertInto('identity.role_grants')
        .values({
          staff_user_id: user.id,
          kind: 'role',
          name: role,
          issued_by: 'e2e:packet-acknowledgment',
          reason: null,
        })
        .execute()
      if (role === 'worker') {
        await tx
          .insertInto('work.worker_schedules')
          .values({ staff_user_id: user.id, version: 1, time_zone: ZONE, set_by: user.id, reason: 'E2E fixture' })
          .execute()
        for (let weekday = 1; weekday <= 7; weekday++)
          await tx
            .insertInto('work.working_hours')
            .values({ staff_user_id: user.id, version: 1, weekday, start_minute: 8 * 60, end_minute: 20 * 60 })
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
        'idempotency-key': ['synthetic', 'e2e', 'ack', name.replace(/\W+/g, '-'), run, String(++k)].join('-'),
        ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
      },
    })
    expect(res.status(), await res.text()).toBeLessThan(300)
    return res.json() as Promise<Record<string, unknown>>
  }
  return { id, page, csrf, write, close: () => context.close() }
}

const CHECKS = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

test.describe('Packet acknowledgments and readiness invalidation (TSK-0072)', () => {
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

  test('[HH-DATA-08][HH-WORK-10][HH-PKT-02][T44][T51][HH-A11Y-01] the worker acknowledges personally; a critical change and a reassignment make the review count again', async ({
    page,
    request,
    browser,
  }) => {
    const link = await sendRequest(request)
    const estimator = await staffSession(browser, ESTIMATOR, 'estimator', 'Action queue')
    const office = await staffSession(browser, OFFICE, 'office', 'Action queue')
    const first = await staffSession(browser, FIRST, 'worker', 'My Day', 'E2E Review first worker')
    const second = await staffSession(browser, SECOND, 'worker', 'My Day', 'E2E Review second worker')
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
              fullName: 'Test Review Customer',
            }),
          })
          return { step: 'approve', status: res.status, body: await res.text() }
        },
        {
          url,
          terms: { documentId: ESTIMATE_TERMS.documentId, sha256: ESTIMATE_TERMS.contentSha256 },
          key: ['e2e', 'packet', 'ack', 'approve', run].join('-'),
        },
      )
      expect(approved, JSON.stringify(approved)).toMatchObject({ step: 'approve', status: 201 })
      const jobId = (
        await withDb((db) =>
          db.selectFrom('work.jobs').select('id').where('project_id', '=', link.projectId).executeTakeFirstOrThrow(),
        )
      ).id

      // Office plans the work visit and confirms it with the first worker.
      const date = addLocalDays(localDateOf(new Date(), ZONE), 34)
      const planned = (await office.write('POST', `/api/v1/staff/projects/${link.projectId}/visits`, {
        purpose: 'service',
        localDate: date,
        windowStart: '09:00',
        windowEnd: '10:00',
        expectedDurationMinutes: 60,
        travelBufferMinutes: 30,
        preparationBufferMinutes: 0,
        requiredWorkers: 1,
        equipment: [],
      })) as { visits: { id: string; version: number }[] }
      const visit = planned.visits[planned.visits.length - 1] as { id: string; version: number }
      await office.write('POST', `/api/v1/staff/visits/${visit.id}/confirm`, { workerIds: [first.id] }, visit.version)

      // The first worker opens the packet from My Day: review needed; the button waits for the box.
      const w = first.page
      await w.reload()
      const mine = w.getByTestId('my-job-packets')
      const open = mine.getByRole('link', { name: `Job packet: project ${link.reference}` })
      await expect(open).toHaveCount(1)
      await expect(mine.getByText('Review needed')).toBeVisible()
      await open.click()
      const packet = w.getByTestId('job-packet')
      const review = packet.getByTestId('packet-review')
      await expect(review.getByText('You have not acknowledged this packet yet')).toBeVisible()
      await expect(review.getByTestId('packet-review-team')).toContainText('E2E Review first worker: Review needed')
      const acknowledge1 = review.getByRole('button', { name: 'Acknowledge version 1' })
      await expect(acknowledge1).toBeDisabled()
      await axe(w)
      await review.getByLabel(/I reviewed this packet myself/).check()
      await acknowledge1.click()
      await expect(review.getByTestId('packet-acknowledged')).toContainText('You acknowledged version 1')
      await expect(review.getByTestId('packet-review-team')).toContainText(
        'E2E Review first worker: Acknowledged, version 1',
      )
      await expect(
        review.getByText('An acknowledgment never releases a hold and never starts work by itself.'),
      ).toBeVisible()
      await axe(w)

      // Office records an access code: a critical site-access change; the acknowledgment no longer counts.
      await office.write('POST', `/api/v1/staff/properties/${link.propertyId}/access-codes`, {
        kind: 'lockbox',
        label: 'Synthetic review box',
        value: CODE,
        source: 'customer_call',
        reason: 'Synthetic: given by phone',
      })
      await packet.getByRole('button', { name: 'Check for changes' }).click()
      await expect(packet.getByTestId('packet-version')).toContainText('Version 2')
      await expect(review.getByText('Your acknowledgment of version 1 no longer counts')).toBeVisible()
      await expect(review).toContainText('Version 2 has a critical change.')
      await expect(review).toContainText('an access code was added (Lockbox code)')
      expect(await w.content()).not.toContain(CODE)
      await axe(w)
      await review.getByLabel(/I reviewed this packet myself/).check()
      await review.getByRole('button', { name: 'Acknowledge version 2' }).click()
      await expect(review.getByTestId('packet-acknowledged')).toContainText('You acknowledged version 2')
      const acks = await withDb((db) =>
        db
          .selectFrom('work.job_packet_acknowledgments as a')
          .leftJoin('work.job_packet_acknowledgment_invalidations as i', 'i.acknowledgment_id', 'a.id')
          .select(['a.version', 'a.staff_user_id', 'i.reason'])
          .where('a.job_id', '=', jobId)
          .orderBy('a.acknowledged_at')
          .execute(),
      )
      expect(acks).toEqual([
        { version: 1, staff_user_id: first.id, reason: 'critical_change' },
        { version: 2, staff_user_id: first.id, reason: null },
      ])

      // Office reassigns the visit to the second worker.
      const current = await withDb((db) =>
        db.selectFrom('work.visits').select('version').where('id', '=', visit.id).executeTakeFirstOrThrow(),
      )
      await office.write(
        'POST',
        `/api/v1/staff/visits/${visit.id}/reassign`,
        { workerIds: [second.id], reason: 'Synthetic: a crew change' },
        current.version,
      )
      // The first worker loses the packet on the next request, and a new acknowledgment from them is refused (T51).
      await packet.getByRole('button', { name: 'Check for changes' }).click()
      await expect(w.getByText('This job packet is not available to you')).toBeVisible()
      const refused = await w.request.post(`/api/v1/staff/jobs/${jobId}/packet/acknowledgments`, {
        data: { version: 3, contentSha256: 'a'.repeat(64) },
        headers: { 'x-csrf-token': first.csrf },
      })
      expect(refused.status()).toBe(403)

      // The second worker inherits nothing: review needed, personally.
      const s = second.page
      await s.reload()
      const secondMine = s.getByTestId('my-job-packets')
      const secondOpen = secondMine.getByRole('link', { name: `Job packet: project ${link.reference}` })
      await expect(secondOpen).toHaveCount(1)
      await expect(secondMine.getByText('Review needed')).toBeVisible()
      await secondOpen.click()
      const secondReview = s.getByTestId('packet-review')
      await expect(secondReview.getByText('You have not acknowledged this packet yet')).toBeVisible()
      await expect(secondReview.getByTestId('packet-review-team')).toContainText(
        'E2E Review second worker: Review needed',
      )
      await expect(secondReview.getByTestId('packet-review-team')).not.toContainText('first worker')
      await axe(s)

      // The Office reads each assigned worker's state and cannot acknowledge.
      const o = office.page
      await o.goto(`/staff/packets/${jobId}`)
      const officeReview = o.getByTestId('packet-review')
      await expect(
        officeReview.getByText('Only the workers assigned to this job acknowledge its packet, each personally.'),
      ).toBeVisible()
      await expect(officeReview.getByRole('button', { name: /Acknowledge version/ })).toHaveCount(0)
      await expect(officeReview.getByTestId('packet-review-team')).toContainText(
        'E2E Review second worker: Review needed',
      )
      await axe(o)

      // On a phone nothing scrolls sideways.
      await s.setViewportSize({ width: 375, height: 740 })
      await expect(secondReview).toBeVisible()
      expect(await s.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    } finally {
      await estimator.close()
      await office.close()
      await first.close()
      await second.close()
    }
  })
})
