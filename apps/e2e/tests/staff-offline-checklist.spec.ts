// Checklist steps saved offline in real browsers (TSK-0115; HH-OFF-08, HH-OFF-03, HH-OFF-04, HH-OFF-05, HH-OFF-06,
// HH-OFF-07, OWN-DEC-121, RULE-SAFETY-GATES). An Estimator of this spec publishes a PT-01 estimate through the staff
// API and the customer approves it through the customer API; the confirmed work visit is a fixture early today. The
// worker taps On my way and Arrived, prepares (site check and before photo on the briefing, loadout and packet review
// through the API) and starts work online: Start Work never moves offline. Nothing beyond the minimal offline set works
// offline until the Owner turns offline checklist steps on in Settings (with a reason, after walking the offline
// controls on staging); before that, offline, the checklist needs a connection. Then, offline, the worker starts and
// completes a step on the copy kept on the phone ("Saved on this phone"); Start Work, Finished and skipping stay
// refused offline; back online the drafts upload by themselves, once. A hold raised while the phone is offline wins:
// the step saved offline after it is kept for the Owner's review and never applied. The Owner turns the action off
// again at the end, so later specs run with the default. No estimate terms version is recorded by the migrations: this
// spec records a synthetic "approved and attorney-reviewed" v1.0 for its own run only and restores NOT CONFIGURED
// afterwards (a test fixture, never the owner's sign-off). Every visitor, address, account, name and note is synthetic
// (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import { localDateOf, resolveWindow } from '@handyhub/domain/local-time'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'
import { verifyCountyOf } from '../county.js'
import { passSecondFactor } from '../mfa.js'
import { verifyPropertyZone } from '../zones.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.215' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const ESTIMATOR = 'e2e-offline-estimator@example.test'
const WORKER = 'e2e-offline-worker@example.test'
const OWNER = 'e2e-owner@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'offline', 'checklist', 'passphrase', '115'].join(' ')
const ZONE = 'America/Kentucky/Louisville'
/** A run-unique suffix in base 36 (never a long run of digits in free text). */
const run = Date.now().toString(36)

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-offline-checklist' })
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

/** A request for PT-01 sent through the API: its reference, IDs and link. */
async function sendRequest(request: APIRequestContext) {
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': ['synthetic', 'e2e', 'offline', 'request', run].join('-') },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-PT-01' }],
      notSure: false,
      description: 'Synthetic offline checklist project: paint a bedroom.',
      property: {
        street: '115 Synthetic Offline Lane',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Test Offline Customer',
        email: `offline-checklist-e2e-${run}@example.test`,
        phone: '(502) 555-0115',
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
          display_name: role === 'worker' ? 'Offlineworker Synthetic' : 'E2E Offline estimator',
          locale: 'en',
          ...(role === 'worker' ? { status: 'active', activated_at: new Date() } : {}),
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      await tx.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
      await tx
        .insertInto('identity.role_grants')
        .values({ staff_user_id: user.id, kind: 'role', name: role, issued_by: 'e2e:offline-checklist', reason: null })
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
        'idempotency-key': ['synthetic', 'e2e', 'offline', role, run, String(++k)].join('-'),
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

/** A 1x1 PNG built in code (no real photo is committed). */
function png(): Buffer {
  const crc = (buf: Buffer) => {
    let c = 0xffffffff
    for (const b of buf) {
      c ^= b
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, sum])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)
  ihdr.writeUInt32BE(1, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from([0, 0x80, 0x80, 0x80]))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

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

/** The step rows of the job as the database holds them (the server's own record). */
const stepRows = (jobId: string) =>
  withDb((db) =>
    db
      .selectFrom('work.checklist_steps')
      .select(['step_id', 'state', 'version'])
      .where('job_id', '=', jobId)
      .orderBy('step_id')
      .execute(),
  )

test.describe('Checklist steps saved offline, once the Owner turns them on (TSK-0115)', () => {
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

  test('[HH-OFF-08][HH-OFF-03][HH-OFF-04][HH-OFF-05][HH-OFF-06][RULE-SAFETY-GATES][HH-A11Y-01] offline steps wait for the Owner’s switch; a gated action never works offline; a hold raised offline wins', async ({
    page,
    request,
    browser,
  }) => {
    test.setTimeout(240_000)
    const estimator = await staffSession(browser, ESTIMATOR, 'estimator', 'Action queue')
    const worker = await staffSession(browser, WORKER, 'worker', 'My Day')
    const link = await sendRequest(request)
    try {
      // The job: a published PT-01 estimate the customer approves.
      await estimator.write('PUT', `/api/v1/staff/requests/${link.requestId}/qualification`, { checks: CHECKS }, 0)
      const detail = (await (await estimator.page.request.get(`/api/v1/staff/requests/${link.requestId}`)).json()) as {
        version: number
      }
      await estimator.write(
        'POST',
        `/api/v1/staff/requests/${link.requestId}/actions/online-estimate`,
        { workPackages: ['SVC-PT-01'] },
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
              description: 'Synthetic: paint the bedroom',
              quantity: '1',
              unit: 'job',
              unitPriceCents: 41_500,
            },
          ],
          texts: { exclusions: ['Synthetic: ceilings'] },
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
              fullName: 'Test Offline Customer',
            }),
          })
          return { step: 'approve', status: res.status, body: await res.text() }
        },
        {
          url,
          terms: { documentId: ESTIMATE_TERMS.documentId, sha256: ESTIMATE_TERMS.contentSha256 },
          key: ['e2e', 'offline', 'approve', run].join('-'),
        },
      )
      expect(approved, JSON.stringify(approved)).toMatchObject({ step: 'approve', status: 201 })
      const jobId = (
        await withDb((db) =>
          db.selectFrom('work.jobs').select('id').where('project_id', '=', link.projectId).executeTakeFirstOrThrow(),
        )
      ).id
      const visitId = await todaysVisit(link, jobId, worker.id)

      // The worker arrives and starts work online, through the briefing (its own spec covers the gate).
      const w = worker.page
      await w.reload()
      const card = w.getByTestId('myday-visit')
      await card.getByRole('button', { name: 'On my way' }).click()
      await card.getByRole('button', { name: 'Arrived' }).click()
      await expect(card.getByRole('button', { name: 'Finished' })).toBeVisible()
      await card.getByTestId('myday-start').click()
      const check = w.getByRole('form', { name: 'Site check' })
      await check.getByLabel('The property and site are the ones in the packet').check()
      await check.getByLabel('I can access the work areas').check()
      await check.getByLabel('The customer or an authorized representative is here').check()
      await check.getByLabel('I reviewed the hazards and controls in the packet').check()
      await check.getByRole('button', { name: 'Record the site check' }).click()
      await w
        .getByTestId('start-photo-package')
        .locator('input[type=file]')
        .setInputFiles({ name: 'before.png', mimeType: 'image/png', buffer: png() })
      await expect(w.getByTestId('start-photo-package')).toContainText('PT-01: 1 uploaded')
      const lo = (await (await w.request.get(`/api/v1/staff/jobs/${jobId}/loadout`)).json()) as {
        packages: { workPackageId: string; groups: { items: { key: string }[] }[] }[]
      }
      for (const p of lo.packages)
        await worker.write('POST', `/api/v1/staff/jobs/${jobId}/loadout/checks`, {
          workPackageId: p.workPackageId,
          items: p.groups.flatMap((g) => g.items.map((i) => ({ key: i.key, status: 'loaded' }))),
        })
      const packet = (await (await w.request.get(`/api/v1/staff/jobs/${jobId}/packet`)).json()) as {
        packet: { version: number; contentSha256: string }
      }
      await worker.write('POST', `/api/v1/staff/jobs/${jobId}/packet/views`, { version: packet.packet.version })
      await worker.write('POST', `/api/v1/staff/jobs/${jobId}/packet/acknowledgments`, {
        version: packet.packet.version,
        contentSha256: packet.packet.contentSha256,
      })
      await w.reload()
      const start = w.getByRole('button', { name: 'Start Work' })
      await expect(w.getByTestId('start-outcome')).toHaveText('Ready to start')
      const startUrl = w.url()
      await start.click()
      await expect(w.getByText(/^Work started at /)).toBeVisible()

      // My Day keeps the packet copy on the phone; the checklist copy goes with it.
      await w.goto('/staff/my-day')
      await expect(w.getByTestId('offline-ready')).toContainText('Ready for offline use')
      await w.evaluate(async () => {
        await navigator.serviceWorker.ready
      })
      const checklistUrl = `/staff/checklist/${jobId}`
      await w.goto(checklistUrl)
      const checklist = w.getByTestId('checklist')
      await expect(checklist.getByTestId('checklist-blockers')).toHaveCount(0)

      // Before the Owner turns anything on: offline, the checklist needs a connection.
      await w.context().setOffline(true)
      await w.reload()
      await expect(w.getByTestId('checklist-needs-connection')).toBeVisible()
      await expect(w.getByText('The checklist needs a connection')).toBeVisible()
      await w.context().setOffline(false)

      // The Owner turns offline checklist steps on in Settings, with a reason.
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
      await page.goto('/staff/settings')
      const setting = page.getByTestId('offline-actions')
      await expect(setting.getByTestId('offline-actions-current')).toContainText(
        'Nothing beyond On my way, Arrived, Finished and Stop Work works offline',
      )
      await setting.getByLabel('Checklist steps (start, pause, resume, complete)').check()
      await setting.getByLabel('Reason for the change').fill('Synthetic: the offline controls were walked on staging')
      await setting.getByRole('button', { name: 'Save the offline actions' }).click()
      await expect(setting.getByText('Offline actions saved.')).toBeVisible()
      await expect(setting.getByTestId('offline-actions-current')).toContainText(
        'Turned on: Checklist steps (start, pause, resume, complete)',
      )
      await axe(page)

      // Online again, the checklist screen keeps its copy; offline it opens on that copy.
      await w.goto(checklistUrl)
      await expect(checklist.getByTestId('checklist-stage')).toHaveCount(6)
      await w.goto('/staff/my-day')
      await expect(w.getByTestId('offline-ready')).toContainText('Ready for offline use')
      await w.goto(checklistUrl)
      await expect(checklist.getByTestId('checklist-stage')).toHaveCount(6)
      await w.context().setOffline(true)
      await w.reload()
      await expect(w.getByTestId('checklist-offline-copy')).toContainText('Taken ')
      await expect(w.getByText(/^Not yet synchronized\. The office has not been notified/).first()).toBeVisible()
      const first = checklist.getByTestId('checklist-step').first()
      const firstId = (await first.getAttribute('data-step')) as string
      // Skipping, reopening, a handoff and Finished need a connection: none is offered from the copy.
      await expect(first.getByRole('button', { name: 'Skip' })).toHaveCount(0)
      await expect(w.getByTestId('completion')).toHaveCount(0)
      await first.getByRole('button', { name: 'Start', exact: true }).click()
      await expect(first.getByTestId('checklist-step-local')).toContainText('Saved on this phone')
      await expect(first.getByText('In progress', { exact: true })).toBeVisible()
      await first.getByRole('button', { name: 'Done', exact: true }).click()
      await expect(first.getByRole('button', { name: 'Done', exact: true })).toHaveCount(0)
      await expect(first.getByText('Done', { exact: true })).toBeVisible()
      await expect(w.getByTestId('sync-waiting')).toContainText('2 items not uploaded yet')
      await axe(w)
      // Start Work stays an online check: offline it is never offered.
      await w.goto(startUrl)
      await expect(w.getByTestId('start-offline')).toContainText('Start Work needs an online check')
      await expect(w.getByRole('button', { name: 'Start Work' })).toHaveCount(0)
      expect(await stepRows(jobId)).toEqual([])

      // Back online, the drafts upload by themselves, once, in the order they were saved.
      await w.context().setOffline(false)
      await w.evaluate(() => window.dispatchEvent(new Event('online')))
      await expect(w.getByTestId('sync-status')).toHaveCount(0)
      await expect
        .poll(() => stepRows(jobId), { timeout: 20_000 })
        .toEqual([{ step_id: firstId, state: 'completed', version: 2 }])
      const events = await withDb((db) =>
        db
          .selectFrom('work.field_events')
          .select(['type', 'state', 'outcome'])
          .where('visit_id', '=', visitId)
          .orderBy('device_recorded_at')
          .execute(),
      )
      expect(events).toEqual([
        { type: 'checklist_step', state: 'synchronized', outcome: 'applied' },
        { type: 'checklist_step', state: 'synchronized', outcome: 'applied' },
      ])

      // A hold raised while the phone is offline wins: the step saved offline after it is kept for review, not applied.
      await w.goto(checklistUrl)
      await expect(checklist.getByTestId('checklist-step').first().getByText('Done', { exact: true })).toBeVisible()
      await w.context().setOffline(true)
      await w.reload()
      await expect(w.getByTestId('checklist-offline-copy')).toBeVisible()
      const second = checklist.getByTestId('checklist-step').nth(1)
      const secondId = (await second.getAttribute('data-step')) as string
      await withDb(async (db) => {
        const owner = await db
          .selectFrom('identity.staff_users')
          .select('id')
          .where('email', '=', OWNER)
          .executeTakeFirstOrThrow()
        await db
          .insertInto('work.holds')
          .values({
            kind: 'critical_safety',
            scope_type: 'job',
            scope_id: jobId,
            project_id: link.projectId,
            category: 'live_wiring',
            note: 'Synthetic: exposed wiring behind the outlet cover',
            source: 'hazard_report',
            source_ref: `synthetic-offline-hazard-${run}`,
            raised_by: owner.id,
          })
          .execute()
      })
      await second.getByRole('button', { name: 'Start', exact: true }).click()
      await expect(second.getByTestId('checklist-step-local')).toContainText('Saved on this phone')
      await w.context().setOffline(false)
      await w.evaluate(() => window.dispatchEvent(new Event('online')))
      await expect(w.getByTestId('sync-review')).toBeVisible()
      await expect(checklist.getByTestId('checklist-blockers')).toBeVisible()
      const kept = await withDb((db) =>
        db
          .selectFrom('work.field_events')
          .select(['client_id', 'state', 'outcome', 'detail'])
          .where('visit_id', '=', visitId)
          .where('state', '=', 'needs_review')
          .executeTakeFirstOrThrow(),
      )
      expect(kept).toMatchObject({ outcome: 'conflict', detail: 'HOLD_OPEN' })
      expect((await stepRows(jobId)).map((r) => r.step_id)).toEqual([firstId])
      expect((await stepRows(jobId)).some((r) => r.step_id === secondId)).toBe(false)

      // The Owner reads what the phone saved and why it was not applied.
      await page.goto(`/staff/field-events/${kept.client_id}`)
      await expect(page.getByTestId('field-event-page')).toContainText('Checklist step')
      await expect(page.getByTestId('field-event-step')).toContainText(`Step ${secondId}: Start`)
      await expect(page.getByTestId('field-event-outcome')).toContainText('A hold is open')
      await axe(page)
    } finally {
      // The default again for the specs that follow: nothing beyond the minimal offline set.
      await page.goto('/staff/settings')
      const setting = page.getByTestId('offline-actions')
      const box = setting.getByLabel('Checklist steps (start, pause, resume, complete)')
      const listed = await box.waitFor({ timeout: 10_000 }).then(
        () => true,
        () => false,
      )
      if (listed && (await box.isChecked())) {
        await setting.getByLabel('Checklist steps (start, pause, resume, complete)').uncheck()
        await setting.getByLabel('Reason for the change').fill('Synthetic: back to the default after the e2e run')
        await setting.getByRole('button', { name: 'Save the offline actions' }).click()
        await expect(setting.getByTestId('offline-actions-current')).toContainText('Nothing beyond')
      }
      await estimator.close()
      await worker.close()
    }
  })
})
