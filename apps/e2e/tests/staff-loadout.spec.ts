// Loadout confirmation and critical shortages in real browsers (TSK-0071; HH-PKT-05, HH-PKT-06, HH-WORK-02,
// HH-A11Y-01, T43, T45). An Estimator of this spec publishes an estimate through the staff API and the customer approves
// it through the customer API after opening the project with the link and a code; this spec's Office user plans and
// confirms a work visit with this spec's worker (working hours every day 08:00-20:00: a synthetic fixture, not the
// business's hours). The worker opens the job's loadout from its packet, states what is loaded and reports a required
// item missing: a task block on that work package, with its owner and action. The Owner finds it in the action queue,
// starts the review, cannot resolve it as provided until the worker states the item loaded, then resolves it. No
// estimate terms version is recorded by the migrations: this spec records a synthetic "approved and
// attorney-reviewed" v1.0 for its own run only and restores NOT CONFIGURED afterwards (a test fixture, never the
// owner's sign-off). axe checks each state. Every visitor, address, account, name and note is synthetic
// (RULE-SYNTHETIC-DATA); the loadout lists are the imported FACT-INVENTORY lists.
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
const HEADERS = { 'x-forwarded-for': '198.51.100.173' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const ESTIMATOR = 'e2e-loadout-estimator@example.test'
const OFFICE = 'e2e-loadout-office@example.test'
const WORKER = 'e2e-loadout-worker@example.test'
const OWNER = 'e2e-owner@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'loadout', 'passphrase', '71'].join(' ')
const ZONE = 'America/Kentucky/Louisville'
/** A run-unique suffix in base 36 (never a long run of digits in free text). */
const run = Date.now().toString(36)

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-loadout' })
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
    headers: { 'idempotency-key': ['synthetic', 'e2e', 'loadout', run].join('-') },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic loadout project: a wall patch.',
      property: {
        street: '171 Synthetic Loadout Court',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Test Loadout Customer',
        email: `loadout-e2e-${run}@example.test`,
        phone: '(502) 555-0171',
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
          display_name: `E2E Loadout ${role}`,
          locale: 'en',
          ...(role === 'worker' ? { status: 'active', activated_at: new Date() } : {}),
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      await tx.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
      await tx
        .insertInto('identity.role_grants')
        .values({ staff_user_id: user.id, kind: 'role', name: role, issued_by: 'e2e:loadout', reason: null })
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
        'idempotency-key': ['synthetic', 'e2e', 'loadout', role, run, String(++k)].join('-'),
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

test.describe('Loadout confirmation and critical shortages (TSK-0071)', () => {
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

  test('[HH-PKT-05][HH-PKT-06][HH-WORK-02][T43][T45][HH-A11Y-01] the worker reports a missing required item; only the Owner resolves the task block once it is loaded', async ({
    page,
    request,
    browser,
  }) => {
    const link = await sendRequest(request)
    const estimator = await staffSession(browser, ESTIMATOR, 'estimator', 'Action queue')
    const office = await staffSession(browser, OFFICE, 'office', 'Action queue')
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
              fullName: 'Test Loadout Customer',
            }),
          })
          return { step: 'approve', status: res.status, body: await res.text() }
        },
        {
          url,
          terms: { documentId: ESTIMATE_TERMS.documentId, sha256: ESTIMATE_TERMS.contentSha256 },
          key: ['e2e', 'loadout', 'approve', run].join('-'),
        },
      )
      expect(approved, JSON.stringify(approved)).toMatchObject({ step: 'approve', status: 201 })
      const jobId = (
        await withDb((db) =>
          db.selectFrom('work.jobs').select('id').where('project_id', '=', link.projectId).executeTakeFirstOrThrow(),
        )
      ).id

      // Office plans the work visit and confirms it with the worker.
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
      await office.write('POST', `/api/v1/staff/visits/${visit.id}/confirm`, { workerIds: [worker.id] }, visit.version)

      // The worker opens the packet from My Day: the loadout list is in it, and the link opens the loadout.
      const w = worker.page
      await w.reload()
      const open = w.getByTestId('my-job-packets').getByRole('link', { name: `Job packet: project ${link.reference}` })
      await expect(open).toHaveCount(1)
      await open.click()
      const packet = w.getByTestId('job-packet')
      const materials = packet.getByRole('region', { name: 'Tools, equipment and materials' })
      await expect(materials.getByTestId('packet-loadout')).toContainText('Loadout for Patching & Repair')
      await expect(materials.getByText('Tape Measure', { exact: true })).toBeVisible()
      await packet.getByTestId('packet-loadout-link').click()
      const loadout = w.getByTestId('job-loadout')
      await expect(loadout.getByRole('heading', { level: 1, name: `Loadout — ${link.reference}` })).toBeVisible()
      const pkg = loadout.getByTestId('loadout-package')
      await expect(pkg.getByTestId('loadout-readiness')).toHaveText('Not confirmed yet')
      await expect(pkg.getByText('15 required items not confirmed loaded yet.')).toBeVisible()
      await axe(w)

      // Loaded for the first item, Missing for the tape measure, with what the worker sees.
      const items = pkg.getByTestId('loadout-item')
      const first = items.filter({ hasText: 'Stainless Steel Taping Knives Set' })
      const tape = items.filter({ hasText: 'Tape Measure' })
      await expect(tape).toHaveCount(1)
      await first.getByRole('radio', { name: 'Loaded' }).check()
      await tape.getByRole('radio', { name: 'Missing' }).check()
      await tape.getByLabel('What you see (optional)').fill('Synthetic: not in the van')
      await pkg.getByRole('button', { name: 'Save the loadout for Patching & Repair' }).click()
      await expect(pkg.getByText('Saved. 1 task block raised: Start Work is blocked for this service.')).toBeVisible()
      await expect(pkg.getByTestId('loadout-readiness')).toHaveText('Blocked: critical shortage')
      const block = pkg.getByTestId('loadout-block')
      await expect(block).toContainText('Tape Measure: Synthetic: not in the van')
      await expect(block).toContainText('Owner: the Owner. Action: provide the item, or approve a named substitute')
      await expect(block.getByRole('button')).toHaveCount(0)
      await expect(first.getByTestId('loadout-item-status')).toHaveText('Loaded')
      await expect(tape.getByTestId('loadout-item-status')).toHaveText('Missing')
      await axe(w)

      // The Owner finds the shortage in the action queue and opens the loadout.
      await page.goto(ownerLink())
      await page.getByLabel('New password').fill(pw)
      await page.getByRole('button', { name: 'Save password' }).click()
      await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
      await page.goto('/staff/sign-in')
      await page.getByLabel('Email').fill(OWNER)
      await page.getByLabel('Password', { exact: true }).fill(pw)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
      const queue = page.locator('.staff-queue__list-wrap').first()
      await queue.getByLabel('Reference').fill(link.reference)
      const item = page.getByRole('listitem', { name: new RegExp(`Critical loadout shortage ${link.reference}`) })
      await expect(async () => {
        await queue.getByRole('button', { name: 'Apply filters' }).click()
        await expect(item).toHaveCount(1, { timeout: 1000 })
      }).toPass({ timeout: 20_000 })
      await expect(item).toContainText('A required loadout item is missing or damaged')
      await item.getByRole('link', { name: 'Review the shortage' }).click()
      const owner = page.getByTestId('job-loadout')
      await expect(owner.getByRole('heading', { level: 1, name: `Loadout — ${link.reference}` })).toBeVisible()
      // The Owner is not assigned: no statement controls, only the block's actions.
      await expect(owner.getByRole('radio', { name: 'Loaded' })).toHaveCount(0)
      const ownerBlock = owner.getByTestId('loadout-block')
      await ownerBlock.getByRole('button', { name: 'Start review' }).click()
      await expect(ownerBlock).toContainText('Under review')
      // Not provided yet: the worker has not stated it loaded since the block.
      await ownerBlock.getByRole('radio', { name: 'The item was provided and is loaded' }).check()
      await ownerBlock.getByLabel('How it was resolved').fill('Synthetic: a tape measure was added to the van')
      await ownerBlock.getByLabel('Who assessed it').fill('E2E Owner')
      await ownerBlock.getByRole('button', { name: 'Resolve' }).click()
      await expect(
        ownerBlock.getByText('The item has not been stated as loaded since the block was raised.'),
      ).toBeVisible()
      await axe(page)

      // The worker states it loaded: recorded, and the block still stands.
      await w.reload()
      await expect(pkg.getByTestId('loadout-readiness')).toHaveText('Blocked: critical shortage')
      await tape.getByRole('radio', { name: 'Loaded' }).check()
      await pkg.getByRole('button', { name: 'Save the loadout for Patching & Repair' }).click()
      await expect(pkg.getByText('Saved.', { exact: true })).toBeVisible()
      await expect(pkg.getByTestId('loadout-readiness')).toHaveText('Blocked: critical shortage')

      // Now the Owner resolves it.
      await page.reload()
      const again = owner.getByTestId('loadout-block')
      await again.getByRole('radio', { name: 'The item was provided and is loaded' }).check()
      await again.getByLabel('How it was resolved').fill('Synthetic: a tape measure was added to the van')
      await again.getByLabel('Who assessed it').fill('E2E Owner')
      await again.getByRole('button', { name: 'Resolve' }).click()
      await expect(again).toContainText(
        'Resolved: Synthetic: a tape measure was added to the van (reviewed by E2E Owner)',
      )
      await expect(owner.getByTestId('loadout-readiness')).toHaveText('Not confirmed yet')
      const hold = await withDb((db) =>
        db
          .selectFrom('work.holds')
          .select(['kind', 'state', 'category', 'raised_by', 'resolved_by'])
          .where('project_id', '=', link.projectId)
          .executeTakeFirstOrThrow(),
      )
      expect(hold).toMatchObject({ kind: 'task_block', state: 'resolved', category: 'critical_resource' })
      expect(hold.raised_by).toBe(worker.id)
      const queueItem = await withDb((db) =>
        db
          .selectFrom('ops.queue_items')
          .select('resolution')
          .where('type', '=', 'loadout_shortage')
          .where('subject_id', '=', jobId)
          .executeTakeFirstOrThrow(),
      )
      expect(queueItem.resolution).toBe('blocks_cleared')

      // On a phone nothing scrolls sideways.
      await w.reload()
      await w.setViewportSize({ width: 375, height: 740 })
      await expect(pkg.getByTestId('loadout-readiness')).toBeVisible()
      expect(await w.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    } finally {
      await estimator.close()
      await office.close()
      await worker.close()
    }
  })
})
