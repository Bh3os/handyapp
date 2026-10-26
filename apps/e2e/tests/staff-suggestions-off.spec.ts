// AI suggestions stay off on the staff screens in a real browser (TSK-0117; HH-AUTO-03, HH-AUTO-04, RULE-AI-WAVE2,
// RULE-SERVER-AUTHZ). The Owner opens the Owner Dashboard and the scheduling board: each says AI suggestions are off
// and names the manual path, and no screen asks the AI routes anything. Asked directly, the server refuses with
// AI_DISABLED and the manual path. Named after staff-auth, which creates the first Owner. Accounts are synthetic
// (RULE-SYNTHETIC-DATA).
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { AxeBuilder } from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { passSecondFactor } from '../mfa.js'

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa']
const databaseUrl = process.env['E2E_DATABASE_URL']
// This spec's own synthetic network (RFC 5737): staff sign-in limits count per network.
const NETWORK = { 'x-forwarded-for': '198.51.100.117' }
const port = process.env['E2E_PORT'] ?? '4310'
const cli = fileURLToPath(new URL('../../server/dist/cli/staff-access.js', import.meta.url))
const OWNER = 'e2e-owner@example.test'
// Built at runtime so no literal looks like a credential (RULE-SYNTHETIC-DATA).
const pw = ['synthetic', 'staff', 'suggestions', 'off', 'passphrase', '117'].join(' ')

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
async function signIn(page: Page) {
  await page.goto(ownerLink())
  await page.getByLabel('New password').fill(pw)
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Your password is saved. Sign in with your new password.')).toBeVisible()
  await page.goto('/staff/sign-in')
  await page.getByLabel('Email').fill(OWNER)
  await page.getByLabel('Password', { exact: true }).fill(pw)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // MFA is mandatory (TSK-0154): enrol on the account's first sign-in, the code afterwards.
  await passSecondFactor(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Action queue' })).toBeVisible()
}

test.use({ extraHTTPHeaders: NETWORK })

test.describe('AI suggestions off (TSK-0117, RULE-AI-WAVE2)', () => {
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-AUTO-03][RULE-AI-WAVE2] staff screens show the manual path only; the server refuses every AI request', async ({
    page,
  }) => {
    const aiCalls: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/api/v1/staff/ai/')) aiCalls.push(r.url())
    })
    await signIn(page)
    const main = page.getByRole('navigation', { name: 'Main' })

    await main.getByRole('link', { name: 'Owner Dashboard' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Owner Dashboard' })).toBeVisible()
    const dashboardNote = page.getByTestId('ai-off')
    await expect(dashboardNote).toHaveText('AI suggestions off Read the figures yourself.')
    await expect(dashboardNote).toHaveAttribute('data-ai-use', 'performance.summarize')
    const scan = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()
    expect(scan.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([])

    await main.getByRole('link', { name: 'Scheduling board' }).click()
    await expect(page.getByTestId('schedule-board')).toBeVisible()
    await expect(page.getByTestId('ai-off')).toHaveText(
      'AI suggestions off Choose the arrival windows to offer yourself.',
    )
    expect(aiCalls).toEqual([])

    // Asked directly, the gateway refuses: AI is disabled, and the manual path is the answer.
    const csrf = (await (await page.request.get('/api/v1/staff/auth/session')).json()).csrfToken as string
    const res = await page.request.post('/api/v1/staff/ai/uses/schedule.suggest/suggestions', {
      headers: { 'x-csrf-token': csrf },
    })
    expect(res.status()).toBe(200)
    const body = (await res.json()) as { outcome: string; reasons: string[]; manualPath: string }
    expect(body.outcome).toBe('refused')
    expect(body.reasons[0]).toBe('AI_DISABLED')
    expect(body.manualPath).toBe('Office offers windows from the scheduling board.')
  })
})
