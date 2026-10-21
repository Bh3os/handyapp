// The Owner's system health screen and configuration view (TSK-0101; HH-NFR-02, S08, T12, T71). The server decides
// who may read them (dashboard.view, Owner only) and what they contain; these screens only show it. A check the
// system cannot observe arrives as unknown or not configured and is shown that way: only `ok` reads as healthy, and a
// screen that could not load says so instead of showing anything as fine. No secret, destination or message text is
// ever sent here.
import { labelKey, type StaffKey, type StaffLocale } from '@handyhub/i18n'
import { Button, StateView, StatusBadge, type StatusTone } from '@handyhub/ui'
import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { call, type Fetch } from './api'

type T = (key: StaffKey, values?: Record<string, string | number>) => string

export type HealthStatus = 'ok' | 'attention' | 'failed' | 'not_configured' | 'unknown'
export type HealthCheck = {
  id: string
  status: HealthStatus
  metrics: { id: string; value: number }[]
  oldestAt: string | null
  latestAt: string | null
  missing: string[]
  note: string | null
  sourceIds: string[]
  link: string | null
}
export type HealthReport = {
  checkedAt: string
  environment: string | null
  checks: HealthCheck[]
  providers: { channel: string; mode: string; provider: string | null; missing: string[] }[]
  webhookSecrets: { bird: boolean | null; resend: boolean | null }
  testDestinations: { emails: number; phones: number } | null
  failedJobs: {
    id: string
    automation: string
    targetType: string | null
    attempts: number
    maxAttempts: number
    errorClass: string | null
    failedAt: string
  }[]
  failedDeliveries: {
    id: string
    messageKey: string
    channel: string
    audience: string
    errorCode: string | null
    updatedAt: string
  }[]
  failedCallbacks: {
    jobId: string
    provider: string | null
    eventType: string | null
    attempts: number
    errorClass: string | null
    failedAt: string
  }[]
  uploadProblems: {
    id: string
    state: string
    reason: string | null
    contentType: string
    byteSize: number
    uploadedAt: string
    requestId: string | null
    reference: string | null
  }[]
  missingFromIntake: { requestId: string; reference: string; submittedAt: string }[]
}
export type ConfigurationView = {
  loadedAt: string
  entries: {
    key: string
    state: 'CONFIGURED' | 'NOT_CONFIGURED'
    version: number | null
    sourceIds: string[]
    proposed: boolean
    effectiveFrom: string | null
    fields: { path: string; value: string | number | boolean }[]
  }[]
  aiModule: 'AI_DISABLED'
  variables: { name: string; group: 'server' | 'providers'; set: boolean; secret: boolean }[] | null
}

const TONES: Record<HealthStatus, StatusTone> = {
  ok: 'success',
  attention: 'warning',
  failed: 'danger',
  not_configured: 'warning',
  unknown: 'neutral',
}

/** A catalog label for a code; the code itself when the catalog has none, so nothing is hidden. */
function label(t: T, key: string, fallback: string): string {
  try {
    return t(key as StaffKey)
  } catch {
    return fallback
  }
}

function formatTime(locale: StaffLocale, iso: string): string {
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))
}

type Props = {
  t: T
  locale: StaffLocale
  fetchImpl: Fetch
  go: (to: string) => void
  href: (to: string) => string
}

/** Loads one Owner-only report; `undefined` while loading, `null` when it could not be loaded. */
function useReport<D>(fetchImpl: Fetch, path: string, valid: (d: unknown) => d is D) {
  const [data, setData] = useState<D | null | undefined>(undefined)
  const [refused, setRefused] = useState(false)
  const load = useCallback(async () => {
    const r = await call<D>(fetchImpl, path)
    setRefused(!r.ok && (r.status === 403 || r.status === 401))
    setData(r.ok && valid(r.data) ? r.data : null)
  }, [fetchImpl, path, valid])
  useEffect(() => {
    void load()
  }, [load])
  return { data, refused, reload: load }
}

const isHealth = (d: unknown): d is HealthReport =>
  !!d && Array.isArray((d as HealthReport).checks) && Array.isArray((d as HealthReport).providers)
const isConfiguration = (d: unknown): d is ConfigurationView => !!d && Array.isArray((d as ConfigurationView).entries)

function InAppLink({
  to,
  go,
  href,
  children,
}: {
  to: string
  go: Props['go']
  href: Props['href']
  children: ReactNode
}) {
  return (
    <a
      href={href(to)}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        go(to)
      }}
    >
      {children}
    </a>
  )
}

function Unavailable({ t, refused, title, retry }: { t: T; refused: boolean; title: string; retry: () => void }) {
  if (refused) return <StateView kind="blocked" title={t('shell.notAllowed')} />
  return (
    <StateView kind="error" title={title} action={<Button onClick={retry}>{t('system.retry')}</Button>}>
      <p>{t('system.unavailableBody')}</p>
    </StateView>
  )
}

/** A detail list with its heading; says so when nothing is recorded. */
function Details<I>({
  t,
  id,
  title,
  items,
  render,
}: {
  t: T
  id: string
  title: string
  items: I[]
  render: (item: I) => { key: string; title: ReactNode; facts: ReactNode[] }
}) {
  return (
    <section className="staff-system__section" aria-labelledby={id}>
      <h2 id={id} className="staff-queue__heading">
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="staff-system__none">{t('system.health.none')}</p>
      ) : (
        <ul className="staff-queue__items">
          {items.map((item) => {
            const r = render(item)
            return (
              <li key={r.key} className="staff-queue__item">
                <p className="staff-queue__title">{r.title}</p>
                <ul className="staff-queue__facts">
                  {r.facts.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function CheckItem({ t, locale, check, go, href }: Omit<Props, 'fetchImpl'> & { check: HealthCheck }) {
  const name = label(t, labelKey('healthCheck', check.id), check.id)
  const status = label(t, labelKey('healthStatus', check.status), check.status)
  return (
    <li className="staff-queue__item" data-status={check.status} aria-label={`${name}: ${status}`}>
      <div className="staff-queue__head">
        <h3 className="staff-queue__title">{name}</h3>
        <StatusBadge tone={TONES[check.status] ?? 'neutral'}>{status}</StatusBadge>
      </div>
      {check.metrics.length > 0 ? (
        <dl className="staff-system__metrics">
          {check.metrics.map((m) => (
            <div key={m.id}>
              <dt>{label(t, labelKey('healthMetric', m.id), m.id)}</dt>
              <dd>{m.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {check.note ? (
        <p className="staff-queue__reason">{label(t, labelKey('healthNote', check.note), check.note)}</p>
      ) : null}
      <ul className="staff-queue__facts">
        {check.oldestAt ? <li>{t('system.health.oldest', { time: formatTime(locale, check.oldestAt) })}</li> : null}
        {check.latestAt ? <li>{t('system.health.latest', { time: formatTime(locale, check.latestAt) })}</li> : null}
        {check.missing.length > 0 ? (
          <li>
            {t('system.health.missing')} <code>{check.missing.join(', ')}</code>
          </li>
        ) : null}
        {check.sourceIds.length > 0 ? <li>{t('system.sources', { ids: check.sourceIds.join(', ') })}</li> : null}
      </ul>
      {check.link ? (
        <p className="staff-queue__action">
          <InAppLink to={check.link} go={go} href={href}>
            {check.link === '/settings' ? t('system.health.openSettings') : t('system.health.openQueue')}
          </InAppLink>
        </p>
      ) : null}
    </li>
  )
}

const secretState = (t: T, v: boolean | null) =>
  v === null ? t('system.unknown') : v ? t('system.set') : t('system.notSet')

/** System health (HH-NFR-02). */
export function HealthScreen(props: Props) {
  const { t, locale, fetchImpl, go, href } = props
  const { data, refused, reload } = useReport(fetchImpl, '/staff/system/health', isHealth)
  const [pending, setPending] = useState(false)
  const refresh = async () => {
    setPending(true)
    await reload()
    setPending(false)
  }
  return (
    <section className="staff-screen staff-system" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('nav.health')}
      </h1>
      <p>{t('system.health.intro')}</p>
      {data === undefined ? (
        <StateView kind="loading" title={t('common.loading')} />
      ) : data === null ? (
        <Unavailable t={t} refused={refused} title={t('system.health.loadFailed')} retry={() => void refresh()} />
      ) : (
        <>
          <div className="staff-queue__meta">
            <p className="staff-queue__refreshed">
              {t('system.health.checked', { time: formatTime(locale, data.checkedAt) })}
              {data.environment ? ` · ${t('system.health.environment', { name: data.environment })}` : ''}
            </p>
            <Button variant="secondary" pending={pending} onClick={() => void refresh()}>
              {t('system.refresh')}
            </Button>
          </div>
          <section className="staff-system__section" aria-labelledby="staff-system-checks">
            <h2 id="staff-system-checks" className="staff-queue__heading">
              {t('system.health.checks')}
            </h2>
            <ul className="staff-queue__items">
              {data.checks.map((c) => (
                <CheckItem key={c.id} t={t} locale={locale} check={c} go={go} href={href} />
              ))}
            </ul>
          </section>
          <section className="staff-system__section" aria-labelledby="staff-system-providers">
            <h2 id="staff-system-providers" className="staff-queue__heading">
              {t('system.health.providers')}
            </h2>
            <dl className="staff-record">
              {data.providers.map((p) => (
                <div key={p.channel} className="staff-system__pair">
                  <dt>{label(t, labelKey('providerChannel', p.channel), p.channel)}</dt>
                  <dd>
                    {label(t, labelKey('providerMode', p.mode), p.mode)}
                    {p.provider ? ` (${p.provider})` : ''}
                    {p.missing.length > 0 ? (
                      <>
                        {' · '}
                        {t('system.health.missing')} <code>{p.missing.join(', ')}</code>
                      </>
                    ) : null}
                  </dd>
                </div>
              ))}
              <div className="staff-system__pair">
                <dt>{t('system.health.webhookBird')}</dt>
                <dd>{secretState(t, data.webhookSecrets.bird)}</dd>
              </div>
              <div className="staff-system__pair">
                <dt>{t('system.health.webhookResend')}</dt>
                <dd>{secretState(t, data.webhookSecrets.resend)}</dd>
              </div>
              <div className="staff-system__pair">
                <dt>{t('system.health.testDestinations')}</dt>
                <dd>
                  {data.testDestinations
                    ? t('system.health.testDestinationCounts', {
                        emails: data.testDestinations.emails,
                        phones: data.testDestinations.phones,
                      })
                    : t('system.unknown')}
                </dd>
              </div>
            </dl>
          </section>
          <p className="staff-system__none">{t('system.health.listLimit')}</p>
          <Details
            t={t}
            id="staff-system-jobs"
            title={t('system.health.failedJobs')}
            items={data.failedJobs}
            render={(j) => ({
              key: j.id,
              title: <code>{j.automation}</code>,
              facts: [
                t('system.health.failedAt', { time: formatTime(locale, j.failedAt) }),
                t('system.health.attempts', { attempts: j.attempts, max: j.maxAttempts }),
                ...(j.errorClass ? [t('system.health.errorCode', { code: j.errorClass })] : []),
                ...(j.targetType ? [t('system.health.target', { type: j.targetType })] : []),
              ],
            })}
          />
          <Details
            t={t}
            id="staff-system-deliveries"
            title={t('system.health.failedDeliveries')}
            items={data.failedDeliveries}
            render={(d) => ({
              key: d.id,
              title: <code>{d.messageKey}</code>,
              facts: [
                t('system.health.failedAt', { time: formatTime(locale, d.updatedAt) }),
                label(t, labelKey('providerChannel', d.channel), d.channel),
                d.audience === 'staff' ? t('system.health.toStaff') : t('system.health.toCustomer'),
                ...(d.errorCode ? [t('system.health.errorCode', { code: d.errorCode })] : []),
              ],
            })}
          />
          <Details
            t={t}
            id="staff-system-callbacks"
            title={t('system.health.failedCallbacks')}
            items={data.failedCallbacks}
            render={(c) => ({
              key: c.jobId,
              title: c.provider ? label(t, labelKey('healthCheck', `callbacks_${c.provider}`), c.provider) : '—',
              facts: [
                t('system.health.failedAt', { time: formatTime(locale, c.failedAt) }),
                ...(c.eventType ? [t('system.health.event', { type: c.eventType })] : []),
                t('system.health.attemptsOnly', { attempts: c.attempts }),
                ...(c.errorClass ? [t('system.health.errorCode', { code: c.errorClass })] : []),
              ],
            })}
          />
          <Details
            t={t}
            id="staff-system-uploads"
            title={t('system.health.uploadProblems')}
            items={data.uploadProblems}
            render={(p) => ({
              key: p.id,
              title:
                p.state === 'rejected'
                  ? t('system.health.photoRejected', {
                      reason: p.reason ? label(t, labelKey('photoRejection', p.reason), p.reason) : '—',
                    })
                  : t('system.health.photoWaiting'),
              facts: [
                t('system.health.uploaded', { time: formatTime(locale, p.uploadedAt) }),
                t('system.health.photoFile', { type: p.contentType, bytes: p.byteSize }),
                p.requestId && p.reference ? (
                  <InAppLink to={`/requests/${p.requestId}`} go={go} href={href}>
                    {t('system.health.request', { reference: p.reference })}
                  </InAppLink>
                ) : (
                  t('system.health.noRequest')
                ),
              ],
            })}
          />
          <Details
            t={t}
            id="staff-system-intake"
            title={t('system.health.missingFromIntake')}
            items={data.missingFromIntake}
            render={(m) => ({
              key: m.requestId,
              title: (
                <InAppLink to={`/requests/${m.requestId}`} go={go} href={href}>
                  {t('system.health.request', { reference: m.reference })}
                </InAppLink>
              ),
              facts: [t('system.health.submitted', { time: formatTime(locale, m.submittedAt) })],
            })}
          />
        </>
      )}
    </section>
  )
}

function fieldValue(v: string | number | boolean): string {
  return typeof v === 'string' ? v : String(v)
}

/** The configuration view (S08): every key, its value or NOT CONFIGURED, its version and sources. Read-only. */
export function ConfigurationScreen(props: Props) {
  const { t, locale, fetchImpl } = props
  const { data, refused, reload } = useReport(fetchImpl, '/staff/system/configuration', isConfiguration)
  const missing = data ? data.entries.filter((e) => e.state === 'NOT_CONFIGURED').length : 0
  const proposed = data ? data.entries.filter((e) => e.state === 'CONFIGURED' && e.proposed).length : 0
  return (
    <section className="staff-screen staff-system" aria-labelledby="staff-screen-title">
      <h1 id="staff-screen-title" className="hh-h3">
        {t('nav.settings')}
      </h1>
      <p>{t('system.config.intro')}</p>
      {data === undefined ? (
        <StateView kind="loading" title={t('common.loading')} />
      ) : data === null ? (
        <Unavailable t={t} refused={refused} title={t('system.config.loadFailed')} retry={() => void reload()} />
      ) : (
        <>
          <p className="staff-queue__refreshed">
            {t('system.config.summary', {
              configured: data.entries.length - missing,
              missing,
              proposed,
            })}
          </p>
          <p>
            <StatusBadge tone="neutral">{t('system.config.aiDisabled')}</StatusBadge>
          </p>
          <ul className="staff-queue__items" aria-label={t('system.config.values')}>
            {data.entries.map((e) => {
              const name = label(t, labelKey('configKey', e.key), e.key)
              const configured = e.state === 'CONFIGURED'
              return (
                <li key={e.key} className="staff-queue__item" data-state={e.state} aria-label={name}>
                  <div className="staff-queue__head">
                    <h2 className="staff-queue__title">{name}</h2>
                    <StatusBadge tone={configured ? 'success' : 'warning'}>
                      {configured ? t('system.config.configured') : t('system.config.notConfigured')}
                    </StatusBadge>
                    {e.proposed ? <StatusBadge tone="info">{t('system.config.proposed')}</StatusBadge> : null}
                  </div>
                  <ul className="staff-queue__facts">
                    <li>
                      <code>{e.key}</code>
                    </li>
                    {e.version !== null ? <li>{t('system.config.version', { version: e.version })}</li> : null}
                    {e.effectiveFrom ? (
                      <li>{t('system.config.effective', { time: formatTime(locale, e.effectiveFrom) })}</li>
                    ) : null}
                    <li>
                      {e.sourceIds.length > 0
                        ? t('system.sources', { ids: e.sourceIds.join(', ') })
                        : t('system.config.noSources')}
                    </li>
                  </ul>
                  {configured && e.fields.length > 0 ? (
                    <dl className="staff-system__fields">
                      {e.fields.map((f) => (
                        <div key={f.path}>
                          <dt>
                            <code>{f.path}</code>
                          </dt>
                          <dd>
                            <code>{fieldValue(f.value)}</code>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <section className="staff-system__section" aria-labelledby="staff-system-variables">
            <h2 id="staff-system-variables" className="staff-queue__heading">
              {t('system.config.variables')}
            </h2>
            <p>{t('system.config.variablesIntro')}</p>
            {data.variables === null ? (
              <StateView kind="empty" title={t('system.config.variablesUnknown')} />
            ) : (
              <dl className="staff-record">
                {data.variables.map((v) => (
                  <div key={v.name} className="staff-system__pair">
                    <dt>
                      <code>{v.name}</code>
                    </dt>
                    <dd>
                      {v.set ? t('system.set') : t('system.notSet')}
                      {v.secret ? ` · ${t('system.config.secret')}` : ''}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        </>
      )}
    </section>
  )
}
