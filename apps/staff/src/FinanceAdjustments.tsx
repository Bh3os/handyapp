// Refunds, credits, write-offs and invoice voids on the job's payments page (TSK-0089 part 2; HH-FIN-14, T63, T64,
// OWN-DEC-138). The Owner records each one, decides Office's requests and records a Square refund's outcome; Office
// only requests (PROPOSED). Each needs a written reason, and the Owner signs in again (password or authenticator code)
// when the server asks. Nothing is edited or deleted; the buttons show only where the server would allow them.
import type { StaffKey } from '@handyhub/i18n'
import { cents, centsFromDecimal, formatUsd } from '@handyhub/money'
import { Button, Field, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { call, idempotencyKey, setCsrfToken, type Fetch } from './api'
import { depositRefusal } from './JobDeposit'
import { codeLabel } from './Requests'
import { useOnline } from './Shell'

type T = (key: StaffKey, values?: Record<string, string | number | Date>) => string
type StaffRef = { id: string; name: string | null }
type Type = 'refund' | 'credit' | 'write_off'
type Outcome = 'processing' | 'succeeded' | 'failed' | 'needs_review'

export type AdjustmentsData = {
  jobId: string
  items: {
    id: string
    type: Type
    state: string
    amountCents: number
    reason: string
    decisionReason: string | null
    payment: { id: string; method: string; receivedOn: string; amountCents: number } | null
    invoiceNumber: string | null
    requestedBy: StaffRef
    requestedAt: string
    decidedBy: StaffRef | null
    decidedAt: string | null
    confirmation: string | null
    canDecide: boolean
    outcomes: Outcome[]
  }[]
  refundable: { paymentId: string; method: string; receivedOn: string; availableCents: number }[]
  invoice: { id: string; number: string; state: string; remainingCents: number; pendingCents: number } | null
  voidable: { id: string; number: string; kind: string }[]
  actions: { refund: boolean; credit: boolean; writeOff: boolean; request: boolean; voidInvoice: boolean }
}

const PATH: Record<Type, string> = { refund: 'refunds', credit: 'credits', write_off: 'write-offs' }
const usd = (c: number) => formatUsd(cents(c))
const tone = (state: string) =>
  state === 'succeeded' || state === 'applied' || state === 'approved'
    ? 'success'
    : state === 'failed' || state === 'declined' || state === 'voided' || state === 'needs_review'
      ? 'danger'
      : 'warning'

/** What the open form does: record or request a new one, decide a request, record a refund's outcome, or void. */
type Step =
  | { kind: 'new' }
  | { kind: 'decide'; id: string; type: Type; decision: 'approve' | 'decline' }
  | { kind: 'outcome'; id: string; outcome: Outcome }
  | { kind: 'void'; invoiceId: string; number: string }

export function FinanceAdjustments({ t, fetchImpl, jobId }: { t: T; fetchImpl: Fetch; jobId: string }) {
  const ids = useId()
  const online = useOnline()
  const [data, setData] = useState<AdjustmentsData | null>(null)
  const [step, setStep] = useState<Step | null>(null)
  const [type, setType] = useState<Type>('refund')
  const [paymentId, setPaymentId] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [reauth, setReauth] = useState(false)
  const [password, setPassword] = useState('')
  const key = useRef<string | null>(null)
  const base = `/staff/jobs/${encodeURIComponent(jobId)}`
  const load = useCallback(async () => {
    const r = await call<AdjustmentsData>(fetchImpl, `${base}/finance-adjustments`)
    setData(r.ok ? r.data : null)
  }, [fetchImpl, base])
  useEffect(() => {
    void load()
  }, [load])
  if (!data) return null
  const a = data.actions
  const owner = a.refund || a.credit || a.writeOff
  const types = (['refund', 'credit', 'write_off'] as const).filter((x) =>
    a.request
      ? x !== 'refund' || data.refundable.length > 0
      : x === 'refund'
        ? a.refund && data.refundable.length > 0
        : x === 'credit'
          ? a.credit
          : a.writeOff,
  )
  if (data.items.length === 0 && types.length === 0 && data.voidable.length === 0) return null

  function open(s: Step) {
    setStep(s)
    setProblem(null)
    setDone(null)
    setReason('')
    setConfirmation('')
    key.current = null
  }

  /** The request the open form makes. */
  function request(s: Step): { path: string; body: Record<string, unknown> } | string {
    const why = reason.trim()
    if (why === '') return t('finance.reasonRequired')
    if (s.kind === 'decide')
      return {
        path: `/staff/${PATH[s.type]}/${encodeURIComponent(s.id)}/decision`,
        body: { decision: s.decision, reason: why },
      }
    if (s.kind === 'outcome') {
      if (s.outcome === 'succeeded' && confirmation.trim() === '') return t('finance.confirmationRequired')
      return {
        path: `/staff/refunds/${encodeURIComponent(s.id)}/outcome`,
        body: { outcome: s.outcome, confirmation: confirmation.trim() || null, reason: why },
      }
    }
    if (s.kind === 'void')
      return { path: `/staff/invoices/${encodeURIComponent(s.invoiceId)}/void`, body: { reason: why } }
    let amountCents: number
    try {
      amountCents = Number(centsFromDecimal(amount.trim()))
    } catch {
      return t('deposit.amountInvalid')
    }
    if (amountCents <= 0) return t('deposit.amountInvalid')
    const pay = type === 'refund' ? paymentId || data?.refundable[0]?.paymentId || '' : null
    if (type === 'refund' && !pay) return t('finance.paymentRequired')
    if (a.request)
      return {
        path: `${base}/finance-adjustment-requests`,
        body: { type, paymentId: pay, amountCents, reason: why },
      }
    return {
      path: `${base}/${PATH[type]}`,
      body: { ...(pay ? { paymentId: pay } : {}), amountCents, reason: why },
    }
  }

  async function submit() {
    if (!step) return
    const req = request(step)
    if (typeof req === 'string') return setProblem(req)
    setPending(true)
    setProblem(null)
    setDone(null)
    key.current ??= idempotencyKey()
    const r = await call<AdjustmentsData>(fetchImpl, req.path, {
      method: 'POST',
      body: req.body,
      headers: { 'idempotency-key': key.current },
    })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (!r.ok) {
      if (r.error.code === 'FRESH_AUTH_REQUIRED') setReauth(true)
      return setProblem(r.error.code === 'FRESH_AUTH_REQUIRED' ? t('finance.freshSignIn') : depositRefusal(t, r.error))
    }
    setData(r.data)
    setStep(null)
    setAmount('')
    setReason('')
    setConfirmation('')
    setDone(t(a.request && step.kind === 'new' ? 'finance.requested' : 'finance.done'))
  }

  async function signInAgain(e: FormEvent) {
    e.preventDefault()
    const r = await call<{ csrfToken: string }>(fetchImpl, '/staff/auth/reauth', { method: 'POST', body: { password } })
    setPassword('')
    if (!r.ok) return setProblem(depositRefusal(t, r.error))
    // The re-authentication rotates the session and its CSRF token.
    setCsrfToken(r.data.csrfToken)
    setReauth(false)
    setProblem(null)
    await submit()
  }

  const offline = !online ? { disabledReason: t('offline.needsConnection') } : {}
  return (
    <section className="staff-deposit" aria-labelledby={`${ids}-title`} data-testid="finance-adjustments">
      <h2 id={`${ids}-title`} className="staff-queue__heading">
        {t('finance.title')}
      </h2>
      <p className="staff-request__hint">{t(owner ? 'finance.hintOwner' : 'finance.hintOffice')}</p>
      {data.items.length ? (
        <ul className="staff-deposit__payments" aria-label={t('finance.list')} data-testid="finance-items">
          {data.items.map((i) => (
            <li key={i.id}>
              {codeLabel(t, 'financeAdjustmentType', i.type)} · {usd(i.amountCents)}{' '}
              <StatusBadge tone={tone(i.state)}>{codeLabel(t, 'financeAdjustmentState', i.state)}</StatusBadge>
              <br />
              {i.payment
                ? t('finance.ofPayment', {
                    method: codeLabel(t, 'paymentMethod', i.payment.method),
                    date: i.payment.receivedOn,
                    amount: usd(i.payment.amountCents),
                  })
                : i.invoiceNumber
                  ? t('finance.ofInvoice', { number: i.invoiceNumber })
                  : null}
              <br />
              {t('finance.requestedBy', {
                name: i.requestedBy.name ?? t('queue.unnamed'),
                time: new Date(i.requestedAt),
              })}{' '}
              {/* The requester's own words, as written. */}
              {i.reason}
              {i.decidedBy && i.decidedAt ? (
                <>
                  <br />
                  {t('finance.decidedBy', {
                    name: i.decidedBy.name ?? t('queue.unnamed'),
                    time: new Date(i.decidedAt),
                  })}{' '}
                  {i.decisionReason}
                </>
              ) : null}
              {i.confirmation ? (
                <>
                  <br />
                  {t('finance.confirmationShown', { id: i.confirmation })}
                </>
              ) : null}
              {(i.canDecide || i.outcomes.length) && !step ? (
                <div className="hh-button-row">
                  {i.canDecide ? (
                    <>
                      <Button
                        onClick={() => open({ kind: 'decide', id: i.id, type: i.type, decision: 'approve' })}
                        {...offline}
                      >
                        {t('finance.approve')}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => open({ kind: 'decide', id: i.id, type: i.type, decision: 'decline' })}
                        {...offline}
                      >
                        {t('finance.decline')}
                      </Button>
                    </>
                  ) : null}
                  {i.outcomes.map((o) => (
                    <Button
                      key={o}
                      variant="secondary"
                      onClick={() => open({ kind: 'outcome', id: i.id, outcome: o })}
                      {...offline}
                    >
                      {codeLabel(t, 'refundOutcome', o)}
                    </Button>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {!step ? (
        <div className="hh-button-row">
          {types.length ? (
            <Button
              variant="secondary"
              onClick={() => {
                setType(types[0] as Type)
                open({ kind: 'new' })
              }}
              {...offline}
            >
              {t(a.request ? 'finance.new.request' : 'finance.new.record')}
            </Button>
          ) : null}
          {data.voidable.map((v) => (
            <Button
              key={v.id}
              variant="danger"
              onClick={() => open({ kind: 'void', invoiceId: v.id, number: v.number })}
              {...offline}
            >
              {t('finance.void', { number: v.number })}
            </Button>
          ))}
        </div>
      ) : reauth ? (
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
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          noValidate
          aria-labelledby={`${ids}-form`}
          data-testid="finance-form"
        >
          <p id={`${ids}-form`}>
            <strong>
              {step.kind === 'new'
                ? t(a.request ? 'finance.new.request' : 'finance.new.record')
                : step.kind === 'decide'
                  ? t(step.decision === 'approve' ? 'finance.approve' : 'finance.decline')
                  : step.kind === 'outcome'
                    ? codeLabel(t, 'refundOutcome', step.outcome)
                    : t('finance.void', { number: step.number })}
            </strong>
          </p>
          {step.kind === 'void' ? <p className="staff-request__hint">{t('finance.voidHint')}</p> : null}
          {step.kind === 'new' ? (
            <>
              <div className="staff-queue__select">
                <label htmlFor={`${ids}-type`}>{t('finance.type')}</label>
                <select id={`${ids}-type`} value={type} onChange={(e) => setType(e.target.value as Type)}>
                  {types.map((x) => (
                    <option key={x} value={x}>
                      {codeLabel(t, 'financeAdjustmentType', x)}
                    </option>
                  ))}
                </select>
              </div>
              <p className="staff-request__hint">
                {type === 'refund'
                  ? t('finance.hint.refund')
                  : t(type === 'credit' ? 'finance.hint.credit' : 'finance.hint.write_off', {
                      amount: usd(Math.max(0, (data.invoice?.remainingCents ?? 0) - (data.invoice?.pendingCents ?? 0))),
                    })}
              </p>
              {type === 'refund' ? (
                <div className="staff-queue__select">
                  <label htmlFor={`${ids}-payment`}>{t('finance.payment')}</label>
                  <select id={`${ids}-payment`} value={paymentId} onChange={(e) => setPaymentId(e.target.value)}>
                    {data.refundable.map((p) => (
                      <option key={p.paymentId} value={p.paymentId}>
                        {t('finance.refundable', {
                          method: codeLabel(t, 'paymentMethod', p.method),
                          date: p.receivedOn,
                          amount: usd(p.availableCents),
                        })}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <Field
                label={t('finance.amount')}
                name="adjustmentAmount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </>
          ) : null}
          {step.kind === 'outcome' && step.outcome === 'succeeded' ? (
            <Field
              label={t('finance.confirmation')}
              name="refundConfirmation"
              maxLength={120}
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              required
            />
          ) : null}
          <Field
            label={t('payment.exception.reason')}
            name="adjustmentReason"
            multiline
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
          <div className="hh-button-row">
            <Button type="submit" variant={step.kind === 'void' ? 'danger' : 'primary'} pending={pending} {...offline}>
              {t('payment.exception.submit')}
            </Button>
            <Button variant="secondary" onClick={() => setStep(null)}>
              {t('payment.exception.cancel')}
            </Button>
          </div>
        </form>
      )}
      {problem ? (
        <p role="alert" className="hh-field__error">
          {problem}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="staff-request__hint">
          {done}
        </p>
      ) : null}
    </section>
  )
}
