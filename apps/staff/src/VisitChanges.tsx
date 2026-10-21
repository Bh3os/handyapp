// Changes of a booked visit on the board (TSK-0066; HH-SCH-07, HH-PORT-04, HH-OPS-03, HH-A11Y-02, T25, T42,
// FACT-CANCELLATION-RULES, OWN-DEC-107, OWN-DEC-119, OWN-DEC-134).
// - The customer's open request (Request to Reschedule or Request Cancellation) is shown first, with the customer's own
//   words and, for a cancellation, the outcome of the rules if it is confirmed now. The appointment stays as booked
//   until staff commit a change: confirming a reschedule request opens the Move form with the request; confirming a
//   cancellation request opens the cancellation with it; declining needs a reason.
// - Reassign: choose the new team (the lead first) with a reason; the window stays. Cancel: who is cancelling (the
//   customer, or HandyHub with its cause) and a reason, with the outcome shown before anything is saved. A work visit
//   is cancelled by the Owner only (cancellation and financial review); everyone else is told so.
// - Every write carries the version shown (If-Match) and an idempotency key; the server checks everything again. A
//   stale version says so and reloads; a refusal says the booking stays as it was. Nothing here refunds or charges:
//   the outcome is the Owner's to apply.
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { cents, formatUsd } from '@handyhub/money'
import { Button, Field, StateView } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { call, idempotencyKey, type Fetch } from './api'
import { AlternativesView, capacityReasons, type Alternatives, type CapacityDay } from './Capacity'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

export type Outcome = {
  kind: string
  noticeMinutes: number
  keptCents: number | null
  refundCents: number | null
  invoiceCents: number | null
}
export type ChangeRequest = {
  id: string
  kind: 'reschedule' | 'cancellation'
  state: string
  version: number
  requestedAt: string
  reason: string | null
  preferredTimes: string | null
  outcome: Outcome | null
  actions: { confirm: boolean; decline: boolean }
}
export type CancellationPreview = {
  depositPaidCents: number
  depositPendingCents: number
  workStarted: boolean
  customer: Outcome
  handyhub: Outcome
  rulesProposed: boolean
}
export type ChangeableVisit = {
  id: string
  purpose: string
  version: number
  window: { localDate: string; timeZone: string }
  requiredWorkers: number | null
  equipment: string[]
  team: { worker: { id: string; name: string | null }; role: string | null; kind: string }[]
  changeRequest: ChangeRequest | null
  cancellationPreview: CancellationPreview | null
  actions: { reassign: boolean; cancel: boolean }
}

export const HANDYHUB_CAUSES = ['weather', 'safety_stop', 'sick_worker', 'other'] as const

const money = (n: number) => formatUsd(cents(n))

function noticeText(t: T, minutes: number): string {
  if (minutes < 0) return t('change.outcome.afterStart')
  const h = Math.floor(minutes / 60)
  return t('change.outcome.notice', { h, m: minutes % 60 })
}

/** The outcome of FACT-CANCELLATION-RULES as staff read it: what it means, and the amounts the Owner applies. */
export function OutcomeView({ t, outcome, preview }: { t: T; outcome: Outcome; preview?: CancellationPreview | null }) {
  return (
    <div className="staff-request__section" data-testid="cancellation-outcome" data-outcome={outcome.kind}>
      <p>
        <strong>{codeLabel(t, 'cancellationOutcome', outcome.kind)}</strong>
      </p>
      <ul className="staff-request__list">
        <li>{noticeText(t, outcome.noticeMinutes)}</li>
        {preview ? <li>{t('change.outcome.deposit', { amount: money(preview.depositPaidCents) })}</li> : null}
        {preview && preview.depositPendingCents > 0 ? (
          <li>{t('change.outcome.pending', { amount: money(preview.depositPendingCents) })}</li>
        ) : null}
        {preview?.workStarted ? <li>{t('change.outcome.workStarted')}</li> : null}
        {outcome.keptCents !== null && outcome.keptCents > 0 ? (
          <li>{t('change.outcome.kept', { amount: money(outcome.keptCents) })}</li>
        ) : null}
        {outcome.refundCents !== null && outcome.refundCents > 0 ? (
          <li>
            {t(outcome.kind === 'customer_chooses' ? 'change.outcome.refundIfChosen' : 'change.outcome.refund', {
              amount: money(outcome.refundCents),
            })}
          </li>
        ) : null}
        {outcome.invoiceCents !== null && outcome.invoiceCents > 0 ? (
          <li>{t('change.outcome.invoice', { amount: money(outcome.invoiceCents) })}</li>
        ) : null}
      </ul>
      <p className="staff-request__hint">{t('change.outcome.ownerApplies')}</p>
    </div>
  )
}

/** The customer's open request: their words, what confirming it means, and Confirm or Decline. */
export function ChangeRequestPanel({
  t,
  locale,
  fetchImpl,
  request,
  ownerOnly,
  onConfirm,
  onChanged,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  request: ChangeRequest
  /** A work visit's cancellation request, which only the Owner confirms or declines. */
  ownerOnly: boolean
  onConfirm: () => void
  onChanged: (message: string | null) => void
}) {
  const ids = useId()
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const key = useRef<string | null>(null)
  const asked = new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(request.requestedAt))
  async function decline(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    key.current = key.current ?? idempotencyKey()
    const r = await call<unknown>(fetchImpl, `/staff/visit-change-requests/${encodeURIComponent(request.id)}/decline`, {
      method: 'POST',
      headers: { 'idempotency-key': key.current, 'if-match': `"${request.version}"` },
      body: { reason: reason.trim() },
    })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (r.ok) return onChanged(t('change.request.declined'))
    if (r.error.code === 'STALE_VERSION') return onChanged(null)
    setError(
      r.error.fieldErrors.length
        ? r.error.fieldErrors.map((f) => codeLabel(t, 'visitProblem', f.code)).join(' ')
        : codeLabel(t, 'visitProblem', r.error.code),
    )
  }
  return (
    <section
      className="staff-request__section"
      aria-labelledby={`${ids}-title`}
      data-testid="change-request"
      data-kind={request.kind}
    >
      <h3 id={`${ids}-title`}>{codeLabel(t, 'changeRequestKind', request.kind)}</h3>
      <p role="status">{t('change.request.kept')}</p>
      <dl className="staff-system__fields">
        <div>
          <dt>{t('change.request.askedAt')}</dt>
          <dd>{asked}</dd>
        </div>
        <div>
          <dt>{t('change.request.reason')}</dt>
          <dd>{request.reason ?? t('change.request.none')}</dd>
        </div>
        {request.kind === 'reschedule' ? (
          <div>
            <dt>{t('change.request.times')}</dt>
            <dd>{request.preferredTimes ?? t('change.request.none')}</dd>
          </div>
        ) : null}
      </dl>
      {request.outcome ? <OutcomeView t={t} outcome={request.outcome} /> : null}
      {ownerOnly && !request.actions.confirm ? <p className="staff-request__hint">{t('change.ownerOnly')}</p> : null}
      <div className="hh-button-row">
        {request.actions.confirm ? (
          <Button onClick={onConfirm}>
            {t(request.kind === 'reschedule' ? 'change.request.confirmReschedule' : 'change.request.confirmCancel')}
          </Button>
        ) : null}
        {request.actions.decline && !declining ? (
          <Button variant="secondary" onClick={() => setDeclining(true)}>
            {t('change.request.decline')}
          </Button>
        ) : null}
      </div>
      {declining ? (
        <form className="staff-request__form" onSubmit={(e) => void decline(e)} data-testid="decline-request">
          <Field
            label={t('change.request.declineReason')}
            value={reason}
            required
            onChange={(e) => setReason(e.target.value)}
          />
          {error ? (
            <p className="hh-field__error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="hh-button-row">
            <Button type="submit" pending={pending}>
              {t('change.request.declineSubmit')}
            </Button>
            <Button variant="secondary" onClick={() => setDeclining(false)}>
              {t('visits.change.cancel')}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  )
}

/**
 * Reassign a confirmed visit: the new team for the same window, with a reason. `replace` pre-fills a swap (a drop on
 * another worker's lane): the dragged worker is replaced by the worker of that lane. Nothing is saved until Reassign.
 */
export function ReassignVisit({
  t,
  locale,
  fetchImpl,
  visit,
  replace,
  onCancel,
  onSaved,
  onReload,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  visit: ChangeableVisit
  replace: { from: string; to: string } | null
  onCancel: () => void
  onSaved: () => void
  onReload: () => void
}) {
  const ids = useId()
  const current = visit.team.filter((m) => m.kind === 'confirmed')
  const lead = current.find((m) => m.role === 'lead')?.worker.id
  const start = [...(lead ? [lead] : []), ...current.filter((m) => m.role !== 'lead').map((m) => m.worker.id)]
  const [workers, setWorkers] = useState<string[]>(
    replace ? start.map((id) => (id === replace.from ? replace.to : id)) : start,
  )
  const [reason, setReason] = useState('')
  const [day, setDay] = useState<CapacityDay | null | undefined>(undefined)
  const [refusal, setRefusal] = useState<{ reasons: string[]; alternatives: Alternatives | null } | null>(null)
  const [stale, setStale] = useState(false)
  const [pending, setPending] = useState(false)
  const key = useRef<string | null>(null)
  const load = useCallback(async () => {
    const r = await call<CapacityDay>(fetchImpl, `/staff/capacity?date=${encodeURIComponent(visit.window.localDate)}`)
    setDay(r.ok ? r.data : null)
  }, [fetchImpl, visit.window.localDate])
  useEffect(() => {
    void load()
  }, [load])
  const work = visit.purpose !== 'site_estimate'
  const candidates = (day?.workers ?? []).filter((w) =>
    work ? w.eligibleFor.workVisits : w.eligibleFor.estimateVisits,
  )
  const names = {
    workers: new Map((day?.workers ?? []).map((w) => [w.id, w.name ?? t('queue.unnamed')])),
    equipment: new Map((day?.equipment ?? []).map((e) => [e.id, e.name])),
  }
  const toggle = (id: string) => setWorkers(workers.includes(id) ? workers.filter((x) => x !== id) : [...workers, id])
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    key.current = key.current ?? idempotencyKey()
    const r = await call<unknown>(fetchImpl, `/staff/visits/${encodeURIComponent(visit.id)}/reassign`, {
      method: 'POST',
      headers: { 'idempotency-key': key.current, 'if-match': `"${visit.version}"` },
      body: { workerIds: workers, reason: reason.trim() },
    })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (r.ok) return onSaved()
    if (r.error.code === 'STALE_VERSION') return setStale(true)
    setRefusal({ reasons: capacityReasons(t, r.error, names), alternatives: r.error.alternatives ?? null })
    void load()
  }
  return (
    <form
      className="staff-request__form"
      onSubmit={(e) => void submit(e)}
      aria-labelledby={`${ids}-title`}
      data-testid="board-reassign"
    >
      <h3 id={`${ids}-title`}>{t('change.reassign.title')}</h3>
      {replace ? (
        <p role="status" className="staff-board__notice">
          {t('change.reassign.dropped', {
            from: names.workers.get(replace.from) ?? t('queue.unnamed'),
            to: names.workers.get(replace.to) ?? t('queue.unnamed'),
          })}
        </p>
      ) : null}
      <p className="staff-request__hint">{t('change.reassign.hint', { n: visit.requiredWorkers ?? 0 })}</p>
      {day === undefined ? <StateView kind="loading" title={t('capacity.loading')} /> : null}
      {day === null ? <StateView kind="error" title={t('capacity.unavailable')} /> : null}
      {day ? (
        <fieldset className="staff-request__check">
          <legend>{t('capacity.confirm.workers')}</legend>
          <div className="staff-request__outcomes">
            {candidates.map((w) => (
              <label key={w.id}>
                <input type="checkbox" checked={workers.includes(w.id)} onChange={() => toggle(w.id)} />
                {w.name ?? t('queue.unnamed')}
                {workers[0] === w.id ? ` (${codeLabel(t, 'reservationRole', 'lead')})` : ''}
              </label>
            ))}
          </div>
          <p className="staff-request__hint">{t('capacity.confirm.leadHint')}</p>
        </fieldset>
      ) : null}
      <Field label={t('change.reason')} value={reason} required onChange={(e) => setReason(e.target.value)} />
      {stale ? (
        <StateView
          kind="stale"
          title={t('conflict.title')}
          action={
            <Button variant="secondary" onClick={onReload}>
              {t('visits.reload')}
            </Button>
          }
        >
          <p>{t('visits.stale')}</p>
        </StateView>
      ) : null}
      {refusal ? (
        <StateView kind="error" title={t('capacity.refused')} reasons={refusal.reasons}>
          <p>{t('board.move.kept')}</p>
          {refusal.alternatives ? (
            <AlternativesView
              t={t}
              locale={locale}
              zone={day?.timeZone ?? visit.window.timeZone}
              alternatives={refusal.alternatives}
            />
          ) : null}
        </StateView>
      ) : null}
      <div className="hh-button-row">
        <Button type="submit" pending={pending || !day}>
          {t('change.reassign.submit')}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t('visits.change.cancel')}
        </Button>
      </div>
    </form>
  )
}

/** Cancel a confirmed visit: who is cancelling and why, with the outcome shown before anything is saved. */
export function CancelVisit({
  t,
  fetchImpl,
  visit,
  request,
  onCancel,
  onSaved,
  onReload,
}: {
  t: T
  fetchImpl: Fetch
  visit: ChangeableVisit
  /** The customer's cancellation request this confirms, if any. */
  request: ChangeRequest | null
  onCancel: () => void
  onSaved: () => void
  onReload: () => void
}) {
  const ids = useId()
  const [initiator, setInitiator] = useState<'customer' | 'handyhub' | ''>(request ? 'customer' : '')
  const [cause, setCause] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string[] | null>(null)
  const [stale, setStale] = useState(false)
  const [pending, setPending] = useState(false)
  const key = useRef<string | null>(null)
  const preview = visit.cancellationPreview
  const outcome = request?.outcome ?? (initiator && preview ? preview[initiator] : null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    key.current = key.current ?? idempotencyKey()
    const r = await call<unknown>(fetchImpl, `/staff/visits/${encodeURIComponent(visit.id)}/cancel`, {
      method: 'POST',
      headers: { 'idempotency-key': key.current, 'if-match': `"${visit.version}"` },
      body: {
        reason: reason.trim(),
        ...(request
          ? { changeRequestId: request.id }
          : {
              ...(initiator ? { initiator } : {}),
              ...(initiator === 'handyhub' && cause ? { handyhubCause: cause } : {}),
            }),
      },
    })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (r.ok) return onSaved()
    if (r.error.code === 'STALE_VERSION') return setStale(true)
    setError(
      r.error.fieldErrors.length
        ? r.error.fieldErrors.map((f) => codeLabel(t, 'visitProblem', f.code))
        : [codeLabel(t, 'visitProblem', r.error.code)],
    )
  }
  return (
    <form
      className="staff-request__form"
      onSubmit={(e) => void submit(e)}
      aria-labelledby={`${ids}-title`}
      data-testid="board-cancel"
    >
      <h3 id={`${ids}-title`}>{t('change.cancel.title')}</h3>
      {request ? (
        <p className="staff-request__hint">{t('change.cancel.fromRequest')}</p>
      ) : (
        <fieldset className="staff-request__check">
          <legend>{t('change.cancel.initiator')}</legend>
          <div className="staff-request__outcomes">
            {(['customer', 'handyhub'] as const).map((i) => (
              <label key={i}>
                <input
                  type="radio"
                  name={`${ids}-initiator`}
                  checked={initiator === i}
                  onChange={() => setInitiator(i)}
                />
                {codeLabel(t, 'changeInitiator', i)}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {initiator === 'handyhub' && !request ? (
        <div className="staff-queue__select">
          <label htmlFor={`${ids}-sel1`}>{t('change.cause')}</label>
          <select id={`${ids}-sel1`} value={cause} onChange={(e) => setCause(e.target.value)}>
            <option value="">{t('change.cause.choose')}</option>
            {HANDYHUB_CAUSES.map((c) => (
              <option key={c} value={c}>
                {codeLabel(t, 'handyhubCause', c)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {outcome ? <OutcomeView t={t} outcome={outcome} preview={preview} /> : null}
      {!outcome && !preview ? <StateView kind="blocked" title={t('change.outcome.notConfigured')} /> : null}
      <Field label={t('change.reason')} value={reason} required onChange={(e) => setReason(e.target.value)} />
      {stale ? (
        <StateView
          kind="stale"
          title={t('conflict.title')}
          action={
            <Button variant="secondary" onClick={onReload}>
              {t('visits.reload')}
            </Button>
          }
        >
          <p>{t('visits.stale')}</p>
        </StateView>
      ) : null}
      {error ? (
        <StateView kind="error" title={t('visits.refused')} reasons={error}>
          <p>{t('board.move.kept')}</p>
        </StateView>
      ) : null}
      <div className="hh-button-row">
        <Button type="submit" variant="danger" pending={pending}>
          {t('change.cancel.submit')}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {t('change.cancel.keep')}
        </Button>
      </div>
    </form>
  )
}
