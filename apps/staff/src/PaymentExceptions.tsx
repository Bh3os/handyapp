// What happened to a recorded payment afterwards (TSK-0089; HH-FIN-13, HH-FIN-14, T63): its history (a check returned,
// a payment failed, a dispute and its outcome, a void), an open dispute, and the steps this user may record now. The
// buttons show only where the server would allow them: a returned check for the Owner or Office; everything else for
// the Owner, who signs in again (password or authenticator code) when the server asks. Each step needs a reason;
// nothing is edited or deleted, and a correction records the right payment beside the voided one.
import type { StaffKey } from '@handyhub/i18n'
import { centsFromDecimal } from '@handyhub/money'
import { Button, Field, StatusBadge } from '@handyhub/ui'
import { useId, useRef, useState, type FormEvent } from 'react'
import { call, idempotencyKey, setCsrfToken, type Fetch } from './api'
import { depositRefusal } from './JobDeposit'
import { codeLabel } from './Requests'
import { useOnline } from './Shell'

type T = (key: StaffKey, values?: Record<string, string | number | Date>) => string

export const ADJUSTMENT_KINDS = [
  'returned',
  'failed',
  'dispute_opened',
  'dispute_won',
  'dispute_lost',
  'voided',
] as const
export type AdjustmentKind = (typeof ADJUSTMENT_KINDS)[number]

export type Adjustment = {
  kind: AdjustmentKind
  reason: string
  evidence: string | null
  by: { id: string; name: string | null }
  at: string
}

export type PaymentExceptionFields = {
  id: string
  adjustments?: Adjustment[]
  disputeOpen?: boolean
  adjustable?: AdjustmentKind[]
  correctsPaymentId?: string | null
}

const ACTION: Record<AdjustmentKind, StaffKey> = {
  returned: 'payment.exception.action.returned',
  failed: 'payment.exception.action.failed',
  dispute_opened: 'payment.exception.action.dispute_opened',
  dispute_won: 'payment.exception.action.dispute_won',
  dispute_lost: 'payment.exception.action.dispute_lost',
  voided: 'payment.exception.action.voided',
}
const HINT: Record<AdjustmentKind, StaffKey> = {
  returned: 'payment.exception.hint.returned',
  failed: 'payment.exception.hint.failed',
  dispute_opened: 'payment.exception.hint.dispute_opened',
  dispute_won: 'payment.exception.hint.dispute_won',
  dispute_lost: 'payment.exception.hint.dispute_lost',
  voided: 'payment.exception.hint.voided',
}

/** The request each step makes: a returned check, an Owner adjustment, or a correction (void, then the right one). */
function request(
  id: string,
  kind: AdjustmentKind,
  reason: string,
  evidence: string | null,
  amountCents: number | null,
) {
  const base = `/staff/payments/${encodeURIComponent(id)}`
  if (kind === 'returned') return { path: `${base}/returned`, body: { reason, evidence } }
  if (kind === 'voided')
    return {
      path: `${base}/correction`,
      body: { reason, evidence, replacement: amountCents === null ? null : { amountCents } },
    }
  return { path: `${base}/adjustments`, body: { kind, reason, evidence } }
}

export function PaymentExceptions<D>({
  t,
  fetchImpl,
  p,
  onChanged,
}: {
  t: T
  fetchImpl: Fetch
  p: PaymentExceptionFields
  /** The server's view after the step (the job's deposit view). */
  onChanged: (data: D) => void | Promise<void>
}) {
  const ids = useId()
  const online = useOnline()
  const [open, setOpen] = useState<AdjustmentKind | null>(null)
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState('')
  const [amount, setAmount] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [reauth, setReauth] = useState(false)
  const [password, setPassword] = useState('')
  const key = useRef<string | null>(null)
  const adjustments = p.adjustments ?? []
  const adjustable = p.adjustable ?? []

  async function submit() {
    if (!open) return
    if (reason.trim() === '') return setProblem(t('payment.exception.reasonRequired'))
    let amountCents: number | null = null
    if (open === 'voided' && amount.trim() !== '') {
      try {
        amountCents = Number(centsFromDecimal(amount.trim()))
      } catch {
        return setProblem(t('deposit.amountInvalid'))
      }
      if (amountCents <= 0) return setProblem(t('deposit.amountInvalid'))
    }
    setPending(true)
    setProblem(null)
    setDone(null)
    key.current ??= idempotencyKey()
    const { path, body } = request(p.id, open, reason.trim(), evidence.trim() || null, amountCents)
    const r = await call<D>(fetchImpl, path, { method: 'POST', body, headers: { 'idempotency-key': key.current } })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (!r.ok) {
      if (r.error.code === 'FRESH_AUTH_REQUIRED') setReauth(true)
      return setProblem(
        r.error.code === 'FRESH_AUTH_REQUIRED' ? t('payment.exception.freshSignIn') : depositRefusal(t, r.error),
      )
    }
    setOpen(null)
    setReason('')
    setEvidence('')
    setAmount('')
    setDone(t('payment.exception.done'))
    await onChanged(r.data)
  }

  async function signInAgain(e: FormEvent) {
    e.preventDefault()
    const r = await call<{ csrfToken: string }>(fetchImpl, '/staff/auth/reauth', {
      method: 'POST',
      body: { password },
    })
    setPassword('')
    if (!r.ok) return setProblem(depositRefusal(t, r.error))
    // The re-authentication rotates the session and its CSRF token.
    setCsrfToken(r.data.csrfToken)
    setReauth(false)
    setProblem(null)
    await submit()
  }

  if (adjustments.length === 0 && !p.disputeOpen && adjustable.length === 0 && !p.correctsPaymentId) return null
  return (
    <div data-testid="payment-exceptions">
      {p.correctsPaymentId ? (
        <>
          <br />
          {t('payment.exception.corrects')}
        </>
      ) : null}
      {p.disputeOpen ? (
        <>
          <br />
          <StatusBadge tone="warning">{t('payment.exception.disputeOpen')}</StatusBadge>
        </>
      ) : null}
      {adjustments.length ? (
        <ul aria-label={t('payment.exception.history')} data-testid="payment-adjustments">
          {adjustments.map((a, n) => (
            <li key={n}>
              {t('payment.exception.entry', {
                kind: codeLabel(t, 'paymentAdjustment', a.kind),
                name: a.by.name ?? t('queue.unnamed'),
                time: new Date(a.at),
              })}{' '}
              {/* The recorder's own words, as written. */}
              {a.reason}
              {a.evidence ? ` · ${t('payment.exception.evidenceShown', { evidence: a.evidence })}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {adjustable.length && !open ? (
        <div className="hh-button-row">
          {adjustable.map((k) => (
            <Button
              key={k}
              variant={k === 'dispute_won' ? 'secondary' : 'danger'}
              onClick={() => {
                setOpen(k)
                setProblem(null)
                setDone(null)
              }}
              {...(!online ? { disabledReason: t('offline.needsConnection') } : {})}
            >
              {t(ACTION[k])}
            </Button>
          ))}
        </div>
      ) : null}
      {open && reauth ? (
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
      ) : open ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          noValidate
          aria-labelledby={`${ids}-title`}
          data-testid="payment-exception-form"
        >
          <p id={`${ids}-title`}>
            <strong>{t(ACTION[open])}</strong>
          </p>
          <p className="staff-request__hint">{t(HINT[open])}</p>
          <Field
            label={t('payment.exception.reason')}
            name="exceptionReason"
            multiline
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
          <Field
            label={t('payment.exception.evidence')}
            hint={t('payment.exception.evidenceHint')}
            name="exceptionEvidence"
            maxLength={500}
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
          />
          {open === 'voided' ? (
            <Field
              label={t('payment.exception.amount')}
              hint={t('payment.exception.amountHint')}
              name="exceptionAmount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          ) : null}
          <div className="hh-button-row">
            <Button
              type="submit"
              variant="danger"
              pending={pending}
              {...(!online ? { disabledReason: t('offline.needsConnection') } : {})}
            >
              {t('payment.exception.submit')}
            </Button>
            <Button variant="secondary" onClick={() => setOpen(null)}>
              {t('payment.exception.cancel')}
            </Button>
          </div>
        </form>
      ) : null}
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
    </div>
  )
}
