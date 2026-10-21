// Customer portal API client (TSK-0038; HH-PORT-06, HH-ARC-10, HH-PORT-01). Same-origin JSON reads of /api/v1/customer;
// the customer session is an HttpOnly cookie the page never sees. Every answer is checked against the shape the
// server's customer views declare (apps/server/src/modules/records/projections.ts); anything else is a failure, never
// shown as data. Outcomes the page shows as its own states:
// - 401: the session ended (expired, signed out or revoked);
// - 403 / 404: this project is not available to this session (a project outside it is the same NOT_FOUND as a
//   missing one, T19);
// - a network failure, a server error or an unexpected answer: failed.
// TSK-0056 adds the estimate view (estimate_version.customer) and the customer's responses to it (POST, JSON body,
// with an idempotency key the page keeps for retries of the same response). TSK-0057 adds the selected options, the
// approval (one key per approval attempt, kept for its retries) and the session's fresh verification.

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>

/** A project reference as the server issues it (REFERENCE_PATTERN of @handyhub/domain/request-form). */
export const REFERENCE = /^HH-[0-9A-HJKMNP-TV-Z]{8}$/

export const SITUATIONS = [
  'received',
  'more_information',
  'site_visit',
  'estimate_ready',
  'approved',
  'scheduled',
  'on_the_way',
  'work_in_progress',
  'safety_hold',
  'update_pending',
  'completion_review',
  'follow_up_work',
  'work_complete',
  'not_a_fit',
  'canceled',
  'closed_no_response',
] as const
export type Situation = (typeof SITUATIONS)[number]

export const STEPS = [
  'review_details',
  'answer_questions',
  'visit_windows_pending',
  'choose_visit_window',
  'review_estimate',
  'deposit_due',
  'choose_work_appointment',
  'view_appointment',
  'arrival_update',
  'view_updates',
  'safety_review',
  'update_pending',
  'completion_review',
  'follow_up_work',
  'review_care_notes_and_invoice',
  'decision',
  'closed',
] as const
export type Step = (typeof STEPS)[number]

export const NEXT_ACTIONS = [
  'reply',
  'choose_visit_window',
  'review_estimate',
  'pay_deposit',
  'choose_work_appointment',
  'review_visit',
  'review_change',
  'pay_invoice',
  'contact_support',
  'none',
] as const
export type NextAction = (typeof NEXT_ACTIONS)[number]

export const WAITING = ['customer', 'handyhub', 'nobody'] as const
export type Waiting = (typeof WAITING)[number]

export const TIMELINE_KINDS = ['received', 'more_information', 'site_visit', 'not_a_fit'] as const
export type TimelineKind = (typeof TIMELINE_KINDS)[number]

export type Status = {
  situation: Situation
  step: Step
  waitingOn: Waiting
  nextAction: NextAction
  since: string
}
export type ProjectSummary = {
  reference: string
  services: string[]
  notSure: boolean
  submittedAt: string
  status: Status
}
export type ProjectList = { projects: ProjectSummary[]; refreshedAt: string; refreshSeconds: number }
export type TimelineEntry = { kind: TimelineKind; at: string; text: string | null }
export type ProjectOverview = {
  reference: string
  services: string[]
  notSure: boolean
  submittedAt: string
  status: Status & { text: string | null }
  timeline: TimelineEntry[]
  appointment: null
  payment: Payment
  refreshedAt: string
  refreshSeconds: number
}

/**
 * The Overview's payment summary (TSK-0059): the deposit while it is due (amount, verified and pending money, the
 * Square link HandyHub entered) or once it is received; nothing to pay otherwise.
 */
export type Payment =
  | { state: 'none' }
  | {
      state: 'deposit_due'
      amountCents: number
      verifiedCents: number
      pendingCents: number
      payByCardUrl: string | null
    }
  | { state: 'deposit_received'; amountCents: number }

export type Failure = 'expired' | 'unavailable' | 'failed'
export type Result<T> = { ok: true; data: T } | { ok: false; failure: Failure }

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const isDate = (v: unknown): v is string => isStr(v) && !Number.isNaN(Date.parse(v))
const oneOf =
  <T extends string>(values: readonly T[]) =>
  (v: unknown): v is T =>
    isStr(v) && (values as readonly string[]).includes(v)
const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)
const isSeconds = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0

function status(v: unknown): Status | null {
  if (!isObj(v)) return null
  const { situation, step, waitingOn, nextAction, since } = v
  if (!oneOf(SITUATIONS)(situation) || !oneOf(STEPS)(step) || !oneOf(WAITING)(waitingOn)) return null
  if (!oneOf(NEXT_ACTIONS)(nextAction) || !isDate(since)) return null
  return { situation, step, waitingOn, nextAction, since }
}

function summary(v: unknown): ProjectSummary | null {
  if (!isObj(v)) return null
  const s = status(v['status'])
  const { reference, services, notSure, submittedAt } = v
  if (!s || !isStr(reference) || !isStrings(services) || typeof notSure !== 'boolean' || !isDate(submittedAt))
    return null
  return { reference, services, notSure, submittedAt, status: s }
}

export function parseList(v: unknown): ProjectList | null {
  if (!isObj(v) || !Array.isArray(v['projects']) || !isDate(v['refreshedAt']) || !isSeconds(v['refreshSeconds']))
    return null
  const projects = v['projects'].map(summary)
  if (projects.some((p) => p === null)) return null
  return { projects: projects as ProjectSummary[], refreshedAt: v['refreshedAt'], refreshSeconds: v['refreshSeconds'] }
}

function entry(v: unknown): TimelineEntry | null {
  if (!isObj(v) || !oneOf(TIMELINE_KINDS)(v['kind']) || !isDate(v['at'])) return null
  const text = v['text']
  if (text !== null && !isStr(text)) return null
  return { kind: v['kind'], at: v['at'], text }
}

/** Only an https link is ever offered as Pay by Card. */
const isHttps = (v: unknown): v is string => isStr(v) && /^https:\/\//.test(v)

function paymentOf(v: unknown): Payment | null {
  if (!isObj(v)) return null
  if (v['state'] === 'none') return { state: 'none' }
  if (v['state'] === 'deposit_received')
    return isCents(v['amountCents']) ? { state: v['state'], amountCents: v['amountCents'] } : null
  if (v['state'] !== 'deposit_due') return null
  const { amountCents, verifiedCents, pendingCents, payByCardUrl } = v
  if (!isCents(amountCents) || !isCents(verifiedCents) || !isCents(pendingCents)) return null
  if (payByCardUrl !== null && !isHttps(payByCardUrl)) return null
  return { state: 'deposit_due', amountCents, verifiedCents, pendingCents, payByCardUrl }
}

export function parseOverview(v: unknown): ProjectOverview | null {
  if (!isObj(v)) return null
  const head = summary(v)
  const s = head && isObj(v['status']) ? v['status']['text'] : undefined
  if (!head || (s !== null && !isStr(s))) return null
  if (!Array.isArray(v['timeline']) || v['appointment'] !== null) return null
  const timeline = v['timeline'].map(entry)
  if (timeline.some((e) => e === null)) return null
  const payment = paymentOf(v['payment'])
  if (!payment) return null
  if (!isDate(v['refreshedAt']) || !isSeconds(v['refreshSeconds'])) return null
  return {
    ...head,
    status: { ...head.status, text: s },
    timeline: timeline as TimelineEntry[],
    appointment: null,
    payment,
    refreshedAt: v['refreshedAt'],
    refreshSeconds: v['refreshSeconds'],
  }
}

// The workspace tabs beside the Overview (TSK-0039; HH-PORT-09): each answers with its own declared view.
export const WORKSPACE_TABS = ['messages', 'documents', 'photos', 'appointments', 'payments'] as const
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number]
type TabHead = { reference: string; refreshedAt: string; refreshSeconds: number }
export type PhotoCounts = { received: number; processing: number; failed: number }

// The estimate versions of the Documents tab and the customer estimate view (TSK-0056; HH-PORT-10, HH-EST-06).
export const VERSION_STATUSES = ['current', 'approved', 'declined', 'expired', 'superseded', 'withdrawn'] as const
export type VersionStatus = (typeof VERSION_STATUSES)[number]
export type EstimateListItem = {
  number: string
  version: number
  status: VersionStatus
  publishedAt: string
  validUntil: string | null
  totalCents: number
}

/** What each tab holds today: a closed state code, the estimates (Documents) or the photo counts (Photos). */
export type TabData =
  | (TabHead & { tab: 'messages'; state: 'not_shown' })
  | (TabHead & { tab: 'documents'; state: 'none' })
  | (TabHead & { tab: 'documents'; state: 'listed'; estimates: EstimateListItem[] })
  | (TabHead & { tab: 'appointments' | 'payments'; state: 'none' })
  | (TabHead & { tab: 'photos'; photos: PhotoCounts })

const TAB_STATE: Record<Exclude<WorkspaceTab, 'photos'>, string> = {
  messages: 'not_shown',
  documents: 'none',
  appointments: 'none',
  payments: 'none',
}

export function parseTab(tab: WorkspaceTab, v: unknown): TabData | null {
  if (!isObj(v) || !isStr(v['reference']) || !isDate(v['refreshedAt']) || !isSeconds(v['refreshSeconds'])) return null
  const head: TabHead = {
    reference: v['reference'],
    refreshedAt: v['refreshedAt'],
    refreshSeconds: v['refreshSeconds'],
  }
  if (tab === 'photos') {
    const p = v['photos']
    if (!isObj(p) || !isSeconds(p['received']) || !isSeconds(p['processing']) || !isSeconds(p['failed'])) return null
    return { ...head, tab, photos: { received: p['received'], processing: p['processing'], failed: p['failed'] } }
  }
  if (tab === 'documents' && v['state'] === 'listed') {
    const list = Array.isArray(v['estimates']) ? v['estimates'].map(listItem) : null
    if (!list || list.length === 0 || list.some((e) => e === null)) return null
    return { ...head, tab, state: 'listed', estimates: list as EstimateListItem[] }
  }
  // Any other state (for example "paid" or "read") is not what the view declares: a failure, never shown as data.
  if (v['state'] !== TAB_STATE[tab]) return null
  if (tab === 'messages') return { ...head, tab, state: 'not_shown' }
  if (tab === 'documents') return { ...head, tab, state: 'none' }
  return { ...head, tab, state: 'none' }
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const isCents = (v: unknown): v is number => isInt(v) && v >= 0
const isNullableStr = (v: unknown): v is string | null => v === null || isStr(v)
const isNullableDate = (v: unknown): v is string | null => v === null || isDate(v)

function listItem(v: unknown): EstimateListItem | null {
  if (!isObj(v)) return null
  const { number, version, status, publishedAt, validUntil, totalCents } = v
  if (!isStr(number) || !isInt(version) || !oneOf(VERSION_STATUSES)(status) || !isDate(publishedAt)) return null
  if (!isNullableDate(validUntil) || !isCents(totalCents)) return null
  return { number, version, status, publishedAt, validUntil, totalCents }
}

export const TERMS_STATES = ['not_configured', 'not_in_effect', 'in_effect'] as const
export type TermsState = (typeof TERMS_STATES)[number]
export const APPROVAL_REASONS = [
  'terms_not_configured',
  'terms_not_in_effect',
  'superseded',
  'expired',
  'not_published',
] as const
export type ApprovalReason = (typeof APPROVAL_REASONS)[number]
export const RESPONSE_KINDS = ['changes_requested', 'declined', 'update_requested'] as const
export type ResponseKind = (typeof RESPONSE_KINDS)[number]

export type EstimateLine = {
  /** The line's position on the version: an option is selected by it (TSK-0057). */
  position: number
  kind: 'base' | 'alternate' | 'add_on'
  serviceCode: string | null
  description: string | null
  quantity: string | null
  unit: string | null
  unitPriceCents: number | null
  amountCents: number | null
}
export type EstimateResponse = { kind: ResponseKind; version: number; at: string; message: string | null }
/** The server's totals for the selected options (integer cents). */
export type Selection = {
  options: number[]
  subtotalCents: number
  reductionCents: number
  totalCents: number
  deposit: { state: 'required' | 'not_required'; amountCents: number | null }
}
export type Approved = Selection & { at: string }
export type EstimateDetail = {
  reference: string
  number: string
  version: number
  status: VersionStatus
  issuerName: string | null
  publishedAt: string
  validUntil: string | null
  lines: EstimateLine[]
  assumptions: string[]
  exclusions: string[]
  customerResponsibilities: string[]
  dependencies: string[]
  scheduleAssumptions: string[]
  subtotalCents: number
  /** The totals row before the total, worded by the server (the same words as the customer PDF). */
  reduction: { label: string; amountCents: number } | null
  totalCents: number
  deposit: { state: 'required' | 'not_required'; amountCents: number | null }
  paymentTerm: string
  document: { url: string; byteSize: number } | null
  terms: { documentId: string | null; state: TermsState }
  approval: {
    available: boolean
    reasons: ApprovalReason[]
    current: { number: string; version: number } | null
    contentDigest: string
    selection: Selection | null
    approved: Approved | null
  }
  actions: { requestChanges: boolean; decline: boolean; requestUpdate: boolean }
  freshVerification: boolean
  responses: EstimateResponse[]
  testMark: boolean
  refreshedAt: string
  refreshSeconds: number
}

const LINE_KINDS = ['base', 'alternate', 'add_on'] as const
function line(v: unknown): EstimateLine | null {
  if (!isObj(v) || !oneOf(LINE_KINDS)(v['kind']) || !isInt(v['position']) || v['position'] < 1) return null
  const { serviceCode, description, quantity, unit, unitPriceCents, amountCents } = v
  if (![serviceCode, description, quantity, unit].every(isNullableStr)) return null
  if (![unitPriceCents, amountCents].every((c) => c === null || isCents(c))) return null
  return {
    position: v['position'],
    kind: v['kind'],
    serviceCode: serviceCode as string | null,
    description: description as string | null,
    quantity: quantity as string | null,
    unit: unit as string | null,
    unitPriceCents: unitPriceCents as number | null,
    amountCents: amountCents as number | null,
  }
}
function response(v: unknown): EstimateResponse | null {
  if (!isObj(v) || !oneOf(RESPONSE_KINDS)(v['kind']) || !isInt(v['version']) || !isDate(v['at'])) return null
  if (!isNullableStr(v['message'])) return null
  return { kind: v['kind'], version: v['version'], at: v['at'], message: v['message'] }
}

/** The customer estimate view (estimate_version.customer); anything else is a failure, never shown as data. */
export function parseEstimate(v: unknown): EstimateDetail | null {
  if (!isObj(v)) return null
  const head = listItem(v)
  if (!head || !isStr(v['reference']) || !isNullableStr(v['issuerName']) || !isStr(v['paymentTerm'])) return null
  const lists = [
    'assumptions',
    'exclusions',
    'customerResponsibilities',
    'dependencies',
    'scheduleAssumptions',
  ] as const
  if (!lists.every((k) => isStrings(v[k]))) return null
  if (!isCents(v['subtotalCents'])) return null
  const lines = Array.isArray(v['lines']) ? v['lines'].map(line) : null
  if (!lines || lines.some((l) => l === null)) return null
  const reduction = v['reduction']
  if (reduction !== null && !(isObj(reduction) && isStr(reduction['label']) && isCents(reduction['amountCents'])))
    return null
  const deposit = v['deposit']
  if (!isObj(deposit) || !oneOf(['required', 'not_required'] as const)(deposit['state'])) return null
  if (deposit['state'] === 'required' ? !isCents(deposit['amountCents']) : deposit['amountCents'] !== null) return null
  const document = v['document']
  if (document !== null && !(isObj(document) && isStr(document['url']) && isCents(document['byteSize']))) return null
  const terms = v['terms']
  if (!isObj(terms) || !isNullableStr(terms['documentId']) || !oneOf(TERMS_STATES)(terms['state'])) return null
  const approval = v['approval']
  if (!isObj(approval) || typeof approval['available'] !== 'boolean' || !Array.isArray(approval['reasons'])) return null
  if (!approval['reasons'].every(oneOf(APPROVAL_REASONS))) return null
  // Approval is offered only when the server says so and gives no reason against it.
  if (approval['available'] && approval['reasons'].length > 0) return null
  const current = approval['current']
  if (current !== null && !(isObj(current) && isStr(current['number']) && isInt(current['version']))) return null
  if (!isStr(approval['contentDigest']) || !/^[0-9a-f]{64}$/.test(approval['contentDigest'])) return null
  const selection = approval['selection'] === null ? null : parseSelection(approval['selection'])
  if (approval['selection'] !== null && !selection) return null
  const approved = approval['approved'] === null ? null : parseApproved(approval['approved'])
  if (approval['approved'] !== null && !approved) return null
  const actions = v['actions']
  if (!isObj(actions) || !['requestChanges', 'decline', 'requestUpdate'].every((k) => typeof actions[k] === 'boolean'))
    return null
  const responses = Array.isArray(v['responses']) ? v['responses'].map(response) : null
  if (!responses || responses.some((r) => r === null)) return null
  if (typeof v['freshVerification'] !== 'boolean' || typeof v['testMark'] !== 'boolean') return null
  if (!isDate(v['refreshedAt']) || !isSeconds(v['refreshSeconds'])) return null
  return {
    ...head,
    reference: v['reference'],
    issuerName: v['issuerName'],
    lines: lines as EstimateLine[],
    assumptions: v['assumptions'] as string[],
    exclusions: v['exclusions'] as string[],
    customerResponsibilities: v['customerResponsibilities'] as string[],
    dependencies: v['dependencies'] as string[],
    scheduleAssumptions: v['scheduleAssumptions'] as string[],
    subtotalCents: v['subtotalCents'],
    reduction: reduction as EstimateDetail['reduction'],
    deposit: deposit as EstimateDetail['deposit'],
    paymentTerm: v['paymentTerm'],
    document: document as EstimateDetail['document'],
    terms: terms as EstimateDetail['terms'],
    approval: {
      available: approval['available'],
      reasons: approval['reasons'] as ApprovalReason[],
      current: current as EstimateDetail['approval']['current'],
      contentDigest: approval['contentDigest'],
      selection,
      approved,
    },
    actions: actions as EstimateDetail['actions'],
    freshVerification: v['freshVerification'],
    responses: responses as EstimateResponse[],
    testMark: v['testMark'],
    refreshedAt: v['refreshedAt'],
    refreshSeconds: v['refreshSeconds'],
  }
}

/** The server's totals for a selection; anything else is a failure. */
export function parseSelection(v: unknown): Selection | null {
  if (!isObj(v) || !Array.isArray(v['options']) || !v['options'].every((o) => isInt(o) && o >= 1)) return null
  if (!isCents(v['subtotalCents']) || !isCents(v['reductionCents']) || !isCents(v['totalCents'])) return null
  const d = v['deposit']
  if (!isObj(d) || !oneOf(['required', 'not_required'] as const)(d['state'])) return null
  if (d['state'] === 'required' ? !isCents(d['amountCents']) : d['amountCents'] !== null) return null
  return {
    options: v['options'] as number[],
    subtotalCents: v['subtotalCents'],
    reductionCents: v['reductionCents'],
    totalCents: v['totalCents'],
    deposit: { state: d['state'], amountCents: d['amountCents'] as number | null },
  }
}
function parseApproved(v: unknown): Approved | null {
  const s = parseSelection(v)
  return s && isObj(v) && isDate(v['at']) ? { ...s, at: v['at'] } : null
}

/** Why a response was not recorded, as the page says it. */
export type WriteFailure = Failure | 'fresh_verification' | 'not_applicable' | 'invalid' | 'rate_limited'
export type WriteResult = { ok: true; status: VersionStatus } | { ok: false; failure: WriteFailure }

/** A random idempotency key; the page keeps it for retries of the same response. */
export function idempotencyKey(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return `portal-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`
}

const RESPONSE_PATH: Record<ResponseKind, string> = {
  changes_requested: 'request-changes',
  declined: 'decline',
  update_requested: 'request-update',
}

async function respond(
  fetchImpl: Fetch,
  ref: { reference: string; number: string; version: number },
  kind: ResponseKind,
  body: Record<string, string>,
  key: string,
): Promise<WriteResult> {
  const path =
    `/api/v1/customer/projects/${encodeURIComponent(ref.reference)}/estimates/${encodeURIComponent(ref.number)}` +
    `/versions/${ref.version}/${RESPONSE_PATH[kind]}`
  let res: Response
  try {
    res = await fetchImpl(path, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify(body),
    })
  } catch {
    return { ok: false, failure: 'failed' }
  }
  const json = (await res.json().catch(() => null)) as unknown
  if (res.status === 201 && isObj(json) && oneOf(VERSION_STATUSES)(json['status']))
    return { ok: true, status: json['status'] }
  if (res.status === 401) return { ok: false, failure: 'expired' }
  if (res.status === 404) return { ok: false, failure: 'unavailable' }
  const err = isObj(json) && isObj(json['error']) ? json['error'] : null
  const codes =
    err && Array.isArray(err['fieldErrors']) ? err['fieldErrors'].map((f) => (isObj(f) ? f['code'] : null)) : []
  if (res.status === 403 && codes.includes('FRESH_VERIFICATION_REQUIRED'))
    return { ok: false, failure: 'fresh_verification' }
  if (res.status === 409) return { ok: false, failure: 'not_applicable' }
  if (res.status === 400) return { ok: false, failure: 'invalid' }
  if (res.status === 429) return { ok: false, failure: 'rate_limited' }
  return { ok: false, failure: 'failed' }
}

type Posted = { status: number; json: unknown } | null
async function post(fetchImpl: Fetch, path: string, body: unknown, key?: string): Promise<Posted> {
  try {
    const res = await fetchImpl(`/api/v1${path}`, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(key ? { 'idempotency-key': key } : {}),
      },
      body: JSON.stringify(body),
    })
    return { status: res.status, json: (await res.json().catch(() => null)) as unknown }
  } catch {
    return null
  }
}
const fieldCodes = (json: unknown): unknown[] => {
  const err = isObj(json) && isObj(json['error']) ? json['error'] : null
  return err && Array.isArray(err['fieldErrors']) ? err['fieldErrors'].map((f) => (isObj(f) ? f['code'] : null)) : []
}
const versionPath = (ref: { reference: string; number: string; version: number }) =>
  `/customer/projects/${encodeURIComponent(ref.reference)}/estimates/${encodeURIComponent(ref.number)}/versions/${ref.version}`

export type SelectionResult = { ok: true; selection: Selection } | { ok: false; failure: WriteFailure }
async function select(
  fetchImpl: Fetch,
  ref: { reference: string; number: string; version: number },
  options: number[],
): Promise<SelectionResult> {
  const r = await post(fetchImpl, `${versionPath(ref)}/selection`, { options })
  if (!r) return { ok: false, failure: 'failed' }
  const selection = r.status === 200 && isObj(r.json) ? parseSelection(r.json['selection']) : null
  if (selection) return { ok: true, selection }
  return { ok: false, failure: failureOf(r.status, r.json) }
}

function failureOf(status: number, json: unknown): WriteFailure {
  if (status === 401) return 'expired'
  if (status === 404) return 'unavailable'
  if (status === 403 && fieldCodes(json).includes('FRESH_VERIFICATION_REQUIRED')) return 'fresh_verification'
  if (status === 409) return 'not_applicable'
  if (status === 400) return 'invalid'
  if (status === 429) return 'rate_limited'
  return 'failed'
}

/** Why an approval was not recorded, as the page says it. */
export type ApprovalFailure = WriteFailure | 'not_configured' | 'total_changed' | 'access_revoked'
export type ApprovalResult = { ok: true; approved: Approved } | { ok: false; failure: ApprovalFailure }
export type ApprovalBody = {
  contentDigest: string
  options: number[]
  totalCents: number
  depositCents: number | null
  termsDocumentId: string
  termsSha256: string
  acceptTerms: boolean
  fullName: string
}
async function approve(
  fetchImpl: Fetch,
  ref: { reference: string; number: string; version: number },
  body: ApprovalBody,
  key: string,
): Promise<ApprovalResult> {
  const r = await post(fetchImpl, `${versionPath(ref)}/approve`, body, key)
  if (!r) return { ok: false, failure: 'failed' }
  if ((r.status === 200 || r.status === 201) && isObj(r.json) && r.json['status'] === 'approved') {
    const approved = parseApproved(r.json['approved'])
    if (approved) return { ok: true, approved }
    return { ok: false, failure: 'failed' }
  }
  const codes = fieldCodes(r.json)
  if (r.status === 503 && isObj(r.json) && isObj(r.json['error']) && r.json['error']['code'] === 'NOT_CONFIGURED')
    return { ok: false, failure: 'not_configured' }
  if (r.status === 400 && codes.includes('TOTAL_MISMATCH')) return { ok: false, failure: 'total_changed' }
  if (r.status === 403 && codes.includes('ACCESS_REVOKED')) return { ok: false, failure: 'access_revoked' }
  return { ok: false, failure: failureOf(r.status, r.json) }
}

// The session's own fresh verification (TSK-0057, HH-ID-07).
export const CHANNELS = ['email', 'phone'] as const
export type Channel = (typeof CHANNELS)[number]
export type Verification = {
  fresh: boolean
  freshUntil: string
  channels: { channel: Channel; destination: string }[]
}
export function parseVerification(v: unknown): Verification | null {
  if (!isObj(v) || typeof v['fresh'] !== 'boolean' || !isDate(v['freshUntil']) || !Array.isArray(v['channels']))
    return null
  const channels = v['channels'].map((c) =>
    isObj(c) && oneOf(CHANNELS)(c['channel']) && isStr(c['destination'])
      ? { channel: c['channel'], destination: c['destination'] }
      : null,
  )
  if (channels.some((c) => c === null)) return null
  return { fresh: v['fresh'], freshUntil: v['freshUntil'], channels: channels as Verification['channels'] }
}
export type CodeResult = { ok: true; destination: string } | { ok: false; failure: WriteFailure | 'not_configured' }
async function sendCode(fetchImpl: Fetch, channel: Channel): Promise<CodeResult> {
  const r = await post(fetchImpl, '/customer/session/verification/codes', { channel })
  if (!r) return { ok: false, failure: 'failed' }
  if (r.status === 202 && isObj(r.json) && isObj(r.json['sent']) && isStr(r.json['sent']['destination']))
    return { ok: true, destination: r.json['sent']['destination'] }
  if (r.status === 503) return { ok: false, failure: 'not_configured' }
  return { ok: false, failure: failureOf(r.status, r.json) }
}
export type VerifyResult = { ok: true; verification: Verification } | { ok: false; failure: WriteFailure }
async function verify(fetchImpl: Fetch, channel: Channel, code: string): Promise<VerifyResult> {
  const r = await post(fetchImpl, '/customer/session/verification', { channel, code })
  if (!r) return { ok: false, failure: 'failed' }
  const verification = r.status === 200 ? parseVerification(r.json) : null
  if (verification) return { ok: true, verification }
  return { ok: false, failure: failureOf(r.status, r.json) }
}

async function read<T>(fetchImpl: Fetch, path: string, parse: (v: unknown) => T | null): Promise<Result<T>> {
  let res: Response
  try {
    res = await fetchImpl(`/api/v1${path}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { accept: 'application/json' },
    })
  } catch {
    return { ok: false, failure: 'failed' }
  }
  if (res.status === 401) return { ok: false, failure: 'expired' }
  if (res.status === 403 || res.status === 404) return { ok: false, failure: 'unavailable' }
  if (!res.ok) return { ok: false, failure: 'failed' }
  const data = parse(await res.json().catch(() => null))
  return data === null ? { ok: false, failure: 'failed' } : { ok: true, data }
}

export const portalApi = {
  projects: (f: Fetch) => read(f, '/customer/projects', parseList),
  overview: (f: Fetch, reference: string) =>
    read(f, `/customer/projects/${encodeURIComponent(reference)}/overview`, parseOverview),
  tab: (f: Fetch, reference: string, tab: WorkspaceTab) =>
    read(f, `/customer/projects/${encodeURIComponent(reference)}/${tab}`, (v) => parseTab(tab, v)),
  estimate: (f: Fetch, ref: { reference: string; number: string; version: number }) =>
    read(
      f,
      `/customer/projects/${encodeURIComponent(ref.reference)}/estimates/${encodeURIComponent(ref.number)}/versions/${ref.version}`,
      parseEstimate,
    ),
  respond,
  select,
  approve,
  verification: (f: Fetch) => read(f, '/customer/session/verification', parseVerification),
  sendCode,
  verify,
}
