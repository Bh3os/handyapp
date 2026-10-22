// Cases: complaints, incidents, damage, injury and disputes (TSK-0093; HH-QA-06, HH-INC-01, HH-INC-02, HH-INC-04,
// ENT-Case, OWN-DEC-124, OWN-DEC-143, RULE-HUMAN-REVIEW, RULE-SAFETY-GATES).
// - The Cases screen (the Owner, Office) lists cases; a restricted case is listed to Office only as "Restricted case"
//   with its status: the server sends nothing more (OWN-DEC-143).
// - The case page shows what the server sent: the status for everyone allowed; the handling for those who work the
//   case; and the restricted section (the report, notes, photos) only to the Owner and the person who reported it.
// - Workers report an incident quickly from the job packet; a safety hazard goes to Stop Work / Report Hazard instead
//   (this form says so, and nothing here raises or clears a hold).
// - Nothing here decides fault, liability, coverage or compensation, and no control offers it: the Owner decides and
//   handles every insurer, attorney or other professional referral, recorded as the Owner's own action. Referrals are
//   shown only as recorded ("No referral recorded" otherwise).
// - Customer updates are neutral templates, drafted and then released by staff after review; the customer sees only
//   released ones.
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { call, idempotencyKey, upload, type ApiErrorBody, type ApiResponse, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string
type StaffRef = { id: string; name: string | null }
type Href = (path: string) => string

export type CaseSummary = {
  id: string
  number: number
  projectId: string
  projectReference: string
  restricted: boolean
  kind: string | null
  state: string
  reportedAt: string
  closedAt: string | null
  version: number
  category?: string | null
  severity?: string | null
  dueOn?: string | null
}
type FollowUp = {
  id: string
  description: string
  assignedTo: StaffRef | null
  dueOn: string | null
  state: string
  doneNote: string | null
  version: number
}
type CustomerUpdate = {
  id: string
  kind: string
  body: string
  state: string
  draftedBy: StaffRef | null
  draftedAt: string
  releasedAt: string | null
  version: number
}
type HoldRef = { id: string; kind: string; state: string; category: string }
export type CaseDetail = {
  jobId: string | null
  incidentType: string | null
  category: string | null
  severity: string | null
  source: string
  reportedBy: StaffRef | null
  assignedTo: StaffRef | null
  dueOn: string | null
  reviewer: StaffRef | null
  reviewAreas: string[]
  hold: HoldRef | null
  holdOptions: HoldRef[]
  resolution: string | null
  resolvedAt: string | null
  recheckRequired: boolean
  recheck: { note: string; at: string } | null
  followUps: FollowUp[]
  customerUpdates: CustomerUpdate[]
  notes: {
    id: string
    kind: string
    source: string | null
    body: string
    writtenBy: StaffRef | null
    writtenAt: string
  }[]
  attachments: { id: string; contentType: string; uploadedAt: string }[]
  referrals: { id: string; professional: string; note: string; referredOn: string; recordedAt: string }[] | null
  history: { event: string; from: string | null; to: string; by: StaffRef | null; note: string | null; at: string }[]
  actions: {
    events: string[]
    manage: boolean
    linkHold: boolean
    recheck: boolean
    refer: boolean
    restricted: boolean
  }
}
export type CaseView = CaseSummary & { detail: CaseDetail | null }
export type RestrictedSection = {
  caseId: string
  number: number
  projectReference: string
  kind: string
  incidentType: string | null
  state: string
  reportedBy: StaffRef | null
  reportedAt: string
  report: {
    occurredAt: string | null
    whatHappened: string
    peopleAffected: string | null
    workAreas: string | null
    immediateActions: string | null
    medicalDetail: string | null
  } | null
  notes: { id: string; body: string; writtenBy: StaffRef | null; writtenAt: string }[]
  attachments: { id: string; contentType: string; uploadedAt: string }[]
}

const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')
const whenOf = (locale: StaffLocale) => (iso: string) =>
  new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
const nameOf = (t: T, r: StaffRef | null) => (r ? (r.name ?? t('cases.someone')) : t('cases.nobody'))
const STATE_TONE = (state: string) =>
  state === 'closed' ? 'neutral' : state === 'resolved' || state === 'resolution_review' ? 'success' : 'warning'
const COMPLAINT_CATEGORIES = ['work_quality', 'conduct', 'schedule', 'billing', 'other'] as const
const SEVERITIES = ['low', 'moderate', 'high', 'critical'] as const
const COMPLAINT_SOURCES = ['walkthrough', 'message', 'call'] as const
const INCIDENT_TYPES = [
  'injury',
  'near_miss',
  'property_damage',
  'exposure_concern',
  'customer_conflict',
  'equipment_failure',
  'dispute',
  'other',
] as const
const UPDATE_KINDS = ['acknowledgment', 'progress', 'next_step', 'safety_pause'] as const
const PROFESSIONALS = ['insurer', 'attorney', 'other_professional'] as const

/** Writes with a fresh idempotency key per attempt. */
function useSend(fetchImpl: Fetch) {
  return useCallback(
    <R,>(path: string, body: unknown, opts: { method?: 'POST' | 'PUT'; version?: number } = {}) =>
      call<R>(fetchImpl, path, {
        method: opts.method ?? 'POST',
        body,
        headers: {
          'idempotency-key': idempotencyKey(),
          ...(opts.version === undefined ? {} : { 'if-match': `"${opts.version}"` }),
        },
      }),
    [fetchImpl],
  )
}

/** The refusal in words: each field code of the case routes, else the error code. */
export function caseError(t: T, e: ApiErrorBody): string {
  if (e.fieldErrors.length) return e.fieldErrors.map((f) => codeLabel(t, 'caseCode', f.code)).join(' ')
  try {
    return t(`error.${e.code}` as StaffKey)
  } catch {
    return t('error.INTERNAL')
  }
}

function Problem({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="hh-field__error">
      {text}
    </p>
  ) : null
}

function Select({
  label,
  name,
  value,
  onChange,
  options,
}: {
  label: string
  name: string
  value: string
  onChange: (v: string) => void
  options: readonly { value: string; label: string }[]
}) {
  // An explicit label (not a wrapping one), so the accessible name is the label alone, never the chosen option too.
  const id = useId()
  return (
    <div className="hh-field">
      <label className="hh-field__label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="hh-field__control"
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function Section({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  const id = useId()
  return (
    <section className="staff-request__section" aria-labelledby={id} data-testid={testId}>
      <h2 id={id} className="staff-queue__heading">
        {title}
      </h2>
      {children}
    </section>
  )
}

function useAssignees(fetchImpl: Fetch, enabled: boolean) {
  const [staff, setStaff] = useState<StaffRef[]>([])
  useEffect(() => {
    if (!enabled) return
    void call<{ staff: StaffRef[] }>(fetchImpl, '/staff/cases/assignees').then((r) =>
      setStaff(r.ok ? r.data.staff : []),
    )
  }, [fetchImpl, enabled])
  return staff
}

const kindText = (t: T, c: Pick<CaseSummary, 'kind' | 'restricted'>) =>
  c.kind ? codeLabel(t, 'caseKind', c.kind) : t('cases.restrictedCase')

// --- Lists ---------------------------------------------------------------------------------------------------------

function CaseRows({ t, locale, cases, href }: { t: T; locale: StaffLocale; cases: CaseSummary[]; href: Href }) {
  const when = whenOf(locale)
  if (cases.length === 0) return <p>{t('cases.none')}</p>
  return (
    <ul className="staff-request__list" data-testid="case-list">
      {cases.map((c) => (
        <li key={c.id} className="staff-request__decision" data-testid="case-row">
          <p>
            <a href={href(`/cases/${c.id}`)}>{t('cases.number', { number: c.number })}</a>{' '}
            <strong>{kindText(t, c)}</strong>{' '}
            <StatusBadge tone={STATE_TONE(c.state)}>{codeLabel(t, 'caseState', c.state)}</StatusBadge>
          </p>
          <p className="staff-request__hint">
            {t('cases.listLine', { reference: c.projectReference, time: when(c.reportedAt) })}
            {c.category ? ` · ${codeLabel(t, 'complaintCategory', c.category)}` : ''}
            {c.severity ? ` · ${codeLabel(t, 'caseSeverity', c.severity)}` : ''}
            {c.dueOn ? ` · ${t('cases.due', { date: c.dueOn })}` : ''}
          </p>
        </li>
      ))}
    </ul>
  )
}

export function CasesScreen({
  t,
  locale,
  fetchImpl,
  href,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  href: Href
}) {
  const [state, setState] = useState<'open' | 'closed' | 'all'>('open')
  const [cases, setCases] = useState<CaseSummary[] | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    void call<{ cases: CaseSummary[] }>(fetchImpl, `/staff/cases?state=${state}`).then((r) => {
      setFailed(!r.ok)
      setCases(r.ok && Array.isArray(r.data?.cases) ? r.data.cases : null)
    })
  }, [fetchImpl, state])
  return (
    <section className="staff-screen" aria-labelledby="cases-title" data-testid="cases-screen">
      <h1 id="cases-title" className="hh-h3">
        {t('nav.cases')}
      </h1>
      <p className="staff-request__hint">{t('cases.screenHint')}</p>
      <Select
        label={t('cases.filter')}
        name="caseState"
        value={state}
        onChange={(v) => setState(v as typeof state)}
        options={[
          { value: 'open', label: t('cases.filter.open') },
          { value: 'closed', label: t('cases.filter.closed') },
          { value: 'all', label: t('cases.filter.all') },
        ]}
      />
      {failed ? <StateView kind="error" title={t('cases.loadFailed')} /> : null}
      {cases ? <CaseRows t={t} locale={locale} cases={cases} href={href} /> : null}
    </section>
  )
}

// --- Creating cases ------------------------------------------------------------------------------------------------

function IncidentForm({
  t,
  fetchImpl,
  url,
  staffSource,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  url: string
  /** Staff off the job say where it came from; a worker's report is a worker report. */
  staffSource: boolean
  onDone: (created: { caseId: string; number: number }) => void
}) {
  const send = useSend(fetchImpl)
  const [type, setType] = useState<string>('injury')
  const [source, setSource] = useState<string>('call')
  const [fields, setFields] = useState({
    whatHappened: '',
    peopleAffected: '',
    workAreas: '',
    immediateActions: '',
    medicalDetail: '',
  })
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    const body: Record<string, string> = { type, whatHappened: fields.whatHappened.trim() }
    for (const k of ['peopleAffected', 'workAreas', 'immediateActions', 'medicalDetail'] as const)
      if (fields[k].trim()) body[k] = fields[k].trim()
    if (staffSource) body['source'] = source
    const r = await send<{ caseId: string; number: number }>(url, body)
    setPending(false)
    if (!r.ok) return setProblem(caseError(t, r.error))
    setProblem(null)
    setFields({ whatHappened: '', peopleAffected: '', workAreas: '', immediateActions: '', medicalDetail: '' })
    onDone(r.data)
  }
  const text = (k: keyof typeof fields, label: StaffKey, required = false) => (
    <Field
      label={t(label)}
      name={k}
      multiline
      required={required}
      value={fields[k]}
      onChange={(e) => setFields({ ...fields, [k]: e.target.value })}
    />
  )
  return (
    <form
      className="staff-loadout__form"
      onSubmit={(e) => void submit(e)}
      aria-label={t('cases.report.title')}
      data-testid="incident-form"
    >
      <StateView kind="blocked" title={t('cases.report.safety')} />
      <p className="staff-request__hint">{t('cases.report.hint')}</p>
      <Select
        label={t('cases.report.type')}
        name="incidentType"
        value={type}
        onChange={setType}
        options={INCIDENT_TYPES.map((v) => ({ value: v, label: codeLabel(t, 'incidentType', v) }))}
      />
      {staffSource ? (
        <Select
          label={t('cases.field.source')}
          name="source"
          value={source}
          onChange={setSource}
          options={(['call', 'message', 'walkthrough', 'worker_report'] as const).map((v) => ({
            value: v,
            label: codeLabel(t, 'caseSource', v),
          }))}
        />
      ) : null}
      {text('whatHappened', 'cases.report.whatHappened', true)}
      {text('peopleAffected', 'cases.report.peopleAffected')}
      {text('workAreas', 'cases.report.workAreas')}
      {text('immediateActions', 'cases.report.immediateActions')}
      {text('medicalDetail', 'cases.report.medicalDetail')}
      <p className="staff-request__hint">{t('cases.report.minimal')}</p>
      <Problem text={problem} />
      <Button type="submit" pending={pending}>
        {t('cases.report.submit')}
      </Button>
    </form>
  )
}

function ComplaintForm({
  t,
  fetchImpl,
  projectId,
  staff,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  projectId: string
  staff: StaffRef[]
  onDone: () => Promise<void>
}) {
  const send = useSend(fetchImpl)
  const [category, setCategory] = useState<string>('work_quality')
  const [severity, setSeverity] = useState<string>('moderate')
  const [source, setSource] = useState<string>('call')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueOn, setDueOn] = useState('')
  const [description, setDescription] = useState('')
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [existing, setExisting] = useState<{ caseId: string; number: number } | null>(null)
  const assignee = assignedTo || staff[0]?.id || ''
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    const r = await send<{ caseId: string }>(`/staff/projects/${encodeURIComponent(projectId)}/complaints`, {
      category,
      severity,
      source,
      assignedTo: assignee,
      dueOn,
      description: description.trim(),
    })
    setPending(false)
    if (!r.ok) {
      const dup = r.error.fieldErrors.some((f) => f.code === 'DUPLICATE_OPEN_CASE')
      const values = r.error.current?.values as { caseId?: string; number?: number } | undefined
      setExisting(dup && values?.caseId ? { caseId: values.caseId, number: Number(values.number) } : null)
      return setProblem(caseError(t, r.error))
    }
    setProblem(null)
    setExisting(null)
    setDescription('')
    await onDone()
  }
  async function addToExisting() {
    if (!existing) return
    setPending(true)
    const r = await send(`/staff/cases/${existing.caseId}/notes`, { body: description.trim(), source })
    setPending(false)
    if (!r.ok) return setProblem(caseError(t, r.error))
    setProblem(null)
    setExisting(null)
    setDescription('')
    await onDone()
  }
  return (
    <form
      className="staff-loadout__form"
      onSubmit={(e) => void submit(e)}
      aria-label={t('cases.complaint.title')}
      data-testid="complaint-form"
    >
      <Select
        label={t('cases.field.category')}
        name="category"
        value={category}
        onChange={setCategory}
        options={COMPLAINT_CATEGORIES.map((v) => ({ value: v, label: codeLabel(t, 'complaintCategory', v) }))}
      />
      <p className="staff-request__hint">{t('cases.complaint.damageHint')}</p>
      <Select
        label={t('cases.field.severity')}
        name="severity"
        value={severity}
        onChange={setSeverity}
        options={SEVERITIES.map((v) => ({ value: v, label: codeLabel(t, 'caseSeverity', v) }))}
      />
      <Select
        label={t('cases.field.source')}
        name="source"
        value={source}
        onChange={setSource}
        options={COMPLAINT_SOURCES.map((v) => ({ value: v, label: codeLabel(t, 'caseSource', v) }))}
      />
      <Select
        label={t('cases.field.assignedTo')}
        name="assignedTo"
        value={assignee}
        onChange={setAssignedTo}
        options={staff.map((s) => ({ value: s.id, label: s.name ?? s.id }))}
      />
      <Field
        label={t('cases.field.dueOn')}
        name="dueOn"
        type="date"
        required
        value={dueOn}
        onChange={(e) => setDueOn(e.target.value)}
      />
      <Field
        label={t('cases.complaint.description')}
        name="description"
        multiline
        required
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <Problem text={problem} />
      {existing ? (
        <div className="hh-button-row" data-testid="add-to-existing">
          <p>{t('cases.complaint.existing', { number: existing.number })}</p>
          <Button type="button" pending={pending} onClick={() => void addToExisting()}>
            {t('cases.complaint.addToExisting')}
          </Button>
        </div>
      ) : null}
      <Button type="submit" pending={pending}>
        {t('cases.complaint.submit')}
      </Button>
    </form>
  )
}

/** The project's cases on its record (the Owner, Office): the list, Record a complaint, Report an incident. */
export function ProjectCases({
  t,
  locale,
  fetchImpl,
  projectId,
  href,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  projectId: string
  href: Href
}) {
  const [cases, setCases] = useState<CaseSummary[] | null>(null)
  const [open, setOpen] = useState<'complaint' | 'incident' | null>(null)
  const [created, setCreated] = useState<number | null>(null)
  const load = useCallback(async () => {
    const r = await call<{ cases: CaseSummary[] }>(fetchImpl, `/staff/projects/${encodeURIComponent(projectId)}/cases`)
    setCases(r.ok && Array.isArray(r.data?.cases) ? r.data.cases : null)
  }, [fetchImpl, projectId])
  useEffect(() => {
    void load()
  }, [load])
  const staff = useAssignees(fetchImpl, cases !== null)
  if (cases === null) return null
  return (
    <Section title={t('cases.project.title')} testId="project-cases">
      <CaseRows t={t} locale={locale} cases={cases} href={href} />
      {created !== null ? <p role="status">{t('cases.report.done', { number: created })}</p> : null}
      <div className="hh-button-row">
        <Button variant="secondary" onClick={() => setOpen(open === 'complaint' ? null : 'complaint')}>
          {t('cases.complaint.title')}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(open === 'incident' ? null : 'incident')}>
          {t('cases.report.title')}
        </Button>
      </div>
      {open === 'complaint' ? (
        <ComplaintForm
          t={t}
          fetchImpl={fetchImpl}
          projectId={projectId}
          staff={staff}
          onDone={async () => {
            setOpen(null)
            await load()
          }}
        />
      ) : null}
      {open === 'incident' ? (
        <IncidentForm
          t={t}
          fetchImpl={fetchImpl}
          url={`/staff/projects/${encodeURIComponent(projectId)}/incidents`}
          staffSource
          onDone={(c) => {
            setOpen(null)
            setCreated(c.number)
            void load()
          }}
        />
      ) : null}
    </Section>
  )
}

/** Report an incident from the job screen, and the caller's own reports on the job. */
export function JobIncidents({
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
  href: Href
}) {
  const [reports, setReports] = useState<
    { id: string; number: number; kind: string; state: string; reportedAt: string }[] | null
  >(null)
  const [open, setOpen] = useState(false)
  const [created, setCreated] = useState<number | null>(null)
  const when = whenOf(locale)
  const load = useCallback(async () => {
    const r = await call<{ reports: typeof reports & object }>(
      fetchImpl,
      `/staff/jobs/${encodeURIComponent(jobId)}/incident-reports`,
    )
    setReports(r.ok && Array.isArray(r.data?.reports) ? r.data.reports : null)
  }, [fetchImpl, jobId])
  useEffect(() => {
    void load()
  }, [load])
  if (reports === null) return null
  return (
    <Section title={t('cases.job.title')} testId="job-incidents">
      {created !== null ? <p role="status">{t('cases.report.done', { number: created })}</p> : null}
      {reports.length ? (
        <ul className="staff-request__list">
          {reports.map((r) => (
            <li key={r.id}>
              <a href={href(`/cases/${r.id}`)}>{t('cases.number', { number: r.number })}</a>{' '}
              {codeLabel(t, 'caseKind', r.kind)}{' '}
              <StatusBadge tone={STATE_TONE(r.state)}>{codeLabel(t, 'caseState', r.state)}</StatusBadge>{' '}
              <span className="staff-request__hint">{when(r.reportedAt)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <Button variant="secondary" onClick={() => setOpen(!open)}>
        {t('cases.report.title')}
      </Button>
      {open ? (
        <IncidentForm
          t={t}
          fetchImpl={fetchImpl}
          url={`/staff/jobs/${encodeURIComponent(jobId)}/incidents`}
          staffSource={false}
          onDone={(c) => {
            setOpen(false)
            setCreated(c.number)
            void load()
          }}
        />
      ) : null}
    </Section>
  )
}

// --- The case page -------------------------------------------------------------------------------------------------

function Photos({
  t,
  locale,
  fetchImpl,
  base,
  photos,
  canAdd,
  onChanged,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  base: string
  photos: { id: string; uploadedAt: string }[]
  canAdd: boolean
  onChanged: () => Promise<void>
}) {
  const [problem, setProblem] = useState<string | null>(null)
  const id = useId()
  const when = whenOf(locale)
  async function chosen(file: File | undefined) {
    if (!file) return
    const r: ApiResponse<unknown> = await upload(fetchImpl, base, file, file.type || 'application/octet-stream')
    if (!r.ok) return setProblem(t('cases.photo.failed'))
    setProblem(null)
    await onChanged()
  }
  return (
    <div>
      {photos.length ? (
        <ul className="staff-request__list">
          {photos.map((p, i) => (
            <li key={p.id}>
              <a href={`/api/v1${base}/${p.id}`} target="_blank" rel="noreferrer">
                {t('cases.photo.item', { n: i + 1, time: when(p.uploadedAt) })}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('cases.photo.none')}</p>
      )}
      {canAdd ? (
        <p>
          <label htmlFor={id}>{t('cases.photo.add')}</label>{' '}
          <input
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => void chosen(e.target.files?.[0])}
          />
        </p>
      ) : null}
      <Problem text={problem} />
    </div>
  )
}

function NoteForm({
  t,
  fetchImpl,
  url,
  withSource,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  url: string
  withSource: boolean
  onDone: () => Promise<void>
}) {
  const send = useSend(fetchImpl)
  const [body, setBody] = useState('')
  const [source, setSource] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    const r = await send(url, { body: body.trim(), ...(withSource && source ? { source } : {}) })
    setPending(false)
    if (!r.ok) return setProblem(caseError(t, r.error))
    setProblem(null)
    setBody('')
    await onDone()
  }
  return (
    <form className="staff-loadout__form" onSubmit={(e) => void submit(e)} aria-label={t('cases.note.add')}>
      <Field
        label={t('cases.note.body')}
        name="noteBody"
        multiline
        required
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      {withSource ? (
        <Select
          label={t('cases.note.source')}
          name="noteSource"
          value={source}
          onChange={setSource}
          options={[
            { value: '', label: t('cases.note.internal') },
            ...COMPLAINT_SOURCES.map((v) => ({ value: v, label: codeLabel(t, 'caseSource', v) })),
          ]}
        />
      ) : null}
      <Problem text={problem} />
      <Button type="submit" pending={pending}>
        {t('cases.note.add')}
      </Button>
    </form>
  )
}

function Restricted({
  t,
  locale,
  fetchImpl,
  section,
  onChanged,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  section: RestrictedSection
  onChanged: () => Promise<void>
}) {
  const when = whenOf(locale)
  const r = section.report
  const row = (label: StaffKey, value: string | null) =>
    value ? (
      <div>
        <dt>{t(label)}</dt>
        <dd>{value}</dd>
      </div>
    ) : null
  return (
    <Section title={t('cases.restricted.title')} testId="case-restricted">
      <p className="staff-request__hint">{t('cases.restricted.hint')}</p>
      <dl className="staff-system__fields">
        {row('cases.field.type', section.incidentType ? codeLabel(t, 'incidentType', section.incidentType) : null)}
        {row('cases.field.reportedBy', `${nameOf(t, section.reportedBy)}, ${when(section.reportedAt)}`)}
        {r ? (
          <>
            {row('cases.report.occurredAt', r.occurredAt ? when(r.occurredAt) : null)}
            {row('cases.report.whatHappened', r.whatHappened)}
            {row('cases.report.peopleAffected', r.peopleAffected)}
            {row('cases.report.workAreas', r.workAreas)}
            {row('cases.report.immediateActions', r.immediateActions)}
            {row('cases.report.medicalDetail', r.medicalDetail)}
          </>
        ) : null}
      </dl>
      <h3 className="hh-h5">{t('cases.notes')}</h3>
      {section.notes.length ? (
        <ul className="staff-request__list">
          {section.notes.map((n) => (
            <li key={n.id}>
              <p className="staff-request__note">{n.body}</p>
              <p className="staff-request__hint">
                {t('cases.byAt', { name: nameOf(t, n.writtenBy), time: when(n.writtenAt) })}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      <NoteForm
        t={t}
        fetchImpl={fetchImpl}
        url={`/staff/cases/${section.caseId}/restricted/notes`}
        withSource={false}
        onDone={onChanged}
      />
      <h3 className="hh-h5">{t('cases.photos')}</h3>
      <Photos
        t={t}
        locale={locale}
        fetchImpl={fetchImpl}
        base={`/staff/cases/${section.caseId}/restricted/attachments`}
        photos={section.attachments}
        canAdd
        onChanged={onChanged}
      />
    </Section>
  )
}

/** The fields a lifecycle event asks for (OQ-CASE-DETAILS). */
function EventButton({
  t,
  fetchImpl,
  view,
  event,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  view: CaseView
  event: string
  onDone: () => Promise<void>
}) {
  const send = useSend(fetchImpl)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [recheck, setRecheck] = useState(false)
  const [severity, setSeverity] = useState(view.severity ?? view.detail?.severity ?? 'moderate')
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const resolving = event === 'resolve' || event === 'submit_resolution'
  const needsText = resolving || event === 'reopen' || event === 'return_to_action'
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    const body = resolving
      ? { resolution: text.trim(), recheckRequired: recheck }
      : event === 'reopen'
        ? { reason: text.trim() }
        : event === 'triage'
          ? { severity, ...(text.trim() ? { note: text.trim() } : {}) }
          : text.trim()
            ? { note: text.trim() }
            : {}
    const r = await send(`/staff/cases/${view.id}/actions/${event.replace(/_/g, '-')}`, body, { version: view.version })
    setPending(false)
    if (!r.ok) return setProblem(caseError(t, r.error))
    setProblem(null)
    setOpen(false)
    setText('')
    await onDone()
  }
  if (!open)
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        {codeLabel(t, 'caseEvent', event)}
      </Button>
    )
  return (
    <form
      className="staff-loadout__form"
      onSubmit={(e) => void submit(e)}
      aria-label={codeLabel(t, 'caseEvent', event)}
    >
      {event === 'triage' ? (
        <Select
          label={t('cases.field.severity')}
          name="triageSeverity"
          value={severity}
          onChange={setSeverity}
          options={SEVERITIES.map((v) => ({ value: v, label: codeLabel(t, 'caseSeverity', v) }))}
        />
      ) : null}
      <Field
        label={t(resolving ? 'cases.event.resolution' : event === 'reopen' ? 'cases.event.reason' : 'cases.event.note')}
        {...(resolving ? { hint: t('cases.event.resolutionHint') } : {})}
        name="eventText"
        multiline
        required={needsText}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {resolving ? (
        <label className="staff-loadout__choice">
          <input
            type="checkbox"
            name="recheckRequired"
            checked={recheck}
            onChange={(e) => setRecheck(e.target.checked)}
          />
          {t('cases.event.recheckRequired')}
        </label>
      ) : null}
      <Problem text={problem} />
      <div className="hh-button-row">
        <Button type="submit" pending={pending}>
          {codeLabel(t, 'caseEvent', event)}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          {t('cases.cancel')}
        </Button>
      </div>
    </form>
  )
}

function Handling({
  t,
  fetchImpl,
  view,
  detail,
  staff,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  view: CaseView
  detail: CaseDetail
  staff: StaffRef[]
  onDone: () => Promise<void>
}) {
  const send = useSend(fetchImpl)
  const [severity, setSeverity] = useState(detail.severity ?? 'moderate')
  const [assignedTo, setAssignedTo] = useState(detail.assignedTo?.id ?? '')
  const [dueOn, setDueOn] = useState(detail.dueOn ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    const r = await send(
      `/staff/cases/${view.id}/handling`,
      { severity, assignedTo: assignedTo || null, dueOn: dueOn || null },
      { method: 'PUT', version: view.version },
    )
    setPending(false)
    if (!r.ok) return setProblem(caseError(t, r.error))
    setProblem(null)
    await onDone()
  }
  return (
    <form className="staff-loadout__form" onSubmit={(e) => void submit(e)} aria-label={t('cases.handling.title')}>
      <Select
        label={t('cases.field.severity')}
        name="handlingSeverity"
        value={severity}
        onChange={setSeverity}
        options={SEVERITIES.map((v) => ({ value: v, label: codeLabel(t, 'caseSeverity', v) }))}
      />
      <Select
        label={t('cases.field.assignedTo')}
        name="handlingAssignee"
        value={assignedTo}
        onChange={setAssignedTo}
        options={[
          { value: '', label: t('cases.nobody') },
          ...staff.map((s) => ({ value: s.id, label: s.name ?? s.id })),
        ]}
      />
      <Field
        label={t('cases.field.dueOn')}
        name="handlingDue"
        type="date"
        value={dueOn}
        onChange={(e) => setDueOn(e.target.value)}
      />
      <Problem text={problem} />
      <Button type="submit" pending={pending}>
        {t('cases.handling.save')}
      </Button>
    </form>
  )
}

function HoldLink({
  t,
  fetchImpl,
  view,
  detail,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  view: CaseView
  detail: CaseDetail
  onDone: () => Promise<void>
}) {
  const send = useSend(fetchImpl)
  const [holdId, setHoldId] = useState(detail.hold?.id ?? '')
  const [problem, setProblem] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    const r = await send(
      `/staff/cases/${view.id}/hold-link`,
      { holdId: holdId || null },
      { method: 'PUT', version: view.version },
    )
    if (!r.ok) return setProblem(caseError(t, r.error))
    setProblem(null)
    await onDone()
  }
  return (
    <form className="staff-loadout__form" onSubmit={(e) => void submit(e)} aria-label={t('cases.hold.link')}>
      <Select
        label={t('cases.hold.link')}
        name="holdId"
        value={holdId}
        onChange={setHoldId}
        options={[
          { value: '', label: t('cases.hold.none') },
          ...detail.holdOptions.map((h) => ({
            value: h.id,
            label: `${codeLabel(t, 'holdKind', h.kind)} · ${codeLabel(t, 'hazardCategory', h.category)} · ${codeLabel(t, 'holdState', h.state)}`,
          })),
        ]}
      />
      <p className="staff-request__hint">{t('cases.hold.hint')}</p>
      <Problem text={problem} />
      <Button type="submit" variant="secondary">
        {t('cases.hold.save')}
      </Button>
    </form>
  )
}

function FollowUps({
  t,
  fetchImpl,
  view,
  detail,
  staff,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  view: CaseView
  detail: CaseDetail
  staff: StaffRef[]
  onDone: () => Promise<void>
}) {
  const send = useSend(fetchImpl)
  const [description, setDescription] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [dueOn, setDueOn] = useState('')
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const manage = detail.actions.manage
  async function add(e: FormEvent) {
    e.preventDefault()
    const r = await send(`/staff/cases/${view.id}/follow-ups`, {
      description: description.trim(),
      assignedTo: assignedTo || staff[0]?.id,
      dueOn,
    })
    if (!r.ok) return setProblem(caseError(t, r.error))
    setProblem(null)
    setDescription('')
    await onDone()
  }
  async function settle(f: FollowUp, how: 'complete' | 'cancel') {
    const r = await send(
      `/staff/case-follow-ups/${f.id}/actions/${how}`,
      { note: (notes[f.id] ?? '').trim() },
      { version: f.version },
    )
    if (!r.ok) return setProblem(caseError(t, r.error))
    setProblem(null)
    await onDone()
  }
  return (
    <Section title={t('cases.followUps.title')} testId="case-follow-ups">
      {detail.followUps.length === 0 ? <p>{t('cases.followUps.none')}</p> : null}
      <ul className="staff-request__list">
        {detail.followUps.map((f) => (
          <li key={f.id} className="staff-request__decision">
            <p>
              {f.description}{' '}
              <StatusBadge tone={f.state === 'open' ? 'warning' : 'neutral'}>
                {codeLabel(t, 'caseFollowUpState', f.state)}
              </StatusBadge>
            </p>
            <p className="staff-request__hint">
              {t('cases.followUps.line', { name: nameOf(t, f.assignedTo), date: f.dueOn ?? '' })}
              {f.doneNote ? ` · ${f.doneNote}` : ''}
            </p>
            {manage && f.state === 'open' ? (
              <div className="hh-button-row">
                <Field
                  label={t('cases.followUps.note')}
                  name={`followUpNote-${f.id}`}
                  value={notes[f.id] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [f.id]: e.target.value })}
                />
                <Button variant="secondary" onClick={() => void settle(f, 'complete')}>
                  {t('cases.followUps.complete')}
                </Button>
                <Button variant="secondary" onClick={() => void settle(f, 'cancel')}>
                  {t('cases.followUps.cancel')}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {manage ? (
        <form className="staff-loadout__form" onSubmit={(e) => void add(e)} aria-label={t('cases.followUps.add')}>
          <Field
            label={t('cases.followUps.description')}
            name="followUpDescription"
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Select
            label={t('cases.field.assignedTo')}
            name="followUpAssignee"
            value={assignedTo || staff[0]?.id || ''}
            onChange={setAssignedTo}
            options={staff.map((s) => ({ value: s.id, label: s.name ?? s.id }))}
          />
          <Field
            label={t('cases.field.dueOn')}
            name="followUpDue"
            type="date"
            required
            value={dueOn}
            onChange={(e) => setDueOn(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            {t('cases.followUps.add')}
          </Button>
        </form>
      ) : null}
      <Problem text={problem} />
    </Section>
  )
}

function CustomerUpdates({
  t,
  locale,
  fetchImpl,
  view,
  detail,
  onDone,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  view: CaseView
  detail: CaseDetail
  onDone: () => Promise<void>
}) {
  const send = useSend(fetchImpl)
  const [kind, setKind] = useState<string>('acknowledgment')
  const [detailText, setDetailText] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const when = whenOf(locale)
  const takesDetail = kind === 'progress' || kind === 'next_step'
  async function draft(e: FormEvent) {
    e.preventDefault()
    const r = await send(`/staff/cases/${view.id}/customer-updates`, {
      kind,
      ...(takesDetail ? { detail: detailText.trim() } : {}),
    })
    if (!r.ok) return setProblem(caseError(t, r.error))
    setProblem(null)
    setDetailText('')
    await onDone()
  }
  async function settle(u: CustomerUpdate, how: 'release' | 'withdraw') {
    const r = await send(`/staff/case-customer-updates/${u.id}/actions/${how}`, {}, { version: u.version })
    if (!r.ok) return setProblem(caseError(t, r.error))
    setProblem(null)
    await onDone()
  }
  return (
    <Section title={t('cases.updates.title')} testId="case-customer-updates">
      <p className="staff-request__hint">{t('cases.updates.hint')}</p>
      {detail.customerUpdates.length === 0 ? <p>{t('cases.updates.none')}</p> : null}
      <ul className="staff-request__list">
        {detail.customerUpdates.map((u) => (
          <li key={u.id} className="staff-request__decision" data-testid="case-update">
            <p>
              <strong>{codeLabel(t, 'caseUpdateKind', u.kind)}</strong>{' '}
              <StatusBadge tone={u.state === 'released' ? 'success' : u.state === 'draft' ? 'info' : 'neutral'}>
                {codeLabel(t, 'caseUpdateState', u.state)}
              </StatusBadge>
            </p>
            <blockquote lang="en" className="staff-request__note">
              {u.body}
            </blockquote>
            <p className="staff-request__hint">
              {u.releasedAt
                ? t('cases.updates.released', { time: when(u.releasedAt) })
                : t('cases.byAt', { name: nameOf(t, u.draftedBy), time: when(u.draftedAt) })}
            </p>
            {detail.actions.manage && u.state === 'draft' ? (
              <div className="hh-button-row">
                <Button onClick={() => void settle(u, 'release')}>{t('cases.updates.release')}</Button>
                <Button variant="secondary" onClick={() => void settle(u, 'withdraw')}>
                  {t('cases.updates.withdraw')}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {detail.actions.manage ? (
        <form className="staff-loadout__form" onSubmit={(e) => void draft(e)} aria-label={t('cases.updates.draft')}>
          <Select
            label={t('cases.updates.kind')}
            name="updateKind"
            value={kind}
            onChange={setKind}
            options={UPDATE_KINDS.map((v) => ({ value: v, label: codeLabel(t, 'caseUpdateKind', v) }))}
          />
          {takesDetail ? (
            <Field
              label={t('cases.updates.detail')}
              hint={t('cases.updates.detailHint')}
              name="updateDetail"
              multiline
              required
              value={detailText}
              onChange={(e) => setDetailText(e.target.value)}
            />
          ) : null}
          <Button type="submit" variant="secondary">
            {t('cases.updates.draft')}
          </Button>
        </form>
      ) : null}
      <Problem text={problem} />
    </Section>
  )
}

function Referrals({
  t,
  fetchImpl,
  view,
  detail,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  view: CaseView
  detail: CaseDetail
  onDone: () => Promise<void>
}) {
  const send = useSend(fetchImpl)
  const [professional, setProfessional] = useState<string>('insurer')
  const [note, setNote] = useState('')
  const [referredOn, setReferredOn] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  if (detail.referrals === null) return null
  async function submit(e: FormEvent) {
    e.preventDefault()
    const r = await send(`/staff/cases/${view.id}/referrals`, { professional, note: note.trim(), referredOn })
    if (!r.ok) return setProblem(caseError(t, r.error))
    setProblem(null)
    setNote('')
    await onDone()
  }
  return (
    <Section title={t('cases.referrals.title')} testId="case-referrals">
      <p className="staff-request__hint">{t('cases.referrals.hint')}</p>
      {detail.referrals.length === 0 ? (
        <p>{t('cases.referrals.none')}</p>
      ) : (
        <ul className="staff-request__list">
          {detail.referrals.map((r) => (
            <li key={r.id}>
              {t('cases.referrals.line', {
                professional: codeLabel(t, 'caseReferralProfessional', r.professional),
                date: r.referredOn,
              })}
              <p className="staff-request__note">{r.note}</p>
            </li>
          ))}
        </ul>
      )}
      {detail.actions.refer ? (
        <form className="staff-loadout__form" onSubmit={(e) => void submit(e)} aria-label={t('cases.referrals.add')}>
          <Select
            label={t('cases.referrals.professional')}
            name="professional"
            value={professional}
            onChange={setProfessional}
            options={PROFESSIONALS.map((v) => ({ value: v, label: codeLabel(t, 'caseReferralProfessional', v) }))}
          />
          <Field
            label={t('cases.referrals.date')}
            name="referredOn"
            type="date"
            required
            value={referredOn}
            onChange={(e) => setReferredOn(e.target.value)}
          />
          <Field
            label={t('cases.referrals.note')}
            name="referralNote"
            multiline
            required
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            {t('cases.referrals.add')}
          </Button>
        </form>
      ) : null}
      <Problem text={problem} />
    </Section>
  )
}

function Recheck({
  t,
  fetchImpl,
  view,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  view: CaseView
  onDone: () => Promise<void>
}) {
  const send = useSend(fetchImpl)
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  async function submit(e: FormEvent) {
    e.preventDefault()
    const r = await send(`/staff/cases/${view.id}/recheck`, { note: note.trim() }, { version: view.version })
    if (!r.ok) return setProblem(caseError(t, r.error))
    setProblem(null)
    await onDone()
  }
  return (
    <form className="staff-loadout__form" onSubmit={(e) => void submit(e)} aria-label={t('cases.recheck.title')}>
      <Field
        label={t('cases.recheck.note')}
        hint={t('cases.recheck.hint')}
        name="recheckNote"
        multiline
        required
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <Problem text={problem} />
      <Button type="submit" variant="secondary">
        {t('cases.recheck.title')}
      </Button>
    </form>
  )
}

export function CasePage({
  t,
  locale,
  fetchImpl,
  caseId,
  href,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  caseId: string
  href: Href
}) {
  const [view, setView] = useState<CaseView | null>(null)
  const [section, setSection] = useState<RestrictedSection | null>(null)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'refused'>('loading')
  const when = whenOf(locale)
  const load = useCallback(async () => {
    const v = await call<CaseView>(fetchImpl, `/staff/cases/${encodeURIComponent(caseId)}`)
    const nextView = v.ok ? v.data : null
    // The restricted section: asked for only when the case view says this person may read it, or when the case view
    // is refused (the person who reported it, who reads only their own report).
    const wantRestricted = nextView ? Boolean(nextView.detail?.actions.restricted) : true
    const r = wantRestricted
      ? await call<RestrictedSection>(fetchImpl, `/staff/cases/${encodeURIComponent(caseId)}/restricted`)
      : null
    setView(nextView)
    setSection(r?.ok ? r.data : null)
    setPhase(nextView || r?.ok ? 'ready' : 'refused')
  }, [fetchImpl, caseId])
  useEffect(() => {
    void load()
  }, [load])
  const staff = useAssignees(fetchImpl, Boolean(view?.detail?.actions.manage))
  if (phase === 'loading') return <StateView kind="loading" title={t('cases.loading')} />
  if (phase === 'refused') return <StateView kind="blocked" title={t('cases.refused')} />
  const d = view?.detail ?? null
  const number = view?.number ?? section?.number ?? 0
  const state = view?.state ?? section?.state ?? ''
  return (
    <article className="staff-screen" aria-labelledby="case-title" data-testid="case-page">
      <h1 id="case-title" className="hh-h3">
        {t('cases.number', { number })}{' '}
        <StatusBadge tone={STATE_TONE(state)}>
          <span data-testid="case-state">{codeLabel(t, 'caseState', state)}</span>
        </StatusBadge>
      </h1>
      <p data-testid="case-kind">
        {view ? kindText(t, view) : section ? codeLabel(t, 'caseKind', section.kind) : null} ·{' '}
        {t('cases.project', { reference: view?.projectReference ?? section?.projectReference ?? '' })}
      </p>
      {view && !d ? <StateView kind="blocked" title={t('cases.statusOnly')} /> : null}
      {section ? <Restricted t={t} locale={locale} fetchImpl={fetchImpl} section={section} onChanged={load} /> : null}
      {view && d ? (
        <>
          <Section title={t('cases.handling.title')} testId="case-handling">
            <dl className="staff-system__fields">
              {d.category ? (
                <div>
                  <dt>{t('cases.field.category')}</dt>
                  <dd>{codeLabel(t, 'complaintCategory', d.category)}</dd>
                </div>
              ) : null}
              <div>
                <dt>{t('cases.field.severity')}</dt>
                <dd>{d.severity ? codeLabel(t, 'caseSeverity', d.severity) : t('cases.notSet')}</dd>
              </div>
              <div>
                <dt>{t('cases.field.source')}</dt>
                <dd>{codeLabel(t, 'caseSource', d.source)}</dd>
              </div>
              {d.reportedBy ? (
                <div>
                  <dt>{t('cases.field.reportedBy')}</dt>
                  <dd>{nameOf(t, d.reportedBy)}</dd>
                </div>
              ) : null}
              <div>
                <dt>{t('cases.field.assignedTo')}</dt>
                <dd>{nameOf(t, d.assignedTo)}</dd>
              </div>
              <div>
                <dt>{t('cases.field.dueOn')}</dt>
                <dd>{d.dueOn ?? t('cases.notSet')}</dd>
              </div>
              <div>
                <dt>{t('cases.field.reviewer')}</dt>
                <dd data-testid="case-reviewer">{nameOf(t, d.reviewer)}</dd>
              </div>
              <div>
                <dt>{t('cases.field.hold')}</dt>
                <dd>
                  {d.hold
                    ? `${codeLabel(t, 'holdKind', d.hold.kind)} · ${codeLabel(t, 'holdState', d.hold.state)}`
                    : t('cases.hold.none')}
                </dd>
              </div>
              {d.resolution ? (
                <div>
                  <dt>{t('cases.field.resolution')}</dt>
                  <dd>{d.resolution}</dd>
                </div>
              ) : null}
              {d.recheckRequired ? (
                <div>
                  <dt>{t('cases.field.recheck')}</dt>
                  <dd>{d.recheck ? `${d.recheck.note} (${when(d.recheck.at)})` : t('cases.recheck.pending')}</dd>
                </div>
              ) : null}
            </dl>
            {d.reviewAreas.length ? (
              <StateView kind="blocked" title={t('cases.review.title')}>
                <p data-testid="case-review-areas">
                  {t('cases.review.areas', {
                    areas: d.reviewAreas.map((a) => codeLabel(t, 'caseReviewArea', a)).join(', '),
                  })}
                </p>
              </StateView>
            ) : null}
            <p className="staff-request__hint">{t('cases.noFault')}</p>
            <div className="hh-button-row" data-testid="case-events">
              {d.actions.events.map((e) => (
                <EventButton
                  key={`${e}-${view.version}`}
                  t={t}
                  fetchImpl={fetchImpl}
                  view={view}
                  event={e}
                  onDone={load}
                />
              ))}
            </div>
            {d.actions.manage ? (
              <Handling
                key={view.version}
                t={t}
                fetchImpl={fetchImpl}
                view={view}
                detail={d}
                staff={staff}
                onDone={load}
              />
            ) : null}
            {d.actions.linkHold ? (
              <HoldLink key={`hold-${view.version}`} t={t} fetchImpl={fetchImpl} view={view} detail={d} onDone={load} />
            ) : null}
            {d.actions.recheck ? <Recheck t={t} fetchImpl={fetchImpl} view={view} onDone={load} /> : null}
          </Section>
          <FollowUps t={t} fetchImpl={fetchImpl} view={view} detail={d} staff={staff} onDone={load} />
          <CustomerUpdates t={t} locale={locale} fetchImpl={fetchImpl} view={view} detail={d} onDone={load} />
          <Referrals t={t} fetchImpl={fetchImpl} view={view} detail={d} onDone={load} />
          {!view.restricted ? (
            <Section title={t('cases.notes')} testId="case-notes">
              <ul className="staff-request__list">
                {d.notes.map((n) => (
                  <li key={n.id}>
                    <p className="staff-request__note">{n.body}</p>
                    <p className="staff-request__hint">
                      {n.source
                        ? `${codeLabel(t, 'caseNoteKind', n.kind)} · ${codeLabel(t, 'caseSource', n.source)} · `
                        : ''}
                      {t('cases.byAt', { name: nameOf(t, n.writtenBy), time: when(n.writtenAt) })}
                    </p>
                  </li>
                ))}
              </ul>
              {d.actions.manage ? (
                <NoteForm t={t} fetchImpl={fetchImpl} url={`/staff/cases/${view.id}/notes`} withSource onDone={load} />
              ) : null}
              <h3 className="hh-h5">{t('cases.photos')}</h3>
              <Photos
                t={t}
                locale={locale}
                fetchImpl={fetchImpl}
                base={`/staff/cases/${view.id}/attachments`}
                photos={d.attachments}
                canAdd={d.actions.manage}
                onChanged={load}
              />
            </Section>
          ) : null}
          <Section title={t('cases.history')} testId="case-history">
            <ol className="staff-request__list">
              {d.history.map((h, i) => (
                <li key={i}>
                  {codeLabel(t, 'caseEvent', h.event)} → {codeLabel(t, 'caseState', h.to)} ·{' '}
                  {t('cases.byAt', { name: nameOf(t, h.by), time: when(h.at) })}
                  {h.note ? <p className="staff-request__note">{h.note}</p> : null}
                </li>
              ))}
            </ol>
          </Section>
        </>
      ) : null}
      <p>
        <a href={href('/cases')}>{t('cases.back')}</a>
      </p>
    </article>
  )
}
