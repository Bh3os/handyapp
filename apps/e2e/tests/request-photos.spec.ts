// Request photos in a real browser (TSK-0031; HH-INT-04, HH-INT-06, HH-INT-07, T13). The server runs with the migrated
// E2E_DATABASE_URL database and the fake object storage of ci; every image is built in code (RULE-SYNTHETIC-DATA).
import { deflateSync } from 'node:zlib'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const databaseUrl = process.env['E2E_DATABASE_URL']
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)

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
  const rows = Buffer.from([0, 200, 80, 40, 200, 80, 40, 0, 40, 80, 200, 40, 80, 200])
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// This spec's own synthetic client address (RFC 5737): the request-form limit counts per network, and every spec
// reaches the server from 127.0.0.1 (playwright.config.ts trusts one hop on that server).
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.12' } })

test.describe('request photos (TSK-0031)', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')
    await page.goto('/request')
    await page.evaluate(() => window.localStorage.clear())
  })

  test('[T13][HH-INT-07][HH-INT-04] one failed and one saved photo coexist; the request is sent without the failed one', async ({
    page,
  }) => {
    await page.goto('/request')
    await page.getByRole('button', { name: 'Continue as Guest' }).click()
    await page.getByLabel('Not sure what service I need').check()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByLabel('Project description').fill('Synthetic project with one good and one bad photo.')

    await expect(
      page.getByText("Please don't upload payment cards, IDs, passwords, or unrelated personal information."),
    ).toBeVisible()
    await expect(page.getByText('Up to 10 photos (JPEG, PNG, WebP), up to 15 MB each.')).toBeVisible()
    await page.locator('input[type="file"][name="photos"]').setInputFiles([
      { name: 'wall.png', mimeType: 'image/png', buffer: png() },
      // Named and typed as a JPEG, but not an image: the server refuses it by its content.
      { name: 'not-a-photo.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('synthetic text, not an image') },
    ])
    const items = page.locator('.hh-request__photo')
    await expect(items).toHaveCount(2)
    await expect(items.nth(0).getByText('Saved')).toBeVisible({ timeout: 20_000 })
    await expect(items.nth(1).getByText('Failed')).toBeVisible()
    await expect(items.nth(1).getByText("This file type can't be uploaded. Use JPEG, PNG, WebP.")).toBeVisible()
    await expect(items.nth(1).getByRole('button', { name: 'Retry' })).toBeVisible()
    await expect(page.getByLabel('Project description')).toHaveValue(
      'Synthetic project with one good and one bad photo.',
    )
    await new AxeBuilder({ page })
      .withTags(WCAG_TAGS)
      .analyze()
      .then((scan) => expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]))

    // Moving between steps keeps the text and both photos with their states.
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(items).toHaveCount(2)
    await expect(items.nth(0).getByText('Saved')).toBeVisible()
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
    await page.getByRole('textbox', { name: /^Email/ }).fill('photos-customer@example.test')
    await page.getByRole('textbox', { name: /^Phone/ }).fill('(502) 555-0177')
    await page.getByRole('radio', { name: 'Email' }).check()
    await page.getByLabel('Let HandyHub decide').check()
    await page.getByRole('button', { name: 'Next' }).click()

    await expect(
      page.getByText("1 photo failed and won't be included. You can retry or send without them."),
    ).toBeVisible()
    await expect(page.getByText('1 photo', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Send Estimate Request' }).click()
    await expect(page.getByRole('heading', { name: 'Your request is in.' })).toBeVisible()
    await expect(page.getByText('Photos received: 1. Still processing: 0. Not included: 1.')).toBeVisible()
  })
})
