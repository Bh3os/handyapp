// Human-reviewed merges and relinks in the staff app (TSK-0046; HH-CRM-04, HH-ID-02, T21, T29, OWN-DEC-117, S02,
// S03). The merge review screen (both records side by side with the affected projects, documents and payments, a
// required reason, then the confirmation), the screen that links a request to another customer or corrects a
// request linked to the wrong one, and the record's history of merges and relinks with the Owner's reversal. Nothing
// is merged or linked here without the person confirming the preview the server sent; the server decides every
// step again and rechecks customer access. Staff text is English or Spanish (staff catalogs).
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string
type Link = (to: string) => { href: string; onClick: (e: MouseEvent<HTMLAnchorElement>) => void }

export type RecordSummary = {
  id: string
  displayName: string
  status: string
  version: number
  createdAt: string
  contacts: {
    id: string
    customerId: string
    fullName: string
    email: string
    phone: string
    verification: { email: string; phone: string }
  }[]
  properties: {
    id: string
    customerId: string
    street: string
    unit: string | null
    city: string
    state: string
    zip: string
  }[]
  projects: {
    id: string
    reference: string
    state: string
    customerId: string
    requests: { id: string; reference: string; state: string; submittedAt: string }[]
  }[]
  access: { liveGrants: number; liveSessions: number }
}

export type MergePreview = {
  source: RecordSummary
  survivor: RecordSummary
  suggestion: { id: string; status: string; reasons: string[] } | null
  documents: { state: 'not_available' }
  payments: { state: 'not_available' }
  blocked: 'CUSTOMER_MERGED' | 'SAME_CUSTOMER' | null
  previewDigest: string
}

export type RelinkPreview = {
  request: { id: string; reference: string; state: string }
  project: { id: string; reference: string; state: string }
  original: { id: string; displayName: string }
  from: RecordSummary
  to: RecordSummary
  correction: boolean
  revokes: { grants: number; sessions: number }
  documents: { state: 'not_available' }
  payments: { state: 'not_available' }
  blocked: 'CUSTOMER_MERGED' | 'SAME_CUSTOMER' | null
  previewDigest: string
}

export type RecordLink = {
  id: string
  kind: 'merge' | 'request_relink'
  state: 'current' | 'reversed' | 'replaced'
  from: { id: string; displayName: string }
  to: { id: string; displayName: string }
  requestReference: string | null
  reason: string
  by: { id: string; name: string | null }
  at: string
  correction: boolean
  access: { grantsRevoked: number; sessionsRevoked: number; projectsAdded: number }
  reversal: {
    by: { id: string; name: string | null }
    at: string
    reason: string
    access: { grantsRevoked: number; sessionsRevoked: number; projectsAdded: number }
  } | null
}

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

/** One write, with its idempotency key kept until it succeeds. */
function useWrite(fetchImpl: Fetch) {
  const keys = useRef(new Map<string, string>())
  return useCallback(
    async <R,>(path: string, body: unknown) => {
      const k = keys.current.get(path) ?? idempotencyKey()
      keys.current.set(path, k)
      const r = await call<R>(fetchImpl, path, { method: 'POST', body, headers: { 'idempotency-key': k } })
      if (r.ok || r.status < 500) keys.current.delete(path)
      return r
    },
    [fetchImpl],
  )
}

/** What a refused link change means to the person. */
export function linkError(t: T, error: ApiErrorBody): string {
  const codes = error.fieldErrors.map((f) => f.code)
  if (codes.includes('PREVIEW_STALE')) return t('link.stale')
  if (codes.includes('CUSTOMER_MERGED')) return t('link.blocked.merged')
  if (codes.includes('SAME_CUSTOMER') || codes.includes('same_customer')) return t('link.blocked.same')
  if (codes.includes('LINK_REVERSED')) return t('link.alreadyReversed')
  if (codes.includes('LINK_NOT_CURRENT')) return t('link.notCurrent')
  if (codes.includes('NOT_MERGED_THIS_WAY')) return t('link.notCurrent')
  if (error.code === 'VALIDATION_FAILED') return t('customer.invalid')
  if (error.code === 'FORBIDDEN') return t('shell.notAllowed')
  if (error.code === 'NOT_FOUND') return t('record.notFound')
  return t('request.saveFailed')
}

const blockedText = (t: T, blocked: 'CUSTOMER_MERGED' | 'SAME_CUSTOMER') =>
  blocked === 'CUSTOMER_MERGED' ? t('link.blocked.merged') : t('link.blocked.same')

/** One record as the preview shows it: contacts, properties, projects and their live access. */
function SummaryCard({
  t,
  title,
  s,
  when,
  link,
}: {
  t: T
  title: string
  s: RecordSummary
  when: (iso: string) => string
  link: Link
}) {
  return (
    <section className="staff-request__section staff-link__record" aria-label={`${title}: ${s.displayName}`}>
      <h2 className="staff-queue__heading">
        {title}: <a {...link(`/customers/${s.id}`)}>{s.displayName}</a>
      </h2>
      <p className="staff-request__hint">
        {t('customers.since', { date: when(s.createdAt) })} · {codeLabel(t, 'customerStatus', s.status)}
      </p>
      <h3 className="hh-h6">{t('customer.contacts')}</h3>
      <ul className="staff-request__list">
        {s.contacts.map((c) => (
          <li key={c.id}>
            {c.fullName} · {c.email} ({codeLabel(t, 'verificationState', c.verification.email)}) · {c.phone} (
            {codeLabel(t, 'verificationState', c.verification.phone)})
          </li>
        ))}
      </ul>
      <h3 className="hh-h6">{t('customer.properties')}</h3>
      {s.properties.length ? (
        <ul className="staff-request__list">
          {s.properties.map((p) => (
            <li key={p.id}>
              {[p.street, p.unit].filter(Boolean).join(', ')}, {p.city}, {p.state} {p.zip}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('customer.noProperties')}</p>
      )}
      <h3 className="hh-h6">{t('customer.projects')}</h3>
      {s.projects.length ? (
        <ul className="staff-request__list">
          {s.projects.map((p) => (
            <li key={p.id}>
              {t('customer.project', { reference: p.reference })} · {codeLabel(t, 'projectState', p.state)}
              {p.requests.length ? ` · ${p.requests.map((r) => r.reference).join(', ')}` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('customer.noProjects')}</p>
      )}
      <p className="staff-request__hint">
        {t('link.access', { grants: s.access.liveGrants, sessions: s.access.liveSessions })}
      </p>
    </section>
  )
}

function NotAvailable({ t }: { t: T }) {
  return (
    <dl className="staff-record">
      <dt>{t('customer.documents')}</dt>
      <dd>{t('customer.notAvailable')}</dd>
      <dt>{t('customer.payments')}</dt>
      <dd>{t('customer.notAvailable')}</dd>
    </dl>
  )
}

const formatter = (locale: StaffLocale) =>
  new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })

/**
 * The merge review (HH-CRM-04): `id` is the record to merge, `into` the record that stays (the person can swap
 * them). The preview comes from the server; the confirmation sends its digest back with the reason.
 */
export function MergeReview({
  t,
  locale,
  fetchImpl,
  id,
  into,
  go,
  href,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  id: string
  into: string
  go: (to: string) => void
  href: (to: string) => string
}) {
  const [pair, setPair] = useState({ source: id, survivor: into })
  const [preview, setPreview] = useState<MergePreview | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const write = useWrite(fetchImpl)
  const load = useCallback(async () => {
    const r = await call<MergePreview>(
      fetchImpl,
      `/staff/customers/${encodeURIComponent(pair.source)}/merge-preview?into=${encodeURIComponent(pair.survivor)}`,
    )
    if (r.ok && typeof r.data?.previewDigest === 'string') {
      setPreview(r.data)
      setLoadError(null)
    } else {
      setPreview(null)
      setLoadError(r.ok ? t('record.notFound') : linkError(t, r.error))
    }
  }, [fetchImpl, pair, t])
  useEffect(() => {
    void load()
  }, [load])
  const link = linkTo(go, href)
  const fmt = formatter(locale)
  const when = (iso: string) => fmt.format(new Date(iso))
  const back = <a {...link(`/customers/${id}`)}>{t('link.backToCustomer')}</a>
  if (preview === undefined) return <StateView kind="loading" title={t('common.loading')} />
  if (preview === null)
    return (
      <section className="staff-screen">
        <StateView kind="blocked" title={loadError ?? t('record.notFound')} />
        <p>{back}</p>
      </section>
    )
  async function confirm(e: FormEvent) {
    e.preventDefault()
    if (!preview) return
    setPending(true)
    const r = await write<{ linkId: string }>(`/staff/customers/${encodeURIComponent(pair.source)}/merge`, {
      survivorId: pair.survivor,
      reason,
      previewDigest: preview.previewDigest,
    })
    setPending(false)
    if (!r.ok) {
      setError(linkError(t, r.error))
      // A stale preview is shown again as it is now; the person confirms what they see.
      if (r.error.fieldErrors.some((f) => f.code === 'PREVIEW_STALE')) await load()
      return
    }
    go(`/customers/${pair.survivor}`)
  }
  return (
    <section className="staff-screen staff-request staff-link" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('merge.heading')}
      </h1>
      <p>{t('merge.hint')}</p>
      {preview.suggestion ? (
        <p>
          <StatusBadge tone="warning">{codeLabel(t, 'candidateStatus', preview.suggestion.status)}</StatusBadge>{' '}
          {t('customer.candidateShares', {
            reasons: preview.suggestion.reasons.map((r) => codeLabel(t, 'matchReason', r)).join(', '),
          })}
        </p>
      ) : (
        <p className="staff-request__hint">{t('merge.noSuggestion')}</p>
      )}
      <div className="staff-link__pair">
        <SummaryCard t={t} title={t('merge.source')} s={preview.source} when={when} link={link} />
        <SummaryCard t={t} title={t('merge.survivor')} s={preview.survivor} when={when} link={link} />
      </div>
      <p>
        <Button
          variant="secondary"
          onClick={() => {
            setError(null)
            setPreview(undefined)
            setPair({ source: pair.survivor, survivor: pair.source })
          }}
        >
          {t('merge.swap')}
        </Button>
      </p>
      <NotAvailable t={t} />
      <p className="staff-request__hint">{t('merge.accessRule')}</p>
      {preview.blocked ? (
        <StateView kind="blocked" title={blockedText(t, preview.blocked)} />
      ) : (
        <form className="staff-request__form" aria-label={t('merge.heading')} onSubmit={(e) => void confirm(e)}>
          <Field
            label={t('customer.reason')}
            hint={t('link.reasonHint')}
            value={reason}
            maxLength={1000}
            required
            onChange={(e) => setReason(e.target.value)}
          />
          {error ? <StateView kind="error" title={error} /> : null}
          <Button type="submit" pending={pending}>
            {t('merge.confirm')}
          </Button>
        </form>
      )}
      <p>{back}</p>
    </section>
  )
}

type ListItem = { id: string; displayName: string; status: string; email: string | null; city: string | null }

/**
 * Linking a request to another customer, or correcting a request linked to the wrong one (HH-CRM-04, OWN-DEC-116):
 * find the customer, review the preview, give the reason, confirm.
 */
export function RelinkRequest({
  t,
  locale,
  fetchImpl,
  requestId,
  go,
  href,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  requestId: string
  go: (to: string) => void
  href: (to: string) => string
}) {
  const [draft, setDraft] = useState('')
  const [results, setResults] = useState<ListItem[] | null>(null)
  const [target, setTarget] = useState<string | null>(null)
  const [preview, setPreview] = useState<RelinkPreview | null>(null)
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const write = useWrite(fetchImpl)
  const link = linkTo(go, href)
  const fmt = formatter(locale)
  const when = (iso: string) => fmt.format(new Date(iso))
  const load = useCallback(
    async (to: string) => {
      const r = await call<RelinkPreview>(
        fetchImpl,
        `/staff/requests/${encodeURIComponent(requestId)}/relink-preview?to=${encodeURIComponent(to)}`,
      )
      if (r.ok && typeof r.data?.previewDigest === 'string') {
        setPreview(r.data)
        setError(null)
      } else {
        setPreview(null)
        setError(r.ok ? t('record.notFound') : linkError(t, r.error))
      }
    },
    [fetchImpl, requestId, t],
  )
  useEffect(() => {
    if (target) void load(target)
  }, [target, load])
  async function search(e: FormEvent) {
    e.preventDefault()
    const q = draft.trim()
    if (!q) return
    const r = await call<{ items: ListItem[] }>(fetchImpl, `/staff/customers?q=${encodeURIComponent(q)}`)
    setResults(r.ok && Array.isArray(r.data?.items) ? r.data.items : [])
  }
  async function confirm(e: FormEvent) {
    e.preventDefault()
    if (!preview || !target) return
    setPending(true)
    const r = await write<{ linkId: string }>(`/staff/requests/${encodeURIComponent(requestId)}/relink`, {
      customerId: target,
      reason,
      previewDigest: preview.previewDigest,
    })
    setPending(false)
    if (!r.ok) {
      setError(linkError(t, r.error))
      if (r.error.fieldErrors.some((f) => f.code === 'PREVIEW_STALE')) await load(target)
      return
    }
    go(`/customers/${target}`)
  }
  return (
    <section className="staff-screen staff-request staff-link" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('relink.heading')}
      </h1>
      <p>{t('relink.hint')}</p>
      <form
        className="staff-queue__filters"
        role="search"
        aria-label={t('relink.search')}
        onSubmit={(e) => void search(e)}
      >
        <Field
          label={t('relink.search')}
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
      {results === null ? null : results.length === 0 ? (
        <StateView kind="empty" title={t('customers.empty')} />
      ) : (
        <ul className="staff-request__list" aria-label={t('relink.results')}>
          {results.map((c) => (
            <li key={c.id}>
              {c.displayName}
              {c.email ? ` · ${c.email}` : ''}
              {c.city ? ` · ${c.city}` : ''}
              {c.status !== 'active' ? ` · ${codeLabel(t, 'customerStatus', c.status)}` : ''}{' '}
              <Button
                variant="secondary"
                onClick={() => {
                  setPreview(null)
                  setTarget(c.id)
                }}
                aria-label={t('relink.chooseNamed', { name: c.displayName })}
              >
                {t('relink.choose')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {preview ? (
        <>
          <p>
            {t('relink.request', { reference: preview.request.reference })} ·{' '}
            {t('relink.original', { name: preview.original.displayName })}
          </p>
          <div className="staff-link__pair">
            <SummaryCard t={t} title={t('relink.from')} s={preview.from} when={when} link={link} />
            <SummaryCard t={t} title={t('relink.to')} s={preview.to} when={when} link={link} />
          </div>
          <NotAvailable t={t} />
          {preview.correction ? (
            <StateView
              kind="error"
              title={t('relink.correction', { grants: preview.revokes.grants, sessions: preview.revokes.sessions })}
            />
          ) : null}
          <p className="staff-request__hint">{t('relink.accessRule')}</p>
          {preview.blocked ? (
            <StateView kind="blocked" title={blockedText(t, preview.blocked)} />
          ) : (
            <form className="staff-request__form" aria-label={t('relink.confirm')} onSubmit={(e) => void confirm(e)}>
              <Field
                label={t('customer.reason')}
                hint={t('link.reasonHint')}
                value={reason}
                maxLength={1000}
                required
                onChange={(e) => setReason(e.target.value)}
              />
              {error ? <StateView kind="error" title={error} /> : null}
              <Button type="submit" pending={pending}>
                {t('relink.confirm')}
              </Button>
            </form>
          )}
        </>
      ) : error ? (
        <StateView kind="error" title={error} />
      ) : null}
      <p>
        <a {...link(`/requests/${requestId}`)}>{t('relink.backToRequest')}</a>
      </p>
    </section>
  )
}

const STATE_TONE = { current: 'success', reversed: 'neutral', replaced: 'neutral' } as const

/** The record's merges and relinks, newest first, with the Owner's reversal of a current one. */
export function LinkHistory({
  t,
  links,
  when,
  link,
  canReverse,
  fetchImpl,
  reload,
}: {
  t: T
  links: RecordLink[]
  when: (iso: string) => string
  link: Link
  canReverse: boolean
  fetchImpl: Fetch
  reload: () => Promise<void>
}) {
  return (
    <section className="staff-request__section" aria-labelledby="customer-links">
      <h2 id="customer-links" className="staff-queue__heading">
        {t('customer.links')}
      </h2>
      <p className="staff-request__hint">{t('customer.linksHint')}</p>
      {links.length ? (
        <ul className="staff-request__list">
          {links.map((l) => (
            <li
              key={l.id}
              aria-label={
                l.kind === 'merge'
                  ? t('customer.linkMerge', { from: l.from.displayName, to: l.to.displayName })
                  : t('customer.linkRelink', {
                      reference: l.requestReference ?? '',
                      from: l.from.displayName,
                      to: l.to.displayName,
                    })
              }
            >
              <p>
                {l.kind === 'merge' ? (
                  <>
                    <a {...link(`/customers/${l.from.id}`)}>{l.from.displayName}</a> →{' '}
                    <a {...link(`/customers/${l.to.id}`)}>{l.to.displayName}</a> · {t('customer.linkKindMerge')}
                  </>
                ) : (
                  <>
                    {t('record.request.heading', { reference: l.requestReference ?? '' })}:{' '}
                    <a {...link(`/customers/${l.from.id}`)}>{l.from.displayName}</a> →{' '}
                    <a {...link(`/customers/${l.to.id}`)}>{l.to.displayName}</a> · {t('customer.linkKindRelink')}
                  </>
                )}{' '}
                <StatusBadge tone={STATE_TONE[l.state]}>{codeLabel(t, 'recordLinkState', l.state)}</StatusBadge>
              </p>
              <p className="staff-request__hint">
                {t('customer.linkBy', { name: l.by.name ?? t('queue.unnamed'), time: when(l.at), reason: l.reason })}
              </p>
              <p className="staff-request__hint">
                {l.correction ? `${t('customer.linkCorrection')} ` : ''}
                {t('customer.linkAccess', { grants: l.access.grantsRevoked, sessions: l.access.sessionsRevoked })}
              </p>
              {l.reversal ? (
                <p className="staff-request__hint">
                  {t('customer.linkReversal', {
                    name: l.reversal.by.name ?? t('queue.unnamed'),
                    time: when(l.reversal.at),
                    reason: l.reversal.reason,
                  })}{' '}
                  {t('customer.linkAccess', {
                    grants: l.reversal.access.grantsRevoked,
                    sessions: l.reversal.access.sessionsRevoked,
                  })}
                </p>
              ) : null}
              {canReverse && l.state === 'current' ? (
                <Reverse t={t} linkId={l.id} fetchImpl={fetchImpl} reload={reload} />
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>{t('customer.noLinks')}</p>
      )}
    </section>
  )
}

function Reverse({
  t,
  linkId,
  fetchImpl,
  reload,
}: {
  t: T
  linkId: string
  fetchImpl: Fetch
  reload: () => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const write = useWrite(fetchImpl)
  return (
    <form
      className="staff-request__form"
      aria-label={t('customer.reverse')}
      onSubmit={(e) => {
        e.preventDefault()
        void (async () => {
          setPending(true)
          const r = await write(`/staff/customer-links/${encodeURIComponent(linkId)}/reverse`, { reason })
          setPending(false)
          if (!r.ok) return setError(linkError(t, r.error))
          setError(null)
          setReason('')
          await reload()
        })()
      }}
    >
      <p className="staff-request__hint">{t('customer.reverseHint')}</p>
      <Field
        label={t('customer.reason')}
        hint={t('link.reasonHint')}
        value={reason}
        maxLength={1000}
        required
        onChange={(e) => setReason(e.target.value)}
      />
      {error ? <StateView kind="error" title={error} /> : null}
      <Button type="submit" variant="secondary" pending={pending}>
        {t('customer.reverse')}
      </Button>
    </form>
  )
}
