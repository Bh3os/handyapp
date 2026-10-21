// How a first-response clock reads for staff (TSK-0043; HH-LEAD-05, OWN-DEC-115, FACT-RESPONSE-TARGET). Pure: the
// clock row as stored and `now`. The queue item and the request record show the same reading. It is an internal
// target, never a customer promise: no customer route reads it.
import { readClock } from '@handyhub/domain'

export const CLOCK_STATES = ['not_configured', 'running', 'paused', 'overdue', 'stopped'] as const
export type ClockState = (typeof CLOCK_STATES)[number]

export type ClockRow = {
  started_at: Date
  target_minutes: number | null
  hours_open: string | null
  hours_close: string | null
  time_zone: string | null
  due_at: Date | null
  stopped_at: Date | null
  stop_kind: string | null
  business_minutes: number | null
  within_target: boolean | null
}

export type ResponseClockView = {
  state: ClockState
  startedAt: string
  /** The internal target in minutes; null while NOT CONFIGURED. */
  targetMinutes: number | null
  dueAt: string | null
  /** Business minutes left (running or paused). */
  remainingMinutes: number | null
  /** Business minutes past the target. */
  overdueMinutes: number | null
  /** Outside the daily hours: when counting resumes. */
  resumesAt: string | null
  /** The business time zone the clock counts in, for showing its times (FACT-TIMEZONE). */
  timeZone: string | null
  stoppedAt: string | null
  stopKind: 'response_sent' | 'conversation_recorded' | null
  /** Business minutes from receipt to the first meaningful response; null while unavailable. */
  businessMinutes: number | null
  withinTarget: boolean | null
}

export const CLOCK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'state',
    'startedAt',
    'targetMinutes',
    'dueAt',
    'remainingMinutes',
    'overdueMinutes',
    'resumesAt',
    'timeZone',
    'stoppedAt',
    'stopKind',
    'businessMinutes',
    'withinTarget',
  ],
  properties: {
    state: { type: 'string', enum: [...CLOCK_STATES] },
    startedAt: { type: 'string', format: 'date-time' },
    targetMinutes: { type: ['integer', 'null'] },
    dueAt: { type: ['string', 'null'], format: 'date-time' },
    remainingMinutes: { type: ['integer', 'null'] },
    overdueMinutes: { type: ['integer', 'null'] },
    resumesAt: { type: ['string', 'null'], format: 'date-time' },
    timeZone: { type: ['string', 'null'] },
    stoppedAt: { type: ['string', 'null'], format: 'date-time' },
    stopKind: { type: ['string', 'null'], enum: ['response_sent', 'conversation_recorded', null] },
    businessMinutes: { type: ['integer', 'null'] },
    withinTarget: { type: ['boolean', 'null'] },
  },
} as const

export function responseClockView(row: ClockRow, now: Date): ResponseClockView {
  const base = {
    startedAt: row.started_at.toISOString(),
    targetMinutes: row.target_minutes,
    dueAt: row.due_at ? row.due_at.toISOString() : null,
    remainingMinutes: null,
    overdueMinutes: null,
    resumesAt: null,
    timeZone: row.time_zone,
    stoppedAt: row.stopped_at ? row.stopped_at.toISOString() : null,
    stopKind: (row.stop_kind as ResponseClockView['stopKind']) ?? null,
    businessMinutes: row.business_minutes,
    withinTarget: row.within_target,
  }
  if (row.stopped_at) return { ...base, state: 'stopped' }
  if (!row.due_at || !row.hours_open || !row.hours_close || !row.time_zone) return { ...base, state: 'not_configured' }
  const r = readClock(row.due_at, now, { open: row.hours_open, close: row.hours_close }, row.time_zone)
  const resumesAt = r.resumesAt ? r.resumesAt.toISOString() : null
  return r.state === 'overdue'
    ? { ...base, state: 'overdue', overdueMinutes: r.overdueMinutes, resumesAt }
    : { ...base, state: r.state, remainingMinutes: r.remainingMinutes, resumesAt }
}
