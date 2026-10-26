// The worker's My Day (TSK-0070; HH-OFF-09, HH-SCH-08, HH-PORT-07, HH-WORK-06, T43, T47, T49, OWN-DEC-121,
// OWN-DEC-107, OWN-DEC-69, OWN-DEC-149, OWN-DEC-40, RULE-SAFETY-GATES).
// - Today's assigned visits in order, built by the server from current assignments only: the arrival window, the
//   address with a plain directions link that opens a maps app (no maps service is called), the access notes (never a
//   code), the preparation, the readiness blockers the records show and one clear next action, as a 48 px button.
// - On my way, Arrived and Finished are the worker's own taps; the server decides each again (the same rule builds
//   this screen), so a refused tap says why and changes nothing. A tap that could not reach the server is saved on
//   this phone (TSK-0079) and uploaded by the sync queue (TSK-0080): each draft shows "Saved on this phone",
//   "Pending upload", "Synced", "Upload failed" or "Needs review"; nothing pretends to be synced before it is.
// - There is no ETA, no timer and no check-in between Arrived and Finished (OWN-DEC-149). Arrived never starts work:
//   Start Work stays its own online check. Stop Work and Report Hazard stay available from the job packet.
// - TSK-0073: an on-the-way or arrived visit links to its Start Work briefing and gate (never a direct start).
// - TSK-0128 (HH-PKT-08, OWN-DEC-171): the customer's first name and the address show only during the worker's
//   visit-day access (the visit's own local day, or an Owner extension until the time shown); before it the general
//   service area. The screen says that removing access cannot erase screenshots or copies.
// - TSK-0155 (HH-COM-16, OWN-DEC-211): a confirmed visit links to its job's notes and proposed replies, and the screen
//   lists the worker's own proposed replies with their status.
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { call, idempotencyKey, type Fetch } from './api'
import { MyJobPackets } from './JobPacket'
import { MyReplyProposals } from './ReplyProposals'
import { codeLabel } from './Requests'
import { StopWorkPanel } from './StopWork'
import { VisitOutcomeForm, type RecordedOutcome } from './VisitOutcomes'
import { draftId, offlineStore, type DraftState, type StoredDraft } from './offline/store'
import { currentStaff, DRAFTS_CHANGED } from './offline/sync'

// TSK-0080 (HH-OFF-07): what each draft shows as it moves through the sync queue.
export const DRAFT_STATE: Record<DraftState, StaffKey> = {
  saved_on_phone: 'offline.savedOnPhone',
  pending_upload: 'sync.pendingUpload',
  synced: 'sync.synced',
  failed: 'sync.failedLabel',
  needs_review: 'sync.reviewLabel',
}
export const DRAFT_TONE: Record<DraftState, 'warning' | 'success' | 'danger' | 'info'> = {
  saved_on_phone: 'warning',
  pending_upload: 'warning',
  synced: 'success',
  failed: 'danger',
  needs_review: 'info',
}

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
  /** TSK-0128: the general service area, the visit-day access and the customer's first name (while it is open). */
  serviceArea?: { city: string; state: string } | null
  visitDay?: { open: boolean; basis: 'visit_day' | 'extension' | null; endsAt: string | null; opensAt: string | null }
  customer?: { firstName: string | null }
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
  /** TSK-0078: the outcomes recorded on this visit. */
  outcomes?: RecordedOutcome[]
  actions: { onMyWay: boolean; arrived: boolean; finished: boolean; recordOutcome?: boolean }
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
  const load = useCallback(
    async (keep = false) => {
      const r = await call<MyDayBody>(fetchImpl, '/staff/my/day')
      const next = r.ok && Array.isArray(r.data?.visits) ? r.data : null
      // A refresh after a sync keeps the day shown when the server cannot be reached.
      setDay((d) => (next === null && keep && d ? d : next))
    },
    [fetchImpl],
  )
  useEffect(() => {
    void load()
    // TSK-0080 (HH-OFF-06): after a sync, schedule changes and reassignments show at once.
    const changed = () => void load(true)
    window.addEventListener(DRAFTS_CHANGED, changed)
    return () => window.removeEventListener(DRAFTS_CHANGED, changed)
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
      {/* TSK-0155: the worker's proposed customer replies and their status (Draft, Awaiting Review, Sent, Rejected). */}
      <MyReplyProposals t={t} locale={locale} fetchImpl={fetchImpl} />
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
  // TSK-0079 (HH-OFF-03, T50): taps saved on this phone while the server could not be reached.
  const [drafts, setDrafts] = useState<StoredDraft[]>([])
  const loadDrafts = useCallback(async () => {
    const all = await offlineStore()
      .listDrafts()
      .catch(() => [] as StoredDraft[])
    setDrafts(all.filter((d) => d.kind === 'tap' && d.visitId === v.visitId))
  }, [v.visitId])
  useEffect(() => {
    void loadDrafts()
    // TSK-0080: a sync changed what the phone holds (My Day itself reloads, HH-OFF-06).
    const changed = () => void loadDrafts()
    window.addEventListener(DRAFTS_CHANGED, changed)
    return () => window.removeEventListener(DRAFTS_CHANGED, changed)
  }, [loadDrafts])
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
    if (r.ok) {
      key.current = null
      return onChanged(r.data.visit)
    }
    if (r.status === 0) {
      // No connection: the tap is saved on this phone with the device's time and its request key, never shown as
      // recorded; the office is not told until it is synchronized (TSK-0080).
      const staffUserId = currentStaff()
      const saved = await offlineStore()
        .putDraft({
          // TSK-0080: the event's own UUID (the server ingests it once) and who recorded it on this phone.
          id: draftId(),
          kind: 'tap',
          ...(staffUserId ? { staffUserId } : {}),
          jobId: v.jobId,
          visitId: v.visitId,
          deviceRecordedAt: new Date().toISOString(),
          payload: { tap: what },
          state: 'saved_on_phone',
          attempts: 0,
        })
        .then(() => true)
        .catch(() => false)
      key.current = null
      if (!saved) return setProblem('myday.notRecordedOffline')
      // Every screen that shows the drafts (this card, the sync bar) reads them again.
      return void window.dispatchEvent(new Event(DRAFTS_CHANGED))
    }
    key.current = null
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
            <>
              {v.serviceArea ? (
                <p data-testid="myday-area">
                  {t('myday.serviceArea', { city: v.serviceArea.city, state: v.serviceArea.state })}
                </p>
              ) : null}
              <p className="staff-request__hint">{t('myday.noAddress')}</p>
            </>
          )}
          {v.customer?.firstName ? (
            <p data-testid="myday-customer">{t('myday.customer', { name: v.customer.firstName })}</p>
          ) : null}
          {v.visitDay?.open && v.visitDay.endsAt ? (
            <p className="staff-request__hint" data-testid="myday-visit-day">
              {v.visitDay.basis === 'extension'
                ? t('myday.visitDay.extended', { time: timeIn(v.visitDay.endsAt, zone, locale) })
                : null}{' '}
              {t('packet.visitDay.copies')}
            </p>
          ) : null}
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
              {/* TSK-0155: internal notes and proposed customer replies from the job (Spanish or English). */}
              {v.assignment === 'confirmed' ? (
                <>
                  {' · '}
                  <a href={href(`/job-notes/${v.jobId}`)} data-testid="myday-notes">
                    {t('myday.openNotes')}
                  </a>
                </>
              ) : null}
              {v.readiness.blockers.some((b) => b.code.startsWith('loadout_')) ? (
                <>
                  {' · '}
                  <a href={href(`/loadouts/${v.jobId}`)}>{t('myday.openLoadout')}</a>
                </>
              ) : null}
              {/* TSK-0076: before and after photos of the job. */}
              {v.state === 'arrived' && v.assignment === 'confirmed' ? (
                <>
                  {' · '}
                  <a href={href(`/job-photos/${v.jobId}`)}>{t('myday.openPhotos')}</a>
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
          {v.actions.recordOutcome ? (
            // TSK-0078 (HH-SCH-09): a delay, no access, the customer absent, weather, missing resources or a
            // readiness issue, each with a note and a staff follow-up. "No access" ends the visit (it leaves My Day).
            <VisitOutcomeForm<MyDayVisit>
              t={t}
              fetchImpl={fetchImpl}
              visitId={v.visitId}
              outcomes={v.outcomes ?? []}
              onRecorded={(next) => (next ? onChanged(next) : onStale())}
            />
          ) : null}
          {drafts.length > 0 ? (
            <div data-testid="myday-drafts">
              <ul>
                {drafts.map((d) => (
                  <li key={d.id}>
                    {t('myday.draft', {
                      tap: t(TAP_LABEL[d.payload['tap'] as Tap] ?? 'myday.tap.arrived'),
                      time: timeIn(d.deviceRecordedAt, zone, locale),
                    })}{' '}
                    <StatusBadge tone={DRAFT_TONE[d.state]}>{t(DRAFT_STATE[d.state])}</StatusBadge>
                  </li>
                ))}
              </ul>
              {drafts.some((d) => d.state !== 'synced') ? <p role="status">{t('offline.notSynced')}</p> : null}
            </div>
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
