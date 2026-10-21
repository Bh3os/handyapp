// Write an Estimate: the estimates list, the staff builder and the request record's estimates panel (TSK-0053;
// HH-EST-01, HH-EST-05, HH-EST-11, S04, RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS).
// - The builder edits one draft version: lines per work package (base scope, alternates and optional add-ons), the
//   customer-facing notes, the one discount category and, for the roles that may see them, internal costs and notes.
// - Every amount on screen comes from the server: a line's amount, the subtotal, the discount row, the total and the
//   deposit are what the last save computed. Prices are typed as dollars and sent as integer cents, converted from the
//   digits by @handyhub/money (no floating point); an amount the person typed that is not exact cents is refused here
//   before anything is sent, and the server checks it again.
// - The issuer name, mailing address, validity and terms come from configuration. A missing value is shown as NOT
//   CONFIGURED, never filled in; the mailing-address line is left out while it is missing. The publish readiness lists
//   every reason the version cannot be published yet. Publishing itself is a later step (TSK-0055).
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { cents, centsFromDecimal, formatUsd, MoneyError, toDecimalString } from '@handyhub/money'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { ConflictBanner, conflictOf, type Conflict } from './ConflictBanner'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string
type Nav = { go: (to: string) => void; href: (to: string) => string }

const LINE_KINDS = ['base', 'alternate', 'add_on'] as const
const QUANTITY_SOURCES = ['measured_on_site', 'reported_by_customer'] as const
const TEXT_LISTS = [
  'assumptions',
  'exclusions',
  'customerResponsibilities',
  'dependencies',
  'scheduleAssumptions',
] as const
type TextList = (typeof TEXT_LISTS)[number]
const TEXT_LABELS: Record<TextList, StaffKey> = {
  assumptions: 'estimate.text.assumptions',
  exclusions: 'estimate.text.exclusions',
  customerResponsibilities: 'estimate.text.customerResponsibilities',
  dependencies: 'estimate.text.dependencies',
  scheduleAssumptions: 'estimate.text.scheduleAssumptions',
}

type VersionSummary = {
  versionId: string
  version: number
  state: string
  totalCents: number | null
  updatedAt: string
}
type Problem = { code: string; line?: number; key?: string; sourceIds?: string[] }

export type BuilderView = {
  id: string
  estimateId: string
  estimateNumber: string
  version: number
  state: string
  rowVersion: number
  project: { id: string; reference: string; state: string }
  customer: { name: string }
  property: { street: string; unit: string | null; city: string; state: string; zip: string }
  request: { id: string; reference: string } | null
  preparedBy: { id: string; name: string | null }
  lines: {
    id: string
    position: number
    kind: string
    workPackageId: string | null
    serviceCode: string | null
    description: string | null
    quantity: string | null
    unit: string | null
    quantitySource: string | null
    unitPriceCents: number | null
    amountCents: number | null
  }[]
  texts: Record<TextList, string[]>
  discountCategory: string | null
  totals: {
    subtotalCents: number
    discount: { category: string; percentBps: number; amountCents: number } | null
    totalCents: number
    depositState: 'not_required' | 'required' | 'not_configured'
    depositCents: number | null
  } | null
  paymentTerm: string
  document: {
    issuerName: string | null
    mailingAddress: string[] | null
    validityDays: number | null
    termsDocumentId: string | null
    discountCategories: string[] | null
  }
  workPackages: { id: string; serviceCode: string; position: number }[]
  readiness: { ready: boolean; problems: Problem[] }
  internal: {
    lines: { lineId: string; materialCostCents: number | null; laborCostCents: number | null; note: string | null }[]
    baseMargin: { cost: number; margin: number } | null
    markupAssumptions: string | null
    estimatorNotes: string | null
  } | null
  canEdit: boolean
}

const usd = (c: number) => formatUsd(cents(c))
/** Cents as the plain decimal a person edits ("125.5" for 12550 shows as "125.50"). */
const dollars = (c: number | null | undefined) => (c === null || c === undefined ? '' : toDecimalString(cents(c)))

/** Typed dollars to integer cents: '' is null (not written yet); anything that is not exact cents is invalid. */
function toCents(text: string): { ok: true; value: number | null } | { ok: false } {
  const v = text.trim().replace(/^\$/, '')
  if (v === '') return { ok: true, value: null }
  try {
    return { ok: true, value: centsFromDecimal(v) }
  } catch (err) {
    if (err instanceof MoneyError) return { ok: false }
    throw err
  }
}

function linkClick(go: (to: string) => void, to: string) {
  return (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    e.preventDefault()
    go(to)
  }
}

/** The estimates screen: every estimate, newest first, with its latest version. */
export function EstimatesScreen({
  t,
  locale,
  fetchImpl,
  go,
  href,
}: { t: T; locale: StaffLocale; fetchImpl: Fetch } & Nav) {
  const ids = useId()
  type Item = {
    estimateId: string
    number: string
    projectReference: string
    customerName: string
    latest: VersionSummary
  }
  const [items, setItems] = useState<Item[] | null | undefined>(undefined)
  const [cursor, setCursor] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const load = useCallback(
    async (after?: string) => {
      const r = await call<{ items: Item[]; nextCursor: string | null }>(
        fetchImpl,
        after ? `/staff/estimates?cursor=${encodeURIComponent(after)}` : '/staff/estimates',
      )
      if (!r.ok || !Array.isArray(r.data?.items)) return setItems(null)
      setItems((current) => (after && current ? [...current, ...r.data.items] : r.data.items))
      setCursor(r.data.nextCursor)
    },
    [fetchImpl],
  )
  useEffect(() => {
    void load()
  }, [load])
  const fmt = new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <section className="staff-screen" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('nav.estimates')}
      </h1>
      <p className="staff-request__hint">{t('estimates.intro')}</p>
      {items === undefined ? (
        <StateView kind="loading" title={t('common.loading')} />
      ) : items === null ? (
        <StateView kind="error" title={t('estimates.loadFailed')} />
      ) : items.length === 0 ? (
        <StateView kind="empty" title={t('estimates.empty')} />
      ) : (
        <ol className="staff-queue__items">
          {items.map((item) => (
            <li key={item.estimateId} className="staff-queue__item" aria-labelledby={`${ids}-${item.estimateId}`}>
              <div className="staff-queue__head">
                <h2 id={`${ids}-${item.estimateId}`} className="staff-queue__title">
                  {t('estimate.heading', { number: item.number })}
                </h2>
                <StatusBadge>{codeLabel(t, 'estimateState', item.latest.state)}</StatusBadge>
              </div>
              <ul className="staff-queue__facts">
                <li>{item.customerName}</li>
                <li>{t('estimate.versionN', { n: item.latest.version })}</li>
                <li>
                  {item.latest.totalCents === null
                    ? t('estimate.totalPending')
                    : t('estimate.totalIs', { amount: usd(item.latest.totalCents) })}
                </li>
                <li>{t('estimates.updated', { time: fmt.format(new Date(item.latest.updatedAt)) })}</li>
              </ul>
              <a
                className="hh-button staff-queue__action"
                href={href(`/estimates/${item.latest.versionId}`)}
                onClick={linkClick(go, `/estimates/${item.latest.versionId}`)}
              >
                {t('estimates.open')}
              </a>
            </li>
          ))}
        </ol>
      )}
      {cursor ? (
        <Button
          variant="secondary"
          pending={more}
          onClick={() => (setMore(true), void load(cursor).then(() => setMore(false)))}
        >
          {t('queue.loadMore')}
        </Button>
      ) : null}
    </section>
  )
}

/**
 * The request record's estimates panel: the project's estimates and versions, and Write an Estimate when the server
 * says the caller may (estimate.draft, open project). Hidden for roles that may not write estimates.
 */
export function ProjectEstimates({
  t,
  fetchImpl,
  projectId,
  go,
  href,
}: { t: T; fetchImpl: Fetch; projectId: string } & Nav) {
  const ids = useId()
  type Data = { canWrite: boolean; estimates: { estimateId: string; number: string; versions: VersionSummary[] }[] }
  const [data, setData] = useState<Data | null | undefined>(undefined)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const key = useRef<string | null>(null)
  useEffect(() => {
    void call<Data>(fetchImpl, `/staff/projects/${encodeURIComponent(projectId)}/estimates`).then((r) =>
      setData(r.ok && Array.isArray(r.data?.estimates) ? r.data : null),
    )
  }, [fetchImpl, projectId])
  if (!data) return null
  async function writeEstimate() {
    setPending(true)
    key.current = key.current ?? idempotencyKey()
    const r = await call<{ versionId: string }>(
      fetchImpl,
      `/staff/projects/${encodeURIComponent(projectId)}/estimates`,
      {
        method: 'POST',
        body: {},
        headers: { 'idempotency-key': key.current },
      },
    )
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (!r.ok) return setFailed(true)
    go(`/estimates/${r.data.versionId}`)
  }
  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-estimates`}>
      <h2 id={`${ids}-estimates`} className="staff-queue__heading">
        {t('nav.estimates')}
      </h2>
      {data.estimates.length === 0 ? (
        <p>{t('estimates.noneForProject')}</p>
      ) : (
        <ul className="staff-request__list">
          {data.estimates.map((e) => (
            <li key={e.estimateId}>
              <strong>{t('estimate.heading', { number: e.number })}</strong>
              <ul className="staff-request__list">
                {e.versions.map((v) => (
                  <li key={v.versionId}>
                    <a href={href(`/estimates/${v.versionId}`)} onClick={linkClick(go, `/estimates/${v.versionId}`)}>
                      {t('estimate.versionN', { n: v.version })}
                    </a>{' '}
                    <StatusBadge>{codeLabel(t, 'estimateState', v.state)}</StatusBadge>{' '}
                    {v.totalCents === null
                      ? t('estimate.totalPending')
                      : t('estimate.totalIs', { amount: usd(v.totalCents) })}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
      {data.canWrite ? (
        <>
          <p className="staff-request__hint">{t('estimates.writeHint')}</p>
          <Button pending={pending} onClick={() => void writeEstimate()}>
            {t('estimates.write')}
          </Button>
        </>
      ) : null}
      {failed ? <StateView kind="error" title={t('estimate.saveFailed')} /> : null}
    </section>
  )
}

type LineDraft = {
  key: string
  id: string | undefined
  kind: string
  workPackageId: string
  description: string
  quantity: string
  unit: string
  quantitySource: string
  price: string
  material: string
  labor: string
  costNote: string
}
type FormState = {
  lines: LineDraft[]
  discountCategory: string
  texts: Record<TextList, string>
  markup: string
  notes: string
}

let localKey = 0
const nextKey = () => `line-${++localKey}`

function formOf(view: BuilderView): FormState {
  const costs = new Map((view.internal?.lines ?? []).map((c) => [c.lineId, c]))
  return {
    lines: view.lines.map((l) => {
      const c = costs.get(l.id)
      return {
        key: l.id,
        id: l.id,
        kind: l.kind,
        workPackageId: l.workPackageId ?? '',
        description: l.description ?? '',
        quantity: l.quantity ?? '',
        unit: l.unit ?? '',
        quantitySource: l.quantitySource ?? '',
        price: dollars(l.unitPriceCents),
        material: dollars(c?.materialCostCents),
        labor: dollars(c?.laborCostCents),
        costNote: c?.note ?? '',
      }
    }),
    discountCategory: view.discountCategory ?? '',
    texts: Object.fromEntries(TEXT_LISTS.map((k) => [k, view.texts[k].join('\n')])) as Record<TextList, string>,
    markup: view.internal?.markupAssumptions ?? '',
    notes: view.internal?.estimatorNotes ?? '',
  }
}

const blankLine = (workPackageId: string): LineDraft => ({
  key: nextKey(),
  id: undefined,
  kind: 'base',
  workPackageId,
  description: '',
  quantity: '',
  unit: '',
  quantitySource: '',
  price: '',
  material: '',
  labor: '',
  costNote: '',
})

const textOrNull = (s: string) => (s.trim() === '' ? null : s.trim())

/** The line groups in display (and save) order: each work package by position, then lines without one. */
function groupsOf(view: BuilderView, lines: readonly LineDraft[]) {
  const packages = view.workPackages.map((p) => ({ id: p.id, code: p.serviceCode as string | null }))
  const known = new Set(packages.map((p) => p.id))
  return [...packages, { id: '', code: null }].map((g) => ({
    ...g,
    lines: lines.filter((l) => (g.id === '' ? !known.has(l.workPackageId) : l.workPackageId === g.id)),
  }))
}

/** The staff builder of one estimate version. */
export function EstimateBuilder({ t, fetchImpl, id, go, href }: { t: T; fetchImpl: Fetch; id: string } & Nav) {
  const ids = useId()
  const [view, setView] = useState<BuilderView | null | undefined>(undefined)
  const [form, setForm] = useState<FormState | null>(null)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<Conflict | null>(null)
  /** Field problems by line key and field name, or by a top-level field name. */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const key = useRef<string | null>(null)

  const load = useCallback(
    async (keepForm = false) => {
      const r = await call<BuilderView>(fetchImpl, `/staff/estimate-versions/${encodeURIComponent(id)}`)
      const next = r.ok && typeof r.data?.estimateNumber === 'string' ? r.data : null
      setView(next)
      if (next && !keepForm) setForm(formOf(next))
    },
    [fetchImpl, id],
  )
  useEffect(() => {
    void load()
  }, [load])

  if (view === undefined) return <StateView kind="loading" title={t('common.loading')} />
  if (view === null || form === null)
    return (
      <section className="staff-screen">
        <StateView kind="blocked" title={t('estimate.notFound')} />
        <p>
          <a href={href('/estimates')} onClick={linkClick(go, '/estimates')}>
            {t('estimate.back')}
          </a>
        </p>
      </section>
    )

  const editable = view.canEdit
  const setLine = (k: string, patch: Partial<LineDraft>) =>
    setForm({ ...form, lines: form.lines.map((l) => (l.key === k ? { ...l, ...patch } : l)) })
  const groups = groupsOf(view, form.lines)
  const ordered = groups.flatMap((g) => g.lines)
  const position = new Map(ordered.map((l, i) => [l.key, i + 1]))
  const savedAmount = new Map(view.lines.map((l) => [l.id, l.amountCents]))

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!form || !view) return
    const errors: Record<string, string> = {}
    const priced = ordered.map((l) => {
      const price = toCents(l.price)
      const material = toCents(l.material)
      const labor = toCents(l.labor)
      if (!price.ok) errors[`${l.key}.price`] = t('estimate.error.amount')
      if (!material.ok) errors[`${l.key}.material`] = t('estimate.error.amount')
      if (!labor.ok) errors[`${l.key}.labor`] = t('estimate.error.amount')
      return { l, price, material, labor }
    })
    setFieldErrors(errors)
    setSaved(false)
    setError(null)
    if (Object.keys(errors).length > 0) return
    const internal = view.internal !== null
    const body = {
      lines: priced.map(({ l, price, material, labor }) => ({
        ...(l.id ? { id: l.id } : {}),
        kind: l.kind,
        workPackageId: l.workPackageId || null,
        description: textOrNull(l.description),
        quantity: textOrNull(l.quantity),
        unit: textOrNull(l.unit),
        quantitySource: l.quantitySource || null,
        unitPriceCents: price.ok ? price.value : null,
        ...(internal
          ? {
              internalCost: {
                materialCostCents: material.ok ? material.value : null,
                laborCostCents: labor.ok ? labor.value : null,
                note: textOrNull(l.costNote),
              },
            }
          : {}),
      })),
      discountCategory: form.discountCategory || null,
      texts: Object.fromEntries(
        TEXT_LISTS.map((k) => [
          k,
          form.texts[k]
            .split('\n')
            .map((s) => s.trim())
            .filter((s) => s !== ''),
        ]),
      ),
      ...(internal
        ? { internal: { markupAssumptions: textOrNull(form.markup), estimatorNotes: textOrNull(form.notes) } }
        : {}),
    }
    setPending(true)
    key.current = key.current ?? idempotencyKey()
    const r = await call<BuilderView>(fetchImpl, `/staff/estimate-versions/${encodeURIComponent(view.id)}/draft`, {
      method: 'PUT',
      body,
      headers: { 'idempotency-key': key.current, 'if-match': `"${view.rowVersion}"` },
    })
    setPending(false)
    if (r.ok || r.status < 500) key.current = null
    if (r.ok) {
      setView(r.data)
      setForm(formOf(r.data))
      setConflict(null)
      setSaved(true)
      return
    }
    const c = conflictOf(r.error)
    if (c) return setConflict(c)
    setFieldErrors(serverErrors(r.error, ordered))
    setError(r.error.code)
  }

  function serverErrors(err: ApiErrorBody, sent: readonly LineDraft[]): Record<string, string> {
    const out: Record<string, string> = {}
    for (const f of err.fieldErrors) {
      const m = /^lines\[(\d+)\]\.(\w+)/.exec(f.field)
      const line = m ? sent[Number(m[1])] : undefined
      const name = m?.[2] === 'unitPriceCents' ? 'price' : (m?.[2] ?? f.field)
      const text = codeLabel(t, 'estimateFieldError', f.code)
      out[line ? `${line.key}.${name}` : name] = text
    }
    return out
  }

  const p = view.property
  const err = (k: string) => (fieldErrors[k] === undefined ? {} : { error: fieldErrors[k] })
  const categories = view.document.discountCategories
  const options = view.lines.filter((l) => l.kind !== 'base')

  return (
    <section className="staff-screen staff-request" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('estimate.heading', { number: view.estimateNumber })}
      </h1>
      <dl className="staff-record">
        <dt>{t('estimate.version')}</dt>
        <dd>
          {t('estimate.versionN', { n: view.version })}{' '}
          <StatusBadge>{codeLabel(t, 'estimateState', view.state)}</StatusBadge>
        </dd>
        <dt>{t('request.project')}</dt>
        <dd>{view.project.reference}</dd>
        <dt>{t('estimate.customer')}</dt>
        <dd>{view.customer.name}</dd>
        <dt>{t('request.address')}</dt>
        <dd>
          {p.street}
          {p.unit ? `, ${p.unit}` : ''}, {p.city}, {p.state} {p.zip}
        </dd>
        {view.request ? (
          <>
            <dt>{t('estimate.request')}</dt>
            <dd>
              <a href={href(`/requests/${view.request.id}`)} onClick={linkClick(go, `/requests/${view.request.id}`)}>
                {t('record.request.heading', { reference: view.request.reference })}
              </a>
            </dd>
          </>
        ) : null}
        <dt>{t('estimate.preparedBy')}</dt>
        <dd>{view.preparedBy.name ?? t('queue.unnamed')}</dd>
        <dt>{t('estimate.method')}</dt>
        <dd>{t('estimate.methodWritten')}</dd>
      </dl>

      <Panel id={`${ids}-document`} title={t('estimate.document')}>
        <dl className="staff-record" data-testid="estimate-document">
          <dt>{t('estimate.issuer')}</dt>
          <dd>{view.document.issuerName ?? <NotConfigured t={t} />}</dd>
          <dt>{t('estimate.mailingAddress')}</dt>
          <dd>
            {view.document.mailingAddress
              ? view.document.mailingAddress.join(', ')
              : t('estimate.mailingAddressOmitted')}
          </dd>
          <dt>{t('estimate.validity')}</dt>
          <dd>
            {view.document.validityDays === null ? (
              <NotConfigured t={t} />
            ) : (
              t('estimate.validityDays', { days: view.document.validityDays })
            )}
          </dd>
          <dt>{t('estimate.paymentTerm')}</dt>
          <dd>{codeLabel(t, 'paymentTerm', view.paymentTerm)}</dd>
          <dt>{t('estimate.terms')}</dt>
          <dd>{view.document.termsDocumentId ?? <NotConfigured t={t} />}</dd>
        </dl>
      </Panel>

      {!editable ? <StateView kind="blocked" title={t('estimate.notEditable')} /> : null}

      <form className="staff-request__form" onSubmit={(e) => void submit(e)} aria-label={t('estimate.form')} noValidate>
        <Panel id={`${ids}-lines`} title={t('estimate.lines')}>
          <p className="staff-request__hint">{t('estimate.linesHint')}</p>
          {groups.map((g) => (
            <fieldset key={g.id || 'general'} className="staff-request__check">
              <legend>{g.code ? codeLabel(t, 'service', g.code) : t('estimate.generalLines')}</legend>
              {g.lines.length === 0 ? <p className="staff-request__hint">{t('estimate.noLines')}</p> : null}
              {g.lines.map((l) => (
                <fieldset key={l.key} className="staff-estimate__line">
                  <legend>{t('estimate.lineN', { n: position.get(l.key) ?? 0 })}</legend>
                  <div className="staff-queue__select">
                    <label htmlFor={`${ids}-${l.key}-kind`}>{t('estimate.line.kind')}</label>
                    <select
                      id={`${ids}-${l.key}-kind`}
                      value={l.kind}
                      disabled={!editable}
                      onChange={(e) => setLine(l.key, { kind: e.target.value })}
                    >
                      {LINE_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {codeLabel(t, 'estimateLineKind', k)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Field
                    label={t('estimate.line.description')}
                    value={l.description}
                    maxLength={2000}
                    readOnly={!editable}
                    onChange={(e) => setLine(l.key, { description: e.target.value })}
                    {...err(`${l.key}.description`)}
                  />
                  <div className="staff-estimate__row">
                    <Field
                      label={t('estimate.line.quantity')}
                      hint={t('estimate.line.quantityHint')}
                      inputMode="decimal"
                      value={l.quantity}
                      maxLength={20}
                      readOnly={!editable}
                      onChange={(e) => setLine(l.key, { quantity: e.target.value })}
                      {...err(`${l.key}.quantity`)}
                    />
                    <Field
                      label={t('estimate.line.unit')}
                      value={l.unit}
                      maxLength={40}
                      readOnly={!editable}
                      onChange={(e) => setLine(l.key, { unit: e.target.value })}
                      {...err(`${l.key}.unit`)}
                    />
                    <div className="staff-queue__select">
                      <label htmlFor={`${ids}-${l.key}-source`}>{t('estimate.line.source')}</label>
                      <select
                        id={`${ids}-${l.key}-source`}
                        value={l.quantitySource}
                        disabled={!editable}
                        onChange={(e) => setLine(l.key, { quantitySource: e.target.value })}
                      >
                        <option value="">{t('estimate.line.sourceUnknown')}</option>
                        {QUANTITY_SOURCES.map((s) => (
                          <option key={s} value={s}>
                            {codeLabel(t, 'quantitySource', s)}
                          </option>
                        ))}
                      </select>
                      {fieldErrors[`${l.key}.quantitySource`] ? (
                        <p className="hh-field__error">{fieldErrors[`${l.key}.quantitySource`]}</p>
                      ) : null}
                    </div>
                    <Field
                      label={t('estimate.line.price')}
                      hint={t('estimate.line.priceHint')}
                      inputMode="decimal"
                      value={l.price}
                      maxLength={16}
                      readOnly={!editable}
                      onChange={(e) => setLine(l.key, { price: e.target.value })}
                      {...err(`${l.key}.price`)}
                    />
                  </div>
                  <p className="staff-estimate__amount">
                    {l.id && savedAmount.get(l.id) != null
                      ? t('estimate.line.amount', { amount: usd(savedAmount.get(l.id) as number) })
                      : t('estimate.line.amountPending')}
                  </p>
                  {view.internal ? (
                    <div className="staff-estimate__row staff-estimate__internal">
                      <Field
                        label={t('estimate.line.material')}
                        inputMode="decimal"
                        value={l.material}
                        maxLength={16}
                        readOnly={!editable}
                        onChange={(e) => setLine(l.key, { material: e.target.value })}
                        {...err(`${l.key}.material`)}
                      />
                      <Field
                        label={t('estimate.line.labor')}
                        inputMode="decimal"
                        value={l.labor}
                        maxLength={16}
                        readOnly={!editable}
                        onChange={(e) => setLine(l.key, { labor: e.target.value })}
                        {...err(`${l.key}.labor`)}
                      />
                      <Field
                        label={t('estimate.line.costNote')}
                        value={l.costNote}
                        maxLength={2000}
                        readOnly={!editable}
                        onChange={(e) => setLine(l.key, { costNote: e.target.value })}
                      />
                    </div>
                  ) : null}
                  {editable ? (
                    <Button
                      variant="quiet"
                      onClick={() => setForm({ ...form, lines: form.lines.filter((x) => x.key !== l.key) })}
                    >
                      {t('estimate.removeLine', { n: position.get(l.key) ?? 0 })}
                    </Button>
                  ) : null}
                </fieldset>
              ))}
              {editable ? (
                <Button
                  variant="secondary"
                  onClick={() => setForm({ ...form, lines: [...form.lines, blankLine(g.id)] })}
                >
                  {g.code
                    ? t('estimate.addLineTo', { name: codeLabel(t, 'service', g.code) })
                    : t('estimate.addGeneralLine')}
                </Button>
              ) : null}
            </fieldset>
          ))}
        </Panel>

        <Panel id={`${ids}-texts`} title={t('estimate.texts')}>
          <p className="staff-request__hint">{t('estimate.textsHint')}</p>
          {TEXT_LISTS.map((k) => (
            <Field
              key={k}
              multiline
              label={t(TEXT_LABELS[k])}
              value={form.texts[k]}
              readOnly={!editable}
              onChange={(e) => setForm({ ...form, texts: { ...form.texts, [k]: e.target.value } })}
            />
          ))}
        </Panel>

        <Panel id={`${ids}-discount`} title={t('estimate.discount')}>
          {categories === null ? (
            <p>
              <NotConfigured t={t} />
            </p>
          ) : (
            <div className="staff-queue__select">
              <label htmlFor={`${ids}-discount-category`}>{t('estimate.discountCategory')}</label>
              <select
                id={`${ids}-discount-category`}
                value={form.discountCategory}
                disabled={!editable}
                onChange={(e) => setForm({ ...form, discountCategory: e.target.value })}
              >
                <option value="">{t('estimate.discountNone')}</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {codeLabel(t, 'discountCategory', c)}
                  </option>
                ))}
              </select>
              {fieldErrors['discountCategory'] ? (
                <p className="hh-field__error">{fieldErrors['discountCategory']}</p>
              ) : null}
            </div>
          )}
          <p className="staff-request__hint">{t('estimate.discountHint')}</p>
        </Panel>

        {view.internal ? (
          <Panel id={`${ids}-internal`} title={t('estimate.internal')}>
            <p className="staff-request__hint">{t('estimate.internalHint')}</p>
            <Field
              multiline
              label={t('estimate.markup')}
              value={form.markup}
              maxLength={5000}
              readOnly={!editable}
              onChange={(e) => setForm({ ...form, markup: e.target.value })}
            />
            <Field
              multiline
              label={t('estimate.estimatorNotes')}
              value={form.notes}
              maxLength={5000}
              readOnly={!editable}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
            {view.internal.baseMargin ? (
              <p>
                {t('estimate.margin', {
                  cost: usd(view.internal.baseMargin.cost),
                  margin: usd(view.internal.baseMargin.margin),
                })}
              </p>
            ) : null}
          </Panel>
        ) : null}

        {editable ? (
          <div className="hh-button-row">
            <Button type="submit" pending={pending}>
              {t('estimate.save')}
            </Button>
          </div>
        ) : null}
        {saved ? <StateView kind="success" title={t('estimate.saved')} /> : null}
        {error ? (
          <StateView kind="error" title={errorTitle(t, error)}>
            {Object.keys(fieldErrors).length ? <p>{t('estimate.fixFields')}</p> : null}
          </StateView>
        ) : Object.keys(fieldErrors).length ? (
          <StateView kind="error" title={t('estimate.fixFields')} />
        ) : null}
        {conflict ? (
          <ConflictBanner
            t={t}
            conflict={conflict}
            fields={[{ name: 'version', label: t('estimate.version'), yours: view.rowVersion }]}
            onUseCurrent={() => void load().then(() => setConflict(null))}
            onRedo={() => void load(true).then(() => setConflict(null))}
          />
        ) : null}
      </form>

      <Panel id={`${ids}-totals`} title={t('estimate.totals')}>
        {view.totals === null ? (
          <p>{t('estimate.totalsPending')}</p>
        ) : (
          <dl className="staff-record" data-testid="estimate-totals">
            <dt>{t('estimate.subtotal')}</dt>
            <dd>{usd(view.totals.subtotalCents)}</dd>
            {view.totals.discount ? (
              <>
                <dt>
                  {t('estimate.discountRow', {
                    category: codeLabel(t, 'discountCategory', view.totals.discount.category),
                    percent: percentOf(view.totals.discount.percentBps),
                  })}
                </dt>
                <dd>-{usd(view.totals.discount.amountCents)}</dd>
              </>
            ) : null}
            <dt>{t('estimate.total')}</dt>
            <dd>
              <strong>{usd(view.totals.totalCents)}</strong>
            </dd>
            <dt>{t('estimate.deposit')}</dt>
            <dd>
              {view.totals.depositState === 'required' && view.totals.depositCents !== null ? (
                usd(view.totals.depositCents)
              ) : view.totals.depositState === 'not_required' ? (
                t('estimate.depositNotRequired')
              ) : (
                <NotConfigured t={t} />
              )}
            </dd>
          </dl>
        )}
        {options.length ? (
          <>
            <h3>{t('estimate.options')}</h3>
            <ul className="staff-request__list">
              {options.map((o) => (
                <li key={o.id}>
                  {codeLabel(t, 'estimateLineKind', o.kind)}: {o.description ?? t('estimate.noDescription')} —{' '}
                  {o.amountCents === null ? t('estimate.line.amountPending') : usd(o.amountCents)}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <p className="staff-request__hint">{t('estimate.totalsHint')}</p>
      </Panel>

      <Panel id={`${ids}-readiness`} title={t('estimate.readiness')}>
        {view.readiness.ready ? (
          <StateView kind="success" title={t('estimate.ready')} />
        ) : (
          <StateView
            kind="blocked"
            title={t('estimate.notReady')}
            reasons={view.readiness.problems.map((pr) => problemText(t, pr))}
          />
        )}
        <p className="staff-request__hint">{t('estimate.readinessHint')}</p>
      </Panel>
      <p>
        <a href={href('/estimates')} onClick={linkClick(go, '/estimates')}>
          {t('estimate.back')}
        </a>
      </p>
    </section>
  )
}

/** A share in basis points as percent text: 1000 is "10", 1050 is "10.50". */
const percentOf = (bps: number) => (bps % 100 === 0 ? String(bps / 100) : toDecimalString(cents(bps)))

function errorTitle(t: T, code: string): string {
  try {
    return t(`error.${code}` as StaffKey)
  } catch {
    return t('estimate.saveFailed')
  }
}

/** One readiness reason in words; a missing value names the setting and the open item that explains it. */
function problemText(t: T, p: Problem): string {
  if (p.code === 'NOT_CONFIGURED' && p.key)
    return t('estimate.problem.notConfigured', {
      setting: codeLabel(t, 'configKey', p.key),
      sources: (p.sourceIds ?? []).join(', ') || '—',
    })
  const text = codeLabel(t, 'estimateProblem', p.code)
  return p.line === undefined ? text : t('estimate.problem.onLine', { n: p.line + 1, problem: text })
}

function NotConfigured({ t }: { t: T }) {
  return <StatusBadge tone="warning">{t('estimate.notConfigured')}</StatusBadge>
}

function Panel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="staff-request__section" aria-labelledby={id}>
      <h2 id={id} className="staff-queue__heading">
        {title}
      </h2>
      {children}
    </section>
  )
}
