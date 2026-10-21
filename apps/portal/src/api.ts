// Customer portal API client (TSK-0038; HH-PORT-06, HH-ARC-10, HH-PORT-01). Same-origin JSON reads of /api/v1/customer;
// the customer session is an HttpOnly cookie the page never sees. Every answer is checked against the shape the
// server's customer views declare (apps/server/src/modules/records/projections.ts); anything else is a failure, never
// shown as data. Outcomes the page shows as its own states:
// - 401: the session ended (expired, signed out or revoked);
// - 403 / 404: this project is not available to this session (a project outside it is the same NOT_FOUND as a
//   missing one, T19);
// - a network failure, a server error or an unexpected answer: failed.

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

export const TIMELINE_KINDS = ['received', 'more_information', 'site_visit', 'not_a_fit', 'closed_no_response'] as const
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
  payment: { state: 'none' }
  refreshedAt: string
  refreshSeconds: number
}

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

export function parseOverview(v: unknown): ProjectOverview | null {
  if (!isObj(v)) return null
  const head = summary(v)
  const s = head && isObj(v['status']) ? v['status']['text'] : undefined
  if (!head || (s !== null && !isStr(s))) return null
  if (!Array.isArray(v['timeline']) || v['appointment'] !== null) return null
  const timeline = v['timeline'].map(entry)
  if (timeline.some((e) => e === null)) return null
  const payment = v['payment']
  if (!isObj(payment) || payment['state'] !== 'none') return null
  if (!isDate(v['refreshedAt']) || !isSeconds(v['refreshSeconds'])) return null
  return {
    ...head,
    status: { ...head.status, text: s },
    timeline: timeline as TimelineEntry[],
    appointment: null,
    payment: { state: 'none' },
    refreshedAt: v['refreshedAt'],
    refreshSeconds: v['refreshSeconds'],
  }
}

// The workspace tabs beside the Overview (TSK-0039; HH-PORT-09): each answers with its own declared view.
export const WORKSPACE_TABS = ['messages', 'documents', 'photos', 'appointments', 'payments'] as const
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number]
type TabHead = { reference: string; refreshedAt: string; refreshSeconds: number }
export type PhotoCounts = { received: number; processing: number; failed: number }
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
 * What each tab holds today: a closed state code, (Photos) the counts of the customer-visible photos, or (Messages,
 * TSK-0050) the project conversation.
 */
export type TabData =
  | (TabHead & { tab: 'messages'; messages: ConversationMessage[] })
  | (TabHead & { tab: 'documents' | 'appointments' | 'payments'; state: 'none' })
  | (TabHead & { tab: 'photos'; photos: PhotoCounts })

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
    return { ...head, tab, photos: { received: p['received'], processing: p['processing'], failed: p['failed'] } }
  }
  if (tab === 'messages') {
    const list = v['messages']
    if (!Array.isArray(list) || 'state' in v) return null
    const messages = list.map(conversationMessage)
    if (messages.some((m) => m === null)) return null
    return { ...head, tab, messages: messages as ConversationMessage[] }
  }
  // Any other state (for example "paid" or "read") is not what the view declares: a failure, never shown as data.
  if (v['state'] !== TAB_STATE[tab]) return null
  return { ...head, tab, state: 'none' }
}

const FROM = ['you', 'handyhub'] as const
const CHANNELS = ['email', 'sms', 'portal'] as const
const TEXT_STATES = ['shown', 'empty', 'not_available'] as const

function conversationMessage(v: unknown): ConversationMessage | null {
  if (!isObj(v)) return null
  const { from, channel, at, text, textState, attachments } = v
  if (!oneOf(FROM)(from) || !oneOf(CHANNELS)(channel) || !isDate(at) || !oneOf(TEXT_STATES)(textState)) return null
  if (text !== null && !isStr(text)) return null
  if ((textState === 'shown') !== (text !== null) || !isSeconds(attachments)) return null
  return { from, channel, at, text, textState, attachments }
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
  const { id, kind, text, askedAt, state, canReply, reply } = v
  if (!isStr(id) || !oneOf(['general', 'measurement'] as const)(kind) || !isStr(text) || !isDate(askedAt)) return null
  if (!oneOf(['waiting', 'answered'] as const)(state) || typeof canReply !== 'boolean') return null
  if (reply === null) return { id, kind, text, askedAt, state, canReply, reply: null }
  if (!isObj(reply) || (reply['text'] !== null && !isStr(reply['text'])) || typeof reply['notSure'] !== 'boolean')
    return null
  const photos = counts(reply['photos'])
  if (!isDate(reply['at']) || !photos) return null
  return {
    id,
    kind,
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

/** The outcome of a write the page shows: done (with the answer), refused (with the server's codes), or failed. */
export type WriteResult<T> =
  | { ok: true; data: T }
  | { ok: false; failure: 'refused'; status: number; codes: string[] }
  | { ok: false; failure: Failure }

async function send<T>(fetchImpl: Fetch, path: string, init: RequestInit): Promise<WriteResult<T>> {
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

export const portalApi = {
  projects: (f: Fetch) => read(f, '/customer/projects', parseList),
  questions: (f: Fetch, reference: string) =>
    read(f, `/customer/projects/${encodeURIComponent(reference)}/questions`, parseQuestions),
  overview: (f: Fetch, reference: string) =>
    read(f, `/customer/projects/${encodeURIComponent(reference)}/overview`, parseOverview),
  tab: (f: Fetch, reference: string, tab: WorkspaceTab) =>
    read(f, `/customer/projects/${encodeURIComponent(reference)}/${tab}`, (v) => parseTab(tab, v)),
}
