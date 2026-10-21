// Customer projections (TSK-0037; HH-ARC-04, HH-PORT-01, HH-DATA-07, T24). The server builds what a customer receives
// from an explicit view per entity: an allow-list of customer-facing fields, each read from the record by name. A
// field that no view lists is internal: it is never copied into a customer response, and the route's response schema
// (the same allow-list, additionalProperties false) strips anything else before it leaves the server. Customer
// surface routes name the view they answer with (RouteDef.projection); a unit test holds every route to it.
//
// Entities with no customer view below are internal as a whole until a task declares one from its requirement: the
// project access grant itself (its nonce, token hash, contact and revocation are never sent; a customer only learns
// the reference of the project it opens), customer and account records, documents, invoices and cases. (The
// workspace tabs of TSK-0039 name Document and Invoice only for their "none yet" states; no record field is sent.)
// TSK-0044: contacts, notes (every class: notes are never customer-shared) and candidate matches have no customer
// view either. TSK-0049: conversations and Needs Linking have none; internal messages never get one. TSK-0050: the
// portal Messages tab (PROJECT_MESSAGES) shows the project's customer conversation: the customer's own email and
// texts on the project and HandyHub's replies, each as who, how, when and the text as written; never a staff name,
// an address, a delivery detail, an internal message or a message from a sender who is not the customer's contact.
import {
  CUSTOMER_NEXT_ACTIONS,
  CUSTOMER_SITUATIONS,
  CUSTOMER_STEPS,
  CUSTOMER_TIMELINE_KINDS,
  WAITING_ON,
  type CustomerStatus,
} from '@handyhub/domain'
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
  'Message',
  // TSK-0051: staff questions to the customer and the customer's replies.
  'Question',
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
// - messages (TSK-0050): the project's customer conversation, its messages listed (an empty list: none yet);
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

/**
 * One message of the project conversation as the customer sees it (TSK-0050; C06, HH-PORT-08): from the customer
 * ('you') or HandyHub, by email or text, when, and the text exactly as written (customer free text is never
 * translated); textState says when there is no text to show (an empty message, or an email whose text HandyHub could
 * not read). Attachments are a count only: they are not imported (TSK-0049), so none is shown.
 */
export type ConversationMessageRecord = {
  from: 'you' | 'handyhub'
  /** TSK-0051: 'portal' is a message the customer wrote in the portal's Messages tab. */
  channel: 'email' | 'sms' | 'portal'
  at: Date
  text: string | null
  textState: 'shown' | 'empty' | 'not_available'
  attachments: number
}
const CONVERSATION_MESSAGE = object({
  from: enumOf(['you', 'handyhub']),
  channel: enumOf(['email', 'sms', 'portal']),
  at: DATE,
  text: { type: ['string', 'null'] },
  textState: enumOf(['shown', 'empty', 'not_available']),
  attachments: { type: 'integer', minimum: 0 },
})

/** The Messages tab (TSK-0050): the project's customer conversation, oldest first; empty: nothing yet. */
export const PROJECT_MESSAGES = customerView(
  'project.messages',
  'Message',
  { ...TAB_FIELDS, messages: { type: 'array', items: CONVERSATION_MESSAGE } },
  (r: TabRecord & { messages: readonly ConversationMessageRecord[] }) => ({
    ...tabHead(r),
    messages: r.messages.map((m) => ({
      from: m.from,
      channel: m.channel,
      at: m.at.toISOString(),
      text: m.text,
      textState: m.textState,
      attachments: m.attachments,
    })),
  }),
)
/** The Documents tab: no customer document exists yet. */
export const PROJECT_DOCUMENTS = tabView('project.documents', 'Document', ['none'] as const)
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

/**
 * TSK-0051 (HH-LEAD-03, OWN-DEC-98, OWN-DEC-101): the questions HandyHub published in the project, oldest first, as
 * the customer sees them: the text exactly as staff wrote it, whether it is a measurement (the reply may say "I'm not
 * sure"), when it was asked, whether it waits on the customer, whether a reply can be sent now, and the customer's own
 * reply (text as written, "I'm not sure", the attached photos counted by state). Never the author, a delivery, a
 * reminder or anything internal. replyWindow: open; reopen (the request is "Closed—no response" and a reply within the
 * period until reopenUntil reopens it); period_ended (a new request is the way); closed.
 */
export type QuestionRecord = {
  id: string
  kind: 'general' | 'measurement'
  text: string
  askedAt: Date
  state: 'waiting' | 'answered'
  canReply: boolean
  reply: { text: string | null; notSure: boolean; at: Date; photos: PhotoCountsRecord } | null
}
type PhotoCountsRecord = { received: number; processing: number; failed: number }
const PHOTO_COUNTS = object({
  received: { type: 'integer', minimum: 0 },
  processing: { type: 'integer', minimum: 0 },
  failed: { type: 'integer', minimum: 0 },
})
const QUESTION_ITEM = object({
  id: STRING,
  kind: enumOf(['general', 'measurement']),
  text: STRING,
  askedAt: DATE,
  state: enumOf(['waiting', 'answered']),
  canReply: { type: 'boolean' },
  reply: {
    anyOf: [
      { type: 'null' },
      object({ text: { type: ['string', 'null'] }, notSure: { type: 'boolean' }, at: DATE, photos: PHOTO_COUNTS }),
    ],
  },
})
export const PROJECT_QUESTIONS = customerView(
  'project.questions',
  'Question',
  {
    ...TAB_FIELDS,
    questions: { type: 'array', items: QUESTION_ITEM },
    replyWindow: enumOf(['open', 'reopen', 'period_ended', 'closed']),
    reopenUntil: { type: ['string', 'null'] },
    maxLength: { type: 'integer', minimum: 1 },
  },
  (
    r: TabRecord & {
      questions: readonly QuestionRecord[]
      replyWindow: 'open' | 'reopen' | 'period_ended' | 'closed'
      reopenUntil: Date | null
      maxLength: number
    },
  ) => ({
    ...tabHead(r),
    questions: r.questions.map((q) => ({
      id: q.id,
      kind: q.kind,
      text: q.text,
      askedAt: q.askedAt.toISOString(),
      state: q.state,
      canReply: q.canReply,
      reply: q.reply
        ? {
            text: q.reply.text,
            notSure: q.reply.notSure,
            at: q.reply.at.toISOString(),
            photos: {
              received: q.reply.photos.received,
              processing: q.reply.photos.processing,
              failed: q.reply.photos.failed,
            },
          }
        : null,
    })),
    replyWindow: r.replyWindow,
    reopenUntil: r.reopenUntil ? r.reopenUntil.toISOString() : null,
    maxLength: r.maxLength,
  }),
)

/** A reply's upload capability (TSK-0051): returned once; the photo limits come from uploads.limits. */
export const QUESTION_UPLOAD = customerView(
  'question.upload',
  'Photo',
  {
    capability: STRING,
    expiresAt: DATE,
    limits: object({
      maxFileBytes: { type: 'integer' },
      maxPhotos: { type: 'integer' },
      types: { type: 'array', items: STRING },
    }),
  },
  (r: {
    capability: string
    expiresAt: Date
    limits: { maxFileBytes: number; maxPhotos: number; types: readonly string[] }
  }) => ({
    capability: r.capability,
    expiresAt: r.expiresAt.toISOString(),
    limits: { maxFileBytes: r.limits.maxFileBytes, maxPhotos: r.limits.maxPhotos, types: [...r.limits.types] },
  }),
)

/** "Reply received—HandyHub will review it" (OWN-DEC-98): what the customer's reply did. */
export const QUESTION_REPLY_RESULT = customerView(
  'question.reply_received',
  'Question',
  {
    questionId: STRING,
    state: enumOf(['answered']),
    at: DATE,
    photos: { type: 'integer', minimum: 0 },
    reopened: { type: 'boolean' },
  },
  (r: { questionId: string; at: Date; photos: number; reopened: boolean }) => ({
    questionId: r.questionId,
    state: 'answered',
    at: r.at.toISOString(),
    photos: r.photos,
    reopened: r.reopened,
  }),
)

/** A message the customer wrote in the portal (TSK-0051, HH-PORT-09): it is on the project's conversation now. */
export const PORTAL_MESSAGE_SENT = customerView(
  'project.message_sent',
  'Message',
  { from: enumOf(['you']), channel: enumOf(['portal']), at: DATE },
  (r: { at: Date }) => ({ from: 'you', channel: 'portal', at: r.at.toISOString() }),
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
    PROJECT_QUESTIONS,
    QUESTION_UPLOAD,
    QUESTION_REPLY_RESULT,
    PORTAL_MESSAGE_SENT,
  ].map((v) => [v.name, v as CustomerView<never>]),
)
