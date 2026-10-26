// The assigned workers' visit-day data access on one visit and the Owner's extensions (TSK-0128; HH-PKT-08,
// HH-CRM-03, HH-DATA-08, OWN-DEC-171, OWN-DEC-159, RULE-SERVER-AUTHZ).
// - Each assigned worker: whether they see the customer's first name, the address, the site contact and the access
//   codes now (the visit's own local day in the visit's zone, or an Owner extension), until when, or when it opens.
// - Every extension stays listed as access history: who granted it, why, from when until when, and whether it is in
//   force, expired, ended early by the Owner (with the reason) or lapsed with the assignment.
// - The Owner extends one worker's access with a reason and an end time (at most the server's limit ahead); the server
//   decides again and refuses a past or too-distant time, a worker no longer assigned or a visit no longer booked.
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { call, idempotencyKey, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

type ExtensionState = 'active' | 'scheduled' | 'expired' | 'ended' | 'lapsed'
type StaffRef = { id: string; name: string | null }
export type WorkerAccessView = {
  visitId: string
  number: number
  purpose: string
  state: string
  projectReference: string
  window: { localDate: string; start: string; end: string; timeZone: string }
  serviceDay: { startsAt: string; endsAt: string } | null
  workers: {
    staffUserId: string
    name: string | null
    role: string
    open: boolean
    basis: 'visit_day' | 'extension' | null
    endsAt: string | null
    opensAt: string | null
  }[]
  extensions: {
    id: string
    staffUserId: string
    name: string | null
    state: ExtensionState
    reason: string
    grantedBy: StaffRef
    startsAt: string
    expiresAt: string
    endedAt: string | null
    endedBy: StaffRef | null
    endReason: string | null
  }[]
  maxHours: number
  actions: { extend: boolean }
}

const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')
const STATE: Readonly<Record<ExtensionState, StaffKey>> = {
  active: 'visitAccess.state.active',
  scheduled: 'visitAccess.state.scheduled',
  expired: 'visitAccess.state.expired',
  ended: 'visitAccess.state.ended',
  lapsed: 'visitAccess.state.lapsed',
}
const TONE = { active: 'success', scheduled: 'info', expired: 'neutral', ended: 'neutral', lapsed: 'warning' } as const
/** The refusals the server names for an extension or its end. */
const ERROR: Readonly<Record<string, StaffKey>> = {
  EXPIRY_IN_PAST: 'visitAccess.error.EXPIRY_IN_PAST',
  EXPIRY_TOO_FAR: 'visitAccess.error.EXPIRY_TOO_FAR',
  NOT_ASSIGNED: 'visitAccess.error.NOT_ASSIGNED',
  VISIT_NOT_LIVE: 'visitAccess.error.VISIT_NOT_LIVE',
  EXTENSION_NOT_ACTIVE: 'visitAccess.error.EXTENSION_NOT_ACTIVE',
}

export function VisitAccessPage({
  t,
  locale,
  fetchImpl,
  visitId,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  visitId: string
}) {
  const ids = useId()
  const [view, setView] = useState<WorkerAccessView | null | 'forbidden' | undefined>(undefined)
  const load = useCallback(async () => {
    const r = await call<WorkerAccessView>(fetchImpl, `/staff/visits/${encodeURIComponent(visitId)}/worker-access`)
    setView(r.ok ? r.data : r.status === 403 ? 'forbidden' : null)
  }, [fetchImpl, visitId])
  useEffect(() => {
    void load()
  }, [load])
  if (view === undefined) return <StateView kind="loading" title={t('visitAccess.loading')} />
  if (view === 'forbidden') return <StateView kind="blocked" title={t('visitAccess.forbidden')} />
  if (view === null) return <StateView kind="error" title={t('visitAccess.failed')} />
  const zone = view.window.timeZone
  const fmt = new Intl.DateTimeFormat(bcp47(locale), { timeZone: zone, dateStyle: 'medium', timeStyle: 'short' })
  const at = (iso: string) => fmt.format(new Date(iso))
  return (
    <section className="staff-screen" aria-labelledby={`${ids}-title`} data-testid="visit-access">
      <h1 id={`${ids}-title`} className="hh-h3">
        {t('visitAccess.title', { reference: view.projectReference, number: view.number })}
      </h1>
      <p>
        {codeLabel(t, 'visitPurpose', view.purpose)} · {codeLabel(t, 'visitState', view.state)} ·{' '}
        {t('myday.window', { date: view.window.localDate, start: view.window.start, end: view.window.end, zone })}
      </p>
      <p className="staff-request__hint">
        {view.serviceDay
          ? t('visitAccess.hint', { zone, start: at(view.serviceDay.startsAt), end: at(view.serviceDay.endsAt) })
          : t('visitAccess.zoneUnknown')}
      </p>
      {view.workers.length === 0 ? (
        <StateView kind="empty" title={t('visitAccess.noWorkers')} />
      ) : (
        <ul className="staff-request__list" data-testid="visit-access-workers">
          {view.workers.map((w) => (
            <li key={w.staffUserId} data-testid="visit-access-worker">
              <strong>{w.name ?? t('queue.unnamed')}</strong> ({codeLabel(t, 'reservationRole', w.role)}){' '}
              <StatusBadge tone={w.open ? 'success' : 'neutral'}>
                {w.open && w.endsAt
                  ? t(w.basis === 'extension' ? 'visitAccess.openExtension' : 'visitAccess.open', {
                      time: at(w.endsAt),
                    })
                  : w.opensAt
                    ? t('visitAccess.opensAt', { time: at(w.opensAt) })
                    : t('visitAccess.closed')}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}
      <h2 className="staff-queue__heading">{t('visitAccess.extensionsTitle')}</h2>
      {view.extensions.length === 0 ? (
        <p>{t('visitAccess.noExtensions')}</p>
      ) : (
        <ul className="staff-request__list" data-testid="visit-access-extensions">
          {view.extensions.map((x) => (
            <li key={x.id} data-testid="visit-access-extension">
              <StatusBadge tone={TONE[x.state]}>{t(STATE[x.state])}</StatusBadge>{' '}
              {t('visitAccess.extension', {
                name: x.name ?? t('queue.unnamed'),
                from: at(x.startsAt),
                to: at(x.expiresAt),
                by: x.grantedBy.name ?? t('queue.unnamed'),
                reason: x.reason,
              })}
              {x.endedAt ? (
                <p className="staff-request__hint">
                  {t('visitAccess.endedBy', {
                    at: at(x.endedAt),
                    by: x.endedBy?.name ?? t('queue.unnamed'),
                    reason: x.endReason ?? '',
                  })}
                </p>
              ) : null}
              {view.actions.extend && (x.state === 'active' || x.state === 'scheduled') ? (
                <EndExtension t={t} fetchImpl={fetchImpl} extensionId={x.id} onSaved={setView} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {view.actions.extend ? <ExtendForm t={t} fetchImpl={fetchImpl} view={view} onSaved={setView} /> : null}
    </section>
  )
}

function problemOf(r: { error: { fieldErrors: { code: string }[] } }): StaffKey {
  const code = r.error.fieldErrors[0]?.code
  return (code ? ERROR[code] : undefined) ?? 'visitAccess.error.failed'
}

function ExtendForm({
  t,
  fetchImpl,
  view,
  onSaved,
}: {
  t: T
  fetchImpl: Fetch
  view: WorkerAccessView
  onSaved: (v: WorkerAccessView) => void
}) {
  const ids = useId()
  const [worker, setWorker] = useState(view.workers[0]?.staffUserId ?? '')
  const [until, setUntil] = useState('')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<StaffKey | null>(null)
  const [saved, setSaved] = useState(false)
  const key = useRef<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setProblem(null)
    setSaved(false)
    // The datetime-local value is read in this device's zone; the server stores the instant.
    const moment = new Date(until)
    if (!until || Number.isNaN(moment.getTime())) return setProblem('visitAccess.error.time')
    if (!reason.trim()) return setProblem('visitAccess.error.reason')
    setPending(true)
    key.current = key.current ?? idempotencyKey()
    const r = await call<WorkerAccessView>(
      fetchImpl,
      `/staff/visits/${encodeURIComponent(view.visitId)}/worker-access/extensions`,
      {
        method: 'POST',
        headers: { 'idempotency-key': key.current },
        body: { staffUserId: worker, expiresAt: moment.toISOString(), reason: reason.trim() },
      },
    )
    setPending(false)
    if (r.ok || r.status > 0) key.current = null
    if (r.ok) {
      setSaved(true)
      setReason('')
      return onSaved(r.data)
    }
    setProblem(problemOf(r))
  }
  return (
    <form className="staff-request__section" aria-labelledby={`${ids}-h`} onSubmit={(e) => void submit(e)} noValidate>
      <h2 id={`${ids}-h`} className="staff-queue__heading">
        {t('visitAccess.extendTitle')}
      </h2>
      <p className="staff-request__hint">{t('visitAccess.extendHint', { hours: view.maxHours })}</p>
      <div className="staff-queue__select">
        <label htmlFor={`${ids}-worker`}>{t('visitAccess.worker')}</label>
        <select id={`${ids}-worker`} value={worker} onChange={(e) => setWorker(e.target.value)}>
          {view.workers.map((w) => (
            <option key={w.staffUserId} value={w.staffUserId}>
              {w.name ?? t('queue.unnamed')}
            </option>
          ))}
        </select>
      </div>
      <Field
        label={t('visitAccess.expiresAt')}
        type="datetime-local"
        value={until}
        onChange={(e) => setUntil(e.target.value)}
      />
      <Field
        label={t('visitAccess.reason')}
        multiline
        maxLength={500}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {problem ? (
        <p role="alert" className="hh-field__error">
          {t(problem, { hours: view.maxHours })}
        </p>
      ) : null}
      {saved ? <p role="status">{t('visitAccess.saved')}</p> : null}
      <Button type="submit" pending={pending}>
        {t('visitAccess.extend')}
      </Button>
    </form>
  )
}

function EndExtension({
  t,
  fetchImpl,
  extensionId,
  onSaved,
}: {
  t: T
  fetchImpl: Fetch
  extensionId: string
  onSaved: (v: WorkerAccessView) => void
}) {
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<StaffKey | null>(null)
  const key = useRef<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setProblem(null)
    if (!reason.trim()) return setProblem('visitAccess.error.reason')
    setPending(true)
    key.current = key.current ?? idempotencyKey()
    const r = await call<WorkerAccessView>(
      fetchImpl,
      `/staff/visit-access-extensions/${encodeURIComponent(extensionId)}/end`,
      { method: 'POST', headers: { 'idempotency-key': key.current }, body: { reason: reason.trim() } },
    )
    setPending(false)
    if (r.ok || r.status > 0) key.current = null
    if (r.ok) return onSaved(r.data)
    setProblem(problemOf(r))
  }
  return (
    <form onSubmit={(e) => void submit(e)} noValidate>
      <Field
        label={t('visitAccess.endReason')}
        maxLength={500}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {problem ? (
        <p role="alert" className="hh-field__error">
          {t(problem)}
        </p>
      ) : null}
      <Button type="submit" variant="secondary" pending={pending}>
        {t('visitAccess.end')}
      </Button>
    </form>
  )
}
