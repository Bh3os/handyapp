// JSON schemas of the case routes (TSK-0093; HH-API-01, HH-ARC-04, HH-INC-02). Input objects refuse unknown fields:
// there is no fault, liability, coverage or compensation field to send. Response objects list every field, so a
// projection can never carry more than it declares (the restricted section has its own response).
import {
  CASE_EVENTS,
  CASE_KINDS,
  CASE_SEVERITIES,
  CASE_SOURCES,
  CASE_STATES,
  COMPLAINT_CATEGORIES,
  COMPLAINT_SOURCES,
  CUSTOMER_UPDATE_DETAIL_MAX,
  CUSTOMER_UPDATE_KINDS,
  FOLLOW_UP_STATES,
  INCIDENT_TYPES,
  REFERRAL_PROFESSIONALS,
  REVIEW_AREAS,
} from '@handyhub/domain'

const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const UUID = { type: 'string', pattern: UUID_PATTERN } as const
const UUID_OR_NULL = { type: ['string', 'null'], pattern: UUID_PATTERN } as const
const STR = { type: 'string' } as const
const STR_OR_NULL = { type: ['string', 'null'] } as const
const INT = { type: 'integer' } as const
const BOOL = { type: 'boolean' } as const
const TIME = { type: 'string', format: 'date-time' } as const
const TIME_OR_NULL = { type: ['string', 'null'], format: 'date-time' } as const
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const
const DATE_OR_NULL = { type: ['string', 'null'], pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const
const TEXT = (max: number) => ({ type: 'string', minLength: 1, maxLength: max, pattern: '\\S' }) as const
const en = (values: readonly string[]) => ({ type: 'string', enum: [...values] }) as const
const enOrNull = (values: readonly string[]) => ({ type: ['string', 'null'], enum: [...values, null] }) as const

function obj(properties: Record<string, unknown>) {
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties } as const
}
const nullable = (schema: Record<string, unknown>) => ({ anyOf: [{ type: 'null' }, schema] }) as const
function input(properties: Record<string, unknown>, optional: readonly string[] = []) {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties).filter((k) => !optional.includes(k)),
    properties,
  } as const
}
const arr = (items: unknown) => ({ type: 'array', items }) as const
const STAFF_REF = obj({ id: STR, name: STR_OR_NULL })
const STAFF_REF_OR_NULL = nullable(STAFF_REF)

export const CASE_PARAMS = obj({ caseId: UUID })
export const PROJECT_PARAMS = obj({ projectId: UUID })
export const JOB_PARAMS = obj({ jobId: UUID })
export const ATTACHMENT_PARAMS = obj({ caseId: UUID, attachmentId: UUID })
export const FOLLOW_UP_PARAMS = obj({ followUpId: UUID })
export const UPDATE_PARAMS = obj({ updateId: UUID })
export const NO_QUERY = input({})
export const LIST_QUERY = input({ state: en(['open', 'closed', 'all']) }, ['state'])

export const COMPLAINT_BODY = input(
  {
    category: en(COMPLAINT_CATEGORIES),
    severity: en(CASE_SEVERITIES),
    source: en(COMPLAINT_SOURCES),
    assignedTo: UUID,
    dueOn: DATE,
    description: TEXT(4000),
    jobId: UUID,
  },
  ['jobId'],
)

export const INCIDENT_BODY = input(
  {
    type: en(INCIDENT_TYPES),
    source: en(CASE_SOURCES),
    occurredAt: TIME,
    whatHappened: TEXT(4000),
    peopleAffected: TEXT(1000),
    workAreas: TEXT(1000),
    immediateActions: TEXT(2000),
    medicalDetail: TEXT(1000),
  },
  ['source', 'occurredAt', 'peopleAffected', 'workAreas', 'immediateActions', 'medicalDetail'],
)

export const CREATED = obj({ caseId: STR, number: INT, kind: en(CASE_KINDS), state: en(CASE_STATES), version: INT })

export const NOTE_BODY = input({ body: TEXT(4000), source: en(CASE_SOURCES) }, ['source'])
export const RESTRICTED_NOTE_BODY = input({ body: TEXT(4000) })
export const NOTE_RESULT = obj({ noteId: STR, writtenAt: TIME })
export const ATTACHMENT_RESULT = obj({ attachmentId: STR, uploadedAt: TIME, created: BOOL })
export const FILE = { type: 'string', format: 'binary' } as const

export const HANDLING_BODY = input({ severity: en(CASE_SEVERITIES), assignedTo: UUID_OR_NULL, dueOn: DATE_OR_NULL }, [
  'severity',
  'assignedTo',
  'dueOn',
])
export const HOLD_LINK_BODY = input({ holdId: UUID_OR_NULL })
export const VERSION_RESULT = obj({ caseId: STR, version: INT })

/** Each event's body: only what that event records (OQ-CASE-DETAILS). */
export const EVENT_BODIES: Readonly<Record<(typeof CASE_EVENTS)[number], Record<string, unknown>>> = {
  acknowledge: input({ note: TEXT(2000) }, ['note']),
  investigate: input({ note: TEXT(2000) }, ['note']),
  await_action: input({ note: TEXT(2000) }, ['note']),
  resolve: input({ resolution: TEXT(2000), recheckRequired: BOOL }),
  submit_resolution: input({ resolution: TEXT(2000), recheckRequired: BOOL }),
  reopen: input({ reason: TEXT(2000) }),
  triage: input({ severity: en(CASE_SEVERITIES), note: TEXT(2000) }, ['note']),
  return_to_action: input({ note: TEXT(2000) }),
  close: input({ note: TEXT(2000) }, ['note']),
}
export const EVENT_RESULT = obj({ caseId: STR, from: en(CASE_STATES), state: en(CASE_STATES), version: INT })

export const RECHECK_BODY = input({ note: TEXT(1000) })
export const FOLLOW_UP_BODY = input({ description: TEXT(1000), assignedTo: UUID, dueOn: DATE })
export const FOLLOW_UP_RESULT = obj({ followUpId: STR, state: en(FOLLOW_UP_STATES), version: INT })
export const SETTLE_BODY = input({ note: TEXT(1000) })
export const REFERRAL_BODY = input({ professional: en(REFERRAL_PROFESSIONALS), note: TEXT(1000), referredOn: DATE })
export const REFERRAL_RESULT = obj({ referralId: STR, recordedAt: TIME })
export const UPDATE_BODY = input({ kind: en(CUSTOMER_UPDATE_KINDS), detail: TEXT(CUSTOMER_UPDATE_DETAIL_MAX) }, [
  'detail',
])
export const UPDATE_RESULT = obj({
  updateId: STR,
  kind: en(CUSTOMER_UPDATE_KINDS),
  state: en(['draft', 'released', 'withdrawn']),
  version: INT,
})

const SUMMARY_FIELDS = {
  id: STR,
  number: INT,
  projectId: STR,
  projectReference: STR,
  restricted: BOOL,
  // null when the caller sees only that the case exists and its status (OWN-DEC-143).
  kind: enOrNull(CASE_KINDS),
  state: en(CASE_STATES),
  reportedAt: TIME,
  closedAt: TIME_OR_NULL,
  version: INT,
}
export const CASE_LIST = obj({
  cases: arr(
    obj({
      ...SUMMARY_FIELDS,
      category: enOrNull(COMPLAINT_CATEGORIES),
      severity: enOrNull(CASE_SEVERITIES),
      dueOn: DATE_OR_NULL,
      assignedTo: STR_OR_NULL,
    }),
  ),
})

const DETAIL = obj({
  jobId: STR_OR_NULL,
  incidentType: enOrNull(INCIDENT_TYPES),
  category: enOrNull(COMPLAINT_CATEGORIES),
  severity: enOrNull(CASE_SEVERITIES),
  source: en(CASE_SOURCES),
  reportedBy: STAFF_REF_OR_NULL,
  assignedTo: STAFF_REF_OR_NULL,
  dueOn: DATE_OR_NULL,
  reviewer: STAFF_REF_OR_NULL,
  reviewAreas: arr(en(REVIEW_AREAS)),
  hold: nullable(obj({ id: STR, kind: STR, state: STR, category: STR })),
  holdOptions: arr(obj({ id: STR, kind: STR, state: STR, category: STR })),
  hazardReportId: STR_OR_NULL,
  resolution: STR_OR_NULL,
  resolvedBy: STAFF_REF_OR_NULL,
  resolvedAt: TIME_OR_NULL,
  recheckRequired: BOOL,
  recheck: nullable(obj({ note: STR, by: STAFF_REF_OR_NULL, at: TIME })),
  closedBy: STAFF_REF_OR_NULL,
  reopenCount: INT,
  followUps: arr(
    obj({
      id: STR,
      description: STR,
      assignedTo: STAFF_REF_OR_NULL,
      dueOn: DATE_OR_NULL,
      state: en(FOLLOW_UP_STATES),
      doneNote: STR_OR_NULL,
      doneBy: STAFF_REF_OR_NULL,
      doneAt: TIME_OR_NULL,
      version: INT,
    }),
  ),
  customerUpdates: arr(
    obj({
      id: STR,
      kind: en(CUSTOMER_UPDATE_KINDS),
      body: STR,
      state: en(['draft', 'released', 'withdrawn']),
      draftedBy: STAFF_REF_OR_NULL,
      draftedAt: TIME,
      releasedBy: STAFF_REF_OR_NULL,
      releasedAt: TIME_OR_NULL,
      version: INT,
    }),
  ),
  notes: arr(
    obj({
      id: STR,
      kind: en(['description', 'addition', 'note']),
      source: enOrNull(CASE_SOURCES),
      body: STR,
      writtenBy: STAFF_REF_OR_NULL,
      writtenAt: TIME,
    }),
  ),
  attachments: arr(obj({ id: STR, contentType: STR, byteSize: INT, uploadedBy: STAFF_REF_OR_NULL, uploadedAt: TIME })),
  referrals: nullable(
    arr(
      obj({
        id: STR,
        professional: en(REFERRAL_PROFESSIONALS),
        note: STR,
        referredOn: DATE,
        recordedBy: STAFF_REF_OR_NULL,
        recordedAt: TIME,
      }),
    ),
  ),
  history: arr(obj({ event: STR, from: STR_OR_NULL, to: STR, by: STAFF_REF_OR_NULL, note: STR_OR_NULL, at: TIME })),
  actions: obj({
    events: arr(en(CASE_EVENTS)),
    manage: BOOL,
    linkHold: BOOL,
    recheck: BOOL,
    refer: BOOL,
    restricted: BOOL,
  }),
})
export const CASE_VIEW = obj({ ...SUMMARY_FIELDS, detail: nullable(DETAIL) })

export const RESTRICTED_VIEW = obj({
  caseId: STR,
  number: INT,
  projectReference: STR,
  jobId: STR_OR_NULL,
  kind: en(CASE_KINDS),
  incidentType: enOrNull(INCIDENT_TYPES),
  state: en(CASE_STATES),
  reportedBy: STAFF_REF_OR_NULL,
  reportedAt: TIME,
  report: nullable(
    obj({
      occurredAt: TIME_OR_NULL,
      whatHappened: STR,
      peopleAffected: STR_OR_NULL,
      workAreas: STR_OR_NULL,
      immediateActions: STR_OR_NULL,
      medicalDetail: STR_OR_NULL,
      recordedAt: TIME,
    }),
  ),
  notes: arr(obj({ id: STR, body: STR, writtenBy: STAFF_REF_OR_NULL, writtenAt: TIME })),
  attachments: arr(obj({ id: STR, contentType: STR, byteSize: INT, uploadedBy: STAFF_REF_OR_NULL, uploadedAt: TIME })),
})

export const JOB_REPORTS = obj({
  reports: arr(
    obj({
      id: STR,
      number: INT,
      kind: en(CASE_KINDS),
      incidentType: enOrNull(INCIDENT_TYPES),
      state: en(CASE_STATES),
      reportedAt: TIME,
    }),
  ),
})

export const CUSTOMER_PARAMS = obj({ reference: { type: 'string', minLength: 1, maxLength: 40 } })

export const ASSIGNEES = obj({ staff: arr(STAFF_REF) })
