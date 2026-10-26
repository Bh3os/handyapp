// Spanish worker notes and proposed replies, and the Office review, in real browsers (TSK-0155; HH-COM-16, HH-COM-08,
// HH-COM-01, HH-LANG-04, HH-A11Y-01, OWN-DEC-211, OWN-DEC-162, RULE-LANGUAGES, RULE-AI-WAVE2). An Estimator of this spec
// publishes an estimate through the staff API and the customer approves it through the customer API; the confirmed
// work visit is a fixture early today (as in staff-escalation.spec.ts). The worker reads the staff app in Spanish on a
// phone-sized screen: from My Day they write an internal note and a proposed reply in Spanish and send it for review.
// Office finds it in the action queue, asks a question, the worker answers on My Day, and Office writes the English
// message and sends it with explicit approval. The customer's Messages tab shows only the English message; the worker
// sees Sent. No estimate terms version is recorded by the migrations: this spec records a synthetic "approved and
// attorney-reviewed" v1.0 for its own run only and restores NOT CONFIGURED afterwards (a test fixture, never the owner's
// sign-off). axe checks each state. Every visitor, address, account, name and text is synthetic (RULE-SYNTHETIC-DATA).
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
import { passSecondFactor } from '../mfa.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form allows 5 per network an hour.
const HEADERS = { 'x-forwarded-for': '198.51.100.155' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const ESTIMATOR = 'e2e-proposals-estimator@example.test'
const WORKER = 'e2e-proposals-worker@example.test'
const OFFICE = 'e2e-proposals-office@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'proposals', 'passphrase', '155'].join(' ')
const ZONE = 'America/Kentucky/Louisville'
// Free text carries the run in base 36 (a long digit run could pass the Luhn check and be refused as a card number).
const run = Date.now().toString(36)

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-proposals' })
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
    headers: { 'idempotency-key': ['synthetic', 'e2e', 'proposals', 'request', run].join('-') },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic proposals project: a wall patch.',
      property: {
        street: '155 Synthetic Proposal Court',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: {
        fullName: 'Test Proposal Customer',
        email: `proposals-e2e-${run}@example.test`,
        phone: '(502) 555-0155',
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

/** Opens the link and enters the emailed code: the customer's session is verified and so is their email. */
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

function staffAccess(...args: string[]): string {
  const out = execFileSync(process.execPath, [cli, ...args], {
    env: { ...process.env, HANDYHUB_ENV: 'ci', DATABASE_URL: databaseUrl, PORT: port, HOST: '127.0.0.1' },
    encoding: 'utf8',
    stdio: 'pipe',
  })
  return new URL(out.split('\n')[0] as string).pathname
}

/** Sets the password from a link and signs in through the staff app (with the mandatory second factor). */
async function signInFrom(page: Page, linkPath: string, email: string, home: string | RegExp) {
  await page.goto(linkPath)
  await page.getByLabel('New password').fill(pw)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(pw)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await passSecondFactor(page)
  await expect(page.getByRole('heading', { level: 1, name: home })).toBeVisible()
}

type Role = 'estimator' | 'worker' | 'office'
/**
 * One of this spec's staff accounts, added straight to the database (the first Owner is created by the staff sign-in
 * spec, which must find no Owner yet whatever order the specs run in), signed in through the staff app in a browser of
 * its own (the worker's on a phone-sized screen); writes go through the staff API with the session.
 */
async function staffSession(browser: Browser, email: string, role: Role, home: string | RegExp) {
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
          display_name: role === 'worker' ? 'Proposalworker Synthetic' : `E2E Proposals ${role}`,
          locale: 'en',
          ...(role === 'worker' ? { status: 'active', activated_at: new Date() } : {}),
        })
        .returning('id')
        .executeTakeFirstOrThrow()
      await tx.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
      await tx
        .insertInto('identity.role_grants')
        .values({ staff_user_id: user.id, kind: 'role', name: role, issued_by: 'e2e:proposals', reason: null })
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
  const context = await browser.newContext({
    extraHTTPHeaders: HEADERS,
    ...(role === 'worker' ? { viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true } : {}),
  })
  const page = await context.newPage()
  await signInFrom(page, staffAccess('password-link', email), email, home)
  const csrf = ((await (await page.request.get('/api/v1/staff/auth/session')).json()) as { csrfToken: string })
    .csrfToken
  let k = 0
  const write = async (method: 'POST' | 'PUT', url: string, data: unknown, version?: number) => {
    const res = await page.request.fetch(url, {
      method,
      data,
      headers: {
        'x-csrf-token': csrf,
        'idempotency-key': ['synthetic', 'e2e', 'proposals', role, run, String(++k)].join('-'),
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

test.describe('Spanish worker notes and proposed replies (TSK-0155)', () => {
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

  test('[HH-COM-16][HH-COM-08][HH-LANG-04][RULE-LANGUAGES][HH-A11Y-01] a Spanish proposal on a phone, a clarification round trip, and the English reply Office sends', async ({
    page,
    request,
    browser,
  }) => {
    const estimator = await staffSession(browser, ESTIMATOR, 'estimator', 'Action queue')
    // The worker's language is kept on their account: Spanish after a first run on this database.
    const worker = await staffSession(browser, WORKER, 'worker', /^(My Day|Mi Día)$/)
    const office = await staffSession(browser, OFFICE, 'office', 'Action queue')
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
              fullName: 'Test Proposal Customer',
            }),
          })
          return { step: 'approve', status: res.status, body: await res.text() }
        },
        {
          url,
          terms: { documentId: ESTIMATE_TERMS.documentId, sha256: ESTIMATE_TERMS.contentSha256 },
          key: ['e2e', 'proposals', 'approve', run].join('-'),
        },
      )
      expect(approved, JSON.stringify(approved)).toMatchObject({ step: 'approve', status: 201 })
      const jobId = (
        await withDb((db) =>
          db.selectFrom('work.jobs').select('id').where('project_id', '=', link.projectId).executeTakeFirstOrThrow(),
        )
      ).id
      await todaysVisit(link, jobId, worker.id)

      // The worker reads the staff app in Spanish and writes from My Day, on a phone.
      await worker.write('PUT', '/api/v1/staff/auth/session/locale', { locale: 'es' })
      const w = worker.page
      await w.goto('/staff/my-day')
      await w.getByTestId('myday-notes').click()
      const notes = w.getByTestId('job-notes')
      await expect(notes.getByRole('heading', { level: 1 })).toHaveText(
        `Notas y respuestas propuestas · Proyecto ${link.reference}`,
      )
      await expect(notes.getByText(/Nada de lo que escriba aquí llega al cliente/)).toBeVisible()
      const note = `Sintético ${run}: la pared tiene humedad detrás del zócalo.`
      await notes.getByRole('textbox', { name: 'Nota', exact: true }).fill(note)
      await notes.getByRole('button', { name: 'Guardar la nota' }).click()
      await expect(notes.getByTestId('job-notes-notice')).toHaveText('Nota guardada para el equipo.')
      await expect(notes.getByTestId('job-notes-list').getByText(note)).toBeVisible()
      const spanish = `Sintético ${run}: dígale al cliente que volvemos el martes con la pieza.`
      await notes.getByRole('textbox', { name: /^Respuesta propuesta/ }).fill(spanish)
      await notes.getByRole('button', { name: 'Enviar para revisión' }).click()
      await expect(notes.getByTestId('job-notes-notice')).toHaveText(
        'Enviada para revisión. El Dueño u Oficina la revisará.',
      )
      await expect(notes.getByTestId('own-proposal').getByTestId('proposal-status')).toHaveText('En espera de revisión')
      expect(await w.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
      await axe(w)

      // Office finds it in the action queue and opens the review.
      const o = office.page
      const queue = o.locator('.staff-queue__list-wrap').first()
      await queue.getByLabel('Reference').fill(link.reference)
      const item = o.getByRole('listitem', { name: new RegExp(`Proposed reply to review ${link.reference}`) })
      await expect(async () => {
        await queue.getByRole('button', { name: 'Apply filters' }).click()
        await expect(item).toBeVisible({ timeout: 1000 })
      }).toPass({ timeout: 20_000 })
      await expect(item.getByText(/A worker proposed a reply to the customer/)).toBeVisible()
      await expect(item.getByText(spanish)).toHaveCount(0)
      await axe(o)
      await item.getByRole('link', { name: 'Review the proposed reply' }).click()
      const review = o.getByTestId('proposal-review')
      await expect(review.getByTestId('proposal-original')).toHaveText(spanish)
      await expect(review.getByTestId('proposal-status')).toHaveText('Awaiting Review')
      await axe(o)
      await review.getByRole('textbox', { name: /^Question/ }).fill('Which part are we bringing? (synthetic)')
      await review.getByRole('button', { name: 'Ask for clarification' }).click()
      await expect(review.getByTestId('proposal-notice')).toContainText('Question sent to the worker')

      // The worker sees the question on My Day and answers it.
      await w.goto('/staff/my-day')
      const mine = w.getByTestId('my-reply-proposals')
      await expect(mine.getByTestId('proposal-question')).toContainText('Which part are we bringing? (synthetic)')
      await expect(mine.getByText('Se pidió una aclaración').first()).toBeVisible()
      await mine.getByRole('textbox', { name: 'Su respuesta' }).fill(`Sintético ${run}: la bisagra de la puerta.`)
      await mine.getByRole('button', { name: 'Enviar la respuesta' }).click()
      await expect(mine.getByTestId('proposal-question')).toHaveCount(0)
      await axe(w)

      // Office writes the English message and sends it only with explicit approval.
      await o.reload()
      await expect(review.getByText(`Sintético ${run}: la bisagra de la puerta.`)).toBeVisible()
      const composer = o.getByRole('region', { name: 'Write the English reply' })
      const english = `Synthetic ${run}: we will be back on Tuesday with the door hinge.`
      await composer.getByRole('textbox', { name: /^Reply/ }).fill(english)
      await expect(composer.getByRole('button', { name: 'Send' })).toBeDisabled()
      await composer.getByLabel(/I reviewed this message: it is in English/).check()
      await composer.getByRole('button', { name: 'Send' }).click()
      await expect(review.getByTestId('proposal-status')).toHaveText('Sent')
      await axe(o)

      // The customer reads only the English message; the note and the Spanish original never reach the portal.
      await page.goto(`/portal/p/${link.reference}`)
      await page.getByRole('tab', { name: 'Messages' }).click()
      const messages = page.getByRole('tabpanel')
      await expect(messages.getByText(english)).toBeVisible()
      await expect(messages.getByText(spanish)).toHaveCount(0)
      await expect(messages.getByText(note)).toHaveCount(0)
      await axe(page)

      // The worker sees Sent.
      await w.goto('/staff/my-day')
      await expect(
        w.getByTestId('my-reply-proposals').getByTestId('own-proposal').first().getByTestId('proposal-status'),
      ).toHaveText('Enviada')
    } finally {
      await estimator.close()
      await worker.close()
      await office.close()
    }
  })
})
