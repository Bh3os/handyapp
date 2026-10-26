// The unified inbox in the staff app (TSK-0049; HH-COM-07, HH-COM-10, HH-COM-01, OWN-DEC-120, S06). The inbox shows
// each inbound channel's truthful state ("Inbound not configured" while its webhook secret is unset), the customer
// conversations with their projects, and, for Owner and Office only, the private Needs Linking list. A conversation
// shows the customer's email and texts exactly as received, the project's customer notifications as delivery states,
// and the separate internal conversation. A Needs Linking message is linked to a project with a written reason; the
// message itself never changes. Staff text is English or Spanish (staff catalogs); the server decides every read and
// write.
// TSK-0050 (HH-COM-08, HH-COM-09, OWN-DEC-120, S06): the reply composer of the project conversation. It shows the
// customer's preferred channel and, when that one is not permitted, the other permitted options for staff to choose
// (never a silent switch); the daily contact hours (outside them the email or text waits for the next opening, while
// the reply shows on the customer's project page at once); and whether reply wording is released. Pressing Send is the
// release. The draft and its idempotency key are kept (also across a reload of the tab) until the server accepts the
// reply, so a retry after a failure sends it once. Each reply shows its delivery state, with Retry for a failed one.
// A project with no conversation yet opens at /inbox/<project id>: the composer starts it. Internal notes stay in the
// separate internal form.
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge, type StatusTone } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string
type Link = (to: string) => { href: string; onClick: (e: MouseEvent<HTMLAnchorElement>) => void }
type Props = { t: T; locale: StaffLocale; fetchImpl: Fetch; go: (to: string) => void; href: (to: string) => string }

export type InboxStatus = {
  sms: { provider: 'bird'; inbound: 'configured' | 'not_configured' | 'unknown' }
  email: {
    provider: 'resend'
    inbound: 'configured' | 'not_configured' | 'unknown'
    bodyReading: 'configured' | 'fake' | 'not_configured' | 'unknown'
    replyTokens: 'configured' | 'not_configured' | 'unknown'
  }
  unsupported: { count: number; latestAt: string | null }
  needsLinking: number | null
}
export type ConversationItem = {
  id: string
  project: { id: string; reference: string; state: string }
  customer: { id: string; displayName: string }
  lastMessageAt: string | null
  lastInboundAt: string | null
  awaitingReply: boolean
  latest: { channel: string; direction: string; preview: string | null; receivedAt: string } | null
}
type Attachment = { contentType: string; size: number | null }
export type ThreadMessage = {
  id: string
  direction: string
  channel: string
  from: string | null
  to: string[]
  subject: string | null
  body: string | null
  bodyState: string
  bodyTruncated: boolean
  attachments: Attachment[]
  keyword: string | null
  receivedAt: string
  linkState: string
  matchRule: string | null
  author: { kind: 'contact' | 'unknown_sender' | 'staff'; id: string | null; name: string | null }
  /** TSK-0050: a staff reply's email or text as its delivery records it. */
  delivery?: { id: string; state: string; errorCode: string | null; sendAt: string | null; retry: boolean } | null
  /** TSK-0155: a reply sent from a worker's proposed reply carries the worker's original text (staff only). */
  proposal?: { id: string; originalText: string; author: { id: string; name: string | null } } | null
}
export type Conversation = {
  id: string
  project: { id: string; reference: string; state: string }
  customer: { id: string; displayName: string }
  state: string
  awaitingReply: boolean
  handledAt: string | null
  messages: ThreadMessage[]
  deliveries: { id: string; messageKey: string; channel: string; state: string; at: string }[]
  internal: { id: string | null; messages: ThreadMessage[] }
}
export type ReplyChannel = 'email' | 'sms'
export type ReplyOptions = {
  contact: { id: string; name: string } | null
  preferred: 'email' | 'text' | 'call'
  options: {
    channel: ReplyChannel
    destination: string
    preferred: boolean
    available: boolean
    reason: 'available' | 'unverified' | 'no_opt_in' | 'opted_out'
  }[]
  defaultChannel: ReplyChannel | null
  /** TSK-0122 (OWN-DEC-154): an email goes at once; a text inside the recipient's permitted hours. */
  deliveryHours: {
    email: { sendAt: string }
    text: {
      state: 'open' | 'closed' | 'not_configured'
      open: string | null
      close: string | null
      zone: string | null
      basis: 'recipient_zone' | 'unknown_zone_fallback' | null
      sendAt: string
    }
  }
  templates: { email: 'configured' | 'not_configured'; sms: 'configured' | 'not_configured' }
  maxLength: number
}
export type ProjectConversation = {
  conversationId: string | null
  project: { id: string; reference: string; state: string }
  customer: { id: string; displayName: string }
}

export type NeedsLinkingItem = {
  id: string
  channel: string
  from: string
  subject: string | null
  preview: string | null
  receivedAt: string
  reason: string
  attachments: number
  suggestion: { projectId: string; reference: string } | null
}
export type MessageDetail = {
  id: string
  version: number
  direction: string
  channel: string
  from: string | null
  to: string[]
  subject: string | null
  body: string | null
  bodyState: string
  bodyTruncated: boolean
  attachments: Attachment[]
  keyword: string | null
  receivedAt: string
  linkState: string
  reason: string | null
  matchRule: string | null
  project: { id: string; reference: string } | null
  customer: { id: string; displayName: string } | null
  conversationId: string | null
  candidates: {
    projectId: string
    reference: string
    state: string
    customerId: string
    customerName: string
    verifiedContact: boolean
    suggested: boolean
  }[]
  history: {
    fromState: string | null
    toState: string
    fromReference: string | null
    toReference: string | null
    rule: string
    reason: string | null
    staff: { id: string; name: string | null } | null
    at: string
  }[]
}

function linkTo(go: (to: string) => void, href: (to: string) => string): Link {
  return (to) => ({
    href: href(to),
    onClick: (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
      e.preventDefault()
      go(to)
    },
  })
}

const formatter = (locale: StaffLocale) =>
  new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="staff-request__section" aria-labelledby={id}>
      <h2 id={id} className="staff-queue__heading">
        {title}
      </h2>
      {children}
    </section>
  )
}

const TONE: Record<string, StatusTone> = {
  configured: 'success',
  fake: 'info',
  not_configured: 'warning',
  unknown: 'neutral',
}

/** The channel states: never claims a channel receives while its secret is unset. */
function ChannelStates({ t, status }: { t: T; status: InboxStatus }) {
  const ids = useId()
  const row = (key: StaffKey, state: string, note?: string) => (
    <li className="staff-queue__item" aria-label={`${t(key)}: ${codeLabel(t, 'inboundState', state)}`}>
      <div className="staff-queue__head">
        <h3 className="staff-queue__title">{t(key)}</h3>
        <StatusBadge tone={TONE[state] ?? 'neutral'}>{codeLabel(t, 'inboundState', state)}</StatusBadge>
      </div>
      {note ? <p className="staff-request__hint">{note}</p> : null}
    </li>
  )
  return (
    <Section id={`${ids}-channels`} title={t('inbox.channels')}>
      <ul className="staff-queue__items">
        {row(
          'inbox.channelSms',
          status.sms.inbound,
          status.sms.inbound === 'not_configured' ? t('inbox.notConfiguredSms') : undefined,
        )}
        {row(
          'inbox.channelEmail',
          status.email.inbound,
          status.email.inbound === 'not_configured' ? t('inbox.notConfiguredEmail') : undefined,
        )}
        {row(
          'inbox.emailBodies',
          status.email.bodyReading,
          status.email.bodyReading === 'not_configured'
            ? t('inbox.bodiesNotConfigured')
            : status.email.bodyReading === 'fake'
              ? t('inbox.bodiesFake')
              : undefined,
        )}
        {row(
          'inbox.replyTokens',
          status.email.replyTokens,
          status.email.replyTokens === 'not_configured' ? t('inbox.replyTokensNotConfigured') : undefined,
        )}
      </ul>
      {status.unsupported.count > 0 ? (
        <StateView kind="stale" title={t('inbox.unsupported', { count: status.unsupported.count })}>
          {t('inbox.unsupportedHint')}
        </StateView>
      ) : null}
    </Section>
  )
}

export function InboxScreen({ t, locale, fetchImpl, go, href }: Props) {
  const ids = useId()
  const [status, setStatus] = useState<InboxStatus | null | undefined>(undefined)
  const [conversations, setConversations] = useState<ConversationItem[] | null | undefined>(undefined)
  const [unmatched, setUnmatched] = useState<NeedsLinkingItem[] | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void call<InboxStatus>(fetchImpl, '/staff/inbox/status').then((r) => {
      if (!live) return
      const s = r.ok && r.data?.sms ? r.data : null
      setStatus(s)
      if (s && s.needsLinking !== null)
        void call<{ items: NeedsLinkingItem[] }>(fetchImpl, '/staff/inbox/needs-linking?limit=50').then((n) => {
          if (live) setUnmatched(n.ok && Array.isArray(n.data?.items) ? n.data.items : null)
        })
      else setUnmatched(undefined)
    })
    void call<{ items: ConversationItem[] }>(fetchImpl, '/staff/inbox/conversations?limit=50').then((r) => {
      if (live) setConversations(r.ok && Array.isArray(r.data?.items) ? r.data.items : null)
    })
    return () => {
      live = false
    }
  }, [fetchImpl])
  const when = formatter(locale)
  const link = linkTo(go, href)
  return (
    <section className="staff-screen staff-inbox" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('nav.inbox')}
      </h1>
      {status === undefined ? (
        <StateView kind="loading" title={t('common.loading')} />
      ) : status === null ? (
        <StateView kind="error" title={t('inbox.loadFailed')} />
      ) : (
        <ChannelStates t={t} status={status} />
      )}
      {status && status.needsLinking !== null ? (
        <Section id={`${ids}-needs`} title={t('inbox.needsLinking', { count: status.needsLinking })}>
          <p className="staff-request__hint">{t('inbox.needsLinkingIntro')}</p>
          {unmatched === undefined ? (
            <StateView kind="loading" title={t('common.loading')} />
          ) : unmatched === null ? (
            <StateView kind="error" title={t('inbox.loadFailed')} />
          ) : unmatched.length === 0 ? (
            <StateView kind="empty" title={t('inbox.needsLinkingEmpty')} />
          ) : (
            <ol className="staff-queue__items">
              {unmatched.map((m) => (
                <li key={m.id} className="staff-queue__item" aria-labelledby={`${ids}-${m.id}`}>
                  <div className="staff-queue__head">
                    <h3 id={`${ids}-${m.id}`} className="staff-queue__title">
                      {t('inbox.messageFrom', { channel: codeLabel(t, 'messageChannel', m.channel), from: m.from })}
                    </h3>
                    <StatusBadge tone="warning">{codeLabel(t, 'needsLinkingReason', m.reason)}</StatusBadge>
                  </div>
                  <ul className="staff-queue__facts">
                    <li>{when.format(new Date(m.receivedAt))}</li>
                    {m.subject ? <li>{m.subject}</li> : null}
                    {m.attachments ? <li>{t('inbox.attachmentsCount', { count: m.attachments })}</li> : null}
                    {m.suggestion ? <li>{t('inbox.suggested', { reference: m.suggestion.reference })}</li> : null}
                  </ul>
                  {m.preview ? <p className="staff-queue__reason">{m.preview}</p> : null}
                  <a className="hh-button staff-queue__action" {...link(`/inbox/${m.id}`)}>
                    {t('inbox.review')}
                  </a>
                </li>
              ))}
            </ol>
          )}
        </Section>
      ) : null}
      <Section id={`${ids}-conversations`} title={t('inbox.conversations')}>
        {conversations === undefined ? (
          <StateView kind="loading" title={t('common.loading')} />
        ) : conversations === null ? (
          <StateView kind="error" title={t('inbox.loadFailed')} />
        ) : conversations.length === 0 ? (
          <StateView kind="empty" title={t('inbox.conversationsEmpty')} />
        ) : (
          <ol className="staff-queue__items">
            {conversations.map((c) => (
              <li key={c.id} className="staff-queue__item" aria-labelledby={`${ids}-c-${c.id}`}>
                <div className="staff-queue__head">
                  <h3 id={`${ids}-c-${c.id}`} className="staff-queue__title">
                    {t('inbox.conversationTitle', { name: c.customer.displayName, reference: c.project.reference })}
                  </h3>
                  {c.awaitingReply ? <StatusBadge tone="info">{t('inbox.awaitingReply')}</StatusBadge> : null}
                </div>
                <ul className="staff-queue__facts">
                  {c.lastMessageAt ? <li>{when.format(new Date(c.lastMessageAt))}</li> : null}
                  {c.latest ? <li>{codeLabel(t, 'messageChannel', c.latest.channel)}</li> : null}
                </ul>
                {c.latest?.preview ? <p className="staff-queue__reason">{c.latest.preview}</p> : null}
                <a className="hh-button staff-queue__action" {...link(`/inbox/${c.id}`)}>
                  {t('inbox.openConversation')}
                </a>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </section>
  )
}

/** One write, with its idempotency key kept until it succeeds. */
function useWrite(fetchImpl: Fetch) {
  const keys = useRef(new Map<string, string>())
  return useCallback(
    async (path: string, body: unknown, version?: number) => {
      const k = keys.current.get(path) ?? idempotencyKey()
      keys.current.set(path, k)
      const r = await call<unknown>(fetchImpl, path, {
        method: 'POST',
        body,
        headers: { 'idempotency-key': k, ...(version === undefined ? {} : { 'if-match': `"${version}"` }) },
      })
      if (r.ok || r.status < 500) keys.current.delete(path)
      return r
    },
    [fetchImpl],
  )
}

function writeError(t: T, error: ApiErrorBody): string {
  if (error.code === 'STALE_VERSION') return t('inbox.stale')
  const codes = error.fieldErrors.map((f) => f.code)
  if (codes.includes('not_found')) return t('inbox.projectNotFound')
  if (codes.includes('card_number')) return t('inbox.cardNumber')
  if (codes.includes('ALREADY_ON_PROJECT')) return t('inbox.alreadyOnProject')
  if (codes.includes('CUSTOMER_MERGED')) return t('customer.merged')
  if (error.code === 'VALIDATION_FAILED') return t('inbox.invalid')
  if (error.code === 'FORBIDDEN') return t('shell.notAllowed')
  return t('request.saveFailed')
}

/** A conversation or a single inbound message, as the inbox and the action queue link to them: `/inbox/<id>`. */
export function InboxRecord(props: Props & { id: string }) {
  const { fetchImpl, id } = props
  const [found, setFound] = useState<
    | { kind: 'conversation'; data: Conversation }
    | { kind: 'message'; data: MessageDetail }
    | { kind: 'project'; data: ProjectConversation }
    | null
    | undefined
  >(undefined)
  const load = useCallback(async () => {
    const conversation = (conversationId: string) =>
      call<Conversation>(fetchImpl, `/staff/inbox/conversations/${encodeURIComponent(conversationId)}`)
    const c = await conversation(id)
    if (c.ok && typeof c.data?.id === 'string') return setFound({ kind: 'conversation', data: c.data })
    const m = await call<MessageDetail>(fetchImpl, `/staff/inbox/messages/${encodeURIComponent(id)}`)
    if (m.ok && typeof m.data?.id === 'string') return setFound({ kind: 'message', data: m.data })
    // TSK-0050: a project's own address (/inbox/<project id>): its conversation, or the composer that starts it.
    const p = await call<ProjectConversation>(fetchImpl, `/staff/inbox/projects/${encodeURIComponent(id)}/conversation`)
    if (p.ok && typeof p.data?.project?.id === 'string') {
      if (p.data.conversationId) {
        const pc = await conversation(p.data.conversationId)
        if (pc.ok && typeof pc.data?.id === 'string') return setFound({ kind: 'conversation', data: pc.data })
      } else return setFound({ kind: 'project', data: p.data })
    }
    setFound(null)
  }, [fetchImpl, id])
  const [replySent, setReplySent] = useState(false)
  useEffect(() => {
    void load()
  }, [load])
  if (found === undefined) return <StateView kind="loading" title={props.t('common.loading')} />
  if (found === null)
    return (
      <section className="staff-screen" aria-labelledby="staff-screen-title">
        <h1 id="staff-screen-title" className="hh-h3">
          {props.t('nav.inbox')}
        </h1>
        <StateView kind="empty" title={props.t('inbox.notFound')} />
      </section>
    )
  // The reply composer's confirmation outlives the reload that follows a Send (a first reply turns the project's
  // empty page into its conversation).
  const onReplySent = async () => {
    setReplySent(true)
    await load()
  }
  if (found.kind === 'project')
    return <NewConversationView {...props} view={found.data} replySent={replySent} onReplySent={onReplySent} />
  return found.kind === 'conversation' ? (
    <ConversationView {...props} view={found.data} reload={load} replySent={replySent} onReplySent={onReplySent} />
  ) : (
    <MessageView {...props} view={found.data} reload={load} />
  )
}

/** A project with no message yet: its heading and the composer that starts the conversation (TSK-0050). */
function NewConversationView({
  t,
  locale,
  fetchImpl,
  go,
  href,
  view,
  replySent,
  onReplySent,
}: Props & { view: ProjectConversation; replySent: boolean; onReplySent: () => Promise<void> }) {
  const link = linkTo(go, href)
  return (
    <section className="staff-screen staff-inbox" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('inbox.conversationHeading', { reference: view.project.reference })}
      </h1>
      <ul className="staff-queue__facts">
        <li>
          <a {...link(`/customers/${view.customer.id}`)}>{view.customer.displayName}</a>
        </li>
        <li>{codeLabel(t, 'projectState', view.project.state)}</li>
      </ul>
      <StateView kind="empty" title={t('inbox.newConversation')} />
      <ReplyComposer
        t={t}
        locale={locale}
        fetchImpl={fetchImpl}
        projectId={view.project.id}
        sent={replySent}
        onSent={onReplySent}
      />
    </section>
  )
}

type Draft = { text: string; channel: ReplyChannel | null; key: string | null }
const draftStore = (storeKey: string) => `hh.staff.replyDraft.${storeKey}`
function readDraft(storeKey: string): Draft {
  try {
    const raw = window.sessionStorage.getItem(draftStore(storeKey))
    const d = raw ? (JSON.parse(raw) as Partial<Draft>) : null
    if (d && typeof d.text === 'string')
      return {
        text: d.text,
        channel: d.channel === 'email' || d.channel === 'sms' ? d.channel : null,
        key: typeof d.key === 'string' ? d.key : null,
      }
  } catch {
    // Storage unavailable: the draft lives in this screen only.
  }
  return { text: '', channel: null, key: null }
}
function writeDraft(storeKey: string, d: Draft | null) {
  try {
    if (d && (d.text || d.key)) window.sessionStorage.setItem(draftStore(storeKey), JSON.stringify(d))
    else window.sessionStorage.removeItem(draftStore(storeKey))
  } catch {
    // Storage unavailable: nothing to keep.
  }
}

/**
 * The reply composer of a project (TSK-0050; HH-COM-08, HH-COM-09, OWN-DEC-120). TSK-0155 (OWN-DEC-211): with a
 * `proposalId`, the reviewer's English reply to a worker's proposed reply, sent only with the reviewer's explicit
 * approval; the worker's text is never sent.
 */
export function ReplyComposer({
  t,
  locale,
  fetchImpl,
  projectId,
  proposalId,
  sent = false,
  onSent,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  projectId: string
  proposalId?: string
  /** A reply was just sent from this screen (the confirmation survives the reload that follows). */
  sent?: boolean
  onSent: () => Promise<void>
}) {
  const ids = useId()
  const storeKey = proposalId ? `proposal.${proposalId}` : projectId
  const [options, setOptions] = useState<ReplyOptions | null | undefined>(undefined)
  const [draft, setDraftState] = useState<Draft>(() => readDraft(storeKey))
  const [approved, setApproved] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(sent ? t('inbox.reply.sent') : null)
  const setDraft = (next: Draft) => {
    setDraftState(next)
    writeDraft(storeKey, next)
  }
  const loadOptions = useCallback(async () => {
    const r = await call<ReplyOptions>(
      fetchImpl,
      `/staff/inbox/projects/${encodeURIComponent(projectId)}/reply-options`,
    )
    setOptions(r.ok && Array.isArray(r.data?.options) ? r.data : null)
  }, [fetchImpl, projectId])
  useEffect(() => {
    void loadOptions()
  }, [loadOptions])
  const when = formatter(locale)
  if (options === undefined) return <StateView kind="loading" title={t('common.loading')} />
  const heading = (
    <h2 id={`${ids}-reply`} className="staff-queue__heading">
      {t(proposalId ? 'proposal.review.replyHeading' : 'inbox.reply.heading')}
    </h2>
  )
  if (options === null)
    return (
      <section className="staff-request__section" aria-labelledby={`${ids}-reply`}>
        {heading}
        <StateView kind="error" title={t('inbox.loadFailed')} />
      </section>
    )
  const available = options.options.filter((o) => o.available)
  const preferred = options.options.find((o) => o.preferred) ?? null
  // The preferred channel while permitted; otherwise only what staff chose among the permitted ones.
  const channel: ReplyChannel | null =
    options.defaultChannel ??
    (draft.channel && available.some((o) => o.channel === draft.channel) ? draft.channel : null)
  // TSK-0122: the email goes at once at any hour; a text waits for the customer's permitted local hours.
  const text = options.deliveryHours.text
  const hoursWindow = { open: text.open ?? '', close: text.close ?? '', zone: text.zone ?? '' }
  const unknownZone = text.basis === 'unknown_zone_fallback'
  const textHours =
    text.state === 'not_configured'
      ? t('inbox.reply.textHoursNotConfigured')
      : text.state === 'open'
        ? t(unknownZone ? 'inbox.reply.textOpenUnknownZone' : 'inbox.reply.textOpen', hoursWindow)
        : t(unknownZone ? 'inbox.reply.textClosedUnknownZone' : 'inbox.reply.textClosed', {
            ...hoursWindow,
            time: when.format(new Date(text.sendAt)),
          })
  const hoursText =
    channel === 'sms'
      ? textHours
      : channel === 'email'
        ? t('inbox.reply.emailNow')
        : `${t('inbox.reply.emailNow')} ${textHours}`
  const reason = (o: ReplyOptions['options'][number]) => codeLabel(t, 'replyChannelReason', o.reason)
  async function send(e: FormEvent) {
    e.preventDefault()
    if (!channel || !draft.text.trim() || (proposalId && !approved)) return
    setPending(true)
    setError(null)
    setNotice(null)
    // One key per draft and channel: a retry of the same reply presents it again, so the server sends it once.
    const key = draft.key ?? idempotencyKey()
    const kept = { ...draft, channel, key }
    setDraft(kept)
    const r = await call<{ id: string }>(
      fetchImpl,
      proposalId
        ? `/staff/reply-proposals/${encodeURIComponent(proposalId)}/send`
        : `/staff/inbox/projects/${encodeURIComponent(projectId)}/replies`,
      {
        method: 'POST',
        body: proposalId ? { body: draft.text, channel, approveEnglish: true } : { body: draft.text, channel },
        headers: { 'idempotency-key': key },
      },
    )
    setPending(false)
    if (r.ok) {
      setDraft({ text: '', channel: null, key: null })
      setNotice(t('inbox.reply.sent'))
      await onSent()
      await loadOptions()
      return
    }
    // A refusal the server answered for certain made nothing: the next try is a new submission.
    if (r.status >= 400 && r.status < 500) setDraft({ ...kept, key: null })
    const codes = r.error.fieldErrors.map((f) => f.code)
    if (codes.includes('card_number')) return setError(t('inbox.cardNumber'))
    if (codes.includes('PROPOSAL_NOT_AWAITING_REVIEW')) {
      // TSK-0155: someone else rejected or sent it meanwhile; nothing was sent now.
      setError(t('proposal.review.notOpen'))
      await onSent()
      return
    }
    const conflict = codes.find((c) =>
      ['PREFERRED_CHANNEL_AVAILABLE', 'CHANNEL_UNAVAILABLE', 'NO_PERMITTED_CHANNEL', 'NO_CONTACT'].includes(c),
    )
    if (conflict) {
      setError(t('inbox.reply.channelChanged'))
      await loadOptions()
      return
    }
    if (r.error.code === 'FORBIDDEN') return setError(t('shell.notAllowed'))
    if (r.error.code === 'VALIDATION_FAILED') return setError(t('inbox.invalid'))
    setError(t('inbox.reply.keptDraft'))
  }
  const missing = channel ? options.templates[channel] === 'not_configured' : false
  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-reply`}>
      {heading}
      <p className="staff-request__hint">{t(proposalId ? 'proposal.review.replyIntro' : 'inbox.reply.intro')}</p>
      {!options.contact ? (
        <StateView kind="blocked" title={t('inbox.reply.noContact')} />
      ) : available.length === 0 ? (
        <StateView kind="blocked" title={t('inbox.reply.noChannel')} />
      ) : (
        <form className="staff-auth__form" onSubmit={(e) => void send(e)} noValidate>
          <p className="staff-request__hint">{t('inbox.reply.to', { name: options.contact.name })}</p>
          {options.preferred === 'call' ? (
            <p className="staff-request__hint">{t('inbox.reply.preferredCall')}</p>
          ) : preferred && !preferred.available ? (
            <StateView
              kind="stale"
              title={t('inbox.reply.preferredUnavailable', {
                channel: codeLabel(t, 'messageChannel', preferred.channel),
                reason: reason(preferred),
              })}
            />
          ) : null}
          <fieldset className="staff-request__check">
            <legend>{t('inbox.reply.channel')}</legend>
            <div className="staff-request__outcomes">
              {options.options.map((o) => (
                <label key={o.channel}>
                  <input
                    type="radio"
                    name={`${ids}-channel`}
                    value={o.channel}
                    checked={channel === o.channel}
                    // While the preferred channel is permitted it is the only choice (no silent switch).
                    disabled={!o.available || (options.defaultChannel !== null && options.defaultChannel !== o.channel)}
                    onChange={() => setDraft({ ...draft, channel: o.channel, key: null })}
                  />{' '}
                  {t(o.channel === 'email' ? 'inbox.reply.channelEmail' : 'inbox.reply.channelSms', {
                    destination: o.destination,
                  })}
                  {o.preferred ? ` · ${t('inbox.reply.preferred')}` : ''}
                  {o.available ? '' : ` · ${reason(o)}`}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="staff-request__hint" data-testid="reply-hours">
            {hoursText}
          </p>
          {missing ? (
            <StateView
              kind="stale"
              title={t(channel === 'sms' ? 'inbox.reply.templateMissingSms' : 'inbox.reply.templateMissingEmail')}
            />
          ) : null}
          <Field
            label={t('inbox.reply.label')}
            hint={t('inbox.reply.hint', { max: options.maxLength })}
            name="reply"
            multiline
            rows={4}
            maxLength={options.maxLength}
            value={draft.text}
            onChange={(e) => setDraft({ ...draft, text: e.target.value, key: null })}
          />
          {proposalId ? (
            // TSK-0155 (OWN-DEC-211 4, 6): the reviewer's explicit approval of the English customer message.
            <label className="staff-request__check" data-testid="proposal-approve-english">
              <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} />{' '}
              {t('proposal.review.approveEnglish')}
            </label>
          ) : null}
          {error ? <StateView kind="error" title={error} /> : null}
          {notice ? (
            <p role="status" className="staff-request__hint">
              {notice}
            </p>
          ) : null}
          <Button
            type="submit"
            pending={pending}
            {...(!draft.text.trim()
              ? { disabledReason: t('inbox.reply.empty') }
              : !channel
                ? { disabledReason: t('inbox.reply.chooseChannel') }
                : proposalId && !approved
                  ? { disabledReason: t('proposal.review.approveFirst') }
                  : {})}
          >
            {t('inbox.reply.send')}
          </Button>
        </form>
      )}
    </section>
  )
}

function bodyNote(t: T, m: { bodyState: string; bodyTruncated: boolean }): string | null {
  if (m.bodyState === 'received') return m.bodyTruncated ? t('inbox.truncated') : null
  return codeLabel(t, 'bodyState', m.bodyState)
}

/** A staff reply's email or text (TSK-0050): its state, when it sends, why it was not sent, and Retry. */
function ReplyDelivery({
  t,
  when,
  m,
  onRetry,
}: {
  t: T
  when: Intl.DateTimeFormat
  m: ThreadMessage
  onRetry?: (deliveryId: string) => Promise<void>
}) {
  const d = m.delivery
  const [pending, setPending] = useState(false)
  if (!d) return null
  return (
    <div className="staff-inbox__delivery">
      <p className="staff-queue__reason">
        {t('inbox.reply.deliveryLine', {
          channel: codeLabel(t, 'messageChannel', m.channel),
          to: m.to[0] ?? '',
        })}{' '}
        <StatusBadge tone={d.state === 'failed' ? 'danger' : d.state === 'suppressed' ? 'warning' : 'neutral'}>
          {codeLabel(t, 'deliveryState', d.state)}
        </StatusBadge>
      </p>
      {d.state === 'queued' && d.sendAt ? (
        <p className="staff-queue__reason">{t('inbox.reply.sendsAt', { time: when.format(new Date(d.sendAt)) })}</p>
      ) : null}
      {d.errorCode ? <p className="staff-queue__masked">{codeLabel(t, 'deliveryError', d.errorCode)}</p> : null}
      {d.retry && onRetry ? (
        <Button
          variant="secondary"
          pending={pending}
          onClick={() => {
            setPending(true)
            void onRetry(d.id).finally(() => setPending(false))
          }}
        >
          {t('queue.retry')}
        </Button>
      ) : null}
    </div>
  )
}

function MessageCard({
  t,
  when,
  m,
  onRetry,
}: {
  t: T
  when: Intl.DateTimeFormat
  m: ThreadMessage
  onRetry?: (deliveryId: string) => Promise<void>
}) {
  const ids = useId()
  const author =
    m.author.kind === 'staff'
      ? (m.author.name ?? t('inbox.staffMember'))
      : m.author.kind === 'contact'
        ? (m.author.name ?? m.from ?? '')
        : t('inbox.unknownSender', { from: m.from ?? '' })
  const note = bodyNote(t, m)
  return (
    <li className="staff-queue__item" aria-labelledby={`${ids}-h`}>
      <div className="staff-queue__head">
        <h3 id={`${ids}-h`} className="staff-queue__title">
          {author}
        </h3>
        <StatusBadge>{codeLabel(t, 'messageChannel', m.channel)}</StatusBadge>
        {m.keyword ? <StatusBadge tone="warning">{codeLabel(t, 'smsKeyword', m.keyword)}</StatusBadge> : null}
      </div>
      <ul className="staff-queue__facts">
        <li>{when.format(new Date(m.receivedAt))}</li>
        {m.direction === 'inbound' ? <li>{codeLabel(t, 'linkState', m.linkState)}</li> : null}
        {m.matchRule && m.direction === 'inbound' ? <li>{codeLabel(t, 'matchRule', m.matchRule)}</li> : null}
      </ul>
      {m.subject ? <p className="staff-queue__reason">{t('inbox.subject', { subject: m.subject })}</p> : null}
      {m.body !== null ? <p className="staff-inbox__body">{m.body}</p> : null}
      {note ? <p className="staff-queue__masked">{note}</p> : null}
      {m.attachments.length ? (
        <p className="staff-queue__masked">{t('inbox.attachmentsNotImported', { count: m.attachments.length })}</p>
      ) : null}
      {m.direction === 'outbound' ? <ReplyDelivery t={t} when={when} m={m} {...(onRetry ? { onRetry } : {})} /> : null}
      {m.proposal ? (
        // TSK-0155 (OWN-DEC-211 5): the worker's original, kept internally beside the reply sent from it.
        <div className="staff-inbox__proposal" data-testid="reply-proposal-original">
          <p className="staff-queue__masked">
            {t('proposal.originalOf', { name: m.proposal.author.name ?? t('inbox.staffMember') })}
          </p>
          <p className="staff-inbox__body" lang="">
            {m.proposal.originalText}
          </p>
        </div>
      ) : null}
    </li>
  )
}

function ConversationView({
  t,
  locale,
  fetchImpl,
  go,
  href,
  view,
  reload,
  replySent = false,
  onReplySent,
}: Props & {
  view: Conversation
  reload: () => Promise<void>
  replySent?: boolean
  onReplySent?: () => Promise<void>
}) {
  const ids = useId()
  const write = useWrite(fetchImpl)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<'handled' | 'internal' | null>(null)
  const when = formatter(locale)
  const link = linkTo(go, href)
  async function handled() {
    setPending('handled')
    setError(null)
    const r = await write(`/staff/inbox/conversations/${view.id}/handled`, {})
    setPending(null)
    if (!r.ok) return setError(writeError(t, r.error))
    await reload()
  }
  async function retry(deliveryId: string) {
    setError(null)
    const r = await write(`/staff/message-deliveries/${encodeURIComponent(deliveryId)}/retry`, {})
    if (!r.ok) return setError(writeError(t, r.error))
    await reload()
  }
  async function addInternal(e: FormEvent) {
    e.preventDefault()
    setPending('internal')
    setError(null)
    const r = await write(`/staff/inbox/projects/${view.project.id}/internal-messages`, { body: draft })
    setPending(null)
    if (!r.ok) return setError(writeError(t, r.error))
    setDraft('')
    await reload()
  }
  return (
    <section className="staff-screen staff-inbox" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('inbox.conversationHeading', { reference: view.project.reference })}
      </h1>
      <ul className="staff-queue__facts">
        <li>
          <a {...link(`/customers/${view.customer.id}`)}>{view.customer.displayName}</a>
        </li>
        <li>{codeLabel(t, 'projectState', view.project.state)}</li>
        {view.handledAt ? <li>{t('inbox.handledAt', { date: when.format(new Date(view.handledAt)) })}</li> : null}
      </ul>
      {error ? <StateView kind="error" title={error} /> : null}
      {view.awaitingReply ? (
        <div className="hh-button-row">
          <Button variant="secondary" pending={pending === 'handled'} onClick={() => void handled()}>
            {t('inbox.markHandled')}
          </Button>
        </div>
      ) : null}
      <Section id={`${ids}-customer`} title={t('inbox.customerMessages')}>
        <p className="staff-request__hint">{t('inbox.customerMessagesIntro')}</p>
        {view.messages.length === 0 ? (
          <StateView kind="empty" title={t('inbox.noMessages')} />
        ) : (
          <ol className="staff-queue__items">
            {view.messages.map((m) => (
              <MessageCard key={m.id} t={t} when={when} m={m} onRetry={retry} />
            ))}
          </ol>
        )}
      </Section>
      <ReplyComposer
        t={t}
        locale={locale}
        fetchImpl={fetchImpl}
        projectId={view.project.id}
        sent={replySent}
        onSent={onReplySent ?? reload}
      />
      <Section id={`${ids}-deliveries`} title={t('inbox.notifications')}>
        {view.deliveries.length === 0 ? (
          <StateView kind="empty" title={t('inbox.noNotifications')} />
        ) : (
          <ul className="staff-queue__items">
            {view.deliveries.map((d) => (
              <li key={d.id} className="staff-queue__item">
                <div className="staff-queue__head">
                  <code>{d.messageKey}</code>
                  <StatusBadge>{codeLabel(t, 'messageChannel', d.channel)}</StatusBadge>
                  <StatusBadge tone={d.state === 'failed' ? 'danger' : 'neutral'}>
                    {codeLabel(t, 'deliveryState', d.state)}
                  </StatusBadge>
                </div>
                <p className="staff-queue__reason">{when.format(new Date(d.at))}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>
      <Section id={`${ids}-internal`} title={t('inbox.internal')}>
        <p className="staff-request__hint">{t('inbox.internalIntro')}</p>
        {view.internal.messages.length === 0 ? (
          <StateView kind="empty" title={t('inbox.noInternal')} />
        ) : (
          <ol className="staff-queue__items">
            {view.internal.messages.map((m) => (
              <MessageCard key={m.id} t={t} when={when} m={m} />
            ))}
          </ol>
        )}
        <form className="staff-auth__form" onSubmit={(e) => void addInternal(e)} noValidate>
          <Field
            label={t('inbox.internalNew')}
            hint={t('inbox.internalHint')}
            name="body"
            multiline
            rows={3}
            maxLength={5000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button
            type="submit"
            pending={pending === 'internal'}
            {...(draft.trim() ? {} : { disabledReason: t('inbox.internalEmpty') })}
          >
            {t('inbox.internalAdd')}
          </Button>
        </form>
      </Section>
    </section>
  )
}

function MessageView({
  t,
  locale,
  fetchImpl,
  go,
  href,
  view,
  reload,
}: Props & { view: MessageDetail; reload: () => Promise<void> }) {
  const ids = useId()
  const write = useWrite(fetchImpl)
  const [reference, setReference] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const when = formatter(locale)
  const link = linkTo(go, href)
  async function submit(target: string | null) {
    setPending(true)
    setError(null)
    const r = await write(
      `/staff/inbox/messages/${view.id}/link`,
      { projectReference: target, reason: reason.trim() },
      view.version,
    )
    setPending(false)
    if (!r.ok) return setError(writeError(t, r.error))
    setReason('')
    setReference('')
    await reload()
  }
  const note = bodyNote(t, view)
  return (
    <section className="staff-screen staff-inbox" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('inbox.messageFrom', { channel: codeLabel(t, 'messageChannel', view.channel), from: view.from ?? '' })}
      </h1>
      <ul className="staff-queue__facts">
        <li>{when.format(new Date(view.receivedAt))}</li>
        <li>
          <StatusBadge tone={view.linkState === 'needs_linking' ? 'warning' : 'success'}>
            {codeLabel(t, 'linkState', view.linkState)}
          </StatusBadge>
        </li>
        {view.reason ? <li>{codeLabel(t, 'needsLinkingReason', view.reason)}</li> : null}
        {view.project ? (
          <li>
            {view.conversationId ? (
              <a {...link(`/inbox/${view.conversationId}`)}>
                {t('inbox.onProject', { reference: view.project.reference })}
              </a>
            ) : (
              t('inbox.onProject', { reference: view.project.reference })
            )}
          </li>
        ) : null}
      </ul>
      <Section id={`${ids}-original`} title={t('inbox.original')}>
        <p className="staff-request__hint">{t('inbox.originalIntro')}</p>
        {view.subject ? <p className="staff-queue__reason">{t('inbox.subject', { subject: view.subject })}</p> : null}
        {view.body !== null ? <p className="staff-inbox__body">{view.body}</p> : null}
        {note ? <p className="staff-queue__masked">{note}</p> : null}
        {view.attachments.length ? (
          <p className="staff-queue__masked">{t('inbox.attachmentsNotImported', { count: view.attachments.length })}</p>
        ) : null}
      </Section>
      <Section
        id={`${ids}-link`}
        title={view.linkState === 'needs_linking' ? t('inbox.linkHeading') : t('inbox.correctHeading')}
      >
        <p className="staff-request__hint">{t('inbox.linkIntro')}</p>
        {view.candidates.length ? (
          <ul className="staff-queue__items" aria-label={t('inbox.candidates')}>
            {view.candidates.map((c) => (
              <li key={c.projectId} className="staff-queue__item" aria-label={`${c.reference} ${c.customerName}`}>
                <div className="staff-queue__head">
                  <h3 className="staff-queue__title">
                    {t('inbox.candidate', { reference: c.reference, name: c.customerName })}
                  </h3>
                  {c.suggested ? <StatusBadge tone="info">{t('inbox.candidateSuggested')}</StatusBadge> : null}
                  <StatusBadge tone={c.verifiedContact ? 'success' : 'neutral'}>
                    {c.verifiedContact ? t('inbox.candidateVerified') : t('inbox.candidateUnverified')}
                  </StatusBadge>
                </div>
                <ul className="staff-queue__facts">
                  <li>{codeLabel(t, 'projectState', c.state)}</li>
                </ul>
                <Button variant="quiet" onClick={() => setReference(c.reference)}>
                  {t('inbox.useCandidate', { reference: c.reference })}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="staff-request__hint">{t('inbox.noCandidates')}</p>
        )}
        {error ? <StateView kind="error" title={error} /> : null}
        <form
          className="staff-auth__form"
          onSubmit={(e) => {
            e.preventDefault()
            void submit(reference.trim().toUpperCase())
          }}
          noValidate
        >
          <Field
            label={t('inbox.projectReference')}
            hint={t('inbox.projectReferenceHint')}
            name="projectReference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <Field
            label={t('inbox.linkReason')}
            name="reason"
            multiline
            rows={2}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="hh-button-row">
            <Button
              type="submit"
              pending={pending}
              {...(reference.trim() && reason.trim() ? {} : { disabledReason: t('inbox.linkNeeds') })}
            >
              {t('inbox.link')}
            </Button>
            {view.linkState !== 'needs_linking' ? (
              <Button
                variant="secondary"
                pending={pending}
                {...(reason.trim() ? {} : { disabledReason: t('inbox.reasonNeeded') })}
                onClick={() => void submit(null)}
              >
                {t('inbox.returnToNeedsLinking')}
              </Button>
            ) : null}
          </div>
        </form>
      </Section>
      <Section id={`${ids}-history`} title={t('inbox.history')}>
        <ol className="staff-queue__items">
          {view.history.map((h, i) => (
            <li key={i} className="staff-queue__item">
              <p className="staff-queue__reason">
                {h.toReference
                  ? t('inbox.historyLinked', {
                      state: codeLabel(t, 'linkState', h.toState),
                      reference: h.toReference,
                    })
                  : codeLabel(t, 'linkState', h.toState)}
              </p>
              <ul className="staff-queue__facts">
                <li>{when.format(new Date(h.at))}</li>
                <li>
                  {h.staff
                    ? t('inbox.historyBy', { name: h.staff.name ?? t('inbox.staffMember') })
                    : t('inbox.historyAutomatic')}
                </li>
                <li>
                  {h.toState === 'needs_linking'
                    ? codeLabel(t, 'needsLinkingReason', h.rule)
                    : codeLabel(t, 'matchRule', h.rule)}
                </li>
              </ul>
              {h.reason ? (
                <p className="staff-queue__reason">{t('inbox.historyReason', { reason: h.reason })}</p>
              ) : null}
            </li>
          ))}
        </ol>
      </Section>
    </section>
  )
}
