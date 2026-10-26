// JSON schemas of the escalation routes (TSK-0129; HH-API-01, HH-PKT-09). Input objects refuse unknown fields.
import { ESCALATION_ACTIONS } from '@handyhub/domain'

const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
const UUID = { type: 'string', pattern: UUID_PATTERN } as const
const STR = { type: 'string' } as const
const STR_OR_NULL = { type: ['string', 'null'] } as const
const BOOL = { type: 'boolean' } as const
const INT = { type: 'integer' } as const
const TIME = { type: 'string', format: 'date-time' } as const
const TIME_OR_NULL = { type: ['string', 'null'], format: 'date-time' } as const
const en = (values: readonly string[]) => ({ type: 'string', enum: [...values] }) as const

function obj(properties: Record<string, unknown>) {
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties } as const
}
function input(properties: Record<string, unknown>, optional: readonly string[] = []) {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties).filter((k) => !optional.includes(k)),
    properties,
  } as const
}

export const JOB_PARAMS = obj({ jobId: UUID })

/** The Owner's escalation contact as packets and Stop Work show it: the number, or NOT CONFIGURED. */
export const OWNER_CONTACT = {
  anyOf: [
    obj({ state: en(['configured']), phone: STR, display: STR, tel: STR }),
    obj({ state: en(['not_configured']) }),
  ],
} as const

/** Call 911: always present, a phone link. */
export const EMERGENCY = obj({ call911: STR })

export const OWN_PHONE = obj({
  state: en(['CONFIGURED', 'NOT_CONFIGURED']),
  phone: STR_OR_NULL,
  display: STR_OR_NULL,
  version: INT,
  updatedAt: TIME_OR_NULL,
})

/** The number as typed (normalized on the server), or null to clear it. */
export const OWN_PHONE_BODY = input({ phone: { type: ['string', 'null'], maxLength: 40 } })

export const CALL_BODY = input(
  {
    clientId: UUID,
    action: en(ESCALATION_ACTIONS),
    // Lenient on purpose: a visit or report the server cannot place on the job is left out, never refused.
    visitId: STR,
    reportId: STR,
    deviceRecordedAt: TIME,
  },
  ['visitId', 'reportId'],
)

export const CALL = obj({
  clientId: STR,
  action: en(ESCALATION_ACTIONS),
  visitId: STR_OR_NULL,
  reportId: STR_OR_NULL,
  recordedBy: obj({ id: STR, name: STR_OR_NULL }),
  deviceRecordedAt: TIME,
  receivedAt: TIME,
})

export const CALL_RESULT = obj({
  clientId: STR,
  jobId: STR,
  action: en(ESCALATION_ACTIONS),
  alreadyRecorded: BOOL,
  deviceRecordedAt: TIME,
  receivedAt: TIME,
  // Owner unreachable and no emergency: the affected work stays paused (OWN-DEC-208 reading 10).
  workStaysPaused: BOOL,
  owner: OWNER_CONTACT,
  emergency: EMERGENCY,
})
