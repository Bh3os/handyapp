// JSON schemas of the work package SOP view and the competent-review sign-off (TSK-0068; HH-PKT-03, HH-WORK-11,
// HH-API-01, HH-ARC-04). Input objects refuse unknown fields; response objects list every field.
import { SOP_EVIDENCE_KINDS, SOP_REVIEW_STATES, SOP_STAGES } from '@handyhub/domain'
import { SPANISH_CATEGORIES, type SpanishCategory } from './spanish.js'

const UUID = { type: 'string', format: 'uuid' } as const
const NULLABLE_STRING = { type: ['string', 'null'] } as const
const NULLABLE_INT = { type: ['integer', 'null'] } as const
const DATE_TIME = { type: 'string', format: 'date-time' } as const
const NULLABLE_DATE_TIME = { type: ['string', 'null'], format: 'date-time' } as const

export const WORK_PACKAGE_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['workPackageId'],
  properties: { workPackageId: UUID },
} as const

export const SOP_VERSION_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['sopVersionId'],
  properties: { sopVersionId: UUID },
} as const

export const SIGN_OFF_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['reviewerName', 'reviewerQualification', 'reviewNote'],
  properties: {
    reviewerName: { type: 'string', maxLength: 200 },
    reviewerQualification: { type: 'string', maxLength: 200 },
    reviewNote: { type: 'string', maxLength: 2000 },
  },
} as const

/** One checklist item: its verbatim text, vault line and, by kind, its evidence, controls or table cells. */
const ITEM = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'kind', 'section', 'line', 'text'],
  properties: {
    id: { type: 'string' },
    kind: { type: 'string', enum: ['step', 'control', 'note', 'table'] },
    section: NULLABLE_STRING,
    line: NULLABLE_INT,
    text: { type: 'string' },
    checkbox: { type: 'boolean' },
    evidence: { type: 'array', items: { type: 'string', enum: [...SOP_EVIDENCE_KINDS] } },
    required: { type: 'boolean' },
    holdBefore: { type: 'array', items: { type: 'string' } },
    control: { type: 'string', enum: ['HOLD', 'GATE', 'FLAG'] },
    ref: NULLABLE_STRING,
    table: {
      type: 'object',
      additionalProperties: false,
      required: ['header', 'rows'],
      properties: {
        header: { type: 'array', items: { type: 'string' } },
        rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
      },
    },
  },
} as const
const ITEMS = { type: 'array', items: ITEM } as const

const SIGN_OFF = {
  anyOf: [
    { type: 'null' },
    {
      type: 'object',
      additionalProperties: false,
      required: ['reviewerName', 'reviewerQualification', 'reviewNote', 'signedOffBy', 'signedOffAt'],
      properties: {
        reviewerName: { type: 'string' },
        reviewerQualification: { type: 'string' },
        reviewNote: { type: 'string' },
        signedOffBy: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'name'],
          properties: { id: { type: 'string' }, name: NULLABLE_STRING },
        },
        signedOffAt: DATE_TIME,
      },
    },
  ],
} as const

const STAGES = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['stage', 'key', 'heading', 'steps', 'items'],
    properties: {
      stage: { type: 'integer' },
      key: { type: 'string', enum: [...SOP_STAGES] },
      heading: { type: 'string' },
      steps: { type: 'integer' },
      items: ITEMS,
    },
  },
} as const
const HAZARDS = {
  type: 'object',
  additionalProperties: false,
  required: ['controls', 'stopWork'],
  properties: { controls: ITEMS, stopWork: ITEMS },
} as const
const SPANISH_STATUS = { type: 'string', enum: ['ai_reviewed', 'pending'] } as const
const PASS_FAIL = { type: 'string', enum: ['pass', 'fail'] } as const

/** The Spanish release of the version (TSK-0103): never "human-reviewed"; the text only when released. */
const SPANISH = {
  type: 'object',
  additionalProperties: false,
  required: ['status', 'check', 'title', 'stages', 'hazards'],
  properties: {
    status: SPANISH_STATUS,
    check: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['checkedOn', 'tool', 'englishContentSha256', 'results', 'problems', 'ambiguous'],
          properties: {
            checkedOn: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            tool: { type: 'string' },
            englishContentSha256: { type: 'string' },
            results: {
              type: 'object',
              additionalProperties: false,
              required: [...SPANISH_CATEGORIES],
              properties: Object.fromEntries(SPANISH_CATEGORIES.map((c) => [c, PASS_FAIL])) as Record<
                SpanishCategory,
                typeof PASS_FAIL
              >,
            },
            problems: { type: 'integer' },
            ambiguous: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['item', 'note'],
                properties: { item: { type: 'string' }, note: { type: 'string' } },
              },
            },
          },
        },
      ],
    },
    title: NULLABLE_STRING,
    stages: { anyOf: [{ type: 'null' }, STAGES] },
    hazards: { anyOf: [{ type: 'null' }, HAZARDS] },
  },
} as const

const SOP = {
  anyOf: [
    { type: 'null' },
    {
      type: 'object',
      additionalProperties: false,
      required: [
        'id',
        'sopId',
        'version',
        'title',
        'reviewState',
        'current',
        'spanishStatus',
        'spanish',
        'sourceFile',
        'contentSha256',
        'hazardSha256',
        'qualitySha256',
        'rowVersion',
        'signOff',
        'stages',
        'hazards',
        'openQuestions',
      ],
      properties: {
        id: { type: 'string' },
        sopId: { type: 'string' },
        version: { type: 'integer' },
        title: { type: 'string' },
        reviewState: { type: 'string', enum: [...SOP_REVIEW_STATES] },
        current: { type: 'boolean' },
        spanishStatus: SPANISH_STATUS,
        spanish: SPANISH,
        sourceFile: { type: 'string' },
        contentSha256: { type: 'string' },
        hazardSha256: { type: 'string' },
        qualitySha256: { type: 'string' },
        rowVersion: { type: 'integer' },
        signOff: SIGN_OFF,
        stages: STAGES,
        hazards: HAZARDS,
        openQuestions: ITEMS,
      },
    },
  ],
} as const

export const WORK_PACKAGE_SOP_VIEW = {
  type: 'object',
  additionalProperties: false,
  required: ['workPackage', 'pin', 'readiness', 'sop', 'actions'],
  properties: {
    workPackage: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'projectId', 'serviceId', 'serviceCode', 'position', 'state', 'jobId'],
      properties: {
        id: { type: 'string' },
        projectId: { type: 'string' },
        serviceId: { type: 'string' },
        serviceCode: { type: 'string' },
        position: { type: 'integer' },
        state: { type: 'string' },
        jobId: NULLABLE_STRING,
      },
    },
    pin: {
      type: 'object',
      additionalProperties: false,
      required: ['state', 'pinnedAt', 'source'],
      properties: {
        // no_job: the package is not part of a job yet (no approval); not_configured: no SOP version for the service.
        state: { type: 'string', enum: ['pinned', 'not_configured', 'no_job'] },
        pinnedAt: NULLABLE_DATE_TIME,
        source: { type: ['string', 'null'], enum: ['approval', 'import', null] },
      },
    },
    readiness: {
      type: 'object',
      additionalProperties: false,
      required: ['ok', 'blockers', 'pendingReviewBanner'],
      properties: {
        ok: { type: 'boolean' },
        blockers: { type: 'array', items: { type: 'string' } },
        pendingReviewBanner: { type: 'boolean' },
      },
    },
    sop: SOP,
    actions: {
      type: 'object',
      additionalProperties: false,
      required: ['signOff'],
      properties: { signOff: { type: 'boolean' } },
    },
  },
} as const
