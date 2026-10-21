// The scheduling board (TSK-0065; HH-SCH-13, HH-OPS-03, HH-A11Y-02, HH-A11Y-03, S05, T42, T69, OWN-DEC-119).
// - Day and week views by worker (lanes), and a simple list for phones (chosen by default on a narrow screen, and
//   always one switch away). Every time is read from the UTC instants in the business zone, so this device's zone
//   never changes it. Each worker's day shows what is booked or held (a hold is never a booking), their time off and
//   the free time left, from their own working hours only: "No working hours set" when the Owner has set none.
// - Each entry shows the purpose (an Estimate visit looks different from a work visit and says so in words, never by
//   colour alone), the arrival window, the expected work, the staff-entered travel and preparation buffers, the team
//   and the workers needed. A two-person visit shows on both workers.
// - Opening an entry shows the visit with its actions: Move (the visit's window change), Confirm with workers and
//   Offer windows (the components of the project's visits). They are the same server writes as everywhere else, with
//   the version shown (If-Match) and an idempotency key, so every precondition, the deposit gate, the holds and the
//   capacity are checked again on the server. A stale edit shows the conflict banner with the current values and is
//   never retried or overwritten; a failed change says the booking stays as it was.
// - Dragging an entry to another day of the same lane only opens the same Move form with that date filled in;
//   nothing is saved until the person chooses Save. Every drag has the form and buttons as its alternative (keyboard,
//   touch, screen readers): Move, "One day earlier" and "One day later".
// - The queue's links to a visit (/schedule/<visit id>) open the board on that visit's day with the visit open.
import { addLocalDays, isLocalDate, localDateOf } from '@handyhub/domain/local-time'
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
  type MouseEvent,
  type RefObject,
} from 'react'
import { call, idempotencyKey, type Fetch } from './api'
import { AlternativesView, ConfirmVisit, spanText, type Alternatives } from './Capacity'
import { ConflictBanner, conflictOf, type Conflict } from './ConflictBanner'
import { OfferWindows, type OfferPolicy } from './Offers'
import { codeLabel } from './Requests'
import { EMPTY_ENTRY, WindowFields, errorsOf, shownWindow, windowBody, type Entry, type VisitWindow } from './Visits'

type T = (key: StaffKey, values?: Record<string, string | number>) => string
type Span = { startsAt: string; endsAt: string }
type StaffRef = { id: string; name: string | null }

export type BoardVisit = {
  id: string
  projectId: string
  projectReference: string
  requestId: string | null
  purpose: string
  state: string
  version: number
  window: VisitWindow
  windowVersion: number
  expectedDurationMinutes: number | null
  preparationBufferMinutes: number | null
  travelBufferMinutes: number | null
  requiredWorkers: number | null
  equipment: string[]
  reservedRange: Span | null
  team: {
    worker: StaffRef
    role: string | null
    kind: string
    startsAt: string
    endsAt: string
    holdExpiresAt: string | null
    flags: string[]
  }[]
  items: { id: string; name: string; kind: string }[]
  openOffer: boolean
  confirmationBlockers: { field: string; code: string }[] | null
  actions: { changeWindow: boolean; confirm: boolean; offerWindows: boolean }
}

type BoardEntry = {
  reservationId: string
  visitId: string
  kind: string
  role: string | null
  startsAt: string
  endsAt: string
  holdExpiresAt: string | null
  flags: string[]
}

type WorkerDay = {
  date: string
  working: Span[]
  timeOff: Span[]
  free: Span[]
  workingMinutes: number
  freeMinutes: number
  entries: BoardEntry[]
}

export type Board = {
  view: 'day' | 'week'
  date: string
  days: string[]
  previous: string
  next: string
  timeZone: string
  timeZoneProposed: boolean
  visitHours: { open: string; close: string } | null
  windowOffers: OfferPolicy | null
  focusVisitId: string | null
  workers: {
    id: string
    name: string | null
    eligibleFor: { estimateVisits: boolean; workVisits: boolean }
    scheduleVersion: number | null
    days: WorkerDay[]
  }[]
  unassigned: { date: string; visitIds: string[] }[]
  visits: BoardVisit[]
}

type Layout = 'lanes' | 'list'
/** Below this width the board starts as the simple list (the lanes stay one switch away). */
const NARROW = '(max-width: 47.99rem)'
const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')

function startingLayout(): Layout {
  try {
    return typeof window !== 'undefined' && window.matchMedia?.(NARROW)?.matches ? 'list' : 'lanes'
  } catch {
    return 'lanes'
  }
}

/** "Wed, Oct 21" for a local date: read as a calendar date in UTC, so no device zone can shift it. */
function dayText(date: string, locale: StaffLocale, year = false): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Intl.DateTimeFormat(bcp47(locale), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(year ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

/** "6 h 30 min", "45 min". */
function durationText(t: T, minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return t('visits.minutes', { n: m })
  return m === 0 ? t('board.hoursOnly', { h }) : t('board.hoursMinutes', { h, m })
}

const minutesOrNot = (t: T, n: number | null) => (n === null ? t('visits.notEntered') : t('visits.minutes', { n }))
const nameOf = (t: T, s: StaffRef) => s.name ?? t('queue.unnamed')

function teamText(t: T, v: BoardVisit): string {
  const names = v.team.map(
    (m) => `${nameOf(t, m.worker)}${m.role ? ` (${codeLabel(t, 'reservationRole', m.role)})` : ''}`,
  )
  return names.length ? t('board.entry.team', { names: [...new Set(names)].join(', ') }) : t('board.entry.noTeam')
}

/** Whether a dragged visit may be dropped on this day of this lane (worker id, or null for the unassigned lane). */
function canDrop(v: BoardVisit | undefined, lane: string | null, date: string): boolean {
  if (!v || !v.actions.changeWindow || v.window.localDate === date) return false
  return lane === null ? v.team.length === 0 : v.team.some((m) => m.worker.id === lane)
}

export interface ScheduleBoardProps {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  go: (to: string) => void
  href: (to: string) => string
  /** The visit a queue link opens (/schedule/<visit id>). */
  focusVisitId?: string
}

export function ScheduleBoard({ t, locale, fetchImpl, go, href, focusVisitId }: ScheduleBoardProps) {
  const ids = useId()
  const [view, setView] = useState<'day' | 'week'>('day')
  const [layout, setLayout] = useState<Layout>(startingLayout)
  // The date asked for; null: the server's choice (today in the business zone, or the date of the visit to open).
  const [date, setDate] = useState<string | null>(null)
  const [data, setData] = useState<Board | null | undefined>(undefined)
  const [failure, setFailure] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(focusVisitId ?? null)
  const [dropped, setDropped] = useState<{ visitId: string; date: string } | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [goTo, setGoTo] = useState('')
  const [notice, setNotice] = useState('')
  const panel = useRef<HTMLHeadingElement>(null)
  const focusPanel = useRef(focusVisitId !== undefined)
  const trigger = useRef<string | null>(null)

  // Only the latest request's answer is shown: an earlier one that arrives late never replaces it.
  const latest = useRef(0)
  const load = useCallback(async () => {
    const q = new URLSearchParams({ view })
    if (date) q.set('date', date)
    else if (focusVisitId) q.set('visitId', focusVisitId)
    const n = ++latest.current
    const r = await call<Board>(fetchImpl, `/staff/schedule?${q.toString()}`)
    if (n !== latest.current) return
    if (r.ok && Array.isArray(r.data?.workers) && Array.isArray(r.data?.visits)) {
      setData(r.data)
      setFailure(null)
    } else {
      setData(null)
      setFailure(r.ok ? 'INTERNAL' : r.error.code)
    }
  }, [fetchImpl, view, date, focusVisitId])
  useEffect(() => {
    void load()
  }, [load])

  const visits = new Map((data?.visits ?? []).map((v) => [v.id, v]))
  const current = selected ? visits.get(selected) : undefined
  // Opening a visit moves focus to it; closing it returns focus to the entry that opened it.
  useEffect(() => {
    if (focusPanel.current && current && panel.current) {
      focusPanel.current = false
      panel.current.focus()
    }
  }, [current])

  function open(visitId: string, from: string | null) {
    trigger.current = from
    focusPanel.current = true
    setDropped(null)
    setNotice('')
    setSelected(visitId)
  }
  function close() {
    setSelected(null)
    setDropped(null)
    const back = trigger.current
    trigger.current = null
    if (back) requestAnimationFrame(() => document.getElementById(back)?.focus())
  }
  function navigate(to: string, nextView = view) {
    setDate(to)
    setView(nextView)
  }

  const drag = {
    start: (e: DragEvent<HTMLElement>, visitId: string) => {
      e.dataTransfer.setData('text/plain', visitId)
      e.dataTransfer.effectAllowed = 'move'
      setDragging(visitId)
    },
    end: () => setDragging(null),
    over: (e: DragEvent<HTMLElement>, lane: string | null, day: string) => {
      if (!dragging || !canDrop(visits.get(dragging), lane, day)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    },
    drop: (e: DragEvent<HTMLElement>, lane: string | null, day: string) => {
      const id = dragging ?? e.dataTransfer.getData('text/plain')
      setDragging(null)
      if (!canDrop(visits.get(id), lane, day)) return
      e.preventDefault()
      trigger.current = null
      focusPanel.current = true
      setNotice('')
      setSelected(id)
      setDropped({ visitId: id, date: day })
    },
  }

  const heading = (
    <h1 id={`${ids}-title`} className="hh-h3">
      {t('nav.schedule')}
    </h1>
  )
  if (data === undefined)
    return (
      <section className="staff-screen" aria-labelledby={`${ids}-title`}>
        {heading}
        <StateView kind="loading" title={t('board.loading')} />
      </section>
    )
  if (data === null)
    return (
      <section className="staff-screen" aria-labelledby={`${ids}-title`}>
        {heading}
        {failure === 'NOT_CONFIGURED' ? (
          <StateView kind="blocked" title={t('board.notConfigured')} />
        ) : (
          <StateView
            kind="error"
            title={t('board.unavailable')}
            action={
              <Button variant="secondary" onClick={() => void load()}>
                {t('visits.reload')}
              </Button>
            }
          />
        )}
      </section>
    )

  const zone = data.timeZone
  const range =
    data.view === 'day'
      ? dayText(data.date, locale, true)
      : t('board.rangeWeek', {
          from: dayText(data.days[0] as string, locale),
          to: dayText(data.days[data.days.length - 1] as string, locale, true),
        })
  const unassigned = new Map(data.unassigned.map((u) => [u.date, u.visitIds]))
  const entryProps = { t, locale, zone, drag, open }

  return (
    <section className="staff-screen staff-board" aria-labelledby={`${ids}-title`} data-testid="schedule-board">
      {heading}
      <p className="staff-request__hint">{t('board.hint')}</p>
      <p className="staff-request__hint" data-testid="board-zone">
        {data.timeZoneProposed ? t('board.zoneProposed', { zone }) : t('board.zone', { zone })}
      </p>
      <div className="staff-board__controls" role="group" aria-label={t('board.controls')}>
        <div className="staff-board__switch" role="group" aria-label={t('board.range')}>
          <span aria-hidden="true">{t('board.range')}</span>
          {(['day', 'week'] as const).map((v) => (
            <Button
              key={v}
              variant={data.view === v ? 'primary' : 'secondary'}
              aria-pressed={data.view === v}
              onClick={() => navigate(data.date, v)}
            >
              {t(v === 'day' ? 'board.range.day' : 'board.range.week')}
            </Button>
          ))}
        </div>
        <div className="staff-board__switch" role="group" aria-label={t('board.layout')}>
          <span aria-hidden="true">{t('board.layout')}</span>
          {(['lanes', 'list'] as const).map((l) => (
            <Button
              key={l}
              variant={layout === l ? 'primary' : 'secondary'}
              aria-pressed={layout === l}
              onClick={() => setLayout(l)}
            >
              {t(l === 'lanes' ? 'board.layout.lanes' : 'board.layout.list')}
            </Button>
          ))}
        </div>
        <div className="hh-button-row">
          <Button variant="secondary" onClick={() => navigate(data.previous)}>
            {t(data.view === 'day' ? 'board.previous.day' : 'board.previous.week')}
          </Button>
          <Button variant="secondary" onClick={() => navigate(localDateOf(new Date(), data.timeZone))}>
            {t('board.today')}
          </Button>
          <Button variant="secondary" onClick={() => navigate(data.next)}>
            {t(data.view === 'day' ? 'board.next.day' : 'board.next.week')}
          </Button>
        </div>
        <form
          className="staff-board__goto"
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            if (isLocalDate(goTo)) navigate(goTo)
          }}
        >
          <Field label={t('board.goTo')} type="date" value={goTo} onChange={(e) => setGoTo(e.target.value)} />
          <Button type="submit" variant="secondary">
            {t('board.goToSubmit')}
          </Button>
        </form>
      </div>
      <h2 className="staff-queue__heading" data-testid="board-range">
        {range}
      </h2>
      {notice ? (
        <p role="status" className="staff-board__notice" data-testid="board-notice">
          {notice}
        </p>
      ) : null}
      {current ? (
        <SelectedVisit
          key={`${current.id}-${dropped?.visitId === current.id ? dropped.date : ''}`}
          t={t}
          locale={locale}
          fetchImpl={fetchImpl}
          go={go}
          href={href}
          visit={current}
          policy={data.windowOffers}
          headingRef={panel}
          droppedOn={dropped?.visitId === current.id ? dropped.date : null}
          onClose={close}
          onChanged={(message, movedTo) => {
            if (message) setNotice(message)
            // A visit moved outside the days shown: show its new day, with the visit still open.
            focusPanel.current = message !== null
            if (movedTo && !data.days.includes(movedTo)) setDate(movedTo)
            else void load()
          }}
        />
      ) : null}
      <p className="staff-request__hint">{t('board.dragHint')}</p>
      {layout === 'lanes' ? (
        <div className="staff-board__lanes" data-view={data.view} data-testid="board-lanes">
          {data.workers.length === 0 ? <p>{t('board.noWorkers')}</p> : null}
          {data.workers.map((w) => (
            <section
              key={w.id}
              className="staff-board__lane"
              aria-labelledby={`${ids}-lane-${w.id}`}
              data-testid="board-lane"
            >
              <h3 id={`${ids}-lane-${w.id}`} className="staff-board__lane-title">
                {nameOf(t, { id: w.id, name: w.name })}
              </h3>
              <ul className="staff-board__days">
                {w.days.map((d) => (
                  <li
                    key={d.date}
                    className="staff-board__day"
                    data-testid="board-day"
                    data-date={d.date}
                    data-drop={dragging && canDrop(visits.get(dragging), w.id, d.date) ? 'ok' : undefined}
                    onDragOver={(e) => drag.over(e, w.id, d.date)}
                    onDrop={(e) => drag.drop(e, w.id, d.date)}
                  >
                    <h4 className="staff-board__day-title">{dayText(d.date, locale)}</h4>
                    <p className="staff-board__capacity" data-testid="board-capacity">
                      {w.scheduleVersion === null
                        ? t('board.noHours')
                        : t('board.free', { time: durationText(t, d.freeMinutes) })}
                    </p>
                    {d.timeOff.length ? (
                      <p className="staff-board__capacity">
                        {t('board.timeOff', { spans: d.timeOff.map((s) => spanText(s, zone, locale)).join('; ') })}
                      </p>
                    ) : null}
                    {d.entries.length === 0 ? (
                      <p className="staff-request__hint">{t('board.empty')}</p>
                    ) : (
                      <ul className="staff-board__entries">
                        {d.entries.map((e) => (
                          <EntryItem
                            key={e.reservationId}
                            {...entryProps}
                            id={`${ids}-e-${e.reservationId}`}
                            visit={visits.get(e.visitId)}
                            entry={e}
                          />
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <section
            className="staff-board__lane staff-board__lane--unassigned"
            aria-labelledby={`${ids}-lane-unassigned`}
            data-testid="board-unassigned"
          >
            <h3 id={`${ids}-lane-unassigned`} className="staff-board__lane-title">
              {t('board.unassigned')}
            </h3>
            <ul className="staff-board__days">
              {data.days.map((day) => {
                const list = (unassigned.get(day) ?? []).flatMap((id) => (visits.has(id) ? [id] : []))
                return (
                  <li
                    key={day}
                    className="staff-board__day"
                    data-date={day}
                    data-drop={dragging && canDrop(visits.get(dragging), null, day) ? 'ok' : undefined}
                    onDragOver={(e) => drag.over(e, null, day)}
                    onDrop={(e) => drag.drop(e, null, day)}
                  >
                    <h4 className="staff-board__day-title">{dayText(day, locale)}</h4>
                    {list.length === 0 ? (
                      <p className="staff-request__hint">{t('board.empty')}</p>
                    ) : (
                      <ul className="staff-board__entries">
                        {list.map((id) => (
                          <EntryItem key={id} {...entryProps} id={`${ids}-u-${id}`} visit={visits.get(id)} />
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        </div>
      ) : (
        <ListView t={t} locale={locale} data={data} visits={visits} entryId={(id) => `${ids}-l-${id}`} open={open} />
      )}
    </section>
  )
}

type Drag = {
  start: (e: DragEvent<HTMLElement>, visitId: string) => void
  end: () => void
}

/** One entry: a button that opens the visit, draggable to another day when the visit may be moved. */
function EntryItem({
  t,
  locale,
  zone,
  id,
  visit,
  entry,
  drag,
  open,
}: {
  t: T
  locale: StaffLocale
  zone: string
  id: string
  visit: BoardVisit | undefined
  entry?: BoardEntry
  /** Absent in the list, which has no days to drop on. */
  drag?: Drag
  open: (visitId: string, from: string | null) => void
}) {
  if (!visit) return null
  const estimate = visit.purpose === 'site_estimate'
  const held = entry?.kind === 'hold'
  return (
    <li
      className="staff-board__item"
      draggable={drag !== undefined && visit.actions.changeWindow && !held}
      onDragStart={drag ? (e) => drag.start(e, visit.id) : undefined}
      onDragEnd={drag?.end}
      data-testid="board-entry"
      data-visit={visit.id}
    >
      <button
        type="button"
        id={id}
        className={[
          'staff-board__entry',
          estimate ? 'staff-board__entry--estimate' : 'staff-board__entry--work',
          held ? 'staff-board__entry--hold' : '',
          visit.state === 'tentative' ? 'staff-board__entry--tentative' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => open(visit.id, id)}
      >
        <span className="staff-board__purpose">
          <span aria-hidden="true" className="staff-board__mark">
            {estimate ? '◇' : '■'}
          </span>{' '}
          {codeLabel(t, 'visitPurpose', visit.purpose)}
        </span>
        <span className="staff-board__line">{shownWindow(visit.window, locale)}</span>
        <span className="staff-board__line">
          <StatusBadge tone={visit.state === 'tentative' ? 'warning' : 'neutral'}>
            {codeLabel(t, 'visitState', visit.state)}
          </StatusBadge>
          {held && entry ? (
            <>
              {' '}
              <StatusBadge tone="info">{codeLabel(t, 'reservationKind', 'hold')}</StatusBadge>
            </>
          ) : null}
        </span>
        {held && entry ? (
          <span className="staff-board__line">{t('board.entry.held', { span: spanText(entry, zone, locale) })}</span>
        ) : null}
        <span className="staff-board__line">
          {t('board.entry.facts', {
            work: minutesOrNot(t, visit.expectedDurationMinutes),
            travel: minutesOrNot(t, visit.travelBufferMinutes),
            preparation: minutesOrNot(t, visit.preparationBufferMinutes),
          })}
        </span>
        <span className="staff-board__line">
          {teamText(t, visit)}
          {visit.requiredWorkers !== null ? ` · ${t('board.entry.needs', { n: visit.requiredWorkers })}` : ''}
        </span>
        <span className="staff-board__line">{t('board.selected.project', { reference: visit.projectReference })}</span>
        {visit.openOffer ? <span className="staff-board__line">{t('board.entry.offered')}</span> : null}
        {visit.confirmationBlockers?.length ? (
          <span className="staff-board__line">{t('board.entry.notReady')}</span>
        ) : null}
        {(entry?.flags ?? []).map((f) => (
          <span key={f} className="staff-board__line">
            <StatusBadge tone="warning">{codeLabel(t, 'reservationFlag', f)}</StatusBadge>
          </span>
        ))}
      </button>
    </li>
  )
}

/** The simple list for phones: each day once, its visits in time order, then the free time left per worker. */
function ListView({
  t,
  locale,
  data,
  visits,
  entryId,
  open,
}: {
  t: T
  locale: StaffLocale
  data: Board
  visits: Map<string, BoardVisit>
  entryId: (visitId: string) => string
  open: (visitId: string, from: string | null) => void
}) {
  const ids = useId()
  // A visit is listed on its window's day, or (a hold on another day) on the first day it occupies someone.
  const dayOf = (v: BoardVisit) =>
    data.days.includes(v.window.localDate)
      ? v.window.localDate
      : (data.days.find((d) =>
          data.workers.some((w) => w.days.some((x) => x.date === d && x.entries.some((e) => e.visitId === v.id))),
        ) ?? v.window.localDate)
  const sorted = [...visits.values()].sort((a, b) => a.window.startsAt.localeCompare(b.window.startsAt))
  return (
    <div className="staff-board__list" data-testid="board-list">
      {data.days.map((day) => {
        const list = sorted.filter((v) => dayOf(v) === day)
        return (
          <section key={day} aria-labelledby={`${ids}-${day}`} className="staff-board__list-day" data-date={day}>
            <h3 id={`${ids}-${day}`} className="staff-board__lane-title">
              {dayText(day, locale)}
            </h3>
            {list.length === 0 ? (
              <p className="staff-request__hint">{t('board.empty')}</p>
            ) : (
              <ul className="staff-board__entries">
                {list.map((v) => (
                  <EntryItem
                    key={v.id}
                    t={t}
                    locale={locale}
                    zone={data.timeZone}
                    id={entryId(v.id)}
                    visit={v}
                    open={open}
                  />
                ))}
              </ul>
            )}
            {data.workers.length ? (
              <div>
                <p className="staff-board__capacity">
                  <strong>{t('board.list.capacity')}</strong>
                </p>
                <ul className="staff-request__list" data-testid="board-list-capacity">
                  {data.workers.map((w) => {
                    const d = w.days.find((x) => x.date === day)
                    return (
                      <li key={w.id}>
                        {t('board.list.worker', {
                          name: nameOf(t, { id: w.id, name: w.name }),
                          free:
                            w.scheduleVersion === null || !d
                              ? t('board.noHours')
                              : t('board.free', { time: durationText(t, d.freeMinutes) }),
                        })}
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}

/** The open visit: its facts, its team and its actions (Move, Confirm with workers, Offer windows). */
function SelectedVisit({
  t,
  locale,
  fetchImpl,
  go,
  href,
  visit,
  policy,
  headingRef,
  droppedOn,
  onClose,
  onChanged,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  go: (to: string) => void
  href: (to: string) => string
  visit: BoardVisit
  policy: OfferPolicy | null
  headingRef: RefObject<HTMLHeadingElement | null>
  droppedOn: string | null
  onClose: () => void
  onChanged: (message: string | null, movedTo?: string) => void
}) {
  const ids = useId()
  const [moving, setMoving] = useState(droppedOn !== null)
  const zone = visit.window.timeZone
  const recordLink = visit.requestId ? `/requests/${visit.requestId}` : null
  return (
    <section
      className="staff-request__section staff-board__selected"
      aria-labelledby={`${ids}-title`}
      data-testid="board-selected"
    >
      <h2 id={`${ids}-title`} ref={headingRef} tabIndex={-1} className="staff-queue__heading">
        {codeLabel(t, 'visitPurpose', visit.purpose)} ·{' '}
        {t('board.selected.project', { reference: visit.projectReference })}
      </h2>
      <p>
        <StatusBadge tone={visit.state === 'tentative' ? 'warning' : 'neutral'}>
          {codeLabel(t, 'visitState', visit.state)}
        </StatusBadge>
        {visit.openOffer ? (
          <>
            {' '}
            <StatusBadge tone="info">{t('board.entry.offered')}</StatusBadge>
          </>
        ) : null}
      </p>
      {visit.state === 'tentative' && visit.confirmationBlockers?.length ? (
        <div data-testid="board-blockers">
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
          <dd data-testid="board-selected-window">{shownWindow(visit.window, locale)}</dd>
        </div>
        <div>
          <dt>{t('visits.duration')}</dt>
          <dd>{minutesOrNot(t, visit.expectedDurationMinutes)}</dd>
        </div>
        <div>
          <dt>{t('visits.travel')}</dt>
          <dd>{minutesOrNot(t, visit.travelBufferMinutes)}</dd>
        </div>
        <div>
          <dt>{t('visits.preparation')}</dt>
          <dd>{minutesOrNot(t, visit.preparationBufferMinutes)}</dd>
        </div>
        <div>
          <dt>{t('visits.workers')}</dt>
          <dd>{visit.requiredWorkers === null ? t('visits.notEntered') : String(visit.requiredWorkers)}</dd>
        </div>
        <div>
          <dt>{t('board.selected.team')}</dt>
          <dd data-testid="board-selected-team">
            {visit.team.length === 0 ? (
              t('board.entry.noTeam')
            ) : (
              <ul className="staff-request__list">
                {visit.team.map((m) => (
                  <li key={`${m.worker.id}-${m.startsAt}`}>
                    {t('capacity.assignment', {
                      who: `${nameOf(t, m.worker)}${m.role ? ` (${codeLabel(t, 'reservationRole', m.role)})` : ''}`,
                      kind: codeLabel(t, 'reservationKind', m.kind),
                      span: spanText(m, zone, locale),
                    })}
                    {m.flags.map((f) => (
                      <span key={f}>
                        {' '}
                        <StatusBadge tone="warning">{codeLabel(t, 'reservationFlag', f)}</StatusBadge>
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </dd>
        </div>
        <div>
          <dt>{t('visits.equipmentShown')}</dt>
          <dd>{visit.equipment.length ? visit.equipment.join(', ') : t('visits.notEntered')}</dd>
        </div>
      </dl>
      {visit.reservedRange ? (
        <p className="staff-request__hint">
          {t('capacity.reservedRange', { span: spanText(visit.reservedRange, zone, locale) })}
        </p>
      ) : null}
      {visit.window.withinVisitHours === false ? <StateView kind="blocked" title={t('visits.outsideHours')} /> : null}
      <div className="hh-button-row">
        {recordLink ? (
          <a
            className="hh-button hh-button--secondary"
            href={href(recordLink)}
            onClick={(e: MouseEvent<HTMLAnchorElement>) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
              e.preventDefault()
              go(recordLink)
            }}
          >
            {t('board.selected.record')}
          </a>
        ) : null}
        {visit.actions.changeWindow && !moving ? (
          <Button variant="secondary" onClick={() => setMoving(true)}>
            {t('board.move.open')}
          </Button>
        ) : null}
        <Button variant="quiet" onClick={onClose}>
          {t('board.selected.close')}
        </Button>
      </div>
      {visit.actions.changeWindow && moving ? (
        <MoveVisit
          t={t}
          locale={locale}
          fetchImpl={fetchImpl}
          visit={visit}
          droppedOn={droppedOn}
          onCancel={() => setMoving(false)}
          onSaved={(movedTo) => {
            setMoving(false)
            onChanged(t('board.move.saved'), movedTo)
          }}
          onReload={() => onChanged(null)}
        />
      ) : null}
      {visit.actions.confirm ? (
        <ConfirmVisit<unknown>
          key={`confirm-${visit.id}-${visit.version}`}
          t={t}
          locale={locale}
          fetchImpl={fetchImpl}
          visit={visit}
          onConfirmed={() => onChanged(null)}
        />
      ) : null}
      {visit.actions.offerWindows && policy ? (
        <OfferWindows<unknown>
          key={`offer-${visit.id}-${visit.version}`}
          t={t}
          locale={locale}
          fetchImpl={fetchImpl}
          visit={visit}
          policy={policy}
          onOffered={() => onChanged(null)}
        />
      ) : null}
    </section>
  )
}

/**
 * Move a visit: its new window as the next window version, sent with the version this person saw. A stale version
 * shows the conflict banner with the current values; "Review and redo" keeps the entry on the current version, to be
 * saved again (and checked again) only when the person chooses Save.
 */
function MoveVisit({
  t,
  locale,
  fetchImpl,
  visit,
  droppedOn,
  onCancel,
  onSaved,
  onReload,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  visit: BoardVisit
  droppedOn: string | null
  onCancel: () => void
  onSaved: (movedTo: string) => void
  onReload: () => void
}) {
  const ids = useId()
  const [entry, setEntry] = useState<Entry>({
    ...EMPTY_ENTRY,
    localDate: droppedOn ?? visit.window.localDate,
    windowStart: visit.window.start,
    windowEnd: visit.window.end,
  })
  const [reason, setReason] = useState('')
  const [expected, setExpected] = useState(visit.version)
  // The state the person saw when they started, shown beside the current one in a conflict.
  const [seenState] = useState(visit.state)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [errors, setErrors] = useState<{ fields: Record<string, string>; general: string[] }>({
    fields: {},
    general: [],
  })
  const [alternatives, setAlternatives] = useState<Alternatives | null>(null)
  const [pending, setPending] = useState(false)
  const key = useRef<string | null>(null)
  const shift = (days: number) => {
    if (!isLocalDate(entry.localDate)) return
    setEntry({ ...entry, localDate: addLocalDays(entry.localDate, days), startOffset: '', endOffset: '' })
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    key.current = key.current ?? idempotencyKey()
    const r = await call<unknown>(fetchImpl, `/staff/visits/${encodeURIComponent(visit.id)}/window`, {
      method: 'POST',
      headers: { 'idempotency-key': key.current, 'if-match': `"${expected}"` },
      body: { ...windowBody(entry), ...(reason.trim() ? { reason: reason.trim() } : {}) },
    })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (r.ok) return onSaved(entry.localDate)
    const stale = conflictOf(r.error)
    if (stale) {
      setErrors({ fields: {}, general: [] })
      setAlternatives(null)
      return setConflict(stale)
    }
    setConflict(null)
    setAlternatives(r.error.alternatives ?? null)
    setErrors(errorsOf(t, r.error))
  }
  const state = (s: unknown) => (typeof s === 'string' && s ? codeLabel(t, 'visitState', s) : s)
  return (
    <form
      className="staff-request__form"
      onSubmit={(e) => void submit(e)}
      aria-labelledby={`${ids}-move`}
      data-testid="board-move"
    >
      <h3 id={`${ids}-move`}>{t('board.move.title')}</h3>
      {droppedOn ? (
        <p role="status" className="staff-board__notice">
          {t('board.move.dropped', { date: dayText(droppedOn, locale, true) })}
        </p>
      ) : null}
      <p className="staff-request__hint">{t('board.move.hint')}</p>
      <WindowFields
        t={t}
        locale={locale}
        zone={visit.window.timeZone}
        entry={entry}
        onChange={setEntry}
        errors={errors.fields}
      />
      <div className="hh-button-row">
        <Button variant="secondary" onClick={() => shift(-1)}>
          {t('board.move.earlier')}
        </Button>
        <Button variant="secondary" onClick={() => shift(1)}>
          {t('board.move.later')}
        </Button>
      </div>
      <Field label={t('visits.change.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
      {conflict ? (
        <ConflictBanner
          t={t}
          conflict={{ ...conflict, values: { ...conflict.values, state: state(conflict.values['state']) } }}
          fields={[
            { name: 'localDate', label: t('visits.date'), yours: entry.localDate },
            { name: 'windowStart', label: t('visits.start'), yours: entry.windowStart },
            { name: 'windowEnd', label: t('visits.end'), yours: entry.windowEnd },
            { name: 'state', label: t('board.field.state'), yours: state(seenState) },
          ]}
          onUseCurrent={() => {
            setConflict(null)
            onReload()
            onCancel()
          }}
          onRedo={(c) => {
            setConflict(null)
            setExpected(c.version)
            onReload()
          }}
        />
      ) : null}
      {errors.general.length ? (
        <StateView kind="error" title={t('visits.refused')} reasons={errors.general}>
          <p>{t('board.move.kept')}</p>
          {alternatives ? (
            <AlternativesView t={t} locale={locale} zone={visit.window.timeZone} alternatives={alternatives} />
          ) : null}
        </StateView>
      ) : null}
      <div className="hh-button-row">
        <Button type="submit" pending={pending}>
          {t('visits.change.submit')}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t('visits.change.cancel')}
        </Button>
      </div>
    </form>
  )
}
