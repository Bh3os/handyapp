// The Owner Acceptance Testing accounts (TSK-0142; HH-OPS-06, OWN-DEC-191, RULE-SYNTHETIC-DATA, HH-STAFF-01). One
// fictional account per role the Owner tests with on staging: Customer, Guest Customer, Staff (Worker), Estimator,
// Office and Owner. Every address is on the reserved example.test domain; nothing names a real person.
// - Staff accounts are created exactly as the Owner's own invitation creates them (an invited account with its role and
//   a single-use invite link sent through the outbox). No password is ever set or stored here: the invite email is the
//   credential, and on staging it reaches only an approved test address (TEST_EMAIL_DESTINATIONS), which the log
//   sender writes to the private service log (EMAIL_PROVIDER=log). The Owner sets each password and enrols the
//   authenticator (mandatory MFA, OWN-DEC-202) at first sign-in.
// - The Customer is a registered customer account made through the same request, contact verification and account
//   offer a customer uses (fresh-data.ts), and is designated a reusable test account, so every reset keeps it. It
//   signs in with a one-time code sent to its address.
// - The Guest Customer has no account by design: it is the identity to type into the request form; its secure project
//   link is emailed to its address.
// - An account that exists already is left as it is (repeating the action is safe). Reset Test Data keeps staff
//   accounts, and keeps the Customer as a reusable account; a Guest's requests are removed like any test record.
import { isTestEmail, type Db, type Tx } from '@handyhub/db'
import type { StaffRole } from '@handyhub/policy'
import { sql } from 'kysely'
import { createStaffUser } from '../identity/accounts.js'
import { issueLink } from '../identity/links.js'
import { createRegisteredTestCustomer, type FreshDataDeps } from './fresh-data.js'
import type { StagingEnvironment } from './index.js'

export const TEST_ACCOUNT_IDS = ['customer', 'guest_customer', 'worker', 'estimator', 'office', 'owner'] as const
export type TestAccountId = (typeof TEST_ACCOUNT_IDS)[number]

type Definition =
  | { id: TestAccountId; kind: 'customer' | 'guest'; email: string; name: string }
  | { id: TestAccountId; kind: 'staff'; role: StaffRole; email: string; name: string }

/** PROPOSED addresses and names (no owner decision names them): reserved test domain, labelled fictional. */
export const TEST_ACCOUNTS: readonly Definition[] = [
  { id: 'customer', kind: 'customer', email: 'oat-customer@example.test', name: 'TEST DATA (fictional) Customer' },
  { id: 'guest_customer', kind: 'guest', email: 'oat-guest@example.test', name: 'TEST DATA (fictional) Guest' },
  { id: 'worker', kind: 'staff', role: 'worker', email: 'oat-worker@example.test', name: 'Test Worker (fictional)' },
  {
    id: 'estimator',
    kind: 'staff',
    role: 'estimator',
    email: 'oat-estimator@example.test',
    name: 'Test Estimator (fictional)',
  },
  { id: 'office', kind: 'staff', role: 'office', email: 'oat-office@example.test', name: 'Test Office (fictional)' },
  { id: 'owner', kind: 'staff', role: 'owner', email: 'oat-owner@example.test', name: 'Test Owner (fictional)' },
]

for (const a of TEST_ACCOUNTS)
  if (!isTestEmail(a.email)) throw new Error(`test account ${a.id} must use a reserved test domain`)

export type TestAccountState = 'not_created' | 'invited' | 'active' | 'disabled' | 'no_account'

export type TestAccountView = {
  id: TestAccountId
  kind: 'customer' | 'guest' | 'staff'
  role: StaffRole | null
  email: string
  name: string
  state: TestAccountState
  /** The Customer: kept through every reset (designated reusable). Null for the others. */
  reusable: boolean | null
  /** Staff: the authenticator is enrolled. Null for customers. */
  mfaEnrolled: boolean | null
  /** Whether email to this address can arrive here (an approved test destination); null when unknown. */
  receivesEmail: boolean | null
}

/** Whether an email to this address can be delivered in this environment (providers/destinations.ts, the same rule). */
export function receivesEmail(
  environment: StagingEnvironment,
  approved: readonly string[] | null,
  email: string,
): boolean | null {
  if (environment === 'local' || environment === 'ci') return isTestEmail(email)
  if (approved === null) return null
  return approved.map((e) => e.trim().toLowerCase()).includes(email)
}

export async function testAccountViews(
  db: Db | Tx,
  environment: StagingEnvironment,
  approved: readonly string[] | null,
): Promise<TestAccountView[]> {
  const emails = TEST_ACCOUNTS.map((a) => a.email)
  const staff = await db
    .selectFrom('identity.staff_users as u')
    .select(['u.email', 'u.status', 'u.id'])
    .where('u.email', 'in', emails)
    .execute()
  const enrolled = new Set(
    staff.length
      ? (
          await sql<{ staff_user_id: string }>`SELECT staff_user_id FROM identity.staff_mfa
            WHERE confirmed_at IS NOT NULL AND staff_user_id IN (${sql.join(staff.map((s) => s.id))})`.execute(db)
        ).rows.map((r) => r.staff_user_id)
      : [],
  )
  const customers = await db
    .selectFrom('identity.customer_accounts as a')
    .leftJoin('staging.reusable_test_accounts as r', 'r.account_id', 'a.id')
    .select(['a.sign_in_email', 'a.state', 'r.account_id'])
    .where('a.sign_in_email', 'in', emails)
    .where('a.state', '=', 'active')
    .execute()
  return TEST_ACCOUNTS.map((a) => {
    const base = {
      id: a.id,
      kind: a.kind,
      role: a.kind === 'staff' ? a.role : null,
      email: a.email,
      name: a.name,
      receivesEmail: receivesEmail(environment, approved, a.email),
    }
    if (a.kind === 'guest') return { ...base, state: 'no_account' as const, reusable: null, mfaEnrolled: null }
    if (a.kind === 'customer') {
      const c = customers.find((r) => r.sign_in_email === a.email)
      return {
        ...base,
        state: c ? ('active' as const) : ('not_created' as const),
        reusable: c ? c.account_id !== null : false,
        mfaEnrolled: null,
      }
    }
    const s = staff.find((r) => r.email === a.email)
    return {
      ...base,
      state: (s?.status ?? 'not_created') as TestAccountState,
      reusable: null,
      mfaEnrolled: s ? enrolled.has(s.id) : false,
    }
  })
}

export type CreateOutcome = {
  id: TestAccountId
  outcome: 'created' | 'exists' | 'blocked' | 'no_account'
  step: string | null
  codes: string[]
}

/**
 * Creates every test account that does not exist yet, in the caller's transaction. Staff: an invited account with its
 * role and an emailed invite link. Customer: a registered account, designated reusable (an existing one is designated
 * again if it was released). The Customer's steps run under a savepoint: a refused step leaves nothing behind.
 */
export async function createTestAccounts(
  tx: Tx,
  input: { ownerId: string; reason: string; fresh: FreshDataDeps },
): Promise<CreateOutcome[]> {
  const issuedBy = `staff:${input.ownerId}`
  const reason = `Owner Acceptance Testing test account (TSK-0142): ${input.reason}`.slice(0, 2000)
  const out: CreateOutcome[] = []
  for (const a of TEST_ACCOUNTS) {
    if (a.kind === 'guest') {
      out.push({ id: a.id, outcome: 'no_account', step: null, codes: [] })
      continue
    }
    if (a.kind === 'staff') {
      const exists = await tx
        .selectFrom('identity.staff_users')
        .select('id')
        .where('email', '=', a.email)
        .executeTakeFirst()
      if (exists) {
        out.push({ id: a.id, outcome: 'exists', step: null, codes: [] })
        continue
      }
      const user = await createStaffUser(tx, {
        email: a.email,
        displayName: a.name,
        locale: 'en',
        role: a.role,
        issuedBy,
        reason,
      })
      await issueLink(tx, { staffUserId: user.id, purpose: 'invite', issuedBy })
      out.push({ id: a.id, outcome: 'created', step: null, codes: [] })
      continue
    }
    let account = await tx
      .selectFrom('identity.customer_accounts')
      .select('id')
      .where('sign_in_email', '=', a.email)
      .where('state', '=', 'active')
      .executeTakeFirst()
    let outcome: CreateOutcome = { id: a.id, outcome: 'exists', step: null, codes: [] }
    if (!account) {
      await sql`SAVEPOINT oat_test_customer`.execute(tx)
      const made = await createRegisteredTestCustomer(input.fresh, tx, { email: a.email, fullName: a.name })
      if (made.state === 'blocked') {
        await sql`ROLLBACK TO SAVEPOINT oat_test_customer`.execute(tx)
        out.push({ id: a.id, outcome: 'blocked', step: made.step, codes: made.codes })
        continue
      }
      await sql`RELEASE SAVEPOINT oat_test_customer`.execute(tx)
      account = await tx
        .selectFrom('identity.customer_accounts')
        .select('id')
        .where('sign_in_email', '=', a.email)
        .where('state', '=', 'active')
        .executeTakeFirst()
      if (!account) {
        out.push({ id: a.id, outcome: 'blocked', step: 'create_account', codes: ['ACCOUNT_NOT_FOUND'] })
        continue
      }
      outcome = { id: a.id, outcome: 'created', step: null, codes: [] }
    }
    await tx
      .insertInto('staging.reusable_test_accounts')
      .values({ account_id: account.id, designated_by: input.ownerId })
      .onConflict((oc) => oc.column('account_id').doNothing())
      .execute()
    out.push(outcome)
  }
  return out
}
