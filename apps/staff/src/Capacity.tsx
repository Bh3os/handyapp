// Capacity in the staff app (TSK-0062; HH-SCH-03, HH-SCH-04, T38, T39, OWN-DEC-119, OWN-DEC-123).
// - ConfirmVisit: on a tentative visit, Office and the Owner choose every worker it needs (the lead first) and an item
//   for each equipment entry, seeing each person's free periods that day, and confirm. The server checks and reserves
//   everything in one transaction; a conflict lists every unmet requirement and the alternatives it offers (other free
//   workers and items, and the free periods of that day), and nothing was saved.
// - AvailabilityScreen (the Staff screen, Owner): each person's working days and hours (a new version each time;
//   none set means that person is never reserved), approved time off (no reason is kept) and the equipment items.
//   Changes flag the appointments they touch for review; they never cancel one.
// - Assignments (TSK-0151, OWN-DEC-200 H7): the Owner may keep an appointment as it is despite a working-hours or
//   equipment flag, with a reason; time off and a disabled account are mandatory restrictions and offer no such action
//   (the server refuses them too).
// - Every time is shown with its zone, read from the UTC instants in that zone, so this device's zone never changes it.
import { DISMISSABLE_FLAGS } from '@handyhub/domain/overrides'
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string
type Span = { startsAt: string; endsAt: string }

export type CapacityDay = {
  date: string
  timeZone: string
  timeZoneProposed: boolean
  visitHours: { open: string; close: string; periods: Span[] } | null
  workers: {
    id: string
    name: string | null
    roles: string[]
    eligibleFor: { estimateVisits: boolean; workVisits: boolean }
    scheduleVersion: number | null
    working: Span[]
    timeOff: Span[]
    reservations: { id: string; visitId: string; kind: string; startsAt: string; endsAt: string; flags: string[] }[]
    free: Span[]
  }[]
  equipment: { id: string; name: string; reservations: { id: string }[]; free: Span[] }[]
}

export type Alternatives = {
  workers: { id: string; name: string | null }[]
  equipment: { id: string; name: string }[]
  periods: Span[]
}

const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')

/** "9:00 AM – 12:30 PM EDT" (the zone's short name at each end). */
export function spanText(s: Span, zone: string, locale: StaffLocale): string {
  const f = new Intl.DateTimeFormat(bcp47(locale), {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
  return `${f.format(new Date(s.startsAt))} – ${f.format(new Date(s.endsAt))}`
}

/** "Wed, Oct 21, 9:00 AM EDT" for a date and time. */
function instantText(iso: string, zone: string, locale: StaffLocale): string {
  return new Intl.DateTimeFormat(bcp47(locale), {
    timeZone: zone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(iso))
}

function weekdayName(weekday: number, locale: StaffLocale): string {
  // 2024-01-01 was a Monday; the name is read in UTC, so no device zone can shift it.
  return new Intl.DateTimeFormat(bcp47(locale), { weekday: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(2024, 0, weekday)),
  )
}

/** The refusal's reasons, each with the person or item it is about. */
export function capacityReasons(
  t: T,
  error: ApiErrorBody,
  names: { workers: Map<string, string>; equipment: Map<string, string> },
): string[] {
  const out = error.fieldErrors.map((f) => {
    const msg = codeLabel(t, 'visitProblem', f.code)
    const worker = /^workers\.(.+)$/.exec(f.field)?.[1]
    const item = /^equipment\.(.+)$/.exec(f.field)?.[1]
    if (worker) return t('capacity.about', { name: names.workers.get(worker) ?? t('queue.unnamed'), problem: msg })
    if (item) return t('capacity.about', { name: names.equipment.get(item) ?? item, problem: msg })
    return msg
  })
  return out.length ? out : [codeLabel(t, 'visitProblem', error.code)]
}

/** The alternatives of a capacity conflict, written out. */
export function AlternativesView({
  t,
  locale,
  zone,
  alternatives,
}: {
  t: T
  locale: StaffLocale
  zone: string
  alternatives: Alternatives
}) {
  const none = !alternatives.workers.length && !alternatives.equipment.length && !alternatives.periods.length
  return (
    <div data-testid="capacity-alternatives">
      <p>
        <strong>{t('capacity.alternatives')}</strong>
      </p>
      {none ? <p>{t('capacity.noAlternatives')}</p> : null}
      {alternatives.workers.length ? (
        <p>
          {t('capacity.altWorkers', {
            names: alternatives.workers.map((w) => w.name ?? t('queue.unnamed')).join(', '),
          })}
        </p>
      ) : null}
      {alternatives.equipment.length ? (
        <p>{t('capacity.altEquipment', { names: alternatives.equipment.map((e) => e.name).join(', ') })}</p>
      ) : null}
      {alternatives.periods.length ? (
        <p data-testid="capacity-alt-periods">
          {t('capacity.altPeriods', { periods: alternatives.periods.map((p) => spanText(p, zone, locale)).join('; ') })}
        </p>
      ) : null}
    </div>
  )
}

type ConfirmableVisit = {
  id: string
  purpose: string
  version: number
  window: { localDate: string; timeZone: string }
  requiredWorkers: number | null
  equipment: string[]
}

/** Confirm a tentative visit: choose its team and items, then reserve them all at once. */
export function ConfirmVisit<V>({
  t,
  locale,
  fetchImpl,
  visit,
  onConfirmed,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  visit: ConfirmableVisit
  onConfirmed: (d: V | null) => void
}) {
  const ids = useId()
  const [open, setOpen] = useState(false)
  const [day, setDay] = useState<CapacityDay | null | undefined>(undefined)
  const [workers, setWorkers] = useState<string[]>([])
  const [items, setItems] = useState<string[]>([])
  const [refusal, setRefusal] = useState<{ reasons: string[]; alternatives: Alternatives | null } | null>(null)
  const [stale, setStale] = useState(false)
  const [pending, setPending] = useState(false)
  const key = useRef<string | null>(null)
  const load = useCallback(async () => {
    const r = await call<CapacityDay>(fetchImpl, `/staff/capacity?date=${encodeURIComponent(visit.window.localDate)}`)
    setDay(r.ok ? r.data : null)
  }, [fetchImpl, visit.window.localDate])
  useEffect(() => {
    if (open) void load()
  }, [open, load])
  if (!open)
    return (
      <div className="hh-button-row">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t('capacity.confirm.open')}
        </Button>
      </div>
    )
  const work = visit.purpose !== 'site_estimate'
  const candidates = (day?.workers ?? []).filter((w) =>
    work ? w.eligibleFor.workVisits : w.eligibleFor.estimateVisits,
  )
  const zone = day?.timeZone ?? visit.window.timeZone
  const names = {
    workers: new Map((day?.workers ?? []).map((w) => [w.id, w.name ?? t('queue.unnamed')])),
    equipment: new Map((day?.equipment ?? []).map((e) => [e.id, e.name])),
  }
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    key.current = key.current ?? idempotencyKey()
    const r = await call<V>(fetchImpl, `/staff/visits/${encodeURIComponent(visit.id)}/confirm`, {
      method: 'POST',
      headers: { 'idempotency-key': key.current, 'if-match': `"${visit.version}"` },
      body: { workerIds: workers, equipmentIds: items },
    })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (!r.ok) {
      if (r.error.code === 'STALE_VERSION') return setStale(true)
      setRefusal({ reasons: capacityReasons(t, r.error, names), alternatives: r.error.alternatives ?? null })
      return void load()
    }
    setOpen(false)
    onConfirmed(r.data)
  }
  return (
    <form
      className="staff-request__form"
      onSubmit={(e) => void submit(e)}
      aria-labelledby={`${ids}-confirm`}
      data-testid="confirm-visit"
    >
      <h3 id={`${ids}-confirm`}>{t('capacity.confirm.title')}</h3>
      <p className="staff-request__hint">{t('capacity.confirm.hint', { n: visit.requiredWorkers ?? 0, zone })}</p>
      {day === undefined ? <StateView kind="loading" title={t('capacity.loading')} /> : null}
      {day === null ? <StateView kind="error" title={t('capacity.unavailable')} /> : null}
      {day ? (
        <fieldset className="staff-request__check">
          <legend>{t('capacity.confirm.workers')}</legend>
          {candidates.length === 0 ? <p>{t('capacity.noWorkers')}</p> : null}
          <div className="staff-request__outcomes">
            {candidates.map((w) => (
              <label key={w.id}>
                <input
                  type="checkbox"
                  checked={workers.includes(w.id)}
                  onChange={() => setWorkers(toggle(workers, w.id))}
                />
                {w.name ?? t('queue.unnamed')}
                {workers[0] === w.id ? ` (${codeLabel(t, 'reservationRole', 'lead')})` : ''}
                {' — '}
                {w.scheduleVersion === null
                  ? t('capacity.noHours')
                  : w.free.length
                    ? t('capacity.freeAt', { periods: w.free.map((f) => spanText(f, zone, locale)).join('; ') })
                    : t('capacity.notFree')}
              </label>
            ))}
          </div>
          <p className="staff-request__hint">{t('capacity.confirm.leadHint')}</p>
        </fieldset>
      ) : null}
      {day && (visit.equipment.length > 0 || day.equipment.length > 0) ? (
        <fieldset className="staff-request__check">
          <legend>{t('capacity.confirm.equipment', { entries: visit.equipment.join(', ') || '—' })}</legend>
          {day.equipment.length === 0 ? <p>{t('capacity.noEquipment')}</p> : null}
          <div className="staff-request__outcomes">
            {day.equipment.map((i) => (
              <label key={i.id}>
                <input type="checkbox" checked={items.includes(i.id)} onChange={() => setItems(toggle(items, i.id))} />
                {i.name}
                {i.reservations.length ? ` — ${t('capacity.itemBusy', { n: i.reservations.length })}` : ''}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      {stale ? (
        <StateView
          kind="stale"
          title={t('conflict.title')}
          action={
            <Button variant="secondary" onClick={() => onConfirmed(null)}>
              {t('visits.reload')}
            </Button>
          }
        >
          <p>{t('visits.stale')}</p>
        </StateView>
      ) : null}
      {refusal ? (
        <StateView kind="error" title={t('capacity.refused')} reasons={refusal.reasons}>
          {refusal.alternatives ? (
            <AlternativesView t={t} locale={locale} zone={zone} alternatives={refusal.alternatives} />
          ) : null}
        </StateView>
      ) : null}
      <div className="hh-button-row">
        <Button type="submit" pending={pending || !day}>
          {t('capacity.confirm.submit')}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          {t('visits.change.cancel')}
        </Button>
      </div>
    </form>
  )
}

/** The Owner keeps an appointment as it is despite one discretionary flag, with a reason (TSK-0151). */
function KeepAsIs({
  t,
  fetchImpl,
  reservationId,
  flag,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  reservationId: string
  flag: string
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [reasons, setReasons] = useState<string[]>([])
  const key = useRef<string | null>(null)
  if (!open)
    return (
      <Button variant="quiet" onClick={() => setOpen(true)}>
        {t('capacity.keep.open')}
      </Button>
    )
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    key.current = key.current ?? idempotencyKey()
    const r = await call(fetchImpl, `/staff/reservations/${encodeURIComponent(reservationId)}/flags/dismiss`, {
      method: 'POST',
      headers: { 'idempotency-key': key.current },
      body: { cause: flag, reason: reason.trim() },
    })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (!r.ok) return setReasons(errorReasons(t, r.error))
    setReasons([])
    setOpen(false)
    setReason('')
    onDone()
  }
  return (
    <form className="staff-request__form" onSubmit={(e) => void submit(e)} data-testid="keep-as-is">
      <p className="staff-request__hint">{t('capacity.keep.hint')}</p>
      {reasons.length ? <StateView kind="error" title={t('capacity.keep.refused')} reasons={reasons} /> : null}
      <Field label={t('capacity.keep.reason')} required value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="hh-button-row">
        <Button type="submit" pending={pending}>
          {t('capacity.keep.submit')}
        </Button>
        <Button variant="quiet" onClick={() => setOpen(false)}>
          {t('staffAdmin.cancel')}
        </Button>
      </div>
    </form>
  )
}

/** A visit's reservations: the active ones with their review flags, then the ended ones as history. */
export function Assignments({
  t,
  locale,
  zone,
  assignments,
  dismiss,
}: {
  t: T
  locale: StaffLocale
  zone: string
  /** TSK-0151: given to the Owner, who may keep the appointment as it is despite a discretionary flag. */
  dismiss?: { fetchImpl: Fetch; onDone: () => void }
  assignments: {
    id: string
    resource: string
    worker: { id: string; name: string | null } | null
    equipment: { id: string; name: string } | null
    role: string | null
    kind: string
    startsAt: string
    endsAt: string
    endedAt: string | null
    endedReason: string | null
    flags: string[]
  }[]
}) {
  if (assignments.length === 0) return null
  const active = assignments.filter((a) => a.endedAt === null)
  const ended = assignments.filter((a) => a.endedAt !== null)
  const who = (a: (typeof assignments)[number]) =>
    a.worker
      ? `${a.worker.name ?? t('queue.unnamed')}${a.role ? ` (${codeLabel(t, 'reservationRole', a.role)})` : ''}`
      : (a.equipment?.name ?? '')
  return (
    <div>
      {active.length ? (
        <>
          <p>
            <strong>{t('capacity.reserved')}</strong>
          </p>
          <ul className="staff-request__list" data-testid="visit-assignments">
            {active.map((a) => (
              <li key={a.id}>
                {t('capacity.assignment', {
                  who: who(a),
                  kind: codeLabel(t, 'reservationKind', a.kind),
                  span: spanText(a, zone, locale),
                })}
                {a.flags.map((f) => (
                  <span key={f}>
                    {' '}
                    <StatusBadge tone="warning">{codeLabel(t, 'reservationFlag', f)}</StatusBadge>
                  </span>
                ))}
                {dismiss
                  ? a.flags
                      .filter((f) => (DISMISSABLE_FLAGS as readonly string[]).includes(f))
                      .map((f) => (
                        <KeepAsIs
                          key={`keep-${f}`}
                          t={t}
                          fetchImpl={dismiss.fetchImpl}
                          reservationId={a.id}
                          flag={f}
                          onDone={dismiss.onDone}
                        />
                      ))
                  : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {ended.length ? (
        <>
          <p>
            <strong>{t('capacity.endedTitle')}</strong>
          </p>
          <ul className="staff-request__list" data-testid="visit-assignments-ended">
            {ended.map((a) => (
              <li key={a.id}>
                {t('capacity.ended', {
                  who: who(a),
                  span: spanText(a, zone, locale),
                  reason: codeLabel(t, 'reservationEnd', a.endedReason ?? ''),
                })}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  )
}

export type Availability = {
  businessTimeZone: { zone: string; proposed: boolean } | null
  workers: {
    id: string
    name: string | null
    status: string
    roles: string[]
    eligibleFor: { estimateVisits: boolean; workVisits: boolean }
    schedule: {
      version: number
      timeZone: string
      setAt: string
      reason: string | null
      periods: { weekday: number; start: string; end: string }[]
    } | null
    timeOff: { id: string; startsAt: string; endsAt: string; timeZone: string; recordedAt: string }[]
  }[]
  equipment: { id: string; name: string; createdAt: string }[]
}
type Change = { flagged: number; availability: Availability }

function errorReasons(t: T, error: ApiErrorBody): string[] {
  const out = error.fieldErrors.map((f) => codeLabel(t, 'availabilityProblem', f.code))
  return out.length ? out : [codeLabel(t, 'availabilityProblem', error.code)]
}

/** One write of the screen: an idempotency key per attempt, the refusal written out. */
function useWrite(fetchImpl: Fetch, t: T, onDone: (c: Change) => void) {
  const key = useRef<string | null>(null)
  const [pending, setPending] = useState(false)
  const [reasons, setReasons] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  async function send(path: string, method: string, body: unknown, version?: number) {
    setPending(true)
    key.current = key.current ?? idempotencyKey()
    const r = await call<Change>(fetchImpl, path, {
      method,
      headers: { 'idempotency-key': key.current, ...(version === undefined ? {} : { 'if-match': `"${version}"` }) },
      body,
    })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (!r.ok) {
      setNotice(null)
      setReasons(r.error.code === 'STALE_VERSION' ? [t('visits.stale')] : errorReasons(t, r.error))
      return false
    }
    setReasons([])
    setNotice(r.data.flagged > 0 ? t('availability.flagged', { n: r.data.flagged }) : t('availability.saved'))
    onDone(r.data)
    return true
  }
  return { send, pending, reasons, notice }
}

type Worker = Availability['workers'][number]
type DayRow = { works: boolean; start: string; end: string }

function HoursForm({
  t,
  locale,
  fetchImpl,
  worker,
  onDone,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  worker: Worker
  onDone: (c: Change) => void
}) {
  const ids = useId()
  const initial = (): DayRow[] =>
    [1, 2, 3, 4, 5, 6, 7].map((d) => {
      const p = worker.schedule?.periods.find((x) => x.weekday === d)
      return p ? { works: true, start: p.start, end: p.end } : { works: false, start: '', end: '' }
    })
  const [rows, setRows] = useState<DayRow[]>(initial)
  const [reason, setReason] = useState('')
  const w = useWrite(fetchImpl, t, onDone)
  const multi = (worker.schedule?.periods ?? []).some(
    (p, i, all) => all.findIndex((q) => q.weekday === p.weekday) !== i,
  )
  async function submit(e: FormEvent) {
    e.preventDefault()
    const periods = rows.flatMap((r, i) => (r.works ? [{ weekday: i + 1, start: r.start, end: r.end }] : []))
    await w.send(
      `/staff/workers/${encodeURIComponent(worker.id)}/working-hours`,
      'PUT',
      { periods, ...(reason.trim() ? { reason: reason.trim() } : {}) },
      worker.schedule?.version ?? 0,
    )
  }
  const set = (i: number, patch: Partial<DayRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  return (
    <form className="staff-request__form" onSubmit={(e) => void submit(e)} aria-labelledby={`${ids}-hours`}>
      <h4 id={`${ids}-hours`}>{t('availability.hours.title')}</h4>
      {multi ? <p className="staff-request__hint">{t('availability.hours.multi')}</p> : null}
      {rows.map((r, i) => (
        <fieldset key={i} className="staff-request__check">
          <legend>{weekdayName(i + 1, locale)}</legend>
          <label>
            <input type="checkbox" checked={r.works} onChange={(e) => set(i, { works: e.target.checked })} />
            {t('availability.hours.works')}
          </label>
          {r.works ? (
            <>
              <Field
                label={t('availability.hours.start')}
                type="time"
                required
                value={r.start}
                onChange={(e) => set(i, { start: e.target.value })}
              />
              <Field
                label={t('availability.hours.end')}
                type="time"
                required
                value={r.end}
                onChange={(e) => set(i, { end: e.target.value })}
              />
            </>
          ) : null}
        </fieldset>
      ))}
      <Field label={t('visits.change.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
      {w.reasons.length ? <StateView kind="error" title={t('availability.refused')} reasons={w.reasons} /> : null}
      {w.notice ? <StateView kind="success" title={w.notice} /> : null}
      <div className="hh-button-row">
        <Button type="submit" pending={w.pending}>
          {t('availability.hours.submit')}
        </Button>
      </div>
    </form>
  )
}

function TimeOffForm({
  t,
  fetchImpl,
  worker,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  worker: Worker
  onDone: (c: Change) => void
}) {
  const ids = useId()
  const [f, setF] = useState({ startDate: '', startTime: '', endDate: '', endTime: '' })
  const w = useWrite(fetchImpl, t, onDone)
  async function submit(e: FormEvent) {
    e.preventDefault()
    const ok = await w.send(`/staff/workers/${encodeURIComponent(worker.id)}/time-off`, 'POST', {
      startDate: f.startDate,
      startTime: f.startTime || null,
      endDate: f.endDate,
      endTime: f.endTime || null,
    })
    if (ok) setF({ startDate: '', startTime: '', endDate: '', endTime: '' })
  }
  return (
    <form className="staff-request__form" onSubmit={(e) => void submit(e)} aria-labelledby={`${ids}-off`}>
      <h4 id={`${ids}-off`}>{t('availability.timeOff.add')}</h4>
      <p className="staff-request__hint">{t('availability.timeOff.hint')}</p>
      <Field
        label={t('availability.timeOff.startDate')}
        type="date"
        required
        value={f.startDate}
        onChange={(e) => setF({ ...f, startDate: e.target.value })}
      />
      <Field
        label={t('availability.timeOff.startTime')}
        type="time"
        value={f.startTime}
        onChange={(e) => setF({ ...f, startTime: e.target.value })}
      />
      <Field
        label={t('availability.timeOff.endDate')}
        type="date"
        required
        value={f.endDate}
        onChange={(e) => setF({ ...f, endDate: e.target.value })}
      />
      <Field
        label={t('availability.timeOff.endTime')}
        type="time"
        value={f.endTime}
        onChange={(e) => setF({ ...f, endTime: e.target.value })}
      />
      {w.reasons.length ? <StateView kind="error" title={t('availability.refused')} reasons={w.reasons} /> : null}
      {w.notice ? <StateView kind="success" title={w.notice} /> : null}
      <div className="hh-button-row">
        <Button type="submit" pending={w.pending}>
          {t('availability.timeOff.submit')}
        </Button>
      </div>
    </form>
  )
}

function WithdrawTimeOff({
  t,
  fetchImpl,
  id,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  id: string
  onDone: (c: Change) => void
}) {
  const w = useWrite(fetchImpl, t, onDone)
  return (
    <>
      <Button
        variant="secondary"
        pending={w.pending}
        onClick={() => void w.send(`/staff/time-off/${encodeURIComponent(id)}/withdraw`, 'POST', {})}
      >
        {t('availability.timeOff.withdraw')}
      </Button>
      {w.reasons.length ? <StateView kind="error" title={t('availability.refused')} reasons={w.reasons} /> : null}
    </>
  )
}

function EquipmentSection({
  t,
  fetchImpl,
  items,
  onDone,
  nested = false,
}: {
  t: T
  fetchImpl: Fetch
  items: Availability['equipment']
  onDone: (c: Change) => void
  nested?: boolean
}) {
  const H = nested ? 'h3' : 'h2'
  const ids = useId()
  const [name, setName] = useState('')
  const add = useWrite(fetchImpl, t, onDone)
  const retire = useWrite(fetchImpl, t, onDone)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (await add.send('/staff/equipment', 'POST', { name })) setName('')
  }
  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-equipment`} data-testid="equipment">
      <H id={`${ids}-equipment`} className="staff-queue__heading">
        {t('availability.equipment.title')}
      </H>
      <p className="staff-request__hint">{t('availability.equipment.hint')}</p>
      {items.length === 0 ? <p>{t('availability.equipment.none')}</p> : null}
      <ul className="staff-request__list">
        {items.map((i) => (
          <li key={i.id}>
            {i.name}{' '}
            <Button
              variant="secondary"
              pending={retire.pending}
              onClick={() => void retire.send(`/staff/equipment/${encodeURIComponent(i.id)}/retire`, 'POST', {})}
            >
              {t('availability.equipment.retire')}
            </Button>
          </li>
        ))}
      </ul>
      {retire.reasons.length ? (
        <StateView kind="error" title={t('availability.refused')} reasons={retire.reasons} />
      ) : null}
      {retire.notice ? <StateView kind="success" title={retire.notice} /> : null}
      <form className="staff-request__form" onSubmit={(e) => void submit(e)}>
        <Field
          label={t('availability.equipment.name')}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {add.reasons.length ? <StateView kind="error" title={t('availability.refused')} reasons={add.reasons} /> : null}
        <div className="hh-button-row">
          <Button type="submit" pending={add.pending}>
            {t('availability.equipment.add')}
          </Button>
        </div>
      </form>
    </section>
  )
}

/**
 * Working hours, time off and equipment (Owner). TSK-0097: shown on the Staff screen below staff management, so its
 * heading is then a second-level one (headingLevel 2).
 */
export function AvailabilityScreen({
  t,
  locale,
  fetchImpl,
  headingLevel = 1,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  headingLevel?: 1 | 2
}) {
  const Title = headingLevel === 2 ? 'h2' : 'h1'
  const Sub = headingLevel === 2 ? 'h3' : 'h2'
  const [data, setData] = useState<Availability | null | undefined>(undefined)
  const load = useCallback(async () => {
    const r = await call<Availability>(fetchImpl, '/staff/availability')
    setData(r.ok ? r.data : null)
  }, [fetchImpl])
  useEffect(() => {
    void load()
  }, [load])
  const done = (c: Change) => setData(c.availability)
  return (
    <section className="staff-screen" aria-labelledby="staff-screen-title" data-testid="availability">
      <Title id="staff-screen-title" className="hh-h3">
        {t('availability.title')}
      </Title>
      <p className="staff-request__hint">{t('availability.hint')}</p>
      {data === undefined ? <StateView kind="loading" title={t('capacity.loading')} /> : null}
      {data === null ? <StateView kind="error" title={t('capacity.unavailable')} /> : null}
      {data ? (
        <>
          <p>
            {data.businessTimeZone
              ? data.businessTimeZone.proposed
                ? t('visits.businessZoneProposed', { zone: data.businessTimeZone.zone })
                : data.businessTimeZone.zone
              : t('visits.zoneNotConfigured')}
          </p>
          {data.workers.map((w) => (
            <section
              key={`${w.id}-${w.schedule?.version ?? 0}`}
              className="staff-request__section"
              data-testid="availability-worker"
            >
              <Sub className="staff-queue__heading">{w.name ?? t('queue.unnamed')}</Sub>
              <p>
                {w.eligibleFor.workVisits
                  ? t('availability.eligibleWork')
                  : w.eligibleFor.estimateVisits
                    ? t('availability.eligibleEstimate')
                    : t('availability.notReserved')}
              </p>
              <p data-testid="availability-hours">
                {w.schedule
                  ? t('availability.hours.current', {
                      n: w.schedule.version,
                      periods:
                        w.schedule.periods
                          .map((p) => `${weekdayName(p.weekday, locale)} ${p.start}–${p.end}`)
                          .join('; ') || t('availability.hours.noDays'),
                      zone: w.schedule.timeZone,
                    })
                  : t('availability.hours.notSet')}
              </p>
              {w.timeOff.length ? (
                <ul className="staff-request__list" data-testid="availability-time-off">
                  {w.timeOff.map((o) => (
                    <li key={o.id}>
                      {t('availability.timeOff.entry', {
                        from: instantText(o.startsAt, o.timeZone, locale),
                        to: instantText(o.endsAt, o.timeZone, locale),
                      })}{' '}
                      <WithdrawTimeOff t={t} fetchImpl={fetchImpl} id={o.id} onDone={done} />
                    </li>
                  ))}
                </ul>
              ) : null}
              <HoursForm t={t} locale={locale} fetchImpl={fetchImpl} worker={w} onDone={done} />
              <TimeOffForm t={t} fetchImpl={fetchImpl} worker={w} onDone={done} />
            </section>
          ))}
          <EquipmentSection
            t={t}
            fetchImpl={fetchImpl}
            items={data.equipment}
            onDone={done}
            nested={headingLevel === 2}
          />
        </>
      ) : null}
    </section>
  )
}
