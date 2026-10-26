// The erasure of a request that never became a job, in a real browser (TSK-0137; HH-PRIV-08, HH-PRIV-05, OWN-DEC-176).
// A request is sent through the public API and closed "Not a fit" by the Owner through the staff API. Its review entry
// is recorded the way the retention scan opens one, but now, so the period has not ended (the spec never backdates the
// request): the Owner's Delete is an early deletion with a recorded reason (OWN-DEC-70). The Owner opens the Delete
// confirmation, sees what goes and what remains (the reference, dates and status), confirms every check the software
// cannot run and deletes; afterwards only the remainder and the deletion log (references only) hold the reference,
// and nothing holds the name, the address or the description. Nothing is deleted automatically. The Owner account is
// created by whichever spec runs first; this one only sets its password with a link. Every visitor, address and
// account is synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type Page } from '@playwright/test'
import { passSecondFactor } from '../mfa.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
// This spec's own synthetic client address (RFC 5737): the request form and the sign-in limits count per network.
const HEADERS = { 'x-forwarded-for': '198.51.100.137' }
test.use({ extraHTTPHeaders: HEADERS })

const serverCli = (name: string) => fileURLToPath(new URL(`../../server/dist/cli/${name}.js`, import.meta.url))
const OWNER = 'e2e-owner@example.test'
// A per-run suffix in base 36 (never raw digits in free text).
const RUN = Date.now().toString(36)
const NAME = `Test Erasure Customer ${RUN}`
const STREET = `100 Synthetic Erasure ${RUN} Row`
const DESCRIPTION = `Synthetic erasure project ${RUN}: a scuffed hallway wall.`
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (n: number) => ['synthetic', 'request', 'erasure', 'passphrase', String(n)].join(' ')

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
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

/** A raw query through the e2e connection (the catalog names the tables; values are parameters). */
const raw = <R>(db: ReturnType<typeof createDb>, text: string, parameters: unknown[] = []) =>
  db.executeQuery<R>({
    sql: text,
    parameters,
    query: { kind: 'RawNode', sqlFragments: [text], parameters: [] },
  } as never)

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-request-erasure' })
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

/** The review entry of a closed request, as the retention scan records one (opened now; the period ends later). */
async function openReviewEntry(requestId: string) {
  await withDb(async (db) => {
    const r = await db
      .selectFrom('intake.requests as r')
      .innerJoin('intake.request_decisions as d', (j) =>
        j.onRef('d.request_id', '=', 'r.id').onRef('d.to_state', '=', 'r.state'),
      )
      .select(['r.id', 'r.reference', 'r.project_id', 'd.decided_at'])
      .where('r.id', '=', requestId)
      .executeTakeFirstOrThrow()
    const policy = await db
      .selectFrom('platform.policy_version')
      .select('version')
      .where('key', '=', 'retention.requests_not_converted')
      .where('status', '=', 'active')
      .executeTakeFirstOrThrow()
    const checks = [
      { check: 'open_holds', result: 'none_found' },
      ...['complaints', 'warranties', 'disputes', 'claims', 'investigations', 'unfiled_tax_returns', 'legal_holds']
        .concat(['insurance_holds'])
        .map((check) => ({ check, result: 'not_recorded' })),
    ]
    await db
      .insertInto('privacy.retention_reviews')
      .values({
        category: 'requests_not_converted',
        record_type: 'request',
        record_id: r.id,
        record_ref: r.reference,
        project_id: r.project_id,
        policy_key: 'retention.requests_not_converted',
        policy_version: policy.version,
        period_years: 2,
        retention_started_at: r.decided_at,
        period_ends_at: new Date(
          Date.UTC(
            r.decided_at.getUTCFullYear() + 2,
            r.decided_at.getUTCMonth(),
            r.decided_at.getUTCDate(),
            r.decided_at.getUTCHours(),
            r.decided_at.getUTCMinutes(),
          ) + 60_000,
        ),
        hold_checks: JSON.stringify(checks),
        holds_found: false,
        opened_by: 'e2e:request-erasure',
        request_id: `e2e-request-erasure-${RUN}`,
      })
      .execute()
  })
}

/** Every table whose rows mention the text anywhere (the whole row as text). */
async function tablesMentioning(text: string): Promise<string[]> {
  return withDb(async (db) => {
    const { rows } = await raw<{ s: string; t: string }>(
      db,
      `SELECT table_schema AS s, table_name AS t FROM information_schema.tables
        WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema') ORDER BY 1, 2`,
    )
    const found: string[] = []
    for (const { s, t } of rows) {
      const name = `"${s.replace(/"/g, '""')}"."${t.replace(/"/g, '""')}"`
      const { rows: hit } = await raw<{ n: string }>(
        db,
        `SELECT count(*)::text AS n FROM ${name} x WHERE strpos(x::text, $1) > 0`,
        [text],
      )
      if (Number(hit[0]?.n) > 0) found.push(`${s}.${t}`)
    }
    return found
  })
}

test.describe('request erasure (TSK-0137, HH-PRIV-08)', () => {
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-PRIV-08][HH-PRIV-05] the Owner deletes a closed request; only its reference, dates and status remain', async ({
    page,
  }) => {
    const sent = await page.request.post('/api/v1/public/requests', {
      headers: { 'idempotency-key': `synthetic-e2e-erasure-${RUN}` },
      data: {
        formVersion: 'e2e-1',
        privacyNoticeVersion: 'privacy-notice-1',
        services: [{ serviceId: 'SVC-DW-01' }],
        notSure: false,
        description: DESCRIPTION,
        property: { street: STREET, city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
        timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
        estimatePreference: 'online',
        contact: {
          fullName: NAME,
          email: `erasure-e2e-${RUN}@example.test`,
          phone: '(502) 555-0137',
          preferredChannel: 'email',
        },
        smsOptIn: false,
        marketingOptIn: false,
      },
    })
    expect(sent.status()).toBe(201)
    const reference = ((await sent.json()) as { reference: string }).reference
    const requestId = await withDb(
      async (db) =>
        (
          await db
            .selectFrom('intake.requests')
            .select('id')
            .where('reference', '=', reference)
            .executeTakeFirstOrThrow()
        ).id,
    )

    await page.goto(ownerLink())
    await page.getByLabel('New password').fill(pw(1))
    await page.getByRole('button', { name: 'Save password' }).click()
    await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
    await page.goto('/staff/sign-in')
    await page.getByLabel('Email').fill(OWNER)
    await page.getByLabel('Password', { exact: true }).fill(pw(1))
    await page.getByRole('button', { name: 'Sign in' }).click()
    await passSecondFactor(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()

    // Not a fit, through the staff API: the request and its project close.
    const csrf = ((await (await page.request.get('/api/v1/staff/auth/session')).json()) as { csrfToken: string })
      .csrfToken
    const detail = (await (await page.request.get(`/api/v1/staff/requests/${requestId}`)).json()) as {
      version: number
    }
    const closed = await page.request.post(`/api/v1/staff/requests/${requestId}/actions/not-a-fit`, {
      data: { category: 'coverage', customerReason: 'the property is outside the area we serve.' },
      headers: {
        'x-csrf-token': csrf,
        'idempotency-key': `e2e-erasure-not-a-fit-${RUN}`,
        'if-match': `"${detail.version}"`,
      },
    })
    expect(closed.status()).toBe(200)
    await openReviewEntry(requestId)
    expect(await tablesMentioning(NAME)).toContain('crm.contacts')

    await page.getByRole('link', { name: 'Retention reviews' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Retention reviews' })).toBeVisible()
    await page.getByLabel('Category').selectOption({ label: 'Requests that never became jobs' })
    await page.getByRole('button', { name: 'Show entries' }).click()
    const entry = page
      .getByRole('list', { name: 'Review entries' })
      .getByRole('listitem', { name: `Request: ${reference}` })
    await expect(entry).toHaveCount(1)
    await entry.getByRole('button', { name: 'Delete, archive or keep…' }).click()

    const dialog = page.getByRole('dialog', { name: 'Are you sure you want to delete this entry?' })
    await expect(dialog.getByText(`Request: ${reference}`)).toBeVisible()
    await expect(
      dialog.getByText(
        'Deletion is permanent: the rows and stored files go. Copies in backups stay until those backups expire.',
      ),
    ).toBeVisible()
    await expect(dialog.getByText(/^Its retention period has not ended yet/)).toBeVisible()
    await expect(
      dialog.getByText('The request as submitted (description, timing and preferences): 1', { exact: true }),
    ).toBeVisible()
    await expect(dialog.getByText('The project record: 1', { exact: true })).toBeVisible()
    await expect(
      dialog.getByText('The reference, creation and closure dates and final status: 1', { exact: true }),
    ).toBeVisible()
    await axe(page)
    const confirm = dialog.getByRole('button', { name: /^Confirm Delete/ })
    await expect(confirm).toBeDisabled()
    for (const box of await dialog.getByRole('checkbox').all()) await box.check()
    await dialog.getByLabel('Reason (required)').fill('Synthetic e2e: reviewed, nothing holds it.')
    await expect(confirm).toBeEnabled()
    await confirm.click()
    await expect(
      dialog.getByText('Deleted. The deletion log keeps the reference and your reason.').first(),
    ).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(entry.getByText('Deleted', { exact: true })).toBeVisible()

    // Only the remainder, the review entry, the deletion log and the audit entries name the reference; nothing holds
    // the name, the address or the description.
    const remainder = await withDb((db) =>
      db
        .selectFrom('privacy.request_remainders')
        .select(['reference', 'final_state'])
        .where('request_id', '=', requestId)
        .executeTakeFirst(),
    )
    expect(remainder).toEqual({ reference, final_state: 'not_served' })
    expect(await tablesMentioning(NAME)).toEqual([])
    expect(await tablesMentioning(STREET)).toEqual([])
    expect(await tablesMentioning(DESCRIPTION)).toEqual([])
    expect((await tablesMentioning(reference)).sort()).toEqual(
      expect.arrayContaining(['privacy.deletions', 'privacy.request_remainders', 'privacy.retention_reviews']),
    )
    // References only, never content: the audit log, the outbox and job identifiers, idempotency records.
    const allowed = [
      'platform.audit_events',
      'platform.idempotency_keys',
      'platform.jobs',
      'platform.outbox_events',
      'privacy.deletions',
      'privacy.request_remainders',
      'privacy.retention_reviews',
    ]
    for (const t of await tablesMentioning(reference)) expect(allowed).toContain(t)
  })
})
