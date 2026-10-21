// The unified inbox in the staff app (TSK-0049; HH-COM-07, HH-COM-10, HH-COM-01, OWN-DEC-120, S06). The inbox shows
// each inbound channel's truthful state ("Inbound not configured" while its webhook secret is unset), the customer
// conversations with their projects, and, for Owner and Office only, the private Needs Linking list. A conversation
// shows the customer's email and texts exactly as received, the project's customer notifications as delivery states,
// and the separate internal conversation. A Needs Linking message is linked to a project with a written reason; the
// message itself never changes. Staff text is English or Spanish (staff catalogs); the server decides every read and
// write.
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
    { kind: 'conversation'; data: Conversation } | { kind: 'message'; data: MessageDetail } | null | undefined
  >(undefined)
  const load = useCallback(async () => {
    const c = await call<Conversation>(fetchImpl, `/staff/inbox/conversations/${encodeURIComponent(id)}`)
    if (c.ok && typeof c.data?.id === 'string') return setFound({ kind: 'conversation', data: c.data })
    const m = await call<MessageDetail>(fetchImpl, `/staff/inbox/messages/${encodeURIComponent(id)}`)
    if (m.ok && typeof m.data?.id === 'string') return setFound({ kind: 'message', data: m.data })
    setFound(null)
  }, [fetchImpl, id])
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
  return found.kind === 'conversation' ? (
    <ConversationView {...props} view={found.data} reload={load} />
  ) : (
    <MessageView {...props} view={found.data} reload={load} />
  )
}

function bodyNote(t: T, m: { bodyState: string; bodyTruncated: boolean }): string | null {
  if (m.bodyState === 'received') return m.bodyTruncated ? t('inbox.truncated') : null
  return codeLabel(t, 'bodyState', m.bodyState)
}

function MessageCard({ t, when, m }: { t: T; when: Intl.DateTimeFormat; m: ThreadMessage }) {
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
}: Props & { view: Conversation; reload: () => Promise<void> }) {
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
              <MessageCard key={m.id} t={t} when={when} m={m} />
            ))}
          </ol>
        )}
      </Section>
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
