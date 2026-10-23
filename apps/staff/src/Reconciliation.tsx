// The reconciliation queue (TSK-0090; HH-FIN-15, HH-FIN-09, T61): money staff cannot match yet waits here until a
// person resolves it with evidence; it never resolves itself and reporting it records nothing. The Owner and Office
// report; routine matching to a recorded payment may be Office's, every other resolution is the Owner's (the server
// decides). The queue also lists, from their own records, checks still pending, payments returned lately, open
// disputes and refunds whose outcome is not certain yet. The Payments screen, and one item from the staff queue.
import type { StaffKey } from '@handyhub/i18n'
import { cents, centsFromDecimal, formatUsd } from '@handyhub/money'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { call, idempotencyKey, type Fetch } from './api'
import { depositRefusal, PAYMENT_METHODS } from './JobDeposit'
import { codeLabel } from './Requests'
import { useOnline } from './Shell'

type T = (key: StaffKey, values?: Record<string, string | number | Date>) => string
type StaffRef = { id: string; name: string | null }

const KINDS = [
  'uncertain_outcome',
  'unmatched_payment',
  'amount_mismatch',
  'currency_mismatch',
  'duplicate_entry',
  'reference_mismatch',
] as const
const SOURCES = ['customer', 'square', 'bank', 'staff'] as const

export type ReconciliationItem = {
  id: string
  kind: string
  source: string
  project: { id: string; reference: string } | null
  jobId: string | null
  paymentId: string | null
  method: string | null
  amountCents: number | null
  currency: string
  reference: string | null
  description: string
  reportedBy: StaffRef
  reportedAt: string
  state: 'open' | 'resolved'
  resolution: string | null
  evidence: string | null
  resolvedPaymentId: string | null
  resolvedBy: StaffRef | null
  resolvedAt: string | null
  candidates: { id: string; method: string; amountCents: number; receivedOn: string; reference: string | null }[]
  resolutions: string[]
}
export type ReconciliationData = {
  open: ReconciliationItem[]
  resolved: ReconciliationItem[]
  records: {
    kind: string
    jobId: string
    projectReference: string
    method: string
    amountCents: number
    state: string
    since: string
  }[]
  actions: { report: boolean }
}

const usd = (c: number) => formatUsd(cents(c))
const money = (c: number | null, currency: string) =>
  c === null ? null : currency === 'USD' ? usd(c) : `${(c / 100).toFixed(2)} ${currency}`

/** Sends one write with its idempotency key (kept for a retry after a server failure). */
function useSend(fetchImpl: Fetch) {
  const key = useRef<string | null>(null)
  const [pending, setPending] = useState(false)
  async function send(path: string, body: unknown) {
    setPending(true)
    key.current ??= idempotencyKey()
    const r = await call<ReconciliationData>(fetchImpl, path, {
      method: 'POST',
      body,
      headers: { 'idempotency-key': key.current },
    })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    return r
  }
  return { send, pending }
}

/** Reports money that cannot be matched yet (for a job when given); it records nothing. */
export function ReportReconciliation({
  t,
  fetchImpl,
  jobId,
  onReported,
}: {
  t: T
  fetchImpl: Fetch
  jobId?: string
  onReported?: (data: ReconciliationData) => void
}) {
  const ids = useId()
  const online = useOnline()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<string>(KINDS[0])
  const [source, setSource] = useState<string>(SOURCES[0])
  const [method, setMethod] = useState('')
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [description, setDescription] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const { send, pending } = useSend(fetchImpl)

  async function submit() {
    if (description.trim() === '') return setProblem(t('reconcile.descriptionRequired'))
    let amountCents: number | null = null
    if (amount.trim() !== '') {
      try {
        amountCents = Number(centsFromDecimal(amount.trim()))
      } catch {
        return setProblem(t('deposit.amountInvalid'))
      }
      if (amountCents <= 0) return setProblem(t('deposit.amountInvalid'))
    }
    setProblem(null)
    const r = await send('/staff/reconciliation', {
      kind,
      source,
      jobId: jobId ?? null,
      method: method || null,
      amountCents,
      reference: reference.trim() || null,
      description: description.trim(),
    })
    if (!r.ok) return setProblem(depositRefusal(t, r.error))
    setOpen(false)
    setAmount('')
    setReference('')
    setDescription('')
    setDone(true)
    onReported?.(r.data)
  }

  return (
    <div data-testid="reconcile-report">
      {!open ? (
        <div className="hh-button-row">
          <Button
            variant="secondary"
            onClick={() => (setOpen(true), setDone(false))}
            {...(!online ? { disabledReason: t('offline.needsConnection') } : {})}
          >
            {t('reconcile.report')}
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
          noValidate
          aria-label={t('reconcile.report')}
        >
          <p className="staff-request__hint">{t('reconcile.reportHint')}</p>
          <div className="staff-queue__select">
            <label htmlFor={`${ids}-kind`}>{t('reconcile.kind')}</label>
            <select id={`${ids}-kind`} value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {codeLabel(t, 'queueReason', k)}
                </option>
              ))}
            </select>
          </div>
          <div className="staff-queue__select">
            <label htmlFor={`${ids}-source`}>{t('reconcile.source')}</label>
            <select id={`${ids}-source`} value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCES.map((s) => (
                <option key={s} value={s}>
                  {codeLabel(t, 'reconciliationSource', s)}
                </option>
              ))}
            </select>
          </div>
          <div className="staff-queue__select">
            <label htmlFor={`${ids}-method`}>{t('reconcile.method')}</label>
            <select id={`${ids}-method`} value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="">{t('reconcile.methodUnknown')}</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {codeLabel(t, 'paymentMethod', m)}
                </option>
              ))}
            </select>
          </div>
          <Field
            label={t('finance.amount')}
            name="reconcileAmount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Field
            label={t('reconcile.reference')}
            name="reconcileReference"
            maxLength={120}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <Field
            label={t('reconcile.description')}
            name="reconcileDescription"
            multiline
            maxLength={2000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
          />
          <div className="hh-button-row">
            <Button
              type="submit"
              pending={pending}
              {...(!online ? { disabledReason: t('offline.needsConnection') } : {})}
            >
              {t('payment.exception.submit')}
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
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
          {t('reconcile.reported')}
        </p>
      ) : null}
    </div>
  )
}

function Resolve({
  t,
  item,
  fetchImpl,
  onResolved,
}: {
  t: T
  item: ReconciliationItem
  fetchImpl: Fetch
  onResolved: (data: ReconciliationData) => void
}) {
  const ids = useId()
  const online = useOnline()
  const [resolution, setResolution] = useState(item.resolutions[0] ?? '')
  const [paymentId, setPaymentId] = useState(item.candidates[0]?.id ?? '')
  const [evidence, setEvidence] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const { send, pending } = useSend(fetchImpl)
  const named = resolution === 'matched' || resolution === 'recorded'

  async function submit() {
    if (evidence.trim() === '') return setProblem(t('reconcile.evidenceRequired'))
    setProblem(null)
    const r = await send(`/staff/reconciliation/${encodeURIComponent(item.id)}/resolve`, {
      resolution,
      evidence: evidence.trim(),
      paymentId: named ? paymentId : null,
    })
    if (!r.ok) return setProblem(depositRefusal(t, r.error))
    onResolved(r.data)
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      noValidate
      aria-label={t('reconcile.resolve')}
      data-testid="reconcile-resolve"
    >
      <div className="staff-queue__select">
        <label htmlFor={`${ids}-resolution`}>{t('reconcile.resolution')}</label>
        <select id={`${ids}-resolution`} value={resolution} onChange={(e) => setResolution(e.target.value)}>
          {item.resolutions.map((r) => (
            <option key={r} value={r}>
              {codeLabel(t, 'reconciliationResolution', r)}
            </option>
          ))}
        </select>
      </div>
      {named ? (
        <div className="staff-queue__select">
          <label htmlFor={`${ids}-payment`}>{t('finance.payment')}</label>
          <select id={`${ids}-payment`} value={paymentId} onChange={(e) => setPaymentId(e.target.value)}>
            {item.candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {codeLabel(t, 'paymentMethod', c.method)}, {c.receivedOn}: {usd(c.amountCents)}
                {c.reference ? ` (${c.reference})` : ''}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <Field
        label={t('reconcile.evidence')}
        hint={t('reconcile.evidenceHint')}
        name="reconcileEvidence"
        multiline
        maxLength={2000}
        value={evidence}
        onChange={(e) => setEvidence(e.target.value)}
        required
      />
      <Button type="submit" pending={pending} {...(!online ? { disabledReason: t('offline.needsConnection') } : {})}>
        {t('reconcile.resolve')}
      </Button>
      {problem ? (
        <p role="alert" className="hh-field__error">
          {problem}
        </p>
      ) : null}
    </form>
  )
}

function ItemView({
  t,
  item,
  fetchImpl,
  href,
  onResolved,
}: {
  t: T
  item: ReconciliationItem
  fetchImpl: Fetch
  href: (path: string) => string
  onResolved: (data: ReconciliationData) => void
}) {
  const amount = money(item.amountCents, item.currency)
  return (
    <li data-testid="reconcile-item">
      <strong>{codeLabel(t, 'queueReason', item.kind)}</strong>{' '}
      <StatusBadge tone={item.state === 'open' ? 'warning' : 'success'}>
        {item.resolution ? codeLabel(t, 'reconciliationResolution', item.resolution) : t('reconcile.open')}
      </StatusBadge>
      <br />
      {[
        codeLabel(t, 'reconciliationSource', item.source),
        item.method ? codeLabel(t, 'paymentMethod', item.method) : null,
        amount,
        item.reference,
      ]
        .filter(Boolean)
        .join(' · ')}
      {item.project && item.jobId ? (
        <>
          {' · '}
          <a href={href(`/payments/${item.jobId}`)}>{item.project.reference}</a>
        </>
      ) : null}
      <br />
      {t('reconcile.reportedBy', {
        name: item.reportedBy.name ?? t('queue.unnamed'),
        time: new Date(item.reportedAt),
      })}{' '}
      {/* The reporter's own words, as written. */}
      {item.description}
      {item.resolvedBy && item.resolvedAt ? (
        <>
          <br />
          {t('reconcile.resolvedBy', {
            name: item.resolvedBy.name ?? t('queue.unnamed'),
            time: new Date(item.resolvedAt),
          })}{' '}
          {item.evidence}
        </>
      ) : null}
      {item.state === 'open' && item.resolutions.length ? (
        <Resolve t={t} item={item} fetchImpl={fetchImpl} onResolved={onResolved} />
      ) : item.state === 'open' ? (
        <p className="staff-request__hint">{t('reconcile.waitsForOwner')}</p>
      ) : null}
    </li>
  )
}

export function ReconciliationScreen({
  t,
  fetchImpl,
  href,
  itemId,
}: {
  t: T
  fetchImpl: Fetch
  href: (path: string) => string
  /** One item, from the staff queue's link. */
  itemId?: string
}) {
  const ids = useId()
  const [data, setData] = useState<ReconciliationData | null | undefined>(undefined)
  const path = itemId ? `/staff/reconciliation/${encodeURIComponent(itemId)}` : '/staff/reconciliation'
  const load = useCallback(async () => {
    const r = await call<ReconciliationData>(fetchImpl, path)
    setData(r.ok ? r.data : null)
  }, [fetchImpl, path])
  useEffect(() => {
    void load()
  }, [load])
  if (data === undefined) return <StateView kind="loading" title={t('common.loading')} />
  if (data === null) return <StateView kind="blocked" title={t('record.notFound')} />
  // A write answers the whole queue: one item's page reads its item again.
  const changed = (d: ReconciliationData) => (itemId ? void load() : setData(d))
  return (
    <section className="staff-screen staff-request" aria-labelledby={`${ids}-title`} data-testid="reconciliation">
      <h1 id={`${ids}-title`} className="hh-h3">
        {t('reconcile.title')}
      </h1>
      <p className="staff-request__hint">{t('reconcile.hint')}</p>
      {data.actions.report && !itemId ? (
        <ReportReconciliation t={t} fetchImpl={fetchImpl} onReported={setData} />
      ) : null}
      <h2 className="staff-queue__heading">{t('reconcile.openTitle')}</h2>
      {data.open.length ? (
        <ul className="staff-deposit__payments" aria-label={t('reconcile.openTitle')}>
          {data.open.map((i) => (
            <ItemView key={i.id} t={t} item={i} fetchImpl={fetchImpl} href={href} onResolved={changed} />
          ))}
        </ul>
      ) : (
        <p className="hh-muted">{t('reconcile.none')}</p>
      )}
      {!itemId ? (
        <>
          <h2 className="staff-queue__heading">{t('reconcile.recordsTitle')}</h2>
          {data.records.length ? (
            <ul
              className="staff-deposit__payments"
              aria-label={t('reconcile.recordsTitle')}
              data-testid="reconcile-records"
            >
              {data.records.map((r, n) => (
                <li key={n}>
                  {codeLabel(t, 'reconciliationRecord', r.kind)} ·{' '}
                  <a href={href(`/payments/${r.jobId}`)}>{r.projectReference}</a> ·{' '}
                  {codeLabel(t, 'paymentMethod', r.method)} · {usd(r.amountCents)} ·{' '}
                  {t('reconcile.since', { time: new Date(r.since) })}
                </li>
              ))}
            </ul>
          ) : (
            <p className="hh-muted">{t('reconcile.noRecords')}</p>
          )}
        </>
      ) : null}
      {data.resolved.length ? (
        <>
          <h2 className="staff-queue__heading">{t('reconcile.resolvedTitle')}</h2>
          <ul className="staff-deposit__payments" aria-label={t('reconcile.resolvedTitle')}>
            {data.resolved.map((i) => (
              <ItemView key={i.id} t={t} item={i} fetchImpl={fetchImpl} href={href} onResolved={changed} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  )
}
