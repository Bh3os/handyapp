// The template-variable registry (TSK-0119; HH-COM-13, OWN-DEC-151 section 6, OWN-DEC-158, HH-COM-04, T74). The one
// list of every variable a message template may use: its meaning, its kind, the record it is read from, whether it is
// required (only a variable with an approved fallback is optional, and only in the fallback's own line) and whether it
// may appear in a subject. Message types (message-types.ts) declare which of these variables they carry; a template
// may use only those, and a release that names any other variable is refused (templates.ts).
//
// - Values are always pre-formatted text read for the message's own project and recipient (the resolver of the
//   message, at send time). A missing value never falls back to another record, a literal placeholder or invented
//   text: rendering fails with the missing names only, and the delivery is recorded as failed with that reason.
// - Every value is validated by its kind before rendering: single-line kinds refuse line breaks, lengths are bounded,
//   control characters are refused, links must be absolute https URLs (http only on a loopback or *.localhost test
//   host) without credentials and, when the sender gives its permitted hosts, on one of them.
// - Sensitive values (the one-time code and secure access links: `sensitive`) appear only in the message itself: never
//   in an error, a log line, an audit summary, a preview or an analytics tag. Errors carry variable names, never values.
// - OWN-DEC-158: the customer's first name appears in the greeting only ("Hi there," when it is unavailable) and
//   non-sensitive reference numbers where relevant; amounts, property addresses, access codes, tokens and private
//   details never. `serviceAddress` stays declared for the staff-reviewed appointment-reminder draft (TSK-0067) but no
//   customer template may render it.
// - Variables marked `legacy` are the names today's resolvers still supply; the owner's names replace them as each
//   message's delivery is wired (TSK-0120, TSK-0121).

export type VariableKind =
  /** A person's name (a first name, a staff display name). One line. */
  | 'name'
  /** A non-sensitive reference number (request, estimate, job, visit, invoice, receipt, payment). One line. */
  | 'reference'
  /** Short descriptive text. Line breaks allowed. */
  | 'text'
  /** A released message text (a staff reply). Line breaks kept. */
  | 'message'
  /** A secure link into the portal or the staff app. */
  | 'link'
  /** The code or access link that is the message itself (sensitive). */
  | 'credential'
  /** A pre-formatted date, time, window or zone label. One line. */
  | 'datetime'
  /** A verified contact (phone or email) from configuration. One line. */
  | 'contact'

export type VariableSpec = {
  readonly kind: VariableKind
  readonly meaning: string
  /** The record the value is read from, always the message's own. */
  readonly source: string
  /** Whether the variable may appear in an email subject. */
  readonly subject: boolean
  /** Sensitive: shown only in the sent message, never in logs, previews or analytics. */
  readonly sensitive?: true
  /** A credential that is a URL (an access, invite or reset link) rather than a code. */
  readonly url?: true
  /** The approved fallback: when the value is unavailable, this exact template line becomes `text`. */
  readonly fallback?: { readonly line: string; readonly text: string }
  /** Never rendered in a customer template (OWN-DEC-158). */
  readonly customerForbidden?: true
  /** A name today's resolvers still supply; the owner's variable that replaces it. */
  readonly legacy?: string
}

const own = (spec: VariableSpec) => spec

/** Every registered template variable. Message types may declare only these names. */
export const TEMPLATE_VARIABLES = {
  // Customer variables (OWN-DEC-151 section 6).
  customerName: own({
    kind: 'name',
    meaning:
      "The customer's first name in a customer greeting (OWN-DEC-158); the customer's display name in a staff notice",
    source: 'the first name of the message’s own customer contact (crm.contacts)',
    subject: false,
    fallback: { line: 'Hi {customerName},', text: 'Hi there,' },
  }),
  reference: own({
    kind: 'reference',
    meaning: 'Request or project reference, as appropriate',
    source: 'the message’s own request or project (intake.requests.reference, crm.projects.reference)',
    subject: true,
  }),
  secureAccessLink: own({
    kind: 'credential',
    url: true,
    sensitive: true,
    meaning: 'Authorized secure access URL',
    source: 'the message’s own project access grant (ENT-ProjectAccessGrant)',
    subject: false,
  }),
  linkExpiration: own({
    kind: 'datetime',
    meaning: 'Link expiration date and time',
    source: 'the expiry of the message’s own access grant',
    subject: false,
  }),
  // Estimate variables.
  estimateNumber: own({
    kind: 'reference',
    meaning: 'Estimate identifier',
    source: 'the message’s own estimate (estimates.estimates.number)',
    subject: true,
  }),
  estimateLink: own({
    kind: 'link',
    meaning: 'Secure estimate URL',
    source: 'the portal page of the message’s own estimate',
    subject: false,
  }),
  // Appointment variables.
  appointmentLink: own({
    kind: 'link',
    meaning: 'Secure appointment selection URL',
    source: 'the portal page of the message’s own window offer',
    subject: false,
  }),
  holdExpiration: own({
    kind: 'datetime',
    meaning: 'Options expiration timestamp',
    source: 'the expiry of the message’s own window offer (work.window_offers.expires_at)',
    subject: false,
  }),
  visitNumber: own({
    kind: 'reference',
    meaning: 'Visit identifier',
    source: 'the message’s own visit (work.visits.number)',
    subject: true,
  }),
  visitDate: own({
    kind: 'datetime',
    meaning: 'Formatted visit date',
    source: 'the message’s own visit',
    subject: false,
  }),
  date: own({
    kind: 'datetime',
    meaning: 'Formatted appointment date',
    source: 'the message’s own visit',
    subject: false,
  }),
  startTime: own({ kind: 'datetime', meaning: 'Window beginning', source: 'the message’s own visit', subject: false }),
  endTime: own({ kind: 'datetime', meaning: 'Window end', source: 'the message’s own visit', subject: false }),
  start: own({
    kind: 'datetime',
    meaning: 'Reminder window beginning',
    source: 'the message’s own visit',
    subject: false,
  }),
  end: own({ kind: 'datetime', meaning: 'Reminder window end', source: 'the message’s own visit', subject: false }),
  zone: own({
    kind: 'datetime',
    meaning: 'Reminder time-zone label',
    source: 'the zone of the message’s own visit’s property (OWN-DEC-159)',
    subject: false,
  }),
  timeZone: own({
    kind: 'datetime',
    meaning: 'Display time zone',
    source: 'the zone of the message’s own visit’s property, or business.timezone (OWN-DEC-159)',
    subject: false,
  }),
  // Job variables.
  jobNumber: own({
    kind: 'reference',
    meaning: 'Job identifier',
    source: 'the message’s own job (work.jobs)',
    subject: true,
  }),
  serviceName: own({
    kind: 'text',
    meaning: 'Approved service description, only when it can be displayed safely in email (OWN-DEC-158)',
    source: 'the approved service of the message’s own job (catalog.services)',
    subject: false,
  }),
  projectLink: own({
    kind: 'link',
    meaning: 'Secure project URL',
    source: 'the portal page of the message’s own project',
    subject: false,
  }),
  changeOrderLink: own({
    kind: 'link',
    meaning: 'Secure change-order URL',
    source: 'the portal page of the message’s own change order',
    subject: false,
  }),
  // Payment variables.
  invoiceNumber: own({
    kind: 'reference',
    meaning: 'Invoice identifier',
    source: 'the message’s own invoice',
    subject: true,
  }),
  invoiceLink: own({
    kind: 'link',
    meaning: 'Secure invoice URL',
    source: 'the portal page of the message’s own invoice',
    subject: false,
  }),
  receiptNumber: own({
    kind: 'reference',
    meaning: 'Receipt identifier',
    source: 'the message’s own payment receipt',
    subject: true,
  }),
  receiptLink: own({
    kind: 'link',
    meaning: 'Secure receipt URL',
    source: 'the portal page of the message’s own payment receipt',
    subject: false,
  }),
  paymentNumber: own({
    kind: 'reference',
    meaning: 'Payment reference',
    source: 'the message’s own recorded payment',
    subject: false,
  }),
  // Staff variables.
  staffDisplayName: own({
    kind: 'name',
    meaning: 'Public-facing staff display name',
    source: 'the display name of the staff member who released the reply (identity.staff_users)',
    subject: false,
  }),
  staffMessage: own({
    kind: 'message',
    meaning: 'Released customer message',
    source: 'the released reply itself (comms.messages), when it can be emailed safely (OWN-DEC-158)',
    subject: false,
  }),
  staffName: own({
    kind: 'name',
    meaning: 'Internal staff recipient name',
    source: 'the recipient staff member (identity.staff_users)',
    subject: false,
  }),
  staffProjectLink: own({
    kind: 'link',
    meaning: 'Authorized staff project URL',
    source: 'the staff app page of the message’s own project or request',
    subject: false,
  }),
  receivedDateTime: own({
    kind: 'datetime',
    meaning: 'Customer reply timestamp',
    source: 'the received time of the customer’s reply (comms.messages)',
    subject: false,
  }),
  projectStatus: own({
    kind: 'text',
    meaning: 'Current project status',
    source: 'the state label of the message’s own project',
    subject: false,
  }),
  // Security variables.
  changeDate: own({
    kind: 'datetime',
    meaning: 'Email-change date',
    source: 'the account’s recorded sign-in email change',
    subject: false,
  }),
  changeTime: own({
    kind: 'datetime',
    meaning: 'Email-change time',
    source: 'the account’s recorded sign-in email change',
    subject: false,
  }),
  supportContact: own({
    kind: 'contact',
    meaning: 'Verified customer-support contact',
    source: 'business.public_contact (FACT-PUBLIC-CONTACT); unavailable while NOT CONFIGURED',
    subject: false,
  }),
  // Variables today's resolvers supply (TSK-0032 to TSK-0067); kept until each message's delivery is wired.
  services: own({
    kind: 'text',
    meaning: 'The requested services, as one line',
    source: 'the message’s own request',
    subject: false,
    legacy: 'reference',
  }),
  summary: own({
    kind: 'text',
    meaning: 'A summary of the request',
    source: 'the message’s own request',
    subject: false,
    legacy: 'reference',
  }),
  nextSteps: own({
    kind: 'text',
    meaning: 'The configured next steps of a request',
    source: 'configuration (contact.hours, response.target)',
    subject: false,
    legacy: 'reference',
  }),
  verificationCode: own({
    kind: 'credential',
    sensitive: true,
    meaning: 'The one-time verification code',
    source: 'the code issued for this message only (identity.verification_codes)',
    subject: false,
  }),
  codeLifetimeMinutes: own({
    kind: 'text',
    meaning: 'The configured code lifetime in minutes',
    source: 'session.timings.oneTimeCodeMinutes',
    subject: false,
  }),
  accessLink: own({
    kind: 'credential',
    url: true,
    sensitive: true,
    meaning: 'The secure project access link',
    source: 'the message’s own project access grant',
    subject: false,
    legacy: 'secureAccessLink',
  }),
  visitWindow: own({
    kind: 'datetime',
    meaning: 'The visit date and arrival window, as one line',
    source: 'the message’s own visit',
    subject: false,
    legacy: 'visitDate',
  }),
  workerFirstNames: own({
    kind: 'name',
    meaning: 'The first names of the assigned workers',
    source: 'the message’s own visit team',
    subject: false,
  }),
  arrivalWindow: own({
    kind: 'datetime',
    meaning: 'The arrival window of the visit',
    source: 'the message’s own visit',
    subject: false,
  }),
  inviteLink: own({
    kind: 'credential',
    url: true,
    sensitive: true,
    meaning: 'The staff invitation link',
    source: 'the staff link issued for this message only',
    subject: false,
  }),
  resetLink: own({
    kind: 'credential',
    url: true,
    sensitive: true,
    meaning: 'The staff password-reset link',
    source: 'the staff link issued for this message only',
    subject: false,
  }),
  appLink: own({
    kind: 'link',
    meaning: 'The staff app page of the record',
    source: 'the staff app page of the message’s own record',
    subject: false,
    legacy: 'staffProjectLink',
  }),
  replyText: own({
    kind: 'message',
    meaning: 'The staff reply text',
    source: 'the released reply itself',
    subject: false,
    legacy: 'staffMessage',
  }),
  serviceAddress: own({
    kind: 'text',
    meaning: 'The visit address, for the staff review of a reminder draft only',
    source: 'the message’s own visit property',
    subject: false,
    customerForbidden: true,
  }),
  preparationSteps: own({
    kind: 'message',
    meaning: 'Preparation steps staff gave with the offer',
    source: 'the message’s own window offer',
    subject: false,
  }),
} as const satisfies Record<string, VariableSpec>

export type VariableName = keyof typeof TEMPLATE_VARIABLES

export function variableSpec(name: string): VariableSpec | undefined {
  return Object.hasOwn(TEMPLATE_VARIABLES, name)
    ? (TEMPLATE_VARIABLES as Record<string, VariableSpec>)[name]
    : undefined
}

/** Whether a variable value must never leave the sent message (logs, previews, analytics). */
export function isSensitiveVariable(name: string): boolean {
  return variableSpec(name)?.sensitive === true
}

const MAX_LENGTH: Record<VariableKind, number> = {
  name: 80,
  reference: 60,
  text: 1000,
  message: 5000,
  link: 2000,
  credential: 2000,
  datetime: 80,
  contact: 200,
}
const MULTI_LINE: ReadonlySet<VariableKind> = new Set(['text', 'message'])
// Control characters other than the line breaks multi-line kinds keep.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/
const LOOPBACK = (host: string) => host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')

/** The hosts a link value may point at: the configured public and staff origins (HH-COM-13). */
export function linkHostsOf(...origins: readonly (string | undefined | null)[]): string[] {
  const hosts = new Set<string>()
  for (const o of origins) {
    if (!o || !URL.canParse(o)) continue
    hosts.add(new URL(o).hostname.toLowerCase())
  }
  return [...hosts]
}

/**
 * Why a link value may not be sent, or null when it may: an absolute https URL (http only on a loopback or
 * *.localhost test host or a permitted local origin), without credentials, on one of `hosts` when they are given.
 */
export function linkProblem(value: string, hosts?: readonly string[]): string | null {
  if (!URL.canParse(value)) return 'not_a_url'
  const u = new URL(value)
  const host = u.hostname.toLowerCase()
  // http only for a test host: loopback, or a permitted origin of local or CI (staging and production refuse http
  // origins at start-up, config.ts).
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && (LOOPBACK(host) || hosts?.includes(host))))
    return 'not_https'
  if (u.username || u.password) return 'has_credentials'
  if (hosts && !hosts.includes(host)) return 'host_not_permitted'
  return null
}

/** Why a value may not be rendered for this variable, or null when it may. Never includes the value itself. */
export function valueProblem(name: string, value: unknown, hosts?: readonly string[]): string | null {
  const spec = variableSpec(name)
  if (!spec) return 'not_registered'
  if (typeof value !== 'string') return 'not_text'
  const v = value.trim()
  if (v === '') return 'empty'
  if (v.length > MAX_LENGTH[spec.kind]) return 'too_long'
  if (CONTROL.test(v)) return 'control_characters'
  if (!MULTI_LINE.has(spec.kind) && /[\r\n]/.test(v)) return 'line_break'
  if (spec.kind === 'link' || (spec.kind === 'credential' && spec.url)) return linkProblem(v, hosts)
  return null
}

/**
 * Synthetic sample values for staff previews (RULE-SYNTHETIC-DATA): obviously made up, on the reserved example.test
 * host, never a real customer's value or a working token. A preview never renders a sensitive value of a real message.
 */
export const SAMPLE_VALUES: Readonly<Record<VariableName, string>> = {
  customerName: 'Sample',
  reference: 'HH-0000TEST',
  secureAccessLink: 'https://example.test/access/sample-preview-link',
  linkExpiration: 'October 2, 2026 at 9:00 AM ET',
  estimateNumber: 'HH-0000TEST-E1',
  estimateLink: 'https://example.test/portal/p/HH-0000TEST/estimate',
  appointmentLink: 'https://example.test/portal/p/HH-0000TEST/appointments',
  holdExpiration: 'October 2, 2026 at 9:00 AM ET',
  visitNumber: 'HH-0000TEST-V1',
  visitDate: 'Friday, October 2, 2026',
  date: 'Friday, October 2, 2026',
  startTime: '9:00 AM',
  endTime: '11:00 AM',
  start: '9:00 AM',
  end: '11:00 AM',
  zone: 'ET',
  timeZone: 'ET',
  jobNumber: 'HH-0000TEST-J1',
  serviceName: 'Sample service',
  projectLink: 'https://example.test/portal/p/HH-0000TEST',
  changeOrderLink: 'https://example.test/portal/p/HH-0000TEST/changes',
  invoiceNumber: 'HH-0000TEST-I1',
  invoiceLink: 'https://example.test/portal/p/HH-0000TEST/invoices',
  receiptNumber: 'HH-0000TEST-R1',
  receiptLink: 'https://example.test/portal/p/HH-0000TEST/receipts',
  paymentNumber: 'HH-0000TEST-P1',
  staffDisplayName: 'Sample Staff',
  staffMessage: 'This is a sample reply for the preview.\nIt is not a real message.',
  staffName: 'Sample Staff',
  staffProjectLink: 'https://example.test/staff/requests/sample',
  receivedDateTime: 'October 1, 2026 at 2:30 PM ET',
  projectStatus: 'Sample status',
  changeDate: 'October 1, 2026',
  changeTime: '2:30 PM',
  supportContact: 'support contact (sample)',
  services: 'Sample service',
  summary: 'Sample summary',
  nextSteps: 'Sample next steps',
  verificationCode: '000000',
  codeLifetimeMinutes: '10',
  accessLink: 'https://example.test/access/sample-preview-link',
  visitWindow: 'Friday, October 2, 2026, 9:00 AM to 11:00 AM ET',
  workerFirstNames: 'Sample',
  arrivalWindow: '9:00 AM to 11:00 AM ET',
  inviteLink: 'https://example.test/staff/invite/sample-preview-link',
  resetLink: 'https://example.test/staff/reset/sample-preview-link',
  appLink: 'https://example.test/staff/requests/sample',
  replyText: 'This is a sample reply for the preview.',
  serviceAddress: 'Sample address',
  preparationSteps: 'Sample preparation steps.',
}

/** The host of every sample link, for the preview's link check. */
export const SAMPLE_LINK_HOSTS: readonly string[] = ['example.test']

/**
 * The first name for a greeting (OWN-DEC-158): the first word of the contact's full name as the customer typed it,
 * when it is a plain name (letters, apostrophes, hyphens, periods); otherwise '' so the approved "Hi there," applies.
 * PROPOSED reading: contacts store one full name, so its first word is taken as the first name.
 */
export function firstNameOf(fullName: string | null | undefined): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0] ?? ''
  return /^[\p{L}][\p{L}'’.-]{0,39}$/u.test(first) ? first : ''
}
