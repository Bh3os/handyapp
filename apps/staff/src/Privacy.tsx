// The privacy requests screen (TSK-0100; HH-PRIV-03, ENT-PrivacyRequest, OWN-DEC-71, OWN-DEC-113, OWN-DEC-70,
// OQ-PRIVACY-REQUESTS). The Owner sees each customer's export, correction and deletion requests, opens the review and
// decides. The review shows the scoped search as the server counts it: every record kind, what a deletion does with
// it (delete, retain with why and until when, exclude other people's data, none stored, not recorded), and the
// checks the software cannot run, which the Owner ticks before completing a deletion. Completing a deletion can close
// sign-in and project access even while a hold keeps records. A fresh sign-in and a reason are asked for by the
// server; response deadlines and the outcome notice are NOT CONFIGURED.
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useState } from 'react'
import { call, type ApiErrorBody, type Fetch } from './api'
import { ReauthForm, useOwnerWrite } from './OwnerWrite'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

export type PlanItem = {
  category: string
  disposition: string
  count: number
  reason: string | null
  retention: string | null
  years: number | null
  reviewAt: string | null
}

export type PrivacyRequestItem = {
  id: string
  reference: string
  kind: 'export' | 'correction' | 'deletion'
  state: 'received' | 'under_review' | 'completed' | 'partially_completed' | 'declined'
  details: string | null
  submittedAt: string
  reviewStartedAt: string | null
  decidedAt: string | null
  version: number
  project: { reference: string }
  customer: { name: string }
  contact: { name: string; email: string | null; phone: string | null }
  account: boolean
  accessClosed: boolean | null
  outcome: {
    deleted: { category: string; count: number }[]
    retained: PlanItem[]
    excluded: PlanItem[]
    exportReady: boolean
    accessClosed: boolean
  } | null
}

export type PrivacyRequestDetail = PrivacyRequestItem & {
  plan: {
    items: PlanItem[]
    checks: { check: string; result: string; count?: number }[]
    confirm: string[]
    deletable: {
      estimates: { id: string; reference: string; projectId: string }[]
      accountIds: string[]
      grantIds: string[]
      sessions: number
    }
  }
  findings: { items: PlanItem[]; checks: unknown[]; at: string } | null
}

const STATE_TONE = {
  received: 'info',
  under_review: 'warning',
  completed: 'success',
  partially_completed: 'success',
  declined: 'neutral',
} as const
const DISPOSITION_TONE = {
  delete: 'danger',
  retain: 'neutral',
  exclude: 'neutral',
  none_stored: 'neutral',
  not_recorded: 'warning',
} as const

const COMPLETE_LABEL: Record<PrivacyRequestItem['kind'], StaffKey> = {
  export: 'privacy.decision.complete.export',
  correction: 'privacy.decision.complete.correction',
  deletion: 'privacy.decision.complete.deletion',
}

const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')

export function privacyQuery(state: string, cursor?: string): string {
  const q = new URLSearchParams()
  if (state) q.set('state', state)
  if (cursor) q.set('cursor', cursor)
  const s = q.toString()
  return s ? `/staff/privacy-requests?${s}` : '/staff/privacy-requests'
}

function reasons(t: T, error: ApiErrorBody): string[] {
  const out = error.fieldErrors.map((f) => codeLabel(t, 'privacyProblem', f.code))
  return out.length ? out : [codeLabel(t, 'privacyProblem', error.code)]
}

function ItemLine({ t, locale, i }: { t: T; locale: StaffLocale; i: PlanItem }) {
  const day = new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium' })
  return (
    <li className="staff-privacy__item">
      <StatusBadge tone={DISPOSITION_TONE[i.disposition as keyof typeof DISPOSITION_TONE] ?? 'neutral'}>
        {codeLabel(t, 'privacyDisposition', i.disposition)}
      </StatusBadge>{' '}
      {t('privacy.plan.item', { category: codeLabel(t, 'privacyCategory', i.category), n: i.count })}
      {i.reason ? ` · ${codeLabel(t, 'privacyReason', i.reason)}` : ''}
      {i.years !== null ? ` · ${t('privacy.plan.years', { years: i.years })}` : ''}
      {i.reviewAt ? ` · ${t('privacy.plan.until', { date: day.format(new Date(i.reviewAt)) })}` : ''}
    </li>
  )
}

function Detail({
  t,
  locale,
  id,
  fetchImpl,
  onSession,
  onChanged,
}: {
  t: T
  locale: StaffLocale
  id: string
  fetchImpl: Fetch
  onSession?: (s: { csrfToken: string }) => void
  onChanged: () => void
}) {
  const ids = useId()
  const [d, setD] = useState<PrivacyRequestDetail | null | 'error'>(null)
  const [decision, setDecision] = useState<'complete' | 'decline'>('complete')
  const [reason, setReason] = useState('')
  const [closeAccess, setCloseAccess] = useState(true)
  const [checked, setChecked] = useState<string[]>([])
  const [refused, setRefused] = useState<string[]>([])
  const w = useOwnerWrite(fetchImpl, onSession)
  const load = useCallback(async () => {
    const r = await call<PrivacyRequestDetail>(fetchImpl, `/staff/privacy-requests/${id}`)
    setD(r.ok ? r.data : 'error')
  }, [fetchImpl, id])
  useEffect(() => {
    void load()
  }, [load])
  if (d === null) return <StateView kind="loading" title={t('common.loading')} />
  if (d === 'error') return <StateView kind="error" title={t('privacy.loadFailed')} />
  const time = new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' })
  const after = (r: { ok: true; data: PrivacyRequestDetail } | { ok: false; error: ApiErrorBody }) => {
    if (r.ok) {
      setD(r.data)
      setRefused([])
      onChanged()
      return
    }
    setRefused(reasons(t, r.error))
    void load()
  }
  const startReview = () =>
    void w.send<PrivacyRequestDetail>(`/staff/privacy-requests/${d.id}/review`, {}, after, {
      'if-match': `"${d.version}"`,
    })
  const deletion = d.kind === 'deletion' && decision === 'complete'
  const missing = deletion ? d.plan.confirm.filter((c) => !checked.includes(c)) : []
  const decide = () =>
    void w.send<PrivacyRequestDetail>(
      `/staff/privacy-requests/${d.id}/decision`,
      {
        decision,
        reason,
        ...(deletion ? { confirmedChecks: checked, closeAccess } : {}),
      },
      after,
      { 'if-match': `"${d.version}"` },
    )
  const blockedReason = !reason.trim()
    ? t('privacy.decision.reasonFirst')
    : missing.length
      ? t('privacy.decision.checkFirst')
      : undefined
  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-title`} data-testid="privacy-detail">
      <h2 id={`${ids}-title`} className="hh-h3">
        {t('privacy.detail.title', { reference: d.reference, kind: codeLabel(t, 'privacyRequestKind', d.kind) })}
      </h2>
      <p>
        <StatusBadge tone={STATE_TONE[d.state]}>{codeLabel(t, 'privacyRequestState', d.state)}</StatusBadge>
      </p>
      <ul className="staff-queue__facts">
        <li>{t('privacy.detail.customer', { name: d.customer.name, project: d.project.reference })}</li>
        <li>
          {t('privacy.detail.contact', {
            name: d.contact.name,
            email: d.contact.email ?? '',
            phone: d.contact.phone ?? '',
          })}
        </li>
        <li>{t(d.account ? 'privacy.detail.fromAccount' : 'privacy.detail.fromLink')}</li>
        <li>{t('privacy.detail.identity')}</li>
        <li>{t('privacy.detail.submitted', { time: time.format(new Date(d.submittedAt)) })}</li>
        <li>{t('privacy.detail.deadline')}</li>
      </ul>
      {d.details ? (
        <>
          <h3 className="staff-queue__title">{t('privacy.detail.details')}</h3>
          <p className="staff-privacy__details">{d.details}</p>
        </>
      ) : null}
      <h3 id={`${ids}-plan`} className="staff-queue__title">
        {t('privacy.plan.title')}
      </h3>
      <p>{t('privacy.plan.intro')}</p>
      <ul aria-labelledby={`${ids}-plan`} className="staff-privacy__plan">
        {d.plan.items.map((i) => (
          <ItemLine key={`${i.category}-${i.disposition}-${i.reason ?? ''}`} t={t} locale={locale} i={i} />
        ))}
      </ul>
      <h3 id={`${ids}-checks`} className="staff-queue__title">
        {t('privacy.plan.checks')}
      </h3>
      <ul aria-labelledby={`${ids}-checks`}>
        {d.plan.checks.map((c) => (
          <li key={c.check}>
            {codeLabel(t, 'deletionCheck', c.check)}:{' '}
            {c.result === 'found' && c.count !== undefined
              ? t('retention.entry.found', { n: c.count })
              : codeLabel(t, 'retentionHoldResult', c.result)}
          </li>
        ))}
      </ul>
      {d.state === 'received' ? (
        <div className="hh-button-row">
          <Button pending={w.pending} onClick={startReview}>
            {t('privacy.review.start')}
          </Button>
        </div>
      ) : null}
      {d.state === 'under_review' ? (
        <form
          className="staff-privacy__decision"
          aria-label={t('privacy.decision.title')}
          onSubmit={(e) => {
            e.preventDefault()
            if (!blockedReason) decide()
          }}
        >
          <fieldset>
            <legend>{t('privacy.decision.title')}</legend>
            <label>
              <input
                type="radio"
                name={`${ids}-decision`}
                checked={decision === 'complete'}
                onChange={() => setDecision('complete')}
              />{' '}
              {t(COMPLETE_LABEL[d.kind])}
            </label>
            <label>
              <input
                type="radio"
                name={`${ids}-decision`}
                checked={decision === 'decline'}
                onChange={() => setDecision('decline')}
              />{' '}
              {t('privacy.decision.decline')}
            </label>
          </fieldset>
          {deletion ? (
            <>
              <p>
                {t('privacy.decision.deletes', {
                  estimates: d.plan.deletable.estimates.length,
                  accounts: d.plan.deletable.accountIds.length,
                })}
              </p>
              <label className="staff-retention__check">
                <input type="checkbox" checked={closeAccess} onChange={(e) => setCloseAccess(e.target.checked)} />{' '}
                {t('privacy.decision.closeAccess')}
              </label>
              <fieldset className="staff-retention__checks">
                <legend>{t('retention.delete.confirmChecks')}</legend>
                {d.plan.confirm.map((c) => (
                  <label key={c} className="staff-retention__check">
                    <input
                      type="checkbox"
                      checked={checked.includes(c)}
                      onChange={(e) =>
                        setChecked((cur) => (e.target.checked ? [...cur, c] : cur.filter((x) => x !== c)))
                      }
                    />{' '}
                    {t('retention.delete.checked', { check: codeLabel(t, 'deletionCheck', c) })}
                  </label>
                ))}
              </fieldset>
            </>
          ) : null}
          <Field
            label={t('privacy.decision.reason')}
            multiline
            name="reason"
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="hh-button-row">
            <Button
              type="submit"
              variant={deletion ? 'danger' : 'primary'}
              pending={w.pending}
              {...(blockedReason ? { disabledReason: blockedReason } : {})}
            >
              {t('privacy.decision.submit')}
            </Button>
          </div>
        </form>
      ) : null}
      {d.outcome ? (
        <section aria-labelledby={`${ids}-outcome`}>
          <h3 id={`${ids}-outcome`} className="staff-queue__title">
            {t('privacy.outcome.title')}
          </h3>
          {d.outcome.deleted.length ? (
            <ul>
              {d.outcome.deleted.map((x) => (
                <li key={x.category}>
                  {t('privacy.outcome.deleted', { category: codeLabel(t, 'privacyCategory', x.category), n: x.count })}
                </li>
              ))}
            </ul>
          ) : null}
          {d.outcome.retained.length ? (
            <ul aria-label={t('privacy.outcome.retained')}>
              {d.outcome.retained.map((i) => (
                <ItemLine key={`${i.category}-${i.reason ?? ''}`} t={t} locale={locale} i={i} />
              ))}
            </ul>
          ) : null}
          {d.outcome.accessClosed ? <p>{t('privacy.outcome.accessClosed')}</p> : null}
          {d.outcome.exportReady ? <p>{t('privacy.outcome.exportReady')}</p> : null}
          <p>{t('privacy.outcome.notice')}</p>
        </section>
      ) : null}
      <ReauthForm t={t} w={w} />
      {refused.length ? <StateView kind="error" title={t('privacy.decision.refused')} reasons={refused} /> : null}
    </section>
  )
}

export function PrivacyScreen({
  t,
  locale,
  fetchImpl,
  href,
  onSession,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  /** TSK-0149: the link to help with customer access below this screen. */
  href?: (path: string) => string
  onSession?: (s: { csrfToken: string }) => void
}) {
  const ids = useId()
  const [state, setState] = useState('')
  const [draft, setDraft] = useState('')
  const [items, setItems] = useState<PrivacyRequestItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [open, setOpen] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let live = true
    setStatus('loading')
    void call<{ items: PrivacyRequestItem[]; nextCursor: string | null }>(fetchImpl, privacyQuery(state)).then((r) => {
      if (!live) return
      if (!r.ok) return setStatus('error')
      setItems(r.data.items)
      setCursor(r.data.nextCursor)
      setStatus('ready')
    })
    return () => {
      live = false
    }
  }, [fetchImpl, state, reload])
  async function more() {
    if (!cursor) return
    const r = await call<{ items: PrivacyRequestItem[]; nextCursor: string | null }>(
      fetchImpl,
      privacyQuery(state, cursor),
    )
    if (!r.ok) return setStatus('error')
    setItems((cur) => [...cur, ...r.data.items])
    setCursor(r.data.nextCursor)
  }
  const time = new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' })
  return (
    <section className="staff-screen staff-privacy" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('nav.privacy')}
      </h1>
      <p>{t('privacy.intro')}</p>
      {href ? (
        <p>
          <a href={href('/access-help')}>{t('privacy.accessHelp')}</a>
        </p>
      ) : null}
      <form
        className="staff-queue__filters"
        aria-label={t('privacy.filter')}
        onSubmit={(e) => {
          e.preventDefault()
          setState(draft)
        }}
      >
        <div className="staff-queue__select">
          <label htmlFor={`${ids}-state`}>{t('privacy.state')}</label>
          <select id={`${ids}-state`} value={draft} onChange={(e) => setDraft(e.target.value)}>
            <option value="">{t('privacy.anyState')}</option>
            {(['received', 'under_review', 'completed', 'partially_completed', 'declined'] as const).map((s) => (
              <option key={s} value={s}>
                {codeLabel(t, 'privacyRequestState', s)}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary">
          {t('privacy.apply')}
        </Button>
      </form>
      {status === 'loading' ? (
        <StateView kind="loading" title={t('common.loading')} />
      ) : status === 'error' ? (
        <StateView kind="error" title={t('privacy.loadFailed')} />
      ) : items.length === 0 ? (
        <StateView kind="empty" title={t('privacy.empty')} />
      ) : (
        <ol className="staff-queue__items" aria-label={t('privacy.list')}>
          {items.map((r) => (
            <li key={r.id} className="staff-queue__item" aria-labelledby={`${ids}-${r.id}`}>
              <div className="staff-queue__head">
                <h2 id={`${ids}-${r.id}`} className="staff-queue__title">
                  {t('privacy.detail.title', {
                    reference: r.reference,
                    kind: codeLabel(t, 'privacyRequestKind', r.kind),
                  })}
                </h2>
                <StatusBadge tone={STATE_TONE[r.state]}>{codeLabel(t, 'privacyRequestState', r.state)}</StatusBadge>
              </div>
              <ul className="staff-queue__facts">
                <li>{t('privacy.detail.customer', { name: r.customer.name, project: r.project.reference })}</li>
                <li>{t('privacy.detail.submitted', { time: time.format(new Date(r.submittedAt)) })}</li>
              </ul>
              <Button variant="secondary" onClick={() => setOpen(open === r.id ? null : r.id)}>
                {t(open === r.id ? 'privacy.close' : 'privacy.open')}
              </Button>
              {open === r.id ? (
                <Detail
                  t={t}
                  locale={locale}
                  id={r.id}
                  fetchImpl={fetchImpl}
                  {...(onSession ? { onSession } : {})}
                  onChanged={() => setReload((n) => n + 1)}
                />
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {cursor && status === 'ready' ? (
        <Button variant="secondary" onClick={() => void more()}>
          {t('queue.loadMore')}
        </Button>
      ) : null}
    </section>
  )
}
