// Conversations, linking and the inbox's queue items (TSK-0049; HH-COM-01, HH-COM-07, HH-OPS-01, OWN-DEC-120).
// - One customer and one internal conversation per project, created on first use.
// - Linking a message (the automatic match or a staff correction) moves only its linking columns and appends a
//   comms.message_links row; the original message never changes.
// - Queue items: a message in Needs Linking opens one `inbox_needs_linking` item (seen only by holders of
//   message.view_unmatched), resolved once it is linked; a customer reply on a project opens or refreshes one
//   `customer_replied` item per conversation, resolved when staff mark the replies handled.
import type { Tx } from '@handyhub/db'
import { sql } from 'kysely'
import { outbox } from '../../platform/outbox.js'
import { currentContext } from '../../platform/request-context.js'
import { openQueueItem, resolveQueueItem } from '../queue/items.js'
import type { MatchRule, NeedsLinkingReason } from './matching.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type Audience = 'customer' | 'internal'

/** The project's conversation for `audience`, created on first use. */
export async function ensureConversation(tx: Tx, projectId: string, audience: Audience): Promise<string> {
  const project = await tx
    .selectFrom('crm.projects')
    .select('customer_id')
    .where('id', '=', projectId)
    .executeTakeFirstOrThrow()
  await tx
    .insertInto('comms.conversations')
    .values({ project_id: projectId, customer_id: project.customer_id, audience })
    .onConflict((oc) => oc.columns(['project_id', 'audience']).doNothing())
    .execute()
  const row = await tx
    .selectFrom('comms.conversations')
    .select('id')
    .where('project_id', '=', projectId)
    .where('audience', '=', audience)
    .executeTakeFirstOrThrow()
  return row.id
}

/** Moves a conversation's activity times forward (never back). */
export async function touchConversation(tx: Tx, conversationId: string, at: Date, inbound: boolean): Promise<void> {
  await tx
    .updateTable('comms.conversations')
    .set({
      last_message_at: sql<Date>`greatest(coalesce(last_message_at, ${at}), ${at})`,
      ...(inbound ? { last_inbound_at: sql<Date>`greatest(coalesce(last_inbound_at, ${at}), ${at})` } : {}),
    })
    .where('id', '=', conversationId)
    .execute()
}

type ProjectFacts = { id: string; reference: string; responsible: string | null }

async function projectFacts(tx: Tx, projectId: string): Promise<ProjectFacts> {
  const p = await tx
    .selectFrom('crm.projects')
    .select(['id', 'reference', 'responsible_staff_id'])
    .where('id', '=', projectId)
    .executeTakeFirstOrThrow()
  const responsible = p.responsible_staff_id && UUID.test(p.responsible_staff_id) ? p.responsible_staff_id : null
  return { id: p.id, reference: p.reference, responsible }
}

/** TSK-0120: the committed event of the first customer message since staff last handled the conversation. */
export const CONVERSATION_REPLIED_EVENT = 'conversation.customer_replied'

/**
 * Opens (or refreshes) the conversation's "customer replied" item. TSK-0120 (OWN-DEC-152 staff_customer_replied,
 * grouped): when the item is newly opened, the committed conversation.customer_replied event notifies the responsible
 * staff member once; further messages while it stays open refresh the item and notify no one again.
 */
export async function customerReplied(tx: Tx, conversationId: string, projectId: string, at: Date): Promise<void> {
  const p = await projectFacts(tx, projectId)
  const item = await openQueueItem(tx, {
    type: 'customer_replied',
    subjectId: conversationId,
    reason: 'customer_replied',
    projectId: p.id,
    reference: p.reference,
    status: 'replied',
    assignedStaffId: p.responsible,
    openedAt: at,
  })
  if (item.created)
    await outbox.add(tx, {
      type: CONVERSATION_REPLIED_EVENT,
      aggregate: { type: 'conversation', id: conversationId },
      payload: { itemId: item.id, projectId: p.id, at: at.toISOString() },
      idempotencyKey: `${CONVERSATION_REPLIED_EVENT}:${item.id}`,
      requestId: currentContext()?.requestId ?? `conversation-replied:${item.id}`,
    })
}

export async function openNeedsLinking(tx: Tx, messageId: string, at: Date): Promise<void> {
  // No project, reference or sender on the item: what it is about is visible only on the Needs Linking screen.
  await openQueueItem(tx, {
    type: 'inbox_needs_linking',
    subjectId: messageId,
    reason: 'message_needs_linking',
    status: 'needs_linking',
    openedAt: at,
  })
}

export async function resolveNeedsLinking(tx: Tx, messageId: string): Promise<void> {
  await resolveQueueItem(tx, { type: 'inbox_needs_linking', subjectId: messageId, resolution: 'linked' })
}

export async function resolveCustomerReplied(tx: Tx, conversationId: string): Promise<boolean> {
  return resolveQueueItem(tx, { type: 'customer_replied', subjectId: conversationId, resolution: 'handled' })
}

export type LinkTarget =
  | {
      state: 'matched' | 'linked'
      rule: MatchRule | 'staff'
      projectId: string
      customerId: string
      contactId: string | null
    }
  | { state: 'needs_linking'; reason: NeedsLinkingReason | 'returned_by_staff'; suggestedProjectId: string | null }

/**
 * Writes a message's linking and its history row. `staff` and `reason` are a staff correction; without them, the
 * automatic match. Returns the conversation the message now belongs to, if any.
 */
export async function applyLink(
  tx: Tx,
  input: {
    messageId: string
    from: { state: string; projectId: string | null } | null
    to: LinkTarget
    staff?: { id: string; reason: string }
    nextVersion?: number
  },
): Promise<string | null> {
  const to = input.to
  const conversationId = to.state === 'needs_linking' ? null : await ensureConversation(tx, to.projectId, 'customer')
  if (input.from !== null) {
    await tx
      .updateTable('comms.messages')
      .set(
        to.state === 'needs_linking'
          ? {
              link_state: 'needs_linking',
              needs_linking_reason: to.reason,
              match_rule: null,
              project_id: null,
              customer_id: null,
              conversation_id: null,
              contact_id: null,
              suggested_project_id: to.suggestedProjectId,
              ...(input.nextVersion ? { link_version: input.nextVersion } : {}),
            }
          : {
              link_state: to.state,
              needs_linking_reason: null,
              match_rule: to.rule,
              project_id: to.projectId,
              customer_id: to.customerId,
              conversation_id: conversationId,
              contact_id: to.contactId,
              suggested_project_id: null,
              ...(input.nextVersion ? { link_version: input.nextVersion } : {}),
            },
      )
      .where('id', '=', input.messageId)
      .execute()
  }
  await tx
    .insertInto('comms.message_links')
    .values({
      message_id: input.messageId,
      from_state: input.from?.state ?? null,
      to_state: to.state,
      from_project_id: input.from?.projectId ?? null,
      to_project_id: to.state === 'needs_linking' ? null : to.projectId,
      rule: to.state === 'needs_linking' ? to.reason : to.rule,
      reason: input.staff?.reason ?? null,
      staff_id: input.staff?.id ?? null,
    })
    .execute()
  return conversationId
}
