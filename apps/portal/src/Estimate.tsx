// The customer's estimate view in the Documents tab (TSK-0056; HH-EST-06, HH-EST-09, HH-EST-13, HH-PORT-10, HH-ID-07,
// OWN-DEC-103, OWN-DEC-127, RULE-LANGUAGES).
// - The exact published version: the business name, the lines and options, the texts, the subtotal, any discount row,
//   the total and any deposit, exactly as the server stored them (integer cents, formatted here), the payment term and
//   the valid-until date, with the version's status (current, approved, declined, expired, superseded, withdrawn).
//   Outside production the estimate carries "TEST — not a real invoice or estimate".
// - The terms the version pinned, in full, in an expandable section and on a page of their own. Terms that are not
//   approved for real customers carry the TEST banner and say they are not in effect; terms the server reports as NOT
//   CONFIGURED show no wording at all.
// - TSK-0057 (HH-EST-06, HH-EST-07, HH-ID-07, OWN-DEC-103): on the current version with terms in effect, the customer
//   selects options (the server answers the total and any deposit for them and keeps the choice), reads the terms,
//   ticks "I have read and accept the estimate terms" (unchecked by default), types their full name and presses
//   "Approve Estimate". The page sends the digest of the content it shows, the options and the total and deposit it
//   showed; one idempotency key per attempt, kept for its retries. A stale verification asks for a new code right
//   here and keeps the options and the name. After approval (TSK-0058, OWN-DEC-105) the receipt: the next step in the
//   owner's words ("Estimate approved—pay your deposit to proceed with scheduling." while a required deposit is not
//   satisfied, otherwise "Estimate approved—choose your work appointment."), when it was approved, what was approved
//   and the approval receipt PDF (a download link once issued, or that it is being prepared). Otherwise the
//   section names every reason approval is not available, and links the version to review instead. Not answering
//   never approves anything, and the page says so.
// - Request Changes (a message) and Decline (an optional reason, after a confirmation) on the current version; Request
//   an Updated Estimate on an expired one with no current version. Each needs a recent verification (the server
//   decides; the page says how to get one). A failed or refused answer is never shown as sent, and what was typed is
//   kept. The customer's earlier answers are listed with their words.
// English only, from the customer catalog; wording no decision gives is PROPOSED (OQ-PORTAL-WORDING).
import { estimateTermsDocument } from '@handyhub/domain/legal'
import type { CustomerKey } from '@handyhub/i18n'
import { cents, formatUsd } from '@handyhub/money'
import { Button, Field, StateView, StatusBadge, type StatusTone } from '@handyhub/ui'
import { useEffect, useId, useRef, useState } from 'react'
import {
  idempotencyKey,
  portalApi,
  type ApprovalFailure,
  type ApprovalReason,
  type Channel,
  type Selection,
  type Verification,
  type EstimateDetail,
  type EstimateLine,
  type Fetch,
  type NextStep,
  type Receipt,
  type ResponseKind,
  type VersionStatus,
  type WriteFailure,
} from './api'
import { t, when } from './labels'
import { useLive } from './live'
import { NotShown, RefreshLine } from './States'
import { NotInEffect, TermsText } from './Terms'

export const STATUS_LABEL: Record<VersionStatus, CustomerKey> = {
  current: 'portal.estimate.status.current',
  approved: 'portal.estimate.status.approved',
  declined: 'portal.estimate.status.declined',
  expired: 'portal.estimate.status.expired',
  superseded: 'portal.estimate.status.superseded',
  withdrawn: 'portal.estimate.status.withdrawn',
}
export const STATUS_TONE: Record<VersionStatus, StatusTone> = {
  current: 'info',
  approved: 'success',
  declined: 'neutral',
  expired: 'warning',
  superseded: 'neutral',
  withdrawn: 'neutral',
}
const KIND_LABEL: Record<ResponseKind, CustomerKey> = {
  changes_requested: 'portal.estimate.history.kind.changes_requested',
  declined: 'portal.estimate.history.kind.declined',
  update_requested: 'portal.estimate.history.kind.update_requested',
}
const FAILURE: Record<WriteFailure, CustomerKey> = {
  fresh_verification: 'portal.estimate.failure.fresh_verification',
  not_applicable: 'portal.estimate.failure.not_applicable',
  invalid: 'portal.estimate.failure.invalid',
  rate_limited: 'portal.estimate.failure.rate_limited',
  failed: 'portal.estimate.failure.failed',
  expired: 'portal.estimate.failure.expired',
  unavailable: 'portal.estimate.failure.unavailable',
}
const SENT: Record<ResponseKind, CustomerKey> = {
  changes_requested: 'portal.estimate.changes.sent',
  declined: 'portal.estimate.decline.sent',
  update_requested: 'portal.estimate.update.sent',
}
const APPROVAL_REASON: Record<ApprovalReason, CustomerKey> = {
  terms_not_configured: 'portal.estimate.approval.reason.terms_not_configured',
  terms_not_in_effect: 'portal.estimate.approval.reason.terms_not_in_effect',
  superseded: 'portal.estimate.approval.reason.superseded',
  expired: 'portal.estimate.approval.reason.expired',
  not_published: 'portal.estimate.approval.reason.not_published',
  reduction_pending_verification: 'portal.estimate.approval.reason.reduction_pending_verification',
  reduction_not_verified: 'portal.estimate.approval.reason.reduction_not_verified',
}
const APPROVAL_FAILURE: Record<ApprovalFailure, CustomerKey> = {
  ...FAILURE,
  invalid: 'portal.estimate.approve.failure.invalid',
  not_applicable: 'portal.estimate.approve.failure.not_applicable',
  failed: 'portal.estimate.approve.failure.failed',
  not_configured: 'portal.estimate.approve.failure.not_configured',
  total_changed: 'portal.estimate.approve.failure.total_changed',
  access_revoked: 'portal.estimate.approve.failure.access_revoked',
}
const PAYMENT_TERM: Record<string, CustomerKey> = { due_on_receipt: 'estimatePdf.paymentTerm.due_on_receipt' }
/** The step after approval in the owner's words (OWN-DEC-105), the same labels as the Overview's step. */
const NEXT_STEP: Record<NextStep, CustomerKey> = {
  deposit_due: 'portal.step.deposit_due',
  choose_work_appointment: 'portal.step.choose_work_appointment',
}
const usd = (c: number) => formatUsd(cents(c))

/** A day in English: "October 21, 2026". */
export function day(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(d)
}

/**
 * The end of an estimate's validity with its time and zone (TSK-0123; OWN-DEC-159 item 12): "November 4, 2026, 11:59 PM
 * EST", in the property's zone, or in business time said so while the property's zone is unknown.
 */
export function validUntilText(iso: string, zone: { zone: string; business: boolean } | null): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  if (!zone) return day(iso)
  const text = new Intl.DateTimeFormat('en-US', {
    timeZone: zone.zone,
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(d)
  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone.zone, timeZoneName: 'short' })
    .formatToParts(d)
    .find((p) => p.type === 'timeZoneName')?.value
  const at = `${text} ${name ?? zone.zone}`
  return zone.business ? t('portal.estimate.validUntilBusiness', { time: at }) : at
}

export const estimatePath = (reference: string, number: string, version: number) =>
  `/portal/p/${encodeURIComponent(reference)}/documents/${encodeURIComponent(number)}/${version}`

function Lines({ lines, caption }: { lines: EstimateLine[]; caption: string }) {
  const kind = (l: EstimateLine) =>
    l.kind === 'alternate' ? t('estimatePdf.kind.alternate') : l.kind === 'add_on' ? t('estimatePdf.kind.add_on') : null
  const missing = t('estimatePdf.notProvided')
  return (
    <div className="portal-estimate__table">
      <table>
        <caption className="hh-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{t('estimatePdf.column.description')}</th>
            <th scope="col">{t('estimatePdf.column.quantity')}</th>
            <th scope="col">{t('estimatePdf.column.unitPrice')}</th>
            <th scope="col">{t('estimatePdf.column.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <th scope="row">
                {kind(l) ? `${kind(l)}: ` : ''}
                {l.description ?? missing}
              </th>
              <td>{l.quantity === null ? missing : [l.quantity, l.unit].filter(Boolean).join(' ')}</td>
              <td>{l.unitPriceCents === null ? missing : usd(l.unitPriceCents)}</td>
              <td>{l.amountCents === null ? missing : usd(l.amountCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const TEXT_LISTS = [
  ['assumptions', 'estimatePdf.assumptions'],
  ['exclusions', 'estimatePdf.exclusions'],
  ['customerResponsibilities', 'estimatePdf.customerResponsibilities'],
  ['dependencies', 'estimatePdf.dependencies'],
  ['scheduleAssumptions', 'estimatePdf.scheduleAssumptions'],
] as const satisfies readonly (readonly [keyof EstimateDetail, CustomerKey])[]

function Content({ e }: { e: EstimateDetail }) {
  const base = e.lines.filter((l) => l.kind === 'base')
  const options = e.lines.filter((l) => l.kind !== 'base')
  return (
    <section className="portal-section" aria-labelledby="portal-estimate-details">
      <h3 id="portal-estimate-details" className="hh-visually-hidden">
        {t('portal.estimate.details')}
      </h3>
      <dl className="portal-estimate__facts">
        <dt>{t('estimatePdf.issuer')}</dt>
        <dd>{e.issuerName ?? t('estimatePdf.notProvided')}</dd>
        <dt>{t('estimatePdf.published')}</dt>
        <dd>{day(e.publishedAt)}</dd>
        <dt>{t('estimatePdf.validUntil')}</dt>
        <dd data-testid="estimate-valid-until">
          {e.validUntil ? validUntilText(e.validUntil, e.validUntilZone) : t('estimatePdf.notProvided')}
        </dd>
      </dl>
      {e.document ? (
        <p>
          <a href={e.document.url} rel="noopener">
            {t('portal.estimate.document')}
          </a>
        </p>
      ) : null}
      <h4 className="hh-h3">{t('estimatePdf.scope')}</h4>
      <Lines lines={base} caption={t('estimatePdf.scope')} />
      {options.length ? (
        <>
          <h4 className="hh-h3">{t('estimatePdf.options')}</h4>
          <Lines lines={options} caption={t('estimatePdf.options')} />
        </>
      ) : null}
      <h4 className="hh-h3">{t('estimatePdf.totals')}</h4>
      <dl className="portal-estimate__totals" data-testid="estimate-totals">
        <dt>{t('estimatePdf.subtotal')}</dt>
        <dd>{usd(e.subtotalCents)}</dd>
        {e.reduction ? (
          <>
            <dt>
              {e.reduction.label}
              {/* TSK-0125 (OWN-DEC-165): a requested reduction is provisional until it is verified. */}
              {e.reduction.pendingVerification ? (
                <>
                  {' '}
                  <StatusBadge tone="warning">{t('portal.estimate.reduction.pending')}</StatusBadge>
                </>
              ) : null}
            </dt>
            <dd>-{usd(e.reduction.amountCents)}</dd>
          </>
        ) : null}
        <dt>
          <strong>{t('estimatePdf.total')}</strong>
        </dt>
        <dd>
          <strong>{usd(e.totalCents)}</strong>
        </dd>
        {e.deposit.state === 'required' && e.deposit.amountCents !== null ? (
          <>
            <dt>{t('estimatePdf.deposit')}</dt>
            <dd>{usd(e.deposit.amountCents)}</dd>
          </>
        ) : null}
        <dt>{t('estimatePdf.paymentTerm')}</dt>
        <dd>
          {PAYMENT_TERM[e.paymentTerm] ? t(PAYMENT_TERM[e.paymentTerm] as CustomerKey) : t('estimatePdf.notProvided')}
        </dd>
      </dl>
      {e.reduction?.pendingVerification ? (
        <p className="hh-small" data-testid="estimate-reduction-pending">
          {t('portal.estimate.reduction.pendingNote')}
        </p>
      ) : null}
      {TEXT_LISTS.map(([key, label]) =>
        e[key].length ? (
          <div key={key}>
            <h4 className="hh-h3">{t(label)}</h4>
            <ul>
              {e[key].map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </section>
  )
}

function Terms({ e }: { e: EstimateDetail }) {
  const doc = e.terms.state === 'not_configured' ? null : estimateTermsDocument(e.terms.documentId)
  return (
    <section className="portal-section" aria-labelledby="portal-estimate-terms" data-testid="estimate-terms">
      <h3 id="portal-estimate-terms" className="hh-h3">
        {t('portal.estimate.terms.title')}
      </h3>
      {!doc ? (
        <StateView kind="blocked" title={t('portal.estimate.terms.notConfigured.title')}>
          <p>{t('portal.estimate.terms.notConfigured.text')}</p>
        </StateView>
      ) : (
        <>
          {e.terms.state === 'not_in_effect' ? <NotInEffect /> : null}
          <details className="portal-terms__details">
            <summary>{t('portal.estimate.terms.show')}</summary>
            <TermsText doc={doc} level={4} />
          </details>
          <p>
            <a href={doc.path}>{t('portal.estimate.terms.fullPage')}</a>
          </p>
        </>
      )}
    </section>
  )
}

/** The totals of a selection, as the server computed them. */
function SelectionTotals({ s, e }: { s: Selection; e: EstimateDetail }) {
  const paymentTerm = e.paymentTerm
  return (
    <dl className="portal-estimate__totals" data-testid="approval-totals">
      <dt>{t('estimatePdf.subtotal')}</dt>
      <dd>{usd(s.subtotalCents)}</dd>
      {s.reductionCents > 0 && e.reduction ? (
        <>
          {/* The same row label as the estimate's own totals (worded by the server, OWN-DEC-145). */}
          <dt>{e.reduction.label}</dt>
          <dd>-{usd(s.reductionCents)}</dd>
        </>
      ) : null}
      <dt>
        <strong>{t('estimatePdf.total')}</strong>
      </dt>
      <dd>
        <strong>{usd(s.totalCents)}</strong>
      </dd>
      {s.deposit.state === 'required' && s.deposit.amountCents !== null ? (
        <>
          <dt>{t('estimatePdf.deposit')}</dt>
          <dd>{usd(s.deposit.amountCents)}</dd>
        </>
      ) : null}
      <dt>{t('estimatePdf.paymentTerm')}</dt>
      <dd>{PAYMENT_TERM[paymentTerm] ? t(PAYMENT_TERM[paymentTerm] as CustomerKey) : t('estimatePdf.notProvided')}</dd>
    </dl>
  )
}

/**
 * A new code for this session, without leaving the estimate (HH-ID-07): the session's own contact, masked. What the
 * customer chose and typed stays as it is.
 */
export function Reverify({ fetchImpl, onVerified }: { fetchImpl: Fetch; onVerified: () => Promise<void> }) {
  const ids = useId()
  const [v, setV] = useState<Verification | null | 'failed'>(null)
  const [sent, setSent] = useState<{ channel: Channel; destination: string } | null>(null)
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<CustomerKey | null>(null)
  useEffect(() => {
    let live = true
    void portalApi.verification(fetchImpl).then((r) => live && setV(r.ok ? r.data : 'failed'))
    return () => {
      live = false
    }
  }, [fetchImpl])
  async function send(channel: Channel) {
    setPending(true)
    setMessage(null)
    const r = await portalApi.sendCode(fetchImpl, channel)
    setPending(false)
    if (!r.ok)
      return setMessage(r.failure === 'not_configured' ? 'portal.verify.failure.not_configured' : FAILURE[r.failure])
    setSent({ channel, destination: r.destination })
    setCode('')
  }
  async function check() {
    if (!sent) return
    if (!code.trim()) return setMessage('portal.verify.failure.invalid')
    setPending(true)
    setMessage(null)
    const r = await portalApi.verify(fetchImpl, sent.channel, code.trim())
    setPending(false)
    if (!r.ok) return setMessage(r.failure === 'invalid' ? 'portal.verify.failure.invalid' : FAILURE[r.failure])
    setMessage('portal.verify.done')
    await onVerified()
  }
  const channels = v && v !== 'failed' ? v.channels : []
  return (
    <section className="portal-section" aria-labelledby={`${ids}-verify`} data-testid="estimate-reverify">
      <h3 id={`${ids}-verify`} className="hh-h3">
        {t('portal.verify.title')}
      </h3>
      <p>{t('portal.verify.text')}</p>
      {v === 'failed' ? <StateView kind="error" title={t('portal.verify.failure.unavailable')} /> : null}
      {channels.length ? (
        <div className="hh-button-row">
          {channels.map((c) => (
            <Button key={c.channel} variant="secondary" pending={pending && !sent} onClick={() => void send(c.channel)}>
              {t(c.channel === 'email' ? 'portal.verify.email' : 'portal.verify.phone', { destination: c.destination })}
            </Button>
          ))}
        </div>
      ) : null}
      {sent ? (
        <div className="portal-estimate__form">
          <p role="status">{t('portal.verify.sent', { destination: sent.destination })}</p>
          <Field
            label={t('portal.verify.code')}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            value={code}
            onChange={(ev) => setCode(ev.target.value)}
          />
          <Button pending={pending} onClick={() => void check()}>
            {t('portal.verify.submit')}
          </Button>
        </div>
      ) : null}
      {message ? <StateView kind={message === 'portal.verify.done' ? 'success' : 'error'} title={t(message)} /> : null}
    </section>
  )
}

/** Options, the server's totals, the terms box, the full name and Approve Estimate (TSK-0057). */
function ApproveForm({ e, fetchImpl, onDone }: { e: EstimateDetail; fetchImpl: Fetch; onDone: () => Promise<void> }) {
  const ids = useId()
  const optionLines = e.lines.filter((l) => l.kind !== 'base')
  const [options, setOptions] = useState<number[]>(e.approval.selection?.options ?? [])
  const [totals, setTotals] = useState<Selection | null>(e.approval.selection)
  const [accept, setAccept] = useState(false)
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<ApprovalFailure | null>(null)
  // One key per approval attempt: a double click or a retry of the same attempt can never approve twice.
  const key = useRef<string | null>(null)
  const doc = estimateTermsDocument(e.terms.documentId)
  const ref = { reference: e.reference, number: e.number, version: e.version }

  async function toggle(position: number, on: boolean) {
    const next = on ? [...new Set([...options, position])].sort((a, b) => a - b) : options.filter((p) => p !== position)
    setOptions(next)
    setTotals(null)
    setFailure(null)
    key.current = null
    const r = await portalApi.select(fetchImpl, ref, next)
    if (r.ok) setTotals(r.selection)
    else setFailure(r.failure)
  }
  async function submit() {
    if (!doc || !totals) return
    if (!accept || !name.trim()) return setFailure('invalid')
    setPending(true)
    setFailure(null)
    key.current ??= idempotencyKey()
    const r = await portalApi.approve(
      fetchImpl,
      ref,
      {
        contentDigest: e.approval.contentDigest,
        options: totals.options,
        totalCents: totals.totalCents,
        depositCents: totals.deposit.amountCents,
        termsDocumentId: doc.documentId,
        termsSha256: doc.contentSha256,
        acceptTerms: accept,
        fullName: name.trim(),
      },
      key.current,
    )
    setPending(false)
    if (!r.ok) {
      // A definite refusal ends this attempt's key; a network failure keeps it for the retry.
      if (r.failure !== 'failed') key.current = null
      setFailure(r.failure)
      if (r.failure === 'not_applicable' || r.failure === 'total_changed' || r.failure === 'fresh_verification')
        await onDone()
      return
    }
    key.current = null
    await onDone()
  }

  const blocked = !totals
    ? t('portal.estimate.approve.wait')
    : !accept
      ? t('portal.estimate.approve.needsBox')
      : !name.trim()
        ? t('portal.estimate.approve.needsName')
        : undefined
  return (
    <div className="portal-estimate__form" role="group" aria-labelledby={`${ids}-approve`}>
      <p id={`${ids}-approve`}>{t('portal.estimate.approve.intro')}</p>
      {optionLines.length ? (
        <fieldset className="portal-estimate__options">
          <legend>{t('portal.estimate.approve.options')}</legend>
          {optionLines.map((l) => (
            <label key={l.position} className="portal-estimate__check">
              <input
                type="checkbox"
                checked={options.includes(l.position)}
                onChange={(ev) => void toggle(l.position, ev.currentTarget.checked)}
              />
              <span>
                {t('portal.estimate.approve.option', {
                  description: l.description ?? t('estimatePdf.notProvided'),
                  amount: l.amountCents === null ? t('estimatePdf.notProvided') : usd(l.amountCents),
                })}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <h4 className="hh-h3">{t('portal.estimate.approve.yourTotal')}</h4>
      {totals ? <SelectionTotals s={totals} e={e} /> : <p className="hh-muted">{t('portal.estimate.approve.wait')}</p>}
      <p className="hh-muted">{t('portal.estimate.approve.notBooking')}</p>
      <label className="portal-estimate__check">
        <input type="checkbox" checked={accept} onChange={(ev) => setAccept(ev.currentTarget.checked)} />
        <span>{t('portal.estimate.approve.accept')}</span>
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
        <Button pending={pending} {...(blocked ? { disabledReason: blocked } : {})} onClick={() => void submit()}>
          {t('portal.estimate.approve.submit')}
        </Button>
      </div>
      {failure ? <StateView kind="error" title={t(APPROVAL_FAILURE[failure])} /> : null}
    </div>
  )
}

function Approval({
  e,
  fetchImpl,
  onOpen,
  onDone,
}: {
  e: EstimateDetail
  fetchImpl: Fetch
  onOpen: (path: string) => void
  onDone: () => Promise<void>
}) {
  const approved = e.approval.approved
  return (
    <section className="portal-section" aria-labelledby="portal-estimate-approval" data-testid="estimate-approval">
      <h3 id="portal-estimate-approval" className="hh-h3">
        {t('portal.estimate.approval.title')}
      </h3>
      {approved ? (
        <>
          <StateView
            kind="success"
            title={t(e.approval.nextStep ? NEXT_STEP[e.approval.nextStep] : 'portal.estimate.approve.done')}
          >
            <p>{t('portal.estimate.approve.approvedOn', { date: day(approved.at) })}</p>
          </StateView>
          <SelectionTotals s={approved} e={e} />
          <ApprovalReceipt receipt={e.approval.receipt} />
        </>
      ) : e.approval.available ? (
        <ApproveForm e={e} fetchImpl={fetchImpl} onDone={onDone} />
      ) : e.status === 'approved' ? null : (
        <ApprovalUnavailable e={e} onOpen={onOpen} />
      )}
      <p>{t('portal.estimate.approval.silence')}</p>
    </section>
  )
}

/** The approval receipt PDF (TSK-0058, HH-EST-12): a download once issued, otherwise that it is being prepared. */
function ApprovalReceipt({ receipt }: { receipt: Receipt | null }) {
  if (!receipt) return null
  return (
    <div className="portal-estimate__receipt" data-testid="approval-receipt">
      <h4 className="hh-h3">{t('portal.estimate.receipt.title')}</h4>
      <p>{t('portal.estimate.receipt.contents')}</p>
      {receipt.state === 'preparing' ? (
        <p role="status">{t('portal.estimate.receipt.preparing')}</p>
      ) : receipt.url ? (
        <p>
          <a href={receipt.url} rel="noopener" target="_blank">
            {t('portal.estimate.receipt.download')}
          </a>{' '}
          <span className="hh-small hh-muted">
            {t('portal.estimate.receipt.issued', { date: receipt.issuedAt ? day(receipt.issuedAt) : '' })}
          </span>
        </p>
      ) : (
        <p>{t('portal.estimate.receipt.unavailable')}</p>
      )}
    </div>
  )
}

function ApprovalUnavailable({ e, onOpen }: { e: EstimateDetail; onOpen: (path: string) => void }) {
  return (
    <>
      <StateView
        kind="blocked"
        title={t('portal.estimate.approval.unavailable')}
        reasons={e.approval.reasons.map((r) => t(APPROVAL_REASON[r]))}
      />
      {e.approval.current ? (
        <p>
          <a
            href={estimatePath(e.reference, e.approval.current.number, e.approval.current.version)}
            onClick={(ev) => {
              if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return
              ev.preventDefault()
              if (e.approval.current)
                onOpen(estimatePath(e.reference, e.approval.current.number, e.approval.current.version))
            }}
          >
            {t('portal.estimate.approval.current', { version: e.approval.current.version })}
          </a>
        </p>
      ) : null}
    </>
  )
}

type Open = ResponseKind | null

function Respond({ e, fetchImpl, onDone }: { e: EstimateDetail; fetchImpl: Fetch; onDone: () => Promise<void> }) {
  const ids = useId()
  const [open, setOpen] = useState<Open>(null)
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<WriteFailure | null>(null)
  const [sent, setSent] = useState<ResponseKind | null>(null)
  // One key per answer: a retry of the same answer cannot record it twice.
  const key = useRef<string | null>(null)
  const { requestChanges, decline, requestUpdate } = e.actions
  if (!requestChanges && !decline && !requestUpdate && !sent) return null
  const blocked = e.freshVerification ? undefined : t('portal.estimate.verifyFirst')

  const start = (kind: ResponseKind) => {
    setOpen(kind)
    setFailure(null)
    setSent(null)
    key.current = null
  }
  async function send(kind: ResponseKind) {
    const body: Record<string, string> = {}
    const words = text.trim()
    if (kind === 'changes_requested') {
      if (!words) return setFailure('invalid')
      body['message'] = words
    } else if (words) body[kind === 'declined' ? 'reason' : 'message'] = words
    setPending(true)
    setFailure(null)
    key.current ??= idempotencyKey()
    const r = await portalApi.respond(
      fetchImpl,
      { reference: e.reference, number: e.number, version: e.version },
      kind,
      body,
      key.current,
    )
    setPending(false)
    if (!r.ok) {
      // A definite refusal ends this answer's key; a network failure keeps it for the retry.
      if (r.failure !== 'failed') key.current = null
      setFailure(r.failure)
      if (r.failure === 'not_applicable') await onDone()
      return
    }
    key.current = null
    setText('')
    setOpen(null)
    setSent(kind)
    await onDone()
  }

  const form = (kind: ResponseKind) => {
    const label =
      kind === 'changes_requested'
        ? 'portal.estimate.changes.label'
        : kind === 'declined'
          ? 'portal.estimate.decline.label'
          : 'portal.estimate.update.label'
    const hint =
      kind === 'changes_requested'
        ? t('portal.estimate.changes.hint')
        : kind === 'declined'
          ? t('portal.estimate.decline.hint')
          : undefined
    const action =
      kind === 'changes_requested'
        ? 'portal.estimate.changes.send'
        : kind === 'declined'
          ? 'portal.estimate.decline.confirm'
          : 'portal.estimate.update.send'
    return (
      <div role="group" aria-labelledby={`${ids}-${kind}`} className="portal-estimate__form">
        <p id={`${ids}-${kind}`} className="hh-visually-hidden">
          {t(
            kind === 'changes_requested'
              ? 'portal.estimate.changes.open'
              : kind === 'declined'
                ? 'portal.estimate.decline.open'
                : 'portal.estimate.update.open',
          )}
        </p>
        <Field
          multiline
          label={t(label)}
          {...(hint ? { hint } : {})}
          value={text}
          maxLength={kind === 'declined' ? 1000 : 2000}
          onChange={(ev) => setText(ev.target.value)}
        />
        <div className="hh-button-row">
          <Button pending={pending} {...(blocked ? { disabledReason: blocked } : {})} onClick={() => void send(kind)}>
            {t(action)}
          </Button>
          <Button variant="secondary" onClick={() => (setOpen(null), setFailure(null))}>
            {t('portal.estimate.cancel')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <section className="portal-section" aria-labelledby={`${ids}-respond`} data-testid="estimate-respond">
      <h3 id={`${ids}-respond`} className="hh-h3">
        {t('portal.estimate.respond.title')}
      </h3>
      {requestUpdate ? <p>{t('portal.estimate.update.text')}</p> : null}
      {!e.freshVerification ? <p className="hh-muted">{t('portal.estimate.verifyFirst')}</p> : null}
      {open === null ? (
        <div className="hh-button-row">
          {requestChanges ? (
            <Button variant="secondary" onClick={() => start('changes_requested')}>
              {t('portal.estimate.changes.open')}
            </Button>
          ) : null}
          {decline ? (
            <Button variant="secondary" onClick={() => start('declined')}>
              {t('portal.estimate.decline.open')}
            </Button>
          ) : null}
          {requestUpdate ? (
            <Button variant="secondary" onClick={() => start('update_requested')}>
              {t('portal.estimate.update.open')}
            </Button>
          ) : null}
        </div>
      ) : (
        form(open)
      )}
      {failure ? <StateView kind="error" title={t(FAILURE[failure])} /> : null}
      {sent ? <StateView kind="success" title={t(SENT[sent])} /> : null}
    </section>
  )
}

function History({ e }: { e: EstimateDetail }) {
  if (e.responses.length === 0) return null
  return (
    <section className="portal-section" aria-labelledby="portal-estimate-history">
      <h3 id="portal-estimate-history" className="hh-h3">
        {t('portal.estimate.history.title')}
      </h3>
      <ol className="portal-timeline">
        {e.responses.map((r) => (
          <li key={`${r.at}-${r.kind}`} className="portal-timeline__item">
            <p className="portal-timeline__label">
              <strong>
                {t('portal.estimate.history.entry', {
                  kind: t(KIND_LABEL[r.kind]),
                  version: r.version,
                  date: when(r.at),
                })}
              </strong>
            </p>
            {r.message ? <p className="portal-timeline__text">{r.message}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  )
}

/** One estimate version in the Documents tab. */
export function EstimateView({
  reference,
  number,
  version,
  active,
  fetchImpl,
  onNavigate,
}: {
  reference: string
  number: string
  version: number
  active: boolean
  fetchImpl: Fetch
  onNavigate: (path: string) => void
}) {
  const { live, refresh } = useLive(
    () => portalApi.estimate(fetchImpl, { reference, number, version }),
    `${reference}/${number}/${version}`,
    active,
  )
  const back = `/portal/p/${encodeURIComponent(reference)}/documents`
  return (
    <div className="portal-estimate" data-testid="estimate-view">
      <p className="portal-back">
        <a
          href={back}
          onClick={(ev) => {
            if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button !== 0) return
            ev.preventDefault()
            onNavigate(back)
          }}
        >
          {t('portal.estimate.back')}
        </a>
      </p>
      <h2 className="hh-h3">{t('portal.estimate.heading', { number })}</h2>
      {live.phase !== 'ready' ? (
        <NotShown
          live={live}
          loading="portal.estimate.loading"
          failedTitle="portal.estimate.failed.title"
          onRetry={() => void refresh()}
        />
      ) : (
        <>
          <RefreshLine
            refreshedAt={live.refreshedAt}
            stale={live.stale}
            refreshing={live.refreshing}
            onRefresh={() => void refresh()}
          />
          {live.data.testMark ? (
            <p className="portal-estimate__test-mark" role="note">
              <strong>{t('estimatePdf.testMark')}</strong>
            </p>
          ) : null}
          <p>
            <StatusBadge tone={STATUS_TONE[live.data.status]}>
              {t('portal.estimate.versionStatus', {
                version: live.data.version,
                status: t(STATUS_LABEL[live.data.status]),
              })}
            </StatusBadge>
          </p>
          <div className={live.stale ? 'portal-estimate__body portal-section--stale' : 'portal-estimate__body'}>
            <Content e={live.data} />
            <Terms e={live.data} />
            {!live.data.freshVerification &&
            (live.data.approval.available ||
              live.data.actions.requestChanges ||
              live.data.actions.decline ||
              live.data.actions.requestUpdate) ? (
              <Reverify fetchImpl={fetchImpl} onVerified={refresh} />
            ) : null}
            <Approval e={live.data} fetchImpl={fetchImpl} onOpen={onNavigate} onDone={refresh} />
            <Respond e={live.data} fetchImpl={fetchImpl} onDone={refresh} />
            <History e={live.data} />
          </div>
        </>
      )}
    </div>
  )
}
