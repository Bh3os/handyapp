// Privacy requests and customer downloads in a real browser (TSK-0100; HH-PRIV-03, HH-PRIV-06, T68, ENT-PrivacyRequest,
// OWN-DEC-113). A guest opens the project with the secure link and a code (TSK-0034); an Estimator of this spec
// publishes an estimate through the staff API; the customer downloads its PDF from the Documents tab and asks for a
// copy of their data; the Owner reviews and completes the request in the staff app; the customer downloads the export
// as a file. TSK-0136 (HH-PRIV-07): the request carries its acknowledgment and dates in the portal and in the staff
// app, and the Owner extends its internal target with a reason the customer then sees. The file sorts after the staff
// sign-in spec, which must find no Owner yet. Estimate terms are recorded as "owner review pending" for this spec's run only and restored to NOT
// CONFIGURED afterwards (as the portal estimate spec does). The Owner account is created by whichever spec runs first;
// this one only sets its password with a link. Every visitor, address, account and amount is synthetic
// (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createDb } from '@handyhub/db'
import { ESTIMATE_TERMS } from '@handyhub/domain/legal'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'
import { passSecondFactor } from '../mfa.js'
import { expectAccessible } from '../a11y.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.100' }
test.use({ extraHTTPHeaders: HEADERS })

const serverCli = (name: string) => fileURLToPath(new URL(`../../server/dist/cli/${name}.js`, import.meta.url))
const OWNER = 'e2e-owner@example.test'
const ESTIMATOR = 'e2e-privacy-estimator@example.test'
// A per-run suffix in base 36 (never raw digits in free text).
const RUN = Date.now().toString(36)
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (who: string) => ['synthetic', 'privacy', who, 'passphrase', '100'].join(' ')

function run(name: string, ...args: string[]): string {
  return execFileSync(process.execPath, [serverCli(name), ...args], {
    env: { ...process.env, HANDYHUB_ENV: 'ci', DATABASE_URL: databaseUrl, PORT: port, HOST: '127.0.0.1' },
    encoding: 'utf8',
    stdio: 'pipe',
  })
}
const linkPath = (out: string) => new URL(out.split('\n')[0] as string).pathname
/** The first Owner's invite, or a reset link when another spec already created the Owner. */
function ownerLink(): string {
  try {
    return linkPath(run('staff-access', 'create-owner', OWNER, 'E2E Owner'))
  } catch {
    return linkPath(run('staff-access', 'password-link', OWNER))
  }
}

async function axe(page: Page) {
  await expectAccessible(page)
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-privacy' })
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

/** A request sent through the API (the wizard has its own specs): its reference, IDs and access link token. */
async function sendRequest(request: APIRequestContext) {
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `synthetic-e2e-privacy-${RUN}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic privacy project: a scuffed hallway wall.',
      property: {
        street: '100 Synthetic Privacy Row',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Test Privacy Customer',
        email: `privacy-e2e-${RUN}@example.test`,
        phone: '(502) 555-0100',
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

/** Opens the link, enters the emailed code, and goes on to the project page in the portal. */
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
  await page.getByRole('link', { name: 'Go to your project page' }).click()
  await expect(page.getByRole('heading', { level: 1, name: `Project ${link.reference}` })).toBeVisible()
}

/** A staff member signed in through the staff app in a browser of their own; writes go through the staff API. */
async function staffSession(browser: Browser, email: string, link: string, password: string) {
  const context = await browser.newContext({ extraHTTPHeaders: HEADERS, acceptDownloads: true })
  const page = await context.newPage()
  await page.goto(link)
  await page.getByLabel('New password').fill(password)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
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
        'idempotency-key': ['e2e', 'privacy', RUN, String(++k)].join('-'),
        ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
      },
    })
    expect(res.status(), await res.text()).toBeLessThan(300)
    return res.json() as Promise<Record<string, unknown>>
  }
  return { page, write, close: () => context.close() }
}

/** This spec's Estimator: an account of its own, added straight to the database (the first Owner is another spec's). */
async function estimatorSession(browser: Browser) {
  await withDb(async (db) => {
    const existing = await db
      .selectFrom('identity.staff_users')
      .select('id')
      .where('email', '=', ESTIMATOR)
      .executeTakeFirst()
    if (existing) return
    const user = await db
      .insertInto('identity.staff_users')
      .values({ email: ESTIMATOR, display_name: 'E2E Privacy Estimator', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: 'estimator', issued_by: 'e2e:privacy', reason: null })
      .execute()
  })
  return staffSession(browser, ESTIMATOR, linkPath(run('staff-access', 'password-link', ESTIMATOR)), pw('estimator'))
}

const CHECKS = Object.fromEntries(
  ['coverage', 'service_fit', 'essential_facts', 'urgency', 'site_visit_need', 'staff_equipment', 'risk_flags'].map(
    (c) => [c, { outcome: 'ok' }],
  ),
)

test.describe('privacy requests and customer downloads (TSK-0100)', () => {
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
    await recordVersion('legal.estimate_terms', null, ['HH-EST-13', 'OWN-DEC-127', 'OQ-ATTORNEY-TERMS'])
  })

  test('[HH-PRIV-06][T68][HH-PRIV-03][HH-PRIV-07] the customer downloads their estimate, asks for their data, and gets it once the Owner completes it', async ({
    page,
    request,
    browser,
  }) => {
    const link = await sendRequest(request)
    const estimator = await estimatorSession(browser)
    let number: string
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
      number = created['number'] as string
      const draft = (await (
        await estimator.page.request.get(`/api/v1/staff/estimate-versions/${versionId}`)
      ).json()) as {
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
              description: 'Synthetic: repaint the hallway wall',
              quantity: '1',
              unit: 'job',
              unitPriceCents: 48_000,
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
    } finally {
      await estimator.close()
    }

    // The Documents tab: the download link is issued only when asked for, short-lived, for this customer's estimate.
    await openProject(page, link)
    await page.getByRole('tab', { name: 'Documents' }).click()
    const docs = page.getByRole('tabpanel', { name: 'Documents' })
    const get = docs.getByRole('button', { name: `Download estimate ${number}, version 1` })
    await expect(get).toHaveCount(1)
    await get.click()
    const pdf = docs.getByRole('link', { name: /^Estimate PDF \(\d+ KB\)$/ })
    await expect(pdf).toBeVisible()
    expect(await pdf.getAttribute('href')).toMatch(/^https:\/\//)
    await expect(docs.getByText('These links work for a few minutes. Ask for them again any time.')).toBeVisible()
    await axe(page)

    // Your data and privacy requests: the session was verified moments ago, so the customer can ask.
    await page.getByRole('link', { name: 'Your data and privacy requests' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Your data and privacy requests' })).toBeVisible()
    await expect(page.getByText("You haven't made a privacy request.")).toBeVisible()
    await axe(page)
    await page.getByRole('button', { name: 'Ask for a copy of my data' }).click()
    await expect(page.getByText("Your request was sent. HandyHub's owner will review it.")).toBeVisible()
    const mine = page.getByRole('list', { name: 'Your requests' })
    const item = mine.getByRole('listitem').filter({ hasText: 'Copy of my data' })
    await expect(item).toHaveCount(1)
    await expect(item.getByText('Received', { exact: true })).toBeVisible()
    // TSK-0136: the automatic acknowledgment, the follow-up date and the internal target (portal only).
    await expect(item.getByText(/^We received this request on /)).toBeVisible()
    await expect(item.getByText(/^We'll follow up on it by /)).toBeVisible()
    await expect(item.getByText(/^We aim to complete it by /)).toBeVisible()
    const reference = (await item.getByText(/^Copy of my data \(PR-\d+\)$/).textContent())?.match(
      /PR-\d+/,
    )?.[0] as string
    expect(reference).toMatch(/^PR-\d{6,}$/)

    // The Owner reviews and completes it in the staff app.
    const owner = await staffSession(browser, OWNER, ownerLink(), pw('owner'))
    try {
      await owner.page.getByRole('link', { name: 'Privacy requests' }).click()
      await expect(owner.page.getByRole('heading', { level: 1, name: 'Privacy requests' })).toBeVisible()
      const entry = owner.page.getByRole('listitem', { name: `${reference}: Data export` })
      await expect(entry).toHaveCount(1)
      await entry.getByRole('button', { name: 'Open' }).click()
      const detail = owner.page.getByTestId('privacy-detail')
      // TSK-0136: the dates as the server counted them; the legal deadline is a separate field, not recorded yet.
      await expect(detail.getByText(/^Substantive acknowledgment due by the end of /)).toBeVisible()
      await expect(detail.getByText(/^Internal target: .*not a legal deadline\.$/)).toBeVisible()
      await expect(detail.getByText(/^Legal deadline: not recorded/)).toBeVisible()
      await expect(detail.getByText(/Estimates never accepted: 1/)).toBeVisible()
      await axe(owner.page)
      // The Owner extends the internal target with a reason; the customer sees both.
      const listed = (await (await owner.page.request.get('/api/v1/staff/privacy-requests?state=received')).json()) as {
        items: { reference: string; deadlines: { targetOn: string } }[]
      }
      const targetOn = listed.items.find((i) => i.reference === reference)?.deadlines.targetOn as string
      const later = new Date(`${targetOn}T12:00:00Z`)
      later.setUTCDate(later.getUTCDate() + 10)
      const laterOn = later.toISOString().slice(0, 10)
      const extend = detail.getByTestId('privacy-extend')
      await extend.getByLabel('New target date').fill(laterOn)
      await extend
        .getByLabel('Reason the customer is told (required)')
        .fill('Synthetic e2e: records from an archived job.')
      await extend.getByRole('button', { name: 'Extend the target' }).click()
      await expect(extend.getByText('The internal target is extended.')).toBeVisible()
      await expect(detail.getByText(/^Extended from .*: Synthetic e2e: records from an archived job\.$/)).toBeVisible()
      await axe(owner.page)
      await page.reload()
      const notice = page
        .getByRole('list', { name: 'Your requests' })
        .getByRole('listitem')
        .filter({ hasText: reference })
      await expect(
        notice.getByText(
          /^We need more time: we now aim to complete it by .*\. Why: Synthetic e2e: records from an archived job\.$/,
        ),
      ).toBeVisible()
      await detail.getByRole('button', { name: 'Start the review' }).click()
      await expect(detail.getByText('Under review')).toBeVisible()
      await detail.getByLabel('Reason (required)').fill('Synthetic e2e: identity confirmed by code; export prepared.')
      // TSK-0152 (OWN-DEC-201 I1): an export is elevated: the Owner confirms the identity evidence first.
      await detail.getByRole('checkbox', { name: /^I checked the identity evidence above/ }).check()
      await detail.getByRole('button', { name: 'Record the decision' }).click()
      await expect(
        detail.getByText('The data export is available to the customer in their project page.'),
      ).toBeVisible()
      await axe(owner.page)
    } finally {
      await owner.close()
    }

    // Back in the portal: the request is done and the export downloads as a file holding the customer's own data.
    await page.reload()
    const done = page.getByRole('list', { name: 'Your requests' }).getByRole('listitem').filter({ hasText: reference })
    await expect(done.getByText('Done', { exact: true })).toBeVisible()
    const download = page.waitForEvent('download')
    await done.getByRole('button', { name: 'Download my data' }).click()
    const file = await download
    expect(file.suggestedFilename()).toBe(`handyhub-data-${reference}.json`)
    const data = JSON.parse(await readFile(await file.path(), 'utf8')) as {
      contact: { fullName: string }
      requests: { reference: string }[]
      estimates: { number: string }[]
      excluded: string[]
    }
    expect(data.contact.fullName).toBe('Test Privacy Customer')
    expect(data.requests.map((r) => r.reference)).toEqual([link.reference])
    expect(data.estimates.map((e) => e.number)).toEqual([number])
    expect(data.excluded).toContain('third_party_contacts')
    await axe(page)
  })
})
