// The message delivery screen (TSK-0119; HH-COM-14, HH-COM-13, HH-COM-02, OWN-DEC-152 sections 9 and 14). Two tabs:
// - Deliveries: every outgoing message the server lets this staff member see, with its lifecycle state, template and
//   version, channel and masked destination, created, due, provider-accepted and status times, attempts and their
//   history, the failure reason and the names of missing values, and a Retry where the server offers one. A message a
//   test provider intercepted says so and is never shown as delivered; nothing is shown as read.
// - Templates: each message's owner template ID, classification, release authority and its released versions with
//   their readiness (ready, NOT CONFIGURED, values not wired yet), a preview with sample values (the subject, the
//   plain text and the email itself in a sandboxed frame), and the variable registry.
// The server decides what is listed and whether a Retry is allowed (RULE-SERVER-AUTHZ); this screen only shows it.
import { type StaffKey, type StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge, Tabs, type StatusTone } from '@handyhub/ui'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { call, idempotencyKey, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

export type Delivery = {
  id: string
  messageKey: string
  templateId: string | null
  templateVersion: number | null
  layoutVersion: number | null
  channel: 'email' | 'sms'
  audience: 'customer' | 'staff'
  release: 'automatic' | 'staff_released'
  lifecycle: string
  intercepted: boolean
  destination: string
  project: { id: string; reference: string } | null
  createdAt: string
  queuedAt: string | null
  scheduledAt: string | null
  sentAt: string | null
  statusAt: string | null
  attempts: number
  errorCode: string | null
  missingVariables: string[]
  consentDecision: string | null
  retryAvailable: boolean
  history: { attempt: number; state: string; errorCode: string | null; at: string }[]
}

export type TemplateVersion = {
  channel: 'email' | 'sms'
  locale: 'en' | 'es'
  version: number | null
  releasedAt: string | null
  translationReview: 'source' | 'ai_reviewed' | null
  readiness: 'ready' | 'not_configured' | 'not_wired'
  unwired: string[]
  sourceIds: string[]
}
export type TemplateEntry = {
  messageKey: string
  templateId: string | null
  audience: 'customer' | 'staff'
  channels: ('email' | 'sms')[]
  category: string
  release: 'automatic' | 'staff' | 'owner'
  variables: string[]
  versions: TemplateVersion[]
}
export type VariableEntry = {
  name: string
  kind: string
  meaning: string
  source: string
  subject: boolean
  required: boolean
  fallback: string | null
  sensitive: boolean
  customerForbidden: boolean
}
export type Preview = {
  messageKey: string
  templateId: string | null
  version: number
  channel: 'email' | 'sms'
  locale: 'en' | 'es'
  subject: string | null
  text: string
  html: string | null
  sample: true
}

type Page = { items: Delivery[]; nextCursor: string | null }
type Filters = { group: string; reference: string }
const NO_FILTERS: Filters = { group: '', reference: '' }
const GROUPS = ['waiting', 'sent', 'failed', 'stopped'] as const

/** The list's query string: only the filters that are set, and the cursor of the next page. */
export function deliveriesQuery(filters: Filters, cursor?: string): string {
  const q = new URLSearchParams()
  if (filters.group) q.set('group', filters.group)
  if (filters.reference.trim()) q.set('reference', filters.reference.trim().toUpperCase())
  if (cursor) q.set('cursor', cursor)
  const s = q.toString()
  return s ? `/staff/message-deliveries?${s}` : '/staff/message-deliveries'
}

const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')

const TONE: Record<string, StatusTone> = {
  DELIVERED: 'success',
  PROVIDER_ACCEPTED: 'info',
  FAILED: 'danger',
  SUPPRESSED: 'warning',
  CANCELLED: 'neutral',
  EXPIRED: 'neutral',
  PENDING_APPROVAL: 'warning',
}
const READY_TONE: Record<TemplateVersion['readiness'], StatusTone> = {
  ready: 'success',
  not_configured: 'neutral',
  not_wired: 'warning',
}

export function MessagesScreen({ t, locale, fetchImpl }: { t: T; locale: StaffLocale; fetchImpl: Fetch }) {
  return (
    <section className="staff-screen staff-messages" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('nav.messages')}
      </h1>
      <Tabs
        label={t('messages.tabs')}
        tabs={[
          {
            id: 'deliveries',
            label: t('messages.tab.deliveries'),
            content: <Deliveries t={t} locale={locale} fetchImpl={fetchImpl} />,
          },
          {
            id: 'templates',
            label: t('messages.tab.templates'),
            content: <Templates t={t} fetchImpl={fetchImpl} />,
          },
        ]}
      />
    </section>
  )
}

function Deliveries({ t, locale, fetchImpl }: { t: T; locale: StaffLocale; fetchImpl: Fetch }) {
  const ids = useId()
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [draft, setDraft] = useState<Filters>(NO_FILTERS)
  const [items, setItems] = useState<Delivery[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [more, setMore] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let live = true
    setStatus('loading')
    void call<Page>(fetchImpl, deliveriesQuery(filters)).then((r) => {
      if (!live) return
      if (!r.ok) return setStatus('error')
      setItems(r.data.items)
      setCursor(r.data.nextCursor)
      setStatus('ready')
    })
    return () => {
      live = false
    }
  }, [fetchImpl, filters, reload])

  async function loadMore() {
    if (!cursor) return
    setMore(true)
    const r = await call<Page>(fetchImpl, deliveriesQuery(filters, cursor))
    setMore(false)
    if (!r.ok) return setStatus('error')
    setItems((current) => [...current, ...r.data.items])
    setCursor(r.data.nextCursor)
  }

  const fmt = new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' })
  const time = (iso: string) => fmt.format(new Date(iso))

  return (
    <>
      <p>{t('messages.intro')}</p>
      <form
        className="staff-queue__filters"
        aria-label={t('messages.filter.label')}
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          setFilters(draft)
        }}
      >
        <div className="staff-queue__select">
          <label htmlFor={`${ids}-group`}>{t('messages.filter.group')}</label>
          <select
            id={`${ids}-group`}
            value={draft.group}
            onChange={(e) => setDraft({ ...draft, group: e.target.value })}
          >
            <option value="">{t('messages.filter.any')}</option>
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                {codeLabel(t, 'messageGroup', g)}
              </option>
            ))}
          </select>
        </div>
        <Field
          label={t('messages.filter.reference')}
          name="reference"
          value={draft.reference}
          onChange={(e) => setDraft({ ...draft, reference: e.currentTarget.value })}
        />
        <Button type="submit" variant="secondary">
          {t('messages.filter.apply')}
        </Button>
        <Button
          variant="quiet"
          onClick={() => {
            setDraft(NO_FILTERS)
            setFilters(NO_FILTERS)
          }}
        >
          {t('messages.filter.clear')}
        </Button>
      </form>
      {status === 'loading' ? (
        <StateView kind="loading" title={t('common.loading')} />
      ) : status === 'error' ? (
        <StateView kind="error" title={t('messages.loadFailed')} />
      ) : items.length === 0 ? (
        <StateView kind="empty" title={t('messages.empty')} />
      ) : (
        <ol className="staff-queue__items" aria-label={t('messages.list')}>
          {items.map((d) => (
            <li
              key={d.id}
              className="staff-queue__item"
              aria-labelledby={`${ids}-${d.id}`}
              data-message-key={d.messageKey}
              data-lifecycle={d.lifecycle}
            >
              <div className="staff-queue__head">
                <h2 id={`${ids}-${d.id}`} className="staff-queue__title">
                  <code>{d.messageKey}</code>
                </h2>
                <StatusBadge tone={TONE[d.lifecycle] ?? 'neutral'}>
                  {codeLabel(t, 'messageLifecycle', d.lifecycle)}
                </StatusBadge>
                {d.intercepted ? <StatusBadge tone="info">{t('messages.item.intercepted')}</StatusBadge> : null}
              </div>
              <ul className="staff-queue__facts">
                <li>
                  {t('messages.item.destination', {
                    channel: codeLabel(t, 'deliveryChannel', d.channel),
                    destination: d.destination,
                  })}
                </li>
                <li>{d.release === 'automatic' ? t('messages.item.automatic') : t('messages.item.staffReleased')}</li>
                <li>
                  {d.project
                    ? t('messages.item.project', { reference: d.project.reference })
                    : t('messages.item.noProject')}
                </li>
                <li>
                  {d.templateVersion !== null
                    ? t('messages.item.template', {
                        templateId: d.templateId ?? d.messageKey,
                        version: d.templateVersion,
                      })
                    : t('messages.item.noTemplate')}
                </li>
                <li>{t('messages.item.created', { time: time(d.createdAt) })}</li>
                {d.scheduledAt ? <li>{t('messages.item.scheduled', { time: time(d.scheduledAt) })}</li> : null}
                {d.sentAt ? <li>{t('messages.item.sent', { time: time(d.sentAt) })}</li> : null}
                {d.statusAt ? <li>{t('messages.item.status', { time: time(d.statusAt) })}</li> : null}
                <li>{t('messages.item.attempts', { count: d.attempts })}</li>
                {d.errorCode ? <li>{codeLabel(t, 'deliveryError', d.errorCode)}</li> : null}
                {d.missingVariables.length > 0 ? (
                  <li>{t('messages.item.missing', { names: d.missingVariables.join(', ') })}</li>
                ) : null}
              </ul>
              {d.history.length > 0 ? (
                <details>
                  <summary>{t('messages.item.history')}</summary>
                  <ol>
                    {d.history.map((h) => (
                      <li key={h.attempt}>
                        {t('messages.item.historyEntry', {
                          attempt: h.attempt,
                          state: codeLabel(t, 'deliveryState', h.state),
                          time: time(h.at),
                        })}
                        {h.errorCode ? ` (${codeLabel(t, 'deliveryError', h.errorCode)})` : ''}
                      </li>
                    ))}
                  </ol>
                </details>
              ) : null}
              {d.retryAvailable ? (
                <RetryButton t={t} id={d.id} fetchImpl={fetchImpl} onRetried={() => setReload((n) => n + 1)} />
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {cursor && status === 'ready' ? (
        <Button variant="secondary" pending={more} onClick={() => void loadMore()}>
          {t('queue.loadMore')}
        </Button>
      ) : null}
    </>
  )
}

function RetryButton({ t, id, fetchImpl, onRetried }: { t: T; id: string; fetchImpl: Fetch; onRetried: () => void }) {
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<'queued' | 'failed' | null>(null)
  const retry = async () => {
    setPending(true)
    const r = await call<unknown>(fetchImpl, `/staff/message-deliveries/${encodeURIComponent(id)}/retry`, {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey() },
    })
    setPending(false)
    setOutcome(r.ok ? 'queued' : 'failed')
    if (r.ok) onRetried()
  }
  return (
    <>
      <Button variant="secondary" pending={pending} onClick={() => void retry()}>
        {t('messages.item.retry')}
      </Button>
      {outcome ? (
        <p role="status">{outcome === 'queued' ? t('messages.item.retried') : t('messages.item.retryFailed')}</p>
      ) : null}
    </>
  )
}

function Templates({ t, fetchImpl }: { t: T; fetchImpl: Fetch }) {
  const ids = useId()
  const [data, setData] = useState<{ templates: TemplateEntry[]; variables: VariableEntry[] } | null | 'error'>(null)
  const [shown, setShown] = useState<{ messageKey: string; channel: string; locale: string } | null>(null)

  useEffect(() => {
    let live = true
    void call<{ templates: TemplateEntry[]; variables: VariableEntry[] }>(fetchImpl, '/staff/message-templates').then(
      (r) => {
        if (live) setData(r.ok ? r.data : 'error')
      },
    )
    return () => {
      live = false
    }
  }, [fetchImpl])

  if (data === null) return <StateView kind="loading" title={t('common.loading')} />
  if (data === 'error') return <StateView kind="error" title={t('messages.templates.loadFailed')} />
  return (
    <>
      <p>{t('messages.templates.intro')}</p>
      {shown ? <PreviewPanel t={t} fetchImpl={fetchImpl} {...shown} onClose={() => setShown(null)} /> : null}
      <ol className="staff-queue__items" aria-label={t('messages.templates.list')}>
        {data.templates.map((m) => (
          <li
            key={m.messageKey}
            className="staff-queue__item"
            aria-labelledby={`${ids}-${m.messageKey}`}
            data-template-key={m.messageKey}
          >
            <div className="staff-queue__head">
              <h2 id={`${ids}-${m.messageKey}`} className="staff-queue__title">
                <code>{m.messageKey}</code>
              </h2>
              <StatusBadge tone="info">{codeLabel(t, 'messageRelease', m.release)}</StatusBadge>
            </div>
            <ul className="staff-queue__facts">
              <li>
                {m.templateId
                  ? t('messages.templates.templateId', { id: m.templateId })
                  : t('messages.templates.noTemplateId')}
              </li>
              <li>{codeLabel(t, 'messageCategory', m.category)}</li>
            </ul>
            <ul className="staff-queue__facts">
              {m.versions.map((v) => {
                const channel = codeLabel(t, 'deliveryChannel', v.channel)
                const lang = v.locale.toUpperCase()
                return (
                  <li key={`${v.channel}-${v.locale}`}>
                    {v.version !== null
                      ? t('messages.templates.version', { channel, locale: lang, version: v.version })
                      : t('messages.templates.noVersion', { channel, locale: lang })}{' '}
                    <StatusBadge tone={READY_TONE[v.readiness]}>
                      {codeLabel(t, 'messageReadiness', v.readiness)}
                    </StatusBadge>
                    {v.translationReview === 'ai_reviewed' ? ` ${t('messages.templates.aiReviewed')}` : ''}
                    {v.unwired.length > 0 ? ` ${t('messages.templates.unwired', { names: v.unwired.join(', ') })}` : ''}
                    {v.version !== null ? (
                      <>
                        {' '}
                        <Button
                          variant="quiet"
                          onClick={() => setShown({ messageKey: m.messageKey, channel: v.channel, locale: v.locale })}
                        >
                          {t('messages.templates.preview')}
                        </Button>
                      </>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ol>
      <section aria-labelledby={`${ids}-variables`}>
        <h2 id={`${ids}-variables`} className="staff-queue__title">
          {t('messages.variables.title')}
        </h2>
        <p>{t('messages.variables.intro')}</p>
        <dl className="staff-system__fields">
          {data.variables.map((v) => (
            <div key={v.name}>
              <dt>
                <code>{`{${v.name}}`}</code>
              </dt>
              <dd>
                {v.meaning}.{' '}
                {v.required
                  ? t('messages.variables.required')
                  : t('messages.variables.optional', { fallback: v.fallback ?? '' })}
                {v.subject ? `; ${t('messages.variables.subject')}` : ''}
                {v.sensitive ? `; ${t('messages.variables.sensitive')}` : ''}
                {v.customerForbidden ? `; ${t('messages.variables.customerForbidden')}` : ''}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  )
}

function PreviewPanel({
  t,
  fetchImpl,
  messageKey,
  channel,
  locale,
  onClose,
}: {
  t: T
  fetchImpl: Fetch
  messageKey: string
  channel: string
  locale: string
  onClose: () => void
}) {
  const ids = useId()
  const [preview, setPreview] = useState<Preview | null | 'error'>(null)
  const query = `channel=${encodeURIComponent(channel)}&locale=${encodeURIComponent(locale)}`
  const path = `/staff/message-templates/${encodeURIComponent(messageKey)}/preview`
  useEffect(() => {
    let live = true
    setPreview(null)
    void call<Preview>(fetchImpl, `${path}?${query}`).then((r) => {
      if (live) setPreview(r.ok ? r.data : 'error')
    })
    return () => {
      live = false
    }
  }, [fetchImpl, path, query])
  return (
    <section className="staff-messages__preview" aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`} className="staff-queue__title">
        {t('messages.templates.previewTitle', { messageKey, channel, locale: locale.toUpperCase() })}
      </h2>
      <p>{t('messages.templates.previewSample')}</p>
      {preview === null ? (
        <StateView kind="loading" title={t('common.loading')} />
      ) : preview === 'error' ? (
        <StateView kind="error" title={t('messages.templates.previewFailed')} />
      ) : (
        <>
          {preview.subject ? <p>{t('messages.templates.previewSubject', { subject: preview.subject })}</p> : null}
          {preview.html ? (
            <>
              <h3 className="staff-queue__title">{t('messages.templates.previewHtml')}</h3>
              <iframe
                className="staff-messages__frame"
                title={t('messages.templates.previewHtml')}
                sandbox=""
                src={`/api/v1${path}.html?${query}`}
              />
            </>
          ) : null}
          <h3 className="staff-queue__title">{t('messages.templates.previewText')}</h3>
          <pre className="staff-messages__text">{preview.text}</pre>
        </>
      )}
      <Button variant="secondary" onClick={onClose}>
        {t('messages.templates.closePreview')}
      </Button>
    </section>
  )
}
