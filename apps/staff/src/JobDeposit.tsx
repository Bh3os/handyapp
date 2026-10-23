// The job's deposit panel (TSK-0059; HH-FIN-02, HH-FIN-03, HH-FIN-09, HH-FIN-12, T36, T64, OWN-DEC-76, OWN-DEC-104,
// OWN-DEC-138, RULE-SERVER-AUTHZ). Shown under the customer's approval to the roles that may see payments (the Owner,
// Office); for anyone else the server refuses the read and the panel is not shown.
// - What the approval pinned: required with its amount, or not required; verified and pending (uncleared check)
//   money; what it still needs; whether work visits may be confirmed as it stands.
// - The deposit request's Square payment link, recorded payments (method, amount, date, reference, payer, collector,
//   state) and, for the Owner, Mark cleared on a received check they did not collect.
// - The Owner's waiver: a written reason and a fresh sign-in (the password is asked for when the server needs it).
//   A waiver never marks the deposit paid and never changes the price.
// The server decides every action again; a refusal names its reason.
import type { StaffKey } from '@handyhub/i18n'
import { cents, centsFromDecimal, formatUsd } from '@handyhub/money'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { call, idempotencyKey, setCsrfToken, type ApiErrorBody, type Fetch } from './api'
import { JobInvoices } from './JobInvoices'
import { codeLabel } from './Requests'
import { useOnline } from './Shell'
import { FinanceAdjustments } from './FinanceAdjustments'
import { ReportReconciliation } from './Reconciliation'
import { PaymentExceptions, type PaymentExceptionFields } from './PaymentExceptions'
import { PaymentSteps, type PaymentStepFields } from './PaymentSteps'

type T = (key: StaffKey, values?: Record<string, string | number | Date>) => string
type StaffRef = { id: string; name: string | null }

export const PAYMENT_METHODS = [
  'square_payment_link',
  'square_tap_to_pay',
  'cash',
  'check',
  'zelle',
  'cash_app',
  'chime',
] as const

export type Deposit = {
  jobId: string
  required: boolean
  state: string
  amountCents: number | null
  baseTotalCents: number
  ruleVersion: number
  verifiedCents: number
  pendingCents: number
  remainingCents: number | null
  workScheduling: 'open' | 'blocked'
  paymentLink: { url: string; setBy: StaffRef | null; setAt: string } | null
  waiver: { by: StaffRef; at: string; reason: string } | null
  payments: ({
    id: string
    method: string
    amountCents: number
    appliedCents: number
    unappliedCents: number
    receivedOn: string
    reference: string | null
    payerName: string | null
    state: string
    verified: boolean
    collector: StaffRef
    recordedBy: StaffRef
    recordedAt: string
    clearedBy: StaffRef | null
    clearedAt: string | null
    canMarkCleared: boolean
  } & PaymentStepFields &
    PaymentExceptionFields)[]
  version: number
  actions: { enterPaymentLink: boolean; recordPayment: boolean; waive: boolean }
}

const usd = (c: number) => formatUsd(cents(c))
const tone = (state: string) =>
  state === 'satisfied' || state === 'waived' || state === 'not_required' || state === 'applied'
    ? 'success'
    : state === 'partly_satisfied'
      ? 'info'
      : 'warning'

/** A refusal in words: field codes from the depositRefusal family, otherwise the error code. */
export function depositRefusal(t: T, err: ApiErrorBody): string {
  if (err.code === 'FRESH_AUTH_REQUIRED') return t('deposit.freshSignIn')
  if (err.code === 'STALE_VERSION') return t('deposit.stale')
  const f = err.fieldErrors[0]
  if (f) return codeLabel(t, 'depositRefusal', f.code)
  try {
    return t(`error.${err.code}` as StaffKey)
  } catch {
    return t('deposit.failed')
  }
}

/** Today's date as YYYY-MM-DD on this device (the server checks it against the business day). */
function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * The job's deposit as its own page (/payments/<job id>): where the action queue's deposit_due item opens, for the
 * Owner and Office, who record payments without opening the estimate.
 */
export function JobDepositPage({ t, fetchImpl, jobId }: { t: T; fetchImpl: Fetch; jobId: string }) {
  return (
    <section className="staff-screen staff-request" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('deposit.pageTitle')}
      </h1>
      <JobDeposit t={t} fetchImpl={fetchImpl} jobId={jobId} page />
      {/* TSK-0085, TSK-0086: the job's invoices beside its deposit. */}
      <JobInvoices t={t} fetchImpl={fetchImpl} jobId={jobId} />
      {/* TSK-0089: refunds, credits, write-offs and invoice voids. */}
      <FinanceAdjustments t={t} fetchImpl={fetchImpl} jobId={jobId} />
      {/* TSK-0090: money that cannot be matched yet (an uncertain outcome) goes to the reconciliation queue. */}
      <ReportReconciliation t={t} fetchImpl={fetchImpl} jobId={jobId} />
    </section>
  )
}

export function JobDeposit({
  t,
  fetchImpl,
  jobId,
  page = false,
}: {
  t: T
  fetchImpl: Fetch
  jobId: string
  page?: boolean
}) {
  // TSK-0079 (HH-OFF-04): this action needs the server; offline it is refused, never queued.
  const online = useOnline()
  const ids = useId()
  const [deposit, setDeposit] = useState<Deposit | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [link, setLink] = useState('')
  const [method, setMethod] = useState<string>('cash')
  const [amount, setAmount] = useState('')
  const [amountError, setAmountError] = useState<string | null>(null)
  const [receivedOn, setReceivedOn] = useState(today())
  const [reference, setReference] = useState('')
  const [payerName, setPayerName] = useState('')
  const [memo, setMemo] = useState('')
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [reauth, setReauth] = useState(false)
  const [password, setPassword] = useState('')
  const keys = useRef(new Map<string, string>())

  useEffect(() => {
    void call<Deposit>(fetchImpl, `/staff/jobs/${encodeURIComponent(jobId)}/deposit`).then((r) =>
      setDeposit(r.ok ? r.data : null),
    )
  }, [fetchImpl, jobId])
  if (deposit === null && page) return <StateView kind="blocked" title={t('record.notFound')} />
  if (!deposit) return null

  const base = `/staff/jobs/${encodeURIComponent(jobId)}/deposit`
  const name = (r: StaffRef | null) => (r ? (r.name ?? t('queue.unnamed')) : '—')

  async function send(action: string, path: string, method: 'POST' | 'PUT', body: unknown, ifMatch?: number) {
    setPending(action)
    setError(null)
    setDone(null)
    if (!keys.current.has(action)) keys.current.set(action, idempotencyKey())
    const r = await call<Deposit>(fetchImpl, path, {
      method,
      body,
      headers: {
        'idempotency-key': keys.current.get(action) as string,
        ...(ifMatch === undefined ? {} : { 'if-match': `"${ifMatch}"` }),
      },
    })
    setPending(null)
    if (r.ok || r.status < 500) keys.current.delete(action)
    if (!r.ok) {
      if (action === 'waive' && r.error.code === 'FRESH_AUTH_REQUIRED') setReauth(true)
      setError(depositRefusal(t, r.error))
      return false
    }
    setDeposit(r.data)
    return true
  }

  async function saveLink(e: FormEvent) {
    e.preventDefault()
    if (!deposit) return
    if (await send('link', `${base}/payment-link`, 'PUT', { url: link.trim() }, deposit.version)) {
      setLink('')
      setDone(t('deposit.linkSaved'))
    }
  }

  async function record(e: FormEvent) {
    e.preventDefault()
    let amountCents: number
    try {
      amountCents = Number(centsFromDecimal(amount.trim()))
    } catch {
      return setAmountError(t('deposit.amountInvalid'))
    }
    if (amountCents <= 0) return setAmountError(t('deposit.amountInvalid'))
    setAmountError(null)
    const ok = await send('record', `${base}/payments`, 'POST', {
      method,
      amountCents,
      receivedOn,
      reference: reference.trim() === '' ? null : reference.trim(),
      payerName: payerName.trim() === '' ? null : payerName.trim(),
      memo: memo.trim() === '' ? null : memo.trim(),
    })
    if (ok) {
      setAmount('')
      setReference('')
      setPayerName('')
      setMemo('')
      setDone(t('deposit.recorded'))
    }
  }

  async function clear(paymentId: string) {
    if (await send(`clear-${paymentId}`, `/staff/payments/${encodeURIComponent(paymentId)}/clear`, 'POST', {}))
      setDone(t('deposit.cleared'))
  }

  async function waive(e: FormEvent) {
    e.preventDefault()
    if (reason.trim() === '') return setReasonError(t('deposit.reasonRequired'))
    setReasonError(null)
    if (await send('waive', `${base}/waiver`, 'POST', { reason: reason.trim() })) {
      setReason('')
      setDone(t('deposit.waived'))
    }
  }

  async function signInAgain(e: FormEvent) {
    e.preventDefault()
    const r = await call<{ csrfToken: string }>(fetchImpl, '/staff/auth/reauth', {
      method: 'POST',
      body: { password },
    })
    setPassword('')
    if (!r.ok) return setError(depositRefusal(t, r.error))
    // The re-authentication rotates the session and its CSRF token.
    setCsrfToken(r.data.csrfToken)
    setReauth(false)
    setError(null)
    if (await send('waive', `${base}/waiver`, 'POST', { reason: reason.trim() })) {
      setReason('')
      setDone(t('deposit.waived'))
    }
  }

  const d = deposit
  return (
    <div role="group" aria-labelledby={`${ids}-deposit`} data-testid="job-deposit" className="staff-deposit">
      {page ? (
        <h2 id={`${ids}-deposit`} className="staff-queue__heading">
          {t('deposit.title')}
        </h2>
      ) : (
        <h3 id={`${ids}-deposit`} className="staff-queue__heading">
          {t('deposit.title')}
        </h3>
      )}
      <dl className="staff-record">
        <dt>{t('deposit.state')}</dt>
        <dd>
          <StatusBadge tone={tone(d.state)}>{codeLabel(t, 'depositState', d.state)}</StatusBadge>
        </dd>
        <dt>{t('deposit.amount')}</dt>
        <dd>{d.amountCents === null ? t('deposit.notRequired') : usd(d.amountCents)}</dd>
        {d.required ? (
          <>
            <dt>{t('deposit.verified')}</dt>
            <dd>{usd(d.verifiedCents)}</dd>
            <dt>{t('deposit.pending')}</dt>
            <dd>{usd(d.pendingCents)}</dd>
            <dt>{t('deposit.remaining')}</dt>
            <dd>{usd(d.remainingCents ?? 0)}</dd>
          </>
        ) : null}
        <dt>{t('deposit.workScheduling')}</dt>
        <dd data-testid="deposit-work-scheduling">
          {d.workScheduling === 'open' ? t('deposit.schedulingOpen') : t('deposit.schedulingBlocked')}
        </dd>
        {d.paymentLink ? (
          <>
            <dt>{t('deposit.link')}</dt>
            <dd>
              <a href={d.paymentLink.url} target="_blank" rel="noopener noreferrer">
                {d.paymentLink.url}
              </a>{' '}
              <span className="staff-request__hint">
                {t('deposit.linkBy', { name: name(d.paymentLink.setBy), time: new Date(d.paymentLink.setAt) })}
              </span>
            </dd>
          </>
        ) : null}
        {d.waiver ? (
          <>
            <dt>{t('deposit.waiver')}</dt>
            <dd data-testid="deposit-waiver">
              {t('deposit.waiverBy', { name: name(d.waiver.by), time: new Date(d.waiver.at) })}
              <br />
              {/* The Owner's own words, exactly as written: never translated. */}
              {d.waiver.reason}
            </dd>
          </>
        ) : null}
      </dl>
      <p className="staff-request__hint">{t('deposit.hint')}</p>

      {d.payments.length ? (
        <ul className="staff-deposit__payments" aria-label={t('deposit.payments')}>
          {d.payments.map((p) => (
            <li key={p.id} data-testid="deposit-payment">
              <strong>
                {codeLabel(t, 'paymentMethod', p.method)} · {usd(p.amountCents)}
              </strong>{' '}
              <StatusBadge tone={p.verified ? 'success' : 'warning'}>
                {codeLabel(t, 'paymentState', p.state)}
              </StatusBadge>
              <br />
              {t('deposit.paymentLine', {
                date: p.receivedOn,
                collector: name(p.collector),
                applied: usd(p.appliedCents),
              })}
              {p.reference ? ` · ${t('deposit.referenceShown', { reference: p.reference })}` : null}
              {p.payerName ? ` · ${p.payerName}` : null}
              {p.unappliedCents > 0 ? (
                <>
                  <br />
                  {t('deposit.unapplied', { amount: usd(p.unappliedCents) })}
                </>
              ) : null}
              <PaymentSteps
                t={t}
                p={p}
                pending={pending}
                run={(action, path, doneKey) =>
                  void send(action, path, 'POST', {}).then((ok) => ok && setDone(t(doneKey)))
                }
              />
              {/* TSK-0089: a check returned, a payment failed or disputed, a correction. */}
              <PaymentExceptions t={t} fetchImpl={fetchImpl} p={p} onChanged={(d: Deposit) => setDeposit(d)} />
              {p.canMarkCleared ? (
                <div className="hh-button-row">
                  <Button variant="secondary" pending={pending === `clear-${p.id}`} onClick={() => void clear(p.id)}>
                    {t('deposit.markCleared')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <StateView kind="error" title={error} /> : null}
      {done ? (
        <p role="status" className="staff-request__hint">
          {done}
        </p>
      ) : null}

      {d.actions.enterPaymentLink ? (
        <form onSubmit={(e) => void saveLink(e)} noValidate aria-label={t('deposit.linkTitle')}>
          <Field
            label={t('deposit.linkLabel')}
            hint={t('deposit.linkHint')}
            name="paymentLink"
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            required
          />
          <Button type="submit" variant="secondary" pending={pending === 'link'}>
            {t('deposit.linkSave')}
          </Button>
        </form>
      ) : null}

      {d.actions.recordPayment ? (
        <form onSubmit={(e) => void record(e)} noValidate aria-label={t('deposit.recordTitle')}>
          <p className="staff-request__hint">{t('deposit.recordHint')}</p>
          <div className="staff-queue__select">
            <label htmlFor={`${ids}-method`}>{t('deposit.method')}</label>
            <select id={`${ids}-method`} value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {codeLabel(t, 'paymentMethod', m)}
                </option>
              ))}
            </select>
          </div>
          <Field
            label={t('deposit.amountLabel')}
            name="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            {...(amountError ? { error: amountError } : {})}
            required
          />
          <Field
            label={t('deposit.receivedOn')}
            name="receivedOn"
            type="date"
            value={receivedOn}
            onChange={(e) => setReceivedOn(e.target.value)}
            required
          />
          <Field
            label={t('deposit.reference')}
            hint={t('deposit.referenceHint')}
            name="reference"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          {method === 'check' ? (
            <Field
              label={t('deposit.payerName')}
              name="payerName"
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              required
            />
          ) : null}
          <Field
            label={t('payment.memo')}
            hint={t('payment.memoHint')}
            name="memo"
            maxLength={500}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
          <Button
            type="submit"
            pending={pending === 'record'}
            {...(!online ? { disabledReason: t('offline.needsConnection') } : {})}
          >
            {t('deposit.record')}
          </Button>
        </form>
      ) : null}

      {d.actions.waive ? (
        reauth ? (
          <form onSubmit={(e) => void signInAgain(e)} noValidate aria-label={t('deposit.reauthTitle')}>
            <p>{t('security.reauthIntro')}</p>
            <Field
              label={t('signIn.password')}
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit">{t('security.reauthSubmit')}</Button>
          </form>
        ) : (
          <form onSubmit={(e) => void waive(e)} noValidate aria-label={t('deposit.waiveTitle')}>
            <p className="staff-request__hint">{t('deposit.waiveHint')}</p>
            <Field
              label={t('deposit.waiveReason')}
              name="waiverReason"
              multiline
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              {...(reasonError ? { error: reasonError } : {})}
              required
            />
            <Button type="submit" variant="danger" pending={pending === 'waive'}>
              {t('deposit.waive')}
            </Button>
          </form>
        )
      ) : null}
    </div>
  )
}
