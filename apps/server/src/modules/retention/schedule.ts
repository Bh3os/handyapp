// The retention schedule's categories (TSK-0099; HH-PRIV-01, HH-DATA-09, FACT-RETENTION-SCHEDULE, OWN-DEC-70,
// OWN-DEC-142, OQ-RETENTION-REVIEW). This file holds no period: the periods are the active retention.* configuration
// (migrations 0055 and 0056), and `decided` below only repeats the fact's wording for the data inventory, which a test
// compares with the seeded values. Each category says what starts its period and whether the retention job can find
// its records yet: a category whose start is not recorded by the software (job closeout, the last completed service,
// a filed tax return, a closed incident) produces no review entry until it is, never a guessed date.
// TSK-0138 (OWN-DEC-177): the provisional defaults for staff accounts, consent records, expired sessions and access
// links (review entries), settings and content history and technical logs (configured, never listed), migration 0108.
import type { ConfigKey } from '../../platform/config/index.js'

/** The schedule categories with a period, in the order of FACT-RETENTION-SCHEDULE (audit records last). */
export const PERIOD_CATEGORIES = [
  'requests_not_converted',
  'unaccepted_estimates',
  'customer_profiles',
  'accepted_agreements',
  'financial_records',
  'job_records',
  'safety_records',
  'staff_accounts',
  'consent_records',
  'sessions_and_links',
  'audit_log',
] as const
export type PeriodCategory = (typeof PERIOD_CATEGORIES)[number]

/**
 * The categories whose records never get a review entry: the configured rules without a period of their own (settings
 * history, technical logs, TSK-0138), the schedule's rows without a period, and the PROPOSED category of data the
 * schedule does not name.
 */
export const OTHER_CATEGORIES = [
  'settings_history',
  'technical_logs',
  'access_codes',
  'regulated_employee_records',
  'not_scheduled',
] as const
export type OtherCategory = (typeof OTHER_CATEGORIES)[number]
export type RetentionCategory = PeriodCategory | OtherCategory
export const RETENTION_CATEGORIES: readonly RetentionCategory[] = [...PERIOD_CATEGORIES, ...OTHER_CATEGORIES]

/**
 * Whether the retention job finds the category's records:
 * - `scanned`: the records and the event that starts their period are recorded; expired ones become review entries;
 * - `start_not_recorded`: the software does not record the event that starts the period yet, so nothing is due;
 * - `no_period`: the schedule gives no period (removal when no longer needed, excluded or NOT CONFIGURED), so the job
 *   never opens an entry for it;
 * - `while_referenced` (TSK-0138): kept while retained records depend on it; the check that finds unreferenced history
 *   is not built, so nothing is listed (PROPOSED, OQ-RETENTION-DEFAULTS-DETAILS);
 * - `not_stored` (TSK-0138): the software keeps no such records in its database (the technical logs are the server's
 *   output lines, kept by the host), so there is nothing to list.
 */
export type ScanState = 'scanned' | 'start_not_recorded' | 'no_period' | 'while_referenced' | 'not_stored'

export type CategoryDefinition = {
  id: RetentionCategory
  /** The configuration key holding the period; null when the schedule gives none. */
  configKey: ConfigKey | null
  scan: ScanState
  /** The schedule's wording of the rule (FACT-RETENTION-SCHEDULE; OWN-DEC-142 for audit records). */
  decided: string
  /** The years the owner decided, for the inventory and the seed check; null without a period in years. */
  decidedYears: number | null
  /** TSK-0138: the calendar days the owner decided (technical logs, expired sessions and links); null otherwise. */
  decidedDays?: number
  /** What the job reads, or why it reads nothing. */
  scanNote: string
  sources: readonly string[]
}

const SCHEDULE = ['OWN-DEC-70', 'FACT-RETENTION-SCHEDULE', 'OQ-RETENTION-REVIEW'] as const
const DEFAULTS = [
  'OWN-DEC-177',
  'FACT-RETENTION-SCHEDULE',
  'OQ-RETENTION-REVIEW',
  'OQ-RETENTION-DEFAULTS-DETAILS',
] as const

export const CATEGORY_DEFINITIONS: Record<RetentionCategory, CategoryDefinition> = {
  requests_not_converted: {
    id: 'requests_not_converted',
    configKey: 'retention.requests_not_converted',
    scan: 'scanned',
    decided: 'Requests that never become jobs: 2 years after closure (no separate 1-year contact-removal rule).',
    decidedYears: 2,
    scanNote:
      'A closed request (Not a fit, outside scope, not served, withdrawn, Closed—no response) whose project closed ' +
      'without a job; the period starts at the recorded closing decision.',
    sources: SCHEDULE,
  },
  unaccepted_estimates: {
    id: 'unaccepted_estimates',
    configKey: 'retention.unaccepted_estimates',
    scan: 'scanned',
    decided: 'Unaccepted estimates: 2 years after expiration or closure.',
    decidedYears: 2,
    scanNote:
      'An estimate with no accepted version whose latest version expired, was declined or was withdrawn; the period ' +
      'starts when that version reached its state.',
    sources: SCHEDULE,
  },
  customer_profiles: {
    id: 'customer_profiles',
    configKey: 'retention.customer_profiles',
    scan: 'start_not_recorded',
    decided:
      'Customer/property profiles: while active, then 7 years after the last completed service; identity details ' +
      'needed by longer-kept records are preserved.',
    decidedYears: 7,
    scanNote: 'No completed service is recorded yet (job closeout comes with financial closeout).',
    sources: SCHEDULE,
  },
  accepted_agreements: {
    id: 'accepted_agreements',
    configKey: 'retention.accepted_agreements',
    scan: 'start_not_recorded',
    decided: 'Accepted estimates, work authorizations, contracts and change orders: 10 years after final job closeout.',
    decidedYears: 10,
    scanNote: 'Final job closeout is not recorded yet.',
    sources: SCHEDULE,
  },
  financial_records: {
    id: 'financial_records',
    configKey: 'retention.financial_records',
    scan: 'start_not_recorded',
    decided:
      'Invoices, payments, receipts, refunds and reconciliation records: 7 years after the relevant tax return is ' +
      'filed or the tax is paid, whichever is later.',
    decidedYears: 7,
    scanNote:
      'Deposit payments are recorded (finance.payments), but no invoice is yet, and the tax-return filing or tax ' +
      'payment that starts the period is not recorded and is never assumed.',
    sources: SCHEDULE,
  },
  job_records: {
    id: 'job_records',
    configKey: 'retention.job_records',
    scan: 'start_not_recorded',
    decided:
      'Job photos, operational messages, checklists and arrival/finish timestamps: 7 years after job closeout; ' +
      "evidence supporting an approval or contract follows that record's longer period.",
    decidedYears: 7,
    scanNote: 'Job closeout is not recorded yet.',
    sources: SCHEDULE,
  },
  safety_records: {
    id: 'safety_records',
    configKey: 'retention.safety_records',
    scan: 'start_not_recorded',
    decided:
      'Ordinary safety acknowledgments and incident records: 10 years after closure. Regulated employee ' +
      'medical/exposure records are excluded from routine deletion.',
    decidedYears: 10,
    scanNote: 'Incident records and their closure are not recorded yet; review holds stay with their request or job.',
    sources: SCHEDULE,
  },
  staff_accounts: {
    id: 'staff_accounts',
    configKey: 'retention.staff_accounts',
    scan: 'scanned',
    decided:
      'Staff accounts: 7 years after departure (review threshold); access disabled at once, sessions, credentials ' +
      'and permissions revoked.',
    decidedYears: 7,
    scanNote:
      'A disabled staff account; the period starts at its departure (when it was disabled). A re-enabled account is ' +
      'not due. Its job history and evidence follow their own categories.',
    sources: DEFAULTS,
  },
  consent_records: {
    id: 'consent_records',
    configKey: 'retention.consent_records',
    scan: 'scanned',
    decided:
      'Consent records: 5 years after the last relevant use (review threshold); never while the permission is ' +
      'active or a claim remains.',
    decidedYears: 5,
    scanNote:
      'The history of one permission (purpose, channel and destination) whose latest record is a withdrawal; the ' +
      'period starts at that withdrawal (PROPOSED). Not due while the destination is on file for a contact, an ' +
      'account or a staff member, since the withdrawal still stops messages to it (PROPOSED).',
    sources: DEFAULTS,
  },
  sessions_and_links: {
    id: 'sessions_and_links',
    configKey: 'retention.sessions_and_links',
    scan: 'scanned',
    decided:
      'Login sessions and access links: expire per their security settings; minimal non-reusable metadata up to ' +
      '30 days.',
    decidedYears: null,
    decidedDays: 30,
    scanNote:
      'Ended sessions, links and codes (staff and customer sessions, guest links, invite and reset links, receipt and ' +
      'upload links, one-time codes), one entry per kind and calendar month of their end in the business time zone ' +
      '(PROPOSED); the period starts when each expired, was used or was revoked. They store token hashes only.',
    sources: [...DEFAULTS, 'OWN-DEC-70'],
  },
  audit_log: {
    id: 'audit_log',
    configKey: 'retention.audit_log',
    scan: 'scanned',
    decided:
      "Audit-log records: 7 years, then the owner's deletion-review queue; records under a case or legal hold are " +
      'kept until the hold ends.',
    decidedYears: 7,
    scanNote: 'Every audit entry; the period starts when the entry was recorded.',
    sources: ['OWN-DEC-142', 'FACT-RETENTION-SCHEDULE', 'OWN-DEC-70', 'OQ-RETENTION-REVIEW'],
  },
  settings_history: {
    id: 'settings_history',
    configKey: 'retention.settings_history',
    scan: 'while_referenced',
    decided:
      'Settings and content history: while retained records depend on them; immutable when part of an agreement or ' +
      'auditable decision; unreferenced history deleted only after review.',
    decidedYears: null,
    scanNote:
      'Configuration, service, SOP, loadout and template versions; records keep the exact version they used. The check ' +
      'for unreferenced versions is not built, so none is listed and every version is kept (PROPOSED).',
    sources: DEFAULTS,
  },
  technical_logs: {
    id: 'technical_logs',
    configKey: 'retention.technical_logs',
    scan: 'not_stored',
    decided:
      'Technical logs: 90 days; no credentials, tokens, unnecessary personal data or secrets; security-incident ' +
      'evidence longer when justified.',
    decidedYears: null,
    decidedDays: 90,
    scanNote:
      'The application and diagnostic logs are the server output lines (redacted), kept by the host, not in this ' +
      "database; the host's log retention is NOT CONFIGURED (OQ-RETENTION-DEFAULTS-DETAILS).",
    sources: DEFAULTS,
  },
  access_codes: {
    id: 'access_codes',
    configKey: null,
    scan: 'no_period',
    decided: 'Property access codes: removed when no longer needed for authorized access.',
    decidedYears: null,
    scanNote:
      'Codes are kept sealed in the protected access-code store (crm.access_instruction_secrets); staff remove one ' +
      'when it is no longer needed, which erases the sealed value. The job opens no entry.',
    sources: ['OWN-DEC-70', 'FACT-RETENTION-SCHEDULE'],
  },
  regulated_employee_records: {
    id: 'regulated_employee_records',
    configKey: null,
    scan: 'no_period',
    decided:
      'Regulated employee medical/exposure records are excluded from routine deletion and need a separately ' +
      'reviewed schedule.',
    decidedYears: null,
    scanNote: 'Excluded from routine deletion; no such record is stored. The separate schedule is human review.',
    sources: ['OWN-DEC-70', 'FACT-RETENTION-SCHEDULE', 'OQ-RETENTION-REVIEW'],
  },
  not_scheduled: {
    id: 'not_scheduled',
    configKey: null,
    scan: 'no_period',
    decided: 'The schedule has no row for this data: NOT CONFIGURED. Nothing is deleted and no period is assumed.',
    decidedYears: null,
    scanNote:
      'The kinds OWN-DEC-177 leaves without a period: the access-code reveal log, action-queue items, unlinked inbound ' +
      'messages and their linking corrections, technical records other than logs (background jobs, outbox events, ' +
      'idempotency keys, webhook receipts), the deletion-review entries themselves and the copies vendors keep.',
    sources: ['OWN-DEC-177', 'OQ-RETENTION-UNSCHEDULED'],
  },
}

/** The checks run (or listed as not recorded) before an entry is opened: ENT-RetentionReview "holds found". */
export const HOLD_CHECKS = [
  // PROPOSED: an unresolved hold on the record's project (a review or safety hold) is treated as an investigation
  // in progress and blocks deletion.
  'open_holds',
  'complaints',
  'warranties',
  'disputes',
  'claims',
  'investigations',
  'unfiled_tax_returns',
  'legal_holds',
  'insurance_holds',
] as const
export type HoldCheck = (typeof HOLD_CHECKS)[number]
export type HoldCheckResult = 'found' | 'none_found' | 'not_applicable' | 'not_recorded'
export type HoldCheckOutcome = { check: HoldCheck; result: HoldCheckResult; count?: number }

/**
 * The checks the software cannot run yet: none of these is recorded by it (warranties, claims, tax filings, legal or
 * insurance holds), so each says `not_recorded` and the Owner checks it before deciding, never "none found".
 * TSK-0093: complaints, disputes and investigations are recorded as cases now: an open case found blocks (a case
 * hold, OWN-DEC-124, HH-PRIV-03); none open is still not "none found" (a complaint or dispute handled outside the
 * software cannot be ruled out), so the Owner still confirms it, like recorded payments.
 */
export const NOT_RECORDED_CHECKS: readonly HoldCheck[] = HOLD_CHECKS.filter((c) => c !== 'open_holds')

/** The open cases of a record's project, by the check they answer (TSK-0093). */
export type CaseCounts = { readonly complaints: number; readonly disputes: number; readonly incidents: number }
const CASE_CHECK: Partial<Record<HoldCheck, keyof CaseCounts>> = {
  complaints: 'complaints',
  disputes: 'disputes',
  investigations: 'incidents',
}

/** Every hold check of a record: open holds on its project, open cases, and the kinds not recorded. */
export function holdCheckOutcomes(openHolds: number | null, cases: CaseCounts | null): HoldCheckOutcome[] {
  return [
    openHolds === null
      ? { check: 'open_holds', result: 'not_applicable' }
      : openHolds > 0
        ? { check: 'open_holds', result: 'found', count: openHolds }
        : { check: 'open_holds', result: 'none_found' },
    ...NOT_RECORDED_CHECKS.map((check): HoldCheckOutcome => {
      const key = CASE_CHECK[check]
      const n = key && cases ? cases[key] : 0
      return n > 0 ? { check, result: 'found', count: n } : { check, result: 'not_recorded' }
    }),
  ]
}

/** A found case check holds the record like an open hold (TSK-0093). */
export const caseHoldFound = (checks: readonly { check: string; result: string }[]): boolean =>
  checks.some((c) => c.result === 'found' && c.check in CASE_CHECK)
