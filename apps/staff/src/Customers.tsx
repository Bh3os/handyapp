// Customer records in the staff app (TSK-0044; HH-CRM-01, HH-ID-02, HH-STAFF-05, OWN-DEC-117, S03). The customers
// list with search, and one customer's record: contacts with email and phone verification shown separately, channel
// permissions with their records (opt-outs included), properties, projects and requests, notes with their
// visibility class, possible duplicates (suggestions for review, never merged or linked here) and the activity
// history. Staff text is English or Spanish (staff catalogs); the server decides every read and write and sends only
// what the person's role may see (a restricted note arrives masked).
import { LABEL_FAMILIES, type StaffKey, type StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type MouseEvent, type ReactNode } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string
type StaffRef = { id: string; name: string | null }
type Permission = { state: 'granted' | 'withdrawn' | 'none'; since: string | null }

export type CustomerListItem = {
  id: string
  displayName: string
  status: string
  createdAt: string
  contactName: string | null
  email: string | null
  phone: string | null
  city: string | null
  projects: number
  possibleDuplicates: number | null
}

export type CustomerDetail = {
  id: string
  displayName: string
  status: string
  mergedIntoId: string | null
  provenance: string
  language: string
  createdAt: string
  version: number
  contacts: {
    id: string
    fullName: string
    email: string
    phone: string
    preferredChannel: string
    isPrimary: boolean
    version: number
    verification: { email: string; phone: string }
    permissions: { sms: Permission; marketingEmail: Permission; marketingSms: Permission }
    consentHistory: {
      purpose: string
      channel: string
      granted: boolean
      source: string
      disclosureVersion: string | null
      recordedAt: string
      ownRecord: boolean
    }[]
  }[]
  properties: {
    id: string
    street: string
    unit: string | null
    city: string
    state: string
    zip: string
    propertyType: string
    coverage: string
    relationship: string
  }[]
  projects: {
    id: string
    reference: string
    state: string
    createdAt: string
    requests: { id: string; reference: string; state: string; submittedAt: string }[]
  }[]
  documents: { state: 'not_available' }
  payments: { state: 'not_available' }
  notes: {
    id: string
    source: 'customer' | 'request'
    requestReference: string | null
    visibility: string
    masked: boolean
    body: string | null
    author: StaffRef | null
    createdAt: string
  }[]
  candidates: {
    visible: boolean
    items: {
      id: string
      version: number
      customer: { id: string; displayName: string; status: string }
      reasons: string[]
      status: string
      detectedAt: string
      lastReview: { by: StaffRef | null; reason: string; at: string } | null
    }[]
  }
  timeline: {
    at: string
    kind: string
    actor: { kind: string; name: string | null }
    reference: string | null
    codes: string[]
    channel: string | null
    state: string | null
  }[]
  timelineTruncated: boolean
  actions: {
    edit: boolean
    addNote: boolean
    recordWithdrawal: boolean
    reviewCandidates: boolean
    noteVisibilities: string[]
  }
}

type Page = { items: CustomerListItem[]; nextCursor: string | null }
type Link = (to: string) => { href: string; onClick: (e: MouseEvent<HTMLAnchorElement>) => void }

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

const listPath = (q: string, cursor?: string) => {
  const p = new URLSearchParams()
  if (q) p.set('q', q)
  if (cursor) p.set('cursor', cursor)
  const s = p.toString()
  return s ? `/staff/customers?${s}` : '/staff/customers'
}

export function CustomersScreen({
  t,
  locale,
  fetchImpl,
  go,
  href,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  go: (to: string) => void
  href: (to: string) => string
}) {
  const ids = useId()
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState('')
  const [items, setItems] = useState<CustomerListItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [more, setMore] = useState(false)
  useEffect(() => {
    let live = true
    setStatus('loading')
    void call<Page>(fetchImpl, listPath(q)).then((r) => {
      if (!live) return
      if (!r.ok || !Array.isArray(r.data?.items)) return setStatus('error')
      setItems(r.data.items)
      setCursor(r.data.nextCursor)
      setStatus('ready')
    })
    return () => {
      live = false
    }
  }, [fetchImpl, q])
  async function loadMore() {
    if (!cursor) return
    setMore(true)
    const r = await call<Page>(fetchImpl, listPath(q, cursor))
    setMore(false)
    if (!r.ok) return setStatus('error')
    setItems((current) => [...current, ...r.data.items])
    setCursor(r.data.nextCursor)
  }
  const fmt = new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium' })
  const link = linkTo(go, href)
  return (
    <section className="staff-screen staff-customers" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('nav.customers')}
      </h1>
      <form
        className="staff-queue__filters"
        role="search"
        aria-label={t('customers.search')}
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          setQ(draft.trim())
        }}
      >
        <Field
          label={t('customers.search')}
          hint={t('customers.searchHint')}
          name="q"
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" variant="secondary">
          {t('customers.searchSubmit')}
        </Button>
      </form>
      {status === 'loading' ? (
        <StateView kind="loading" title={t('common.loading')} />
      ) : status === 'error' ? (
        <StateView kind="error" title={t('customers.loadFailed')} />
      ) : items.length === 0 ? (
        <StateView kind="empty" title={t('customers.empty')} />
      ) : (
        <ol className="staff-queue__items">
          {items.map((c) => (
            <li key={c.id} className="staff-queue__item" aria-labelledby={`${ids}-${c.id}`}>
              <div className="staff-queue__head">
                <h2 id={`${ids}-${c.id}`} className="staff-queue__title">
                  {c.displayName}
                </h2>
                {c.status !== 'active' ? <StatusBadge>{codeLabel(t, 'customerStatus', c.status)}</StatusBadge> : null}
                {c.possibleDuplicates ? (
                  <StatusBadge tone="warning">
                    {t('customers.possibleDuplicates', { count: c.possibleDuplicates })}
                  </StatusBadge>
                ) : null}
              </div>
              <ul className="staff-queue__facts">
                {c.contactName && c.contactName !== c.displayName ? <li>{c.contactName}</li> : null}
                {c.email ? <li>{c.email}</li> : null}
                {c.phone ? <li>{c.phone}</li> : null}
                {c.city ? <li>{c.city}</li> : null}
                <li>{t('customers.projects', { count: c.projects })}</li>
                <li>{t('customers.since', { date: fmt.format(new Date(c.createdAt)) })}</li>
              </ul>
              <a className="hh-button staff-queue__action" {...link(`/customers/${c.id}`)}>
                {t('customers.open')}
              </a>
            </li>
          ))}
        </ol>
      )}
      {cursor ? (
        <Button variant="secondary" pending={more} onClick={() => void loadMore()}>
          {t('queue.loadMore')}
        </Button>
      ) : null}
    </section>
  )
}

/** One write, with its idempotency key kept until it succeeds (a retry of the same submission is answered once). */
function useWrite(fetchImpl: Fetch) {
  const keys = useRef(new Map<string, string>())
  return useCallback(
    async (path: string, method: 'POST' | 'PUT', body: unknown, version?: number) => {
      const slot = `${method} ${path}`
      const k = keys.current.get(slot) ?? idempotencyKey()
      keys.current.set(slot, k)
      const r = await call<unknown>(fetchImpl, path, {
        method,
        body,
        headers: { 'idempotency-key': k, ...(version === undefined ? {} : { 'if-match': `"${version}"` }) },
      })
      if (r.ok || r.status < 500) keys.current.delete(slot)
      return r
    },
    [fetchImpl],
  )
}

/** What a failed write means to the person: a stale version, a field the server refused, or another error. */
function writeError(t: T, error: ApiErrorBody): string {
  if (error.code === 'STALE_VERSION') return t('customer.stale')
  const codes = error.fieldErrors.map((f) => f.code)
  if (codes.includes('sensitive_content')) return t('customer.noteSensitive')
  if (codes.includes('sms_opt_in_required')) return t('customer.textNeedsOptIn')
  if (codes.includes('CUSTOMER_MERGED')) return t('customer.merged')
  if (codes.includes('CANDIDATE_NOT_OPEN')) return t('customer.candidateNotOpen')
  if (error.code === 'VALIDATION_FAILED') return t('customer.invalid')
  if (error.code === 'FORBIDDEN') return t('shell.notAllowed')
  return t('request.saveFailed')
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

type Ctx = {
  t: T
  view: CustomerDetail
  when: (iso: string) => string
  write: ReturnType<typeof useWrite>
  reload: () => Promise<void>
  link: Link
}

export function CustomerRecord({
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
  const [view, setView] = useState<CustomerDetail | null | undefined>(undefined)
  const write = useWrite(fetchImpl)
  const reload = useCallback(async () => {
    const r = await call<CustomerDetail>(fetchImpl, `/staff/customers/${encodeURIComponent(id)}`)
    setView(r.ok && typeof r.data?.id === 'string' ? r.data : null)
  }, [fetchImpl, id])
  useEffect(() => {
    void reload()
  }, [reload])
  const link = linkTo(go, href)
  const back = <a {...link('/customers')}>{t('customer.back')}</a>
  if (view === undefined) return <StateView kind="loading" title={t('common.loading')} />
  if (view === null)
    return (
      <section className="staff-screen">
        <StateView kind="blocked" title={t('record.notFound')} />
        <p>{back}</p>
      </section>
    )
  const fmt = new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
  const ctx: Ctx = { t, view, when: (iso) => fmt.format(new Date(iso)), write, reload, link }
  return (
    <section className="staff-screen staff-request staff-customer" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('customer.heading', { name: view.displayName })}
      </h1>
      <dl className="staff-record">
        <dt>{t('customer.status')}</dt>
        <dd>
          <StatusBadge>{codeLabel(t, 'customerStatus', view.status)}</StatusBadge>
        </dd>
        <dt>{t('customer.provenance')}</dt>
        <dd>{codeLabel(t, 'customerProvenance', view.provenance)}</dd>
        <dt>{t('customer.language')}</dt>
        <dd>{t('customer.languageEnglish')}</dd>
        <dt>{t('customer.created')}</dt>
        <dd>{ctx.when(view.createdAt)}</dd>
        <dt>{t('customer.id')}</dt>
        <dd>
          <code>{view.id}</code>
        </dd>
      </dl>
      {view.status === 'merged' ? <StateView kind="blocked" title={t('customer.merged')} /> : null}
      {view.actions.edit ? <EditName ctx={ctx} /> : null}
      <Contacts ctx={ctx} />
      <Properties ctx={ctx} />
      <Projects ctx={ctx} />
      <Section id="customer-documents" title={t('customer.documents')}>
        <p>{t('customer.notAvailable')}</p>
      </Section>
      <Section id="customer-payments" title={t('customer.payments')}>
        <p>{t('customer.notAvailable')}</p>
      </Section>
      {view.candidates.visible ? <Candidates ctx={ctx} /> : null}
      <Notes ctx={ctx} />
      <Timeline ctx={ctx} />
      <p>{back}</p>
    </section>
  )
}

function useForm(ctx: Ctx) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(send: () => ReturnType<Ctx['write']>, done: () => void) {
    setPending(true)
    const r = await send()
    setPending(false)
    if (!r.ok) return setError(writeError(ctx.t, r.error))
    setError(null)
    done()
    await ctx.reload()
  }
  return { pending, error, run }
}

function EditName({ ctx }: { ctx: Ctx }) {
  const { t, view } = ctx
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(view.displayName)
  const [reason, setReason] = useState('')
  const form = useForm(ctx)
  if (!open)
    return (
      <p>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t('customer.editName')}
        </Button>
      </p>
    )
  return (
    <form
      className="staff-request__form"
      onSubmit={(e) => {
        e.preventDefault()
        void form.run(
          () => ctx.write(`/staff/customers/${view.id}`, 'PUT', { displayName: name, reason }, view.version),
          () => (setOpen(false), setReason('')),
        )
      }}
    >
      <Field
        label={t('customer.displayName')}
        value={name}
        maxLength={200}
        required
        onChange={(e) => setName(e.target.value)}
      />
      <Field
        label={t('customer.reason')}
        hint={t('customer.reasonHint')}
        value={reason}
        maxLength={1000}
        required
        onChange={(e) => setReason(e.target.value)}
      />
      {form.error ? <StateView kind="error" title={form.error} /> : null}
      <div className="hh-button-row">
        <Button type="submit" pending={form.pending}>
          {t('customer.save')}
        </Button>
        <Button variant="quiet" onClick={() => setOpen(false)}>
          {t('customer.cancel')}
        </Button>
      </div>
    </form>
  )
}

const permissionText = (t: T, when: (iso: string) => string, p: Permission) =>
  p.since
    ? t('customer.permissionSince', { state: codeLabel(t, 'consentState', p.state), time: when(p.since) })
    : codeLabel(t, 'consentState', p.state)

function Contacts({ ctx }: { ctx: Ctx }) {
  const { t, view, when } = ctx
  return (
    <Section id="customer-contacts" title={t('customer.contacts')}>
      {view.contacts.map((c) => (
        <article key={c.id} className="staff-customer__contact" aria-label={c.fullName}>
          <h3 className="hh-h5">
            {c.fullName}
            {c.isPrimary ? ` (${t('customer.primary')})` : ''}
          </h3>
          <dl className="staff-record">
            <dt>{t('customer.email')}</dt>
            <dd>
              {c.email}{' '}
              <StatusBadge tone={c.verification.email === 'verified' ? 'success' : 'neutral'}>
                {t('request.emailBadge', { state: codeLabel(t, 'verificationState', c.verification.email) })}
              </StatusBadge>
            </dd>
            <dt>{t('customer.phone')}</dt>
            <dd>
              {c.phone}{' '}
              <StatusBadge tone={c.verification.phone === 'verified' ? 'success' : 'neutral'}>
                {t('request.phoneBadge', { state: codeLabel(t, 'verificationState', c.verification.phone) })}
              </StatusBadge>
            </dd>
            <dt>{t('customer.preferredChannel')}</dt>
            <dd>{codeLabel(t, 'contactChannel', c.preferredChannel)}</dd>
            <dt>{t('customer.permissionSms')}</dt>
            <dd>{permissionText(t, when, c.permissions.sms)}</dd>
            <dt>{t('customer.permissionMarketingEmail')}</dt>
            <dd>{permissionText(t, when, c.permissions.marketingEmail)}</dd>
            <dt>{t('customer.permissionMarketingSms')}</dt>
            <dd>{permissionText(t, when, c.permissions.marketingSms)}</dd>
          </dl>
          <p className="staff-request__hint">{t('customer.permissionsHint')}</p>
          <h4 className="hh-h6">{t('customer.consentHistory')}</h4>
          {c.consentHistory.length ? (
            <ul className="staff-request__list">
              {c.consentHistory.map((h, i) => (
                <li key={`${h.recordedAt}-${i}`}>
                  {t('customer.consentEntry', {
                    purpose: codeLabel(t, 'consentPurpose', h.purpose),
                    channel: codeLabel(t, 'consentChannel', h.channel),
                    state: codeLabel(t, 'consentState', h.granted ? 'granted' : 'withdrawn'),
                    source: codeLabel(t, 'consentSource', h.source),
                    time: when(h.recordedAt),
                  })}
                  {h.ownRecord ? null : (
                    <span className="staff-request__hint"> {t('customer.consentSameDestination')}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>{t('customer.noConsent')}</p>
          )}
          {view.actions.edit ? <EditContact ctx={ctx} contact={c} /> : null}
          {view.actions.recordWithdrawal ? <Withdrawal ctx={ctx} contact={c} /> : null}
        </article>
      ))}
    </Section>
  )
}

type Contact = CustomerDetail['contacts'][number]

function EditContact({ ctx, contact }: { ctx: Ctx; contact: Contact }) {
  const { t, view } = ctx
  const ids = useId()
  const [open, setOpen] = useState(false)
  const [v, setV] = useState({
    fullName: contact.fullName,
    email: contact.email,
    phone: contact.phone,
    preferredChannel: contact.preferredChannel,
    reason: '',
  })
  const form = useForm(ctx)
  if (!open)
    return (
      <p>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          {t('customer.editContact')}
        </Button>
      </p>
    )
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })
  return (
    <form
      className="staff-request__form"
      aria-label={t('customer.editContact')}
      onSubmit={(e) => {
        e.preventDefault()
        void form.run(
          () => ctx.write(`/staff/customers/${view.id}/contacts/${contact.id}`, 'PUT', v, contact.version),
          () => setOpen(false),
        )
      }}
    >
      <p className="staff-request__hint">{t('customer.editContactHint')}</p>
      <Field label={t('customer.fullName')} value={v.fullName} maxLength={200} required onChange={set('fullName')} />
      <Field
        label={t('customer.email')}
        type="email"
        value={v.email}
        maxLength={254}
        required
        onChange={set('email')}
      />
      <Field label={t('customer.phone')} type="tel" value={v.phone} maxLength={30} required onChange={set('phone')} />
      <div className="staff-queue__select">
        <label htmlFor={`${ids}-channel`}>{t('customer.preferredChannel')}</label>
        <select id={`${ids}-channel`} value={v.preferredChannel} onChange={set('preferredChannel')}>
          {LABEL_FAMILIES.contactChannel.map((c) => (
            <option key={c} value={c}>
              {codeLabel(t, 'contactChannel', c)}
            </option>
          ))}
        </select>
      </div>
      <Field
        label={t('customer.reason')}
        hint={t('customer.reasonHint')}
        value={v.reason}
        maxLength={1000}
        required
        onChange={set('reason')}
      />
      {form.error ? <StateView kind="error" title={form.error} /> : null}
      <div className="hh-button-row">
        <Button type="submit" pending={form.pending}>
          {t('customer.save')}
        </Button>
        <Button variant="quiet" onClick={() => setOpen(false)}>
          {t('customer.cancel')}
        </Button>
      </div>
    </form>
  )
}

const WITHDRAWALS = [
  { purpose: 'transactional_sms', channel: 'sms' },
  { purpose: 'marketing', channel: 'email' },
  { purpose: 'marketing', channel: 'sms' },
] as const

function Withdrawal({ ctx, contact }: { ctx: Ctx; contact: Contact }) {
  const { t, view } = ctx
  const ids = useId()
  const [choice, setChoice] = useState(0)
  const [reason, setReason] = useState('')
  const form = useForm(ctx)
  const w = WITHDRAWALS[choice] ?? WITHDRAWALS[0]
  return (
    <form
      className="staff-request__form"
      aria-label={t('customer.recordOptOut')}
      onSubmit={(e) => {
        e.preventDefault()
        void form.run(
          () =>
            ctx.write(`/staff/customers/${view.id}/contacts/${contact.id}/withdrawals`, 'POST', {
              purpose: w.purpose,
              channel: w.channel,
              reason,
            }),
          () => setReason(''),
        )
      }}
    >
      <h4 className="hh-h6">{t('customer.recordOptOut')}</h4>
      <p className="staff-request__hint">{t('customer.recordOptOutHint')}</p>
      <div className="staff-queue__select">
        <label htmlFor={`${ids}-what`}>{t('customer.optOutWhat')}</label>
        <select id={`${ids}-what`} value={choice} onChange={(e) => setChoice(Number(e.target.value))}>
          {WITHDRAWALS.map((x, i) => (
            <option key={`${x.purpose}-${x.channel}`} value={i}>
              {t('customer.optOutOption', {
                purpose: codeLabel(t, 'consentPurpose', x.purpose),
                channel: codeLabel(t, 'consentChannel', x.channel),
              })}
            </option>
          ))}
        </select>
      </div>
      <Field
        label={t('customer.reason')}
        hint={t('customer.optOutReasonHint')}
        value={reason}
        maxLength={1000}
        required
        onChange={(e) => setReason(e.target.value)}
      />
      {form.error ? <StateView kind="error" title={form.error} /> : null}
      <Button type="submit" variant="secondary" pending={form.pending}>
        {t('customer.recordOptOutSubmit')}
      </Button>
    </form>
  )
}

function Properties({ ctx }: { ctx: Ctx }) {
  const { t, view } = ctx
  return (
    <Section id="customer-properties" title={t('customer.properties')}>
      {view.properties.length ? (
        <ul className="staff-request__list">
          {view.properties.map((p) => (
            <li key={p.id}>
              {[p.street, p.unit].filter(Boolean).join(', ')}, {p.city}, {p.state} {p.zip} —{' '}
              {codeLabel(t, 'propertyType', p.propertyType)} · {codeLabel(t, 'coverageResult', p.coverage)}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('customer.noProperties')}</p>
      )}
    </Section>
  )
}

function Projects({ ctx }: { ctx: Ctx }) {
  const { t, view, when, link } = ctx
  return (
    <Section id="customer-projects" title={t('customer.projects')}>
      {view.projects.length ? (
        <ul className="staff-request__list">
          {view.projects.map((p) => (
            <li key={p.id}>
              <p>
                {t('customer.project', { reference: p.reference })}{' '}
                <StatusBadge>{codeLabel(t, 'projectState', p.state)}</StatusBadge>
              </p>
              <ul>
                {p.requests.map((r) => (
                  <li key={r.id}>
                    <a {...link(`/requests/${r.id}`)}>{t('record.request.heading', { reference: r.reference })}</a>{' '}
                    {codeLabel(t, 'requestState', r.state)} · {when(r.submittedAt)}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('customer.noProjects')}</p>
      )}
    </Section>
  )
}

function Candidates({ ctx }: { ctx: Ctx }) {
  const { t, view, when, link } = ctx
  return (
    <Section id="customer-candidates" title={t('customer.candidates')}>
      <p className="staff-request__hint">{t('customer.candidatesHint')}</p>
      {view.candidates.items.length ? (
        <ul className="staff-request__list">
          {view.candidates.items.map((m) => (
            <li key={m.id} aria-label={t('customer.candidateLabel', { name: m.customer.displayName })}>
              <p>
                <a {...link(`/customers/${m.customer.id}`)}>{m.customer.displayName}</a>{' '}
                <StatusBadge tone={m.status === 'open' ? 'warning' : 'neutral'}>
                  {codeLabel(t, 'candidateStatus', m.status)}
                </StatusBadge>
              </p>
              <p>
                {t('customer.candidateShares', {
                  reasons: m.reasons.map((r) => codeLabel(t, 'matchReason', r)).join(', '),
                })}
              </p>
              <p className="staff-request__hint">{t('customer.candidateDetected', { time: when(m.detectedAt) })}</p>
              {m.lastReview ? (
                <p className="staff-request__hint">
                  {t('customer.candidateDismissed', {
                    name: m.lastReview.by?.name ?? t('queue.unnamed'),
                    time: when(m.lastReview.at),
                    reason: m.lastReview.reason,
                  })}
                </p>
              ) : null}
              {m.status === 'open' && view.actions.reviewCandidates ? <Dismiss ctx={ctx} match={m} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('customer.noCandidates')}</p>
      )}
    </Section>
  )
}

function Dismiss({ ctx, match }: { ctx: Ctx; match: CustomerDetail['candidates']['items'][number] }) {
  const { t, view } = ctx
  const [reason, setReason] = useState('')
  const form = useForm(ctx)
  return (
    <form
      className="staff-request__form"
      aria-label={t('customer.dismiss')}
      onSubmit={(e) => {
        e.preventDefault()
        void form.run(
          () =>
            ctx.write(`/staff/customers/${view.id}/candidates/${match.id}/dismiss`, 'POST', { reason }, match.version),
          () => setReason(''),
        )
      }}
    >
      <Field
        label={t('customer.reason')}
        hint={t('customer.dismissHint')}
        value={reason}
        maxLength={1000}
        required
        onChange={(e) => setReason(e.target.value)}
      />
      {form.error ? <StateView kind="error" title={form.error} /> : null}
      <Button type="submit" variant="secondary" pending={form.pending}>
        {t('customer.dismiss')}
      </Button>
    </form>
  )
}

function Notes({ ctx }: { ctx: Ctx }) {
  const { t, view, when } = ctx
  const ids = useId()
  const [body, setBody] = useState('')
  const [visibility, setVisibility] = useState('internal_operational')
  const form = useForm(ctx)
  return (
    <Section id="customer-notes" title={t('customer.notes')}>
      <p className="staff-request__hint">{t('customer.notesHint')}</p>
      {view.notes.length ? (
        <ul className="staff-request__list">
          {view.notes.map((n) => (
            <li key={n.id}>
              <StatusBadge tone={n.visibility === 'internal_operational' ? 'neutral' : 'warning'}>
                {codeLabel(t, 'visibilityClass', n.visibility)}
              </StatusBadge>
              {n.masked ? (
                <p className="staff-request__note">{t('customer.noteMasked')}</p>
              ) : (
                <p className="staff-request__note">{n.body}</p>
              )}
              <p className="staff-request__hint">
                {n.masked
                  ? when(n.createdAt)
                  : t('request.noteBy', { name: n.author?.name ?? t('queue.unnamed'), time: when(n.createdAt) })}
                {n.requestReference ? ` · ${t('record.request.heading', { reference: n.requestReference })}` : ''}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('request.noNotes')}</p>
      )}
      {view.actions.addNote ? (
        <form
          className="staff-request__form"
          onSubmit={(e) => {
            e.preventDefault()
            if (!body.trim()) return
            void form.run(
              () => ctx.write(`/staff/customers/${view.id}/notes`, 'POST', { body, visibility }),
              () => (setBody(''), setVisibility('internal_operational')),
            )
          }}
        >
          <Field
            multiline
            label={t('customer.newNote')}
            hint={t('customer.noteHint')}
            maxLength={5000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="staff-queue__select">
            <label htmlFor={`${ids}-visibility`}>{t('customer.noteVisibility')}</label>
            <select id={`${ids}-visibility`} value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              {view.actions.noteVisibilities.map((v) => (
                <option key={v} value={v}>
                  {codeLabel(t, 'visibilityClass', v)}
                </option>
              ))}
            </select>
          </div>
          {form.error ? <StateView kind="error" title={form.error} /> : null}
          <Button type="submit" variant="secondary" pending={form.pending}>
            {t('customer.addNote')}
          </Button>
        </form>
      ) : null}
    </Section>
  )
}

/** The label of one timeline entry's codes, by kind. */
function codesText(t: T, e: CustomerDetail['timeline'][number]): string {
  const [first, second] = e.codes
  switch (e.kind) {
    case 'request_decision':
      return first ? codeLabel(t, 'requestDecision', first) : ''
    case 'request_note':
    case 'customer_note':
      return first ? codeLabel(t, 'visibilityClass', first) : ''
    case 'customer_changed':
    case 'contact_changed':
      return e.codes.map((c) => codeLabel(t, 'recordField', c)).join(', ')
    case 'consent_granted':
    case 'consent_withdrawn':
      return [
        first ? codeLabel(t, 'consentPurpose', first) : '',
        e.channel ? codeLabel(t, 'consentChannel', e.channel) : '',
        second ? codeLabel(t, 'consentSource', second) : '',
      ]
        .filter(Boolean)
        .join(' · ')
    case 'message':
      return [
        first ?? '',
        e.channel ? codeLabel(t, 'consentChannel', e.channel) : '',
        e.state ? codeLabel(t, 'deliveryState', e.state) : '',
      ]
        .filter(Boolean)
        .join(' · ')
    case 'request_submitted':
      return e.state ? codeLabel(t, 'requestState', e.state) : ''
    default:
      return e.codes.map((c) => codeLabel(t, 'matchReason', c)).join(', ')
  }
}

function Timeline({ ctx }: { ctx: Ctx }) {
  const { t, view, when } = ctx
  return (
    <Section id="customer-history" title={t('customer.history')}>
      {view.timeline.length ? (
        <ol className="staff-request__list">
          {view.timeline.map((e, i) => (
            <li key={`${e.at}-${e.kind}-${i}`}>
              <p>
                <strong>{codeLabel(t, 'customerTimeline', e.kind)}</strong>
                {e.reference ? ` · ${e.reference}` : ''}
                {codesText(t, e) ? ` · ${codesText(t, e)}` : ''}
              </p>
              <p className="staff-request__hint">
                {when(e.at)} · {e.actor.name ?? codeLabel(t, 'timelineActor', e.actor.kind)}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p>{t('customer.noHistory')}</p>
      )}
      {view.timelineTruncated ? <p className="staff-request__hint">{t('customer.historyTruncated')}</p> : null}
    </Section>
  )
}
