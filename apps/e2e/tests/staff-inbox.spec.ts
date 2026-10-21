// The unified inbox in a real browser (TSK-0049; HH-COM-07, HH-COM-10, HH-COM-01, T21, T71). Signed synthetic Bird and
// Resend deliveries reach the first server's webhooks; its job worker matches them. An email from an address no
// contact has waits in the private Needs Linking list; the Owner links it to the project with a reason, and the
// original stays as received. A reply to the project's reply address threads to its project and opens a "Customer
// replied" queue item, which the Owner handles from the conversation. Every address, number and message is synthetic
// (RULE-SYNTHETIC-DATA); nothing reaches a real provider.
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import {
  E2E_BIRD_WEBHOOK_SECRET,
  E2E_INBOUND_EMAIL_ADDRESS,
  E2E_RESEND_WEBHOOK_SECRET,
  signedDelivery,
} from '../inbound.js'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_PORT'] ?? '4310'
const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OWNER = 'e2e-owner@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (n: number) => ['synthetic', 'staff', 'inbox', 'passphrase', String(n)].join(' ')

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
async function setPassword(page: Page, path: string, password: string) {
  await page.goto(path)
  await page.getByLabel('New password').fill(password)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
}
async function signIn(page: Page, email: string, password: string) {
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}
async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

async function submit(request: APIRequestContext, email: string): Promise<string> {
  const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `e2e-inbox-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      // A published privacy policy version (TSK-0024); an unknown version is refused.
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic e2e inbox request.',
      property: {
        street: `${Date.now() % 1000} Inbox Way`,
        city: 'Testville',
        state: 'KY',
        zip: '40000',
        propertyType: 'house',
      },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: { fullName: 'E2E Inbox Synthetic', email, phone: '(502) 555-0149', preferredChannel: 'email' },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.status()).toBe(201)
  return ((await res.json()) as { reference: string }).reference
}

let em = 0
const email = (from: string, to: string, text: string) => ({
  type: 'email.received',
  created_at: new Date().toISOString(),
  data: {
    email_id: `em-e2e-${Date.now()}-${++em}`,
    from,
    to: [to],
    cc: [],
    bcc: [],
    received_for: [],
    subject: 'Synthetic e2e subject',
    message_id: `<e2e-${Date.now()}-${em}@mail.example.test>`,
    attachments: [],
    // The ci server's fake reader returns the text a synthetic delivery carries (never a real provider read).
    text,
  },
})

// This spec's own synthetic client address (RFC 5737): the request-form limit counts per network.
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.149' } })

test.describe('the unified inbox (TSK-0049, HH-COM-07, HH-COM-10, HH-COM-01)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-COM-10][HH-COM-07][HH-COM-01][T21][T71] Needs Linking, linking with a reason, and a reply threaded by its token', async ({
    page,
  }) => {
    const run = Date.now()
    const contactEmail = `e2e-inbox-${run}@example.test`
    const reference = await submit(page.request, contactEmail)

    // An email from an address no contact has, and a text from an unknown number: both wait for linking.
    const stranger = `e2e-inbox-other-${run}@example.test`
    const first = signedDelivery(
      E2E_RESEND_WEBHOOK_SECRET,
      email(stranger, E2E_INBOUND_EMAIL_ADDRESS, 'Synthetic e2e: please call me about the dent.'),
    )
    expect((await page.request.post('/webhooks/resend', first)).status()).toBe(200)
    // The same delivery again is acknowledged and adds nothing.
    expect(await (await page.request.post('/webhooks/resend', first)).json()).toEqual({ status: 'duplicate' })
    const text = signedDelivery(E2E_BIRD_WEBHOOK_SECRET, {
      type: 'sms.received',
      timestamp: new Date().toISOString(),
      data: { sms_id: `sms_e2e_${run}`, from: '+15025550148', to: '+15025550100', text: 'Synthetic e2e text' },
    })
    expect((await page.request.post('/webhooks/bird', text)).status()).toBe(200)
    // A wrong signature is refused.
    const forged = signedDelivery(E2E_BIRD_WEBHOOK_SECRET, { type: 'sms.received', data: {} })
    forged.headers['webhook-signature'] = 'v1,AAAA'
    expect((await page.request.post('/webhooks/bird', forged)).status()).toBe(401)

    await setPassword(page, ownerLink(), pw(1))
    await signIn(page, OWNER, pw(1))
    await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
    await page.getByRole('navigation').getByRole('link', { name: 'Inbox' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Inbox' })).toBeVisible()
    await expect(page.getByRole('listitem', { name: 'Texts (Bird): Receiving' })).toBeVisible()
    await expect(page.getByRole('listitem', { name: 'Email (Resend): Receiving' })).toBeVisible()
    await expect(page.getByRole('listitem', { name: 'Email text: Test only' })).toBeVisible()

    // The server's worker files the email in Needs Linking; the list is private to the Owner and Office.
    const item = page.getByRole('listitem', { name: `Email from ${stranger}` })
    await expect(async () => {
      await page.reload()
      await expect(item).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 20_000 })
    await expect(item.getByText('No verified contact or reference matches')).toBeVisible()
    await expect(page.getByRole('listitem', { name: 'Text from +15025550148' })).toBeVisible()
    await axe(page)

    await item.getByRole('link', { name: 'Review and link' }).click()
    await expect(page.getByRole('heading', { level: 1, name: `Email from ${stranger}` })).toBeVisible()
    await expect(page.getByText('Synthetic e2e: please call me about the dent.')).toBeVisible()
    await expect(page.getByText('No project has a contact with this address.')).toBeVisible()
    await expect(page.getByText('Enter a project reference and a reason.')).toBeVisible()
    await axe(page)
    await page.getByLabel('Project reference').fill(reference)
    await page.getByLabel('Reason (required)').fill('Customer confirmed by phone that this is their work address')
    await page.getByRole('button', { name: 'Link message' }).click()
    await expect(page.getByText('Linked by staff', { exact: true }).first()).toBeVisible()
    const history = page.getByRole('region', { name: 'Linking history' })
    await expect(history.getByText(`Linked by staff: ${reference}`)).toBeVisible()
    await expect(history.getByText('Reason: Customer confirmed by phone that this is their work address')).toBeVisible()
    // The original stays exactly as received.
    await expect(page.getByText('Synthetic e2e: please call me about the dent.')).toBeVisible()

    // The project's conversation shows it from an unknown sender (no contact is created), and an internal message
    // stays in its own section.
    await page.getByRole('link', { name: `On project ${reference}` }).click()
    await expect(page.getByRole('heading', { level: 1, name: `Conversation ${reference}` })).toBeVisible()
    const customer = page.getByRole('region', { name: 'Customer messages' })
    await expect(customer.getByRole('listitem', { name: `Unknown sender (${stranger})` })).toBeVisible()
    const internal = page.getByRole('region', { name: 'Internal conversation' })
    await internal
      .getByLabel('New internal message')
      .fill('Synthetic e2e internal: confirm the address before the visit.')
    await internal.getByRole('button', { name: 'Add internal message' }).click()
    await expect(internal.getByText('Synthetic e2e internal: confirm the address before the visit.')).toBeVisible()
    await expect(customer.getByText('Synthetic e2e internal: confirm the address before the visit.')).toHaveCount(0)
    await axe(page)

    // A reply to the project's reply address threads to it. The token stands in for the one a project email carries
    // (the e2e servers send no customer email: no template wording is configured).
    const token = await (async () => {
      const db = createDb(databaseUrl as string, { max: 1 })
      try {
        const project = await db
          .selectFrom('crm.projects')
          .select('id')
          .where('reference', '=', reference)
          .executeTakeFirstOrThrow()
        const t = Array.from(randomBytes(20), (b) => 'abcdefghijklmnopqrstuvwxyz234567'[b % 32]).join('')
        await db
          .insertInto('comms.project_reply_tokens')
          .values({ project_id: project.id, token: t })
          .onConflict((oc) => oc.doNothing())
          .execute()
        return (
          await db
            .selectFrom('comms.project_reply_tokens')
            .select('token')
            .where('project_id', '=', project.id)
            .executeTakeFirstOrThrow()
        ).token
      } finally {
        await db.destroy()
      }
    })()
    const [local, domain] = E2E_INBOUND_EMAIL_ADDRESS.split('@') as [string, string]
    const reply = signedDelivery(
      E2E_RESEND_WEBHOOK_SECRET,
      email(contactEmail, `${local}+${token}@${domain}`, 'Synthetic e2e reply: Tuesday works.'),
    )
    expect((await page.request.post('/webhooks/resend', reply)).status()).toBe(200)

    await page.getByRole('navigation').getByRole('link', { name: 'Action queue' }).click()
    const queue = page.locator('.staff-queue__list-wrap').first()
    await queue.getByLabel('Reference').fill(reference)
    const replied = page.getByRole('listitem', { name: new RegExp(`Customer replied ${reference}`) })
    await expect(async () => {
      await queue.getByRole('button', { name: 'Apply filters' }).click()
      await expect(replied).toBeVisible({ timeout: 1000 })
    }).toPass({ timeout: 20_000 })
    await replied.getByRole('link', { name: 'Open conversation' }).click()
    await expect(page.getByRole('heading', { level: 1, name: `Conversation ${reference}` })).toBeVisible()
    const thread = page.getByRole('region', { name: 'Customer messages' })
    const message = thread.getByRole('listitem', { name: 'E2E Inbox Synthetic' })
    await expect(message.getByText('Synthetic e2e reply: Tuesday works.')).toBeVisible()
    await expect(message.getByText("Matched by the project's reply address")).toBeVisible()
    await page.getByRole('button', { name: 'Mark replies handled' }).click()
    await expect(page.getByRole('button', { name: 'Mark replies handled' })).toHaveCount(0)
    await axe(page)
  })
})
