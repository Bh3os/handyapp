// The request wizard shell (TSK-0026; HH-INT-01, HH-INT-08, HH-INT-09, C02, OWN-DEC-87, OWN-DEC-93). A React island on
// /request: the "How would you like to continue?" choice, five steps with progress, client validation with the
// server's own schema, an accessible error summary that receives focus, server field errors shown beside their
// fields without losing input, and the browser draft with Resume and Clear Draft. Every label comes from the
// customer catalog (English only, RULE-LANGUAGES). The step contents are deliberately plain; TSK-0027..0030 refine
// each step (category cards, service questions, photos, SMS opt-in and consent, the final review).
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { Button, Dialog, Field, StateView } from '@handyhub/ui'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { DraftStore } from './draft.js'
import {
  CONTACT_CHANNELS,
  EMPTY_VALUES,
  ESTIMATE_PREFERENCES,
  fromServer,
  MAX_SERVICES,
  problemKey,
  PROPERTY_TYPES,
  STEPS,
  stepOf,
  TIME_WINDOWS,
  toBody,
  validate,
  type FormMeta,
  type FormValues,
  type Problem,
  type StepId,
} from './form.js'

export type WizardService = { id: string; name: string; category: string }

const t = (key: CustomerKey, values?: Record<string, string | number>) => customerTranslator().t(key, values)

// Every label by code, written out so the catalog check sees each key (RULE-LANGUAGES).
const CATEGORY_LABEL: Record<string, CustomerKey> = {
  home_improvement: 'request.category.home_improvement',
  drywall: 'request.category.drywall',
  painting: 'request.category.painting',
  cleaning: 'request.category.cleaning',
}
const PROPERTY_LABEL: Record<(typeof PROPERTY_TYPES)[number], CustomerKey> = {
  house: 'request.property.house',
  apartment_condo: 'request.property.apartment_condo',
  townhouse: 'request.property.townhouse',
  rental_short_term: 'request.property.rental_short_term',
}
const WINDOW_LABEL: Record<(typeof TIME_WINDOWS)[number], CustomerKey> = {
  mornings: 'request.timing.mornings',
  afternoons: 'request.timing.afternoons',
  evenings: 'request.timing.evenings',
  weekends: 'request.timing.weekends',
  any_time: 'request.timing.any_time',
}
const CHANNEL_LABEL: Record<(typeof CONTACT_CHANNELS)[number], CustomerKey> = {
  email: 'request.contact.email_channel',
  call: 'request.contact.call',
  text: 'request.contact.text',
}
const ESTIMATE_LABEL: Record<(typeof ESTIMATE_PREFERENCES)[number], CustomerKey> = {
  online: 'request.estimate.online',
  site_visit: 'request.estimate.site_visit',
  let_handyhub_decide: 'request.estimate.let_handyhub_decide',
}
const label = <T extends string>(map: Record<T, CustomerKey>, code: string): string =>
  Object.hasOwn(map, code) ? t(map[code as T]) : ''

/** PROPOSED: the form and privacy-notice versions until the notice exists (TSK-0024). */
const FORM_VERSION = 'wizard-1'
const PRIVACY_NOTICE_VERSION = 'none-yet'
const IDENTITY = 'guest'

const STEP_LABEL: Record<StepId, CustomerKey> = {
  services: 'request.step.services',
  job: 'request.step.job',
  property: 'request.step.property',
  contact: 'request.step.contact',
  review: 'request.step.review',
}

/** The fields the error summary links to, by body path; a deeper path (`services.1.serviceId`) uses its group. */
const FIELD_LABEL: Record<string, CustomerKey> = {
  services: 'request.services.select',
  otherServicesText: 'request.services.other',
  description: 'request.job.description',
  'property.street': 'request.property.street',
  'property.unit': 'request.property.unit',
  'property.city': 'request.property.city',
  'property.state': 'request.property.state',
  'property.zip': 'request.property.zip',
  'property.propertyType': 'request.property.type',
  'timing.preferredDate': 'request.timing.date',
  'timing.windows': 'request.timing.windows',
  estimatePreference: 'request.estimate.title',
  'contact.fullName': 'request.contact.fullName',
  'contact.email': 'request.contact.email',
  'contact.phone': 'request.contact.phone',
  'contact.preferredChannel': 'request.contact.channel',
}

function fieldOf(path: string): string {
  const known = Object.keys(FIELD_LABEL)
    .filter((f) => path === f || path.startsWith(`${f}.`))
    .sort((a, b) => b.length - a.length)
  return known[0] ?? path
}

type Phase = 'loading' | 'draftFound' | 'choose' | 'dismissed' | 'form' | 'sent'
type Settings = { draftDays: number | null; timeZone: string | null }
type Banner = { kind: 'error'; message: string } | { kind: 'success'; message: string } | null

function browserStorage(): Storage | null {
  try {
    const s = window.localStorage
    const probe = '__hh_probe__'
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  } catch {
    return null
  }
}

async function hash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export default function RequestWizard({ services }: { services: WizardService[] }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES)
  const [step, setStep] = useState<StepId>('services')
  const [problems, setProblems] = useState<Problem[]>([])
  const [banner, setBanner] = useState<Banner>(null)
  const [settings, setSettings] = useState<Settings>({ draftDays: null, timeZone: null })
  const [sending, setSending] = useState(false)
  const [reference, setReference] = useState<string | null>(null)
  const [website, setWebsite] = useState('')
  const started = useRef(Date.now())
  const attempt = useRef<{ key: string; bodyHash: string } | null>(null)
  const summaryRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusSummary = useRef(false)
  const focusHeading = useRef(false)

  const loaded = phase !== 'loading'
  const store = useMemo(
    () => (loaded ? new DraftStore(browserStorage(), IDENTITY, settings.draftDays) : null),
    [loaded, settings.draftDays],
  )
  const known = useMemo(() => new Set(services.map((s) => s.id)), [services])

  // Settings first (the configured draft period), then any saved draft.
  useEffect(() => {
    let live = true
    fetch('/api/v1/public/request-form', { headers: { accept: 'application/json' } })
      .then(async (r) => (r.ok ? ((await r.json()) as Settings) : { draftDays: null, timeZone: null }))
      .catch(() => ({ draftDays: null, timeZone: null }))
      .then((s) => {
        if (!live) return
        setSettings(s)
        const draft = new DraftStore(browserStorage(), IDENTITY, s.draftDays).load()
        const preselect = new URLSearchParams(window.location.search).get('service')
        if (preselect && known.has(preselect)) setValues((v) => ({ ...v, services: [preselect] }))
        setPhase(draft ? 'draftFound' : 'choose')
      })
    return () => {
      live = false
    }
  }, [known])

  useEffect(() => {
    if (phase !== 'form' || !store) return
    // Nothing entered yet: nothing to keep.
    if (step === 'services' && JSON.stringify(values) === JSON.stringify(EMPTY_VALUES)) store.clear()
    else store.save(values, step)
  }, [phase, store, values, step])

  useEffect(() => {
    if (focusSummary.current && summaryRef.current) summaryRef.current.focus()
    else if (focusHeading.current && headingRef.current) headingRef.current.focus()
    focusSummary.current = false
    focusHeading.current = false
  })

  const meta: FormMeta = {
    formVersion: FORM_VERSION,
    privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    startedAt: started.current,
    ...(website ? { website } : {}),
  }
  const opts = {
    now: new Date(),
    zone: settings.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    knownServices: known,
  }
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setValues((v) => ({ ...v, [key]: value }))
  const errorFor = (field: string) => {
    const p = problems.find((x) => fieldOf(x.field) === field)
    return p ? t(problemKey(p.code)) : undefined
  }
  const show = (found: Problem[], to?: StepId) => {
    setProblems(found)
    if (to) setStep(to)
    focusSummary.current = found.length > 0
  }
  const goTo = (to: StepId) => {
    setProblems([])
    setBanner(null)
    setStep(to)
    focusHeading.current = true
  }
  const index = STEPS.indexOf(step)

  const next = () => {
    const mine = validate(values, meta, opts).filter((p) => stepOf(p.field) === step)
    if (mine.length) return show(mine)
    goTo(STEPS[index + 1] ?? 'review')
  }

  const send = async () => {
    const all = validate(values, meta, opts)
    if (all.length) return show(all, stepOf(all[0]?.field ?? '') as StepId)
    const body = toBody(values, meta)
    const text = JSON.stringify(body)
    const bodyHash = await hash(text)
    // The same key for a retry of the same content, so a double tap or a retry creates one request (HH-INT-10).
    if (!attempt.current || attempt.current.bodyHash !== bodyHash)
      attempt.current = { key: crypto.randomUUID(), bodyHash }
    setSending(true)
    setBanner(null)
    try {
      const res = await fetch('/api/v1/public/requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': attempt.current.key },
        body: text,
      })
      const data = (await res.json().catch(() => null)) as {
        reference?: string
        error?: { code: string; message: string; fieldErrors: { field: string; code: string }[] }
      } | null
      if (res.status === 201 && data?.reference) {
        store?.clear()
        setReference(data.reference)
        setPhase('sent')
        focusHeading.current = true
        return
      }
      if (data?.error?.code === 'VALIDATION_FAILED' && data.error.fieldErrors.length) {
        const found = fromServer(data.error.fieldErrors)
        return show(found, stepOf(found[0]?.field ?? '') as StepId)
      }
      setBanner({ kind: 'error', message: data?.error?.message ?? t('error.INTERNAL') })
    } catch {
      // The outcome is unknown: the same key is kept, so trying again cannot create a second request.
      setBanner({ kind: 'error', message: t('request.uncertain') })
    } finally {
      setSending(false)
    }
  }

  if (phase === 'loading') return <StateView kind="loading" title={t('request.title')} />

  if (phase === 'sent')
    return (
      <section aria-labelledby="hh-receipt-title">
        <h2 id="hh-receipt-title" ref={headingRef} tabIndex={-1} className="hh-h2">
          {t('request.receipt.title')}
        </h2>
        <p>{t('request.receipt.thanks')}</p>
        <p className="hh-lead">{t('request.receipt.reference', { reference: reference ?? '' })}</p>
        <p>{t('request.receipt.separate')}</p>
        <a className="hh-button hh-button--secondary" href="/">
          {t('request.home')}
        </a>
      </section>
    )

  const choose = (
    <Dialog
      open={phase === 'choose'}
      title={t('request.continue.title')}
      onClose={() => setPhase('dismissed')}
      actions={
        <Button
          onClick={() => {
            setPhase('form')
            focusHeading.current = true
          }}
        >
          {t('request.continue.guest')}
        </Button>
      }
    >
      <p>{t('request.continue.guestText')}</p>
      <div className="hh-request__choice">
        <Button variant="secondary" disabledReason={t('request.continue.accountsUnavailable')}>
          {t('request.continue.account')}
        </Button>
        <p className="hh-small">{t('request.continue.accountText')}</p>
        <Button variant="quiet" disabledReason={t('request.continue.accountsUnavailable')}>
          {t('request.continue.signIn')}
        </Button>
      </div>
    </Dialog>
  )

  if (phase === 'draftFound')
    return (
      <section className="hh-card" aria-labelledby="hh-draft-title">
        <h2 id="hh-draft-title" className="hh-h3">
          {t('request.draft.found')}
        </h2>
        <div className="hh-request__actions">
          <Button
            onClick={() => {
              const draft = store?.load()
              if (draft) {
                setValues(draft.values)
                setStep(draft.step)
              }
              setPhase('form')
              focusHeading.current = true
            }}
          >
            {t('request.draft.resume')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              store?.clear()
              setValues(EMPTY_VALUES)
              setBanner({ kind: 'success', message: t('request.draft.cleared') })
              setPhase('choose')
            }}
          >
            {t('request.draft.clear')}
          </Button>
        </div>
      </section>
    )

  if (phase === 'choose' || phase === 'dismissed')
    return (
      <>
        {banner?.kind === 'success' ? <StateView kind="success" title={banner.message} /> : null}
        {choose}
        {phase === 'dismissed' ? (
          <div className="hh-request__actions">
            <Button onClick={() => setPhase('choose')}>{t('request.continue.reopen')}</Button>
            <a className="hh-button hh-button--quiet" href="/">
              {t('request.home')}
            </a>
          </div>
        ) : null}
      </>
    )

  const text = (field: string, key: keyof FormValues, label: CustomerKey, extra: Record<string, unknown> = {}) => (
    <Field
      label={t(label)}
      name={field}
      value={values[key] as string}
      onChange={(e) => set(key, e.currentTarget.value as never)}
      error={errorFor(field)}
      requiredText={t('request.required')}
      {...extra}
    />
  )

  const group = (field: string, legend: CustomerKey, children: ReactNode, hint?: string) => {
    const error = errorFor(field)
    return (
      <fieldset className="hh-request__group" data-field={field} aria-invalid={error ? true : undefined}>
        <legend className="hh-field__label">{t(legend)}</legend>
        {hint ? <p className="hh-field__hint">{hint}</p> : null}
        {children}
        {error ? <p className="hh-field__error">{error}</p> : null}
      </fieldset>
    )
  }

  const check = (name: string, label: string, checked: boolean, onChange: (c: boolean) => void) => (
    <label className="hh-request__option">
      <input type="checkbox" name={name} checked={checked} onChange={(e) => onChange(e.currentTarget.checked)} />
      <span>{label}</span>
    </label>
  )

  const radio = (name: string, value: string, label: string, current: string, onChange: (v: string) => void) => (
    <label className="hh-request__option">
      <input type="radio" name={name} value={value} checked={current === value} onChange={() => onChange(value)} />
      <span>{label}</span>
    </label>
  )

  const categories = [...new Set(services.map((s) => s.category))]
  const body: Record<StepId, ReactNode> = {
    services: (
      <>
        <p className="hh-muted">{t('request.services.note')}</p>
        {services.length
          ? group(
              'services',
              'request.services.select',
              <>
                <p aria-live="polite">
                  {t('request.services.count', { count: values.services.length, max: MAX_SERVICES })}
                </p>
                {categories.map((c) => (
                  <div key={c} className="hh-request__category">
                    <p className="hh-field__label">{label(CATEGORY_LABEL, c)}</p>
                    {services
                      .filter((s) => s.category === c)
                      .map((s) =>
                        check(`service-${s.id}`, s.name, values.services.includes(s.id), (on) =>
                          set('services', on ? [...values.services, s.id] : values.services.filter((x) => x !== s.id)),
                        ),
                      )}
                  </div>
                ))}
              </>,
            )
          : null}
        {check('notSure', t('request.services.notSure'), values.notSure, (on) => set('notSure', on))}
        {text('otherServicesText', 'otherServicesText', 'request.services.other', { multiline: true, rows: 3 })}
      </>
    ),
    job: <>{text('description', 'description', 'request.job.description', { multiline: true, rows: 6 })}</>,
    property: (
      <>
        {text('property.street', 'street', 'request.property.street', {
          required: true,
          autoComplete: 'address-line1',
        })}
        {text('property.unit', 'unit', 'request.property.unit', { autoComplete: 'address-line2' })}
        {text('property.city', 'city', 'request.property.city', { required: true, autoComplete: 'address-level2' })}
        {text('property.state', 'state', 'request.property.state', { required: true, autoComplete: 'address-level1' })}
        {text('property.zip', 'zip', 'request.property.zip', {
          required: true,
          autoComplete: 'postal-code',
          inputMode: 'numeric',
        })}
        {group(
          'property.propertyType',
          'request.property.type',
          PROPERTY_TYPES.map((p) =>
            radio('propertyType', p, t(PROPERTY_LABEL[p]), values.propertyType, (v) => set('propertyType', v)),
          ),
        )}
        <p className="hh-muted">{t('request.timing.note')}</p>
        {check('flexible', t('request.timing.flexible'), values.flexible, (on) => set('flexible', on))}
        {values.flexible
          ? null
          : text('timing.preferredDate', 'preferredDate', 'request.timing.date', { type: 'date', required: true })}
        {check('needHelpToday', t('request.timing.needHelpToday'), values.needHelpToday, (on) =>
          set('needHelpToday', on),
        )}
        {group(
          'timing.windows',
          'request.timing.windows',
          TIME_WINDOWS.map((w) =>
            check(`window-${w}`, t(WINDOW_LABEL[w]), values.windows.includes(w), (on) =>
              // "Any time" clears the others; another choice clears "Any time" (C02).
              set(
                'windows',
                on
                  ? w === 'any_time'
                    ? ['any_time']
                    : [...values.windows.filter((x) => x !== 'any_time'), w]
                  : values.windows.filter((x) => x !== w),
              ),
            ),
          ),
        )}
      </>
    ),
    contact: (
      <>
        {text('contact.fullName', 'fullName', 'request.contact.fullName', { required: true, autoComplete: 'name' })}
        {text('contact.email', 'email', 'request.contact.email', {
          required: true,
          type: 'email',
          autoComplete: 'email',
        })}
        {text('contact.phone', 'phone', 'request.contact.phone', { required: true, type: 'tel', autoComplete: 'tel' })}
        {group(
          'contact.preferredChannel',
          'request.contact.channel',
          CONTACT_CHANNELS.map((c) =>
            radio('preferredChannel', c, t(CHANNEL_LABEL[c]), values.preferredChannel, (v) =>
              set('preferredChannel', v),
            ),
          ),
        )}
        {group(
          'estimatePreference',
          'request.estimate.title',
          ESTIMATE_PREFERENCES.map((p) =>
            radio('estimatePreference', p, t(ESTIMATE_LABEL[p]), values.estimatePreference, (v) =>
              set('estimatePreference', v),
            ),
          ),
          t('request.estimate.note'),
        )}
      </>
    ),
    review: (
      <>
        {(['services', 'job', 'property', 'contact'] as const).map((s) => (
          <section key={s} className="hh-card hh-request__review" aria-labelledby={`hh-review-${s}`}>
            <h3 id={`hh-review-${s}`} className="hh-h3">
              {t(STEP_LABEL[s])}
            </h3>
            <dl>{reviewLines(s, values, services)}</dl>
            <Button variant="quiet" onClick={() => goTo(s)} aria-describedby={`hh-review-${s}`}>
              {t('request.edit')}
            </Button>
          </section>
        ))}
      </>
    ),
  }

  return (
    <form
      noValidate
      className="hh-request"
      aria-labelledby="hh-step-title"
      onSubmit={(e) => {
        e.preventDefault()
        if (step === 'review') void send()
        else next()
      }}
    >
      <ol className="hh-request__progress">
        {STEPS.map((s) => (
          <li key={s} aria-current={s === step ? 'step' : undefined}>
            {t(STEP_LABEL[s])}
          </li>
        ))}
      </ol>
      <h2 id="hh-step-title" ref={headingRef} tabIndex={-1} className="hh-h2">
        {t('request.progress', { current: index + 1, total: STEPS.length, name: t(STEP_LABEL[step]) })}
      </h2>
      <p className="hh-small hh-muted">
        {store?.enabled ? t('request.draft.note', { days: settings.draftDays ?? 0 }) : t('request.draft.off')}
      </p>
      {problems.length ? (
        <div
          ref={summaryRef}
          tabIndex={-1}
          className="hh-request__summary"
          role="alert"
          aria-labelledby="hh-summary-title"
        >
          <h3 id="hh-summary-title" className="hh-h3">
            {t('request.errorSummary.title')}
          </h3>
          <ul>
            {problems.map((p) => {
              const f = fieldOf(p.field)
              return (
                <li key={p.field}>
                  <a
                    href={`#${f}`}
                    onClick={(e) => {
                      e.preventDefault()
                      const el = document.querySelector<HTMLElement>(`[name="${f}"], [data-field="${f}"] input`)
                      el?.focus()
                    }}
                  >
                    {FIELD_LABEL[f] ? t(FIELD_LABEL[f]) : f}: {t(problemKey(p.code))}
                  </a>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
      {banner?.kind === 'error' ? (
        <StateView
          kind="error"
          title={banner.message}
          action={<Button onClick={() => void send()}>{t('request.retry')}</Button>}
        />
      ) : null}
      {body[step]}
      {/* Quiet spam control (HH-INT-11): people never see or reach this field. */}
      <div className="hh-visually-hidden" aria-hidden="true">
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.currentTarget.value)}
        />
      </div>
      <div className="hh-request__actions">
        {index > 0 ? (
          <Button variant="secondary" onClick={() => goTo(STEPS[index - 1] ?? 'services')}>
            {t('request.back')}
          </Button>
        ) : null}
        {step === 'review' ? (
          <Button type="submit" pending={sending}>
            {t('request.send')}
          </Button>
        ) : (
          <Button type="submit">{t('request.next')}</Button>
        )}
      </div>
    </form>
  )
}

function reviewLines(step: StepId, v: FormValues, services: WizardService[]): ReactNode {
  const line = (label: CustomerKey, value: string) =>
    value ? (
      <div key={label}>
        <dt>{t(label)}</dt>
        <dd>{value}</dd>
      </div>
    ) : null
  switch (step) {
    case 'services':
      return [
        line(
          'request.services.select',
          v.services.map((id) => services.find((s) => s.id === id)?.name ?? id).join(', '),
        ),
        v.notSure ? line('request.services.notSure', '✓') : null,
        line('request.services.other', v.otherServicesText),
      ]
    case 'job':
      return [line('request.job.description', v.description)]
    case 'property':
      return [
        line('request.property.street', [v.street, v.unit].filter(Boolean).join(', ')),
        line('request.property.city', [v.city, v.state, v.zip].filter(Boolean).join(' ')),
        line('request.property.type', label(PROPERTY_LABEL, v.propertyType)),
        line('request.timing.date', v.flexible ? t('request.timing.flexible') : v.preferredDate),
        v.needHelpToday ? line('request.timing.needHelpToday', '✓') : null,
        line('request.timing.windows', v.windows.map((w) => label(WINDOW_LABEL, w)).join(', ')),
      ]
    default:
      return [
        line('request.contact.fullName', v.fullName),
        line('request.contact.email', v.email),
        line('request.contact.phone', v.phone),
        line('request.contact.channel', label(CHANNEL_LABEL, v.preferredChannel)),
        line('request.estimate.title', label(ESTIMATE_LABEL, v.estimatePreference)),
      ]
  }
}
