// Write an Estimate: the estimates list, the staff builder and the request record's estimates panel (TSK-0053;
// HH-EST-01, HH-EST-05, HH-EST-11, S04, RULE-MONEY-CENTS, RULE-NO-INVENTED-FACTS).
// - The builder edits one draft version: lines per work package (base scope, alternates and optional add-ons), the
//   customer-facing notes, the one discount category and, for the roles that may see them, internal costs and notes.
// - Every amount on screen comes from the server: a line's amount, the subtotal, the discount row, the total and the
//   deposit are what the last save computed, and an edit that changes them marks them out of date until the next save.
//   Prices are typed as dollars and sent as integer cents, converted from the digits by @handyhub/money (no floating
//   point); an amount the person typed that is not exact cents, a unit price of $0.00 or less and a negative internal
//   cost are refused here before anything is sent, as the server refuses them. A server field error is shown on its
//   field, or listed with the error when no field shows it.
// - A save refused as stale never overwrites the newer version (HH-OPS-03, HH-API-04): the form is rebuilt from the
//   current version and the person's change is only listed beside it, to enter again where it still applies.
// - The issuer name, mailing address, validity and terms come from configuration. A missing value is shown as NOT
//   CONFIGURED, never filled in; the mailing-address line is left out while it is missing. The publish readiness lists
//   every reason the version cannot be published yet. Publishing itself is a later step (TSK-0055).
// - Upload an Estimate (TSK-0054; HH-EST-11): the estimator uploads the PDF or Word document, opens it, enters the
//   amounts the document states as lines (the same record and server totals as a written estimate; nothing is read
//   from the document) and ticks that the document and the amounts agree. A Word document needs the PDF of the same
//   document ("PDF required"): no converter pretends to make one. Every version has a customer PDF preview, generated
//   on the server.
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { cents, centsFromDecimal, formatUsd, MoneyError, toDecimalString } from '@handyhub/money'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react'
import { call, idempotencyKey, upload, type ApiErrorBody, type Fetch } from './api'
import { ConflictBanner, conflictOf, type Conflict } from './ConflictBanner'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string
/** The builder's translator also formats dates (the staff translator's ICU date and time arguments). */
type TD = (key: StaffKey, values?: Record<string, string | number | Date>) => string
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

const PDF = 'application/pdf'
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
type EstimateDocument = {
  id: string
  role: 'original' | 'customer_pdf'
  source: string
  contentType: string
  byteSize: number
  sha256: string
  state: 'quarantined' | 'ready' | 'rejected' | 'replaced'
  rejectionReason: string | null
  uploadedAt: string
}
/** An uploaded version's documents (TSK-0054): the private original, the customer PDF and the agree-confirmation. */
export type DocumentsView = {
  original: EstimateDocument | null
  customerPdf: EstimateDocument | null
  pdfRequired: boolean
  agreement: {
    confirmedBy: { id: string; name: string | null }
    confirmedAt: string
    documentId: string
    current: boolean
  } | null
  maxFileBytes: number | null
  types: string[]
}

export type BuilderView = {
  id: string
  estimateId: string
  estimateNumber: string
  version: number
  state: string
  rowVersion: number
  authoringMethod: 'written' | 'uploaded'
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
  documents: DocumentsView | null
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
  async function startEstimate(method: 'written' | 'uploaded') {
    setPending(true)
    key.current = key.current ?? idempotencyKey()
    const r = await call<{ versionId: string }>(
      fetchImpl,
      `/staff/projects/${encodeURIComponent(projectId)}/${method === 'written' ? 'estimates' : 'uploaded-estimates'}`,
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
          <div className="hh-button-row">
            <Button pending={pending} onClick={() => void startEstimate('written')}>
              {t('estimates.write')}
            </Button>
            <Button variant="secondary" pending={pending} onClick={() => void startEstimate('uploaded')}>
              {t('estimates.upload')}
            </Button>
          </div>
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

/** The editable fields of a line, labelled; the last three are internal (staff only, HH-EST-03). */
const LINE_FIELDS = [
  ['kind', 'estimate.line.kind'],
  ['description', 'estimate.line.description'],
  ['quantity', 'estimate.line.quantity'],
  ['unit', 'estimate.line.unit'],
  ['quantitySource', 'estimate.line.source'],
  ['price', 'estimate.line.price'],
  ['material', 'estimate.line.material'],
  ['labor', 'estimate.line.labor'],
  ['costNote', 'estimate.line.costNote'],
] as const satisfies readonly (readonly [keyof LineDraft, StaffKey])[]
type LineField = (typeof LINE_FIELDS)[number][0]
const INTERNAL_LINE_FIELDS: readonly LineField[] = ['material', 'labor', 'costNote']
const lineFields = (internal: boolean) => LINE_FIELDS.filter(([f]) => internal || !INTERNAL_LINE_FIELDS.includes(f))

/**
 * Where a server field error is shown: the path of a line field ("lines[2].internalCost.laborCostCents") names its
 * input; an error on the line itself (its id or work package) is shown on the line. Anything else keeps its path and,
 * when no field shows it, is listed with the error (never lost).
 */
const SERVER_LINE_FIELD: Record<string, string> = {
  kind: 'kind',
  description: 'description',
  quantity: 'quantity',
  unit: 'unit',
  quantitySource: 'quantitySource',
  unitPriceCents: 'price',
  'internalCost.materialCostCents': 'material',
  'internalCost.laborCostCents': 'labor',
  'internalCost.note': 'costNote',
}

/** Typed dollars to integer cents under the server's rule for the field (model.ts): '' is null (not written yet). */
type Typed =
  { ok: true; value: number | null } | { ok: false; code: 'NOT_INTEGER_CENTS' | 'NOT_POSITIVE' | 'NEGATIVE_AMOUNT' }
function typedCents(text: string, rule: 'positive' | 'non_negative'): Typed {
  const v = toCents(text)
  if (!v.ok) return { ok: false, code: 'NOT_INTEGER_CENTS' }
  if (v.value === null) return v
  // A unit price is above $0.00; an internal cost is $0.00 or more (integer comparisons, RULE-MONEY-CENTS).
  if (rule === 'positive' ? v.value <= 0 : v.value < 0)
    return { ok: false, code: rule === 'positive' ? 'NOT_POSITIVE' : 'NEGATIVE_AMOUNT' }
  return v
}

/** True when the line's amount (or whether it counts as an option) may differ from the one last saved. */
function amountChanged(l: LineDraft, saved: LineDraft | undefined): boolean {
  return !saved || saved.kind !== l.kind || saved.quantity !== l.quantity || saved.price !== l.price
}

type Unsaved = { base: FormState; mine: FormState }
type UnsavedItem = { heading: string; details: string[] }

/**
 * The person's change that a newer version refused (HH-OPS-03): what they added, changed or removed compared with the
 * version they were editing. It is only shown, never sent: the form holds the current version.
 */
function unsavedItems(t: T, view: BuilderView, { base, mine }: Unsaved): UnsavedItem[] {
  const internal = view.internal !== null
  const empty = t('conflict.empty')
  const shown = (f: LineField, v: string) =>
    v === ''
      ? f === 'quantitySource'
        ? t('estimate.line.sourceUnknown')
        : empty
      : f === 'kind'
        ? codeLabel(t, 'estimateLineKind', v)
        : f === 'quantitySource'
          ? codeLabel(t, 'quantitySource', v)
          : v
  const pair = (label: StaffKey, value: string) => `${t(label)}: ${value}`
  const packageName = (id: string) => {
    const code = view.workPackages.find((p) => p.id === id)?.serviceCode
    return code ? codeLabel(t, 'service', code) : t('estimate.generalLines')
  }
  const before = new Map(base.lines.flatMap((l) => (l.id ? [[l.id, l] as const] : [])))
  const items: UnsavedItem[] = []
  for (const l of mine.lines) {
    const was = l.id ? before.get(l.id) : undefined
    if (!was) {
      const details = lineFields(internal)
        .filter(([f]) => l[f] !== '')
        .map(([f, label]) => pair(label, shown(f, l[f])))
      items.push({ heading: t('estimate.unsaved.added', { group: packageName(l.workPackageId) }), details })
      continue
    }
    const details = lineFields(internal)
      .filter(([f]) => l[f] !== was[f])
      .map(([f, label]) => pair(label, shown(f, l[f])))
    if (details.length)
      items.push({
        heading: t('estimate.unsaved.changed', { description: was.description || t('estimate.noDescription') }),
        details,
      })
  }
  const kept = new Set(mine.lines.map((l) => l.id))
  for (const l of base.lines)
    if (l.id && !kept.has(l.id))
      items.push({
        heading: t('estimate.unsaved.removed', { description: l.description || t('estimate.noDescription') }),
        details: [],
      })
  const other: string[] = []
  for (const k of TEXT_LISTS)
    if (mine.texts[k] !== base.texts[k])
      other.push(
        pair(
          TEXT_LABELS[k],
          mine.texts[k]
            .split('\n')
            .filter((s) => s.trim() !== '')
            .join('; ') || empty,
        ),
      )
  if (mine.discountCategory !== base.discountCategory)
    other.push(
      pair(
        'estimate.discountCategory',
        mine.discountCategory ? codeLabel(t, 'discountCategory', mine.discountCategory) : t('estimate.discountNone'),
      ),
    )
  if (internal && mine.markup !== base.markup) other.push(pair('estimate.markup', mine.markup || empty))
  if (internal && mine.notes !== base.notes) other.push(pair('estimate.estimatorNotes', mine.notes || empty))
  if (other.length) items.push({ heading: t('estimate.unsaved.other'), details: other })
  return items
}

/** The staff builder of one estimate version. */
export function EstimateBuilder({ t, fetchImpl, id, go, href }: { t: TD; fetchImpl: Fetch; id: string } & Nav) {
  const ids = useId()
  const [view, setView] = useState<BuilderView | null | undefined>(undefined)
  const [form, setForm] = useState<FormState | null>(null)
  /** The form as the server last gave it: what is saved, to tell what the person changed since. */
  const [base, setBase] = useState<FormState | null>(null)
  const [pending, setPending] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** A refused stale save, with the change the person tried to save and the version it was based on. */
  const [conflict, setConflict] = useState<(Unsaved & { conflict: Conflict }) | null>(null)
  /** That change, shown next to the current version after "Review and redo my change"; never sent. */
  const [unsaved, setUnsaved] = useState<Unsaved | null>(null)
  /** Field problems by line key and field name, or by a top-level field name. */
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const key = useRef<string | null>(null)

  /** Shows a version from the server; the form is always rebuilt from it, so it never keeps outdated lines. */
  const show = useCallback((next: BuilderView) => {
    const f = formOf(next)
    setView(next)
    setForm(f)
    setBase(f)
  }, [])
  /**
   * Loads the version. keepForm (the document poll, TSK-0054) refreshes the view only and keeps the form as typed;
   * every other load rebuilds the form from the server.
   */
  const load = useCallback(
    async (keepForm = false) => {
      const r = await call<BuilderView>(fetchImpl, `/staff/estimate-versions/${encodeURIComponent(id)}`)
      const next = r.ok && typeof r.data?.estimateNumber === 'string' ? r.data : null
      if (!next) setView(null)
      else if (keepForm) setView(next)
      else show(next)
    },
    [fetchImpl, id, show],
  )
  useEffect(() => {
    void load()
  }, [load])
  // A document in quarantine is checked by the server's job worker: look again shortly, keeping the form as typed.
  const processing = [view?.documents?.original, view?.documents?.customerPdf].some((d) => d?.state === 'quarantined')
  useEffect(() => {
    if (!processing) return
    const timer = setTimeout(() => void load(true), 1500)
    return () => clearTimeout(timer)
  }, [processing, load, view])

  if (view === undefined) return <StateView kind="loading" title={t('common.loading')} />
  if (view === null || form === null || base === null)
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
  /** Every edit: the "saved" message no longer describes the form. */
  const edit = (next: FormState) => {
    setForm(next)
    setSaved(false)
  }
  const setLine = (k: string, patch: Partial<LineDraft>) =>
    edit({ ...form, lines: form.lines.map((l) => (l.key === k ? { ...l, ...patch } : l)) })
  const groups = groupsOf(view, form.lines)
  const ordered = groups.flatMap((g) => g.lines)
  const position = new Map(ordered.map((l, i) => [l.key, i + 1]))
  const savedAmount = new Map(view.lines.map((l) => [l.id, l.amountCents]))
  const savedLine = new Map(base.lines.flatMap((l) => (l.id ? [[l.id, l] as const] : [])))
  const lineOutdated = (l: LineDraft) => amountChanged(l, l.id ? savedLine.get(l.id) : undefined)
  // The amounts and totals on screen are the last save's; an edit that changes them marks them out of date.
  const totalsOutdated =
    form.lines.some(lineOutdated) ||
    base.lines.some((b) => !form.lines.some((l) => l.id === b.id)) ||
    form.discountCategory !== base.discountCategory

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!form || !view || !base) return
    const errors: Record<string, string> = {}
    const message = (r: Typed) =>
      r.ok
        ? ''
        : r.code === 'NOT_INTEGER_CENTS'
          ? t('estimate.error.amount')
          : codeLabel(t, 'estimateFieldError', r.code)
    const priced = ordered.map((l) => {
      const price = typedCents(l.price, 'positive')
      const material = typedCents(l.material, 'non_negative')
      const labor = typedCents(l.labor, 'non_negative')
      if (!price.ok) errors[`${l.key}.price`] = message(price)
      if (!material.ok) errors[`${l.key}.material`] = message(material)
      if (!labor.ok) errors[`${l.key}.labor`] = message(labor)
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
      show(r.data)
      setConflict(null)
      setUnsaved(null)
      setSaved(true)
      return
    }
    const c = conflictOf(r.error)
    // Nothing was saved: keep the person's change to show it next to the current version, never to send it again.
    if (c) return setConflict({ conflict: c, base, mine: form })
    setFieldErrors(serverErrors(r.error, ordered))
    setError(r.error.code)
  }

  function serverErrors(err: ApiErrorBody, sent: readonly LineDraft[]): Record<string, string> {
    const out: Record<string, string> = {}
    const add = (k: string, text: string) => (out[k] = out[k] && out[k] !== text ? `${out[k]} ${text}` : text)
    for (const f of err.fieldErrors) {
      const text = codeLabel(t, 'estimateFieldError', f.code)
      const m = /^lines\[(\d+)\]\.(.+)$/.exec(f.field)
      const line = m ? sent[Number(m[1])] : undefined
      if (m && line) {
        add(`${line.key}.${SERVER_LINE_FIELD[m[2] as string] ?? 'line'}`, text)
        continue
      }
      const list = /^texts\.(\w+)/.exec(f.field)
      add(list ? `texts.${list[1]}` : f.field, text)
    }
    return out
  }

  // Every key a field below shows; any other error is listed with the error itself.
  const shownKeys = new Set<string>([
    'lines',
    'discountCategory',
    ...TEXT_LISTS.map((k) => `texts.${k}`),
    ...(view.internal ? ['internal.markupAssumptions', 'internal.estimatorNotes'] : []),
    ...form.lines.flatMap((l) =>
      ['line', ...lineFields(view.internal !== null).map(([f]) => f)].map((f) => `${l.key}.${f}`),
    ),
  ])
  const unshown = [...new Set(Object.entries(fieldErrors).flatMap(([k, v]) => (shownKeys.has(k) ? [] : [v])))]
  const highlighted = Object.keys(fieldErrors).some((k) => shownKeys.has(k))

  const p = view.property
  const err = (k: string) => (fieldErrors[k] === undefined ? {} : { error: fieldErrors[k] })
  /** A select's error, linked to it for assistive technology. */
  const selectError = (k: string) =>
    fieldErrors[k] === undefined ? null : (
      <p id={`${ids}-${k}-error`} className="hh-field__error">
        {fieldErrors[k]}
      </p>
    )
  const selectErrorProps = (k: string) =>
    fieldErrors[k] === undefined ? {} : { 'aria-invalid': true, 'aria-describedby': `${ids}-${k}-error` }
  const categories = view.document.discountCategories
  const options = view.lines.filter((l) => l.kind !== 'base')
  const unsavedList = unsaved ? unsavedItems(t, view, unsaved) : []

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
        <dd>{codeLabel(t, 'authoringMethod', view.authoringMethod)}</dd>
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
        <p>
          <a
            href={`/api/v1/staff/estimate-versions/${encodeURIComponent(view.id)}/customer-pdf`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('estimate.customerPdf')}
          </a>
        </p>
        <p className="staff-request__hint">{t('estimate.customerPdfHint')}</p>
      </Panel>

      {view.documents ? (
        <DocumentsPanel
          t={t}
          fetchImpl={fetchImpl}
          view={view}
          documents={view.documents}
          onView={(next) => (setView(next), setSaved(false))}
        />
      ) : null}

      {!editable ? <StateView kind="blocked" title={t('estimate.notEditable')} /> : null}

      {unsaved ? (
        <div data-testid="estimate-unsaved">
          <StateView
            kind="stale"
            title={t('estimate.unsaved.title')}
            action={
              <Button variant="secondary" onClick={() => setUnsaved(null)}>
                {t('estimate.unsaved.dismiss')}
              </Button>
            }
          >
            <p>{t('estimate.unsaved.body')}</p>
            {unsavedList.length ? (
              <ul className="staff-request__list">
                {unsavedList.map((item, i) => (
                  <li key={i}>
                    <strong>{item.heading}</strong>
                    {item.details.length ? <> {item.details.join('; ')}</> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t('estimate.unsaved.none')}</p>
            )}
          </StateView>
        </div>
      ) : null}

      <form className="staff-request__form" onSubmit={(e) => void submit(e)} aria-label={t('estimate.form')} noValidate>
        <Panel id={`${ids}-lines`} title={t('estimate.lines')}>
          <p className="staff-request__hint">
            {t(view.authoringMethod === 'uploaded' ? 'estimate.linesHintUploaded' : 'estimate.linesHint')}
          </p>
          {fieldErrors['lines'] ? <p className="hh-field__error">{fieldErrors['lines']}</p> : null}
          {groups.map((g) => (
            <fieldset key={g.id || 'general'} className="staff-request__check">
              <legend>{g.code ? codeLabel(t, 'service', g.code) : t('estimate.generalLines')}</legend>
              {g.lines.length === 0 ? <p className="staff-request__hint">{t('estimate.noLines')}</p> : null}
              {g.lines.map((l) => (
                <fieldset key={l.key} className="staff-estimate__line">
                  <legend>{t('estimate.lineN', { n: position.get(l.key) ?? 0 })}</legend>
                  {fieldErrors[`${l.key}.line`] ? (
                    <p className="hh-field__error">{fieldErrors[`${l.key}.line`]}</p>
                  ) : null}
                  <div className="staff-queue__select">
                    <label htmlFor={`${ids}-${l.key}-kind`}>{t('estimate.line.kind')}</label>
                    <select
                      id={`${ids}-${l.key}-kind`}
                      value={l.kind}
                      disabled={!editable}
                      onChange={(e) => setLine(l.key, { kind: e.target.value })}
                      {...selectErrorProps(`${l.key}.kind`)}
                    >
                      {LINE_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {codeLabel(t, 'estimateLineKind', k)}
                        </option>
                      ))}
                    </select>
                    {selectError(`${l.key}.kind`)}
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
                        {...selectErrorProps(`${l.key}.quantitySource`)}
                      >
                        <option value="">{t('estimate.line.sourceUnknown')}</option>
                        {QUANTITY_SOURCES.map((s) => (
                          <option key={s} value={s}>
                            {codeLabel(t, 'quantitySource', s)}
                          </option>
                        ))}
                      </select>
                      {selectError(`${l.key}.quantitySource`)}
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
                  <p className="staff-estimate__amount" data-outdated={(l.id && lineOutdated(l)) || undefined}>
                    {l.id && savedAmount.get(l.id) != null
                      ? lineOutdated(l)
                        ? t('estimate.line.amountOutdated', { amount: usd(savedAmount.get(l.id) as number) })
                        : t('estimate.line.amount', { amount: usd(savedAmount.get(l.id) as number) })
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
                        {...err(`${l.key}.costNote`)}
                      />
                    </div>
                  ) : null}
                  {editable ? (
                    <Button
                      variant="quiet"
                      onClick={() => edit({ ...form, lines: form.lines.filter((x) => x.key !== l.key) })}
                    >
                      {t('estimate.removeLine', { n: position.get(l.key) ?? 0 })}
                    </Button>
                  ) : null}
                </fieldset>
              ))}
              {editable ? (
                <Button variant="secondary" onClick={() => edit({ ...form, lines: [...form.lines, blankLine(g.id)] })}>
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
              onChange={(e) => edit({ ...form, texts: { ...form.texts, [k]: e.target.value } })}
              {...err(`texts.${k}`)}
            />
          ))}
        </Panel>

        <Panel id={`${ids}-discount`} title={t('estimate.discount')}>
          {categories === null ? (
            <div data-testid="estimate-discount-not-configured">
              <p>
                <NotConfigured t={t} />
              </p>
              {form.discountCategory !== '' ? (
                // A discount saved while the rule was configured: it is named, never dropped silently, and the
                // person may remove it so the draft can be saved again (HH-EST-05).
                <>
                  <p>
                    {t('estimate.discountStored', {
                      category: codeLabel(t, 'discountCategory', form.discountCategory),
                    })}
                  </p>
                  <p className="staff-request__hint">{t('estimate.discountStoredBlocked')}</p>
                  {editable ? (
                    <Button variant="secondary" onClick={() => edit({ ...form, discountCategory: '' })}>
                      {t('estimate.discountRemove')}
                    </Button>
                  ) : null}
                </>
              ) : base.discountCategory !== '' ? (
                <p>{t('estimate.discountRemoved')}</p>
              ) : null}
              {fieldErrors['discountCategory'] ? (
                <p className="hh-field__error">{fieldErrors['discountCategory']}</p>
              ) : null}
            </div>
          ) : (
            <div className="staff-queue__select">
              <label htmlFor={`${ids}-discount-category`}>{t('estimate.discountCategory')}</label>
              <select
                id={`${ids}-discount-category`}
                value={form.discountCategory}
                disabled={!editable}
                onChange={(e) => edit({ ...form, discountCategory: e.target.value })}
                {...selectErrorProps('discountCategory')}
              >
                <option value="">{t('estimate.discountNone')}</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {codeLabel(t, 'discountCategory', c)}
                  </option>
                ))}
                {form.discountCategory !== '' && !categories.includes(form.discountCategory) ? (
                  <option value={form.discountCategory}>
                    {t('estimate.discountNotInRule', {
                      category: codeLabel(t, 'discountCategory', form.discountCategory),
                    })}
                  </option>
                ) : null}
              </select>
              {selectError('discountCategory')}
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
              onChange={(e) => edit({ ...form, markup: e.target.value })}
              {...err('internal.markupAssumptions')}
            />
            <Field
              multiline
              label={t('estimate.estimatorNotes')}
              value={form.notes}
              maxLength={5000}
              readOnly={!editable}
              onChange={(e) => edit({ ...form, notes: e.target.value })}
              {...err('internal.estimatorNotes')}
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
          <StateView kind="error" title={errorTitle(t, error)} reasons={unshown}>
            {highlighted ? <p>{t('estimate.fixFields')}</p> : null}
          </StateView>
        ) : Object.keys(fieldErrors).length ? (
          <StateView kind="error" title={t('estimate.fixFields')} />
        ) : null}
        {conflict ? (
          <ConflictBanner
            t={t}
            conflict={{
              ...conflict.conflict,
              values: { version: conflict.conflict.version, ...conflict.conflict.values },
            }}
            fields={[{ name: 'version', label: t('estimate.version'), yours: view.rowVersion }]}
            // Both rebuild the form from the current version: the refused line list is never sent again. Redo also
            // lists the person's change next to it, to enter again where it still applies (HH-OPS-03, HH-API-04).
            onUseCurrent={() => void load().then(() => (setUnsaved(null), setConflict(null)))}
            onRedo={() =>
              void load().then(() => (setUnsaved({ base: conflict.base, mine: conflict.mine }), setConflict(null)))
            }
          />
        ) : null}
      </form>

      <Panel id={`${ids}-totals`} title={t('estimate.totals')}>
        {view.totals !== null && totalsOutdated ? (
          <StateView kind="stale" title={t('estimate.totalsOutdated')} />
        ) : null}
        {view.totals === null ? (
          <p>{t('estimate.totalsPending')}</p>
        ) : (
          <dl className="staff-record" data-testid="estimate-totals" data-outdated={totalsOutdated || undefined}>
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

/** The type a file declares: what the browser says, or its extension; the server checks the real content anyway. */
function declaredType(file: File): string {
  if (file.type === PDF || file.type === DOCX) return file.type
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return PDF
  if (name.endsWith('.docx')) return DOCX
  return file.type || 'application/octet-stream'
}

/** A refused upload or confirmation in words: the content problem, the field problem, or the error itself. */
function documentErrorText(t: T, err: ApiErrorBody): string {
  const f = err.fieldErrors[0]
  if (f) return codeLabel(t, f.field === 'body' ? 'estimateDocumentRejection' : 'estimateFieldError', f.code)
  return errorTitle(t, err.code)
}

const megabytes = (bytes: number) => String(Math.floor(bytes / (1024 * 1024)))
const kilobytes = (bytes: number) => String(Math.max(1, Math.round(bytes / 1024)))

function DocumentFacts({ t, versionId, doc }: { t: T; versionId: string; doc: EstimateDocument }) {
  const tone = doc.state === 'ready' ? 'success' : doc.state === 'rejected' ? 'danger' : 'info'
  return (
    <dl className="staff-record" data-testid={`estimate-${doc.role === 'original' ? 'original' : 'customer-pdf'}`}>
      <dt>{t('estimate.upload.type')}</dt>
      <dd>
        {t(doc.contentType === DOCX ? 'estimate.upload.word' : 'estimate.upload.pdf')},{' '}
        {t('estimate.upload.size', { kb: kilobytes(doc.byteSize) })}
      </dd>
      <dt>{t('estimate.upload.state')}</dt>
      <dd>
        <StatusBadge tone={tone}>{codeLabel(t, 'estimateDocumentState', doc.state)}</StatusBadge>
        {doc.rejectionReason ? ` ${codeLabel(t, 'estimateDocumentRejection', doc.rejectionReason)}` : null}
      </dd>
      <dt>{t('estimate.upload.hash')}</dt>
      <dd>
        <code className="staff-estimate__hash">{doc.sha256}</code>
      </dd>
      {doc.state === 'ready' ? (
        <>
          <dt>{t('estimate.upload.file')}</dt>
          <dd>
            <a
              href={`/api/v1/staff/estimate-versions/${encodeURIComponent(versionId)}/documents/${encodeURIComponent(doc.id)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t(doc.role === 'original' ? 'estimate.upload.openOriginal' : 'estimate.upload.openCustomerPdf')}
            </a>
          </dd>
        </>
      ) : null}
    </dl>
  )
}

/**
 * Upload an Estimate (TSK-0054; HH-EST-11): the document, the PDF a Word document needs, and the confirmation that the
 * document and the structured amounts agree. Every change answers with the builder view.
 */
function DocumentsPanel({
  t,
  fetchImpl,
  view,
  documents: docs,
  onView,
}: {
  t: TD
  fetchImpl: Fetch
  view: BuilderView
  documents: DocumentsView
  onView: (next: BuilderView) => void
}) {
  const ids = useId()
  const [pending, setPending] = useState<'original' | 'customer_pdf' | 'agreement' | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** The box as the person just set it, while the server records it; then the server's answer shows again. */
  const [intended, setIntended] = useState<boolean | null>(null)
  const original = useRef<HTMLInputElement>(null)
  const pdf = useRef<HTMLInputElement>(null)
  const agreementKey = useRef<string | null>(null)
  const editable = view.canEdit
  const base = `/staff/estimate-versions/${encodeURIComponent(view.id)}`

  async function send(role: 'original' | 'customer_pdf', input: HTMLInputElement | null) {
    const file = input?.files?.[0]
    if (!file) return setError(t('estimate.upload.chooseFile'))
    setPending(role)
    setError(null)
    const r = await upload<BuilderView>(
      fetchImpl,
      `${base}/documents/${role === 'original' ? 'original' : 'customer-pdf'}`,
      file,
      declaredType(file),
      { 'if-match': `"${view.rowVersion}"` },
    )
    setPending(null)
    if (!r.ok) return setError(documentErrorText(t, r.error))
    if (input) input.value = ''
    onView(r.data)
  }

  async function agree(confirmed: boolean) {
    setPending('agreement')
    setIntended(confirmed)
    setError(null)
    agreementKey.current = agreementKey.current ?? idempotencyKey()
    const r = await call<BuilderView>(fetchImpl, `${base}/agreement`, {
      method: 'PUT',
      body: { confirmed },
      headers: { 'idempotency-key': agreementKey.current, 'if-match': `"${view.rowVersion}"` },
    })
    setPending(null)
    setIntended(null)
    if (r.ok || r.status < 500) agreementKey.current = null
    if (!r.ok) return setError(documentErrorText(t, r.error))
    onView(r.data)
  }

  const confirmed = docs.agreement?.current === true
  const canConfirm =
    docs.original?.state === 'ready' && docs.customerPdf?.state === 'ready' && view.totals !== null && editable
  const totals = view.totals
  return (
    <Panel id={`${ids}-upload`} title={t('estimate.upload.title')}>
      <p className="staff-request__hint">
        {docs.maxFileBytes === null ? (
          <NotConfigured t={t} />
        ) : (
          t('estimate.upload.hint', { mb: megabytes(docs.maxFileBytes) })
        )}
      </p>
      <h3>{t('estimate.upload.original')}</h3>
      {docs.original ? (
        <DocumentFacts t={t} versionId={view.id} doc={docs.original} />
      ) : (
        <p>{t('estimate.upload.none')}</p>
      )}
      {editable ? (
        <div className="staff-estimate__upload">
          <label htmlFor={`${ids}-original`}>{t('estimate.upload.chooseOriginal')}</label>
          <input
            id={`${ids}-original`}
            ref={original}
            type="file"
            accept={`.pdf,.docx,${PDF},${DOCX}`}
            disabled={pending !== null}
          />
          <Button
            variant="secondary"
            pending={pending === 'original'}
            onClick={() => void send('original', original.current)}
          >
            {t('estimate.upload.send')}
          </Button>
        </div>
      ) : null}

      {docs.pdfRequired ? (
        <StateView kind="blocked" title={t('estimate.upload.pdfRequired')}>
          <p>{t('estimate.upload.pdfRequiredText')}</p>
        </StateView>
      ) : null}
      {docs.original?.contentType === DOCX || (docs.customerPdf && docs.customerPdf.source === 'supplied') ? (
        <>
          <h3>{t('estimate.upload.customerPdf')}</h3>
          {docs.customerPdf ? (
            <DocumentFacts t={t} versionId={view.id} doc={docs.customerPdf} />
          ) : (
            <p>{t('estimate.upload.noPdf')}</p>
          )}
          {editable ? (
            <div className="staff-estimate__upload">
              <label htmlFor={`${ids}-pdf`}>{t('estimate.upload.choosePdf')}</label>
              <input id={`${ids}-pdf`} ref={pdf} type="file" accept={`.pdf,${PDF}`} disabled={pending !== null} />
              <Button
                variant="secondary"
                pending={pending === 'customer_pdf'}
                onClick={() => void send('customer_pdf', pdf.current)}
              >
                {t('estimate.upload.sendPdf')}
              </Button>
            </div>
          ) : null}
        </>
      ) : docs.customerPdf ? (
        <>
          <h3>{t('estimate.upload.customerPdf')}</h3>
          <p className="staff-request__hint">{t('estimate.upload.copyHint')}</p>
          <DocumentFacts t={t} versionId={view.id} doc={docs.customerPdf} />
        </>
      ) : null}

      <h3>{t('estimate.agreement.title')}</h3>
      <p>
        {totals === null
          ? t('estimate.agreement.amountsPending')
          : t('estimate.agreement.amounts', {
              total: usd(totals.totalCents),
              deposit:
                totals.depositState === 'required' && totals.depositCents !== null
                  ? usd(totals.depositCents)
                  : totals.depositState === 'not_required'
                    ? t('estimate.depositNotRequired')
                    : t('estimate.notConfigured'),
              validity:
                view.document.validityDays === null
                  ? t('estimate.notConfigured')
                  : t('estimate.validityDays', { days: view.document.validityDays }),
            })}
      </p>
      <div className="staff-estimate__agree">
        <input
          id={`${ids}-agree`}
          type="checkbox"
          checked={intended ?? confirmed}
          disabled={pending !== null || !(confirmed ? editable : canConfirm)}
          onChange={(e) => void agree(e.target.checked)}
        />
        <label htmlFor={`${ids}-agree`}>{t('estimate.agreement.label')}</label>
      </div>
      {confirmed && docs.agreement ? (
        <p>
          {t('estimate.agreement.confirmedBy', {
            name: docs.agreement.confirmedBy.name ?? t('queue.unnamed'),
            time: new Date(docs.agreement.confirmedAt),
          })}
        </p>
      ) : null}
      <p className="staff-request__hint">{t('estimate.agreement.hint')}</p>
      {error ? <StateView kind="error" title={error} /> : null}
    </Panel>
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
