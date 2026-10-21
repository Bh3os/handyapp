// The requests list (TSK-0042; HH-LEAD-01, S02). Newest first, filtered by state and by the responsible staff member;
// each request opens its record. The server decides who may see the list (request.view) and pages it.
import { labelKey, type StaffKey, type StaffLocale } from '@handyhub/i18n'
import { Button, StateView, StatusBadge } from '@handyhub/ui'
import { useEffect, useId, useState, type FormEvent, type MouseEvent } from 'react'
import { call, type Fetch } from './api'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

export type RequestListItem = {
  id: string
  reference: string
  state: string
  submittedAt: string
  services: string[]
  customerName: string
  city: string
  coverage: string
  needHelpToday: boolean
  spamSuspected: boolean
  responsibleStaff: { id: string; name: string | null } | null
}
type Page = { items: RequestListItem[]; nextCursor: string | null }

const STATE_FILTERS = ['open', 'closed', 'received', 'needs_information', 'needs_site_visit', 'ready_for_estimate']
const STATE_FILTER_LABELS: Record<string, StaffKey> = {
  open: 'requests.filter.open',
  closed: 'requests.filter.closed',
}

/** A catalog label for a code; the code itself when the catalog has none. */
export function codeLabel(t: T, family: Parameters<typeof labelKey>[0], code: string): string {
  try {
    return t(labelKey(family, code) as StaffKey)
  } catch {
    return code
  }
}

function query(state: string, responsible: string, cursor?: string): string {
  const q = new URLSearchParams()
  if (state) q.set('state', state)
  if (responsible) q.set('responsible', responsible)
  if (cursor) q.set('cursor', cursor)
  const s = q.toString()
  return s ? `/staff/requests?${s}` : '/staff/requests'
}

export function RequestsScreen({
  t,
  locale,
  fetchImpl,
  go,
  href,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  go: (to: string) => void
  href: (to: string) => string
}) {
  const ids = useId()
  const [filters, setFilters] = useState({ state: 'open', responsible: '' })
  const [draft, setDraft] = useState(filters)
  const [items, setItems] = useState<RequestListItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [more, setMore] = useState(false)

  useEffect(() => {
    let live = true
    setStatus('loading')
    void call<Page>(fetchImpl, query(filters.state, filters.responsible)).then((r) => {
      if (!live) return
      if (!r.ok || !Array.isArray(r.data?.items)) return setStatus('error')
      setItems(r.data.items)
      setCursor(r.data.nextCursor)
      setStatus('ready')
    })
    return () => {
      live = false
    }
  }, [fetchImpl, filters])

  async function loadMore() {
    if (!cursor) return
    setMore(true)
    const r = await call<Page>(fetchImpl, query(filters.state, filters.responsible, cursor))
    setMore(false)
    if (!r.ok) return setStatus('error')
    setItems((current) => [...current, ...r.data.items])
    setCursor(r.data.nextCursor)
  }

  const fmt = new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const open = (id: string) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    go(`/requests/${id}`)
  }

  return (
    <section className="staff-screen staff-requests" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('nav.requests')}
      </h1>
      <form
        className="staff-queue__filters"
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          setFilters(draft)
        }}
      >
        <div className="staff-queue__select">
          <label htmlFor={`${ids}-state`}>{t('requests.filter.state')}</label>
          <select
            id={`${ids}-state`}
            value={draft.state}
            onChange={(e) => setDraft({ ...draft, state: e.target.value })}
          >
            <option value="">{t('requests.filter.all')}</option>
            {STATE_FILTERS.map((s) => (
              <option key={s} value={s}>
                {STATE_FILTER_LABELS[s] ? t(STATE_FILTER_LABELS[s]) : codeLabel(t, 'requestState', s)}
              </option>
            ))}
          </select>
        </div>
        <div className="staff-queue__select">
          <label htmlFor={`${ids}-responsible`}>{t('requests.filter.responsible')}</label>
          <select
            id={`${ids}-responsible`}
            value={draft.responsible}
            onChange={(e) => setDraft({ ...draft, responsible: e.target.value })}
          >
            <option value="">{t('queue.filter.anyone')}</option>
            <option value="me">{t('queue.filter.me')}</option>
            <option value="unassigned">{t('queue.filter.unassigned')}</option>
          </select>
        </div>
        <Button type="submit" variant="secondary">
          {t('queue.filter.apply')}
        </Button>
      </form>
      {status === 'loading' ? (
        <StateView kind="loading" title={t('common.loading')} />
      ) : status === 'error' ? (
        <StateView kind="error" title={t('requests.loadFailed')} />
      ) : items.length === 0 ? (
        <StateView kind="empty" title={t('requests.empty')} />
      ) : (
        <ol className="staff-queue__items">
          {items.map((item) => (
            <li key={item.id} className="staff-queue__item" aria-labelledby={`${ids}-${item.id}`}>
              <div className="staff-queue__head">
                <h2 id={`${ids}-${item.id}`} className="staff-queue__title">
                  {t('record.request.heading', { reference: item.reference })}
                </h2>
                <StatusBadge>{codeLabel(t, 'requestState', item.state)}</StatusBadge>
                {item.needHelpToday ? <StatusBadge tone="warning">{t('request.needHelpToday')}</StatusBadge> : null}
                {item.spamSuspected ? <StatusBadge tone="warning">{t('request.spamFlagged')}</StatusBadge> : null}
              </div>
              <ul className="staff-queue__facts">
                <li>{item.customerName}</li>
                <li>{item.city}</li>
                <li>{item.services.map((c) => codeLabel(t, 'service', c)).join(', ') || t('request.notSure')}</li>
                <li>{t('requests.submitted', { time: fmt.format(new Date(item.submittedAt)) })}</li>
                <li>
                  {item.responsibleStaff
                    ? t('requests.responsible', { name: item.responsibleStaff.name ?? t('queue.unnamed') })
                    : t('queue.unassigned')}
                </li>
              </ul>
              <a className="hh-button staff-queue__action" href={href(`/requests/${item.id}`)} onClick={open(item.id)}>
                {t('requests.open')}
              </a>
            </li>
          ))}
        </ol>
      )}
      {cursor ? (
        <Button variant="secondary" pending={more} onClick={() => void loadMore()}>
          {t('queue.loadMore')}
        </Button>
      ) : null}
    </section>
  )
}
