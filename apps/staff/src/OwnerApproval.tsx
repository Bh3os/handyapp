// The Owner's approval before publishing over the threshold (TSK-0130; HH-EST-16, OWN-DEC-173 with the final owner
// amendments of 2026-10-22, FACT-OWNER-APPROVAL-THRESHOLD, FACT-MARGIN-TARGET, S04, S11). Staff side, English and
// Spanish.
// - EstimateOwnerApproval (the builder): whether publishing this version needs the Owner and why (the threshold in
//   force, the proposed total, the highest total its options allow, the project's documents counted together, the
//   flags), every approval record of the version, "Ask the Owner to approve" for the people who publish, and for the
//   Owner the details and Approve / Reject with a comment. The server decides each again.
// - PublicationApprovalQueue (Owner Decisions): the pending approvals with the reference, proposed price, labor and
//   material costs, gross profit and margin only from costs that exist, discounts, change-order adjustments, the reason
//   and the preparer, each linking to the document.
// - ApprovalThresholdSetting (Settings): the threshold in force; the Owner changes it with a reason and a fresh
//   sign-in (an audited configuration version).
import type { StaffKey } from '@handyhub/i18n'
import { cents, centsFromDecimal, formatUsd } from '@handyhub/money'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { ReauthForm, useOwnerWrite } from './OwnerWrite'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number | Date>) => string
/** The queue screen's translator (no dates). */
type TQ = (key: StaffKey, values?: Record<string, string | number>) => string
type StaffRef = { id: string; name: string | null }

export type ApprovalRecord = {
  id: string
  subjectType: string
  subjectId: string
  projectId: string
  projectReference: string | null
  reference: string
  documentVersion: number
  state: 'pending' | 'approved' | 'rejected' | 'invalidated'
  basis: 'request' | 'owner_publication'
  reasons: string[]
  flags: string[]
  proposedTotalCents: number
  highestTotalCents: number | null
  subtotalCents: number | null
  discount: { category: string | null; amountCents: number } | null
  changeOrder: { adjustmentCents: number; revisedProjectValueCents: number | null } | null
  combinedProjectCents: number
  thresholdCents: number | null
  thresholdVersion: number | null
  linked: { reference: string; version: number; state: string; valueCents: number }[]
  costs: {
    laborCents: number | null
    materialCents: number | null
    complete: boolean
    grossProfitCents: number | null
    marginBps: number | null
    /** TSK-0131: the target gross margin and where this estimated margin stands (advisory, never a block). */
    targetBps: number | null
    targetFlag: string
  } | null
  requestedBy: StaffRef
  requestedAt: string
  decidedBy: StaffRef | null
  decidedAt: string | null
  comment: string | null
  invalidatedAt: string | null
  invalidatedReason: string | null
  usedAt: string | null
  rowVersion: number
}

export type OwnerApprovalState = {
  status: 'closed' | 'incomplete' | 'not_required' | 'required' | 'pending' | 'approved' | 'rejected'
  evaluation: {
    required: boolean
    reasons: string[]
    flags: string[]
    thresholdCents: number | null
    thresholdVersion: number | null
    proposedTotalCents: number
    highestTotalCents: number | null
    combinedProjectCents: number
    linked: { reference: string; version: number; state: string; valueCents: number }[]
  } | null
  usedApprovalId: string | null
  pendingApprovalId: string | null
  records: ApprovalRecord[]
  actions: { request: boolean; decide: boolean; publishApproves: boolean }
}

const usd = (c: number) => formatUsd(cents(c))
const percent = (bps: number) => `${(bps / 100).toFixed(2)}%`
const tone = (s: string) =>
  s === 'approved' || s === 'not_required'
    ? 'success'
    : s === 'rejected'
      ? 'danger'
      : s === 'pending' || s === 'required'
        ? 'warning'
        : 'neutral'

/** A refusal in words: each field error's code labelled. */
function refusal(t: T, err: ApiErrorBody): string[] {
  if (err.code === 'STALE_VERSION') return [t('ownerApproval.stale')]
  if (err.code === 'FRESH_AUTH_REQUIRED') return [t('ownerApproval.freshSignIn')]
  if (err.fieldErrors.length === 0) return [t('ownerApproval.failed')]
  return err.fieldErrors.map((f) =>
    f.field === 'ownerApproval.reasons'
      ? codeLabel(t, 'publicationApprovalReason', f.code)
      : codeLabel(t, 'estimateRefusal', f.code),
  )
}

/** The known costs, gross profit and margin of a record; incomplete costs never show a final margin. */
function CostsView({ t, costs, price }: { t: T; costs: ApprovalRecord['costs']; price: number }) {
  if (!costs) return <p>{t('ownerApproval.costsNone')}</p>
  return (
    <dl className="staff-record">
      <dt>{t('ownerApproval.proposedPrice')}</dt>
      <dd>{usd(price)}</dd>
      <dt>{t('ownerApproval.laborCost')}</dt>
      <dd>{costs.laborCents === null ? '—' : usd(costs.laborCents)}</dd>
      <dt>{t('ownerApproval.materialCost')}</dt>
      <dd>{costs.materialCents === null ? '—' : usd(costs.materialCents)}</dd>
      <dt>{t('ownerApproval.grossProfit')}</dt>
      <dd>{costs.grossProfitCents === null ? t('ownerApproval.costsIncomplete') : usd(costs.grossProfitCents)}</dd>
      <dt>{t('ownerApproval.margin')}</dt>
      <dd>{costs.marginBps === null ? t('ownerApproval.costsIncomplete') : percent(costs.marginBps)}</dd>
      <dt>{t('ownerApproval.marginTarget')}</dt>
      <dd>
        <MarginAgainstTarget t={t} costs={costs} />
      </dd>
    </dl>
  )
}

/** The estimated margin against the target (TSK-0131): advisory, it never changes the approval. */
function MarginAgainstTarget({ t, costs }: { t: TQ; costs: NonNullable<ApprovalRecord['costs']> }) {
  if (costs.targetBps === null) return <>{t('jobMargin.targetNotConfigured')}</>
  return (
    <StatusBadge tone={costs.targetFlag === 'below_target' ? 'warning' : 'neutral'}>
      <span data-testid="approval-margin-flag" data-flag={costs.targetFlag}>
        {t('ownerApproval.marginFlag', {
          flag: codeLabel(t, 'marginFlag', costs.targetFlag),
          target: percent(costs.targetBps),
        })}
      </span>
    </StatusBadge>
  )
}

function RecordView({ t, r }: { t: T; r: ApprovalRecord }) {
  const name = (s: StaffRef | null) => (s ? (s.name ?? t('queue.unnamed')) : '—')
  return (
    <li data-testid="owner-approval-record">
      <p>
        <StatusBadge tone={tone(r.state)}>{codeLabel(t, 'publicationApprovalState', r.state)}</StatusBadge>{' '}
        {r.basis === 'owner_publication'
          ? t('ownerApproval.byOwnerPublication', {
              name: name(r.decidedBy),
              time: new Date(r.decidedAt ?? r.requestedAt),
            })
          : t('ownerApproval.requestedByOn', { name: name(r.requestedBy), time: new Date(r.requestedAt) })}
      </p>
      <p>
        {t('ownerApproval.recordFor', {
          reference: r.reference,
          n: r.documentVersion,
          total: usd(r.proposedTotalCents),
        })}
      </p>
      {r.decidedAt && r.basis === 'request' ? (
        <p>{t('ownerApproval.decidedByOn', { name: name(r.decidedBy), time: new Date(r.decidedAt) })}</p>
      ) : null}
      {/* The Owner's own words, as written. */}
      {r.comment ? <p className="staff-estimate__customer-words">{r.comment}</p> : null}
      {r.invalidatedReason ? <p>{codeLabel(t, 'publicationInvalidation', r.invalidatedReason)}</p> : null}
      {r.usedAt ? <p>{t('ownerApproval.used', { time: new Date(r.usedAt) })}</p> : null}
    </li>
  )
}

/** The Owner approval panel of the estimate builder. */
export function EstimateOwnerApproval<
  V extends { id: string; rowVersion: number; ownerApproval?: OwnerApprovalState | null },
>({ t, fetchImpl, view, onView }: { t: T; fetchImpl: Fetch; view: V; onView: (next: V) => void }) {
  const ids = useId()
  const [pending, setPending] = useState<'request' | 'approve' | 'reject' | null>(null)
  const [comment, setComment] = useState('')
  const [commentError, setCommentError] = useState<string | null>(null)
  const [refused, setRefused] = useState<string[] | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const key = useRef<{ action: string; key: string } | null>(null)
  const oa = view.ownerApproval
  if (!oa || (oa.status === 'closed' && oa.records.length === 0)) return null
  const ev = oa.evaluation
  const waiting = oa.records.find((r) => r.id === oa.pendingApprovalId) ?? null
  const keyFor = (action: string) => {
    if (key.current?.action !== action) key.current = { action, key: idempotencyKey() }
    return key.current.key
  }
  const reload = async () => {
    const r = await call<V>(fetchImpl, `/staff/estimate-versions/${encodeURIComponent(view.id)}`)
    if (r.ok) onView(r.data)
  }

  async function request() {
    setPending('request')
    setRefused(null)
    setDone(null)
    const r = await call<V>(fetchImpl, `/staff/estimate-versions/${encodeURIComponent(view.id)}/owner-approval`, {
      method: 'POST',
      body: {},
      headers: { 'idempotency-key': keyFor('request'), 'if-match': `"${view.rowVersion}"` },
    })
    setPending(null)
    if (r.ok || r.status < 500) key.current = null
    if (!r.ok) return setRefused(refusal(t, r.error))
    onView(r.data)
    setDone(t('ownerApproval.requested'))
  }

  async function decideNow(decision: 'approve' | 'reject') {
    if (!waiting) return
    if (comment.trim() === '') return setCommentError(t('ownerApproval.commentRequired'))
    setCommentError(null)
    setPending(decision)
    setRefused(null)
    setDone(null)
    const r = await call<ApprovalRecord>(
      fetchImpl,
      `/staff/publication-approvals/${encodeURIComponent(waiting.id)}/decision`,
      {
        method: 'POST',
        body: { decision, comment: comment.trim() },
        headers: { 'idempotency-key': keyFor(decision), 'if-match': `"${waiting.rowVersion}"` },
      },
    )
    setPending(null)
    if (r.ok || r.status < 500) key.current = null
    if (!r.ok) return setRefused(refusal(t, r.error))
    setComment('')
    await reload()
    setDone(decision === 'approve' ? t('ownerApproval.approved') : t('ownerApproval.rejected'))
  }

  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-owner`} data-testid="owner-approval">
      <h2 id={`${ids}-owner`} className="staff-queue__heading">
        {t('ownerApproval.title')}
      </h2>
      <p>
        <StatusBadge tone={tone(oa.status)}>{codeLabel(t, 'publicationApprovalStatus', oa.status)}</StatusBadge>
      </p>
      {ev ? (
        <dl className="staff-record">
          <dt>{t('ownerApproval.threshold')}</dt>
          <dd>
            {ev.thresholdCents === null
              ? t('ownerApproval.thresholdNotConfigured')
              : t('ownerApproval.thresholdValue', { amount: usd(ev.thresholdCents), n: ev.thresholdVersion ?? 0 })}
          </dd>
          <dt>{t('ownerApproval.proposedTotal')}</dt>
          <dd>{usd(ev.proposedTotalCents)}</dd>
          {ev.highestTotalCents !== null && ev.highestTotalCents !== ev.proposedTotalCents ? (
            <>
              <dt>{t('ownerApproval.highestTotal')}</dt>
              <dd>{usd(ev.highestTotalCents)}</dd>
            </>
          ) : null}
          {ev.linked.length ? (
            <>
              <dt>{t('ownerApproval.combined')}</dt>
              <dd>
                {usd(ev.combinedProjectCents)}
                <ul>
                  {ev.linked.map((d) => (
                    <li key={`${d.reference}-${d.version}`}>
                      {t('ownerApproval.linkedEntry', {
                        reference: d.reference,
                        n: d.version,
                        state: codeLabel(t, 'estimateState', d.state),
                        amount: usd(d.valueCents),
                      })}
                    </li>
                  ))}
                </ul>
              </dd>
            </>
          ) : null}
          {ev.reasons.length ? (
            <>
              <dt>{t('ownerApproval.reasons')}</dt>
              <dd>
                <ul>
                  {ev.reasons.map((r) => (
                    <li key={r}>{codeLabel(t, 'publicationApprovalReason', r)}</li>
                  ))}
                </ul>
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}
      {oa.status === 'incomplete' ? <p>{t('ownerApproval.incomplete')}</p> : null}
      {oa.actions.publishApproves ? <p className="staff-request__hint">{t('ownerApproval.ownerPublishes')}</p> : null}

      {oa.actions.request ? (
        <div className="hh-button-row">
          <Button pending={pending === 'request'} onClick={() => void request()}>
            {t('ownerApproval.request')}
          </Button>
        </div>
      ) : null}
      {oa.status === 'pending' && !oa.actions.decide ? <p>{t('ownerApproval.waiting')}</p> : null}

      {oa.actions.decide && waiting ? (
        <div role="group" aria-label={t('ownerApproval.decideTitle')} data-testid="owner-approval-decide">
          <h3>{t('ownerApproval.decideTitle')}</h3>
          <p>{t('ownerApproval.preparedBy', { name: waiting.requestedBy.name ?? t('queue.unnamed') })}</p>
          {waiting.discount ? (
            <p>
              {t('ownerApproval.discount', {
                category: codeLabel(t, 'discountCategory', waiting.discount.category ?? ''),
                amount: usd(waiting.discount.amountCents),
              })}
            </p>
          ) : (
            <p>{t('ownerApproval.noDiscount')}</p>
          )}
          <CostsView t={t} costs={waiting.costs} price={waiting.proposedTotalCents} />
          <Field
            multiline
            label={t('ownerApproval.comment')}
            hint={t('ownerApproval.commentHint')}
            value={comment}
            maxLength={2000}
            onChange={(e) => setComment(e.target.value)}
            {...(commentError ? { error: commentError } : {})}
          />
          <div className="hh-button-row">
            <Button pending={pending === 'approve'} onClick={() => void decideNow('approve')}>
              {t('ownerApproval.approve')}
            </Button>
            <Button variant="danger" pending={pending === 'reject'} onClick={() => void decideNow('reject')}>
              {t('ownerApproval.reject')}
            </Button>
          </div>
        </div>
      ) : null}

      {refused ? <StateView kind="error" title={t('ownerApproval.refused')} reasons={refused} /> : null}
      {done ? <StateView kind="success" title={done} /> : null}

      {oa.records.length ? (
        <>
          <h3 id={`${ids}-records`}>{t('ownerApproval.history')}</h3>
          <ol className="staff-estimate__responses" aria-labelledby={`${ids}-records`}>
            {oa.records.map((r) => (
              <RecordView key={r.id} t={t} r={r} />
            ))}
          </ol>
        </>
      ) : null}
      <p className="staff-request__hint">{t('ownerApproval.hint')}</p>
    </section>
  )
}

function linkClick(go: (to: string) => void, to: string) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    go(to)
  }
}

/** The Owner's approval queue in Owner Decisions; hidden when the server refuses it (not the Owner). */
export function PublicationApprovalQueue({
  t,
  fetchImpl,
  go,
  href,
}: {
  t: TQ
  fetchImpl: Fetch
  go: (to: string) => void
  href: (to: string) => string
}) {
  const ids = useId()
  const [items, setItems] = useState<ApprovalRecord[] | null>(null)
  useEffect(() => {
    void call<{ items: ApprovalRecord[] }>(fetchImpl, '/staff/publication-approvals').then((r) =>
      setItems(r.ok && Array.isArray(r.data?.items) ? r.data.items : null),
    )
  }, [fetchImpl])
  if (!items) return null
  const link = (r: ApprovalRecord) => `/estimates/${encodeURIComponent(r.subjectId)}`
  return (
    <section className="staff-queue__section" aria-labelledby={`${ids}-approvals`} data-testid="approval-queue">
      <h3 id={`${ids}-approvals`}>{t('approvalQueue.title')}</h3>
      {items.length === 0 ? (
        <p>{t('approvalQueue.empty')}</p>
      ) : (
        <div className="staff-estimate__history">
          <table aria-labelledby={`${ids}-approvals`}>
            <thead>
              <tr>
                <th scope="col">{t('approvalQueue.reference')}</th>
                <th scope="col">{t('ownerApproval.proposedPrice')}</th>
                <th scope="col">{t('ownerApproval.laborCost')}</th>
                <th scope="col">{t('ownerApproval.materialCost')}</th>
                <th scope="col">{t('ownerApproval.grossProfit')}</th>
                <th scope="col">{t('ownerApproval.margin')}</th>
                <th scope="col">{t('approvalQueue.discounts')}</th>
                <th scope="col">{t('approvalQueue.changeOrder')}</th>
                <th scope="col">{t('approvalQueue.reason')}</th>
                <th scope="col">{t('approvalQueue.preparer')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} data-testid="approval-queue-item">
                  <th scope="row">
                    <a href={href(link(r))} onClick={linkClick(go, link(r))}>
                      {t('approvalQueue.document', {
                        reference: r.reference,
                        n: r.documentVersion,
                        project: r.projectReference ?? '—',
                      })}
                    </a>
                  </th>
                  <td>{usd(r.proposedTotalCents)}</td>
                  <td>{r.costs?.laborCents == null ? '—' : usd(r.costs.laborCents)}</td>
                  <td>{r.costs?.materialCents == null ? '—' : usd(r.costs.materialCents)}</td>
                  <td>
                    {!r.costs
                      ? t('ownerApproval.costsNone')
                      : r.costs.grossProfitCents === null
                        ? t('ownerApproval.costsIncomplete')
                        : usd(r.costs.grossProfitCents)}
                  </td>
                  <td>
                    {!r.costs ? (
                      t('ownerApproval.costsNone')
                    ) : r.costs.marginBps === null ? (
                      t('ownerApproval.costsIncomplete')
                    ) : (
                      <span>{percent(r.costs.marginBps)}</span>
                    )}{' '}
                    {r.costs ? <MarginAgainstTarget t={t} costs={r.costs} /> : null}
                  </td>
                  <td>{r.discount ? usd(r.discount.amountCents) : '—'}</td>
                  <td>{r.changeOrder ? usd(r.changeOrder.adjustmentCents) : '—'}</td>
                  <td>{r.reasons.map((x) => codeLabel(t, 'publicationApprovalReason', x)).join('; ')}</td>
                  <td>{r.requestedBy.name ?? t('queue.unnamed')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

type Threshold = {
  state: 'CONFIGURED' | 'NOT_CONFIGURED'
  version: number | null
  thresholdCents: number | null
  sourceIds: string[]
}

/** The Owner's approval threshold (Settings). Hidden when the server refuses it. */
export function ApprovalThresholdSetting({
  t,
  fetchImpl,
  onSession,
}: {
  t: T
  fetchImpl: Fetch
  onSession?: (s: { csrfToken: string }) => void
}) {
  const ids = useId()
  const [setting, setSetting] = useState<Threshold | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({})
  const [result, setResult] = useState<{ ok: boolean; text: string[] } | null>(null)
  const w = useOwnerWrite(fetchImpl, onSession)
  useEffect(() => {
    void call<Threshold>(fetchImpl, '/staff/settings/approval-threshold').then((r) =>
      setSetting(r.ok && typeof r.data?.state === 'string' ? r.data : null),
    )
  }, [fetchImpl])
  if (!setting) return null

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!setting) return
    const next: { amount?: string; reason?: string } = {}
    let thresholdCents = 0
    try {
      thresholdCents = Number(centsFromDecimal(amount.trim()))
      if (thresholdCents <= 0) next.amount = t('approvalThreshold.amountInvalid')
    } catch {
      next.amount = t('approvalThreshold.amountInvalid')
    }
    if (reason.trim() === '') next.reason = t('approvalThreshold.reasonRequired')
    setErrors(next)
    if (next.amount || next.reason) return
    setResult(null)
    await w.send<Threshold>(
      '/staff/settings/approval-threshold',
      { thresholdCents, reason: reason.trim() },
      (r) => {
        if (!r.ok) return setResult({ ok: false, text: refusal(t, r.error) })
        setSetting(r.data)
        setAmount('')
        setReason('')
        setResult({ ok: true, text: [] })
      },
      { 'if-match': `"${setting.version ?? 0}"` },
      'PUT',
    )
  }

  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-threshold`} data-testid="approval-threshold">
      <h2 id={`${ids}-threshold`} className="staff-queue__heading">
        {t('approvalThreshold.title')}
      </h2>
      <p>
        {setting.thresholdCents === null
          ? t('ownerApproval.thresholdNotConfigured')
          : t('ownerApproval.thresholdValue', { amount: usd(setting.thresholdCents), n: setting.version ?? 0 })}
      </p>
      <p className="staff-request__hint">{t('approvalThreshold.hint')}</p>
      <ReauthForm t={t} w={w} />
      {!w.reauth ? (
        <form onSubmit={(e) => void save(e)} noValidate aria-label={t('approvalThreshold.change')}>
          <Field
            label={t('approvalThreshold.amount')}
            name="thresholdAmount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            {...(errors.amount ? { error: errors.amount } : {})}
          />
          <Field
            multiline
            label={t('approvalThreshold.reason')}
            name="thresholdReason"
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            {...(errors.reason ? { error: errors.reason } : {})}
          />
          <Button type="submit" pending={w.pending}>
            {t('approvalThreshold.save')}
          </Button>
        </form>
      ) : null}
      {result?.ok ? <StateView kind="success" title={t('approvalThreshold.saved')} /> : null}
      {result && !result.ok ? (
        <StateView kind="error" title={t('ownerApproval.refused')} reasons={result.text} />
      ) : null}
    </section>
  )
}
