// The project workspace frame and its Overview (TSK-0038; HH-PORT-02, HH-PORT-03, HH-PORT-06, HH-ARC-10, OWN-DEC-106).
// - One clear next action, and always who is waiting: HandyHub on the customer, or the customer on HandyHub.
// - The status line, the latest update and the filtered timeline come from the shared records; the confirmed
//   appointment and the payment summary are separate sections, never merged into the status.
// - An action whose screen a later task builds (Reply with TSK-0051, the estimate, deposit, appointment, invoice...)
//   is shown inactive with its reason written out: a placeholder never looks usable (HH-FIN-10).
// - While stale, every section is marked so and the refresh line says from when it is.
// - The six tabs (TSK-0039; HH-PORT-09): Overview first, then Messages, Documents, Photos, Appointments and Payments,
//   in the shared ARIA tabs pattern (one tab stop, arrow keys, Home and End). Each tab has its own page
//   (/portal/p/<reference>/<tab>), so a link, Back and a reload open the same tab. The frame reads the Overview first:
//   a project this session cannot open shows its one neutral state and no tab at all.
import { Button, StateView, StatusBadge, Tabs, type StatusTone } from '@handyhub/ui'
import { portalApi, type Fetch, type NextAction, type ProjectOverview, type Waiting } from './api'
import { ACTION_LABEL, SITUATION_LABEL, STEP_TEXT, t, TIMELINE_LABEL, WAITING_LABEL, when } from './labels'
import { useLive } from './live'
import { NotShown, RefreshLine } from './States'
import { TAB_LABEL, TAB_ORDER, TabPanel, tabPath, type EstimateRoute, type Tab } from './Tabs'

const WAITING_TONE: Record<Waiting, StatusTone> = { customer: 'warning', handyhub: 'info', nobody: 'neutral' }

/**
 * The screens each next action opens; an action whose screen does not exist yet says it is not available here yet.
 * TSK-0056: Review this estimate opens the Documents tab, where the estimate is.
 */
const ACTION_SCREENS: Partial<Record<NextAction, (reference: string) => string>> = {
  review_estimate: (reference) => tabPath(reference, 'documents'),
}

function NextStep({ o }: { o: ProjectOverview }) {
  const step = STEP_TEXT[o.status.step]
  const action = o.status.nextAction
  const screen = ACTION_SCREENS[action]?.(o.reference)
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

function Overview({ o, stale }: { o: ProjectOverview; stale: boolean }) {
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
        <NextStep o={o} />
      </section>

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
        <StateView kind="empty" title={t('portal.appointment.none.title')}>
          <p>{t('portal.appointment.none.text')}</p>
        </StateView>
      </section>

      <section {...section('portal-payment')}>
        <h3 id="portal-payment" className="hh-h3">
          {t('portal.payment.title')}
        </h3>
        <StateView kind="empty" title={t('portal.payment.none.title')}>
          <p>{t('portal.payment.none.text')}</p>
        </StateView>
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
                    <Overview o={live.data} stale={live.stale} />
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
