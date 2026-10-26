// /portal/properties: the signed-in account's saved properties (TSK-0113; HH-ID-12, HH-ID-03, OWN-DEC-113). The
// addresses of the account's own projects, one per address: the customer names one (Save property), renames or
// removes a name, and starts a new request from a named one (the request form starts from that address and asks the
// customer to confirm it is still current). The address itself is the project's; it is corrected on a new request,
// never here. Only the account's own history is listed (the server answers anything else NOT_FOUND). The wording is
// PROPOSED (OQ-SAVED-PROPERTIES-DETAILS).
import type { CustomerKey } from '@handyhub/i18n'
import { Button, Field } from '@handyhub/ui'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  portalApi,
  type AccountProperty,
  type Fetch,
  type Failure,
  type PropertyAddress,
  type SettingsFailure,
} from './api'
import { t } from './labels'
import { NotShown } from './States'

type Load =
  | { phase: 'loading' }
  | { phase: 'failed'; failure: Failure; retrying: boolean }
  | { phase: 'ready'; data: AccountProperty[] }

const PROPERTY_TYPE: Record<PropertyAddress['propertyType'], CustomerKey> = {
  house: 'request.property.house',
  apartment_condo: 'request.property.apartment_condo',
  townhouse: 'request.property.townhouse',
  rental_short_term: 'request.property.rental_short_term',
}

const PROBLEM: Record<SettingsFailure, CustomerKey> = {
  expired: 'portal.expired.title',
  unavailable: 'portal.properties.error.failed',
  invalid_label: 'portal.properties.error.label',
  label_in_use: 'portal.properties.error.labelInUse',
  already_saved: 'portal.properties.error.alreadySaved',
  texts_on_request_form: 'portal.properties.error.failed',
  rate_limited: 'portal.estimate.failure.rate_limited',
  failed: 'portal.properties.error.failed',
}

/** PROPOSED: a property name is 1 to 60 characters (the server checks the same). */
const LABEL_MAX = 60
const validLabel = (s: string) => s.trim().length >= 1 && s.trim().length <= LABEL_MAX

/** The address as it is written on an envelope, one line. */
export function addressLine(a: PropertyAddress): string {
  return `${[a.street, a.unit].filter(Boolean).join(', ')}, ${a.city}, ${a.state} ${a.zip}`
}

function Address({ a }: { a: PropertyAddress }) {
  return (
    <p>
      {addressLine(a)}
      <br />
      <span className="hh-small hh-muted">{t(PROPERTY_TYPE[a.propertyType])}</span>
    </p>
  )
}

type Act = (
  run: () => ReturnType<typeof portalApi.saveProperty>,
  done: string,
) => Promise<{ ok: true } | { ok: false; problem: CustomerKey }>

function Saved({
  p,
  act,
  fetchImpl,
}: {
  p: AccountProperty & { saved: { id: string; label: string } }
  act: Act
  fetchImpl: Fetch
}) {
  const [renaming, setRenaming] = useState(false)
  const [label, setLabel] = useState(p.saved.label)
  const [error, setError] = useState<CustomerKey | null>(null)
  const [busy, setBusy] = useState<'rename' | 'remove' | null>(null)
  const input = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (renaming) input.current?.querySelector('input')?.focus()
  }, [renaming])

  const rename = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!validLabel(label)) return setError('portal.properties.error.label')
    setBusy('rename')
    const r = await act(
      () => portalApi.renameProperty(fetchImpl, p.saved.id, label),
      t('portal.properties.done.renamed', { label: label.trim() }),
    )
    setBusy(null)
    if (!r.ok) return setError(r.problem)
    setError(null)
    setRenaming(false)
  }

  return (
    <li className="portal-properties__item" aria-label={p.saved.label}>
      <h3 className="hh-h3">{p.saved.label}</h3>
      <Address a={p.address} />
      {renaming ? (
        <form className="portal-claim__form" onSubmit={(e) => void rename(e)} noValidate>
          <div ref={input} className="portal-properties__field">
            <Field
              label={t('portal.properties.label')}
              name={`rename-${p.saved.id}`}
              autoComplete="off"
              maxLength={LABEL_MAX + 20}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              {...(error ? { error: t(error) } : {})}
            />
          </div>
          <p className="portal-properties__actions">
            <Button type="submit" pending={busy === 'rename'}>
              {t('portal.properties.renameSubmit')}
            </Button>
            <Button
              type="button"
              variant="quiet"
              onClick={() => {
                setRenaming(false)
                setLabel(p.saved.label)
                setError(null)
              }}
            >
              {t('portal.properties.cancel')}
            </Button>
          </p>
        </form>
      ) : (
        <p className="portal-properties__actions">
          <a
            className="hh-button hh-button--primary"
            href={`/request?property=${encodeURIComponent(p.saved.id)}`}
            aria-label={t('portal.properties.requestLabel', { label: p.saved.label })}
          >
            {t('portal.properties.request')}
          </a>
          <Button
            variant="secondary"
            aria-label={t('portal.properties.renameLabel', { label: p.saved.label })}
            onClick={() => setRenaming(true)}
          >
            {t('portal.properties.rename')}
          </Button>
          <Button
            variant="quiet"
            pending={busy === 'remove'}
            aria-label={t('portal.properties.removeLabel', { label: p.saved.label })}
            onClick={() => {
              if (busy) return
              setBusy('remove')
              void act(
                () => portalApi.removeProperty(fetchImpl, p.saved.id),
                t('portal.properties.done.removed', { label: p.saved.label }),
              ).then(() => setBusy(null))
            }}
          >
            {t('portal.properties.remove')}
          </Button>
        </p>
      )}
    </li>
  )
}

function Unsaved({ p, act, fetchImpl }: { p: AccountProperty; act: Act; fetchImpl: Fetch }) {
  const [label, setLabel] = useState('')
  const [error, setError] = useState<CustomerKey | null>(null)
  const [busy, setBusy] = useState(false)
  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!validLabel(label)) return setError('portal.properties.error.label')
    setBusy(true)
    const r = await act(
      () => portalApi.saveProperty(fetchImpl, p.reference, label),
      t('portal.properties.done.saved', { label: label.trim() }),
    )
    setBusy(false)
    if (!r.ok) return setError(r.problem)
    setError(null)
    setLabel('')
  }
  return (
    <li className="portal-properties__item" aria-label={addressLine(p.address)}>
      <Address a={p.address} />
      <p className="hh-small hh-muted">{t('portal.properties.fromProject', { reference: p.reference })}</p>
      <form className="portal-claim__form" onSubmit={(e) => void save(e)} noValidate>
        <Field
          label={t('portal.properties.label')}
          hint={t('portal.properties.labelHint')}
          name={`label-${p.reference}`}
          autoComplete="off"
          maxLength={LABEL_MAX + 20}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          {...(error ? { error: t(error) } : {})}
        />
        <Button type="submit" variant="secondary" pending={busy}>
          {t('portal.properties.save')}
        </Button>
      </form>
    </li>
  )
}

export function SavedPropertiesPage({ fetchImpl }: { fetchImpl: Fetch }) {
  const [load, setLoad] = useState<Load>({ phase: 'loading' })
  const [notice, setNotice] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    setLoad((l) => (l.phase === 'failed' ? { ...l, retrying: true } : l))
    const r = await portalApi.properties(fetchImpl)
    setLoad(r.ok ? { phase: 'ready', data: r.data } : { phase: 'failed', failure: r.failure, retrying: false })
  }, [fetchImpl])
  useEffect(() => {
    void refresh()
  }, [refresh])

  const act = useCallback<Act>(async (run, done) => {
    setNotice(null)
    const r = await run()
    if (r.ok) {
      setLoad({ phase: 'ready', data: r.data })
      setNotice(done)
      return { ok: true }
    }
    if (r.failure === 'expired') setLoad({ phase: 'failed', failure: 'expired', retrying: false })
    return { ok: false, problem: PROBLEM[r.failure] }
  }, [])

  return (
    <>
      <p className="portal-back">
        <a href="/portal/">{t('portal.account.back')}</a>
      </p>
      <h1 className="hh-h2">{t('portal.properties.title')}</h1>
      {load.phase !== 'ready' ? (
        <NotShown
          live={load}
          loading="portal.properties.loading"
          failedTitle="portal.properties.failed"
          onRetry={() => void refresh()}
        />
      ) : (
        <>
          <p>{t('portal.properties.intro')}</p>
          <p role="status" className="portal-claim__notice">
            {notice ?? ''}
          </p>
          <section className="portal-dashboard__section" aria-labelledby="portal-properties-saved">
            <h2 id="portal-properties-saved" className="hh-h3">
              {t('portal.properties.saved')}
            </h2>
            {load.data.some((p) => p.saved) ? (
              <ul className="portal-projects">
                {load.data.flatMap((p) =>
                  p.saved
                    ? [<Saved key={p.saved.id} p={{ ...p, saved: p.saved }} act={act} fetchImpl={fetchImpl} />]
                    : [],
                )}
              </ul>
            ) : (
              <p className="hh-muted">{t('portal.properties.savedEmpty')}</p>
            )}
          </section>
          <section className="portal-dashboard__section" aria-labelledby="portal-properties-other">
            <h2 id="portal-properties-other" className="hh-h3">
              {t('portal.properties.other')}
            </h2>
            {load.data.some((p) => !p.saved) ? (
              <ul className="portal-projects">
                {load.data.flatMap((p) =>
                  p.saved ? [] : [<Unsaved key={p.reference} p={p} act={act} fetchImpl={fetchImpl} />],
                )}
              </ul>
            ) : (
              <p className="hh-muted">
                {load.data.length === 0 ? t('portal.properties.otherEmpty') : t('portal.properties.otherNone')}
              </p>
            )}
          </section>
        </>
      )}
    </>
  )
}
