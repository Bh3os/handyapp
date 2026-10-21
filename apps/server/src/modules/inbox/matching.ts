// Matching an inbound message to a project (TSK-0049; HH-COM-07, HH-ID-02, T21, OWN-DEC-120). Only reliable references
// and contact records match, never a name, and a message is matched only when exactly one project fits:
// - Email, first by reference: the per-project reply token among the recipients, or In-Reply-To/References naming a
//   message already in a project's conversation. The reference names the project; the sender must still be an email
//   of that project's customer's contacts, otherwise the message waits in Needs Linking with the project as a
//   suggestion for office staff (a forwarded email or a third party in the thread is never attached on its own).
//   References naming different projects are conflicting: Needs Linking.
// - Email without a reference: a verified contact email (the exact verified value); text: the verified phone number.
//   The address must belong to one customer (a shared contact such as a landlord and tenant is Needs Linking, T21), and
//   that customer must have one open project. With several open projects a text goes to the latest open conversation:
//   the customer conversation whose last outbound text went to that number (PROPOSED reading of "the latest open
//   conversation"); otherwise, and always for email, several projects are Needs Linking.
// - Anything else (unknown or unverified sender, merged customer, no open project) is Needs Linking.
// PROPOSED: open projects are those not closed or canceled; a merged customer's contacts never match (TSK-0046).
// PROPOSED (TSK-0046 links): a customer's open projects are those staff see under it now (merged records' and
// relinked requests' included, a request relinked away excluded), so a merge or relink that makes several projects
// fit sends the message to Needs Linking (HH-COM-07); only a project created for that customer is matched on its own.
import type { Tx } from '@handyhub/db'
import { sql } from 'kysely'
import { projectsUnder } from '../customers/links.js'
import { replyTokensIn, type InboundAddress } from './threading.js'

export const CLOSED_PROJECT_STATES = ['closed', 'canceled'] as const

export type MatchRule = 'reply_token' | 'thread_reference' | 'verified_email' | 'verified_phone' | 'latest_conversation'
export type NeedsLinkingReason =
  | 'no_match'
  | 'shared_contact'
  | 'several_projects'
  | 'no_open_project'
  | 'sender_not_on_project'
  | 'conflicting_references'

export type MatchInput = {
  channel: 'email' | 'sms'
  /** Lower-case e-mail or E.164. */
  from: string
  /** Email: every recipient address (to, cc, received for). */
  recipients?: readonly string[]
  /** Email: the Message-IDs of In-Reply-To and References. */
  references?: readonly string[]
  replyAddress: InboundAddress | null
}

export type MatchResult =
  | { state: 'matched'; rule: MatchRule; projectId: string; customerId: string; contactId: string | null }
  | { state: 'needs_linking'; reason: NeedsLinkingReason; suggestedProjectId: string | null }

const needs = (reason: NeedsLinkingReason, suggestedProjectId: string | null = null): MatchResult => ({
  state: 'needs_linking',
  reason,
  suggestedProjectId,
})

/** The contact of `customerId` whose address is `from` (any verification state), if any. */
export async function contactOf(
  tx: Tx,
  customerId: string,
  channel: 'email' | 'sms',
  from: string,
): Promise<string | null> {
  const row = await tx
    .selectFrom('crm.contacts')
    .select('id')
    .where('customer_id', '=', customerId)
    .where(channel === 'email' ? 'email_normalized' : 'phone_e164', '=', from)
    .orderBy('created_at')
    .orderBy('id')
    .executeTakeFirst()
  return row?.id ?? null
}

async function referencedProjects(tx: Tx, input: MatchInput): Promise<{ ids: string[]; rule: MatchRule | null }> {
  const tokens = replyTokensIn(input.recipients ?? [], input.replyAddress)
  const byToken = tokens.length
    ? (
        await tx.selectFrom('comms.project_reply_tokens').select('project_id').where('token', 'in', tokens).execute()
      ).map((r) => r.project_id)
    : []
  const refs = [...new Set(input.references ?? [])]
  const byThread = refs.length
    ? (
        await tx
          .selectFrom('comms.messages')
          .select('project_id')
          .where('email_message_id', 'in', refs)
          .where('link_state', '<>', 'needs_linking')
          .where('project_id', 'is not', null)
          .execute()
      ).map((r) => r.project_id as string)
    : []
  const ids = [...new Set([...byToken, ...byThread])]
  return { ids, rule: byToken.length ? 'reply_token' : byThread.length ? 'thread_reference' : null }
}

/** Decides where an inbound message belongs (pure reads; the caller writes the result). */
export async function matchInbound(tx: Tx, input: MatchInput): Promise<MatchResult> {
  if (input.channel === 'email') {
    const ref = await referencedProjects(tx, input)
    if (ref.ids.length > 1) return needs('conflicting_references')
    if (ref.ids.length === 1 && ref.rule) {
      const projectId = ref.ids[0] as string
      const project = await tx
        .selectFrom('crm.projects as p')
        .innerJoin('crm.customers as cu', 'cu.id', 'p.customer_id')
        .select(['p.customer_id', 'cu.status'])
        .where('p.id', '=', projectId)
        .executeTakeFirstOrThrow()
      const contactId =
        project.status === 'merged' ? null : await contactOf(tx, project.customer_id, 'email', input.from)
      if (!contactId) return needs('sender_not_on_project', projectId)
      return { state: 'matched', rule: ref.rule, projectId, customerId: project.customer_id, contactId }
    }
  }

  // A verified contact: the exact value its last verification proved, on a customer that is not merged.
  const verified = await tx
    .selectFrom('crm.contacts as c')
    .innerJoin('crm.customers as cu', 'cu.id', 'c.customer_id')
    .select(['c.id', 'c.customer_id'])
    .where('cu.status', '<>', 'merged')
    .where((eb) =>
      input.channel === 'email'
        ? eb.and([eb('c.email_verification', '=', 'verified'), eb('c.email_verified_value', '=', input.from)])
        : eb.and([eb('c.phone_verification', '=', 'verified'), eb('c.phone_verified_value', '=', input.from)]),
    )
    .orderBy('c.created_at')
    .orderBy('c.id')
    .execute()
  const customers = [...new Set(verified.map((v) => v.customer_id))]
  if (customers.length === 0) return needs('no_match')
  if (customers.length > 1) return needs('shared_contact')
  const customerId = customers[0] as string
  const contactId = (verified[0] as { id: string }).id
  // The open projects staff see under this customer now (TSK-0046): its own, those of records merged into it and
  // those relinked to it, never one relinked away. Only a project created for this customer is matched on its own
  // (links never move a project); one that only reaches it through a link waits for staff with that suggestion.
  const seen = await projectsUnder(tx, customerId)
  const open = seen.length
    ? await tx
        .selectFrom('crm.projects')
        .select(['id', 'customer_id'])
        .where('id', 'in', seen)
        .where('state', 'not in', [...CLOSED_PROJECT_STATES])
        .execute()
    : []
  if (open.length === 0) return needs('no_open_project')
  const rule: MatchRule = input.channel === 'email' ? 'verified_email' : 'verified_phone'
  if (open.length === 1) {
    const only = open[0] as { id: string; customer_id: string }
    if (only.customer_id !== customerId) return needs('sender_not_on_project', only.id)
    return { state: 'matched', rule, projectId: only.id, customerId, contactId }
  }
  const own = open.filter((o) => o.customer_id === customerId)
  if (input.channel === 'sms' && own.length) {
    const latest = await tx
      .selectFrom('comms.messages as m')
      .innerJoin('comms.conversations as cv', 'cv.id', 'm.conversation_id')
      .select('cv.project_id')
      .where('m.direction', '=', 'outbound')
      .where('m.channel', '=', 'sms')
      .where(sql<boolean>`${input.from} = ANY(m.to_addresses)`)
      .where('cv.audience', '=', 'customer')
      .where('cv.state', '=', 'open')
      .where(
        'cv.project_id',
        'in',
        own.map((o) => o.id),
      )
      .orderBy('m.received_at', 'desc')
      .orderBy('m.seq', 'desc')
      .limit(1)
      .executeTakeFirst()
    if (latest)
      return { state: 'matched', rule: 'latest_conversation', projectId: latest.project_id, customerId, contactId }
  }
  return needs('several_projects')
}
