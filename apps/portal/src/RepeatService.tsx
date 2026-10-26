// The project's repeat-service schedule in the workspace (TSK-0114; HH-SCH-10, HH-ID-12, OWN-DEC-113, OWN-DEC-148).
// Shown only when HandyHub recorded a schedule the customer agreed to: how often, the next dates in the property's
// zone (with whether a request was sent for one), and whether reminders are on. The customer turns reminders off or
// back on, changes the next date and how often, or stops the schedule. A change applies to dates more than the notice
// away; a visit sooner follows the cancellation rules. Every refusal is said in words; nothing is changed by the page.
import { Button, Field } from '@handyhub/ui'
import { useEffect, useId, useRef, useState } from 'react'
import {
  idempotencyKey,
  portalApi,
  REPEAT_UNITS,
  type Fetch,
  type RepeatFailure,
  type RepeatInterval,
  type RepeatService,
  type RepeatUnit,
} from './api'
import { calendarDate, t, when } from './labels'
import type { CustomerKey } from '@handyhub/i18n'

const EVERY: Record<RepeatUnit, CustomerKey> = {
  day: 'portal.repeat.every.day',
  week: 'portal.repeat.every.week',
  month: 'portal.repeat.every.month',
}
const UNIT: Record<RepeatUnit, CustomerKey> = {
  day: 'portal.repeat.unit.day',
  week: 'portal.repeat.unit.week',
  month: 'portal.repeat.unit.month',
}
const FAILURE: Record<RepeatFailure, CustomerKey> = {
  expired: 'portal.repeat.failure.expired',
  unavailable: 'portal.repeat.failure.unavailable',
  within_notice: 'portal.repeat.failure.withinNotice',
  invalid: 'portal.repeat.failure.invalid',
  rate_limited: 'portal.repeat.failure.rateLimited',
  failed: 'portal.repeat.failure.failed',
}

export const intervalText = (i: RepeatInterval) =>
  i ? t(EVERY[i.unit], { count: i.count }) : t('portal.repeat.oneDate')

export function RepeatServiceSection({ reference, fetchImpl }: { reference: string; fetchImpl: Fetch }) {
  const ids = useId()
  const [data, setData] = useState<RepeatService | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirmStop, setConfirmStop] = useState(false)
  const [nextDate, setNextDate] = useState('')
  const [unit, setUnit] = useState<RepeatUnit | 'none'>('none')
  const [count, setCount] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const keys = useRef(new Map<string, string>())

  useEffect(() => {
    let live = true
    void portalApi.repeatService(fetchImpl, reference).then((r) => {
      if (live) setData(r.ok ? r.data : null)
    })
    return () => {
      live = false
    }
  }, [fetchImpl, reference])

  if (!data?.schedule) return null
  const s = data.schedule

  async function act(
    action: string,
    run: (key: string) => ReturnType<typeof portalApi.stopRepeatService>,
    doneText: string,
  ) {
    setPending(action)
    setProblem(null)
    setDone(null)
    const key = keys.current.get(action) ?? idempotencyKey()
    keys.current.set(action, key)
    const r = await run(key)
    setPending(null)
    if (r.ok || r.failure !== 'failed') keys.current.delete(action)
    if (!r.ok) return setProblem(t(FAILURE[r.failure], { hours: s.changeNoticeHours ?? 24 }))
    setData(r.data)
    setEditing(false)
    setConfirmStop(false)
    setDone(doneText)
  }

  function startEditing() {
    setNextDate(s.nextDates.find((d) => !d.requested)?.date ?? '')
    setUnit(s.interval?.unit ?? 'none')
    setCount(s.interval ? String(s.interval.count) : '')
    setEditing(true)
  }

  return (
    <section className="portal-section" aria-labelledby={`${ids}-title`} data-testid="portal-repeat-service">
      <h3 id={`${ids}-title`} className="hh-h3">
        {t('portal.repeat.title')}
      </h3>
      {s.state === 'stopped' ? (
        <p>{s.stoppedAt ? t('portal.repeat.stoppedOn', { time: when(s.stoppedAt) }) : t('portal.repeat.stopped')}</p>
      ) : (
        <>
          <p>
            <strong>{intervalText(s.interval)}</strong>
          </p>
          <p>{t('portal.repeat.next')}</p>
          <ul>
            {s.nextDates.map((d) => (
              <li key={d.date}>
                {calendarDate(d.date)}
                {d.requested ? ` — ${t('portal.repeat.requested')}` : ''}
              </li>
            ))}
          </ul>
          <p>{s.reminders ? t('portal.repeat.remindersOn') : t('portal.repeat.remindersOff')}</p>
          {s.changeNoticeHours !== null ? (
            <p className="hh-small hh-muted">{t('portal.repeat.notice', { hours: s.changeNoticeHours })}</p>
          ) : null}
          <div className="hh-button-row">
            <Button
              variant="secondary"
              pending={pending === 'reminders'}
              onClick={() =>
                void act(
                  'reminders',
                  (key) => portalApi.setRepeatReminders(fetchImpl, reference, !s.reminders, key),
                  s.reminders ? t('portal.repeat.remindersStopped') : t('portal.repeat.remindersRestarted'),
                )
              }
            >
              {s.reminders ? t('portal.repeat.stopReminders') : t('portal.repeat.restartReminders')}
            </Button>
            {!editing ? (
              <Button variant="secondary" onClick={startEditing}>
                {t('portal.repeat.changeSchedule')}
              </Button>
            ) : null}
            {!confirmStop ? (
              <Button variant="quiet" onClick={() => setConfirmStop(true)}>
                {t('portal.repeat.stopSchedule')}
              </Button>
            ) : null}
          </div>
          {confirmStop ? (
            <div role="group" aria-label={t('portal.repeat.stopSchedule')}>
              <p>{t('portal.repeat.stopConfirm')}</p>
              <div className="hh-button-row">
                <Button
                  variant="danger"
                  pending={pending === 'stop'}
                  onClick={() =>
                    void act(
                      'stop',
                      (key) => portalApi.stopRepeatService(fetchImpl, reference, key),
                      t('portal.repeat.stoppedDone'),
                    )
                  }
                >
                  {t('portal.repeat.stopYes')}
                </Button>
                <Button variant="quiet" onClick={() => setConfirmStop(false)}>
                  {t('portal.repeat.keep')}
                </Button>
              </div>
            </div>
          ) : null}
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const n = Number(count)
                if (nextDate === '') return setProblem(t('portal.repeat.dateRequired'))
                if (unit !== 'none' && !(Number.isInteger(n) && n >= 1))
                  return setProblem(t('portal.repeat.countRequired'))
                const interval: RepeatInterval = unit === 'none' ? null : { unit, count: n }
                void act(
                  'change',
                  (key) => portalApi.changeRepeatService(fetchImpl, reference, { nextDate, interval }, key),
                  t('portal.repeat.changed'),
                )
              }}
              noValidate
              aria-label={t('portal.repeat.changeSchedule')}
            >
              <Field
                label={t('portal.repeat.nextDate')}
                name="nextDate"
                type="date"
                value={nextDate}
                onChange={(e) => setNextDate(e.target.value)}
                required
              />
              <div className="hh-field">
                <label className="hh-field__label" htmlFor={`${ids}-unit`}>
                  {t('portal.repeat.howOften')}
                </label>
                <select
                  id={`${ids}-unit`}
                  className="hh-field__control"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as RepeatUnit | 'none')}
                >
                  <option value="none">{t('portal.repeat.oneDate')}</option>
                  {REPEAT_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {t(UNIT[u])}
                    </option>
                  ))}
                </select>
              </div>
              {unit !== 'none' ? (
                <Field
                  label={t('portal.repeat.count')}
                  name="count"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  required
                />
              ) : null}
              <div className="hh-button-row">
                <Button type="submit" pending={pending === 'change'}>
                  {t('portal.repeat.saveChange')}
                </Button>
                <Button variant="quiet" onClick={() => setEditing(false)}>
                  {t('portal.repeat.cancelChange')}
                </Button>
              </div>
            </form>
          ) : null}
        </>
      )}
      {problem ? (
        <p role="alert" className="hh-field__error">
          {problem}
        </p>
      ) : done ? (
        <p role="status" className="hh-small">
          {done}
        </p>
      ) : null}
    </section>
  )
}
