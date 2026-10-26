// The retention reviews screen (TSK-0099; HH-PRIV-01, HH-DATA-09, ENT-RetentionReview, OWN-DEC-70, OWN-DEC-142,
// OQ-RETENTION-REVIEW). The Owner sees the retention schedule as configured, which categories the daily review can
// find yet, and the deletion-review queue: the records whose period ended, with the hold checks the software ran and
// the ones it cannot run yet. The screen only shows what the server sends, and nothing is deleted automatically.
// TSK-0100 (HH-PRIV-05, OWN-DEC-70): each entry shows the Owner's latest decision and opens the Delete confirmation:
// "Are you sure you want to delete this entry?" with the record reference, what goes with it, what stays and whether
// deletion is permanent, with Cancel and Confirm Delete. Every check the software cannot run is ticked by the Owner,
// a reason is written and the server asks for a fresh sign-in. A blocked deletion says why and offers Archive; Keep
// longer brings the entry back later. The deletion log below lists references only.
// TSK-0138 (OWN-DEC-177): the provisional defaults: periods in years or calendar days, settings history kept while
// referenced, technical logs kept by the host, and entries that stand for a batch of rows (expired sessions and links
// of one kind and month).
// TSK-0135 (OWN-DEC-164, HH-SEC-08): the audit-retention workflow (./AuditRetention.tsx): audit entries past their
// period are archived or deleted only there, by range, with the protected trail and the hash chain's verification.
import { LABEL_FAMILIES, type StaffKey, type StaffLocale } from '@handyhub/i18n'
import { Button, Dialog, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { call, type ApiErrorBody, type Fetch } from './api'
import { AuditRetention } from './AuditRetention'
import { ReauthForm, useOwnerWrite } from './OwnerWrite'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

export type RetentionCategoryView = {
  id: string
  configKey: string | null
  scan: 'scanned' | 'start_not_recorded' | 'no_period' | 'while_referenced' | 'not_stored'
  state: 'CONFIGURED' | 'NOT_CONFIGURED' | null
  years: number | null
  /** TSK-0138: a period in calendar days. */
  days?: number | null
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
  years: number | null
  /** TSK-0138: a period in calendar days instead of years. */
  days?: number | null
  /** TSK-0138: the rows a batch entry (or a consent history) stands for. */
  count?: number | null
  policy: { key: string; version: number }
  holdChecks: { check: string; result: 'found' | 'none_found' | 'not_applicable' | 'not_recorded'; count?: number }[]
  holdsFound: boolean
  openedAt: string
  openedBy: string
  /** TSK-0100: the Owner's latest decision. */
  status?: EntryStatus
}

export type EntryStatus = {
  state: 'pending' | 'archived' | 'kept' | 'deleted'
  until: string | null
  decidedAt: string | null
  reason: string | null
}

type Page = { items: ReviewEntry[]; nextCursor: string | null }

export type DeletionPreview = {
  entry: { id: string; category: string; reference: string; periodEndsAt: string }
  status: EntryStatus
  early: boolean
  target: {
    record: { type: string; id: string; reference: string; projectId: string | null }
    exists: boolean
    permanent: boolean
    removes: { kind: string; count: number }[]
    keeps: { kind: string; count: number }[]
    checks: { check: string; result: string; count?: number }[]
    blockers: string[]
    confirm: string[]
  }
}

export type DeletionLogItem = {
  id: string
  seq: string
  record: { type: string; id: string; reference: string }
  source: string
  reason: string
  early: boolean
  permanent: boolean
  removed: Record<string, number>
  checksConfirmed: string[]
  decidedBy: { id: string; name: string | null } | { system: string }
  decidedAt: string
  original: { id: string; decidedAt: string } | null
}

/** The queue's query string: the category when one is chosen, and the cursor of the next page. */
export function reviewsQuery(category: string, cursor?: string): string {
  const q = new URLSearchParams()
  if (category) q.set('category', category)
  if (cursor) q.set('cursor', cursor)
  const s = q.toString()
  return s ? `/staff/retention-reviews?${s}` : '/staff/retention-reviews'
}

const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')
const SCAN_TONE = {
  scanned: 'success',
  start_not_recorded: 'neutral',
  no_period: 'neutral',
  while_referenced: 'neutral',
  not_stored: 'neutral',
} as const
const HOLD_TONE = {
  found: 'danger',
  none_found: 'success',
  not_applicable: 'neutral',
  not_recorded: 'warning',
} as const

function rule(t: T, c: RetentionCategoryView): string {
  if (c.configKey === null) return codeLabel(t, 'retentionNoPeriod', c.id)
  if (c.state !== 'CONFIGURED') return t('retention.schedule.notConfigured')
  const start = c.after ? codeLabel(t, 'retentionStart', c.after) : ''
  // TSK-0138: settings history has no period; technical logs are kept by the host, not in the database.
  if (c.scan === 'while_referenced') return t('retention.schedule.whileReferenced')
  if (c.scan === 'not_stored' && c.days != null) return t('retention.schedule.logs', { days: c.days })
  if (c.years !== null) return t('retention.schedule.period', { years: c.years, start })
  if (c.days != null) return t('retention.schedule.periodDays', { days: c.days, start })
  return t('retention.schedule.notConfigured')
}

/** The period an entry was opened under, in years or (TSK-0138) calendar days. */
function entryPolicy(t: T, e: ReviewEntry): string {
  const base = { key: e.policy.key, version: e.policy.version }
  return e.years === null && e.days != null
    ? t('retention.entry.policyDays', { ...base, days: e.days })
    : t('retention.entry.policy', { ...base, years: e.years ?? 0 })
}

const STATUS_TONE = { pending: 'info', archived: 'neutral', kept: 'neutral', deleted: 'success' } as const

/** The refusal codes of a decision, labelled (blockers, unconfirmed checks, field problems). */
export function refusalReasons(t: T, error: ApiErrorBody): string[] {
  const out = error.fieldErrors.map((f) =>
    f.field === 'blockers'
      ? codeLabel(t, 'deletionBlocker', f.code.toLowerCase())
      : codeLabel(t, 'privacyProblem', f.code),
  )
  return out.length ? out : [codeLabel(t, 'privacyProblem', error.code)]
}

/** The Delete confirmation of one entry, with Archive and Keep longer (TSK-0100, HH-PRIV-05). */
export function EntryDecision({
  t,
  locale,
  entry,
  fetchImpl,
  onSession,
  onClose,
  onDecided,
}: {
  t: T
  locale: StaffLocale
  entry: ReviewEntry
  fetchImpl: Fetch
  onSession?: (s: { csrfToken: string }) => void
  onClose: () => void
  onDecided: () => void
}) {
  const ids = useId()
  const [preview, setPreview] = useState<DeletionPreview | null | 'error'>(null)
  const [checked, setChecked] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [until, setUntil] = useState('')
  const [refused, setRefused] = useState<string[]>([])
  const [done, setDone] = useState<string | null>(null)
  const w = useOwnerWrite(fetchImpl, onSession)

  const load = useCallback(async () => {
    const r = await call<DeletionPreview>(fetchImpl, `/staff/retention-reviews/${entry.id}/deletion`)
    setPreview(r.ok ? r.data : 'error')
  }, [fetchImpl, entry.id])
  useEffect(() => {
    void load()
  }, [load])

  const finish = (message: StaffKey) => (r: { ok: true } | { ok: false; error: ApiErrorBody }) => {
    if (r.ok) {
      setRefused([])
      setDone(t(message))
      onDecided()
      void load()
      return
    }
    setRefused(refusalReasons(t, r.error))
    void load()
  }
  const p = preview && preview !== 'error' ? preview : null
  const blocked = p ? p.target.blockers.length > 0 : true
  const deleted = p?.status.state === 'deleted'
  const missing = p ? p.target.confirm.filter((c) => !checked.includes(c)) : []
  const day = new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium' })
  const confirmDelete = () =>
    void w.send(
      `/staff/retention-reviews/${entry.id}/delete`,
      { reason, confirmedChecks: checked },
      finish('retention.decision.deleted'),
    )
  const archive = () =>
    void w.send(`/staff/retention-reviews/${entry.id}/archive`, { reason }, finish('retention.decision.archived'))
  const keep = () =>
    void w.send(
      `/staff/retention-reviews/${entry.id}/keep`,
      { reason, keepUntil: `${until}T12:00:00.000Z` },
      finish('retention.decision.kept'),
    )
  const deleteReason =
    deleted || blocked
      ? t('retention.delete.notAvailable')
      : missing.length
        ? t('retention.delete.checkFirst')
        : reason.trim()
          ? undefined
          : t('retention.decision.reasonFirst')

  return (
    <Dialog
      open
      title={t('retention.delete.title')}
      onClose={onClose}
      actions={
        <>
          <Button variant="quiet" onClick={onClose}>
            {t('retention.delete.cancel')}
          </Button>
          <Button
            variant="danger"
            pending={w.pending}
            onClick={confirmDelete}
            {...(deleteReason ? { disabledReason: deleteReason } : {})}
          >
            {t('retention.delete.confirm')}
          </Button>
        </>
      }
    >
      {preview === null ? <StateView kind="loading" title={t('common.loading')} /> : null}
      {preview === 'error' ? <StateView kind="error" title={t('retention.loadFailed')} /> : null}
      {p ? (
        <div className="staff-retention__decision" data-testid="entry-decision">
          <p>
            <strong>
              {t('retention.entry.record', {
                type: codeLabel(t, 'retentionRecordType', p.target.record.type),
                reference: p.target.record.reference,
              })}
            </strong>
          </p>
          <p>{t(p.target.permanent ? 'retention.delete.permanent' : 'retention.delete.notPermanent')}</p>
          {p.early ? <p>{t('retention.delete.early')}</p> : null}
          <h3 id={`${ids}-removes`} className="staff-queue__title">
            {t('retention.delete.removes')}
          </h3>
          {p.target.removes.length ? (
            <ul aria-labelledby={`${ids}-removes`}>
              {p.target.removes.map((r) => (
                <li key={r.kind}>
                  {t('retention.delete.count', { kind: codeLabel(t, 'deletionKind', r.kind), n: r.count })}
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('retention.delete.removesNothing')}</p>
          )}
          <h3 id={`${ids}-keeps`} className="staff-queue__title">
            {t('retention.delete.keeps')}
          </h3>
          {p.target.keeps.length ? (
            <ul aria-labelledby={`${ids}-keeps`}>
              {p.target.keeps.map((r) => (
                <li key={r.kind}>
                  {t('retention.delete.count', { kind: codeLabel(t, 'deletionKind', r.kind), n: r.count })}
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('retention.delete.keepsNothing')}</p>
          )}
          {deleted ? <StateView kind="success" title={t('retention.decision.deleted')} /> : null}
          {!deleted && blocked ? (
            <StateView
              kind="blocked"
              title={t('retention.delete.blocked')}
              reasons={p.target.blockers.map((b) => codeLabel(t, 'deletionBlocker', b))}
            />
          ) : null}
          {!deleted && !blocked && p.target.confirm.length ? (
            <fieldset className="staff-retention__checks">
              <legend>{t('retention.delete.confirmChecks')}</legend>
              {p.target.confirm.map((c) => (
                <label key={c} className="staff-retention__check">
                  <input
                    type="checkbox"
                    checked={checked.includes(c)}
                    onChange={(e) => setChecked((cur) => (e.target.checked ? [...cur, c] : cur.filter((x) => x !== c)))}
                  />{' '}
                  {t('retention.delete.checked', { check: codeLabel(t, 'deletionCheck', c) })}
                </label>
              ))}
            </fieldset>
          ) : null}
          {!deleted ? (
            <>
              <Field
                label={t('retention.decision.reason')}
                multiline
                name="reason"
                value={reason}
                maxLength={1000}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="hh-button-row">
                <Button
                  variant="secondary"
                  pending={w.pending}
                  onClick={archive}
                  {...(reason.trim() ? {} : { disabledReason: t('retention.decision.reasonFirst') })}
                >
                  {t(blocked ? 'retention.decision.archiveInstead' : 'retention.decision.archive')}
                </Button>
              </div>
              <Field
                label={t('retention.decision.keepUntil')}
                type="date"
                name="keepUntil"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
              <div className="hh-button-row">
                <Button
                  variant="secondary"
                  pending={w.pending}
                  onClick={keep}
                  {...(reason.trim() && until ? {} : { disabledReason: t('retention.decision.keepFirst') })}
                >
                  {t('retention.decision.keep')}
                </Button>
              </div>
            </>
          ) : null}
          {p.status.state === 'kept' && p.status.until ? (
            <p>{t('retention.status.keptUntil', { date: day.format(new Date(p.status.until)) })}</p>
          ) : null}
          <ReauthForm t={t} w={w} />
          {refused.length ? <StateView kind="error" title={t('retention.decision.refused')} reasons={refused} /> : null}
          {done ? (
            <p role="status" className="staff-retention__done">
              {done}
            </p>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  )
}

/** The deletion log: references only, newest first. */
function DeletionLog({
  t,
  locale,
  fetchImpl,
  reload,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  reload: number
}) {
  const ids = useId()
  const [items, setItems] = useState<DeletionLogItem[] | 'error' | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void call<{ items: DeletionLogItem[]; nextCursor: string | null }>(fetchImpl, '/staff/deletions').then((r) => {
      if (!live) return
      setItems(r.ok ? r.data.items : 'error')
      setCursor(r.ok ? r.data.nextCursor : null)
    })
    return () => {
      live = false
    }
  }, [fetchImpl, reload])
  async function more() {
    if (!cursor || !Array.isArray(items)) return
    const r = await call<{ items: DeletionLogItem[]; nextCursor: string | null }>(
      fetchImpl,
      `/staff/deletions?cursor=${encodeURIComponent(cursor)}`,
    )
    if (!r.ok) return setItems('error')
    setItems([...items, ...r.data.items])
    setCursor(r.data.nextCursor)
  }
  const time = new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <section aria-labelledby={`${ids}-log`}>
      <h2 id={`${ids}-log`} className="staff-queue__title">
        {t('retention.log.title')}
      </h2>
      <p>{t('retention.log.intro')}</p>
      {items === null ? (
        <StateView kind="loading" title={t('common.loading')} />
      ) : items === 'error' ? (
        <StateView kind="error" title={t('retention.loadFailed')} />
      ) : items.length === 0 ? (
        <StateView kind="empty" title={t('retention.log.empty')} />
      ) : (
        <ol className="staff-queue__items" aria-label={t('retention.log.title')}>
          {items.map((d) => (
            <li key={d.id} className="staff-queue__item" aria-labelledby={`${ids}-${d.id}`}>
              <h3 id={`${ids}-${d.id}`} className="staff-queue__title">
                {t('retention.entry.record', {
                  type: codeLabel(t, 'deletionRecordType', d.record.type),
                  reference: d.record.reference,
                })}
              </h3>
              <ul className="staff-queue__facts">
                <li>
                  {t('retention.log.by', {
                    who: 'system' in d.decidedBy ? d.decidedBy.system : (d.decidedBy.name ?? t('queue.unnamed')),
                    time: time.format(new Date(d.decidedAt)),
                  })}
                </li>
                <li>{t('retention.log.source', { source: codeLabel(t, 'deletionSource', d.source) })}</li>
                <li>{t('retention.log.reason', { reason: d.reason })}</li>
                {d.early ? <li>{t('retention.log.early')}</li> : null}
                <li>
                  {Object.entries(d.removed)
                    .filter(([, n]) => n > 0)
                    .map(([kind, n]) => t('retention.delete.count', { kind: codeLabel(t, 'deletionKind', kind), n }))
                    .join(' · ')}
                </li>
              </ul>
            </li>
          ))}
        </ol>
      )}
      {cursor ? (
        <Button variant="secondary" onClick={() => void more()}>
          {t('queue.loadMore')}
        </Button>
      ) : null}
    </section>
  )
}

export function RetentionScreen({
  t,
  locale,
  fetchImpl,
  onSession,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  onSession?: (s: { csrfToken: string }) => void
}) {
  const ids = useId()
  const [overview, setOverview] = useState<RetentionOverview | null | 'error'>(null)
  const [category, setCategory] = useState('')
  const [draft, setDraft] = useState('')
  const [items, setItems] = useState<ReviewEntry[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [more, setMore] = useState(false)
  const [open, setOpen] = useState<ReviewEntry | null>(null)
  const [reload, setReload] = useState(0)

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
  }, [fetchImpl, category, reload])

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
      <p>{t('retention.decisions')}</p>
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
                    {c.configKey !== null && c.scan !== 'while_referenced' && c.scan !== 'not_stored' ? (
                      <li>{t('retention.schedule.entries', { n: c.entries })}</li>
                    ) : null}
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
                  {e.status && e.status.state !== 'pending' ? (
                    <StatusBadge tone={STATUS_TONE[e.status.state]}>
                      {codeLabel(t, 'retentionEntryState', e.status.state)}
                    </StatusBadge>
                  ) : e.holdsFound ? (
                    <StatusBadge tone="danger">{t('retention.entry.holdFound')}</StatusBadge>
                  ) : (
                    <StatusBadge tone="info">{t('retention.entry.awaiting')}</StatusBadge>
                  )}
                </div>
                <ul className="staff-queue__facts">
                  <li>{t('retention.entry.category', { category: codeLabel(t, 'retentionCategory', e.category) })}</li>
                  <li>{t('retention.entry.started', { date: day.format(new Date(e.retentionStartedAt)) })}</li>
                  <li>{t('retention.entry.ended', { date: day.format(new Date(e.periodEndsAt)) })}</li>
                  <li>{entryPolicy(t, e)}</li>
                  {e.count != null ? <li>{t('retention.entry.count', { n: e.count })}</li> : null}
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
                {e.status && e.status.state !== 'pending' && e.status.decidedAt ? (
                  <p className="staff-queue__refreshed">
                    {e.status.state === 'kept' && e.status.until
                      ? t('retention.status.keptUntil', { date: day.format(new Date(e.status.until)) })
                      : t('retention.status.decided', { time: time.format(new Date(e.status.decidedAt)) })}
                  </p>
                ) : null}
                {e.status?.state !== 'deleted' ? (
                  <Button variant="secondary" onClick={() => setOpen(e)}>
                    {t('retention.entry.decide')}
                  </Button>
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
      </section>
      {open ? (
        <EntryDecision
          t={t}
          locale={locale}
          entry={open}
          fetchImpl={fetchImpl}
          {...(onSession ? { onSession } : {})}
          onClose={() => setOpen(null)}
          onDecided={() => setReload((n) => n + 1)}
        />
      ) : null}
      <DeletionLog t={t} locale={locale} fetchImpl={fetchImpl} reload={reload} />
      <AuditRetention t={t} locale={locale} fetchImpl={fetchImpl} {...(onSession ? { onSession } : {})} />
    </section>
  )
}
