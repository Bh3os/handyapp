// Properties module (TSK-0045; HH-CRM-02, HH-CRM-03, T28, ENT-Property, ENT-AccessInstructionSecret, OWN-DEC-117,
// OWN-DEC-40, OWN-DEC-121, RULE-SERVER-AUTHZ): the staff property record and the protected access-code store.
//
// Property record: the address with its history (a change records the next address version and keeps the old one as
// a former address; requests keep the address they were sent with), the property type and the non-secret details,
// each with its source and last confirmation, every change and confirmation with a required reason.
//
// Access codes (HH-CRM-03): kept in their own table, sealed with ACCESS_CODE_ENCRYPTION_KEY (seal.ts) and masked
// everywhere. Owner and Office (and, later, the customer) enter, replace and remove them (access_code.set); a removed
// code's value is erased at once. Only the reveal route ever opens one: for the Owner, for Office (PROPOSED cell), and
// for a worker only when assigned to a visit at the property, on the visit date, online (the policy's
// access_code.reveal rule). Every reveal is recorded (crm.access_code_reveals) and audited; its response is never
// cached (Cache-Control: no-store), never kept for idempotency and never logged. The value never appears in any
// other response, in an audit summary, a reason, a label, a property detail, a message, an export, a packet or an
// offline download: entering it anywhere else is refused where it can be recognised.
// Without the key the store is NOT CONFIGURED: codes cannot be entered, replaced or revealed (removal still works,
// since it only erases), and the property record says so.
import { randomUUID } from 'node:crypto'
import type { Db, Tx } from '@handyhub/db'
import {
  countyRef,
  looksLikeAccessCode,
  looksLikeCardNumber,
  sameAddress,
  verificationProblems,
  type PropertyTextDetail,
} from '@handyhub/domain'
import type { Actor, Resource, StaffActor } from '@handyhub/policy'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { propertyInScope } from '../../platform/data-scope.js'
import { currentContext } from '../../platform/request-context.js'
import type { Secret } from '../../providers/types.js'
import { propertyVisitFacts } from '../packets/assignments.js'
import { loadConfig, requireConfigured } from '../../platform/config/index.js'
import { coverageOrUnknown } from '../requests/submit.js'
import {
  ADDRESS_BODY,
  CODE_BODY,
  COUNTY_BODY,
  COUNTY_RESULT,
  CODE_CREATED,
  CODE_PARAMS,
  CODE_REMOVE_BODY,
  CODE_REPLACE_BODY,
  CONFIRM_BODY,
  CONFIRM_PARAMS,
  DETAIL_BODY,
  DETAIL_PARAMS,
  EMPTY_BODY,
  PROPERTY_PARAMS,
  PROPERTY_VIEW,
  REVEALED,
  TYPE_BODY,
  VERSION_RESULT,
  ZONE_BODY,
} from './schemas.js'
import { openAccessCode, sealAccessCode } from './seal.js'
import { staffPropertyView, UUID_RE } from './view.js'
import { countyZones, derivePropertyZone, recordPropertyZone, type ZoneState } from './zones.js'

export { openAccessCode, sealAccessCode } from './seal.js'
export { staffPropertyView } from './view.js'

const TEST = 'test/integration/properties.test.ts'

/** PROPOSED: a revealed code shows for 60 seconds, then the staff app hides it again (HH-CRM-03 "masked by default"). */
export const REVEAL_DISPLAY_SECONDS = 60
/** PROPOSED: at most 30 reveals per staff member per hour; more is refused (RATE_LIMITED) and visible in the logs. */
export const REVEAL_RATE = { bucket: 'access-code-reveal', limit: 30, windowSeconds: 3600 } as const

export type PropertiesDeps = {
  /** Seals access codes; null while ACCESS_CODE_ENCRYPTION_KEY is unset (the store is NOT CONFIGURED). */
  accessCodeKey: Secret | null
}

type Params = { propertyId: string; detail?: string; codeId?: string }
const params = (ctx: ApiContext) => ctx.req.params as Params
const correlation = (ctx: ApiContext) => currentContext()?.requestId ?? ctx.req.id
const invalid = (field: string, code = 'invalid') =>
  new ApiError('VALIDATION_FAILED', { fieldErrors: [{ field, code, message: '' }] })
const conflict = (code: string) => new ApiError('CONFLICT', { fieldErrors: [{ field: 'state', code, message: '' }] })

function staffActor(ctx: ApiContext): StaffActor {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

/** The written reason, refused when it holds what looks like an access code or card number. */
function reasonOf(ctx: ApiContext, secret?: string): string {
  const reason = ((ctx.req.body as { reason?: string }).reason ?? '').trim()
  if (looksLikeAccessCode(reason) || (secret !== undefined && reason.includes(secret)))
    throw invalid('body.reason', 'looks_like_access_code')
  if (looksLikeCardNumber(reason)) throw invalid('body.reason', 'sensitive_content')
  return reason
}

/** The record facts: the property exists (staff need no more); a missing one answers NOT_FOUND. */
const propertyExists: NonNullable<RouteDef['resource']> = async ({ req, db }) => {
  const { propertyId } = req.params as Params
  if (!UUID_RE.test(propertyId)) return null
  const row = await db.selectFrom('crm.properties').select('id').where('id', '=', propertyId).executeTakeFirst()
  return row ? {} : null
}

/**
 * The visit facts a worker's reveal is decided on (T28, OWN-DEC-121, OWN-DEC-40): the worker's active confirmed
 * reservations on live visits at the property, each with its access window, and the visit date in the business time
 * zone (TSK-0069, packets/assignments.ts). A worker removed by a reassignment holds no assignment there any more and
 * the policy refuses the reveal (NOT_ASSIGNED); another day is NOT_VISIT_DATE. The Owner and Office need no facts.
 */
export async function visitAccessFacts(db: Db | Tx, propertyId: string, actor: Actor): Promise<Resource> {
  return propertyVisitFacts(db, propertyId, actor)
}

/** The record facts of a reveal: the code exists and is not removed, plus the visit facts. */
const revealFacts: NonNullable<RouteDef['resource']> = async ({ req, db, actor }) => {
  const { propertyId, codeId } = req.params as Params
  if (!UUID_RE.test(propertyId) || !UUID_RE.test(codeId ?? '')) return null
  const row = await db
    .selectFrom('crm.access_instruction_secrets')
    .select('property_id')
    .where('id', '=', codeId as string)
    .where('property_id', '=', propertyId)
    .where('removed_at', 'is', null)
    .executeTakeFirst()
  return row ? visitAccessFacts(db, row.property_id, actor) : null
}

type LockedProperty = {
  id: string
  version: number
  addressVersion: number
  street: string
  unit: string | null
  city: string
  state: string
  zip: string
  propertyType: string
  zoneVersion: number
  zone: ZoneState
}

/** Locks a property inside the caller's scope; outside it, or unknown, NOT_FOUND and nothing changes. */
async function lockProperty(tx: Tx, ctx: ApiContext): Promise<LockedProperty> {
  const { propertyId } = params(ctx)
  if (!UUID_RE.test(propertyId)) throw new ApiError('NOT_FOUND')
  const row = await tx
    .selectFrom('crm.properties as p')
    .select([
      'p.id',
      'p.version',
      'p.address_version',
      'p.street',
      'p.unit',
      'p.city',
      'p.state',
      'p.zip',
      'p.property_type',
      'p.time_zone',
      'p.time_zone_status',
      'p.time_zone_basis',
      'p.time_zone_counties',
      'p.time_zone_version',
    ])
    .where('p.id', '=', propertyId)
    .where(propertyInScope('p.id', ctx.scope))
    .forUpdate()
    .executeTakeFirst()
  if (!row) throw new ApiError('NOT_FOUND')
  return {
    id: row.id,
    version: row.version,
    addressVersion: row.address_version,
    street: row.street,
    unit: row.unit,
    city: row.city,
    state: row.state,
    zip: row.zip,
    propertyType: row.property_type,
    zoneVersion: row.time_zone_version,
    zone: {
      zone: row.time_zone,
      status: row.time_zone_status as ZoneState['status'],
      basis: row.time_zone_basis,
      counties: row.time_zone_counties,
    },
  }
}

function expectVersion(ctx: ApiContext, version: number) {
  if (ctx.expectedVersion() !== version) throw new ApiError('STALE_VERSION', { current: { version } })
}

async function bumpProperty(tx: Tx, p: LockedProperty, set: Record<string, unknown> = {}): Promise<number> {
  const version = p.version + 1
  await tx
    .updateTable('crm.properties')
    .set({ ...set, version })
    .where('id', '=', p.id)
    .execute()
  return version
}

/** Records the detail's source and confirmation now (inserting the row of a text detail recorded for the first time). */
async function confirmDetail(
  tx: Tx,
  propertyId: string,
  detail: string,
  staffId: string,
  source: string,
  value?: { value: string | null },
) {
  await tx
    .insertInto('crm.property_details')
    .values({
      property_id: propertyId,
      detail,
      value: value?.value ?? null,
      source,
      confirmed_at: sql<Date>`now()`,
      confirmed_by: staffId,
    })
    .onConflict((oc) =>
      oc.columns(['property_id', 'detail']).doUpdateSet({
        ...(value ? { value: value.value } : {}),
        source,
        confirmed_at: sql<Date>`now()`,
        confirmed_by: staffId,
        version: sql<number>`crm.property_details.version + 1`,
      }),
    )
    .execute()
}

function writeRoute(
  def: Pick<
    RouteDef,
    'method' | 'path' | 'operationId' | 'summary' | 'description' | 'permission' | 'audit' | 'expectedVersion'
  > & {
    params: Record<string, unknown>
    body: Record<string, unknown>
    response: Record<number, Record<string, unknown>>
    handler: RouteDef['handler']
    /** Routes whose body carries an access code take no idempotency key: the request hash would be a stored digest
     *  of the code. */
    idempotency?: RouteDef['idempotency']
    resource?: RouteDef['resource']
    rateLimit?: RouteDef['rateLimit']
    businessDate?: true
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
    idempotency: def.idempotency ?? 'required',
    expectedVersion: def.expectedVersion,
    rateLimit: def.rateLimit ?? 'none',
    audit: def.audit,
    pagination: false,
    test: TEST,
    resource: def.resource ?? propertyExists,
    ...(def.businessDate ? { businessDate: true as const } : {}),
    schema: { params: def.params, body: def.body, response: def.response },
    handler: def.handler,
  }
}

const storeState = (deps: PropertiesDeps): 'available' | 'not_configured' =>
  deps.accessCodeKey ? 'available' : 'not_configured'

function requireKey(deps: PropertiesDeps): Secret {
  if (!deps.accessCodeKey) throw new ApiError('NOT_CONFIGURED')
  return deps.accessCodeKey
}

const detailRoute = (deps: PropertiesDeps): RouteDef => ({
  method: 'GET',
  path: '/staff/properties/:propertyId',
  operationId: 'getStaffProperty',
  summary: 'A property record',
  description:
    'Staff with customer.view, inside their scope (Owner, Office; Estimator PROPOSED; a worker reaches no property ' +
    'until visit assignments exist). The current address and its former addresses, the property type, each ' +
    'changeable detail with its source and last confirmation, the customers authorized for it, the requests made ' +
    'there with the address each was sent with (marked when it is a former address), and the change history. For ' +
    'roles that may enter or reveal access codes: the codes masked (kind, label, source, last confirmation, reveals), ' +
    'never their values, and whether the store is configured. The ETag is the property version.',
  actors: ['staff'],
  permission: 'customer.view',
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'none',
  pagination: false,
  test: TEST,
  resource: propertyExists,
  schema: { params: PROPERTY_PARAMS, response: { 200: PROPERTY_VIEW } },
  handler: async (ctx) => {
    const view = await staffPropertyView(ctx.db, ctx.scope, params(ctx).propertyId, ctx.actor, storeState(deps))
    if (!view) throw new ApiError('NOT_FOUND')
    return { body: view, version: view.version }
  },
})

const editAddress = writeRoute({
  method: 'PUT',
  path: '/staff/properties/:propertyId/address',
  operationId: 'editPropertyAddress',
  summary: 'Change a property’s address',
  description:
    'Staff with customer.edit (Owner; Office with a reason). Records the next address version with its source and ' +
    'the required reason; the previous address stays as a former address, and every request keeps the address it ' +
    'was sent with. The coverage of the new ZIP is checked again (never blocking). If-Match is the property version.',
  permission: 'customer.edit',
  audit: 'property.edit_address',
  expectedVersion: 'required',
  params: PROPERTY_PARAMS,
  body: ADDRESS_BODY,
  response: { 200: VERSION_RESULT },
  handler: async (ctx) => {
    const tx = ctx.tx as Tx
    const actor = staffActor(ctx)
    const p = await lockProperty(tx, ctx)
    expectVersion(ctx, p.version)
    const b = ctx.req.body as {
      street: string
      unit?: string | null
      city: string
      state: string
      zip: string
      source: string
    }
    const reason = reasonOf(ctx)
    const unit = (b.unit ?? '').trim()
    const next = {
      street: b.street.trim(),
      unit: unit === '' ? null : unit,
      city: b.city.trim(),
      state: b.state.trim().toUpperCase(),
      zip: b.zip.trim(),
    }
    const before = { street: p.street, unit: p.unit, city: p.city, state: p.state, zip: p.zip }
    if (sameAddress(next, before)) {
      await ctx.audit({
        target: { type: 'property', id: p.id, version: p.version },
        summary: { detail: 'address', changed: false },
      })
      return { body: { id: p.id, version: p.version }, version: p.version }
    }
    const addressVersion = p.addressVersion + 1
    await tx
      .insertInto('crm.property_addresses')
      .values({
        property_id: p.id,
        address_version: addressVersion,
        ...next,
        source: b.source,
        reason,
        recorded_by: actor.userId,
      })
      .execute()
    const coverage = await coverageOrUnknown(tx, next.zip)
    const version = await bumpProperty(tx, p, {
      ...next,
      address_version: addressVersion,
      coverage_result: coverage.outcome,
      coverage_rule_set: coverage.ruleSet,
      coverage_reason: coverage.reason,
    })
    // TSK-0123 (OWN-DEC-159): a zone verified for the old location no longer holds; it is derived again from the new
    // ZIP, or unknown (flagged for verification).
    const derived = await derivePropertyZone(tx, next.zip, await loadConfig(tx))
    const zoneVersion = await recordPropertyZone(
      tx,
      { id: p.id, zoneVersion: p.zoneVersion, zone: p.zone.zone, state: p.zone },
      derived,
    )
    await confirmDetail(tx, p.id, 'address', actor.userId, b.source)
    await tx
      .insertInto('crm.property_changes')
      .values({
        property_id: p.id,
        detail: 'address',
        action: 'changed',
        previous: JSON.stringify(before),
        current: JSON.stringify(next),
        source: b.source,
        reason,
        changed_by: actor.userId,
      })
      .execute()
    // The audit names the change and the reason, never the address itself.
    await ctx.audit({
      target: { type: 'property', id: p.id, version },
      summary: {
        detail: 'address',
        changed: true,
        addressVersion,
        coverage: coverage.outcome,
        zoneStatus: derived.status,
        zoneVersion,
      },
      reason,
    })
    return { body: { id: p.id, version }, version }
  },
})

// TSK-0127 (final owner amendments 2026-10-22; OWN-DEC-179, OWN-DEC-167): a ZIP-only coverage outcome is preliminary
// screening. Staff verify the complete property address and its county for the current address version before any
// visit is confirmed (visits/preconditions.ts; migration 0067 refuses it in the database). The county is compared
// with coverage.area: inside, the confirmation may go ahead; outside, it needs the Owner's exception (TSK-0126). The
// verification is a new row each time; nothing is overwritten. The county is what staff checked against an official
// record of their choice: no geographic source is configured in the software (coverage.verification_source).
const verifyCounty = writeRoute({
  method: 'POST',
  path: '/staff/properties/:propertyId/county-verification',
  operationId: 'verifyPropertyCounty',
  summary: 'Record the verified address and county of a property',
  description:
    'Staff with visit.confirm (Owner, Office). Records that staff checked the complete address of the current ' +
    'address version (addressChecked) and the county it lies in, with an optional note on how. The county is ' +
    'compared with the service area (coverage.area): inArea. A first visit is confirmed only after this, with the ' +
    'county inside the area; a later address change needs a new verification. If-Match is the property version; ' +
    'addressVersion must be the current one (ADDRESS_VERSION_CHANGED). The property version does not change.',
  permission: 'visit.confirm',
  audit: 'property.verify_county',
  expectedVersion: 'required',
  params: PROPERTY_PARAMS,
  body: COUNTY_BODY,
  response: { 200: COUNTY_RESULT },
  handler: async (ctx) => {
    const tx = ctx.tx as Tx
    const actor = staffActor(ctx)
    const p = await lockProperty(tx, ctx)
    expectVersion(ctx, p.version)
    const b = ctx.req.body as { addressVersion: number; state: string; county: string; note?: string | null }
    if (b.addressVersion !== p.addressVersion)
      throw new ApiError('CONFLICT', {
        fieldErrors: [{ field: 'body.addressVersion', code: 'ADDRESS_VERSION_CHANGED', message: '' }],
      })
    const note = (b.note ?? '').trim()
    if (note && (looksLikeAccessCode(note) || looksLikeCardNumber(note)))
      throw invalid('body.note', 'looks_like_access_code')
    const area = requireConfigured((await loadConfig(tx)).get('coverage.area'))
    const state = b.state.trim().toUpperCase()
    const entered = b.county
      .trim()
      .replace(/\s+county$/i, '')
      .trim()
    if (!entered) throw invalid('body.county')
    const match = area.value.counties.find((c) => c.state === state && c.county.toLowerCase() === entered.toLowerCase())
    const county = match?.county ?? entered
    const row = await tx
      .insertInto('crm.property_county_verifications')
      .values({
        property_id: p.id,
        address_version: p.addressVersion,
        state,
        county,
        in_area: match !== undefined,
        area_version: area.version,
        note: note || null,
        verified_by: actor.userId,
      })
      .returning('id')
      .executeTakeFirstOrThrow()
    await ctx.audit({
      target: { type: 'property', id: p.id, version: p.version },
      summary: { addressVersion: p.addressVersion, state, county, inArea: match !== undefined },
    })
    return {
      body: { id: row.id, inArea: match !== undefined, state, county, addressVersion: p.addressVersion },
      version: p.version,
    }
  },
})

const editType = writeRoute({
  method: 'PUT',
  path: '/staff/properties/:propertyId/type',
  operationId: 'editPropertyType',
  summary: 'Change a property’s type',
  description:
    'Staff with customer.edit (Owner; Office with a reason). One of the property types of the request form ' +
    '(FACT-PROPERTY-TYPES), with its source and the required reason. If-Match is the property version.',
  permission: 'customer.edit',
  audit: 'property.edit_type',
  expectedVersion: 'required',
  params: PROPERTY_PARAMS,
  body: TYPE_BODY,
  response: { 200: VERSION_RESULT },
  handler: async (ctx) => {
    const tx = ctx.tx as Tx
    const actor = staffActor(ctx)
    const p = await lockProperty(tx, ctx)
    expectVersion(ctx, p.version)
    const { propertyType, source } = ctx.req.body as { propertyType: string; source: string }
    const reason = reasonOf(ctx)
    if (propertyType === p.propertyType) {
      await ctx.audit({
        target: { type: 'property', id: p.id, version: p.version },
        summary: { detail: 'property_type', changed: false },
      })
      return { body: { id: p.id, version: p.version }, version: p.version }
    }
    const version = await bumpProperty(tx, p, { property_type: propertyType })
    await confirmDetail(tx, p.id, 'property_type', actor.userId, source)
    await tx
      .insertInto('crm.property_changes')
      .values({
        property_id: p.id,
        detail: 'property_type',
        action: 'changed',
        previous: JSON.stringify({ propertyType: p.propertyType }),
        current: JSON.stringify({ propertyType }),
        source,
        reason,
        changed_by: actor.userId,
      })
      .execute()
    await ctx.audit({
      target: { type: 'property', id: p.id, version },
      summary: { detail: 'property_type', changed: true, from: p.propertyType, to: propertyType },
      reason,
    })
    return { body: { id: p.id, version }, version }
  },
})

const verifyZone = writeRoute({
  method: 'PUT',
  path: '/staff/properties/:propertyId/time-zone',
  operationId: 'verifyPropertyTimeZone',
  summary: 'Verify a property’s time zone',
  description:
    'TSK-0123 (OWN-DEC-159, HH-SCH-02): staff with customer.edit (Owner; Office with a reason) record the property’s ' +
    'IANA zone from the county of its verified address. The zone must be an Eastern or Central zone (read from the ' +
    'time-zone data, never a fixed offset): ZONE_NOT_SUPPORTED otherwise; when the configured county list ' +
    '(geo.county_time_zones) names the county with another zone, ZONE_COUNTY_MISMATCH. The zone history keeps every ' +
    'earlier state; the staff queue flag of an unknown zone resolves. Visits already planned keep the zone they were ' +
    'planned in. If-Match is the property version.',
  permission: 'customer.edit',
  audit: 'property.verify_time_zone',
  expectedVersion: 'required',
  params: PROPERTY_PARAMS,
  body: ZONE_BODY,
  response: { 200: VERSION_RESULT },
  handler: async (ctx) => {
    const tx = ctx.tx as Tx
    const actor = staffActor(ctx)
    const p = await lockProperty(tx, ctx)
    expectVersion(ctx, p.version)
    const b = ctx.req.body as { timeZone: string; county: string }
    const reason = reasonOf(ctx)
    const county = b.county.trim().replace(/ County$/i, '')
    const config = await loadConfig(tx)
    const problems = verificationProblems({ zone: b.timeZone, state: p.state, county }, countyZones(config))
    if (problems.length)
      throw new ApiError('VALIDATION_FAILED', {
        fieldErrors: problems.map((code) => ({
          field: code === 'COUNTY_REQUIRED' ? 'body.county' : 'body.timeZone',
          code,
          message: '',
        })),
      })
    const next = {
      zone: b.timeZone,
      status: 'verified' as const,
      basis: 'verified_county',
      counties: [countyRef(p.state, county)],
    }
    const before = p.zone
    const zoneVersion = await recordPropertyZone(
      tx,
      { id: p.id, zoneVersion: p.zoneVersion, zone: p.zone.zone, state: p.zone },
      { ...next, reason, recordedBy: actor.userId },
    )
    if (zoneVersion === p.zoneVersion) {
      await ctx.audit({
        target: { type: 'property', id: p.id, version: p.version },
        summary: { detail: 'time_zone', changed: false },
      })
      return { body: { id: p.id, version: p.version }, version: p.version }
    }
    const version = await bumpProperty(tx, p)
    await ctx.audit({
      target: { type: 'property', id: p.id, version },
      summary: {
        detail: 'time_zone',
        changed: true,
        from: { zone: before.zone, status: before.status },
        to: { zone: next.zone, status: next.status },
        counties: next.counties,
        zoneVersion,
      },
      reason,
    })
    return { body: { id: p.id, version }, version }
  },
})

const editDetail = writeRoute({
  method: 'PUT',
  path: '/staff/properties/:propertyId/details/:detail',
  operationId: 'editPropertyDetail',
  summary: 'Record or clear a property detail',
  description:
    'Staff with customer.edit (Owner; Office with a reason). The site contact and their authority, access windows, ' +
    'non-secret access instructions, parking and loading, occupants and pets, restricted areas, power and water ' +
    'access, customer preparation or known site flags, with its source and the required reason; null clears it ' +
    '(the history keeps it). Text that looks like an access code or a card number is refused: codes belong in the ' +
    'protected store. If-Match is the property version.',
  permission: 'customer.edit',
  audit: 'property.edit_detail',
  expectedVersion: 'required',
  params: DETAIL_PARAMS,
  body: DETAIL_BODY,
  response: { 200: VERSION_RESULT },
  handler: async (ctx) => {
    const tx = ctx.tx as Tx
    const actor = staffActor(ctx)
    const detail = params(ctx).detail as PropertyTextDetail
    const p = await lockProperty(tx, ctx)
    expectVersion(ctx, p.version)
    const b = ctx.req.body as { value: string | null; source: string }
    const reason = reasonOf(ctx)
    const value = b.value === null || b.value.trim() === '' ? null : b.value.trim()
    if (value !== null && looksLikeAccessCode(value)) throw invalid('body.value', 'looks_like_access_code')
    if (value !== null && looksLikeCardNumber(value)) throw invalid('body.value', 'sensitive_content')
    const existing = await tx
      .selectFrom('crm.property_details')
      .select('value')
      .where('property_id', '=', p.id)
      .where('detail', '=', detail)
      .executeTakeFirst()
    const previous = existing?.value ?? null
    if (value === previous) {
      await ctx.audit({
        target: { type: 'property', id: p.id, version: p.version },
        summary: { detail, changed: false },
      })
      return { body: { id: p.id, version: p.version }, version: p.version }
    }
    const action = value === null ? 'cleared' : 'changed'
    const version = await bumpProperty(tx, p)
    await confirmDetail(tx, p.id, detail, actor.userId, b.source, { value })
    await tx
      .insertInto('crm.property_changes')
      .values({
        property_id: p.id,
        detail,
        action,
        previous: JSON.stringify(previous === null ? {} : { value: previous }),
        current: JSON.stringify(value === null ? {} : { value }),
        source: b.source,
        reason,
        changed_by: actor.userId,
      })
      .execute()
    await ctx.audit({
      target: { type: 'property', id: p.id, version },
      summary: { detail, changed: true, action },
      reason,
    })
    return { body: { id: p.id, version }, version }
  },
})

const confirmDetailRoute = writeRoute({
  method: 'POST',
  path: '/staff/properties/:propertyId/details/:detail/confirm',
  operationId: 'confirmPropertyDetail',
  summary: 'Confirm a property detail is still right',
  description:
    'Staff with customer.edit (Owner; Office with a reason). Records that the address, the type or a recorded ' +
    'detail was confirmed unchanged now, with its source and the required reason (DETAIL_NOT_RECORDED for a detail ' +
    'that holds nothing). If-Match is the property version.',
  permission: 'customer.edit',
  audit: 'property.confirm_detail',
  expectedVersion: 'required',
  params: CONFIRM_PARAMS,
  body: CONFIRM_BODY,
  response: { 200: VERSION_RESULT },
  handler: async (ctx) => {
    const tx = ctx.tx as Tx
    const actor = staffActor(ctx)
    const detail = params(ctx).detail as string
    const p = await lockProperty(tx, ctx)
    expectVersion(ctx, p.version)
    const { source } = ctx.req.body as { source: string }
    const reason = reasonOf(ctx)
    const row = await tx
      .selectFrom('crm.property_details')
      .select('value')
      .where('property_id', '=', p.id)
      .where('detail', '=', detail)
      .executeTakeFirst()
    const structured = detail === 'address' || detail === 'property_type'
    if (!row || (!structured && row.value === null)) throw conflict('DETAIL_NOT_RECORDED')
    const version = await bumpProperty(tx, p)
    await confirmDetail(tx, p.id, detail, actor.userId, source)
    await tx
      .insertInto('crm.property_changes')
      .values({
        property_id: p.id,
        detail,
        action: 'confirmed',
        previous: '{}',
        current: '{}',
        source,
        reason,
        changed_by: actor.userId,
      })
      .execute()
    await ctx.audit({ target: { type: 'property', id: p.id, version }, summary: { detail, source }, reason })
    return { body: { id: p.id, version }, version }
  },
})

type LockedCode = { id: string; propertyId: string; kind: string; label: string | null; version: number }

async function lockCode(tx: Tx, ctx: ApiContext): Promise<LockedCode> {
  const p = await lockProperty(tx, ctx)
  const codeId = params(ctx).codeId ?? ''
  if (!UUID_RE.test(codeId)) throw new ApiError('NOT_FOUND')
  // Metadata only: the sealed value is selected by the reveal alone.
  const row = await tx
    .selectFrom('crm.access_instruction_secrets')
    .select(['id', 'property_id', 'kind', 'label', 'version', 'removed_at'])
    .where('id', '=', codeId)
    .where('property_id', '=', p.id)
    .forUpdate()
    .executeTakeFirst()
  if (!row) throw new ApiError('NOT_FOUND')
  if (row.removed_at !== null) throw conflict('ACCESS_CODE_REMOVED')
  return { id: row.id, propertyId: row.property_id, kind: row.kind, label: row.label, version: row.version }
}

/** A code value as stored: trimmed; refused when its label or reason would repeat it. */
function codeValue(ctx: ApiContext): string {
  return (ctx.req.body as { value: string }).value.trim()
}

function labelOf(ctx: ApiContext, value: string): string | null {
  const label = ((ctx.req.body as { label?: string | null }).label ?? '').trim()
  if (label === '') return null
  if (looksLikeAccessCode(label) || label.includes(value)) throw invalid('body.label', 'looks_like_access_code')
  return label
}

const addCode = (deps: PropertiesDeps) =>
  writeRoute({
    method: 'POST',
    path: '/staff/properties/:propertyId/access-codes',
    operationId: 'addAccessCode',
    summary: 'Enter an access code',
    description:
      'Staff with access_code.set (Owner, Office). Stores a gate, lockbox, alarm or door code or a key location in ' +
      'the protected store, sealed; it is masked everywhere and opened only by the audited reveal. A label is a ' +
      'short non-secret name; a label or reason that repeats the code is refused. No idempotency key: the request ' +
      'hash would be a stored digest of the code. NOT_CONFIGURED while ACCESS_CODE_ENCRYPTION_KEY is unset.',
    permission: 'access_code.set',
    audit: 'access_code.set',
    expectedVersion: 'none',
    idempotency: 'none',
    params: PROPERTY_PARAMS,
    body: CODE_BODY,
    response: { 201: CODE_CREATED },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const key = requireKey(deps)
      const p = await lockProperty(tx, ctx)
      const b = ctx.req.body as { kind: string; source: string }
      const value = codeValue(ctx)
      const label = labelOf(ctx, value)
      const reason = reasonOf(ctx, value)
      const id = randomUUID()
      const row = await tx
        .insertInto('crm.access_instruction_secrets')
        .values({
          id,
          property_id: p.id,
          kind: b.kind,
          label,
          sealed_value: sealAccessCode(key, id, value),
          source: b.source,
          confirmed_by: actor.userId,
          created_by: actor.userId,
        })
        .returning(['created_at', 'version'])
        .executeTakeFirstOrThrow()
      await ctx.audit({
        target: { type: 'access_code', id, version: row.version },
        summary: { propertyId: p.id, kind: b.kind, operation: 'entered', source: b.source },
        reason,
      })
      return { status: 201, body: { id, version: row.version, createdAt: row.created_at.toISOString() } }
    },
  })

const replaceCode = (deps: PropertiesDeps) =>
  writeRoute({
    method: 'PUT',
    path: '/staff/properties/:propertyId/access-codes/:codeId',
    operationId: 'replaceAccessCode',
    summary: 'Replace an access code’s value',
    description:
      'Staff with access_code.set (Owner, Office). Seals the new value in place of the old one, which is erased, ' +
      'with its source and the required reason (never repeating the code). If-Match is the code version; a removed ' +
      'code is not changed (ACCESS_CODE_REMOVED). No idempotency key (the body holds the code). NOT_CONFIGURED ' +
      'while ACCESS_CODE_ENCRYPTION_KEY is unset.',
    permission: 'access_code.set',
    audit: 'access_code.set',
    expectedVersion: 'required',
    idempotency: 'none',
    params: CODE_PARAMS,
    body: CODE_REPLACE_BODY,
    response: { 200: VERSION_RESULT },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const key = requireKey(deps)
      const c = await lockCode(tx, ctx)
      expectVersion(ctx, c.version)
      const { source } = ctx.req.body as { source: string }
      const value = codeValue(ctx)
      if (c.label !== null && c.label.includes(value)) throw invalid('body.value', 'looks_like_access_code')
      const reason = reasonOf(ctx, value)
      const version = c.version + 1
      await tx
        .updateTable('crm.access_instruction_secrets')
        .set({
          sealed_value: sealAccessCode(key, c.id, value),
          source,
          confirmed_at: sql<Date>`now()`,
          confirmed_by: actor.userId,
          version,
        })
        .where('id', '=', c.id)
        .execute()
      await ctx.audit({
        target: { type: 'access_code', id: c.id, version },
        summary: { propertyId: c.propertyId, kind: c.kind, operation: 'replaced', source },
        reason,
      })
      return { body: { id: c.id, version }, version }
    },
  })

const confirmCode = writeRoute({
  method: 'POST',
  path: '/staff/properties/:propertyId/access-codes/:codeId/confirm',
  operationId: 'confirmAccessCode',
  summary: 'Confirm an access code is still right',
  description:
    'Staff with access_code.set (Owner, Office). Records that the code was confirmed unchanged now, with its source ' +
    'and the required reason; the value is neither read nor changed. If-Match is the code version.',
  permission: 'access_code.set',
  audit: 'access_code.confirm',
  expectedVersion: 'required',
  params: CODE_PARAMS,
  body: CONFIRM_BODY,
  response: { 200: VERSION_RESULT },
  handler: async (ctx) => {
    const tx = ctx.tx as Tx
    const actor = staffActor(ctx)
    const c = await lockCode(tx, ctx)
    expectVersion(ctx, c.version)
    const { source } = ctx.req.body as { source: string }
    const reason = reasonOf(ctx)
    const version = c.version + 1
    await tx
      .updateTable('crm.access_instruction_secrets')
      .set({ source, confirmed_at: sql<Date>`now()`, confirmed_by: actor.userId, version })
      .where('id', '=', c.id)
      .execute()
    await ctx.audit({
      target: { type: 'access_code', id: c.id, version },
      summary: { propertyId: c.propertyId, kind: c.kind, source },
      reason,
    })
    return { body: { id: c.id, version }, version }
  },
})

const removeCode = writeRoute({
  method: 'POST',
  path: '/staff/properties/:propertyId/access-codes/:codeId/remove',
  operationId: 'removeAccessCode',
  summary: 'Remove an access code',
  description:
    'Staff with access_code.set (Owner, Office). For a code no longer needed for authorized access ' +
    '(FACT-RETENTION-SCHEDULE): the sealed value is erased at once and the code can no longer be revealed; the ' +
    'record that it existed, who entered and who removed it, and the required reason are kept. Works while the ' +
    'store is NOT CONFIGURED. If-Match is the code version.',
  permission: 'access_code.set',
  audit: 'access_code.remove',
  expectedVersion: 'required',
  params: CODE_PARAMS,
  body: CODE_REMOVE_BODY,
  response: { 200: VERSION_RESULT },
  handler: async (ctx) => {
    const tx = ctx.tx as Tx
    const actor = staffActor(ctx)
    const c = await lockCode(tx, ctx)
    expectVersion(ctx, c.version)
    const reason = reasonOf(ctx)
    const version = c.version + 1
    await tx
      .updateTable('crm.access_instruction_secrets')
      .set({
        sealed_value: null,
        removed_at: sql<Date>`now()`,
        removed_by: actor.userId,
        removal_reason: reason,
        version,
      })
      .where('id', '=', c.id)
      .execute()
    await ctx.audit({
      target: { type: 'access_code', id: c.id, version },
      summary: { propertyId: c.propertyId, kind: c.kind },
      reason,
    })
    return { body: { id: c.id, version }, version }
  },
})

const revealCode = (deps: PropertiesDeps) =>
  writeRoute({
    method: 'POST',
    path: '/staff/properties/:propertyId/access-codes/:codeId/reveal',
    operationId: 'revealAccessCode',
    summary: 'Reveal an access code',
    description:
      'Staff with access_code.reveal: the Owner; Office (PROPOSED cell); a worker only when assigned to a visit at ' +
      'the property (an active confirmed reservation on a live visit there, TSK-0069), on the visit date (business ' +
      'time zone), online (T28); every other worker is refused. Returns the value once, with when the staff app ' +
      'hides it again; the reveal is recorded and audited (who, when, which code; never the value). The response is never cached, never kept for ' +
      'idempotency and never logged. A removed code is not found. NOT_CONFIGURED while ' +
      'ACCESS_CODE_ENCRYPTION_KEY is unset. PROPOSED limit: 30 reveals per staff member per hour.',
    permission: 'access_code.reveal',
    audit: 'access_code.reveal',
    expectedVersion: 'none',
    idempotency: 'none',
    rateLimit: REVEAL_RATE,
    businessDate: true,
    resource: revealFacts,
    params: CODE_PARAMS,
    body: EMPTY_BODY,
    response: { 200: REVEALED },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const key = requireKey(deps)
      const { propertyId, codeId } = params(ctx)
      const row = await tx
        .selectFrom('crm.access_instruction_secrets as s')
        .select(['s.id', 's.property_id', 's.kind', 's.label', 's.sealed_value'])
        .where('s.id', '=', codeId as string)
        .where('s.property_id', '=', propertyId)
        .where('s.removed_at', 'is', null)
        .where(propertyInScope('s.property_id', ctx.scope))
        .executeTakeFirst()
      if (!row?.sealed_value) throw new ApiError('NOT_FOUND')
      let value: string
      try {
        value = openAccessCode(key, row.id, row.sealed_value)
      } catch {
        // Sealed under another key (a key change without re-entering the codes): said so, never guessed. Audited.
        await ctx.auditAlways({
          target: { type: 'access_code', id: row.id },
          summary: { propertyId: row.property_id, kind: row.kind },
          result: 'failed',
          reason: 'unreadable',
        })
        throw conflict('ACCESS_CODE_UNREADABLE')
      }
      const revealed = await tx
        .insertInto('crm.access_code_reveals')
        .values({
          secret_id: row.id,
          property_id: row.property_id,
          staff_id: actor.userId,
          roles: [...actor.roles],
          request_id: correlation(ctx),
        })
        .returning('revealed_at')
        .executeTakeFirstOrThrow()
      await ctx.audit({
        target: { type: 'access_code', id: row.id },
        summary: { propertyId: row.property_id, kind: row.kind },
      })
      const at = revealed.revealed_at
      return {
        body: {
          id: row.id,
          kind: row.kind,
          label: row.label,
          value,
          revealedAt: at.toISOString(),
          hideAt: new Date(at.getTime() + REVEAL_DISPLAY_SECONDS * 1000).toISOString(),
        },
        headers: { 'cache-control': 'no-store', pragma: 'no-cache' },
      }
    },
  })

export function propertiesRoutes(deps: PropertiesDeps): RouteDef[] {
  return [
    detailRoute(deps),
    editAddress,
    verifyCounty,
    editType,
    verifyZone,
    editDetail,
    confirmDetailRoute,
    addCode(deps),
    replaceCode(deps),
    confirmCode,
    removeCode,
    revealCode(deps),
  ]
}

export function propertiesModule(deps: PropertiesDeps): ApiModule {
  return { name: 'properties', routes: propertiesRoutes(deps) }
}
