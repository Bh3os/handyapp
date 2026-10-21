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
