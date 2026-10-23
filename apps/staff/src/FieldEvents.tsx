// A field event a phone uploaded, as the Owner reviews it (TSK-0080; HH-OFF-06, T27, T51). The queue item
// field_event_review links here for an event the server kept and did not apply: a conflict with the visit's newer
// state, a worker not assigned (then or now), or another account's evidence the Owner uploaded. Nothing here changes
// the visit; the Owner corrects a worker's times on the visit's own page when needed, then records what was done,
// once. Staff text in English and Spanish.
import type { StaffKey } from '@handyhub/i18n'
import { Button, Field, StateView } from '@handyhub/ui'
import { useCallback, useEffect, useState } from 'react'
import { call, idempotencyKey, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

type Ref = { id: string; name: string | null }
type FieldEventType = 'tap_on_my_way' | 'tap_arrived' | 'tap_finished'
type Outcome = 'applied' | 'already_recorded' | 'conflict' | 'not_assigned' | 'recovered'
export type FieldEventView = {
  clientId: string
  type: FieldEventType
  visitId: string
  reference: string
  localDate: string
  visitState: string
  recordedBy: Ref
  uploadedBy: Ref
  deviceRecordedAt: string
  receivedAt: string
  attempts: number
  state: 'synchronized' | 'needs_review' | 'reviewed'
  outcome: Outcome
  detail: string | null
  review: { by: Ref; at: string; note: string } | null
  actions: { review: boolean }
}

const TYPE: Readonly<Record<FieldEventType, StaffKey>> = {
  tap_on_my_way: 'fieldEvent.type.tap_on_my_way',
  tap_arrived: 'fieldEvent.type.tap_arrived',
  tap_finished: 'fieldEvent.type.tap_finished',
}
const OUTCOME: Readonly<Record<Outcome, StaffKey>> = {
  applied: 'fieldEvent.outcome.applied',
  already_recorded: 'fieldEvent.outcome.already_recorded',
  conflict: 'fieldEvent.outcome.conflict',
  not_assigned: 'fieldEvent.outcome.not_assigned',
  recovered: 'fieldEvent.outcome.recovered',
}
const DETAIL: Readonly<Record<string, StaffKey>> = {
  NOT_ASSIGNED_THEN: 'fieldEvent.detail.NOT_ASSIGNED_THEN',
  NOT_ASSIGNED_NOW: 'fieldEvent.detail.NOT_ASSIGNED_NOW',
  VISIT_NOT_ACTIVE: 'fieldEvent.detail.VISIT_NOT_ACTIVE',
  ON_MY_WAY_FIRST: 'fieldEvent.detail.ON_MY_WAY_FIRST',
  ARRIVED_FIRST: 'fieldEvent.detail.ARRIVED_FIRST',
  ALREADY_ARRIVED: 'fieldEvent.detail.ALREADY_ARRIVED',
  ON_MY_WAY_TOO_EARLY: 'fieldEvent.detail.ON_MY_WAY_TOO_EARLY',
  ON_MY_WAY_NOT_CONFIGURED: 'fieldEvent.detail.ON_MY_WAY_NOT_CONFIGURED',
}
const REFUSAL: Readonly<Record<string, StaffKey>> = {
  NOTE_REQUIRED: 'fieldEvent.noteRequired',
  ALREADY_REVIEWED: 'fieldEvent.alreadyReviewed',
  NOT_IN_REVIEW: 'fieldEvent.alreadyReviewed',
}

/** One field event and the Owner's review (the queue item's deep link). */
export function FieldEventPage({
  t,
  fetchImpl,
  href,
  clientId,
}: {
  t: T
  fetchImpl: Fetch
  href: (to: string) => string
  clientId: string
}) {
  const [view, setView] = useState<FieldEventView | null | 'missing' | 'failed'>(null)
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<StaffKey | null>(null)
  const load = useCallback(async () => {
    const r = await call<FieldEventView>(fetchImpl, `/staff/field-events/${encodeURIComponent(clientId)}`)
    setView(r.ok ? r.data : r.status === 404 ? 'missing' : 'failed')
  }, [fetchImpl, clientId])
  useEffect(() => {
    void load()
  }, [load])
  if (view === null) return <StateView kind="loading" title={t('fieldEvent.loading')} />
  if (view === 'missing') return <StateView kind="error" title={t('fieldEvent.notFound')} />
  if (view === 'failed') return <StateView kind="error" title={t('fieldEvent.failed')} />
  async function review() {
    setPending(true)
    const r = await call<FieldEventView>(fetchImpl, `/staff/field-events/${encodeURIComponent(clientId)}/review`, {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey() },
      body: { note: note.trim() },
    })
    setPending(false)
    if (!r.ok) return setProblem(REFUSAL[r.error.fieldErrors[0]?.code ?? ''] ?? 'fieldEvent.saveFailed')
    setProblem(null)
    setView(r.data)
  }
  const name = (r: Ref) => r.name ?? t('queue.unnamed')
  return (
    <section className="staff-request__section" data-testid="field-event-page">
      <h1 className="hh-h2">{t('fieldEvent.title', { type: t(TYPE[view.type]), reference: view.reference })}</h1>
      <dl className="staff-sop__facts">
        <dt>{t('fieldEvent.visitDate')}</dt>
        <dd>{view.localDate}</dd>
        <dt>{t('fieldEvent.recordedBy')}</dt>
        <dd>{name(view.recordedBy)}</dd>
        <dt>{t('fieldEvent.uploadedBy')}</dt>
        <dd>{name(view.uploadedBy)}</dd>
        <dt>{t('fieldEvent.deviceAt')}</dt>
        <dd>{new Date(view.deviceRecordedAt).toLocaleString()}</dd>
        <dt>{t('fieldEvent.receivedAt')}</dt>
        <dd>{new Date(view.receivedAt).toLocaleString()}</dd>
        <dt>{t('fieldEvent.visitNow')}</dt>
        <dd>{codeLabel(t, 'visitState', view.visitState)}</dd>
        <dt>{t('fieldEvent.result')}</dt>
        <dd data-testid="field-event-outcome">
          {t(OUTCOME[view.outcome])}
          {view.detail ? ` ${t(DETAIL[view.detail] ?? 'fieldEvent.detail.other')}` : ''}
        </dd>
      </dl>
      <p className="staff-request__hint">{t('fieldEvent.hint')}</p>
      <p>
        <a href={href(`/visit-times/${view.visitId}`)}>{t('fieldEvent.visitTimes')}</a>
      </p>
      {view.review ? (
        <p data-testid="field-event-reviewed">
          {t('fieldEvent.reviewed', { name: name(view.review.by), at: new Date(view.review.at).toLocaleString() })}
          {' — '}
          {view.review.note}
        </p>
      ) : view.actions.review ? (
        <div>
          <Field
            label={t('fieldEvent.note')}
            name="reviewNote"
            multiline
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            pending={pending}
            {...(!note.trim() ? { disabledReason: t('fieldEvent.noteRequired') } : {})}
            onClick={() => void review()}
          >
            {t('fieldEvent.record')}
          </Button>
        </div>
      ) : null}
      {problem ? (
        <p role="alert" className="hh-field__error">
          {t(problem)}
        </p>
      ) : null}
    </section>
  )
}
