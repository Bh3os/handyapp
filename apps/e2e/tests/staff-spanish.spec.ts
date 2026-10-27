// The staff app in both staff languages, in a real browser (TSK-0102; HH-LANG-02, HH-OPS-04, HH-LANG-01, T04, T70,
// OWN-DEC-79, OWN-DEC-162, OWN-DEC-208, RULE-LANGUAGES). An Office member, an Estimator and a Worker of this spec each
// switch to Spanish and open every screen of their menu: every heading is the Spanish catalog's, no staff message is
// left in English (text marked lang="en", such as an English SOP or a customer preview, is English on purpose), and
// axe passes. What they typed stays across the switch, the choice follows them to a new sign-in, and meanwhile the
// public site stays English. Each switches back to English at the end. Accounts are synthetic (RULE-SYNTHETIC-DATA);
// the server runs with the migrated E2E_DATABASE_URL database.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { passSecondFactor } from '../mfa.js'
import { expectAccessible } from '../a11y.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
// This spec's own synthetic network (RFC 5737): the sign-in and link limits count per network.
const NETWORK = { 'x-forwarded-for': '198.51.100.102' }
const port = process.env['E2E_PORT'] ?? '4310'
const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OWNER = 'e2e-owner@example.test'
const PEOPLE = {
  office: 'e2e-spanish-office@example.test',
  estimator: 'e2e-spanish-estimator@example.test',
  worker: 'e2e-spanish-worker@example.test',
} as const
const MENU_SIZE = { office: 11, estimator: 8, worker: 2 } as const
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = (n: number) => ['synthetic', 'staff', 'spanish', 'passphrase', String(n)].join(' ')

type Catalog = Record<string, string>
const catalog = (name: string) =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(`../../../packages/i18n/src/catalogs/${name}.json`, import.meta.url)), 'utf8'),
  ) as Catalog
const EN = catalog('staff.en')
const ES = catalog('staff.es')
const CUSTOMER = new Set(Object.values(catalog('customer.en')))
const SPANISH = new Set(Object.values(ES))
/** Whole staff messages that read differently in Spanish: none may show on a Spanish screen. */
const ENGLISH_ONLY = Object.keys(EN)
  .map((k) => EN[k] as string)
  .filter((v, i, all) => all.indexOf(v) === i)
  .filter((v) => !v.includes('{') && v.split(/\s+/).length >= 3 && !SPANISH.has(v) && !CUSTOMER.has(v))

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
async function signIn(page: Page, email: string, password: string, name: string) {
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await passSecondFactor(page)
  await expect(page.getByText(name, { exact: true })).toBeVisible()
}
const menu = (page: Page) => page.getByRole('navigation', { name: /^(Main|Principal)$/ }).getByRole('link')
async function axe(page: Page) {
  await expectAccessible(page)
}
async function fresh(browser: Browser) {
  return (await browser.newContext({ extraHTTPHeaders: NETWORK })).newPage()
}
/** The main content's text without the parts marked English on purpose (lang="en"). */
async function spanishText(page: Page): Promise<string> {
  return page.locator('#staff-main').evaluate((main) => {
    const copy = main.cloneNode(true) as HTMLElement
    copy.querySelectorAll('[lang="en"]').forEach((n) => n.remove())
    return copy.innerText
  })
}

test.use({ extraHTTPHeaders: NETWORK })

test.describe('staff app in English and Spanish (TSK-0102, HH-LANG-02, HH-OPS-04)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('the Owner invites this spec’s Office member, Estimator and Worker', async ({ page }) => {
    await setPassword(page, ownerLink(), pw(1))
    await signIn(page, OWNER, pw(1), 'Signed in as E2E Owner')
    const csrf = (await (await page.request.get('/api/v1/staff/auth/session')).json()).csrfToken as string
    for (const [role, email] of Object.entries(PEOPLE)) {
      const res = await page.request.post('/api/v1/staff/invitations', {
        data: { email, displayName: `E2E Spanish ${role}`, role, reason: 'End-to-end Spanish staff test' },
        headers: { 'idempotency-key': `e2e-spanish-invite-${role}-0102`, 'x-csrf-token': csrf },
      })
      expect(res.status()).toBe(201)
    }
  })

  for (const role of Object.keys(PEOPLE) as (keyof typeof PEOPLE)[]) {
    test(`[HH-LANG-02][T70] the ${role} reads every screen of the menu in Spanish, then English again`, async ({
      browser,
    }) => {
      test.setTimeout(180_000)
      const page = await fresh(browser)
      await setPassword(page, staffAccess('password-link', PEOPLE[role]), pw(2))
      await signIn(page, PEOPLE[role], pw(2), `Signed in as E2E Spanish ${role}`)
      // The menu of each role (staff-shell.spec.ts): the Office 11 entries, the Estimator 8, the Worker 2.
      await expect(menu(page)).toHaveCount(MENU_SIZE[role])
      const english = await menu(page).allTextContents()
      for (const label of english) expect(Object.values(EN), label).toContain(label)

      // What was typed survives the switch (the search box, where the role has one).
      const search = page.getByRole('searchbox').first()
      const typed = (await search.count()) > 0
      if (typed) await search.fill('synthetic unsent search')
      await page.getByLabel('Language').selectOption('es')
      await expect(page.locator('html')).toHaveAttribute('lang', 'es')
      await expect(page.getByText(`Sesión iniciada como E2E Spanish ${role}`, { exact: true })).toBeVisible()
      if (typed) await expect(page.getByRole('searchbox').first()).toHaveValue('synthetic unsent search')

      const spanish = await menu(page).allTextContents()
      expect(spanish).toHaveLength(english.length)
      for (const label of spanish) expect(SPANISH.has(label), label).toBe(true)
      for (let i = 0; i < spanish.length; i++) {
        await menu(page).nth(i).click()
        const heading = page.getByRole('heading', { level: 1 })
        await expect(heading).toBeVisible()
        await page.waitForLoadState('networkidle')
        const title = (await heading.textContent())?.trim() ?? ''
        // A heading with values (a reference, a date) is checked by its fixed start.
        expect(
          [...SPANISH].some((m) => title === m || title.startsWith(m.split('{')[0] as string)),
          title,
        ).toBe(true)
        const text = await spanishText(page)
        expect(
          ENGLISH_ONLY.filter((m) => text.includes(m)),
          `${spanish[i]}: staff text left in English`,
        ).toEqual([])
        await axe(page)
      }

      // The public site stays English while this staff member reads Spanish (RULE-LANGUAGES, HH-LANG-01, T04).
      const site = await page.context().newPage()
      await site.goto('/')
      await expect(site.locator('html')).toHaveAttribute('lang', 'en')
      await expect(site.getByRole('link', { name: /Español|Spanish/ })).toHaveCount(0)
      // A former Spanish URL answers 301 with the English page (OWN-DEC-45).
      const former = await site.request.get('/es/services', { maxRedirects: 0 })
      expect(former.status()).toBe(301)
      expect(former.headers()['location']).toBe('/services')
      await site.close()

      // A new sign-in starts in Spanish (the choice is stored on the staff identity), then back to English.
      const other = await fresh(browser)
      await signIn(other, PEOPLE[role], pw(2), `Sesión iniciada como E2E Spanish ${role}`)
      await other.getByLabel('Idioma').selectOption('en')
      await expect(other.locator('html')).toHaveAttribute('lang', 'en')
      await expect(menu(other)).toHaveText(english)
      for (const p of [page, other]) await p.context().close()
    })
  }
})
