// The retention reviews screen (TSK-0099; HH-PRIV-01, HH-DATA-09, ENT-RetentionReview, OWN-DEC-70, OWN-DEC-142,
// OQ-RETENTION-REVIEW). The Owner sees the retention schedule as configured, which categories the daily review can
// find yet, and the deletion-review queue: the records whose period ended, with the hold checks the software ran and
// the ones it cannot run yet. The screen only shows what the server sends; it has no delete, archive or edit control,
// and nothing is deleted automatically.
import { LABEL_FAMILIES, type StaffKey, type StaffLocale } from '@handyhub/i18n'
import { Button, StateView, StatusBadge } from '@handyhub/ui'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { call, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

export type RetentionCategoryView = {
  id: string
  configKey: string | null
  scan: 'scanned' | 'start_not_recorded' | 'no_period'
  state: 'CONFIGURED' | 'NOT_CONFIGURED' | null
  years: number | null
  after: string | null
  version: number | null
  sourceIds: string[]
  entries: number
}

export type RetentionOverview = {
  automaticDeletion: false
  awaitingConfirmation: boolean
  timeZone: string | null
  categories: RetentionCategoryView[]
  lastScanAt: string | null
  nextScanAt: string | null
  entries: number
}

export type ReviewEntry = {
  id: string
  seq: string
  category: string
  record: { type: string; id: string; reference: string; projectId: string | null }
  retentionStartedAt: string
  periodEndsAt: string
  years: number
  policy: { key: string; version: number }
  holdChecks: { check: string; result: 'found' | 'none_found' | 'not_applicable' | 'not_recorded'; count?: number }[]
  holdsFound: boolean
  openedAt: string
  openedBy: string
}

type Page = { items: ReviewEntry[]; nextCursor: string | null }

/** The queue's query string: the category when one is chosen, and the cursor of the next page. */
export function reviewsQuery(category: string, cursor?: string): string {
  const q = new URLSearchParams()
  if (category) q.set('category', category)
  if (cursor) q.set('cursor', cursor)
  const s = q.toString()
  return s ? `/staff/retention-reviews?${s}` : '/staff/retention-reviews'
}

const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')
const SCAN_TONE = { scanned: 'success', start_not_recorded: 'neutral', no_period: 'neutral' } as const
const HOLD_TONE = {
  found: 'danger',
  none_found: 'success',
  not_applicable: 'neutral',
  not_recorded: 'warning',
} as const

function rule(t: T, c: RetentionCategoryView): string {
  if (c.configKey === null) return codeLabel(t, 'retentionNoPeriod', c.id)
  if (c.state !== 'CONFIGURED' || c.years === null) return t('retention.schedule.notConfigured')
  return t('retention.schedule.period', {
    years: c.years,
    start: c.after ? codeLabel(t, 'retentionStart', c.after) : '',
  })
}

export function RetentionScreen({ t, locale, fetchImpl }: { t: T; locale: StaffLocale; fetchImpl: Fetch }) {
  const ids = useId()
  const [overview, setOverview] = useState<RetentionOverview | null | 'error'>(null)
  const [category, setCategory] = useState('')
  const [draft, setDraft] = useState('')
  const [items, setItems] = useState<ReviewEntry[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [more, setMore] = useState(false)

  useEffect(() => {
    let live = true
    void call<RetentionOverview>(fetchImpl, '/staff/retention').then((r) => {
      if (live) setOverview(r.ok ? r.data : 'error')
    })
    return () => {
      live = false
    }
  }, [fetchImpl])

  useEffect(() => {
    let live = true
    setStatus('loading')
    void call<Page>(fetchImpl, reviewsQuery(category)).then((r) => {
      if (!live) return
      if (!r.ok) return setStatus('error')
      setItems(r.data.items)
      setCursor(r.data.nextCursor)
      setStatus('ready')
    })
    return () => {
      live = false
    }
  }, [fetchImpl, category])

  async function loadMore() {
    if (!cursor) return
    setMore(true)
    const r = await call<Page>(fetchImpl, reviewsQuery(category, cursor))
    setMore(false)
    if (!r.ok) return setStatus('error')
    setItems((current) => [...current, ...r.data.items])
    setCursor(r.data.nextCursor)
  }

  const info = overview && overview !== 'error' ? overview : null
  const zone = info?.timeZone ? { timeZone: info.timeZone } : {}
  const day = new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', ...zone })
  const time = new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short', ...zone })

  return (
    <section className="staff-screen staff-retention" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('nav.retention')}
      </h1>
      <p>{t('retention.intro')}</p>
      <p>{t('retention.decisionsLater')}</p>
      {overview === 'error' ? <StateView kind="error" title={t('retention.loadFailed')} /> : null}
      {info ? (
        <>
          {info.awaitingConfirmation ? (
            <p>
              <StatusBadge tone="warning">{t('retention.pending')}</StatusBadge>
            </p>
          ) : null}
          <p>
            {info.lastScanAt
              ? t('retention.lastScan', { time: time.format(new Date(info.lastScanAt)) })
              : t('retention.neverScanned')}
          </p>
          {info.nextScanAt ? <p>{t('retention.nextScan', { time: time.format(new Date(info.nextScanAt)) })}</p> : null}
          <section aria-labelledby={`${ids}-schedule`}>
            <h2 id={`${ids}-schedule`} className="staff-queue__title">
              {t('retention.schedule.title')}
            </h2>
            <ul className="staff-queue__items" aria-label={t('retention.schedule.title')}>
              {info.categories.map((c) => (
                <li key={c.id} className="staff-queue__item" aria-labelledby={`${ids}-c-${c.id}`}>
                  <div className="staff-queue__head">
                    <h3 id={`${ids}-c-${c.id}`} className="staff-queue__title">
                      {codeLabel(t, 'retentionCategory', c.id)}
                    </h3>
                    <StatusBadge tone={SCAN_TONE[c.scan]}>{codeLabel(t, 'retentionScan', c.scan)}</StatusBadge>
                  </div>
                  <ul className="staff-queue__facts">
                    <li>{rule(t, c)}</li>
                    {c.configKey !== null ? <li>{t('retention.schedule.entries', { n: c.entries })}</li> : null}
                    {c.version !== null ? (
                      <li className="staff-queue__refreshed">
                        {t('retention.schedule.source', { version: c.version, ids: c.sourceIds.join(', ') })}
                      </li>
                    ) : null}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
      <section aria-labelledby={`${ids}-queue`}>
        <h2 id={`${ids}-queue`} className="staff-queue__title">
          {t('retention.queue.title')}
        </h2>
        <form
          className="staff-queue__filters"
          aria-label={t('retention.queue.filter')}
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            setCategory(draft)
          }}
        >
          <div className="staff-queue__select">
            <label htmlFor={`${ids}-category`}>{t('retention.queue.category')}</label>
            <select id={`${ids}-category`} value={draft} onChange={(e) => setDraft(e.target.value)}>
              <option value="">{t('retention.queue.anyCategory')}</option>
              {LABEL_FAMILIES.retentionPeriodCategory.map((c) => (
                <option key={c} value={c}>
                  {codeLabel(t, 'retentionPeriodCategory', c)}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary">
            {t('retention.queue.apply')}
          </Button>
        </form>
        {status === 'loading' ? (
          <StateView kind="loading" title={t('common.loading')} />
        ) : status === 'error' ? (
          <StateView kind="error" title={t('retention.loadFailed')} />
        ) : items.length === 0 ? (
          <StateView kind="empty" title={t('retention.queue.empty')} />
        ) : (
          <ol className="staff-queue__items" aria-label={t('retention.queue.entries')}>
            {items.map((e) => (
              <li key={e.id} className="staff-queue__item" aria-labelledby={`${ids}-${e.id}`}>
                <div className="staff-queue__head">
                  <h3 id={`${ids}-${e.id}`} className="staff-queue__title">
                    {t('retention.entry.record', {
                      type: codeLabel(t, 'retentionRecordType', e.record.type),
                      reference: e.record.reference,
                    })}
                  </h3>
                  {e.holdsFound ? (
                    <StatusBadge tone="danger">{t('retention.entry.holdFound')}</StatusBadge>
                  ) : (
                    <StatusBadge tone="info">{t('retention.entry.awaiting')}</StatusBadge>
                  )}
                </div>
                <ul className="staff-queue__facts">
                  <li>{t('retention.entry.category', { category: codeLabel(t, 'retentionCategory', e.category) })}</li>
                  <li>{t('retention.entry.started', { date: day.format(new Date(e.retentionStartedAt)) })}</li>
                  <li>{t('retention.entry.ended', { date: day.format(new Date(e.periodEndsAt)) })}</li>
                  <li>
                    {t('retention.entry.policy', { key: e.policy.key, version: e.policy.version, years: e.years })}
                  </li>
                  <li>{t('retention.entry.opened', { time: time.format(new Date(e.openedAt)) })}</li>
                </ul>
                <dl className="staff-system__fields" aria-label={t('retention.entry.holds')}>
                  {e.holdChecks.map((h) => (
                    <div key={h.check}>
                      <dt>{codeLabel(t, 'retentionHoldCheck', h.check)}</dt>
                      <dd>
                        <StatusBadge tone={HOLD_TONE[h.result]}>
                          {h.result === 'found' && h.count !== undefined
                            ? t('retention.entry.found', { n: h.count })
                            : codeLabel(t, 'retentionHoldResult', h.result)}
                        </StatusBadge>
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ol>
        )}
        {cursor && status === 'ready' ? (
          <Button variant="secondary" pending={more} onClick={() => void loadMore()}>
            {t('queue.loadMore')}
          </Button>
        ) : null}
      </section>
    </section>
  )
}
