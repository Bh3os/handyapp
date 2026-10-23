// The job packet (TSK-0069; HH-PKT-01, HH-PKT-02, HH-PKT-07, HH-OFF-02, T28, T43, T44, ENT-JobPacket, OWN-DEC-121,
// OWN-DEC-40, OWN-DEC-80, OWN-DEC-81, RULE-NO-INVENTED-FACTS, RULE-SAFETY-GATES).
// - One page per job with every section of HH-PKT-01, read from the server's current packet version: the version,
//   first-generated, last-updated and checked times, and "What changed since you reviewed this?" against the version
//   this person last viewed (critical changes marked). Opening the packet records the view of that version (personal;
//   not an acknowledgment, it releases nothing).
// - Access codes: kind, label and last confirmation only, with a Reveal button for the roles the server allows (the
//   audited online reveal, shown briefly and never printed). No code is ever in the packet, the print view or the PDF.
// - Print: the server records and audits the print first; the print view carries the version and "Printed <time>;
//   check the app for changes", and leaves out photos, code labels and any revealed code. Download PDF: the server's
//   PDF, recorded and audited as an export.
// - What no record holds is said, never filled in: a service without a loadout list (TSK-0071) says NOT CONFIGURED, no approved care notes, the Owner's
//   escalation contact NOT CONFIGURED. The emergency section says emergency action never waits for the app.
// - Your review (TSK-0072; HH-DATA-08, HH-WORK-10, T44, ENT-Acknowledgment): where the caller's own acknowledgment
//   stands (needed, standing, no longer counting after a critical change, a removal or a disabled account) with what
//   changed since the acknowledged version, and, for an assigned worker, a personal acknowledgment of this exact
//   version (a checkbox, then the button; the server refuses anyone not assigned and a version that changed). Each
//   assigned worker's state is listed; nobody acknowledges for another person. It releases no hold.
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { call, type Fetch } from './api'
import { JobIncidents } from './Cases'
import { RevealedValue, type Revealed } from './Property'
import { codeLabel } from './Requests'
import { holdNoteText } from './StopWork'
import { WorkPackageSop } from './WorkPackageSop'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

type Change = {
  section: string
  code: string
  critical: boolean
  ref: string | null
  from: string | number | null
  to: string | number | null
}
type Detail = { detail: string; value: string | null; source: string; confirmedAt: string }
type EvidenceItem = {
  workPackageId: string
  serviceCode: string
  stage: string
  itemId: string
  text: string
  evidence: string[]
  line: number | null
}
export type JobPacketView = {
  job: { id: string; projectId: string; projectReference: string; jobState: string }
  packet: { id: string; version: number; contentSha256: string; generatedAt: string; critical: boolean }
  freshness: {
    firstGeneratedAt: string
    lastUpdatedAt: string
    checkedAt: string
    latestVersion: number
    current: boolean
  }
  review: {
    lastViewed: { version: number; viewedAt: string } | null
    fromVersion: number | null
    changes: Change[]
    critical: boolean
  }
  services: { workPackageId: string; serviceCode: string; state: string }[]
  visits: {
    visitId: string
    number: number
    purpose: string
    state: string
    localDate: string
    windowStart: string
    windowEnd: string
    timeZone: string
    team: { staffUserId: string; name: string | null; role: string }[]
    equipment: { equipmentId: string; name: string }[]
    requested: string[]
  }[]
  site: {
    propertyId: string
    address: { street: string; unit: string | null; city: string; state: string; zip: string } | null
    directionsUrl: string | null
    propertyType: string
    details: Detail[]
    accessCodes: { id: string; kind: string; label: string | null; confirmedAt: string }[]
  }
  occupants: Detail[]
  scope: {
    version: number | null
    source: string | null
    createdAt: string | null
    lines: {
      position: number
      kind: string
      description: string | null
      quantity: string | null
      unit: string | null
    }[]
    texts: Record<string, string[]>
    history: { version: number; source: string; createdAt: string }[]
  }
  evidence: { photos: { id: string; uploadedAt: string; uploaderKind: string; url: string | null }[] }
  sop: {
    packages: {
      workPackageId: string
      serviceCode: string
      state: 'pinned' | 'not_configured'
      sopId: string | null
      version: number | null
      reviewState: string | null
    }[]
    preWork: EvidenceItem[]
    completion: EvidenceItem[]
  }
  holds: { holdId: string; kind: string; category: string; state: string; note: string; raisedAt: string }[]
  dependencies: {
    approvedAt: string
    deposit: { required: boolean; state: string } | null
    jobState: string
    blockingHolds: number
    liveVisits: number
  }
  materials: {
    state: 'listed' | 'not_recorded'
    packages: {
      workPackageId: string
      serviceCode: string
      state: 'pinned' | 'not_configured'
      version: number | null
      items: { key: string; group: string | null; name: string | null; criticality: string }[]
    }[]
  }
  communication: {
    siteContact: Detail | null
    stopWork: {
      workPackageId: string
      serviceCode: string
      items: { id: string; text: string; line: number | null }[]
    }[]
  }
  acknowledgments: {
    mine: {
      state: AckState
      assigned: boolean
      acknowledgment: { version: number; acknowledgedAt: string } | null
      invalidation: { reason: string; version: number | null; invalidatedAt: string } | null
      changesSince: Change[]
    }
    team: {
      staffUserId: string
      name: string | null
      state: AckState
      version: number | null
      acknowledgedAt: string | null
      invalidation: string | null
    }[]
  }
  actions: { revealAccessCodes: boolean; acknowledge: boolean }
}
type AckState = 'acknowledged' | 'required' | 'invalidated' | 'not_assigned'

const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')

/** The message of each change code (@handyhub/domain packetChanges). */
const CHANGE_KEYS: Record<string, StaffKey> = {
  job_state: 'packet.change.job_state',
  services_changed: 'packet.change.services_changed',
  visit_added: 'packet.change.visit_added',
  window_changed: 'packet.change.window_changed',
  visit_state: 'packet.change.visit_state',
  visit_removed: 'packet.change.visit_removed',
  worker_added: 'packet.change.worker_added',
  role_changed: 'packet.change.role_changed',
  worker_removed: 'packet.change.worker_removed',
  address_changed: 'packet.change.address_changed',
  property_type: 'packet.change.property_type',
  detail_recorded: 'packet.change.detail_recorded',
  detail_changed: 'packet.change.detail_changed',
  detail_reconfirmed: 'packet.change.detail_reconfirmed',
  detail_removed: 'packet.change.detail_removed',
  access_code_added: 'packet.change.access_code_added',
  access_code_changed: 'packet.change.access_code_changed',
  access_code_removed: 'packet.change.access_code_removed',
  scope_version: 'packet.change.scope_version',
  line_added: 'packet.change.line_added',
  line_removed: 'packet.change.line_removed',
  text_changed: 'packet.change.text_changed',
  options_changed: 'packet.change.options_changed',
  photos_added: 'packet.change.photos_added',
  photos_removed: 'packet.change.photos_removed',
  package_added: 'packet.change.package_added',
  sop_version: 'packet.change.sop_version',
  sop_review_state: 'packet.change.sop_review_state',
  hold_added: 'packet.change.hold_added',
  hold_changed: 'packet.change.hold_changed',
  hold_ended: 'packet.change.hold_ended',
  equipment_changed: 'packet.change.equipment_changed',
  loadout_changed: 'packet.change.loadout_changed',
  deposit_state: 'packet.change.deposit_state',
}

/** The words of one change: what it is about, labelled by its family where the reference is a code. */
export function changeText(t: T, c: Change): string {
  const ref = (() => {
    if (c.ref === null) return ''
    if (c.section === 'site_access' || c.section === 'occupants')
      return c.code.startsWith('access_code')
        ? codeLabel(t, 'accessSecretKind', c.ref)
        : codeLabel(t, 'propertyDetail', c.ref)
    if (c.section === 'holds') return codeLabel(t, 'hazardCategory', c.ref)
    if (c.section === 'scope' && c.code === 'text_changed') return codeLabel(t, 'scopeText', c.ref)
    if (c.section === 'sop' || c.code === 'loadout_changed') return codeLabel(t, 'service', c.ref)
    return c.ref
  })()
  const value = (v: string | number | null): string | number => {
    if (v === null) return '—'
    if (typeof v === 'number' && c.code.startsWith('photos_')) return v
    if (c.code === 'visit_state' || c.code === 'job_state')
      return codeLabel(t, c.code === 'job_state' ? 'jobState' : 'visitState', String(v))
    if (c.code === 'hold_added' || c.code === 'hold_changed' || c.code === 'hold_ended')
      return codeLabel(t, 'holdState', String(v))
    if (c.code === 'role_changed') return codeLabel(t, 'reservationRole', String(v))
    if (c.code === 'sop_review_state') return codeLabel(t, 'sopReviewState', String(v))
    if (c.code === 'deposit_state') return codeLabel(t, 'depositState', String(v))
    if (c.code === 'property_type') return codeLabel(t, 'propertyType', String(v))
    return String(v)
  }
  const key = CHANGE_KEYS[c.code]
  if (!key) return c.code
  return t(key, { ref, from: value(c.from), to: value(c.to) })
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="staff-request__section staff-packet__section" aria-labelledby={id} data-packet-section>
      <h2 id={id} className="staff-queue__heading">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Details({ t, items, when }: { t: T; items: Detail[]; when: (iso: string) => string }) {
  if (items.length === 0) return <p>{t('packet.nothingRecorded')}</p>
  return (
    <dl className="staff-system__fields">
      {items.map((d) => (
        <div key={d.detail} data-detail={d.detail}>
          <dt>{codeLabel(t, 'propertyDetail', d.detail)}</dt>
          <dd>
            {d.value ?? t('packet.detailCleared')}
            <span className="staff-request__hint">
              {' '}
              {t('packet.detailSource', { source: codeLabel(t, 'detailSource', d.source), time: when(d.confirmedAt) })}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  )
}

function Evidence({ t, items, empty }: { t: T; items: EvidenceItem[]; empty: StaffKey }) {
  if (items.length === 0) return <StateView kind="empty" title={t(empty)} />
  return (
    <ul className="staff-request__list">
      {items.map((e) => (
        <li key={`${e.workPackageId}-${e.itemId}`}>
          <p>
            <strong>{codeLabel(t, 'service', e.serviceCode)}</strong> · {codeLabel(t, 'sopStage', e.stage)}
          </p>
          <p lang="en">{e.text}</p>
          <p className="staff-request__hint">
            {e.evidence.map((k) => codeLabel(t, 'sopEvidence', k)).join(', ')} ·{' '}
            {e.line === null ? t('sop.addedInGraph') : t('sop.vaultLine', { line: e.line })}
          </p>
        </li>
      ))}
    </ul>
  )
}

function AccessCode({
  t,
  fetchImpl,
  propertyId,
  code,
  mayReveal,
  when,
}: {
  t: T
  fetchImpl: Fetch
  propertyId: string
  code: JobPacketView['site']['accessCodes'][number]
  mayReveal: boolean
  when: (iso: string) => string
}) {
  const [revealed, setRevealed] = useState<Revealed | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hide = useCallback(() => setRevealed(null), [])
  // Never printed: the revealed copy is dropped before the page prints.
  useEffect(() => {
    window.addEventListener('beforeprint', hide)
    return () => window.removeEventListener('beforeprint', hide)
  }, [hide])
  async function reveal() {
    setPending(true)
    const r = await call<Revealed>(
      fetchImpl,
      `/staff/properties/${encodeURIComponent(propertyId)}/access-codes/${encodeURIComponent(code.id)}/reveal`,
      { method: 'POST', body: {} },
    )
    setPending(false)
    if (!r.ok)
      return setError(r.error.code === 'RATE_LIMITED' ? t('property.revealLimited') : t('property.revealRefused'))
    setError(null)
    setRevealed(r.data)
  }
  const title = code.label
    ? t('property.codeTitle', { kind: codeLabel(t, 'accessSecretKind', code.kind), label: code.label })
    : codeLabel(t, 'accessSecretKind', code.kind)
  return (
    <li className="staff-packet__code" data-testid="packet-access-code">
      <p>
        <strong className="staff-packet__screen-only">{title}</strong>
        <strong className="staff-packet__print-only">{codeLabel(t, 'accessSecretKind', code.kind)}</strong>
        <span className="staff-request__hint"> · {t('packet.codeConfirmed', { time: when(code.confirmedAt) })}</span>
      </p>
      <div className="staff-packet__secret">
        {revealed ? (
          <RevealedValue t={t} revealed={revealed} onHide={hide} />
        ) : (
          <p className="staff-property__masked">{t('property.masked')}</p>
        )}
        {error ? <StateView kind="error" title={error} /> : null}
        {mayReveal && !revealed ? (
          <Button variant="secondary" pending={pending} onClick={() => void reveal()}>
            {t('property.reveal')}
          </Button>
        ) : null}
      </div>
    </li>
  )
}

const ACK_TONE = {
  acknowledged: 'success',
  required: 'warning',
  invalidated: 'danger',
  not_assigned: 'neutral',
} as const

function ChangeList({ t, changes }: { t: T; changes: Change[] }) {
  return (
    <ul className="staff-request__list">
      {changes.map((c, i) => (
        <li key={i} data-change={c.code} data-critical={c.critical || undefined}>
          <strong>{codeLabel(t, 'packetSection', c.section)}</strong>: {changeText(t, c)}{' '}
          {c.critical ? <StatusBadge tone="danger">{t('packet.changes.criticalBadge')}</StatusBadge> : null}
        </li>
      ))}
    </ul>
  )
}

/** The caller's own review of the packet, and each assigned worker's state (TSK-0072). */
function Review({
  t,
  fetchImpl,
  view,
  when,
  onChanged,
}: {
  t: T
  fetchImpl: Fetch
  view: JobPacketView
  when: (iso: string) => string
  onChanged: () => Promise<void>
}) {
  const ids = useId()
  const [checked, setChecked] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<StaffKey | null>(null)
  const { mine, team } = view.acknowledgments
  const version = view.packet.version
  useEffect(() => setChecked(false), [version])

  async function acknowledge() {
    setPending(true)
    const r = await call(fetchImpl, `/staff/jobs/${encodeURIComponent(view.job.id)}/packet/acknowledgments`, {
      method: 'POST',
      body: { version, contentSha256: view.packet.contentSha256 },
    })
    setPending(false)
    if (!r.ok) {
      const changed = r.error.fieldErrors.some((f) => f.code === 'PACKET_CHANGED')
      setError(changed ? 'packet.ack.changed' : 'packet.ack.failed')
      if (changed) await onChanged()
      return
    }
    setError(null)
    await onChanged()
  }

  const reasonKey: Record<string, StaffKey> = {
    critical_change: 'packet.ack.invalidatedCritical',
    assignment_removed: 'packet.ack.invalidatedRemoved',
    account_disabled: 'packet.ack.invalidatedDisabled',
  }
  return (
    <section
      className="staff-request__section staff-packet__screen-only"
      aria-labelledby={`${ids}-title`}
      data-testid="packet-review"
      data-state={mine.state}
    >
      <h2 id={`${ids}-title`} className="staff-queue__heading">
        {t('packet.ack.title')}
      </h2>
      {mine.state === 'not_assigned' ? (
        <p>{t('packet.ack.notAssigned')}</p>
      ) : mine.state === 'required' ? (
        <StateView kind="blocked" title={t('packet.ack.required')}>
          <p>{t('packet.ack.requiredBody')}</p>
        </StateView>
      ) : mine.state === 'invalidated' ? (
        <StateView kind="blocked" title={t('packet.ack.invalidated', { version: mine.acknowledgment?.version ?? 0 })}>
          <p>
            {t(reasonKey[mine.invalidation?.reason ?? 'critical_change'] ?? 'packet.ack.invalidatedCritical', {
              version: mine.invalidation?.version ?? version,
            })}
          </p>
        </StateView>
      ) : (
        <p data-testid="packet-acknowledged">
          <StatusBadge tone="success">{codeLabel(t, 'acknowledgmentState', 'acknowledged')}</StatusBadge>{' '}
          {t('packet.ack.acknowledged', {
            version: mine.acknowledgment?.version ?? version,
            time: mine.acknowledgment ? when(mine.acknowledgment.acknowledgedAt) : '',
          })}
        </p>
      )}
      {mine.changesSince.length > 0 && mine.acknowledgment ? (
        <>
          <p>
            {mine.state === 'acknowledged'
              ? t('packet.ack.changedSince')
              : t('packet.ack.criticalSince', { version: mine.acknowledgment.version })}
          </p>
          <ChangeList t={t} changes={mine.changesSince} />
        </>
      ) : null}
      {view.actions.acknowledge ? (
        <>
          <div className="staff-estimate__agree">
            <input
              id={`${ids}-confirm`}
              type="checkbox"
              checked={checked}
              onChange={(e) => (setChecked(e.target.checked), setError(null))}
            />
            <label htmlFor={`${ids}-confirm`}>{t('packet.ack.confirm')}</label>
          </div>
          <div className="hh-button-row">
            <Button
              pending={pending}
              {...(checked ? {} : { disabledReason: t('packet.ack.checkFirst') })}
              onClick={() => void acknowledge()}
            >
              {t('packet.ack.button', { version })}
            </Button>
          </div>
        </>
      ) : null}
      {error ? <StateView kind="error" title={t(error)} /> : null}
      <p className="staff-request__hint">{t('packet.ack.releasesNothing')}</p>
      <h3 className="hh-h5">{t('packet.ack.team')}</h3>
      {team.length === 0 ? (
        <p>{t('packet.ack.noTeam')}</p>
      ) : (
        <ul className="staff-request__list" data-testid="packet-review-team">
          {team.map((w) => (
            <li key={w.staffUserId} data-state={w.state}>
              {w.name ?? t('packet.unnamed')}:{' '}
              <StatusBadge tone={ACK_TONE[w.state]}>
                {w.version !== null && w.state === 'acknowledged'
                  ? t('packet.ack.teamVersion', {
                      state: codeLabel(t, 'acknowledgmentState', w.state),
                      version: w.version,
                    })
                  : codeLabel(t, 'acknowledgmentState', w.state)}
              </StatusBadge>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The packet of one job, as the server answers it now. */
export function JobPacketPage({
  t,
  locale,
  fetchImpl,
  jobId,
  href = (to) => to,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  jobId: string
  href?: (to: string) => string
}) {
  const ids = useId()
  const [view, setView] = useState<JobPacketView | null | undefined>(undefined)
  const [printedAt, setPrintedAt] = useState<string | null>(null)
  const [printError, setPrintError] = useState(false)
  const [printing, setPrinting] = useState(false)
  const recorded = useRef<number | null>(null)
  const load = useCallback(async () => {
    const r = await call<JobPacketView>(fetchImpl, `/staff/jobs/${encodeURIComponent(jobId)}/packet`)
    setView(r.ok ? r.data : null)
  }, [fetchImpl, jobId])
  useEffect(() => {
    void load()
  }, [load])
  // Opening a version records that this person viewed it (the next "since you reviewed" starts there).
  useEffect(() => {
    if (!view || recorded.current === view.packet.version) return
    recorded.current = view.packet.version
    void call(fetchImpl, `/staff/jobs/${encodeURIComponent(jobId)}/packet/views`, {
      method: 'POST',
      body: { version: view.packet.version },
    })
  }, [view, fetchImpl, jobId])
  useEffect(() => {
    if (printedAt) window.print()
  }, [printedAt])

  if (view === undefined) return <StateView kind="loading" title={t('packet.loading')} />
  if (view === null)
    return (
      <section className="staff-screen">
        <StateView kind="blocked" title={t('packet.unavailable')}>
          <p>{t('packet.unavailableBody')}</p>
        </StateView>
      </section>
    )
  const fmt = new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' })
  const when = (iso: string) => fmt.format(new Date(iso))
  const v = view

  async function print() {
    setPrinting(true)
    const r = await call<{ exportedAt: string }>(fetchImpl, `/staff/jobs/${encodeURIComponent(jobId)}/packet/exports`, {
      method: 'POST',
      body: { version: v.packet.version, format: 'print' },
    })
    setPrinting(false)
    if (!r.ok) return setPrintError(true)
    setPrintError(false)
    setPrintedAt(r.data.exportedAt)
  }

  const section = (key: string) => `${ids}-${key}`
  return (
    <article className="staff-screen staff-packet" aria-labelledby={`${ids}-title`} data-testid="job-packet">
      <p className="staff-packet__print-only" data-testid="packet-print-mark">
        {t('packet.print.mark', {
          time: printedAt ? when(printedAt) : when(v.freshness.checkedAt),
          version: v.packet.version,
        })}
      </p>
      <h1 id={`${ids}-title`} className="hh-h3">
        {t('packet.title', { reference: v.job.projectReference })}
      </h1>
      <dl className="staff-system__fields" data-testid="packet-freshness">
        <div>
          <dt>{t('packet.field.version')}</dt>
          <dd data-testid="packet-version">
            {t('packet.versionValue', { version: v.packet.version })}{' '}
            {v.freshness.current ? (
              <StatusBadge tone="success">{t('packet.latest')}</StatusBadge>
            ) : (
              <StatusBadge tone="warning">{t('packet.notLatest', { latest: v.freshness.latestVersion })}</StatusBadge>
            )}
          </dd>
        </div>
        <div>
          <dt>{t('packet.field.firstGenerated')}</dt>
          <dd>{when(v.freshness.firstGeneratedAt)}</dd>
        </div>
        <div>
          <dt>{t('packet.field.lastUpdated')}</dt>
          <dd>{when(v.freshness.lastUpdatedAt)}</dd>
        </div>
        <div>
          <dt>{t('packet.field.checked')}</dt>
          <dd>{when(v.freshness.checkedAt)}</dd>
        </div>
      </dl>
      <div className="hh-button-row staff-packet__screen-only">
        <Button variant="secondary" onClick={() => void load()}>
          {t('packet.refresh')}
        </Button>
        <Button variant="secondary" pending={printing} onClick={() => void print()}>
          {t('packet.print.button')}
        </Button>
        <a
          className="hh-button hh-button--secondary"
          href={`/api/v1/staff/jobs/${encodeURIComponent(jobId)}/packet/pdf?version=${v.packet.version}`}
          download
        >
          {t('packet.pdf.button')}
        </a>
      </div>
      {printError ? <StateView kind="error" title={t('packet.print.failed')} /> : null}
      {printedAt ? (
        <p className="staff-request__hint staff-packet__screen-only" data-testid="packet-printed">
          {t('packet.print.recorded', { time: when(printedAt), version: v.packet.version })}
        </p>
      ) : null}

      <section
        className="staff-request__section staff-packet__changes"
        aria-labelledby={section('changes')}
        data-testid="packet-changes"
      >
        <h2 id={section('changes')} className="staff-queue__heading">
          {t('packet.changes.title')}
        </h2>
        {v.review.lastViewed === null ? (
          <StateView kind="stale" title={t('packet.changes.firstView')} />
        ) : v.review.changes.length === 0 ? (
          <p>{t('packet.changes.none', { version: v.review.lastViewed.version })}</p>
        ) : (
          <>
            {v.review.critical ? (
              <StateView kind="blocked" title={t('packet.changes.critical')}>
                <p>{t('packet.changes.criticalBody')}</p>
              </StateView>
            ) : null}
            <p>{t('packet.changes.since', { from: v.review.fromVersion ?? 0, to: v.packet.version })}</p>
            <ChangeList t={t} changes={v.review.changes} />
          </>
        )}
      </section>

      <Review t={t} fetchImpl={fetchImpl} view={v} when={when} onChanged={load} />

      <Section id={section('identity')} title={t('packet.section.identity')}>
        <dl className="staff-system__fields">
          <div>
            <dt>{t('packet.field.project')}</dt>
            <dd>{v.job.projectReference}</dd>
          </div>
          <div>
            <dt>{t('packet.field.jobState')}</dt>
            <dd>{codeLabel(t, 'jobState', v.job.jobState)}</dd>
          </div>
          <div>
            <dt>{t('packet.field.services')}</dt>
            <dd>{v.services.map((s) => codeLabel(t, 'service', s.serviceCode)).join(', ')}</dd>
          </div>
        </dl>
        {v.visits.length === 0 ? (
          <p>{t('packet.noVisits')}</p>
        ) : (
          <ul className="staff-request__list" data-testid="packet-visits">
            {v.visits.map((x) => (
              <li key={x.visitId}>
                <p>
                  <strong>
                    {t('packet.visitTitle', { number: x.number, purpose: codeLabel(t, 'visitPurpose', x.purpose) })}
                  </strong>{' '}
                  <StatusBadge tone="info">{codeLabel(t, 'visitState', x.state)}</StatusBadge>
                </p>
                <p>
                  {t('packet.window', { date: x.localDate, start: x.windowStart, end: x.windowEnd, zone: x.timeZone })}
                </p>
                <p data-testid="packet-team">
                  {x.team.length
                    ? x.team
                        .map((w) => `${w.name ?? t('packet.unnamed')} (${codeLabel(t, 'reservationRole', w.role)})`)
                        .join(', ')
                    : t('packet.noTeam')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id={section('site')} title={t('packet.section.site_access')}>
        <dl className="staff-system__fields">
          <div>
            <dt>{t('packet.field.address')}</dt>
            <dd data-testid="packet-address">
              {v.site.address
                ? [
                    [v.site.address.street, v.site.address.unit].filter(Boolean).join(' '),
                    v.site.address.city,
                    `${v.site.address.state} ${v.site.address.zip}`,
                  ].join(', ')
                : t('packet.addressUnavailable')}
              {v.site.directionsUrl ? (
                <>
                  {' '}
                  <a
                    className="staff-packet__screen-only"
                    href={v.site.directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t('packet.directions')}
                  </a>
                </>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>{t('packet.field.propertyType')}</dt>
            <dd>{codeLabel(t, 'propertyType', v.site.propertyType)}</dd>
          </div>
        </dl>
        <Details t={t} items={v.site.details} when={when} />
        <h3 className="hh-h5">{t('packet.field.accessCodes')}</h3>
        <p className="staff-request__hint">{t('packet.accessCodesNotice')}</p>
        {v.site.accessCodes.length === 0 ? (
          <p>{t('packet.noAccessCodes')}</p>
        ) : (
          <ul className="staff-request__list">
            {v.site.accessCodes.map((c) => (
              <AccessCode
                key={c.id}
                t={t}
                fetchImpl={fetchImpl}
                propertyId={v.site.propertyId}
                code={c}
                mayReveal={v.actions.revealAccessCodes}
                when={when}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section id={section('occupants')} title={t('packet.section.occupants')}>
        <Details t={t} items={v.occupants} when={when} />
      </Section>

      <Section id={section('scope')} title={t('packet.section.scope')}>
        {v.scope.version === null ? (
          <StateView kind="blocked" title={t('packet.noScope')} />
        ) : (
          <>
            <p data-testid="packet-scope-version">
              {t('packet.scopeVersion', {
                version: v.scope.version,
                source: codeLabel(t, 'scopeSource', v.scope.source ?? ''),
              })}
            </p>
            <div className="staff-sop__table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t('packet.field.description')}</th>
                    <th scope="col">{t('packet.field.quantity')}</th>
                    <th scope="col">{t('packet.field.unit')}</th>
                    <th scope="col">{t('packet.field.kind')}</th>
                  </tr>
                </thead>
                <tbody>
                  {v.scope.lines.map((l) => (
                    <tr key={`${l.position}-${l.description ?? ''}`}>
                      <td>{l.description ?? '—'}</td>
                      <td>{l.quantity ?? '—'}</td>
                      <td>{l.unit ?? '—'}</td>
                      <td>{codeLabel(t, 'estimateLineKind', l.kind)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {Object.entries(v.scope.texts)
              .filter(([, items]) => items.length > 0)
              .map(([k, items]) => (
                <div key={k}>
                  <h3 className="hh-h5">{codeLabel(t, 'scopeText', k)}</h3>
                  <ul>
                    {items.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              ))}
            {v.scope.history.length > 1 ? (
              <p className="staff-request__hint">
                {v.scope.history
                  .map((h) =>
                    t('packet.scopeHistory', {
                      version: h.version,
                      source: codeLabel(t, 'scopeSource', h.source),
                      time: when(h.createdAt),
                    }),
                  )
                  .join(' · ')}
              </p>
            ) : null}
          </>
        )}
      </Section>

      <Section id={section('evidence')} title={t('packet.section.evidence')}>
        {v.evidence.photos.length === 0 ? (
          <p>{t('packet.noPhotos')}</p>
        ) : (
          <>
            <p className="staff-packet__print-only">{t('packet.print.photos', { count: v.evidence.photos.length })}</p>
            <ul className="staff-packet__photos staff-packet__screen-only">
              {v.evidence.photos.map((p, i) =>
                p.url ? (
                  <li key={p.id}>
                    <img
                      src={p.url}
                      alt={t('packet.photoAlt', { n: i + 1, time: when(p.uploadedAt) })}
                      loading="lazy"
                    />
                  </li>
                ) : (
                  <li key={p.id}>{t('packet.photoUnavailable', { n: i + 1 })}</li>
                ),
              )}
            </ul>
          </>
        )}
      </Section>

      <Section id={section('sop')} title={t('packet.section.sop')}>
        <ol className="staff-request__list">
          {v.sop.packages.map((p) => (
            <li key={p.workPackageId} data-work-package={p.serviceCode}>
              <h3 className="hh-h5">{codeLabel(t, 'service', p.serviceCode)}</h3>
              <p>
                {p.state === 'pinned'
                  ? t('packet.sopPinned', {
                      sop: p.sopId ?? '—',
                      version: p.version ?? 0,
                      review: codeLabel(t, 'sopReviewState', p.reviewState ?? ''),
                    })
                  : t('sop.notConfigured.title')}
              </p>
              <div className="staff-packet__screen-only">
                <WorkPackageSop
                  t={t}
                  locale={locale}
                  fetchImpl={fetchImpl}
                  workPackageId={p.workPackageId}
                  when={when}
                />
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section id={section('holds')} title={t('packet.section.holds')}>
        <StateView kind="blocked" title={t('sop.humanReview.title')}>
          <p>{t('sop.humanReview.body')}</p>
        </StateView>
        {v.holds.length === 0 ? (
          <p data-testid="packet-holds">{t('packet.noHolds')}</p>
        ) : (
          <ul className="staff-request__list" data-testid="packet-holds">
            {v.holds.map((h) => (
              <li key={h.holdId}>
                <p>
                  <StatusBadge tone="danger">{codeLabel(t, 'holdState', h.state)}</StatusBadge>{' '}
                  <strong>{codeLabel(t, 'hazardCategory', h.category)}</strong> · {codeLabel(t, 'holdKind', h.kind)}
                </p>
                <p>{holdNoteText(t, h.note)}</p>
                <p className="staff-request__hint">{t('packet.holdRaised', { time: when(h.raisedAt) })}</p>
              </li>
            ))}
          </ul>
        )}
        <p className="staff-request__hint">{t('packet.hazardChecksInSop')}</p>
      </Section>

      <Section id={section('resources')} title={t('packet.section.resources')}>
        {v.visits.every((x) => x.equipment.length === 0 && x.requested.length === 0) ? (
          <p>{t('packet.noEquipment')}</p>
        ) : (
          <ul className="staff-request__list">
            {v.visits.flatMap((x) =>
              [...x.equipment.map((e) => e.name), ...x.requested].map((name, i) => (
                <li key={`${x.visitId}-${i}`}>{t('packet.print.item', { number: x.number, name })}</li>
              )),
            )}
          </ul>
        )}
        {/* TSK-0071: the loadout list per service; confirming and reporting happen on the loadout page. */}
        {v.materials.state === 'listed' ? (
          v.materials.packages.map((p) => (
            <div key={p.workPackageId} data-testid="packet-loadout">
              <h3 className="hh-h4">
                {t('loadout.packetHeading', { service: codeLabel(t, 'service', p.serviceCode) })}
              </h3>
              {p.state === 'not_configured' ? (
                <p>{t('loadout.notConfigured')}</p>
              ) : (
                <ul className="staff-request__list">
                  {p.items.map((i) => (
                    <li key={i.key}>
                      <span lang="en">{i.name ?? i.key}</span>{' '}
                      <StatusBadge tone={i.criticality === 'required' ? 'warning' : 'neutral'}>
                        {codeLabel(t, 'loadoutCriticality', i.criticality)}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        ) : (
          <StateView kind="empty" title={t('packet.materialsNotRecorded')} />
        )}
        <p className="staff-packet__screen-only">
          <a href={href(`/loadouts/${v.job.id}`)} data-testid="packet-loadout-link">
            {t('loadout.open')}
          </a>
        </p>
        {/* TSK-0075: the checklist runs on its own page once the worker has started work. */}
        <p className="staff-packet__screen-only">
          <a href={href(`/checklist/${v.job.id}`)} data-testid="packet-checklist-link">
            {t('checklist.open')}
          </a>
        </p>
      </Section>

      <Section id={section('dependencies')} title={t('packet.section.dependencies')}>
        <dl className="staff-system__fields">
          <div>
            <dt>{t('packet.field.approved')}</dt>
            <dd>{when(v.dependencies.approvedAt)}</dd>
          </div>
          <div>
            <dt>{t('packet.field.deposit')}</dt>
            <dd>{v.dependencies.deposit ? codeLabel(t, 'depositState', v.dependencies.deposit.state) : '—'}</dd>
          </div>
          <div>
            <dt>{t('packet.field.blockingHolds')}</dt>
            <dd>{v.dependencies.blockingHolds}</dd>
          </div>
          <div>
            <dt>{t('packet.field.liveVisits')}</dt>
            <dd>{v.dependencies.liveVisits}</dd>
          </div>
        </dl>
      </Section>

      <Section id={section('prework')} title={t('packet.section.prework')}>
        <Evidence t={t} items={v.sop.preWork} empty="packet.noPreWork" />
      </Section>

      <Section id={section('communication')} title={t('packet.section.communication')}>
        <StateView kind="blocked" title={t('packet.emergencyNeverWait')} />
        <dl className="staff-system__fields">
          <div>
            <dt>{t('packet.field.siteContact')}</dt>
            <dd>{v.communication.siteContact?.value ?? t('packet.nothingRecorded')}</dd>
          </div>
          <div>
            <dt>{t('packet.field.escalation')}</dt>
            <dd data-testid="packet-escalation">{t('packet.escalationNotConfigured')}</dd>
          </div>
        </dl>
        {v.communication.stopWork.map((g) => (
          <details key={g.workPackageId}>
            <summary>{t('packet.print.stopWork', { service: g.serviceCode })}</summary>
            <ul>
              {g.items.map((i) => (
                <li key={i.id} lang="en">
                  {i.text}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </Section>

      <Section id={section('completion')} title={t('packet.section.completion')}>
        <Evidence t={t} items={v.sop.completion} empty="packet.noCompletion" />
        <p>{t('packet.qualityReviewNext')}</p>
        {/* TSK-0084 (HH-QA-04): the punch items assigned to the caller on this job, to record the correction. */}
        <p>
          <a href={href(`/quality-reviews/${v.job.id}`)} data-testid="packet-punch-items-link">
            {t('packet.punchItems')}
          </a>
        </p>
        <StateView kind="empty" title={t('packet.careNotesNone')} />
      </Section>
      {/* TSK-0093 (HH-INC-01): report an incident quickly from the job, and the caller's own reports on it. */}
      <div className="staff-packet__screen-only">
        <JobIncidents t={t} locale={locale} fetchImpl={fetchImpl} jobId={jobId} href={href} />
      </div>
    </article>
  )
}

type MyPacket = {
  jobId: string
  projectReference: string
  version: number
  lastViewedVersion: number | null
  changedSinceViewed: boolean
  criticalSinceViewed: boolean
  acknowledgment: AckState
  acknowledgedVersion: number | null
  visits: {
    visitId: string
    number: number
    localDate: string
    windowStart: string
    windowEnd: string
    timeZone: string
  }[]
}

/** The caller's own assigned jobs with their packets, below the visits of My Day (TSK-0070). */
export function MyJobPackets({ t, fetchImpl, href }: { t: T; fetchImpl: Fetch; href: (to: string) => string }) {
  const ids = useId()
  const [packets, setPackets] = useState<MyPacket[] | null | undefined>(undefined)
  useEffect(() => {
    void (async () => {
      const r = await call<{ packets: MyPacket[] }>(fetchImpl, '/staff/my/job-packets')
      setPackets(r.ok ? r.data.packets : null)
    })()
  }, [fetchImpl])
  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-title`} data-testid="my-job-packets">
      <h2 id={`${ids}-title`} className="staff-queue__heading">
        {t('packet.mine.title')}
      </h2>
      {packets === undefined ? (
        <StateView kind="loading" title={t('packet.loading')} />
      ) : packets === null ? (
        <StateView kind="error" title={t('packet.mine.failed')} />
      ) : packets.length === 0 ? (
        <StateView kind="empty" title={t('packet.mine.none')} />
      ) : (
        <ul className="staff-request__list">
          {packets.map((p) => (
            <li key={p.jobId}>
              <a href={href(`/packets/${p.jobId}`)}>{t('packet.title', { reference: p.projectReference })}</a>{' '}
              <StatusBadge>{t('packet.versionValue', { version: p.version })}</StatusBadge>{' '}
              {p.lastViewedVersion === null ? (
                <StatusBadge tone="info">{t('packet.mine.new')}</StatusBadge>
              ) : p.criticalSinceViewed ? (
                <StatusBadge tone="danger">{t('packet.mine.critical')}</StatusBadge>
              ) : p.changedSinceViewed ? (
                <StatusBadge tone="warning">{t('packet.mine.changed')}</StatusBadge>
              ) : null}{' '}
              <StatusBadge tone={ACK_TONE[p.acknowledgment]}>
                {codeLabel(t, 'acknowledgmentState', p.acknowledgment)}
              </StatusBadge>
              <ul>
                {p.visits.map((x) => (
                  <li key={x.visitId}>
                    {t('packet.window', {
                      date: x.localDate,
                      start: x.windowStart,
                      end: x.windowEnd,
                      zone: x.timeZone,
                    })}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
