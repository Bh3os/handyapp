// The appointment reminder of one visit on the scheduling board (TSK-0067; HH-COM-11, HH-COM-05, HH-COM-09, S01,
// OWN-DEC-78, OWN-DEC-107).
// - Shows the configured interval and when the current window's draft is due, whether a stop rule applies now, and
//   each reminder drafted: its content (date and arrival window, address, preparation steps), its channel, its state,
//   when a released one sends (inside the contact hours) and why it stopped, was dismissed or was not sent.
// - Every reminder is a draft until a staff member sends it. Send and Dismiss appear only when the server says the
//   caller may use them now; the server checks the visit and the customer's channel permission again and refuses,
//   naming the reason, when one applies.
// - The queue's appointment_reminder item opens the visit on the board, where this panel is.
import type { StaffKey } from '@handyhub/i18n'
import { Button, StateView, StatusBadge, type StatusTone } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { codeLabel } from './Requests'

// Times are passed as epoch milliseconds, which the ICU date and time formats accept (the board's translator type).
type T = (key: StaffKey, values?: Record<string, string | number>) => string
type StaffRef = { id: string; name: string | null }

export type AppointmentReminder = {
  id: string
  windowVersion: number | null
  current: boolean
  state: string
  channel: string
  reason: string | null
  content: { visitWindow: string; serviceAddress: string; preparationSteps: string | null }
  draftedAt: string
  releasedAt: string | null
  releasedBy: StaffRef | null
  sendAt: string | null
  cancelledAt: string | null
  cancelledBy: StaffRef | 'system' | null
  actions: { release: boolean; dismiss: boolean }
}
export type AppointmentRemindersView = {
  visitId: string
  visitState: string
  cadence:
    | { state: 'CONFIGURED'; proposed: boolean; hoursBefore: number; contactHoursOnly: boolean; draftAt: string }
    | { state: 'NOT_CONFIGURED' }
  stoppedBy: string | null
  reminders: AppointmentReminder[]
}

const tone = (state: string): StatusTone =>
  state === 'sent' || state === 'delivered'
    ? 'success'
    : state === 'draft' || state === 'queued'
      ? 'info'
      : state === 'failed' || state === 'suppressed'
        ? 'warning'
        : 'neutral'

/** A refused send or dismissal in words: the stop reason, or the error itself. */
function refusalText(t: T, err: ApiErrorBody): string[] {
  if (err.fieldErrors.length === 0) return [t('appointment.reminders.failed')]
  return err.fieldErrors.map((f) =>
    f.code === 'REMINDER_NOT_DRAFT'
      ? t('appointment.reminders.notDraft')
      : f.code === 'details_changed'
        ? t('appointment.reminders.detailsChanged')
        : codeLabel(t, 'reminderReason', f.code),
  )
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
  const [pending, setPending] = useState<string | null>(null)
  const [refused, setRefused] = useState<string[] | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const key = useRef<{ action: string; key: string } | null>(null)

  const load = useCallback(async () => {
    const r = await call<AppointmentRemindersView>(fetchImpl, `/staff/visits/${encodeURIComponent(visitId)}/reminders`)
    setView(r.ok && Array.isArray(r.data?.reminders) ? r.data : null)
  }, [fetchImpl, visitId])
  useEffect(() => {
    void load()
  }, [load, refreshKey])
  if (!view) return null
  if (view.reminders.length === 0 && view.visitState !== 'confirmed') return null

  async function act(reminder: AppointmentReminder, action: 'release' | 'dismiss') {
    const id = `${action}:${reminder.id}`
    setPending(id)
    setRefused(null)
    setDone(null)
    if (key.current?.action !== id) key.current = { action: id, key: idempotencyKey() }
    const r = await call<AppointmentRemindersView>(
      fetchImpl,
      `/staff/appointment-reminders/${encodeURIComponent(reminder.id)}/${action}`,
      { method: 'POST', body: {}, headers: { 'idempotency-key': key.current.key } },
    )
    setPending(null)
    if (r.ok || r.status < 500) key.current = null
    if (!r.ok) {
      setRefused(refusalText(t, r.error))
      return load()
    }
    setView(r.data)
    setDone(t(action === 'release' ? 'appointment.reminders.released' : 'appointment.reminders.dismissed'))
  }

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
          <p>{t('appointment.reminders.schedule', { hours: c.hoursBefore, time: when(c.draftAt) })}</p>
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
          {view.reminders.map((r) => (
            <li key={r.id} data-testid="appointment-reminder">
              <p>
                <strong>
                  {t('appointment.reminders.entry', { channel: codeLabel(t, 'providerChannel', r.channel) })}
                </strong>{' '}
                <StatusBadge tone={tone(r.state)}>{codeLabel(t, 'reminderState', r.state)}</StatusBadge>
                {r.current ? null : (
                  <>
                    {' '}
                    <StatusBadge tone="neutral">{t('appointment.reminders.earlier')}</StatusBadge>
                  </>
                )}
              </p>
              <dl className="staff-system__fields">
                <div>
                  <dt>{t('appointment.reminders.window')}</dt>
                  <dd>{r.content.visitWindow}</dd>
                </div>
                <div>
                  <dt>{t('appointment.reminders.address')}</dt>
                  <dd>{r.content.serviceAddress}</dd>
                </div>
                <div>
                  <dt>{t('appointment.reminders.preparation')}</dt>
                  <dd>{r.content.preparationSteps ?? t('appointment.reminders.noPreparation')}</dd>
                </div>
              </dl>
              <p>{t('appointment.reminders.draftedAt', { time: when(r.draftedAt) })}</p>
              {r.releasedAt ? (
                <p>{t('appointment.reminders.releasedBy', { name: name(r.releasedBy), time: when(r.releasedAt) })}</p>
              ) : null}
              {r.sendAt ? <p>{t('appointment.reminders.sendAt', { time: when(r.sendAt) })}</p> : null}
              {r.cancelledAt ? (
                <p>
                  {r.cancelledBy === 'system' || r.cancelledBy === null
                    ? t('appointment.reminders.cancelledAt', { time: when(r.cancelledAt) })
                    : t('appointment.reminders.cancelledBy', { name: name(r.cancelledBy), time: when(r.cancelledAt) })}
                </p>
              ) : null}
              {r.reason ? (
                <p>{t('appointment.reminders.reason', { reason: codeLabel(t, 'reminderReason', r.reason) })}</p>
              ) : null}
              {r.actions.release || r.actions.dismiss ? (
                <div className="hh-button-row">
                  {r.actions.release ? (
                    <Button pending={pending === `release:${r.id}`} onClick={() => void act(r, 'release')}>
                      {t('appointment.reminders.send')}
                    </Button>
                  ) : null}
                  {r.actions.dismiss ? (
                    <Button
                      variant="secondary"
                      pending={pending === `dismiss:${r.id}`}
                      onClick={() => void act(r, 'dismiss')}
                    >
                      {t('appointment.reminders.dismiss')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p>{t('appointment.reminders.none')}</p>
      )}
      {refused ? <StateView kind="error" title={t('appointment.reminders.refused')} reasons={refused} /> : null}
      {done ? <StateView kind="success" title={done} /> : null}
    </section>
  )
}
