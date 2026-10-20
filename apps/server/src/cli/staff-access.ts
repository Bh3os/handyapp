// Operations command for staff access (TSK-0014; HH-STAFF-01 safe bootstrap, OWN-DEC-114). Run in the host shell
// (Render shell) with DATABASE_URL set; it prints one single-use set-password link and nothing else secret:
//   node apps/server/dist/cli/staff-access.js create-owner <email> [display name]   only while no Owner exists
//   node apps/server/dist/cli/staff-access.js password-link <email>                 invite or reset link for an account
// The token is never stored (only its SHA-256) and never logged; the link expires per session.timings.
import { randomUUID } from 'node:crypto'
import { createDb, withTx } from '@handyhub/db'
import { loadConfig } from '../config.js'
import { accountForSignIn, createStaffUser, ownerExists } from '../modules/identity/accounts.js'
import { issueLinkNow } from '../modules/identity/links.js'
import { audit } from '../platform/audit.js'
import { runWithContext } from '../platform/request-context.js'

const [command, emailArg, ...nameParts] = process.argv.slice(2)
const fail = (message: string): never => {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}
if (!command || !emailArg || !['create-owner', 'password-link'].includes(command))
  fail('usage: staff-access create-owner <email> [display name] | password-link <email>')
const config = loadConfig(process.env)
if (!config.databaseUrl) fail('DATABASE_URL is not set')

const db = createDb(config.databaseUrl as string, { max: 1, applicationName: 'handyapp-staff-access' })
const requestId = `ops:${randomUUID()}`
const actor = { kind: 'system' as const, process: 'ops:staff-access' }
try {
  const link = await runWithContext({ requestId }, () =>
    withTx(db, async (tx) => {
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
  const base = (config.staffAppUrl ?? '<STAFF_APP_URL>').replace(/\/$/, '')
  process.stdout.write(`${base}/${link.purpose}/${link.token}\nexpires ${link.expiresAt.toISOString()}\n`)
} finally {
  await db.destroy()
}
