// The job's invoices (TSK-0085, TSK-0086; HH-FIN-04, HH-FIN-05, HH-FIN-07, HH-FIN-12, HH-QA-02, T58, T59, OWN-DEC-110,
// OWN-DEC-111, OWN-DEC-138, OWN-DEC-152, RULE-SERVER-AUTHZ). Shown beside the deposit to the roles that may see
// payments (the Owner, Office); for anyone else the server refuses the read and the panel is not shown.
// - The final invoice draft, prepared automatically from the approved scope: its lines (charges, and credit lines as a
//   reduction), the discount row, the total and the deposit credit it would carry; what must happen before it can be
//   issued (the Owner's quality review, TSK-0084: the issue waits until it allows it) and what is only shown (the missing
//   mailing address, placeholder contact and payment details). Prepare it again after an approved change.
// - The deposit invoice of a job whose deposit is still due (its own draft and issue; paid through the deposit).
// - Once issued: the number, and the money from the ledger: invoiced, credits, confirmed paid, pending checks and the
//   remaining balance; the payments applied, Mark cleared for the Owner on a check they did not collect, and the form
//   to record a verified payment. Money not applied to anything waits for the Owner's credit or refund decision.
// The server decides every action again; a refusal names its reason.
import type { StaffKey } from '@handyhub/i18n'
import { cents, centsFromDecimal, formatUsd } from '@handyhub/money'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { depositRefusal, PAYMENT_METHODS } from './JobDeposit'
import { codeLabel } from './Requests'
import { useOnline } from './Shell'
import { PaymentSteps, type PaymentStepFields } from './PaymentSteps'

type T = (key: StaffKey, values?: Record<string, string | number | Date>) => string

type Money = {
  invoicedCents: number
  depositCreditCents: number
  appliedCreditsCents: number
  creditsCents: number
  confirmedCents: number
  pendingCents: number
  remainingCents: number
}
export type Invoice = {
  id: string
  kind: 'deposit' | 'final'
  state: string
  number: string | null
  scopeVersion: number | null
  lines: {
    position: number
    kind: 'charge' | 'credit'
    lineKind: string | null
    description: string
    quantity: string | null
    unit: string | null
    amountCents: number
  }[]
  chargesCents: number
  creditLinesCents: number
  subtotalCents: number
  discount: { category: string; percentBps: number; amountCents: number } | null
  totalCents: number
  depositCreditCents: number
  paymentTermText: string
  issuedAt: string | null
  issuer: { name: string; mailingAddress: string[] | null; phone: string | null; email: string | null } | null
  money: Money | null
  payments: ({
    id: string
    method: string
    amountCents: number
    appliedCents: number
    receivedOn: string
    reference: string | null
    state: string
    verified: boolean
    collector: { id: string; name: string | null }
    canMarkCleared: boolean
  } & PaymentStepFields)[]
  exceptions: { code: string; blocking: boolean }[]
  document: 'none' | 'preparing' | 'issued'
  version: number
  /** TSK-0087: the Square link the customer's Pay by Card opens (a final invoice only). */
  paymentLink?: { url: string; setBy: { id: string; name: string | null }; setAt: string } | null
  actions: { issue: boolean; recordPayment: boolean; setPaymentLink?: boolean }
}
export type JobInvoicesData = {
  jobId: string
  final: Invoice | null
  deposit: Invoice | null
  unallocatedCents: number
  actions: { prepareFinal: boolean; prepareDeposit: boolean }
}

const usd = (c: number) => formatUsd(cents(c))
const tone = (state: string) =>
  state === 'paid' ? 'success' : state === 'draft' ? 'neutral' : state === 'voided' ? 'danger' : 'info'

/** A refusal in words: invoice codes first, then the payment codes the deposit panel already names. */
export function invoiceRefusal(t: T, err: ApiErrorBody): string {
  if (err.code === 'STALE_VERSION') return t('invoice.stale')
  const f = err.fieldErrors[0]
  if (f) {
    const label = codeLabel(t, 'invoiceRefusal', f.code)
    if (label !== f.code) return label
  }
  return depositRefusal(t, err)
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function JobInvoices({ t, fetchImpl, jobId }: { t: T; fetchImpl: Fetch; jobId: string }) {
  const ids = useId()
  const [data, setData] = useState<JobInvoicesData | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const keys = useRef(new Map<string, string>())
  const base = `/staff/jobs/${encodeURIComponent(jobId)}/invoices`

  const load = useCallback(
    () => call<JobInvoicesData>(fetchImpl, base).then((r) => setData(r.ok ? r.data : null)),
    [fetchImpl, base],
  )
  useEffect(() => {
    void load()
  }, [load])
  if (!data) return null

  async function send(
    action: string,
    path: string,
    body: unknown,
    ifMatch?: number,
    method: 'POST' | 'PUT' = 'POST',
  ): Promise<boolean> {
    setPending(action)
    setError(null)
    setDone(null)
    if (!keys.current.has(action)) keys.current.set(action, idempotencyKey())
    const r = await call<JobInvoicesData | unknown>(fetchImpl, path, {
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
      setError(invoiceRefusal(t, r.error))
      await load()
      return false
    }
    if (path.startsWith(base) || path.includes('/staff/invoices/')) setData(r.data as JobInvoicesData)
    else await load()
    return true
  }

  return (
    <div role="group" aria-labelledby={`${ids}-invoices`} data-testid="job-invoices" className="staff-deposit">
      <h3 id={`${ids}-invoices`} className="staff-queue__heading">
        {t('invoice.title')}
      </h3>
      {error ? <StateView kind="error" title={error} /> : null}
      {done ? (
        <p role="status" className="staff-request__hint">
          {done}
        </p>
      ) : null}
      {data.deposit ? (
        <InvoicePanel t={t} invoice={data.deposit} pending={pending} send={send} setDone={setDone} />
      ) : null}
      {data.actions.prepareDeposit && !data.deposit ? (
        <div className="hh-button-row">
          <Button
            variant="secondary"
            pending={pending === 'prepare-deposit'}
            onClick={() =>
              void send('prepare-deposit', `${base}/deposit-draft`, {}).then(
                (ok) => ok && setDone(t('invoice.prepared')),
              )
            }
          >
            {t('invoice.prepareDeposit')}
          </Button>
        </div>
      ) : null}
      {data.final ? (
        <InvoicePanel t={t} invoice={data.final} pending={pending} send={send} setDone={setDone} />
      ) : (
        <p className="staff-request__hint">{t('invoice.noDraft')}</p>
      )}
      {data.actions.prepareFinal ? (
        <div className="hh-button-row">
          <Button
            variant="secondary"
            pending={pending === 'prepare-final'}
            onClick={() =>
              void send('prepare-final', `${base}/final-draft`, {}).then((ok) => ok && setDone(t('invoice.prepared')))
            }
          >
            {data.final ? t('invoice.prepareAgain') : t('invoice.prepare')}
          </Button>
        </div>
      ) : null}
      {data.unallocatedCents > 0 ? (
        <p className="staff-request__hint" data-testid="invoice-unallocated">
          {t('invoice.unallocated', { amount: usd(data.unallocatedCents) })}
        </p>
      ) : null}
    </div>
  )
}

function InvoicePanel({
  t,
  invoice: i,
  pending,
  send,
  setDone,
}: {
  t: T
  invoice: Invoice
  pending: string | null
  send: (action: string, path: string, body: unknown, ifMatch?: number, method?: 'POST' | 'PUT') => Promise<boolean>
  setDone: (s: string | null) => void
}) {
  // TSK-0079 (HH-OFF-04): this action needs the server; offline it is refused, never queued.
  const online = useOnline()
  const ids = useId()
  const [method, setMethod] = useState<string>('cash')
  const [amount, setAmount] = useState('')
  const [amountError, setAmountError] = useState<string | null>(null)
  const [receivedOn, setReceivedOn] = useState(today())
  const [reference, setReference] = useState('')
  const [payerName, setPayerName] = useState('')
  const [memo, setMemo] = useState('')
  const [link, setLink] = useState('')
  const draft = i.state === 'draft'
  const blocking = i.exceptions.filter((e) => e.blocking)
  const shown = i.exceptions.filter((e) => !e.blocking)
  const path = `/staff/invoices/${encodeURIComponent(i.id)}`
  const title =
    i.kind === 'deposit'
      ? i.number
        ? t('invoice.depositNamed', { number: i.number })
        : t('invoice.depositDraft')
      : i.number
        ? t('invoice.finalNamed', { number: i.number })
        : t('invoice.finalDraft')

  // TSK-0087 (HH-FIN-08): the invoice-specific Square link staff created in the Square app; never a payment.
  async function saveLink(e: FormEvent) {
    e.preventDefault()
    const ok = await send(`link-${i.id}`, `${path}/payment-link`, { url: link.trim() }, undefined, 'PUT')
    if (ok) {
      setLink('')
      setDone(t('invoice.linkSaved'))
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
    const ok = await send(`pay-${i.id}`, `${path}/payments`, {
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

  return (
    <section aria-labelledby={`${ids}-title`} data-testid={`invoice-${i.kind}`} className="staff-invoice">
      <h4 id={`${ids}-title`} className="staff-queue__heading">
        {title} <StatusBadge tone={tone(i.state)}>{codeLabel(t, 'invoiceState', i.state)}</StatusBadge>
      </h4>
      <table className="staff-invoice__lines">
        <caption className="hh-visually-hidden">{t('invoice.lines')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('invoice.column.description')}</th>
            <th scope="col">{t('invoice.column.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {i.lines.map((l) => (
            <tr key={l.position} data-testid="invoice-line">
              <td>
                {l.kind === 'credit' ? `${t('invoice.creditLine')}: ` : ''}
                {l.description}
                {l.lineKind && l.lineKind !== 'base' ? ` (${codeLabel(t, 'estimateLineKind', l.lineKind)})` : ''}
              </td>
              <td>{l.kind === 'credit' ? `-${usd(l.amountCents)}` : usd(l.amountCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="staff-record">
        <dt>{t('invoice.subtotal')}</dt>
        <dd>{usd(i.chargesCents)}</dd>
        {i.creditLinesCents > 0 ? (
          <>
            <dt>{t('invoice.credits')}</dt>
            <dd>-{usd(i.creditLinesCents)}</dd>
          </>
        ) : null}
        {i.discount ? (
          <>
            <dt>{t('invoice.discount', { category: codeLabel(t, 'discountCategory', i.discount.category) })}</dt>
            <dd>-{usd(i.discount.amountCents)}</dd>
          </>
        ) : null}
        <dt>{t('invoice.total')}</dt>
        <dd data-testid="invoice-total">{usd(i.totalCents)}</dd>
        {i.kind === 'final' ? (
          <>
            <dt>{draft ? t('invoice.depositCreditPreview') : t('invoice.depositCredit')}</dt>
            <dd data-testid="invoice-deposit-credit">-{usd(i.depositCreditCents)}</dd>
          </>
        ) : null}
        <dt>{t('invoice.paymentTerm')}</dt>
        {/* The term in the words recorded with the customer's approval. */}
        <dd>{i.paymentTermText}</dd>
        {i.money ? (
          <>
            <dt>{t('invoice.confirmed')}</dt>
            <dd data-testid="invoice-confirmed">{usd(i.money.confirmedCents)}</dd>
            <dt>{t('invoice.pending')}</dt>
            <dd data-testid="invoice-pending">{usd(i.money.pendingCents)}</dd>
            <dt>{t('invoice.remaining')}</dt>
            <dd data-testid="invoice-remaining">{usd(i.money.remainingCents)}</dd>
          </>
        ) : null}
        {i.issuer ? (
          <>
            <dt>{t('invoice.issuer')}</dt>
            <dd>{i.issuer.name}</dd>
          </>
        ) : null}
        {!draft ? (
          <>
            <dt>{t('invoice.pdf')}</dt>
            <dd>{codeLabel(t, 'invoiceDocument', i.document)}</dd>
          </>
        ) : null}
      </dl>

      {draft && blocking.length ? (
        <div data-testid="invoice-blocking">
          <p>
            <strong>{t('invoice.waitsFor')}</strong>
          </p>
          <ul>
            {blocking.map((e) => (
              <li key={e.code}>{codeLabel(t, 'invoiceException', e.code)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {draft && shown.length ? (
        <div data-testid="invoice-notes">
          <p className="staff-request__hint">{t('invoice.notes')}</p>
          <ul className="staff-request__hint">
            {shown.map((e) => (
              <li key={e.code}>{codeLabel(t, 'invoiceException', e.code)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {draft && i.actions.issue ? (
        <div className="hh-button-row">
          <Button
            pending={pending === `issue-${i.id}`}
            onClick={() =>
              void send(`issue-${i.id}`, `${path}/issue`, {}, i.version).then(
                (ok) => ok && setDone(t('invoice.issued')),
              )
            }
          >
            {t('invoice.issue')}
          </Button>
        </div>
      ) : null}

      {i.payments.length ? (
        <ul className="staff-deposit__payments" aria-label={t('invoice.payments')}>
          {i.payments.map((p) => (
            <li key={p.id} data-testid="invoice-payment">
              <strong>
                {codeLabel(t, 'paymentMethod', p.method)} · {usd(p.amountCents)}
              </strong>{' '}
              <StatusBadge tone={p.verified ? 'success' : 'warning'}>
                {codeLabel(t, 'paymentState', p.state)}
              </StatusBadge>
              <br />
              {t('invoice.paymentLine', {
                date: p.receivedOn,
                collector: p.collector.name ?? t('queue.unnamed'),
                applied: usd(p.appliedCents),
              })}
              {p.reference ? ` · ${t('deposit.referenceShown', { reference: p.reference })}` : null}
              <PaymentSteps
                t={t}
                p={p}
                pending={pending}
                run={(action, path, doneKey) => void send(action, path, {}).then((ok) => ok && setDone(t(doneKey)))}
              />
              {p.canMarkCleared ? (
                <div className="hh-button-row">
                  <Button
                    variant="secondary"
                    pending={pending === `clear-${p.id}`}
                    onClick={() =>
                      void send(`clear-${p.id}`, `/staff/payments/${encodeURIComponent(p.id)}/clear`, {}).then(
                        (ok) => ok && setDone(t('deposit.cleared')),
                      )
                    }
                  >
                    {t('deposit.markCleared')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {i.paymentLink ? (
        <p data-testid="invoice-payment-link">
          {t('deposit.link')}:{' '}
          <a href={i.paymentLink.url} target="_blank" rel="noopener noreferrer">
            {i.paymentLink.url}
          </a>{' '}
          <span className="staff-request__hint">
            {t('deposit.linkBy', {
              name: i.paymentLink.setBy.name ?? t('queue.unnamed'),
              time: new Date(i.paymentLink.setAt),
            })}
          </span>
        </p>
      ) : null}
      {i.actions.setPaymentLink ? (
        <form onSubmit={(e) => void saveLink(e)} noValidate aria-label={t('invoice.linkTitle')}>
          <Field
            label={t('invoice.linkLabel')}
            hint={t('invoice.linkHint')}
            name="invoicePaymentLink"
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            required
          />
          <Button
            type="submit"
            variant="secondary"
            pending={pending === `link-${i.id}`}
            {...(!online ? { disabledReason: t('offline.needsConnection') } : {})}
          >
            {t('deposit.linkSave')}
          </Button>
        </form>
      ) : null}
      {i.actions.recordPayment ? (
        <form onSubmit={(e) => void record(e)} noValidate aria-label={t('invoice.recordTitle')}>
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
            pending={pending === `pay-${i.id}`}
            {...(!online ? { disabledReason: t('offline.needsConnection') } : {})}
          >
            {t('deposit.record')}
          </Button>
        </form>
      ) : null}
    </section>
  )
}
