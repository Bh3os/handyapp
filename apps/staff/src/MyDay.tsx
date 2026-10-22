// The worker's My Day (TSK-0070; HH-OFF-09, HH-SCH-08, HH-PORT-07, HH-WORK-06, T43, T47, T49, OWN-DEC-121,
// OWN-DEC-107, OWN-DEC-69, OWN-DEC-149, OWN-DEC-40, RULE-SAFETY-GATES).
// - Today's assigned visits in order, built by the server from current assignments only: the arrival window, the
//   address with a plain directions link that opens a maps app (no maps service is called), the access notes (never a
//   code), the preparation, the readiness blockers the records show and one clear next action, as a 48 px button.
// - On my way, Arrived and Finished are the worker's own taps; the server decides each again (the same rule builds
//   this screen), so a refused tap says why and changes nothing. A tap that could not reach the server is said to be
//   not recorded: nothing is saved on the phone yet (offline drafts are TSK-0079) and nothing pretends to be synced.
// - There is no ETA, no timer and no check-in between Arrived and Finished (OWN-DEC-149). Arrived never starts work:
//   Start Work stays its own online check. Stop Work and Report Hazard stay available from the job packet.
// - TSK-0073: an on-the-way or arrived visit links to its Start Work briefing and gate (never a direct start).
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { call, idempotencyKey, type Fetch } from './api'
import { MyJobPackets } from './JobPacket'
import { codeLabel } from './Requests'
import { StopWorkPanel } from './StopWork'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

type Detail = { detail: string; value: string | null; source: string; confirmedAt: string }
export type MyDayVisit = {
  visitId: string
  number: number
  purpose: string
  state: string
  version: number
  projectReference: string
  jobId: string | null
  assignment: 'confirmed' | 'hold'
  role: string
  window: { localDate: string; start: string; end: string; timeZone: string; startsAt: string; endsAt: string }
  team: { name: string | null; role: string }[]
  address: { street: string; unit: string | null; city: string; state: string; zip: string } | null
  directionsUrl: string | null
  accessNotes: Detail[]
  preparation: { customerPreparation: string | null; instructions: string | null }
  readiness: {
    packetVersion: number
    lastViewedVersion: number | null
    changedSinceViewed: boolean
    criticalSinceViewed: boolean
    acknowledgment: 'acknowledged' | 'required' | 'invalidated' | 'not_assigned'
    blockers: { code: string; count: number }[]
  } | null
  mine: { departedAt: string | null; arrivedAt: string | null; finishedAt: string | null }
  next: 'not_confirmed' | 'wait' | 'not_configured' | 'on_my_way' | 'arrived' | 'finished' | 'done'
  onMyWayOpensAt: string | null
  actions: { onMyWay: boolean; arrived: boolean; finished: boolean }
}
type MyDayBody = {
  checkedAt: string
  onMyWay: { state: 'configured' | 'not_configured'; earliestMinutesBefore: number | null }
  visits: MyDayVisit[]
}
type Tap = 'on-my-way' | 'arrived' | 'finished'

const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')
const TAP_LABEL: Record<Tap, StaffKey> = {
  'on-my-way': 'myday.tap.onMyWay',
  arrived: 'myday.tap.arrived',
  finished: 'myday.tap.finished',
}
/** The refusals the server names for a tap, as the worker reads them. */
const REFUSAL: Readonly<Record<string, StaffKey>> = {
  VISIT_NOT_ACTIVE: 'myday.refused.VISIT_NOT_ACTIVE',
  ON_MY_WAY_NOT_CONFIGURED: 'myday.refused.ON_MY_WAY_NOT_CONFIGURED',
  ON_MY_WAY_TOO_EARLY: 'myday.refused.ON_MY_WAY_TOO_EARLY',
  ON_MY_WAY_FIRST: 'myday.refused.ON_MY_WAY_FIRST',
  ARRIVED_FIRST: 'myday.refused.ARRIVED_FIRST',
  ALREADY_ARRIVED: 'myday.refused.ALREADY_ARRIVED',
  VISIT_CHANGED: 'myday.refused.VISIT_CHANGED',
}
/** The readiness blockers the server lists. */
const BLOCKER: Readonly<Record<string, StaffKey>> = {
  blocking_hold: 'myday.blocker.blocking_hold',
  deposit_not_covered: 'myday.blocker.deposit_not_covered',
  sop_not_configured: 'myday.blocker.sop_not_configured',
  packet_not_viewed: 'myday.blocker.packet_not_viewed',
  packet_changed: 'myday.blocker.packet_changed',
  packet_critical_change: 'myday.blocker.packet_critical_change',
  // TSK-0072: the worker's own packet acknowledgment.
  packet_not_acknowledged: 'myday.blocker.packet_not_acknowledged',
  packet_acknowledgment_ended: 'myday.blocker.packet_acknowledgment_ended',
  // TSK-0071: the loadout of the job's work packages.
  loadout_blocked: 'myday.blocker.loadout_blocked',
  loadout_not_confirmed: 'myday.blocker.loadout_not_confirmed',
  loadout_not_configured: 'myday.blocker.loadout_not_configured',
}

/** A moment in the visit's own zone, in the staff member's language. */
function timeIn(iso: string, zone: string, locale: StaffLocale) {
  return new Intl.DateTimeFormat(bcp47(locale), { timeZone: zone, hour: 'numeric', minute: '2-digit' }).format(
    new Date(iso),
  )
}

/** The worker's day: today's visits with the next action, then the job packets (TSK-0069). */
export function MyDay({
  t,
  locale,
  fetchImpl,
  href,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  href: (to: string) => string
}) {
  const ids = useId()
  const [day, setDay] = useState<MyDayBody | null | undefined>(undefined)
  const load = useCallback(async () => {
    const r = await call<MyDayBody>(fetchImpl, '/staff/my/day')
    setDay(r.ok && Array.isArray(r.data?.visits) ? r.data : null)
  }, [fetchImpl])
  useEffect(() => {
    void load()
  }, [load])
  const replace = (v: MyDayVisit) =>
    setDay((d) => (d ? { ...d, visits: d.visits.map((x) => (x.visitId === v.visitId ? v : x)) } : d))
  return (
    <section className="staff-screen staff-myday" aria-labelledby={`${ids}-title`} data-testid="my-day">
      <h1 id={`${ids}-title`} className="hh-h3">
        {t('nav.my-day')}
      </h1>
      <p className="staff-request__hint">{t('myday.hint')}</p>
      {day === undefined ? (
        <StateView kind="loading" title={t('myday.loading')} />
      ) : day === null ? (
        <StateView kind="error" title={t('myday.failed')}>
          <Button variant="secondary" onClick={() => void load()}>
            {t('myday.retry')}
          </Button>
        </StateView>
      ) : (
        <>
          {day.onMyWay.state === 'not_configured' ? (
            <StateView kind="blocked" title={t('myday.onMyWayNotConfigured')} />
          ) : null}
          {day.visits.length === 0 ? (
            <StateView kind="empty" title={t('myday.none')} />
          ) : (
            <ol className="staff-myday__list">
              {day.visits.map((v) => (
                <VisitCard
                  key={v.visitId}
                  t={t}
                  locale={locale}
                  fetchImpl={fetchImpl}
                  href={href}
                  visit={v}
                  onChanged={replace}
                  onStale={() => void load()}
                />
              ))}
            </ol>
          )}
          <p className="staff-request__hint" data-testid="myday-checked">
            {t('myday.checkedAt', { time: new Date(day.checkedAt).toLocaleTimeString(bcp47(locale)) })}{' '}
            <Button variant="quiet" onClick={() => void load()}>
              {t('myday.refresh')}
            </Button>
          </p>
        </>
      )}
      <MyJobPackets t={t} fetchImpl={fetchImpl} href={href} />
    </section>
  )
}

function VisitCard({
  t,
  locale,
  fetchImpl,
  href,
  visit: v,
  onChanged,
  onStale,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  href: (to: string) => string
  visit: MyDayVisit
  onChanged: (v: MyDayVisit) => void
  onStale: () => void
}) {
  const ids = useId()
  const [pending, setPending] = useState<Tap | null>(null)
  const [problem, setProblem] = useState<StaffKey | null>(null)
  const key = useRef<{ tap: Tap; key: string } | null>(null)
  const zone = v.window.timeZone
  async function tap(what: Tap) {
    setPending(what)
    setProblem(null)
    // One key per tap, kept until the server answers, so a retried tap is the same request.
    key.current = key.current?.tap === what ? key.current : { tap: what, key: idempotencyKey() }
    const r = await call<{ recorded: boolean; visit: MyDayVisit }>(
      fetchImpl,
      `/staff/visits/${encodeURIComponent(v.visitId)}/${what}`,
      {
        method: 'POST',
        headers: { 'idempotency-key': key.current.key },
        body: { deviceRecordedAt: new Date().toISOString() },
      },
    )
    setPending(null)
    if (r.ok || r.status > 0) key.current = null
    if (r.ok) return onChanged(r.data.visit)
    if (r.status === 0) return setProblem('myday.notRecordedOffline')
    const code = r.error.fieldErrors[0]?.code
    const refused = code ? REFUSAL[code] : undefined
    if (refused) {
      setProblem(refused)
      return onStale()
    }
    setProblem(r.status === 403 || r.status === 404 ? 'myday.refused.notAssigned' : 'myday.failedTap')
    onStale()
  }
  const primary: Tap | null =
    v.next === 'on_my_way' ? 'on-my-way' : v.next === 'arrived' ? 'arrived' : v.next === 'finished' ? 'finished' : null
  const secondary: Tap[] = (
    [
      ['on-my-way', v.actions.onMyWay],
      ['arrived', v.actions.arrived],
      ['finished', v.actions.finished],
    ] as const
  ).flatMap(([tp, ok]) => (ok && tp !== primary ? [tp] : []))
  const mine = (
    [
      ['myday.mine.departed', v.mine.departedAt],
      ['myday.mine.arrived', v.mine.arrivedAt],
      ['myday.mine.finished', v.mine.finishedAt],
    ] as const
  ).flatMap(([k, at]) => (at ? [t(k, { time: timeIn(at, zone, locale) })] : []))
  return (
    <li className="staff-myday__visit" aria-labelledby={`${ids}-h`} data-testid="myday-visit">
      <h2 id={`${ids}-h`} className="staff-queue__heading">
        {t('myday.visitTitle', {
          start: v.window.start,
          end: v.window.end,
          reference: v.projectReference,
        })}
      </h2>
      <p>
        <StatusBadge tone={v.assignment === 'hold' ? 'warning' : v.state === 'completed' ? 'success' : 'info'}>
          {v.assignment === 'hold' ? t('myday.hold') : codeLabel(t, 'visitState', v.state)}
        </StatusBadge>{' '}
        {codeLabel(t, 'visitPurpose', v.purpose)}
        {' · '}
        {t('myday.window', { date: v.window.localDate, start: v.window.start, end: v.window.end, zone })}
      </p>
      {v.assignment === 'hold' ? (
        <p className="staff-request__hint">{t('myday.holdHint')}</p>
      ) : (
        <>
          {v.team.length > 0 ? (
            <p data-testid="myday-team">
              {t('myday.team')}{' '}
              {v.team
                .map((m) =>
                  m.role === 'lead'
                    ? t('myday.lead', { name: m.name ?? t('queue.unnamed') })
                    : (m.name ?? t('queue.unnamed')),
                )
                .join(', ')}
            </p>
          ) : null}
          {v.address ? (
            <p data-testid="myday-address">
              {[
                [v.address.street, v.address.unit].filter(Boolean).join(' '),
                v.address.city,
                `${v.address.state} ${v.address.zip}`,
              ].join(', ')}
              {v.directionsUrl ? (
                <>
                  {' '}
                  <a href={v.directionsUrl} target="_blank" rel="noopener noreferrer">
                    {t('myday.directions')}
                  </a>
                </>
              ) : null}
            </p>
          ) : (
            <p className="staff-request__hint">{t('myday.noAddress')}</p>
          )}
          {v.accessNotes.length > 0 ? (
            <dl className="staff-system__fields" data-testid="myday-access">
              {v.accessNotes.map((d) => (
                <div key={d.detail}>
                  <dt>{codeLabel(t, 'propertyDetail', d.detail)}</dt>
                  <dd>{d.value ?? t('myday.noValue')}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {v.preparation.customerPreparation || v.preparation.instructions ? (
            <div data-testid="myday-preparation">
              <h3 className="staff-myday__sub">{t('myday.preparation')}</h3>
              {v.preparation.customerPreparation ? <p>{v.preparation.customerPreparation}</p> : null}
              {v.preparation.instructions ? <p>{v.preparation.instructions}</p> : null}
            </div>
          ) : null}
          {v.readiness ? (
            <div data-testid="myday-readiness">
              <h3 className="staff-myday__sub">{t('myday.readiness')}</h3>
              {v.readiness.blockers.length === 0 ? (
                <p>{t('myday.noBlockers')}</p>
              ) : (
                <ul>
                  {v.readiness.blockers.map((b) => (
                    <li key={b.code}>{BLOCKER[b.code] ? t(BLOCKER[b.code] as StaffKey, { n: b.count }) : b.code}</li>
                  ))}
                </ul>
              )}
              <p className="staff-request__hint">{t('myday.readinessNote')}</p>
            </div>
          ) : null}
          {v.jobId && (v.state === 'en_route' || v.state === 'arrived') && v.assignment === 'confirmed' ? (
            // TSK-0073 (T46): a shortcut opens the briefing and its gate, never a direct start.
            <p>
              <a href={href(`/start/${v.visitId}`)} data-testid="myday-start">
                {t('myday.openStart')}
              </a>
            </p>
          ) : null}
          {v.jobId && v.readiness ? (
            <p>
              <a href={href(`/packets/${v.jobId}`)}>{t('myday.openPacket')}</a>
              {v.readiness.blockers.some((b) => b.code.startsWith('loadout_')) ? (
                <>
                  {' · '}
                  <a href={href(`/loadouts/${v.jobId}`)}>{t('myday.openLoadout')}</a>
                </>
              ) : null}
            </p>
          ) : null}
          {mine.length > 0 ? <p data-testid="myday-mine">{mine.join(' · ')}</p> : null}
          <div className="staff-myday__actions" data-testid="myday-actions">
            {primary ? (
              <Button className="staff-myday__action" pending={pending === primary} onClick={() => void tap(primary)}>
                {t(TAP_LABEL[primary])}
              </Button>
            ) : (
              <p data-testid="myday-next">
                {v.next === 'wait' && v.onMyWayOpensAt
                  ? t('myday.next.wait', { time: timeIn(v.onMyWayOpensAt, zone, locale) })
                  : v.next === 'not_configured'
                    ? t('myday.next.not_configured')
                    : v.state === 'completed' || v.next === 'done'
                      ? t('myday.next.done')
                      : t('myday.next.not_confirmed')}
              </p>
            )}
            {secondary.map((s) => (
              <Button
                key={s}
                variant="secondary"
                className="staff-myday__action"
                pending={pending === s}
                onClick={() => void tap(s)}
              >
                {t(TAP_LABEL[s])}
              </Button>
            ))}
          </div>
          {v.state === 'arrived' && v.mine.arrivedAt && !v.mine.finishedAt ? (
            <p className="staff-request__hint">{t('myday.arrivedNote')}</p>
          ) : null}
          {v.jobId && (v.state === 'en_route' || v.state === 'arrived') && v.assignment === 'confirmed' ? (
            // TSK-0077 (HH-WORK-09): Stop Work / Report Hazard on the active visit, inline, never disabled.
            <StopWorkPanel t={t} fetchImpl={fetchImpl} jobId={v.jobId} visitId={v.visitId} />
          ) : null}
          {problem ? (
            <p role="alert" className="hh-field__error" data-testid="myday-problem">
              {t(problem)}
            </p>
          ) : null}
        </>
      )}
    </li>
  )
}
