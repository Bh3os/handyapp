// The worker's visit-day data access and the Owner's extension in real browsers (TSK-0128; HH-PKT-08, HH-CRM-03,
// HH-OFF-02, HH-A11Y-01, T28, OWN-DEC-171). An Estimator of this spec publishes an estimate through the staff API and
// the customer approves it through the customer API after opening the project with the link and a code; this spec's
// Office user records a site contact and an access code and confirms a work visit three days ahead with this spec's
// worker (working hours every day 08:00-20:00: a synthetic fixture, not the business's hours). Before the visit day the
// worker's packet shows the service area only and says when the rest opens; the Owner extends the worker's access with
// a reason for two hours, the worker then sees the customer's first name, the address and the site contact, with the
// note that removing access cannot erase copies, and reveals the code; the Owner ends the extension and the packet is
// closed again. No estimate terms version is recorded by the migrations: this spec records a synthetic "approved and
// attorney-reviewed" v1.0 for its own run only and restores NOT CONFIGURED afterwards (a test fixture, never the
// owner's sign-off). axe checks each state. Every visitor, address, phone, account, name and code is synthetic
// (RULE-SYNTHETIC-DATA). It asserts only on its own records: earlier specs leave data in the shared database.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import { addLocalDays, localDateOf } from '@handyhub/domain/local-time'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'
import { verifyCountyOf } from '../county.js'
import { verifyPropertyZone } from '../zones.js'
import { passSecondFactor } from '../mfa.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.128' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const ESTIMATOR = 'e2e-access-estimator@example.test'
const OFFICE = 'e2e-access-office@example.test'
const WORKER = 'e2e-access-worker@example.test'
// The Owner every spec shares (staff-auth.spec.ts creates it; whichever spec runs first does here).
const OWNER = 'e2e-owner@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'worker', 'access', 'passphrase', '128'].join(' ')
const CODE = ['5', '0', '2', '8', '6'].join('')
const STREET = '128 Synthetic Access Court'
const ZONE = 'America/Kentucky/Louisville'
/** A run-unique suffix in base 36 (never a long run of digits in free text). */
const run = Date.now().toString(36)

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-worker-access' })
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
    headers: { 'idempotency-key': ['synthetic', 'e2e', 'worker', 'access', run].join('-') },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic access project: a wall patch.',
      property: { street: STREET, city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Rosalind Access-Customer',
        email: `access-e2e-${run}@example.test`,
        phone: '(502) 555-0127',
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

type Role = 'estimator' | 'office' | 'worker' | 'owner'
/**
 * One of this spec's staff accounts (the Owner is the one every spec shares), added straight to the database when it
 * does not exist yet, signed in through the staff app in a browser of its own; writes go through the staff API with
 * the session. The worker is active with synthetic working hours.
 */
async function staffSession(browser: Browser, email: string, role: Role, home: string) {
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
          display_name: role === 'owner' ? 'E2E Owner' : `E2E Access ${role}`,
          locale: 'en',
          ...(role === 'worker' ? { status: 'active', activated_at: new Date() } : {}),
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      await tx.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
      await tx
        .insertInto('identity.role_grants')
        .values({ staff_user_id: user.id, kind: 'role', name: role, issued_by: 'e2e:worker-access', reason: null })
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
        'idempotency-key': ['synthetic', 'e2e', 'access', role, run, String(++k)].join('-'),
        ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
      },
    })
    expect(res.status(), await res.text()).toBeLessThan(300)
    return res.json() as Promise<Record<string, unknown>>
  }
  return { id, page, write, close: () => context.close() }
}

const CHECKS = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

test.describe("The worker's visit-day data access and the Owner's extension (TSK-0128)", () => {
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

  test('[HH-PKT-08][T28][OWN-DEC-171][HH-A11Y-01] before the day the service area only; an Owner extension opens the visit-day data until it ends', async ({
    page,
    request,
    browser,
  }) => {
    // Four staff sign-ins, each with its authenticator step.
    test.setTimeout(240_000)
    // The staff accounts first: the county check of the request is recorded by a staff member.
    const estimator = await staffSession(browser, ESTIMATOR, 'estimator', 'Action queue')
    const office = await staffSession(browser, OFFICE, 'office', 'Action queue')
    const worker = await staffSession(browser, WORKER, 'worker', 'My Day')
    const owner = await staffSession(browser, OWNER, 'owner', 'Action queue')
    try {
      const link = await sendRequest(request)
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
              fullName: 'Rosalind Access-Customer',
            }),
          })
          return { step: 'approve', status: res.status, body: await res.text() }
        },
        {
          url,
          terms: { documentId: ESTIMATE_TERMS.documentId, sha256: ESTIMATE_TERMS.contentSha256 },
          key: ['e2e', 'worker', 'access', 'approve', run].join('-'),
        },
      )
      expect(approved, JSON.stringify(approved)).toMatchObject({ step: 'approve', status: 201 })
      const jobId = (
        await withDb((db) =>
          db.selectFrom('work.jobs').select('id').where('project_id', '=', link.projectId).executeTakeFirstOrThrow(),
        )
      ).id

      // Office records the site contact and an access code, plans the work visit and confirms it with the worker.
      const property = (await (
        await office.page.request.get(`/api/v1/staff/properties/${link.propertyId}`)
      ).json()) as { version: number }
      await office.write(
        'PUT',
        `/api/v1/staff/properties/${link.propertyId}/details/site_contact`,
        {
          value: 'Synthetic neighbour, (502) 555-0128',
          source: 'customer_call',
          reason: 'Synthetic: the customer called',
        },
        property.version,
      )
      await office.write('POST', `/api/v1/staff/properties/${link.propertyId}/access-codes`, {
        kind: 'lockbox',
        label: 'Synthetic access box',
        value: CODE,
        source: 'customer_call',
        reason: 'Synthetic: given by phone',
      })
      const date = addLocalDays(localDateOf(new Date(), ZONE), 3)
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
      await office.write('POST', `/api/v1/staff/visits/${visit.id}/confirm`, { workerIds: [worker.id] }, visit.version)

      // Before the visit day: the packet shows the service area and when the rest opens; nothing else of it.
      const w = worker.page
      await w.goto(`/staff/packets/${jobId}`)
      const packet = w.getByTestId('job-packet')
      await expect(packet.getByTestId('packet-address')).toHaveText(
        'Shown on the visit day only. Service area: Testville, KY',
      )
      await expect(packet.getByTestId('visit-day-closed')).toContainText('show on the visit day only, from')
      await expect(packet.getByTestId('packet-customer')).toHaveCount(0)
      await expect(packet.getByTestId('packet-access-code')).toHaveCount(0)
      await expect(packet.getByRole('button', { name: 'Reveal code' })).toHaveCount(0)
      const before = await w.content()
      for (const hidden of [STREET, '555-0128', 'Rosalind', 'Synthetic access box', CODE])
        expect(before).not.toContain(hidden)
      await axe(w)

      // The Owner opens the visit's worker access and extends it for two hours, with a reason.
      const o = owner.page
      await o.goto(`/staff/visit-access/${visit.id}`)
      const access = o.getByTestId('visit-access')
      await expect(access.getByTestId('visit-access-worker')).toContainText('E2E Access worker')
      await expect(access.getByTestId('visit-access-worker')).toContainText('Opens')
      await axe(o)
      const until = await o.evaluate(() => {
        const d = new Date(Date.now() + 2 * 3_600_000)
        const two = (n: number) => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}`
      })
      await access.getByLabel(/Ends at/).fill(until)
      await access.getByLabel('Reason', { exact: true }).fill('Synthetic: the customer asked for an early start')
      await access.getByRole('button', { name: 'Extend access' }).click()
      await expect(access.getByRole('status')).toHaveText('Extension recorded.')
      await expect(access.getByTestId('visit-access-worker')).toContainText('Open by Owner extension until')
      await expect(access.getByTestId('visit-access-extension')).toContainText('In force')
      await axe(o)

      // The worker now sees the first name, the address, the site contact, the note on copies, and reveals the code.
      await w.reload()
      await expect(packet.getByTestId('packet-address')).toContainText(STREET)
      await expect(packet.getByTestId('packet-customer')).toHaveText('Rosalind')
      await expect(packet.getByTestId('visit-day-open')).toContainText('Access extended by the Owner until')
      await expect(packet.getByTestId('visit-day-open')).toContainText('Removing access cannot erase screenshots')
      await expect(packet).toContainText('Synthetic neighbour, (502) 555-0128')
      expect(await w.content()).not.toContain('Access-Customer')
      await packet.getByRole('button', { name: 'Reveal code' }).click()
      await expect(packet.getByText(CODE)).toBeVisible()
      await axe(w)
      const reveals = await withDb((db) =>
        db
          .selectFrom('crm.access_code_reveals')
          .select('staff_id')
          .where('property_id', '=', link.propertyId)
          .execute(),
      )
      expect(reveals).toEqual([{ staff_id: worker.id }])

      // The Owner ends it early: the next read is closed again.
      await access.getByLabel('Reason for ending it now').fill('Synthetic: no longer needed')
      await access.getByRole('button', { name: 'End now' }).click()
      await expect(access.getByTestId('visit-access-extension')).toContainText('Ended early')
      await expect(access.getByTestId('visit-access-extension')).toContainText('Synthetic: no longer needed')
      await w.reload()
      await expect(packet.getByTestId('packet-address')).toHaveText(
        'Shown on the visit day only. Service area: Testville, KY',
      )
      expect(await w.content()).not.toContain(STREET)

      // On a phone nothing scrolls sideways.
      await o.setViewportSize({ width: 375, height: 740 })
      await expect(access.getByTestId('visit-access-worker')).toBeVisible()
      expect(await o.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    } finally {
      await estimator.close()
      await office.close()
      await worker.close()
      await owner.close()
    }
  })
})
