// Contract schemas of the staff inbox routes (TSK-0049; HH-COM-07, HH-COM-10, HH-COM-01, HH-API-01). Every response
// object lists its fields; anything else is stripped before it leaves the server. No route here answers a customer.
const S = { type: 'string' } as const
const NS = { type: ['string', 'null'] } as const
const B = { type: 'boolean' } as const
const I = { type: 'integer' } as const
const NI = { type: ['integer', 'null'] } as const
export const UUID = { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' } as const

const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: 'object',
  additionalProperties: false,
  required,
  properties,
})
const nobj = (properties: Record<string, unknown>) => ({ ...obj(properties), type: ['object', 'null'] })
const arr = (items: unknown) => ({ type: 'array', items })
const state = (values: readonly string[]) => ({ type: 'string', enum: [...values] })

export const CONFIG_STATE = ['configured', 'not_configured', 'unknown'] as const
export const READER_STATE = ['configured', 'fake', 'not_configured', 'unknown'] as const

export const STATUS = obj({
  sms: obj({ provider: { const: 'bird' }, inbound: state(CONFIG_STATE) }),
  email: obj({
    provider: { const: 'resend' },
    inbound: state(CONFIG_STATE),
    bodyReading: state(READER_STATE),
    replyTokens: state(CONFIG_STATE),
  }),
  unsupported: obj({ count: I, latestAt: NS }),
  /** Null for roles without message.view_unmatched. */
  needsLinking: NI,
})

const PROJECT = obj({ id: S, reference: S, state: S })
const CUSTOMER = obj({ id: S, displayName: S })
const ATTACHMENT = obj({ contentType: S, size: NI })

export const CONVERSATION_PARAMS = obj({ conversationId: UUID })
export const MESSAGE_PARAMS = obj({ messageId: UUID })
export const PROJECT_PARAMS = obj({ projectId: UUID })

export const CONVERSATION_ITEM = obj({
  id: S,
  project: PROJECT,
  customer: CUSTOMER,
  lastMessageAt: NS,
  lastInboundAt: NS,
  awaitingReply: B,
  latest: nobj({ channel: S, direction: S, preview: NS, receivedAt: S }),
})

export const THREAD_MESSAGE = obj({
  id: S,
  direction: S,
  channel: S,
  from: NS,
  to: arr(S),
  subject: NS,
  body: NS,
  bodyState: S,
  bodyTruncated: B,
  attachments: arr(ATTACHMENT),
  keyword: NS,
  receivedAt: S,
  linkState: S,
  matchRule: NS,
  author: obj({ kind: state(['contact', 'unknown_sender', 'staff']), id: NS, name: NS }),
  /**
   * TSK-0050: a staff reply's email or text, as its delivery records it (queued, also while it waits for the contact
   * hours until sendAt; sent; delivered where reported; failed; suppressed; cancelled), and whether Retry is offered.
   * Null for every other message.
   */
  delivery: nobj({ id: S, state: S, errorCode: NS, sendAt: NS, retry: B }),
  /**
   * TSK-0155 (OWN-DEC-211 5): a staff reply sent from a worker's proposed reply carries the worker's original text,
   * kept internally for context and audit (staff only; the customer reads only the reply). Null for every other message.
   */
  proposal: nobj({ id: S, originalText: S, author: obj({ id: S, name: NS }) }),
})

export const CONVERSATION = obj({
  id: S,
  project: PROJECT,
  customer: CUSTOMER,
  state: S,
  awaitingReply: B,
  handledAt: NS,
  messages: arr(THREAD_MESSAGE),
  /** Customer messages sent through the notification outbox for this project (metadata only, no text). */
  deliveries: arr(obj({ id: S, messageKey: S, channel: S, state: S, at: S })),
  internal: obj({ id: NS, messages: arr(THREAD_MESSAGE) }),
})

export const NEEDS_LINKING_ITEM = obj({
  id: S,
  channel: S,
  from: S,
  subject: NS,
  preview: NS,
  receivedAt: S,
  reason: S,
  attachments: I,
  suggestion: nobj({ projectId: S, reference: S }),
})

export const MESSAGE_DETAIL = obj({
  id: S,
  version: I,
  direction: S,
  channel: S,
  from: NS,
  to: arr(S),
  subject: NS,
  body: NS,
  bodyState: S,
  bodyTruncated: B,
  attachments: arr(ATTACHMENT),
  keyword: NS,
  receivedAt: S,
  linkState: S,
  reason: NS,
  matchRule: NS,
  project: nobj({ id: S, reference: S }),
  customer: nobj({ id: S, displayName: S }),
  conversationId: NS,
  candidates: arr(
    obj({ projectId: S, reference: S, state: S, customerId: S, customerName: S, verifiedContact: B, suggested: B }),
  ),
  history: arr(
    obj({
      fromState: NS,
      toState: S,
      fromReference: NS,
      toReference: NS,
      rule: S,
      reason: NS,
      staff: nobj({ id: S, name: NS }),
      at: S,
    }),
  ),
})

/** A written reason: required for every linking correction (OWN-DEC-120 "Record linking corrections"). */
export const REASON = { type: 'string', minLength: 1, maxLength: 1000, pattern: '\\S' } as const

export const LINK_BODY = obj({
  /** The project to link to, by its reference; null returns the message to Needs Linking. */
  projectReference: { type: ['string', 'null'], pattern: '^HH-[0-9A-HJKMNP-TV-Z]{8}$' },
  reason: REASON,
})
export const LINK_RESULT = obj({
  id: S,
  version: I,
  linkState: S,
  project: nobj({ id: S, reference: S }),
  conversationId: NS,
})

export const INTERNAL_BODY = obj({ body: { type: 'string', minLength: 1, maxLength: 5000, pattern: '\\S' } })
export const CREATED = obj({ id: S, conversationId: S })
export const HANDLED_BODY = obj({}, [])
export const HANDLED_RESULT = obj({ resolved: B, handledAt: S })

// Staff replies (TSK-0050; HH-COM-08, HH-COM-09).
export const REPLY_CHANNELS = ['email', 'sms'] as const
export const CHANNEL_REASONS = ['available', 'unverified', 'no_opt_in', 'opted_out'] as const
/** PROPOSED: the longest reply, for email and text alike. */
export const REPLY_MAX_LENGTH = 2000

export const PROJECT_CONVERSATION = obj({ conversationId: NS, project: PROJECT, customer: CUSTOMER })

export const REPLY_OPTIONS = obj({
  /** The contact a reply goes to (the contact of the project's request); null when the project has none. */
  contact: nobj({ id: S, name: S }),
  /** The customer's preferred channel as recorded: email, text or call (call: no messaging channel preferred). */
  preferred: state(['email', 'text', 'call']),
  options: arr(
    obj({
      channel: state(REPLY_CHANNELS),
      destination: S,
      preferred: B,
      available: B,
      reason: state(CHANNEL_REASONS),
    }),
  ),
  /** The channel Send uses without a choice: the preferred one while it is available; null: staff choose. */
  defaultChannel: { type: ['string', 'null'], enum: [...REPLY_CHANNELS, null] },
  /** TSK-0122 (OWN-DEC-154): when a reply sent now goes out, by channel. */
  deliveryHours: obj({
    /** An email goes at once, at any hour. */
    email: obj({ sendAt: S }),
    /** A text inside the recipient's permitted hours (open), or at their next opening (closed); not_configured: none. */
    text: obj({
      state: state(['open', 'closed', 'not_configured']),
      open: NS,
      close: NS,
      zone: NS,
      basis: { type: ['string', 'null'], enum: ['recipient_zone', 'unknown_zone_fallback', null] },
      sendAt: S,
    }),
  }),
  /** Whether released wording exists for a reply by each channel (message type staff.reply). */
  templates: obj({ email: state(['configured', 'not_configured']), sms: state(['configured', 'not_configured']) }),
  maxLength: I,
})

export const REPLY_BODY = obj({
  body: { type: 'string', minLength: 1, maxLength: REPLY_MAX_LENGTH, pattern: '\\S' },
  channel: state(REPLY_CHANNELS),
})
export const REPLY_RESULT = obj({
  id: S,
  conversationId: S,
  delivery: obj({ id: S, channel: S, state: S, sendAt: S, heldForTextHours: B }),
})

// Worker notes and proposed replies (TSK-0155; HH-COM-16, OWN-DEC-211).
export const PROPOSAL_STATES = ['draft', 'awaiting_review', 'sent', 'rejected'] as const
export const PROPOSAL_EVENT_KINDS = [
  'submitted',
  'clarification_requested',
  'clarification_answered',
  'rejected',
  'sent',
] as const
/** The worker's text, a clarification question or answer, in Spanish or English as written. */
const PROPOSAL_TEXT = { type: 'string', minLength: 1, maxLength: REPLY_MAX_LENGTH, pattern: '\\S' } as const

export const JOB_PARAMS = obj({ jobId: UUID })
export const PROPOSAL_PARAMS = obj({ proposalId: UUID })

export const WORKER_NOTE_BODY = obj({ body: { type: 'string', minLength: 1, maxLength: 5000, pattern: '\\S' } })
export const WORKER_NOTE = obj({ id: S, body: S, at: S })
export const PROPOSE_BODY = obj({
  text: PROPOSAL_TEXT,
  /** true: send it for review now; false: keep it as a draft the worker may still change. */
  submit: B,
})
export const TEXT_BODY = obj({ text: PROPOSAL_TEXT })
export const EMPTY_BODY = obj({}, [])
export const REJECT_BODY = obj({ reason: REASON })
export const PROPOSAL_SEND_BODY = obj({
  /** The English customer message the reviewer wrote. */
  body: { type: 'string', minLength: 1, maxLength: REPLY_MAX_LENGTH, pattern: '\\S' },
  channel: state(REPLY_CHANNELS),
  /** The reviewer's explicit approval: this is the reviewed English customer message (OWN-DEC-211 4, 6). */
  approveEnglish: { const: true },
})

const PROPOSAL_EVENT = obj({ kind: state(PROPOSAL_EVENT_KINDS), by: obj({ id: S, name: NS }), text: NS, at: S })

/** A worker's own proposal as the worker sees it: its status and the question asked, never the sent message. */
export const OWN_PROPOSAL = obj({
  id: S,
  version: I,
  jobId: S,
  reference: S,
  status: state(PROPOSAL_STATES),
  text: S,
  /** The reviewer's open question, until the worker answers it. */
  clarification: nobj({ question: S, askedAt: S }),
  rejectReason: NS,
  createdAt: S,
  submittedAt: NS,
  decidedAt: NS,
  events: arr(PROPOSAL_EVENT),
  actions: obj({ edit: B, submit: B, answer: B }),
})
export const OWN_PROPOSALS = obj({ items: arr(OWN_PROPOSAL), limit: I, maxLength: I })

export const JOB_NOTES = obj({
  jobId: S,
  reference: S,
  /** The caller's own internal notes on the job's project (staff-only; never sent). */
  notes: arr(WORKER_NOTE),
  proposals: arr(OWN_PROPOSAL),
  maxLength: I,
})

/** A proposal as the Owner or Office reviews it. */
export const PROPOSAL_REVIEW = obj({
  id: S,
  version: I,
  status: state(PROPOSAL_STATES),
  clarificationOpen: B,
  project: PROJECT,
  customer: CUSTOMER,
  jobId: S,
  author: obj({ id: S, name: NS }),
  /** The worker's text exactly as written: internal, for context; never sent. */
  originalText: S,
  createdAt: S,
  submittedAt: NS,
  rejectReason: NS,
  decided: nobj({ by: obj({ id: S, name: NS }), at: S }),
  /** The English reply sent from it (its text and delivery are on the project's conversation). */
  sentMessage: nobj({ id: S, conversationId: S }),
  events: arr(PROPOSAL_EVENT),
  actions: obj({ clarify: B, reject: B, send: B }),
  maxLength: I,
})
