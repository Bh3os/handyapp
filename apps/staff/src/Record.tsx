// A request's record, as the action queue's deep link opens it (TSK-0041; HH-OPS-02). Until the full request view
// (original submission and the four actions) exists, the record shows its header from the server: reference, status,
// submission time, services and the responsible staff member, and says the rest is not available yet.
import { labelKey, type StaffKey, type StaffLocale } from '@handyhub/i18n'
import { StateView } from '@handyhub/ui'
import { useEffect, useState, type MouseEvent } from 'react'
import { call, type Fetch } from './api'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

type Summary = {
  id: string
  reference: string
  state: string
  submittedAt: string
  services: string[]
  responsibleStaff: { id: string; name: string | null } | null
}

function label(t: T, key: string, fallback: string): string {
  try {
    return t(key as StaffKey)
  } catch {
    return fallback
  }
}

export function RequestRecord({
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
  const [summary, setSummary] = useState<Summary | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    void call<Summary>(fetchImpl, `/staff/requests/${encodeURIComponent(id)}/summary`).then((r) => {
      if (live) setSummary(r.ok && typeof r.data?.reference === 'string' ? r.data : null)
    })
    return () => {
      live = false
    }
  }, [fetchImpl, id])
  const back = (
    <a
      href={href('/')}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        go('/')
      }}
    >
      {t('record.back')}
    </a>
  )
  if (summary === undefined) return <StateView kind="loading" title={t('common.loading')} />
  if (summary === null)
    return (
      <section className="staff-screen">
        <StateView kind="blocked" title={t('record.notFound')} />
        <p>{back}</p>
      </section>
    )
  const when = new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(summary.submittedAt))
  return (
    <section className="staff-screen" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('record.request.heading', { reference: summary.reference })}
      </h1>
      <dl className="staff-record">
        <dt>{t('record.request.status')}</dt>
        <dd>{label(t, labelKey('requestState', summary.state), summary.state)}</dd>
        <dt>{t('record.request.submitted')}</dt>
        <dd>{when}</dd>
        <dt>{t('record.request.services')}</dt>
        <dd>{summary.services.map((code) => label(t, labelKey('service', code), code)).join(', ')}</dd>
        <dt>{t('record.request.responsible')}</dt>
        <dd>
          {summary.responsibleStaff ? (summary.responsibleStaff.name ?? t('queue.unnamed')) : t('queue.unassigned')}
        </dd>
      </dl>
      <StateView kind="empty" title={t('record.request.fullViewLater')} />
      <p>{back}</p>
    </section>
  )
}
