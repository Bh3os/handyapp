// The Start Work briefing and gate, and the Owner's review of a job's holds and exceptions (TSK-0073, TSK-0074;
// HH-WORK-01, HH-WORK-02, HH-WORK-03, HH-WORK-04, HH-WORK-12, HH-OFF-04, T40, T45, T46, OWN-DEC-68, OWN-DEC-137,
// OWN-DEC-172, OWN-DEC-208, RULE-SAFETY-GATES).
// - Call 911 comes first on the briefing, before anything loads and before every other control: a plain phone link,
//   never behind a confirmation, the gate or the network (owner amendment: nothing is ever put in front of an
//   emergency call).
// - The briefing shows only what the server evaluated: every prerequisite with its missing items and who resolves
//   them. The worker records the site check, uploads before photos and requests one of the three exceptions here;
//   Start Work is one button, enabled only when the server answered `ready` and the device is online, and the server
//   checks everything again when it is pressed. A refusal reloads the gate and names what is missing. Nothing here
//   clears a hold, and there is no override.
// - The review page (Owner, Office): job-level Hold / Ready notes (Office sets a Hold; the Owner sets Ready with a
//   note), critical safety holds (the Owner reviews and releases with evidence and a qualified reviewer, never one
//   they raised) and, for the Owner, the exceptions with their evidence, follow-up and decision.
// - TSK-0094 (HH-INC-03): after a pause by Stop Work / Report Hazard, the same briefing evaluates resuming for a worker
//   who started before it: the same prerequisites again (a site check after the pause, the packet version the hold's
//   release made, reviewed personally), and Resume work instead of Start Work. The screen says that releasing a hold in
//   the app is never a certification that the site is safe. A return visit's screen lists the worker's return-visit
//   punch items (HH-QA-08).
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { centsFromDecimal } from '@handyhub/money'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { call, idempotencyKey, setCsrfToken, upload, type ApiErrorBody, type Fetch } from './api'
import { ReauthForm, useOwnerWrite } from './OwnerWrite'
import { codeLabel } from './Requests'
import { ReturnWorkItems } from './ReturnWork'
import { EmergencyCall, holdNoteText, JobSafety } from './StopWork'
import { useOnline } from './Shell'

// TSK-0077: Call 911 lives with Stop Work (StopWork.tsx); the briefing still shows it first.
export { EmergencyCall }

type T = (key: StaffKey, values?: Record<string, string | number>) => string
type StaffRef = { id: string; name: string | null }
type Missing = {
  code: string
  ref: string | null
  severity: 'attention' | 'review' | 'blocked'
  resolutionOwner: 'worker' | 'owner' | 'office'
  exceptable: string | null
  exceptionId: string | null
}
export type StartGateView = {
  visitId: string
  visitNumber: number
  visitState: string
  /** TSK-0094: a return visit (return_work) starts without moving the job. */
  visitPurpose?: string
  /** TSK-0094: Start Work, or resuming after the job's latest pause. */
  mode?: 'start' | 'resume'
  pausedAt?: string | null
  jobId: string | null
  projectReference: string
  checkedAt: string
  outcome: 'ready' | 'needs_attention' | 'requires_review' | 'blocked'
  items: { item: string; state: 'met' | 'missing' | 'excepted'; missing: Missing[] }[]
  packet: { version: number; contentSha256: string } | null
  workPackages: { workPackageId: string; serviceCode: string; beforePhotos: number }[]
  siteCheck: { siteCondition: string; recordedAt: string } | null
  exceptions: { id: string; kind: string; state: string; ending: string | null; requestedAt: string }[]
  started: { startId: string; startedAt: string } | null
  emergency: { call911: string }
  actions: {
    start: boolean
    resume?: boolean
    recordSiteCheck: boolean
    uploadBeforePhotos: boolean
    requestException: string[]
  }
}

const OUTCOME_TONE = {
  ready: 'success',
  needs_attention: 'warning',
  requires_review: 'info',
  blocked: 'danger',
} as const
const ITEM_TONE = { met: 'success', excepted: 'info', missing: 'danger' } as const
const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')
const when = (iso: string, locale: StaffLocale) =>
  new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
const online = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)

function codesText(t: T, e: ApiErrorBody): string {
  return e.fieldErrors.length
    ? e.fieldErrors.map((f) => codeLabel(t, 'startGateCode', f.code)).join(' ')
    : codeLabel(t, 'startGateCode', e.code)
}

function SiteCheckForm({
  t,
  fetchImpl,
  visitId,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  visitId: string
  onDone: () => void
}) {
  const key = useRef<string | null>(null)
  const [answers, setAnswers] = useState({
    propertyConfirmed: false,
    accessAvailable: false,
    customerPresent: false,
    hazardsReviewed: false,
  })
  const [condition, setCondition] = useState<'as_described' | 'differs'>('as_described')
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    key.current ??= idempotencyKey()
    const r = await call(fetchImpl, `/staff/visits/${encodeURIComponent(visitId)}/site-checks`, {
      method: 'POST',
      body: { ...answers, siteCondition: condition, ...(note.trim() ? { note: note.trim() } : {}) },
      headers: { 'idempotency-key': key.current },
    })
    setPending(false)
    key.current = null
    if (!r.ok) return setError(codesText(t, r.error))
    setError(null)
    onDone()
  }
  const box = (k: keyof typeof answers, label: StaffKey) => (
    <label className="staff-loadout__choice">
      <input
        type="checkbox"
        name={k}
        checked={answers[k]}
        onChange={(e) => setAnswers({ ...answers, [k]: e.target.checked })}
      />
      {t(label)}
    </label>
  )
  return (
    <form className="staff-loadout__form" onSubmit={(e) => void submit(e)} aria-label={t('start.siteCheck.title')}>
      <fieldset>
        <legend>{t('start.siteCheck.title')}</legend>
        <p className="staff-request__hint">{t('start.siteCheck.hint')}</p>
        {box('propertyConfirmed', 'start.siteCheck.property')}
        {box('accessAvailable', 'start.siteCheck.access')}
        {box('customerPresent', 'start.siteCheck.customer')}
        {box('hazardsReviewed', 'start.siteCheck.hazards')}
      </fieldset>
      <fieldset>
        <legend>{t('start.siteCheck.condition')}</legend>
        {(['as_described', 'differs'] as const).map((c) => (
          <label key={c} className="staff-loadout__choice">
            <input type="radio" name="siteCondition" checked={condition === c} onChange={() => setCondition(c)} />
            {t(c === 'as_described' ? 'start.siteCheck.asDescribed' : 'start.siteCheck.differs')}
          </label>
        ))}
      </fieldset>
      {condition === 'differs' ? (
        <Field
          label={t('start.siteCheck.note')}
          name="siteNote"
          multiline
          required
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      ) : null}
      {error ? (
        <p role="alert" className="hh-field__error">
          {error}
        </p>
      ) : null}
      <Button type="submit" pending={pending}>
        {t('start.siteCheck.submit')}
      </Button>
    </form>
  )
}

function PhotoUpload({
  t,
  fetchImpl,
  visitId,
  pkg,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  visitId: string
  pkg: StartGateView['workPackages'][number]
  onDone: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function chosen(file: File | undefined) {
    if (!file) return
    setPending(true)
    const r = await upload(
      fetchImpl,
      `/staff/visits/${encodeURIComponent(visitId)}/before-photos?workPackageId=${encodeURIComponent(pkg.workPackageId)}`,
      file,
      file.type || 'application/octet-stream',
    )
    setPending(false)
    if (!r.ok) return setError(t('start.photos.failed'))
    setError(null)
    onDone()
  }
  const id = `before-photo-${pkg.workPackageId}`
  return (
    <li data-testid="start-photo-package">
      <label htmlFor={id}>{t('start.photos.package', { service: pkg.serviceCode, n: pkg.beforePhotos })}</label>{' '}
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        disabled={pending}
        onChange={(e) => void chosen(e.target.files?.[0])}
      />
      {error ? (
        <p role="alert" className="hh-field__error">
          {error}
        </p>
      ) : null}
    </li>
  )
}

function ExceptionRequest({
  t,
  fetchImpl,
  gate,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  gate: StartGateView
  onDone: () => void
}) {
  const kinds = gate.actions.requestException
  const key = useRef<string | null>(null)
  const [kind, setKind] = useState(kinds[0] ?? '')
  const [reason, setReason] = useState('')
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [count, setCount] = useState('1')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (kinds.length === 0) return null
  const missingPackages = gate.items
    .flatMap((i) => i.missing)
    .filter((m) => m.code === 'BEFORE_PHOTOS_MISSING' && m.ref && !m.exceptionId)
    .map((m) => m.ref as string)
  async function submit(e: FormEvent) {
    e.preventDefault()
    let amountCents = 0
    if (kind === 'deposit_bookkeeping_pending') {
      try {
        amountCents = centsFromDecimal(b.trim())
      } catch {
        return setError(t('start.exception.amountInvalid'))
      }
    }
    const evidence =
      kind === 'customer_not_present'
        ? { authorization: a, contact: b }
        : kind === 'before_photo_upload_failed'
          ? { workPackageIds: missingPackages, photosOnDevice: Number(count), failure: a }
          : { provider: 'square', transactionReference: a, amountCents }
    setPending(true)
    key.current ??= idempotencyKey()
    const r = await call(fetchImpl, `/staff/visits/${encodeURIComponent(gate.visitId)}/start-exceptions`, {
      method: 'POST',
      body: { kind, reason, evidence },
      headers: { 'idempotency-key': key.current },
    })
    setPending(false)
    key.current = null
    if (!r.ok)
      return setError(
        r.error.fieldErrors.map((f) => codeLabel(t, 'gateExceptionProblem', f.code)).join(' ') ||
          t('start.exception.failed'),
      )
    setError(null)
    setReason('')
    setA('')
    setB('')
    onDone()
  }
  return (
    <form className="staff-loadout__form" onSubmit={(e) => void submit(e)} aria-label={t('start.exception.title')}>
      <h2 className="staff-myday__sub">{t('start.exception.title')}</h2>
      <p className="staff-request__hint">{t('start.exception.hint')}</p>
      <fieldset>
        <legend>{t('start.exception.kind')}</legend>
        {kinds.map((k) => (
          <label key={k} className="staff-loadout__choice">
            <input type="radio" name="exceptionKind" checked={kind === k} onChange={() => setKind(k)} />
            {codeLabel(t, 'gateExceptionKind', k)}
          </label>
        ))}
      </fieldset>
      <Field
        label={t('start.exception.reason')}
        name="reason"
        multiline
        required
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {kind === 'customer_not_present' ? (
        <>
          <Field
            label={t('start.exception.authorization')}
            name="authorization"
            multiline
            required
            value={a}
            onChange={(e) => setA(e.target.value)}
          />
          <Field
            label={t('start.exception.contact')}
            name="contact"
            required
            value={b}
            onChange={(e) => setB(e.target.value)}
          />
        </>
      ) : kind === 'before_photo_upload_failed' ? (
        <>
          <Field
            label={t('start.exception.photosOnDevice')}
            name="photosOnDevice"
            inputMode="numeric"
            required
            value={count}
            onChange={(e) => setCount(e.target.value)}
          />
          <Field
            label={t('start.exception.failure')}
            name="failure"
            multiline
            required
            value={a}
            onChange={(e) => setA(e.target.value)}
          />
        </>
      ) : (
        <>
          <Field
            label={t('start.exception.reference')}
            name="transactionReference"
            required
            value={a}
            onChange={(e) => setA(e.target.value)}
          />
          <Field
            label={t('start.exception.amount')}
            name="amount"
            inputMode="decimal"
            required
            value={b}
            onChange={(e) => setB(e.target.value)}
          />
        </>
      )}
      {error ? (
        <p role="alert" className="hh-field__error">
          {error}
        </p>
      ) : null}
      <Button type="submit" pending={pending}>
        {t('start.exception.submit')}
      </Button>
    </form>
  )
}

export function StartWorkPage({
  t,
  locale,
  fetchImpl,
  visitId,
  href,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  visitId: string
  href: (to: string) => string
}) {
  const [gate, setGate] = useState<StartGateView | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable' | 'offline'>('loading')
  const [refusal, setRefusal] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [isOnline, setOnline] = useState(online())
  const key = useRef<string | null>(null)
  const load = useCallback(async () => {
    const r = await call<StartGateView>(fetchImpl, `/staff/visits/${encodeURIComponent(visitId)}/start-gate`)
    // TSK-0079 (HH-OFF-04): without a connection there is no gate to read and no start: said so, never assumed.
    if (!r.ok) return setState(r.status === 0 ? 'offline' : 'unavailable')
    setGate(r.data)
    setState('ready')
  }, [fetchImpl, visitId])
  useEffect(() => {
    void load()
    const up = () => setOnline(online())
    window.addEventListener('online', up)
    window.addEventListener('offline', up)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', up)
    }
  }, [load])

  const resuming = gate?.mode === 'resume'
  async function startWork() {
    if (!gate?.packet) return
    setPending(true)
    key.current ??= idempotencyKey()
    const r = await call(fetchImpl, `/staff/visits/${encodeURIComponent(visitId)}/${resuming ? 'resume' : 'start'}`, {
      method: 'POST',
      body: { packetVersion: gate.packet.version },
      headers: { 'idempotency-key': key.current },
    })
    setPending(false)
    key.current = null
    setRefusal(r.ok ? null : r.error.code === 'CONFLICT' ? t('start.refused') : t('start.failed'))
    await load()
  }

  return (
    <main className="staff-start" aria-labelledby="start-title">
      {/* TSK-0129: Call 911 first, then Call Owner; the taps are recorded on the job once the gate names it. */}
      <EmergencyCall t={t} fetchImpl={fetchImpl} jobId={gate?.jobId ?? null} visitId={visitId} />
      {gate?.jobId ? (
        // TSK-0077: Stop Work / Report Hazard, right after Call 911 and before the gate (never behind it).
        <JobSafety
          t={t}
          locale={locale}
          fetchImpl={fetchImpl}
          jobId={gate.jobId}
          visitId={gate.visitId}
          call911={false}
        />
      ) : null}
      <h1 id="start-title">
        {gate
          ? t('start.title', { reference: gate.projectReference, number: gate.visitNumber })
          : t('start.titleLoading')}
      </h1>
      {state === 'loading' ? <StateView kind="loading" title={t('start.loading')} /> : null}
      {state === 'unavailable' ? <StateView kind="error" title={t('start.unavailable')} /> : null}
      {state === 'offline' ? (
        <div data-testid="start-offline">
          <StateView kind="offline" title={t('start.offline')} />
        </div>
      ) : null}
      {gate ? (
        <>
          <p>
            <StatusBadge tone={OUTCOME_TONE[gate.outcome]}>
              <span data-testid="start-outcome">{codeLabel(t, 'startGateOutcome', gate.outcome)}</span>
            </StatusBadge>{' '}
            <span className="staff-request__hint">{t('start.checkedAt', { time: when(gate.checkedAt, locale) })}</span>
          </p>
          {gate.started && !resuming ? (
            <StateView kind="empty" title={t('start.started', { time: when(gate.started.startedAt, locale) })} />
          ) : null}
          <ol className="staff-start__items" data-testid="start-items">
            {gate.items.map((i) => (
              <li key={i.item} data-item={i.item} data-state={i.state}>
                <StatusBadge tone={ITEM_TONE[i.state]}>{codeLabel(t, 'startItemState', i.state)}</StatusBadge>{' '}
                {codeLabel(t, 'startGateItem', i.item)}
                {i.missing.length ? (
                  <ul>
                    {i.missing.map((m, n) => (
                      <li key={`${m.code}-${m.ref ?? n}`} data-code={m.code}>
                        {codeLabel(t, 'startGateCode', m.code)}{' '}
                        <span className="staff-request__hint">
                          {m.exceptionId
                            ? t('start.coveredByException')
                            : t('start.resolvedBy', { who: codeLabel(t, 'resolutionOwner', m.resolutionOwner) })}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
          {gate.jobId ? (
            <p>
              <a href={href(`/packets/${gate.jobId}`)}>{t('myday.openPacket')}</a>
              {' · '}
              <a href={href(`/loadouts/${gate.jobId}`)}>{t('myday.openLoadout')}</a>
              {' · '}
              <a href={href(`/job-photos/${gate.jobId}`)}>{t('myday.openPhotos')}</a>
            </p>
          ) : null}
          {gate.actions.recordSiteCheck ? (
            <SiteCheckForm t={t} fetchImpl={fetchImpl} visitId={gate.visitId} onDone={() => void load()} />
          ) : null}
          {gate.actions.uploadBeforePhotos && gate.workPackages.length ? (
            <section aria-labelledby="start-photos">
              <h2 id="start-photos" className="staff-myday__sub">
                {t('start.photos.title')}
              </h2>
              <ul>
                {gate.workPackages.map((p) => (
                  <PhotoUpload
                    key={p.workPackageId}
                    t={t}
                    fetchImpl={fetchImpl}
                    visitId={gate.visitId}
                    pkg={p}
                    onDone={() => void load()}
                  />
                ))}
              </ul>
            </section>
          ) : null}
          {gate.exceptions.length ? (
            <section aria-labelledby="start-exceptions">
              <h2 id="start-exceptions" className="staff-myday__sub">
                {t('start.exceptions')}
              </h2>
              <ul data-testid="start-exception-list">
                {gate.exceptions.map((e) => (
                  <li key={e.id}>
                    {codeLabel(t, 'gateExceptionKind', e.kind)}: {codeLabel(t, 'gateExceptionState', e.state)}
                    {e.ending ? ` (${codeLabel(t, 'gateExceptionEnding', e.ending)})` : ''}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <ExceptionRequest key={gate.checkedAt} t={t} fetchImpl={fetchImpl} gate={gate} onDone={() => void load()} />
          {resuming ? (
            // TSK-0094: resuming after a pause, through the same gate again (HH-INC-03).
            <div className="staff-myday__actions" data-testid="start-resume">
              <p>{t('start.resume.explain', { time: gate.pausedAt ? when(gate.pausedAt, locale) : '' })}</p>
              <Button
                className="staff-myday__action"
                {...(!isOnline
                  ? { disabledReason: t('start.offline') }
                  : !gate.actions.resume
                    ? { disabledReason: t('start.notReady') }
                    : {})}
                pending={pending}
                onClick={() => void startWork()}
              >
                {t('start.resume.submit')}
              </Button>
              <p className="staff-request__hint">{t('start.resume.notCertification')}</p>
            </div>
          ) : !gate.started ? (
            <div className="staff-myday__actions">
              <Button
                className="staff-myday__action"
                {...(!isOnline
                  ? { disabledReason: t('start.offline') }
                  : !gate.actions.start
                    ? { disabledReason: t('start.notReady') }
                    : {})}
                pending={pending}
                onClick={() => void startWork()}
              >
                {t('start.submit')}
              </Button>
              <p className="staff-request__hint">{t('start.note')}</p>
            </div>
          ) : null}
          {gate.jobId && gate.visitPurpose === 'return_work' ? (
            <ReturnWorkItems key={gate.checkedAt} t={t} fetchImpl={fetchImpl} jobId={gate.jobId} />
          ) : null}
          {refusal ? (
            <p role="alert" className="hh-field__error" data-testid="start-refusal">
              {refusal}
            </p>
          ) : null}
        </>
      ) : null}
    </main>
  )
}

// --- The Owner's review ----------------------------------------------------------------------------------------------

type ReviewHold = {
  holdId: string
  kind: 'review' | 'job_requirement' | 'critical_safety'
  category: string
  source: string
  state: string
  version: number
  note: string
  raisedBy: StaffRef
  raisedAt: string
  resolutionNote: string | null
  actions: { setReady: boolean; startReview: boolean; resolve: boolean; cancel: boolean }
}
type ReviewException = {
  id: string
  visitNumber: number
  kind: string
  state: string
  ending: string | null
  reason: string
  evidence: Record<string, unknown>
  requestedBy: StaffRef
  requestedAt: string
  followUpOwner: StaffRef | null
  followUpDue: string | null
  followUp: 'none' | 'open' | 'resolved'
  version: number
  actions: { approve: boolean; decline: boolean }
}
export type StartReviewView = {
  jobId: string
  projectReference: string
  jobState: string
  holds: ReviewHold[]
  exceptions: ReviewException[]
  followUpOwners: StaffRef[]
  actions: { setHold: boolean }
}

function HoldActions({ t, fetchImpl, hold, onDone }: { t: T; fetchImpl: Fetch; hold: ReviewHold; onDone: () => void }) {
  // TSK-0079 (HH-OFF-04): this action needs the server; offline it is refused, never queued.
  const connected = useOnline()
  const w = useOwnerWrite(fetchImpl, (s) => setCsrfToken(s.csrfToken))
  const [note, setNote] = useState('')
  const [evidence, setEvidence] = useState('')
  const [reviewer, setReviewer] = useState('')
  const [qualification, setQualification] = useState('')
  const [error, setError] = useState<string | null>(null)
  const send = (path: string, body: unknown) =>
    w.send(
      path,
      body,
      (r) => {
        if (!r.ok)
          return setError(
            r.error.fieldErrors.map((f) => codeLabel(t, 'gateExceptionProblem', f.code)).join(' ') ||
              t('start.review.failed'),
          )
        setError(null)
        onDone()
      },
      { 'if-match': `"${hold.version}"` },
    )
  const id = encodeURIComponent(hold.holdId)
  return (
    <div className="staff-loadout__block-actions">
      <ReauthForm t={t} w={w} />
      {error ? <StateView kind="error" title={error} /> : null}
      {hold.actions.setReady ? (
        <form
          onSubmit={(e) => (
            e.preventDefault(),
            void send(`/staff/job-holds/${id}/actions/set-ready`, { resolutionNote: note })
          )}
        >
          <Field
            label={t('start.review.readyNote')}
            name="readyNote"
            multiline
            required
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            type="submit"
            pending={w.pending}
            {...(!connected ? { disabledReason: t('offline.needsConnection') } : {})}
          >
            {t('start.review.setReady')}
          </Button>
        </form>
      ) : null}
      {hold.actions.startReview ? (
        <Button
          variant="secondary"
          pending={w.pending}
          onClick={() => void send(`/staff/critical-holds/${id}/actions/start-review`, {})}
        >
          {t('start.review.startReview')}
        </Button>
      ) : null}
      {hold.actions.resolve ? (
        <form
          onSubmit={(e) => (
            e.preventDefault(),
            void send(`/staff/critical-holds/${id}/actions/resolve`, {
              resolutionNote: note,
              evidence,
              reviewer,
              reviewerQualification: qualification,
            })
          )}
        >
          <Field
            label={t('start.review.resolutionNote')}
            name="resolutionNote"
            multiline
            required
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Field
            label={t('start.review.evidence')}
            name="evidence"
            multiline
            required
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
          />
          <Field
            label={t('start.review.reviewer')}
            name="reviewer"
            required
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
          />
          <Field
            label={t('start.review.qualification')}
            name="qualification"
            required
            value={qualification}
            onChange={(e) => setQualification(e.target.value)}
          />
          <Button type="submit" pending={w.pending}>
            {t('start.review.release')}
          </Button>
        </form>
      ) : null}
    </div>
  )
}

function ExceptionDecision({
  t,
  fetchImpl,
  e,
  owners,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  e: ReviewException
  owners: StaffRef[]
  onDone: () => void
}) {
  const w = useOwnerWrite(fetchImpl, (s) => setCsrfToken(s.csrfToken))
  const [owner, setOwner] = useState(owners[0]?.id ?? '')
  const [due, setDue] = useState('')
  const [verified, setVerified] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const send = (action: 'approve' | 'decline', body: unknown) =>
    w.send(
      `/staff/start-exceptions/${encodeURIComponent(e.id)}/actions/${action}`,
      body,
      (r) => {
        if (!r.ok)
          return setError(
            r.error.fieldErrors.map((f) => codeLabel(t, 'gateExceptionProblem', f.code)).join(' ') ||
              t('start.review.failed'),
          )
        setError(null)
        onDone()
      },
      { 'if-match': `"${e.version}"` },
    )
  if (!e.actions.approve && !e.actions.decline) return null
  return (
    <div className="staff-loadout__block-actions">
      <ReauthForm t={t} w={w} />
      {error ? <StateView kind="error" title={error} /> : null}
      <form
        aria-label={t('start.review.approve')}
        onSubmit={(ev) => (
          ev.preventDefault(),
          void send('approve', {
            followUpOwnerId: owner,
            followUpDue: due,
            ...(e.kind === 'deposit_bookkeeping_pending' ? { providerVerified: verified } : {}),
          })
        )}
      >
        <label>
          {t('start.review.followUpOwner')}{' '}
          <select name="followUpOwner" value={owner} onChange={(ev) => setOwner(ev.target.value)}>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name ?? o.id}
              </option>
            ))}
          </select>
        </label>
        <Field
          label={t('start.review.followUpDue')}
          name="followUpDue"
          type="date"
          required
          value={due}
          onChange={(ev) => setDue(ev.target.value)}
        />
        {e.kind === 'deposit_bookkeeping_pending' ? (
          <label className="staff-loadout__choice">
            <input
              type="checkbox"
              name="providerVerified"
              checked={verified}
              onChange={(ev) => setVerified(ev.target.checked)}
            />
            {t('start.review.providerVerified')}
          </label>
        ) : null}
        <Button type="submit" pending={w.pending}>
          {t('start.review.approve')}
        </Button>
      </form>
      <form
        aria-label={t('start.review.decline')}
        onSubmit={(ev) => (ev.preventDefault(), void send('decline', { reason }))}
      >
        <Field
          label={t('start.review.declineReason')}
          name="declineReason"
          multiline
          required
          value={reason}
          onChange={(ev) => setReason(ev.target.value)}
        />
        <Button type="submit" variant="secondary" pending={w.pending}>
          {t('start.review.decline')}
        </Button>
      </form>
    </div>
  )
}

function SetHoldForm({ t, fetchImpl, jobId, onDone }: { t: T; fetchImpl: Fetch; jobId: string; onDone: () => void }) {
  const key = useRef<string | null>(null)
  const [category, setCategory] = useState('permit_licensing')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    key.current ??= idempotencyKey()
    const r = await call(fetchImpl, `/staff/jobs/${encodeURIComponent(jobId)}/job-holds`, {
      method: 'POST',
      body: { category, note },
      headers: { 'idempotency-key': key.current },
    })
    key.current = null
    if (!r.ok) return setError(t('start.review.failed'))
    setError(null)
    setNote('')
    onDone()
  }
  return (
    <form className="staff-loadout__form" onSubmit={(e) => void submit(e)} aria-label={t('start.review.setHold')}>
      <label>
        {t('start.review.category')}{' '}
        <select name="category" value={category} onChange={(e) => setCategory(e.target.value)}>
          {['permit_licensing', 'licensed_trade', 'structural', 'hazardous_material', 'site_condition', 'other'].map(
            (c) => (
              <option key={c} value={c}>
                {codeLabel(t, 'hazardCategory', c)}
              </option>
            ),
          )}
        </select>
      </label>
      <Field
        label={t('start.review.holdNote')}
        name="holdNote"
        multiline
        required
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error ? <StateView kind="error" title={error} /> : null}
      <Button type="submit">{t('start.review.setHold')}</Button>
    </form>
  )
}

export function StartReviewPage({
  t,
  locale,
  fetchImpl,
  jobId,
  href,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  jobId: string
  /** TSK-0076: links to the job's photos when given. */
  href?: (to: string) => string
}) {
  const [view, setView] = useState<StartReviewView | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading')
  const load = useCallback(async () => {
    const r = await call<StartReviewView>(fetchImpl, `/staff/jobs/${encodeURIComponent(jobId)}/start-review`)
    if (!r.ok) return setState('unavailable')
    setView(r.data)
    setState('ready')
  }, [fetchImpl, jobId])
  useEffect(() => void load(), [load])
  if (state === 'loading') return <StateView kind="loading" title={t('start.review.loading')} />
  if (state === 'unavailable' || !view) return <StateView kind="error" title={t('start.review.unavailable')} />
  return (
    <main className="staff-start" aria-labelledby="start-review-title">
      <h1 id="start-review-title">{t('start.review.title', { reference: view.projectReference })}</h1>
      {href ? (
        <p>
          <a href={href(`/job-photos/${view.jobId}`)}>{t('myday.openPhotos')}</a>
        </p>
      ) : null}
      <h2 className="staff-myday__sub">{t('start.review.holds')}</h2>
      {view.holds.length === 0 ? <p>{t('start.review.noHolds')}</p> : null}
      <ul data-testid="start-review-holds">
        {view.holds.map((h) => (
          <li key={h.holdId} data-kind={h.kind} data-state={h.state}>
            <strong>{codeLabel(t, 'holdKind', h.kind)}</strong> · {codeLabel(t, 'hazardCategory', h.category)} ·{' '}
            {codeLabel(t, 'holdState', h.state)}
            <p>{holdNoteText(t, h.note)}</p>
            <p className="staff-request__hint">
              {t('start.review.raised', { who: h.raisedBy.name ?? '', time: when(h.raisedAt, locale) })}
            </p>
            {h.resolutionNote ? <p>{h.resolutionNote}</p> : null}
            <HoldActions t={t} fetchImpl={fetchImpl} hold={h} onDone={() => void load()} />
          </li>
        ))}
      </ul>
      {/* TSK-0077: the job's Stop Work, hazard and issue reports (restricted details as the server allows), the
          Owner's review and the work-paused notice; Stop Work stays available here too. */}
      <JobSafety t={t} locale={locale} fetchImpl={fetchImpl} jobId={view.jobId} />
      {view.actions.setHold ? (
        <SetHoldForm t={t} fetchImpl={fetchImpl} jobId={view.jobId} onDone={() => void load()} />
      ) : null}
      {view.exceptions.length ? (
        <>
          <h2 className="staff-myday__sub">{t('start.exceptions')}</h2>
          <ul data-testid="start-review-exceptions">
            {view.exceptions.map((e) => (
              <li key={e.id} data-state={e.state}>
                <strong>{codeLabel(t, 'gateExceptionKind', e.kind)}</strong> ·{' '}
                {codeLabel(t, 'gateExceptionState', e.state)}
                {e.ending ? ` (${codeLabel(t, 'gateExceptionEnding', e.ending)})` : ''}
                <p>{e.reason}</p>
                <dl className="staff-start__evidence">
                  {Object.entries(e.evidence).map(([k, v]) => (
                    <div key={k}>
                      <dt>{codeLabel(t, 'gateExceptionEvidence', k)}</dt>
                      <dd>{Array.isArray(v) ? v.length : String(v)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="staff-request__hint">
                  {t('start.review.requested', {
                    who: e.requestedBy.name ?? '',
                    time: when(e.requestedAt, locale),
                    visit: e.visitNumber,
                  })}{' '}
                  {e.followUp !== 'none' ? codeLabel(t, 'followUpState', e.followUp) : ''}
                </p>
                <ExceptionDecision
                  t={t}
                  fetchImpl={fetchImpl}
                  e={e}
                  owners={view.followUpOwners}
                  onDone={() => void load()}
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </main>
  )
}
