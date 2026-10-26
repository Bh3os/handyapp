// The project workspace frame and its Overview (TSK-0038; HH-PORT-02, HH-PORT-03, HH-PORT-06, HH-ARC-10, OWN-DEC-106).
// - One clear next action, and always who is waiting: HandyHub on the customer, or the customer on HandyHub.
// - The status line, the latest update and the filtered timeline come from the shared records; the confirmed
//   appointment and the payment summary are separate sections, never merged into the status.
// - An action whose screen a later task builds (the estimate, deposit, appointment, invoice...) is shown inactive with
//   its reason written out: a placeholder never looks usable (HH-FIN-10). TSK-0051: Reply opens the questions from
//   HandyHub on this page while one waits on the customer (otherwise it stays inactive with its reason).
// - While stale, every section is marked so and the refresh line says from when it is.
// - The six tabs (TSK-0039; HH-PORT-09): Overview first, then Messages, Documents, Photos, Appointments and Payments,
//   in the shared ARIA tabs pattern (one tab stop, arrow keys, Home and End). Each tab has its own page
//   (/portal/p/<reference>/<tab>), so a link, Back and a reload open the same tab. The frame reads the Overview first:
//   a project this session cannot open shows its one neutral state and no tab at all.
import { cents, formatUsd } from '@handyhub/money'
import { Button, StateView, StatusBadge, Tabs, type StatusTone } from '@handyhub/ui'
import { useEffect, useState } from 'react'
import { AppointmentCard } from './Appointments'
import {
  portalApi,
  type CaseUpdates,
  type Fetch,
  type NextAction,
  type ProjectOverview,
  type QuestionList,
  type Waiting,
} from './api'
import { ACTION_LABEL, SITUATION_LABEL, STEP_TEXT, t, TIMELINE_LABEL, WAITING_LABEL, when } from './labels'
import { useLive } from './live'
import { NotShown, RefreshLine } from './States'
import { Questions } from './Questions'
import { TAB_LABEL, TAB_ORDER, TabPanel, tabPath, type EstimateRoute, type Tab } from './Tabs'

const usd = (c: number) => formatUsd(cents(c))

const WAITING_TONE: Record<Waiting, StatusTone> = { customer: 'warning', handyhub: 'info', nobody: 'neutral' }

/**
 * The screens each next action opens; an action whose screen does not exist yet says it is not available here yet.
 * TSK-0056: Review this estimate opens the Documents tab, where the estimate is.
 */
const ACTION_SCREENS: Partial<Record<NextAction, (reference: string) => string>> = {
  review_estimate: (reference) => tabPath(reference, 'documents'),
  // TSK-0063: choosing an offered window happens in the Appointments tab.
  choose_visit_window: (reference) => tabPath(reference, 'appointments'),
  choose_work_appointment: (reference) => tabPath(reference, 'appointments'),
  // TSK-0059: Pay your deposit goes to the payment summary, where the amount due and Pay by Card are.
  pay_deposit: () => '#portal-payment',
}

function NextStep({ o, questions }: { o: ProjectOverview; questions: QuestionList | null }) {
  const step = STEP_TEXT[o.status.step]
  const action = o.status.nextAction
  // TSK-0051: Reply opens the questions that wait on the customer, on this page.
  const waiting = questions?.questions.find((q) => q.canReply)
  const screen = action === 'reply' && waiting ? `#question-${waiting.id}` : ACTION_SCREENS[action]?.(o.reference)
  return (
    <div className="portal-next" data-testid="next-action">
      <p className="portal-next__waiting">
        <StatusBadge tone={WAITING_TONE[o.status.waitingOn]}>{t(WAITING_LABEL[o.status.waitingOn])}</StatusBadge>
      </p>
      {o.status.text ? <p className="portal-next__text">{o.status.text}</p> : null}
      {step ? <p className="portal-next__step">{t(step)}</p> : null}
      {action === 'none' ? null : screen ? (
        <a className="hh-button" href={screen}>
          {t(ACTION_LABEL[action])}
        </a>
      ) : (
        <Button disabledReason={t('portal.action.notYet')}>{t(ACTION_LABEL[action])}</Button>
      )}
    </div>
  )
}

/**
 * The payment summary (TSK-0059; HH-FIN-02, OWN-DEC-104): the deposit due in the owner's words with Pay by Card when
 * HandyHub entered the Square link, any check still pending, or the deposit received. Paying opens Square; nothing
 * here marks anything paid.
 */
function PaymentSummary({ payment }: { payment: ProjectOverview['payment'] }) {
  if (payment.state === 'deposit_due')
    return (
      <div className="portal-deposit" data-testid="portal-deposit">
        <p className="portal-deposit__due">{t('portal.payment.deposit.due', { amount: usd(payment.amountCents) })}</p>
        {payment.verifiedCents > 0 ? (
          <p>{t('portal.payment.deposit.receivedSoFar', { amount: usd(payment.verifiedCents) })}</p>
        ) : null}
        {payment.pendingCents > 0 ? (
          <p>{t('portal.payment.deposit.pending', { amount: usd(payment.pendingCents) })}</p>
        ) : null}
        {payment.payByCardUrl ? (
          <p>
            <a className="hh-button" href={payment.payByCardUrl} target="_blank" rel="noopener noreferrer">
              {t('portal.payment.deposit.payByCard')}
            </a>
          </p>
        ) : null}
      </div>
    )
  if (payment.state === 'deposit_received')
    return <p data-testid="portal-deposit">{t('portal.payment.deposit.paid', { amount: usd(payment.amountCents) })}</p>
  // TSK-0118 (HH-ID-13): an organization member without the pay privilege; never shown as "nothing to pay".
  if (payment.state === 'not_shared')
    return (
      <StateView kind="blocked" title={t('portal.payment.notShared.title')}>
        <p>{t('portal.payment.notShared.text')}</p>
      </StateView>
    )
  return (
    <StateView kind="empty" title={t('portal.payment.none.title')}>
      <p>{t('portal.payment.none.text')}</p>
    </StateView>
  )
}

function Overview({
  o,
  stale,
  questions,
  fetchImpl,
  onChanged,
}: {
  o: ProjectOverview
  stale: boolean
  questions: QuestionList | null
  fetchImpl: Fetch
  onChanged: () => Promise<void>
}) {
  const latest = o.timeline[0]
  const section = (id: string) => ({
    'aria-labelledby': id,
    className: stale ? 'portal-section portal-section--stale' : 'portal-section',
    'data-stale': stale || undefined,
  })
  return (
    <div className="portal-overview">
      <section {...section('portal-status')}>
        <h3 id="portal-status" className="hh-h3">
          {t('portal.overview.status')}
        </h3>
        <p className="portal-status__label hh-lead">{t(SITUATION_LABEL[o.status.situation])}</p>
        <p className="hh-small hh-muted">{t('portal.overview.since', { time: when(o.status.since) })}</p>
        <h4 className="hh-visually-hidden">{t('portal.overview.next')}</h4>
        <NextStep o={o} questions={questions} />
      </section>

      {questions ? (
        <Questions reference={o.reference} data={questions} fetchImpl={fetchImpl} onChanged={onChanged} />
      ) : null}

      {latest ? (
        <section {...section('portal-latest')}>
          <h3 id="portal-latest" className="hh-h3">
            {t('portal.overview.latest')}
          </h3>
          <p>
            <strong>{t(TIMELINE_LABEL[latest.kind])}</strong> <span className="hh-muted">{when(latest.at)}</span>
          </p>
        </section>
      ) : null}

      <section {...section('portal-appointment')}>
        <h3 id="portal-appointment" className="hh-h3">
          {t('portal.appointment.title')}
        </h3>
        {o.appointment ? (
          <AppointmentCard a={o.appointment} />
        ) : (
          <StateView kind="empty" title={t('portal.appointment.none.title')}>
            <p>{t('portal.appointment.none.text')}</p>
          </StateView>
        )}
      </section>

      <section {...section('portal-payment')}>
        <h3 id="portal-payment" className="hh-h3">
          {t('portal.payment.title')}
        </h3>
        <PaymentSummary payment={o.payment} />
      </section>

      <section {...section('portal-timeline')}>
        <h3 id="portal-timeline" className="hh-h3">
          {t('portal.overview.timeline')}
        </h3>
        <ol className="portal-timeline">
          {o.timeline.map((e) => (
            <li key={`${e.kind}-${e.at}`} className="portal-timeline__item">
              <p className="portal-timeline__label">
                <strong>{t(TIMELINE_LABEL[e.kind])}</strong>{' '}
                <time className="hh-muted" dateTime={e.at}>
                  {when(e.at)}
                </time>
              </p>
              {e.text ? <p className="portal-timeline__text">{e.text}</p> : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}

/**
 * TSK-0093 (HH-QA-06, HH-INC-02): the updates HandyHub released about a concern on this project, as staff released them
 * after review: an acknowledgment, progress, the next step or the safety pause. Nothing is shown while there is none.
 */
function CaseUpdatesSection({ reference, fetchImpl }: { reference: string; fetchImpl: Fetch }) {
  const [data, setData] = useState<CaseUpdates | null>(null)
  useEffect(() => {
    let live = true
    void portalApi.caseUpdates(fetchImpl, reference).then((r) => {
      if (live) setData(r.ok ? r.data : null)
    })
    return () => {
      live = false
    }
  }, [fetchImpl, reference])
  if (!data || data.cases.length === 0) return null
  return (
    <section className="portal-case-updates" aria-labelledby="portal-case-updates" data-testid="portal-case-updates">
      <h3 id="portal-case-updates" className="hh-h4">
        {t('portal.cases.title')}
      </h3>
      {data.cases.map((c) => (
        <div key={c.caseNumber}>
          <h4 className="hh-h5">{t('portal.cases.case', { number: c.caseNumber })}</h4>
          <ol>
            {c.updates.map((u, i) => (
              <li key={i}>
                <p>{u.text}</p>
                <p className="hh-small hh-muted">{t('portal.cases.when', { time: when(u.releasedAt) })}</p>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </section>
  )
}

/** The Overview with the questions from HandyHub, read beside it and refreshed with it while it is shown. */
function OverviewWithQuestions({
  o,
  stale,
  active,
  fetchImpl,
  onChanged,
}: {
  o: ProjectOverview
  stale: boolean
  active: boolean
  fetchImpl: Fetch
  onChanged: () => Promise<void>
}) {
  const questions = useLive(() => portalApi.questions(fetchImpl, o.reference), `${o.reference}/questions`, active)
  return (
    <Overview
      o={o}
      stale={stale}
      questions={questions.live.phase === 'ready' ? questions.live.data : null}
      fetchImpl={fetchImpl}
      onChanged={async () => {
        await Promise.all([onChanged(), questions.refresh()])
      }}
    />
  )
}

export function Workspace({
  reference,
  tab = 'overview',
  estimate,
  onNavigate,
  fetchImpl,
}: {
  reference: string
  tab?: Tab
  /** TSK-0056: the estimate version the Documents tab shows (its own page below the tab). */
  estimate?: EstimateRoute | undefined
  /** Opens another page of the portal (a tab's own path); the App keeps the address bar in step. */
  onNavigate?: (path: string) => void
  fetchImpl: Fetch
}) {
  const { live, refresh } = useLive(() => portalApi.overview(fetchImpl, reference), reference)
  return (
    <>
      <p className="portal-back">
        <a href="/portal/">{t('portal.project.all')}</a>
      </p>
      <h1 className="hh-h2">{t('portal.project.title', { reference })}</h1>
      {live.phase !== 'ready' ? (
        <NotShown live={live} loading="portal.project.loading" onRetry={() => void refresh()} />
      ) : (
        <>
          <p className="portal-services">
            <span className="hh-muted">{t('portal.project.services')}:</span>{' '}
            {[...live.data.services, ...(live.data.notSure ? [t('request.services.notSure')] : [])].join(', ')}
          </p>
          <p className="hh-small hh-muted">{t('access.project.sent', { date: when(live.data.submittedAt) })}</p>
          <p className="portal-privacy-link">
            <a href={`/portal/p/${encodeURIComponent(reference)}/privacy`}>{t('portal.privacy.link')}</a>
          </p>
          <Tabs
            label={t('portal.tabs.label')}
            selectedId={tab}
            onSelect={(id) => onNavigate?.(tabPath(reference, id as Tab))}
            tabs={TAB_ORDER.map((id) => ({
              id,
              label: t(TAB_LABEL[id]),
              content:
                id === 'overview' ? (
                  <>
                    <RefreshLine
                      refreshedAt={live.refreshedAt}
                      stale={live.stale}
                      refreshing={live.refreshing}
                      onRefresh={() => void refresh()}
                    />
                    <h2 className="hh-visually-hidden">{t('portal.overview.title')}</h2>
                    <CaseUpdatesSection reference={reference} fetchImpl={fetchImpl} />
                    {/* TSK-0051: a project HandyHub asked questions on reads them too (its timeline says so). */}
                    {live.data.timeline.some((e) => e.kind === 'more_information') ? (
                      <OverviewWithQuestions
                        o={live.data}
                        stale={live.stale}
                        active={tab === 'overview'}
                        fetchImpl={fetchImpl}
                        onChanged={refresh}
                      />
                    ) : (
                      <Overview
                        o={live.data}
                        stale={live.stale}
                        questions={null}
                        fetchImpl={fetchImpl}
                        onChanged={refresh}
                      />
                    )}
                  </>
                ) : (
                  <TabPanel
                    reference={reference}
                    tab={id}
                    active={tab === id}
                    fetchImpl={fetchImpl}
                    onNavigate={onNavigate}
                    estimate={id === 'documents' ? estimate : undefined}
                  />
                ),
            }))}
          />
        </>
      )}
    </>
  )
}
