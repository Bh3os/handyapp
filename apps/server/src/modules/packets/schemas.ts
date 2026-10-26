// JSON schemas of the job packet routes (TSK-0069; HH-API-01, HH-ARC-04). Input objects refuse unknown fields; response
// objects list every field, so nothing else (an access code above all) can reach a response.
import { ACKNOWLEDGMENT_INVALIDATIONS, ACKNOWLEDGMENT_STATES, PACKET_SECTIONS } from '@handyhub/domain'
import { OWNER_CONTACT } from '../escalation/schemas.js'

const UUID = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
} as const
const STR = { type: 'string' } as const
const STR_OR_NULL = { type: ['string', 'null'] } as const
const INT = { type: 'integer' } as const
const INT_OR_NULL = { type: ['integer', 'null'] } as const
const TIME = { type: 'string', format: 'date-time' } as const
const STRINGS = { type: 'array', items: STR } as const

function obj(properties: Record<string, unknown>, nullable = false) {
  return {
    type: nullable ? ['object', 'null'] : 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  } as const
}
const arr = (items: unknown) => ({ type: 'array', items }) as const

export const JOB_PARAMS = obj({ jobId: UUID })
export const VERSION_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['version'],
  properties: { version: { type: 'integer', minimum: 1 } },
} as const
export const PRINT_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'format'],
  properties: { version: { type: 'integer', minimum: 1 }, format: { type: 'string', enum: ['print'] } },
} as const
/** An acknowledgment names the exact version and content the worker reviewed (TSK-0072). */
export const ACKNOWLEDGE_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'contentSha256'],
  properties: {
    version: { type: 'integer', minimum: 1 },
    contentSha256: { type: 'string', pattern: '^[0-9a-f]{64}$' },
  },
} as const
export const PDF_QUERY = {
  type: 'object',
  additionalProperties: false,
  properties: { version: { type: 'integer', minimum: 1 } },
} as const

const CHANGE = obj({
  section: { type: 'string', enum: [...PACKET_SECTIONS] },
  code: STR,
  critical: { type: 'boolean' },
  ref: STR_OR_NULL,
  from: { type: ['string', 'integer', 'null'] },
  to: { type: ['string', 'integer', 'null'] },
})
const DETAIL = obj({ detail: STR, value: STR_OR_NULL, source: STR, confirmedAt: STR })
const WORKER = obj({ staffUserId: STR, name: STR_OR_NULL, role: STR })
const EVIDENCE_ITEM = obj({
  workPackageId: STR,
  serviceCode: STR,
  stage: STR,
  itemId: STR,
  text: STR,
  evidence: STRINGS,
  line: INT_OR_NULL,
})
const SOP_PIN = obj({
  workPackageId: STR,
  serviceId: STR,
  serviceCode: STR,
  state: { type: 'string', enum: ['pinned', 'not_configured'] },
  sopVersionId: STR_OR_NULL,
  sopId: STR_OR_NULL,
  version: INT_OR_NULL,
  title: STR_OR_NULL,
  reviewState: STR_OR_NULL,
  spanishStatus: STR_OR_NULL,
  contentSha256: STR_OR_NULL,
  hazardSha256: STR_OR_NULL,
  qualitySha256: STR_OR_NULL,
})

export const PACKET_VIEW = obj({
  job: obj({ id: STR, projectId: STR, projectReference: STR, jobState: STR }),
  packet: obj({
    id: STR,
    version: INT,
    contentSha256: STR,
    generatedAt: TIME,
    critical: { type: 'boolean' },
    changes: arr(CHANGE),
  }),
  freshness: obj({
    firstGeneratedAt: TIME,
    lastUpdatedAt: TIME,
    checkedAt: TIME,
    latestVersion: INT,
    current: { type: 'boolean' },
  }),
  review: obj({
    lastViewed: obj({ version: INT, viewedAt: TIME }, true),
    fromVersion: INT_OR_NULL,
    changes: arr(CHANGE),
    critical: { type: 'boolean' },
  }),
  services: arr(obj({ workPackageId: STR, serviceId: STR, serviceCode: STR, position: INT, state: STR })),
  visits: arr(
    obj({
      visitId: STR,
      number: INT,
      purpose: STR,
      state: STR,
      localDate: STR,
      windowStart: STR,
      windowEnd: STR,
      timeZone: STR,
      windowVersion: INT,
      team: arr(WORKER),
      equipment: arr(obj({ equipmentId: STR, name: STR })),
      requested: STRINGS,
    }),
  ),
  site: obj({
    propertyId: STR,
    address: obj({ street: STR, unit: STR_OR_NULL, city: STR, state: STR, zip: STR }, true),
    addressVersion: INT,
    directionsUrl: STR_OR_NULL,
    propertyType: STR,
    timeZone: STR_OR_NULL,
    details: arr(DETAIL),
    accessCodes: arr(obj({ id: STR, kind: STR, label: STR_OR_NULL, confirmedAt: STR })),
  }),
  occupants: arr(DETAIL),
  scope: obj({
    snapshotId: STR_OR_NULL,
    version: INT_OR_NULL,
    source: STR_OR_NULL,
    createdAt: STR_OR_NULL,
    lines: arr(
      obj({
        position: INT,
        kind: STR,
        serviceCode: STR_OR_NULL,
        description: STR_OR_NULL,
        quantity: STR_OR_NULL,
        unit: STR_OR_NULL,
      }),
    ),
    texts: obj({
      assumptions: STRINGS,
      exclusions: STRINGS,
      customerResponsibilities: STRINGS,
      dependencies: STRINGS,
      scheduleAssumptions: STRINGS,
      // TSK-0082: the scope and hazards of each approved change order.
      changeOrderScope: STRINGS,
      changeOrderHazards: STRINGS,
    }),
    selectedOptions: arr(INT),
    history: arr(obj({ version: INT, source: STR, createdAt: STR })),
  }),
  evidence: obj({ photos: arr(obj({ id: STR, uploadedAt: STR, uploaderKind: STR, url: STR_OR_NULL })) }),
  sop: obj({ packages: arr(SOP_PIN), preWork: arr(EVIDENCE_ITEM), completion: arr(EVIDENCE_ITEM) }),
  holds: arr(
    obj({ holdId: STR, kind: STR, category: STR, scopeType: STR, state: STR, note: STR, source: STR, raisedAt: STR }),
  ),
  dependencies: obj({
    approvedAt: STR,
    deposit: obj({ required: { type: 'boolean' }, state: STR }, true),
    jobState: STR,
    blockingHolds: INT,
    liveVisits: INT,
  }),
  materials: obj({
    state: { type: 'string', enum: ['listed', 'not_recorded'] },
    packages: arr(
      obj({
        workPackageId: STR,
        serviceCode: STR,
        state: { type: 'string', enum: ['pinned', 'not_configured'] },
        version: INT_OR_NULL,
        items: arr(obj({ key: STR, group: STR_OR_NULL, name: STR_OR_NULL, criticality: STR })),
      }),
    ),
  }),
  careNotes: obj({ state: { type: 'string', enum: ['none_approved'] } }),
  communication: obj({
    siteContact: { ...DETAIL, type: ['object', 'null'] },
    // TSK-0129: the number the Owner entered in their own profile, or NOT CONFIGURED; Call 911 always.
    escalationContact: OWNER_CONTACT,
    emergency: obj({ call911: STR }),
    stopWork: arr(
      obj({ workPackageId: STR, serviceCode: STR, items: arr(obj({ id: STR, text: STR, line: INT_OR_NULL })) }),
    ),
  }),
})

const ACK_STATE = { type: 'string', enum: [...ACKNOWLEDGMENT_STATES] } as const
const INVALIDATION_REASON = { type: 'string', enum: [...ACKNOWLEDGMENT_INVALIDATIONS] } as const
const TIME_OR_NULL = { type: ['string', 'null'], format: 'date-time' } as const

/** Where the caller's own acknowledgment stands, and each assigned worker's (TSK-0072, HH-DATA-08, HH-WORK-10). */
const ACKNOWLEDGMENTS = obj({
  mine: obj({
    state: ACK_STATE,
    assigned: { type: 'boolean' },
    acknowledgment: obj({ version: INT, acknowledgedAt: TIME }, true),
    invalidation: obj({ reason: INVALIDATION_REASON, version: INT_OR_NULL, invalidatedAt: TIME }, true),
    changesSince: arr(CHANGE),
  }),
  team: arr(
    obj({
      staffUserId: STR,
      name: STR_OR_NULL,
      state: ACK_STATE,
      version: INT_OR_NULL,
      acknowledgedAt: TIME_OR_NULL,
      invalidation: { type: ['string', 'null'], enum: [...ACKNOWLEDGMENT_INVALIDATIONS, null] },
    }),
  ),
})

/**
 * The packet view with where acknowledgments stand and what the caller may do on it (the Reveal button and the
 * acknowledgment; the server decides again when either is pressed).
 */
export const PACKET_VIEW_WITH_ACTIONS = {
  ...PACKET_VIEW,
  required: [...PACKET_VIEW.required, 'acknowledgments', 'actions'],
  properties: {
    ...PACKET_VIEW.properties,
    acknowledgments: ACKNOWLEDGMENTS,
    actions: obj({ revealAccessCodes: { type: 'boolean' }, acknowledge: { type: 'boolean' } }),
  },
} as const

export const ACKNOWLEDGED = obj({
  acknowledgmentId: STR,
  version: INT,
  acknowledgedAt: TIME,
  created: { type: 'boolean' },
  state: ACK_STATE,
})

export const VERSIONS_VIEW = obj({
  versions: arr(obj({ version: INT, generatedAt: TIME, critical: { type: 'boolean' }, changes: arr(CHANGE) })),
})

export const VIEW_RECORDED = obj({ version: INT, viewedAt: TIME })

export const EXPORT_RECORDED = obj({
  exportId: STR,
  version: INT,
  latestVersion: INT,
  current: { type: 'boolean' },
  format: STR,
  exportedAt: TIME,
})

export const MY_PACKETS = obj({
  packets: arr(
    obj({
      jobId: STR,
      projectReference: STR,
      version: INT,
      lastViewedVersion: INT_OR_NULL,
      changedSinceViewed: { type: 'boolean' },
      criticalSinceViewed: { type: 'boolean' },
      acknowledgment: ACK_STATE,
      acknowledgedVersion: INT_OR_NULL,
      visits: arr(
        obj({
          visitId: STR,
          number: INT,
          purpose: STR,
          state: STR,
          localDate: STR,
          windowStart: STR,
          windowEnd: STR,
          timeZone: STR,
          role: STR,
        }),
      ),
    }),
  ),
})

export const FILE = { type: 'string', format: 'binary' } as const
