// Requests for help signing in or getting a new project link (TSK-0149; OWN-DEC-198 F4, F5, F6; HH-ID-09, HH-ID-11,
// HH-ID-03, HH-INT-11, RULE-SERVER-AUTHZ). Migration 0100 keeps the records true whatever path writes.
// - The secure alternative for a legitimate customer when texting is not available for a phone sign-in (F4), when the
//   account's contact is lost, or when asking for a new link reaches the limits or finds a link staff revoked (F5): the
//   visitor gives what they need (sign in, or a project link), the email or mobile phone they used and, when they have
//   it, the request reference. The answer is one and the same 202 whether or not anything matches (F6); only the form
//   itself (a malformed contact) and the network's limit differ, and those depend on no record.
// - Each request waits in the staff queue (access_help_request) until the Owner closes it once with an outcome and a
//   note: the Owner verifies the person's identity through the contact details on file (never through what was typed
//   alone), then signs the account out everywhere, starts a staff-assisted recovery or sends a new link to the
//   contact on file (security.ts). Nothing is sent to the typed value, and nothing here opens anything.
// - An open request for the same need and the same contact is not repeated (PROPOSED): the visitor's answer is the
//   same, and the queue keeps one item.
import type { Db, Tx } from '@handyhub/db'
import type { StaffActor } from '@handyhub/policy'
import { ApiError, type FieldError } from '../../api/errors.js'
import type { ContactValue } from '../access/recovery.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'
import { accessMatches, ownerText, SECURITY_LIMITS, type AccessMatches } from './security.js'

export const HELP_KINDS = ['sign_in', 'project_link'] as const
export type HelpKind = (typeof HELP_KINDS)[number]
/** PROPOSED outcomes of the Owner's answer. */
export const HELP_OUTCOMES = ['access_restored', 'identity_not_verified', 'no_match', 'no_action'] as const
export type HelpOutcome = (typeof HELP_OUTCOMES)[number]
export const HELP_QUEUE_TYPE = 'access_help_request'
const CLOSED_SHOWN = 50

/** The one answer to every accepted help request, matched or not. */
export const HELP_ACCEPTED = { accepted: true } as const

const field = (f: string, code: string): FieldError => ({ field: f, code, message: '' })

/** Records a help request (or keeps the open one for the same need and contact) and opens its queue item. */
export async function askForHelp(
  tx: Tx,
  input: { kind: HelpKind; contact: ContactValue; reference: string | null; now?: Date },
): Promise<{ id: string; created: boolean }> {
  if (!tx.isTransaction) throw new Error('askForHelp runs inside the business transaction (withTx)')
  const reference = input.reference?.trim().toUpperCase() || null
  const open = await tx
    .selectFrom('identity.access_help_requests')
    .select('id')
    .where('state', '=', 'open')
    .where('kind', '=', input.kind)
    .where('contact_value', '=', input.contact.value)
    .executeTakeFirst()
  if (open) return { id: open.id, created: false }
  const row = await tx
    .insertInto('identity.access_help_requests')
    .values({
      kind: input.kind,
      channel: input.contact.channel,
      contact_value: input.contact.value,
      reference,
      ...(input.now ? { created_at: input.now } : {}),
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  // The queue item names what was asked, never whether anything matched (no project, no reference).
  await openQueueItem(tx, { type: HELP_QUEUE_TYPE, subjectId: row.id, reason: input.kind })
  return { id: row.id, created: true }
}

export type HelpItem = {
  id: string
  kind: HelpKind
  channel: 'email' | 'phone'
  contact: string
  reference: string | null
  createdAt: Date
  state: 'open' | 'closed'
  outcome: HelpOutcome | null
  note: string | null
  closedBy: { id: string; name: string | null } | null
  closedAt: Date | null
  version: number
}
export type HelpView = { open: HelpItem[]; closed: HelpItem[] }
export type HelpDetail = HelpItem & { matches: AccessMatches }

function base(db: Db | Tx) {
  return db
    .selectFrom('identity.access_help_requests as h')
    .leftJoin('identity.staff_users as s', 's.id', 'h.closed_by')
    .select([
      'h.id',
      'h.kind',
      'h.channel',
      'h.contact_value',
      'h.reference',
      'h.created_at',
      'h.state',
      'h.outcome',
      'h.note',
      'h.closed_by',
      's.display_name as closed_name',
      'h.closed_at',
      'h.version',
    ])
}
type Row = Awaited<ReturnType<ReturnType<typeof base>['execute']>>[number]
const toItem = (r: Row): HelpItem => ({
  id: r.id,
  kind: r.kind as HelpKind,
  channel: r.channel as 'email' | 'phone',
  contact: r.contact_value,
  reference: r.reference,
  createdAt: r.created_at,
  state: r.state as 'open' | 'closed',
  outcome: r.outcome as HelpOutcome | null,
  note: r.note,
  closedBy: r.closed_by ? { id: r.closed_by, name: r.closed_name ?? null } : null,
  closedAt: r.closed_at,
  version: r.version,
})

/** The open requests (oldest first) and the last closed ones, for the Owner. */
export async function helpView(db: Db | Tx): Promise<HelpView> {
  const open = await base(db).where('h.state', '=', 'open').orderBy('h.created_at').execute()
  const closed = await base(db)
    .where('h.state', '=', 'closed')
    .orderBy('h.closed_at', 'desc')
    .limit(CLOSED_SHOWN)
    .execute()
  return { open: open.map(toItem), closed: closed.map(toItem) }
}

/** One request with what its typed values point to (the Owner's identity check); null when there is none. */
export async function helpDetail(db: Db | Tx, id: string, now: Date = new Date()): Promise<HelpDetail | null> {
  const row = await base(db).where('h.id', '=', id).executeTakeFirst()
  if (!row) return null
  const item = toItem(row)
  const matches = await accessMatches(
    db,
    { contact: { channel: item.channel, value: item.contact }, reference: item.reference },
    now,
  )
  return { ...item, matches }
}

/** Closes an open request once with the Owner's outcome and note; its queue item resolves. */
export async function closeHelp(
  tx: Tx,
  actor: StaffActor,
  id: string,
  input: { outcome: HelpOutcome; note: string },
): Promise<{ version: number }> {
  if (!(HELP_OUTCOMES as readonly string[]).includes(input.outcome))
    throw new ApiError('VALIDATION_FAILED', { fieldErrors: [field('body.outcome', 'INVALID')] })
  const note = ownerText(input.note, 'body.note', SECURITY_LIMITS.reason)
  const current = await tx
    .selectFrom('identity.access_help_requests')
    .select(['state'])
    .where('id', '=', id)
    .forUpdate()
    .executeTakeFirst()
  if (!current) throw new ApiError('NOT_FOUND')
  if (current.state !== 'open')
    throw new ApiError('CONFLICT', { fieldErrors: [field('request', 'HELP_REQUEST_CLOSED')] })
  const row = await tx
    .updateTable('identity.access_help_requests')
    .set({ state: 'closed', outcome: input.outcome, note, closed_by: actor.userId })
    .where('id', '=', id)
    .returning('version')
    .executeTakeFirstOrThrow()
  await resolveQueueItem(tx, { type: HELP_QUEUE_TYPE, subjectId: id, resolution: input.outcome })
  return { version: row.version }
}
