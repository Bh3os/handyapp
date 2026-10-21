// The staff home: the action queue and, for the Owner, Owner Decisions (TSK-0041; HH-OPS-01, HH-OPS-02, HH-STAFF-06,
// HH-ARC-10, S01). The server decides which items a person sees, their order and what is masked; this screen shows
// each item's reference, status, assignee, age or due time, reason, one action and the deep link to its record.
// It refreshes itself at the interval the server sends, pauses while the tab is hidden, shows when it last refreshed
// and a stale state when refreshing fails. A refresh never replaces the list under the person: existing items update
// in place (same keys, so nothing remounts and focus and typed filter text stay), and new items wait behind an
// "N new items — refresh" button.
// TSK-0032 (HH-INT-20, HH-COM-02, T12): a delivery failure's one action is Retry, done here: it queues the message
// again on the server (which decides whether it may) and the list reloads; the item resolves once the message is sent.
import { labelKey, type StaffKey, type StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge, type StatusTone } from '@handyhub/ui'
import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { call, idempotencyKey, type Fetch } from './api'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

export type QueueItem = {
  id: string
  type: string
  subjectType: string
  subjectId: string
  band: 'safety' | 'today_change' | 'time_sensitive' | 'other'
  reference: string | null
  status: string | null
  assignee: { id: string; name: string | null } | null
  openedAt: string
  dueAt: string | null
  clock: 'response_target' | null
  reason: string
  masked: boolean
  action: string
  link: string
  version: number
}

export type QueuePage = {
  items: QueueItem[]
  nextCursor: string | null
  section: 'queue' | 'owner_decisions'
  sections: string[]
  types: string[]
  refreshSeconds: number
  refreshedAt: string
}

type Filters = { type?: string; assignee?: string; reference?: string }

const BAND_LABELS = {
  safety: 'queue.band.safety',
  today_change: 'queue.band.today_change',
  time_sensitive: 'queue.band.time_sensitive',
} as const satisfies Record<string, StaffKey>
const BAND_TONES: Record<keyof typeof BAND_LABELS, StatusTone> = {
  safety: 'danger',
  today_change: 'warning',
  time_sensitive: 'info',
}

function isPage(data: unknown): data is QueuePage {
  const d = data as Partial<QueuePage> | null
  return !!d && Array.isArray(d.items) && Array.isArray(d.types) && Array.isArray(d.sections)
}

/** A catalog label for a code, or null when the catalog has none (an unknown code is not shown). */
function label(t: T, key: string): string | null {
  try {
    return t(key as StaffKey)
  } catch {
    return null
  }
}

/** A span of time in whole minutes, hours or days. */
export function duration(t: T, ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 60) return t('queue.time.minutes', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return t('queue.time.hours', { count: hours })
  return t('queue.time.days', { count: Math.floor(hours / 24) })
}

/**
 * Applies a refreshed first page to the list on screen: shown items take their new values in place; items that are
 * gone disappear when the whole list fits one page; items not shown yet are returned as `fresh`, for the badge.
 */
export function mergeRefresh(current: QueueItem[], page: QueuePage): { items: QueueItem[]; fresh: QueueItem[] } {
  const byId = new Map(page.items.map((i) => [i.id, i]))
  const shown = new Set(current.map((i) => i.id))
  const complete = page.nextCursor === null
  const items = current.flatMap((i) => {
    const next = byId.get(i.id)
    if (next) return [next]
    return complete ? [] : [i]
  })
  return { items, fresh: page.items.filter((i) => !shown.has(i.id)) }
}

function query(path: string, filters: Filters, cursor?: string): string {
  const q = new URLSearchParams()
  if (filters.type) q.set('type', filters.type)
  if (filters.assignee) q.set('assignee', filters.assignee)
  if (filters.reference) q.set('reference', filters.reference)
  if (cursor) q.set('cursor', cursor)
  const s = q.toString()
  return s ? `${path}?${s}` : path
}

export interface QueueHomeProps {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  go: (to: string) => void
  href: (to: string) => string
  /** The signed-in staff member (the "Me" filter). */
  staffUserId: string
  /** The clock; tests pass their own. */
  now?: () => Date
}

/** The staff home: the queue, and Owner Decisions when the server says the person has them. */
export function QueueHome(props: QueueHomeProps) {
  const [sections, setSections] = useState<string[]>([])
  return (
    <section className="staff-screen staff-queue" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {props.t('nav.queue')}
      </h1>
      <QueueList {...props} section="queue" path="/staff/queue" onSections={setSections} />
      {sections.includes('owner_decisions') ? (
        <section className="staff-queue__section" aria-labelledby="staff-owner-decisions">
          <h2 id="staff-owner-decisions" className="staff-queue__heading">
            {props.t('queue.ownerDecisions')}
          </h2>
          <QueueList {...props} section="owner_decisions" path="/staff/queue/owner-decisions" />
        </section>
      ) : null}
    </section>
  )
}

type ListProps = QueueHomeProps & {
  section: 'queue' | 'owner_decisions'
  path: string
  onSections?: (sections: string[]) => void
}

function QueueList({ t, locale, fetchImpl, go, href, staffUserId, now = () => new Date(), ...p }: ListProps) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [items, setItems] = useState<QueueItem[]>([])
  const [types, setTypes] = useState<string[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [fresh, setFresh] = useState(0)
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null)
  const [stale, setStale] = useState(false)
  const [refreshSeconds, setRefreshSeconds] = useState(0)
  const [filters, setFilters] = useState<Filters>({})
  const [loadingMore, setLoadingMore] = useState(false)
  const itemsRef = useRef<QueueItem[]>([])
  itemsRef.current = items
  const onSections = p.onSections

  const load = useCallback(
    async (f: Filters) => {
      const r = await call<unknown>(fetchImpl, query(p.path, f))
      if (!r.ok || !isPage(r.data)) {
        setState((s) => (s === 'ready' ? s : 'error'))
        if (itemsRef.current.length) setStale(true)
        return
      }
      const page = r.data
      setItems(page.items)
      setTypes(page.types)
      setCursor(page.nextCursor)
      setFresh(0)
      setStale(false)
      setRefreshedAt(new Date(page.refreshedAt))
      setRefreshSeconds(page.refreshSeconds)
      setState('ready')
      onSections?.(page.sections)
    },
    [fetchImpl, p.path, onSections],
  )

  useEffect(() => {
    void load(filters)
  }, [load, filters])

  // Modest polling (HH-ARC-10), paused while the tab is hidden; a refresh never replaces the list under the person.
  useEffect(() => {
    if (refreshSeconds <= 0) return
    let live = true
    const refresh = async () => {
      if (document.visibilityState === 'hidden') return
      const r = await call<unknown>(fetchImpl, query(p.path, filters))
      if (!live) return
      if (!r.ok || !isPage(r.data)) return setStale(true)
      const merged = mergeRefresh(itemsRef.current, r.data)
      setItems(merged.items)
      setFresh(merged.fresh.length)
      setTypes(r.data.types)
      setStale(false)
      setRefreshedAt(new Date(r.data.refreshedAt))
      onSections?.(r.data.sections)
    }
    const timer = setInterval(() => void refresh(), refreshSeconds * 1000)
    const visible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', visible)
    return () => {
      live = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [refreshSeconds, fetchImpl, p.path, filters, onSections])

  async function more() {
    if (!cursor) return
    setLoadingMore(true)
    const r = await call<unknown>(fetchImpl, query(p.path, filters, cursor))
    setLoadingMore(false)
    if (!r.ok || !isPage(r.data)) return setStale(true)
    const seen = new Set(itemsRef.current.map((i) => i.id))
    setItems([...itemsRef.current, ...r.data.items.filter((i) => !seen.has(i.id))])
    setCursor(r.data.nextCursor)
  }

  function applyReference(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const value = String(new FormData(e.currentTarget).get('reference') ?? '')
      .trim()
      .toUpperCase()
    setFilters((f) => {
      const next = { ...f }
      if (value) next.reference = value
      else delete next.reference
      return next
    })
  }

  const time = (d: Date) =>
    new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { timeStyle: 'short' }).format(d)
  const assignees = new Map(
    items.flatMap((i) => (i.assignee && i.assignee.id !== staffUserId ? [[i.assignee.id, i.assignee.name]] : [])),
  )
  const filtered = Object.keys(filters).length > 0
  const id = (name: string) => `staff-queue-${p.section}-${name}`

  if (state === 'loading') return <StateView kind="loading" title={t('common.loading')} />
  if (state === 'error')
    return (
      <StateView
        kind="error"
        title={t('queue.loadFailed')}
        action={
          <Button variant="secondary" onClick={() => void load(filters)}>
            {t('queue.retry')}
          </Button>
        }
      />
    )

  return (
    <div className="staff-queue__list-wrap">
      <form onSubmit={applyReference} noValidate>
        <fieldset className="staff-queue__filters">
          <legend>{t('queue.filters')}</legend>
          <div className="staff-queue__select">
            <label htmlFor={id('type')}>{t('queue.filter.type')}</label>
            <select
              id={id('type')}
              value={filters.type ?? ''}
              onChange={(e) => {
                const v = e.currentTarget.value
                setFilters((f) => {
                  const next = { ...f }
                  if (v) next.type = v
                  else delete next.type
                  return next
                })
              }}
            >
              <option value="">{t('queue.filter.allTypes')}</option>
              {types.map((ty) => {
                const text = label(t, labelKey('queueItemType', ty))
                return text ? (
                  <option key={ty} value={ty}>
                    {text}
                  </option>
                ) : null
              })}
            </select>
          </div>
          <div className="staff-queue__select">
            <label htmlFor={id('assignee')}>{t('queue.filter.assignee')}</label>
            <select
              id={id('assignee')}
              value={filters.assignee ?? ''}
              onChange={(e) => {
                const v = e.currentTarget.value
                setFilters((f) => {
                  const next = { ...f }
                  if (v) next.assignee = v
                  else delete next.assignee
                  return next
                })
              }}
            >
              <option value="">{t('queue.filter.anyone')}</option>
              <option value="me">{t('queue.filter.me')}</option>
              <option value="unassigned">{t('queue.filter.unassigned')}</option>
              {[...assignees].map(([aid, name]) => (
                <option key={aid} value={aid}>
                  {name ?? t('queue.unnamed')}
                </option>
              ))}
            </select>
          </div>
          <Field
            label={t('queue.filter.reference')}
            name="reference"
            hint={t('queue.filter.referenceHint')}
            autoComplete="off"
            maxLength={11}
          />
          <Button type="submit" variant="secondary">
            {t('queue.filter.apply')}
          </Button>
        </fieldset>
      </form>

      <div className="staff-queue__meta" aria-live="polite">
        {stale && refreshedAt ? (
          <StateView kind="stale" title={t('queue.stale', { time: time(refreshedAt) })} />
        ) : refreshedAt ? (
          <p className="staff-queue__refreshed">{t('queue.refreshed', { time: time(refreshedAt) })}</p>
        ) : null}
        {fresh > 0 ? (
          <Button variant="secondary" onClick={() => void load(filters)}>
            {t('queue.newItems', { count: fresh })}
          </Button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <StateView
          kind="empty"
          title={
            filtered
              ? t('queue.emptyFiltered')
              : p.section === 'queue'
                ? t('queue.empty')
                : t('queue.ownerDecisions.empty')
          }
        />
      ) : (
        <ol className="staff-queue__items">
          {items.map((item) => (
            <QueueRow
              key={item.id}
              t={t}
              item={item}
              now={now()}
              go={go}
              href={href}
              fetchImpl={fetchImpl}
              onRetried={() => void load(filters)}
            />
          ))}
        </ol>
      )}
      {cursor ? (
        <Button variant="secondary" pending={loadingMore} onClick={() => void more()}>
          {t('queue.loadMore')}
        </Button>
      ) : null}
    </div>
  )
}

/** Retry of a failed message (TSK-0032): the server queues it again only while it is failed and never handed over. */
function RetryDelivery({
  t,
  item,
  label: text,
  fetchImpl,
  onRetried,
}: {
  t: T
  item: QueueItem
  label: string
  fetchImpl: Fetch
  onRetried: () => void
}) {
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<'queued' | 'conflict' | 'failed' | null>(null)
  const retry = async () => {
    setPending(true)
    const r = await call<unknown>(fetchImpl, `/staff/message-deliveries/${encodeURIComponent(item.subjectId)}/retry`, {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey() },
    })
    setPending(false)
    setOutcome(r.ok ? 'queued' : r.error.code === 'CONFLICT' ? 'conflict' : 'failed')
    if (r.ok) onRetried()
  }
  return (
    <>
      <Button className="staff-queue__action" pending={pending} onClick={() => void retry()}>
        {text}
      </Button>
      <p role="status" className="staff-queue__retry-status">
        {outcome === 'queued'
          ? t('queue.retryQueued')
          : outcome === 'conflict'
            ? t('queue.retryConflict')
            : outcome === 'failed'
              ? t('queue.retryFailed')
              : ''}
      </p>
    </>
  )
}

function QueueRow({
  t,
  item,
  now,
  go,
  href,
  fetchImpl,
  onRetried,
}: {
  t: T
  item: QueueItem
  now: Date
  go: (to: string) => void
  href: (to: string) => string
  fetchImpl: Fetch
  onRetried: () => void
}) {
  const type = label(t, labelKey('queueItemType', item.type))
  const reason = label(t, labelKey('queueReason', item.reason))
  const action = label(t, labelKey('queueAction', item.action))
  // Deny by default: a code the app has no label for is not shown.
  if (!type || !reason || !action) return null
  const status = item.status && item.subjectType === 'request' ? label(t, labelKey('requestState', item.status)) : null
  const due = item.dueAt ? new Date(item.dueAt) : null
  const age = now.getTime() - new Date(item.openedAt).getTime()
  const open = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    go(item.link)
  }
  const band = item.band === 'other' ? null : item.band
  const headingId = `staff-queue-item-${item.id}`
  return (
    <li className="staff-queue__item" data-band={item.band} aria-labelledby={headingId}>
      <div className="staff-queue__head">
        {band ? <StatusBadge tone={BAND_TONES[band]}>{t(BAND_LABELS[band])}</StatusBadge> : null}
        <h3 id={headingId} className="staff-queue__title">
          <span>{type}</span>{' '}
          {item.reference ? (
            <a href={href(item.link)} onClick={open}>
              {item.reference}
            </a>
          ) : null}
        </h3>
      </div>
      <p className="staff-queue__reason">{reason}</p>
      {item.masked ? <p className="staff-queue__masked">{t('queue.masked')}</p> : null}
      <ul className="staff-queue__facts">
        {status ? <li>{t('queue.status', { status })}</li> : null}
        <li>
          {item.assignee
            ? t('queue.assignedTo', { name: item.assignee.name ?? t('queue.unnamed') })
            : t('queue.unassigned')}
        </li>
        {due ? (
          <li className={due.getTime() <= now.getTime() ? 'staff-queue__overdue' : undefined}>
            {due.getTime() <= now.getTime()
              ? t('queue.overdue', { time: duration(t, now.getTime() - due.getTime()) })
              : t('queue.dueIn', { time: duration(t, due.getTime() - now.getTime()) })}
            {item.clock === 'response_target' ? ` · ${t('queue.responseTarget')}` : ''}
          </li>
        ) : null}
        <li>{t('queue.opened', { age: duration(t, age) })}</li>
      </ul>
      {item.action === 'retry_delivery' && item.subjectType === 'message_delivery' ? (
        <RetryDelivery t={t} item={item} label={action} fetchImpl={fetchImpl} onRetried={onRetried} />
      ) : (
        <a className="hh-button staff-queue__action" href={href(item.link)} onClick={open}>
          {action}
        </a>
      )}
    </li>
  )
}
