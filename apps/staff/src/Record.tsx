// A request's record (TSK-0042; HH-LEAD-01, HH-LEAD-02, HH-LEAD-08, HH-SVC-04, OWN-DEC-99, OWN-DEC-100, OWN-DEC-116,
// S02). The action queue's deep link and the requests list open it.
// - The original request, exactly as the customer sent it: read-only, with no edit control anywhere.
// - The handling beside it: next step, responsible staff member and reassignments, qualification, the four actions,
//   internal notes (staff only, never shown to customers) and the history of decisions.
// - TSK-0043: the first-response clock (an internal target in business hours, never a customer promise), recorded
//   customer conversations, the hazard flag on the risk flags and the review holds it opens.
// - TSK-0051: questions to the customer (Questions.tsx).
// - TSK-0068: the SOP version pinned on each work package (WorkPackageSop.tsx), opened on demand.
// The server decides every action (role, state, version); this screen only offers the ones it says are open now,
// sends the version it showed (If-Match) and an idempotency key, and shows a refusal's reasons or the conflict banner.
import { customerTranslator, type StaffKey, type StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { ConflictBanner, conflictOf, type Conflict } from './ConflictBanner'
import { ProjectEstimates } from './Estimates'
import { RequestQuestions } from './Questions'
import { codeLabel } from './Requests'
import { clockText, clockTime, type ResponseClock } from './ResponseClock'
import { ProjectVisitsSection } from './Visits'
import { WorkPackageSop } from './WorkPackageSop'

type T = (key: StaffKey, values?: Record<string, string | number>) => string
type StaffRef = { id: string; name: string | null }

const CHECKS = [
  'coverage',
  'service_fit',
  'essential_facts',
  'urgency',
  'site_visit_need',
  'staff_equipment',
  'risk_flags',
] as const
type Check = (typeof CHECKS)[number]
const OUTCOMES = ['ok', 'attention', 'not_checked'] as const
type Outcome = (typeof OUTCOMES)[number]
const CATEGORIES = ['coverage', 'outside_scope', 'specialist_assessment', 'other'] as const
const HAZARDS = ['hazardous_material', 'licensed_trade', 'structural', 'permit_licensing', 'other'] as const
type Hazard = (typeof HAZARDS)[number]
const CHANNELS = ['phone', 'in_person'] as const

export type Hold = {
  id: string
  kind: string
  category: string
  note: string
  state: 'open' | 'under_review' | 'resolved' | 'canceled_as_error'
  version: number
  raisedBy: StaffRef
  raisedAt: string
  reviewStartedBy: StaffRef | null
  reviewStartedAt: string | null
  resolutionNote: string | null
  reviewer: string | null
  resolvedBy: StaffRef | null
  resolvedAt: string | null
  cancelReason: string | null
  canceledBy: StaffRef | null
  canceledAt: string | null
  actions: { startReview: boolean; resolve: boolean; cancel: boolean }
}
/** The classes a staff note may have (TSK-0044, HH-STAFF-05): never customer-shared. */
const NOTE_CLASSES = ['internal_operational', 'restricted_incident', 'restricted_financial'] as const

export type RequestDetail = {
  id: string
  reference: string
  state: string
  version: number
  submittedAt: string
  privacyNoticeVersion: string
  spam: { suspected: boolean; signals: string[] }
  project: { id: string; reference: string; state: string }
  original: {
    services: { serviceId: string; code: string; notes: string | null }[]
    notSure: boolean
    otherServicesText: string | null
    description: string | null
    answers: {
      serviceCode: string | null
      question: string
      label: string | null
      kind: 'number' | 'text' | 'unknown'
      number: number | null
      text: string | null
      unit: string | null
      approximate: boolean
    }[]
    property: { street: string; unit: string | null; city: string; state: string; zip: string; propertyType: string }
    timing: { preferredDate: string | null; flexible: boolean; needHelpToday: boolean; windows: string[] }
    estimatePreference: string
    preferredChannel: string
    smsOptIn: boolean
    marketingOptIn: boolean
    contact: { fullName: string; email: string; phone: string }
  }
  /** The badges describe the contact's current values; a verified Change Contact (TSK-0033) can differ from those sent. */
  contactVerification: { email: string; phone: string; current: { email: string; phone: string } }
  coverage: { result: string; ruleSet: number | null }
  responsibleStaff: StaffRef | null
  assignments: { staff: StaffRef; previous: StaffRef | null; by: StaffRef; at: string }[]
  qualification: {
    revision: number
    checks: Partial<Record<Check, { outcome: Outcome; note?: string | null; hazards?: Hazard[] | null }>>
    recordedBy: StaffRef
    recordedAt: string
  } | null
  missingChecks: string[]
  /** TSK-0044 (HH-STAFF-05): each note's visibility class; a restricted note the role may not read arrives masked. */
  notes: {
    id: string
    visibility: string
    masked: boolean
    body: string | null
    author: StaffRef | null
    createdAt: string
  }[]
  customer: { id: string; displayName: string }
  decisions: {
    id: string
    action: string
    fromState: string
    toState: string
    projectToState: string | null
    reasonCategory: string | null
    customerText: string | null
    customerMessage: string | null
    internalNote: string | null
    decidedBy: StaffRef
    decidedAt: string
  }[]
  workPackages: { id: string; serviceId: string; code: string; position: number; state: string }[]
  nextStep: string
  followUpDueAt: string | null
  responseClock: ResponseClock | null
  conversations: {
    id: string
    channel: string
    outcome: string
    occurredAt: string
    recordedBy: StaffRef
    recordedAt: string
  }[]
  holds: Hold[]
  estimateBlockedByHolds: boolean
  actions: {
    askQuestion: boolean
    prepareOnlineEstimate: boolean
    arrangeEstimateVisit: boolean
    notAFit: boolean
    assign: boolean
    qualify: boolean
    addNote: boolean
    /** TSK-0046: link the request to another customer or correct its link (with a preview and a reason). */
    relink?: boolean
    recordConversation: boolean
  }
  serviceCatalog: { id: string; code: string }[]
}
type Photo = { id: string; state: string; contentType: string; url: string | null }

/** What went wrong with a write: a stale version (banner), a refusal with its reasons, or another error. */
type Problem =
  { kind: 'stale'; conflict: Conflict } | { kind: 'refused'; codes: string[] } | { kind: 'error'; code: string }

function problemOf(error: ApiErrorBody): Problem {
  const conflict = conflictOf(error)
  if (conflict) return { kind: 'stale', conflict }
  if (error.code === 'CONFLICT') return { kind: 'refused', codes: error.fieldErrors.map((f) => f.code) }
  return { kind: 'error', code: error.code }
}

/** The contact's current email is the one sent, whatever its case (TSK-0033). */
const sameEmail = (sent: string, current: string) => sent.trim().toLowerCase() === current.trim().toLowerCase()
const phoneDigits = (p: string) => {
  const d = p.replace(/\D/g, '')
  return d.length === 11 && d.startsWith('1') ? d.slice(1) : d
}
/** The contact's current number (E.164) is the one sent, however it was typed. */
const samePhone = (sent: string, current: string) => phoneDigits(sent) === phoneDigits(current)

const name = (t: T, s: StaffRef | null) => (s ? (s.name ?? t('queue.unnamed')) : t('queue.unassigned'))

/** One write, with its idempotency key kept until it succeeds (a retry of the same submission is answered once). */
function useWrite(fetchImpl: Fetch) {
  const keys = useRef(new Map<string, string>())
  return useCallback(
    async (path: string, method: 'POST' | 'PUT', body: unknown, version?: number) => {
      const slot = `${method} ${path}`
      const k = keys.current.get(slot) ?? idempotencyKey()
      keys.current.set(slot, k)
      const r = await call<unknown>(fetchImpl, path, {
        method,
        body,
        headers: { 'idempotency-key': k, ...(version === undefined ? {} : { 'if-match': `"${version}"` }) },
      })
      if (r.ok || r.status < 500) keys.current.delete(slot)
      return r
    },
    [fetchImpl],
  )
}

export function RequestRecord({
  t,
  locale,
  fetchImpl,
  id,
  go,
  href,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  id: string
  go: (to: string) => void
  href: (to: string) => string
}) {
  const [view, setView] = useState<RequestDetail | null | undefined>(undefined)
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  const load = useCallback(async () => {
    const r = await call<RequestDetail>(fetchImpl, `/staff/requests/${encodeURIComponent(id)}`)
    setView(r.ok && typeof r.data?.reference === 'string' ? r.data : null)
  }, [fetchImpl, id])
  useEffect(() => {
    void load()
    void call<{ photos: Photo[] }>(fetchImpl, `/staff/requests/${encodeURIComponent(id)}/photos`).then((r) =>
      setPhotos(r.ok && Array.isArray(r.data?.photos) ? r.data.photos : []),
    )
  }, [load, fetchImpl, id])

  const back = (
    <a
      href={href('/')}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        go('/')
      }}
    >
      {t('record.back')}
    </a>
  )
  if (view === undefined) return <StateView kind="loading" title={t('common.loading')} />
  if (view === null)
    return (
      <section className="staff-screen">
        <StateView kind="blocked" title={t('record.notFound')} />
        <p>{back}</p>
      </section>
    )
  const fmt = new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const when = (iso: string) => fmt.format(new Date(iso))
  return (
    <section className="staff-screen staff-request" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('record.request.heading', { reference: view.reference })}
      </h1>
      <dl className="staff-record">
        <dt>{t('record.request.status')}</dt>
        <dd>
          <StatusBadge>{codeLabel(t, 'requestState', view.state)}</StatusBadge>
        </dd>
        <dt>{t('customer.record')}</dt>
        <dd>
          <a
            href={href(`/customers/${view.customer.id}`)}
            onClick={(e: MouseEvent<HTMLAnchorElement>) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
              e.preventDefault()
              go(`/customers/${view.customer.id}`)
            }}
          >
            {view.customer.displayName}
          </a>
          {view.actions.relink ? (
            <>
              {' · '}
              <a
                href={href(`/requests/${view.id}/relink`)}
                onClick={(e: MouseEvent<HTMLAnchorElement>) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                  e.preventDefault()
                  go(`/requests/${view.id}/relink`)
                }}
              >
                {t('customer.relinkRequest')}
              </a>
            </>
          ) : null}
        </dd>
        <dt>{t('request.project')}</dt>
        <dd>
          {codeLabel(t, 'projectState', view.project.state)}
          {/* TSK-0050: the project's customer conversation and its reply composer. */}
          {' · '}
          <a
            href={href(`/inbox/${view.project.id}`)}
            onClick={(e: MouseEvent<HTMLAnchorElement>) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
              e.preventDefault()
              go(`/inbox/${view.project.id}`)
            }}
          >
            {t('inbox.openProjectConversation')}
          </a>
        </dd>
        <dt>{t('request.nextStep')}</dt>
        <dd>{codeLabel(t, 'requestNextStep', view.nextStep)}</dd>
        <dt>{t('record.request.responsible')}</dt>
        <dd>{name(t, view.responsibleStaff)}</dd>
        <dt>{t('request.followUpDue')}</dt>
        <dd>{view.followUpDueAt ? when(view.followUpDueAt) : t('request.followUpNone')}</dd>
        {view.responseClock ? (
          <>
            <dt>{t('request.responseTarget')}</dt>
            <dd data-testid="response-clock">
              {clockText(t, view.responseClock, (iso) => clockTime(locale, view.responseClock as ResponseClock, iso))}{' '}
              <span className="staff-request__hint">({t('queue.responseTarget')})</span>
            </dd>
          </>
        ) : null}
        <dt>{t('record.request.submitted')}</dt>
        <dd>{when(view.submittedAt)}</dd>
      </dl>
      {view.spam.suspected ? (
        <StateView kind="blocked" title={t('request.spamFlagged')}>
          <p>{t('request.spamHint')}</p>
        </StateView>
      ) : null}
      <Original t={t} view={view} photos={photos} />
      <Responsible t={t} fetchImpl={fetchImpl} view={view} onChanged={load} when={when} />
      <FirstResponse t={t} locale={locale} fetchImpl={fetchImpl} view={view} onChanged={load} when={when} />
      <Qualification t={t} fetchImpl={fetchImpl} view={view} onChanged={load} when={when} />
      <Holds t={t} fetchImpl={fetchImpl} view={view} onChanged={load} when={when} />
      <Actions t={t} fetchImpl={fetchImpl} view={view} onChanged={load} />
      {/* TSK-0051: questions to the customer, their replies and reminders, and "Closed—no response". */}
      <RequestQuestions
        key={view.id}
        t={t}
        locale={locale}
        fetchImpl={fetchImpl}
        requestId={view.id}
        requestVersion={view.version}
        onChanged={load}
      />
      {/* TSK-0053: the project's estimates and Write an Estimate, for the roles that write estimates. */}
      <ProjectEstimates
        key={`${view.project.id}-${view.version}`}
        t={t}
        fetchImpl={fetchImpl}
        projectId={view.project.id}
        go={go}
        href={href}
      />
      {/* TSK-0061: the project's visits (tentative estimate and work visits), for the roles that see the schedule. */}
      <ProjectVisitsSection
        key={`visits-${view.project.id}-${view.version}`}
        t={t}
        locale={locale}
        fetchImpl={fetchImpl}
        projectId={view.project.id}
        href={href}
      />
      <Notes t={t} fetchImpl={fetchImpl} view={view} onChanged={load} when={when} />
      <History t={t} view={view} when={when} />
      <SopChecklists t={t} locale={locale} fetchImpl={fetchImpl} view={view} when={when} />
      <p>{back}</p>
    </section>
  )
}

/** TSK-0068 (HH-PKT-03): the SOP version pinned on each work package, opened on demand. */
function SopChecklists({
  t,
  locale,
  fetchImpl,
  view,
  when,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  view: RequestDetail
  when: (iso: string) => string
}) {
  const ids = useId()
  if (view.workPackages.length === 0) return null
  return (
    <Section id={`${ids}-sops`} title={t('sop.title')}>
      <ol className="staff-request__list">
        {view.workPackages.map((w) => (
          <li key={w.id} data-work-package={w.code}>
            <h3>{codeLabel(t, 'service', w.code)}</h3>
            <WorkPackageSop t={t} locale={locale} fetchImpl={fetchImpl} workPackageId={w.id} when={when} />
          </li>
        ))}
      </ol>
    </Section>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="staff-request__section" aria-labelledby={id}>
      <h2 id={id} className="staff-queue__heading">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Original({ t, view, photos }: { t: T; view: RequestDetail; photos: Photo[] | null }) {
  const ids = useId()
  const o = view.original
  const yes = (b: boolean) => (b ? t('request.yes') : t('request.no'))
  const answer = (a: RequestDetail['original']['answers'][number]) => {
    if (a.kind === 'unknown') return t('request.answerUnknown')
    if (a.kind === 'text') return a.text ?? ''
    const value = `${a.number ?? ''}${a.unit ? ` ${a.unit}` : ''}`
    return a.approximate ? t('request.approximately', { value }) : value
  }
  const p = o.property
  return (
    <Section id={`${ids}-original`} title={t('request.original')}>
      <p className="staff-request__hint">{t('request.originalHint')}</p>
      <dl className="staff-record" data-testid="original-request">
        <dt>{t('record.request.services')}</dt>
        <dd>
          {o.services.length ? (
            <ul className="staff-request__list">
              {o.services.map((s) => (
                <li key={s.serviceId}>
                  {codeLabel(t, 'service', s.code)}
                  {s.notes ? ` — ${s.notes}` : ''}
                </li>
              ))}
            </ul>
          ) : (
            t('request.noServices')
          )}
        </dd>
        {o.notSure ? (
          <>
            <dt>{t('request.notSure')}</dt>
            <dd>{t('request.yes')}</dd>
          </>
        ) : null}
        {o.otherServicesText ? (
          <>
            <dt>{t('request.otherWork')}</dt>
            <dd>{o.otherServicesText}</dd>
          </>
        ) : null}
        <dt>{t('request.description')}</dt>
        <dd>{o.description ?? t('request.none')}</dd>
        <dt>{t('request.answers')}</dt>
        <dd>
          {o.answers.length ? (
            <ul className="staff-request__list">
              {o.answers.map((a) => (
                <li key={`${a.serviceCode ?? ''}-${a.question}`}>
                  {a.label ?? a.question}: {answer(a)}
                </li>
              ))}
            </ul>
          ) : (
            t('request.none')
          )}
        </dd>
        <dt>{t('request.address')}</dt>
        <dd>
          {p.street}
          {p.unit ? `, ${p.unit}` : ''}, {p.city}, {p.state} {p.zip} ({codeLabel(t, 'propertyType', p.propertyType)})
        </dd>
        <dt>{t('request.coverage')}</dt>
        <dd>{codeLabel(t, 'coverageResult', view.coverage.result)}</dd>
        <dt>{t('request.timing')}</dt>
        <dd>
          {o.timing.flexible || !o.timing.preferredDate
            ? t('request.flexible')
            : t('request.preferredDate', { date: o.timing.preferredDate })}
          {o.timing.windows.length ? ` · ${o.timing.windows.map((w) => codeLabel(t, 'timeWindow', w)).join(', ')}` : ''}
          {o.timing.needHelpToday ? ` · ${t('request.needHelpToday')}` : ''}
        </dd>
        <dt>{t('request.estimatePreference')}</dt>
        <dd>{codeLabel(t, 'estimatePreference', o.estimatePreference)}</dd>
        <dt>{t('request.contact')}</dt>
        <dd>
          <span className="staff-request__contact">{o.contact.fullName}</span>
          <span className="staff-request__contact">
            {o.contact.email}{' '}
            {sameEmail(o.contact.email, view.contactVerification.current.email) ? null : (
              <>{t('request.contactCurrent', { value: view.contactVerification.current.email })} </>
            )}
            <StatusBadge tone={view.contactVerification.email === 'verified' ? 'success' : 'neutral'}>
              {t('request.emailBadge', { state: codeLabel(t, 'verificationState', view.contactVerification.email) })}
            </StatusBadge>
          </span>
          <span className="staff-request__contact">
            {o.contact.phone}{' '}
            {samePhone(o.contact.phone, view.contactVerification.current.phone) ? null : (
              <>{t('request.contactCurrent', { value: view.contactVerification.current.phone })} </>
            )}
            <StatusBadge tone={view.contactVerification.phone === 'verified' ? 'success' : 'neutral'}>
              {t('request.phoneBadge', { state: codeLabel(t, 'verificationState', view.contactVerification.phone) })}
            </StatusBadge>
          </span>
        </dd>
        <dt>{t('request.preferredChannel')}</dt>
        <dd>{codeLabel(t, 'contactChannel', o.preferredChannel)}</dd>
        <dt>{t('request.smsOptIn')}</dt>
        <dd>{yes(o.smsOptIn)}</dd>
        <dt>{t('request.marketingOptIn')}</dt>
        <dd>{yes(o.marketingOptIn)}</dd>
        <dt>{t('request.photos')}</dt>
        <dd>
          {photos === null ? (
            t('common.loading')
          ) : photos.length === 0 ? (
            t('request.none')
          ) : (
            <ul className="staff-request__photos">
              {photos.map((ph, i) => (
                <li key={ph.id}>
                  {ph.url ? (
                    <a href={ph.url} target="_blank" rel="noreferrer">
                      {t('request.photoN', { n: i + 1 })}
                    </a>
                  ) : (
                    t('request.photoN', { n: i + 1 })
                  )}{' '}
                  <StatusBadge tone={ph.state === 'ready' ? 'success' : ph.state === 'rejected' ? 'danger' : 'info'}>
                    {codeLabel(t, 'photoState', ph.state)}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </dd>
        <dt>{t('request.privacyNotice')}</dt>
        <dd>{view.privacyNoticeVersion}</dd>
      </dl>
    </Section>
  )
}

function ProblemView({ t, problem, onReload }: { t: T; problem: Problem | null; onReload: () => void }) {
  if (!problem) return null
  if (problem.kind === 'stale')
    return (
      <ConflictBanner
        t={t}
        conflict={problem.conflict}
        fields={[
          { name: 'state', label: t('record.request.status'), yours: undefined },
          { name: 'responsibleStaffId', label: t('record.request.responsible'), yours: undefined },
        ]}
        onUseCurrent={onReload}
        onRedo={onReload}
      />
    )
  if (problem.kind === 'refused')
    return (
      <StateView
        kind="blocked"
        title={t('request.refused')}
        reasons={problem.codes.map((c) => codeLabel(t, 'requestRefusal', c))}
      />
    )
  return <StateView kind="error" title={t('request.saveFailed')} />
}

type Props = { t: T; fetchImpl: Fetch; view: RequestDetail; onChanged: () => Promise<void> }

function Responsible({ t, fetchImpl, view, onChanged, when }: Props & { when: (iso: string) => string }) {
  const ids = useId()
  const write = useWrite(fetchImpl)
  const [staff, setStaff] = useState<StaffRef[] | null>(null)
  const [choice, setChoice] = useState(view.responsibleStaff?.id ?? '')
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  useEffect(() => {
    if (!view.actions.assign) return
    void call<{ staff: StaffRef[] }>(fetchImpl, '/staff/requests/assignees').then((r) =>
      setStaff(r.ok ? r.data.staff : []),
    )
  }, [fetchImpl, view.actions.assign])
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!choice) return
    setPending(true)
    const r = await write(`/staff/requests/${view.id}/responsible`, 'PUT', { staffUserId: choice }, view.version)
    setPending(false)
    setProblem(r.ok ? null : problemOf(r.error))
    if (r.ok) await onChanged()
  }
  return (
    <Section id={`${ids}-responsible`} title={t('record.request.responsible')}>
      {view.actions.assign && staff ? (
        <form className="staff-queue__filters" onSubmit={(e) => void submit(e)}>
          <div className="staff-queue__select">
            <label htmlFor={`${ids}-who`}>{t('request.assignLabel')}</label>
            <select id={`${ids}-who`} value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">{t('request.assignChoose')}</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {name(t, s)}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary" pending={pending}>
            {t('request.assign')}
          </Button>
        </form>
      ) : null}
      <ProblemView t={t} problem={problem} onReload={() => void onChanged().then(() => setProblem(null))} />
      {view.assignments.length ? (
        <ul className="staff-request__list">
          {view.assignments.map((a, i) => (
            <li key={`${a.at}-${i}`}>
              {t('request.assignedEntry', { name: name(t, a.staff), by: name(t, a.by), time: when(a.at) })}
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  )
}

function Qualification({ t, fetchImpl, view, onChanged, when }: Props & { when: (iso: string) => string }) {
  const ids = useId()
  const write = useWrite(fetchImpl)
  const initial = () =>
    Object.fromEntries(
      CHECKS.map((c) => [
        c,
        {
          outcome: view.qualification?.checks[c]?.outcome ?? 'not_checked',
          note: view.qualification?.checks[c]?.note ?? '',
          hazards: view.qualification?.checks[c]?.hazards ?? [],
        },
      ]),
    ) as Record<Check, { outcome: Outcome; note: string; hazards: Hazard[] }>
  const [checks, setChecks] = useState(initial)
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [saved, setSaved] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    setPending(true)
    const body = {
      checks: Object.fromEntries(
        CHECKS.map((c) => [
          c,
          {
            outcome: checks[c].outcome,
            ...(checks[c].note.trim() ? { note: checks[c].note } : {}),
            // The hazard flag (HH-LEAD-04): only risk flags needing attention name hazards.
            ...(c === 'risk_flags' && checks[c].outcome === 'attention' && checks[c].hazards.length
              ? { hazards: checks[c].hazards }
              : {}),
          },
        ]),
      ),
    }
    const r = await write(`/staff/requests/${view.id}/qualification`, 'PUT', body, view.qualification?.revision ?? 0)
    setPending(false)
    setProblem(r.ok ? null : problemOf(r.error))
    setSaved(r.ok)
    if (r.ok) await onChanged()
  }
  return (
    <Section id={`${ids}-qualification`} title={t('request.qualification')}>
      <p className="staff-request__hint">{t('request.qualificationHint')}</p>
      {view.qualification ? (
        <p className="staff-request__hint">
          {t('request.qualificationRecorded', {
            name: name(t, view.qualification.recordedBy),
            time: when(view.qualification.recordedAt),
          })}
        </p>
      ) : null}
      <form className="staff-request__form" onSubmit={(e) => void submit(e)}>
        {CHECKS.map((c) => (
          <fieldset key={c} className="staff-request__check">
            <legend>{codeLabel(t, 'qualificationCheck', c)}</legend>
            <div className="staff-request__outcomes">
              {OUTCOMES.map((o) => (
                <label key={o}>
                  <input
                    type="radio"
                    name={`${ids}-${c}`}
                    value={o}
                    checked={checks[c].outcome === o}
                    disabled={!view.actions.qualify}
                    onChange={() => setChecks({ ...checks, [c]: { ...checks[c], outcome: o } })}
                  />{' '}
                  {codeLabel(t, 'qualificationOutcome', o)}
                </label>
              ))}
            </div>
            <Field
              label={t('request.checkNote')}
              value={checks[c].note}
              maxLength={1000}
              readOnly={!view.actions.qualify}
              onChange={(e) => setChecks({ ...checks, [c]: { ...checks[c], note: e.target.value } })}
            />
            {c === 'risk_flags' && checks[c].outcome === 'attention' ? (
              <fieldset className="staff-request__check">
                <legend>{t('request.hazards')}</legend>
                <p className="staff-request__hint">{t('request.hazardsHint')}</p>
                {HAZARDS.map((h) => (
                  <label key={h} className="staff-request__package">
                    <input
                      type="checkbox"
                      checked={checks[c].hazards.includes(h)}
                      disabled={!view.actions.qualify}
                      onChange={(e) => {
                        const on = e.target.checked
                        const hazards = on ? [...checks[c].hazards, h] : checks[c].hazards.filter((x) => x !== h)
                        setChecks({ ...checks, [c]: { ...checks[c], hazards } })
                      }}
                    />{' '}
                    {codeLabel(t, 'hazardCategory', h)}
                  </label>
                ))}
              </fieldset>
            ) : null}
          </fieldset>
        ))}
        {view.actions.qualify ? (
          <Button type="submit" variant="secondary" pending={pending}>
            {t('request.saveQualification')}
          </Button>
        ) : null}
      </form>
      {saved ? <StateView kind="success" title={t('request.qualificationSaved')} /> : null}
      <ProblemView t={t} problem={problem} onReload={() => void onChanged().then(() => setProblem(null))} />
    </Section>
  )
}

type ActionName = 'ask_question' | 'prepare_online_estimate' | 'arrange_estimate_visit' | 'not_a_fit'
const ACTION_PATHS: Record<ActionName, string> = {
  ask_question: 'ask-question',
  prepare_online_estimate: 'online-estimate',
  arrange_estimate_visit: 'estimate-visit',
  not_a_fit: 'not-a-fit',
}

function Actions({ t, fetchImpl, view, onChanged }: Props) {
  const ids = useId()
  const write = useWrite(fetchImpl)
  const [open, setOpen] = useState<ActionName | null>(null)
  const [packages, setPackages] = useState<string[]>(() =>
    view.workPackages.length
      ? view.workPackages.map((w) => w.serviceId)
      : view.original.services.map((s) => s.serviceId),
  )
  const [extra, setExtra] = useState('')
  const [explanation, setExplanation] = useState('')
  const [category, setCategory] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const a = view.actions
  const available: Record<ActionName, boolean> = {
    ask_question: a.askQuestion,
    prepare_online_estimate: a.prepareOnlineEstimate,
    arrange_estimate_visit: a.arrangeEstimateVisit,
    not_a_fit: a.notAFit,
  }
  const codeOf = new Map(view.serviceCatalog.map((s) => [s.id, s.code]))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!open) return
    const internalNote = note.trim() ? { internalNote: note } : {}
    const body =
      open === 'ask_question'
        ? internalNote
        : open === 'prepare_online_estimate'
          ? { workPackages: packages, ...internalNote }
          : open === 'arrange_estimate_visit'
            ? { customerExplanation: explanation, workPackages: packages, ...internalNote }
            : { category, customerReason: reason, ...internalNote }
    setPending(true)
    const r = await write(`/staff/requests/${view.id}/actions/${ACTION_PATHS[open]}`, 'POST', body, view.version)
    setPending(false)
    if (!r.ok) return setProblem(problemOf(r.error))
    setProblem(null)
    setDone((r.data as { outcome?: string }).outcome === 'routed_to_owner' ? 'routed' : open)
    setOpen(null)
    setNote('')
    await onChanged()
  }

  const preview =
    reason.trim() !== ''
      ? // Customer text is English whatever the staff locale (RULE-LANGUAGES), in the owner's wording (OWN-DEC-100).
        customerTranslator().t('decision.notAFit.customerMessage', { reason: reason.trim().replace(/[.!\s]+$/, '') })
      : null
  return (
    <Section id={`${ids}-actions`} title={t('request.actions')}>
      <p className="staff-request__hint">
        {t('request.customerPreference', {
          preference: codeLabel(t, 'estimatePreference', view.original.estimatePreference),
        })}
      </p>
      <div className="hh-button-row staff-request__actions">
        {(Object.keys(ACTION_PATHS) as ActionName[]).map((name) => (
          <Button
            key={name}
            variant={open === name ? 'primary' : 'secondary'}
            aria-expanded={open === name}
            {...(available[name]
              ? {}
              : {
                  disabledReason:
                    view.estimateBlockedByHolds &&
                    (name === 'prepare_online_estimate' || name === 'arrange_estimate_visit')
                      ? t('request.estimateBlocked')
                      : t('request.actionUnavailable'),
                })}
            onClick={() => {
              setOpen(open === name ? null : name)
              setProblem(null)
              setDone(null)
            }}
          >
            {codeLabel(t, 'requestDecision', name)}
          </Button>
        ))}
      </div>
      {done ? (
        <StateView kind="success" title={done === 'routed' ? t('request.routedToOwner') : t('request.actionDone')} />
      ) : null}
      {open ? (
        <form
          className="staff-request__form"
          onSubmit={(e) => void submit(e)}
          aria-label={codeLabel(t, 'requestDecision', open)}
        >
          {open === 'ask_question' ? <p className="staff-request__hint">{t('request.askHint')}</p> : null}
          {open === 'prepare_online_estimate' || open === 'arrange_estimate_visit' ? (
            <fieldset className="staff-request__check">
              <legend>{t('request.workPackages')}</legend>
              <p className="staff-request__hint">{t('request.workPackagesHint')}</p>
              {packages.map((sid) => (
                <label key={sid} className="staff-request__package">
                  <input
                    type="checkbox"
                    checked
                    disabled={view.workPackages.some((w) => w.serviceId === sid)}
                    onChange={() => setPackages(packages.filter((p) => p !== sid))}
                  />{' '}
                  {codeLabel(t, 'service', codeOf.get(sid) ?? sid)}
                </label>
              ))}
              <div className="staff-queue__select">
                <label htmlFor={`${ids}-extra`}>{t('request.addService')}</label>
                <select
                  id={`${ids}-extra`}
                  value={extra}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v && !packages.includes(v)) setPackages([...packages, v])
                    setExtra('')
                  }}
                >
                  <option value="">{t('request.addServiceChoose')}</option>
                  {view.serviceCatalog
                    .filter((s) => !packages.includes(s.id))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {codeLabel(t, 'service', s.code)}
                      </option>
                    ))}
                </select>
              </div>
            </fieldset>
          ) : null}
          {open === 'arrange_estimate_visit' ? (
            <>
              <Field
                multiline
                label={t('request.visitExplanation')}
                hint={t('request.visitExplanationHint')}
                required
                requiredText={t('request.required')}
                maxLength={1000}
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
              />
              <p className="staff-request__hint">{t('request.visitHint')}</p>
            </>
          ) : null}
          {open === 'prepare_online_estimate' ? <p className="staff-request__hint">{t('request.onlineHint')}</p> : null}
          {open === 'not_a_fit' ? (
            <>
              <div className="staff-queue__select">
                <label htmlFor={`${ids}-category`}>{t('request.category')}</label>
                <select id={`${ids}-category`} required value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">{t('request.categoryChoose')}</option>
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {codeLabel(t, 'notAFitCategory', c)}
                    </option>
                  ))}
                </select>
              </div>
              <Field
                multiline
                label={t('request.customerReason')}
                hint={t('request.customerReasonHint')}
                required
                requiredText={t('request.required')}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              {preview ? (
                <div className="staff-request__preview">
                  <p className="staff-request__hint">{t('request.customerSees')}</p>
                  <blockquote lang="en">{preview}</blockquote>
                </div>
              ) : null}
              <p className="staff-request__hint">{t('request.notAFitHint')}</p>
            </>
          ) : null}
          <Field
            multiline
            label={t('request.internalNote')}
            hint={t('request.internalNoteHint')}
            maxLength={5000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="hh-button-row">
            <Button type="submit" pending={pending}>
              {t('request.confirm', { action: codeLabel(t, 'requestDecision', open) })}
            </Button>
            <Button variant="quiet" onClick={() => setOpen(null)}>
              {t('request.cancel')}
            </Button>
          </div>
        </form>
      ) : null}
      <ProblemView t={t} problem={problem} onReload={() => void onChanged().then(() => setProblem(null))} />
    </Section>
  )
}

function FirstResponse({
  t,
  locale,
  fetchImpl,
  view,
  onChanged,
  when,
}: Props & { locale: StaffLocale; when: (iso: string) => string }) {
  const ids = useId()
  const write = useWrite(fetchImpl)
  const [channel, setChannel] = useState('')
  const [outcome, setOutcome] = useState('')
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [saved, setSaved] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!channel || !outcome.trim()) return
    setPending(true)
    const r = await write(`/staff/requests/${view.id}/conversations`, 'POST', { channel, outcome })
    setPending(false)
    if (!r.ok) return setProblem(problemOf(r.error))
    setProblem(null)
    setSaved(true)
    setChannel('')
    setOutcome('')
    await onChanged()
  }
  return (
    <Section id={`${ids}-first-response`} title={t('request.firstResponse')}>
      <p className="staff-request__hint">{t('request.firstResponseHint')}</p>
      {view.responseClock ? (
        <p>
          <StatusBadge
            tone={
              view.responseClock.state === 'overdue'
                ? 'danger'
                : view.responseClock.state === 'stopped'
                  ? 'success'
                  : 'info'
            }
          >
            {codeLabel(t, 'responseClockState', view.responseClock.state)}
          </StatusBadge>{' '}
          {clockText(t, view.responseClock, (iso) => clockTime(locale, view.responseClock as ResponseClock, iso))}
        </p>
      ) : null}
      {view.conversations.length ? (
        <ul className="staff-request__list">
          {view.conversations.map((c) => (
            <li key={c.id}>
              <p className="staff-request__note">{c.outcome}</p>
              <p className="staff-request__hint">
                {t('request.conversationEntry', {
                  channel: codeLabel(t, 'conversationChannel', c.channel),
                  time: when(c.occurredAt),
                  name: name(t, c.recordedBy),
                })}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('request.noConversations')}</p>
      )}
      {view.actions.recordConversation ? (
        <form
          className="staff-request__form"
          onSubmit={(e) => void submit(e)}
          aria-label={t('request.recordConversation')}
        >
          <div className="staff-queue__select">
            <label htmlFor={`${ids}-channel`}>{t('request.conversationChannel')}</label>
            <select id={`${ids}-channel`} required value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="">{t('request.conversationChannelChoose')}</option>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {codeLabel(t, 'conversationChannel', c)}
                </option>
              ))}
            </select>
          </div>
          <Field
            multiline
            label={t('request.conversationOutcome')}
            hint={t('request.conversationOutcomeHint')}
            required
            requiredText={t('request.required')}
            maxLength={1000}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          />
          <Button type="submit" variant="secondary" pending={pending}>
            {t('request.recordConversation')}
          </Button>
        </form>
      ) : null}
      {saved ? <StateView kind="success" title={t('request.conversationSaved')} /> : null}
      <ProblemView t={t} problem={problem} onReload={() => void onChanged().then(() => setProblem(null))} />
    </Section>
  )
}

function Holds({ t, fetchImpl, view, onChanged, when }: Props & { when: (iso: string) => string }) {
  const ids = useId()
  return (
    <Section id={`${ids}-holds`} title={t('request.holds')}>
      <p className="staff-request__hint">{t('request.holdsHint')}</p>
      {view.estimateBlockedByHolds ? <StateView kind="blocked" title={t('request.estimateBlocked')} /> : null}
      {view.holds.length === 0 ? (
        <p>{t('request.noHolds')}</p>
      ) : (
        <ol className="staff-request__list">
          {view.holds.map((h) => (
            <HoldItem key={h.id} t={t} fetchImpl={fetchImpl} hold={h} onChanged={onChanged} when={when} />
          ))}
        </ol>
      )}
    </Section>
  )
}

function HoldItem({
  t,
  fetchImpl,
  hold,
  onChanged,
  when,
}: {
  t: T
  fetchImpl: Fetch
  hold: Hold
  onChanged: () => Promise<void>
  when: (iso: string) => string
}) {
  const ids = useId()
  const write = useWrite(fetchImpl)
  const [open, setOpen] = useState<'resolve' | 'cancel' | null>(null)
  const [note, setNote] = useState('')
  const [reviewer, setReviewer] = useState('')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  async function act(path: 'start-review' | 'resolve' | 'cancel', body: unknown) {
    setPending(true)
    const r = await write(`/staff/holds/${hold.id}/actions/${path}`, 'POST', body, hold.version)
    setPending(false)
    if (!r.ok) return setProblem(problemOf(r.error))
    setProblem(null)
    setOpen(null)
    await onChanged()
  }
  const blocking = hold.state === 'open' || hold.state === 'under_review'
  const headingId = `${ids}-hold`
  return (
    <li className="staff-request__decision" aria-labelledby={headingId}>
      <p id={headingId}>
        <strong>{codeLabel(t, 'hazardCategory', hold.category)}</strong>{' '}
        <StatusBadge tone={blocking ? 'danger' : 'neutral'}>{codeLabel(t, 'holdState', hold.state)}</StatusBadge>
      </p>
      <p className="staff-request__note">{hold.note}</p>
      <p className="staff-request__hint">
        {t('request.holdRaised', { name: name(t, hold.raisedBy), time: when(hold.raisedAt) })}
      </p>
      {hold.reviewStartedAt ? (
        <p className="staff-request__hint">
          {t('request.holdReviewStarted', { name: name(t, hold.reviewStartedBy), time: when(hold.reviewStartedAt) })}
        </p>
      ) : null}
      {hold.resolvedAt ? (
        <p>
          {t('request.holdResolved', {
            name: name(t, hold.resolvedBy),
            time: when(hold.resolvedAt),
            note: hold.resolutionNote ?? '',
            reviewer: hold.reviewer ?? '',
          })}
        </p>
      ) : null}
      {hold.canceledAt ? (
        <p>
          {t('request.holdCanceled', {
            name: name(t, hold.canceledBy),
            time: when(hold.canceledAt),
            reason: hold.cancelReason ?? '',
          })}
        </p>
      ) : null}
      {hold.actions.startReview || hold.actions.resolve || hold.actions.cancel ? (
        <div className="hh-button-row">
          {hold.actions.startReview ? (
            <Button variant="secondary" pending={pending} onClick={() => void act('start-review', {})}>
              {t('request.holdStartReview')}
            </Button>
          ) : null}
          {hold.actions.resolve ? (
            <Button
              variant={open === 'resolve' ? 'primary' : 'secondary'}
              aria-expanded={open === 'resolve'}
              onClick={() => setOpen(open === 'resolve' ? null : 'resolve')}
            >
              {t('request.holdResolve')}
            </Button>
          ) : null}
          {hold.actions.cancel ? (
            <Button
              variant={open === 'cancel' ? 'primary' : 'quiet'}
              aria-expanded={open === 'cancel'}
              onClick={() => setOpen(open === 'cancel' ? null : 'cancel')}
            >
              {t('request.holdCancel')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {open === 'resolve' ? (
        <form
          className="staff-request__form"
          aria-label={t('request.holdResolve')}
          onSubmit={(e) => {
            e.preventDefault()
            void act('resolve', { resolutionNote: note, reviewer })
          }}
        >
          <Field
            multiline
            label={t('request.holdResolutionNote')}
            required
            requiredText={t('request.required')}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Field
            label={t('request.holdReviewer')}
            hint={t('request.holdReviewerHint')}
            required
            requiredText={t('request.required')}
            maxLength={200}
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
          />
          <Button type="submit" pending={pending}>
            {t('request.holdConfirmResolve')}
          </Button>
        </form>
      ) : null}
      {open === 'cancel' ? (
        <form
          className="staff-request__form"
          aria-label={t('request.holdCancel')}
          onSubmit={(e) => {
            e.preventDefault()
            void act('cancel', { reason })
          }}
        >
          <Field
            multiline
            label={t('request.holdCancelReason')}
            required
            requiredText={t('request.required')}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button type="submit" pending={pending}>
            {t('request.holdConfirmCancel')}
          </Button>
        </form>
      ) : null}
      <ProblemView t={t} problem={problem} onReload={() => void onChanged().then(() => setProblem(null))} />
    </li>
  )
}

function Notes({ t, fetchImpl, view, onChanged, when }: Props & { when: (iso: string) => string }) {
  const ids = useId()
  const write = useWrite(fetchImpl)
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState('internal_operational')
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [sensitive, setSensitive] = useState(false)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setPending(true)
    const r = await write(`/staff/requests/${view.id}/notes`, 'POST', { body, visibility })
    setPending(false)
    // TSK-0044 (HH-CRM-01): a card number is refused; the note stays in the box to be corrected.
    setSensitive(!r.ok && r.error.fieldErrors.some((f) => f.code === 'sensitive_content'))
    if (!r.ok)
      return setProblem(r.error.fieldErrors.some((f) => f.code === 'sensitive_content') ? null : problemOf(r.error))
    setProblem(null)
    setBody('')
    setVisibility('internal_operational')
    await onChanged()
  }
  return (
    <Section id={`${ids}-notes`} title={t('request.notes')}>
      <p className="staff-request__hint">{t('request.notesHint')}</p>
      {view.notes.length ? (
        <ul className="staff-request__list">
          {view.notes.map((n) => (
            <li key={n.id}>
              <StatusBadge tone={n.visibility === 'internal_operational' ? 'neutral' : 'warning'}>
                {codeLabel(t, 'visibilityClass', n.visibility)}
              </StatusBadge>
              <p className="staff-request__note">{n.masked ? t('customer.noteMasked') : n.body}</p>
              <p className="staff-request__hint">
                {n.masked
                  ? when(n.createdAt)
                  : t('request.noteBy', { name: name(t, n.author), time: when(n.createdAt) })}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('request.noNotes')}</p>
      )}
      {view.actions.addNote ? (
        <form className="staff-request__form" onSubmit={(e) => void submit(e)}>
          <Field
            multiline
            label={t('request.newNote')}
            maxLength={5000}
            value={body}
            hint={t('customer.noteHint')}
            {...(sensitive ? { error: t('customer.noteSensitive') } : {})}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="staff-queue__select">
            <label htmlFor={`${ids}-visibility`}>{t('customer.noteVisibility')}</label>
            <select id={`${ids}-visibility`} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              {NOTE_CLASSES.map((v) => (
                <option key={v} value={v}>
                  {codeLabel(t, 'visibilityClass', v)}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary" pending={pending}>
            {t('request.addNote')}
          </Button>
        </form>
      ) : null}
      <ProblemView t={t} problem={problem} onReload={() => void onChanged().then(() => setProblem(null))} />
    </Section>
  )
}

function History({ t, view, when }: { t: T; view: RequestDetail; when: (iso: string) => string }) {
  const ids = useId()
  return (
    <Section id={`${ids}-history`} title={t('request.history')}>
      {view.decisions.length === 0 ? (
        <p>{t('request.noDecisions')}</p>
      ) : (
        <ol className="staff-request__list">
          {view.decisions.map((d) => (
            <li key={d.id} className="staff-request__decision">
              <p>
                <strong>{codeLabel(t, 'requestDecision', d.action)}</strong> ·{' '}
                {t('request.decisionBy', { name: name(t, d.decidedBy), time: when(d.decidedAt) })}
              </p>
              <p>
                {t('request.decisionStates', {
                  from: codeLabel(t, 'requestState', d.fromState),
                  to: codeLabel(t, 'requestState', d.toState),
                })}
              </p>
              {d.reasonCategory ? (
                <p>{t('request.decisionCategory', { category: codeLabel(t, 'notAFitCategory', d.reasonCategory) })}</p>
              ) : null}
              {d.customerMessage ? (
                <div className="staff-request__preview">
                  <p className="staff-request__hint">{t('request.customerSees')}</p>
                  <blockquote lang="en">{d.customerMessage}</blockquote>
                </div>
              ) : d.customerText ? (
                <p>{t('request.decisionCustomerText', { text: d.customerText })}</p>
              ) : null}
              {d.internalNote ? <p>{t('request.decisionInternalNote', { text: d.internalNote })}</p> : null}
            </li>
          ))}
        </ol>
      )}
      {view.workPackages.length ? (
        <>
          <h3>{t('request.workPackages')}</h3>
          <ol className="staff-request__list">
            {view.workPackages.map((w) => (
              <li key={w.id}>{codeLabel(t, 'service', w.code)}</li>
            ))}
          </ol>
        </>
      ) : null}
    </Section>
  )
}
