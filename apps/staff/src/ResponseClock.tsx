// How the first-response clock reads for staff (TSK-0043; HH-LEAD-05, OWN-DEC-115, FACT-RESPONSE-TARGET). The server
// reads the clock in business minutes (paused outside the daily hours); this only words it, always with the label
// that it is an internal target, never a customer promise.
import { labelKey, type StaffKey } from '@handyhub/i18n'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

export type ResponseClock = {
  state: 'not_configured' | 'running' | 'paused' | 'overdue' | 'stopped'
  startedAt: string
  targetMinutes: number | null
  dueAt: string | null
  remainingMinutes: number | null
  overdueMinutes: number | null
  resumesAt: string | null
  timeZone: string | null
  stoppedAt: string | null
  stopKind: 'response_sent' | 'conversation_recorded' | null
  businessMinutes: number | null
  withinTarget: boolean | null
}

/**
 * Whole minutes or hours of business time. Never days: business time counts only the configured daily hours, so
 * dividing it by 24 would understate how long a request has waited.
 */
export function businessDuration(t: T, minutes: number): string {
  const m = Math.max(0, Math.floor(minutes))
  if (m < 60) return t('queue.time.minutes', { count: m })
  return t('queue.time.hours', { count: Math.floor(m / 60) })
}

/** A time of the clock, shown in the business time zone it counts in (the browser's zone if it has none). */
export function clockTime(locale: 'en' | 'es', clock: ResponseClock, iso: string): string {
  const lang = locale === 'es' ? 'es-US' : 'en-US'
  const options: Intl.DateTimeFormatOptions = { weekday: 'short', hour: 'numeric', minute: '2-digit' }
  try {
    return new Intl.DateTimeFormat(lang, {
      ...options,
      ...(clock.timeZone ? { timeZone: clock.timeZone } : {}),
    }).format(new Date(iso))
  } catch {
    return new Intl.DateTimeFormat(lang, options).format(new Date(iso))
  }
}

/** One line for the clock, for example "40 minutes left; paused outside daily hours until Thu 8:00 AM". */
export function clockText(t: T, clock: ResponseClock, time: (iso: string) => string): string {
  switch (clock.state) {
    case 'running':
      return t('clock.running', { time: businessDuration(t, clock.remainingMinutes ?? 0) })
    case 'paused':
      return t('clock.paused', {
        time: businessDuration(t, clock.remainingMinutes ?? 0),
        resume: clock.resumesAt ? time(clock.resumesAt) : '',
      })
    case 'overdue':
      return t('clock.overdue', { time: businessDuration(t, clock.overdueMinutes ?? 0) })
    case 'not_configured':
      return t('clock.notConfigured')
    case 'stopped': {
      const how = t(labelKey('responseStop', clock.stopKind ?? 'response_sent') as StaffKey)
      if (clock.businessMinutes === null) return t('clock.stoppedUnmeasured', { how })
      const spent = businessDuration(t, clock.businessMinutes)
      return clock.withinTarget
        ? t('clock.stopped', { time: spent, how })
        : t('clock.stoppedLate', { time: spent, how })
    }
  }
}
