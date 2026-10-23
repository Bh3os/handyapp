// Change orders of a job (TSK-0081; HH-CHG-01, HH-CHG-02, HH-WORK-07, T53, OWN-DEC-203). Opened from the job packet
// and the checklist: /change-orders/<job id>.
// - The approved scope's total (the job's latest scope snapshot) and the money paid stay apart from every proposed
//   change, which is labelled as not approved: a draft or reviewed change binds nothing and its work is not done until
//   the customer approves it (TSK-0082).
// - An assigned worker proposes a change (reason, scope, lines with quantities and prices, evidence photos and
//   measurements, schedule impact, hazards, resources, and the checklist steps that wait for it) and edits or
//   withdraws their own draft; an Estimator or the Owner drafts with an origin, edits any draft, marks it reviewed,
//   reopens and withdraws it. The buttons are the actions the server offers; the server prices every line.
// - Credits are positive amounts that lower the total (OWN-DEC-203).
// Staff text in English and Spanish; the customer-facing text the staff write stays as written.
import type { StaffKey } from '@handyhub/i18n'
import { cents, centsFromDecimal, formatUsd, MoneyError, toDecimalString } from '@handyhub/money'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number | Date>) => string
type StaffRef = { id: string; name: string | null }
type LineKind = 'charge' | 'credit'

export type ChangeOrderLine = {
  position: number
  kind: LineKind
  description: string
  workPackageId: string | null
  quantity: string | null
  unit: string | null
  unitPriceCents: number | null
  amountCents: number | null
}
export type ChangeOrderVersion = {
  versionId: string
  version: number
  state: string
  reason: string
  scope: string
  scheduleImpact: string | null
  hazards: string | null
  resources: string | null
  measurements: string | null
  photoIds: string[]
  affectedSteps: { workPackageId: string; stepId: string }[]
  base: { snapshotId: string; totalCents: number }
  chargesCents: number | null
  creditsCents: number | null
  revisedTotalCents: number | null
  lines: ChangeOrderLine[]
  draftedBy: StaffRef
  draftedAt: string
  updatedAt: string
  reviewedBy: StaffRef | null
  reviewedAt: string | null
  withdrawnBy: StaffRef | null
  withdrawnAt: string | null
  withdrawReason: string | null
  rowVersion: number
}
export type ChangeOrder = {
  changeOrderId: string
  number: number
  reference: string
  origin: string
  createdAt: string
  current: ChangeOrderVersion
  history: { version: number; state: string; updatedAt: string | null }[]
  actions: { edit: boolean; review: boolean; reopen: boolean; withdraw: boolean }
}
export type ChangeOrdersData = {
  jobId: string
  reference: string
  jobState: string
  approved: { snapshotVersion: number; totalCents: number } | null
  paidCents: number
  packages: { id: string; code: string; steps: { id: string; stage: number; text: string }[] }[]
  photos: { id: string; workPackageId: string | null; phase: string; areaLabel: string | null }[]
  changeOrders: ChangeOrder[]
  actions: { create: boolean; chooseOrigin: boolean }
}

const ORIGINS = ['customer_request', 'estimator', 'emergency_follow_up', 'worker_proposal'] as const
const usd = (c: number) => formatUsd(cents(c))

export function changeOrderError(t: T, e: ApiErrorBody): string {
  if (e.code === 'STALE_VERSION') return t('changeOrders.stale')
  if (e.fieldErrors.length)
    return [...new Set(e.fieldErrors.map((f) => codeLabel(t, 'changeOrderRefusal', f.code)))].join(' ')
  try {
    return t(`error.${e.code}` as StaffKey)
  } catch {
    return t('error.INTERNAL')
  }
}

function send(fetchImpl: Fetch, path: string, body: unknown, method: 'POST' | 'PUT' = 'POST', version?: number) {
  return call<{ changeOrderId: string }>(fetchImpl, path, {
    method,
    body,
    headers: {
      'idempotency-key': idempotencyKey(),
      ...(version === undefined ? {} : { 'if-match': `"${version}"` }),
    },
  })
}

type LineDraft = {
  kind: LineKind
  description: string
  workPackageId: string
  quantity: string
  unit: string
  price: string
}
const blankLine = (): LineDraft => ({
  kind: 'charge',
  description: '',
  workPackageId: '',
  quantity: '',
  unit: '',
  price: '',
})
const lineDraft = (l: ChangeOrderLine): LineDraft => ({
  kind: l.kind,
  description: l.description,
  workPackageId: l.workPackageId ?? '',
  quantity: l.quantity ?? '',
  unit: l.unit ?? '',
  price: l.unitPriceCents === null ? '' : toDecimalString(cents(l.unitPriceCents)),
})

/** A draft's form: a new change order, or the open draft being edited. */
function DraftForm({
  t,
  fetchImpl,
  data,
  editing,
  onDone,
  onCancel,
}: {
  t: T
  fetchImpl: Fetch
  data: ChangeOrdersData
  editing: ChangeOrder | null
  onDone: () => Promise<void>
  onCancel?: () => void
}) {
  const ids = useId()
  const v = editing?.current
  const [origin, setOrigin] = useState<string>(data.actions.chooseOrigin ? 'customer_request' : 'worker_proposal')
  const [reason, setReason] = useState(v?.reason ?? '')
  const [scope, setScope] = useState(v?.scope ?? '')
  const [scheduleImpact, setScheduleImpact] = useState(v?.scheduleImpact ?? '')
  const [hazards, setHazards] = useState(v?.hazards ?? '')
  const [resources, setResources] = useState(v?.resources ?? '')
  const [measurements, setMeasurements] = useState(v?.measurements ?? '')
  const [lines, setLines] = useState<LineDraft[]>(v?.lines.length ? v.lines.map(lineDraft) : [blankLine()])
  const [photoIds, setPhotoIds] = useState<string[]>(v?.photoIds ?? [])
  const [steps, setSteps] = useState<string[]>((v?.affectedSteps ?? []).map((s) => `${s.workPackageId}:${s.stepId}`))
  const [pending, setPending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((x) => x !== value) : [...list, value])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const body: Record<string, unknown> = {
      reason,
      scope,
      scheduleImpact: scheduleImpact.trim() || null,
      hazards: hazards.trim() || null,
      resources: resources.trim() || null,
      measurements: measurements.trim() || null,
      photoIds,
      affectedSteps: steps.map((s) => {
        const [workPackageId, stepId] = s.split(':')
        return { workPackageId, stepId }
      }),
      lines: [] as unknown[],
    }
    for (const l of lines) {
      let unitPriceCents: number | null = null
      if (l.price.trim()) {
        try {
          unitPriceCents = centsFromDecimal(l.price.trim())
        } catch (err) {
          if (!(err instanceof MoneyError)) throw err
          return setProblem(t('changeOrders.priceInvalid'))
        }
      }
      ;(body['lines'] as unknown[]).push({
        kind: l.kind,
        description: l.description,
        workPackageId: l.workPackageId || null,
        quantity: l.quantity.trim() || null,
        unit: l.unit.trim() || null,
        unitPriceCents,
      })
    }
    setPending(true)
    const r = editing
      ? await send(
          fetchImpl,
          `/staff/change-orders/${encodeURIComponent(editing.changeOrderId)}/draft`,
          body,
          'PUT',
          editing.current.rowVersion,
        )
      : await send(fetchImpl, `/staff/jobs/${encodeURIComponent(data.jobId)}/change-orders`, {
          ...body,
          ...(data.actions.chooseOrigin ? { origin } : {}),
        })
    setPending(false)
    if (!r.ok) return setProblem(changeOrderError(t, r.error))
    setProblem(null)
    await onDone()
  }

  return (
    <form
      className="staff-loadout__form"
      onSubmit={(e) => void submit(e)}
      aria-label={editing ? t('changeOrders.editTitle', { reference: editing.reference }) : t('changeOrders.newTitle')}
      data-testid="change-order-form"
    >
      <h2 className="staff-queue__heading">
        {editing ? t('changeOrders.editTitle', { reference: editing.reference }) : t('changeOrders.newTitle')}
      </h2>
      <p className="staff-request__hint">{t('changeOrders.formHint')}</p>
      {!editing && data.actions.chooseOrigin ? (
        <div className="hh-field">
          <label className="hh-field__label" htmlFor={`${ids}-origin`}>
            {t('changeOrders.field.origin')}
          </label>
          <select
            id={`${ids}-origin`}
            className="hh-field__control"
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
          >
            {ORIGINS.map((o) => (
              <option key={o} value={o}>
                {codeLabel(t, 'changeOrderOrigin', o)}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <Field
        label={t('changeOrders.field.reason')}
        name="reason"
        multiline
        required
        maxLength={2000}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <Field
        label={t('changeOrders.field.scope')}
        name="scope"
        multiline
        required
        maxLength={4000}
        value={scope}
        onChange={(e) => setScope(e.target.value)}
      />
      <fieldset className="staff-request__section" data-testid="change-order-lines">
        <legend>{t('changeOrders.field.lines')}</legend>
        <p className="staff-request__hint">{t('changeOrders.linesHint')}</p>
        {lines.map((l, i) => (
          <div key={i} className="staff-request__section" data-testid="change-order-line-input">
            <div className="hh-field">
              <label className="hh-field__label" htmlFor={`${ids}-kind-${i}`}>
                {t('changeOrders.field.kind')}
              </label>
              <select
                id={`${ids}-kind-${i}`}
                className="hh-field__control"
                value={l.kind}
                onChange={(e) => setLine(i, { kind: e.target.value as LineKind })}
              >
                {(['charge', 'credit'] as const).map((k) => (
                  <option key={k} value={k}>
                    {codeLabel(t, 'changeOrderLineKind', k)}
                  </option>
                ))}
              </select>
            </div>
            <Field
              label={t('changeOrders.field.description')}
              name={`description-${i}`}
              required
              maxLength={2000}
              value={l.description}
              onChange={(e) => setLine(i, { description: e.target.value })}
            />
            <div className="hh-field">
              <label className="hh-field__label" htmlFor={`${ids}-wp-${i}`}>
                {t('changeOrders.field.workPackage')}
              </label>
              <select
                id={`${ids}-wp-${i}`}
                className="hh-field__control"
                value={l.workPackageId}
                onChange={(e) => setLine(i, { workPackageId: e.target.value })}
              >
                <option value="">{t('changeOrders.noWorkPackage')}</option>
                {data.packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {codeLabel(t, 'service', p.code)} · {p.code}
                  </option>
                ))}
              </select>
            </div>
            <Field
              label={t('changeOrders.field.quantity')}
              name={`quantity-${i}`}
              inputMode="decimal"
              maxLength={20}
              value={l.quantity}
              onChange={(e) => setLine(i, { quantity: e.target.value })}
            />
            <Field
              label={t('changeOrders.field.unit')}
              name={`unit-${i}`}
              maxLength={40}
              value={l.unit}
              onChange={(e) => setLine(i, { unit: e.target.value })}
            />
            <Field
              label={t('changeOrders.field.unitPrice')}
              name={`price-${i}`}
              inputMode="decimal"
              maxLength={12}
              value={l.price}
              onChange={(e) => setLine(i, { price: e.target.value })}
            />
            {lines.length > 1 ? (
              <Button variant="secondary" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                {t('changeOrders.removeLine')}
              </Button>
            ) : null}
          </div>
        ))}
        <Button variant="secondary" onClick={() => setLines((ls) => [...ls, blankLine()])}>
          {t('changeOrders.addLine')}
        </Button>
      </fieldset>
      <Field
        label={t('changeOrders.field.scheduleImpact')}
        name="scheduleImpact"
        multiline
        maxLength={2000}
        value={scheduleImpact}
        onChange={(e) => setScheduleImpact(e.target.value)}
      />
      <Field
        label={t('changeOrders.field.hazards')}
        name="hazards"
        multiline
        maxLength={2000}
        value={hazards}
        onChange={(e) => setHazards(e.target.value)}
      />
      <Field
        label={t('changeOrders.field.resources')}
        name="resources"
        multiline
        maxLength={2000}
        value={resources}
        onChange={(e) => setResources(e.target.value)}
      />
      <Field
        label={t('changeOrders.field.measurements')}
        name="measurements"
        multiline
        maxLength={2000}
        value={measurements}
        onChange={(e) => setMeasurements(e.target.value)}
      />
      {data.photos.length ? (
        <fieldset className="staff-request__section">
          <legend>{t('changeOrders.field.photos')}</legend>
          {data.photos.map((p) => (
            <label key={p.id} className="staff-loadout__choice">
              <input
                type="checkbox"
                checked={photoIds.includes(p.id)}
                onChange={() => toggle(photoIds, setPhotoIds, p.id)}
              />{' '}
              {codeLabel(t, 'fieldPhotoPhase', p.phase)}
              {p.areaLabel ? ` · ${p.areaLabel}` : ''}
            </label>
          ))}
        </fieldset>
      ) : null}
      <fieldset className="staff-request__section" data-testid="change-order-steps">
        <legend>{t('changeOrders.field.steps')}</legend>
        <p className="staff-request__hint">{t('changeOrders.stepsHint')}</p>
        {data.packages.map((p) => (
          <details key={p.id}>
            <summary>
              {codeLabel(t, 'service', p.code)} · {p.code}
            </summary>
            {p.steps.map((s) => {
              const value = `${p.id}:${s.id}`
              return (
                <label key={value} className="staff-loadout__choice">
                  <input
                    type="checkbox"
                    checked={steps.includes(value)}
                    onChange={() => toggle(steps, setSteps, value)}
                  />{' '}
                  {t('sop.itemId', { id: s.id })} · <span lang="en">{s.text}</span>
                </label>
              )
            })}
          </details>
        ))}
      </fieldset>
      {problem ? (
        <p role="alert" className="hh-field__error">
          {problem}
        </p>
      ) : null}
      <div className="hh-button-row">
        <Button type="submit" pending={pending}>
          {editing ? t('changeOrders.save') : t('changeOrders.create')}
        </Button>
        {onCancel ? (
          <Button variant="secondary" onClick={onCancel}>
            {t('changeOrders.cancel')}
          </Button>
        ) : null}
      </div>
    </form>
  )
}

function Totals({ t, v }: { t: T; v: ChangeOrderVersion }) {
  return (
    <dl className="staff-sop__facts" data-testid="change-order-totals">
      <dt>{t('changeOrders.approvedTotal')}</dt>
      <dd>{usd(v.base.totalCents)}</dd>
      {v.chargesCents === null || v.creditsCents === null || v.revisedTotalCents === null ? (
        <>
          <dt>{t('changeOrders.revisedTotal')}</dt>
          <dd>{t('changeOrders.notPriced')}</dd>
        </>
      ) : (
        <>
          <dt>{t('changeOrders.charges')}</dt>
          <dd>{usd(v.chargesCents)}</dd>
          <dt>{t('changeOrders.credits')}</dt>
          <dd>{v.creditsCents ? `− ${usd(v.creditsCents)}` : usd(0)}</dd>
          <dt>{t('changeOrders.revisedTotal')}</dt>
          <dd data-testid="change-order-revised">{usd(v.revisedTotalCents)}</dd>
        </>
      )}
    </dl>
  )
}

function Order({
  t,
  fetchImpl,
  data,
  order,
  onDone,
}: {
  t: T
  fetchImpl: Fetch
  data: ChangeOrdersData
  order: ChangeOrder
  onDone: () => Promise<void>
}) {
  const v = order.current
  const [editing, setEditing] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const stepText = (wp: string, id: string) => {
    const p = data.packages.find((x) => x.id === wp)
    return `${p?.code ?? ''} ${t('sop.itemId', { id })}`
  }
  async function act(event: 'review' | 'reopen' | 'withdraw') {
    setPending(event)
    const r = await send(
      fetchImpl,
      `/staff/change-orders/${encodeURIComponent(order.changeOrderId)}/actions/${event}`,
      event === 'withdraw' ? { reason } : {},
      'POST',
      v.rowVersion,
    )
    setPending(null)
    if (!r.ok) return setProblem(changeOrderError(t, r.error))
    setProblem(null)
    setReason('')
    await onDone()
  }
  if (editing)
    return (
      <DraftForm
        t={t}
        fetchImpl={fetchImpl}
        data={data}
        editing={order}
        onDone={async () => {
          setEditing(false)
          await onDone()
        }}
        onCancel={() => setEditing(false)}
      />
    )
  const tone = v.state === 'withdrawn' ? 'neutral' : v.state === 'reviewed' ? 'info' : 'warning'
  return (
    <section className="staff-request__section" data-testid="change-order" data-state={v.state}>
      <h2 className="staff-queue__heading">
        {order.reference} <StatusBadge tone={tone}>{codeLabel(t, 'changeOrderState', v.state)}</StatusBadge>
      </h2>
      {v.state === 'draft' || v.state === 'reviewed' ? (
        <p className="staff-request__hint" data-testid="change-order-not-approved">
          {t('changeOrders.notApproved')}
        </p>
      ) : null}
      <p className="staff-request__hint">
        {t('changeOrders.drafted', {
          origin: codeLabel(t, 'changeOrderOrigin', order.origin),
          by: v.draftedBy.name ?? t('queue.unnamed'),
          version: v.version,
        })}
        {v.reviewedBy ? ` ${t('changeOrders.reviewed', { by: v.reviewedBy.name ?? t('queue.unnamed') })}` : ''}
      </p>
      <dl className="staff-sop__facts">
        <dt>{t('changeOrders.field.reason')}</dt>
        <dd>{v.reason}</dd>
        <dt>{t('changeOrders.field.scope')}</dt>
        <dd>{v.scope}</dd>
        {v.scheduleImpact ? (
          <>
            <dt>{t('changeOrders.field.scheduleImpact')}</dt>
            <dd>{v.scheduleImpact}</dd>
          </>
        ) : null}
        {v.hazards ? (
          <>
            <dt>{t('changeOrders.field.hazards')}</dt>
            <dd>{v.hazards}</dd>
          </>
        ) : null}
        {v.resources ? (
          <>
            <dt>{t('changeOrders.field.resources')}</dt>
            <dd>{v.resources}</dd>
          </>
        ) : null}
        {v.measurements ? (
          <>
            <dt>{t('changeOrders.field.measurements')}</dt>
            <dd>{v.measurements}</dd>
          </>
        ) : null}
        <dt>{t('changeOrders.field.photos')}</dt>
        <dd>{t('changeOrders.photoCount', { count: v.photoIds.length })}</dd>
        {v.affectedSteps.length ? (
          <>
            <dt>{t('changeOrders.field.steps')}</dt>
            <dd data-testid="change-order-steps-list">
              {v.affectedSteps.map((s) => stepText(s.workPackageId, s.stepId)).join(', ')}
            </dd>
          </>
        ) : null}
        {v.withdrawReason ? (
          <>
            <dt>{t('changeOrders.withdrawReason')}</dt>
            <dd>{v.withdrawReason}</dd>
          </>
        ) : null}
      </dl>
      <table className="staff-queue__table" data-testid="change-order-lines-table">
        <thead>
          <tr>
            <th scope="col">{t('changeOrders.field.kind')}</th>
            <th scope="col">{t('changeOrders.field.description')}</th>
            <th scope="col">{t('changeOrders.field.quantity')}</th>
            <th scope="col">{t('changeOrders.field.unitPrice')}</th>
            <th scope="col">{t('changeOrders.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {v.lines.map((l) => (
            <tr key={l.position} data-kind={l.kind}>
              <td>{codeLabel(t, 'changeOrderLineKind', l.kind)}</td>
              <td>{l.description}</td>
              <td>{l.quantity ? `${l.quantity}${l.unit ? ` ${l.unit}` : ''}` : t('changeOrders.unknown')}</td>
              <td>{l.unitPriceCents === null ? t('changeOrders.unknown') : usd(l.unitPriceCents)}</td>
              <td>
                {l.amountCents === null
                  ? t('changeOrders.unknown')
                  : l.kind === 'credit'
                    ? `− ${usd(l.amountCents)}`
                    : usd(l.amountCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Totals t={t} v={v} />
      {order.history.length ? (
        <p className="staff-request__hint">
          {t('changeOrders.history', {
            versions: order.history
              .map((h) => `${h.version} (${codeLabel(t, 'changeOrderState', h.state)})`)
              .join(', '),
          })}
        </p>
      ) : null}
      {order.actions.withdraw ? (
        <Field
          label={t('changeOrders.withdrawReason')}
          name="withdrawReason"
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      ) : null}
      {problem ? (
        <p role="alert" className="hh-field__error">
          {problem}
        </p>
      ) : null}
      <div className="hh-button-row">
        {order.actions.edit ? (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            {t('changeOrders.edit')}
          </Button>
        ) : null}
        {order.actions.review ? (
          <Button pending={pending === 'review'} onClick={() => void act('review')}>
            {t('changeOrders.review')}
          </Button>
        ) : null}
        {order.actions.reopen ? (
          <Button variant="secondary" pending={pending === 'reopen'} onClick={() => void act('reopen')}>
            {t('changeOrders.reopen')}
          </Button>
        ) : null}
        {order.actions.withdraw ? (
          <Button variant="secondary" pending={pending === 'withdraw'} onClick={() => void act('withdraw')}>
            {t('changeOrders.withdraw')}
          </Button>
        ) : null}
      </div>
    </section>
  )
}

export function ChangeOrdersPage({
  t,
  fetchImpl,
  jobId,
  href,
}: {
  t: T
  fetchImpl: Fetch
  jobId: string
  href: (to: string) => string
}) {
  const [data, setData] = useState<ChangeOrdersData | null | undefined>(undefined)
  const [refused, setRefused] = useState<ApiErrorBody | null>(null)
  const [adding, setAdding] = useState(false)
  const load = useCallback(async () => {
    const r = await call<ChangeOrdersData>(fetchImpl, `/staff/jobs/${encodeURIComponent(jobId)}/change-orders`)
    if (r.ok) {
      setData(r.data)
      setRefused(null)
    } else {
      setRefused(r.error)
      setData(null)
    }
  }, [fetchImpl, jobId])
  useEffect(() => {
    void load()
  }, [load])
  if (data === undefined) return <StateView kind="loading" title={t('changeOrders.loading')} />
  if (data === null)
    return <StateView kind="error" title={refused ? changeOrderError(t, refused) : t('changeOrders.loadFailed')} />
  return (
    <section className="staff-screen" aria-labelledby="change-orders-title" data-testid="change-orders">
      <h1 id="change-orders-title">{t('changeOrders.title', { reference: data.reference })}</h1>
      <p>
        <a href={href(`/packets/${data.jobId}`)}>{t('changeOrders.openPacket')}</a> ·{' '}
        <a href={href(`/checklist/${data.jobId}`)}>{t('checklist.open')}</a>
      </p>
      <section className="staff-request__section" data-testid="change-orders-approved">
        <h2 className="staff-queue__heading">{t('changeOrders.approvedScope')}</h2>
        {data.approved ? (
          <p>
            {t('changeOrders.approvedLine', {
              total: usd(data.approved.totalCents),
              version: data.approved.snapshotVersion,
            })}{' '}
            {t('changeOrders.paidLine', { paid: usd(data.paidCents) })}
          </p>
        ) : (
          <p>{t('changeOrders.noApprovedScope')}</p>
        )}
        <p className="staff-request__hint">{t('changeOrders.bindsNothing')}</p>
      </section>
      {data.changeOrders.length === 0 ? <StateView kind="empty" title={t('changeOrders.none')} /> : null}
      {data.changeOrders.map((o) => (
        <Order key={o.changeOrderId} t={t} fetchImpl={fetchImpl} data={data} order={o} onDone={load} />
      ))}
      {data.actions.create ? (
        adding ? (
          <DraftForm
            t={t}
            fetchImpl={fetchImpl}
            data={data}
            editing={null}
            onDone={async () => {
              setAdding(false)
              await load()
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <div className="hh-button-row">
            <Button onClick={() => setAdding(true)}>
              {data.actions.chooseOrigin ? t('changeOrders.newStaff') : t('changeOrders.newWorker')}
            </Button>
          </div>
        )
      ) : null}
    </section>
  )
}
