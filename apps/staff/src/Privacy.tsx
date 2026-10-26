// The privacy requests screen (TSK-0100; HH-PRIV-03, ENT-PrivacyRequest, OWN-DEC-71, OWN-DEC-113, OWN-DEC-70,
// OQ-PRIVACY-REQUESTS). The Owner sees each customer's export, correction and deletion requests, opens the review and
// decides. The review shows the scoped search as the server counts it: every record kind, what a deletion does with
// it (delete, retain with why and until when, exclude other people's data, none stored, not recorded), and the
// checks the software cannot run, which the Owner ticks before completing a deletion. Completing a deletion can close
// sign-in and project access even while a hold keeps records. A fresh sign-in and a reason are asked for by the
// server; the outcome notice is NOT CONFIGURED.
// TSK-0136 (HH-PRIV-07, OWN-DEC-175, OWN-DEC-205): each request shows its dates as the server counted them (received,
// the automatic acknowledgment, the substantive acknowledgment due, the internal target with its extensions, the legal
// deadline once recorded) and its overdue alerts; the Owner extends the target with a reason the customer is shown,
// and records the legal deadline the attorney defines. Nothing closes when a date passes. An Owner Decisions item
// opens one request (/privacy/<id>).
// TSK-0152 (OWN-DEC-201): each request shows how the identity was verified and its risk; completing an export or a
// deletion asks the Owner to confirm the identity evidence (I1). The Owner records a request for a person verified
// outside the portal (the secure alternative, I1). A correction request shows its history: the changes made in the
// records' own screens since it arrived, and the corrections recorded as new entries beside records that are never
// rewritten, which the Owner adds here (I3). The accounting checks are found or none found (I4).
import { LABEL_FAMILIES, type StaffKey, type StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { ReauthForm, useOwnerWrite } from './OwnerWrite'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

export type PlanItem = {
  category: string
  disposition: string
  count: number
  reason: string | null
  retention: string | null
  years: number | null
  reviewAt: string | null
}

export type PrivacyRequestItem = {
  id: string
  reference: string
  kind: 'export' | 'correction' | 'deletion'
  state: 'received' | 'under_review' | 'completed' | 'partially_completed' | 'declined'
  details: string | null
  submittedAt: string
  reviewStartedAt: string | null
  decidedAt: string | null
  version: number
  project: { reference: string }
  customer: { name: string }
  contact: { name: string; email: string | null; phone: string | null }
  account: boolean
  accessClosed: boolean | null
  outcome: {
    deleted: { category: string; count: number }[]
    retained: PlanItem[]
    excluded: PlanItem[]
    exportReady: boolean
    accessClosed: boolean
  } | null
  deadlines: Deadlines
  /** TSK-0152: how the identity was verified, the request's risk and the Owner's confirmation. */
  identity: {
    risk: 'standard' | 'elevated'
    method: 'fresh_session_code' | 'staff_verified'
    via: 'link' | 'account' | 'owner'
    verifiedAt: string
    check: string | null
    note: string | null
    recordedBy: string | null
    confirmedAt: string | null
    confirmedBy: string | null
  }
}

/** TSK-0152 (I3): a correction request's history. */
export type CorrectionHistory = {
  changes: { record: string; fields: string[]; changedAt: string }[]
  entries: {
    id: string
    recordKind: string
    recordRef: string
    correction: string
    recordedAt: string
    recordedBy: { id: string; name: string | null }
  }[]
}

/** TSK-0136: the request's dates as the server counted them, and its overdue alerts today. */
export type Deadlines = {
  state: 'CONFIGURED' | 'NOT_CONFIGURED'
  receivedOn: string | null
  zone: string | null
  calendarVersion: number | null
  targetsVersion: number | null
  acknowledgedAt: string | null
  acknowledgmentDueOn: string | null
  substantiveAcknowledgedAt: string | null
  targetDueOn: string | null
  targetOn: string | null
  extensions: { previousTargetOn: string; targetOn: string; reason: string; decidedAt: string }[]
  legalDeadline: { on: string | null; note: string | null; recordedAt: string | null }
  today: string | null
  alerts: ('acknowledgment_overdue' | 'completion_overdue' | 'legal_deadline_overdue')[]
}

export type PrivacyRequestDetail = PrivacyRequestItem & {
  plan: {
    items: PlanItem[]
    checks: { check: string; result: string; count?: number }[]
    confirm: string[]
    deletable: {
      estimates: { id: string; reference: string; projectId: string }[]
      accountIds: string[]
      grantIds: string[]
      sessions: number
    }
  }
  findings: { items: PlanItem[]; checks: unknown[]; at: string } | null
  corrections: CorrectionHistory | null
}

const STATE_TONE = {
  received: 'info',
  under_review: 'warning',
  completed: 'success',
  partially_completed: 'success',
  declined: 'neutral',
} as const
const DISPOSITION_TONE = {
  delete: 'danger',
  retain: 'neutral',
  exclude: 'neutral',
  none_stored: 'neutral',
  not_recorded: 'warning',
} as const

const COMPLETE_LABEL: Record<PrivacyRequestItem['kind'], StaffKey> = {
  export: 'privacy.decision.complete.export',
  correction: 'privacy.decision.complete.correction',
  deletion: 'privacy.decision.complete.deletion',
}

const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')
/** A calendar date (YYYY-MM-DD, the business zone's) as people read it: formatted at UTC noon, so no zone moves it. */
const dayText = (locale: StaffLocale, date: string) =>
  new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
const isOpen = (state: PrivacyRequestItem['state']) => state === 'received' || state === 'under_review'

/** The overdue alerts of a request, as badges. */
function Alerts({ t, d }: { t: T; d: Deadlines }) {
  if (d.alerts.length === 0) return null
  return (
    <p aria-label={t('privacy.dates.alerts')} data-testid="privacy-alerts">
      {d.alerts.map((a) => (
        <StatusBadge key={a} tone="danger">
          {codeLabel(t, 'privacyAlert', a)}
        </StatusBadge>
      ))}
    </p>
  )
}

/** The request's dates (TSK-0136). */
function Dates({ t, locale, r }: { t: T; locale: StaffLocale; r: PrivacyRequestItem }) {
  const d = r.deadlines
  const time = new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <ul className="staff-queue__facts" aria-label={t('privacy.dates.title')}>
      {d.state === 'NOT_CONFIGURED' ? <li>{t('privacy.dates.notConfigured')}</li> : null}
      {d.receivedOn && d.zone ? (
        <li>{t('privacy.dates.received', { date: dayText(locale, d.receivedOn), zone: d.zone })}</li>
      ) : null}
      <li>
        {d.acknowledgedAt
          ? t('privacy.dates.acknowledged', { time: time.format(new Date(d.acknowledgedAt)) })
          : t('privacy.dates.notAcknowledged')}
      </li>
      {d.substantiveAcknowledgedAt ? (
        <li>{t('privacy.dates.ackDone', { time: time.format(new Date(d.substantiveAcknowledgedAt)) })}</li>
      ) : d.acknowledgmentDueOn ? (
        <li>{t('privacy.dates.ackDue', { date: dayText(locale, d.acknowledgmentDueOn) })}</li>
      ) : null}
      {d.targetOn && d.targetDueOn ? (
        <li>
          {d.extensions.length
            ? t('privacy.dates.targetExtended', {
                date: dayText(locale, d.targetOn),
                original: dayText(locale, d.targetDueOn),
              })
            : t('privacy.dates.target', { date: dayText(locale, d.targetOn) })}
        </li>
      ) : null}
      {d.extensions.map((e) => (
        <li key={e.previousTargetOn}>
          {t('privacy.dates.extension', {
            from: dayText(locale, e.previousTargetOn),
            to: dayText(locale, e.targetOn),
            time: time.format(new Date(e.decidedAt)),
            reason: e.reason,
          })}
        </li>
      ))}
      <li>
        {d.legalDeadline.on
          ? t('privacy.dates.legal', { date: dayText(locale, d.legalDeadline.on), note: d.legalDeadline.note ?? '' })
          : t('privacy.dates.legalNone')}
      </li>
      {d.calendarVersion !== null && d.targetsVersion !== null ? (
        <li>{t('privacy.dates.counted', { calendar: d.calendarVersion, targets: d.targetsVersion })}</li>
      ) : null}
      {isOpen(r.state) ? <li>{t('privacy.dates.noAutoClose')}</li> : null}
    </ul>
  )
}

/**
 * The Owner's changes of an open request's dates (TSK-0136): extend the internal target with the reason the customer
 * sees, or record the legal deadline the attorney defines (empty clears it). No fresh sign-in (PROPOSED).
 */
function DateChange({
  t,
  d,
  kind,
  fetchImpl,
  onDone,
}: {
  t: T
  d: PrivacyRequestDetail
  kind: 'extension' | 'legal'
  fetchImpl: Fetch
  onDone: () => void
}) {
  const ids = useId()
  const [date, setDate] = useState(kind === 'legal' ? (d.deadlines.legalDeadline.on ?? '') : '')
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<{ ok: true } | { ok: false; reasons: string[] } | null>(null)
  const extension = kind === 'extension'
  const missing = !text.trim() || (extension && !date)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (missing) return
    setPending(true)
    const r = await call<{ version: number }>(
      fetchImpl,
      `/staff/privacy-requests/${d.id}/${extension ? 'extension' : 'legal-deadline'}`,
      {
        method: extension ? 'POST' : 'PUT',
        body: extension ? { targetOn: date, reason: text } : { on: date || null, note: text },
        headers: { 'idempotency-key': idempotencyKey(), 'if-match': `"${d.version}"` },
      },
    )
    setPending(false)
    if (!r.ok) return setOutcome({ ok: false, reasons: reasons(t, r.error) })
    setOutcome({ ok: true })
    setText('')
    onDone()
  }
  return (
    <form
      className="staff-privacy__decision"
      aria-labelledby={`${ids}-title`}
      onSubmit={(e) => void submit(e)}
      data-testid={extension ? 'privacy-extend' : 'privacy-legal-deadline'}
    >
      <h3 id={`${ids}-title`} className="staff-queue__title">
        {t(extension ? 'privacy.extend.title' : 'privacy.legal.title')}
      </h3>
      <p>{t(extension ? 'privacy.extend.intro' : 'privacy.legal.intro')}</p>
      <Field
        label={t(extension ? 'privacy.extend.date' : 'privacy.legal.date')}
        type="date"
        name={`${kind}-date`}
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      <Field
        label={t(extension ? 'privacy.extend.reason' : 'privacy.legal.note')}
        multiline
        name={`${kind}-text`}
        value={text}
        maxLength={1000}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="hh-button-row">
        <Button
          type="submit"
          variant="secondary"
          pending={pending}
          {...(missing ? { disabledReason: t('privacy.change.fieldsFirst') } : {})}
        >
          {t(extension ? 'privacy.extend.submit' : 'privacy.legal.submit')}
        </Button>
      </div>
      {outcome?.ok ? (
        <StateView kind="success" title={t(extension ? 'privacy.extend.done' : 'privacy.legal.done')} />
      ) : null}
      {outcome && !outcome.ok ? (
        <StateView kind="error" title={t('privacy.change.refused')} reasons={outcome.reasons} />
      ) : null}
    </form>
  )
}

/**
 * TSK-0152 (OWN-DEC-201 I3): a correction request's history, and the Owner's correction of a record that is never
 * rewritten, recorded as a new entry beside it (no fresh sign-in: nothing is disclosed or removed, PROPOSED).
 */
function Corrections({
  t,
  locale,
  d,
  corrections,
  fetchImpl,
  onDone,
}: {
  t: T
  locale: StaffLocale
  d: PrivacyRequestDetail
  corrections: CorrectionHistory
  fetchImpl: Fetch
  onDone: (d: PrivacyRequestDetail) => void
}) {
  const ids = useId()
  const [kind, setKind] = useState<string>(LABEL_FAMILIES.correctionRecordKind[0])
  const [ref, setRef] = useState('')
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<{ ok: true } | { ok: false; reasons: string[] } | null>(null)
  const time = new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' })
  const missing = !ref.trim() || !text.trim()
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (missing) return
    setPending(true)
    const r = await call<PrivacyRequestDetail>(fetchImpl, `/staff/privacy-requests/${d.id}/corrections`, {
      method: 'POST',
      body: { recordKind: kind, recordRef: ref, correction: text },
      headers: { 'idempotency-key': idempotencyKey() },
    })
    setPending(false)
    if (!r.ok) return setOutcome({ ok: false, reasons: reasons(t, r.error) })
    setOutcome({ ok: true })
    setRef('')
    setText('')
    onDone(r.data)
  }
  return (
    <section aria-labelledby={`${ids}-title`} data-testid="privacy-corrections">
      <h3 id={`${ids}-title`} className="staff-queue__title">
        {t('privacy.corrections.title')}
      </h3>
      <p>{t('privacy.corrections.intro')}</p>
      {corrections.changes.length + corrections.entries.length === 0 ? (
        <p>{t('privacy.corrections.none')}</p>
      ) : (
        <ul aria-labelledby={`${ids}-title`}>
          {corrections.changes.map((c, i) => (
            <li key={`c-${i}`}>
              {t('privacy.corrections.change', {
                record: codeLabel(t, 'correctionRecord', c.record),
                fields: c.fields.join(', '),
                time: time.format(new Date(c.changedAt)),
              })}
            </li>
          ))}
          {corrections.entries.map((e) => (
            <li key={e.id}>
              {t('privacy.corrections.entry', {
                kind: codeLabel(t, 'correctionRecordKind', e.recordKind),
                reference: e.recordRef,
                correction: e.correction,
                name: e.recordedBy.name ?? '',
                time: time.format(new Date(e.recordedAt)),
              })}
            </li>
          ))}
        </ul>
      )}
      {d.state === 'under_review' ? (
        <form
          className="staff-privacy__decision"
          aria-label={t('privacy.corrections.add')}
          onSubmit={(e) => void submit(e)}
        >
          <h4 className="staff-queue__title">{t('privacy.corrections.add')}</h4>
          <p>{t('privacy.corrections.addIntro')}</p>
          <div className="staff-queue__select">
            <label htmlFor={`${ids}-kind`}>{t('privacy.corrections.kind')}</label>
            <select id={`${ids}-kind`} value={kind} onChange={(e) => setKind(e.target.value)}>
              {LABEL_FAMILIES.correctionRecordKind.map((k) => (
                <option key={k} value={k}>
                  {codeLabel(t, 'correctionRecordKind', k)}
                </option>
              ))}
            </select>
          </div>
          <Field
            label={t('privacy.corrections.reference')}
            name="correction-reference"
            value={ref}
            maxLength={160}
            onChange={(e) => setRef(e.target.value)}
          />
          <Field
            label={t('privacy.corrections.text')}
            multiline
            name="correction-text"
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="hh-button-row">
            <Button
              type="submit"
              variant="secondary"
              pending={pending}
              {...(missing ? { disabledReason: t('privacy.change.fieldsFirst') } : {})}
            >
              {t('privacy.corrections.submit')}
            </Button>
          </div>
          {outcome?.ok ? <StateView kind="success" title={t('privacy.corrections.done')} /> : null}
          {outcome && !outcome.ok ? (
            <StateView kind="error" title={t('privacy.change.refused')} reasons={outcome.reasons} />
          ) : null}
        </form>
      ) : null}
    </section>
  )
}

/**
 * TSK-0152 (OWN-DEC-201 I1): the secure alternative. The Owner records a request for a person they verified outside
 * the portal (the check and a note), naming the project and the email or phone on file; a fresh sign-in is asked for.
 */
function RecordRequest({
  t,
  fetchImpl,
  onSession,
  onRecorded,
}: {
  t: T
  fetchImpl: Fetch
  onSession?: (s: { csrfToken: string }) => void
  onRecorded: (d: PrivacyRequestDetail) => void
}) {
  const ids = useId()
  const [kind, setKind] = useState<PrivacyRequestItem['kind']>('export')
  const [project, setProject] = useState('')
  const [contact, setContact] = useState('')
  const [details, setDetails] = useState('')
  const [check, setCheck] = useState<string>(LABEL_FAMILIES.privacyIdentityCheck[0])
  const [note, setNote] = useState('')
  const [outcome, setOutcome] = useState<{ ok: true; reference: string } | { ok: false; reasons: string[] } | null>(
    null,
  )
  const w = useOwnerWrite(fetchImpl, onSession)
  const missing = !project.trim() || !contact.trim() || !note.trim() || (kind === 'correction' && !details.trim())
  const send = () =>
    void w.send<PrivacyRequestDetail>(
      '/staff/privacy-requests',
      {
        kind,
        project,
        contact,
        check,
        note,
        ...(kind === 'correction' ? { details } : {}),
      },
      (r) => {
        if (!r.ok) return setOutcome({ ok: false, reasons: reasons(t, r.error) })
        setOutcome({ ok: true, reference: r.data.reference })
        setNote('')
        setDetails('')
        onRecorded(r.data)
      },
    )
  return (
    <details className="staff-privacy__record">
      <summary>{t('privacy.record.title')}</summary>
      <form
        className="staff-privacy__decision"
        aria-label={t('privacy.record.title')}
        onSubmit={(e) => {
          e.preventDefault()
          if (!missing) send()
        }}
      >
        <p>{t('privacy.record.intro')}</p>
        <div className="staff-queue__select">
          <label htmlFor={`${ids}-kind`}>{t('privacy.record.kind')}</label>
          <select
            id={`${ids}-kind`}
            value={kind}
            onChange={(e) => setKind(e.target.value as PrivacyRequestItem['kind'])}
          >
            {(['export', 'correction', 'deletion'] as const).map((k) => (
              <option key={k} value={k}>
                {codeLabel(t, 'privacyRequestKind', k)}
              </option>
            ))}
          </select>
        </div>
        <Field
          label={t('privacy.record.project')}
          name="record-project"
          value={project}
          maxLength={40}
          onChange={(e) => setProject(e.target.value)}
        />
        <Field
          label={t('privacy.record.contact')}
          name="record-contact"
          value={contact}
          maxLength={254}
          onChange={(e) => setContact(e.target.value)}
        />
        {kind === 'correction' ? (
          <Field
            label={t('privacy.record.details')}
            multiline
            name="record-details"
            value={details}
            maxLength={2000}
            onChange={(e) => setDetails(e.target.value)}
          />
        ) : null}
        <div className="staff-queue__select">
          <label htmlFor={`${ids}-check`}>{t('privacy.record.check')}</label>
          <select id={`${ids}-check`} value={check} onChange={(e) => setCheck(e.target.value)}>
            {LABEL_FAMILIES.privacyIdentityCheck.map((c) => (
              <option key={c} value={c}>
                {codeLabel(t, 'privacyIdentityCheck', c)}
              </option>
            ))}
          </select>
        </div>
        <Field
          label={t('privacy.record.note')}
          multiline
          name="record-note"
          value={note}
          maxLength={1000}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="hh-button-row">
          <Button
            type="submit"
            variant="secondary"
            pending={w.pending}
            {...(missing ? { disabledReason: t('privacy.record.fieldsFirst') } : {})}
          >
            {t('privacy.record.submit')}
          </Button>
        </div>
        {outcome?.ok ? (
          <StateView kind="success" title={t('privacy.record.done', { reference: outcome.reference })} />
        ) : null}
        {outcome && !outcome.ok ? (
          <StateView kind="error" title={t('privacy.change.refused')} reasons={outcome.reasons} />
        ) : null}
      </form>
      <ReauthForm t={t} w={w} />
    </details>
  )
}

export function privacyQuery(state: string, cursor?: string): string {
  const q = new URLSearchParams()
  if (state) q.set('state', state)
  if (cursor) q.set('cursor', cursor)
  const s = q.toString()
  return s ? `/staff/privacy-requests?${s}` : '/staff/privacy-requests'
}

function reasons(t: T, error: ApiErrorBody): string[] {
  const out = error.fieldErrors.map((f) => codeLabel(t, 'privacyProblem', f.code))
  return out.length ? out : [codeLabel(t, 'privacyProblem', error.code)]
}

function ItemLine({ t, locale, i }: { t: T; locale: StaffLocale; i: PlanItem }) {
  const day = new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium' })
  return (
    <li className="staff-privacy__item">
      <StatusBadge tone={DISPOSITION_TONE[i.disposition as keyof typeof DISPOSITION_TONE] ?? 'neutral'}>
        {codeLabel(t, 'privacyDisposition', i.disposition)}
      </StatusBadge>{' '}
      {t('privacy.plan.item', { category: codeLabel(t, 'privacyCategory', i.category), n: i.count })}
      {i.reason ? ` · ${codeLabel(t, 'privacyReason', i.reason)}` : ''}
      {i.years !== null ? ` · ${t('privacy.plan.years', { years: i.years })}` : ''}
      {i.reviewAt ? ` · ${t('privacy.plan.until', { date: day.format(new Date(i.reviewAt)) })}` : ''}
    </li>
  )
}

function Detail({
  t,
  locale,
  id,
  fetchImpl,
  onSession,
  onChanged,
}: {
  t: T
  locale: StaffLocale
  id: string
  fetchImpl: Fetch
  onSession?: (s: { csrfToken: string }) => void
  onChanged: () => void
}) {
  const ids = useId()
  const [d, setD] = useState<PrivacyRequestDetail | null | 'error'>(null)
  const [decision, setDecision] = useState<'complete' | 'decline'>('complete')
  const [reason, setReason] = useState('')
  const [closeAccess, setCloseAccess] = useState(true)
  const [checked, setChecked] = useState<string[]>([])
  const [identityConfirmed, setIdentityConfirmed] = useState(false)
  const [refused, setRefused] = useState<string[]>([])
  const w = useOwnerWrite(fetchImpl, onSession)
  const load = useCallback(async () => {
    const r = await call<PrivacyRequestDetail>(fetchImpl, `/staff/privacy-requests/${id}`)
    setD(r.ok ? r.data : 'error')
  }, [fetchImpl, id])
  useEffect(() => {
    void load()
  }, [load])
  if (d === null) return <StateView kind="loading" title={t('common.loading')} />
  if (d === 'error') return <StateView kind="error" title={t('privacy.loadFailed')} />
  const time = new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' })
  const after = (r: { ok: true; data: PrivacyRequestDetail } | { ok: false; error: ApiErrorBody }) => {
    if (r.ok) {
      setD(r.data)
      setRefused([])
      onChanged()
      return
    }
    setRefused(reasons(t, r.error))
    void load()
  }
  const startReview = () =>
    void w.send<PrivacyRequestDetail>(`/staff/privacy-requests/${d.id}/review`, {}, after, {
      'if-match': `"${d.version}"`,
    })
  const deletion = d.kind === 'deletion' && decision === 'complete'
  const missing = deletion ? d.plan.confirm.filter((c) => !checked.includes(c)) : []
  // TSK-0152 (I1): an export or a deletion is completed once the Owner confirms the identity evidence.
  const confirmIdentity = decision === 'complete' && d.identity.risk === 'elevated'
  // TSK-0152 (I3): a correction is completed once a change or a correction entry is recorded.
  const noCorrection =
    decision === 'complete' &&
    d.kind === 'correction' &&
    (d.corrections?.changes.length ?? 0) + (d.corrections?.entries.length ?? 0) === 0
  const decide = () =>
    void w.send<PrivacyRequestDetail>(
      `/staff/privacy-requests/${d.id}/decision`,
      {
        decision,
        reason,
        ...(deletion ? { confirmedChecks: checked, closeAccess } : {}),
        ...(confirmIdentity ? { identityConfirmed } : {}),
      },
      after,
      { 'if-match': `"${d.version}"` },
    )
  const blockedReason = !reason.trim()
    ? t('privacy.decision.reasonFirst')
    : missing.length
      ? t('privacy.decision.checkFirst')
      : confirmIdentity && !identityConfirmed
        ? t('privacy.decision.identityFirst')
        : noCorrection
          ? t('privacy.decision.correctionFirst')
          : undefined
  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-title`} data-testid="privacy-detail">
      <h2 id={`${ids}-title`} className="hh-h3">
        {t('privacy.detail.title', { reference: d.reference, kind: codeLabel(t, 'privacyRequestKind', d.kind) })}
      </h2>
      <p>
        <StatusBadge tone={STATE_TONE[d.state]}>{codeLabel(t, 'privacyRequestState', d.state)}</StatusBadge>
      </p>
      <ul className="staff-queue__facts">
        <li>{t('privacy.detail.customer', { name: d.customer.name, project: d.project.reference })}</li>
        <li>
          {t('privacy.detail.contact', {
            name: d.contact.name,
            email: d.contact.email ?? '',
            phone: d.contact.phone ?? '',
          })}
        </li>
        {d.identity.method === 'staff_verified' ? (
          <li>
            {t('privacy.identity.owner', {
              check: codeLabel(t, 'privacyIdentityCheck', d.identity.check ?? ''),
              name: d.identity.recordedBy ?? '',
              time: time.format(new Date(d.identity.verifiedAt)),
            })}
          </li>
        ) : (
          <>
            <li>{t(d.account ? 'privacy.detail.fromAccount' : 'privacy.detail.fromLink')}</li>
            <li>{t('privacy.detail.identity')}</li>
          </>
        )}
        {d.identity.note ? <li>{t('privacy.identity.note', { note: d.identity.note })}</li> : null}
        <li>{t('privacy.identity.risk', { risk: codeLabel(t, 'privacyRisk', d.identity.risk) })}</li>
        {d.identity.confirmedAt ? (
          <li>
            {t('privacy.identity.confirmed', {
              name: d.identity.confirmedBy ?? '',
              time: time.format(new Date(d.identity.confirmedAt)),
            })}
          </li>
        ) : null}
        <li>{t('privacy.detail.submitted', { time: time.format(new Date(d.submittedAt)) })}</li>
      </ul>
      <h3 className="staff-queue__title">{t('privacy.dates.title')}</h3>
      <Alerts t={t} d={d.deadlines} />
      <Dates t={t} locale={locale} r={d} />
      {isOpen(d.state) && d.deadlines.state === 'CONFIGURED' ? (
        <>
          <DateChange t={t} d={d} kind="extension" fetchImpl={fetchImpl} onDone={() => void load()} />
          <DateChange t={t} d={d} kind="legal" fetchImpl={fetchImpl} onDone={() => void load()} />
        </>
      ) : null}
      {d.details ? (
        <>
          <h3 className="staff-queue__title">{t('privacy.detail.details')}</h3>
          <p className="staff-privacy__details">{d.details}</p>
        </>
      ) : null}
      <h3 id={`${ids}-plan`} className="staff-queue__title">
        {t('privacy.plan.title')}
      </h3>
      <p>{t('privacy.plan.intro')}</p>
      <ul aria-labelledby={`${ids}-plan`} className="staff-privacy__plan">
        {d.plan.items.map((i) => (
          <ItemLine key={`${i.category}-${i.disposition}-${i.reason ?? ''}`} t={t} locale={locale} i={i} />
        ))}
      </ul>
      <h3 id={`${ids}-checks`} className="staff-queue__title">
        {t('privacy.plan.checks')}
      </h3>
      <ul aria-labelledby={`${ids}-checks`}>
        {d.plan.checks.map((c) => (
          <li key={c.check}>
            {codeLabel(t, 'deletionCheck', c.check)}:{' '}
            {c.result === 'found' && c.count !== undefined
              ? t('retention.entry.found', { n: c.count })
              : codeLabel(t, 'retentionHoldResult', c.result)}
          </li>
        ))}
      </ul>
      {d.corrections ? (
        <Corrections
          t={t}
          locale={locale}
          d={d}
          corrections={d.corrections}
          fetchImpl={fetchImpl}
          onDone={(next) => setD(next)}
        />
      ) : null}
      {d.state === 'received' ? (
        <div className="hh-button-row">
          <Button pending={w.pending} onClick={startReview}>
            {t('privacy.review.start')}
          </Button>
        </div>
      ) : null}
      {d.state === 'under_review' ? (
        <form
          className="staff-privacy__decision"
          aria-label={t('privacy.decision.title')}
          onSubmit={(e) => {
            e.preventDefault()
            if (!blockedReason) decide()
          }}
        >
          <fieldset>
            <legend>{t('privacy.decision.title')}</legend>
            <label>
              <input
                type="radio"
                name={`${ids}-decision`}
                checked={decision === 'complete'}
                onChange={() => setDecision('complete')}
              />{' '}
              {t(COMPLETE_LABEL[d.kind])}
            </label>
            <label>
              <input
                type="radio"
                name={`${ids}-decision`}
                checked={decision === 'decline'}
                onChange={() => setDecision('decline')}
              />{' '}
              {t('privacy.decision.decline')}
            </label>
          </fieldset>
          {deletion ? (
            <>
              <p>
                {t('privacy.decision.deletes', {
                  estimates: d.plan.deletable.estimates.length,
                  accounts: d.plan.deletable.accountIds.length,
                })}
              </p>
              <label className="staff-retention__check">
                <input type="checkbox" checked={closeAccess} onChange={(e) => setCloseAccess(e.target.checked)} />{' '}
                {t('privacy.decision.closeAccess')}
              </label>
              <fieldset className="staff-retention__checks">
                <legend>{t('retention.delete.confirmChecks')}</legend>
                {d.plan.confirm.map((c) => (
                  <label key={c} className="staff-retention__check">
                    <input
                      type="checkbox"
                      checked={checked.includes(c)}
                      onChange={(e) =>
                        setChecked((cur) => (e.target.checked ? [...cur, c] : cur.filter((x) => x !== c)))
                      }
                    />{' '}
                    {t('retention.delete.checked', { check: codeLabel(t, 'deletionCheck', c) })}
                  </label>
                ))}
              </fieldset>
            </>
          ) : null}
          {confirmIdentity ? (
            <label className="staff-retention__check">
              <input
                type="checkbox"
                checked={identityConfirmed}
                onChange={(e) => setIdentityConfirmed(e.target.checked)}
              />{' '}
              {t('privacy.decision.identityConfirmed')}
            </label>
          ) : null}
          <Field
            label={t('privacy.decision.reason')}
            multiline
            name="reason"
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="hh-button-row">
            <Button
              type="submit"
              variant={deletion ? 'danger' : 'primary'}
              pending={w.pending}
              {...(blockedReason ? { disabledReason: blockedReason } : {})}
            >
              {t('privacy.decision.submit')}
            </Button>
          </div>
        </form>
      ) : null}
      {d.outcome ? (
        <section aria-labelledby={`${ids}-outcome`}>
          <h3 id={`${ids}-outcome`} className="staff-queue__title">
            {t('privacy.outcome.title')}
          </h3>
          {d.outcome.deleted.length ? (
            <ul>
              {d.outcome.deleted.map((x) => (
                <li key={x.category}>
                  {t('privacy.outcome.deleted', { category: codeLabel(t, 'privacyCategory', x.category), n: x.count })}
                </li>
              ))}
            </ul>
          ) : null}
          {d.outcome.retained.length ? (
            <ul aria-label={t('privacy.outcome.retained')}>
              {d.outcome.retained.map((i) => (
                <ItemLine key={`${i.category}-${i.reason ?? ''}`} t={t} locale={locale} i={i} />
              ))}
            </ul>
          ) : null}
          {d.outcome.accessClosed ? <p>{t('privacy.outcome.accessClosed')}</p> : null}
          {d.outcome.exportReady ? <p>{t('privacy.outcome.exportReady')}</p> : null}
          <p>{t('privacy.outcome.notice')}</p>
        </section>
      ) : null}
      <ReauthForm t={t} w={w} />
      {refused.length ? <StateView kind="error" title={t('privacy.decision.refused')} reasons={refused} /> : null}
    </section>
  )
}

export function PrivacyScreen({
  t,
  locale,
  fetchImpl,
  href,
  requestId,
  onSession,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  /** TSK-0149: the link to help with customer access below this screen. */
  href?: (path: string) => string
  /** TSK-0136: one request, opened from its Owner Decisions item. */
  requestId?: string
  onSession?: (s: { csrfToken: string }) => void
}) {
  const ids = useId()
  const [state, setState] = useState('')
  const [draft, setDraft] = useState('')
  const [items, setItems] = useState<PrivacyRequestItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [open, setOpen] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let live = true
    setStatus('loading')
    void call<{ items: PrivacyRequestItem[]; nextCursor: string | null }>(fetchImpl, privacyQuery(state)).then((r) => {
      if (!live) return
      if (!r.ok) return setStatus('error')
      setItems(r.data.items)
      setCursor(r.data.nextCursor)
      setStatus('ready')
    })
    return () => {
      live = false
    }
  }, [fetchImpl, state, reload])
  async function more() {
    if (!cursor) return
    const r = await call<{ items: PrivacyRequestItem[]; nextCursor: string | null }>(
      fetchImpl,
      privacyQuery(state, cursor),
    )
    if (!r.ok) return setStatus('error')
    setItems((cur) => [...cur, ...r.data.items])
    setCursor(r.data.nextCursor)
  }
  const time = new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' })
  if (requestId)
    return (
      <section className="staff-screen staff-privacy" aria-labelledby="staff-screen-title">
        <h1 id="staff-screen-title" className="hh-h3">
          {t('nav.privacy')}
        </h1>
        {href ? (
          <p>
            <a href={href('/privacy')}>{t('privacy.backToList')}</a>
          </p>
        ) : null}
        <Detail
          t={t}
          locale={locale}
          id={requestId}
          fetchImpl={fetchImpl}
          {...(onSession ? { onSession } : {})}
          onChanged={() => setReload((n) => n + 1)}
        />
      </section>
    )
  return (
    <section className="staff-screen staff-privacy" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('nav.privacy')}
      </h1>
      <p>{t('privacy.intro')}</p>
      {href ? (
        <p>
          <a href={href('/access-help')}>{t('privacy.accessHelp')}</a>
        </p>
      ) : null}
      <RecordRequest
        t={t}
        fetchImpl={fetchImpl}
        {...(onSession ? { onSession } : {})}
        onRecorded={() => setReload((n) => n + 1)}
      />
      <form
        className="staff-queue__filters"
        aria-label={t('privacy.filter')}
        onSubmit={(e) => {
          e.preventDefault()
          setState(draft)
        }}
      >
        <div className="staff-queue__select">
          <label htmlFor={`${ids}-state`}>{t('privacy.state')}</label>
          <select id={`${ids}-state`} value={draft} onChange={(e) => setDraft(e.target.value)}>
            <option value="">{t('privacy.anyState')}</option>
            {(['received', 'under_review', 'completed', 'partially_completed', 'declined'] as const).map((s) => (
              <option key={s} value={s}>
                {codeLabel(t, 'privacyRequestState', s)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary">
          {t('privacy.apply')}
        </Button>
      </form>
      {status === 'loading' ? (
        <StateView kind="loading" title={t('common.loading')} />
      ) : status === 'error' ? (
        <StateView kind="error" title={t('privacy.loadFailed')} />
      ) : items.length === 0 ? (
        <StateView kind="empty" title={t('privacy.empty')} />
      ) : (
        <ol className="staff-queue__items" aria-label={t('privacy.list')}>
          {items.map((r) => (
            <li key={r.id} className="staff-queue__item" aria-labelledby={`${ids}-${r.id}`}>
              <div className="staff-queue__head">
                <h2 id={`${ids}-${r.id}`} className="staff-queue__title">
                  {t('privacy.detail.title', {
                    reference: r.reference,
                    kind: codeLabel(t, 'privacyRequestKind', r.kind),
                  })}
                </h2>
                <StatusBadge tone={STATE_TONE[r.state]}>{codeLabel(t, 'privacyRequestState', r.state)}</StatusBadge>
              </div>
              <ul className="staff-queue__facts">
                <li>{t('privacy.detail.customer', { name: r.customer.name, project: r.project.reference })}</li>
                <li>{t('privacy.detail.submitted', { time: time.format(new Date(r.submittedAt)) })}</li>
                {isOpen(r.state) && r.deadlines.acknowledgmentDueOn && !r.deadlines.substantiveAcknowledgedAt ? (
                  <li>{t('privacy.dates.ackDue', { date: dayText(locale, r.deadlines.acknowledgmentDueOn) })}</li>
                ) : null}
                {isOpen(r.state) && r.deadlines.targetOn ? (
                  <li>{t('privacy.dates.target', { date: dayText(locale, r.deadlines.targetOn) })}</li>
                ) : null}
              </ul>
              <Alerts t={t} d={r.deadlines} />
              <Button variant="secondary" onClick={() => setOpen(open === r.id ? null : r.id)}>
                {t(open === r.id ? 'privacy.close' : 'privacy.open')}
              </Button>
              {open === r.id ? (
                <Detail
                  t={t}
                  locale={locale}
                  id={r.id}
                  fetchImpl={fetchImpl}
                  {...(onSession ? { onSession } : {})}
                  onChanged={() => setReload((n) => n + 1)}
                />
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {cursor && status === 'ready' ? (
        <Button variant="secondary" onClick={() => void more()}>
          {t('queue.loadMore')}
        </Button>
      ) : null}
    </section>
  )
}
