// The property record in the staff app (TSK-0045; HH-CRM-02, HH-CRM-03, OWN-DEC-117, S03). The current address with
// its former addresses, the property type and every changeable detail with its source and when it was last
// confirmed, the requests made there with the address each was sent with, the authorized customers, the change
// history, and the protected access codes: masked, revealed only on request for the roles the server allows, shown
// for a short time and never kept anywhere in the browser (no storage, no cache; the value lives only in this
// screen's memory and is dropped when the time is up, the tab is hidden or the screen closes). Staff text is English
// or Spanish (staff catalogs); the server decides every read and write.
import { LABEL_FAMILIES, type StaffKey, type StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type ApiResponse, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string
type StaffRef = { id: string; name: string | null }
type Address = { street: string; unit: string | null; city: string; state: string; zip: string }

export type PropertyDetailView = {
  id: string
  version: number
  address: Address
  addressVersion: number
  propertyType: string
  timeZone: string
  coverage: string
  createdAt: string
  details: {
    detail: string
    value: string | null
    recorded: boolean
    source: string | null
    confirmedAt: string | null
    confirmedBy: StaffRef | null
  }[]
  formerAddresses: {
    addressVersion: number
    address: Address
    source: string
    from: string
    until: string
    recordedBy: StaffRef | null
  }[]
  customers: { id: string; displayName: string; status: string; relationship: string }[]
  requests: {
    id: string
    reference: string
    state: string
    submittedAt: string
    address: Address
    formerAddress: boolean
  }[]
  accessCodes: {
    visible: boolean
    store: 'available' | 'not_configured'
    items: {
      id: string
      version: number
      kind: string
      label: string | null
      source: string
      confirmedAt: string
      confirmedBy: StaffRef | null
      createdAt: string
      createdBy: StaffRef | null
      lastRevealed: { at: string; by: StaffRef | null } | null
      reveals: number
    }[]
    removed: {
      id: string
      kind: string
      label: string | null
      removedAt: string
      removedBy: StaffRef | null
      reason: string
      createdAt: string
    }[]
  }
  history: { at: string; detail: string; action: string; source: string; by: StaffRef | null; reason: string }[]
  actions: { edit: boolean; setAccessCodes: boolean; revealAccessCodes: boolean }
}

type Revealed = { id: string; kind: string; label: string | null; value: string; revealedAt: string; hideAt: string }
type Link = (to: string) => { href: string; onClick: (e: MouseEvent<HTMLAnchorElement>) => void }

const TEXT_DETAILS = LABEL_FAMILIES.propertyDetail.filter((d) => d !== 'address' && d !== 'property_type')
const STAFF_SOURCES = LABEL_FAMILIES.detailSource.filter((s) => s !== 'request_form')

export const formatAddress = (a: Address) =>
  `${[a.street, a.unit].filter(Boolean).join(', ')}, ${a.city}, ${a.state} ${a.zip}`

function linkTo(go: (to: string) => void, href: (to: string) => string): Link {
  return (to) => ({
    href: href(to),
    onClick: (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
      e.preventDefault()
      go(to)
    },
  })
}

/** What a failed write means to the person. */
function writeError(t: T, error: ApiErrorBody): string {
  if (error.code === 'STALE_VERSION') return t('property.stale')
  if (error.code === 'NOT_CONFIGURED') return t('property.codesNotConfigured')
  const codes = error.fieldErrors.map((f) => f.code)
  if (codes.includes('looks_like_access_code')) return t('property.looksLikeCode')
  if (codes.includes('sensitive_content')) return t('customer.noteSensitive')
  if (codes.includes('ACCESS_CODE_REMOVED')) return t('property.codeRemovedAlready')
  if (codes.includes('ACCESS_CODE_UNREADABLE')) return t('property.codeUnreadable')
  if (codes.includes('DETAIL_NOT_RECORDED')) return t('property.detailNotRecorded')
  if (error.code === 'VALIDATION_FAILED') return t('customer.invalid')
  if (error.code === 'FORBIDDEN') return t('error.FORBIDDEN')
  if (error.code === 'RATE_LIMITED') return t('property.revealLimited')
  return t('request.saveFailed')
}

type Write = (
  path: string,
  method: 'POST' | 'PUT',
  body: unknown,
  opts?: { version?: number; idempotent?: boolean },
) => Promise<ApiResponse<unknown>>

/**
 * One write. Writes without a code in their body carry an idempotency key kept until they succeed; the access-code
 * writes carry none (their request hash would be a digest of the code), so their button stays disabled while pending.
 */
function useWrite(fetchImpl: Fetch): Write {
  const keys = useRef(new Map<string, string>())
  return useCallback(
    async (path, method, body, opts = {}) => {
      const idempotent = opts.idempotent ?? true
      const slot = `${method} ${path}`
      const k = idempotent ? (keys.current.get(slot) ?? idempotencyKey()) : undefined
      if (k) keys.current.set(slot, k)
      const r = await call<unknown>(fetchImpl, path, {
        method,
        body,
        headers: {
          ...(k ? { 'idempotency-key': k } : {}),
          ...(opts.version === undefined ? {} : { 'if-match': `"${opts.version}"` }),
        },
      })
      if (r.ok || r.status < 500) keys.current.delete(slot)
      return r
    },
    [fetchImpl],
  )
}

type Ctx = {
  t: T
  view: PropertyDetailView
  when: (iso: string) => string
  write: Write
  reload: () => Promise<void>
  link: Link
  fetchImpl: Fetch
}

function useForm(ctx: Ctx) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(send: () => Promise<ApiResponse<unknown>>, done: () => void) {
    setPending(true)
    const r = await send()
    setPending(false)
    if (!r.ok) {
      setError(writeError(ctx.t, r.error))
      if (r.error.code === 'STALE_VERSION') await ctx.reload()
      return
    }
    setError(null)
    done()
    await ctx.reload()
  }
  return { pending, error, run }
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="staff-request__section" aria-labelledby={id}>
      <h2 id={id} className="staff-queue__heading">
        {title}
      </h2>
      {children}
    </section>
  )
}

const who = (t: T, r: StaffRef | null) => r?.name ?? (r ? t('property.staffMember') : t('property.customer'))

export function PropertyRecord({
  t,
  locale,
  fetchImpl,
  id,
  go,
  href,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  id: string
  go: (to: string) => void
  href: (to: string) => string
}) {
  const [view, setView] = useState<PropertyDetailView | null | undefined>(undefined)
  const write = useWrite(fetchImpl)
  const reload = useCallback(async () => {
    const r = await call<PropertyDetailView>(fetchImpl, `/staff/properties/${encodeURIComponent(id)}`)
    setView(r.ok && typeof r.data?.id === 'string' ? r.data : null)
  }, [fetchImpl, id])
  useEffect(() => {
    void reload()
  }, [reload])
  const link = linkTo(go, href)
  if (view === undefined) return <StateView kind="loading" title={t('common.loading')} />
  if (view === null)
    return (
      <section className="staff-screen">
        <StateView kind="blocked" title={t('record.notFound')} />
        <p>
          <a {...link('/customers')}>{t('customer.back')}</a>
        </p>
      </section>
    )
  const fmt = new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const ctx: Ctx = { t, view, when: (iso) => fmt.format(new Date(iso)), write, reload, link, fetchImpl }
  return (
    <section className="staff-screen staff-request staff-property" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('property.heading', { address: formatAddress(view.address) })}
      </h1>
      <dl className="staff-record">
        <dt>{t('property.type')}</dt>
        <dd>{codeLabel(t, 'propertyType', view.propertyType)}</dd>
        <dt>{t('property.coverage')}</dt>
        <dd>{codeLabel(t, 'coverageResult', view.coverage)}</dd>
        <dt>{t('property.timeZone')}</dt>
        <dd>{view.timeZone}</dd>
        <dt>{t('property.created')}</dt>
        <dd>{ctx.when(view.createdAt)}</dd>
      </dl>
      <AddressSection ctx={ctx} />
      <Details ctx={ctx} />
      {view.accessCodes.visible ? <AccessCodes ctx={ctx} /> : null}
      <Customers ctx={ctx} />
      <Requests ctx={ctx} />
      <History ctx={ctx} />
    </section>
  )
}

function Confirmation({ ctx, detail }: { ctx: Ctx; detail: string }) {
  const { t, view, when } = ctx
  const d = view.details.find((x) => x.detail === detail)
  if (!d?.recorded || !d.confirmedAt) return <p className="staff-request__hint">{t('property.notRecorded')}</p>
  return (
    <p className="staff-request__hint">
      {t('property.lastConfirmed', {
        time: when(d.confirmedAt),
        source: codeLabel(t, 'detailSource', d.source ?? ''),
        name: who(t, d.confirmedBy),
      })}
    </p>
  )
}

function SourceSelect({ t, value, onChange }: { t: T; value: string; onChange: (v: string) => void }) {
  const ids = useId()
  return (
    <div className="staff-queue__select">
      <label htmlFor={`${ids}-source`}>{t('property.source')}</label>
      <select id={`${ids}-source`} value={value} onChange={(e) => onChange(e.target.value)}>
        {STAFF_SOURCES.map((s) => (
          <option key={s} value={s}>
            {codeLabel(t, 'detailSource', s)}
          </option>
        ))}
      </select>
    </div>
  )
}

function ReasonField({ t, value, onChange }: { t: T; value: string; onChange: (v: string) => void }) {
  return (
    <Field
      label={t('customer.reason')}
      hint={t('property.reasonHint')}
      value={value}
      maxLength={1000}
      required
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function FormButtons({ t, pending, onCancel }: { t: T; pending: boolean; onCancel: () => void }) {
  return (
    <div className="hh-button-row">
      <Button type="submit" pending={pending}>
        {t('customer.save')}
      </Button>
      <Button variant="quiet" onClick={onCancel}>
        {t('customer.cancel')}
      </Button>
    </div>
  )
}

/** Confirm unchanged: the detail's source and a reason, recorded with today's date. */
function ConfirmForm({ ctx, detail, label }: { ctx: Ctx; detail: string; label: string }) {
  const { t, view } = ctx
  const [open, setOpen] = useState(false)
  const [source, setSource] = useState<string>(STAFF_SOURCES[0] ?? 'customer_call')
  const [reason, setReason] = useState('')
  const form = useForm(ctx)
  if (!open)
    return (
      <Button variant="quiet" onClick={() => setOpen(true)}>
        {t('property.confirm', { what: label })}
      </Button>
    )
  return (
    <form
      className="staff-request__form"
      aria-label={t('property.confirm', { what: label })}
      onSubmit={(e) => {
        e.preventDefault()
        void form.run(
          () =>
            ctx.write(
              `/staff/properties/${view.id}/details/${detail}/confirm`,
              'POST',
              { source, reason },
              { version: view.version },
            ),
          () => (setOpen(false), setReason('')),
        )
      }}
    >
      <SourceSelect t={t} value={source} onChange={setSource} />
      <ReasonField t={t} value={reason} onChange={setReason} />
      {form.error ? <StateView kind="error" title={form.error} /> : null}
      <FormButtons t={t} pending={form.pending} onCancel={() => setOpen(false)} />
    </form>
  )
}

function AddressSection({ ctx }: { ctx: Ctx }) {
  const { t, view, when } = ctx
  const [open, setOpen] = useState(false)
  const [v, setV] = useState({ ...view.address, unit: view.address.unit ?? '' })
  const [source, setSource] = useState<string>(STAFF_SOURCES[0] ?? 'customer_call')
  const [reason, setReason] = useState('')
  const [typeOpen, setTypeOpen] = useState(false)
  const [type, setType] = useState(view.propertyType)
  const form = useForm(ctx)
  const typeForm = useForm(ctx)
  const ids = useId()
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  return (
    <Section id="property-address" title={t('property.address')}>
      <p>{formatAddress(view.address)}</p>
      <Confirmation ctx={ctx} detail="address" />
      {view.actions.edit && !open ? (
        <div className="hh-button-row">
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {t('property.changeAddress')}
          </Button>
          <ConfirmForm ctx={ctx} detail="address" label={t('property.address')} />
        </div>
      ) : null}
      {open ? (
        <form
          className="staff-request__form"
          aria-label={t('property.changeAddress')}
          onSubmit={(e) => {
            e.preventDefault()
            void form.run(
              () =>
                ctx.write(
                  `/staff/properties/${view.id}/address`,
                  'PUT',
                  { ...v, unit: v.unit.trim() === '' ? null : v.unit, source, reason },
                  { version: view.version },
                ),
              () => (setOpen(false), setReason('')),
            )
          }}
        >
          <p className="staff-request__hint">{t('property.changeAddressHint')}</p>
          <Field label={t('property.street')} value={v.street} maxLength={200} required onChange={set('street')} />
          <Field label={t('property.unit')} value={v.unit} maxLength={50} onChange={set('unit')} />
          <Field label={t('property.city')} value={v.city} maxLength={100} required onChange={set('city')} />
          <Field label={t('property.state')} value={v.state} maxLength={2} required onChange={set('state')} />
          <Field label={t('property.zip')} value={v.zip} maxLength={10} required onChange={set('zip')} />
          <SourceSelect t={t} value={source} onChange={setSource} />
          <ReasonField t={t} value={reason} onChange={setReason} />
          {form.error ? <StateView kind="error" title={form.error} /> : null}
          <FormButtons t={t} pending={form.pending} onCancel={() => setOpen(false)} />
        </form>
      ) : null}
      <h3 className="hh-h5">{t('property.type')}</h3>
      <p>{codeLabel(t, 'propertyType', view.propertyType)}</p>
      <Confirmation ctx={ctx} detail="property_type" />
      {view.actions.edit && !typeOpen ? (
        <div className="hh-button-row">
          <Button variant="secondary" onClick={() => setTypeOpen(true)}>
            {t('property.changeType')}
          </Button>
          <ConfirmForm ctx={ctx} detail="property_type" label={t('property.type')} />
        </div>
      ) : null}
      {typeOpen ? (
        <form
          className="staff-request__form"
          aria-label={t('property.changeType')}
          onSubmit={(e) => {
            e.preventDefault()
            void typeForm.run(
              () =>
                ctx.write(
                  `/staff/properties/${view.id}/type`,
                  'PUT',
                  { propertyType: type, source, reason },
                  { version: view.version },
                ),
              () => (setTypeOpen(false), setReason('')),
            )
          }}
        >
          <div className="staff-queue__select">
            <label htmlFor={`${ids}-type`}>{t('property.type')}</label>
            <select id={`${ids}-type`} value={type} onChange={(e) => setType(e.target.value)}>
              {LABEL_FAMILIES.propertyType.map((p) => (
                <option key={p} value={p}>
                  {codeLabel(t, 'propertyType', p)}
                </option>
              ))}
            </select>
          </div>
          <SourceSelect t={t} value={source} onChange={setSource} />
          <ReasonField t={t} value={reason} onChange={setReason} />
          {typeForm.error ? <StateView kind="error" title={typeForm.error} /> : null}
          <FormButtons t={t} pending={typeForm.pending} onCancel={() => setTypeOpen(false)} />
        </form>
      ) : null}
      <h3 className="hh-h5">{t('property.formerAddresses')}</h3>
      {view.formerAddresses.length ? (
        <ul className="staff-request__list">
          {view.formerAddresses.map((a) => (
            <li key={a.addressVersion}>
              {formatAddress(a.address)}{' '}
              <span className="staff-request__hint">
                {t('property.formerPeriod', { from: when(a.from), until: when(a.until) })}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('property.noFormerAddresses')}</p>
      )}
    </Section>
  )
}

function DetailItem({ ctx, detail }: { ctx: Ctx; detail: string }) {
  const { t, view } = ctx
  const d = view.details.find((x) => x.detail === detail)
  const label = codeLabel(t, 'propertyDetail', detail)
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(d?.value ?? '')
  const [source, setSource] = useState<string>(STAFF_SOURCES[0] ?? 'customer_call')
  const [reason, setReason] = useState('')
  const form = useForm(ctx)
  return (
    <article className="staff-property__detail" aria-label={label}>
      <h3 className="hh-h5">{label}</h3>
      <p>{d?.value ?? t('property.noValue')}</p>
      <Confirmation ctx={ctx} detail={detail} />
      {view.actions.edit && !open ? (
        <div className="hh-button-row">
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {t('property.editDetail', { what: label })}
          </Button>
          {d?.value ? <ConfirmForm ctx={ctx} detail={detail} label={label} /> : null}
        </div>
      ) : null}
      {open ? (
        <form
          className="staff-request__form"
          aria-label={t('property.editDetail', { what: label })}
          onSubmit={(e) => {
            e.preventDefault()
            void form.run(
              () =>
                ctx.write(
                  `/staff/properties/${view.id}/details/${detail}`,
                  'PUT',
                  { value: value.trim() === '' ? null : value, source, reason },
                  { version: view.version },
                ),
              () => (setOpen(false), setReason('')),
            )
          }}
        >
          <Field
            multiline
            label={label}
            hint={t('property.detailHint')}
            value={value}
            maxLength={2000}
            rows={3}
            onChange={(e) => setValue(e.target.value)}
          />
          <SourceSelect t={t} value={source} onChange={setSource} />
          <ReasonField t={t} value={reason} onChange={setReason} />
          {form.error ? <StateView kind="error" title={form.error} /> : null}
          <FormButtons t={t} pending={form.pending} onCancel={() => setOpen(false)} />
        </form>
      ) : null}
    </article>
  )
}

function Details({ ctx }: { ctx: Ctx }) {
  const { t } = ctx
  return (
    <Section id="property-details" title={t('property.details')}>
      <p className="staff-request__hint">{t('property.detailsHint')}</p>
      {TEXT_DETAILS.map((d) => (
        <DetailItem key={d} ctx={ctx} detail={d} />
      ))}
    </Section>
  )
}

type Code = PropertyDetailView['accessCodes']['items'][number]

/** The revealed value: shown until its time is up, the tab is hidden, Hide is pressed or the screen closes. */
function RevealedValue({ t, revealed, onHide }: { t: T; revealed: Revealed; onHide: () => void }) {
  useEffect(() => {
    const left = Math.max(0, new Date(revealed.hideAt).getTime() - Date.now())
    const timer = setTimeout(onHide, left)
    const hidden = () => {
      if (document.visibilityState === 'hidden') onHide()
    }
    document.addEventListener('visibilitychange', hidden)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [revealed, onHide])
  return (
    <div className="staff-property__revealed" role="group" aria-label={t('property.revealedLabel')}>
      <output className="staff-property__code" aria-live="polite">
        {revealed.value}
      </output>
      <p className="staff-request__hint">{t('property.revealedHint')}</p>
      <Button variant="secondary" onClick={onHide}>
        {t('property.hide')}
      </Button>
    </div>
  )
}

function CodeItem({ ctx, code }: { ctx: Ctx; code: Code }) {
  const { t, view, when } = ctx
  const configured = view.accessCodes.store === 'available'
  const [revealed, setRevealed] = useState<Revealed | null>(null)
  const [revealing, setRevealing] = useState(false)
  const [revealError, setRevealError] = useState<string | null>(null)
  const [mode, setMode] = useState<'none' | 'replace' | 'remove' | 'confirm'>('none')
  const [value, setValue] = useState('')
  const [source, setSource] = useState<string>(STAFF_SOURCES[0] ?? 'customer_call')
  const [reason, setReason] = useState('')
  const form = useForm(ctx)
  const hide = useCallback(() => setRevealed(null), [])
  const title = code.label
    ? t('property.codeTitle', { kind: codeLabel(t, 'accessSecretKind', code.kind), label: code.label })
    : codeLabel(t, 'accessSecretKind', code.kind)
  async function reveal() {
    setRevealing(true)
    const r = await call<Revealed>(ctx.fetchImpl, `/staff/properties/${view.id}/access-codes/${code.id}/reveal`, {
      method: 'POST',
      body: {},
    })
    setRevealing(false)
    if (!r.ok)
      return setRevealError(r.error.code === 'FORBIDDEN' ? t('property.revealRefused') : writeError(t, r.error))
    setRevealError(null)
    setRevealed(r.data)
  }
  const close = () => (setMode('none'), setReason(''), setValue(''))
  return (
    <li className="staff-property__code-item" aria-label={title}>
      <h3 className="hh-h5">{title}</h3>
      {revealed ? (
        <RevealedValue t={t} revealed={revealed} onHide={hide} />
      ) : (
        <p className="staff-property__masked">{t('property.masked')}</p>
      )}
      <ul className="staff-queue__facts">
        <li>
          {t('property.lastConfirmed', {
            time: when(code.confirmedAt),
            source: codeLabel(t, 'detailSource', code.source),
            name: who(t, code.confirmedBy),
          })}
        </li>
        <li>
          {code.lastRevealed
            ? t('property.lastRevealed', { time: when(code.lastRevealed.at), name: who(t, code.lastRevealed.by) })
            : t('property.neverRevealed')}
        </li>
      </ul>
      {revealError ? <StateView kind="error" title={revealError} /> : null}
      {mode === 'none' ? (
        <div className="hh-button-row">
          {view.actions.revealAccessCodes && configured && !revealed ? (
            <Button pending={revealing} onClick={() => void reveal()}>
              {t('property.reveal')}
            </Button>
          ) : null}
          {view.actions.setAccessCodes && configured ? (
            <Button variant="secondary" onClick={() => setMode('replace')}>
              {t('property.replaceCode')}
            </Button>
          ) : null}
          {view.actions.setAccessCodes ? (
            <Button variant="quiet" onClick={() => setMode('confirm')}>
              {t('property.confirmCode')}
            </Button>
          ) : null}
          {view.actions.setAccessCodes ? (
            <Button variant="quiet" onClick={() => setMode('remove')}>
              {t('property.removeCode')}
            </Button>
          ) : null}
        </div>
      ) : (
        <form
          className="staff-request__form"
          aria-label={
            mode === 'replace'
              ? t('property.replaceCode')
              : mode === 'remove'
                ? t('property.removeCode')
                : t('property.confirmCode')
          }
          onSubmit={(e) => {
            e.preventDefault()
            const base = `/staff/properties/${view.id}/access-codes/${code.id}`
            void form.run(
              () =>
                mode === 'replace'
                  ? ctx.write(base, 'PUT', { value, source, reason }, { version: code.version, idempotent: false })
                  : mode === 'remove'
                    ? ctx.write(`${base}/remove`, 'POST', { reason }, { version: code.version })
                    : ctx.write(`${base}/confirm`, 'POST', { source, reason }, { version: code.version }),
              close,
            )
          }}
        >
          {mode === 'replace' ? (
            <Field
              label={t('property.codeValue')}
              hint={t('property.codeValueHint')}
              value={value}
              maxLength={200}
              required
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setValue(e.target.value)}
            />
          ) : null}
          {mode === 'remove' ? <p className="staff-request__hint">{t('property.removeHint')}</p> : null}
          {mode !== 'remove' ? <SourceSelect t={t} value={source} onChange={setSource} /> : null}
          <ReasonField t={t} value={reason} onChange={setReason} />
          {form.error ? <StateView kind="error" title={form.error} /> : null}
          <FormButtons t={t} pending={form.pending} onCancel={close} />
        </form>
      )}
    </li>
  )
}

function AddCode({ ctx }: { ctx: Ctx }) {
  const { t, view } = ctx
  const ids = useId()
  const [kind, setKind] = useState<string>(LABEL_FAMILIES.accessSecretKind[0])
  const [label, setLabel] = useState('')
  const [value, setValue] = useState('')
  const [source, setSource] = useState<string>(STAFF_SOURCES[0] ?? 'customer_call')
  const [reason, setReason] = useState('')
  const form = useForm(ctx)
  return (
    <form
      className="staff-request__form"
      aria-label={t('property.addCode')}
      onSubmit={(e) => {
        e.preventDefault()
        if (form.pending) return
        void form.run(
          () =>
            ctx.write(
              `/staff/properties/${view.id}/access-codes`,
              'POST',
              { kind, label: label.trim() === '' ? null : label, value, source, reason },
              { idempotent: false },
            ),
          () => (setLabel(''), setValue(''), setReason('')),
        )
      }}
    >
      <h3 className="hh-h5">{t('property.addCode')}</h3>
      <div className="staff-queue__select">
        <label htmlFor={`${ids}-kind`}>{t('property.codeKind')}</label>
        <select id={`${ids}-kind`} value={kind} onChange={(e) => setKind(e.target.value)}>
          {LABEL_FAMILIES.accessSecretKind.map((k) => (
            <option key={k} value={k}>
              {codeLabel(t, 'accessSecretKind', k)}
            </option>
          ))}
        </select>
      </div>
      <Field
        label={t('property.codeLabel')}
        hint={t('property.codeLabelHint')}
        value={label}
        maxLength={80}
        onChange={(e) => setLabel(e.target.value)}
      />
      <Field
        label={t('property.codeValue')}
        hint={t('property.codeValueHint')}
        value={value}
        maxLength={200}
        required
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
      />
      <SourceSelect t={t} value={source} onChange={setSource} />
      <ReasonField t={t} value={reason} onChange={setReason} />
      {form.error ? <StateView kind="error" title={form.error} /> : null}
      <Button type="submit" variant="secondary" pending={form.pending}>
        {t('property.addCodeSubmit')}
      </Button>
    </form>
  )
}

function AccessCodes({ ctx }: { ctx: Ctx }) {
  const { t, view, when } = ctx
  const codes = view.accessCodes
  return (
    <Section id="property-codes" title={t('property.codes')}>
      <p className="staff-request__hint">{t('property.codesHint')}</p>
      {codes.store === 'not_configured' ? <StateView kind="blocked" title={t('property.codesNotConfigured')} /> : null}
      {codes.items.length ? (
        <ul className="staff-request__list">
          {codes.items.map((c) => (
            <CodeItem key={`${c.id}-${c.version}`} ctx={ctx} code={c} />
          ))}
        </ul>
      ) : (
        <p>{t('property.noCodes')}</p>
      )}
      {view.actions.setAccessCodes && codes.store === 'available' ? <AddCode ctx={ctx} /> : null}
      {codes.removed.length ? (
        <>
          <h3 className="hh-h5">{t('property.removedCodes')}</h3>
          <ul className="staff-request__list">
            {codes.removed.map((c) => (
              <li key={c.id}>
                {t('property.removedEntry', {
                  kind: codeLabel(t, 'accessSecretKind', c.kind),
                  time: when(c.removedAt),
                  name: who(t, c.removedBy),
                  reason: c.reason,
                })}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Section>
  )
}

function Customers({ ctx }: { ctx: Ctx }) {
  const { t, view, link } = ctx
  return (
    <Section id="property-customers" title={t('property.customers')}>
      {view.customers.length ? (
        <ul className="staff-request__list">
          {view.customers.map((c) => (
            <li key={c.id}>
              <a {...link(`/customers/${c.id}`)}>{c.displayName}</a>
              {c.status !== 'active' ? <> {codeLabel(t, 'customerStatus', c.status)}</> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('property.noCustomers')}</p>
      )}
    </Section>
  )
}

function Requests({ ctx }: { ctx: Ctx }) {
  const { t, view, when, link } = ctx
  return (
    <Section id="property-requests" title={t('property.requests')}>
      <p className="staff-request__hint">{t('property.requestsHint')}</p>
      {view.requests.length ? (
        <ul className="staff-request__list">
          {view.requests.map((r) => (
            <li key={r.id}>
              <a {...link(`/requests/${r.id}`)}>{t('record.request.heading', { reference: r.reference })}</a>{' '}
              {codeLabel(t, 'requestState', r.state)} · {when(r.submittedAt)}
              <br />
              {formatAddress(r.address)}{' '}
              {r.formerAddress ? <StatusBadge tone="warning">{t('property.formerAddress')}</StatusBadge> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('property.noRequests')}</p>
      )}
    </Section>
  )
}

function History({ ctx }: { ctx: Ctx }) {
  const { t, view, when } = ctx
  return (
    <Section id="property-history" title={t('property.history')}>
      {view.history.length ? (
        <ul className="staff-request__list">
          {view.history.map((h, i) => (
            <li key={`${h.at}-${i}`}>
              {t('property.historyEntry', {
                detail: codeLabel(t, 'propertyDetail', h.detail),
                action: codeLabel(t, 'propertyChange', h.action),
                time: when(h.at),
                name: who(t, h.by),
                source: codeLabel(t, 'detailSource', h.source),
              })}
              <span className="staff-request__hint"> {t('property.historyReason', { reason: h.reason })}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('property.noHistory')}</p>
      )}
    </Section>
  )
}
