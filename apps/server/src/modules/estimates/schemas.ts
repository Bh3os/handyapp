// JSON schemas of the staff estimate routes (TSK-0053; HH-API-01, HH-ARC-04). Input objects refuse unknown fields;
// response objects list every field, so nothing undeclared (an internal value in particular) leaves the server.
import { LINE_KINDS } from '@handyhub/money'
import { CONFIG_KEYS } from '../../platform/config/index.js'
import { OWNER_APPROVAL } from '../approvals/schemas.js'
import { DOCUMENT_ROLES, DOCUMENT_SOURCES, DOCUMENT_STATES } from './documents.js'
import { LIFECYCLE } from './lifecycle-schemas.js'
import { DRAFT_LIMITS, QUANTITY_SOURCES, TEXT_LISTS } from './model.js'
import { PUBLISH_PROBLEM_CODES } from './readiness.js'

export const UUID = {
  type: 'string',
  pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
} as const

export const PROJECT_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: { projectId: UUID },
} as const

export const VERSION_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['versionId'],
  properties: { versionId: UUID },
} as const

const NULLABLE_STRING = { type: ['string', 'null'] } as const
const NULLABLE_INT = { type: ['integer', 'null'] } as const
const STRING_LIST = { type: 'array', items: { type: 'string' } } as const
const STAFF_REF = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name'],
  properties: { id: { type: 'string' }, name: NULLABLE_STRING },
} as const

const textList = {
  type: 'array',
  maxItems: DRAFT_LIMITS.listEntries,
  items: { type: 'string', maxLength: DRAFT_LIMITS.listEntryLength },
} as const

/** The whole draft content (saveDraft); amounts and totals are never accepted from the client (HH-EST-03). */
export const DRAFT_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['lines'],
  properties: {
    lines: {
      type: 'array',
      maxItems: DRAFT_LIMITS.lines,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: UUID,
          kind: { type: 'string', enum: [...LINE_KINDS] },
          workPackageId: { anyOf: [UUID, { type: 'null' }] },
          description: { type: ['string', 'null'], maxLength: 2000 },
          // A plain decimal in the line's unit, or null while unknown (never zero for unknown).
          quantity: { type: ['string', 'null'], maxLength: 20 },
          unit: { type: ['string', 'null'], maxLength: 40 },
          quantitySource: { type: ['string', 'null'], enum: [...QUANTITY_SOURCES, null] },
          unitPriceCents: NULLABLE_INT,
          internalCost: {
            anyOf: [
              { type: 'null' },
              {
                type: 'object',
                additionalProperties: false,
                properties: {
                  materialCostCents: NULLABLE_INT,
                  laborCostCents: NULLABLE_INT,
                  note: { type: ['string', 'null'], maxLength: 2000 },
                },
              },
            ],
          },
        },
      },
    },
    discountCategory: { type: ['string', 'null'], maxLength: 40 },
    texts: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(TEXT_LISTS.map((k) => [k, textList])),
    },
    internal: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          properties: {
            markupAssumptions: { type: ['string', 'null'], maxLength: DRAFT_LIMITS.internalText },
            estimatorNotes: { type: ['string', 'null'], maxLength: DRAFT_LIMITS.internalText },
          },
        },
      ],
    },
  },
} as const

export const CREATE_RESULT = {
  type: 'object',
  additionalProperties: false,
  required: ['estimateId', 'number', 'versionId', 'version', 'rowVersion'],
  properties: {
    estimateId: { type: 'string' },
    number: { type: 'string' },
    versionId: { type: 'string' },
    version: { type: 'integer' },
    rowVersion: { type: 'integer' },
  },
} as const

const PROBLEM = {
  type: 'object',
  additionalProperties: false,
  required: ['code'],
  properties: {
    code: { type: 'string', enum: [...PUBLISH_PROBLEM_CODES] },
    line: { type: 'integer' },
    key: { type: 'string', enum: Object.keys(CONFIG_KEYS) },
    sourceIds: STRING_LIST,
  },
} as const

export const READINESS = {
  type: 'object',
  additionalProperties: false,
  required: ['ready', 'problems'],
  properties: { ready: { type: 'boolean' }, problems: { type: 'array', items: PROBLEM } },
} as const

const LINE = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'position',
    'kind',
    'workPackageId',
    'serviceCode',
    'description',
    'quantity',
    'unit',
    'quantitySource',
    'unitPriceCents',
    'amountCents',
  ],
  properties: {
    id: { type: 'string' },
    position: { type: 'integer' },
    kind: { type: 'string', enum: [...LINE_KINDS] },
    workPackageId: NULLABLE_STRING,
    serviceCode: NULLABLE_STRING,
    description: NULLABLE_STRING,
    quantity: NULLABLE_STRING,
    unit: NULLABLE_STRING,
    quantitySource: NULLABLE_STRING,
    unitPriceCents: NULLABLE_INT,
    amountCents: NULLABLE_INT,
  },
} as const

const INTERNAL = {
  anyOf: [
    { type: 'null' },
    {
      type: 'object',
      additionalProperties: false,
      required: ['lines', 'baseMargin', 'markupAssumptions', 'estimatorNotes'],
      properties: {
        lines: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['lineId', 'materialCostCents', 'laborCostCents', 'note'],
            properties: {
              lineId: { type: 'string' },
              materialCostCents: NULLABLE_INT,
              laborCostCents: NULLABLE_INT,
              note: NULLABLE_STRING,
            },
          },
        },
        baseMargin: {
          anyOf: [
            { type: 'null' },
            {
              type: 'object',
              additionalProperties: false,
              required: ['cost', 'margin'],
              properties: { cost: { type: 'integer' }, margin: { type: 'integer' } },
            },
          ],
        },
        markupAssumptions: NULLABLE_STRING,
        estimatorNotes: NULLABLE_STRING,
      },
    },
  ],
} as const

const TOTALS = {
  anyOf: [
    { type: 'null' },
    {
      type: 'object',
      additionalProperties: false,
      required: ['subtotalCents', 'discount', 'totalCents', 'depositState', 'depositCents', 'computedAt'],
      properties: {
        subtotalCents: { type: 'integer' },
        discount: {
          anyOf: [
            { type: 'null' },
            {
              type: 'object',
              additionalProperties: false,
              required: ['category', 'percentBps', 'amountCents'],
              properties: {
                category: { type: 'string' },
                percentBps: { type: 'integer' },
                amountCents: { type: 'integer' },
              },
            },
          ],
        },
        totalCents: { type: 'integer' },
        depositState: { type: 'string', enum: ['not_required', 'required', 'not_configured'] },
        depositCents: NULLABLE_INT,
        computedAt: { type: ['string', 'null'], format: 'date-time' },
      },
    },
  ],
} as const

const DOCUMENT = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'role', 'source', 'contentType', 'byteSize', 'sha256', 'state', 'rejectionReason', 'uploadedAt'],
  properties: {
    id: { type: 'string' },
    role: { type: 'string', enum: [...DOCUMENT_ROLES] },
    source: { type: 'string', enum: [...DOCUMENT_SOURCES] },
    contentType: { type: 'string' },
    byteSize: { type: 'integer' },
    sha256: { type: 'string' },
    state: { type: 'string', enum: [...DOCUMENT_STATES] },
    rejectionReason: NULLABLE_STRING,
    uploadedAt: { type: 'string', format: 'date-time' },
  },
} as const
const NULLABLE_DOCUMENT = { anyOf: [{ type: 'null' }, DOCUMENT] } as const

/** Uploaded versions (TSK-0054): the current documents, "PDF required" and the agree-confirmation; null if written. */
const DOCUMENTS = {
  anyOf: [
    { type: 'null' },
    {
      type: 'object',
      additionalProperties: false,
      required: ['original', 'customerPdf', 'pdfRequired', 'agreement', 'maxFileBytes', 'types'],
      properties: {
        original: NULLABLE_DOCUMENT,
        customerPdf: NULLABLE_DOCUMENT,
        pdfRequired: { type: 'boolean' },
        agreement: {
          anyOf: [
            { type: 'null' },
            {
              type: 'object',
              additionalProperties: false,
              required: ['confirmedBy', 'confirmedAt', 'documentId', 'current'],
              properties: {
                confirmedBy: STAFF_REF,
                confirmedAt: { type: 'string', format: 'date-time' },
                documentId: { type: 'string' },
                current: { type: 'boolean' },
              },
            },
          ],
        },
        maxFileBytes: NULLABLE_INT,
        types: STRING_LIST,
      },
    },
  ],
} as const

export const AGREEMENT_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['confirmed'],
  properties: { confirmed: { type: 'boolean' } },
} as const

export const DOCUMENT_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['versionId', 'documentId'],
  properties: { versionId: UUID, documentId: UUID },
} as const

/** A file answer (a PDF or Word document): the bytes themselves. */
export const FILE = { type: 'string', format: 'binary' } as const

/** The builder's view of one version (staff only). */
export const VERSION_VIEW = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'estimateId',
    'estimateNumber',
    'version',
    'state',
    'rowVersion',
    'authoringMethod',
    'currency',
    'project',
    'customer',
    'property',
    'request',
    'preparedBy',
    'createdAt',
    'updatedAt',
    'lines',
    'texts',
    'discountCategory',
    'totals',
    'paymentTerm',
    'document',
    'workPackages',
    'readiness',
    'internal',
    'documents',
    'canEdit',
    'lifecycle',
    'ownerApproval',
  ],
  properties: {
    id: { type: 'string' },
    estimateId: { type: 'string' },
    estimateNumber: { type: 'string' },
    version: { type: 'integer' },
    state: { type: 'string' },
    rowVersion: { type: 'integer' },
    authoringMethod: { type: 'string', enum: ['written', 'uploaded'] },
    currency: { type: 'string', enum: ['USD'] },
    project: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'reference', 'state'],
      properties: { id: { type: 'string' }, reference: { type: 'string' }, state: { type: 'string' } },
    },
    customer: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: { name: { type: 'string' } },
    },
    property: {
      type: 'object',
      additionalProperties: false,
      required: ['street', 'unit', 'city', 'state', 'zip'],
      properties: {
        street: { type: 'string' },
        unit: NULLABLE_STRING,
        city: { type: 'string' },
        state: { type: 'string' },
        zip: { type: 'string' },
      },
    },
    request: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'reference'],
          properties: { id: { type: 'string' }, reference: { type: 'string' } },
        },
      ],
    },
    preparedBy: STAFF_REF,
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    lines: { type: 'array', items: LINE },
    texts: {
      type: 'object',
      additionalProperties: false,
      required: [...TEXT_LISTS],
      properties: Object.fromEntries(TEXT_LISTS.map((k) => [k, STRING_LIST])),
    },
    discountCategory: NULLABLE_STRING,
    totals: TOTALS,
    paymentTerm: { type: 'string' },
    document: {
      type: 'object',
      additionalProperties: false,
      required: ['issuerName', 'mailingAddress', 'validityDays', 'termsDocumentId', 'discountCategories'],
      properties: {
        issuerName: NULLABLE_STRING,
        mailingAddress: { type: ['array', 'null'], items: { type: 'string' } },
        validityDays: NULLABLE_INT,
        termsDocumentId: NULLABLE_STRING,
        discountCategories: { type: ['array', 'null'], items: { type: 'string' } },
      },
    },
    workPackages: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'serviceCode', 'position'],
        properties: { id: { type: 'string' }, serviceCode: { type: 'string' }, position: { type: 'integer' } },
      },
    },
    readiness: READINESS,
    internal: INTERNAL,
    documents: DOCUMENTS,
    canEdit: { type: 'boolean' },
    // TSK-0055: what publishing pinned, the lifecycle actions the caller may take and the version history.
    lifecycle: LIFECYCLE,
    // TSK-0130 (HH-EST-16): the Owner's approval before publishing over the threshold.
    ownerApproval: OWNER_APPROVAL,
  },
} as const

const VERSION_SUMMARY = {
  type: 'object',
  additionalProperties: false,
  required: ['versionId', 'version', 'state', 'totalCents', 'updatedAt'],
  properties: {
    versionId: { type: 'string' },
    version: { type: 'integer' },
    state: { type: 'string' },
    totalCents: NULLABLE_INT,
    updatedAt: { type: 'string', format: 'date-time' },
  },
} as const

export const PROJECT_ESTIMATES = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'canWrite', 'estimates'],
  properties: {
    projectId: { type: 'string' },
    canWrite: { type: 'boolean' },
    estimates: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['estimateId', 'number', 'versions'],
        properties: {
          estimateId: { type: 'string' },
          number: { type: 'string' },
          versions: { type: 'array', items: VERSION_SUMMARY },
        },
      },
    },
  },
} as const

export const LIST_ITEM = {
  type: 'object',
  additionalProperties: false,
  required: ['estimateId', 'number', 'projectId', 'projectReference', 'customerName', 'createdAt', 'latest'],
  properties: {
    estimateId: { type: 'string' },
    number: { type: 'string' },
    projectId: { type: 'string' },
    projectReference: { type: 'string' },
    customerName: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    latest: VERSION_SUMMARY,
  },
} as const
