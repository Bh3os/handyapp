// Two origins in a real browser (TSK-0017; OWN-DEC-133, HH-ARC-06, HH-ARC-07, HH-SEC-02). The split server of
// playwright.config.ts answers public.localhost and staff.localhost; accounts are synthetic (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

const databaseUrl = process.env['E2E_DATABASE_URL']
const port = process.env['E2E_SPLIT_PORT'] ?? '4312'
const PUBLIC = `http://public.localhost:${port}`
const STAFF = `http://staff.localhost:${port}`
const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OWNER = 'e2e-owner@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const password = ['synthetic', 'two', 'origins', 'passphrase', '5'].join(' ')

/** A set-password link on the staff origin: the first Owner's invite, or a reset when the Owner already exists. */
function ownerLink(): string {
  const env = {
    ...process.env,
    HANDYHUB_ENV: 'ci',
    DATABASE_URL: databaseUrl,
    PUBLIC_ORIGIN: PUBLIC,
    STAFF_ORIGIN: STAFF,
  }
  const run = (...args: string[]) =>
    execFileSync(process.execPath, [cli, ...args], { env, encoding: 'utf8', stdio: 'pipe' })
  let out: string
  try {
    out = run('create-owner', OWNER, 'E2E Owner')
  } catch {
    out = run('password-link', OWNER)
  }
  return out.split('\n')[0] as string
}

/** Content-Security-Policy violations the page reports (the CSP must not break any page). */
async function watchCsp(page: Page): Promise<string[]> {
  const violations: string[] = []
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) violations.push(m.text())
  })
  return violations
}

test.describe('two origins (TSK-0017, OWN-DEC-133, HH-ARC-06)', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-ARC-06][HH-SEC-02] staff sign-in on the staff host stays there; the public host never sees it', async ({
    page,
    context,
  }) => {
    const violations = await watchCsp(page)
    const link = ownerLink()
    expect(link.startsWith(`${STAFF}/`)).toBe(true)
    await page.goto(link)
    await page.getByLabel('New password').fill(password)
    await page.getByRole('button', { name: 'Save password' }).click()
    await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()

    const res = await page.goto(`${STAFF}/sign-in`)
    expect(res?.headers()['x-frame-options']).toBe('DENY')
    expect(res?.headers()['referrer-policy']).toBe('no-referrer')
    expect(res?.headers()['x-robots-tag']).toBe('noindex, nofollow')
    await page.getByLabel('Email').fill(OWNER)
    await page.getByLabel('Password', { exact: true }).fill(password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Signed in as E2E Owner', { exact: true })).toBeVisible()

    // The staff cookie is host-only: the browser keeps it for the staff host and sends it nowhere else.
    const staffCookies = await context.cookies(STAFF)
    const session = staffCookies.find((c) => c.name === 'hh_staff')
    expect(session?.domain).toBe('staff.localhost')
    expect(session?.httpOnly).toBe(true)
    expect(session?.sameSite).toBe('Strict')
    expect((await context.cookies(PUBLIC)).map((c) => c.name)).not.toContain('hh_staff')

    // The public host serves the site; the staff API there is 404. A call to the staff host is blocked twice over:
    // the page's CSP allows only its own origin (connect-src 'self') and the staff host sends no CORS allowance.
    await page.goto(`${PUBLIC}/`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(violations).toEqual([])
    const probe = await page.evaluate(async (staff) => {
      const same = await fetch('/api/v1/staff/auth/session', { credentials: 'include' })
      let cross = 'answered'
      try {
        await fetch(`${staff}/api/v1/staff/auth/session`, { credentials: 'include' })
      } catch {
        cross = 'blocked'
      }
      return { same: same.status, cross }
    }, STAFF)
    expect(probe).toEqual({ same: 404, cross: 'blocked' })
    expect(violations.some((v) => v.includes("connect-src 'self'"))).toBe(true)
    violations.length = 0

    // The staff app is not on the public host.
    expect((await page.goto(`${PUBLIC}/staff/sign-in`))?.status()).toBe(404)
    expect(violations).toEqual([])
  })

  test('[HH-SEC-02] the public pages and the portal load under the CSP without violations', async ({ page }) => {
    const violations = await watchCsp(page)
    const home = await page.goto(`${PUBLIC}/`)
    expect(home?.headers()['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(home?.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin')
    await page.goto(`${PUBLIC}/request`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const portal = await page.goto(`${PUBLIC}/portal/`)
    expect(portal?.status()).toBe(200)
    expect(portal?.headers()['x-robots-tag']).toBe('noindex, nofollow')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(violations).toEqual([])
  })
})
