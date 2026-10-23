// The data inventory (TSK-0099; HH-PRIV-01, HH-DATA-09, FACT-RETENTION-SCHEDULE, OWN-DEC-70, OWN-DEC-142,
// OWN-DEC-143, INT-Render, INT-R2, INT-Bird, INT-Resend, INT-Square, OQ-RETENTION-REVIEW, OQ-RETENTION-UNSCHEDULED).
// One annotation per database table: what it holds, its purpose and access classes, its retention categories, whether
// it is protected evidence, and the vendors that receive its data. `satisfies Record<keyof Database, ...>` makes the
// type check fail when a migration adds a table without an annotation (schema.ts is generated from the migrations),
// and docs/data-inventory.md is rendered from these annotations (`pnpm data-inventory`; a unit test fails when the
// committed file differs). The document quotes the decided wording (schedule.ts) and names each category's
// configuration key; the periods in use are the active retention.* configuration, never a value written here.
// PROPOSED: the mapping of tables to classes and categories, the classes marked PROPOSED, and the end-of-life method
// of tables the schedule does not name.
import type { Database } from '@handyhub/db'
import { CATEGORY_DEFINITIONS, HOLD_CHECKS, RETENTION_CATEGORIES, type RetentionCategory } from './schedule.js'

/** Purpose and access classes: the ten of HH-PRIV-01 (guide 25.2), then the PROPOSED ones the guide does not name. */
export const DATA_CLASSES = {
  contact: {
    name: 'Contact',
    purpose: 'Verification and service communication',
    audience: 'The customer; relevant office roles',
    controls: 'Verified values; channel and purpose preferences; protected exports',
    proposed: false,
  },
  service_address: {
    name: 'Service address',
    purpose: 'Qualification and work delivery',
    audience: 'The authorized customer and operational staff',
    controls: 'Collected when needed; confirmed per job',
    proposed: false,
  },
  photos: {
    name: 'Interior and work photos',
    purpose: 'Estimation, evidence, quality',
    audience: 'Role and project scope; customer-shared items only',
    controls: 'Minimize faces, valuables and documents; metadata policy; separate marketing consent',
    proposed: false,
  },
  access_secret: {
    name: 'Access secret',
    purpose: 'Site entry',
    audience: 'Assigned staff with need during the visit',
    controls: 'Protected field; expiry; never in messages, broad exports or caches',
    proposed: false,
  },
  estimate_approval: {
    name: 'Estimate and approval',
    purpose: 'Scope and commercial commitment evidence',
    audience: 'The authorized customer; estimating, operations and finance as needed',
    controls: 'Exact version; retention and hold policy',
    proposed: false,
  },
  payment_reference: {
    name: 'Payment reference',
    purpose: 'Receipt and reconciliation',
    audience: 'The authorized customer; finance; limited collection role',
    controls: 'Minimal references; no card data',
    proposed: false,
  },
  incident: {
    name: 'Incident',
    purpose: 'Response, follow-up, evidence',
    audience: 'The Owner and the reporting worker; Office sees only the case status (OWN-DEC-143)',
    controls: 'Minimal sensitive personal detail; legal or incident holds',
    proposed: false,
  },
  worker_timestamps: {
    name: 'Worker timestamps',
    purpose: "Operations and the accountant's export",
    audience: 'Owner',
    controls: 'Employment and privacy policy; no customer visibility',
    proposed: false,
  },
  analytics: {
    name: 'Analytics',
    purpose: 'Reliability and task success',
    audience: 'Authorized aggregate reporting',
    controls: 'No free-form inputs, access secrets, photos or private IDs',
    proposed: false,
  },
  logs_audit: {
    name: 'Logs and audit',
    purpose: 'Reliability, integrity, accountability',
    audience: 'Authorized technical and administrative scope',
    controls: 'Redaction, controlled access, retention, tamper protection',
    proposed: false,
  },
  request_details: {
    name: 'Request and project details',
    purpose: 'Qualification, estimating and the project record',
    audience: 'The authorized customer for what is shared with them; office roles and estimators',
    controls: 'Original submission never edited; staff-only notes stay internal',
    proposed: true,
  },
  scheduling: {
    name: 'Visits and scheduling',
    purpose: 'Arranging visits and staff capacity',
    audience: 'Office roles and the assigned staff',
    controls: 'Customer sees only their own confirmed windows',
    proposed: true,
  },
  staff_account: {
    name: 'Staff accounts',
    purpose: 'Staff sign-in, roles, availability and offboarding',
    audience: 'The Owner (staff management); the staff member for their own account',
    controls: 'Passwords and second factors only as hashes or sealed secrets; audited changes',
    proposed: true,
  },
  configuration: {
    name: 'Configuration and content',
    purpose: 'Decided values, service content, templates and rules, versioned',
    audience: 'Staff by role; the Owner changes them',
    controls: 'Versioned, append-only, citing their decisions; no customer data',
    proposed: true,
  },
  technical: {
    name: 'Technical records',
    purpose: 'Delivery, queues, limits and idempotency',
    audience: 'Authorized technical and administrative scope',
    controls: 'Hashed keys; redacted; no secrets',
    proposed: true,
  },
} as const
export type DataClass = keyof typeof DATA_CLASSES

/** Where data goes besides the application database (INT-*); Square is used outside the software (INT-Square). */
export const VENDORS = {
  render: 'Render: hosting and the PostgreSQL database (every table below)',
  r2: 'Cloudflare R2: private object storage for photos and documents',
  bird: 'Bird: SMS',
  resend: 'Resend: email',
} as const
export type Vendor = keyof typeof VENDORS

export type TableAnnotation = {
  holds: string
  classes: readonly DataClass[]
  /** The retention categories its rows fall under; the record they belong to decides which one applies. */
  categories: readonly RetentionCategory[]
  /**
   * Issued or accepted evidence: Archive, Void or an audited correction, never ordinary deletion (HH-DATA-09). `true`
   * for every row, or the rows it applies to (the others follow their category's review).
   */
  protectedEvidence?: true | string
  /** Vendors that receive the data, besides Render. */
  vendors?: readonly Exclude<Vendor, 'render'>[]
}

const R = 'requests_not_converted'
const E = 'unaccepted_estimates'
const C = 'customer_profiles'
const A = 'accepted_agreements'
const F = 'financial_records'
const J = 'job_records'
const S = 'safety_records'
const AU = 'audit_log'
const SL = 'sessions_and_links'
const NS = 'not_scheduled'

export const TABLES = {
  'catalog.service_versions': {
    holds: 'Approved service content versions (descriptions, intake questions, SOP link)',
    classes: ['configuration'],
    categories: [NS],
    protectedEvidence: true,
  },
  'catalog.services': {
    holds: 'The 26 services and their published version',
    classes: ['configuration'],
    categories: [NS],
  },
  'catalog.loadout_versions': {
    holds: 'Imported loadout lists per service: the vault inventory groups, items and review notes, verbatim',
    classes: ['configuration'],
    categories: [NS],
    protectedEvidence: true,
  },
  'catalog.sop_versions': {
    holds: 'Imported SOP versions: checklist stages, stop-work section, hazard and quality digests, competent review',
    classes: ['configuration'],
    categories: [NS],
    protectedEvidence: true,
  },
  'catalog.sop_spanish_versions': {
    holds: 'Spanish SOP versions with the separate comparison against their English version and its release status',
    classes: ['configuration'],
    categories: [NS],
    protectedEvidence: true,
  },
  'comms.conversations': {
    holds: 'One customer and one internal conversation per project',
    classes: ['request_details'],
    categories: [R, J],
  },
  'comms.message_links': {
    holds: 'Staff linking corrections of a message, with the staff member and the reason',
    classes: ['request_details'],
    categories: [R, J, NS],
  },
  'comms.messages': {
    holds: 'Inbound emails and texts exactly as received, staff replies and internal messages, with their linking',
    classes: ['contact', 'request_details'],
    categories: [R, J, NS],
    vendors: ['bird', 'resend'],
  },
  'comms.project_reply_tokens': {
    holds: "A project's reply token for the plus-addressed reply-to of its emails (grants no access)",
    classes: ['technical'],
    categories: [NS],
    vendors: ['resend'],
  },
  'crm.access_code_reveals': {
    holds: 'Who revealed which access code, when and under which roles (never the code)',
    classes: ['logs_audit'],
    categories: [NS],
  },
  'crm.access_instruction_secrets': {
    holds: 'Gate, lockbox, alarm and door codes and key locations, sealed; erased when removed, the row kept',
    classes: ['access_secret'],
    categories: ['access_codes'],
  },
  'crm.candidate_match_events': {
    holds: 'Detections and staff reviews of a candidate match',
    classes: ['contact'],
    categories: [C, R],
  },
  'crm.candidate_matches': {
    holds: 'Pairs of customers sharing an email, phone or address, for staff review (never a link)',
    classes: ['contact'],
    categories: [C, R],
  },
  'crm.contacts': {
    holds: 'Customer contacts: name, email, phone, verification state, preferred channel, own time zone for texts',
    classes: ['contact'],
    categories: [C, R],
  },
  'crm.customer_notes': {
    holds: 'Staff notes on a customer record, with their visibility class',
    classes: ['contact'],
    categories: [C, R],
  },
  'crm.customer_properties': {
    holds: 'Which customer is linked to which property',
    classes: ['service_address'],
    categories: [C, R],
  },
  'crm.customers': {
    holds: 'Customer profiles: display name, language, status',
    classes: ['contact'],
    categories: [C, R],
  },
  'crm.projects': {
    holds: 'Projects: reference, customer, property, state, responsible staff',
    classes: ['request_details'],
    categories: [R, J, A],
  },
  'crm.properties': {
    holds: 'Service addresses, coverage result and the property time zone with its verification state',
    classes: ['service_address'],
    categories: [C, R],
  },
  'crm.property_addresses': {
    holds: 'Every address a property has had',
    classes: ['service_address'],
    categories: [C, R],
  },
  'crm.property_changes': {
    holds: 'Staff changes and confirmations of property details, with the reason and the values before and after',
    classes: ['service_address'],
    categories: [C, R],
  },
  'crm.property_county_verifications': {
    holds: 'Staff verification of a property address version and its county, with an optional note (TSK-0127)',
    classes: ['service_address'],
    categories: [C, R],
  },
  'crm.property_details': {
    holds: 'Property details: non-secret access notes, parking, occupants and pets, utilities, site flags, sources',
    classes: ['service_address'],
    categories: [C, R],
  },
  'crm.property_time_zones': {
    holds:
      'Every time-zone state of a property (unknown, derived or verified), the counties it rests on and staff reasons',
    classes: ['service_address'],
    categories: [C, R],
  },

  'crm.record_changes': {
    holds: 'Staff edits of a customer or contact, with the reason and the values before and after',
    classes: ['contact'],
    categories: [C, R],
  },
  'crm.record_links': {
    holds: "Human-reviewed merges and relinks, their access rechecks and the Owner's reversal",
    classes: ['contact', 'request_details'],
    categories: [C, R],
  },
  'estimating.approval_receipts': {
    holds: 'Issued approval receipts: the PDF reference, its SHA-256 and size, the terms and TEST mark (files in R2)',
    classes: ['estimate_approval'],
    categories: [A],
    protectedEvidence: true,
    vendors: ['r2'],
  },
  'estimating.approval_selections': {
    holds: "A customer's option selections before approving",
    classes: ['estimate_approval'],
    categories: [E, A],
  },
  'estimating.approvals': {
    holds: 'Customer approvals: the exact version, totals in cents, terms, name and verification evidence',
    classes: ['estimate_approval', 'contact'],
    categories: [A],
    protectedEvidence: true,
  },
  'estimating.customer_responses': {
    holds: 'Request Changes and Decline responses with their message',
    classes: ['estimate_approval'],
    categories: [E, A],
  },
  'estimating.estimate_documents': {
    holds: 'Uploaded estimate documents and the customer PDF (metadata; the files are in R2)',
    classes: ['estimate_approval'],
    categories: [E, A],
    vendors: ['r2'],
  },
  'estimating.estimate_line_costs': {
    holds: 'Internal line costs (staff only)',
    classes: ['estimate_approval'],
    categories: [E, A],
  },
  'estimating.estimate_lines': {
    holds: 'Customer-facing price lines in cents',
    classes: ['estimate_approval'],
    categories: [E, A],
  },
  'estimating.estimate_version_internals': {
    holds: 'Markup assumptions and estimator notes (staff only)',
    classes: ['estimate_approval'],
    categories: [E, A],
  },
  'estimating.estimate_versions': {
    holds: 'Estimate versions: state, texts, totals in cents, validity, terms, customer PDF reference',
    classes: ['estimate_approval'],
    categories: [E, A],
    protectedEvidence: 'Accepted versions',
    vendors: ['r2'],
  },
  'estimating.estimates': {
    holds: 'Estimates of a project and their number',
    classes: ['estimate_approval'],
    categories: [E, A],
  },
  'estimating.publication_approvals': {
    holds:
      "Owner approvals before publishing over the threshold: the version's price digest, totals and known costs in " +
      'cents, the reasons, the linked project documents, who asked and decided, when, the comment',
    classes: ['estimate_approval', 'staff_account'],
    categories: [E, A],
  },
  'finance.deposit_requirements': {
    holds: "A job's deposit obligation in cents, its state and the staff-pasted Square payment link",
    classes: ['payment_reference'],
    categories: [F],
  },
  'finance.deposit_waivers': {
    holds: "The Owner's job-specific deposit waivers with their written reason",
    classes: ['payment_reference'],
    categories: [F],
  },
  // TSK-0085, TSK-0086 (migration 0077): invoices and the ledger are financial records.
  'finance.invoices': {
    holds: 'Invoices: kind, state, number, totals in cents, deposit credit, the issuer and payment details as issued',
    classes: ['payment_reference'],
    categories: [F],
    protectedEvidence: true,
  },
  'finance.invoice_lines': {
    holds: "An invoice's lines: description, quantity, unit price and amount in cents (charges and credits)",
    classes: ['payment_reference'],
    categories: [F],
    protectedEvidence: true,
  },
  'finance.invoice_deposit_credits': {
    holds: "The verified deposit money credited once to a job's final invoice, in cents",
    classes: ['payment_reference'],
    categories: [F],
    protectedEvidence: true,
  },
  'finance.invoice_documents': {
    holds: 'Issued invoice PDFs: the file reference, its SHA-256 and size, the TEST mark (files in R2)',
    classes: ['payment_reference'],
    categories: [F],
    protectedEvidence: true,
    vendors: ['r2'],
  },
  'finance.refunds': {
    holds: 'Refunds, credits and write-offs: amount in cents, reason, who requested and who approved, Square refund ID',
    classes: ['payment_reference'],
    categories: [F],
    protectedEvidence: true,
  },
  'finance.payouts': {
    holds: 'Square payouts recorded by hand: payout ID, net amount in cents and date',
    classes: ['payment_reference'],
    categories: [F],
  },
  'finance.provider_fees': {
    holds: 'Square fees recorded by hand: amount in cents, date, the payment or payout they belong to',
    classes: ['payment_reference'],
    categories: [F],
  },
  'finance.payment_allocations': {
    holds: "A payment's application to an invoice or its job's deposit requirement, in cents",
    classes: ['payment_reference'],
    categories: [F],
    protectedEvidence: true,
  },
  'finance.payments': {
    holds: 'Staff-recorded payments: method, amount in cents, date, collector, transaction reference, check payer',
    classes: ['payment_reference'],
    categories: [F],
    protectedEvidence: true,
  },
  'identity.auth_identities': {
    holds: 'Staff password hashes',
    classes: ['staff_account'],
    categories: [NS],
  },
  'identity.customer_account_changes': {
    holds: "Changes to a customer account's sign-in contact",
    classes: ['contact'],
    categories: [NS],
  },
  'identity.customer_accounts': {
    holds: 'Optional customer accounts: sign-in email or phone, state',
    classes: ['contact'],
    categories: [NS],
  },
  'identity.customer_identity_links': {
    holds: 'Verified links between an account and customer records, with their evidence',
    classes: ['contact'],
    categories: [NS],
  },
  'identity.customer_sessions': { holds: 'Customer sessions (token hashes)', classes: ['technical'], categories: [SL] },
  'identity.project_access_grants': {
    holds: 'Secure project access links (token hashes, expiry, revocation)',
    classes: ['technical'],
    categories: [SL],
  },
  'identity.rate_limits': {
    holds: 'Sign-in and code rate-limit buckets (hashed keys)',
    classes: ['technical'],
    categories: [SL],
  },
  'identity.role_grants': {
    holds: 'Staff role and capability grants with reasons',
    classes: ['staff_account'],
    categories: [NS],
  },
  'identity.staff_links': {
    holds: 'Staff invite and password-reset links (token hashes)',
    classes: ['technical'],
    categories: [SL],
    vendors: ['resend'],
  },
  'identity.staff_mfa': {
    holds: 'Staff second factors (sealed secrets)',
    classes: ['staff_account'],
    categories: [NS],
  },
  'identity.staff_recovery_codes': {
    holds: 'Staff recovery codes (hashes)',
    classes: ['staff_account'],
    categories: [NS],
  },
  'identity.staff_sessions': { holds: 'Staff sessions (token hashes)', classes: ['technical'], categories: [SL] },
  'identity.staff_status_changes': {
    holds: 'Disabling and re-enabling of staff accounts',
    classes: ['staff_account'],
    categories: [NS],
  },
  'identity.staff_users': {
    holds: 'Staff accounts: name, email, language, status',
    classes: ['staff_account'],
    categories: [NS],
  },
  'identity.verification_attempts': { holds: 'Verification code attempts', classes: ['technical'], categories: [SL] },
  'identity.verification_codes': {
    holds: 'One-time codes (digests) and their destination',
    classes: ['contact', 'technical'],
    categories: [SL],
    vendors: ['bird', 'resend'],
  },
  'intake.photos': {
    holds: 'Request and project photos (metadata; the files are in R2)',
    classes: ['photos'],
    categories: [R, J],
    vendors: ['r2'],
  },
  'intake.question_replies': {
    holds: "Customers' replies to staff questions, exactly as written",
    classes: ['request_details'],
    categories: [R, J],
  },
  'intake.question_reply_photos': {
    holds: 'The photos a reply attached (the photos are in intake.photos and R2)',
    classes: ['photos'],
    categories: [R, J],
  },
  'intake.questions': {
    holds: 'Questions staff published in a project, with their notice and reminder sends',
    classes: ['request_details'],
    categories: [R, J],
  },
  'intake.receipt_capabilities': {
    holds: 'Request receipt links (token hashes)',
    classes: ['technical'],
    categories: [SL],
  },
  'intake.request_answers': {
    holds: "Answers to a service's intake questions",
    classes: ['request_details'],
    categories: [R, J],
  },
  'intake.request_assignments': {
    holds: 'Who was responsible for a request, and when',
    classes: ['request_details'],
    categories: [R, J],
  },
  'intake.request_conversations': {
    holds: 'Recorded calls and conversations about a request',
    classes: ['request_details'],
    categories: [R, J],
  },
  'intake.request_decisions': {
    holds: 'Staff decisions on a request (Not a fit, estimate routes) with reasons',
    classes: ['request_details'],
    categories: [R, J],
  },
  'intake.request_notes': {
    holds: 'Staff notes on a request',
    classes: ['request_details'],
    categories: [R, J],
  },
  'intake.request_qualifications': {
    holds: 'Staff qualification checks of a request',
    classes: ['request_details'],
    categories: [R, J],
  },
  'intake.request_services': {
    holds: 'The services a request asks about',
    classes: ['request_details'],
    categories: [R, J],
  },
  'intake.requests': {
    holds: 'Service requests: the original submission, timing, preferences, consent choices, state',
    classes: ['request_details', 'contact', 'service_address'],
    categories: [R, J],
  },
  'intake.response_clocks': {
    holds: 'First-response clocks (internal target)',
    classes: ['request_details'],
    categories: [R, J],
  },
  'intake.response_events': {
    holds: 'Events that started or stopped a response clock',
    classes: ['request_details'],
    categories: [R, J],
  },
  'intake.upload_capabilities': {
    holds: 'Photo upload links (token hashes)',
    classes: ['technical'],
    categories: [SL],
  },
  'ops.queue_items': {
    holds: 'Staff action-queue items',
    classes: ['technical'],
    categories: [NS],
  },
  'platform.audit_events': {
    holds: 'The append-only audit log (redacted change summaries)',
    classes: ['logs_audit'],
    categories: [AU],
    protectedEvidence: true,
  },
  'platform.consent_records': {
    holds: 'Append-only consent per destination and purpose',
    classes: ['contact'],
    categories: [NS],
    protectedEvidence: true,
  },
  'platform.coverage_rule_sets': {
    holds: 'Versioned ZIP coverage rule sets',
    classes: ['configuration'],
    categories: [NS],
  },
  'platform.coverage_rules': {
    holds: 'One coverage disposition per ZIP',
    classes: ['configuration'],
    categories: [NS],
  },
  'platform.coverage_zip_datasets': {
    holds: "Versions of the owner's candidate service-area ZIP dataset (TSK-0127)",
    classes: ['configuration'],
    categories: [NS],
  },
  'platform.coverage_zip_entries': {
    holds: 'One ZIP of a candidate dataset with its category and service counties',
    classes: ['configuration'],
    categories: [NS],
  },
  'platform.idempotency_keys': {
    holds: 'Idempotency keys with the stored response (24 hours, PROPOSED engineering default)',
    classes: ['technical'],
    categories: [NS],
  },
  'platform.jobs': { holds: 'Background jobs and their state', classes: ['technical'], categories: [NS] },
  'platform.message_deliveries': {
    holds: 'Outgoing messages: type, destination, variables, delivery state',
    classes: ['contact', 'technical'],
    categories: [R, J],
    vendors: ['bird', 'resend'],
  },
  // TSK-0119 (HH-COM-14): the retry history of a delivery, kept like the delivery it belongs to.
  'platform.message_delivery_attempts': {
    holds: 'Send attempts of message deliveries (retry history, metadata only)',
    classes: ['technical'],
    categories: [R, J],
  },
  'platform.message_delivery_events': {
    holds: 'Provider delivery statuses',
    classes: ['technical'],
    categories: [R, J],
  },
  'platform.message_template_versions': {
    holds: 'Approved message wording per language',
    classes: ['configuration'],
    categories: [NS],
  },
  'platform.message_templates': { holds: 'Message types', classes: ['configuration'], categories: [NS] },
  'platform.outbox_events': { holds: 'Committed events awaiting their jobs', classes: ['technical'], categories: [NS] },
  'platform.policy_version': {
    holds: 'Versioned configuration values with their sources',
    classes: ['configuration'],
    categories: [NS],
    protectedEvidence: true,
  },
  'platform.rate_counters': {
    holds: 'Request-form and API rate counters (hashed keys)',
    classes: ['technical'],
    categories: [SL],
  },
  'platform.schema_migration': {
    holds: 'Applied migrations and their checksums',
    classes: ['configuration'],
    categories: [NS],
  },
  'platform.webhook_receipts': {
    holds: 'Verified provider webhooks: delivery statuses and inbound messages',
    classes: ['technical', 'contact'],
    categories: [R, J, NS],
    vendors: ['bird', 'resend'],
  },
  'privacy.deletions': {
    holds: 'The deletion log (TSK-0100): actor, time, record reference, reason and counts; never the deleted content',
    classes: ['logs_audit'],
    categories: [NS],
  },
  'privacy.privacy_requests': {
    holds:
      "Customers' export, correction and deletion requests: the requester, identity confirmation, the customer's " +
      "words for a correction, the review's counts and the Owner's decision",
    classes: ['contact', 'logs_audit'],
    categories: [NS],
  },
  'privacy.retention_decisions': {
    holds: "The Owner's Delete, Archive and Keep longer decisions on review entries, with the reason",
    classes: ['logs_audit'],
    categories: [NS],
  },
  'privacy.retention_reviews': {
    holds: "The Owner's deletion-review queue: record references and hold checks, never personal content",
    classes: ['logs_audit'],
    categories: [NS],
  },
  // TSK-0141: the staging-only test data management (never used in production; a production mark forbids a reset).
  // TSK-0093 (0081): cases. Complaints are job records; incident, damage, injury and dispute records (incident class,
  // restricted to the Owner and the reporter, OWN-DEC-143) are safety records, kept 10 years after closure.
  'quality.cases': {
    holds:
      'Cases: complaints (category, severity, source, assignee, due date) and incident, damage, injury and dispute ' +
      'cases (the reported type); state, reviewer, linked hold, resolution, re-check and closure; never fault, ' +
      'liability or compensation',
    classes: ['request_details', 'incident'],
    categories: [J, S],
  },
  'quality.incident_reports': {
    holds:
      'The restricted factual report of an incident, damage, injury or dispute: what happened, people affected, ' +
      'work areas, immediate actions and only the necessary medical detail; the Owner and the reporter only',
    classes: ['incident'],
    categories: [S],
    protectedEvidence: true,
  },
  'quality.case_notes': {
    holds:
      'Complaint descriptions and additions (internal) and restricted incident notes (the Owner and the reporter ' +
      'only), as staff wrote them',
    classes: ['request_details', 'incident'],
    categories: [J, S],
  },
  'quality.case_attachments': {
    holds:
      'Supporting photos of a case (metadata; the files are in R2), in the class of their case; never in the project ' +
      'gallery, the customer view or a worker feed',
    classes: ['photos', 'incident'],
    categories: [J, S],
    vendors: ['r2'],
  },
  'quality.case_follow_ups': {
    holds: 'Corrective follow-up items of a case: what, who, due date, done or canceled with the note',
    classes: ['request_details'],
    categories: [J, S],
  },
  'quality.case_referrals': {
    holds:
      "The Owner's own record of an insurer, attorney or other professional referral of a case: who was referred to, " +
      'the date and a note; never shown to customers',
    classes: ['incident'],
    categories: [S],
    protectedEvidence: true,
  },
  'quality.case_customer_updates': {
    holds:
      'Neutral customer updates of a case (acknowledgment, progress, next step, safety pause): the exact text, who ' +
      'drafted and who released it after review, and when',
    classes: ['contact', 'request_details'],
    categories: [J, S],
  },
  'quality.case_events': {
    holds: 'The history of each case: every state change with who, when and the note given',
    classes: ['logs_audit'],
    categories: [J, S],
  },
  // TSK-0084 (0082): the Owner's quality review of each job and its punch items are job records.
  'quality.reviews': {
    holds:
      "The Owner's quality review of each job: state, reviewer, self-review flag, the result for scope, checklist, " +
      'before/after evidence and walkthrough, the reviewer note and the times',
    classes: ['request_details'],
    categories: [J],
  },
  'quality.punch_items': {
    holds:
      'Punch items found at review: work package or area, kind and severity, description, required correction ' +
      'evidence, assignee, due date, linked safety hold, the correction note and the re-check, with who and when',
    classes: ['request_details'],
    categories: [J],
  },
  'quality.review_events': {
    holds: 'The history of each quality review and punch item: every state change with who, when and the note given',
    classes: ['logs_audit'],
    categories: [J],
  },
  // TSK-0075 (0083): the job checklist is part of the job record.
  'work.checklist_steps': {
    holds:
      'The job checklist: the state of each step of the pinned SOP version per work package, with its photos, ' +
      'measurement, note, skip reason, worker and completion time',
    classes: ['request_details', 'photos'],
    categories: [J],
  },
  'work.checklist_step_events': {
    holds: 'The history of each checklist step: every change with its worker, evidence, reason and time',
    classes: ['logs_audit'],
    categories: [J],
  },
  'work.checklist_handoffs': {
    holds: "Workers' handoff notes on a job: who, to whom, which work package and the note",
    classes: ['request_details'],
    categories: [J],
  },
  // TSK-0083 (0084): the walkthrough and the submission for quality review are job records.
  'work.walkthroughs': {
    holds:
      "End-of-job walkthroughs: the outcome, the participant's name and standing (none when the customer was " +
      'unavailable), comments, the dispute case a concern opened, the worker and the time',
    classes: ['contact', 'request_details'],
    categories: [J],
  },
  'work.job_completions': {
    holds: "The worker's Finished for a job: which walkthrough, who submitted it for quality review and when",
    classes: ['request_details'],
    categories: [J],
  },
  'work.change_orders': {
    holds: "Change orders of a job: the project's change-order number, where the change came from, who opened it",
    classes: ['request_details'],
    categories: [J],
  },
  'work.change_order_versions': {
    holds:
      'Change-order versions: reason, proposed scope, schedule impact, hazards, resources, evidence, the checklist ' +
      'steps that wait for it, totals against the approved scope, and who drafted, reviewed or withdrew it',
    classes: ['request_details', 'estimate_approval'],
    categories: [J],
  },
  'work.change_order_lines': {
    holds: 'Change-order price lines: charges and credits in integer cents, quantities, units and descriptions',
    classes: ['estimate_approval'],
    categories: [J],
  },
  // TSK-0082 (0088): the identified customer's approval or rejection of one exact change-order version.
  'work.change_order_decisions': {
    holds:
      'Customer decisions on change orders: the exact version and content digest, totals in cents, the terms, the ' +
      'typed name or the rejection reason, the verified contact and how they were identified (portal session or ' +
      'one-time code captured by a worker)',
    classes: ['estimate_approval', 'contact'],
    categories: [J],
    protectedEvidence: true,
  },
  'staging.environment_marks': {
    holds: 'Which environments identified themselves on this database (staging, local, ci or production) and when',
    classes: ['configuration'],
    categories: [NS],
    protectedEvidence: true,
  },
  'staging.reset_runs': {
    holds:
      'The protected staging trail of Reset Test Data: the Owner, time, mode, counts removed and kept, checks and ' +
      'error codes; never personal content',
    classes: ['logs_audit'],
    categories: [NS],
    protectedEvidence: true,
  },
  'staging.reusable_test_accounts': {
    holds: 'The customer accounts the Owner designated as reusable test accounts (account reference, who, when)',
    classes: ['technical'],
    categories: [NS],
  },
  'staging.test_data_seedings': {
    holds: 'What Reset & Create Fresh Test Data created: scenario outcomes, refusal codes and fictional references',
    classes: ['logs_audit'],
    categories: [NS],
  },
  'work.equipment': { holds: 'Shared equipment items', classes: ['configuration'], categories: [NS] },
  'work.field_photos': {
    holds:
      'Before and after photos per work package and visit (metadata; the files are in R2): who uploaded, when, the ' +
      "device capture time when sent, the worker's area label, the before/after pair, the processing state and the " +
      'visibility class with who last shared it',
    classes: ['photos'],
    categories: [J, S],
    vendors: ['r2'],
  },
  'work.gate_exceptions': {
    holds:
      "Start Work administrative exceptions: the worker's reason and evidence (a payment provider's transaction " +
      "reference for a deposit), the Owner's decision, follow-up owner and deadline, and how it ended",
    classes: ['scheduling'],
    categories: [J, S],
  },
  'work.holds': {
    holds: 'Review and safety holds and loadout task blocks with their resolution and reviewer',
    classes: ['request_details'],
    categories: [R, J, S],
  },
  'work.job_packet_acknowledgment_invalidations': {
    holds:
      "Why and when a packet acknowledgment stopped counting: a critical packet version, the end of the worker's " +
      'assignment or a disabled account (once each)',
    classes: ['scheduling'],
    categories: [J, S],
  },
  'work.job_packet_acknowledgments': {
    holds:
      "A worker's own acknowledgment of one job packet version: who, when, the version, its content digest, the " +
      'scope version and the SOP versions it covered',
    classes: ['scheduling'],
    categories: [J, S],
  },
  'work.job_packet_exports': {
    holds: 'Every print and PDF export of a job packet: who, when, which version, the latest version then',
    classes: ['logs_audit'],
    categories: [J],
  },
  'work.job_packet_views': {
    holds: 'Which job packet version a staff member viewed and when',
    classes: ['staff_account'],
    categories: [J],
  },
  'work.job_packets': {
    holds:
      'Versioned job packets: visits, team names, site-access and occupant details with sources, the accepted scope ' +
      'without prices, SOP pins, blocking holds and their notes; never an access code or the address itself',
    classes: ['request_details', 'scheduling', 'contact'],
    categories: [J],
  },
  'work.job_scope_snapshots': {
    holds: 'The accepted scope of a job, frozen at approval',
    classes: ['estimate_approval'],
    categories: [A],
    protectedEvidence: true,
  },
  // TSK-0077 (ENT-IssueReport, HH-WORK-08, HH-WORK-09, HH-CHG-04, OWN-DEC-143): Stop Work, hazard and issue reports.
  'work.issue_reports': {
    holds:
      'Stop Work / Report Hazard and issue reports: what was reported, its severity and text, the affected work ' +
      'packages, the critical hold it wrote, an on-site resolution, who and when; injury and incident details ' +
      'restricted to the Owner and the reporter',
    classes: ['request_details', 'incident'],
    categories: [J, S],
  },
  'work.issue_report_photos': {
    holds: "Photos of a report (metadata; the files are in R2), taken only when safe, with the report's visibility",
    classes: ['photos', 'incident'],
    categories: [J, S],
    vendors: ['r2'],
  },
  'work.issue_report_reviews': {
    holds: "The Owner's review of a non-critical issue report: who, when and an optional note",
    classes: ['request_details'],
    categories: [J, S],
  },
  'work.stabilization_records': {
    holds:
      'Emergency stabilization of a Stop Work: trigger, actions, why necessary, evidence, Owner and customer ' +
      'notification times and the follow-up',
    classes: ['request_details', 'incident'],
    categories: [J, S],
  },
  'work.jobs': { holds: 'Jobs of approved projects', classes: ['request_details'], categories: [J, A] },
  'work.loadout_checks': {
    holds:
      'What workers stated about each loadout item (loaded, missing, damaged) with their notes, and the approved ' +
      'substitutes; who and when',
    classes: ['request_details'],
    categories: [J, S],
  },
  'work.photo_publication_permissions': {
    holds:
      "A customer's evidenced permission to publish one field photo (purpose, channel, notice version), or its " +
      'withdrawal: how the customer gave it, a staff reference to the evidence, the Owner who recorded it and when',
    classes: ['contact'],
    categories: [C, J],
    protectedEvidence: true,
  },
  'work.reservation_flags': {
    holds: 'Appointments flagged by an availability change',
    classes: ['scheduling'],
    categories: [R, J],
  },
  'work.reservations': {
    holds: 'Staff and equipment reserved for a visit',
    classes: ['scheduling'],
    categories: [R, J],
  },
  'work.scheduling_tasks': { holds: 'Scheduling tasks of a job', classes: ['scheduling'], categories: [J] },
  'work.time_off': { holds: 'Recorded staff time off', classes: ['staff_account'], categories: [NS] },
  // TSK-0070 (HH-WORK-06, ENT-TimeStamp): Arrived and Finished per worker; the Owner's corrections keep the original.
  'work.time_stamp_corrections': {
    holds:
      "The Owner's corrections of a worker's Arrived or Finished: the value set, the value replaced and the reason",
    classes: ['scheduling', 'staff_account'],
    categories: [J],
  },
  'work.start_gate_evaluations': {
    holds:
      'Each Start Work attempt: every prerequisite with its missing items and resolution owners, the outcome, the ' +
      'packet, scope and SOP versions and the exceptions used',
    classes: ['scheduling'],
    categories: [J, S],
  },
  'work.start_site_checks': {
    holds:
      "A worker's site checks before Start Work (property, access, customer present, hazards reviewed, site as " +
      'described or different with their note)',
    classes: ['request_details'],
    categories: [J, S],
  },
  'work.time_stamps': {
    holds:
      "Each assigned worker's Arrived and Finished time per visit (server time; device time when sent); no pay data",
    classes: ['scheduling', 'staff_account'],
    categories: [J],
  },
  'work.visit_change_requests': {
    holds:
      "Customers' reschedule and cancellation requests of a visit: the customer's reason and preferred times, outcome",
    classes: ['scheduling', 'request_details'],
    categories: [R, J],
  },
  // TSK-0070 (HH-SCH-08): each assigned worker's "On my way" tap; the tap that moved the visit is marked.
  'work.visit_departures': {
    holds: "Each assigned worker's On my way tap per visit, and whether it moved the visit on the way",
    classes: ['scheduling'],
    categories: [J],
  },
  'work.visit_changes': {
    holds:
      'Committed reschedules, reassignments and cancellations: actor, reason, teams, and a cancellation outcome in cents',
    classes: ['scheduling', 'payment_reference'],
    categories: [J, F],
  },
  'work.visit_windows': {
    holds: 'The history of a visit window',
    classes: ['scheduling'],
    categories: [R, J],
  },
  'work.visits': {
    holds: 'Estimate and work visits: property, local window, buffers, state',
    classes: ['scheduling', 'service_address'],
    categories: [R, J],
  },
  'work.window_offer_options': {
    holds: 'The windows of an offer and their reserved ranges',
    classes: ['scheduling'],
    categories: [R, J],
  },
  'work.window_offers': {
    holds: 'Window offers of a tentative visit: hold expiry, policy version, outcome',
    classes: ['scheduling'],
    categories: [R, J],
  },
  'work.work_package_loadouts': {
    holds: 'The loadout version pinned on each work package of a job',
    classes: ['request_details'],
    categories: [J],
  },
  'work.work_package_sop_pins': {
    holds: 'The SOP version and digests pinned on each work package of a job, or NOT CONFIGURED',
    classes: ['request_details'],
    categories: [J, A],
  },
  'work.work_packages': {
    holds: 'Work packages of a project, one per service',
    classes: ['request_details'],
    categories: [R, J, A],
  },
  'work.work_starts': {
    holds:
      'Actual contracted work started, per worker and visit: the passing evaluation, the packet, scope and SOP ' +
      'versions, the acknowledgment, any approved exception and the server time',
    classes: ['scheduling'],
    categories: [J, S],
  },
  'work.worker_schedules': {
    holds: "A staff member's schedule time zone",
    classes: ['staff_account'],
    categories: [NS],
  },
  'work.working_hours': { holds: 'Staff working hours', classes: ['staff_account'], categories: [NS] },
} as const satisfies Record<keyof Database, TableAnnotation>

/** How a table's rows end their life, from its annotation. */
export function endOfLife(a: TableAnnotation): string {
  const evidence = 'Archive, Void or audited correction; never ordinary deletion'
  if (a.protectedEvidence === true) return evidence
  const review = "Owner's deletion review after the period; nothing deleted automatically"
  if (typeof a.protectedEvidence === 'string') return `${review}. ${a.protectedEvidence}: ${evidence}`
  if (a.categories.some((c) => CATEGORY_DEFINITIONS[c].configKey !== null)) return review
  if (a.categories.includes(SL)) return 'Expires per its security settings; keeping expired rows NOT CONFIGURED'
  if (a.categories.includes('access_codes'))
    return 'Staff remove it when no longer needed (the sealed value erased at once, the row kept); nothing automatic'
  return 'NOT CONFIGURED: kept, never deleted automatically'
}

const cell = (s: string) => s.replace(/\|/g, '\\|')
const row = (cells: readonly string[]) => `| ${cells.map(cell).join(' | ')} |`

/** docs/data-inventory.md, rendered from the annotations and the schedule. */
export function renderDataInventory(): string {
  const out: string[] = []
  const push = (...lines: string[]) => out.push(...lines)
  push(
    '# Data inventory',
    '',
    'Generated by `pnpm data-inventory` from the table annotations in `apps/server/src/modules/retention/inventory.ts`',
    'and the schedule in `apps/server/src/modules/retention/schedule.ts` (TSK-0099; HH-PRIV-01, HH-DATA-09). Do not edit',
    'by hand: a unit test fails when this file differs from the annotations, and the type check fails when a table has',
    'no annotation.',
    '',
    'The rules below quote the decided schedule (FACT-RETENTION-SCHEDULE, OWN-DEC-70, OWN-DEC-142). The periods in use',
    "are the active versions of each category's configuration key (seeded from those decisions by migrations 0055 and",
    '0056; the Owner may extend them), which the staff app shows under Retention reviews. The periods await CPA and',
    'attorney confirmation (OQ-RETENTION-REVIEW). Nothing is deleted automatically.',
    '',
    'PROPOSED: the mapping of tables to classes and categories, the classes marked PROPOSED, and the end-of-life method of',
    'data the schedule does not name (OQ-RETENTION-UNSCHEDULED).',
    '',
    '## Purpose and access classes',
    '',
    row(['Data class', 'Purpose', 'Allowed audience', 'Control requirement']),
    row(['---', '---', '---', '---']),
  )
  for (const c of Object.values(DATA_CLASSES))
    push(row([c.proposed ? `${c.name} (PROPOSED)` : c.name, c.purpose, c.audience, c.controls]))
  const used = new Set(Object.values(TABLES).flatMap((t) => t.classes as readonly string[]))
  const unused = (Object.keys(DATA_CLASSES) as DataClass[]).filter((k) => !used.has(k))
  push(
    '',
    `Not stored by the software yet: ${unused.map((k) => DATA_CLASSES[k].name).join(', ')}.`,
    '',
    '## Vendor destinations',
    '',
  )
  for (const v of Object.values(VENDORS)) push(`- ${v}.`)
  push(
    '- Square: payment links and Tap to Pay are used outside the software; payments are recorded manually, and no card',
    '  data is stored (INT-Square).',
    '- The vendors keep their own copies (sent messages, delivery logs, stored objects) under their own terms; how long',
    '  is NOT CONFIGURED (OQ-RETENTION-UNSCHEDULED).',
    '',
    '## Retention schedule',
    '',
    'Data owner for every category: the Owner, who decides each deletion-review entry (ENT-RetentionReview).',
    '',
    row(['Category', 'Rule (FACT-RETENTION-SCHEDULE)', 'Configuration', 'Retention job', 'Sources']),
    row(['---', '---', '---', '---', '---']),
  )
  const JOB = { scanned: 'Scanned daily', start_not_recorded: 'Start not recorded yet', no_period: 'No period' }
  for (const id of RETENTION_CATEGORIES) {
    const d = CATEGORY_DEFINITIONS[id]
    push(
      row([
        `\`${id}\``,
        d.decided,
        d.configKey ? `\`${d.configKey}\`` : 'none',
        `${JOB[d.scan]}: ${d.scanNote}`,
        d.sources.join(', '),
      ]),
    )
  }
  push(
    '',
    '## Review, holds and deletion',
    '',
    "- A record whose period ended gets one entry in the Owner's deletion-review queue (`privacy.retention_reviews`,",
    '  append-only). Nothing is deleted, archived or changed automatically; longer legal, tax, insurance or contractual',
    '  requirements override the periods, and the Owner may extend them.',
    `- Hold checks on every entry: ${HOLD_CHECKS.map((h) => `\`${h}\``).join(', ')}. Only open holds on the`,
    "  record's project are recorded by the software today; the others are listed as not recorded, for the Owner to",
    '  check. A hold blocks deletion of the record and its related evidence.',
    '- Issued invoices, payments, signed approvals and other protected evidence use Archive, Void or an audited',
    '  correction, never ordinary deletion. Archived and closed records keep their category and permissions.',
    "- The Owner's Delete action on a review entry (TSK-0100, HH-PRIV-05) shows the record reference, what goes with it,",
    '  what stays and whether deletion is permanent, and never passes a hold, protected evidence, a record in use or an',
    '  erasure the software does not perform; checks the software cannot run are confirmed by the Owner first. A blocked',
    '  deletion offers Archive; Keep longer brings the entry back later. Deletion needs a fresh sign-in and a reason.',
    '- Erasure performed today: estimates never accepted (versions, lines, internal costs and notes, documents, the',
    "  customer's responses and selections, reminders never released or sent, and their stored files after the commit)",
    '  and login accounts (closed: sign-in values cleared, sessions and project links revoked). Messages sent about an',
    '  erased estimate keep only its reference. Signed approvals, approval receipts, jobs, deposit records and recorded',
    '  payments are protected evidence and block it. Requests that never became jobs keep their history',
    '  (OQ-RECORD-ERASURE); audit entries are append-only for every role (OQ-AUDIT-ENTRY-DELETION).',
    '- The deletion log (`privacy.deletions`, append-only) keeps actor, time, record reference, reason and counts, never',
    '  the deleted content. Account deletion is separate from business records (OWN-DEC-71).',
    "- Privacy requests (HH-PRIV-03): the customer's export, correction or deletion request is reviewed and decided by",
    '  the Owner; the scoped search counts every record kind and says what is deleted, retained (why, until when) or',
    '  excluded (other contacts). Response deadlines and the outcome notice are NOT CONFIGURED (OQ-PRIVACY-REQUESTS).',
    '- Regulated employee medical or exposure records are excluded from routine deletion; their schedule is human review',
    '  (OQ-RETENTION-REVIEW).',
    '',
    '## Backups',
    '',
    '- Render PostgreSQL backups and Cloudflare R2 object versions: the production plan, backups and their retention are',
    '  NOT CONFIGURED (OQ-PRODUCTION-HOSTING). A deleted row or object stays in a backup until that backup expires.',
    '- A restore re-applies the deletions and suppressions recorded after the backup before a controlled resume (T72):',
    '  the deletion log is exported outside the backups (`node dist/cli/deletions.js export`, references only) and each',
    '  entry is applied again after a restore (`node dist/cli/deletions.js reapply <file>`); a record that something now',
    '  blocks is left in place and reported. Consent withdrawals (STOP, provider opt-outs) are exported and re-applied',
    '  the same way with the deletions (`node dist/cli/restore.js export --since <time>`, then `reapply <file>`;',
    '  docs/runbooks/restore.md, TSK-0106); only withdrawals are replayed, never an opt-in (PROPOSED).',
    '',
    '## Tables',
    '',
    row(['Table', 'Holds', 'Classes', 'Retention categories', 'End of life', 'Vendors']),
    row(['---', '---', '---', '---', '---', '---']),
  )
  const entries = Object.entries(TABLES as Record<string, TableAnnotation>).sort(([a], [b]) => a.localeCompare(b))
  for (const [table, a] of entries)
    push(
      row([
        `\`${table}\``,
        a.holds,
        a.classes.map((c) => DATA_CLASSES[c].name).join(', '),
        a.categories.map((c) => `\`${c}\``).join(', '),
        endOfLife(a),
        ['Render', ...(a.vendors ?? []).map((v) => ({ r2: 'R2', bird: 'Bird', resend: 'Resend' })[v])].join(', '),
      ]),
    )
  push('')
  return out.join('\n')
}
