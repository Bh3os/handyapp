// The appointment reminder of one visit on the scheduling board (TSK-0067, TSK-0121; HH-COM-11, HH-COM-05, HH-COM-14,
// HH-COM-15, S01, OWN-DEC-153, OWN-DEC-107).
// - The reminder is automatic (OWN-DEC-153): 24 hours before every confirmed visit, recalculated after a reschedule,
//   none for a visit booked less than 24 hours ahead. Nobody sends or dismisses it; this panel shows the interval and
//   when the current window's reminder is due, whether a stop rule applies now, and each delivery: its channel, its
//   state (scheduled, sent, failed, suppressed, cancelled), when it is due or was sent, and why it stopped, waits or
//   failed. An email goes at any hour; a text waits for the customer's permitted hours (TSK-0122).
// - A failed reminder is a delivery issue with Retry in the action queue.
import type { StaffKey } from '@handyhub/i18n'
import { StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useState } from 'react'
import { call, type Fetch } from './api'
import { reminderShownState, reminderTone } from './EstimateReminders'
import { codeLabel } from './Requests'

// Times are passed as epoch milliseconds, which the ICU date and time formats accept (the board's translator type).
type T = (key: StaffKey, values?: Record<string, string | number>) => string
type StaffRef = { id: string; name: string | null }

export type AppointmentReminder = {
  id: string
  windowVersion: number | null
  current: boolean
  release: 'automatic' | 'staff_released'
  state: string
  channel: string
  reason: string | null
  scheduledAt: string | null
  sentAt: string | null
  cancelledAt: string | null
  cancelledBy: StaffRef | 'system' | null
}
export type AppointmentRemindersView = {
  visitId: string
  visitState: string
  cadence: { state: 'CONFIGURED'; proposed: boolean; hoursBefore: number; dueAt: string } | { state: 'NOT_CONFIGURED' }
  stoppedBy: string | null
  reminders: AppointmentReminder[]
}

/** The reminders panel of a visit; nothing while it cannot be read (no access) or the visit was never confirmed. */
export function AppointmentReminders({
  t,
  fetchImpl,
  visitId,
  refreshKey,
}: {
  t: T
  fetchImpl: Fetch
  visitId: string
  /** Changes when the visit changes (its version), so the panel reads the stop rule again. */
  refreshKey?: number | string
}) {
  const ids = useId()
  const [view, setView] = useState<AppointmentRemindersView | null | undefined>(undefined)

  const load = useCallback(async () => {
    const r = await call<AppointmentRemindersView>(fetchImpl, `/staff/visits/${encodeURIComponent(visitId)}/reminders`)
    setView(r.ok && Array.isArray(r.data?.reminders) ? r.data : null)
  }, [fetchImpl, visitId])
  useEffect(() => {
    void load()
  }, [load, refreshKey])
  if (!view) return null
  if (view.reminders.length === 0 && view.visitState !== 'confirmed') return null

  const when = (iso: string) => new Date(iso).getTime()
  const name = (r: StaffRef | null) => (r ? (r.name ?? t('queue.unnamed')) : '—')
  const c = view.cadence

  return (
    <section
      className="staff-request__section"
      aria-labelledby={`${ids}-reminders`}
      data-testid="appointment-reminders"
    >
      <h3 id={`${ids}-reminders`} className="staff-queue__heading">
        {t('appointment.reminders.title')}
      </h3>
      <p className="staff-request__hint">{t('appointment.reminders.hint')}</p>
      {c.state === 'CONFIGURED' ? (
        view.visitState === 'confirmed' ? (
          <p>{t('appointment.reminders.schedule', { hours: c.hoursBefore, time: when(c.dueAt) })}</p>
        ) : null
      ) : (
        <StateView kind="blocked" title={t('appointment.reminders.notConfigured')} />
      )}
      {view.stoppedBy ? (
        <StateView
          kind="empty"
          title={t('appointment.reminders.stopped', { reason: codeLabel(t, 'reminderReason', view.stoppedBy) })}
        />
      ) : null}
      {view.reminders.length ? (
        <ol className="staff-estimate__responses" aria-label={t('appointment.reminders.title')}>
          {view.reminders.map((r) => {
            const state = reminderShownState(r)
            return (
              <li key={r.id} data-testid="appointment-reminder">
                <p>
                  <strong>
                    {t('appointment.reminders.entry', { channel: codeLabel(t, 'providerChannel', r.channel) })}
                  </strong>{' '}
                  <StatusBadge tone={reminderTone(state)}>{codeLabel(t, 'reminderState', state)}</StatusBadge>
                  {r.current ? null : (
                    <>
                      {' '}
                      <StatusBadge tone="neutral">{t('appointment.reminders.earlier')}</StatusBadge>
                    </>
                  )}
                  {r.release === 'staff_released' ? (
                    <>
                      {' '}
                      <StatusBadge tone="neutral">{t('appointment.reminders.earlierDraft')}</StatusBadge>
                    </>
                  ) : null}
                </p>
                {r.scheduledAt ? <p>{t('appointment.reminders.dueAt', { time: when(r.scheduledAt) })}</p> : null}
                {r.sentAt ? <p>{t('appointment.reminders.sentAt', { time: when(r.sentAt) })}</p> : null}
                {r.cancelledAt ? (
                  <p>
                    {r.cancelledBy === 'system' || r.cancelledBy === null
                      ? t('appointment.reminders.cancelledAt', { time: when(r.cancelledAt) })
                      : t('appointment.reminders.cancelledBy', {
                          name: name(r.cancelledBy),
                          time: when(r.cancelledAt),
                        })}
                  </p>
                ) : null}
                {r.reason ? (
                  <p>{t('appointment.reminders.reason', { reason: codeLabel(t, 'reminderReason', r.reason) })}</p>
                ) : null}
              </li>
            )
          })}
        </ol>
      ) : (
        <p>{t('appointment.reminders.none')}</p>
      )}
    </section>
  )
}
