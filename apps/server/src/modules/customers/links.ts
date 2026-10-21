// Human-reviewed merges and relinks with the Owner's reversal (TSK-0046; HH-CRM-04, HH-ID-02, HH-SEC-06, T21, T29,
// ENT-Customer, ENT-CustomerIdentityLink, ENT-ProjectAccessGrant, OWN-DEC-116, OWN-DEC-117, RULE-SERVER-AUTHZ).
// - A merge marks a duplicate customer merged into a survivor; a relink links one request (with its project) to
//   another customer. Both are links recorded in crm.record_links, never moves: no contact, property, project,
//   request, note, approval or financial record changes its customer or its ID (0041 guards it), so everything that
//   hangs off a project or a customer stays linked, and the Owner's reversal restores the earlier picture without
//   erasing anything recorded since.
// - Nothing is merged or linked automatically: a duplicate suggestion (HH-ID-02) only opens the preview. Every change
//   needs staff with the matrix permission, a written reason and the preview the person confirmed (its digest): a
//   preview that no longer matches the records is refused (PREVIEW_STALE), so what was confirmed is what happens.
// - Access is rechecked on every merge, relink and reversal (recheckAccess). Access never follows a link: a guest
//   link stays single-project and names a contact of the project's own customer, and no link adds a project to any
//   grant or session. A correction (a relink of a request that was linked elsewhere, or the Owner's reversal) also
//   revokes the guest links and sessions of the moved projects issued while the mistaken link stood, and the
//   account sessions that reach them (PROPOSED, see recheckAccess), so a mistaken link never exposes another
//   customer's history.
import { createHash } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import { sql } from 'kysely'

type Reader = Db | Tx
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A link-change refusal: the problem code the route answers with (CONFLICT, field `state`). */
export class LinkConflict extends Error {
  override name = 'LinkConflict'
  constructor(readonly code: LinkProblem) {
    super(code)
  }
}
export type LinkProblem =
  'CUSTOMER_MERGED' | 'SAME_CUSTOMER' | 'PREVIEW_STALE' | 'LINK_REVERSED' | 'LINK_NOT_CURRENT' | 'NOT_MERGED_THIS_WAY'

// ---------------------------------------------------------------------------------------------------------------
// Where staff see records now (crm.customer_root, crm.customer_group, crm.project_customer of 0041).

/** The survivor at the end of a customer's merges (itself when not merged); null for an unknown customer. */
export async function customerRoot(db: Reader, customerId: string): Promise<string | null> {
  if (!UUID.test(customerId)) return null
  const r = await sql<{ root: string | null }>`SELECT crm.customer_root(${customerId}::uuid) AS root`.execute(db)
  return r.rows[0]?.root ?? null
}

/** The customers of these survivors' groups: each survivor and every customer merged into it. */
export async function groupMembers(db: Reader, roots: readonly string[]): Promise<string[]> {
  const ids = roots.filter((r) => UUID.test(r))
  if (ids.length === 0) return []
  const r = await sql<{ id: string }>`
    SELECT DISTINCT g AS id FROM unnest(${ids}::uuid[]) AS r(id), LATERAL crm.customer_group(r.id) AS g`.execute(db)
  return r.rows.map((x) => x.id)
}

/**
 * Every project that the groups of these survivors reach (created for one of their customers, or linked to or from
 * one of them), with the customer staff see it under now.
 */
export async function projectRoots(db: Reader, roots: readonly string[]): Promise<Map<string, string>> {
  const members = await groupMembers(db, roots)
  if (members.length === 0) return new Map()
  const r = await sql<{ id: string; root: string }>`
    SELECT p.id, crm.project_customer(p.id) AS root FROM crm.projects p
     WHERE p.customer_id = ANY(${members}::uuid[])
        OR p.id IN (SELECT l.project_id FROM crm.record_links l
                     WHERE l.kind = 'request_relink'
                       AND (l.source_customer_id = ANY(${members}::uuid[]) OR l.target_customer_id = ANY(${members}::uuid[])))
  `.execute(db)
  return new Map(r.rows.map((x) => [x.id, x.root]))
}

/** The projects staff see under a customer that is not merged: its own, its merged records' and those linked to it. */
export async function projectsUnder(db: Reader, customerId: string): Promise<string[]> {
  const all = await projectRoots(db, [customerId])
  return [...all].filter(([, root]) => root === customerId).map(([id]) => id)
}

/** The customer staff see each project under now. */
export async function projectCustomers(db: Reader, projectIds: readonly string[]): Promise<Map<string, string>> {
  const ids = projectIds.filter((p) => UUID.test(p))
  if (ids.length === 0) return new Map()
  const r = await sql<{ id: string; root: string }>`
    SELECT p.id, crm.project_customer(p.id) AS root FROM crm.projects p WHERE p.id = ANY(${ids}::uuid[])`.execute(db)
  return new Map(r.rows.map((x) => [x.id, x.root]))
}

// ---------------------------------------------------------------------------------------------------------------
// Access recheck.

export type AccessRecheck = {
  /** Projects whose access was checked. */
  projects: number
  /** Projects whose customer changed with this step. */
  moved: string[]
  /** Live guest links checked, kept and revoked (IDs only). */
  grantsChecked: number
  grantsKept: number
  grantsRevoked: string[]
  /** Live customer sessions reaching the projects, and those revoked. */
  sessionsChecked: number
  sessionsRevoked: string[]
  /** Projects added to any guest link or session by this step: always 0 (access never follows a link). */
  projectsAdded: number
}

/**
 * Rechecks the access to the affected projects after a merge, relink or reversal (HH-CRM-04, T29), inside the
 * change's transaction. A guest link (ENT-ProjectAccessGrant) or customer session is kept only while:
 * - every project it reaches is one its contact's own customer was given (the project's customer as created; a link
 *   never makes another customer's contact entitled), and a guest-link session reaches only its link's project;
 * - for a correction (`correctionSince` set: the moment the corrected link was made), it was not issued or started
 *   since that moment for a moved project, and it is not an account session reaching a moved project. PROPOSED (no
 *   owner decision gives the detail): access that may have relied on the mistaken link is revoked; the rightful
 *   contact asks for a new link through the neutral recovery (HH-ID-09) and verifies again.
 * Revoked guest links are final (reason corrected_link) and end their sessions. Nothing is ever added to any grant.
 */
export async function recheckAccess(
  tx: Tx,
  input: {
    projectIds: readonly string[]
    moved: readonly string[]
    correctionSince: Date | null
    by: string
    now: Date
  },
): Promise<AccessRecheck> {
  const projects = [...new Set(input.projectIds.filter((p) => UUID.test(p)))]
  const affected = new Set(projects)
  const moved = new Set(input.moved)
  const since = input.correctionSince
  const out: AccessRecheck = {
    projects: projects.length,
    moved: [...moved].sort(),
    grantsChecked: 0,
    grantsKept: 0,
    grantsRevoked: [],
    sessionsChecked: 0,
    sessionsRevoked: [],
    projectsAdded: 0,
  }
  if (projects.length === 0) return out
  const { now } = input

  const grants = await tx
    .selectFrom('identity.project_access_grants as g')
    .innerJoin('crm.contacts as c', 'c.id', 'g.contact_id')
    .innerJoin('crm.projects as p', 'p.id', 'g.project_id')
    .select(['g.id', 'g.project_id', 'g.created_at', 'c.customer_id as contact_customer', 'p.customer_id as own'])
    .where('g.project_id', 'in', projects)
    .where('g.revoked_at', 'is', null)
    .where('g.expires_at', '>', now)
    .orderBy('g.id')
    .forUpdate()
    .execute()
  out.grantsChecked = grants.length
  const revokeGrants = grants
    .filter(
      (g) =>
        g.contact_customer !== g.own ||
        (since !== null && moved.has(g.project_id) && g.created_at.getTime() >= since.getTime()),
    )
    .map((g) => g.id)
  if (revokeGrants.length)
    await tx
      .updateTable('identity.project_access_grants')
      .set({ revoked_at: now, revoke_reason: 'corrected_link', revoked_by: input.by })
      .where('id', 'in', revokeGrants)
      .where('revoked_at', 'is', null)
      .execute()
  out.grantsRevoked = revokeGrants.sort()
  out.grantsKept = grants.length - revokeGrants.length

  const sessions = await tx
    .selectFrom('identity.customer_sessions')
    .select(['id', 'via', 'grant_id', 'contact_ref', 'project_ids', 'created_at'])
    .where('revoked_at', 'is', null)
    .where('expires_at', '>', now)
    .where(sql<boolean>`project_ids && ${projects}::text[]`)
    .orderBy('id')
    .forUpdate()
    .execute()
  out.sessionsChecked = sessions.length
  if (sessions.length) {
    const grantIds = [...new Set(sessions.flatMap((s) => (s.grant_id ? [s.grant_id] : [])))]
    const grantRows = grantIds.length
      ? await tx
          .selectFrom('identity.project_access_grants')
          .select(['id', 'project_id', 'revoked_at'])
          .where('id', 'in', grantIds)
          .execute()
      : []
    const grantOf = new Map(grantRows.map((g) => [g.id, g]))
    const contactIds = [...new Set(sessions.map((s) => s.contact_ref).filter((c) => UUID.test(c)))]
    const contactRows = contactIds.length
      ? await tx.selectFrom('crm.contacts').select(['id', 'customer_id']).where('id', 'in', contactIds).execute()
      : []
    const customerOfContact = new Map(contactRows.map((c) => [c.id, c.customer_id]))
    const ownRows = await tx
      .selectFrom('crm.projects')
      .select(['id', 'customer_id'])
      .where('id', 'in', projects)
      .execute()
    const ownerOf = new Map(ownRows.map((p) => [p.id, p.customer_id]))
    const revoked = new Set(revokeGrants)
    const revokeSessions: string[] = []
    for (const s of sessions) {
      const touched = s.project_ids.filter((p) => affected.has(p))
      const grant = s.grant_id ? grantOf.get(s.grant_id) : undefined
      const contactCustomer = customerOfContact.get(s.contact_ref)
      const bad =
        (s.grant_id !== null &&
          (!grant ||
            grant.revoked_at !== null ||
            revoked.has(grant.id) ||
            s.project_ids.some((p) => p !== grant.project_id))) ||
        touched.some((p) => contactCustomer === undefined || ownerOf.get(p) !== contactCustomer) ||
        (since !== null &&
          touched.some((p) => moved.has(p)) &&
          (s.created_at.getTime() >= since.getTime() || s.via === 'account'))
      if (bad) revokeSessions.push(s.id)
    }
    if (revokeSessions.length)
      await tx
        .updateTable('identity.customer_sessions')
        .set({ revoked_at: now, revoke_reason: 'corrected_link' })
        .where('id', 'in', revokeSessions)
        .where('revoked_at', 'is', null)
        .execute()
    out.sessionsRevoked = revokeSessions.sort()
  }
  // Sessions started from a revoked guest link end with it, wherever they reach (TSK-0034).
  if (revokeGrants.length) {
    const ended = await tx
      .updateTable('identity.customer_sessions')
      .set({ revoked_at: now, revoke_reason: 'corrected_link' })
      .where('grant_id', 'in', revokeGrants)
      .where('revoked_at', 'is', null)
      .returning('id')
      .execute()
    out.sessionsRevoked = [...new Set([...out.sessionsRevoked, ...ended.map((e) => e.id)])].sort()
  }
  return out
}

/** The recheck as an audit summary value (IDs and counts only; never a token or a contact detail). */
export const recheckSummary = (r: AccessRecheck) => ({
  projects: r.projects,
  moved: r.moved,
  grantsChecked: r.grantsChecked,
  grantsKept: r.grantsKept,
  grantsRevoked: r.grantsRevoked,
  sessionsChecked: r.sessionsChecked,
  sessionsRevoked: r.sessionsRevoked,
  projectsAdded: r.projectsAdded,
})

// ---------------------------------------------------------------------------------------------------------------
// Previews (HH-CRM-04: both records and the affected projects, documents and payments, before confirming).

export type RecordSummary = {
  id: string
  displayName: string
  status: string
  version: number
  createdAt: string
  contacts: {
    id: string
    customerId: string
    fullName: string
    email: string
    phone: string
    verification: { email: string; phone: string }
  }[]
  properties: {
    id: string
    customerId: string
    street: string
    unit: string | null
    city: string
    state: string
    zip: string
  }[]
  projects: {
    id: string
    reference: string
    state: string
    customerId: string
    requests: { id: string; reference: string; state: string; submittedAt: string }[]
  }[]
  /** Live guest links and customer sessions of the projects (counts; access is rechecked, never widened). */
  access: { liveGrants: number; liveSessions: number }
}

/** A customer and what staff see with it now (its merged records' contacts and properties, its projects). */
export async function recordSummary(db: Reader, customerId: string, now: Date = new Date()): Promise<RecordSummary> {
  const c = await db
    .selectFrom('crm.customers')
    .select(['id', 'display_name', 'status', 'version', 'created_at'])
    .where('id', '=', customerId)
    .executeTakeFirstOrThrow()
  const members = c.status === 'merged' ? [c.id] : await groupMembers(db, [c.id])
  const contacts = await db
    .selectFrom('crm.contacts')
    .select(['id', 'customer_id', 'full_name', 'email', 'phone_e164', 'email_verification', 'phone_verification'])
    .where('customer_id', 'in', members)
    .orderBy('created_at')
    .orderBy('id')
    .execute()
  const properties = await db
    .selectFrom('crm.customer_properties as cp')
    .innerJoin('crm.properties as p', 'p.id', 'cp.property_id')
    .select(['p.id', 'cp.customer_id', 'p.street', 'p.unit', 'p.city', 'p.state', 'p.zip'])
    .where('cp.customer_id', 'in', members)
    .orderBy('cp.created_at')
    .orderBy('p.id')
    .execute()
  const projectIds =
    c.status === 'merged'
      ? (await db.selectFrom('crm.projects').select('id').where('customer_id', '=', c.id).execute()).map((p) => p.id)
      : await projectsUnder(db, c.id)
  const projects = projectIds.length
    ? await db
        .selectFrom('crm.projects')
        .select(['id', 'reference', 'state', 'customer_id', 'created_at'])
        .where('id', 'in', projectIds)
        .orderBy('created_at', 'desc')
        .orderBy('id')
        .execute()
    : []
  const requests = projectIds.length
    ? await db
        .selectFrom('intake.requests')
        .select(['id', 'reference', 'state', 'project_id', 'submitted_at'])
        .where('project_id', 'in', projectIds)
        .orderBy('submitted_at', 'desc')
        .execute()
    : []
  const liveGrants = projectIds.length
    ? await db
        .selectFrom('identity.project_access_grants')
        .select(({ fn }) => fn.countAll<string>().as('n'))
        .where('project_id', 'in', projectIds)
        .where('revoked_at', 'is', null)
        .where('expires_at', '>', now)
        .executeTakeFirstOrThrow()
    : { n: '0' }
  const liveSessions = projectIds.length
    ? await db
        .selectFrom('identity.customer_sessions')
        .select(({ fn }) => fn.countAll<string>().as('n'))
        .where('revoked_at', 'is', null)
        .where('expires_at', '>', now)
        .where(sql<boolean>`project_ids && ${projectIds}::text[]`)
        .executeTakeFirstOrThrow()
    : { n: '0' }
  return {
    id: c.id,
    displayName: c.display_name,
    status: c.status,
    version: c.version,
    createdAt: c.created_at.toISOString(),
    contacts: contacts.map((x) => ({
      id: x.id,
      customerId: x.customer_id,
      fullName: x.full_name,
      email: x.email,
      phone: x.phone_e164,
      verification: { email: x.email_verification, phone: x.phone_verification },
    })),
    properties: properties.map((p) => ({
      id: p.id,
      customerId: p.customer_id,
      street: p.street,
      unit: p.unit,
      city: p.city,
      state: p.state,
      zip: p.zip,
    })),
    projects: projects.map((p) => ({
      id: p.id,
      reference: p.reference,
      state: p.state,
      customerId: p.customer_id,
      requests: requests
        .filter((r) => r.project_id === p.id)
        .map((r) => ({ id: r.id, reference: r.reference, state: r.state, submittedAt: r.submitted_at.toISOString() })),
    })),
    access: { liveGrants: Number(liveGrants.n), liveSessions: Number(liveSessions.n) },
  }
}

const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort()
const shape = (s: RecordSummary) => ({
  id: s.id,
  version: s.version,
  status: s.status,
  contacts: ids(s.contacts),
  properties: ids(s.properties),
  projects: ids(s.projects),
  requests: s.projects.flatMap((p) => p.requests.map((r) => r.id)).sort(),
})
const digestOf = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

/** The open or reviewed suggestion between two customers, when there is one. */
async function pairSuggestion(db: Reader, a: string, b: string) {
  return db
    .selectFrom('crm.candidate_matches')
    .select(['id', 'customer_id', 'status', 'reasons', 'version'])
    .where('pair_low', '=', sql<string>`least(${a}::uuid, ${b}::uuid)`)
    .where('pair_high', '=', sql<string>`greatest(${a}::uuid, ${b}::uuid)`)
    .executeTakeFirst()
}

export type MergePreview = {
  source: RecordSummary
  survivor: RecordSummary
  suggestion: { id: string; status: string; reasons: string[] } | null
  documents: { state: 'not_available' }
  payments: { state: 'not_available' }
  /** Why the merge cannot be confirmed now (a merged record, the same customer); null when it can. */
  blocked: LinkProblem | null
  previewDigest: string
}

/** The merge preview of `sourceId` into `survivorId` (both exist; the caller checked the scope). */
export async function mergePreview(db: Reader, sourceId: string, survivorId: string): Promise<MergePreview> {
  const now = new Date()
  const source = await recordSummary(db, sourceId, now)
  const survivor = await recordSummary(db, survivorId, now)
  const s = await pairSuggestion(db, sourceId, survivorId)
  const blocked: LinkProblem | null =
    sourceId === survivorId
      ? 'SAME_CUSTOMER'
      : source.status === 'merged' || survivor.status === 'merged'
        ? 'CUSTOMER_MERGED'
        : null
  return {
    source,
    survivor,
    suggestion: s ? { id: s.id, status: s.status, reasons: s.reasons } : null,
    documents: { state: 'not_available' },
    payments: { state: 'not_available' },
    blocked,
    previewDigest: digestOf({ kind: 'merge', source: shape(source), survivor: shape(survivor) }),
  }
}

/** The request's current relink (its latest one not reversed), when it has one. */
async function currentRelink(db: Reader, requestId: string) {
  return db
    .selectFrom('crm.record_links')
    .select(['id', 'seq', 'source_customer_id', 'target_customer_id', 'performed_at'])
    .where('kind', '=', 'request_relink')
    .where('request_id', '=', requestId)
    .where('reversed_at', 'is', null)
    .orderBy('seq', 'desc')
    .limit(1)
    .executeTakeFirst()
}

export type RelinkPreview = {
  request: { id: string; reference: string; state: string }
  project: { id: string; reference: string; state: string }
  /** The customer the request was sent under (kept for good). */
  original: { id: string; displayName: string }
  from: RecordSummary
  to: RecordSummary
  /** The request is linked elsewhere now: this relink corrects that link. */
  correction: boolean
  /** A correction revokes the project's guest links and sessions issued since the corrected link (counts). */
  revokes: { grants: number; sessions: number }
  documents: { state: 'not_available' }
  payments: { state: 'not_available' }
  blocked: LinkProblem | null
  previewDigest: string
}

/** The relink preview of a request to `targetId` (both exist; the caller checked the scope). */
export async function relinkPreview(db: Reader, requestId: string, targetId: string): Promise<RelinkPreview> {
  const now = new Date()
  const r = await db
    .selectFrom('intake.requests as r')
    .innerJoin('crm.projects as p', 'p.id', 'r.project_id')
    .innerJoin('crm.customers as cu', 'cu.id', 'r.customer_id')
    .select([
      'r.id',
      'r.reference',
      'r.state',
      'p.id as project_id',
      'p.reference as project_reference',
      'p.state as project_state',
      'cu.id as original_id',
      'cu.display_name as original_name',
    ])
    .where('r.id', '=', requestId)
    .executeTakeFirstOrThrow()
  const fromId = (await projectCustomers(db, [r.project_id])).get(r.project_id) as string
  const from = await recordSummary(db, fromId, now)
  const to = await recordSummary(db, targetId, now)
  const link = await currentRelink(db, r.id)
  let revokes = { grants: 0, sessions: 0 }
  if (link) {
    const g = await db
      .selectFrom('identity.project_access_grants')
      .select(({ fn }) => fn.countAll<string>().as('n'))
      .where('project_id', '=', r.project_id)
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', now)
      .where('created_at', '>=', link.performed_at)
      .executeTakeFirstOrThrow()
    const s = await db
      .selectFrom('identity.customer_sessions')
      .select(({ fn }) => fn.countAll<string>().as('n'))
      .where('revoked_at', 'is', null)
      .where('expires_at', '>', now)
      .where(sql<boolean>`${r.project_id}::text = ANY(project_ids)`)
      .where((eb) => eb.or([eb('created_at', '>=', link.performed_at), eb('via', '=', 'account')]))
      .executeTakeFirstOrThrow()
    revokes = { grants: Number(g.n), sessions: Number(s.n) }
  }
  const blocked: LinkProblem | null =
    to.status === 'merged' ? 'CUSTOMER_MERGED' : to.id === fromId ? 'SAME_CUSTOMER' : null
  return {
    request: { id: r.id, reference: r.reference, state: r.state },
    project: { id: r.project_id, reference: r.project_reference, state: r.project_state },
    original: { id: r.original_id, displayName: r.original_name },
    from,
    to,
    correction: link !== undefined,
    revokes,
    documents: { state: 'not_available' },
    payments: { state: 'not_available' },
    blocked,
    previewDigest: digestOf({
      kind: 'request_relink',
      request: r.id,
      project: r.project_id,
      link: link?.id ?? null,
      from: shape(from),
      to: shape(to),
    }),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The changes. Each runs in the route's transaction, under row locks, and returns what the audit event records.

const lockCustomers = async (tx: Tx, customerIds: string[]) => {
  // A fixed order, so two changes on the same pair never wait on each other.
  const rows = await tx
    .selectFrom('crm.customers')
    .select(['id', 'status', 'merged_into_id', 'version'])
    .where('id', 'in', customerIds)
    .orderBy('id')
    .forUpdate()
    .execute()
  return new Map(rows.map((r) => [r.id, r]))
}

const diffMoved = (before: Map<string, string>, after: Map<string, string>) =>
  [...new Set([...before.keys(), ...after.keys()])].filter((p) => before.get(p) !== after.get(p))

export type LinkResult = { linkId: string; recheck: AccessRecheck; candidateId: string | null }

export async function mergeCustomers(
  tx: Tx,
  input: { sourceId: string; survivorId: string; reason: string; previewDigest: string; staffId: string; now?: Date },
): Promise<LinkResult> {
  const now = input.now ?? new Date()
  if (input.sourceId === input.survivorId) throw new LinkConflict('SAME_CUSTOMER')
  const locked = await lockCustomers(tx, [input.sourceId, input.survivorId])
  const source = locked.get(input.sourceId)
  const survivor = locked.get(input.survivorId)
  if (!source || !survivor) throw new Error('mergeCustomers: both customers exist')
  if (source.status === 'merged' || survivor.status === 'merged') throw new LinkConflict('CUSTOMER_MERGED')
  const preview = await mergePreview(tx, input.sourceId, input.survivorId)
  if (preview.previewDigest !== input.previewDigest) throw new LinkConflict('PREVIEW_STALE')
  const before = await projectRoots(tx, [source.id, survivor.id])
  await tx
    .updateTable('crm.customers')
    .set({ status: 'merged', merged_into_id: survivor.id, version: source.version + 1 })
    .where('id', '=', source.id)
    .execute()
  const after = await projectRoots(tx, [survivor.id])
  const moved = diffMoved(before, after)
  const by = `staff:${input.staffId}`
  const recheck = await recheckAccess(tx, {
    projectIds: [...new Set([...before.keys(), ...after.keys()])],
    moved,
    correctionSince: null,
    by,
    now,
  })
  // The suggestion the two had is kept, marked merged (HH-ID-02: it was reviewed by a person).
  const suggestion = await pairSuggestion(tx, source.id, survivor.id)
  if (suggestion && suggestion.status !== 'merged') {
    await tx
      .updateTable('crm.candidate_matches')
      .set({ status: 'merged', version: suggestion.version + 1, updated_at: now })
      .where('id', '=', suggestion.id)
      .execute()
    await tx
      .insertInto('crm.candidate_match_events')
      .values({
        match_id: suggestion.id,
        event: 'merged',
        reasons: suggestion.reasons,
        reason: input.reason,
        staff_id: input.staffId,
      })
      .execute()
  }
  const link = await tx
    .insertInto('crm.record_links')
    .values({
      kind: 'merge',
      source_customer_id: source.id,
      target_customer_id: survivor.id,
      source_status: source.status,
      candidate_match_id: suggestion?.id ?? null,
      reason: input.reason,
      preview: JSON.stringify({
        digest: preview.previewDigest,
        source: shape(preview.source),
        survivor: shape(preview.survivor),
      }),
      correction: false,
      access_recheck: JSON.stringify(recheckSummary(recheck)),
      performed_by: input.staffId,
      performed_at: now,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return { linkId: link.id, recheck, candidateId: suggestion?.id ?? null }
}

export async function relinkRequest(
  tx: Tx,
  input: { requestId: string; targetId: string; reason: string; previewDigest: string; staffId: string; now?: Date },
): Promise<LinkResult & { fromId: string; correction: boolean; projectId: string }> {
  const now = input.now ?? new Date()
  const r = await tx
    .selectFrom('intake.requests')
    .select(['id', 'project_id'])
    .where('id', '=', input.requestId)
    .executeTakeFirstOrThrow()
  // The project's row lock serializes every link change of this request.
  await tx.selectFrom('crm.projects').select('id').where('id', '=', r.project_id).forUpdate().executeTakeFirstOrThrow()
  const fromId = (await projectCustomers(tx, [r.project_id])).get(r.project_id) as string
  const locked = await lockCustomers(tx, [...new Set([fromId, input.targetId])])
  const target = locked.get(input.targetId)
  if (!target) throw new Error('relinkRequest: the target customer exists')
  if (target.status === 'merged') throw new LinkConflict('CUSTOMER_MERGED')
  if (target.id === fromId) throw new LinkConflict('SAME_CUSTOMER')
  const preview = await relinkPreview(tx, r.id, target.id)
  if (preview.previewDigest !== input.previewDigest) throw new LinkConflict('PREVIEW_STALE')
  const current = await currentRelink(tx, r.id)
  // A relink changes the customer of this one project only; every other project keeps where it is seen.
  const before = await projectRoots(tx, [fromId, target.id])
  const recheck = await recheckAccess(tx, {
    projectIds: [...new Set([...before.keys(), r.project_id])],
    moved: [r.project_id],
    correctionSince: current?.performed_at ?? null,
    by: `staff:${input.staffId}`,
    now,
  })
  const link = await tx
    .insertInto('crm.record_links')
    .values({
      kind: 'request_relink',
      source_customer_id: fromId,
      target_customer_id: target.id,
      request_id: r.id,
      project_id: r.project_id,
      reason: input.reason,
      preview: JSON.stringify({
        digest: preview.previewDigest,
        corrects: current?.id ?? null,
        from: shape(preview.from),
        to: shape(preview.to),
      }),
      correction: current !== undefined,
      access_recheck: JSON.stringify(recheckSummary(recheck)),
      performed_by: input.staffId,
      performed_at: now,
    })
    .returning('id')
    .executeTakeFirstOrThrow()
  return {
    linkId: link.id,
    recheck,
    candidateId: null,
    fromId,
    correction: current !== undefined,
    projectId: r.project_id,
  }
}

export type ReversalResult = {
  linkId: string
  kind: 'merge' | 'request_relink'
  sourceCustomerId: string
  targetCustomerId: string
  requestId: string | null
  candidateId: string | null
  recheck: AccessRecheck
}

/**
 * The Owner's reversal of a merge or relink (customer.reverse_link_change). It restores the earlier picture and keeps
 * everything recorded since (notes, edits, messages, later links stay where they were made): a merged record becomes
 * its own record again with its earlier status; a request goes back to the customer it was linked to before. Only a
 * request's current relink is reversed (a later one is reversed first). A reversal corrects a mistaken link: the
 * access recheck revokes what was issued while it stood.
 */
export async function reverseLink(
  tx: Tx,
  input: { linkId: string; reason: string; staffId: string; now?: Date },
): Promise<ReversalResult> {
  const now = input.now ?? new Date()
  const link = await tx
    .selectFrom('crm.record_links')
    .select([
      'id',
      'seq',
      'kind',
      'source_customer_id',
      'target_customer_id',
      'source_status',
      'request_id',
      'project_id',
      'candidate_match_id',
      'performed_at',
      'reversed_at',
    ])
    .where('id', '=', input.linkId)
    .forUpdate()
    .executeTakeFirstOrThrow()
  if (link.reversed_at !== null) throw new LinkConflict('LINK_REVERSED')
  const by = `staff:${input.staffId}`
  let recheck: AccessRecheck
  let candidateId: string | null = null
  if (link.kind === 'merge') {
    const locked = await lockCustomers(tx, [link.source_customer_id, link.target_customer_id])
    const source = locked.get(link.source_customer_id)
    if (!source || source.merged_into_id !== link.target_customer_id) throw new LinkConflict('NOT_MERGED_THIS_WAY')
    const root = (await customerRoot(tx, link.target_customer_id)) as string
    const before = await projectRoots(tx, [root])
    await tx
      .updateTable('crm.customers')
      .set({ status: link.source_status ?? 'active', merged_into_id: null, version: source.version + 1 })
      .where('id', '=', source.id)
      .execute()
    const after = await projectRoots(tx, [root, source.id])
    recheck = await recheckAccess(tx, {
      projectIds: [...new Set([...before.keys(), ...after.keys()])],
      moved: diffMoved(before, after),
      correctionSince: link.performed_at,
      by,
      now,
    })
    // The two were not the same customer after all: their suggestion is closed as reviewed, with the reason.
    const suggestion = await pairSuggestion(tx, link.source_customer_id, link.target_customer_id)
    if (suggestion && suggestion.status === 'merged') {
      await tx
        .updateTable('crm.candidate_matches')
        .set({ status: 'dismissed', version: suggestion.version + 1, updated_at: now })
        .where('id', '=', suggestion.id)
        .execute()
      await tx
        .insertInto('crm.candidate_match_events')
        .values({
          match_id: suggestion.id,
          event: 'merge_reversed',
          reasons: suggestion.reasons,
          reason: input.reason,
          staff_id: input.staffId,
        })
        .execute()
      candidateId = suggestion.id
    }
  } else {
    const requestId = link.request_id as string
    const projectId = link.project_id as string
    await tx.selectFrom('crm.projects').select('id').where('id', '=', projectId).forUpdate().executeTakeFirstOrThrow()
    const current = await currentRelink(tx, requestId)
    if (!current || current.id !== link.id) throw new LinkConflict('LINK_NOT_CURRENT')
    const fromRoot = (await projectCustomers(tx, [projectId])).get(projectId) as string
    const before = await projectRoots(tx, [fromRoot])
    recheck = await recheckAccess(tx, {
      projectIds: [...new Set([...before.keys(), projectId])],
      moved: [projectId],
      correctionSince: link.performed_at,
      by,
      now,
    })
  }
  await tx
    .updateTable('crm.record_links')
    .set({
      reversed_at: now,
      reversed_by: input.staffId,
      reverse_reason: input.reason,
      reversal_recheck: JSON.stringify(recheckSummary(recheck)),
    })
    .where('id', '=', link.id)
    .execute()
  return {
    linkId: link.id,
    kind: link.kind as 'merge' | 'request_relink',
    sourceCustomerId: link.source_customer_id,
    targetCustomerId: link.target_customer_id,
    requestId: link.request_id,
    candidateId,
    recheck,
  }
}

export type LinkView = {
  id: string
  kind: string
  /** current: in effect; reversed: the Owner reversed it; replaced: a later relink of the request took its place. */
  state: 'current' | 'reversed' | 'replaced'
  from: { id: string; displayName: string }
  to: { id: string; displayName: string }
  requestReference: string | null
  reason: string
  by: { id: string; name: string | null }
  at: string
  correction: boolean
  access: { grantsRevoked: number; sessionsRevoked: number; projectsAdded: number }
  reversal: {
    by: { id: string; name: string | null }
    at: string
    reason: string
    access: { grantsRevoked: number; sessionsRevoked: number; projectsAdded: number }
  } | null
}

const accessOf = (j: unknown) => {
  const o = (j ?? {}) as { grantsRevoked?: unknown[]; sessionsRevoked?: unknown[]; projectsAdded?: number }
  return {
    grantsRevoked: Array.isArray(o.grantsRevoked) ? o.grantsRevoked.length : 0,
    sessionsRevoked: Array.isArray(o.sessionsRevoked) ? o.sessionsRevoked.length : 0,
    projectsAdded: typeof o.projectsAdded === 'number' ? o.projectsAdded : 0,
  }
}

/** The link changes that involve these customers or projects, newest first. */
export async function linkHistory(
  db: Reader,
  customerIds: readonly string[],
  projectIds: readonly string[],
): Promise<LinkView[]> {
  if (customerIds.length === 0 && projectIds.length === 0) return []
  const rows = await db
    .selectFrom('crm.record_links as l')
    .leftJoin('intake.requests as r', 'r.id', 'l.request_id')
    .select([
      'l.id',
      'l.seq',
      'l.kind',
      'l.source_customer_id',
      'l.target_customer_id',
      'l.request_id',
      'l.reason',
      'l.performed_by',
      'l.performed_at',
      'l.correction',
      'l.access_recheck',
      'l.reversed_at',
      'l.reversed_by',
      'l.reverse_reason',
      'l.reversal_recheck',
      'r.reference as request_reference',
    ])
    .where((eb) =>
      eb.or([
        ...(customerIds.length
          ? [eb('l.source_customer_id', 'in', [...customerIds]), eb('l.target_customer_id', 'in', [...customerIds])]
          : []),
        ...(projectIds.length ? [eb('l.project_id', 'in', [...projectIds])] : []),
      ]),
    )
    .orderBy('l.seq', 'desc')
    .execute()
  if (rows.length === 0) return []
  const customerIdsAll = [...new Set(rows.flatMap((r) => [r.source_customer_id, r.target_customer_id]))]
  const names = new Map(
    (
      await db.selectFrom('crm.customers').select(['id', 'display_name']).where('id', 'in', customerIdsAll).execute()
    ).map((c) => [c.id, c.display_name]),
  )
  const staffIds = [...new Set(rows.flatMap((r) => [r.performed_by, ...(r.reversed_by ? [r.reversed_by] : [])]))]
  const staff = new Map(
    (
      await db.selectFrom('identity.staff_users').select(['id', 'display_name']).where('id', 'in', staffIds).execute()
    ).map((s) => [s.id, s.display_name]),
  )
  // A request's current relink is its latest one not reversed (looked up across all its links, wherever they
  // point); its earlier ones not reversed were replaced.
  const latest = new Map<string, string>()
  const requestIds = [...new Set(rows.flatMap((r) => (r.request_id ? [r.request_id] : [])))]
  if (requestIds.length) {
    const newest = await db
      .selectFrom('crm.record_links')
      .select(['id', 'request_id'])
      .where('kind', '=', 'request_relink')
      .where('request_id', 'in', requestIds)
      .where('reversed_at', 'is', null)
      .orderBy('seq', 'desc')
      .execute()
    for (const n of newest) if (n.request_id && !latest.has(n.request_id)) latest.set(n.request_id, n.id)
  }
  const person = (id: string) => ({ id, name: staff.get(id) ?? null })
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    state:
      r.reversed_at !== null
        ? ('reversed' as const)
        : r.kind === 'request_relink' && r.request_id && latest.get(r.request_id) !== r.id
          ? ('replaced' as const)
          : ('current' as const),
    from: { id: r.source_customer_id, displayName: names.get(r.source_customer_id) ?? '' },
    to: { id: r.target_customer_id, displayName: names.get(r.target_customer_id) ?? '' },
    requestReference: r.request_reference,
    reason: r.reason,
    by: person(r.performed_by),
    at: r.performed_at.toISOString(),
    correction: r.correction,
    access: accessOf(r.access_recheck),
    reversal:
      r.reversed_at && r.reversed_by
        ? {
            by: person(r.reversed_by),
            at: r.reversed_at.toISOString(),
            reason: r.reverse_reason ?? '',
            access: accessOf(r.reversal_recheck),
          }
        : null,
  }))
}
