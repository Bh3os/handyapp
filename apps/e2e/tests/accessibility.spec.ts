// The accessibility sweep of the public site and the customer portal in a real browser (TSK-0104; HH-A11Y-01,
// HH-A11Y-02, HH-A11Y-03, T69, OWN-DEC-85, OWN-DEC-181). Every public page, every step and error state of the request
// form, the secure-link pages and a guest's project pages pass axe (WCAG 2.x A and AA) in the light and the dark theme
// and at 320 px, reflow at 320 px (400% zoom) and with 200% text, and hold still with reduced motion (apps/e2e/a11y.ts;
// the other specs run the same sweep on every state they reach). The request form is completed with the keyboard
// alone, its dialog gives focus back, the skip link works, and the portal titles each page and keeps focus on the tab
// the customer chose. Screen readers and physical phones are not tested here: they stay UNVERIFIED
// (docs/accessibility-report.md). Every visitor, address and value is synthetic (RULE-SYNTHETIC-DATA).
import { createDb } from '@handyhub/db'
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { expectAccessible, tabTo } from '../a11y.js'
import { accessTokenFor, codeFor } from '../codes.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const future = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10)
// This spec's own synthetic client address (RFC 5737): the request form allows 5 per network an hour.
const HEADERS = { 'x-forwarded-for': '198.51.100.104' }
test.use({ extraHTTPHeaders: HEADERS })

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1 })
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

/** A request sent through the API (the form has its own test below): its reference and secure link. */
async function sendRequest(request: APIRequestContext, email: string) {
  const res = await request.post('/api/v1/public/requests', {
    headers: { 'idempotency-key': `synthetic-e2e-a11y-${Date.now()}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic accessibility sweep project: a scuffed door frame.',
      property: { street: '104 Synthetic Lane', city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { preferredDate: future, flexible: false, needHelpToday: false, windows: ['any_time'] },
      estimatePreference: 'let_handyhub_decide',
      contact: { fullName: 'Test Customer', email, phone: '(502) 555-0104', preferredChannel: 'email' },
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
      .select(['g.id', 'g.nonce'])
      .where('r.reference', '=', reference)
      .executeTakeFirstOrThrow(),
  )
  return { reference, grantId: row.id, token: accessTokenFor(row) }
}

/** Tab to a control and press it. */
async function press(page: Page, target: Locator, key: 'Enter' | 'Space' = 'Enter') {
  await tabTo(page, target)
  await page.keyboard.press(key)
}
/** Tab to a field and type into it. */
async function type(page: Page, target: Locator, text: string) {
  await tabTo(page, target)
  await page.keyboard.type(text)
}
/** Tab into a radio group and choose `target` with the arrow keys, as a keyboard user does. */
async function choose(page: Page, target: Locator) {
  const name = await target.getAttribute('name')
  for (let n = 0; n < 80; n++) {
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLInputElement | null
      return el?.type === 'radio' ? el.name : null
    })
    if (focused === name) break
  }
  for (let n = 0; n < 10 && !(await target.isChecked()); n++) await page.keyboard.press('ArrowDown')
  await expect(target).toBeChecked()
}

test.describe('accessibility sweep: public site and customer portal (TSK-0104)', () => {
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-A11Y-01][HH-A11Y-02][HH-A11Y-03][T69] every public page passes in both themes, at 320 px, with 200% text and reduced motion; the skip link works', async ({
    page,
  }) => {
    test.setTimeout(300_000)
    await page.goto('/services')
    const services = await page
      .locator('main a[href^="/services/"]')
      .evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).pathname))])
    expect(services.length).toBeGreaterThan(0)
    await page.goto('/areas')
    const areas = await page
      .locator('main a[href^="/areas/"]')
      .evaluateAll((as) => [...new Set(as.map((a) => (a as HTMLAnchorElement).pathname))])
    const pages = [
      '/',
      '/services',
      ...services,
      '/areas',
      ...areas,
      '/privacy',
      '/terms',
      '/sms-terms',
      '/access',
      '/account',
      '/no-such-page',
    ]
    for (const path of pages) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      // The footer's facts are read after the page loads; the sweep measures the page once they are shown (a page
      // without the site footer has none to wait for).
      const phone = page.locator('[data-site-facts] [data-contact="phone"]')
      if ((await phone.count()) > 0) await expect(phone).not.toHaveText('Loading…')
      await expectAccessible(page, path)
    }

    // The first Tab reaches the skip link, which moves focus to the main region.
    await page.goto('/')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.locator('#main')).toBeFocused()
  })

  test('[HH-A11Y-01][HH-A11Y-02][T69] the request form is completed with the keyboard alone and every step passes the sweep', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await page.goto('/request')
    await page.evaluate(() => window.localStorage.clear())
    await page.goto('/request')

    // The continue dialog: focus is inside it; Escape closes it and focus returns to the control that opened it.
    const dialog = page.getByRole('dialog', { name: 'How would you like to continue?' })
    await expect(dialog).toBeVisible()
    await expectAccessible(page, 'request: continue dialog')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    const reopen = page.getByRole('button', { name: 'Choose how to continue' })
    await press(page, reopen)
    await expect(dialog).toBeVisible()
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true)
    await page.keyboard.press('Escape')
    await expect(reopen).toBeFocused()
    await page.keyboard.press('Enter')
    await press(page, dialog.getByRole('button', { name: 'Continue as Guest' }))

    // Step 1: the step heading takes focus; Next with nothing chosen shows the error summary, which takes focus.
    await expect(page.getByRole('heading', { name: 'Step 1 of 5: Services' })).toBeFocused()
    await expectAccessible(page, 'request: step 1')
    await press(page, page.getByRole('button', { name: 'Next' }))
    await expect(page.getByRole('alert').filter({ hasText: 'Check these fields' })).toBeFocused()
    await expectAccessible(page, 'request: step 1 errors')
    await press(page, page.getByLabel('Not sure what service I need'), 'Space')
    await press(page, page.getByRole('button', { name: 'Next' }))

    await expect(page.getByRole('heading', { name: 'Step 2 of 5: About the job' })).toBeFocused()
    await expectAccessible(page, 'request: step 2')
    await type(page, page.getByLabel('Project description'), 'Synthetic project: a small hole in a hallway wall.')
    await press(page, page.getByRole('button', { name: 'Next' }))

    await expect(page.getByRole('heading', { name: /^Step 3 of 5/ })).toBeFocused()
    await expectAccessible(page, 'request: step 3')
    await press(page, page.getByRole('button', { name: 'Next' }))
    const summary = page.getByRole('alert').filter({ hasText: 'Check these fields' })
    await expect(summary).toBeFocused()
    await expectAccessible(page, 'request: step 3 errors')
    // A link of the summary moves focus to its field.
    await press(page, summary.getByRole('link', { name: /^Street address/ }))
    await expect(page.getByLabel('Street address')).toBeFocused()
    await page.keyboard.type('100 Synthetic Way')
    await type(page, page.getByLabel('City'), 'Testville')
    await type(page, page.getByLabel('State'), 'KY')
    await type(page, page.getByLabel('ZIP'), '40000')
    await choose(page, page.getByLabel('House', { exact: true }))
    const [y, m, d] = future.split('-')
    await type(page, page.getByLabel('Preferred date'), `${m}${d}${y}`)
    await expect(page.getByLabel('Preferred date')).toHaveValue(future)
    await press(page, page.getByLabel('Mornings'), 'Space')
    await press(page, page.getByRole('button', { name: 'Next' }))

    await expect(page.getByRole('heading', { name: /^Step 4 of 5/ })).toBeFocused()
    await expectAccessible(page, 'request: step 4')
    await type(page, page.getByLabel('Full name'), 'Test Customer')
    await type(page, page.getByRole('textbox', { name: /^Email/ }), 'a11y-keyboard@example.test')
    await type(page, page.getByRole('textbox', { name: /^Phone/ }), '(502) 555-0124')
    await choose(page, page.getByLabel('Phone call', { exact: true }))
    await choose(page, page.getByLabel('Let HandyHub decide'))
    await press(page, page.getByRole('button', { name: 'Next' }))

    await expect(page.getByRole('heading', { name: 'Step 5 of 5: Review and send' })).toBeFocused()
    await expectAccessible(page, 'request: review')
    await press(page, page.getByRole('button', { name: 'Send Estimate Request' }))
    await expect(page.getByRole('heading', { name: 'Your request is in.' })).toBeFocused()
    await expectAccessible(page, 'request: receipt')
  })

  test('[HH-A11Y-01][HH-A11Y-02][T69] the secure link and the portal pages pass the sweep with the keyboard; each page is titled and a tab keeps its focus', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const link = await sendRequest(page.request, 'a11y-portal@example.test')
    await page.goto(`/access#${link.token}`)
    await expect(page.getByRole('button', { name: 'Open', exact: true })).toBeVisible()
    await expectAccessible(page, 'access: landing')
    await press(page, page.getByRole('button', { name: 'Open', exact: true }))
    const send = page.getByRole('button', { name: 'Email me a code' })
    await expect(send).toBeVisible()
    await expectAccessible(page, 'access: choose')
    await press(page, send)
    await expect(page.getByLabel('Code')).toBeFocused()
    await expectAccessible(page, 'access: code')
    const row = await withDb((db) =>
      db
        .selectFrom('identity.verification_codes')
        .select(['id', 'nonce'])
        .where('subject_ref', '=', `grant:${link.grantId}:email`)
        .orderBy('created_at', 'desc')
        .limit(1)
        .executeTakeFirstOrThrow(),
    )
    await page.getByLabel('Code').focus()
    await page.keyboard.type(codeFor(row))
    await press(page, page.getByRole('button', { name: 'Open my project' }))
    await expect(page.getByRole('heading', { name: 'Your project', exact: true })).toBeVisible()
    await expectAccessible(page, 'access: opened')
    await press(page, page.getByRole('link', { name: 'Go to your project page' }))

    // The project page: its title names the project; a tab chosen with the arrow keys keeps focus as the page changes.
    const project = `Project ${link.reference}`
    await expect(page.getByRole('heading', { level: 1, name: project })).toBeVisible()
    await expect(page).toHaveTitle(`${project} – HandyHub customer portal`)
    const overview = page.getByRole('tab', { name: 'Overview' })
    await tabTo(page, overview)
    await page.keyboard.press('ArrowRight')
    const messages = page.getByRole('tab', { name: 'Messages' })
    await expect(page).toHaveURL(new RegExp(`/portal/p/${link.reference}/messages$`))
    await expect(messages).toBeFocused()
    await expect(page).toHaveTitle(`${project} – HandyHub customer portal`)

    // The privacy page and the projects page (the workspace tabs are swept in portal-tabs.spec.ts).
    await press(page, page.getByRole('link', { name: /privacy/i }).first())
    await expect(page.getByRole('heading', { level: 1, name: 'Your data and privacy requests' })).toBeVisible()
    await expect(page).toHaveTitle('Your data and privacy requests – HandyHub customer portal')
    await expectAccessible(page, 'portal: privacy')
    await page.goto('/portal/')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectAccessible(page, 'portal: projects')
  })
})
