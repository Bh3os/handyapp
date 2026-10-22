// Operations command for staff access (TSK-0014; HH-STAFF-01 safe bootstrap, OWN-DEC-114). Run in the host shell
// (Render shell) with DATABASE_URL set; it prints one single-use set-password link and nothing else secret:
//   node apps/server/dist/cli/staff-access.js create-owner <email> [display name]   only while no Owner exists
//   node apps/server/dist/cli/staff-access.js password-link <email>                 invite or reset link for an account
//   node apps/server/dist/cli/staff-access.js reset-mfa <email> <reason>            an Owner's own lost authenticator
// The token is never stored (only its SHA-256) and never logged; the link expires per session.timings.
// reset-mfa (TSK-0154, OWN-DEC-202; PROPOSED as the Owner's recovery path when no recovery code is left): only for an
// account holding the Owner role (staff members' authenticators are reset by the Owner in the staff app). It removes
// the authenticator and its recovery codes and revokes every session, audited with the reason; MFA stays mandatory,
// so the Owner's next sign-in with their password enrols a new authenticator. Shell access to the host is the proof
// of authority, as for create-owner; it prints nothing secret.
import { randomUUID } from 'node:crypto'
import { createDb, withTx } from '@handyhub/db'
import { loadConfig } from '../config.js'
import { accountForSignIn, createStaffUser, ownerExists } from '../modules/identity/accounts.js'
import { issueLinkNow } from '../modules/identity/links.js'
import { recoverOwnerMfa } from '../modules/identity/recovery.js'
import { audit } from '../platform/audit.js'
import { runWithContext } from '../platform/request-context.js'

const [command, emailArg, ...nameParts] = process.argv.slice(2)
const fail = (message: string): never => {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}
if (!command || !emailArg || !['create-owner', 'password-link', 'reset-mfa'].includes(command))
  fail('usage: staff-access create-owner <email> [display name] | password-link <email> | reset-mfa <email> <reason>')
if (command === 'reset-mfa' && !nameParts.join(' ').trim()) fail('reset-mfa needs a reason: reset-mfa <email> <reason>')
const config = loadConfig(process.env)
if (!config.databaseUrl) fail('DATABASE_URL is not set')

const db = createDb(config.databaseUrl as string, { max: 1, applicationName: 'handyapp-staff-access' })
const requestId = `ops:${randomUUID()}`
const actor = { kind: 'system' as const, process: 'ops:staff-access' }
try {
  const link = await runWithContext({ requestId }, () =>
    withTx(db, async (tx) => {
      if (command === 'reset-mfa') {
        const out = await recoverOwnerMfa(tx, { email: emailArg as string, reason: nameParts.join(' '), actor })
        if (out.outcome === 'not_an_owner')
          return fail('No Owner account that can be recovered has this email; staff members are reset by the Owner.')
        if (out.outcome === 'not_enrolled')
          return fail('This Owner has no authenticator; they enrol one at their next sign-in.')
        return null
      }
      if (command === 'create-owner') {
        if (await ownerExists(tx)) fail('An Owner account already exists; use password-link instead.')
        const user = await createStaffUser(tx, {
          email: emailArg as string,
          displayName: nameParts.join(' ').trim() || null,
          locale: 'en',
          role: 'owner',
          issuedBy: 'system:ops',
          reason: 'First Owner from the operations command',
        })
        await audit.record(tx, {
          actor,
          action: 'staff.invite',
          target: { type: 'staff_user', id: user.id },
          summary: { role: 'owner', bootstrap: true },
        })
        return {
          purpose: 'invite' as const,
          ...(await issueLinkNow(tx, { staffUserId: user.id, purpose: 'invite', issuedBy: 'system:ops' })),
        }
      }
      const account = await accountForSignIn(tx, emailArg as string)
      if (!account || account.status === 'disabled')
        return fail('No staff account that can receive a link has this email.')
      const purpose = account.status === 'invited' ? ('invite' as const) : ('reset' as const)
      await audit.record(tx, {
        actor,
        action: 'staff.start_password_recovery',
        target: { type: 'staff_user', id: account.id },
        summary: { purpose },
      })
      return { purpose, ...(await issueLinkNow(tx, { staffUserId: account.id, purpose, issuedBy: 'system:ops' })) }
    }),
  )
  if (link === null)
    process.stdout.write(
      'authenticator removed and every session ended; sign in with the password to enrol a new one\n',
    )
  else {
    const base = (config.staffAppUrl ?? '<STAFF_APP_URL>').replace(/\/$/, '')
    process.stdout.write(`${base}/${link.purpose}/${link.token}\nexpires ${link.expiresAt.toISOString()}\n`)
  }
} finally {
  await db.destroy()
}
