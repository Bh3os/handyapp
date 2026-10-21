// The request wizard shell (TSK-0026; HH-INT-01, HH-INT-08, HH-INT-09, C02, OWN-DEC-87, OWN-DEC-93). A React island on
// /request: the "How would you like to continue?" choice, five steps with progress, client validation with the
// server's own schema, an accessible error summary that receives focus, server field errors shown beside their
// fields without losing input, and the browser draft with Resume and Clear Draft. Every label comes from the
// customer catalog (English only, RULE-LANGUAGES). The step contents are deliberately plain; TSK-0027..0030 refine
// each step (category cards, service questions, photos, SMS opt-in and consent, the final review).
import { customerTranslator, type CustomerKey } from '@handyhub/i18n'
import { Button, Dialog, Field, StateView } from '@handyhub/ui'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { checkZip, takeRememberedZip, type CoverageCheck } from '../coverage/coverage.js'
import { zip5 } from '@handyhub/domain/coverage'
import { PRIVACY_NOTICE } from '@handyhub/domain/legal'
import { DraftStore } from './draft.js'
import { PhotoUploader, usePhotos, type PhotoLimits } from './photos.js'
import {
  CONTACT_CHANNELS,
  EMPTY_VALUES,
  ESTIMATE_PREFERENCES,
  answerKey,
  firstPreferredDate,
  formatClock,
  fromServer,
  MAX_SERVICES,
  offeredWindows,
  questionPlan,
  problemKey,
  PROPERTY_TYPES,
  STEPS,
  stepOf,
  TIME_WINDOWS,
  toBody,
  validate,
  type FormMeta,
  type FormService,
  type FormValues,
  type OfferedWindow,
  type Problem,
  type StepId,
  type VisitHours,
} from './form.js'

const t = (key: CustomerKey, values?: Record<string, string | number>) => customerTranslator().t(key, values)

// Every label by code, written out so the catalog check sees each key (RULE-LANGUAGES).
/** The four categories in the owner's order, each with its card text (HH-INT-15, OWN-DEC-90). */
const CATEGORIES = ['home_improvement', 'drywall', 'painting', 'cleaning'] as const
const CATEGORY_TEXT: Record<(typeof CATEGORIES)[number], CustomerKey> = {
  home_improvement: 'request.categoryText.home_improvement',
  drywall: 'request.categoryText.drywall',
  painting: 'request.categoryText.painting',
  cleaning: 'request.categoryText.cleaning',
}
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

/** PROPOSED: the form version. */
const FORM_VERSION = 'wizard-1'
/** The privacy policy version this page presents, saved with the request (TSK-0024; HH-PRIV-04, OWN-DEC-72). */
const PRIVACY_NOTICE_VERSION = PRIVACY_NOTICE.documentId
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
  answers: 'request.step.job',
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
type Settings = {
  draftDays: number | null
  timeZone: string | null
  photos: PhotoLimits | null
  /** The configured visit hours (FACT-HOURS) and the windows offered with any configured hours (HH-INT-02). */
  visitHours: VisitHours | null
  windows: OfferedWindow[]
  /** The free-estimate wording shows only while the configured policy is free (FACT-VISIT-FEE, HH-INT-03). */
  freeEstimates: boolean
}
/** Until the settings arrive, or if they cannot be read: the five windows without hours, and no free-estimate claim. */
const NO_SETTINGS: Settings = {
  draftDays: null,
  timeZone: null,
  photos: null,
  visitHours: null,
  windows: offeredWindows(null, null),
  freeEstimates: false,
}
/** Day windows that, with Weekends, are explained as weekend times (HH-INT-02). */
const DAY_WINDOW_CODES: readonly string[] = ['mornings', 'afternoons', 'evenings']
type PhotoSummary = { received: number; processing: number; failed: number }
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

export default function RequestWizard() {
  const [services, setServices] = useState<FormService[]>([])
  const [openCategory, setOpenCategory] = useState<string>(CATEGORIES[0])
  const [limitHit, setLimitHit] = useState(false)
  const [phase, setPhase] = useState<Phase>('loading')
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES)
  const [step, setStep] = useState<StepId>('services')
  const [problems, setProblems] = useState<Problem[]>([])
  const [banner, setBanner] = useState<Banner>(null)
  const [settings, setSettings] = useState<Settings>(NO_SETTINGS)
  const [receiptPhotos, setReceiptPhotos] = useState<PhotoSummary | null>(null)
  const photos = usePhotos(settings.photos)
  const [sending, setSending] = useState(false)
  const [reference, setReference] = useState<string | null>(null)
  const [website, setWebsite] = useState('')
  // The ZIP checked before arriving (HH-INT-16) and the coverage of the ZIP in the form, rechecked as it changes.
  const checkedZip = useRef<string | null>(null)
  const [coverage, setCoverage] = useState<CoverageCheck | null>(null)
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
  // Settings (the configured draft period) and the services on offer, then any saved draft.
  useEffect(() => {
    let live = true
    const json = <T,>(url: string, fallback: T) =>
      fetch(url, { headers: { accept: 'application/json' } })
        .then(async (r) => (r.ok ? ((await r.json()) as T) : fallback))
        .catch(() => fallback)
    void Promise.all([
      json<Settings>('/api/v1/public/request-form', NO_SETTINGS),
      json<{ services: FormService[] }>('/api/v1/public/services', { services: [] }),
    ]).then(([s, offered]) => {
      if (!live) return
      setSettings({ ...NO_SETTINGS, ...s })
      setServices(offered.services)
      checkedZip.current = takeRememberedZip()
      const remembered = checkedZip.current
      if (remembered) setValues((v) => ({ ...v, zip: remembered }))
      const draft = new DraftStore(browserStorage(), IDENTITY, s.draftDays).load()
      // Arriving from a service page: that service's category opens with the service selected (HH-INT-15, T05). The
      // link names the immutable service ID; its code (DW-01) is accepted too. From "Not sure what service I need"
      // (TSK-0021, HH-CUS-01) that option is chosen and no service is guessed.
      const wanted = new URLSearchParams(window.location.search).get('service')
      const preselect = offered.services.find((x) => x.id === wanted || x.id === `SVC-${wanted ?? ''}`)
      if (preselect) {
        setValues((v) => ({ ...v, services: [preselect.id] }))
        setOpenCategory(preselect.category)
      } else if (wanted === 'not-sure') setValues((v) => ({ ...v, notSure: true }))
      setPhase(draft ? 'draftFound' : 'choose')
    })
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (phase !== 'form' || !store) return
    // Nothing entered yet: nothing to keep.
    if (step === 'services' && JSON.stringify(values) === JSON.stringify(EMPTY_VALUES)) store.clear()
    else store.save(values, step)
  }, [phase, store, values, step])

  // Correcting the ZIP rechecks coverage without touching any other answer (HH-INT-16); it never blocks the form.
  useEffect(() => {
    const zip = zip5(values.zip)
    if (phase !== 'form' || step !== 'property' || !zip) {
      setCoverage(null)
      return
    }
    let live = true
    const timer = setTimeout(() => {
      void checkZip(zip).then((r) => {
        if (live) setCoverage(r)
      })
    }, 300)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [phase, step, values.zip])

  // A window no longer offered (its configured hours changed) is dropped from a resumed draft (HH-INT-02).
  useEffect(() => {
    const offered = settings.windows.map((w) => w.code as string)
    setValues((v) =>
      v.windows.every((w) => offered.includes(w)) ? v : { ...v, windows: v.windows.filter((w) => offered.includes(w)) },
    )
  }, [phase, settings.windows])

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
    services,
    windows: settings.windows.map((w) => w.code),
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
    // The server binds the draft's stored photos to the request; failed photos were never stored (TSK-0031).
    const stored = photos.items.some((i) => i.id)
    const body = {
      ...toBody(values, meta, services),
      ...(stored && photos.capability ? { photoDraft: photos.capability } : {}),
    }
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
        photos?: PhotoSummary
        error?: { code: string; message: string; fieldErrors: { field: string; code: string }[] }
      } | null
      if (res.status === 201 && data?.reference) {
        store?.clear()
        setReference(data.reference)
        // Photos that failed here were never stored; the receipt counts them with any the server refused.
        const failedHere = photos.items.filter((i) => i.state === 'failed').length
        setReceiptPhotos(data.photos ? { ...data.photos, failed: data.photos.failed + failedHere } : null)
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
        {receiptPhotos ? <p>{t('request.receipt.photos', receiptPhotos)}</p> : null}
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
                const remembered = checkedZip.current
                setValues(remembered && !draft.values.zip ? { ...draft.values, zip: remembered } : draft.values)
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

  const nameOf = (id: string) => services.find((x) => x.id === id)?.name ?? id
  const toggle = (id: string, on: boolean) => {
    if (!on) {
      setLimitHit(false)
      return set(
        'services',
        values.services.filter((x) => x !== id),
      )
    }
    if (values.services.includes(id)) return
    // A sixth service is refused; more work goes in the free-text field (HH-INT-15, OWN-DEC-90).
    if (values.services.length >= MAX_SERVICES) return setLimitHit(true)
    set('services', [...values.services, id])
  }
  const answer = (serviceId: string | undefined, q: { key: string; label: string }) => {
    const k = answerKey(serviceId, q.key)
    const a = values.answers[k] ?? { text: '', unknown: false }
    const put = (next: { text: string; unknown: boolean }) => set('answers', { ...values.answers, [k]: next })
    return (
      <div key={k} className="hh-request__question">
        <Field
          label={q.label}
          name={`answer:${k}`}
          value={a.text}
          disabled={a.unknown}
          onChange={(e) => put({ text: e.currentTarget.value, unknown: false })}
        />
        {check(`unknown:${k}`, t('request.questions.unknown'), a.unknown, (on) => put({ text: a.text, unknown: on }))}
      </div>
    )
  }
  const plan = questionPlan(values.services.flatMap((id) => services.filter((x) => x.id === id)))
  const savedPhotos = photos.items.filter((i) => i.state === 'complete' || i.state === 'processing').length
  const failedPhotos = photos.items.filter((i) => i.state === 'failed').length
  const body: Record<StepId, ReactNode> = {
    services: (
      <>
        <p className="hh-muted">{t('request.services.note')}</p>
        <section aria-labelledby="hh-categories-title" className="hh-request__categories">
          <h3 id="hh-categories-title" className="hh-h3">
            {t('request.services.choose')}
          </h3>
          <div className="hh-request__cards">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className="hh-card hh-request__card"
                aria-pressed={openCategory === c}
                onClick={() => setOpenCategory(c)}
              >
                <span className="hh-request__card-title">{t(CATEGORY_LABEL[c] as CustomerKey)}</span>
                <span className="hh-small">{t(CATEGORY_TEXT[c])}</span>
              </button>
            ))}
          </div>
        </section>
        {group(
          'services',
          'request.services.select',
          <>
            {services
              .filter((x) => x.category === openCategory)
              .map((x) => check(`service-${x.id}`, x.name, values.services.includes(x.id), (on) => toggle(x.id, on)))}
          </>,
        )}
        <section aria-labelledby="hh-selected-title" className="hh-request__selected">
          <p id="hh-selected-title" className="hh-field__label" aria-live="polite">
            {t('request.services.count', { count: values.services.length, max: MAX_SERVICES })}
          </p>
          {values.services.length ? (
            <ul>
              {values.services.map((id) => (
                <li key={id}>
                  <span>{nameOf(id)}</span>{' '}
                  <Button
                    variant="quiet"
                    onClick={() => toggle(id, false)}
                    aria-label={t('request.services.removeNamed', { name: nameOf(id) })}
                  >
                    {t('request.services.remove')}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {limitHit ? (
            <p role="status" className="hh-field__hint">
              {t('request.services.limit', { max: MAX_SERVICES })}
            </p>
          ) : null}
        </section>
        {check('notSure', t('request.services.notSure'), values.notSure, (on) => set('notSure', on))}
        {text('otherServicesText', 'otherServicesText', 'request.services.other', { multiline: true, rows: 3 })}
      </>
    ),
    job: (
      <>
        {text('description', 'description', 'request.job.description', { multiline: true, rows: 6, required: true })}
        {plan.shared.length ? (
          <section aria-labelledby="hh-q-shared" className="hh-request__questions">
            <h3 id="hh-q-shared" className="hh-h3">
              {t('request.questions.shared')}
            </h3>
            {plan.shared.map((q) => answer(undefined, q))}
          </section>
        ) : null}
        {plan.perService.map((g) => (
          <section key={g.serviceId} aria-labelledby={`hh-q-${g.serviceId}`} className="hh-request__questions">
            <h3 id={`hh-q-${g.serviceId}`} className="hh-h3">
              {nameOf(g.serviceId)}
            </h3>
            {g.questions.map((q) => answer(g.serviceId, q))}
            <Field
              label={t('request.questions.notes', { service: nameOf(g.serviceId) })}
              name={`notes:${g.serviceId}`}
              multiline
              rows={2}
              value={values.notes[g.serviceId] ?? ''}
              onChange={(e) => set('notes', { ...values.notes, [g.serviceId]: e.currentTarget.value })}
            />
          </section>
        ))}
        <PhotoUploader photos={photos} limits={settings.photos} />
      </>
    ),
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
        <p className="hh-muted hh-request__coverage" role="status" aria-live="polite">
          {coverage?.kind === 'outcome' ? coverage.message : coverage?.kind === 'failed' ? t('coverage.failed') : null}
        </p>
        {group(
          'property.propertyType',
          'request.property.type',
          PROPERTY_TYPES.map((p) =>
            radio('propertyType', p, t(PROPERTY_LABEL[p]), values.propertyType, (v) => set('propertyType', v)),
          ),
        )}
        {/* Preferences only, never a slot or an appointment (HH-INT-02, HH-INT-17, OWN-DEC-92). */}
        <p className="hh-muted">{t('request.timing.note')}</p>
        {settings.visitHours ? (
          <p className="hh-small hh-muted">
            {t('request.timing.visitHours', {
              open: formatClock(settings.visitHours.open),
              close: formatClock(settings.visitHours.close),
            })}
          </p>
        ) : null}
        {check('flexible', t('request.timing.flexible'), values.flexible, (on) => set('flexible', on))}
        {values.flexible
          ? null
          : text('timing.preferredDate', 'preferredDate', 'request.timing.date', {
              type: 'date',
              required: true,
              // Standard dates start tomorrow in the property's local time (OWN-DEC-92, FACT-TIMEZONE).
              min: firstPreferredDate(opts.now, opts.zone),
              hint: t('request.timing.dateHint'),
            })}
        <div className="hh-request__question">
          <label className="hh-request__option">
            <input
              type="checkbox"
              name="needHelpToday"
              aria-describedby="hh-help-today-note"
              checked={values.needHelpToday}
              onChange={(e) => set('needHelpToday', e.currentTarget.checked)}
            />
            <span>{t('request.timing.needHelpToday')}</span>
          </label>
          <p id="hh-help-today-note" className="hh-field__hint">
            {t('request.timing.needHelpTodayNote')}
          </p>
        </div>
        {group(
          'timing.windows',
          'request.timing.windows',
          settings.windows.map(({ code: w, start, end }) =>
            check(
              `window-${w}`,
              start && end
                ? t('request.timing.windowHours', {
                    window: t(WINDOW_LABEL[w]),
                    start: formatClock(start),
                    end: formatClock(end),
                  })
                : t(WINDOW_LABEL[w]),
              values.windows.includes(w),
              (on) =>
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
        {values.windows.includes('weekends') && values.windows.some((w) => DAY_WINDOW_CODES.includes(w)) ? (
          <p className="hh-field__hint" role="status">
            {t('request.timing.weekendsCombined')}
          </p>
        ) : null}
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
        {settings.freeEstimates ? <p className="hh-muted">{t('request.estimate.free')}</p> : null}
      </>
    ),
    review: (
      <>
        {failedPhotos ? (
          <p className="hh-request__warning" role="status">
            {t('request.photos.failedNotice', { count: failedPhotos })}
          </p>
        ) : null}
        {(['services', 'job', 'property', 'contact'] as const).map((s) => (
          <section key={s} className="hh-card hh-request__review" aria-labelledby={`hh-review-${s}`}>
            <h3 id={`hh-review-${s}`} className="hh-h3">
              {t(STEP_LABEL[s])}
            </h3>
            <dl>{reviewLines(s, values, services, savedPhotos)}</dl>
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

function reviewLines(step: StepId, v: FormValues, services: FormService[], savedPhotos: number): ReactNode {
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
    case 'job': {
      const plan = questionPlan(v.services.flatMap((id) => services.filter((s) => s.id === id)))
      const rows = [
        ...plan.shared.map((q) => ({ id: undefined as string | undefined, q })),
        ...plan.perService.flatMap((g) => g.questions.map((q) => ({ id: g.serviceId as string | undefined, q }))),
      ]
      return [
        line('request.job.description', v.description),
        ...rows.map(({ id, q }) => {
          const a = v.answers[answerKey(id, q.key)]
          const value = a?.unknown ? t('request.questions.unknown') : (a?.text ?? '')
          return value ? (
            <div key={answerKey(id, q.key)}>
              <dt>{q.label}</dt>
              <dd>{value}</dd>
            </div>
          ) : null
        }),
        savedPhotos ? line('request.photos.title', t('request.photos.saved', { count: savedPhotos })) : null,
      ]
    }
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
