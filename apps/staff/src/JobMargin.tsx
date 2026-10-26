// Job gross margin, the advisory target flag, the target setting and the labor cost rates (TSK-0131; HH-FIN-20,
// HH-FIN-17, OWN-DEC-189, FACT-MARGIN-TARGET, RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS). Staff side, for the Owner.
// - JobMarginSection (the job's costs page): price, net revenue, direct costs, gross profit and margin, estimated and
//   actual, the variance only between two final margins, and where the job stands against the target. A margin that
//   is not final shows no percentage, only why. The flag is advisory: nothing is blocked. The Owner records a reason
//   for a job below the target.
// - MarginTargetSetting (Settings): the target in force; the Owner changes it with a reason and a fresh sign-in.
// - LaborRatesSetting (Settings): each staff member's labor cost rate and burden per hour from a date, as the Owner
//   entered them; nothing is assumed (no rate: NOT CONFIGURED).
// Every control is one the server offered or allows; the server checks each write again.
import type { StaffKey } from '@handyhub/i18n'
import { cents, centsFromDecimal, formatUsd } from '@handyhub/money'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { ReauthForm, useOwnerWrite } from './OwnerWrite'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

/** The reasons the Owner records (the server's list, @handyhub/domain MARGIN_REASONS). */
const REASONS = ['underpricing', 'material_overrun', 'additional_labor', 'site_conditions', 'other'] as const

type Margin = {
  state: 'complete' | 'incomplete'
  revenueCents: number | null
  costCents: number | null
  grossProfitCents: number | null
  marginBps: number | null
  gaps: string[]
}
export type MarginData = {
  targetBps: number | null
  targetVersion: number | null
  estimatedPriceCents: number | null
  revenue: {
    state: 'complete' | 'not_invoiced' | 'incomplete'
    cents: number | null
    invoicedCents: number
    refundsCents: number
    creditsCents: number
    gaps: string[]
  }
  estimated: Margin
  actual: Margin
  varianceBps: number | null
  profitVarianceCents: number | null
  flag: string
  estimatedFlag: string
  reviewed: boolean
  reviews: {
    id: string
    reason: string
    note: string | null
    revenueCents: number
    costCents: number
    grossProfitCents: number
    marginBps: number | null
    targetBps: number
    recordedBy: { id: string; name: string | null }
    recordedAt: string
    current: boolean
  }[]
  report: string
  actions: { review: boolean }
}

const usd = (c: number) => formatUsd(cents(c))
/** Basis points as a percentage with two decimals, from integers only ("30.00%", "-2.50%"). */
export function percent(bps: number): string {
  const sign = bps < 0 ? '-' : ''
  const a = Math.abs(bps)
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}%`
}
const flagTone = (f: string) => (f === 'below_target' ? 'warning' : f === 'at_or_above_target' ? 'success' : 'neutral')

/** A refusal in words: the job-cost codes, else the error code. */
function refusal(t: T, e: ApiErrorBody): string {
  if (e.code === 'STALE_VERSION') return t('ownerApproval.stale')
  const own = e.fieldErrors
    .map((f) => codeLabel(t, 'jobCostCode', f.code))
    .filter((l, i) => l !== e.fieldErrors[i]?.code)
  if (own.length) return own.join(' ')
  try {
    return t(`error.${e.code}` as StaffKey)
  } catch {
    return t('error.INTERNAL')
  }
}

function MarginColumn({ t, m, price }: { t: T; m: Margin; price: string }) {
  const gaps = m.gaps.map((g) => codeLabel(t, 'marginGap', g)).join(' ')
  return (
    <dl className="staff-record">
      <dt>{t('jobMargin.price')}</dt>
      <dd>{price}</dd>
      <dt>{t('jobMargin.costs')}</dt>
      <dd>{m.costCents === null ? t('jobMargin.notFinal') : usd(m.costCents)}</dd>
      <dt>{t('jobMargin.grossProfit')}</dt>
      <dd>{m.grossProfitCents === null ? t('jobMargin.notFinal') : usd(m.grossProfitCents)}</dd>
      <dt>{t('jobMargin.margin')}</dt>
      <dd data-testid="job-margin-value">
        {m.state !== 'complete'
          ? t('jobMargin.incomplete', { why: gaps })
          : m.marginBps === null
            ? t('jobMargin.noPercentage')
            : percent(m.marginBps)}
      </dd>
    </dl>
  )
}

/** The job's margin on its costs page (the costs view carries it). */
export function JobMarginSection({
  t,
  margin,
  send,
}: {
  t: T
  margin: MarginData
  /** Posts a write and refreshes the page; resolves whether it succeeded. */
  send: (path: string, body: unknown) => Promise<boolean>
}) {
  const ids = useId()
  const [reason, setReason] = useState<string>('underpricing')
  const [note, setNote] = useState('')
  const m = margin
  const revenueText =
    m.revenue.state === 'not_invoiced'
      ? t('jobMargin.notInvoiced')
      : m.revenue.state === 'incomplete'
        ? t('jobMargin.revenueIncomplete', { amount: usd(m.revenue.cents ?? 0) })
        : usd(m.revenue.cents ?? 0)
  async function review(e: FormEvent) {
    e.preventDefault()
    const body = note.trim() ? { reason, note: note.trim() } : { reason }
    if (await send('margin-reviews', body)) setNote('')
  }
  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-margin`} data-testid="job-margin">
      <h2 id={`${ids}-margin`} className="staff-queue__heading">
        {t('jobMargin.title')}
      </h2>
      <p className="staff-request__hint">{t('jobMargin.sources')}</p>
      <p data-testid="job-margin-target">
        {m.targetBps === null
          ? t('jobMargin.targetNotConfigured')
          : t('jobMargin.target', { percent: percent(m.targetBps) })}
      </p>
      <p>
        <StatusBadge tone={flagTone(m.flag)}>
          <span data-testid="job-margin-flag" data-flag={m.flag}>
            {codeLabel(t, 'marginFlag', m.flag)}
          </span>
        </StatusBadge>{' '}
        {m.flag === 'below_target' ? <span className="staff-request__hint">{t('jobMargin.advisory')}</span> : null}
      </p>
      <div className="staff-job-costs__wrap">
        <section aria-labelledby={`${ids}-estimated`}>
          <h3 id={`${ids}-estimated`}>{t('jobMargin.estimated')}</h3>
          <MarginColumn
            t={t}
            m={m.estimated}
            price={m.estimatedPriceCents === null ? t('jobMargin.noEstimate') : usd(m.estimatedPriceCents)}
          />
        </section>
        <section aria-labelledby={`${ids}-actual`} data-testid="job-margin-actual">
          <h3 id={`${ids}-actual`}>{t('jobMargin.actual')}</h3>
          <MarginColumn t={t} m={m.actual} price={revenueText} />
          <p className="staff-request__hint">
            {t('jobMargin.revenueParts', {
              invoiced: usd(m.revenue.invoicedCents),
              refunds: usd(m.revenue.refundsCents),
              credits: usd(m.revenue.creditsCents),
            })}
          </p>
        </section>
      </div>
      <p data-testid="job-margin-variance">
        {m.varianceBps === null
          ? t('jobMargin.noVariance')
          : t('jobMargin.variance', {
              points: percent(m.varianceBps),
              amount: usd(m.profitVarianceCents ?? 0),
            })}
      </p>
      <p className="staff-request__hint">{t('jobMargin.overhead')}</p>

      <h3>{t('jobMargin.reviews')}</h3>
      {m.reviews.length === 0 ? <p>{t('jobMargin.reviewsNone')}</p> : null}
      <ul className="staff-request__list" data-testid="job-margin-reviews">
        {m.reviews.map((r) => (
          <li key={r.id}>
            {codeLabel(t, 'marginReason', r.reason)} ·{' '}
            {r.marginBps === null ? usd(r.grossProfitCents) : percent(r.marginBps)} ·{' '}
            {r.recordedBy.name ?? t('jobCosts.someone')}
            {r.current ? null : <span className="staff-request__hint"> {t('jobMargin.reviewOutdated')}</span>}
            {r.note ? <p className="staff-request__note">{r.note}</p> : null}
          </li>
        ))}
      </ul>
      {m.actions.review ? (
        <form className="staff-loadout__form" onSubmit={(e) => void review(e)} aria-label={t('jobMargin.review')}>
          <div className="hh-field">
            <label className="hh-field__label" htmlFor={`${ids}-reason`}>
              {t('jobMargin.reason')}
            </label>
            <select
              id={`${ids}-reason`}
              className="hh-field__control"
              name="marginReason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {codeLabel(t, 'marginReason', r)}
                </option>
              ))}
            </select>
          </div>
          <Field
            multiline
            label={t('jobMargin.note')}
            name="marginNote"
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button type="submit" variant="secondary">
            {t('jobMargin.review')}
          </Button>
        </form>
      ) : null}
    </section>
  )
}

type Target = { state: 'CONFIGURED' | 'NOT_CONFIGURED'; version: number | null; targetBps: number | null }

/** The target gross margin (Settings). Hidden when the server refuses it. */
export function MarginTargetSetting({
  t,
  fetchImpl,
  onSession,
}: {
  t: T
  fetchImpl: Fetch
  onSession?: (s: { csrfToken: string }) => void
}) {
  const ids = useId()
  const [setting, setSetting] = useState<Target | null>(null)
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<{ value?: string; reason?: string }>({})
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)
  const w = useOwnerWrite(fetchImpl, onSession)
  useEffect(() => {
    void call<Target>(fetchImpl, '/staff/settings/margin-target').then((r) =>
      setSetting(r.ok && typeof r.data?.state === 'string' ? r.data : null),
    )
  }, [fetchImpl])
  if (!setting) return null

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!setting) return
    const next: { value?: string; reason?: string } = {}
    let targetBps = 0
    try {
      // A percentage with up to two decimals is basis points exactly ("30" -> 3000, "27.5" -> 2750).
      targetBps = Number(centsFromDecimal(value.trim()))
      if (targetBps < 1 || targetBps > 9999) next.value = t('marginTarget.invalid')
    } catch {
      next.value = t('marginTarget.invalid')
    }
    if (reason.trim() === '') next.reason = t('approvalThreshold.reasonRequired')
    setErrors(next)
    if (next.value || next.reason) return
    setResult(null)
    await w.send<Target>(
      '/staff/settings/margin-target',
      { targetBps, reason: reason.trim() },
      (r) => {
        if (!r.ok) return setResult({ ok: false, text: refusal(t, r.error) })
        setSetting(r.data)
        setValue('')
        setReason('')
        setResult({ ok: true, text: '' })
      },
      { 'if-match': `"${setting.version ?? 0}"` },
      'PUT',
    )
  }

  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-target`} data-testid="margin-target">
      <h2 id={`${ids}-target`} className="staff-queue__heading">
        {t('marginTarget.title')}
      </h2>
      <p>
        {setting.targetBps === null
          ? t('jobMargin.targetNotConfigured')
          : t('marginTarget.value', { percent: percent(setting.targetBps), n: setting.version ?? 0 })}
      </p>
      <p className="staff-request__hint">{t('marginTarget.hint')}</p>
      <ReauthForm t={t} w={w} />
      {!w.reauth ? (
        <form onSubmit={(e) => void save(e)} noValidate aria-label={t('marginTarget.change')}>
          <Field
            label={t('marginTarget.percent')}
            name="marginTarget"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            {...(errors.value ? { error: errors.value } : {})}
          />
          <Field
            multiline
            label={t('approvalThreshold.reason')}
            name="marginTargetReason"
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            {...(errors.reason ? { error: errors.reason } : {})}
          />
          <Button type="submit" pending={w.pending}>
            {t('marginTarget.save')}
          </Button>
        </form>
      ) : null}
      {result?.ok ? <StateView kind="success" title={t('marginTarget.saved')} /> : null}
      {result && !result.ok ? (
        <StateView kind="error" title={t('ownerApproval.refused')} reasons={[result.text]} />
      ) : null}
    </section>
  )
}

type Rates = {
  today: string
  workers: {
    staffUserId: string
    name: string | null
    status: string
    roles: string[]
    inForce: { effectiveOn: string; rateCents: number; burdenCents: number | null } | null
    rates: { id: string; effectiveOn: string; rateCents: number; burdenCents: number | null; reason: string }[]
  }[]
}

/** Dollars and cents typed by the Owner, as cents per hour; null when blank (allowed only for burden). */
function hourly(text: string): number | null | 'invalid' {
  const s = text.trim()
  if (s === '') return null
  try {
    const c = Number(centsFromDecimal(s))
    return c < 0 ? 'invalid' : c
  } catch {
    return 'invalid'
  }
}

/** Each staff member's labor cost rate (Settings). Hidden when the server refuses it. */
export function LaborRatesSetting({ t, fetchImpl }: { t: T; fetchImpl: Fetch }) {
  const ids = useId()
  const [data, setData] = useState<Rates | null>(null)
  const [who, setWho] = useState('')
  const [from, setFrom] = useState('')
  const [rate, setRate] = useState('')
  const [burden, setBurden] = useState('')
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const load = useCallback(async () => {
    const r = await call<Rates>(fetchImpl, '/staff/labor-cost-rates')
    if (r.ok && Array.isArray(r.data?.workers)) {
      setData(r.data)
      setFrom((f) => f || r.data.today)
      setWho((w) => w || (r.data.workers[0]?.staffUserId ?? ''))
    } else setData(null)
  }, [fetchImpl])
  useEffect(() => {
    void load()
  }, [load])
  if (!data) return null

  async function save(e: FormEvent) {
    e.preventDefault()
    setSaved(false)
    const rateCents = hourly(rate)
    const burdenCents = hourly(burden)
    if (rateCents === null || rateCents === 'invalid') return setProblem(codeLabel(t, 'jobCostCode', 'RATE_INVALID'))
    if (burdenCents === 'invalid') return setProblem(codeLabel(t, 'jobCostCode', 'BURDEN_INVALID'))
    if (!reason.trim()) return setProblem(t('approvalThreshold.reasonRequired'))
    const r = await call<Rates>(fetchImpl, '/staff/labor-cost-rates', {
      method: 'POST',
      body: { staffUserId: who, effectiveOn: from, rateCents, burdenCents, reason: reason.trim() },
      headers: { 'idempotency-key': idempotencyKey() },
    })
    if (!r.ok) return setProblem(refusal(t, r.error))
    setProblem(null)
    setData(r.data)
    setRate('')
    setBurden('')
    setReason('')
    setSaved(true)
  }

  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-rates`} data-testid="labor-rates">
      <h2 id={`${ids}-rates`} className="staff-queue__heading">
        {t('laborRates.title')}
      </h2>
      <p className="staff-request__hint">{t('laborRates.hint')}</p>
      <div className="staff-job-costs__wrap">
        <table className="staff-invoice__lines">
          <caption className="staff-request__hint">{t('laborRates.caption', { date: data.today })}</caption>
          <thead>
            <tr>
              <th scope="col">{t('laborRates.person')}</th>
              <th scope="col">{t('laborRates.rate')}</th>
              <th scope="col">{t('laborRates.burden')}</th>
              <th scope="col">{t('laborRates.from')}</th>
            </tr>
          </thead>
          <tbody>
            {data.workers.map((w) => (
              <tr key={w.staffUserId} data-testid="labor-rate-row">
                <th scope="row">
                  {w.name ?? t('jobCosts.someone')}{' '}
                  <span className="staff-request__hint">
                    {w.roles.map((r) => codeLabel(t, 'staffRole', r)).join(', ')}
                  </span>
                </th>
                <td>{w.inForce ? usd(w.inForce.rateCents) : t('laborRates.notConfigured')}</td>
                <td>
                  {!w.inForce
                    ? t('laborRates.notConfigured')
                    : w.inForce.burdenCents === null
                      ? t('laborRates.burdenUnknown')
                      : usd(w.inForce.burdenCents)}
                </td>
                <td>{w.inForce?.effectiveOn ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="staff-loadout__form" onSubmit={(e) => void save(e)} aria-label={t('laborRates.enter')}>
        <div className="hh-field">
          <label className="hh-field__label" htmlFor={`${ids}-who`}>
            {t('laborRates.person')}
          </label>
          <select
            id={`${ids}-who`}
            className="hh-field__control"
            name="laborRatePerson"
            value={who}
            onChange={(e) => setWho(e.target.value)}
          >
            {data.workers.map((w) => (
              <option key={w.staffUserId} value={w.staffUserId}>
                {w.name ?? w.staffUserId}
              </option>
            ))}
          </select>
        </div>
        <Field
          label={t('laborRates.from')}
          name="laborRateFrom"
          type="date"
          required
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Field
          label={t('laborRates.rateInput')}
          name="laborRate"
          inputMode="decimal"
          required
          value={rate}
          onChange={(e) => setRate(e.target.value)}
        />
        <Field
          label={t('laborRates.burdenInput')}
          name="laborBurden"
          inputMode="decimal"
          value={burden}
          onChange={(e) => setBurden(e.target.value)}
        />
        <Field
          label={t('laborRates.reason')}
          name="laborRateReason"
          required
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <Button type="submit" variant="secondary">
          {t('laborRates.save')}
        </Button>
      </form>
      {saved ? <StateView kind="success" title={t('laborRates.saved')} /> : null}
      {problem ? (
        <p role="alert" className="hh-field__error">
          {problem}
        </p>
      ) : null}
    </section>
  )
}
