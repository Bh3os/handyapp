// Customer projections (TSK-0037; HH-ARC-04, HH-PORT-01, HH-DATA-07, T24). The server builds what a customer receives
// from an explicit view per entity: an allow-list of customer-facing fields, each read from the record by name. A
// field that no view lists is internal: it is never copied into a customer response, and the route's response schema
// (the same allow-list, additionalProperties false) strips anything else before it leaves the server. Customer
// surface routes name the view they answer with (RouteDef.projection); a unit test holds every route to it.
//
// Entities with no customer view below are internal as a whole until a task declares one from its requirement: the
// project access grant itself (its nonce, token hash, contact and revocation are never sent; a customer only learns
// the reference of the project it opens), customer records, documents, invoices and cases. TSK-0036 declares the
// signed-in account's own view (masked sign-in values and linked project references) and its code notices. (The
// workspace tabs of TSK-0039 name Document and Invoice only for their "none yet" states; no record field is sent.)
import {
  CUSTOMER_NEXT_ACTIONS,
  CUSTOMER_SITUATIONS,
  CUSTOMER_STEPS,
  CUSTOMER_TIMELINE_KINDS,
  WAITING_ON,
  type CustomerStatus,
} from '@handyhub/domain'
import type { JsonSchema } from '../../api/route.js'
import { DISPOSITIONS, PLAN_CATEGORIES, RETAIN_REASONS } from '../privacy/plan.js'

/** The entities of TSK-0037 (ENT-*). */
export const ENTITIES = [
  'Project',
  'ProjectAccessGrant',
  'Photo',
  'Customer',
  'CustomerAccount',
  'Document',
  'Invoice',
  'Case',
  // TSK-0056: the customer's estimate view and their responses to it.
  'EstimateVersion',
  // TSK-0057: the customer's approval of one exact version.
  'Approval',
  // TSK-0100: the customer's own privacy requests and their data export.
  'PrivacyRequest',
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

// The project workspace frame (TSK-0038; HH-PORT-02, HH-PORT-03, HH-PORT-06, HH-ARC-10). Codes only: the portal
// holds the English words. Customer text is limited to what staff wrote for the customer (the site-visit explanation,
// OWN-DEC-99) and the Not a Fit decision in the owner's wording (OWN-DEC-100).
const DATE = { type: 'string', format: 'date-time' } as const
const enumOf = (values: readonly string[]) => ({ type: 'string', enum: [...values] }) as const
const object = (fields: Fields): JsonSchema => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(fields),
  properties: fields,
})
const STATUS_FIELDS = {
  situation: enumOf(CUSTOMER_SITUATIONS),
  step: enumOf(CUSTOMER_STEPS),
  waitingOn: enumOf(WAITING_ON),
  nextAction: enumOf(CUSTOMER_NEXT_ACTIONS),
  since: DATE,
} as const
type StatusRecord = CustomerStatus & { since: Date }
const status = (s: StatusRecord) => ({
  situation: s.situation,
  step: s.step,
  waitingOn: s.waitingOn,
  nextAction: s.nextAction,
  since: s.since.toISOString(),
})

/** One project of the caller's scope in the projects list: reference, services and status (TSK-0038). */
export const PROJECT_SUMMARY = customerView(
  'project.summary',
  'Project',
  {
    reference: STRING,
    services: { type: 'array', items: STRING },
    notSure: { type: 'boolean' },
    submittedAt: DATE,
    status: object(STATUS_FIELDS),
  },
  (p: { reference: string; services: string[]; notSure: boolean; submittedAt: Date; status: StatusRecord }) => ({
    reference: p.reference,
    services: [...p.services],
    notSure: p.notSure,
    submittedAt: p.submittedAt.toISOString(),
    status: status(p.status),
  }),
)

/** The projects list (/portal): every project of the caller's scope, and when to refresh it (HH-ARC-10). */
export const PROJECT_LIST = customerView(
  'project.list',
  'Project',
  {
    projects: { type: 'array', items: PROJECT_SUMMARY.schema },
    refreshedAt: DATE,
    refreshSeconds: { type: 'integer', minimum: 0 },
  },
  (l: { projects: Parameters<typeof PROJECT_SUMMARY.project>[0][]; refreshedAt: Date; refreshSeconds: number }) => ({
    projects: l.projects.map((p) => PROJECT_SUMMARY.project(p)),
    refreshedAt: l.refreshedAt.toISOString(),
    refreshSeconds: l.refreshSeconds,
  }),
)

const TIMELINE_ENTRY = object({
  kind: enumOf(CUSTOMER_TIMELINE_KINDS),
  at: DATE,
  text: { type: ['string', 'null'] },
})
type TimelineRecord = { kind: string; at: Date; text: string | null }
const entry = (e: TimelineRecord) => ({ kind: e.kind, at: e.at.toISOString(), text: e.text })

/** The project Overview (TSK-0038): status, one next action, the filtered timeline, appointment and payment summary. */
export const PROJECT_OVERVIEW = customerView(
  'project.overview',
  'Project',
  {
    reference: STRING,
    services: { type: 'array', items: STRING },
    notSure: { type: 'boolean' },
    submittedAt: DATE,
    status: object({ ...STATUS_FIELDS, text: { type: ['string', 'null'] } }),
    timeline: { type: 'array', items: TIMELINE_ENTRY },
    // Nothing is confirmed until visits exist (TSK-0061); the slot is explicit so "none" is never a guess.
    appointment: { type: 'null' },
    // Shown beside the status, never merged into it (HH-PORT-03): no estimate, deposit or invoice exists yet.
    payment: object({ state: enumOf(['none']) }),
    refreshedAt: DATE,
    refreshSeconds: { type: 'integer', minimum: 0 },
  },
  (o: {
    reference: string
    services: string[]
    notSure: boolean
    submittedAt: Date
    status: StatusRecord & { text: string | null }
    timeline: TimelineRecord[]
    appointment: null
    payment: { state: 'none' }
    refreshedAt: Date
    refreshSeconds: number
  }) => ({
    reference: o.reference,
    services: [...o.services],
    notSure: o.notSure,
    submittedAt: o.submittedAt.toISOString(),
    status: { ...status(o.status), text: o.status.text },
    timeline: o.timeline.map(entry),
    appointment: null,
    payment: { state: o.payment.state },
    refreshedAt: o.refreshedAt.toISOString(),
    refreshSeconds: o.refreshSeconds,
  }),
)

// The workspace tabs (TSK-0039; HH-PORT-09, OWN-DEC-106). Each tab answers with its own view: the project reference,
// what the tab holds as the records stand, the server time of the read and the refresh interval. A tab whose records
// later tasks build says so with an explicit state code, so an empty section is never a guess:
// - messages 'not_shown': the project conversation is not shown in the portal yet (TSK-0050, TSK-0051); messages that
//   exist are never claimed absent;
// - documents, appointments, payments 'none': no customer document, visit or payment record exists for any project
//   yet (estimates TSK-0054/0058, visits TSK-0061, payments TSK-0087), so there is truthfully nothing to show;
// - photos: the counts of the customer-visible photos by state (received, processing, failed); viewing them in the
//   portal comes with TSK-0076, so no photo, URL or ID is sent.
type TabRecord = { reference: string; refreshedAt: Date; refreshSeconds: number }
const TAB_FIELDS = { reference: STRING, refreshedAt: DATE, refreshSeconds: { type: 'integer', minimum: 0 } } as const
const tabHead = (r: TabRecord) => ({
  reference: r.reference,
  refreshedAt: r.refreshedAt.toISOString(),
  refreshSeconds: r.refreshSeconds,
})
function tabView<S extends string>(name: string, entity: Entity, states: readonly S[]) {
  return customerView(name, entity, { ...TAB_FIELDS, state: enumOf(states) }, (r: TabRecord & { state: S }) => ({
    ...tabHead(r),
    state: r.state,
  }))
}

/** The Messages tab: the conversation is not shown in the portal yet (TSK-0050). */
export const PROJECT_MESSAGES = tabView('project.messages', 'Project', ['not_shown'] as const)
/**
 * The Documents tab (TSK-0039; TSK-0056, HH-PORT-10): "none" while the project has no customer document, or "listed"
 * with the estimate versions the customer received, newest first, each with its status (current, approved, declined,
 * expired, superseded, withdrawn), its dates and its stored total in integer cents. The list is present only when
 * listed. Receipts, invoices, change orders and care notes come with their own tasks.
 */
export const CUSTOMER_VERSION_STATUSES = [
  'current',
  'approved',
  'declined',
  'expired',
  'superseded',
  'withdrawn',
] as const
const CENTS = { type: 'integer' } as const
const NULLABLE_CENTS = { type: ['integer', 'null'] } as const
const NULLABLE_STRING = { type: ['string', 'null'] } as const
const NULLABLE_DATE = { type: ['string', 'null'], format: 'date-time' } as const
const STRINGS = { type: 'array', items: STRING } as const
const ESTIMATE_LIST_ITEM = object({
  number: STRING,
  version: { type: 'integer', minimum: 1 },
  status: enumOf(CUSTOMER_VERSION_STATUSES),
  publishedAt: DATE,
  validUntil: NULLABLE_DATE,
  totalCents: CENTS,
})
type EstimateListRecord = {
  number: string
  version: number
  status: string
  publishedAt: Date
  validUntil: Date | null
  totalCents: number
}
const listedView = customerView(
  'project.documents',
  'Document',
  { ...TAB_FIELDS, state: enumOf(['none', 'listed']), estimates: { type: 'array', items: ESTIMATE_LIST_ITEM } },
  (r: TabRecord & ({ state: 'none' } | { state: 'listed'; estimates: EstimateListRecord[] })) => ({
    ...tabHead(r),
    state: r.state,
    estimates:
      r.state === 'listed'
        ? r.estimates.map((e) => ({
            number: e.number,
            version: e.version,
            status: e.status,
            publishedAt: e.publishedAt.toISOString(),
            validUntil: e.validUntil ? e.validUntil.toISOString() : null,
            totalCents: e.totalCents,
          }))
        : undefined,
  }),
)
export const PROJECT_DOCUMENTS: typeof listedView = {
  ...listedView,
  // The list is sent only with the "listed" state; "none" is the state alone, as before (TSK-0039).
  schema: { ...listedView.schema, required: Object.keys(TAB_FIELDS).concat('state') },
}
/** The Appointments tab: no visit exists yet (TSK-0061). */
export const PROJECT_APPOINTMENTS = tabView('project.appointments', 'Project', ['none'] as const)
/** The Payments tab: no estimate total, deposit, invoice or recorded payment exists yet (TSK-0087). */
export const PROJECT_PAYMENTS = tabView('project.payments', 'Invoice', ['none'] as const)

const COUNT = { type: 'integer', minimum: 0 } as const
export type PhotoCounts = { received: number; processing: number; failed: number }
/** The Photos tab: how many customer-visible photos the project has, by state; never a photo, URL or ID. */
export const PROJECT_PHOTOS = customerView(
  'project.photos',
  'Photo',
  { ...TAB_FIELDS, photos: object({ received: COUNT, processing: COUNT, failed: COUNT }) },
  (r: TabRecord & { photos: PhotoCounts }) => ({
    ...tabHead(r),
    photos: { received: r.photos.received, processing: r.photos.processing, failed: r.photos.failed },
  }),
)

// Optional customer accounts (TSK-0036; HH-ID-10, HH-ID-11, HH-ID-03, ENT-CustomerAccount). The account a session
// signed in to, as its owner sees it: the sign-in values masked, the references of its linked projects (read from the
// active links on every request) and two flags. No account ID, contact ID, link, code or unmasked value.
const CHANNEL = enumOf(['email', 'phone'])
type AccountRecord = {
  email: string | null
  phone: string | null
  projects: readonly { reference: string }[]
  freshVerification: boolean
  emailChange: 'available' | 'not_configured'
}

/** The signed-in account (GET /customer/account). */
export const CUSTOMER_ACCOUNT = customerView(
  'account.customer',
  'CustomerAccount',
  {
    email: { type: ['string', 'null'] },
    phone: { type: ['string', 'null'] },
    projects: { type: 'array', items: PROJECT_REFERENCE.schema },
    freshVerification: { type: 'boolean' },
    emailChange: enumOf(['available', 'not_configured']),
  },
  (a: AccountRecord) => ({
    email: a.email,
    phone: a.phone,
    projects: a.projects.map((p) => PROJECT_REFERENCE.project(p)),
    freshVerification: a.freshVerification,
    emailChange: a.emailChange,
  }),
)

/** The account after an enrollment, a sign-in or a sign-in email change. */
export const ACCOUNT_SIGNED_IN = customerView(
  'account.signed_in',
  'CustomerAccount',
  { account: CUSTOMER_ACCOUNT.schema },
  (r: { account: AccountRecord | null }) => ({ account: r.account ? CUSTOMER_ACCOUNT.project(r.account) : null }),
)

/** A one-time code went out: its channel, the masked destination and when it expires. */
export const ACCOUNT_CODE_SENT = customerView(
  'account.code_sent',
  'CustomerAccount',
  { sent: object({ channel: CHANNEL, destination: STRING, expiresAt: STRING }) },
  (r: { sent: { channel: 'email' | 'phone'; destination: string; expiresAt: Date } }) => ({
    sent: { channel: r.sent.channel, destination: r.sent.destination, expiresAt: r.sent.expiresAt.toISOString() },
  }),
)

/** A verified channel an account can be created with from a guest link (masked). */
export const ENROLLMENT_CHANNEL = customerView(
  'account.enrollment_channel',
  'Customer',
  { channel: CHANNEL, destination: STRING },
  (c: { channel: 'email' | 'phone'; destination: string }) => ({ channel: c.channel, destination: c.destination }),
)

// The customer estimate view (TSK-0056; HH-EST-06, HH-EST-09, HH-EST-13, HH-PORT-10, OWN-DEC-103). The customer-facing
// content of one version as published: the lines, texts and totals in integer cents exactly as stored, the business
// name, the payment term code, the terms the version pinned (by document ID and state; the portal holds the wording),
// why approval is not available here and the version to review instead, the responses the customer may give now, and
// their own earlier responses with their words. Never an internal cost, note, preparer, staff field or storage key.
const LINE = object({
  // TSK-0057: the line's position on the version, which names an option the customer selects.
  position: { type: 'integer', minimum: 1 },
  kind: enumOf(['base', 'alternate', 'add_on']),
  serviceCode: NULLABLE_STRING,
  description: NULLABLE_STRING,
  quantity: NULLABLE_STRING,
  unit: NULLABLE_STRING,
  unitPriceCents: NULLABLE_CENTS,
  amountCents: NULLABLE_CENTS,
})
const RESPONSE = object({
  kind: enumOf(['changes_requested', 'declined', 'update_requested']),
  version: { type: 'integer', minimum: 1 },
  at: DATE,
  message: NULLABLE_STRING,
})
type ResponseRecord = { kind: string; version: number; at: Date; message: string | null }
const response = (r: ResponseRecord) => ({
  kind: r.kind,
  version: r.version,
  at: r.at.toISOString(),
  message: r.message,
})
// TSK-0057: the totals of the customer's selected options as the server computes them, and what was approved.
type SelectionRecord = {
  options: number[]
  subtotalCents: number
  discountCents: number
  totalCents: number
  deposit: { state: string; amountCents: number | null }
}
const POSITIONS = { type: 'array', items: { type: 'integer', minimum: 1 } } as const
const SELECTION_FIELDS = {
  options: POSITIONS,
  subtotalCents: CENTS,
  // The discount totals row's amount, named like the estimate's own reduction row (OWN-DEC-145).
  reductionCents: CENTS,
  totalCents: CENTS,
  deposit: object({ state: enumOf(['required', 'not_required']), amountCents: NULLABLE_CENTS }),
} as const
const SELECTION = object(SELECTION_FIELDS)
const APPROVED = object({ ...SELECTION_FIELDS, at: DATE })
const selection = (r: SelectionRecord) => ({
  options: [...r.options],
  subtotalCents: r.subtotalCents,
  reductionCents: r.discountCents,
  totalCents: r.totalCents,
  deposit: { state: r.deposit.state, amountCents: r.deposit.amountCents },
})
type EstimateDetailRecord = {
  reference: string
  number: string
  version: number
  status: string
  issuerName: string | null
  publishedAt: Date
  validUntil: Date | null
  lines: {
    position: number
    kind: string
    serviceCode: string | null
    description: string | null
    quantity: string | null
    unit: string | null
    unitPriceCents: number | null
    amountCents: number | null
  }[]
  assumptions: string[]
  exclusions: string[]
  customerResponsibilities: string[]
  dependencies: string[]
  scheduleAssumptions: string[]
  subtotalCents: number
  reduction: { label: string; amountCents: number } | null
  totalCents: number
  deposit: { state: string; amountCents: number | null }
  paymentTerm: string
  document: { url: string; byteSize: number } | null
  terms: { documentId: string | null; state: string }
  approval: {
    available: boolean
    reasons: string[]
    current: { number: string; version: number } | null
    contentDigest: string
    selection: SelectionRecord | null
    approved: (SelectionRecord & { at: Date }) | null
  }
  actions: { requestChanges: boolean; decline: boolean; requestUpdate: boolean }
  freshVerification: boolean
  responses: ResponseRecord[]
  testMark: boolean
  refreshedAt: Date
  refreshSeconds: number
}
export const CUSTOMER_ESTIMATE = customerView(
  'estimate_version.customer',
  'EstimateVersion',
  {
    reference: STRING,
    number: STRING,
    version: { type: 'integer', minimum: 1 },
    status: enumOf(CUSTOMER_VERSION_STATUSES),
    issuerName: NULLABLE_STRING,
    publishedAt: DATE,
    validUntil: NULLABLE_DATE,
    lines: { type: 'array', items: LINE },
    assumptions: STRINGS,
    exclusions: STRINGS,
    customerResponsibilities: STRINGS,
    dependencies: STRINGS,
    scheduleAssumptions: STRINGS,
    subtotalCents: CENTS,
    // The discount totals row (OWN-DEC-145), labelled by the server in the customer PDF's own words.
    reduction: { oneOf: [{ type: 'null' }, object({ label: STRING, amountCents: CENTS })] },
    totalCents: CENTS,
    deposit: object({ state: enumOf(['required', 'not_required']), amountCents: NULLABLE_CENTS }),
    paymentTerm: STRING,
    document: { oneOf: [{ type: 'null' }, object({ url: STRING, byteSize: { type: 'integer', minimum: 1 } })] },
    terms: object({ documentId: NULLABLE_STRING, state: enumOf(['not_configured', 'not_in_effect', 'in_effect']) }),
    // TSK-0057: available on the current version while its terms are in effect; the digest an approval names; the
    // selected options kept on the server with the server's totals; what was approved.
    approval: object({
      available: { type: 'boolean' },
      reasons: {
        type: 'array',
        items: enumOf(['terms_not_configured', 'terms_not_in_effect', 'superseded', 'expired', 'not_published']),
      },
      current: { oneOf: [{ type: 'null' }, object({ number: STRING, version: { type: 'integer', minimum: 1 } })] },
      contentDigest: STRING,
      selection: { oneOf: [{ type: 'null' }, SELECTION] },
      approved: { oneOf: [{ type: 'null' }, APPROVED] },
    }),
    actions: object({
      requestChanges: { type: 'boolean' },
      decline: { type: 'boolean' },
      requestUpdate: { type: 'boolean' },
    }),
    freshVerification: { type: 'boolean' },
    responses: { type: 'array', items: RESPONSE },
    // Outside production every estimate carries "TEST — not a real invoice or estimate" (HH-PORT-10, OWN-DEC-126).
    testMark: { type: 'boolean' },
    refreshedAt: DATE,
    refreshSeconds: { type: 'integer', minimum: 0 },
  },
  (v: EstimateDetailRecord) => ({
    reference: v.reference,
    number: v.number,
    version: v.version,
    status: v.status,
    issuerName: v.issuerName,
    publishedAt: v.publishedAt.toISOString(),
    validUntil: v.validUntil ? v.validUntil.toISOString() : null,
    lines: v.lines.map((l) => ({
      position: l.position,
      kind: l.kind,
      serviceCode: l.serviceCode,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPriceCents: l.unitPriceCents,
      amountCents: l.amountCents,
    })),
    assumptions: [...v.assumptions],
    exclusions: [...v.exclusions],
    customerResponsibilities: [...v.customerResponsibilities],
    dependencies: [...v.dependencies],
    scheduleAssumptions: [...v.scheduleAssumptions],
    subtotalCents: v.subtotalCents,
    reduction: v.reduction ? { label: v.reduction.label, amountCents: v.reduction.amountCents } : null,
    totalCents: v.totalCents,
    deposit: { state: v.deposit.state, amountCents: v.deposit.amountCents },
    paymentTerm: v.paymentTerm,
    document: v.document ? { url: v.document.url, byteSize: v.document.byteSize } : null,
    terms: { documentId: v.terms.documentId, state: v.terms.state },
    approval: {
      available: v.approval.available,
      reasons: [...v.approval.reasons],
      current: v.approval.current ? { number: v.approval.current.number, version: v.approval.current.version } : null,
      contentDigest: v.approval.contentDigest,
      selection: v.approval.selection ? selection(v.approval.selection) : null,
      approved: v.approval.approved
        ? { ...selection(v.approval.approved), at: v.approval.approved.at.toISOString() }
        : null,
    },
    actions: {
      requestChanges: v.actions.requestChanges,
      decline: v.actions.decline,
      requestUpdate: v.actions.requestUpdate,
    },
    freshVerification: v.freshVerification,
    responses: v.responses.map(response),
    testMark: v.testMark,
    refreshedAt: v.refreshedAt.toISOString(),
    refreshSeconds: v.refreshSeconds,
  }),
)

/** What a customer's Request Changes, Decline or Request an Updated Estimate recorded (TSK-0056, HH-EST-09). */
export const CUSTOMER_ESTIMATE_RESPONSE = customerView(
  'estimate_response.customer',
  'EstimateVersion',
  {
    reference: STRING,
    number: STRING,
    version: { type: 'integer', minimum: 1 },
    kind: enumOf(['changes_requested', 'declined', 'update_requested']),
    status: enumOf(CUSTOMER_VERSION_STATUSES),
    at: DATE,
  },
  (r: { reference: string; number: string; version: number; kind: string; status: string; at: Date }) => ({
    reference: r.reference,
    number: r.number,
    version: r.version,
    kind: r.kind,
    status: r.status,
    at: r.at.toISOString(),
  }),
)

/** The customer's selected options on the current version, with the server's totals for them (TSK-0057). */
export const CUSTOMER_ESTIMATE_SELECTION = customerView(
  'estimate_selection.customer',
  'EstimateVersion',
  { reference: STRING, number: STRING, version: { type: 'integer', minimum: 1 }, selection: SELECTION },
  (r: { reference: string; number: string; version: number; selection: SelectionRecord }) => ({
    reference: r.reference,
    number: r.number,
    version: r.version,
    selection: selection(r.selection),
  }),
)

/**
 * The customer's approval of one exact version (TSK-0057; HH-EST-06, HH-EST-08): what was approved and the next step
 * ("Estimate approved—scheduling is next."). Never an appointment, a reservation or a paid deposit; no internal ID.
 */
export const CUSTOMER_ESTIMATE_APPROVAL = customerView(
  'estimate_approval.customer',
  'Approval',
  {
    reference: STRING,
    number: STRING,
    version: { type: 'integer', minimum: 1 },
    status: enumOf(['approved']),
    approved: APPROVED,
    nextStep: enumOf(['scheduling_next']),
  },
  (r: { reference: string; number: string; version: number; approved: SelectionRecord & { at: Date } }) => ({
    reference: r.reference,
    number: r.number,
    version: r.version,
    status: 'approved',
    approved: { ...selection(r.approved), at: r.approved.at.toISOString() },
    nextStep: 'scheduling_next',
  }),
)

/**
 * The session's own verification (TSK-0057, HH-ID-07): whether it is fresh enough for an approval, until when, and
 * where a new code can go (masked). Nothing about any other contact, project or account.
 */
export const SESSION_VERIFICATION = customerView(
  'session_verification.customer',
  'Customer',
  {
    fresh: { type: 'boolean' },
    freshUntil: DATE,
    channels: { type: 'array', items: object({ channel: CHANNEL, destination: STRING }) },
  },
  (r: {
    fresh: boolean
    freshUntil: Date
    channels: readonly { channel: 'email' | 'phone'; destination: string }[]
  }) => ({
    fresh: r.fresh,
    freshUntil: r.freshUntil.toISOString(),
    channels: r.channels.map((c) => ({ channel: c.channel, destination: c.destination })),
  }),
)

// Customer downloads (TSK-0100; HH-PRIV-06, HH-SEC-05, T68, ENT-Document). The documents of one estimate version the
// customer received, each with a short-lived signed link issued after the record and visibility checks: the customer
// PDF as published and, for an uploaded estimate, the customer document it was confirmed for. Never a storage key,
// a private original or a document of another project.
const DOWNLOAD = object({
  kind: enumOf(['estimate_pdf', 'estimate_document']),
  contentType: STRING,
  byteSize: { type: 'integer', minimum: 1 },
  url: STRING,
  expiresAt: DATE,
})
export type DownloadRecord = {
  kind: 'estimate_pdf' | 'estimate_document'
  contentType: string
  byteSize: number
  url: string
  expiresAt: Date
}
export const DOCUMENT_DOWNLOADS = customerView(
  'document.downloads',
  'Document',
  {
    reference: STRING,
    number: STRING,
    version: { type: 'integer', minimum: 1 },
    documents: { type: 'array', items: DOWNLOAD },
  },
  (r: { reference: string; number: string; version: number; documents: readonly DownloadRecord[] }) => ({
    reference: r.reference,
    number: r.number,
    version: r.version,
    documents: r.documents.map((d) => ({
      kind: d.kind,
      contentType: d.contentType,
      byteSize: d.byteSize,
      url: d.url,
      expiresAt: d.expiresAt.toISOString(),
    })),
  }),
)

// Privacy requests (TSK-0100; HH-PRIV-03, ENT-PrivacyRequest, OWN-DEC-71, OWN-DEC-113). The requester's own requests:
// the reference, kind, state, their own words for a correction, and once decided the outcome they are told: the
// categories deleted and retained, why, the retention category and its configured years, and until when where known.
// Never the Owner's reason, the checks, a staff name or another person's data.
const PLAN_ITEM = object({
  category: enumOf(PLAN_CATEGORIES),
  disposition: enumOf(DISPOSITIONS),
  count: { type: 'integer', minimum: 0 },
  reason: { type: ['string', 'null'], enum: [...RETAIN_REASONS, null] },
  retention: NULLABLE_STRING,
  years: { type: ['integer', 'null'] },
  reviewAt: NULLABLE_DATE,
})
const OUTCOME = object({
  deleted: { type: 'array', items: object({ category: enumOf(PLAN_CATEGORIES), count: { type: 'integer' } }) },
  retained: { type: 'array', items: PLAN_ITEM },
  excluded: { type: 'array', items: PLAN_ITEM },
  exportReady: { type: 'boolean' },
  accessClosed: { type: 'boolean' },
})
type PlanItemRecord = {
  category: string
  disposition: string
  count: number
  reason: string | null
  retention: string | null
  years: number | null
  reviewAt: string | null
}
type OutcomeRecord = {
  deleted: readonly { category: string; count: number }[]
  retained: readonly PlanItemRecord[]
  excluded: readonly PlanItemRecord[]
  exportReady: boolean
  accessClosed: boolean
}
const planItem = (i: PlanItemRecord) => ({
  category: i.category,
  disposition: i.disposition,
  count: i.count,
  reason: i.reason,
  retention: i.retention,
  years: i.years,
  reviewAt: i.reviewAt,
})
export type PrivacyRequestRecord = {
  reference: string
  kind: 'export' | 'correction' | 'deletion'
  state: string
  details: string | null
  submittedAt: Date
  decidedAt: Date | null
  outcome: OutcomeRecord | null
}
export const PRIVACY_REQUEST = customerView(
  'privacy_request.customer',
  'PrivacyRequest',
  {
    reference: STRING,
    kind: enumOf(['export', 'correction', 'deletion']),
    state: enumOf(['received', 'under_review', 'completed', 'partially_completed', 'declined']),
    details: NULLABLE_STRING,
    submittedAt: DATE,
    decidedAt: NULLABLE_DATE,
    outcome: { oneOf: [{ type: 'null' }, OUTCOME] },
  },
  (r: PrivacyRequestRecord) => ({
    reference: r.reference,
    kind: r.kind,
    state: r.state,
    details: r.details,
    submittedAt: r.submittedAt.toISOString(),
    decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
    outcome: r.outcome
      ? {
          deleted: r.outcome.deleted.map((d) => ({ category: d.category, count: d.count })),
          retained: r.outcome.retained.map(planItem),
          excluded: r.outcome.excluded.map(planItem),
          exportReady: r.outcome.exportReady,
          accessClosed: r.outcome.accessClosed,
        }
      : null,
  }),
)

/** The requester's requests, with whether the session is fresh enough to make a new one (identity confirmation). */
export const PRIVACY_REQUESTS = customerView(
  'privacy_requests.customer',
  'PrivacyRequest',
  {
    reference: STRING,
    freshVerification: { type: 'boolean' },
    requests: { type: 'array', items: PRIVACY_REQUEST.schema },
  },
  (r: { reference: string; freshVerification: boolean; requests: readonly PrivacyRequestRecord[] }) => ({
    reference: r.reference,
    freshVerification: r.freshVerification,
    requests: r.requests.map((x) => PRIVACY_REQUEST.project(x)),
  }),
)

// The data export (TSK-0100; HH-PRIV-03, OQ-PRIVACY-REQUESTS): the requester's own data as the records hold it, for a
// completed export request. PROPOSED content: their customer name, their own contact values, sign-in values, the
// properties and requests they submitted, the estimate versions they received, their approvals, their
// consent records, their privacy requests and photo counts. Excluded (named in `excluded`): other contacts of the
// customer (third parties), staff-only notes and handling, staff details and audit entries; whether an export must
// include more is the attorney's review (OQ-PRIVACY-REQUESTS).
const NULLABLE_INT = { type: ['integer', 'null'] } as const
const EXPORT_REQUEST = object({
  reference: STRING,
  submittedAt: DATE,
  services: STRINGS,
  notSure: { type: 'boolean' },
  otherServices: NULLABLE_STRING,
  description: NULLABLE_STRING,
  answers: {
    type: 'array',
    items: object({ question: STRING, service: NULLABLE_STRING, value: NULLABLE_STRING, unit: NULLABLE_STRING }),
  },
  preferredDate: NULLABLE_STRING,
  flexible: { type: 'boolean' },
  needHelpToday: { type: 'boolean' },
  timeWindows: STRINGS,
  estimatePreference: STRING,
  preferredChannel: STRING,
  smsOptIn: { type: 'boolean' },
  marketingOptIn: { type: 'boolean' },
})
export type ExportRecord = {
  generatedAt: Date
  customer: { name: string }
  contact: { fullName: string; email: string; phone: string; preferredChannel: string }
  account: { email: string | null; phone: string | null; since: Date } | null
  properties: readonly {
    street: string
    unit: string | null
    city: string
    state: string
    zip: string
    propertyType: string
  }[]
  requests: readonly {
    reference: string
    submittedAt: Date
    services: readonly string[]
    notSure: boolean
    otherServices: string | null
    description: string | null
    answers: readonly { question: string; service: string | null; value: string | null; unit: string | null }[]
    preferredDate: string | null
    flexible: boolean
    needHelpToday: boolean
    timeWindows: readonly string[]
    estimatePreference: string
    preferredChannel: string
    smsOptIn: boolean
    marketingOptIn: boolean
  }[]
  estimates: readonly { number: string; version: number; status: string; publishedAt: Date; totalCents: number }[]
  approvals: readonly {
    number: string
    version: number
    approvedAt: Date
    fullName: string
    totalCents: number
    depositCents: number | null
  }[]
  consents: readonly { purpose: string; channel: string; granted: boolean; recordedAt: Date }[]
  privacyRequests: readonly { reference: string; kind: string; state: string; submittedAt: Date }[]
  photos: { received: number; processing: number; failed: number }
  excluded: readonly string[]
}
export const PRIVACY_EXPORT = customerView(
  'privacy_export.customer',
  'PrivacyRequest',
  {
    generatedAt: DATE,
    customer: object({ name: STRING }),
    contact: object({ fullName: STRING, email: STRING, phone: STRING, preferredChannel: STRING }),
    account: { oneOf: [{ type: 'null' }, object({ email: NULLABLE_STRING, phone: NULLABLE_STRING, since: DATE })] },
    properties: {
      type: 'array',
      items: object({
        street: STRING,
        unit: NULLABLE_STRING,
        city: STRING,
        state: STRING,
        zip: STRING,
        propertyType: STRING,
      }),
    },
    requests: { type: 'array', items: EXPORT_REQUEST },
    estimates: {
      type: 'array',
      items: object({
        number: STRING,
        version: { type: 'integer' },
        status: STRING,
        publishedAt: DATE,
        totalCents: CENTS,
      }),
    },
    approvals: {
      type: 'array',
      items: object({
        number: STRING,
        version: { type: 'integer' },
        approvedAt: DATE,
        fullName: STRING,
        totalCents: CENTS,
        depositCents: NULLABLE_INT,
      }),
    },
    consents: {
      type: 'array',
      items: object({ purpose: STRING, channel: STRING, granted: { type: 'boolean' }, recordedAt: DATE }),
    },
    privacyRequests: {
      type: 'array',
      items: object({ reference: STRING, kind: STRING, state: STRING, submittedAt: DATE }),
    },
    photos: object({
      received: { type: 'integer' },
      processing: { type: 'integer' },
      failed: { type: 'integer' },
    }),
    excluded: STRINGS,
  },
  (r: ExportRecord) => ({
    generatedAt: r.generatedAt.toISOString(),
    customer: { name: r.customer.name },
    contact: {
      fullName: r.contact.fullName,
      email: r.contact.email,
      phone: r.contact.phone,
      preferredChannel: r.contact.preferredChannel,
    },
    account: r.account
      ? { email: r.account.email, phone: r.account.phone, since: r.account.since.toISOString() }
      : null,
    properties: r.properties.map((p) => ({
      street: p.street,
      unit: p.unit,
      city: p.city,
      state: p.state,
      zip: p.zip,
      propertyType: p.propertyType,
    })),
    requests: r.requests.map((q) => ({
      reference: q.reference,
      submittedAt: q.submittedAt.toISOString(),
      services: [...q.services],
      notSure: q.notSure,
      otherServices: q.otherServices,
      description: q.description,
      answers: q.answers.map((a) => ({ question: a.question, service: a.service, value: a.value, unit: a.unit })),
      preferredDate: q.preferredDate,
      flexible: q.flexible,
      needHelpToday: q.needHelpToday,
      timeWindows: [...q.timeWindows],
      estimatePreference: q.estimatePreference,
      preferredChannel: q.preferredChannel,
      smsOptIn: q.smsOptIn,
      marketingOptIn: q.marketingOptIn,
    })),
    estimates: r.estimates.map((e) => ({
      number: e.number,
      version: e.version,
      status: e.status,
      publishedAt: e.publishedAt.toISOString(),
      totalCents: e.totalCents,
    })),
    approvals: r.approvals.map((a) => ({
      number: a.number,
      version: a.version,
      approvedAt: a.approvedAt.toISOString(),
      fullName: a.fullName,
      totalCents: a.totalCents,
      depositCents: a.depositCents,
    })),
    consents: r.consents.map((c) => ({
      purpose: c.purpose,
      channel: c.channel,
      granted: c.granted,
      recordedAt: c.recordedAt.toISOString(),
    })),
    privacyRequests: r.privacyRequests.map((p) => ({
      reference: p.reference,
      kind: p.kind,
      state: p.state,
      submittedAt: p.submittedAt.toISOString(),
    })),
    photos: { received: r.photos.received, processing: r.photos.processing, failed: r.photos.failed },
    excluded: [...r.excluded],
  }),
)

/** Every customer view, by name. */
export const CUSTOMER_VIEWS: ReadonlyMap<string, CustomerView<never>> = new Map(
  [
    PROJECT_REFERENCE,
    PROJECT_GLANCE,
    CUSTOMER_PHOTO,
    PROJECT_SUMMARY,
    PROJECT_LIST,
    PROJECT_OVERVIEW,
    PROJECT_MESSAGES,
    PROJECT_DOCUMENTS,
    PROJECT_PHOTOS,
    PROJECT_APPOINTMENTS,
    PROJECT_PAYMENTS,
    CUSTOMER_ACCOUNT,
    ACCOUNT_SIGNED_IN,
    ACCOUNT_CODE_SENT,
    ENROLLMENT_CHANNEL,
    CUSTOMER_ESTIMATE,
    CUSTOMER_ESTIMATE_RESPONSE,
    CUSTOMER_ESTIMATE_SELECTION,
    CUSTOMER_ESTIMATE_APPROVAL,
    SESSION_VERIFICATION,
    DOCUMENT_DOWNLOADS,
    PRIVACY_REQUEST,
    PRIVACY_REQUESTS,
    PRIVACY_EXPORT,
  ].map((v) => [v.name, v as CustomerView<never>]),
)
