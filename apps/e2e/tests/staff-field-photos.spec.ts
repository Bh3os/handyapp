// Field photos in real browsers (TSK-0076; HH-QA-05, HH-PORT-11, HH-PRIV-02, HH-DATA-07, T57, T24, HH-A11Y-01,
// RULE-LANGUAGES). An Estimator of this spec publishes an estimate through the staff API and the customer approves it
// through the customer API; the confirmed work visit is a fixture early today, so On my way is open at any hour the
// spec runs (as in staff-start-work.spec.ts). The worker taps, records the site check, a before photo, the loadout
// and the packet review and starts work through the staff API (their screens have their own specs), then opens the
// Job photos page from the Start Work briefing and adds an after photo paired with the before photo, with an area
// label. Office opens the same page and shares both with the customer; a second after photo stays internal. The
// customer's Photos tab shows the before and after pair by service, never the internal photo, and the internal
// photo's ID answers NOT_FOUND. axe checks each page. Every visitor, address, account, name and label is synthetic
// (RULE-SYNTHETIC-DATA); the estimate terms version is recorded for this run only and restored afterwards.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
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
const HEADERS = { 'x-forwarded-for': '198.51.100.177' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const ESTIMATOR = 'e2e-photos-estimator@example.test'
const WORKER = 'e2e-photos-worker@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'field', 'photo', 'passphrase', '76'].join(' ')
const ZONE = 'America/Kentucky/Louisville'
/** A run-unique suffix in base 36 (never a long run of digits in free text). */
const run = Date.now().toString(36)

async function axe(page: Page) {
  await expectAccessible(page)
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-field-photos' })
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
    headers: { 'idempotency-key': ['synthetic', 'e2e', 'photos', 'request', run].join('-') },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic field photo project: a wall patch.',
      property: {
        street: '176 Synthetic Photo Court',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Test Photo Customer',
        email: `photos-e2e-${run}@example.test`,
        phone: '(502) 555-0177',
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
          display_name: role === 'worker' ? 'Photoworker Synthetic' : `E2E Photos ${role}`,
          locale: 'en',
          ...(role === 'worker' ? { status: 'active', activated_at: new Date() } : {}),
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      await tx.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
      await tx
        .insertInto('identity.role_grants')
        .values({ staff_user_id: user.id, kind: 'role', name: role, issued_by: 'e2e:field-photos', reason: null })
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
        'idempotency-key': ['synthetic', 'e2e', 'photos', role, run, String(++k)].join('-'),
        ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
      },
    })
    expect(res.status(), await res.text()).toBeLessThan(300)
    return res.json() as Promise<Record<string, unknown>>
  }
  return { id, page, write, csrf, close: () => context.close() }
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

const OFFICE = 'e2e-photos-office@example.test'

/** A 1x1 PNG built in code (no real photo is committed). */
function png(variant = 0): Buffer {
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
    chunk('IDAT', deflateSync(Buffer.from([0, 0x80, variant & 0xff, 0x80]))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const CHECKS = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

test.describe('Field photos: internal by default, shared by staff, seen by the customer (TSK-0076)', () => {
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

  test('[HH-QA-05][HH-PORT-11][HH-PRIV-02][T57][T24][HH-A11Y-01] the worker adds a paired after photo, Office shares the pair, and the customer sees only what was shared', async ({
    page,
    request,
    browser,
  }) => {
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
              fullName: 'Test Photo Customer',
            }),
          })
          return { step: 'approve', status: res.status, body: await res.text() }
        },
        {
          url,
          terms: { documentId: ESTIMATE_TERMS.documentId, sha256: ESTIMATE_TERMS.contentSha256 },
          key: ['e2e', 'photos', 'approve', run].join('-'),
        },
      )
      expect(approved, JSON.stringify(approved)).toMatchObject({ step: 'approve', status: 201 })
      const jobId = (
        await withDb((db) =>
          db.selectFrom('work.jobs').select('id').where('project_id', '=', link.projectId).executeTakeFirstOrThrow(),
        )
      ).id
      const visitId = await todaysVisit(link, jobId, worker.id)

      // Arrival, site check, a before photo, loadout and packet review, and Start Work, through the staff API.
      const w = worker.page
      await worker.write('POST', `/api/v1/staff/visits/${visitId}/on-my-way`, {})
      await worker.write('POST', `/api/v1/staff/visits/${visitId}/arrived`, {})
      await worker.write('POST', `/api/v1/staff/visits/${visitId}/site-checks`, {
        propertyConfirmed: true,
        accessAvailable: true,
        customerPresent: true,
        hazardsReviewed: true,
        siteCondition: 'as_described',
      })
      const g = (await (await w.request.get(`/api/v1/staff/visits/${visitId}/start-gate`)).json()) as {
        workPackages: { workPackageId: string }[]
      }
      const wp = g.workPackages[0]?.workPackageId as string
      const beforeRes = await w.request.post(`/api/v1/staff/visits/${visitId}/before-photos?workPackageId=${wp}`, {
        data: png(1),
        headers: { 'content-type': 'image/png', 'x-csrf-token': worker.csrf },
      })
      expect(beforeRes.status(), await beforeRes.text()).toBe(201)
      const lo = (await (await w.request.get(`/api/v1/staff/jobs/${jobId}/loadout`)).json()) as {
        packages: { workPackageId: string; groups: { items: { key: string }[] }[] }[]
      }
      for (const p of lo.packages)
        await worker.write('POST', `/api/v1/staff/jobs/${jobId}/loadout/checks`, {
          workPackageId: p.workPackageId,
          items: p.groups.flatMap((gr) => gr.items.map((i) => ({ key: i.key, status: 'loaded' }))),
        })
      const pk = (await (await w.request.get(`/api/v1/staff/jobs/${jobId}/packet`)).json()) as {
        packet: { version: number; contentSha256: string }
      }
      await worker.write('POST', `/api/v1/staff/jobs/${jobId}/packet/views`, { version: pk.packet.version })
      await worker.write('POST', `/api/v1/staff/jobs/${jobId}/packet/acknowledgments`, {
        version: pk.packet.version,
        contentSha256: pk.packet.contentSha256,
      })
      await worker.write('POST', `/api/v1/staff/visits/${visitId}/start`, { packetVersion: pk.packet.version })

      // The worker opens the Job photos page from the briefing and adds an after photo paired with the before photo.
      await w.goto(`/staff/start/${visitId}`)
      await w.getByRole('link', { name: 'Open the job photos' }).click()
      await expect(w.getByRole('heading', { level: 1, name: `Job photos — ${link.reference}` })).toBeVisible()
      const form = w.getByRole('form', { name: /^Add a photo — visit \d+$/ })
      await expect(form.getByLabel('After')).toBeChecked()
      await form.getByLabel('Area or task (optional)').fill('Synthetic: hallway wall')
      await form.getByLabel('Pairs with').selectOption({ label: 'Before photo 1' })
      await form.getByLabel('Photo', { exact: true }).setInputFiles({
        name: 'after.png',
        mimeType: 'image/png',
        buffer: png(2),
      })
      await expect(form.getByRole('status')).toHaveText('Photo uploaded. It is processed before it can be shared.')
      await form.getByLabel('Pairs with').selectOption({ label: 'No pair' })
      await form.getByLabel('Photo', { exact: true }).setInputFiles({
        name: 'after-2.png',
        mimeType: 'image/png',
        buffer: png(3),
      })
      const photos = w.getByTestId('field-photo')
      await expect(photos).toHaveCount(3)
      const paired = photos.filter({ has: w.getByText('After photo 1', { exact: true }) })
      await expect(paired).toContainText('Synthetic: hallway wall')
      await expect(paired).toContainText('Pairs with before photo 1')
      await expect(paired).toContainText('Internal')
      // A worker never shares.
      await expect(w.getByRole('button', { name: 'Share with the customer' })).toHaveCount(0)
      await axe(w)

      // Office shares the before and the paired after photo once processing has checked them.
      const o = office.page
      await o.goto(`/staff/job-photos/${jobId}`)
      const shareIn = (name: string) => o.getByTestId('field-photo').filter({ has: o.getByText(name, { exact: true }) })
      await expect(async () => {
        await o.reload()
        await expect(shareIn('Before photo 1').getByRole('button', { name: 'Share with the customer' })).toBeVisible({
          timeout: 1000,
        })
        await expect(shareIn('After photo 1').getByRole('button', { name: 'Share with the customer' })).toBeVisible({
          timeout: 1000,
        })
        // Uploaded last, so processed last: wait for it too before the page stops reloading.
        await expect(shareIn('After photo 2').getByRole('button', { name: 'Share with the customer' })).toBeVisible({
          timeout: 1000,
        })
      }).toPass({ timeout: 30_000 })
      for (const name of ['Before photo 1', 'After photo 1']) {
        await shareIn(name).getByRole('button', { name: 'Share with the customer' }).click()
        await expect(shareIn(name).getByRole('button', { name: 'Stop sharing' })).toBeVisible()
      }
      await expect(shareIn('After photo 2').getByRole('button', { name: 'Share with the customer' })).toBeVisible()
      await expect(shareIn('After photo 1').getByTestId('field-photo-publication')).toHaveText(
        'Marketing use: no permission recorded.',
      )
      await axe(o)

      // The customer's Photos tab: the pair by service; never the internal photo or the worker's label.
      const listed = (await (await o.request.get(`/api/v1/staff/jobs/${jobId}/photos`)).json()) as {
        photos: { id: string; phase: string; pairOf: string | null; visibility: string }[]
      }
      const internal = listed.photos.find((p) => p.visibility === 'internal_operational')?.id as string
      const sharedAfter = listed.photos.find((p) => p.phase === 'after' && p.pairOf)?.id as string
      await page.goto(`/portal/p/${link.reference}/photos`)
      await expect(page.getByRole('heading', { name: 'Before and after photos from HandyHub' })).toBeVisible()
      const shared = page.getByTestId('portal-shared-photos')
      await expect(shared.getByRole('img')).toHaveCount(2)
      await expect(shared.getByRole('img', { name: /: before$/ })).toHaveCount(1)
      await expect(shared.getByRole('img', { name: /: after$/ })).toHaveCount(1)
      await expect(page.getByRole('main')).not.toContainText('hallway')
      expect(await page.content()).not.toContain(internal)
      await axe(page)
      const byId = (id: string) =>
        page.evaluate(
          async (u) => (await fetch(u, { credentials: 'same-origin' })).status,
          `/api/v1/customer/projects/${link.reference}/photos/${id}`,
        )
      expect(await byId(internal)).toBe(404)
      expect(await byId(sharedAfter)).toBe(200)

      // On a phone nothing scrolls sideways.
      await page.setViewportSize({ width: 375, height: 740 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    } finally {
      await estimator.close()
      await office.close()
      await worker.close()
    }
  })
})
