// A project's visits on the request record (TSK-0061; HH-SCH-01, HH-SCH-02, HH-DATA-06, T09, T37, T41).
// - Tentative visits are planned here: an Estimate visit on the project, or a work visit on the job once it exists.
//   A tentative visit is not a booking and is not shown to the customer; the customer's timing preferences stay on the
//   request (the Original section) and are never copied into a visit.
// - Every window is shown with its zone: the local date and times, the zone's short name at each end (EDT, EST) and
//   the IANA zone id, read from the stored UTC instants in the visit's own zone, so this device's zone never changes
//   it. The window history lists every earlier version.
// - Entering a window: the same rules as the server (@handyhub/domain/local-time) tell at once when a time does not
//   exist (spring forward) or happens twice (fall back); a repeated time needs one of its two readings chosen. The
//   server decides again and its refusal is shown.
// - TSK-0062: a tentative visit with its planning facts entered is confirmed here by choosing its workers and items
//   (Capacity.tsx); its reservations are listed with their review flags, and the ended ones as history. Moving a
//   confirmed visit moves its reservations; a capacity conflict lists every problem and the alternatives.
// - TSK-0063: a tentative visit's windows are offered to the customer here (Offers.tsx), each held for its team until
//   the offer expires; its offers are listed with their windows, holds' expiry and notices. While an offer is open the
//   visit is neither moved nor confirmed by staff: the customer selects, or staff withdraw the offer. A confirmed visit
//   shows what happened to its automatic confirmation notice.
// - TSK-0064 (HH-SCH-06, HH-SCH-05): a tentative visit lists every confirmation precondition the server says is still
//   unmet (approval, deposit, a blocking hold, a missing visit fact) as "Not ready to confirm", and Confirm is offered
//   only once nothing stops it. The server decides again on confirming.
import {
  formatOffset,
  resolveLocalTime,
  windowText,
  isClockTime,
  isLocalDate,
  type LocalResolution,
} from '@handyhub/domain/local-time'
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { AlternativesView, Assignments, ConfirmVisit, spanText, type Alternatives } from './Capacity'
import { NoticeLine, OfferWindows, VisitOffers, type Notice, type Offer, type OfferPolicy } from './Offers'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string
type StaffRef = { id: string; name: string | null }

export type VisitWindow = {
  localDate: string
  start: string
  end: string
  timeZone: string
  startOffset: string
  endOffset: string
  startsAt: string
  endsAt: string
  withinVisitHours: boolean | null
}

export type Visit = {
  id: string
  purpose: 'site_estimate' | 'service' | 'follow_up' | 'return_work'
  state: string
  version: number
  jobId: string | null
  window: VisitWindow
  windowVersion: number
  expectedDurationMinutes: number | null
  preparationBufferMinutes: number | null
  travelBufferMinutes: number | null
  requiredWorkers: number | null
  equipment: string[]
  /** The range the visit reserves its team for (null until the expected work is entered). */
  reservedRange?: { startsAt: string; endsAt: string } | null
  assignments?: {
    id: string
    resource: string
    worker: StaffRef | null
    equipment: { id: string; name: string } | null
    role: string | null
    kind: string
    startsAt: string
    endsAt: string
    holdExpiresAt: string | null
    endedAt: string | null
    endedReason: string | null
    flags: string[]
    offerNumber?: number | null
    offerPosition?: number | null
  }[]
  createdBy: StaffRef
  createdAt: string
  history: {
    windowVersion: number
    window: VisitWindow
    visitState: string
    setBy: StaffRef
    setAt: string
    reason: string | null
  }[]
  /** TSK-0063: the window offers of the visit, newest first, and its confirmation notice's deliveries. */
  offers?: Offer[]
  notices?: Notice[]
  /** TSK-0064: for a tentative visit, what still stops its confirmation (empty: nothing); null otherwise. */
  confirmationBlockers?: { field: string; code: string }[] | null
  actions: { changeWindow: boolean; confirm?: boolean; offerWindows?: boolean }
}

export type ProjectVisits = {
  projectId: string
  projectState: string
  timeZone: string
  businessTimeZone: { zone: string; proposed: boolean } | null
  visitHours: { open: string; close: string } | null
  /** TSK-0063: the offer policy (scheduling.window_offers); null while NOT CONFIGURED. */
  windowOffers?: OfferPolicy | null
  job: { id: string; scopeVersion: number | null } | null
  schedulingTask: { state: string } | null
  actions: { planEstimateVisit: boolean; planWorkVisit: boolean }
  visits: Visit[]
}

const WORK_PURPOSES = ['service', 'follow_up', 'return_work'] as const
const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')
const name = (t: T, s: StaffRef) => s.name ?? t('queue.unnamed')

/** A stored window as people read it, with its zone. */
export function shownWindow(w: VisitWindow, locale: StaffLocale): string {
  const minutes = (o: string) => (o.startsWith('-') ? -1 : 1) * (Number(o.slice(1, 3)) * 60 + Number(o.slice(4, 6)))
  return windowText(
    {
      date: w.localDate,
      start: w.start,
      end: w.end,
      zone: w.timeZone,
      startsAt: new Date(w.startsAt),
      endsAt: new Date(w.endsAt),
      startOffsetMinutes: minutes(w.startOffset),
      endOffsetMinutes: minutes(w.endOffset),
    },
    bcp47(locale),
  )
}

/** "1:30 AM EDT" for one reading of a repeated time. */
function readingText(instant: Date, zone: string, locale: StaffLocale): string {
  return new Intl.DateTimeFormat(bcp47(locale), {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(instant)
}

export type Entry = {
  localDate: string
  windowStart: string
  windowEnd: string
  startOffset: string
  endOffset: string
}
export const EMPTY_ENTRY: Entry = { localDate: '', windowStart: '', windowEnd: '', startOffset: '', endOffset: '' }

function resolution(entry: Entry, which: 'windowStart' | 'windowEnd', zone: string): LocalResolution | null {
  const time = entry[which]
  if (!isLocalDate(entry.localDate) || !isClockTime(time)) return null
  try {
    return resolveLocalTime(entry.localDate, time, zone)
  } catch {
    return null
  }
}

/** The date, the two times and, inside a repeated hour, the reading chosen for each. */
export function WindowFields({
  t,
  locale,
  zone,
  entry,
  onChange,
  errors,
}: {
  t: T
  locale: StaffLocale
  zone: string
  entry: Entry
  onChange: (e: Entry) => void
  errors: Record<string, string>
}) {
  const ids = useId()
  const part = (which: 'windowStart' | 'windowEnd', offsetKey: 'startOffset' | 'endOffset') => {
    const r = resolution(entry, which, zone)
    if (r?.kind === 'gap')
      return (
        <p className="hh-field__error" role="alert" data-testid={`${which}-gap`}>
          {t('visits.gap', {
            time: entry[which],
            date: entry.localDate,
            zone,
            from: r.skippedFrom,
            to: r.resumesAt,
          })}
        </p>
      )
    if (r?.kind !== 'repeated') return null
    return (
      <fieldset className="staff-request__check">
        <legend>{t('visits.repeated', { time: entry[which] })}</legend>
        <div className="staff-request__outcomes">
          {[r.earlier, r.later].map((reading) => {
            const value = formatOffset(reading.offsetMinutes)
            return (
              <label key={value}>
                <input
                  type="radio"
                  name={`${ids}-${offsetKey}`}
                  value={value}
                  checked={entry[offsetKey] === value}
                  onChange={() => onChange({ ...entry, [offsetKey]: value })}
                />
                {t('visits.reading', { time: readingText(reading.instant, zone, locale), offset: value })}
              </label>
            )
          })}
        </div>
        {errors[offsetKey] ? <p className="hh-field__error">{errors[offsetKey]}</p> : null}
      </fieldset>
    )
  }
  // A changed time drops a reading chosen for the old one.
  const set = (k: keyof Entry, v: string) => {
    const next = { ...entry, [k]: v }
    if (k === 'localDate' || k === 'windowStart') next.startOffset = ''
    if (k === 'localDate' || k === 'windowEnd') next.endOffset = ''
    onChange(next)
  }
  return (
    <>
      <Field
        label={t('visits.date')}
        type="date"
        required
        value={entry.localDate}
        onChange={(e) => set('localDate', e.target.value)}
        {...(errors['localDate'] ? { error: errors['localDate'] } : {})}
      />
      <Field
        label={t('visits.start')}
        type="time"
        required
        value={entry.windowStart}
        onChange={(e) => set('windowStart', e.target.value)}
        {...(errors['windowStart'] ? { error: errors['windowStart'] } : {})}
      />
      {part('windowStart', 'startOffset')}
      <Field
        label={t('visits.end')}
        type="time"
        required
        value={entry.windowEnd}
        onChange={(e) => set('windowEnd', e.target.value)}
        {...(errors['windowEnd'] ? { error: errors['windowEnd'] } : {})}
      />
      {part('windowEnd', 'endOffset')}
      <p className="staff-request__hint">{t('visits.zoneOfEntry', { zone })}</p>
    </>
  )
}

/** The server's refusal as messages per field, plus those for no field (a worker or item named by the visit's team). */
export function errorsOf(
  t: T,
  error: ApiErrorBody,
  visit?: Pick<Visit, 'assignments'>,
): { fields: Record<string, string>; general: string[] } {
  const fields: Record<string, string> = {}
  const general: string[] = []
  const team = new Map(
    (visit?.assignments ?? []).flatMap((a) =>
      a.worker
        ? [[a.worker.id, a.worker.name ?? t('queue.unnamed')] as const]
        : a.equipment
          ? [[a.equipment.id, a.equipment.name] as const]
          : [],
    ),
  )
  for (const f of error.fieldErrors) {
    const msg = codeLabel(t, 'visitProblem', f.code)
    const k = f.field.replace(/^body\./, '')
    const subject = /^(?:workers|equipment)\.(.+)$/.exec(f.field)?.[1]
    if (['localDate', 'windowStart', 'windowEnd', 'startOffset', 'endOffset'].includes(k)) fields[k] = msg
    else if (subject) general.push(t('capacity.about', { name: team.get(subject) ?? subject, problem: msg }))
    else general.push(msg)
  }
  if (error.fieldErrors.length === 0) general.push(codeLabel(t, 'visitProblem', error.code))
  return { fields, general }
}

export const windowBody = (e: Entry) => ({
  localDate: e.localDate,
  windowStart: e.windowStart,
  windowEnd: e.windowEnd,
  startOffset: e.startOffset || null,
  endOffset: e.endOffset || null,
})

const optionalInt = (s: string) => (s.trim() === '' ? null : Number(s))

function PlanForm({
  t,
  locale,
  fetchImpl,
  data,
  onPlanned,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  data: ProjectVisits
  onPlanned: (d: ProjectVisits) => void
}) {
  const ids = useId()
  const purposes = [
    ...(data.actions.planEstimateVisit ? (['site_estimate'] as const) : []),
    ...(data.actions.planWorkVisit ? WORK_PURPOSES : []),
  ]
  const [purpose, setPurpose] = useState<string>(purposes[0] ?? '')
  const [entry, setEntry] = useState<Entry>(EMPTY_ENTRY)
  const [facts, setFacts] = useState({ duration: '', preparation: '', travel: '', workers: '', equipment: '' })
  const [errors, setErrors] = useState<{ fields: Record<string, string>; general: string[] }>({
    fields: {},
    general: [],
  })
  const [pending, setPending] = useState(false)
  const key = useRef<string | null>(null)
  if (purposes.length === 0) return null
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    key.current = key.current ?? idempotencyKey()
    const r = await call<ProjectVisits>(fetchImpl, `/staff/projects/${encodeURIComponent(data.projectId)}/visits`, {
      method: 'POST',
      headers: { 'idempotency-key': key.current },
      body: {
        purpose,
        ...windowBody(entry),
        expectedDurationMinutes: optionalInt(facts.duration),
        preparationBufferMinutes: optionalInt(facts.preparation),
        travelBufferMinutes: optionalInt(facts.travel),
        requiredWorkers: optionalInt(facts.workers),
        equipment: facts.equipment
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      },
    })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (!r.ok) return setErrors(errorsOf(t, r.error))
    setErrors({ fields: {}, general: [] })
    setEntry(EMPTY_ENTRY)
    onPlanned(r.data)
  }
  const fact = (k: keyof typeof facts, label: StaffKey) => (
    <Field
      label={t(label)}
      type="number"
      min={k === 'preparation' || k === 'travel' ? 0 : 1}
      inputMode="numeric"
      value={facts[k]}
      onChange={(e) => setFacts({ ...facts, [k]: e.target.value })}
    />
  )
  return (
    <form className="staff-request__form" onSubmit={(e) => void submit(e)} aria-labelledby={`${ids}-plan`}>
      <h3 id={`${ids}-plan`}>{t('visits.plan.title')}</h3>
      <div className="staff-queue__select">
        <label htmlFor={`${ids}-purpose`}>{t('visits.purpose')}</label>
        <select id={`${ids}-purpose`} value={purpose} onChange={(e) => setPurpose(e.target.value)}>
          {purposes.map((p) => (
            <option key={p} value={p}>
              {codeLabel(t, 'visitPurpose', p)}
            </option>
          ))}
        </select>
      </div>
      <WindowFields
        t={t}
        locale={locale}
        zone={data.timeZone}
        entry={entry}
        onChange={setEntry}
        errors={errors.fields}
      />
      {fact('duration', 'visits.duration')}
      {fact('preparation', 'visits.preparation')}
      {fact('travel', 'visits.travel')}
      {fact('workers', 'visits.workers')}
      <Field
        label={t('visits.equipment')}
        multiline
        rows={3}
        value={facts.equipment}
        onChange={(e) => setFacts({ ...facts, equipment: e.target.value })}
      />
      {errors.general.length ? <StateView kind="error" title={t('visits.refused')} reasons={errors.general} /> : null}
      <div className="hh-button-row">
        <Button type="submit" pending={pending}>
          {t('visits.plan.submit')}
        </Button>
      </div>
    </form>
  )
}

function ChangeWindow({
  t,
  locale,
  fetchImpl,
  visit,
  onChanged,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  visit: Visit
  onChanged: (d: ProjectVisits | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [entry, setEntry] = useState<Entry>({
    ...EMPTY_ENTRY,
    localDate: visit.window.localDate,
    windowStart: visit.window.start,
    windowEnd: visit.window.end,
  })
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<{ fields: Record<string, string>; general: string[] }>({
    fields: {},
    general: [],
  })
  const [stale, setStale] = useState(false)
  const [alternatives, setAlternatives] = useState<Alternatives | null>(null)
  const [pending, setPending] = useState(false)
  const key = useRef<string | null>(null)
  if (!open)
    return (
      <div className="hh-button-row">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t('visits.change.open')}
        </Button>
      </div>
    )
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    key.current = key.current ?? idempotencyKey()
    const r = await call<ProjectVisits>(fetchImpl, `/staff/visits/${encodeURIComponent(visit.id)}/window`, {
      method: 'POST',
      headers: { 'idempotency-key': key.current, 'if-match': `"${visit.version}"` },
      body: { ...windowBody(entry), ...(reason.trim() ? { reason: reason.trim() } : {}) },
    })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (!r.ok) {
      if (r.error.code === 'STALE_VERSION') return setStale(true)
      setAlternatives(r.error.alternatives ?? null)
      return setErrors(errorsOf(t, r.error, visit))
    }
    setOpen(false)
    onChanged(r.data)
  }
  return (
    <form className="staff-request__form" onSubmit={(e) => void submit(e)}>
      <WindowFields
        t={t}
        locale={locale}
        zone={visit.window.timeZone}
        entry={entry}
        onChange={setEntry}
        errors={errors.fields}
      />
      {/* TSK-0066: a booked visit's reschedule records its reason (the server refuses it without one). */}
      <Field
        label={t(visit.state === 'confirmed' ? 'change.reason' : 'visits.change.reason')}
        value={reason}
        required={visit.state === 'confirmed'}
        onChange={(e) => setReason(e.target.value)}
      />
      {stale ? (
        <StateView
          kind="stale"
          title={t('conflict.title')}
          action={
            <Button variant="secondary" onClick={() => onChanged(null)}>
              {t('visits.reload')}
            </Button>
          }
        >
          <p>{t('visits.stale')}</p>
        </StateView>
      ) : null}
      {errors.general.length ? (
        <StateView kind="error" title={t('visits.refused')} reasons={errors.general}>
          {alternatives ? (
            <AlternativesView t={t} locale={locale} zone={visit.window.timeZone} alternatives={alternatives} />
          ) : null}
        </StateView>
      ) : null}
      <div className="hh-button-row">
        <Button type="submit" pending={pending}>
          {t('visits.change.submit')}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>
          {t('visits.change.cancel')}
        </Button>
      </div>
    </form>
  )
}

function VisitItem({
  t,
  locale,
  fetchImpl,
  visit,
  policy,
  when,
  onChanged,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  visit: Visit
  policy: OfferPolicy | null
  when: (iso: string) => string
  onChanged: (d: ProjectVisits | null) => void
}) {
  const notEntered = t('visits.notEntered')
  const minutes = (n: number | null) => (n === null ? notEntered : t('visits.minutes', { n }))
  const earlier = visit.history.filter((h) => h.windowVersion !== visit.windowVersion)
  // Why the current window was set (a window change's reason), kept with that window version.
  const currentReason = visit.history.find((h) => h.windowVersion === visit.windowVersion)?.reason ?? null
  return (
    <li className="staff-request__check" data-testid="visit">
      <p>
        <strong>{codeLabel(t, 'visitPurpose', visit.purpose)}</strong>{' '}
        <StatusBadge tone={visit.state === 'tentative' ? 'warning' : 'neutral'}>
          {codeLabel(t, 'visitState', visit.state)}
        </StatusBadge>
      </p>
      {visit.state === 'tentative' ? <p className="staff-request__hint">{t('visits.tentativeHint')}</p> : null}
      {visit.state === 'tentative' && visit.confirmationBlockers?.length ? (
        <div data-testid="visit-blockers">
          <StateView
            kind="blocked"
            title={t('visits.blockers.title')}
            reasons={[...new Set(visit.confirmationBlockers.map((b) => codeLabel(t, 'visitProblem', b.code)))]}
          >
            <p>{t('visits.blockers.hint')}</p>
          </StateView>
        </div>
      ) : null}
      <dl className="staff-system__fields">
        <div>
          <dt>{t('visits.window')}</dt>
          <dd data-testid="visit-window">{shownWindow(visit.window, locale)}</dd>
        </div>
        <div>
          <dt>{t('visits.utc')}</dt>
          <dd data-testid="visit-utc">
            {t('visits.utcValue', {
              start: visit.window.startsAt,
              end: visit.window.endsAt,
              startOffset: visit.window.startOffset,
              endOffset: visit.window.endOffset,
            })}
          </dd>
        </div>
        <div>
          <dt>{t('visits.link')}</dt>
          <dd>{visit.jobId ? t('visits.linkJob') : t('visits.linkProject')}</dd>
        </div>
        <div>
          <dt>{t('visits.duration')}</dt>
          <dd>{minutes(visit.expectedDurationMinutes)}</dd>
        </div>
        <div>
          <dt>{t('visits.preparation')}</dt>
          <dd>{minutes(visit.preparationBufferMinutes)}</dd>
        </div>
        <div>
          <dt>{t('visits.travel')}</dt>
          <dd>{minutes(visit.travelBufferMinutes)}</dd>
        </div>
        <div>
          <dt>{t('visits.workers')}</dt>
          <dd>{visit.requiredWorkers === null ? notEntered : String(visit.requiredWorkers)}</dd>
        </div>
        <div>
          <dt>{t('visits.equipmentShown')}</dt>
          <dd>{visit.equipment.length ? visit.equipment.join(', ') : notEntered}</dd>
        </div>
      </dl>
      {visit.reservedRange ? (
        <p className="staff-request__hint" data-testid="visit-reserved-range">
          {t('capacity.reservedRange', { span: spanText(visit.reservedRange, visit.window.timeZone, locale) })}
        </p>
      ) : null}
      <Assignments t={t} locale={locale} zone={visit.window.timeZone} assignments={visit.assignments ?? []} />
      {currentReason ? (
        <p className="staff-request__hint" data-testid="visit-window-reason">
          {t('visits.historyReason', { reason: currentReason })}
        </p>
      ) : null}
      {visit.window.withinVisitHours === false ? <StateView kind="blocked" title={t('visits.outsideHours')} /> : null}
      <p className="staff-request__hint">
        {t('visits.planned', { name: name(t, visit.createdBy), time: when(visit.createdAt) })}
      </p>
      {earlier.length ? (
        <div>
          <p>
            <strong>{t('visits.history')}</strong>
          </p>
          <ul className="staff-request__list" data-testid="visit-history">
            {earlier.map((h) => (
              <li key={h.windowVersion}>
                {t('visits.historyEntry', {
                  n: h.windowVersion,
                  window: shownWindow(h.window, locale),
                  name: name(t, h.setBy),
                  time: when(h.setAt),
                })}
                {h.reason ? ` ${t('visits.historyReason', { reason: h.reason })}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {visit.notices?.length ? (
        <div data-testid="visit-notices">
          <p className="staff-request__hint">{t('visits.notices')}</p>
          <ul className="staff-request__list">
            {visit.notices.map((n) => (
              <NoticeLine key={`${n.messageKey}-${n.channel}`} t={t} notice={n} />
            ))}
          </ul>
        </div>
      ) : null}
      <VisitOffers<ProjectVisits>
        t={t}
        locale={locale}
        fetchImpl={fetchImpl}
        offers={visit.offers ?? []}
        when={when}
        onChanged={onChanged}
      />
      {visit.actions.offerWindows && policy ? (
        <OfferWindows<ProjectVisits>
          key={`offer-${visit.id}-${visit.version}`}
          t={t}
          locale={locale}
          fetchImpl={fetchImpl}
          visit={visit}
          policy={policy}
          onOffered={onChanged}
        />
      ) : null}
      {visit.actions.confirm ? (
        <ConfirmVisit<ProjectVisits>
          key={`confirm-${visit.id}-${visit.version}`}
          t={t}
          locale={locale}
          fetchImpl={fetchImpl}
          visit={visit}
          onConfirmed={onChanged}
        />
      ) : null}
      {visit.actions.changeWindow ? (
        <ChangeWindow
          key={`${visit.id}-${visit.version}`}
          t={t}
          locale={locale}
          fetchImpl={fetchImpl}
          visit={visit}
          onChanged={onChanged}
        />
      ) : null}
    </li>
  )
}

export function ProjectVisitsSection({
  t,
  locale,
  fetchImpl,
  projectId,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  projectId: string
}) {
  const ids = useId()
  const [data, setData] = useState<ProjectVisits | null | undefined>(undefined)
  const load = useCallback(async () => {
    const r = await call<ProjectVisits>(fetchImpl, `/staff/projects/${encodeURIComponent(projectId)}/visits`)
    setData(r.ok && Array.isArray(r.data?.visits) ? r.data : null)
  }, [fetchImpl, projectId])
  useEffect(() => {
    void load()
  }, [load])
  // Roles without the scheduling view see nothing here.
  if (!data) return null
  const fmt = new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' })
  const when = (iso: string) => fmt.format(new Date(iso))
  const changed = (d: ProjectVisits | null) => (d ? setData(d) : void load())
  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-visits`} data-testid="project-visits">
      <h2 id={`${ids}-visits`} className="staff-queue__heading">
        {t('visits.title')}
      </h2>
      <p className="staff-request__hint">{t('visits.hint')}</p>
      <dl className="staff-system__fields">
        <div>
          <dt>{t('visits.zone')}</dt>
          <dd data-testid="visits-zone">{data.timeZone}</dd>
        </div>
        <div>
          <dt>{t('visits.businessZone')}</dt>
          <dd>
            {data.businessTimeZone
              ? data.businessTimeZone.proposed
                ? t('visits.businessZoneProposed', { zone: data.businessTimeZone.zone })
                : data.businessTimeZone.zone
              : t('visits.notConfigured')}
          </dd>
        </div>
        <div>
          <dt>{t('visits.hours')}</dt>
          <dd>
            {data.visitHours
              ? t('visits.hoursValue', { open: data.visitHours.open, close: data.visitHours.close })
              : t('visits.notConfigured')}
          </dd>
        </div>
        <div>
          <dt>{t('estimate.approval.job')}</dt>
          <dd data-testid="visits-job">
            {data.job
              ? data.job.scopeVersion === null
                ? t('visits.jobExists')
                : t('visits.jobScope', { n: data.job.scopeVersion })
              : t('visits.noJob')}
          </dd>
        </div>
        {data.schedulingTask ? (
          <div>
            <dt>{t('estimate.approval.task')}</dt>
            <dd data-testid="visits-task">{codeLabel(t, 'schedulingTaskState', data.schedulingTask.state)}</dd>
          </div>
        ) : null}
      </dl>
      {data.businessTimeZone === null ? <StateView kind="blocked" title={t('visits.zoneNotConfigured')} /> : null}
      {data.visits.length === 0 ? (
        <p>{t('visits.none')}</p>
      ) : (
        <ul className="staff-request__list">
          {data.visits.map((v) => (
            <VisitItem
              key={`${v.id}-${v.version}`}
              t={t}
              locale={locale}
              fetchImpl={fetchImpl}
              visit={v}
              policy={data.windowOffers ?? null}
              when={when}
              onChanged={changed}
            />
          ))}
        </ul>
      )}
      <PlanForm
        key={`${data.visits.length}-${data.actions.planEstimateVisit}-${data.actions.planWorkVisit}`}
        t={t}
        locale={locale}
        fetchImpl={fetchImpl}
        data={data}
        onPlanned={setData}
      />
    </section>
  )
}
