// The internal business-day calendar on the Owner's Settings screen (TSK-0136; OWN-DEC-205, FACT-BUSINESS-CALENDAR,
// RULE-LANGUAGES). The Owner sees the calendar in force (the business weekdays, the federal holidays it excludes with
// their observed dates this year and next, the further closed dates) and changes it with a reason and a fresh sign-in;
// the server records a new audited configuration version. A request keeps the dates counted when it was received. The
// screen says the calendar is for internal service targets only and never sets a legal deadline. Hidden when the
// server refuses it (another role).
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView } from '@handyhub/ui'
import { useEffect, useId, useState, type FormEvent } from 'react'
import { call, type ApiErrorBody, type Fetch } from './api'
import { ReauthForm, useOwnerWrite } from './OwnerWrite'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
type Weekday = (typeof WEEKDAYS)[number]
const HOLIDAYS = [
  'new_years_day',
  'martin_luther_king_jr_birthday',
  'washingtons_birthday',
  'memorial_day',
  'juneteenth',
  'independence_day',
  'labor_day',
  'columbus_day',
  'veterans_day',
  'thanksgiving_day',
  'christmas_day',
] as const
type Holiday = (typeof HOLIDAYS)[number]

const WEEKDAY: Record<Weekday, StaffKey> = {
  monday: 'businessCalendar.weekday.monday',
  tuesday: 'businessCalendar.weekday.tuesday',
  wednesday: 'businessCalendar.weekday.wednesday',
  thursday: 'businessCalendar.weekday.thursday',
  friday: 'businessCalendar.weekday.friday',
  saturday: 'businessCalendar.weekday.saturday',
  sunday: 'businessCalendar.weekday.sunday',
}
const HOLIDAY: Record<Holiday, StaffKey> = {
  new_years_day: 'businessCalendar.holiday.new_years_day',
  martin_luther_king_jr_birthday: 'businessCalendar.holiday.martin_luther_king_jr_birthday',
  washingtons_birthday: 'businessCalendar.holiday.washingtons_birthday',
  memorial_day: 'businessCalendar.holiday.memorial_day',
  juneteenth: 'businessCalendar.holiday.juneteenth',
  independence_day: 'businessCalendar.holiday.independence_day',
  labor_day: 'businessCalendar.holiday.labor_day',
  columbus_day: 'businessCalendar.holiday.columbus_day',
  veterans_day: 'businessCalendar.holiday.veterans_day',
  thanksgiving_day: 'businessCalendar.holiday.thanksgiving_day',
  christmas_day: 'businessCalendar.holiday.christmas_day',
}

export type BusinessCalendarSettingView = {
  state: 'CONFIGURED' | 'NOT_CONFIGURED'
  version: number | null
  calendar: { workdays: Weekday[]; holidays: Holiday[]; observance: string; closedDates: string[] } | null
  sourceIds: string[]
  observed: { holiday: Holiday; date: string; observed: string }[]
}

/** A YYYY-MM-DD date as people read it; a calendar date has no zone, so it is formatted as UTC noon. */
export function calendarDay(date: string, locale: StaffLocale): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', {
    dateStyle: 'full',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))
}

/** The closed dates typed in the box: one per row, blank rows dropped; null when one is not a YYYY-MM-DD date. */
export function closedDatesOf(text: string): string[] | null {
  const out = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '')
  return out.every((l) => /^\d{4}-\d{2}-\d{2}$/.test(l)) ? [...new Set(out)].sort() : null
}

function refusal(t: T, err: ApiErrorBody): string[] {
  if (err.code === 'STALE_VERSION') return [t('ownerApproval.stale')]
  if (err.code === 'FRESH_AUTH_REQUIRED') return [t('ownerApproval.freshSignIn')]
  return [t('ownerApproval.failed')]
}

export function BusinessCalendarSetting({
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
  const [setting, setSetting] = useState<BusinessCalendarSettingView | null>(null)
  const [workdays, setWorkdays] = useState<Weekday[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [closed, setClosed] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<{ workdays?: string; closed?: string; reason?: string }>({})
  const [result, setResult] = useState<{ ok: boolean; text: string[] } | null>(null)
  const w = useOwnerWrite(fetchImpl, onSession)
  const show = (s: BusinessCalendarSettingView) => {
    setSetting(s)
    setWorkdays(s.calendar?.workdays ?? [])
    setHolidays(s.calendar?.holidays ?? [])
    setClosed((s.calendar?.closedDates ?? []).join('\n'))
  }
  useEffect(() => {
    void call<BusinessCalendarSettingView>(fetchImpl, '/staff/settings/business-calendar').then((r) => {
      if (r.ok && typeof r.data?.state === 'string') show(r.data)
    })
  }, [fetchImpl])
  if (!setting) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!setting) return
    const closedDates = closedDatesOf(closed)
    const next: typeof errors = {}
    if (workdays.length === 0) next.workdays = t('businessCalendar.workdaysRequired')
    if (closedDates === null) next.closed = t('businessCalendar.closedInvalid')
    if (reason.trim() === '') next.reason = t('businessCalendar.reasonRequired')
    setErrors(next)
    if (next.workdays || next.closed || next.reason) return
    setResult(null)
    await w.send<BusinessCalendarSettingView>(
      '/staff/settings/business-calendar',
      {
        workdays: WEEKDAYS.filter((d) => workdays.includes(d)),
        holidays: HOLIDAYS.filter((h) => holidays.includes(h)),
        closedDates,
        reason: reason.trim(),
      },
      (r) => {
        if (!r.ok) return setResult({ ok: false, text: refusal(t, r.error) })
        show(r.data)
        setReason('')
        setResult({ ok: true, text: [] })
      },
      { 'if-match': `"${setting.version ?? 0}"` },
      'PUT',
    )
  }

  const toggle = <V extends string>(list: V[], v: V, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v))
  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-calendar`} data-testid="business-calendar">
      <h2 id={`${ids}-calendar`} className="staff-queue__heading">
        {t('businessCalendar.title')}
      </h2>
      <p className="staff-request__hint">{t('businessCalendar.hint')}</p>
      {setting.calendar ? (
        <>
          <p>{t('businessCalendar.current', { n: setting.version ?? 0 })}</p>
          <ul className="staff-queue__facts">
            <li>
              {t('businessCalendar.workdays', {
                days: setting.calendar.workdays.map((d) => t(WEEKDAY[d])).join(', '),
              })}
            </li>
            <li>
              {setting.calendar.closedDates.length
                ? t('businessCalendar.closedDates', {
                    dates: setting.calendar.closedDates.map((d) => calendarDay(d, locale)).join('; '),
                  })
                : t('businessCalendar.noClosedDates')}
            </li>
          </ul>
          <h3 id={`${ids}-observed`} className="staff-queue__title">
            {t('businessCalendar.observedTitle')}
          </h3>
          <ul aria-labelledby={`${ids}-observed`} data-testid="business-calendar-observed">
            {setting.observed.map((h) => (
              <li key={`${h.holiday}-${h.date}`}>
                {h.observed === h.date
                  ? t('businessCalendar.observedOn', {
                      holiday: t(HOLIDAY[h.holiday]),
                      date: calendarDay(h.observed, locale),
                    })
                  : t('businessCalendar.observedMoved', {
                      holiday: t(HOLIDAY[h.holiday]),
                      date: calendarDay(h.observed, locale),
                      actual: calendarDay(h.date, locale),
                    })}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>{t('businessCalendar.notConfigured')}</p>
      )}
      <ReauthForm t={t} w={w} />
      {!w.reauth ? (
        <form onSubmit={(e) => void submit(e)} noValidate aria-label={t('businessCalendar.change')}>
          <fieldset>
            <legend>{t('businessCalendar.workdaysLegend')}</legend>
            {WEEKDAYS.map((d) => (
              <label key={d} className="staff-retention__check">
                <input
                  type="checkbox"
                  checked={workdays.includes(d)}
                  onChange={(e) => setWorkdays((cur) => toggle(cur, d, e.target.checked))}
                />{' '}
                {t(WEEKDAY[d])}
              </label>
            ))}
            {errors.workdays ? <p className="hh-field__error">{errors.workdays}</p> : null}
          </fieldset>
          <fieldset>
            <legend>{t('businessCalendar.holidaysLegend')}</legend>
            {HOLIDAYS.map((h) => (
              <label key={h} className="staff-retention__check">
                <input
                  type="checkbox"
                  checked={holidays.includes(h)}
                  onChange={(e) => setHolidays((cur) => toggle(cur, h, e.target.checked))}
                />{' '}
                {t(HOLIDAY[h])}
              </label>
            ))}
          </fieldset>
          <Field
            multiline
            label={t('businessCalendar.closedLabel')}
            name="closedDates"
            autoComplete="off"
            value={closed}
            onChange={(e) => setClosed(e.target.value)}
            {...(errors.closed ? { error: errors.closed } : {})}
          />
          <Field
            multiline
            label={t('businessCalendar.reason')}
            name="calendarReason"
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            {...(errors.reason ? { error: errors.reason } : {})}
          />
          <div className="hh-button-row">
            <Button type="submit" pending={w.pending}>
              {t('businessCalendar.save')}
            </Button>
          </div>
        </form>
      ) : null}
      {result?.ok ? <StateView kind="success" title={t('businessCalendar.saved')} /> : null}
      {result && !result.ok ? (
        <StateView kind="error" title={t('ownerApproval.refused')} reasons={result.text} />
      ) : null}
    </section>
  )
}
