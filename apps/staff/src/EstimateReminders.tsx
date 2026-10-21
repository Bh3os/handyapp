// The unanswered-estimate reminders of one version in the staff builder (TSK-0060; HH-EST-14, HH-COM-05, HH-COM-09,
// S01, OWN-DEC-78, OWN-DEC-132).
// - Shows the configured cadence and when the first and the final draft are due (measured from publishing), whether
//   a stop rule applies now, and each reminder drafted: which one, its channel, its state and why it stopped, was
//   dismissed or was not sent.
// - Every reminder is a draft until a staff member sends it; a released estimate reminder sends at once. Send and
//   Dismiss appear only when the server says the caller may use them now; the server checks the stop rules and the
//   customer's channel permission again and refuses, naming the reason, when one applies.
// - The queue's estimate_reminder item links here.
import type { StaffKey } from '@handyhub/i18n'
import { Button, StateView, StatusBadge, type StatusTone } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number | Date>) => string
type StaffRef = { id: string; name: string | null }

export type Reminder = {
  id: string
  step: 'first' | 'final'
  state: string
  channel: string
  reason: string | null
  draftedAt: string
  releasedAt: string | null
  releasedBy: StaffRef | null
  cancelledAt: string | null
  cancelledBy: StaffRef | 'system' | null
  actions: { release: boolean; dismiss: boolean }
}
export type RemindersView = {
  versionId: string
  cadence:
    | {
        state: 'CONFIGURED'
        proposed: boolean
        firstHours: number
        finalHours: number
        firstAt: string | null
        finalAt: string | null
      }
    | { state: 'NOT_CONFIGURED' }
  stoppedBy: string | null
  reminders: Reminder[]
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
  if (err.fieldErrors.length === 0) return [t('estimate.reminders.failed')]
  return err.fieldErrors.map((f) =>
    f.code === 'REMINDER_NOT_DRAFT' ? t('estimate.reminders.notDraft') : codeLabel(t, 'reminderReason', f.code),
  )
}

/** The reminders panel of a published version; nothing for a version that was never published. */
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
  const [pending, setPending] = useState<string | null>(null)
  const [refused, setRefused] = useState<string[] | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const key = useRef<{ action: string; key: string } | null>(null)

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

  async function act(reminder: Reminder, action: 'release' | 'dismiss') {
    const id = `${action}:${reminder.id}`
    setPending(id)
    setRefused(null)
    setDone(null)
    if (key.current?.action !== id) key.current = { action: id, key: idempotencyKey() }
    const r = await call<RemindersView>(
      fetchImpl,
      `/staff/estimate-reminders/${encodeURIComponent(reminder.id)}/${action}`,
      { method: 'POST', body: {}, headers: { 'idempotency-key': key.current.key } },
    )
    setPending(null)
    if (r.ok || r.status < 500) key.current = null
    if (!r.ok) {
      setRefused(refusalText(t, r.error))
      return load()
    }
    setView(r.data)
    setDone(t(action === 'release' ? 'estimate.reminders.released' : 'estimate.reminders.dismissed'))
  }

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
        c.firstAt && c.finalAt ? (
          <p>{t('estimate.reminders.schedule', { first: when(c.firstAt), final: when(c.finalAt) })}</p>
        ) : null
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
          {view.reminders.map((r) => (
            <li key={r.id}>
              <p>
                <strong>
                  {t('estimate.reminders.entry', {
                    step: codeLabel(t, 'reminderStep', r.step),
                    channel: codeLabel(t, 'providerChannel', r.channel),
                  })}
                </strong>{' '}
                <StatusBadge tone={tone(r.state)}>{codeLabel(t, 'reminderState', r.state)}</StatusBadge>
              </p>
              <p>{t('estimate.reminders.draftedAt', { time: when(r.draftedAt) })}</p>
              {r.releasedAt ? (
                <p>{t('estimate.reminders.releasedBy', { name: name(r.releasedBy), time: when(r.releasedAt) })}</p>
              ) : null}
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
              {r.actions.release || r.actions.dismiss ? (
                <div className="hh-button-row">
                  {r.actions.release ? (
                    <Button pending={pending === `release:${r.id}`} onClick={() => void act(r, 'release')}>
                      {t('estimate.reminders.send')}
                    </Button>
                  ) : null}
                  {r.actions.dismiss ? (
                    <Button
                      variant="secondary"
                      pending={pending === `dismiss:${r.id}`}
                      onClick={() => void act(r, 'dismiss')}
                    >
                      {t('estimate.reminders.dismiss')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      ) : (
        <p>{t('estimate.reminders.none')}</p>
      )}
      {refused ? <StateView kind="error" title={t('estimate.reminders.refused')} reasons={refused} /> : null}
      {done ? <StateView kind="success" title={done} /> : null}
    </section>
  )
}
