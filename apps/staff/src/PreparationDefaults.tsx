// The Owner's default preparation instructions for window offers (TSK-0146; OWN-DEC-194 B7, HH-CUS-02, OWN-DEC-180,
// RULE-NO-INVENTED-FACTS, RULE-SERVER-AUTHZ). On the settings screen, shown only to the Owner (the server answers
// FORBIDDEN to anyone else, and the section then stays hidden):
// - every service with the reviewed "Getting ready" steps of its approved page version (TSK-0132), the default in
//   force (NOT CONFIGURED until the Owner approves one: offers then start empty) and every version approved;
// - the Owner approves the reviewed steps as they are, approves an edited text (with an optional reason), or removes
//   the default. Each approval is the service's next version; the unsafe-instruction rules are shown while the Owner
//   types, and the server refuses the same. Offers already made keep their instructions.
import { preparationProblems } from '@handyhub/domain/preparation'
import type { StaffKey, StaffLocale } from '@handyhub/i18n'
import { Button, Field, StateView, StatusBadge } from '@handyhub/ui'
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react'
import { call, idempotencyKey, type ApiErrorBody, type Fetch } from './api'
import { codeLabel } from './Requests'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

type DefaultVersion = {
  id: string
  version: number
  text: string | null
  basis: string
  serviceVersion: number | null
  reason: string | null
  approvedBy: { id: string; name: string | null }
  approvedAt: string
}
export type ServiceDefault = {
  serviceId: string
  code: string
  category: string
  name: string
  servicePage: { version: number; text: string | null; problems: string[] } | null
  current: DefaultVersion | null
  version: number
  history: DefaultVersion[]
}

const bcp47 = (locale: StaffLocale) => (locale === 'es' ? 'es-US' : 'en-US')

/** The refusal in words: each field's code, else the error's own code. */
function refusal(t: T, error: ApiErrorBody): string[] {
  const codes = error.fieldErrors.length ? error.fieldErrors.map((f) => f.code) : [error.code]
  return [...new Set(codes)].map((c) => codeLabel(t, 'preparationProblem', c))
}

function ServiceEntry({
  t,
  locale,
  fetchImpl,
  service,
  onSaved,
}: {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  service: ServiceDefault
  onSaved: () => void
}) {
  const ids = useId()
  const page = service.servicePage
  const [text, setText] = useState(service.current?.text ?? page?.text ?? '')
  const [reason, setReason] = useState('')
  const [problem, setProblem] = useState<string[] | null>(null)
  const [pending, setPending] = useState(false)
  const when = (iso: string) =>
    new Intl.DateTimeFormat(bcp47(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
  const unsafe = preparationProblems(text)
  // A new version (this Owner's or another session's): the text starts again from what is in force.
  const inForce = service.current?.text ?? page?.text ?? ''
  useEffect(() => setText(inForce), [service.version, inForce])

  async function send(body: Record<string, unknown>) {
    setPending(true)
    const r = await call(fetchImpl, `/staff/services/${encodeURIComponent(service.serviceId)}/preparation-defaults`, {
      method: 'POST',
      headers: { 'idempotency-key': idempotencyKey() },
      body: { ...body, ...(reason.trim() ? { reason: reason.trim() } : {}), currentVersion: service.version },
    })
    setPending(false)
    if (!r.ok) return setProblem(refusal(t, r.error))
    setProblem(null)
    setReason('')
    onSaved()
  }
  function approveText(e: FormEvent) {
    e.preventDefault()
    void send({ source: 'text', text })
  }

  return (
    <details className="staff-request__check" data-testid="preparation-service">
      <summary>
        {service.name}{' '}
        <StatusBadge tone={service.current ? 'success' : 'warning'}>
          {service.current
            ? t('preparation.approved', { version: service.current.version })
            : t('preparation.notConfigured')}
        </StatusBadge>
      </summary>
      <h3 className="hh-h4">{t('preparation.page', { version: page?.version ?? '—' })}</h3>
      {page?.text ? (
        <p className="staff-preparation__text" data-testid="preparation-page">
          {page.text}
        </p>
      ) : (
        <p className="staff-request__hint">{t('preparation.pageMissing')}</p>
      )}
      <h3 className="hh-h4">{t('preparation.current')}</h3>
      {service.current ? (
        <>
          <p className="staff-preparation__text" data-testid="preparation-current">
            {service.current.text}
          </p>
          <p className="staff-request__hint">
            {t('preparation.approvedBy', {
              basis: codeLabel(t, 'preparationDefaultBasis', service.current.basis),
              name: service.current.approvedBy.name ?? t('queue.unnamed'),
              time: when(service.current.approvedAt),
            })}
          </p>
        </>
      ) : (
        <p className="staff-request__hint" data-testid="preparation-current-missing">
          {t('preparation.currentMissing')}
        </p>
      )}
      {page?.text && service.current?.text !== page.text ? (
        <div className="hh-button-row">
          <Button pending={pending} onClick={() => void send({ source: 'service_page' })}>
            {t('preparation.usePage')}
          </Button>
        </div>
      ) : null}
      <form className="staff-request__form" onSubmit={approveText} aria-labelledby={`${ids}-edit`}>
        <h3 id={`${ids}-edit`} className="hh-h4">
          {t('preparation.edit')}
        </h3>
        <Field
          label={t('preparation.text')}
          multiline
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {unsafe.length ? (
          <StateView
            kind="error"
            title={t('offers.prep.unsafe')}
            reasons={unsafe.map((u) =>
              t('offers.prep.unsafeMatch', { rule: codeLabel(t, 'preparationRule', u.rule), match: u.match }),
            )}
          />
        ) : null}
        <Field label={t('preparation.reason')} value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="hh-button-row">
          <Button type="submit" pending={pending}>
            {t('preparation.approveText')}
          </Button>
          {service.current ? (
            <Button variant="secondary" pending={pending} onClick={() => void send({ source: 'none' })}>
              {t('preparation.remove')}
            </Button>
          ) : null}
        </div>
      </form>
      {problem ? <StateView kind="error" title={t('preparation.refused')} reasons={problem} /> : null}
      {service.history.length ? (
        <>
          <h3 className="hh-h4">{t('preparation.history')}</h3>
          <ul className="staff-request__list" data-testid="preparation-history">
            {service.history.map((h) => (
              <li key={h.id}>
                {t('preparation.historyEntry', {
                  version: h.version,
                  basis: codeLabel(t, 'preparationDefaultBasis', h.basis),
                  name: h.approvedBy.name ?? t('queue.unnamed'),
                  time: when(h.approvedAt),
                })}
                {h.reason ? ` ${t('preparation.historyReason', { reason: h.reason })}` : ''}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </details>
  )
}

/** The settings section: every service's default preparation instructions for offers (the Owner only). */
export function PreparationDefaultsSetting({ t, locale, fetchImpl }: { t: T; locale: StaffLocale; fetchImpl: Fetch }) {
  const ids = useId()
  const [services, setServices] = useState<ServiceDefault[] | null>(null)
  const load = useCallback(async () => {
    const r = await call<{ services: ServiceDefault[] }>(fetchImpl, '/staff/preparation-defaults')
    setServices(r.ok && Array.isArray(r.data?.services) ? r.data.services : null)
  }, [fetchImpl])
  useEffect(() => {
    void load()
  }, [load])
  if (!services) return null
  const approved = services.filter((s) => s.current).length
  return (
    <section className="staff-request__section" aria-labelledby={`${ids}-prep`} data-testid="preparation-defaults">
      <h2 id={`${ids}-prep`} className="staff-queue__heading">
        {t('preparation.title')}
      </h2>
      <p className="staff-request__hint">{t('preparation.hint')}</p>
      <p className="staff-request__hint">{t('preparation.count', { approved, total: services.length })}</p>
      {services.map((s) => (
        <ServiceEntry
          key={s.serviceId}
          t={t}
          locale={locale}
          fetchImpl={fetchImpl}
          service={s}
          onSaved={() => void load()}
        />
      ))}
    </section>
  )
}
