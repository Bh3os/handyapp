// Money collected on site, from the job packet (TSK-0088 part 2; HH-FIN-11, HH-FIN-12, T62, OWN-DEC-200). Shown
// only when the server allows the caller to collect on this job (a Worker needs the Owner's collect grant and an
// assignment); otherwise nothing is shown. The collector records their own collection at once: cash, a check (its
// number and payer; pending until the Owner clears it) or Square Tap to Pay (its Square payment ID), toward the
// deposit while it is due or the issued final invoice. Their own collections show with each receipt number. Online
// only: a payment is never recorded offline.
import type { StaffKey } from '@handyhub/i18n'
import { cents, centsFromDecimal, formatUsd } from '@handyhub/money'
import { Button, Field, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { call, idempotencyKey, type Fetch } from './api'
import { depositRefusal } from './JobDeposit'
import { codeLabel } from './Requests'
import { useOnline } from './Shell'

type T = (key: StaffKey, values?: Record<string, string | number | Date>) => string

type Method = 'cash' | 'check' | 'square_tap_to_pay'
export type CollectionData = {
  jobId: string
  reference: string
  deposit: { remainingCents: number; pendingCents: number } | null
  invoice: { number: string; remainingCents: number; pendingCents: number } | null
  methods: Method[]
  mine: { method: string; amountCents: number; receivedOn: string; state: string; receiptNumber: string | null }[]
}

const usd = (c: number) => formatUsd(cents(c))

export function CollectPayment({ t, fetchImpl, jobId }: { t: T; fetchImpl: Fetch; jobId: string }) {
  const ids = useId()
  const online = useOnline()
  const [data, setData] = useState<CollectionData | null>(null)
  const [target, setTarget] = useState<'deposit' | 'invoice'>('deposit')
  const [method, setMethod] = useState<Method>('cash')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [payerName, setPayerName] = useState('')
  const [memo, setMemo] = useState('')
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const key = useRef<string | null>(null)
  const path = `/staff/jobs/${encodeURIComponent(jobId)}/collection`
  const load = useCallback(async () => {
    const r = await call<CollectionData>(fetchImpl, path)
    if (!r.ok) return setData(null)
    setData(r.data)
    setTarget(r.data.deposit ? 'deposit' : 'invoice')
  }, [fetchImpl, path])
  useEffect(() => {
    void load()
  }, [load])
  if (!data || (!data.deposit && !data.invoice && data.mine.length === 0)) return null

  async function submit(e: FormEvent) {
    e.preventDefault()
    let amountCents: number
    try {
      amountCents = Number(centsFromDecimal(amount.trim()))
    } catch {
      return setProblem(t('deposit.amountInvalid'))
    }
    if (amountCents <= 0) return setProblem(t('deposit.amountInvalid'))
    setPending(true)
    setProblem(null)
    setDone(false)
    key.current ??= idempotencyKey()
    const r = await call<CollectionData>(fetchImpl, path, {
      method: 'POST',
      headers: { 'idempotency-key': key.current },
      body: {
        target,
        method,
        amountCents,
        reference: reference.trim() || null,
        payerName: payerName.trim() || null,
        memo: memo.trim() || null,
      },
    })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (!r.ok) return setProblem(depositRefusal(t, r.error))
    setData(r.data)
    setAmount('')
    setReference('')
    setPayerName('')
    setMemo('')
    setDone(true)
  }

  const open = data.deposit || data.invoice
  return (
    <section className="staff-deposit" aria-labelledby={`${ids}-title`} data-testid="collect-payment">
      <h3 id={`${ids}-title`} className="staff-queue__heading">
        {t('collect.title')}
      </h3>
      <p className="staff-request__hint">{t('collect.hint')}</p>
      {data.deposit ? (
        <p data-testid="collect-deposit">
          {t('collect.depositDue', { amount: usd(data.deposit.remainingCents) })}
          {data.deposit.pendingCents > 0 ? ` ${t('collect.pending', { amount: usd(data.deposit.pendingCents) })}` : ''}
        </p>
      ) : null}
      {data.invoice ? (
        <p data-testid="collect-invoice">
          {t('collect.invoiceDue', { number: data.invoice.number, amount: usd(data.invoice.remainingCents) })}
          {data.invoice.pendingCents > 0 ? ` ${t('collect.pending', { amount: usd(data.invoice.pendingCents) })}` : ''}
        </p>
      ) : null}
      {open ? (
        <form onSubmit={(e) => void submit(e)} noValidate aria-label={t('collect.title')}>
          {data.deposit && data.invoice ? (
            <div className="staff-queue__select">
              <label htmlFor={`${ids}-target`}>{t('collect.target')}</label>
              <select
                id={`${ids}-target`}
                value={target}
                onChange={(e) => setTarget(e.target.value as 'deposit' | 'invoice')}
              >
                <option value="deposit">{t('collect.targetDeposit')}</option>
                <option value="invoice">{t('collect.targetInvoice', { number: data.invoice.number })}</option>
              </select>
            </div>
          ) : null}
          <div className="staff-queue__select">
            <label htmlFor={`${ids}-method`}>{t('deposit.method')}</label>
            <select id={`${ids}-method`} value={method} onChange={(e) => setMethod(e.target.value as Method)}>
              {data.methods.map((m) => (
                <option key={m} value={m}>
                  {codeLabel(t, 'paymentMethod', m)}
                </option>
              ))}
            </select>
          </div>
          <Field
            label={t('deposit.amountLabel')}
            name="collectAmount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
          {method !== 'cash' ? (
            <Field
              label={t(method === 'check' ? 'collect.checkNumber' : 'collect.squareId')}
              name="collectReference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              required
            />
          ) : null}
          {method === 'check' ? (
            <Field
              label={t('deposit.payerName')}
              name="collectPayer"
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              required
            />
          ) : null}
          <Field
            label={t('payment.memo')}
            hint={t('payment.memoHint')}
            name="collectMemo"
            maxLength={500}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
          <Button
            type="submit"
            pending={pending}
            {...(!online ? { disabledReason: t('offline.needsConnection') } : {})}
          >
            {t('collect.record')}
          </Button>
        </form>
      ) : null}
      {problem ? (
        <p role="alert" className="hh-field__error">
          {problem}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="staff-request__hint" data-testid="collect-done">
          {t(method === 'check' ? 'collect.doneCheck' : 'collect.done')}
        </p>
      ) : null}
      {data.mine.length ? (
        <ul className="staff-deposit__payments" aria-label={t('collect.mine')} data-testid="collect-mine">
          {data.mine.map((p, n) => (
            <li key={n}>
              {codeLabel(t, 'paymentMethod', p.method)} · {usd(p.amountCents)} · {p.receivedOn}{' '}
              <StatusBadge tone={p.state === 'received' || p.state === 'deposited' ? 'warning' : 'success'}>
                {codeLabel(t, 'paymentState', p.state)}
              </StatusBadge>
              {p.receiptNumber ? ` ${t('payment.receiptShown', { number: p.receiptNumber })}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
