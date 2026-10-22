// Publishing, the version lifecycle and the version history of an estimate (TSK-0055; HH-EST-04, S04, C05, T26, T32,
// OWN-DEC-102, OWN-DEC-118, FACT-AUTOMATIC-MESSAGES).
// - The panel shows what publishing pinned (publisher, time, valid-until time, terms version, the stored customer PDF's
//   SHA-256), the actions the server says the caller may take now, and every version of the estimate with who
//   created, revised and published it. The server decides each action again; a refusal names every reason.
// - Publish asks for a confirmation first, and stays inactive, with the reason beside it, while the readiness check
//   lists something to resolve. Withdraw and Expire now need a written reason; Record the customer's decline takes the
//   customer's optional reason. Revise creates the next version as a draft and opens it.
// - The Owner's publishing setting (Settings): whether Estimators may publish; the Owner always may.
// - TSK-0056 (HH-EST-09): the customer's Request Changes, Decline and Request an Updated Estimate, newest first, with
//   the customer's own words; the queue's estimate_response item links here.
// - TSK-0057 (HH-EST-06, HH-EST-08): the customer's approval: the version, the typed name, the time, the selected
//   options, the approved total and deposit, the terms accepted, the TEST mark, and the job and scheduling task it
//   created. Nothing here confirms an appointment or marks a deposit paid.
// - TSK-0058 (HH-EST-12): the approval receipt PDF (issued, or being prepared) and what happened to each automatic
//   receipt message: while its wording is NOT CONFIGURED each delivery reads "Not sent" with the reason, never sent.
// - TSK-0059: the job's deposit panel (JobDeposit.tsx) under the approval, for the roles that may see payments.
import type { StaffKey } from '@handyhub/i18n'
import { cents, formatUsd } from '@handyhub/money'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { JobDeposit } from './JobDeposit'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number | Date>) => string
type Nav = { go: (to: string) => void; href: (to: string) => string }

type StaffRef = { id: string; name: string | null }
export type Lifecycle = {
  effectiveState: string
  publishedAt: string | null
  publishedBy: StaffRef | null
  validUntil: string | null
  termsVersion: string | null
  firstViewedAt: string | null
  customerPdf: { sha256: string; byteSize: number } | null
  revisedFrom: { versionId: string; version: number } | null
  current: { versionId: string; version: number } | null
  /** TSK-0056 (HH-EST-09): the customer's responses on the estimate, newest first, in their own words. */
  customerResponses?: { kind: string; version: number; at: string; message: string | null }[]
  /** TSK-0057 (HH-EST-06, HH-EST-08): the customer's approval of a version of this estimate, or null. */
  customerApproval?: {
    version: number
    at: string
    fullName: string
    options: number[]
    totalCents: number
    depositCents: number | null
    termsVersion: string
    testMark: boolean
    /** TSK-0059: the job its deposit panel reads. */
    jobId?: string
    jobState: string
    schedulingTaskState: string
    /** TSK-0058: the approval receipt PDF and each automatic receipt message's delivery. */
    receipt?: { state: 'preparing' | 'issued'; issuedAt: string | null; byteSize: number | null }
    receiptDeliveries?: { channel: string; state: string; errorCode: string | null }[]
  } | null
  actions: Record<
    'publish' | 'requestReview' | 'returnToDraft' | 'withdraw' | 'expire' | 'recordDecline' | 'revise',
    boolean
  >
  history: {
    versionId: string
    version: number
    state: string
    effectiveState: string
    stateChangedAt: string
    createdBy: StaffRef
    createdAt: string
    revisedFromVersion: number | null
    lastEditedBy: StaffRef
    lastEditedAt: string
    publishedBy: StaffRef | null
    publishedAt: string | null
    validUntil: string | null
    totalCents: number | null
  }[]
}

/** The parts of the builder view the panel reads; the builder view itself is Estimates.tsx's. */
type VersionLike = {
  id: string
  version: number
  rowVersion: number
  readiness: { ready: boolean }
  lifecycle?: Lifecycle
  /** TSK-0130: whether publishing waits for the Owner's approval. */
  ownerApproval?: { status: string; actions: { publishApproves: boolean } } | null
}

type Pending = 'publish' | 'request-review' | 'return-to-draft' | 'withdraw' | 'expire' | 'record-decline' | 'revise'
type Ask = 'publish' | 'withdraw' | 'expire' | 'record-decline' | null

const usd = (c: number) => formatUsd(cents(c))
const tone = (state: string) =>
  state === 'published' || state === 'accepted'
    ? 'success'
    : state === 'draft' || state === 'in_review'
      ? 'info'
      : 'neutral'

function linkClick(go: (to: string) => void, to: string) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    go(to)
  }
}

/** A refused action in words: readiness reasons with their setting or line, other refusals by their code. */
export function refusalText(t: T, err: ApiErrorBody): string[] {
  if (err.code === 'STALE_VERSION') return [t('estimate.lifecycle.stale')]
  if (err.fieldErrors.length === 0) {
    try {
      return [t(`error.${err.code}` as StaffKey)]
    } catch {
      return [t('estimate.lifecycle.failed')]
    }
  }
  return err.fieldErrors.map((f) => {
    if (f.field.startsWith('readiness.') && f.code === 'NOT_CONFIGURED')
      return t('estimate.lifecycle.notConfigured', {
        setting: codeLabel(t, 'configKey', f.field.slice('readiness.'.length)),
      })
    const line = /^lines\[(\d+)\]$/.exec(f.field)
    if (line)
      return t('estimate.problem.onLine', {
        n: Number(line[1]) + 1,
        problem: codeLabel(t, 'estimateProblem', f.code),
      })
    if (f.field === 'readiness') return codeLabel(t, 'estimateProblem', f.code)
    return codeLabel(t, 'estimateRefusal', f.code)
  })
}

const PATHS: Record<Pending, string> = {
  publish: 'publish',
  'request-review': 'request-review',
  'return-to-draft': 'return-to-draft',
  withdraw: 'withdraw',
  expire: 'expire',
  'record-decline': 'record-decline',
  revise: 'revise',
}

/** The lifecycle panel of the builder: publish, review, withdraw, expire, decline, revise and the history. */
export function EstimateLifecycle<V extends VersionLike>({
  t,
  fetchImpl,
  view,
  onView,
  go,
  href,
}: { t: T; fetchImpl: Fetch; view: V; onView: (next: V) => void } & Nav) {
  const ids = useId()
  const [pending, setPending] = useState<Pending | null>(null)
  const [ask, setAsk] = useState<Ask>(null)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [refused, setRefused] = useState<string[] | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const key = useRef<{ action: Pending; key: string } | null>(null)
  const lc = view.lifecycle
  if (!lc) return null
  const a = lc.actions

  async function act(action: Pending, body: Record<string, unknown> = {}) {
    setPending(action)
    setRefused(null)
    setDone(null)
    if (key.current?.action !== action) key.current = { action, key: idempotencyKey() }
    const r = await call<V | { versionId: string }>(
      fetchImpl,
      `/staff/estimate-versions/${encodeURIComponent(view.id)}/${PATHS[action]}`,
      {
        method: 'POST',
        body,
        headers: {
          'idempotency-key': key.current.key,
          ...(action === 'revise' ? {} : { 'if-match': `"${view.rowVersion}"` }),
        },
      },
    )
    setPending(null)
    if (r.ok || r.status < 500) key.current = null
    if (!r.ok) return setRefused(refusalText(t, r.error))
    setAsk(null)
    setReason('')
    if (action === 'revise') return go(`/estimates/${(r.data as { versionId: string }).versionId}`)
    onView(r.data as V)
    setDone(
      action === 'publish'
        ? t('estimate.lifecycle.published')
        : action === 'withdraw'
          ? t('estimate.lifecycle.withdrawn')
          : action === 'expire'
            ? t('estimate.lifecycle.expired')
            : action === 'record-decline'
              ? t('estimate.lifecycle.declined')
              : t('estimate.lifecycle.changed'),
    )
  }

  function confirmWithReason(action: 'withdraw' | 'expire') {
    if (reason.trim() === '') return setReasonError(t('estimate.lifecycle.reasonRequired'))
    setReasonError(null)
    void act(action, { reason: reason.trim() })
  }

  const fmt = (iso: string) => t('estimate.lifecycle.when', { time: new Date(iso) })
  const name = (r: StaffRef | null) => (r ? (r.name ?? t('queue.unnamed')) : '—')
  const notReady = a.publish && !view.readiness.ready
  // TSK-0130 (HH-EST-16): over the threshold, only the Owner's approval (or the Owner's own publication) lets it out.
  const oaStatus = view.ownerApproval?.status
  const awaitingOwner =
    a.publish &&
    (oaStatus === 'required' || oaStatus === 'pending' || oaStatus === 'rejected') &&
    !view.ownerApproval?.actions.publishApproves

  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-lifecycle`} data-testid="estimate-lifecycle">
      <h2 id={`${ids}-lifecycle`} className="staff-queue__heading">
        {t('estimate.lifecycle.title')}
      </h2>
      <dl className="staff-record">
        <dt>{t('estimate.lifecycle.state')}</dt>
        <dd>
          <StatusBadge tone={tone(lc.effectiveState)}>{codeLabel(t, 'estimateState', lc.effectiveState)}</StatusBadge>
        </dd>
        {lc.revisedFrom ? (
          <>
            <dt>{t('estimate.lifecycle.revisedFrom')}</dt>
            <dd>
              <a
                href={href(`/estimates/${lc.revisedFrom.versionId}`)}
                onClick={linkClick(go, `/estimates/${lc.revisedFrom.versionId}`)}
              >
                {t('estimate.versionN', { n: lc.revisedFrom.version })}
              </a>
            </dd>
          </>
        ) : null}
        {lc.publishedAt ? (
          <>
            <dt>{t('estimate.lifecycle.publishedBy')}</dt>
            <dd>{t('estimate.lifecycle.byOn', { name: name(lc.publishedBy), time: new Date(lc.publishedAt) })}</dd>
          </>
        ) : null}
        {lc.validUntil ? (
          <>
            <dt>{t('estimate.lifecycle.validUntil')}</dt>
            <dd>{fmt(lc.validUntil)}</dd>
          </>
        ) : null}
        {lc.termsVersion ? (
          <>
            <dt>{t('estimate.terms')}</dt>
            <dd>{lc.termsVersion}</dd>
          </>
        ) : null}
        {lc.customerPdf ? (
          <>
            <dt>{t('estimate.lifecycle.storedPdf')}</dt>
            <dd>
              <code className="staff-estimate__hash">{lc.customerPdf.sha256}</code>
            </dd>
          </>
        ) : null}
        {lc.firstViewedAt ? (
          <>
            <dt>{t('estimate.lifecycle.firstViewed')}</dt>
            <dd>{fmt(lc.firstViewedAt)}</dd>
          </>
        ) : null}
      </dl>
      {lc.current && lc.current.versionId !== view.id ? (
        <p>
          {t('estimate.lifecycle.currentIs')}{' '}
          <a
            href={href(`/estimates/${lc.current.versionId}`)}
            onClick={linkClick(go, `/estimates/${lc.current.versionId}`)}
          >
            {t('estimate.versionN', { n: lc.current.version })}
          </a>
        </p>
      ) : null}

      {a.publish ? (
        <div className="staff-estimate__lifecycle-action">
          <p className="staff-request__hint">{t('estimate.lifecycle.publishHint')}</p>
          {ask === 'publish' ? (
            <div role="group" aria-label={t('estimate.lifecycle.publishConfirmTitle', { n: view.version })}>
              <p>
                <strong>{t('estimate.lifecycle.publishConfirmTitle', { n: view.version })}</strong>
              </p>
              <p>{t('estimate.lifecycle.publishConfirm')}</p>
              <div className="hh-button-row">
                <Button pending={pending === 'publish'} onClick={() => void act('publish')}>
                  {t('estimate.lifecycle.publishNow')}
                </Button>
                <Button variant="secondary" onClick={() => setAsk(null)}>
                  {t('estimate.lifecycle.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              {...(notReady
                ? { disabledReason: t('estimate.lifecycle.publishNotReady') }
                : awaitingOwner
                  ? { disabledReason: t('estimate.lifecycle.publishNeedsOwner') }
                  : {})}
              onClick={() => (setAsk('publish'), setRefused(null), setDone(null))}
            >
              {t('estimate.lifecycle.publish')}
            </Button>
          )}
        </div>
      ) : null}

      <div className="hh-button-row">
        {a.requestReview ? (
          <Button variant="secondary" pending={pending === 'request-review'} onClick={() => void act('request-review')}>
            {t('estimate.lifecycle.requestReview')}
          </Button>
        ) : null}
        {a.returnToDraft ? (
          <Button
            variant="secondary"
            pending={pending === 'return-to-draft'}
            onClick={() => void act('return-to-draft')}
          >
            {t('estimate.lifecycle.returnToDraft')}
          </Button>
        ) : null}
        {a.revise ? (
          <Button variant="secondary" pending={pending === 'revise'} onClick={() => void act('revise')}>
            {t('estimate.lifecycle.revise')}
          </Button>
        ) : null}
        {a.recordDecline && ask !== 'record-decline' ? (
          <Button variant="secondary" onClick={() => (setAsk('record-decline'), setReason(''), setRefused(null))}>
            {t('estimate.lifecycle.recordDecline')}
          </Button>
        ) : null}
        {a.withdraw && ask !== 'withdraw' ? (
          <Button variant="danger" onClick={() => (setAsk('withdraw'), setReason(''), setRefused(null))}>
            {t('estimate.lifecycle.withdraw')}
          </Button>
        ) : null}
        {a.expire && ask !== 'expire' ? (
          <Button variant="danger" onClick={() => (setAsk('expire'), setReason(''), setRefused(null))}>
            {t('estimate.lifecycle.expire')}
          </Button>
        ) : null}
      </div>
      {a.revise ? <p className="staff-request__hint">{t('estimate.lifecycle.reviseHint')}</p> : null}

      {ask === 'withdraw' || ask === 'expire' ? (
        <div
          role="group"
          aria-label={t(ask === 'withdraw' ? 'estimate.lifecycle.withdraw' : 'estimate.lifecycle.expire')}
        >
          <Field
            multiline
            label={t('estimate.lifecycle.reason')}
            hint={t(ask === 'withdraw' ? 'estimate.lifecycle.withdrawHint' : 'estimate.lifecycle.expireHint')}
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            {...(reasonError ? { error: reasonError } : {})}
          />
          <div className="hh-button-row">
            <Button variant="danger" pending={pending === ask} onClick={() => confirmWithReason(ask)}>
              {t(ask === 'withdraw' ? 'estimate.lifecycle.withdrawNow' : 'estimate.lifecycle.expireNow')}
            </Button>
            <Button variant="secondary" onClick={() => (setAsk(null), setReasonError(null))}>
              {t('estimate.lifecycle.cancel')}
            </Button>
          </div>
        </div>
      ) : null}
      {ask === 'record-decline' ? (
        <div role="group" aria-label={t('estimate.lifecycle.recordDecline')}>
          <Field
            multiline
            label={t('estimate.lifecycle.declineReason')}
            hint={t('estimate.lifecycle.declineHint')}
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="hh-button-row">
            <Button
              pending={pending === 'record-decline'}
              onClick={() => void act('record-decline', reason.trim() ? { reason: reason.trim() } : {})}
            >
              {t('estimate.lifecycle.recordDeclineNow')}
            </Button>
            <Button variant="secondary" onClick={() => setAsk(null)}>
              {t('estimate.lifecycle.cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      {refused ? <StateView kind="error" title={t('estimate.lifecycle.refused')} reasons={refused} /> : null}
      {done ? <StateView kind="success" title={done} /> : null}

      <h3 id={`${ids}-history`}>{t('estimate.lifecycle.history')}</h3>
      <div className="staff-estimate__history">
        <table aria-labelledby={`${ids}-history`}>
          <thead>
            <tr>
              <th scope="col">{t('estimate.version')}</th>
              <th scope="col">{t('estimate.lifecycle.state')}</th>
              <th scope="col">{t('estimate.lifecycle.createdBy')}</th>
              <th scope="col">{t('estimate.lifecycle.publishedBy')}</th>
              <th scope="col">{t('estimate.lifecycle.validUntil')}</th>
              <th scope="col">{t('estimate.total')}</th>
            </tr>
          </thead>
          <tbody>
            {lc.history.map((h) => (
              <tr key={h.versionId} aria-current={h.versionId === view.id ? 'true' : undefined}>
                <th scope="row">
                  {h.versionId === view.id ? (
                    t('estimate.versionN', { n: h.version })
                  ) : (
                    <a href={href(`/estimates/${h.versionId}`)} onClick={linkClick(go, `/estimates/${h.versionId}`)}>
                      {t('estimate.versionN', { n: h.version })}
                    </a>
                  )}
                </th>
                <td>
                  <StatusBadge tone={tone(h.effectiveState)}>
                    {codeLabel(t, 'estimateState', h.effectiveState)}
                  </StatusBadge>
                </td>
                <td>
                  {h.revisedFromVersion === null
                    ? t('estimate.lifecycle.createdByOn', { name: name(h.createdBy), time: new Date(h.createdAt) })
                    : t('estimate.lifecycle.revisedByOn', {
                        name: name(h.createdBy),
                        n: h.revisedFromVersion,
                        time: new Date(h.createdAt),
                      })}
                </td>
                <td>
                  {h.publishedAt
                    ? t('estimate.lifecycle.byOn', { name: name(h.publishedBy), time: new Date(h.publishedAt) })
                    : t('estimate.lifecycle.notPublished')}
                </td>
                <td>{h.validUntil ? fmt(h.validUntil) : '—'}</td>
                <td>{h.totalCents === null ? t('estimate.totalPending') : usd(h.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="staff-request__hint">{t('estimate.lifecycle.historyHint')}</p>

      <h3 id={`${ids}-responses`}>{t('estimate.responses.title')}</h3>
      {lc.customerResponses?.length ? (
        <ol className="staff-estimate__responses" aria-labelledby={`${ids}-responses`}>
          {lc.customerResponses.map((r) => (
            <li key={`${r.at}-${r.kind}-${r.version}`}>
              <p>
                <strong>
                  {t('estimate.responses.entry', {
                    kind: codeLabel(t, 'estimateResponseKind', r.kind),
                    n: r.version,
                    time: new Date(r.at),
                  })}
                </strong>
              </p>
              {/* The customer's own words, exactly as written (HH-PORT-08): never translated. */}
              {r.message ? (
                <p className="staff-estimate__customer-words">{r.message}</p>
              ) : (
                <p>{t('estimate.responses.noMessage')}</p>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p>{t('estimate.responses.none')}</p>
      )}
      <p className="staff-request__hint">{t('estimate.responses.hint')}</p>

      <h3 id={`${ids}-approval`}>{t('estimate.approval.title')}</h3>
      {lc.customerApproval ? (
        <div aria-labelledby={`${ids}-approval`} role="group" data-testid="estimate-customer-approval">
          {lc.customerApproval.testMark ? (
            <p>
              <StatusBadge tone="warning">{t('estimate.approval.test')}</StatusBadge>
            </p>
          ) : null}
          <p>
            <strong>
              {t('estimate.approval.entry', {
                n: lc.customerApproval.version,
                // The customer's typed name, exactly as given (HH-PORT-08): never translated.
                name: lc.customerApproval.fullName,
                time: new Date(lc.customerApproval.at),
              })}
            </strong>
          </p>
          <dl className="staff-record">
            <dt>{t('estimate.approval.total')}</dt>
            <dd>{usd(lc.customerApproval.totalCents)}</dd>
            <dt>{t('estimate.approval.deposit')}</dt>
            <dd>
              {lc.customerApproval.depositCents === null
                ? t('estimate.approval.noDeposit')
                : usd(lc.customerApproval.depositCents)}
            </dd>
            <dt>{t('estimate.approval.options')}</dt>
            <dd>
              {lc.customerApproval.options.length
                ? lc.customerApproval.options.join(', ')
                : t('estimate.approval.noOptions')}
            </dd>
            <dt>{t('estimate.approval.terms')}</dt>
            <dd>{lc.customerApproval.termsVersion}</dd>
            <dt>{t('estimate.approval.job')}</dt>
            <dd>{codeLabel(t, 'jobState', lc.customerApproval.jobState)}</dd>
            <dt>{t('estimate.approval.task')}</dt>
            <dd>{codeLabel(t, 'schedulingTaskState', lc.customerApproval.schedulingTaskState)}</dd>
            {lc.customerApproval.receipt ? (
              <>
                <dt>{t('estimate.approval.receipt')}</dt>
                <dd data-testid="approval-receipt-state">
                  {lc.customerApproval.receipt.state === 'issued' && lc.customerApproval.receipt.issuedAt
                    ? t('estimate.approval.receiptIssued', { time: new Date(lc.customerApproval.receipt.issuedAt) })
                    : t('estimate.approval.receiptPreparing')}
                </dd>
              </>
            ) : null}
            {lc.customerApproval.receiptDeliveries ? (
              <>
                <dt>{t('estimate.approval.receiptMessages')}</dt>
                <dd data-testid="approval-receipt-deliveries">
                  {lc.customerApproval.receiptDeliveries.length ? (
                    <ul>
                      {lc.customerApproval.receiptDeliveries.map((d) => {
                        const values = {
                          channel: codeLabel(t, 'deliveryChannel', d.channel),
                          state: codeLabel(t, 'deliveryState', d.state),
                        }
                        return (
                          <li key={d.channel}>
                            {d.errorCode
                              ? t('estimate.approval.deliveryReason', {
                                  ...values,
                                  reason: codeLabel(t, 'deliveryError', d.errorCode),
                                })
                              : t('estimate.approval.delivery', values)}
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    t('estimate.approval.receiptNoMessages')
                  )}
                </dd>
              </>
            ) : null}
          </dl>
          {lc.customerApproval.jobId ? (
            <JobDeposit t={t} fetchImpl={fetchImpl} jobId={lc.customerApproval.jobId} />
          ) : null}
        </div>
      ) : (
        <p>{t('estimate.approval.none')}</p>
      )}
      <p className="staff-request__hint">{t('estimate.approval.hint')}</p>
    </section>
  )
}

type Setting = {
  state: 'CONFIGURED' | 'NOT_CONFIGURED'
  version: number | null
  roles: string[]
  estimatorsMayPublish: boolean
}

/** The Owner's publishing policy (OWN-DEC-118): whether Estimators may publish. Hidden when the server refuses it. */
export function EstimatePublishingSetting({ t, fetchImpl }: { t: T; fetchImpl: Fetch }) {
  const ids = useId()
  const [setting, setSetting] = useState<Setting | null | undefined>(undefined)
  const [checked, setChecked] = useState(false)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<'saved' | 'stale' | 'failed' | null>(null)
  const key = useRef<string | null>(null)
  useEffect(() => {
    void call<Setting>(fetchImpl, '/staff/settings/estimate-publishing').then((r) => {
      const ok = r.ok && typeof r.data?.estimatorsMayPublish === 'boolean'
      setSetting(ok ? r.data : null)
      if (ok) setChecked(r.data.estimatorsMayPublish)
    })
  }, [fetchImpl])
  if (!setting) return null

  async function save() {
    if (!setting) return
    setPending(true)
    setResult(null)
    key.current = key.current ?? idempotencyKey()
    const r = await call<Setting>(fetchImpl, '/staff/settings/estimate-publishing', {
      method: 'PUT',
      body: { estimatorsMayPublish: checked },
      headers: { 'idempotency-key': key.current, 'if-match': `"${setting.version ?? 0}"` },
    })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (!r.ok) return setResult(r.error.code === 'STALE_VERSION' ? 'stale' : 'failed')
    setSetting(r.data)
    setChecked(r.data.estimatorsMayPublish)
    setResult('saved')
  }

  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-publishing`} data-testid="estimate-publishing">
      <h2 id={`${ids}-publishing`} className="staff-queue__heading">
        {t('estimate.publishing.title')}
      </h2>
      <p className="staff-request__hint">{t('estimate.publishing.hint')}</p>
      <div className="staff-estimate__agree">
        <input
          id={`${ids}-estimators`}
          type="checkbox"
          checked={checked}
          onChange={(e) => (setChecked(e.target.checked), setResult(null))}
        />
        <label htmlFor={`${ids}-estimators`}>{t('estimate.publishing.estimators')}</label>
      </div>
      <p>{t('estimate.publishing.ownerAlways')}</p>
      <div className="hh-button-row">
        <Button
          pending={pending}
          {...(checked === setting.estimatorsMayPublish ? { disabledReason: t('estimate.publishing.unchanged') } : {})}
          onClick={() => void save()}
        >
          {t('estimate.publishing.save')}
        </Button>
      </div>
      {result === 'saved' ? <StateView kind="success" title={t('estimate.publishing.saved')} /> : null}
      {result === 'stale' ? <StateView kind="error" title={t('estimate.lifecycle.stale')} /> : null}
      {result === 'failed' ? <StateView kind="error" title={t('estimate.publishing.failed')} /> : null}
    </section>
  )
}
