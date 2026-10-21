// The receipt in a real browser (TSK-0032; HH-INT-12, HH-INT-20, HH-INT-07, T01, T12, T13): shown only after the
// server confirmed the save, at /request/received/<ref>, in the owner's wording, with photo outcomes as the server
// recorded them and a failed photo retried without a new request; a reference alone shows nothing. The receipt email
// is NOT CONFIGURED in this database (no approved wording), so the request stays saved and staff get a delivery issue.
// Every visitor, address, number and image is synthetic (RULE-SYNTHETIC-DATA).
import { deflateSync } from 'node:zlib'
import { AxeBuilder } from '@axe-core/playwright'
import { createDb } from '@handyhub/db'
import { expect, test, type Page } from '@playwright/test'

const databaseUrl = process.env['E2E_DATABASE_URL']
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
const SENT = '**/api/v1/public/requests'
const OWNER_NEXT =
  "We'll review your project and contact you using your preferred method. We aim to respond within one hour during " +
  'our daily hours, 8 AM–10 PM. Requests received outside those hours are reviewed when we reopen.'
const SEPARATE = 'Your request is received. Pricing and your appointment will be confirmed separately.'

async function axe(page: Page) {
  const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
  expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])
}

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
/** A synthetic 2x2 PNG; `shade` makes each one a different file. */
function png(shade: number): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(2, 0)
  ihdr.writeUInt32BE(2, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const rows = Buffer.from([0, shade, 80, 40, 200, 80, 40, 0, 40, 80, 200, 40, 80, shade])
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

async function start(page: Page) {
  await page.goto('/request')
  await page.evaluate(() => window.localStorage.clear())
  await page.goto('/request')
  await page.getByRole('button', { name: 'Continue as Guest' }).click()
  await page.getByLabel('Not sure what service I need').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Project description').fill('Synthetic receipt project: a loose hallway outlet cover.')
}

async function finish(page: Page, email: string) {
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Street address').fill('100 Synthetic Way')
  await page.getByLabel('City').fill('Testville')
  await page.getByLabel('State').fill('KY')
  await page.getByLabel('ZIP').fill('40000')
  await page.getByLabel('House', { exact: true }).check()
  await page.getByLabel('Preferred date').fill(future)
  await page.getByLabel('Mornings').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Full name').fill('Test Customer')
  await page.getByRole('textbox', { name: /^Email/ }).fill(email)
  await page.getByRole('textbox', { name: /^Phone/ }).fill('(502) 555-0191')
  await page.getByLabel('Phone call', { exact: true }).check()
  await page.getByLabel('Let HandyHub decide').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { name: 'Step 5 of 5: Review and send' })).toBeVisible()
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1 })
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

// This spec's own synthetic client address (RFC 5737): the request-form limit counts per network (5 an hour). This
// spec sends two requests to the server.
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.27' } })

test.describe('the receipt (TSK-0032)', () => {
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-INT-12][T01][T12][HH-INT-20] the receipt appears only after a saved response, in the owner’s wording, and stays in this tab only', async ({
    page,
    context,
    browser,
  }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const email = 'receipt-e2e@example.test'
    await start(page)
    await finish(page, email)
    const receiptHeading = page.getByRole('heading', { name: 'Your request is in.' })

    // No answer (a lost connection) and a failed answer: no receipt, the form stays, and nothing claims success.
    await page.route(SENT, (route) => route.abort('connectionreset'))
    await page.getByRole('button', { name: 'Send Estimate Request' }).click()
    await expect(page.getByText(/We could not confirm that your request arrived/)).toBeVisible()
    await expect(receiptHeading).toHaveCount(0)
    await page.unroute(SENT)
    await page.route(SENT, (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'UNAVAILABLE', message: 'Service unavailable.', retryable: true, fieldErrors: [] },
        }),
      }),
    )
    await page.getByRole('button', { name: 'Send Estimate Request' }).click()
    await expect(page.getByText('Service unavailable.')).toBeVisible()
    await expect(receiptHeading).toHaveCount(0)
    expect(new URL(page.url()).pathname).toBe('/request')
    await page.unroute(SENT)

    // The saved response: the receipt, at its own address, in the owner's wording.
    await page.getByRole('button', { name: 'Send Estimate Request' }).click()
    await expect(receiptHeading).toBeFocused()
    const reference = ((await page.getByText(/^Request reference: /).textContent()) ?? '').replace(
      'Request reference: ',
      '',
    )
    expect(reference).toMatch(/^HH-[0-9A-HJKMNP-TV-Z]{8}$/)
    expect(new URL(page.url()).pathname).toBe(`/request/received/${reference}`)
    await expect(page.getByText('Thank you for choosing HandyHub.')).toBeVisible()
    await page.getByRole('button', { name: 'Copy' }).click()
    await expect(page.getByText('Request reference copied.')).toBeVisible()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(reference)
    const glance = page.getByRole('region', { name: 'Your project at a glance' })
    for (const text of [
      'Not sure what service I need',
      'Synthetic receipt project: a loose hallway outlet cover.',
      '100 Synthetic Way',
      'Testville, KY 40000',
      'Mornings',
      'Test Customer',
      email,
      '(502) 555-0191',
      'Preferred method: Phone call',
      'These are your preferences. Your appointment is confirmed only after we send a date and arrival window.',
    ])
      await expect(glance).toContainText(text)
    const next = page.getByRole('region', { name: 'What happens next?' })
    await expect(next.getByText(OWNER_NEXT, { exact: true })).toBeVisible()
    await expect(next.getByText(SEPARATE, { exact: true })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Return Home' })).toHaveAttribute('href', '/')
    // Nothing that does not work yet, and no booking, price or history.
    await expect(page.locator('main')).not.toContainText(/View My Request|Create an Account|\$|booked|earlier project/i)
    await axe(page)

    // Saved once: the request exists; the receipt email has no approved wording, so its delivery is recorded as not
    // sent, and staff get one delivery issue while the request stays in their queue.
    const saved = await withDb((db) =>
      db.selectFrom('intake.requests').select(['id', 'reference']).where('reference', '=', reference).execute(),
    )
    expect(saved).toHaveLength(1)
    const requestId = saved[0]?.id as string
    await expect
      .poll(
        () =>
          withDb((db) =>
            db
              .selectFrom('platform.message_deliveries')
              .select(['state', 'error_code'])
              .where('subject_key', '=', `request:${requestId}`)
              .execute(),
          ),
        { timeout: 15_000 },
      )
      .toEqual([{ state: 'failed', error_code: 'template_not_configured' }])
    await expect
      .poll(
        () =>
          withDb((db) =>
            db
              .selectFrom('ops.queue_items')
              .select(['type', 'reason', 'reference'])
              .where('reference', '=', reference)
              .where('resolved_at', 'is', null)
              .orderBy('type')
              .execute(),
          ),
        { timeout: 15_000 },
      )
      .toEqual([
        { type: 'delivery_failed', reason: 'delivery_not_configured', reference },
        // TSK-0034: the secure access message (FACT-AUTOMATIC-MESSAGES #3) has no released wording either
        // (OQ-ACCESS-LINK-WORDING), so it is its own delivery issue for the same request.
        { type: 'delivery_failed', reason: 'delivery_not_configured', reference },
        // A form sent within seconds of opening is quietly flagged (HH-INT-11); either way staff see the request.
        { type: 'new_request', reason: expect.stringMatching(/^new_request(_flagged)?$/), reference },
      ])

    // A reload of this tab shows the same receipt; another browser with the same address sees nothing of it.
    await page.reload()
    await expect(receiptHeading).toBeFocused()
    await expect(page.getByText(`Request reference: ${reference}`)).toBeVisible()
    await expect(page.getByRole('region', { name: 'Your project at a glance' })).toContainText(email)
    const other = await browser.newContext()
    try {
      const stranger = await other.newPage()
      await stranger.goto(`/request/received/${reference}`)
      await expect(stranger.getByRole('heading', { name: "This receipt isn't available here" })).toBeVisible()
      await expect(stranger.locator('main')).not.toContainText(
        /Your request is in|Test Customer|Synthetic Way|receipt-e2e/,
      )
    } finally {
      await other.close()
    }
  })

  test('[HH-INT-12] a guessed reference shows nothing and the response never reveals whether it exists', async ({
    page,
  }) => {
    const res = await page.goto('/request/received/HH-00000000')
    expect(res?.status()).toBe(200)
    expect(res?.headers()['cache-control']).toBe('no-store')
    await expect(page.getByRole('heading', { name: "This receipt isn't available here" })).toBeVisible()
    await expect(
      page.getByText('A receipt is shown only in the browser that sent the request, after the request was saved.'),
    ).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your request is in.' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Return Home' })).toHaveAttribute('href', '/')
    await axe(page)
    expect((await page.goto('/request/received/not-a-reference'))?.status()).toBe(404)
  })

  test('[T13][HH-INT-07][HH-INT-12] received, processing and failed photos are shown separately; a failed one is retried from the receipt without a new request', async ({
    page,
  }) => {
    const email = 'receipt-photos-e2e@example.test'
    await start(page)
    // The second photo's upload is cut off: it fails in the browser and never reaches the server.
    let uploads = 0
    await page.route('**/api/v1/public/request-drafts/photos', (route) => {
      if (route.request().method() === 'POST' && ++uploads === 2) return route.abort('connectionreset')
      return route.continue()
    })
    const input = page.locator('input[type="file"][name="photos"]')
    await input.setInputFiles({ name: 'first.png', mimeType: 'image/png', buffer: png(201) })
    const items = page.locator('.hh-request__photo')
    await expect(items.nth(0).getByText('Saved')).toBeVisible({ timeout: 20_000 })
    await input.setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer: png(202) })
    await expect(items.nth(1).getByText('Failed')).toBeVisible()
    await finish(page, email)
    await page.getByRole('button', { name: 'Send Estimate Request' }).click()
    await expect(page.getByRole('heading', { name: 'Your request is in.' })).toBeFocused()

    const photos = page.getByRole('region', { name: 'Your photos' })
    await expect(photos.getByText('Received: 1')).toBeVisible()
    await expect(photos.getByText('Processing: 0')).toBeVisible()
    await expect(photos.getByText('Failed: 1')).toBeVisible()
    await expect(
      photos.getByText("You can retry a failed photo here. You don't need to send another request."),
    ).toBeVisible()
    await axe(page)
    await photos.getByRole('button', { name: 'Retry' }).click()
    await expect(photos.getByText('Failed: 0')).toBeVisible()
    await expect(photos.getByText('Received: 2')).toBeVisible({ timeout: 20_000 })
    await expect(photos.getByRole('button', { name: 'Retry' })).toHaveCount(0)

    // One request, holding both photos.
    const reference = new URL(page.url()).pathname.replace('/request/received/', '')
    const rows = await withDb((db) =>
      db
        .selectFrom('intake.requests')
        .innerJoin('crm.contacts', 'crm.contacts.id', 'intake.requests.contact_id')
        .leftJoin('intake.photos', 'intake.photos.request_id', 'intake.requests.id')
        .select(['intake.requests.reference', 'intake.photos.state'])
        .where('crm.contacts.email', '=', email)
        .execute(),
    )
    expect(rows.map((r) => [r.reference, r.state])).toEqual([
      [reference, 'ready'],
      [reference, 'ready'],
    ])
  })
})
