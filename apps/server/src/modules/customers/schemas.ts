// Contract schemas of the staff customer routes (TSK-0044; HH-CRM-01, HH-ID-02, HH-STAFF-05, HH-API-01). Every
// response object lists its fields; anything else is stripped before it leaves the server.
import { NOTE_VISIBILITIES } from '@handyhub/domain'

const S = { type: 'string' } as const
const NS = { type: ['string', 'null'] } as const
const B = { type: 'boolean' } as const
const I = { type: 'integer' } as const
export const UUID = { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' } as const

const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: 'object',
  additionalProperties: false,
  required,
  properties,
})
const arr = (items: unknown) => ({ type: 'array', items })

export const CUSTOMER_PARAMS = obj({ customerId: UUID })
export const CONTACT_PARAMS = obj({ customerId: UUID, contactId: UUID })
export const CANDIDATE_PARAMS = obj({ customerId: UUID, candidateId: UUID })

/** A written reason: required for every staff edit of the record (ENT-Customer, ENT-Contact "with a reason"). */
export const REASON = { type: 'string', minLength: 1, maxLength: 1000, pattern: '\\S' } as const

const STAFF_REF = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: ['id', 'name'],
  properties: { id: S, name: NS },
}
const PERMISSION = obj({ state: { type: 'string', enum: ['granted', 'withdrawn', 'none'] }, since: NS })

export const LIST_ITEM = obj({
  id: S,
  displayName: S,
  status: S,
  createdAt: S,
  contactName: NS,
  email: NS,
  phone: NS,
  city: NS,
  projects: I,
  /** Open suggestions; null for a role that may not see suggestions. */
  possibleDuplicates: { type: ['integer', 'null'] },
})

export const RECORD = obj({
  id: S,
  displayName: S,
  status: S,
  mergedIntoId: NS,
  provenance: S,
  language: S,
  createdAt: S,
  version: I,
  contacts: arr(
    obj({
      id: S,
      fullName: S,
      email: S,
      phone: S,
      preferredChannel: S,
      isPrimary: B,
      version: I,
      verification: obj({ email: S, phone: S }),
      permissions: obj({ sms: PERMISSION, marketingEmail: PERMISSION, marketingSms: PERMISSION }),
      consentHistory: arr(
        obj({
          purpose: S,
          channel: S,
          granted: B,
          source: S,
          disclosureVersion: NS,
          recordedAt: S,
          ownRecord: B,
        }),
      ),
    }),
  ),
  properties: arr(
    obj({
      id: S,
      street: S,
      unit: NS,
      city: S,
      state: S,
      zip: S,
      propertyType: S,
      coverage: S,
      relationship: S,
    }),
  ),
  projects: arr(
    obj({
      id: S,
      reference: S,
      state: S,
      createdAt: S,
      requests: arr(obj({ id: S, reference: S, state: S, submittedAt: S })),
    }),
  ),
  documents: obj({ state: { type: 'string', enum: ['not_available'] } }),
  payments: obj({ state: { type: 'string', enum: ['not_available'] } }),
  notes: arr(
    obj({
      id: S,
      source: { type: 'string', enum: ['customer', 'request'] },
      requestReference: NS,
      visibility: S,
      masked: B,
      body: NS,
      author: STAFF_REF,
      createdAt: S,
    }),
  ),
  candidates: obj({
    visible: B,
    items: arr(
      obj({
        id: S,
        version: I,
        customer: obj({ id: S, displayName: S, status: S }),
        reasons: arr(S),
        status: S,
        detectedAt: S,
        lastReview: {
          type: ['object', 'null'],
          additionalProperties: false,
          required: ['by', 'reason', 'at'],
          properties: { by: STAFF_REF, reason: S, at: S },
        },
      }),
    ),
  }),
  timeline: arr(
    obj({
      at: S,
      kind: S,
      actor: obj({ kind: S, name: NS }),
      reference: NS,
      codes: arr(S),
      channel: NS,
      state: NS,
    }),
  ),
  timelineTruncated: B,
  actions: obj({
    edit: B,
    addNote: B,
    recordWithdrawal: B,
    reviewCandidates: B,
    noteVisibilities: arr(S),
  }),
})

export const CUSTOMER_EDIT_BODY = obj({
  displayName: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
  reason: REASON,
})

export const CONTACT_EDIT_BODY = obj({
  fullName: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
  email: { type: 'string', minLength: 3, maxLength: 254, pattern: '^\\s*[^\\s@]+@[^\\s@]+\\.[^\\s@]+\\s*$' },
  phone: { type: 'string', minLength: 7, maxLength: 30, pattern: '^[0-9 ()+.-]+$' },
  preferredChannel: { type: 'string', enum: ['email', 'call', 'text'] },
  reason: REASON,
})

export const NOTE_BODY = obj(
  {
    body: { type: 'string', minLength: 1, maxLength: 5000, pattern: '\\S' },
    visibility: { type: 'string', enum: NOTE_VISIBILITIES },
  },
  ['body'],
)

export const WITHDRAWAL_BODY = obj({
  purpose: { type: 'string', enum: ['transactional_sms', 'marketing'] },
  channel: { type: 'string', enum: ['email', 'sms'] },
  reason: REASON,
})

export const DISMISS_BODY = obj({ reason: REASON })

export const VERSION_RESULT = obj({ id: S, version: I })
export const CREATED = obj({ id: S, createdAt: S })
