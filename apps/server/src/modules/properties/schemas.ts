// Contract schemas of the staff property routes (TSK-0045; HH-CRM-02, HH-CRM-03, HH-API-01). Every response object
// lists its fields; anything else is stripped before it leaves the server. No response schema except the reveal's
// has a field for an access code value.
import { ACCESS_SECRET_KINDS, PROPERTY_DETAILS, PROPERTY_TEXT_DETAILS, STAFF_DETAIL_SOURCES } from '@handyhub/domain'

const S = { type: 'string' } as const
const NS = { type: ['string', 'null'] } as const
const B = { type: 'boolean' } as const
const I = { type: 'integer' } as const
const UUID = { type: 'string', pattern: '^[0-9a-fA-F-]{36}$' } as const

const obj = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: 'object',
  additionalProperties: false,
  required,
  properties,
})
const arr = (items: unknown) => ({ type: 'array', items })

export const PROPERTY_PARAMS = obj({ propertyId: UUID })
export const DETAIL_PARAMS = obj({ propertyId: UUID, detail: { type: 'string', enum: PROPERTY_TEXT_DETAILS } })
export const CONFIRM_PARAMS = obj({ propertyId: UUID, detail: { type: 'string', enum: PROPERTY_DETAILS } })
export const CODE_PARAMS = obj({ propertyId: UUID, codeId: UUID })

/** A written reason: required for every staff change of a property or an access code. */
export const REASON = { type: 'string', minLength: 1, maxLength: 1000, pattern: '\\S' } as const
const SOURCE = { type: 'string', enum: STAFF_DETAIL_SOURCES } as const

const STAFF_REF = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: ['id', 'name'],
  properties: { id: S, name: NS },
}
const ADDRESS = obj({ street: S, unit: NS, city: S, state: S, zip: S })

const COUNTY_VERIFICATION = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: ['state', 'county', 'inArea', 'addressVersion', 'verifiedBy', 'verifiedAt'],
  properties: { state: S, county: S, inArea: B, addressVersion: I, verifiedBy: STAFF_REF, verifiedAt: S },
}

export const PROPERTY_VIEW = obj({
  id: S,
  version: I,
  address: ADDRESS,
  addressVersion: I,
  propertyType: S,
  timeZone: S,
  coverage: S,
  coverageReason: NS,
  countyVerification: COUNTY_VERIFICATION,
  createdAt: S,
  details: arr(
    obj({
      detail: { type: 'string', enum: PROPERTY_DETAILS },
      /** Text details only; null for the address and the type (shown above) and for a detail not recorded. */
      value: NS,
      recorded: B,
      source: NS,
      confirmedAt: NS,
      confirmedBy: STAFF_REF,
    }),
  ),
  formerAddresses: arr(
    obj({ addressVersion: I, address: ADDRESS, source: S, from: S, until: S, recordedBy: STAFF_REF }),
  ),
  customers: arr(obj({ id: S, displayName: S, status: S, relationship: S })),
  requests: arr(
    obj({
      id: S,
      reference: S,
      state: S,
      submittedAt: S,
      address: ADDRESS,
      /** The request was made at an address this property no longer has (it keeps that address, HH-CRM-02). */
      formerAddress: B,
    }),
  ),
  accessCodes: obj({
    /** The caller's role may enter or reveal codes; otherwise the section is not sent at all. */
    visible: B,
    /** not_configured: ACCESS_CODE_ENCRYPTION_KEY is unset; codes cannot be entered or revealed. */
    store: { type: 'string', enum: ['available', 'not_configured'] },
    items: arr(
      obj({
        id: S,
        version: I,
        kind: { type: 'string', enum: ACCESS_SECRET_KINDS },
        label: NS,
        source: S,
        confirmedAt: S,
        confirmedBy: STAFF_REF,
        createdAt: S,
        createdBy: STAFF_REF,
        lastRevealed: {
          type: ['object', 'null'],
          additionalProperties: false,
          required: ['at', 'by'],
          properties: { at: S, by: STAFF_REF },
        },
        reveals: I,
      }),
    ),
    removed: arr(obj({ id: S, kind: S, label: NS, removedAt: S, removedBy: STAFF_REF, reason: S, createdAt: S })),
  }),
  history: arr(obj({ at: S, detail: S, action: S, source: S, by: STAFF_REF, reason: S })),
  actions: obj({ edit: B, setAccessCodes: B, revealAccessCodes: B, verifyCounty: B }),
})

export const ADDRESS_BODY = obj(
  {
    street: { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' },
    unit: { type: ['string', 'null'], maxLength: 50 },
    city: { type: 'string', minLength: 1, maxLength: 100, pattern: '\\S' },
    state: { type: 'string', pattern: '^\\s*[A-Za-z]{2}\\s*$' },
    zip: { type: 'string', pattern: '^\\s*[0-9]{5}(-[0-9]{4})?\\s*$' },
    source: SOURCE,
    reason: REASON,
  },
  ['street', 'city', 'state', 'zip', 'source', 'reason'],
)

/** TSK-0127: staff verified the complete address (this address version) and its county. */
export const COUNTY_BODY = obj(
  {
    addressVersion: { type: 'integer', minimum: 1 },
    addressChecked: { type: 'boolean', const: true },
    state: { type: 'string', pattern: '^\\s*[A-Za-z]{2}\\s*$' },
    county: { type: 'string', minLength: 1, maxLength: 100, pattern: '\\S' },
    note: { type: ['string', 'null'], maxLength: 1000 },
  },
  ['addressVersion', 'addressChecked', 'state', 'county'],
)

export const COUNTY_RESULT = obj({ id: S, inArea: B, state: S, county: S, addressVersion: I })

export const TYPE_BODY = obj({
  propertyType: { type: 'string', enum: ['house', 'apartment_condo', 'townhouse', 'rental_short_term'] },
  source: SOURCE,
  reason: REASON,
})

export const DETAIL_BODY = obj({ value: { type: ['string', 'null'], maxLength: 2000 }, source: SOURCE, reason: REASON })
export const CONFIRM_BODY = obj({ source: SOURCE, reason: REASON })

const CODE_VALUE = { type: 'string', minLength: 1, maxLength: 200, pattern: '\\S' } as const
const LABEL = { type: ['string', 'null'], maxLength: 80 } as const

export const CODE_BODY = obj(
  {
    kind: { type: 'string', enum: ACCESS_SECRET_KINDS },
    label: LABEL,
    value: CODE_VALUE,
    source: SOURCE,
    reason: REASON,
  },
  ['kind', 'value', 'source', 'reason'],
)
export const CODE_REPLACE_BODY = obj({ value: CODE_VALUE, source: SOURCE, reason: REASON })
export const CODE_REMOVE_BODY = obj({ reason: REASON })
export const EMPTY_BODY = obj({}, [])

export const VERSION_RESULT = obj({ id: S, version: I })
export const CODE_CREATED = obj({ id: S, version: I, createdAt: S })
/** The only response that carries a code: no-store, never kept for idempotency, never logged. */
export const REVEALED = obj({ id: S, kind: S, label: NS, value: S, revealedAt: S, hideAt: S })
