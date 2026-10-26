// The A2P 10DLC consent evidence in a real browser (TSK-0133; OWN-DEC-190 opt-in points A and B, OWN-DEC-178,
// HH-INT-22, HH-COM-12, T76). Each opt-in point is opened as a guest sees it, its label and disclosure are compared
// with the quotes of docs/10dlc/registration.md (the live page and the package must say the same), and with
// TENDLC_EVIDENCE_DIR set the two screenshots of the package are written there (otherwise they are attached to the
// report). Nothing is sent to a provider; every visitor, address and number is synthetic (RULE-SYNTHETIC-DATA).
// Assertions read only what this spec creates (the database is shared by every spec).
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'

const databaseUrl = process.env['E2E_DATABASE_URL']
const evidenceDir = process.env['TENDLC_EVIDENCE_DIR']
const root = fileURLToPath(new URL('../../../', import.meta.url))
/** The package with its line breaks and blockquote markers folded, so a quote may wrap. */
const packageText = readFileSync(join(root, 'docs/10dlc/registration.md'), 'utf8')
  .replace(/\n>\s?/g, ' ')
  .replace(/\s+/g, ' ')
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)

/** Saves a screenshot of the opt-in point into the evidence folder, or attaches it to the report. */
async function evidence(target: Locator, name: string, info: TestInfo) {
  await target.scrollIntoViewIfNeeded()
  const shot = await target.screenshot({ animations: 'disabled', caret: 'hide' })
  if (evidenceDir) writeFileSync(resolve(root, evidenceDir, name), shot)
  else await info.attach(name, { body: shot, contentType: 'image/png' })
}

const visible = async (l: Locator) => (await l.innerText()).replace(/\s+/g, ' ').trim()

async function toContact(page: Page, email: string, phone: string) {
  await page.goto('/request')
  await page.evaluate(() => window.localStorage.clear())
  await page.goto('/request')
  await page.getByRole('button', { name: 'Continue as Guest' }).click()
  await page.getByLabel('Not sure what service I need').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Project description').fill('Synthetic 10DLC evidence project: a loose stair rail.')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByLabel('Street address').fill('400 Synthetic Road')
  await page.getByLabel('City').fill('Testville')
  await page.getByLabel('State').fill('KY')
  await page.getByLabel('ZIP').fill('40000')
  await page.getByLabel('House', { exact: true }).check()
  await page.getByLabel('Preferred date').fill(future)
  await page.getByLabel('Mornings').check()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('heading', { name: 'Step 4 of 5: Contact' })).toBeVisible()
  await page.getByLabel('Full name').fill('Test Customer')
  await page.getByRole('textbox', { name: /^Email/ }).fill(email)
  await page.getByRole('textbox', { name: /^Phone/ }).fill(phone)
  await page.getByLabel('Phone call', { exact: true }).check()
  await page.getByLabel('Let HandyHub decide').check()
}

// This spec's own synthetic client address (RFC 5737): the request form allows 5 per network an hour.
test.use({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.233' }, viewport: { width: 900, height: 900 } })

test.describe('A2P 10DLC opt-in evidence (TSK-0133)', () => {
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-INT-22][HH-COM-12][OWN-DEC-190][T76] opt-in point A: the request form shows the documented wording', async ({
    page,
  }, info) => {
    await toContact(page, 'tendlc-point-a@example.test', '(502) 555-0181')
    const group = page.locator('[data-field="smsOptIn"]')
    const box = group.getByRole('checkbox')
    await expect(box).not.toBeChecked()
    const label = await visible(group.locator('label.hh-request__option'))
    expect(packageText).toContain(`"${label}"`)
    const disclosure = page.getByTestId('sms-disclosure')
    const first = await visible(disclosure.locator('p').first())
    expect(packageText).toContain(`"${first}"`)
    await expect(disclosure.getByRole('link', { name: /Privacy Policy/ })).toHaveAttribute('href', '/privacy')
    await expect(disclosure.getByRole('link', { name: /SMS Terms/ })).toHaveAttribute('href', '/sms-terms')
    await expect(group).toHaveAttribute('data-sms-disclosure', 'sms-disclosure-2')
    expect(packageText).toContain('`sms-disclosure-2`')
    await evidence(group, 'opt-in-a-request-form.png', info)
  })

  test('[OWN-DEC-178][OWN-DEC-190][HH-COM-12] opt-in point B: the receipt shows the documented wording', async ({
    page,
  }, info) => {
    await toContact(page, 'tendlc-point-b@example.test', '(502) 555-0182')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('heading', { name: 'Step 5 of 5: Review and send' })).toBeVisible()
    await page.getByRole('button', { name: 'Send Estimate Request' }).click()
    await expect(page.getByRole('heading', { name: 'Your request is in.' })).toBeFocused()
    expect(new URL(page.url()).pathname).toMatch(/^\/request\/received\/[A-Z0-9-]+$/)
    const phone = page
      .getByRole('region', { name: 'Verify your contact details' })
      .getByRole('group', { name: 'Phone', exact: true })
    const box = phone.locator('input[name="sms-code-consent"]')
    await expect(box).not.toBeChecked()
    const label = await visible(phone.locator('label', { has: page.locator('input[name="sms-code-consent"]') }))
    expect(packageText).toContain(`"${label}"`)
    const disclosure = phone.getByTestId('sms-code-disclosure')
    const first = await visible(disclosure.locator('p').first())
    expect(packageText).toContain(`"${first}"`)
    for (const [name, href] of [
      [/^Privacy Policy/, '/privacy'],
      [/^SMS Terms/, '/sms-terms'],
      [/^Website Terms/, '/terms'],
    ] as const)
      await expect(phone.getByRole('link', { name })).toHaveAttribute('href', href)
    await evidence(phone, 'opt-in-b-receipt.png', info)
  })

  test('[HH-COM-12][T76] the SMS terms the package names are the published version', async ({ page }) => {
    await page.goto('/sms-terms')
    await expect(page.locator('[data-legal-document]')).toHaveAttribute('data-document-id', 'sms-terms-2')
    expect(packageText).toContain('https://handyhub247.com/sms-terms | `sms-terms-2`')
    const optIn = await visible(page.getByRole('region', { name: 'How you agree to texts' }))
    expect(optIn).toContain('one-time verification code')
  })
})
