// Stop Work / Report Hazard, issue reports and the job's reports (TSK-0077; HH-WORK-08, HH-WORK-09, HH-WORK-13,
// HH-CHG-04, HH-INC-02, HH-OFF-03, HH-PKT-09, T48, T54, OWN-DEC-80, OWN-DEC-143, OWN-DEC-152, OWN-DEC-172,
// RULE-SAFETY-GATES).
// - Call 911 comes first, a plain phone link that needs nothing else; nothing is ever put in front of it.
// - Stop Work / Report Hazard is on every screen of an active job, inline (no page to load), never disabled: not
//   offline, not while anything else is open, missing or failing. Choosing what was found shows its guidance at once
//   (a gas leak: evacuate and call from a safe place; live wiring: never touched). No on-site fix is ever offered.
// - Sending needs nobody's permission. Without a network (or when the server cannot be reached) the stop shows at once
//   on the phone, marked "Saved on this phone — Not yet synchronized", with the honest note that the office has not
//   been told automatically; it is sent again with the same key when the phone is back online, so it is recorded once.
// - Report an issue (HH-WORK-08): an on-site resolution is offered only for a category that may have one, with the
//   worker's statement that it is within their training, qualifications, the approved scope and the approved SOP.
// - The job's reports: restricted details (an injury, an incident) only for the Owner and the reporter, as the server
//   decides; photos only when safe; stabilization records; the Owner's review and the work-paused customer notice.
import {
  HAZARD_GUIDANCE,
  HAZARD_KINDS,
  ISSUE_CATEGORIES,
  ISSUE_SEVERITIES,
  type HazardKind,
  type IssueCategory,
} from '@handyhub/domain/hazard'
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { call, idempotencyKey, setCsrfToken, upload, type Fetch } from './api'
import { useOwnerWrite, ReauthForm } from './OwnerWrite'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string
type Pkg = { workPackageId: string; serviceCode: string; state?: string }

const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')
const when = (iso: string, locale: StaffLocale) =>
  new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))

/** Call 911: first, a phone link that needs nothing else (OWN-DEC-172, OWN-DEC-208). */
export function EmergencyCall({ t }: { t: T }) {
  return (
    <section className="staff-start__emergency" aria-label={t('start.emergency.title')} data-testid="start-call-911">
      <a className="staff-start__call911" href="tel:911">
        {t('start.emergency.call911')}
      </a>
      <p>{t('start.emergency.note')}</p>
    </section>
  )
}

// --- Stops saved on this phone -----------------------------------------------------------------------------------

const PENDING_KEY = 'hh.staff.pendingStops'
type PendingStop = { key: string; jobId: string; body: Record<string, unknown>; savedAt: string }

function readPending(): PendingStop[] {
  try {
    const raw = window.localStorage.getItem(PENDING_KEY)
    const list = raw ? (JSON.parse(raw) as PendingStop[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}
function writePending(list: PendingStop[]): void {
  try {
    if (list.length) window.localStorage.setItem(PENDING_KEY, JSON.stringify(list))
    else window.localStorage.removeItem(PENDING_KEY)
  } catch {
    // Storage unavailable: the stop still shows on this screen until it is sent.
  }
}

export type StopAnswer = {
  reportId: string
  holdId: string
  jobState: string
  jobPaused: boolean
  hazard: HazardKind
  reviewer: string
  guidance: string[]
}

/** Sends one stop; a stop the server did not take stays saved on this phone, to send again with the same key. */
async function sendStop(fetchImpl: Fetch, stop: PendingStop) {
  const r = await call<StopAnswer>(fetchImpl, `/staff/jobs/${encodeURIComponent(stop.jobId)}/hazard-reports`, {
    method: 'POST',
    body: stop.body,
    headers: { 'idempotency-key': stop.key },
  })
  if (r.ok) writePending(readPending().filter((p) => p.key !== stop.key))
  return r
}

/** Sends every stop saved on this phone (on load and whenever the phone is back online). */
export async function flushPendingStops(fetchImpl: Fetch): Promise<number> {
  let sent = 0
  for (const stop of readPending()) if ((await sendStop(fetchImpl, stop)).ok) sent++
  return sent
}

// --- Stop Work / Report Hazard ---------------------------------------------------------------------------------

/**
 * The always-available Stop Work / Report Hazard of one job. `call911` false where the page already shows Call 911
 * first (the Start Work briefing).
 */
export function StopWorkPanel({
  t,
  fetchImpl,
  jobId,
  visitId,
  workPackages = [],
  call911 = true,
  onStopped,
}: {
  t: T
  fetchImpl: Fetch
  jobId: string
  visitId?: string
  workPackages?: Pkg[]
  call911?: boolean
  onStopped?: () => void
}) {
  const ids = useId()
  const [open, setOpen] = useState(false)
  const [hazard, setHazard] = useState<HazardKind | null>(null)
  const [text, setText] = useState('')
  const [packages, setPackages] = useState<string[]>([])
  const [away, setAway] = useState(false)
  const [called, setCalled] = useState(false)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<
    { kind: 'sent'; answer: StopAnswer } | { kind: 'saved'; hazard: HazardKind; code: string } | null
  >(null)
  const stop = useRef<PendingStop | null>(null)

  const retry = useCallback(async () => {
    if (!stop.current) return
    const r = await sendStop(fetchImpl, stop.current)
    if (r.ok) {
      setResult({ kind: 'sent', answer: r.data })
      stop.current = null
      onStopped?.()
    }
  }, [fetchImpl, onStopped])
  useEffect(() => {
    const up = () => void retry()
    window.addEventListener('online', up)
    return () => window.removeEventListener('online', up)
  }, [retry])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const kind = hazard ?? 'other_unsafe'
    stop.current ??= {
      key: idempotencyKey(),
      jobId,
      savedAt: new Date().toISOString(),
      body: {
        hazard: kind,
        ...(text.trim() ? { description: text.trim() } : {}),
        ...(packages.length ? { workPackageIds: packages } : {}),
        ...(visitId ? { visitId } : {}),
        peopleKeptAway: away,
        emergencyServicesCalled: called,
        deviceRecordedAt: new Date().toISOString(),
      },
    }
    // Saved on this phone first: it survives closing the page until the server has it.
    writePending([...readPending().filter((p) => p.key !== stop.current?.key), stop.current])
    setPending(true)
    const r = await sendStop(fetchImpl, stop.current)
    setPending(false)
    if (r.ok) {
      setResult({ kind: 'sent', answer: r.data })
      stop.current = null
      onStopped?.()
    } else setResult({ kind: 'saved', hazard: kind, code: r.status === 0 ? 'offline' : r.error.code })
  }

  const shown: HazardKind | null = result ? (result.kind === 'sent' ? result.answer.hazard : result.hazard) : hazard
  return (
    <section className="staff-stop" aria-labelledby={`${ids}-title`} data-testid="stop-work">
      {call911 ? <EmergencyCall t={t} /> : null}
      <h2 id={`${ids}-title`} className="staff-myday__sub">
        {t('stop.title')}
      </h2>
      {!open && !result ? (
        <Button variant="danger" className="staff-stop__open" onClick={() => setOpen(true)}>
          {t('stop.open')}
        </Button>
      ) : null}
      {open && !result ? (
        <form className="staff-loadout__form" onSubmit={(e) => void submit(e)} aria-label={t('stop.formLabel')}>
          <p className="staff-request__hint">{t('stop.noPermission')}</p>
          <fieldset>
            <legend>{t('stop.what')}</legend>
            {HAZARD_KINDS.map((k) => (
              <label key={k} className="staff-loadout__choice">
                <input type="radio" name={`${ids}-hazard`} checked={hazard === k} onChange={() => setHazard(k)} />
                {codeLabel(t, 'hazardKind', k)}
              </label>
            ))}
          </fieldset>
          {shown ? <Guidance t={t} hazard={shown} /> : null}
          <Field
            label={t('stop.description')}
            hint={t('stop.descriptionHint')}
            name="stopDescription"
            multiline
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          {workPackages.length > 1 ? (
            <fieldset>
              <legend>{t('stop.affected')}</legend>
              <p className="staff-request__hint">{t('stop.affectedHint')}</p>
              {workPackages.map((p) => (
                <label key={p.workPackageId} className="staff-loadout__choice">
                  <input
                    type="checkbox"
                    checked={packages.includes(p.workPackageId)}
                    onChange={(e) =>
                      setPackages(
                        e.target.checked
                          ? [...packages, p.workPackageId]
                          : packages.filter((x) => x !== p.workPackageId),
                      )
                    }
                  />
                  {p.serviceCode}
                </label>
              ))}
            </fieldset>
          ) : null}
          <label className="staff-loadout__choice">
            <input type="checkbox" checked={away} onChange={(e) => setAway(e.target.checked)} />
            {t('stop.peopleKeptAway')}
          </label>
          <label className="staff-loadout__choice">
            <input type="checkbox" checked={called} onChange={(e) => setCalled(e.target.checked)} />
            {t('stop.emergencyCalled')}
          </label>
          <Button type="submit" variant="danger" pending={pending}>
            {t('stop.submit')}
          </Button>
        </form>
      ) : null}
      {result ? (
        <div className="staff-stop__result" role="status" data-testid="stop-result">
          {result.kind === 'sent' ? (
            <>
              <p>
                <StatusBadge tone="danger">{t('stop.stopped')}</StatusBadge>
              </p>
              <p>{t('stop.sent')}</p>
              <p className="staff-request__hint">
                {t('stop.reviewer', { who: codeLabel(t, 'hazardReviewer', result.answer.reviewer) })}
              </p>
            </>
          ) : (
            <>
              <p>
                <StatusBadge tone="warning">{t('stop.savedOnPhone')}</StatusBadge>
              </p>
              <p data-testid="stop-not-synced">{t('stop.notSynchronized')}</p>
              <Button variant="secondary" onClick={() => void retry()}>
                {t('stop.retry')}
              </Button>
            </>
          )}
          <Guidance t={t} hazard={shown ?? 'other_unsafe'} />
          <p>{t('stop.noResolveOnSite')}</p>
        </div>
      ) : null}
    </section>
  )
}

/** What to do now, for what was found; never a repair procedure. */
function Guidance({ t, hazard }: { t: T; hazard: HazardKind }) {
  return (
    <div className="staff-stop__guidance" data-testid="stop-guidance">
      <ul>
        {HAZARD_GUIDANCE[hazard].map((g) => (
          <li key={g}>{codeLabel(t, 'hazardGuidance', g)}</li>
        ))}
      </ul>
      <p className="staff-request__hint">{t('stop.callOwnerNotConfigured')}</p>
    </div>
  )
}

// --- Report an issue ---------------------------------------------------------------------------------------------

const RESOLUTION_LABEL = {
  whatHappened: 'stop.issue.whatHappened',
  steps: 'stop.issue.steps',
  materials: 'stop.issue.materials',
  howChecked: 'stop.issue.howChecked',
} as const satisfies Record<string, StaffKey>
const STAB_LABEL = {
  trigger: 'stop.stab.trigger',
  actions: 'stop.stab.actions',
  whyNecessary: 'stop.stab.whyNecessary',
  followUp: 'stop.stab.followUp',
} as const satisfies Record<string, StaffKey>

/** Categories that may be resolved on site (never an unsafe condition or an incident, OWN-DEC-80). */
const RESOLVABLE = (c: IssueCategory) => c !== 'unsafe_condition' && c !== 'incident'

export function IssueReportForm({
  t,
  fetchImpl,
  jobId,
  visitId,
  workPackages = [],
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  jobId: string
  visitId?: string
  workPackages?: Pkg[]
  onDone: () => void
}) {
  const ids = useId()
  const [category, setCategory] = useState<IssueCategory>('scope_mismatch')
  const [severity, setSeverity] = useState<(typeof ISSUE_SEVERITIES)[number]>('major')
  const [text, setText] = useState('')
  const [pkg, setPkg] = useState('')
  const [resolve, setResolve] = useState(false)
  const [within, setWithin] = useState(false)
  const [res, setRes] = useState({ whatHappened: '', steps: '', materials: '', howChecked: '' })
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const key = useRef<string | null>(null)
  const canResolve = RESOLVABLE(category) && severity !== 'critical'

  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    key.current ??= idempotencyKey()
    const r = await call<{ holdId: string | null }>(
      fetchImpl,
      `/staff/jobs/${encodeURIComponent(jobId)}/issue-reports`,
      {
        method: 'POST',
        body: {
          category,
          severity,
          description: text.trim(),
          ...(pkg ? { workPackageId: pkg } : {}),
          ...(visitId ? { visitId } : {}),
          ...(resolve && canResolve ? { resolution: { ...res, withinTrainingAndScope: within } } : {}),
        },
        headers: { 'idempotency-key': key.current },
      },
    )
    setPending(false)
    key.current = null
    if (!r.ok)
      return setMessage({
        ok: false,
        text: r.error.fieldErrors.map((f) => codeLabel(t, 'reportProblem', f.code)).join(' ') || t('stop.issue.failed'),
      })
    setMessage({ ok: true, text: r.data.holdId ? t('stop.issue.stopped') : t('stop.issue.sent') })
    setText('')
    setResolve(false)
    onDone()
  }

  return (
    <form className="staff-loadout__form" onSubmit={(e) => void submit(e)} aria-label={t('stop.issue.title')}>
      <h2 className="staff-myday__sub">{t('stop.issue.title')}</h2>
      <div className="hh-field">
        <label className="hh-field__label" htmlFor={`${ids}-cat`}>
          {t('stop.issue.category')}
        </label>
        <select
          id={`${ids}-cat`}
          className="hh-field__control"
          value={category}
          onChange={(e) => setCategory(e.target.value as IssueCategory)}
        >
          {ISSUE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {codeLabel(t, 'issueCategory', c)}
            </option>
          ))}
        </select>
      </div>
      {category === 'unsafe_condition' ? <p role="note">{t('stop.issue.unsafeNote')}</p> : null}
      <div className="hh-field">
        <label className="hh-field__label" htmlFor={`${ids}-sev`}>
          {t('stop.issue.severity')}
        </label>
        <select
          id={`${ids}-sev`}
          className="hh-field__control"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as (typeof ISSUE_SEVERITIES)[number])}
        >
          {ISSUE_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {codeLabel(t, 'issueSeverity', s)}
            </option>
          ))}
        </select>
      </div>
      <Field
        label={t('stop.issue.description')}
        name="issueDescription"
        multiline
        required
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {workPackages.length ? (
        <div className="hh-field">
          <label className="hh-field__label" htmlFor={`${ids}-pkg`}>
            {t('stop.issue.workPackage')}
          </label>
          <select id={`${ids}-pkg`} className="hh-field__control" value={pkg} onChange={(e) => setPkg(e.target.value)}>
            <option value="">{t('stop.issue.wholeJob')}</option>
            {workPackages.map((p) => (
              <option key={p.workPackageId} value={p.workPackageId}>
                {p.serviceCode}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {canResolve ? (
        <fieldset>
          <legend>{t('stop.issue.resolveTitle')}</legend>
          <label className="staff-loadout__choice">
            <input type="checkbox" checked={resolve} onChange={(e) => setResolve(e.target.checked)} />
            {t('stop.issue.resolve')}
          </label>
          {resolve ? (
            <>
              <label className="staff-loadout__choice">
                <input type="checkbox" checked={within} onChange={(e) => setWithin(e.target.checked)} />
                {t('stop.issue.within')}
              </label>
              {(['whatHappened', 'steps', 'materials', 'howChecked'] as const).map((k) => (
                <Field
                  key={k}
                  label={t(RESOLUTION_LABEL[k])}
                  name={k}
                  multiline
                  required
                  value={res[k]}
                  onChange={(e) => setRes({ ...res, [k]: e.target.value })}
                />
              ))}
              <p className="staff-request__hint">{t('stop.issue.photosWhenSafe')}</p>
            </>
          ) : null}
        </fieldset>
      ) : (
        <p className="staff-request__hint">{t('stop.issue.noResolve')}</p>
      )}
      {message ? (
        <p role={message.ok ? 'status' : 'alert'} className={message.ok ? undefined : 'hh-field__error'}>
          {message.text}
        </p>
      ) : null}
      <Button type="submit" pending={pending}>
        {t('stop.issue.submit')}
      </Button>
    </form>
  )
}

// --- The job's reports ---------------------------------------------------------------------------------------------

type ReportView = {
  reportId: string
  kind: 'hazard' | 'issue'
  restricted: boolean
  hazard: HazardKind | null
  category: IssueCategory | null
  severity: string
  description: string | null
  resolution: { whatHappened: string; steps: string; materials: string; howChecked: string } | null
  reviewer: string | null
  hold: { holdId: string; state: string; version: number } | null
  jobPaused: boolean
  reportedBy: { id: string; name: string | null }
  reportedAt: string
  photos: number
  stabilizations: { id: string; trigger: string; actions: string; recordedAt: string }[]
  review: { reviewedAt: string; note: string | null } | null
  customerNotice: { deliveryId: string; state: string; actions: { release: boolean; dismiss: boolean } }[]
  actions: { addPhoto: boolean; recordStabilization: boolean; review: boolean }
}
export type ReportsView = {
  jobId: string
  projectReference: string
  jobState: string
  reports: ReportView[]
  workPackages: Pkg[]
  actions: { reportHazard: boolean; reportIssue: boolean }
}

/** Loads the job's reports (null while loading, false when the server refuses or cannot be reached). */
export function useReports(fetchImpl: Fetch, jobId: string) {
  const [view, setView] = useState<ReportsView | null | false>(null)
  const load = useCallback(async () => {
    const r = await call<ReportsView>(fetchImpl, `/staff/jobs/${encodeURIComponent(jobId)}/issue-reports`)
    // Only a reports answer counts (a refused or unexpected answer shows no list; Stop Work stays regardless).
    setView(r.ok && Array.isArray(r.data?.reports) ? r.data : false)
  }, [fetchImpl, jobId])
  useEffect(() => {
    void flushPendingStops(fetchImpl).then(() => load())
  }, [fetchImpl, load])
  return { view, load }
}

function StabilizationForm({
  t,
  fetchImpl,
  reportId,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  reportId: string
  onDone: () => void
}) {
  const [v, setV] = useState({ trigger: '', actions: '', whyNecessary: '', followUp: '' })
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const key = useRef<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    key.current ??= idempotencyKey()
    const r = await call(fetchImpl, `/staff/issue-reports/${encodeURIComponent(reportId)}/stabilizations`, {
      method: 'POST',
      body: {
        trigger: v.trigger,
        actions: v.actions,
        whyNecessary: v.whyNecessary,
        ...(v.followUp.trim() ? { followUp: v.followUp } : {}),
        ownerNotifiedAt: new Date().toISOString(),
      },
      headers: { 'idempotency-key': key.current },
    })
    setPending(false)
    key.current = null
    setError(!r.ok)
    if (r.ok) onDone()
  }
  return (
    <form className="staff-loadout__form" onSubmit={(e) => void submit(e)} aria-label={t('stop.stab.title')}>
      <p className="staff-request__hint">{t('stop.stab.hint')}</p>
      {(['trigger', 'actions', 'whyNecessary', 'followUp'] as const).map((k) => (
        <Field
          key={k}
          label={t(STAB_LABEL[k])}
          name={k}
          multiline
          required={k !== 'followUp'}
          value={v[k]}
          onChange={(e) => setV({ ...v, [k]: e.target.value })}
        />
      ))}
      {error ? (
        <p role="alert" className="hh-field__error">
          {t('stop.stab.failed')}
        </p>
      ) : null}
      <Button type="submit" variant="secondary" pending={pending}>
        {t('stop.stab.submit')}
      </Button>
    </form>
  )
}

function ReportActions({ t, fetchImpl, r, onDone }: { t: T; fetchImpl: Fetch; r: ReportView; onDone: () => void }) {
  const w = useOwnerWrite(fetchImpl, (s) => setCsrfToken(s.csrfToken))
  const [error, setError] = useState<string | null>(null)
  const [stab, setStab] = useState(false)
  const id = encodeURIComponent(r.reportId)
  const send = (path: string, body: unknown) =>
    w.send(path, body, (res) => {
      if (!res.ok)
        return setError(
          res.error.fieldErrors.map((f) => codeLabel(t, 'reportProblem', f.code)).join(' ') || t('stop.list.failed'),
        )
      setError(null)
      onDone()
    })
  async function photo(file: File) {
    const res = await upload(fetchImpl, `/staff/issue-reports/${id}/photos`, file, file.type || 'image/jpeg')
    setError(res.ok ? null : t('stop.list.photoFailed'))
    if (res.ok) onDone()
  }
  return (
    <div className="staff-loadout__block-actions">
      <ReauthForm t={t} w={w} />
      {error ? <StateView kind="error" title={error} /> : null}
      {r.actions.addPhoto ? (
        <label className="staff-loadout__choice">
          {t('stop.list.addPhoto')}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void photo(f)
            }}
          />
        </label>
      ) : null}
      {r.actions.recordStabilization ? (
        stab ? (
          <StabilizationForm
            t={t}
            fetchImpl={fetchImpl}
            reportId={r.reportId}
            onDone={() => (setStab(false), onDone())}
          />
        ) : (
          <Button variant="secondary" onClick={() => setStab(true)}>
            {t('stop.stab.open')}
          </Button>
        )
      ) : null}
      {r.actions.review ? (
        <Button
          variant="secondary"
          pending={w.pending}
          onClick={() => void send(`/staff/issue-reports/${id}/review`, {})}
        >
          {t('stop.list.review')}
        </Button>
      ) : null}
      {r.customerNotice.map((n) => (
        <div key={n.deliveryId} className="staff-stop__notice" data-testid="stop-notice">
          <p>
            {t('stop.notice.title')}: {codeLabel(t, 'noticeState', n.state)}
          </p>
          {n.actions.release ? (
            <Button
              pending={w.pending}
              onClick={() =>
                void send(`/staff/issue-reports/${id}/notices/${encodeURIComponent(n.deliveryId)}/release`, {})
              }
            >
              {t('stop.notice.release')}
            </Button>
          ) : null}
          {n.actions.dismiss ? (
            <Button
              variant="quiet"
              pending={w.pending}
              onClick={() =>
                void send(`/staff/issue-reports/${id}/notices/${encodeURIComponent(n.deliveryId)}/dismiss`, {})
              }
            >
              {t('stop.notice.dismiss')}
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  )
}

/** The job's reports, newest first, as the server lets the caller see them. */
export function JobReports({
  t,
  locale,
  fetchImpl,
  view,
  onChange,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  view: ReportsView
  onChange: () => void
}) {
  if (view.reports.length === 0) return <p>{t('stop.list.none')}</p>
  return (
    <ul className="staff-stop__reports" data-testid="stop-reports">
      {view.reports.map((r) => (
        <li key={r.reportId} data-kind={r.kind} data-restricted={r.restricted}>
          <strong>
            {r.restricted && !r.hazard && !r.category
              ? t('stop.list.restricted')
              : r.hazard
                ? codeLabel(t, 'hazardKind', r.hazard)
                : codeLabel(t, 'issueCategory', r.category ?? '')}
          </strong>{' '}
          · {codeLabel(t, 'issueSeverity', r.severity)}
          {r.hold ? <> · {codeLabel(t, 'holdState', r.hold.state)}</> : null}
          {r.description ? <p>{r.description}</p> : null}
          {r.resolution ? (
            <dl className="staff-start__evidence">
              {(['whatHappened', 'steps', 'materials', 'howChecked'] as const).map((k) => (
                <div key={k}>
                  <dt>{t(RESOLUTION_LABEL[k])}</dt>
                  <dd>{r.resolution?.[k]}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {r.reviewer ? (
            <p className="staff-request__hint">
              {t('stop.reviewer', { who: codeLabel(t, 'hazardReviewer', r.reviewer) })}
            </p>
          ) : null}
          <p className="staff-request__hint">
            {t('stop.list.reported', { who: r.reportedBy.name ?? '—', time: when(r.reportedAt, locale) })}
            {r.photos ? ` · ${t('stop.list.photos', { count: r.photos })}` : ''}
            {r.review ? ` · ${t('stop.list.reviewed')}` : ''}
          </p>
          {r.stabilizations.map((s) => (
            <p key={s.id} className="staff-request__hint">
              {t('stop.stab.recorded', { time: when(s.recordedAt, locale) })}: {s.actions}
            </p>
          ))}
          <ReportActions t={t} fetchImpl={fetchImpl} r={r} onDone={onChange} />
        </li>
      ))}
    </ul>
  )
}

/**
 * Stop Work and the job's reports together, for a job screen (packet, loadout, review). Stop Work renders at once
 * from the job id alone, before (and whether or not) the reports load.
 */
export function JobSafety({
  t,
  locale,
  fetchImpl,
  jobId,
  visitId,
  call911 = true,
  issues = false,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  jobId: string
  visitId?: string
  call911?: boolean
  issues?: boolean
}) {
  const { view, load } = useReports(fetchImpl, jobId)
  const pkgs = view ? view.workPackages : []
  return (
    <>
      <StopWorkPanel
        t={t}
        fetchImpl={fetchImpl}
        jobId={jobId}
        {...(visitId ? { visitId } : {})}
        workPackages={pkgs}
        call911={call911}
        onStopped={() => void load()}
      />
      {view && issues && view.actions.reportIssue ? (
        <IssueReportForm
          t={t}
          fetchImpl={fetchImpl}
          jobId={jobId}
          {...(visitId ? { visitId } : {})}
          workPackages={pkgs}
          onDone={() => void load()}
        />
      ) : null}
      {view && view.reports.length ? (
        <section aria-labelledby={`reports-${jobId}`}>
          <h2 id={`reports-${jobId}`} className="staff-myday__sub">
            {t('stop.list.title')}
          </h2>
          <JobReports t={t} locale={locale} fetchImpl={fetchImpl} view={view} onChange={() => void load()} />
        </section>
      ) : null}
    </>
  )
}

/** Where a safety queue item leads: the hold's job review page. */
export function SafetyHoldPage({
  t,
  fetchImpl,
  holdId,
  render,
}: {
  t: T
  fetchImpl: Fetch
  holdId: string
  render: (jobId: string) => ReactNode
}) {
  const [jobId, setJobId] = useState<string | null | false>(null)
  useEffect(() => {
    void call<{ jobId: string }>(fetchImpl, `/staff/safety-holds/${encodeURIComponent(holdId)}`).then((r) =>
      setJobId(r.ok ? r.data.jobId : false),
    )
  }, [fetchImpl, holdId])
  if (jobId === null) return <StateView kind="loading" title={t('start.review.loading')} />
  if (jobId === false) return <StateView kind="error" title={t('start.review.unavailable')} />
  return <>{render(jobId)}</>
}

/** A hold note written by a Stop Work for a restricted report is a code; it reads as its label. */
export function holdNoteText(t: T, note: string): string {
  const m = /^hazard_report:([a-z_]+)$/.exec(note)
  if (!m) return note
  const code = m[1] as string
  return (HAZARD_KINDS as readonly string[]).includes(code)
    ? codeLabel(t, 'hazardKind', code)
    : codeLabel(t, 'issueCategory', code)
}
