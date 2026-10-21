// Candidate matches (TSK-0044; HH-ID-02, HH-ID-01, HH-CRM-04, T21, OWN-DEC-117). A customer whose email, phone or
// service address is the same as another customer's is a candidate match: a suggestion for staff review, labelled as
// one, never a link and never proof of identity.
// - Matching is conservative (@handyhub/domain normalizeEmail, normalizePhone, addressKey): the exact mailbox, the
//   exact number, the same street, unit and ZIP. A shared email domain matches nothing. A matching name only supports
//   a suggestion made by one of the three (PROPOSED: names alone are too common to suggest anything).
// - Nothing here merges, links, moves or grants anything: both customers keep their own contacts, properties,
//   projects, requests and access. The merge is a separate, human-reviewed action with its preview (HH-CRM-04,
//   TSK-0046); a shared household or organization address never lets one person act for another.
// - One suggestion per pair of customers. A dismissed pair stays dismissed until the two share something new; then it
//   reopens for review. Every step is kept (crm.candidate_match_events).
// - Open suggestions are an item in the staff action queue (customer.view_duplicates), opening the customer record.
// The detection runs from committed events (a submitted request, a changed contact), so it never delays or changes
// what the customer sees, and the customer is never told about another customer.
import type { Tx } from '@handyhub/db'
import {
  addressKey,
  nameKey,
  normalizeEmail,
  normalizePhone,
  sortReasons,
  suggests,
  type MatchReason,
} from '@handyhub/domain'
import { sql } from 'kysely'
import type { Automation } from '../../platform/automation.js'
import { outbox } from '../../platform/outbox.js'
import { openQueueItem, resolveQueueItem } from '../queue/index.js'

export const CONTACT_CHANGED = 'customer.contact_changed'
export const CANDIDATE_ITEM = 'candidate_match'

type Signals = {
  emails: Set<string>
  phones: Set<string>
  addresses: Set<string>
  names: Set<string>
  zips: Set<string>
}

async function signalsOf(tx: Tx, customerIds: readonly string[]): Promise<Map<string, Signals>> {
  const out = new Map<string, Signals>()
  const of = (id: string) => {
    let s = out.get(id)
    if (!s) {
      s = { emails: new Set(), phones: new Set(), addresses: new Set(), names: new Set(), zips: new Set() }
      out.set(id, s)
    }
    return s
  }
  if (customerIds.length === 0) return out
  const customers = await tx
    .selectFrom('crm.customers')
    .select(['id', 'display_name'])
    .where('id', 'in', [...customerIds])
    .execute()
  for (const c of customers) of(c.id).names.add(nameKey(c.display_name))
  const contacts = await tx
    .selectFrom('crm.contacts')
    .select(['customer_id', 'email', 'phone_e164', 'full_name'])
    .where('customer_id', 'in', [...customerIds])
    .execute()
  for (const c of contacts) {
    const s = of(c.customer_id)
    const email = normalizeEmail(c.email)
    const phone = normalizePhone(c.phone_e164)
    if (email) s.emails.add(email)
    if (phone) s.phones.add(phone)
    s.names.add(nameKey(c.full_name))
  }
  const properties = await tx
    .selectFrom('crm.customer_properties as cp')
    .innerJoin('crm.properties as p', 'p.id', 'cp.property_id')
    .select(['cp.customer_id', 'p.street', 'p.unit', 'p.zip'])
    .where('cp.customer_id', 'in', [...customerIds])
    .execute()
  for (const p of properties) {
    const s = of(p.customer_id)
    s.addresses.add(addressKey(p))
    s.zips.add(p.zip.slice(0, 5))
  }
  return out
}

const overlaps = (a: Set<string>, b: Set<string>) => [...a].some((x) => b.has(x))

/** The other customers that share an email, phone or address with `customerId`, with what they share. */
export async function findCandidates(tx: Tx, customerId: string): Promise<Map<string, MatchReason[]>> {
  // A merged record is represented by its survivor (TSK-0046, HH-CRM-04): it makes no suggestions of its own.
  const self = await tx.selectFrom('crm.customers').select('status').where('id', '=', customerId).executeTakeFirst()
  if (!self || self.status === 'merged') return new Map()
  const own = (await signalsOf(tx, [customerId])).get(customerId)
  if (!own) return new Map()
  const ids = new Set<string>()
  const add = (rows: { customer_id: string }[]) =>
    rows.forEach((r) => r.customer_id !== customerId && ids.add(r.customer_id))
  if (own.emails.size)
    add(
      await tx
        .selectFrom('crm.contacts')
        .select('customer_id')
        .where('email_normalized', 'in', [...own.emails])
        .execute(),
    )
  if (own.phones.size)
    add(
      await tx
        .selectFrom('crm.contacts')
        .select('customer_id')
        .where('phone_e164', 'in', [...own.phones])
        .execute(),
    )
  if (own.zips.size)
    add(
      await tx
        .selectFrom('crm.customer_properties as cp')
        .innerJoin('crm.properties as p', 'p.id', 'cp.property_id')
        .select('cp.customer_id')
        .where(sql<string>`left(p.zip, 5)`, 'in', [...own.zips])
        .execute(),
    )
  if (ids.size === 0) return new Map()
  // A customer merged into another is represented by its survivor (HH-CRM-04): it is not suggested again.
  const live = await tx
    .selectFrom('crm.customers')
    .select('id')
    .where('id', 'in', [...ids])
    .where('status', '<>', 'merged')
    .execute()
  const others = await signalsOf(
    tx,
    live.map((r) => r.id),
  )
  const out = new Map<string, MatchReason[]>()
  for (const [id, s] of others) {
    const reasons: MatchReason[] = []
    if (overlaps(own.emails, s.emails)) reasons.push('email')
    if (overlaps(own.phones, s.phones)) reasons.push('phone')
    if (overlaps(own.addresses, s.addresses)) reasons.push('address')
    if (!suggests(reasons)) continue
    if (overlaps(own.names, s.names)) reasons.push('name')
    out.set(id, sortReasons(reasons))
  }
  return out
}

export type DetectedBy = 'request_submission' | 'contact_change'

/**
 * Records the candidate matches of a customer: a new pair is opened for review; a known pair gains the newly shared
 * details (and reopens when it had been dismissed). Returns the suggestions that changed. Never links anything.
 */
export async function detectCandidates(
  tx: Tx,
  customerId: string,
  detectedBy: DetectedBy,
): Promise<{ matchId: string; event: 'detected' | 'reasons_added' | 'reopened' }[]> {
  const found = await findCandidates(tx, customerId)
  const changed: { matchId: string; event: 'detected' | 'reasons_added' | 'reopened' }[] = []
  const subjects = new Set<string>()
  // The newer customer of a pair is the one that resembles an existing customer, whichever event ran first.
  const created = found.size
    ? new Map(
        (
          await tx
            .selectFrom('crm.customers')
            .select(['id', 'created_at'])
            .where('id', 'in', [customerId, ...found.keys()])
            .execute()
        ).map((r) => [r.id, r.created_at.getTime()]),
      )
    : new Map<string, number>()
  const newer = (a: string, b: string) => {
    const ta = created.get(a) ?? 0
    const tb = created.get(b) ?? 0
    return ta > tb || (ta === tb && a > b) ? a : b
  }
  for (const [candidateId, reasons] of found) {
    const subject = newer(customerId, candidateId)
    const older = subject === customerId ? candidateId : customerId
    const inserted = await tx
      .insertInto('crm.candidate_matches')
      .values({ customer_id: subject, candidate_customer_id: older, reasons, detected_by: detectedBy })
      .onConflict((oc) => oc.columns(['pair_low', 'pair_high']).doNothing())
      .returning(['id', 'customer_id'])
      .executeTakeFirst()
    if (inserted) {
      await tx
        .insertInto('crm.candidate_match_events')
        .values({ match_id: inserted.id, event: 'detected', reasons })
        .execute()
      changed.push({ matchId: inserted.id, event: 'detected' })
      subjects.add(inserted.customer_id)
      continue
    }
    const existing = await tx
      .selectFrom('crm.candidate_matches')
      .select(['id', 'customer_id', 'reasons', 'status'])
      .where('pair_low', '=', sql<string>`least(${customerId}::uuid, ${candidateId}::uuid)`)
      .where('pair_high', '=', sql<string>`greatest(${customerId}::uuid, ${candidateId}::uuid)`)
      .forUpdate()
      .executeTakeFirstOrThrow()
    const known = new Set(existing.reasons)
    const added = reasons.filter((r) => !known.has(r))
    // Only newly shared details that could suggest a match on their own reopen a dismissed pair.
    if (added.length === 0) continue
    const reopen = existing.status === 'dismissed' && suggests(added)
    const all = sortReasons([...existing.reasons, ...added])
    await tx
      .updateTable('crm.candidate_matches')
      .set({
        reasons: all,
        ...(reopen ? { status: 'open' } : {}),
        updated_at: sql<Date>`now()`,
        version: sql<number>`version + 1`,
      })
      .where('id', '=', existing.id)
      .execute()
    const event = reopen ? 'reopened' : 'reasons_added'
    await tx.insertInto('crm.candidate_match_events').values({ match_id: existing.id, event, reasons: all }).execute()
    changed.push({ matchId: existing.id, event })
    subjects.add(existing.customer_id)
  }
  for (const subject of subjects) await syncCandidateItem(tx, subject)
  return changed
}

/**
 * The queue item of a customer's open suggestions: open while any suggestion made from this customer waits for
 * review, resolved when none does. The item names the customer's latest project for its reference only.
 */
export async function syncCandidateItem(tx: Tx, customerId: string): Promise<'open' | 'resolved'> {
  const open = await tx
    .selectFrom('crm.candidate_matches')
    .select(({ fn }) => fn.countAll<string>().as('n'))
    .where('customer_id', '=', customerId)
    .where('status', '=', 'open')
    .executeTakeFirstOrThrow()
  if (Number(open.n) === 0) {
    await resolveQueueItem(tx, { type: CANDIDATE_ITEM, subjectId: customerId, resolution: 'reviewed' })
    return 'resolved'
  }
  const project = await tx
    .selectFrom('crm.projects')
    .select(['id', 'reference', 'created_at'])
    .where('customer_id', '=', customerId)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst()
  const first = await tx
    .selectFrom('crm.candidate_matches')
    .select(({ fn }) => fn.min('updated_at').as('at'))
    .where('customer_id', '=', customerId)
    .where('status', '=', 'open')
    .executeTakeFirstOrThrow()
  await openQueueItem(tx, {
    type: CANDIDATE_ITEM,
    subjectId: customerId,
    reason: 'possible_duplicate',
    projectId: project?.id ?? null,
    reference: project?.reference ?? null,
    status: 'open',
    ...(first.at ? { openedAt: new Date(first.at as unknown as string) } : {}),
  })
  return 'open'
}

/**
 * A contact's email or phone changed (a staff edit, or the customer's verified Change Contact): the committed event
 * runs the duplicate check for its customer. Identifiers only; the customer is never told about another customer.
 */
export async function contactChanged(tx: Tx, contactId: string, requestId: string): Promise<void> {
  const c = await tx
    .selectFrom('crm.contacts')
    .select(['customer_id', 'version'])
    .where('id', '=', contactId)
    .executeTakeFirstOrThrow()
  await outbox.add(tx, {
    type: CONTACT_CHANGED,
    aggregate: { type: 'customer', id: c.customer_id, version: c.version },
    payload: { customerId: c.customer_id, contactId },
    idempotencyKey: `${CONTACT_CHANGED}:${contactId}:${c.version}`,
    requestId,
  })
}

/** The customer a committed event is about: the request's customer, or the customer whose contact changed. */
async function customerOf(tx: Tx, target: { type: string | null; id: string | null }): Promise<string | null> {
  if (!target.id) return null
  if (target.type === 'request') {
    const r = await tx
      .selectFrom('intake.requests')
      .select('customer_id')
      .where('id', '=', target.id)
      .executeTakeFirst()
    return r?.customer_id ?? null
  }
  if (target.type === 'customer') {
    const c = await tx.selectFrom('crm.customers').select('id').where('id', '=', target.id).executeTakeFirst()
    return c?.id ?? null
  }
  return null
}

/**
 * Candidate matches from committed events: a submitted request (its new customer) and a changed contact. Replays add
 * nothing: a pair is recorded once and only newly shared details change it.
 */
export function candidateMatchAutomation(): Automation {
  return {
    name: 'records.candidate_matches',
    trigger: { kind: 'event', eventTypes: ['request.submitted', CONTACT_CHANGED] },
    identity: 'system.records',
    inputs: {
      description: 'the request or customer of the event; the customers’ contacts and addresses as they are now',
      version: 1,
    },
    idempotency: 'one suggestion per pair of customers; a replay finds nothing new and changes nothing',
    effect: 'records candidate matches for staff review and opens their queue item; never links or merges records',
    retry: { maxAttempts: 5, baseDelayMs: 1_000, maxDelayMs: 60_000 },
    timeoutMs: 10_000,
    exceptionOwner: 'office',
    audit: { action: 'customer.candidates_detected' },
    handle: async ({ tx, job }) => {
      const customerId = await customerOf(tx, job.target)
      if (!customerId) return 'cancelled'
      await detectCandidates(
        tx,
        customerId,
        job.eventType === CONTACT_CHANGED ? 'contact_change' : 'request_submission',
      )
      return 'done'
    },
  }
}
