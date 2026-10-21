// Customer projections (TSK-0037; HH-ARC-04, HH-PORT-01, HH-DATA-07, T24). The server builds what a customer receives
// from an explicit view per entity: an allow-list of customer-facing fields, each read from the record by name. A
// field that no view lists is internal: it is never copied into a customer response, and the route's response schema
// (the same allow-list, additionalProperties false) strips anything else before it leaves the server. Customer
// surface routes name the view they answer with (RouteDef.projection); a unit test holds every route to it.
//
// Entities with no customer view below are internal as a whole until a task declares one from its requirement: the
// project access grant itself (its nonce, token hash, contact and revocation are never sent; a customer only learns
// the reference of the project it opens), customer and account records, documents, invoices and cases. TSK-0044:
// contacts, notes (every class: notes are never customer-shared) and candidate matches have no customer view either.
import type { JsonSchema } from '../../api/route.js'

/** The entities of TSK-0037 and TSK-0044 (ENT-*). */
export const ENTITIES = [
  'Project',
  'ProjectAccessGrant',
  'Photo',
  'Customer',
  'CustomerAccount',
  'Document',
  'Invoice',
  'Case',
  'Contact',
  'Note',
  'CandidateMatch',
] as const
export type Entity = (typeof ENTITIES)[number]

type Fields = Readonly<Record<string, JsonSchema>>

export type CustomerView<R, F extends Fields = Fields> = {
  readonly name: string
  readonly entity: Entity
  readonly fields: F
  /** The response schema: exactly the allow-listed fields, all required, nothing else. */
  readonly schema: JsonSchema
  /** The customer projection of one record: a new object with only the allow-listed fields. */
  project(record: R): { [K in keyof F]: unknown }
}

/**
 * Field names that never reach a customer (HH-ARC-04's list): internal notes and messages, access secrets and codes,
 * costs and margins, staff and employee details, restricted incident and case details, storage keys and hashes,
 * internal handling (qualification, spam signals, responsibility) and the visibility bookkeeping itself.
 */
export const CUSTOMER_FORBIDDEN_FIELDS: readonly RegExp[] = [
  /internal/i,
  /cost/i,
  /margin/i,
  /staff/i,
  /employee/i,
  /access_?code/i,
  /gate_?code|lockbox/i,
  /secret/i,
  /token/i,
  /hash/i,
  /nonce/i,
  /object_?key|storage_?key/i,
  /restricted/i,
  /incident/i,
  /responsible/i,
  /spam/i,
  /qualif/i,
  /(decided|created|reviewed|revoked)_?by/i,
  /uploader/i,
  /visibility/i,
]

export const forbiddenForCustomer = (field: string): boolean => CUSTOMER_FORBIDDEN_FIELDS.some((p) => p.test(field))

export class ProjectionError extends Error {
  override name = 'ProjectionError'
}

export function customerView<R, F extends Fields>(
  name: string,
  entity: Entity,
  fields: F,
  read: (record: R) => { [K in keyof F]: unknown },
): CustomerView<R, F> {
  const keys = Object.keys(fields)
  const refused = keys.filter(forbiddenForCustomer)
  if (refused.length) throw new ProjectionError(`${name}: internal fields in a customer view: ${refused.join(', ')}`)
  return {
    name,
    entity,
    fields,
    schema: { type: 'object', additionalProperties: false, required: keys, properties: fields },
    project(record) {
      const all = read(record) as Record<string, unknown>
      const out: Record<string, unknown> = {}
      for (const k of keys) out[k] = all[k]
      return out as { [K in keyof F]: unknown }
    },
  }
}

/** A response holding a list of one view under `key` (for example `{ projects: [...] }`). */
export function listOf(key: string, view: CustomerView<never>): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required: [key],
    properties: { [key]: { type: 'array', items: view.schema } },
  }
}

const STRING = { type: 'string' } as const

/** A project by its customer-facing reference only (never its database ID). */
export const PROJECT_REFERENCE = customerView(
  'project.reference',
  'Project',
  { reference: STRING },
  (p: { reference: string }) => ({ reference: p.reference }),
)

/** The opened project at a glance: the customer's own submission (TSK-0034). */
export const PROJECT_GLANCE = customerView(
  'project.glance',
  'Project',
  {
    reference: STRING,
    submittedAt: STRING,
    requestState: STRING,
    services: { type: 'array', items: STRING },
    notSure: { type: 'boolean' },
  },
  (p: { reference: string; submittedAt: Date; requestState: string; services: string[]; notSure: boolean }) => ({
    reference: p.reference,
    submittedAt: p.submittedAt.toISOString(),
    requestState: p.requestState,
    services: p.services,
    notSure: p.notSure,
  }),
)

/** A photo the customer may see (their own upload, or one staff shared): its state and a short-lived URL. */
export const CUSTOMER_PHOTO = customerView(
  'photo.customer',
  'Photo',
  {
    id: STRING,
    state: { type: 'string', enum: ['quarantined', 'ready', 'rejected'] },
    contentType: STRING,
    byteSize: { type: 'integer' },
    rejectionReason: { type: ['string', 'null'] },
    url: { type: ['string', 'null'] },
  },
  (p: {
    id: string
    state: string
    contentType: string
    byteSize: number
    rejectionReason: string | null
    url: string | null
  }) => ({
    id: p.id,
    state: p.state,
    contentType: p.contentType,
    byteSize: p.byteSize,
    rejectionReason: p.rejectionReason,
    url: p.url,
  }),
)

/** Every customer view, by name. */
export const CUSTOMER_VIEWS: ReadonlyMap<string, CustomerView<never>> = new Map(
  [PROJECT_REFERENCE, PROJECT_GLANCE, CUSTOMER_PHOTO].map((v) => [v.name, v as CustomerView<never>]),
)
