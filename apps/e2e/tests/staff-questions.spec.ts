// Staff questions, the customer's reply and portal messages in real browsers (TSK-0051; HH-LEAD-03, HH-LEAD-06,
// HH-PORT-09, HH-COM-02, HH-SEC-05, C04, S02, T30, OWN-DEC-98, OWN-DEC-101). A guest opens the project with the secure
// link and an emailed code (TSK-0034); Office staff, in a browser of their own, publish two questions from the request
// record; the customer answers one in the portal with a photo and "I'm not sure", the other stays open, and writes in
// Messages. The e2e servers send through the provider fakes, which hand a message over without reporting it sent, so
// the notice reads truthfully as not sent yet and no reminder starts. Every visitor, address and account is synthetic
// (RULE-SYNTHETIC-DATA); nothing reaches a real provider.
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'
import { accessTokenFor, codeFor } from '../codes.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
// This spec's own synthetic client address (RFC 5737): the request form allows 5 per network an hour.
const HEADERS = { 'x-forwarded-for': '198.51.100.151' }
test.use({ extraHTTPHeaders: HEADERS })

const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OFFICE = 'e2e-questions-office@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'questions', 'passphrase', '51'].join(' ')

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
/** A synthetic 2x2 PNG. */
function png(): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(2, 0)
  ihdr.writeUInt32BE(2, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const rows = Buffer.from([0, 40, 80, 200, 40, 80, 200, 0, 200, 80, 40, 200, 80, 40])
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1 })
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

/** A request sent through the API (the wizard has its own specs): its reference, request ID and link. */
async function sendRequest(request: APIRequestContext, email: string) {
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `synthetic-e2e-questions-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic questions project: a water stain on the ceiling.',
      property: {
        street: '51 Synthetic Question Court',
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
      estimatePreference: 'let_handyhub_decide',
      contact: { fullName: 'Questions E2E Customer', email, phone: '(502) 555-0151', preferredChannel: 'email' },
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
      .select(['g.id', 'g.nonce', 'r.id as request_id'])
      .where('r.reference', '=', reference)
      .executeTakeFirstOrThrow(),
  )
  return { reference, requestId: row.request_id, grantId: row.id, token: accessTokenFor(row) }
}

/** Opens the link, enters the emailed code (which verifies the email), and goes on to the project page. */
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

/** Office staff of this spec's own, signed in through the staff app in a browser of its own. */
async function officeSession(browser: Browser) {
  const staffAccess = (...args: string[]) =>
    new URL(
      execFileSync(process.execPath, [cli, ...args], {
        env: { ...process.env, HANDYHUB_ENV: 'ci', DATABASE_URL: databaseUrl, PORT: port, HOST: '127.0.0.1' },
        encoding: 'utf8',
        stdio: 'pipe',
      }).split('\n')[0] as string,
    ).pathname
  // Added straight to the database: the first Owner is created by the staff sign-in spec (staff-auth), which must find
  // no Owner yet whatever order the specs run in.
  await withDb(async (db) => {
    const existing = await db
      .selectFrom('identity.staff_users')
      .select('id')
      .where('email', '=', OFFICE)
      .executeTakeFirst()
    if (existing) return
    const user = await db
      .insertInto('identity.staff_users')
      .values({ email: OFFICE, display_name: 'E2E Questions Office', locale: 'en' })
      .returning('id')
      .executeTakeFirstOrThrow()
    await db.insertInto('identity.auth_identities').values({ staff_user_id: user.id }).execute()
    await db
      .insertInto('identity.role_grants')
      .values({ staff_user_id: user.id, kind: 'role', name: 'office', issued_by: 'e2e:questions', reason: null })
      .execute()
  })
  const link = staffAccess('password-link', OFFICE)
  const context = await browser.newContext({ extraHTTPHeaders: HEADERS })
  const page = await context.newPage()
  await page.goto(link)
  await page.getByLabel('New password').fill(pw)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(OFFICE)
  await page.getByLabel('Password', { exact: true }).fill(pw)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
  return { page, close: () => context.close() }
}

test.describe('staff questions and customer replies (TSK-0051, HH-LEAD-03, HH-LEAD-06)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-LEAD-03][HH-LEAD-06][T30][C04][S02][HH-PORT-09][HH-SEC-05] staff publish two questions; the customer answers one with a photo and "I\'m not sure"', async ({
    page,
    request,
    browser,
  }) => {
    const run = Date.now()
    const email = `e2e-questions-${run}@example.test`
    const link = await sendRequest(request, email)
    await openProject(page, link)
    // No question yet: the Overview has no questions section.
    await expect(page.getByRole('region', { name: 'Questions from HandyHub' })).toHaveCount(0)

    const office = await officeSession(browser)
    const first = `Synthetic e2e question ${run}: how tall is the ceiling?`
    const second = `Synthetic e2e question ${run}: when did the stain appear?`
    try {
      const staff = office.page
      await staff.goto(`/staff/requests/${link.requestId}`)
      const section = staff.getByRole('region', { name: 'Questions to the customer' })
      await expect(section.getByText('No questions yet.')).toBeVisible()
      const composer = section.getByRole('form', { name: 'Ask the customer a question' })
      await expect(
        composer.getByText(/Never ask the customer to go into, open or inspect a hazardous area/),
      ).toBeVisible()
      await axe(staff)
      await composer.getByLabel(/^Question/).fill(first)
      await composer.getByRole('checkbox', { name: /Measurement: the customer may answer/ }).check()
      // The hazard guard: Publish waits for the confirmation.
      await expect(composer.getByRole('button', { name: 'Publish question' })).toBeDisabled()
      await composer.getByLabel('This question does not ask the customer to inspect a hazardous area.').check()
      await composer.getByRole('button', { name: 'Publish question' }).click()
      await expect(section.getByText('Question published. The customer is notified automatically.')).toBeVisible()
      await expect(staff.getByRole('definition').filter({ hasText: 'Needs information' }).first()).toBeVisible()
      const composer2 = section.getByRole('form', { name: 'Ask the customer a question' })
      await composer2.getByLabel(/^Question/).fill(second)
      await composer2.getByLabel('This question does not ask the customer to inspect a hazardous area.').check()
      await composer2.getByRole('button', { name: 'Publish question' }).click()
      await expect(section.getByText(second)).toBeVisible()
      // The notice is handed to the (fake) provider, which never reports it sent: it reads as not sent yet, and the
      // reminders wait for a successful send (a failed or unconfirmed notice never counts as no response).
      const asked = section.getByRole('listitem', { name: /^Question published/ })
      await expect(asked).toHaveCount(2)
      await expect(asked.first().getByText('Starts when the notice is sent')).toHaveCount(2)
      await axe(staff)

      // The customer's Overview: Waiting on you, both questions, a clear Reply.
      await page.getByRole('button', { name: 'Refresh', exact: true }).click()
      const status = page.getByRole('region', { name: 'Status' })
      await expect(status.getByText('Waiting on you')).toBeVisible()
      const questions = page.getByRole('region', { name: 'Questions from HandyHub' })
      await expect(questions.getByText(first)).toBeVisible()
      await expect(questions.getByText(second)).toBeVisible()
      await status.getByRole('link', { name: 'Reply' }).click()
      const form = questions.getByRole('form', { name: "Reply to HandyHub's question" })
      await expect(form).toBeVisible()
      await axe(page)
      const answer = `Synthetic e2e answer ${run}: about nine feet.`
      await form.getByLabel('Your reply').fill(answer)
      await form.getByLabel("I'm not sure").check()
      await form
        .getByLabel('Photos (optional)')
        .setInputFiles([{ name: 'ceiling.png', mimeType: 'image/png', buffer: png() }])
      await expect(form.getByText(/^Photo 1: (checking|received)/)).toBeVisible()
      await form.getByRole('button', { name: 'Send reply' }).click()
      await expect(questions.getByText('Reply received—HandyHub will review it')).toBeVisible()
      await expect(questions.getByText(answer)).toBeVisible()
      // The other question stays open.
      await expect(questions.getByRole('button', { name: 'Reply' })).toHaveCount(1)
      await expect(questions.getByText('Answered')).toBeVisible()
      await axe(page)

      // Staff see the reply exactly as written, with "I'm not sure" and its photo, on the same request.
      await staff.reload()
      const reply = section.getByRole('listitem', { name: /^Question published/ }).first()
      await expect(reply.getByText(answer)).toBeVisible()
      await expect(reply.getByText("I'm not sure")).toBeVisible()
      await expect(reply.getByText(/1 photo:/)).toBeVisible()
      await section.getByRole('button', { name: 'Mark replies reviewed' }).click()
      await expect(section.getByText('Replies marked reviewed.')).toBeVisible()

      // The customer writes in Messages; it is on the project's conversation as written.
      await page.getByRole('tab', { name: 'Messages' }).click()
      const compose = page.getByRole('form', { name: 'Write to HandyHub' })
      const note = `Synthetic e2e message ${run}: the stain is near the window.`
      await compose.getByLabel('Write to HandyHub').fill(note)
      await compose.getByRole('button', { name: 'Send' }).click()
      await expect(compose.getByText('Message sent to HandyHub.')).toBeVisible()
      const list = page.getByRole('list', { name: 'Project conversation' })
      await expect(list.getByRole('listitem', { name: 'You, Project page' }).getByText(note)).toBeVisible()
      await axe(page)
    } finally {
      await office.close()
    }
  })
})
