// Your data and privacy requests (TSK-0100; HH-PRIV-03, ENT-PrivacyRequest, OWN-DEC-113, OWN-DEC-71, RULE-LANGUAGES).
// From verified project access the customer asks for a copy of their data, a correction or deletion. HandyHub's owner
// reviews each request; nothing is deleted or changed by asking. Asking needs a new one-time code in this session
// (the identity confirmation; the same check as an approval, HH-ID-07). Each request shows its state and, once
// decided, what was deleted, what was kept, why and until when where that is known. A completed export is
// downloaded here as a JSON file. English only; the wording no decision gives is PROPOSED (OQ-PORTAL-WORDING).
// TSK-0136 (HH-PRIV-07, OWN-DEC-175): an open request shows its automatic acknowledgment here (its message wording is
// not given, OQ-MESSAGES-OUTSIDE-THE-21): when it was received, the date HandyHub follows up by, then that the review
// started, the internal target date, and each extension with its new date and reason. The legal deadline is not shown
// (PROPOSED, OQ-PRIVACY-DEADLINE-DETAILS).
import type { CustomerKey } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge, type StatusTone } from '@handyhub/ui'
import { useId, useRef, useState } from 'react'
import {
  idempotencyKey,
  portalApi,
  type Fetch,
  type PrivacyCategory,
  type PrivacyFailure,
  type PrivacyItem,
  type PrivacyKind,
  type PrivacyReason,
  type PrivacyRequest,
  type PrivacyState,
} from './api'
import { Reverify } from './Estimate'
import { calendarDate, t, when } from './labels'
import { useLive } from './live'
import { NotShown } from './States'

const KIND: Record<PrivacyKind, CustomerKey> = {
  export: 'portal.privacy.kind.export',
  correction: 'portal.privacy.kind.correction',
  deletion: 'portal.privacy.kind.deletion',
}
const STATE: Record<PrivacyState, CustomerKey> = {
  received: 'portal.privacy.state.received',
  under_review: 'portal.privacy.state.under_review',
  completed: 'portal.privacy.state.completed',
  partially_completed: 'portal.privacy.state.partially_completed',
  declined: 'portal.privacy.state.declined',
}
const STATE_TONE: Record<PrivacyState, StatusTone> = {
  received: 'info',
  under_review: 'info',
  completed: 'success',
  partially_completed: 'success',
  declined: 'neutral',
}
const CATEGORY: Record<PrivacyCategory, CustomerKey> = {
  login_account: 'portal.privacy.category.login_account',
  access_links: 'portal.privacy.category.access_links',
  account_preferences: 'portal.privacy.category.account_preferences',
  unaccepted_estimates: 'portal.privacy.category.unaccepted_estimates',
  accepted_agreements: 'portal.privacy.category.accepted_agreements',
  requests: 'portal.privacy.category.requests',
  photos: 'portal.privacy.category.photos',
  job_records: 'portal.privacy.category.job_records',
  safety_records: 'portal.privacy.category.safety_records',
  customer_profile: 'portal.privacy.category.customer_profile',
  consent_records: 'portal.privacy.category.consent_records',
  audit_log: 'portal.privacy.category.audit_log',
  privacy_requests: 'portal.privacy.category.privacy_requests',
  third_party_contacts: 'portal.privacy.category.third_party_contacts',
  financial_records: 'portal.privacy.category.financial_records',
}
const REASON: Record<PrivacyReason, CustomerKey> = {
  protected_evidence: 'portal.privacy.reason.protected_evidence',
  retention_period: 'portal.privacy.reason.retention_period',
  hold: 'portal.privacy.reason.hold',
  active_record: 'portal.privacy.reason.active_record',
  needed_by_retained: 'portal.privacy.reason.needed_by_retained',
  erasure_not_available: 'portal.privacy.reason.erasure_not_available',
  consent_evidence: 'portal.privacy.reason.consent_evidence',
  third_party: 'portal.privacy.reason.third_party',
  request_record: 'portal.privacy.reason.request_record',
}
const FAILURE: Record<PrivacyFailure, CustomerKey> = {
  already_open: 'portal.privacy.failure.already_open',
  fresh_verification: 'portal.estimate.failure.fresh_verification',
  not_applicable: 'portal.privacy.failure.failed',
  invalid: 'portal.privacy.failure.invalid',
  rate_limited: 'portal.estimate.failure.rate_limited',
  failed: 'portal.privacy.failure.failed',
  expired: 'portal.estimate.failure.expired',
  unavailable: 'portal.privacy.failure.failed',
}

function Kept({ i }: { i: PrivacyItem }) {
  return (
    <li>
      {[
        t('portal.privacy.outcome.kept', { category: t(CATEGORY[i.category]) }),
        ...(i.reason ? [t(REASON[i.reason])] : []),
        ...(i.years !== null ? [t('portal.privacy.outcome.years', { years: i.years })] : []),
        ...(i.reviewAt ? [t('portal.privacy.outcome.until', { date: when(i.reviewAt) })] : []),
      ].join('; ')}
    </li>
  )
}

/** A completed export, downloaded as a JSON file the browser saves. */
function ExportDownload({ reference, request, fetchImpl }: { reference: string; request: string; fetchImpl: Fetch }) {
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<CustomerKey | null>(null)
  async function download() {
    setPending(true)
    setFailure(null)
    const r = await portalApi.dataExport(fetchImpl, reference, request)
    setPending(false)
    if (!r.ok) return setFailure(FAILURE[r.failure])
    const blob = new Blob([JSON.stringify(r.data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `handyhub-data-${request}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }
  return (
    <>
      <Button pending={pending} onClick={() => void download()}>
        {t('portal.privacy.export.download')}
      </Button>
      {failure ? <StateView kind="error" title={t(failure)} /> : null}
    </>
  )
}

/** TSK-0136: the acknowledgment and the dates of a request not yet decided. */
function Acknowledgment({ r }: { r: PrivacyRequest }) {
  return (
    <div className="portal-privacy__acknowledgment" data-testid="privacy-acknowledgment">
      <p>
        {r.acknowledgedAt
          ? t('portal.privacy.ack.received', { date: when(r.acknowledgedAt) })
          : t('portal.privacy.request.waiting')}
      </p>
      {r.reviewStartedAt ? (
        <p>{t('portal.privacy.ack.reviewing', { date: when(r.reviewStartedAt) })}</p>
      ) : r.acknowledgmentDueOn ? (
        <p>{t('portal.privacy.ack.followUp', { date: calendarDate(r.acknowledgmentDueOn) })}</p>
      ) : null}
      {r.targetOn ? <p>{t('portal.privacy.ack.target', { date: calendarDate(r.targetOn) })}</p> : null}
      {r.extensions.map((e) => (
        <p key={e.targetOn}>{t('portal.privacy.ack.extended', { date: calendarDate(e.targetOn), reason: e.reason })}</p>
      ))}
    </div>
  )
}

function RequestItem({ r, reference, fetchImpl }: { r: PrivacyRequest; reference: string; fetchImpl: Fetch }) {
  const ids = useId()
  return (
    <li className="portal-documents__item" aria-labelledby={`${ids}-name`}>
      <p id={`${ids}-name`}>
        <strong>{t('portal.privacy.request.name', { kind: t(KIND[r.kind]), reference: r.reference })}</strong>{' '}
        <StatusBadge tone={STATE_TONE[r.state]}>{t(STATE[r.state])}</StatusBadge>
      </p>
      <p className="hh-small hh-muted">{t('portal.privacy.request.sent', { date: when(r.submittedAt) })}</p>
      {r.details ? <p className="portal-privacy__details">{r.details}</p> : null}
      {r.outcome ? (
        <div className="portal-privacy__outcome">
          {r.outcome.deleted.length ? (
            <ul aria-label={t('portal.privacy.outcome.deletedTitle')}>
              {r.outcome.deleted.map((d) => (
                <li key={d.category}>{t('portal.privacy.outcome.deleted', { category: t(CATEGORY[d.category]) })}</li>
              ))}
            </ul>
          ) : null}
          {r.outcome.retained.length ? (
            <ul aria-label={t('portal.privacy.outcome.keptTitle')}>
              {r.outcome.retained.map((i) => (
                <Kept key={`${i.category}-${i.reason ?? ''}`} i={i} />
              ))}
            </ul>
          ) : null}
          {r.outcome.excluded.length ? <p>{t('portal.privacy.outcome.others')}</p> : null}
          {r.outcome.accessClosed ? <p>{t('portal.privacy.outcome.accessClosed')}</p> : null}
          {r.kind === 'correction' && r.state === 'completed' ? <p>{t('portal.privacy.outcome.corrected')}</p> : null}
          {r.state === 'declined' ? <p>{t('portal.privacy.outcome.declined')}</p> : null}
          {r.outcome.exportReady ? (
            <ExportDownload reference={reference} request={r.reference} fetchImpl={fetchImpl} />
          ) : null}
        </div>
      ) : (
        <Acknowledgment r={r} />
      )}
    </li>
  )
}

/** One way to ask: the button, and for a correction what to correct. */
function Ask({
  kind,
  reference,
  fetchImpl,
  onSent,
}: {
  kind: PrivacyKind
  reference: string
  fetchImpl: Fetch
  onSent: () => Promise<void>
}) {
  const [details, setDetails] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; key: CustomerKey } | null>(null)
  // One key per request attempt: a double click or a retry never asks twice.
  const key = useRef<string | null>(null)
  async function send() {
    if (kind === 'correction' && !details.trim())
      return setMessage({ kind: 'error', key: 'portal.privacy.failure.invalid' })
    setPending(true)
    setMessage(null)
    key.current = key.current ?? idempotencyKey()
    const r = await portalApi.requestPrivacy(
      fetchImpl,
      reference,
      kind,
      kind === 'correction' ? { details: details.trim() } : {},
      key.current,
    )
    setPending(false)
    if (!r.ok) {
      if (r.failure !== 'failed') key.current = null
      return setMessage({ kind: 'error', key: FAILURE[r.failure] })
    }
    key.current = null
    setDetails('')
    setMessage({ kind: 'success', key: 'portal.privacy.sent' })
    await onSent()
  }
  return (
    <div className="portal-privacy__ask">
      {kind === 'correction' ? (
        <Field
          label={t('portal.privacy.correction.label')}
          multiline
          maxLength={2000}
          value={details}
          onChange={(e) => setDetails(e.target.value)}
        />
      ) : null}
      <Button variant={kind === 'deletion' ? 'danger' : 'secondary'} pending={pending} onClick={() => void send()}>
        {t(
          kind === 'export'
            ? 'portal.privacy.ask.export'
            : kind === 'correction'
              ? 'portal.privacy.ask.correction'
              : 'portal.privacy.ask.deletion',
        )}
      </Button>
      {message ? <StateView kind={message.kind} title={t(message.key)} /> : null}
    </div>
  )
}

export function PrivacyPage({ reference, fetchImpl }: { reference: string; fetchImpl: Fetch }) {
  const ids = useId()
  // Read when shown and after each request; it does not poll (refreshSeconds 0).
  const { live, refresh } = useLive(async () => {
    const r = await portalApi.privacy(fetchImpl, reference)
    return r.ok
      ? { ok: true as const, data: { ...r.data, refreshedAt: new Date().toISOString(), refreshSeconds: 0 } }
      : r
  }, `${reference}/privacy`)
  return (
    <>
      <p className="portal-back">
        <a href={`/portal/p/${encodeURIComponent(reference)}`}>{t('portal.privacy.back', { reference })}</a>
      </p>
      <h1 className="hh-h2">{t('portal.privacy.title')}</h1>
      <p>{t('portal.privacy.intro')}</p>
      <p>{t('portal.privacy.kept')}</p>
      {live.phase !== 'ready' ? (
        <NotShown live={live} loading="portal.privacy.loading" onRetry={() => void refresh()} />
      ) : (
        <>
          <section className="portal-section" aria-labelledby={`${ids}-ask`}>
            <h2 id={`${ids}-ask`} className="hh-h3">
              {t('portal.privacy.ask.title')}
            </h2>
            {live.data.freshVerification ? (
              <>
                <p>{t('portal.privacy.ask.text')}</p>
                {(['export', 'correction', 'deletion'] as const).map((k) => (
                  <Ask key={k} kind={k} reference={reference} fetchImpl={fetchImpl} onSent={refresh} />
                ))}
              </>
            ) : (
              <>
                <p>{t('portal.privacy.verify')}</p>
                <Reverify fetchImpl={fetchImpl} onVerified={refresh} />
              </>
            )}
          </section>
          <section className="portal-section" aria-labelledby={`${ids}-mine`}>
            <h2 id={`${ids}-mine`} className="hh-h3">
              {t('portal.privacy.mine.title')}
            </h2>
            {live.data.requests.length === 0 ? (
              <StateView kind="empty" title={t('portal.privacy.mine.empty')} />
            ) : (
              <ul className="portal-documents" aria-label={t('portal.privacy.mine.title')}>
                {live.data.requests.map((r) => (
                  <RequestItem key={r.reference} r={r} reference={reference} fetchImpl={fetchImpl} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  )
}
