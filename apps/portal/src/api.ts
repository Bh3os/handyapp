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
// approval (one key per approval attempt, kept for its retries) and the session's fresh verification. TSK-0100 adds the
// document download links (short-lived, issued on request), the customer's privacy requests (export, correction,
// deletion) and the data export of a completed export request.

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

export const TIMELINE_KINDS = [
  'received',
  'more_information',
  'site_visit',
  'not_a_fit',
  'closed_no_response',
  // TSK-0070 (HH-PORT-07): only once a worker recorded them.
  'on_the_way',
  'arrived',
] as const
export type TimelineKind = (typeof TIMELINE_KINDS)[number]

export type Status = {
  situation: Situation
  step: Step
  waitingOn: Waiting
  nextAction: NextAction
  since: string
}
/** TSK-0124 (HH-ID-14, OWN-DEC-160): the dashboard sections, Active, Completed (Project History) and Cancelled/Archived. */
export const SECTIONS = ['active', 'completed', 'archived'] as const
export type Section = (typeof SECTIONS)[number]
export type ProjectSummary = {
  reference: string
  services: string[]
  notSure: boolean
  submittedAt: string
  status: Status
  section: Section
  /** How many documents the project's Documents tab lists. */
  documents: number
  /**
   * TSK-0118 (HH-ID-13): the organization the project is shared through and the membership's privileges; null for the
   * account's own projects.
   */
  organization: SharedThrough | null
}
export type SharedThrough = { name: string; approve: boolean; pay: boolean }
export type ProjectList = {
  projects: ProjectSummary[]
  /** How the session came in: an account (its dashboard, with Add a project) or a single project's guest link. */
  access: 'account' | 'project_link'
  refreshedAt: string
  refreshSeconds: number
}
export type TimelineEntry = { kind: TimelineKind; at: string; text: string | null }
export type ProjectOverview = {
  reference: string
  services: string[]
  notSure: boolean
  submittedAt: string
  status: Status & { text: string | null }
  timeline: TimelineEntry[]
  /** TSK-0063: the next confirmed visit, or none. */
  appointment: Appointment | null
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
  // TSK-0118 (HH-ID-13): an organization member without the pay privilege.
  | { state: 'not_shared' }

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

type Head = Omit<ProjectSummary, 'section' | 'documents' | 'organization'>
function summary(v: unknown): Head | null {
  if (!isObj(v)) return null
  const s = status(v['status'])
  const { reference, services, notSure, submittedAt } = v
  if (!s || !isStr(reference) || !isStrings(services) || typeof notSure !== 'boolean' || !isDate(submittedAt))
    return null
  return { reference, services, notSure, submittedAt, status: s }
}

/** One project of the dashboard (TSK-0124): the summary with its section and documents count. */
function listed(v: unknown): ProjectSummary | null {
  const head = summary(v)
  if (!head || !isObj(v) || !oneOf(SECTIONS)(v['section']) || !isSeconds(v['documents'])) return null
  // TSK-0118: absent is the same as null (the account's own project).
  const o = v['organization'] ?? null
  if (o === null) return { ...head, section: v['section'], documents: v['documents'], organization: null }
  if (!isObj(o) || !isStr(o['name']) || typeof o['approve'] !== 'boolean' || typeof o['pay'] !== 'boolean') return null
  const organization = { name: o['name'], approve: o['approve'], pay: o['pay'] }
  return { ...head, section: v['section'], documents: v['documents'], organization }
}

export function parseList(v: unknown): ProjectList | null {
  if (!isObj(v) || !Array.isArray(v['projects']) || !isDate(v['refreshedAt']) || !isSeconds(v['refreshSeconds']))
    return null
  const access = v['access']
  if (access !== 'account' && access !== 'project_link') return null
  const projects = v['projects'].map(listed)
  if (projects.some((p) => p === null)) return null
  return {
    projects: projects as ProjectSummary[],
    access,
    refreshedAt: v['refreshedAt'],
    refreshSeconds: v['refreshSeconds'],
  }
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
  if (v['state'] === 'not_shared') return { state: 'not_shared' }
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
  const appointment = v['appointment'] === null ? null : parseAppointment(v['appointment'])
  if (!Array.isArray(v['timeline']) || appointment === undefined) return null
  const timeline = v['timeline'].map(entry)
  if (timeline.some((e) => e === null)) return null
  const payment = paymentOf(v['payment'])
  if (!payment) return null
  if (!isDate(v['refreshedAt']) || !isSeconds(v['refreshSeconds'])) return null
  return {
    ...head,
    status: { ...head.status, text: s },
    timeline: timeline as TimelineEntry[],
    appointment,
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
  /** TSK-0058 (HH-PORT-10): an approved version's approval receipt PDF, issued or being prepared; null otherwise. */
  receipt: ReceiptState | null
}
// TSK-0085 (HH-PORT-10, HH-FIN-04): an issued invoice of the Documents tab, never a draft.
export const INVOICE_STATUSES = ['current', 'superseded'] as const
export const INVOICE_STATES = ['issued', 'partially_paid', 'paid', 'voided'] as const
export type InvoiceListItem = {
  number: string
  kind: 'deposit' | 'final'
  status: (typeof INVOICE_STATUSES)[number]
  state: (typeof INVOICE_STATES)[number]
  issuedAt: string
  totalCents: number
  /** Still owed from confirmed payments and credits; a pending check does not reduce it. */
  balanceCents: number
  pendingCents: number
  document: 'preparing' | 'issued'
}
export const RECEIPT_STATES = ['preparing', 'issued'] as const
export type ReceiptState = (typeof RECEIPT_STATES)[number]
/** TSK-0058 (OWN-DEC-105): the step after approval, worded by the portal in the owner's words. */
export const NEXT_STEPS = ['deposit_due', 'choose_work_appointment'] as const
export type NextStep = (typeof NEXT_STEPS)[number]
/** TSK-0058: the approval receipt PDF; once issued, a short-lived link while storage is configured. */
export type Receipt = { state: ReceiptState; issuedAt: string | null; byteSize: number | null; url: string | null }

// The offered windows and the confirmed visits of the Appointments tab (TSK-0063; HH-LEAD-07, HH-SCH-11, T37).
export const VISIT_PURPOSES = ['estimate_visit', 'work_visit'] as const
export type VisitPurpose = (typeof VISIT_PURPOSES)[number]
export const APPOINTMENT_STATUSES = ['confirmed', 'en_route', 'arrived', 'completed', 'canceled'] as const
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]
export const OFFER_STATUSES = ['open', 'expired', 'other_times_requested'] as const
export type OfferStatus = (typeof OFFER_STATUSES)[number]
export type VisitWindow = {
  localDate: string
  start: string
  end: string
  timeZone: string
  startsAt: string
  endsAt: string
}
/** TSK-0066 (HH-PORT-04): the customer's own request of an appointment, and what they may ask for now. */
export const REQUEST_KINDS = ['reschedule', 'cancellation'] as const
export type RequestKind = (typeof REQUEST_KINDS)[number]
export const REQUEST_STATUSES = ['awaiting_confirmation', 'declined'] as const
export type AppointmentRequest = { kind: RequestKind; status: (typeof REQUEST_STATUSES)[number] }
export type Appointment = {
  number: number
  purpose: VisitPurpose
  status: AppointmentStatus
  window: VisitWindow
  address: { street: string; unit: string | null; city: string; state: string; zip: string }
  preparationInstructions: string | null
  request: AppointmentRequest | null
  actions: { requestReschedule: boolean; requestCancellation: boolean }
}
export type WindowOffer = {
  number: number
  purpose: VisitPurpose
  status: OfferStatus
  offeredAt: string
  expiresAt: string
  windows: (VisitWindow & { position: number })[]
}

function parseWindow(v: unknown): VisitWindow | null {
  if (!isObj(v)) return null
  const { localDate, start, end, timeZone, startsAt, endsAt } = v
  if (!isStr(localDate) || !isStr(start) || !isStr(end) || !isStr(timeZone) || !isDate(startsAt) || !isDate(endsAt))
    return null
  return { localDate, start, end, timeZone, startsAt, endsAt }
}

/** A confirmed visit as the server sends it; undefined when it is not one. */
export function parseAppointment(v: unknown): Appointment | undefined {
  if (!isObj(v) || !oneOf(VISIT_PURPOSES)(v['purpose']) || !oneOf(APPOINTMENT_STATUSES)(v['status'])) return undefined
  const window = parseWindow(v['window'])
  const a = v['address']
  if (!window || !isObj(a) || !isStr(a['street']) || !isStr(a['city']) || !isStr(a['state']) || !isStr(a['zip']))
    return undefined
  const unit = a['unit']
  const prep = v['preparationInstructions']
  if ((unit !== null && !isStr(unit)) || (prep !== null && !isStr(prep))) return undefined
  const req = v['request']
  const request =
    req === null
      ? null
      : isObj(req) && oneOf(REQUEST_KINDS)(req['kind']) && oneOf(REQUEST_STATUSES)(req['status'])
        ? { kind: req['kind'], status: req['status'] }
        : undefined
  const actions = v['actions']
  if (
    !isInt(v['number']) ||
    request === undefined ||
    !isObj(actions) ||
    typeof actions['requestReschedule'] !== 'boolean' ||
    typeof actions['requestCancellation'] !== 'boolean'
  )
    return undefined
  return {
    number: v['number'],
    request,
    actions: { requestReschedule: actions['requestReschedule'], requestCancellation: actions['requestCancellation'] },
    purpose: v['purpose'],
    status: v['status'],
    window,
    address: { street: a['street'], unit, city: a['city'], state: a['state'], zip: a['zip'] },
    preparationInstructions: prep,
  }
}

function parseOffer(v: unknown): WindowOffer | null {
  if (!isObj(v) || !isInt(v['number']) || !oneOf(VISIT_PURPOSES)(v['purpose']) || !oneOf(OFFER_STATUSES)(v['status']))
    return null
  if (!isDate(v['offeredAt']) || !isDate(v['expiresAt']) || !Array.isArray(v['windows'])) return null
  const windows = v['windows'].map((w) => {
    const parsed = parseWindow(w)
    return parsed && isObj(w) && isInt(w['position']) ? { position: w['position'], ...parsed } : null
  })
  if (windows.some((w) => w === null)) return null
  return {
    number: v['number'],
    purpose: v['purpose'],
    status: v['status'],
    offeredAt: v['offeredAt'],
    expiresAt: v['expiresAt'],
    windows: windows as WindowOffer['windows'],
  }
}

/** One message of the project conversation (TSK-0050): who, how, when and the text exactly as written. */
export type ConversationMessage = {
  from: 'you' | 'handyhub'
  /** TSK-0051: 'portal' is a message the customer wrote here. */
  channel: 'email' | 'sms' | 'portal'
  at: string
  text: string | null
  textState: 'shown' | 'empty' | 'not_available'
  attachments: number
}
/**
 * What each tab holds today: a closed state code, (Documents, TSK-0056) the estimates, (Photos) the counts of the
 * customer-visible photos, (Messages, TSK-0050) the project conversation, or (Appointments, TSK-0063) the offered
 * windows and the confirmed visits.
 */
export type TabData =
  | (TabHead & { tab: 'messages'; messages: ConversationMessage[] })
  | (TabHead & { tab: 'documents'; state: 'none' })
  | (TabHead & { tab: 'documents'; state: 'listed'; estimates: EstimateListItem[]; invoices: InvoiceListItem[] })
  | (TabHead & { tab: 'appointments' | 'payments'; state: 'none' })
  | (TabHead & { tab: 'appointments'; state: 'listed'; offers: WindowOffer[]; appointments: Appointment[] })
  | (TabHead & { tab: 'payments'; state: 'listed' } & PaymentsData)
  | (TabHead & {
      tab: 'photos'
      photos: PhotoCounts
      yours: YourPhoto[]
      shared: SharedPair[]
      linkSeconds: number
    })

/** TSK-0087 (HH-PORT-12): the Payments tab, every amount in integer cents from the shared records. */
export const PAYMENT_METHODS = [
  'square_payment_link',
  'square_tap_to_pay',
  'cash',
  'check',
  'zelle',
  'cash_app',
  'chime',
] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]
export type PaymentsData = {
  approvedTotalCents: number | null
  deposit: {
    state: 'none' | 'deposit_due' | 'deposit_received'
    amountCents: number | null
    verifiedCents: number | null
    pendingCents: number | null
    payByCardUrl: string | null
  }
  invoices: {
    number: string
    kind: 'final' | 'deposit'
    state: 'issued' | 'partially_paid' | 'paid'
    totalCents: number
    creditsCents: number
    confirmedCents: number
    pendingCents: number
    balanceCents: number
    payByCardUrl: string | null
  }[]
  payments: {
    receivedOn: string
    method: PaymentMethod
    amountCents: number
    /** TSK-0089: returned (a check returned, a payment failed), voided (recorded wrongly) or disputed. */
    state: 'confirmed' | 'pending' | 'returned' | 'voided' | 'disputed'
    /**
     * TSK-0087 part 2: a confirmed payment's receipt; partial when it left a balance. TSK-0089: voided once the
     * payment is returned or voided.
     */
    receipt: {
      number: string
      paymentNumber: string
      partial: boolean
      balanceAfterCents: number
      voided: boolean
    } | null
  }[]
  confirmedCents: number
  pendingCents: number
  balanceCents: number
  instructions: {
    methods: PaymentMethod[]
    placeholder: boolean
    zelle: string | null
    cashApp: string | null
    chime: string | null
    checkPayee: string | null
  } | null
}

/** TSK-0076 (HH-PORT-11): one of the customer's own uploads, with its short-lived link once ready. */
export type YourPhoto = {
  id: string
  state: 'quarantined' | 'ready' | 'rejected'
  uploadedAt: string
  url: string | null
}
/** A photo staff shared with the customer, with its short-lived link. */
export type SharedPhoto = { id: string; sharedAt: string; url: string | null }
/** A shared before and after photo of one service, paired where staff paired them. */
export type SharedPair = { service: string; before: SharedPhoto | null; after: SharedPhoto | null }

const httpsOrNull = (v: unknown): v is string | null => v === null || (isStr(v) && /^https:\/\//.test(v))
function sharedPhoto(v: unknown): SharedPhoto | null | undefined {
  if (v === null) return null
  return isObj(v) && isStr(v['id']) && isDate(v['sharedAt']) && httpsOrNull(v['url'])
    ? { id: v['id'], sharedAt: v['sharedAt'], url: v['url'] }
    : undefined
}
function parsePhotoLists(v: Record<string, unknown>) {
  if (!Array.isArray(v['yours']) || !Array.isArray(v['shared']) || !isSeconds(v['linkSeconds'])) return null
  const yours = v['yours'].map((y) =>
    isObj(y) &&
    isStr(y['id']) &&
    oneOf(['quarantined', 'ready', 'rejected'] as const)(y['state']) &&
    isDate(y['uploadedAt']) &&
    httpsOrNull(y['url'])
      ? { id: y['id'], state: y['state'], uploadedAt: y['uploadedAt'], url: y['url'] }
      : null,
  )
  const shared = v['shared'].map((g) => {
    if (!isObj(g) || !isStr(g['service'])) return null
    const before = sharedPhoto(g['before'])
    const after = sharedPhoto(g['after'])
    return before === undefined || after === undefined || (before === null && after === null)
      ? null
      : { service: g['service'], before, after }
  })
  if (yours.some((y) => y === null) || shared.some((g) => g === null)) return null
  return { yours: yours as YourPhoto[], shared: shared as SharedPair[], linkSeconds: v['linkSeconds'] }
}
const TAB_STATE: Record<Exclude<WorkspaceTab, 'photos' | 'messages'>, string> = {
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
    const lists = parsePhotoLists(v)
    if (!lists) return null
    return {
      ...head,
      tab,
      photos: { received: p['received'], processing: p['processing'], failed: p['failed'] },
      ...lists,
    }
  }
  if (tab === 'messages') {
    const list = v['messages']
    if (!Array.isArray(list) || 'state' in v) return null
    const messages = list.map(conversationMessage)
    if (messages.some((m) => m === null)) return null
    return { ...head, tab, messages: messages as ConversationMessage[] }
  }
  if (tab === 'documents' && v['state'] === 'listed') {
    const list = Array.isArray(v['estimates']) ? v['estimates'].map(listItem) : null
    // TSK-0085: the issued invoices (absent from an older server: none).
    const invoices =
      v['invoices'] === undefined ? [] : Array.isArray(v['invoices']) ? v['invoices'].map(invoiceItem) : null
    if (!list || !invoices || list.some((e) => e === null) || invoices.some((i) => i === null)) return null
    if (list.length + invoices.length === 0) return null
    return {
      ...head,
      tab,
      state: 'listed',
      estimates: list as EstimateListItem[],
      invoices: invoices as InvoiceListItem[],
    }
  }
  if (tab === 'appointments' && v['state'] === 'listed') {
    const offers = Array.isArray(v['offers']) ? v['offers'].map(parseOffer) : null
    const appointments = Array.isArray(v['appointments']) ? v['appointments'].map(parseAppointment) : null
    if (!offers || !appointments || offers.some((o) => o === null) || appointments.some((a) => a === undefined))
      return null
    if (offers.length + appointments.length === 0) return null
    return {
      ...head,
      tab,
      state: 'listed',
      offers: offers as WindowOffer[],
      appointments: appointments as Appointment[],
    }
  }
  if (tab === 'payments' && v['state'] === 'listed') {
    const p = parsePayments(v)
    return p ? { ...head, tab, state: 'listed', ...p } : null
  }
  // Any other state (for example "paid" or "read") is not what the view declares: a failure, never shown as data.
  if (v['state'] !== TAB_STATE[tab]) return null
  return { ...head, tab, state: 'none' }
}

const centsOrNull = (v: unknown): v is number | null => v === null || (isInt(v) && v >= 0)
const strOrNull = (v: unknown): v is string | null => v === null || isStr(v)
/** The Payments answer; null when anything is not what the view declares (a Pay by Card link must be https). */
function parsePayments(v: Record<string, unknown>): PaymentsData | null {
  const d = v['deposit']
  if (
    !centsOrNull(v['approvedTotalCents']) ||
    !isObj(d) ||
    !oneOf(['none', 'deposit_due', 'deposit_received'] as const)(d['state']) ||
    !centsOrNull(d['amountCents']) ||
    !centsOrNull(d['verifiedCents']) ||
    !centsOrNull(d['pendingCents']) ||
    !httpsOrNull(d['payByCardUrl']) ||
    !Array.isArray(v['invoices']) ||
    !Array.isArray(v['payments'])
  )
    return null
  const invoices = v['invoices'].map((i) =>
    isObj(i) &&
    isStr(i['number']) &&
    oneOf(['final', 'deposit'] as const)(i['kind']) &&
    oneOf(['issued', 'partially_paid', 'paid'] as const)(i['state']) &&
    [i['totalCents'], i['creditsCents'], i['confirmedCents'], i['pendingCents'], i['balanceCents']].every(
      (c) => isInt(c) && c >= 0,
    ) &&
    httpsOrNull(i['payByCardUrl'])
      ? {
          number: i['number'],
          kind: i['kind'],
          state: i['state'],
          totalCents: i['totalCents'] as number,
          creditsCents: i['creditsCents'] as number,
          confirmedCents: i['confirmedCents'] as number,
          pendingCents: i['pendingCents'] as number,
          balanceCents: i['balanceCents'] as number,
          payByCardUrl: i['payByCardUrl'],
        }
      : null,
  )
  const payments = v['payments'].map((p) => {
    if (
      !isObj(p) ||
      !isStr(p['receivedOn']) ||
      !oneOf(PAYMENT_METHODS)(p['method']) ||
      !isInt(p['amountCents']) ||
      p['amountCents'] <= 0 ||
      !oneOf(['confirmed', 'pending', 'returned', 'voided', 'disputed'] as const)(p['state'])
    )
      return null
    const r = p['receipt']
    // An older server sends no receipt: none yet.
    const receipt =
      r === undefined || r === null
        ? null
        : isObj(r) &&
            isStr(r['number']) &&
            isStr(r['paymentNumber']) &&
            typeof r['partial'] === 'boolean' &&
            isInt(r['balanceAfterCents']) &&
            r['balanceAfterCents'] >= 0 &&
            (r['voided'] === undefined || typeof r['voided'] === 'boolean')
          ? {
              number: r['number'],
              paymentNumber: r['paymentNumber'],
              partial: r['partial'],
              balanceAfterCents: r['balanceAfterCents'],
              // An older server sends no flag: not voided.
              voided: r['voided'] === true,
            }
          : undefined
    if (receipt === undefined) return null
    return {
      receivedOn: p['receivedOn'],
      method: p['method'],
      amountCents: p['amountCents'],
      state: p['state'],
      receipt,
    }
  })
  if (invoices.some((i) => i === null) || payments.some((p) => p === null)) return null
  const ins = v['instructions']
  let instructions: PaymentsData['instructions'] = null
  if (ins !== null) {
    if (
      !isObj(ins) ||
      !Array.isArray(ins['methods']) ||
      !ins['methods'].every(oneOf(PAYMENT_METHODS)) ||
      typeof ins['placeholder'] !== 'boolean' ||
      ![ins['zelle'], ins['cashApp'], ins['chime'], ins['checkPayee']].every(strOrNull)
    )
      return null
    instructions = {
      methods: ins['methods'] as PaymentMethod[],
      placeholder: ins['placeholder'],
      zelle: ins['zelle'] as string | null,
      cashApp: ins['cashApp'] as string | null,
      chime: ins['chime'] as string | null,
      checkPayee: ins['checkPayee'] as string | null,
    }
  }
  if (![v['confirmedCents'], v['pendingCents'], v['balanceCents']].every((c) => isInt(c) && c >= 0)) return null
  return {
    approvedTotalCents: v['approvedTotalCents'],
    deposit: {
      state: d['state'],
      amountCents: d['amountCents'],
      verifiedCents: d['verifiedCents'],
      pendingCents: d['pendingCents'],
      payByCardUrl: d['payByCardUrl'],
    },
    invoices: invoices as PaymentsData['invoices'],
    payments: payments as PaymentsData['payments'],
    confirmedCents: v['confirmedCents'] as number,
    pendingCents: v['pendingCents'] as number,
    balanceCents: v['balanceCents'] as number,
    instructions,
  }
}

const FROM = ['you', 'handyhub'] as const
const MESSAGE_CHANNELS = ['email', 'sms', 'portal'] as const
const TEXT_STATES = ['shown', 'empty', 'not_available'] as const

function conversationMessage(v: unknown): ConversationMessage | null {
  if (!isObj(v)) return null
  const { from, channel, at, text, textState, attachments } = v
  if (!oneOf(FROM)(from) || !oneOf(MESSAGE_CHANNELS)(channel) || !isDate(at) || !oneOf(TEXT_STATES)(textState))
    return null
  if (text !== null && !isStr(text)) return null
  if ((textState === 'shown') !== (text !== null) || !isSeconds(attachments)) return null
  return { from, channel, at, text, textState, attachments }
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
  // The estimate view carries its receipt under approval; a list item names it (null when not approved).
  const receipt = v['receipt'] === undefined ? null : v['receipt']
  if (receipt !== null && !oneOf(RECEIPT_STATES)(receipt)) return null
  return { number, version, status, publishedAt, validUntil, totalCents, receipt }
}

function invoiceItem(v: unknown): InvoiceListItem | null {
  if (!isObj(v)) return null
  const { number, kind, status, state, issuedAt, totalCents, balanceCents, pendingCents, document } = v
  if (!isStr(number) || !oneOf(['deposit', 'final'] as const)(kind) || !oneOf(INVOICE_STATUSES)(status)) return null
  if (!oneOf(INVOICE_STATES)(state) || !isDate(issuedAt) || !oneOf(RECEIPT_STATES)(document)) return null
  if (!isCents(totalCents) || !isCents(balanceCents) || !isCents(pendingCents)) return null
  return { number, kind, status, state, issuedAt, totalCents, balanceCents, pendingCents, document }
}

function parseReceipt(v: unknown): Receipt | null {
  if (!isObj(v) || !oneOf(RECEIPT_STATES)(v['state'])) return null
  const { issuedAt, byteSize, url } = v
  if (!isNullableDate(issuedAt) || !isNullableStr(url) || !(byteSize === null || (isInt(byteSize) && byteSize > 0)))
    return null
  // A receipt being prepared has no date, size or link; an issued one has its date and size.
  if (v['state'] === 'preparing' ? issuedAt !== null || byteSize !== null || url !== null : !issuedAt || !byteSize)
    return null
  return { state: v['state'], issuedAt, byteSize, url }
}

export const TERMS_STATES = ['not_configured', 'not_in_effect', 'in_effect'] as const
export type TermsState = (typeof TERMS_STATES)[number]
export const APPROVAL_REASONS = [
  'terms_not_configured',
  'terms_not_in_effect',
  'superseded',
  'expired',
  'not_published',
  // TSK-0125 (OWN-DEC-165): approval waits for the requested reduction's verification, or an updated estimate follows.
  'reduction_pending_verification',
  'reduction_not_verified',
  // TSK-0118 (HH-ID-13): an organization member whose membership does not include approving.
  'no_approval_privilege',
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
  /** TSK-0123: the zone the expiry is shown in (the property's; business: true while that is unknown). */
  validUntilZone: { zone: string; business: boolean } | null
  lines: EstimateLine[]
  assumptions: string[]
  exclusions: string[]
  customerResponsibilities: string[]
  dependencies: string[]
  scheduleAssumptions: string[]
  subtotalCents: number
  /**
   * The totals row before the total, worded by the server (the same words as the customer PDF); TSK-0125: pending
   * verification until it is verified.
   */
  reduction: { label: string; amountCents: number; pendingVerification: boolean } | null
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
    /** TSK-0058: once approved, the step after approval, or null once the project has moved past it. */
    nextStep: NextStep | null
    /** TSK-0058: once approved, the approval receipt PDF. */
    receipt: Receipt | null
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
  if (
    reduction !== null &&
    !(
      isObj(reduction) &&
      isStr(reduction['label']) &&
      isCents(reduction['amountCents']) &&
      typeof reduction['pendingVerification'] === 'boolean'
    )
  )
    return null
  const deposit = v['deposit']
  if (!isObj(deposit) || !oneOf(['required', 'not_required'] as const)(deposit['state'])) return null
  if (deposit['state'] === 'required' ? !isCents(deposit['amountCents']) : deposit['amountCents'] !== null) return null
  const document = v['document']
  if (document !== null && !(isObj(document) && isStr(document['url']) && isCents(document['byteSize']))) return null
  const zone = v['validUntilZone']
  if (zone !== null && !(isObj(zone) && isStr(zone['zone']) && typeof zone['business'] === 'boolean')) return null
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
  const nextStep = approval['nextStep']
  if (nextStep !== null && !oneOf(NEXT_STEPS)(nextStep)) return null
  const receipt = approval['receipt'] === null ? null : parseReceipt(approval['receipt'])
  if (approval['receipt'] !== null && !receipt) return null
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
    validUntilZone: zone as EstimateDetail['validUntilZone'],
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
      nextStep,
      receipt,
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

/**
 * The customer's answer to offered windows (TSK-0063): the refreshed Appointments tab, or why nothing changed:
 * `unavailable_window` (that window can no longer be kept), `closed` (the offer was answered, withdrawn or expired:
 * the refreshed tab says which), `deposit_due` (TSK-0064: the work appointment cannot be confirmed until the deposit
 * is received), `not_ready` (TSK-0064: another confirmation precondition is unmet; the server names no hold or staff
 * detail), or a general failure. Nothing is booked in any of these.
 */
export type OfferAnswerFailure = WriteFailure | 'unavailable_window' | 'closed' | 'deposit_due' | 'not_ready'
export type OfferAnswerResult = { ok: true; data: TabData } | { ok: false; failure: OfferAnswerFailure }
async function answerOffer(
  fetchImpl: Fetch,
  ref: { reference: string; number: number },
  answer: { position: number } | { note: string },
  key: string,
): Promise<OfferAnswerResult> {
  const path =
    `/customer/projects/${encodeURIComponent(ref.reference)}/window-offers/${ref.number}/` +
    ('position' in answer ? 'select' : 'other-times')
  const body = 'position' in answer ? answer : answer.note.trim() ? { note: answer.note.trim() } : {}
  const r = await post(fetchImpl, path, body, key)
  if (!r) return { ok: false, failure: 'failed' }
  if (r.status === 200) {
    const data = parseTab('appointments', r.json)
    return data ? { ok: true, data } : { ok: false, failure: 'failed' }
  }
  const codes = fieldCodes(r.json)
  if (r.status === 409 && codes.includes('SCHEDULING_NOT_READY'))
    return {
      ok: false,
      failure:
        codes.includes('DEPOSIT_REQUIRED') || codes.includes('DEPOSIT_REQUIREMENT_MISSING')
          ? 'deposit_due'
          : 'not_ready',
    }
  if (r.status === 409 && codes.includes('WINDOW_UNAVAILABLE')) return { ok: false, failure: 'unavailable_window' }
  if (r.status === 409) return { ok: false, failure: 'closed' }
  return { ok: false, failure: failureOf(r.status, r.json) }
}

/**
 * The customer's Request to Reschedule or Request Cancellation (TSK-0066, HH-PORT-04): the refreshed Appointments tab,
 * or why nothing was sent: `not_changeable` (the appointment is no longer confirmed: the refreshed tab says what it is),
 * `other_open` (another request is already waiting) or a general failure. The booking never changes here.
 */
export type ChangeRequestFailure = WriteFailure | 'not_changeable' | 'other_open'
export type ChangeRequestResult = { ok: true; data: TabData } | { ok: false; failure: ChangeRequestFailure }
async function requestChange(
  fetchImpl: Fetch,
  ref: { reference: string; number: number },
  kind: RequestKind,
  body: { reason?: string; preferredTimes?: string },
  key: string,
): Promise<ChangeRequestResult> {
  const path = `/customer/projects/${encodeURIComponent(ref.reference)}/appointments/${ref.number}/${kind}-request`
  const payload: Record<string, string> = {}
  if (body.reason?.trim()) payload['reason'] = body.reason.trim()
  if (kind === 'reschedule' && body.preferredTimes?.trim()) payload['preferredTimes'] = body.preferredTimes.trim()
  const r = await post(fetchImpl, path, payload, key)
  if (!r) return { ok: false, failure: 'failed' }
  if (r.status === 200) {
    const data = parseTab('appointments', r.json)
    return data ? { ok: true, data } : { ok: false, failure: 'failed' }
  }
  const codes = fieldCodes(r.json)
  if (r.status === 409 && codes.includes('REQUEST_ALREADY_OPEN')) return { ok: false, failure: 'other_open' }
  if (r.status === 409) return { ok: false, failure: 'not_changeable' }
  return { ok: false, failure: failureOf(r.status, r.json) }
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

// Change orders (TSK-0082; HH-CHG-02, HH-PORT-05, OWN-DEC-169): the customer view change_orders.customer and the
// customer's decision on one exact version (POST, JSON body, one idempotency key per attempt, kept for its retries).
export const CHANGE_ORDER_STATUSES = ['issued', 'approved', 'rejected', 'expired', 'withdrawn', 'superseded'] as const
export type ChangeOrderStatus = (typeof CHANGE_ORDER_STATUSES)[number]
export type ChangeOrderLine = {
  position: number
  kind: 'charge' | 'credit'
  description: string
  quantity: string | null
  unit: string | null
  unitPriceCents: number | null
  amountCents: number | null
}
export type ChangeOrder = {
  reference: string
  number: number
  version: number
  status: ChangeOrderStatus
  reason: string
  scope: string
  scheduleImpact: string | null
  lines: ChangeOrderLine[]
  approvedTotalCents: number
  chargesCents: number
  creditsCents: number
  revisedTotalCents: number
  sentAt: string
  validUntil: string
  decidedAt: string | null
  decision: { kind: 'approved' | 'rejected'; method: 'portal' | 'in_person_code'; at: string } | null
  approval: {
    canDecide: boolean
    /** TSK-0118: NO_APPROVAL_PRIVILEGE for an organization member whose membership does not include approving. */
    blockedBy: 'APPROVED_SCOPE_CHANGED' | 'NO_APPROVAL_PRIVILEGE' | null
    contentDigest: string
    termsDocumentId: string
    termsSha256: string
  } | null
}
export type ChangeOrders = {
  reference: string
  original: { estimateNumber: string; version: number; totalCents: number } | null
  currentTotalCents: number | null
  changeOrders: ChangeOrder[]
  refreshedAt: string
  refreshSeconds: number
}
const isIntOrNull = (v: unknown): v is number | null => v === null || isInt(v)
const isStrOrNull = (v: unknown): v is string | null => v === null || isStr(v)
function parseChangeOrderLine(v: unknown): ChangeOrderLine | null {
  if (
    !isObj(v) ||
    !isInt(v['position']) ||
    !oneOf(['charge', 'credit'] as const)(v['kind']) ||
    !isStr(v['description']) ||
    !isStrOrNull(v['quantity']) ||
    !isStrOrNull(v['unit']) ||
    !isIntOrNull(v['unitPriceCents']) ||
    !isIntOrNull(v['amountCents'])
  )
    return null
  return {
    position: v['position'],
    kind: v['kind'],
    description: v['description'],
    quantity: v['quantity'],
    unit: v['unit'],
    unitPriceCents: v['unitPriceCents'],
    amountCents: v['amountCents'],
  }
}
function parseChangeOrder(v: unknown): ChangeOrder | null {
  if (
    !isObj(v) ||
    !isStr(v['reference']) ||
    !isInt(v['number']) ||
    !isInt(v['version']) ||
    !oneOf(CHANGE_ORDER_STATUSES)(v['status']) ||
    !isStr(v['reason']) ||
    !isStr(v['scope']) ||
    !isStrOrNull(v['scheduleImpact']) ||
    !Array.isArray(v['lines']) ||
    !isInt(v['approvedTotalCents']) ||
    !isInt(v['chargesCents']) ||
    !isInt(v['creditsCents']) ||
    !isInt(v['revisedTotalCents']) ||
    !isDate(v['sentAt']) ||
    !isDate(v['validUntil']) ||
    !(v['decidedAt'] === null || isDate(v['decidedAt']))
  )
    return null
  const lines = v['lines'].map(parseChangeOrderLine)
  if (lines.some((l) => l === null)) return null
  const d = v['decision']
  const decision =
    d === null
      ? null
      : isObj(d) &&
          oneOf(['approved', 'rejected'] as const)(d['kind']) &&
          oneOf(['portal', 'in_person_code'] as const)(d['method']) &&
          isDate(d['at'])
        ? { kind: d['kind'], method: d['method'], at: d['at'] }
        : undefined
  const a = v['approval']
  const approval =
    a === null
      ? null
      : isObj(a) &&
          typeof a['canDecide'] === 'boolean' &&
          (a['blockedBy'] === null ||
            a['blockedBy'] === 'APPROVED_SCOPE_CHANGED' ||
            a['blockedBy'] === 'NO_APPROVAL_PRIVILEGE') &&
          isStr(a['contentDigest']) &&
          isStr(a['termsDocumentId']) &&
          isStr(a['termsSha256'])
        ? {
            canDecide: a['canDecide'],
            blockedBy: a['blockedBy'] as 'APPROVED_SCOPE_CHANGED' | 'NO_APPROVAL_PRIVILEGE' | null,
            contentDigest: a['contentDigest'],
            termsDocumentId: a['termsDocumentId'],
            termsSha256: a['termsSha256'],
          }
        : undefined
  if (decision === undefined || approval === undefined) return null
  return {
    reference: v['reference'],
    number: v['number'],
    version: v['version'],
    status: v['status'],
    reason: v['reason'],
    scope: v['scope'],
    scheduleImpact: v['scheduleImpact'],
    lines: lines as ChangeOrderLine[],
    approvedTotalCents: v['approvedTotalCents'],
    chargesCents: v['chargesCents'],
    creditsCents: v['creditsCents'],
    revisedTotalCents: v['revisedTotalCents'],
    sentAt: v['sentAt'],
    validUntil: v['validUntil'],
    decidedAt: v['decidedAt'],
    decision,
    approval,
  }
}
export function parseChangeOrders(v: unknown): ChangeOrders | null {
  if (
    !isObj(v) ||
    !isStr(v['reference']) ||
    !isIntOrNull(v['currentTotalCents']) ||
    !Array.isArray(v['changeOrders']) ||
    !isDate(v['refreshedAt']) ||
    !isSeconds(v['refreshSeconds'])
  )
    return null
  const o = v['original']
  const original =
    o === null
      ? null
      : isObj(o) && isStr(o['estimateNumber']) && isInt(o['version']) && isInt(o['totalCents'])
        ? { estimateNumber: o['estimateNumber'], version: o['version'], totalCents: o['totalCents'] }
        : undefined
  const changeOrders = v['changeOrders'].map(parseChangeOrder)
  if (original === undefined || changeOrders.some((c) => c === null)) return null
  return {
    reference: v['reference'],
    original,
    currentTotalCents: v['currentTotalCents'],
    changeOrders: changeOrders as ChangeOrder[],
    refreshedAt: v['refreshedAt'],
    refreshSeconds: v['refreshSeconds'],
  }
}

/** Why a decision was not recorded: the version moved on (expired, withdrawn, replaced or decided), or the others. */
export type DecisionFailure = WriteFailure | 'total_changed' | 'access_revoked' | 'scope_changed'
export type DecisionResult = { ok: true; status: 'approved' | 'rejected' } | { ok: false; failure: DecisionFailure }
async function decideChangeOrder(
  fetchImpl: Fetch,
  ref: { reference: string; number: number; version: number },
  decision: 'approve' | 'reject',
  body: Record<string, unknown>,
  key: string,
): Promise<DecisionResult> {
  const path =
    `/customer/projects/${encodeURIComponent(ref.reference)}/change-orders/${ref.number}/versions/${ref.version}/` +
    decision
  const r = await post(fetchImpl, path, body, key)
  if (!r) return { ok: false, failure: 'failed' }
  if (
    (r.status === 200 || r.status === 201) &&
    isObj(r.json) &&
    (r.json['status'] === 'approved' || r.json['status'] === 'rejected')
  )
    return { ok: true, status: r.json['status'] }
  const codes = fieldCodes(r.json)
  if (r.status === 400 && codes.includes('TOTAL_MISMATCH')) return { ok: false, failure: 'total_changed' }
  if (r.status === 403 && codes.includes('ACCESS_REVOKED')) return { ok: false, failure: 'access_revoked' }
  if (r.status === 409 && codes.includes('APPROVED_SCOPE_CHANGED')) return { ok: false, failure: 'scope_changed' }
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

// Questions from HandyHub (TSK-0051; HH-LEAD-03, OWN-DEC-98): the customer view project.questions.
export const REPLY_WINDOWS = ['open', 'reopen', 'period_ended', 'closed'] as const
export type ReplyWindow = (typeof REPLY_WINDOWS)[number]
export type Question = {
  id: string
  kind: 'general' | 'measurement'
  /** TSK-0148: the reply may say "I'm not sure". */
  notSureAllowed: boolean
  text: string
  askedAt: string
  state: 'waiting' | 'answered'
  canReply: boolean
  reply: { text: string | null; notSure: boolean; at: string; photos: PhotoCounts } | null
}
export type QuestionList = {
  reference: string
  refreshedAt: string
  refreshSeconds: number
  questions: Question[]
  replyWindow: ReplyWindow
  reopenUntil: string | null
  maxLength: number
}

function counts(v: unknown): PhotoCounts | null {
  if (!isObj(v) || !isSeconds(v['received']) || !isSeconds(v['processing']) || !isSeconds(v['failed'])) return null
  return { received: v['received'], processing: v['processing'], failed: v['failed'] }
}

function question(v: unknown): Question | null {
  if (!isObj(v)) return null
  const { id, kind, notSureAllowed, text, askedAt, state, canReply, reply } = v
  if (!isStr(id) || !oneOf(['general', 'measurement'] as const)(kind) || !isStr(text) || !isDate(askedAt)) return null
  if (typeof notSureAllowed !== 'boolean') return null
  if (!oneOf(['waiting', 'answered'] as const)(state) || typeof canReply !== 'boolean') return null
  if (reply === null) return { id, kind, notSureAllowed, text, askedAt, state, canReply, reply: null }
  if (!isObj(reply) || (reply['text'] !== null && !isStr(reply['text'])) || typeof reply['notSure'] !== 'boolean')
    return null
  const photos = counts(reply['photos'])
  if (!isDate(reply['at']) || !photos) return null
  return {
    id,
    kind,
    notSureAllowed,
    text,
    askedAt,
    state,
    canReply,
    reply: { text: reply['text'] as string | null, notSure: reply['notSure'], at: reply['at'], photos },
  }
}

export function parseQuestions(v: unknown): QuestionList | null {
  if (!isObj(v) || !isStr(v['reference']) || !isDate(v['refreshedAt']) || !isSeconds(v['refreshSeconds'])) return null
  if (!Array.isArray(v['questions']) || !oneOf(REPLY_WINDOWS)(v['replyWindow'])) return null
  if (v['reopenUntil'] !== null && !isDate(v['reopenUntil'])) return null
  if (typeof v['maxLength'] !== 'number' || v['maxLength'] < 1) return null
  const questions = v['questions'].map(question)
  if (questions.some((q) => q === null)) return null
  return {
    reference: v['reference'],
    refreshedAt: v['refreshedAt'],
    refreshSeconds: v['refreshSeconds'],
    questions: questions as Question[],
    replyWindow: v['replyWindow'],
    reopenUntil: v['reopenUntil'] as string | null,
    maxLength: v['maxLength'],
  }
}

// Updates about the project's cases (TSK-0093; HH-QA-06, HH-INC-02): the customer view project.cases. Only updates staff
// released after review; nothing else about a case reaches the customer.
export const CASE_UPDATE_KINDS = ['acknowledgment', 'progress', 'next_step', 'safety_pause'] as const
export type CaseUpdate = { kind: (typeof CASE_UPDATE_KINDS)[number]; text: string; releasedAt: string }
export type CaseUpdates = { reference: string; cases: { caseNumber: number; updates: CaseUpdate[] }[] }

export function parseCaseUpdates(v: unknown): CaseUpdates | null {
  if (!isObj(v) || !isStr(v['reference']) || !Array.isArray(v['cases'])) return null
  const cases: CaseUpdates['cases'] = []
  for (const c of v['cases']) {
    if (!isObj(c) || typeof c['caseNumber'] !== 'number' || !Array.isArray(c['updates'])) return null
    const updates: CaseUpdate[] = []
    for (const u of c['updates']) {
      if (!isObj(u) || !oneOf(CASE_UPDATE_KINDS)(u['kind']) || !isStr(u['text']) || !isDate(u['releasedAt']))
        return null
      updates.push({ kind: u['kind'], text: u['text'], releasedAt: u['releasedAt'] })
    }
    cases.push({ caseNumber: c['caseNumber'], updates })
  }
  return { reference: v['reference'], cases }
}

/** The outcome of a write the page shows: done (with the answer), refused (with the server's codes), or failed. */
export type PortalWriteResult<T> =
  | { ok: true; data: T }
  | { ok: false; failure: 'refused'; status: number; codes: string[] }
  | { ok: false; failure: Failure }

async function send<T>(fetchImpl: Fetch, path: string, init: RequestInit): Promise<PortalWriteResult<T>> {
  let res: Response
  try {
    res = await fetchImpl(`/api/v1${path}`, { credentials: 'same-origin', cache: 'no-store', ...init })
  } catch {
    return { ok: false, failure: 'failed' }
  }
  if (res.status === 401) return { ok: false, failure: 'expired' }
  if (res.status === 403 || res.status === 404) return { ok: false, failure: 'unavailable' }
  const body = (await res.json().catch(() => null)) as unknown
  if (res.ok) return { ok: true, data: body as T }
  if (res.status >= 400 && res.status < 500 && isObj(body) && isObj(body['error'])) {
    const e = body['error']
    const fe = Array.isArray(e['fieldErrors']) ? e['fieldErrors'] : []
    const codes = fe.flatMap((f) => (isObj(f) && isStr(f['code']) ? [f['code']] : []))
    return { ok: false, failure: 'refused', status: res.status, codes: codes.length ? codes : [String(e['code'])] }
  }
  return { ok: false, failure: 'failed' }
}

const json = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
  body: JSON.stringify(body),
})

export type UploadStart = {
  capability: string
  expiresAt: string
  limits: { maxFileBytes: number; maxPhotos: number; types: string[] }
}
export type UploadedPhoto = { id: string; state: 'quarantined' | 'ready' | 'rejected'; rejectionReason: string | null }

/** A random idempotency key: one per draft, kept with it, so a retried submission is answered once. */
export function newKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export const portalWrites = {
  /** A new upload capability for one reply's photos. */
  startUpload: (f: Fetch, reference: string, questionId: string) =>
    send<UploadStart>(
      f,
      `/customer/projects/${encodeURIComponent(reference)}/questions/${encodeURIComponent(questionId)}/uploads`,
      json({}),
    ),
  /** One photo, as raw bytes, under the reply's capability. */
  uploadPhoto: (f: Fetch, capability: string, file: Blob, type: string) =>
    send<UploadedPhoto>(f, '/public/request-drafts/photos', {
      method: 'POST',
      headers: { 'content-type': type, 'upload-capability': capability, accept: 'application/json' },
      body: file,
    }),
  /** The capability's photos as they are now (processing finishes after the upload). */
  listPhotos: (f: Fetch, capability: string) =>
    send<{ photos: UploadedPhoto[] }>(f, '/public/request-drafts/photos', {
      method: 'GET',
      headers: { 'upload-capability': capability, accept: 'application/json' },
    }),
  removePhoto: (f: Fetch, capability: string, photoId: string) =>
    send<{ removed: boolean }>(f, `/public/request-drafts/photos/${encodeURIComponent(photoId)}`, {
      method: 'DELETE',
      headers: { 'upload-capability': capability, accept: 'application/json' },
    }),
  reply: (
    f: Fetch,
    reference: string,
    questionId: string,
    body: { text?: string; notSure?: boolean; photoIds?: string[] },
    key: string,
    capability: string | null,
  ) =>
    send<{ questionId: string; state: 'answered'; at: string; photos: number; reopened: boolean }>(
      f,
      `/customer/projects/${encodeURIComponent(reference)}/questions/${encodeURIComponent(questionId)}/replies`,
      json(body, { 'idempotency-key': key, ...(capability ? { 'upload-capability': capability } : {}) }),
    ),
  message: (f: Fetch, reference: string, text: string, key: string) =>
    send<{ from: 'you'; channel: 'portal'; at: string }>(
      f,
      `/customer/projects/${encodeURIComponent(reference)}/messages`,
      json({ text }, { 'idempotency-key': key }),
    ),
}

// Document downloads (TSK-0100, HH-PRIV-06): short-lived links the server issues after its checks.
export const DOWNLOAD_KINDS = ['estimate_pdf', 'estimate_document', 'invoice_pdf'] as const
export type DownloadKind = (typeof DOWNLOAD_KINDS)[number]
export type Download = { kind: DownloadKind; contentType: string; byteSize: number; url: string; expiresAt: string }
export function parseDownloads(v: unknown): Download[] | null {
  if (!isObj(v) || !Array.isArray(v['documents'])) return null
  const out = v['documents'].map((d) =>
    isObj(d) &&
    oneOf(DOWNLOAD_KINDS)(d['kind']) &&
    isStr(d['contentType']) &&
    isInt(d['byteSize']) &&
    isStr(d['url']) &&
    /^https:\/\//.test(d['url']) &&
    isDate(d['expiresAt'])
      ? {
          kind: d['kind'],
          contentType: d['contentType'],
          byteSize: d['byteSize'],
          url: d['url'],
          expiresAt: d['expiresAt'],
        }
      : null,
  )
  return out.some((d) => d === null) ? null : (out as Download[])
}

// Privacy requests (TSK-0100, HH-PRIV-03, ENT-PrivacyRequest).
export const PRIVACY_KINDS = ['export', 'correction', 'deletion'] as const
export type PrivacyKind = (typeof PRIVACY_KINDS)[number]
export const PRIVACY_STATES = ['received', 'under_review', 'completed', 'partially_completed', 'declined'] as const
export type PrivacyState = (typeof PRIVACY_STATES)[number]
export const PRIVACY_CATEGORIES = [
  'login_account',
  'access_links',
  'account_preferences',
  'unaccepted_estimates',
  'accepted_agreements',
  'requests',
  'photos',
  'job_records',
  'safety_records',
  'customer_profile',
  'consent_records',
  'audit_log',
  'privacy_requests',
  'third_party_contacts',
  'financial_records',
] as const
export type PrivacyCategory = (typeof PRIVACY_CATEGORIES)[number]
export const PRIVACY_REASONS = [
  'protected_evidence',
  'retention_period',
  'hold',
  'active_record',
  'needed_by_retained',
  'erasure_not_available',
  'consent_evidence',
  'third_party',
  'request_record',
] as const
export type PrivacyReason = (typeof PRIVACY_REASONS)[number]
export type PrivacyItem = {
  category: PrivacyCategory
  count: number
  reason: PrivacyReason | null
  years: number | null
  reviewAt: string | null
}
export type PrivacyRequest = {
  reference: string
  kind: PrivacyKind
  state: PrivacyState
  details: string | null
  submittedAt: string
  decidedAt: string | null
  outcome: {
    deleted: { category: PrivacyCategory; count: number }[]
    retained: PrivacyItem[]
    excluded: PrivacyItem[]
    exportReady: boolean
    accessClosed: boolean
  } | null
  /** TSK-0136: the automatic acknowledgment, the substantive one and the internal target with its extensions. */
  acknowledgedAt: string | null
  acknowledgmentDueOn: string | null
  reviewStartedAt: string | null
  targetOn: string | null
  extensions: { targetOn: string; reason: string; decidedAt: string }[]
}
export type PrivacyList = { reference: string; freshVerification: boolean; requests: PrivacyRequest[] }

function privacyItem(v: unknown): PrivacyItem | null {
  if (!isObj(v) || !oneOf(PRIVACY_CATEGORIES)(v['category']) || !isInt(v['count'])) return null
  const reason = v['reason'] === null ? null : oneOf(PRIVACY_REASONS)(v['reason']) ? v['reason'] : undefined
  const years = v['years'] === null ? null : isInt(v['years']) ? v['years'] : undefined
  const reviewAt = v['reviewAt'] === null ? null : isDate(v['reviewAt']) ? v['reviewAt'] : undefined
  if (reason === undefined || years === undefined || reviewAt === undefined) return null
  return { category: v['category'], count: v['count'], reason, years, reviewAt }
}
function items(v: unknown): PrivacyItem[] | null {
  if (!Array.isArray(v)) return null
  const out = v.map(privacyItem)
  return out.some((i) => i === null) ? null : (out as PrivacyItem[])
}
export function parsePrivacyRequest(v: unknown): PrivacyRequest | null {
  if (!isObj(v) || !isStr(v['reference']) || !oneOf(PRIVACY_KINDS)(v['kind']) || !oneOf(PRIVACY_STATES)(v['state']))
    return null
  if (!(v['details'] === null || isStr(v['details'])) || !isDate(v['submittedAt'])) return null
  if (!(v['decidedAt'] === null || isDate(v['decidedAt']))) return null
  let outcome: PrivacyRequest['outcome'] = null
  if (v['outcome'] !== null) {
    const o = v['outcome']
    if (!isObj(o) || !Array.isArray(o['deleted'])) return null
    const deleted = o['deleted'].map((d) =>
      isObj(d) && oneOf(PRIVACY_CATEGORIES)(d['category']) && isInt(d['count'])
        ? { category: d['category'], count: d['count'] }
        : null,
    )
    const retained = items(o['retained'])
    const excluded = items(o['excluded'])
    if (deleted.some((d) => d === null) || !retained || !excluded) return null
    if (typeof o['exportReady'] !== 'boolean' || typeof o['accessClosed'] !== 'boolean') return null
    outcome = {
      deleted: deleted as { category: PrivacyCategory; count: number }[],
      retained,
      excluded,
      exportReady: o['exportReady'],
      accessClosed: o['accessClosed'],
    }
  }
  // TSK-0136: the acknowledgment and the dates (calendar dates are YYYY-MM-DD).
  const day = (x: unknown): x is string => isStr(x) && /^\d{4}-\d{2}-\d{2}$/.test(x)
  const orNull = (x: unknown, ok: (y: unknown) => boolean) => x === null || ok(x)
  if (
    !orNull(v['acknowledgedAt'], isDate) ||
    !orNull(v['acknowledgmentDueOn'], day) ||
    !orNull(v['reviewStartedAt'], isDate) ||
    !orNull(v['targetOn'], day) ||
    !Array.isArray(v['extensions'])
  )
    return null
  const extensions = v['extensions'].map((e) =>
    isObj(e) && day(e['targetOn']) && isStr(e['reason']) && isDate(e['decidedAt'])
      ? { targetOn: e['targetOn'], reason: e['reason'], decidedAt: e['decidedAt'] as string }
      : null,
  )
  if (extensions.some((e) => e === null)) return null
  return {
    reference: v['reference'],
    kind: v['kind'],
    state: v['state'],
    details: v['details'],
    submittedAt: v['submittedAt'],
    decidedAt: v['decidedAt'],
    outcome,
    acknowledgedAt: v['acknowledgedAt'] as string | null,
    acknowledgmentDueOn: v['acknowledgmentDueOn'] as string | null,
    reviewStartedAt: v['reviewStartedAt'] as string | null,
    targetOn: v['targetOn'] as string | null,
    extensions: extensions as PrivacyRequest['extensions'],
  }
}
export function parsePrivacyList(v: unknown): PrivacyList | null {
  if (
    !isObj(v) ||
    !isStr(v['reference']) ||
    typeof v['freshVerification'] !== 'boolean' ||
    !Array.isArray(v['requests'])
  )
    return null
  const requests = v['requests'].map(parsePrivacyRequest)
  if (requests.some((r) => r === null)) return null
  return {
    reference: v['reference'],
    freshVerification: v['freshVerification'],
    requests: requests as PrivacyRequest[],
  }
}

export type PrivacyFailure = WriteFailure | 'already_open'
export type PrivacyResult = { ok: true; request: PrivacyRequest } | { ok: false; failure: PrivacyFailure }
async function requestPrivacy(
  fetchImpl: Fetch,
  reference: string,
  kind: PrivacyKind,
  body: { details?: string },
  key: string,
): Promise<PrivacyResult> {
  const r = await post(
    fetchImpl,
    `/customer/projects/${encodeURIComponent(reference)}/privacy-requests/${kind}`,
    body,
    key,
  )
  if (!r) return { ok: false, failure: 'failed' }
  const request = r.status === 201 ? parsePrivacyRequest(r.json) : null
  if (request) return { ok: true, request }
  if (r.status === 409 && fieldCodes(r.json).includes('PRIVACY_REQUEST_OPEN'))
    return { ok: false, failure: 'already_open' }
  return { ok: false, failure: failureOf(r.status, r.json) }
}

/** The data export of a completed export request: the JSON as the server sends it (its own customer view). */
export type ExportResult = { ok: true; data: Record<string, unknown> } | { ok: false; failure: WriteFailure }
async function dataExport(fetchImpl: Fetch, reference: string, request: string): Promise<ExportResult> {
  let res: Response
  try {
    res = await fetchImpl(
      `/api/v1/customer/projects/${encodeURIComponent(reference)}/privacy-requests/${encodeURIComponent(request)}/export`,
      { method: 'GET', credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' } },
    )
  } catch {
    return { ok: false, failure: 'failed' }
  }
  const json = (await res.json().catch(() => null)) as unknown
  if (res.status === 200 && isObj(json) && isDate(json['generatedAt'])) return { ok: true, data: json }
  return { ok: false, failure: failureOf(res.status, json) }
}

/**
 * Add a project to the account (TSK-0124; HH-ID-14, HH-ID-03): the code request gets one answer whether or not the
 * details match anything; only what depends on no record is told apart (malformed input, texts unavailable for every
 * phone, a network over its limit, not configured).
 */
export type ClaimFailure =
  | 'expired'
  | 'unavailable'
  | 'invalid_reference'
  | 'invalid_contact'
  | 'texts_unavailable'
  | 'invalid_code'
  | 'rate_limited'
  | 'not_configured'
  | 'failed'
function claimFailure(r: { status: number; json: unknown }): ClaimFailure {
  if (r.status === 401) return 'expired'
  if (r.status === 404) return 'unavailable'
  if (r.status === 429) return 'rate_limited'
  if (r.status === 503) return 'not_configured'
  const codes = fieldCodes(r.json)
  for (const c of ['invalid_reference', 'invalid_contact', 'texts_unavailable', 'invalid_code'] as const)
    if (r.status === 400 && codes.includes(c)) return c
  return 'failed'
}
async function sendClaimCode(
  fetchImpl: Fetch,
  reference: string,
  contact: string,
): Promise<{ ok: true; minutes: number } | { ok: false; failure: ClaimFailure }> {
  const r = await post(fetchImpl, '/customer/account/claims/codes', { reference, contact })
  if (!r) return { ok: false, failure: 'failed' }
  if (r.status === 202 && isObj(r.json) && r.json['accepted'] === true && isInt(r.json['codeMinutes']))
    return { ok: true, minutes: r.json['codeMinutes'] }
  return { ok: false, failure: claimFailure(r) }
}
async function claimProject(
  fetchImpl: Fetch,
  reference: string,
  contact: string,
  code: string,
): Promise<{ ok: true; reference: string } | { ok: false; failure: ClaimFailure }> {
  const r = await post(fetchImpl, '/customer/account/claims', { reference, contact, code })
  if (!r) return { ok: false, failure: 'failed' }
  const project = isObj(r.json) ? r.json['project'] : null
  if (r.status === 200 && isObj(project) && isStr(project['reference']))
    return { ok: true, reference: project['reference'] }
  return { ok: false, failure: claimFailure(r) }
}

// TSK-0113 (HH-ID-12, OWN-DEC-113): the signed-in account's saved properties (account.properties), its preferences
// (account.preferences) and what Request This Service Again starts from (account.request_prefill, read by the request
// form on the public site). Only the account's own history: anything else is NOT_FOUND like a missing record.
export const PROPERTY_TYPES = ['house', 'apartment_condo', 'townhouse', 'rental_short_term'] as const
export type PropertyType = (typeof PROPERTY_TYPES)[number]
export type PropertyAddress = {
  street: string
  unit: string | null
  city: string
  state: string
  zip: string
  propertyType: PropertyType
}
export type AccountProperty = {
  reference: string
  address: PropertyAddress
  saved: { id: string; label: string } | null
}
export const CONTACT_METHODS = ['email', 'call', 'text'] as const
export type ContactMethod = (typeof CONTACT_METHODS)[number]
export const CONSENT_STATES = ['granted', 'withdrawn', 'none'] as const
export type ConsentState = (typeof CONSENT_STATES)[number]
export type AccountPreferences = {
  preferredChannel: ContactMethod | null
  email: { destination: string; marketing: ConsentState; followUps: ConsentState } | null
  phone: { destination: string; texts: ConsentState; marketing: ConsentState; followUps: ConsentState } | null
}
export type AccountPermission = 'marketing' | 'follow_ups' | 'texts'

function parseAddress(v: unknown): PropertyAddress | null {
  if (!isObj(v) || !isStr(v['street']) || !isStrOrNull(v['unit']) || !isStr(v['city']) || !isStr(v['state']))
    return null
  if (!isStr(v['zip']) || !oneOf(PROPERTY_TYPES)(v['propertyType'])) return null
  return {
    street: v['street'],
    unit: v['unit'],
    city: v['city'],
    state: v['state'],
    zip: v['zip'],
    propertyType: v['propertyType'],
  }
}
function parseProperties(v: unknown): AccountProperty[] | null {
  if (!isObj(v) || !Array.isArray(v['properties'])) return null
  const out: AccountProperty[] = []
  for (const p of v['properties']) {
    const address = isObj(p) ? parseAddress(p['address']) : null
    if (!isObj(p) || !isStr(p['reference']) || !address) return null
    const saved = p['saved']
    if (saved !== null && !(isObj(saved) && isStr(saved['id']) && isStr(saved['label']))) return null
    const named = saved as { id: string; label: string } | null
    out.push({ reference: p['reference'], address, saved: named ? { id: named.id, label: named.label } : null })
  }
  return out
}
function parsePreferences(v: unknown): AccountPreferences | null {
  if (!isObj(v)) return null
  const channel = v['preferredChannel']
  if (channel !== null && !oneOf(CONTACT_METHODS)(channel)) return null
  const states = (o: Obj, keys: readonly string[]) => keys.every((k) => oneOf(CONSENT_STATES)(o[k]))
  const e = v['email']
  const p = v['phone']
  if (e !== null && !(isObj(e) && isStr(e['destination']) && states(e, ['marketing', 'followUps']))) return null
  if (p !== null && !(isObj(p) && isStr(p['destination']) && states(p, ['texts', 'marketing', 'followUps'])))
    return null
  return {
    preferredChannel: channel,
    email: e
      ? {
          destination: e['destination'] as string,
          marketing: e['marketing'] as ConsentState,
          followUps: e['followUps'] as ConsentState,
        }
      : null,
    phone: p
      ? {
          destination: p['destination'] as string,
          texts: p['texts'] as ConsentState,
          marketing: p['marketing'] as ConsentState,
          followUps: p['followUps'] as ConsentState,
        }
      : null,
  }
}

/** Why a change to the saved properties or the preferences was not made. */
export type SettingsFailure =
  | 'expired'
  | 'unavailable'
  | 'invalid_label'
  | 'label_in_use'
  | 'already_saved'
  | 'texts_on_request_form'
  | 'rate_limited'
  | 'failed'
function settingsFailure(r: { status: number; json: unknown }): SettingsFailure {
  if (r.status === 401) return 'expired'
  if (r.status === 404) return 'unavailable'
  if (r.status === 429) return 'rate_limited'
  const codes = fieldCodes(r.json)
  for (const c of ['invalid_label', 'label_in_use', 'already_saved', 'texts_on_request_form'] as const)
    if ((r.status === 400 || r.status === 409) && codes.includes(c)) return c
  return 'failed'
}
async function settingsWrite<T>(
  fetchImpl: Fetch,
  path: string,
  body: unknown,
  parse: (v: unknown) => T | null,
): Promise<{ ok: true; data: T } | { ok: false; failure: SettingsFailure }> {
  const r = await post(fetchImpl, path, body)
  if (!r) return { ok: false, failure: 'failed' }
  const data = r.status === 200 ? parse(r.json) : null
  return data !== null ? { ok: true, data } : { ok: false, failure: settingsFailure(r) }
}
const savedPath = (id: string) => `/customer/account/properties/${encodeURIComponent(id)}`

// TSK-0118 (HH-ID-13): the signed-in account's organizations (account.organizations): the ones it administers (shared
// projects, open memberships, history), the ones it belongs to (privileges and the projects it reaches) and the
// invitations to its own sign-in email. Anything else is NOT_FOUND like a missing record.
export const ORGANIZATION_EVENT_KINDS = [
  'created',
  'project_added',
  'project_removed',
  'member_invited',
  'invitation_withdrawn',
  'invitation_accepted',
  'invitation_declined',
  'member_changed',
  'member_removed',
  'member_left',
  'membership_ended_account_closed',
] as const
export type OrganizationEventKind = (typeof ORGANIZATION_EVENT_KINDS)[number]
export type OrganizationMember = {
  id: string
  email: string
  state: 'invited' | 'active'
  approve: boolean
  pay: boolean
  projects: string[]
  invitedAt: string
  acceptedAt: string | null
}
export type OrganizationHistoryEntry = {
  kind: OrganizationEventKind
  by: 'administrator' | 'member' | 'handyhub'
  at: string
  email: string | null
  reference: string | null
  approve: boolean | null
  pay: boolean | null
  scopeProjects: number | null
}
export type AdministeredOrganization = {
  id: string
  name: string
  createdAt: string
  projects: string[]
  members: OrganizationMember[]
  history: OrganizationHistoryEntry[]
}
export type MemberOrganization = {
  id: string
  name: string
  approve: boolean
  pay: boolean
  projects: string[]
  acceptedAt: string
}
export type OrganizationInvitation = {
  id: string
  organization: string
  approve: boolean
  pay: boolean
  projects: number
  invitedAt: string
}
export type AccountOrganizations = {
  linkedProjects: string[]
  administered: AdministeredOrganization[]
  memberships: MemberOrganization[]
  invitations: OrganizationInvitation[]
}
const isBool = (v: unknown): v is boolean => typeof v === 'boolean'
const isBoolOrNull = (v: unknown): v is boolean | null => v === null || isBool(v)
function parseMember(v: unknown): OrganizationMember | null {
  if (!isObj(v) || !isStr(v['id']) || !isStr(v['email']) || !oneOf(['invited', 'active'] as const)(v['state']))
    return null
  if (!isBool(v['approve']) || !isBool(v['pay']) || !isStrings(v['projects']) || !isDate(v['invitedAt'])) return null
  const accepted = v['acceptedAt']
  if (accepted !== null && !isDate(accepted)) return null
  return {
    id: v['id'],
    email: v['email'],
    state: v['state'],
    approve: v['approve'],
    pay: v['pay'],
    projects: v['projects'],
    invitedAt: v['invitedAt'],
    acceptedAt: accepted,
  }
}
function parseHistory(v: unknown): OrganizationHistoryEntry | null {
  if (!isObj(v) || !oneOf(ORGANIZATION_EVENT_KINDS)(v['kind'])) return null
  if (!oneOf(['administrator', 'member', 'handyhub'] as const)(v['by']) || !isDate(v['at'])) return null
  const { email, reference, approve, pay, scopeProjects } = v
  if (!isStrOrNull(email) || !isStrOrNull(reference) || !isBoolOrNull(approve) || !isBoolOrNull(pay)) return null
  if (scopeProjects !== null && !isSeconds(scopeProjects)) return null
  return { kind: v['kind'], by: v['by'], at: v['at'], email, reference, approve, pay, scopeProjects }
}
function allOf<T>(list: unknown, parse: (v: unknown) => T | null): T[] | null {
  if (!Array.isArray(list)) return null
  const out = list.map(parse)
  return out.some((x) => x === null) ? null : (out as T[])
}
function parseAdministered(o: unknown): AdministeredOrganization | null {
  if (!isObj(o) || !isStr(o['id']) || !isStr(o['name']) || !isDate(o['createdAt']) || !isStrings(o['projects']))
    return null
  const members = allOf(o['members'], parseMember)
  const history = allOf(o['history'], parseHistory)
  if (!members || !history) return null
  return { id: o['id'], name: o['name'], createdAt: o['createdAt'], projects: o['projects'], members, history }
}
function parseMembership(o: unknown): MemberOrganization | null {
  if (!isObj(o) || !isStr(o['id']) || !isStr(o['name']) || !isBool(o['approve']) || !isBool(o['pay'])) return null
  if (!isStrings(o['projects']) || !isDate(o['acceptedAt'])) return null
  const { id, name, approve, pay, projects, acceptedAt } = o
  return { id, name, approve, pay, projects, acceptedAt }
}
function parseInvitation(o: unknown): OrganizationInvitation | null {
  if (!isObj(o) || !isStr(o['id']) || !isStr(o['organization']) || !isBool(o['approve']) || !isBool(o['pay']))
    return null
  if (!isSeconds(o['projects']) || !isDate(o['invitedAt'])) return null
  const { id, organization, approve, pay, projects, invitedAt } = o
  return { id, organization, approve, pay, projects, invitedAt }
}
export function parseOrganizations(v: unknown): AccountOrganizations | null {
  if (!isObj(v) || !isStrings(v['linkedProjects'])) return null
  const administered = allOf(v['administered'], parseAdministered)
  const memberships = allOf(v['memberships'], parseMembership)
  const invitations = allOf(v['invitations'], parseInvitation)
  if (!administered || !memberships || !invitations) return null
  return { linkedProjects: v['linkedProjects'], administered, memberships, invitations }
}

/** Why a change to an organization was not made. */
export type OrganizationFailure =
  | 'expired'
  | 'unavailable'
  | 'invalid_name'
  | 'invalid_email'
  | 'own_email'
  | 'already_invited'
  | 'already_shared'
  | 'already_member'
  | 'invalid_scope'
  | 'rate_limited'
  | 'failed'
const ORGANIZATION_CODES = [
  'invalid_name',
  'invalid_email',
  'own_email',
  'already_invited',
  'already_shared',
  'already_member',
  'invalid_scope',
] as const
async function organizationWrite(
  fetchImpl: Fetch,
  path: string,
  body: unknown,
): Promise<{ ok: true; data: AccountOrganizations } | { ok: false; failure: OrganizationFailure }> {
  const r = await post(fetchImpl, path, body)
  if (!r) return { ok: false, failure: 'failed' }
  const data = r.status === 200 ? parseOrganizations(r.json) : null
  if (data !== null) return { ok: true, data }
  if (r.status === 401) return { ok: false, failure: 'expired' }
  if (r.status === 404) return { ok: false, failure: 'unavailable' }
  if (r.status === 429) return { ok: false, failure: 'rate_limited' }
  const codes = fieldCodes(r.json)
  for (const c of ORGANIZATION_CODES)
    if ((r.status === 400 || r.status === 409) && codes.includes(c)) return { ok: false, failure: c }
  return { ok: false, failure: 'failed' }
}
const orgPath = (id: string) => `/customer/account/organizations/${encodeURIComponent(id)}`
/** A membership's scope (the references of shared projects it reaches) and privileges. */
export type MemberScope = { approve: boolean; pay: boolean; projects: string[] }
// TSK-0114 (HH-SCH-10, OWN-DEC-113, OWN-DEC-148): the project's repeat-service schedule as the customer agreed to it,
// which they change or stop here (each write with an idempotency key the section keeps for its retries).
export const REPEAT_UNITS = ['day', 'week', 'month'] as const
export type RepeatUnit = (typeof REPEAT_UNITS)[number]
export type RepeatInterval = { unit: RepeatUnit; count: number } | null
export type RepeatSchedule = {
  state: 'active' | 'stopped'
  nextDates: { date: string; requested: boolean }[]
  interval: RepeatInterval
  reminders: boolean
  changeNoticeHours: number | null
  stoppedAt: string | null
}
export type RepeatService = { reference: string; schedule: RepeatSchedule | null }

export function parseRepeatService(v: unknown): RepeatService | null {
  if (!isObj(v) || !isStr(v['reference'])) return null
  const s = v['schedule']
  if (s === null) return { reference: v['reference'], schedule: null }
  if (!isObj(s) || !oneOf(['active', 'stopped'] as const)(s['state']) || !Array.isArray(s['nextDates'])) return null
  const nextDates: RepeatSchedule['nextDates'] = []
  for (const d of s['nextDates']) {
    if (!isObj(d) || !isStr(d['date']) || typeof d['requested'] !== 'boolean') return null
    nextDates.push({ date: d['date'], requested: d['requested'] })
  }
  const i = s['interval']
  let interval: RepeatInterval = null
  if (i !== null) {
    if (!isObj(i) || !oneOf(REPEAT_UNITS)(i['unit']) || typeof i['count'] !== 'number') return null
    interval = { unit: i['unit'], count: i['count'] }
  }
  const notice = s['changeNoticeHours']
  const stoppedAt = s['stoppedAt']
  if (typeof s['reminders'] !== 'boolean') return null
  if (notice !== null && typeof notice !== 'number') return null
  if (stoppedAt !== null && !isDate(stoppedAt)) return null
  return {
    reference: v['reference'],
    schedule: {
      state: s['state'],
      nextDates,
      interval,
      reminders: s['reminders'],
      changeNoticeHours: notice as number | null,
      stoppedAt: stoppedAt as string | null,
    },
  }
}

/** Why a change to the schedule was not made. */
export type RepeatFailure = 'expired' | 'unavailable' | 'within_notice' | 'invalid' | 'rate_limited' | 'failed'
async function repeatWrite(
  fetchImpl: Fetch,
  reference: string,
  action: 'change' | 'reminders' | 'stop',
  body: unknown,
  key: string,
): Promise<{ ok: true; data: RepeatService } | { ok: false; failure: RepeatFailure }> {
  const r = await post(
    fetchImpl,
    `/customer/projects/${encodeURIComponent(reference)}/repeat-service/${action}`,
    body,
    key,
  )
  if (!r) return { ok: false, failure: 'failed' }
  const data = r.status === 200 ? parseRepeatService(r.json) : null
  if (data) return { ok: true, data }
  if (r.status === 401) return { ok: false, failure: 'expired' }
  if (r.status === 403 || r.status === 404) return { ok: false, failure: 'unavailable' }
  if (r.status === 429) return { ok: false, failure: 'rate_limited' }
  if (r.status === 400 && fieldCodes(r.json).includes('WITHIN_CHANGE_NOTICE'))
    return { ok: false, failure: 'within_notice' }
  if (r.status === 400 || r.status === 409) return { ok: false, failure: 'invalid' }
  return { ok: false, failure: 'failed' }
}

export const portalApi = {
  projects: (f: Fetch) => read(f, '/customer/projects', parseList),
  caseUpdates: (f: Fetch, reference: string) =>
    read(f, `/customer/projects/${encodeURIComponent(reference)}/cases`, parseCaseUpdates),
  questions: (f: Fetch, reference: string) =>
    read(f, `/customer/projects/${encodeURIComponent(reference)}/questions`, parseQuestions),
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
  selectWindow: (f: Fetch, ref: { reference: string; number: number }, position: number, key: string) =>
    answerOffer(f, ref, { position }, key),
  requestOtherTimes: (f: Fetch, ref: { reference: string; number: number }, note: string, key: string) =>
    answerOffer(f, ref, { note }, key),
  requestChange,
  verification: (f: Fetch) => read(f, '/customer/session/verification', parseVerification),
  sendCode,
  verify,
  downloads: (f: Fetch, ref: { reference: string; number: string; version: number }) =>
    read(f, `${versionPath(ref)}/documents`, parseDownloads),
  // TSK-0085: the issued invoice's PDF.
  invoiceDownload: (f: Fetch, ref: { reference: string; number: string }) =>
    read(
      f,
      `/customer/projects/${encodeURIComponent(ref.reference)}/invoices/${encodeURIComponent(ref.number)}/document`,
      parseDownloads,
    ),
  privacy: (f: Fetch, reference: string) =>
    read(f, `/customer/projects/${encodeURIComponent(reference)}/privacy-requests`, parsePrivacyList),
  requestPrivacy,
  dataExport,
  // TSK-0082: the change orders sent to the customer, and their decision on one.
  changeOrders: (f: Fetch, reference: string) =>
    read(f, `/customer/projects/${encodeURIComponent(reference)}/change-orders`, parseChangeOrders),
  approveChangeOrder: (
    f: Fetch,
    ref: { reference: string; number: number; version: number },
    body: {
      contentDigest: string
      totalCents: number
      termsDocumentId: string
      termsSha256: string
      acceptTerms: boolean
      fullName: string
    },
    key: string,
  ) => decideChangeOrder(f, ref, 'approve', body, key),
  rejectChangeOrder: (
    f: Fetch,
    ref: { reference: string; number: number; version: number },
    body: { contentDigest: string; reason?: string },
    key: string,
  ) => decideChangeOrder(f, ref, 'reject', body, key),
  // TSK-0124: Add a project to the account with a code to its verified contact.
  sendClaimCode,
  claimProject,
  // TSK-0113: saved properties and preferences of the signed-in account.
  properties: (f: Fetch) => read(f, '/customer/account/properties', parseProperties),
  saveProperty: (f: Fetch, reference: string, label: string) =>
    settingsWrite(f, '/customer/account/properties', { reference, label }, parseProperties),
  renameProperty: (f: Fetch, id: string, label: string) => settingsWrite(f, savedPath(id), { label }, parseProperties),
  removeProperty: (f: Fetch, id: string) => settingsWrite(f, `${savedPath(id)}/remove`, {}, parseProperties),
  preferences: (f: Fetch) => read(f, '/customer/account/preferences', parsePreferences),
  setPreferredChannel: (f: Fetch, preferredChannel: ContactMethod | null) =>
    settingsWrite(f, '/customer/account/preferences', { preferredChannel }, parsePreferences),
  setPermission: (
    f: Fetch,
    body: { channel: 'email' | 'sms'; permission: AccountPermission; granted: boolean; privacyNoticeVersion?: string },
  ) => settingsWrite(f, '/customer/account/permissions', body, parsePreferences),
  // TSK-0118: organization accounts.
  organizations: (f: Fetch) => read(f, '/customer/account/organizations', parseOrganizations),
  createOrganization: (f: Fetch, name: string) => organizationWrite(f, '/customer/account/organizations', { name }),
  shareProject: (f: Fetch, id: string, reference: string) =>
    organizationWrite(f, `${orgPath(id)}/projects`, { reference }),
  unshareProject: (f: Fetch, id: string, reference: string) =>
    organizationWrite(f, `${orgPath(id)}/projects/${encodeURIComponent(reference)}/remove`, {}),
  inviteMember: (f: Fetch, id: string, email: string, scope: MemberScope) =>
    organizationWrite(f, `${orgPath(id)}/members`, { email, ...scope }),
  changeMember: (f: Fetch, id: string, member: string, scope: MemberScope) =>
    organizationWrite(f, `${orgPath(id)}/members/${encodeURIComponent(member)}`, scope),
  removeMember: (f: Fetch, id: string, member: string) =>
    organizationWrite(f, `${orgPath(id)}/members/${encodeURIComponent(member)}/remove`, {}),
  leaveOrganization: (f: Fetch, id: string) => organizationWrite(f, `${orgPath(id)}/leave`, {}),
  answerInvitation: (f: Fetch, id: string, answer: 'accept' | 'decline') =>
    organizationWrite(f, `/customer/account/organization-invitations/${encodeURIComponent(id)}/${answer}`, {}),
  // TSK-0114: the project's repeat-service schedule, changed or stopped by the customer.
  repeatService: (f: Fetch, reference: string) =>
    read(f, `/customer/projects/${encodeURIComponent(reference)}/repeat-service`, parseRepeatService),
  changeRepeatService: (
    f: Fetch,
    reference: string,
    body: { nextDate: string; interval: RepeatInterval },
    key: string,
  ) => repeatWrite(f, reference, 'change', body, key),
  setRepeatReminders: (f: Fetch, reference: string, on: boolean, key: string) =>
    repeatWrite(f, reference, 'reminders', { on }, key),
  stopRepeatService: (f: Fetch, reference: string, key: string) => repeatWrite(f, reference, 'stop', {}, key),
}
