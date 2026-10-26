// Change orders in the Documents tab (TSK-0082; HH-CHG-02, HH-CHG-03, HH-PORT-05, HH-ID-07, OWN-DEC-169).
// - The accepted estimate's total stays as it was; the current authorized total is the original plus every approved
//   change order. Each change order that was sent shows its reason, scope, schedule impact, lines and totals in
//   integer cents (a credit lowers the total), when it was sent and until when it is valid, and its status.
// - An open one is approved only by the explicit action: the box (unchecked by default) accepting the change under the
//   estimate terms the job was accepted under, the typed full name and Approve Change. Decline Change takes an optional
//   reason. Both need a fresh verification: a stale one shows the code step here and keeps what was typed. One
//   idempotency key per attempt, kept for its retries. A change priced before another was approved waits for its
//   updated version. Nothing here ever approves by timeout, link preview or silence.
// English only, from the customer catalog; the wording no decision gives is PROPOSED (OQ-PORTAL-WORDING).
import type { CustomerKey } from '@handyhub/i18n'
import { cents, formatUsd } from '@handyhub/money'
import { Button, Field, StateView, StatusBadge, type StatusTone } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import {
  idempotencyKey,
  portalApi,
  type ChangeOrder,
  type ChangeOrders as ChangeOrderList,
  type ChangeOrderStatus,
  type DecisionFailure,
  type Fetch,
} from './api'
import { day, Reverify } from './Estimate'
import { t } from './labels'

const usd = (n: number) => formatUsd(cents(n))

const STATUS: Record<ChangeOrderStatus, CustomerKey> = {
  issued: 'portal.changeOrders.status.issued',
  approved: 'portal.changeOrders.status.approved',
  rejected: 'portal.changeOrders.status.rejected',
  expired: 'portal.changeOrders.status.expired',
  withdrawn: 'portal.changeOrders.status.withdrawn',
  superseded: 'portal.changeOrders.status.superseded',
}
const TONE: Record<ChangeOrderStatus, StatusTone> = {
  issued: 'warning',
  approved: 'success',
  rejected: 'neutral',
  expired: 'neutral',
  withdrawn: 'neutral',
  superseded: 'neutral',
}
const FAILURE: Record<DecisionFailure, CustomerKey> = {
  fresh_verification: 'portal.estimate.failure.fresh_verification',
  not_applicable: 'portal.changeOrders.failure.not_applicable',
  invalid: 'portal.changeOrders.failure.invalid',
  rate_limited: 'portal.estimate.failure.rate_limited',
  failed: 'portal.changeOrders.failure.failed',
  expired: 'portal.estimate.failure.expired',
  unavailable: 'portal.estimate.failure.unavailable',
  total_changed: 'portal.changeOrders.failure.total_changed',
  access_revoked: 'portal.estimate.approve.failure.access_revoked',
  scope_changed: 'portal.changeOrders.failure.scope_changed',
}

function Lines({ c }: { c: ChangeOrder }) {
  const missing = t('estimatePdf.notProvided')
  return (
    <div className="portal-estimate__table">
      <table>
        <caption className="hh-visually-hidden">{t('portal.changeOrders.lines', { reference: c.reference })}</caption>
        <thead>
          <tr>
            <th scope="col">{t('estimatePdf.column.description')}</th>
            <th scope="col">{t('estimatePdf.column.quantity')}</th>
            <th scope="col">{t('estimatePdf.column.unitPrice')}</th>
            <th scope="col">{t('estimatePdf.column.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {c.lines.map((l) => (
            <tr key={l.position}>
              <th scope="row">
                {l.kind === 'credit' ? `${t('portal.changeOrders.credit')}: ` : ''}
                {l.description}
              </th>
              <td>{l.quantity === null ? missing : [l.quantity, l.unit].filter(Boolean).join(' ')}</td>
              <td>{l.unitPriceCents === null ? missing : usd(l.unitPriceCents)}</td>
              <td>
                {l.amountCents === null ? missing : l.kind === 'credit' ? `-${usd(l.amountCents)}` : usd(l.amountCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Totals({ c }: { c: ChangeOrder }) {
  return (
    <dl className="portal-estimate__totals" data-testid="change-order-totals">
      <dt>{t('portal.changeOrders.approvedTotal')}</dt>
      <dd>{usd(c.approvedTotalCents)}</dd>
      {c.chargesCents > 0 ? (
        <>
          <dt>{t('portal.changeOrders.charges')}</dt>
          <dd>{usd(c.chargesCents)}</dd>
        </>
      ) : null}
      {c.creditsCents > 0 ? (
        <>
          <dt>{t('portal.changeOrders.credits')}</dt>
          <dd>-{usd(c.creditsCents)}</dd>
        </>
      ) : null}
      <dt>
        <strong>{t('portal.changeOrders.revisedTotal')}</strong>
      </dt>
      <dd>
        <strong>{usd(c.revisedTotalCents)}</strong>
      </dd>
    </dl>
  )
}

/** Approve Change and Decline Change for the open version. */
function Decide({
  c,
  reference,
  fetchImpl,
  onDone,
}: {
  c: ChangeOrder
  reference: string
  fetchImpl: Fetch
  onDone: () => Promise<void>
}) {
  const ids = useId()
  const [accept, setAccept] = useState(false)
  const [name, setName] = useState('')
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState<'approve' | 'reject' | null>(null)
  const [failure, setFailure] = useState<DecisionFailure | null>(null)
  // One key per attempt: a double click or a retry of the same attempt never decides twice.
  const key = useRef<{ kind: 'approve' | 'reject'; key: string } | null>(null)
  const approval = c.approval
  if (!approval) return null
  // TSK-0118 (HH-ID-13): an organization member without the approve privilege reads it but does not decide.
  if (approval.blockedBy === 'NO_APPROVAL_PRIVILEGE')
    return <p role="status">{t('portal.changeOrders.noApprovalPrivilege')}</p>
  if (!approval.canDecide) return <p role="status">{t('portal.changeOrders.waitingForUpdate')}</p>
  const ref = { reference, number: c.number, version: c.version }

  async function send(kind: 'approve' | 'reject') {
    if (!approval) return
    if (kind === 'approve' && (!accept || !name.trim())) return setFailure('invalid')
    if (key.current?.kind !== kind) key.current = { kind, key: idempotencyKey() }
    setPending(kind)
    setFailure(null)
    const r =
      kind === 'approve'
        ? await portalApi.approveChangeOrder(
            fetchImpl,
            ref,
            {
              contentDigest: approval.contentDigest,
              totalCents: c.revisedTotalCents,
              termsDocumentId: approval.termsDocumentId,
              termsSha256: approval.termsSha256,
              acceptTerms: accept,
              fullName: name.trim(),
            },
            key.current.key,
          )
        : await portalApi.rejectChangeOrder(
            fetchImpl,
            ref,
            { contentDigest: approval.contentDigest, ...(reason.trim() ? { reason: reason.trim() } : {}) },
            key.current.key,
          )
    setPending(null)
    if (!r.ok) {
      // A definite refusal ends this attempt's key; a network failure keeps it for the retry.
      if (r.failure !== 'failed') key.current = null
      setFailure(r.failure)
      if (r.failure === 'not_applicable' || r.failure === 'scope_changed' || r.failure === 'total_changed')
        await onDone()
      return
    }
    key.current = null
    await onDone()
  }

  const blocked = !accept
    ? t('portal.changeOrders.approve.needsBox')
    : !name.trim()
      ? t('portal.estimate.approve.needsName')
      : undefined
  return (
    <div className="portal-estimate__form" role="group" aria-labelledby={`${ids}-decide`}>
      <p id={`${ids}-decide`}>{t('portal.changeOrders.approve.intro')}</p>
      <label className="portal-estimate__check">
        <input type="checkbox" checked={accept} onChange={(ev) => setAccept(ev.currentTarget.checked)} />
        <span>{t('portal.changeOrders.approve.accept', { reference: c.reference })}</span>
      </label>
      <Field
        label={t('portal.estimate.approve.fullName')}
        hint={t('portal.estimate.approve.fullNameHint')}
        autoComplete="name"
        maxLength={200}
        value={name}
        onChange={(ev) => setName(ev.target.value)}
      />
      <div className="hh-button-row">
        <Button
          pending={pending === 'approve'}
          {...(blocked ? { disabledReason: blocked } : {})}
          onClick={() => void send('approve')}
        >
          {t('portal.changeOrders.approve.submit')}
        </Button>
      </div>
      <Field
        multiline
        label={t('portal.changeOrders.reject.reason')}
        hint={t('portal.changeOrders.reject.hint')}
        maxLength={2000}
        value={reason}
        onChange={(ev) => setReason(ev.target.value)}
      />
      <div className="hh-button-row">
        <Button variant="secondary" pending={pending === 'reject'} onClick={() => void send('reject')}>
          {t('portal.changeOrders.reject.submit')}
        </Button>
      </div>
      {failure ? <StateView kind="error" title={t(FAILURE[failure])} /> : null}
      {failure === 'fresh_verification' ? (
        <Reverify fetchImpl={fetchImpl} onVerified={async () => setFailure(null)} />
      ) : null}
    </div>
  )
}

function Item({
  c,
  reference,
  fetchImpl,
  onDone,
}: {
  c: ChangeOrder
  reference: string
  fetchImpl: Fetch
  onDone: () => Promise<void>
}) {
  return (
    <li className="portal-documents__item" data-testid="change-order">
      <p>
        <strong>{t('portal.changeOrders.name', { reference: c.reference, version: c.version })}</strong>{' '}
        <StatusBadge tone={TONE[c.status]}>{t(STATUS[c.status])}</StatusBadge>
      </p>
      <p className="hh-small hh-muted">
        {t('portal.changeOrders.sent', { date: day(c.sentAt) })}
        {c.status === 'issued' ? ` · ${t('portal.changeOrders.validUntil', { date: day(c.validUntil) })}` : ''}
      </p>
      <p>
        <strong>{t('portal.changeOrders.reason')}</strong> {c.reason}
      </p>
      <p>
        <strong>{t('portal.changeOrders.scope')}</strong> {c.scope}
      </p>
      {c.scheduleImpact ? (
        <p>
          <strong>{t('portal.changeOrders.schedule')}</strong> {c.scheduleImpact}
        </p>
      ) : null}
      <Lines c={c} />
      <Totals c={c} />
      {c.decision ? (
        <p role="status">
          {t(c.decision.kind === 'approved' ? 'portal.changeOrders.approvedOn' : 'portal.changeOrders.rejectedOn', {
            date: day(c.decision.at),
          })}
        </p>
      ) : null}
      {c.status === 'issued' ? <Decide c={c} reference={reference} fetchImpl={fetchImpl} onDone={onDone} /> : null}
    </li>
  )
}

/** The project's change orders, read when the Documents tab is shown; nothing at all while there are none. */
export function ChangeOrders({ reference, fetchImpl }: { reference: string; fetchImpl: Fetch }) {
  const [data, setData] = useState<ChangeOrderList | null | 'failed'>(null)
  const load = useCallback(async () => {
    const r = await portalApi.changeOrders(fetchImpl, reference)
    setData(r.ok ? r.data : 'failed')
  }, [fetchImpl, reference])
  useEffect(() => {
    void load()
  }, [load])
  if (data === 'failed') return <StateView kind="error" title={t('portal.changeOrders.failed')} />
  if (!data || data.changeOrders.length === 0) return null
  return (
    <section aria-labelledby="portal-change-orders" data-testid="documents-change-orders">
      <h3 id="portal-change-orders" className="hh-h3">
        {t('portal.changeOrders.title')}
      </h3>
      <dl className="portal-estimate__totals">
        {data.original ? (
          <>
            <dt>
              {t('portal.changeOrders.original', {
                number: data.original.estimateNumber,
                version: data.original.version,
              })}
            </dt>
            <dd>{usd(data.original.totalCents)}</dd>
          </>
        ) : null}
        {data.currentTotalCents !== null ? (
          <>
            <dt>
              <strong>{t('portal.changeOrders.currentTotal')}</strong>
            </dt>
            <dd data-testid="change-orders-current-total">
              <strong>{usd(data.currentTotalCents)}</strong>
            </dd>
          </>
        ) : null}
      </dl>
      <ul className="portal-documents">
        {data.changeOrders.map((c) => (
          <Item key={`${c.number}-${c.version}`} c={c} reference={reference} fetchImpl={fetchImpl} onDone={load} />
        ))}
      </ul>
    </section>
  )
}
