// The unpaid-balance reminders of an issued final invoice (TSK-0091; HH-FIN-19, OWN-DEC-210, OWN-DEC-112,
// RULE-SERVER-AUTHZ). Shown under the invoice on the job's payments page, and as its own page from the staff queue
// ("Payment reminders to review") and Owner Decisions ("Overdue—owner decision"), to the Owner and Office.
// - The two reminders are automatic emails, 3 and 7 calendar days after the due date: the panel shows the due date
//   they count from, when each is due, whether a stop rule applies now (paid, a payment recorded, a dispute, a review,
//   a payment plan or a hold), and each reminder with its state and reason. Nobody sends or dismisses them.
// - Staff record the next step: a revised due date, a payment plan, a collection hold or its end, and release a
//   follow-up reminder after the second one was sent or after a payment suspended them. The Owner records the
//   Overdue—owner decision. The server decides every action again; a refusal names its reason.
import type { StaffKey } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { reminderShownState, reminderTone } from './EstimateReminders'
import { codeLabel } from './Requests'
import { useOnline } from './Shell'

type T = (key: StaffKey, values?: Record<string, string | number | Date>) => string
type StaffRef = { id: string; name: string | null }

export type InvoiceReminder = {
  id: string
  stage: 1 | 2 | null
  release: 'automatic' | 'staff_released'
  state: string
  reason: string | null
  scheduledAt: string | null
  sentAt: string | null
  cancelledAt: string | null
}
export type CollectionStep = {
  id: string
  kind: string
  dueOn: string | null
  endsStepId: string | null
  ended: boolean
  note: string | null
  recordedBy: StaffRef
  recordedAt: string
}
export type InvoiceRemindersData = {
  invoiceId: string
  jobId: string
  projectReference: string
  invoiceNumber: string | null
  invoiceState: string
  cadence:
    | { state: 'CONFIGURED'; proposed: boolean; firstDaysAfterDue: number; secondDaysAfterDue: number }
    | { state: 'NOT_CONFIGURED' }
  dueOn: string | null
  dueRevised: boolean
  stageDueAt: { stage: 1 | 2; dueAt: string | null }[]
  stoppedBy: string | null
  reminders: InvoiceReminder[]
  steps: CollectionStep[]
  review: boolean
  overdue: boolean
  actions: { recordStep: boolean; releaseFollowUp: boolean; followUpBlockedBy: string | null; decideOverdue: boolean }
}

const STEP_KINDS = ['revised_due_date', 'payment_plan', 'collection_hold'] as const

/** The label of a refusal: the reminder refusal, or the stop reason it names. */
export function reminderRefusal(t: T, err: ApiErrorBody): string {
  const code = err.fieldErrors[0]?.code
  if (code) {
    const own = codeLabel(t, 'invoiceReminderRefusal', code)
    if (own !== code) return own
    const reason = codeLabel(t, 'reminderReason', code.toLowerCase())
    if (reason !== code.toLowerCase()) return reason
  }
  return t('invoiceReminders.refused')
}

/** The reminders panel of one invoice; nothing while it cannot be read (no access, or not a final invoice). */
export function InvoiceReminders({
  t,
  fetchImpl,
  invoiceId,
  refreshKey,
  onLoaded,
}: {
  t: T
  fetchImpl: Fetch
  invoiceId: string
  /** Changes when the invoice changes (its version), so the panel reads the stop rule again. */
  refreshKey?: number | string
  onLoaded?: (data: InvoiceRemindersData | null) => void
}) {
  const ids = useId()
  const online = useOnline()
  const [view, setView] = useState<InvoiceRemindersData | null | undefined>(undefined)
  const [kind, setKind] = useState<(typeof STEP_KINDS)[number]>('revised_due_date')
  const [dueOn, setDueOn] = useState('')
  const [note, setNote] = useState('')
  const [followUpNote, setFollowUpNote] = useState('')
  const [decisionNote, setDecisionNote] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const key = useRef(new Map<string, string>())
  const path = `/staff/invoices/${encodeURIComponent(invoiceId)}`

  const load = useCallback(async () => {
    const r = await call<InvoiceRemindersData>(fetchImpl, `${path}/reminders`)
    const data = r.ok && Array.isArray(r.data?.reminders) ? r.data : null
    setView(data)
    onLoaded?.(data)
  }, [fetchImpl, path, onLoaded])
  useEffect(() => {
    void load()
  }, [load, refreshKey])

  /** One write with its idempotency key (kept for a retry after a server failure). */
  async function send(action: string, to: string, body: unknown, doneText: string): Promise<boolean> {
    setPending(action)
    setProblem(null)
    setDone(null)
    const idem = key.current.get(action) ?? idempotencyKey()
    key.current.set(action, idem)
    const r = await call<InvoiceRemindersData>(fetchImpl, to, {
      method: 'POST',
      body,
      headers: { 'idempotency-key': idem },
    })
    setPending(null)
    if (r.ok || r.status < 500) key.current.delete(action)
    if (!r.ok) {
      setProblem(reminderRefusal(t, r.error))
      return false
    }
    setView(r.data)
    onLoaded?.(r.data)
    setDone(doneText)
    return true
  }

  if (!view) return null
  const when = (iso: string) => new Date(iso)
  const c = view.cadence
  const activeArrangements = view.steps.filter(
    (s) => (s.kind === 'payment_plan' || s.kind === 'collection_hold') && !s.ended,
  )
  const offline = !online ? { disabledReason: t('offline.needsConnection') } : {}

  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-title`} data-testid="invoice-reminders">
      <h3 id={`${ids}-title`} className="staff-queue__heading">
        {t('invoiceReminders.title')}
      </h3>
      <p className="staff-request__hint">{t('invoiceReminders.hint')}</p>
      {c.state === 'CONFIGURED' ? (
        <p>
          {t('invoiceReminders.schedule', { first: c.firstDaysAfterDue, second: c.secondDaysAfterDue })}
          {view.dueOn ? (
            <>
              {' '}
              {view.dueRevised
                ? t('invoiceReminders.dueOnRevised', { date: view.dueOn })
                : t('invoiceReminders.dueOn', { date: view.dueOn })}
            </>
          ) : null}
        </p>
      ) : (
        <StateView kind="blocked" title={t('invoiceReminders.notConfigured')} />
      )}
      {view.stageDueAt.some((s) => s.dueAt) && !view.stoppedBy ? (
        <ul aria-label={t('invoiceReminders.stages')}>
          {view.stageDueAt.map((s) =>
            s.dueAt ? (
              <li key={s.stage} data-testid="invoice-reminder-stage">
                {t('invoiceReminders.stageDue', { stage: s.stage, time: when(s.dueAt) })}
              </li>
            ) : null,
          )}
        </ul>
      ) : null}
      {view.stoppedBy ? (
        <StateView
          kind="empty"
          title={t('invoiceReminders.stopped', { reason: codeLabel(t, 'reminderReason', view.stoppedBy) })}
        />
      ) : null}
      {view.review ? (
        <p role="status" data-testid="invoice-reminders-review">
          <StatusBadge tone="warning">{t('invoiceReminders.reviewBadge')}</StatusBadge> {t('invoiceReminders.review')}
        </p>
      ) : null}
      {view.overdue ? (
        <p role="status" data-testid="invoice-reminders-overdue">
          <StatusBadge tone="danger">{codeLabel(t, 'queueItemType', 'invoice_overdue_decision')}</StatusBadge>{' '}
          {t('invoiceReminders.overdue')}
        </p>
      ) : null}

      {view.reminders.length ? (
        <ol className="staff-estimate__responses" aria-label={t('invoiceReminders.list')}>
          {view.reminders.map((r) => {
            const state = reminderShownState(r)
            return (
              <li key={r.id} data-testid="invoice-reminder">
                <p>
                  <strong>
                    {r.stage === null
                      ? t('invoiceReminders.followUp')
                      : t('invoiceReminders.stage', { stage: r.stage })}
                  </strong>{' '}
                  <StatusBadge tone={reminderTone(state)}>{codeLabel(t, 'reminderState', state)}</StatusBadge>
                </p>
                {r.scheduledAt ? <p>{t('invoiceReminders.dueAt', { time: when(r.scheduledAt) })}</p> : null}
                {r.sentAt ? <p>{t('invoiceReminders.sentAt', { time: when(r.sentAt) })}</p> : null}
                {r.cancelledAt ? <p>{t('invoiceReminders.cancelledAt', { time: when(r.cancelledAt) })}</p> : null}
                {r.reason ? (
                  <p>{t('invoiceReminders.reason', { reason: codeLabel(t, 'reminderReason', r.reason) })}</p>
                ) : null}
              </li>
            )
          })}
        </ol>
      ) : (
        <p>{t('invoiceReminders.none')}</p>
      )}

      {view.steps.length ? (
        <>
          <h4 className="staff-queue__heading">{t('invoiceReminders.steps')}</h4>
          <ul data-testid="invoice-collection-steps">
            {view.steps.map((s) => (
              <li key={s.id} data-testid="invoice-collection-step">
                <strong>{codeLabel(t, 'collectionStep', s.kind)}</strong>
                {s.dueOn ? ` · ${t('invoiceReminders.stepDueOn', { date: s.dueOn })}` : ''}
                {s.ended ? ` · ${t('invoiceReminders.ended')}` : ''}
                <br />
                {t('invoiceReminders.stepBy', {
                  name: s.recordedBy.name ?? t('queue.unnamed'),
                  time: when(s.recordedAt),
                })}
                {s.note ? (
                  <>
                    <br />
                    {s.note}
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {view.actions.decideOverdue ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (decisionNote.trim() === '') return setProblem(t('invoiceReminders.noteRequired'))
            void send(
              'decide',
              `${path}/overdue-decision`,
              { note: decisionNote.trim() },
              t('invoiceReminders.decided'),
            ).then((ok) => ok && setDecisionNote(''))
          }}
          noValidate
          aria-label={t('invoiceReminders.decideTitle')}
        >
          <p className="staff-request__hint">{t('invoiceReminders.decideHint')}</p>
          <Field
            label={t('invoiceReminders.note')}
            name="overdueNote"
            multiline
            maxLength={2000}
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            required
          />
          <Button type="submit" pending={pending === 'decide'} {...offline}>
            {t('invoiceReminders.decide')}
          </Button>
        </form>
      ) : null}

      {view.actions.releaseFollowUp ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void send(
              'follow-up',
              `${path}/reminders/follow-up`,
              { note: followUpNote.trim() || null },
              t('invoiceReminders.followUpReleased'),
            ).then((ok) => ok && setFollowUpNote(''))
          }}
          noValidate
          aria-label={t('invoiceReminders.followUpTitle')}
        >
          <p className="staff-request__hint">{t('invoiceReminders.followUpHint')}</p>
          <Field
            label={t('invoiceReminders.noteOptional')}
            name="followUpNote"
            multiline
            maxLength={2000}
            value={followUpNote}
            onChange={(e) => setFollowUpNote(e.target.value)}
          />
          <Button type="submit" variant="secondary" pending={pending === 'follow-up'} {...offline}>
            {t('invoiceReminders.releaseFollowUp')}
          </Button>
        </form>
      ) : view.actions.followUpBlockedBy && view.actions.recordStep ? (
        <p className="staff-request__hint" data-testid="invoice-follow-up-blocked">
          {t('invoiceReminders.followUpBlocked', {
            reason: codeLabel(t, 'reminderReason', view.actions.followUpBlockedBy),
          })}
        </p>
      ) : null}

      {view.actions.recordStep ? (
        <>
          {activeArrangements.map((a) => (
            <div key={a.id} className="hh-button-row">
              <Button
                variant="secondary"
                pending={pending === `end-${a.id}`}
                onClick={() => {
                  if (note.trim() === '') return setProblem(t('invoiceReminders.noteRequired'))
                  void send(
                    `end-${a.id}`,
                    `${path}/reminders/steps`,
                    { kind: 'arrangement_ended', endsStepId: a.id, note: note.trim() },
                    t('invoiceReminders.recorded'),
                  ).then((ok) => ok && setNote(''))
                }}
                {...offline}
              >
                {t('invoiceReminders.end', { kind: codeLabel(t, 'collectionStep', a.kind) })}
              </Button>
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (note.trim() === '') return setProblem(t('invoiceReminders.noteRequired'))
              if (kind === 'revised_due_date' && dueOn === '') return setProblem(t('invoiceReminders.dueOnRequired'))
              void send(
                'step',
                `${path}/reminders/steps`,
                { kind, note: note.trim(), ...(kind === 'revised_due_date' ? { dueOn } : {}) },
                t('invoiceReminders.recorded'),
              ).then((ok) => ok && (setNote(''), setDueOn('')))
            }}
            noValidate
            aria-label={t('invoiceReminders.stepTitle')}
          >
            <p className="staff-request__hint">{t('invoiceReminders.stepHint')}</p>
            <div className="staff-queue__select">
              <label htmlFor={`${ids}-kind`}>{t('invoiceReminders.stepKind')}</label>
              <select
                id={`${ids}-kind`}
                value={kind}
                onChange={(e) => setKind(e.target.value as (typeof STEP_KINDS)[number])}
              >
                {STEP_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {codeLabel(t, 'collectionStep', k)}
                  </option>
                ))}
              </select>
            </div>
            {kind === 'revised_due_date' ? (
              <Field
                label={t('invoiceReminders.newDueOn')}
                name="revisedDueOn"
                type="date"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
                required
              />
            ) : null}
            <Field
              label={t('invoiceReminders.note')}
              hint={t('invoiceReminders.noteHint')}
              name="collectionNote"
              multiline
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              required
            />
            <Button type="submit" pending={pending === 'step'} {...offline}>
              {t('invoiceReminders.record')}
            </Button>
          </form>
        </>
      ) : null}
      {problem ? (
        <p role="alert" className="hh-field__error">
          {problem}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="staff-request__hint">
          {done}
        </p>
      ) : null}
    </section>
  )
}

/** One invoice's reminders as its own page (/invoice-reminders/<invoice id>): the queue items' deep link. */
export function InvoiceRemindersPage({
  t,
  fetchImpl,
  href,
  invoiceId,
}: {
  t: T
  fetchImpl: Fetch
  href: (path: string) => string
  invoiceId: string
}) {
  const [data, setData] = useState<InvoiceRemindersData | null | undefined>(undefined)
  const loaded = useCallback((d: InvoiceRemindersData | null) => setData(d), [])
  return (
    <section className="staff-screen staff-request" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {data?.invoiceNumber
          ? t('invoiceReminders.pageTitleNamed', { number: data.invoiceNumber })
          : t('invoiceReminders.pageTitle')}
      </h1>
      {data ? (
        <p>
          <a href={href(`/payments/${data.jobId}`)}>
            {t('invoiceReminders.openJob', { reference: data.projectReference })}
          </a>
        </p>
      ) : null}
      {data === null ? <StateView kind="empty" title={t('invoiceReminders.notFound')} /> : null}
      <InvoiceReminders t={t} fetchImpl={fetchImpl} invoiceId={invoiceId} onLoaded={loaded} />
    </section>
  )
}
