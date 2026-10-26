// A project's customer-agreed repeat-service schedule (TSK-0114; HH-SCH-10, T67, OWN-DEC-113, OWN-DEC-148,
// RULE-SERVER-AUTHZ, RULE-NO-INVENTED-FACTS). The page /repeat-service/<project>, from the request record and the staff
// queue ("Repeat-service reminders to release"), for the Owner and Office.
// - Recording: only a schedule the customer agreed to (the box says so), with the next service date, how often (or
//   one date), whether they want reminders and how staff heard the agreement. The page suggests no interval or date.
// - The schedule: its next occurrences in the property's zone (scheduled, kept inside the change notice, skipped or
//   requested with the request that carries it); staff record a change, a stop or a skip the customer asked for, and
//   link the new request that carries an occurrence. The customer can change or stop it in their workspace.
// - Reminders: drafts prepared on each occurrence's date, released by staff. Their wording is NOT CONFIGURED until the
//   Owner releases it, so none can be released; an open case holds them.
// - The history lists every change, by staff (with how the customer agreed) or by the customer.
// The server decides every action again; a refusal names its reason.
import type { StaffKey } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { reminderShownState, reminderTone } from './EstimateReminders'
import { codeLabel } from './Requests'
import { useOnline } from './Shell'

type T = (key: StaffKey, values?: Record<string, string | number | Date>) => string
type Unit = 'day' | 'week' | 'month'
type Interval = { unit: Unit; count: number } | null
const UNITS: readonly Unit[] = ['day', 'week', 'month']
const UNIT_LABEL: Record<Unit, StaffKey> = {
  day: 'repeat.unit.day',
  week: 'repeat.unit.week',
  month: 'repeat.unit.month',
}
const EVERY: Record<Unit, StaffKey> = {
  day: 'repeat.every.day',
  week: 'repeat.every.week',
  month: 'repeat.every.month',
}
const AGREEMENT = ['phone', 'in_person', 'email', 'message'] as const
type Agreement = (typeof AGREEMENT)[number]

export type RepeatSchedule = {
  id: string
  state: 'active' | 'stopped'
  version: number
  nextDate: string
  interval: Interval
  reminders: boolean
  agreedVia: string
  recordedAt: string
  stoppedAt: string | null
  stoppedBy: 'staff' | 'customer' | null
  upcoming: { date: string; state: string; requestReference: string | null }[]
  requested: { date: string; requestId: string; reference: string }[]
  reminderDrafts: {
    id: string
    date: string
    state: string
    reason: string | null
    scheduledAt: string | null
    sentAt: string | null
    cancelledAt: string | null
    createdAt: string
  }[]
  history: {
    version: number
    change: string
    by: { kind: 'staff' | 'customer'; id: string | null; name: string | null }
    nextDate: string
    interval: Interval
    reminders: boolean
    occurrenceDate: string | null
    keptDates: string[]
    agreedVia: string | null
    note: string | null
    at: string
  }[]
}
export type RepeatServiceData = {
  projectId: string
  projectReference: string
  zone: string | null
  changeNoticeHours: number | null
  reminderTime: 'CONFIGURED' | 'NOT_CONFIGURED'
  reminderWording: 'CONFIGURED' | 'NOT_CONFIGURED'
  reminderBlocks: string[]
  schedules: RepeatSchedule[]
  actions: { record: boolean; manage: boolean; releaseReminders: boolean }
}

/** "Every 2 weeks", or "One date only". */
export function intervalText(t: T, i: Interval): string {
  return i ? t(EVERY[i.unit], { count: i.count }) : t('repeat.oneDate')
}

/** The label of a refusal: the code the server names, or a general one. */
export function repeatRefusal(t: T, err: ApiErrorBody): string {
  const named = err.fieldErrors
    .map((f) => codeLabel(t, 'repeatRefusal', f.code))
    .filter((l, i) => l !== err.fieldErrors[i]?.code)
  if (named.length) return named.join(' ')
  if (err.code === 'STALE_VERSION') return t('repeat.stale')
  if (err.code === 'FORBIDDEN') return t('repeat.forbidden')
  return t('repeat.refused')
}

function reasonLabel(t: T, reason: string): string {
  const own = codeLabel(t, 'repeatReminderBlock', reason)
  return own !== reason ? own : codeLabel(t, 'reminderReason', reason)
}

/** The next date, how often and reminders: the record and change forms' shared fields. */
function ScheduleFields({
  t,
  ids,
  nextDate,
  setNextDate,
  unit,
  setUnit,
  count,
  setCount,
  reminders,
  setReminders,
  agreedVia,
  setAgreedVia,
  note,
  setNote,
}: {
  t: T
  ids: string
  nextDate: string
  setNextDate: (v: string) => void
  unit: Unit | 'none'
  setUnit: (v: Unit | 'none') => void
  count: string
  setCount: (v: string) => void
  reminders: boolean
  setReminders: (v: boolean) => void
  agreedVia: Agreement | ''
  setAgreedVia: (v: Agreement | '') => void
  note: string
  setNote: (v: string) => void
}) {
  return (
    <>
      <Field
        label={t('repeat.nextDate')}
        name="nextDate"
        type="date"
        value={nextDate}
        onChange={(e) => setNextDate(e.target.value)}
        required
      />
      <div className="staff-queue__select">
        <label htmlFor={`${ids}-unit`}>{t('repeat.howOften')}</label>
        <select id={`${ids}-unit`} value={unit} onChange={(e) => setUnit(e.target.value as Unit | 'none')}>
          <option value="none">{t('repeat.oneDate')}</option>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {t(UNIT_LABEL[u])}
            </option>
          ))}
        </select>
      </div>
      {unit !== 'none' ? (
        <Field
          label={t('repeat.count')}
          name="count"
          type="number"
          min={1}
          inputMode="numeric"
          value={count}
          onChange={(e) => setCount(e.target.value)}
          required
        />
      ) : null}
      <label className="staff-request__check">
        <input type="checkbox" checked={reminders} onChange={(e) => setReminders(e.target.checked)} />{' '}
        {t('repeat.wantsReminders')}
      </label>
      <div className="staff-queue__select">
        <label htmlFor={`${ids}-agreed`}>{t('repeat.agreedVia')}</label>
        <select
          id={`${ids}-agreed`}
          value={agreedVia}
          onChange={(e) => setAgreedVia(e.target.value as Agreement | '')}
          required
        >
          <option value="">{t('repeat.choose')}</option>
          {AGREEMENT.map((a) => (
            <option key={a} value={a}>
              {codeLabel(t, 'seriesAgreement', a)}
            </option>
          ))}
        </select>
      </div>
      <Field
        label={t('repeat.noteOptional')}
        name="note"
        multiline
        maxLength={2000}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
    </>
  )
}

export function RepeatServicePage({
  t,
  fetchImpl,
  projectId,
  href,
}: {
  t: T
  fetchImpl: Fetch
  projectId: string
  href: (to: string) => string
}) {
  const ids = useId()
  const online = useOnline()
  const [view, setView] = useState<RepeatServiceData | null | undefined>(undefined)
  const [refused, setRefused] = useState<ApiErrorBody | null>(null)
  const [nextDate, setNextDate] = useState('')
  const [unit, setUnit] = useState<Unit | 'none'>('none')
  const [count, setCount] = useState('')
  const [reminders, setReminders] = useState(true)
  const [agreedVia, setAgreedVia] = useState<Agreement | ''>('')
  const [note, setNote] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [linking, setLinking] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const key = useRef(new Map<string, string>())
  const base = `/staff/projects/${encodeURIComponent(projectId)}/repeat-service`

  const load = useCallback(async () => {
    const r = await call<RepeatServiceData>(fetchImpl, base)
    if (r.ok && Array.isArray(r.data?.schedules)) setView(r.data)
    else {
      setRefused(r.ok ? null : r.error)
      setView(null)
    }
  }, [fetchImpl, base])
  useEffect(() => {
    void load()
  }, [load])

  /** The schedule's current values in the change form. */
  const current = view?.schedules.find((s) => s.state === 'active') ?? null
  useEffect(() => {
    if (!current) return
    setNextDate(current.nextDate)
    setUnit(current.interval?.unit ?? 'none')
    setCount(current.interval ? String(current.interval.count) : '')
    setReminders(current.reminders)
  }, [current?.id, current?.version])

  /** One write with its idempotency key (kept for a retry after a server failure). */
  async function send(action: string, to: string, body: unknown, doneText: string, version?: number) {
    setPending(action)
    setProblem(null)
    setDone(null)
    const idem = key.current.get(action) ?? idempotencyKey()
    key.current.set(action, idem)
    const headers: Record<string, string> = { 'idempotency-key': idem }
    if (version !== undefined) headers['if-match'] = `"${version}"`
    const r = await call<RepeatServiceData>(fetchImpl, to, { method: 'POST', body, headers })
    setPending(null)
    if (r.ok || r.status < 500) key.current.delete(action)
    if (!r.ok) {
      setProblem(repeatRefusal(t, r.error))
      return false
    }
    setView(r.data)
    setDone(doneText)
    return true
  }

  /** The interval the form names; undefined when the count is not a whole number. */
  function interval(): Interval | undefined {
    if (unit === 'none') return null
    const n = Number(count)
    return Number.isInteger(n) && n >= 1 ? { unit, count: n } : undefined
  }
  function scheduleBody(): Record<string, unknown> | null {
    const i = interval()
    if (nextDate === '') return (setProblem(t('repeat.nextDateRequired')), null)
    if (i === undefined) return (setProblem(t('repeat.countRequired')), null)
    if (agreedVia === '') return (setProblem(t('repeat.agreedViaRequired')), null)
    return { nextDate, interval: i, reminders, agreedVia, note: note.trim() || null }
  }

  if (view === undefined) return <StateView kind="loading" title={t('common.loading')} />
  if (!view)
    return (
      <StateView kind="blocked" title={refused?.code === 'NOT_FOUND' ? t('error.NOT_FOUND') : t('repeat.refused')} />
    )
  const when = (iso: string) => new Date(iso)
  const offline = !online ? { disabledReason: t('offline.needsConnection') } : {}
  const fieldProps = {
    t,
    ids,
    nextDate,
    setNextDate,
    unit,
    setUnit,
    count,
    setCount,
    reminders,
    setReminders,
    agreedVia,
    setAgreedVia,
    note,
    setNote,
  }
  const earlier = view.schedules.filter((s) => s.state === 'stopped')

  return (
    <section className="staff-screen staff-request" aria-labelledby={`${ids}-title`} data-testid="repeat-service">
      <h1 id={`${ids}-title`} className="hh-h3">
        {t('repeat.title', { reference: view.projectReference })}
      </h1>
      <p className="staff-request__hint">{t('repeat.hint')}</p>
      {view.zone ? (
        <p>{t('repeat.zone', { zone: view.zone })}</p>
      ) : (
        <StateView kind="blocked" title={t('repeat.zoneUnknown')}>
          <p>
            <a href={href('/properties')}>{t('repeat.openProperties')}</a>
          </p>
        </StateView>
      )}
      {view.changeNoticeHours !== null ? (
        <p className="staff-request__hint">{t('repeat.notice', { hours: view.changeNoticeHours })}</p>
      ) : null}

      {view.actions.record ? (
        <form
          className="staff-request__section"
          onSubmit={(e) => {
            e.preventDefault()
            const body = scheduleBody()
            if (!body) return
            if (!agreed) return setProblem(t('repeat.agreementRequired'))
            void send('record', base, { ...body, customerAgreed: true }, t('repeat.recorded')).then(
              (ok) => ok && (setNote(''), setAgreed(false)),
            )
          }}
          noValidate
          aria-labelledby={`${ids}-record`}
        >
          <h2 id={`${ids}-record`} className="staff-queue__heading">
            {t('repeat.recordTitle')}
          </h2>
          <p className="staff-request__hint">{t('repeat.recordHint')}</p>
          <ScheduleFields {...fieldProps} />
          <label className="staff-request__check">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />{' '}
            {t('repeat.customerAgreed')}
          </label>
          <Button type="submit" pending={pending === 'record'} {...offline}>
            {t('repeat.record')}
          </Button>
        </form>
      ) : null}

      {current ? (
        <section className="staff-request__section" aria-labelledby={`${ids}-current`} data-testid="repeat-current">
          <h2 id={`${ids}-current`} className="staff-queue__heading">
            {t('repeat.currentTitle')}
          </h2>
          <p>
            <strong>{intervalText(t, current.interval)}</strong> · {t('repeat.nextFrom', { date: current.nextDate })} ·{' '}
            {current.reminders ? t('repeat.remindersOn') : t('repeat.remindersOff')}
          </p>
          <h3 className="staff-queue__heading">{t('repeat.upcomingTitle')}</h3>
          <ul data-testid="repeat-upcoming">
            {current.upcoming.map((u) => (
              <li key={u.date}>
                <strong>{u.date}</strong>{' '}
                <StatusBadge tone={u.state === 'requested' ? 'success' : u.state === 'kept' ? 'info' : 'neutral'}>
                  {codeLabel(t, 'seriesOccurrence', u.state)}
                </StatusBadge>
                {u.requestReference ? ` ${t('repeat.requestedAs', { reference: u.requestReference })}` : null}
                {view.actions.manage && u.state !== 'requested' ? (
                  <form
                    className="hh-button-row"
                    onSubmit={(e) => {
                      e.preventDefault()
                      const reference = (linking[u.date] ?? '').trim()
                      if (reference === '') return setProblem(t('repeat.referenceRequired'))
                      void send(
                        `link-${u.date}`,
                        `/staff/repeat-service/${current.id}/occurrences/${u.date}/link`,
                        { requestReference: reference },
                        t('repeat.linked'),
                        current.version,
                      )
                    }}
                    noValidate
                    aria-label={t('repeat.linkTitle', { date: u.date })}
                  >
                    <Field
                      label={t('repeat.requestReference')}
                      name={`reference-${u.date}`}
                      value={linking[u.date] ?? ''}
                      onChange={(e) => setLinking({ ...linking, [u.date]: e.target.value })}
                    />
                    <Button type="submit" variant="secondary" pending={pending === `link-${u.date}`} {...offline}>
                      {t('repeat.link')}
                    </Button>
                    <Button
                      variant="quiet"
                      pending={pending === `skip-${u.date}`}
                      onClick={() => {
                        if (agreedVia === '') return setProblem(t('repeat.agreedViaRequired'))
                        void send(
                          `skip-${u.date}`,
                          `/staff/repeat-service/${current.id}/occurrences/${u.date}/skip`,
                          { agreedVia, note: note.trim() || null },
                          t('repeat.skipped'),
                          current.version,
                        )
                      }}
                      {...offline}
                    >
                      {t('repeat.skip')}
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>

          {view.actions.manage ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const body = scheduleBody()
                if (!body) return
                void send(
                  'change',
                  `/staff/repeat-service/${current.id}/actions/change`,
                  body,
                  t('repeat.changed'),
                  current.version,
                ).then((ok) => ok && setNote(''))
              }}
              noValidate
              aria-labelledby={`${ids}-change`}
            >
              <h3 id={`${ids}-change`} className="staff-queue__heading">
                {t('repeat.changeTitle')}
              </h3>
              <p className="staff-request__hint">{t('repeat.changeHint')}</p>
              <ScheduleFields {...fieldProps} />
              <div className="hh-button-row">
                <Button type="submit" pending={pending === 'change'} {...offline}>
                  {t('repeat.change')}
                </Button>
                <Button
                  variant="secondary"
                  pending={pending === 'stop'}
                  onClick={() => {
                    if (agreedVia === '') return setProblem(t('repeat.agreedViaRequired'))
                    void send(
                      'stop',
                      `/staff/repeat-service/${current.id}/actions/stop`,
                      { agreedVia, note: note.trim() || null },
                      t('repeat.stopped'),
                      current.version,
                    )
                  }}
                  {...offline}
                >
                  {t('repeat.stop')}
                </Button>
              </div>
            </form>
          ) : null}
        </section>
      ) : view.schedules.length === 0 ? (
        <StateView kind="empty" title={t('repeat.none')} />
      ) : null}

      {view.schedules.length ? (
        <section className="staff-request__section" aria-labelledby={`${ids}-reminders`} data-testid="repeat-reminders">
          <h2 id={`${ids}-reminders`} className="staff-queue__heading">
            {t('repeat.remindersTitle')}
          </h2>
          <p className="staff-request__hint">{t('repeat.remindersHint')}</p>
          {view.reminderWording === 'NOT_CONFIGURED' ? (
            <StateView kind="blocked" title={t('repeat.wordingNotConfigured')} />
          ) : null}
          {view.reminderTime === 'NOT_CONFIGURED' ? (
            <StateView kind="blocked" title={t('repeat.timeNotConfigured')} />
          ) : null}
          {view.schedules.flatMap((s) => s.reminderDrafts.map((d) => ({ s, d }))).length ? (
            <ol className="staff-estimate__responses" aria-label={t('repeat.remindersTitle')}>
              {view.schedules.flatMap((s) =>
                s.reminderDrafts.map((d) => {
                  const state = reminderShownState(d)
                  return (
                    <li key={d.id} data-testid="repeat-reminder">
                      <p>
                        <strong>{t('repeat.reminderFor', { date: d.date })}</strong>{' '}
                        <StatusBadge tone={reminderTone(state)}>{codeLabel(t, 'reminderState', state)}</StatusBadge>
                      </p>
                      {d.sentAt ? <p>{t('repeat.sentAt', { time: when(d.sentAt) })}</p> : null}
                      {d.reason ? <p>{t('repeat.reasonShown', { reason: reasonLabel(t, d.reason) })}</p> : null}
                      {d.state === 'draft' && view.actions.releaseReminders ? (
                        <div className="hh-button-row">
                          <Button
                            pending={pending === `release-${d.id}`}
                            onClick={() =>
                              void send(
                                `release-${d.id}`,
                                `/staff/repeat-service/${s.id}/reminders/${d.id}/release`,
                                {},
                                t('repeat.released'),
                              )
                            }
                            {...offline}
                          >
                            {t('repeat.release')}
                          </Button>
                          <Button
                            variant="quiet"
                            pending={pending === `cancel-${d.id}`}
                            onClick={() =>
                              void send(
                                `cancel-${d.id}`,
                                `/staff/repeat-service/${s.id}/reminders/${d.id}/cancel`,
                                {},
                                t('repeat.cancelled'),
                              )
                            }
                            {...offline}
                          >
                            {t('repeat.cancel')}
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  )
                }),
              )}
            </ol>
          ) : (
            <p>{t('repeat.noReminders')}</p>
          )}
        </section>
      ) : null}

      {view.schedules.length ? (
        <section className="staff-request__section" aria-labelledby={`${ids}-history`}>
          <h2 id={`${ids}-history`} className="staff-queue__heading">
            {t('repeat.historyTitle')}
          </h2>
          {earlier.length ? <p>{t('repeat.earlier', { count: earlier.length })}</p> : null}
          <ul data-testid="repeat-history">
            {view.schedules.flatMap((s) =>
              [...s.history].reverse().map((h) => (
                <li key={`${s.id}-${h.version}`}>
                  <strong>{codeLabel(t, 'seriesChange', h.change)}</strong>
                  {h.occurrenceDate ? ` · ${h.occurrenceDate}` : ''} · {intervalText(t, h.interval)} ·{' '}
                  {t('repeat.nextFrom', { date: h.nextDate })}
                  <br />
                  {h.by.kind === 'customer'
                    ? t('repeat.byCustomer', { time: when(h.at) })
                    : t('repeat.byStaff', { name: h.by.name ?? t('queue.unnamed'), time: when(h.at) })}
                  {h.agreedVia ? ` · ${codeLabel(t, 'seriesAgreement', h.agreedVia)}` : ''}
                  {h.keptDates.length ? (
                    <>
                      <br />
                      {t('repeat.kept', { dates: h.keptDates.join(', ') })}
                    </>
                  ) : null}
                  {h.note ? (
                    <>
                      <br />
                      {h.note}
                    </>
                  ) : null}
                </li>
              )),
            )}
          </ul>
        </section>
      ) : null}

      {problem ? (
        <p role="alert" className="hh-field__error">
          {problem}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="staff-request__hint">
          {done}
        </p>
      ) : null}
    </section>
  )
}
