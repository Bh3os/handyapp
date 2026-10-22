// The workspace tabs beside the Overview (TSK-0039; HH-PORT-09, HH-PORT-06, HH-ARC-10, OWN-DEC-106, RULE-LANGUAGES).
// - Each tab reads its own customer view from the server the first time it is shown, and refreshes only while it is
//   shown (useLive's `active`): a tab that is not on screen never polls.
// - Each says truthfully what it holds today. Messages (TSK-0050): the project conversation, oldest first: the
//   customer's own email and texts on the project and HandyHub's replies, each with who wrote it, how, when and the
//   text exactly as written (never translated); an empty conversation says what will appear. TSK-0051: the customer
//   writes to HandyHub here too (text only). Documents (TSK-0056, HH-PORT-10): the estimate versions the customer
//   received, each with its status, each opening the estimate view, and for an approved version its approval receipt
//   PDF (TSK-0058: ready in the estimate view, or being prepared); nothing yet, with what will appear, while there is
//   none. TSK-0100 (HH-PRIV-06): each version offers its download, a short-lived link the server issues only when
//   asked. Appointments (TSK-0063): the windows offered to choose from and the confirmed visits (Appointments.tsx);
//   nothing yet while there is neither. Payments: nothing exists yet. Photos (TSK-0076, HH-PORT-11): the customer's
//   own uploads (counts as on the receipt, and the photos) and the before and after photos HandyHub shared, paired by
//   service; links are short-lived and renew with each refresh.
// - A tab once opened stays mounted while another is shown, so anything typed in it survives a tab switch.
// English only, from the customer catalog; the wording no decision gives is PROPOSED (OQ-PORTAL-WORDING).
import type { CustomerKey } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useEffect, useState, type FormEvent } from 'react'
import { cents, formatUsd } from '@handyhub/money'
import { AppointmentsList } from './Appointments'
import {
  newKey,
  portalApi,
  portalWrites,
  type ConversationMessage,
  type Download,
  type EstimateListItem,
  type Fetch,
  type SharedPhoto,
  type TabData,
  type WorkspaceTab,
} from './api'
import { day, estimatePath, EstimateView, STATUS_LABEL, STATUS_TONE } from './Estimate'
import { t, when } from './labels'
import { useLive } from './live'
import { NotShown, RefreshLine } from './States'

export type Tab = 'overview' | WorkspaceTab

/** The tab names of OWN-DEC-106, Overview first (on phones too). */
export const TAB_LABEL: Record<Tab, CustomerKey> = {
  overview: 'portal.overview.title',
  messages: 'portal.tab.messages',
  documents: 'portal.tab.documents',
  photos: 'portal.tab.photos',
  appointments: 'portal.tab.appointments',
  payments: 'portal.tab.payments',
}
export const TAB_ORDER: readonly Tab[] = ['overview', 'messages', 'documents', 'photos', 'appointments', 'payments']

/** The page of a tab: the Overview is the project page itself. */
export const tabPath = (reference: string, tab: Tab) =>
  `/portal/p/${encodeURIComponent(reference)}${tab === 'overview' ? '' : `/${tab}`}`

function Empty({ title, text, more }: { title: CustomerKey; text: CustomerKey; more?: CustomerKey }) {
  return (
    <StateView kind="empty" title={t(title)}>
      <p>{t(text)}</p>
      {more ? <p>{t(more)}</p> : null}
    </StateView>
  )
}

const DOWNLOAD_LABEL: Record<Download['kind'], CustomerKey> = {
  estimate_pdf: 'portal.documents.download.estimate_pdf',
  estimate_document: 'portal.documents.download.estimate_document',
}
const kb = (bytes: number) => Math.max(1, Math.round(bytes / 1024))

/** The download links of one version: asked for when the customer wants them, valid for a few minutes. */
function Downloads({ reference, e, fetchImpl }: { reference: string; e: EstimateListItem; fetchImpl: Fetch }) {
  const [links, setLinks] = useState<Download[] | null>(null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  async function load() {
    setPending(true)
    setFailed(false)
    const r = await portalApi.downloads(fetchImpl, { reference, number: e.number, version: e.version })
    setPending(false)
    if (!r.ok) return setFailed(true)
    setLinks(r.data)
  }
  if (links)
    return (
      <ul className="portal-downloads">
        {links.map((d) => (
          <li key={d.kind}>
            <a href={d.url} target="_blank" rel="noopener noreferrer" download>
              {t(DOWNLOAD_LABEL[d.kind], { size: kb(d.byteSize) })}
            </a>
          </li>
        ))}
        <li className="hh-small hh-muted">{t('portal.documents.download.expires')}</li>
      </ul>
    )
  return (
    <>
      <Button variant="secondary" pending={pending} onClick={() => void load()}>
        {t('portal.documents.download.get', { number: e.number, version: e.version })}
      </Button>
      {failed ? <StateView kind="error" title={t('portal.documents.download.failed')} /> : null}
    </>
  )
}

function Estimates({
  reference,
  estimates,
  onNavigate,
  fetchImpl,
}: {
  reference: string
  estimates: EstimateListItem[]
  onNavigate?: ((path: string) => void) | undefined
  fetchImpl: Fetch
}) {
  return (
    <>
      <h3 className="hh-h3">{t('portal.documents.estimates.title')}</h3>
      <ul className="portal-documents">
        {estimates.map((e) => {
          const href = estimatePath(reference, e.number, e.version)
          return (
            <li key={`${e.number}-${e.version}`} className="portal-documents__item">
              <p>
                <a
                  href={href}
                  onClick={(ev) => {
                    if (!onNavigate || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return
                    ev.preventDefault()
                    onNavigate(href)
                  }}
                >
                  {t('portal.documents.estimate.name', { number: e.number, version: e.version })}
                </a>{' '}
                <StatusBadge tone={STATUS_TONE[e.status]}>{t(STATUS_LABEL[e.status])}</StatusBadge>
              </p>
              <p className="hh-small hh-muted">
                {t('portal.documents.estimate.sent', { date: day(e.publishedAt) })}
                {e.validUntil ? ` · ${t('portal.documents.estimate.validUntil', { date: day(e.validUntil) })}` : ''}
                {` · ${t('portal.documents.estimate.total', { total: formatUsd(cents(e.totalCents)) })}`}
              </p>
              {e.receipt ? (
                <p className="hh-small" data-testid="documents-receipt">
                  {t(e.receipt === 'issued' ? 'portal.documents.receipt.issued' : 'portal.documents.receipt.preparing')}
                </p>
              ) : null}
              <Downloads reference={reference} e={e} fetchImpl={fetchImpl} />
            </li>
          )
        })}
      </ul>
      <p className="hh-muted">{t('portal.documents.others')}</p>
    </>
  )
}

/** The project conversation (TSK-0050); PROPOSED wording (OQ-PORTAL-WORDING). */
function Conversation({ messages }: { messages: readonly ConversationMessage[] }) {
  if (messages.length === 0) return <Empty title="portal.messages.none.title" text="portal.messages.none.text" />
  return (
    <ol className="portal-conversation" aria-label={t('portal.messages.list')}>
      {messages.map((m, i) => {
        const from = t(m.from === 'you' ? 'portal.messages.from.you' : 'portal.messages.from.handyhub')
        const channel = t(
          m.channel === 'sms'
            ? 'portal.messages.channel.sms'
            : m.channel === 'portal'
              ? 'portal.messages.channel.portal'
              : 'portal.messages.channel.email',
        )
        return (
          <li
            key={`${m.at}-${i}`}
            className={`portal-conversation__item portal-conversation__item--${m.from}`}
            aria-label={t('portal.messages.item', { from, channel })}
          >
            <p className="portal-conversation__meta">
              <strong>{from}</strong> <span className="hh-muted">{channel}</span>{' '}
              <time className="hh-muted" dateTime={m.at}>
                {when(m.at)}
              </time>
            </p>
            {m.text !== null ? (
              <p className="portal-conversation__text">{m.text}</p>
            ) : (
              <p className="hh-muted">
                {t(m.textState === 'empty' ? 'portal.messages.noText' : 'portal.messages.textNotAvailable')}
              </p>
            )}
            {m.attachments > 0 ? (
              <p className="hh-muted">{t('portal.messages.attachments', { count: m.attachments })}</p>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

type MessageDraft = { text: string; key: string | null }
const messageStore = (reference: string) => `hh.portal.message.${reference}`

/**
 * Writing to HandyHub in the project conversation (TSK-0051, HH-PORT-09): text only, kept exactly as written. The
 * draft and its idempotency key stay in sessionStorage until the server accepts the message, so a failure, a tab
 * switch or a reload never loses it and a retry adds it once. PROPOSED wording (OQ-PORTAL-WORDING).
 */
function Composer({
  reference,
  fetchImpl,
  onSent,
}: {
  reference: string
  fetchImpl: Fetch
  onSent: () => Promise<void>
}) {
  const [draft, setDraft] = useState<MessageDraft>(() => {
    try {
      const raw = window.sessionStorage.getItem(messageStore(reference))
      const d = raw ? (JSON.parse(raw) as Partial<MessageDraft>) : null
      return { text: typeof d?.text === 'string' ? d.text : '', key: typeof d?.key === 'string' ? d.key : null }
    } catch {
      return { text: '', key: null }
    }
  })
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<'sent' | 'failed' | 'closed' | 'card' | null>(null)
  useEffect(() => {
    try {
      if (draft.text || draft.key) window.sessionStorage.setItem(messageStore(reference), JSON.stringify(draft))
      else window.sessionStorage.removeItem(messageStore(reference))
    } catch {
      // Storage blocked: the draft lives only on the page.
    }
  }, [reference, draft])
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!draft.text.trim()) return
    const key = draft.key ?? newKey()
    setDraft({ ...draft, key })
    setPending(true)
    const r = await portalWrites.message(fetchImpl, reference, draft.text, key)
    setPending(false)
    if (r.ok) {
      setDraft({ text: '', key: null })
      setOutcome('sent')
      await onSent()
      return
    }
    if (r.failure === 'refused') {
      setDraft({ ...draft, key: null })
      return setOutcome(
        r.codes.includes('PROJECT_CLOSED') ? 'closed' : r.codes.includes('sensitive_content') ? 'card' : 'failed',
      )
    }
    setOutcome('failed')
  }
  return (
    <form className="portal-compose" aria-label={t('portal.messages.compose.label')} onSubmit={(e) => void submit(e)}>
      <Field
        multiline
        label={t('portal.messages.compose.label')}
        hint={t('portal.messages.compose.hint')}
        maxLength={5000}
        value={draft.text}
        onChange={(e) => {
          setDraft({ ...draft, text: e.target.value })
          setOutcome(null)
        }}
      />
      {outcome === 'sent' ? (
        <p className="portal-compose__status" role="status">
          {t('portal.messages.compose.sent')}
        </p>
      ) : outcome ? (
        <p className="portal-reply__problem" role="alert">
          {t(
            outcome === 'closed'
              ? 'portal.messages.compose.closed'
              : outcome === 'card'
                ? 'portal.questions.cardNumber'
                : 'portal.messages.compose.failed',
          )}
        </p>
      ) : null}
      <Button type="submit" pending={pending}>
        {t('portal.messages.compose.send')}
      </Button>
    </form>
  )
}

/**
 * The Photos tab (TSK-0076; HH-PORT-11, OWN-DEC-106): the customer's own uploads and the before and after photos
 * HandyHub shared, paired by service where staff paired them. Links are short-lived and renew with each refresh.
 * PROPOSED wording (OQ-PORTAL-WORDING).
 */
function Photos({ data }: { data: Extract<TabData, { tab: 'photos' }> }) {
  const { received, processing, failed } = data.photos
  if (received + processing + failed === 0 && data.shared.length === 0)
    return <Empty title="portal.photos.none.title" text="portal.photos.none.text" more="portal.photos.replyHint" />
  const shot = (p: SharedPhoto | null, alt: string, label: CustomerKey) =>
    p ? (
      <figure className="portal-photos__figure">
        {p.url ? (
          <a href={p.url} target="_blank" rel="noopener noreferrer">
            <img src={p.url} alt={alt} loading="lazy" />
          </a>
        ) : (
          <p className="hh-muted">{t('portal.photos.unavailable')}</p>
        )}
        <figcaption>{t(label)}</figcaption>
      </figure>
    ) : null
  return (
    <>
      {data.shared.length ? (
        <section aria-labelledby="portal-photos-shared">
          <h3 id="portal-photos-shared" className="hh-h3">
            {t('portal.photos.shared.title')}
          </h3>
          <p className="hh-muted">{t('portal.photos.shared.intro')}</p>
          <ul className="portal-photos" data-testid="portal-shared-photos">
            {data.shared.map((g) => (
              <li key={(g.after ?? g.before)?.id} className="portal-photos__pair">
                <p>
                  <strong>{g.service}</strong>
                </p>
                <div className="portal-photos__row">
                  {shot(g.before, t('portal.photos.beforeAlt', { service: g.service }), 'portal.photos.before')}
                  {shot(g.after, t('portal.photos.afterAlt', { service: g.service }), 'portal.photos.after')}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {received + processing + failed > 0 ? (
        <section aria-labelledby="portal-photos-yours">
          <h3 id="portal-photos-yours" className="hh-h3">
            {t('portal.photos.yours.title')}
          </h3>
          <ul className="portal-photo-counts">
            <li>{t('request.receipt.photos.received', { count: received })}</li>
            <li>{t('request.receipt.photos.processing', { count: processing })}</li>
            <li>{t('request.receipt.photos.failed', { count: failed })}</li>
          </ul>
          <ul className="portal-photos portal-photos__row" data-testid="portal-your-photos">
            {data.yours.map((y, i) => (
              <li key={y.id}>
                {y.state === 'ready' && y.url ? (
                  <a href={y.url} target="_blank" rel="noopener noreferrer">
                    <img src={y.url} alt={t('portal.photos.yours.alt', { n: i + 1 })} loading="lazy" />
                  </a>
                ) : (
                  <p className="hh-muted">
                    {t(
                      y.state === 'rejected'
                        ? 'portal.photos.yours.failed'
                        : y.state === 'quarantined'
                          ? 'portal.photos.yours.processing'
                          : 'portal.photos.unavailable',
                      { n: i + 1 },
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="hh-muted">{t('portal.photos.links')}</p>
      <p className="hh-muted">{t('portal.photos.replyHint')}</p>
    </>
  )
}

function Content({
  data,
  fetchImpl,
  onChanged,
  onNavigate,
}: {
  data: TabData
  fetchImpl: Fetch
  onChanged: () => Promise<void>
  onNavigate?: ((path: string) => void) | undefined
}) {
  switch (data.tab) {
    case 'messages':
      return (
        <>
          <Conversation messages={data.messages} />
          <Composer reference={data.reference} fetchImpl={fetchImpl} onSent={onChanged} />
        </>
      )
    case 'documents':
      return data.state === 'listed' ? (
        <Estimates
          reference={data.reference}
          estimates={data.estimates}
          onNavigate={onNavigate}
          fetchImpl={fetchImpl}
        />
      ) : (
        <Empty title="portal.documents.none.title" text="portal.documents.none.text" />
      )
    case 'appointments':
      return data.state === 'listed' ? (
        <AppointmentsList
          reference={data.reference}
          offers={data.offers}
          appointments={data.appointments}
          fetchImpl={fetchImpl}
          onChanged={onChanged}
        />
      ) : (
        <Empty title="portal.appointment.none.title" text="portal.appointment.none.text" />
      )
    case 'payments':
      return <Empty title="portal.payment.none.title" text="portal.payment.none.text" more="portal.payments.recorded" />
    case 'photos':
      return <Photos data={data} />
  }
}

export type EstimateRoute = { number: string; version: number }

function TabRead({
  reference,
  tab,
  active,
  fetchImpl,
  onNavigate,
}: {
  reference: string
  tab: WorkspaceTab
  active: boolean
  fetchImpl: Fetch
  onNavigate?: ((path: string) => void) | undefined
}) {
  const { live, refresh } = useLive(() => portalApi.tab(fetchImpl, reference, tab), `${reference}/${tab}`, active)
  return (
    <div className="portal-tab" data-tab={tab}>
      <h2 className="hh-visually-hidden">{t(TAB_LABEL[tab])}</h2>
      {live.phase !== 'ready' ? (
        <NotShown
          live={live}
          loading="portal.tab.loading"
          failedTitle="portal.tab.failed.title"
          onRetry={() => void refresh()}
        />
      ) : (
        <>
          <RefreshLine
            refreshedAt={live.refreshedAt}
            stale={live.stale}
            refreshing={live.refreshing}
            onRefresh={() => void refresh()}
          />
          <div
            className={live.stale ? 'portal-section portal-section--stale' : 'portal-section'}
            data-stale={live.stale || undefined}
          >
            <Content data={live.data} fetchImpl={fetchImpl} onChanged={refresh} onNavigate={onNavigate} />
          </div>
        </>
      )}
    </div>
  )
}

/**
 * One tab beside the Overview: nothing until first shown, then kept (hidden) while another tab is shown. The
 * Documents tab shows one estimate version instead of its list while its page names one (TSK-0056).
 */
export function TabPanel(props: {
  reference: string
  tab: WorkspaceTab
  active: boolean
  fetchImpl: Fetch
  onNavigate?: ((path: string) => void) | undefined
  estimate?: EstimateRoute | undefined
}) {
  const [opened, setOpened] = useState(props.active)
  useEffect(() => {
    if (props.active) setOpened(true)
  }, [props.active])
  if (!(opened || props.active)) return null
  const { estimate, ...rest } = props
  if (props.tab === 'documents' && estimate)
    return (
      <div className="portal-tab" data-tab="documents">
        <h2 className="hh-visually-hidden">{t(TAB_LABEL.documents)}</h2>
        <EstimateView
          key={`${estimate.number}/${estimate.version}`}
          reference={props.reference}
          number={estimate.number}
          version={estimate.version}
          active={props.active}
          fetchImpl={props.fetchImpl}
          onNavigate={props.onNavigate ?? ((to) => window.location.assign(to))}
        />
      </div>
    )
  return <TabRead {...rest} />
}
