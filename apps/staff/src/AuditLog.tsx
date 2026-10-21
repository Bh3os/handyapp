// The audit-log screen of staff management (TSK-0098; HH-STAFF-08, HH-SEC-06, S09, OWN-DEC-123, OWN-DEC-142). The
// Owner browses every entry; Office staff their own actions. Each entry shows who, when, the action, the affected
// record and the change summary (already redacted by the server). Filters (area, result, who, record, dates) and
// paging run on the server, which decides what the caller may see: this screen never filters for visibility itself.
// The retention rule is shown as configured (7 years, then the owner's deletion review; nothing deleted
// automatically). There is no edit or delete control: entries are append-only.
import { LABEL_FAMILIES, type StaffKey, type StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { call, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

export type AuditEntry = {
  id: string
  seq: string
  occurredAt: string
  actor: {
    kind: 'staff' | 'customer' | 'guest' | 'system'
    staffUserId: string | null
    name: string | null
    roles: string[]
    process: string | null
  }
  action: string
  area: string
  target: { type: string; id: string | null; version: number | null }
  result: 'succeeded' | 'denied' | 'failed'
  reason: string | null
  stepUpUsed: boolean
  requestId: string
  changes: { path: string; value: string | number | boolean | null }[]
}

export type AuditOverview = {
  visibility: 'all' | 'own'
  timeZone: string | null
  retention: {
    state: 'CONFIGURED' | 'NOT_CONFIGURED'
    years: number | null
    afterPeriod: string | null
    automaticDeletion: false
    holdsKeepRecords: boolean | null
    version: number | null
    sourceIds: string[]
    awaitingConfirmation: boolean
    pastPeriod: number | null
    oldestAt: string | null
  }
  staff: { id: string; name: string | null }[]
}

type Page = { items: AuditEntry[]; nextCursor: string | null }
type Filters = {
  area: string
  result: string
  actor: string
  targetType: string
  targetId: string
  from: string
  to: string
}
const NO_FILTERS: Filters = { area: '', result: '', actor: '', targetType: '', targetId: '', from: '', to: '' }

/** The list's query string: only the filters that are set, and the cursor of the next page. */
export function auditQuery(filters: Filters, cursor?: string): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) if (v.trim()) q.set(k, v.trim())
  if (cursor) q.set('cursor', cursor)
  const s = q.toString()
  return s ? `/staff/audit-events?${s}` : '/staff/audit-events'
}

const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')
const TONE = { succeeded: 'success', denied: 'warning', failed: 'danger' } as const

function who(t: T, actor: AuditEntry['actor']): string {
  if (actor.kind === 'staff') return actor.name ?? t('queue.unnamed')
  const kind = codeLabel(t, 'auditActorKind', actor.kind)
  return actor.process ? t('auditLog.entry.process', { kind, process: actor.process }) : kind
}

function record(t: T, target: AuditEntry['target']): string {
  if (target.id === null) return t('auditLog.entry.recordType', { type: target.type })
  if (target.version === null) return t('auditLog.entry.record', { type: target.type, id: target.id })
  return t('auditLog.entry.recordVersion', { type: target.type, id: target.id, version: target.version })
}

export function AuditLogScreen({ t, locale, fetchImpl }: { t: T; locale: StaffLocale; fetchImpl: Fetch }) {
  const ids = useId()
  const [overview, setOverview] = useState<AuditOverview | null | 'error'>(null)
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [draft, setDraft] = useState<Filters>(NO_FILTERS)
  const [items, setItems] = useState<AuditEntry[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'invalid'>('loading')
  const [more, setMore] = useState(false)

  useEffect(() => {
    let live = true
    void call<AuditOverview>(fetchImpl, '/staff/audit-log').then((r) => {
      if (live) setOverview(r.ok ? r.data : 'error')
    })
    return () => {
      live = false
    }
  }, [fetchImpl])

  useEffect(() => {
    let live = true
    setStatus('loading')
    void call<Page>(fetchImpl, auditQuery(filters)).then((r) => {
      if (!live) return
      if (!r.ok) return setStatus(r.error.code === 'VALIDATION_FAILED' ? 'invalid' : 'error')
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
    const r = await call<Page>(fetchImpl, auditQuery(filters, cursor))
    setMore(false)
    if (!r.ok) return setStatus('error')
    setItems((current) => [...current, ...r.data.items])
    setCursor(r.data.nextCursor)
  }

  const fmt = new Intl.DateTimeFormat(bcp47(locale), {
    dateStyle: 'medium',
    timeStyle: 'medium',
    ...(overview && overview !== 'error' && overview.timeZone ? { timeZone: overview.timeZone } : {}),
  })
  const info = overview && overview !== 'error' ? overview : null
  const set = (k: keyof Filters) => (value: string) => setDraft({ ...draft, [k]: value })

  return (
    <section className="staff-screen staff-audit" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('nav.audit')}
      </h1>
      {overview === 'error' ? <StateView kind="error" title={t('auditLog.loadFailed')} /> : null}
      {info ? (
        <>
          <p>{info.visibility === 'all' ? t('auditLog.visibility.all') : t('auditLog.visibility.own')}</p>
          <p>{t('auditLog.appendOnly')}</p>
          <Retention t={t} info={info} fmt={fmt} />
        </>
      ) : null}
      <form
        className="staff-queue__filters"
        aria-label={t('auditLog.filter.label')}
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          setFilters(draft)
        }}
      >
        <div className="staff-queue__select">
          <label htmlFor={`${ids}-area`}>{t('auditLog.filter.area')}</label>
          <select id={`${ids}-area`} value={draft.area} onChange={(e) => set('area')(e.target.value)}>
            <option value="">{t('auditLog.filter.anyArea')}</option>
            {LABEL_FAMILIES.auditArea.map((a) => (
              <option key={a} value={a}>
                {codeLabel(t, 'auditArea', a)}
              </option>
            ))}
          </select>
        </div>
        <div className="staff-queue__select">
          <label htmlFor={`${ids}-result`}>{t('auditLog.filter.result')}</label>
          <select id={`${ids}-result`} value={draft.result} onChange={(e) => set('result')(e.target.value)}>
            <option value="">{t('auditLog.filter.anyResult')}</option>
            {LABEL_FAMILIES.auditResult.map((r) => (
              <option key={r} value={r}>
                {codeLabel(t, 'auditResult', r)}
              </option>
            ))}
          </select>
        </div>
        {info?.visibility === 'all' ? (
          <div className="staff-queue__select">
            <label htmlFor={`${ids}-actor`}>{t('auditLog.filter.actor')}</label>
            <select id={`${ids}-actor`} value={draft.actor} onChange={(e) => set('actor')(e.target.value)}>
              <option value="">{t('auditLog.filter.anyone')}</option>
              {info.staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? t('queue.unnamed')}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <Field
          label={t('auditLog.filter.targetType')}
          name="targetType"
          value={draft.targetType}
          onChange={(e) => set('targetType')(e.currentTarget.value)}
        />
        <Field
          label={t('auditLog.filter.targetId')}
          name="targetId"
          value={draft.targetId}
          onChange={(e) => set('targetId')(e.currentTarget.value)}
        />
        <Field
          label={t('auditLog.filter.from')}
          name="from"
          type="date"
          value={draft.from}
          onChange={(e) => set('from')(e.currentTarget.value)}
        />
        <Field
          label={t('auditLog.filter.to')}
          name="to"
          type="date"
          value={draft.to}
          onChange={(e) => set('to')(e.currentTarget.value)}
        />
        <Button type="submit" variant="secondary">
          {t('auditLog.filter.apply')}
        </Button>
        <Button
          variant="quiet"
          onClick={() => {
            setDraft(NO_FILTERS)
            setFilters(NO_FILTERS)
          }}
        >
          {t('auditLog.filter.clear')}
        </Button>
      </form>
      {info ? (
        <p className="staff-queue__refreshed">
          {info.timeZone ? t('auditLog.filter.zone', { zone: info.timeZone }) : t('auditLog.filter.zoneUtc')}
        </p>
      ) : null}
      {status === 'loading' ? (
        <StateView kind="loading" title={t('common.loading')} />
      ) : status === 'invalid' ? (
        <StateView kind="error" title={t('auditLog.invalidFilter')} />
      ) : status === 'error' ? (
        <StateView kind="error" title={t('auditLog.loadFailed')} />
      ) : items.length === 0 ? (
        <StateView kind="empty" title={t('auditLog.empty')} />
      ) : (
        <ol className="staff-queue__items" aria-label={t('auditLog.entries')}>
          {items.map((e) => (
            <li key={e.id} className="staff-queue__item" aria-labelledby={`${ids}-${e.id}`} data-action={e.action}>
              <div className="staff-queue__head">
                <h2 id={`${ids}-${e.id}`} className="staff-queue__title">
                  {codeLabel(t, 'auditArea', e.area)}: <code>{e.action}</code>
                </h2>
                <StatusBadge tone={TONE[e.result]}>{codeLabel(t, 'auditResult', e.result)}</StatusBadge>
                {e.stepUpUsed ? <StatusBadge tone="info">{t('auditLog.entry.stepUp')}</StatusBadge> : null}
              </div>
              <ul className="staff-queue__facts">
                <li>{t('auditLog.entry.when', { time: fmt.format(new Date(e.occurredAt)) })}</li>
                <li>{t('auditLog.entry.by', { name: who(t, e.actor) })}</li>
                {e.actor.roles.length > 0 ? (
                  <li>
                    {t('auditLog.entry.roles', {
                      roles: e.actor.roles.map((r) => codeLabel(t, 'staffRole', r)).join(', '),
                    })}
                  </li>
                ) : null}
                <li>{record(t, e.target)}</li>
                {e.reason ? <li>{t('auditLog.entry.reason', { reason: e.reason })}</li> : null}
                <li>
                  {t('auditLog.entry.request')} <code>{e.requestId}</code>
                </li>
              </ul>
              {e.changes.length > 0 ? (
                <dl className="staff-system__fields" aria-label={t('auditLog.entry.changes')}>
                  {e.changes.map((c) => (
                    <div key={c.path}>
                      <dt>
                        <code>{c.path}</code>
                      </dt>
                      <dd>{c.value === null ? t('auditLog.entry.none') : String(c.value)}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p>{t('auditLog.entry.noChanges')}</p>
              )}
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
  )
}

function Retention({ t, info, fmt }: { t: T; info: AuditOverview; fmt: Intl.DateTimeFormat }) {
  const r = info.retention
  return (
    <section className="staff-audit__retention" aria-labelledby="staff-audit-retention">
      <h2 id="staff-audit-retention" className="staff-queue__title">
        {t('auditLog.retention.title')}
      </h2>
      {r.state === 'CONFIGURED' && r.years !== null ? (
        <p>{t('auditLog.retention.rule', { years: r.years })}</p>
      ) : (
        <StateView kind="blocked" title={t('auditLog.retention.notConfigured')} />
      )}
      {r.awaitingConfirmation ? (
        <p>
          <StatusBadge tone="warning">{t('auditLog.retention.pending')}</StatusBadge>
        </p>
      ) : null}
      {r.pastPeriod !== null ? <p>{t('auditLog.retention.pastPeriod', { n: r.pastPeriod })}</p> : null}
      {r.oldestAt ? <p>{t('auditLog.retention.oldest', { time: fmt.format(new Date(r.oldestAt)) })}</p> : null}
      {r.version !== null ? (
        <p className="staff-queue__refreshed">
          {t('auditLog.retention.source', { version: r.version, ids: r.sourceIds.join(', ') })}
        </p>
      ) : null}
    </section>
  )
}
