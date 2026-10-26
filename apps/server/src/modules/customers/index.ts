// Customers module (TSK-0044; HH-CRM-01, HH-ID-02, HH-STAFF-05, HH-STAFF-04, OWN-DEC-117, RULE-SERVER-AUTHZ): the
// staff customer list and record, staff edits of customer and contact details with a reason, notes with a visibility
// class, staff-recorded opt-outs, and the review of candidate matches. Every read and write is inside the caller's
// scope (TSK-0037); an altered ID finds nothing. The human-reviewed merges, relinks and the Owner's reversal are in
// link-routes.ts and links.ts (TSK-0046, HH-CRM-04); nothing is ever merged or linked automatically. No route here
// answers a customer: customer and contact records have no customer projection (records/projections).
import type { Tx } from '@handyhub/db'
import { isSupportedZone, looksLikeCardNumber, type NoteVisibility } from '@handyhub/domain'
import { normalizeUsPhone } from '@handyhub/domain/request-form'
import { decide, listingScope, type DataScope, type StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import { pageSchema, toPage } from '../../api/pagination.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { customerInScope, projectInScope } from '../../platform/data-scope.js'
import { currentContext } from '../../platform/request-context.js'
import { currentConsent, recordConsent } from '../notifications/index.js'
import { LINK_ROUTES } from './link-routes.js'
import { projectRoots } from './links.js'
import { candidateMatchAutomation, contactChanged, syncCandidateItem } from './matching.js'
import { staffCustomerView } from './record.js'
import {
  CANDIDATE_PARAMS,
  CONTACT_EDIT_BODY,
  CONTACT_ZONE_BODY,
  CONTACT_PARAMS,
  CREATED,
  CUSTOMER_EDIT_BODY,
  CUSTOMER_PARAMS,
  DISMISS_BODY,
  LIST_ITEM,
  NOTE_BODY,
  RECORD,
  VERSION_RESULT,
  WITHDRAWAL_BODY,
} from './schemas.js'

export {
  candidateMatchAutomation,
  contactChanged,
  detectCandidates,
  findCandidates,
  syncCandidateItem,
} from './matching.js'
export { staffCustomerView } from './record.js'
export {
  customerRoot,
  linkHistory,
  mergeCustomers,
  mergePreview,
  projectCustomers,
  projectsUnder,
  recheckAccess,
  relinkPreview,
  relinkRequest,
  reverseLink,
} from './links.js'

const TEST = 'test/integration/customers.test.ts'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function staffActor(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}
const params = (ctx: ApiContext) => ctx.req.params as { customerId: string; contactId?: string; candidateId?: string }
const correlation = (ctx: ApiContext) => currentContext()?.requestId ?? ctx.req.id
const invalid = (field: string, code = 'invalid') =>
  new ApiError('VALIDATION_FAILED', { fieldErrors: [{ field, code, message: '' }] })
const conflict = (code: string) => new ApiError('CONFLICT', { fieldErrors: [{ field: 'state', code, message: '' }] })

/** The record facts: the customer exists (the policy needs no more for staff); a missing one answers NOT_FOUND. */
const customerExists: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { customerId } = req.params as { customerId: string }
  if (!UUID_RE.test(customerId)) return null
  const row = await db.selectFrom('crm.customers').select('id').where('id', '=', customerId).executeTakeFirst()
  return row ? {} : null
}

type LockedCustomer = { id: string; status: string; version: number; displayName: string }

/** Locks a customer inside the caller's scope; outside it, or unknown, NOT_FOUND and nothing changes. */
async function lockCustomer(tx: Tx, scope: DataScope, customerId: string): Promise<LockedCustomer> {
  if (!UUID_RE.test(customerId)) throw new ApiError('NOT_FOUND')
  const row = await tx
    .selectFrom('crm.customers as cu')
    .select(['cu.id', 'cu.status', 'cu.version', 'cu.display_name'])
    .where('cu.id', '=', customerId)
    .where(customerInScope('cu.id', scope))
    .forUpdate()
    .executeTakeFirst()
  if (!row) throw new ApiError('NOT_FOUND')
  return { id: row.id, status: row.status, version: row.version, displayName: row.display_name }
}

const notMerged = (c: LockedCustomer) => {
  // A merged record is history: its survivor is edited instead (HH-CRM-04).
  if (c.status === 'merged') throw conflict('CUSTOMER_MERGED')
}

const reasonOf = (ctx: ApiContext) => ((ctx.req.body as { reason?: string }).reason ?? '').trim()

function writeRoute(
  def: Pick<RouteDef, 'method' | 'path' | 'operationId' | 'summary' | 'description' | 'permission' | 'audit'> & {
    params: Record<string, unknown>
    body: Record<string, unknown>
    response: Record<number, Record<string, unknown>>
    expectedVersion: 'required' | 'none'
    handler: RouteDef['handler']
  },
): RouteDef {
  return {
    method: def.method,
    path: def.path,
    operationId: def.operationId,
    summary: def.summary,
    description: def.description,
    actors: ['staff'],
    permission: def.permission,
    kind: 'write',
    idempotency: 'required',
    expectedVersion: def.expectedVersion,
    rateLimit: 'none',
    audit: def.audit,
    pagination: false,
    test: TEST,
    resource: customerExists,
    schema: { params: def.params, body: def.body, response: def.response },
    handler: def.handler,
  }
}

/** Escapes LIKE wildcards in a search text. */
const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

const list: RouteDef = {
  method: 'GET',
  path: '/staff/customers',
  operationId: 'listStaffCustomers',
  summary: 'Customers',
  description:
    'Staff with customer.view (Owner, Office; Estimator PROPOSED). Customers newest first inside the caller’s scope, ' +
    'optionally searched by name, exact email, phone or project reference. Each shows its primary contact, city, ' +
    'project count and, for roles holding customer.view_duplicates, its open duplicate suggestions (never links).',
  actors: ['staff'],
  permission: 'customer.view',
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'none',
  pagination: true,
  test: TEST,
  schema: {
    querystring: {
      type: 'object',
      additionalProperties: false,
      properties: { q: { type: 'string', minLength: 1, maxLength: 200 } },
    },
    response: { 200: pageSchema(LIST_ITEM) },
  },
  handler: async (ctx) => {
    const page = ctx.page as NonNullable<ApiContext['page']>
    const q = ((ctx.req.query as { q?: string }).q ?? '').trim()
    let query = ctx.db
      .selectFrom('crm.customers as cu')
      .select([
        'cu.id',
        'cu.display_name',
        'cu.status',
        'cu.created_at',
        sql<string>`cu.created_at::text`.as('created_key'),
      ])
      .where(customerInScope('cu.id', ctx.scope))
    if (q) {
      const phone = /\d{7,}/.test(q.replace(/\D/g, '')) ? normalizeUsPhone(q) : null
      query = query.where((eb) =>
        eb.or([
          eb('cu.display_name', 'ilike', like(q)),
          eb.exists(
            eb
              .selectFrom('crm.contacts as c')
              .select('c.id')
              .whereRef('c.customer_id', '=', 'cu.id')
              .where((e) =>
                e.or([
                  e('c.full_name', 'ilike', like(q)),
                  e('c.email_normalized', '=', q.toLowerCase()),
                  ...(phone ? [e('c.phone_e164', '=', phone)] : []),
                ]),
              ),
          ),
          eb.exists(
            eb
              .selectFrom('crm.projects as p')
              .select('p.id')
              .where('p.reference', '=', q.toUpperCase())
              .where(projectInScope('p.id', ctx.scope))
              // The customer it was created for, and the one staff see it under now (TSK-0046).
              .where((e) =>
                e.or([
                  e('p.customer_id', '=', e.ref('cu.id')),
                  e(sql<string>`crm.project_customer(p.id)`, '=', e.ref('cu.id')),
                ]),
              ),
          ),
        ]),
      )
    }
    const after = page.after
    if (after !== undefined) {
      const [at, id] = after
      if (after.length !== 2 || typeof at !== 'string' || typeof id !== 'string' || !UUID_RE.test(id))
        throw invalid('querystring.cursor')
      query = query.where(sql<boolean>`(cu.created_at, cu.id) < (${at}::timestamptz, ${id}::uuid)`)
    }
    const rows = await query
      .orderBy('cu.created_at', 'desc')
      .orderBy('cu.id', 'desc')
      .limit(page.limit + 1)
      .execute()
    const out = toPage(rows, page, (r) => [r.created_key, r.id])
    const ids = out.items.map((r) => r.id)
    const contacts = ids.length
      ? await ctx.db
          .selectFrom('crm.contacts')
          .select(['customer_id', 'full_name', 'email', 'phone_e164'])
          .where('customer_id', 'in', ids)
          .orderBy('is_primary', 'desc')
          .orderBy('created_at')
          .execute()
      : []
    const cities = ids.length
      ? await ctx.db
          .selectFrom('crm.customer_properties as cp')
          .innerJoin('crm.properties as p', 'p.id', 'cp.property_id')
          .select(['cp.customer_id', 'p.city'])
          .where('cp.customer_id', 'in', ids)
          .orderBy('cp.created_at')
          .execute()
      : []
    // Projects as staff see them (TSK-0046): a customer's own, its merged records' and those linked to it; a merged
    // record counts the projects it was created with.
    const merged = out.items.filter((r) => r.status === 'merged').map((r) => r.id)
    const live = ids.filter((i) => !merged.includes(i))
    const counts = new Map<string, number>()
    for (const root of (await projectRoots(ctx.db, live, ctx.scope)).values())
      counts.set(root, (counts.get(root) ?? 0) + 1)
    if (merged.length)
      for (const p of await ctx.db
        .selectFrom('crm.projects')
        .select(['customer_id', ({ fn }) => fn.countAll<string>().as('n')])
        .where('customer_id', 'in', merged)
        .where(projectInScope('id', ctx.scope))
        .groupBy('customer_id')
        .execute())
        counts.set(p.customer_id, Number(p.n))
    const mayViewDuplicates =
      ctx.actor.kind === 'staff' &&
      listingScope(ctx.actor.roles, ctx.actor.capabilities, 'customer.view_duplicates') === 'all'
    const open =
      mayViewDuplicates && ids.length
        ? await ctx.db
            .selectFrom('crm.candidate_matches')
            .select(['customer_id', 'candidate_customer_id'])
            .where('status', '=', 'open')
            .where((eb) => eb.or([eb('customer_id', 'in', ids), eb('candidate_customer_id', 'in', ids)]))
            .execute()
        : []
    return {
      body: {
        items: out.items.map((r) => {
          const c = contacts.find((x) => x.customer_id === r.id)
          return {
            id: r.id,
            displayName: r.display_name,
            status: r.status,
            createdAt: r.created_at.toISOString(),
            contactName: c?.full_name ?? null,
            email: c?.email ?? null,
            phone: c?.phone_e164 ?? null,
            city: cities.find((x) => x.customer_id === r.id)?.city ?? null,
            projects: counts.get(r.id) ?? 0,
            possibleDuplicates: mayViewDuplicates
              ? open.filter((m) => m.customer_id === r.id || m.candidate_customer_id === r.id).length
              : null,
          }
        }),
        nextCursor: out.nextCursor,
      },
    }
  },
}

const detail: RouteDef = {
  method: 'GET',
  path: '/staff/customers/:customerId',
  operationId: 'getStaffCustomer',
  summary: 'A customer record',
  description:
    'Staff with customer.view, inside their scope. The customer with each contact (email and phone verification ' +
    'separately, preferred channel, the SMS opt-in and the separate marketing permission with their records, ' +
    'opt-outs included), authorized properties, projects and requests, notes with their visibility class (a ' +
    'restricted note is masked for a role that may not read it; an Owner reading restricted incident detail is ' +
    'audited), duplicate suggestions for roles holding customer.view_duplicates (suggestions only, never links), and ' +
    'the activity history. Documents and payments are not available in this release. The ETag is the customer version.',
  actors: ['staff'],
  permission: 'customer.view',
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'none',
  pagination: false,
  test: TEST,
  resource: customerExists,
  schema: { params: CUSTOMER_PARAMS, response: { 200: RECORD } },
  handler: async (ctx) => {
    const view = await staffCustomerView(ctx.db, ctx.scope, params(ctx).customerId, ctx.actor)
    if (!view) throw new ApiError('NOT_FOUND')
    const { revealedIncidents, ...body } = view
    // Restricted incident detail read by the Owner: audited, as the matrix cell says (OWN-DEC-143).
    if (revealedIncidents.length)
      await ctx.auditAlways({
        action: 'incident.view_restricted',
        target: { type: 'customer', id: view.id },
        summary: { notes: revealedIncidents },
      })
    return { body, version: view.version }
  },
}

const editCustomer = writeRoute({
  method: 'PUT',
  path: '/staff/customers/:customerId',
  operationId: 'editStaffCustomer',
  summary: 'Edit a customer’s display name',
  description:
    'Staff with customer.edit (Owner; Office with a reason). A written reason is required from everyone; the change ' +
    'is kept with the values before and after (staff only). If-Match is the customer version. A merged record is ' +
    'not edited (CUSTOMER_MERGED).',
  permission: 'customer.edit',
  audit: 'customer.edit',
  expectedVersion: 'required',
  params: CUSTOMER_PARAMS,
  body: CUSTOMER_EDIT_BODY,
  response: { 200: VERSION_RESULT },
  handler: async (ctx) => {
    const tx = ctx.tx as Tx
    const actor = staffActor(ctx)
    const c = await lockCustomer(tx, ctx.scope, params(ctx).customerId)
    notMerged(c)
    if (ctx.expectedVersion() !== c.version)
      throw new ApiError('STALE_VERSION', { current: { version: c.version, values: { displayName: c.displayName } } })
    const displayName = (ctx.req.body as { displayName: string }).displayName.trim()
    if (displayName === c.displayName) {
      await ctx.audit({ target: { type: 'customer', id: c.id, version: c.version }, summary: { fields: [] } })
      return { body: { id: c.id, version: c.version }, version: c.version }
    }
    const version = c.version + 1
    await tx.updateTable('crm.customers').set({ display_name: displayName, version }).where('id', '=', c.id).execute()
    await tx
      .insertInto('crm.record_changes')
      .values({
        customer_id: c.id,
        record_type: 'customer',
        record_id: c.id,
        fields: ['displayName'],
        previous: JSON.stringify({ displayName: c.displayName }),
        current: JSON.stringify({ displayName }),
        reason: reasonOf(ctx),
        changed_by: actor.userId,
      })
      .execute()
    // The audit names the fields and the reason, never the personal data itself.
    await ctx.audit({
      target: { type: 'customer', id: c.id, version },
      summary: { fields: ['displayName'] },
      reason: reasonOf(ctx),
    })
    return { body: { id: c.id, version }, version }
  },
})

type ContactRow = {
  id: string
  full_name: string
  email: string
  phone_e164: string
  preferred_channel: string
  email_verification: string
  phone_verification: string
  email_verified_value: string | null
  phone_verified_value: string | null
  time_zone: string | null
  version: number
}

async function lockContact(tx: Tx, scope: DataScope, customerId: string, contactId: string) {
  const customer = await lockCustomer(tx, scope, customerId)
  if (!UUID_RE.test(contactId)) throw new ApiError('NOT_FOUND')
  const contact = (await tx
    .selectFrom('crm.contacts')
    .select([
      'id',
      'full_name',
      'email',
      'phone_e164',
      'preferred_channel',
      'email_verification',
      'phone_verification',
      'email_verified_value',
      'phone_verified_value',
      'time_zone',
      'version',
    ])
    .where('id', '=', contactId)
    .where('customer_id', '=', customer.id)
    .forUpdate()
    .executeTakeFirst()) as ContactRow | undefined
  if (!contact) throw new ApiError('NOT_FOUND')
  return { customer, contact }
}

const editContact = writeRoute({
  method: 'PUT',
  path: '/staff/customers/:customerId/contacts/:contactId',
  operationId: 'editStaffContact',
  summary: 'Edit a contact’s details',
  description:
    'Staff with customer.edit (Owner; Office with a reason). Name, email, phone and preferred channel, with a ' +
    'required reason; the change is kept with the values before and after (staff only). A changed email or phone ' +
    'is unverified until the contact verifies that exact value (verification belongs to the value, OWN-DEC-96); ' +
    'its open codes stop working. Text as the preferred channel needs a current SMS opt-in for the number ' +
    '(HH-INT-22). A changed email or phone is checked for duplicate suggestions (never links). If-Match is the ' +
    'contact version.',
  permission: 'customer.edit',
  audit: 'customer.edit_contact',
  expectedVersion: 'required',
  params: CONTACT_PARAMS,
  body: CONTACT_EDIT_BODY,
  response: { 200: VERSION_RESULT },
  handler: async (ctx) => {
    const tx = ctx.tx as Tx
    const actor = staffActor(ctx)
    const p = params(ctx)
    const { customer, contact } = await lockContact(tx, ctx.scope, p.customerId, p.contactId as string)
    notMerged(customer)
    if (ctx.expectedVersion() !== contact.version)
      throw new ApiError('STALE_VERSION', { current: { version: contact.version } })
    const b = ctx.req.body as { fullName: string; email: string; phone: string; preferredChannel: string }
    const phone = normalizeUsPhone(b.phone)
    if (!phone) throw invalid('body.phone')
    const next = { fullName: b.fullName.trim(), email: b.email.trim(), phone, preferredChannel: b.preferredChannel }
    const before = {
      fullName: contact.full_name,
      email: contact.email,
      phone: contact.phone_e164,
      preferredChannel: contact.preferred_channel,
    }
    const fields = (Object.keys(next) as (keyof typeof next)[]).filter((k) => next[k] !== before[k])
    if (fields.length === 0) {
      await ctx.audit({
        target: { type: 'contact', id: contact.id, version: contact.version },
        summary: { customerId: customer.id, fields: [] },
      })
      return { body: { id: contact.id, version: contact.version }, version: contact.version }
    }
    if (next.preferredChannel === 'text' && (await currentConsent(tx, 'sms', phone, 'transactional_sms')) !== 'granted')
      throw invalid('body.preferredChannel', 'sms_opt_in_required')
    const emailChanged = next.email.toLowerCase() !== before.email.toLowerCase()
    const phoneChanged = next.phone !== before.phone
    const version = contact.version + 1
    await tx
      .updateTable('crm.contacts')
      .set({
        full_name: next.fullName,
        email: next.email,
        phone_e164: next.phone,
        preferred_channel: next.preferredChannel,
        // Verification belongs to the exact value: a changed value is unverified unless it is the very value proved.
        ...(emailChanged
          ? {
              email_verification: contact.email_verified_value === next.email.toLowerCase() ? 'verified' : 'unverified',
            }
          : {}),
        ...(phoneChanged
          ? { phone_verification: contact.phone_verified_value === next.phone ? 'verified' : 'unverified' }
          : {}),
        version,
      })
      .where('id', '=', contact.id)
      .execute()
    // Codes sent to the old value no longer verify anything (and cannot bring the old value back).
    const channels = [...(emailChanged ? ['email'] : []), ...(phoneChanged ? ['phone'] : [])]
    if (channels.length)
      await tx
        .updateTable('identity.verification_codes')
        .set({ superseded_at: new Date() })
        .where('purpose', '=', 'contact_verification')
        .where(
          'subject_ref',
          'in',
          channels.map((ch) => `contact:${contact.id}:${ch}`),
        )
        .where('consumed_at', 'is', null)
        .where('superseded_at', 'is', null)
        .execute()
    const pick = (o: Record<string, string>) => Object.fromEntries(fields.map((f) => [f, o[f] as string]))
    await tx
      .insertInto('crm.record_changes')
      .values({
        customer_id: customer.id,
        record_type: 'contact',
        record_id: contact.id,
        fields,
        previous: JSON.stringify(pick(before)),
        current: JSON.stringify(pick(next)),
        reason: reasonOf(ctx),
        changed_by: actor.userId,
      })
      .execute()
    if (emailChanged || phoneChanged) await contactChanged(tx, contact.id, correlation(ctx))
    await ctx.audit({
      target: { type: 'contact', id: contact.id, version },
      summary: { customerId: customer.id, fields },
      reason: reasonOf(ctx),
    })
    return { body: { id: contact.id, version }, version }
  },
})

const setContactZone = writeRoute({
  method: 'PUT',
  path: '/staff/customers/:customerId/contacts/:contactId/time-zone',
  operationId: 'setStaffContactTimeZone',
  summary: 'Record a contact’s own time zone for texts',
  description:
    'TSK-0123 (OWN-DEC-159 item 5, HH-COM-15): staff with customer.edit (Owner; Office with a reason) record the ' +
    'IANA zone the contact receives texts in, as the customer gave it; null makes it unknown again. Only Eastern or ' +
    'Central zones (ZONE_NOT_SUPPORTED otherwise). The property’s zone is never taken as the recipient’s: while this ' +
    'is unknown the contact’s zone stays unknown and is flagged on the record. The change is kept with the values ' +
    'before and after (staff only). If-Match is the contact version.',
  permission: 'customer.edit',
  audit: 'customer.set_contact_time_zone',
  expectedVersion: 'required',
  params: CONTACT_PARAMS,
  body: CONTACT_ZONE_BODY,
  response: { 200: VERSION_RESULT },
  handler: async (ctx) => {
    const tx = ctx.tx as Tx
    const actor = staffActor(ctx)
    const p = params(ctx)
    const { customer, contact } = await lockContact(tx, ctx.scope, p.customerId, p.contactId as string)
    notMerged(customer)
    if (ctx.expectedVersion() !== contact.version)
      throw new ApiError('STALE_VERSION', { current: { version: contact.version } })
    const next = (ctx.req.body as { timeZone: string | null }).timeZone
    if (next !== null && !isSupportedZone(next)) throw invalid('body.timeZone', 'ZONE_NOT_SUPPORTED')
    const reason = reasonOf(ctx)
    if (next === contact.time_zone) {
      await ctx.audit({
        target: { type: 'contact', id: contact.id, version: contact.version },
        summary: { customerId: customer.id, fields: [] },
      })
      return { body: { id: contact.id, version: contact.version }, version: contact.version }
    }
    const version = contact.version + 1
    await tx.updateTable('crm.contacts').set({ time_zone: next, version }).where('id', '=', contact.id).execute()
    await tx
      .insertInto('crm.record_changes')
      .values({
        customer_id: customer.id,
        record_type: 'contact',
        record_id: contact.id,
        fields: ['timeZone'],
        previous: JSON.stringify({ timeZone: contact.time_zone }),
        current: JSON.stringify({ timeZone: next }),
        reason,
        changed_by: actor.userId,
      })
      .execute()
    await ctx.audit({
      target: { type: 'contact', id: contact.id, version },
      summary: { customerId: customer.id, fields: ['timeZone'], from: contact.time_zone, to: next },
      reason,
    })
    return { body: { id: contact.id, version }, version }
  },
})

const addNote = writeRoute({
  method: 'POST',
  path: '/staff/customers/:customerId/notes',
  operationId: 'addCustomerNote',
  summary: 'Add a note to a customer record',
  description:
    'Staff with request.add_note (PROPOSED: notes on the customer record sit with request notes). A staff-only note ' +
    'with its visibility class: internal_operational by default, or restricted_incident (the Owner and the reporting ' +
    'worker only) or restricted_financial. A note is never customer-shared: customer-visible text is a customer ' +
    'message. Notes are never edited or deleted, never hold card numbers (refused) and their text is never audited.',
  permission: 'request.add_note',
  audit: 'customer.add_note',
  expectedVersion: 'none',
  params: CUSTOMER_PARAMS,
  body: NOTE_BODY,
  response: { 201: CREATED },
  handler: async (ctx) => {
    const tx = ctx.tx as Tx
    const actor = staffActor(ctx)
    const c = await lockCustomer(tx, ctx.scope, params(ctx).customerId)
    notMerged(c)
    const { body, visibility } = ctx.req.body as { body: string; visibility?: NoteVisibility }
    if (looksLikeCardNumber(body)) throw invalid('body.body', 'sensitive_content')
    const row = await tx
      .insertInto('crm.customer_notes')
      .values({
        customer_id: c.id,
        author_staff_id: actor.userId,
        visibility: visibility ?? 'internal_operational',
        body: body.trim(),
      })
      .returning(['id', 'created_at', 'visibility'])
      .executeTakeFirstOrThrow()
    await ctx.audit({
      target: { type: 'customer_note', id: row.id },
      summary: { customerId: c.id, visibility: row.visibility },
    })
    return { status: 201, body: { id: row.id, createdAt: row.created_at.toISOString() } }
  },
})

const recordWithdrawal = writeRoute({
  method: 'POST',
  path: '/staff/customers/:customerId/contacts/:contactId/withdrawals',
  operationId: 'recordContactWithdrawal',
  summary: 'Record a customer’s opt-out',
  description:
    'Staff with customer.edit (Owner; Office with a reason). Records the customer’s instruction to stop texts (the ' +
    'SMS opt-in) or marketing on one channel, as an append-only consent record (source staff_recorded) that the ' +
    'send-time checks honour at once. Staff never record an opt-in for the customer (PROPOSED: the customer gives it ' +
    'on the form or in the portal). Already withdrawn: nothing new is recorded.',
  permission: 'customer.edit',
  audit: 'customer.record_withdrawal',
  expectedVersion: 'none',
  params: CONTACT_PARAMS,
  body: WITHDRAWAL_BODY,
  response: {
    200: {
      type: 'object',
      additionalProperties: false,
      required: ['state', 'recorded'],
      properties: { state: { type: 'string' }, recorded: { type: 'boolean' } },
    },
  },
  handler: async (ctx) => {
    const tx = ctx.tx as Tx
    const actor = staffActor(ctx)
    const p = params(ctx)
    const { customer, contact } = await lockContact(tx, ctx.scope, p.customerId, p.contactId as string)
    const { purpose, channel } = ctx.req.body as {
      purpose: 'transactional_sms' | 'marketing'
      channel: 'email' | 'sms'
    }
    if (purpose === 'transactional_sms' && channel !== 'sms') throw invalid('body.channel')
    const destination = channel === 'sms' ? contact.phone_e164 : contact.email
    // TSK-0134: an instruction to stop texts also ends a consent to verification codes by text (like STOP).
    const purposes = purpose === 'transactional_sms' ? (['transactional_sms', 'sms_verification'] as const) : [purpose]
    const open: (typeof purposes)[number][] = []
    for (const p of purposes) {
      const state = await currentConsent(tx, channel, destination, p)
      // The opt-in is withdrawn unless it already is; the verification-code consent only while it is granted.
      if (p === 'sms_verification' ? state === 'granted' : state !== 'withdrawn') open.push(p)
    }
    if (open.length === 0) {
      await ctx.audit({
        target: { type: 'contact', id: contact.id },
        summary: { customerId: customer.id, purpose, channel, recorded: false },
        reason: reasonOf(ctx),
      })
      return { body: { state: 'withdrawn', recorded: false } }
    }
    for (const p of open)
      await recordConsent(tx, {
        purpose: p,
        channel,
        destination,
        granted: false,
        source: 'staff_recorded',
        recordedBy: actor.userId,
        subject: { kind: 'customer_contact', id: contact.id },
        // Safe evidence: the request this was recorded in; the reason is in the audit event.
        evidence: { requestId: correlation(ctx) },
      })
    await ctx.audit({
      target: { type: 'contact', id: contact.id },
      summary: { customerId: customer.id, purpose, channel, recorded: true },
      reason: reasonOf(ctx),
    })
    return { body: { state: 'withdrawn', recorded: true } }
  },
})

const dismissCandidate = writeRoute({
  method: 'POST',
  path: '/staff/customers/:customerId/candidates/:candidateId/dismiss',
  operationId: 'dismissCandidateMatch',
  summary: 'Not the same customer',
  description:
    'Staff with customer.merge (Owner; Office with a reason) and customer.view_duplicates (PROPOSED: whoever decides ' +
    'merges decides that a suggestion is not one). Marks an open suggestion of this customer as reviewed and not ' +
    'the same customer, with a required reason; nothing is linked or changed on either customer. The pair reopens ' +
    'only if the two later share new details. If-Match is the suggestion version.',
  permission: 'customer.merge',
  audit: 'customer.dismiss_candidate',
  expectedVersion: 'required',
  params: CANDIDATE_PARAMS,
  body: DISMISS_BODY,
  response: { 200: VERSION_RESULT },
  handler: async (ctx) => {
    const tx = ctx.tx as Tx
    const actor = staffActor(ctx)
    const p = params(ctx)
    if (decide(actor, 'customer.view_duplicates', {}, { now: new Date() }).effect !== 'allow')
      throw new ApiError('FORBIDDEN')
    const c = await lockCustomer(tx, ctx.scope, p.customerId)
    if (!UUID_RE.test(p.candidateId as string)) throw new ApiError('NOT_FOUND')
    const m = await tx
      .selectFrom('crm.candidate_matches')
      .select(['id', 'customer_id', 'candidate_customer_id', 'status', 'version', 'reasons'])
      .where('id', '=', p.candidateId as string)
      .where((eb) => eb.or([eb('customer_id', '=', c.id), eb('candidate_customer_id', '=', c.id)]))
      .forUpdate()
      .executeTakeFirst()
    if (!m) throw new ApiError('NOT_FOUND')
    if (ctx.expectedVersion() !== m.version)
      throw new ApiError('STALE_VERSION', { current: { version: m.version, values: { status: m.status } } })
    if (m.status !== 'open') throw conflict('CANDIDATE_NOT_OPEN')
    const version = m.version + 1
    await tx
      .updateTable('crm.candidate_matches')
      .set({ status: 'dismissed', version, updated_at: sql<Date>`now()` })
      .where('id', '=', m.id)
      .execute()
    await tx
      .insertInto('crm.candidate_match_events')
      .values({ match_id: m.id, event: 'dismissed', reasons: m.reasons, reason: reasonOf(ctx), staff_id: actor.userId })
      .execute()
    await syncCandidateItem(tx, m.customer_id)
    await ctx.audit({
      target: { type: 'candidate_match', id: m.id, version },
      summary: { customerId: m.customer_id, candidateCustomerId: m.candidate_customer_id, reasons: m.reasons },
      reason: reasonOf(ctx),
    })
    return { body: { id: m.id, version }, version }
  },
})

export const CUSTOMERS_ROUTES: readonly RouteDef[] = [
  list,
  detail,
  editCustomer,
  editContact,
  setContactZone,
  addNote,
  recordWithdrawal,
  dismissCandidate,
  ...LINK_ROUTES,
]

export const CUSTOMERS_MODULE: ApiModule = { name: 'customers', routes: CUSTOMERS_ROUTES }

export const customerAutomations = () => [candidateMatchAutomation()]
