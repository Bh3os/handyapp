// The unanswered-estimate reminder of one version in the staff builder (TSK-0060, TSK-0121; HH-EST-14, HH-COM-05,
// HH-COM-14, HH-COM-15, S01, OWN-DEC-153, OWN-DEC-154).
// - The reminder is automatic (OWN-DEC-153): one reminder 3 days after the version was successfully delivered, while
//   the estimate is pending. Nobody sends or dismisses it; this panel shows the cadence, when the version was delivered
//   and when the reminder is due, whether a stop rule applies now, and each delivery: its channel, its state (scheduled,
//   sent, failed, suppressed, cancelled), when it is due or was sent, and the reason it stopped, waits or failed.
// - An email goes at any hour; a text waits for the customer's permitted hours (TSK-0122). A failed reminder is a
//   delivery issue with Retry in the action queue.
import type { StaffKey } from '@handyhub/i18n'
import { StateView, StatusBadge, type StatusTone } from '@handyhub/ui'
import { useCallback, useEffect, useId, useState } from 'react'
import { call, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number | Date>) => string
type StaffRef = { id: string; name: string | null }

export type Reminder = {
  id: string
  release: 'automatic' | 'staff_released'
  state: string
  channel: string
  reason: string | null
  scheduledAt: string | null
  sentAt: string | null
  cancelledAt: string | null
  cancelledBy: StaffRef | 'system' | null
}
export type RemindersView = {
  versionId: string
  cadence:
    | {
        state: 'CONFIGURED'
        proposed: boolean
        afterDeliveryHours: number
        deliveredAt: string | null
        dueAt: string | null
      }
    | { state: 'NOT_CONFIGURED' }
  stoppedBy: string | null
  reminders: Reminder[]
}

/**
 * The state a staff member reads: a queued reminder due later is scheduled; one the provider accepted (it has a sent
 * time) reads as sent.
 */
export function reminderShownState(
  r: { state: string; scheduledAt: string | null; sentAt?: string | null },
  now = Date.now(),
): string {
  if (r.state === 'queued' && r.sentAt) return 'sent'
  if (r.state === 'queued' && r.scheduledAt && new Date(r.scheduledAt).getTime() > now) return 'scheduled'
  return r.state
}

export const reminderTone = (state: string): StatusTone =>
  state === 'sent' || state === 'delivered'
    ? 'success'
    : state === 'draft' || state === 'queued' || state === 'scheduled'
      ? 'info'
      : state === 'failed' || state === 'suppressed'
        ? 'warning'
        : 'neutral'

/** The reminder panel of a published version; nothing for a version that was never published. */
export function EstimateReminders({
  t,
  fetchImpl,
  versionId,
  refreshKey,
}: {
  t: T
  fetchImpl: Fetch
  versionId: string
  /** Changes when the version changes (its row version), so the panel reads the stop rule again. */
  refreshKey?: number | string
}) {
  const ids = useId()
  const [view, setView] = useState<RemindersView | null | undefined>(undefined)

  const load = useCallback(async () => {
    const r = await call<RemindersView>(
      fetchImpl,
      `/staff/estimate-versions/${encodeURIComponent(versionId)}/reminders`,
    )
    setView(r.ok && Array.isArray(r.data?.reminders) ? r.data : null)
  }, [fetchImpl, versionId])
  useEffect(() => {
    void load()
  }, [load, refreshKey])
  if (!view) return null

  const when = (iso: string) => new Date(iso)
  const name = (r: StaffRef | null) => (r ? (r.name ?? t('queue.unnamed')) : '—')
  const c = view.cadence

  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-reminders`} data-testid="estimate-reminders">
      <h2 id={`${ids}-reminders`} className="staff-queue__heading">
        {t('estimate.reminders.title')}
      </h2>
      <p className="staff-request__hint">{t('estimate.reminders.hint')}</p>
      {c.state === 'CONFIGURED' ? (
        c.deliveredAt && c.dueAt ? (
          <p>{t('estimate.reminders.schedule', { delivered: when(c.deliveredAt), due: when(c.dueAt) })}</p>
        ) : (
          <p>{t('estimate.reminders.notDelivered')}</p>
        )
      ) : (
        <StateView kind="blocked" title={t('estimate.reminders.notConfigured')} />
      )}
      {view.stoppedBy ? (
        <StateView
          kind="empty"
          title={t('estimate.reminders.stopped', { reason: codeLabel(t, 'reminderReason', view.stoppedBy) })}
        />
      ) : null}
      {view.reminders.length ? (
        <ol className="staff-estimate__responses" aria-label={t('estimate.reminders.title')}>
          {view.reminders.map((r) => {
            const state = reminderShownState(r)
            return (
              <li key={r.id} data-testid="estimate-reminder">
                <p>
                  <strong>
                    {t('estimate.reminders.entry', { channel: codeLabel(t, 'providerChannel', r.channel) })}
                  </strong>{' '}
                  <StatusBadge tone={reminderTone(state)}>{codeLabel(t, 'reminderState', state)}</StatusBadge>
                  {r.release === 'staff_released' ? (
                    <>
                      {' '}
                      <StatusBadge tone="neutral">{t('estimate.reminders.earlierDraft')}</StatusBadge>
                    </>
                  ) : null}
                </p>
                {r.scheduledAt ? <p>{t('estimate.reminders.dueAt', { time: when(r.scheduledAt) })}</p> : null}
                {r.sentAt ? <p>{t('estimate.reminders.sentAt', { time: when(r.sentAt) })}</p> : null}
                {r.cancelledAt ? (
                  <p>
                    {r.cancelledBy === 'system' || r.cancelledBy === null
                      ? t('estimate.reminders.cancelledAt', { time: when(r.cancelledAt) })
                      : t('estimate.reminders.cancelledBy', { name: name(r.cancelledBy), time: when(r.cancelledAt) })}
                  </p>
                ) : null}
                {r.reason ? (
                  <p>{t('estimate.reminders.reason', { reason: codeLabel(t, 'reminderReason', r.reason) })}</p>
                ) : null}
              </li>
            )
          })}
        </ol>
      ) : (
        <p>{t('estimate.reminders.none')}</p>
      )}
    </section>
  )
}
