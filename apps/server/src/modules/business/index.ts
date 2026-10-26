// Business settings and the legal documents (TSK-0144; OWN-DEC-183, OWN-DEC-187, HH-FIN-04, HH-EST-13,
// FACT-BUSINESS-ADDRESS, ENT-PolicyVersion, ENT-AuditEvent, RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS,
// RULE-SYNTHETIC-DATA).
//   GET /staff/settings/business-details                  the mailing address in force (the Owner)
//   PUT /staff/settings/business-details/mailing-address  the Owner enters or clears it: a fresh sign-in, a reason and
//                                                          If-Match, a new audited configuration version
//   GET /staff/settings/legal-documents                   every legal document's recorded version, its status, the
//                                                          owner's sign-off and what still waits on review (the Owner)
//   GET/PUT /staff/settings/business-calendar               TSK-0136: the internal business-day calendar (calendar.ts)
// - The mailing address is personal data the owner gave (OWN-DEC-183): it is entered by the Owner here, on staging and
//   production, and lives only in configuration (business.mailing_address). It is never in the repository, the graph,
//   fixtures, logs or the audit summary (the summary records the line count and the versions, not the lines). Until it
//   is entered it is NOT CONFIGURED and documents omit the line; documents print it once configured; the website never
//   shows it (OWN-DEC-48). Whether real documents legally need it goes to the attorney and the CPA (packet A-04).
// - business_details.edit is the Owner's row of the permission matrix ("Business details and payment instructions");
//   the change is a configuration value, so it also needs a fresh sign-in and a written reason, as policy values do.
// - The legal documents are read with estimate_terms.approve, the Owner's legal-document row. The estimate terms
//   v1.0 sign-off is the owner's decision OWN-DEC-187, recorded on the terms version by migration 0073 (no separate
//   activation step, RULE-DECIDED-VALUES-ACTIVE); attorney review is shown as still open, never as done.
import type { Tx } from '@handyhub/db'
import {
  ESTIMATE_TERMS,
  estimateTermsDocument,
  estimateTermsInEffect,
  LEGAL_DOCUMENTS,
  SMS_DISCLOSURE,
  type LegalConfigKey,
} from '@handyhub/domain/legal'
import { sql } from 'kysely'
import { ApiError } from '../../api/errors.js'
import type { ApiContext, ApiModule, RouteDef } from '../../api/route.js'
import { loadConfig, recordPolicyVersion } from '../../platform/config/index.js'
import { FRESH_AUTH_MINUTES } from '../identity/sessions.js'
import { legalVersions } from '../legal/index.js'
import { CALENDAR_ROUTES } from './calendar.js'

const TEST = 'test/integration/business-settings.test.ts'
/** At most this many address lines, each at most this long (PROPOSED limits: no decision sets them). */
export const MAILING_ADDRESS_MAX_LINES = 4
export const MAILING_ADDRESS_MAX_LINE = 120

/** The sources a mailing address version entered by the Owner cites. */
const ADDRESS_SOURCES = ['FACT-BUSINESS-ADDRESS', 'OWN-DEC-183'] as const

function staffActor(ctx: ApiContext) {
  if (ctx.actor.kind !== 'staff') throw new ApiError('FORBIDDEN')
  return ctx.actor
}

export type MailingAddressSetting = {
  state: 'CONFIGURED' | 'NOT_CONFIGURED'
  version: number | null
  /** The lines in force; null while NOT CONFIGURED (documents then omit the line). */
  lines: string[] | null
  sourceIds: string[]
}

export async function mailingAddressSetting(db: ApiContext['db'] | Tx): Promise<MailingAddressSetting> {
  const entry = (await loadConfig(db)).get('business.mailing_address')
  return {
    state: entry.state,
    version: entry.version,
    lines: entry.state === 'CONFIGURED' ? [...entry.value.lines] : null,
    sourceIds: [...entry.sourceIds],
  }
}

/** The address lines as entered: trimmed, inner whitespace collapsed; null when nothing is left. */
export function normalizeAddressLines(lines: readonly string[] | null): string[] | null {
  if (lines === null) return null
  const out = lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l !== '')
  return out.length === 0 ? null : out
}

/** What still waits on review for each kind of legal document (RULE-HUMAN-REVIEW: legal). */
const ESTIMATE_TERMS_WAITS_ON = ['OQ-ATTORNEY-TERMS'] as const
/** Real customer use of the approved terms still waits for these (OWN-DEC-187). */
const ESTIMATE_TERMS_REAL_USE_WAITS_ON = ['OWN-DEC-191', 'OQ-ATTORNEY-PRIVACY'] as const
const PUBLIC_WAITS_ON = ['OQ-ATTORNEY-PRIVACY'] as const

type Held = { key: LegalConfigKey; documentId: string; contentSha256: string }
const HELD: readonly Held[] = [
  ...LEGAL_DOCUMENTS.map((d) => ({ key: d.configKey, documentId: d.documentId, contentSha256: d.contentSha256 })),
  { key: SMS_DISCLOSURE.configKey, documentId: SMS_DISCLOSURE.documentId, contentSha256: SMS_DISCLOSURE.contentSha256 },
  { key: ESTIMATE_TERMS.configKey, documentId: ESTIMATE_TERMS.documentId, contentSha256: ESTIMATE_TERMS.contentSha256 },
]
const LEGAL_KEYS: readonly LegalConfigKey[] = [...new Set(HELD.map((h) => h.key))]

export type LegalDocumentEntry = {
  key: LegalConfigKey
  state: 'CONFIGURED' | 'NOT_CONFIGURED'
  version: number | null
  documentId: string | null
  status: string | null
  attorneyReviewed: boolean | null
  /** Estimate terms only: whether this document version needs an attorney review to be in effect. */
  attorneyReviewRequired: boolean | null
  /** Estimate terms only: the owner's sign-off as recorded (OWN-DEC-187). */
  ownerSignOff: { by: string; decisionId: string; source: string; signedOn: string; wording: string } | null
  /** Estimate terms only: whether real customer approvals may be accepted under it (estimateTermsInEffect). */
  inEffect: boolean | null
  /** Whether this software holds the exact wording the recorded version names (its content hash). */
  wordingMatches: boolean
  effectiveFrom: Date | null
  /** The open questions the document still waits on (attorney review). */
  waitsOn: string[]
  /** Estimate terms only: what real customer use still waits for besides the document. */
  realUseWaitsOn: string[]
}

export async function legalDocumentEntries(db: ApiContext['db']): Promise<LegalDocumentEntry[]> {
  const out: LegalDocumentEntry[] = []
  for (const key of LEGAL_KEYS) {
    const active = (await legalVersions(db, key)).find((v) => v.active)
    const isTerms = key === 'legal.estimate_terms'
    if (!active) {
      const entry = (await loadConfig(db)).get(key)
      out.push({
        key,
        state: 'NOT_CONFIGURED',
        version: entry.version,
        documentId: null,
        status: null,
        attorneyReviewed: null,
        attorneyReviewRequired: null,
        ownerSignOff: null,
        inEffect: isTerms ? false : null,
        wordingMatches: false,
        effectiveFrom: null,
        waitsOn: [...entry.sourceIds.filter((id) => id.startsWith('OQ-'))],
        realUseWaitsOn: [],
      })
      continue
    }
    const held = HELD.find((h) => h.key === key && h.documentId === active.documentId)
    const doc = isTerms ? estimateTermsDocument(active.documentId) : null
    const wordingMatches = held?.contentSha256 === active.contentSha256
    out.push({
      key,
      state: 'CONFIGURED',
      version: active.version,
      documentId: active.documentId,
      status: active.status,
      attorneyReviewed: active.attorneyReviewed,
      attorneyReviewRequired: isTerms ? (doc?.attorneyReviewRequired ?? null) : null,
      ownerSignOff: active.ownerSignOff ? { ...active.ownerSignOff } : null,
      inEffect: isTerms ? doc !== null && wordingMatches && estimateTermsInEffect(active, doc) : null,
      wordingMatches,
      effectiveFrom: active.effectiveFrom,
      waitsOn: active.attorneyReviewed ? [] : [...(isTerms ? ESTIMATE_TERMS_WAITS_ON : PUBLIC_WAITS_ON)],
      realUseWaitsOn: isTerms ? [...ESTIMATE_TERMS_REAL_USE_WAITS_ON] : [],
    })
  }
  return out
}

const STRINGS = { type: 'array', items: { type: 'string' } } as const
const NULLABLE_INT = { type: ['integer', 'null'] } as const
const NULLABLE_STRING = { type: ['string', 'null'] } as const
const NULLABLE_BOOL = { type: ['boolean', 'null'] } as const
const obj = (properties: Record<string, unknown>) =>
  ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties }) as const

const MAILING_ADDRESS_SCHEMA = obj({
  state: { type: 'string', enum: ['CONFIGURED', 'NOT_CONFIGURED'] },
  version: NULLABLE_INT,
  lines: { type: ['array', 'null'], items: { type: 'string' } },
  sourceIds: STRINGS,
})
const BUSINESS_DETAILS_SCHEMA = obj({ mailingAddress: MAILING_ADDRESS_SCHEMA })
const MAILING_ADDRESS_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['lines', 'reason'],
  properties: {
    lines: {
      type: ['array', 'null'],
      minItems: 1,
      maxItems: MAILING_ADDRESS_MAX_LINES,
      items: { type: 'string', maxLength: MAILING_ADDRESS_MAX_LINE },
    },
    reason: { type: 'string', minLength: 1, maxLength: 1000 },
  },
} as const
const LEGAL_DOCUMENTS_SCHEMA = obj({
  documents: {
    type: 'array',
    items: obj({
      key: { type: 'string', enum: [...LEGAL_KEYS] },
      state: { type: 'string', enum: ['CONFIGURED', 'NOT_CONFIGURED'] },
      version: NULLABLE_INT,
      documentId: NULLABLE_STRING,
      status: { type: ['string', 'null'], enum: ['draft', 'owner_review_pending', 'approved', null] },
      attorneyReviewed: NULLABLE_BOOL,
      attorneyReviewRequired: NULLABLE_BOOL,
      ownerSignOff: {
        anyOf: [
          { type: 'null' },
          obj({
            by: { type: 'string', enum: ['owner'] },
            decisionId: { type: 'string' },
            source: { type: 'string' },
            signedOn: { type: 'string' },
            wording: { type: 'string' },
          }),
        ],
      },
      inEffect: NULLABLE_BOOL,
      wordingMatches: { type: 'boolean' },
      effectiveFrom: { type: ['string', 'null'], format: 'date-time' },
      waitsOn: STRINGS,
      realUseWaitsOn: STRINGS,
    }),
  },
})

const read = {
  actors: ['staff'],
  kind: 'read',
  idempotency: 'none',
  expectedVersion: 'none',
  rateLimit: 'none',
  audit: 'none',
  pagination: false,
  test: TEST,
} as const

const routes: RouteDef[] = [
  {
    ...read,
    method: 'GET',
    path: '/staff/settings/business-details',
    operationId: 'getBusinessDetails',
    summary: 'Business details: the mailing address',
    description:
      'The Owner (business_details.edit). The mailing address in force (business.mailing_address, OWN-DEC-183): ' +
      'its lines and configuration version, or NOT CONFIGURED (documents then omit the address line). The website ' +
      'never shows it. ETag: the configuration version.',
    permission: 'business_details.edit',
    schema: { response: { 200: BUSINESS_DETAILS_SCHEMA } },
    handler: async (ctx) => {
      const mailingAddress = await mailingAddressSetting(ctx.db)
      return { body: { mailingAddress }, version: mailingAddress.version ?? 0 }
    },
  },
  {
    actors: ['staff'],
    kind: 'write',
    idempotency: 'required',
    rateLimit: 'none',
    pagination: false,
    test: TEST,
    method: 'PUT',
    path: '/staff/settings/business-details/mailing-address',
    operationId: 'setBusinessMailingAddress',
    summary: 'Enter or clear the business mailing address (Owner only)',
    description:
      'The Owner only (business_details.edit, with a fresh sign-in within ' +
      `${FRESH_AUTH_MINUTES} minutes and a written reason), with If-Match: the configuration version shown. Records ` +
      `the next version of business.mailing_address: 1 to ${MAILING_ADDRESS_MAX_LINES} lines of at most ` +
      `${MAILING_ADDRESS_MAX_LINE} characters, trimmed; lines null (or only blank lines) records NOT CONFIGURED. ` +
      'Estimates, approval receipts and invoices print it from then on; the website never shows it. Audited with ' +
      'the versions and the number of lines, never the address itself.',
    permission: 'business_details.edit',
    freshAuthMinutes: FRESH_AUTH_MINUTES,
    expectedVersion: 'required',
    audit: 'business_settings.change_mailing_address',
    schema: { body: MAILING_ADDRESS_BODY, response: { 200: MAILING_ADDRESS_SCHEMA } },
    handler: async (ctx) => {
      const tx = ctx.tx as Tx
      const actor = staffActor(ctx)
      const body = ctx.req.body as { lines: string[] | null; reason: string }
      const reason = body.reason.trim()
      if (reason === '')
        throw new ApiError('VALIDATION_FAILED', {
          fieldErrors: [{ field: 'body.reason', code: 'required', message: '' }],
        })
      const lines = normalizeAddressLines(body.lines)
      // The same lock recordPolicyVersion takes, so the version compared is the one superseded.
      await sql`SELECT pg_advisory_xact_lock(hashtext(${'policy_version:business.mailing_address'}))`.execute(tx)
      const before = await mailingAddressSetting(tx)
      if (ctx.expectedVersion() !== (before.version ?? 0))
        throw new ApiError('STALE_VERSION', { current: { version: before.version ?? 0 } })
      const version = await recordPolicyVersion(tx, {
        key: 'business.mailing_address',
        value: lines === null ? null : { lines },
        sourceIds: ADDRESS_SOURCES,
        changedBy: actor.userId,
        reason,
      })
      await ctx.audit({
        target: { type: 'policy_version', id: 'business.mailing_address', version },
        // Never the address itself (OWN-DEC-183): the state, the number of lines and the versions.
        summary: {
          from: before.state,
          to: lines === null ? 'NOT_CONFIGURED' : 'CONFIGURED',
          lineCount: lines?.length ?? 0,
          previousVersion: before.version,
        },
        reason,
        stepUpUsed: true,
      })
      return { body: await mailingAddressSetting(tx), version }
    },
  },
  {
    ...read,
    method: 'GET',
    path: '/staff/settings/legal-documents',
    operationId: 'getLegalDocuments',
    summary: 'Legal documents: versions, sign-off and open reviews',
    description:
      'The Owner (estimate_terms.approve). Each legal document (privacy policy, SMS terms, website terms, SMS ' +
      'disclosure, estimate terms) with its active recorded version: the document ID, status, whether an attorney ' +
      'reviewed it, whether this software holds the exact wording it names, and the open questions it still waits ' +
      "on. The estimate terms also carry the owner's recorded sign-off (OWN-DEC-187), whether the version needs an " +
      'attorney review to be in effect, whether customer approvals are accepted under it, and what real customer use ' +
      'still waits for (the launch phases, the privacy review). Reads only.',
    permission: 'estimate_terms.approve',
    schema: { response: { 200: LEGAL_DOCUMENTS_SCHEMA } },
    handler: async (ctx) => ({ body: { documents: await legalDocumentEntries(ctx.db) } }),
  },
]

export const BUSINESS_MODULE: ApiModule = { name: 'business', routes: [...routes, ...CALENDAR_ROUTES] }
