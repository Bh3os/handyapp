// Organization accounts with explicit memberships and scopes in a real browser (TSK-0118; HH-ID-13, HH-ID-03, T20,
// RULE-SERVER-AUTHZ). An administrator's account holds two verified projects; a member's account holds one of its own.
// Both are made through the request and receipt API (from networks of their own), then each signs in on /account in a
// browser of its own. The administrator sets up an organization, shares one project and invites the member's exact
// email with that project in scope and no privileges; the member accepts on their organizations page and finds that one
// project on their dashboard, marked as shared, without its payments, and never the administrator's other project.
// The administrator removes the member, and the member's next request reaches nothing. The codes are read back from the
// database and derived with the e2e servers' synthetic code key (codes.ts). Every visitor, address and name is
// synthetic (RULE-SYNTHETIC-DATA).
import { createDb } from '@handyhub/db'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import { codeFor } from '../codes.js'
import { expectAccessible } from '../a11y.js'

const databaseUrl = process.env['E2E_DATABASE_URL']
const SENT = /^If these details belong to a HandyHub account, we sent a code to them\./
// This spec's own synthetic client address (RFC 5737), so its limits never meet another spec's.
const HEADERS = { 'x-forwarded-for': '198.51.100.118' }
test.use({ extraHTTPHeaders: HEADERS })

async function axe(page: Page) {
  await expectAccessible(page)
}

async function withDb<T>(fn: (db: ReturnType<typeof createDb>) => Promise<T>): Promise<T> {
  const db = createDb(databaseUrl as string, { max: 1, applicationName: 'e2e-customer-organizations' })
  try {
    return await fn(db)
  } finally {
    await db.destroy()
  }
}

const latestCode = async (where: { subject?: string; destination?: string }) =>
  codeFor(
    await withDb((db) => {
      let q = db.selectFrom('identity.verification_codes').select(['id', 'nonce'])
      if (where.subject) q = q.where('subject_ref', '=', where.subject)
      if (where.destination) q = q.where('purpose', '=', 'account_sign_in').where('destination', '=', where.destination)
      return q.orderBy('created_at', 'desc').limit(1).executeTakeFirstOrThrow()
    }),
  )
/** Lets the resend cooldown and the hourly count pass for a destination (its codes keep their expiry). */
const afterCooldown = (destination: string) =>
  withDb(async (db) => {
    const rows = await db
      .selectFrom('identity.verification_codes')
      .select(['id', 'created_at'])
      .where('destination', '=', destination)
      .execute()
    for (const r of rows)
      await db
        .updateTable('identity.verification_codes')
        .set({ created_at: new Date(r.created_at.getTime() - 2 * 3_600_000) })
        .where('id', '=', r.id)
        .execute()
  })

let sent = 0
/** A request sent through the API, its email verified and its account created (or signed in to) on the receipt. */
async function linkedRequest(request: APIRequestContext, email: string, street: string): Promise<string> {
  const ip = { 'x-forwarded-for': `198.51.100.${30 + ++sent}` }
  const res = await request.post('/api/v1/public/requests', {
    headers: { ...ip, 'idempotency-key': `synthetic-e2e-organizations-${Date.now()}-${sent}` },
    data: {
      formVersion: 'e2e-1',
      privacyNoticeVersion: 'privacy-notice-1',
      services: [{ serviceId: 'SVC-DW-01' }],
      notSure: false,
      description: 'Synthetic organization project: a cracked hallway wall.',
      property: { street, city: 'Testville', state: 'KY', zip: '40000', propertyType: 'house' },
      timing: { flexible: true, needHelpToday: false, windows: ['mornings'] },
      estimatePreference: 'online',
      contact: { fullName: 'Test Organization Customer', email, phone: '(502) 555-0118', preferredChannel: 'email' },
      smsOptIn: false,
      marketingOptIn: false,
    },
  })
  expect(res.status()).toBe(201)
  const reference = ((await res.json()) as { reference: string }).reference
  const contact = await withDb((db) =>
    db.selectFrom('intake.requests').select('contact_id').where('reference', '=', reference).executeTakeFirstOrThrow(),
  )
  const headers = { ...ip, 'receipt-capability': res.headers()['receipt-capability'] as string }
  await afterCooldown(email)
  expect(
    (
      await request.post('/api/v1/public/request-receipt/contact/codes', { headers, data: { channel: 'email' } })
    ).status(),
  ).toBe(202)
  const verified = await request.post('/api/v1/public/request-receipt/contact/verify', {
    headers,
    data: { channel: 'email', code: await latestCode({ subject: `contact:${contact.contact_id}:email` }) },
  })
  expect(verified.status()).toBe(200)
  await afterCooldown(email)
  expect(
    (
      await request.post('/api/v1/public/request-receipt/account/codes', { headers, data: { channel: 'email' } })
    ).status(),
  ).toBe(202)
  const account = await request.post('/api/v1/public/request-receipt/account', {
    headers,
    data: { channel: 'email', code: await latestCode({ destination: email }) },
  })
  expect(account.status()).toBe(200)
  return reference
}

/** Signs in on /account with the code sent to the email, then opens the organizations page. */
async function signIn(page: Page, email: string) {
  await afterCooldown(email)
  await page.goto('/account')
  const form = page.getByRole('region', { name: 'Sign in' })
  await form.getByLabel('Email or mobile phone').fill(email)
  await form.getByRole('button', { name: 'Send me a code' }).click()
  await expect(form.getByText(SENT)).toBeVisible()
  await form.getByLabel('Code').fill(await latestCode({ destination: email }))
  await form.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeFocused()
}

/** What the page's own session gets from an API read (the browser sends its host-only session cookie). */
const statusOf = (page: Page, url: string) => page.evaluate(async (u) => (await fetch(u)).status, url)

test.describe('organization accounts (TSK-0118)', () => {
  test.skip(!databaseUrl, 'needs E2E_DATABASE_URL (a fresh PostgreSQL 16 database)')

  test('[HH-ID-13][HH-ID-03][T20][RULE-SERVER-AUTHZ] a member sees only the project in scope, without payments; removal ends access on the next request', async ({
    page,
    browser,
    request,
  }) => {
    const adminEmail = 'organization-admin-e2e@example.test'
    const memberEmail = 'organization-member-e2e@example.test'
    const shared = await linkedRequest(request, adminEmail, '118 Synthetic Rental Row')
    const kept = await linkedRequest(request, adminEmail, '119 Synthetic Rental Row')
    const own = await linkedRequest(request, memberEmail, '5 Synthetic Manager Lane')

    // The administrator sets up the organization, shares one project and invites the member's exact email.
    await signIn(page, adminEmail)
    await page.goto('/portal/')
    await page.getByRole('navigation', { name: 'Your account' }).getByRole('link', { name: 'Organizations' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Organizations' })).toBeVisible()
    await page.getByLabel('Organization name').fill('Synthetic Rentals E2E')
    await page.getByRole('button', { name: 'Set up organization' }).click()
    await expect(page.getByText('Synthetic Rentals E2E is set up. Share a project, then invite someone.')).toBeVisible()
    const org = page.getByRole('region', { name: 'Synthetic Rentals E2E' })
    await org.getByLabel('Project to share').selectOption(shared)
    await org.getByRole('button', { name: 'Share project' }).click()
    await expect(page.getByText(`Project ${shared} is shared.`)).toBeVisible()
    await org.getByLabel('Email address').fill(memberEmail)
    await org.getByRole('checkbox', { name: `Project ${shared}` }).check()
    await org.getByRole('button', { name: 'Invite' }).click()
    await expect(page.getByText(`${memberEmail} is invited.`)).toBeVisible()
    await expect(org.getByRole('listitem', { name: memberEmail }).getByText('Invited')).toBeVisible()
    await axe(page)

    // The member signs in in a browser of their own and accepts; nothing was reachable before.
    const memberContext = await browser.newContext({ extraHTTPHeaders: { 'x-forwarded-for': '198.51.100.119' } })
    const member = await memberContext.newPage()
    await signIn(member, memberEmail)
    expect(await statusOf(member, `/api/v1/customer/projects/${shared}/overview`)).toBe(404)
    await member.goto('/portal/organizations')
    const invitation = member.getByRole('listitem', { name: 'Synthetic Rentals E2E' })
    await expect(invitation.getByText('Synthetic Rentals E2E invited you to see 1 project.')).toBeVisible()
    await axe(member)
    await invitation.getByRole('button', { name: 'Accept the invitation from Synthetic Rentals E2E' }).click()
    await expect(
      member.getByText('You joined Synthetic Rentals E2E. The projects it shares with you are on your projects page.'),
    ).toBeVisible()

    // Exactly the project in scope, marked as shared; the administrator's other project never.
    await member.goto('/portal/')
    const sharedItem = member.getByRole('listitem', { name: `Project ${shared}` })
    await expect(sharedItem.getByText('Shared with you by Synthetic Rentals E2E')).toBeVisible()
    await expect(sharedItem.getByRole('link', { name: /Request This Service Again/ })).toHaveCount(0)
    await expect(member.getByRole('listitem', { name: `Project ${own}` })).toBeVisible()
    await expect(member.getByRole('listitem', { name: `Project ${kept}` })).toHaveCount(0)
    await axe(member)
    await member.goto(`/portal/p/${shared}`)
    await expect(member.getByText("Payments aren't shared with you")).toBeVisible()
    expect(await statusOf(member, `/api/v1/customer/projects/${kept}/overview`)).toBe(404)
    expect(await statusOf(member, `/api/v1/customer/projects/${shared}/payments`)).toBe(404)

    // The administrator removes the member: the member's next request reaches nothing of the organization.
    await page.reload()
    const person = page
      .getByRole('region', { name: 'Synthetic Rentals E2E' })
      .getByRole('listitem', { name: memberEmail })
    await expect(person.getByText('Member')).toBeVisible()
    await person.getByRole('button', { name: `Remove ${memberEmail}` }).click()
    await expect(page.getByText(`${memberEmail} no longer has access.`)).toBeVisible()
    await member.goto('/portal/')
    await expect(member.getByRole('listitem', { name: `Project ${own}` })).toBeVisible()
    await expect(member.getByRole('listitem', { name: `Project ${shared}` })).toHaveCount(0)
    expect(await statusOf(member, `/api/v1/customer/projects/${shared}/overview`)).toBe(404)
    await memberContext.close()
  })
})
